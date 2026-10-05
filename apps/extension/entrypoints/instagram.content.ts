import { createIgClient, runSync } from "@no-fomo/core";
import { createRelaySink } from "../src/relay-sink";
import type { RelayMessage, RelayResponse } from "../src/relay";

function readCsrf(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  main() {
    let running = false;
    browser.runtime.onMessage.addListener((msg: { type?: string; serverUrl?: string }, _sender, sendResponse) => {
      if (msg?.type !== "sync:run" || typeof msg.serverUrl !== "string") return;
      if (running) {
        sendResponse({ ok: false, error: "already_running" });
        return;
      }
      running = true;
      sendResponse({ ok: true });
      const sink = createRelaySink(msg.serverUrl, (m: RelayMessage) => browser.runtime.sendMessage(m) as Promise<RelayResponse>);
      const ig = createIgClient({ fetch: window.fetch.bind(window), csrfToken: readCsrf });
      void runSync({ ig, sink, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })
        .then((r) => console.info("[no-fomo] sync finished", r))
        .finally(() => { running = false; });
    });
  },
});
