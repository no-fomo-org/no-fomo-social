import { describe, expect, it } from "vitest";
import page1 from "../fixtures/saved-page-1.json";
import page2 from "../fixtures/saved-page-2.json";
import collectionsList from "../fixtures/collections-list.json";
import { parseCollectionsPage, parseMediaPage, readPageInfo } from "../src/ig/parse";

describe("parseMediaPage", () => {
  it("parses a reel with music, counts and expiry", () => {
    const { items } = parseMediaPage(page1);
    const reel = items[0]!;
    expect(reel).toMatchObject({
      id: "3500000000000000001",
      code: "DAbcReel01",
      kind: "video",
      productType: "clips",
      author: { id: "111", username: "devtips", fullName: "Dev Tips" },
      hashtags: ["claudecode", "ai", "нейросети"],
      mentions: ["anthropic"],
      takenAt: 1756000000,
      thumbnailUrl: "https://scontent.cdninstagram.com/v/reel1_640.jpg?oe=68C0A1B2",
      videoUrl: "https://scontent.cdninstagram.com/o1/v/reel1_720.mp4?oe=68C0A1B2",
      videoUrlExpiresAt: parseInt("68C0A1B2", 16),
      durationSec: 42.5,
      likeCount: 1532,
      viewCount: 48211,
      commentCount: 87,
      musicTitle: "Midnight City",
      musicArtist: "M83",
      width: 1080,
      height: 1920,
      parts: [],
    });
  });

  it("parses an image with location and accessibility caption", () => {
    const img = parseMediaPage(page1).items[1]!;
    expect(img).toMatchObject({
      kind: "image",
      thumbnailUrl: "https://scontent.cdninstagram.com/v/img2_480.jpg",
      videoUrl: null,
      locationName: "Berlin, Germany",
      accessibilityCaption: "May be an image of text that says 'Grid systems'.",
      mentions: ["someone"],
    });
  });

  it("parses carousel children and skips unknown child types", () => {
    const car = parseMediaPage(page1).items[2]!;
    expect(car.kind).toBe("carousel");
    expect(car.parts).toHaveLength(2);
    expect(car.parts[1]).toMatchObject({ index: 1, kind: "video", videoUrl: "https://scontent.cdninstagram.com/o1/v/car3b_720.mp4?oe=68C0A1B2" });
    expect(car.thumbnailUrl).toBe("https://scontent.cdninstagram.com/v/car3a_1080.jpg");
    expect(car.accessibilityCaption).toBe("May be an image of a laptop");
  });

  it("reads paging info", () => {
    expect(readPageInfo(page1)).toEqual({ nextCursor: "QVFCursorPage2", moreAvailable: true });
    expect(readPageInfo(page2)).toEqual({ nextCursor: null, moreAvailable: false });
  });

  it("degrades on odd items instead of throwing", () => {
    const page = parseMediaPage(page2);
    expect(page.items).toHaveLength(1);
    expect(page.skipped).toBe(2);
    expect(page.items[0]).toMatchObject({
      caption: null,
      hashtags: [],
      thumbnailUrl: null,
      author: { username: "quietcook", fullName: null },
      viewCount: 900,
      musicTitle: "Original audio",
      musicArtist: "quietcook",
    });
  });

  it("never throws on garbage", () => {
    for (const junk of [null, 1, "x", [], { items: "nope" }, { items: [null, 1] }]) {
      expect(() => parseMediaPage(junk)).not.toThrow();
    }
  });
});

describe("parseCollectionsPage", () => {
  it("keeps only user collections", () => {
    expect(parseCollectionsPage(collectionsList).items).toEqual([
      { id: "17900000000000002", name: "AI tools", mediaCount: 2 },
      { id: "17900000000000003", name: "Design", mediaCount: 1 },
    ]);
  });
});
