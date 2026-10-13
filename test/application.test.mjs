import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
import { hashPassword } from '../lib/auth.mjs';
import { RESOURCE_NAMES } from '../lib/database.mjs';
import { createBackup } from '../scripts/backup.mjs';

const password = randomBytes(18).toString('hex');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=';
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sternarchiv-test-'));
  const dataDir = join(root, 'data');
  const instance = createApp({ dataDir });
  instance.db.prepare("INSERT INTO users VALUES (?,?,?,'gm',NULL)").run(randomUUID(), 'Leitung', hashPassword(password));
  instance.server.listen(0, '127.0.0.1'); await once(instance.server, 'listening');
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => instance.server.close(resolve));
    instance.db.close();
    // Only remove this test's OS-created temporary directory, after validating containment.
    const parent = resolve(tmpdir());
    assert.ok(resolve(root).startsWith(parent + '\\') || resolve(root).startsWith(parent + '/'));
    assert.ok(root.includes('sternarchiv-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  function client() {
    let cookie = '', csrf = '';
    const request = async (path, method = 'GET', body, extraHeaders = {}) => {
      const response = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json', 'X-Sternarchiv': '1', 'X-CSRF-Token': csrf, Cookie: cookie, ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
      if (path === '/api/session' && data.csrf) csrf = data.csrf;
      return { status: response.status, data, headers: response.headers };
    };
    return { request, async login(username = 'Leitung', pass = password) { const r = await request('/api/login', 'POST', { username, password: pass }); assert.equal(r.status, 200, JSON.stringify(r.data)); await request('/api/session'); }, async state() { const r = await request('/api/state'); assert.equal(r.status, 200); return r.data; } };
  }
  const gm = client(); await gm.login();
  async function write(path, body, method = 'POST') { const r = await gm.request('/api' + path, method, { ...body, revision: (await gm.state()).revision }); assert.ok(r.status >= 200 && r.status < 300, JSON.stringify(r.data)); return r.data; }
  const empire = async (name, visibility = 'empire') => {
    const fields={ name, species:'Menschen', description:`${name} Beschreibung`, visibility, economy_visibility:'empire', research_visibility:'empire' };
    const result=await write('/empires',fields);
    await write(`/empires/${result.id}`,{...fields,visibility_realms:[result.id],economy_realms:[result.id],research_realms:[result.id]},'PUT');
    return result;
  };
  const player = async (name, empireId) => { await write('/users', { username: name, password, empire_id: empireId }); const c = client(); await c.login(name); return c; };
  return { ...instance, root, dataDir, url, client, gm, write, empire, player };
}

test('Login, Sitzungen, CSRF und serverseitiges Schreibverbot für Spieler', async t => {
  const f = await fixture(t), guest = f.client();
  assert.equal((await guest.request('/api/state')).status, 401);
  assert.equal((await guest.request('/api/login', 'POST', { username: 'Leitung', password: 'falsch' })).status, 401);
  assert.equal((await guest.request('/api/login', 'POST', { username: 'Leitung', password }, { Origin: 'https://fremde-seite.invalid' })).status, 403);
  assert.equal((await guest.request('/api/setup', 'POST', {})).status, 401);
  const { id } = await f.empire('Solarbund');
  const player = await f.player('Spieler Eins', id);
  for (const [path, method] of [[`/empires/${id}`, 'PUT'], [`/empires/${id}/resources`, 'PUT'], [`/empires/${id}/research`, 'PUT'], ['/empires','POST'], ['/records','POST'], ['/records/test','PUT'], ['/records/test','DELETE'], ['/users','POST'], ['/round/preview','POST'], ['/round/commit','POST'], [`/images/empire/${id}`,'POST']]) {
    assert.equal((await player.request('/api'+path, method, {})).status, 403, path);
  }
  assert.equal((await f.gm.request('/api/round/preview','POST',{}, {'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await f.gm.request('/api/round/preview','POST',{}, {'X-Sternarchiv':''})).status,403);
  const before = await f.gm.state();
  assert.equal(before.empires[0].resources.every(r=>r.stock===0),true);
  const hash = f.db.prepare("SELECT password FROM users WHERE username='Leitung'").get().password;
  assert.notEqual(hash,password);
  assert.equal((await player.request('/api/logout','POST',{})).status,200);
  assert.equal((await player.request('/api/state')).status,401);
});

test('Sichtbarkeit filtert API, Wirtschaft, Forschung, Besitzer und direkte Bilder', async t => {
  const f = await fixture(t);
  const own = await f.empire('Eigenes Reich');
  const foreign = await f.empire('Fremdes Reich');
  const secret = await f.empire('Geheimes Reich','secret');
  const publicEmpire = await f.empire('Öffentliches Reich','public');
  const a = await f.player('A',own.id), b = await f.player('B',foreign.id);
  const makeRecord = (name,owner,visibility) => f.write('/records',{kind:'planet',name,empire_id:owner,visibility,visibility_realms:owner?[owner]:[],description:'Text',details:{type:'Wüstenwelt',mapId:'A-1'}});
  const ownPlanet = await makeRecord('Heimat',own.id,'empire');
  await makeRecord('Verboten',own.id,'secret');
  const shared = await makeRecord('Öffentliche Welt',secret.id,'public');
  await makeRecord('Nicht zugeordnet',null,'empire');
  await f.write(`/images/record/${ownPlanet.id}`,{data:png});
  await f.write(`/images/record/${shared.id}`,{data:png});
  await f.write(`/images/empire/${secret.id}`,{data:png});
  const s = await a.state();
  assert.deepEqual(s.empires.map(x=>x.name).sort(),['Eigenes Reich','Öffentliches Reich']);
  assert.equal(s.empires.find(x=>x.id===publicEmpire.id).resources,undefined);
  assert.equal(s.empires.find(x=>x.id===publicEmpire.id).research,undefined);
  assert.equal(s.empires.find(x=>x.id===own.id).resources.length,5);
  assert.equal(s.records.length,2);
  assert.equal(s.records.find(x=>x.id===shared.id).empire_id,null);
  assert.deepEqual(s.users,[]); assert.deepEqual(s.audit,[]);
  assert.equal(JSON.stringify(s).includes(secret.id),false);
  assert.equal((await a.request(`/api/images/record/${ownPlanet.id}`)).status,200);
  assert.equal((await b.request(`/api/images/record/${ownPlanet.id}`)).status,404);
  assert.equal((await a.request(`/api/images/empire/${secret.id}`)).status,404);
  assert.equal((await a.request(`/api/images/record/${shared.id}`)).status,200);
  assert.equal((await f.client().request(`/api/images/record/${shared.id}`)).status,401);
  await f.write(`/records/${ownPlanet.id}`,{kind:'planet',name:'Heimat',empire_id:own.id,visibility:'secret',description:'Geheim',details:{}},'PUT');
  assert.equal((await a.request(`/api/images/record/${ownPlanet.id}`)).status,404);
  const badUpload = await f.gm.request(`/api/images/record/${shared.id}`,'POST',{data:Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),revision:(await f.gm.state()).revision});
  assert.equal(badUpload.status,400);
});

test('Ressourcen setzen/ändern: Audit, Fehlbestände und vollständiger Rollback', async t => {
  const f = await fixture(t), { id } = await f.empire('Testreich');
  const values = stock => Object.fromEntries(Object.keys(RESOURCE_NAMES).map(k=>[k,{stock,income:-3}]));
  await f.write(`/empires/${id}/resources`,{mode:'set',resources:values(10),reason:'Startbestand'},'PUT');
  await f.write(`/empires/${id}/resources`,{mode:'delta',resources:values(-12),reason:'Versorgung'},'PUT');
  let s=await f.gm.state();
  assert.ok(s.empires[0].resources.every(r=>r.stock===-2&&r.income===-3));
  const log=s.audit.find(a=>a.reason==='Versorgung');
  assert.equal(log.actor,'Leitung'); assert.ok(Date.parse(log.at));
  assert.equal(log.details[0].before,10); assert.equal(log.details[0].after,-2);
  const invalid=values(100); invalid.influence.stock=0.5;
  const r=await f.gm.request(`/api/empires/${id}/resources`,'PUT',{revision:s.revision,mode:'set',resources:invalid});
  assert.equal(r.status,400);
  const after=await f.gm.state();assert.equal(after.revision,s.revision);assert.deepEqual(after.empires,s.empires);assert.deepEqual(after.audit,s.audit);
  const stale=await f.gm.request(`/api/empires/${id}/resources`,'PUT',{revision:s.revision-1,mode:'set',resources:values(100)});
  assert.equal(stale.status,409);
});

test('Runde: exakte Vorschau, Forschung, negative Werte und idempotente parallele Bestätigung', async t => {
  const f=await fixture(t), a=await f.empire('A'), b=await f.empire('B');
  const resources=Object.fromEntries(Object.keys(RESOURCE_NAMES).map(k=>[k,{stock:2,income:k==='energy'?-5:3}]));
  for(const id of [a.id,b.id]) await f.write(`/empires/${id}/resources`,{mode:'set',resources},'PUT');
  await f.write(`/empires/${a.id}/research`,{power:15,name:'Hyperraum',description:'Projekt',progress:90,required:100},'PUT');
  const before=await f.gm.state();
  const p=(await f.gm.request('/api/round/preview','POST',{})).data;
  const second=(await f.gm.request('/api/round/preview','POST',{})).data;
  assert.deepEqual((await f.gm.state()).empires,before.empires);
  assert.equal(p.round,1);assert.equal(p.changes[0].resources.find(r=>r.kind==='energy').after,-3);assert.equal(p.changes[0].research.after,105);
  const results=await Promise.all([f.gm.request('/api/round/commit','POST',{token:p.token}),f.gm.request('/api/round/commit','POST',{token:p.token})]);
  assert.ok(results.every(r=>r.status===200));assert.equal(results.filter(r=>r.data.alreadyCommitted).length,1);
  const s=await f.gm.state();assert.equal(s.round,1);assert.equal(s.empires.find(x=>x.id===a.id).research.progress,105);
  assert.ok(s.empires.every(x=>x.resources.find(r=>r.kind==='energy').stock===-3));
  assert.equal(s.audit.filter(x=>x.action==='Runde 1').length,2);
  assert.equal((await f.gm.request('/api/round/commit','POST',{token:second.token})).status,409);
  const next=(await f.gm.request('/api/round/preview','POST',{})).data;
  assert.equal(next.changes.find(x=>x.id===a.id).research.after,105);
  assert.equal(next.changes.find(x=>x.id===b.id).research.after,0);
});

test('Veraltete/abgelaufene Vorschau und Fehler mitten in der Transaktion buchen nichts', async t => {
  const f=await fixture(t), {id}=await f.empire('Rundentest');
  const preview=async()=> (await f.gm.request('/api/round/preview','POST',{})).data;
  const p=await preview(); await f.empire('Neues Reich');
  assert.equal((await f.gm.request('/api/round/commit','POST',{token:p.token})).status,409);
  const expired=await preview(); f.db.prepare('UPDATE previews SET expires=0 WHERE token=?').run(expired.token);
  assert.equal((await f.gm.request('/api/round/commit','POST',{token:expired.token})).status,409);
  const fault=await preview(), before=await f.gm.state();
  f.db.exec("CREATE TRIGGER simulate_failure BEFORE UPDATE ON resources WHEN NEW.kind='minerals' BEGIN SELECT RAISE(ABORT,'simulated transaction failure'); END;");
  // Expected server fault is captured, to keep test output readable.
  const original=console.error; const errors=[];console.error=err=>errors.push(err);
  try { assert.equal((await f.gm.request('/api/round/commit','POST',{token:fault.token})).status,500); }
  finally { console.error=original; }
  assert.equal(errors.length,1);
  const after=await f.gm.state();assert.deepEqual(after,before);
  assert.equal(f.db.prepare('SELECT committed FROM previews WHERE token=?').get(fault.token).committed,0);
  f.db.exec('DROP TRIGGER simulate_failure');
  assert.equal((await f.gm.request('/api/round/commit','POST',{token:fault.token})).status,200);
  assert.equal((await f.gm.state()).round,1);
});

test('Spieler verwalten, Passwort ändern und sämtliche alten Sitzungen widerrufen', async t => {
  const f=await fixture(t), a=await f.empire('A'), b=await f.empire('B'), player=await f.player('Pilot',a.id);
  const duplicate=await f.gm.request('/api/users','POST',{username:'pilot',password,empire_id:a.id,revision:(await f.gm.state()).revision});assert.equal(duplicate.status,400);
  const playerId=(await f.gm.state()).users.find(x=>x.username==='Pilot').id;
  await f.write(`/users/${playerId}`,{empire_id:b.id,password:''},'PUT');
  assert.equal((await player.request('/api/state')).status,401);
  await player.login('Pilot');assert.equal((await player.state()).empires[0].id,b.id);
  const pass2=randomBytes(20).toString('hex');
  assert.equal((await player.request('/api/password','POST',{current:'wrong',password:pass2})).status,400);
  assert.equal((await player.request('/api/password','POST',{current:password,password:pass2})).status,200);
  assert.equal((await player.request('/api/state')).status,401);
  assert.equal((await player.request('/api/login','POST',{username:'Pilot',password})).status,401);
  await player.login('Pilot',pass2);
  await f.write(`/users/${playerId}`,{empire_id:b.id,password},'PUT');
  assert.equal((await player.request('/api/state')).status,401);
  await player.login('Pilot');
});

test('Planeten, Flotten und Berichte bearbeiten; Besitz, Schiffe, Suche-Daten und Löschung', async t => {
  const f=await fixture(t), a=await f.empire('A'), b=await f.empire('B');
  const playerA=await f.player('A-Spieler',a.id),playerB=await f.player('B-Spieler',b.id);
  const payload={kind:'fleet',name:'Erste Flotte',description:'Patrouille',empire_id:a.id,visibility:'empire',visibility_realms:[a.id],details:{type:'Aufklärung',mapId:'F-12',ships:[{name:'Aurora',type:'Korvette',status:'Beschädigt'}]}};
  const {id}=await f.write('/records',payload);
  assert.equal((await playerA.state()).records[0].details.ships[0].status,'Beschädigt');assert.equal((await playerB.state()).records.length,0);
  await f.write(`/records/${id}`,{...payload,empire_id:b.id,visibility_realms:[b.id],details:{...payload.details,ships:[{name:'Aurora',type:'Korvette',status:'Repariert'}]}},'PUT');
  assert.equal((await playerA.state()).records.length,0);assert.equal((await playerB.state()).records[0].details.ships[0].status,'Repariert');
  await f.write('/records',{kind:'report',name:'<script>alert(1)</script>',description:'Geheimes Dossier',empire_id:b.id,visibility:'secret',details:{}});
  assert.equal((await playerB.state()).records.length,1);
  await f.write(`/records/${id}`,{},'DELETE');assert.equal((await playerB.state()).records.length,0);
});

test('Datenbank und Bilder bleiben erhalten; Sicherung lässt sich vollständig öffnen', async t => {
  const f=await fixture(t), {id}=await f.empire('Persistenz');
  await f.write(`/images/empire/${id}`,{data:png});
  const checkpoint=f.db.prepare('PRAGMA integrity_check').get();assert.equal(checkpoint.integrity_check,'ok');
  const backupDir=await createBackup(f.dataDir,join(f.root,'backups'));
  const copy=new DatabaseSync(join(backupDir,'sternarchiv.sqlite'));
  try {
    const empire=copy.prepare('SELECT * FROM empires WHERE id=?').get(id);assert.equal(empire.name,'Persistenz');
    assert.deepEqual(readFileSync(join(backupDir,'images',empire.image)),Buffer.from(png,'base64'));
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  } finally {copy.close();}
  const restarted=createApp({dataDir:f.dataDir});
  try {assert.equal(restarted.db.prepare('SELECT name FROM empires WHERE id=?').get(id).name,'Persistenz');assert.ok(existsSync(join(f.dataDir,'sternarchiv.sqlite')));}
  finally {restarted.db.close();}
});

test('Statische Oberfläche, Sicherheitsheader, kein öffentlicher Dateizugriff und Login-Limit', async t => {
  const f=await fixture(t), guest=f.client();
  const home=await guest.request('/');assert.equal(home.status,200);assert.ok(home.data.toString().includes('lang="de"'));
  assert.ok(home.headers.get('content-security-policy').includes("script-src 'self'"));assert.equal(home.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await guest.request('/app.js')).status,200);assert.equal((await guest.request('/style.css')).status,200);
  for(const path of ['/data/sternarchiv.sqlite','/lib/auth.mjs','/.git/config','/api/../data/sternarchiv.sqlite'])assert.notEqual((await guest.request(path)).status,200);
  for(let i=0;i<8;i++)assert.equal((await guest.request('/api/login','POST',{username:'Nobody',password:'not valid'})).status,401);
  assert.equal((await guest.request('/api/login','POST',{username:'Nobody',password:'not valid'})).status,429);
});
