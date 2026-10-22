import { mkdirSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaJob } from "../sync/ingest";

const MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_HOSTS = ["cdninstagram.com", "fbcdn.net"];

export interface MediaStore {
  enqueue(jobs: MediaJob[]): void;
  fetchNow(job: MediaJob): Promise<boolean>;
  pathFor(kind: MediaJob["kind"], id: string): string;
  idle(): Promise<void>;
}

export function imageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "\x89PNG") return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  return null;
}

export function isMediaUrl(url: string, extraHosts: string[] = []): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && [...DEFAULT_HOSTS, ...extraHosts].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function createMediaStore(opts: {
  dir: string;
  onSaved: (job: MediaJob) => void;
  fetch?: typeof fetch;
  concurrency?: number;
  extraHosts?: string[];
}): MediaStore {
  const fetchFn = opts.fetch ?? fetch;
  const concurrency = opts.concurrency ?? 4;
  mkdirSync(join(opts.dir, "thumbs"), { recursive: true });
  mkdirSync(join(opts.dir, "avatars"), { recursive: true });

  const queue: MediaJob[] = [];
  const queued = new Set<string>();
  const inFlight = new Map<string, Promise<boolean>>();
  let active = 0;
  let waiters: Array<() => void> = [];
  const key = (j: MediaJob) => `${j.kind}:${j.id}`;
  const pathFor = (kind: MediaJob["kind"], id: string) => join(opts.dir, kind === "thumb" ? "thumbs" : "avatars", id);

  async function download(job: MediaJob): Promise<boolean> {
    if (!/^\d+$/.test(job.id) || !isMediaUrl(job.url, opts.extraHosts)) return false;
    try {
      const res = await fetchFn(job.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES || !imageType(buf)) return false;
      const file = pathFor(job.kind, job.id);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, buf);
      await rename(tmp, file);
      opts.onSaved(job);
      return true;
    } catch {
      return false;
    }
  }

  function fetchNow(job: MediaJob) {
    const k = key(job);
    const running = inFlight.get(k);
    if (running) return running;
    const p = download(job).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
  }

  function pump() {
    while (active < concurrency && queue.length > 0) {
      const job = queue.shift()!;
      active++;
      void fetchNow(job).finally(() => {
        active--;
        queued.delete(key(job));
        pump();
      });
    }
    if (active === 0 && queue.length === 0) {
      const w = waiters;
      waiters = [];
      w.forEach((f) => f());
    }
  }

  return {
    pathFor,
    fetchNow,
    enqueue(jobs) {
      for (const j of jobs) {
        if (queued.has(key(j))) continue;
        queued.add(key(j));
        queue.push(j);
      }
      pump();
    },
    idle: () => (active === 0 && queue.length === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r))),
  };
}
