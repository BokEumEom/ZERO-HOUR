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

## ✅ DONE (2026-06-17) — Emoji → SVG corner icons
- Replaced the 🔊/🔇 mute, "II" pause, and ⛶ fullscreen glyphs with inline
  pixel-line SVGs that inherit the button color (`currentColor`). Mute state now
  toggles a `.muted` class (CSS shows a slash / hides the waves) instead of
  swapping an emoji. Visually verified at phone viewport (sound-on, muted, and
  fullscreen icons render consistently); E2E 45/45 unaffected.

## ~~P3 — Shepherd's Dog full in-shell integration~~ (DROPPED 2026-06-22)
- Obsolete: the project is now a single game (**Neon Vortex Arcade Pilot**); the
  game-select hub and the other games (Zero Hour, Shepherd's Dog) were removed.
  Shepherd's Dog is being spun out into its own separate project.
