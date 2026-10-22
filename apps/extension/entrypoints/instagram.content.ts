import { createIgClient, createRequestGate, gateClient, runSync, type IgCallLog, type IgClient, type PostsTemplate, type SyncMode } from "@no-fomo-social/core";
import { createPagePosts } from "../src/page-posts";
import { storageGateStore } from "../src/gate-store";
import { createRelaySink } from "../src/relay-sink";
import { fetchMedia } from "../src/media-fetch";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

type TabMsg = { type?: string; serverUrl?: string; mode?: SyncMode; id?: string; store?: boolean };

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
const readCsrf = () => readCookie("csrftoken");

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const send = (m: RelayMessage) => browser.runtime.sendMessage(m) as Promise<RelayResponse>;
    /** Where the call log goes: the app that sent the last message. */
    let serverUrl: string | null = null;
    const log = (entry: IgCallLog) => {
      if (serverUrl) void send({ type: "relay", serverUrl, path: "/api/sync/ig-calls", body: entry }).catch(() => {});
    };
    // One gate for every Instagram job. Its state is in browser storage, shared by all Instagram tabs.
    const gate = createRequestGate({ sleep, store: storageGateStore(browser.storage.local) });
    const pagePosts = createPagePosts({
      fetch: window.fetch.bind(window),
      sleep,
      now: Date.now,
      page: () => ({ path: location.pathname, text: document.body?.innerText ?? "" }),
    });
    // Instagram's page tells us (from its own script) which posts query it asks and what it answers.
    window.addEventListener("message", (e) => {
      const d = e.data as { source?: string; template?: PostsTemplate; response?: unknown } | null;
      if (e.source === window && d?.source === "no-fomo-ig" && d.template) pagePosts.capture(d.template, d.response);
    });
    const raw: IgClient = { ...createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf }), profilePosts: pagePosts.profilePosts };
    /** Calls the owner waits for: fail at once when calls are limited. */
    const ig = gateClient(raw, gate, { mode: "fail", log });
    /** Saved sync: waits for the hourly limit and goes on. */
    const backgroundIg = gateClient(raw, gate, { mode: "wait", log });
    const jobs = createTabJobs({ ig, send, viewerId: () => readCookie("ds_user_id") });
    let running = false;

    browser.runtime.onMessage.addListener((msg: TabMsg, _sender, sendResponse) => {
      if (typeof msg?.serverUrl === "string") serverUrl = msg.serverUrl;
      const job = jobs.handle(msg);
      if (job) {
        void job.then(sendResponse);
        return true;
      }
      if (typeof msg?.serverUrl !== "string") return;
      if (msg.type === "media:fetch" && typeof msg.id === "string") {
        void fetchMedia({ ig, id: msg.id, serverUrl: msg.serverUrl, send, store: msg.store === true }).then(sendResponse);
        return true;
      }
      if (msg.type !== "sync:run") return;
      if (running) {
        sendResponse({ ok: false, error: "already_running" });
        return;
      }
      running = true;
      sendResponse({ ok: true });
      const sink = createRelaySink(msg.serverUrl, send);
      // The gate spaces requests, so the sync loop adds no pause of its own.
      void runSync({ ig: backgroundIg, sink, sleep, delayMs: () => 0, mode: msg.mode === "full" ? "full" : "incremental" })
        .then((r) => console.info("[no-fomo-social] sync finished", r))
        .finally(() => { running = false; });
    });
  },
});
