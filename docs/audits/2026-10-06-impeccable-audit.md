# Impeccable audit: apps/web (First Light)

Date: 2026-10-06. Branch: `brand-first-light`. Run with `/impeccable audit` after the First Light brand work.

To fix in the next iteration. Each item says where, why it matters and how to fix it. Re-run `/impeccable audit` afterwards.

## Score: 16/20 (Good)

| # | Area | Score | Main issue |
|---|---|---|---|
| 1 | Accessibility | 3/4 | Saved and Reports have no `h1` |
| 2 | Performance | 3/4 | Video player code ships on every page |
| 3 | Responsive | 3/4 | Sideways scroll on the Search tab at 320px |
| 4 | Theming | 4/4 | None |
| 5 | Implementation integrity | 3/4 | Figtree has no Cyrillic, so Russian captions fall back to the system font |

**Integrity verdict: pass.** The UI follows the First Light system. The detector found 0 anti-patterns and 16 advisory notes:
- 9 notes are false positives: 12px Geist Mono numbers, which `DESIGN.md` allows (12 to 13px).
- 7 notes are real: 12px Figtree sublabels and an 11px `kbd` hint, both off the type ramp.

Nothing blocks a task (no P0 or P1). There are 6 P2 and 3 P3 issues.

## Issues

### [P2] Saved and Reports have no page heading
- **Where:** [routes/saved.tsx](../../apps/web/app/routes/saved.tsx) (`<main>` around line 25), [routes/reports.tsx](../../apps/web/app/routes/reports.tsx) (`<main>` around line 36).
- **Why:** Screen-reader users cannot tell which page they are on or jump to the main heading. WCAG 1.3.1 and 2.4.6.
- **Fix:** Add `<h1 className="sr-only">Saved</h1>` and `<h1 className="sr-only">Reports</h1>`, as `routes/home.tsx` already does for Search.
- **Command:** `/impeccable harden`

### [P2] Carousel dots are 6px tap targets
- **Where:** [viewer/carousel.tsx](../../apps/web/app/components/viewer/carousel.tsx), dot buttons around line 101 (`size-1.5`).
- **Why:** The dots are almost impossible to hit on a phone. WCAG 2.5.8 (24px minimum).
- **Fix:** Keep the 6px dot visible, but make the button at least 24×24px, for example a padded button with the dot drawn by a `::before` or a child span.
- **Command:** `/impeccable harden`

### [P2] Sideways scroll on the Search tab at 320px
- **Where:** [setup-steps.tsx](../../apps/web/app/components/setup-steps.tsx), line 5: `apps/extension/.output/chrome-mv3`.
- **Why:** The long path does not wrap, so the page is 327px wide in a 305px view. Measured in an emulated 320px viewport.
- **Fix:** Add `[overflow-wrap:anywhere]` (or `break-all`) to the `<code>` in the setup steps.
- **Command:** `/impeccable adapt`

### [P2] Russian text renders in a different font
- **Where:** [app.css](../../apps/web/app/app.css), `--font-sans` (around line 82). `@fontsource-variable/figtree` ships only `latin` and `latin-ext`.
- **Why:** The owner's library is often Russian (see PRODUCT.md). An `@username` in Figtree next to a Cyrillic caption in the system font looks like two typefaces on one line.
- **Fix:** Add a Cyrillic-capable humanist or geometric sans to the stack after Figtree, close in shape and weight, from Fontsource. Check it in tiles, report text and the viewer. Geist Mono already covers Cyrillic.
- **Command:** `/impeccable typeset`

### [P2] The video player code downloads on every page
- **Where:** `Viewer` is imported statically in `routes/saved.tsx`, `routes/reports.tsx` and `components/home/account-view.tsx`. The build puts `@videojs/react`, Base UI and app code in one shared chunk of about 380KB, before gzip.
- **Why:** Slower first load of every tab. Most visits only browse the grid.
- **Fix:** Load the viewer (or at least `player/`) with `React.lazy` and `Suspense` on the first post open. Keep the brand loading mark as the fallback.
- **Command:** `/impeccable optimize`

### [P2] Weak focus ring on the photo
- **Where:** `SyncNowButton` in [sync-control.tsx](../../apps/web/app/components/sync-control.tsx), shown on the full hero ([empty-hero.tsx](../../apps/web/app/components/empty-hero.tsx)) on desktop.
- **Why:** In light mode the Fern outline (#4F6B3A) sits on dark green ridges with very low contrast. Keyboard users lose focus there. WCAG 2.4.7 and 1.4.11.
- **Fix:** On the photo, use a Cream focus ring (`focus-visible:outline-cream`) for the button. Keep Fern everywhere else.
- **Command:** `/impeccable adapt`

### [P3] Small text sizes off the type ramp
- **Where:** 12px Figtree sublabels in `facet-picker.tsx`, `ui/option-picker.tsx`, `home/following-list.tsx`, `home/profile-search.tsx`, `reports/report-row.tsx` and `sync-control.tsx`; the 11px `Kbd` in `viewer/post-details.tsx`.
- **Why:** Small drift from the documented ramp (13 meta, 14 controls, 15 body).
- **Fix:** Move the text to 13px, or add a 12px "caption" step to `DESIGN.md` if it is intended. Make the `kbd` 12px Geist Mono.
- **Command:** `/impeccable typeset`

### [P3] Reduced motion removes every transition
- **Where:** [app.css](../../apps/web/app/app.css), the global `prefers-reduced-motion` rule (around line 133) sets every duration to `0.01ms`.
- **Why:** Gentle opacity fades that help show state changes (popovers, dialogs, the photo) disappear too. Reduced motion should mean less movement, not no feedback.
- **Fix:** Under reduced motion, remove only transform and translate motion. Keep short opacity and color transitions (about 150ms).
- **Command:** `/impeccable animate`

### [P3] Carousel swipe state is not reset
- **Where:** [viewer/carousel.tsx](../../apps/web/app/components/viewer/carousel.tsx), around line 57: `onPointerDown`/`onPointerUp` with no `onPointerCancel`.
- **Why:** An interrupted swipe leaves a stale start point. This is a small risk, and it is untested on a real touch device. Only layout was checked, in an emulated viewport.
- **Fix:** Add `onPointerCancel={() => (startX.current = null)}`, and consider `touch-action: pan-y` on the swipe surface.
- **Command:** `/impeccable harden`

## Patterns
- 12px Figtree for sublabels repeats in about 6 components: one decision fixes all of them.
- Small tap targets cluster in the post viewer (carousel dots). The rest of the app uses 36px controls, which pass the 24px minimum.

## What works well
- All text pairs pass WCAG AA in both themes. The lowest pair is Lake on Mist at 4.5:1.
- Clear 2px Fern focus rings with an offset on every control.
- Esc and arrow keys never animate. The viewer and the settings dialog close at once on Esc.
- Hover zoom only runs on devices with a real mouse.
- Tile images load lazily and async, with a fixed 3:4 box, so the layout does not jump.
- Colors, radii, shadows and curves come from tokens. The only raw colors are the documented exceptions: the video stage and the photo scrim.
- Every state has text: skeletons, empty states with the brand photo, and errors that say what to do.

## Recommended order
1. **[P2] `/impeccable harden`:** page headings, carousel tap targets, swipe reset.
2. **[P2] `/impeccable typeset`:** Cyrillic fallback font, the 12px and 11px sizes.
3. **[P2] `/impeccable optimize`:** lazy-load the viewer and the player.
4. **[P2] `/impeccable adapt`:** wrap the long path at 320px, a Cream focus ring on the photo.
5. **[P3] `/impeccable animate`:** reduced motion that keeps the fades.
6. `/impeccable polish` as the last pass.
