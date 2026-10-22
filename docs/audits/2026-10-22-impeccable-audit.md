# Impeccable audit: apps/web (First Light)

Date: 2026-10-22. Branch: `impeccable-audit`. Run with `/impeccable audit` before the repo goes public, after the rename to no-fomo-social.

Checked on demo data (`seed`) at 1280px, 375px and 320px, light and dark, in an emulated Chromium viewport: Search, Saved, Reports, the post viewer (Details and Report), the Settings dialog, the author picker, the sync popover and the More menu. The bundled detector did not run (the skill binary is no longer in the repo since commit 8837905), so the integrity notes come from a code scan plus the browser. Touch gestures were not exercised on a real device.

To fix in the next iteration. Each item says where, why it matters and how to fix it. Re-run `/impeccable audit` afterwards.

## Previous audit

All 9 items from [2026-10-06](2026-10-06-impeccable-audit.md) are fixed in the current code (PR #8): page headings, 24px carousel dots, the long path (gone), the Onest Cyrillic fallback, the lazy viewer chunk, the Cream focus ring on the photo, the 12px and 11px sizes, reduced motion that keeps fades, and the swipe reset. None are repeated below.

## Score: 17/20 (Good)

| # | Area | Score | Main issue |
|---|---|---|---|
| 1 | Accessibility | 3/4 | A report puts a second `h1` on the page; "Copied" is not announced |
| 2 | Performance | 3/4 | The banner photo can download at 3840px for a 288px strip |
| 3 | Responsive | 3/4 | On a phone, Close scrolls away with the sheet |
| 4 | Theming | 4/4 | None (one undocumented gradient in the video stage) |
| 5 | Implementation integrity | 3/4 | The extension store link is still a placeholder; pills and blur in the video stage |

**Integrity verdict: pass.** The UI is still one coherent First Light system: every color, radius, shadow and curve comes from the tokens in `app.css`, raw colors stay inside the documented video stage and photo scrim, the type ramp holds (all 12px text is Geist Mono), Outfit appears only in the logo and on the photo, and the dark theme is complete (no text pair measured below 4.5:1 in either theme). The drift is small and local: a few pills and blur panels in the video stage, two popovers that repeat the same search-field markup, and one placeholder link.

Nothing blocks a task (no P0). There is 1 P1, 7 P2 and 7 P3 issues.

## Issues

### [P1] The extension link goes to a placeholder store page
- **Where:** [packages/core/src/constants.ts](../../packages/core/src/constants.ts) line 4: `EXTENSION_STORE_URL` ends in `EXTENSION_STORE_ID`. Shown as step 1 in [setup-steps.tsx](../../apps/web/app/components/setup-steps.tsx) on the Search tab, in the sync popover and on first run. The same placeholder sits in `scripts/install/install.sh`, `install.ps1` and `README.md`.
- **Why:** This is the first action a new user takes, and it opens a 404 on the Chrome Web Store. It makes the first-run flow fail before the app has shown anything. Verified in the browser: the link href is `https://chromewebstore.google.com/detail/EXTENSION_STORE_ID`.
- **Fix:** Put the real store id in once the store accepts the extension. Until then, point the link at the release page or the README section that explains how to load the built extension, so step 1 always works.
- **Command:** `/impeccable harden`

### [P2] A report adds a second `h1` inside the viewer
- **Where:** [app.css](../../apps/web/app/app.css) line 143 styles `.report-md h1`; the markdown in [report-panel.tsx](../../apps/web/app/components/viewer/report-panel.tsx) (around line 185) renders the report title as `h1` and its sections as `h2`.
- **Why:** With the viewer open the outline is `h1 Saved` → `h2 @author` → `h1 report title` → `h2 Summary`. Screen-reader users get two page headings and a section that outranks the sheet it sits in. WCAG 1.3.1.
- **Fix:** Map the report's headings down two levels (title as `h3`, sections as `h4`) in the markdown `components`, and move the `.report-md` sizes to those tags. The visual sizes do not change.
- **Command:** `/impeccable harden`

### [P2] "Copied" and the sync note are not announced or are cut off
- **Where:** [report-panel.tsx](../../apps/web/app/components/viewer/report-panel.tsx) line 171: the Copy button label flips to "Copied" with no live region. [sync-control.tsx](../../apps/web/app/components/sync-control.tsx) line 124: the `role="status"` note is `truncate`, with the full text only in a mouse `title`; [ig-limit.tsx](../../apps/web/app/components/ig-limit.tsx) line 27 does the same.
- **Why:** Keyboard and screen-reader users do not learn that the copy worked, and a long error ("Instagram refused, paused for 15 min…") is clipped on a phone with no way to read the rest. WCAG 4.1.3 and 1.4.10.
- **Fix:** Add a visually hidden `role="status"` span that says "Report copied" when `copied` is true. Let the sync note wrap to two lines (`line-clamp-2`) instead of `truncate`, and drop the `title`.
- **Command:** `/impeccable harden`

### [P2] On a phone, Close scrolls away with the sheet
- **Where:** [viewer.tsx](../../apps/web/app/components/viewer/viewer.tsx) line 66: below `md` the whole dialog is one `overflow-y-auto` column; the header with Previous, Next and Close in [post-details.tsx](../../apps/web/app/components/viewer/post-details.tsx) (around line 50) is static.
- **Why:** Measured at 375px: after scrolling 240px into a report the Close button sits at 362px and keeps moving up; a long report pushes it fully off screen. There is no Esc on a phone, so the only way out is the browser Back button. The keyboard footer is hidden on phones, which is right, but it also means no hint.
- **Fix:** Below `md`, make the sheet header `sticky top-0` with a Paper fill and a hairline, so Close and the post arrows stay reachable. Consider a swipe-down to close on the media stage later.
- **Command:** `/impeccable adapt`

### [P2] The banner photo downloads far larger than it is shown
- **Where:** [empty-hero.tsx](../../apps/web/app/components/empty-hero.tsx) lines 52 to 62: `srcSet` offers 960 to 3840px with `sizes="100vw"` for both the full first-run photo and the 240 to 288px banner.
- **Why:** At 1280px on a 2x screen the browser picks the 2560 or 3840 file (467KB to 915KB) for a strip that is 288px tall. The photo visibly arrives late: in the dark 1280px check it was still the Sage block after 3 seconds. Bundle size is otherwise good (viewer chunk 85KB gzipped, loaded lazily).
- **Fix:** For the banner, cap the candidates at 1600px (or set `sizes` to the real rendered width) and add `fetchpriority="high"` on the Search and Reports empty states, where the photo is the first thing on screen. Keep the full set for the first-run photo.
- **Command:** `/impeccable optimize`

### [P2] Blur, pills and a gradient in the video stage
- **Where:** [carousel.tsx](../../apps/web/app/components/viewer/carousel.tsx) lines 10 and 90: `rounded-full` arrows and counter with `backdrop-blur`. [player-controls.tsx](../../apps/web/app/components/player/player-controls.tsx) line 68: `bg-gradient-to-t from-black/70` backdrop; line 72: the seek track animates `height`; line 76: a default Tailwind `shadow` on the thumb; line 153: `backdrop-blur` on the speed menu.
- **Why:** DESIGN.md says no glass or blur panels, no gradients except the icon and the photo scrim, and nothing is a pill except avatars and small status marks. Backdrop blur over a playing video is also the most expensive effect in the app, and a height transition on the track triggers layout on every hover.
- **Fix:** Use `rounded-control` and a solid `bg-black/60` for the arrows, counter and speed menu (no blur). Keep the controls scrim but record it in DESIGN.md as the third gradient exception, or replace it with a solid `bg-black/50` band. Scale the track with `scale-y` instead of `height`, and use `shadow-pop` or no shadow on the thumb.
- **Command:** `/impeccable polish`

### [P2] Long captions can push the sheet sideways
- **Where:** [post-details.tsx](../../apps/web/app/components/viewer/post-details.tsx) line 82: the caption is `whitespace-pre-wrap` with no `break-words`. `.report-md` already has `overflow-wrap: anywhere` ([app.css](../../apps/web/app/app.css) line 142).
- **Why:** A caption with a long URL or a 40-character hashtag run is wider than the 380px sheet (343px on a phone) and makes the sheet scroll sideways. Not reproducible with the demo captions; verified in code only.
- **Fix:** Add `[overflow-wrap:anywhere]` to the caption paragraph, the same rule the report text uses.
- **Command:** `/impeccable adapt`

### [P2] Two popovers carry the same hand-made search field and row
- **Where:** [facet-picker.tsx](../../apps/web/app/components/facet-picker.tsx) lines 49 to 61 and 87 to 105 vs [ui/option-picker.tsx](../../apps/web/app/components/ui/option-picker.tsx) lines 41 to 53 and 57 to 68. Both search inputs are `h-10` (40px) where the system says 36px. The error and empty sections in `post-grid.tsx`, `routes/reports.tsx` and `home/account-view.tsx` repeat the same `h2 text-[17px] font-semibold` plus button, and the input styling repeats in `search-box.tsx`, `profile-search.tsx` and `settings-dialog.tsx`.
- **Why:** The next change to a popover or an input has to be made in two or three places, and the 40px height is already one drift the copy caused.
- **Fix:** Extract `PopoverSearch`, `PickerRow` and a shared `inputClass` (36px), and a small `StateSection` for error and empty blocks.
- **Command:** `/impeccable distill`

### [P3] Keyboard hint on the phone search field
- **Where:** [search-box.tsx](../../apps/web/app/components/search-box.tsx) line 81: the `/` `kbd` shows at every width.
- **Why:** On a phone there is no `/` key; the badge is noise in a 343px field. Seen at 375px and 320px.
- **Fix:** Hide it where there is no fine pointer: `[@media(hover:none)]:hidden`, the same gate the tile hover zoom uses.
- **Command:** `/impeccable adapt`

### [P3] Small targets on text links and the clear button
- **Where:** [search-box.tsx](../../apps/web/app/components/search-box.tsx) line 76: the clear button is 28px. [sync-control.tsx](../../apps/web/app/components/sync-control.tsx) line 128 "Full check suggested" and [post-grid.tsx](../../apps/web/app/components/post-grid.tsx) line 100 "Try again" are bare underlined text buttons about 20px tall.
- **Why:** The two text buttons are under the 24px minimum (WCAG 2.5.8); the clear button passes 24px but is a frequent action on a phone.
- **Fix:** Give the text buttons `py-2` (or make them ghost buttons), and make the clear button `size-8` with the icon centered.
- **Command:** `/impeccable harden`

### [P3] The Reports search placeholder is clipped at 1280px
- **Where:** [filter-bar.tsx](../../apps/web/app/components/filter-bar.tsx): on Reports the row holds the author picker, two segment switches, the search field and the count in a 900px column, so the field shrinks until "Search keywords" reads "Search keywo".
- **Why:** A clipped placeholder looks broken, in both themes.
- **Fix:** Give the search field `min-w-[200px]` and let the count wrap under the row, or shorten the placeholder to "Search" on Reports.
- **Command:** `/impeccable layout`

### [P3] Heading order on Search after a search
- **Where:** [home/profile-search.tsx](../../apps/web/app/components/home/profile-search.tsx) line 74 renders "All Instagram" as `h3` above the `h2` in [home/following-list.tsx](../../apps/web/app/components/home/following-list.tsx) line 42. The same `h3` uses an `uppercase tracking-wide` style that is not in the type ramp.
- **Why:** The order becomes `h1` → `h3` → `h2`. Small, and only when a search ran. WCAG 1.3.1.
- **Fix:** Make it an `h2` in Meta (13px, Muted), no uppercase.
- **Command:** `/impeccable typeset`

### [P3] Logo accessible name says "no-fomo"
- **Where:** [logo.tsx](../../apps/web/app/components/logo.tsx) lines 19 and 42: `title = "no-fomo"` and `aria-label="no-fomo"` inside the top-bar link that already says "no-fomo-social, go to Search".
- **Why:** The link is announced twice with two different names. The visible wordmark is right ("no-fomo."); the hidden names are not.
- **Fix:** Make the symbol `aria-hidden` inside the link and keep one name on the link.
- **Command:** `/impeccable clarify`

### [P3] A spinner in the player
- **Where:** [player/player.tsx](../../apps/web/app/components/player/player.tsx) line 47: `animate-spin` while the video buffers.
- **Why:** DESIGN.md says no spinners; the brand loading mark is the one loading signal.
- **Fix:** Use `<LogoSymbol loading />` in Cream on the stage, as the sync button does.
- **Command:** `/impeccable polish`

### [P3] Tiles re-render on every list tick
- **Where:** [post-grid.tsx](../../apps/web/app/components/post-grid.tsx) lines 88 to 92: `PostTile` is not memoized; [home/account-view.tsx](../../apps/web/app/components/home/account-view.tsx) line 99 builds new item objects on each render.
- **Why:** Every fetch state change re-renders up to 126 tiles. Not visible on the demo library; it will matter at a few thousand posts.
- **Fix:** Wrap `PostTile` in `memo` and build the marked list with `useMemo`.
- **Command:** `/impeccable optimize`

## Patterns
- Video-stage chrome is where the system drifts: pills, blur, a gradient and a default shadow all sit in `carousel.tsx` and `player-controls.tsx`. One pass fixes them together.
- Hand-copied controls: the popover search field, the picker row, the input style and the error block each exist two or three times. Extract once, and the 40px input drift goes away with it.
- Status feedback is strong on the page (live count, sync note, limit banner) but weak inside the viewer (copy, loading).

## What works well
- Every text pair measured in the browser passes 4.5:1 in both themes, on the page and inside the viewer.
- No sideways scroll on any tab at 375px or 320px; the filter row wraps cleanly and the grid drops to 2 columns.
- Tiles have full accessible names ("Video by @reels.lab, 0:15, has a report"), decorative `alt=""`, lazy and async images in a fixed 3:4 box, and the hover zoom is gated to real mice.
- Focus returns to the opened tile when the viewer closes; Esc closes the viewer, menus and dialogs at once; arrow keys move between posts with no animation.
- The viewer, player and markdown renderer live in one lazy chunk (85KB gzipped) and prefetch on idle, so the first paint of every tab stays small.
- Reduced motion keeps opacity and color fades and stops only transforms; the brand loading mark stands still.
- Theming is complete: tokens flip in `app.css` and both `theme-color` values are set; the only raw colors are the documented video stage and photo scrim.
- Tabs reserve the bold width, so the top bar never shifts; the active state is fill plus weight plus `aria-selected`, not color alone.

## Recommended order
1. **[P1] `/impeccable harden`:** the store link, the report heading levels, "Copied" and the sync note, the small text buttons.
2. **[P2] `/impeccable adapt`:** sticky sheet header on phones, caption wrapping, hide the `/` hint on touch.
3. **[P2] `/impeccable optimize`:** cap the banner photo size and prioritize it; memoize tiles.
4. **[P2] `/impeccable distill`:** extract the popover search, picker row, input style and state section.
5. **[P3] `/impeccable layout` and `/impeccable typeset`:** the Reports search width, the Search heading.
6. `/impeccable polish` as the last pass: the video-stage pills, blur, gradient, shadow and spinner.
