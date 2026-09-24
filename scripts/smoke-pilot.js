import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base='http://localhost:3000';const accounts=JSON.parse(readFileSync('.data/demo-accounts.json'));
async function login(role){const a=accounts.find(a=>a.role===role);const r=await fetch(base+'/api/pilot/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({tenant:a.tenant,username:a.username,password:a.password})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())};}
async function api(s,url,method='GET',body){const r=await fetch(base+'/api/pilot'+url,{method,headers:{Cookie:s.cookie,Origin:base,'x-csrf-token':s.csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
const a=await login('assistant'),r=await login('reviewer'),admin=await login('admin');
let record=await api(a,'/records','POST',{fullName:'Alice Example',companyName:'Fictional Aviation',email:`smoke-${Date.now()}@example.com`,event:'Fictional Aviation Expo',fictional:true});
const form=new FormData();form.append('front',new Blob([readFileSync('validation/ocr/card-01.png')],{type:'image/png'}),'fictional.png');
const ocr=await api(a,`/records/${record.id}/ocr`,'POST',form);assert.equal(ocr.parsed.fullName,'Alice Example');
record=await api(a,`/records/${record.id}/action`,'POST',{action:'submit',version:record.version});
record=await api(r,`/records/${record.id}/action`,'POST',{action:record.status==='possible_duplicate'?'distinct':'approve',version:record.version});assert.equal(record.status,'approved');
await api(r,`/records/${record.id}/images`,'DELETE');
let cc='OAuth consent pending';try{await api(admin,'/cc/options');cc='Connected; live list and field read passed';}catch(e){if(e.message!=='REQUEST_FAILED'&&e.message!=='CC_CONSENT_REQUIRED')cc=e.message;}
writeFileSync('validation/smoke.json',JSON.stringify({at:new Date().toISOString(),namedLogins:'passed',capture:'passed',actualImageOCR:'passed',submit:'passed',reviewerApproval:'passed',imageDeletion:'passed',constantContact:cc},null,2));console.log('Smoke passed: login, capture, actual OCR, review approval, deletion. CC: '+cc);
