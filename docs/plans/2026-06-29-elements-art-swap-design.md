# Elements-Sheet Art Swap — Design

**Status:** Design (approved 2026-06-29). Implementation plan to follow.

## Goal

The repo ships a second, cleaner gameplay art sheet — `assets/sprite-elements.png`
(1448×1086) — that is **completely unused in code**. Only `sprite-atlas.png` and
`ui-kit.png` are loaded. The `sprite-atlas.png`-driven vision is already complete
(all 8 sections naturally absorbed). This work swaps the **highest-value overlapping
gameplay sprites** to the crisper `elements` art, improving game feel without touching
the simulation, fairness, scoring, or the player/hull/boss systems.

`sprite-reference.png` is a labeled spec/key sheet (documents the kit's individual
PNG names) — NOT a packable atlas; it stays unused. `keyart.png` is marketing/hero
art and is out of scope.

## Scope (approach A — scoped swap)

Swap only keys that (a) map 1:1 to an `elements` element, (b) are clearly crisper,
and (c) do **not** go through any tint cache or break enemy-type distinction.

| Game key | Source (elements.png) — extracted, MUST verify | Notes |
|---|---|---|
| `crystalTeal`  | ~x876 y564 w92 h180 (largest teal gem)  | large source = crisp when downscaled |
| `crystalAmber` | ~x880 y784 w84 h180 (largest amber gem) | |
| `crystalLarge` | teal gem (same art; game differentiates by size + glow) | |
| `enemySmall` (mine) | ~x1336 y172 w84 h76 (spiked orb) | atlas mine is already a "round red orb-eye" — same identity |
| `bulletTeal`  | ~x116 y536 w24 h80 (teal bolt)  | |
| `bulletPink`  | ~x276 y540 w20 h72 (pink bolt)  | |
| `burst`       | ~x104 y832 w212 h188 (explosion) | |

**Deliberately excluded (stay on atlas):**
- `enemyMid` (turret), `enemyBig` (rock), `foeHunter` — atlas gives each foe a distinct
  silhouette/colour for type readability; `elements` has only spiked orbs, so unifying
  them would blur enemy distinction.
- `boss`, `bossCore`, `player`, hull skins (`hullUpg1-4`), state frames
  (`shielded`/`boosted`/`damaged`), paint coatings, loot (`lootCrate`/`lootCanister`/
  `lootChest`/`coin`), `portal`, `lootConsole`, `eliteCore`, power-up badges, decor —
  not present in `elements`, or central/risky.
- Shield dome + energy columns in `elements` — no existing key (would be NEW systems,
  out of this swap's scope).

## Architecture (multi-sheet sprites.js)

Today `SY.nvSprites.draw(ctx, key, x, y, size, rot)` looks up `A[key]` and blits from
the single `sheet` (atlas). Add a second gameplay sheet and route per key:

1. **Second sheet.** Load `gpSheet = new Image()` from `assets/sprite-elements.png?v=1`,
   mirroring the existing atlas `ready`/`decoded()` pattern (`onload` flag OR
   `complete && naturalWidth>0`, for the standalone data-URI case).
2. **Per-key sheet tag.** The swapped entries in `A` get a `sheet: 'el'` field plus
   their `elements` coords. Untagged keys default to the atlas sheet (no change).
3. **Routing helpers.**
   - `sheetFor(r)` → `r.sheet === 'el' ? gpSheet : sheet`
   - `decodedFor(r)` → `r.sheet === 'el' ? elDecoded() : decoded()`
   `draw()` and `drawFit()` use these instead of `sheet`/`decoded()` directly.
4. **Tint caches untouched.** `playerCanvas`, `foeTintCanvas`, and `powerIconCanvas`
   read the atlas `sheet` directly. None of the swapped keys are in `HULL_FRAMES`,
   `FOE_TINTS`, or `POWER_ICONS`, so those code paths never see an `el` key — they stay
   atlas-only and require no change. (Documented as an invariant in the plan.)
5. **Vector fallback preserved.** `draw()`/`drawFit()` return `false` until
   `decodedFor(r)` is true; callers fall back to their existing vector shapes.

## Invariants

- **Pure cosmetic.** No `s.rng()`, no new `Math.random()` (baseline 14 unchanged), no
  change to spawns/score/collision/HP/seed. Daily fairness and every seed-pinned test
  are untouched → **no fairness audit needed**.
- **Hot-path safe.** Same `drawImage` call count; no per-frame allocation. One extra
  image decode at load (~1.6 MB). `performance-analyzer` is optional, not required.
- **Rect accuracy.** Extracted rects are downscale-approximate (±4 px). Each MUST be
  re-cropped at full resolution, tightened to the true bounding box, and eyeballed on a
  white background AND in the render gallery before being committed.

## Verification

- **Static unit pin** (`test/unit/static.test.mjs` or a small new
  `elements-art.test.mjs`): assert each swapped key carries `sheet: 'el'` and a valid
  numeric rect (w,h > 0, within 1448×1086), and that the excluded keys remain atlas
  (no `sheet` field).
- **Render gallery** (`test/e2e/gallery.{mjs,html,sh}`): boot the real page headless,
  paint a scene with crystals / mine / player+enemy bullets / a burst flash, save the
  game-canvas PNG to `/tmp`, and eyeball the new art (crisp gems, spiked mine, clean
  bolts, clean explosion). Dev tool, not a CI gate.
- **`test/run-all.ps1`**: node --test + headless E2E + bundle-hash sync all pass.

## Risks

- **Standalone regeneration (NOT bundle bloat).** `build.mjs` inlines only `<script>`/
  `<style>` — images are referenced relatively (`assets/sprite-elements.png?v=1`), shipped
  alongside as files. So `standalone.html` does NOT grow ~1.6 MB; it only changes by the
  inlined `sprites.js` diff. But that diff DOES change the bundle hash → `/build-standalone`
  MUST be re-run (user-run; a PreToolUse hook blocks hand-edits) so the bundle-hash-sync
  test passes. `assets/sprite-elements.png` already exists in the repo, so no new asset ship.
- **Rect drift.** The connected-component extraction split some spiky/ringed sprites
  (boss, large mines) — those are out of scope, but it is a reminder that the in-scope
  rects (crystals, small mine, bolts, burst) must each be crop-verified, not trusted raw.
- **Cache-bust version.** Use `?v=1` on the new sheet; bump if the art is ever re-exported.

## Out of scope (possible follow-ups)

- Unifying `enemyMid`/`enemyBig`/`foeHunter` to `elements` spiked orbs (would need a
  distinction strategy — colour tint per tier).
- Boss / player base-sprite swap (approach B).
- New systems from `elements`-only art: hex shield dome, energy-column hazard/portal beam.
