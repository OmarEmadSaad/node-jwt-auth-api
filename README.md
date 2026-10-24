# JWT Auth API

A REST API for user accounts, built with **Node.js, Express 5 and MongoDB**: JWT access
tokens, rotating refresh tokens, three roles, request validation, avatar/PDF uploads and
one consistent JSON response format. It comes with a portfolio page (`client/`) that calls the real
API, so visitors can log in with demo accounts and try every role.

## Features

- **Authentication:** register, log in, refresh, log out. Access tokens last 10 minutes;
  each refresh token works once and is revoked on logout.
- **Roles:** `user` can read; `admin` creates users and edits/deletes accounts with the
  `user` role; `manager` can do everything, including changing roles.
- **Passwords:** bcrypt-hashed, never returned. Login errors don't reveal which emails
  exist, and login/register/refresh are rate-limited per IP.
- **Validation:** express-validator on every request, Mongoose validation on save.
- **File uploads:** avatar (JPG/PNG/WEBP) and document (PDF), 5 MB each. Files are named by
  their checked type, never by the uploaded name, and cleaned up when replaced or deleted,
  or when the request fails.
- **Errors:** one handler, JSend-style JSON: `{ status, message, code, data }`.
- **Public demo mode:** demo accounts can't be changed by visitors; users created during
  the demo are sandbox users that can be edited, deleted and reset.

## Project structure

```
server.js                 entry point: loads .env, checks settings, connects, listens
src/
  app.js                  the Express app (middleware, static uploads, routes, health)
  config/                 db.js (Mongoose), cors.js, uploads.js (paths, file rules), demo.js
  routes/                 auth.routes.js, user.routes.js: URL -> middleware -> controller
  controllers/            read the request, call a service, send the JSON response
  services/               auth.service.js (tokens, login), user.service.js (CRUD, permissions)
  models/                 user.model.js: schema, password hashing hooks
  middleware/             verifyToken, allowedTo (roles), upload (multer), rateLimit,
                          validationSchema, asyncWrapper, errorHandler
  validators/             request schemas for express-validator
  utils/                  AppError, JWT helpers, role names, response status names
scripts/
  seedUsers.js            adds the 10 demo users (npm run seed)
  resetDemo.js            deletes sandbox users and their files (npm run demo:reset)
  createManager.js        makes your own account a manager (npm run create-manager)
  data/demoUsers.js       the demo accounts
test/                     API tests (node:test), run against a separate _test database
client/                   portfolio page: index.html, css/, js/app.js, js/config.js
docs/DEMO_CREDENTIALS.md  demo accounts, password and what each role can do
postman/                  Postman collection for every endpoint
uploads/
  defaults/avatar.svg     avatar for users without one (kept in git)
  users/avatars/          uploaded avatars (not in git)
  users/documents/        uploaded PDFs (not in git)
.github/workflows/        manual GitHub Pages deployment of client/
```

## API

All paths start with `/api`. Responses look like `{ "status": "success", "data": ... }` or
`{ "status": "fail", "message": "...", "code": 400, "data": [...] }`.

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/health` | public | API and database status, demo mode |
| POST | `/auth/register` | public | create an account (role is always `user`); JSON or multipart with `avatar`/`document` |
| POST | `/auth/login` | public | `{ email, password }` → user, `accessToken`, `refreshToken` |
| POST | `/auth/refresh` | refresh token | `{ refreshToken }` → a new token pair (the old one stops working) |
| POST | `/auth/logout` | logged in | revokes the refresh token |
| GET | `/users` | logged in | list users |
| GET | `/users/:id` | logged in | one user |
| POST | `/users` | admin, manager | create a user (only a manager may set `role`) |
| PUT / PATCH | `/users/:id` | admin, manager | update any subset of fields; files via multipart |
| DELETE | `/users/:id` | admin, manager | delete a user and their files |

Send the access token as `Authorization: Bearer <accessToken>`. Uploaded files are served
from `/uploads/...` (outside `/api`).

## Run locally

Requires **Node.js 22.9+** and a MongoDB database (a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works).

```bash
npm install
cp .env.example .env      # then fill in MONGODB_URI and two JWT secrets
npm run seed              # adds the 10 demo users (safe to run again)
npm run dev               # http://localhost:3000, restarts on changes
```

In Atlas, allow your IP under **Network Access**, or connections fail with an SSL "alert
number 80" error.

Open `client/index.html` with VS Code **Live Server** (port 5500, already allowed in
`CORS_ORIGINS`). The page uses `http://localhost:3000` automatically when it's opened from
localhost.

Demo logins are in [docs/DEMO_CREDENTIALS.md](docs/DEMO_CREDENTIALS.md). To make your own
account a manager: `npm run create-manager -- --email you@example.com`.

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | start with auto-restart |
| `npm start` | start (production) |
| `npm test` | run the API tests against `MONGODB_TEST_DB_NAME` (default `jwt_auth_api_test`) |
| `npm run seed` | add missing demo users; never changes existing ones |
| `npm run seed:reset` | delete and recreate the 10 demo users |
| `npm run demo:reset` | delete users created in the public demo, and their files |
| `npm run create-manager -- --email ...` | promote or create a manager |

### Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `MONGODB_URI` | yes | Atlas connection string (keep it secret) |
| `MONGODB_DB_NAME` | yes | database name, e.g. `jwt_auth_api` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes | two different long random strings |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | no | default `10m` and `7d` |
| `CORS_ORIGINS` | yes, for the page | comma-separated frontend origins, no trailing slash |
| `PORT` | no | default 3000; hosts usually set it |
| `DEMO_MODE` | no | `true` on the public demo (see below) |
| `AUTH_RATE_LIMIT_MAX` | no | auth requests per IP per 15 min, default 20 |
| `TRUST_PROXY` | behind a proxy | `1` on Render, Railway, Fly.io etc., so rate limiting sees real IPs |
| `MONGODB_TEST_DB_NAME` | no | database for `npm test`; must end in `_test` |

## Deploy

The page and the API are deployed separately: the page as static files, the API on a
Node.js host, the data in MongoDB Atlas. Nothing here is deployed automatically.

### 1. Database (MongoDB Atlas)

1. Create a **separate database for the public demo** (e.g. `MONGODB_DB_NAME=jwt_auth_api_demo`),
   so visitors never see or touch real users. Ideally use a database user that can only
   access that database.
2. **Network Access:** allow your host's outgoing IPs. Many free hosts don't have fixed
   IPs, in which case `0.0.0.0/0` is needed; then a strong database password matters even more.
3. Seed it once from your machine: set the demo database in `.env` and run `npm run seed`.

### 2. Backend (e.g. Render, Railway, Fly.io)

- Build command `npm install`, start command `npm start`, Node 22.9+.
- Set the environment variables above on the host (never commit them). For the public
  demo: `DEMO_MODE=true`, `TRUST_PROXY=1`, and
  `CORS_ORIGINS=https://<your-user>.github.io` (the page's origin, no path).
- Health check path: `/api/health`.
- **Uploads are files on disk.** Most free hosts have an ephemeral disk: uploaded avatars
  and PDFs disappear on every restart or redeploy (the users stay, but their file links
  break and the page shows the default avatar). For uploads that persist, attach a
  persistent disk mounted at `uploads/users`, or move uploads to object storage
  (S3, Cloudinary...), which needs code changes.
- Free instances sleep when idle; the first request can take up to a minute. The page
  shows "The API is waking up" while it waits.
- Optional: run `npm run demo:reset` on a schedule (e.g. a daily cron job) to remove
  visitors' sandbox users.

### 3. Frontend (GitHub Pages)

1. In `client/js/config.js`, set `API_BASE_URL` to the backend URL, e.g.
   `"https://jwt-auth-api.onrender.com"` (no trailing slash, no `/api`).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. **Actions → Deploy client to GitHub Pages → Run workflow.** It publishes `client/`.
4. Make sure the backend's `CORS_ORIGINS` contains `https://<your-user>.github.io`.

Any static host works the same way (Netlify, Vercel, Cloudflare Pages): publish the
`client/` folder.

## Security notes

- Secrets live only in `.env` (gitignored) or the host's settings. `client/` contains no
  secrets: only the public API URL.
- The page keeps tokens in memory only, never in localStorage or the console.
- An admin can't change or delete admins or managers. Otherwise they could set a
  manager's password and log in as them.
- Uploaded files get their extension from the checked MIME type and are served with
  `X-Content-Type-Options: nosniff`, so a disguised HTML file can't run as a page.
- Known trade-offs: an access token stays valid until it expires (up to 10 minutes) after
  a role change or deletion; refresh tokens are stored as-is in the database (hashing them
  would protect them if the database leaked); the rate limiter is in-memory, per process.
