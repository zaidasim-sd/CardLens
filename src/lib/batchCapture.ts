import type { OCRData } from "@/types";

export type BatchRegionSource = "auto" | "manual" | "corrected";

export interface BatchImageMetadata {
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface BatchRegion {
  id: string;
  number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: BatchRegionSource;
}

export interface BatchQualityIssue {
  level: "warning" | "error";
  message: string;
}

export interface PreparedBatchImage {
  file: File;
  url: string;
  metadata: BatchImageMetadata;
  qualityIssues: BatchQualityIssue[];
  autoRegions: BatchRegion[];
}

const MAX_BATCH_CARDS = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_EDGE = 900;
const DETECTION_EDGE = 720;
const CROP_MAX_EDGE = 1600;

const DUMMY_CONTACTS: OCRData[] = [
  {
    fullName: "Amina Farooq",
    jobTitle: "Procurement Manager",
    companyName: "Orion Aero Spares",
    email: "amina.farooq@example.test",
    phone: "+1 555 010 2101",
    alternatePhone: "",
    website: "orion-aero.example.test",
    address: "",
    city: "Miami",
    country: "United States",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Daniel Mercer",
    jobTitle: "Director of Sales",
    companyName: "Northline Aviation Parts",
    email: "daniel.mercer@example.test",
    phone: "+1 555 010 2102",
    alternatePhone: "",
    website: "northline-parts.example.test",
    address: "",
    city: "Toronto",
    country: "Canada",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Sara Al Nuaimi",
    jobTitle: "Fleet Support Lead",
    companyName: "Gulf Horizon MRO",
    email: "sara.alnuaimi@example.test",
    phone: "+971 55 010 2103",
    alternatePhone: "",
    website: "gulf-horizon.example.test",
    address: "",
    city: "Dubai",
    country: "United Arab Emirates",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Miguel Santos",
    jobTitle: "Operations Coordinator",
    companyName: "Atlas Components Lab",
    email: "miguel.santos@example.test",
    phone: "+34 600 010 210",
    alternatePhone: "",
    website: "atlas-components.example.test",
    address: "",
    city: "Madrid",
    country: "Spain",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Nadia Chen",
    jobTitle: "AOG Response Manager",
    companyName: "Pacific Jet Support",
    email: "nadia.chen@example.test",
    phone: "+65 800 010 2105",
    alternatePhone: "",
    website: "pacific-jet.example.test",
    address: "",
    city: "Singapore",
    country: "Singapore",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Omar Haddad",
    jobTitle: "Commercial Lead",
    companyName: "Cedar Aero Trading",
    email: "omar.haddad@example.test",
    phone: "+961 1 010 2106",
    alternatePhone: "",
    website: "cedar-aero.example.test",
    address: "",
    city: "Beirut",
    country: "Lebanon",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Priya Raman",
    jobTitle: "Customer Success Manager",
    companyName: "Skyway Inventory Systems",
    email: "priya.raman@example.test",
    phone: "+91 80 0102 107",
    alternatePhone: "",
    website: "skyway-inventory.example.test",
    address: "",
    city: "Bengaluru",
    country: "India",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Thomas Reed",
    jobTitle: "Quality Assurance Lead",
    companyName: "Vector Engine Services",
    email: "thomas.reed@example.test",
    phone: "+44 20 0102 108",
    alternatePhone: "",
    website: "vector-engine.example.test",
    address: "",
    city: "London",
    country: "United Kingdom",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Yasmin Bello",
    jobTitle: "Regional Account Manager",
    companyName: "AeroBridge Logistics",
    email: "yasmin.bello@example.test",
    phone: "+234 1 010 2109",
    alternatePhone: "",
    website: "aerobridge.example.test",
    address: "",
    city: "Lagos",
    country: "Nigeria",
    notes: "Simulated batch OCR result for staging-only review.",
  },
  {
    fullName: "Zane Foster",
    jobTitle: "Parts Exchange Specialist",
    companyName: "Summit Turbine Exchange",
    email: "zane.foster@example.test",
    phone: "+1 555 010 2110",
    alternatePhone: "",
    website: "summit-turbine.example.test",
    address: "",
    city: "Denver",
    country: "United States",
    notes: "Simulated batch OCR result for staging-only review.",
  },
];

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function decodeImage(image: Blob): Promise<DecodedImage> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(image);
  const element = new Image();
  element.decoding = "async";
  element.src = url;
  await element.decode();
  return {
    source: element,
    width: element.naturalWidth,
    height: element.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image preparation failed."))), type, quality);
  });
}

function normalizeRegion(region: BatchRegion, maxWidth: number, maxHeight: number): BatchRegion {
  const x = Math.max(0, Math.min(region.x, maxWidth - 20));
  const y = Math.max(0, Math.min(region.y, maxHeight - 20));
  const width = Math.max(20, Math.min(region.width, maxWidth - x));
  const height = Math.max(20, Math.min(region.height, maxHeight - y));
  return { ...region, x, y, width, height };
}

function overlapRatio(a: BatchRegion, b: BatchRegion): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersection = width * height;
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea ? intersection / smallerArea : 0;
}

function averageCornerColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const samples: [number, number][] = [
    [4, 4],
    [width - 5, 4],
    [4, height - 5],
    [width - 5, height - 5],
  ];
  const total = samples.reduce(
    (sum, [x, y]) => {
      const index = (y * width + x) * 4;
      return [sum[0] + data[index], sum[1] + data[index + 1], sum[2] + data[index + 2]];
    },
    [0, 0, 0]
  );
  return [total[0] / samples.length, total[1] / samples.length, total[2] / samples.length];
}

/**
 * Apply morphological erosion to an active-pixel mask.
 * Any pixel whose neighbourhood (within `radius`) contains a background pixel
 * is removed. This shrinks foreground blobs and breaks thin bridges between
 * cards that are placed close together.
 */
function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let keep = true;
      outer: for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) { keep = false; break; }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) { keep = false; break outer; }
          if (!mask[ny * width + nx]) { keep = false; break outer; }
        }
      }
      if (keep) result[index] = 1;
    }
  }
  return result;
}

/**
 * Sample multiple points along all four edges and the corners for a more
 * robust background-colour estimate, especially on textured surfaces like wood.
 */
function robustBackgroundColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const points: [number, number][] = [];
  const edgeInset = 3;
  // corners
  points.push([edgeInset, edgeInset], [width - 1 - edgeInset, edgeInset]);
  points.push([edgeInset, height - 1 - edgeInset], [width - 1 - edgeInset, height - 1 - edgeInset]);
  // sample along top, bottom, left, right edges
  const steps = 8;
  for (let i = 1; i <= steps; i += 1) {
    const tx = Math.round((i / (steps + 1)) * (width - 1));
    const ty = Math.round((i / (steps + 1)) * (height - 1));
    points.push([tx, edgeInset]);                      // top edge
    points.push([tx, height - 1 - edgeInset]);         // bottom edge
    points.push([edgeInset, ty]);                      // left edge
    points.push([width - 1 - edgeInset, ty]);          // right edge
  }
  let total = [0, 0, 0];
  let count = 0;
  for (const [px, py] of points) {
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const off = (py * width + px) * 4;
    total = [total[0] + data[off], total[1] + data[off + 1], total[2] + data[off + 2]];
    count += 1;
  }
  return count ? [total[0] / count, total[1] / count, total[2] / count] as [number, number, number] : [128, 128, 128];
}

/**
 * Attempt to split an oversized bounding box by scanning for the widest
 * horizontal or vertical gap of background pixels inside the region.
 * Returns the original region if no clear split is found.
 */
function trySplitRegion(
  mask: Uint8Array,
  width: number,
  height: number,
  region: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
  imageWidth: number,
  imageHeight: number,
  depth: number,
): BatchRegion[] {
  if (depth > 3) return [];
  const boxW = region.maxX - region.minX + 1;
  const boxH = region.maxY - region.minY + 1;

  // Try vertical split (scan columns for a gap)
  let bestVGapStart = -1;
  let bestVGapLen = 0;
  let gapStart = -1;
  let minColFill = Infinity;
  let minColX = -1;

  for (let x = region.minX + Math.round(boxW * 0.15); x <= region.maxX - Math.round(boxW * 0.15); x += 1) {
    let colActive = 0;
    for (let y = region.minY; y <= region.maxY; y += 1) {
      if (mask[y * width + x]) colActive += 1;
    }
    const fillRatio = colActive / boxH;
    if (fillRatio < minColFill) {
      minColFill = fillRatio;
      minColX = x;
    }
    if (fillRatio < 0.18) {
      if (gapStart < 0) gapStart = x;
    } else {
      if (gapStart >= 0) {
        const gapLen = x - gapStart;
        if (gapLen > bestVGapLen) {
          bestVGapLen = gapLen;
          bestVGapStart = gapStart;
        }
      }
      gapStart = -1;
    }
  }
  if (gapStart >= 0) {
    const gapLen = region.maxX - Math.round(boxW * 0.15) - gapStart;
    if (gapLen > bestVGapLen) {
      bestVGapLen = gapLen;
      bestVGapStart = gapStart;
    }
  }

  // Try horizontal split (scan rows for a gap)
  let bestHGapStart = -1;
  let bestHGapLen = 0;
  gapStart = -1;
  let minRowFill = Infinity;
  let minRowY = -1;

  for (let y = region.minY + Math.round(boxH * 0.15); y <= region.maxY - Math.round(boxH * 0.15); y += 1) {
    let rowActive = 0;
    for (let x = region.minX; x <= region.maxX; x += 1) {
      if (mask[y * width + x]) rowActive += 1;
    }
    const fillRatio = rowActive / boxW;
    if (fillRatio < minRowFill) {
      minRowFill = fillRatio;
      minRowY = y;
    }
    if (fillRatio < 0.18) {
      if (gapStart < 0) gapStart = y;
    } else {
      if (gapStart >= 0) {
        const gapLen = y - gapStart;
        if (gapLen > bestHGapLen) {
          bestHGapLen = gapLen;
          bestHGapStart = gapStart;
        }
      }
      gapStart = -1;
    }
  }
  if (gapStart >= 0) {
    const gapLen = region.maxY - Math.round(boxH * 0.15) - gapStart;
    if (gapLen > bestHGapLen) {
      bestHGapLen = gapLen;
      bestHGapStart = gapStart;
    }
  }

  const minGap = 2;
  let useVertical = bestVGapLen >= minGap && bestVGapLen >= bestHGapLen;
  let useHorizontal = !useVertical && bestHGapLen >= minGap;

  // Fallback to minimum density valley if no zero-gap line was found
  if (!useVertical && !useHorizontal) {
    if (boxW >= boxH && minColFill < 0.50 && minColX > 0) {
      useVertical = true;
      bestVGapStart = minColX - 1;
      bestVGapLen = 2;
    } else if (boxH > boxW && minRowFill < 0.50 && minRowY > 0) {
      useHorizontal = true;
      bestHGapStart = minRowY - 1;
      bestHGapLen = 2;
    }
  }

  if (!useVertical && !useHorizontal) return [];

  const subRegions: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  if (useVertical) {
    const splitX = bestVGapStart + Math.floor(bestVGapLen / 2);
    subRegions.push({ minX: region.minX, minY: region.minY, maxX: splitX - 1, maxY: region.maxY });
    subRegions.push({ minX: splitX + 1, minY: region.minY, maxX: region.maxX, maxY: region.maxY });
  } else {
    const splitY = bestHGapStart + Math.floor(bestHGapLen / 2);
    subRegions.push({ minX: region.minX, minY: region.minY, maxX: region.maxX, maxY: splitY - 1 });
    subRegions.push({ minX: region.minX, minY: splitY + 1, maxX: region.maxX, maxY: region.maxY });
  }

  const results: BatchRegion[] = [];
  const minSubArea = Math.max(300, width * height * 0.004);
  for (const sub of subRegions) {
    const sw = sub.maxX - sub.minX + 1;
    const sh = sub.maxY - sub.minY + 1;
    if (sw < width * 0.08 || sh < height * 0.06) continue;
    // Tighten the bounding box to actual active pixels
    let tMinX = sub.maxX, tMinY = sub.maxY, tMaxX = sub.minX, tMaxY = sub.minY;
    let subArea = 0;
    for (let y = sub.minY; y <= sub.maxY; y += 1) {
      for (let x = sub.minX; x <= sub.maxX; x += 1) {
        if (mask[y * width + x]) {
          subArea += 1;
          tMinX = Math.min(tMinX, x);
          tMinY = Math.min(tMinY, y);
          tMaxX = Math.max(tMaxX, x);
          tMaxY = Math.max(tMaxY, y);
        }
      }
    }
    if (subArea < minSubArea) continue;
    const tW = tMaxX - tMinX + 1;
    const tH = tMaxY - tMinY + 1;
    const aspect = tW / Math.max(1, tH);
    // If this sub-region is still very large, try splitting recursively
    const expectedSingleCard = width * height * 0.18;
    if (tW * tH > expectedSingleCard * 1.8) {
      const deeper = trySplitRegion(mask, width, height, { minX: tMinX, minY: tMinY, maxX: tMaxX, maxY: tMaxY }, scale, imageWidth, imageHeight, depth + 1);
      if (deeper.length > 0) {
        results.push(...deeper);
        continue;
      }
    }
    if (aspect < 0.4 || aspect > 4.5) continue;
    const pad = Math.max(4, Math.round(Math.min(tW, tH) * 0.04));
    results.push(
      normalizeRegion(
        {
          id: newId("auto"),
          number: 0,
          x: Math.round((tMinX - pad) / scale),
          y: Math.round((tMinY - pad) / scale),
          width: Math.round((tW + pad * 2) / scale),
          height: Math.round((tH + pad * 2) / scale),
          source: "auto",
        },
        imageWidth,
        imageHeight,
      ),
    );
  }
  return results;
}

function detectCardRegions(decoded: DecodedImage): BatchRegion[] {
  const scale = Math.min(1, DETECTION_EDGE / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.drawImage(decoded.source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const [bgR, bgG, bgB] = robustBackgroundColor(data, width, height);
  let rawActive = new Uint8Array(width * height);

  // Foreground segmentation with slightly raised thresholds for textured backgrounds
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const distance = Math.hypot(r - bgR, g - bgG, b - bgB);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const bgLuminance = 0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB;
    rawActive[i] = distance > 42 || Math.abs(luminance - bgLuminance) > 38 ? 1 : 0;
  }

  // Apply erosion to break thin bridges between cards placed close together
  const erosionRadius = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  const active = erodeMask(rawActive, width, height, erosionRadius);

  const visited = new Uint8Array(width * height);
  const components: BatchRegion[] = [];
  const queue = new Int32Array(width * height);
  const minArea = Math.max(400, width * height * 0.004);
  const maxArea = width * height * 0.85;
  // Expected area for a single business card in the downscaled image
  const expectedSingleCard = width * height * 0.18;

  for (let start = 0; start < active.length; start += 1) {
    if (!active[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail] = start;
    tail += 1;
    visited[start] = 1;

    while (head < tail) {
      const current = queue[head];
      head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [current - 1, current + 1, current - width, current + width];
      for (const next of neighbors) {
        if (next < 0 || next >= active.length || visited[next] || !active[next]) continue;
        const nextX = next % width;
        if (Math.abs(nextX - x) > 1) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (area < minArea || area > maxArea) continue;
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const aspect = boxWidth / Math.max(1, boxHeight);

    // STRICT CARD SIZE GUARD: In a multi-card photo (5-10 cards),
    // no single card exceeds 22% of image area or 42% of dimension.
    const maxSingleArea = width * height * 0.22;
    const maxSingleW = width * 0.42;
    const maxSingleH = height * 0.42;

    if (boxArea > maxSingleArea || boxWidth > maxSingleW || boxHeight > maxSingleH) {
      const splitResults = trySplitRegion(
        rawActive, width, height,
        { minX, minY, maxX, maxY },
        scale, decoded.width, decoded.height, 0,
      );
      if (splitResults.length > 0) {
        components.push(...splitResults);
      }
      // CRITICAL: NEVER push an oversized conglomerate as a single card!
      continue;
    }

    if (boxWidth < width * 0.10 || boxHeight < height * 0.06) continue;
    if (aspect < 0.5 || aspect > 4.2) continue;

    const pad = Math.max(4, Math.round(Math.min(boxWidth, boxHeight) * 0.04));
    components.push(
      normalizeRegion(
        {
          id: newId("auto"),
          number: components.length + 1,
          x: Math.round((minX - pad) / scale),
          y: Math.round((minY - pad) / scale),
          width: Math.round((boxWidth + pad * 2) / scale),
          height: Math.round((boxHeight + pad * 2) / scale),
          source: "auto",
        },
        decoded.width,
        decoded.height
      )
    );
  }

  const sorted = components
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .filter((region, index, list) => {
      const duplicateIndex = list.findIndex((other, otherIndex) => otherIndex !== index && overlapRatio(region, other) > 0.55);
      return duplicateIndex === -1 || duplicateIndex > index;
    })
    .slice(0, MAX_BATCH_CARDS);

  return sorted.map((region, index) => ({ ...region, number: index + 1 }));
}

function assessQuality(decoded: DecodedImage, file: File): BatchQualityIssue[] {
  const issues: BatchQualityIssue[] = [];
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    issues.push({ level: "error", message: "Use a JPG, PNG, or WEBP image." });
  }
  if (file.size > MAX_FILE_BYTES) {
    issues.push({ level: "error", message: "Use an image smaller than 20 MB." });
  }
  if (Math.min(decoded.width, decoded.height) < MIN_IMAGE_EDGE) {
    issues.push({ level: "warning", message: "The image is small. Card text may be difficult to read." });
  }

  const sample = document.createElement("canvas");
  const sampleScale = Math.min(1, 300 / Math.max(decoded.width, decoded.height));
  sample.width = Math.max(1, Math.round(decoded.width * sampleScale));
  sample.height = Math.max(1, Math.round(decoded.height * sampleScale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return issues;
  context.drawImage(decoded.source, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let luminanceTotal = 0;
  let contrastTotal = 0;
  let previous = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    luminanceTotal += luminance;
    contrastTotal += Math.abs(luminance - previous);
    previous = luminance;
  }
  const count = pixels.length / 4;
  const average = luminanceTotal / count;
  const contrast = contrastTotal / count;
  if (average < 45) issues.push({ level: "warning", message: "The image looks dark. Add light or retake if the text is hard to read." });
  if (average > 235) issues.push({ level: "warning", message: "The image is very bright. Glare may reduce OCR accuracy." });
  if (contrast < 8) issues.push({ level: "warning", message: "The image may be blurred or low contrast. Review crops carefully." });
  return issues;
}

export async function prepareBatchImage(file: File): Promise<PreparedBatchImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Unsupported file type. Please use JPG, PNG, or WEBP.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("This image is larger than 20 MB. Please use a smaller photo.");
  }

  const decoded = await decodeImage(file);
  try {
    const qualityIssues = assessQuality(decoded, file);
    const autoRegions = detectCardRegions(decoded);
    return {
      file,
      url: URL.createObjectURL(file),
      metadata: {
        name: file.name || "batch-photo.jpg",
        type: file.type,
        size: file.size,
        width: decoded.width,
        height: decoded.height,
        createdAt: new Date().toISOString(),
      },
      qualityIssues,
      autoRegions,
    };
  } finally {
    decoded.cleanup();
  }
}

export async function cropRegionToFile(file: File, region: BatchRegion): Promise<{ file: File; url: string }> {
  const decoded = await decodeImage(file);
  try {
    const normalized = normalizeRegion(region, decoded.width, decoded.height);
    const padX = Math.round(normalized.width * 0.025);
    const padY = Math.round(normalized.height * 0.025);
    const sourceX = Math.max(0, normalized.x - padX);
    const sourceY = Math.max(0, normalized.y - padY);
    const sourceWidth = Math.min(decoded.width - sourceX, normalized.width + padX * 2);
    const sourceHeight = Math.min(decoded.height - sourceY, normalized.height + padY * 2);
    const outputScale = Math.min(1, CROP_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
    canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create crop.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    const cropFile = new File([blob], `batch-card-${region.number}-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    return { file: cropFile, url: URL.createObjectURL(cropFile) };
  } finally {
    decoded.cleanup();
  }
}

export function renumberRegions(regions: BatchRegion[]): BatchRegion[] {
  return regions
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, MAX_BATCH_CARDS)
    .map((region, index) => ({ ...region, number: index + 1 }));
}

export function hasHeavyOverlap(region: BatchRegion, regions: BatchRegion[]): boolean {
  return regions.some((existing) => existing.id !== region.id && overlapRatio(region, existing) > 0.55);
}

export function makeManualRegion(number: number, imageWidth: number, imageHeight: number): BatchRegion {
  const width = Math.round(imageWidth * 0.36);
  const height = Math.round(width / 1.72);
  return {
    id: newId("manual"),
    number,
    x: Math.round((imageWidth - width) / 2),
    y: Math.round((imageHeight - height) / 2),
    width,
    height,
    source: "manual",
  };
}

export function clampRegion(region: BatchRegion, imageWidth: number, imageHeight: number): BatchRegion {
  return normalizeRegion(region, imageWidth, imageHeight);
}

export function getSimulatedOcr(index: number): { parsed: OCRData; rawText: string; provider: string; success: true } {
  const parsed = { ...DUMMY_CONTACTS[index % DUMMY_CONTACTS.length] };
  return {
    parsed,
    provider: "simulated-staging-batch",
    success: true,
    rawText: [
      parsed.fullName,
      parsed.jobTitle,
      parsed.companyName,
      parsed.email,
      parsed.phone,
      parsed.website,
      parsed.city,
      parsed.country,
      "Simulated deterministic OCR text. No external OCR request was made.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function validateContact(data: OCRData): Partial<Record<keyof OCRData, string>> {
  const errors: Partial<Record<keyof OCRData, string>> = {};
  if (!data.fullName.trim()) errors.fullName = "Enter a contact name or mark the card skipped.";
  if (!data.companyName.trim()) errors.companyName = "Enter the company name if visible on the card.";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Enter a valid email address.";
  if (!data.email.trim() && !data.phone.trim()) errors.phone = "Enter an email or phone number if one is visible.";
  return errors;
}

export function emptyOcrData(): OCRData {
  return {
    fullName: "",
    jobTitle: "",
    companyName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    website: "",
    address: "",
    city: "",
    country: "",
    notes: "",
  };
}

export { MAX_BATCH_CARDS };
