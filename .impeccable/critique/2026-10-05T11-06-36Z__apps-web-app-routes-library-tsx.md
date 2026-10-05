---
target: apps/web
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/Users/evgeniivaniukov/Development/no-fomo/apps/web/app/routes/library.tsx"
target_fingerprint: "sha256:409812bc05169c7ddf8cb35790b6e199f7a5b6a79b802eb40138eec4dde385fd"
target_path: /Users/evgeniivaniukov/Development/no-fomo/apps/web/app/routes/library.tsx
timestamp: 2026-10-05T11-06-36Z
slug: apps-web-app-routes-library-tsx
---
⚠️ DEGRADED: single-context (sub-agents only on explicit user request in this session)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Counts announced, active filters clear, sync summary |
| 2 | Match System / Real World | 3 | "Unnamed collection" weak with real data |
| 3 | User Control and Freedom | 3 | Per-filter and search removal; Back skips filter changes |
| 4 | Consistency and Standards | 3 | One active-filter look; sheet opens with ring on Previous |
| 5 | Error Prevention | 3 | Search ignores symbols safely |
| 6 | Recognition Rather Than Recall | 3 | Captions under tiles + search |
| 7 | Flexibility and Efficiency | 2 | Search, "/", arrows; no sort, no batch yet |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, denser, tiles carry meaning |
| 9 | Error Recovery | 3 | Empty search explains why and offers a way back |
| 10 | Help and Documentation | 3 | Shortcut and search hints in place |
| Total | | 29/40 | Good |

## Design Specificity Verdict
Clear step up: captions and search make the grid about content. Identity still a calm generic media tool (fits Operate). "Understands the videos" not visible yet (later milestones). Detector: 0 code findings; live: image-hover-transform (sanctioned) and text-overflow on caption line (intentional truncate, but revealed aria-label hiding captions).

## Priority Issues
1. [P1] Real data: collections indistinguishable ("Unnamed collection, Number ending 1234"). Fix: name in app or new IG request (open decision). Command: /impeccable shape collection names
2. [P2] Screen readers never hear captions: fixed tile aria-label overrides content. Fix: label from author, length, caption first line, or drop aria-label; full caption as title. Command: /impeccable harden
3. [P2] Search does not show why a post matched (e.g. "berlin" matched place). Fix: highlight matches; show matching field; server snippet. Command: /impeccable clarify
4. [P2] Phone sheet is keyboard-shaped: key hint on touch, prev/next at top, no swipe, initial focus ring on Previous. Fix: hide hint on touch, swipe + bottom bar, initial focus on title. Command: /impeccable adapt

## Persona Red Flags
- Alex: no sort, no batch (M3).
- Sam: captions hidden by aria-label; sheet focus starts on Previous.
- Mira: finds topics fast; unnamed collections; unexplained matches.
- Casey: prev/next out of thumb reach, no swipe, irrelevant key hint.

## Minor Observations
- Placeholder omits places and image descriptions.
- Truncated caption has no full-text tooltip.
- "Open on Instagram" stays primary until M2 player.

## Questions to Consider
- What if a result said where it matched?
- Could naming a collection happen inside the filter, when needed?
- On phones, should the sheet be a full-screen swipe viewer?
