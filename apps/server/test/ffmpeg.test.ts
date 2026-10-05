import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ffmpegTools } from "../src/analyze/ffmpeg";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const dir = mkdtempSync(join(tmpdir(), "nf-ff-"));
const video = join(dir, "in.mp4");
const silent = join(dir, "silent.mp4");

describe.skipIf(!hasFfmpeg)("ffmpeg tools", () => {
  beforeAll(() => {
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest", "-pix_fmt", "yuv420p", video]);
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=10", "-pix_fmt", "yuv420p", silent]);
  });

  it("reads duration and audio", async () => {
    const a = await ffmpegTools.probe(video);
    expect(a.durationSec).toBeGreaterThan(2.5);
    expect(a.hasAudio).toBe(true);
    expect((await ffmpegTools.probe(silent)).hasAudio).toBe(false);
  });

  it("returns scene times as numbers", async () => {
    const t = await ffmpegTools.sceneTimes(video);
    expect(Array.isArray(t)).toBe(true);
    expect(t.every((x) => Number.isFinite(x))).toBe(true);
  });

  it("renders a 16x16 RGB thumbnail and a 512 px JPEG", async () => {
    expect((await ffmpegTools.tinyRgb(video, 1)).length).toBe(768);
    const jpg = join(dir, "f.jpg");
    expect(await ffmpegTools.frameJpeg(video, 1, jpg)).toBe(true);
    const b = readFileSync(jpg);
    expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
  });

  it("returns no frame past the end", async () => {
    expect((await ffmpegTools.tinyRgb(video, 60)).length).toBe(0);
    expect(await ffmpegTools.frameJpeg(video, 60, join(dir, "none.jpg"))).toBe(false);
  });

  it("extracts audio and scales an image", async () => {
    const mp3 = join(dir, "a.mp3");
    await ffmpegTools.extractAudio(video, mp3);
    expect(existsSync(mp3)).toBe(true);
    const small = join(dir, "s.jpg");
    await ffmpegTools.scaleImage(join(dir, "f.jpg"), small);
    expect(existsSync(small)).toBe(true);
  });
});
