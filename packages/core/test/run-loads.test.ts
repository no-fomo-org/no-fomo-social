import { describe, expect, it } from "vitest";
import type { IgClient } from "../src/ig/client";
import { runFollowingUpdate, type FollowingSink, type LoadStart } from "../src/sync/run-loads";
import type { SyncResult } from "../src/sync/run-sync";

const unused = async () => { throw new Error("not used"); };

function fakeIg(over: Partial<IgClient>): IgClient {
  return { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
}

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
