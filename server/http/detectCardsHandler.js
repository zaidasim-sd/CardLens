/**
 * POST /api/detect-cards
 * ──────────────────────
 * Detects individual business card regions in a multi-card photo.
 *
 * ROBUST MULTI-CARD SEPARATION ALGORITHM
 * ──────────────────────────────────────
 * 1. Call Google Vision TEXT_DETECTION & OBJECT_LOCALIZATION.
 * 2. Extract word bounding boxes in original pixel space.
 * 3. Compute adaptive gap thresholds based on local median word height.
 * 4. Cluster words using constrained union-find:
 *    - Word-to-word edge gap within adaptive threshold
 *    - STRICT CARD BOUNDARY GUARD: A cluster CANNOT exceed physical card limits
 *      (max 42% width, max 42% height, max 20% total image area).
 *      This mathematically prevents all cards on a desk from merging into one.
 * 5. Valley-split oversized or touching card clusters.
 * 6. Expand text clusters with natural card margins (12-16% padding).
 * 7. Validate aspect ratios (0.42 to 2.8) and filter duplicates.
 * 8. Return up to 10 sorted, non-overlapping card regions.
 */

import { authenticate, verifyCsrf } from "../auth/service.js";
import { requireAction } from "../auth/permissions.js";
import { parseCookies, SESSION_COOKIE } from "../auth/cookies.js";
import { getDb, ensureDatabaseIndexes } from "../db.js";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";
const MAX_BYTES  = 20 * 1024 * 1024;

// ─── Physical card constraints for multi-card batch photos ───────────────────
const MIN_WORDS_PER_CARD   = 2;
const MAX_CARDS            = 10;
const MAX_CARD_WIDTH_FRAC  = 0.45;  // Single card is never wider than 45% of image
const MAX_CARD_HEIGHT_FRAC = 0.45;  // Single card is never taller than 45% of image
const MAX_CARD_AREA_FRAC   = 0.22;  // Single card is never larger than 22% of image
const MIN_CARD_AREA_FRAC   = 0.006; // Ignore tiny specks (< 0.6% of image)
const MIN_ASPECT           = 0.38;  // Portrait cards (e.g. 0.55 - 0.7)
const MAX_ASPECT           = 3.2;   // Landscape cards (e.g. 1.4 - 1.8)
const PAD_X_FRAC           = 0.12;  // 12% margin around text for card body
const PAD_Y_FRAC           = 0.16;  // 16% margin around text for card body

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeErr(code, status, message) {
  return Object.assign(new Error(message), { code, status });
}

function allowedOrigins(env) {
  const list = String(env.ALLOWED_ORIGINS || env.APP_BASE_URL || env.APP_ORIGIN || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (env.APP_ENV === "development" || env.NODE_ENV !== "production") {
    return [...new Set([
      ...list,
      "https://localhost:5173", "http://localhost:5173",
      "https://localhost:5174", "http://localhost:5174",
      "https://localhost:5175", "http://localhost:5175",
      "https://127.0.0.1:5173", "http://127.0.0.1:5173",
      "https://127.0.0.1:5174", "http://127.0.0.1:5174",
      "https://127.0.0.1:5175", "http://127.0.0.1:5175",
    ])];
  }
  return list;
}

function isLanOrigin(origin) {
  return /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
}

function verifyOrigin(req, env) {
  const origin = String(req.headers.origin || "");
  if (!origin) throw makeErr("ORIGIN_DENIED", 403, "Origin required.");
  const isDev = env.APP_ENV === "development" || env.NODE_ENV !== "production";
  if (isDev && isLanOrigin(origin)) return;
  if (!allowedOrigins(env).includes(origin)) throw makeErr("ORIGIN_DENIED", 403, "Origin not allowed.");
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES * 2) throw makeErr("IMAGE_TOO_LARGE", 413, "Image too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function extractImageFromMultipart(body, contentType) {
  if (!contentType.includes("multipart/form-data")) {
    return { data: body, mime: contentType.split(";")[0].toLowerCase() || "image/jpeg" };
  }
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
  if (!boundary) throw makeErr("IMAGE_REQUIRED", 400, "No boundary in multipart.");
  const marker = Buffer.from(`--${boundary}`);
  let cursor = body.indexOf(marker);
  while (cursor >= 0) {
    const next = body.indexOf(marker, cursor + marker.length);
    if (next < 0) break;
    const part = body.subarray(cursor + marker.length, next);
    const hEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (hEnd >= 0) {
      const hdr  = part.subarray(0, hEnd).toString("utf8");
      const name = hdr.match(/name="([^"]+)"/i)?.[1];
      const mime = hdr.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
      if (name === "image" || name === "file") {
        let data = part.subarray(hEnd + 4);
        if (data.subarray(-2).equals(Buffer.from("\r\n"))) data = data.subarray(0, -2);
        if (!data.length) throw makeErr("IMAGE_REQUIRED", 400, "Empty image.");
        if (data.length > MAX_BYTES) throw makeErr("IMAGE_TOO_LARGE", 413, "Image too large.");
        return { data, mime: mime || "image/jpeg" };
      }
    }
    cursor = next;
  }
  throw makeErr("IMAGE_REQUIRED", 400, "No image field in multipart.");
}

// ─── Read JPEG/PNG dimensions from raw bytes ──────────────────────────────────
function readImageDimensions(buf) {
  try {
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let pos = 2;
      while (pos < buf.length - 8) {
        if (buf[pos] !== 0xFF) break;
        const marker = buf[pos + 1];
        const len    = (buf[pos + 2] << 8) | buf[pos + 3];
        if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7)) {
          return {
            h: (buf[pos + 5] << 8) | buf[pos + 6],
            w: (buf[pos + 7] << 8) | buf[pos + 8],
          };
        }
        pos += 2 + len;
      }
    }
    // PNG
    if (buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return {
        w: (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19],
        h: (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23],
      };
    }
  } catch { /* */ }
  return { w: 0, h: 0 };
}

// ─── Google Vision call ───────────────────────────────────────────────────────
async function callVisionTextDetection(imageBuffer, apiKey) {
  const b64  = Buffer.from(imageBuffer).toString("base64");
  const body = JSON.stringify({
    requests: [{
      image: { content: b64 },
      features: [
        { type: "TEXT_DETECTION", maxResults: 500 },
        { type: "OBJECT_LOCALIZATION", maxResults: 50 },
      ],
    }],
  });

  const resp = await fetch(VISION_URL, {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body,
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw makeErr("VISION_FAILED", 502, `Google Vision error ${resp.status}: ${t.slice(0, 200)}`);
  }

  const result = await resp.json();
  const vr = result?.responses?.[0];
  if (vr?.error) throw makeErr("VISION_FAILED", 502, `Vision error: ${vr.error.message}`);
  return vr;
}

// ─── Extract word-level bounding boxes (pixel space) ─────────────────────────
function extractWordBoxes(visionResponse) {
  const annotations = visionResponse?.textAnnotations || [];
  const boxes = [];

  for (let i = 1; i < annotations.length; i++) {
    const verts = annotations[i]?.boundingPoly?.vertices;
    if (!verts || verts.length < 4) continue;
    const xs = verts.map(v => v.x ?? 0);
    const ys = verts.map(v => v.y ?? 0);
    const x1 = Math.min(...xs), x2 = Math.max(...xs);
    const y1 = Math.min(...ys), y2 = Math.max(...ys);
    const width = x2 - x1;
    const height = y2 - y1;
    if (width < 3 || height < 3) continue; // skip noise
    boxes.push({
      x1, y1, x2, y2,
      width, height,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
    });
  }
  return boxes;
}

// ─── Overlap ratio (Intersection over Union) ─────────────────────────────────
function boxOverlap(a, b) {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const interArea = (ix2 - ix1) * (iy2 - iy1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return interArea / Math.min(areaA, areaB);
}

// ─── Constrained Single-Card Clustering ─────────────────────────────────────
/**
 * Clusters word boxes into individual cards.
 * Prevents conglomerate merges:
 *   - Edge-to-edge distance must be <= adaptive gap
 *   - The merged box CANNOT exceed single-card physical dimensions
 */
function clusterWordsIntoCards(words, imgW, imgH) {
  const n = words.length;
  if (n === 0) return [];

  // Compute median word height to make gaps font-scale adaptive
  const heights = words.map(w => w.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 20;

  // Adaptive line and word spacing thresholds
  const maxDx = Math.max(22, Math.min(imgW * 0.06, medianH * 3.6));
  const maxDy = Math.max(16, Math.min(imgH * 0.06, medianH * 2.6));

  // Physical card size limits (a card in a multi-card photo cannot exceed these)
  const maxCardW    = imgW * MAX_CARD_WIDTH_FRAC;
  const maxCardH    = imgH * MAX_CARD_HEIGHT_FRAC;
  const maxCardArea = (imgW * imgH) * MAX_CARD_AREA_FRAC;

  // Disjoint-set with bounding box tracking
  const parent = Array.from({ length: n }, (_, i) => i);
  const clusterBoxes = words.map(w => ({
    x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
    wordCount: 1,
    words: [w],
  }));

  function find(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }

  function tryMerge(i, j) {
    const ra = find(i);
    const rb = find(j);
    if (ra === rb) return;

    const bA = clusterBoxes[ra];
    const bB = clusterBoxes[rb];

    const nx1 = Math.min(bA.x1, bB.x1);
    const ny1 = Math.min(bA.y1, bB.y1);
    const nx2 = Math.max(bA.x2, bB.x2);
    const ny2 = Math.max(bA.y2, bB.y2);
    const nw  = nx2 - nx1;
    const nh  = ny2 - ny1;
    const narea = nw * nh;

    // CARD INTEGRITY GUARD: If merging would create a super-cluster larger
    // than a physical single card, DO NOT MERGE! They belong to different cards.
    if (nw > maxCardW || nh > maxCardH || narea > maxCardArea) {
      return;
    }

    // Merge rb into ra
    parent[rb] = ra;
    clusterBoxes[ra] = {
      x1: nx1, y1: ny1, x2: nx2, y2: ny2,
      wordCount: bA.wordCount + bB.wordCount,
      words: bA.words.concat(bB.words),
    };
  }

  // Pass 1: Local word clustering with strict gap & size limits
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = words[i];
      const b = words[j];
      const dx = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
      const dy = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2));

      if (dx <= maxDx && dy <= maxDy) {
        tryMerge(i, j);
      }
    }
  }

  // Collect unique clusters
  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) {
      clusters.set(root, clusterBoxes[root]);
    }
  }

  // Pass 2: Merge small disjoint fragments belonging to the same card
  // (e.g. logo at top, contact block at bottom of the same card)
  const clusterList = [...clusters.values()].filter(c => c.wordCount >= 1);
  const clusterParent = Array.from({ length: clusterList.length }, (_, i) => i);
  function findC(i) {
    while (clusterParent[i] !== i) { clusterParent[i] = clusterParent[clusterParent[i]]; i = clusterParent[i]; }
    return i;
  }

  for (let i = 0; i < clusterList.length; i++) {
    for (let j = i + 1; j < clusterList.length; j++) {
      const cA = clusterList[findC(i)];
      const cB = clusterList[findC(j)];
      if (findC(i) === findC(j)) continue;

      const dx = Math.max(0, Math.max(cA.x1, cB.x1) - Math.min(cA.x2, cB.x2));
      const dy = Math.max(0, Math.max(cA.y1, cB.y1) - Math.min(cA.y2, cB.y2));

      // Small secondary gap for fragments on same card
      const fragGapX = Math.max(25, medianH * 3.8);
      const fragGapY = Math.max(20, medianH * 3.2);

      if (dx <= fragGapX && dy <= fragGapY) {
        const nx1 = Math.min(cA.x1, cB.x1);
        const ny1 = Math.min(cA.y1, cB.y1);
        const nx2 = Math.max(cA.x2, cB.x2);
        const ny2 = Math.max(cA.y2, cB.y2);
        const nw  = nx2 - nx1;
        const nh  = ny2 - ny1;
        const narea = nw * nh;

        if (nw <= maxCardW && nh <= maxCardH && narea <= maxCardArea) {
          const rA = findC(i);
          const rB = findC(j);
          clusterParent[rB] = rA;
          clusterList[rA] = {
            x1: nx1, y1: ny1, x2: nx2, y2: ny2,
            wordCount: cA.wordCount + cB.wordCount,
            words: cA.words.concat(cB.words),
          };
        }
      }
    }
  }

  // Filter and build finalized card rects
  const finalGroupRoots = new Set(clusterList.map((_, i) => findC(i)));
  const finalGroups = [...finalGroupRoots].map(root => clusterList[root]);

  return finalGroups;
}

// ─── Valley Splitting for Conglomerate Clusters ──────────────────────────────
/**
 * If a cluster somehow contains 2 cards placed side-by-side or stacked,
 * find the projection gap (valley) and split it into two cards.
 */
function valleySplitIfOversized(cluster, imgW, imgH) {
  const w = cluster.x2 - cluster.x1;
  const h = cluster.y2 - cluster.y1;
  const area = w * h;
  const maxW = imgW * 0.40;
  const maxH = imgH * 0.40;
  const maxArea = (imgW * imgH) * 0.18;

  if (w <= maxW && h <= maxH && area <= maxArea) {
    return [cluster];
  }

  // Check if we should split horizontally (two cards side by side)
  if (w > maxW || (w / Math.max(1, h) > 2.2)) {
    const sorted = [...cluster.words].sort((a, b) => a.cx - b.cx);
    let maxGap = 0;
    let splitX = (cluster.x1 + cluster.x2) / 2;

    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].x1 - sorted[i].x2;
      const mid = (sorted[i].x2 + sorted[i + 1].x1) / 2;
      // Split must be within central 20%-80% of cluster
      if (mid > cluster.x1 + w * 0.20 && mid < cluster.x2 - w * 0.20 && gap > maxGap) {
        maxGap = gap;
        splitX = mid;
      }
    }

    const leftWords  = cluster.words.filter(w => w.cx < splitX);
    const rightWords = cluster.words.filter(w => w.cx >= splitX);

    if (leftWords.length >= MIN_WORDS_PER_CARD && rightWords.length >= MIN_WORDS_PER_CARD) {
      const toBox = (words) => ({
        x1: Math.min(...words.map(w => w.x1)),
        y1: Math.min(...words.map(w => w.y1)),
        x2: Math.max(...words.map(w => w.x2)),
        y2: Math.max(...words.map(w => w.y2)),
        wordCount: words.length,
        words,
      });
      return [toBox(leftWords), toBox(rightWords)];
    }
  }

  // Check if we should split vertically (two cards stacked)
  if (h > maxH || (w / Math.max(1, h) < 0.65)) {
    const sorted = [...cluster.words].sort((a, b) => a.cy - b.cy);
    let maxGap = 0;
    let splitY = (cluster.y1 + cluster.y2) / 2;

    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].y1 - sorted[i].y2;
      const mid = (sorted[i].y2 + sorted[i + 1].y1) / 2;
      if (mid > cluster.y1 + h * 0.20 && mid < cluster.y2 - h * 0.20 && gap > maxGap) {
        maxGap = gap;
        splitY = mid;
      }
    }

    const topWords    = cluster.words.filter(w => w.cy < splitY);
    const bottomWords = cluster.words.filter(w => w.cy >= splitY);

    if (topWords.length >= MIN_WORDS_PER_CARD && bottomWords.length >= MIN_WORDS_PER_CARD) {
      const toBox = (words) => ({
        x1: Math.min(...words.map(w => w.x1)),
        y1: Math.min(...words.map(w => w.y1)),
        x2: Math.max(...words.map(w => w.x2)),
        y2: Math.max(...words.map(w => w.y2)),
        wordCount: words.length,
        words,
      });
      return [toBox(topWords), toBox(bottomWords)];
    }
  }

  return [cluster];
}

// ─── Expand and finalize card regions ────────────────────────────────────────
function finalizeCards(clusters, imgW, imgH) {
  const imgArea = imgW * imgH || 1;
  const cards = [];

  for (const c of clusters) {
    if (c.wordCount < MIN_WORDS_PER_CARD) continue;

    const bw = c.x2 - c.x1;
    const bh = c.y2 - c.y1;

    // Expand by margin padding so the card paper boundary is captured
    const padX = Math.max(15, Math.round(bw * PAD_X_FRAC));
    const padY = Math.max(12, Math.round(bh * PAD_Y_FRAC));

    const x = Math.max(0, c.x1 - padX);
    const y = Math.max(0, c.y1 - padY);
    const w = Math.min(imgW - x, (c.x2 + padX) - x);
    const h = Math.min(imgH - y, (c.y2 + padY) - y);

    const area = w * h;
    const aspect = w / Math.max(1, h);

    // Filter noise / full image errors
    if (
      area >= imgArea * MIN_CARD_AREA_FRAC &&
      area <= imgArea * MAX_CARD_AREA_FRAC &&
      aspect >= MIN_ASPECT &&
      aspect <= MAX_ASPECT &&
      w >= 40 &&
      h >= 30
    ) {
      cards.push({ x, y, w, h, x1: x, y1: y, x2: x + w, y2: y + h });
    }
  }

  // Remove overlapping duplicates (IoU > 0.45)
  const nonOverlapping = [];
  for (const card of cards) {
    const isDup = nonOverlapping.some(existing => boxOverlap(existing, card) > 0.45);
    if (!isDup) {
      nonOverlapping.push(card);
    }
  }

  // Sort top-to-bottom, left-to-right
  return nonOverlapping
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, MAX_CARDS);
}

// ─── Google Vision Object Localization Fallback ──────────────────────────────
function objectLocalizationFallback(visionResponse, imgW, imgH) {
  const objects = visionResponse?.localizedObjectAnnotations || [];
  const results = [];

  for (const obj of objects) {
    const verts = obj.boundingPoly?.normalizedVertices;
    if (!verts || verts.length < 4) continue;
    const xs = verts.map(v => (v.x ?? 0) * imgW);
    const ys = verts.map(v => (v.y ?? 0) * imgH);
    const x = Math.max(0, Math.min(...xs));
    const y = Math.max(0, Math.min(...ys));
    const w = Math.min(imgW - x, Math.max(...xs) - x);
    const h = Math.min(imgH - y, Math.max(...ys) - y);
    const area = w * h;
    const aspect = w / Math.max(1, h);

    if (
      area >= imgW * imgH * 0.01 &&
      area <= imgW * imgH * 0.25 &&
      aspect >= 0.4 &&
      aspect <= 3.0 &&
      w >= 50 &&
      h >= 35
    ) {
      results.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
  }

  return results.slice(0, MAX_CARDS);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function detectCardsHandler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

    const env = process.env;
    verifyOrigin(req, env);

    const db = await getDb();
    await ensureDatabaseIndexes(db);
    const tok      = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    const signedIn = await authenticate(db, tok);
    verifyCsrf(signedIn.session, req.headers["x-csrf-token"]);
    requireAction(signedIn.user, "use_ocr");

    const apiKey = env.GOOGLE_VISION_API_KEY?.trim();
    if (!apiKey) return res.status(503).json({ error: "OCR service not configured." });

    const body        = await readBody(req);
    const contentType = String(req.headers["content-type"] || "");
    const { data: imgBuf } = extractImageFromMultipart(body, contentType);

    // Image dimensions
    const { w: imgW, h: imgH } = readImageDimensions(imgBuf);

    // Call Google Vision (TEXT_DETECTION + OBJECT_LOCALIZATION)
    const vr        = await callVisionTextDetection(imgBuf, apiKey);
    const wordBoxes = extractWordBoxes(vr);

    let cardRects = [];

    if (wordBoxes.length >= MIN_WORDS_PER_CARD && imgW > 0 && imgH > 0) {
      // 1. Constrained clustering preventing super-cluster merges
      const initialClusters = clusterWordsIntoCards(wordBoxes, imgW, imgH);

      // 2. Valley-split any cluster that still exceeds physical card boundaries
      const postSplitClusters = [];
      for (const cl of initialClusters) {
        postSplitClusters.push(...valleySplitIfOversized(cl, imgW, imgH));
      }

      // 3. Finalize card coordinates with paper margins
      cardRects = finalizeCards(postSplitClusters, imgW, imgH);
    }

    // Fallback: If text clustering found 0 cards (e.g. blank cards / logos), check objects
    if (cardRects.length === 0 && imgW > 0 && imgH > 0) {
      cardRects = objectLocalizationFallback(vr, imgW, imgH);
    }

    // Shape response
    const cards = cardRects.map((r, i) => ({
      id:     `det-${i + 1}-${Date.now().toString(36)}`,
      number: i + 1,
      x:      Math.round(r.x),
      y:      Math.round(r.y),
      width:  Math.round(r.w),
      height: Math.round(r.h),
      source: "auto",
    }));

    console.log(
      `[detect-cards] imgW=${imgW} imgH=${imgH} words=${wordBoxes.length} → detected cards=${cards.length}`
    );

    return res.status(200).json({
      cards,
      imageWidth:  imgW || null,
      imageHeight: imgH || null,
      count:       cards.length,
    });

  } catch (caught) {
    console.error("[detect-cards]", caught.code || "", caught.message);
    return res.status(caught.status || 500).json({
      error: caught.message || "Card detection failed.",
      code:  caught.code   || "DETECT_FAILED",
    });
  }
}
