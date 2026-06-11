---
name: game-conventions
description: Scoreyard invariants — seeded RNG vs Math.random rules, score table/README sync, React-free game core, generated standalone bundle
user-invocable: false
---

# Scoreyard Game Conventions

Invariants that every code change must respect.

## Seeded RNG vs Math.random

Daily Challenge fairness depends on all players getting an identical world from
the same seed (`daily-YYYY-MM-DD` UTC → `SY.makeRng` in [js/store.js](../../../js/store.js),
xmur3 → mulberry32).

- **Gameplay-affecting randomness MUST use `s.rng()`** (the per-run seeded RNG
  on the game state): spawn positions, spawn counts, rock/crystal/powerup drops,
  drop probabilities, enemy entry edges.
- **`Math.random()` is allowed only for cosmetics**: particle bursts, screen
  shake, audio noise buffers, boss death visuals — anything that cannot change
  score outcomes — plus the free-play seed string in `startGame`.
- Never add a `Math.random()` call (or `Date.now()`-based variation) to spawn
  logic, scoring, or drop tables. It silently breaks daily-challenge fairness.

## Score table ↔ README sync

Score values in `js/game.js` (crystal `10 + combo`, mine 25, rock 40, boss hit 5,
boss kill 1500, ×2 powerup) are documented in [README.md](../../../README.md).
When changing any score constant, update the README table in the same change.

## React-free game core

`js/store.js`, `js/audio.js`, `js/game.js`, `js/render.js`, `js/main.js` must not
reference React. React 18 + Babel Standalone (CDN) exist only for the dev tweaks
panel (`js/tweaks-panel.jsx`, `js/tweaks.jsx`). The game must run even if the CDN
scripts fail to load.

## Module pattern and load order

All modules are IIFEs attaching to the `window.SY` namespace. Script load order
in `index.html` matters: `store → audio → game → render → main`. New modules
follow the same pattern and are added to the load order in `index.html`
(the build-standalone script picks them up automatically).

## Generated artifact

`standalone.html` is generated — never hand-edit it. After changing
`js/` or `index.html`, the user regenerates it with `/build-standalone`.
