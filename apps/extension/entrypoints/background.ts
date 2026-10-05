import { APP_VERSION, DEFAULT_PORT } from "@no-fomo/core";
import { handleExternalMessage } from "../src/external";
import { handleRelay, type RelayMessage } from "../src/relay";

const IG_URL = "https://www.instagram.com/";

function waitForComplete(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { browser.tabs.onUpdated.removeListener(listener); reject(new Error("Instagram did not load")); }, timeoutMs);
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function sendToTab(tabId: number, msg: unknown): Promise<unknown> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await browser.tabs.sendMessage(tabId, msg);
    } catch {
      // Tab opened before the extension was installed has no content script: reload it once.
      if (attempt === 0) {
        await browser.tabs.reload(tabId);
        await waitForComplete(tabId).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { ok: false, error: "instagram_tab_failed" };
}

export default defineBackground(() => {
  browser.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    handleExternalMessage(msg, sender.url, {
      version: APP_VERSION,
      findInstagramTab: async () => (await browser.tabs.query({ url: "https://www.instagram.com/*" }))[0]?.id ?? null,
      openInstagramTab: async () => {
        const tab = await browser.tabs.create({ url: IG_URL, active: false });
        await waitForComplete(tab.id!);
        return tab.id!;
      },
      sendToTab,
    }).then(sendResponse, (e: Error) => sendResponse({ ok: false, error: e.message }));
    return true;
  });

  browser.runtime.onMessage.addListener((msg: RelayMessage, _sender, sendResponse) => {
    if (msg?.type !== "relay") return;
    handleRelay(msg, fetch).then(sendResponse);
    return true;
  });

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: `http://localhost:${DEFAULT_PORT}` });
  });
});
