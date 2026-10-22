import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { needsRefresh, type AnalyzeChoice, type PostReport } from "@no-fomo-social/core";
import type { Db } from "../db/open";
import { getPostItem, getPostMedia } from "../queries";
import type { KeyStore } from "../secrets/key-store";
import { rememberChoice } from "../settings";
import { NotFoundError } from "../sync/ingest";
import type { Downloader } from "./download";
import { AnalyzeError } from "./errors";
import { ToolMissingError, type MediaTools } from "./ffmpeg";
import { makeReport } from "./make-report";
import type { Provider } from "./provider";
import { failReport, finishReport, getReport, queueReport, setReportStep } from "./report-store";

export interface Analyzer { start(postId: string, choice: AnalyzeChoice): PostReport; idle(): Promise<void> }

const TEMP_PREFIX = "no-fomo-";

export function createAnalyzer(d: {
  db: Db;
  keys: KeyStore;
  makeProvider: (apiKey: string) => Provider;
  tools: MediaTools;
  download: Downloader;
  tmpRoot: string;
  now?: () => number;
}): Analyzer {
  const now = d.now ?? Date.now;
  const queue: string[] = [];
  let running: string | null = null;
  let waiters: Array<() => void> = [];

  function start(postId: string, choice: AnalyzeChoice): PostReport {
    const media = getPostMedia(d.db, postId);
    if (!media) throw new NotFoundError(`Post ${postId} is not in your library`);
    if (!d.keys.get().openai) throw new AnalyzeError("no_key");
    if (running === postId || queue.includes(postId)) throw new AnalyzeError("already_running");
    if (needsRefresh(media, now() / 1000)) throw new AnalyzeError("links_expired");
    rememberChoice(d.db, choice);
    const report = queueReport(d.db, postId, choice, now());
    queue.push(postId);
    // Start after the request returns, so a job never runs inside the caller's synchronous code.
    queueMicrotask(() => void pump());
    return report;
  }

  async function pump() {
    if (running) return;
    const next = queue.shift();
    if (!next) {
      const w = waiters;
      waiters = [];
      w.forEach((f) => f());
      return;
    }
    running = next;
    try {
      await run(next);
    } catch (e) {
      console.error(`Analysis of post ${next} could not finish:`, e);
    } finally {
      running = null;
      void pump();
    }
  }

  async function run(postId: string) {
    let dir: string | null = null;
    try {
      dir = mkdtempSync(join(d.tmpRoot, TEMP_PREFIX));
      // The report row holds the choice made for this run, even if a newer choice was saved since.
      const row = getReport(d.db, postId);
      if (!row) throw new AnalyzeError("failed", "Report row is gone");
      const choice = { language: row.language, reportModel: row.reportModel, transcribeModel: row.transcribeModel ?? "" };
      const key = d.keys.get().openai;
      if (!key) throw new AnalyzeError("no_key");
      const post = getPostItem(d.db, postId);
      const media = getPostMedia(d.db, postId);
      if (!post || !media) throw new AnalyzeError("failed", "Post is gone");
      const result = await makeReport({
        post, media, choice, dir, tools: d.tools, download: d.download, provider: d.makeProvider(key),
        onStep: (s) => setReportStep(d.db, postId, s), now: now(),
      });
      finishReport(d.db, postId, result, now());
    } catch (e) {
      const err =
        e instanceof AnalyzeError ? e
        : e instanceof ToolMissingError ? new AnalyzeError("no_ffmpeg")
        : new AnalyzeError("failed", e instanceof Error ? e.message : String(e));
      if (err.code === "failed") console.error(`Analysis of post ${postId} failed:`, e);
      failReport(d.db, postId, err.code, err.message === err.code ? null : err.message, now());
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true });
    }
  }

  return {
    start,
    idle: () => (!running && queue.length === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r))),
  };
}

/** Removes temp folders left by a run that was killed. Call once at startup, before any job. */
export function cleanTempDirs(tmpRoot: string) {
  for (const name of readdirSync(tmpRoot)) {
    if (/^no-fomo-[A-Za-z0-9]{6}$/.test(name)) rmSync(join(tmpRoot, name), { recursive: true, force: true });
  }
}
