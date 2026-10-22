import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");
const SCAN = ["apps/server/src", "apps/server/scripts", "apps/extension/src", "apps/extension/entrypoints", "apps/extension/wxt.config.ts", "scripts", ".github/workflows"];

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(path, d.name)) : [join(full, d.name)]));
}

describe("env var names", () => {
  // The launchers set NO_FOMO_SOCIAL_*; a stray NO_FOMO_* would be read by nobody and fail silently.
  it("every env var is NO_FOMO_SOCIAL_*, never the old NO_FOMO_*", () => {
    const stray = SCAN.flatMap(files).flatMap((f) =>
      readFileSync(f, "utf8").split("\n").flatMap((line, i) => (/NO_FOMO_(?!SOCIAL_)/.test(line) ? [`${f.slice(ROOT.length + 1)}:${i + 1}`] : [])),
    );
    expect(stray).toEqual([]);
  });
});
