# Profiles and Reports Tabs Implementation Plan

> **Superseded** by `docs/superpowers/plans/2026-10-06-home-tabs-instagram-safety.md` (three tabs, Instagram safety, account posts read from Instagram's own page). Kept as history.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Profiles tab (add any Instagram account, browse/filter/analyze its posts, see and search the people you follow, search all of Instagram) and a Reports tab (every report in one list with its own filters), with one stored record per post so a report shows wherever the post appears.

**Architecture:** `posts` keeps only post content; saved-feed state moves to `saved_posts`; new `profiles`, `profile_posts`, `following` and `load_runs` tables. The extension gets three new jobs (profile search, profile load, following update) that reuse the request gate and post pages to the server under `/api/sync/…`, like saved sync. The web app becomes three routes under one layout with tabs in the top bar.

**Tech Stack:** TypeScript, pnpm monorepo, Hono + Drizzle (better-sqlite3) + zod on the server, WXT extension, React Router v8 SPA + TanStack Query + Base UI + Tailwind v4 + Hugeicons on the web, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-profiles-reports-design.md`

## Global Constraints

- Instagram requests: one at a time through the existing request gate, 2–3 s pause between requests. Never add a second path to Instagram.
- Profile load: newest ~100 posts per run, **at most 9 pages** (`count=12`). **Load older posts** loads the next ~100. **Refresh** loads only posts newer than the newest stored one.
- Following update: at most **50 pages** (`count=100`, about 5,000 accounts).
- All-Instagram suggestions: only after **2 characters** and a **400 ms** pause.
- Videos are never stored. Only metadata and thumbnails/avatars.
- Every Instagram call lives in `packages/core/src/ig`. Extension → server calls go through the relay, whose paths must start with `/api/sync/`.
- Routes that only the app page may use (`/api/profiles/:id/remove`) reject the extension origin, like settings.
- The database upgrade must never rebuild or drop `posts` (the migrator runs inside a transaction, so `PRAGMA foreign_keys=OFF` is ignored and `DROP TABLE posts` would cascade-delete reports, parts and collection links). Use `ALTER TABLE … DROP COLUMN`.
- UI copy: plain, short English. The owner checks results by eye at `http://localhost:4747` after `pnpm start`, with the extension rebuilt by `pnpm ext:build`.
- Every task ends with `pnpm test` and `pnpm typecheck` green. Test files are typechecked, so fakes must implement full interfaces.

## Review Focus

1. **Upgrade of a real library:** existing posts, saved order, unsaved marks, collection links, parts and reports all survive the migration. → migration test in Task 4.
2. **Same post from two sources:** a post loaded from a profile and later found by saved sync (and the other way round) stays one row, gets correct saved order, keeps its profile link, and its report shows in both lists. → Task 5 and Task 6 tests.
3. **Pinned posts on Refresh:** old pinned posts at the top of a profile must not stop a refresh before the new posts are read. → `pinned` parse (Task 2) and refresh test (Task 5).
4. **Old extension build:** the owner has not rebuilt the extension yet; new messages answer `unknown_type`. The app must say "update the extension", not a raw code. → `loadErrorText` test (Task 9).
5. **Removing a profile:** posts also in another added profile, saved posts, and posts with a finished report stay; posts with only a failed report are deleted; thumbnails are deleted only for deleted posts. → Task 5 tests.

---

## File map

**packages/core**
- Create `src/ig/json.ts`: small JSON readers shared by parsers (moved out of `parse.ts`).
- Create `src/ig/users.ts`: `parseProfileInfo`, `parseUserSearch`, `parseFollowingPage`.
- Modify `src/ig/parse.ts`: use `json.ts`, export `parseAuthor`, add `pinned` to parsed posts.
- Modify `src/ig/types.ts`: `ParsedProfile`, `UserSuggestion`, `ParsedUserPage`, `pinned`.
- Modify `src/ig/client.ts`, `src/ig/gate.ts`: four new calls.
- Create `src/sync/run-loads.ts`: `runProfileLoad`, `runFollowingUpdate`.
- Modify `src/api.ts`: list item fields, cursors as strings, profile/following/report types.
- Modify `src/analyze/report.ts`: `summaryPreview`.
- Modify `src/index.ts`: exports.
- Create fixtures `fixtures/profile-info.json`, `fixtures/user-feed.json`, `fixtures/user-search.json`, `fixtures/following-page.json`.

**apps/server**
- Modify `src/db/schema.ts`; create `drizzle/0008_profiles.sql` (+ snapshot, journal).
- Modify `src/sync/ingest.ts`: shared post upsert, saved state in `saved_posts`.
- Create `src/sync/loads.ts`: profile runs, following runs, finish, remove profile.
- Modify `src/queries.ts`: scopes, reports, profiles, following.
- Modify `src/media/store.ts`: `removeThumbs`.
- Modify `src/http/app.ts`, `src/main.ts`.

**apps/extension**
- Modify `src/external.ts`, `src/relay-sink.ts`; create `src/tab-jobs.ts`; modify `entrypoints/instagram.content.ts`.

**apps/web**
- Modify `app/routes.ts`; create `app/routes/shell.tsx`, `saved.tsx`, `profiles.tsx`, `profile.tsx`, `reports.tsx`; delete `app/routes/library.tsx`.
- Create `app/lib/use-post-list.ts`, `app/lib/profile-input.ts`.
- Modify `app/lib/api.ts`, `app/lib/extension.ts`, `app/lib/filters.ts`.
- Create `app/components/nav-tabs.tsx`, `avatar.tsx`, `source-switch.tsx`, `profiles/profile-search.tsx`, `profiles/profile-card.tsx`, `profiles/following-list.tsx`, `profiles/use-profile-jobs.ts`, `reports/report-row.tsx`.
- Modify `app/components/top-bar.tsx`, `search-box.tsx`, `filter-bar.tsx`, `post-grid.tsx`, `viewer/viewer.tsx`, `viewer/post-details.tsx`.

---

### Task 1: Capture real Instagram answers (owner step)

The endpoint shapes in the spec come from public sources. Check them before writing parsers.

**Files:**
- Create: `packages/core/fixtures/profile-info.json`, `user-feed.json`, `user-search.json`, `following-page.json`

- [ ] **Step 1: Ask the owner to run the probe**

Tell the owner, in plain words: open instagram.com in Chrome (logged in), press Cmd+Option+J, type `allow pasting` and Enter if Chrome asks, paste the code below, press Enter. A file `no-fomo-probe.json` downloads. Send its path.

```js
(async () => {
  const cookie = (n) => document.cookie.match(new RegExp(`(?:^|;\\s*)${n}=([^;]+)`))?.[1];
  const h = { "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest", "X-CSRFToken": cookie("csrftoken") ?? "" };
  const get = async (p) => { const r = await fetch(p, { headers: h, credentials: "include" }); return { path: p, status: r.status, body: await r.json().catch(() => null) }; };
  const wait = () => new Promise((r) => setTimeout(r, 2500));
  const me = cookie("ds_user_id");
  const out = { viewerIdCookie: me ? "present" : "missing" };
  out.profile = await get("/api/v1/users/web_profile_info/?username=nasa"); await wait();
  const id = out.profile.body?.data?.user?.id;
  out.feed = await get(`/api/v1/feed/user/${id}/?count=12`); await wait();
  out.searchBlended = await get("/api/v1/web/search/topsearch/?context=blended&query=nasa"); await wait();
  out.searchUser = await get("/api/v1/web/search/topsearch/?context=user&query=nasa"); await wait();
  out.following = await get(`/api/v1/friendships/${me}/following/?count=12`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  a.download = "no-fomo-probe.json"; a.click();
})();
```

- [ ] **Step 2: Check each answer**

Read the file. For each part confirm `status` is 200 and note:
- `profile.body.data.user`: `id`, `username`, `full_name`, `profile_pic_url`, `is_private`, `followed_by_viewer`, `edge_owner_to_timeline_media.count`.
- `feed.body`: `items` (media objects, read by `parseMedia`), `more_available`, `next_max_id`; name of the pinned marker on pinned items (expected `timeline_pinned_user_ids`, a non-empty array).
- `searchBlended` / `searchUser`: which one returns `users: [{ user: {...} }]`. Use that `context` in Task 2.
- `following.body`: `users: [...]`, `next_max_id` (string or number), `big_list`.
- `viewerIdCookie` is `present`.

If any call is not 200 or the shape is very different, stop and tell the owner which part does not work before going on.

- [ ] **Step 3: Save scrubbed fixtures**

Save each `body` to its fixture file. Keep structure and field names. In `following-page.json` and in any part that contains the owner's own data, replace usernames, full names, ids and URLs with fake ones (`friend_one`, `"Friend One"`, ids `"9000000001"`…, URLs `https://scontent.cdninstagram.com/fake-N.jpg`). Keep at most 3 users in following and search, and at most 3 items in the feed (keep one pinned item if there is one, and keep a video item). `nasa` public data may stay. Keep `more_available: true` and a `next_max_id` in `user-feed.json` and a `next_max_id` in `following-page.json`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/fixtures/profile-info.json packages/core/fixtures/user-feed.json packages/core/fixtures/user-search.json packages/core/fixtures/following-page.json
git commit -m "test: add Instagram profile, feed, search and following fixtures"
```

Tasks 4–7 do not need these fixtures and may start while waiting for the owner.

---

### Task 2: Core: parse profiles, users and pins; new client calls

**Files:**
- Create: `packages/core/src/ig/json.ts`, `packages/core/src/ig/users.ts`, `packages/core/test/users.test.ts`
- Modify: `packages/core/src/ig/parse.ts`, `packages/core/src/ig/types.ts`, `packages/core/src/ig/client.ts`, `packages/core/src/ig/gate.ts`, `packages/core/src/index.ts`
- Modify (fakes): `packages/core/test/run-sync.test.ts`, `packages/core/test/gate.test.ts` (if it builds an `IgClient`), `apps/extension/test/media-fetch.test.ts`
- Test: `packages/core/test/client.test.ts`, `packages/core/test/parse.test.ts`

**Interfaces:**
- Produces:
  - `parseAuthor(u: Record<string, unknown>): ParsedAuthor | null` (now exported from `ig/parse.ts`)
  - `ParsedPost.pinned: boolean`
  - `interface ParsedProfile extends ParsedAuthor { postCount: number | null; isPrivate: boolean; followedByViewer: boolean }`
  - `interface UserSuggestion extends ParsedAuthor { isPrivate: boolean; isVerified: boolean }`
  - `interface ParsedUserPage { items: ParsedAuthor[]; nextCursor: string | null; moreAvailable: boolean }`
  - `parseProfileInfo(raw: unknown): ParsedProfile | null`
  - `parseUserSearch(raw: unknown): UserSuggestion[]`
  - `parseFollowingPage(raw: unknown): ParsedUserPage`
  - `IgClient` gains `profileInfo(username: string)`, `userFeed(userId: string, cursor: string | null)`, `searchUsers(query: string)`, `followingPage(viewerId: string, cursor: string | null)`, all `Promise<unknown>`.

- [ ] **Step 1: Move JSON helpers**

Create `packages/core/src/ig/json.ts`:

```ts
export type Json = Record<string, unknown>;
export const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
export const obj = (v: unknown): Json => (isObj(v) ? v : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
```

In `parse.ts`, delete the local `Json`, `isObj`, `obj`, `arr`, `str`, `num` definitions, add `import { arr, isObj, num, obj, str, type Json } from "./json";`, and change `function parseAuthor` to `export function parseAuthor`. Run `pnpm test` — all existing tests still pass.

- [ ] **Step 2: Write failing tests**

Create `packages/core/test/users.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import profileInfo from "../fixtures/profile-info.json";
import userFeed from "../fixtures/user-feed.json";
import userSearch from "../fixtures/user-search.json";
import followingPage from "../fixtures/following-page.json";
import { parseMediaPage } from "../src/ig/parse";
import { parseFollowingPage, parseProfileInfo, parseUserSearch } from "../src/ig/users";

describe("parseProfileInfo", () => {
  it("reads id, names, avatar, post count and privacy", () => {
    const raw = { data: { user: {
      id: "528817151", username: "nasa", full_name: "NASA", profile_pic_url: "https://scontent.cdninstagram.com/a.jpg",
      is_private: false, followed_by_viewer: true, edge_owner_to_timeline_media: { count: 4321 },
    } }, status: "ok" };
    expect(parseProfileInfo(raw)).toEqual({
      id: "528817151", username: "nasa", fullName: "NASA", avatarUrl: "https://scontent.cdninstagram.com/a.jpg",
      postCount: 4321, isPrivate: false, followedByViewer: true,
    });
  });
  it("returns null without a user", () => {
    expect(parseProfileInfo({ data: { user: null }, status: "ok" })).toBeNull();
    expect(parseProfileInfo(null)).toBeNull();
  });
  it("reads the real answer", () => {
    expect(parseProfileInfo(profileInfo)).toMatchObject({ id: expect.stringMatching(/^\d+$/), username: expect.any(String) });
  });
});

describe("user feed", () => {
  it("reads plain media items and marks pinned posts", () => {
    const page = parseMediaPage(userFeed);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.skipped).toBe(0);
    expect(page.moreAvailable).toBe(true);
    const m = { pk: "1", code: "C1", media_type: 1, taken_at: 1, user: { pk: "9", username: "a" } };
    expect(parseMediaPage({ items: [{ ...m, timeline_pinned_user_ids: ["9"] }, { ...m, pk: "2" }] }).items.map((p) => p.pinned)).toEqual([true, false]);
  });
});

describe("parseUserSearch", () => {
  it("reads users with flags and skips broken entries", () => {
    const raw = { users: [
      { position: 0, user: { pk: "1", username: "one", full_name: "One", profile_pic_url: "u", is_private: true, is_verified: true } },
      { position: 1, user: { username: "no_id" } },
    ], places: [], hashtags: [] };
    expect(parseUserSearch(raw)).toEqual([
      { id: "1", username: "one", fullName: "One", avatarUrl: "u", isPrivate: true, isVerified: true },
    ]);
  });
  it("reads the real answer", () => {
    expect(parseUserSearch(userSearch).length).toBeGreaterThan(0);
  });
});

describe("parseFollowingPage", () => {
  it("reads users and the next cursor, as string or number", () => {
    expect(parseFollowingPage({ users: [{ pk: 5, username: "five" }], next_max_id: 100 })).toEqual({
      items: [{ id: "5", username: "five", fullName: null, avatarUrl: null }], nextCursor: "100", moreAvailable: true,
    });
    expect(parseFollowingPage({ users: [] })).toEqual({ items: [], nextCursor: null, moreAvailable: false });
  });
  it("reads the real answer", () => {
    const p = parseFollowingPage(followingPage);
    expect(p.items.length).toBeGreaterThan(0);
    expect(p.moreAvailable).toBe(true);
  });
});
```

Add to `packages/core/test/client.test.ts` (inside `describe("createIgClient")`):

```ts
  it("calls the profile, user feed, search and following endpoints", async () => {
    const f = fakeFetch(json({ status: "ok" }), json({ status: "ok" }), json({ status: "ok" }), json({ status: "ok" }));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => null });
    await ig.profileInfo("nasa");
    await ig.userFeed("528817151", "CUR");
    await ig.searchUsers("na sa");
    await ig.followingPage("42", null);
    expect(f.calls.map((c) => c.url)).toEqual([
      "https://www.instagram.com/api/v1/users/web_profile_info/?username=nasa",
      "https://www.instagram.com/api/v1/feed/user/528817151/?count=12&max_id=CUR",
      "https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=na+sa",
      "https://www.instagram.com/api/v1/friendships/42/following/?count=100",
    ]);
  });

  it("treats a missing profile as not_found and refuses non-numeric ids", async () => {
    const f = fakeFetch(json({ message: "User not found", status: "fail" }, 404));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => null });
    expect(await codeOf(ig.profileInfo("ghost"))).toBe("not_found");
    expect(await codeOf(ig.userFeed("../x", null))).toBe("bad_response");
    expect(await codeOf(ig.followingPage("x", null))).toBe("bad_response");
  });
```

(Use the `context` value confirmed in Task 1 in both the client and this test.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run packages/core`
Expected: FAIL — `../src/ig/users` not found, `profileInfo` is not a function.

- [ ] **Step 4: Implement types, parsers and client calls**

`types.ts` — add to `ParsedPost` (after `collectionIds`):

```ts
  /** Pinned to the top of its author's profile. Only the profile feed sets this. */
  pinned: boolean;
```

and append:

```ts
export interface ParsedProfile extends ParsedAuthor {
  postCount: number | null;
  isPrivate: boolean;
  /** False for a private account the owner does not follow: its posts cannot be read. */
  followedByViewer: boolean;
}

export interface UserSuggestion extends ParsedAuthor {
  isPrivate: boolean;
  isVerified: boolean;
}

export interface ParsedUserPage {
  items: ParsedAuthor[];
  nextCursor: string | null;
  moreAvailable: boolean;
}
```

`parse.ts` — in `parseMedia`'s returned object add after `collectionIds`:

```ts
    pinned: arr(m.timeline_pinned_user_ids).length > 0,
```

(Use the pinned field name confirmed in Task 1.)

Create `packages/core/src/ig/users.ts`:

```ts
import { arr, obj, str, num } from "./json";
import { parseAuthor } from "./parse";
import type { ParsedAuthor, ParsedProfile, ParsedUserPage, UserSuggestion } from "./types";

export function parseProfileInfo(raw: unknown): ParsedProfile | null {
  const u = obj(obj(obj(raw).data).user);
  const a = parseAuthor(u);
  if (!a) return null;
  return {
    ...a,
    postCount: num(obj(u.edge_owner_to_timeline_media).count) ?? num(u.media_count),
    isPrivate: u.is_private === true,
    followedByViewer: u.followed_by_viewer === true,
  };
}

/** At most 20 accounts, in Instagram's order. */
export function parseUserSearch(raw: unknown): UserSuggestion[] {
  const out: UserSuggestion[] = [];
  for (const entry of arr(obj(raw).users)) {
    const u = obj(obj(entry).user ?? entry);
    const a = parseAuthor(u);
    if (a) out.push({ ...a, isPrivate: u.is_private === true, isVerified: u.is_verified === true });
    if (out.length === 20) break;
  }
  return out;
}

/** The following list has no `more_available`: a next cursor means there is more. */
export function parseFollowingPage(raw: unknown): ParsedUserPage {
  const r = obj(raw);
  const items = arr(r.users).map((u) => parseAuthor(obj(u))).filter((a): a is ParsedAuthor => a !== null);
  const nextCursor = str(r.next_max_id);
  return { items, nextCursor, moreAvailable: nextCursor !== null };
}
```

`client.ts` — extend the interface:

```ts
export interface IgClient {
  savedPage(cursor: string | null): Promise<unknown>;
  collectionsPage(cursor: string | null): Promise<unknown>;
  mediaInfo(id: string): Promise<unknown>;
  profileInfo(username: string): Promise<unknown>;
  userFeed(userId: string, cursor: string | null): Promise<unknown>;
  searchUsers(query: string): Promise<unknown>;
  followingPage(viewerId: string, cursor: string | null): Promise<unknown>;
}
```

Inside `createIgClient`, before `return`, add:

```ts
  /** Ids go into the URL path, so only digits may pass. */
  const userPath = (id: string, rest: string) => {
    if (!/^\d{1,30}$/.test(id)) throw new IgError("bad_response", "Bad Instagram user id.");
    return `/api/v1/${rest.replace("{id}", id)}`;
  };
```

and add to the returned object:

```ts
    profileInfo: (username) => get("profile", "/api/v1/users/web_profile_info/", { username }, true),
    userFeed: async (userId, cursor) => get("profile posts", userPath(userId, "feed/user/{id}/"), { count: "12", max_id: cursor }),
    searchUsers: (query) => get("search", "/api/v1/web/search/topsearch/", { context: "blended", query }),
    followingPage: async (viewerId, cursor) => get("following list", userPath(viewerId, "friendships/{id}/following/"), { count: "100", max_id: cursor }),
```

(`async` makes the `userPath` throw a rejected promise, as the test expects.)

`gate.ts` — `gateClient` returns:

```ts
  return {
    savedPage: (cursor) => gate.run(() => ig.savedPage(cursor)),
    collectionsPage: (cursor) => gate.run(() => ig.collectionsPage(cursor)),
    mediaInfo: (id) => gate.run(() => ig.mediaInfo(id)),
    profileInfo: (username) => gate.run(() => ig.profileInfo(username)),
    userFeed: (userId, cursor) => gate.run(() => ig.userFeed(userId, cursor)),
    searchUsers: (query) => gate.run(() => ig.searchUsers(query)),
    followingPage: (viewerId, cursor) => gate.run(() => ig.followingPage(viewerId, cursor)),
  };
```

`index.ts` — add `export * from "./ig/users";`.

Fakes: every test object typed `IgClient` (`run-sync.test.ts`, `media-fetch.test.ts`, any in `gate.test.ts`) gets the four new methods as `async () => { throw new Error("not used"); }`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. (`saved-page` fixtures give `pinned: false`; if a parse test compares whole parsed posts with `toEqual`, add `pinned: false` to its expected object.)

- [ ] **Step 6: Commit**

```bash
git add packages/core apps/extension/test
git commit -m "feat(core): parse profiles, user search, following list and pinned posts"
```

---

### Task 3: Core: profile load and following update runners

**Files:**
- Create: `packages/core/src/sync/run-loads.ts`, `packages/core/test/run-loads.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `IgClient` (Task 2), `parseFollowingPage` (Task 2), `readPageInfo`, `SyncResult` (existing).
- Produces:

```ts
export type ProfileLoadMode = "add" | "older" | "refresh";
export type ProfileLoadRequest = { mode: "add"; username: string } | { mode: "older" | "refresh"; authorId: string };
export type ProfileStartBody = { mode: "add"; payload: unknown } | { mode: "older" | "refresh"; authorId: string };
export type LoadStart = { ok: true; authorId?: string } | { ok: false; error: string };
export interface ProfileSink {
  startRun(body: ProfileStartBody): Promise<{ runId: number; authorId: string; cursor: string | null }>;
  page(runId: number, payload: unknown): Promise<{ stop: boolean }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}
export interface FollowingSink {
  startRun(): Promise<{ runId: number }>;
  page(runId: number, payload: unknown): Promise<{ seen: number }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}
export const PROFILE_PAGES = 9;
export const FOLLOWING_PAGES = 50;
export function runProfileLoad(deps: { ig: IgClient; sink: ProfileSink; request: ProfileLoadRequest; onStart: (s: LoadStart) => void; maxPages?: number }): Promise<LoadResult>;
export function runFollowingUpdate(deps: { ig: IgClient; sink: FollowingSink; viewerId: string | null; onStart: (s: LoadStart) => void; maxPages?: number }): Promise<LoadResult>;
export type LoadResult = { ok: boolean; pages: number; error?: { code: string; message: string } };
```

`onStart` is called exactly once: after the server accepted the run, or with the error that stopped it from starting. The extension answers the web app from `onStart`, so errors like "private profile" reach the page directly; pages then continue in the background.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/run-loads.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { IgError, type IgClient } from "../src/ig/client";
import { runFollowingUpdate, runProfileLoad, type FollowingSink, type LoadStart, type ProfileSink } from "../src/sync/run-loads";
import type { SyncResult } from "../src/sync/run-sync";

const unused = async () => { throw new Error("not used"); };
const feedPage = (next: string | null) => ({ items: [], more_available: next !== null, next_max_id: next });

function fakeIg(over: Partial<IgClient>): IgClient {
  return { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
}

function profileSetup(opts: { pages: Array<unknown | Error>; stopAt?: number; start?: Error }) {
  const log: string[] = [];
  const pages = [...opts.pages];
  const results: SyncResult[] = [];
  const starts: LoadStart[] = [];
  let n = 0;
  const ig = fakeIg({
    profileInfo: async (u) => { log.push(`ig:info:${u}`); return { data: { user: { id: "77", username: u } } }; },
    userFeed: async (id, cursor) => {
      log.push(`ig:feed:${id}:${cursor}`);
      const next = pages.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const sink: ProfileSink = {
    async startRun(body) {
      log.push(`sink:start:${body.mode}`);
      if (opts.start) throw opts.start;
      return { runId: 3, authorId: "77", cursor: body.mode === "older" ? "OLD" : null };
    },
    async page() { n++; log.push("sink:page"); return { stop: n === opts.stopAt }; },
    async finishRun(_id, r) { results.push(r); },
  };
  return { ig, sink, log, results, starts, onStart: (s: LoadStart) => starts.push(s) };
}

describe("runProfileLoad", () => {
  it("adds by username: reads the profile, starts, then pages until Instagram says the end", async () => {
    const s = profileSetup({ pages: [feedPage("A"), feedPage(null)] });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "nasa" }, onStart: s.onStart });
    expect(r).toEqual({ ok: true, pages: 2 });
    expect(s.starts).toEqual([{ ok: true, authorId: "77" }]);
    expect(s.log).toEqual(["ig:info:nasa", "sink:start:add", "ig:feed:77:null", "sink:page", "ig:feed:77:A", "sink:page"]);
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("starts older loads from the stored cursor and stops at the page cap", async () => {
    const s = profileSetup({ pages: [feedPage("B"), feedPage("C"), feedPage("D")] });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "older", authorId: "77" }, onStart: s.onStart, maxPages: 2 });
    expect(r.pages).toBe(2);
    expect(s.log.filter((l) => l.startsWith("ig:feed"))).toEqual(["ig:feed:77:OLD", "ig:feed:77:B"]);
  });

  it("stops when the server says the rest is known", async () => {
    const s = profileSetup({ pages: [feedPage("A"), feedPage("B")], stopAt: 1 });
    await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "refresh", authorId: "77" }, onStart: s.onStart });
    expect(s.log.filter((l) => l === "sink:page")).toHaveLength(1);
  });

  it("reports a start error once and never pages", async () => {
    const s = profileSetup({ pages: [], start: new Error("private_profile") });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "x" }, onStart: s.onStart });
    expect(r.ok).toBe(false);
    expect(s.starts).toEqual([{ ok: false, error: "private_profile" }]);
    expect(s.results).toEqual([]);
  });

  it("reports an Instagram error during paging to the server", async () => {
    const s = profileSetup({ pages: [feedPage("A"), new IgError("rate_limited", "slow down")] });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "nasa" }, onStart: s.onStart });
    expect(r).toMatchObject({ ok: false, pages: 1, error: { code: "rate_limited" } });
    expect(s.results).toEqual([{ ok: false, code: "rate_limited", message: "slow down" }]);
  });

  it("passes the Instagram code when the profile cannot be read", async () => {
    const s = profileSetup({ pages: [] });
    s.ig.profileInfo = async () => { throw new IgError("not_found", "gone"); };
    await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "ghost" }, onStart: s.onStart });
    expect(s.starts).toEqual([{ ok: false, error: "not_found" }]);
  });
});

describe("runFollowingUpdate", () => {
  function followingSetup(pages: unknown[]) {
    const cursors: Array<string | null> = [];
    const results: SyncResult[] = [];
    const starts: LoadStart[] = [];
    const ig = fakeIg({ followingPage: async (_v, cursor) => { cursors.push(cursor); return pages.shift(); } });
    const sink: FollowingSink = {
      async startRun() { return { runId: 5 }; },
      async page() { return { seen: 1 }; },
      async finishRun(_id, r) { results.push(r); },
    };
    return { ig, sink, cursors, results, starts, onStart: (s: LoadStart) => starts.push(s) };
  }

  it("walks pages by next_max_id", async () => {
    const s = followingSetup([{ users: [], next_max_id: "100" }, { users: [] }]);
    const r = await runFollowingUpdate({ ig: s.ig, sink: s.sink, viewerId: "42", onStart: s.onStart });
    expect(r).toEqual({ ok: true, pages: 2 });
    expect(s.cursors).toEqual([null, "100"]);
    expect(s.starts).toEqual([{ ok: true }]);
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("needs the owner's user id", async () => {
    const s = followingSetup([]);
    const r = await runFollowingUpdate({ ig: s.ig, sink: s.sink, viewerId: null, onStart: s.onStart });
    expect(r.ok).toBe(false);
    expect(s.starts).toEqual([{ ok: false, error: "login_required" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/run-loads.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/sync/run-loads.ts`:

```ts
import { IgError, type IgClient } from "../ig/client";
import { readPageInfo } from "../ig/parse";
import { parseFollowingPage } from "../ig/users";
import type { SyncResult } from "./run-sync";

export type ProfileLoadMode = "add" | "older" | "refresh";
export type ProfileLoadRequest = { mode: "add"; username: string } | { mode: "older" | "refresh"; authorId: string };
export type ProfileStartBody = { mode: "add"; payload: unknown } | { mode: "older" | "refresh"; authorId: string };
export type LoadStart = { ok: true; authorId?: string } | { ok: false; error: string };
export type LoadResult = { ok: boolean; pages: number; error?: { code: string; message: string } };

export interface ProfileSink {
  startRun(body: ProfileStartBody): Promise<{ runId: number; authorId: string; cursor: string | null }>;
  page(runId: number, payload: unknown): Promise<{ stop: boolean }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

export interface FollowingSink {
  startRun(): Promise<{ runId: number }>;
  page(runId: number, payload: unknown): Promise<{ seen: number }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

/** About 100 posts at 12 per page. */
export const PROFILE_PAGES = 9;
/** About 5,000 accounts at 100 per page. */
export const FOLLOWING_PAGES = 50;

const errorOf = (e: unknown) =>
  e instanceof IgError ? { code: e.code, message: e.message } : { code: "internal", message: (e as Error).message };
/** The web app shows a text for each code; server errors arrive as their code in the message. */
const startError = (e: unknown) => (e instanceof IgError ? e.code : (e as Error).message);

/** Pages through a run; the request gate spaces the calls, so there is no pause here. */
async function pageLoop(
  runId: number,
  sink: { finishRun(runId: number, result: SyncResult): Promise<void> },
  max: number,
  step: () => Promise<boolean>,
): Promise<LoadResult> {
  let pages = 0;
  try {
    while (pages < max) {
      pages++;
      if (!(await step())) break;
    }
    await sink.finishRun(runId, { ok: true });
    return { ok: true, pages };
  } catch (e) {
    const error = errorOf(e);
    await sink.finishRun(runId, { ok: false, ...error }).catch(() => {});
    // The failed page did not count.
    return { ok: false, pages: pages - 1, error };
  }
}

export async function runProfileLoad(deps: {
  ig: IgClient;
  sink: ProfileSink;
  request: ProfileLoadRequest;
  onStart: (s: LoadStart) => void;
  maxPages?: number;
}): Promise<LoadResult> {
  let started: { runId: number; authorId: string; cursor: string | null };
  try {
    const r = deps.request;
    const body: ProfileStartBody =
      r.mode === "add" ? { mode: "add", payload: await deps.ig.profileInfo(r.username) } : { mode: r.mode, authorId: r.authorId };
    started = await deps.sink.startRun(body);
  } catch (e) {
    deps.onStart({ ok: false, error: startError(e) });
    return { ok: false, pages: 0, error: errorOf(e) };
  }
  deps.onStart({ ok: true, authorId: started.authorId });
  let cursor = started.cursor;
  return pageLoop(started.runId, deps.sink, deps.maxPages ?? PROFILE_PAGES, async () => {
    const raw = await deps.ig.userFeed(started.authorId, cursor);
    const { stop } = await deps.sink.page(started.runId, raw);
    const info = readPageInfo(raw);
    cursor = info.nextCursor;
    return !stop && info.moreAvailable;
  });
}

export async function runFollowingUpdate(deps: {
  ig: IgClient;
  sink: FollowingSink;
  viewerId: string | null;
  onStart: (s: LoadStart) => void;
  maxPages?: number;
}): Promise<LoadResult> {
  const viewerId = deps.viewerId;
  if (!viewerId) {
    deps.onStart({ ok: false, error: "login_required" });
    return { ok: false, pages: 0, error: { code: "login_required", message: "Log in to Instagram in this browser." } };
  }
  let runId: number;
  try {
    ({ runId } = await deps.sink.startRun());
  } catch (e) {
    deps.onStart({ ok: false, error: startError(e) });
    return { ok: false, pages: 0, error: errorOf(e) };
  }
  deps.onStart({ ok: true });
  let cursor: string | null = null;
  return pageLoop(runId, deps.sink, deps.maxPages ?? FOLLOWING_PAGES, async () => {
    const raw = await deps.ig.followingPage(viewerId, cursor);
    await deps.sink.page(runId, raw);
    const info = parseFollowingPage(raw);
    cursor = info.nextCursor;
    return info.moreAvailable;
  });
}
```

Check against the test "reports an Instagram error during paging": first page succeeds (pages=1), second throws → returns `pages: 1`. The cap test: `maxPages: 2` → two feed calls. Good.

`index.ts` — add `export * from "./sync/run-loads";`.

- [ ] **Step 4: Run tests**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): runners for profile loads and following updates"
```

---

### Task 4: Server: split saved state out of `posts` (schema, migration, ingest)

**Files:**
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/sync/ingest.ts`, `apps/server/src/queries.ts`
- Create: `apps/server/drizzle/0008_profiles.sql` (+ `drizzle/meta/0008_snapshot.json`, journal entry, both generated), `apps/server/test/migration.test.ts`
- Modify tests: `apps/server/test/ingest.test.ts`

**Interfaces:**
- Produces (schema): `savedPosts`, `profiles`, `profilePosts`, `following`, `loadRuns` tables (below).
- Produces (ingest, exported for Task 5): `upsertAuthor(q: Q, a: ParsedAuthor, jobs: MediaJob[]): void`, `upsertPostContent(q: Q, p: ParsedPost, jobs: MediaJob[]): { isNew: boolean }`.
- Keeps: `startRun`, `ingestSavedPage`, `ingestCollections`, `finishRun`, `ingestMediaInfo`, `markMediaSaved` with the same signatures.

- [ ] **Step 1: Write the failing migration test**

Create `apps/server/test/migration.test.ts`:

```ts
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { asc, count, desc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/open";
import { postCollections, postParts, posts, reports, savedPosts } from "../src/db/schema";

const SRC = fileURLToPath(new URL("../drizzle", import.meta.url));

/** A copy of the migrations folder that stops at `tag`, to build a database as an older app left it. */
function migrationsUpTo(tag: string): string {
  const dir = mkdtempSync(join(tmpdir(), "nf-mig-"));
  cpSync(SRC, dir, { recursive: true });
  const file = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(file, "utf8")) as { entries: Array<{ tag: string }> };
  journal.entries = journal.entries.slice(0, journal.entries.findIndex((e) => e.tag === tag) + 1);
  writeFileSync(file, JSON.stringify(journal));
  return dir;
}

describe("migration 0008", () => {
  it("moves saved-feed state to saved_posts and keeps posts, parts, links and reports", () => {
    const file = join(mkdtempSync(join(tmpdir(), "nf-db-")), "old.db");
    const old = new Database(file);
    old.pragma("foreign_keys = ON");
    migrate(drizzle(old), { migrationsFolder: migrationsUpTo("0007_report_search") });
    old.exec(`
      INSERT INTO authors (id, username) VALUES ('9', 'a');
      INSERT INTO posts (id, code, kind, author_id, hashtags, mentions, taken_at, sort_key, first_seen_run_id, last_seen_run_id, removed_at, removed_remotely_at)
        VALUES ('1', 'C1', 'image', '9', '[]', '[]', 1, 200, 1, 2, NULL, NULL),
               ('2', 'C2', 'video', '9', '[]', '[]', 2, 100, 1, 1, NULL, 555);
      INSERT INTO post_parts (post_id, idx, kind) VALUES ('1', 0, 'image');
      INSERT INTO collections (id) VALUES ('77');
      INSERT INTO post_collections (post_id, collection_id, first_seen_run_id) VALUES ('1', '77', 1);
      INSERT INTO reports (post_id, status, markdown, language, report_model, created_at) VALUES ('2', 'done', '## Summary\nhi', 'English', 'm', 1);
    `);
    old.close();

    const db = openDb(file);
    expect(db.select().from(savedPosts).orderBy(desc(savedPosts.sortKey)).all()).toEqual([
      { postId: "1", sortKey: 200, firstSeenRunId: 1, lastSeenRunId: 2, removedAt: null, removedRemotelyAt: null },
      { postId: "2", sortKey: 100, firstSeenRunId: 1, lastSeenRunId: 1, removedAt: null, removedRemotelyAt: 555 },
    ]);
    expect(db.select({ id: posts.id }).from(posts).orderBy(asc(posts.id)).all()).toEqual([{ id: "1" }, { id: "2" }]);
    expect(db.select({ n: count() }).from(postParts).get()!.n).toBe(1);
    expect(db.select({ n: count() }).from(postCollections).get()!.n).toBe(1);
    expect(db.select({ markdown: reports.markdown }).from(reports).get()!.markdown).toBe("## Summary\nhi");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/server/test/migration.test.ts`
Expected: FAIL — `savedPosts` is not exported.

- [ ] **Step 3: Change the schema**

In `apps/server/src/db/schema.ts`:

1. In `posts`, delete `sortKey`, `firstSeenRunId`, `lastSeenRunId`, `removedAt`, `removedRemotelyAt`, and replace the index list with:

```ts
  (t) => [
    index("posts_author_idx").on(t.authorId),
    index("posts_kind_idx").on(t.kind),
    index("posts_taken_idx").on(t.takenAt),
  ],
```

2. Append:

```ts
/** A post's place in the saved feed. A post without a row here was never saved. */
export const savedPosts = sqliteTable(
  "saved_posts",
  {
    postId: text("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
    sortKey: integer("sort_key").notNull(),
    firstSeenRunId: integer("first_seen_run_id").notNull(),
    lastSeenRunId: integer("last_seen_run_id").notNull(),
    removedAt: integer("removed_at"),
    removedRemotelyAt: integer("removed_remotely_at"),
  },
  (t) => [index("saved_posts_sort_idx").on(t.sortKey)],
);

/** Instagram accounts the owner added to the library. */
export const profiles = sqliteTable("profiles", {
  authorId: text("author_id").primaryKey().references(() => authors.id),
  addedAt: integer("added_at").notNull(),
  refreshedAt: integer("refreshed_at"),
  postCount: integer("post_count"),
  /** Instagram's next_max_id for "Load older posts". Null when the end is reached. */
  olderCursor: text("older_cursor"),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
});

export const profilePosts = sqliteTable(
  "profile_posts",
  {
    authorId: text("author_id").notNull().references(() => profiles.authorId, { onDelete: "cascade" }),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.authorId, t.postId] }), index("profile_posts_post_idx").on(t.postId)],
);

/** Accounts the owner follows. Names and avatars live in `authors`. */
export const following = sqliteTable("following", {
  authorId: text("author_id").primaryKey().references(() => authors.id),
  /** Instagram's order, most recent follow first. */
  position: integer("position").notNull(),
  lastSeenRunId: integer("last_seen_run_id").notNull(),
});

/** Profile loads and following updates, run by the extension. */
export const loadRuns = sqliteTable("load_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["profile", "following"] }).notNull(),
  authorId: text("author_id"),
  mode: text("mode", { enum: ["add", "older", "refresh", "following"] }).notNull(),
  status: text("status", { enum: ["running", "done", "error"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  pages: integer("pages").notNull().default(0),
  /** New posts for a profile run; accounts seen for a following run. */
  items: integer("items").notNull().default(0),
  nextPos: integer("next_pos").notNull().default(0),
  /** A following run read the list to its end, so accounts it did not see were unfollowed. */
  complete: integer("complete", { mode: "boolean" }).notNull().default(false),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
});
```

- [ ] **Step 4: Generate and hand-fix the migration**

Run: `pnpm --filter @no-fomo/server db:generate --name profiles`

Open `apps/server/drizzle/0008_profiles.sql`. Keep drizzle's `CREATE TABLE` / `CREATE INDEX` text, but make the file follow this order and content exactly:

1. `CREATE TABLE saved_posts …` and `CREATE INDEX saved_posts_sort_idx …`
2. The data copy (add by hand):

```sql
-- Every post stored before this version came from the saved feed.
INSERT INTO `saved_posts` (`post_id`, `sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at`)
SELECT `id`, `sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at` FROM `posts`;--> statement-breakpoint
```

3. `CREATE TABLE` for `profiles`, `profile_posts` (+ its index), `following`, `load_runs`.
4. The column drops, without a table rebuild:

```sql
DROP INDEX `posts_sort_idx`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `sort_key`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `first_seen_run_id`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `last_seen_run_id`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `removed_at`;--> statement-breakpoint
ALTER TABLE `posts` DROP COLUMN `removed_remotely_at`;--> statement-breakpoint
CREATE INDEX `posts_taken_idx` ON `posts` (`taken_at`);
```

The file must contain **no** `__new_posts`, **no** `DROP TABLE`, and **no** `PRAGMA`. Every statement ends with `--> statement-breakpoint` except the last. Do not edit the snapshot JSON.

- [ ] **Step 5: Update ingest for `saved_posts`**

In `apps/server/src/sync/ingest.ts`:

Imports: add `savedPosts` to the schema import and `type ParsedAuthor` to the core import.

Replace `upsertAuthor` signature with `export function upsertAuthor(q: Q, a: ParsedAuthor, jobs: MediaJob[])` (body unchanged).

Replace `upsertPost` with:

```ts
/** Post content, shared by every source. Never touches saved or profile state. */
export function upsertPostContent(q: Q, p: ParsedPost, jobs: MediaJob[]): { isNew: boolean } {
  upsertAuthor(q, p.author, jobs);
  const existing = q.select({ thumbPath: posts.thumbPath }).from(posts).where(eq(posts.id, p.id)).get();
  if (!existing) q.insert(posts).values({ id: p.id, ...postFields(p) }).run();
  else q.update(posts).set(postFields(p)).where(eq(posts.id, p.id)).run();
  replaceParts(q, p);
  replaceSearch(q, p);
  if (!existing?.thumbPath && p.thumbnailUrl) jobs.push({ kind: "thumb", id: p.id, url: p.thumbnailUrl });
  return { isNew: !existing };
}

function upsertSavedPost(q: Q, p: ParsedPost, runId: number, key: number, jobs: MediaJob[]) {
  upsertPostContent(q, p, jobs);
  const existing = q
    .select({ firstSeenRunId: savedPosts.firstSeenRunId, firstRunComplete: syncRuns.savedComplete })
    .from(savedPosts)
    .leftJoin(syncRuns, eq(syncRuns.id, savedPosts.firstSeenRunId))
    .where(eq(savedPosts.postId, p.id))
    .get();
  if (!existing) {
    q.insert(savedPosts).values({ postId: p.id, sortKey: key, firstSeenRunId: runId, lastSeenRunId: runId }).run();
  } else {
    q.update(savedPosts).set({ sortKey: key, lastSeenRunId: runId, removedRemotelyAt: null }).where(eq(savedPosts.postId, p.id)).run();
  }
  syncCollectionLinks(q, p, runId);
  // "Known" means first seen by an earlier run that finished walking the saved feed.
  // Posts from a run that was cut off may sit above a gap of posts nobody fetched yet.
  return { isNew: !existing, knownBefore: !!existing && existing.firstSeenRunId < runId && existing.firstRunComplete === true };
}
```

In `ingestSavedPage`, replace `const r = upsertPost(tx, p, runId, key, key, jobs);` with `const r = upsertSavedPost(tx, p, runId, key, jobs);`.

In `startRun`, replace the `max` line with:

```ts
    const max = tx.select({ max: sql<number | null>`max(${savedPosts.sortKey})` }).from(savedPosts).get()?.max ?? 0;
```

Replace `hideMissingPosts` with:

```ts
function hideMissingPosts(q: Q, runId: number, now: number): { count: number; warning: string | null } {
  const visible = and(isNull(savedPosts.removedAt), isNull(savedPosts.removedRemotelyAt));
  const missing = and(visible, lt(savedPosts.lastSeenRunId, runId));
  const total = q.select({ n: count() }).from(savedPosts).where(visible).get()?.n ?? 0;
  const n = q.select({ n: count() }).from(savedPosts).where(missing).get()?.n ?? 0;
  if (n > SMALL_CHANGE && n > total * MAX_HIDDEN_SHARE) return { count: 0, warning: TOO_MANY_MISSING };
  if (n > 0) q.update(savedPosts).set({ removedRemotelyAt: now }).where(missing).run();
  return { count: n, warning: null };
}
```

`ingestMediaInfo` stays as is (it only writes post content).

- [ ] **Step 6: Update queries for `saved_posts`**

In `apps/server/src/queries.ts`, add `savedPosts` to the schema import and replace `visible` with:

```ts
const visible = and(isNull(savedPosts.removedAt), isNull(savedPosts.removedRemotelyAt));
```

In `listPosts`: count and select must `innerJoin(savedPosts, eq(savedPosts.postId, posts.id))` (count query: `db.select({ n: count() }).from(posts).innerJoin(savedPosts, eq(savedPosts.postId, posts.id)).where(where)`), and use `savedPosts.sortKey` for the cursor (`lt(savedPosts.sortKey, q.cursor)`), the order (`desc(savedPosts.sortKey)`) and `nextCursor` (select `key: savedPosts.sortKey` and return `page.at(-1)!.key`).

In `listAuthors`: `.innerJoin(posts, eq(posts.authorId, authors.id)).innerJoin(savedPosts, and(eq(savedPosts.postId, posts.id), visible))`.

In `listCollections`: replace the posts join with `.leftJoin(savedPosts, and(eq(savedPosts.postId, postCollections.postId), visible))` and count `count(savedPosts.postId)`.

- [ ] **Step 7: Update existing ingest tests**

In `apps/server/test/ingest.test.ts`, import `savedPosts` and change the helpers:

```ts
const order = (db: Db) => db.select({ id: savedPosts.postId }).from(savedPosts).orderBy(desc(savedPosts.sortKey)).all().map((r) => r.id);
```

and in the full-resync test:

```ts
  const visible = () => db.select({ id: savedPosts.postId }).from(savedPosts).where(isNull(savedPosts.removedRemotelyAt)).all().map((r) => r.id).sort();
```

Fix any other direct use of the removed `posts` columns in server tests the same way (`grep -rn "sortKey\|removedRemotelyAt\|removedAt" apps/server/test`).

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS, including `migration.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/server
git commit -m "feat(server): keep saved-feed state in saved_posts; add profile, following and load run tables"
```

---

### Task 5: Server: profile loads, following updates, removing a profile

**Files:**
- Create: `apps/server/src/sync/loads.ts`, `apps/server/test/loads.test.ts`
- Modify: `apps/server/src/media/store.ts`, `apps/server/test/media-store.test.ts`, `apps/server/src/main.ts`

**Interfaces:**
- Consumes: `upsertAuthor`, `upsertPostContent`, `MediaJob`, `NotFoundError`, `RunNotActiveError` (ingest.ts); `parseProfileInfo`, `parseFollowingPage`, `parseMediaPage`, `ProfileStartBody`, `SyncResult` (core).
- Produces:

```ts
export type LoadErrorCode = "profile_not_found" | "private_profile" | "no_more_posts";
export class LoadError extends Error { readonly code: LoadErrorCode }
export const FOLLOWING_UPDATED_AT = "following_updated_at";
export function startProfileRun(db: Db, body: ProfileStartBody, now?: number): { runId: number; authorId: string; cursor: string | null; jobs: MediaJob[] };
export function ingestProfilePage(db: Db, runId: number, raw: unknown): { stop: boolean; newCount: number; jobs: MediaJob[] };
export function startFollowingRun(db: Db, now?: number): { runId: number };
export function ingestFollowingPage(db: Db, runId: number, raw: unknown): { seen: number };
export function finishLoadRun(db: Db, runId: number, result: SyncResult, now?: number): void;
export function removeProfile(db: Db, authorId: string): string[]; // ids of deleted posts
export function failStaleLoads(db: Db, now?: number): void;
// media store
MediaStore.removeThumbs(ids: string[]): Promise<void>;
```

- [ ] **Step 1: Write the failing tests**

Create `apps/server/test/loads.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { openDb, type Db } from "../src/db/open";
import { following, loadRuns, posts, profilePosts, profiles, savedPosts } from "../src/db/schema";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";
import { finishReport, queueReport, failReport } from "../src/analyze/report-store";
import {
  FOLLOWING_UPDATED_AT, finishLoadRun, ingestFollowingPage, ingestProfilePage, LoadError, removeProfile,
  startFollowingRun, startProfileRun,
} from "../src/sync/loads";
import { getSetting } from "../src/db/settings";

const info = (over: Record<string, unknown> = {}) => ({
  data: { user: { id: "77", username: "nasa", full_name: "NASA", is_private: false, followed_by_viewer: false, edge_owner_to_timeline_media: { count: 500 }, ...over } },
});
const media = (pk: string, author = "77", extra: Record<string, unknown> = {}) => ({
  pk, code: `C${pk}`, media_type: 1, taken_at: Number(pk), user: { pk: author, username: author === "77" ? "nasa" : `u${author}` },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] }, ...extra,
});
const feed = (pks: string[], next: string | null, extra: Record<string, Record<string, unknown>> = {}) => ({
  items: pks.map((pk) => media(pk, "77", extra[pk] ?? {})), more_available: next !== null, next_max_id: next,
});
const linked = (db: Db, authorId = "77") =>
  db.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).orderBy(asc(profilePosts.postId)).all().map((r) => r.id);
const opts = { language: "English", reportModel: "m", transcribeModel: "t" };

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });

function addProfile(pages: unknown[]) {
  const { runId, authorId } = startProfileRun(db, { mode: "add", payload: info() }, 10);
  for (const p of pages) ingestProfilePage(db, runId, p);
  finishLoadRun(db, runId, { ok: true }, 20);
  return authorId;
}

describe("profile loads", () => {
  it("adds a profile, links its posts and stores the older cursor", () => {
    const start = startProfileRun(db, { mode: "add", payload: info() }, 10);
    expect(start).toMatchObject({ authorId: "77", cursor: null });
    expect(start.jobs).toEqual([]); // no avatar url in this payload
    const r = ingestProfilePage(db, start.runId, feed(["3", "2"], "NEXT"));
    expect(r).toMatchObject({ stop: false, newCount: 2 });
    expect(r.jobs.filter((j) => j.kind === "thumb")).toHaveLength(2);
    finishLoadRun(db, start.runId, { ok: true }, 20);
    expect(db.select().from(profiles).get()).toMatchObject({ authorId: "77", postCount: 500, olderCursor: "NEXT", refreshedAt: 20 });
    expect(linked(db)).toEqual(["2", "3"]);
    expect(db.select().from(savedPosts).all()).toEqual([]);
  });

  it("refuses unknown and private accounts", () => {
    expect(() => startProfileRun(db, { mode: "add", payload: { data: { user: null } } })).toThrow(LoadError);
    try { startProfileRun(db, { mode: "add", payload: info({ is_private: true }) }); } catch (e) { expect((e as LoadError).code).toBe("private_profile"); }
    expect(startProfileRun(db, { mode: "add", payload: info({ is_private: true, followed_by_viewer: true }) }).authorId).toBe("77");
  });

  it("loads older posts from the cursor and clears it at the end", () => {
    addProfile([feed(["3"], "NEXT")]);
    const older = startProfileRun(db, { mode: "older", authorId: "77" });
    expect(older.cursor).toBe("NEXT");
    ingestProfilePage(db, older.runId, feed(["1"], null));
    finishLoadRun(db, older.runId, { ok: true });
    expect(db.select().from(profiles).get()!.olderCursor).toBeNull();
    try { startProfileRun(db, { mode: "older", authorId: "77" }); } catch (e) { expect((e as LoadError).code).toBe("no_more_posts"); }
  });

  it("refresh stops at a known post but not at a pinned one, and keeps the older cursor", () => {
    addProfile([feed(["3", "2"], "NEXT")]);
    const again = startProfileRun(db, { mode: "add", payload: info() });
    expect(db.select().from(loadRuns).where(eq(loadRuns.id, again.runId)).get()!.mode).toBe("refresh");
    const p1 = ingestProfilePage(db, again.runId, feed(["2", "9", "8"], "X", { "2": { timeline_pinned_user_ids: ["77"] } }));
    expect(p1).toMatchObject({ stop: false, newCount: 2 });
    expect(ingestProfilePage(db, again.runId, feed(["7", "3"], "Y")).stop).toBe(true);
    expect(db.select().from(profiles).get()!.olderCursor).toBe("NEXT");
  });

  it("a profile post that is also saved is one row, in both lists", () => {
    addProfile([feed(["3"], null)]);
    const run = startRun(db);
    ingestSavedPage(db, run.runId, { items: [{ media: media("3") }], more_available: false });
    finishRun(db, run.runId, { ok: true });
    expect(db.select({ id: posts.id }).from(posts).all()).toEqual([{ id: "3" }]);
    expect(db.select({ id: savedPosts.postId }).from(savedPosts).all()).toEqual([{ id: "3" }]);
    expect(linked(db)).toEqual(["3"]);
  });

  it("a new run marks an unfinished run of the same profile as interrupted", () => {
    const a = startProfileRun(db, { mode: "add", payload: info() });
    startProfileRun(db, { mode: "refresh", authorId: "77" });
    expect(db.select().from(loadRuns).where(eq(loadRuns.id, a.runId)).get()).toMatchObject({ status: "error", errorCode: "interrupted" });
    expect(() => ingestProfilePage(db, a.runId, feed([], null))).toThrow();
  });
});

describe("removing a profile", () => {
  it("deletes only posts nothing else needs", () => {
    addProfile([feed(["1", "2", "3", "4", "5"], null)]);
    // 1: saved. 2: finished report. 3: only a failed report. 4: also in another profile. 5: nothing.
    const run = startRun(db);
    ingestSavedPage(db, run.runId, { items: [{ media: media("1") }], more_available: false });
    finishRun(db, run.runId, { ok: true });
    queueReport(db, "2", opts, 1);
    finishReport(db, "2", { markdown: "## Summary\nok", frameCount: 1, transcribeModel: null }, 2);
    queueReport(db, "3", opts, 1);
    failReport(db, "3", "quota", null, 2);
    const other = startProfileRun(db, { mode: "add", payload: info({ id: "88", username: "other" }) });
    ingestProfilePage(db, other.runId, feed(["4"], null));

    expect(removeProfile(db, "77").sort()).toEqual(["3", "5"]);
    expect(db.select({ id: posts.id }).from(posts).orderBy(asc(posts.id)).all().map((r) => r.id)).toEqual(["1", "2", "4"]);
    expect(db.select().from(profiles).all().map((p) => p.authorId)).toEqual(["88"]);
  });

  it("throws for an unknown profile", () => {
    expect(() => removeProfile(db, "404")).toThrow();
  });
});

describe("following updates", () => {
  const page = (ids: string[], next: string | null) => ({ users: ids.map((id) => ({ pk: id, username: `u${id}`, profile_pic_url: `https://scontent.cdninstagram.com/${id}.jpg` })), next_max_id: next });
  const ids = () => db.select({ id: following.authorId }).from(following).orderBy(asc(following.position)).all().map((r) => r.id);

  it("stores accounts in Instagram's order and removes unfollowed ones after a complete walk", () => {
    const a = startFollowingRun(db, 1);
    expect(ingestFollowingPage(db, a.runId, page(["1", "2"], "C"))).toEqual({ seen: 2 });
    ingestFollowingPage(db, a.runId, page(["3"], null));
    finishLoadRun(db, a.runId, { ok: true }, 5);
    expect(ids()).toEqual(["1", "2", "3"]);
    expect(getSetting(db, FOLLOWING_UPDATED_AT)).toBe("5");

    const b = startFollowingRun(db, 6);
    ingestFollowingPage(db, b.runId, page(["4", "1"], null));
    finishLoadRun(db, b.runId, { ok: true }, 7);
    expect(ids()).toEqual(["4", "1"]);
  });

  it("removes nothing when the walk stopped early", () => {
    const a = startFollowingRun(db);
    ingestFollowingPage(db, a.runId, page(["1", "2"], null));
    finishLoadRun(db, a.runId, { ok: true });
    const b = startFollowingRun(db);
    ingestFollowingPage(db, b.runId, page(["3"], "MORE"));
    finishLoadRun(db, b.runId, { ok: true });
    expect(ids().sort()).toEqual(["1", "2", "3"]);
  });

  it("stores the error of a failed run", () => {
    const a = startFollowingRun(db);
    finishLoadRun(db, a.runId, { ok: false, code: "rate_limited", message: "slow" });
    expect(db.select().from(loadRuns).get()).toMatchObject({ status: "error", errorCode: "rate_limited" });
  });
});
```

Add to `apps/server/test/media-store.test.ts` (follow the file's existing setup for `dir` and store creation):

```ts
  it("removes thumbnails of deleted posts and ignores missing files", async () => {
    // use the test's existing store/dir helpers; write two thumb files first
    writeFileSync(store.pathFor("thumb", "1"), "x");
    await store.removeThumbs(["1", "2"]);
    expect(existsSync(store.pathFor("thumb", "1"))).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/test/loads.test.ts apps/server/test/media-store.test.ts`
Expected: FAIL — module `../src/sync/loads` not found; `removeThumbs` is not a function.

- [ ] **Step 3: Implement `loads.ts`**

Create `apps/server/src/sync/loads.ts`:

```ts
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { parseFollowingPage, parseMediaPage, parseProfileInfo, type ProfileStartBody, type SyncResult } from "@no-fomo/core";
import type { Db } from "../db/open";
import { following, loadRuns, posts, profilePosts, profiles } from "../db/schema";
import { setSetting, type Q } from "../db/settings";
import { NotFoundError, RunNotActiveError, upsertAuthor, upsertPostContent, type MediaJob } from "./ingest";

export type LoadErrorCode = "profile_not_found" | "private_profile" | "no_more_posts";
export class LoadError extends Error {
  constructor(public readonly code: LoadErrorCode) {
    super(code);
  }
}

export const FOLLOWING_UPDATED_AT = "following_updated_at";

function activeLoad(q: Q, runId: number, kind: "profile" | "following") {
  const run = q.select().from(loadRuns).where(eq(loadRuns.id, runId)).get();
  if (!run || run.kind !== kind) throw new NotFoundError(`Load run ${runId} not found`);
  if (run.status !== "running") throw new RunNotActiveError(`Load run ${runId} is ${run.status}`);
  return run;
}

/** A run left behind by a closed tab would look busy forever, so a new run replaces it. */
function interruptRunning(q: Q, kind: "profile" | "following", authorId: string | null, now: number) {
  q.update(loadRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "A new load started before this one finished." })
    .where(and(eq(loadRuns.kind, kind), eq(loadRuns.status, "running"), authorId ? eq(loadRuns.authorId, authorId) : undefined))
    .run();
}

export function startProfileRun(db: Db, body: ProfileStartBody, now = Date.now()) {
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    let authorId: string;
    let mode: "add" | "older" | "refresh" = body.mode;
    let cursor: string | null = null;
    if (body.mode === "add") {
      const info = parseProfileInfo(body.payload);
      if (!info) throw new LoadError("profile_not_found");
      if (info.isPrivate && !info.followedByViewer) throw new LoadError("private_profile");
      upsertAuthor(tx, info, jobs);
      authorId = info.id;
      const exists = tx.select({ id: profiles.authorId }).from(profiles).where(eq(profiles.authorId, authorId)).get();
      if (exists) {
        tx.update(profiles).set({ postCount: info.postCount, isPrivate: info.isPrivate }).where(eq(profiles.authorId, authorId)).run();
        const hasPosts = tx.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).limit(1).get();
        // Adding again means "get what is new"; a profile whose first load failed starts over.
        if (hasPosts) mode = "refresh";
      } else {
        tx.insert(profiles).values({ authorId, addedAt: now, postCount: info.postCount, isPrivate: info.isPrivate }).run();
      }
    } else {
      const profile = tx.select().from(profiles).where(eq(profiles.authorId, body.authorId)).get();
      if (!profile) throw new NotFoundError(`Profile ${body.authorId} is not in your library`);
      authorId = profile.authorId;
      if (body.mode === "older") {
        if (!profile.olderCursor) throw new LoadError("no_more_posts");
        cursor = profile.olderCursor;
      }
    }
    interruptRunning(tx, "profile", authorId, now);
    const run = tx.insert(loadRuns).values({ kind: "profile", authorId, mode, status: "running", startedAt: now }).returning({ id: loadRuns.id }).get();
    return { runId: run.id, authorId, cursor, jobs };
  });
}

export function ingestProfilePage(db: Db, runId: number, raw: unknown) {
  const page = parseMediaPage(raw);
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    const run = activeLoad(tx, runId, "profile");
    const authorId = run.authorId!;
    let newCount = 0;
    let sawKnown = false;
    for (const p of page.items) {
      upsertPostContent(tx, p, jobs);
      const known = tx.select({ id: profilePosts.postId }).from(profilePosts)
        .where(and(eq(profilePosts.authorId, authorId), eq(profilePosts.postId, p.id))).get();
      if (known) {
        // Pinned posts sit on top of the profile however old they are, so they say nothing about where new posts end.
        if (!p.pinned) sawKnown = true;
      } else {
        tx.insert(profilePosts).values({ authorId, postId: p.id }).run();
        newCount++;
      }
    }
    // Refresh reads from the top, so its cursor says nothing about older posts.
    if (run.mode !== "refresh") {
      tx.update(profiles).set({ olderCursor: page.moreAvailable ? page.nextCursor : null }).where(eq(profiles.authorId, authorId)).run();
    }
    tx.update(loadRuns)
      .set({ pages: sql`${loadRuns.pages} + 1`, items: sql`${loadRuns.items} + ${newCount}` })
      .where(eq(loadRuns.id, runId))
      .run();
    return { stop: run.mode === "refresh" && sawKnown, newCount, jobs };
  });
}

export function startFollowingRun(db: Db, now = Date.now()) {
  return db.transaction((tx) => {
    interruptRunning(tx, "following", null, now);
    const run = tx.insert(loadRuns).values({ kind: "following", mode: "following", status: "running", startedAt: now }).returning({ id: loadRuns.id }).get();
    return { runId: run.id };
  });
}

export function ingestFollowingPage(db: Db, runId: number, raw: unknown) {
  const page = parseFollowingPage(raw);
  return db.transaction((tx) => {
    const run = activeLoad(tx, runId, "following");
    let pos = run.nextPos;
    for (const a of page.items) {
      // Avatars are fetched when the list shows them, not all at once.
      upsertAuthor(tx, a, []);
      const position = pos++;
      tx.insert(following)
        .values({ authorId: a.id, position, lastSeenRunId: runId })
        .onConflictDoUpdate({ target: following.authorId, set: { position, lastSeenRunId: runId } })
        .run();
    }
    tx.update(loadRuns)
      .set({ nextPos: pos, pages: sql`${loadRuns.pages} + 1`, items: sql`${loadRuns.items} + ${page.items.length}`, complete: !page.moreAvailable })
      .where(eq(loadRuns.id, runId))
      .run();
    return { seen: page.items.length };
  });
}

export function finishLoadRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  db.transaction((tx) => {
    const run = tx.select().from(loadRuns).where(eq(loadRuns.id, runId)).get();
    if (!run) throw new NotFoundError(`Load run ${runId} not found`);
    if (run.status !== "running") return;
    if (!result.ok) {
      tx.update(loadRuns).set({ status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message }).where(eq(loadRuns.id, runId)).run();
      return;
    }
    if (run.kind === "profile" && run.authorId) {
      tx.update(profiles).set({ refreshedAt: now }).where(eq(profiles.authorId, run.authorId)).run();
    }
    if (run.kind === "following") {
      // Only a walk to the end proves an account is no longer followed.
      if (run.complete) tx.delete(following).where(lt(following.lastSeenRunId, runId)).run();
      setSetting(tx, FOLLOWING_UPDATED_AT, String(now));
    }
    tx.update(loadRuns).set({ status: "done", finishedAt: now }).where(eq(loadRuns.id, runId)).run();
  });
}

/**
 * Removes a profile. Its posts go too, unless they are saved, have a finished report,
 * or belong to another added profile. Returns the ids of deleted posts.
 */
export function removeProfile(db: Db, authorId: string): string[] {
  return db.transaction((tx) => {
    const ids = tx.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, authorId)).all().map((r) => r.id);
    if (tx.delete(profiles).where(eq(profiles.authorId, authorId)).run().changes === 0) {
      throw new NotFoundError(`Profile ${authorId} is not in your library`);
    }
    tx.delete(loadRuns).where(and(eq(loadRuns.kind, "profile"), eq(loadRuns.authorId, authorId))).run();
    if (ids.length === 0) return [];
    const orphans = tx
      .select({ id: posts.id })
      .from(posts)
      .where(and(
        inArray(posts.id, ids),
        sql`NOT EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = ${posts.id})`,
        sql`NOT EXISTS (SELECT 1 FROM reports r WHERE r.post_id = ${posts.id} AND r.markdown IS NOT NULL)`,
        sql`NOT EXISTS (SELECT 1 FROM profile_posts pp WHERE pp.post_id = ${posts.id})`,
      ))
      .all()
      .map((r) => r.id);
    for (const id of orphans) {
      tx.delete(posts).where(eq(posts.id, id)).run();
      tx.run(sql`DELETE FROM post_search WHERE post_id = ${id}`);
    }
    return orphans;
  });
}

export function failStaleLoads(db: Db, now = Date.now()) {
  db.update(loadRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "The app was restarted during the load." })
    .where(eq(loadRuns.status, "running"))
    .run();
}
```

Note on removal order: `profile_posts` rows of the removed profile are gone by cascade when `profiles` is deleted, so the third `NOT EXISTS` only sees other profiles. Deleting a post cascades `post_parts`, `post_collections`, `saved_posts` (none here) and a failed `reports` row.

- [ ] **Step 4: Media store `removeThumbs`**

In `apps/server/src/media/store.ts`: add `import { rm } from "node:fs/promises";` (merge with the existing import), add to the `MediaStore` interface:

```ts
  /** Deletes stored thumbnails; missing files are fine. */
  removeThumbs(ids: string[]): Promise<void>;
```

and to the returned object:

```ts
    removeThumbs: async (ids) => {
      await Promise.all(ids.map((id) => rm(pathFor("thumb", id), { force: true })));
    },
```

(Use whatever name the file's own path helper has; it is `pathFor` today.)

- [ ] **Step 5: Fail stale loads on startup**

In `apps/server/src/main.ts`, import `failStaleLoads` from `./sync/loads` and call `failStaleLoads(db);` right after `failStaleRuns(db);`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): profile loads, following updates and profile removal"
```

---

### Task 6: Server: queries for tabs, reports, profiles and following

**Files:**
- Modify: `packages/core/src/api.ts`, `packages/core/src/analyze/report.ts`, `packages/core/test/report.test.ts`
- Modify: `apps/server/src/queries.ts`, `apps/server/test/search.test.ts`, `apps/server/test/report-store.test.ts`
- Create: `apps/server/test/queries.test.ts`

**Interfaces:**
- Consumes: tables from Task 4, `FOLLOWING_UPDATED_AT` (Task 5).
- Produces (core `api.ts`):

```ts
export interface PostListItem { /* existing fields */ hasReport: boolean; saved: boolean; /** Usernames of added profiles that contain this post. */ profiles: string[] }
export interface PostsPage { items: PostListItem[]; nextCursor: string | null; total: number }
export interface PostsQuery { q?: string; author?: string; collection?: string; kind?: MediaKind; profile?: string; cursor?: string; limit: number }
export type AuthorScope = "saved" | "reports";
export type ReportSource = "saved" | "profile";
export interface ReportsQuery { q?: string; author?: string; kind?: MediaKind; source?: ReportSource; cursor?: string; limit: number }
export interface ReportListItem extends PostListItem { reportedAt: number; reportModel: string; summary: string }
export interface ReportsPage { items: ReportListItem[]; nextCursor: string | null; total: number }
export interface LoadRunInfo { id: number; mode: "add" | "older" | "refresh" | "following"; status: "running" | "done" | "error"; startedAt: number; finishedAt: number | null; pages: number; items: number; errorCode: string | null; errorMessage: string | null }
export interface ProfileItem { id: string; username: string; fullName: string | null; avatarUrl: string; postCount: number | null; loadedCount: number; hasOlder: boolean; isPrivate: boolean; addedAt: number; refreshedAt: number | null; run: LoadRunInfo | null }
export interface FollowingItem { id: string; username: string; fullName: string | null; avatarUrl: string; added: boolean }
export interface FollowingPage { items: FollowingItem[]; total: number; updatedAt: number | null; run: LoadRunInfo | null }
```

- Produces (server `queries.ts`): `listPosts(db, q: PostsQuery)`, `listAuthors(db, scope: AuthorScope)`, `listReports(db, q: ReportsQuery): ReportsPage`, `listProfiles(db): ProfileItem[]`, `listFollowing(db, o: { q?: string; limit: number }): FollowingPage`. `PostsQuery.report` is removed.
- Produces (core): `summaryPreview(markdown: string, max?: number): string`.

Cursors are strings: saved scope `"<sortKey>"`; profile scope and reports `"<number>.<postId>"`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/report.test.ts`:

```ts
import { summaryPreview } from "../src/analyze/report";

describe("summaryPreview", () => {
  it("returns the Summary section on one line", () => {
    const md = "# @a: title\n\n## Summary\nFirst line about **AI**.\nSecond `line`.\n\n## Key points\n- x\n";
    expect(summaryPreview(md)).toBe("First line about AI. Second line.");
  });
  it("cuts long text with an ellipsis", () => {
    expect(summaryPreview(`## Summary\n${"word ".repeat(100)}`, 20)).toBe("word word word word…");
  });
  it("falls back to the text without headings", () => {
    expect(summaryPreview("# Title\nPlain body\n## Post info\n- Link: x")).toBe("Plain body - Link: x");
  });
});
```

Also add `saved: false, profiles: []` to the `PostListItem` object literal in that file.

Create `apps/server/test/queries.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/db/open";
import { finishRun, ingestSavedPage, startRun } from "../src/sync/ingest";
import { finishLoadRun, ingestFollowingPage, ingestProfilePage, startFollowingRun, startProfileRun } from "../src/sync/loads";
import { finishReport, queueReport } from "../src/analyze/report-store";
import { listAuthors, listFollowing, listPosts, listProfiles, listReports } from "../src/queries";

const media = (pk: string, author: string, kind = 1, takenAt = Number(pk)) => ({
  pk, code: `C${pk}`, media_type: kind, taken_at: takenAt, user: { pk: author, username: `u${author}` },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] },
});
const opts = { language: "English", reportModel: "gpt-x", transcribeModel: "t" };
const report = (db: Db, id: string, text: string, at: number) => {
  queueReport(db, id, opts, at);
  finishReport(db, id, { markdown: `# t\n\n## Summary\n${text}\n`, frameCount: 1, transcribeModel: null }, at);
};

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  // Saved: 1 (author 5), 2 (author 77, also in profile 77).
  const run = startRun(db);
  ingestSavedPage(db, run.runId, { items: [{ media: media("1", "5") }, { media: media("2", "77") }], more_available: false });
  finishRun(db, run.runId, { ok: true });
  // Profile 77: 2, 3, 4 (3 and 4 same time).
  const p = startProfileRun(db, { mode: "add", payload: { data: { user: { id: "77", username: "u77" } } } }, 10);
  ingestProfilePage(db, p.runId, { items: [media("2", "77"), media("3", "77", 1, 50), media("4", "77", 2, 50)], more_available: true, next_max_id: "N" });
  finishLoadRun(db, p.runId, { ok: true }, 11);
});

describe("posts by scope", () => {
  it("saved scope shows only saved posts, with badges", () => {
    const page = listPosts(db, { limit: 50 });
    expect(page.items.map((p) => [p.id, p.saved, p.profiles])).toEqual([["1", true, []], ["2", true, ["u77"]]]);
  });

  it("profile scope shows the profile's posts newest first and pages without skipping equal times", () => {
    const a = listPosts(db, { profile: "77", limit: 1 });
    expect(a.items.map((p) => p.id)).toEqual(["4"]);
    expect(a.nextCursor).toBe("50.4");
    const b = listPosts(db, { profile: "77", limit: 1, cursor: a.nextCursor! });
    expect(b.items.map((p) => p.id)).toEqual(["3"]);
    const c = listPosts(db, { profile: "77", limit: 5, cursor: b.nextCursor! });
    expect(c.items.map((p) => [p.id, p.saved])).toEqual([["2", true]]);
    expect(listPosts(db, { profile: "77", limit: 5, kind: "video" }).items.map((p) => p.id)).toEqual(["4"]);
  });

  it("a report made from the profile shows on the same post in Saved", () => {
    report(db, "2", "zanzibar", 100);
    expect(listPosts(db, { limit: 50 }).items.find((p) => p.id === "2")!.hasReport).toBe(true);
  });
});

describe("reports list", () => {
  beforeEach(() => {
    report(db, "1", "about zanzibar", 100);
    report(db, "3", "about kilimanjaro", 200);
  });

  it("lists finished reports newest first with a summary", () => {
    const page = listReports(db, { limit: 50 });
    expect(page.items.map((r) => [r.id, r.summary, r.reportedAt, r.reportModel])).toEqual([
      ["3", "about kilimanjaro", 200, "gpt-x"],
      ["1", "about zanzibar", 100, "gpt-x"],
    ]);
    expect(page.total).toBe(2);
  });

  it("filters by text, author, source and kind", () => {
    expect(listReports(db, { limit: 50, q: "zanzib" }).items.map((r) => r.id)).toEqual(["1"]);
    expect(listReports(db, { limit: 50, author: "77" }).items.map((r) => r.id)).toEqual(["3"]);
    expect(listReports(db, { limit: 50, source: "saved" }).items.map((r) => r.id)).toEqual(["1"]);
    expect(listReports(db, { limit: 50, source: "profile" }).items.map((r) => r.id)).toEqual(["3"]);
    expect(listReports(db, { limit: 50, kind: "video" }).total).toBe(0);
  });

  it("pages with a cursor", () => {
    const a = listReports(db, { limit: 1 });
    expect(listReports(db, { limit: 1, cursor: a.nextCursor! }).items.map((r) => r.id)).toEqual(["1"]);
  });

  it("lists authors that have reports", () => {
    expect(listAuthors(db, "reports").map((a) => [a.id, a.count])).toEqual([["5", 1], ["77", 1]]);
    expect(listAuthors(db, "saved").map((a) => a.id).sort()).toEqual(["5", "77"]);
  });
});

describe("profiles and following", () => {
  it("lists profiles with loaded count and last run", () => {
    expect(listProfiles(db)).toEqual([expect.objectContaining({
      id: "77", username: "u77", loadedCount: 3, hasOlder: true, refreshedAt: 11, avatarUrl: "/media/avatars/77",
      run: expect.objectContaining({ status: "done", mode: "add", pages: 1, items: 3 }),
    })]);
  });

  it("filters the following list by name and marks added profiles", () => {
    const run = startFollowingRun(db);
    ingestFollowingPage(db, run.runId, { users: [
      { pk: "77", username: "u77" }, { pk: "8", username: "maria.codes", full_name: "Maria Lopes" }, { pk: "9", username: "kenji" },
    ] });
    finishLoadRun(db, run.runId, { ok: true }, 99);
    const all = listFollowing(db, { limit: 100 });
    expect(all.items.map((f) => [f.username, f.added])).toEqual([["u77", true], ["maria.codes", false], ["kenji", false]]);
    expect(all.updatedAt).toBe(99);
    expect(listFollowing(db, { q: "LOPES", limit: 100 }).items.map((f) => f.id)).toEqual(["8"]);
    expect(listFollowing(db, { q: "%", limit: 100 }).total).toBe(0);
    expect(listFollowing(db, { limit: 1 })).toMatchObject({ total: 3, items: [expect.objectContaining({ id: "77" })] });
  });
});
```

In `apps/server/test/report-store.test.ts`, replace the test `"shows hasReport, filters by it and searches report text"` with:

```ts
  it("shows hasReport and searches report text", () => {
    queueReport(db, id, opts, 1);
    finishReport(db, id, { markdown: "spoken word zanzibar", frameCount: 1, transcribeModel: null }, 2);
    expect(listPosts(db, { limit: 50 }).items.find((p) => p.id === id)!.hasReport).toBe(true);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).items.map((p) => p.id)).toEqual([id]);
    finishReport(db, id, { markdown: "now about kilimanjaro", frameCount: 1, transcribeModel: null }, 3);
    expect(listPosts(db, { limit: 50, q: "zanzibar" }).total).toBe(0);
  });
```

Fix any other test that passes a numeric `cursor` or `report: true` (`grep -rn "cursor:\|report: true" apps/server/test`): cursors become strings.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/test/queries.test.ts packages/core/test/report.test.ts`
Expected: FAIL — `listReports` / `summaryPreview` not exported.

- [ ] **Step 3: Update core types and `summaryPreview`**

Apply the `api.ts` changes from **Interfaces** above (add `saved`, `profiles` to `PostListItem`; change `PostsPage.nextCursor` to `string | null`; replace `PostsQuery`; add the new types).

Append to `packages/core/src/analyze/report.ts`:

```ts
/** The report's Summary as one plain line, cut to `max` characters, for lists. */
export function summaryPreview(md: string, max = 200): string {
  const section = /^##\s+Summary\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(md)?.[1] ?? md.replace(/^#.*$/gm, "");
  const text = section
    .split("\n")
    .map((l) => l.replace(/^[\s>*]+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\*\*|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
```

Check the fallback test: `"# Title\nPlain body\n## Post info\n- Link: x"` → headings removed → lines `Plain body`, `- Link: x` (leading `-` kept because only `>`, `*` and spaces are stripped) → `"Plain body - Link: x"`. The cut test: 20 chars → `"word word word word "` sliced to 19 → `"word word word word"` + `…`.

- [ ] **Step 4: Rewrite `queries.ts` list functions**

Replace the top of `apps/server/src/queries.ts` (imports through `getPostItem`) with:

```ts
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { expiresAtFromUrl, summaryPreview } from "@no-fomo/core";
import type {
  AuthorFacet, AuthorScope, CollectionFacet, FollowingPage, LoadRunInfo, MediaPart, PostListItem, PostMedia, PostsPage, PostsQuery,
  ProfileItem, ReportsPage, ReportsQuery, SyncStatus,
} from "@no-fomo/core";
import type { Db } from "./db/open";
import { getSetting } from "./db/settings";
import { authors, collections, following, loadRuns, postCollections, postParts, posts, profilePosts, profiles, reports, savedPosts } from "./db/schema";
import { lastFullAt, lastSuccessAt, latestRun } from "./sync/ingest";
import { FOLLOWING_UPDATED_AT } from "./sync/loads";

const visible = and(isNull(savedPosts.removedAt), isNull(savedPosts.removedRemotelyAt));
const hasReport = sql<number>`EXISTS (SELECT 1 FROM reports r WHERE r.post_id = ${posts.id} AND r.markdown IS NOT NULL)`;
const isSaved = sql<number>`EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = ${posts.id} AND s.removed_at IS NULL AND s.removed_remotely_at IS NULL)`;
const inAnyProfile = sql<number>`EXISTS (SELECT 1 FROM profile_posts pp WHERE pp.post_id = ${posts.id})`;
const profileNames = sql<string | null>`(SELECT group_concat(a.username, ' ') FROM profile_posts pp JOIN authors a ON a.id = pp.author_id WHERE pp.post_id = ${posts.id})`;
const itemColumns = { post: posts, username: authors.username, fullName: authors.fullName, hasReport, saved: isSaved, profileNames };
type ItemRow = { post: typeof posts.$inferSelect; username: string; fullName: string | null; hasReport: number; saved: number; profileNames: string | null };

/**
 * Turns free text into a safe FTS5 query: every word must match, each as a word start.
 * Only letters and digits survive, so user input can never form FTS syntax.
 */
export function ftsQuery(text: string | undefined): string | null {
  const words = (text ?? "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length ? words.slice(0, 12).map((w) => `"${w}"*`).join(" ") : null;
}

/** "<number>.<id>": a time plus the post id, so equal times never skip a post. */
function splitCursor(cursor: string | undefined): { at: number; id: string } | null {
  const m = /^(\d+)\.(\d+)$/.exec(cursor ?? "");
  return m ? { at: Number(m[1]), id: m[2]! } : null;
}
const after = (time: SQL | typeof posts.takenAt, id: SQL | typeof posts.id, c: { at: number; id: string } | null) =>
  c ? sql`(${time} < ${c.at} OR (${time} = ${c.at} AND ${id} < ${c.id}))` : undefined;

function paged<R extends ItemRow, T>(rows: R[], limit: number, map: (r: R) => T, cursorOf: (r: R) => string, total: number) {
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return { items: page.map(map), nextCursor: more ? cursorOf(page.at(-1)!) : null, total };
}

export function listPosts(db: Db, q: PostsQuery): PostsPage {
  const match = ftsQuery(q.q);
  const common = and(
    match
      ? sql`(${posts.id} IN (SELECT post_id FROM post_search WHERE post_search MATCH ${match}) OR ${posts.id} IN (SELECT post_id FROM report_search WHERE report_search MATCH ${match}))`
      : undefined,
    q.author ? eq(posts.authorId, q.author) : undefined,
    q.kind ? eq(posts.kind, q.kind) : undefined,
  );

  if (q.profile) {
    const where = and(common, inArray(posts.id, db.select({ id: profilePosts.postId }).from(profilePosts).where(eq(profilePosts.authorId, q.profile))));
    const total = db.select({ n: count() }).from(posts).where(where).get()?.n ?? 0;
    const rows = db
      .select(itemColumns)
      .from(posts)
      .innerJoin(authors, eq(authors.id, posts.authorId))
      .where(and(where, after(posts.takenAt, posts.id, splitCursor(q.cursor))))
      .orderBy(desc(posts.takenAt), desc(posts.id))
      .limit(q.limit + 1)
      .all();
    return paged(rows, q.limit, toItem, (r) => `${r.post.takenAt}.${r.post.id}`, total);
  }

  const where = and(
    common,
    visible,
    q.collection
      ? inArray(posts.id, db.select({ id: postCollections.postId }).from(postCollections).where(eq(postCollections.collectionId, q.collection)))
      : undefined,
  );
  const total = db.select({ n: count() }).from(posts).innerJoin(savedPosts, eq(savedPosts.postId, posts.id)).where(where).get()?.n ?? 0;
  const cursor = q.cursor !== undefined && /^\d+$/.test(q.cursor) ? Number(q.cursor) : undefined;
  const rows = db
    .select({ ...itemColumns, key: savedPosts.sortKey })
    .from(posts)
    .innerJoin(savedPosts, eq(savedPosts.postId, posts.id))
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(and(where, cursor !== undefined ? lt(savedPosts.sortKey, cursor) : undefined))
    .orderBy(desc(savedPosts.sortKey))
    .limit(q.limit + 1)
    .all();
  return paged(rows, q.limit, toItem, (r) => String(r.key), total);
}

function toItem(r: ItemRow): PostListItem {
  const p = r.post;
  return {
    id: p.id, code: p.code, kind: p.kind,
    author: { id: p.authorId, username: r.username, fullName: r.fullName },
    caption: p.caption, hashtags: p.hashtags, takenAt: p.takenAt, durationSec: p.durationSec,
    likeCount: p.likeCount, viewCount: p.viewCount, commentCount: p.commentCount,
    accessibilityCaption: p.accessibilityCaption, locationName: p.locationName,
    musicTitle: p.musicTitle, musicArtist: p.musicArtist, width: p.width, height: p.height,
    thumbUrl: `/media/thumbs/${p.id}`,
    permalink: `https://www.instagram.com/${p.productType === "clips" ? "reel" : "p"}/${p.code}/`,
    hasReport: Boolean(r.hasReport),
    saved: Boolean(r.saved),
    profiles: r.profileNames ? r.profileNames.split(" ") : [],
  };
}

export function getPostItem(db: Db, id: string): PostListItem | null {
  const r = db.select(itemColumns).from(posts).innerJoin(authors, eq(authors.id, posts.authorId)).where(eq(posts.id, id)).get();
  return r ? toItem(r) : null;
}

const reportedAt = sql<number>`coalesce(${reports.finishedAt}, ${reports.createdAt})`;

export function listReports(db: Db, q: ReportsQuery): ReportsPage {
  const match = ftsQuery(q.q);
  const where = and(
    isNotNull(reports.markdown),
    match ? sql`${reports.postId} IN (SELECT post_id FROM report_search WHERE report_search MATCH ${match})` : undefined,
    q.author ? eq(posts.authorId, q.author) : undefined,
    q.kind ? eq(posts.kind, q.kind) : undefined,
    q.source === "saved" ? isSaved : q.source === "profile" ? inAnyProfile : undefined,
  );
  const total = db.select({ n: count() }).from(reports).innerJoin(posts, eq(posts.id, reports.postId)).where(where).get()?.n ?? 0;
  const rows = db
    .select({ ...itemColumns, reportedAt, markdown: reports.markdown, reportModel: reports.reportModel })
    .from(reports)
    .innerJoin(posts, eq(posts.id, reports.postId))
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(and(where, after(reportedAt, posts.id, splitCursor(q.cursor))))
    .orderBy(desc(reportedAt), desc(posts.id))
    .limit(q.limit + 1)
    .all();
  return paged(
    rows,
    q.limit,
    (r) => ({ ...toItem(r), reportedAt: r.reportedAt, reportModel: r.reportModel, summary: summaryPreview(r.markdown ?? "") }),
    (r) => `${r.reportedAt}.${r.post.id}`,
    total,
  );
}
```

Keep `getPostMedia` unchanged. Replace `listAuthors` with:

```ts
export function listAuthors(db: Db, scope: AuthorScope = "saved"): AuthorFacet[] {
  const n = count(posts.id);
  const base = db.select({ id: authors.id, username: authors.username, fullName: authors.fullName, count: n }).from(authors);
  const joined =
    scope === "reports"
      ? base.innerJoin(posts, eq(posts.authorId, authors.id)).innerJoin(reports, and(eq(reports.postId, posts.id), isNotNull(reports.markdown)))
      : base.innerJoin(posts, eq(posts.authorId, authors.id)).innerJoin(savedPosts, and(eq(savedPosts.postId, posts.id), visible));
  return joined
    .groupBy(authors.id)
    .orderBy(desc(n), asc(authors.username))
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}` }));
}
```

Keep `listCollections` (from Task 4) and `syncStatus`. Append:

```ts
const runInfo = (r: typeof loadRuns.$inferSelect | undefined): LoadRunInfo | null =>
  r ? {
    id: r.id, mode: r.mode, status: r.status, startedAt: r.startedAt, finishedAt: r.finishedAt,
    pages: r.pages, items: r.items, errorCode: r.errorCode, errorMessage: r.errorMessage,
  } : null;

export function listProfiles(db: Db): ProfileItem[] {
  const loaded = sql<number>`(SELECT count(*) FROM profile_posts pp WHERE pp.author_id = ${profiles.authorId})`;
  return db
    .select({ p: profiles, username: authors.username, fullName: authors.fullName, loaded })
    .from(profiles)
    .innerJoin(authors, eq(authors.id, profiles.authorId))
    .orderBy(desc(profiles.addedAt))
    .all()
    .map((r) => ({
      id: r.p.authorId, username: r.username, fullName: r.fullName, avatarUrl: `/media/avatars/${r.p.authorId}`,
      postCount: r.p.postCount, loadedCount: r.loaded, hasOlder: r.p.olderCursor !== null, isPrivate: r.p.isPrivate,
      addedAt: r.p.addedAt, refreshedAt: r.p.refreshedAt,
      run: runInfo(db.select().from(loadRuns).where(and(eq(loadRuns.kind, "profile"), eq(loadRuns.authorId, r.p.authorId))).orderBy(desc(loadRuns.id)).limit(1).get()),
    }));
}

/** Escapes LIKE wildcards so typed text matches literally. */
const likePattern = (text: string) => `%${text.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listFollowing(db: Db, o: { q?: string; limit: number }): FollowingPage {
  const text = o.q?.trim().replace(/^@/, "");
  const where = text
    ? sql`(lower(${authors.username}) LIKE ${likePattern(text)} ESCAPE '\\' OR lower(coalesce(${authors.fullName}, '')) LIKE ${likePattern(text)} ESCAPE '\\')`
    : undefined;
  const total = db.select({ n: count() }).from(following).innerJoin(authors, eq(authors.id, following.authorId)).where(where).get()?.n ?? 0;
  const added = sql<number>`EXISTS (SELECT 1 FROM profiles p WHERE p.author_id = ${following.authorId})`;
  const items = db
    .select({ id: authors.id, username: authors.username, fullName: authors.fullName, added })
    .from(following)
    .innerJoin(authors, eq(authors.id, following.authorId))
    .where(where)
    .orderBy(asc(following.position))
    .limit(o.limit)
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}`, added: Boolean(a.added) }));
  const updated = getSetting(db, FOLLOWING_UPDATED_AT);
  return {
    items, total, updatedAt: updated ? Number(updated) : null,
    run: runInfo(db.select().from(loadRuns).where(eq(loadRuns.kind, "following")).orderBy(desc(loadRuns.id)).limit(1).get()),
  };
}
```

Note: `queries.ts` imports `loads.ts` and `loads.ts` imports `ingest.ts`; `ingest.ts` must not import `queries.ts` (it does not today).

`lower()` in SQLite only folds ASCII. That is fine for usernames; for full names in other scripts the owner types the same letters as stored.

- [ ] **Step 5: Fix callers**

`grep -rn "listAuthors\|nextCursor\|report:" apps/server/src` — the HTTP app passes the old `report` field; leave route changes to Task 7 but make it compile now: in `app.ts` remove `report` from `PostsQuerySchema`, change `cursor` to `z.string().regex(/^\d{1,20}(\.\d{1,30})?$/).optional()` and add `profile: Id.optional()`.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: server and core PASS. Web typecheck may fail on `report` / numeric cursor in `apps/web/app/lib/filters.ts` and `library.tsx`. If so, apply the minimum to compile: in `library.tsx` change `initialPageParam: null as number | null` to `null as string | null`, and in `filters.ts` change `cursor: number | null` to `cursor: string | null`. The full web rework is Task 9–10.

- [ ] **Step 7: Commit**

```bash
git add packages/core apps/server apps/web
git commit -m "feat(server): post scopes, reports list, profiles and following queries"
```

---

### Task 7: Server: HTTP routes

**Files:**
- Modify: `apps/server/src/http/app.ts`
- Test: `apps/server/test/app.test.ts`

**Interfaces:**
- Consumes: Task 5 functions, Task 6 queries.
- Produces (HTTP):
  - `POST /api/sync/profiles/runs` body `{ mode: "add", payload }` or `{ mode: "older" | "refresh", authorId }` → `201 { runId, authorId, cursor }`; `409 { error: LoadErrorCode }`; `404` unknown profile.
  - `POST /api/sync/profiles/runs/:id/page` body `{ payload }` → `{ stop, newCount }`
  - `POST /api/sync/following/runs` → `201 { runId }`
  - `POST /api/sync/following/runs/:id/page` body `{ payload }` → `{ seen }`
  - `POST /api/sync/loads/:id/finish` body like sync finish → `{ ok: true }`
  - `GET /api/posts?…&profile=<id>&cursor=<string>`
  - `GET /api/authors?scope=saved|reports`
  - `GET /api/reports?q&author&kind&source&cursor&limit` → `ReportsPage`
  - `GET /api/profiles` → `ProfileItem[]`
  - `POST /api/profiles/:id/remove` (app page only) → `{ ok: true, removed: number }`
  - `GET /api/following?q&limit` → `FollowingPage`

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/test/app.test.ts` (it already has `post`, `get`, `EXT`, `HOST`). At the top add a fixture-free profile payload:

```ts
const profileInfo = { data: { user: { id: "77", username: "nasa", is_private: false, followed_by_viewer: false } } };
const feedPage = {
  items: [{ pk: "500", code: "P500", media_type: 1, taken_at: 5, user: { pk: "77", username: "nasa" },
    image_versions2: { candidates: [{ width: 480, height: 600, url: "https://scontent.cdninstagram.com/500.jpg" }] } }],
  more_available: false,
};
const APP = "http://localhost:4747";
```

and a new block:

```ts
describe("profiles, following and reports API", () => {
  it("adds a profile through the sync routes and lists its posts", async () => {
    const start = await post("/api/sync/profiles/runs", { mode: "add", payload: profileInfo });
    expect(start.status).toBe(201);
    const { runId, authorId } = (await start.json()) as { runId: number; authorId: string };
    expect(authorId).toBe("77");
    expect(await (await post(`/api/sync/profiles/runs/${runId}/page`, { payload: feedPage })).json()).toEqual({ stop: false, newCount: 1 });
    expect((await post(`/api/sync/loads/${runId}/finish`, { ok: true })).status).toBe(200);

    const profiles = (await (await get("/api/profiles")).json()) as Array<{ id: string; loadedCount: number }>;
    expect(profiles.map((p) => [p.id, p.loadedCount])).toEqual([["77", 1]]);
    const page = (await (await get("/api/posts?profile=77")).json()) as PostsPage;
    expect(page.items.map((p) => p.id)).toEqual(["500"]);
    expect(((await (await get("/api/posts")).json()) as PostsPage).total).toBe(0);
  });

  it("answers load errors with their code", async () => {
    const res = await post("/api/sync/profiles/runs", { mode: "add", payload: { data: { user: { ...profileInfo.data.user, is_private: true } } } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "private_profile" });
    expect((await post("/api/sync/profiles/runs", { mode: "older", authorId: "404" })).status).toBe(404);
    expect((await post("/api/sync/profiles/runs", { mode: "older", authorId: "../x" })).status).toBe(400);
  });

  it("removes a profile only from the app page", async () => {
    const { runId } = (await (await post("/api/sync/profiles/runs", { mode: "add", payload: profileInfo })).json()) as { runId: number };
    await post(`/api/sync/profiles/runs/${runId}/page`, { payload: feedPage });
    expect((await post("/api/profiles/77/remove", {})).status).toBe(403);
    const res = await post("/api/profiles/77/remove", {}, APP);
    expect(await res.json()).toEqual({ ok: true, removed: 1 });
    expect(await (await get("/api/profiles")).json()).toEqual([]);
  });

  it("updates and filters the following list", async () => {
    const { runId } = (await (await post("/api/sync/following/runs", {})).json()) as { runId: number };
    expect(await (await post(`/api/sync/following/runs/${runId}/page`, { payload: { users: [{ pk: "8", username: "maria" }] } })).json()).toEqual({ seen: 1 });
    await post(`/api/sync/loads/${runId}/finish`, { ok: true });
    const page = (await (await get("/api/following?q=mar")).json()) as { items: Array<{ id: string }>; total: number };
    expect(page).toMatchObject({ total: 1, items: [{ id: "8" }] });
  });

  it("lists reports and report authors", async () => {
    await syncFixtures();
    const res = await get("/api/reports?source=saved&limit=10");
    expect(await res.json()).toEqual({ items: [], nextCursor: null, total: 0 });
    expect((await get("/api/reports?source=nope")).status).toBe(400);
    expect((await get("/api/authors?scope=reports")).status).toBe(200);
  });
});
```

Also update any existing test in this file that used `?report=1` or a numeric `cursor` value.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/server/test/app.test.ts`
Expected: FAIL — 404 on the new routes.

- [ ] **Step 3: Implement the routes**

In `apps/server/src/http/app.ts`:

Imports: add `listFollowing, listProfiles, listReports` to the queries import; add

```ts
import {
  failStaleLoads, finishLoadRun, ingestFollowingPage, ingestProfilePage, LoadError, removeProfile, startFollowingRun, startProfileRun,
} from "../sync/loads";
```

(drop `failStaleLoads` from this import; it is only used in `main.ts`).

Schemas (next to the others):

```ts
const Kind = z.enum(["image", "video", "carousel"]);
const Cursor = z.string().regex(/^\d{1,20}(\.\d{1,30})?$/);
const PostsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  author: Id.optional(),
  collection: Id.optional(),
  kind: Kind.optional(),
  profile: Id.optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
const ReportsQuerySchema = z.object({
  q: z.string().max(200).optional(),
  author: Id.optional(),
  kind: Kind.optional(),
  source: z.enum(["saved", "profile"]).optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
const FollowingQuery = z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
const AuthorsQuery = z.object({ scope: z.enum(["saved", "reports"]).default("saved") });
const ProfileStartSchema = z.union([
  z.object({ mode: z.literal("add"), payload: z.unknown() }),
  z.object({ mode: z.enum(["older", "refresh"]), authorId: Id }),
]);
```

In `app.onError`, before the `AnalyzeError` line:

```ts
    if (err instanceof LoadError) return c.json({ error: err.code }, 409);
```

Routes (after `/api/sync/media/:id`):

```ts
  app.post("/api/sync/profiles/runs", async (c) => {
    const r = startProfileRun(db, ProfileStartSchema.parse(await c.req.json()));
    media.enqueue(r.jobs);
    return c.json({ runId: r.runId, authorId: r.authorId, cursor: r.cursor }, 201);
  });

  app.post("/api/sync/profiles/runs/:id/page", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "profile", payload);
    const r = ingestProfilePage(db, runId, payload);
    media.enqueue(r.jobs);
    return c.json({ stop: r.stop, newCount: r.newCount });
  });

  app.post("/api/sync/following/runs", (c) => c.json(startFollowingRun(db), 201));

  app.post("/api/sync/following/runs/:id/page", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "following", payload);
    return c.json(ingestFollowingPage(db, runId, payload));
  });

  app.post("/api/sync/loads/:id/finish", async (c) => {
    finishLoadRun(db, RunId.parse(c.req.param("id")), FinishBody.parse(await c.req.json()));
    return c.json({ ok: true });
  });
```

`dump` file names use the run id; profile/following run ids can equal sync run ids, so prefix: change the two `dump(runId, …)` calls above to `dump(runId, "load-profile", payload)` and `dump(runId, "load-following", payload)`.

Replace the `/api/authors` route and add the read routes (before the `app.all("/api/*")` catch-all):

```ts
  app.get("/api/authors", (c) => c.json(listAuthors(db, AuthorsQuery.parse(c.req.query()).scope)));
  app.get("/api/reports", (c) => c.json(listReports(db, ReportsQuerySchema.parse(c.req.query()))));
  app.get("/api/profiles", (c) => c.json(listProfiles(db)));
  app.post("/api/profiles/:id/remove", async (c) => {
    if (fromExtension(c)) return c.json({ error: "forbidden" }, 403);
    const ids = removeProfile(db, Id.parse(c.req.param("id")));
    await media.removeThumbs(ids);
    return c.json({ ok: true, removed: ids.length });
  });
  app.get("/api/following", (c) => c.json(listFollowing(db, FollowingQuery.parse(c.req.query()))));
```

The empty-body POST from the extension-origin test still sends `content-type: application/json`, so the security middleware lets it through to the 403.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS (web typecheck as left by Task 6).

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): routes for profiles, following and reports"
```

---

### Task 8: Extension: search, profile load, following update

**Files:**
- Create: `apps/extension/src/tab-jobs.ts`, `apps/extension/test/tab-jobs.test.ts`
- Modify: `apps/extension/src/external.ts`, `apps/extension/src/relay-sink.ts`, `apps/extension/entrypoints/instagram.content.ts`
- Test: `apps/extension/test/external.test.ts`

**Interfaces:**
- Consumes: `runProfileLoad`, `runFollowingUpdate`, `ProfileSink`, `FollowingSink`, `ProfileLoadRequest`, `parseUserSearch`, `UserSuggestion`, `IgError` (core).
- Produces (external messages the web app sends):
  - `{ type: "profile:search", query: string }` → `{ ok: true, users: UserSuggestion[] }` | `{ ok: false, error }`
  - `{ type: "profile:load", mode: "add", username }` or `{ type: "profile:load", mode: "older" | "refresh", authorId }` → `{ ok: true, authorId }` | `{ ok: false, error }`
  - `{ type: "following:update" }` → `{ ok: true }` | `{ ok: false, error }`
  - Errors: `bad_message`, `busy`, Instagram codes (`login_required`, `rate_limited`, `not_found`, …), server codes (`profile_not_found`, `private_profile`, `no_more_posts`).
- Produces (tab messages): `{ type: "profile:search"; query }`, `{ type: "profile:load"; serverUrl; request: ProfileLoadRequest }`, `{ type: "following:update"; serverUrl }`.
- Produces: `createProfileSink(serverUrl, send): ProfileSink`, `createFollowingSink(serverUrl, send): FollowingSink`, `createTabJobs(deps): { handle(msg: unknown): Promise<unknown> | null }`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/extension/test/external.test.ts`:

```ts
  it("passes profile search, load and following update to the Instagram tab", async () => {
    const d = deps({ sendToTab: vi.fn(async () => ({ ok: true, users: [] })) });
    await handleExternalMessage({ type: "profile:search", query: " nasa " }, "http://localhost:4747/profiles", d);
    await handleExternalMessage({ type: "profile:load", mode: "add", username: "nasa" }, "http://localhost:4747/", d);
    await handleExternalMessage({ type: "profile:load", mode: "older", authorId: "77" }, "http://localhost:4747/", d);
    await handleExternalMessage({ type: "following:update" }, "http://localhost:4747/", d);
    expect((d.sendToTab as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1])).toEqual([
      { type: "profile:search", query: "nasa" },
      { type: "profile:load", serverUrl: "http://localhost:4747", request: { mode: "add", username: "nasa" } },
      { type: "profile:load", serverUrl: "http://localhost:4747", request: { mode: "older", authorId: "77" } },
      { type: "following:update", serverUrl: "http://localhost:4747" },
    ]);
  });

  it("rejects bad profile messages", async () => {
    const d = deps();
    const bad = [
      { type: "profile:search", query: "x" },
      { type: "profile:search", query: "a".repeat(61) },
      { type: "profile:load", mode: "add", username: "../etc" },
      { type: "profile:load", mode: "older", authorId: "abc" },
      { type: "profile:load", mode: "all", username: "nasa" },
    ];
    for (const m of bad) expect(await handleExternalMessage(m, "http://localhost:4747/", d)).toEqual({ ok: false, error: "bad_message" });
    expect(d.sendToTab).not.toHaveBeenCalled();
  });
```

Create `apps/extension/test/tab-jobs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo/core";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

const unused = async () => { throw new Error("not used"); };
function setup(over: Partial<IgClient> = {}, relay?: (m: RelayMessage) => RelayResponse) {
  const ig: IgClient = { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
  const sent: RelayMessage[] = [];
  const send = vi.fn(async (m: RelayMessage) => { sent.push(m); return relay ? relay(m) : ({ ok: true, data: {} } as RelayResponse); });
  return { jobs: createTabJobs({ ig, send, viewerId: () => "42" }), sent };
}

describe("tab jobs", () => {
  it("answers a search with parsed users", async () => {
    const { jobs } = setup({ searchUsers: async () => ({ users: [{ user: { pk: "1", username: "one" } }] }) });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({
      ok: true, users: [{ id: "1", username: "one", fullName: null, avatarUrl: null, isPrivate: false, isVerified: false }],
    });
  });

  it("returns the Instagram error code of a failed search", async () => {
    const { jobs } = setup({ searchUsers: async () => { throw new IgError("login_required", "x"); } });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({ ok: false, error: "login_required" });
  });

  it("answers a profile load once it started, and refuses a second load meanwhile", async () => {
    let releaseFeed!: () => void;
    const feedGate = new Promise<void>((r) => { releaseFeed = r; });
    const { jobs, sent } = setup(
      {
        profileInfo: async () => ({ data: { user: { id: "77", username: "nasa" } } }),
        userFeed: async () => { await feedGate; return { items: [], more_available: false }; },
      },
      (m) => (m.path === "/api/sync/profiles/runs" ? { ok: true, data: { runId: 3, authorId: "77", cursor: null } } : { ok: true, data: { stop: false } }),
    );
    const msg = { type: "profile:load", serverUrl: "http://localhost:4747", request: { mode: "add", username: "nasa" } };
    expect(await jobs.handle(msg)).toEqual({ ok: true, authorId: "77" });
    expect(await jobs.handle(msg)).toEqual({ ok: false, error: "busy" });
    releaseFeed();
    await vi.waitFor(() => expect(sent.map((m) => m.path)).toContain("/api/sync/loads/3/finish"));
    expect(sent.map((m) => m.path)).toEqual(["/api/sync/profiles/runs", "/api/sync/profiles/runs/3/page", "/api/sync/loads/3/finish"]);
  });

  it("passes the server's error code when a load cannot start", async () => {
    const { jobs } = setup(
      { profileInfo: async () => ({ data: { user: { id: "77", username: "x", is_private: true } } }) },
      () => ({ ok: false, error: "private_profile" }),
    );
    expect(await jobs.handle({ type: "profile:load", serverUrl: "http://localhost:4747", request: { mode: "add", username: "x" } })).toEqual({ ok: false, error: "private_profile" });
  });

  it("ignores messages it does not know", () => {
    expect(setup().jobs.handle({ type: "sync:run" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/extension`
Expected: FAIL — `unknown_type` for the new messages; `../src/tab-jobs` not found.

- [ ] **Step 3: Implement external message handling**

Replace `apps/extension/src/external.ts` with:

```ts
import type { PostMedia, ProfileLoadRequest, SyncMode, UserSuggestion } from "@no-fomo/core";
import { isAppOrigin } from "./origins";

export type ExtResponse =
  | { ok: true; version?: string; media?: PostMedia; users?: UserSuggestion[]; authorId?: string }
  | { ok: false; error: string };
export type TabMessage =
  | { type: "sync:run"; serverUrl: string; mode: SyncMode }
  | { type: "media:fetch"; serverUrl: string; id: string }
  | { type: "profile:search"; query: string }
  | { type: "profile:load"; serverUrl: string; request: ProfileLoadRequest }
  | { type: "following:update"; serverUrl: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: TabMessage): Promise<unknown>;
}

const ID = /^\d{1,30}$/;
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const TYPES = new Set(["sync:start", "media:refresh", "profile:search", "profile:load", "following:update"]);

/** Checks a message from the app page and turns it into a message for the Instagram tab. Null means malformed. */
function toTabMessage(m: Record<string, unknown>, serverUrl: string): TabMessage | null {
  switch (m.type) {
    case "sync:start":
      if (m.mode !== undefined && m.mode !== "incremental" && m.mode !== "full") return null;
      return { type: "sync:run", serverUrl, mode: (m.mode as SyncMode | undefined) ?? "incremental" };
    case "media:refresh":
      return typeof m.id === "string" && ID.test(m.id) ? { type: "media:fetch", serverUrl, id: m.id } : null;
    case "profile:search": {
      const query = typeof m.query === "string" ? m.query.trim() : "";
      return query.length >= 2 && query.length <= 60 ? { type: "profile:search", query } : null;
    }
    case "profile:load":
      if (m.mode === "add" && typeof m.username === "string" && USERNAME.test(m.username)) {
        return { type: "profile:load", serverUrl, request: { mode: "add", username: m.username } };
      }
      if ((m.mode === "older" || m.mode === "refresh") && typeof m.authorId === "string" && ID.test(m.authorId)) {
        return { type: "profile:load", serverUrl, request: { mode: m.mode, authorId: m.authorId } };
      }
      return null;
    case "following:update":
      return { type: "following:update", serverUrl };
    default:
      return null;
  }
}

export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const m = msg as Record<string, unknown>;
  if (m.type === "ping") return { ok: true, version: deps.version };
  if (typeof m.type !== "string" || !TYPES.has(m.type)) return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  if (!isAppOrigin(senderUrl)) return { ok: false, error: "untrusted_sender" };

  const tabMsg = toTabMessage(m, new URL(senderUrl).origin);
  if (!tabMsg) return { ok: false, error: "bad_message" };
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, tabMsg)) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
```

Check existing external tests still pass (sync:start with bad mode → `bad_message`; media:refresh with bad id → `bad_message`).

- [ ] **Step 4: Sinks and tab jobs**

Append to `apps/extension/src/relay-sink.ts`:

```ts
import type { FollowingSink, ProfileSink } from "@no-fomo/core";

function poster(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>) {
  return async <T>(path: string, body: unknown): Promise<T> => {
    const r = await send({ type: "relay", serverUrl, path, body });
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  };
}

export function createProfileSink(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>): ProfileSink {
  const post = poster(serverUrl, send);
  return {
    startRun: (body) => post("/api/sync/profiles/runs", body),
    page: (runId, payload) => post(`/api/sync/profiles/runs/${runId}/page`, { payload }),
    finishRun: async (runId, result) => { await post(`/api/sync/loads/${runId}/finish`, result); },
  };
}

export function createFollowingSink(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>): FollowingSink {
  const post = poster(serverUrl, send);
  return {
    startRun: () => post("/api/sync/following/runs", {}),
    page: (runId, payload) => post(`/api/sync/following/runs/${runId}/page`, { payload }),
    finishRun: async (runId, result) => { await post(`/api/sync/loads/${runId}/finish`, result); },
  };
}
```

(Merge the import into the file's import block; `createRelaySink` may use `poster` too, but leave it as is.)

Create `apps/extension/src/tab-jobs.ts`:

```ts
import {
  IgError, parseUserSearch, runFollowingUpdate, runProfileLoad, type IgClient, type LoadStart, type ProfileLoadRequest,
} from "@no-fomo/core";
import { createFollowingSink, createProfileSink } from "./relay-sink";
import type { RelayMessage, RelayResponse } from "./relay";

type Msg = { type?: unknown; query?: unknown; serverUrl?: unknown; request?: unknown };

/**
 * Profile search, profile loads and following updates in the Instagram tab.
 * One load of each kind at a time; the request gate keeps all Instagram calls apart.
 */
export function createTabJobs(deps: { ig: IgClient; send: (m: RelayMessage) => Promise<RelayResponse>; viewerId: () => string | null }) {
  const busy = { profile: false, following: false };

  /** Answers as soon as the job started (or failed to), then lets it run. */
  function startJob(kind: keyof typeof busy, run: (onStart: (s: LoadStart) => void) => Promise<unknown>): Promise<LoadStart> {
    if (busy[kind]) return Promise.resolve({ ok: false, error: "busy" });
    busy[kind] = true;
    return new Promise<LoadStart>((resolve) => {
      void run(resolve)
        .then((r) => console.info(`[no-fomo] ${kind} load finished`, r))
        .finally(() => { busy[kind] = false; });
    });
  }

  return {
    handle(raw: unknown): Promise<unknown> | null {
      const m = (raw ?? {}) as Msg;
      if (m.type === "profile:search" && typeof m.query === "string") {
        return deps.ig.searchUsers(m.query).then(
          (r) => ({ ok: true, users: parseUserSearch(r) }),
          (e: unknown) => ({ ok: false, error: e instanceof IgError ? e.code : "internal" }),
        );
      }
      if (typeof m.serverUrl !== "string") return null;
      const serverUrl = m.serverUrl;
      if (m.type === "profile:load" && m.request) {
        const request = m.request as ProfileLoadRequest;
        return startJob("profile", (onStart) => runProfileLoad({ ig: deps.ig, sink: createProfileSink(serverUrl, deps.send), request, onStart }));
      }
      if (m.type === "following:update") {
        return startJob("following", (onStart) =>
          runFollowingUpdate({ ig: deps.ig, sink: createFollowingSink(serverUrl, deps.send), viewerId: deps.viewerId(), onStart }));
      }
      return null;
    },
  };
}
```

- [ ] **Step 5: Wire the content script**

In `apps/extension/entrypoints/instagram.content.ts`:

Replace `readCsrf` with a cookie reader and keep `readCsrf` using it:

```ts
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
const readCsrf = () => readCookie("csrftoken");
```

Import `createTabJobs` from `../src/tab-jobs`. After `const send = …`, add:

```ts
    const jobs = createTabJobs({ ig, send, viewerId: () => readCookie("ds_user_id") });
```

At the start of the `onMessage` listener body (before the `serverUrl` check), add:

```ts
      const job = jobs.handle(msg);
      if (job) {
        void job.then(sendResponse);
        return true;
      }
```

Change `TabMsg` to `type TabMsg = { type?: string; serverUrl?: string; mode?: SyncMode; id?: string; query?: string; request?: unknown };`.

- [ ] **Step 6: Run tests, typecheck, build**

Run: `pnpm test && pnpm typecheck && pnpm ext:build`
Expected: PASS and the extension builds.

- [ ] **Step 7: Commit**

```bash
git add apps/extension
git commit -m "feat(extension): profile search, profile loads and following updates"
```

---

### Task 9: Web: data helpers

**Files:**
- Modify: `apps/web/app/lib/api.ts`, `apps/web/app/lib/extension.ts`, `apps/web/app/lib/filters.ts`
- Create: `apps/web/app/lib/profile-input.ts`, `apps/web/app/lib/use-post-list.ts`
- Test: `apps/web/test/filters.test.ts`, `apps/web/test/extension.test.ts`, create `apps/web/test/profile-input.test.ts`

**Interfaces:**
- Produces:

```ts
// filters.ts
export interface Filters { q: string | null; author: string | null; collection: string | null; kind: MediaKind | null; source: ReportSource | null }
export const NO_FILTERS: Filters;
export function readFilters(sp: URLSearchParams): Filters;
export function writeFilters(sp: URLSearchParams, patch: Partial<Filters>): URLSearchParams;
export function postsQueryString(f: Filters, cursor: string | null, o?: { profile?: string; limit?: number }): string;
export function reportsQueryString(f: Filters, cursor: string | null, limit?: number): string;
export const hasFilters: (f: Filters) => boolean;
// profile-input.ts
export function parseProfileInput(text: string): string | null;
// extension.ts
export const searchInstagram: (extId: string, query: string) => Promise<ExtResponse | null>;
export const loadProfile: (extId: string, r: ProfileLoadRequest) => Promise<ExtResponse | null>;
export const updateFollowing: (extId: string) => Promise<ExtResponse | null>;
export function loadErrorText(code: string): string;
// api.ts
api.authors(scope?: AuthorScope); api.posts(qs); api.reports(qs); api.profiles(); api.removeProfile(id); api.following(q: string | null);
// use-post-list.ts
export function usePostList<T extends { id: string }>(o: { queryKey: unknown[]; fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null; total: number }>; enabled?: boolean }): {
  query: UseInfiniteQueryResult<InfiniteData<{ items: T[]; nextCursor: string | null; total: number }>>;
  items: T[]; total: number | undefined; open: T | null; prev: T | null; next: T | null;
  setPost: (id: string | null, replace?: boolean) => void;
};
```

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/test/filters.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { hasFilters, NO_FILTERS, postsQueryString, readFilters, reportsQueryString, writeFilters } from "../app/lib/filters";

describe("filters", () => {
  it("reads valid values and drops invalid ones", () => {
    expect(readFilters(new URLSearchParams("q=ramen&author=111&collection=179&kind=video&source=profile"))).toEqual({ q: "ramen", author: "111", collection: "179", kind: "video", source: "profile" });
    expect(readFilters(new URLSearchParams("q=%20%20&author=../x&kind=gif&source=all&report=1"))).toEqual(NO_FILTERS);
  });

  it("writes patches and removes empty values, keeping other params", () => {
    const sp = writeFilters(new URLSearchParams("author=1&post=9"), { author: null, kind: "image" });
    expect(writeFilters(new URLSearchParams(""), { q: "  " }).toString()).toBe("");
    expect(sp.toString()).toBe("post=9&kind=image");
    expect(writeFilters(new URLSearchParams(""), { source: "saved" }).toString()).toBe("source=saved");
  });

  it("builds the posts query, with a profile scope", () => {
    const f = { ...NO_FILTERS, q: "claude code", author: "1", kind: "video" as const };
    expect(postsQueryString(f, "55", { limit: 20 })).toBe("limit=20&q=claude+code&author=1&kind=video&cursor=55");
    expect(postsQueryString({ ...NO_FILTERS, collection: "7" }, null, { profile: "77" })).toBe("limit=60&profile=77");
  });

  it("builds the reports query", () => {
    expect(reportsQueryString({ ...NO_FILTERS, q: "ai", source: "profile", collection: "7" }, "100.5")).toBe("limit=40&q=ai&source=profile&cursor=100.5");
  });

  it("knows when filters are set", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, source: "saved" })).toBe(true);
  });
});
```

Create `apps/web/test/profile-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseProfileInput } from "../app/lib/profile-input";

describe("parseProfileInput", () => {
  it("accepts names, @names and profile links", () => {
    expect(parseProfileInput("nasa")).toBe("nasa");
    expect(parseProfileInput(" @Maria.Codes ")).toBe("maria.codes");
    expect(parseProfileInput("https://www.instagram.com/nasa/")).toBe("nasa");
    expect(parseProfileInput("instagram.com/nasa?igsh=abc")).toBe("nasa");
    expect(parseProfileInput("https://instagram.com/kenji_makes/reels/")).toBe("kenji_makes");
  });
  it("rejects post links, other sites and bad names", () => {
    expect(parseProfileInput("https://www.instagram.com/reel/DAbc/")).toBeNull();
    expect(parseProfileInput("https://evil.com/nasa")).toBeNull();
    expect(parseProfileInput("https://notinstagram.com/nasa")).toBeNull();
    expect(parseProfileInput("two words")).toBeNull();
    expect(parseProfileInput("")).toBeNull();
    expect(parseProfileInput("a".repeat(31))).toBeNull();
  });
});
```

Add to `apps/web/test/extension.test.ts`:

```ts
import { loadErrorText } from "../app/lib/extension";

describe("loadErrorText", () => {
  it("tells the owner to update an old extension", () => {
    expect(loadErrorText("unknown_type")).toMatch(/extension is out of date/);
  });
  it("explains profile problems in plain words", () => {
    expect(loadErrorText("private_profile")).toMatch(/private/);
    expect(loadErrorText("profile_not_found")).toBe(loadErrorText("not_found"));
    expect(loadErrorText("busy")).toMatch(/already/);
    expect(loadErrorText("something_new")).toMatch(/something_new/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace `apps/web/app/lib/filters.ts` with:

```ts
import type { MediaKind, ReportSource } from "@no-fomo/core";

export interface Filters {
  q: string | null;
  author: string | null;
  collection: string | null;
  kind: MediaKind | null;
  /** Reports tab only. */
  source: ReportSource | null;
}

export const NO_FILTERS: Filters = { q: null, author: null, collection: null, kind: null, source: null };

const KINDS: readonly MediaKind[] = ["image", "video", "carousel"];
const SOURCES: readonly ReportSource[] = ["saved", "profile"];
const ID = /^\d{1,30}$/;

const cleanQuery = (v: string | null | undefined) => {
  const t = (v ?? "").trim().slice(0, 200);
  return t ? t : null;
};

export function readFilters(sp: URLSearchParams): Filters {
  const author = sp.get("author");
  const collection = sp.get("collection");
  const kind = sp.get("kind") as MediaKind | null;
  const source = sp.get("source") as ReportSource | null;
  return {
    q: cleanQuery(sp.get("q")),
    author: author && ID.test(author) ? author : null,
    collection: collection && ID.test(collection) ? collection : null,
    kind: kind && KINDS.includes(kind) ? kind : null,
    source: source && SOURCES.includes(source) ? source : null,
  };
}

export function writeFilters(sp: URLSearchParams, patch: Partial<Filters>): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const [k, v] of Object.entries(patch)) {
    const value = k === "q" ? cleanQuery(v) : v;
    if (value) next.set(k, value);
    else next.delete(k);
  }
  return next;
}

export function postsQueryString(f: Filters, cursor: string | null, o: { profile?: string; limit?: number } = {}): string {
  const q = new URLSearchParams({ limit: String(o.limit ?? 60) });
  if (o.profile) q.set("profile", o.profile);
  if (f.q) q.set("q", f.q);
  if (f.author) q.set("author", f.author);
  if (f.collection && !o.profile) q.set("collection", f.collection);
  if (f.kind) q.set("kind", f.kind);
  if (cursor !== null) q.set("cursor", cursor);
  return q.toString();
}

export function reportsQueryString(f: Filters, cursor: string | null, limit = 40): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (f.q) q.set("q", f.q);
  if (f.author) q.set("author", f.author);
  if (f.kind) q.set("kind", f.kind);
  if (f.source) q.set("source", f.source);
  if (cursor !== null) q.set("cursor", cursor);
  return q.toString();
}

export const hasFilters = (f: Filters) => Boolean(f.q || f.author || f.collection || f.kind || f.source);
```

Create `apps/web/app/lib/profile-input.ts`:

```ts
const USERNAME = /^[a-z0-9._]{1,30}$/;
/** First path parts on instagram.com that are pages, not accounts. */
const NOT_ACCOUNTS = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "about", "developer", "legal"]);

/** Turns "nasa", "@nasa" or an instagram.com profile link into a username. Null when it is none of these. */
export function parseProfileInput(text: string): string | null {
  let t = text.trim();
  if (!t) return null;
  if (/instagram\.com/i.test(t)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    } catch {
      return null;
    }
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
    t = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (NOT_ACCOUNTS.has(t.toLowerCase())) return null;
  }
  t = t.replace(/^@/, "").toLowerCase();
  return USERNAME.test(t) ? t : null;
}
```

In `apps/web/app/lib/extension.ts`, change the imports and `ExtResponse` and add:

```ts
import type { PostMedia, ProfileLoadRequest, SyncMode, UserSuggestion } from "@no-fomo/core";

export type ExtResponse =
  | { ok: true; version?: string; media?: PostMedia; users?: UserSuggestion[]; authorId?: string }
  | { ok: false; error: string };
```

```ts
export const searchInstagram = (id: string, query: string) => send(id, { type: "profile:search", query }, 20_000);
export const loadProfile = (id: string, r: ProfileLoadRequest) => send(id, { type: "profile:load", ...r }, 45_000);
export const updateFollowing = (id: string) => send(id, { type: "following:update" }, 45_000);

export function loadErrorText(code: string): string {
  switch (code) {
    case "unknown_type":
      return "Your no-fomo extension is out of date. Run pnpm ext:build, then press Reload on the chrome://extensions page.";
    case "not_found":
    case "profile_not_found": return "No Instagram account has this name.";
    case "private_profile": return "This account is private and you do not follow it, so its posts cannot be loaded.";
    case "no_more_posts": return "All posts of this profile are already loaded.";
    case "busy": return "A load is already running. Wait for it to finish.";
    case "login_required": return "Log in to Instagram in this browser, then try again.";
    case "rate_limited": return "Instagram asked to slow down. Try again in a few minutes.";
    case "timeout": return "The extension did not answer. Reload this page and try again.";
    case "instagram_tab_failed": return "Could not open Instagram. Open instagram.com in this browser and try again.";
    case "no_extension": return "The no-fomo extension is not installed.";
    default: return `Could not load from Instagram (${code}).`;
  }
}
```

In `apps/web/app/lib/api.ts`, update imports with the new types (`AuthorScope, FollowingPage, ProfileItem, ReportsPage`) and change/add entries:

```ts
  authors: (scope: AuthorScope = "saved") => get<AuthorFacet[]>(`/api/authors?scope=${scope}`),
  reports: (qs: string) => get<ReportsPage>(`/api/reports?${qs}`),
  profiles: () => get<ProfileItem[]>("/api/profiles"),
  removeProfile: (id: string) => send<{ ok: true; removed: number }>(`/api/profiles/${id}/remove`, {}),
  following: (q: string | null) => get<FollowingPage>(`/api/following?${new URLSearchParams(q ? { q, limit: "100" } : { limit: "100" })}`),
```

Create `apps/web/app/lib/use-post-list.ts` (logic moved from `routes/library.tsx`):

```ts
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";

type Page<T> = { items: T[]; nextCursor: string | null; total: number };

/** A paged list plus the post viewer state kept in `?post=`. */
export function usePostList<T extends { id: string }>(o: { queryKey: unknown[]; fetchPage: (cursor: string | null) => Promise<Page<T>>; enabled?: boolean }) {
  const [params, setParams] = useSearchParams();
  const query = useInfiniteQuery({
    queryKey: o.queryKey,
    enabled: o.enabled ?? true,
    queryFn: ({ pageParam }) => o.fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<T>) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const openId = params.get("post");
  const openIndex = openId ? items.findIndex((p) => p.id === openId) : -1;

  // Keep a few posts ahead loaded so "next" never stalls at the end of a page.
  const nearEnd = openIndex >= 0 && openIndex >= items.length - 3;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [nearEnd, hasNextPage, isFetchingNextPage, fetchNextPage]);

  /** Opening a post adds a history entry; moving between posts replaces it. */
  const setPost = (id: string | null, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("post", id);
        else next.delete("post");
        return next;
      },
      { replace },
    );

  return {
    query,
    items,
    total: query.data?.pages[0]?.total,
    open: openIndex >= 0 ? items[openIndex]! : null,
    prev: openIndex > 0 ? items[openIndex - 1]! : null,
    next: openIndex >= 0 ? (items[openIndex + 1] ?? null) : null,
    setPost,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/web`
Expected: PASS. (`pnpm typecheck` for web will fail until Task 10 replaces `library.tsx` and `filter-bar.tsx`; that is expected here.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/lib apps/web/test
git commit -m "feat(web): helpers for tabs, profile input, extension jobs and post lists"
```

---

### Task 10: Web: tabs layout and the Saved tab

**Files:**
- Modify: `apps/web/app/routes.ts`, `apps/web/app/components/top-bar.tsx`, `apps/web/app/components/search-box.tsx`, `apps/web/app/components/filter-bar.tsx`, `apps/web/app/components/post-grid.tsx`, `apps/web/app/components/sync-control.tsx`
- Create: `apps/web/app/routes/shell.tsx`, `apps/web/app/routes/saved.tsx`, `apps/web/app/components/nav-tabs.tsx`, `apps/web/app/components/source-switch.tsx`
- Delete: `apps/web/app/routes/library.tsx`

**Interfaces:**
- Consumes: Task 9 helpers.
- Produces: `TopBar({ search }: { search: SearchConfig | null })`, `type SearchConfig = { value: string | null; onChange: (q: string | null) => void; placeholder: string; label: string }`; `FilterBar({ scope, filters, total, onChange })` with `scope: "saved" | "profile" | "reports"`; `PostGrid` gains `empty: ReactNode` (shown when there are no posts and no filters); `SourceSwitch({ value, onChange })`.

- [ ] **Step 1: Routes and layout**

`apps/web/app/routes.ts`:

```ts
import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/shell.tsx", [
    index("routes/saved.tsx"),
    route("profiles", "routes/profiles.tsx"),
    route("profiles/:username", "routes/profile.tsx"),
    route("reports", "routes/reports.tsx"),
  ]),
] satisfies RouteConfig;
```

`apps/web/app/routes/shell.tsx`:

```tsx
import { Outlet } from "react-router";
import { SettingsProvider } from "../components/settings-dialog";

export default function Shell() {
  return (
    <SettingsProvider>
      <div className="min-h-[100dvh]">
        <Outlet />
      </div>
    </SettingsProvider>
  );
}
```

Create placeholder files so the build works until Tasks 11–12 (each replaced there):

```tsx
// apps/web/app/routes/profiles.tsx, profile.tsx, reports.tsx (temporary)
import { TopBar } from "../components/top-bar";
export default function Page() {
  return <TopBar search={null} />;
}
```

- [ ] **Step 2: Tabs and top bar**

`apps/web/app/components/nav-tabs.tsx`:

```tsx
import { NavLink } from "react-router";

const TABS = [
  { to: "/", label: "Saved", end: true },
  { to: "/profiles", label: "Profiles", end: false },
  { to: "/reports", label: "Reports", end: false },
] as const;

export function NavTabs({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="flex gap-1">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `inline-flex h-9 items-center rounded-control px-3 text-[14px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent ${
                  isActive ? "bg-accent-soft font-medium text-text" : "text-muted hover:bg-surface hover:text-text"
                }`
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

Replace `apps/web/app/components/top-bar.tsx` with:

```tsx
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { NavTabs } from "./nav-tabs";
import { SearchBox } from "./search-box";
import { useOpenSettings } from "./settings-dialog";
import { SyncControl } from "./sync-control";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export type SearchConfig = { value: string | null; onChange: (q: string | null) => void; placeholder: string; label: string };

export function TopBar({ search }: { search: SearchConfig | null }) {
  const openSettings = useOpenSettings();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:flex-nowrap md:px-6">
        <span className="text-[15px] font-semibold tracking-tight">no-fomo</span>
        <NavTabs className="order-last basis-full md:order-none md:basis-auto" />
        {search && (
          <div className="order-last basis-full md:order-none md:max-w-[480px] md:flex-1 md:basis-auto">
            <SearchBox {...search} />
          </div>
        )}
        <div className="ms-auto flex min-w-0 items-center gap-1">
          <button type="button" onClick={openSettings} aria-label="Settings" title="Settings" className={buttonClass("ghost", "", "icon")}>
            <Icon icon={Settings01Icon} size={18} />
          </button>
          <SyncControl />
        </div>
      </div>
    </header>
  );
}
```

In `search-box.tsx`, change the props to `{ value, onChange, placeholder, label }: { value: string | null; onChange: (q: string | null) => void; placeholder: string; label: string }` and use `placeholder={placeholder}` and `aria-label={label}` on the input.

- [ ] **Step 3: Filter bar, source switch, grid empty state**

`apps/web/app/components/source-switch.tsx`:

```tsx
import type { ReportSource } from "@no-fomo/core";

const OPTIONS: Array<{ value: ReportSource | null; label: string }> = [
  { value: null, label: "All" },
  { value: "saved", label: "Saved" },
  { value: "profile", label: "Profiles" },
];

export function SourceSwitch({ value, onChange }: { value: ReportSource | null; onChange: (v: ReportSource | null) => void }) {
  return (
    <div role="group" aria-label="Where the post comes from" className="inline-flex h-9 rounded-control border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] px-3 text-[14px] text-muted transition-colors duration-200 hover:text-text aria-pressed:text-text focus-visible:outline-2 focus-visible:outline-accent ${
            o.value === null
              ? "aria-pressed:bg-bg aria-pressed:shadow-[0_1px_2px_oklch(0.2_0.01_250/0.12)]"
              : "aria-pressed:bg-accent-soft aria-pressed:shadow-[inset_0_0_0_1px_var(--accent-line)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`filter-bar.tsx` — new signature and body:

```tsx
export function FilterBar({ scope, filters, total, onChange }: {
  scope: "saved" | "profile" | "reports";
  filters: Filters;
  total: number | undefined;
  onChange: (p: Partial<Filters>) => void;
}) {
  const authorScope = scope === "reports" ? "reports" : "saved";
  const authors = useQuery({ queryKey: ["authors", authorScope], queryFn: () => api.authors(authorScope), enabled: scope !== "profile" });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections, enabled: scope === "saved" });
  const noun = scope === "reports" ? ["report", "reports"] : ["post", "posts"];
```

Keep the author `FacetPicker` but render it only when `scope !== "profile"`; keep the collection picker only when `scope === "saved"`; keep `KindSwitch`; delete the "Has report" button; add `{scope === "reports" && <SourceSwitch value={filters.source} onChange={(source) => onChange({ source })} />}` after `KindSwitch`. Change the count text to use `noun`: ``${total.toLocaleString("en")} ${total === 1 ? noun[0] : noun[1]}``. Change `activeCount` to `[f.q, f.author, f.collection, f.kind, f.source].filter(Boolean).length`.

`post-grid.tsx` — add an `empty: ReactNode` prop; in the no-filters branch render `<section className="py-16">{props.empty}</section>` instead of the hardcoded saved text and `SetupSteps`. Replace the `otherFilters` line with `const otherFilters = Boolean(props.filters.author || props.filters.collection || props.filters.kind || props.filters.source);`. Change the query prop type to `UseInfiniteQueryResult<InfiniteData<{ items: PostListItem[]; nextCursor: string | null; total: number }>>` and import `ReactNode`.

`sync-control.tsx` — the post-sync invalidation already uses `["posts"]` and `["authors"]` prefixes; keep.

- [ ] **Step 4: Saved page**

Create `apps/web/app/routes/saved.tsx` and delete `routes/library.tsx`:

```tsx
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { NO_FILTERS, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { usePostList } from "../lib/use-post-list";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { SetupSteps } from "../components/setup-steps";
import { TopBar } from "../components/top-bar";
import { Viewer } from "../components/viewer/viewer";

export default function Saved() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });
  const list = usePostList({
    queryKey: ["posts", "saved", filters],
    fetchPage: (cursor) => api.posts(postsQueryString(filters, cursor)),
  });

  return (
    <>
      <TopBar search={{ value: filters.q, onChange: (q) => update({ q }), placeholder: "Search captions, authors, music", label: "Search saved posts" }} />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <FilterBar scope="saved" filters={filters} total={list.total} onChange={update} />
        <PostGrid
          query={list.query}
          items={list.items}
          filters={filters}
          onOpen={(id) => list.setPost(id)}
          onClearFilters={() => update(NO_FILTERS)}
          empty={<><h2 className="text-[17px] font-semibold">Your saved posts will show up here</h2><SetupSteps /></>}
        />
      </main>
      <Viewer
        post={list.open}
        onClose={() => list.setPost(null)}
        onPrev={list.prev ? () => list.setPost(list.prev!.id, true) : null}
        onNext={list.next ? () => list.setPost(list.next!.id, true) : null}
        onShowAuthor={(author) => {
          const next = writeFilters(params, { author });
          next.delete("post");
          setParams(next, { replace: true });
        }}
      />
    </>
  );
}
```

- [ ] **Step 5: Typecheck, test, build**

Run: `pnpm typecheck && pnpm test && pnpm --filter @no-fomo/web build`
Expected: PASS.

- [ ] **Step 6: Check in the browser**

Run `pnpm start` (stop any running copy first) and open `http://localhost:4747`. Check: three tabs in the top bar, Saved tab shows the library as before, no "Has report" button, filters and search work, the viewer opens and Back closes it. At phone width (agent-browser, 390 px wide): tabs on their own row, no horizontal scroll.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): Saved, Profiles and Reports tabs; Saved tab without the report filter"
```

---

### Task 11: Web: Profiles tab and profile pages

**Files:**
- Create: `apps/web/app/components/avatar.tsx`, `apps/web/app/components/profiles/use-profile-jobs.ts`, `apps/web/app/components/profiles/profile-search.tsx`, `apps/web/app/components/profiles/profile-card.tsx`, `apps/web/app/components/profiles/following-list.tsx`
- Replace: `apps/web/app/routes/profiles.tsx`, `apps/web/app/routes/profile.tsx`
- Modify: `apps/web/app/components/viewer/post-details.tsx`, `apps/web/app/components/viewer/viewer.tsx`

**Interfaces:**
- Consumes: `api.profiles`, `api.following`, `api.removeProfile`, `searchInstagram`, `loadProfile`, `updateFollowing`, `loadErrorText`, `parseProfileInput`, `usePostList`, `FilterBar`, `PostGrid`, `Viewer`.
- Produces: `useProfileJobs(): { extensionId: string | undefined; ready: boolean; profiles: UseQueryResult<ProfileItem[]>; add(username: string): Promise<string | null>; load(authorId: string, mode: "older" | "refresh"): Promise<string | null>; remove(authorId: string): Promise<void>; updateList(): Promise<string | null> }` — each action returns an error text or null. `Viewer` prop `onShowAuthor` becomes `((id: string) => void) | null` and gains `initialTab?: DetailsTab`.

- [ ] **Step 1: Avatar and jobs hook**

`apps/web/app/components/avatar.tsx`:

```tsx
import { useState } from "react";

/** A round avatar from the local store, or the first letter when there is none. */
export function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <span aria-hidden="true" style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-medium uppercase text-muted">
        {name.replace(/^@/, "").slice(0, 1)}
      </span>
    );
  }
  return <img src={src} alt="" style={style} loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-full bg-surface-2 object-cover" />;
}
```

`apps/web/app/components/profiles/use-profile-jobs.ts`:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { loadErrorText, loadProfile, pingExtension, updateFollowing } from "../../lib/extension";

export function useProfileJobs() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const extensionId = config.data?.extensionId;
  const ext = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => pingExtension(extensionId!),
    enabled: !!extensionId,
    refetchInterval: (q) => (q.state.data?.ok ? false : 5000),
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: api.profiles,
    // While Instagram pages arrive, keep the counts and the grid moving.
    refetchInterval: (q) => (q.state.data?.some((p) => p.run?.status === "running") ? 1000 : false),
  });

  const errorOf = (reply: Awaited<ReturnType<typeof loadProfile>>) =>
    !reply ? loadErrorText("no_extension") : reply.ok ? null : loadErrorText(reply.error);

  return {
    extensionId,
    ready: !!ext.data?.ok,
    extensionMissing: ext.isFetched && !ext.data?.ok,
    profiles,
    async add(username: string) {
      if (!extensionId) return loadErrorText("no_extension");
      const err = errorOf(await loadProfile(extensionId, { mode: "add", username }));
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      await qc.invalidateQueries({ queryKey: ["following"] });
      return err;
    },
    async load(authorId: string, mode: "older" | "refresh") {
      if (!extensionId) return loadErrorText("no_extension");
      const err = errorOf(await loadProfile(extensionId, { mode, authorId }));
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      return err;
    },
    async remove(authorId: string) {
      await api.removeProfile(authorId);
      qc.removeQueries({ queryKey: ["posts", "profile", authorId] });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      await qc.invalidateQueries({ queryKey: ["following"] });
      await qc.invalidateQueries({ queryKey: ["reports"] });
    },
    async updateList() {
      if (!extensionId) return loadErrorText("no_extension");
      const err = errorOf(await updateFollowing(extensionId));
      await qc.invalidateQueries({ queryKey: ["following"] });
      return err;
    },
  };
}
```

- [ ] **Step 2: Search box with two result groups**

`apps/web/app/components/profiles/profile-search.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckmarkBadge01Icon, Search01Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import type { FollowingItem, ProfileItem, UserSuggestion } from "@no-fomo/core";
import { loadErrorText, searchInstagram } from "../../lib/extension";
import { parseProfileInput } from "../../lib/profile-input";
import { Avatar } from "../avatar";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

type Row = { id: string; username: string; fullName: string | null; avatar: string | null; isPrivate?: boolean; isVerified?: boolean };

export function ProfileSearch(props: {
  text: string;
  onTextChange: (t: string) => void;
  followingMatches: FollowingItem[];
  profiles: ProfileItem[];
  extensionId: string | undefined;
  ready: boolean;
  busyUsername: string | null;
  error: string | null;
  onAdd: (username: string) => void;
  onOpen: (username: string) => void;
}) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(props.text.trim()), 400);
    return () => clearTimeout(t);
  }, [props.text]);

  const asLink = parseProfileInput(props.text);
  const query = /instagram\.com/i.test(debounced) ? "" : debounced.replace(/^@/, "");
  const ig = useQuery({
    queryKey: ["ig-search", query],
    queryFn: async () => {
      const r = await searchInstagram(props.extensionId!, query);
      if (!r) throw new Error(loadErrorText("no_extension"));
      if (!r.ok) throw new Error(loadErrorText(r.error));
      return r.users ?? [];
    },
    enabled: props.ready && query.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const added = new Map(props.profiles.map((p) => [p.username.toLowerCase(), p]));
  const followed: Row[] = props.followingMatches.slice(0, 5).map((f) => ({ id: f.id, username: f.username, fullName: f.fullName, avatar: f.avatarUrl }));
  const shownIds = new Set(followed.map((r) => r.id));
  const others: Row[] = (ig.data ?? [])
    .filter((u: UserSuggestion) => !shownIds.has(u.id))
    .slice(0, 8)
    .map((u) => ({ id: u.id, username: u.username, fullName: u.fullName, avatar: null, isPrivate: u.isPrivate, isVerified: u.isVerified }));
  const open = props.text.trim().length > 0;

  const row = (r: Row) => {
    const isAdded = added.has(r.username.toLowerCase());
    const busy = props.busyUsername === r.username;
    return (
      <li key={r.id} className="flex items-center gap-3 rounded-[6px] px-2.5 py-2 hover:bg-surface">
        <Avatar src={r.avatar} name={r.username} size={32} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 truncate text-[14px]">
            @{r.username}
            {r.isVerified && <Icon icon={CheckmarkBadge01Icon} size={14} className="text-accent" />}
            {r.isPrivate && <Icon icon={SquareLock02Icon} size={14} className="text-muted" />}
          </span>
          {r.fullName && <span className="block truncate text-[12px] text-muted">{r.fullName}</span>}
        </span>
        {isAdded ? (
          <Button variant="ghost" onClick={() => props.onOpen(r.username)}>Open</Button>
        ) : (
          <Button onClick={() => props.onAdd(r.username)} disabled={!props.ready || busy}>{busy ? "Adding…" : "Add"}</Button>
        )}
      </li>
    );
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!asLink) return;
          if (added.has(asLink)) props.onOpen(asLink);
          else props.onAdd(asLink);
        }}
        className="relative"
      >
        <Icon icon={Search01Icon} size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={props.text}
          onChange={(e) => props.onTextChange(e.target.value)}
          placeholder="Find an account: name, @username or profile link"
          aria-label="Find an Instagram account"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-control border border-line bg-surface ps-11 pe-3 text-[15px] text-text placeholder:text-muted focus-visible:border-accent-line focus-visible:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      {props.error && <p role="alert" className="mt-2 text-[13px] text-danger">{props.error}</p>}
      {open && (
        <div className="mt-2 grid gap-3 rounded-control border border-line p-2">
          <section aria-label="People you follow">
            <h3 className="px-2.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">People you follow</h3>
            {followed.length ? <ul>{followed.map(row)}</ul> : <p className="px-2.5 py-2 text-[13px] text-muted">No match.</p>}
          </section>
          <section aria-label="All Instagram">
            <h3 className="px-2.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">All Instagram</h3>
            {!props.ready ? (
              <p className="px-2.5 py-2 text-[13px] text-muted">Needs the no-fomo extension.</p>
            ) : query.length < 2 ? (
              <p className="px-2.5 py-2 text-[13px] text-muted">Type at least 2 letters.</p>
            ) : ig.isFetching ? (
              <p className="px-2.5 py-2 text-[13px] text-muted">Searching Instagram…</p>
            ) : ig.isError ? (
              <p className="px-2.5 py-2 text-[13px] text-danger">{(ig.error as Error).message}</p>
            ) : others.length ? (
              <ul>{others.map(row)}</ul>
            ) : (
              <p className="px-2.5 py-2 text-[13px] text-muted">No other accounts found.</p>
            )}
          </section>
          {asLink && <p className="px-2.5 pb-1 text-[12px] text-muted">Press Enter to add @{asLink}.</p>}
        </div>
      )}
    </div>
  );
}
```

Avatars of All-Instagram results show the first letter only: those accounts are not stored, and the app never loads images from Instagram directly in the page.

- [ ] **Step 3: Profile card and following list**

`apps/web/app/components/profiles/profile-card.tsx`:

```tsx
import { Link } from "react-router";
import { Delete02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import type { ProfileItem } from "@no-fomo/core";
import { formatAgo } from "../../lib/format";
import { Avatar } from "../avatar";
import { buttonClass } from "../ui/button";
import { Icon } from "../ui/icon";

export function loadNote(p: ProfileItem): string {
  if (p.run?.status === "running") return `Loading, ${p.run.items.toLocaleString("en")} new posts so far`;
  const loaded = `${p.loadedCount.toLocaleString("en")}${p.postCount !== null ? ` of ${p.postCount.toLocaleString("en")}` : ""} posts loaded`;
  return p.refreshedAt ? `${loaded} · Updated ${formatAgo(p.refreshedAt)}` : loaded;
}

export function ProfileCard({ p, onRefresh, onRemove, disabled }: { p: ProfileItem; onRefresh: () => void; onRemove: () => void; disabled: boolean }) {
  const running = p.run?.status === "running";
  return (
    <li className="flex items-center gap-3 rounded-control border border-line p-3">
      <Link to={`/profiles/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[6px] focus-visible:outline-2 focus-visible:outline-accent">
        <Avatar src={p.avatarUrl} name={p.username} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">@{p.username}</span>
          <span className="block truncate text-[13px] text-muted">{loadNote(p)}</span>
          {p.run?.status === "error" && <span className="block truncate text-[12px] text-danger">{p.run.errorMessage ?? "The last load failed."}</span>}
        </span>
      </Link>
      <button type="button" onClick={onRefresh} disabled={disabled || running} aria-label={`Refresh @${p.username}`} title="Get new posts" className={buttonClass("ghost", "", "icon")}>
        <Icon icon={RefreshIcon} size={18} className={running ? "motion-safe:animate-spin" : ""} />
      </button>
      <button type="button" onClick={onRemove} disabled={running} aria-label={`Remove @${p.username}`} title="Remove" className={buttonClass("ghost", "hover:text-danger", "icon")}>
        <Icon icon={Delete02Icon} size={18} />
      </button>
    </li>
  );
}
```

`apps/web/app/components/profiles/following-list.tsx`:

```tsx
import type { FollowingPage } from "@no-fomo/core";
import { formatAgo } from "../../lib/format";
import { Avatar } from "../avatar";
import { Button } from "../ui/button";

export function FollowingList(props: {
  page: FollowingPage | undefined;
  filtered: boolean;
  ready: boolean;
  error: string | null;
  busyUsername: string | null;
  onUpdate: () => void;
  onAdd: (username: string) => void;
  onOpen: (username: string) => void;
}) {
  const page = props.page;
  const running = page?.run?.status === "running";
  const note = running
    ? `Updating, ${page!.run!.items.toLocaleString("en")} accounts so far`
    : page?.updatedAt
      ? `${page.total.toLocaleString("en")}${props.filtered ? " found" : ""} · Updated ${formatAgo(page.updatedAt)}`
      : "Not loaded yet";
  return (
    <section aria-labelledby="following-title" className="mt-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="following-title" className="text-[17px] font-semibold">People you follow</h2>
        <span className="text-[13px] text-muted" role="status" aria-live="polite">{note}</span>
        <Button className="ms-auto" onClick={props.onUpdate} disabled={!props.ready || running}>{running ? "Updating…" : "Update list"}</Button>
      </div>
      {props.error && <p role="alert" className="mt-2 text-[13px] text-danger">{props.error}</p>}
      {page?.run?.status === "error" && !props.error && <p className="mt-2 text-[13px] text-danger">{page.run.errorMessage ?? "The last update failed."}</p>}
      {!page?.updatedAt && !running && (
        <p className="mt-3 max-w-[60ch] text-[15px] text-muted">Load the list of accounts you follow once, so you can find them here without searching Instagram. It takes about 30 seconds for 1,000 accounts.</p>
      )}
      {page && page.items.length > 0 && (
        <ul className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {page.items.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-[6px] px-2 py-1.5 hover:bg-surface">
              <Avatar src={f.avatarUrl} name={f.username} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">@{f.username}</span>
                {f.fullName && <span className="block truncate text-[12px] text-muted">{f.fullName}</span>}
              </span>
              {f.added ? (
                <Button variant="ghost" onClick={() => props.onOpen(f.username)}>Open</Button>
              ) : (
                <Button onClick={() => props.onAdd(f.username)} disabled={!props.ready || props.busyUsername === f.username}>
                  {props.busyUsername === f.username ? "Adding…" : "Add"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {page && page.total > page.items.length && (
        <p className="mt-3 text-[13px] text-muted">Showing {page.items.length} of {page.total.toLocaleString("en")}. Type in the search box to find others.</p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Profiles page**

Replace `apps/web/app/routes/profiles.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TopBar } from "../components/top-bar";
import { SetupSteps } from "../components/setup-steps";
import { ProfileCard } from "../components/profiles/profile-card";
import { ProfileSearch } from "../components/profiles/profile-search";
import { FollowingList } from "../components/profiles/following-list";
import { useProfileJobs } from "../components/profiles/use-profile-jobs";

export default function Profiles() {
  const navigate = useNavigate();
  const jobs = useProfileJobs();
  const [text, setText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const filter = text.trim() && !/instagram\.com/i.test(text) ? text.trim() : null;
  const following = useQuery({
    queryKey: ["following", filter],
    queryFn: () => api.following(filter),
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1000 : false),
  });
  const profiles = jobs.profiles.data ?? [];

  async function add(username: string) {
    setAddError(null);
    setBusy(username);
    const err = await jobs.add(username);
    setBusy(null);
    if (err) setAddError(err);
    else navigate(`/profiles/${username}`);
  }
  const openProfile = (username: string) => navigate(`/profiles/${username}`);

  return (
    <>
      <TopBar search={null} />
      <main className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 md:px-6">
        <h1 className="sr-only">Profiles</h1>
        {jobs.extensionMissing && (
          <section className="mb-6 rounded-control border border-line p-4">
            <h2 className="text-[15px] font-semibold">The no-fomo extension is needed to load profiles</h2>
            <SetupSteps />
          </section>
        )}
        <ProfileSearch
          text={text}
          onTextChange={(t) => { setText(t); setAddError(null); }}
          followingMatches={filter ? (following.data?.items ?? []) : []}
          profiles={profiles}
          extensionId={jobs.extensionId}
          ready={jobs.ready}
          busyUsername={busy}
          error={addError}
          onAdd={add}
          onOpen={openProfile}
        />
        <section aria-labelledby="profiles-title" className="mt-8">
          <h2 id="profiles-title" className="text-[17px] font-semibold">Your profiles</h2>
          {profiles.length === 0 ? (
            <p className="mt-2 text-[15px] text-muted">No profiles yet. Find an account above and press Add. The app loads its newest 100 posts.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  p={p}
                  disabled={!jobs.ready}
                  onRefresh={() => void jobs.load(p.id, "refresh").then(setAddError)}
                  onRemove={() => {
                    if (window.confirm(`Remove @${p.username}? Its posts leave the app, except saved posts and posts with a report.`)) void jobs.remove(p.id);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
        <FollowingList
          page={following.data}
          filtered={!!filter}
          ready={jobs.ready}
          error={listError}
          busyUsername={busy}
          onUpdate={() => { setListError(null); void jobs.updateList().then(setListError); }}
          onAdd={add}
          onOpen={openProfile}
        />
      </main>
    </>
  );
}
```

- [ ] **Step 5: One profile page**

Replace `apps/web/app/routes/profile.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft01Icon, RefreshIcon, SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import { api } from "../lib/api";
import { NO_FILTERS, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { usePostList } from "../lib/use-post-list";
import { Avatar } from "../components/avatar";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { TopBar } from "../components/top-bar";
import { Viewer } from "../components/viewer/viewer";
import { loadNote } from "../components/profiles/profile-card";
import { useProfileJobs } from "../components/profiles/use-profile-jobs";
import { Button, buttonClass } from "../components/ui/button";
import { Icon } from "../components/ui/icon";

export default function Profile() {
  const { username = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });
  const jobs = useProfileJobs();
  const qc = useQueryClient();
  const profile = jobs.profiles.data?.find((p) => p.username.toLowerCase() === username.toLowerCase()) ?? null;
  const [error, setError] = useState<string | null>(null);
  const list = usePostList({
    queryKey: ["posts", "profile", profile?.id, filters],
    fetchPage: (cursor) => api.posts(postsQueryString(filters, cursor, { profile: profile!.id })),
    enabled: !!profile,
  });
  const running = profile?.run?.status === "running";

  // New posts arrive page by page while a load runs.
  const loaded = profile?.loadedCount;
  useEffect(() => {
    if (profile) void qc.invalidateQueries({ queryKey: ["posts", "profile", profile.id] });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = { value: filters.q, onChange: (q: string | null) => update({ q }), placeholder: `Search @${username}`, label: `Search posts of @${username}` };

  if (jobs.profiles.isPending) return <TopBar search={null} />;
  if (!profile) {
    return (
      <>
        <TopBar search={null} />
        <main className="mx-auto max-w-[1100px] px-4 py-16 md:px-6">
          <h1 className="text-[17px] font-semibold">@{username} is not in your profiles</h1>
          <p className="mt-1 text-muted">Add it on the Profiles tab first.</p>
          <Link to="/profiles" className={buttonClass("secondary", "mt-4")}>Go to Profiles</Link>
        </main>
      </>
    );
  }

  const run = async (mode: "older" | "refresh") => {
    setError(null);
    setError(await jobs.load(profile.id, mode));
  };

  return (
    <>
      <TopBar search={search} />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <Link to="/profiles" aria-label="Back to Profiles" className={buttonClass("ghost", "", "icon")}><Icon icon={ArrowLeft01Icon} size={18} /></Link>
          <Avatar src={profile.avatarUrl} name={profile.username} size={40} />
          <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold">@{profile.username}</h1>
            <p className="truncate text-[13px] text-muted" role="status" aria-live="polite">{loadNote(profile)}</p>
          </div>
          <div className="ms-auto flex gap-2">
            <a href={`https://www.instagram.com/${profile.username}/`} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost")}>
              <Icon icon={SquareArrowUpRightIcon} />Instagram
            </a>
            <Button onClick={() => void run("refresh")} disabled={!jobs.ready || running}>
              <Icon icon={RefreshIcon} className={running ? "motion-safe:animate-spin" : ""} />Refresh
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-danger">{error}</p>}
        <FilterBar scope="profile" filters={filters} total={list.total} onChange={update} />
        <PostGrid
          query={list.query}
          items={list.items}
          filters={filters}
          onOpen={(id) => list.setPost(id)}
          onClearFilters={() => update(NO_FILTERS)}
          empty={<h2 className="text-[17px] font-semibold">{running ? "Loading posts from Instagram…" : "No posts loaded yet. Press Refresh."}</h2>}
        />
        {profile.hasOlder && !list.query.hasNextPage && list.items.length > 0 && (
          <div className="mt-8 flex justify-center">
            <Button onClick={() => void run("older")} disabled={!jobs.ready || running}>{running ? "Loading…" : "Load older posts"}</Button>
          </div>
        )}
      </main>
      <Viewer
        post={list.open}
        onClose={() => list.setPost(null)}
        onPrev={list.prev ? () => list.setPost(list.prev!.id, true) : null}
        onNext={list.next ? () => list.setPost(list.next!.id, true) : null}
        onShowAuthor={null}
      />
    </>
  );
}
```

`usePostList` must not fetch before the profile is known: pass `enabled: !!profile` in the `usePostList` call above (the option exists since Task 9).

- [ ] **Step 6: Viewer: optional author button, badges, start tab**

`viewer.tsx`: change `onShowAuthor: (id: string) => void` to `onShowAuthor: ((id: string) => void) | null`, add `initialTab?: DetailsTab` to the props and use `useState<DetailsTab>(initialTab ?? "details")`.

`post-details.tsx`: change the prop type to `onShowAuthor: ((id: string) => void) | null`; render the "More from" button only when it is set:

```tsx
            {onShowAuthor && <Button onClick={() => onShowAuthor(p.author.id)}>More from @{p.author.username}</Button>}
```

Under the full name in the header (inside the `min-w-0 flex-1` div) add the badges:

```tsx
          {(p.saved || p.profiles.length > 0) && (
            <p className="mt-1 flex flex-wrap gap-1.5">
              {p.saved && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted">Saved</span>}
              {p.profiles.map((u) => (
                <span key={u} className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] text-muted">From @{u}</span>
              ))}
            </p>
          )}
```

- [ ] **Step 7: Typecheck, test, build, check**

Run: `pnpm typecheck && pnpm test && pnpm --filter @no-fomo/web build && pnpm ext:build`
Expected: PASS.

Then with the owner (the extension must be reloaded on `chrome://extensions` after `pnpm ext:build`): open `/profiles`, press **Update list**, search a followed account and an unfollowed one, add one, watch its grid fill, press **Load older posts**, **Refresh**, open a post and check badges.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): Profiles tab with search, following list and profile pages"
```

---

### Task 12: Web: Reports tab

**Files:**
- Create: `apps/web/app/components/reports/report-row.tsx`
- Replace: `apps/web/app/routes/reports.tsx`

**Interfaces:**
- Consumes: `api.reports`, `reportsQueryString`, `usePostList`, `FilterBar` (scope `reports`), `Viewer` (`initialTab`).

- [ ] **Step 1: Report row**

`apps/web/app/components/reports/report-row.tsx`:

```tsx
import { useState } from "react";
import { ImageNotFound01Icon } from "@hugeicons/core-free-icons";
import type { ReportListItem } from "@no-fomo/core";
import { formatDate } from "../../lib/format";
import { Icon } from "../ui/icon";

export function ReportRow({ r, onOpen }: { r: ReportListItem; onOpen: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  const source = [r.saved ? "Saved" : null, ...r.profiles.map((u) => `@${u}`)].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        className="flex w-full gap-4 rounded-control p-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      >
        <div className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-tile bg-surface-2 sm:w-20">
          {failed ? (
            <div className="flex size-full items-center justify-center text-muted"><Icon icon={ImageNotFound01Icon} size={18} /></div>
          ) : (
            <img src={r.thumbUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="font-medium">@{r.author.username}</span>
            <span className="text-muted">Posted {formatDate(r.takenAt)}</span>
            <span className="text-muted">Report {formatDate(Math.floor(r.reportedAt / 1000))}</span>
          </p>
          <p className="mt-1 line-clamp-3 text-[15px] leading-relaxed">{r.summary || "No summary."}</p>
          {source && <p className="mt-1 truncate text-[12px] text-muted">{source}</p>}
        </div>
      </button>
    </li>
  );
}
```

(`reportedAt` is in milliseconds, like the report store's `now()`; `formatDate` takes seconds. Check `apps/server/src/analyze/analyzer.ts` uses `Date.now()` for `finishReport` — it does via `now()`.)

- [ ] **Step 2: Reports page**

Replace `apps/web/app/routes/reports.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import type { ReportListItem } from "@no-fomo/core";
import { api } from "../lib/api";
import { hasFilters, NO_FILTERS, readFilters, reportsQueryString, writeFilters, type Filters } from "../lib/filters";
import { usePostList } from "../lib/use-post-list";
import { FilterBar } from "../components/filter-bar";
import { ReportRow } from "../components/reports/report-row";
import { TopBar } from "../components/top-bar";
import { Viewer } from "../components/viewer/viewer";
import { Button } from "../components/ui/button";

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, patch), { replace: true });
  const list = usePostList<ReportListItem>({
    queryKey: ["reports", filters],
    fetchPage: (cursor) => api.reports(reportsQueryString(filters, cursor)),
  });
  const { query } = list;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return (
    <>
      <TopBar search={{ value: filters.q, onChange: (q) => update({ q }), placeholder: "Search words in reports", label: "Search reports" }} />
      <main className="mx-auto max-w-[900px] px-4 pb-16 md:px-6">
        <FilterBar scope="reports" filters={filters} total={list.total} onChange={update} />
        {query.isPending ? (
          <p className="py-16 text-muted">Loading reports…</p>
        ) : query.isError ? (
          <section className="py-16">
            <h2 className="text-[17px] font-semibold">Could not load reports</h2>
            <Button className="mt-4" onClick={() => void query.refetch()}>Try again</Button>
          </section>
        ) : list.items.length === 0 ? (
          <section className="py-16">
            <h2 className="text-[17px] font-semibold">{hasFilters(filters) ? "No reports match these filters" : "No reports yet"}</h2>
            <p className="mt-1 max-w-[60ch] text-muted">
              {hasFilters(filters) ? "Try removing a filter." : "Open any post, go to its Report tab and press Analyze. Every report shows up here."}
            </p>
            {hasFilters(filters) && <Button className="mt-4" onClick={() => update(NO_FILTERS)}>Clear search and filters</Button>}
          </section>
        ) : (
          <ul className="grid gap-1">
            {list.items.map((r) => <ReportRow key={r.id} r={r} onOpen={(id) => list.setPost(id)} />)}
          </ul>
        )}
        <div ref={sentinel} aria-hidden="true" />
      </main>
      <Viewer
        post={list.open}
        initialTab="report"
        onClose={() => list.setPost(null)}
        onPrev={list.prev ? () => list.setPost(list.prev!.id, true) : null}
        onNext={list.next ? () => list.setPost(list.next!.id, true) : null}
        onShowAuthor={(author) => {
          const next = writeFilters(params, { author });
          next.delete("post");
          setParams(next, { replace: true });
        }}
      />
    </>
  );
}
```

After a new report finishes, the Reports list must refresh. In `apps/web/app/components/viewer/report-panel.tsx`, find where the report query sees `status === "done"` (or add an effect on `report.data?.status`) and call `qc.invalidateQueries({ queryKey: ["reports"] })` and `qc.invalidateQueries({ queryKey: ["posts"] })` when it changes from working to `done`:

```tsx
  const wasWorking = useRef(false);
  useEffect(() => {
    const working = isWorking(r);
    if (wasWorking.current && !working && r?.status === "done") {
      void qc.invalidateQueries({ queryKey: ["reports"] });
      void qc.invalidateQueries({ queryKey: ["authors", "reports"] });
    }
    wasWorking.current = working;
  }, [r, qc]);
```

- [ ] **Step 3: Typecheck, test, build, check**

Run: `pnpm typecheck && pnpm test && pnpm --filter @no-fomo/web build`
Expected: PASS.

In the app: Reports tab lists existing reports newest first; each filter works; opening a row shows the Report tab; Up/Down moves through reports; analyze a new post and it appears in the list.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): Reports tab with its own filters"
```

---

### Task 13: Docs and full manual check

**Files:**
- Modify: `PRODUCT.md`, `PLAN.md`

- [ ] **Step 1: Update docs**

`PRODUCT.md` → under **Capabilities and Constraints** add:

```markdown
**Shipped (profiles and reports):** a Profiles tab to add any Instagram account and browse, filter and analyze its posts, with the list of people you follow and search across Instagram; a Reports tab with every report and its own filters. A post is stored once, so a report shows wherever the post appears.
```

`PLAN.md` → in **Features → how**, add item 7:

```markdown
7. **Profiles and Reports tabs:** add any account (newest ~100 posts, then "Load older posts", "Refresh" for new ones); the following list is stored and updated on a button; search across Instagram for others. Saved state lives in `saved_posts`, profile membership in `profile_posts`, so one post has one report. Reports tab lists every report with text, author, source and type filters. Spec: `docs/superpowers/specs/2026-10-05-profiles-reports-design.md`.
```

- [ ] **Step 2: Full check**

Run: `pnpm test && pnpm typecheck && pnpm ext:build && pnpm start`

With the owner (after reloading the extension on `chrome://extensions`), go through the spec's manual check:
1. Update the following list and find one account in it.
2. Find one account you do not follow through Instagram search.
3. Add one profile, then **Load older posts**, then **Refresh**.
4. Analyze a profile post that is also saved; see the report in Saved, in the profile grid and in Reports.
5. Remove the profile; the saved post and the report remain.
6. Check the three tabs at phone width (agent-browser, 390 px).

- [ ] **Step 3: Commit**

```bash
git add PRODUCT.md PLAN.md
git commit -m "docs: profiles and reports tabs"
```
