import { describe, expect, it, vi } from "vitest";
import { IgError, type IgClient } from "@no-fomo/core";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

const unused = async () => { throw new Error("not used"); };
function setup(over: Partial<IgClient> = {}, relay?: (m: RelayMessage) => RelayResponse) {
  const ig: IgClient = { savedPage: unused, collectionsPage: unused, mediaInfo: unused, profileInfo: unused, userFeed: unused, searchUsers: unused, followingPage: unused, ...over };
  const sent: RelayMessage[] = [];
  const send = vi.fn(async (m: RelayMessage) => { sent.push(m); return relay ? relay(m) : ({ ok: true, data: {} } as RelayResponse); });
  return { jobs: createTabJobs({ ig, send, viewerId: () => "42" }), sent };
}

describe("tab jobs", () => {
  it("answers a search with parsed users", async () => {
    const { jobs } = setup({ searchUsers: async () => ({ users: [{ user: { pk: "1", username: "one" } }] }) });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({
      ok: true, users: [{ id: "1", username: "one", fullName: null, avatarUrl: null, isPrivate: false, isVerified: false }],
    });
  });

  it("returns the Instagram error code of a failed search", async () => {
    const { jobs } = setup({ searchUsers: async () => { throw new IgError("login_required", "x"); } });
    expect(await jobs.handle({ type: "profile:search", query: "one" })).toEqual({ ok: false, error: "login_required" });
  });

  it("answers a profile load once it started, and refuses a second load meanwhile", async () => {
    let releaseFeed!: () => void;
    const feedGate = new Promise<void>((r) => { releaseFeed = r; });
    const { jobs, sent } = setup(
      {
        profileInfo: async () => ({ data: { user: { id: "77", username: "nasa" } } }),
        userFeed: async () => { await feedGate; return { items: [], more_available: false }; },
      },
      (m) => (m.path === "/api/sync/profiles/runs" ? { ok: true, data: { runId: 3, authorId: "77", cursor: null } } : { ok: true, data: { stop: false } }),
    );
    const msg = { type: "profile:load", serverUrl: "http://localhost:4747", request: { mode: "add", username: "nasa" } };
    expect(await jobs.handle(msg)).toEqual({ ok: true, authorId: "77" });
    expect(await jobs.handle(msg)).toEqual({ ok: false, error: "busy" });
    releaseFeed();
    await vi.waitFor(() => expect(sent.map((m) => m.path)).toContain("/api/sync/loads/3/finish"));
    expect(sent.map((m) => m.path)).toEqual(["/api/sync/profiles/runs", "/api/sync/profiles/runs/3/page", "/api/sync/loads/3/finish"]);
  });

  it("passes the server's error code when a load cannot start", async () => {
    const { jobs } = setup(
      { profileInfo: async () => ({ data: { user: { id: "77", username: "x", is_private: true } } }) },
      () => ({ ok: false, error: "private_profile" }),
    );
    expect(await jobs.handle({ type: "profile:load", serverUrl: "http://localhost:4747", request: { mode: "add", username: "x" } })).toEqual({ ok: false, error: "private_profile" });
  });

  it("ignores messages it does not know", () => {
    expect(setup().jobs.handle({ type: "sync:run" })).toBeNull();
  });
});
