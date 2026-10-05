import { describe, expect, it } from "vitest";
import { hasFilters, postsQueryString, readFilters, writeFilters } from "../app/lib/filters";

describe("filters", () => {
  it("reads valid values and drops invalid ones", () => {
    expect(readFilters(new URLSearchParams("q=ramen&author=111&collection=179&kind=video"))).toEqual({ q: "ramen", author: "111", collection: "179", kind: "video", report: false });
    expect(readFilters(new URLSearchParams("q=%20%20&author=../x&kind=gif"))).toEqual({ q: null, author: null, collection: null, kind: null, report: false });
  });

  it("writes patches and removes empty values, keeping other params", () => {
    const sp = writeFilters(new URLSearchParams("author=1&post=9"), { author: null, kind: "image" });
    expect(writeFilters(new URLSearchParams(""), { q: "  " }).toString()).toBe("");
    expect(sp.toString()).toBe("post=9&kind=image");
  });

  it("builds the posts query", () => {
    expect(postsQueryString({ q: "claude code", author: "1", collection: null, kind: "video", report: false }, "55", 20)).toBe("limit=20&q=claude+code&author=1&kind=video&cursor=55");
    expect(hasFilters({ q: null, author: null, collection: null, kind: null, report: false })).toBe(false);
    expect(hasFilters({ q: "x", author: null, collection: null, kind: null, report: false })).toBe(true);
  });

  it("reads and writes the report filter", () => {
    expect(readFilters(new URLSearchParams("report=1")).report).toBe(true);
    expect(readFilters(new URLSearchParams("report=yes")).report).toBe(false);
    expect(writeFilters(new URLSearchParams(""), { report: true }).toString()).toBe("report=1");
    expect(writeFilters(new URLSearchParams("report=1"), { report: false }).toString()).toBe("");
    expect(postsQueryString({ q: null, author: null, collection: null, kind: null, report: true }, null)).toBe("limit=60&report=1");
    expect(hasFilters({ q: null, author: null, collection: null, kind: null, report: true })).toBe(true);
  });
});
