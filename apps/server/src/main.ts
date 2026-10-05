import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config";
import { openDb } from "./db/open";
import { cleanTempDirs, createAnalyzer } from "./analyze/analyzer";
import { createDownloader } from "./analyze/download";
import { ffmpegTools } from "./analyze/ffmpeg";
import { createModelCatalog } from "./analyze/models";
import { createOpenAIProvider } from "./analyze/provider";
import { failStaleReports } from "./analyze/report-store";
import { createApp } from "./http/app";
import { createMediaStore, isMediaUrl } from "./media/store";
import { createKeyStore } from "./secrets/key-store";
import { failStaleRuns, markMediaSaved } from "./sync/ingest";

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, "no-fomo.db"));
failStaleRuns(db);
failStaleReports(db, Date.now());
cleanTempDirs(tmpdir());
const media = createMediaStore({
  dir: join(config.dataDir, "media"),
  extraHosts: config.extraMediaHosts,
  onSaved: (job) => markMediaSaved(db, job),
});
const keys = createKeyStore(config.dataDir);
const analyzer = createAnalyzer({
  db,
  keys,
  tmpRoot: tmpdir(),
  tools: ffmpegTools,
  makeProvider: createOpenAIProvider,
  download: createDownloader({ allowed: (url) => isMediaUrl(url, config.extraMediaHosts) }),
});
const app = createApp({ db, config, media, keys, analyzer, models: createModelCatalog({ keys }) });

const server = serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, () => {
  console.log(`no-fomo is running at http://localhost:${config.port}`);
  console.log(`Data folder: ${config.dataDir}`);
  if (!config.webDist) console.log("Web app not built yet. In dev, open http://localhost:5173");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is busy. no-fomo may already be running: open http://localhost:${config.port}`);
    console.error(`To stop the old copy, run: kill $(lsof -ti tcp:${config.port})`);
    process.exit(1);
  }
  throw err;
});
