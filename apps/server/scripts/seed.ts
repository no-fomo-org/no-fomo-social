// Fills a local data folder with fake saved posts so the UI can be checked without Instagram.
// Usage: NO_FOMO_SOCIAL_HOME=$PWD/.dev-data pnpm --filter @no-fomo-social/server seed
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db/open";
import { createMediaStore } from "../src/media/store";
import { finishReport, queueReport } from "../src/analyze/report-store";
import { posts } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  finishRun, ingestCollections, ingestSavedPage, markMediaSaved, startRun,
} from "../src/sync/ingest";

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, "no-fomo-social.db"));
const media = createMediaStore({
  dir: join(config.dataDir, "media"),
  extraHosts: ["picsum.photos"],
  onSaved: (job) => markMediaSaved(db, job),
});

// Made-up creators and posts. They also appear in public screenshots, so never use real accounts here.
const AUTHORS = [
  ["101", "reels.lab", "Reels Lab"], ["102", "maria.sells", "Maria Lopes"], ["103", "bakery.growth", "Bakery Growth"],
  ["104", "coach.kenji", "Kenji Watanabe"], ["105", "tiny.studio", "Tiny Studio"], ["106", "creator.weekly", "Creator Weekly"],
  ["107", "lena.brands", "Lena Fischer"],
] as const;
const CAPTIONS = [
  "3 hooks that keep people watching past second 2 #hooks #reels",
  "How I plan a month of content in one afternoon #contentplan #creator",
  "The caption formula I use for every sales post #copywriting #hooks",
  "Film a product shot with only your phone #productphoto #reels",
  "What I post on slow weeks #contentplan #smallbusiness",
  "Day 41 of posting every day: what changed #creator",
  "Turn one long video into five reels #repurpose #hooks",
];

/** Picsum (Unsplash) photos of people, products and workspaces, so the grid looks like creators' posts. */
const COVERS = [823, 431, 1, 26, 488, 838, 453, 20, 856, 91, 64, 513, 452, 3, 628, 225, 4, 250, 30, 367, 180, 454];
const cover = (n: number) => COVERS[n % COVERS.length]!;

function fakeMedia(i: number) {
  const type = [2, 1, 8][i % 3]!;
  const [pk, username, fullName] = AUTHORS[(i * 5) % AUTHORS.length]!;
  const h = type === 2 ? 853 : 600;
  const img = (id: number) => ({ candidates: [{ width: 480, height: h, url: `https://picsum.photos/id/${id}/480/${h}` }] });
  return {
    pk: String(9_000_000 + i), code: `SEED${i}`, taken_at: 1_756_000_000 - i * 86_400, media_type: type,
    product_type: type === 2 ? "clips" : "feed",
    caption: { text: CAPTIONS[i % CAPTIONS.length] },
    saved_collection_ids: [
      ...(CAPTIONS[i % CAPTIONS.length]!.includes("#hooks") ? ["800001"] : []),
      ...(CAPTIONS[i % CAPTIONS.length]!.includes("#contentplan") ? ["800002"] : []),
    ],
    user: { pk, username, full_name: fullName, profile_pic_url: `https://picsum.photos/seed/nf-avatar-${pk}/150/150` },
    image_versions2: img(cover(i)),
    video_duration: type === 2 ? 15 + ((i * 7) % 80) : undefined,
    like_count: 120 + i * 37,
    play_count: type === 2 ? 4000 + i * 311 : undefined,
    carousel_media: type === 8 ? [{ media_type: 1, image_versions2: img(cover(i)) }, { media_type: 1, image_versions2: img(cover(i + 7)) }] : undefined,
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
    { collection_id: "800001", collection_name: "Hooks", collection_type: "MEDIA" },
    { collection_id: "800002", collection_name: "Content plan", collection_type: "MEDIA" },
  ],
  more_available: false,
});
finishRun(db, runId, { ok: true });
await media.idle();

/** A few finished reports, so the Report tab and the Reports list have something to show. */
function seedReports() {
  const now = Date.now();
  for (const [code, markdown] of Object.entries(DEMO_REPORTS)) {
    const post = db.select({ id: posts.id }).from(posts).where(eq(posts.code, code)).get();
    if (!post) continue;
    queueReport(db, post.id, { language: "English", reportModel: "demo", transcribeModel: "demo" }, now);
    finishReport(db, post.id, { markdown, frameCount: 12, transcribeModel: "demo" }, now);
  }
}

const DEMO_REPORTS: Record<string, string> = {
  SEED0: `# @reels.lab: 3 hooks that keep people watching past second 2

## Summary
A creator shows three ways to open a reel so people do not scroll away in the first two seconds. Each hook is shown on screen with a short example from a small business account.

## Key points
- The first frame must show the result, not the intro. Start with the finished cake, the full room, the final number.
- Put a short promise on screen in the first second: "3 mistakes", "in 20 seconds".
- Cut every pause. The first spoken word should land before second 1.
- Change the picture every 1 to 2 seconds in the first five seconds.

## Steps
1. Write the promise as one line of text, no more than 6 words.
2. Film the ending first and use it as the opening shot.
3. Trim the first 0.5 seconds of silence in your editor.
4. Add the promise as on-screen text from 0:00 to 0:02.

## Mentioned
- CapCut (video editor)
- @bakery.growth (example account)

## On-screen text
- 0:00: 3 hooks that stop the scroll
- 0:04: Hook 1: show the result first
- 0:09: Hook 2: promise a number
- 0:15: Hook 3: start mid-action

## Transcript
Most people lose viewers in the first two seconds, and it is almost always the opening. Here are three hooks that fix it. One: show the result first...

## Post info
- Author: @reels.lab (Reels Lab)
- Length: 0:15
- Hashtags: #hooks #reels
- Analyzed: demo report, made-up data
`,
  SEED3: `# @maria.sells: Film a product shot with only your phone

## Summary
A short tutorial on filming a clean product shot at home with a phone, a window and a sheet of white paper.

## Key points
- Use window light from the side, never from behind the product.
- A white paper curve behind the product hides the table edge.
- Lock focus and exposure before you move the phone.

## Steps
1. Place the product 1 meter from a window.
2. Tape white paper to the wall and let it curve onto the table.
3. Tap and hold on the product to lock focus.
4. Move the phone slowly in a half circle for 5 seconds.

## Mentioned
- Nothing named.

## On-screen text
- 0:02: Window light only
- 0:07: Paper sweep = no edges
- 0:12: Hold to lock focus

## Transcript
You do not need a studio for this. All you need is a window...

## Post info
- Author: @maria.sells (Maria Lopes)
- Hashtags: #productphoto #reels
- Analyzed: demo report, made-up data
`,
  SEED6: `# @bakery.growth: Turn one long video into five reels

## Summary
A workflow for cutting one 10 minute talking video into five short reels, each built around one idea with its own hook.

## Key points
- Mark every moment where you make one clear point. Each one can be a reel.
- Give each clip its own first line as a hook, written on screen.
- Post the strongest clip first and the rest over the next two weeks.

## Steps
1. Record one 10 minute video answering five questions from your audience.
2. Write down the time of each answer.
3. Cut each answer to 20 to 40 seconds.
4. Add a hook line and captions to each clip.

## Mentioned
- Descript (editor)
- CapCut (editor)

## On-screen text
- 0:01: 1 video = 5 reels
- 0:10: Mark the moments

## Transcript
If you film one long video a week, you never run out of reels...

## Post info
- Author: @bakery.growth (Bakery Growth)
- Hashtags: #repurpose #hooks
- Analyzed: demo report, made-up data
`,
};

seedReports();
console.log(`Seeded ${TOTAL} posts and ${Object.keys(DEMO_REPORTS).length} reports into ${config.dataDir}`);
