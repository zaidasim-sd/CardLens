import "dotenv/config";
import { writeFileSync } from "node:fs";
import { getMongoClient } from "../server/db.js";
import { decryptValue } from "../server/security/encryption.js";
import { createSheetGateway, sheetField, safeSheetValue } from "../server/integrations/sheetService.js";

// Read only: no Sheet writes, decryption output, or contact exports.
let client;
try {
  client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB || "cardsnap");
  const gateway = createSheetGateway();
  if (!gateway) throw new Error("Sheet configuration is missing.");
  const rows = await gateway.readAll();
  const headers = rows[0] || [];
  const idColumn = headers.findIndex(header => sheetField(header) === "recordId");
  if (idColumn < 0) throw new Error("The Sheet is missing the Contact ID column.");
  const columns = ["fullName", "companyName", "jobTitle", "email", "phone", "notes"];
  const indexes = columns.map(field => headers.findIndex(header => sheetField(header) === field));
  if (indexes.some(index => index < 0)) throw new Error("The Sheet is missing contact columns needed for verification.");
  const byId = new Map(rows.slice(1).map(row => [String(row[idColumn] || ""), row]));
  const cards = await db.collection("cards").find({}).toArray();
  const target = `${process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_TEST_ID}:${process.env.GOOGLE_SHEET_TAB || "Contacts"}`;
  const result = { checkedAt: new Date().toISOString(), cards: cards.length, matchingRows: 0, missingRows: [], differentRows: [], unreadable: [], differentTarget: [] };
  for (const card of cards) {
    const reference = card.recordId || String(card._id);
    if (card.sheetTarget && card.sheetTarget !== target) { result.differentTarget.push(reference); continue; }
    const row = byId.get(reference);
    if (!row) { result.missingRows.push(reference); continue; }
    let data;
    try { data = decryptValue(card.payload).verifiedData || {}; }
    catch { result.unreadable.push(reference); continue; }
    const differences = columns.filter((field, index) => String(row[indexes[index]] || "") !== safeSheetValue(data[field] || ""));
    if (differences.length) result.differentRows.push({ reference, fields: differences });
    else result.matchingRows++;
  }
  // Minimal reference-only report; no names, emails, phone numbers, OCR or images.
  writeFileSync("docs/legacy-sheet-verification.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ cards: result.cards, matchingRows: result.matchingRows,
    missingRows: result.missingRows.length, differentRows: result.differentRows.length,
    unreadable: result.unreadable.length, differentTarget: result.differentTarget.length,
    report: "docs/legacy-sheet-verification.json", modified: false }));
} catch (error) {
  console.error(JSON.stringify({ verificationFailed: true, code: error.code || "VERIFICATION_FAILED", modified: false }));
  process.exitCode = 1;
} finally { if (client) await client.close(); }
