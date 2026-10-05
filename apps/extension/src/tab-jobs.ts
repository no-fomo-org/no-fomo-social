import {
  IgError, parseUserSearch, runFollowingUpdate, runProfileLoad, type IgClient, type LoadStart, type ProfileLoadRequest,
} from "@no-fomo/core";
import { createFollowingSink, createProfileSink } from "./relay-sink";
import type { RelayMessage, RelayResponse } from "./relay";

type Msg = { type?: unknown; query?: unknown; serverUrl?: unknown; request?: unknown };

/**
 * Profile search, profile loads and following updates in the Instagram tab.
 * One load of each kind at a time; the request gate keeps all Instagram calls apart.
 */
export function createTabJobs(deps: { ig: IgClient; send: (m: RelayMessage) => Promise<RelayResponse>; viewerId: () => string | null }) {
  const busy = { profile: false, following: false };

  /** Answers as soon as the job started (or failed to), then lets it run. */
  function startJob(kind: keyof typeof busy, run: (onStart: (s: LoadStart) => void) => Promise<unknown>): Promise<LoadStart> {
    if (busy[kind]) return Promise.resolve({ ok: false, error: "busy" });
    busy[kind] = true;
    return new Promise<LoadStart>((resolve) => {
      void run(resolve)
        .then((r) => console.info(`[no-fomo] ${kind} load finished`, r))
        .finally(() => { busy[kind] = false; });
    });
  }

  return {
    handle(raw: unknown): Promise<unknown> | null {
      const m = (raw ?? {}) as Msg;
      if (m.type === "profile:search" && typeof m.query === "string") {
        return deps.ig.searchUsers(m.query).then(
          (r) => ({ ok: true, users: parseUserSearch(r) }),
          (e: unknown) => ({ ok: false, error: e instanceof IgError ? e.code : "internal" }),
        );
      }
      if (typeof m.serverUrl !== "string") return null;
      const serverUrl = m.serverUrl;
      if (m.type === "profile:load" && m.request) {
        const request = m.request as ProfileLoadRequest;
        return startJob("profile", (onStart) => runProfileLoad({ ig: deps.ig, sink: createProfileSink(serverUrl, deps.send), request, onStart }));
      }
      if (m.type === "following:update") {
        return startJob("following", (onStart) =>
          runFollowingUpdate({ ig: deps.ig, sink: createFollowingSink(serverUrl, deps.send), viewerId: deps.viewerId(), onStart }));
      }
      return null;
    },
  };
}
