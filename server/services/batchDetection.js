const GOOGLE_VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/**
 * Detect individual business card regions in a batch photo by sending the image
 * to Google Cloud Vision TEXT_DETECTION and spatially clustering the word-level
 * bounding boxes returned.
 *
 * Returns an array of { x, y, width, height } rectangles in original-image pixel
 * coordinates, sorted top-to-bottom then left-to-right.
 */
export async function detectCardsInImage(imageBuffer, apiKey, fetcher = fetch) {
  if (!apiKey?.trim()) throw new Error("Vision API key not configured.");

  const response = await fetcher(GOOGLE_VISION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey.trim(),
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: Buffer.from(imageBuffer).toString("base64") },
          features: [{ type: "TEXT_DETECTION" }],
        },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) throw new Error("Vision API request failed.");
  const data = await response.json();
  const first = data?.responses?.[0];
  if (!first || first.error) throw new Error("Vision processing error.");

  const annotations = first.textAnnotations;
  if (!annotations || annotations.length < 2) return [];

  /* Parse word bounding boxes (index 0 = full text summary — skip). */
  const words = [];
  for (let i = 1; i < annotations.length; i++) {
    const verts = annotations[i].boundingPoly?.vertices;
    if (!verts || verts.length < 4) continue;
    const xs = verts.map((v) => v.x ?? 0);
    const ys = verts.map((v) => v.y ?? 0);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;
    if (w > 1 && h > 1) words.push({ x, y, width: w, height: h });
  }

  if (words.length < 3) return [];
  return clusterIntoCards(words);
}

/* ─── helpers ───────────────────────────────────────────────────────────── */

/** Minimum edge-to-edge gap between two axis-aligned boxes (0 when touching). */
function gapBetween(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(dx, dy);
}

/**
 * Cluster word boxes into card regions via union-find.
 *
 * Threshold = median word height × 4.5 — bridges lines within one card but
 * leaves clear inter-card gaps untouched.
 */
function clusterIntoCards(words) {
  const parent = words.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const merge = (a, b) => {
    parent[find(a)] = find(b);
  };

  const heights = words.map((w) => w.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] || 12;
  const threshold = median * 4.5;

  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      if (gapBetween(words[i], words[j]) < threshold) merge(i, j);
    }
  }

  const groups = {};
  for (let i = 0; i < words.length; i++) {
    const root = find(i);
    (groups[root] ||= []).push(words[i]);
  }

  const MIN_WORDS = 3;
  return Object.values(groups)
    .filter((g) => g.length >= MIN_WORDS)
    .map((group) => {
      let x1 = Infinity,
        y1 = Infinity,
        x2 = 0,
        y2 = 0;
      for (const w of group) {
        x1 = Math.min(x1, w.x);
        y1 = Math.min(y1, w.y);
        x2 = Math.max(x2, w.x + w.width);
        y2 = Math.max(y2, w.y + w.height);
      }
      const bw = x2 - x1;
      const bh = y2 - y1;
      const px = Math.round(bw * 0.06);
      const py = Math.round(bh * 0.08);
      return {
        x: Math.max(0, x1 - px),
        y: Math.max(0, y1 - py),
        width: bw + px * 2,
        height: bh + py * 2,
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
