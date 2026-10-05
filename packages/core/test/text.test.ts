import { describe, expect, it } from "vitest";
import { extractHashtags, extractMentions } from "../src/ig/text";
import { expiresAtFromUrl } from "../src/ig/url";

describe("extractHashtags", () => {
  it("finds unicode hashtags, lowercased and unique", () => {
    expect(extractHashtags("Tips #ClaudeCode #AI #ai Подписывайся #нейросети")).toEqual(["claudecode", "ai", "нейросети"]);
  });
  it("ignores url fragments and returns [] for null", () => {
    expect(extractHashtags("see a.com/x#frag and &#123;")).toEqual([]);
    expect(extractHashtags(null)).toEqual([]);
  });
});

describe("extractMentions", () => {
  it("trims trailing dots and skips emails", () => {
    expect(extractMentions("thanks @someone. and @Other_one, mail me a@b.com")).toEqual(["someone", "other_one"]);
  });
});

describe("expiresAtFromUrl", () => {
  it("reads the hex oe param as unix seconds", () => {
    expect(expiresAtFromUrl("https://x.cdninstagram.com/a.mp4?oe=68C0A1B2&_nc=1")).toBe(parseInt("68C0A1B2", 16));
  });
  it("returns null when missing or invalid", () => {
    expect(expiresAtFromUrl("https://x/a.mp4")).toBeNull();
    expect(expiresAtFromUrl("not a url")).toBeNull();
    expect(expiresAtFromUrl(null)).toBeNull();
  });
});
