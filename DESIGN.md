# no-fomo design rules

**Read:** a personal media library for one power user. Calm, dark-first, the posts are the color. The UI stays quiet.

**Dials:** variance 3, motion 3, density 6.

## Color
- Neutrals: cool gray (hue 250), never pure black or pure white.
- One accent: burnt orange. Light `oklch(0.56 0.17 38)` with near-white text. Dark `oklch(0.74 0.15 52)` with near-black text. Both pass WCAG AA for button text.
- Accent is only for the primary action on a screen and the active filter state. Never for decoration.
- Danger red only for errors.
- Theme follows the system (`prefers-color-scheme`). Both themes are first-class.

## Type
- Geist Variable for UI. Geist Mono Variable for numbers (counts, durations, dates in tables), always `tabular-nums`.
- Sizes: 13px meta, 14px controls, 15px body, 20px sheet titles. No display sizes, this is a tool.

## Shape
- Controls (buttons, inputs, popovers): 8px radius (`rounded-control`).
- Media tiles and thumbnails: 6px radius (`rounded-tile`).
- Avatars: full circle. Nothing else is a pill.

## Layout
- Content max width 1600px, 16px gutter on phone, 24px on desktop.
- Grid tiles are 3:4. Meta text sits under the tile, never on top of the image.
- Group with spacing and single hairlines (`border-line`), not cards.

## Motion
- Only feedback and state change: hover zoom on tiles (1.03), sheet slide-in, button press (scale 0.98).
- Ease `cubic-bezier(0.16, 1, 0.3, 1)`, 200-300ms. Everything off under `prefers-reduced-motion`.

## Icons
- Hugeicons only, stroke width 1.5, 16px in controls, 14px in meta.

## Copy
- Plain, short, simple English. Sentence case. No em-dashes or en-dashes. No jokes, no filler verbs.
- Every state has text: loading (skeletons), empty (how to fill it), error (what happened and what to do).
