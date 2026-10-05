import type { ProfileItem } from "@no-fomo/core";
import { formatAgo } from "./format";

export function loadNote(p: ProfileItem): string {
  if (p.run?.status === "running") return `Loading, ${p.run.items.toLocaleString("en")} new posts so far`;
  const loaded = `${p.loadedCount.toLocaleString("en")}${p.postCount !== null ? ` of ${p.postCount.toLocaleString("en")}` : ""} posts loaded`;
  return p.refreshedAt ? `${loaded} · Updated ${formatAgo(p.refreshedAt)}` : loaded;
}

/** Why the last load stopped, until a new load starts. Null when it went fine. */
export function loadProblem(p: ProfileItem): string | null {
  return p.run?.status === "error" ? (p.run.errorMessage ?? "The last load failed. Try again.") : null;
}
