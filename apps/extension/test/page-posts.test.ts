import { describe, expect, it, vi } from "vitest";
import { IgError, parsePostsRequest, type PostsTemplate } from "@no-fomo-social/core";
import { createPagePosts } from "../src/page-posts";

const NAME = "PolarisProfilePostsTabContentQuery_connection";
const template = (username = "nasa"): PostsTemplate =>
  parsePostsRequest("https://www.instagram.com/graphql/query", { "x-csrftoken": "C" }, new URLSearchParams({
    fb_api_req_friendly_name: NAME, doc_id: "12345", lsd: "L", variables: JSON.stringify({ username, first: 12, after: null }),
  }).toString())!;
const node = (pk: string) => ({ pk, code: `C${pk}`, media_type: 1, taken_at: 1, user: { pk: "77", username: "nasa" } });
const answer = (pks: string[], next: string | null = "END") => ({
  data: { conn: { edges: pks.map((pk) => ({ node: node(pk) })), page_info: { has_next_page: next !== null, end_cursor: next } } },
});

function setup(over: { page?: () => { path: string; text: string }; fetch?: typeof fetch } = {}) {
  let t = 0;
  const env = {
    fetch: over.fetch ?? (vi.fn() as unknown as typeof fetch),
    sleep: async (ms: number) => { t += ms; },
    now: () => t,
    page: over.page ?? (() => ({ path: "/nasa/", text: "" })),
  };
  return { posts: createPagePosts(env, { waitMs: 1000, pollMs: 100 }), env, clock: () => t };
}
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as IgError).code; } return "none"; };

describe("page posts: first page", () => {
  it("gives the answer Instagram's own page already got", async () => {
    const { posts, env } = setup();
    posts.capture(template(), answer(["1", "2"]));
    expect(await posts.profilePosts("NASA", null)).toMatchObject({ more_available: true, next_max_id: "END", items: [{ pk: "1" }, { pk: "2" }] });
    expect(env.fetch).not.toHaveBeenCalled();
  });

  it("waits for the page to load its posts", async () => {
    const { posts } = setup();
    const result = posts.profilePosts("nasa", null);
    posts.capture(template(), answer(["1"], null));
    expect(await result).toMatchObject({ more_available: false, items: [{ pk: "1" }] });
  });

  it("does not answer for another account with the posts of the first", async () => {
    const { posts } = setup();
    posts.capture(template("nasa"), answer(["1"]));
    expect(await code(posts.profilePosts("natgeo", null))).toBe("bad_response");
  });

  it("gives up after the wait with a plain message", async () => {
    const { posts, clock } = setup();
    await expect(posts.profilePosts("nasa", null)).rejects.toThrow("Could not read this account's posts");
    expect(clock()).toBeGreaterThanOrEqual(1000);
  });

  it("says why when the page shows a login, a private account or no account", async () => {
    expect(await code(setup({ page: () => ({ path: "/accounts/login/", text: "" }) }).posts.profilePosts("nasa", null))).toBe("login_required");
    expect(await code(setup({ page: () => ({ path: "/nasa/", text: "This account is private" }) }).posts.profilePosts("nasa", null))).toBe("private");
    expect(await code(setup({ page: () => ({ path: "/nasa/", text: "Sorry, this page isn’t available." }) }).posts.profilePosts("nasa", null))).toBe("not_found");
  });
});

describe("page posts: next pages", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("repeats Instagram's own query with the cursor", async () => {
    const f = vi.fn(async () => json(answer(["3"], null)));
    const { posts } = setup({ fetch: f as unknown as typeof fetch });
    posts.capture(template(), answer(["1"]));
    expect(await posts.profilePosts("natgeo", "END")).toMatchObject({ more_available: false, items: [{ pk: "3" }] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.instagram.com/graphql/query");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    const form = new URLSearchParams(init.body as string);
    expect(form.get("doc_id")).toBe("12345");
    expect(JSON.parse(form.get("variables")!)).toMatchObject({ username: "natgeo", after: "END" });
  });

  it("reads Instagram's refusals like every other call", async () => {
    const limited = setup({ fetch: (async () => json({ message: "Please wait a few minutes before you try again.", status: "fail" }, 401)) as unknown as typeof fetch });
    limited.posts.capture(template(), answer(["1"]));
    expect(await code(limited.posts.profilePosts("nasa", "END"))).toBe("rate_limited");
    const page = setup({ fetch: (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch });
    page.posts.capture(template(), answer(["1"]));
    expect(await code(page.posts.profilePosts("nasa", "END"))).toBe("login_required");
  });

  it("asks to open the account again when it never saw Instagram's query", async () => {
    const { posts } = setup();
    expect(await code(posts.profilePosts("nasa", "END"))).toBe("bad_response");
  });

  it("fails when the answer holds no posts", async () => {
    const { posts } = setup({ fetch: (async () => json({ data: {} })) as unknown as typeof fetch });
    posts.capture(template(), answer(["1"]));
    expect(await code(posts.profilePosts("nasa", "END"))).toBe("bad_response");
  });
});
