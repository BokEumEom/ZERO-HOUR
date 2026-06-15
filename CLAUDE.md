# Scoreyard (Retro Arcade — multi-game)

A small mobile-first arcade platform. The home screen is a game hub; games plug
in via `SY.registerGame(...)`. First game: **Zero Hour** (60-second retro drone
shooter). Pure HTML/CSS/JS + Canvas 2D — no build tools, no package.json. Korean README.

Decision records, plans, and verification reports live in `docs/` (ADRs in
`docs/adr/`); distilled pitfalls in `LEARNINGS.md`. Tests: `test/run-all.ps1`
(zero-dependency: node --test + headless Edge E2E + bundle hash sync).

**Agent operating manual: `AGENT.md`** (absolute rules, workflow, role split) —
read it before any non-trivial change. Verifier criteria: `rubric.md`.
System design overview: `design.md` (architecture, modules, state shape,
runtime model — ties the ADRs together).

## Run / Deploy

Open `index.html` in a browser, or `npx serve .` for a local server.
There is nothing to install or compile. Deployed to Vercel as a static site
(`.vercelignore` excludes dev-only files like `.claude/`).

## Two HTML files — only one is source

- `index.html` — the entry point. **Edit this one.** Loads `js/` modules
  in order: `store → audio → shell → games/zerohour/{game → render → main}`,
  then React 18 + Babel Standalone from CDN for the dev tweaks panel
  (`games/zerohour/tweaks-panel.jsx`, `tweaks.jsx`).
- `standalone.html` — **generated single-file bundle. Never hand-edit.**
  A PreToolUse hook blocks edits. Regenerate with `/build-standalone` (user-run).

## Architecture

UI styles live in `css/style.css`. All JS modules are IIFEs on the `window.SY`
namespace. Shared platform vs per-game ([ADR-0008](docs/adr/0008-arcade-platform-shell.md)):

Shared (`js/`):
- `js/store.js` — IndexedDB persistence + seeded RNG (`SY.makeRng`). Records are
  per-game via `SY.store.forGame(id)` (`id:best_all`, `id:daily_<date>`); shared
  `settings` global. `SY.store.migrate(id)` upgrades pre-namespace keys once.
- `js/audio.js` — Web Audio SFX + haptics (game-agnostic).
- `js/shell.js` — arcade shell: registry (`SY.registerGame`), rAF loop (calls the
  active game's `frame(dt,ctx)`), `fit()` (scale + portrait 90° rotation, `SY.layout`),
  game-select hub (`#screen-arcade`), routing (`SY.shell.enterGame/exitToHub`).

Per-game (`js/games/zerohour/`):
- `game.js` — engine: state, simulation, spawning, collision, boss AI.
- `render.js` — Canvas 2D rendering (every frame — performance hot path).
- `main.js` — registers the game (`enter/exit/frame`); HUD, screens, records, input.
- `tweaks*.jsx` — dev-only balance panel (the only React code).

A new game = a `js/games/<id>/` module that calls `SY.registerGame({id,title,blurb,enter,exit,frame})`.

## Critical invariants (details in the game-conventions skill)

- **Daily-challenge fairness**: gameplay-affecting randomness (spawns, drops,
  probabilities) must use the seeded `s.rng()`. `Math.random()` is for cosmetics
  only (particles, shake, audio noise).
- Score constants in `games/zerohour/game.js` must stay in sync with the README score table.
- The game core (everything except `tweaks*.jsx`) must stay React-free and work
  when the CDN scripts fail to load.
- The 60fps hot path (`game.js` update + `render.js`) should avoid per-frame
  allocations — use the `performance-analyzer` agent after gameplay/render changes.
