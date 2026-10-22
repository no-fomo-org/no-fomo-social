import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, o: { sitekey: string; theme: "auto"; size: "flexible"; appearance: "interaction-only" }): string;
      remove(id: string): void;
    };
  }
}

let loading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare's check that a person sends the form. It stays invisible unless it needs a click,
 * and puts its token into the form as `cf-turnstile-response`. Remount it (new `key`) after each send: a token works once.
 */
export function Turnstile({ siteKey }: { siteKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    loadTurnstile()
      .then(() => {
        if (!gone && ref.current && window.turnstile) {
          id = window.turnstile.render(ref.current, { sitekey: siteKey, theme: "auto", size: "flexible", appearance: "interaction-only" });
        }
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey]);
  return <div ref={ref} className="empty:hidden" />;
}
