# no-fomo — approach (v1)

## Context
Open-source app to manage Instagram saved posts: filter, batch unsave, good video player, AI search over metadata, and on-demand AI analysis of a single video. Must cost the author nothing. Decisions made: **local-first** app, **Chrome extension** to talk to Instagram.

## Research findings (short)
- **Apify instagram-scraper cannot read saved posts** (public data only, $2.70/1k results). Not usable for the core feature. Not needed.
- **Official Instagram APIs do not expose saved posts.** The only way is Instagram's private web API with the user's own session:
  - `GET /api/v1/feed/saved/posts/` (cursor paging, ~21 posts/page)
  - `GET /api/v1/collections/list/`
  - `GET /api/v1/media/{id}/info/` (fresh video URL)
  - `POST /api/v1/web/save/{media_id}/unsave/` (batch delete)
  - Same approach used by Dewey (extension) and simonstrumse/instagram-pipeline (cookies). ~260 posts/min sync is safe in practice.
- Response already holds rich metadata for free: caption, hashtags, author, music, location, date, duration, likes/views, **Instagram's own `accessibility_caption`** (auto image description), thumbnail URL, video CDN URL (expires — `oe=` param).
- **claude-video / claude-watch** (both MIT, Python): ffmpeg scene-detect frames (`select=gt(scene,X)`), uniform fallback, near-duplicate removal, frame cap scaled by length (~30 for <30s), captions → Whisper (Groq or OpenAI) fallback, markdown report with fixed sections. We port this logic to TypeScript (small: ffmpeg calls + rules).
- Gemini can take the whole video file (Files API) — offer as alternative mode.

## Architecture
```
Chrome extension (WXT, TS)  ── uses user's IG session in the browser
   │  sync saved posts, refresh video URLs, run unsave queue
   ▼
Local server (Node + Hono, TS)  ── http://localhost:PORT
   SQLite (Drizzle) + FTS5 + sqlite-vec   ── posts, graph, embeddings, reports
   ffmpeg (temp files only, deleted after analysis)
   AI calls with user's own keys
   ▲
Web app (React Router v8 **SPA mode** + Vite + Tailwind v4 + shadcn/Base UI + Hugeicons + Motion)
   served by the same local server; talks to extension via externally_connectable
```
- **One command start:** `npx no-fomo` (or Docker). Monorepo with pnpm: `apps/extension`, `apps/server`, `apps/web`, `packages/core` (shared types, IG parsing, video pipeline).
- **Why not Supabase/Cloudflare now:** local SQLite = zero setup and zero cost. Keep data access behind a small repository layer so a Cloudflare D1/Postgres backend can be added later for mobile.
- **Difference from tech-stack-example:** the example is React Router SSR on Cloudflare Workers + Supabase. Here we keep the UI stack (React Router, Tailwind v4, shadcn/Base UI, Hugeicons, Motion) but use SPA mode, no `@cloudflare/vite-plugin`, no Supabase, no i18n in v1. Data comes from the local Hono API.
- **Storage cost ≈ 0:** store only metadata + thumbnails (small, cached). Videos never stored.

## Features → how
1. **Connect Instagram:** install extension, open instagram.com logged in, press "Sync". Extension pages through saved feed (2s delay between pages), sends JSON to local server. Also fetches `collections/list` and each collection's posts so every post knows its collections. Incremental sync stops at first known post. **Full resync** button (and a hint after 30 days): walks the whole feed and marks posts missing from Instagram as `removed_remotely`, so unsaves done on Instagram itself are noticed.
2. **Saved posts panel:** grid with filters (author, collection, type = video/image/carousel, date, has-report), multi-select. **Batch unsave:** extension runs a throttled queue (1 request / 3–5s, random jitter, stop on any 4xx/429), shows progress, marks posts removed locally only after success. Clear warning: unofficial API, small account risk.
3. **On-demand media:** on open, check if stored URL expired → ask extension for fresh URL via `media/{id}/info` → play in custom player. Images and carousels open in a simple lightbox with swipe/arrow keys. Player: Vidstack (MIT, low-maintenance since 2024 — verify in milestone 2; fallback is Media Chrome) with speed 0.5–3x, keyboard seek, frame step, loop, A-B loop, remember position. Proxy through local server only if CDN blocks direct playback (supports HTTP range).
4. **Knowledge graph + semantic search (metadata only):**
   - **Free path (default, no key needed):** nodes from data already in metadata — author, hashtags, collection, music, mentions — plus local embeddings of caption + accessibility_caption.
   - **Optional enrichment** (only when the user sets an LLM key; batched, cheap model): topics, entities (tools, people, brands), category, language — from caption, hashtags, author, music, accessibility_caption. Adds topic/entity nodes to the same graph.
   - Graph in SQLite: `nodes` (post, author, topic, entity, hashtag) + `edges` (post→topic, etc.) + topic co-occurrence weights.
   - Embeddings: **local, free by default** (transformers.js, e.g. multilingual small model); OpenAI embeddings optional.
   - Search "posts about claude code": hybrid = FTS5 keyword + vector similarity + graph expansion (matching topic nodes) → ranked post grid in the UI.
   - **AI report** page: top topics/authors, trends over time, clusters, forgotten saves; LLM writes a short summary from aggregated stats (not raw posts).
5. **Analyze one post (lazy):** button "Analyze" →
   - Video, Mode A (default): download video to temp dir → ffmpeg scene frames (ported claude-video rules) → transcribe (OpenAI or Groq Whisper key) → vision LLM gets metadata + frames + transcript → markdown report.
   - Video, Mode B: Gemini key → upload video to Gemini Files API → same report template.
   - Image / carousel: download the image(s) to temp dir → vision LLM gets metadata + images (no ffmpeg, no Whisper) → same report template.
   - Report saved in DB; temp files deleted. Buttons: **Copy as Markdown**, **Download .md** (to use in any AI). No chat.
6. **AI provider layer:** Vercel AI SDK so one code path supports OpenAI, Gemini, Anthropic, Groq. Keys stored locally in an encrypted file (`~/.no-fomo/keys.enc`, AES-256-GCM, machine-bound secret; `keytar` is archived and not used), never sent anywhere except the chosen provider.

## Milestones
1. Monorepo + extension sync (posts + collections) + SQLite + basic grid with author, collection and type filters.
2. Video player + image lightbox with on-demand URL refresh. Full resync.
3. Batch unsave queue.
4. Analyze (video Mode A, image path, then video Mode B).
5. Free graph + local embeddings + semantic search. Optional LLM enrichment.
6. Knowledge graph view + AI report.
7. Packaging (`npx`, Docker), README, security review.

## Main risks
- Instagram changes private endpoints → keep all IG calls in one module in `packages/core`, with tests on saved JSON samples.
- Account flags from unsave/sync → strict throttle, user-visible limits, no background loops.
- Instagram ToS: unofficial access; state clearly in README (user acts on own account).

## Verification
- Unit tests: IG response parsing (fixtures), frame-selection rules, search ranking.
- Manual e2e: sync a real account with ~100 saves, filter by collection and type, play 5 videos after URL expiry, open 1 carousel, unsave 3 posts and confirm on Instagram, unsave 1 post on Instagram and confirm full resync marks it, analyze 1 reel in both modes and 1 image post, search "claude code" returns expected posts without any LLM key.
- agent-browser checks of UI on desktop and phone width.
