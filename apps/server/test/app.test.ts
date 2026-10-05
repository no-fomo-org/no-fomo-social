import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import collectionsList from "@no-fomo/core/fixtures/collections-list.json";
import type { AuthorFacet, PostsPage, SyncStatus } from "@no-fomo/core";
import { openDb } from "../src/db/open";
import { createApp } from "../src/http/app";
import { createMediaStore } from "../src/media/store";
import type { ServerConfig } from "../src/config";
import { markMediaSaved } from "../src/sync/ingest";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const HOST = "localhost:4747";
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const dataDir = mkdtempSync(join(tmpdir(), "nf-app-"));
  const db = openDb(":memory:");
  const config: ServerConfig = {
    port: 4747, dataDir, webDist: null, extensionId: EXT, devOrigins: ["http://localhost:5173"], dumpPayloads: false, extraMediaHosts: [],
  };
  const media = createMediaStore({
    dir: join(dataDir, "media"),
    fetch: (async () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0]))) as typeof fetch,
    onSaved: (job) => markMediaSaved(db, job),
  });
  app = createApp({ db, config, media });
});

const post = (path: string, body: unknown, origin = `chrome-extension://${EXT}`) =>
  app.request(path, {
    method: "POST",
    headers: { host: HOST, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) => app.request(path, { headers: { host: HOST } });

async function syncFixtures() {
  const { runId } = (await (await post("/api/sync/runs", {})).json()) as { runId: number };
  await post(`/api/sync/runs/${runId}/saved`, { payload: page1 });
  await post(`/api/sync/runs/${runId}/saved`, { payload: page2 });
  await post(`/api/sync/runs/${runId}/collections`, { payload: collectionsList });
  await post(`/api/sync/runs/${runId}/finish`, { ok: true });
}

describe("security", () => {
  it("rejects foreign Host headers (DNS rebinding)", async () => {
    const res = await app.request("/api/config", { headers: { host: "evil.example:4747" } });
    expect(res.status).toBe(403);
  });
  it("rejects writes from other origins", async () => {
    expect((await post("/api/sync/runs", {}, "https://evil.example")).status).toBe(403);
  });
  it("rejects non-JSON writes", async () => {
    const res = await app.request("/api/sync/runs", {
      method: "POST", headers: { host: HOST, origin: `chrome-extension://${EXT}`, "content-type": "text/plain" }, body: "{}",
    });
    expect(res.status).toBe(415);
  });
  it("allows the dev web origin and answers CORS preflight only for it", async () => {
    expect((await post("/api/sync/runs", {}, "http://localhost:5173")).status).toBe(201);
    const pre = await app.request("/api/sync/runs", { method: "OPTIONS", headers: { host: HOST, origin: "http://localhost:5173" } });
    expect(pre.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
  it("rejects path traversal in media ids", async () => {
    expect((await get("/media/thumbs/..%2F..%2Fetc")).status).toBe(404);
  });
});

describe("sync + read API", () => {
  it("syncs fixtures and lists posts newest-saved first", async () => {
    await syncFixtures();
    const page = (await (await get("/api/posts?limit=60")).json()) as PostsPage;
    expect(page.total).toBe(4);
    expect(page.items.map((p) => p.code)).toEqual(["DAbcReel01", "DAbcImg002", "DAbcCar003", "DAbcReel04"]);
    expect(page.items[0]).toMatchObject({
      thumbUrl: "/media/thumbs/3500000000000000001",
      permalink: "https://www.instagram.com/reel/DAbcReel01/",
    });
    const status = (await (await get("/api/sync/status")).json()) as SyncStatus;
    expect(status.run?.status).toBe("done");
    expect(status.lastSuccessAt).not.toBeNull();
  });

  it("filters by author, kind and collection, and pages with a cursor", async () => {
    await syncFixtures();
    const by = async (qs: string) => ((await (await get(`/api/posts?${qs}`)).json()) as PostsPage);
    expect((await by("author=111")).items.map((p) => p.code)).toEqual(["DAbcReel01", "DAbcCar003"]);
    expect((await by("kind=video")).total).toBe(2);
    expect((await by("collection=17900000000000002")).items.map((p) => p.code)).toEqual(["DAbcReel01", "DAbcCar003"]);
    const first = await by("limit=3");
    expect(first.nextCursor).not.toBeNull();
    const second = await by(`limit=3&cursor=${first.nextCursor}`);
    expect(second.items.map((p) => p.code)).toEqual(["DAbcReel04"]);
    expect(second.nextCursor).toBeNull();
    expect((await get("/api/posts?kind=nope")).status).toBe(400);
  });

  it("lists authors and collections with counts", async () => {
    await syncFixtures();
    const authors = (await (await get("/api/authors")).json()) as AuthorFacet[];
    expect(authors[0]).toMatchObject({ username: "devtips", count: 2, avatarUrl: "/media/avatars/111" });
    expect(await (await get("/api/collections")).json()).toEqual([
      { id: "17900000000000002", name: "AI tools", count: 2 },
      { id: "17900000000000003", name: "Design", count: 1 },
    ]);
  });

  it("serves cached thumbnails", async () => {
    await syncFixtures();
    const res = await get("/media/thumbs/3500000000000000001");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("returns 409 for pages sent to a finished run", async () => {
    const { runId } = (await (await post("/api/sync/runs", {})).json()) as { runId: number };
    await post(`/api/sync/runs/${runId}/finish`, { ok: true });
    expect((await post(`/api/sync/runs/${runId}/saved`, { payload: page1 })).status).toBe(409);
  });
});
