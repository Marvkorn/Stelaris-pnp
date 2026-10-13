import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase, audit, bump, transaction } from './lib/database.mjs';
import { token, digest, hashPassword, checkPassword, canRead, canReadRecord } from './lib/auth.mjs';
import { HttpError, text, state, saveEmpire, saveResources, saveResearch, saveRecord, previewRound, commitRound, mutate, requireEmpire } from './lib/game.mjs';
import { recordView } from './lib/game.mjs';
import { notifications, announcementDetail, confirmAnnouncement, reannounce, actionList, actionDetail, submitAction, updateAction, markActionRead } from './lib/communication.mjs';
import { validateImage, storeImage } from './lib/images.mjs';
import { configuration, loadEnvironment, clientAddress } from './lib/config.mjs';
import { saveResourceType, assignResource, saveTemplate, saveBuilding } from './lib/economy.mjs';
import { saveArchive } from './lib/archive.mjs';
import { saveLawbook, saveContact, saveProposal, decideProposal, repealLaw, confirmLawNotice, lawState } from './lib/laws.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SESSION_MS = 12 * 60 * 60 * 1000;
export function createApp({ dataDir = resolve(ROOT, 'data'), secureCookie = false, publicUrl = null, trustedProxies = [], production = false } = {}) {
  const db = openDatabase(dataDir);
  const dummyPassword = hashPassword(token());
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const readBody = async req => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'JSON erforderlich.');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 36 * 1024 * 1024) throw new HttpError(413, 'Die Anfrage ist zu groß (maximal fünf Bilder mit je 5 MB).'); chunks.push(chunk); }
    try { const body = JSON.parse(Buffer.concat(chunks).toString()); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); return body; }
    catch { throw new HttpError(400, 'Ungültige JSON-Daten.'); }
  };
  const cookie = value => `session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? SESSION_MS / 1000 : 0}${secureCookie ? '; Secure' : ''}`;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (publicUrl && req.headers.host !== new URL(publicUrl).host) throw new HttpError(400, 'Unzulässiger Host.');
      if (production && (!trustedProxies.includes((req.socket.remoteAddress||'').replace(/^::ffff:/,'')) || req.headers['x-forwarded-proto'] !== 'https')) throw new HttpError(403, 'HTTPS über den konfigurierten Proxy erforderlich.');
      if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
      // Only explicit static assets are public. Uploaded pictures always pass authorization.
      const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/expansion.js':['expansion.js','text/javascript'], '/communication.js':['communication.js','text/javascript'], '/style.css': ['style.css', 'text/css'] };
      if (method === 'GET' && assets[path]) {
        res.writeHead(200, { 'Content-Type': `${assets[path][1]}; charset=utf-8` });
        return res.end(readFileSync(resolve(ROOT, 'public', assets[path][0])));
      }
      if (method === 'GET' && path === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const rawSession = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith('session='))?.slice(8);
      const session = rawSession && db.prepare('SELECT s.*,u.username,u.role,u.empire_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?').get(digest(rawSession), Date.now());
      const user = session ? { id: session.user_id, username: session.username, role: session.role, empire_id: session.empire_id } : null;
      if (method === 'GET' && path === '/api/session') return send(res, 200, { user, csrf: session?.csrf ?? null, initialized: !!db.prepare('SELECT id FROM users LIMIT 1').get() });
      // JSON + custom request header disallow browser cross-origin form submissions, including login CSRF.
      if (method !== 'GET') {
        if (req.headers['x-sternarchiv'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Unzulässiger Anfrageursprung.');
        if (req.headers.origin) {
          let origin;
          try { origin = new URL(req.headers.origin); } catch { throw new HttpError(403, 'Ungültiger Ursprung.'); }
          if (publicUrl ? origin.origin !== publicUrl : origin.host !== req.headers.host) throw new HttpError(403, 'Unzulässiger Anfrageursprung.');
        }
      }
      if (method === 'POST' && path === '/api/login') {
        const body = await readBody(req);
        const username = text(body.username, 'Benutzername', 80, true);
        const key = digest('user:'+username.toLowerCase());
        const now = Date.now();
        db.prepare('DELETE FROM login_attempts WHERE expires<?').run(now);
        const ipKey = digest(`ip:${clientAddress(req,trustedProxies)}`);
        const attempts=k=>db.prepare('SELECT count FROM login_attempts WHERE key=?').get(k)?.count??0;
        if (attempts(key) >= 8 || attempts(ipKey) >= 40) throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte 15 Minuten warten.');
        const account = db.prepare('SELECT * FROM users WHERE username=?').get(username);
        if (!checkPassword(body.password, account?.password ?? dummyPassword) || !account) {
          for (const k of [key, ipKey]) db.prepare('INSERT INTO login_attempts VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+1,expires=excluded.expires').run(k,1,now+15*60*1000);
          throw new HttpError(401, 'Benutzername oder Passwort ist falsch.');
        }
        db.prepare('DELETE FROM login_attempts WHERE key=?').run(key);
        const sessionToken = token(), csrf = token();
        db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
        if (rawSession) db.prepare('DELETE FROM sessions WHERE token=?').run(digest(rawSession));
        db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(sessionToken), account.id, csrf, now + SESSION_MS);
        res.setHeader('Set-Cookie', cookie(sessionToken));
        return send(res, 200, { ok: true });
      }
      if (!user) throw new HttpError(401, 'Bitte anmelden.');
      if (method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) throw new HttpError(403, 'Die Sitzung ist ungültig. Bitte neu anmelden.');
      if (method === 'POST' && path === '/api/logout') { db.prepare('DELETE FROM sessions WHERE token=?').run(session.token); res.setHeader('Set-Cookie', cookie('')); return send(res, 200, { ok: true }); }
      if (method === 'GET' && path === '/api/state') return send(res, 200, state(db, user));
      if (method === 'GET' && path === '/api/law-state') return send(res,200,lawState(db,user));
      const proposalMatch = path.match(/^\/api\/proposals(?:\/([a-zA-Z0-9-]+))?(\/decision)?$/);
      if (proposalMatch && ['POST','PUT'].includes(method)) {
        const body = await readBody(req);
        return send(res,200,proposalMatch[2] ? decideProposal(db,user,proposalMatch[1],body) : saveProposal(db,user,body,proposalMatch[1]));
      }
      const noticeMatch = path.match(/^\/api\/law-notices\/([a-zA-Z0-9-]+)$/);
      if (noticeMatch && method === 'POST') return send(res,200,confirmLawNotice(db,user,noticeMatch[1]));
      const archiveImage = path.match(/^\/api\/archive-images\/([a-zA-Z0-9-]+)$/);
      const templateImage = path.match(/^\/api\/template-images\/([a-zA-Z0-9-]+)$/);
      if (method === 'GET' && (archiveImage || templateImage)) {
        let filename;
        if (archiveImage) {
          const asset = db.prepare('SELECT i.filename,a.visibility,a.visibility_realms FROM archive_images i JOIN archive_entries a ON a.id=i.entry_id WHERE i.id=?').get(archiveImage[1]);
          if (!asset || !canRead(user,asset.visibility,asset.visibility_realms)) throw new HttpError(404,'Bild nicht gefunden.');
          filename = asset.filename;
        } else {
          if (user.role !== 'gm') throw new HttpError(404,'Bild nicht gefunden.');
          filename = db.prepare('SELECT image FROM building_templates WHERE id=?').get(templateImage[1])?.image;
        }
        if (!filename || !existsSync(resolve(dataDir,'images',filename))) throw new HttpError(404,'Bild nicht gefunden.');
        res.writeHead(200,{'Content-Type':{png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[filename.split('.').at(-1)]});
        return res.end(readFileSync(resolve(dataDir,'images',filename)));
      }
      if (method === 'GET' && path === '/api/notifications') return send(res, 200, notifications(db,user));
      const announcementMatch=path.match(/^\/api\/announcements\/([a-zA-Z0-9-]+)(\/confirm)?$/);
      if(announcementMatch && method==='GET' && !announcementMatch[2]) return send(res,200,announcementDetail(db,user,announcementMatch[1]));
      if(announcementMatch && method==='POST' && announcementMatch[2]) return send(res,200,confirmAnnouncement(db,user,announcementMatch[1]));
      if(path==='/api/actions' && method==='GET')return send(res,200,actionList(db,user));
      if(path==='/api/actions' && method==='POST')return send(res,201,submitAction(db,user,await readBody(req)));
      const actionMatch=path.match(/^\/api\/actions\/([a-zA-Z0-9-]+)(\/read)?$/);
      if(actionMatch) {
        if(method==='GET'&&!actionMatch[2])return send(res,200,actionDetail(db,user,actionMatch[1]));
        if(method==='POST'&&actionMatch[2])return send(res,200,markActionRead(db,user,actionMatch[1],await readBody(req)));
        if(method==='PUT'&&!actionMatch[2])return send(res,200,updateAction(db,user,actionMatch[1],await readBody(req)));
      }
      const imageAsset=path.match(/^\/api\/record-images\/([a-zA-Z0-9-]+)$/);
      if(method==='GET'&&imageAsset) {
        const asset=db.prepare('SELECT * FROM record_images WHERE id=?').get(imageAsset[1]);
        const r=asset&&db.prepare('SELECT * FROM records WHERE id=?').get(asset.record_id);
        if(!asset||!canReadRecord(user,r))throw new HttpError(404,'Bild nicht gefunden.');
        const file=resolve(dataDir,'images',asset.filename);
        if(!existsSync(file))throw new HttpError(404,'Bilddatei fehlt.');
        res.writeHead(200,{'Content-Type':{png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[asset.filename.split('.').at(-1)]});return res.end(readFileSync(file));
      }
      const detailMatch=path.match(/^\/api\/records\/([a-zA-Z0-9-]+)$/);
      if(method==='GET'&&detailMatch)return send(res,200,recordView(db,user,db.prepare('SELECT * FROM records WHERE id=?').get(detailMatch[1])));
      if (method === 'POST' && path === '/api/password') {
        const body = await readBody(req);
        const old = db.prepare('SELECT password FROM users WHERE id=?').get(user.id);
        if (!checkPassword(body.current, old.password)) throw new HttpError(400, 'Das bisherige Passwort stimmt nicht.');
        let hashed;
        try { hashed = hashPassword(body.password); } catch (e) { throw new HttpError(400, e.message); }
        transaction(db, () => {
          db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, user.id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        });
        res.setHeader('Set-Cookie', cookie(''));
        return send(res, 200, { ok: true });
      }
      const imageMatch = path.match(/^\/api\/images\/(empire|record)\/([a-zA-Z0-9-]+)$/);
      if (imageMatch) {
        const [, kind, id] = imageMatch;
        const table = kind === 'empire' ? 'empires' : 'records';
        const item = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
        if (!item || !(kind==='record'?canReadRecord(user,item):canRead(user,item.visibility,item.visibility_realms))) throw new HttpError(404, 'Bild nicht gefunden.');
        if (method === 'GET') {
          if (!item.image) throw new HttpError(404, 'Kein Bild hinterlegt.');
          const file = resolve(dataDir, 'images', item.image);
          if (!existsSync(file)) throw new HttpError(404, 'Bilddatei fehlt.');
          const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[item.image.split('.').at(-1)];
          res.writeHead(200, { 'Content-Type': mime }); return res.end(readFileSync(file));
        }
        if (user.role !== 'gm') throw new HttpError(403, 'Nur die Spielleitung darf Bilder bearbeiten.');
        if (method === 'POST') {
          const body = await readBody(req);
          if(kind==='record'&&item.kind==='report')throw new HttpError(400,'Eventbilder im Eventformular verwalten.');
          const validated=validateImage(body.data);
          const result = mutate(db, body.revision, () => {
            const filename = storeImage(dataDir,validated);
            db.prepare(`UPDATE ${table} SET image=? WHERE id=?`).run(filename, id);
            audit(db, user, kind === 'empire' ? id : item.empire_id, 'Bild geändert', { kind, id });
            return { ok: true };
          });
          return send(res, 200, result);
        }
      }
      if (user.role !== 'gm') throw new HttpError(403, 'Nur die Spielleitung darf Spieldaten ändern.');
      const body = method === 'GET' ? {} : await readBody(req);
      const expansionMatch = path.match(/^\/api\/(resource-types|templates|buildings|archive)(?:\/([a-zA-Z0-9-]+))?$/);
      if (expansionMatch && ['POST','PUT'].includes(method)) {
        const handlers = { 'resource-types':saveResourceType, templates:saveTemplate, buildings:saveBuilding, archive:saveArchive };
        return send(res,200,handlers[expansionMatch[1]](db,user,body,expansionMatch[2],dataDir));
      }
      if (method === 'POST' && path === '/api/resource-assignments') return send(res,200,assignResource(db,user,body));
      if (method === 'POST' && path === '/api/lawbooks') return send(res,200,saveLawbook(db,user,body));
      if (method === 'POST' && path === '/api/contacts') return send(res,200,saveContact(db,user,body));
      const repealMatch = path.match(/^\/api\/laws\/([a-zA-Z0-9-]+)\/repeal$/);
      if (method === 'POST' && repealMatch) return send(res,200,repealLaw(db,user,repealMatch[1],body));
      const announceMatch=path.match(/^\/api\/records\/([a-zA-Z0-9-]+)\/announce$/);
      if(method==='POST'&&announceMatch)return send(res,201,reannounce(db,user,announceMatch[1],body));
      if (method === 'POST' && path === '/api/round/preview') return send(res, 200, previewRound(db));
      if (method === 'POST' && path === '/api/round/commit') return send(res, 200, commitRound(db, user, body.token));
      if (method === 'POST' && path === '/api/empires') return send(res, 201, saveEmpire(db, user, body));
      const empireMatch = path.match(/^\/api\/empires\/([a-zA-Z0-9-]+)(?:\/(resources|research))?$/);
      if (method === 'PUT' && empireMatch) {
        const [, id, part] = empireMatch;
        return send(res, 200, part === 'resources' ? saveResources(db, user, body, id) : part === 'research' ? saveResearch(db, user, body, id) : saveEmpire(db, user, body, id));
      }
      if (method === 'POST' && path === '/api/records') return send(res, 201, saveRecord(db, user, body, undefined, dataDir));
      const recordMatch = path.match(/^\/api\/records\/([a-zA-Z0-9-]+)$/);
      if (method === 'PUT' && recordMatch) return send(res, 200, saveRecord(db, user, body, recordMatch[1],dataDir));
      if (method === 'DELETE' && recordMatch) return send(res, 200, mutate(db, body.revision, () => {
        const old = db.prepare('SELECT * FROM records WHERE id=?').get(recordMatch[1]);
        if (!old) throw new HttpError(404, 'Eintrag nicht gefunden.');
        if (db.prepare('SELECT id FROM buildings WHERE planet_id=? LIMIT 1').get(old.id)) throw new HttpError(409,'Planeten mit Gebäudehistorie bleiben erhalten. Ändere stattdessen ihre Sichtbarkeit.');
        db.prepare('DELETE FROM records WHERE id=?').run(old.id);
        audit(db, user, old.empire_id, 'Eintrag gelöscht', { id: old.id, name: old.name, kind: old.kind });
        return { ok: true };
      }));
      if (method === 'POST' && path === '/api/users') {
        let hashed;
        try { hashed = hashPassword(body.password); } catch (e) { throw new HttpError(400, e.message); }
        return send(res, 201, mutate(db, body.revision, () => {
          const username = text(body.username, 'Benutzername', 80, true);
          if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) throw new HttpError(400, 'Dieser Benutzername ist bereits vergeben.');
          const owner = requireEmpire(db, body.empire_id, true);
          db.prepare("INSERT INTO users VALUES (?,?,?,'player',?)").run(randomUUID(), username, hashed, owner);
          audit(db, user, owner, 'Spielerzugang erstellt', { username });
          return { ok: true };
        }));
      }
      const userMatch = path.match(/^\/api\/users\/([a-zA-Z0-9-]+)$/);
      if (method === 'PUT' && userMatch) return send(res, 200, mutate(db, body.revision, () => {
        const account = db.prepare("SELECT * FROM users WHERE id=? AND role='player'").get(userMatch[1]);
        if (!account) throw new HttpError(404, 'Spielerzugang nicht gefunden.');
        const owner = requireEmpire(db, body.empire_id, true);
        if (body.password) {
          let hashed;
          try { hashed = hashPassword(body.password); } catch (e) { throw new HttpError(400, e.message); }
          db.prepare('UPDATE users SET password=? WHERE id=?').run(hashed, account.id);
        }
        db.prepare('UPDATE users SET empire_id=? WHERE id=?').run(owner, account.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
        audit(db, user, owner, 'Spielerzugang geändert', { username: account.username, passwordReset: !!body.password });
        return { ok: true };
      }));
      throw new HttpError(404, 'Diese Adresse wurde nicht gefunden.');
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) send(res, error.status ?? 500, { error: error.status ? error.message : 'Interner Fehler. Bitte im Serverfenster nachsehen.' });
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, db };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (Number(process.versions.node.split('.')[0]) !== 24) { console.error('Bitte Node.js 24 LTS verwenden.'); process.exit(1); }
  loadEnvironment(ROOT);
  const config=configuration(ROOT), {port,host}=config;
  const { server, db } = createApp(config);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) { console.error('Noch kein Spielleiterzugang. Bitte zuerst Einrichtung.cmd ausführen.'); db.close(); process.exit(1); }
  server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `Port ${port} ist bereits belegt. Läuft Sternarchiv schon?` : err.message); db.close(); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`\nSTERNARCHIV · Kampagnenzentrum\nAdresse: ${config.publicUrl||`http://localhost:${port}`}\nBeenden: Strg+C. Alle Änderungen bleiben gespeichert.\n`));
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
