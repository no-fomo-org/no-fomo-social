import { describe, expect, it } from "vitest";
import { IgError, type IgClient } from "../src/ig/client";
import { runFollowingUpdate, runProfileLoad, type FollowingSink, type LoadStart, type ProfileSink } from "../src/sync/run-loads";
import type { SyncResult } from "../src/sync/run-sync";

const unused = async () => { throw new Error("not used"); };
const feedPage = (next: string | null) => ({ items: [], more_available: next !== null, next_max_id: next });

function fakeIg(over: Partial<IgClient>): IgClient {
  return { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
}

function profileSetup(opts: { pages: Array<unknown | Error>; stopAt?: number; start?: Error }) {
  const log: string[] = [];
  const pages = [...opts.pages];
  const results: SyncResult[] = [];
  const starts: LoadStart[] = [];
  let n = 0;
  const ig = fakeIg({
    profileInfo: async (u) => { log.push(`ig:info:${u}`); return { data: { user: { id: "77", username: u } } }; },
    userFeed: async (id, cursor) => {
      log.push(`ig:feed:${id}:${cursor}`);
      const next = pages.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const sink: ProfileSink = {
    async startRun(body) {
      log.push(`sink:start:${body.mode}`);
      if (opts.start) throw opts.start;
      return { runId: 3, authorId: "77", cursor: body.mode === "older" ? "OLD" : null, mode: body.mode };
    },
    async page() { n++; log.push("sink:page"); return { stop: n === opts.stopAt }; },
    async finishRun(_id, r) { results.push(r); },
  };
  return { ig, sink, log, results, starts, onStart: (s: LoadStart) => starts.push(s) };
}

describe("runProfileLoad", () => {
  it("adds by username: reads the profile, starts, then pages until Instagram says the end", async () => {
    const s = profileSetup({ pages: [feedPage("A"), feedPage(null)] });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "nasa" }, onStart: s.onStart });
    expect(r).toEqual({ ok: true, pages: 2 });
    expect(s.starts).toEqual([{ ok: true, authorId: "77" }]);
    expect(s.log).toEqual(["ig:info:nasa", "sink:start:add", "ig:feed:77:null", "sink:page", "ig:feed:77:A", "sink:page"]);
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("starts older loads from the stored cursor and stops at the page cap", async () => {
    const s = profileSetup({ pages: [feedPage("B"), feedPage("C"), feedPage("D")] });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "older", authorId: "77" }, onStart: s.onStart, maxPages: 2 });
    expect(r.pages).toBe(2);
    expect(s.log.filter((l) => l.startsWith("ig:feed"))).toEqual(["ig:feed:77:OLD", "ig:feed:77:B"]);
  });

  it("lets a refresh read more pages than an add, to reach the posts it already has", async () => {
    const pages = Array.from({ length: 12 }, (_, i) => feedPage(i < 11 ? `P${i}` : null));
    const s = profileSetup({ pages });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "refresh", authorId: "77" }, onStart: s.onStart });
    expect(r.pages).toBe(12);
    const a = profileSetup({ pages: Array.from({ length: 12 }, (_, i) => feedPage(`P${i}`)) });
    expect((await runProfileLoad({ ig: a.ig, sink: a.sink, request: { mode: "add", username: "x" }, onStart: a.onStart })).pages).toBe(9);
  });

  it("stops when the server says the rest is known", async () => {
    const s = profileSetup({ pages: [feedPage("A"), feedPage("B")], stopAt: 1 });
    await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "refresh", authorId: "77" }, onStart: s.onStart });
    expect(s.log.filter((l) => l === "sink:page")).toHaveLength(1);
  });

  it("reports a start error once and never pages", async () => {
    const s = profileSetup({ pages: [], start: new Error("private_profile") });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "x" }, onStart: s.onStart });
    expect(r.ok).toBe(false);
    expect(s.starts).toEqual([{ ok: false, error: "private_profile" }]);
    expect(s.results).toEqual([]);
  });

  it("reports an Instagram error during paging to the server", async () => {
    const s = profileSetup({ pages: [feedPage("A"), new IgError("rate_limited", "slow down")] });
    const r = await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "nasa" }, onStart: s.onStart });
    expect(r).toMatchObject({ ok: false, pages: 1, error: { code: "rate_limited" } });
    expect(s.results).toEqual([{ ok: false, code: "rate_limited", message: "slow down" }]);
  });

  it("passes the Instagram code when the profile cannot be read", async () => {
    const s = profileSetup({ pages: [] });
    s.ig.profileInfo = async () => { throw new IgError("not_found", "gone"); };
    await runProfileLoad({ ig: s.ig, sink: s.sink, request: { mode: "add", username: "ghost" }, onStart: s.onStart });
    expect(s.starts).toEqual([{ ok: false, error: "not_found" }]);
  });
});

describe("runFollowingUpdate", () => {
  function followingSetup(pages: unknown[]) {
    const cursors: Array<string | null> = [];
    const results: SyncResult[] = [];
    const starts: LoadStart[] = [];
    const ig = fakeIg({ followingPage: async (_v, cursor) => { cursors.push(cursor); return pages.shift(); } });
    const sink: FollowingSink = {
      async startRun() { return { runId: 5 }; },
      async page() { return { seen: 1 }; },
      async finishRun(_id, r) { results.push(r); },
    };
    return { ig, sink, cursors, results, starts, onStart: (s: LoadStart) => starts.push(s) };
  }

  it("walks pages by next_max_id", async () => {
    const s = followingSetup([{ users: [], next_max_id: "100" }, { users: [] }]);
    const r = await runFollowingUpdate({ ig: s.ig, sink: s.sink, viewerId: "42", onStart: s.onStart });
    expect(r).toEqual({ ok: true, pages: 2 });
    expect(s.cursors).toEqual([null, "100"]);
    expect(s.starts).toEqual([{ ok: true }]);
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("needs the owner's user id", async () => {
    const s = followingSetup([]);
    const r = await runFollowingUpdate({ ig: s.ig, sink: s.sink, viewerId: null, onStart: s.onStart });
    expect(r.ok).toBe(false);
    expect(s.starts).toEqual([{ ok: false, error: "login_required" }]);
  });
});
