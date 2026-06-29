# F5 — Laser Fence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a telegraphed cross-arena beam hazard (Laser Fence) reflecting the section-3 power-bolt node (emitters) and section-2 laser column (beam). Seeded/daily-fair, normal/hard only, cap 1, non-destructible.

**Architecture:** Inline in `game.js` (mirrors the portal pattern): a `s.fences` sub-array, a `spawnT.fence` timer, a `spawnFence` helper, and a `warn→firing→fade` state machine in `update` that calls the existing `hurtPlayer` on line contact. `render.js` gets `drawFence` (telegraph line, then a stretched `laserColumn` beam + `hazardNode` endpoints). `sprites.js` gains the two rects.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors in a `vm` sandbox.

**Spec:** `docs/plans/2026-06-29-laser-fence-f5-design.md`.

---

## File Structure

- `js/games/neonvortex/game.js` — `fences: []` + `spawnT.fence` in freshState; `spawnFence`; spawn+update block.
- `js/games/neonvortex/sprites.js` — `hazardNode` / `laserColumn` rects.
- `js/games/neonvortex/render.js` — `drawFence` + its call in the frame.
- `test/unit/fence.test.mjs` — NEW (state machine, collision, gating, fairness, rect pin).
- `test/unit/static.test.mjs` — fence-wired pin.
- `README.md` — hazard note. Verification: `/build-standalone`, E2E, gallery.

**Verified rects** (atlas sheet — no `sheet:'el'`):
`hazardNode` {335,412,60,66}, `laserColumn` {989,150,26,87}.

---

## Task 1: Laser fence simulation (game.js)

**Files:**
- Create: `test/unit/fence.test.mjs`
- Modify: `js/games/neonvortex/game.js`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/fence.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function clearHazards(s) {
  s.boss = null; s.mines = []; s.rocks = []; s.turrets = []; s.foes = []; s.ebullets = []; s.portals = [];
}

test('a laser fence cycles warn -> firing -> fade and is removed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fences = [{ orient: 'h', pos: 300, state: 'warn', t: 1.1, phase: 0 }];
  const seen = new Set();
  for (let i = 0; i < 60 * 5 && s.fences.length; i++) { if (s.fences[0]) seen.add(s.fences[0].state); G.update(1 / 60); }
  assert.ok(seen.has('warn') && seen.has('firing') && seen.has('fade'), 'cycled all three states');
  assert.equal(s.fences.length, 0, 'fence removed after fade');
});

test('a firing fence on the player line damages; off the line does not', () => {
  let G = boot().SY.nvGame; let s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  s.fences = [{ orient: 'h', pos: s.player.y, state: 'firing', t: 1.4, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'player on the beam line takes damage');

  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp1 = s.player.hp;
  s.fences = [{ orient: 'h', pos: s.player.y + 200, state: 'firing', t: 1.4, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp1, 'player off the line is unharmed');
});

test('easy difficulty never spawns a laser fence', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
  assert.equal(s.fences.length, 0, 'no fences on easy');
});

test('same daily seed -> identical fence layout (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
    return JSON.stringify(st.fences.map((f) => [f.orient, Math.round(f.pos), f.state]));
  };
  assert.equal(run(), run());
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/fence.test.mjs`
Expected: FAIL — `s.fences` stays empty / undefined; no state machine.

- [ ] **Step 3: Add `fences` + `spawnT.fence` to freshState**

Find:

```js
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [], foes: [], crates: [], tokens: [], drones: [], portals: [],
```

Replace with:

```js
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [], foes: [], crates: [], tokens: [], drones: [], portals: [], fences: [],
```

Find:

```js
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, portal: 14, oneup: 16, bomb: 18 },
```

Replace with:

```js
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, portal: 14, fence: 11, oneup: 16, bomb: 18 },
```

- [ ] **Step 4: Add the `spawnFence` helper (after `spawnPortal`)**

Find:

```js
  function spawnPortal(s) {
    s.portals.push({
      x: 120 + s.rng() * (W - 240), y: 110 + s.rng() * (H - 240),
      state: 'warn', t: 1.0, spawnT: 0, spawnsLeft: 4 + Math.floor(s.rng() * 3), phase: s.rng() * 6,
    });
  }
```

Replace with:

```js
  function spawnPortal(s) {
    s.portals.push({
      x: 120 + s.rng() * (W - 240), y: 110 + s.rng() * (H - 240),
      state: 'warn', t: 1.0, spawnT: 0, spawnsLeft: 4 + Math.floor(s.rng() * 3), phase: s.rng() * 6,
    });
  }
  // ---- F5 laser fence: telegraphed cross-arena beam (reflect sec3 node + sec2 laser) ----
  function spawnFence(s) {
    const orient = s.rng() < 0.5 ? 'h' : 'v';
    const pos = orient === 'h' ? 120 + s.rng() * (H - 240) : 120 + s.rng() * (W - 240);
    s.fences.push({ orient, pos, state: 'warn', t: 1.1, phase: 0 });
  }
```

- [ ] **Step 5: Add the spawn + update block (after the portal update loop)**

Find:

```js
      } else { // closing
        if (pt.t <= 0) s.portals.splice(i, 1);
      }
    }

    // ---------- crystals ----------
```

Replace with:

```js
      } else { // closing
        if (pt.t <= 0) s.portals.splice(i, 1);
      }
    }

    // ---------- spawn + update laser fences (F5) ----------
    s.spawnT.fence -= dt;
    if (s.spawnT.fence <= 0) {
      s.spawnT.fence = 15 + s.rng() * 9;
      if (s.fences.length < 1 && s.diff.spawnMul >= 1) spawnFence(s); // normal/hard only
    }
    const FENCE_BEAM_HALF = 11;
    for (let i = s.fences.length - 1; i >= 0; i--) {
      const fn = s.fences[i];
      fn.phase += dt * 3; fn.t -= dt;
      if (fn.state === 'warn') {
        if (fn.t <= 0) { fn.state = 'firing'; fn.t = 1.4; SY.audio.shoot(); }
      } else if (fn.state === 'firing') {
        const perp = fn.orient === 'h' ? Math.abs(p.y - fn.pos) : Math.abs(p.x - fn.pos);
        if (perp < FENCE_BEAM_HALF + p.r) hurtPlayer(s, p.x, p.y);
        if (fn.t <= 0) { fn.state = 'fade'; fn.t = 0.35; }
      } else { // fade
        if (fn.t <= 0) s.fences.splice(i, 1);
      }
    }

    // ---------- crystals ----------
```

- [ ] **Step 6: Run the fence tests → expect PASS**

Run: `node --test test/unit/fence.test.mjs`
Expected: all 4 PASS.

- [ ] **Step 7: Run the full suite; re-pin any seed-shifted test**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS. The `spawnT.fence` timer consumes from the seeded stream — a seed-pinned
probabilistic test MAY break; re-pin the established way (force the relevant timer/roll). If
nothing breaks, touch no other test. Report any re-pin.

- [ ] **Step 8: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/fence.test.mjs
git commit -m "feat: laser fence hazard — telegraphed cross-arena beam (sim)"
```

---

## Task 2: Atlas rects + render + static pin

**Files:**
- Modify: `js/games/neonvortex/sprites.js`, `js/games/neonvortex/render.js`, `test/unit/fence.test.mjs`, `test/unit/static.test.mjs`

- [ ] **Step 1: Append the rect-pin test + add the static wiring pin**

Append to `test/unit/fence.test.mjs`:

```js
test('fence atlas sprites exist (hazardNode/laserColumn)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = { hazardNode: { x: 335, y: 412, w: 60, h: 66 }, laserColumn: { x: 989, y: 150, w: 26, h: 87 } };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

Append to `test/unit/static.test.mjs` (after the existing portal/world pins):

```js
test('laser fence (F5 hazard) is wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/s\.fences/.test(game) && /function spawnFence/.test(game), 'fence state + spawn helper');
  const render = read(`${NV}/render.js`);
  assert.ok(/function drawFence/.test(render) && /s\.fences/.test(render), 'fence drawn');
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/fence.test.mjs test/unit/static.test.mjs`
Expected: FAIL — rects + `drawFence` missing.

- [ ] **Step 3: Add the two atlas rects (sprites.js)**

Find:

```js
    lootConsole: { x: 206,  y: 286, w: 96,  h: 74  }, // console objective — drops a power-up
```

Replace with:

```js
    lootConsole: { x: 206,  y: 286, w: 96,  h: 74  }, // console objective — drops a power-up
    hazardNode:  { x: 335,  y: 412, w: 60,  h: 66  }, // laser-fence emitter — power bolt (section 3)
    laserColumn: { x: 989,  y: 150, w: 26,  h: 87  }, // laser-fence beam column (section 2)
```

- [ ] **Step 4: Add `drawFence` + call it (render.js)**

Find:

```js
  function drawPortal(ctx, pt) {
```

Replace with (inserts `drawFence` immediately before `drawPortal`):

```js
  function drawFence(ctx, fn) {
    const horiz = fn.orient === 'h';
    const len = horiz ? W : H;
    const midx = horiz ? W / 2 : fn.pos, midy = horiz ? fn.pos : H / 2;
    ctx.save();
    if (fn.state === 'warn') {
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(fn.phase * 4); // pulsing telegraph
      ctx.strokeStyle = fn.t < 0.5 ? '#ff5a6e' : '#ffb028';
      ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath();
      if (horiz) { ctx.moveTo(0, fn.pos); ctx.lineTo(W, fn.pos); } else { ctx.moveTo(fn.pos, 0); ctx.lineTo(fn.pos, H); }
      ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.globalAlpha = fn.state === 'fade' ? Math.max(0, fn.t / 0.35) : 1;
      ctx.globalCompositeOperation = 'lighter';
      if (!SP.drawFit(ctx, 'laserColumn', midx, midy, 26, len, horiz ? Math.PI / 2 : 0)) {
        drawBeamRay(ctx, horiz ? 0 : fn.pos, horiz ? fn.pos : 0, horiz ? 0 : Math.PI / 2, len, 11);
      }
      SP.draw(ctx, 'hazardNode', horiz ? 20 : fn.pos, horiz ? fn.pos : 20, 30, 0);
      SP.draw(ctx, 'hazardNode', horiz ? W - 20 : fn.pos, horiz ? fn.pos : H - 20, 30, 0);
    }
    ctx.restore();
  }

  function drawPortal(ctx, pt) {
```

Find:

```js
    drawPlayer(ctx, s);
```

Replace with:

```js
    for (const fn of s.fences) drawFence(ctx, fn);
    drawPlayer(ctx, s);
```

- [ ] **Step 5: Run the tests → expect PASS**

Run: `node --test test/unit/fence.test.mjs test/unit/static.test.mjs`
Expected: all PASS.

- [ ] **Step 6: Run the full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/sprites.js js/games/neonvortex/render.js test/unit/fence.test.mjs test/unit/static.test.mjs
git commit -m "feat: render laser fence (beam + emitter nodes) with section-2/3 atlas art"
```

---

## Task 3: Regenerate standalone + full gate + gallery

**Files:** `standalone.html` (regenerated; never hand-edited — a PreToolUse hook blocks edits).

(No README change: the fence is a non-destructible hazard with no score, like the portal —
neither is in the README score table, so there is nothing to sync. Keeping parity.)

- [ ] **Step 1: Regenerate the bundle + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html && node .claude/skills/build-standalone/build.mjs /tmp/c.html && cmp standalone.html /tmp/c.html && echo SYNC_OK`
Expected: `SYNC_OK`.

- [ ] **Step 2: Headless E2E**

Run: `bash test/e2e/run.sh`
Expected: all assertions pass.

- [ ] **Step 3: Gallery eyeball**

Run: `bash test/e2e/gallery.sh /tmp/sy-gallery`
If a fence-active scene can be captured, confirm the telegraph line + beam + emitter nodes read
as a laser fence. (Dev tool; if no headless browser or no such scene, note it and rely on
Step 2 + the unit tests.)

- [ ] **Step 4: Commit**

```bash
git add standalone.html
git commit -m "chore: regenerate standalone.html (laser fence hazard)"
```

---

## Self-Review

- **Spec coverage:** state (T1 S3), spawn+gating+cap (T1 S5), spawnFence seeded layout (T1 S4),
  collision via hurtPlayer (T1 S5 + test), warn/firing/fade machine (T1 S5 + test), fairness +
  easy-gate tests (T1 S1), atlas rects (T2 S3), drawFence + call (T2 S4), static pin (T2 S1),
  README (T3), standalone+E2E+gallery (T3). All spec sections mapped.
- **Placeholder scan:** only the README line is described-not-quoted (exact location unknown
  until read); every code edit is verbatim with exact anchors.
- **Type consistency:** `fn.orient`/`fn.pos`/`fn.state`/`fn.t`/`fn.phase`, `s.fences`,
  `spawnT.fence`, `spawnFence`, `drawFence`, `FENCE_BEAM_HALF` 11, timings 1.1/1.4/0.35 used
  identically across game.js, render.js, and tests.
- **Fairness:** `spawnFence` + the spawn roll use only `s.rng()`; no new `Math.random()` →
  `static.test.mjs` baseline (14) untouched; stream-shift re-pin handled in T1 S7. Inline (no
  new module) → the static CORE-modules list is unchanged.
- **Render dims:** `drawFence` uses render.js's module-scope `W`/`H` (`const { W, H } = G`).
