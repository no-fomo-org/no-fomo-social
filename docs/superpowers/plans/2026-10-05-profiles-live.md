# Instant Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "add a profile and load 100 posts" flow with instant browsing: open any account, posts stream from Instagram page by page, play right away, and only analyzed posts are stored.

**Architecture:** Builds on branch `profiles-reports` (plan `2026-10-05-profiles-reports.md`). The saved-state split, Reports tab, following list, search and tabs stay. Profile tables, profile load runs and the profile ingest go away. The extension answers `profile:open` / `profile:page` with ready-to-show posts (content + links) without the server. Analyze stores a post on demand through the existing media route with a `store` flag.

**Tech Stack:** TypeScript, pnpm monorepo, Hono + Drizzle (better-sqlite3) + zod, WXT extension, React Router v8 SPA + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-profiles-reports-design.md` (revised version)

## Global Constraints

- Every Instagram call goes through the shared request gate (2–3 s pause). No new path to Instagram.
- Nothing is stored for browsed posts. A post enters `posts` only when saved or analyzed.
- Migration 0008 never ran on a real database, so it is regenerated, not followed by 0009. It must not rebuild or drop `posts`.
- Extension → server calls go through the relay (paths start with `/api/sync/`).
- While account-page filters are on, the grid does not auto-load more pages.
- Plain, short UI English. The owner checks at `http://localhost:4747` after `pnpm start` and `pnpm ext:build` + Reload.
- Every task ends with `pnpm test` and `pnpm typecheck` green.

## Review Focus

1. **A browsed post that is also saved:** the account page shows its "Saved" mark and its report; analyzing it does not create a second row or touch its saved order. → Task 2 (`known`, store on existing post) and Task 5.
2. **Analyze on a post that is not stored:** first analyze stores it with one Instagram call and runs; a second analyze does not call Instagram again. → Task 4 (`startAnalysis`).
3. **Filters on an account page never page through the whole account by themselves.** → Task 5 (`autoLoad` off while filtering).
4. **Expired links on a browsed post** (page open for hours): refresh builds links without storing the post. → Task 3 (media-fetch fallback).
5. **Old extension build:** `profile:open` answers `unknown_type` → "extension is out of date". → existing `loadErrorText` test.

---

### Task 1: Core: account-page posts; drop profile-load code

**Files:** `packages/core/src/ig/live.ts` (new), `packages/core/src/api.ts`, `packages/core/src/sync/run-loads.ts`, `packages/core/src/ig/parse.ts`, `packages/core/src/ig/types.ts`, `packages/core/src/index.ts`; tests `packages/core/test/live.test.ts` (new), `run-loads.test.ts`, `users.test.ts`, `report.test.ts`.

**Interfaces (produces):**
- `permalinkOf(code: string, productType: string | null): string`
- `buildPostMedia(id: string, kind: MediaKind, parts: MediaPart[]): PostMedia` — `expiresAt` = earliest link expiry, null when none.
- `type LivePost = PostListItem & { media: PostMedia }`
- `toLivePost(p: ParsedPost): LivePost` — `thumbUrl` = Instagram thumbnail URL (or first part image), `hasReport: false`, `saved: false`.
- `interface LiveProfile { id; username; fullName; avatarUrl: string | null; postCount: number | null; isPrivate: boolean; followedByViewer: boolean }`
- `interface LivePage { posts: LivePost[]; nextCursor: string | null }` — `nextCursor` is `"<userId>:<max_id>"` so the next call needs nothing else.
- `PostListItem.profiles` removed. `ReportSource = "saved" | "other"`. `FollowingItem.added` removed. `LoadRunInfo.mode` removed. Removed: `ProfileItem`, `PostsQuery.profile`, `ProfileLoadMode`, `ProfileLoadRequest`, `ProfileStartBody`, `ProfileSink`, `runProfileLoad`, `PROFILE_PAGES`, `REFRESH_PAGES`, `ParsedPost.pinned`.

- [ ] Write `live.test.ts`: a carousel with a video part → `media.parts` kinds/urls, `expiresAt` = min `oe=` expiry; a reel → `permalink` `/reel/<code>/`, image post → `/p/<code>/`; `thumbUrl` falls back to the first part image; a post with no links → `expiresAt: null`. Run: FAIL (module missing).
- [ ] Implement `live.ts`; export from `index.ts`. Run: PASS.
- [ ] Remove the profile-load runner and its tests; remove `pinned` and its test; update types in `api.ts`; fix `report.test.ts` literal. Run `pnpm test && pnpm typecheck` (server/web errors expected only where later tasks change them; fix compile-only breaks minimally).
- [ ] Commit `feat(core): account-page posts with their links; drop profile loads`.

### Task 2: Server: schema, media store flag, known posts, following runs

**Files:** `apps/server/src/db/schema.ts`, `drizzle/0008_profiles.sql` (+ meta, regenerated), `src/sync/ingest.ts`, `src/sync/following.ts` (renamed from `loads.ts`, profile parts removed), `src/queries.ts`, `src/http/app.ts`, `src/main.ts`, `src/media/store.ts` (drop `removeThumbs`); tests `migration.test.ts`, `following.test.ts` (from `loads.test.ts`), `queries.test.ts`, `app.test.ts`, `media-store.test.ts`.

**Interfaces (produces):**
- Tables: `saved_posts`, `following`, `following_runs` (`id, status, started_at, active_at, finished_at, pages, items, next_pos, complete, error_code, error_message`). `profiles`, `profile_posts`, `load_runs` gone.
- `ingestMediaInfo(db, id, raw, o: { store: boolean }): MediaJob[]` — unknown post: `store` → create it (content only, no saved row); else `NotFoundError`.
- `startFollowingRun`, `ingestFollowingPage`, `finishFollowingRun`, `failStaleFollowingRuns`, `FOLLOWING_UPDATED_AT`.
- `postStates(db, ids: string[]): Array<{ id: string; saved: boolean; hasReport: boolean }>` — only stored ids.
- `listReports` source `"other"` = not visibly saved. `listPosts` saved only. `listFollowing` without `added`.
- HTTP: `POST /api/sync/media/:id { payload, store? }`; `GET /api/posts/known?ids=1,2` (≤100 digit ids, else 400); `POST /api/sync/following/runs`, `/:id/page`, `/:id/finish`; profile routes removed; `GET /api/reports?source=saved|other`.

- [ ] Tests first: migration test (unchanged expectations, new tables); `ingestMediaInfo` with `store` creates a post that is not saved and `listPosts` (saved) does not show it; without `store` → throws; on a saved post `store` keeps its saved row and order; `postStates` for a saved post, an analyzed-only post with a report, and an unknown id; reports `source: "other"`; following tests moved to the new names (complete run removes, early stop keeps, stale after 2 min); app tests: media route with `store`, `known` route validation, following routes, profile routes 404. Run: FAIL.
- [ ] Implement: schema, regenerate 0008 (re-add the `saved_posts` data copy before the column drops; check no `__new_posts` / `DROP TABLE` / `PRAGMA`), ingest flag, `following.ts`, queries, routes, `main.ts`. Run: PASS, `pnpm typecheck` for server.
- [ ] Commit `feat(server): store a post on demand, known-post marks, following runs; drop profile tables`.

### Task 3: Extension: open account, next page, links for unstored posts

**Files:** `apps/extension/src/external.ts`, `src/tab-jobs.ts`, `src/relay-sink.ts`, `src/media-fetch.ts`, `entrypoints/instagram.content.ts`; tests `external.test.ts`, `tab-jobs.test.ts`, `media-fetch.test.ts`.

**Interfaces (produces):**
- External: `profile:open { username }` → `{ ok: true, profile: LiveProfile, page: LivePage | null }`; `profile:page { cursor }` (format `<userId>:<max_id>`) → `{ ok: true, page: LivePage }`; `media:refresh { id, store?: boolean }`; `following:update`; `profile:search`. `profile:load` removed.
- Errors: `profile_not_found` (no user in the answer), Instagram codes, `bad_message`.
- `fetchMedia({ ig, id, serverUrl, send, store })`: posts `{ payload, store }`; on server `404` with `store` false → `{ ok: true, media }` built locally via `toLivePost`.

- [ ] Tests first: external validation (username, cursor `^\d{1,30}:[A-Za-z0-9_=-]{1,200}$`, store boolean); tab jobs: open returns profile + first page with `nextCursor` `"77:N"`, private-not-followed returns `page: null` and makes no feed call, unknown user → `profile_not_found`, page parses the cursor and calls `userFeed("77","N")`; media-fetch passes `store`, falls back to local links on 404 when not storing. Run: FAIL.
- [ ] Implement. Run: PASS; `pnpm ext:build`.
- [ ] Commit `feat(extension): open any account instantly and page through it`.

### Task 4: Web: data helpers

**Files:** `apps/web/app/lib/extension.ts`, `lib/api.ts`, `lib/analyze.ts`, `lib/filters.ts`, `lib/live-filter.ts` (new), `lib/use-post-list.ts`; remove `lib/profile-status.ts`; tests `extension.test.ts`, `filters.test.ts`, `live-filter.test.ts` (new), `analyze.test.ts` (new); remove `profile-status.test.ts`.

**Interfaces (produces):**
- `openProfile(extId, username)`, `profilePage(extId, cursor)`, `refreshExtensionMedia(extId, postId, store = false)`.
- `api.known(ids: string[])`; `api.following(q)`; profile api calls removed.
- `filterLive(posts: LivePost[], f: { q: string | null; kind: MediaKind | null }): LivePost[]` — caption, author, accessibility text, case-insensitive, all words must match.
- `startAnalysis`: on `links_expired` or a 404 (post not stored) → `refreshExtensionMedia(…, store = true)` → analyze again.
- `usePostList` generic over the page type (pages may carry extra fields, e.g. the profile).
- `loadErrorText`: `profile_not_found`, `private_profile` kept; `no_more_posts`, `busy` removed.

- [ ] Tests first: `filterLive` (words, kind, null filters); `startAnalysis` with mocked `api.analyze` and `refreshExtensionMedia`: 404 → refresh with `store` true → second analyze; success first time → no extension call; filters `source` now `saved | other`. Run: FAIL.
- [ ] Implement. Run: PASS.
- [ ] Commit `feat(web): helpers for instant account pages`.

### Task 5: Web: Profiles page, account page, Reports and viewer updates

**Files:** `routes/profiles.tsx`, `routes/profile.tsx`, `components/profiles/profile-search.tsx`, `components/profiles/following-list.tsx`, `components/profiles/use-extension.ts` (replaces `use-profile-jobs.ts`), remove `components/profiles/profile-card.tsx`, `components/post-grid.tsx` (`autoLoad` prop), `components/source-switch.tsx`, `components/reports/report-row.tsx`, `components/viewer/post-details.tsx`.

- [ ] Profiles page: search groups open accounts (`navigate(/profiles/<username>)`); Enter on a name/link opens; following rows are links; no "Your profiles".
- [ ] Account page: infinite query `["live-profile", username]` (first page `openProfile`, next `profilePage`), `staleTime` 5 min; header (avatar from Instagram, names, post count, Instagram link); private / not found / extension states; each loaded post's links put into the `["media", id]` cache; `api.known` for loaded ids merges `saved` / `hasReport`; filters via `filterLive`, `autoLoad` off while filtering with a note "Filters look at the N posts loaded so far."; viewer with `onShowAuthor={null}`.
- [ ] Reports: source switch All / Saved / Not saved; row source line "Saved" only. Viewer badge "Saved" only.
- [ ] `pnpm typecheck && pnpm test && pnpm --filter @no-fomo/web build`; browser check on a seeded scratch library at a spare port (Saved, Reports, Profiles page, following list, account page states with the extension missing, phone width).
- [ ] Commit `feat(web): instant account pages`.

### Task 6: Docs and owner check

- [ ] Update `PRODUCT.md` / `PLAN.md` lines from the first version to say accounts open instantly and only analyzed posts are stored.
- [ ] Full `pnpm test && pnpm typecheck && pnpm ext:build`.
- [ ] Commit `docs: instant profiles`.
- [ ] Final whole-branch review, fix pass, then the owner's manual check (spec section 6) with the database backup in `~/.no-fomo/backup-before-profiles/`.
