const MAX_OUTPUT_WIDTH = 1800;

async function decodeImage(image: Blob): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
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

/**
 * Samples the corner pixels of the image to determine a natural background color
 * for the padding area so cards with colored or dark backgrounds blend seamlessly.
 */
function getEdgePaddingColor(source: CanvasImageSource): string {
  try {
    const sample = document.createElement("canvas");
    sample.width = 16;
    sample.height = 16;
    const ctx = sample.getContext("2d");
    if (!ctx) return "#ffffff";
    ctx.drawImage(source, 0, 0, 16, 16);
    const p1 = ctx.getImageData(0, 0, 1, 1).data;
    const p2 = ctx.getImageData(15, 0, 1, 1).data;
    const p3 = ctx.getImageData(0, 15, 1, 1).data;
    const p4 = ctx.getImageData(15, 15, 1, 1).data;
    const avgR = Math.round((p1[0] + p2[0] + p3[0] + p4[0]) / 4);
    const avgG = Math.round((p1[1] + p2[1] + p3[1] + p4[1]) / 4);
    const avgB = Math.round((p1[2] + p2[2] + p3[2] + p4[2]) / 4);
    if (avgR > 235 && avgG > 235 && avgB > 235) return "#ffffff";
    return `rgb(${avgR},${avgG},${avgB})`;
  } catch {
    return "#ffffff";
  }
}

/**
 * Prepares an uploaded or scanned business card image for OCR and storage.
 * Preserves 100% of the card without cropping away top, bottom, or sides.
 * Adds generous extra spacing on top and bottom so text at the card edges is
 * never clipped and Google Cloud Vision OCR achieves maximum detection accuracy.
 */
export async function cropBusinessCardImage(
  image: Blob,
  originalName = "business-card.jpg"
): Promise<File> {
  // Avoid trimming a crop again each time an existing contact is edited.
  if (/-cropped\.jpe?g$/i.test(originalName)) {
    return new File([image], originalName, {
      type: image.type || "image/jpeg",
      lastModified: Date.now(),
    });
  }

  const decoded = await decodeImage(image);

  try {
    const { width, height } = decoded;
    if (!width || !height) throw new Error("Unable to read image dimensions");

    // Add generous extra spacing on top and bottom (and sides) so big cards
    // and edge text are never cropped by OCR or preview containers.
    const padY = Math.round(height * 0.08); // 8% extra spacing top and bottom
    const padX = Math.round(width * 0.04);  // 4% extra spacing left and right

    const totalWidth = width + padX * 2;
    const totalHeight = height + padY * 2;

    const outputScale = Math.min(1, MAX_OUTPUT_WIDTH / Math.max(totalWidth, totalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(totalWidth * outputScale));
    canvas.height = Math.max(1, Math.round(totalHeight * outputScale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare image");

    // Fill background with matching edge color (or clean white)
    context.fillStyle = getEdgePaddingColor(decoded.source);
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const drawX = Math.round(padX * outputScale);
    const drawY = Math.round(padY * outputScale);
    const drawW = Math.round(width * outputScale);
    const drawH = Math.round(height * outputScale);

    context.drawImage(decoded.source, drawX, drawY, drawW, drawH);

    const croppedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Unable to create image crop"))),
        "image/jpeg",
        0.92
      );
    });

    const baseName = originalName.replace(/\.[^.]+$/, "") || "business-card";
    return new File([croppedBlob], `${baseName}-cropped.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.cleanup();
  }
}

export async function combineFrontAndBackCards(
  frontBlob: Blob,
  backBlob: Blob
): Promise<File> {
  const frontDecoded = await decodeImage(frontBlob);
  const backDecoded = await decodeImage(backBlob);

  try {
    const width = Math.max(frontDecoded.width, backDecoded.width);
    const gap = 24;
    const height = frontDecoded.height + backDecoded.height + gap;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas context");

    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, width, height);

    const frontX = (width - frontDecoded.width) / 2;
    ctx.drawImage(frontDecoded.source, frontX, 0);

    const backX = (width - backDecoded.width) / 2;
    ctx.drawImage(backDecoded.source, backX, frontDecoded.height + gap);

    const combinedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to combine card images"))),
        "image/jpeg",
        0.92
      );
    });

    return new File([combinedBlob], `card-2sided-${Date.now()}-cropped.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    frontDecoded.cleanup();
    backDecoded.cleanup();
  }
}
