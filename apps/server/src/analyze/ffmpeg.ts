import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { SCENE_THRESHOLD } from "@no-fomo/core";

export class ToolMissingError extends Error {}
export interface ProbeInfo { durationSec: number; hasAudio: boolean }
export interface MediaTools {
  probe(file: string): Promise<ProbeInfo>;
  sceneTimes(file: string): Promise<number[]>;
  /** 16x16 RGB pixels (768 bytes), or empty when there is no frame at that time. */
  tinyRgb(file: string, t: number): Promise<Uint8Array>;
  /** False when no frame was written. */
  frameJpeg(file: string, t: number, out: string): Promise<boolean>;
  extractAudio(file: string, out: string): Promise<void>;
  scaleImage(file: string, out: string): Promise<void>;
}

const MAX_STDERR = 4 * 1024 * 1024;

function run(bin: "ffmpeg" | "ffprobe", args: string[], timeoutMs = 120_000): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => {
      if (err.length < MAX_STDERR) err += d.toString("utf8");
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(e.code === "ENOENT" ? new ToolMissingError(`${bin} is not installed`) : e);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return reject(new Error(`${bin} timed out`));
      if (code !== 0) return reject(new Error(`${bin} failed: ${err.slice(-500)}`));
      resolve({ stdout: Buffer.concat(out), stderr: err });
    });
  });
}

const wrote = (f: string) => existsSync(f) && statSync(f).size > 0;
const at = (t: number) => t.toFixed(3);
/** A time past the end is not an error for single-frame calls, but a missing ffmpeg always is. */
const noFrame = (e: unknown) => {
  if (e instanceof ToolMissingError) throw e;
  return null;
};

export const ffmpegTools: MediaTools = {
  async probe(file) {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]);
    const j = JSON.parse(stdout.toString("utf8")) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
    return { durationSec: Number(j.format?.duration ?? 0) || 0, hasAudio: (j.streams ?? []).some((s) => s.codec_type === "audio") };
  },
  async sceneTimes(file) {
    const { stderr } = await run(
      "ffmpeg",
      ["-hide_banner", "-nostats", "-i", file, "-an", "-vf", `scale=320:-2,select='gt(scene,${SCENE_THRESHOLD})',showinfo`, "-f", "null", "-"],
      5 * 60_000,
    );
    return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  },
  async tinyRgb(file, t) {
    const r = await run("ffmpeg", ["-v", "error", "-ss", at(t), "-i", file, "-frames:v", "1", "-vf", "scale=16:16", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).catch(noFrame);
    return r?.stdout.length === 768 ? new Uint8Array(r.stdout) : new Uint8Array(0);
  },
  async frameJpeg(file, t, out) {
    await run("ffmpeg", ["-v", "error", "-y", "-ss", at(t), "-i", file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", out]).catch(noFrame);
    return wrote(out);
  },
  async extractAudio(file, out) {
    await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", out], 5 * 60_000);
  },
  async scaleImage(file, out) {
    await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease", "-q:v", "3", out]);
  },
};
