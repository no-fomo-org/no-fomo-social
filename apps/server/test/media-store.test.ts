import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMediaStore, imageType } from "../src/media/store";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("media store", () => {
  it("downloads allowed images once and reports saved jobs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nf-media-"));
    let calls = 0;
    const saved: string[] = [];
    const store = createMediaStore({
      dir,
      fetch: (async () => { calls++; return new Response(JPEG); }) as typeof fetch,
      onSaved: (job) => saved.push(`${job.kind}:${job.id}`),
    });
    const job = { kind: "thumb" as const, id: "1", url: "https://scontent.cdninstagram.com/a.jpg" };
    store.enqueue([job, job]);
    await store.idle();
    expect(calls).toBe(1);
    expect(saved).toEqual(["thumb:1"]);
    expect(readFileSync(store.pathFor("thumb", "1"))).toEqual(JPEG);
  });

  it("refuses non-Instagram hosts and non-image bodies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nf-media-"));
    const store = createMediaStore({
      dir,
      fetch: (async () => new Response("<html>")) as typeof fetch,
      onSaved: () => {},
    });
    expect(await store.fetchNow({ kind: "thumb", id: "1", url: "http://169.254.169.254/x" })).toBe(false);
    expect(await store.fetchNow({ kind: "thumb", id: "2", url: "https://scontent.cdninstagram.com/a.jpg" })).toBe(false);
  });

  it("detects image types", () => {
    expect(imageType(JPEG)).toBe("image/jpeg");
    expect(imageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(imageType(Buffer.from("hello"))).toBeNull();
  });
});
