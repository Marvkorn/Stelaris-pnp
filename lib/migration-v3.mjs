import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function migrateV3(db, directory, existed) {
  if (db.prepare('PRAGMA user_version').get().user_version >= 3) return;
  if (existed) {
    const folder = resolve(directory, 'migration-backups');
    mkdirSync(folder, { recursive: true });
    db.prepare('VACUUM INTO ?').run(resolve(folder, `before-v3-${randomUUID()}.sqlite`));
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE resource_types(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', symbol TEXT NOT NULL DEFAULT '', archived INTEGER NOT NULL DEFAULT 0);
      INSERT INTO resource_types(id,name) VALUES ('energy','Energie'),('minerals','Mineralien'),('alloys','Legierungen'),('food','Nahrung / Versorgung'),('influence','Einfluss');
      CREATE TABLE building_templates(id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, production TEXT NOT NULL, upkeep TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration>=0), image TEXT);
      CREATE TABLE buildings(id TEXT PRIMARY KEY, planet_id TEXT NOT NULL REFERENCES records(id) ON DELETE RESTRICT, template_id TEXT REFERENCES building_templates(id), name TEXT NOT NULL, production TEXT NOT NULL, upkeep TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('construction','active','inactive','demolished')), start_round INTEGER NOT NULL, finish_round INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE archive_entries(id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('discovery','map')), title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL DEFAULT '', round INTEGER NOT NULL,
        visibility TEXT NOT NULL CHECK(visibility IN ('secret','public','empire')), visibility_realms TEXT NOT NULL DEFAULT '[]', link_kind TEXT, link_id TEXT);
      CREATE TABLE archive_images(id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE CASCADE, filename TEXT NOT NULL, position INTEGER NOT NULL);
      CREATE TABLE empire_contacts(source_id TEXT NOT NULL REFERENCES empires(id), target_id TEXT NOT NULL REFERENCES empires(id), PRIMARY KEY(source_id,target_id));
      CREATE TABLE lawbooks(empire_id TEXT PRIMARY KEY REFERENCES empires(id), published INTEGER NOT NULL DEFAULT 0, next_number INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE laws(id TEXT PRIMARY KEY, empire_id TEXT NOT NULL REFERENCES empires(id), kind TEXT NOT NULL CHECK(kind IN ('law','constitution')), number INTEGER, title TEXT NOT NULL, content TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('valid','repealed')), version INTEGER NOT NULL, round INTEGER NOT NULL, at TEXT NOT NULL, UNIQUE(empire_id,number));
      CREATE UNIQUE INDEX one_constitution ON laws(empire_id) WHERE kind='constitution';
      CREATE TABLE law_versions(law_id TEXT NOT NULL REFERENCES laws(id), version INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, round INTEGER NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(law_id,version));
      CREATE TABLE law_proposals(id TEXT PRIMARY KEY, empire_id TEXT NOT NULL REFERENCES empires(id), user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('law','constitution')), law_id TEXT REFERENCES laws(id), base_version INTEGER,
        title TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','submitted','revision','rejected','approved')), comment TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, published_law_id TEXT REFERENCES laws(id));
      CREATE TABLE law_notices(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), proposal_id TEXT NOT NULL REFERENCES law_proposals(id), message TEXT NOT NULL, at TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0);
      UPDATE meta SET revision=revision+1;
      PRAGMA user_version=3;
    `);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
