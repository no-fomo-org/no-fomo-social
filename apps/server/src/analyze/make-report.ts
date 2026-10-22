import {
  assembleReport, cleanModelSections, hasSummary, mergeScreenText, postContext, screenPrompt, systemPrompt,
  type AnalyzeChoice, type PostListItem, type PostMedia, type ReportStep,
} from "@no-fomo-social/core";
import type { Downloader } from "./download";
import { AnalyzeError } from "./errors";
import type { MediaTools } from "./ffmpeg";
import { buildInputs, type Visual } from "./inputs";
import type { Provider, ReportContent } from "./provider";

/** Frames per screen-reading call: few enough that the model reads each one closely. */
export const SCREEN_BATCH = 8;
const SCREEN_PARALLEL = 3;

export interface ReportJob {
  post: PostListItem;
  media: PostMedia;
  choice: AnalyzeChoice;
  dir: string;
  tools: MediaTools;
  download: Downloader;
  provider: Provider;
  onStep: (s: ReportStep) => void;
  now: number;
}

/** Downloads, reads and writes the report for one post. Stores nothing. */
export async function makeReport(j: ReportJob): Promise<{ markdown: string; frameCount: number; transcribeModel: string | null }> {
  const inputs = await buildInputs({
    media: j.media, dir: j.dir, tools: j.tools, download: j.download, provider: j.provider, transcribeModel: j.choice.transcribeModel, onStep: j.onStep,
  });
  j.onStep("reading");
  const screen = await readScreen(j.provider, j.choice.reportModel, inputs.visuals);
  j.onStep("writing");
  const content: ReportContent = [{ type: "text", text: postContext(j.post) }];
  if (inputs.transcript !== null) content.push({ type: "text", text: `Transcript:\n${inputs.transcript || "No speech."}` });
  if (screen) content.push({ type: "text", text: `Text read from the screen, with exact spelling:\n${screen}` });
  content.push(...visualContent(inputs.visuals));
  const raw = await j.provider.generate({ model: j.choice.reportModel, system: systemPrompt(j.choice.language), content });
  const sections = cleanModelSections(raw);
  if (!hasSummary(sections)) throw new AnalyzeError("bad_output");
  const transcribeModel = inputs.transcribed ? j.choice.transcribeModel : null;
  const markdown = assembleReport({
    post: j.post, sections, transcript: inputs.transcript, reportModel: j.choice.reportModel, transcribeModel, analyzedAt: j.now,
  });
  return { markdown, frameCount: inputs.visuals.length, transcribeModel };
}

/** Asks the model for the exact text in every frame, a few frames per call, so links and names are spelled right. */
export async function readScreen(provider: Provider, model: string, visuals: Visual[]): Promise<string> {
  const batches: Visual[][] = [];
  for (let i = 0; i < visuals.length; i += SCREEN_BATCH) batches.push(visuals.slice(i, i + SCREEN_BATCH));
  const answers: string[] = new Array(batches.length).fill("");
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      answers[i] = await provider.generate({ model, system: screenPrompt(), content: visualContent(batches[i]!) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCREEN_PARALLEL, batches.length) }, worker));
  return mergeScreenText(answers);
}

const visualContent = (visuals: Visual[]): ReportContent =>
  visuals.flatMap((v) => [{ type: "text" as const, text: `[${v.label}]` }, { type: "image" as const, image: v.image, mediaType: "image/jpeg" as const }]);
