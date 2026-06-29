# F5 — Laser Fence (telegraphed beam barrier) — Design

**Status:** Design (approved 2026-06-29). Roadmap step F5 of "reflect ALL sprite-atlas assets".
Follows F4 (world containers). Mechanic **A (laser fence)** chosen over B (spinner) and C
(hazard zone). This is the highest-risk roadmap step (a new threat) — scoped to ONE cohesive,
telegraphed, daily-fair hazard.

## Goal

Reflect two unused hazard sprites — the section-3 power-bolt node (emitter) and the section-2
laser column (beam) — as a **Laser Fence**: a telegraphed beam that spans the arena along one
axis for a short window. The player must be off the beam's line when it fires. A
positional-timing hazard with no existing analog (turret = aimed bullets, elite = rotating
sweep, boss = radial, portal = mines).

## Assets (verified, crop-tightened; final tighten + eyeball during impl)

| key | atlas rect (1448×1086) | reads as |
|---|---|---|
| `hazardNode`  | 335, 412, 60, 66 | teal lightning-bolt emitter (section 3) |
| `laserColumn` | 989, 150, 26, 87 | red/pink laser beam column (section 2) |

Both on `sprite-atlas.png` (atlas sheet — no `sheet:'el'`).

## Mechanic & data

Mirrors the existing **portal** pattern (inline in `game.js`, a parallel sub-array + a
spawn timer + a small state machine) and the **elite** beam collision (perpendicular distance
to a line → `hurtPlayer`). Inline (not a new module) to minimise wiring risk on the
highest-risk step.

- **State:** `s.fences: []` in `freshState`; `spawnT.fence` in the `spawnT` object.
- **Spawn** (in `update`, like portals): `spawnT.fence -= dt`; on `<=0`, reset to
  `15 + s.rng()*9`, and if `s.fences.length < 1 && s.diff.spawnMul >= 1` (normal/hard only —
  easy's `spawnMul` is 0.75) call `spawnFence(s)`.
- **`spawnFence(s)`** (deterministic seeded layout):
  - `orient = s.rng() < 0.5 ? 'h' : 'v'`
  - horizontal: `pos = 120 + s.rng()*(H-240)` (the beam's y); vertical: `pos = 120 +
    s.rng()*(W-240)` (the beam's x).
  - push `{ orient, pos, state: 'warn', t: 1.1, phase: 0 }`.
- **Update state machine** (per fence):
  - `phase += dt*3; t -= dt`.
  - `warn` (1.1 s telegraph): `t<=0` → `state='firing'`, `t=1.4`, `SY.audio.shoot()`.
  - `firing` (1.4 s): collision — `perp = orient==='h' ? Math.abs(p.y-pos) : Math.abs(p.x-pos)`;
    if `perp < BEAM_HALF + p.r` → `hurtPlayer(s, p.x, p.y)`. `t<=0` → `state='fade'`, `t=0.35`.
  - `fade` (0.35 s): `t<=0` → splice out.
  - `BEAM_HALF = 11` (beam visual ~22 px wide). With `p.r = 13`, the hurt band is ~24 px from
    the line — telegraphed 1.1 s ahead, so the player has ample time to step off the axis.
- **Non-destructible** (a pure avoidance hazard, like the portal) — no score/drop interaction,
  keeping F5 bounded. (Shootable nodes could be a future addition.)

## Render (`drawFence` in `render.js`, called before the player pass)

- **warn:** a thin pulsing line along the axis (vector), amber→red as `t→0` (telegraph).
- **firing:** the beam = `laserColumn` sprite stretched along the axis via `drawFit` (rotated,
  length = full span, height ~26) + a `drawBeamRay`-style red glow, with the `hazardNode`
  sprite drawn at both endpoints (emitters). Additive blend so it glows.
- **fade:** the firing visuals at falling alpha.
- Vector fallback if the atlas is undecoded (a plain red line) — matches the project's
  "sprite draws else vector" convention.

## Invariants & fairness

- **Daily fairness:** `orient`, `pos`, and the spawn timing all use `s.rng()`. No new
  `Math.random()` — the `static.test.mjs` baseline (14) is untouched. Given the same daily
  seed, the fence sequence is identical.
- **Damage path:** uses the existing `hurtPlayer` (honours i-frames + shield pop) — no new
  damage rules.
- **Gating:** normal/hard only (`spawnMul >= 1`), cap 1 concurrent — bounded pressure, easy
  stays gentle (same policy as portals).
- **Stream shift:** adding `spawnT.fence` + the spawn roll consumes from the seeded stream
  (versioned change). Seed-pinned tests may need a re-pin (forced timer/roll).
- **Hot-path:** one extra small loop over `s.fences` (cap 1) per frame; `drawFence` is a few
  draws. Negligible; no per-frame allocation.

## Verification

- **Unit** (`test/unit/fence.test.mjs`, new):
  - **fairness:** same daily seed → identical fence layout sequence (orient/pos), like the
    portal fairness test.
  - **gating:** easy difficulty never spawns a fence.
  - **state machine:** a fence cycles `warn → firing → fade` and is removed.
  - **collision:** a `firing` fence at `pos === player.y` (orient `h`) with `p.inv=0`,
    `s.shield=false` reduces the player's hp; a fence offset far from the player does NOT.
- **Static pin** (`static.test.mjs`): `hazardNode`/`laserColumn` rects exist (atlas, in bounds);
  `s.fences`/`spawnFence`/`drawFence` wired.
- **Full gate:** `node --test test/unit/*.test.mjs`, headless E2E (`bash test/e2e/run.sh`),
  `/build-standalone` regen + bundle-hash-sync — all green.
- **Gallery:** capture a firing fence; eyeball the beam + node endpoints read as a laser fence
  and the telegraph is clear.

## Risks

- **Difficulty spike:** a full-span beam can feel harsh. Mitigations: long 1.1 s telegraph,
  cap 1, normal/hard only, `BEAM_HALF` tunable. If too punishing, raise the warn time or
  shorten `firing`.
- **Rect tighten:** `hazardNode` sits next to an antenna sprite; verify the crop is bolt-only.
- **Re-pin churn:** the stream shift may break a seed-pinned test; budget a re-pin.
- **Collision-vs-visual match:** ensure the analytic line (`pos`) matches the rendered beam
  centre so the hurt band reads fairly.

## Out of scope (later)

- Shootable/destructible fence nodes; the section-2 mace-chain (spinner), section-5
  hazard-stripe barrier, section-3 teleporter/hex pads (warp), the antenna spire.
- F6 enemy archetypes, F7 telegraph/UI + miniIcon.
