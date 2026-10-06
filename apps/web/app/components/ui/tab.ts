/**
 * One look for every tab: muted text; the active tab gets a soft Fern fill, text color and weight 600. No underline.
 * Active comes from aria-current (NavLink) or data-active (Base UI Tabs). Wrap the label in <TabLabel> so the bold
 * active weight does not shift its neighbours.
 */
export const TAB =
  "inline-flex h-9 items-center rounded-control px-3 text-[14px] text-muted transition-colors duration-150 " +
  "hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-text " +
  "data-[active]:bg-accent-soft data-[active]:font-semibold data-[active]:text-text";
