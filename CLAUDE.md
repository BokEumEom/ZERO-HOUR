# Neon Vortex Arcade Pilot

A mobile-first, single-game retro arcade shooter: **Neon Vortex** — a 60-second
drone run against the Core Warden. Pure HTML/CSS/JS + Canvas 2D — no build tools,
no package.json. Korean README.

The app boots straight into the game (no game-select hub). A thin, game-agnostic
runtime shell (`js/shell.js`) owns the shared canvas, the rAF loop, and the
responsive layout; the game plugs in via `SY.registerGame(...)`.

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

- `index.html` — the entry point. **Edit this one.** Loads `js/` modules in
  order: `store → audio → shell → games/neonvortex/{sprites → meta → medals →
  game → render → main}`. No CDN / framework dependencies — the game is
  fully self-contained vanilla JS.
- `standalone.html` — **generated single-file bundle. Never hand-edit.**
  A PreToolUse hook blocks edits. Regenerate with `/build-standalone` (user-run).

## Architecture

All UI styles live in `css/neonvortex.css`; shared design tokens (palette, fonts,
safe-area) in `css/tokens.css` — the single source of truth, loaded first. All JS modules are IIFEs
on the `window.SY` namespace. Shell vs game
([ADR-0008](docs/adr/0008-arcade-platform-shell.md)):

Shared (`js/`):
- `js/store.js` — IndexedDB persistence + seeded RNG (`SY.makeRng`). Records are
  namespaced via `SY.store.forGame('neonvortex')` (`id:best_all`, `id:daily_<date>`);
  shared `settings` global. `SY.store.migrate(id)` upgrades pre-namespace keys once.
- `js/audio.js` — Web Audio SFX + haptics (game-agnostic).
- `js/shell.js` — runtime shell: registry (`SY.registerGame`), rAF loop (calls the
  active game's `frame(dt,ctx)`), `fit()` (scale + portrait 90° rotation, `SY.layout`).
  Boots straight into the registered game (`SY.shell.enterGame()`).

Game (`js/games/neonvortex/`):
- `game.js` — engine: state, simulation, spawning, collision, boss AI (`SY.nvGame`).
- `render.js` — Canvas 2D rendering (every frame — performance hot path).
- `sprites.js` — ship sprite atlas (`SY.nvSprites`) + paint coatings.
- `medals.js` — score tiers + lifetime medals (`SY.nvMedals`, pure logic).
- `meta.js` / `meta.mjs` — cosmetic lifetime totals + pilot rank tier (`SY.nvMeta`;
  display-only, never reads back into the sim). `.mjs` is the ESM test mirror.
- `main.js` — registers the game (`enter/exit/frame`); HUD, screens, records, input.

## Critical invariants (details in the game-conventions skill)

- **Daily-challenge fairness**: gameplay-affecting randomness (spawns, drops,
  probabilities) must use the seeded `s.rng()`. `Math.random()` is for cosmetics
  only (particles, shake, audio noise).
- Score constants in `games/neonvortex/game.js` must stay in sync with the README score table.
- The game core must stay React-free / dependency-free (vanilla JS only).
- Cosmetic meta (lifetime totals, `crystalsCollected`) is display-only — it must
  never feed spawn counts, drop tables, score math, or the seeded RNG.
- The 60fps hot path (`game.js` update + `render.js`) should avoid per-frame
  allocations — use the `performance-analyzer` agent after gameplay/render changes.

## Execution discipline (non-trivial work only)

Applies ONLY to non-trivial execution tasks — multi-step implementation, refactor,
debugging, or analysis. Does NOT apply to conversational replies, single-fact
answers, or one-line edits; forcing the format there is noise. (The superpowers
workflow and `~/.claude/rules/*` already cover planning/TDD — this adds only the
restate-and-verify habit and a consistent report shape.)

- **Before acting:** restate the requirements in your own words and define the
  success/verification criteria — what observable check proves the task is done.
- **On failure:** don't repeat the same approach. Diagnose the root cause first,
  then pick a different method.
- **Before the final response:** confirm requirements are met, errors are resolved,
  and the result is independently verifiable (tests, audits, reproducible build).
- **Report shape** for these tasks: `1. 수행 내용 · 2. 결과물 · 3. 검증 내용 ·
  4. 남은 리스크`.

To run a post-mortem on a harness/agent failure and propose a minimal fix, use the
`/analyze-failure` skill.
