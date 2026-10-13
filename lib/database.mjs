import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate } from './migrations.mjs';

export const RESOURCE_NAMES = { energy: 'Energie', minerals: 'Mineralien', alloys: 'Legierungen', food: 'Nahrung / Versorgung', influence: 'Einfluss' };
export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  mkdirSync(resolve(directory, 'images'), { recursive: true });
  const db = new DatabaseSync(resolve(directory, 'sternarchiv.sqlite'));
  const existed = !!db.prepare("SELECT name FROM sqlite_master WHERE name='meta'").get();
  if (db.prepare('PRAGMA user_version').get().user_version > 2) { db.close(); throw new Error('Diese Datenbank benötigt eine neuere Sternarchiv-Version.'); }
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, round INTEGER NOT NULL);
    INSERT OR IGNORE INTO meta VALUES (1,0,0);
    CREATE TABLE IF NOT EXISTS empires (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, species TEXT NOT NULL, description TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK(visibility IN ('public','empire','secret')),
      economy_visibility TEXT NOT NULL CHECK(economy_visibility IN ('public','empire','secret')),
      research_visibility TEXT NOT NULL CHECK(research_visibility IN ('public','empire','secret')),
      image TEXT, research_power INTEGER NOT NULL DEFAULT 0, project_name TEXT NOT NULL DEFAULT '',
      project_description TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0, required INTEGER NOT NULL DEFAULT 100);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('gm','player')), empire_id TEXT REFERENCES empires(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS resources (empire_id TEXT NOT NULL REFERENCES empires(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0, income INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(empire_id,kind));
    CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('planet','fleet','report')),
      empire_id TEXT REFERENCES empires(id) ON DELETE SET NULL, name TEXT NOT NULL, description TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK(visibility IN ('public','empire','secret')), image TEXT, details TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL,
      empire_id TEXT, action TEXT NOT NULL, details TEXT NOT NULL, reason TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS previews (token TEXT PRIMARY KEY, revision INTEGER NOT NULL, round INTEGER NOT NULL,
      snapshot TEXT NOT NULL, expires INTEGER NOT NULL, committed INTEGER NOT NULL DEFAULT 0);
    `);
  migrate(db, directory, existed);
  return db;
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function bump(db) { db.exec('UPDATE meta SET revision=revision+1 WHERE id=1'); }
export function audit(db, user, empireId, action, details, reason = '') {
  db.prepare('INSERT INTO audit(at,actor,empire_id,action,details,reason) VALUES (?,?,?,?,?,?)')
    .run(new Date().toISOString(), user.username, empireId, action, JSON.stringify(details), reason);
}
