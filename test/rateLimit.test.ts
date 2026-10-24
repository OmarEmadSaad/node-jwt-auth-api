import { it } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { rateLimit } from "../src/middleware/rateLimit.ts";
import type { AppError } from "../src/utils/appError.ts";

it("blocks an IP after AUTH_RATE_LIMIT_MAX requests, with Retry-After", () => {
  process.env.AUTH_RATE_LIMIT_MAX = "3";
  const limit = rateLimit();
  const headers: Record<string, string> = {};
  // Only the parts of req/res the limiter uses
  const res = { set: (key: string, value: string) => (headers[key] = value) } as unknown as Response;
  const req = (ip: string) => ({ ip }) as Request;

  const results: (number | "ok")[] = [];
  for (let i = 0; i < 4; i++) {
    limit(req("1.2.3.4"), res, (err?: unknown) => results.push((err as AppError)?.statusCode ?? "ok"));
  }
  assert.deepEqual(results, ["ok", "ok", "ok", 429]);
  assert.ok(Number(headers["Retry-After"]) > 0);

  // Another IP has its own count
  limit(req("5.6.7.8"), res, (err?: unknown) => assert.equal(err, undefined));
});
