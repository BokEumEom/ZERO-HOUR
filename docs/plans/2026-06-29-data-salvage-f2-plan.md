# F2 — DATA SALVAGE Premium Loot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflect the two unused section-7 atlas sprites (circuit "data card", pentagon "data disc") as two rare, high-value DATA SALVAGE token tiers (`data` 150 / `core` 250) dropped only from chest jackpots and the console objective. Pure additive, seeded/fair.

**Architecture:** Extend the existing loot-token system. `game.js` gains the two tiers in `TOKEN_VALUE`, the chest `spawnLoot` table gains a rare `core`/`data` band, and the console-break branch pushes one guaranteed `data` token. `sprites.js` gains `tokenData`/`tokenCore` atlas rects; `render.js` `drawToken` maps the new tiers to them. Collection reuses the existing `loot` bucket unchanged.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors in a `vm` sandbox.

**Spec:** `docs/plans/2026-06-29-data-salvage-f2-design.md`.

---

## File Structure

- `js/games/neonvortex/game.js` — `TOKEN_VALUE` += data/core; `spawnLoot` jackpot table + premium token radius; console-break guaranteed `data` token.
- `js/games/neonvortex/sprites.js` — `tokenData` / `tokenCore` rects in `A`.
- `js/games/neonvortex/render.js` — `drawToken` tier→key map += data/core.
- `test/unit/data-salvage.test.mjs` — NEW. Tier values, drop gating, console drop, rects.
- `README.md` — score-table token row.
- Verification only: `/build-standalone` regen, `test/e2e/run.sh`, `test/e2e/gallery.sh`.

**Verified rects** (`sprite-atlas.png`, atlas sheet — no `sheet:'el'` tag):
`tokenData` = {1004, 692, 89, 102}, `tokenCore` = {1145, 708, 73, 84}.

---

## Task 1: Token tiers + drop logic (game.js)

**Files:**
- Create: `test/unit/data-salvage.test.mjs`
- Modify: `js/games/neonvortex/game.js`

- [ ] **Step 1: Write the failing test**

Create `test/unit/data-salvage.test.mjs`:

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
// Break one crate of `kind` at (480,300) with a forced rng; return dropped token tiers.
function dropTiers(kind, rngVal) {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind, x: 480, y: 300, r: kind === 'chest' ? 24 : 20, hp: 1, maxHp: 6, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = [];
  s.rng = () => rngVal; // force the tier roll deterministically
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  return s.tokens.map((t) => t.tier);
}

test('data/core tokens are worth 150/250 into the loot bucket', () => {
  const G = boot().SY.nvGame; const s = play(G);
  const p = s.player;
  for (const [tier, val] of [['data', 150], ['core', 250]]) {
    s.tokens = [{ x: p.x, y: p.y, vx: 0, vy: 0, r: 10, phase: 0, tier }];
    s.fx.X2 = 0;
    const before = s.breakdown.loot;
    G.update(1 / 60);
    assert.equal(s.breakdown.loot - before, val, `${tier} loot value`);
    assert.equal(s.tokens.length, 0, `${tier} token collected`);
  }
});

test('a chest jackpot can drop core (roll<0.05) and data (0.05<=roll<0.17)', () => {
  assert.ok(dropTiers('chest', 0.01).includes('core'), 'chest drops core');
  assert.ok(dropTiers('chest', 0.10).includes('data'), 'chest drops data');
});

test('crates and canisters never drop data/core salvage', () => {
  for (const kind of ['crate', 'canister']) {
    for (const rv of [0.01, 0.10, 0.5, 0.99]) {
      const tiers = dropTiers(kind, rv);
      assert.ok(!tiers.some((t) => t === 'data' || t === 'core'), `${kind}@${rv} has no salvage`);
    }
  }
});

test('breaking a console yields exactly one guaranteed data token', () => {
  assert.deepEqual(dropTiers('console', 0.5), ['data'], 'console drops one data token');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/unit/data-salvage.test.mjs`
Expected: FAIL — `data`/`core` not in `TOKEN_VALUE`, chest table has no salvage band, console drops no token.

- [ ] **Step 3: Add the data/core tiers to TOKEN_VALUE**

In `js/games/neonvortex/game.js`, replace:

```js
  const TOKEN_VALUE = { coin: 15, teal: 25, amber: 50, purple: 100 };
```

with:

```js
  const TOKEN_VALUE = { coin: 15, teal: 25, amber: 50, purple: 100, data: 150, core: 250 };
```

- [ ] **Step 4: Add the rare salvage band to the chest loot table + premium radius**

Replace:

```js
      const tier = jackpot
        ? (roll < 0.25 ? 'coin' : roll < 0.55 ? 'teal' : roll < 0.85 ? 'amber' : 'purple')
        : (roll < 0.6 ? 'coin' : roll < 0.82 ? 'teal' : roll < 0.95 ? 'amber' : 'purple');
      const a = s.rng() * Math.PI * 2, sp = 60 + s.rng() * 90;
      s.tokens.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8, phase: s.rng() * 6, tier });
```

with:

```js
      // chest can yield rare DATA SALVAGE (core/data); crates never do.
      const tier = jackpot
        ? (roll < 0.05 ? 'core' : roll < 0.17 ? 'data' : roll < 0.37 ? 'coin' : roll < 0.58 ? 'teal' : roll < 0.83 ? 'amber' : 'purple')
        : (roll < 0.6 ? 'coin' : roll < 0.82 ? 'teal' : roll < 0.95 ? 'amber' : 'purple');
      const a = s.rng() * Math.PI * 2, sp = 60 + s.rng() * 90;
      const r = tier === 'data' || tier === 'core' ? 10 : 8; // premium salvage reads larger
      s.tokens.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, phase: s.rng() * 6, tier });
```

- [ ] **Step 5: Add the console's guaranteed data token**

Replace:

```js
            if (cr.kind === 'console') {
              addScore(s, 30, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 64);
              spawnPow(s, cr.x, cr.y); // bonus objective — guaranteed power-up
            } else {
```

with:

```js
            if (cr.kind === 'console') {
              addScore(s, 30, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 64);
              spawnPow(s, cr.x, cr.y); // bonus objective — guaranteed power-up
              // ...plus one guaranteed DATA salvage token (reflect section-7 card)
              const a = s.rng() * Math.PI * 2, sp = 60 + s.rng() * 90;
              s.tokens.push({ x: cr.x, y: cr.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 10, phase: s.rng() * 6, tier: 'data' });
            } else {
```

- [ ] **Step 6: Run the new test to verify it passes**

Run: `node --test test/unit/data-salvage.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full unit suite; re-pin any seed-shifted tests**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS. The added chest band + console `s.rng()` draws shift the daily seed
stream, which MAY break a seed-pinned probabilistic assertion (e.g. in `loot.test.mjs`,
`oneup.test.mjs`). If one breaks, fix it the established way — force the relevant timer/roll
to make the event deterministically reachable (do NOT weaken a determinism assertion). If
nothing breaks, do not touch other tests.

- [ ] **Step 8: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/data-salvage.test.mjs
git commit -m "feat: DATA SALVAGE token tiers (data 150 / core 250) from chest + console"
```

---

## Task 2: Atlas rects + render mapping

**Files:**
- Modify: `js/games/neonvortex/sprites.js`, `js/games/neonvortex/render.js`
- Modify: `test/unit/data-salvage.test.mjs` (add a rect-pin test)

- [ ] **Step 1: Add the failing rect-pin test**

Append to `test/unit/data-salvage.test.mjs`:

```js
test('section-7 salvage rects exist on the atlas (tokenData/tokenCore)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = { tokenData: { x: 1004, y: 692, w: 89, h: 102 }, tokenCore: { x: 1145, y: 708, w: 73, h: 84 } };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/data-salvage.test.mjs`
Expected: FAIL — `tokenData`/`tokenCore` not in `A`.

- [ ] **Step 3: Add the two atlas rects**

In `js/games/neonvortex/sprites.js`, replace:

```js
    bossCore:    { x: 1217, y: 538, w: 90, h: 87 }, // boss orbital support core (section 6)
```

with:

```js
    bossCore:    { x: 1217, y: 538, w: 90, h: 87 }, // boss orbital support core (section 6)
    tokenData:   { x: 1004, y: 692, w: 89, h: 102 }, // DATA salvage — circuit card (section 7 reward)
    tokenCore:   { x: 1145, y: 708, w: 73, h: 84 },  // DATA salvage — data disc/keycard (section 7 reward)
```

- [ ] **Step 4: Map the new tiers in drawToken**

In `js/games/neonvortex/render.js`, replace:

```js
    const key = t.tier === 'coin' ? 'coin' : t.tier === 'amber' ? 'crystalAmber' : t.tier === 'purple' ? 'crystalBoss' : 'crystalTeal';
```

with:

```js
    const key = t.tier === 'coin' ? 'coin' : t.tier === 'data' ? 'tokenData' : t.tier === 'core' ? 'tokenCore' : t.tier === 'amber' ? 'crystalAmber' : t.tier === 'purple' ? 'crystalBoss' : 'crystalTeal';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/unit/data-salvage.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/sprites.js js/games/neonvortex/render.js test/unit/data-salvage.test.mjs
git commit -m "feat: render DATA SALVAGE tokens with section-7 card/disc atlas art"
```

---

## Task 3: README score-table sync

**Files:** Modify `README.md`

- [ ] **Step 1: Update the token row**

In `README.md`, replace:

```
| 보상 토큰 수집 | 코인 15 / teal 젬 25 / amber 젬 50 / purple 젬 100 |
```

with:

```
| 보상 토큰 수집 | 코인 15 / teal 젬 25 / amber 젬 50 / purple 젬 100 / **데이터 살베지 150 · 코어 250** (체스트·콘솔 희귀 드롭) |
```

- [ ] **Step 2: Verify score-sync stays green**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS (the score-sync checker sees the README values match `TOKEN_VALUE`).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README score table — DATA SALVAGE token values"
```

---

## Task 4: Regenerate standalone + full gate + gallery

**Files:** `standalone.html` (regenerated; never hand-edited — a PreToolUse hook blocks edits).

- [ ] **Step 1: Regenerate the bundle**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html`
(User-facing path: `/build-standalone`.)

- [ ] **Step 2: Verify bundle hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs /tmp/sy-build-check.html && cmp standalone.html /tmp/sy-build-check.html && echo SYNC_OK`
Expected: `SYNC_OK`.

- [ ] **Step 3: Run the headless E2E suite**

Run: `bash test/e2e/run.sh`
Expected: all assertions pass.

- [ ] **Step 4: Eyeball the salvage art in the gallery**

Run: `bash test/e2e/gallery.sh /tmp/sy-gallery`
Then open `/tmp/sy-gallery/5-loot-1up.png` (or the loot scene) and confirm any data/core
tokens render as the tech card/disc at a readable size. (Dev tool, no gate; if no headless
browser, skip and rely on Step 3.)

- [ ] **Step 5: Commit**

```bash
git add standalone.html
git commit -m "chore: regenerate standalone.html (DATA SALVAGE tokens)"
```

---

## Self-Review

- **Spec coverage:** tiers+values (T1 S3), chest band 5%/12% (T1 S4), premium radius (T1 S4/S5),
  console guaranteed data (T1 S5), crates never salvage (T1 test), atlas rects (T2 S3),
  render mapping (T2 S4), README score-sync (T3), seeded/fairness + re-pin (T1 S7),
  standalone+E2E+gallery (T4). All spec sections mapped.
- **Placeholder scan:** none — every code step has verbatim before/after.
- **Type consistency:** tier strings `'data'`/`'core'`, keys `tokenData`/`tokenCore`,
  values 150/250, radius 10 used identically across game.js, render.js, README, and tests.
- **Fairness:** no new `Math.random()` (all `s.rng()`), so the `static.test.mjs` baseline (14)
  is untouched; stream-shift re-pin is handled explicitly in T1 S7.
