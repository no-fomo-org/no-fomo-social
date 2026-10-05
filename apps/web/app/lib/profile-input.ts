const USERNAME = /^[a-z0-9._]{1,30}$/;
/** First path parts on instagram.com that are pages, not accounts. */
const NOT_ACCOUNTS = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "about", "developer", "legal"]);

/** Turns "nasa", "@nasa" or an instagram.com profile link into a username. Null when it is none of these. */
export function parseProfileInput(text: string): string | null {
  let t = text.trim();
  if (!t) return null;
  if (/instagram\.com/i.test(t)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    } catch {
      return null;
    }
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
    t = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (NOT_ACCOUNTS.has(t.toLowerCase())) return null;
  }
  t = t.replace(/^@/, "").toLowerCase();
  return USERNAME.test(t) ? t : null;
}
