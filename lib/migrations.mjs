import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function migrate(db, directory, existed) {
  if (db.prepare('PRAGMA user_version').get().user_version >= 2) return;
  // VACUUM INTO includes committed WAL contents, unlike copying the main file.
  if (existed) {
    const folder = resolve(directory, 'migration-backups');
    mkdirSync(folder, { recursive: true });
    db.prepare('VACUUM INTO ?').run(resolve(folder, `before-v2-${randomUUID()}.sqlite`));
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      ALTER TABLE empires ADD COLUMN visibility_realms TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE empires ADD COLUMN economy_realms TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE empires ADD COLUMN research_realms TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE empires ADD COLUMN gm_notes TEXT NOT NULL DEFAULT '';
      ALTER TABLE records ADD COLUMN visibility_realms TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE records ADD COLUMN gm_notes TEXT NOT NULL DEFAULT '';
      ALTER TABLE records ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published'));
      ALTER TABLE records ADD COLUMN popup INTEGER NOT NULL DEFAULT 0 CHECK(popup IN (0,1));
      ALTER TABLE records ADD COLUMN published_at TEXT;
      UPDATE empires SET visibility_realms=CASE WHEN visibility='empire' THEN json_array(id) ELSE '[]' END,
        economy_realms=CASE WHEN economy_visibility='empire' THEN json_array(id) ELSE '[]' END,
        research_realms=CASE WHEN research_visibility='empire' THEN json_array(id) ELSE '[]' END;
      UPDATE records SET visibility_realms=CASE WHEN visibility='empire' AND empire_id IS NOT NULL THEN json_array(empire_id) ELSE '[]' END;
      CREATE TABLE record_images(id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        filename TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE TABLE announcements(id TEXT PRIMARY KEY, record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        at TEXT NOT NULL, actor TEXT NOT NULL);
      CREATE INDEX announcements_record ON announcements(record_id,at);
      CREATE TABLE acknowledgements(announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, at TEXT NOT NULL, PRIMARY KEY(announcement_id,user_id));
      CREATE TABLE actions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), username TEXT NOT NULL,
        empire_id TEXT REFERENCES empires(id) ON DELETE SET NULL, empire_name TEXT, subject TEXT NOT NULL, description TEXT NOT NULL,
        at TEXT NOT NULL, round INTEGER NOT NULL, gm_read_at TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','working','done')));
      CREATE INDEX actions_user ON actions(user_id,at);
      CREATE TABLE action_replies(id TEXT PRIMARY KEY, action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
        actor TEXT NOT NULL, description TEXT NOT NULL, at TEXT NOT NULL, confirmed_at TEXT);
      CREATE TABLE login_attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      UPDATE meta SET revision=revision+1;
      DELETE FROM sessions;
      PRAGMA user_version=2;
    `);
    for (const r of db.prepare("SELECT id,image FROM records WHERE kind='report' AND image IS NOT NULL").all()) {
      db.prepare('INSERT INTO record_images VALUES (?,?,?,0)').run(randomUUID(), r.id, r.image);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
