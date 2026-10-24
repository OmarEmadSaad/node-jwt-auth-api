import { fileURLToPath } from "node:url";

// Load .env before importing the app, so settings read at startup
// (e.g. TRUST_PROXY in src/app.js) can come from it
try {
  process.loadEnvFile(fileURLToPath(new URL(".env", import.meta.url)));
} catch {
  // No .env file: rely on environment variables already set (e.g. on the host)
}

for (const name of ["MONGODB_URI", "JWT_SECRET", "JWT_REFRESH_SECRET"]) {
  if (!process.env[name]) {
    console.error(`${name} is missing from .env`);
    process.exit(1);
  }
}

const { app } = await import("./src/app.ts");
const { connectDB } = await import("./src/config/db.ts");

try {
  await connectDB();
} catch (err) {
  console.error("Failed to connect to MongoDB:", err.message);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
