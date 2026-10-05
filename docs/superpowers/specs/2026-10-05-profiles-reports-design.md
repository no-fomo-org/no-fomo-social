# Profiles and Reports tabs

**Date:** 2026-10-05
**Source:** owner request, not in `PLAN.md`. It turns no-fomo from "saved posts only" into a place for any Instagram post the owner wants to watch, filter and analyze.

## Goal

The app gets three tabs:

1. **Saved:** today's library of saved posts.
2. **Profiles:** the owner adds any Instagram account and works with its posts the same way as with saved posts: grid, filters, search, viewer, player, Analyze.
3. **Reports:** every report in one place, with its own filters.

A post is stored once. If the owner analyzes a post from a profile and the same post is also saved, the report shows in both places, and in the Reports tab once.

## Decisions (agreed with the owner)

- **Profiles are added to the library.** Their posts are kept (metadata and thumbnails only, as for saved posts). Videos are never stored.
- **Load size:** adding a profile loads the newest ~100 posts. A **Load older posts** button loads the next ~100. **Refresh** loads only posts newer than the newest one we have.
- **Profile filters:** type (video, photo, carousel) and search text. No collections (profiles have none). No own tags in this work.
- **Saved tab:** the **Has report** filter is removed. Everything else stays.
- **Reports tab:** a list. Each row: thumbnail, author, post date, report date, first lines of the summary. Filters: report text, author, source (saved / profile), type. A click opens the usual viewer on the **Report** tab.
- A report stays in the Reports tab after its post is unsaved or its profile is removed.

## 1. Data model

Today `posts` mixes two things: the post itself and its place in the saved feed (`sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at`). This work splits them.

**`posts`** keeps only the post: id (Instagram media id), code, kind, author, caption, counts, links, thumbnail, and so on. Same columns as today minus the saved-feed ones.

**`saved_posts`** (new): one row per post that is or was in the saved feed.
- `post_id` (primary key, references `posts`, cascade delete)
- `sort_key`, `first_seen_run_id`, `last_seen_run_id`, `removed_at`, `removed_remotely_at`: moved from `posts` unchanged.
- Index on `sort_key`.

**`profiles`** (new): one row per added account.
- `author_id` (primary key, references `authors`): the Instagram user id.
- `added_at`, `refreshed_at`
- `post_count`: from Instagram's profile info, shown as "120 of 3,400 loaded".
- `older_cursor`: Instagram's `next_max_id` for **Load older posts**. Null when the end is reached.
- `is_private`: private accounts the owner does not follow cannot be loaded. The app says so.

**`profile_posts`** (new): `author_id`, `post_id`, primary key on both, cascade delete on both. A post's place in a profile grid is its `taken_at`, newest first. (Instagram puts pinned posts first in its feed. We ignore pins.)

**`reports`** does not change. It is already keyed by `post_id`, so one report per post, wherever the post came from.

**Migration** (one Drizzle migration, run on start like the others):
1. Create `saved_posts` and copy the five columns from every existing post. Every post today is a saved post.
2. Drop those columns from `posts` (SQLite table rebuild, which Drizzle generates).
3. Create `profiles` and `profile_posts`.
4. `post_search` and `report_search` stay as they are.

A test opens a database at migration 0007 with sample rows, runs the new migration, and checks that every post, report and collection link is still there and that the saved order is the same.

**Deleting.**
- Removing a profile deletes its `profiles` row and its `profile_posts` rows. Then each of its posts is deleted only if it has no `saved_posts` row, no report, and no link to another profile. Thumbnails of deleted posts are deleted too.
- Unsaving (milestone 3, later) only changes `saved_posts`. The post and its report stay.

## 2. Instagram calls (extension)

All Instagram calls stay in the extension and in `packages/core/src/ig`, as today. Three new client calls:

- `profileInfo(username)`: `GET /api/v1/users/web_profile_info/?username=...`. Gives user id, username, full name, avatar, post count, private flag.
- `userFeed(userId, cursor)`: `GET /api/v1/feed/user/{userId}/?count=12&max_id=...`. Items are plain media objects, which `parseMediaPage` already reads.
- `searchUsers(query)`: `GET /api/v1/web/search/topsearch/?context=user&query=...`. Used for suggestions while typing.

These endpoint shapes come from public sources. The first implementation task calls each one once from the owner's browser, saves the answers as test fixtures (personal data replaced), and adjusts the parser if the shape differs. If an endpoint does not work, we stop and decide again with the owner.

**Load runner** (`packages/core/src/profiles/run-profile.ts`, same pattern as `run-sync.ts`):
- Modes: `add` (newest ~100), `older` (next ~100 from `older_cursor`), `refresh` (newest pages until a known post).
- 2–3 s pause between requests, same error handling as sync (login, rate limit, refused). At most 9 pages (about 100 posts) per run.
- Only one Instagram job runs at a time in the extension: a profile load waits if a sync is running, and the other way round.

**New extension messages:** `profile:search` (returns suggestions, no server writes) and `profile:load` (mode + username or user id). Media link refresh (`media:fetch`) already works for any post id.

## 3. Server

**Ingest.**
- Saved sync works as today but writes feed state to `saved_posts` instead of `posts`. A full resync hides missing posts in `saved_posts` only.
- New `ingestProfilePage(db, authorId, raw)`: upserts posts (shared code with saved ingest: author, parts, search, thumbnail jobs) and adds `profile_posts` links. It never touches `saved_posts`, so a profile load never changes the saved list.
- `ingestMediaInfo` stays the same. It works for any post in `posts`.

**API.**
- `GET /api/posts` gets a `scope`: `saved` (default) or `profile:<authorId>`. The `report=1` filter is removed. Collection filter only applies to `saved`.
- `GET /api/authors` takes the same `scope` so the author picker only lists authors in that tab.
- `GET /api/profiles`: list of added profiles with counts.
- `POST /api/profiles/runs`, `.../:id/page`, `.../:id/finish`: same shape as sync runs, called by the extension.
- `DELETE /api/profiles/:authorId`: remove a profile (rules above).
- `GET /api/reports`: finished reports, newest first, cursor paging. Query: `q` (report text, via `report_search`), `author`, `source` (`saved` | `profile`), `kind`. Each item: the post (same shape as in the grid), report date, model, and the first ~200 characters of the Summary section.
- Every post item gets `saved: boolean` and `profiles: string[]` so the viewer can show "Saved" and "From @name" badges.

## 4. Web app

**Routes** (each tab has its own address, so back and forward work):
- `/` → Saved (today's library).
- `/profiles` → list of added profiles and the add box.
- `/profiles/:username` → one profile's grid.
- `/reports` → Reports list.
- `?post=<id>` keeps opening the viewer on any of them, as today.

**Top bar.** Three tabs after the app name: **Saved**, **Profiles**, **Reports**. The search box searches inside the current tab. Sync stays in the top bar (it only touches Saved).

**Profiles page.**
- An add box: type a username or paste a profile link. Suggestions appear as you type (after 2 characters, 400 ms pause, at most one request per second). Pressing Enter on a username adds it directly.
- Added profiles as cards: avatar, name, "120 of 3,400 posts loaded", last refresh time, **Refresh**, **Remove** (asks first).
- While a load runs, the card shows progress ("Loading page 3 of up to 9").

**Profile grid.** Same grid, tiles and viewer as Saved. Filter bar with type and search. At the bottom: **Load older posts** while there are more.

**Reports page.** List rows as described above. Filter bar: search, author picker, source switch (All / Saved / Profiles), type switch. Opening a row opens the viewer with the **Report** tab selected. Prev / next in the viewer move through the report list.

**Viewer.** Unchanged, plus small badges: "Saved" and "From @name". Analyze works the same in every tab.

## 5. Errors

- Profile not found, or private and not followed: a clear message on the add box. Nothing is stored.
- Login, rate limit, refused: same messages as sync. Posts already loaded in that run are kept. The run can be repeated.
- The extension is missing or not connected: same setup steps as Saved.

## 6. Testing

- **Parser:** profile info, user feed and search fixtures (from the real calls in task 1).
- **Migration:** the test in section 1.
- **Ingest:** a profile page never changes `saved_posts`; the same post arriving from saved sync and from a profile is one row; removing a profile keeps saved posts and posts with reports.
- **Queries:** scope filters; reports list filters (text, author, source, kind); a report made from a profile post shows on that post in the Saved tab.
- **Load runner:** modes, page cap, error stop (fake client, as in `run-sync.test.ts`).
- **Manual check in the real app** (`pnpm start`, :4747): add one profile, load older, refresh, analyze a profile post that is also saved and see the report in Saved and in Reports, remove the profile and see the saved post and the report remain, check the three tabs at phone width.

## Out of scope

- Own tags or categories.
- Loading a whole profile automatically.
- Following hashtags or locations.
- Batch unsave (milestone 3).
