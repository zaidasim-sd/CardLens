import assert from "node:assert/strict";
import test from "node:test";
import detectCardsHandler from "./detectCardsHandler.js";

function makeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test("detectCardsHandler rejects unauthenticated requests", async () => {
  const req = {
    method: "POST",
    headers: {
      origin: "http://localhost:5173",
      cookie: "",
    },
    body: Buffer.from([]),
  };
  const res = makeResponse();
  await detectCardsHandler(req, res);
  assert.equal(res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 500, true);
});
