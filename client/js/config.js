"use strict";
// Where this page finds the backend API. Compiled to js/config.js by
// npm run build:client: run it again after changing this file.
//
// API_BASE_URL: the deployed backend's address, with no trailing slash and no /api,
// e.g. "https://jwt-auth-api.onrender.com". The backend must also list this page's
// origin (e.g. https://<user>.github.io) in its CORS_ORIGINS setting.
//
// Leave it empty when the API serves this page (http://localhost:3000/ or the
// deployed backend's own URL): it then uses the address it was loaded from.
// Opened from VS Code Live Server (port 5500/5501), it uses
// http://localhost:3000. Only set it when the page is hosted elsewhere
// (e.g. GitHub Pages).
//
// Only put a public URL here. This file is sent to every visitor, so it must
// never contain secrets, passwords or database connection strings.
window.APP_CONFIG = {
    API_BASE_URL: "",
};
