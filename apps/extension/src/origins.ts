import { DEFAULT_PORT } from "@no-fomo-social/core";

const DEV_SERVER = "http://localhost:5173";
/** True only in `wxt` dev and `wxt build --mode development`. Normal builds never trust the dev server. */
const DEV_BUILD = import.meta.env.MODE === "development";

/** Only the no-fomo-social web app may start a sync or receive Instagram data. */
export function appOrigins(dev: boolean = DEV_BUILD): string[] {
  const app = [`http://localhost:${DEFAULT_PORT}`, `http://127.0.0.1:${DEFAULT_PORT}`];
  return dev ? [...app, DEV_SERVER] : app;
}

export function isAppOrigin(url: string, dev: boolean = DEV_BUILD): boolean {
  try {
    return appOrigins(dev).includes(new URL(url).origin);
  } catch {
    return false;
  }
}
