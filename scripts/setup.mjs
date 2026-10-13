import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase, transaction } from '../lib/database.mjs';
import { hashPassword } from '../lib/auth.mjs';
import { loadEnvironment } from '../lib/config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvironment(root);
if (Number(process.versions.node.split('.')[0]) !== 24) { console.error('Bitte zuerst Node.js 24 LTS installieren: https://nodejs.org/'); process.exit(1); }
const db = openDatabase(resolve(root, process.env.DATA_DIR || 'data'));
const recovery = process.argv.includes('--reset');
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
async function question(prompt, hidden = false) {
  process.stdout.write(prompt);
  muted = hidden;
  try { return await rl.question(''); }
  finally { muted = false; if (hidden) process.stdout.write('\n'); }
}
try {
  console.log('\nSTERNARCHIV · Einrichtung\n');
  const existing = db.prepare("SELECT * FROM users WHERE role='gm' LIMIT 1").get();
  if (existing && !recovery) {
    console.log('Die Anwendung ist bereits eingerichtet. Mit Start.cmd starten.\nEin vergessenes Spielleiterpasswort kannst du mit Spielleiter-Passwort.cmd zurücksetzen.');
  } else {
    if (recovery && !existing) throw new Error('Noch kein Spielleiter vorhanden. Bitte Einrichtung.cmd verwenden.');
    if (existing) {
      const confirm = await question(`Passwort von "${existing.username}" zurücksetzen? Gib JA ein: `);
      if (confirm !== 'JA') throw new Error('Abgebrochen. Es wurde nichts geändert.');
    }
    const username = existing?.username ?? (await question('Benutzername der Spielleitung: ')).trim();
    if (!username || username.length > 80) throw new Error('Bitte einen Benutzernamen mit 1 bis 80 Zeichen eingeben.');
    console.log('Wähle ein Passwort mit mindestens 12 Zeichen. Die Eingabe bleibt unsichtbar.');
    const password = await question('Passwort: ', true);
    const confirmation = await question('Passwort wiederholen: ', true);
    if (password !== confirmation) throw new Error('Die Passwörter stimmen nicht überein. Einrichtung bitte erneut starten.');
    const hashed = hashPassword(password);
    transaction(db, () => {
      if (existing) {
        db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, existing.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
      } else {
        if (db.prepare('SELECT id FROM users LIMIT 1').get()) throw new Error('Es besteht bereits ein Zugang. Einrichtung abgebrochen.');
        db.prepare("INSERT INTO users VALUES (?,?,?,'gm',NULL)").run(randomUUID(), username, hashed);
      }
    });
    console.log('\nFertig! Starte jetzt Start.cmd und öffne http://localhost:3000 im Browser.');
  }
} catch (error) { console.error(`\n${error.message}`); process.exitCode = 1; }
finally { rl.close(); db.close(); }
