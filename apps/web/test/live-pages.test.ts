import { describe, expect, it } from "vitest";
import { listBody, LIVE_LIST_OPTIONS, shouldLoadAhead } from "../app/lib/live-pages";
import { uniqueById } from "../app/lib/live-filter";

const base = { nearEnd: true, hasNextPage: true, isFetchingNextPage: false, autoLoad: true, failed: false, key: "9:12", lastKey: null };

describe("shouldLoadAhead (viewer near the end of the list)", () => {
  it("loads the next page once for a given post and list size", () => {
    expect(shouldLoadAhead(base)).toBe(true);
    expect(shouldLoadAhead({ ...base, lastKey: "9:12" })).toBe(false);
    expect(shouldLoadAhead({ ...base, key: "9:24", lastKey: "9:12" })).toBe(true);
  });
  it("never loads by itself while a filter is on", () => {
    expect(shouldLoadAhead({ ...base, autoLoad: false })).toBe(false);
  });
  it("stops after a page failed", () => {
    expect(shouldLoadAhead({ ...base, failed: true })).toBe(false);
  });
  it("waits for a running load and stops at the end", () => {
    expect(shouldLoadAhead({ ...base, isFetchingNextPage: true })).toBe(false);
    expect(shouldLoadAhead({ ...base, hasNextPage: false })).toBe(false);
    expect(shouldLoadAhead({ ...base, nearEnd: false })).toBe(false);
  });
});

describe("listBody", () => {
  it("shows the full error only when nothing loaded", () => {
    expect(listBody({ isError: true, hasData: false })).toBe("error");
    expect(listBody({ isError: true, hasData: true })).toBe("grid");
    expect(listBody({ isError: false, hasData: false })).toBe("grid");
  });
});

describe("LIVE_LIST_OPTIONS", () => {
  it("never reloads loaded pages by itself", () => {
    expect(LIVE_LIST_OPTIONS).toMatchObject({ staleTime: Infinity, refetchOnMount: false, refetchOnReconnect: false, retry: false });
  });
});

describe("uniqueById", () => {
  it("keeps the first copy of a post Instagram sends twice", () => {
    const a = { id: "1", n: 1 };
    expect(uniqueById([a, { id: "2", n: 2 }, { id: "1", n: 3 }])).toEqual([a, { id: "2", n: 2 }]);
  });
});
