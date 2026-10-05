import { describe, expect, it } from "vitest";
import { tabOnOpen } from "../app/lib/viewer-tab";

describe("tabOnOpen", () => {
  it("opens on the page's start tab every time, when the page has one", () => {
    expect(tabOnOpen("details", "report")).toBe("report");
  });
  it("keeps the last tab when the page has none", () => {
    expect(tabOnOpen("report", undefined)).toBe("report");
  });
});
