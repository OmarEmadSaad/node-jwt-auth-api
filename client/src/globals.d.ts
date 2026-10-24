// Set by config.ts, read by app.ts
interface AppConfig {
  API_BASE_URL: string;
}

interface Window {
  APP_CONFIG?: AppConfig;
}
