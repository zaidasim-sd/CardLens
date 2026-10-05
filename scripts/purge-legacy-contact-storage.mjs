import "dotenv/config";
import { getMongoClient } from "../server/db.js";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Read-only unless all explicit destructive migration flags are supplied.
const args = process.argv.slice(2);
const expected = name => Number(args.find(arg => arg.startsWith(`--${name}=`))?.split("=")[1]);
let client;
try {
  client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB || "cardsnap");
  const cards = await db.collection("cards").countDocuments({});
  const images = await db.collection("cardImages").countDocuments({});
  const unconfirmed = await db.collection("cards").countDocuments({ $or: [
    { sheetWritePending: true }, { sheetStatus: { $in: ["failed", "pending", "not_configured", "not_started"] } },
    { sheetStatus: { $exists: false } },
  ] });
  if (!args.includes("--apply")) {
    console.log(JSON.stringify({ preview: true, cards, images, unconfirmed, action: "Delete legacy cards, cardImages and transfer metadata. No changes made." }));
  } else {
    if (!args.includes("--company-approved")) throw new Error("Written approval is required for permanent legacy contact deletion.");
    if (cards !== expected("expected-cards") || images !== expected("expected-images")) throw new Error("Counts differ from the approved preview. Inspect again before deleting.");
    if (!args.includes("--discard-unconfirmed")) {
      // Refresh the read-only check immediately before deletion. An old marker
      // or transfer receipt alone is not evidence of successful Sheet delivery.
      execFileSync(process.execPath, ["scripts/verify-legacy-sheet-delivery.mjs"], { stdio: "pipe" });
      const report = JSON.parse(readFileSync("docs/legacy-sheet-verification.json", "utf8"));
      if (report.cards !== cards || report.matchingRows !== cards || report.missingRows.length || report.differentRows.length || report.unreadable.length || report.differentTarget.length) throw new Error("Not all contacts are verified in the current Sheet. No contact data was deleted.");
    }
    // No backup of contact data is created: retaining such a copy would defeat
    // this purge. Stop legacy writers before applying the approved cleanup.
    const removedImages = await db.collection("cardImages").deleteMany({});
    const removedCards = await db.collection("cards").deleteMany({});
    const removedTransfers = await db.collection("transfers").deleteMany({});
    console.log(JSON.stringify({ deletedCards: removedCards.deletedCount, deletedImages: removedImages.deletedCount, deletedTransfers: removedTransfers.deletedCount }));
  }
} catch (error) {
  console.error(error instanceof Error && !error.code ? error.message : "Cleanup failed. Inspect connectivity and the approved database target.");
  process.exitCode = 1;
} finally { if (client) await client.close(); }
