import type { GateStatus } from "@no-fomo-social/core";

/** Why calls to Instagram are held back, and until when. */
export type IgLimit = { kind: "paused" | "budget"; until: number; reason: string | null };

export const clockTime = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const isLimitCode = (code: string) => code === "paused" || code === "budget";

/** Null when nothing holds calls back, or when the extension did not answer. Past times count as over. */
export function limitFrom(status: GateStatus | null | undefined, now: number): IgLimit | null {
  if (status?.pausedUntil && status.pausedUntil > now) return { kind: "paused", until: status.pausedUntil, reason: status.reason };
  if (status?.budgetUntil && status.budgetUntil > now) return { kind: "budget", until: status.budgetUntil, reason: null };
  return null;
}

export function limitText(kind: IgLimit["kind"], until?: number): string {
  const when = until ? `Try again at ${clockTime(until)}.` : "Try again later.";
  return kind === "paused" ? `Instagram is limiting calls. ${when}` : `The app made many Instagram calls this hour. ${when}`;
}
