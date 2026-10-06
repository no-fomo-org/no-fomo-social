import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import { openDb, type Db } from "../src/db/open";
import { createAnalyzer, cleanTempDirs } from "../src/analyze/analyzer";
import { AnalyzeError } from "../src/analyze/errors";
import { ToolMissingError, type MediaTools } from "../src/analyze/ffmpeg";
import type { Provider } from "../src/analyze/provider";
import { getReport } from "../src/analyze/report-store";
import { listPosts } from "../src/queries";
import { analyzeOptions } from "../src/settings";
import { createKeyStore, type KeyStore } from "../src/secrets/key-store";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";

let db: Db;
let keys: KeyStore;
let tmpRoot: string;
let calls: string[];
let reportText: string;
let provider: Provider;
let tools: MediaTools;
const KEY = "sk-test-1234567890abcdef";
const CHOICE = { reportModel: "gpt-6.1-sol", transcribeModel: "whisper-1", language: "Russian" };

const idOf = (kind: "video" | "image" | "carousel") => listPosts(db, { limit: 50, kind }).items[0]!.id;
const make = (over: { now?: () => number } = {}) =>
  createAnalyzer({
    db, keys, tmpRoot, tools,
    makeProvider: () => provider,
    download: async (_url, file) => {
      calls.push("download");
      writeFileSync(file, "x");
    },
    now: () => 0, // fixture links count as fresh at time 0
    ...over,
  });

beforeEach(() => {
  db = openDb(":memory:");
  const { runId } = startRun(db);
  ingestSavedPage(db, runId, page1);
  ingestSavedPage(db, runId, page2);
  finishRun(db, runId, { ok: true });
  keys = createKeyStore(mkdtempSync(join(tmpdir(), "nf-an-data-")));
  keys.set({ openai: KEY });
  tmpRoot = mkdtempSync(join(tmpdir(), "nf-an-tmp-"));
  calls = [];
  let px = 0;
  tools = {
    probe: async () => ({ durationSec: 12, hasAudio: true }),
    sceneTimes: async () => [],
    tinyRgb: async () => new Uint8Array(768).fill((px += 40) % 256),
    frameJpeg: async (_f, _t, out) => {
      writeFileSync(out, Buffer.from([0xff, 0xd8, 0xff]));
      return true;
    },
    extractAudio: async (_f, out) => {
      calls.push("audio");
      writeFileSync(out, "mp3");
    },
    scaleImage: async (_f, out) => writeFileSync(out, Buffer.from([0xff, 0xd8, 0xff])),
  };
  provider = {
    transcribe: async () => {
      calls.push("transcribe");
      return "spoken words";
    },
    generate: async ({ system, content }) => {
      const images = content.filter((c) => c.type === "image").length;
      if (system.startsWith("You read the text")) {
        calls.push(`screen:${images}`);
        return "[frame at 0:00] keys.so";
      }
      calls.push(`write:${images}`);
      reportText = content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
      return "## Summary\nA post.";
    },
  };
});

describe("analyzer", () => {
  it("analyzes a video: download, frames, transcript, report", async () => {
    const a = make();
    const id = idOf("video");
    expect(a.start(id, CHOICE).status).toBe("queued");
    await a.idle();
    const r = getReport(db, id)!;
    expect(r.status).toBe("done");
    expect(r.markdown).toContain("## Summary\nA post.");
    expect(r.markdown).toContain("## Transcript\nspoken words");
    expect(r.transcribeModel).toBe("whisper-1");
    expect(r.frameCount).toBeGreaterThan(0);
    expect(calls.slice(0, 3)).toEqual(["download", "audio", "transcribe"]);
    expect(calls.at(-1)).toMatch(/^write:\d+$/);
    expect(calls.some((c) => c.startsWith("screen:"))).toBe(true);
    expect(reportText).toContain("Text read from the screen, with exact spelling:\n[frame at 0:00] keys.so");
    expect(readdirSync(tmpRoot)).toEqual([]);
  });

  it("skips transcription for a silent video", async () => {
    tools.probe = async () => ({ durationSec: 5, hasAudio: false });
    const a = make();
    const id = idOf("video");
    a.start(id, CHOICE);
    await a.idle();
    expect(calls).not.toContain("transcribe");
    expect(getReport(db, id)).toMatchObject({ status: "done", transcribeModel: null });
    expect(getReport(db, id)!.markdown).toContain("## Transcript\nNo speech.");
  });

  it("fails when ffmpeg finds no frame and there is no speech", async () => {
    tools.probe = async () => ({ durationSec: 5, hasAudio: false });
    tools.tinyRgb = async () => new Uint8Array(0);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = make();
    const id = idOf("video");
    a.start(id, CHOICE);
    await a.idle();
    expect(getReport(db, id)).toMatchObject({ status: "error", errorCode: "failed" });
    err.mockRestore();
  });

  it("analyzes a photo without ffmpeg frames or speech", async () => {
    const a = make();
    const id = idOf("image");
    a.start(id, CHOICE);
    await a.idle();
    const r = getReport(db, id)!;
    expect(r.status).toBe("done");
    expect(r.markdown).not.toContain("## Transcript");
    expect(calls).toEqual(["download", "screen:1", "write:1"]);
  });

  it("refuses to start without a key, twice for one post, or with old links", async () => {
    const id = idOf("video");
    keys.set({ openai: null });
    expect(() => make().start(id, CHOICE)).toThrowError(expect.objectContaining({ code: "no_key" }));
    keys.set({ openai: KEY });
    const a = make();
    a.start(id, CHOICE);
    expect(() => a.start(id, CHOICE)).toThrowError(expect.objectContaining({ code: "already_running" }));
    await a.idle();
    expect(() => make({ now: () => Date.now() * 10 }).start(id, CHOICE)).toThrowError(expect.objectContaining({ code: "links_expired" }));
  });

  it("runs one job at a time and finishes both", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = provider.generate;
    provider.generate = async (o) => {
      await gate;
      return first(o);
    };
    const a = make();
    const v = idOf("video");
    const p = idOf("image");
    a.start(v, CHOICE);
    a.start(p, CHOICE);
    await new Promise((r) => setTimeout(r, 20));
    expect(getReport(db, p)!.status).toBe("queued");
    release();
    await a.idle();
    expect([getReport(db, v)!.status, getReport(db, p)!.status]).toEqual(["done", "done"]);
  });

  it("fails with no_key when the key is removed while queued", async () => {
    const a = make();
    const id = idOf("video");
    a.start(id, CHOICE);
    keys.set({ openai: null });
    await a.idle();
    expect(getReport(db, id)).toMatchObject({ status: "error", errorCode: "no_key" });
  });

  it("maps errors and always removes the temp folder", async () => {
    provider.generate = async () => {
      throw new AnalyzeError("quota");
    };
    const a = make();
    const id = idOf("image");
    a.start(id, CHOICE);
    await a.idle();
    expect(getReport(db, id)).toMatchObject({ status: "error", errorCode: "quota" });
    expect(readdirSync(tmpRoot)).toEqual([]);

    tools.probe = async () => {
      throw new ToolMissingError("ffprobe is not installed");
    };
    const v = idOf("video");
    a.start(v, CHOICE);
    await a.idle();
    expect(getReport(db, v)!.errorCode).toBe("no_ffmpeg");

    tools.probe = async () => ({ durationSec: 16 * 60, hasAudio: true });
    a.start(v, CHOICE);
    await a.idle();
    expect(getReport(db, v)!.errorCode).toBe("too_long");
  });

  it("fails with bad_output when the answer has no summary", async () => {
    provider.generate = async () => "Sorry, I cannot help.";
    const a = make();
    const id = idOf("image");
    a.start(id, CHOICE);
    await a.idle();
    expect(getReport(db, id)!.errorCode).toBe("bad_output");
  });

  it("analyzes a carousel within the image cap", async () => {
    const a = make();
    const id = idOf("carousel");
    a.start(id, CHOICE);
    await a.idle();
    expect(getReport(db, id)!.status).toBe("done");
    expect(Number(calls.at(-1)!.split(":")[1])).toBeLessThanOrEqual(40);
  });
});

describe("analyzer choices", () => {
  it("uses the models and language chosen for this run and remembers them", async () => {
    const seen: string[] = [];
    provider.transcribe = async (_a, model) => {
      seen.push(`speech:${model}`);
      return "слова";
    };
    provider.generate = async ({ model, system }) => {
      if (system.startsWith("You read the text")) {
        if (!seen.includes(`screen:${model}`)) seen.push(`screen:${model}`);
        return "None.";
      }
      seen.push(`report:${model}`, system.includes("Write in Russian") ? "lang:ok" : "lang:wrong");
      return "## Summary\nПост.";
    };
    const a = make();
    const id = idOf("video");
    expect(a.start(id, CHOICE)).toMatchObject({ reportModel: "gpt-6.1-sol", transcribeModel: "whisper-1", language: "Russian" });
    expect(analyzeOptions(db)).toEqual({ reportModel: "gpt-6.1-sol", transcribeModel: "whisper-1", language: "Russian" });
    await a.idle();
    expect(seen).toEqual(["speech:whisper-1", "screen:gpt-6.1-sol", "report:gpt-6.1-sol", "lang:ok"]);
    expect(getReport(db, id)!.markdown).toContain("with gpt-6.1-sol and whisper-1");
  });
});

describe("analyzer robustness", () => {
  it("fails the job and keeps the queue moving when the temp folder cannot be made", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = createAnalyzer({
      db, keys, tmpRoot: join(tmpRoot, "missing"), tools, makeProvider: () => provider, download: async () => {}, now: () => 0,
    });
    const id = idOf("image");
    broken.start(id, CHOICE);
    await broken.idle();
    expect(getReport(db, id)).toMatchObject({ status: "error", errorCode: "failed" });
    err.mockRestore();
  });
});

describe("cleanTempDirs", () => {
  it("removes only our leftover folders", () => {
    const root = mkdtempSync(join(tmpdir(), "nf-clean-"));
    mkdtempSync(join(root, "no-fomo-"));
    writeFileSync(join(root, "keep.txt"), "x");
    cleanTempDirs(root);
    expect(readdirSync(root)).toEqual(["keep.txt"]);
    expect(existsSync(root)).toBe(true);
  });
});
