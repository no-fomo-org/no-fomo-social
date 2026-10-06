import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import collectionsList from "@no-fomo/core/fixtures/collections-list.json";
import mediaInfo from "@no-fomo/core/fixtures/media-info.json";
import type { AuthorFacet, ModelsInfo, PostMedia, PostsPage, SyncStatus } from "@no-fomo/core";
import { openDb, type Db } from "../src/db/open";
import { createApp } from "../src/http/app";
import { createMediaStore } from "../src/media/store";
import { createKeyStore, type KeyStore } from "../src/secrets/key-store";
import { createAnalyzer } from "../src/analyze/analyzer";
import { createModelCatalog } from "../src/analyze/models";
import type { ServerConfig } from "../src/config";
import { markMediaSaved } from "../src/sync/ingest";

/** Routes under test never reach a real job; any tool call would be a bug in the test. */
const never = () => {
  throw new Error("not used in this test");
};
const analyzerFor = (db: Db, keys: KeyStore) =>
  createAnalyzer({
    db, keys, tmpRoot: tmpdir(), makeProvider: never, download: never,
    tools: { probe: never, sceneTimes: never, tinyRgb: never, frameJpeg: never, extractAudio: never, scaleImage: never },
  });

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const HOST = "localhost:4747";
const CHOICE = { reportModel: "gpt-6-luna", transcribeModel: "gpt-transcribe", language: "English" };
const APP = "http://localhost:4747";
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
  const keys = createKeyStore(dataDir);
  app = createApp({ db, config, media, keys, analyzer: analyzerFor(db, keys), models: createModelCatalog({ keys }) });
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
  it("starts a full run on request and reports removals in the status", async () => {
    await syncFixtures();
    const r = await post("/api/sync/runs", { mode: "full" });
    expect(await r.json()).toMatchObject({ mode: "full" });
    const s = (await (await get("/api/sync/status")).json()) as SyncStatus;
    expect(s.run).toMatchObject({ mode: "full", status: "running", postsRemoved: 0, warning: null });
    expect(typeof s.lastFullAt).toBe("number");
    expect((await post("/api/sync/runs", { mode: "everything" })).status).toBe(400);
  });

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

describe("media links", () => {
  it("returns a post's parts and the earliest expiry", async () => {
    await syncFixtures();
    const res = await get("/api/posts/3500000000000000001/media");
    expect(res.status).toBe(200);
    const m = (await res.json()) as PostMedia;
    expect(m).toMatchObject({ id: "3500000000000000001", kind: "video" });
    expect(m.parts).toHaveLength(1);
    expect(m.parts[0]).toMatchObject({ index: 0, kind: "video", videoUrl: "https://scontent.cdninstagram.com/o1/v/reel1_720.mp4?oe=68C0A1B2" });
    expect(m.expiresAt).toBe(parseInt("68C0A1B2", 16));
  });

  it("answers 404 for unknown posts and 400 for bad ids", async () => {
    expect((await get("/api/posts/42/media")).status).toBe(404);
    expect((await get("/api/posts/..%2F..%2Fetc/media")).status).toBe(400);
  });

  it("stores fresh links and keeps the post's place, likes and collections", async () => {
    await syncFixtures();
    const before = (await (await get("/api/posts?limit=10")).json()) as PostsPage;
    const collectionsBefore = await (await get("/api/collections")).json();
    const res = await post("/api/sync/media/3500000000000000002", { payload: mediaInfo });
    expect(res.status).toBe(200);
    const m = (await res.json()) as PostMedia;
    expect(m.parts).toEqual([{
      index: 0, kind: "image", imageUrl: "https://scontent.cdninstagram.com/v/img2_1080.jpg?oe=6A000000", videoUrl: null, width: 1080, height: 1350,
    }]);
    expect(m.expiresAt).toBe(0x6a000000);
    const after = (await (await get("/api/posts?limit=10")).json()) as PostsPage;
    expect(after.items.map((p) => p.id)).toEqual(before.items.map((p) => p.id));
    expect(after.items.find((p) => p.id === "3500000000000000002")!.likeCount).toBe(215);
    // Media info carries no collection data, so collection counts must not change.
    expect(await (await get("/api/collections")).json()).toEqual(collectionsBefore);
  });

  it("rejects an answer about another post and writes nothing", async () => {
    await syncFixtures();
    const res = await post("/api/sync/media/3500000000000000001", { payload: mediaInfo });
    expect(res.status).toBe(422);
    const m = (await (await get("/api/posts/3500000000000000001/media")).json()) as PostMedia;
    expect(m.parts[0]!.videoUrl).toContain("reel1_720.mp4");
  });

  it("rejects fresh links for a post that is not in the library", async () => {
    expect((await post("/api/sync/media/3500000000000000002", { payload: mediaInfo })).status).toBe(404);
  });

  it("refuses fresh links from web pages", async () => {
    await syncFixtures();
    expect((await post("/api/sync/media/3500000000000000002", { payload: mediaInfo }, "https://evil.example")).status).toBe(403);
  });
});

describe("analyze routes", () => {
  it("rejects bad ids, unknown posts and the extension origin", async () => {
    expect((await post("/api/posts/abc/analyze", CHOICE, "http://localhost:4747")).status).toBe(400);
    expect((await post("/api/posts/999/analyze", CHOICE, "http://localhost:4747")).status).toBe(404);
    expect((await post("/api/posts/999/analyze", CHOICE)).status).toBe(403);
    expect((await get("/api/posts/999/report")).status).toBe(404);
  });
  it("deletes reports only from the app page", async () => {
    const del = (path: string, origin: string) =>
      app.request(path, { method: "DELETE", headers: { host: HOST, origin, "content-type": "application/json" } });
    expect((await del("/api/posts/abc/report", "http://localhost:4747")).status).toBe(400);
    expect((await del("/api/posts/999/report", "http://localhost:4747")).status).toBe(404);
    expect((await del("/api/posts/999/report", `chrome-extension://${EXT}`)).status).toBe(403);
  });
  it("answers 409 no_key before any key is saved", async () => {
    await syncFixtures();
    const id = ((await (await get("/api/posts?limit=1")).json()) as PostsPage).items[0]!.id;
    const res = await post(`/api/posts/${id}/analyze`, CHOICE, "http://localhost:4747");
    expect([res.status, ((await res.json()) as { error: string }).error]).toEqual([409, "no_key"]);
  });
  it("accepts only listed models and languages", async () => {
    await syncFixtures();
    const id = ((await (await get("/api/posts?limit=1")).json()) as PostsPage).items[0]!.id;
    const app_ = (body: unknown) => post(`/api/posts/${id}/analyze`, body, "http://localhost:4747");
    expect((await app_({})).status).toBe(400);
    expect((await app_({ ...CHOICE, reportModel: "gpt-transcribe" })).status).toBe(400);
    expect((await app_({ ...CHOICE, transcribeModel: "gpt-6-luna" })).status).toBe(400);
    expect((await app_({ ...CHOICE, language: "Klingon" })).status).toBe(400);
  });
  it("lists models for the app page only", async () => {
    const res = await get("/api/models");
    const body = (await res.json()) as ModelsInfo;
    expect([res.status, body.checked, body.report[0]!.id]).toEqual([200, false, "gpt-6-luna"]);
    const fromExt = await app.request("/api/models", { headers: { host: HOST, origin: `chrome-extension://${EXT}` } });
    expect(fromExt.status).toBe(403);
  });
});

describe("account pages, following and reports API", () => {
  it("stores a post on demand through the media route, only when asked", async () => {
    expect((await post("/api/sync/media/3500000000000000002", { payload: mediaInfo, store: false })).status).toBe(404);
    const res = await post("/api/sync/media/3500000000000000002", { payload: mediaInfo, store: true });
    expect(res.status).toBe(200);
    expect((await get("/api/posts/3500000000000000002/media")).status).toBe(200);
    expect(((await (await get("/api/posts")).json()) as PostsPage).total).toBe(0);
  });

  it("tells which posts are stored, saved or reported", async () => {
    await syncFixtures();
    const res = await get("/api/posts/known?ids=3500000000000000001,123");
    expect(await res.json()).toEqual([{ id: "3500000000000000001", saved: true, hasReport: false }]);
    expect((await get("/api/posts/known?ids=abc")).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => String(i + 1)).join(",");
    expect((await get(`/api/posts/known?ids=${many}`)).status).toBe(400);
    expect(await (await get("/api/posts/known?ids=")).json()).toEqual([]);
  });

  it("updates and filters the following list", async () => {
    const { runId } = (await (await post("/api/sync/following/runs", {})).json()) as { runId: number };
    expect(await (await post(`/api/sync/following/runs/${runId}/page`, { payload: { users: [{ pk: "8", username: "maria" }] } })).json()).toEqual({ seen: 1 });
    expect((await post(`/api/sync/following/runs/${runId}/finish`, { ok: true })).status).toBe(200);
    const page = (await (await get("/api/following?q=mar")).json()) as { items: Array<{ id: string }>; total: number };
    expect(page).toMatchObject({ total: 1, items: [{ id: "8" }] });
  });

  it("lists reports by source and report authors", async () => {
    await syncFixtures();
    expect(await (await get("/api/reports?source=other&limit=10")).json()).toEqual({ items: [], nextCursor: null, total: 0 });
    expect((await get("/api/reports?source=profile")).status).toBe(400);
    expect((await get("/api/authors?scope=reports")).status).toBe(200);
  });

  it("has no profile library routes", async () => {
    expect((await get("/api/profiles")).status).toBe(404);
    expect((await post("/api/sync/profiles/runs", { mode: "add", payload: {} })).status).toBe(404);
  });
});

describe("Instagram call log route", () => {
  it("stores a call from the extension and rejects bad ones", async () => {
    const ok = await post("/api/sync/ig-calls", { at: 1791283542340, kind: "feed", status: 429, result: "rate_limited", ms: 812 });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect((await post("/api/sync/ig-calls", { at: 1, kind: "dm", status: 200, result: "ok", ms: 1 })).status).toBe(400);
  });
});
