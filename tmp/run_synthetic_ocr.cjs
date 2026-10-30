const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = process.cwd();
  const folder = path.join(root, 'output', 'synthetic_cards');
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  const { parseOCRText } = await import(pathToFileURL(path.join(root, 'server', 'services', 'cardParser.js')));
  const tesseract = 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe';
  const results = [];
  for (const item of manifest) {
    const imagePath = path.join(folder, item.file);
    const start = performance.now();
    const child = spawnSync(tesseract, [imagePath, 'stdout', '--oem', '1', '--psm', '6', '-l', 'eng'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    const ocrMs = performance.now() - start;
    if (child.error || child.status !== 0) throw child.error || new Error(child.stderr);
    const rawText = child.stdout.trim();
    const cstart = performance.now();
    const parsed = parseOCRText(rawText);
    const classificationMs = performance.now() - cstart;
    const expected = { fullName: item.name, companyName: item.company, email: item.email, phone: item.phone, website: item.website };
    const matches = Object.fromEntries(Object.entries(expected).map(([k,v])=>[k, (parsed[k]||'').replace(/\s+/g,'').toLowerCase() === v.replace(/\s+/g,'').toLowerCase()]));
    const correct = Object.values(matches).filter(Boolean).length;
    results.push({ id:item.id, file:item.file, condition:item.condition, ocrMs:+ocrMs.toFixed(1), classificationMs:+classificationMs.toFixed(3), fullName:parsed.fullName, companyName:parsed.companyName, email:parsed.email, phone:parsed.phone, website:parsed.website, mappedFields:parsed, matches, matchCount:correct, requiredManualCorrection:correct<5, classificationMethod:'local manual parser (parseOCRText)', fallbackResult:'Not applicable; Gemini API was not called', rawText });
  }
  fs.writeFileSync(path.join(root,'output','synthetic_ocr_results.json'), JSON.stringify(results,null,2));
  const csvEscape=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const headers=['id','condition','ocrMs','classificationMs','fullName','companyName','email','phone','website','matchCount','requiredManualCorrection','fallbackResult'];
  const csv=[headers.join(','),...results.map(r=>headers.map(h=>csvEscape(r[h])).join(','))].join('\r\n');
  fs.writeFileSync(path.join(root,'output','synthetic_ocr_results.csv'),csv);
  const avg=results.reduce((a,r)=>a+r.ocrMs,0)/results.length;
  const perfect=results.filter(r=>r.matchCount===5).length;
  console.log(JSON.stringify({cards:results.length,averageOcrMs:+avg.toFixed(1),perfectFieldSets:perfect,readable:results.filter(r=>r.mappedFields.fullName||r.mappedFields.companyName||r.mappedFields.email||r.mappedFields.phone||r.mappedFields.website).length,recordsWithCorrections:results.filter(r=>r.requiredManualCorrection).length,output:'output/synthetic_ocr_results.csv'},null,2));
})();
