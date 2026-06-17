# Scoreyard — design system

The visual + interaction contract for the arcade platform. System architecture
lives in [design.md](../design.md); this file is the *design* source of truth.
When a design decision and this doc disagree, fix one of them — don't let them drift.

## Core principle: shared platform, distinct games

The **shell is uniform; games may have their own art direction.** Scoreyard is an
arcade cabinet — every machine shares the same room (hub, chrome, transitions,
records contract, a11y floor) but each game can look like itself.

- **Zero Hour** — neon CRT (the platform default tokens, `css/tokens.css`).
- **Shepherd's Dog** — warm pastoral paper/cream/gold, Fraunces + Cabin
  (`js/games/shepards-dog/style.css`). Intentionally *not* the CRT theme. Keep it.

A new game inherits the platform tokens by default, and overrides `:root` only when
it has a deliberate, considered identity of its own. "Different for the sake of
different" is not that — a distinct look must be as finished as the pastoral one.

## Platform tokens — `css/tokens.css`

Single source of truth for the shell + neon games. Loaded before `css/style.css`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#04090f` | app background |
| `--panel` | `#081420` | cards, raised surfaces |
| `--teal` | `#2de2c6` | primary accent, focus glow |
| `--teal-soft` | `#9ff5e8` | titles, bright text |
| `--teal-dim` | `#0fae97` | secondary accent |
| `--pink` | `#ff5a78` | danger, game-over, low HP |
| `--amber` | `#ffc34d` | reward, combo, NEW/best |
| `--blue` | `#5aa7ff` | reserved |
| `--ink` | `#eaf6ff` | body text |
| `--display` | Fraunces (serif) | hub + screen titles / scores / wordmark |
| `--body` | Cabin (sans) | hub + screen body / UI / buttons |
| `--pixel` | Press Start 2P | **HUD numerals only** (time / score — stable width) |
| `--mono` | IBM Plex Mono | `--pixel` fallback; legacy |
| `--safe-*` | env insets | notch/safe-area padding |

Per-game accent: a game card sets `--c` (its `accent`); the card border + glow
inherit it (`js/shell.js`). Keep the **full neon border** — never a colored
left-bar (an AI-slop tell).

## Type scale

The platform adopts Shepherd's Dog typography (Fraunces + Cabin) for the hub and
all Zero Hour screens, in the dark/neon tone. The in-arena HUD keeps pixel/mono.

- **Display / titles / wordmark / scores:** `--display` (Fraunces), `font-weight: 900`,
  tight tracking (`letter-spacing: -0.01em`), `clamp()`-sized.
- **Body / UI / buttons / kicker:** `--body` (Cabin). Two typefaces max per surface.
- **HUD numerals (`#hud-time`, `#hud-score`):** stay `--pixel` (Press Start 2P) —
  monospace avoids width jitter on the live countdown and ties to the kept arena.
- **Kicker:** Cabin, uppercase, `letter-spacing: 0.26em`, `--pink`.

## Component patterns

- **Screens** (`.screen`): full-viewport overlay, centered via `::before/::after`
  flex spacers, `overflow-y:auto`, safe-area padding. One job per screen.
- **Buttons** (`.arcade-btn`): 44px min height, neon outline, `.primary` = filled.
- **Cards** (`.game-card`, `.mode-card`): `--panel` bg, full accent border,
  hover/focus glow + `-2px` lift. Card = the interaction (a launch / mode pick),
  never decoration.
- **Hub** (`#screen-arcade`): identity header (`SCOREYARD` wordmark + tagline) →
  game cards with scent (`BEST`, play status) → footer (count + "scores local").
  Must render an empty/fail-safe state if no games register.
- **Back to hub:** top-left affordance on every game (Zero Hour `.back-btn`,
  Shepherd `.arcade-back`) — styled in the game's own theme, same position + intent.
- **Launch transition:** entering a linked game fades `#viewport` out (`.leaving`,
  220ms) before navigation, so it doesn't hard-cut.

## Accessibility floor (non-negotiable)

- **Reduced motion:** honor `prefers-reduced-motion` — no looping blink/pulse/glow,
  hit-flash becomes a static tint (WCAG 2.3.1, photosensitivity). See `style.css`.
- **Contrast:** body/UI text ≥ 4.5:1. Don't drop muted text below ~0.6 alpha on `--bg`.
- **Touch targets:** ≥ 44px (corner buttons relax to 38px only on ≤600px).
- **Focus:** every interactive element has a visible `:focus-visible` state.
- **Deferred (TODOS.md):** ARIA live regions for score/time, `role`/labels on
  `.screen`, focus move on screen change.

## New-game checklist

1. Create `js/games/<id>/` and call `SY.registerGame({id,title,blurb,accent,enter,exit,frame})`.
2. Inherit `css/tokens.css`; override `:root` only for a deliberate, finished identity.
3. Provide a top-left back-to-hub affordance (matches existing position + intent).
4. Use seeded `s.rng()` for any gameplay randomness (`Math.random()` = cosmetic only).
5. Meet the accessibility floor above (reduced-motion, contrast, 44px, focus).
6. Keep the game core React-free and working when CDN scripts fail.
