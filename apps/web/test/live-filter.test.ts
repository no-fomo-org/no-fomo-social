import { describe, expect, it } from "vitest";
import type { LivePost } from "@no-fomo/core";
import { filterLive } from "../app/lib/live-filter";

const post = (id: string, kind: LivePost["kind"], caption: string | null, extra: Partial<LivePost> = {}): LivePost => ({
  id, code: `C${id}`, kind, author: { id: "77", username: "nasa", fullName: "NASA" }, caption, hashtags: [], takenAt: 1,
  durationSec: null, likeCount: null, viewCount: null, commentCount: null, accessibilityCaption: null, locationName: null,
  musicTitle: null, musicArtist: null, width: null, height: null, thumbUrl: "", permalink: "", hasReport: false, saved: false,
  media: { id, kind, parts: [], expiresAt: null }, ...extra,
});
const posts = [
  post("1", "video", "Artemis launch from Florida"),
  post("2", "image", "Moon surface, Нейросети"),
  post("3", "carousel", null, { accessibilityCaption: "Photo of a rocket on a launch pad" }),
];
const ids = (f: Parameters<typeof filterLive>[1]) => filterLive(posts, f).map((p) => p.id);

describe("filterLive", () => {
  it("keeps everything without filters", () => {
    expect(ids({ q: null, kind: null })).toEqual(["1", "2", "3"]);
  });
  it("needs every word, in caption, image description or author, any case", () => {
    expect(ids({ q: "LAUNCH", kind: null })).toEqual(["1", "3"]);
    expect(ids({ q: "launch florida", kind: null })).toEqual(["1"]);
    expect(ids({ q: "нейросети", kind: null })).toEqual(["2"]);
    expect(ids({ q: "nasa", kind: null })).toEqual(["1", "2", "3"]);
  });
  it("filters by type", () => {
    expect(ids({ q: "launch", kind: "carousel" })).toEqual(["3"]);
  });
});
