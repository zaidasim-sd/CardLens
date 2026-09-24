import { createWorker } from 'tesseract.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseOCRText } from '../server/services/cardParser.js';
const cases=JSON.parse(readFileSync('validation/ocr/manifest.json'));const worker=await createWorker('eng');const results=[];
const normalize=(v,k)=>k==='phone'?v.replace(/\D/g,''):v.trim().toLowerCase().replace(/\s+/g,' ');
for(const c of cases){const start=performance.now();let raw='';for(const file of c.files)raw+='\n'+(await worker.recognize(`validation/ocr/${file}`)).data.text;const parsed=parseOCRText(raw);const matches=Object.fromEntries(Object.entries(c.expected).map(([k,v])=>[k,normalize(parsed[k]||'',k)===normalize(v,k)]));results.push({id:c.id,category:c.category,milliseconds:Math.round(performance.now()-start),matches,manualCorrectionRequired:Object.values(matches).some(v=>!v),parsed});}
await worker.terminate();const summary={provider:'Tesseract.js local baseline, not a cloud-provider validation',cards:results.length,pages:cases.reduce((n,c)=>n+c.files.length,0),accuracy:Object.fromEntries(Object.keys(cases[0].expected).map(k=>[k,results.filter(r=>r.matches[k]).length/results.length])),meanMilliseconds:Math.round(results.reduce((n,r)=>n+r.milliseconds,0)/results.length),manualCorrectionCards:results.filter(r=>r.manualCorrectionRequired).length,results};writeFileSync('validation/ocr/results.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({...summary,results:undefined},null,2));
