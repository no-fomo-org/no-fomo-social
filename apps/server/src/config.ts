import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PORT, EXTENSION_ID } from "@no-fomo-social/core";
import { appPaths } from "./paths";

export interface ServerConfig {
  port: number;
  dataDir: string;
  webDist: string | null;
  extensionId: string;
  devOrigins: string[];
  dumpPayloads: boolean;
  extraMediaHosts: string[];
}

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** `pnpm dev` passes --dev, so only then does the server trust the web dev server on :5173. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv.slice(2)): ServerConfig {
  const dev = argv.includes("--dev");
  const { webDist } = appPaths(env);
  return {
    port: Number(env.NO_FOMO_PORT ?? DEFAULT_PORT),
    dataDir: env.NO_FOMO_HOME ?? join(homedir(), ".no-fomo"),
    webDist: existsSync(join(webDist, "index.html")) ? webDist : null,
    extensionId: env.NO_FOMO_EXTENSION_ID ?? EXTENSION_ID,
    devOrigins: env.NO_FOMO_DEV_ORIGINS ? list(env.NO_FOMO_DEV_ORIGINS) : dev ? ["http://localhost:5173"] : [],
    dumpPayloads: env.NO_FOMO_DUMP === "1",
    extraMediaHosts: list(env.NO_FOMO_EXTRA_MEDIA_HOSTS),
  };
}
