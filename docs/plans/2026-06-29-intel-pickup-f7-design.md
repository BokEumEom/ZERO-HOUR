# F7 — INTEL Data Pickup — Design

**Status:** Design (approved 2026-06-29). Roadmap step F7 of "reflect ALL sprite-atlas assets".
F6 (new enemy archetype) was **skipped** — section-2's remaining sprites are minor orb/eye
variants and messy spiky clusters; a new enemy there would be forced mapping (violating the
founding "natural not forced" rule). F7 reflects the one remaining sprite with a clean, natural
home: the section-1 ID/intel card badge → a rare collectible.

## Goal

Reflect the unused section-1 **ID / intel card** badge as a rare **INTEL** pickup that grants an
instant score bonus (a "data cache" — ties into the F2 DATA SALVAGE theme). Reuses the existing
rare-pickup pipeline (1UP / BOMB): an out-of-bag pickup type with its own gated, seeded spawn.

## Asset (verified, crop-tightened; final tighten + eyeball during impl)

| key | atlas rect (1448×1086) | reads as |
|---|---|---|
| `intelCard` | 556, 44, 62, 72 | ID/intel card badge (portrait + data lines) — section 1 |

Atlas sheet (no `sheet:'el'`). Added to `POWER_ICONS` in sprites.js (same table as `oneUp`/`BOMB`).

## Mechanic & data (mirrors 1UP / BOMB)

- **Type:** `'INTEL'` — NOT in `POWER_TYPES` (out of the seeded bag) and NOT in
  `POWER_DURATION` (instant), exactly like `'1UP'` / `'BOMB'`.
- **Meta:** `POWER_META['INTEL'] = { glyph: 'ⓘ', color: '#5ad1ff', label: 'INTEL' }`.
- **Icon:** `POWER_ICONS['INTEL'] = { x:556, y:44, w:62, h:72 }` (intel card).
- **Spawn:** `spawnT.intel` timer + `spawnIntel(s)` (clone of `spawnOneUp`, `type:'INTEL'`).
  Gated seeded roll in `update`: `s.rng() < 0.14 && s.timeLeft > 8 && !s.pows.some(o => o.type
  === 'INTEL')`; timer reset `s.spawnT.intel = 17 + s.rng() * 11`.
- **Collect** (`applyPow`, with the instant types): `if (o.type === 'INTEL') { addScore(s, 250,
  o.x, o.y, undefined, 'loot'); return; }` — a flat data-cache bonus into the existing `loot`
  bucket (the burst + `floatText(label)` already fire above, meta-driven, like every pickup).
- **Render:** reuses the generic pickup render (`drawPow` / `POWER_ICONS`) — no new draw code,
  same path as 1UP/BOMB.

## Invariants & fairness

- **Daily fairness:** spawn position/timing/roll all use `s.rng()`. No new `Math.random()` —
  the `static.test.mjs` baseline (14) is untouched.
- **Out-of-bag:** `INTEL` is not added to `POWER_TYPES`, so the seeded power-up bag and its
  draw order are unchanged (no regression to MAGNET/SHIELD/…/MISSILE distribution).
- **Versioned stream shift:** the new `spawnT.intel` roll consumes from the seeded stream
  (like adding 1UP/BOMB did). Seed-pinned tests may need a re-pin (forced timer/roll).
- **Balance:** rare (~14%, gated, cap 1, `timeLeft > 8`) flat +250 into the loot bucket —
  modest, occasional. Low impact.
- **Score-sync:** 250 is a score constant → add an INTEL row to the README score table.

## Verification

- **Unit** (`test/unit/intel.test.mjs`, new):
  - `POWER_META.INTEL` exists; `INTEL` is NOT in `POWER_TYPES`; NOT in `POWER_DURATION`.
  - collecting an `INTEL` pickup (place on the player, `s.fx.X2 = 0`) adds exactly 250 to
    `s.breakdown.loot`.
  - `spawnIntel` does not double-spawn when one already exists (gated).
- **Static pin** (`static.test.mjs`): `intelCard` rect exists (atlas, in bounds);
  `spawnIntel` + `'INTEL'` wired in game.js.
- **Full gate:** `node --test test/unit/*.test.mjs`, headless E2E (`bash test/e2e/run.sh`),
  `/build-standalone` regen + bundle-hash-sync — all green.
- **Gallery:** the pickup uses the existing pickup render; eyeball that the INTEL card badge
  reads at pickup size (reuse the loot/1UP gallery scene if present).

## Risks

- **Rect tighten:** the intel card sits next to the 1UP badge (640,46) — verify the crop
  excludes the heart.
- **Glyph fallback:** `'ⓘ'` is the vector-fallback glyph (when the atlas is undecoded); confirm
  it renders (fallback only — the sprite is the real visual).
- **Re-pin churn:** the stream shift may break a seed-pinned test; budget a re-pin.

## Vision status (after F7)

This is the **natural end** of the atlas-reflection vision. The genuinely-remaining unused
sprites are either UI chrome already covered by the `ui-kit` sheet / DOM HUD (section-6
warning-triangle + skull-hex ≈ the ui-kit WARNING/BOSS banners; section-8 `miniIcon` ≈ the DOM
HUD / favicon) or deferred hazards that overlap shipped systems (section-2 mace-chain,
section-5 hazard-stripe, section-3 teleporter/hex pads ≈ portal/fence, antenna spire). Per the
"natural not forced" rule, adding those would be forced duplication. F7 is the last clean,
natural reflection; the roadmap completes here unless a specific element is later re-scoped.
