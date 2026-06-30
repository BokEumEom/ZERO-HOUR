# G2 — Danger Telegraphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Draw two unused `sprite-atlas.png` section-6 telegraph badges — `warnTri` over an elite during its telegraph state, `skullHex` over a charger during its lock state.

**Architecture:** Pure render-only. Add 2 atlas rects; draw both badges in `render.js` reading existing entity state (`e.state`/`f.state`/`*.phase`). No `game.js`/`foes.js`/`elite.js`/sim changes → `Math.random` baseline 14 untouched, daily seed stream unshifted.

**Tech Stack:** Vanilla JS IIFE on `window.SY`; Canvas 2D; `node --test`.

**Spec:** `docs/plans/2026-06-30-telegraph-g2-design.md`.

**Conventions:**
- Do NOT modify game.js/foes.js/elite.js or any sim/scoring/spawn code. Only `sprites.js` (2 rects) + `render.js` (2 draw additions).
- No `Math.random`/`s.rng`. Pulse alpha from existing `*.phase` via `Math.sin` (deterministic).
- `SP.draw(ctx,key,x,y,size,rot)` returns false undecoded → badge simply not drawn (no vector fallback needed; matches decor/G1).
- Run the FULL unit suite at each test step: `node --test test/unit/*.test.mjs`.
- Never hand-edit `standalone.html` (hook-blocked); regenerate in Task 3.

---

### Task 1: Add the 2 telegraph rects

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (the `A` table — after the last entry, the G1 `fxDebris` line)
- Test: `test/unit/telegraph.test.mjs` (Create)

- [ ] **Step 1: Write the failing test**

Create `test/unit/telegraph.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('G2 telegraph rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    warnTri:  { x: 991, y: 536, w: 71, h: 95 },
    skullHex: { x: 1327, y: 545, w: 91, h: 85 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/telegraph.test.mjs`
Expected: FAIL — `warnTri rect exists` (undefined).

- [ ] **Step 3: Add the rects**

In `js/games/neonvortex/sprites.js`, immediately after the `fxDebris:` line (the last `A` entry added by G1), add:

```javascript
    // G2 danger telegraphs (section-6 BOSS/ELITE) — render-only badges (render.js)
    warnTri:  { x: 991,  y: 536, w: 71, h: 95 }, // warning triangle — elite fire telegraph
    skullHex: { x: 1327, y: 545, w: 91, h: 85 }, // skull crest — charger dash telegraph
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/telegraph.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/sprites.js test/unit/telegraph.test.mjs
git commit -m "feat: add G2 telegraph rects (warnTri, skullHex)"
```

---

### Task 2: Draw the badges (render-only) + static pin

**Files:**
- Modify: `js/games/neonvortex/render.js` (`drawElite` telegraph block ~438-445; `drawFoe` charger lock block ~375-385)
- Modify: `test/unit/static.test.mjs` (add a wiring pin)

- [ ] **Step 1: Add the warnTri badge to the elite telegraph block**

In `js/games/neonvortex/render.js`, find the elite telegraph block (`if (e.state === 'telegraph') {`, ~438). It currently draws a dashed warning ray and ends with `ctx.stroke(); ctx.restore();`. Immediately AFTER that block's closing `}` (before the `// firing beam` comment), add:

```javascript
    if (e.state === 'telegraph') { // warning-triangle badge above the elite
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.4 * Math.sin(e.phase * 8);
      ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'warnTri', e.x, e.y - (e.r + 40), 48, 0);
      ctx.restore();
    }
```

- [ ] **Step 2: Add the skullHex badge to the charger lock block**

In `render.js`, find the charger lock block (`if (f.state === 'lock') {`, ~375) which draws the dashed dash-line and ends `ctx.stroke(); ctx.restore();`. Immediately AFTER that block's closing `}` (before the `const rot = ...` line), add:

```javascript
      if (f.state === 'lock') { // skull crest above the charger (dash imminent)
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(f.phase * 10);
        ctx.globalCompositeOperation = 'lighter';
        SP.draw(ctx, 'skullHex', f.x, f.y - (f.r + 34), 40, 0);
        ctx.restore();
      }
```

- [ ] **Step 3: Add the static wiring pin**

In `test/unit/static.test.mjs`, using its existing module-source reader (match the idiom already in the file — e.g. the `read`/`readModule` helper), add:

```javascript
test('G2 telegraph badges are wired in render (state-gated)', () => {
  const render = readModule('js/games/neonvortex/render.js');
  assert.ok(render.includes('warnTri'), 'render draws warnTri');
  assert.ok(render.includes('skullHex'), 'render draws skullHex');
  // gated on the existing telegraph states
  assert.ok(/e\.state === 'telegraph'[\s\S]{0,160}warnTri/.test(render), 'warnTri gated on elite telegraph');
  assert.ok(/f\.state === 'lock'[\s\S]{0,160}skullHex/.test(render), 'skullHex gated on charger lock');
});
```

(Replace `readModule` with whatever the file already uses to read a module's text.)

- [ ] **Step 4: Run the full suite**

Run: `node --test test/unit/*.test.mjs`
Expected: PASS — telegraph rect test, the new static pin, AND the pre-existing `Math.random` baseline-14 assertion (unchanged, since game.js was not touched). If baseline-14 fails, a Math.random slipped in — remove it.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: render danger-telegraph badges (warnTri elite, skullHex charger)"
```

---

### Task 3: Verify + standalone regen

**Files:**
- Modify: `standalone.html` (regenerated)

- [ ] **Step 1: Full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: ALL PASS (G1's 222 + the new telegraph rect test + the new static pin).

- [ ] **Step 2: E2E suite**

Run: `bash test/e2e/run.sh`
Expected: ALL PASS (55). If headless browser unavailable, report rather than claim pass.

- [ ] **Step 3: Regenerate the standalone bundle + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html`
Then run the project's hash-sync check (the run-all `cmp`/`md5` comparison).
Expected: regenerated, in sync.

- [ ] **Step 4: Commit**

```bash
git add standalone.html
git commit -m "build: regenerate standalone bundle for G2 telegraphs"
```

- [ ] **Step 5: Audits (controller-run)**

- `rng-fairness-auditor` — expect PASS (render-only, no rng/Math.random; daily stream unshifted).
- `performance-analyzer` — expect PASS (2 state-gated SP.draw, no per-frame alloc, balanced save/restore).
- Gallery: eyeball elite telegraph (warning triangle) + charger lock (skull crest).

---

## Self-Review

**Spec coverage:** warnTri→elite telegraph (Task 2 Step 1) ✅; skullHex→charger lock (Task 2 Step 2) ✅; 2 rects (Task 1) ✅; render-only / no sim change (conventions + only render.js+sprites.js touched) ✅; tests + static pin + run-all + bundle (Tasks 1-3) ✅; lance/console deferred (noted in spec) ✅.

**Placeholder scan:** None. The only soft reference is `readModule` → explicitly instructed to match the file's existing reader.

**Type consistency:** Rect keys `warnTri`/`skullHex` identical across sprites.js, the rect test, the render draws, and the static pin. Draw signature `SP.draw(ctx,key,x,y,size,rot)` matches existing call sites. ✅
