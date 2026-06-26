# Boss Support Cores (d) — Orbiting Satellites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorb the unused section-6 orbital support-core sprite — the Core Warden deploys
2 orbiting support cores on entrance that fire slow aimed shots and are destructible for
score, adding a threat/visual phase to the boss fight without gating boss damage.

**Architecture:** A new `s.bossCores` array (parallel to other entity arrays). The boss
deploys 2 cores once after its entrance (a `b.coresDeployed` flag), each orbiting the boss
deterministically. `updateBossCores` (called from `updateBoss`) moves them, fires a slow
reactive-aimed shot, and applies contact damage. The bullet loop makes them destructible
(120 pts + a small deterministic prize-crystal drop). They clear when the boss dies. The
whole system is FULLY DETERMINISTIC (no `s.rng()`, no `Math.random()` — like `spawnDrones`),
so it consumes nothing from the seeded stream: daily-fairness and every seed-pinned test are
untouched.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors.

---

## File Structure

- `js/games/neonvortex/sprites.js` — add `bossCore` atlas rect (1217,538,90,87).
- `js/games/neonvortex/game.js` — `bossCores: []` in freshState; `coresDeployed` on the boss;
  deploy + `updateBossCores`; bullet-collision kill; clear-on-death; `nearestTarget` include.
- `js/games/neonvortex/render.js` — `drawBossCore` (sprite + flash + tether); call after `drawBoss`.
- `test/unit/boss-core.test.mjs` — new unit tests.
- `test/unit/static.test.mjs` — pins.
- `README.md` — boss section note.

---

### Task 1: Add the bossCore atlas rect

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (the `A` table, after `decoReadout`)

- [ ] **Step 1: Add the verified rect**

The orbital support-core rect was extracted via crop+verify: `(1217, 538, 90, 87)` — a
pink/red glowing core ringed by orbit markers, matching the boss palette. Add after
`decoReadout`:

```javascript
    bossCore:    { x: 1217, y: 538, w: 90, h: 87 }, // boss orbital support core (section 6)
```

- [ ] **Step 2: Commit**

```bash
git add js/games/neonvortex/sprites.js
git commit -m "feat: add bossCore atlas rect (section-6 orbital support core)"
```

---

### Task 2: State + deploy + update logic (`game.js`)

**Files:**
- Modify: `js/games/neonvortex/game.js` — freshState (~line 109), spawnBoss (~line 306),
  updateBoss (~line 444), and a new `updateBossCores` helper.

- [ ] **Step 1: Add the `bossCores` array to freshState**

In freshState, change the `boss: null, bossDown: false, bossWarnT: 0,` line to also init the
array:

```javascript
      boss: null, bossDown: false, bossWarnT: 0, bossCores: [],
```

- [ ] **Step 2: Add the `coresDeployed` flag to the boss object**

In `spawnBoss` (the `s.boss = { ... }` literal), add `coresDeployed: false,` to the object
(e.g. right after `dying: 0, ringRot: 0,`):

```javascript
      t: 0, burstT: 1.8 * fm, aimT: 2.6 * fm, plasmaT: 4 * fm, fireMul: fm, flash: 0, dying: 0, ringRot: 0, coresDeployed: false,
```

- [ ] **Step 3: Add the `updateBossCores` helper**

Insert immediately before `updateBoss` (line 412). Fully deterministic — no `s.rng`/`Math.random`:

```javascript
  // Boss orbital support cores (section 6): deterministic orbit + slow reactive-aimed
  // fire + contact damage. No rng (mirrors spawnDrones) -> does not touch the seeded stream.
  function updateBossCores(s, dt, slowMul) {
    const b = s.boss;
    for (const c of s.bossCores) {
      if (c.flash > 0) c.flash -= dt;
      c.ang += dt * 1.1 * slowMul;
      c.x = b.x + Math.cos(c.ang) * c.orbitR;
      c.y = b.y + Math.sin(c.ang) * c.orbitR;
      c.fireT -= dt * slowMul;
      if (c.fireT <= 0) {
        c.fireT = 2.6;
        const a = Math.atan2(s.player.y - c.y, s.player.x - c.x);
        s.ebullets.push({ x: c.x, y: c.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 5 });
      }
      if (dist2(c, s.player) < (c.r + s.player.r) * (c.r + s.player.r)) hurtPlayer(s, s.player.x, s.player.y);
    }
  }
```

- [ ] **Step 4: Deploy cores after the boss entrance + run their update**

In `updateBoss`, right after the entrance line
(`if (b.y < b.ty) { b.y += dt * 90; if (b.y > b.ty) b.y = b.ty; return; }`, line 444),
insert the one-time deploy + per-frame update:

```javascript
    // deploy 2 orbiting support cores once the boss is in position (deterministic)
    if (!b.coresDeployed) {
      b.coresDeployed = true;
      for (let i = 0; i < 2; i++) s.bossCores.push({ ang: i * Math.PI, orbitR: 96, hp: 6, maxHp: 6, fireT: 1.5 + i * 0.9, flash: 0, x: b.x, y: b.y, r: 16 });
    }
    updateBossCores(s, dt, slowMul);
```

- [ ] **Step 5: Clear cores when the boss is destroyed**

In the boss death finalization (the `b.dying <= 0` block, right after `s.boss = null;` at
line 435), add:

```javascript
        s.boss = null;
        s.bossCores = []; // support cores die with the boss
```

- [ ] **Step 6: Run the game suite for regressions**

Run: `node --test test/unit/game.test.mjs`
Expected: PASS (no behavior change for non-boss paths; bossCores defaults to []).

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: boss deploys 2 orbiting support cores (deterministic orbit+fire)"
```

---

### Task 3: Make cores destructible + targetable (`game.js`)

**Files:**
- Modify: `js/games/neonvortex/game.js` — bullet-collision loop (~line 811, after the
  elite `bulletHit` check) and `nearestTarget` (~line 989).

- [ ] **Step 1: Add core collision to the player-bullet loop**

After the elite hit check (`if (!dead && SY.nvElite.bulletHit(s, b, eliteApi)) dead = true;`,
~line 812), add a bossCores collision pass (`b` here is the player bullet):

```javascript
      if (!dead && s.bossCores.length) for (let j = s.bossCores.length - 1; j >= 0; j--) {
        const c = s.bossCores[j];
        if (dist2(b, c) < (c.r + 4) * (c.r + 4)) {
          c.hp -= 1; c.flash = 0.08; burst(s, b.x, b.y, '#ff8fb0', 4, 120, 2); dead = true;
          if (c.hp <= 0) {
            s.bossCores.splice(j, 1);
            addScore(s, 120, c.x, c.y, 'CORE', 'destroy');
            for (let k = 0; k < 3; k++) { const a = c.ang + k * 2.094; s.crystals.push({ x: c.x, y: c.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: k * 2, tier: 'boss' }); }
            blast(s, c.x, c.y, 90); SY.audio.explode();
          }
          break;
        }
      }
```

- [ ] **Step 2: Let homing missiles / drones target the cores**

In `nearestTarget` (line 961-972), add a probe loop for the cores (after the boss/elite
probes, alongside the other `for` loops):

```javascript
    for (const c of s.bossCores) probe(c);
```

- [ ] **Step 3: Run the boss + foes + missile suites**

Run: `node --test test/unit/game.test.mjs test/unit/missile.test.mjs test/unit/foes.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/game.js
git commit -m "feat: boss cores are destructible (120pts + prize drop) and missile-targetable"
```

---

### Task 4: Render the cores (`render.js`)

**Files:**
- Modify: `js/games/neonvortex/render.js` — add `drawBossCore` (near `drawBoss`, ~line 452)
  and call it after the boss draw (~line 607).

- [ ] **Step 1: Add the drawBossCore function**

Add just before `drawBoss` (line 452):

```javascript
  function drawBossCore(ctx, c, boss) {
    if (boss) { // faint tether from the boss to the core
      ctx.save();
      ctx.strokeStyle = 'rgba(255,90,120,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(boss.x, boss.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.restore();
    }
    const size = (c.r + 6) * 2.4;
    if (SP.draw(ctx, 'bossCore', c.x, c.y, size, c.ang)) {
      if (c.flash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = 'lighter';
        SP.draw(ctx, 'bossCore', c.x, c.y, size, c.ang);
        ctx.restore();
      }
      return;
    }
    ctx.save(); // vector fallback
    ctx.translate(c.x, c.y);
    ctx.shadowColor = '#ff5a78'; ctx.shadowBlur = 8;
    ctx.fillStyle = c.flash > 0 ? '#ffd9e1' : '#ff5a78';
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
```

- [ ] **Step 2: Call it after the boss draw**

In `render`, change the boss draw line (607) so cores draw right after the boss:

```javascript
    if (s.boss) drawBoss(ctx, s);
    for (const c of s.bossCores) drawBossCore(ctx, c, s.boss);
```

- [ ] **Step 3: Visual sanity via the gallery**

Run: `bash test/e2e/gallery.sh` then read `/tmp/sy-gallery/2-boss.png`
Expected: the boss shows 2 orbiting pink cores connected by faint tethers; cores read
clearly and the scene is not over-cluttered.

- [ ] **Step 4: Commit**

```bash
git add js/games/neonvortex/render.js
git commit -m "feat: render orbiting boss support cores (sprite + flash + tether)"
```

---

### Task 5: Unit tests (`boss-core.test.mjs`)

**Files:**
- Create: `test/unit/boss-core.test.mjs`
- Reference: `test/unit/loot.test.mjs` (boot/play pattern)

- [ ] **Step 1: Write the tests**

Create `test/unit/boss-core.test.mjs`. Boss is private; set up `s.boss` directly (in
position so the entrance is already complete) and step `update`:

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
function placeBoss(s) {
  s.boss = { x: 480, y: 128, ty: 128, r: 46, hp: 72, maxHp: 72, t: 0, burstT: 9, aimT: 9, plasmaT: 9, fireMul: 1, flash: 0, dying: 0, ringRot: 0, coresDeployed: false };
  s.bossCores = [];
}

test('boss deploys exactly 2 support cores once in position', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 2, '2 cores deployed');
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 2, 'not re-deployed on later frames');
});

test('cores orbit around the boss', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  const c = s.bossCores[0];
  const a0 = c.ang;
  for (let i = 0; i < 30; i++) G.update(1 / 60);
  assert.ok(s.bossCores[0].ang > a0, 'orbit angle advances');
  // position stays roughly orbitR from the boss
  const dx = s.bossCores[0].x - s.boss.x, dy = s.bossCores[0].y - s.boss.y;
  assert.ok(Math.abs(Math.hypot(dx, dy) - 96) < 2, 'core stays on its orbit radius');
});

test('cores fire enemy bullets over time', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  s.ebullets = [];
  for (let i = 0; i < 60 * 4; i++) G.update(1 / 60); // ~4s — past the fireT interval
  assert.ok(s.ebullets.length > 0, 'cores emitted aimed shots');
});

test('a core is destructible: +120 score and removed at 0 hp', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  const c = s.bossCores[0]; c.hp = 1;
  s.breakdown.destruction = 0; const before = s.score;
  s.bullets.push({ x: c.x, y: c.y, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 1, 'one core destroyed');
  assert.equal(s.breakdown.destruction, 120, 'core kill = 120 into destruction');
  assert.ok(s.score - before >= 120);
});

test('cores are cleared when the boss is destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
  G.update(1 / 60);
  assert.equal(s.bossCores.length, 2, 'cores present');
  s.boss.dying = 0.05; // trigger death finalization
  for (let i = 0; i < 10; i++) G.update(1 / 60);
  assert.equal(s.boss, null, 'boss gone');
  assert.equal(s.bossCores.length, 0, 'cores cleared with the boss');
});

test('core orbit/fire is deterministic (no rng) for a fixed setup', () => {
  const run = () => {
    const G = boot().SY.nvGame; const s = play(G); placeBoss(s);
    for (let i = 0; i < 90; i++) G.update(1 / 60);
    return s.bossCores.map((c) => [Math.round(c.x), Math.round(c.y), Math.round(c.ang * 100)]);
  };
  assert.deepEqual(run(), run(), 'identical core trajectories across runs');
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test test/unit/boss-core.test.mjs`
Expected: PASS (6/6). If the determinism test differs, the cores accidentally use
`Math.random`/`s.rng` — fix the source, not the test.

- [ ] **Step 3: Commit**

```bash
git add test/unit/boss-core.test.mjs
git commit -m "test: boss-core deploy/orbit/fire/destruct/clear/determinism"
```

---

### Task 6: Static pins + README

**Files:**
- Modify: `test/unit/static.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add the static pin**

After the arena-decor pin block in `static.test.mjs`, add:

```javascript
test('boss orbital support cores are wired (deterministic)', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /bossCore:\s*\{/, 'bossCore rect');
  const game = read(`${NV}/game.js`);
  assert.match(game, /function updateBossCores/, 'updateBossCores helper present');
  assert.match(game, /bossCores: \[\]/, 'bossCores state array initialised');
  assert.match(game, /coresDeployed/, 'deploy guard present');
  // cores must be deterministic — no rng inside updateBossCores
  const fn = game.match(/function updateBossCores[\s\S]*?\n  \}/)[0];
  assert.ok(!/s\.rng\(|Math\.random\(/.test(fn), 'updateBossCores uses no rng (deterministic)');
  const render = read(`${NV}/render.js`);
  assert.match(render, /function drawBossCore/, 'drawBossCore present');
});
```

- [ ] **Step 2: Run static**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS.

- [ ] **Step 3: README note**

In the boss/enemy section of the README, add a short line that the Core Warden deploys 2
orbiting support cores (fire aimed shots; destructible for 120 pts + prize gems; the boss
stays damageable throughout). Keep it consistent with the surrounding prose.

- [ ] **Step 4: Commit**

```bash
git add test/unit/static.test.mjs README.md
git commit -m "test: pin boss-core wiring; docs: README boss-core note"
```

---

### Task 7: Full suite + audits + visual approval + finish

**Files:** none (verification + merge workflow)

- [ ] **Step 1: Full suite (×3)**

Run (×3): `bash test/run-all.sh`
Expected: unit+static PASS, E2E PASS (re-run on the known boot/settings startup flake),
standalone OUT OF SYNC until Step 5.

- [ ] **Step 2: rng-fairness audit**

Dispatch `rng-fairness-auditor` over the boss-core changes. Expected: `updateBossCores` +
deploy + collision are FULLY deterministic (no `s.rng()`); the prize-crystal drop uses
fixed angles (no rng); `Math.random` baseline 14 unchanged; the seeded stream is not
shifted at all (no rng consumed by this feature).

- [ ] **Step 3: performance audit**

Dispatch `performance-analyzer` over `game.js`/`render.js`. Expected: cores add a tiny
fixed loop (2 entries) to update/collision/render only during the boss fight; the tether
is one `beginPath`/`stroke` per core; no new per-frame allocation in the steady hot path.

- [ ] **Step 4: Visual approval gate**

Capture `bash test/e2e/gallery.sh`, present `/tmp/sy-gallery/2-boss.png` to the user. If the
cores clutter the fight or read poorly, tune `orbitR`/size/tether alpha and re-capture.
Only proceed once approved.

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch — merge `feat/boss-cores` to `main`
`--no-ff`, delete the branch, regenerate `standalone.html`, confirm the hash gate is GREEN,
commit the regenerated bundle.

---

## Self-Review

- **Spec coverage:** sprite (Task 1) · state+deploy+update (Task 2) · destructible+target
  (Task 3) · render (Task 4) · tests (Task 5) · static+README (Task 6) · audits/visual/merge
  (Task 7). All design sections mapped.
- **Placeholder scan:** none — rect is concrete, all code blocks complete.
- **Type consistency:** `s.bossCores` array consistent across freshState/update/collision/
  render/tests; core entry shape `{ang,orbitR,hp,maxHp,fireT,flash,x,y,r}` consistent in
  deploy, updateBossCores, collision, and drawBossCore; `bossCore` sprite key consistent in
  sprites.js and render.js; `coresDeployed` flag consistent in spawnBoss and updateBoss.
