import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, EXTENSION_ID } from "@no-fomo/core";

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const webDist = fileURLToPath(new URL("../../web/build/client", import.meta.url));
  return {
    port: Number(env.NO_FOMO_PORT ?? DEFAULT_PORT),
    dataDir: env.NO_FOMO_HOME ?? join(homedir(), ".no-fomo"),
    webDist: existsSync(join(webDist, "index.html")) ? webDist : null,
    extensionId: env.NO_FOMO_EXTENSION_ID ?? EXTENSION_ID,
    devOrigins: env.NO_FOMO_DEV_ORIGINS ? list(env.NO_FOMO_DEV_ORIGINS) : ["http://localhost:5173"],
    dumpPayloads: env.NO_FOMO_DUMP === "1",
    extraMediaHosts: list(env.NO_FOMO_EXTRA_MEDIA_HOSTS),
  };
}
