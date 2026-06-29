# Elements-Sheet Art Swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap seven high-value gameplay sprites (crystals, the mine, player/enemy bolts, the explosion burst) from `sprite-atlas.png` to the crisper, unused `sprite-elements.png`, with no change to simulation, fairness, scoring, or the player/hull/boss systems.

**Architecture:** `sprites.js` gains a second gameplay `Image` (`gpSheet`) loaded from `assets/sprite-elements.png`. Selected entries in the `A` rect table carry a `sheet: 'el'` tag plus their elements-sheet coords; two helpers (`sheetFor`, `decodedFor`) route `draw()`/`drawFit()` to the right image and decode-guard. Untagged keys, all tint caches, and every other system are untouched. Pure cosmetic.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors in a `vm` sandbox.

**Spec:** `docs/plans/2026-06-29-elements-art-swap-design.md`.

---

## File Structure

- `js/games/neonvortex/sprites.js` — add the `gpSheet` load + `sheetFor`/`decodedFor`
  helpers; tag 7 keys in `A` with `sheet:'el'` + verified elements coords; route
  `draw()`/`drawFit()` through the helpers. (Single source file changed.)
- `test/unit/elements-art.test.mjs` — NEW. Structural + guard tests for the swap.
- Verification only (no code): `test/e2e/gallery.sh` (eyeball), `/build-standalone`
  (regenerate bundle), `test/run-all.ps1` (full gate).

**Verified rects** (full-resolution crop-tightened from `assets/sprite-elements.png`,
1448×1086; each visually confirmed clean):

| key | x | y | w | h |
|---|---|---|---|---|
| crystalTeal  | 875  | 565 | 98  | 187 |
| crystalAmber | 872  | 787 | 99  | 187 |
| crystalLarge | 875  | 565 | 98  | 187 (same teal art; game scales + brightens) |
| enemySmall   | 1320 | 174 | 100 | 86  |
| bulletTeal   | 60   | 537 | 26  | 102 |
| bulletPink   | 277  | 541 | 21  | 84  |
| burst        | 82   | 810 | 273 | 223 |

---

## Task 1: Elements sheet load, routing, and rect tags

**Files:**
- Create: `test/unit/elements-art.test.mjs`
- Modify: `js/games/neonvortex/sprites.js`

- [ ] **Step 1: Write the failing test**

Create `test/unit/elements-art.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const load = () => loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites;

// verified, crop-tightened elements-sheet rects (assets/sprite-elements.png 1448×1086)
const EL_RECTS = {
  crystalTeal:  { x: 875,  y: 565, w: 98,  h: 187 },
  crystalAmber: { x: 872,  y: 787, w: 99,  h: 187 },
  crystalLarge: { x: 875,  y: 565, w: 98,  h: 187 },
  enemySmall:   { x: 1320, y: 174, w: 100, h: 86  },
  bulletTeal:   { x: 60,   y: 537, w: 26,  h: 102 },
  bulletPink:   { x: 277,  y: 541, w: 21,  h: 84  },
  burst:        { x: 82,   y: 810, w: 273, h: 223 },
};

test('swapped keys point at the elements sheet with verified rects', () => {
  const A = load().atlas;
  for (const [key, r] of Object.entries(EL_RECTS)) {
    assert.equal(A[key] && A[key].sheet, 'el', `${key} must be tagged sheet:'el'`);
    assert.deepEqual({ x: A[key].x, y: A[key].y, w: A[key].w, h: A[key].h }, r, `${key} rect`);
    assert.ok(
      A[key].x >= 0 && A[key].x + A[key].w <= 1448 && A[key].y >= 0 && A[key].y + A[key].h <= 1086,
      `${key} within sheet bounds`,
    );
  }
});

test('excluded keys stay on the atlas (no sheet tag)', () => {
  const A = load().atlas;
  for (const key of ['player', 'boss', 'bossCore', 'enemyMid', 'enemyBig', 'foeHunter', 'crystalBoss', 'beam', 'lootCrate', 'portal']) {
    assert.equal(A[key] && A[key].sheet, undefined, `${key} must remain atlas (no sheet tag)`);
  }
});

test('draw()/drawFit() guard on the per-rect decode state (vector fallback in headless)', () => {
  const SP = load();
  // Image stub never decodes (complete=false) -> draw returns false so callers fall
  // back to their vector shapes, for BOTH the elements sheet and the atlas.
  assert.equal(SP.draw({}, 'crystalTeal', 0, 0, 20, 0), false, 'el key falls back when undecoded');
  assert.equal(SP.draw({}, 'boss', 0, 0, 20, 0), false, 'atlas key falls back when undecoded');
  assert.equal(SP.drawFit({}, 'player', 0, 0, 20, 20, 0), false, 'drawFit falls back when undecoded');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/elements-art.test.mjs`
Expected: FAIL — the swapped keys still hold their old atlas coords and have no `sheet` field.

- [ ] **Step 3: Add the elements sheet + routing helpers**

In `js/games/neonvortex/sprites.js`, find:

```js
  uiSheet.src = 'assets/ui-kit.png';
  const UI = {
```

Replace with:

```js
  uiSheet.src = 'assets/ui-kit.png';

  // ---- elements sheet: a crisper second gameplay kit (assets/sprite-elements.png).
  // A subset of keys in `A` carry `sheet: 'el'` and are blitted from here instead of
  // the atlas. Same decode guard as the atlas (covers the standalone case).
  const gpSheet = new Image();
  let gpReady = false;
  gpSheet.onload = () => { gpReady = true; };
  const gpDecoded = () => gpReady || (gpSheet.complete && gpSheet.naturalWidth > 0);
  gpSheet.src = 'assets/sprite-elements.png?v=1';
  // Resolve the backing sheet / decode-state for a rect (atlas unless tagged 'el').
  const sheetFor = (r) => (r.sheet === 'el' ? gpSheet : sheet);
  const decodedFor = (r) => (r.sheet === 'el' ? gpDecoded() : decoded());

  const UI = {
```

- [ ] **Step 4: Tag the seven swapped rects with elements coords**

In the `const A = {` table, replace these six lines:

```js
    enemySmall:  { x: 1124, y: 62,  w: 68,  h: 60  }, // round red orb-eye (mine)
    crystalTeal: { x: 216,  y: 734, w: 40,  h: 64  }, // collectible crystal (normal)
    crystalAmber:{ x: 400,  y: 730, w: 46,  h: 64  }, // amber gem — surge (HEAT) crystals
```
```js
    bulletTeal:  { x: 872,  y: 270, w: 42,  h: 120 }, // player shot (cyan energy bolt)
    bulletPink:  { x: 964,  y: 274, w: 50,  h: 114 }, // enemy/boss shot (red missile)
```
```js
    burst:       { x: 1224, y: 278, w: 98,  h: 90  }, // destruction explosion
```

with (note `crystalBoss` and `beam` between them stay ATLAS — do not touch them):

```js
    enemySmall:  { x: 1320, y: 174, w: 100, h: 86,  sheet: 'el' }, // crisp spiked orb (mine) — elements sheet
    crystalTeal: { x: 875,  y: 565, w: 98,  h: 187, sheet: 'el' }, // collectible crystal (normal) — elements sheet
    crystalAmber:{ x: 872,  y: 787, w: 99,  h: 187, sheet: 'el' }, // amber gem — surge (HEAT) crystals — elements sheet
```
```js
    bulletTeal:  { x: 60,   y: 537, w: 26,  h: 102, sheet: 'el' }, // player shot (cyan bolt) — elements sheet
    bulletPink:  { x: 277,  y: 541, w: 21,  h: 84,  sheet: 'el' }, // enemy/boss shot (red bolt) — elements sheet
```
```js
    burst:       { x: 82,   y: 810, w: 273, h: 223, sheet: 'el' }, // destruction explosion — elements sheet
```

Then replace the `crystalLarge` line:

```js
    crystalLarge:{ x: 36,   y: 706, w: 44, h: 95 }, // rare large value gem (section 7 — largest teal crystal)
```

with (reuses the teal-crystal art; the game already scales it up + brightens the glow):

```js
    crystalLarge:{ x: 875,  y: 565, w: 98, h: 187, sheet: 'el' }, // rare large gem — elements teal crystal (scaled + brighter)
```

- [ ] **Step 5: Route `draw()` through the helpers**

Replace the `draw` function:

```js
  function draw(ctx, key, x, y, size, rot) {
    if (!decoded()) return false;
    const r = A[key];
    if (!r) return false;
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    const tinted = HULL_FRAMES.has(key) ? playerCanvas(key, paint) : (FOE_TINTS[key] ? foeTintCanvas(key) : null);
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (tinted) ctx.drawImage(tinted, -dw / 2, -dh / 2, dw, dh);
      else ctx.drawImage(sheet, r.x, r.y, r.w, r.h, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else if (tinted) {
      ctx.drawImage(tinted, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, x - dw / 2, y - dh / 2, dw, dh);
    }
    return true;
  }
```

with:

```js
  function draw(ctx, key, x, y, size, rot) {
    const r = A[key];
    if (!r || !decodedFor(r)) return false;
    const img = sheetFor(r);
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    const tinted = HULL_FRAMES.has(key) ? playerCanvas(key, paint) : (FOE_TINTS[key] ? foeTintCanvas(key) : null);
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (tinted) ctx.drawImage(tinted, -dw / 2, -dh / 2, dw, dh);
      else ctx.drawImage(img, r.x, r.y, r.w, r.h, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else if (tinted) {
      ctx.drawImage(tinted, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      ctx.drawImage(img, r.x, r.y, r.w, r.h, x - dw / 2, y - dh / 2, dw, dh);
    }
    return true;
  }
```

(The `tinted` keys — hull frames / foe tints — are never `sheet:'el'`, so `img` is the
atlas for them; the tinted-canvas branches are unchanged.)

- [ ] **Step 6: Route `drawFit()` through the helpers**

Replace the top of `drawFit` (down through the two `drawImage(sheet, …)` calls):

```js
  function drawFit(ctx, key, x, y, w, h, rot) {
    if (!decoded()) return false;
    const r = A[key];
    if (!r) return false;
    // note: drawFit blits the raw atlas (no paint tint) — not for hull frames.
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, x - w / 2, y - h / 2, w, h);
    }
```

with:

```js
  function drawFit(ctx, key, x, y, w, h, rot) {
    const r = A[key];
    if (!r || !decodedFor(r)) return false;
    const img = sheetFor(r);
    // note: drawFit blits the raw sheet (no paint tint) — not for hull frames.
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(img, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, r.x, r.y, r.w, r.h, x - w / 2, y - h / 2, w, h);
    }
```

- [ ] **Step 7: Run the new test to verify it passes**

Run: `node --test test/unit/elements-art.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 8: Run the full unit suite (no regressions)**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS — all suites green (the existing `sprites.test.mjs` hull/icon tests still
pass; no rect they assert was changed).

- [ ] **Step 9: Commit**

```bash
git add js/games/neonvortex/sprites.js test/unit/elements-art.test.mjs
git commit -m "feat: swap crystals/mine/bolts/burst to the crisper sprite-elements sheet"
```

---

## Task 2: Visual confirmation in the render gallery

**Files:** none modified — run the existing dev tool and eyeball.

The gallery boots the real page headless and paints representative render states
(crystals, mines, bullets, bursts already appear in its scenes), saving PNGs for
eyeballing. This confirms the new art decodes and renders at the right scale/orientation.

- [ ] **Step 1: Run the gallery**

Run: `bash test/e2e/gallery.sh /tmp/sy-gallery`
Expected: PNGs written to `/tmp/sy-gallery` (needs a headless Chromium/Edge; if none is
available the script prints a clear message — skip this task and rely on Task 3's E2E).

- [ ] **Step 2: Eyeball the output**

Open the PNGs in `/tmp/sy-gallery`. Confirm: collectible crystals are the crisp
teal/amber gems, the mine is the clean spiked orb, player/enemy bolts are the clean
bolts, and explosions use the bright burst. No blank/clipped sprites, correct scale,
crystals/bullets still oriented correctly. (No commit — verification only.)

---

## Task 3: Regenerate the standalone bundle and run the full gate

**Files:** `standalone.html` (regenerated by the user-run skill — never hand-edited; a
PreToolUse hook blocks edits).

`build.mjs` inlines `<script>`/`<style>` only and references images relatively, so
`standalone.html` does NOT grow by the sheet size — but the inlined `sprites.js` diff
changes its hash, so the bundle MUST be regenerated or the `run-all` hash-sync step fails.

- [ ] **Step 1: Regenerate the standalone bundle**

Ask the user to run `/build-standalone` (user-run skill). It rewrites `standalone.html`
from current sources.

- [ ] **Step 2: Run the full suite**

Run (on the user's Windows/PowerShell env): `pwsh -File test/run-all.ps1`
Expected: `ALL PASS` — unit + static, headless-Edge E2E, and
`PASS: standalone.html reproducible from sources`.

(If running unit-only on Linux/WSL: `node --test test/unit/*.test.mjs` for the unit
portion; the E2E + bundle-hash-sync portions need the PowerShell harness.)

- [ ] **Step 3: Commit the regenerated bundle**

```bash
git add standalone.html
git commit -m "chore: regenerate standalone.html (sprite-elements art swap)"
```

---

## Self-Review

- **Spec coverage:** swap set (Task 1 Step 4), multi-sheet mechanism + helpers (Steps 3,5,6),
  tint caches untouched (Step 5 note), vector fallback (Step 7/test), cosmetic invariant (no
  RNG/score touched — only `A` coords + draw routing changed), static unit pin (Task 1 test),
  gallery (Task 2), standalone regen + run-all (Task 3). All spec sections mapped.
- **Placeholder scan:** none — every code/edit step shows full content and exact anchors.
- **Type consistency:** helpers `sheetFor`/`decodedFor`, flag `sheet:'el'`, sheet var
  `gpSheet`/`gpReady`/`gpDecoded` used identically across Steps 3/5/6 and the test.
- **Fairness/perf:** no `Math.random`, `s.rng`, score, or spawn code touched → the
  `static.test.mjs` Math.random baseline (14) and all seed-pinned tests are unaffected;
  `draw` call count and per-frame allocations unchanged.
