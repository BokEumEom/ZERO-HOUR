# Arena Background Decor (c) — Section-5 Modular Pieces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb the unused section-5 modular pieces (hex panel, hex node, readout lines)
as faint ambient base-facility decor along the playfield edges — purely cosmetic visual
enrichment that directly addresses the original "단조롭다" (monotonous arena) complaint.

**Architecture:** A module-level `DECOR` constant in `render.js` holds a fixed, deterministic
layout (positions/size/rot/alpha computed from the constant 960×600 playfield) of section-5
sprites. `drawDecor(ctx)` blits them at low alpha with additive ('lighter') compositing so
only the neon edges glow faintly behind gameplay. Built once at load (allocation-free per
frame); no RNG, no gameplay/score/collision — daily-fairness is untouched.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D.

---

## File Structure

- `js/games/neonvortex/sprites.js` — add `decoPanel` / `decoNode` / `decoReadout` atlas rects.
- `js/games/neonvortex/render.js` — `DECOR` const + `drawDecor(ctx)`; call from `drawBackground`.
- `test/unit/static.test.mjs` — pins (rects present, drawDecor wired, rng-free).
- `README.md` — one line under the design/architecture note (optional; decor is cosmetic).

---

### Task 1: Add the section-5 decor atlas rects

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (the `A` rect table, after `crystalLarge`)

- [ ] **Step 1: Add the three verified rects**

The rects were extracted via crop+verify on white (LEARNINGS §7). Add to the `A` table
after the `crystalLarge` line:

```javascript
    decoPanel:   { x: 56,  y: 547, w: 75, h: 39 }, // section-5 dual-hex module panel (ambient decor)
    decoNode:    { x: 566, y: 530, w: 56, h: 52 }, // section-5 glowing hex node (ambient decor)
    decoReadout: { x: 624, y: 529, w: 40, h: 45 }, // section-5 readout lines panel (ambient decor)
```

- [ ] **Step 2: Commit**

```bash
git add js/games/neonvortex/sprites.js
git commit -m "feat: add section-5 decor atlas rects (panel/node/readout)"
```

---

### Task 2: Render the ambient decor layer

**Files:**
- Modify: `js/games/neonvortex/render.js` — add `DECOR` const (near the other module
  consts, ~line 17) and `drawDecor` (just before `drawBackground` at line 39); call it
  inside `drawBackground` after the grid.

- [ ] **Step 1: Add the deterministic DECOR layout const**

Add near the top module consts (after `HULL_SIZE` lines, ~line 18). Coordinates target the
fixed 960×600 playfield edges/corners, avoiding the central action zone:

```javascript
  // Ambient section-5 modular decor — fixed, deterministic edge/corner layout drawn
  // faintly behind gameplay. Cosmetic only (no rng, no sim). Built once at load.
  const DECOR = [
    { key: 'decoPanel',   x: 96,  y: 92,  size: 98, rot: 0,         alpha: 0.16 },
    { key: 'decoReadout', x: 872, y: 84,  size: 78, rot: 0,         alpha: 0.14 },
    { key: 'decoNode',    x: 70,  y: 512, size: 64, rot: 0,         alpha: 0.15 },
    { key: 'decoPanel',   x: 884, y: 520, size: 94, rot: Math.PI,   alpha: 0.15 },
    { key: 'decoNode',    x: 480, y: 40,  size: 52, rot: 0,         alpha: 0.12 },
    { key: 'decoReadout', x: 480, y: 562, size: 70, rot: Math.PI,   alpha: 0.12 },
    { key: 'decoNode',    x: 922, y: 300, size: 50, rot: 0,         alpha: 0.12 },
  ];
```

- [ ] **Step 2: Add the drawDecor function**

Add immediately before `drawBackground` (line 39):

```javascript
  // ambient facility decor (section-5). Additive low-alpha so only the neon edges
  // glow; skips entirely until the atlas decodes (no vector fallback for ambience).
  function drawDecor(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of DECOR) {
      ctx.globalAlpha = d.alpha;
      SP.draw(ctx, d.key, d.x, d.y, d.size, d.rot);
    }
    ctx.restore();
  }
```

- [ ] **Step 3: Call drawDecor from drawBackground (after the grid, before the border)**

In `drawBackground`, after the grid `ctx.stroke()` (line 47) and before/around the tint
blocks, insert the decor call so it sits behind gameplay entities. Place it right after the
grid stroke:

```javascript
    ctx.stroke();
    drawDecor(ctx); // ambient section-5 facility decor (cosmetic, behind gameplay)
```

- [ ] **Step 4: Visual sanity via the gallery**

Run: `bash test/e2e/gallery.sh` then read `/tmp/sy-gallery/playfield.png`
Expected: faint glowing hex panels/nodes/readouts in the corners/edges; the central play
area stays clear; entities remain clearly readable over the decor.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/render.js
git commit -m "feat: ambient section-5 arena decor layer (faint, deterministic, cosmetic)"
```

---

### Task 3: Static pins + README note

**Files:**
- Modify: `test/unit/static.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add the static pin**

After the BOMB pin block in `static.test.mjs`, add:

```javascript
test('section-5 arena decor is wired (cosmetic, rng-free)', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /decoPanel:\s*\{/, 'decoPanel rect');
  assert.match(spr, /decoNode:\s*\{/, 'decoNode rect');
  assert.match(spr, /decoReadout:\s*\{/, 'decoReadout rect');
  const render = read(`${NV}/render.js`);
  assert.match(render, /const DECOR = \[/, 'DECOR layout const present');
  assert.match(render, /function drawDecor/, 'drawDecor function present');
  assert.match(render, /drawDecor\(ctx\)/, 'drawDecor called in the background pass');
  assert.ok(!/DECOR[\s\S]{0,400}Math\.random/.test(render), 'decor layout uses no Math.random (deterministic)');
});
```

- [ ] **Step 2: Run the static suite**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS.

- [ ] **Step 3: Add a README note**

In the README architecture/design section (near the cockpit-frame / visual notes), add a
short line that the arena renders faint ambient section-5 facility decor (cosmetic). Keep it
to one sentence consistent with surrounding prose. (No score-table change — decor is not a
scoring or gameplay element.)

- [ ] **Step 4: Commit**

```bash
git add test/unit/static.test.mjs README.md
git commit -m "test: pin arena-decor wiring; docs: README decor note"
```

---

### Task 4: Full suite + perf audit + visual approval + finish

**Files:** none (verification + merge workflow)

- [ ] **Step 1: Run the full suite (×3)**

Run (×3): `bash test/run-all.sh`
Expected: unit+static PASS, E2E PASS (the atlas paint scenario must still render without
error with the decor layer added), standalone OUT OF SYNC until Step 4 regenerates it.

- [ ] **Step 2: performance audit**

Dispatch `performance-analyzer` over `render.js`. Expected: `drawDecor` adds ~7 sprite
blits per frame with one `save`/`restore` and no per-frame allocation (DECOR is a load-time
const; the loop allocates nothing). Confirm no new gradients/`setLineDash` and that the
additive state is balanced.

- [ ] **Step 3: Visual approval gate**

Capture `bash test/e2e/gallery.sh`, present `/tmp/sy-gallery/playfield.png` (and a
boss/elite shot) to the user. If the decor is too strong or hurts entity readability, tune
`alpha`/`size`/positions in `DECOR` and re-capture. Only proceed once the look is approved.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch — merge `feat/arena-decor` to `main`
`--no-ff`, delete the branch, regenerate `standalone.html` via `/build-standalone`, confirm
the hash gate is GREEN, commit the regenerated bundle.

---

## Self-Review

- **Spec coverage:** sprites (Task 1) · DECOR + drawDecor + background hook (Task 2) ·
  static pin + README (Task 3) · perf/visual/merge (Task 4). All design sections mapped.
- **Placeholder scan:** none. Rects are concrete (verified). Layout coordinates are concrete.
- **Type consistency:** `decoPanel`/`decoNode`/`decoReadout` keys consistent between
  sprites.js and the DECOR const; `drawDecor(ctx)` signature consistent; DECOR entry shape
  `{key,x,y,size,rot,alpha}` matches the draw loop's field access.
