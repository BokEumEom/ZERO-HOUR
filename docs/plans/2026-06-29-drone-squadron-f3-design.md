# F3 — Wingman Squadron — Design

**Status:** Design (approved 2026-06-29). Roadmap step F3 of "reflect ALL sprite-atlas
assets". Follows F2 (DATA SALVAGE). Approach **B (fixed squadron)** chosen over A (stacking
fleet) and C (cosmetic rotation).

## Goal

Reflect the unused section-8 "DRONE / COMPANION VARIANTS" art (≈9 unused teal drone sprites;
only `drone` + `drone2` are used today) by upgrading the DRONE / WINGMAN power-up from 2
identical companions to a **squadron of 6 visually-distinct wingmen** — DPS-neutral, fully
deterministic (daily-fair).

## Why this is natural (not forced)

The row is literally labelled "COMPANION VARIANTS"; using them as the companion drones is the
designed intent. One pickup fielding a 6-strong squadron of distinct wingmen is an immediate
visual upgrade that fights the founding "단조롭다" (monotony) complaint, while tuning keeps
the firepower identical to today's 2 drones.

## Mechanic & balance

Current: `spawnDrones` makes 2 drones (`orbitR 40`, `variant` 0/1); each fires at a target
within 360 px every **0.55 s** (bullet speed 480, life 0.7). Total ≈ 2 / 0.55 ≈ **3.64 shots/s**.

F3:
- **Squadron of 6.** `spawnDrones` loops `i = 0..5`: `angle = i * (2π/6)`, `orbitR 46`,
  `variant: i`, staggered initial `fireCd = 1.65 * i / 6` (spreads first shots evenly).
- **DPS held constant.** Per-drone fire-cooldown reset becomes **1.65 s** (was 0.55).
  Total = 6 / 1.65 ≈ **3.64 shots/s** — identical to today. Bullet speed/life/range and the
  no-target reset (0.1) are unchanged. So the squadron looks dramatically bigger but deals the
  same damage.
- **Single squad (no stacking).** Re-picking DRONE while active keeps the existing behaviour
  (`s.drones.length === 0` guard in `applyPow` → only spawns when none exist; a re-pickup just
  refreshes the `fx.DRONE` timer). This is approach B, not A.

## Assets (verified, crop-tightened; final tighten + eyeball during impl)

6 distinct variant sprites map to `variant` 0..5:

| variant | key | atlas rect | note |
|---|---|---|---|
| 0 | `drone`  | 1215, 1019, 44, 38 | existing — simple drone |
| 1 | `drone2` | 1326, 1023, 84, 44 | existing — winged core |
| 2 | `droneV3` | 44, 1019, 56, 51 | spiked diamond |
| 3 | `droneV4` | 166, 1022, 64, 43 | orbital ring |
| 4 | `droneV5` | 660, 1023, 80, 45 | winged |
| 5 | `droneV6` | 922, 1017, 89, 54 | feathered wings |

All on `sprite-atlas.png` (atlas sheet — no `sheet:'el'` tag). `drawDrone` maps the drone's
`variant` index into a 6-key array (`DRONE_VARIANT_KEYS`) instead of the current
`variant ? 'drone2' : 'drone'` binary; draw size ~28 (longest-edge), rotation `angle*0.5` as
now; the vector fallback (cyan dot) is unchanged.

Reflection note: 6 of the ~9 unused variants are used. The remaining ~3 are near-duplicate
silhouettes; they are deliberately left out to avoid orbit clutter and reading noise (honest
partial reflection, not "all 9").

## Invariants & fairness

- **Deterministic.** `spawnDrones` and the fire loop use NO `s.rng()` and NO `Math.random()`
  (mirrors the current code). The daily seed stream is **unshifted** → no seed-pinned test
  breakage, and daily fairness is untouched. (The `static.test.mjs` Math.random baseline of 14
  stays exact.)
- **Balance:** total drone DPS unchanged by construction (6 / 1.65 = 2 / 0.55). No score, drop,
  or spawn change.
- **Hot-path / perf:** the per-frame drone loop runs 6× instead of 2×, but total bullets
  emitted per second is unchanged, and there are no new per-frame allocations. Negligible.
- **Readability:** 6 drones at `orbitR 46` around the `r 13` player are spaced ~48° apart;
  confirm in the gallery they read as a squadron, not a blob.

## Verification

- **Unit** (`test/unit/drone-squadron.test.mjs`, new): after applying a DRONE power-up,
  `s.drones.length === 6`; the six carry `variant` 0..5 (all distinct); each fire resets to
  `1.65` (assert by driving a frame with a target in range and checking the post-fire `fireCd`);
  re-picking DRONE does not exceed 6 (single squad).
- **Static pin** (`test/unit/static.test.mjs` or the new file): `droneV3..droneV6` rects exist,
  are atlas (no `sheet:'el'`), and are within sheet bounds.
- **Full gate:** `node --test test/unit/*.test.mjs`, headless E2E (`bash test/e2e/run.sh`),
  `/build-standalone` regen + bundle-hash-sync — all green.
- **Gallery:** capture a DRONE-active scene; eyeball that 6 distinct wingmen orbit and read
  clearly at ~28 px.

## Risks

- **Rect tighten:** the drone-row variants sit close together; verify each crop excludes its
  neighbours (`droneV3` especially — CC over-extended to w66; pinned to w56).
- **Readability at 6:** if the squad reads as clutter, drop to 5 (then per-drone `fireCd` =
  5 * 0.55 / 2 = 1.375 s to stay DPS-neutral) — a one-number adjustment.
- **Fire-rate test brittleness:** assert the cooldown *reset value* (1.65) rather than exact
  shot timing, to avoid frame-timing flakiness.

## Out of scope (later roadmap steps)

- Stacking drone fleet (approach A), enemy drones (could fold into F6 enemy archetypes),
  the ~3 leftover near-duplicate variants.
- F4 world objects, F5 hazards, F6 enemy archetypes, F7 telegraph/UI + miniIcon.
