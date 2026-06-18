# Zero Hour — Surge Director + HEAT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure Zero Hour's flat 60s run into a calm→surge→calm→boss rhythm using choreographed mine formations and a HEAT score multiplier during surges, fixing "simple / 60s feels long".

**Architecture:** A deterministic **Surge Director** in `game.js` schedules N surges (derived from `duration`, seeded by `s.rng`) between an 8s warmup and the boss window. Each surge spawns a **choreographed formation** of existing mine entities (scripted `entryT` entry, then existing homing). A **HEAT** multiplier rises while collecting during a surge and resets on hit, isolated into its own score-breakdown bucket. No new entity types, no new JS modules, no new art — keeps load-order/IIFE/React-free pins intact.

**Tech Stack:** Vanilla JS IIFE on `window.SY`, Canvas 2D, `node --test` (vm sandbox harness in `test/unit/helpers.mjs`), zero build tools.

**Spec:** [docs/plans/2026-06-18-zerohour-surge-pacing.md](./2026-06-18-zerohour-surge-pacing.md)

**Invariants this plan must preserve (verified against `test/unit/static.test.mjs`):**
- `game.js` `Math.random` call count must stay ≤ **14** (gameplay randomness uses `s.rng()`). All surge/formation/heat randomness uses `s.rng()`.
- `index.html` inline `style=` attribute count must stay ≤ **6** (new HUD element uses a CSS class, no inline style).
- `main.js` `.innerHTML` sink count must stay exactly **6** (HEAT score row goes inside the existing `over-stats` innerHTML; HEAT HUD badge uses `textContent`/`classList`, not innerHTML).
- Script load order `store → audio → shell → game → render → medals → main → register` unchanged (no new module files).
- Core stays React-free; 60fps hot path adds no per-frame allocations (formation mines reuse the fixed mine object shape).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `js/games/zerohour/game.js` | Surge schedule, director, formation spawn, mine entry script, HEAT state + scoring | Modify |
| `js/audio.js` | `surgeWarn()` SFX cue | Modify |
| `js/games/zerohour/render.js` | Surge telegraph banner + surge tint | Modify |
| `js/games/zerohour/main.js` | HEAT HUD badge, HEAT result-stat row | Modify |
| `index.html` | `#hud-heat` span | Modify |
| `css/style.css` | `#hud-heat` styling | Modify |
| `test/unit/surge.test.mjs` | Surge + HEAT unit tests | Create |
| `README.md` | Score table: HEAT + surge | Modify |
| `docs/adr/0010-surge-pacing-and-heat.md` | Decision record | Create |

---

## Task 1: Surge schedule + HEAT state in `freshState` (constants + deterministic builder)

**Files:**
- Modify: `js/games/zerohour/game.js` (constants near `POWER_TYPES`; `freshState`; new `buildSurges`)
- Test: `test/unit/surge.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `test/unit/surge.test.mjs`:

```js
// Surge Director + HEAT multiplier — engine-level tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

function freshGame(nowIso = '2026-03-01T00:30:00Z') {
  return loadModules(['js/store.js', 'js/games/zerohour/game.js'], { nowIso });
}
function toPlaying(sb, mode = 'free') {
  const G = sb.SY.game;
  G.start(mode);
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  assert.equal(G.phase, 'playing');
  return G;
}

test('buildSurges: 60s run schedules 2 surges inside the field window, increasing size', () => {
  const G = toPlaying(freshGame(), 'free');
  const sg = G.state.surges;
  assert.equal(sg.length, 2, 'duration 60 → floor((40-8)/16) = 2 surges');
  assert.ok(sg[0].at > 8 && sg[0].at < sg[1].at && sg[1].at < 40, 'surges ordered, inside (8,40)');
  assert.deepEqual(sg.map((x) => x.size), [9, 12], 'size = 6 + 3k');
  for (const x of sg) assert.ok(['LINE', 'RING', 'PINCER'].includes(x.pattern));
});

test('buildSurges is deterministic for the same daily seed', () => {
  const a = toPlaying(freshGame(), 'daily').state.surges;
  const b = toPlaying(freshGame(), 'daily').state.surges;
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same seed → identical schedule');
});

test('freshState seeds HEAT fields and a heat breakdown bucket', () => {
  const G = toPlaying(freshGame(), 'free');
  assert.equal(G.state.heat, 0);
  assert.equal(G.state.inSurge, false);
  assert.equal(G.state.heatMul, 1);
  assert.equal(G.state.breakdown.heat, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/surge.test.mjs`
Expected: FAIL — `G.state.surges` is `undefined`, `heat`/`inSurge`/`heatMul`/`breakdown.heat` missing.

- [ ] **Step 3: Add constants and the deterministic builder**

In `js/games/zerohour/game.js`, right after the `POWER_META` block (around line 16), add:

```js
  // ---- surge director tuning ----
  const SURGE_WARMUP = 8;     // calm intro before the first surge (s)
  const SURGE_GAP_DIV = 16;   // field seconds per surge (count = floor(fieldLen / this))
  const SURGE_DUR = 6;        // how long a surge stays "hot" (s)
  const SURGE_WARN = 1.2;     // telegraph lead time (s)
  const SURGE_PATTERNS = ['LINE', 'RING', 'PINCER'];

  // ---- HEAT multiplier tuning (checked high → low) ----
  const HEAT_X2_CAP = 4;      // ceiling on combined X2 × HEAT multiplier
  const HEAT_TIERS = [ { at: 26, mul: 2 }, { at: 14, mul: 1.5 }, { at: 6, mul: 1.25 } ];

  function buildSurges(s) {
    const fieldEnd = s.duration >= 40 ? s.duration - 20 : s.duration; // boss owns the last 20s
    const fieldStart = SURGE_WARMUP;
    const fieldLen = fieldEnd - fieldStart;
    if (fieldLen <= 0) return [];
    const n = Math.max(1, Math.floor(fieldLen / SURGE_GAP_DIV));
    // seeded pattern bag (Fisher–Yates with s.rng — daily fairness)
    const bag = SURGE_PATTERNS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(s.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const surges = [];
    for (let k = 1; k <= n; k++) {
      surges.push({
        at: fieldStart + fieldLen * (k / (n + 1)), // even spacing, margins both ends
        size: 6 + 3 * k,
        pattern: bag[(k - 1) % bag.length],
      });
    }
    return surges;
  }
```

- [ ] **Step 4: Wire surge + HEAT fields into `freshState`**

In `freshState`, add the HEAT bucket to `breakdown` and the surge/heat fields, then build the schedule before returning. Change the function body so it assigns the object to a const, builds surges, and returns it:

Replace the `breakdown:` line:
```js
      breakdown: { crystals: 0, combo: 0, destruction: 0, boss: 0 },
```
with:
```js
      breakdown: { crystals: 0, combo: 0, destruction: 0, boss: 0, heat: 0 },
```

Add these fields to the same returned object literal (next to `shield`/`freeze`):
```js
      surges: [], surgeIdx: 0, surgeWarnT: 0, surgeActiveT: 0, inSurge: false,
      heat: 0, heatMul: 1,
```

Then change the `return { ... }` so the schedule is built from the live `s.rng`:
```js
  function freshState(mode, seedStr) {
    const rng = SY.makeRng(seedStr);
    const duration = Math.round(SY.tweaks.duration);
    const st = {
      // ...all existing fields, with breakdown.heat and the surge/heat fields above...
    };
    st.surges = buildSurges(st);
    return st;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/surge.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add js/games/zerohour/game.js test/unit/surge.test.mjs
git commit -m "feat(zerohour): surge schedule + HEAT state (deterministic, seeded)"
```

---

## Task 2: HEAT multiplier in scoring (`heatTier` + `addScore` rewrite)

**Files:**
- Modify: `js/games/zerohour/game.js` (`addScore`; new `heatTier`)
- Test: `test/unit/surge.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/surge.test.mjs`:

```js
// Helper: force a crystal onto the player and step one frame so the real
// collect → addScore path runs with whatever inSurge/heat we set.
function collectOneOnPlayer(G) {
  const p = G.state.player;
  G.state.crystals.push({ x: p.x, y: p.y, vx: 0, vy: 0, r: 7, phase: 0 });
  G.update(1 / 60);
}

test('HEAT bonus is isolated into breakdown.heat during a surge', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 26; // tier ×2
  const before = G.state.score;
  collectOneOnPlayer(G);
  // base = 10 + combo(→1) = 11; x2 off → x2=1; tier=2 → mul=2
  // v = round(11*2)=22; vBase = round(11*1)=11; heatBonus = 11
  assert.equal(G.state.breakdown.heat, 11, 'heat bonus = v - vBase');
  assert.equal(G.state.score - before, 22, 'full multiplied value added to score');
});

test('HEAT does not apply outside a surge (tier = 1)', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = false; G.state.heat = 26; // high heat, but not in surge
  collectOneOnPlayer(G);
  assert.equal(G.state.breakdown.heat, 0, 'no heat bonus outside surge');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/surge.test.mjs`
Expected: FAIL — `breakdown.heat` stays 0 / score added without multiplier (no `heatTier` yet).

- [ ] **Step 3: Add `heatTier` and rewrite `addScore`**

Add `heatTier` just above `addScore` in `game.js`:
```js
  function heatTier(s) {
    if (!s.inSurge) return 1;
    for (const t of HEAT_TIERS) if (s.heat >= t.at) return t.mul;
    return 1;
  }
```

Replace the whole `addScore` function with:
```js
  function addScore(s, base, x, y, label, bucket) {
    const x2 = s.fx.X2 > 0 ? 2 : 1;
    const mul = Math.min(HEAT_X2_CAP, x2 * heatTier(s));
    const v = Math.round(base * mul);
    const vBase = Math.round(base * x2);      // value without the HEAT boost
    const heatBonus = v - vBase;              // isolated HEAT contribution
    s.score += v;
    if (bucket === 'crystal') {
      const combo = Math.round((base - 10) * x2); // combo part keeps integer split
      s.breakdown.crystals += vBase - combo;
      s.breakdown.combo += combo;
    } else if (bucket === 'destroy') {
      s.breakdown.destruction += vBase;
    } else if (bucket === 'boss') {
      s.breakdown.boss += vBase;
    }
    s.breakdown.heat += heatBonus;
    if (x !== undefined) floatText(s, x, y, '+' + v + (label ? ' ' + label : ''), mul > 1 ? '#ffc34d' : '#9ff5e8');
  }
```

Note: per call, `crystals+combo+destruction+boss` sums to `vBase` and `heat` adds `heatBonus`, so `Σ breakdown == score` (preserves the rubric #3 breakdown-integrity test).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/surge.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full unit suite to confirm breakdown integrity still holds**

Run: `node --test test/unit/`
Expected: PASS — existing `game.test.mjs` breakdown/x2 tests still green (Σ breakdown == score).

- [ ] **Step 6: Commit**

```bash
git add js/games/zerohour/game.js test/unit/surge.test.mjs
git commit -m "feat(zerohour): HEAT score multiplier, isolated heat breakdown bucket"
```

---

## Task 3: HEAT accumulation + reset (collect during surge; reset on hit)

**Files:**
- Modify: `js/games/zerohour/game.js` (crystal collect block; `hurtPlayer`)
- Test: `test/unit/surge.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/surge.test.mjs`:

```js
test('collecting during a surge raises heat; collecting in calm does not', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 0;
  collectOneOnPlayer(G);
  assert.equal(G.state.heat, 1, 'one crystal in surge → heat +1');
  G.state.inSurge = false;
  collectOneOnPlayer(G);
  assert.equal(G.state.heat, 1, 'crystal in calm → heat unchanged');
});

test('taking a hit resets heat to 0', () => {
  const G = toPlaying(freshGame(), 'free');
  G.state.inSurge = true; G.state.surgeActiveT = 10; G.state.heat = 20;
  G.state.shield = false; G.state.player.inv = 0;
  const p = G.state.player;
  G.state.mines.push({ x: p.x, y: p.y, r: 11, hp: 1, speed: 60, phase: 0, flash: 0 });
  G.update(1 / 60); // mine on the player → hurtPlayer → heat reset
  assert.equal(G.state.heat, 0, 'hit clears HEAT');
  assert.equal(G.state.tookDamage, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/surge.test.mjs`
Expected: FAIL — heat not incremented on collect; not reset on hit.

- [ ] **Step 3: Increment heat on collect during a surge**

In the crystal collection block (inside `for (let i = s.crystals.length - 1; ...)`, right after `s.collected += 1;`), add:
```js
        if (s.inSurge) s.heat += 1;
```

- [ ] **Step 4: Reset heat on a real hit**

In `hurtPlayer`, in the HP-loss branch (after `s.combo = 0; s.comboT = 0;`), add:
```js
    s.heat = 0;
```
(The shield branch returns early and must NOT reset heat — a blocked hit costs no HEAT, mirroring combo.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/surge.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add js/games/zerohour/game.js test/unit/surge.test.mjs
git commit -m "feat(zerohour): HEAT accumulates on surge collects, resets on hit"
```

---

## Task 4: Formation spawner (seeded, choreographed entry)

**Files:**
- Modify: `js/games/zerohour/game.js` (new `spawnFormation`, `pushFormMine`)
- Test: `test/unit/surge.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/surge.test.mjs`:

```js
test('spawnFormation (via a forced surge) adds `size` scripted-entry mines, deterministically', () => {
  const G = toPlaying(freshGame(), 'daily');
  // jump the clock to just before the first surge and let the director fire it
  const first = G.state.surges[0];
  G.state.t = first.at - 0.001;
  const before = G.state.mines.length;
  G.update(0.01); // crosses first.at → surge starts → formation spawns
  const added = G.state.mines.length - before;
  assert.equal(added, first.size, 'formation adds exactly `size` mines');
  const formMines = G.state.mines.slice(before);
  for (const m of formMines) {
    assert.ok(m.entryT > 0, 'formation mines enter on a scripted path');
    assert.ok(typeof m.vx === 'number' && typeof m.vy === 'number');
  }
  assert.equal(G.state.inSurge, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/surge.test.mjs`
Expected: FAIL — no surge director yet, mines unchanged, `inSurge` stays false.

- [ ] **Step 3: Add the formation spawner**

Add to `game.js` near the other spawn functions (after `spawnMine`):

```js
  function pushFormMine(s, x, y, dx, dy, speed) {
    const d = Math.hypot(dx, dy) || 1;
    s.mines.push({
      x, y, r: 11, hp: 1, speed: 62 + s.t * 1.1,
      phase: s.rng() * Math.PI * 2, flash: 0,
      vx: (dx / d) * speed, vy: (dy / d) * speed, entryT: 1.5,
    });
  }

  // choreographed mine entry — all randomness via s.rng (daily fairness)
  function spawnFormation(s, pattern, size) {
    const p = s.player;
    if (pattern === 'RING') {
      const R = 280, baseA = s.rng() * Math.PI * 2;
      for (let i = 0; i < size; i++) {
        const a = baseA + (i / size) * Math.PI * 2;
        const x = Math.min(W - 20, Math.max(20, p.x + Math.cos(a) * R));
        const y = Math.min(H - 20, Math.max(20, p.y + Math.sin(a) * R));
        pushFormMine(s, x, y, p.x - x, p.y - y, 70); // converge inward
      }
    } else if (pattern === 'PINCER') {
      const flip = s.rng() < 0.5 ? 1 : 0;
      const half = Math.floor(size / 2) + 1;
      for (let i = 0; i < size; i++) {
        const side = (i + flip) % 2;            // alternate opposite edges
        const t = (Math.floor(i / 2) + 1) / half;
        const y = 60 + t * (H - 120);
        const x = side === 0 ? -20 : W + 20;
        pushFormMine(s, x, y, side === 0 ? 1 : -1, 0, 150);
      }
    } else { // LINE sweep
      const edge = Math.floor(s.rng() * 4); // 0 top, 1 right, 2 bottom, 3 left
      for (let i = 0; i < size; i++) {
        const t = (i + 1) / (size + 1);
        let x, y, vx, vy;
        if (edge === 0) { x = t * W; y = -20; vx = 0; vy = 1; }
        else if (edge === 2) { x = t * W; y = H + 20; vx = 0; vy = -1; }
        else if (edge === 1) { x = W + 20; y = t * H; vx = -1; vy = 0; }
        else { x = -20; y = t * H; vx = 1; vy = 0; }
        pushFormMine(s, x, y, vx, vy, 130);
      }
    }
  }
```

(The surge director that calls this lands in Task 5 — this test passes once Task 5's director fires. Implement Task 4 and Task 5 together; the test above is green only after Step 3 of Task 5.)

- [ ] **Step 4: Commit (spawner in place)**

```bash
git add js/games/zerohour/game.js test/unit/surge.test.mjs
git commit -m "feat(zerohour): choreographed mine formation spawner (LINE/RING/PINCER)"
```

---

## Task 5: Surge Director + mine entry script in `update`

**Files:**
- Modify: `js/games/zerohour/game.js` (`update`: director block, mine-entry branch, calm-mine easing)
- Test: `test/unit/surge.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/surge.test.mjs`:

```js
test('a full free run passes through at least one surge and back to calm', () => {
  const sb = freshGame();
  const G = sb.SY.game;
  let sawSurge = false, sawCalmAfter = false;
  G.events.onGameOver = () => {};
  G.start('free');
  for (let i = 0; i < 30 && G.phase === 'ready'; i++) G.update(0.1);
  for (let i = 0; i < 60 * 60 && G.phase === 'playing'; i++) {
    G.update(1 / 60);
    if (G.state.inSurge) sawSurge = true;
    if (sawSurge && !G.state.inSurge && G.state.surgeIdx >= 1) sawCalmAfter = true;
  }
  assert.ok(sawSurge, 'run entered a surge');
  assert.ok(sawCalmAfter, 'run returned to calm after a surge');
});

test('formation mines move along their scripted vector during entry', () => {
  const G = toPlaying(freshGame(), 'daily');
  const first = G.state.surges[0];
  G.state.t = first.at - 0.001;
  G.update(0.01);
  const m = G.state.mines.find((x) => x.entryT > 0);
  assert.ok(m, 'a scripted-entry mine exists');
  const x0 = m.x, y0 = m.y, vx = m.vx, vy = m.vy;
  G.update(1 / 60);
  assert.ok(Math.sign(m.x - x0) === Math.sign(vx) || vx === 0, 'x follows scripted vx');
  assert.ok(Math.sign(m.y - y0) === Math.sign(vy) || vy === 0, 'y follows scripted vy');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/surge.test.mjs`
Expected: FAIL — `inSurge` never becomes true; Task 4's formation test also still red.

- [ ] **Step 3: Add the surge director to `update`**

In `update`, immediately after `if (s.bossWarnT > 0) s.bossWarnT -= dt;` (≈ line 309), insert:

```js
    // ---------- surge director ----------
    const sd = s.surges[s.surgeIdx];
    if (sd) {
      if (!s.inSurge && s.surgeWarnT <= 0 && s.t >= sd.at - SURGE_WARN && s.t < sd.at) {
        s.surgeWarnT = SURGE_WARN;
        SY.audio.surgeWarn();
      }
      if (s.t >= sd.at) {
        s.inSurge = true;
        s.surgeActiveT = SURGE_DUR;
        s.heat = 0;                       // each surge builds fresh
        spawnFormation(s, sd.pattern, sd.size);
        s.shake = Math.max(s.shake, 4);
        s.surgeIdx++;
      }
    }
    if (s.surgeWarnT > 0) s.surgeWarnT -= dt;
    if (s.inSurge) { s.surgeActiveT -= dt; if (s.surgeActiveT <= 0) s.inSurge = false; }
    s.heatMul = heatTier(s);
```

- [ ] **Step 4: Add the scripted-entry branch to the mine update loop**

Replace the head of the mine loop body. Find (≈ line 402):
```js
      const m = s.mines[i];
      m.phase += dt * 5;
      if (m.flash > 0) m.flash -= dt;
      const d = Math.sqrt(dist2(m, p)) || 1;
      m.x += ((p.x - m.x) / d) * m.speed * slowMul * dt;
      m.y += ((p.y - m.y) / d) * m.speed * slowMul * dt;
      if (d < m.r + p.r) {
```
Replace with:
```js
      const m = s.mines[i];
      m.phase += dt * 5;
      if (m.flash > 0) m.flash -= dt;
      if (m.entryT > 0) {
        m.entryT -= dt;                              // scripted formation entry
        m.x += m.vx * slowMul * dt;
        m.y += m.vy * slowMul * dt;
      } else {
        const dh = Math.sqrt(dist2(m, p)) || 1;      // homing
        m.x += ((p.x - m.x) / dh) * m.speed * slowMul * dt;
        m.y += ((p.y - m.y) / dh) * m.speed * slowMul * dt;
      }
      const d = Math.sqrt(dist2(m, p)) || 1;
      if (d < m.r + p.r) {
```
(The rest of the collision block — `s.mines.splice(i,1)`, `burst`, `hurtPlayer`, the `if (G.phase !== 'playing') return;` guard — is unchanged.)

- [ ] **Step 5: Ease ambient mine spawns during calm (sharpen the contrast)**

In the mine-spawn block (≈ line 364), change:
```js
    s.spawnT.mine -= dt;
    if (s.spawnT.mine <= 0) {
      const ramp = Math.max(0.45, 1 - s.t * 0.007);
      s.spawnT.mine = (2.7 * ramp) / Math.max(0.2, SY.tweaks.spawnRate);
      if (s.mines.length < 12) spawnMine(s);
    }
```
to:
```js
    s.spawnT.mine -= dt;
    if (s.spawnT.mine <= 0) {
      const ramp = Math.max(0.45, 1 - s.t * 0.007);
      const calmEase = s.inSurge ? 1 : 1.6; // fewer ambient mines between surges
      s.spawnT.mine = (2.7 * ramp * calmEase) / Math.max(0.2, SY.tweaks.spawnRate);
      if (s.mines.length < 12) spawnMine(s);
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/unit/surge.test.mjs`
Expected: PASS (all surge tests, including Task 4's formation test).

Run: `node --test test/unit/`
Expected: PASS — full suite green.

- [ ] **Step 7: Commit**

```bash
git add js/games/zerohour/game.js test/unit/surge.test.mjs
git commit -m "feat(zerohour): surge director + scripted mine entry + calm-mine easing"
```

---

## Task 6: `surgeWarn()` audio cue

**Files:**
- Modify: `js/audio.js` (add `surgeWarn` to the `SY.audio` object)

- [ ] **Step 1: Add the cue**

In `js/audio.js`, inside the `SY.audio = { ... }` object, next to `timeWarn()` (≈ line 139), add:
```js
    surgeWarn() {
      tone('square', 720, 480, 0.16, 0.18, 0, 'exp');
      noise(0.1, 0.12, 0, 800, 0.8);
    },
```

- [ ] **Step 2: Verify nothing throws (browser-path smoke via the unit harness)**

Run: `node --test test/unit/surge.test.mjs`
Expected: PASS — the audio stub is a no-op Proxy, but this confirms the director's `SY.audio.surgeWarn()` call name is wired. (Real audio is exercised in the E2E/manual pass.)

- [ ] **Step 3: Commit**

```bash
git add js/audio.js
git commit -m "feat(audio): surgeWarn telegraph cue"
```

---

## Task 7: Surge telegraph banner + tint (render.js)

**Files:**
- Modify: `js/games/zerohour/render.js` (banner in `render`; tint in `drawBackground`)
- Test: `test/unit/static.test.mjs` (presence assert)

- [ ] **Step 1: Write the failing test**

In `test/unit/static.test.mjs`, add:
```js
test('render.js reacts to surge state (telegraph + tint)', () => {
  const src = read(`${ZH}/render.js`);
  assert.ok(src.includes('surgeWarnT'), 'render draws the surge telegraph');
  assert.ok(src.includes('inSurge'), 'render tints during a surge');
});
```
(`read` and `ZH` are already defined at the top of `static.test.mjs`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/static.test.mjs`
Expected: FAIL — `render.js` does not mention `surgeWarnT`/`inSurge` yet.

- [ ] **Step 3: Add the surge tint**

In `drawBackground`, right after the slow-mo tint block (after the `s.fx.SLOW > 0` `if`), add:
```js
    // surge tint — warm pulse so the high-pressure window reads at a glance
    if (s && s.inSurge) {
      ctx.fillStyle = 'rgba(255,90,120,0.05)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
```

- [ ] **Step 4: Add the telegraph banner**

In `render`, just before the boss-warning banner block (before `if (s.bossWarnT > 0 ...)`), add:
```js
    // surge warning banner (counter-rotated to read upright in portrait)
    if (s.surgeWarnT > 0 && Math.floor(s.surgeWarnT * 6) % 2 === 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-rot);
      ctx.fillStyle = 'rgba(255,154,90,0.12)';
      ctx.fillRect(-W, -30, W * 2, 60);
      ctx.fillStyle = '#ff9a5a';
      ctx.font = 'bold 24px ' + MONO;
      ctx.textAlign = 'center';
      ctx.fillText('▲ SURGE INCOMING ▲', 0, 8);
      ctx.restore();
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/games/zerohour/render.js test/unit/static.test.mjs
git commit -m "feat(zerohour): surge telegraph banner + surge tint"
```

---

## Task 8: HEAT HUD badge (index.html + main.js + css)

**Files:**
- Modify: `index.html` (`#hud-heat` span), `js/games/zerohour/main.js` (`hudEls` + `updateHud`), `css/style.css`

- [ ] **Step 1: Add the HUD element (no inline style — keeps the ≤6 pin)**

In `index.html`, inside `#hud`, right after the combo span (`<span id="hud-combo"></span>`, line 50), add:
```html
        <span id="hud-heat"></span>
```

- [ ] **Step 2: Reference and update it in `main.js`**

In `hudEls` (≈ line 50), add `heat: $('hud-heat')` to the object.

In `updateHud`, right after the combo line (`hudEls.combo.textContent = ...`, ≈ line 97), add:
```js
    const heatOn = s.inSurge && s.heatMul > 1;
    hudEls.heat.textContent = heatOn ? 'HEAT ×' + s.heatMul : '';
    hudEls.heat.classList.toggle('on', heatOn);
```
(`textContent`/`classList` — not an `.innerHTML` sink, so the 6-sink static test stays valid.)

- [ ] **Step 3: Style it**

In `css/style.css`, near the other HUD badges (e.g. after `#hud-combo` rules), add:
```css
#hud-heat {
  font: 700 13px "IBM Plex Mono", ui-monospace, monospace;
  color: #ffc34d;
  text-shadow: 0 0 8px rgba(255, 195, 77, 0.6);
  opacity: 0;
  transition: opacity 0.15s ease;
  letter-spacing: 0.5px;
}
#hud-heat.on {
  opacity: 1;
}
```

- [ ] **Step 4: Verify static guards still hold**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS — inline `style=` count unchanged (6), `.innerHTML` sink count unchanged (6).

- [ ] **Step 5: Commit**

```bash
git add index.html js/games/zerohour/main.js css/style.css
git commit -m "feat(zerohour): HEAT HUD badge"
```

---

## Task 9: HEAT result-stat row (main.js)

**Files:**
- Modify: `js/games/zerohour/main.js` (`over-stats` innerHTML in `onGameOver`)
- Test: `test/unit/surge.test.mjs`

- [ ] **Step 1: Write the failing test**

Add the `import { runToGameOver }` to the top of `test/unit/surge.test.mjs` (alongside `loadModules`), then append:
```js
test('game-over result carries a heat breakdown bucket', () => {
  const sb = freshGame();
  const res = runToGameOver(sb, 'free', { dt: 1 / 30 });
  assert.ok(res, 'run ended');
  assert.equal(typeof res.breakdown.heat, 'number', 'heat bucket present in result');
});
```

- [ ] **Step 2: Run test to verify it passes (pins the bucket from Task 1)**

Run: `node --test test/unit/surge.test.mjs`
Expected: PASS — `breakdown.heat` exists (Task 1). If FAIL, the heat bucket was dropped; fix Task 1.

- [ ] **Step 3: Add the HEAT row to the result screen**

In `onGameOver`, in the `$('over-stats').innerHTML = ...` chain (≈ line 326), insert the HEAT row after the COMBO BONUS row:
```js
      statRow('CRYSTAL PTS', '+' + fmt(bd.crystals)) +
      statRow('COMBO BONUS', '+' + fmt(bd.combo)) +
      statRow('HEAT BONUS', '+' + fmt(bd.heat || 0)) +
      statRow('DESTRUCTION', '+' + fmt(bd.destruction)) +
```
(Still one `.innerHTML` assignment — sink count unchanged. `bd.heat || 0` tolerates old saved results.)

- [ ] **Step 4: Run the full suite**

Run: `node --test test/unit/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/games/zerohour/main.js test/unit/surge.test.mjs
git commit -m "feat(zerohour): HEAT bonus row on the result screen"
```

---

## Task 10: README score table + ADR-0010

**Files:**
- Modify: `README.md` (score system section)
- Create: `docs/adr/0010-surge-pacing-and-heat.md`

- [ ] **Step 1: Update the README score table**

In `README.md`'s 점수 시스템 section, add a HEAT row and a short surge note. After the existing 크리스털/기뢰/바위 rows, add:
```markdown
| HEAT 보너스 | 서지(고강도 구간) 중 수집·파괴 시 배율 `×1 → ×1.25 → ×1.5 → ×2`(서지 중 누적, 피격 시 리셋). X2와 합산 시 최대 `×4` |
```
And in the 게임플레이 description, add a line:
```markdown
- **서지(Surge)**: 8초 워밍업 뒤 필드 구간에 예고된 **고강도 서지**가 주기적으로 등장 — 기뢰가 라인 스윕·링 콜랩스·핀서 포메이션으로 몰려옵니다. 서지 사이 소강기에 회복·수집하고, 마지막 20초 보스가 클라이맥스입니다.
```

- [ ] **Step 2: Write the ADR**

Create `docs/adr/0010-surge-pacing-and-heat.md`:
```markdown
# ADR-0010: Surge pacing rhythm and the HEAT multiplier

- **Status**: Accepted (2026-06-18)
- **Context**: Zero Hour's 60s run felt "simple / long" — a near-flat difficulty
  curve, a single threat type (homing mines) for 40s, no in-run arc, passive
  auto-fire combat, and no risk/reward tension.
- **Decision**: Add a **Surge Director** that schedules N seeded surges
  (`floor(fieldLen/16)`, fired between an 8s warmup and the boss window),
  each spawning a **choreographed mine formation** (LINE / RING / PINCER) with a
  scripted `entryT` entry that reverts to the existing homing behaviour. A
  **HEAT** multiplier rises while collecting during a surge (`×1 → ×2`, capped
  `×4` with X2) and resets on hit, isolated into its own score-breakdown bucket.
  No new entity types, no new JS modules, no new art.
- **Consequences**:
  - All surge/formation/HEAT randomness uses `s.rng()` → daily fairness intact
    (ADR-0002). Building the schedule consumes rng at run start, so daily layouts
    differ from the pre-surge version (acceptable — new content version).
  - Score inflation: HEAT can lift surge-window points up to ×4. Rank/medal
    thresholds (ADR-0009) reviewed; HEAT bonus is isolated in `breakdown.heat`.
  - 60fps hot path unchanged — formation mines reuse the fixed mine object shape.
- **Spec / plan**: docs/plans/2026-06-18-zerohour-surge-pacing.md,
  docs/plans/2026-06-18-zerohour-surge-pacing-impl.md.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/adr/0010-surge-pacing-and-heat.md
git commit -m "docs: surge pacing + HEAT — README score table, ADR-0010"
```

---

## Task 11: Full verification + standalone bundle

**Files:** none (verification); user-run bundle regen

- [ ] **Step 1: Run the whole unit suite**

Run: `node --test test/unit/`
Expected: PASS — including `static.test.mjs` (Math.random ≤14 in game.js, inline style ≤6, innerHTML sinks ==6, load order, React-free) and `game.test.mjs` (breakdown integrity).

- [ ] **Step 2: Regenerate the standalone bundle (USER-RUN)**

The single-file bundle `standalone.html` is generated; a PreToolUse hook blocks hand-edits. Ask the user to run `/build-standalone`, then the bundle-hash sync test passes. Do not edit `standalone.html` directly.

- [ ] **Step 3: Full test runner + manual/E2E pass**

Run (PowerShell, user environment): `test/run-all.ps1` (or `test/run-all.sh`)
Expected: ALL PASS — node --test + headless E2E + bundle hash sync.

Manual check (`index.html` in a browser, or `npx serve .`):
- A "▲ SURGE INCOMING ▲" telegraph fires ~1.2s before each surge, with the `surgeWarn` cue.
- Mines arrive as a LINE/RING/PINCER formation, then begin homing.
- The `HEAT ×n` badge lights during surges and climbs as you collect; a hit clears it.
- Result screen shows a `HEAT BONUS` row; `Σ breakdown == score`.
- Between surges the field noticeably calms (fewer ambient mines).

- [ ] **Step 4: Post-change agent audits**

- `performance-analyzer` — confirm no new per-frame allocations in `game.js`/`render.js` hot path.
- `rng-fairness-auditor` — confirm surge schedule, pattern bag, and formation coordinates use only `s.rng()` (no `Math.random`/`Date.now` in gameplay paths).

---

## Self-Review Notes

- **Spec coverage:** Surge director (Tasks 1,5) · choreographed formations LINE/RING/PINCER (Task 4) · telegraph + audio (Tasks 5,6,7) · HEAT multiplier + accumulation + reset + isolation (Tasks 2,3) · HUD + result (Tasks 8,9) · calm-mine easing (Task 5) · README + ADR (Task 10) · fairness/perf audits (Task 11). All spec sections mapped.
- **Type consistency:** State fields `surges/surgeIdx/surgeWarnT/surgeActiveT/inSurge/heat/heatMul` and `breakdown.heat` are defined in Task 1 and used unchanged in Tasks 2–9. Functions `buildSurges`, `heatTier`, `spawnFormation`, `pushFormMine`, `SY.audio.surgeWarn` named consistently across tasks.
- **Pins:** game.js adds zero `Math.random` (≤14 holds); index.html adds no inline `style=` (≤6 holds); main.js adds no new `.innerHTML` sink (==6 holds); no new module files (load order holds).
