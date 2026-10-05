const WIDGETS = "input, textarea, [contenteditable=true], [role=slider], [role=menu], [role=menuitemradio], [role=tab]";

/** True when a key press is meant for a field, slider, menu or tab, not for the viewer's own shortcuts. */
export function keyBelongsToWidget(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  return typeof el?.closest === "function" && el.closest(WIDGETS) !== null;
}
