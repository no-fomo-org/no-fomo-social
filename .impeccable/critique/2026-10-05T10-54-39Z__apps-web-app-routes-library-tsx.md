---
target: apps/web
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/evgeniivaniukov/Development/no-fomo/apps/web/app/routes/library.tsx"
target_fingerprint: "sha256:f6c441ac001141604a2ebcab2c12f43fa6bfa4172424fffa7bc113dd6be5e9e3"
target_path: /Users/evgeniivaniukov/Development/no-fomo/apps/web/app/routes/library.tsx
timestamp: 2026-10-05T10-54-39Z
slug: apps-web-app-routes-library-tsx
closed: true
---
⚠️ DEGRADED: single-context (sub-agents only on explicit user request in this session)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Sync status, counts and skeletons clear; active filters hard to see |
| 2 | Match System / Real World | 3 | Plain words; "Unnamed collection / Number ending 1234" weak |
| 3 | User Control and Freedom | 3 | Clear filters, Escape work; Back does not undo filter changes |
| 4 | Consistency and Standards | 3 | Active states differ between pickers and type switch |
| 5 | Error Prevention | 3 | Sync locked while running; no destructive actions yet |
| 6 | Recognition Rather Than Recall | 2 | Must remember the author to find a post; captions hidden |
| 7 | Flexibility and Efficiency | 1 | No search, no sort, no keyboard movement between posts |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, clean; big tiles with little information |
| 9 | Error Recovery | 3 | Errors say what happened and what to do |
| 10 | Help and Documentation | 2 | Setup steps only |
| Total | | 26/40 | Acceptable |

## Design Specificity Verdict
Clean but category-interchangeable: reads as any photo library. Nothing expresses "saved to learn later": tiles show only author and length, no time, no rediscovery. Detector: 0 code findings; live page flagged image-hover-transform (sanctioned by DESIGN.md, false positive). Detector missed the squeezed close icon (found by measurement).

## Priority Issues
1. [P1] No way to find a post by what it is about. Fix: one search box over caption, hashtags, author, music (FTS now, semantic later in same box) + one-line caption under tiles. Command: /impeccable shape search
2. [P1] Sheet close icon squeezed to 8px: buttonClass adds px-0 next to px-3.5 and px-3.5 wins. Fix: tailwind-merge, icon-button variant, shrink-0 on icons. Command: /impeccable polish
3. [P2] Active filters too quiet (accent/60 border, nearly invisible in light). Fix: tinted fill + value + remove control. Command: /impeccable colorize
4. [P2] Post sheet is a dead end: no prev/next, no shortcuts, primary action leaves app. Fix: arrow keys in sheet, "/" for search, shortcut hints. Command: /impeccable harden
5. [P2] ~12 posts per desktop screen. Fix: 7-8 columns or density switch; caption line under tiles. Command: /impeccable layout

## Persona Red Flags
- Alex: no search, no "/" shortcut, no prev/next in sheet, no sort.
- Sam: good tile labels and focus rings; 8px close glyph; buttons inside role=option; filter changes not announced.
- Mira (heavy saver): cannot find a reel by topic without remembering the author; sync end has no "12 new posts" moment.

## Minor Observations
- No sync completion summary.
- External-link arrow glyph tiny inside 16px box.
- Filter changes use history replace; Back skips them.
- Phone: filters take three rows before content.

## Questions to Consider
- What if the grid showed what each post is about, not just who posted it?
- Default view: newest saved, or saved long ago and never opened?
- What if one search box led the screen and filters were secondary?
