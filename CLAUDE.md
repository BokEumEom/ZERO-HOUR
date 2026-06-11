# Scoreyard (Zero Hour — Retro Arcade Shooter)

75-second retro arcade drone shooter. Pure HTML/CSS/JS + Canvas 2D — no build
tools, no package.json, no test suite. Korean README.

## Run / Deploy

Open `index.html` in a browser, or `npx serve .` for a local server.
There is nothing to install or compile. Deployed to Vercel as a static site
(`.vercelignore` excludes dev-only files like `.claude/`).

## Two HTML files — only one is source

- `index.html` — the entry point. **Edit this one.** Loads `js/` modules
  in order: `store → audio → game → render → main`, then React 18 + Babel
  Standalone from CDN for the dev tweaks panel (`tweaks-panel.jsx`, `tweaks.jsx`).
- `standalone.html` — **generated single-file bundle. Never hand-edit.**
  A PreToolUse hook blocks edits. Regenerate with `/build-standalone` (user-run).

## Architecture

UI styles live in `css/style.css` (linked from `index.html`); the canvas is
drawn by `js/render.js`. All JS modules are IIFEs attaching to the `window.SY`
namespace:

- `js/store.js` — IndexedDB persistence (`scoreyard` DB) + seeded RNG
  (`SY.makeRng`: xmur3 → mulberry32)
- `js/game.js` — game engine: state, simulation, spawning, collision, boss AI
- `js/render.js` — Canvas 2D rendering (runs every frame — performance hot path)
- `js/main.js` — game loop, HUD, screens, records, share, touch joystick
- `js/tweaks*.jsx` — dev-only balance panel (the only React code)

## Critical invariants (details in the game-conventions skill)

- **Daily-challenge fairness**: gameplay-affecting randomness (spawns, drops,
  probabilities) must use the seeded `s.rng()`. `Math.random()` is for cosmetics
  only (particles, shake, audio noise).
- Score constants in `js/game.js` must stay in sync with the README score table.
- The game core (everything except `tweaks*.jsx`) must stay React-free and work
  when the CDN scripts fail to load.
- The 60fps hot path (`game.js` update + `render.js`) should avoid per-frame
  allocations — use the `performance-analyzer` agent after gameplay/render changes.
