import { randomUUID } from 'node:crypto';
import { audit } from './database.mjs';
import { HttpError, integer, text, mutate, requireEmpire } from './game.mjs';
import { validateImage, storeImage } from './images.mjs';

export function requireGM(user) { if (user.role !== 'gm') throw new HttpError(403, 'Nur die Spielleitung darf diese Daten ändern.'); }
export function resourceTypes(db) { return db.prepare('SELECT * FROM resource_types ORDER BY rowid').all(); }
export function saveResourceType(db, user, body, id) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    const old = id && db.prepare('SELECT * FROM resource_types WHERE id=?').get(id);
    if (id && !old) throw new HttpError(404, 'Ressourcentyp nicht gefunden.');
    if (body.archived !== undefined && typeof body.archived !== 'boolean') throw new HttpError(400, 'Ungültige Archivierung.');
    if (['energy','minerals','alloys','food','influence'].includes(id) && body.archived) throw new HttpError(400, 'Bestehende Basisressourcen bleiben erhalten.');
    id ||= randomUUID();
    db.prepare('INSERT INTO resource_types VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,symbol=excluded.symbol,archived=excluded.archived')
      .run(id, text(body.name, 'Name', 120, true), text(body.description ?? '', 'Beschreibung'), text(body.symbol ?? '', 'Symbol', 12), body.archived ? 1 : 0);
    audit(db, user, null, body.archived ? 'Ressourcentyp archiviert' : 'Ressourcentyp gespeichert', { id });
    return { id };
  });
}
export function assignResource(db, user, body) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    requireEmpire(db, body.empire_id);
    if (!db.prepare('SELECT id FROM resource_types WHERE id=? AND archived=0').get(body.kind)) throw new HttpError(400, 'Aktiven Ressourcentyp auswählen.');
    db.prepare('INSERT OR IGNORE INTO resources(empire_id,kind) VALUES (?,?)').run(body.empire_id, body.kind);
    audit(db, user, body.empire_id, 'Ressource zugewiesen', { kind: body.kind });
    return { ok: true };
  });
}
function amounts(db, value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length > 200) throw new HttpError(400, 'Ungültige Ressourcenmengen.');
  const result = {};
  for (const [kind, amount] of Object.entries(value)) {
    if (kind !== 'research' && !db.prepare('SELECT id FROM resource_types WHERE id=?').get(kind)) throw new HttpError(400, 'Unbekannter Ressourcentyp.');
    result[kind] = integer(amount, 'Menge', 0);
  }
  return JSON.stringify(result);
}
export const templateView = row => ({ ...row, production: JSON.parse(row.production), upkeep: JSON.parse(row.upkeep), image: !!row.image });
export const buildingView = row => ({ ...row, production: JSON.parse(row.production), upkeep: JSON.parse(row.upkeep) });
export function saveTemplate(db, user, body, id, dataDir) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    const old = id && db.prepare('SELECT * FROM building_templates WHERE id=?').get(id);
    if (id && !old) throw new HttpError(404, 'Vorlage nicht gefunden.');
    id ||= randomUUID();
    const image = body.image === null ? null : body.image ? storeImage(dataDir, validateImage(body.image)) : old?.image ?? null;
    db.prepare('INSERT INTO building_templates VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,production=excluded.production,upkeep=excluded.upkeep,duration=excluded.duration,image=excluded.image')
      .run(id, text(body.name, 'Name', 120, true), text(body.description ?? '', 'Beschreibung'), amounts(db, body.production), amounts(db, body.upkeep), integer(body.duration, 'Bauzeit', 0), image);
    audit(db, user, null, 'Gebäudevorlage gespeichert', { id });
    return { id };
  });
}
export function saveBuilding(db, user, body, id) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    const round = db.prepare('SELECT round FROM meta').get().round;
    if (!id) {
      const planet = db.prepare("SELECT * FROM records WHERE id=? AND kind='planet'").get(body.planet_id);
      const template = db.prepare('SELECT * FROM building_templates WHERE id=?').get(body.template_id);
      if (!planet || !template) throw new HttpError(400, 'Planet und Gebäudevorlage auswählen.');
      const duration = integer(body.duration ?? template.duration, 'Bauzeit', 0);
      const finish = integer(round + duration, 'Fertigstellungsrunde', 0);
      id = randomUUID();
      db.prepare('INSERT INTO buildings(id,planet_id,template_id,name,production,upkeep,status,start_round,finish_round) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, planet.id, template.id, template.name, template.production, template.upkeep, duration ? 'construction' : 'active', round, finish);
      audit(db, user, planet.empire_id, 'Gebäude angelegt', { id, planet: planet.id, finish, firstPayout: finish + 1 });
    } else {
      const old = db.prepare('SELECT * FROM buildings WHERE id=?').get(id);
      if (!old) throw new HttpError(404, 'Gebäude nicht gefunden.');
      if (old.status === 'demolished') throw new HttpError(400, 'Abgerissene oder abgebrochene Gebäude bleiben im Verlauf.');
      let status = body.status ?? old.status, finish = old.finish_round;
      if (!['construction','active','inactive','demolished'].includes(status) || (status === 'construction' && old.status !== 'construction')) throw new HttpError(400, 'Ungültiger Gebäudestatus.');
      if (body.remaining !== undefined) {
        if (old.status !== 'construction') throw new HttpError(400, 'Nur Bauaufträge haben eine verbleibende Bauzeit.');
        const remaining = integer(body.remaining, 'Verbleibende Bauzeit', 0);
        finish = integer(round + remaining, 'Fertigstellungsrunde', 0); status = remaining ? 'construction' : 'active';
      }
      if (old.status === 'construction' && status === 'inactive') throw new HttpError(400, 'Bauauftrag zuerst fertigstellen.');
      if (old.status === 'construction' && status === 'active') finish = round;
      db.prepare('UPDATE buildings SET status=?,finish_round=?,version=version+1 WHERE id=?').run(status, finish, id);
      audit(db, user, db.prepare('SELECT empire_id FROM records WHERE id=?').get(old.planet_id).empire_id, 'Gebäudestatus geändert', { id, before: old.status, after: status, finish });
    }
    return { id };
  });
}
// Snapshots belong to building instances. Template edits never change these values.
export function income(db, empireId, futureRound = null) {
  const result = new Map(db.prepare('SELECT kind,stock,income FROM resources WHERE empire_id=? ORDER BY rowid').all(empireId).map(r => [r.kind, { ...r, base: r.income, production: 0, upkeep: 0 }]));
  const research = { base: db.prepare('SELECT research_power FROM empires WHERE id=?').get(empireId).research_power, production: 0, upkeep: 0 };
  const buildings = db.prepare('SELECT b.* FROM buildings b JOIN records p ON p.id=b.planet_id WHERE p.empire_id=?').all(empireId);
  for (const b of buildings) {
    if (b.status !== 'active' && !(futureRound !== null && b.status === 'construction' && b.finish_round <= futureRound)) continue;
    for (const field of ['production','upkeep']) for (const [kind, amount] of Object.entries(JSON.parse(b[field]))) {
      if (kind === 'research') { research[field] += amount; continue; }
      if (!result.has(kind)) result.set(kind, { kind, stock: 0, income: 0, base: 0, production: 0, upkeep: 0 });
      result.get(kind)[field] += amount;
    }
  }
  for (const r of result.values()) r.income = integer(r.base + r.production - r.upkeep, 'Gesamteinkommen');
  research.power = integer(Math.max(0, research.base + research.production - research.upkeep), 'Forschungsleistung', 0);
  return { resources: [...result.values()], research };
}
export function completingBuildings(db, nextRound) {
  return db.prepare("SELECT b.id,b.name,b.planet_id,p.name AS planet_name,b.finish_round FROM buildings b JOIN records p ON p.id=b.planet_id WHERE b.status='construction' AND b.finish_round<=?").all(nextRound);
}
