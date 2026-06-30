# G4 — Boost Pad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a seeded friendly "boost pad" floor object (section-3 ring-node + up-arrow sprites): flying over an armed pad grants a short `fx.BOOST`.

**Architecture:** New `s.pads` list with seeded `spawnPad`, an armed/cooldown update loop (overlap → grant `fx.BOOST`), and a `drawPad` floor render pass. Mirrors existing seeded-spawn + overlap-pickup patterns. NOT a portal/teleport.

**Tech Stack:** Vanilla JS IIFE on `window.SY`; Canvas 2D; `node --test`. Arena W=960, H=600.

**Spec:** `docs/plans/2026-06-30-boost-pad-g4-design.md`.

**Conventions (critical):**
- Spawn randomness uses `s.rng()` ONLY — never `Math.random()` (static suite pins game.js Math.random).
- This ADDS seeded RNG consumption → the daily map stream shifts (intended versioned change). If a seed-pinned test in another file breaks, RE-PIN it deterministically (force `s.spawnT.*` / inject state), don't chase magic numbers. Run the FULL unit suite.
- Boost pad awards NO score (pure buff) → no README score-table change.
- Do NOT reintroduce any portal/teleport. The pad only grants a buff in place.
- Hot path: cap 1, in-place state, `SP.draw` + vector fallback, balanced save/restore, no per-frame alloc.
- Never hand-edit `standalone.html` (hook-blocked); regenerate in Task 4.

---

### Task 1: Add the pad rects

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (`A` table — after the G3 `flailBall` line)
- Test: `test/unit/pad.test.mjs` (Create)

- [ ] **Step 1: Write the failing test**

Create `test/unit/pad.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('the boost-pad rects exist on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    padRing:  { x: 34, y: 392, w: 117, h: 95 },
    padArrow: { x: 152, y: 273, w: 74, h: 99 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/pad.test.mjs`
Expected: FAIL — `padRing rect exists`.

- [ ] **Step 3: Add the rects**

In `js/games/neonvortex/sprites.js`, immediately after the `flailBall:` line (the last `A` entry from G3), add:

```javascript
    // G4 boost pad (section-3 INTERACTIVE/WORLD) — friendly floor buff (render.js drawPad)
    padRing:     { x: 34,  y: 392, w: 117, h: 95 }, // hovering ring node — pad base
    padArrow:    { x: 152, y: 273, w: 74,  h: 99 }, // up-arrow — armed glyph
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/pad.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/sprites.js test/unit/pad.test.mjs
git commit -m "feat: add G4 boost-pad atlas rects (padRing, padArrow)"
```

---

### Task 2: Pad entity — spawn, arm/cooldown, boost grant (game.js)

**Files:**
- Modify: `js/games/neonvortex/game.js` (freshState ~151; spawnT ~163; helper after `spawnFlail`; update block after the power-up pickup loop ~1111)
- Test: `test/unit/pad.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/pad.test.mjs`:

```javascript
const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}

test('flying over an armed pad grants fx.BOOST and disarms it', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.BOOST = 0;
  s.pads = [{ x: s.player.x, y: s.player.y, r: 30, life: 14, cd: 0, armed: true, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.fx.BOOST > 0, 'pad granted a boost');
  assert.equal(s.pads[0].armed, false, 'pad disarmed after use');
  assert.ok(s.pads[0].cd > 0, 'pad entered cooldown');
});

test('a disarmed pad re-arms after its cooldown', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.pads = [{ x: 60, y: 60, r: 30, life: 14, cd: 5, armed: false, phase: 0 }];
  for (let i = 0; i < 60 * 6; i++) G.update(1 / 60);
  assert.ok(s.pads.length === 1 && s.pads[0].armed, 'pad re-armed after cooldown');
});

test('a pad is removed at end of life', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.pads = [{ x: 60, y: 60, r: 30, life: 0.05, cd: 0, armed: true, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.pads.length, 0, 'expired pad removed');
});

test('same daily seed -> identical pad layout (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 40; i++) {
      G.update(1 / 60);
      if (st.pads.length) trace.push(st.pads.map((pd) => `${Math.round(pd.x)},${Math.round(pd.y)}`).join(';'));
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical pad layout for the same seed');
  assert.ok(a.length > 0, 'at least one pad spawned in 40s (not trivially empty)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/pad.test.mjs`
Expected: FAIL — `s.pads` is undefined (grant/re-arm tests fail).

- [ ] **Step 3: Add freshState list, spawnT, helper, and update block**

In `js/games/neonvortex/game.js`:

1. freshState (~151) — add `pads: []` to the entity-list line (the one with `flails: []`):

```javascript
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [], foes: [], crates: [], tokens: [], drones: [], fences: [], flails: [], pads: [],
```

2. `spawnT` (~163) — add `pad: 9`:

```javascript
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, fence: 11, flail: 13, pad: 9, oneup: 16, bomb: 18, intel: 17 },
```

3. After the `spawnFlail` function, add:

```javascript
  // ---- G4 boost pad: a seeded friendly floor object; overlap grants fx.BOOST ----
  function spawnPad(s) {
    const x = 140 + s.rng() * (W - 280);
    const y = 130 + s.rng() * (H - 240);
    s.pads.push({ x, y, r: 30, life: 14, cd: 0, armed: true, phase: 0 });
  }
```

4. Update block — insert AFTER the power-up pickup loop (the `for (let i = s.pows.length - 1; ...)` loop, which ends ~1111) and BEFORE the `// ---------- boss ----------` line:

```javascript
    // ---------- spawn + update boost pads (G4) ----------
    s.spawnT.pad -= dt;
    if (s.spawnT.pad <= 0) {
      s.spawnT.pad = 14 + s.rng() * 8;
      if (s.pads.length < 1) spawnPad(s); // cap 1, all difficulties (positive buff)
    }
    for (let i = s.pads.length - 1; i >= 0; i--) {
      const pd = s.pads[i];
      pd.phase += dt * 3; pd.life -= dt;
      if (pd.cd > 0) { pd.cd -= dt; if (pd.cd <= 0) pd.armed = true; }
      if (pd.armed && dist2(pd, p) < (pd.r + p.r) * (pd.r + p.r)) {
        s.fx.BOOST = Math.max(s.fx.BOOST, 4); // 4s overdrive (speed + fire)
        pd.armed = false; pd.cd = 5;
        wave(s, pd.x, pd.y, 70, '#7dff8a'); SY.audio.powerup();
      }
      if (pd.life <= 0) s.pads.splice(i, 1);
    }
```

(Confirm `p` = `s.player` is in scope here — the power-up loop just above uses `p`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/pad.test.mjs`
Expected: PASS (all pad behavior tests).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/pad.test.mjs
git commit -m "feat: G4 boost pad — seeded spawn + arm/cooldown + fx.BOOST grant"
```

---

### Task 3: Render the pad (floor) + static pin

**Files:**
- Modify: `js/games/neonvortex/render.js` (add `drawPad`; call it on the floor, right after the `s.waves` loop ~612)
- Modify: `test/unit/static.test.mjs`

- [ ] **Step 1: Add drawPad**

In `js/games/neonvortex/render.js`, add the `drawPad` function (place near `drawFence`/`drawFlail`):

```javascript
  function drawPad(ctx, pd) {
    ctx.save(); // pad base ring (dim on cooldown)
    ctx.globalAlpha = pd.armed ? 1 : 0.4;
    if (!SP.draw(ctx, 'padRing', pd.x, pd.y, pd.r * 2.4, 0)) {
      ctx.strokeStyle = '#2de2c6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(pd.x, pd.y, pd.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (pd.armed) { // up-arrow glyph, additive pulse
      ctx.save();
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(pd.phase * 3);
      ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'padArrow', pd.x, pd.y - 14, 40, 0);
      ctx.restore();
    }
  }
```

- [ ] **Step 2: Call drawPad on the floor (under entities)**

In `render.js`, find the `s.waves` loop (it ends with `}` near line 612, just before `for (const c of s.crystals) drawCrystal(...)`). Immediately after the waves loop's closing `}` and before the crystals line, add:

```javascript
    for (const pd of s.pads) drawPad(ctx, pd);
```

- [ ] **Step 3: Add the static pin**

In `test/unit/static.test.mjs`, using the existing `read`/`NV` helpers, add after the G3 pin:

```javascript
test('G4 boost pad is wired (seeded spawn + floor render)', () => {
  const game = read(`${NV}/game.js`);
  const render = read(`${NV}/render.js`);
  assert.ok(/function spawnPad/.test(game), 'game.js defines spawnPad');
  assert.ok(game.includes('s.pads'), 'game.js uses s.pads');
  assert.ok(/function spawnPad[\s\S]{0,200}s\.rng\(/.test(game), 'spawnPad is seeded');
  assert.ok(/function drawPad/.test(render) && render.includes('padRing'), 'render.js draws the pad');
});
```

- [ ] **Step 4: Run the full suite**

Run: `node --test test/unit/*.test.mjs`
Expected: pad + static tests PASS; `Math.random` baseline pin still passes (game.js gained only `s.rng`). **If a seed-pinned test in another file fails (daily stream shifted), re-pin it deterministically** (force `s.spawnT.*` / inject state), the way fence/world tests do. Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: render the G4 boost pad (floor) + static pin"
```

(If you re-pinned another test, include it here with a message noting the daily-stream version shift.)

---

### Task 4: Full verification + standalone regen

**Files:**
- Modify: `standalone.html` (regenerated)

- [ ] **Step 1: Full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: ALL PASS (prior 231 + pad tests + static pin; any re-pins green).

- [ ] **Step 2: E2E**

Run: `bash test/e2e/run.sh`
Expected: ALL PASS (55). If no headless browser, report rather than claim a pass.

- [ ] **Step 3: Regenerate standalone + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html`
Verify in sync: `node .claude/skills/build-standalone/build.mjs /tmp/sa-g4.html && cmp standalone.html /tmp/sa-g4.html` → no output = identical.

- [ ] **Step 4: Commit**

```bash
git add standalone.html
git commit -m "build: regenerate standalone bundle for G4 boost pad"
```

- [ ] **Step 5: Audits (controller-run)**

- `rng-fairness-auditor` — expect PASS (pad spawn seeded; buff deterministic; no new Math.random; daily stream shift is the intended versioned change).
- `performance-analyzer` — expect PASS (cap 1, no per-frame alloc, SP.draw, balanced save/restore).
- Gallery: add a temporary scene with an armed pad and a cooldown pad, capture, eyeball, revert the gallery edit.

---

## Self-Review

**Spec coverage:** padRing/padArrow rects → Task 1 ✅; seeded spawnPad + freshState/spawnT + arm/cooldown/overlap-grant-BOOST + lifetime → Task 2 ✅; drawPad floor render (dim on cooldown, armed arrow pulse) → Task 3 ✅; seeded determinism + full suite + re-pin + bundle + audits → Tasks 2-4 ✅; no-portal / no-score / daily-shift handling called out (conventions + Task 3 Step 4) ✅; glass-tube/antenna deferred (spec) ✅.

**Placeholder scan:** None. The static "seeded" regex matches `spawnPad`→`s.rng`. Tests are full code.

**Type consistency:** Pad object `{x,y,r,life,cd,armed,phase}` is identical across spawnPad, the update loop, drawPad (`pd.x/y/r/armed/phase`), and every test injection. List `s.pads` + timer `s.spawnT.pad` consistent across freshState, update, render, tests. Buff is `s.fx.BOOST` (existing fx field). ✅
