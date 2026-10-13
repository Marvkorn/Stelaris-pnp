const $ = selector => document.querySelector(selector);
const app = $('#app'), modal = $('#modal');
const resourceNames = { energy: 'Energie', minerals: 'Mineralien', alloys: 'Legierungen', food: 'Nahrung / Versorgung', influence: 'Einfluss' };
const visibilityNames = { secret: 'Nur Spielleitung', public: 'Alle Spieler', empire: 'Ausgewählte Reiche' };
const kindNames = { planet: 'Planet', fleet: 'Flotte', report: 'Event' };
const pageNames = { overview: 'Kommandozentrale', empires: 'Reiche', planet: 'Planeten', fleet: 'Flotten', report: 'Events & Berichte', actions:'Aktionen', users: 'Spielerzugänge', audit: 'Änderungsprotokoll' };
let session, state, page = 'overview', selectedEmpire = null, filterEmpire = '', search = '', toastTimer, refreshing = false;
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = value => new Intl.NumberFormat('de-AT').format(value);
const signed = value => `${value > 0 ? '+' : ''}${num(value)}`;
const gm = () => session?.user?.role === 'gm';
const findEmpire = id => state.empires.find(x => x.id === id);
const badge = visibility => `<span class="badge ${visibility === 'secret' ? 'secret' : ''}">${visibilityNames[visibility]}</span>`;
const button = (action, label, id = '', style = '') => `<button class="${style}" data-action="${action}" data-id="${e(id)}">${label}</button>`;
const empty = (title, description, action = '') => `<div class="empty"><div class="eyebrow">Sternarchiv</div><h2>${title}</h2><p>${description}</p>${action}</div>`;
const input = (name, label, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
const textarea = (name, label, value = '') => `<label class="full">${label}<textarea name="${name}" maxlength="10000">${e(value)}</textarea></label>`;
const visibilitySelect = (name,label,value='secret',realms=[]) => visibilityField(name,label,value,realms);
const empireSelect = (name, label, value = '') => `<label>${label}<select name="${name}"><option value="">Nicht zugeordnet</option>${state.empires.map(x => `<option value="${x.id}" ${x.id === value ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label>`;
function toast(message, error = false) { $('#toast').textContent = message; $('#toast').className = error ? 'error' : ''; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 6500); }
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Sternarchiv': '1', 'X-CSRF-Token': session?.csrf ?? '' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') { session = { user: null, initialized: true }; modal.close(); renderLogin(); }
    throw new Error(data.error || 'Anfrage fehlgeschlagen.');
  }
  return data;
}
async function refresh(renderPage = true) { state = await api('/state'); if (renderPage) render(); await nextEvent(); }
async function boot() {
  try { session = await api('/session'); if (session.user) await refresh(); else renderLogin(); }
  catch (err) { app.innerHTML = empty('Keine Verbindung', 'Bitte prüfen, ob das Serverfenster geöffnet ist.', button('retry', 'Erneut verbinden')); toast(err.message, true); }
}
function renderLogin() {
  page = 'overview'; selectedEmpire = null; filterEmpire = ''; search = '';
  eventDialog.close(); zoomDialog.close(); activeAnnouncement=null;
  app.innerHTML = `<div class="login-wrap"><section class="login"><div class="brand"><span class="brand-symbol">✧</span> STERNARCHIV</div><div class="eyebrow">Deine Galaxie. Eure Geschichte.</div><h1>Willkommen an Bord.</h1><p class="muted">Das gemeinsame Archiv eurer Kampagne.</p>${session.initialized ? `<form id="login-form">${input('username','Benutzername','','text','required maxlength="80" autocomplete="username"')}${input('password','Passwort','','password','required maxlength="200" autocomplete="current-password"')}<div class="form-error" role="alert"></div><button class="primary wide" type="submit">Am Kontrollzentrum anmelden →</button></form><p class="help">Deinen Zugang erhältst du von der Spielleitung.</p>` : '<div class="notice">Bitte auf dem Server-PC zuerst <strong>Einrichtung.cmd</strong> ausführen. Dort legst du deinen Spielleiterzugang an.</div>'}<p class="help">Privates Kampagnenzentrum · Lokal gespeichert</p></section></div>`;
  $('#login-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('button'); submit.disabled = true;
    try { await api('/login', 'POST', Object.fromEntries(new FormData(form))); await boot(); }
    catch (err) { form.querySelector('.form-error').textContent = err.message; submit.disabled = false; }
  });
}
function render() {
  for (const r of state.resourceTypes ?? []) resourceNames[r.id] = r.name;
  Object.assign(pageNames,{discoveries:'Forschung & Entdeckungen',maps:'Karte',laws:'Gesetzbücher',buildings:'Gebäude',types:'Ressourcentypen'});
  setTimeout(updateNotificationBadge,0);
  const nav = [['overview','⌂'],['empires','◇'],['planet','◉'],['fleet','△'],['report','▤'],['actions','✉'],['discoveries','⌕'],['maps','◎'],['laws','§'],...(gm() ? [['buildings','▥'],['types','◈'],['users','♙'],['audit','≡']] : [])];
  if (selectedEmpire && !findEmpire(selectedEmpire)) selectedEmpire = null;
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div><div class="brand"><span class="brand-symbol">✧</span> STERNARCHIV</div><div class="subbrand">KAMPAGNENZENTRUM</div></div><nav class="nav" aria-label="Hauptnavigation">${nav.map(([key,icon]) => `<button data-page="${key}" class="${page === key ? 'active' : ''}" ${page === key ? 'aria-current="page"' : ''}><span class="nav-icon">${icon}</span>${pageNames[key]}</button>`).join('')}</nav><div class="sidebar-foot"><strong>${e(session.user.username)}</strong>${gm() ? 'Spielleitung' : 'Spieler'}<br>${button('password','Passwort ändern','','subtle')} ${button('logout','Abmelden','','subtle')}</div></aside><main class="main"><header class="topbar"><div><span class="eyebrow">Kampagne / ${pageNames[page]}</span><div class="sync">Datenstand ${new Date().toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'})} · ${gm() ? 'Spielleitung' : e(session.user.username)}</div></div><div class="topbar-right"><span class="round">Runde ${state.round}</span>${button('refresh','↻ Aktualisieren','','subtle')}${button('password','Konto','','subtle')}${button('logout','Abmelden','','subtle')}</div></header><div id="view">${selectedEmpire ? empireDetail(findEmpire(selectedEmpire)) : pageContent()}</div></main></div>`;
}
function heading(title, sub, action = '') { return `<div class="heading"><div><div class="eyebrow">${gm() ? 'Spielleiteransicht' : 'Dein freigegebenes Archiv'}</div><h1>${title}</h1><p class="lead">${sub}</p></div><div class="actions">${action}</div></div>`; }
function pageContent() {
  if (['discoveries','maps','laws','buildings','types'].includes(page)) return expansionPage();
  if (page === 'overview') return overview();
  if (page === 'empires') return heading('Reiche der Galaxie','Zivilisationen, Ressourcen und der nächste große Schritt.',gm() ? button('new-empire','+ Reich anlegen','','primary') : '') + empireCards(state.empires);
  if (['planet','fleet','report'].includes(page)) return recordsPage();
  if (page === 'actions') return actionPage();
  if (page === 'users' && gm()) return usersPage();
  if (page === 'audit' && gm()) return auditPage();
  return '';
}
function overview() {
  const own = findEmpire(session.user.empire_id);
  return heading(gm() ? 'Die Galaxie im Blick.' : `Bereit für das nächste Kapitel?`,gm() ? 'Verwalte eure Reiche und führe die Geschichte gemeinsam weiter.' : own ? `Willkommen im Archiv von ${e(own.name)}.` : 'Hier findest du alle Informationen, die deine Spielleitung freigegeben hat.',gm() ? button('round','Nächste Runde →','','primary') : '') +
    `<div class="stats"><div class="stat"><span>Sichtbare Reiche</span><strong>${state.empires.length.toString().padStart(2,'0')}</strong></div><div class="stat"><span>Entdeckte Planeten</span><strong>${state.records.filter(x=>x.kind==='planet').length.toString().padStart(2,'0')}</strong></div><div class="stat"><span>Erfasste Flotten</span><strong>${state.records.filter(x=>x.kind==='fleet').length.toString().padStart(2,'0')}</strong></div></div>` +
    `<div class="section-title"><h2>${gm() ? 'Eure Reiche' : 'Reichsübersicht'}</h2>${gm() ? button('new-empire','+ Reich anlegen','','subtle') : ''}</div>` + empireCards(own ? [own,...state.empires.filter(x=>x.id!==own.id)] : state.empires) +
    `<div class="section-title"><h2>Berichte aus der Galaxie</h2>${gm() ? button('new-report','+ Bericht verfassen','','subtle') : ''}</div>` + recordCards(state.records.filter(x=>x.kind==='report').slice(0,3));
}
function empireCards(empires) {
  if (!empires.length) return empty(gm() ? 'Eine Galaxie wartet auf ihre Geschichte.' : 'Noch keine Reiche freigegeben.',gm() ? 'Lege das erste Reich an. Danach kannst du Ressourcen eintragen, Spieler zuordnen und eure erste Runde beginnen.' : 'Deine Spielleitung kann dir ein Reich zuordnen und Informationen freigeben.', gm() ? button('new-empire','Erstes Reich anlegen','','primary') : '');
  return `<div class="grid">${empires.map(x => `<article class="card"><div class="card-art">${x.image ? `<img src="/api/images/empire/${x.id}?v=${state.revision}" alt="Wappen von ${e(x.name)}">` : '<div class="orb" aria-hidden="true"></div>'}</div><div class="card-body"><div class="card-meta">${badge(x.visibility)}${x.id === session.user.empire_id ? '<span class="badge">Dein Reich</span>' : ''}</div><h3>${e(x.name)}</h3><div class="muted small">${e(x.species || 'Spezies noch nicht erfasst')}</div><p class="description">${e(x.description.slice(0,160))}${x.description.length > 160 ? ' …' : ''}</p><div class="pill-row"><span class="small muted">${state.records.filter(r=>r.empire_id===x.id&&r.kind==='planet').length} Planeten</span><span class="small muted">· ${state.records.filter(r=>r.empire_id===x.id&&r.kind==='fleet').length} Flotten</span></div></div><div class="card-footer"><span class="small muted">${x.players?.length ? e(x.players.join(', ')) : 'Reichsarchiv'}</span>${button('open-empire','Reich öffnen →',x.id,'subtle')}</div></article>`).join('')}</div>`;
}
function empireDetail(x) {
  return button('back','← Zur Übersicht','','subtle back') + heading(e(x.name), e(x.species || 'Spezies noch nicht erfasst'),gm() ? button('edit-empire','Reich bearbeiten',x.id) + button('image-empire','Bild hochladen',x.id,'subtle') : '') +
    `<div class="empire-banner">${x.image ? `<img src="/api/images/empire/${x.id}?v=${state.revision}" alt="Wappen">` : ''}<div><p class="description hero-description">${e(x.description)}</p><div class="card-meta">${badge(x.visibility)}${x.players ? `Spieler: ${e(x.players.join(', ') || 'Noch nicht zugeordnet')}` : ''}</div></div></div>` +
    `<div class="section-title"><h2>Ressourcen</h2><div class="actions">${badge(x.economy_visibility)}${gm() ? button('resources','Vorräte & Einkommen',x.id,'subtle') : ''}</div></div>` + (x.resources ? `<div class="resource-grid">${x.resources.map(r=>`<div class="resource"><span class="label">${e(resourceNames[r.kind] || r.kind)}</span><strong class="value ${r.stock<0?'negative':''}">${num(r.stock)}</strong><span class="small ${r.income<0?'negative':'positive'}">${signed(r.income)} / Runde</span><div class="small muted">Basis ${signed(r.base ?? r.income)} + Produktion ${num(r.production ?? 0)} &minus; Unterhalt ${num(r.upkeep ?? 0)}</div>${r.stock<0?'<div class="negative small">Fehlbestand</div>':''}</div>`).join('')}</div>` : '<div class="panel muted">Die Wirtschaft dieses Reichs ist nicht freigegeben.</div>') +
    `<div class="section-title"><h2>Forschung</h2><div class="actions">${badge(x.research_visibility)}${gm() ? button('research','Forschung bearbeiten',x.id,'subtle') : ''}</div></div>` + (x.research ? `<section class="panel"><div class="card-meta">${num(x.research.power)} Forschungspunkte / Runde</div><h3>${e(x.research.name || 'Kein aktives Projekt')}</h3><p class="description muted">${e(x.research.description)}</p>${x.research.name ? `<meter min="0" max="${x.research.required}" value="${Math.min(x.research.progress,x.research.required)}" aria-label="Forschungsfortschritt"></meter><div class="card-meta">${num(x.research.progress)} / ${num(x.research.required)} Punkte ${x.research.progress>=x.research.required ? '· Abgeschlossen' : ''}</div>` : ''}</section>` : '<div class="panel muted">Die Forschung dieses Reichs ist nicht freigegeben.</div>') +
    lawbookSection(x.id) + ['planet','fleet','report'].map(kind=>`<div class="section-title"><h2>${pageNames[kind]}</h2>${gm() ? button(`new-${kind}`,`+ ${kindNames[kind]} anlegen`,x.id,'subtle') : ''}</div>${recordCards(state.records.filter(r=>r.empire_id===x.id&&r.kind===kind))}`).join('');
}
function recordsPage() {
  const records = state.records.filter(x=>x.kind===page && (!filterEmpire || x.empire_id===filterEmpire) && `${x.name} ${x.description} ${x.details.mapId}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return heading(pageNames[page],page === 'planet' ? 'Welten, Kolonien und ihre Geschichten.' : page === 'fleet' ? 'Schiffe und ihre aktuellen Zustände.' : 'Nachrichten, Erkenntnisse und geheime Dossiers.',gm() ? button(`new-${page}`,`+ ${kindNames[page]} anlegen`,'','primary') : '') + `<div class="toolbar">${input('search','Archiv durchsuchen',search,'search','id="search" maxlength="200"')}<label>Reich<select id="filter-empire"><option value="">Alle sichtbaren Reiche</option>${state.empires.map(x=>`<option value="${x.id}" ${filterEmpire===x.id?'selected':''}>${e(x.name)}</option>`).join('')}</select></label></div><div id="record-results">${recordCards(records)}</div>`;
}
function recordCards(records) {
  if (!records.length) return empty('Hier ist noch Raum für Geschichte.','Keine passenden oder freigegebenen Einträge vorhanden.');
  return `<div class="grid">${records.map(x=>`<article class="card">${x.image ? `<div class="card-art"><img src="/api/images/record/${x.id}?v=${state.revision}" alt="${e(x.name)}" loading="lazy"></div>` : ''}<div class="card-body"><div class="card-meta">${badge(x.visibility)} ${x.kind==='report'?`<span class="badge">${x.status==='draft'?'Entwurf':'Veröffentlicht'}</span>`:''} ${e(findEmpire(x.empire_id)?.name || 'Ohne sichtbare Reichszuordnung')}</div><h3>${e(x.name)}</h3><div class="card-meta">${e(x.details.type)}${x.details.mapId ? ` · Karte ${e(x.details.mapId)}` : ''}</div><p class="description">${e(x.description.slice(0,220))}${x.description.length>220?' …':''}</p>${x.kind==='fleet'?`<span class="muted small">${x.details.ships.length} Schiffe erfasst</span>`:''}</div><div class="card-footer">${button('open-record','Details öffnen →',x.id,'subtle')}${gm()?button('edit-record','Bearbeiten',x.id,'subtle'):''}</div></article>`).join('')}</div>`;
}
function usersPage() {
  return heading('Spielerzugänge','Zugänge vergeben, Reiche zuordnen und Passwörter zurücksetzen.',button('new-user','+ Spieler anlegen','','primary')) + `<div class="panel table-wrap"><table><thead><tr><th>Benutzername</th><th>Rolle</th><th>Reich</th><th>Verwaltung</th></tr></thead><tbody>${state.users.map(u=>`<tr><td>${e(u.username)}</td><td>${u.role==='gm'?'Spielleitung':'Spieler'}</td><td>${e(findEmpire(u.empire_id)?.name || '—')}</td><td>${u.role==='player'?button('edit-user','Zuordnung / Passwort',u.id,'subtle'):'Eigenes Passwort über „Konto“'}</td></tr>`).join('')}</tbody></table></div>`;
}
function auditPage() {
  return heading('Änderungsprotokoll','Die letzten 200 Änderungen. Das vollständige Protokoll bleibt in der Datenbank gespeichert.') + `<div class="panel table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Urheber</th><th>Änderung</th><th>Reich / Details</th></tr></thead><tbody>${state.audit.map(a=>`<tr><td>${e(new Date(a.at).toLocaleString('de-AT'))}</td><td>${e(a.actor)}</td><td>${e(a.action)}${a.reason?`<p class="small muted">${e(a.reason)}</p>`:''}</td><td>${e(findEmpire(a.empire_id)?.name || '—')}<details><summary>Buchungsdetails</summary><pre>${e(JSON.stringify(a.details,null,2))}</pre></details></td></tr>`).join('')}</tbody></table>${state.audit.length?'':'<p class="muted">Noch keine Änderungen vorhanden.</p>'}</div>`;
}
function openModal(title, content) { openRecordId=null; modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">${e(title)}</h2>${button('close','✕','','subtle')}</div><div class="modal-content">${content}</div>`; if (!modal.open) modal.showModal(); }
function formModal(title, content, submit, label = 'Änderungen speichern', afterSave = null) {
  openModal(title, `<form id="edit-form">${content}<div class="form-error" role="alert"></div><div class="modal-actions">${button('close','Abbrechen','','subtle')}<button type="submit" class="primary">${label}</button></div></form>`);
  modal.querySelectorAll('button[data-action]').forEach(b=>b.type='button');
  $('#edit-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await submit(Object.fromEntries(new FormData(form)), form); modal.close(); if(afterSave) await afterSave(); else { await refresh(); toast('Gespeichert.'); } }
    catch (err) { form.querySelector('.form-error').textContent = err.message; btn.disabled = false; }
  });
}
function empireForm(id) {
  const x = findEmpire(id) ?? { name:'',species:'',description:'',visibility:'secret',economy_visibility:'secret',research_visibility:'secret' }, revision = state.revision;
  formModal(id?'Reich bearbeiten':'Neues Reich', `<div class="form-grid">${input('name','Reichsname',x.name,'text','required maxlength="120"')}${input('species','Spezies',x.species,'text','maxlength="200"')}${textarea('description','Beschreibung',x.description)}${visibilitySelect('visibility','Reichsprofil sichtbar für',x.visibility,x.visibility_realms)}${visibilitySelect('economy_visibility','Ressourcen sichtbar für',x.economy_visibility,x.economy_realms)}${visibilitySelect('research_visibility','Forschung sichtbar für',x.research_visibility,x.research_realms)}${textarea('gm_notes','Geheime Spielleiternotizen',x.gm_notes)}</div><p class="help">Öffentlich bedeutet: für alle angemeldeten Spieler. Wirtschaft und Forschung werden nur angezeigt, wenn auch das Reichsprofil sichtbar ist. Planeten, Flotten und Berichte werden einzeln freigegeben. Spieler ordnest du unter „Spielerzugänge“ zu.</p>`, (data,form)=>api(id?`/empires/${id}`:'/empires',id?'PUT':'POST',{...data,...visibilityData(form),revision}));
}
function resourcesForm(id) {
  const x = findEmpire(id), revision = state.revision;
  formModal('Ressourcen · '+x.name, `<label>Buchungsart<select name="mode" id="resource-mode"><option value="set">Vorräte direkt setzen</option><option value="delta">Zu- / Abgänge buchen (+ / −)</option></select></label><p class="help">Das Netto-Einkommen wird immer direkt gesetzt. Negative Vorräte bleiben als Fehlbestände bestehen.</p><div class="table-wrap"><table class="resource-editor"><thead><tr><th>Ressource</th><th>Vorrat / Änderung</th><th>Netto / Runde</th></tr></thead><tbody>${x.resources.map(r=>`<tr><td>${e(resourceNames[r.kind] || r.kind)}<br><span class="muted small">Aktuell ${num(r.stock)}</span></td><td><input aria-label="${e(resourceNames[r.kind] || r.kind)} Vorrat" name="${r.kind}_stock" type="number" min="-1000000000" max="1000000000" step="1" required value="${r.stock}" data-stock="${r.stock}"></td><td><input aria-label="${e(resourceNames[r.kind] || r.kind)} Einkommen" name="${r.kind}_income" type="number" min="-1000000000" max="1000000000" step="1" required value="${r.income}"></td></tr>`).join('')}</tbody></table></div>${input('reason','Grund (optional)','','text','maxlength="1000"')}`, data=>api(`/empires/${id}/resources`,'PUT',{ revision,mode:data.mode,reason:data.reason,resources:Object.fromEntries(Object.keys(resourceNames).map(k=>[k,{stock:Number(data[k+'_stock']),income:Number(data[k+'_income'])}])) }));
  $('#resource-mode').addEventListener('change',event=>modal.querySelectorAll('[data-stock]').forEach(el=>el.value=event.target.value==='delta'?0:el.dataset.stock));
}
function researchForm(id) {
  const x = findEmpire(id), r=x.research, revision=state.revision;
  formModal('Forschung · '+x.name, `<div class="form-grid">${input('power','Forschungsleistung / Runde',(r.base ?? r.power),'number','required min="0" max="1000000000" step="1"')}${input('name','Aktives Projekt (leer = keines)',r.name,'text','maxlength="200"')}${textarea('description','Projektbeschreibung',r.description)}${input('progress','Bisherige Forschungspunkte',r.progress,'number','required min="0" max="1000000000" step="1"')}${input('required','Benötigte Forschungspunkte',r.required,'number','required min="1" max="1000000000" step="1"')}</div><p class="help">Ein laufendes Projekt erhält pro Runde die volle Forschungsleistung. Überschüssige Punkte bleiben sichtbar. Erreichte Projekte erhalten keine weiteren Punkte. Für ein neues Projekt setzt du den Fortschritt selbst.</p>`,data=>api(`/empires/${id}/research`,'PUT',{...data,revision,power:Number(data.power),progress:Number(data.progress),required:Number(data.required)}));
}
function shipRow(ship = {name:'',type:'',status:''}) { return `<div class="ship-row"><input data-ship="name" aria-label="Schiffsname" placeholder="Schiffsname" maxlength="120" value="${e(ship.name)}" required><input data-ship="type" aria-label="Schiffstyp" placeholder="Typ" maxlength="120" value="${e(ship.type)}"><input data-ship="status" aria-label="Schiffszustand" placeholder="Zustand, z. B. beschädigt" maxlength="200" value="${e(ship.status)}"><button type="button" data-action="remove-ship" aria-label="Schiff entfernen">✕</button></div>`; }
function recordForm(kind,id,owner){return eventRecordForm(kind,id,owner);}
function recordDetail(id){return extendedRecordDetail(id);}
function userForm(id) {
  const u=state.users.find(x=>x.id===id), revision=state.revision;
  formModal(u?`Zugang · ${u.username}`:'Spielerzugang anlegen',`${!u?input('username','Benutzername','','text','required maxlength="80" autocomplete="off"'):''}${empireSelect('empire_id','Zugeordnetes Reich',u?.empire_id)}${input('password',u?'Neues Passwort (leer = unverändert)':'Anfangspasswort','','password',`${u?'':'required'} minlength="12" maxlength="200" autocomplete="new-password"`)}<p class="help">Mindestens 12 Zeichen. Teile neue Zugangsdaten persönlich mit dem Spieler. Änderungen beenden bestehende Sitzungen dieses Spielers.</p>`,data=>api(id?`/users/${id}`:'/users',id?'PUT':'POST',{...data,revision,empire_id:data.empire_id||null}));
}
function passwordForm() {
  formModal('Eigenes Passwort ändern',`${input('current','Bisheriges Passwort','','password','required autocomplete="current-password"')}${input('password','Neues Passwort','','password','required minlength="12" maxlength="200" autocomplete="new-password"')}${input('confirm','Neues Passwort wiederholen','','password','required autocomplete="new-password"')}<p class="help">Danach meldest du dich mit deinem neuen Passwort erneut an.</p>`,async data=>{
    if(data.password!==data.confirm) throw new Error('Die neuen Passwörter stimmen nicht überein.');
    await api('/password','POST',data);
  },'Passwort speichern',async()=>{await boot();toast('Passwort geändert. Bitte erneut anmelden.');});
}
async function roundPreview() {
  const p=await api('/round/preview','POST',{});
  const deficits=p.changes.flatMap(x=>x.resources.filter(r=>r.after<0));
  openModal(`Vorschau · Runde ${p.round}`,`<p class="muted">Noch wurde nichts gebucht. Prüfe alle Änderungen und bestätige anschließend die gesamte Runde.</p>${deficits.length?`<div class="notice"><strong>${deficits.length} ${deficits.length===1?'Fehlbestand':'Fehlbestände'} nach dieser Runde.</strong> Negative Vorräte werden unverändert gespeichert. Es werden keine Strafen berechnet.</div>`:''}${p.changes.map(x=>`<h3>${e(x.name)}</h3><div class="table-wrap"><table><thead><tr><th>Ressource</th><th>Vorher</th><th>Änderung</th><th>Nachher</th></tr></thead><tbody>${x.resources.map(r=>`<tr><td>${e(resourceNames[r.kind] || r.kind)}</td><td class="num">${num(r.before)}</td><td class="num ${r.change<0?'negative':'positive'}">${signed(r.change)}</td><td class="num ${r.after<0?'negative':''}">${num(r.after)}${r.after<0?' · Fehlbestand':''}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Forschung: ${x.research.name?`${e(x.research.name)} · ${num(x.research.before)} → ${num(x.research.after)} / ${num(x.research.required)} Punkte`:'Kein aktives Projekt'}</p>`).join('')}${roundBuildingSummary(p)}<div class="form-error" role="alert"></div><div class="modal-actions">${button('close','Abbrechen','','subtle')}<button id="confirm-round" class="primary">Runde ${p.round} verbindlich buchen</button></div>`);
  $('#confirm-round').addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await api('/round/commit','POST',{token:p.token});modal.close();await refresh();toast(`Runde ${p.round} wurde gebucht.`);}catch(err){modal.querySelector('.form-error').textContent=err.message;$('#confirm-round').disabled=false;}});
}
function imageForm(kind,id) {
  const revision=state.revision;
  formModal('Bild hochladen',`<label>Lokale Bilddatei<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required></label><p class="help">PNG, JPEG oder WebP · maximal 5 MB. Das Bild übernimmt die Sichtbarkeit des Eintrags und wird lokal gespeichert.</p>`,async (_,form)=>{
    const file=form.elements.image.files[0];if(!file||file.size>5*1024*1024)throw new Error('Bitte ein Bild mit maximal 5 MB wählen.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('Bild konnte nicht gelesen werden.'));reader.readAsDataURL(file);});
    await api(`/images/${kind}/${id}`,'POST',{data,revision});
  },'Bild speichern');
}
async function act(action,id,target) {
  if(action.startsWith('x-')) return expansionAction(action,id,target);
  if(['submit-action','open-action','reannounce'].includes(action))return communicationAction(action,id);
  if(action==='close')return modal.close();
  if(action==='retry')return boot();
  if(action==='refresh'){await refresh();return toast('Daten aktualisiert.');}
  if(action==='logout'){await api('/logout','POST',{});selectedEmpire=null;page='overview';return boot();}
  if(action==='password')return passwordForm();
  if(action==='back'){selectedEmpire=null;return render();}
  if(action==='open-empire'){selectedEmpire=id;page='empires';render();window.scrollTo(0,0);return;}
  if(action==='new-empire'||action==='edit-empire')return empireForm(id||null);
  if(action==='resources')return expansionResourcesForm(id);
  if(action==='research')return researchForm(id);
  if(action==='round')return roundPreview();
  if(action==='new-user'||action==='edit-user')return userForm(id||null);
  if(action==='open-record')return recordDetail(id);
  if(action==='edit-record')return recordForm(null,id);
  if(action==='add-ship'){if(modal.querySelectorAll('.ship-row').length>=200)throw new Error('Maximal 200 Schiffe pro Flotte.');$('#ship-list').insertAdjacentHTML('beforeend',shipRow());return;}
  if(action==='remove-ship')return target.closest('.ship-row').remove();
  if(action==='image-empire')return imageForm('empire',id);
  if(action==='image-record')return imageForm('record',id);
  if(action==='delete-record'){
    const x=state.records.find(r=>r.id===id),revision=state.revision;
    return formModal('Eintrag löschen',`<p>„${e(x.name)}“ wirklich löschen? Diese Aktion entfernt den Eintrag dauerhaft.</p>`,()=>api(`/records/${id}`,'DELETE',{revision}),'Endgültig löschen');
  }
  if(action.startsWith('new-'))return recordForm(action.slice(4),null,id||selectedEmpire);
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.page){page=target.dataset.page;selectedEmpire=null;filterEmpire='';search='';render();return;}
  if(target.dataset.action){try{await act(target.dataset.action,target.dataset.id,target);}catch(err){toast(err.message,true);}}
});
document.addEventListener('change',event=>{if(event.target.id==='filter-empire'){filterEmpire=event.target.value;$('#record-results').innerHTML=recordCards(state.records.filter(x=>x.kind===page&&(!filterEmpire||x.empire_id===filterEmpire)&&`${x.name} ${x.description} ${x.details.mapId}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));}});
document.addEventListener('input',event=>{if(event.target.id==='search'){search=event.target.value;$('#record-results').innerHTML=recordCards(state.records.filter(x=>x.kind===page&&(!filterEmpire||x.empire_id===filterEmpire)&&`${x.name} ${x.description} ${x.details.mapId}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())));}});
