import { describe, expect, it } from "vitest";
import { createIgClient, IG_APP_ID, IgError } from "../src/ig/client";

function fakeFetch(...responses: Array<() => Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next();
  }) as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function codeOf(p: Promise<unknown>) {
  try { await p; } catch (e) { return e instanceof IgError ? e.code : "other"; }
  return "no-error";
}

describe("createIgClient", () => {
  it("calls the saved feed with app id, csrf and cursor", async () => {
    const f = fakeFetch(json({ items: [], status: "ok" }));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => "tok" });
    await ig.savedPage("CUR");
    expect(f.calls[0]!.url).toBe("https://www.instagram.com/api/v1/feed/saved/posts/?max_id=CUR");
    const h = f.calls[0]!.init!.headers as Record<string, string>;
    expect(h["X-IG-App-ID"]).toBe(IG_APP_ID);
    expect(h["X-CSRFToken"]).toBe("tok");
    expect(f.calls[0]!.init!.credentials).toBe("include");
  });

  it("builds collection urls", async () => {
    const f = fakeFetch(json({ status: "ok" }), json({ status: "ok" }));
    const ig = createIgClient({ fetch: f.fn, csrfToken: () => null });
    await ig.collectionsPage(null);
    await ig.collectionPage("179", "C2");
    // Same query the instagram.com Saved page sends. A shorter query returned 404 in a real sync.
    expect(f.calls[0]!.url).toBe(
      "https://www.instagram.com/api/v1/collections/list/?collection_types=%5B%22ALL_MEDIA_AUTO_COLLECTION%22%2C%22MEDIA%22%2C%22AUDIO_AUTO_COLLECTION%22%5D&get_cover_media_lists=true&include_public_only=0&max_id=",
    );
    expect(f.calls[1]!.url).toBe("https://www.instagram.com/api/v1/feed/collection/179/posts/?max_id=C2");
  });

  it("maps failures to clear error codes", async () => {
    const make = (r: () => Response) => createIgClient({ fetch: fakeFetch(r).fn, csrfToken: () => null }).savedPage(null);
    expect(await codeOf(make(json({}, 429)))).toBe("rate_limited");
    expect(await codeOf(make(json({}, 401)))).toBe("login_required");
    expect(await codeOf(make(json({ message: "login_required", status: "fail" }, 200)))).toBe("login_required");
    expect(await codeOf(make(json({ require_login: true }, 200)))).toBe("login_required");
    expect(await codeOf(make(json({ spam: true, status: "fail" }, 200)))).toBe("rate_limited");
    expect(await codeOf(make(json({ status: "fail", message: "feedback_required" }, 200)))).toBe("refused");
    expect(await codeOf(make(json({}, 500)))).toBe("http_error");
    const err = await createIgClient({ fetch: fakeFetch(json({}, 404)).fn, csrfToken: () => null }).collectionsPage(null).catch((e) => e);
    expect((err as Error).message).toBe("Instagram returned error 404 (collections list). Sync stopped.");
    expect(await codeOf(make(() => new Response("<html>login</html>", { status: 200 })))).toBe("login_required");
  });
});
