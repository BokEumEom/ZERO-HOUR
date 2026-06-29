# F4 — World Containers (Crystal Pod + Hazard Mimic) — Design

**Status:** Design (approved 2026-06-29). Roadmap step F4 of "reflect ALL sprite-atlas assets".
Follows F3 (wingman squadron). Approach **A (new container kinds)** chosen over B (warp gate)
and C (mixed).

## Goal

Reflect two unused section-3 "INTERACTIVE / WORLD OBJECTS" sprites by adding two
destructible container KINDS to the existing crate system, each with a distinct, new payoff
type:

- **CRYSTAL POD** (capsule pod sprite) — break → a cache of crystals bursts out.
- **HAZARD MIMIC** (X-marked container sprite) — looks like loot, bites back: break → a small
  swarm of homing mines **plus** a consolation loot drop (telegraphed risk/reward).

Both reuse the crate pipeline (spawn → HP → bullet-break → reward), so the new code is small.
All randomness seeded (daily-fair).

## Why these two (and why not the rest of section 3)

Section 3's unused sprites split by mechanic:
- **Container-like** → fit the crate system directly: capsule pod, X-container. (Chosen.)
- **Pads** (teleporter ↑ pad, hex landing pad) and **nodes** (power-bolt node, antenna spire)
  → need a *different* mechanic (warp / energy). They read as hazards/spawners, so they are
  deferred to **F5 (hazards)**, not forced into containers here.
- The tall glass canister is a near-duplicate of the existing `lootCanister` — low value,
  left out.

Reflecting 2 sprites with 2 genuinely new payoff types (crystal cache, risk container) beats
bolting on 5 redundant containers. Honest partial reflection; the rest is F5.

## Assets (verified, crop-tightened; final tighten + eyeball during impl)

| key | atlas rect (1448×1086) | reads as |
|---|---|---|
| `capsulePod` | 195, 390, 76, 82 | glass tube with a glowing teal core |
| `xContainer` | 563, 390, 87, 82 | container with a bright cyan **X** (danger telegraph) |

Both on `sprite-atlas.png` (atlas sheet — no `sheet:'el'`).

## Mechanic & data

Extends the crate system (`s.crates`, kinds `crate`/`canister`/`chest`/`console`).

- **New kinds:** `pod`, `mimic`.
- **`CRATE_HP`:** `pod: 3`, `mimic: 3`.
- **Spawn roll** (`spawnCrate`, seeded `r = s.rng()`): carve shares for the two new kinds —
  ```
  kind = r < 0.08 ? 'chest'
       : r < 0.20 ? 'console'
       : r < 0.34 ? 'pod'
       : r < 0.46 ? 'mimic'
       : r < 0.73 ? 'crate'
       : 'canister';
  ```
  (chest 8% / console 12% / pod 14% / mimic 12% / crate 27% / canister 27%. The crate
  spawn-timer cap of ≤2 concurrent is unchanged, so the field is not flooded.)
- **Break payoffs** (in the crate-break branch, after the `console` branch):
  - **`pod`** → `addScore(s, 25, …, 'destroy')` + `blast(70)` + a seeded crystal burst at the
    pod: `n = 6 + floor(rng*3)` crystals, each pushed at a seeded angle/distance with outward
    velocity (mirrors the boss-death crystal scatter shape). No mines.
  - **`mimic`** → `addScore(s, 35, …, 'destroy')` + `blast(80)` + a seeded mine swarm:
    `m = 2 + floor(rng*2)` calls to `spawnMineAt(s, cr.x, cr.y)` (homing mines) **plus**
    `spawnLoot(s, cr.x, cr.y, 'crate')` as the consolation reward. The `xContainer` X-mark is
    the visual telegraph that this one is dangerous.
- **Render** (`drawCrate`): extend the kind→key map: `pod` → `capsulePod`, `mimic` →
  `xContainer` (vector fallback unchanged).

## Invariants & fairness

- **Daily fairness:** every new decision uses `s.rng()` (spawn roll, crystal count/positions,
  mine count). No new `Math.random()` — the `static.test.mjs` baseline (14) is untouched.
- **Versioned stream shift:** the extended spawn-roll table changes the seeded stream (like the
  F2 loot-table change). Seed-pinned tests that assert a probabilistic event for one fixed seed
  may break; re-pin by forcing the relevant roll (established precedent).
- **Balance:** `pod` is purely positive (crystals); `mimic` is risk/reward — 2-3 homing mines
  offset by a crate-loot burst + 35 pts, and it is telegraphed (X mark) and optional (the
  player chooses to shoot it). Crate concurrency cap (≤2) bounds field pressure. Tunable.
- **Hot-path:** rewards fire on container break (not per-frame); `drawCrate` gains two map
  entries (no allocation). Negligible.

## Verification

- **Unit** (extend `test/unit/world.test.mjs`): force `s.rng` to hit `pod` and `mimic` in
  `spawnCrate`; breaking a `pod` grows `s.crystals` and adds **no** mines; breaking a `mimic`
  grows `s.mines` (2-3) **and** drops loot tokens (`s.tokens`); `CRATE_HP` has `pod`/`mimic`.
- **Static pin:** `capsulePod`/`xContainer` rects exist, atlas (no `sheet:'el'`), in bounds.
- **Score-sync:** add pod (25) / mimic (35) destruction rows to the README score table.
- **Full gate:** `node --test test/unit/*.test.mjs`, headless E2E (`bash test/e2e/run.sh`),
  `/build-standalone` regen + bundle-hash-sync — all green.
- **Gallery:** capture a scene with a pod + mimic; eyeball that they render as the capsule /
  X-container and read distinctly from the existing crates.

## Risks

- **Rect tighten:** the section-3 row-2 sprites sit close; verify each crop excludes neighbours
  (pod crop showed a little debris at the base — confirm tighten).
- **Mimic feel:** if 2-3 mines reads as a "feel-bad trap", reduce to 1-2 or fatten the
  consolation — a one-number tune. The X telegraph is essential; confirm it's legible.
- **Re-pin churn:** the spawn-roll shift may break a few seed-pinned tests; budget a re-pin.

## Out of scope (later roadmap steps)

- F5 hazards (teleporter/hex pads → warp pad; power-node/antenna → energy hazard), the
  near-duplicate tall canister, F6 enemy archetypes, F7 telegraph/UI + miniIcon.
