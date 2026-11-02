// Fills a local data folder with fake saved posts so the UI can be checked without Instagram.
// Usage: NO_FOMO_SOCIAL_HOME=$PWD/.dev-data pnpm --filter @no-fomo-social/server seed
//
// Posts, creators and captions come from seed-posts.json; covers and avatars are the made-up
// images in seed-assets/ (generated, no real people or accounts), so the seed works offline.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
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
const media = createMediaStore({ dir: join(config.dataDir, "media"), onSaved: (job) => markMediaSaved(db, job) });

const ASSETS = new URL("./seed-assets/", import.meta.url);
const SPEC = JSON.parse(readFileSync(new URL("./seed-posts.json", import.meta.url), "utf8")) as {
  authors: Record<string, [string, string]>;
  posts: { author: string; type: "reel" | "carousel"; seconds?: number; slides?: number; caption: string }[];
};

const COLLECTIONS: [string, string, string][] = [
  ["800001", "Hooks", "#hooks"],
  ["800002", "Content plan", "#contentplan"],
  ["800003", "Pricing", "pric"],
];

function fakeMedia(i: number) {
  const spec = SPEC.posts[i % SPEC.posts.length]!;
  const [username, fullName] = SPEC.authors[spec.author]!;
  const reel = spec.type === "reel";
  // Links point at the app's own media folder (the cover is copied there below), so the viewer can show
  // a reel's cover without the extension and without Instagram.
  const pk = String(9_000_000 + i);
  const img = (id: string) => ({ candidates: [{ width: 1080, height: reel ? 1920 : 1350, url: `/media/thumbs/${id}` }] });
  return {
    pk, code: `SEED${i}`, taken_at: 1_756_000_000 - i * 86_400 - (i % 7) * 3600,
    media_type: reel ? 2 : 8, product_type: reel ? "clips" : "feed",
    caption: { text: spec.caption },
    saved_collection_ids: COLLECTIONS.filter(([, , tag]) => spec.caption.toLowerCase().includes(tag)).map(([id]) => id),
    user: { pk: spec.author, username, full_name: fullName, profile_pic_url: `/media/avatars/${spec.author}` },
    image_versions2: img(pk),
    video_duration: reel ? spec.seconds : undefined,
    like_count: 180 + ((i * 937) % 4200),
    play_count: reel ? 6000 + ((i * 7919) % 180_000) : undefined,
    carousel_media: reel ? undefined : Array.from({ length: spec.slides ?? 5 }, () => ({ media_type: 1, image_versions2: img(pk) })),
  };
}

const TOTAL = 126;
const all = Array.from({ length: TOTAL }, (_, i) => fakeMedia(i));
const { runId } = startRun(db);
for (let start = 0; start < TOTAL; start += 21) {
  const items = all.slice(start, start + 21).map((media) => ({ media }));
  const more = start + 21 < TOTAL;
  ingestSavedPage(db, runId, { items, more_available: more, next_max_id: more ? `p${start}` : undefined });
}
ingestCollections(db, runId, {
  items: COLLECTIONS.map(([collection_id, collection_name]) => ({ collection_id, collection_name, collection_type: "MEDIA" })),
  more_available: false,
});
finishRun(db, runId, { ok: true });

// Covers and avatars: copied straight into the media folder, as the downloader would have saved them.
for (let i = 0; i < TOTAL; i++) {
  const id = String(9_000_000 + i);
  copyFileSync(new URL(`covers/${i % SPEC.posts.length}.webp`, ASSETS), media.pathFor("thumb", id));
  markMediaSaved(db, { kind: "thumb", id, url: "" });
}
for (const authorId of Object.keys(SPEC.authors)) {
  copyFileSync(new URL(`avatars/${authorId}.webp`, ASSETS), media.pathFor("avatar", authorId));
  markMediaSaved(db, { kind: "avatar", id: authorId, url: "" });
}

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
  SEED0: `# @reels.lab: 3 hooks that stop the scroll

## Summary
A creator explains why most reels lose viewers in the first two seconds and shows three openings that fix it: show the result first, promise a number, and start mid-action. Each hook is demonstrated with a 3-second example from a small business account, and she ends with the one line of on-screen text she adds to every reel.

## Key points
- The first frame must show the result, not the intro. Start with the finished cake, the full room, the final number.
- Put a short promise on screen in the first second: "3 mistakes", "in 20 seconds". Numbers beat adjectives.
- Cut every pause. The first spoken word should land before second 1.
- Change the picture every 1 to 2 seconds in the first five seconds, then slow down.
- A hook is a promise; the rest of the reel has to pay it in the order it was promised.

## Steps
1. Write the promise as one line of text, no more than 6 words.
2. Film the ending first and use it as the opening shot.
3. Trim the first 0.5 seconds of silence in your editor.
4. Add the promise as on-screen text from 0:00 to 0:02.
5. Check the retention graph after 48 hours; if the drop is at second 2, rewrite the first line only.

## Mentioned
- CapCut (video editor, for trimming and captions)
- @bakery.growth (example account)
- Retention graph in Instagram insights

## On-screen text
- 0:00: 3 HOOKS that stop the scroll
- 0:04: Hook 1: show the result first
- 0:11: Hook 2: promise a number
- 0:19: Hook 3: start mid-action
- 0:29: Save this for your next reel

## Transcript
Most people lose viewers in the first two seconds, and it is almost always the opening. Here are three hooks that fix it. One: show the result first. Nobody waits for your intro, so open with the finished cake, the full room, the final number. Two: promise a number. "Three mistakes", "in twenty seconds". A number tells people how long they have to stay. Three: start mid-action. Cut the hello, cut the breath, the first word lands before second one. And whatever hook you pick, put it on screen as text for the first two seconds. That is the whole trick.

## Post info
- Author: @reels.lab (Reels Lab)
- Length: 0:34
- Hashtags: #hooks #reels #contentcreator
- Analyzed: demo report, made-up data
`,
  SEED1: `# @maria.sells: Nobody buys from your bio. Fix it in 2 min

## Summary
A screen-recorded walkthrough of a small business profile: what the bio says now, why a visitor cannot tell what to do, and a three-line rewrite (who it is for, what they get, one action). The third step, replacing the link with a single offer page, is called the one everyone skips.

## Key points
- A visitor decides in about 3 seconds whether to follow or leave; the bio has to answer "is this for me?" first.
- Line 1 names the customer, line 2 names the result, line 3 is one action with one link.
- A page with five links is the same as no link. One offer, one button.
- Pinned posts do the job of the old highlights: proof, process, offer.

## Steps
1. Write who you help in 5 words. No adjectives.
2. Write the result they get, with a number if you have one.
3. Replace the link in bio with a single offer page.
4. Pin three posts: one proof, one process, one offer.
5. Ask a friend to read the profile for 3 seconds and say what you sell.

## Mentioned
- Nothing named.

## On-screen text
- 0:00: Nobody buys from your bio. Fix it in 2 min
- 0:08: Line 1: who
- 0:14: Line 2: result
- 0:22: Line 3: one action
- 0:33: Step 3 is the one everyone skips

## Transcript
Your bio is the first thing people read and most bios say nothing. Let me show you one and fix it live. "Coach, mom, coffee lover." Who is this for? What do I get? There is no answer, so people leave. Line one: who you help...

## Post info
- Author: @maria.sells (Maria Lopes)
- Length: 0:41
- Hashtags: #instagramtips #smallbusiness
- Analyzed: demo report, made-up data
`,
  SEED2: `# @bakery.growth: 1 video = 5 reels

## Summary
A workflow for cutting one 10-minute talking video into five short reels, each built around one idea with its own hook. Shown on a laptop timeline, with the exact clip lengths and the order the clips are posted.

## Key points
- Mark every moment where you make one clear point. Each one can be a reel.
- Give each clip its own first line as a hook, written on screen.
- 20 to 40 seconds is the sweet spot for a teaching clip.
- Post the strongest clip first and the rest over the next two weeks.

## Steps
1. Record one 10-minute video answering five questions from your audience.
2. Write down the time of each answer while you watch it back.
3. Cut each answer to 20 to 40 seconds.
4. Add a hook line and captions to each clip.
5. Schedule them two to three days apart.

## Mentioned
- Descript (editor, for the transcript-based cuts)
- CapCut (editor, for captions)

## On-screen text
- 0:00: 1 VIDEO = 5 REELS
- 0:09: Mark the moments
- 0:21: 20 to 40 seconds each
- 0:40: Strongest clip first

## Transcript
If you film one long video a week, you never run out of reels. Here is the whole workflow...

## Post info
- Author: @bakery.growth (Bakery Growth)
- Length: 0:58
- Hashtags: #repurpose #contentplan
- Analyzed: demo report, made-up data
`,
  SEED15: `# @seo.sofia: Stop doing SEO by hand

## Summary
A weekly 20-minute routine for small sites: one keyword report, one page refresh, one internal link pass. The creator shows her dashboard and explains which numbers she ignores.

## Key points
- Check one report a week, not ten. Impressions by page is enough.
- Refresh the page that lost the most clicks, not the one you like most.
- Every new post links to two old ones and gets one link back.
- Ignore the overall ranking number; watch clicks per page.

## Steps
1. Open the pages report and sort by lost clicks.
2. Update the title and the first paragraph of the top loser.
3. Add two internal links from that page to newer posts.
4. Write it down with the date, so next month you can see what moved.

## Mentioned
- Search Console (pages report)

## On-screen text
- 0:00: Stop doing SEO by hand
- 0:06: 20 minutes a week
- 0:18: Sort by lost clicks
- 0:35: Two links out, one link in

## Transcript
You do not need an SEO tool. You need twenty minutes and one report...

## Post info
- Author: @seo.sofia (Sofia Marin)
- Length: 0:49
- Hashtags: #seo #marketing
- Analyzed: demo report, made-up data
`,
};

seedReports();
console.log(`Seeded ${TOTAL} posts and ${Object.keys(DEMO_REPORTS).length} reports into ${config.dataDir}`);
