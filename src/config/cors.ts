import type { Request } from "express";
import type { CorsOptionsDelegate } from "cors";
import { AppError } from "../utils/appError.ts";

// Read on each request, because .env is loaded after this module is imported
const allowedOrigins = () =>
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

// The demo page is served by this same server, so its own origin is always
// allowed (browsers send an Origin header on same-origin POSTs too)
const isSameOrigin = (origin: string, req: Request) => {
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
};

// cors() "delegate" form: gets the request, so it can compare against the host
export const corsOptions: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.header("Origin");
  // No Origin header: Postman, curl, or server-to-server calls, not a browser page
  if (!origin || isSameOrigin(origin, req) || allowedOrigins().includes(origin)) {
    return callback(null, { origin: true });
  }
  callback(new AppError(`Origin ${origin} is not allowed by CORS`, 403));
};
