import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import userRoutes from "./routes/user.routes.ts";
import authRoutes from "./routes/auth.routes.ts";
import { corsOptions } from "./config/cors.ts";
import { isDemoMode } from "./config/demo.ts";
import { UPLOADS_DIR, fromRoot } from "./config/uploads.ts";
import { notFound, errorHandler } from "./middleware/errorHandler.ts";
import * as httpStatusText from "./utils/httpStatusText.ts";

// The Express app without app.listen(), so tests can start it on any port.
// server.js loads .env, connects to MongoDB and starts it.
export const app = express();

app.disable("x-powered-by");

// Behind a host's proxy (Render, Railway...) set TRUST_PROXY=1, so req.ip is
// the visitor's IP and the login rate limit counts each visitor separately
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  // "1" = one proxy hop (the usual case), "true" = trust all
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true");
}

// Before the routes, so browser preflight (OPTIONS) requests are answered here
app.use(cors(corsOptions));
app.use(express.json());

// Uploaded files: e.g. http://localhost:3000/uploads/defaults/avatar.svg
// nosniff makes browsers trust the Content-Type instead of guessing from the content
app.use(
  "/uploads",
  express.static(fromRoot(UPLOADS_DIR), {
    setHeaders: (res) => res.set("X-Content-Type-Options", "nosniff"),
  }),
);

// For uptime checks and for the frontend to see whether the API is awake
app.get("/api/health", (req, res) => {
  res.json({
    status: httpStatusText.SUCCESS,
    data: {
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      demoMode: isDemoMode(),
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.use(notFound);

app.use(errorHandler);
