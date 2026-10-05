# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Heavy savers: people who save hundreds of Instagram reels and posts to learn from later, then lose track of them. Saving is easy, and finding or using a save later is hard. They are comfortable running a local app with one command and installing an unpacked Chrome extension.

Their job: find a saved post again, watch it properly, understand what it contains, and clear out saves they no longer need.

## Product Purpose

no-fomo turns an Instagram saved list into a library the user can actually use. It syncs saved posts into a local app, lets the user filter, watch and clean them up, and helps them understand saved videos without rewatching them.

Success means the user stops losing saves. They can find any post in seconds, get the substance of a video without rewatching it, and keep the saved list small enough to stay useful.

## Positioning

Two things set no-fomo apart, confirmed by the owner:

1. **It understands the videos.** Users can search saved posts by meaning, for example "posts about claude code". They can also get a report on one video, built from its frames and spoken audio. The report exports as Markdown so the user can take it to any AI. There is no built-in chat by design.
2. **It is better than Instagram's own UI for saved posts.** It offers a real video player, fast filters by author, collection and type, and batch cleanup that syncs back to Instagram.

Running locally and being free are constraints of the project, not its main selling points.

## Operating Context

- The app runs on the user's own computer at `http://localhost:4747`. The data lives in `~/.no-fomo`.
- A Chrome extension syncs saved posts through the user's own logged-in instagram.com session. A sync starts only when the user asks for one.
- The main setting is desktop Chrome. The UI must also work at phone width.
- Saved content is often not in English. The owner's library contains Russian-language reels, for example.

## Capabilities and Constraints

**Shipped (milestone 1):** sync of saved posts and collection membership, a grid with author, collection and type filters, and a detail sheet with a link to the post on Instagram.

**Shipped (milestones 2 and 4):** video player and photo viewer with link refresh, full resync, and a per-post AI report with the user's own OpenAI key.

**Shipped (profiles and reports):** a Profiles tab to add any Instagram account and browse, filter and analyze its posts, with the list of people you follow and search across Instagram; a Reports tab with every report and its own filters. A post is stored once, so a report shows wherever the post appears.

**Planned:** see `PLAN.md`.
- Batch unsave.
- Groq and Gemini options for the per-post report.
- Semantic search and a topic map.
- An AI report on the whole library.
- Packaging with `npx` and Docker.

**Decided:**
- Collection names: Instagram no longer serves them (October 2026). Users name each collection once inside the app. Membership still comes from the saved feed.

**Constraints:**
- **No cost for the author.** Users bring their own AI keys. There are no hosted services in v1.
- **Unofficial Instagram API.** The app uses Instagram's private web API with the user's session. Requests are slowly throttled, and the user is warned about a small risk to their account. Instagram changes or retires endpoints without notice. For example, the web collections list and the per-collection feeds returned 404 in October 2026.
- **No stored videos.** Videos are only downloaded on demand and deleted after analysis. Only thumbnails and metadata are kept.
- **Open source.** The project's licence has not been chosen yet.

**Open decisions:**
- A mobile app comes later. Its platform and backend (Cloudflare or another option) are not decided.

## Brand Commitments

- Name: **no-fomo**, written in lowercase.
- Voice: plain, short, simple English that a non-native speaker reads easily. No jokes, no filler words, and no hype.

## Evidence on Hand

- There are no users, testimonials, metrics or press yet. Do not invent any.
- The owner's real library has 544 saved posts. It is private and must not appear in screenshots or public materials.
- The seed script (`apps/server/scripts/seed.ts`) provides fake demo data with placeholder photos for UI work.

## Product Principles

1. **The saved post is the hero.** Every screen helps the user get back to a specific post or its substance fast.
2. **Understanding over hoarding.** The product should help users get value from a save, or let it go, not just keep more of them.
3. **The user stays in control of their account.** Nothing touches Instagram without a clear action from the user, and every action is slow, visible and reversible where possible.
4. **Honest about fragility.** When Instagram breaks something, the app explains what happened in plain words and keeps working with what it still has.
5. **Outputs travel.** Reports and data export to plain formats like Markdown, so users can take them to any tool.

## Accessibility & Inclusion

- All UI copy uses plain, simple English for non-native readers.
- Content in other languages and scripts must display correctly. This includes Cyrillic captions and hashtags.
