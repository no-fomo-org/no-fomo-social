import { describe, expect, it } from "vitest";
import { parseFollowingPage, parseProfileInfo, parseUserSearch } from "../src/ig/users";

describe("parseProfileInfo", () => {
  it("reads id, names, avatar, post count and privacy", () => {
    const raw = { data: { user: {
      id: "528817151", username: "nasa", full_name: "NASA", profile_pic_url: "https://scontent.cdninstagram.com/a.jpg",
      is_private: false, followed_by_viewer: true, edge_owner_to_timeline_media: { count: 4321 },
    } }, status: "ok" };
    expect(parseProfileInfo(raw)).toEqual({
      id: "528817151", username: "nasa", fullName: "NASA", avatarUrl: "https://scontent.cdninstagram.com/a.jpg",
      postCount: 4321, isPrivate: false, followedByViewer: true,
    });
  });

  it("returns null without a user", () => {
    expect(parseProfileInfo({ data: { user: null }, status: "ok" })).toBeNull();
    expect(parseProfileInfo(null)).toBeNull();
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
