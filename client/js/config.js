// Where this page finds the backend API.
//
// API_BASE_URL: the deployed backend's address, with no trailing slash and no /api,
// e.g. "https://jwt-auth-api.onrender.com". The backend must also list this page's
// origin (e.g. https://<user>.github.io) in its CORS_ORIGINS setting.
//
// Leave it empty while developing: when the page is opened from localhost or
// 127.0.0.1 (e.g. VS Code Live Server), it uses http://localhost:3000.
// On any other host, an empty value shows "demo backend not configured".
//
// Only put a public URL here. This file is sent to every visitor, so it must
// never contain secrets, passwords or database connection strings.
window.APP_CONFIG = {
  API_BASE_URL: "",
};
