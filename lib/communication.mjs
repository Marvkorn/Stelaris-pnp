import { randomUUID } from 'node:crypto';
import { canReadRecord } from './auth.mjs';
import { transaction, audit } from './database.mjs';
import { HttpError, text, mutate, recordView } from './game.mjs';

export function announcementStatus(db, record) {
  const players = db.prepare("SELECT id,username,role,empire_id FROM users WHERE role='player' ORDER BY username").all().filter(p => canReadRecord(p, record));
  return db.prepare('SELECT * FROM announcements WHERE record_id=? ORDER BY rowid DESC').all(record.id).map(a => ({
    id:a.id, at:a.at, actor:a.actor,
    players:players.map(p => ({ id:p.id, username:p.username, confirmed_at:db.prepare('SELECT at FROM acknowledgements WHERE announcement_id=? AND user_id=?').get(a.id,p.id)?.at ?? null }))
  }));
}
export function notifications(db, user) {
  const actions = actionList(db, user);
  const result = { actions: user.role === 'gm' ? actions.filter(a => !a.gm_read_at).length : actions.filter(a => a.replies.some(r => !r.confirmed_at)).length, events:[] };
  if (user.role === 'player') {
    // Only the current announcement is delivered, even when an older one was never confirmed.
    for (const a of db.prepare(`SELECT a.* FROM announcements a WHERE a.rowid=(SELECT MAX(b.rowid) FROM announcements b WHERE b.record_id=a.record_id)
      AND NOT EXISTS(SELECT 1 FROM acknowledgements k WHERE k.announcement_id=a.id AND k.user_id=?) ORDER BY a.rowid`).all(user.id)) {
      const r = db.prepare('SELECT * FROM records WHERE id=?').get(a.record_id);
      if (r?.popup && canReadRecord(user,r)) result.events.push({ id:a.id, record_id:a.record_id, at:a.at });
    }
  }
  return result;
}
export function announcementDetail(db, user, id) {
  const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(id);
  const r = a && db.prepare('SELECT * FROM records WHERE id=?').get(a.record_id);
  const latest = a && db.prepare('SELECT id FROM announcements WHERE record_id=? ORDER BY rowid DESC LIMIT 1').get(a.record_id);
  if (!a || !r?.popup || !canReadRecord(user,r) || (user.role !== 'gm' && latest.id !== id)) throw new HttpError(404,'Ankündigung nicht gefunden.');
  return { id:a.id, record:recordView(db,user,r) };
}
export function confirmAnnouncement(db, user, id) {
  if(user.role !== 'player') throw new HttpError(403,'Nur Spieler bestätigen Ankündigungen.');
  return transaction(db,()=>{
    announcementDetail(db,user,id);
    db.prepare('INSERT OR IGNORE INTO acknowledgements VALUES (?,?,?)').run(id,user.id,new Date().toISOString());
    return {ok:true};
  });
}
export function reannounce(db,user,id,body) {
  return mutate(db,body.revision,()=>{
    const r=db.prepare("SELECT * FROM records WHERE id=? AND kind='report'").get(id);
    if(!r || r.status!=='published' || !r.popup) throw new HttpError(400,'Das Event muss veröffentlicht sein und die Pop-up-Option aktiviert haben.');
    const key=randomUUID();
    db.prepare('INSERT INTO announcements VALUES (?,?,?,?)').run(key,id,new Date().toISOString(),user.username);
    audit(db,user,r.empire_id,'Event erneut angekündigt',{id,announcement_id:key});
    return {id:key};
  });
}
export function actionList(db,user) {
  const rows=user.role==='gm' ? db.prepare('SELECT * FROM actions ORDER BY rowid DESC').all() : db.prepare('SELECT * FROM actions WHERE user_id=? ORDER BY rowid DESC').all(user.id);
  return rows.map(a=>({...a,replies:db.prepare('SELECT * FROM action_replies WHERE action_id=? ORDER BY rowid').all(a.id)}));
}
export function actionDetail(db,user,id) {
  const a=db.prepare('SELECT * FROM actions WHERE id=?').get(id);
  if(!a || (user.role!=='gm' && a.user_id!==user.id)) throw new HttpError(404,'Aktion nicht gefunden.');
  return {...a,replies:db.prepare('SELECT * FROM action_replies WHERE action_id=? ORDER BY rowid').all(id)};
}
export function submitAction(db,user,body) {
  if(user.role!=='player') throw new HttpError(403,'Aktionen werden von Spielern eingereicht.');
  return transaction(db,()=>{
    const account=db.prepare('SELECT username,empire_id FROM users WHERE id=?').get(user.id);
    const empire=account.empire_id && db.prepare('SELECT name FROM empires WHERE id=?').get(account.empire_id);
    const id=randomUUID();
    db.prepare('INSERT INTO actions(id,user_id,username,empire_id,empire_name,subject,description,at,round) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id,user.id,account.username,account.empire_id,empire?.name??null,text(body.subject,'Betreff',200,true),text(body.description,'Beschreibung',10000,true),new Date().toISOString(),db.prepare('SELECT round FROM meta').get().round);
    return {id};
  });
}
export function updateAction(db,user,id,body) {
  if(user.role!=='gm') throw new HttpError(403,'Nur die Spielleitung bearbeitet Aktionen.');
  return transaction(db,()=>{
    actionDetail(db,user,id);
    if(body.status!==undefined) {
      if(!['open','working','done'].includes(body.status))throw new HttpError(400,'Ungültiger Bearbeitungsstatus.');
      db.prepare('UPDATE actions SET status=? WHERE id=?').run(body.status,id);
    }
    if(body.reply!==undefined && body.reply!=='') db.prepare('INSERT INTO action_replies VALUES (?,?,?,?,?,NULL)').run(randomUUID(),id,user.username,text(body.reply,'Antwort',10000,true),new Date().toISOString());
    return {ok:true};
  });
}
export function markActionRead(db,user,id,body) {
  return transaction(db,()=>{
    actionDetail(db,user,id);
    if(user.role==='gm') db.prepare('UPDATE actions SET gm_read_at=COALESCE(gm_read_at,?) WHERE id=?').run(new Date().toISOString(),id);
    else {
      if(!Array.isArray(body.reply_ids) || body.reply_ids.some(x=>typeof x!=='string'))throw new HttpError(400,'Ungültige Antwortauswahl.');
      // Confirm only replies actually displayed, not a reply that arrived in the meantime.
      for(const reply of body.reply_ids) db.prepare('UPDATE action_replies SET confirmed_at=COALESCE(confirmed_at,?) WHERE id=? AND action_id=?').run(new Date().toISOString(),reply,id);
    }
    return {ok:true};
  });
}
