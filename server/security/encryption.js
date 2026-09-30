import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function keyBuffer() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error("ENCRYPTION_KEY is required");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptValue(value) {
  const actualIv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(), actualIv);
  const plain = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { v: Number(process.env.ENCRYPTION_KEY_VERSION || 1), iv: actualIv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") };
}

export function decryptValue(envelope, asBuffer = false) {
  if (!envelope?.iv || !envelope?.tag || !envelope?.data) throw new Error("Encrypted value is invalid");
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]);
  return asBuffer ? plain : JSON.parse(plain.toString("utf8"));
}

export function blindIndex(value) {
  if (!value) return null;
  return createHmac("sha256", keyBuffer()).update(value).digest("hex");
}
