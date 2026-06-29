# F7 — INTEL Data Pickup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rare INTEL data-cache pickup (instant +250 score into the loot bucket) reflecting the section-1 ID/intel card badge. Reuses the 1UP/BOMB out-of-bag rare-pickup pipeline. Seeded/daily-fair.

**Architecture:** `game.js` gains `POWER_META.INTEL`, a `spawnT.intel` timer, a `spawnIntel` helper, a gated spawn roll, and an `applyPow` instant branch. `sprites.js` adds `POWER_ICONS.INTEL` (the card rect) — the generic pickup render (`drawPow`/`drawPowerIcon`) needs no change. `INTEL` is NOT added to `POWER_TYPES` (out of the bag) nor `POWER_DURATION` (instant).

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors in a `vm` sandbox.

**Spec:** `docs/plans/2026-06-29-intel-pickup-f7-design.md`.

---

## File Structure

- `js/games/neonvortex/game.js` — `POWER_META.INTEL`, `spawnT.intel`, `spawnIntel`, spawn roll, `applyPow` branch.
- `js/games/neonvortex/sprites.js` — `POWER_ICONS.INTEL` rect.
- `test/unit/intel.test.mjs` — NEW (meta/instant, collect +250, spawn gate).
- `test/unit/static.test.mjs` — INTEL-wired pin.
- `README.md` — score-table row. Verification: `/build-standalone`, E2E, gallery.

**Verified rect** (POWER_ICONS, atlas sheet): `INTEL` {556,44,62,72}.

---

## Task 1: INTEL pickup logic (game.js)

**Files:**
- Create: `test/unit/intel.test.mjs`
- Modify: `js/games/neonvortex/game.js`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/intel.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G) {
  G.start('free', 'normal');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
function grab(G, s, type) {
  s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('INTEL is an instant, out-of-bag pickup with meta', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META.INTEL, 'INTEL meta present');
  assert.equal(G.POWER_DURATION.INTEL, undefined, 'INTEL is instant (not a timed bag buff)');
});

test('collecting INTEL grants +250 into the loot bucket (instant, no timed fx)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.X2 = 0; s.tokens = [];
  const before = s.breakdown.loot;
  grab(G, s, 'INTEL');
  assert.equal(s.breakdown.loot - before, 250, 'INTEL adds 250 to the loot bucket');
  assert.equal(s.fx.INTEL, undefined, 'INTEL leaves no timed buff');
});

test('INTEL spawns gated to one at a time', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.pows = []; s.spawnT.intel = 0; s.timeLeft = 30; s.rng = () => 0.01; // force the gated roll
  G.update(1 / 60);
  assert.equal(s.pows.filter((o) => o.type === 'INTEL').length, 1, 'one INTEL spawned when the roll passes');
  s.spawnT.intel = 0; s.rng = () => 0.01;
  G.update(1 / 60);
  assert.equal(s.pows.filter((o) => o.type === 'INTEL').length, 1, 'no second INTEL while one exists');
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/intel.test.mjs`
Expected: FAIL — no INTEL meta / spawn / collect branch.

- [ ] **Step 3: Add `POWER_META.INTEL`**

Find:

```js
    '1UP':  { glyph: '♥',  color: '#ff5a78', label: 'EXTRA LIFE' }, // rare pickup — NOT in POWER_TYPES (out of the bag)
  };
```

Replace with:

```js
    '1UP':  { glyph: '♥',  color: '#ff5a78', label: 'EXTRA LIFE' }, // rare pickup — NOT in POWER_TYPES (out of the bag)
    INTEL:  { glyph: 'ⓘ',  color: '#5ad1ff', label: 'INTEL' },     // rare data-cache pickup — instant score (out of the bag)
  };
```

- [ ] **Step 4: Add `spawnT.intel`**

Find:

```js
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, portal: 14, fence: 11, oneup: 16, bomb: 18 },
```

Replace with:

```js
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, portal: 14, fence: 11, oneup: 16, bomb: 18, intel: 17 },
```

- [ ] **Step 5: Add the `spawnIntel` helper (after `spawnBomb`)**

Find:

```js
  function spawnBomb(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: 'BOMB', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }
```

Replace with:

```js
  function spawnBomb(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: 'BOMB', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }
  // rare INTEL data-cache pickup (NOT in the seeded bag; its own gated roll) — instant score
  function spawnIntel(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: 'INTEL', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }
```

- [ ] **Step 6: Add the gated spawn roll (after the BOMB roll block)**

Find:

```js
    // ---------- rare screen-clear BOMB (rarer than 1UP — strong) ----------
    s.spawnT.bomb -= dt;
    if (s.spawnT.bomb <= 0) {
      s.spawnT.bomb = 20 + s.rng() * 12;
      // rare, capped at 1, never in the final 8s
      if (s.rng() < 0.13 && s.timeLeft > 8 && !s.pows.some(o => o.type === 'BOMB')) spawnBomb(s);
    }
```

Replace with:

```js
    // ---------- rare screen-clear BOMB (rarer than 1UP — strong) ----------
    s.spawnT.bomb -= dt;
    if (s.spawnT.bomb <= 0) {
      s.spawnT.bomb = 20 + s.rng() * 12;
      // rare, capped at 1, never in the final 8s
      if (s.rng() < 0.13 && s.timeLeft > 8 && !s.pows.some(o => o.type === 'BOMB')) spawnBomb(s);
    }
    // ---------- rare INTEL data-cache pickup (instant score bonus) ----------
    s.spawnT.intel -= dt;
    if (s.spawnT.intel <= 0) {
      s.spawnT.intel = 17 + s.rng() * 11;
      if (s.rng() < 0.14 && s.timeLeft > 8 && !s.pows.some(o => o.type === 'INTEL')) spawnIntel(s);
    }
```

- [ ] **Step 7: Add the `applyPow` INTEL branch**

Find:

```js
    if (o.type === 'BOMB') { bombDetonate(s, o.x, o.y); return; } // instant screen clear
```

Replace with:

```js
    if (o.type === 'BOMB') { bombDetonate(s, o.x, o.y); return; } // instant screen clear
    if (o.type === 'INTEL') { addScore(s, 250, o.x, o.y, undefined, 'loot'); return; } // instant data-cache bonus
```

- [ ] **Step 8: Run the INTEL tests → expect PASS**

Run: `node --test test/unit/intel.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 9: Run the full suite; re-pin any seed-shifted test**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS. The new `spawnT.intel` roll consumes from the seeded stream — a seed-pinned
test MAY break; re-pin the established way (force the relevant timer/roll). If nothing breaks,
touch no other test. Report any re-pin.

- [ ] **Step 10: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/intel.test.mjs
git commit -m "feat: INTEL data-cache pickup (rare, instant +250 loot)"
```

---

## Task 2: Pickup icon + static pin

**Files:**
- Modify: `js/games/neonvortex/sprites.js`, `test/unit/intel.test.mjs`, `test/unit/static.test.mjs`

- [ ] **Step 1: Append the icon-pin + static wiring tests**

Append to `test/unit/intel.test.mjs`:

```js
test('INTEL pickup icon maps to the section-1 card sprite', () => {
  const SP = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites;
  const r = SP.powerIcons.INTEL;
  assert.ok(r, 'INTEL power icon present');
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 556, y: 44, w: 62, h: 72 }, 'INTEL icon rect');
});
```

Append to `test/unit/static.test.mjs`:

```js
test('INTEL data pickup (F7) is wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/function spawnIntel/.test(game) && /'INTEL'/.test(game), 'INTEL spawn + type');
  assert.ok(/POWER_META[\s\S]*INTEL:/.test(game), 'INTEL meta');
  assert.ok(/INTEL:\s*\{/.test(read(`${NV}/sprites.js`)), 'INTEL power icon rect');
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/intel.test.mjs test/unit/static.test.mjs`
Expected: FAIL — `POWER_ICONS.INTEL` missing.

- [ ] **Step 3: Add the INTEL power icon (sprites.js)**

Find:

```js
    BOMB:   { x: 437, y: 45, w: 54, h: 75 }, // fused bomb badge — screen-clear power (section 1)
```

Replace with:

```js
    BOMB:   { x: 437, y: 45, w: 54, h: 75 }, // fused bomb badge — screen-clear power (section 1)
    INTEL:  { x: 556, y: 44, w: 62, h: 72 }, // ID/intel card badge — data-cache pickup (section 1)
```

- [ ] **Step 4: Run the tests → expect PASS**

Run: `node --test test/unit/intel.test.mjs test/unit/static.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Run the full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/sprites.js test/unit/intel.test.mjs test/unit/static.test.mjs
git commit -m "feat: INTEL pickup uses the section-1 card sprite"
```

---

## Task 3: README + regenerate standalone + full gate + gallery

**Files:** `README.md`, `standalone.html` (regenerated; never hand-edited — a PreToolUse hook blocks edits).

- [ ] **Step 1: Add the INTEL rare-pickup note to README**

Find (the rare-pickup note — the BOMB line near the power-up list):

```
> - `✸` **BOMB** — 화면의 모든 적 파괴 + 적 탄막 제거(보스·엘리트는 칩 데미지, 격파 불가). 강력한 만큼 1UP보다 더 드물게 등장합니다.
```

Add immediately after it:

```
> - `ⓘ` **INTEL** — 희귀 데이터 캐시. 획득 시 즉시 **+250점**(데이터 살베지 계열). 가방 밖 희귀 드롭.
```

- [ ] **Step 2: Regenerate the bundle + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html && node .claude/skills/build-standalone/build.mjs /tmp/c.html && cmp standalone.html /tmp/c.html && echo SYNC_OK`
Expected: `SYNC_OK`.

- [ ] **Step 3: Headless E2E**

Run: `bash test/e2e/run.sh`
Expected: all assertions pass.

- [ ] **Step 4: Gallery eyeball**

Run: `bash test/e2e/gallery.sh /tmp/sy-gallery`
The pickup reuses the existing pickup render; eyeball the loot/1UP scene if present to confirm
the INTEL card badge reads at pickup size. (Dev tool; if no headless browser, rely on Step 3 +
unit tests.)

- [ ] **Step 5: Commit**

```bash
git add README.md standalone.html
git commit -m "docs+chore: README INTEL pickup note + regenerate standalone.html"
```

---

## Self-Review

- **Spec coverage:** meta (T1 S3), timer (T1 S4), spawnIntel (T1 S5), gated roll (T1 S6),
  instant +250 collect (T1 S7 + test), out-of-bag/instant (T1 test asserts no POWER_DURATION),
  icon rect (T2 S3), static pin (T2 S1), README score-sync (T3 S1), standalone+E2E+gallery (T3).
  All spec sections mapped.
- **Placeholder scan:** none — every code step is verbatim with exact anchors.
- **Type consistency:** type string `'INTEL'`, meta key `INTEL`, `spawnT.intel`, `spawnIntel`,
  icon rect {556,44,62,72}, value 250 used identically across game.js, sprites.js, README, tests.
- **Fairness:** `spawnIntel` + the roll use only `s.rng()`; `INTEL` not added to `POWER_TYPES`
  (bag unchanged) — no new `Math.random()`, `static.test.mjs` baseline (14) untouched;
  stream-shift re-pin handled in T1 S9.
