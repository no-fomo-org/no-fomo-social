import { describe, expect, it } from "vitest";
import { parseMedia } from "../src/ig/parse";
import { buildPostMedia, permalinkOf, toLivePost } from "../src/ig/live";

const cdn = (name: string, oe: string) => `https://scontent.cdninstagram.com/${name}?oe=${oe}`;
const user = { pk: "77", username: "nasa", full_name: "NASA" };

describe("toLivePost", () => {
  it("builds a carousel with its parts and the earliest link expiry", () => {
    const p = parseMedia({
      pk: "1", code: "CAR1", media_type: 8, taken_at: 100, user, caption: { text: "Moon #space" },
      carousel_media: [
        { media_type: 1, image_versions2: { candidates: [{ width: 1080, height: 1350, url: cdn("a.jpg", "6A000000") }] } },
        {
          media_type: 2,
          image_versions2: { candidates: [{ width: 720, height: 1280, url: cdn("b.jpg", "6B000000") }] },
          video_versions: [{ width: 720, height: 1280, url: cdn("b.mp4", "69000000") }],
        },
      ],
    })!;
    const live = toLivePost(p);
    expect(live).toMatchObject({
      id: "1", code: "CAR1", kind: "carousel", author: { id: "77", username: "nasa", fullName: "NASA" },
      caption: "Moon #space", hashtags: ["space"], takenAt: 100, hasReport: false, saved: false,
      permalink: "https://www.instagram.com/p/CAR1/",
      thumbUrl: cdn("a.jpg", "6A000000"),
    });
    expect(live.media).toEqual({
      id: "1", kind: "carousel", expiresAt: 0x69000000,
      parts: [
        { index: 0, kind: "image", imageUrl: cdn("a.jpg", "6A000000"), videoUrl: null, width: 1080, height: 1350 },
        { index: 1, kind: "video", imageUrl: cdn("b.jpg", "6B000000"), videoUrl: cdn("b.mp4", "69000000"), width: 720, height: 1280 },
      ],
    });
  });

  it("links reels to /reel/ and other posts to /p/", () => {
    expect(permalinkOf("R1", "clips")).toBe("https://www.instagram.com/reel/R1/");
    expect(permalinkOf("P1", null)).toBe("https://www.instagram.com/p/P1/");
  });

  it("has no expiry when no link carries one", () => {
    expect(buildPostMedia("9", "image", [{ index: 0, kind: "image", imageUrl: "https://x.cdninstagram.com/a.jpg", videoUrl: null, width: null, height: null }]).expiresAt).toBeNull();
  });
});
