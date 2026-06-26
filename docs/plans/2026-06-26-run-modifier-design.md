# Run Modifier — Design (2026-06-26)

Per-run **modifier** that tweaks the rules of a single 60s run, to break the
structural repetition flagged in the 2026-06-26 design evaluation (level/pacing
rated C+: every run is the same 8s-calm → surges → boss arc; only the daily seed
changes *placement*, not *structure*).

## Goals / non-goals

- **Goal:** each run carries a named modifier that visibly changes the feel
  (swarm / boss / loot / enemy-variety) without touching score math or breaking
  daily fairness.
- **Non-goal (v1):** no new entities or mechanics, no score multipliers, no
  per-difficulty / per-modifier leaderboards, no player-chosen modifiers.

## Decisions (locked in brainstorming)

1. **Scope — daily = deterministic, free-play = random.** Daily derives one
   modifier deterministically from the date seed (identical worldwide → fairness
   preserved). Free-play rolls a modifier from the run seed each run.
2. **Score-neutral.** Modifiers change enemies / structure / density / loot /
   boss only. Score constants and multipliers are untouched → all leaderboards
   stay comparable across days and modifiers. Risk/reward emerges naturally
   ("more enemies = more scoring chances"), never from a direct multiplier.
   - *Accepted tradeoff:* achievable score per day still varies somewhat with the
     day's modifier (a TREASURE day yields more loot points than an IRON WARDEN
     day) — but this is the same kind of day-to-day variance the daily seed
     already produces, and there is no direct score multiplier. Documented, not
     mitigated.
3. **Set size — STANDARD + 4.** A baseline `STANDARD` (no change) stays in the
   rotation (~20% of outcomes) so "an ordinary day" still happens — making the
   modified runs feel more special, and preserving a clean reference run.

## Mechanism (knob-composition)

Each modifier is a partial override object shaped like a `DIFF` entry. At
`freshState`, the effective difficulty is composed:

```
s.diff = combineDiff(DIFF[diffKey], MODS[modKey])
```

`combineDiff(base, mod)` rules (immutable — returns a new frozen object):

- **Multiplicative knobs** (`spawnMul`, `surgeMul`, `mineSpeedMul`, `bossHpMul`,
  `bossFireMul`, `turretFire`, `lootMul`): `base * (mod.xMul ?? 1)`.
- **Additive caps** (`mineCap`, `turretCap`): `base + (mod.xAdd ?? 0)`.
- **`foes`**: if `mod.foes` is present it replaces; else keep `base.foes`.

The result has the exact same shape the simulation already consumes, so
`game.js` / `render.js` / `foes.js` need no structural changes — only the new
`lootMul` knob is read in two spawn-cadence lines.

### New knob: `lootMul`

Today crate/power-up cadence is hardcoded in `update()`:

- `s.spawnT.crate = 7 + s.rng() * 5;`  (cap `s.crates.length < 2`)
- `s.spawnT.pow   = 9.5;`               (cap `s.pows.length < 3`)

Add a `lootMul` knob (default `1.0` on all DIFF tiers and STANDARD) and divide
the cadence by it: `(7 + s.rng()*5) / s.diff.lootMul`, `9.5 / s.diff.lootMul`.
Higher `lootMul` ⇒ shorter cadence ⇒ more loot. Caps unchanged (still 2 crates /
3 pows on screen) so loot stays bounded; the modifier raises *frequency*, not the
on-screen ceiling. `lootMul` is added to the three frozen `DIFF` tiers as `1.0`
so `combineDiff` is uniform.

## Selection (deterministic + fair)

- **Daily:** `modKey = pickModifier(makeRng(seedStr + ':mod'))` — a dedicated
  sub-RNG so the modifier choice does **not** consume the main gameplay stream;
  every client computes the same modifier for a given date.
- **Free-play:** same `pickModifier(makeRng(seedStr + ':mod'))` where `seedStr`
  is the random `free-…` seed → random per run. Orthogonal to the difficulty
  chip, so e.g. `HARD + MINE RUSH` can stack.
- `pickModifier(rng)` = uniform pick over `MOD_KEYS` (`['standard', 'mineRush',
  'ironWarden', 'treasure', 'vanguard']`), `MOD_KEYS[Math.floor(rng() * 5)]`.

## Modifier table (v1)

All values are deltas applied on top of the run's difficulty tier. Score math is
never touched.

| key          | name (KO / EN)          | theme            | knobs |
|--------------|-------------------------|------------------|-------|
| `standard`   | 기본 / STANDARD          | unmodified ref   | — |
| `mineRush`   | 기뢰 폭주 / MINE RUSH    | swarm survival   | `surgeMul ×1.5`, `mineCap +6`, `mineSpeedMul ×1.1` |
| `ironWarden` | 강철 워든 / IRON WARDEN  | epic boss        | `bossHpMul ×1.4`, `bossFireMul ×0.85`, `lootMul ×1.4` |
| `treasure`   | 보물 항로 / TREASURE RUN | greed / loot     | `lootMul ×1.8`, `spawnMul ×0.8` |
| `vanguard`   | 정예 전선 / VANGUARD     | enemy variety    | `foes {hunter:2, charger:2, shield:1, laser:1}`, `turretCap +1` |

Notes:
- `bossFireMul ×0.85` = faster boss fire (lower = faster, per existing DIFF
  semantics where hard is 0.8).
- IRON WARDEN includes `lootMul ×1.4` so the tankier boss feels rewarding, not
  just punishing.
- VANGUARD's `foes` override replaces the tier's `foes` map (per `combineDiff`).

## UI surfacing

- **Daily briefing:** modifier is deterministic, so show "오늘의 모디파이어:
  <name>" before the run starts.
- **Free-play:** seed is generated at launch, so the modifier is revealed on the
  READY screen (not pre-selectable on the menu).
- **HUD:** append a modifier chip next to the existing mode line
  (`DAILY <date>` / `FREE PLAY`). STANDARD shows a subdued "STANDARD" so the
  system stays legible.
- **Game-over:** show the modifier on the result screen and include it in the
  daily share text.

## Fairness / versioning impact

- Modifiers change knobs ⇒ the daily map differs from the pre-modifier baseline.
  This is a **deliberate versioned change** (same class as the difficulty-feel
  surgeMul change). Past daily records are filed per-date and are never replayed
  competitively, so they are not invalidated.
- All gameplay randomness still flows through the seeded `s.rng()`. The modifier
  selection uses a dedicated `:mod` sub-RNG (cosmetic-free, deterministic).
  `Math.random()` stays cosmetic-only.
- Cumulative all-time leaderboard: no direct score multiplier ⇒ comparability
  preserved (see Decision 2 tradeoff note).
- Seed-pinned tests that assert specific daily streams/maps must be re-pinned
  (same procedure as the difficulty-feel and BOMB-rarity changes).

## Files touched (anticipated)

- `js/games/neonvortex/game.js` — `MODS` table + `MOD_KEYS` + `combineDiff` +
  `pickModifier`; `freshState` composes `s.diff` and stores `s.modifier`
  (key + display name); add `lootMul: 1.0` to the three `DIFF` tiers; divide the
  two loot-cadence lines by `s.diff.lootMul`. Expose modifier on the game-over
  result object.
- `js/games/neonvortex/main.js` — daily briefing line, READY-screen reveal, HUD
  chip, game-over display, share text.
- `css/neonvortex.css` — modifier chip styling (reuse existing token palette).
- `README` (Korean) — short "런 모디파이어" section; keep score table unchanged
  (modifiers are score-neutral, so no score-sync impact).

## Testing & verification

- **`test/modifier.test.mjs`** (new, node --test):
  - `combineDiff` composition: multiplicative knobs multiply, additive caps add,
    `foes` replaces vs. inherits, returns a new object (immutability), unknown
    knobs default neutrally.
  - **Determinism:** `pickModifier` for a given `seedStr + ':mod'` is stable, and
    identical across repeated `makeRng` calls (worldwide-identical daily).
  - STANDARD composes to a byte-identical knob set vs. the base tier (proves the
    baseline is a true no-op).
- **Re-pin** any seed-pinned daily/stream tests broken by the knob change.
- `rng-fairness-auditor` (spawning/drop changes) + `performance-analyzer`
  (freshState/update path — confirm no per-frame allocation; `combineDiff` runs
  once per run, not per frame).
- Gallery visual snapshot for the HUD chip + daily-briefing badge (the only
  visual surface).
- After merge: regenerate `standalone.html` (`/build-standalone`) + hash gate
  GREEN.

## Out of scope (future)

- Player-selectable modifiers; per-modifier leaderboards; rule-injection
  modifiers (asteroid showers, roaming hazards); score-coupled modifiers
  (GLASS ×score). Revisit only if v1 lands well.
