import { parsePostsRequest } from "@no-fomo/core";

/** Marks the messages this script sends to the extension's other script in the same page. */
const SOURCE = "no-fomo-ig";

/**
 * Runs inside Instagram's page, before its own code. It only watches: when the page asks its profile posts query,
 * it passes the request (ids, tokens) and the answer on, so the extension can read accounts and repeat the query.
 * It never changes a request or an answer, and a failure in it is silent so it can never break the page.
 */
export default defineContentScript({
  matches: ["https://www.instagram.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    const pass = (template: unknown, response: unknown) => window.postMessage({ source: SOURCE, template, response }, window.location.origin);

    function headersOf(h: unknown): Record<string, string> {
      const out: Record<string, string> = {};
      if (h instanceof Headers) h.forEach((v, k) => { out[k.toLowerCase()] = v; });
      else if (Array.isArray(h)) for (const [k, v] of h) out[String(k).toLowerCase()] = String(v);
      else if (h && typeof h === "object") for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
      return out;
    }
    const bodyText = (b: unknown): string | null => (typeof b === "string" ? b : b instanceof URLSearchParams ? b.toString() : null);

    const originalFetch = window.fetch;
    window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      const result = originalFetch.apply(this, args);
      try {
        const [input, init] = args;
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const body = init?.method?.toUpperCase() === "POST" ? bodyText(init.body) : null;
        const template = body === null ? null : parsePostsRequest(url, headersOf(init?.headers), body);
        if (template) {
          void result.then((res) => res.clone().json()).then((json) => pass(template, json)).catch(() => {});
        }
      } catch {
        // Watching must never break the page.
      }
      return result;
    } as typeof fetch;

    const xhrInfo = new WeakMap<XMLHttpRequest, { method: string; url: string; headers: Record<string, string> }>();
    const proto = XMLHttpRequest.prototype;
    const open = proto.open;
    const setRequestHeader = proto.setRequestHeader;
    const send = proto.send;
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      try { xhrInfo.set(this, { method, url: String(url), headers: {} }); } catch { /* silent */ }
      return (open as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;
    proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
      try { const i = xhrInfo.get(this); if (i) i.headers[name.toLowerCase()] = value; } catch { /* silent */ }
      return setRequestHeader.call(this, name, value);
    };
    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      try {
        const i = xhrInfo.get(this);
        const text = i && i.method.toUpperCase() === "POST" ? bodyText(body) : null;
        const template = i && text !== null ? parsePostsRequest(i.url, i.headers, text) : null;
        if (template) {
          this.addEventListener("load", () => {
            try { pass(template, JSON.parse(this.responseText)); } catch { /* silent */ }
          });
        }
      } catch {
        // Watching must never break the page.
      }
      return send.call(this, body);
    };
  },
});
