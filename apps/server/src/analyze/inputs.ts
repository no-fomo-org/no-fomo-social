import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  candidateTimes, carouselVideoCap, dropNearDuplicates, formatClock, frameCap, spreadEvenly,
  type MediaPart, type PostMedia, type ReportStep,
} from "@no-fomo/core";
import type { Downloader } from "./download";
import { AnalyzeError } from "./errors";
import type { MediaTools } from "./ffmpeg";
import type { Provider } from "./provider";

export const VIDEO_MAX_BYTES = 300 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const MAX_DURATION_SEC = 15 * 60;

/** One frame or photo, with the label the models see before it, like "frame at 0:12". */
export interface Visual { label: string; image: Uint8Array }
export interface Inputs { visuals: Visual[]; transcript: string | null; transcribed: boolean }
type Ctx = { dir: string; tools: MediaTools; download: Downloader; provider: Provider; transcribeModel: string; onStep: (s: ReportStep) => void };
type Frame = { t: number; bytes: Uint8Array };

/** Frames, photos and speech of one post, ready for the report model. */
export async function buildInputs(o: Ctx & { media: PostMedia }): Promise<Inputs> {
  const parts = o.media.parts;
  const visuals: Visual[] = [];
  const transcripts: string[] = [];
  let transcribed = false;
  let hasVideo = false;
  const videos = parts.filter((p) => p.kind === "video" && p.videoUrl).length;
  const carousel = o.media.kind === "carousel" && parts.length > 1;
  const cap = carousel ? carouselVideoCap(parts.length - videos, videos) : null;

  for (const part of parts) {
    const label = carousel ? `item ${part.index + 1} of ${parts.length}` : null;
    if (part.kind === "video" && part.videoUrl) {
      hasVideo = true;
      const v = await videoItem(o, part, cap);
      for (const f of v.frames) visuals.push({ label: `${label ? `${label}, ` : ""}frame at ${formatClock(f.t)}`, image: f.bytes });
      if (v.transcript !== null) transcribed = true;
      if (v.transcript) transcripts.push(carousel ? `Item ${part.index + 1}: ${v.transcript}` : v.transcript);
    } else {
      const bytes = await imageItem(o, part);
      if (!bytes) continue;
      visuals.push({ label: label ?? "photo", image: bytes });
    }
  }
  if (visuals.length === 0 && transcripts.length === 0) throw new AnalyzeError("failed", "No frames or speech could be read from this post");
  return { visuals, transcript: hasVideo ? transcripts.join("\n\n") : null, transcribed };
}

async function videoItem(o: Ctx, part: MediaPart, carouselCap: number | null): Promise<{ frames: Frame[]; transcript: string | null }> {
  const file = join(o.dir, `v${part.index}.mp4`);
  o.onStep("downloading");
  await o.download(part.videoUrl!, file, VIDEO_MAX_BYTES);
  const info = await o.tools.probe(file);
  if (info.durationSec > MAX_DURATION_SEC) throw new AnalyzeError("too_long");

  o.onStep("frames");
  const cap = carouselCap ?? frameCap(info.durationSec);
  const candidates = candidateTimes(info.durationSec, await o.tools.sceneTimes(file), cap);
  const thumbs: Array<{ t: number; px: Uint8Array }> = [];
  for (const t of candidates) {
    const px = await o.tools.tinyRgb(file, t);
    if (px.length) thumbs.push({ t, px });
  }
  const times = spreadEvenly(dropNearDuplicates(thumbs.map((x) => x.px)).map((i) => thumbs[i]!.t), cap);
  const frames: Frame[] = [];
  for (const [i, t] of times.entries()) {
    const out = join(o.dir, `v${part.index}-${i}.jpg`);
    if (await o.tools.frameJpeg(file, t, out)) frames.push({ t, bytes: new Uint8Array(await readFile(out)) });
  }

  let transcript: string | null = null;
  if (info.hasAudio) {
    o.onStep("transcribing");
    const audio = join(o.dir, `v${part.index}.mp3`);
    await o.tools.extractAudio(file, audio);
    transcript = await o.provider.transcribe(new Uint8Array(await readFile(audio)), o.transcribeModel);
  }
  await rm(file, { force: true });
  return { frames, transcript };
}

async function imageItem(o: Ctx, part: MediaPart): Promise<Uint8Array | null> {
  if (!part.imageUrl) return null;
  const raw = join(o.dir, `i${part.index}`);
  const out = join(o.dir, `i${part.index}.jpg`);
  o.onStep("downloading");
  await o.download(part.imageUrl, raw, IMAGE_MAX_BYTES).catch((e: unknown) => {
    throw e instanceof AnalyzeError && e.code === "too_large" ? new AnalyzeError("download_failed", "Image over 15 MB") : e;
  });
  await o.tools.scaleImage(raw, out);
  return new Uint8Array(await readFile(out));
}
