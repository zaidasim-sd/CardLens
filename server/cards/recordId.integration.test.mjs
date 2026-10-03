import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";
import { allocateRecordId, recordDate } from "./recordId.js";
import { ensureDatabaseIndexes } from "../db.js";

test("record reference date matches the Sheet's capture timezone", () => {
  assert.equal(recordDate(new Date("2026-10-03T02:30:00Z")), "20261002");
  assert.equal(recordDate(new Date("2026-10-03T12:00:00Z")), "20261003");
  assert.equal(recordDate(new Date("2026-10-03T02:30:00Z"), { GOOGLE_SHEET_CAPTURE_TIME_ZONE: "Asia/Karachi" }), "20261003");
});

test("daily IDs are atomic, reset by date, survive counter recovery, and remain unique", async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  const databaseName = `l71_id_test_${new ObjectId()}`;
  let db;
  try {
    await client.connect();
    db = client.db(databaseName);
    await ensureDatabaseIndexes(db);
    const now = new Date("2026-10-03T12:00:00Z");
    const ids = await Promise.all(Array.from({ length: 25 }, () => allocateRecordId(db, now)));
    assert.equal(new Set(ids.map(item => item.recordId)).size, 25);
    assert.deepEqual(ids.map(item => item.recordSequence).sort((a, b) => a - b), Array.from({ length: 25 }, (_, index) => index + 1));
    assert.ok(ids.some(item => item.recordId === "L71-20261003-0001"));
    assert.ok(ids.some(item => item.recordId === "L71-20261003-0025"));
    assert.equal((await allocateRecordId(db, new Date("2026-10-04T12:00:00Z"))).recordId, "L71-20261004-0001");
    // Counter metadata is in the existing backed-up settings collection.
    const counter = await db.collection("settings").findOne({ _id: "lead71_record_sequence:20261003" });
    assert.equal(counter.sequence, 25);
    await db.collection("cards").insertOne({ ...ids.find(item => item.recordSequence === 25), tenantId: "fake" });
    await db.collection("settings").deleteOne({ _id: counter._id });
    assert.equal((await allocateRecordId(db, now)).recordId, "L71-20261003-0026");
    await assert.rejects(db.collection("cards").insertOne({ ...ids.find(item => item.recordSequence === 25), tenantId: "other" }), error => error.code === 11000);
  } finally {
    try { if (db && databaseName.startsWith("l71_id_test_")) await db.dropDatabase(); }
    finally { await client.close(); }
  }
});
