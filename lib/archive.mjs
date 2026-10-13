import { randomUUID } from 'node:crypto';
import { canRead, canReadRecord } from './auth.mjs';
import { audit } from './database.mjs';
import { HttpError, integer, text, mutate, requireEmpire } from './game.mjs';
import { requireGM } from './economy.mjs';
import { validateImage, storeImage } from './images.mjs';

export const discoveryCategories = ['Spezielle Ressourcen entdeckt','Rassen entdeckt','Planeten entdeckt','Erforschte Dinge','Sonstiges'];
export function archiveView(db, user, row) {
  if (!row || !canRead(user, row.visibility, row.visibility_realms)) throw new HttpError(404, 'Eintrag nicht gefunden.');
  const result = { ...row, images: db.prepare('SELECT id FROM archive_images WHERE entry_id=? ORDER BY position').all(row.id).map(i => ({ id: i.id, url: `/api/archive-images/${i.id}` })) };
  if (user.role === 'gm') result.visibility_realms = JSON.parse(row.visibility_realms);
  else {
    delete result.visibility_realms;
    // A discovery does not grant access to the linked record or its private fields.
    let visible = false;
    if (row.link_kind === 'planet') visible = canReadRecord(user, db.prepare("SELECT * FROM records WHERE id=? AND kind='planet'").get(row.link_id));
    if (row.link_kind === 'species' || row.link_kind === 'technology') {
      const empire = db.prepare('SELECT * FROM empires WHERE id=?').get(row.link_id);
      visible = empire && canRead(user, empire.visibility, empire.visibility_realms) && (row.link_kind !== 'technology' || canRead(user, empire.research_visibility, empire.research_realms));
    }
    if (row.link_kind === 'resource') visible = db.prepare('SELECT 1 FROM resources WHERE empire_id=? AND kind=?').get(user.empire_id ?? '', row.link_id);
    if (!visible) { result.link_kind = null; result.link_id = null; }
  }
  return result;
}
export function archiveState(db, user) {
  return db.prepare('SELECT * FROM archive_entries ORDER BY title').all().filter(r => canRead(user, r.visibility, r.visibility_realms)).map(r => archiveView(db, user, r));
}
export function saveArchive(db, user, body, id, dataDir) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    const old = id && db.prepare('SELECT * FROM archive_entries WHERE id=?').get(id);
    if (id && !old) throw new HttpError(404, 'Eintrag nicht gefunden.');
    if (!['map','discovery'].includes(body.kind) || (old && body.kind !== old.kind)) throw new HttpError(400, 'Ungültiger Eintragstyp.');
    if (!['secret','public','empire'].includes(body.visibility)) throw new HttpError(400, 'Ungültige Sichtbarkeit.');
    if (!Array.isArray(body.visibility_realms) || body.visibility_realms.length > 1000) throw new HttpError(400, 'Ungültige Reichsauswahl.');
    const realms = JSON.stringify([...new Set(body.visibility_realms)].map(r => requireEmpire(db, r)));
    if (body.kind === 'discovery' && !discoveryCategories.includes(body.category)) throw new HttpError(400, 'Ungültige Kategorie.');
    let linkKind = body.link_kind || null, linkId = body.link_id || null;
    if (linkKind || linkId) {
      const queries = { planet: "SELECT id FROM records WHERE id=? AND kind='planet'", resource: 'SELECT id FROM resource_types WHERE id=?', species: 'SELECT id FROM empires WHERE id=?', technology: 'SELECT id FROM empires WHERE id=?' };
      if (!queries[linkKind] || !linkId || !db.prepare(queries[linkKind]).get(linkId)) throw new HttpError(400, 'Ungültige Verknüpfung.');
    }
    id ||= randomUUID();
    db.prepare('INSERT INTO archive_entries VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,round=excluded.round,visibility=excluded.visibility,visibility_realms=excluded.visibility_realms,link_kind=excluded.link_kind,link_id=excluded.link_id')
      .run(id, body.kind, text(body.title, 'Titel', 200, true), text(body.description ?? '', 'Beschreibung'), body.kind === 'discovery' ? body.category : '', integer(body.round, 'Entdeckungsrunde', 0), body.visibility, realms, linkKind, linkId);
    if (!Array.isArray(body.images) || body.images.length > (body.kind === 'map' ? 1 : 5) || (body.kind === 'map' && body.images.length !== 1)) throw new HttpError(400, 'Karten benötigen genau ein Bild; Entdeckungen erlauben bis zu fünf Bilder.');
    const existing = db.prepare('SELECT * FROM archive_images WHERE entry_id=?').all(id), used = new Set();
    const images = body.images.map(image => {
      if (image?.id) {
        const found = existing.find(i => i.id === image.id);
        if (!found || used.has(image.id)) throw new HttpError(400, 'Ungültiges oder doppeltes Bild.');
        used.add(image.id); return found;
      }
      return { id: randomUUID(), filename: storeImage(dataDir, validateImage(image?.data)) };
    });
    db.prepare('DELETE FROM archive_images WHERE entry_id=?').run(id);
    images.forEach((image, position) => db.prepare('INSERT INTO archive_images VALUES (?,?,?,?)').run(image.id, id, image.filename, position));
    audit(db, user, null, body.kind === 'map' ? 'Karte gespeichert' : 'Entdeckung gespeichert', { id, visibility: body.visibility });
    return { id };
  });
}
