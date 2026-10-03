// Human-readable references are separate from MongoDB IDs, which remain the API identity.
export function recordDate(now, env = process.env) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: env.GOOGLE_SHEET_CAPTURE_TIME_ZONE || "Etc/GMT+4",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value("year")}${value("month")}${value("day")}`;
}

export async function allocateRecordId(db, now, env = process.env) {
  const date = recordDate(now, env);
  const _id = `lead71_record_sequence:${date}`;
  // Settings are included in existing backups. Seed from stored contacts as a
  // safeguard if an older backup lacks the counter. Never reuse a reserved number.
  const last = await db.collection("cards").find({ recordDate: date }, { projection: { recordSequence: 1 } }).sort({ recordSequence: -1 }).limit(1).next();
  const initialize = { $max: { sequence: last?.recordSequence || 0 }, $setOnInsert: { tenantId: "__lead71_system", key: _id, createdAt: now } };
  try { await db.collection("settings").updateOne({ _id }, initialize, { upsert: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    await db.collection("settings").updateOne({ _id }, initialize);
  }
  const counter = await db.collection("settings").findOneAndUpdate({ _id }, { $inc: { sequence: 1 } }, { returnDocument: "after" });
  if (!Number.isSafeInteger(counter?.sequence) || counter.sequence < 1) throw new Error("Record sequence could not be allocated.");
  return { recordId: `L71-${date}-${String(counter.sequence).padStart(4, "0")}`, recordDate: date, recordSequence: counter.sequence };
}
