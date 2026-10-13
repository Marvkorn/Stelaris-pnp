import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, cpSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadEnvironment } from '../lib/config.mjs';

export async function createBackup(dataDir, backupRoot) {
  if (!existsSync(resolve(dataDir, 'sternarchiv.sqlite'))) throw new Error('Noch keine Datenbank vorhanden. Bitte zuerst einrichten.');
  const destination = resolve(backupRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0,8)}`);
  mkdirSync(destination, { recursive: true });
  // Backing up must never migrate or change the source installation.
  const db = new DatabaseSync(resolve(dataDir,'sternarchiv.sqlite'), {readOnly:true});
  try {
    await backup(db, resolve(destination, 'sternarchiv.sqlite'));
    cpSync(resolve(dataDir, 'images'), resolve(destination, 'images'), { recursive: true });
    writeFileSync(resolve(destination, 'HINWEIS.txt'), 'Sternarchiv-Sicherung. Enthält Datenbank und Bilder sowie Passwort-Hashes. Privat aufbewahren. Wiederherstellung siehe README.md.\n');
    return destination;
  } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  loadEnvironment(root);
  try { console.log(`Sicherung erstellt:\n${await createBackup(resolve(root, process.env.DATA_DIR || 'data'), resolve(root, process.env.BACKUP_DIR || 'backups'))}\nDiesen Ordner am besten zusätzlich auf einen USB-Stick kopieren.`); }
  catch (error) { console.error('Sicherung fehlgeschlagen: ' + error.message); process.exitCode = 1; }
}
