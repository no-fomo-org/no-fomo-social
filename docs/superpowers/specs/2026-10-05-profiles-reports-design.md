# Home, Saved and Reports tabs

**Date:** 2026-10-05, revised 2026-10-06 after the owner's second try.
**Source:** owner request, not in `PLAN.md`. It turns no-fomo from "saved posts only" into a place for any Instagram post the owner wants to watch and analyze.

## Goal

The app has three tabs:

1. **Home:** search any Instagram account and see the accounts the owner follows. Picking an account shows its posts inside Home. The owner can open a post and generate a report.
2. **Saved:** today's library of saved posts.
3. **Reports:** every generated report in one place.

A post is stored once. If the owner analyzes a post from an account on Home and the same post is saved (now or later), it is the same post: Saved and Reports both show its report.

## What went wrong in the second version

The screens worked, but Instagram refused calls and the app stopped all Instagram work for 10 minutes again and again ("Instagram calls are paused…"). Saved sync then failed too. Causes found:

- Many calls in a short time: 3 syncs and 3 following-list updates (18 pages of 100 accounts) in about 3 minutes, plus account pages that loaded more posts by themselves while scrolling, and search that called Instagram while typing.
- The 10-minute pause lived only in the Instagram tab's memory. Reloading the tab ended it, and the next calls hit Instagram while it was still limiting the account.
- No record of Instagram calls, so nobody could see which call Instagram refused.

This revision keeps the data model and server work, and changes the screens and how the app talks to Instagram (section 2).

## Decisions (agreed with the owner)

- **Three tabs: Home, Saved, Reports.** No separate account page and no separate Profiles tab.
- **Account posts show inside Home.** Picking an account replaces the following list with that account's posts and a **< Back** link. The first 12 posts load on open, **Load more** adds 12. Nothing loads by itself. No filters on an account's posts.
- **Nothing is kept from browsing.** Only a post the owner analyzes is stored, with its report.
- **Saved tab:** unchanged, except the **Has report** filter is removed (Reports covers it).
- **Reports tab:** a list. Each row: thumbnail, author, post date, report date, first lines of the summary, and "Saved" when the post is saved. Filters: report text, author, source (**Saved / Not saved**), type. A click opens the usual viewer on the **Report** tab. A report stays after its post is unsaved.
- **Accounts the owner follows:** the app keeps a copy of the list (names and avatars only). **Update list** loads it again, only when pressed.
- **Instagram safety** (section 2) applies to every Instagram call: saved sync, following list, search, account posts, post links.

## 1. Data model

Unchanged from the second version (migrations 0008–0010 are applied on the owner's database).

- **`posts`** keeps only the post content. A post is in `posts` when it is saved or was analyzed.
- **`saved_posts`**: one row per post that is or was in the saved feed (`sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at`).
- **`following`**: `author_id` (references `authors`), `position`, `last_seen_run_id`. Names and avatars live in `authors`.
- **`following_runs`**: one row per **Update list** run.
- **`reports`**: keyed by `post_id`, so one report per post, wherever the post came from.
- **`ig_calls`** (new, migration 0012): one row per Instagram call: `id`, `at` (ms), `kind` (`saved`, `collections`, `post`, `profile`, `feed`, `search`, `following`), `status` (HTTP status, or 0 when the network failed), `result` (`ok`, `rate_limited`, `refused`, `login_required`, `not_found`, `error`), `ms` (duration). The server keeps the newest 2,000 rows and deletes older ones on insert.

## 2. Instagram safety (extension)

All Instagram calls stay in the extension and in `packages/core/src/ig`, and every call goes through one **request gate**. The gate's state is kept in `browser.storage.local`, so it is shared by every Instagram tab and survives reloads.

**Pace**
- One call at a time, with a 3–6 s random pause between two calls.
- At most **150 calls in any 60 minutes**. The gate keeps the times of recent calls in storage.
  - Saved sync waits until a call is allowed again and goes on.
  - Everything else (**Update list**, search, open account, **Load more**, post links, Analyze) does not wait. It fails with code `budget` and the time when calls are allowed again. (An **Update list** that waited would look stopped to the app after 2 minutes.)
  - A call that does not wait never queues behind a sync that is waiting: it fails at once.
  - Tabs change the shared state under one browser lock (Web Locks, `no-fomo-ig-gate`), so one tab never writes over another tab's stop.

**After Instagram refuses** (HTTP 429, `spam: true`, "wait a few minutes", `feedback_required`, or `status: "fail"` that is not "not found")
- The gate stops all calls for **15 minutes**. If the first call after that is refused again, **1 hour**, then **6 hours** for every further refusal.
- A successful call resets the step back to 15 minutes.
- During the stop, calls fail at once with code `paused`, the end time and Instagram's answer. No call reaches Instagram.
- Login errors (401, 403, `require_login`) do not start a stop, except when the answer says "wait a few minutes", has `spam: true` or `feedback_required`: those are limits, whatever the status code.

**Status for the app**
- New extension message `ig:status` → `{ pausedUntil, reason, budgetUntil }` (times in ms or null). The background script answers it from `browser.storage.local`, without an Instagram tab. The web app asks for it every 30 s and right after any `paused` or `budget` answer.
- A banner under the top bar, on every tab, while a stop or the hourly limit is on. Stop: "Instagram is limiting calls. Try again at 15:30." (Instagram's answer as a tooltip). Hourly limit: "The app made many Instagram calls this hour. Try again at 15:30." Buttons that always need Instagram (Sync, Update list, search on Enter, Load more) are disabled until then. Analyze stays on, because a stored post with fresh links needs no Instagram call; when it does need one, it shows the same text.

**Call log**
- After each call, the extension sends `{ at, kind, status, result, ms }` to `POST /api/sync/ig-calls` (through the background relay, as for sync; the relay only allows `/api/sync/` paths). A failed log write never fails the call. Calls stopped by the gate never reach Instagram and are not logged.
- Every message to the Instagram tab carries `serverUrl`, so the tab always knows where to send the log.
- Nothing in the app shows the log. It is for finding the cause of the next refusal (`sqlite3 ~/.no-fomo/no-fomo.db "select * from ig_calls order by id desc limit 50"`).

**Calls**
- `savedPage`, `collectionsPage`, `mediaInfo`: as today.
- No `web_profile_info` and no `feed/user/{id}`: Instagram refuses the first for everyone since August 2026 and serves a web page instead of data for the second since about September 2026. An account's posts are read the way Instagram's own page reads them:
  - A small script in Instagram's page (`instagram-page.content.ts`, runs before Instagram's code) only watches. When the page asks its profile posts query (`PolarisProfilePostsTabContentQuery_connection`, a GraphQL POST to `/graphql/query`), it passes the request (query id, tokens, headers) and the answer to the extension.
  - **Open account:** the background script opens a hidden Instagram tab on `instagram.com/<name>/` (reused for the next accounts, opened again if closed). The page loads the first 12 posts; the answer is the first page. Counted as one call in the gate and the log (kind `feed`). A limit is checked before the page loads.
  - **Load more:** the same query is repeated with the cursor, using the ids and tokens copied from the page, so a rotated query id needs no code change. The answer is read like every other call (refusals start a stop).
  - The page shows login, a private account or a missing account in its text; those become `login_required`, `private`, `not_found`. No answer in 20 s is `bad_response` with a plain message.
  - The account's names and avatar come from its first post. The cursor is `<username>:<Instagram cursor>`.
- `searchUsers(query)`: `GET /api/v1/web/search/topsearch/?context=blended&query=…`.
- `followingPage(viewerId, cursor)`: `GET /api/v1/friendships/{viewerId}/following/?count=50&order=date_followed_latest&max_id=…` (50 per page instead of 100; the page cap goes from 50 to 100, still about 5,000 accounts).

**Messages from the app page to the extension:** `profile:search`, `profile:open`, `profile:page`, `following:update`, `media:refresh { id, store }`, `sync:start`, as in the second version, plus `ig:status`.

## 3. Server

As in the second version, plus the call log:

- Saved sync writes feed state to `saved_posts`. A full resync hides missing posts in `saved_posts` only. A post first stored by Analyze and later found by saved sync gets its saved row then.
- `POST /api/sync/media/:id { payload, store }`: updates a stored post's links; with `store` true it also creates a post it does not have.
- `GET /api/posts/known?ids=…` (up to 100 ids): for each stored id, whether it is saved and whether it has a finished report.
- `GET /api/reports`: finished reports, newest first, cursor paging. Filters `q`, `author`, `source` (`saved` | `other`), `kind`.
- `GET /api/authors?scope=saved|reports`.
- `GET /api/following?q=…`: the stored following list, filtered by username and full name, plus the last update run.
- `POST /api/sync/following/runs`, `…/:id/page`, `…/:id/finish`: a complete run removes accounts it did not see; a run that stopped early removes nothing.
- `POST /api/sync/ig-calls` (new): stores one call log row.

## 4. Web app

**Routes:** `/` Home, `/saved` Saved, `/reports` Reports. On Home, `?account=<username>` shows that account's posts. `?post=<id>` opens the viewer on any tab. The old `/profiles` and `/profiles/:username` routes are removed.

**Top bar:** tabs **Home**, **Saved**, **Reports**, the Instagram banner (section 2), and the Sync button on Saved only.

**Home, list view (no `account` param):**
- One search box: a name, @username or profile link.
  - While typing, the following list below is filtered at once (stored list, no Instagram call).
  - **Enter** searches all of Instagram (one call) and shows the results above the list under **All Instagram**. Enter on a profile link or an exact @username opens that account directly.
- **People you follow**: avatar, username, full name. Header: count, "Updated 3 days ago", **Update list**. Clicking a row opens the account.

**Home, account view (`?account=natgeo`):**
- **< Back** (returns to the list with the search text kept), avatar, @username, full name, post count, link to Instagram.
- The grid of posts: the first 12 on open, **Load more** adds 12. Loaded posts stay as they are while the owner stays on the account or comes back from the viewer; nothing reloads by itself.
- Posts the app stores show the "Saved" mark and the report mark (from `/api/posts/known`).
- A private account the owner does not follow shows a short message instead of the grid.
- A failed load keeps the posts already shown and shows the error with **Try again**.

**Viewer:** as today. A post opened from an account plays from the links that came with the page (no call). If those links have expired, it asks for fresh ones (`media:refresh`, `store` false, one call). **Analyze** on a post that is not stored asks for its links with `store` true (one call), the server stores the post, then the analysis runs as today.

**Saved:** as today, without the **Has report** filter. A post analyzed from Home shows its report here once it is saved.

**Reports:** rows and filters as in Decisions. Opening a row opens the viewer on the Report tab.

## 5. Errors

- `paused` / `budget`: the banner text with the time, also shown where the action was pressed.
- Account not found: "No Instagram account has this name."
- Private and not followed: "This account is private and you do not follow it."
- Login: "Log in to Instagram in this browser, then try again."
- Extension missing or out of date: setup steps, or "update the extension".

## 6. Testing

- Gate (core, fake clock and fake storage): one call at a time, pause between calls, the 150-per-hour limit (background calls wait, owner calls fail with `budget`), stop steps 15 min → 1 h → 6 h, reset after success, state read back from storage after a "reload", login errors start no stop.
- Call log: one log record per call with the right `kind` and `result`; a failing log write does not fail the call.
- Server: `POST /api/sync/ig-calls` stores rows and keeps only the newest 2,000.
- Web: Home list and account views from the URL, Back keeps the search text, Load more, no load by itself, banner text and disabled buttons while paused.
- Existing tests for parsers, migration, known, reports and following stay.
- Manual check in the real app (`pnpm start`, :4747): search on Enter, open a followed account and an unfollowed one, Load more, play a video, analyze a post and see the report in Reports, save that post on Instagram, sync, and see the report in Saved; check the banner by forcing a stop; check the three tabs at phone width.

## Out of scope

- Filters on an account's posts.
- Showing the call log in the app.
- Own tags or categories.
- Keeping posts the owner only looked at.
- Batch unsave (milestone 3).
