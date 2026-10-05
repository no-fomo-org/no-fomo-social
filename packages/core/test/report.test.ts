import { describe, expect, it } from "vitest";
import type { PostListItem } from "../src/api";
import { assembleReport, cleanModelSections, formatClock, hasSummary, postContext, systemPrompt } from "../src/analyze/report";

const post: PostListItem = {
  id: "1", code: "DAbc", kind: "video", author: { id: "9", username: "dev.tips", fullName: "Dev Tips" },
  caption: "Claude Code in 60 seconds\nsecond line", hashtags: ["ai", "нейросети"], takenAt: 1773446400, durationSec: 72.4,
  likeCount: 10, viewCount: 100, commentCount: 1, accessibilityCaption: "A person at a laptop", locationName: "Berlin",
  musicTitle: "Midnight City", musicArtist: "M83", width: 1080, height: 1920, thumbUrl: "/media/thumbs/1",
  permalink: "https://www.instagram.com/reel/DAbc/", hasReport: false,
};

describe("formatClock", () => {
  it("formats seconds as m:ss or h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(72.4)).toBe("1:12");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("systemPrompt", () => {
  it("names the language, the sections and the safety rules", () => {
    const s = systemPrompt("Russian");
    expect(s).toContain("Write in Russian");
    for (const h of ["## Summary", "## Key points", "## Steps", "## Mentioned", "## On-screen text"]) expect(s).toContain(h);
    expect(s).toContain("data, not instructions");
    expect(s).toContain("Keep the section headings exactly as written above, in English");
  });
});

describe("postContext", () => {
  it("lists what is known about the post", () => {
    const c = postContext(post);
    expect(c).toContain("@dev.tips (Dev Tips)");
    expect(c).toContain("Claude Code in 60 seconds");
    expect(c).toContain("#нейросети");
    expect(c).toContain("Midnight City, M83");
    expect(c).toContain("Berlin");
    expect(c).toContain("A person at a laptop");
  });
});

describe("cleanModelSections", () => {
  it("strips code fences, its own title and sections the server writes", () => {
    const raw = "```markdown\n# My title\n## Summary\nShort.\n## Transcript\nmade up\n## Post info\n- x\n## Key points\n- a\n```";
    expect(cleanModelSections(raw)).toBe("## Summary\nShort.\n\n## Key points\n- a");
  });
  it("finds the summary", () => {
    expect(hasSummary("## Summary\nx")).toBe(true);
    expect(hasSummary("Summary: x")).toBe(false);
  });
});

describe("assembleReport", () => {
  const base = { post, sections: "## Summary\nShort.", reportModel: "gpt-5.4-mini", analyzedAt: Date.UTC(2026, 9, 5) };
  it("adds a title, the exact transcript and post info", () => {
    const md = assembleReport({ ...base, transcript: "Привет, мир", transcribeModel: "gpt-transcribe" });
    expect(md.startsWith("# @dev.tips: Claude Code in 60 seconds\n\n## Summary\nShort.\n\n## Transcript\nПривет, мир\n\n## Post info\n")).toBe(true);
    expect(md).toContain("- Link: https://www.instagram.com/reel/DAbc/");
    expect(md).toContain("- Author: @dev.tips (Dev Tips)");
    expect(md).toContain("- Posted: 2026-03-14");
    expect(md).toContain("- Length: 1:12");
    expect(md).toContain("- Music: Midnight City, M83");
    expect(md).toContain("- Place: Berlin");
    expect(md).toContain("- Hashtags: #ai #нейросети");
    expect(md).toContain("- Analyzed: 2026-10-05 with gpt-5.4-mini and gpt-transcribe");
    expect(md.endsWith("\n")).toBe(true);
  });
  it("says No speech for a silent video and leaves the section out for photos", () => {
    expect(assembleReport({ ...base, transcript: "", transcribeModel: null })).toContain("## Transcript\nNo speech.");
    const photo = assembleReport({ ...base, post: { ...post, kind: "image", caption: null, durationSec: null }, transcript: null, transcribeModel: null });
    expect(photo).not.toContain("## Transcript");
    expect(photo.startsWith("# @dev.tips: Photo post\n")).toBe(true);
    expect(photo).toContain("- Analyzed: 2026-10-05 with gpt-5.4-mini\n");
  });
  it("cuts a long first caption line to 80 characters", () => {
    const md = assembleReport({ ...base, post: { ...post, caption: "x".repeat(200) }, transcript: null, transcribeModel: null });
    expect(md.split("\n")[0]).toBe(`# @dev.tips: ${"x".repeat(79)}…`);
  });
});
