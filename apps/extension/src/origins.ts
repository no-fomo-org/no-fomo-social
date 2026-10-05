import { DEFAULT_PORT } from "@no-fomo/core";

/** Only the no-fomo web app may start a sync or receive Instagram data. Port 5173 is the dev server. */
export const APP_ORIGINS = [`http://localhost:${DEFAULT_PORT}`, `http://127.0.0.1:${DEFAULT_PORT}`, "http://localhost:5173"];

export function isAppOrigin(url: string): boolean {
  try {
    return APP_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
