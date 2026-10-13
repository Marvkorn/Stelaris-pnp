import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
import { hashPassword } from '../lib/auth.mjs';
import { openDatabase } from '../lib/database.mjs';
import { migrate } from '../lib/migrations.mjs';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=';
function remove(root) { assert.ok(resolve(root).startsWith(resolve(tmpdir())) && root.includes('sternarchiv-v3-'));rmSync(root,{recursive:true,force:true}); }
async function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'sternarchiv-v3-')),app=createApp({dataDir:root}),password=randomBytes(20).toString('hex');
  app.db.prepare("INSERT INTO users VALUES (?,?,?,'gm',NULL)").run(randomUUID(),'GM',hashPassword(password));
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.db.close();remove(root);});
  const url=`http://127.0.0.1:${app.server.address().port}`;
  async function client(name) {
    let cookie='',csrf='';
    const req=async(path,method='GET',body)=>{
      const response=await fetch(url+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-Sternarchiv':'1','X-CSRF-Token':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      const data=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
      if(path==='/session')csrf=data.csrf;
      return {status:response.status,data};
    };
    assert.equal((await req('/login','POST',{username:name,password})).status,200);await req('/session');
    return {req,state:async()=>{const r=await req('/state');assert.equal(r.status,200,JSON.stringify(r));return r.data;}};
  }
  const gm=await client('GM');
  const write=async(path,body={},method='POST')=>{const r=await gm.req(path,method,{...body,revision:(await gm.state()).revision});assert.ok(r.status<300,JSON.stringify(r));return r.data;};
  const empire=async name=>(await write('/empires',{name,species:'Spezies '+name,description:'',visibility:'public',economy_visibility:'public',research_visibility:'public'})).id;
  const player=async(name,empire_id)=>{await write('/users',{username:name,empire_id,password});return client(name);};
  const planet=async empire_id=>(await write('/records',{kind:'planet',name:'Planet',description:'',visibility:'secret',empire_id,details:{}})).id;
  const template=async(production={energy:10},upkeep={energy:2},duration=0)=>(await write('/templates',{name:'Testgebäude (Testwerte)',description:'Keine Spielbalance',production,upkeep,duration})).id;
  const preview=async()=>write('/round/preview');
  const round=async()=>{const p=await preview();await write('/round/commit',{token:p.token});return p;};
  return {...app,root,gm,write,empire,player,planet,template,preview,round};
}

test('Freie Ressourcen: Zuweisung, Vorratsbuchung, Audit, Archivierung und Schreibschutz',async t=>{
  const f=await fixture(t),a=await f.empire('A'),p=await f.player('Spieler',a);
  const kind=(await f.write('/resource-types',{name:'Kristalle',description:'Besondere Ressource',symbol:'◆'})).id;
  await f.write('/resource-assignments',{empire_id:a,kind});
  let s=await f.gm.state(),resources=Object.fromEntries(s.empires[0].resources.map(r=>[r.kind,{stock:r.kind===kind?20:0,income:r.kind===kind?2:0}]));
  await f.write(`/empires/${a}/resources`,{mode:'set',reason:'Fund',resources},'PUT');
  resources=Object.fromEntries((await f.gm.state()).empires[0].resources.map(r=>[r.kind,{stock:r.kind===kind?-7:0,income:r.base}]));
  await f.write(`/empires/${a}/resources`,{mode:'delta',reason:'Verbrauch',resources},'PUT');
  s=await f.gm.state();assert.equal(s.round,0);assert.equal(s.empires[0].resources.find(r=>r.kind===kind).stock,13);
  const entry=s.audit.find(x=>x.reason==='Verbrauch');assert.equal(entry.actor,'GM');assert.equal(entry.empire_id,a);assert.ok(entry.at);assert.deepEqual(entry.details.find(r=>r.kind===kind),{kind,resource:'Kristalle',before:20,change:-7,after:13,incomeBefore:2,incomeAfter:2});
  await f.write(`/resource-types/${kind}`,{name:'Kristalle',description:'',symbol:'',archived:true},'PUT');
  await f.round();assert.equal((await f.gm.state()).empires[0].resources.find(r=>r.kind===kind).stock,15);
  for(const path of [`/empires/${a}/resources`,'/resource-types','/resource-assignments','/templates','/buildings','/archive','/contacts','/lawbooks'])assert.equal((await p.req(path,path.includes('/resources')?'PUT':'POST',{})).status,403,path);
  assert.equal((await f.gm.req('/resource-assignments','POST',{revision:(await f.gm.state()).revision,empire_id:a,kind})).status,400);
});

test('Bauzeiten 0, 1, 2: Abschluss nach Buchung, neue Vorschau, erste Auszahlung und Doppelbestätigung',async t=>{
  const f=await fixture(t),a=await f.empire('A'),planet=await f.planet(a),template=await f.template();
  f.db.exec('UPDATE meta SET round=5');
  for(const duration of [0,1,2])await f.write('/buildings',{planet_id:planet,template_id:template,duration});
  let s=await f.gm.state();assert.equal(s.empires[0].resources.find(r=>r.kind==='energy').income,8);
  let p=await f.preview();assert.equal(p.round,6);assert.equal(p.completing.length,1);assert.equal(p.changes[0].resources.find(r=>r.kind==='energy').change,8);assert.equal(p.changes[0].nextIncome.resources.find(r=>r.kind==='energy').income,16);
  const commits=await Promise.all([f.gm.req('/round/commit','POST',{token:p.token}),f.gm.req('/round/commit','POST',{token:p.token})]);assert.deepEqual(commits.map(r=>r.status),[200,200]);assert.equal(commits.filter(r=>r.data.alreadyCommitted).length,1);
  s=await f.gm.state();assert.equal(s.round,6);assert.equal(s.buildings.filter(b=>b.status==='construction').length,1);
  await f.round();s=await f.gm.state();assert.equal(s.round,7);assert.equal(s.empires[0].resources.find(r=>r.kind==='energy').stock,24);assert.equal(s.empires[0].resources.find(r=>r.kind==='energy').income,24);
  await f.round();s=await f.gm.state();assert.equal(s.empires[0].resources.find(r=>r.kind==='energy').stock,48);
  assert.equal(f.db.prepare("SELECT income FROM resources WHERE empire_id=? AND kind='energy'").get(a).income,0);
});

test('Gebäudesnapshots, Stilllegung, Abriss, Abbruch, Bauzeitänderung, Sofortabschluss und Besitzerwechsel',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),planet=await f.planet(a),template=await f.template({energy:10,research:5},{energy:2},0);
  const building=(await f.write('/buildings',{planet_id:planet,template_id:template,duration:0})).id;
  await f.write(`/templates/${template}`,{name:'Geändert',description:'',production:{energy:999},upkeep:{},duration:10},'PUT');
  let s=await f.gm.state();assert.equal(s.buildings[0].production.energy,10);assert.equal(s.empires.find(e=>e.id===a).research.power,5);
  const stale=await f.preview();await f.write(`/buildings/${building}`,{status:'inactive'},'PUT');
  assert.equal((await f.gm.req('/round/commit','POST',{token:stale.token})).status,409);
  s=await f.gm.state();assert.equal(s.empires.find(e=>e.id===a).resources[0].income,0);assert.equal(s.empires.find(e=>e.id===a).resources[0].stock,0);
  await f.write(`/buildings/${building}`,{status:'active'},'PUT');
  await f.write(`/records/${planet}`,{kind:'planet',name:'Planet',description:'',empire_id:b,visibility:'secret',details:{}},'PUT');
  await f.round();s=await f.gm.state();assert.equal(s.empires.find(e=>e.id===a).resources[0].stock,0);assert.equal(s.empires.find(e=>e.id===b).resources[0].stock,8);
  await f.write(`/buildings/${building}`,{status:'demolished'},'PUT');await f.round();assert.equal((await f.gm.state()).empires.find(e=>e.id===b).resources[0].stock,8);
  const construction=(await f.write('/buildings',{planet_id:planet,template_id:template,duration:2})).id;
  await f.write(`/buildings/${construction}`,{remaining:5},'PUT');assert.equal((await f.gm.state()).buildings.find(b=>b.id===construction).finish_round,7);
  const before=(await f.gm.state()).round;
  const resources=Object.fromEntries((await f.gm.state()).empires.find(e=>e.id===b).resources.map(r=>[r.kind,{stock:1,income:r.base}]));
  await f.write(`/empires/${b}/resources`,{mode:'delta',resources},'PUT');assert.equal((await f.gm.state()).round,before);
  await f.write(`/buildings/${construction}`,{remaining:0},'PUT');assert.equal((await f.gm.state()).buildings.find(b=>b.id===construction).status,'active');
  const cancel=(await f.write('/buildings',{planet_id:planet,template_id:template,duration:2})).id;await f.write(`/buildings/${cancel}`,{status:'demolished'},'PUT');
  assert.equal((await f.gm.req(`/buildings/${cancel}`,'PUT',{revision:(await f.gm.state()).revision,status:'active'})).status,400);
  assert.equal((await f.gm.req('/buildings','POST',{revision:(await f.gm.state()).revision,planet_id:planet,template_id:template,duration:-1})).status,400);
});

test('Entdeckungen und Karten: Mehrreichfreigabe, geheime Links, direkte Bilder, Entzug und kein Originalpfad',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),c=await f.empire('C'),pa=await f.player('A1',a),pb=await f.player('B1',b),pc=await f.player('C1',c),planet=await f.planet(c);
  const payload={kind:'discovery',title:'Bekannter Hinweis',description:'Freigegebener Text',category:'Planeten entdeckt',round:0,visibility:'empire',visibility_realms:[a,b],link_kind:'planet',link_id:planet,images:[{data:png}]};
  const entry=(await f.write('/archive',payload)).id;
  for(const player of [pa,pb]){const s=await player.state();assert.equal(s.archive.length,1);assert.equal(s.archive[0].link_id,null);assert.equal(s.records.length,0);assert.ok(!JSON.stringify(s).includes(planet));}
  const image=(await f.gm.state()).archive[0].images[0].id;
  assert.equal((await pa.req(`/archive-images/${image}`)).status,200);assert.equal((await pc.req(`/archive-images/${image}`)).status,404);assert.equal((await pc.state()).archive.length,0);
  const template=await f.template();assert.equal((await pc.req(`/template-images/${template}`)).status,404);
  await f.write(`/archive/${entry}`,{...payload,images:[{id:image}],visibility_realms:[]},'PUT');assert.equal((await pa.req(`/archive-images/${image}`)).status,404);
  await f.write('/archive',{kind:'map',title:'Geheime Gesamtkarte',description:'',round:0,visibility:'secret',visibility_realms:[],images:[{data:png}]});
  const map=(await f.write('/archive',{kind:'map',title:'Teilkarte A',description:'',round:0,visibility:'empire',visibility_realms:[a],images:[{data:png}]})).id;
  const s=await pa.state();assert.equal(s.archive.length,1);assert.equal(s.archive[0].id,map);assert.equal((await pb.state()).archive.length,0);
  const filename=f.db.prepare('SELECT filename FROM archive_images LIMIT 1').get().filename;
  assert.equal((await pa.req('/images/'+filename)).status,403);
});

test('Gesetzbücher: private Vorschläge, gerichtete Kontakte, Freigabe und eigene Verfassung trotz geheimem Profil',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),pa=await f.player('A1',a),pa2=await f.player('A2',a),pb=await f.player('B1',b);
  const proposal=await pa.req('/proposals','POST',{empire_id:b,kind:'law',title:'Privater Vorschlag',content:'Geheimtext',status:'submitted'});assert.equal(proposal.status,200);
  const p=(await f.gm.state()).proposals[0];assert.equal(p.empire_id,a);assert.equal((await pa2.state()).proposals.length,0);assert.equal((await pb.state()).proposals.length,0);
  assert.equal((await pb.req(`/proposals/${p.id}`,'PUT',{title:'Angriff',content:'x',status:'draft',version:p.version})).status,404);
  assert.equal((await pa.req(`/proposals/${p.id}/decision`,'POST',{status:'approved',version:p.version})).status,403);
  await f.write(`/proposals/${p.id}/decision`,{status:'approved',version:p.version,comment:'Interner Prüfkommentar'});
  assert.equal((await pa.state()).lawNotices.length,1);assert.equal((await pa2.state()).lawNotices.length,0);
  assert.equal((await pa2.state()).lawbooks.find(x=>x.empire_id===a).laws.length,1);assert.ok(!(await pb.state()).lawbooks.some(x=>x.empire_id===a));
  await f.write('/lawbooks',{empire_id:a,published:true});assert.ok(!(await pb.state()).lawbooks.some(x=>x.empire_id===a));
  await f.write('/contacts',{source_id:a,target_id:b,known:true});assert.ok(!(await pb.state()).lawbooks.some(x=>x.empire_id===a));
  await f.write('/contacts',{source_id:b,target_id:a,known:true});assert.equal((await pb.state()).lawbooks.find(x=>x.empire_id===a).laws.length,1);assert.ok(!JSON.stringify(await pb.state()).includes('Interner Prüfkommentar'));
  await f.write(`/empires/${a}`,{name:'A',species:'',description:'',visibility:'secret'},'PUT');assert.ok(!(await pa.state()).empires.some(e=>e.id===a));assert.ok((await pa.state()).lawbooks.some(x=>x.empire_id===a));
  await f.write('/contacts',{source_id:b,target_id:a,known:false});assert.ok(!(await pb.state()).lawbooks.some(x=>x.empire_id===a));
});

test('Gesetzesnummern: parallele und wiederholte Genehmigung, Ablehnung, Rückgabe, Änderungen und Aufhebung',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),pa=await f.player('A1',a),pb=await f.player('B1',b);
  async function propose(client,title,extra={}){const r=await client.req('/proposals','POST',{kind:'law',title,content:title+' Text',status:'submitted',...extra});assert.equal(r.status,200,JSON.stringify(r));return (await f.gm.state()).proposals.find(p=>p.id===r.data.id);}
  const rejected=await propose(pa,'Abgelehnt');await f.write(`/proposals/${rejected.id}/decision`,{status:'rejected',version:rejected.version});
  const first=await propose(pa,'Früher eingereicht'),second=await propose(pa,'Zuerst genehmigt');
  await f.write(`/proposals/${second.id}/decision`,{status:'approved',version:second.version});
  let s=await f.gm.state();assert.equal(s.lawbooks.find(b=>b.empire_id===a).laws[0].title,'Zuerst genehmigt');
  const third=await propose(pa,'Drittes');
  const results=await Promise.all([first,third,first].map(p=>f.gm.req(`/proposals/${p.id}/decision`,'POST',{status:'approved',version:p.version})));
  assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(results.filter(r=>r.data.alreadyApproved).length,1);
  s=await f.gm.state();const laws=s.lawbooks.find(b=>b.empire_id===a).laws;assert.deepEqual(laws.map(l=>l.number),[1,2,3]);
  const other=await propose(pb,'Anderes Reich');await f.write(`/proposals/${other.id}/decision`,{status:'approved',version:other.version});assert.equal((await pb.state()).lawbooks.find(x=>x.empire_id===b).laws[0].number,1);
  const amendment=await propose(pa,'Neue Fassung',{law_id:laws[0].id});assert.equal((await pa.state()).lawbooks[0].laws[0].title,'Zuerst genehmigt');
  await f.write(`/proposals/${amendment.id}/decision`,{status:'revision',version:amendment.version,comment:'Bitte begründen'});
  let revised=(await pa.state()).proposals.find(p=>p.id===amendment.id);assert.equal(revised.status,'revision');
  assert.equal((await pa.req(`/proposals/${amendment.id}`,'PUT',{title:'Neue Fassung',content:'Begründeter Text',status:'submitted',version:revised.version})).status,200);
  revised=(await pa.state()).proposals.find(p=>p.id===amendment.id);await f.write(`/proposals/${revised.id}/decision`,{status:'approved',version:revised.version});
  let law=(await f.gm.state()).lawbooks.find(b=>b.empire_id===a).laws[0];assert.equal(law.number,1);assert.equal(law.version,2);assert.equal(law.versions.length,2);
  const staleAmendment=await propose(pa,'Veraltet',{law_id:law.id});await f.write(`/laws/${law.id}/repeal`);assert.equal((await f.gm.req(`/proposals/${staleAmendment.id}/decision`,'POST',{status:'approved',version:staleAmendment.version})).status,409);
  law=(await f.gm.state()).lawbooks.find(b=>b.empire_id===a).laws[0];assert.equal(law.status,'repealed');assert.equal(law.number,1);assert.equal(law.versions.length,3);
  const fourth=await propose(pa,'Viertes');await f.write(`/proposals/${fourth.id}/decision`,{status:'approved',version:fourth.version});assert.deepEqual((await f.gm.state()).lawbooks.find(b=>b.empire_id===a).laws.map(l=>l.number),[1,2,3,4]);
});

test('Verfassung: Genehmigung erforderlich, alte Fassung bleibt, konkurrierende Erstentwürfe konfliktfest',async t=>{
  const f=await fixture(t),a=await f.empire('A'),pa=await f.player('A1',a);
  const propose=async title=>{const r=await pa.req('/proposals','POST',{kind:'constitution',title,content:'Verfassungstext',status:'submitted'});return (await f.gm.state()).proposals.find(p=>p.id===r.data.id);};
  const one=await propose('Erste Verfassung'),two=await propose('Zweite Verfassung');
  assert.equal((await pa.state()).lawbooks[0].laws.length,0);
  await f.write(`/proposals/${one.id}/decision`,{status:'approved',version:one.version});assert.equal((await f.gm.req(`/proposals/${two.id}/decision`,'POST',{status:'approved',version:two.version})).status,409);
  await f.write(`/proposals/${two.id}/decision`,{status:'revision',version:two.version});let p=(await pa.state()).proposals.find(p=>p.id===two.id);
  await pa.req(`/proposals/${two.id}`,'PUT',{title:two.title,content:'Neue Fassung',status:'submitted',version:p.version});p=(await pa.state()).proposals.find(p=>p.id===two.id);
  assert.equal((await pa.state()).lawbooks[0].laws[0].title,one.title);
  await f.write(`/proposals/${two.id}/decision`,{status:'approved',version:p.version});const law=(await pa.state()).lawbooks[0].laws[0];assert.equal(law.title,two.title);assert.equal(law.number,null);assert.equal(law.version,2);
});

test('Migration v2 nach v3 bewahrt Konten, Freigaben, Nachrichten, Sitzungen und Spielstände samt Sicherung',t=>{
  const root=mkdtempSync(join(tmpdir(),'sternarchiv-v3-'));t.after(()=>remove(root));
  const db=new DatabaseSync(join(root,'sternarchiv.sqlite'));db.exec(readFileSync(new URL('./fixtures/v1.sql',import.meta.url),'utf8'));migrate(db,root,false);
  db.exec(`INSERT INTO empires(id,name,species,description,visibility,economy_visibility,research_visibility,visibility_realms) VALUES ('a','Alt','','','empire','secret','public','["a"]');
    INSERT INTO users VALUES ('p','Spieler','passworthash','player','a');
    INSERT INTO resources VALUES ('a','energy',123,7);
    INSERT INTO records(id,kind,empire_id,name,description,visibility,image,details,visibility_realms,status,popup) VALUES ('r','report','a','Event','Text','empire','old.png','{}','["a"]','published',1);
    INSERT INTO record_images VALUES ('img','r','old.png',0);
    INSERT INTO announcements VALUES ('n','r','2026-01-01','GM');
    INSERT INTO acknowledgements VALUES ('n','p','2026-01-02');
    INSERT INTO actions(id,user_id,username,empire_id,subject,description,at,round) VALUES ('act','p','Spieler','a','Privat','Text','2026-01-01',4);
    INSERT INTO action_replies VALUES ('reply','act','GM','Antwort','2026-01-02',NULL);
    INSERT INTO sessions VALUES ('session','p','csrf',9999999999999);
    UPDATE meta SET round=4;`);
  const tables=['empires','users','resources','records','record_images','announcements','acknowledgements','actions','action_replies','sessions','audit'];
  const snapshots=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));db.close();
  const upgraded=openDatabase(root);
  try{for(const table of tables)assert.deepEqual(upgraded.prepare(`SELECT * FROM ${table}`).all(),snapshots[table],table);assert.equal(upgraded.prepare('SELECT round FROM meta').get().round,4);assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,3);assert.equal(upgraded.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{upgraded.close();}
  assert.equal(readdirSync(join(root,'migration-backups')).length,1);const again=openDatabase(root);again.close();assert.equal(readdirSync(join(root,'migration-backups')).length,1);
});
