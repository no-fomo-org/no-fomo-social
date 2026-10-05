import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDownloader } from "../src/analyze/download";
import { isMediaUrl } from "../src/media/store";

const out = () => join(mkdtempSync(join(tmpdir(), "nf-dl-")), "v.mp4");
const ok = (bytes: number) => (async () => new Response(new Uint8Array(bytes).fill(1))) as typeof fetch;

describe("isMediaUrl", () => {
  it("allows only https Instagram CDN hosts", () => {
    expect(isMediaUrl("https://scontent.cdninstagram.com/v.mp4")).toBe(true);
    expect(isMediaUrl("https://video.xx.fbcdn.net/v.mp4")).toBe(true);
    expect(isMediaUrl("http://scontent.cdninstagram.com/v.mp4")).toBe(false);
    expect(isMediaUrl("https://evilcdninstagram.com/v.mp4")).toBe(false);
    expect(isMediaUrl("https://127.0.0.1/v.mp4")).toBe(false);
    expect(isMediaUrl("https://cdn.example/v.mp4", ["cdn.example"])).toBe(true);
  });
});

describe("downloader", () => {
  it("writes the body to the file", async () => {
    const f = out();
    await createDownloader({ allowed: () => true, fetch: ok(1000) })("https://x/v", f, 2000);
    expect(readFileSync(f).length).toBe(1000);
  });
  it("refuses hosts that are not allowed without fetching", async () => {
    let called = false;
    const dl = createDownloader({ allowed: () => false, fetch: (async () => { called = true; return new Response(""); }) as typeof fetch });
    await expect(dl("https://x/v", out(), 10)).rejects.toMatchObject({ code: "download_failed" });
    expect(called).toBe(false);
  });
  it("stops at the size limit", async () => {
    await expect(createDownloader({ allowed: () => true, fetch: ok(5000) })("https://x/v", out(), 1000)).rejects.toMatchObject({ code: "too_large" });
  });
  it("fails on HTTP errors", async () => {
    const dl = createDownloader({ allowed: () => true, fetch: (async () => new Response("no", { status: 403 })) as typeof fetch });
    await expect(dl("https://x/v", out(), 10)).rejects.toMatchObject({ code: "download_failed" });
  });
  it("does not follow redirects to other hosts", async () => {
    let init: RequestInit | undefined;
    const dl = createDownloader({ allowed: () => true, fetch: (async (_u: unknown, i?: RequestInit) => { init = i; return new Response("x"); }) as typeof fetch });
    await dl("https://x/v", out(), 10);
    expect(init?.redirect).toBe("error");
  });
});
