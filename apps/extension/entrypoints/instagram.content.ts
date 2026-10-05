import { createIgClient, createRequestGate, gateClient, runSync, type SyncMode } from "@no-fomo/core";
import { createRelaySink } from "../src/relay-sink";
import { fetchMedia } from "../src/media-fetch";
import { createTabJobs } from "../src/tab-jobs";
import type { RelayMessage, RelayResponse } from "../src/relay";

type TabMsg = { type?: string; serverUrl?: string; mode?: SyncMode; id?: string; query?: string; request?: unknown };

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]!) : null;
}
const readCsrf = () => readCookie("csrftoken");

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    // Every Instagram job in this tab shares one gate, so Instagram never sees two requests close together.
    const ig = gateClient(createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf }), createRequestGate({ sleep }));
    const send = (m: RelayMessage) => browser.runtime.sendMessage(m) as Promise<RelayResponse>;
    const jobs = createTabJobs({ ig, send, viewerId: () => readCookie("ds_user_id") });
    let running = false;

    browser.runtime.onMessage.addListener((msg: TabMsg, _sender, sendResponse) => {
      const job = jobs.handle(msg);
      if (job) {
        void job.then(sendResponse);
        return true;
      }
      if (typeof msg?.serverUrl !== "string") return;
      if (msg.type === "media:fetch" && typeof msg.id === "string") {
        void fetchMedia({ ig, id: msg.id, serverUrl: msg.serverUrl, send }).then(sendResponse);
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
      void runSync({ ig, sink, sleep, delayMs: () => 0, mode: msg.mode === "full" ? "full" : "incremental" })
        .then((r) => console.info("[no-fomo] sync finished", r))
        .finally(() => { running = false; });
    });
  },
});
