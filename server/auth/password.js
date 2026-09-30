import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw Object.assign(new Error("Password must contain at least 12 characters."), { code: "PASSWORD_TOO_SHORT", status: 400 });
  }
}

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("base64")}:${Buffer.from(derived).toString("base64")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [algorithm, saltText, hashText] = stored.split(":");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64");
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltText, "base64"), expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
