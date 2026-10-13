import { randomUUID } from 'node:crypto';
import { transaction, audit, bump } from './database.mjs';
import { HttpError, text, mutate, requireEmpire } from './game.mjs';
import { requireGM } from './economy.mjs';

export function canReadLawbook(db, user, empireId) {
  return user.role === 'gm' || user.empire_id === empireId || (!!user.empire_id && !!db.prepare('SELECT 1 FROM lawbooks b JOIN empire_contacts c ON c.target_id=b.empire_id WHERE b.empire_id=? AND b.published=1 AND c.source_id=?').get(empireId, user.empire_id));
}
export function lawState(db, user) {
  const lawbooks = db.prepare('SELECT id,name FROM empires ORDER BY name').all().filter(r => canReadLawbook(db, user, r.id)).map(r => ({ empire_id: r.id, name: r.name,
    published: !!db.prepare('SELECT published FROM lawbooks WHERE empire_id=?').get(r.id)?.published,
    laws: db.prepare("SELECT * FROM laws WHERE empire_id=? ORDER BY CASE WHEN kind='constitution' THEN 0 ELSE 1 END,number").all(r.id).map(law => ({ ...law, versions: db.prepare('SELECT version,title,content,status,round,at FROM law_versions WHERE law_id=? ORDER BY version').all(law.id) })) }));
  const proposals = db.prepare('SELECT p.*,u.username,e.name AS empire_name FROM law_proposals p JOIN users u ON u.id=p.user_id JOIN empires e ON e.id=p.empire_id ORDER BY p.at DESC').all().filter(p => user.role === 'gm' || p.user_id === user.id);
  return { lawbooks, proposals, lawNotices: db.prepare('SELECT * FROM law_notices WHERE user_id=? AND confirmed=0 ORDER BY at').all(user.id), contacts: user.role === 'gm' ? db.prepare('SELECT * FROM empire_contacts').all() : [] };
}
export function saveLawbook(db, user, body) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    requireEmpire(db, body.empire_id);
    if (typeof body.published !== 'boolean') throw new HttpError(400, 'Veröffentlichung auswählen.');
    db.prepare('INSERT INTO lawbooks(empire_id,published) VALUES (?,?) ON CONFLICT(empire_id) DO UPDATE SET published=excluded.published').run(body.empire_id, body.published ? 1 : 0);
    audit(db, user, body.empire_id, 'Gesetzbuchfreigabe geändert', { published: body.published });
    return { ok: true };
  });
}
export function saveContact(db, user, body) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    requireEmpire(db, body.source_id); requireEmpire(db, body.target_id);
    if (body.source_id === body.target_id || typeof body.known !== 'boolean') throw new HttpError(400, 'Zwei unterschiedliche Reiche auswählen.');
    if (body.known) db.prepare('INSERT OR IGNORE INTO empire_contacts VALUES (?,?)').run(body.source_id, body.target_id);
    else db.prepare('DELETE FROM empire_contacts WHERE source_id=? AND target_id=?').run(body.source_id, body.target_id);
    audit(db, user, body.source_id, 'Reichsentdeckung geändert', { target: body.target_id, known: body.known });
    return { ok: true };
  });
}
export function saveProposal(db, user, body, id) {
  return transaction(db, () => {
    const old = id && db.prepare('SELECT * FROM law_proposals WHERE id=?').get(id);
    if (id && (!old || old.user_id !== user.id)) throw new HttpError(404, 'Vorschlag nicht gefunden.');
    if (old && !['draft','revision'].includes(old.status)) throw new HttpError(409, 'Dieser Vorschlag kann nicht mehr bearbeitet werden.');
    if (old && body.version !== old.version) throw new HttpError(409, 'Der Vorschlag wurde inzwischen geändert.');
    const empireId = old?.empire_id ?? (user.role === 'gm' ? body.empire_id : user.empire_id);
    requireEmpire(db, empireId);
    if (user.role !== 'gm' && user.empire_id !== empireId) throw new HttpError(403, 'Vorschläge nur für das eigene aktuelle Reich.');
    const kind = old?.kind ?? body.kind;
    if (!['constitution','law'].includes(kind) || !['draft','submitted'].includes(body.status)) throw new HttpError(400, 'Ungültiger Vorschlag.');
    let lawId = old?.law_id ?? body.law_id ?? null;
    if (kind === 'constitution') lawId = db.prepare("SELECT id FROM laws WHERE empire_id=? AND kind='constitution'").get(empireId)?.id ?? null;
    const law = lawId && db.prepare('SELECT * FROM laws WHERE id=? AND empire_id=? AND kind=?').get(lawId, empireId, kind);
    if (lawId && (!law || law.status !== 'valid')) throw new HttpError(400, 'Gültiges Gesetz auswählen.');
    id ||= randomUUID();
    db.prepare('INSERT INTO law_proposals(id,empire_id,user_id,kind,law_id,base_version,title,content,status,at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,status=excluded.status,law_id=excluded.law_id,base_version=excluded.base_version,version=law_proposals.version+1')
      .run(id, empireId, user.id, kind, lawId, law?.version ?? null, text(body.title, 'Titel', 200, true), text(body.content, 'Text', 10000, true), body.status, new Date().toISOString());
    audit(db, user, empireId, 'Gesetzesvorschlag gespeichert', { id, status: body.status });
    return { id };
  });
}
function saveVersion(db, law, user) {
  db.prepare('INSERT INTO law_versions VALUES (?,?,?,?,?,?,?,?)').run(law.id, law.version, law.title, law.content, law.status, law.round, law.at, user.username);
}
export function decideProposal(db, user, id, body) {
  requireGM(user);
  return transaction(db, () => {
    const p = db.prepare('SELECT * FROM law_proposals WHERE id=?').get(id);
    if (!p) throw new HttpError(404, 'Vorschlag nicht gefunden.');
    if (p.status === 'approved' && body.status === 'approved') return { id: p.published_law_id, alreadyApproved: true };
    if (p.status !== 'submitted' || p.version !== body.version) throw new HttpError(409, 'Nur die aktuelle eingereichte Fassung kann entschieden werden.');
    if (!['approved','rejected','revision'].includes(body.status)) throw new HttpError(400, 'Ungültige Entscheidung.');
    const comment = text(body.comment ?? '', 'Kommentar', 10000);
    let lawId = null;
    if (body.status === 'approved') {
      const round = db.prepare('SELECT round FROM meta').get().round, at = new Date().toISOString();
      const old = p.law_id ? db.prepare('SELECT * FROM laws WHERE id=?').get(p.law_id) : null;
      if (old && (old.version !== p.base_version || old.status !== 'valid')) throw new HttpError(409, 'Das Gesetz wurde inzwischen geändert. Bitte zur Überarbeitung zurückgeben.');
      if (!old && p.kind === 'constitution' && db.prepare("SELECT id FROM laws WHERE empire_id=? AND kind='constitution'").get(p.empire_id)) throw new HttpError(409, 'Eine Verfassung existiert inzwischen. Bitte einen Änderungsentwurf einreichen.');
      db.prepare('INSERT OR IGNORE INTO lawbooks(empire_id) VALUES (?)').run(p.empire_id);
      let number = old?.number ?? null;
      if (!old && p.kind === 'law') {
        number = db.prepare('SELECT next_number FROM lawbooks WHERE empire_id=?').get(p.empire_id).next_number;
        db.prepare('UPDATE lawbooks SET next_number=next_number+1 WHERE empire_id=?').run(p.empire_id);
      }
      lawId = old?.id ?? randomUUID();
      const law = { id: lawId, version: (old?.version ?? 0) + 1, title: p.title, content: p.content, status: 'valid', round, at };
      db.prepare('INSERT INTO laws VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,version=excluded.version,round=excluded.round,at=excluded.at')
        .run(lawId, p.empire_id, p.kind, number, p.title, p.content, 'valid', law.version, round, at);
      saveVersion(db, law, user);
    }
    db.prepare('UPDATE law_proposals SET status=?,comment=?,published_law_id=?,version=version+1 WHERE id=?').run(body.status, comment, lawId, id);
    const labels = { approved: 'genehmigt', rejected: 'abgelehnt', revision: 'zur Überarbeitung zurückgegeben' };
    db.prepare('INSERT INTO law_notices(id,user_id,proposal_id,message,at) VALUES (?,?,?,?,?)').run(randomUUID(), p.user_id, id, `„${p.title}“ wurde ${labels[body.status]}.`, new Date().toISOString());
    audit(db, user, p.empire_id, 'Gesetzesvorschlag entschieden', { id, status: body.status, lawId }); bump(db);
    return { id: lawId };
  });
}
export function repealLaw(db, user, id, body) {
  requireGM(user);
  return mutate(db, body.revision, () => {
    const law = db.prepare("SELECT * FROM laws WHERE id=? AND kind='law'").get(id);
    if (!law) throw new HttpError(404, 'Gesetz nicht gefunden.');
    if (law.status === 'repealed') return { ok: true };
    law.status = 'repealed'; law.version++; law.round = db.prepare('SELECT round FROM meta').get().round; law.at = new Date().toISOString();
    db.prepare("UPDATE laws SET status='repealed',version=?,round=?,at=? WHERE id=?").run(law.version, law.round, law.at, id);
    saveVersion(db, law, user); audit(db, user, law.empire_id, 'Gesetz aufgehoben', { id, number: law.number });
    return { ok: true };
  });
}
export function confirmLawNotice(db, user, id) {
  db.prepare('UPDATE law_notices SET confirmed=1 WHERE id=? AND user_id=?').run(id, user.id);
  return { ok: true };
}
