import { describe, expect, it } from "vitest";
import type { PostReport } from "@no-fomo/core";
import { analyzeErrorText, isWorking, reportFileName, reportView, stepText } from "../app/lib/report";

const r = (over: Partial<PostReport>): PostReport => ({
  postId: "1", status: "done", step: null, markdown: "# x", language: "English", reportModel: "m", transcribeModel: null,
  frameCount: 1, errorCode: null, errorMessage: null, createdAt: 0, finishedAt: 1, ...over,
});

describe("reportView", () => {
  it("asks for a key when there is none and no report", () => {
    expect(reportView({ hasKey: false, report: null, starting: false, startError: null })).toEqual({ kind: "no_key", error: null });
  });
  it("offers Analyze when there is a key and no report", () => {
    expect(reportView({ hasKey: true, report: null, starting: false, startError: null })).toEqual({ kind: "empty", error: null });
  });
  it("shows progress while starting, queued or running", () => {
    expect(reportView({ hasKey: true, report: null, starting: true, startError: null }).kind).toBe("working");
    expect(reportView({ hasKey: true, report: r({ status: "running", markdown: "old" }), starting: false, startError: null }).kind).toBe("working");
  });
  it("shows the old report with the error of a failed re-run", () => {
    expect(reportView({ hasKey: true, report: r({ status: "error", errorCode: "quota", markdown: "old" }), starting: false, startError: null }))
      .toEqual({ kind: "report", error: "quota" });
  });
  it("shows a start error over an empty state", () => {
    expect(reportView({ hasKey: true, report: null, starting: false, startError: "rate_limited" })).toEqual({ kind: "empty", error: "rate_limited" });
  });
  it("keeps a finished report visible even without a key", () => {
    expect(reportView({ hasKey: false, report: r({}), starting: false, startError: null }).kind).toBe("report");
  });
});

describe("texts", () => {
  it("has plain messages for every server code and media codes", () => {
    expect(analyzeErrorText("no_ffmpeg", null)).toBe("ffmpeg is not installed. Install it, for example with: brew install ffmpeg");
    expect(analyzeErrorText("model_not_found", "gpt-x")).toBe('OpenAI does not know the model "gpt-x". Check the model names in Settings.');
    expect(analyzeErrorText("rate_limited", null)).toBe("Instagram asked to slow down. Try again in a few minutes.");
    expect(analyzeErrorText("something_new", null)).toBe("Analysis failed. Try again.");
    for (const t of [analyzeErrorText("quota", null), stepText("frames")]) expect(t).not.toMatch(/[–—]/);
  });
  it("names steps", () => {
    expect(stepText("transcribing")).toBe("Turning speech into text");
    expect(stepText(null)).toBe("Waiting to start");
  });
  it("builds a safe file name that keeps non-Latin letters", () => {
    expect(reportFileName("dev.tips", "DAbc_1")).toBe("dev.tips-DAbc_1.md");
    expect(reportFileName("../evil", "x/y")).toBe("evil-x-y.md");
    expect(reportFileName("кот", "Q")).toBe("кот-Q.md");
  });
  it("knows when a job is active", () => {
    expect(isWorking(r({ status: "queued" }))).toBe(true);
    expect(isWorking(r({}))).toBe(false);
    expect(isWorking(null)).toBe(false);
  });
});
