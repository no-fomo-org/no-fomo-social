import { describe, expect, it } from "vitest";
import { appOrigins, isAppOrigin } from "../src/origins";

describe("app origins", () => {
  it("trusts only the local app in normal builds", () => {
    expect(appOrigins(false)).toEqual(["http://localhost:4747", "http://127.0.0.1:4747"]);
    expect(isAppOrigin("http://localhost:4747/?post=1", false)).toBe(true);
    expect(isAppOrigin("http://localhost:5173/", false)).toBe(false);
  });

  it("also trusts the web dev server in dev builds", () => {
    expect(appOrigins(true)).toContain("http://localhost:5173");
    expect(isAppOrigin("http://localhost:5173/", true)).toBe(true);
    expect(isAppOrigin("http://localhost:5174/", true)).toBe(false);
  });

  it("is a normal build by default under tests", () => {
    expect(isAppOrigin("http://localhost:5173/")).toBe(false);
  });
});
