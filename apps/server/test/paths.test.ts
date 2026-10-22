import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appPaths } from "../src/paths";

describe("app paths", () => {
  it("finds files next to the source and ffmpeg on PATH when run from source", () => {
    const p = appPaths({});
    expect(p.migrations).toMatch(/apps[\\/]server[\\/]drizzle$/);
    expect(p.webDist).toMatch(/apps[\\/]web[\\/]build[\\/]client$/);
    expect(p.ffmpeg).toBe("ffmpeg");
  });

  it("uses the installed app folder and its bundled ffmpeg", () => {
    const root = mkdtempSync(join(tmpdir(), "nf-app-"));
    mkdirSync(join(root, "ffmpeg"));
    writeFileSync(join(root, "ffmpeg", "ffmpeg"), "");
    const p = appPaths({ NO_FOMO_SOCIAL_APP_DIR: root }, "darwin");
    expect(p).toEqual({ webDist: join(root, "web"), migrations: join(root, "drizzle"), ffmpeg: join(root, "ffmpeg", "ffmpeg"), ffprobe: "ffprobe" });
    expect(appPaths({ NO_FOMO_SOCIAL_APP_DIR: root }, "win32").ffmpeg).toBe("ffmpeg");
  });
});
