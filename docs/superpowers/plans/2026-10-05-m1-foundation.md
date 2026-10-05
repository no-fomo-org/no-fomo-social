# Milestone 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user installs the extension, presses Sync in the local web app, and sees all their Instagram saved posts in a fast grid they can filter by author, collection and type.

**Architecture:** pnpm monorepo. `packages/core` holds Instagram parsing, the Instagram HTTP client and the sync loop (pure TS, no Node or DOM APIs). `apps/server` (Hono + better-sqlite3 + Drizzle) stores posts and caches thumbnails on `127.0.0.1:4747`. `apps/extension` (WXT, MV3) runs the sync loop in a content script on instagram.com and relays pages to the server through its background worker. `apps/web` (React Router 8 SPA mode) is served by the server and talks to the extension via `externally_connectable`.

**Tech Stack:** Node 22, pnpm 12, TypeScript 7, Vitest 5, Hono 4, @hono/node-server 2, Drizzle ORM 0.45 + drizzle-kit 0.31, better-sqlite3 13, Zod 4, WXT 0.21, React Router 8.4, Vite, Tailwind 4.3, Base UI 1.8, Hugeicons, TanStack Query 5, Geist fonts.

**Spec:** `PLAN.md` (approach v1) and `product-idea.md`. This plan covers milestone 1 only: "Monorepo + extension sync (posts + collections) + SQLite + basic grid with author, collection and type filters."

## Global Constraints

- Node `>=22`, pnpm via corepack, ESM everywhere, TS `strict` + `noUncheckedIndexedAccess`.
- Server binds `127.0.0.1` only. Default port `4747` (`NO_FOMO_PORT`). Data dir `~/.no-fomo` (`NO_FOMO_HOME`).
- Instagram requests only from the content script on `https://www.instagram.com`. At least 2s + 0-1s random jitter between requests. Stop on any 4xx, 429 or `status: "fail"`. No background loops, sync only on user action.
- All Instagram endpoint paths and response parsing live in `packages/core/src/ig/`.
- Videos are never stored. Only thumbnails and avatars are cached on disk.
- Mutating server routes accept only `application/json`, from allowed origins, with an allowed `Host` header.
- UI follows `DESIGN.md`. Zero em-dashes or en-dashes in any UI string. Hugeicons only. Geist + Geist Mono. Light and dark themes via `prefers-color-scheme`. One accent color.
- UI copy is plain, simple English (the owner is a non-native speaker).

## Review Focus

1. **Interrupted first sync.** If the first sync dies halfway, the next sync must continue walking the whole feed, not stop at the first known post. Test in Task 3.
2. **Odd Instagram items.** Null caption, empty full name, unknown `media_type`, item without `media`, carousel with mixed children, Cyrillic hashtags. Parser skips or degrades, never throws. Test in Task 1.
3. **Logged out of Instagram.** 401/403, HTML login page, or `require_login` must end the sync with a clear "Log in to Instagram" message. Test in Task 2.
4. **Rate limit.** 429, `spam: true` or `status: "fail"` stops the sync at once and records the error. No more Instagram calls after it. Test in Task 2.
5. **Hostile web page.** A random site posting to `localhost:4747`, DNS rebinding with a foreign `Host`, path traversal in media ids. All rejected. Test in Task 4.

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, vitest.config.ts, .gitignore, README.md, DESIGN.md
scripts/gen-extension-key.mjs              fixed extension id for unpacked installs
packages/core/
  src/index.ts                             public exports
  src/api.ts                               API types shared by server and web
  src/constants.ts                         port, version
  src/extension-id.ts                      generated: extension public key + id
  src/ig/types.ts                          parsed Instagram types
  src/ig/text.ts                           hashtag / mention extraction
  src/ig/url.ts                            CDN url expiry
  src/ig/parse.ts                          raw JSON -> parsed types
  src/ig/client.ts                         Instagram private web API client
  src/sync/run-sync.ts                     sync loop (saved feed, collections)
  fixtures/*.json                          synthetic Instagram responses
  test/*.test.ts
apps/server/
  src/config.ts, src/main.ts
  src/db/schema.ts, src/db/open.ts, drizzle/ (generated SQL)
  src/sync/ingest.ts                       write side: runs, pages, collections
  src/queries.ts                           read side: posts, authors, collections
  src/media/store.ts                       thumbnail/avatar download + cache
  src/http/security.ts, src/http/app.ts
  scripts/seed.ts                          fake data for UI work
  test/*.test.ts
apps/extension/
  wxt.config.ts
  entrypoints/background.ts, entrypoints/instagram.content.ts
  src/external.ts, src/relay.ts, src/relay-sink.ts
  test/*.test.ts
apps/web/
  react-router.config.ts, vite.config.ts, vitest.config.ts
  app/root.tsx, app/routes.ts, app/app.css
  app/routes/library.tsx
  app/lib/api.ts, app/lib/filters.ts, app/lib/extension.ts, app/lib/format.ts
  app/components/*.tsx
  test/*.test.ts
```

---

### Task 1: Workspace + Instagram parser

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/{index,constants}.ts`, `packages/core/src/ig/{types,text,url,parse}.ts`
- Create: `packages/core/fixtures/{saved-page-1,saved-page-2,collections-list}.json`
- Test: `packages/core/test/parse.test.ts`, `packages/core/test/text.test.ts`

**Interfaces:**
- Produces: `parseMedia(raw): ParsedPost | null`, `parseMediaPage(raw): { items: ParsedPost[]; skipped: number; nextCursor: string | null; moreAvailable: boolean }`, `parseCollectionsPage(raw): { items: ParsedCollection[]; nextCursor; moreAvailable }`, `readPageInfo(raw): { nextCursor: string | null; moreAvailable: boolean }`, `extractHashtags(text)`, `extractMentions(text)`, `expiresAtFromUrl(url)`, types `MediaKind`, `ParsedPost`, `ParsedAuthor`, `ParsedMediaPart`, `ParsedCollection`, constants `DEFAULT_PORT = 4747`, `APP_VERSION = "0.1.0"`.

- [ ] **Step 1: Init git and workspace**

```bash
cd /Users/evgeniivaniukov/Development/no-fomo
git init -b main && git add -A && git commit -m "docs: product idea, approach plan, M1 plan"
git switch -c m1-foundation
corepack enable pnpm || npm i -g pnpm@12
```

`package.json`:
```json
{
  "name": "no-fomo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.9.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "pnpm -r typecheck",
    "dev": "concurrently -k -n server,web -c blue,magenta \"pnpm --filter @no-fomo/server dev\" \"pnpm --filter @no-fomo/web dev\"",
    "ext:build": "pnpm --filter @no-fomo/extension build",
    "start": "pnpm --filter @no-fomo/web build && pnpm --filter @no-fomo/server start"
  },
  "devDependencies": {}
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - apps/*
onlyBuiltDependencies:
  - better-sqlite3
  - esbuild
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { projects: ["packages/*", "apps/server", "apps/extension", "apps/web"] },
});
```

`.gitignore`:
```
node_modules/
.output/
.wxt/
build/
dist/
.react-router/
.dev-data/
*.log
.DS_Store
```

`packages/core/package.json`:
```json
{
  "name": "@no-fomo/core",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./extension-id": "./src/extension-id.ts",
    "./fixtures/*": "./fixtures/*"
  },
  "scripts": { "typecheck": "tsc -p tsconfig.json" }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `pnpm add -Dw typescript@^7 vitest@^5 concurrently@^10 @types/node@^22`

- [ ] **Step 2: Write fixtures**

`packages/core/fixtures/saved-page-1.json`:
```json
{
  "items": [
    {
      "media": {
        "pk": "3500000000000000001",
        "id": "3500000000000000001_111",
        "code": "DAbcReel01",
        "taken_at": 1756000000,
        "media_type": 2,
        "product_type": "clips",
        "caption": { "text": "Claude Code tips you need #claudecode #AI @anthropic. Подписывайся #нейросети" },
        "user": { "pk": "111", "username": "devtips", "full_name": "Dev Tips", "profile_pic_url": "https://scontent.cdninstagram.com/v/p150/devtips.jpg?oe=68C0A1B2" },
        "image_versions2": { "candidates": [
          { "width": 1080, "height": 1920, "url": "https://scontent.cdninstagram.com/v/reel1_1080.jpg?oe=68C0A1B2" },
          { "width": 640, "height": 1138, "url": "https://scontent.cdninstagram.com/v/reel1_640.jpg?oe=68C0A1B2" },
          { "width": 320, "height": 569, "url": "https://scontent.cdninstagram.com/v/reel1_320.jpg?oe=68C0A1B2" }
        ] },
        "video_versions": [
          { "type": 101, "width": 720, "height": 1280, "url": "https://scontent.cdninstagram.com/o1/v/reel1_720.mp4?oe=68C0A1B2" },
          { "type": 102, "width": 480, "height": 854, "url": "https://scontent.cdninstagram.com/o1/v/reel1_480.mp4?oe=68C0A1B2" }
        ],
        "original_width": 1080,
        "original_height": 1920,
        "video_duration": 42.5,
        "like_count": 1532,
        "play_count": 48211,
        "comment_count": 87,
        "accessibility_caption": null,
        "location": null,
        "clips_metadata": {
          "music_info": { "music_asset_info": { "title": "Midnight City", "display_artist": "M83" } },
          "original_sound_info": null
        }
      }
    },
    {
      "media": {
        "pk": "3500000000000000002",
        "code": "DAbcImg002",
        "taken_at": 1755900000,
        "media_type": 1,
        "product_type": "feed",
        "caption": { "text": "Grid systems, thanks @someone. for the tip #design" },
        "user": { "pk": "222", "username": "designnotes", "full_name": "Design Notes", "profile_pic_url": "https://scontent.cdninstagram.com/v/p150/designnotes.jpg" },
        "image_versions2": { "candidates": [
          { "width": 1080, "height": 1350, "url": "https://scontent.cdninstagram.com/v/img2_1080.jpg" },
          { "width": 480, "height": 600, "url": "https://scontent.cdninstagram.com/v/img2_480.jpg" }
        ] },
        "like_count": 210,
        "comment_count": 4,
        "accessibility_caption": "May be an image of text that says 'Grid systems'.",
        "location": { "pk": 1, "name": "Berlin, Germany" }
      }
    },
    {
      "media": {
        "pk": "3500000000000000003",
        "code": "DAbcCar003",
        "taken_at": 1755800000,
        "media_type": 8,
        "product_type": "carousel_container",
        "caption": { "text": "Setup guide part 1" },
        "user": { "pk": "111", "username": "devtips", "full_name": "Dev Tips" },
        "carousel_media": [
          {
            "pk": "3500000000000000031",
            "media_type": 1,
            "image_versions2": { "candidates": [ { "width": 1080, "height": 1350, "url": "https://scontent.cdninstagram.com/v/car3a_1080.jpg" } ] },
            "accessibility_caption": "May be an image of a laptop"
          },
          {
            "pk": "3500000000000000032",
            "media_type": 2,
            "image_versions2": { "candidates": [ { "width": 1080, "height": 1350, "url": "https://scontent.cdninstagram.com/v/car3b_1080.jpg" } ] },
            "video_versions": [ { "width": 720, "height": 900, "url": "https://scontent.cdninstagram.com/o1/v/car3b_720.mp4?oe=68C0A1B2" } ],
            "video_duration": 12
          },
          { "pk": "3500000000000000033", "media_type": 99 }
        ],
        "like_count": 98
      }
    }
  ],
  "more_available": true,
  "next_max_id": "QVFCursorPage2",
  "num_results": 3,
  "status": "ok"
}
```

`packages/core/fixtures/saved-page-2.json`:
```json
{
  "items": [
    {
      "media": {
        "pk": "3500000000000000004",
        "code": "DAbcReel04",
        "taken_at": 1755700000,
        "media_type": 2,
        "product_type": "clips",
        "caption": null,
        "user": { "pk": "333", "username": "quietcook", "full_name": "" },
        "image_versions2": { "candidates": [] },
        "video_versions": [ { "width": 720, "height": 1280, "url": "https://scontent.cdninstagram.com/o1/v/reel4_720.mp4" } ],
        "video_duration": 15.2,
        "ig_play_count": 900,
        "clips_metadata": {
          "music_info": null,
          "original_sound_info": { "original_audio_title": "Original audio", "ig_artist": { "username": "quietcook" } }
        }
      }
    },
    { "media": { "pk": "3500000000000000005", "code": "Weird5", "media_type": 99, "user": { "pk": "1", "username": "x" } } },
    { "something_else": true }
  ],
  "more_available": false,
  "num_results": 3,
  "status": "ok"
}
```

`packages/core/fixtures/collections-list.json`:
```json
{
  "items": [
    { "collection_id": "17900000000000001", "collection_name": "All posts", "collection_type": "ALL_MEDIA_AUTO_COLLECTION", "collection_media_count": 4 },
    { "collection_id": "17900000000000002", "collection_name": "AI tools", "collection_type": "MEDIA", "collection_media_count": 2 },
    { "collection_id": "17900000000000003", "collection_name": "Design", "collection_type": "MEDIA", "collection_media_count": 1 }
  ],
  "more_available": false,
  "status": "ok"
}
```

- [ ] **Step 3: Write failing tests**

`packages/core/test/text.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { extractHashtags, extractMentions } from "../src/ig/text";
import { expiresAtFromUrl } from "../src/ig/url";

describe("extractHashtags", () => {
  it("finds unicode hashtags, lowercased and unique", () => {
    expect(extractHashtags("Tips #ClaudeCode #AI #ai Подписывайся #нейросети")).toEqual(["claudecode", "ai", "нейросети"]);
  });
  it("ignores url fragments and returns [] for null", () => {
    expect(extractHashtags("see a.com/x#frag and &#123;")).toEqual([]);
    expect(extractHashtags(null)).toEqual([]);
  });
});

describe("extractMentions", () => {
  it("trims trailing dots and skips emails", () => {
    expect(extractMentions("thanks @someone. and @Other_one, mail me a@b.com")).toEqual(["someone", "other_one"]);
  });
});

describe("expiresAtFromUrl", () => {
  it("reads the hex oe param as unix seconds", () => {
    expect(expiresAtFromUrl("https://x.cdninstagram.com/a.mp4?oe=68C0A1B2&_nc=1")).toBe(parseInt("68C0A1B2", 16));
  });
  it("returns null when missing or invalid", () => {
    expect(expiresAtFromUrl("https://x/a.mp4")).toBeNull();
    expect(expiresAtFromUrl("not a url")).toBeNull();
    expect(expiresAtFromUrl(null)).toBeNull();
  });
});
```

`packages/core/test/parse.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import page1 from "../fixtures/saved-page-1.json";
import page2 from "../fixtures/saved-page-2.json";
import collectionsList from "../fixtures/collections-list.json";
import { parseCollectionsPage, parseMediaPage, readPageInfo } from "../src/ig/parse";

describe("parseMediaPage", () => {
  it("parses a reel with music, counts and expiry", () => {
    const { items } = parseMediaPage(page1);
    const reel = items[0]!;
    expect(reel).toMatchObject({
      id: "3500000000000000001",
      code: "DAbcReel01",
      kind: "video",
      productType: "clips",
      author: { id: "111", username: "devtips", fullName: "Dev Tips" },
      hashtags: ["claudecode", "ai", "нейросети"],
      mentions: ["anthropic"],
      takenAt: 1756000000,
      thumbnailUrl: "https://scontent.cdninstagram.com/v/reel1_640.jpg?oe=68C0A1B2",
      videoUrl: "https://scontent.cdninstagram.com/o1/v/reel1_720.mp4?oe=68C0A1B2",
      videoUrlExpiresAt: parseInt("68C0A1B2", 16),
      durationSec: 42.5,
      likeCount: 1532,
      viewCount: 48211,
      commentCount: 87,
      musicTitle: "Midnight City",
      musicArtist: "M83",
      width: 1080,
      height: 1920,
      parts: [],
    });
  });

  it("parses an image with location and accessibility caption", () => {
    const img = parseMediaPage(page1).items[1]!;
    expect(img).toMatchObject({
      kind: "image",
      thumbnailUrl: "https://scontent.cdninstagram.com/v/img2_480.jpg",
      videoUrl: null,
      locationName: "Berlin, Germany",
      accessibilityCaption: "May be an image of text that says 'Grid systems'.",
      mentions: ["someone"],
    });
  });

  it("parses carousel children and skips unknown child types", () => {
    const car = parseMediaPage(page1).items[2]!;
    expect(car.kind).toBe("carousel");
    expect(car.parts).toHaveLength(2);
    expect(car.parts[1]).toMatchObject({ index: 1, kind: "video", videoUrl: "https://scontent.cdninstagram.com/o1/v/car3b_720.mp4?oe=68C0A1B2" });
    expect(car.thumbnailUrl).toBe("https://scontent.cdninstagram.com/v/car3a_1080.jpg");
    expect(car.accessibilityCaption).toBe("May be an image of a laptop");
  });

  it("reads paging info", () => {
    expect(readPageInfo(page1)).toEqual({ nextCursor: "QVFCursorPage2", moreAvailable: true });
    expect(readPageInfo(page2)).toEqual({ nextCursor: null, moreAvailable: false });
  });

  it("degrades on odd items instead of throwing", () => {
    const page = parseMediaPage(page2);
    expect(page.items).toHaveLength(1);
    expect(page.skipped).toBe(2);
    expect(page.items[0]).toMatchObject({
      caption: null,
      hashtags: [],
      thumbnailUrl: null,
      author: { username: "quietcook", fullName: null },
      viewCount: 900,
      musicTitle: "Original audio",
      musicArtist: "quietcook",
    });
  });

  it("never throws on garbage", () => {
    for (const junk of [null, 1, "x", [], { items: "nope" }, { items: [null, 1] }]) {
      expect(() => parseMediaPage(junk)).not.toThrow();
    }
  });
});

describe("parseCollectionsPage", () => {
  it("keeps only user collections", () => {
    expect(parseCollectionsPage(collectionsList).items).toEqual([
      { id: "17900000000000002", name: "AI tools", mediaCount: 2 },
      { id: "17900000000000003", name: "Design", mediaCount: 1 },
    ]);
  });
});
```

- [ ] **Step 4: Run tests, expect FAIL** (modules missing)

Run: `pnpm vitest run packages/core`

- [ ] **Step 5: Implement**

`packages/core/src/constants.ts`:
```ts
export const DEFAULT_PORT = 4747;
export const APP_VERSION = "0.1.0";
```

`packages/core/src/ig/types.ts`:
```ts
export type MediaKind = "image" | "video" | "carousel";

export interface ParsedAuthor {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface ParsedMediaPart {
  index: number;
  kind: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
  accessibilityCaption: string | null;
}

export interface ParsedPost {
  id: string;
  code: string;
  kind: MediaKind;
  productType: string | null;
  author: ParsedAuthor;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  takenAt: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  videoUrlExpiresAt: number | null;
  durationSec: number | null;
  likeCount: number | null;
  viewCount: number | null;
  commentCount: number | null;
  accessibilityCaption: string | null;
  locationName: string | null;
  musicTitle: string | null;
  musicArtist: string | null;
  width: number | null;
  height: number | null;
  parts: ParsedMediaPart[];
}

export interface ParsedCollection {
  id: string;
  name: string;
  mediaCount: number | null;
}

export interface PageInfo {
  nextCursor: string | null;
  moreAvailable: boolean;
}
```

`packages/core/src/ig/text.ts`:
```ts
const HASHTAG = /(?<![\p{L}\p{N}_&#/])#([\p{L}\p{N}_]+)/gu;
const MENTION = /(?<![\p{L}\p{N}_.@])@([A-Za-z0-9_.]{1,30})/gu;

const unique = (values: string[]) => [...new Set(values)];

export function extractHashtags(text: string | null): string[] {
  if (!text) return [];
  return unique([...text.matchAll(HASHTAG)].map((m) => m[1]!.toLowerCase()));
}

export function extractMentions(text: string | null): string[] {
  if (!text) return [];
  return unique(
    [...text.matchAll(MENTION)].map((m) => m[1]!.replace(/\.+$/, "").toLowerCase()).filter(Boolean),
  );
}
```

Note: `a.com/x#frag` has `x` before `#`, so the lookbehind on letters already blocks it; `&#123;` is blocked by `&`.

`packages/core/src/ig/url.ts`:
```ts
/** Instagram CDN urls carry their expiry as a hex unix timestamp in `oe`. */
export function expiresAtFromUrl(url: string | null): number | null {
  if (!url) return null;
  try {
    const oe = new URL(url).searchParams.get("oe");
    return oe && /^[0-9a-f]{1,12}$/i.test(oe) ? parseInt(oe, 16) : null;
  } catch {
    return null;
  }
}
```

`packages/core/src/ig/parse.ts`:
```ts
import { extractHashtags, extractMentions } from "./text";
import { expiresAtFromUrl } from "./url";
import type { MediaKind, PageInfo, ParsedAuthor, ParsedCollection, ParsedMediaPart, ParsedPost } from "./types";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Json => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const KIND_BY_TYPE: Record<number, MediaKind> = { 1: "image", 2: "video", 8: "carousel" };

interface Candidate { url: string; width: number | null; height: number | null }

function candidates(list: unknown): Candidate[] {
  return arr(list)
    .map(obj)
    .map((c) => ({ url: str(c.url), width: num(c.width), height: num(c.height) }))
    .filter((c): c is Candidate => c.url !== null)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
}

/** Smallest image at least 480px wide, so grid thumbnails stay small. */
function pickThumb(list: unknown): Candidate | null {
  const c = candidates(list);
  return c.find((x) => (x.width ?? 0) >= 480) ?? c.at(-1) ?? null;
}

const pickLargest = (list: unknown): Candidate | null => candidates(list).at(-1) ?? null;

function parseAuthor(u: Json): ParsedAuthor | null {
  const id = str(u.pk) ?? str(u.pk_id) ?? str(u.id);
  const username = str(u.username);
  if (!id || !username) return null;
  return { id, username, fullName: str(u.full_name), avatarUrl: str(u.profile_pic_url) };
}

function parsePart(m: Json, index: number): ParsedMediaPart | null {
  const type = num(m.media_type);
  if (type !== 1 && type !== 2) return null;
  const image = pickLargest(obj(m.image_versions2).candidates);
  const video = type === 2 ? pickLargest(m.video_versions) : null;
  return {
    index,
    kind: type === 2 ? "video" : "image",
    imageUrl: image?.url ?? null,
    videoUrl: video?.url ?? null,
    width: (video ?? image)?.width ?? null,
    height: (video ?? image)?.height ?? null,
    accessibilityCaption: str(m.accessibility_caption),
  };
}

function parseMusic(m: Json): { title: string | null; artist: string | null } {
  const clips = obj(m.clips_metadata);
  const music = obj(obj(clips.music_info).music_asset_info);
  if (str(music.title)) return { title: str(music.title), artist: str(music.display_artist) };
  const original = obj(clips.original_sound_info);
  return { title: str(original.original_audio_title), artist: str(obj(original.ig_artist).username) };
}

export function parseMedia(raw: unknown): ParsedPost | null {
  const m = obj(raw);
  const id = str(m.pk) ?? str(m.id)?.split("_")[0] ?? null;
  const code = str(m.code);
  const kind = KIND_BY_TYPE[num(m.media_type) ?? -1];
  const author = parseAuthor(obj(m.user));
  if (!id || !code || !kind || !author) return null;

  const parts =
    kind === "carousel"
      ? arr(m.carousel_media)
          .map((p, i) => parsePart(obj(p), i))
          .filter((p): p is ParsedMediaPart => p !== null)
      : [];
  const first = parts[0];
  const thumb =
    pickThumb(obj(m.image_versions2).candidates) ??
    (first?.imageUrl ? { url: first.imageUrl, width: first.width, height: first.height } : null);
  const video = kind === "video" ? pickLargest(m.video_versions) : null;
  const caption = str(obj(m.caption).text);
  const music = parseMusic(m);

  return {
    id,
    code,
    kind,
    productType: str(m.product_type),
    author,
    caption,
    hashtags: extractHashtags(caption),
    mentions: extractMentions(caption),
    takenAt: num(m.taken_at) ?? 0,
    thumbnailUrl: thumb?.url ?? null,
    videoUrl: video?.url ?? null,
    videoUrlExpiresAt: expiresAtFromUrl(video?.url ?? null),
    durationSec: num(m.video_duration),
    likeCount: num(m.like_count),
    viewCount: num(m.play_count) ?? num(m.ig_play_count) ?? num(m.view_count),
    commentCount: num(m.comment_count),
    accessibilityCaption: str(m.accessibility_caption) ?? first?.accessibilityCaption ?? null,
    locationName: str(obj(m.location).name),
    musicTitle: music.title,
    musicArtist: music.artist,
    width: num(m.original_width) ?? (video ?? thumb)?.width ?? null,
    height: num(m.original_height) ?? (video ?? thumb)?.height ?? null,
    parts,
  };
}

export function readPageInfo(raw: unknown): PageInfo {
  const r = obj(raw);
  const nextCursor = str(r.next_max_id);
  return { nextCursor, moreAvailable: r.more_available === true && nextCursor !== null };
}

export function parseMediaPage(raw: unknown): PageInfo & { items: ParsedPost[]; skipped: number } {
  const items: ParsedPost[] = [];
  let skipped = 0;
  for (const entry of arr(obj(raw).items)) {
    const e = obj(entry);
    const post = parseMedia(isObj(e.media) ? e.media : e);
    if (post) items.push(post);
    else skipped++;
  }
  return { items, skipped, ...readPageInfo(raw) };
}

export function parseCollectionsPage(raw: unknown): PageInfo & { items: ParsedCollection[] } {
  const items = arr(obj(raw).items)
    .map(obj)
    .filter((c) => c.collection_type === undefined || c.collection_type === "MEDIA")
    .map((c) => ({ id: str(c.collection_id), name: str(c.collection_name), mediaCount: num(c.collection_media_count) }))
    .filter((c): c is ParsedCollection => c.id !== null && c.name !== null);
  return { items, ...readPageInfo(raw) };
}
```

`packages/core/src/index.ts`:
```ts
export * from "./constants";
export * from "./ig/types";
export * from "./ig/text";
export * from "./ig/url";
export * from "./ig/parse";
```

- [ ] **Step 6: Run tests, expect PASS**

Run: `pnpm vitest run packages/core && pnpm --filter @no-fomo/core typecheck`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(core): workspace and Instagram response parser"
```

---

### Task 2: Instagram client + sync loop

**Files:**
- Create: `packages/core/src/ig/client.ts`, `packages/core/src/sync/run-sync.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/client.test.ts`, `packages/core/test/run-sync.test.ts`

**Interfaces:**
- Consumes: `readPageInfo` (Task 1).
- Produces:
  - `IG_APP_ID`, `class IgError extends Error { code: IgErrorCode; status?: number }`, `type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response"`
  - `interface IgClient { savedPage(cursor: string | null): Promise<unknown>; collectionsPage(cursor: string | null): Promise<unknown>; collectionPage(collectionId: string, cursor: string | null): Promise<unknown> }`
  - `createIgClient(opts: { fetch: typeof fetch; csrfToken: () => string | null; origin?: string }): IgClient`
  - `interface SyncSink { startRun(): Promise<{ runId: number }>; savedPage(runId: number, payload: unknown): Promise<{ stop: boolean; seen: number }>; collections(runId: number, payload: unknown): Promise<{ collections: { id: string; name: string }[] }>; collectionPage(runId: number, collectionId: string, payload: unknown): Promise<{ stop: boolean; seen: number }>; finishRun(runId: number, result: SyncResult): Promise<void> }`
  - `type SyncResult = { ok: true } | { ok: false; code: string; message: string }`
  - `runSync(deps: { ig: IgClient; sink: SyncSink; sleep: (ms: number) => Promise<void>; delayMs?: () => number; maxRequests?: number }): Promise<{ ok: boolean; requests: number; error?: { code: string; message: string } }>`

- [ ] **Step 1: Write failing tests**

`packages/core/test/client.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createIgClient, IG_APP_ID, IgError } from "../src/ig/client";

function fakeFetch(...responses: Array<() => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next();
  }) as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function codeOf(p: Promise<unknown>) {
  try { await p; } catch (e) { return e instanceof IgError ? e.code : "other"; }
  return "no-error";
}

describe("createIgClient", () => {
  it("calls the saved feed with app id, csrf and cursor", async () => {
    const f = fakeFetch(json({ items: [], status: "ok" }));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => "tok" });
    await ig.savedPage("CUR");
    expect(f.calls[0]!.url).toBe("https://www.instagram.com/api/v1/feed/saved/posts/?max_id=CUR");
    const h = f.calls[0]!.init!.headers as Record<string, string>;
    expect(h["X-IG-App-ID"]).toBe(IG_APP_ID);
    expect(h["X-CSRFToken"]).toBe("tok");
    expect(f.calls[0]!.init!.credentials).toBe("include");
  });

  it("builds collection urls", async () => {
    const f = fakeFetch(json({ status: "ok" }), json({ status: "ok" }));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => null });
    await ig.collectionsPage(null);
    await ig.collectionPage("179", "C2");
    expect(f.calls[0]!.url).toBe("https://www.instagram.com/api/v1/collections/list/?collection_types=%5B%22MEDIA%22%5D");
    expect(f.calls[1]!.url).toBe("https://www.instagram.com/api/v1/feed/collection/179/posts/?max_id=C2");
  });

  it("maps failures to clear error codes", async () => {
    const make = (r: () => Response) => createIgClient({ fetch: fakeFetch(r).fn, csrfToken: () => null }).savedPage(null);
    expect(await codeOf(make(json({}, 429)))).toBe("rate_limited");
    expect(await codeOf(make(json({}, 401)))).toBe("login_required");
    expect(await codeOf(make(json({ message: "login_required", status: "fail" }, 200)))).toBe("login_required");
    expect(await codeOf(make(json({ require_login: true }, 200)))).toBe("login_required");
    expect(await codeOf(make(json({ spam: true, status: "fail" }, 200)))).toBe("rate_limited");
    expect(await codeOf(make(json({ status: "fail", message: "feedback_required" }, 200)))).toBe("refused");
    expect(await codeOf(make(json({}, 500)))).toBe("http_error");
    expect(await codeOf(make(() => new Response("<html>login</html>", { status: 200 })))).toBe("login_required");
  });
});
```

`packages/core/test/run-sync.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { IgError, type IgClient } from "../src/ig/client";
import { runSync, type SyncSink, type SyncResult } from "../src/sync/run-sync";

const page = (n: number, next: string | null) => ({ items: [{ n }], more_available: next !== null, next_max_id: next });

function setup(opts: {
  saved: Array<unknown | Error>;
  collections?: unknown;
  collectionPages?: Record<string, unknown[]>;
  stopAtSavedPage?: number;
}) {
  const log: string[] = [];
  const saved = [...opts.saved];
  const ig: IgClient = {
    async savedPage(cursor) {
      log.push(`ig:saved:${cursor}`);
      const next = saved.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    async collectionsPage(cursor) {
      log.push(`ig:collections:${cursor}`);
      return opts.collections ?? { items: [], more_available: false };
    },
    async collectionPage(id, cursor) {
      log.push(`ig:collection:${id}:${cursor}`);
      return opts.collectionPages?.[id]?.shift() ?? { items: [], more_available: false };
    },
  };
  let savedCount = 0;
  const results: SyncResult[] = [];
  const sink: SyncSink = {
    async startRun() { log.push("sink:start"); return { runId: 7 }; },
    async savedPage(runId) {
      savedCount++;
      log.push(`sink:saved:${runId}`);
      return { stop: savedCount === opts.stopAtSavedPage, seen: 1 };
    },
    async collections() {
      log.push("sink:collections");
      return { collections: [{ id: "c1", name: "AI" }] };
    },
    async collectionPage(_r, id) { log.push(`sink:collection:${id}`); return { stop: false, seen: 1 }; },
    async finishRun(_r, result) { results.push(result); },
  };
  const sleeps: number[] = [];
  return { ig, sink, log, results, sleeps, sleep: async (ms: number) => { sleeps.push(ms); } };
}

describe("runSync", () => {
  it("walks saved pages, then collections, with a pause before every request after the first", async () => {
    const s = setup({
      saved: [page(1, "A"), page(2, null)],
      collectionPages: { c1: [page(1, "X"), page(2, null)] },
    });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep, delayMs: () => 2500 });
    expect(r).toEqual({ ok: true, requests: 5 });
    expect(s.log.filter((l) => l.startsWith("ig:"))).toEqual([
      "ig:saved:null", "ig:saved:A", "ig:collections:null", "ig:collection:c1:null", "ig:collection:c1:X",
    ]);
    expect(s.sleeps).toEqual([2500, 2500, 2500, 2500]);
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("stops the saved walk when the server says stop", async () => {
    const s = setup({ saved: [page(1, "A"), page(2, "B"), page(3, null)], stopAtSavedPage: 1 });
    await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(s.log.filter((l) => l.startsWith("ig:saved"))).toEqual(["ig:saved:null"]);
  });

  it("stops everything on rate limit and reports it", async () => {
    const s = setup({ saved: [page(1, "A"), new IgError("rate_limited", "slow down", 429)] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(r.error).toEqual({ code: "rate_limited", message: "slow down" });
    expect(s.log.some((l) => l.startsWith("ig:collection"))).toBe(false);
    expect(s.results).toEqual([{ ok: false, code: "rate_limited", message: "slow down" }]);
  });

  it("respects the request cap", async () => {
    const s = setup({ saved: [page(1, "A"), page(2, "B"), page(3, "C")] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep, maxRequests: 2 });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("too_many_requests");
    expect(s.log.filter((l) => l.startsWith("ig:"))).toHaveLength(2);
  });

  it("returns an error when the server cannot start a run", async () => {
    const s = setup({ saved: [] });
    s.sink.startRun = async () => { throw new Error("server down"); };
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(r).toEqual({ ok: false, requests: 0, error: { code: "server_unreachable", message: "server down" } });
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `pnpm vitest run packages/core`

- [ ] **Step 3: Implement**

`packages/core/src/ig/client.ts`:
```ts
export const IG_APP_ID = "936619743392459";

export type IgErrorCode = "login_required" | "rate_limited" | "refused" | "http_error" | "bad_response";

export class IgError extends Error {
  constructor(public readonly code: IgErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "IgError";
  }
}

export interface IgClient {
  savedPage(cursor: string | null): Promise<unknown>;
  collectionsPage(cursor: string | null): Promise<unknown>;
  collectionPage(collectionId: string, cursor: string | null): Promise<unknown>;
}

const LOGIN_MESSAGE = "Log in to Instagram in this browser, then sync again.";

export function createIgClient(opts: {
  fetch: typeof fetch;
  csrfToken: () => string | null;
  origin?: string;
}): IgClient {
  const origin = opts.origin ?? "https://www.instagram.com";

  async function get(path: string, params: Record<string, string | null>): Promise<unknown> {
    const url = new URL(path, origin);
    for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
    const headers: Record<string, string> = {
      "X-IG-App-ID": IG_APP_ID,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
    };
    const csrf = opts.csrfToken();
    if (csrf) headers["X-CSRFToken"] = csrf;

    let res: Response;
    try {
      res = await opts.fetch(url.toString(), { headers, credentials: "include" });
    } catch (e) {
      throw new IgError("http_error", `Could not reach Instagram: ${(e as Error).message}`);
    }
    if (res.status === 429) throw new IgError("rate_limited", "Instagram asked to slow down. Sync stopped. Try again later.", 429);
    if (res.status === 401 || res.status === 403) throw new IgError("login_required", LOGIN_MESSAGE, res.status);
    if (!res.ok) throw new IgError("http_error", `Instagram returned error ${res.status}. Sync stopped.`, res.status);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new IgError("login_required", LOGIN_MESSAGE);
    }
    const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    if (b.require_login === true || b.message === "login_required") throw new IgError("login_required", LOGIN_MESSAGE);
    if (b.spam === true) throw new IgError("rate_limited", "Instagram asked to slow down. Sync stopped. Try again later.");
    if (b.status === "fail") throw new IgError("refused", `Instagram refused the request (${String(b.message ?? "unknown")}). Sync stopped.`);
    return body;
  }

  return {
    savedPage: (cursor) => get("/api/v1/feed/saved/posts/", { max_id: cursor }),
    collectionsPage: (cursor) => get("/api/v1/collections/list/", { collection_types: '["MEDIA"]', max_id: cursor }),
    collectionPage: (id, cursor) => get(`/api/v1/feed/collection/${encodeURIComponent(id)}/posts/`, { max_id: cursor }),
  };
}
```

`packages/core/src/sync/run-sync.ts`:
```ts
import { IgError, type IgClient } from "../ig/client";
import { readPageInfo } from "../ig/parse";

export type SyncResult = { ok: true } | { ok: false; code: string; message: string };

export interface SyncSink {
  startRun(): Promise<{ runId: number }>;
  savedPage(runId: number, payload: unknown): Promise<{ stop: boolean; seen: number }>;
  collections(runId: number, payload: unknown): Promise<{ collections: { id: string; name: string }[] }>;
  collectionPage(runId: number, collectionId: string, payload: unknown): Promise<{ stop: boolean; seen: number }>;
  finishRun(runId: number, result: SyncResult): Promise<void>;
}

export interface RunSyncDeps {
  ig: IgClient;
  sink: SyncSink;
  sleep: (ms: number) => Promise<void>;
  /** Pause before each Instagram request after the first. Default 2000-3000 ms. */
  delayMs?: () => number;
  /** Safety cap on Instagram requests per sync (default 3000, about 60k posts). */
  maxRequests?: number;
}

class CapReached extends Error {}

export async function runSync(deps: RunSyncDeps): Promise<{ ok: boolean; requests: number; error?: { code: string; message: string } }> {
  const delay = deps.delayMs ?? (() => 2000 + Math.floor(Math.random() * 1000));
  const cap = deps.maxRequests ?? 3000;
  let requests = 0;

  async function request<T>(call: () => Promise<T>): Promise<T> {
    if (requests >= cap) throw new CapReached();
    if (requests > 0) await deps.sleep(delay());
    requests++;
    return call();
  }

  let runId: number;
  try {
    ({ runId } = await deps.sink.startRun());
  } catch (e) {
    return { ok: false, requests, error: { code: "server_unreachable", message: (e as Error).message } };
  }

  try {
    let cursor: string | null = null;
    for (;;) {
      const raw = await request(() => deps.ig.savedPage(cursor));
      const { stop } = await deps.sink.savedPage(runId, raw);
      const info = readPageInfo(raw);
      if (stop || !info.moreAvailable) break;
      cursor = info.nextCursor;
    }

    const collections: { id: string; name: string }[] = [];
    cursor = null;
    for (;;) {
      const raw = await request(() => deps.ig.collectionsPage(cursor));
      collections.push(...(await deps.sink.collections(runId, raw)).collections);
      const info = readPageInfo(raw);
      if (!info.moreAvailable) break;
      cursor = info.nextCursor;
    }

    for (const c of collections) {
      cursor = null;
      for (;;) {
        const raw = await request(() => deps.ig.collectionPage(c.id, cursor));
        const { stop } = await deps.sink.collectionPage(runId, c.id, raw);
        const info = readPageInfo(raw);
        if (stop || !info.moreAvailable) break;
        cursor = info.nextCursor;
      }
    }

    await deps.sink.finishRun(runId, { ok: true });
    return { ok: true, requests };
  } catch (e) {
    const error =
      e instanceof IgError
        ? { code: e.code, message: e.message }
        : e instanceof CapReached
          ? { code: "too_many_requests", message: `Stopped after ${cap} requests to protect your account.` }
          : { code: "internal", message: (e as Error).message };
    await deps.sink.finishRun(runId, { ok: false, ...error }).catch(() => {});
    return { ok: false, requests, error };
  }
}
```

Append to `packages/core/src/index.ts`:
```ts
export * from "./ig/client";
export * from "./sync/run-sync";
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm vitest run packages/core && pnpm --filter @no-fomo/core typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): Instagram client and throttled sync loop"
```

---

### Task 3: Database + ingest (write side)

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/drizzle.config.ts`
- Create: `apps/server/src/db/schema.ts`, `apps/server/src/db/open.ts`, `apps/server/src/sync/ingest.ts`
- Generated: `apps/server/drizzle/*.sql`
- Test: `apps/server/test/ingest.test.ts`

**Interfaces:**
- Consumes: `parseMediaPage`, `parseCollectionsPage`, `ParsedPost` (Task 1).
- Produces:
  - `openDb(file: string): Db` (runs migrations; `":memory:"` works)
  - `RUN_SPAN = 1_000_000_000`, `class RunNotActiveError`, `class NotFoundError`, `type MediaJob = { kind: "thumb" | "avatar"; id: string; url: string }`
  - `startRun(db, now?): { runId: number; mode: "incremental" | "full" }`
  - `ingestSavedPage(db, runId, raw): { stop: boolean; newCount: number; seen: number; skipped: number; jobs: MediaJob[] }`
  - `ingestCollections(db, runId, raw): { collections: { id: string; name: string }[] }`
  - `ingestCollectionPage(db, runId, collectionId, raw): { stop: boolean; seen: number; jobs: MediaJob[] }`
  - `finishRun(db, runId, result: SyncResult, now?): void`
  - `failStaleRuns(db, now?): void`, `latestRun(db)`, `lastSuccessAt(db): number | null`
  - `markMediaSaved(db, job: MediaJob): void`

**Ordering rule (why `sortKey`):** Instagram gives no "saved at" time, only feed order (newest save first). Each run gets `baseKey = max(sortKey) + RUN_SPAN`; the item at feed position `pos` gets `baseKey - pos`. Incremental runs only give keys to new posts, which therefore land above all old ones. Full runs (first sync, or a retry of an unfinished first sync) rewrite keys for every post they see. The grid sorts by `sortKey DESC`.

- [ ] **Step 1: Package setup**

`apps/server/package.json`:
```json
{
  "name": "@no-fomo/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "start": "tsx src/main.ts",
    "seed": "tsx scripts/seed.ts",
    "db:generate": "drizzle-kit generate",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

`apps/server/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src", "test", "scripts", "drizzle.config.ts"] }
```

`apps/server/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({ dialect: "sqlite", schema: "./src/db/schema.ts", out: "./drizzle" });
```

Run:
```bash
pnpm --filter @no-fomo/server add @no-fomo/core@workspace:* hono@^4 @hono/node-server@^2 drizzle-orm@^0.45 better-sqlite3@^13 zod@^4 tsx@^4
pnpm --filter @no-fomo/server add -D drizzle-kit@^0.31 @types/better-sqlite3
```
If pnpm reports ignored build scripts, run `pnpm approve-builds` and allow `better-sqlite3` and `esbuild`.

- [ ] **Step 2: Schema + open**

`apps/server/src/db/schema.ts`:
```ts
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authors = sqliteTable("authors", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  avatarPath: text("avatar_path"),
});

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    kind: text("kind", { enum: ["image", "video", "carousel"] }).notNull(),
    productType: text("product_type"),
    authorId: text("author_id").notNull().references(() => authors.id),
    caption: text("caption"),
    hashtags: text("hashtags", { mode: "json" }).$type<string[]>().notNull(),
    mentions: text("mentions", { mode: "json" }).$type<string[]>().notNull(),
    takenAt: integer("taken_at").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    thumbPath: text("thumb_path"),
    videoUrl: text("video_url"),
    videoUrlExpiresAt: integer("video_url_expires_at"),
    durationSec: real("duration_sec"),
    likeCount: integer("like_count"),
    viewCount: integer("view_count"),
    commentCount: integer("comment_count"),
    accessibilityCaption: text("accessibility_caption"),
    locationName: text("location_name"),
    musicTitle: text("music_title"),
    musicArtist: text("music_artist"),
    width: integer("width"),
    height: integer("height"),
    sortKey: integer("sort_key").notNull(),
    firstSeenRunId: integer("first_seen_run_id").notNull(),
    lastSeenRunId: integer("last_seen_run_id").notNull(),
    removedAt: integer("removed_at"),
    removedRemotelyAt: integer("removed_remotely_at"),
  },
  (t) => [
    index("posts_sort_idx").on(t.sortKey),
    index("posts_author_idx").on(t.authorId),
    index("posts_kind_idx").on(t.kind),
  ],
);

export const postParts = sqliteTable(
  "post_parts",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    imageUrl: text("image_url"),
    videoUrl: text("video_url"),
    width: integer("width"),
    height: integer("height"),
    accessibilityCaption: text("accessibility_caption"),
  },
  (t) => [primaryKey({ columns: [t.postId, t.idx] })],
);

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mediaCount: integer("media_count"),
  backfillComplete: integer("backfill_complete", { mode: "boolean" }).notNull().default(false),
  lastSeenRunId: integer("last_seen_run_id"),
});

export const postCollections = sqliteTable(
  "post_collections",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    firstSeenRunId: integer("first_seen_run_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.collectionId] }), index("post_collections_coll_idx").on(t.collectionId)],
);

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode", { enum: ["incremental", "full"] }).notNull(),
  status: text("status", { enum: ["running", "done", "error"] }).notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  baseKey: integer("base_key").notNull(),
  nextPos: integer("next_pos").notNull().default(0),
  pages: integer("pages").notNull().default(0),
  postsSeen: integer("posts_seen").notNull().default(0),
  postsNew: integer("posts_new").notNull().default(0),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
```

`apps/server/src/db/open.ts`:
```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "./schema";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function openDb(file: string) {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export type Db = ReturnType<typeof openDb>;
```

Run: `pnpm --filter @no-fomo/server db:generate` (creates `apps/server/drizzle/0000_*.sql` and `meta/`).

- [ ] **Step 3: Write failing tests**

`apps/server/test/ingest.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { desc } from "drizzle-orm";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import collectionsList from "@no-fomo/core/fixtures/collections-list.json";
import { openDb, type Db } from "../src/db/open";
import { posts, postCollections, syncRuns } from "../src/db/schema";
import {
  finishRun, ingestCollectionPage, ingestCollections, ingestSavedPage, RunNotActiveError, startRun,
} from "../src/sync/ingest";

const media = (pk: string) => ({
  pk, code: `C${pk}`, media_type: 1, taken_at: 1, user: { pk: "9", username: "new_author" },
  image_versions2: { candidates: [{ width: 480, height: 600, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] },
});
const pageOf = (pks: string[], more: boolean) => ({
  items: pks.map((pk) => ({ media: media(pk) })), more_available: more, next_max_id: more ? "N" : undefined,
});
const order = (db: Db) => db.select({ id: posts.id }).from(posts).orderBy(desc(posts.sortKey)).all().map((r) => r.id);

let db: Db;
beforeEach(() => { db = openDb(":memory:"); });

describe("saved feed ingest", () => {
  it("first run is full, keeps feed order and marks backfill complete at the end", () => {
    const { runId, mode } = startRun(db);
    expect(mode).toBe("full");
    const a = ingestSavedPage(db, runId, page1);
    expect(a).toMatchObject({ stop: false, newCount: 3, seen: 3, skipped: 0 });
    expect(a.jobs.filter((j) => j.kind === "thumb")).toHaveLength(3);
    ingestSavedPage(db, runId, page2);
    finishRun(db, runId, { ok: true });
    expect(order(db)).toEqual(["3500000000000000001", "3500000000000000002", "3500000000000000003", "3500000000000000004"]);
    expect(startRun(db).mode).toBe("incremental");
  });

  it("incremental run puts new posts on top and stops at the first known post", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    ingestSavedPage(db, r1.runId, page2);
    finishRun(db, r1.runId, { ok: true });

    const r2 = startRun(db);
    const res = ingestSavedPage(db, r2.runId, pageOf(["100", "101", "3500000000000000001"], true));
    expect(res).toMatchObject({ stop: true, newCount: 2 });
    expect(order(db).slice(0, 3)).toEqual(["100", "101", "3500000000000000001"]);
  });

  it("an interrupted first sync is retried in full mode and does not stop early", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    finishRun(db, r1.runId, { ok: false, code: "rate_limited", message: "slow down" });

    const r2 = startRun(db);
    expect(r2.mode).toBe("full");
    expect(ingestSavedPage(db, r2.runId, page1).stop).toBe(false);
    ingestSavedPage(db, r2.runId, page2);
    expect(order(db)).toEqual(["3500000000000000001", "3500000000000000002", "3500000000000000003", "3500000000000000004"]);
  });

  it("rejects pages for finished runs and fails runs left running", () => {
    const r1 = startRun(db);
    finishRun(db, r1.runId, { ok: true });
    expect(() => ingestSavedPage(db, r1.runId, page1)).toThrow(RunNotActiveError);

    const r2 = startRun(db);
    startRun(db);
    const old = db.select().from(syncRuns).all().find((r) => r.id === r2.runId)!;
    expect(old).toMatchObject({ status: "error", errorCode: "interrupted" });
  });
});

describe("collections ingest", () => {
  it("stores user collections and links posts; stops on a known link after backfill", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    expect(ingestCollections(db, r1.runId, collectionsList).collections.map((c) => c.name)).toEqual(["AI tools", "Design"]);
    const coll = "17900000000000002";
    const first = ingestCollectionPage(db, r1.runId, coll, { items: [{ media: page1.items[0]!.media }], more_available: false });
    expect(first.stop).toBe(false);
    expect(db.select().from(postCollections).all()).toHaveLength(1);
    finishRun(db, r1.runId, { ok: true });

    const r2 = startRun(db);
    const again = ingestCollectionPage(db, r2.runId, coll, { items: [{ media: page1.items[0]!.media }], more_available: true, next_max_id: "N" });
    expect(again.stop).toBe(true);
  });

  it("puts posts that only appear in a collection at the bottom", () => {
    const r1 = startRun(db);
    ingestSavedPage(db, r1.runId, page1);
    ingestCollections(db, r1.runId, collectionsList);
    ingestCollectionPage(db, r1.runId, "17900000000000003", pageOf(["555"], false));
    expect(order(db).at(-1)).toBe("555");
  });
});
```

- [ ] **Step 4: Run tests, expect FAIL**

Run: `pnpm vitest run apps/server`

- [ ] **Step 5: Implement `apps/server/src/sync/ingest.ts`**

```ts
import { and, desc, eq, sql } from "drizzle-orm";
import { parseCollectionsPage, parseMediaPage, type ParsedPost, type SyncResult } from "@no-fomo/core";
import type { Db } from "../db/open";
import { authors, collections, postCollections, postParts, posts, settings, syncRuns } from "../db/schema";

export const RUN_SPAN = 1_000_000_000;
const SAVED_BACKFILL = "saved_backfill_complete";

export class RunNotActiveError extends Error {}
export class NotFoundError extends Error {}
export type MediaJob = { kind: "thumb" | "avatar"; id: string; url: string };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

const getSetting = (q: Q, key: string) => q.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
const setSetting = (q: Q, key: string, value: string) =>
  q.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();

function activeRun(q: Q, runId: number) {
  const run = q.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
  if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
  if (run.status !== "running") throw new RunNotActiveError(`Sync run ${runId} is ${run.status}`);
  return run;
}

export function startRun(db: Db, now = Date.now()): { runId: number; mode: "incremental" | "full" } {
  return db.transaction((tx) => {
    tx.update(syncRuns)
      .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "A new sync started before this one finished." })
      .where(eq(syncRuns.status, "running"))
      .run();
    const mode = getSetting(tx, SAVED_BACKFILL) === "1" ? "incremental" : "full";
    const max = tx.select({ max: sql<number | null>`max(${posts.sortKey})` }).from(posts).get()?.max ?? 0;
    const run = tx
      .insert(syncRuns)
      .values({ mode, status: "running", startedAt: now, baseKey: max + RUN_SPAN })
      .returning({ id: syncRuns.id })
      .get();
    return { runId: run.id, mode };
  });
}

function upsertAuthor(q: Q, a: ParsedPost["author"], jobs: MediaJob[]) {
  const existing = q.select({ avatarPath: authors.avatarPath }).from(authors).where(eq(authors.id, a.id)).get();
  q.insert(authors)
    .values({ id: a.id, username: a.username, fullName: a.fullName, avatarUrl: a.avatarUrl })
    .onConflictDoUpdate({ target: authors.id, set: { username: a.username, fullName: a.fullName, avatarUrl: a.avatarUrl } })
    .run();
  if (!existing?.avatarPath && a.avatarUrl) jobs.push({ kind: "avatar", id: a.id, url: a.avatarUrl });
}

function postFields(p: ParsedPost) {
  return {
    code: p.code, kind: p.kind, productType: p.productType, authorId: p.author.id, caption: p.caption,
    hashtags: p.hashtags, mentions: p.mentions, takenAt: p.takenAt, thumbnailUrl: p.thumbnailUrl,
    videoUrl: p.videoUrl, videoUrlExpiresAt: p.videoUrlExpiresAt, durationSec: p.durationSec,
    likeCount: p.likeCount, viewCount: p.viewCount, commentCount: p.commentCount,
    accessibilityCaption: p.accessibilityCaption, locationName: p.locationName,
    musicTitle: p.musicTitle, musicArtist: p.musicArtist, width: p.width, height: p.height,
  };
}

function upsertPost(q: Q, p: ParsedPost, runId: number, keyIfNew: number, keyUpdate: number | null, jobs: MediaJob[]) {
  upsertAuthor(q, p.author, jobs);
  const existing = q
    .select({ firstSeenRunId: posts.firstSeenRunId, thumbPath: posts.thumbPath })
    .from(posts)
    .where(eq(posts.id, p.id))
    .get();
  if (!existing) {
    q.insert(posts).values({ id: p.id, ...postFields(p), sortKey: keyIfNew, firstSeenRunId: runId, lastSeenRunId: runId }).run();
  } else {
    q.update(posts)
      .set({ ...postFields(p), lastSeenRunId: runId, removedRemotelyAt: null, ...(keyUpdate !== null ? { sortKey: keyUpdate } : {}) })
      .where(eq(posts.id, p.id))
      .run();
  }
  q.delete(postParts).where(eq(postParts.postId, p.id)).run();
  if (p.parts.length > 0) {
    q.insert(postParts)
      .values(p.parts.map((part) => ({
        postId: p.id, idx: part.index, kind: part.kind, imageUrl: part.imageUrl, videoUrl: part.videoUrl,
        width: part.width, height: part.height, accessibilityCaption: part.accessibilityCaption,
      })))
      .run();
  }
  if (!existing?.thumbPath && p.thumbnailUrl) jobs.push({ kind: "thumb", id: p.id, url: p.thumbnailUrl });
  return { isNew: !existing, knownBefore: !!existing && existing.firstSeenRunId < runId };
}

export function ingestSavedPage(db: Db, runId: number, raw: unknown) {
  const page = parseMediaPage(raw);
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    const run = activeRun(tx, runId);
    let pos = run.nextPos;
    let newCount = 0;
    let sawKnown = false;
    for (const p of page.items) {
      const key = run.baseKey - pos++;
      const r = upsertPost(tx, p, runId, key, run.mode === "full" ? key : null, jobs);
      if (r.isNew) newCount++;
      if (r.knownBefore) sawKnown = true;
    }
    tx.update(syncRuns)
      .set({
        nextPos: pos,
        pages: sql`${syncRuns.pages} + 1`,
        postsSeen: sql`${syncRuns.postsSeen} + ${page.items.length}`,
        postsNew: sql`${syncRuns.postsNew} + ${newCount}`,
      })
      .where(eq(syncRuns.id, runId))
      .run();
    if (!page.moreAvailable) setSetting(tx, SAVED_BACKFILL, "1");
    return { stop: run.mode === "incremental" && sawKnown, newCount, seen: page.items.length, skipped: page.skipped, jobs };
  });
}

export function ingestCollections(db: Db, runId: number, raw: unknown) {
  const page = parseCollectionsPage(raw);
  return db.transaction((tx) => {
    activeRun(tx, runId);
    for (const c of page.items) {
      tx.insert(collections)
        .values({ id: c.id, name: c.name, mediaCount: c.mediaCount, lastSeenRunId: runId })
        .onConflictDoUpdate({ target: collections.id, set: { name: c.name, mediaCount: c.mediaCount, lastSeenRunId: runId } })
        .run();
    }
    return { collections: page.items.map(({ id, name }) => ({ id, name })) };
  });
}

export function ingestCollectionPage(db: Db, runId: number, collectionId: string, raw: unknown) {
  const page = parseMediaPage(raw);
  const jobs: MediaJob[] = [];
  return db.transaction((tx) => {
    activeRun(tx, runId);
    const coll = tx.select().from(collections).where(eq(collections.id, collectionId)).get();
    if (!coll) throw new NotFoundError(`Collection ${collectionId} not found`);
    let sawKnownLink = false;
    for (const p of page.items) {
      const min = tx.select({ min: sql<number | null>`min(${posts.sortKey})` }).from(posts).get()?.min ?? RUN_SPAN;
      upsertPost(tx, p, runId, min - 1, null, jobs);
      const link = tx
        .select({ firstSeenRunId: postCollections.firstSeenRunId })
        .from(postCollections)
        .where(and(eq(postCollections.postId, p.id), eq(postCollections.collectionId, collectionId)))
        .get();
      if (link) {
        if (link.firstSeenRunId < runId) sawKnownLink = true;
      } else {
        tx.insert(postCollections).values({ postId: p.id, collectionId, firstSeenRunId: runId }).run();
      }
    }
    if (!page.moreAvailable) tx.update(collections).set({ backfillComplete: true }).where(eq(collections.id, collectionId)).run();
    return { stop: coll.backfillComplete && sawKnownLink, seen: page.items.length, jobs };
  });
}

export function finishRun(db: Db, runId: number, result: SyncResult, now = Date.now()) {
  const run = db.select().from(syncRuns).where(eq(syncRuns.id, runId)).get();
  if (!run) throw new NotFoundError(`Sync run ${runId} not found`);
  if (run.status !== "running") return;
  db.update(syncRuns)
    .set(result.ok
      ? { status: "done", finishedAt: now }
      : { status: "error", finishedAt: now, errorCode: result.code, errorMessage: result.message })
    .where(eq(syncRuns.id, runId))
    .run();
}

export function failStaleRuns(db: Db, now = Date.now()) {
  db.update(syncRuns)
    .set({ status: "error", finishedAt: now, errorCode: "interrupted", errorMessage: "The app was restarted during sync." })
    .where(eq(syncRuns.status, "running"))
    .run();
}

export const latestRun = (db: Db) => db.select().from(syncRuns).orderBy(desc(syncRuns.id)).limit(1).get() ?? null;

export const lastSuccessAt = (db: Db) =>
  db.select({ at: syncRuns.finishedAt }).from(syncRuns).where(eq(syncRuns.status, "done")).orderBy(desc(syncRuns.id)).limit(1).get()?.at ?? null;

export function markMediaSaved(db: Db, job: MediaJob) {
  if (job.kind === "thumb") db.update(posts).set({ thumbPath: job.id }).where(eq(posts.id, job.id)).run();
  else db.update(authors).set({ avatarPath: job.id }).where(eq(authors.id, job.id)).run();
}
```

- [ ] **Step 6: Run tests, expect PASS**

Run: `pnpm vitest run apps/server && pnpm --filter @no-fomo/server typecheck`

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(server): SQLite schema and sync ingest with stable feed order"
```

---

### Task 4: HTTP server, security, read API, media cache

**Files:**
- Create: `scripts/gen-extension-key.mjs`, generated `packages/core/src/extension-id.ts`
- Create: `packages/core/src/api.ts`; Modify `packages/core/src/index.ts`
- Create: `apps/server/src/config.ts`, `apps/server/src/queries.ts`, `apps/server/src/media/store.ts`, `apps/server/src/http/security.ts`, `apps/server/src/http/app.ts`, `apps/server/src/main.ts`
- Test: `apps/server/test/app.test.ts`, `apps/server/test/media-store.test.ts`

**Interfaces:**
- Consumes: everything from Task 3.
- Produces (HTTP, all JSON):
  - `GET /api/config` → `AppConfig { extensionId: string; version: string }`
  - `POST /api/sync/runs` `{}` → `{ runId, mode }` (201)
  - `POST /api/sync/runs/:id/saved` `{ payload }` → `{ stop, newCount, seen }`
  - `POST /api/sync/runs/:id/collections` `{ payload }` → `{ collections }`
  - `POST /api/sync/runs/:id/collections/:cid` `{ payload }` → `{ stop, seen }`
  - `POST /api/sync/runs/:id/finish` `SyncResult` → `{ ok: true }`
  - `GET /api/sync/status` → `SyncStatus`
  - `GET /api/posts?author&collection&kind&cursor&limit` → `PostsPage`
  - `GET /api/authors` → `AuthorFacet[]`, `GET /api/collections` → `CollectionFacet[]`
  - `GET /media/thumbs/:id`, `GET /media/avatars/:id` → image bytes
  - Everything else: built SPA with `index.html` fallback.
- Produces (TS): `createApp(deps: { db: Db; config: ServerConfig; media: MediaStore }): Hono`, `createMediaStore(opts): MediaStore`, `loadConfig(env?): ServerConfig`, `EXTENSION_ID`, `EXTENSION_PUBLIC_KEY`.

- [ ] **Step 1: Generate the fixed extension id**

`scripts/gen-extension-key.mjs`:
```js
// Creates a public key so the unpacked extension always gets the same id.
// The id lets the local server and web app trust only this extension.
import { createHash, generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const out = new URL("../packages/core/src/extension-id.ts", import.meta.url);
if (existsSync(out) && !process.argv.includes("--force")) {
  console.log("extension-id.ts already exists (use --force to replace)");
  process.exit(0);
}
const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const der = publicKey.export({ type: "spki", format: "der" });
const id = [...createHash("sha256").update(der).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
writeFileSync(
  out,
  `// Generated by scripts/gen-extension-key.mjs. Do not edit.\n` +
    `export const EXTENSION_PUBLIC_KEY = "${der.toString("base64")}";\n` +
    `export const EXTENSION_ID = "${id}";\n`,
);
console.log(`Extension id: ${id}`);
```
Run: `node scripts/gen-extension-key.mjs`. Add to `packages/core/src/index.ts`: `export * from "./extension-id";`

- [ ] **Step 2: Shared API types** `packages/core/src/api.ts`

```ts
import type { MediaKind } from "./ig/types";

export interface PostListItem {
  id: string;
  code: string;
  kind: MediaKind;
  author: { id: string; username: string; fullName: string | null };
  caption: string | null;
  hashtags: string[];
  takenAt: number;
  durationSec: number | null;
  likeCount: number | null;
  viewCount: number | null;
  commentCount: number | null;
  accessibilityCaption: string | null;
  locationName: string | null;
  musicTitle: string | null;
  musicArtist: string | null;
  width: number | null;
  height: number | null;
  thumbUrl: string;
  permalink: string;
}

export interface PostsPage { items: PostListItem[]; nextCursor: number | null; total: number }
export interface PostsQuery { author?: string; collection?: string; kind?: MediaKind; cursor?: number; limit: number }
export interface AuthorFacet { id: string; username: string; fullName: string | null; avatarUrl: string; count: number }
export interface CollectionFacet { id: string; name: string; count: number }

export interface SyncRunInfo {
  id: number;
  mode: "incremental" | "full";
  status: "running" | "done" | "error";
  startedAt: number;
  finishedAt: number | null;
  pages: number;
  postsSeen: number;
  postsNew: number;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface SyncStatus { run: SyncRunInfo | null; lastSuccessAt: number | null }
export interface AppConfig { extensionId: string; version: string }
```
Add `export * from "./api";` to core index.

- [ ] **Step 3: Write failing tests**

`apps/server/test/media-store.test.ts`:
```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMediaStore, imageType } from "../src/media/store";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe("media store", () => {
  it("downloads allowed images once and reports saved jobs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nf-media-"));
    let calls = 0;
    const saved: string[] = [];
    const store = createMediaStore({
      dir,
      fetch: (async () => { calls++; return new Response(JPEG); }) as typeof fetch,
      onSaved: (job) => saved.push(`${job.kind}:${job.id}`),
    });
    const job = { kind: "thumb" as const, id: "1", url: "https://scontent.cdninstagram.com/a.jpg" };
    store.enqueue([job, job]);
    await store.idle();
    expect(calls).toBe(1);
    expect(saved).toEqual(["thumb:1"]);
    expect(readFileSync(store.pathFor("thumb", "1"))).toEqual(JPEG);
  });

  it("refuses non-Instagram hosts and non-image bodies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nf-media-"));
    const store = createMediaStore({
      dir,
      fetch: (async () => new Response("<html>")) as typeof fetch,
      onSaved: () => {},
    });
    expect(await store.fetchNow({ kind: "thumb", id: "1", url: "http://169.254.169.254/x" })).toBe(false);
    expect(await store.fetchNow({ kind: "thumb", id: "2", url: "https://scontent.cdninstagram.com/a.jpg" })).toBe(false);
  });

  it("detects image types", () => {
    expect(imageType(JPEG)).toBe("image/jpeg");
    expect(imageType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(imageType(Buffer.from("hello"))).toBeNull();
  });
});
```

`apps/server/test/app.test.ts`:
```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import page1 from "@no-fomo/core/fixtures/saved-page-1.json";
import page2 from "@no-fomo/core/fixtures/saved-page-2.json";
import collectionsList from "@no-fomo/core/fixtures/collections-list.json";
import type { AuthorFacet, PostsPage, SyncStatus } from "@no-fomo/core";
import { openDb } from "../src/db/open";
import { createApp } from "../src/http/app";
import { createMediaStore } from "../src/media/store";
import type { ServerConfig } from "../src/config";
import { markMediaSaved } from "../src/sync/ingest";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const HOST = "localhost:4747";
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
  app = createApp({ db, config, media });
});

const post = (path: string, body: unknown, origin = `chrome-extension://${EXT}`) =>
  app.request(path, {
    method: "POST",
    headers: { host: HOST, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (path: string) => app.request(path, { headers: { host: HOST } });

async function syncFixtures() {
  const { runId } = await (await post("/api/sync/runs", {})).json();
  await post(`/api/sync/runs/${runId}/saved`, { payload: page1 });
  await post(`/api/sync/runs/${runId}/saved`, { payload: page2 });
  await post(`/api/sync/runs/${runId}/collections`, { payload: collectionsList });
  await post(`/api/sync/runs/${runId}/collections/17900000000000002`, {
    payload: { items: [page1.items[0], page1.items[2]], more_available: false },
  });
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
      { id: "17900000000000003", name: "Design", count: 0 },
    ]);
  });

  it("serves cached thumbnails", async () => {
    await syncFixtures();
    const res = await get("/media/thumbs/3500000000000000001");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("returns 409 for pages sent to a finished run", async () => {
    const { runId } = await (await post("/api/sync/runs", {})).json();
    await post(`/api/sync/runs/${runId}/finish`, { ok: true });
    expect((await post(`/api/sync/runs/${runId}/saved`, { payload: page1 })).status).toBe(409);
  });
});
```

- [ ] **Step 4: Run tests, expect FAIL**

Run: `pnpm vitest run apps/server`

- [ ] **Step 5: Implement config, media store, security, queries, app, main**

`apps/server/src/config.ts`:
```ts
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, EXTENSION_ID } from "@no-fomo/core";

export interface ServerConfig {
  port: number;
  dataDir: string;
  webDist: string | null;
  extensionId: string;
  devOrigins: string[];
  dumpPayloads: boolean;
  extraMediaHosts: string[];
}

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const webDist = fileURLToPath(new URL("../../web/build/client", import.meta.url));
  return {
    port: Number(env.NO_FOMO_PORT ?? DEFAULT_PORT),
    dataDir: env.NO_FOMO_HOME ?? join(homedir(), ".no-fomo"),
    webDist: existsSync(join(webDist, "index.html")) ? webDist : null,
    extensionId: env.NO_FOMO_EXTENSION_ID ?? EXTENSION_ID,
    devOrigins: env.NO_FOMO_DEV_ORIGINS ? list(env.NO_FOMO_DEV_ORIGINS) : ["http://localhost:5173"],
    dumpPayloads: env.NO_FOMO_DUMP === "1",
    extraMediaHosts: list(env.NO_FOMO_EXTRA_MEDIA_HOSTS),
  };
}
```

`apps/server/src/media/store.ts`:
```ts
import { mkdirSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaJob } from "../sync/ingest";

const MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_HOSTS = ["cdninstagram.com", "fbcdn.net"];

export interface MediaStore {
  enqueue(jobs: MediaJob[]): void;
  fetchNow(job: MediaJob): Promise<boolean>;
  pathFor(kind: MediaJob["kind"], id: string): string;
  idle(): Promise<void>;
}

export function imageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "\x89PNG") return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  return null;
}

export function createMediaStore(opts: {
  dir: string;
  onSaved: (job: MediaJob) => void;
  fetch?: typeof fetch;
  concurrency?: number;
  extraHosts?: string[];
}): MediaStore {
  const fetchFn = opts.fetch ?? fetch;
  const concurrency = opts.concurrency ?? 4;
  const hosts = [...DEFAULT_HOSTS, ...(opts.extraHosts ?? [])];
  mkdirSync(join(opts.dir, "thumbs"), { recursive: true });
  mkdirSync(join(opts.dir, "avatars"), { recursive: true });

  const queue: MediaJob[] = [];
  const queued = new Set<string>();
  const inFlight = new Map<string, Promise<boolean>>();
  let active = 0;
  let waiters: Array<() => void> = [];
  const key = (j: MediaJob) => `${j.kind}:${j.id}`;
  const pathFor = (kind: MediaJob["kind"], id: string) => join(opts.dir, kind === "thumb" ? "thumbs" : "avatars", id);

  function allowed(url: string) {
    try {
      const u = new URL(url);
      return u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    } catch {
      return false;
    }
  }

  async function download(job: MediaJob): Promise<boolean> {
    if (!/^\d+$/.test(job.id) || !allowed(job.url)) return false;
    try {
      const res = await fetchFn(job.url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES || !imageType(buf)) return false;
      const file = pathFor(job.kind, job.id);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, buf);
      await rename(tmp, file);
      opts.onSaved(job);
      return true;
    } catch {
      return false;
    }
  }

  function fetchNow(job: MediaJob) {
    const k = key(job);
    const running = inFlight.get(k);
    if (running) return running;
    const p = download(job).finally(() => inFlight.delete(k));
    inFlight.set(k, p);
    return p;
  }

  function pump() {
    while (active < concurrency && queue.length > 0) {
      const job = queue.shift()!;
      active++;
      void fetchNow(job).finally(() => {
        active--;
        queued.delete(key(job));
        pump();
      });
    }
    if (active === 0 && queue.length === 0) {
      const w = waiters;
      waiters = [];
      w.forEach((f) => f());
    }
  }

  return {
    pathFor,
    fetchNow,
    enqueue(jobs) {
      for (const j of jobs) {
        if (queued.has(key(j))) continue;
        queued.add(key(j));
        queue.push(j);
      }
      pump();
    },
    idle: () => (active === 0 && queue.length === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r))),
  };
}
```

`apps/server/src/http/security.ts`:
```ts
import type { MiddlewareHandler } from "hono";

export function security(opts: { port: number; allowedOrigins: string[] }): MiddlewareHandler {
  const hosts = new Set([`localhost:${opts.port}`, `127.0.0.1:${opts.port}`]);
  const origins = new Set(opts.allowedOrigins);
  const cors = (origin: string) => ({
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  });

  return async (c, next) => {
    const host = c.req.header("host");
    if (!host || !hosts.has(host)) return c.text("Forbidden host", 403);
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin)) return c.text("Forbidden origin", 403);
    if (c.req.method === "OPTIONS") return c.body(null, 204, origin ? cors(origin) : {});
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      if (!(c.req.header("content-type") ?? "").startsWith("application/json")) return c.text("JSON required", 415);
    }
    await next();
    if (origin) for (const [k, v] of Object.entries(cors(origin))) c.res.headers.set(k, v);
  };
}
```

`apps/server/src/queries.ts`:
```ts
import { and, asc, count, desc, eq, inArray, isNull, lt, type SQL } from "drizzle-orm";
import type { AuthorFacet, CollectionFacet, PostListItem, PostsPage, PostsQuery, SyncStatus } from "@no-fomo/core";
import type { Db } from "./db/open";
import { authors, collections, postCollections, posts } from "./db/schema";
import { lastSuccessAt, latestRun } from "./sync/ingest";

const visible = and(isNull(posts.removedAt), isNull(posts.removedRemotelyAt));

export function listPosts(db: Db, q: PostsQuery): PostsPage {
  const filters: (SQL | undefined)[] = [
    visible,
    q.author ? eq(posts.authorId, q.author) : undefined,
    q.kind ? eq(posts.kind, q.kind) : undefined,
    q.collection
      ? inArray(posts.id, db.select({ id: postCollections.postId }).from(postCollections).where(eq(postCollections.collectionId, q.collection)))
      : undefined,
  ];
  const where = and(...filters);
  const total = db.select({ n: count() }).from(posts).where(where).get()?.n ?? 0;
  const rows = db
    .select({ post: posts, username: authors.username, fullName: authors.fullName })
    .from(posts)
    .innerJoin(authors, eq(authors.id, posts.authorId))
    .where(and(where, q.cursor !== undefined ? lt(posts.sortKey, q.cursor) : undefined))
    .orderBy(desc(posts.sortKey))
    .limit(q.limit + 1)
    .all();
  const more = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  return { items: page.map(toItem), nextCursor: more ? page.at(-1)!.post.sortKey : null, total };
}

function toItem(r: { post: typeof posts.$inferSelect; username: string; fullName: string | null }): PostListItem {
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
  };
}

export function listAuthors(db: Db): AuthorFacet[] {
  const n = count(posts.id);
  return db
    .select({ id: authors.id, username: authors.username, fullName: authors.fullName, count: n })
    .from(authors)
    .innerJoin(posts, and(eq(posts.authorId, authors.id), visible))
    .groupBy(authors.id)
    .orderBy(desc(n), asc(authors.username))
    .all()
    .map((a) => ({ ...a, avatarUrl: `/media/avatars/${a.id}` }));
}

export function listCollections(db: Db): CollectionFacet[] {
  const n = count(posts.id);
  return db
    .select({ id: collections.id, name: collections.name, count: n })
    .from(collections)
    .leftJoin(postCollections, eq(postCollections.collectionId, collections.id))
    .leftJoin(posts, and(eq(posts.id, postCollections.postId), visible))
    .groupBy(collections.id)
    .orderBy(asc(collections.name))
    .all();
}

export function syncStatus(db: Db): SyncStatus {
  const run = latestRun(db);
  return {
    run: run && {
      id: run.id, mode: run.mode, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      pages: run.pages, postsSeen: run.postsSeen, postsNew: run.postsNew,
      errorCode: run.errorCode, errorMessage: run.errorMessage,
    },
    lastSuccessAt: lastSuccessAt(db),
  };
}
```

`apps/server/src/http/app.ts`:
```ts
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { APP_VERSION } from "@no-fomo/core";
import type { ServerConfig } from "../config";
import type { Db } from "../db/open";
import { authors, posts } from "../db/schema";
import { imageType, type MediaStore } from "../media/store";
import { listAuthors, listCollections, listPosts, syncStatus } from "../queries";
import {
  finishRun, ingestCollectionPage, ingestCollections, ingestSavedPage, NotFoundError, RunNotActiveError, startRun,
} from "../sync/ingest";
import { security } from "./security";

const Id = z.string().regex(/^\d{1,30}$/);
const RunId = z.coerce.number().int().positive();
const PageBody = z.object({ payload: z.unknown() });
const FinishBody = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), code: z.string().max(64), message: z.string().max(500) }),
]);
const PostsQuerySchema = z.object({
  author: Id.optional(),
  collection: Id.optional(),
  kind: z.enum(["image", "video", "carousel"]).optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

export function createApp(deps: { db: Db; config: ServerConfig; media: MediaStore }) {
  const { db, config, media } = deps;
  const app = new Hono();
  let dumpCount = 0;

  async function dump(runId: number, kind: string, payload: unknown) {
    if (!config.dumpPayloads) return;
    const dir = join(config.dataDir, "dumps");
    mkdirSync(dir, { recursive: true });
    await writeFile(join(dir, `${runId}-${String(++dumpCount).padStart(4, "0")}-${kind}.json`), JSON.stringify(payload, null, 2));
  }

  app.use(
    "*",
    security({
      port: config.port,
      allowedOrigins: [
        `http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`, `chrome-extension://${config.extensionId}`, ...config.devOrigins,
      ],
    }),
  );
  app.use("/api/*", bodyLimit({ maxSize: 8 * 1024 * 1024 }));

  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: "bad_request", issues: err.issues }, 400);
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof RunNotActiveError) return c.json({ error: err.message }, 409);
    console.error(err);
    return c.json({ error: "internal_error" }, 500);
  });

  app.get("/api/config", (c) => c.json({ extensionId: config.extensionId, version: APP_VERSION }));

  app.post("/api/sync/runs", (c) => c.json(startRun(db), 201));

  app.post("/api/sync/runs/:id/saved", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "saved", payload);
    const r = ingestSavedPage(db, runId, payload);
    media.enqueue(r.jobs);
    return c.json({ stop: r.stop, newCount: r.newCount, seen: r.seen });
  });

  app.post("/api/sync/runs/:id/collections", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, "collections", payload);
    return c.json(ingestCollections(db, runId, payload));
  });

  app.post("/api/sync/runs/:id/collections/:cid", async (c) => {
    const runId = RunId.parse(c.req.param("id"));
    const cid = Id.parse(c.req.param("cid"));
    const { payload } = PageBody.parse(await c.req.json());
    await dump(runId, `collection-${cid}`, payload);
    const r = ingestCollectionPage(db, runId, cid, payload);
    media.enqueue(r.jobs);
    return c.json({ stop: r.stop, seen: r.seen });
  });

  app.post("/api/sync/runs/:id/finish", async (c) => {
    finishRun(db, RunId.parse(c.req.param("id")), FinishBody.parse(await c.req.json()));
    return c.json({ ok: true });
  });

  app.get("/api/sync/status", (c) => c.json(syncStatus(db)));
  app.get("/api/posts", (c) => c.json(listPosts(db, PostsQuerySchema.parse(c.req.query()))));
  app.get("/api/authors", (c) => c.json(listAuthors(db)));
  app.get("/api/collections", (c) => c.json(listCollections(db)));
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  app.get("/media/:folder{thumbs|avatars}/:id{[0-9]+}", async (c) => {
    const kind = c.req.param("folder") === "thumbs" ? "thumb" : "avatar";
    const id = c.req.param("id");
    const file = media.pathFor(kind, id);
    if (!existsSync(file)) {
      const url =
        kind === "thumb"
          ? db.select({ url: posts.thumbnailUrl }).from(posts).where(eq(posts.id, id)).get()?.url
          : db.select({ url: authors.avatarUrl }).from(authors).where(eq(authors.id, id)).get()?.url;
      if (!url || !(await media.fetchNow({ kind, id, url }))) return c.notFound();
    }
    const bytes = await readFile(file);
    return c.body(bytes, 200, {
      "content-type": imageType(bytes) ?? "application/octet-stream",
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    });
  });
  app.get("/media/*", (c) => c.notFound());

  app.get("*", async (c) => {
    if (!config.webDist) return c.text("Web app is not built. Run: pnpm --filter @no-fomo/web build", 404);
    const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
    const file = resolve(config.webDist, rel);
    if (rel && file.startsWith(config.webDist + sep) && existsSync(file) && statSync(file).isFile()) {
      const immutable = rel.startsWith("assets/");
      return c.body(await readFile(file), 200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      });
    }
    return c.html(await readFile(join(config.webDist, "index.html"), "utf8"));
  });

  return app;
}
```

`apps/server/src/main.ts`:
```ts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config";
import { openDb } from "./db/open";
import { createApp } from "./http/app";
import { createMediaStore } from "./media/store";
import { failStaleRuns, markMediaSaved } from "./sync/ingest";

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, "no-fomo.db"));
failStaleRuns(db);
const media = createMediaStore({
  dir: join(config.dataDir, "media"),
  extraHosts: config.extraMediaHosts,
  onSaved: (job) => markMediaSaved(db, job),
});
const app = createApp({ db, config, media });

serve({ fetch: app.fetch, port: config.port, hostname: "127.0.0.1" }, () => {
  console.log(`no-fomo is running at http://localhost:${config.port}`);
  console.log(`Data folder: ${config.dataDir}`);
  if (!config.webDist) console.log("Web app not built yet. In dev, open http://localhost:5173");
});
```

- [ ] **Step 6: Run tests, expect PASS**

Run: `pnpm vitest run apps/server && pnpm --filter @no-fomo/server typecheck`

- [ ] **Step 7: Smoke-run the server**

Run: `NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server start` then `curl -s localhost:4747/api/config` → JSON with `extensionId`. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(server): HTTP API, origin checks, thumbnail cache"
```

---

### Task 5: Chrome extension

**Files:**
- Create: `apps/extension/package.json`, `apps/extension/tsconfig.json`, `apps/extension/wxt.config.ts`
- Create: `apps/extension/src/external.ts`, `apps/extension/src/relay.ts`, `apps/extension/src/relay-sink.ts`
- Create: `apps/extension/entrypoints/background.ts`, `apps/extension/entrypoints/instagram.content.ts`
- Test: `apps/extension/test/external.test.ts`, `apps/extension/test/relay.test.ts`

**Interfaces:**
- Consumes: `createIgClient`, `runSync`, `SyncSink` (Task 2), `EXTENSION_PUBLIC_KEY`, `DEFAULT_PORT`, `APP_VERSION` (Task 4).
- Produces (messages):
  - Web page to extension (external): `{ type: "ping" }` → `{ ok: true, version }`; `{ type: "sync:start" }` → `{ ok: true } | { ok: false, error: "already_running" | "no_sender" | "instagram_tab_failed" | string }`
  - Background to content: `{ type: "sync:run", serverUrl }` → `{ ok: true } | { ok: false, error: "already_running" }`
  - Content to background: `{ type: "relay", serverUrl, path, body }` → `{ ok: true, data } | { ok: false, error }`

- [ ] **Step 1: Package setup**

`apps/extension/package.json`:
```json
{
  "name": "@no-fomo/extension",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "postinstall": "wxt prepare",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```
Run: `pnpm --filter @no-fomo/extension add @no-fomo/core@workspace:* && pnpm --filter @no-fomo/extension add -D wxt@^0.21`

`apps/extension/tsconfig.json`:
```json
{ "extends": "./.wxt/tsconfig.json", "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true }, "include": [".wxt/wxt.d.ts", "entrypoints", "src", "test", "wxt.config.ts"] }
```

`apps/extension/wxt.config.ts`:
```ts
import { defineConfig } from "wxt";
import { EXTENSION_PUBLIC_KEY } from "@no-fomo/core/extension-id";

export default defineConfig({
  manifest: {
    name: "no-fomo",
    description: "Syncs your Instagram saved posts to the no-fomo app on your computer.",
    key: EXTENSION_PUBLIC_KEY,
    permissions: ["tabs"],
    host_permissions: ["https://www.instagram.com/*", "http://localhost/*", "http://127.0.0.1/*"],
    externally_connectable: { matches: ["http://localhost/*", "http://127.0.0.1/*"] },
    action: { default_title: "Open no-fomo" },
  },
});
```

- [ ] **Step 2: Write failing tests**

`apps/extension/test/external.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { handleExternalMessage, type ExternalDeps } from "../src/external";

function deps(over: Partial<ExternalDeps> = {}): ExternalDeps {
  return {
    version: "0.1.0",
    findInstagramTab: vi.fn(async () => 5),
    openInstagramTab: vi.fn(async () => 9),
    sendToTab: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

describe("handleExternalMessage", () => {
  it("answers ping", async () => {
    expect(await handleExternalMessage({ type: "ping" }, undefined, deps())).toEqual({ ok: true, version: "0.1.0" });
  });

  it("starts sync in an existing Instagram tab with the sender origin as server", async () => {
    const d = deps();
    const r = await handleExternalMessage({ type: "sync:start" }, "http://localhost:4747/?author=1", d);
    expect(r).toEqual({ ok: true });
    expect(d.sendToTab).toHaveBeenCalledWith(5, { type: "sync:run", serverUrl: "http://localhost:4747" });
    expect(d.openInstagramTab).not.toHaveBeenCalled();
  });

  it("opens Instagram when no tab exists", async () => {
    const d = deps({ findInstagramTab: vi.fn(async () => null) });
    await handleExternalMessage({ type: "sync:start" }, "http://localhost:4747/", d);
    expect(d.sendToTab).toHaveBeenCalledWith(9, expect.anything());
  });

  it("rejects unknown or malformed messages", async () => {
    expect(await handleExternalMessage("x", undefined, deps())).toEqual({ ok: false, error: "bad_message" });
    expect(await handleExternalMessage({ type: "rm -rf" }, undefined, deps())).toEqual({ ok: false, error: "unknown_type" });
    expect(await handleExternalMessage({ type: "sync:start" }, undefined, deps())).toEqual({ ok: false, error: "no_sender" });
  });
});
```

`apps/extension/test/relay.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { handleRelay } from "../src/relay";
import { createRelaySink } from "../src/relay-sink";

const okFetch = (async (url: string | URL, init?: RequestInit) =>
  new Response(JSON.stringify({ url: String(url), body: JSON.parse(String(init?.body)) }), { status: 200 })) as typeof fetch;

describe("handleRelay", () => {
  it("posts JSON to the local server", async () => {
    const r = await handleRelay({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs", body: { a: 1 } }, okFetch);
    expect(r).toEqual({ ok: true, data: { url: "http://localhost:4747/api/sync/runs", body: { a: 1 } } });
  });

  it("refuses non-local servers and non-sync paths", async () => {
    expect(await handleRelay({ type: "relay", serverUrl: "https://evil.example", path: "/api/sync/runs", body: {} }, okFetch))
      .toEqual({ ok: false, error: "bad_relay" });
    expect(await handleRelay({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/posts", body: {} }, okFetch))
      .toEqual({ ok: false, error: "bad_relay" });
  });

  it("passes server errors through", async () => {
    const f = (async () => new Response(JSON.stringify({ error: "Sync run 1 is done" }), { status: 409 })) as typeof fetch;
    expect(await handleRelay({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs/1/saved", body: {} }, f))
      .toEqual({ ok: false, error: "Sync run 1 is done" });
  });
});

describe("createRelaySink", () => {
  it("maps sink calls to server paths", async () => {
    const sent: unknown[] = [];
    const sink = createRelaySink("http://localhost:4747", async (m) => { sent.push(m); return { ok: true, data: { runId: 3, stop: false, seen: 1, collections: [] } }; });
    await sink.startRun();
    await sink.collectionPage(3, "179", { x: 1 });
    expect(sent).toEqual([
      { type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs", body: {} },
      { type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs/3/collections/179", body: { payload: { x: 1 } } },
    ]);
  });

  it("throws on relay errors", async () => {
    const sink = createRelaySink("http://localhost:4747", async () => ({ ok: false, error: "down" }));
    await expect(sink.startRun()).rejects.toThrow("down");
  });
});
```

- [ ] **Step 3: Run tests, expect FAIL**

Run: `pnpm vitest run apps/extension`

- [ ] **Step 4: Implement**

`apps/extension/src/external.ts`:
```ts
export type ExtResponse = { ok: true; version?: string } | { ok: false; error: string };

export interface ExternalDeps {
  version: string;
  findInstagramTab(): Promise<number | null>;
  openInstagramTab(): Promise<number>;
  sendToTab(tabId: number, msg: { type: "sync:run"; serverUrl: string }): Promise<unknown>;
}

export async function handleExternalMessage(msg: unknown, senderUrl: string | undefined, deps: ExternalDeps): Promise<ExtResponse> {
  if (typeof msg !== "object" || msg === null) return { ok: false, error: "bad_message" };
  const type = (msg as { type?: unknown }).type;
  if (type === "ping") return { ok: true, version: deps.version };
  if (type !== "sync:start") return { ok: false, error: "unknown_type" };
  if (!senderUrl) return { ok: false, error: "no_sender" };
  const serverUrl = new URL(senderUrl).origin;
  const tabId = (await deps.findInstagramTab()) ?? (await deps.openInstagramTab());
  const reply = (await deps.sendToTab(tabId, { type: "sync:run", serverUrl })) as ExtResponse | undefined;
  return reply ?? { ok: false, error: "instagram_tab_failed" };
}
```

`apps/extension/src/relay.ts`:
```ts
export interface RelayMessage { type: "relay"; serverUrl: string; path: string; body: unknown }
export type RelayResponse = { ok: true; data: unknown } | { ok: false; error: string };

function isLocal(serverUrl: string) {
  try {
    const u = new URL(serverUrl);
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export async function handleRelay(msg: RelayMessage, fetchFn: typeof fetch): Promise<RelayResponse> {
  if (msg?.type !== "relay" || !isLocal(msg.serverUrl) || typeof msg.path !== "string" || !msg.path.startsWith("/api/sync/")) {
    return { ok: false, error: "bad_relay" };
  }
  try {
    const res = await fetchFn(new URL(msg.path, msg.serverUrl).toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg.body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: data?.error ?? `Server error ${res.status}` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: `Cannot reach no-fomo app: ${(e as Error).message}` };
  }
}
```

`apps/extension/src/relay-sink.ts`:
```ts
import type { SyncSink } from "@no-fomo/core";
import type { RelayMessage, RelayResponse } from "./relay";

export function createRelaySink(serverUrl: string, send: (m: RelayMessage) => Promise<RelayResponse>): SyncSink {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const r = await send({ type: "relay", serverUrl, path, body });
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  }
  return {
    startRun: () => post("/api/sync/runs", {}),
    savedPage: (runId, payload) => post(`/api/sync/runs/${runId}/saved`, { payload }),
    collections: (runId, payload) => post(`/api/sync/runs/${runId}/collections`, { payload }),
    collectionPage: (runId, cid, payload) => post(`/api/sync/runs/${runId}/collections/${encodeURIComponent(cid)}`, { payload }),
    finishRun: async (runId, result) => { await post(`/api/sync/runs/${runId}/finish`, result); },
  };
}
```

`apps/extension/entrypoints/background.ts`:
```ts
import { APP_VERSION, DEFAULT_PORT } from "@no-fomo/core";
import { handleExternalMessage } from "../src/external";
import { handleRelay, type RelayMessage } from "../src/relay";

const IG_URL = "https://www.instagram.com/";

function waitForComplete(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { browser.tabs.onUpdated.removeListener(listener); reject(new Error("Instagram did not load")); }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function sendToTab(tabId: number, msg: unknown): Promise<unknown> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await browser.tabs.sendMessage(tabId, msg);
    } catch {
      // Tab opened before the extension was installed has no content script: reload it once.
      if (attempt === 0) {
        await browser.tabs.reload(tabId);
        await waitForComplete(tabId).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: false, error: "instagram_tab_failed" };
}

export default defineBackground(() => {
  browser.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    handleExternalMessage(msg, sender.url, {
      version: APP_VERSION,
      findInstagramTab: async () => (await browser.tabs.query({ url: "https://www.instagram.com/*" }))[0]?.id ?? null,
      openInstagramTab: async () => {
        const tab = await browser.tabs.create({ url: IG_URL, active: false });
        await waitForComplete(tab.id!);
        return tab.id!;
      },
      sendToTab,
    }).then(sendResponse, (e: Error) => sendResponse({ ok: false, error: e.message }));
    return true;
  });

  browser.runtime.onMessage.addListener((msg: RelayMessage, _sender, sendResponse) => {
    if (msg?.type !== "relay") return;
    handleRelay(msg, fetch).then(sendResponse);
    return true;
  });

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: `http://localhost:${DEFAULT_PORT}` });
  });
});
```

`apps/extension/entrypoints/instagram.content.ts`:
```ts
import { createIgClient, runSync } from "@no-fomo/core";
import { createRelaySink } from "../src/relay-sink";
import type { RelayMessage, RelayResponse } from "../src/relay";

function readCsrf(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    let running = false;
    browser.runtime.onMessage.addListener((msg: { type?: string; serverUrl?: string }, _sender, sendResponse) => {
      if (msg?.type !== "sync:run" || typeof msg.serverUrl !== "string") return;
      if (running) {
        sendResponse({ ok: false, error: "already_running" });
        return;
      }
      running = true;
      sendResponse({ ok: true });
      const sink = createRelaySink(msg.serverUrl, (m: RelayMessage) => browser.runtime.sendMessage(m) as Promise<RelayResponse>);
      const ig = createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf });
      void runSync({ ig, sink, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })
        .then((r) => console.info("[no-fomo] sync finished", r))
        .finally(() => { running = false; });
    });
  },
});
```

- [ ] **Step 5: Run tests, build, check manifest**

Run:
```bash
pnpm vitest run apps/extension
pnpm --filter @no-fomo/extension build
node -e "const m=require('./apps/extension/.output/chrome-mv3/manifest.json');console.log(!!m.key, m.externally_connectable, m.host_permissions)"
pnpm --filter @no-fomo/extension typecheck
```
Expected: tests PASS, build succeeds, manifest has `key` and `externally_connectable`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(extension): sync from instagram.com and relay to local server"
```

---

### Task 6: Web app shell, design tokens, data layer

Apply the design-taste-frontend skill here. Design read: "Personal media library tool for one power user, calm dark-first media-viewer language, Tailwind v4 + own Base UI components + Geist." Dials: `DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 6`. The skill's landing-page rules (hero, eyebrows, bento) do not apply. Its anti-default rules do: no Inter, no purple, one accent, one radius system, both themes, full loading/empty/error states, allowed icon family, zero em-dashes.

**Files:**
- Create: `DESIGN.md`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/react-router.config.ts`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`
- Create: `apps/web/app/root.tsx`, `apps/web/app/routes.ts`, `apps/web/app/app.css`, `apps/web/app/routes/library.tsx` (placeholder in this task)
- Create: `apps/web/app/lib/{api,filters,extension,format}.ts`
- Test: `apps/web/test/filters.test.ts`, `apps/web/test/format.test.ts`

**Interfaces:**
- Consumes: API types (Task 4), extension messages (Task 5).
- Produces: `api.{config,posts,authors,collections,syncStatus}`, `readFilters(sp): Filters`, `writeFilters(sp, patch): URLSearchParams`, `postsQueryString(f, cursor, limit?)`, `hasFilters(f)`, `pingExtension(id)`, `startExtensionSync(id)`, `syncErrorText(code)`, `formatDuration(sec)`, `formatCount(n)`, `formatAgo(ms, now?)`, `formatDate(unixSec)`.

- [ ] **Step 1: DESIGN.md**

```markdown
# no-fomo design rules

**Read:** a personal media library for one power user. Calm, dark-first, the posts are the color. The UI stays quiet.

**Dials:** variance 3, motion 3, density 6.

## Color
- Neutrals: cool gray (hue 250), never pure black or pure white.
- One accent: burnt orange. Light `oklch(0.56 0.17 38)` with near-white text. Dark `oklch(0.74 0.15 52)` with near-black text. Both pass WCAG AA for button text.
- Accent is only for the primary action on a screen and the active filter state. Never for decoration.
- Danger red only for errors.
- Theme follows the system (`prefers-color-scheme`). Both themes are first-class.

## Type
- Geist Variable for UI. Geist Mono Variable for numbers (counts, durations, dates in tables), always `tabular-nums`.
- Sizes: 13px meta, 14px controls, 15px body, 20px sheet titles. No display sizes, this is a tool.

## Shape
- Controls (buttons, inputs, popovers): 8px radius (`rounded-control`).
- Media tiles and thumbnails: 6px radius (`rounded-tile`).
- Avatars: full circle. Nothing else is a pill.

## Layout
- Content max width 1600px, 16px gutter on phone, 24px on desktop.
- Grid tiles are 3:4. Meta text sits under the tile, never on top of the image.
- Group with spacing and single hairlines (`border-line`), not cards.

## Motion
- Only feedback and state change: hover zoom on tiles (1.03), sheet slide-in, button press (scale 0.98).
- Ease `cubic-bezier(0.16, 1, 0.3, 1)`, 200-300ms. Everything off under `prefers-reduced-motion`.

## Icons
- Hugeicons only, stroke width 1.5, 16px in controls, 14px in meta.

## Copy
- Plain, short, simple English. Sentence case. No em-dashes or en-dashes. No jokes, no filler verbs.
- Every state has text: loading (skeletons), empty (how to fill it), error (what happened and what to do).
```

- [ ] **Step 2: Package + config**

Run:
```bash
pnpm --filter @no-fomo/web add react@^19 react-dom@^19 react-router@^8 @react-router/node@^8 @no-fomo/core@workspace:* @tanstack/react-query@^5 @base-ui/react@^1 @hugeicons/react @hugeicons/core-free-icons @fontsource-variable/geist @fontsource-variable/geist-mono
pnpm --filter @no-fomo/web add -D @react-router/dev@^8 vite tailwindcss@^4 @tailwindcss/vite@^4 @types/react @types/react-dom
```

`apps/web/package.json` scripts:
```json
{
  "name": "@no-fomo/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "typecheck": "react-router typegen && tsc -p tsconfig.json"
  }
}
```

`apps/web/react-router.config.ts`:
```ts
import type { Config } from "@react-router/dev/config";

export default { ssr: false } satisfies Config;
```

`apps/web/vite.config.ts`:
```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const server = "http://localhost:4747";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: server, changeOrigin: true }, "/media": { target: server, changeOrigin: true } },
  },
});
```

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"], "jsx": "react-jsx", "types": ["vite/client"], "rootDirs": [".", "./.react-router/types"] },
  "include": ["app", "test", ".react-router/types/**/*", "*.ts"]
}
```

`apps/web/app/routes.ts`:
```ts
import { index, type RouteConfig } from "@react-router/dev/routes";

export default [index("routes/library.tsx")] satisfies RouteConfig;
```

`apps/web/app/app.css`:
```css
@import "tailwindcss";

:root {
  --bg: oklch(0.982 0.002 250);
  --surface: oklch(0.955 0.003 250);
  --surface-2: oklch(0.925 0.004 250);
  --line: oklch(0.885 0.005 250);
  --text: oklch(0.215 0.008 250);
  --muted: oklch(0.47 0.01 250);
  --accent: oklch(0.56 0.17 38);
  --accent-ink: oklch(0.985 0.008 60);
  --danger: oklch(0.53 0.19 25);
  --scrim: oklch(0.2 0.01 250 / 0.4);
  --shadow: 0 1px 2px oklch(0.3 0.02 250 / 0.08), 0 12px 32px oklch(0.3 0.02 250 / 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(0.165 0.004 250);
    --surface: oklch(0.2 0.005 250);
    --surface-2: oklch(0.24 0.006 250);
    --line: oklch(0.29 0.007 250);
    --text: oklch(0.945 0.004 250);
    --muted: oklch(0.7 0.01 250);
    --accent: oklch(0.74 0.15 52);
    --accent-ink: oklch(0.2 0.03 45);
    --danger: oklch(0.7 0.16 25);
    --scrim: oklch(0.1 0.005 250 / 0.6);
    --shadow: 0 1px 2px oklch(0.05 0 0 / 0.4), 0 16px 40px oklch(0.05 0 0 / 0.45);
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-line: var(--line);
  --color-text: var(--text);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-accent-ink: var(--accent-ink);
  --color-danger: var(--danger);
  --color-scrim: var(--scrim);
  --font-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, monospace;
  --radius-control: 8px;
  --radius-tile: 6px;
  --shadow-pop: var(--shadow);
  --ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);
}

html { color-scheme: light dark; }
body { font-family: var(--font-sans); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

`apps/web/app/root.tsx`:
```tsx
import { useState, type ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./app.css";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>no-fomo</title>
        <Meta />
        <Links />
      </head>
      <body className="bg-bg text-text antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Outlet />
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return <div className="min-h-[100dvh] bg-bg" />;
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const text = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something went wrong. Reload the page.";
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <h1 className="text-xl font-semibold">no-fomo stopped working</h1>
      <p className="mt-2 text-muted">{text}</p>
    </main>
  );
}
```

`apps/web/app/routes/library.tsx` (placeholder, replaced in Task 7):
```tsx
export default function Library() {
  return <main className="p-6 text-muted">Library</main>;
}
```

- [ ] **Step 3: Write failing tests**

`apps/web/test/filters.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hasFilters, postsQueryString, readFilters, writeFilters } from "../app/lib/filters";

describe("filters", () => {
  it("reads valid values and drops invalid ones", () => {
    expect(readFilters(new URLSearchParams("author=111&collection=179&kind=video"))).toEqual({ author: "111", collection: "179", kind: "video" });
    expect(readFilters(new URLSearchParams("author=../x&kind=gif"))).toEqual({ author: null, collection: null, kind: null });
  });

  it("writes patches and removes empty values, keeping other params", () => {
    const sp = writeFilters(new URLSearchParams("author=1&post=9"), { author: null, kind: "image" });
    expect(sp.toString()).toBe("post=9&kind=image");
  });

  it("builds the posts query", () => {
    expect(postsQueryString({ author: "1", collection: null, kind: "video" }, 55, 20)).toBe("limit=20&author=1&kind=video&cursor=55");
    expect(hasFilters({ author: null, collection: null, kind: null })).toBe(false);
  });
});
```

`apps/web/test/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatAgo, formatCount, formatDuration } from "../app/lib/format";
import { syncErrorText } from "../app/lib/extension";

describe("format", () => {
  it("formats durations", () => {
    expect(formatDuration(42.5)).toBe("0:42");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("formats counts compactly", () => {
    expect(formatCount(48211)).toBe("48.2K");
    expect(formatCount(87)).toBe("87");
  });
  it("formats relative time", () => {
    const now = 1_000_000_000;
    expect(formatAgo(now - 10_000, now)).toBe("just now");
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
  });
  it("explains sync errors in plain words", () => {
    expect(syncErrorText("already_running")).toBe("A sync is already running.");
    expect(syncErrorText("weird")).toBe("Sync could not start (weird).");
  });
});
```

- [ ] **Step 4: Run tests, expect FAIL**

Run: `pnpm vitest run apps/web`

- [ ] **Step 5: Implement libs**

`apps/web/app/lib/api.ts`:
```ts
import type { AppConfig, AuthorFacet, CollectionFacet, PostsPage, SyncStatus } from "@no-fomo/core";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export const api = {
  config: () => get<AppConfig>("/api/config"),
  posts: (qs: string) => get<PostsPage>(`/api/posts?${qs}`),
  authors: () => get<AuthorFacet[]>("/api/authors"),
  collections: () => get<CollectionFacet[]>("/api/collections"),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
};
```

`apps/web/app/lib/filters.ts`:
```ts
import type { MediaKind } from "@no-fomo/core";

export interface Filters { author: string | null; collection: string | null; kind: MediaKind | null }

const KINDS: readonly MediaKind[] = ["image", "video", "carousel"];
const ID = /^\d{1,30}$/;

export function readFilters(sp: URLSearchParams): Filters {
  const author = sp.get("author");
  const collection = sp.get("collection");
  const kind = sp.get("kind") as MediaKind | null;
  return {
    author: author && ID.test(author) ? author : null,
    collection: collection && ID.test(collection) ? collection : null,
    kind: kind && KINDS.includes(kind) ? kind : null,
  };
}

export function writeFilters(sp: URLSearchParams, patch: Partial<Filters>): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const [k, v] of Object.entries(patch)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  return next;
}

export function postsQueryString(f: Filters, cursor: number | null, limit = 60): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (f.author) q.set("author", f.author);
  if (f.collection) q.set("collection", f.collection);
  if (f.kind) q.set("kind", f.kind);
  if (cursor !== null) q.set("cursor", String(cursor));
  return q.toString();
}

export const hasFilters = (f: Filters) => Boolean(f.author || f.collection || f.kind);
```

`apps/web/app/lib/format.ts`:
```ts
export function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const formatCount = (n: number) => compact.format(n);

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function formatAgo(ms: number, now = Date.now()): string {
  const sec = Math.round((ms - now) / 1000);
  if (Math.abs(sec) < 45) return "just now";
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
export const formatDate = (unixSec: number) => dateFmt.format(new Date(unixSec * 1000));
```

`apps/web/app/lib/extension.ts`:
```ts
type ChromeRuntime = {
  sendMessage(extensionId: string, msg: unknown, cb: (reply: unknown) => void): void;
  lastError?: { message?: string };
};

export type ExtResponse = { ok: true; version?: string } | { ok: false; error: string };

function runtime(): ChromeRuntime | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === "function" ? c.runtime : null;
}

/** Returns null when the extension is missing or does not answer in time. */
function send(extensionId: string, msg: unknown, timeoutMs: number): Promise<ExtResponse | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(extensionId, msg, (reply) => {
        clearTimeout(timer);
        resolve(rt.lastError ? null : ((reply as ExtResponse | undefined) ?? null));
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export const pingExtension = (id: string) => send(id, { type: "ping" }, 1500);
export const startExtensionSync = (id: string) => send(id, { type: "sync:start" }, 45_000);

export function syncErrorText(code: string): string {
  switch (code) {
    case "already_running": return "A sync is already running.";
    case "instagram_tab_failed": return "Could not open Instagram. Open instagram.com in this browser and try again.";
    default: return `Sync could not start (${code}).`;
  }
}
```

- [ ] **Step 6: Run tests + build**

Run: `pnpm vitest run apps/web && pnpm --filter @no-fomo/web build && pnpm --filter @no-fomo/web typecheck`
Expected: PASS, `apps/web/build/client/index.html` exists.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): SPA shell, design tokens, API and extension helpers"
```

---

### Task 7: Library screen

**Files:**
- Create: `apps/web/app/components/ui/button.tsx`, `apps/web/app/components/ui/icon.tsx`
- Create: `apps/web/app/components/{top-bar,sync-control,setup-steps,filter-bar,facet-picker,kind-switch,post-grid,post-tile,post-sheet}.tsx`
- Modify: `apps/web/app/routes/library.tsx`
- Create: `apps/server/scripts/seed.ts`

**Interfaces:**
- Consumes: everything from Task 6.

- [ ] **Step 1: Seed script for UI work** `apps/server/scripts/seed.ts`

```ts
// Fills a local data folder with fake saved posts so the UI can be checked without Instagram.
// Usage: NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server seed
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db/open";
import { createMediaStore } from "../src/media/store";
import {
  finishRun, ingestCollectionPage, ingestCollections, ingestSavedPage, markMediaSaved, startRun,
} from "../src/sync/ingest";

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, "no-fomo.db"));
const media = createMediaStore({
  dir: join(config.dataDir, "media"),
  extraHosts: ["picsum.photos"],
  onSaved: (job) => markMediaSaved(db, job),
});

const AUTHORS = [
  ["101", "devtips", "Dev Tips"], ["102", "maria.codes", "Maria Lopes"], ["103", "studio.okto", "Studio Okto"],
  ["104", "kenji.makes", "Kenji Watanabe"], ["105", "tiny.kitchen", "Tiny Kitchen"], ["106", "ai.weekly", "AI Weekly"],
  ["107", "lena.draws", "Lena Fischer"],
] as const;
const CAPTIONS = [
  "Three Claude Code habits that save me an hour a day #claudecode #ai",
  "Grid systems explained in 60 seconds #design #typography",
  "Weeknight ramen in 20 minutes #recipe #ramen",
  "How I set up my terminal #devtools #productivity",
  "Color basics for UI work #design #color",
  "Day 41 of drawing every day #drawing",
  "Agents that write tests for you #ai #testing",
];

function fakeMedia(i: number) {
  const type = [2, 1, 8][i % 3]!;
  const [pk, username, fullName] = AUTHORS[(i * 5) % AUTHORS.length]!;
  const h = type === 2 ? 853 : 600;
  const img = (seed: string) => ({ candidates: [{ width: 480, height: h, url: `https://picsum.photos/seed/${seed}/480/${h}` }] });
  return {
    pk: String(9_000_000 + i), code: `SEED${i}`, taken_at: 1_756_000_000 - i * 86_400, media_type: type,
    product_type: type === 2 ? "clips" : "feed",
    caption: { text: CAPTIONS[i % CAPTIONS.length] },
    user: { pk, username, full_name: fullName, profile_pic_url: `https://picsum.photos/seed/nf-avatar-${pk}/150/150` },
    image_versions2: img(`nf-post-${i}`),
    video_duration: type === 2 ? 15 + ((i * 7) % 80) : undefined,
    like_count: 120 + i * 37,
    play_count: type === 2 ? 4000 + i * 311 : undefined,
    carousel_media: type === 8 ? [{ media_type: 1, image_versions2: img(`nf-post-${i}-a`) }, { media_type: 1, image_versions2: img(`nf-post-${i}-b`) }] : undefined,
  };
}

const TOTAL = 126;
const all = Array.from({ length: TOTAL }, (_, i) => fakeMedia(i));
const { runId } = startRun(db);
for (let start = 0; start < TOTAL; start += 21) {
  const items = all.slice(start, start + 21).map((media) => ({ media }));
  const more = start + 21 < TOTAL;
  media.enqueue(ingestSavedPage(db, runId, { items, more_available: more, next_max_id: more ? `p${start}` : undefined }).jobs);
}
ingestCollections(db, runId, {
  items: [
    { collection_id: "800001", collection_name: "AI tools", collection_type: "MEDIA" },
    { collection_id: "800002", collection_name: "Design", collection_type: "MEDIA" },
  ],
  more_available: false,
});
const pick = (word: string) => all.filter((m) => m.caption.text?.includes(word)).map((media) => ({ media }));
ingestCollectionPage(db, runId, "800001", { items: pick("#ai"), more_available: false });
ingestCollectionPage(db, runId, "800002", { items: pick("#design"), more_available: false });
finishRun(db, runId, { ok: true });
await media.idle();
console.log(`Seeded ${TOTAL} posts into ${config.dataDir}`);
```

Run: `NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server seed`

- [ ] **Step 2: UI primitives**

First verify icon names exist: `grep -oE "export declare const (Video01Icon|Image01Icon|Album02Icon|RefreshIcon|Cancel01Icon|ArrowDown01Icon|Search01Icon|LinkSquare02Icon|MusicNote01Icon|Location01Icon|ImageNotFound01Icon|Tick02Icon|AlertCircleIcon|UserIcon|Folder01Icon)\b" -r apps/web/node_modules/@hugeicons/core-free-icons/dist/types | sort -u`. Replace any missing name with the closest existing one.

`apps/web/app/components/ui/icon.tsx`:
```tsx
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export function Icon({ icon, size = 16, className }: { icon: IconSvgElement; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.5} className={className} aria-hidden="true" />;
}
```

`apps/web/app/components/ui/button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-control px-3.5 text-[14px] font-medium " +
  "transition-[transform,background-color,color] duration-200 ease-out-soft active:scale-[0.98] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "border border-line bg-surface text-text hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface hover:text-text",
};

export function buttonClass(variant: Variant = "secondary", extra = "") {
  return `${base} ${variants[variant]} ${extra}`;
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />;
}
```

- [ ] **Step 3: Top bar, setup steps and sync control**

`apps/web/app/components/setup-steps.tsx`:
```tsx
export function SetupSteps() {
  return (
    <ol className="mt-4 grid max-w-[60ch] list-decimal gap-2 ps-5 text-[15px] text-muted marker:font-mono marker:text-muted">
      <li>Build the extension with <code className="font-mono text-text">pnpm ext:build</code>.</li>
      <li>Open <code className="font-mono text-text">chrome://extensions</code>, turn on Developer mode, press Load unpacked, and choose <code className="font-mono text-text">apps/extension/.output/chrome-mv3</code>.</li>
      <li>Log in to instagram.com in this browser.</li>
      <li>Come back here and press Sync.</li>
    </ol>
  );
}
```

`apps/web/app/components/sync-control.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { api } from "../lib/api";
import { pingExtension, startExtensionSync, syncErrorText } from "../lib/extension";
import { formatAgo } from "../lib/format";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";

export function SyncControl() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const extensionId = config.data?.extensionId;
  const ext = useQuery({
    queryKey: ["extension", extensionId],
    queryFn: () => pingExtension(extensionId!),
    enabled: !!extensionId,
    refetchInterval: (q) => (q.state.data?.ok ? false : 5000),
  });
  const [pollUntil, setPollUntil] = useState(0);
  const status = useQuery({
    queryKey: ["sync-status"],
    queryFn: api.syncStatus,
    refetchInterval: (q) => (q.state.data?.run?.status === "running" || Date.now() < pollUntil ? 1000 : false),
  });
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const run = status.data?.run ?? null;
  const running = run?.status === "running";
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["authors"] });
      void qc.invalidateQueries({ queryKey: ["collections"] });
    }
    wasRunning.current = running;
  }, [running, qc]);

  async function start() {
    if (!extensionId) return;
    setStartError(null);
    setStarting(true);
    const reply = await startExtensionSync(extensionId);
    setStarting(false);
    if (!reply) return setStartError("The extension did not answer. Reload this page and try again.");
    if (!reply.ok) return setStartError(syncErrorText(reply.error));
    setPollUntil(Date.now() + 20_000);
    void qc.invalidateQueries({ queryKey: ["sync-status"] });
  }

  if (ext.isFetched && !ext.data?.ok) {
    return <p className="text-[13px] text-muted">Extension not found. See setup steps below.</p>;
  }

  const lastError = !running && run?.status === "error" ? run.errorMessage : null;
  const note = running
    ? `Syncing, ${run.postsSeen} posts so far`
    : startError ?? lastError ?? (status.data?.lastSuccessAt ? `Synced ${formatAgo(status.data.lastSuccessAt)}` : "Not synced yet");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <p
        className={`truncate text-[13px] ${startError || lastError ? "text-danger" : "text-muted"}`}
        role="status"
        aria-live="polite"
        title={note}
      >
        {note}
      </p>
      <Button variant="primary" onClick={start} disabled={running || starting || !ext.data?.ok}>
        <Icon icon={RefreshIcon} className={running || starting ? "motion-safe:animate-spin" : ""} />
        Sync
      </Button>
    </div>
  );
}
```

`apps/web/app/components/top-bar.tsx`:
```tsx
import { SyncControl } from "./sync-control";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-4 px-4 md:px-6">
        <span className="text-[15px] font-semibold tracking-tight">no-fomo</span>
        <SyncControl />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Filters**

`apps/web/app/components/facet-picker.tsx` (one popover picker used for authors and collections):
```tsx
import { useMemo, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowDown01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export interface FacetOption { id: string; label: string; sublabel?: string | null; count: number; leading?: ReactNode }

export function FacetPicker(props: {
  label: string;
  allLabel: string;
  options: FacetOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = props.options.find((o) => o.id === props.value) ?? null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? props.options.filter((o) => `${o.label} ${o.sublabel ?? ""}`.toLowerCase().includes(q)) : props.options;
  }, [props.options, query]);

  function choose(id: string | null) {
    props.onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={buttonClass("secondary", selected ? "border-accent/60 text-text" : "")}
        aria-label={`${props.label}: ${selected?.label ?? props.allLabel}`}
      >
        {selected?.leading}
        <span className="max-w-[16ch] truncate">{selected?.label ?? props.allLabel}</span>
        <Icon icon={ArrowDown01Icon} size={14} className="text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-30">
          <Popover.Popup className="w-[min(320px,calc(100vw-32px))] origin-[var(--transform-origin)] rounded-control border border-line bg-bg shadow-pop transition-[transform,opacity] duration-200 ease-out-soft data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {props.options.length > 8 && (
              <label className="flex items-center gap-2 border-b border-line px-3">
                <Icon icon={Search01Icon} size={14} className="text-muted" />
                <span className="sr-only">Search</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={props.searchPlaceholder ?? "Search"}
                  className="h-10 w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
                />
              </label>
            )}
            <ul className="max-h-[min(360px,60dvh)] overflow-y-auto p-1" role="listbox" aria-label={props.label}>
              <Row active={props.value === null} onClick={() => choose(null)} label={props.allLabel} />
              {shown.map((o) => (
                <Row key={o.id} active={o.id === props.value} onClick={() => choose(o.id)} label={o.label} sublabel={o.sublabel} count={o.count} leading={o.leading} />
              ))}
              {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">Nothing found</li>}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Row(p: { active: boolean; onClick: () => void; label: string; sublabel?: string | null; count?: number; leading?: ReactNode }) {
  return (
    <li role="option" aria-selected={p.active}>
      <button
        type="button"
        onClick={p.onClick}
        className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-[14px] hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
      >
        {p.leading}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{p.label}</span>
          {p.sublabel && <span className="block truncate text-[12px] text-muted">{p.sublabel}</span>}
        </span>
        {p.count !== undefined && <span className="font-mono text-[12px] tabular-nums text-muted">{p.count}</span>}
        <Icon icon={Tick02Icon} size={14} className={p.active ? "text-accent" : "invisible"} />
      </button>
    </li>
  );
}
```

`apps/web/app/components/kind-switch.tsx`:
```tsx
import type { MediaKind } from "@no-fomo/core";

const OPTIONS: Array<{ value: MediaKind | null; label: string }> = [
  { value: null, label: "All" },
  { value: "video", label: "Videos" },
  { value: "image", label: "Photos" },
  { value: "carousel", label: "Carousels" },
];

export function KindSwitch({ value, onChange }: { value: MediaKind | null; onChange: (v: MediaKind | null) => void }) {
  return (
    <div role="group" aria-label="Post type" className="inline-flex h-9 rounded-control border border-line bg-surface p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-[6px] px-3 text-[14px] text-muted transition-colors duration-200 hover:text-text aria-pressed:bg-bg aria-pressed:text-text aria-pressed:shadow-[0_1px_2px_oklch(0.2_0.01_250/0.12)] focus-visible:outline-2 focus-visible:outline-accent"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`apps/web/app/components/filter-bar.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { hasFilters, type Filters } from "../lib/filters";
import { FacetPicker } from "./facet-picker";
import { KindSwitch } from "./kind-switch";
import { Button } from "./ui/button";

export function FilterBar({ filters, total, onChange }: { filters: Filters; total: number | undefined; onChange: (p: Partial<Filters>) => void }) {
  const authors = useQuery({ queryKey: ["authors"], queryFn: api.authors });
  const collections = useQuery({ queryKey: ["collections"], queryFn: api.collections });

  return (
    <div className="flex flex-wrap items-center gap-2 py-4">
      <FacetPicker
        label="Author"
        allLabel="All authors"
        searchPlaceholder="Search authors"
        value={filters.author}
        onChange={(author) => onChange({ author })}
        options={(authors.data ?? []).map((a) => ({
          id: a.id,
          label: `@${a.username}`,
          sublabel: a.fullName,
          count: a.count,
          leading: <img src={a.avatarUrl} alt="" className="size-5 shrink-0 rounded-full bg-surface-2 object-cover" loading="lazy" />,
        }))}
      />
      {(collections.data?.length ?? 0) > 0 && (
        <FacetPicker
          label="Collection"
          allLabel="All collections"
          value={filters.collection}
          onChange={(collection) => onChange({ collection })}
          options={(collections.data ?? []).map((c) => ({ id: c.id, label: c.name, count: c.count }))}
        />
      )}
      <KindSwitch value={filters.kind} onChange={(kind) => onChange({ kind })} />
      <div className="ms-auto flex items-center gap-2">
        {hasFilters(filters) && (
          <Button variant="ghost" onClick={() => onChange({ author: null, collection: null, kind: null })}>Clear filters</Button>
        )}
        {total !== undefined && (
          <span className="font-mono text-[13px] tabular-nums text-muted">{total.toLocaleString("en")} posts</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Grid, tile, sheet**

`apps/web/app/components/post-tile.tsx`:
```tsx
import { useState } from "react";
import type { PostListItem } from "@no-fomo/core";
import { Album02Icon, ImageNotFound01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { formatDuration } from "../lib/format";
import { Icon } from "./ui/icon";

export function PostTile({ post, onOpen }: { post: PostListItem; onOpen: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      className="group block w-full rounded-tile text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-tile bg-surface-2">
        {failed ? (
          <div className="flex size-full items-center justify-center text-muted">
            <Icon icon={ImageNotFound01Icon} size={22} />
          </div>
        ) : (
          <img
            src={post.thumbUrl}
            alt={post.accessibilityCaption ?? `Post by @${post.author.username}`}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover transition-transform duration-300 ease-out-soft group-hover:scale-[1.03]"
          />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate">@{post.author.username}</span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] tabular-nums text-muted">
          {post.kind === "video" && <><Icon icon={Video01Icon} size={14} />{post.durationSec ? formatDuration(post.durationSec) : null}</>}
          {post.kind === "carousel" && <Icon icon={Album02Icon} size={14} />}
        </span>
      </div>
    </button>
  );
}
```

`apps/web/app/components/post-grid.tsx`:
```tsx
import { useEffect, useRef } from "react";
import type { UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import type { PostListItem, PostsPage } from "@no-fomo/core";
import { PostTile } from "./post-tile";
import { SetupSteps } from "./setup-steps";
import { Button } from "./ui/button";

const GRID = "grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";

export function PostGrid(props: {
  query: UseInfiniteQueryResult<InfiniteData<PostsPage, number | null>>;
  items: PostListItem[];
  filtered: boolean;
  onOpen: (id: string) => void;
  onClearFilters: () => void;
}) {
  const { query } = props;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  if (query.isPending) return <Skeleton count={21} />;
  if (query.isError) {
    return (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">Could not load your posts</h2>
        <p className="mt-1 text-muted">The no-fomo app on your computer did not answer. Check that it is running.</p>
        <Button className="mt-4" onClick={() => void query.refetch()}>Try again</Button>
      </section>
    );
  }
  if (props.items.length === 0) {
    return props.filtered ? (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">No posts match these filters</h2>
        <Button className="mt-4" onClick={props.onClearFilters}>Clear filters</Button>
      </section>
    ) : (
      <section className="py-16">
        <h2 className="text-[17px] font-semibold">Your saved posts will show up here</h2>
        <SetupSteps />
      </section>
    );
  }

  return (
    <>
      <ul className={GRID}>
        {props.items.map((p) => (
          <li key={p.id}><PostTile post={p} onOpen={props.onOpen} /></li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden="true" />
      {query.isFetchingNextPage && <div className="mt-4"><Skeleton count={7} /></div>}
    </>
  );
}

function Skeleton({ count }: { count: number }) {
  return (
    <ul className={GRID} aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="aspect-[3/4] animate-pulse rounded-tile bg-surface-2" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}
```

`apps/web/app/components/post-sheet.tsx`:
```tsx
import { useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { PostListItem } from "@no-fomo/core";
import { Cancel01Icon, LinkSquare02Icon, Location01Icon, MusicNote01Icon } from "@hugeicons/core-free-icons";
import { formatCount, formatDate, formatDuration } from "../lib/format";
import { Button, buttonClass } from "./ui/button";
import { Icon } from "./ui/icon";

export function PostSheet({ post, onClose, onShowAuthor }: { post: PostListItem | null; onClose: () => void; onShowAuthor: (id: string) => void }) {
  const last = useRef<PostListItem | null>(null);
  if (post) last.current = post;
  const p = post ?? last.current;

  return (
    <Dialog.Root open={!!post} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col overflow-y-auto border-l border-line bg-bg shadow-pop transition-transform duration-300 ease-out-soft data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
          {p && (
            <>
              <div className="flex items-center gap-3 px-5 py-4">
                <img src={`/media/avatars/${p.author.id}`} alt="" className="size-9 rounded-full bg-surface-2 object-cover" />
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="truncate text-[15px] font-semibold">@{p.author.username}</Dialog.Title>
                  {p.author.fullName && <p className="truncate text-[13px] text-muted">{p.author.fullName}</p>}
                </div>
                <Dialog.Close className={buttonClass("ghost", "size-9 px-0")} aria-label="Close">
                  <Icon icon={Cancel01Icon} />
                </Dialog.Close>
              </div>

              <div className="px-5">
                <img
                  src={p.thumbUrl}
                  alt={p.accessibilityCaption ?? `Post by @${p.author.username}`}
                  className="max-h-[56dvh] w-full rounded-tile bg-surface-2 object-contain"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={p.permalink} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                    <Icon icon={LinkSquare02Icon} />
                    Open on Instagram
                  </a>
                  <Button onClick={() => onShowAuthor(p.author.id)}>More from @{p.author.username}</Button>
                </div>
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
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
```

- [ ] **Step 6: Library route**

`apps/web/app/routes/library.tsx`:
```tsx
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { hasFilters, postsQueryString, readFilters, writeFilters, type Filters } from "../lib/filters";
import { FilterBar } from "../components/filter-bar";
import { PostGrid } from "../components/post-grid";
import { PostSheet } from "../components/post-sheet";
import { TopBar } from "../components/top-bar";

export default function Library() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<Filters>) => setParams(writeFilters(params, { ...patch }), { replace: true });

  const posts = useInfiniteQuery({
    queryKey: ["posts", filters],
    queryFn: ({ pageParam }) => api.posts(postsQueryString(filters, pageParam)),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = posts.data?.pages.flatMap((p) => p.items) ?? [];
  const openId = params.get("post");
  const open = openId ? items.find((p) => p.id === openId) ?? null : null;

  const setPost = (id: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("post", id);
      else next.delete("post");
      return next;
    });

  return (
    <div className="min-h-[100dvh]">
      <TopBar />
      <main className="mx-auto max-w-[1600px] px-4 pb-16 md:px-6">
        <FilterBar filters={filters} total={posts.data?.pages[0]?.total} onChange={update} />
        <PostGrid
          query={posts}
          items={items}
          filtered={hasFilters(filters)}
          onOpen={setPost}
          onClearFilters={() => update({ author: null, collection: null, kind: null })}
        />
      </main>
      <PostSheet
        post={open}
        onClose={() => setPost(null)}
        onShowAuthor={(author) => {
          const next = writeFilters(params, { author });
          next.delete("post");
          setParams(next, { replace: true });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Visual check with agent-browser**

Run (two terminals or background):
```bash
NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server dev
pnpm --filter @no-fomo/web dev
```
Use the agent-browser skill: open `http://localhost:5173`, screenshot at 1440x900 and 390x844, in light and dark color scheme. Check: grid fills, filters open and filter, sheet opens and closes with Escape, kind switch works, "Clear filters" appears, empty filter state shows, no horizontal scroll on phone, extension-missing note shows (normal browser has no extension). Fix what looks wrong.

Run the taste pre-flight items that apply: zero `—`/`–` in `apps/web/app` (`grep -rn "[—–]" apps/web/app` must print nothing), one accent, radius rule, both themes, button contrast, loading/empty/error states, Hugeicons only, no Inter.

- [ ] **Step 8: Typecheck, tests, commit**

```bash
pnpm test && pnpm typecheck
git add -A && git commit -m "feat(web): library grid with author, collection and type filters"
```

---

### Task 8: Run scripts, README, end-to-end check

**Files:**
- Create: `README.md`
- Modify: `PLAN.md` (mark milestone 1 done at the end)

- [ ] **Step 1: README.md**

````markdown
# no-fomo

Your Instagram saved posts, on your own computer. Filter them, find them, watch them in a better player.

Everything runs locally. Your data stays in `~/.no-fomo`. Nothing is sent to any server except Instagram itself.

> **Warning:** no-fomo uses Instagram's private web API with your own login, the same way the Instagram website does. This is not an official API. Syncing is slow on purpose (one request every 2 to 3 seconds) to keep your account safe. Use it at your own risk.

## Requirements

- Node.js 22 or newer
- pnpm (`corepack enable pnpm`)
- Google Chrome (or another Chromium browser)

## Start

```bash
pnpm install
pnpm ext:build
pnpm start
```

Open http://localhost:4747.

## Install the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Press **Load unpacked** and choose `apps/extension/.output/chrome-mv3`.
4. Log in to instagram.com in the same browser.
5. In no-fomo, press **Sync**.

The first sync reads all your saved posts and collections. Later syncs only read what is new.

## Development

```bash
pnpm dev                     # server on :4747, web on :5173
NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server seed   # fake posts for UI work
pnpm test
pnpm typecheck
```

Set `NO_FOMO_DUMP=1` to save raw Instagram responses to `~/.no-fomo/dumps` (useful for test fixtures; remove personal data before sharing).
````

- [ ] **Step 2: Production-like run**

Run: `pnpm start` in the background, then `curl -s -H "Host: localhost:4747" localhost:4747/ | head -5` shows the SPA HTML, and agent-browser opens `http://localhost:4747` (with `NO_FOMO_HOME=$PWD/.dev-data`) and shows the seeded grid. Stop the server.

- [ ] **Step 3: Full test + typecheck**

Run: `pnpm test && pnpm typecheck`. Expected: all PASS.

- [ ] **Step 4: Manual check by the owner (needs a real Instagram login)**

1. `pnpm ext:build`, load unpacked, `pnpm start`, open http://localhost:4747.
2. The top bar shows "Not synced yet" and an enabled Sync button.
3. Press Sync. The note counts posts. When done, the grid shows saved posts in the same order as Instagram's Saved page.
4. Filter by one author, one collection, and Videos. Results match Instagram.
5. Press Sync again. It finishes after one page.
6. Optional: run with `NO_FOMO_DUMP=1` once and keep two dump files for real-data fixtures.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: README with setup and safety notes"
```

---

## Notes for later milestones

- Instagram CDN images send `Cross-Origin-Resource-Policy: same-origin`, so the browser cannot load them directly. That is why thumbnails go through the local server. Video playback (M2) will likely need the same proxy with HTTP range support.
- Deep links to `?post=<id>` only open the sheet if the post is in the loaded pages. M2 adds `GET /api/posts/:id` with the player.
- Removed-on-Instagram detection (`removedRemotelyAt`) and the Full resync button are M2. The `lastSeenRunId` column is already there for it.
