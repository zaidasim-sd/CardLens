import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { fail } from './workflow.js';
let busy = false;
export async function extractImage(buffer, env) {
  if (busy) fail('OCR_BUSY_RETRY', 429);
  busy = true;
  let worker;
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 20000000 }).metadata();
    if (!['jpeg','png'].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000) fail('INVALID_IMAGE');
    // Decode fully to reject corrupt content and strip metadata before processing.
    const clean = await sharp(buffer, { limitInputPixels: 20000000 }).rotate().png().toBuffer();
    if (env.OCR_PROVIDER === 'google') {
      if (!env.GOOGLE_VISION_API_KEY) fail('APPROVED_OCR_NOT_CONFIGURED', 503);
      const response = await fetch('https://vision.googleapis.com/v1/images:annotate', { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GOOGLE_VISION_API_KEY }, body: JSON.stringify({ requests: [{ image: { content: clean.toString('base64') }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }] }) });
      if (!response.ok) fail('OCR_PROVIDER_FAILED', 502); const data = await response.json(); if (data.responses?.[0]?.error) fail('OCR_PROVIDER_FAILED', 502); return data.responses?.[0]?.fullTextAnnotation?.text || '';
    }
    if (env.OCR_PROVIDER && env.OCR_PROVIDER !== 'local') fail('OCR_PROVIDER_NOT_SUPPORTED', 503);
    worker = await createWorker('eng');
    let timer;
    try { return (await Promise.race([worker.recognize(clean), new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('OCR_TIMEOUT'),{code:'OCR_TIMEOUT',status:504})),30000);})])).data.text; }
    finally { clearTimeout(timer); }
  } finally { if(worker) await worker.terminate(); busy = false; }
}
