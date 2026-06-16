# TODOS

Design debt deferred from `/plan-design-review` 2026-06-16 (hub + per-game UI/UX).

## P3 — Accessibility depth (ARIA / focus)
- **What:** Add ARIA live regions for score/time/combo, `role` + labels on `.screen`
  overlays, and move focus to the primary action when a screen appears (e.g. game-over → RETRY).
- **Why:** Screen-reader users get no announcement of score changes, and after a game
  ends focus stays trapped on the dead canvas.
- **Pros:** Real keyboard/SR usability; rounds out the a11y work started this round.
- **Cons:** Live regions can be chatty on a 60fps counter — needs throttling/debounce.
- **Context:** Reduced-motion + contrast already landed (2026-06-16). This is the deeper half.
- **Depends on:** none.

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
