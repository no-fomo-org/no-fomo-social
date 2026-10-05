import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { AnalyzeError } from "./errors";

export type Downloader = (url: string, file: string, maxBytes: number) => Promise<void>;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createDownloader(o: { allowed: (url: string) => boolean; fetch?: typeof fetch; timeoutMs?: number }): Downloader {
  const fetchFn = o.fetch ?? fetch;
  return async (url, file, maxBytes) => {
    if (!o.allowed(url)) throw new AnalyzeError("download_failed", "Not an Instagram media link");
    let res: Response;
    try {
      res = await fetchFn(url, { redirect: "error", signal: AbortSignal.timeout(o.timeoutMs ?? 120_000) });
    } catch (e) {
      throw new AnalyzeError("download_failed", message(e));
    }
    if (!res.ok || !res.body) throw new AnalyzeError("download_failed", `HTTP ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new AnalyzeError("too_large");
    const out = createWriteStream(file, { mode: 0o600 });
    // Without a listener, a disk or folder error would crash the whole server.
    let writeError: Error | null = null;
    out.on("error", (e) => (writeError = e));
    let n = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        if (writeError) throw new AnalyzeError("download_failed", message(writeError));
        n += chunk.byteLength;
        if (n > maxBytes) throw new AnalyzeError("too_large");
        if (!out.write(chunk)) await once(out, "drain");
      }
      if (writeError) throw new AnalyzeError("download_failed", message(writeError));
    } catch (e) {
      throw e instanceof AnalyzeError ? e : new AnalyzeError("download_failed", message(e));
    } finally {
      out.end();
      await finished(out).catch(() => {});
    }
  };
}
