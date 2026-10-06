// Writes real reports for a few known posts and checks that facts shown on screen made it into them.
// Usage: pnpm --filter @no-fomo/server eval [--model gpt-5.4-mini]
// Uses your saved OpenAI key and report settings. Stores nothing in the app; reports are saved next to the video cache.
// Videos are kept in <data folder>/eval-cache after the first run, so cases still work after Instagram links expire.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db/open";
import { createDownloader } from "../src/analyze/download";
import { ffmpegTools } from "../src/analyze/ffmpeg";
import { makeReport } from "../src/analyze/make-report";
import { createOpenAIProvider } from "../src/analyze/provider";
import { isMediaUrl } from "../src/media/store";
import { getPostItem, getPostMedia } from "../src/queries";
import { createKeyStore } from "../src/secrets/key-store";
import { analyzeOptions } from "../src/settings";

interface Case { postId: string; note: string; mustContain: string[]; mustNotContain: string[] }

const config = loadConfig();
const db = openDb(join(config.dataDir, "no-fomo.db"));
const key = createKeyStore(config.dataDir).get().openai;
if (!key) throw new Error("No OpenAI key saved. Add it in the app settings first.");
const modelArg = process.argv.indexOf("--model");
const choice = { ...analyzeOptions(db), ...(modelArg > 0 ? { reportModel: process.argv[modelArg + 1]! } : {}) };
const cases = JSON.parse(readFileSync(new URL("./eval-cases.json", import.meta.url), "utf8")) as Case[];
const cacheDir = join(config.dataDir, "eval-cache");
mkdirSync(cacheDir, { recursive: true });
const realDownload = createDownloader({ allowed: (url) => isMediaUrl(url, config.extraMediaHosts) });
const provider = createOpenAIProvider(key);

console.log(`Report model: ${choice.reportModel}, speech model: ${choice.transcribeModel}, language: ${choice.language}\n`);
let failed = 0;
for (const c of cases) {
  const post = getPostItem(db, c.postId);
  const media = getPostMedia(db, c.postId);
  if (!post || !media) {
    console.log(`SKIP ${c.postId}: not in your library`);
    continue;
  }
  const dir = mkdtempSync(join(tmpdir(), "no-fomo-eval-"));
  try {
    const { markdown } = await makeReport({
      post, media, choice, dir, tools: ffmpegTools, provider, onStep: () => {}, now: Date.now(),
      download: async (url, file, maxBytes) => {
        const cached = join(cacheDir, `${c.postId}-${basename(file)}`);
        if (!existsSync(cached)) await realDownload(url, file, maxBytes).then(() => copyFileSync(file, cached));
        else copyFileSync(cached, file);
      },
    });
    writeFileSync(join(cacheDir, `${c.postId}.md`), markdown);
    // Only what the model wrote counts, and not its on-screen text list: the facts must reach the summary, points or Mentioned.
    const body = markdown.split(/^## (?:On-screen text|Transcript|Post info)\b/m)[0]!.toLowerCase();
    const missing = c.mustContain.filter((s) => !body.includes(s.toLowerCase()));
    const wrong = c.mustNotContain.filter((s) => body.includes(s.toLowerCase()));
    const ok = missing.length === 0 && wrong.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.note}`);
    if (missing.length) console.log(`  missing: ${missing.join(", ")}`);
    if (wrong.length) console.log(`  should not be there: ${wrong.join(", ")}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.note}\n  error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\n${cases.length - failed} of ${cases.length} passed. Reports are in ${cacheDir}`);
process.exit(failed ? 1 : 0);
