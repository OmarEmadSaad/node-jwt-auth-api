import type { CorsOptions } from "cors";
import { AppError } from "../utils/appError.ts";

// Read on each request, because .env is loaded after this module is imported
const allowedOrigins = () =>
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin header: Postman, curl, or server-to-server calls, not a browser page
    if (!origin || allowedOrigins().includes(origin)) {
      return callback(null, true);
    }
    callback(new AppError(`Origin ${origin} is not allowed by CORS`, 403));
  },
};
