import { describe, expect, it } from "vitest";
import { accountSearch, backSearch, searchAction, withParam } from "../app/lib/home-url";

describe("Home URL state", () => {
  it("opens an account and comes back with the search kept", () => {
    const p = new URLSearchParams("q=nas&find=nas&post=9");
    expect(accountSearch(p, "nasa")).toBe("?q=nas&find=nas&account=nasa");
    expect(backSearch(new URLSearchParams("q=nas&find=nas&account=nasa&post=9"))).toBe("?q=nas&find=nas");
    expect(accountSearch(p, "nasa", "77")).toBe("?q=nas&find=nas&account=nasa&id=77");
    expect(backSearch(new URLSearchParams("q=nas&account=nasa&id=77"))).toBe("?q=nas");
  });
  it("sets and clears one parameter", () => {
    expect(withParam(new URLSearchParams("a=1"), "b", "2").toString()).toBe("a=1&b=2");
    expect(withParam(new URLSearchParams("a=1&b=2"), "b", null).toString()).toBe("a=1");
  });
});

describe("searchAction (Enter in the Home search box)", () => {
  it("opens a profile link or an @username directly", () => {
    expect(searchAction("https://www.instagram.com/nasa/")).toEqual({ open: "nasa" });
    expect(searchAction("@NASA")).toEqual({ open: "nasa" });
  });
  it("searches Instagram for other text of 2 to 60 letters", () => {
    expect(searchAction("  natgeo ")).toEqual({ find: "natgeo" });
    expect(searchAction("national geographic")).toEqual({ find: "national geographic" });
    expect(searchAction("n")).toBeNull();
    expect(searchAction("a".repeat(61))).toBeNull();
  });
  it("does nothing for links that are not accounts", () => {
    expect(searchAction("https://www.instagram.com/p/C1/")).toBeNull();
    expect(searchAction("@")).toBeNull();
  });
});
