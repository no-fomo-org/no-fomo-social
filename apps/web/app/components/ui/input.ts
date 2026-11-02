import { twMerge } from "tailwind-merge";

const base =
  "h-9 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-[14px] text-text placeholder:text-muted " +
  "focus-visible:border-accent-line focus-visible:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** The one text field look (36px, Surface fill, Paper on focus). Later classes win, so callers can change size or padding. */
export function inputClass(extra = "") {
  return twMerge(base, extra);
}
