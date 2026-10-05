import { describe, expect, it } from "vitest";
import { hasFilters, postsQueryString, readFilters, writeFilters } from "../app/lib/filters";

describe("filters", () => {
  it("reads valid values and drops invalid ones", () => {
    expect(readFilters(new URLSearchParams("q=ramen&author=111&collection=179&kind=video"))).toEqual({ q: "ramen", author: "111", collection: "179", kind: "video" });
    expect(readFilters(new URLSearchParams("q=%20%20&author=../x&kind=gif"))).toEqual({ q: null, author: null, collection: null, kind: null });
  });

  it("writes patches and removes empty values, keeping other params", () => {
    const sp = writeFilters(new URLSearchParams("author=1&post=9"), { author: null, kind: "image" });
    expect(writeFilters(new URLSearchParams(""), { q: "  " }).toString()).toBe("");
    expect(sp.toString()).toBe("post=9&kind=image");
  });

  it("builds the posts query", () => {
    expect(postsQueryString({ q: "claude code", author: "1", collection: null, kind: "video" }, 55, 20)).toBe("limit=20&q=claude+code&author=1&kind=video&cursor=55");
    expect(hasFilters({ q: null, author: null, collection: null, kind: null })).toBe(false);
    expect(hasFilters({ q: "x", author: null, collection: null, kind: null })).toBe(true);
  });
});
