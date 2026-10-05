# Profiles and Reports tabs

**Date:** 2026-10-05 (revised the same day after the owner tried the first version)
**Source:** owner request, not in `PLAN.md`. It turns no-fomo from "saved posts only" into a place for any Instagram post the owner wants to watch and analyze.

## Goal

The app gets three tabs:

1. **Saved:** today's library of saved posts.
2. **Profiles:** open any Instagram account instantly, watch its posts, and analyze the ones the owner picks.
3. **Reports:** every report in one place, with its own filters.

A post is stored once. If the owner analyzes a post from an account page and the same post is also saved, it is the same post: the report shows in Saved, on the account page and in Reports.

## Decisions (agreed with the owner)

- **Instant browsing, nothing kept.** Opening an account shows its posts straight from Instagram, page by page as the owner scrolls. Nothing is stored, except posts the owner analyzes.
- **Speed:** the request gate's 2–3 s pause stays. The first 12 posts appear in about 2–4 s, each next 12 in about 3 s.
- **Account page filters:** type (video, photo, carousel) and search text, applied to the posts loaded so far. While a filter is on, the page does not load more pages by itself.
- **Saved tab:** the **Has report** filter is removed. Everything else stays.
- **Reports tab:** a list. Each row: thumbnail, author, post date, report date, first lines of the summary, and "Saved" when the post is saved. Filters: report text, author, source (**Saved / Not saved**), type. A click opens the usual viewer on the **Report** tab.
- A report stays in the Reports tab after its post is unsaved.
- **People you follow:** the Profiles tab shows the accounts the owner follows, and the owner can search them. The app keeps a copy of this list (names and avatars only). An **Update list** button loads it again. Search across all of Instagram works from the same box.
- **Superseded first version:** "Your profiles", Add / Remove, Refresh and "Load older posts" are dropped. They made the owner wait for ~100 posts and add accounts before seeing anything.

## 1. Data model

Today `posts` mixes two things: the post itself and its place in the saved feed (`sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at`). This work splits them.

- **`posts`** keeps only the post content. A post is in `posts` when it is saved or was analyzed.
- **`saved_posts`** (new): one row per post that is or was in the saved feed, with the five columns moved from `posts`.
- **`following`** (new): `author_id` (references `authors`), `position` (Instagram's order), `last_seen_run_id`. Names and avatars live in `authors`.
- **`following_runs`** (new): one row per **Update list** run: status, start and finish times, last activity time, pages, accounts seen, next position, whether it read the list to the end, error code and message.
- **`reports`** does not change. It is keyed by `post_id`, so one report per post, wherever the post came from.

**Migration** (one Drizzle migration): create `saved_posts`, copy the five columns from every post (every post today is a saved post), create `following` and `following_runs`, then drop the five columns from `posts` with `ALTER TABLE … DROP COLUMN`. Never rebuild or drop `posts`: the migrator runs in one transaction, so `PRAGMA foreign_keys=OFF` does nothing and dropping `posts` would cascade-delete reports, parts and collection links. A test builds a database as the old app left it and checks that posts, saved order, unsaved marks, parts, collection links and reports survive.

## 2. Instagram calls (extension)

All Instagram calls stay in the extension and in `packages/core/src/ig`, through the one request gate.

- `profileInfo(username)`: `GET /api/v1/users/web_profile_info/?username=…` — id, names, avatar, post count, private flag, "followed by me".
- `userFeed(userId, cursor)`: `GET /api/v1/feed/user/{userId}/?count=12&max_id=…` — plain media objects, read by `parseMediaPage`.
- `searchUsers(query)`: `GET /api/v1/web/search/topsearch/?context=blended&query=…`.
- `followingPage(viewerId, cursor)`: `GET /api/v1/friendships/{viewerId}/following/?count=100&max_id=…`. The owner's id comes from the `ds_user_id` cookie.
- `mediaInfo(id)` (existing): fresh links for one post.

**Messages from the app page to the extension:**
- `profile:search { query }` → suggested accounts. No server writes.
- `profile:open { username }` → the account (id, names, avatar, post count, private flags) and its first page of posts, or no page when the account is private and not followed. No server writes.
- `profile:page { userId, cursor }` → the next page. No server writes.
- `following:update` → starts an **Update list** run that posts pages to the server.
- `media:refresh { id, store }` (existing, extended) → fresh links for one post. The extension sends Instagram's answer to the server. If the server does not have the post and `store` is false, the extension builds the links itself and stores nothing. With `store` true the server stores the post (used by Analyze).

Each post on an account page carries its links, built from the page Instagram returned, so the viewer plays it without another request.

## 3. Server

- Saved sync works as today but writes feed state to `saved_posts`. A full resync hides missing posts in `saved_posts` only. A post first stored by Analyze and later found by saved sync gets its saved row then.
- `POST /api/sync/media/:id { payload, store }`: updates a stored post's links; with `store` true it also creates a post it does not have. Without `store`, an unknown post answers 404.
- `GET /api/posts/known?ids=…` (up to 100 ids): for each stored id, whether it is saved and whether it has a finished report. The account page uses it for "Saved" and report marks.
- `GET /api/reports`: finished reports, newest first, cursor paging. Filters `q` (report text), `author`, `source` (`saved` | `other`), `kind`. Each item: the post, report date, model, and the first ~200 characters of the Summary.
- `GET /api/authors?scope=saved|reports`.
- `GET /api/following?q=…`: the stored following list, filtered by username and full name, in Instagram's order, plus the last update run.
- `POST /api/sync/following/runs`, `…/:id/page`, `…/:id/finish`: called by the extension during **Update list**. A complete run removes accounts it did not see; a run that stopped early removes nothing. A run silent for over 2 minutes shows as stopped, so the owner can start it again.

## 4. Web app

**Routes:** `/` Saved, `/profiles` Profiles, `/profiles/:username` one account, `/reports` Reports. `?post=<id>` opens the viewer on any of them.

**Top bar:** tabs **Saved**, **Profiles**, **Reports**. The search box searches inside the current tab (Profiles has its own box).

**Profiles page:**
- One search box: a name, @username or profile link. Results in two groups: **People you follow** (stored list, instant) and **All Instagram** (after 2 characters and a 400 ms pause). Clicking a result opens the account. Enter on a username or link opens it.
- **People you follow** below: avatar, username, full name; a click opens the account. Header: count, "Updated 3 days ago", **Update list**.

**Account page:** header with avatar, @username, full name, post count, a link to Instagram. Then the filter bar (type, search) and the grid. Posts load as the owner scrolls. A private account the owner does not follow shows a short message instead of the grid. Opening a post plays it right away; the viewer works as in Saved, with Analyze in the Report tab.

**Analyze on a post that is not stored:** the app asks the extension for the post's links with `store` true (one Instagram request), the server stores the post, then the analysis runs as today.

**Reports page:** list rows as above. Filter bar: search, author, source (All / Saved / Not saved), type. Opening a row opens the viewer on the Report tab, every time.

**Viewer:** unchanged, plus a "Saved" badge.

## 5. Errors

- Account not found: "No Instagram account has this name."
- Private and not followed: "This account is private and you do not follow it."
- Login, rate limit, refused: plain messages, as for sync.
- Extension missing or out of date: setup steps, or "update the extension".

## 6. Testing

- Parsers: profile info, user feed, search and following list (inline payloads in the documented shapes; real shapes are checked in the owner's manual run).
- Migration: the test in section 1.
- Core: building account-page posts and their links from a parsed post.
- Extension: open, next page, private account, unknown post links built locally, `store` passed to the server.
- Server: storing a post through the media route, `known`, report filters (`saved`, `other`), following updates.
- Web: account-page filters, error texts, the viewer's start tab.
- Manual check in the real app (`pnpm start`, :4747): open a followed account and an unfollowed one, scroll, play a video, analyze a post that is also saved and see the report in Saved, on the account page and in Reports, update the following list, check the three tabs at phone width.

## Out of scope

- Own tags or categories.
- Keeping posts the owner only looked at.
- Following hashtags or locations.
- Batch unsave (milestone 3).
