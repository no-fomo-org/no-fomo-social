// Fills a local data folder with fake saved posts so the UI can be checked without Instagram.
// Usage: NO_FOMO_HOME=$PWD/.dev-data pnpm --filter @no-fomo/server seed
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db/open";
import { createMediaStore } from "../src/media/store";
import {
  finishRun, ingestCollections, ingestSavedPage, markMediaSaved, startRun,
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
    saved_collection_ids: [
      ...(CAPTIONS[i % CAPTIONS.length]!.includes("#ai") ? ["800001"] : []),
      ...(CAPTIONS[i % CAPTIONS.length]!.includes("#design") ? ["800002"] : []),
    ],
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
finishRun(db, runId, { ok: true });
await media.idle();
console.log(`Seeded ${TOTAL} posts into ${config.dataDir}`);
