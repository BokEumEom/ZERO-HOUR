# Difficulty-in-Main-Flow + Loot Generosity — Design (2026-06-26)

Two linked changes from a player report: "난이도 차이를 못 느끼겠고, 아이템이 너무 적다."

**Root causes found (by code inspection):**
- Difficulty felt absent because the player only ever uses the headline **START
  DAILY** / briefing **작전 개시**, both of which call `startGame('daily')` →
  engine forces NORMAL (`game.js` `mode==='daily' ? 'normal' : difficulty`) for
  worldwide daily fairness. The EASY/NORMAL/HARD chips apply ONLY to the
  secondary FREE PLAY button, which the player never presses. So difficulty is a
  real but **undiscoverable** feature for a daily-first player.
- Loot feels sparse because the spawn caps/cadence are genuinely low: power-ups
  cap `< 3` / cadence 9.5s; crates cap `< 2` / cadence 7–12s.

## Decisions (locked in brainstorming)

1. **(A) The headline button follows the selected difficulty.** Daily stays
   NORMAL-only (fairness is non-negotiable), so "using difficulty" = playing FREE
   PLAY at that difficulty, surfaced as the primary action.
2. **(②) Loot made "noticeably generous"** — power-up cap 3→4 / cadence 9.5→7s;
   crate cap 2→3 / cadence ~5–8s. Applies to ALL modes incl. daily/NORMAL so the
   daily-first player actually feels it → a deliberate **versioned** change to the
   daily map stream (re-pin seed tests, regenerate standalone). Score *table*
   (points per action) is unchanged → score-sync stays green.

## Part A — Difficulty in the main flow

### Behavior
The difficulty chips become the menu's mode selector. The headline button
(`btn-start`) is dynamic, keyed on `difficultyValue()` (persisted
`recs.settings.nvDifficulty`, default `normal`):

| selected difficulty | headline label | headline sub | click action |
|---|---|---|---|
| `normal` (default) | `START DAILY` | `{date} · BEST {best}{streak}` | `startGame('daily')` |
| `easy` / `hard` | `PLAY · EASY` / `PLAY · HARD` | `무작위 아레나 · {DIFF}` | `startGame('free')` |

- Daily remains reachable in any state via the existing **오늘의 챌린지 브리핑**
  link (`btn-daily` → briefing → `btn-challenge-launch` → `startGame('daily')`).
- The separate **FREE PLAY** button (`btn-free`) is **removed** — its function is
  absorbed by the headline. The `#neonvortex-free-sub` label moves into the
  headline sub.
- "Free-play NORMAL (random seed at normal)" is intentionally dropped from the
  front menu: NORMAL selection maps to the daily (which *is* normal). Accepted
  simplification (YAGNI; daily covers the normal experience).

### DOM / wiring
- `index.html` menu list: move the `#neonvortex-menu-difficulty` chip row ABOVE
  `#neonvortex-btn-start`; remove the `#neonvortex-btn-free` button (and its inner
  `#neonvortex-free-sub`). Relabel the chip group's aria-label from "Free-play
  difficulty" to "Difficulty".
- `main.js`:
  - `syncDifficultyChips()` (already runs on entry + on chip change) gains the
    headline update: set `btn-start` label + sub from the table above (reuse
    `menu-date`/`menu-daily-best`/`menu-streak` spans for the NORMAL sub; plain
    text for EASY/HARD).
  - `btn-start` click handler routes: `difficultyValue()==='normal' ?
    startGame('daily') : startGame('free')`.
  - Remove the `btn-free` listener; `startGame('free')` already reads
    `difficultyValue()` via `reallyStart` → `G.start(mode, difficultyValue())`.
- `css/neonvortex.css`: reposition the chip row (now above the headline); minor
  spacing only — reuse existing `.nv-diff-row` / `.nv-diff-chip` styles.

### Modifier interaction
Free-play difficulty runs still roll a random run-modifier (orthogonal variety;
the HUD chip names it). The DIFF knob deltas (turrets 0→3, foe kinds none→4,
surge 0.7→1.4, bossHP 0.75→1.33) dominate, so difficulty is clearly felt despite
modifier noise. No change to the modifier system.

## Part ② — Loot generosity (game.js)

In the `update()` spawn block:
- Power-up: cap `s.pows.length < 3` → `< 4`; cadence `9.5 / s.diff.lootMul` →
  `7 / s.diff.lootMul`.
- Crate: cap `s.crates.length < 2` → `< 3`; cadence
  `(7 + s.rng() * 5) / s.diff.lootMul` → `(5 + s.rng() * 3) / s.diff.lootMul`.

All randomness stays on the seeded `s.rng()`; `lootMul` (TREASURE/IRON WARDEN)
still multiplies on top. This shifts the daily map stream → versioned change.

### Fairness / versioning
- Deterministic per seed; identical worldwide within a day. Past daily records
  (filed per date) are not invalidated. Seed-pinned tests that assert spawn
  counts/streams get re-pinned (same procedure as the modifier + difficulty-feel
  changes).
- Score impact: more loot ⇒ modestly higher achievable scores going forward;
  everyone shares the new baseline → fair. Documented, not mitigated. The score
  *table* is untouched, so the README score section + score-sync check are
  unaffected.

## Files touched

- `index.html` — menu restructure (chip row up, remove FREE PLAY button).
- `js/games/neonvortex/main.js` — dynamic headline (label/sub/action) in
  `syncDifficultyChips` + `btn-start` routing; remove `btn-free` listener.
- `css/neonvortex.css` — chip-row position/spacing.
- `js/games/neonvortex/game.js` — loot caps + cadence.
- `README` (Korean) — game-mode section: difficulty now drives the headline;
  daily is NORMAL-only via START DAILY / briefing. Score table unchanged.
- `standalone.html` — regenerated after merge (user-run `/build-standalone`).

## Testing & verification

- **Loot (unit):** `test/unit/loot.test.mjs` (or extend) / a new check — assert
  power-up cap 4 and crate cap 3 are honored, and the cadence reset windows
  (pow `7/lootMul`; crate `[5,8]/lootMul`). Re-pin any seed-pinned spawn-count
  tests broken by the new stream.
- **Menu (A):** DOM-bound → extend the E2E harness (`test/e2e/harness.html`):
  selecting HARD sets `btn-start` label to `PLAY · HARD` and clicking it starts a
  FREE-PLAY HARD run (`G.mode==='free'`, `G.state.difficulty==='hard'`);
  selecting NORMAL → `START DAILY` → `G.mode==='daily'`. Plus a mobile-portrait
  screenshot of the restructured menu (NORMAL and HARD states).
- `rng-fairness-auditor` (loot spawn change) + `performance-analyzer` (no
  per-frame allocation — cap/cadence are constants).
- After merge: regenerate `standalone.html` + `run-all` ALL PASS (incl. hash
  gate).

## Out of scope

- Per-difficulty daily leaderboards; making the daily itself non-normal;
  disabling the run-modifier for difficulty runs; new power-up types (the report
  was about loot frequency, not variety).
