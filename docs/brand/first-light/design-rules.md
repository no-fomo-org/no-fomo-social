# no-fomo design rules

**Brand:** First Light. Full guide and assets in `docs/brand/first-light/`.

**Read:** a calm personal library for professionals. A star rising over a horizon at first light. Light first, nature in the colors, logo and one photograph. The posts are the color, and the interface stays quiet and crisp.

**Dials:** variance 3, motion 4, density 5.

## Color
- Tokens live in `apps/web/app/app.css` (source: `docs/brand/first-light/tokens.css`). Never use raw hex in components.
- Light: Mist background `#F6F7F3`, Forest text `#1E2A22`, Fern accent `#4F6B3A`. Dark "evening": `#141A16` background, `#EEF0E8` text, light Fern `#A3B98C` accent.
- Fern only for the main action on a screen and for active states. Never decoration.
- Active tabs and chips: `accent-soft` fill and `text` color, chips also an `accent-line` border. No underlines anywhere.
- Lake only for links inside report text. Danger only for errors.
- No gradients in the interface. Never pure black or pure white.
- Theme follows the system. Both themes are first-class.

## Type
- Outfit 800 to 900 (`font-display`) only for the logo, empty-state titles and the hero. Never for body or controls.
- Figtree for the interface: 13px meta, 14px controls, 15px body, 20px sheet titles.
- Geist Mono for numbers, always `tabular-nums`.

## Shape
- Controls 6px (`rounded-control`), media 4px (`rounded-tile`), sheets 8px (`rounded-sheet`). Icon buttons are 36px squares.
- Avatars are circles. Nothing else is a pill.

## Layout
- Content max width 1600px, 16px gutter on phone, 24px on desktop.
- Grid tiles are 3:4 and large: 2 columns on phone, 3 from 640px, 4 from 1024px, 5 from 1280px, 6 from 1680px. Under each tile: author and duration on one line, the caption's first line below. Never text on top of the image.
- The top bar is 64px: logo, search (`/` focuses it), tabs, Sync.
- Group with spacing and single hairlines, not cards.

## Imagery
- One brand photograph (misty ridges at first light). Only in the first-run state and empty states. Never behind the grid, in sheets or in the player.
- Text on the photo is Cream, bottom-left, on the dark ridges. The button stays Fern.
- Phone uses the portrait version below 768px.

## Logo
- Star over a horizon arc plus `no-fomo.` in Outfit 900. Use the files in `docs/brand/first-light/logo/` or `<LogoLockup />` and `<LogoSymbol />`.
- Below 24px use the small symbol. The arc never appears as UI decoration.

## Motion
- Feedback and state change only. Press `scale(0.97)` 160ms. Tile hover zoom 1.03, on hover devices only. Sheet slide 300ms `cubic-bezier(0.32, 0.72, 0, 1)`. Popovers scale from the trigger, 150ms.
- Loading a sync uses the brand mark: the star rises over the arc. Content loading uses skeletons.
- No animation on keyboard actions. Everything is still under `prefers-reduced-motion`.

## Icons
- Hugeicons only, stroke width 1.5, 16px in controls, 14px in meta.

## Copy
- Plain, short, simple English. Sentence case. No em-dashes or en-dashes. No jokes, no filler verbs.
- Every state has text: loading (skeletons), empty (how to fill it), error (what happened and what to do).
