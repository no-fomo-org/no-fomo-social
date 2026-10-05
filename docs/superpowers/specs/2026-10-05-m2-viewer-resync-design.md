# Milestone 2: Viewer, fresh media links, full resync

**Date:** 2026-10-05
**Source:** `PLAN.md` milestone 2: "Video player + image lightbox with on-demand URL refresh. Full resync."

## Goal

The owner opens any saved post and watches it in a player that is better than instagram.com, or looks at its photos in a lightbox. Expired media links are renewed on the fly. A full resync finds posts the owner unsaved directly on Instagram and hides them.

## Decisions (agreed with the owner)

- Posts open in a **large viewer**, not in the current side panel.
- Posts unsaved on Instagram are **hidden** after a full resync. The sync note shows how many.
- Player library: **Video.js 10** (`@videojs/react`, Apache-2.0, GA 2026-10-01). Vidstack is no longer actively developed (its team moved to Video.js 10). Fallback if Video.js 10 blocks a needed feature: our own controls on a plain `<video>`.
- Media plays **directly from the Instagram CDN**. Checked on real data: video and image responses send `cross-origin-resource-policy: cross-origin`, video supports HTTP range (206). No local proxy. Videos are never stored.

## 1. Viewer (web)

- Replaces `PostSheet`. A full-window dark dialog (Base UI Dialog).
- Desktop: media stage on the left (fills the height, keeps aspect ratio), details column on the right (~360px): author, caption, details, "Open on Instagram", "More from @author", previous/next buttons.
- Phone width: media on top, details scroll below. Swipe left/right moves between carousel items.
- Keys: Up/Down = previous/next post. Left/Right = seek 5s in a single video post; in a carousel, Left/Right always move between items (Shift+Left/Right seeks a carousel video). Esc = close. Keys are ignored while focus is in a text field.
- While a fresh link loads, the stage shows the cached thumbnail with a small spinner.

## 2. Player

- `@videojs/react` with its skin copied into `apps/web/app/components/player/` and styled with our tokens (DESIGN.md: Geist, Hugeicons, one accent).
- Opens and plays with sound (opening the post is a user gesture). If the browser blocks it, show the normal play button.
- Speed 0.5x to 3x. Loop on by default. Fullscreen. Space = play/pause, M = mute, F = fullscreen.
- Frame step: `,` and `.` step back/forward one frame while paused (1/30 s).
- A-B loop: one button. 1st press sets A, 2nd sets B (loop A to B), 3rd clears.
- Resume: remember the position per post (localStorage, last 500 posts). Resume only if the saved position is more than 5s in and more than 5s before the end. Remember volume and mute.
- Pure logic (A-B state machine, resume rule, position store) lives in plain TS modules with unit tests.

## 3. Photos and carousels

- Single image: full-size image in the stage.
- Carousel: arrows, dots ("2 of 7"), swipe, Left/Right keys. A video item inside a carousel uses the same player. Only the current item and its neighbours load.

## 4. Media links and refresh

**Data.** The parser emits `parts` for every post (one part for a single image or video), so single images get a full-size URL (today only a small thumbnail is stored). Old posts without parts get them on the next sync or on first refresh.

**Server.**
- `GET /api/posts/:id/media` returns `{ id, kind, parts: [{ index, kind, imageUrl, videoUrl, width, height }], expiresAt }`. `expiresAt` = earliest `oe` expiry across the post's URLs (null if unknown).
- `POST /api/sync/media/:id` (called through the extension relay) takes the raw `media/{id}/info` response, parses it with the same parser, updates the post row and replaces its parts, and returns the same shape as the GET. The id in the path must match the parsed post id.
- Ids must match `^\d+$`. Same security rules as other `/api/sync/` routes.

**Extension.**
- New external message `media:refresh { id }` from the app origin only. `id` must be digits.
- Background finds or opens the Instagram tab and sends it `media:fetch { id, serverUrl }`.
- The content script runs one `GET /api/v1/media/{id}/info/` through the core IG client, then relays the body to `POST /api/sync/media/:id`.
- One shared request gate in the content script for sync and refresh: at least 2s + 0-1s jitter between any two Instagram requests. A 429, spam, or `status: fail` stops all Instagram requests for 10 minutes and returns `rate_limited`.

**Web flow.**
1. Viewer opens → `GET /api/posts/:id/media`.
2. If there are no parts, or `expiresAt` is less than 10 minutes away → ask the extension for a refresh, then use the reply.
3. If a `<video>` or `<img>` fails to load → refresh once. A second failure shows an error.

**Error messages** (plain English, no dashes):
- Extension missing: "Install the no-fomo extension to play posts." with the setup steps.
- Logged out: "Log in to Instagram in this browser, then try again."
- Rate limited: "Instagram asked to slow down. Try again in a few minutes."
- Post gone (404 or "Media not found"): "This post was deleted on Instagram." Every error also offers "Open on Instagram".

## 5. Full resync

- Sync control gets a small menu next to Sync with "Full resync" and one line explaining it takes longer (about 2 minutes per 1,000 posts).
- Hint: if no full resync finished in the last 30 days (or never), the sync note shows "Full check suggested" as a link that starts one.
- `sync:start` takes `mode: "incremental" | "full"`. The server's `startRun` honours a requested `full` (it already forces `full` until the first backfill is done).
- A full run walks the whole saved feed (never stops at known posts).
- At finish, only if the run is `done` and reached the end of the feed (`savedComplete` with no more pages): every visible post with `lastSeenRunId < runId` gets `removedRemotelyAt = now`.
- Safety rule: if that would hide more than 30% of visible posts (and more than 20 posts), hide nothing and record a warning on the run: "Full resync found too many missing posts. Nothing was hidden. Try again later."
- New columns on `sync_runs`: `posts_removed`, `warning`. New setting `last_full_at`.
- A post seen again later becomes visible again (the upsert already clears `removedRemotelyAt`).
- Sync note after a full run: "Synced just now, 3 removed on Instagram".

## 6. Testing

- Core: parser emits one part for single posts; media info fixture parses; request gate spacing and 10-minute stop.
- Server: media GET shape and `expiresAt`; media refresh updates post and parts, rejects id mismatch and bad ids; full-run removal marking; safety rule; incomplete or failed run marks nothing; reappearing post becomes visible; `last_full_at` set.
- Extension: `media:refresh` rejects untrusted senders and non-digit ids.
- Web: A-B loop states, resume rule, position store cap.
- Browser check (agent-browser) at desktop and phone width: open video, image, carousel; keys; error states with extension missing.
- Manual with a real account: play 5 videos after link expiry, open 1 carousel, unsave 1 post on Instagram and confirm full resync hides it.

## Out of scope

Batch unsave (milestone 3), analysis (milestone 4), any video download or local proxy.
