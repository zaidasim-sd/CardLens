const MAX_IMAGE_BYTES = 450 * 1024;
const MAX_EDGE = 1600;

export async function compressCardImage(image: Blob): Promise<Blob> {
  if (image.size <= MAX_IMAGE_BYTES && image.type === "image/jpeg") return image;
  const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The card image could not be prepared.");
      context.drawImage(bitmap, 0, 0, width, height);
      const quality = Math.max(0.45, 0.86 - attempt * 0.08);
      const output = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The card image could not be prepared.")), "image/jpeg", quality));
      if (output.size <= MAX_IMAGE_BYTES) return output;
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
    throw new Error("The card image remains too large after compression.");
  } finally {
    bitmap.close();
  }
}
