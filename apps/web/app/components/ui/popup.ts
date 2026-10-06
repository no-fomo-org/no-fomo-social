/**
 * Popovers and menus: paper surface that grows from its trigger (Base UI sets --transform-origin).
 * Never from scale(0): it starts at 0.97 and fades, 150ms.
 */
export const POPUP =
  "origin-[var(--transform-origin)] rounded-control border border-line bg-paper shadow-pop " +
  "transition-[scale,opacity] duration-150 ease-out-soft " +
  "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0";

/** A row inside a popover or menu. */
export const POPUP_ROW = "rounded-tile hover:bg-surface focus-visible:bg-surface focus-visible:outline-none data-[highlighted]:bg-surface";
