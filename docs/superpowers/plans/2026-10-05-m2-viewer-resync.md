# Milestone 2: Viewer, Fresh Media Links, Full Resync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner opens any saved post in a large viewer, plays videos in a good player, browses photos and carousels, gets expired media links renewed on the fly, and can run a full resync that hides posts unsaved directly on Instagram.

**Architecture:** `packages/core` gains a media info call, a shared Instagram request gate, and parts for every post. `apps/server` serves a post's media links and accepts fresh links relayed by the extension; a complete full run hides posts it did not see. `apps/extension` adds a `media:refresh` message that runs one gated Instagram request in the Instagram tab. `apps/web` replaces the side panel with a full-window viewer built on Video.js 10 primitives and our own Tailwind controls. Media plays straight from the Instagram CDN.

**Tech Stack:** Existing M1 stack (Node 22, pnpm, TS, Vitest, Hono, Drizzle, better-sqlite3, Zod, WXT, React Router 8 SPA, Tailwind 4, Base UI, Hugeicons, TanStack Query) plus `@videojs/react@10.0.1` (Apache-2.0).

**Spec:** `docs/superpowers/specs/2026-10-05-m2-viewer-resync-design.md`

## Global Constraints

- All M1 global constraints still apply (see `docs/superpowers/plans/2026-10-05-m1-foundation.md`): `127.0.0.1` only, Instagram calls only from the content script, all Instagram paths and parsing in `packages/core/src/ig/`, mutating routes JSON only from allowed origins.
- Instagram requests: at least 2s + 0-1s random jitter between **any** two requests (sync and refresh share one gate). A 429, `spam: true` or `status: "fail"` blocks all Instagram requests for 10 minutes.
- Videos are never stored and never proxied. Media plays from the CDN URL.
- A media link counts as stale when it expires in less than 10 minutes (`expiresAt - now < 600` seconds).
- Full resync safety rule: hide nothing when more than 30% of visible posts **and** more than 20 posts would be hidden.
- UI follows `DESIGN.md`: Geist, Hugeicons only, one accent, motion 200-300ms with `ease-out-soft`, off under reduced motion. Zero em-dashes or en-dashes in UI strings. Plain simple English.
- Video.js docs for the installed version live in `node_modules/@videojs/react/docs/` (start at `llms.txt`). When a Video.js prop or type in this plan does not match the installed version, follow the bundled docs and keep the behavior the same.

## Review Focus

1. **Link expires mid-session.** The owner pauses a video for hours, then seeks. The `<video>` errors; the viewer refreshes once, the player remounts with the new link and resumes at the saved position. Test in Task 6 (`resumeAt`, `needsRefresh`) and checked by hand in Task 10.
2. **Flipping fast through posts.** Holding Down through 30 old posts must not queue 30 Instagram requests. The viewer waits 400ms before asking for a refresh and cancels when the post changes. Test in Task 6 (`REFRESH_DELAY_MS` exported and used by the hook) and checked in Task 10.
3. **Old extension installed.** The M1 extension answers `media:refresh` with `unknown_type`. The viewer says the extension is out of date, not a generic error. Test in Task 6.
4. **Broken or blocked localStorage.** Private mode, full storage, or garbage JSON in our keys must never break playback. Test in Task 6.
5. **Refresh for the wrong post.** Instagram answers with another post, or the post is not in the library. The server rejects it and writes nothing. Test in Task 3.

---

## File Structure

```
packages/core/
  src/ig/parse.ts            MODIFY  single posts get one part
  src/ig/client.ts           MODIFY  mediaInfo(), not_found error code
  src/ig/gate.ts             CREATE  shared request gate + gateClient()
  src/sync/run-sync.ts       MODIFY  mode passed to startRun
  src/api.ts                 MODIFY  SyncMode, MediaPart, PostMedia, run fields
  src/index.ts               MODIFY  export gate
  fixtures/media-info.json   CREATE  synthetic media info response
  test/parse.test.ts, test/client.test.ts, test/gate.test.ts, test/run-sync.test.ts
apps/server/
  src/db/schema.ts           MODIFY  sync_runs.posts_removed, sync_runs.warning
  drizzle/0004_*.sql         GENERATED
  src/sync/ingest.ts         MODIFY  ingestMediaInfo, startRun(mode), finishRun hides missing posts
  src/queries.ts             MODIFY  getPostMedia, syncStatus fields
  src/http/app.ts            MODIFY  GET /api/posts/:id/media, POST /api/sync/media/:id, POST /api/sync/runs {mode}
  test/ingest.test.ts, test/app.test.ts
apps/extension/
  src/external.ts            MODIFY  media:refresh, sync:start mode
  src/media-fetch.ts         CREATE  one media info call + relay
  src/relay-sink.ts          MODIFY  startRun(mode)
  entrypoints/instagram.content.ts  MODIFY  gate, media:fetch
  test/external.test.ts, test/media-fetch.test.ts
apps/web/
  app/lib/api.ts             MODIFY  api.media
  app/lib/extension.ts       MODIFY  sync mode, refreshExtensionMedia
  app/lib/media.ts           CREATE  needsRefresh, error codes and texts
  app/lib/player-prefs.ts    CREATE  positions, resume rule, volume
  app/lib/ab-loop.ts         CREATE  A-B loop state
  app/lib/use-post-media.ts  CREATE  media query + refresh hook
  app/components/player/player.tsx          CREATE  Video.js player
  app/components/player/player-controls.tsx CREATE  controls bar
  app/components/viewer/viewer.tsx          CREATE  full-window dialog
  app/components/viewer/media-stage.tsx     CREATE  image / video / carousel / errors
  app/components/viewer/carousel.tsx        CREATE
  app/components/viewer/post-details.tsx    CREATE  (moved from post-sheet)
  app/components/post-sheet.tsx             DELETE
  app/components/sync-control.tsx           MODIFY  full resync menu, hint, note
  app/routes/library.tsx                    MODIFY  use Viewer
  test/media.test.ts, test/player-prefs.test.ts, test/ab-loop.test.ts
README.md                    MODIFY  viewer + full resync notes
```

---

### Task 1: Core: parts for every post, media info call

**Files:**
- Modify: `packages/core/src/ig/parse.ts:72-78`, `packages/core/src/ig/client.ts`
- Create: `packages/core/fixtures/media-info.json`
- Test: `packages/core/test/parse.test.ts`, `packages/core/test/client.test.ts`, `packages/core/test/run-sync.test.ts` (fake client only)

**Interfaces:**
- Produces:
  - `parseMedia` now returns `parts` with one entry (index 0) for image and video posts.
  - `type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response" | "not_found"`
  - `interface IgClient { savedPage(cursor: string | null): Promise<unknown>; collectionsPage(cursor: string | null): Promise<unknown>; mediaInfo(id: string): Promise<unknown> }`
  - Fixture `@no-fomo/core/fixtures/media-info.json`: post `3500000000000000002` with links ending `?oe=6A000000`.

- [ ] **Step 1: Write the fixture**

`packages/core/fixtures/media-info.json`:
```json
{
  "num_results": 1,
  "status": "ok",
  "items": [
    {
      "pk": "3500000000000000002",
      "code": "DAbcImg002",
      "taken_at": 1755900000,
      "media_type": 1,
      "product_type": "feed",
      "caption": { "text": "Grid systems, thanks @someone. for the tip #design" },
      "user": {
        "pk": "222",
        "username": "designnotes",
        "full_name": "Design Notes",
        "profile_pic_url": "https://scontent.cdninstagram.com/v/p150/designnotes.jpg"
      },
      "image_versions2": {
        "candidates": [
          { "width": 1080, "height": 1350, "url": "https://scontent.cdninstagram.com/v/img2_1080.jpg?oe=6A000000" },
          { "width": 480, "height": 600, "url": "https://scontent.cdninstagram.com/v/img2_480.jpg?oe=6A000000" }
        ]
      },
      "like_count": 215,
      "comment_count": 5,
      "accessibility_caption": "May be an image of text that says 'Grid systems'.",
      "location": { "pk": 1, "name": "Berlin, Germany" }
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

In `packages/core/test/parse.test.ts`, change the reel expectation `parts: []` (line 31) to:
```ts
      parts: [{ index: 0, kind: "video", videoUrl: "https://scontent.cdninstagram.com/o1/v/reel1_720.mp4?oe=68C0A1B2", width: 720, height: 1280 }],
```
and add:
```ts
  it("gives single image posts one full-size part", () => {
    const img = parseMediaPage(page1).items[1]!;
    expect(img.parts).toEqual([{
      index: 0, kind: "image", imageUrl: "https://scontent.cdninstagram.com/v/img2_1080.jpg", videoUrl: null,
      width: 1080, height: 1350, accessibilityCaption: "May be an image of text that says 'Grid systems'.",
    }]);
  });

  it("parses a media info response", () => {
    const page = parseMediaPage(mediaInfo);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: "3500000000000000002", likeCount: 215 });
    expect(page.items[0]!.parts[0]!.imageUrl).toBe("https://scontent.cdninstagram.com/v/img2_1080.jpg?oe=6A000000");
  });
```
with `import mediaInfo from "../fixtures/media-info.json";` at the top.

In `packages/core/test/client.test.ts` add:
```ts
  it("reads one post's media info", async () => {
    const f = fakeFetch(json({ items: [], status: "ok" }));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => null });
    await ig.mediaInfo("3500000000000000002");
    expect(f.calls[0]!.url).toBe("https://www.instagram.com/api/v1/media/3500000000000000002/info/");
  });

  it("reports a deleted post as not_found", async () => {
    const ig = (r: () => Response) => createIgClient({ fetch: fakeFetch(r).fn, csrfToken: () => null });
    expect(await codeOf(ig(json({}, 404)).mediaInfo("1"))).toBe("not_found");
    expect(await codeOf(ig(json({ message: "Media not found or unavailable", status: "fail" }, 400)).mediaInfo("1"))).toBe("not_found");
    expect(await codeOf(ig(json({ message: "Media not found or unavailable", status: "fail" })).mediaInfo("1"))).toBe("not_found");
    expect(await codeOf(ig(json({ message: "checkpoint", status: "fail" }, 400)).mediaInfo("1"))).toBe("http_error");
  });
```

In `packages/core/test/run-sync.test.ts`, add to the fake `ig` object in `setup()` so it still satisfies `IgClient`:
```ts
    async mediaInfo() { throw new Error("not used by sync"); },
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run packages/core`
Expected: FAIL (`ig.mediaInfo is not a function`, single image `parts` is `[]`).

- [ ] **Step 4: Implement**

`packages/core/src/ig/parse.ts`, replace the `parts` block:
```ts
  const parts =
    kind === "carousel"
      ? arr(m.carousel_media).map((p, i) => parsePart(obj(p), i))
      : [parsePart(m, 0)];
  const cleanParts = parts.filter((p): p is ParsedMediaPart => p !== null);
  const first = cleanParts[0];
```
and return `parts: cleanParts` (remove the old `first` line).

`packages/core/src/ig/client.ts`:
```ts
export type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response" | "not_found";

export interface IgClient {
  savedPage(cursor: string | null): Promise<unknown>;
  collectionsPage(cursor: string | null): Promise<unknown>;
  mediaInfo(id: string): Promise<unknown>;
}

const NOT_FOUND_MESSAGE = "This post was deleted on Instagram.";
const isNotFound = (message: unknown) => typeof message === "string" && /not found|unavailable|deleted/i.test(message);
```
In `get()`, after the 401/403 line:
```ts
    if (res.status === 404) throw new IgError("not_found", NOT_FOUND_MESSAGE, 404);
    if (res.status === 400) {
      const b = (await res.clone().json().catch(() => null)) as { message?: unknown } | null;
      if (isNotFound(b?.message)) throw new IgError("not_found", NOT_FOUND_MESSAGE, 400);
    }
```
and before the `b.status === "fail"` line:
```ts
    if (b.status === "fail" && isNotFound(b.message)) throw new IgError("not_found", NOT_FOUND_MESSAGE);
```
Add to the returned object:
```ts
    mediaInfo: (id) => get("post", `/api/v1/media/${id}/info/`, {}),
```
`runSync` already ignores a collections-list 404 by `e.status === 404`; that still works because the 404 error keeps `status: 404`.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. If a server test asserted that single posts have no rows in `post_parts`, update it to expect one row.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): media info call, not_found errors, parts for single posts"
```

---

### Task 2: Core: shared request gate, sync mode

**Files:**
- Create: `packages/core/src/ig/gate.ts`
- Modify: `packages/core/src/sync/run-sync.ts`, `packages/core/src/api.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/gate.test.ts`, `packages/core/test/run-sync.test.ts`

**Interfaces:**
- Consumes: `IgClient`, `IgError` (Task 1).
- Produces:
  - `type SyncMode = "incremental" | "full"` (in `api.ts`)
  - `interface RequestGate { run<T>(call: () => Promise<T>): Promise<T> }`
  - `createRequestGate(opts: { sleep: (ms: number) => Promise<void>; now?: () => number; gapMs?: () => number; cooldownMs?: number }): RequestGate`
  - `gateClient(ig: IgClient, gate: RequestGate): IgClient`
  - `SyncSink.startRun(mode: SyncMode): Promise<{ runId: number }>`; `RunSyncDeps.mode?: SyncMode` (default `"incremental"`)

- [ ] **Step 1: Write failing tests**

`packages/core/test/gate.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { IgError } from "../src/ig/client";
import { createRequestGate } from "../src/ig/gate";

function clock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
    sleeps,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
  };
}

describe("request gate", () => {
  it("lets the first call through at once and spaces the next ones", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 2500 });
    await gate.run(async () => 1);
    c.advance(500);
    await gate.run(async () => 2);
    expect(c.sleeps).toEqual([2000]);
  });

  it("runs calls one at a time, in order", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 2500 });
    const order: string[] = [];
    const slow = gate.run(async () => { order.push("a:start"); await Promise.resolve(); order.push("a:end"); });
    const fast = gate.run(async () => { order.push("b"); });
    await Promise.all([slow, fast]);
    expect(order).toEqual(["a:start", "a:end", "b"]);
    expect(c.sleeps).toEqual([2500]);
  });

  it("blocks every call for 10 minutes after Instagram asks to slow down", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(async () => { throw new IgError("rate_limited", "slow"); })).rejects.toMatchObject({ code: "rate_limited" });
    let called = false;
    await expect(gate.run(async () => { called = true; })).rejects.toMatchObject({ code: "rate_limited" });
    expect(called).toBe(false);
    c.advance(10 * 60_000);
    await gate.run(async () => { called = true; });
    expect(called).toBe(true);
  });

  it("a failed call does not jam the queue", async () => {
    const c = clock();
    const gate = createRequestGate({ sleep: c.sleep, now: c.now, gapMs: () => 0 });
    await expect(gate.run(async () => { throw new Error("network"); })).rejects.toThrow("network");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });
});
```

In `packages/core/test/run-sync.test.ts`, change the fake sink's `startRun` to record the mode:
```ts
    async startRun(mode) { log.push(`sink:start:${mode}`); return { runId: 7 }; },
```
(update any existing `"sink:start"` expectations to `"sink:start:incremental"`), and add:
```ts
  it("asks the server for the requested mode", async () => {
    const s = setup({ saved: [page(1, null)] });
    await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep, mode: "full" });
    expect(s.log[0]).toBe("sink:start:full");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core`
Expected: FAIL (`Cannot find module '../src/ig/gate'`, `sink:start:full` missing).

- [ ] **Step 3: Implement**

`packages/core/src/api.ts`, add at the top (after the import):
```ts
export type SyncMode = "incremental" | "full";
```
and change `SyncRunInfo.mode` to `mode: SyncMode;`.

`packages/core/src/ig/gate.ts`:
```ts
import { IgError, type IgClient } from "./client";

export interface RequestGate {
  run<T>(call: () => Promise<T>): Promise<T>;
}

/**
 * Every Instagram request in the tab goes through one gate: one at a time,
 * a pause between them, and a 10 minute stop after Instagram asks to slow down.
 */
export function createRequestGate(opts: {
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  /** Pause between two requests. Default 2000-3000 ms. */
  gapMs?: () => number;
  cooldownMs?: number;
}): RequestGate {
  const now = opts.now ?? Date.now;
  const gap = opts.gapMs ?? (() => 2000 + Math.floor(Math.random() * 1000));
  const cooldown = opts.cooldownMs ?? 10 * 60_000;
  let lastAt: number | null = null;
  let blockedUntil = 0;
  let tail: Promise<unknown> = Promise.resolve();

  async function runOne<T>(call: () => Promise<T>): Promise<T> {
    if (now() < blockedUntil) throw new IgError("rate_limited", "Instagram asked to slow down. Try again in a few minutes.");
    if (lastAt !== null) {
      const wait = lastAt + gap() - now();
      if (wait > 0) await opts.sleep(wait);
    }
    lastAt = now();
    try {
      return await call();
    } catch (e) {
      if (e instanceof IgError && (e.code === "rate_limited" || e.code === "refused")) blockedUntil = now() + cooldown;
      throw e;
    }
  }

  return {
    run(call) {
      const result = tail.then(() => runOne(call));
      tail = result.catch(() => {});
      return result;
    },
  };
}

export function gateClient(ig: IgClient, gate: RequestGate): IgClient {
  return {
    savedPage: (cursor) => gate.run(() => ig.savedPage(cursor)),
    collectionsPage: (cursor) => gate.run(() => ig.collectionsPage(cursor)),
    mediaInfo: (id) => gate.run(() => ig.mediaInfo(id)),
  };
}
```

`packages/core/src/sync/run-sync.ts`:
```ts
import type { SyncMode } from "../api";
```
- `SyncSink.startRun(mode: SyncMode): Promise<{ runId: number }>;`
- `RunSyncDeps` gets `/** Default "incremental". The server may still choose "full". */ mode?: SyncMode;`
- the call becomes `({ runId } = await deps.sink.startRun(deps.mode ?? "incremental"));`

`packages/core/src/index.ts`: add `export * from "./ig/gate";`

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run packages/core && pnpm --filter @no-fomo/core typecheck`
Expected: PASS. (`apps/extension` typecheck fails until Task 5 because `createRelaySink().startRun` takes no mode; that is fixed there.)

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): shared Instagram request gate and sync mode"
```

---

### Task 3: Server: media links read + refresh

**Files:**
- Modify: `apps/server/src/sync/ingest.ts`, `apps/server/src/queries.ts`, `apps/server/src/http/app.ts`, `packages/core/src/api.ts`
- Test: `apps/server/test/app.test.ts`

**Interfaces:**
- Consumes: parser parts (Task 1), fixture `media-info.json` (Task 1).
- Produces:
  - `interface MediaPart { index: number; kind: "image" | "video"; imageUrl: string | null; videoUrl: string | null; width: number | null; height: number | null }`
  - `interface PostMedia { id: string; kind: MediaKind; parts: MediaPart[]; expiresAt: number | null }` (unix seconds)
  - `GET /api/posts/:id/media` → `PostMedia` | 404 `{ error: "not_found" }`
  - `POST /api/sync/media/:id` body `{ payload }` → `PostMedia`; 404 when the post is not in the library; 422 when Instagram answered with another post.
  - `getPostMedia(db: Db, id: string): PostMedia | null`, `ingestMediaInfo(db: Db, id: string, raw: unknown): MediaJob[]`, `class MismatchError extends Error`

- [ ] **Step 1: Write failing tests**

In `apps/server/test/app.test.ts` add the import `import mediaInfo from "@no-fomo/core/fixtures/media-info.json";`, add `PostMedia` to the type import, and add:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server`
Expected: FAIL (404 from the catch-all `/api/*` route).

- [ ] **Step 3: Implement**

`packages/core/src/api.ts`, add:
```ts
export interface MediaPart {
  index: number;
  kind: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
}
export interface PostMedia {
  id: string;
  kind: MediaKind;
  parts: MediaPart[];
  /** Unix seconds when the first of these links stops working. Null when unknown. */
  expiresAt: number | null;
}
```

`apps/server/src/sync/ingest.ts`: extract two helpers from `upsertPost` and use them there (behavior unchanged):
```ts
function replaceParts(q: Q, p: ParsedPost) {
  q.delete(postParts).where(eq(postParts.postId, p.id)).run();
  if (p.parts.length === 0) return;
  q.insert(postParts)
    .values(p.parts.map((part) => ({
      postId: p.id, idx: part.index, kind: part.kind, imageUrl: part.imageUrl, videoUrl: part.videoUrl,
      width: part.width, height: part.height, accessibilityCaption: part.accessibilityCaption,
    })))
    .run();
}

function replaceSearch(q: Q, p: ParsedPost) {
  q.run(sql`DELETE FROM post_search WHERE post_id = ${p.id}`);
  q.run(sql`INSERT INTO post_search (post_id, body) VALUES (${p.id}, ${searchBody(p)})`);
}
```
Then add:
```ts
export class MismatchError extends Error {}

/**
 * Fresh links for one post from Instagram's media info.
 * Keeps the post's feed position, run ids and collections: this answer says nothing about them.
 */
export function ingestMediaInfo(db: Db, id: string, raw: unknown): MediaJob[] {
  const p = parseMediaPage(raw).items[0];
  if (!p || p.id !== id) throw new MismatchError(`Instagram answered about a different post than ${id}`);
  const jobs: MediaJob[] = [];
  db.transaction((tx) => {
    const existing = tx.select({ thumbPath: posts.thumbPath }).from(posts).where(eq(posts.id, id)).get();
    if (!existing) throw new NotFoundError(`Post ${id} is not in your library`);
    upsertAuthor(tx, p.author, jobs);
    tx.update(posts).set(postFields(p)).where(eq(posts.id, id)).run();
    replaceParts(tx, p);
    replaceSearch(tx, p);
    if (!existing.thumbPath && p.thumbnailUrl) jobs.push({ kind: "thumb", id, url: p.thumbnailUrl });
  });
  return jobs;
}
```

`apps/server/src/queries.ts`:
```ts
import { expiresAtFromUrl, type MediaPart, type PostMedia } from "@no-fomo/core";
import { postParts } from "./db/schema"; // add to the existing schema import

export function getPostMedia(db: Db, id: string): PostMedia | null {
  const p = db
    .select({ id: posts.id, kind: posts.kind, videoUrl: posts.videoUrl, thumbnailUrl: posts.thumbnailUrl, width: posts.width, height: posts.height })
    .from(posts)
    .where(eq(posts.id, id))
    .get();
  if (!p) return null;
  const parts: MediaPart[] = db
    .select().from(postParts).where(eq(postParts.postId, id)).orderBy(asc(postParts.idx)).all()
    .map((r) => ({ index: r.idx, kind: r.kind, imageUrl: r.imageUrl, videoUrl: r.videoUrl, width: r.width, height: r.height }));
  // Posts stored before single posts had parts: a video still has its own link.
  if (parts.length === 0 && p.kind === "video" && p.videoUrl) {
    parts.push({ index: 0, kind: "video", imageUrl: p.thumbnailUrl, videoUrl: p.videoUrl, width: p.width, height: p.height });
  }
  const expiries = parts
    .flatMap((x) => [x.imageUrl, x.videoUrl])
    .map(expiresAtFromUrl)
    .filter((x): x is number => x !== null);
  return { id: p.id, kind: p.kind, parts, expiresAt: expiries.length ? Math.min(...expiries) : null };
}
```

`apps/server/src/http/app.ts`:
- import `getPostMedia` and `ingestMediaInfo`, `MismatchError`.
- in `onError`, before the generic branch: `if (err instanceof MismatchError) return c.json({ error: err.message }, 422);`
- after the `/api/sync/runs/:id/finish` route:
```ts
  app.post("/api/sync/media/:id", async (c) => {
    const id = Id.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    media.enqueue(ingestMediaInfo(db, id, payload));
    return c.json(getPostMedia(db, id));
  });
```
- after the `/api/posts` route:
```ts
  app.get("/api/posts/:id/media", (c) => {
    const found = getPostMedia(db, Id.parse(c.req.param("id")));
    return found ? c.json(found) : c.json({ error: "not_found" }, 404);
  });
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/server && pnpm --filter @no-fomo/server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api.ts apps/server
git commit -m "feat(server): serve media links and store fresh ones from the extension"
```

---

### Task 4: Server: full resync

**Files:**
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/sync/ingest.ts`, `apps/server/src/queries.ts`, `apps/server/src/http/app.ts`, `apps/server/scripts/seed.ts` (only if it no longer typechecks), `packages/core/src/api.ts`
- Create: `apps/server/drizzle/0004_*.sql` (generated)
- Test: `apps/server/test/ingest.test.ts`, `apps/server/test/app.test.ts`

**Interfaces:**
- Consumes: `SyncMode` (Task 2).
- Produces:
  - `startRun(db: Db, requested?: SyncMode, now?: number): { runId: number; mode: SyncMode }`
  - `finishRun(...)` unchanged signature; on a successful full run that walked the whole feed it hides missing posts and sets `last_full_at`.
  - `lastFullAt(db: Db): number | null` (ms)
  - `SyncRunInfo` gains `postsRemoved: number; warning: string | null`; `SyncStatus` gains `lastFullAt: number | null`.
  - `POST /api/sync/runs` accepts `{ mode?: "incremental" | "full" }`.

- [ ] **Step 1: Write failing tests**

In `apps/server/test/ingest.test.ts`, extend imports (`isNull` from drizzle-orm, `lastFullAt` from ingest) and add:
```ts
describe("full resync", () => {
  const ids = (n: number, from = 100) => Array.from({ length: n }, (_, i) => String(from + i));
  function syncAll(pks: string[], mode?: "full") {
    const r = startRun(db, mode);
    ingestSavedPage(db, r.runId, pageOf(pks, false));
    finishRun(db, r.runId, { ok: true });
    return r;
  }
  const visible = () => db.select({ id: posts.id }).from(posts).where(isNull(posts.removedRemotelyAt)).all().map((r) => r.id).sort();
  const runRow = (id: number) => db.select().from(syncRuns).where(eq(syncRuns.id, id)).get()!;

  it("runs in full mode when asked", () => {
    syncAll(ids(3));
    expect(startRun(db).mode).toBe("incremental");
    expect(startRun(db, "full").mode).toBe("full");
  });

  it("hides posts a complete full run did not see and counts them", () => {
    syncAll(ids(10));
    expect(lastFullAt(db)).not.toBeNull(); // the first backfill was a full walk too
    const r = syncAll(ids(9), "full"); // "109" was unsaved on Instagram
    expect(visible()).toEqual(ids(9));
    expect(runRow(r.runId)).toMatchObject({ status: "done", postsRemoved: 1, warning: null });
  });

  it("never hides after an incremental run", () => {
    syncAll(ids(10));
    syncAll(["100"]);
    expect(visible()).toHaveLength(10);
  });

  it("never hides after a full run that stopped early or failed", () => {
    syncAll(ids(10));
    const cut = startRun(db, "full");
    ingestSavedPage(db, cut.runId, pageOf(ids(5), true));
    finishRun(db, cut.runId, { ok: true });
    expect(visible()).toHaveLength(10);
    const failed = startRun(db, "full");
    ingestSavedPage(db, failed.runId, pageOf(ids(5), false));
    finishRun(db, failed.runId, { ok: false, code: "rate_limited", message: "slow down" });
    expect(visible()).toHaveLength(10);
  });

  it("hides nothing and warns when more than 30% and more than 20 posts would go", () => {
    syncAll(ids(100));
    const r = syncAll(ids(69), "full");
    expect(visible()).toHaveLength(100);
    expect(runRow(r.runId)).toMatchObject({ postsRemoved: 0, warning: "Full resync found too many missing posts. Nothing was hidden. Try again later." });
  });

  it("allows exactly 30%", () => {
    syncAll(ids(100));
    syncAll(ids(70), "full");
    expect(visible()).toHaveLength(70);
  });

  it("lets a small library lose up to 20 posts at once", () => {
    syncAll(ids(25));
    syncAll(ids(5), "full");
    expect(visible()).toHaveLength(5);
  });

  it("shows a hidden post again when it comes back", () => {
    syncAll(ids(10));
    syncAll(ids(9), "full");
    syncAll(ids(10), "full");
    expect(visible()).toHaveLength(10);
  });
});
```

In `apps/server/test/app.test.ts` add to `describe("sync + read API")`:
```ts
  it("starts a full run on request and reports removals in the status", async () => {
    await syncFixtures();
    const r = await post("/api/sync/runs", { mode: "full" });
    expect(await r.json()).toMatchObject({ mode: "full" });
    const s = (await (await get("/api/sync/status")).json()) as SyncStatus;
    expect(s.run).toMatchObject({ mode: "full", status: "running", postsRemoved: 0, warning: null });
    expect(typeof s.lastFullAt).toBe("number");
    expect((await post("/api/sync/runs", { mode: "everything" })).status).toBe(400);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server`
Expected: FAIL (`lastFullAt` not exported, no `postsRemoved` column).

- [ ] **Step 3: Schema + migration**

`apps/server/src/db/schema.ts`, in `syncRuns` after `postsNew`:
```ts
  /** Posts a complete full run did not see, hidden as unsaved on Instagram. */
  postsRemoved: integer("posts_removed").notNull().default(0),
  /** Set when a full run skipped hiding posts because too many were missing. */
  warning: text("warning"),
```
Run: `pnpm --filter @no-fomo/server db:generate`
Expected: a new `apps/server/drizzle/0004_<name>.sql` with two `ALTER TABLE sync_runs ADD ...` statements. Read it; it must not touch other tables.

- [ ] **Step 4: Implement ingest**

`apps/server/src/sync/ingest.ts`:
```ts
import { and, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { parseCollectionsPage, parseMediaPage, type ParsedPost, type SyncMode, type SyncResult } from "@no-fomo/core";

const LAST_FULL_AT = "last_full_at";
/** A full resync never hides more than this share of the library at once... */
const MAX_HIDDEN_SHARE = 0.3;
/** ...unless it is only a handful of posts. */
const SMALL_CHANGE = 20;
const TOO_MANY_MISSING = "Full resync found too many missing posts. Nothing was hidden. Try again later.";
```
`startRun`:
```ts
export function startRun(db: Db, requested: SyncMode = "incremental", now = Date.now()): { runId: number; mode: SyncMode } {
  ...
    const mode: SyncMode = requested === "full" || !upToDate ? "full" : "incremental";
```
`finishRun`:
```ts
export function finishRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  db.transaction((tx) => {
    const run = tx.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
    if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
    if (run.status !== "running") return;
    if (!result.ok) {
      tx.update(syncRuns)
        .set({ status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message })
        .where(eq(syncRuns.id, runId))
        .run();
      return;
    }
    let hidden = { count: 0, warning: null as string | null };
    // A full run marks savedComplete only when it reached the end of the feed,
    // so only then does "not seen" mean "no longer saved".
    if (run.mode === "full" && run.savedComplete) {
      hidden = hideMissingPosts(tx, runId, now);
      setSetting(tx, LAST_FULL_AT, String(now));
    }
    tx.update(syncRuns)
      .set({ status: "done", finishedAt: now, postsRemoved: hidden.count, warning: hidden.warning })
      .where(eq(syncRuns.id, runId))
      .run();
  });
}

function hideMissingPosts(q: Q, runId: number, now: number): { count: number; warning: string | null } {
  const visible = and(isNull(posts.removedAt), isNull(posts.removedRemotelyAt));
  const missing = and(visible, lt(posts.lastSeenRunId, runId));
  const total = q.select({ n: count() }).from(posts).where(visible).get()?.n ?? 0;
  const n = q.select({ n: count() }).from(posts).where(missing).get()?.n ?? 0;
  if (n > SMALL_CHANGE && n > total * MAX_HIDDEN_SHARE) return { count: 0, warning: TOO_MANY_MISSING };
  if (n > 0) q.update(posts).set({ removedRemotelyAt: now }).where(missing).run();
  return { count: n, warning: null };
}

export function lastFullAt(db: Db): number | null {
  const v = getSetting(db, LAST_FULL_AT);
  return v ? Number(v) : null;
}
```

- [ ] **Step 5: Status + route**

`packages/core/src/api.ts`: add `postsRemoved: number; warning: string | null;` to `SyncRunInfo` and `lastFullAt: number | null;` to `SyncStatus`.

`apps/server/src/queries.ts` `syncStatus`: add `postsRemoved: run.postsRemoved, warning: run.warning` to `run` and `lastFullAt: lastFullAt(db)` to the result (import from `./sync/ingest`).

`apps/server/src/http/app.ts`:
```ts
const StartBody = z.object({ mode: z.enum(["incremental", "full"]).optional() });
...
  app.post("/api/sync/runs", async (c) => {
    const { mode } = StartBody.parse(await c.req.json().catch(() => ({})));
    return c.json(startRun(db, mode), 201);
  });
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run apps/server && pnpm --filter @no-fomo/server typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/api.ts apps/server
git commit -m "feat(server): full resync hides posts unsaved on Instagram, with a safety limit"
```

---

### Task 5: Extension: media refresh, sync mode, shared gate

**Files:**
- Create: `apps/extension/src/media-fetch.ts`
- Modify: `apps/extension/src/external.ts`, `apps/extension/src/relay-sink.ts`, `apps/extension/entrypoints/instagram.content.ts`, `apps/extension/entrypoints/background.ts` (types only)
- Test: `apps/extension/test/external.test.ts`, `apps/extension/test/media-fetch.test.ts`

**Interfaces:**
- Consumes: `createRequestGate`, `gateClient`, `IgClient.mediaInfo`, `SyncMode`, `PostMedia` (Tasks 1-3), `POST /api/sync/media/:id` (Task 3), `POST /api/sync/runs {mode}` (Task 4).
- Produces (web app relies on these):
  - External message `{ type: "sync:start", mode?: SyncMode }` → `{ ok: true } | { ok: false, error }`
  - External message `{ type: "media:refresh", id: string }` → `{ ok: true, media: PostMedia } | { ok: false, error: "login_required" | "rate_limited" | "not_found" | "server_error" | "bad_message" | "untrusted_sender" | "instagram_tab_failed" | string }`
  - `type TabMessage = { type: "sync:run"; serverUrl: string; mode: SyncMode } | { type: "media:fetch"; serverUrl: string; id: string }`
  - `fetchMedia(opts: { ig: IgClient; id: string; serverUrl: string; send: (m: RelayMessage) => Promise<RelayResponse> }): Promise<{ ok: true; media: PostMedia } | { ok: false; error: string }>`

- [ ] **Step 1: Write failing tests**

In `apps/extension/test/external.test.ts`, change the expected tab message in "starts sync in an existing Instagram tab" to `{ type: "sync:run", serverUrl: "http://localhost:4747", mode: "incremental" }`, and add:
```ts
  it("passes a full resync request through", async () => {
    const d = deps();
    await handleExternalMessage({ type: "sync:start", mode: "full" }, "http://localhost:4747/", d);
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "sync:run", serverUrl: "http://localhost:4747", mode: "full" });
    expect(await handleExternalMessage({ type: "sync:start", mode: "all" }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
  });

  it("asks the Instagram tab for fresh media links", async () => {
    const media = { id: "123", kind: "video", parts: [], expiresAt: null };
    const d = deps({ sendToTab: vi.fn(async () => ({ ok: true, media })) });
    const r = await handleExternalMessage({ type: "media:refresh", id: "123" }, "http://localhost:4747/", d);
    expect(r).toEqual({ ok: true, media });
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "media:fetch", serverUrl: "http://localhost:4747", id: "123" });
  });

  it("refuses media refresh with a bad id or from other pages", async () => {
    const d = deps();
    expect(await handleExternalMessage({ type: "media:refresh", id: "../x" }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "media:refresh", id: 5 }, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "media:refresh", id: "123" }, "https://evil.example/", d)).toEqual({ ok: false, error: "untrusted_sender" });
    expect(d.sendToTab).not.toHaveBeenCalled();
  });
```

`apps/extension/test/media-fetch.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo/core";
import { fetchMedia } from "../src/media-fetch";

const ig = (mediaInfo: IgClient["mediaInfo"]): IgClient => ({
  savedPage: async () => { throw new Error("unused"); },
  collectionsPage: async () => { throw new Error("unused"); },
  mediaInfo,
});

describe("fetchMedia", () => {
  it("relays Instagram's answer to the server and returns fresh links", async () => {
    const media = { id: "123", kind: "image", parts: [], expiresAt: 1 };
    const send = vi.fn(async () => ({ ok: true as const, data: media }));
    const r = await fetchMedia({ ig: ig(async () => ({ items: [] })), id: "123", serverUrl: "http://localhost:4747", send });
    expect(r).toEqual({ ok: true, media });
    expect(send).toHaveBeenCalledWith({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/media/123", body: { payload: { items: [] } } });
  });

  it("returns Instagram error codes and does not call the server", async () => {
    const send = vi.fn();
    const r = await fetchMedia({ ig: ig(async () => { throw new IgError("login_required", "x"); }), id: "123", serverUrl: "http://localhost:4747", send });
    expect(r).toEqual({ ok: false, error: "login_required" });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports server problems", async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: "Post 123 is not in your library" }));
    const r = await fetchMedia({ ig: ig(async () => ({})), id: "123", serverUrl: "http://localhost:4747", send });
    expect(r).toEqual({ ok: false, error: "server_error" });
  });

  it("refuses ids that are not plain digits", async () => {
    const mediaInfo = vi.fn();
    const r = await fetchMedia({ ig: ig(mediaInfo), id: "1/../2", serverUrl: "http://localhost:4747", send: vi.fn() });
    expect(r).toEqual({ ok: false, error: "bad_message" });
    expect(mediaInfo).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/extension`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/extension/src/media-fetch.ts`:
```ts
import { IgError, type IgClient, type PostMedia } from "@no-fomo/core";
import type { RelayMessage, RelayResponse } from "./relay";

export type MediaFetchResult = { ok: true; media: PostMedia } | { ok: false; error: string };

/** One Instagram request for a post's fresh links, stored by the local server. */
export async function fetchMedia(opts: {
  ig: IgClient;
  id: string;
  serverUrl: string;
  send: (m: RelayMessage) => Promise<RelayResponse>;
}): Promise<MediaFetchResult> {
  if (!/^\d{1,30}$/.test(opts.id)) return { ok: false, error: "bad_message" };
  let payload: unknown;
  try {
    payload = await opts.ig.mediaInfo(opts.id);
  } catch (e) {
    return { ok: false, error: e instanceof IgError ? e.code : "internal" };
  }
  const r = await opts.send({ type: "relay", serverUrl: opts.serverUrl, path: `/api/sync/media/${opts.id}`, body: { payload } });
  return r.ok ? { ok: true, media: r.data as PostMedia } : { ok: false, error: "server_error" };
}
```

`apps/extension/src/external.ts`:
```ts
import type { PostMedia, SyncMode } from "@no-fomo/core";
import { isAppOrigin } from "./origins";

export type ExtResponse = { ok: true; version?: string; media?: PostMedia } | { ok: false; error: string };
export type TabMessage =
  | { type: "sync:run"; serverUrl: string; mode: SyncMode }
  | { type: "media:fetch"; serverUrl: string; id: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: TabMessage): Promise<unknown>;
}

export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const m = msg as { type?: unknown; mode?: unknown; id?: unknown };
  if (m.type === "ping") return { ok: true, version: deps.version };
  if (m.type !== "sync:start" && m.type !== "media:refresh") return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  if (!isAppOrigin(senderUrl)) return { ok: false, error: "untrusted_sender" };
  const serverUrl = new URL(senderUrl).origin;

  let tabMsg: TabMessage;
  if (m.type === "sync:start") {
    if (m.mode !== undefined && m.mode !== "incremental" && m.mode !== "full") return { ok: false, error: "bad_message" };
    tabMsg = { type: "sync:run", serverUrl, mode: m.mode ?? "incremental" };
  } else {
    if (typeof m.id !== "string" || !/^\d{1,30}$/.test(m.id)) return { ok: false, error: "bad_message" };
    tabMsg = { type: "media:fetch", serverUrl, id: m.id };
  }
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, tabMsg)) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
```

`apps/extension/src/relay-sink.ts`: `startRun: (mode) => post("/api/sync/runs", { mode }),`

`apps/extension/entrypoints/instagram.content.ts`:
```ts
import { createIgClient, createRequestGate, gateClient, runSync, type SyncMode } from "@no-fomo/core";
import { createRelaySink } from "../src/relay-sink";
import { fetchMedia } from "../src/media-fetch";
import type { RelayMessage, RelayResponse } from "../src/relay";

type TabMsg = { type?: string; serverUrl?: string; mode?: SyncMode; id?: string };

function readCsrf(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    // Sync and media refresh share one gate, so Instagram never sees two requests close together.
    const ig = gateClient(createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf }), createRequestGate({ sleep }));
    const send = (m: RelayMessage) => browser.runtime.sendMessage(m) as Promise<RelayResponse>;
    let running = false;

    browser.runtime.onMessage.addListener((msg: TabMsg, _sender, sendResponse) => {
      if (typeof msg?.serverUrl !== "string") return;
      if (msg.type === "media:fetch" && typeof msg.id === "string") {
        void fetchMedia({ ig, id: msg.id, serverUrl: msg.serverUrl, send }).then(sendResponse);
        return true;
      }
      if (msg.type !== "sync:run") return;
      if (running) {
        sendResponse({ ok: false, error: "already_running" });
        return;
      }
      running = true;
      sendResponse({ ok: true });
      const sink = createRelaySink(msg.serverUrl, send);
      // The gate spaces requests, so the sync loop adds no pause of its own.
      void runSync({ ig, sink, sleep, delayMs: () => 0, mode: msg.mode === "full" ? "full" : "incremental" })
        .then((r) => console.info("[no-fomo] sync finished", r))
        .finally(() => { running = false; });
    });
  },
});
```

`apps/extension/entrypoints/background.ts`: no logic change. `sendToTab` already accepts `unknown`; it type-checks against `ExternalDeps.sendToTab(tabId, msg: TabMessage)`.

- [ ] **Step 4: Run tests and build**

Run: `pnpm vitest run apps/extension && pnpm typecheck && pnpm ext:build`
Expected: PASS, build writes `apps/extension/.output/chrome-mv3`.

- [ ] **Step 5: Commit**

```bash
git add apps/extension
git commit -m "feat(extension): media refresh, full resync mode, one request gate for Instagram"
```

---

### Task 6: Web: data layer and pure player logic

**Files:**
- Create: `apps/web/app/lib/media.ts`, `apps/web/app/lib/player-prefs.ts`, `apps/web/app/lib/ab-loop.ts`, `apps/web/app/lib/use-post-media.ts`
- Modify: `apps/web/app/lib/api.ts`, `apps/web/app/lib/extension.ts`
- Test: `apps/web/test/media.test.ts`, `apps/web/test/player-prefs.test.ts`, `apps/web/test/ab-loop.test.ts`

**Interfaces:**
- Consumes: `PostMedia`, `SyncMode` (core), external messages (Task 5).
- Produces:
  - `api.media(id: string): Promise<PostMedia>`
  - `startExtensionSync(extId: string, mode?: SyncMode): Promise<ExtResponse | null>`; `refreshExtensionMedia(extId: string, postId: string): Promise<ExtResponse | null>`; `ExtResponse` includes `media?: PostMedia`
  - `needsRefresh(m: PostMedia, nowSec: number): boolean`, `REFRESH_DELAY_MS = 400`
  - `type MediaErrorCode = "no_extension" | "old_extension" | "login_required" | "rate_limited" | "not_found" | "load_failed"`; `mediaErrorCode(reply: ExtResponse | null): MediaErrorCode`; `mediaErrorText(code: MediaErrorCode): string`
  - `type PrefStore = Pick<Storage, "getItem" | "setItem">`; `browserStore(): PrefStore | null`; `loadPosition(s, id): number | null`; `savePosition(s, id, t, now?)`; `resumeAt(saved: number | null, duration: number): number | null`; `loadVolume(s): { volume: number; muted: boolean }`; `saveVolume(s, v)`; `MAX_POSITIONS = 500`
  - `type AbLoop = { a: number | null; b: number | null }`; `AB_OFF`; `pressAb(s, t): AbLoop`; `abJump(s, t): number | null`; `abLabel(s): string`
  - `usePostMedia(postId: string, extensionId: string | undefined): { media: PostMedia | null; loading: boolean; error: MediaErrorCode | null; retry(): void; onLoadError(): void }`

- [ ] **Step 1: Write failing tests**

`apps/web/test/media.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { PostMedia } from "@no-fomo/core";
import { mediaErrorCode, mediaErrorText, needsRefresh, REFRESH_DELAY_MS } from "../app/lib/media";

const media = (over: Partial<PostMedia> = {}): PostMedia => ({
  id: "1", kind: "video", parts: [{ index: 0, kind: "video", imageUrl: null, videoUrl: "https://x/v.mp4", width: 1, height: 1 }], expiresAt: 10_000, ...over,
});

describe("needsRefresh", () => {
  it("asks for fresh links when there are none or they expire within 10 minutes", () => {
    expect(needsRefresh(media({ parts: [] }), 0)).toBe(true);
    expect(needsRefresh(media(), 10_000 - 601)).toBe(false);
    expect(needsRefresh(media(), 10_000 - 599)).toBe(true);
    expect(needsRefresh(media(), 20_000)).toBe(true);
    expect(needsRefresh(media({ expiresAt: null }), 20_000)).toBe(false);
  });

  it("waits a moment before asking, so fast browsing sends nothing", () => {
    expect(REFRESH_DELAY_MS).toBeGreaterThanOrEqual(300);
  });
});

describe("media errors", () => {
  it("maps extension replies to error codes", () => {
    expect(mediaErrorCode(null)).toBe("no_extension");
    expect(mediaErrorCode({ ok: false, error: "unknown_type" })).toBe("old_extension");
    expect(mediaErrorCode({ ok: false, error: "login_required" })).toBe("login_required");
    expect(mediaErrorCode({ ok: false, error: "rate_limited" })).toBe("rate_limited");
    expect(mediaErrorCode({ ok: false, error: "not_found" })).toBe("not_found");
    expect(mediaErrorCode({ ok: false, error: "server_error" })).toBe("load_failed");
    expect(mediaErrorCode({ ok: true })).toBe("load_failed");
  });

  it("has plain text without dashes for every code", () => {
    for (const code of ["no_extension", "old_extension", "login_required", "rate_limited", "not_found", "load_failed"] as const) {
      expect(mediaErrorText(code)).toMatch(/^[A-Z]/);
      expect(mediaErrorText(code)).not.toMatch(/[–—]/);
    }
  });
});
```

`apps/web/test/player-prefs.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { loadPosition, loadVolume, MAX_POSITIONS, resumeAt, savePosition, saveVolume, type PrefStore } from "../app/lib/player-prefs";

function memory(): PrefStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const broken: PrefStore = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

describe("player prefs", () => {
  it("remembers positions per post", () => {
    const s = memory();
    savePosition(s, "1", 42.5);
    expect(loadPosition(s, "1")).toBe(42.5);
    expect(loadPosition(s, "2")).toBeNull();
  });

  it("keeps only the newest 500 positions", () => {
    const s = memory();
    for (let i = 0; i < MAX_POSITIONS + 10; i++) savePosition(s, String(i), 10, i);
    expect(loadPosition(s, "0")).toBeNull();
    expect(loadPosition(s, "9")).toBeNull();
    expect(loadPosition(s, "10")).toBe(10);
    expect(Object.keys(JSON.parse(s.data.get("nf:positions")!))).toHaveLength(MAX_POSITIONS);
  });

  it("resumes only from the middle of a video", () => {
    expect(resumeAt(null, 60)).toBeNull();
    expect(resumeAt(4, 60)).toBeNull();
    expect(resumeAt(30, 60)).toBe(30);
    expect(resumeAt(56, 60)).toBeNull();
    expect(resumeAt(30, Number.NaN)).toBeNull();
  });

  it("remembers volume and mute", () => {
    const s = memory();
    expect(loadVolume(s)).toEqual({ volume: 1, muted: false });
    saveVolume(s, { volume: 0.4, muted: true });
    expect(loadVolume(s)).toEqual({ volume: 0.4, muted: true });
  });

  it("never throws on blocked storage or garbage", () => {
    expect(() => savePosition(broken, "1", 5)).not.toThrow();
    expect(loadPosition(broken, "1")).toBeNull();
    expect(loadVolume(broken)).toEqual({ volume: 1, muted: false });
    expect(() => saveVolume(broken, { volume: 1, muted: false })).not.toThrow();
    const s = memory();
    s.data.set("nf:positions", "[1,2");
    s.data.set("nf:volume", "null");
    expect(loadPosition(s, "1")).toBeNull();
    expect(loadVolume(s)).toEqual({ volume: 1, muted: false });
    s.data.set("nf:positions", "[1,2]");
    savePosition(s, "1", 7);
    expect(loadPosition(s, "1")).toBe(7);
    s.data.set("nf:volume", JSON.stringify({ volume: 9, muted: "yes" }));
    expect(loadVolume(s)).toEqual({ volume: 1, muted: false });
  });
});
```

`apps/web/test/ab-loop.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { AB_OFF, abJump, abLabel, pressAb } from "../app/lib/ab-loop";

describe("A-B loop", () => {
  it("sets A, then B, then clears", () => {
    const a = pressAb(AB_OFF, 3);
    expect(a).toEqual({ a: 3, b: null });
    const ab = pressAb(a, 8);
    expect(ab).toEqual({ a: 3, b: 8 });
    expect(pressAb(ab, 9)).toEqual(AB_OFF);
  });

  it("swaps when B is before A and ignores a loop under half a second", () => {
    expect(pressAb({ a: 8, b: null }, 3)).toEqual({ a: 3, b: 8 });
    expect(pressAb({ a: 8, b: null }, 8.2)).toEqual(AB_OFF);
  });

  it("jumps back to A once playback reaches B", () => {
    expect(abJump({ a: 3, b: 8 }, 7.9)).toBeNull();
    expect(abJump({ a: 3, b: 8 }, 8)).toBe(3);
    expect(abJump({ a: 3, b: null }, 100)).toBeNull();
    expect(abJump(AB_OFF, 100)).toBeNull();
  });

  it("names the next press", () => {
    expect(abLabel(AB_OFF)).toBe("Set loop start (A)");
    expect(abLabel({ a: 1, b: null })).toBe("Set loop end (B)");
    expect(abLabel({ a: 1, b: 2 })).toBe("Clear A to B loop");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the pure modules**

`apps/web/app/lib/media.ts`:
```ts
import type { PostMedia } from "@no-fomo/core";
import type { ExtResponse } from "./extension";

/** Links that expire within 10 minutes are renewed before playing. */
const REFRESH_MARGIN_SEC = 10 * 60;
/** Wait this long on a post before asking Instagram, so flipping fast through posts sends no requests. */
export const REFRESH_DELAY_MS = 400;

export function needsRefresh(m: PostMedia, nowSec: number): boolean {
  return m.parts.length === 0 || (m.expiresAt !== null && m.expiresAt - nowSec < REFRESH_MARGIN_SEC);
}

export type MediaErrorCode = "no_extension" | "old_extension" | "login_required" | "rate_limited" | "not_found" | "load_failed";

export function mediaErrorCode(reply: ExtResponse | null): MediaErrorCode {
  if (!reply) return "no_extension";
  if (reply.ok) return "load_failed";
  switch (reply.error) {
    case "unknown_type": return "old_extension";
    case "login_required":
    case "rate_limited":
    case "not_found":
      return reply.error;
    default:
      return "load_failed";
  }
}

export function mediaErrorText(code: MediaErrorCode): string {
  switch (code) {
    case "no_extension": return "Install the no-fomo extension to play posts.";
    case "old_extension": return "Your no-fomo extension is out of date. Reload it on the chrome://extensions page, then try again.";
    case "login_required": return "Log in to Instagram in this browser, then try again.";
    case "rate_limited": return "Instagram asked to slow down. Try again in a few minutes.";
    case "not_found": return "This post was deleted on Instagram.";
    case "load_failed": return "Could not load this post. Try again, or open it on Instagram.";
  }
}
```

`apps/web/app/lib/player-prefs.ts`:
```ts
export type PrefStore = Pick<Storage, "getItem" | "setItem">;

const POSITIONS_KEY = "nf:positions";
const VOLUME_KEY = "nf:volume";
export const MAX_POSITIONS = 500;
/** Do not resume from the first or last few seconds. */
const EDGE_SEC = 5;

type Positions = Record<string, { t: number; at: number }>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Storage can be missing, blocked or full. Playback must never fail because of it. */
function read(store: PrefStore | null, key: string): unknown {
  try {
    const raw = store?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(store: PrefStore | null, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Not worth interrupting the video for.
  }
}

export function browserStore(): PrefStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function positions(store: PrefStore | null): Positions {
  const v = read(store, POSITIONS_KEY);
  return isRecord(v) ? (v as Positions) : {};
}

export function loadPosition(store: PrefStore | null, id: string): number | null {
  const t = positions(store)[id]?.t;
  return typeof t === "number" && Number.isFinite(t) ? t : null;
}

export function savePosition(store: PrefStore | null, id: string, t: number, now = Date.now()) {
  if (!Number.isFinite(t)) return;
  const all = positions(store);
  all[id] = { t, at: now };
  const ids = Object.keys(all);
  if (ids.length > MAX_POSITIONS) {
    ids
      .sort((x, y) => (all[x]?.at ?? 0) - (all[y]?.at ?? 0))
      .slice(0, ids.length - MAX_POSITIONS)
      .forEach((k) => delete all[k]);
  }
  write(store, POSITIONS_KEY, all);
}

export function resumeAt(saved: number | null, duration: number): number | null {
  if (saved === null || !Number.isFinite(duration) || duration <= 0) return null;
  return saved > EDGE_SEC && saved < duration - EDGE_SEC ? saved : null;
}

export function loadVolume(store: PrefStore | null): { volume: number; muted: boolean } {
  const v = read(store, VOLUME_KEY);
  const r = isRecord(v) ? v : {};
  const volume = typeof r.volume === "number" && r.volume >= 0 && r.volume <= 1 ? r.volume : 1;
  return { volume, muted: r.muted === true };
}

export function saveVolume(store: PrefStore | null, v: { volume: number; muted: boolean }) {
  write(store, VOLUME_KEY, v);
}
```

`apps/web/app/lib/ab-loop.ts`:
```ts
export type AbLoop = { a: number | null; b: number | null };
export const AB_OFF: AbLoop = { a: null, b: null };
/** A loop shorter than this is a double press by mistake. */
const MIN_LOOP_SEC = 0.5;

/** One button: the 1st press sets A, the 2nd sets B, the 3rd clears. */
export function pressAb(s: AbLoop, t: number): AbLoop {
  if (s.a === null) return { a: t, b: null };
  if (s.b === null) {
    if (Math.abs(t - s.a) < MIN_LOOP_SEC) return AB_OFF;
    return t > s.a ? { a: s.a, b: t } : { a: t, b: s.a };
  }
  return AB_OFF;
}

/** Where to jump once playback reaches B, or null to keep playing. */
export function abJump(s: AbLoop, t: number): number | null {
  return s.a !== null && s.b !== null && t >= s.b ? s.a : null;
}

export function abLabel(s: AbLoop): string {
  if (s.a === null) return "Set loop start (A)";
  if (s.b === null) return "Set loop end (B)";
  return "Clear A to B loop";
}
```

- [ ] **Step 4: API, extension client, hook**

`apps/web/app/lib/api.ts`: add `PostMedia` to the type import and `media: (id: string) => get<PostMedia>(`/api/posts/${id}/media`),` to `api`.

`apps/web/app/lib/extension.ts`:
```ts
import type { PostMedia, SyncMode } from "@no-fomo/core";
...
export type ExtResponse = { ok: true; version?: string; media?: PostMedia } | { ok: false; error: string };
...
export const startExtensionSync = (id: string, mode: SyncMode = "incremental") => send(id, { type: "sync:start", mode }, 45_000);
/** Opening a hidden Instagram tab can take a while, hence the long timeout. */
export const refreshExtensionMedia = (extId: string, postId: string) => send(extId, { type: "media:refresh", id: postId }, 45_000);
```

`apps/web/app/lib/use-post-media.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostMedia } from "@no-fomo/core";
import { api } from "./api";
import { refreshExtensionMedia } from "./extension";
import { mediaErrorCode, needsRefresh, REFRESH_DELAY_MS, type MediaErrorCode } from "./media";

const nowSec = () => Date.now() / 1000;

/**
 * A post's media links, renewed through the extension when missing or about to expire.
 * Mount once per post (the viewer keys it by post id), so state never leaks between posts.
 */
export function usePostMedia(postId: string, extensionId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["media", postId], queryFn: () => api.media(postId), staleTime: 60_000 });
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MediaErrorCode | null>(null);
  const triedRefresh = useRef(false);

  const refresh = useCallback(async () => {
    triedRefresh.current = true;
    if (!extensionId) return setError("no_extension");
    setRefreshing(true);
    setError(null);
    const reply = await refreshExtensionMedia(extensionId, postId);
    setRefreshing(false);
    if (reply?.ok && reply.media) {
      qc.setQueryData<PostMedia>(["media", postId], reply.media);
      if (needsRefresh(reply.media, nowSec())) setError("load_failed");
    } else {
      setError(mediaErrorCode(reply));
    }
  }, [extensionId, postId, qc]);

  const data = query.data;
  const stale = !!data && needsRefresh(data, nowSec());
  useEffect(() => {
    if (!stale || triedRefresh.current) return;
    const timer = setTimeout(() => void refresh(), REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stale, refresh]);

  /** A link failed to load in the browser: renew it once, then give up. */
  const onLoadError = useCallback(() => {
    if (triedRefresh.current) setError("load_failed");
    else void refresh();
  }, [refresh]);

  const retry = useCallback(() => {
    triedRefresh.current = false;
    setError(null);
    if (query.isError) void query.refetch();
    else void refresh();
  }, [query, refresh]);

  const finalError: MediaErrorCode | null = query.isError ? "load_failed" : error;
  return {
    media: stale || finalError ? null : (data ?? null),
    loading: !finalError && (query.isPending || refreshing || stale),
    error: finalError,
    retry,
    onLoadError,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run apps/web && pnpm --filter @no-fomo/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): media links hook, player preferences and A-B loop logic"
```

---

### Task 7: Web: video player

**Files:**
- Create: `apps/web/app/components/player/player.tsx`, `apps/web/app/components/player/player-controls.tsx`
- Modify: `apps/web/package.json` (dependency)

**Interfaces:**
- Consumes: `player-prefs`, `ab-loop` (Task 6), `Icon`, `buttonClass` (M1).
- Produces:
  - `Player(props: { src: string; poster: string; postId: string; arrowSeek: "plain" | "shift"; onLoadError: () => void }): JSX.Element`. Fills its parent (`size-full`). Remount with `key={src}` when the link changes.

No unit tests: the logic it uses is tested in Task 6. It is checked in the browser in Task 10.

- [ ] **Step 1: Install**

Run: `pnpm --filter @no-fomo/web add @videojs/react@10.0.1`
Expected: added without peer dependency errors (the engine adapters it lists as peers are optional; we use the plain `<video>` only). If pnpm installs or warns about the optional peers, leave them uninstalled and confirm `pnpm --filter @no-fomo/web build` still passes in Step 4.

- [ ] **Step 2: Player shell**

`apps/web/app/components/player/player.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { BufferingIndicator, Container, Gesture, Hotkey, useMedia } from "@videojs/react";
import { Video, VideoPlayer } from "@videojs/react/video";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { browserStore, loadPosition, loadVolume, resumeAt, savePosition, saveVolume } from "../../lib/player-prefs";
import { Icon } from "../ui/icon";
import { PlayerControls } from "./player-controls";

/** How often the playing position is written to storage. */
const SAVE_EVERY_MS = 2000;

export function Player({
  src,
  poster,
  postId,
  arrowSeek,
  onLoadError,
}: {
  src: string;
  poster: string;
  postId: string;
  /** "plain": arrow keys seek. "shift": Shift+arrows seek, plain arrows belong to the carousel. */
  arrowSeek: "plain" | "shift";
  onLoadError: () => void;
}) {
  const [loop, setLoop] = useState(true);
  const back = arrowSeek === "plain" ? "ArrowLeft" : "Shift+ArrowLeft";
  const forward = arrowSeek === "plain" ? "ArrowRight" : "Shift+ArrowRight";

  return (
    <VideoPlayer>
      <Container className="relative flex size-full items-center justify-center bg-black">
        <Video src={src} poster={poster} autoPlay playsInline loop={loop} preload="auto" className="max-h-full max-w-full object-contain" />
        <MediaMemory postId={postId} onLoadError={onLoadError} />

        {/* One player owns the page while the viewer is open, so keys work without focusing the video first. */}
        <Hotkey keys="Space" action="togglePaused" target="document" />
        <Hotkey keys="k" action="togglePaused" target="document" />
        <Hotkey keys="m" action="toggleMuted" target="document" />
        <Hotkey keys="f" action="toggleFullscreen" target="document" />
        <Hotkey keys={back} action="seekStep" value={-5} target="document" />
        <Hotkey keys={forward} action="seekStep" value={5} target="document" />
        <Gesture type="tap" action="togglePaused" pointer="mouse" region="center" />
        <Gesture type="tap" action="toggleControls" pointer="touch" />
        <Gesture type="doubletap" action="seekStep" value={-5} region="left" />
        <Gesture type="doubletap" action="seekStep" value={5} region="right" />

        <BufferingIndicator
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          render={(props, state) => (
            <div {...props}>{state.visible && <Icon icon={Loading03Icon} size={32} className="text-white/80 motion-safe:animate-spin" />}</div>
          )}
        />
        <PlayerControls loop={loop} onLoopChange={setLoop} />
      </Container>
    </VideoPlayer>
  );
}

/** Restores volume and position, remembers them, and reports a link that fails to load. */
function MediaMemory({ postId, onLoadError }: { postId: string; onLoadError: () => void }) {
  const media = useMedia();
  const onError = useRef(onLoadError);
  onError.current = onLoadError;

  useEffect(() => {
    if (!(media instanceof HTMLVideoElement)) return;
    const el = media;
    const store = browserStore();
    const vol = loadVolume(store);
    el.volume = vol.volume;
    el.muted = vol.muted;

    let lastSave = 0;
    const onMeta = () => {
      const t = resumeAt(loadPosition(store, postId), el.duration);
      if (t !== null) el.currentTime = t;
    };
    const onTime = () => {
      if (Date.now() - lastSave < SAVE_EVERY_MS) return;
      lastSave = Date.now();
      savePosition(store, postId, el.currentTime);
    };
    const onPause = () => savePosition(store, postId, el.currentTime);
    const onVolume = () => saveVolume(store, { volume: el.volume, muted: el.muted });
    const onErr = () => onError.current();

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    el.addEventListener("volumechange", onVolume);
    el.addEventListener("error", onErr);
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
    return () => {
      if (el.currentTime > 0) savePosition(store, postId, el.currentTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("volumechange", onVolume);
      el.removeEventListener("error", onErr);
    };
  }, [media, postId]);

  return null;
}
```

- [ ] **Step 3: Controls**

`apps/web/app/components/player/player-controls.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { Controls, FullscreenButton, MuteButton, PlayButton, Time, TimeSlider, VolumeSlider, useMedia } from "@videojs/react";
import { usePlayer } from "@videojs/react/video";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowShrink02Icon, FullScreenIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, RepeatIcon, RepeatOffIcon, VolumeHighIcon, VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import { AB_OFF, abJump, abLabel, pressAb, type AbLoop } from "../../lib/ab-loop";
import { Icon } from "../ui/icon";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const FRAME_SEC = 1 / 30;

const ctl =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-control px-2 text-white/90 transition-colors duration-200 ease-out-soft " +
  "hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "aria-pressed:text-accent data-[disabled]:opacity-40";

export function PlayerControls({ loop, onLoopChange }: { loop: boolean; onLoopChange: (loop: boolean) => void }) {
  const media = useMedia();
  const el = media instanceof HTMLVideoElement ? media : null;
  const portal = useRef<HTMLDivElement>(null);
  const [ab, setAb] = useState<AbLoop>(AB_OFF);

  // Check every frame once both A and B are set, so the loop point is exact.
  useEffect(() => {
    if (!el || ab.a === null || ab.b === null) return;
    let handle = 0;
    const tick = () => {
      const to = abJump(ab, el.currentTime);
      if (to !== null) el.currentTime = to;
      handle = el.requestVideoFrameCallback(tick);
    };
    handle = el.requestVideoFrameCallback(tick);
    return () => el.cancelVideoFrameCallback(handle);
  }, [el, ab]);

  // "," and "." step one frame while paused, like most desktop players.
  useEffect(() => {
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== "," && e.key !== ".")) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      stepFrame(el, e.key === "." ? 1 : -1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [el]);

  return (
    <Controls.Root>
      <Controls.Backdrop className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity duration-300 data-[visible]:opacity-100" />
      <Controls.Content className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 px-3 pb-2 opacity-0 transition-opacity duration-200 data-[visible]:opacity-100 has-[:focus-visible]:opacity-100">
        <Controls.Group aria-label="Seek" className="pointer-events-auto">
          <TimeSlider.Root className="group/seek relative flex h-6 cursor-pointer touch-none items-center">
            <TimeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-200 group-hover/seek:h-1.5">
              <TimeSlider.Buffer className="absolute inset-y-0 left-0 w-[var(--media-slider-buffer)] bg-white/30" />
              <TimeSlider.Fill className="absolute inset-y-0 left-0 w-[var(--media-slider-fill)] bg-accent" />
            </TimeSlider.Track>
            <TimeSlider.Thumb className="absolute left-[var(--media-slider-fill)] size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity duration-200 group-hover/seek:opacity-100 focus-visible:opacity-100" />
          </TimeSlider.Root>
        </Controls.Group>

        <Controls.Group aria-label="Playback controls" className="pointer-events-auto flex items-center gap-0.5 text-white">
          <PlayButton
            className={ctl}
            render={(props, s) => <button {...props}><Icon icon={s.paused ? PlayIcon : PauseIcon} size={20} /></button>}
          />
          <MuteButton
            className={ctl}
            render={(props, s) => <button {...props}><Icon icon={s.muted ? VolumeMute01Icon : VolumeHighIcon} size={20} /></button>}
          />
          <VolumeSlider.Root className="group/vol relative hidden h-6 w-20 cursor-pointer touch-none items-center md:flex">
            <VolumeSlider.Track className="relative h-1 w-full overflow-hidden rounded-full bg-white/25">
              <VolumeSlider.Fill className="absolute inset-y-0 left-0 w-[var(--media-slider-fill)] bg-white" />
            </VolumeSlider.Track>
            <VolumeSlider.Thumb className="absolute left-[var(--media-slider-fill)] size-3 -translate-x-1/2 rounded-full bg-white opacity-0 group-hover/vol:opacity-100 focus-visible:opacity-100" />
          </VolumeSlider.Root>
          <Time.Group className="ml-2 font-mono text-[12px] tabular-nums text-white/85">
            <Time.Value type="current" />
            <Time.Separator className="px-1 text-white/50" />
            <Time.Value type="duration" />
          </Time.Group>

          <div className="flex-1" />

          <button type="button" className={ctl} aria-label="Previous frame" title="Previous frame (,)" onClick={() => el && stepFrame(el, -1)}>
            <Icon icon={PreviousIcon} size={18} />
          </button>
          <button type="button" className={ctl} aria-label="Next frame" title="Next frame (.)" onClick={() => el && stepFrame(el, 1)}>
            <Icon icon={NextIcon} size={18} />
          </button>
          <button
            type="button"
            className={`${ctl} font-mono text-[12px]`}
            aria-label={abLabel(ab)}
            title={abLabel(ab)}
            aria-pressed={ab.a !== null}
            onClick={() => el && setAb((s) => pressAb(s, el.currentTime))}
          >
            {ab.a === null ? "A-B" : ab.b === null ? "A" : "A B"}
          </button>
          <button
            type="button"
            className={ctl}
            aria-label={loop ? "Turn loop off" : "Turn loop on"}
            title={loop ? "Loop is on" : "Loop is off"}
            aria-pressed={loop}
            onClick={() => onLoopChange(!loop)}
          >
            <Icon icon={loop ? RepeatIcon : RepeatOffIcon} size={18} />
          </button>
          <SpeedMenu container={portal} />
          <FullscreenButton
            className={ctl}
            render={(props, s) => <button {...props}><Icon icon={s.fullscreen ? ArrowShrink02Icon : FullScreenIcon} size={18} /></button>}
          />
        </Controls.Group>
        {/* Menus open inside the player, so they stay visible in fullscreen. */}
        <div ref={portal} className="pointer-events-auto" />
      </Controls.Content>
    </Controls.Root>
  );
}

function SpeedMenu({ container }: { container: React.RefObject<HTMLDivElement | null> }) {
  const store = usePlayer();
  const rate = usePlayer((s) => s.playbackRate) ?? 1;
  return (
    <Menu.Root>
      <Menu.Trigger className={`${ctl} font-mono text-[12px] tabular-nums`} aria-label={`Speed ${rate}x`} title="Playback speed">
        {rate}x
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Positioner side="top" align="end" sideOffset={8} className="z-10">
          <Menu.Popup className="min-w-24 origin-[var(--transform-origin)] rounded-control border border-white/10 bg-black/85 p-1 text-white shadow-pop backdrop-blur transition-[transform,opacity] duration-200 ease-out-soft data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Menu.RadioGroup value={rate} onValueChange={(v) => store.setPlaybackRate(Number(v))}>
              {RATES.map((r) => (
                <Menu.RadioItem
                  key={r}
                  value={r}
                  className="flex cursor-default items-center justify-between gap-3 rounded-[6px] px-2.5 py-1.5 font-mono text-[13px] tabular-nums outline-none data-[highlighted]:bg-white/10 data-[checked]:text-accent"
                >
                  {r}x
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function stepFrame(el: HTMLVideoElement, dir: 1 | -1) {
  el.pause();
  const end = Number.isFinite(el.duration) ? el.duration : el.currentTime;
  el.currentTime = Math.min(Math.max(el.currentTime + dir * FRAME_SEC, 0), end);
}
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm --filter @no-fomo/web typecheck && pnpm --filter @no-fomo/web build`
Expected: PASS. If a Video.js prop name differs (for example `render` state fields, `Time.Separator`, `VolumeSlider` parts, `BufferingIndicator` state), look it up in `node_modules/@videojs/react/docs/reference/components/<name>.md` and adjust the call, keeping the behavior.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): video player on Video.js 10 with speed, loop, A-B loop, frame step and resume"
```

---

### Task 8: Web: viewer replaces the side panel

**Files:**
- Create: `apps/web/app/components/viewer/viewer.tsx`, `apps/web/app/components/viewer/media-stage.tsx`, `apps/web/app/components/viewer/carousel.tsx`, `apps/web/app/components/viewer/post-details.tsx`
- Modify: `apps/web/app/routes/library.tsx`
- Delete: `apps/web/app/components/post-sheet.tsx`

**Interfaces:**
- Consumes: `usePostMedia`, `mediaErrorText` (Task 6), `Player` (Task 7), `SetupSteps`, `Button`, `buttonClass`, `Icon`, format helpers (M1), `api.config`.
- Produces: `Viewer(props: { post: PostListItem | null; onClose(): void; onPrev: (() => void) | null; onNext: (() => void) | null; onShowAuthor(id: string): void })`. Same props as the old `PostSheet`, so `library.tsx` only swaps the component.

- [ ] **Step 1: Post details (moved from the side panel)**

`apps/web/app/components/viewer/post-details.tsx`:
```tsx
import { Dialog } from "@base-ui/react/dialog";
import type { PostListItem } from "@no-fomo/core";
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, Location01Icon, MusicNote01Icon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { formatCount, formatDate, formatDuration } from "../../lib/format";
import { Button, buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";

export function PostDetails({
  post: p,
  onPrev,
  onNext,
  onShowAuthor,
}: {
  post: PostListItem;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onShowAuthor: (id: string) => void;
}) {
  const seekHint = p.kind === "carousel" ? "Left and Right move between items. Shift with Left or Right seeks a video." : p.kind === "video" ? "Left and Right seek 5 seconds. Space plays and pauses." : null;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 px-5 py-4">
        <img src={`/media/avatars/${p.author.id}`} alt="" className="size-9 rounded-full bg-surface-2 object-cover" />
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate text-[15px] font-semibold">@{p.author.username}</Dialog.Title>
          {p.author.fullName && <p className="truncate text-[13px] text-muted">{p.author.fullName}</p>}
        </div>
        <div className="flex items-center">
          <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous post" title="Previous post (Up arrow)" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={ArrowUp01Icon} size={18} />
          </button>
          <button type="button" onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next post" title="Next post (Down arrow)" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={ArrowDown01Icon} size={18} />
          </button>
        </div>
        <Dialog.Close className={buttonClass("ghost", "", "icon")} aria-label="Close" title="Close (Esc)">
          <Icon icon={Cancel01Icon} size={20} />
        </Dialog.Close>
      </div>

      <div className="flex flex-wrap gap-2 px-5">
        <a href={p.permalink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
          <Icon icon={SquareArrowUpRightIcon} />
          Open on Instagram
        </a>
        <Button onClick={() => onShowAuthor(p.author.id)}>More from @{p.author.username}</Button>
      </div>

      {p.caption && <p className="whitespace-pre-wrap px-5 pt-5 text-[15px] leading-relaxed">{p.caption}</p>}

      <dl className="mx-5 mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-[13px]">
        <Detail label="Posted" value={formatDate(p.takenAt)} />
        {p.durationSec !== null && <Detail label="Length" value={formatDuration(p.durationSec)} mono />}
        {p.viewCount !== null && <Detail label="Views" value={formatCount(p.viewCount)} mono />}
        {p.likeCount !== null && <Detail label="Likes" value={formatCount(p.likeCount)} mono />}
      </dl>

      <div className="grid gap-2 px-5 py-5 text-[13px] text-muted">
        {p.musicTitle && (
          <p className="flex items-center gap-2"><Icon icon={MusicNote01Icon} size={14} />{p.musicTitle}{p.musicArtist ? `, ${p.musicArtist}` : ""}</p>
        )}
        {p.locationName && <p className="flex items-center gap-2"><Icon icon={Location01Icon} size={14} />{p.locationName}</p>}
        {p.accessibilityCaption && <p>Image description: {p.accessibilityCaption}</p>}
      </div>

      <p className="mt-auto hidden border-t border-line px-5 py-3 text-[12px] text-muted md:block">
        <Kbd>Up</Kbd> and <Kbd>Down</Kbd> move between posts. {seekHint} <Kbd>Esc</Kbd> closes.
      </p>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono tabular-nums" : ""}>{value}</dd>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-[5px] border border-line px-1 font-mono text-[11px] text-text">{children}</kbd>;
}
```

- [ ] **Step 2: Carousel**

`apps/web/app/components/viewer/carousel.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import type { MediaPart } from "@no-fomo/core";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Player } from "../player/player";
import { Icon } from "../ui/icon";

const SWIPE_PX = 50;
const arrow =
  "absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur " +
  "transition-opacity duration-200 hover:bg-black/70 disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:outline-accent";

export function Carousel({
  parts,
  postId,
  alt,
  onLoadError,
}: {
  parts: MediaPart[];
  postId: string;
  alt: string;
  onLoadError: () => void;
}) {
  const [index, setIndex] = useState(0);
  const last = parts.length - 1;
  const go = (i: number) => setIndex(Math.min(Math.max(i, 0), last));
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;

  // Plain Left and Right move between items. Shift+arrows are left for seeking a video item.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true], [role=slider]")) return;
      e.preventDefault();
      goRef.current(indexRef.current + (e.key === "ArrowRight" ? 1 : -1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const startX = useRef<number | null>(null);
  const current = parts[index]!;

  return (
    <div
      className="relative flex size-full items-center justify-center"
      onPointerDown={(e) => { if (e.pointerType === "touch") startX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      {parts.map((part, i) => {
        // Only the current item and its neighbours load.
        if (Math.abs(i - index) > 1 || part.kind === "video") return null;
        return (
          <img
            key={part.index}
            src={part.imageUrl ?? undefined}
            alt={i === index ? alt : ""}
            onError={i === index ? onLoadError : undefined}
            className={i === index ? "max-h-full max-w-full object-contain" : "hidden"}
          />
        );
      })}
      {current.kind === "video" && current.videoUrl && (
        <Player key={current.videoUrl} src={current.videoUrl} poster={current.imageUrl ?? ""} postId={`${postId}:${index}`} arrowSeek="shift" onLoadError={onLoadError} />
      )}

      <button type="button" className={`${arrow} left-3`} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous item">
        <Icon icon={ArrowLeft01Icon} size={20} />
      </button>
      <button type="button" className={`${arrow} right-3`} onClick={() => go(index + 1)} disabled={index === last} aria-label="Next item">
        <Icon icon={ArrowRight01Icon} size={20} />
      </button>

      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2">
        <p className="rounded-full bg-black/50 px-2.5 py-0.5 font-mono text-[12px] tabular-nums text-white backdrop-blur" aria-live="polite">
          {index + 1} of {parts.length}
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center gap-1.5">
        {parts.map((part, i) => (
          <button
            key={part.index}
            type="button"
            onClick={() => go(i)}
            aria-label={`Item ${i + 1}`}
            aria-current={i === index}
            className={`size-1.5 rounded-full transition-colors duration-200 ${i === index ? "bg-white" : "bg-white/40 hover:bg-white/70"}`}
          />
        ))}
      </div>
    </div>
  );
}
```
Note: in a carousel, the video item's own controls sit at the bottom; the dots sit above them only when the video is not the current item. If the dots overlap the player's seek bar in the browser check, move the dots to `top-10` under the "2 of 7" label.

- [ ] **Step 3: Media stage**

`apps/web/app/components/viewer/media-stage.tsx`:
```tsx
import type { PostListItem } from "@no-fomo/core";
import { Alert02Icon, Loading03Icon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { mediaErrorText } from "../../lib/media";
import { usePostMedia } from "../../lib/use-post-media";
import { Player } from "../player/player";
import { SetupSteps } from "../setup-steps";
import { Button, buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";
import { Carousel } from "./carousel";

/** Mount with key={post.id}: all state here belongs to one post. */
export function MediaStage({ post, extensionId }: { post: PostListItem; extensionId: string | undefined }) {
  const { media, loading, error, retry, onLoadError } = usePostMedia(post.id, extensionId);
  const alt = post.accessibilityCaption ?? `Post by @${post.author.username}`;

  if (error) {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <div className="max-w-sm text-center text-white">
          <Icon icon={Alert02Icon} size={28} className="mx-auto text-white/70" />
          <p className="mt-3 text-[15px]" role="alert">{mediaErrorText(error)}</p>
          {error === "no_extension" && <div className="mt-3 text-left text-white/80"><SetupSteps /></div>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {error !== "not_found" && error !== "no_extension" && <Button onClick={retry}>Try again</Button>}
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
              <Icon icon={SquareArrowUpRightIcon} />
              Open on Instagram
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !media) {
    return (
      <div className="relative flex size-full items-center justify-center">
        <img src={post.thumbUrl} alt={alt} className="max-h-full max-w-full object-contain opacity-60" />
        <Icon icon={Loading03Icon} size={32} className="absolute text-white/80 motion-safe:animate-spin" />
      </div>
    );
  }

  if (post.kind === "carousel" && media.parts.length > 1) {
    return <Carousel parts={media.parts} postId={post.id} alt={alt} onLoadError={onLoadError} />;
  }

  const part = media.parts[0]!;
  if (part.kind === "video" && part.videoUrl) {
    return <Player key={part.videoUrl} src={part.videoUrl} poster={post.thumbUrl} postId={post.id} arrowSeek="plain" onLoadError={onLoadError} />;
  }
  return (
    <div className="flex size-full items-center justify-center">
      <img src={part.imageUrl ?? post.thumbUrl} alt={alt} onError={onLoadError} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
```
Check `SetupSteps` reads well on the dark stage. If its text uses `text-muted` that is too dark on black, wrap it in a light panel (`rounded-control bg-bg p-4 text-text`) instead of changing `SetupSteps` itself.

- [ ] **Step 4: Viewer**

`apps/web/app/components/viewer/viewer.tsx`:
```tsx
import { useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { useQuery } from "@tanstack/react-query";
import type { PostListItem } from "@no-fomo/core";
import { api } from "../../lib/api";
import { MediaStage } from "./media-stage";
import { PostDetails } from "./post-details";

export function Viewer({
  post,
  onClose,
  onPrev,
  onNext,
  onShowAuthor,
}: {
  post: PostListItem | null;
  onClose: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onShowAuthor: (id: string) => void;
}) {
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const stage = useRef<HTMLDivElement>(null);
  // Keep showing the last post while the close animation runs.
  const last = useRef<PostListItem | null>(null);
  if (post) last.current = post;
  const p = post ?? last.current;

  return (
    <Dialog.Root open={!!post} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/80 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          initialFocus={stage}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
            if (e.key === "ArrowUp" && onPrev) { e.preventDefault(); onPrev(); }
            if (e.key === "ArrowDown" && onNext) { e.preventDefault(); onNext(); }
          }}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg transition-opacity duration-200 ease-out-soft data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 md:grid md:grid-cols-[minmax(0,1fr)_380px] md:overflow-hidden"
        >
          {p && (
            <>
              <div ref={stage} tabIndex={-1} className="relative h-[70dvh] shrink-0 bg-black outline-none md:h-dvh">
                <MediaStage key={p.id} post={p} extensionId={config.data?.extensionId} />
              </div>
              <div className="border-line md:h-dvh md:overflow-y-auto md:border-l">
                <PostDetails post={p} onPrev={onPrev} onNext={onNext} onShowAuthor={onShowAuthor} />
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 5: Use it in the library**

`apps/web/app/routes/library.tsx`: replace `import { PostSheet } from "../components/post-sheet";` with `import { Viewer } from "../components/viewer/viewer";` and `<PostSheet` with `<Viewer` (same props). Delete `apps/web/app/components/post-sheet.tsx`.

- [ ] **Step 6: Typecheck, build, look**

Run: `pnpm --filter @no-fomo/web typecheck && pnpm --filter @no-fomo/web build`
Expected: PASS.
Run `pnpm dev`, open `http://localhost:5173` with real data, open a video, an image and a carousel. Fix anything broken before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): full-window viewer with player, photos, carousels and link refresh"
```

---

### Task 9: Web: full resync in the sync control

**Files:**
- Modify: `apps/web/app/components/sync-control.tsx`, `apps/web/app/lib/format.ts`
- Test: `apps/web/test/format.test.ts`

**Interfaces:**
- Consumes: `startExtensionSync(extId, mode)` (Task 6), `SyncStatus.lastFullAt`, `SyncRunInfo.postsRemoved/warning` (Task 4).
- Produces: `fullCheckDue(lastFullAt: number | null, lastSuccessAt: number | null, now?: number): boolean`, `runResultNote(run: { status: string; postsNew: number; postsRemoved: number } | null): string` in `format.ts`.

- [ ] **Step 1: Write failing tests**

In `apps/web/test/format.test.ts` add (import `fullCheckDue`, `runResultNote` from `../app/lib/format`):
```ts
describe("full resync hints", () => {
  const day = 86_400_000;
  const now = 100 * day;
  it("suggests a full check after 30 days, or when there never was one", () => {
    expect(fullCheckDue(null, null, now)).toBe(false); // never synced: the first sync is full anyway
    expect(fullCheckDue(null, now - day, now)).toBe(true);
    expect(fullCheckDue(now - 29 * day, now - day, now)).toBe(false);
    expect(fullCheckDue(now - 31 * day, now - day, now)).toBe(true);
  });

  it("describes what the last run found", () => {
    expect(runResultNote({ status: "done", postsNew: 0, postsRemoved: 0 })).toBe("");
    expect(runResultNote({ status: "done", postsNew: 1, postsRemoved: 0 })).toBe(", 1 new post");
    expect(runResultNote({ status: "done", postsNew: 2, postsRemoved: 3 })).toBe(", 2 new posts, 3 removed on Instagram");
    expect(runResultNote({ status: "done", postsNew: 0, postsRemoved: 1 })).toBe(", 1 removed on Instagram");
    expect(runResultNote({ status: "error", postsNew: 5, postsRemoved: 5 })).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web`
Expected: FAIL.

- [ ] **Step 3: Implement helpers**

`apps/web/app/lib/format.ts`, add:
```ts
const FULL_CHECK_EVERY_MS = 30 * 86_400_000;

/** A full resync is due when the library was synced but not fully checked in 30 days. */
export function fullCheckDue(lastFullAt: number | null, lastSuccessAt: number | null, now = Date.now()): boolean {
  if (lastSuccessAt === null) return false;
  return lastFullAt === null || now - lastFullAt > FULL_CHECK_EVERY_MS;
}

export function runResultNote(run: { status: string; postsNew: number; postsRemoved: number } | null): string {
  if (!run || run.status !== "done") return "";
  const parts: string[] = [];
  if (run.postsNew > 0) parts.push(run.postsNew === 1 ? "1 new post" : `${run.postsNew.toLocaleString("en")} new posts`);
  if (run.postsRemoved > 0) parts.push(`${run.postsRemoved.toLocaleString("en")} removed on Instagram`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}
```

- [ ] **Step 4: Update the sync control**

`apps/web/app/components/sync-control.tsx`:
- import `Menu` from `@base-ui/react/menu`, `ArrowDown01Icon` from Hugeicons, `fullCheckDue`, `runResultNote` from `../lib/format`; remove the local `newPostsNote` (replaced by `runResultNote`).
- `start` takes a mode:
```tsx
  async function start(mode: SyncMode = "incremental") {
    if (!extensionId) return;
    setStartError(null);
    setStarting(true);
    const reply = await startExtensionSync(extensionId, mode);
    ...unchanged...
  }
```
- the note:
```tsx
  const warning = !running && run?.status === "done" ? run.warning : null;
  const lastError = !running && run?.status === "error" ? run.errorMessage : null;
  const due = !running && fullCheckDue(status.data?.lastFullAt ?? null, status.data?.lastSuccessAt ?? null);
  const note = running
    ? `${run.mode === "full" ? "Checking all saved posts" : "Syncing"}, ${run.postsSeen} posts so far`
    : startError ?? lastError ?? warning ??
      (status.data?.lastSuccessAt ? `Synced ${formatAgo(status.data.lastSuccessAt)}${runResultNote(run)}` : "Not synced yet");
  const errorTone = !!(startError || lastError || warning);
```
  (import `type SyncMode` from `@no-fomo/core`.)
- render, replacing the single Sync button:
```tsx
    <div className="flex min-w-0 items-center gap-3">
      <p className={`truncate text-[13px] ${errorTone ? "text-danger" : "text-muted"}`} role="status" aria-live="polite" title={note}>
        {note}
      </p>
      {due && !errorTone && (
        <button type="button" onClick={() => start("full")} className="shrink-0 text-[13px] text-text underline underline-offset-2 hover:text-accent">
          Full check suggested
        </button>
      )}
      <div className="flex">
        <Button variant="primary" className="rounded-r-none" onClick={() => start()} disabled={running || starting || !ext.data?.ok}>
          <Icon icon={RefreshIcon} className={running || starting ? "motion-safe:animate-spin" : ""} />
          Sync
        </Button>
        <Menu.Root>
          <Menu.Trigger
            className={buttonClass("primary", "rounded-l-none border-l border-accent-ink/20 px-2")}
            disabled={running || starting || !ext.data?.ok}
            aria-label="More sync options"
          >
            <Icon icon={ArrowDown01Icon} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="end" className="z-30">
              <Menu.Popup className="w-[min(300px,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-control border border-line bg-bg p-1 shadow-pop transition-[transform,opacity] duration-200 ease-out-soft data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
                <Menu.Item onClick={() => start("full")} className="flex cursor-default flex-col gap-0.5 rounded-[6px] px-3 py-2 outline-none data-[highlighted]:bg-surface">
                  <span className="text-[14px] font-medium">Full resync</span>
                  <span className="text-[12px] text-muted">Checks every saved post and hides the ones you unsaved on Instagram. Takes about 2 minutes per 1,000 posts.</span>
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
```
Keep the "Set up sync" popover branch as it is.

- [ ] **Step 5: Run tests and build**

Run: `pnpm test && pnpm typecheck && pnpm --filter @no-fomo/web build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): full resync option, monthly hint and removal count"
```

---

### Task 10: End-to-end check, README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Browser checks (agent-browser)**

Build and start: `pnpm ext:build && pnpm start`. Load the rebuilt extension (`apps/extension/.output/chrome-mv3`) in the owner's Chrome. With agent-browser, at 1440x900 and at 390x844:
1. Open a reel: it plays with sound or shows the play button; speed menu shows 0.5x to 3x and works in fullscreen; Left and Right seek 5s; `,` and `.` step frames; A-B loop repeats a part; loop toggle works.
2. Close and reopen the same reel: it resumes near the old position.
3. Open a single image: full-size image, not the small thumbnail.
4. Open a carousel: arrows, dots, "2 of 7", Left and Right keys, swipe (touch emulation at 390px).
5. Up and Down move between posts. Hold Down for 3 seconds: the extension console shows at most one or two `media/.../info` requests (Review Focus 2).
6. In the database, set one post's links to an expired `oe` (`UPDATE posts SET video_url = replace(video_url, 'oe=', 'oe=0') ...` on a copy is fine, or wait for real expiry), open it: it refreshes and plays.
7. Disable the extension, open an old image post: the "Install the no-fomo extension" message shows, with "Open on Instagram".
8. Zero em-dashes or en-dashes in any new UI text: `grep -rn $'[–—]' apps/web/app` returns nothing.
Take screenshots of each state; fix what is wrong.

- [ ] **Step 2: Manual check with the real account (the owner)**

- Play 5 videos whose links expired.
- Open 1 carousel with a video inside.
- Unsave 1 post on instagram.com, run "Full resync", confirm the post disappears and the note says "1 removed on Instagram".

- [ ] **Step 3: README**

In `README.md`, add a short section after "Install the extension":
```markdown
## Watching posts

Click a post to open it. Videos play straight from Instagram. Nothing is downloaded.

- Up and Down: previous or next post. Esc: close.
- Video: Space play or pause, Left and Right seek 5 seconds, `,` and `.` step one frame, M mute, F fullscreen.
- Carousel: Left and Right move between items, Shift with Left or Right seeks a video item.

Instagram links expire after a few days. When that happens, the extension asks Instagram for a fresh link (one request, same speed limits as sync).

## Full resync

Sync only adds new saves. To find posts you unsaved directly on Instagram, open the menu next to Sync and pick "Full resync". It checks every saved post (about 2 minutes per 1,000 posts) and hides the ones that are gone. If more than 30% of your posts seem gone, nothing is hidden, because that usually means an Instagram glitch.
```

- [ ] **Step 4: Final suite and commit**

Run: `pnpm test && pnpm typecheck && pnpm --filter @no-fomo/web build && pnpm ext:build`
Expected: PASS.
```bash
git add README.md
git commit -m "docs: viewer, keys and full resync"
```
