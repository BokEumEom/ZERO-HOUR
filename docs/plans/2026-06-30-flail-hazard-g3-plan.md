# G3 — Spiked Flail Hazard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a telegraphed rotating tethered spiked-ball (flail) hazard using the unused `sprite-atlas.png` section-2 mace-ball sprite.

**Architecture:** Mirror the existing F5 laser-fence hazard (`s.fences`): a new `s.flails` list with a seeded `spawnFlail`, a `warn → sweep → leave` state machine in the main update, and a `drawFlail` render pass. All spawn params seeded (`s.rng`); contact damage via `hurtPlayer`; non-destructible.

**Tech Stack:** Vanilla JS IIFE on `window.SY`; Canvas 2D; `node --test`.

**Spec:** `docs/plans/2026-06-30-flail-hazard-g3-design.md`. Arena is W=960, H=600.

**Conventions (critical):**
- Spawn randomness MUST use `s.rng()` only. Do NOT add any `Math.random()` (static suite pins game.js at 14).
- This feature ADDS seeded RNG consumption → the daily map stream shifts (a deliberate versioned change). Seed-pinned tests in OTHER files (e.g. data-salvage, world, loot) may break by asserting a specific seeded outcome. When that happens, RE-PIN them deterministically (force the relevant `s.spawnT.*` timer or inject state) rather than chasing new magic values. Always run the FULL unit suite.
- Hot path: cap 1 flail, state machine, vector chain + `SP.draw` ball. Hoist the dash array to a module const (no per-frame array literal). Balanced save/restore.
- Never hand-edit `standalone.html` (hook-blocked); regenerate in Task 4.

---

### Task 1: Add the flail-ball rect

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (`A` table — after the G2 `skullHex` line)
- Test: `test/unit/flail.test.mjs` (Create)

- [ ] **Step 1: Write the failing test**

Create `test/unit/flail.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

test('the flail-ball rect exists on the atlas (no sheet tag, verified coords)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  assert.ok(A.flailBall, 'flailBall rect exists');
  assert.equal(A.flailBall.sheet, undefined, 'flailBall stays on the atlas');
  assert.deepEqual({ x: A.flailBall.x, y: A.flailBall.y, w: A.flailBall.w, h: A.flailBall.h },
    { x: 835, y: 64, w: 46, h: 54 }, 'flailBall rect');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/flail.test.mjs`
Expected: FAIL — `flailBall rect exists`.

- [ ] **Step 3: Add the rect**

In `js/games/neonvortex/sprites.js`, immediately after the `skullHex:` line (the last `A` entry from G2), add:

```javascript
    // G3 hazard (section-2 ENEMY/HAZARD) — spiked flail ball on a chain (render.js drawFlail)
    flailBall:   { x: 835, y: 64, w: 46, h: 54 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/flail.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/sprites.js test/unit/flail.test.mjs
git commit -m "feat: add G3 flail-ball atlas rect"
```

---

### Task 2: Flail entity — spawn, state machine, contact (game.js)

**Files:**
- Modify: `js/games/neonvortex/game.js` (freshState ~151; spawnT ~163; helper after `spawnFence` ~268; update block after the fence loop ~812)
- Test: `test/unit/flail.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/flail.test.mjs`:

```javascript
const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function clearHazards(s) {
  s.boss = null; s.mines = []; s.rocks = []; s.turrets = []; s.foes = []; s.ebullets = []; s.fences = [];
}

test('a flail cycles warn -> sweep -> leave and is removed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  s.flails = [{ ax: 480, ay: 300, len: 100, ang: 0, spin: 1.8, ballR: 16, state: 'warn', t: 1.0, phase: 0 }];
  const seen = new Set();
  for (let i = 0; i < 60 * 7 && s.flails.length; i++) { if (s.flails[0]) seen.add(s.flails[0].state); G.update(1 / 60); }
  assert.ok(seen.has('warn') && seen.has('sweep') && seen.has('leave'), 'cycled all three states');
  assert.equal(s.flails.length, 0, 'flail removed after leave');
});

test('a sweeping flail ball on the player damages; off the player does not', () => {
  let G = boot().SY.nvGame; let s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp0 = s.player.hp;
  // ball at (ax+len, ay) with ang 0 -> place it on the player
  s.flails = [{ ax: s.player.x - 100, ay: s.player.y, len: 100, ang: 0, spin: 1.8, ballR: 16, state: 'sweep', t: 4.5, phase: 0 }];
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'player under the ball takes damage');

  G = boot().SY.nvGame; s = play(G);
  clearHazards(s); s.player.inv = 0; s.shield = false;
  const hp1 = s.player.hp;
  s.flails = [{ ax: 60, ay: 60, len: 50, ang: 0, spin: 1.8, ballR: 16, state: 'sweep', t: 4.5, phase: 0 }];
  G.update(1 / 60);
  assert.equal(s.player.hp, hp1, 'player far from the ball is unharmed');
});

test('a flail is non-destructible (bullets pass through)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  clearHazards(s);
  s.flails = [{ ax: 480, ay: 300, len: 0, ang: 0, spin: 1.8, ballR: 16, state: 'sweep', t: 4.5, phase: 0 }];
  s.bullets = [{ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }];
  G.update(1 / 60);
  assert.equal(s.flails.length, 1, 'flail survives a bullet overlap');
});

test('easy difficulty never spawns a flail', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i = 0; i < 60 * 40; i++) G.update(1 / 60);
  assert.equal(s.flails.length, 0, 'no flails on easy');
});

test('same daily seed -> identical flail trajectory (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    const trace = [];
    for (let i = 0; i < 60 * 40; i++) {
      G.update(1 / 60);
      if (st.flails.length) trace.push(st.flails.map((f) => `${Math.round(f.ax)},${Math.round(f.ay)},${Math.round(f.len)},${f.spin.toFixed(1)}`).join(';'));
    }
    return trace.join('|');
  };
  const a = run();
  assert.equal(a, run(), 'identical flail trajectory for the same seed');
  assert.ok(a.length > 0, 'at least one flail spawned in 40s (not trivially empty)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/flail.test.mjs`
Expected: FAIL — `s.flails` is undefined (the cycle/contact tests throw or fail).

- [ ] **Step 3: Add the freshState list, spawnT timer, helper, and update block**

In `js/games/neonvortex/game.js`:

1. freshState (~151) — add `flails: []` to the entity-list line (the one with `fences: []`):

```javascript
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [], foes: [], crates: [], tokens: [], drones: [], fences: [], flails: [],
```

2. `spawnT` (~163) — add `flail: 13`:

```javascript
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, fence: 11, flail: 13, oneup: 16, bomb: 18, intel: 17 },
```

3. After the `spawnFence` function (~268), add:

```javascript
  // ---- G3 spiked flail: a seeded tethered ball that sweeps an arc (sec-2 mace) ----
  function spawnFlail(s) {
    const ax = 120 + s.rng() * (W - 240);
    const ay = 90 + s.rng() * (H - 220);
    const len = 80 + s.rng() * 60;                  // chain length
    const spin = (s.rng() < 0.5 ? -1 : 1) * 1.8;    // signed angular speed (rad/s)
    const ang = s.rng() * Math.PI * 2;              // start angle
    s.flails.push({ ax, ay, len, ang, spin, ballR: 16, state: 'warn', t: 1.0, phase: 0 });
  }
```

4. Update block — insert AFTER the fence for-loop (after line ~812, the blank line before `// ---------- crystals ----------`):

```javascript
    // ---------- spawn + update spiked flails (G3) ----------
    s.spawnT.flail -= dt;
    if (s.spawnT.flail <= 0) {
      s.spawnT.flail = 16 + s.rng() * 10;
      if (s.flails.length < 1 && s.diff.spawnMul >= 1) spawnFlail(s); // normal/hard only
    }
    for (let i = s.flails.length - 1; i >= 0; i--) {
      const fl = s.flails[i];
      fl.phase += dt * 3; fl.t -= dt;
      if (fl.state === 'warn') {
        if (fl.t <= 0) { fl.state = 'sweep'; fl.t = 4.5; SY.audio.shoot(); }
      } else if (fl.state === 'sweep') {
        fl.ang += fl.spin * dt;
        const bx = fl.ax + Math.cos(fl.ang) * fl.len, by = fl.ay + Math.sin(fl.ang) * fl.len;
        const dx = p.x - bx, dy = p.y - by;
        if (dx * dx + dy * dy < (fl.ballR + p.r) * (fl.ballR + p.r)) hurtPlayer(s, bx, by);
        if (fl.t <= 0) { fl.state = 'leave'; fl.t = 0.4; }
      } else { // leave
        if (fl.t <= 0) s.flails.splice(i, 1);
      }
    }
```

(Confirm `p` is in scope here — the fence block just above uses `p` = `s.player`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/flail.test.mjs`
Expected: PASS (all 6 flail tests).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/flail.test.mjs
git commit -m "feat: G3 spiked flail hazard — seeded spawn + warn/sweep/leave + contact"
```

---

### Task 3: Render the flail + static pin

**Files:**
- Modify: `js/games/neonvortex/render.js` (add `FLAIL_DASH` module const near `BEAM_DASH`; add `drawFlail`; call it in the entity pass near `drawFence` ~693)
- Modify: `test/unit/static.test.mjs`

- [ ] **Step 1: Add the module dash const + drawFlail**

In `js/games/neonvortex/render.js`, near the existing `const BEAM_DASH = [10, 8];`, add:

```javascript
  const FLAIL_DASH = [10, 8]; // hoisted: flail warn-circle dash (no per-frame array alloc)
```

Then add the `drawFlail` function (place it near `drawFence`):

```javascript
  function drawFlail(ctx, fl) {
    const bx = fl.ax + Math.cos(fl.ang) * fl.len, by = fl.ay + Math.sin(fl.ang) * fl.len;
    ctx.save();
    if (fl.state === 'warn') { // telegraph the sweep circle
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(fl.phase * 2);
      ctx.strokeStyle = 'rgba(255,90,120,0.6)'; ctx.lineWidth = 2; ctx.setLineDash(FLAIL_DASH);
      ctx.beginPath(); ctx.arc(fl.ax, fl.ay, fl.len, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = fl.state === 'warn' ? 0.5 : 0.9; // chain
    ctx.strokeStyle = 'rgba(255,120,150,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fl.ax, fl.ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.fillStyle = '#ff5a78'; // anchor node
    ctx.beginPath(); ctx.arc(fl.ax, fl.ay, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (!SP.draw(ctx, 'flailBall', bx, by, fl.ballR * 2.6, fl.ang * 2)) {
      ctx.save(); ctx.fillStyle = '#ff5a78';
      ctx.beginPath(); ctx.arc(bx, by, fl.ballR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
```

- [ ] **Step 2: Call drawFlail in the entity pass**

In `render.js`, find `for (const fc of s.fences) drawFence(ctx, fc);` (~693). Immediately after it add:

```javascript
    for (const fl of s.flails) drawFlail(ctx, fl);
```

- [ ] **Step 3: Add the static pin**

In `test/unit/static.test.mjs`, using the existing `read`/`NV` helpers, add after the G2 pin:

```javascript
test('G3 flail hazard is wired (seeded spawn + render)', () => {
  const game = read(`${NV}/game.js`);
  const render = read(`${NV}/render.js`);
  assert.ok(/function spawnFlail/.test(game), 'game.js defines spawnFlail');
  assert.ok(game.includes('s.flails'), 'game.js uses s.flails');
  assert.ok(/spawnFlail\(s\)[\s\S]{0,40}rng/.test(game) || /function spawnFlail[\s\S]{0,200}s\.rng\(/.test(game), 'spawnFlail is seeded');
  assert.ok(/function drawFlail/.test(render) && render.includes('flailBall'), 'render.js draws the flail');
});
```

- [ ] **Step 4: Run the full suite**

Run: `node --test test/unit/*.test.mjs`
Expected: the flail + static tests PASS. The `Math.random` baseline-14 pin must still pass (game.js gained only `s.rng` calls). **If a seed-pinned test in another file fails (the daily stream shifted), re-pin it deterministically** — force the relevant `s.spawnT.*` timer or inject the entity, the way `fence.test`/`world.test` already do; do not chase new magic numbers. Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: render the G3 flail hazard + static pin"
```

(If you had to re-pin another test, include it in this commit with a message noting the daily-stream version shift.)

---

### Task 4: Full verification + standalone regen

**Files:**
- Modify: `standalone.html` (regenerated)

- [ ] **Step 1: Full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: ALL PASS (prior 224 + flail tests + static pin; any re-pinned seed tests green).

- [ ] **Step 2: E2E**

Run: `bash test/e2e/run.sh`
Expected: ALL PASS (55). If the headless browser is unavailable, report rather than claim a pass.

- [ ] **Step 3: Regenerate standalone + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html`
Verify in sync: `node .claude/skills/build-standalone/build.mjs /tmp/sa-g3.html && cmp standalone.html /tmp/sa-g3.html` → no output = identical.

- [ ] **Step 4: Commit**

```bash
git add standalone.html
git commit -m "build: regenerate standalone bundle for G3 flail hazard"
```

- [ ] **Step 5: Audits (controller-run)**

- `rng-fairness-auditor` — expect PASS (all flail spawn params seeded; no new Math.random; daily stream shift is the intended versioned change).
- `performance-analyzer` — expect PASS (cap 1, dash const hoisted, vector + SP.draw, balanced save/restore).
- Gallery: add a temporary scene with a warn-state and a sweep-state flail, capture, eyeball, then revert the gallery edit.

---

## Self-Review

**Spec coverage:** flailBall rect → Task 1 ✅; seeded spawnFlail + freshState/spawnT + warn/sweep/leave + contact + non-destructible → Task 2 ✅; render drawFlail + dash-const hoist → Task 3 ✅; seeded determinism + easy-gating + full suite + re-pin + bundle + audits → Tasks 2-4 ✅; daily-stream-shift handling called out (conventions + Task 3 Step 4) ✅.

**Placeholder scan:** None. The static "seeded" regex has a tolerant fallback; tests contain full code.

**Type consistency:** Flail object shape `{ax,ay,len,ang,spin,ballR,state,t,phase}` is identical across spawnFlail, the update block, the render (`fl.ax/ay/len/ang/spin/ballR/state/phase`), and every test injection. List name `s.flails` and timer `s.spawnT.flail` consistent across freshState, update, render, tests. ✅
