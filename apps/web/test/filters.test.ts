import { describe, expect, it } from "vitest";
import { hasFilters, NO_FILTERS, postsQueryString, readFilters, reportsQueryString, writeFilters } from "../app/lib/filters";

describe("filters", () => {
  it("reads valid values and drops invalid ones", () => {
    expect(readFilters(new URLSearchParams("q=ramen&author=111&collection=179&kind=video&source=profile"))).toEqual({ q: "ramen", author: "111", collection: "179", kind: "video", source: "profile" });
    expect(readFilters(new URLSearchParams("q=%20%20&author=../x&kind=gif&source=all&report=1"))).toEqual(NO_FILTERS);
  });

  it("writes patches and removes empty values, keeping other params", () => {
    const sp = writeFilters(new URLSearchParams("author=1&post=9"), { author: null, kind: "image" });
    expect(writeFilters(new URLSearchParams(""), { q: "  " }).toString()).toBe("");
    expect(sp.toString()).toBe("post=9&kind=image");
    expect(writeFilters(new URLSearchParams(""), { source: "saved" }).toString()).toBe("source=saved");
  });

  it("builds the posts query, with a profile scope", () => {
    const f = { ...NO_FILTERS, q: "claude code", author: "1", kind: "video" as const };
    expect(postsQueryString(f, "55", { limit: 20 })).toBe("limit=20&q=claude+code&author=1&kind=video&cursor=55");
    expect(postsQueryString({ ...NO_FILTERS, collection: "7" }, null, { profile: "77" })).toBe("limit=60&profile=77");
  });

  it("builds the reports query", () => {
    expect(reportsQueryString({ ...NO_FILTERS, q: "ai", source: "profile", collection: "7" }, "100.5")).toBe("limit=40&q=ai&source=profile&cursor=100.5");
  });

  it("knows when filters are set", () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, source: "saved" })).toBe(true);
  });
});
