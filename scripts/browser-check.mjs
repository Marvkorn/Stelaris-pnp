// Optional browser smoke test. Uses the installed Microsoft Edge and Node's CDP WebSocket support.
// All accounts and images are temporary; no real campaign data is accessed.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { hashPassword } from '../lib/auth.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'sternarchiv-browser-'));
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!edge) throw new Error('Microsoft Edge wurde nicht gefunden.');
const app = createApp({ dataDir: join(temp, 'data') });
const password = randomBytes(18).toString('hex');
app.db.prepare("INSERT INTO users VALUES (?,?,?,'gm',NULL)").run(randomUUID(), 'Testleitung', hashPassword(password));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, ws, browserExited = false;
const errors = [];
try {
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const url = `http://127.0.0.1:${app.server.address().port}`;
  browser = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${join(temp, 'edge-profile')}`, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', error => errors.push(error.message));
  browser.on('exit', () => { browserExited = true; });
  const portFile = join(temp, 'edge-profile', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) { if (errors.length) throw new Error(errors.join('\n')); await delay(100); }
  if (!existsSync(portFile)) throw new Error('Edge-Debugschnittstelle nicht verfügbar.');
  const port = readFileSync(portFile, 'utf8').split(/\r?\n/)[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(x => x.type === 'page').webSocketDebuggerUrl);
  await once(ws, 'open');
  let nextId = 0; const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const p = pending.get(message.id); pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP-Zeitüberschreitung: ${method}`)); }, 10000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Browser wartet vergeblich auf: ${expression}\n${await evaluate('document.body.innerText')}`); };
  const click = async selector => { await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
  const fill = async (name, value, scope = '#modal') => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(scope + ' [name="' + name + '"]')});if(!el)throw new Error('Feld fehlt');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const save = async () => { await click('#modal button[type=submit]'); await wait('!document.querySelector("#modal").open'); await delay(80); };
  const screenshot = async name => { await delay(250); const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); mkdirSync(join(root, '.qa'), { recursive: true }); writeFileSync(join(root, '.qa', name), Buffer.from(r.data, 'base64')); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.navigate', { url });
  await wait('!!document.querySelector("#login-form")');
  await fill('username', 'Testleitung', '#login-form'); await fill('password', password, '#login-form'); await click('#login-form button[type=submit]');
  await wait('!!document.querySelector(".shell")');
  await click('[data-action="new-empire"]');
  await fill('name', 'Solarische Union'); await fill('species', 'Menschen · Terranische Konföderation'); await fill('description', 'Von den Ozeanen Terras bis an den Rand des Orionarms. Ein junges Reich auf der Suche nach seinem Platz zwischen den Sternen.');
  assert.equal(await evaluate('document.querySelector("[name=visibility]").value'),'secret');
  await fill('visibility','public');await fill('economy_visibility','public');await fill('research_visibility','public');await save();
  await click('[data-action="open-empire"]');
  await click('[data-action="resources"]');
  for (const [key, value] of Object.entries({ energy: 240, minerals: 160, alloys: 70, food: 110, influence: 35 })) { await fill(key + '_stock', value); await fill(key + '_income', key === 'energy' ? -250 : 12); }
  await fill('reason', 'Startvorräte der Kampagne'); await save();
  await click('[data-action="research"]'); await fill('power', 25); await fill('name', 'Hyperraumantriebe II'); await fill('description', 'Stabilere Sprungfelder für die nächste Expedition.'); await fill('progress', 60); await fill('required', 100); await save();
  await click('[data-action="new-planet"]'); await fill('name', 'Terra'); await fill('type', 'Kontinentalwelt'); await fill('mapId', 'SOL-01'); await fill('description', 'Die Heimat der Union. Blaue Ozeane, dichte Städte und der Sitz des Sternenrats.'); await save();
  await click('[data-action="new-fleet"]'); await fill('name', 'Erste Expeditionsflotte'); await fill('type', 'Erkundungsverband'); await fill('mapId', 'SOL-02'); await click('[data-action="add-ship"]');
  await evaluate(`document.querySelector('[data-ship=name]').value='Aurora';document.querySelector('[data-ship=type]').value='Korvette';document.querySelector('[data-ship=status]').value='Einsatzbereit';`); await save();
  await click('[data-action="new-report"]'); await fill('name', 'Ein Signal aus der Leere'); await fill('type', 'Forschungsbericht'); await fill('description', 'Die Sensoren der Aurora haben ein wiederkehrendes Muster registriert. Die Herkunft bleibt unbekannt.'); await save();
  const empireId = app.db.prepare('SELECT id FROM empires').get().id;
  await click('[data-action="image-empire"]');
  const pngPath = join(temp, 'test.png'); writeFileSync(pngPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=', 'base64'));
  const dom = await cdp('DOM.getDocument'); const fileInput = await cdp('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#modal input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [pngPath] }); await save();
  assert.ok(app.db.prepare('SELECT image FROM empires').get().image);
  // Prepare the existing report as an event using the actual multi-realm and image controls.
  const eventId=app.db.prepare("SELECT id FROM records WHERE kind='report'").get().id;
  await click(`[data-action="edit-record"][data-id="${eventId}"]`);
  await fill('visibility','empire');
  await evaluate(`document.querySelector('[name=visibility_realms][value="${empireId}"]').checked=true;document.querySelector('[name=popup]').checked=true;`);
  await fill('status','published');await fill('gm_notes','Diese Notiz bleibt geheim.');
  const dom2=await cdp('DOM.getDocument'),eventInput=await cdp('DOM.querySelector',{nodeId:dom2.root.nodeId,selector:'#event-files'});
  await cdp('DOM.setFileInputFiles',{nodeId:eventInput.nodeId,files:[pngPath]});
  await wait('document.querySelectorAll(".image-preview").length===1');
  await click('[data-remove-event-image="0"]');assert.equal(await evaluate('document.querySelectorAll(".image-preview").length'),0);
  await cdp('DOM.setFileInputFiles',{nodeId:eventInput.nodeId,files:[pngPath]});await wait('document.querySelectorAll(".image-preview").length===1');
  await save();
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM announcements').get().n,1);
  // The tiny image only tests upload; restore the visual placeholder for the screenshot.
  app.db.exec('UPDATE empires SET image=NULL');
  await click('[data-action="refresh"]');
  await screenshot('reich-desktop.png');
  await click('[data-page="overview"]');
  await screenshot('kommandozentrale-desktop.png');
  await click('[data-action="round"]');
  await wait('document.querySelector("#modal").innerText.includes("Fehlbestand")');
  await screenshot('rundenvorschau-desktop.png');
  await click('#confirm-round'); await wait('!document.querySelector("#modal").open');
  await wait('document.querySelector(".round").innerText.includes("1")');
  assert.equal(app.db.prepare('SELECT round FROM meta').get().round, 1);
  assert.equal(app.db.prepare("SELECT stock FROM resources WHERE kind='energy'").get().stock, -10);
  await click('[data-page="users"]'); await click('[data-action="new-user"]');
  await fill('username', 'Testpilot'); await fill('password', password); await fill('empire_id', empireId); await save();
  await click('[data-action="logout"]'); await wait('!!document.querySelector("#login-form")');
  await fill('username', 'Testpilot', '#login-form'); await fill('password', password, '#login-form'); await click('#login-form button[type=submit]'); await wait('!!document.querySelector(".shell")');
  await wait('document.querySelector("#event-modal").open');
  assert.equal(await evaluate('document.querySelector("#event-modal").innerText.includes("Diese Notiz bleibt geheim.")'),false);
  await screenshot('event-popup-desktop.png');
  await click('#event-modal [data-zoom]');await wait('document.querySelector("#image-modal").open');await click('#close-image');
  await click('#confirm-event');await wait('!document.querySelector("#event-modal").open');
  await cdp('Page.reload');await wait('!!document.querySelector(".shell")');await delay(400);
  assert.equal(await evaluate('document.querySelector("#event-modal").open'),false);
  assert.equal(await evaluate('!!document.querySelector("[data-action=round]")'), false);
  assert.equal(await evaluate('!!document.querySelector("[data-page=users]")'), false);
  await click('[data-action="open-empire"]'); assert.equal(await evaluate('!!document.querySelector("[data-action=resources]")'), false);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('reich-mobil.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= 390'), true, 'Mobile Seite läuft horizontal über.');
  await click('[data-page="actions"]');await click('[data-action="submit-action"]');await fill('subject','Erkundung des Orionarms');await fill('description','Ich möchte das Signal untersuchen.');await save();
  await wait('document.querySelector("#view").innerText.includes("Erkundung des Orionarms")');
  const actionId=app.db.prepare('SELECT id FROM actions').get().id;
  // Separate authenticated GM HTTP client simulates the GM working while the player stays online.
  const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Sternarchiv':'1'},body:JSON.stringify({username:'Testleitung',password})});
  const gmCookie=login.headers.get('set-cookie').split(';')[0];
  const gmSession=await (await fetch(url+'/api/session',{headers:{Cookie:gmCookie}})).json();
  const gmApi=async(path,method='GET',body)=>{
    const r=await fetch(url+'/api'+path,{method,headers:{Cookie:gmCookie,'Content-Type':'application/json','X-Sternarchiv':'1','X-CSRF-Token':gmSession.csrf},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;
  };
  await gmApi(`/actions/${actionId}`,'PUT',{status:'working',reply:'Die Aurora kann aufbrechen.'});
  await wait('document.querySelector("[data-page=actions]").innerText.includes("1 neu")');
  await click('[data-action="open-action"]');await wait('document.querySelector("#modal").innerText.includes("Die Aurora kann aufbrechen.")');await click('#modal [data-action="close"]');
  const before=await gmApi('/state');await gmApi(`/records/${eventId}/announce`,'POST',{revision:before.revision});
  await wait('document.querySelector("#event-modal").open');
  const now=await gmApi('/state'),eventRecord=now.records.find(x=>x.id===eventId);
  await gmApi(`/records/${eventId}`,'PUT',{...eventRecord,revision:now.revision,visibility:'secret',popup:!!eventRecord.popup});
  await wait('!document.querySelector("#event-modal").open');
  assert.equal(await evaluate('document.querySelector("#image-modal").open'),false);
  await click('[data-action="password"]'); await fill('current', password); await fill('password', password + 'new'); await fill('confirm', password + 'new'); await save();
  await wait('!!document.querySelector("#login-form")');
  assert.deepEqual(errors, []);
  console.log('Browserprüfung bestanden: bestehende Funktionen, Mehrreich-Auswahl, sichere Standardwerte, Evententwurf/Veröffentlichung, Bildvorschau/Entfernen/Zoom, Offline-Popup, Bestätigung nach Reload, erneute Ankündigung, Live-Entzug, private Aktionen/Antwort-Badge, mobile Ansicht und Passwortwechsel.');
  console.log('Screenshots: .qa/kommandozentrale-desktop.png, .qa/reich-desktop.png, .qa/rundenvorschau-desktop.png, .qa/reich-mobil.png');
  await cdp('Browser.close').catch(() => {});
} finally {
  ws?.close();
  if (browser && !browserExited) { browser.kill(); for (let i = 0; i < 30 && !browserExited; i++) await delay(100); }
  await new Promise(resolve => app.server.close(resolve)); app.db.close();
  const parent = resolve(tmpdir());
  assert.ok(resolve(temp).startsWith(parent + '\\') || resolve(temp).startsWith(parent + '/'));
  assert.ok(temp.includes('sternarchiv-browser-'));
  try { rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  catch { console.warn('Temporäres Edge-Profil konnte noch nicht entfernt werden:', temp); }
}
