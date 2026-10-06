import { describe, expect, it } from "vitest";
import { parsePostsRequest, postsPageFromResponse, replayRequest, templateUsername } from "../src/ig/posts-query";
import { parseMediaPage } from "../src/ig/parse";

const NAME = "PolarisProfilePostsTabContentQuery_connection";
const body = (over: Record<string, string> = {}) =>
  new URLSearchParams({
    av: "1784", __a: "1", lsd: "LSD1", fb_dtsg: "DTSG1", jazoest: "26001",
    fb_api_req_friendly_name: NAME, doc_id: "12345",
    variables: JSON.stringify({ data: { count: 12 }, username: "Nasa", first: 12, after: null }),
    ...over,
  }).toString();
const headers = { "x-fb-lsd": "LSD1", "x-ig-app-id": "936619743392459", "x-csrftoken": "CSRF1" };

describe("parsePostsRequest", () => {
  it("recognizes Instagram's own profile posts query and keeps what a replay needs", () => {
    const t = parsePostsRequest("https://www.instagram.com/graphql/query", headers, body())!;
    expect(t.url).toBe("https://www.instagram.com/graphql/query");
    expect(t.headers).toEqual(headers);
    expect(t.params.doc_id).toBe("12345");
    expect(t.params.variables).toBeUndefined();
    expect(t.variables).toMatchObject({ username: "Nasa", first: 12 });
    expect(templateUsername(t)).toBe("nasa");
  });
  it("ignores other queries and other addresses", () => {
    expect(parsePostsRequest("https://www.instagram.com/graphql/query", headers, body({ fb_api_req_friendly_name: "PolarisFeedRootQuery" }))).toBeNull();
    expect(parsePostsRequest("https://www.instagram.com/api/v1/feed/saved/posts/", headers, body())).toBeNull();
    expect(parsePostsRequest("https://www.instagram.com/graphql/query", headers, "not a form")).toBeNull();
    expect(parsePostsRequest("https://www.instagram.com/graphql/query", headers, body({ variables: "{" }))).toBeNull();
  });
});

describe("replayRequest", () => {
  const t = parsePostsRequest("https://www.instagram.com/graphql/query", headers, body())!;
  it("asks for another account and a cursor with the same ids, tokens and headers", () => {
    const r = replayRequest(t, "natgeo", "CUR1");
    const form = new URLSearchParams(r.body);
    expect(form.get("doc_id")).toBe("12345");
    expect(form.get("lsd")).toBe("LSD1");
    expect(form.get("fb_api_req_friendly_name")).toBe(NAME);
    expect(JSON.parse(form.get("variables")!)).toEqual({ data: { count: 12 }, username: "natgeo", first: 12, after: "CUR1" });
    expect(r.headers).toMatchObject(headers);
    expect(r.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(r.url).toBe("https://www.instagram.com/graphql/query");
  });
  it("starts from the first page without a cursor", () => {
    expect(JSON.parse(new URLSearchParams(replayRequest(t, "natgeo", null).body).get("variables")!).after).toBeNull();
  });
});

describe("postsPageFromResponse", () => {
  const node = (pk: string) => ({ pk, code: `C${pk}`, media_type: 1, taken_at: 1, user: { pk: "77", username: "nasa" },
    image_versions2: { candidates: [{ width: 640, height: 800, url: `https://scontent.cdninstagram.com/${pk}.jpg` }] } });
  const response = (more = true) => ({ data: { xdt_api__v1__feed__user_timeline_graphql_connection: {
    edges: [{ node: node("1") }, { node: node("2") }], page_info: { has_next_page: more, end_cursor: more ? "END1" : null },
  } } });
  it("finds the posts by shape and gives the shape the rest of the app reads", () => {
    const page = postsPageFromResponse(response())!;
    expect(page).toMatchObject({ more_available: true, next_max_id: "END1" });
    const parsed = parseMediaPage(page);
    expect(parsed.items.map((p) => p.id)).toEqual(["1", "2"]);
    expect(parsed.nextCursor).toBe("END1");
    expect(parsed.moreAvailable).toBe(true);
  });
  it("ends when Instagram says there is no next page", () => {
    expect(postsPageFromResponse(response(false))).toMatchObject({ more_available: false, next_max_id: null });
  });
  it("finds the posts even when Instagram renames the connection", () => {
    const renamed = { data: { some_other_name: { edges: [{ node: node("9") }], page_info: { has_next_page: false } } } };
    expect(postsPageFromResponse(renamed)!.items).toHaveLength(1);
  });
  it("is null when the answer holds no posts", () => {
    expect(postsPageFromResponse({ data: { viewer: {} } })).toBeNull();
    expect(postsPageFromResponse(null)).toBeNull();
    expect(postsPageFromResponse({ data: { c: { edges: [{ node: { id: "x" } }] } } })).toBeNull();
  });
});
