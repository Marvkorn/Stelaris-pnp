import { randomUUID } from 'node:crypto';
import { RESOURCE_NAMES, transaction, bump, audit } from './database.mjs';
import { canRead, canReadRecord, token } from './auth.mjs';
import { validateImage, storeImage } from './images.mjs';
import { announcementStatus, notifications, actionList } from './communication.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function text(value, label, max = 10000, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpError(400, `${label}: ungültige oder zu lange Eingabe.`);
  return value.trim();
}
export function integer(value, label, min = -1000000000, max = 1000000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, `${label}: ganze Zahl zwischen ${min} und ${max} erforderlich.`);
  return value;
}
function visibility(value = 'secret') {
  if (!['public', 'empire', 'secret'].includes(value)) throw new HttpError(400, 'Ungültige Sichtbarkeit.');
  return value;
}
function realms(db, value = []) {
  if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== 'string')) throw new HttpError(400, 'Ungültige Reichsauswahl.');
  return JSON.stringify([...new Set(value)].map(id => requireEmpire(db, id)));
}
export function recordView(db, user, record) {
  if (!canReadRecord(user, record)) throw new HttpError(404, 'Eintrag nicht gefunden.');
  const r = { ...record, details: JSON.parse(record.details) };
  r.images = db.prepare('SELECT id FROM record_images WHERE record_id=? ORDER BY position').all(r.id).map(i => ({ id:i.id, url:`/api/record-images/${i.id}` }));
  if (user.role === 'gm') {
    r.visibility_realms = JSON.parse(r.visibility_realms);
    if (r.kind === 'report') r.announcements = announcementStatus(db, r);
  } else {
    delete r.gm_notes; delete r.visibility_realms;
    const owner = db.prepare('SELECT * FROM empires WHERE id=?').get(r.empire_id ?? '');
    if (!owner || !canRead(user, owner.visibility, owner.visibility_realms)) r.empire_id = null;
  }
  return r;
}
export function requireEmpire(db, id, optional = false) {
  if (optional && id === null) return null;
  if (!db.prepare('SELECT id FROM empires WHERE id=?').get(String(id))) throw new HttpError(400, 'Reich nicht gefunden.');
  return id;
}
export function mutate(db, revision, action) {
  return transaction(db, () => {
    if (db.prepare('SELECT revision FROM meta').get().revision !== revision) throw new HttpError(409, 'Die Daten wurden inzwischen geändert. Bitte neu laden und erneut prüfen.');
    const result = action(); bump(db); return result;
  });
}
export function state(db, user) {
  const empires = db.prepare('SELECT * FROM empires ORDER BY name').all().filter(e => canRead(user, e.visibility, e.visibility_realms)).map(e => {
    const result = { id: e.id, name: e.name, species: e.species, description: e.description, image: e.image,
      visibility: e.visibility, economy_visibility: e.economy_visibility, research_visibility: e.research_visibility };
    if (canRead(user, e.economy_visibility, e.economy_realms)) result.resources = db.prepare('SELECT kind,stock,income FROM resources WHERE empire_id=? ORDER BY rowid').all(e.id);
    if (canRead(user, e.research_visibility, e.research_realms)) result.research = { power: e.research_power, name: e.project_name, description: e.project_description, progress: e.progress, required: e.required };
    if (user.role === 'gm') Object.assign(result, { gm_notes:e.gm_notes, visibility_realms:JSON.parse(e.visibility_realms), economy_realms:JSON.parse(e.economy_realms), research_realms:JSON.parse(e.research_realms) });
    if (user.role === 'gm' || user.empire_id === e.id) result.players = db.prepare("SELECT username FROM users WHERE empire_id=? AND role='player'").all(e.id).map(p => p.username);
    return result;
  });
  const records = db.prepare('SELECT * FROM records ORDER BY name').all().filter(r => canReadRecord(user, r)).map(r => recordView(db, user, r));
  return { ...db.prepare('SELECT revision,round FROM meta').get(), empires, records,
    actions: actionList(db, user), notifications: notifications(db, user),
    users: user.role === 'gm' ? db.prepare('SELECT id,username,role,empire_id FROM users ORDER BY username').all() : [],
    audit: user.role === 'gm' ? db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all().map(a => ({ ...a, details: JSON.parse(a.details) })) : [] };
}
export function saveEmpire(db, user, body, id) {
  return mutate(db, body.revision, () => {
    const old = id ? db.prepare('SELECT * FROM empires WHERE id=?').get(id) : null;
    if (id && !old) throw new HttpError(404, 'Reich nicht gefunden.');
    id ||= randomUUID();
    const fields = [text(body.name, 'Name', 120, true), text(body.species, 'Spezies', 200), text(body.description, 'Beschreibung'), visibility(body.visibility), visibility(body.economy_visibility), visibility(body.research_visibility)];
    if (old) db.prepare('UPDATE empires SET name=?,species=?,description=?,visibility=?,economy_visibility=?,research_visibility=? WHERE id=?').run(...fields, id);
    else {
      db.prepare('INSERT INTO empires(id,name,species,description,visibility,economy_visibility,research_visibility) VALUES (?,?,?,?,?,?,?)').run(id, ...fields);
      for (const kind of Object.keys(RESOURCE_NAMES)) db.prepare('INSERT INTO resources(empire_id,kind) VALUES (?,?)').run(id, kind);
    }
    db.prepare('UPDATE empires SET visibility_realms=?,economy_realms=?,research_realms=?,gm_notes=? WHERE id=?').run(
      realms(db, body.visibility_realms ?? (old ? JSON.parse(old.visibility_realms) : [])),
      realms(db, body.economy_realms ?? (old ? JSON.parse(old.economy_realms) : [])),
      realms(db, body.research_realms ?? (old ? JSON.parse(old.research_realms) : [])), text(body.gm_notes ?? old?.gm_notes ?? '', 'Spielleiternotizen'), id);
    audit(db, user, id, old ? 'Reich bearbeitet' : 'Reich erstellt', { name: fields[0] });
    return { id };
  });
}
export function saveResources(db, user, body, id) {
  return mutate(db, body.revision, () => {
    requireEmpire(db, id);
    if (!['set', 'delta'].includes(body.mode)) throw new HttpError(400, 'Ungültige Buchungsart.');
    const changes = [];
    for (const kind of Object.keys(RESOURCE_NAMES)) {
      const input = body.resources?.[kind];
      if (!input) throw new HttpError(400, 'Alle fünf Ressourcen sind erforderlich.');
      const old = db.prepare('SELECT stock,income FROM resources WHERE empire_id=? AND kind=?').get(id, kind);
      const amount = integer(input.stock, RESOURCE_NAMES[kind]);
      const stock = integer(body.mode === 'delta' ? old.stock + amount : amount, 'Vorrat');
      const income = integer(input.income, 'Einkommen');
      db.prepare('UPDATE resources SET stock=?,income=? WHERE empire_id=? AND kind=?').run(stock, income, id, kind);
      changes.push({ resource: RESOURCE_NAMES[kind], before: old.stock, after: stock, incomeBefore: old.income, incomeAfter: income });
    }
    audit(db, user, id, 'Ressourcen gebucht', changes, text(body.reason ?? '', 'Grund', 1000));
    return { ok: true };
  });
}
export function saveResearch(db, user, body, id) {
  return mutate(db, body.revision, () => {
    requireEmpire(db, id);
    const fields = [integer(body.power, 'Forschungsleistung', 0), text(body.name, 'Projektname', 200), text(body.description, 'Beschreibung'), integer(body.progress, 'Fortschritt', 0), integer(body.required, 'Benötigte Punkte', 1)];
    const before = db.prepare('SELECT research_power,project_name,project_description,progress,required FROM empires WHERE id=?').get(id);
    db.prepare('UPDATE empires SET research_power=?,project_name=?,project_description=?,progress=?,required=? WHERE id=?').run(...fields, id);
    audit(db, user, id, 'Forschung bearbeitet', { before, after: { power: fields[0], name: fields[1], description: fields[2], progress: fields[3], required: fields[4] } });
    return { ok: true };
  });
}
export function saveRecord(db, user, body, id, dataDir) {
  return mutate(db, body.revision, () => {
    const old = id ? db.prepare('SELECT * FROM records WHERE id=?').get(id) : null;
    if (id && !old) throw new HttpError(404, 'Eintrag nicht gefunden.');
    if (!['planet', 'fleet', 'report'].includes(body.kind) || (old && old.kind !== body.kind)) throw new HttpError(400, 'Ungültiger Eintragstyp.');
    const owner = requireEmpire(db, body.empire_id, true);
    const detail = body.details ?? {};
    const details = { type: text(detail.type ?? '', 'Typ', 120), mapId: text(detail.mapId ?? '', 'Karten-ID', 120) };
    if (body.kind === 'fleet') {
      if (!Array.isArray(detail.ships) || detail.ships.length > 200) throw new HttpError(400, 'Maximal 200 Schiffe pro Flotte.');
      details.ships = detail.ships.map(s => ({ name: text(s.name, 'Schiffsname', 120, true), type: text(s.type, 'Schiffstyp', 120), status: text(s.status, 'Schiffszustand', 200) }));
    }
    id ||= randomUUID();
    const fields = [owner, text(body.name, 'Name', 200, true), text(body.description, 'Beschreibung'), visibility(body.visibility), JSON.stringify(details)];
    if (old) db.prepare('UPDATE records SET empire_id=?,name=?,description=?,visibility=?,details=? WHERE id=?').run(...fields, id);
    else db.prepare('INSERT INTO records(empire_id,name,description,visibility,details,id,kind) VALUES (?,?,?,?,?,?,?)').run(...fields, id, body.kind);
    const status = body.kind === 'report' ? (body.status ?? old?.status ?? 'draft') : 'published';
    if (!['draft','published'].includes(status)) throw new HttpError(400, 'Ungültiger Veröffentlichungsstatus.');
    if (body.popup !== undefined && typeof body.popup !== 'boolean') throw new HttpError(400, 'Ungültige Pop-up-Option.');
    const popup = body.kind === 'report' && (body.popup ?? !!old?.popup) ? 1 : 0;
    const publishedAt = status === 'published' ? (old?.published_at ?? new Date().toISOString()) : old?.published_at ?? null;
    db.prepare('UPDATE records SET visibility_realms=?,gm_notes=?,status=?,popup=?,published_at=? WHERE id=?').run(
      realms(db, body.visibility_realms ?? (old ? JSON.parse(old.visibility_realms) : [])), text(body.gm_notes ?? old?.gm_notes ?? '', 'Spielleiternotizen'), status, popup, publishedAt, id);
    if (body.images !== undefined) {
      if (body.kind !== 'report' || !Array.isArray(body.images) || body.images.length > 5) throw new HttpError(400, 'Maximal fünf Eventbilder.');
      const existing = db.prepare('SELECT * FROM record_images WHERE record_id=?').all(id);
      const used = new Set();
      const images = body.images.map(image => {
        if (image?.id) {
          const found = existing.find(i => i.id === image.id);
          if (!found || used.has(found.id)) throw new HttpError(400, 'Bild gehört nicht zu diesem Event oder ist doppelt.');
          used.add(found.id); return found;
        }
        return { validated: validateImage(image?.data) };
      });
      db.prepare('DELETE FROM record_images WHERE record_id=?').run(id);
      images.forEach((image, position) => db.prepare('INSERT INTO record_images VALUES (?,?,?,?)').run(image.id ?? randomUUID(), id, image.filename ?? storeImage(dataDir, image.validated), position));
      // Retire the legacy image URL too when an old event picture is removed.
      db.prepare('UPDATE records SET image=NULL WHERE id=?').run(id);
    }
    if (body.kind === 'report' && status === 'published' && popup &&
        (!old || old.status !== 'published' || !db.prepare('SELECT id FROM announcements WHERE record_id=? LIMIT 1').get(id))) {
      db.prepare('INSERT INTO announcements VALUES (?,?,?,?)').run(randomUUID(), id, new Date().toISOString(), user.username);
    }
    audit(db, user, owner, old ? 'Eintrag bearbeitet' : 'Eintrag erstellt', { id, kind: body.kind, name: fields[1], previousOwner: old?.empire_id ?? null });
    return { id };
  });
}
export function previewRound(db) {
  return transaction(db, () => {
    db.prepare('DELETE FROM previews WHERE committed=0 AND expires<?').run(Date.now());
    const meta = db.prepare('SELECT * FROM meta').get();
    const empires = db.prepare('SELECT * FROM empires ORDER BY name').all();
    if (!empires.length) throw new HttpError(400, 'Lege zuerst mindestens ein Reich an.');
    const changes = empires.map(e => ({ id: e.id, name: e.name,
      resources: db.prepare('SELECT * FROM resources WHERE empire_id=? ORDER BY rowid').all(e.id).map(r => ({ kind: r.kind, before: r.stock, change: r.income, after: integer(r.stock + r.income, 'Ressourcenvorrat nach Runde') })),
      research: { name: e.project_name, before: e.progress, required: e.required,
        after: integer(e.progress + (e.project_name && e.progress < e.required ? e.research_power : 0), 'Forschungsfortschritt', 0) } }));
    const result = { token: token(), round: meta.round + 1, revision: meta.revision, changes };
    db.prepare('INSERT INTO previews(token,revision,round,snapshot,expires) VALUES (?,?,?,?,?)').run(result.token, result.revision, result.round, JSON.stringify(changes), Date.now() + 15 * 60 * 1000);
    return result;
  });
}
export function commitRound(db, user, key) {
  return transaction(db, () => {
    const p = db.prepare('SELECT * FROM previews WHERE token=?').get(text(key, 'Bestätigungsschlüssel', 100, true));
    if (!p) throw new HttpError(404, 'Vorschau nicht gefunden.');
    if (p.committed) return { round: p.round, alreadyCommitted: true };
    const meta = db.prepare('SELECT * FROM meta').get();
    if (p.expires < Date.now() || p.revision !== meta.revision || p.round !== meta.round + 1) throw new HttpError(409, 'Die Vorschau ist abgelaufen oder Daten wurden geändert. Bitte eine neue Vorschau öffnen.');
    for (const e of JSON.parse(p.snapshot)) {
      for (const r of e.resources) db.prepare('UPDATE resources SET stock=? WHERE empire_id=? AND kind=?').run(r.after, e.id, r.kind);
      db.prepare('UPDATE empires SET progress=? WHERE id=?').run(e.research.after, e.id);
      audit(db, user, e.id, `Runde ${p.round}`, e, 'Automatische Rundenabrechnung');
    }
    db.prepare('UPDATE previews SET committed=1 WHERE token=?').run(key);
    db.prepare('UPDATE meta SET round=?,revision=revision+1 WHERE id=1').run(p.round);
    return { round: p.round, alreadyCommitted: false };
  });
}
