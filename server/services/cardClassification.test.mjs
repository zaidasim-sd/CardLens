import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCardText, classifyWithGemini, validateClassification } from './cardClassification.js';
import { getEmptyFields, parseOCRText } from './cardParser.js';

const raw='Northstar Aviation Ltd\nAmina Hassan\nFlight Operations Manager\namina@northstar.aero\nTel: +92 300 1234567\nKarachi, Pakistan';
const fields={...getEmptyFields(),fullName:'Amina Hassan',companyName:'Northstar Aviation Ltd',jobTitle:'Flight Operations Manager',email:'amina@northstar.aero',phone:'+92 300 1234567',city:'Karachi',country:'Pakistan'};
const reply=value=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})});

test('complete OCR is sent server-side using header key and strict JSON schema',async()=>{
 let called=0;
 const result=await classifyCardText(raw,{env:{GEMINI_API_KEY:'fake-key'},fetcher:async(url,options)=>{
  called++;assert.equal(url.includes('fake-key'),false);assert.equal(options.headers['x-goog-api-key'],'fake-key');
  const request=JSON.parse(options.body);
  assert.equal(request.contents[0].parts[0].text,raw);
  const prompt=request.systemInstruction.parts[0].text;
  assert.ok(prompt.includes('Decide entities jointly'));
  assert.ok(prompt.includes('Extract contact methods independently'));
  assert.equal(prompt.includes('Jim Glover'),false);
  assert.equal(prompt.includes('THE COUNTER'),false);
  assert.equal(request.generationConfig.responseMimeType,'application/json');
  assert.equal(request.generationConfig.responseJsonSchema.additionalProperties,false);
  assert.ok(options.signal);return reply(fields);
 }});
 assert.equal(called,1);assert.deepEqual(result,fields);
});
test('missing key uses existing parser without a network call',async()=>{
 assert.deepEqual(await classifyCardText(raw,{env:{},fetcher:()=>assert.fail('network')}),parseOCRText(raw));
});
for(const status of [400,401,403,429,500,503]) test(`HTTP ${status} silently falls back with no retries`,async()=>{
 let calls=0;
 assert.deepEqual(await classifyCardText(raw,{env:{GEMINI_API_KEY:'fake'},fetcher:async()=>{calls++;return {ok:false,status};}}),parseOCRText(raw));
 assert.equal(calls,1);
});
test('timeout aborts and falls back even if upstream ignores cancellation',async()=>{
 let signal;
 const start=Date.now();
 const result=await classifyCardText(raw,{env:{GEMINI_API_KEY:'fake'},timeoutMs:100,fetcher:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}});
 assert.deepEqual(result,parseOCRText(raw));assert.equal(signal.aborted,true);assert.ok(Date.now()-start<1000);
});
test('timeout covers body decoding too',async()=>{
 assert.deepEqual(await classifyCardText(raw,{env:{GEMINI_API_KEY:'fake'},timeoutMs:100,fetcher:async()=>({ok:true,json:()=>new Promise(()=>{})})}),parseOCRText(raw));
});
for(const value of [null,[],{...fields,email:42},{...fields,fullName:'Invented Person'},{...fields,companyName:'amina@northstar.aero'},{...fields,phone:'12345'},{...fields,notes:'fabricated'},{...fields,unexpected:'value'},getEmptyFields()]) test('invalid or ungrounded classification falls back',async()=>{
 assert.deepEqual(await classifyCardText(raw,{env:{GEMINI_API_KEY:'fake'},fetcher:async()=>reply(value)}),parseOCRText(raw));
});
test('malformed JSON and truncated output fall back',async()=>{
 for(const response of [{candidates:[{finishReason:'STOP',content:{parts:[{text:'bad json'}]}}]},{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify(fields)}]}}]}]) {
  assert.deepEqual(await classifyCardText(raw,{env:{GEMINI_API_KEY:'fake'},fetcher:async()=>({ok:true,json:async()=>response})}),parseOCRText(raw));
 }
});
test('OCR domain spacing and attached extensions remain grounded',()=>{
 const result=validateClassification({...getEmptyFields(),fullName:'Alexis Beckman',email:'info@culturefrozenyogurt.com',phone:'81 294 52 5111 ext. 5367'},'Alexis Beckman\ninfo@culturefrozen yogurt.com\nTEL:81 294 52 5111x5367');
 assert.equal(result.email,'info@culturefrozenyogurt.com');assert.equal(result.phone,'81 294 52 5111 ext. 5367');
});
test('direct classifier failure is distinguishable for server-side diagnostics',async()=>{
 await assert.rejects(classifyWithGemini(raw,{env:{}}));
});
test('printed IDs and fax numbers cannot become primary phones',()=>{
 for(const text of ['License: 6503240440','Postal: 6503240440','Fax: +1 650 324 0440']) {
  assert.throws(()=>validateClassification({...getEmptyFields(),phone:'6503240440'},text));
 }
});
test('grounded vanity phones do not discard a correct person and role',()=>{
 const raw='VINTAGE AIRLINER\nPhone: 1-888-VINTAGE\nBUY - SELL - TRADE\nJohn McDonnel, CEO';
 const result=validateClassification({...getEmptyFields(),fullName:'John McDonnel',jobTitle:'CEO',companyName:'VINTAGE AIRLINER',phone:'1-888-VINTAGE'},raw);
 assert.equal(result.fullName,'John McDonnel');assert.equal(result.jobTitle,'CEO');assert.equal(result.phone,'1-888-VINTAGE');
 assert.throws(()=>validateClassification({...getEmptyFields(),phone:'1-888-VINTAGE'},'Registration: 1-888-VINTAGE'));
});
