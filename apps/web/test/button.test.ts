import { describe, expect, it } from "vitest";
import { buttonClass } from "../app/components/ui/button";

describe("buttonClass", () => {
  it("lets extra classes override the base padding instead of fighting it", () => {
    const cls = buttonClass("ghost", "px-0").split(" ");
    expect(cls).toContain("px-0");
    expect(cls).not.toContain("px-3.5");
  });

  it("has an icon size that is square and keeps its glyph", () => {
    const cls = buttonClass("ghost", "", "icon").split(" ");
    expect(cls).toContain("size-9");
    expect(cls).not.toContain("px-3.5");
  });
});
