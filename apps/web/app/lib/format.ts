export function formatDuration(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const formatCount = (n: number) => compact.format(n);

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function formatAgo(ms: number, now = Date.now()): string {
  const sec = Math.round((ms - now) / 1000);
  if (Math.abs(sec) < 45) return "just now";
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
export const formatDate = (unixSec: number) => dateFmt.format(new Date(unixSec * 1000));

const FULL_CHECK_EVERY_MS = 30 * 86_400_000;

/** A full resync is due when the library was synced but not fully checked in 30 days. */
export function fullCheckDue(lastFullAt: number | null, lastSuccessAt: number | null, now = Date.now()): boolean {
  if (lastSuccessAt === null) return false;
  return lastFullAt === null || now - lastFullAt > FULL_CHECK_EVERY_MS;
}

export function runResultNote(run: { status: string; postsNew: number; postsRemoved: number } | null): string {
  if (!run || run.status !== "done") return "";
  const parts: string[] = [];
  if (run.postsNew > 0) parts.push(run.postsNew === 1 ? "1 new post" : `${run.postsNew.toLocaleString("en")} new posts`);
  if (run.postsRemoved > 0) parts.push(`${run.postsRemoved.toLocaleString("en")} removed on Instagram`);
  return parts.length ? `, ${parts.join(", ")}` : "";
}

/** A failed following update stays the last run until the next one. After a while, say when it failed. */
const FRESH_MS = 10 * 60_000;

export function followingRunError(
  run: { status: string; startedAt: number; finishedAt: number | null; errorMessage: string | null },
  now: number,
): string | null {
  if (run.status !== "error") return null;
  const at = run.finishedAt ?? run.startedAt;
  if (now - at < FRESH_MS) return run.errorMessage ?? "The last update failed.";
  const d = new Date(at);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `The last update, on ${day} at ${time}, did not finish. Press Update list to try again.`;
}
