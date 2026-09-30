import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? sourceFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return nested.flat().filter((name) => /\.(ts|tsx|js|jsx)$/.test(name));
}

test("browser source has no persistent card storage", async () => {
  const files = await sourceFiles(path.resolve("src"));
  const forbidden = ["indexed" + "DB", "local" + "Storage", "Dex" + "ie"];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const token of forbidden) assert.equal(content.includes(token), false, `${path.relative(process.cwd(), file)} uses ${token}`);
  }
});
