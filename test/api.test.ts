import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  start,
  stop,
  api,
  login,
  demoEmail,
  demoUsers,
  newUserFields,
  PNG,
  PDF,
  User,
  baseUrl,
} from "./helpers.ts";
import { fromRoot } from "../src/config/uploads.ts";

before(start);
after(stop);

const fileExists = (relativePath) => fs.existsSync(fromRoot(relativePath));
// removeFile deletes in the background, so give it a moment
const waitForFs = () => new Promise((resolve) => setTimeout(resolve, 200));

describe("health and routing", () => {
  it("GET /api/health reports the database", async () => {
    const res = await api("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.data.database, "connected");
  });

  it("unknown route is 404, wrong method is 405", async () => {
    assert.equal((await api("/api/nope")).status, 404);
    const res = await api("/api/auth/login");
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  });

  it("does not reveal the framework", async () => {
    const res = await api("/api/health");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  it("CORS blocks origins that aren't listed", async () => {
    process.env.CORS_ORIGINS = "http://allowed.test";
    const ok = await api("/api/health", { headers: { Origin: "http://allowed.test" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://allowed.test");
    const blocked = await api("/api/health", { headers: { Origin: "http://evil.test" } });
    assert.equal(blocked.status, 403);
  });
});

describe("login", () => {
  it("every demo user can log in, and no secret comes back", async () => {
    for (const demoUser of demoUsers) {
      const data = await login(demoUser.email);
      assert.equal(data.user.role, demoUser.role);
      assert.ok(data.accessToken && data.refreshToken);
      assert.equal(data.user.password, undefined);
      assert.equal(data.user.refreshToken, undefined);
    }
  });

  it("wrong password and unknown email give the same 401", async () => {
    const wrong = await api("/api/auth/login", {
      method: "POST",
      json: { email: demoUsers[0].email, password: "not-the-password" },
    });
    const unknown = await api("/api/auth/login", {
      method: "POST",
      json: { email: "nobody@example.com", password: "not-the-password" },
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  it("rejects non-string input instead of crashing", async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      json: { email: demoUsers[0].email, password: { $gt: "" } },
    });
    assert.equal(res.status, 400);
  });

  it("invalid JSON is a 400", async () => {
    const res = await api("/api/auth/login", { method: "POST", json: "{bad json" });
    assert.equal(res.status, 400);
  });
});

describe("register", () => {
  it("creates a user with role user, even if another role is sent", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      json: { ...newUserFields(), role: "manager" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, "user");
    assert.equal(res.body.data.user.password, undefined);
    assert.ok(res.body.data.accessToken);

    const stored = await User.findById(res.body.data.user._id).select("+password");
    assert.match(stored.password, /^\$2[aby]\$/, "password is stored as a bcrypt hash");
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      json: { ...newUserFields(), email: demoUsers[0].email },
    });
    assert.equal(res.status, 409);
  });

  it("validates the fields", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      json: { firstName: "A", email: "nope", phoneNumber: "1", password: "short" },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.data.length >= 4);
  });
});

describe("tokens", () => {
  it("protected routes need a valid token", async () => {
    assert.equal((await api("/api/users")).status, 401);
    assert.equal((await api("/api/users", { token: "garbage" })).status, 401);
  });

  it("refresh rotates the token; the old one stops working", async () => {
    const { refreshToken } = await login(demoEmail("user"));
    const first = await api("/api/auth/refresh", { method: "POST", json: { refreshToken } });
    assert.equal(first.status, 200);
    assert.ok(first.body.data.accessToken);

    const reused = await api("/api/auth/refresh", { method: "POST", json: { refreshToken } });
    assert.equal(reused.status, 401);
  });

  it("a refresh token can't be used as an access token", async () => {
    const { refreshToken } = await login(demoEmail("user"));
    assert.equal((await api("/api/users", { token: refreshToken })).status, 401);
  });

  it("logout revokes the refresh token", async () => {
    const { accessToken, refreshToken } = await login(demoEmail("user"));
    const out = await api("/api/auth/logout", { method: "POST", token: accessToken });
    assert.equal(out.status, 200);
    const res = await api("/api/auth/refresh", { method: "POST", json: { refreshToken } });
    assert.equal(res.status, 401);
  });
});

describe("roles", () => {
  let tokens;
  before(async () => {
    tokens = {
      user: (await login(demoEmail("user"))).accessToken,
      admin: (await login(demoEmail("admin"))).accessToken,
      manager: (await login(demoEmail("manager"))).accessToken,
    };
  });

  const idOf = async (email) => String((await User.findOne({ email }))._id);

  it("any logged-in user can list and read users", async () => {
    const list = await api("/api/users", { token: tokens.user });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.users.length >= demoUsers.length, true);
    for (const user of list.body.data.users) {
      assert.equal(user.password, undefined);
      assert.equal(user.refreshToken, undefined);
    }
    const one = await api(`/api/users/${await idOf(demoEmail("admin"))}`, { token: tokens.user });
    assert.equal(one.status, 200);
  });

  it("bad and unknown ids give 400 and 404", async () => {
    assert.equal((await api("/api/users/123", { token: tokens.user })).status, 400);
    const missing = await api("/api/users/0123456789abcdef01234567", { token: tokens.user });
    assert.equal(missing.status, 404);
  });

  it("a regular user can't create, update or delete", async () => {
    const target = await idOf(demoUsers.at(-1).email);
    const create = await api("/api/users", { method: "POST", token: tokens.user, json: newUserFields() });
    const update = await api(`/api/users/${target}`, { method: "PATCH", token: tokens.user, json: { firstName: "Hacked" } });
    const remove = await api(`/api/users/${target}`, { method: "DELETE", token: tokens.user });
    assert.deepEqual([create.status, update.status, remove.status], [403, 403, 403]);
  });

  it("an admin manages users with the user role, but can't set roles", async () => {
    const created = await api("/api/users", {
      method: "POST",
      token: tokens.admin,
      json: { ...newUserFields(), role: "manager" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.role, "user", "role from an admin is ignored");
    const id = created.body.data.user._id;

    const updated = await api(`/api/users/${id}`, {
      method: "PATCH",
      token: tokens.admin,
      json: { firstName: "Renamed", role: "admin" },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.user.firstName, "Renamed");
    assert.equal(updated.body.data.user.role, "user");

    const removed = await api(`/api/users/${id}`, { method: "DELETE", token: tokens.admin });
    assert.equal(removed.status, 200);
  });

  it("an admin can't change or delete a manager or another admin", async () => {
    const manager = await idOf(demoEmail("manager"));
    const otherAdmin = await idOf(demoUsers.filter((user) => user.role === "admin")[1].email);
    for (const target of [manager, otherAdmin]) {
      const update = await api(`/api/users/${target}`, {
        method: "PATCH",
        token: tokens.admin,
        json: { password: "Takeover123!" },
      });
      const remove = await api(`/api/users/${target}`, { method: "DELETE", token: tokens.admin });
      assert.deepEqual([update.status, remove.status], [403, 403]);
    }
    // The manager's password didn't change
    await login(demoEmail("manager"));
  });

  it("a manager can change roles; PUT works like PATCH", async () => {
    const created = await api("/api/users", { method: "POST", token: tokens.manager, json: newUserFields() });
    const id = created.body.data.user._id;

    const promoted = await api(`/api/users/${id}`, { method: "PUT", token: tokens.manager, json: { role: "admin" } });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.data.user.role, "admin");

    const badRole = await api(`/api/users/${id}`, { method: "PATCH", token: tokens.manager, json: { role: "owner" } });
    assert.equal(badRole.status, 400);

    assert.equal((await api(`/api/users/${id}`, { method: "DELETE", token: tokens.manager })).status, 200);
    assert.equal((await api(`/api/users/${id}`, { token: tokens.manager })).status, 404);
  });

  it("a changed password is hashed and works for login", async () => {
    const fields = newUserFields();
    const created = await api("/api/users", { method: "POST", token: tokens.admin, json: fields });
    const id = created.body.data.user._id;
    await api(`/api/users/${id}`, { method: "PATCH", token: tokens.admin, json: { password: "NewPass456!" } });

    const stored = await User.findById(id).select("+password");
    assert.match(stored.password, /^\$2[aby]\$/);
    await login(fields.email, "NewPass456!");
    await api(`/api/users/${id}`, { method: "DELETE", token: tokens.admin });
  });
});

describe("file uploads", () => {
  let admin;
  before(async () => {
    admin = (await login(demoEmail("admin"))).accessToken;
  });

  const userForm = (files) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(newUserFields())) form.append(key, value);
    for (const [field, blob, name] of files) form.append(field, blob, name);
    return form;
  };

  it("saves avatar and PDF in their folders, named by type", async () => {
    const res = await api("/api/users", {
      method: "POST",
      token: admin,
      form: userForm([
        ["avatar", new Blob([PNG], { type: "image/png" }), "evil.html"],
        ["document", new Blob([PDF], { type: "application/pdf" }), "cv.pdf"],
      ]),
    });
    assert.equal(res.status, 201);
    const { avatar, document, _id } = res.body.data.user;
    assert.match(avatar, /^uploads\/users\/avatars\/avatar-\d+-[0-9a-f-]{36}\.png$/);
    assert.match(document, /^uploads\/users\/documents\/document-\d+-[0-9a-f-]{36}\.pdf$/);
    assert.ok(fileExists(avatar) && fileExists(document));

    // Served with the right type and nosniff
    const served = await fetch(`${baseUrl}/${avatar}`);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");

    // A new avatar replaces the old file
    const form = new FormData();
    form.append("avatar", new Blob([PNG], { type: "image/png" }), "new.png");
    const updated = await api(`/api/users/${_id}`, { method: "PATCH", token: admin, form });
    assert.equal(updated.status, 200);
    await waitForFs();
    assert.equal(fileExists(avatar), false, "old avatar deleted");
    const newAvatar = updated.body.data.user.avatar;
    assert.ok(fileExists(newAvatar));

    // Deleting the user deletes their files
    await api(`/api/users/${_id}`, { method: "DELETE", token: admin });
    await waitForFs();
    assert.equal(fileExists(newAvatar), false);
    assert.equal(fileExists(document), false);
  });

  it("rejects the wrong file type and keeps no file", async () => {
    const before = fs.readdirSync(fromRoot("uploads/users/avatars")).length;
    const res = await api("/api/users", {
      method: "POST",
      token: admin,
      form: userForm([["avatar", new Blob(["<script>"], { type: "text/html" }), "x.html"]]),
    });
    assert.equal(res.status, 400);
    assert.equal(fs.readdirSync(fromRoot("uploads/users/avatars")).length, before);
  });

  it("deletes the uploaded file when the request fails validation", async () => {
    const before = fs.readdirSync(fromRoot("uploads/users/avatars")).length;
    const form = new FormData();
    form.append("firstName", "X"); // too short, and other fields missing
    form.append("avatar", new Blob([PNG], { type: "image/png" }), "a.png");
    const res = await api("/api/users", { method: "POST", token: admin, form });
    assert.equal(res.status, 400);
    await waitForFs();
    assert.equal(fs.readdirSync(fromRoot("uploads/users/avatars")).length, before);
  });
});

describe("demo mode", () => {
  let admin, manager;
  before(async () => {
    process.env.DEMO_MODE = "true";
    admin = (await login(demoEmail("admin"))).accessToken;
    manager = (await login(demoEmail("manager"))).accessToken;
  });
  after(() => {
    delete process.env.DEMO_MODE;
  });

  it("health reports demo mode", async () => {
    assert.equal((await api("/api/health")).body.data.demoMode, true);
  });

  it("the demo accounts can't be changed or deleted, even by the manager", async () => {
    const target = String((await User.findOne({ email: demoEmail("user") }))._id);
    const update = await api(`/api/users/${target}`, { method: "PATCH", token: manager, json: { password: "Changed123!" } });
    const remove = await api(`/api/users/${target}`, { method: "DELETE", token: manager });
    assert.deepEqual([update.status, remove.status], [403, 403]);
    await login(demoEmail("user"));
  });

  it("users created in the demo are sandbox users that can be changed and deleted", async () => {
    const created = await api("/api/users", { method: "POST", token: admin, json: newUserFields() });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.sandbox, true);
    const id = created.body.data.user._id;

    const update = await api(`/api/users/${id}`, { method: "PATCH", token: admin, json: { lastName: "Edited" } });
    assert.equal(update.status, 200);
    assert.equal((await api(`/api/users/${id}`, { method: "DELETE", token: admin })).status, 200);
  });

  it("registering in demo mode creates a sandbox user", async () => {
    const res = await api("/api/auth/register", { method: "POST", json: newUserFields() });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.sandbox, true);
  });
});
