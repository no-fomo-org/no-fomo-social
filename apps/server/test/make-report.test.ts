import { describe, expect, it } from "vitest";
import { readScreen, SCREEN_BATCH } from "../src/analyze/make-report";
import type { Provider } from "../src/analyze/provider";

describe("readScreen", () => {
  it("reads frames in small batches and keeps their order", async () => {
    const batches: number[] = [];
    const provider: Provider = {
      transcribe: async () => "",
      generate: async ({ content }) => {
        const labels = content.flatMap((c) => (c.type === "text" ? [c.text] : []));
        batches.push(labels.length);
        // The last batch answers first, so order must come from the batch, not from timing.
        await new Promise((r) => setTimeout(r, labels[0] === "[f0]" ? 20 : 0));
        return labels.map((l) => `${l} text ${l.slice(2, -1)}`).join("\n");
      },
    };
    const visuals = Array.from({ length: SCREEN_BATCH * 2 + 1 }, (_, i) => ({ label: `f${i}`, image: new Uint8Array([i]) }));
    const text = await readScreen(provider, "m", visuals);
    expect(batches.sort((a, b) => b - a)).toEqual([SCREEN_BATCH, SCREEN_BATCH, 1]);
    expect(text.split("\n")[0]).toBe("[f0] text 0");
    expect(text.split("\n")).toHaveLength(visuals.length);
  });

  it("makes no call when there are no frames", async () => {
    const provider: Provider = { transcribe: async () => "", generate: async () => { throw new Error("no call expected"); } };
    expect(await readScreen(provider, "m", [])).toBe("");
  });
});
