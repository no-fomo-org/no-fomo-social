import { describe, expect, it } from "vitest";
import { keyBelongsToWidget } from "../app/lib/keys";

const target = (match: string | null) => ({ closest: (sel: string) => (match && sel.split(", ").includes(match) ? {} : null) }) as unknown as EventTarget;

describe("keyBelongsToWidget", () => {
  it("leaves keys alone in text fields, sliders and menus", () => {
    for (const m of ["input", "textarea", "[contenteditable=true]", "[role=slider]", "[role=menu]", "[role=menuitemradio]"]) {
      expect(keyBelongsToWidget(target(m))).toBe(true);
    }
  });

  it("leaves Left and Right to focused tabs, but not Up, Down or Space", () => {
    expect(keyBelongsToWidget(target("[role=tab]"), "ArrowLeft")).toBe(true);
    expect(keyBelongsToWidget(target("[role=tab]"), "End")).toBe(true);
    expect(keyBelongsToWidget(target("[role=tab]"), "ArrowDown")).toBe(false);
    expect(keyBelongsToWidget(target("[role=tab]"), " ")).toBe(false);
  });

  it("lets the viewer use keys everywhere else", () => {
    expect(keyBelongsToWidget(target(null))).toBe(false);
    expect(keyBelongsToWidget(null)).toBe(false);
  });
});
