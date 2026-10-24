import { it } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../src/middleware/rateLimit.ts";

it("blocks an IP after AUTH_RATE_LIMIT_MAX requests, with Retry-After", () => {
  process.env.AUTH_RATE_LIMIT_MAX = "3";
  const limit = rateLimit();
  const headers = {};
  const res = { set: (key, value) => (headers[key] = value) };

  const results = [];
  for (let i = 0; i < 4; i++) {
    limit({ ip: "1.2.3.4" }, res, (err) => results.push(err?.statusCode ?? "ok"));
  }
  assert.deepEqual(results, ["ok", "ok", "ok", 429]);
  assert.ok(Number(headers["Retry-After"]) > 0);

  // Another IP has its own count
  limit({ ip: "5.6.7.8" }, res, (err) => assert.equal(err, undefined));
});
