import { describe, expect, it } from "vitest";
import { handleRelay } from "../src/relay";
import { createRelaySink } from "../src/relay-sink";

const okFetch = (async (url: string | URL, init?: RequestInit) =>
  new Response(JSON.stringify({ url: String(url), body: JSON.parse(String(init?.body)) }), { status: 200 })) as typeof fetch;

describe("handleRelay", () => {
  it("posts JSON to the local server", async () => {
    const r = await handleRelay({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs", body: { a: 1 } }, okFetch);
    expect(r).toEqual({ ok: true, data: { url: "http://localhost:4747/api/sync/runs", body: { a: 1 } } });
  });

  it("refuses non-local servers and non-sync paths", async () => {
    expect(await handleRelay({ type: "relay", serverUrl: "https://evil.example", path: "/api/sync/runs", body: { mode: "full" } }, okFetch))
      .toEqual({ ok: false, error: "bad_relay" });
    expect(await handleRelay({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/posts", body: {} }, okFetch))
      .toEqual({ ok: false, error: "bad_relay" });
  });

  it("refuses other local ports", async () => {
    expect(await handleRelay({ type: "relay", serverUrl: "http://localhost:9999", path: "/api/sync/runs", body: { mode: "full" } }, okFetch))
      .toEqual({ ok: false, error: "bad_relay" });
  });

  it("passes server errors through", async () => {
    const f = (async () => new Response(JSON.stringify({ error: "Sync run 1 is done" }), { status: 409 })) as typeof fetch;
    expect(await handleRelay({ type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs/1/saved", body: {} }, f))
      .toEqual({ ok: false, error: "Sync run 1 is done" });
  });
});

describe("createRelaySink", () => {
  it("maps sink calls to server paths", async () => {
    const sent: unknown[] = [];
    const sink = createRelaySink("http://localhost:4747", async (m) => { sent.push(m); return { ok: true, data: { runId: 3, stop: false, seen: 1, collections: [] } }; });
    await sink.startRun("full");
    await sink.collections(3, { x: 1 });
    expect(sent).toEqual([
      { type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs", body: { mode: "full" } },
      { type: "relay", serverUrl: "http://localhost:4747", path: "/api/sync/runs/3/collections", body: { payload: { x: 1 } } },
    ]);
  });

  it("throws on relay errors", async () => {
    const sink = createRelaySink("http://localhost:4747", async () => ({ ok: false, error: "down" }));
    await expect(sink.startRun("incremental")).rejects.toThrow("down");
  });
});
