// UI extensions use the existing session, API client, dialogs and visual components.
const actionStatuses = { open:'Offen', working:'In Bearbeitung', done:'Erledigt' };
let actionFilters = { player:'', empire:'', status:'' };
let activeAnnouncement = null, openRecordId = null, eventOpening = false, communicationBusy = false;
const eventDialog = document.querySelector('#event-modal');
const zoomDialog = document.querySelector('#image-modal');

function visibilityField(name,label,value='secret',selected=[]) {
  const realmsName = name==='visibility'?'visibility_realms':name.replace('_visibility','_realms');
  return `<fieldset class="visibility-field full"><legend>${label}</legend><select name="${name}" data-visibility="${realmsName}" aria-label="${label}">${Object.entries(visibilityNames).map(([k,v])=>`<option value="${k}" ${k===value?'selected':''}>${v}</option>`).join('')}</select><div data-realms="${realmsName}" ${value==='empire'?'':'hidden'}><p class="help">Mehrere Reiche möglich. Eine leere Auswahl bleibt für Spieler unsichtbar.</p><div class="realm-options">${state.empires.map(x=>`<label class="check"><input type="checkbox" name="${realmsName}" value="${x.id}" ${selected.includes(x.id)?'checked':''}>${e(x.name)}</label>`).join('')||'<p class="help">Zuerst Reiche anlegen, anschließend die Freigabe bearbeiten.</p>'}</div></div></fieldset>`;
}
function visibilityData(form) {
  const data=new FormData(form);
  return Object.fromEntries(['visibility_realms','economy_realms','research_realms'].map(key=>[key,data.getAll(key)]));
}
document.addEventListener('change',event=>{
  if(event.target.dataset.visibility) modal.querySelector(`[data-realms="${event.target.dataset.visibility}"]`).hidden=event.target.value!=='empire';
});
function eventImages(record) {
  const images=record.images?.length?record.images:(record.image?[{url:`/api/images/record/${record.id}?v=${state.revision}`}]:[]);
  return `<div class="event-gallery">${images.map((image,index)=>`<button type="button" class="image-thumb" data-zoom="${e(image.url)}" aria-label="Bild ${index+1} vergrößern"><img src="${e(image.url)}" alt="${e(record.name)} – Bild ${index+1}"></button>`).join('')}</div>`;
}
function eventRecordForm(kind,id,owner) {
  const x=state.records.find(r=>r.id===id)??{kind,name:'',description:'',empire_id:owner||null,visibility:'secret',visibility_realms:[],gm_notes:'',status:'draft',popup:false,details:{type:'',mapId:'',ships:[]},images:[]};
  const revision=state.revision;
  let images=(x.images??[]).map(i=>({...i}));
  let filesReading=false;
  formModal(`${kindNames[x.kind]} ${id?'bearbeiten':'anlegen'}`,`<div class="form-grid">${input('name','Name / Titel',x.name,'text','required maxlength="200"')}${empireSelect('empire_id',x.kind==='report'?'Thematisches Reich (kein Zugriffsrecht)':'Besitzerreich (kein Zugriffsrecht)',x.empire_id)}${input('type',x.kind==='report'?'Kategorie':'Typ',x.details.type,'text','maxlength="120"')}${input('mapId','Karten-ID / Position',x.details.mapId,'text','maxlength="120"')}${textarea('description',x.kind==='report'?'Eventbeschreibung':'Beschreibung',x.description)}${visibilityField('visibility','Sichtbarkeit',x.visibility,x.visibility_realms)}${textarea('gm_notes','Geheime Spielleiternotizen – niemals für Spieler',x.gm_notes)}${x.kind==='report'?`<label>Status<select name="status"><option value="draft" ${x.status==='draft'?'selected':''}>Entwurf</option><option value="published" ${x.status==='published'?'selected':''}>Veröffentlicht</option></select></label><label class="check"><input name="popup" type="checkbox" ${x.popup?'checked':''}>Bei Veröffentlichung als Pop-up anzeigen</label><div class="full"><p class="help">Zum Veröffentlichen bewusst „Veröffentlicht“ wählen und speichern. Reine Textänderungen wiederholen keine Ankündigung.</p><label>Bilder hinzufügen (max. 5 × 5 MB)<input id="event-files" type="file" multiple accept="image/png,image/jpeg,image/webp"></label><div id="event-image-previews" class="event-gallery"></div><p id="image-error" class="form-error" role="alert"></p></div>`:''}</div>${x.kind==='fleet'?`<h3>Schiffe</h3><p class="help">Freigabe gilt für die gesamte Flotte.</p><div id="ship-list">${x.details.ships.map(shipRow).join('')}</div><button type="button" data-action="add-ship">+ Schiff hinzufügen</button>`:''}`,
    async(data,form)=>{
      if(filesReading)throw new Error('Bitte warten, bis die Bildvorschauen geladen sind.');
      return api(id?`/records/${id}`:'/records',id?'PUT':'POST',{
        revision,kind:x.kind,name:data.name,description:data.description,gm_notes:data.gm_notes,empire_id:data.empire_id||null,
        visibility:data.visibility,...visibilityData(form),
        ...(x.kind==='report'?{status:data.status,popup:form.elements.popup.checked,images:images.map(i=>i.id?{id:i.id}:{data:i.data})}:{}),
        details:{type:data.type,mapId:data.mapId,...(x.kind==='fleet'?{ships:[...form.querySelectorAll('.ship-row')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-ship]')].map(i=>[i.dataset.ship,i.value])))}:{})}
      });
    },x.kind==='report'?'Event speichern':'Änderungen speichern');
  if(x.kind==='report') {
    const preview=()=>{
      $('#event-image-previews').innerHTML=images.map((image,index)=>`<div class="image-preview"><img src="${e(image.url)}" alt="Bildvorschau ${index+1}"><button type="button" data-remove-event-image="${index}">Entfernen</button></div>`).join('');
      $('#event-image-previews').querySelectorAll('[data-remove-event-image]').forEach(b=>b.onclick=()=>{images.splice(Number(b.dataset.removeEventImage),1);preview();});
    };
    preview();
    $('#event-files').addEventListener('change',async event=>{
      const files=[...event.target.files]; filesReading=true;
      try {
        if(images.length+files.length>5)throw new Error('Maximal fünf Bilder pro Event.');
        const loaded=[];
        for(const file of files){
          if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Bitte PNG, JPEG oder WebP mit maximal 5 MB wählen.');
          const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Bild konnte nicht gelesen werden.'));r.readAsDataURL(file);});
          loaded.push({url,data:url.split(',')[1]});
        }
        images.push(...loaded); preview();$('#image-error').textContent='';
      }catch(err){if($('#image-error'))$('#image-error').textContent=err.message;}
      finally{filesReading=false;event.target.value='';}
    });
  }
}
async function extendedRecordDetail(id) {
  const x=await api(`/records/${id}`);openRecordId=id;
  openModal(x.name,`<div class="card-meta">${badge(x.visibility)}${x.kind==='report'?`<span class="badge">${x.status==='draft'?'Entwurf':'Veröffentlicht'}</span>`:''}${e(findEmpire(x.empire_id)?.name||'Ohne sichtbare Reichszuordnung')}</div><p class="muted">${e(x.details.type)} ${e(x.details.mapId)}</p><p class="report-text">${e(x.description)}</p>${eventImages(x)}${x.kind==='fleet'?`<div class="table-wrap"><table><thead><tr><th>Schiff</th><th>Typ</th><th>Zustand</th></tr></thead><tbody>${x.details.ships.map(s=>`<tr><td>${e(s.name)}</td><td>${e(s.type)}</td><td>${e(s.status)}</td></tr>`).join('')}</tbody></table></div>`:''}${gm()?`<details><summary>Geheime Spielleiternotizen</summary><p class="description">${e(x.gm_notes)}</p></details><div class="modal-actions">${x.kind!=='report'?button('image-record','Bild hochladen',id):x.status==='published'&&x.popup?button('reannounce','Erneut ankündigen',id):''}${button('delete-record','Löschen',id,'danger')}${button('edit-record','Bearbeiten',id,'primary')}</div>${x.kind==='report'?`<h3>Ankündigungen und Bestätigungen</h3><p class="help">Eine Bestätigung ist kein Nachweis, dass der Text gelesen wurde. Angezeigt werden die aktuell berechtigten Spieler.</p>${(x.announcements??[]).map(a=>`<details><summary>${e(new Date(a.at).toLocaleString('de-AT'))} · ${a.players.filter(p=>p.confirmed_at).length}/${a.players.length} bestätigt</summary>${a.players.map(p=>`<p>${e(p.username)} · ${p.confirmed_at?`bestätigt am ${e(new Date(p.confirmed_at).toLocaleString('de-AT'))}`:'noch nicht bestätigt'}</p>`).join('')||'<p>Keine aktuell berechtigten Spieler.</p>'}</details>`).join('')||'<p class="muted">Noch keine Ankündigung.</p>'}`:''}`:''}`);
  openRecordId=id;
}
function actionPage() {
  const actions=(state.actions??[]).filter(a=>(!actionFilters.player||a.user_id===actionFilters.player)&&(!actionFilters.empire||a.empire_id===actionFilters.empire)&&(!actionFilters.status||a.status===actionFilters.status));
  const select=(key,label,options)=>`<label>${label}<select data-action-filter="${key}"><option value="">Alle</option>${options.map(([v,label])=>`<option value="${e(v)}" ${actionFilters[key]===v?'selected':''}>${e(label)}</option>`).join('')}</select></label>`;
  return heading(gm()?'Aktionen · Spielleiter-Eingang':'Deine Aktionen',gm()?'Private Nachrichten deiner Spieler. Lesestatus und Bearbeitung bleiben getrennt.':'Sende eine Aktion privat an die Spielleitung. Nur du und die Spielleitung sehen deine Nachrichten.',gm()?'':button('submit-action','+ Aktion senden','','primary'))+
    (gm()?`<div class="toolbar">${select('player','Spieler',state.users.filter(u=>u.role==='player').map(u=>[u.id,u.username]))}${select('empire','Reich',state.empires.map(x=>[x.id,x.name]))}${select('status','Bearbeitungsstatus',Object.entries(actionStatuses))}</div>`:'')+
    `<div class="grid">${actions.map(a=>`<article class="card"><div class="card-body"><div class="card-meta"><span class="badge">${actionStatuses[a.status]}</span>${gm()&&!a.gm_read_at?'<span class="badge">Ungelesen</span>':''}${!gm()&&a.replies.some(r=>!r.confirmed_at)?'<span class="badge">Neue Antwort</span>':''}</div><h3>${e(a.subject)}</h3><p class="small muted">${e(a.username)} · ${e(a.empire_name||'Ohne Reich')} · Runde ${a.round}<br>${e(new Date(a.at).toLocaleString('de-AT'))}</p><p class="description">${e(a.description.slice(0,160))}</p></div><div class="card-footer">${button('open-action','Aktion öffnen',a.id,'subtle')}</div></article>`).join('')||empty('Keine Aktionen','Hier erscheinen eingereichte Aktionen und private Antworten.')}</div>`;
}
async function openAction(id) {
  const a=await api(`/actions/${id}`);
  const content=`<p class="muted">${e(a.username)} · ${e(a.empire_name||'Ohne Reich')} · Runde ${a.round}<br>${e(new Date(a.at).toLocaleString('de-AT'))}</p><p class="report-text">${e(a.description)}</p><p class="small">${a.gm_read_at?`Von der Spielleitung gelesen am ${e(new Date(a.gm_read_at).toLocaleString('de-AT'))}`:'Noch nicht von der Spielleitung gelesen'} · ${actionStatuses[a.status]}</p><h3>Private Antworten</h3>${a.replies.map(r=>`<section class="panel"><span class="small muted">${e(r.actor)} · ${e(new Date(r.at).toLocaleString('de-AT'))}</span><p class="description">${e(r.description)}</p></section>`).join('')||'<p class="muted">Noch keine Antwort.</p>'}`;
  if(gm())formModal(a.subject,`${content}<label>Bearbeitungsstatus<select name="status">${Object.entries(actionStatuses).map(([v,label])=>`<option value="${v}" ${v===a.status?'selected':''}>${label}</option>`).join('')}</select></label>${textarea('reply','Private Antwort (optional)')}`,data=>api(`/actions/${id}`,'PUT',data),'Antwort / Status speichern');
  else openModal(a.subject,`${content}<div class="modal-actions">${button('close','Schließen')}</div>`);
  await api(`/actions/${id}/read`,'POST',{reply_ids:a.replies.map(r=>r.id)});
  state.actions=await api('/actions');
  state.notifications=await api('/notifications'); updateNotificationBadge();
}
function updateNotificationBadge(){
  const nav=document.querySelector('[data-page="actions"]');
  if(nav)nav.innerHTML=`<span class="nav-icon">✉</span>Aktionen${state.notifications?.actions?` <span class="badge">${state.notifications.actions} neu</span>`:''}`;
}
async function nextEvent() {
  if(!session?.user||gm()||modal.open||eventDialog.open||eventOpening||zoomDialog.open)return;
  const next=state.notifications?.events?.[0];if(!next)return;
  eventOpening=true;
  try {
    const announcement=await api(`/announcements/${next.id}`);
    if(!session?.user||gm())return;
    activeAnnouncement=announcement.id;
    eventDialog.innerHTML=`<div class="modal-head"><h2 id="event-title">${e(announcement.record.name)}</h2></div><div class="modal-content"><p class="report-text">${e(announcement.record.description)}</p>${eventImages(announcement.record)}<p class="form-error" role="alert"></p><div class="modal-actions"><button id="confirm-event" class="primary">Gelesen / Schließen</button></div></div>`;
    eventDialog.showModal();
    $('#confirm-event').onclick=async()=>{
      $('#confirm-event').disabled=true;
      try{await api(`/announcements/${announcement.id}/confirm`,'POST',{});eventDialog.close();activeAnnouncement=null;state.notifications=await api('/notifications');await nextEvent();}
      catch(err){eventDialog.querySelector('.form-error').textContent=err.message;$('#confirm-event').disabled=false;}
    };
  }catch(err){toast(err.message,true);}finally{eventOpening=false;}
}
eventDialog.addEventListener('cancel',event=>event.preventDefault());
modal.addEventListener('close',()=>{openRecordId=null;setTimeout(()=>nextEvent(),0);});
document.addEventListener('click',event=>{
  const zoom=event.target.closest('[data-zoom]');
  if(zoom){zoomDialog.innerHTML=`<div class="modal-head"><h2 id="image-title">Bildansicht</h2><button type="button" id="close-image">Schließen</button></div><img class="zoom-image" src="${e(zoom.dataset.zoom)}" alt="Vergrößerte Ansicht">`;zoomDialog.showModal();$('#close-image').onclick=()=>zoomDialog.close();}
});
document.addEventListener('change',event=>{if(event.target.dataset.actionFilter){actionFilters[event.target.dataset.actionFilter]=event.target.value;$('#view').innerHTML=actionPage();}});
async function communicationAction(action,id){
  if(action==='submit-action')return formModal('Aktion an die Spielleitung',`${input('subject','Betreff','','text','required maxlength="200"')}${textarea('description','Beschreibung')}<p class="help">Nach dem Senden nicht mehr änderbar. Diese Nachricht führt keine automatischen Spielzüge aus.</p>`,data=>api('/actions','POST',data),'Aktion senden');
  if(action==='open-action')return openAction(id);
  if(action==='reannounce')return formModal('Event erneut ankündigen','<p>Für dieses Event eine neue Ankündigung mit eigenen Bestätigungen erstellen?</p>',()=>api(`/records/${id}/announce`,'POST',{revision:state.revision}),'Erneut ankündigen');
}
async function pollCommunication(){
  if(!session?.user||document.hidden||communicationBusy)return;
  communicationBusy=true;
  try {
    const n=await api('/notifications');
    if(!session?.user)return;
    state.notifications=n;updateNotificationBadge();
    if(activeAnnouncement&&!n.events.some(x=>x.id===activeAnnouncement)){eventDialog.close();zoomDialog.close();activeAnnouncement=null;}
    // Revalidate an open detail view even while a dialog is open.
    if(openRecordId&&!gm())try{await api(`/records/${openRecordId}`);}catch{modal.close();zoomDialog.close();openRecordId=null;}
    if(!modal.open){const fresh=await api('/state');if(!session?.user)return;const changed=fresh.revision!==state.revision||JSON.stringify(fresh.actions)!==JSON.stringify(state.actions);state=fresh;if(changed)render();}
    await nextEvent();
  }catch{/* Retry on the next poll; never acknowledge automatically. */}
  finally{communicationBusy=false;}
}
setInterval(pollCommunication,3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollCommunication();});
boot();
