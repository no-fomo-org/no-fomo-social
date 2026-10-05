import { describe, expect, it } from "vitest";
import { parseProfileInput } from "../app/lib/profile-input";

describe("parseProfileInput", () => {
  it("accepts names, @names and profile links", () => {
    expect(parseProfileInput("nasa")).toBe("nasa");
    expect(parseProfileInput(" @Maria.Codes ")).toBe("maria.codes");
    expect(parseProfileInput("https://www.instagram.com/nasa/")).toBe("nasa");
    expect(parseProfileInput("instagram.com/nasa?igsh=abc")).toBe("nasa");
    expect(parseProfileInput("https://instagram.com/kenji_makes/reels/")).toBe("kenji_makes");
  });
  it("rejects post links, other sites and bad names", () => {
    expect(parseProfileInput("https://www.instagram.com/reel/DAbc/")).toBeNull();
    expect(parseProfileInput("https://evil.com/nasa")).toBeNull();
    expect(parseProfileInput("https://notinstagram.com/nasa")).toBeNull();
    expect(parseProfileInput("two words")).toBeNull();
    expect(parseProfileInput("")).toBeNull();
    expect(parseProfileInput("a".repeat(31))).toBeNull();
  });
});
