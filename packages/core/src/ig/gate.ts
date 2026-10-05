import { IgError, type IgClient } from "./client";

export interface RequestGate {
  run<T>(call: () => Promise<T>): Promise<T>;
}

/**
 * Every Instagram request in the tab goes through one gate: one at a time,
 * a pause between them, and a 10 minute stop after Instagram asks to slow down or refuses a request.
 */
export function createRequestGate(opts: {
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
  /** Pause between two requests. Default 2000-3000 ms. */
  gapMs?: () => number;
  cooldownMs?: number;
}): RequestGate {
  const now = opts.now ?? Date.now;
  const gap = opts.gapMs ?? (() => 2000 + Math.floor(Math.random() * 1000));
  const cooldown = opts.cooldownMs ?? 10 * 60_000;
  let lastAt: number | null = null;
  let blockedUntil = 0;
  let blockedBecause = "";
  let tail: Promise<unknown> = Promise.resolve();

  async function runOne<T>(call: () => Promise<T>): Promise<T> {
    if (now() < blockedUntil) {
      const minutes = Math.ceil((blockedUntil - now()) / 60_000);
      throw new IgError("paused", `Instagram calls are paused for ${minutes} more minute${minutes === 1 ? "" : "s"} to protect your account, because: ${blockedBecause}`);
    }
    if (lastAt !== null) {
      const wait = lastAt + gap() - now();
      if (wait > 0) await opts.sleep(wait);
    }
    lastAt = now();
    try {
      return await call();
    } catch (e) {
      if (e instanceof IgError && (e.code === "rate_limited" || e.code === "refused")) {
        blockedUntil = now() + cooldown;
        blockedBecause = e.message;
      }
      throw e;
    }
  }

  return {
    run(call) {
      const result = tail.then(() => runOne(call));
      tail = result.catch(() => {});
      return result;
    },
  };
}

export function gateClient(ig: IgClient, gate: RequestGate): IgClient {
  return {
    savedPage: (cursor) => gate.run(() => ig.savedPage(cursor)),
    collectionsPage: (cursor) => gate.run(() => ig.collectionsPage(cursor)),
    mediaInfo: (id) => gate.run(() => ig.mediaInfo(id)),
    profileInfo: (username) => gate.run(() => ig.profileInfo(username)),
    userFeed: (userId, cursor) => gate.run(() => ig.userFeed(userId, cursor)),
    searchUsers: (query) => gate.run(() => ig.searchUsers(query)),
    followingPage: (viewerId, cursor) => gate.run(() => ig.followingPage(viewerId, cursor)),
  };
}
