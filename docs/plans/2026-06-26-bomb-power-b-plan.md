# BOMB Power-Up (b) — Screen-Clear Consumable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb the unused section-1 bomb badge as a BOMB power-up — an instant
screen-clear consumable that destroys all non-boss enemies, wipes enemy fire, and chips
the boss/elite, joining the seeded power bag as its 10th member.

**Architecture:** BOMB is an instant power (like SHIELD/TIME — no duration). It joins
`POWER_TYPES` so the existing seeded `nextPowType` bag, drop, HUD-pickup, and `applyPow`
pipeline carry it with no new entity/array. A new `bombDetonate(s,x,y)` helper does the
clear: per-enemy destruction score (NO loot drops — avoids a crystal flood), `ebullets`
wipe, and a non-lethal chip to boss/elite (clamped to min 1 hp so they must still be
finished by shooting). Daily-fair: the bag roll is seeded; the clear is deterministic over
already-seeded enemies; only cosmetic `burst`/`wave` use `Math.random`.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors.

---

## File Structure

- `js/games/neonvortex/sprites.js` — add `POWER_ICONS.BOMB` badge rect (437,45,54,75).
- `js/games/neonvortex/foes.js` — expose `FOE_SCORE` on `SY.nvFoes` (for accurate bomb score).
- `js/games/neonvortex/game.js` — `POWER_TYPES` += BOMB; `POWER_META.BOMB`; `bombDetonate`
  helper; `applyPow` BOMB branch.
- `test/unit/bomb-power.test.mjs` — new unit tests.
- `test/unit/static.test.mjs` — pins.
- `README.md` — power-up table row.

---

### Task 1: Add the BOMB badge icon + expose FOE_SCORE

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (`POWER_ICONS` map, after the `'1UP'` entry)
- Modify: `js/games/neonvortex/foes.js:198` (`SY.nvFoes = { ... }`)

- [ ] **Step 1: Add the bomb badge to POWER_ICONS**

The bomb badge rect was verified via crop on white: `(437, 45, 54, 75)` — a fused bomb in
the same pin-badge style as the other power icons. Add to the `POWER_ICONS` map in
`sprites.js` after the `'1UP'` line:

```javascript
    BOMB:   { x: 437, y: 45, w: 54, h: 75 }, // fused bomb badge — screen-clear power (section 1)
```

- [ ] **Step 2: Expose FOE_SCORE so the bomb can score foe kills accurately**

In `js/games/neonvortex/foes.js`, change the export (line 198) from:

```javascript
  SY.nvFoes = { initTimers, update, bulletHit, damage };
```
to:
```javascript
  SY.nvFoes = { initTimers, update, bulletHit, damage, FOE_SCORE };
```

(`FOE_SCORE = { hunter: 30, charger: 35, shield: 50, laser: 40 }` is already defined at
`foes.js:183`.)

- [ ] **Step 3: Commit**

```bash
git add js/games/neonvortex/sprites.js js/games/neonvortex/foes.js
git commit -m "feat: add BOMB badge icon + expose FOE_SCORE for bomb scoring"
```

---

### Task 2: Register BOMB in the power bag + meta

**Files:**
- Modify: `js/games/neonvortex/game.js:6` (`POWER_TYPES`)
- Modify: `js/games/neonvortex/game.js:8-19` (`POWER_META`)

- [ ] **Step 1: Add BOMB to the seeded bag**

Change `game.js:6` from:

```javascript
  const POWER_TYPES = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME', 'DRONE', 'MISSILE'];
```
to:
```javascript
  const POWER_TYPES = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME', 'DRONE', 'MISSILE', 'BOMB'];
```

- [ ] **Step 2: Add BOMB meta**

In `POWER_META` (after the `MISSILE` line, before `'1UP'`), add:

```javascript
    BOMB:   { glyph: '✸',  color: '#ff5a3a', label: 'BOMB' },
```

(BOMB is intentionally NOT added to `POWER_DURATION` — it is instant, like SHIELD/TIME, so
it gets no HUD countdown badge.)

- [ ] **Step 3: Run static + powerup suites to see what the bag change shifts**

Run: `node --test test/unit/powerup.test.mjs test/unit/static.test.mjs`
Expected: `static.test` may FAIL on a roster/count pin; `powerup.test` may FAIL on a
seed-pinned bag assertion (the 10th member shifts `nextPowType`'s shuffle). Note which.
These are addressed in Task 4 / Task 5 (re-pin to the new seeded stream — the bag change
is a deliberate versioned content update, same as prior E-features).

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: register BOMB as the 10th seeded-bag power (instant)"
```

---

### Task 3: Implement the detonation + applyPow branch

**Files:**
- Modify: `js/games/neonvortex/game.js` — add `bombDetonate` helper near `spawnDrones`
  (~line 953) and a BOMB branch in `applyPow` (~line 940, with the other instant powers)

- [ ] **Step 1: Add the `bombDetonate` helper**

Insert after the `spawnDrones` function (`game.js:958`). It awards per-enemy destruction
score with NO loot drops, wipes enemy fire, and chips boss/elite non-lethally:

```javascript
  // BOMB power-up: instant screen clear. Destroys all combat enemies (score only,
  // no loot drops -> no crystal flood), wipes enemy fire, and chips the boss/elite
  // without ever killing them (clamped to >=1 hp -> they must be finished by shooting).
  // Deterministic: no s.rng(); the clear acts on already-seeded enemies. Cosmetic
  // burst/wave use Math.random only.
  function bombDetonate(s, x, y) {
    for (const m of s.mines) { addScore(s, 25, m.x, m.y, undefined, 'destroy'); burst(s, m.x, m.y, '#ff8a4a', 5, 150, 2.2); }
    for (const r of s.rocks) { addScore(s, 40, r.x, r.y, undefined, 'destroy'); burst(s, r.x, r.y, '#ff8a4a', 6, 160, 2.4); }
    for (const t of s.turrets) { addScore(s, 60, t.x, t.y, undefined, 'destroy'); burst(s, t.x, t.y, '#ff8a4a', 6, 160, 2.4); }
    for (const f of s.foes) { addScore(s, (SY.nvFoes.FOE_SCORE && SY.nvFoes.FOE_SCORE[f.kind]) || 30, f.x, f.y, undefined, 'destroy'); burst(s, f.x, f.y, '#ff8a4a', 5, 150, 2.2); }
    s.mines = []; s.rocks = []; s.turrets = []; s.foes = [];
    s.ebullets = []; // wipe all enemy fire (incl. boss plasma orbs)
    // non-lethal chip to boss/elite (boss-bucket score for the boss, like normal hits)
    if (s.boss && s.boss.dying <= 0) {
      const dmg = Math.min(8, s.boss.hp - 1);
      if (dmg > 0) { s.boss.hp -= dmg; s.boss.flash = 0.1; addScore(s, dmg * 5, undefined, undefined, undefined, 'boss'); }
    }
    if (s.elite && s.elite.state !== 'enter') { s.elite.hp = Math.max(1, s.elite.hp - 5); s.elite.flash = 0.1; }
    wave(s, x, y, 240, '#ff8a4a');
    s.shake = Math.max(s.shake, 11);
    SY.audio.explode();
  }
```

- [ ] **Step 2: Add the BOMB branch to applyPow**

In `applyPow` (`game.js:940-946`), add a BOMB case alongside the other instant powers,
after the `'1UP'` block and before the timed-buff section:

```javascript
    if (o.type === 'BOMB') { bombDetonate(s, o.x, o.y); return; } // instant screen clear
```

- [ ] **Step 3: Run the game suite for regressions**

Run: `node --test test/unit/game.test.mjs test/unit/loot.test.mjs test/unit/foes.test.mjs`
Expected: PASS (breakdown-sum property still holds; foe tests unaffected by the new export).

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: BOMB detonation — clear enemies + fire, chip boss/elite (non-lethal)"
```

---

### Task 4: Unit tests (`bomb-power.test.mjs`)

**Files:**
- Create: `test/unit/bomb-power.test.mjs`
- Reference: `test/unit/oneup.test.mjs` and `test/unit/loot.test.mjs` (boot/grab patterns)

- [ ] **Step 1: Write the tests**

Create `test/unit/bomb-power.test.mjs`:

```javascript
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
function grabBomb(G, s) {
  s.pows.push({ x: s.player.x, y: s.player.y, type: 'BOMB', r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('BOMB is a seeded-bag member with meta+icon but no duration', () => {
  const sb = boot(); const G = sb.SY.nvGame;
  assert.ok(G.POWER_META['BOMB'], 'BOMB meta exists');
  assert.equal(G.POWER_DURATION['BOMB'], undefined, 'BOMB is instant — no duration');
  assert.ok(sb.SY.nvSprites.POWER_ICONS
    ? sb.SY.nvSprites.POWER_ICONS.BOMB
    : true, 'BOMB icon present (if POWER_ICONS is exposed)');
});

test('BOMB destroys all combat enemies and wipes enemy fire', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.rocks = [{ x: 100, y: 100, r: 22, hp: 3, maxHp: 3, rot: 0, spin: 0, flash: 0 }];
  s.mines = [{ x: 200, y: 200, r: 11, hp: 1, speed: 60, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.turrets = [{ x: 300, y: 200, r: 16, hp: 5, maxHp: 5, fireT: 9, flash: 0, phase: 0 }];
  s.ebullets = [{ x: 400, y: 400, vx: 0, vy: 0, r: 6, life: 5 }];
  s.crystals = []; s.breakdown.destruction = 0; const before = s.score;
  grabBomb(G, s);
  assert.equal(s.rocks.length, 0, 'rocks cleared');
  assert.equal(s.mines.length, 0, 'mines cleared');
  assert.equal(s.turrets.length, 0, 'turrets cleared');
  assert.equal(s.ebullets.length, 0, 'enemy fire wiped');
  assert.equal(s.breakdown.destruction, 25 + 40 + 60, 'destruction score = mine+rock+turret');
  assert.ok(s.score - before >= 125, 'score increased by the kills');
});

test('BOMB drops NO loot (no crystal/token flood)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.rocks = [{ x: 100, y: 100, r: 22, hp: 3, maxHp: 3, rot: 0, spin: 0, flash: 0 },
             { x: 150, y: 150, r: 22, hp: 3, maxHp: 3, rot: 0, spin: 0, flash: 0 }];
  s.crystals = []; s.tokens = [];
  grabBomb(G, s);
  assert.equal(s.crystals.length, 0, 'no crystals dropped by the bomb');
  assert.equal(s.tokens.length, 0, 'no tokens dropped by the bomb');
});

test('BOMB chips the boss but never kills it (clamped to >=1 hp)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.boss = { x: 480, y: 128, ty: 128, r: 46, hp: 3, maxHp: 72, t: 0, burstT: 9, aimT: 9, plasmaT: 9, fireMul: 1, flash: 0, dying: 0, ringRot: 0 };
  grabBomb(G, s);
  assert.equal(s.boss.hp, 1, 'boss chipped down to the 1-hp floor, not killed');
  assert.equal(s.boss.dying, 0, 'boss is still alive');
});

test('BOMB is reachable from the seeded bag (appears across draws)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  let saw = false;
  for (let i = 0; i < 300 && !saw; i++) {
    s.pows = []; s.spawnT.pow = 0; G.update(1 / 60);
    if (s.pows.some((o) => o.type === 'BOMB')) saw = true;
  }
  assert.equal(saw, true, 'BOMB drops from the seeded bag within many draws');
});
```

NOTE: The first test's `POWER_ICONS` access is defensive — if `SY.nvSprites` does not
expose `POWER_ICONS` in the sandbox, the static pin in Task 5 covers the icon instead;
keep the assertion tolerant as written. Confirm `G.POWER_META` / `G.POWER_DURATION` are the
real exported names (they are referenced in `oneup.test.mjs`).

- [ ] **Step 2: Run the tests**

Run: `node --test test/unit/bomb-power.test.mjs`
Expected: PASS (5/5). If the seeded-bag reachability test is flaky, raise the draw count;
do not weaken the determinism.

- [ ] **Step 3: Commit**

```bash
git add test/unit/bomb-power.test.mjs
git commit -m "test: BOMB clear/score/no-loot/boss-chip/bag-reachability"
```

---

### Task 5: Static pins + re-pin shifted seed tests + README

**Files:**
- Modify: `test/unit/static.test.mjs` (add BOMB pins; update any roster-count pin)
- Modify: `test/unit/powerup.test.mjs` and any other seed-pinned test that broke in Task 2
- Modify: `README.md` (power-up table)

- [ ] **Step 1: Add BOMB static pins**

After the crystal large-gem pin block in `static.test.mjs`, add:

```javascript
test('BOMB screen-clear power is wired (static pins)', () => {
  const game = read(`${NV}/game.js`);
  assert.match(game, /POWER_TYPES = \[[^\]]*'BOMB'/, 'BOMB joins the seeded bag');
  assert.match(game, /BOMB:\s*\{[^}]*label: 'BOMB'/, 'BOMB meta present');
  assert.match(game, /function bombDetonate/, 'bombDetonate helper present');
  assert.match(game, /o\.type === 'BOMB'/, 'applyPow BOMB branch present');
  assert.ok(!/BOMB:\s*\d/.test(read(`${NV}/game.js`).match(/POWER_DURATION = \{[^}]*\}/)[0]),
    'BOMB has no duration (instant)');
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /BOMB:\s*\{ x: 437/, 'BOMB badge icon rect present');
});
```

(Use the existing `read`/`NV` helpers in `static.test.mjs`. If the `POWER_DURATION` regex
assertion is awkward, replace it with a simpler `assert.ok(!/BOMB:[^,}]*\d+/.test(...))`
against the isolated `POWER_DURATION` line — the intent is only "BOMB absent from durations".)

- [ ] **Step 2: Fix the Math.random baseline pin if needed**

`bombDetonate` adds cosmetic `burst()`/`wave()` calls but introduces NO new `Math.random(`
literal in `game.js` (burst/wave already contain them). Confirm the baseline-14 pin still
passes: `node --test test/unit/static.test.mjs`. If it reports a higher count, find the new
literal and confirm it is cosmetic; update the baseline ONLY with a comment explaining why.

- [ ] **Step 3: Re-pin any seed-shifted test**

Run the full unit suite and fix tests that broke purely because the 10th bag member shifted
the seeded `nextPowType` stream (e.g. a `powerup.test.mjs` assertion that a specific seed
yields a specific power sequence). Mirror the (a) precedent: keep the determinism assertion
(same seed → same result across two runs) and adjust any hardcoded expected value to the new
stream, OR make the check robust (assert a property, not a frozen sequence). Do NOT mask a
real regression — verify the bag still produces every type and stays deterministic.

Run: `for f in test/unit/*.test.mjs; do node --test "$f" || echo "FAIL $f"; done`
Expected: 0 FAIL after re-pinning.

- [ ] **Step 4: Add the README power-up row**

In the Korean README power-up table (파워업 section), add a BOMB row consistent with the
existing rows, e.g. `| ✸ | BOMB | 화면의 모든 적 파괴 + 적 탄막 제거 (보스/엘리트는 칩 데미지) | 즉시 |`.

- [ ] **Step 5: Commit**

```bash
git add test/unit/static.test.mjs test/unit/powerup.test.mjs README.md
git commit -m "test: pin BOMB wiring + re-pin seed-shifted bag tests; docs: README row"
```

---

### Task 6: Full suite (3× stable) + audits + finish

**Files:** none (verification + merge workflow)

- [ ] **Step 1: Run the full suite three times**

Run (×3): `bash test/run-all.sh`
Expected: unit+static PASS, E2E PASS (re-run a couple times if the known boot/settings
startup flake appears), standalone reports OUT OF SYNC until Step 4 regenerates it.

- [ ] **Step 2: rng-fairness audit**

Dispatch `rng-fairness-auditor` over the BOMB changes. Expected: the BOMB bag roll uses the
seeded `nextPowType`; `bombDetonate` is deterministic (no `s.rng()`); only cosmetic
`Math.random` (baseline 14 unchanged). Confirm the bag still daily-fair.

- [ ] **Step 3: performance audit**

Dispatch `performance-analyzer` over `game.js`. Expected: `bombDetonate` runs once per
pickup (not per frame), allocations are the expected per-enemy `burst` particles; no new
hot-path allocation in the render/update loops.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch — merge `feat/bomb-power` to `main`
`--no-ff`, delete the branch, regenerate `standalone.html` via `/build-standalone`, confirm
the hash gate is GREEN, and commit the regenerated bundle.

---

## Self-Review

- **Spec coverage:** badge icon (Task 1) · FOE_SCORE expose (Task 1) · bag+meta (Task 2) ·
  detonation+applyPow (Task 3) · tests (Task 4) · static pins + re-pin + README (Task 5) ·
  audits/merge (Task 6). All design sections mapped.
- **Placeholder scan:** no TBD/TODO. The only deferred specifics are the re-pin fixes in
  Task 5 Step 3, which cannot be predicted until the bag shift reveals which seed-pinned
  assertions move — the step gives the exact resolution rule (keep determinism, adjust the
  frozen value or assert a property).
- **Type consistency:** `BOMB` type string consistent across POWER_TYPES, POWER_META,
  POWER_ICONS, applyPow, bombDetonate, tests; `bombDetonate(s,x,y)` signature consistent;
  boss/elite chip clamps (`Math.min(8, hp-1)`, `Math.max(1, hp-5)`) consistent with the
  "never lethal" rule; `SY.nvFoes.FOE_SCORE` export consistent with its use.
