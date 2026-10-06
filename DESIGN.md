---
name: no-fomo
description: A calm personal library for saved Instagram posts. Brand "First Light".
colors:
  mist: "#F6F7F3"
  surface: "#EDF0E8"
  surface-2: "#E4E8DE"
  paper: "#FDFDFB"
  line: "#E2E5DC"
  forest: "#1E2A22"
  muted: "#5C685E"
  fern: "#4F6B3A"
  accent-ink: "#FDFDFB"
  accent-soft: "#E3EBDC"
  accent-line: "#B9CBA8"
  sage: "#8EA796"
  lake: "#3D7891"
  dawn: "#F3E6C4"
  cream: "#F4EEDC"
  danger: "#A63D2F"
  evening-bg: "#141A16"
  evening-surface: "#1C241F"
  evening-surface-2: "#232D26"
  evening-paper: "#1A211C"
  evening-line: "#2A332D"
  evening-text: "#EEF0E8"
  evening-muted: "#9AA595"
  evening-fern: "#A3B98C"
  evening-accent-ink: "#16200F"
  evening-accent-soft: "#2A3726"
  evening-accent-line: "#4E6440"
  evening-lake: "#7FB3C8"
  evening-dawn: "#E9D9AE"
  evening-danger: "#E58A76"
typography:
  display:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  section:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  meta:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  numeric:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  wordmark:
    fontFamily: "Outfit Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    letterSpacing: "-0.02em"
rounded:
  tile: "4px"
  control: "6px"
  sheet: "8px"
  icon: "22%"
  avatar: "9999px"
spacing:
  gutter-phone: "16px"
  gutter-desktop: "24px"
  grid-gap-x-phone: "12px"
  grid-gap-x-desktop: "20px"
  grid-gap-y: "24px"
  grid-gap-y-desktop: "32px"
  top-bar: "64px"
  content-max: "1600px"
components:
  button-primary:
    backgroundColor: "{colors.fern}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest}"
  button-icon:
    rounded: "{rounded.control}"
    size: "36px"
  tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  tab-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.forest}"
  chip-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    height: "36px"
  input-search-focus:
    backgroundColor: "{colors.paper}"
  tile:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.tile}"
  sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    width: "380px"
  popover:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.control}"
---

# Design System: no-fomo

**Brand:** First Light. The full guide, logo files, photographs and the token source live in `docs/brand/first-light/`. If this file and the brand guide ever disagree, the guide wins.

## Overview

**Creative North Star: "First Light"**

A star rises over a calm horizon at first light. The horizon is the calm overview of everything the user saved; the star is the one post they need, found again. Nothing is lost, so there is nothing to fear missing. The app is a calm personal library for professionals: light first, crisp, quiet. Nature lives in the colors, the logo and one photograph, never behind the work. The posts are the color; the interface stays out of their way.

Density is medium (dial 5), variance is low (dial 3), motion is calm and quick (dial 4). Hierarchy comes from space and single hairlines, not from cards, shadows or color. Fern green is rare on purpose, so the one main action on a screen is always obvious. A dark "evening" theme of deep forest green-black follows the system setting and is as complete as the light one.

**Key Characteristics:**
- Light first, with a first-class dark "evening" theme that follows the system.
- Near-white mist surfaces with a hint of green; never pure white or pure black.
- One accent (Fern) for the main action and active states only.
- Small, crisp corners: 6px controls, 4px media, 8px sheets.
- Big 3:4 tiles with author, duration and caption below the image, never on it.
- One brand photograph, only in empty and first-run states.
- Motion gives feedback or shows a change of state, and nothing else.

## Colors

A calm, nature-tinted neutral palette (mist, paper, forest) with a single Fern green accent and a few rare brand tones. All values are tokens in `apps/web/app/app.css` (source `docs/brand/first-light/tokens.css`); components never use raw hex. Light values are listed first; the `evening-*` keys are the same roles in the dark theme.

### Primary
- **Fern** (light and evening values above): the primary button, focus rings, the progress fill, and the tick on a chosen option. Text on Fern is **Accent Ink**.
- **Soft Fern** (`accent-soft`): the fill of an active tab, an active filter chip and text selection.
- **Fern Edge** (`accent-line`): the edge of an active filter chip and the hover hint on the search field.

### Secondary
- **Lake**: links inside report text only, and info.
- **Sage**: secondary nature tone for illustration and charts; also the solid color behind the brand photo while it loads, and active marks on video controls.

### Tertiary
- **Dawn**: a rare warm highlight (a new badge, a search hit mark). Use sparingly.
- **Cream**: text and marks on the brand photograph only.

### Neutral
- **Mist** (`bg`): the page background.
- **Surface** and **Surface 2**: hover fill, input fill and skeletons; pressed fill and empty media.
- **Paper**: sheets, popovers, menus and dialogs, one step lighter than the page.
- **Line**: hairlines and borders.
- **Forest** (`text`): main text, 13.8:1 on Mist.
- **Muted**: secondary text, 5.1:1 on Surface at its lowest.
- **Danger**: errors only.

### Named Rules
**The Rare Fern Rule.** Fern is used only for the main action on a screen and for active states. It is never decoration, never a background block, never an underline.

**The Soft Active Rule.** Active tabs and active filter chips use the Soft Fern fill with Forest text (chips add the Fern Edge). There are no underlines and no sliding indicators.

**The No Gradient Rule.** No gradients in the interface. The only exceptions are the Dawn app icon and the soft dark scrim that keeps cream text readable on the photograph.

**The No Extremes Rule.** Never pure white or pure black in the interface. (The video stage stays black around the media, because it frames video.)

Every text pair passes WCAG AA in both themes. The lowest pairs are Muted on Surface (5.1:1) and Lake on Mist (4.5:1).

## Typography

**Display Font:** Outfit (with ui-sans-serif, system-ui)
**Body Font:** Figtree (with ui-sans-serif, system-ui)
**Numeric Font:** Geist Mono

**Character:** Outfit at weight 800 to 900 is round, heavy and friendly, the voice of the logo and the photograph. Figtree is its quiet, geometric working partner. Geist Mono keeps every number in a calm, aligned column.

### Hierarchy
- **Wordmark** (900, 22px in the top bar, -2% tracking): the `no-fomo.` logo only, always lowercase with the period.
- **Display** (800, 40px desktop and 28px phone, line height 1.1): the first-run title on the brand photo.
- **Headline** (800, 28px, line height 1.1): empty-state titles on the photo banner.
- **Title** (Figtree 600, 20px): sheet and dialog titles.
- **Section** (Figtree 600, 17px): section headings and error or empty headings inside the working UI.
- **Body** (Figtree 400, 15px, line height 1.6): captions, report text, explanations. Keep lines to about 60ch.
- **Label** (Figtree 500, 14px): buttons, tabs, inputs, menu rows.
- **Meta** (Figtree 400, 13px): author, captions under tiles, status notes.
- **Numeric** (Geist Mono 400, 12 to 13px, tabular numbers): counts, durations, dates in tables, keyboard hints.

### Named Rules
**The Display Is Rare Rule.** Outfit is only for the logo, the hero and empty-state titles. Never for body text, controls or headings in the working UI.

**The Tabular Numbers Rule.** Every number that can change or line up (counts, durations, dates) is Geist Mono with tabular numbers.

## Layout

Content is centered with a 1600px maximum width and a 16px gutter on phone, 24px from 768px. Reports and Home use narrower columns (900px and 1100px) for reading.

The top bar is 64px tall on desktop with a hairline at the bottom: the logo on the left (it links to Home), the tabs Home, Saved and Reports centered, and Settings and Sync on the right. The tabs stay in the same spot on every page. On a phone the tabs take a second, centered row. Search lives in the filter row of Saved and Reports, first in the row (`/` focuses it, placeholder "Search keywords").

The Saved grid uses large 3:4 tiles: 2 columns on phone, 3 from 640px, 4 from 1024px, 5 from 1280px and 6 from 1680px. Column gaps grow from 12px to 20px; row gaps from 24px to 32px. Under each tile: author and duration on one line, then the first line of the caption.

The post viewer fills the screen: media on the left, a 380px paper sheet on the right with details and the report. On a phone the media sits on top and the details follow below.

Group with space and single hairlines, not cards.

## Elevation & Depth

The system is flat and tonal. Depth comes from the step between Mist, Surface and Paper, and from hairlines. One shadow exists, `shadow-pop`, only for things that float above the page: popovers, menus, dialogs and the viewer sheet. In light it is a soft green-tinted drop (`0 1px 2px rgb(30 42 34 / 0.06), 0 12px 32px rgb(30 42 34 / 0.1)`); in the evening theme it is deeper (`0 1px 2px rgb(0 0 0 / 0.4), 0 16px 40px rgb(0 0 0 / 0.45)`). Behind dialogs sits the scrim.

### Named Rules
**The Flat At Rest Rule.** Nothing on the page itself has a shadow. A shadow means "this floats above the page" and nothing else. No glass, no blur panels.

## Shapes

Corners are small and crisp: controls 6px (buttons, inputs, tabs, chips, popovers), media 4px (thumbnails, video, rows inside menus, segment buttons), sheets and dialogs 8px. Avatars are circles. Nothing else is a pill. The app icon is a squircle (22%).

The logo symbol is a four-point star with soft concave sides, rising over a thin horizon arc that is thickest in the middle. The arc lives only inside the logo and the loading mark; it is never a UI decoration or underline.

## Components

### Buttons
Quiet and responsive; they press back.
- **Shape:** 6px corners, 36px tall, label 14px weight 500, Hugeicons at 16px with stroke 1.5.
- **Primary:** Fern fill with Accent Ink text. One per screen at most, for the main action.
- **Secondary:** a Line border on transparent with Forest text; Surface fill on hover, Surface 2 when pressed.
- **Ghost:** Muted text only; Surface fill and Forest text on hover.
- **Icon:** 36px square, ghost style.
- **Press:** every pressable scales to 0.97 in 160ms with the soft ease-out curve. Tiles scale to 0.98.
- **Focus:** a 2px Fern outline, 2px offset, in both themes.
- **Disabled:** half opacity, except the Sync button while it syncs, which stays full and shows the loading mark.

### Tabs
- **Style:** Muted text, 6px corners, 36px tall. Hover gives a Surface fill.
- **Active:** Soft Fern fill, Forest text, weight 600. The bold width is reserved, so neighbours never shift. Color and fill change in 150ms; nothing slides.
- **Used in:** the top bar (Home, Saved, Reports) and the viewer sheet (Details, Report).

### Chips and Filters
- **Filter picker:** a secondary button that opens a searchable popover. When a value is chosen it turns into an active chip: Soft Fern fill, Fern Edge border, Forest text, with its own remove control joined to its right side.
- **Segment switch** (post type, report source): a Line-bordered group. "All" is the quiet default with a Surface fill when chosen; any other chosen value uses the active-chip look.

### Inputs / Fields
- **Style:** Surface fill, Line border, 6px corners, 36px tall (44px for the Home account search), Muted placeholder.
- **Focus:** the fill turns Paper, the border turns Fern Edge, plus the 2px Fern focus ring.
- **Search:** a `/` key hint sits at the right until the field has focus; Esc clears or leaves it.

### Popovers and Menus
- **Style:** Paper with a Line border, 6px corners and `shadow-pop`. Rows are 4px with a Surface hover.
- **Motion:** they grow from their trigger: scale 0.97 plus fade to full, 150ms ease-out, never from scale 0.

### Tiles
- **Shape:** 3:4, 4px corners, Surface 2 behind the image while it loads.
- **Hover:** the image zooms to 1.03 over 250ms, only on devices with a real mouse.
- **Caption:** author (13px) and duration (Geist Mono) on one line, the caption's first line below in Muted. Never text on top of the image.
- **Report tick:** a post with a report shows a small solid Fern circle with a check at the far right of the author line. Its tooltip says it has a report. Tooltips share one delay, so after the first one the next open at once.
- **Loading:** Surface skeletons with a gentle pulse. No spinners.
- **First appearance:** the first 12 tiles rise in once (8px, 300ms, 40ms apart). Later pages, searches and filters appear at once.

### Sheet (post viewer)
- **Style:** Paper with 8px corners on the open side, `shadow-pop`, a hairline on its edge. Video controls sit on the dark media stage.
- **Motion:** the sheet slides in from the right (from below on a phone) in 300ms on the drawer curve (`cubic-bezier(0.32, 0.72, 0, 1)`) and leaves in 200ms. Esc closes it at once, with no animation. Arrow keys move between posts with no animation.
- **Report actions:** one row above the report: Download .md (primary), Copy (secondary), and a More menu on the far right with Analyze again and Delete report. Delete asks once, in a row under the actions. A hairline separates the actions from the report.
- **Report text:** Figtree 15px, headings Figtree 600, links in Lake.

### Brand Loading Mark
The logo symbol with the star rising over the arc and resting (`<LogoSymbol loading />`). Used while a sync runs and while a report is being made. It is still under reduced motion.

### Empty States and the Photograph
- **First run** (Saved with nothing synced): the full photograph of misty ridges with the word and star in it. The title in Outfit 800 and the setup steps sit bottom-left on the dark ridges in Cream, with the Fern Sync button. Below 768px the portrait version is used: it keeps its 3:4 shape with the title on it, and the steps follow below it on the page.
- **Banner** (Home with no accounts, Reports with no reports): the clean photograph as a 240 to 288px banner with the heading in Cream on it, then one Muted line and one Fern button below when there is an action.
- **Loading:** a Sage color sits behind the photo, and it fades in once over 400ms. A photo already in the cache is simply there.
- **Never** behind the grid, inside sheets, menus or the player.

### Errors
Danger text with a short sentence: what happened and what to do.

## Do's and Don'ts

### Do:
- **Do** use the tokens in `apps/web/app/app.css` for every color, radius, shadow and curve.
- **Do** keep Fern for the main action on a screen and for active states.
- **Do** show active tabs and chips with the Soft Fern fill and Forest text.
- **Do** use Lake only for links inside report text, and Danger only for errors.
- **Do** use Outfit 800 to 900 only for the logo, empty-state titles and the hero; Figtree for everything else; Geist Mono with tabular numbers for numbers.
- **Do** keep corners at 6px for controls, 4px for media and 8px for sheets; circles only for avatars.
- **Do** keep tiles 3:4 with author, duration and caption below the image.
- **Do** use the horizontal lockup (`<LogoLockup />`) in the top bar, and the small symbol below 24px.
- **Do** keep the top bar the same on every page: logo left, tabs centered, actions right. Page tools like search go in the page's filter row.
- **Do** keep every animation under 300ms (the photo fade is 400ms), on ease-out curves, from scale 0.97 or more, and still under reduced motion.
- **Do** gate hover motion behind a real mouse (`hover: hover` and `pointer: fine`).
- **Do** use Hugeicons only, stroke 1.5, 16px in controls and 14px in meta.
- **Do** give every state text: skeletons while loading, how to fill it when empty, what happened and what to do on error.
- **Do** write plain, short, simple English in sentence case.

### Don't:
- **Don't** use raw hex in components.
- **Don't** use Fern as decoration, or underlines for active states.
- **Don't** use gradients in the interface, glass effects, or pure white and pure black.
- **Don't** use Outfit for body text or controls.
- **Don't** make anything a pill except avatars.
- **Don't** put text on top of tile images.
- **Don't** put the photograph behind the grid, in sheets, in menus or in the player.
- **Don't** rotate, stretch, shadow, outline or recolor the logo outside the palette, and don't use the arc as an underline or decoration.
- **Don't** animate keyboard actions: arrow keys between posts, `/` to search, Esc.
- **Don't** use spinners for content; use skeletons. Syncs and reports use the brand loading mark.
- **Don't** use em dashes or en dashes in copy, jokes or filler.
- **Don't** repeat the brand lines ("Every save, in its place.", "Saved posts, kept calm.") inside the working interface.
