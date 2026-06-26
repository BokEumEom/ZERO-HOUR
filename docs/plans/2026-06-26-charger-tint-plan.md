# Charger Enemy Tint — Player-Confusion Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-tint the foeCharger atlas sprite red so the teal "charger" enemy no longer
reads like the teal player ship (especially under the targeting reticle).

**Architecture:** Reuse the existing build-once offscreen-tint pattern (`playerCanvas`).
Add a `FOE_TINTS` map + a cached `foeTintCanvas(key)` builder, and have `SP.draw()` blit
the cached red-tinted canvas for tinted foe keys. Pure cosmetic — no sim/score/RNG/collision
impact; hot path stays allocation-free (cache built once when the atlas decodes).

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D.

---

## File Structure

- `js/games/neonvortex/sprites.js` — `FOE_TINTS` map, `foeTintCanvas` builder, `draw()` hook.
- `test/unit/static.test.mjs` — pin.
- (`render.js` unchanged — `drawFoe` already calls `SP.draw(ctx, 'foeCharger', …)`.)

---

### Task 1: Add the cached foe tint

**Files:**
- Modify: `js/games/neonvortex/sprites.js` — after the `playerCache`/`HULL_FRAMES` block
  (~line 130) add the tint map + builder; extend `draw()` (~line 211).

- [ ] **Step 1: Add FOE_TINTS map + foeCache + foeTintCanvas builder**

Insert after `const HULL_FRAMES = new Set(...)` (line 130):

```javascript
  // Foe sprites that reuse a player-like atlas ship are re-tinted to a hostile
  // colour so they never read as the player. Build-once offscreen cache (same
  // recipe as playerCanvas): base sprite -> source-atop tint -> multiply shade
  // -> re-mask to the sprite's alpha. Cosmetic only.
  const FOE_TINTS = {
    foeCharger: { tint: 'rgba(255, 70, 90, 0.62)', shade: 'rgba(150, 20, 40, 0.4)' },
  };
  const foeCache = {}; // key -> { canvas, builtReady }

  function foeTintCanvas(key) {
    const def = FOE_TINTS[key];
    if (!def) return null;
    const cached = foeCache[key];
    if (cached && cached.builtReady) return cached.canvas;
    if (!decoded()) return null;
    const r = A[key];
    const c = (cached && cached.canvas) || document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, r.w, r.h);
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = def.tint; cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = def.shade; cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-over';
    foeCache[key] = { canvas: c, builtReady: true };
    return c;
  }
```

- [ ] **Step 2: Hook the tint into draw()**

In `draw()` (line 211), change the `tinted` selection from:

```javascript
    const tinted = HULL_FRAMES.has(key) ? playerCanvas(key, paint) : null;
```
to:
```javascript
    const tinted = HULL_FRAMES.has(key) ? playerCanvas(key, paint) : (FOE_TINTS[key] ? foeTintCanvas(key) : null);
```

(The existing `if (rot) {...} else if (tinted) {...} else {...}` blit logic already uses
`tinted`, so the rotated charger draw picks up the red cache automatically.)

- [ ] **Step 3: Visual check via gallery**

Run: `bash test/e2e/gallery.sh` then read `/tmp/sy-gallery/1-playfield.png`
Expected: the charger foe is now red/hostile, clearly distinct from the teal player ship.
If still too teal, raise the tint alpha / darken the shade in `FOE_TINTS.foeCharger`.

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/sprites.js
git commit -m "fix: re-tint foeCharger red so it no longer reads as the player ship"
```

---

### Task 2: Static pin + full suite + finish

**Files:**
- Modify: `test/unit/static.test.mjs`

- [ ] **Step 1: Add a static pin**

After the difficulty pin block in `static.test.mjs`, add:

```javascript
test('foeCharger is re-tinted (not player-coloured) via cached canvas', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /FOE_TINTS\s*=/, 'FOE_TINTS map present');
  assert.match(spr, /foeCharger:\s*\{\s*tint:/, 'foeCharger has a tint def');
  assert.match(spr, /function foeTintCanvas/, 'foeTintCanvas builder present');
  assert.match(spr, /FOE_TINTS\[key\] \? foeTintCanvas\(key\)/, 'draw() applies the foe tint');
});
```

- [ ] **Step 2: Full suite (×2)**

Run (×2): `bash test/run-all.sh`
Expected: unit+static PASS, E2E PASS (re-run on the known boot/settings startup flake),
standalone OUT OF SYNC until Step 4.

- [ ] **Step 3: Commit the pin**

```bash
git add test/unit/static.test.mjs
git commit -m "test: pin foeCharger red-tint wiring"
```

- [ ] **Step 4: performance audit + finish**

Dispatch `performance-analyzer` over `sprites.js` (confirm the tint canvas is built once,
not per frame; hot-path `draw()` blit unchanged). Then use
superpowers:finishing-a-development-branch — merge `feat/charger-tint` to `main` `--no-ff`,
delete the branch, regenerate `standalone.html`, confirm the hash gate GREEN, commit it.

---

## Self-Review

- **Spec coverage:** tint map + builder + draw hook (Task 1) · pin + audit + merge (Task 2).
- **Placeholder scan:** none.
- **Type consistency:** `FOE_TINTS` / `foeCache` / `foeTintCanvas` consistent; the `draw()`
  hook mirrors the `HULL_FRAMES`/`playerCanvas` shape; `foeCharger` key matches the `A` rect
  and the `drawFoe` call site (no render.js change needed).
