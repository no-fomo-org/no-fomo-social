import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { assembleReport, cleanModelSections, hasSummary, needsRefresh, postContext, systemPrompt, type PostReport } from "@no-fomo/core";
import type { Db } from "../db/open";
import { getPostItem, getPostMedia } from "../queries";
import type { KeyStore } from "../secrets/key-store";
import { analyzeOptions } from "../settings";
import { NotFoundError } from "../sync/ingest";
import type { Downloader } from "./download";
import { AnalyzeError } from "./errors";
import { ToolMissingError, type MediaTools } from "./ffmpeg";
import { buildInputs } from "./inputs";
import type { Provider } from "./provider";
import { failReport, finishReport, queueReport, setReportStep } from "./report-store";

export interface Analyzer { start(postId: string): PostReport; idle(): Promise<void> }

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

  function start(postId: string): PostReport {
    const media = getPostMedia(d.db, postId);
    if (!media) throw new NotFoundError(`Post ${postId} is not in your library`);
    if (!d.keys.get().openai) throw new AnalyzeError("no_key");
    if (running === postId || queue.includes(postId)) throw new AnalyzeError("already_running");
    if (needsRefresh(media, now() / 1000)) throw new AnalyzeError("links_expired");
    const report = queueReport(d.db, postId, analyzeOptions(d.db), now());
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
    await run(next);
    running = null;
    void pump();
  }

  async function run(postId: string) {
    const dir = mkdtempSync(join(d.tmpRoot, TEMP_PREFIX));
    try {
      const opts = analyzeOptions(d.db);
      const key = d.keys.get().openai;
      if (!key) throw new AnalyzeError("no_key");
      const post = getPostItem(d.db, postId);
      const media = getPostMedia(d.db, postId);
      if (!post || !media) throw new AnalyzeError("failed", "Post is gone");
      const provider = d.makeProvider(key);
      const inputs = await buildInputs({
        media, dir, tools: d.tools, download: d.download, provider, transcribeModel: opts.transcribeModel,
        onStep: (s) => setReportStep(d.db, postId, s),
      });
      setReportStep(d.db, postId, "writing");
      const transcriptText = inputs.transcript === null ? [] : [{ type: "text" as const, text: `Transcript:\n${inputs.transcript || "No speech."}` }];
      const raw = await provider.writeReport({
        model: opts.reportModel,
        system: systemPrompt(opts.language),
        content: [{ type: "text", text: postContext(post) }, ...transcriptText, ...inputs.content],
      });
      const sections = cleanModelSections(raw);
      if (!hasSummary(sections)) throw new AnalyzeError("bad_output");
      const transcribeModel = inputs.transcribed ? opts.transcribeModel : null;
      const markdown = assembleReport({ post, sections, transcript: inputs.transcript, reportModel: opts.reportModel, transcribeModel, analyzedAt: now() });
      finishReport(d.db, postId, { markdown, frameCount: inputs.frameCount, transcribeModel }, now());
    } catch (e) {
      const err =
        e instanceof AnalyzeError ? e
        : e instanceof ToolMissingError ? new AnalyzeError("no_ffmpeg")
        : new AnalyzeError("failed", e instanceof Error ? e.message : String(e));
      if (err.code === "failed") console.error(`Analysis of post ${postId} failed:`, e);
      failReport(d.db, postId, err.code, err.message === err.code ? null : err.message, now());
    } finally {
      await rm(dir, { recursive: true, force: true });
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
