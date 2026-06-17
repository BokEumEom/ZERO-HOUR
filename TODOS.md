# TODOS

Design debt deferred from `/plan-design-review` 2026-06-16 (hub + per-game UI/UX).

## ✅ DONE (2026-06-17) — Accessibility depth (ARIA / focus)
- Done instead of live-spamming the 60fps HUD: a visually-hidden
  `#a11y-live` (`role=status` / `aria-live=polite`) announces the **game-over
  result** (score + rank); `show()` moves focus to each modal screen's primary
  action (game-over → RETRY, etc.); `role="dialog"`/`aria-label` on the modal
  screens + region/group labels on the hub and HUD. Verified by E2E (focus,
  aria-live, dialog assertions in scenario 4).
- Intentionally NOT done: per-frame score/combo live region (would flood the
  reader). Open follow-up if desired: announce milestone/low-time cues only.

## P3 — Emoji → SVG corner icons
- **What:** Replace the 🔊 / ⛶ / II corner-button glyphs with pixel-style SVG icons.
- **Why:** Emoji render differently per OS and break the Press Start 2P pixel aesthetic.
- **Pros:** Consistent cross-platform look; matches the retro identity.
- **Cons:** Minor; adds a few inline SVGs to maintain.
- **Context:** Buttons are functional, not decorative — low urgency.
- **Depends on:** none.

## P3 — Shepherd's Dog full in-shell integration
- **What:** Convert Shepherd's Dog from a linked page (`href`) into a real
  `SY.registerGame({enter,exit,frame})` module like Zero Hour.
- **Why:** A separate page is still a page; full in-shell makes it truly one platform.
- **Pros:** Eliminates the page jump entirely; single canvas/loop/persistence path.
- **Cons:** Largest refactor here — own loop/canvas/input must fold into the shell.
- **Context:** This round only added shared tokens + chrome + a launch fade (Decision 1).
- **Depends on:** T5 (shared tokens) landing first.
