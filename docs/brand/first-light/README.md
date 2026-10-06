# First Light

The no-fomo brand identity. Approved by the owner on 2026-10-06.

**Idea.** A star rises over a calm horizon at first light. The horizon is the calm overview of everything you saved. The star is the one saved post you need, found again. Nothing is lost, so there is nothing to fear missing.

**Feeling.** Peace, quiet, beauty, nature. But no-fomo is still a tool for professionals: the interface stays crisp, light and calm. Nature lives in the colors, the logo and one photograph. It never sits behind the work.

Start with [boards/01-brand-board.jpg](boards/01-brand-board.jpg).

---

## Folder map

| Path | What it is |
| --- | --- |
| `boards/01-brand-board.jpg` | The approved brand board |
| `boards/02-logo-sheet.jpg` | Logo in all versions, including the three app icons |
| `boards/03-empty-screen.jpg` | Target look for the empty state with the hero photo |
| `boards/04-app-light.jpg`, `05-app-dark.jpg` | Target look for the main screens, light and dark |
| `images/` | The hero photo: with the word (`hero-wide`), without any text (`hero-clean`), phone version (`hero-portrait`). WebP in several widths, plus one full-size JPG master each |
| `logo/svg/` | Every logo file as SVG (source of truth) |
| `logo/png/` | App icons, extension icons, favicon and lockups as PNG |
| `logo/build_logo.py` | Script that generated the SVGs (needs `fonttools`, `uharfbuzz` and the Outfit variable TTF in `logo/fonts/`) |
| `tokens.css` | Drop-in replacement for the token part of `apps/web/app/app.css` |
| `Logo.tsx` | React logo components to copy into `apps/web/app/components/` |
| `design-rules.md` | Replacement for the root `DESIGN.md` |
| `references/` | The owner's inspiration posters and the chosen logo sketch. Inspiration only, never copy them |

The boards were made with an image generator. Use them for the look and feel only. Their small mistakes are not the spec: some chips repeat, logos differ a little between screens, some letters are not perfect. **This README, `tokens.css` and `logo/svg/` are the spec.**

---

## Logo

The symbol is a four-point star with soft, concave sides, rising just above a thin horizon arc. The arc is thickest in the middle and thins toward the ends. The wordmark `no-fomo.` is Outfit at weight 900, lowercase, with the period, letter spacing -2%.

| File | Use |
| --- | --- |
| `lockup-horizontal-light.svg` | Default. Top bar, documents, README header on light backgrounds |
| `lockup-horizontal-dark.svg` | The same on dark backgrounds |
| `lockup-horizontal-mono-cream.svg` | On the hero photo |
| `lockup-stacked-light.svg`, `lockup-stacked-cream.svg` | Square spaces, splash, social images |
| `symbol-regular-*.svg` | Symbol alone at 24px and larger |
| `symbol-small-*.svg` | Symbol alone below 24px. It has a thicker arc and a fuller star so it stays clear |
| `*-currentcolor.svg` | Inline use where color comes from CSS |
| `app-icon-fern.svg` | Main app icon (Fern background, cream symbol) |
| `app-icon-forest.svg` | Dark app icon |
| `app-icon-dawn.svg` | Dawn gradient app icon (deep teal to pale sage), the owner's favorite for special places |
| `favicon.svg`, `png/favicon-32.png` | Browser tab |
| `png/extension-icon-16/32/48/128.png` | Chrome extension (16 and 32 use the small symbol) |

**Colors.** On light: symbol Fern `#4F6B3A`, wordmark Forest `#1E2A22`. On dark: symbol light Fern `#A3B98C`, wordmark Cream `#F4EEDC`. On the photo: everything Cream.

**Clear space.** Keep empty space around the logo equal to the star's height.

**Minimum size.** Horizontal lockup 96px wide. Symbol 16px tall (small version).

**Never:** rotate or stretch it, add shadows or outlines, put it on busy parts of the photo, recolor it outside the palette, or use the arc as an underline or decoration in the UI. The arc lives only inside the logo and the loading mark.

---

## Color

Light first, with a calm dark "evening" version. Both are first-class and follow the system setting.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `bg` (Mist) | `#F6F7F3` | `#141A16` | Page background |
| `surface` | `#EDF0E8` | `#1C241F` | Hover fill, input fill, skeletons |
| `surface-2` | `#E4E8DE` | `#232D26` | Pressed fill |
| `paper` (Paper) | `#FDFDFB` | `#1A211C` | Sheets, popovers, menus |
| `line` (Line) | `#E2E5DC` | `#2A332D` | Hairlines, borders |
| `text` (Forest) | `#1E2A22` | `#EEF0E8` | Main text |
| `muted` | `#5C685E` | `#9AA595` | Secondary text |
| `accent` (Fern) | `#4F6B3A` | `#A3B98C` | Primary button, focus, active state |
| `accent-ink` | `#FDFDFB` | `#16200F` | Text on accent |
| `accent-soft` | `#E3EBDC` | `#2A3726` | Active tab, active chip, selection |
| `accent-line` | `#B9CBA8` | `#4E6440` | Edge of active chip, focus halo |
| `sage` (Sage) | `#8EA796` | `#8EA796` | Secondary nature tone, charts |
| `lake` (Lake) | `#3D7891` | `#7FB3C8` | Links inside report text, info |
| `dawn` (Dawn) | `#F3E6C4` | `#E9D9AE` | Rare warm highlight |
| `cream` | `#F4EEDC` | `#F4EEDC` | Text and logo on the photo |
| `danger` | `#A63D2F` | `#E58A76` | Errors only |

Every text pair passes WCAG AA. The lowest ones are muted on surface (5.1:1) and lake on bg (4.6:1).

**Rules**
- Fern is used only for the main action on a screen and for active states. It is never decoration.
- Active tabs and active filter chips use a soft fill (`accent-soft`) with `text` color. No underlines.
- No gradients in the interface. The only gradient is the Dawn app icon.
- Never pure white or pure black.

---

## Typography

| Role | Font | Weight | Size |
| --- | --- | --- | --- |
| Logo, hero, empty-state titles | Outfit (`font-display`) | 800 to 900 | 28 to 40px (hero word is in the photo) |
| Sheet titles | Figtree | 600 | 20px |
| Body | Figtree | 400 | 15px, line height 1.6 |
| Controls | Figtree | 500 | 14px |
| Meta (author, captions) | Figtree | 400 | 13px |
| Numbers (counts, durations, dates) | Geist Mono, `tabular-nums` | 400 | 12 to 13px |

**Why Figtree.** The board shows Satoshi for the interface. Satoshi comes from Fontshare and cannot be installed as a package or safely shipped in this open repo. Figtree is its closest open twin: geometric, round and friendly, under the OFL license, and it installs like the current Geist (`@fontsource-variable/figtree`). Outfit (`@fontsource-variable/outfit`) is also OFL.

Outfit is only for the logo and a few big titles. Never use it for body text or controls.

---

## Shape and layout

- Corners: controls 6px (buttons, inputs, tabs, chips, popovers), media 4px (thumbnails, video), sheets and dialogs 8px. App icon is a squircle (22%). Nothing is a full pill except avatars (circles).
- Group with space and single hairlines, not cards.
- Content max width 1600px. Gutter 16px on phone, 24px on desktop.
- **Bigger grid tiles.** Tiles stay 3:4. Columns: 2 on phone, 3 from 640px, 4 from 1024px, 5 from 1280px, 6 from 1680px. This replaces today's 7 to 8 columns.
- Under each tile: author and duration on one line (duration in mono), the caption's first line below. Never text on top of the image.

---

## The photograph

Misty green ridges fading to one long horizon at first light, film grain, and the cream word `no-fomo.` rising behind the farthest ridge with the star above.

| File | Use |
| --- | --- |
| `hero-wide-*.webp` | Desktop and tablet empty states (16:9) |
| `hero-portrait-*.webp` | Phone, below 768px (3:4) |
| `hero-clean-*.webp` | Same scene with no word and no star. Use for smaller banners where a heading in code sits on top |

**Where it appears**
- Full screen in the first-run state and the Saved empty state (nothing synced yet). Text and the Sync button go bottom-left, on the dark ridges, in Cream. The button is Fern.
- As a calm banner (240 to 320px tall, `hero-clean`, `object-position: center 40%`) on other empty states: Home with no accounts, Reports with no reports.
- Never behind the grid, inside sheets, menus or the player.

**How to load it.** Use `<picture>` with a WebP `srcset` (960, 1600, 2560, 3840 wide; portrait 828, 1440, 2480), `sizes="100vw"`, `object-fit: cover`. Set a solid `bg` color behind it so there is no flash. Fade it in once (opacity 0 to 1, 400ms ease-out). Add `alt=""` because the image is decorative. The heading text lives in HTML for screen readers.

**Readability.** The text area bottom-left is already dark. If text grows, add a soft scrim behind it: `linear-gradient(to top, rgb(20 28 22 / 0.55), transparent 60%)`.

---

## Motion

Calm and quick. Every animation must give feedback or show a change of state. Based on Emil Kowalski's rules.

| What | How |
| --- | --- |
| Button press | `scale(0.97)`, 160ms `--ease-out-soft` |
| Tile hover | image `scale(1.03)`, 250ms, only under `@media (hover: hover) and (pointer: fine)` |
| Tab and chip change | color and fill 150ms ease. No sliding indicator |
| Sheet open | slide in 300ms `--ease-drawer`; close 200ms |
| Popover and menu | `scale(0.97)` plus fade to full, 150ms, from the trigger (`transform-origin`) |
| Hero photo | fade in once, 400ms |
| Sync and loading | brand loading mark: `<LogoSymbol loading />`, the star rises over the arc and rests (`.fl-loading-star` in `tokens.css`) |
| Content loading | skeletons in `surface`, no spinners |

Never animate keyboard actions (arrow keys between posts, `/` to search, Esc). Never start from `scale(0)`. Everything above becomes still under `prefers-reduced-motion`.

---

## Components

- **Top bar:** horizontal logo on the left (`<LogoLockup />`), then search (`/` focuses it), then tabs Home, Saved, Reports, then the Sync button on the right. Height 64px, `bg` background, hairline at the bottom.
- **Buttons:** Primary is Fern fill with `accent-ink` text. Secondary is a `line` border on transparent with `text`. Ghost is text only with a `surface` hover. Icon buttons are 36px squares. Height 36px, 6px corners.
- **Tabs:** text in `muted`. Active tab is `accent-soft` fill, `text` color, weight 600, 6px corners. No underline.
- **Filter chips:** `line` border, 6px corners. Active chip has `accent-soft` fill and an `accent-line` border, with its own remove control.
- **Search and inputs:** `surface` fill or `line` border, 6px corners, Fern focus ring (2px, offset 2px).
- **Tiles:** 3:4, 4px corners, caption below as described above.
- **Sheet (post viewer):** `paper` background, 8px corners on the open side, `shadow-pop`, scrim behind. Tabs Post and Report use the tab style above.
- **Report text:** Figtree 15px. Headings Figtree 600. Links in `lake`. Copy and Download are secondary and primary buttons.
- **Empty states:** the photo as described above, a short title in Outfit 800, one line of `muted` text, one Fern button.
- **Errors:** `danger` text with a short sentence: what happened and what to do.

Icons stay Hugeicons, stroke 1.5, 16px in controls and 14px in meta.

---

## Copy

Plain, short, simple English. Sentence case. No dashes as punctuation. No jokes, no filler.

Brand lines: "Every save, in its place." and "Saved posts, kept calm." Use them only in the first-run state or marketing, never repeated inside the working interface.

---

## Implementation checklist (next session)

Do it in this order and check each step in the running app (`pnpm start`, http://localhost:4747), in light and dark mode, at phone and desktop width.

0. **Design rules first.** Replace the root `DESIGN.md` with `design-rules.md` before any UI work. Impeccable and other design skills read `DESIGN.md`, so the old rules (dark-first, burnt orange) must be gone first.
1. **Fonts.** Add `@fontsource-variable/outfit` and `@fontsource-variable/figtree` to `apps/web`, import them in `root.tsx`, and remove Geist Sans. Keep Geist Mono.
2. **Tokens.** Replace the token part of `apps/web/app/app.css` with `tokens.css`. Keep the rest of that file (`html`, `::selection`, `body`, reduced motion, `.report-md`) and change `.report-md a` to use `lake`.
3. **Radii.** Every `rounded-control` becomes 6px and every `rounded-tile` 4px through the tokens. Check `components/ui/button.tsx` and anything that uses `rounded-md`, `rounded-lg` or `rounded-full` directly.
4. **Logo.** Copy `Logo.tsx` into `components/`, then use `<LogoLockup />` in `top-bar.tsx`.
5. **Tabs and chips.** Update `nav-tabs.tsx`, `facet-picker.tsx`, `kind-switch.tsx` and `source-switch.tsx` to the soft-fill active style.
6. **Grid.** In `post-grid.tsx`, change the `GRID` columns to 2, 3 (`sm`), 4 (`lg`), 5 (`xl`), 6 (from 1680px).
7. **Photo.** Copy `images/*.webp` into `apps/web/public/brand/`, build an `EmptyHero` component, and use it in `routes/saved.tsx` (no posts yet), the Home empty state and the Reports empty state.
8. **Loading.** Use `<LogoSymbol loading />` in `sync-control.tsx` while a sync runs.
9. **Favicon and title.** Copy `logo/svg/favicon.svg`, `logo/png/favicon-32.png` and `logo/png/app-icon-fern-180.png` (as `apple-touch-icon.png`) into `apps/web/public/`, and add the `<link>` tags in `root.tsx`.
10. **Extension icons.** Copy `logo/png/extension-icon-{16,32,48,128}.png` to `apps/extension/public/icon/{16,32,48,128}.png`. WXT adds them to the manifest automatically. Rebuild with `pnpm ext:build`.
11. **Regenerate DESIGN.md.** Run `/impeccable document` so `DESIGN.md` is rebuilt in Impeccable's format (YAML tokens plus sections) from the shipped code. Check that it keeps every rule from `design-rules.md`.
12. **Polish pass.** Press states, hover states (hover devices only), focus rings, reduced motion, and contrast in both themes.
