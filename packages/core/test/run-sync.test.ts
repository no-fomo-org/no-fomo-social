import { describe, expect, it } from "vitest";
import { IgError, type IgClient } from "../src/ig/client";
import { runSync, type SyncSink, type SyncResult } from "../src/sync/run-sync";

const page = (n: number, next: string | null) => ({ items: [{ n }], more_available: next !== null, next_max_id: next });

function setup(opts: { saved: Array<unknown | Error>; collections?: Array<unknown | Error>; stopAtSavedPage?: number }) {
  const log: string[] = [];
  const saved = [...opts.saved];
  const colls = [...(opts.collections ?? [{ items: [], more_available: false }])];
  const ig: IgClient = {
    async savedPage(cursor) {
      log.push(`ig:saved:${cursor}`);
      const next = saved.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    async mediaInfo() { throw new Error("not used by sync"); },
    async collectionsPage(cursor) {
      log.push(`ig:collections:${cursor}`);
      const next = colls.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  let savedCount = 0;
  const results: SyncResult[] = [];
  const sink: SyncSink = {
    async startRun() { log.push("sink:start"); return { runId: 7 }; },
    async savedPage(runId) {
      savedCount++;
      log.push(`sink:saved:${runId}`);
      return { stop: savedCount === opts.stopAtSavedPage, seen: 1 };
    },
    async collections() { log.push("sink:collections"); return { collections: [] }; },
    async finishRun(_r, result) { results.push(result); },
  };
  const sleeps: number[] = [];
  return { ig, sink, log, results, sleeps, sleep: async (ms: number) => { sleeps.push(ms); } };
}

describe("runSync", () => {
  it("walks saved pages, then reads collection names, pausing before every request after the first", async () => {
    const s = setup({ saved: [page(1, "A"), page(2, null)], collections: [page(1, "X"), page(2, null)] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep, delayMs: () => 2500 });
    expect(r).toEqual({ ok: true, requests: 4 });
    expect(s.log.filter((l) => l.startsWith("ig:"))).toEqual(["ig:saved:null", "ig:saved:A", "ig:collections:null", "ig:collections:X"]);
    expect(s.sleeps).toEqual([2500, 2500, 2500]);
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("stops the saved walk when the server says stop", async () => {
    const s = setup({ saved: [page(1, "A"), page(2, "B"), page(3, null)], stopAtSavedPage: 1 });
    await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(s.log.filter((l) => l.startsWith("ig:saved"))).toEqual(["ig:saved:null"]);
  });

  it("finishes fine when Instagram no longer serves the collections list (404)", async () => {
    const s = setup({ saved: [page(1, null)], collections: [new IgError("http_error", "gone", 404)] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(r).toEqual({ ok: true, requests: 2 });
    expect(s.results).toEqual([{ ok: true }]);
  });

  it("still stops on a rate limit while reading collection names", async () => {
    const s = setup({ saved: [page(1, null)], collections: [new IgError("rate_limited", "slow down", 429)] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(s.results).toEqual([{ ok: false, code: "rate_limited", message: "slow down" }]);
  });

  it("stops everything on rate limit during the saved walk", async () => {
    const s = setup({ saved: [page(1, "A"), new IgError("rate_limited", "slow down", 429)] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(r.error).toEqual({ code: "rate_limited", message: "slow down" });
    expect(s.log.some((l) => l.startsWith("ig:collections"))).toBe(false);
  });

  it("respects the request cap", async () => {
    const s = setup({ saved: [page(1, "A"), page(2, "B"), page(3, "C")] });
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep, maxRequests: 2 });
    expect(r.error?.code).toBe("too_many_requests");
    expect(s.log.filter((l) => l.startsWith("ig:"))).toHaveLength(2);
  });

  it("returns an error when the server cannot start a run", async () => {
    const s = setup({ saved: [] });
    s.sink.startRun = async () => { throw new Error("server down"); };
    const r = await runSync({ ig: s.ig, sink: s.sink, sleep: s.sleep });
    expect(r).toEqual({ ok: false, requests: 0, error: { code: "server_unreachable", message: "server down" } });
  });
});
