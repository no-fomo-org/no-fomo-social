const WIDGETS = "input, textarea, [contenteditable=true], [role=slider], [role=menu], [role=menuitemradio]";
/** Keys a focused tab uses to move between tabs. Up, Down and the rest still reach the viewer. */
const TAB_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

/** True when a key press is meant for a field, slider, menu or tab, not for the viewer's own shortcuts. */
export function keyBelongsToWidget(target: EventTarget | null, key = ""): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  if (typeof el?.closest !== "function") return false;
  return el.closest(WIDGETS) !== null || (TAB_KEYS.has(key) && el.closest("[role=tab]") !== null);
}
