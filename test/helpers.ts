// Shared setup for the API tests: starts the app on a free port against a
// separate test database, and resets that database before each test file.
import assert from "node:assert/strict";

// Never run against the real database: the tests delete every user in theirs
process.env.MONGODB_DB_NAME = process.env.MONGODB_TEST_DB_NAME || "jwt_auth_api_test";
assert.ok(
  process.env.MONGODB_DB_NAME.endsWith("_test"),
  "MONGODB_TEST_DB_NAME must end with _test",
);
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.JWT_SECRET ||= "test-access-secret";
process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret";
delete process.env.DEMO_MODE;

const { default: mongoose } = await import("mongoose");
const { app } = await import("../src/app.ts");
const { connectDB } = await import("../src/config/db.ts");
const { User } = await import("../src/models/user.model.ts");
const { demoUsers, DEMO_PASSWORD } = await import("../scripts/data/demoUsers.ts");

export { User, demoUsers, DEMO_PASSWORD };

let server;
export let baseUrl;

export const start = async () => {
  await connectDB();
  await User.init(); // unique indexes, so duplicate tests behave like production
  await User.deleteMany({});
  for (const demoUser of demoUsers) {
    await User.create({ ...demoUser, password: DEMO_PASSWORD });
  }
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

export const stop = async () => {
  await User.deleteMany({});
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
};

// fetch() wrapper: JSON in/out, optional Bearer token and FormData body
export const api = async (path, { method = "GET", token, json, form, headers = {} } = {}) => {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (json) {
    init.headers["Content-Type"] = "application/json";
    init.body = typeof json === "string" ? json : JSON.stringify(json);
  }
  if (form) init.body = form;

  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
};

export const login = async (email, password = DEMO_PASSWORD) => {
  const res = await api("/api/auth/login", { method: "POST", json: { email, password } });
  assert.equal(res.status, 200, `login ${email}: ${res.body?.message}`);
  return res.body.data;
};

export const demoEmail = (role) => demoUsers.find((user) => user.role === role).email;

// A 1x1 PNG and a minimal PDF for upload tests
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
export const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

let counter = 0;
// A valid new user's fields; each call gets a unique email and phone
export const newUserFields = () => {
  counter++;
  return {
    firstName: "Test",
    lastName: "User",
    email: `test.user${counter}.${Date.now()}@example.com`,
    phoneNumber: `+2010${String(Date.now() + counter).slice(-8)}`,
    password: "TestPass123!",
  };
};
