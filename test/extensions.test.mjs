import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {mkdtempSync,rmSync,readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server.mjs';
import {hashPassword,canRead,canReadRecord} from '../lib/auth.mjs';
import {openDatabase} from '../lib/database.mjs';
import {configuration,clientAddress} from '../lib/config.mjs';
import {validateImage} from '../lib/images.mjs';
import {createBackup} from '../scripts/backup.mjs';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=';
function removeTemporary(root) {
  const absolute=resolve(root),parent=resolve(tmpdir());assert.ok(absolute.startsWith(parent+'\\')||absolute.startsWith(parent+'/'));assert.ok(absolute.includes('sternarchiv-v2-'));rmSync(root,{recursive:true,force:true});
}
function temporary(t) {
  const root=mkdtempSync(join(tmpdir(),'sternarchiv-v2-'));
  if(t)t.after(()=>removeTemporary(root));return root;
}
async function fixture(t,options={}) {
  const root=temporary(), dataDir=join(root,'data'),app=createApp({dataDir,...options}),password=randomBytes(20).toString('hex');
  app.db.prepare("INSERT INTO users VALUES (?,?,?,'gm',NULL)").run(randomUUID(),'GM',hashPassword(password));
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  t.after(async()=>{app.server.closeAllConnections();await new Promise(r=>app.server.close(r));app.db.close();removeTemporary(root);});
  const url=`http://127.0.0.1:${app.server.address().port}`;
  function client(){let cookie='',csrf='';return {
    async req(path,method='GET',body,headers={}){
      const r=await new Promise((resolve,reject)=>{
        const request=httpRequest(url+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Sternarchiv':'1','X-CSRF-Token':csrf,Cookie:cookie,...(body!==undefined?{'Content-Length':Buffer.byteLength(JSON.stringify(body))}:{}),...headers}},response=>{
          const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,headers:{get:name=>{const v=response.headers[name.toLowerCase()];return Array.isArray(v)?v.join('; '):v;}},json:async()=>JSON.parse(Buffer.concat(chunks).toString()),arrayBuffer:async()=>Buffer.concat(chunks)}));
        });request.on('error',reject);request.end(body!==undefined?JSON.stringify(body):undefined);
      });
      if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
      const data=r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer());
      if(path==='/session')csrf=data.csrf;
      return {status:r.status,data,headers:r.headers};
    },
    async login(username='GM',headers={}){const r=await this.req('/login','POST',{username,password},headers);assert.equal(r.status,200,JSON.stringify(r.data));await this.req('/session','GET',undefined,headers);return r;},
    async state(){const r=await this.req('/state');assert.equal(r.status,200);return r.data;}
  };}
  const gm=client(); if(!options.production&&!options.publicUrl)await gm.login();
  const write=async(path,data,method='POST')=>{const revision=(await gm.state()).revision;const r=await gm.req(path,method,{...data,revision});assert.ok(r.status<300,JSON.stringify(r));return r.data;};
  const empire=async name=>(await write('/empires',{name,species:'',description:'',visibility:'public'})).id;
  const player=async(name,empire_id)=>{await write('/users',{username:name,empire_id,password});const c=client();await c.login(name);return c;};
  return {...app,root,dataDir,url,client,gm,write,empire,player};
}

test('Mehrreich-Freigaben A+B ohne C; Besitzerwechsel verändert keine Freigabe; Notizen bleiben geheim',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),c=await f.empire('C');
  const pa=await f.player('A1',a),pb=await f.player('B1',b),pc=await f.player('C1',c);
  const payload={kind:'planet',name:'Geteilte Welt',description:'Bekannte Welt',empire_id:c,visibility:'empire',visibility_realms:[a,b],gm_notes:'STRIKT GEHEIM',details:{}};
  const {id}=await f.write('/records',payload);
  for(const p of [pa,pb]){const s=await p.state();assert.ok(s.records.some(r=>r.id===id));assert.ok(!JSON.stringify(s).includes('STRIKT GEHEIM'));assert.equal((await p.req(`/records/${id}`)).status,200);}
  assert.equal((await pc.req(`/records/${id}`)).status,404);assert.equal((await pc.state()).records.length,0);
  await f.write(`/images/record/${id}`,{data:png});
  assert.equal((await pa.req(`/images/record/${id}`)).status,200);assert.equal((await pc.req(`/images/record/${id}`)).status,404);
  await f.write(`/records/${id}`,{...payload,empire_id:a},'PUT');
  assert.equal((await pb.req(`/records/${id}`)).status,200);assert.equal((await pc.req(`/records/${id}`)).status,404);
  await f.write(`/records/${id}`,{...payload,visibility_realms:[]},'PUT');
  assert.equal((await pa.req(`/records/${id}`)).status,404);assert.equal((await pb.req(`/images/record/${id}`)).status,404);
  await f.write(`/records/${id}`,{...payload,visibility:'secret'},'PUT');
  assert.equal((await pa.req(`/records/${id}`)).status,404);assert.equal((await f.gm.req(`/records/${id}`)).data.gm_notes,'STRIKT GEHEIM');
});

test('Neue Objekte bleiben standardmäßig geheim; Wirtschafts- und Forschungsfreigaben separat',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),c=await f.empire('C');
  const pa=await f.player('A',a),pb=await f.player('B',b),pc=await f.player('C',c);
  const {id}=await f.write('/empires',{name:'Geheim',species:'',description:''});
  const r=await f.write('/records',{kind:'planet',name:'Neu',description:'',empire_id:a,details:{}});
  assert.ok(!(await pa.state()).empires.some(x=>x.id===id));assert.equal((await pa.req(`/records/${r.id}`)).status,404);
  await f.write(`/empires/${id}`,{name:'Geteiltes Reich',species:'',description:'',visibility:'empire',visibility_realms:[a,b],economy_visibility:'empire',economy_realms:[a],research_visibility:'empire',research_realms:[b],gm_notes:'VERSTECKT'},'PUT');
  const sa=(await pa.state()).empires.find(x=>x.id===id),sb=(await pb.state()).empires.find(x=>x.id===id);
  assert.ok(sa.resources);assert.equal(sa.research,undefined);assert.equal(sb.resources,undefined);assert.ok(sb.research);assert.equal(sa.gm_notes,undefined);
  assert.ok(!(await pc.state()).empires.some(x=>x.id===id));
});

test('Evententwürfe und Bilder sind geheim; individuelle Bestätigung, Offline-Login und aktuelle Ankündigung',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),c=await f.empire('C');
  const pa=await f.player('A1',a),pa2=await f.player('A2',a),pb=await f.player('B',b),pc=await f.player('C',c);
  await pa2.req('/logout','POST',{});
  const payload={kind:'report',name:'Kontakt',description:'Absatz 1\n\nAbsatz 2',empire_id:c,visibility:'empire',visibility_realms:[a,b],status:'draft',popup:true,gm_notes:'INTERN',details:{},images:[{data:png},{data:png}]};
  const {id}=await f.write('/records',payload);
  let admin=(await f.gm.req(`/records/${id}`)).data;
  const imageUrl=admin.images[0].url.replace('/api','');
  assert.equal((await pa.req(`/records/${id}`)).status,404);assert.equal((await pa.req(imageUrl)).status,404);assert.equal((await pa.req('/notifications')).data.events.length,0);
  await f.write(`/records/${id}`,{...payload,status:'published',images:admin.images.map(i=>({id:i.id}))},'PUT');
  const first=(await pa.req('/notifications')).data.events[0].id;
  assert.equal((await pc.req(`/announcements/${first}`)).status,404);assert.equal((await pa.req(imageUrl)).status,200);
  assert.equal((await f.client().req(imageUrl)).status,401);
  const delivered=(await pa.req(`/announcements/${first}`)).data;
  assert.equal(delivered.record.description,payload.description);assert.equal(delivered.record.gm_notes,undefined);
  await pa.req(`/announcements/${first}/confirm`,'POST',{});
  assert.equal((await pa.req('/notifications')).data.events.length,0);assert.equal((await pb.req('/notifications')).data.events.length,1);
  await pa.login('A1');assert.equal((await pa.req('/notifications')).data.events.length,0);
  await pa2.login('A2');assert.equal((await pa2.req('/notifications')).data.events[0].id,first);
  admin=(await f.gm.req(`/records/${id}`)).data;
  assert.equal(admin.announcements[0].players.filter(p=>p.confirmed_at).length,1);
  assert.equal(admin.announcements[0].players.length,3);
  const edit={...payload,status:'published',images:admin.images.map(i=>({id:i.id})),description:'Bearbeiteter Text'};
  await f.write(`/records/${id}`,edit,'PUT');assert.equal((await pa.req('/notifications')).data.events.length,0);
  const second=(await f.write(`/records/${id}/announce`,{})).id;
  assert.notEqual(second,first);assert.equal((await pa.req('/notifications')).data.events[0].id,second);
  assert.equal((await pa.req(`/announcements/${first}`)).status,404);
  const latest=(await f.gm.req(`/records/${id}`)).data;
  assert.equal(latest.announcements.length,2);assert.equal(latest.announcements[0].players.filter(p=>p.confirmed_at).length,0);
  await f.write(`/records/${id}`,{...edit,visibility_realms:[a,b,c]},'PUT');assert.equal((await pc.req('/notifications')).data.events[0].id,second);
  await f.write(`/records/${id}`,{...edit,visibility_realms:[b]},'PUT');
  assert.equal((await pa.req('/notifications')).data.events.length,0);assert.equal((await pa.req(`/announcements/${second}`)).status,404);assert.equal((await pa.req(imageUrl)).status,404);
  assert.equal((await pa.req(`/announcements/${second}/confirm`,'POST',{})).status,404);
  assert.equal((await pa.req(`/records/${id}`)).status,404);
  assert.equal((await pb.req(`/records/${id}`)).status,200);
});

test('Event-Warteschlange, Bilder entfernen, keine Fremdbilder, Limits und tatsächliches Dateiformat',async t=>{
  const f=await fixture(t),a=await f.empire('A'),p=await f.player('Spieler',a);
  const body={kind:'report',name:'Event',description:'',empire_id:null,visibility:'public',status:'published',popup:true,details:{},images:[{data:png}]};
  const x=await f.write('/records',body),y=await f.write('/records',{...body,name:'Event 2'});
  const pending=(await p.req('/notifications')).data.events;assert.equal(pending.length,2);
  await p.req(`/announcements/${pending[0].id}/confirm`,'POST',{});assert.equal((await p.req('/notifications')).data.events[0].id,pending[1].id);
  const first=(await f.gm.req(`/records/${x.id}`)).data;
  const bad=await f.gm.req(`/records/${y.id}`,'PUT',{...body,revision:(await f.gm.state()).revision,images:[{id:first.images[0].id}]});assert.equal(bad.status,400);
  await f.write(`/records/${x.id}`,{...body,images:[]},'PUT');assert.equal((await p.req(first.images[0].url.replace('/api',''))).status,404);
  for(const data of [Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),Buffer.from([137,80,78,71,13,10,26,10,...Array(40).fill(0)]).toString('base64'),Buffer.alloc(6*1024*1024).toString('base64')]) {
    const r=await f.gm.req('/records','POST',{...body,revision:(await f.gm.state()).revision,images:[{data}]});assert.equal(r.status,400);
  }
  assert.throws(()=>validateImage('not a picture'));
  assert.equal(validateImage(png).ext,'png');
  const backupDir=await createBackup(f.dataDir,join(f.root,'backups'));const db=new DatabaseSync(join(backupDir,'sternarchiv.sqlite'));
  try{const image=db.prepare('SELECT filename FROM record_images LIMIT 1').get();assert.ok(readFileSync(join(backupDir,'images',image.filename)).length>0);}finally{db.close();}
});

test('Aktionen privat pro Spieler, Absender unverfälschbar, Status getrennt und Antworten persönlich',async t=>{
  const f=await fixture(t),a=await f.empire('A'),b=await f.empire('B'),p=await f.player('Pilot',a),same=await f.player('Mitspieler',a),other=await f.player('Fremder',b);
  const gameBefore=await f.gm.state();
  const result=await p.req('/actions','POST',{subject:'Erkundung',description:'Bitte Sektor prüfen',user_id:'GM',username:'GM',empire_id:b,round:999,status:'done'});
  assert.equal(result.status,201);const id=result.data.id;
  const saved=(await p.req(`/actions/${id}`)).data;
  assert.equal(saved.username,'Pilot');assert.equal(saved.empire_id,a);assert.equal(saved.round,gameBefore.round);assert.equal(saved.status,'open');assert.equal(saved.gm_read_at,null);
  for(const client of [same,other]){assert.equal((await client.req('/actions')).data.length,0);assert.equal((await client.req(`/actions/${id}`)).status,404);assert.equal((await client.req(`/actions/${id}/read`,'POST',{reply_ids:[]})).status,404);assert.equal((await client.state()).actions.length,0);}
  assert.equal((await p.req(`/actions/${id}`,'PUT',{status:'done'})).status,403);
  assert.equal((await p.req(`/actions/${id}`,'DELETE',{})).status,403);
  assert.equal((await f.gm.req('/notifications')).data.actions,1);
  await f.gm.req(`/actions/${id}/read`,'POST',{});
  const opened=(await f.gm.req(`/actions/${id}`)).data;assert.ok(opened.gm_read_at);assert.equal(opened.status,'open');
  assert.equal((await f.gm.req('/notifications')).data.actions,0);
  await f.gm.req(`/actions/${id}`,'PUT',{status:'working',reply:'Privater Auftrag genehmigt'});
  assert.equal((await p.req('/notifications')).data.actions,1);assert.equal((await same.req('/notifications')).data.actions,0);
  const updated=(await p.req(`/actions/${id}`)).data;
  assert.equal(updated.replies[0].description,'Privater Auftrag genehmigt');
  await p.req(`/actions/${id}/read`,'POST',{reply_ids:updated.replies.map(r=>r.id)});
  assert.equal((await p.req('/notifications')).data.actions,0);
  await f.gm.req(`/actions/${id}`,'PUT',{status:'done'});
  const gameAfter=await f.gm.state();assert.deepEqual(gameAfter.empires,gameBefore.empires);assert.equal(gameAfter.round,gameBefore.round);assert.equal(gameAfter.revision,gameBefore.revision);
});

test('Produktionskonfiguration und Proxy-Vertrauen sind ausdrücklich begrenzt',async t=>{
  assert.throws(()=>configuration('.', {NODE_ENV:'production'}));
  assert.throws(()=>configuration('.', {NODE_ENV:'production',PUBLIC_BASE_URL:'http://pnp.example.com',TRUSTED_PROXIES:'127.0.0.1'}));
  assert.throws(()=>configuration('.', {TRUSTED_PROXIES:'*'}));
  const config=configuration('.',{NODE_ENV:'production',PUBLIC_BASE_URL:'https://pnp.example.com',TRUSTED_PROXIES:'127.0.0.1'});assert.equal(config.secureCookie,true);
  const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'203.0.113.5'}};
  assert.equal(clientAddress(req,[]),'127.0.0.1');assert.equal(clientAddress(req,['127.0.0.1']),'203.0.113.5');
  const f=await fixture(t,{production:true,publicUrl:'https://pnp.example.com',trustedProxies:['127.0.0.1'],secureCookie:true});
  const headers={Host:'pnp.example.com','X-Forwarded-Proto':'https','X-Forwarded-For':'203.0.113.5',Origin:'https://pnp.example.com'};
  assert.equal((await f.client().req('/session','GET',undefined,{Host:'pnp.example.com'})).status,403);
  const user=f.client(),login=await user.login('GM',headers);assert.ok(login.headers.get('set-cookie').includes('Secure'));assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
  assert.equal((await user.req('/round/preview','POST',{}, {...headers,Origin:'http://pnp.example.com'})).status,403);
  assert.equal((await user.req('/state','GET',undefined,headers)).status,200);
  const untrusted=await fixture(t,{production:true,publicUrl:'https://pnp.example.com',trustedProxies:['192.0.2.1'],secureCookie:true});
  assert.equal((await untrusted.client().req('/session','GET',undefined,headers)).status,403);
});

test('Migration erhält Version-1-Daten/Freigaben, Bilder, Passwörter und Eigentum; wiederholbar',async t=>{
  const root=temporary(t);mkdirSync(join(root,'images'));
  const db=new DatabaseSync(join(root,'sternarchiv.sqlite'));
  db.exec(readFileSync(new URL('./fixtures/v1.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO empires VALUES ('a','A','Spezies','Beschreibung','empire','secret','public','old.png',12,'Projekt','Forschung',35,100);
    INSERT INTO empires VALUES ('b','B','','','public','empire','secret',NULL,0,'','',0,100);
    INSERT INTO empires VALUES ('c','C','','','secret','secret','secret',NULL,0,'','',0,100);
    INSERT INTO users VALUES ('gm','Leitung','stored-password-hash','gm',NULL);
    INSERT INTO users VALUES ('pa','Spieler','player-password-hash','player','a');
    INSERT INTO resources VALUES ('a','energy',-12,3);
    INSERT INTO records VALUES ('planet','planet','a','Planet','Text','empire',NULL,'{}');
    INSERT INTO records VALUES ('report','report','a','Bericht','Alt','public','old.png','{}');
    INSERT INTO records VALUES ('secret','fleet','b','Geheim','Alt','secret',NULL,'{"ships":[]}');
    INSERT INTO records VALUES ('none','planet',NULL,'Ohne Reich','','empire',NULL,'{}');
    INSERT INTO audit VALUES (1,'2026-01-01','Leitung','a','Alt','{}','Grund');
    INSERT INTO sessions VALUES ('old-token','pa','csrf',9999999999999);
    UPDATE meta SET round=7,revision=19;
    PRAGMA user_version=1;`);
  db.close();writeFileSync(join(root,'images','old.png'),Buffer.from(png,'base64'));
  const updated=openDatabase(root);
  try{
    assert.equal(updated.prepare('PRAGMA user_version').get().user_version,2);
    const a=updated.prepare("SELECT * FROM empires WHERE id='a'").get();assert.equal(a.visibility_realms,'["a"]');assert.equal(a.economy_visibility,'secret');assert.equal(a.progress,35);
    const owner={id:'pa',role:'player',empire_id:'a'},foreign={id:'pb',role:'player',empire_id:'b'};
    const planet=updated.prepare("SELECT * FROM records WHERE id='planet'").get();assert.equal(planet.empire_id,'a');assert.ok(canReadRecord(owner,planet));assert.ok(!canReadRecord(foreign,planet));
    assert.ok(!canReadRecord(owner,updated.prepare("SELECT * FROM records WHERE id='secret'").get()));assert.ok(!canReadRecord(owner,updated.prepare("SELECT * FROM records WHERE id='none'").get()));
    const report=updated.prepare("SELECT * FROM records WHERE id='report'").get();assert.equal(report.status,'published');assert.equal(report.popup,0);assert.ok(canReadRecord(foreign,report));
    assert.equal(updated.prepare('SELECT count(*) AS n FROM announcements').get().n,0);
    assert.equal(updated.prepare('SELECT filename FROM record_images').get().filename,'old.png');
    assert.equal(updated.prepare("SELECT password FROM users WHERE id='pa'").get().password,'player-password-hash');
    assert.equal(updated.prepare('SELECT stock FROM resources').get().stock,-12);assert.equal(updated.prepare('SELECT round FROM meta').get().round,7);
    assert.equal(updated.prepare('SELECT reason FROM audit').get().reason,'Grund');assert.equal(updated.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    assert.equal(readdirSync(join(root,'migration-backups')).length,1);
    assert.equal(updated.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{updated.close();}
  const again=openDatabase(root);again.close();assert.equal(readdirSync(join(root,'migration-backups')).length,1);
});
