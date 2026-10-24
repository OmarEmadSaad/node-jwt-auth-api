import type { RequestHandler } from "express";
import { AppError } from "../utils/appError.ts";

// Limits how often one IP can call a route, e.g. to slow down password guessing:
// router.post("/login", rateLimit(), ...)
// Kept in memory, so it's per server process and resets on restart; that's
// enough for one small instance. Behind a proxy, set TRUST_PROXY (see app.ts).
// The limit is AUTH_RATE_LIMIT_MAX requests per 15 minutes (default 20).
const WINDOW_MS = 15 * 60 * 1000;

export const rateLimit = (): RequestHandler => {
  const hits = new Map<string, { count: number; resetAt: number }>(); // by IP

  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const max = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20;
    const now = Date.now();

    // Forget expired entries now and then, so the map doesn't grow forever
    if (hits.size > 10_000) {
      for (const [ip, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(ip);
      }
    }

    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      hits.set(ip, entry);
    }
    entry.count++;

    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(
        new AppError("Too many attempts, please try again in a few minutes", 429),
      );
    }
    next();
  };
};
