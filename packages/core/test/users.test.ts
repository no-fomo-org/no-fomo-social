import { describe, expect, it } from "vitest";
import { parseFeedOwner, parseFollowingPage, parseUserSearch } from "../src/ig/users";

describe("parseFeedOwner", () => {
  it("reads the account from the first post of a feed page", () => {
    const raw = { items: [{ pk: "1", user: { pk: "77", username: "nasa", full_name: "NASA", profile_pic_url: "https://scontent.cdninstagram.com/a.jpg" } }] };
    expect(parseFeedOwner(raw)).toEqual({ id: "77", username: "nasa", fullName: "NASA", avatarUrl: "https://scontent.cdninstagram.com/a.jpg" });
  });
  it("is null for an empty page", () => {
    expect(parseFeedOwner({ items: [] })).toBeNull();
    expect(parseFeedOwner(null)).toBeNull();
  });
});

describe("parseUserSearch", () => {
  it("reads users with flags and skips broken entries", () => {
    const raw = { users: [
      { position: 0, user: { pk: "1", username: "one", full_name: "One", profile_pic_url: "u", is_private: true, is_verified: true } },
      { position: 1, user: { username: "no_id" } },
    ], places: [], hashtags: [] };
    expect(parseUserSearch(raw)).toEqual([
      { id: "1", username: "one", fullName: "One", avatarUrl: "u", isPrivate: true, isVerified: true },
    ]);
  });

  it("keeps at most 20 accounts", () => {
    const users = Array.from({ length: 30 }, (_, i) => ({ user: { pk: String(i + 1), username: `u${i}` } }));
    expect(parseUserSearch({ users })).toHaveLength(20);
  });
});

describe("parseFollowingPage", () => {
  it("reads users and the next cursor, as string or number", () => {
    expect(parseFollowingPage({ users: [{ pk: 5, username: "five" }], next_max_id: 100 })).toEqual({
      items: [{ id: "5", username: "five", fullName: null, avatarUrl: null }], nextCursor: "100", moreAvailable: true,
    });
    expect(parseFollowingPage({ users: [] })).toEqual({ items: [], nextCursor: null, moreAvailable: false });
  });
});
