let csrf = '', user, records = [], config;
const $ = id => document.getElementById(id);
const fields = ['fullName', 'companyName', 'email', 'phone', 'alternatePhone'];
const labels = { fullName:'Full name',companyName:'Company',email:'Email',phone:'Phone with country code',alternatePhone:'Alternate phone', event:'Event or source',country:'Country',organisationType:'Organisation type',contactType:'Contact type',interest:'Product or service interest',noteCategory:'Note category' };
async function api(url, method = 'GET', body) { const r = await fetch('/api/pilot' + url, { method, headers: { ...(body instanceof FormData ? {} : { 'Content-Type':'application/json' }), 'x-csrf-token':csrf }, body:body ? body instanceof FormData ? body : JSON.stringify(body) : undefined }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; }
function run(fn) { return async (...args) => { try { $('message').textContent = ''; await fn(...args); } catch(e) { $('message').textContent = e.message; } }; }
function button(text, fn) { const b = document.createElement('button'); b.textContent = text; b.onclick = run(fn); return b; }
function text(parent, tag, value) { const p = document.createElement(tag); p.textContent = value; parent.append(p); return p; }
function formBody(form) { return Object.fromEntries(new FormData(form)); }
async function start(session) {
  csrf=session.csrf; user=session.user; $('login').hidden=true; $('workspace').hidden=false; $('identity').textContent=`${user.username} • ${user.role}`;
  $('capture').hidden=user.role!=='assistant'; $('admin').hidden=user.role!=='admin'; $('review-tools').hidden=!['reviewer','admin'].includes(user.role); $('review-tools').querySelector('a').hidden=user.role!=='reviewer';
  if(user.role==='support'){const m=await api('/metrics'); $('counts').textContent=JSON.stringify(m); return;}
  config=await api('/config'); $('settings').value=JSON.stringify(config,null,2); $('contact-fields').replaceChildren(); $('dropdown-fields').replaceChildren();
  for(const k of fields){const l=text($('contact-fields'),'label',labels[k]);const i=document.createElement('input');i.name=k;i.maxLength=k==='email'?80:100;l.append(i);}
  for(const [k,values] of Object.entries(config.dropdowns)){const l=text($('dropdown-fields'),'label',labels[k]);const s=document.createElement('select');s.name=k;for(const v of ['',...values]){const o=document.createElement('option');o.value=v;o.textContent=v||'Select';s.append(o);}l.append(s);}
  if(user.role==='admin')await users(); await refresh();
}
async function users(){const list=await api('/users');$('users').replaceChildren();for(const u of list){const p=text($('users'),'p',`${u.username} • ${u.role} • ${u.active?'active':'revoked'}`);if(u.active&&u.id!==user.id)p.append(button('Revoke access',async()=>{await api(`/users/${u.id}/revoke`,'POST',{});await users();}));}}
function edit(r){const f=$('record-form');for(const [k,v] of Object.entries({...r.data,id:r.id,version:r.version})){const el=f.elements.namedItem(k);if(el){if(el.type==='checkbox')el.checked=v;else el.value=v;}}f.scrollIntoView();}
async function refresh(){records=await api('/records');$('records').replaceChildren();$('counts').textContent=`${records.length} records • ${records.filter(r=>r.status==='transfer_failed').length} failed transfers`;for(const r of records){const a=document.createElement('article');text(a,'h3',`${r.data.fullName} • ${r.status.replaceAll('_',' ')}`);text(a,'p',`${r.data.companyName} | ${r.data.email} | ${r.data.phone} | ${r.data.event}`);text(a,'p',r.data.notes);if(r.errorCode)text(a,'p',`${r.errorCode}${r.uncertain?' — reconciliation required':''}`);if(r.ccId)text(a,'p',`Constant Contact receipt: ${r.ccId}`);
  const action=async name=>{await api(`/records/${r.id}/action`,'POST',{action:name,version:r.version});await refresh();};
  if(user.role==='assistant'&&r.status==='draft'){a.append(button('Edit draft',()=>edit(r)),button('Submit for review',()=>action('submit')));const front=document.createElement('input');front.type='file';front.accept='image/png,image/jpeg';front.setAttribute('aria-label','Fictional front card');const back=front.cloneNode();back.setAttribute('aria-label','Fictional back card');a.append(front,back,button('Extract front and back',async()=>{const f=new FormData();if(front.files[0])f.append('front',front.files[0]);if(back.files[0])f.append('back',back.files[0]);const d=await api(`/records/${r.id}/ocr`,'POST',f);edit({...r,data:{...r.data,...Object.fromEntries(fields.map(k=>[k,d.parsed[k]||r.data[k]]))}});$('message').textContent='Review extracted fields and save the draft.';}));}
  if(user.role==='reviewer'){
    if(['submitted','possible_duplicate'].includes(r.status)){a.append(button('Show duplicate candidates',async()=>{text(a,'pre',JSON.stringify(await api(`/records/${r.id}/duplicates`),null,2));}),button('Approve',()=>action('approve')),button('Distinct contact after review',()=>action('distinct')),button('Request correction',()=>action('correct')),button('Reject',()=>action('reject')));}
    if(['approved','transfer_failed'].includes(r.status))a.append(button('Transfer or retry',async()=>{await api(`/records/${r.id}/transfer`,'POST',{});await refresh();}));
    if(r.uncertain||r.remoteMatches?.length){const input=document.createElement('input');input.placeholder='Verified existing Constant Contact ID';a.append(input,button('Link verified existing contact',async()=>{await api(`/records/${r.id}/reconcile`,'POST',{contactId:input.value});await refresh();}));}
    if(['draft','submitted','possible_duplicate','rejected'].includes(r.status))a.append(button('Archive',()=>action('archive')));
  }
  if(['admin','reviewer'].includes(user.role))a.append(button('Delete temporary images',async()=>{await api(`/records/${r.id}/images`,'DELETE');$('message').textContent='Temporary images deleted.';}));$('records').append(a);
}}
$('login-form').onsubmit=run(async e=>{e.preventDefault();await start(await api('/login','POST',formBody(e.target)));});
$('logout').onclick=run(async()=>{await api('/logout','POST',{});location.reload();});$('refresh').onclick=run(refresh);
$('record-form').onsubmit=run(async e=>{e.preventDefault();const b=formBody(e.target);const {id,version,...data}=b;data.fictional=true;if(id)await api(`/records/${id}`,'PUT',{version:Number(version),data});else await api('/records','POST',data);e.target.reset();e.target.elements.id.value='';await refresh();});
$('clear').onclick=()=>{$('record-form').reset();$('record-form').elements.id.value='';};
$('config-form').onsubmit=run(async e=>{e.preventDefault();await api('/config','PUT',JSON.parse($('settings').value));$('message').textContent='Settings saved. Refresh the page to reload dropdowns.';});
$('user-form').onsubmit=run(async e=>{e.preventDefault();const {expiry,...b}=formBody(e.target);if(expiry)b.expiresAt=new Date(expiry+'Z').getTime();await api('/users','POST',b);e.target.reset();await users();});
$('connect').onclick=run(async()=>{location.href=(await api('/cc/connect','POST',{})).url;});
$('cc-options').onclick=run(async()=>{$('cc-result').textContent=JSON.stringify(await api('/cc/options'),null,2);});
$('cc-form').onsubmit=run(async e=>{e.preventDefault();await api('/cc/config','PUT',{...formBody(e.target),testAccountConfirmed:true});$('message').textContent='Transfer mapping saved.';});
$('audit-button').onclick=run(async()=>{$('audit').textContent=JSON.stringify(await api('/audit'),null,2);});
api('/me').then(start).catch(()=>{});
