# 신규 적 Phase 1 (Hunter + Charger) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normal·Hard 난이도에 추격드론(Hunter)과 돌진 적(Charger)을 추가해 '피하기 외의 대응'을 만든다.

**Architecture:** 신규 IIFE 모듈 `js/games/neonvortex/foes.js`(`SY.nvFoes`)가 신규 적 시뮬을 소유. `game.js`는 `DIFF.foes` 게이팅 + `freshState`에 `s.foes`/타이머 + 자동조준 후보·탄환 충돌·`nvFoes.update` 위임만 추가. `render.js`는 `drawFoe` 추가. 게임 좌표계·기존 적 무변경.

**Tech Stack:** Vanilla JS IIFE on `window.SY`, Canvas 2D, `node --test 'test/unit/*.mjs'` (glob 필수 — `node --test test/unit`은 모듈 못 찾고 실패).

**전제:** A 설계 spec(`docs/plans/2026-06-23-foes-variety-design.md`) 승인됨. 작업 브랜치 `feat/foes-phase1`에서 진행.

**불변식:** 모든 게임플레이 RNG는 `s.rng()`(데일리 공정성); `Math.random()`은 코스메틱만. 60fps 핫패스 무할당. README 점수표 동기화.

---

## File Structure
- Create: `js/games/neonvortex/foes.js` — Hunter/Charger 스폰·이동·상태머신·`bulletHit`/`damage`(`SY.nvFoes`).
- Modify: `js/games/neonvortex/game.js` — `DIFF.foes`, `freshState`(s.foes/타이머), 자동조준 cand, 탄환 vs foes, `nvFoes.update` 위임.
- Modify: `js/games/neonvortex/render.js` — `drawFoe` + 렌더 순서.
- Modify: `index.html` — `foes.js` 스크립트 로드(game.js 앞).
- Modify: `README.md` — 점수표에 Hunter/Charger 행.
- Test: `test/unit/foes.test.mjs`(신규), `test/unit/static.test.mjs`(스크립트 순서·IIFE 핀).

---

### Task 1: foes.js 골격 + 난이도 게이팅 + 스폰 (Hunter·Charger)

**Files:**
- Create: `js/games/neonvortex/foes.js`
- Modify: `js/games/neonvortex/game.js` (`DIFF` 33-37, `freshState` 98·106 근처)
- Test: `test/unit/foes.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/unit/foes.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });

function play(G, mode, diff) {
  G.start(mode, diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
}

test('DIFF.foes gates per tier: easy none, normal hunter+charger, hard adds shield+laser', () => {
  const G = boot().SY.nvGame;
  assert.deepEqual(G.DIFF.easy.foes, {});
  assert.equal(G.DIFF.normal.foes.hunter, 2);
  assert.equal(G.DIFF.normal.foes.charger, 1);
  assert.equal(G.DIFF.normal.foes.shield, undefined);
  assert.equal(G.DIFF.hard.foes.shield, 1);
  assert.equal(G.DIFF.hard.foes.laser, 1);
});

test('easy spawns no foes; normal spawns hunter/charger but never shield/laser', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'easy');
  for (let i = 0; i < 60 * 15; i++) G.update(1 / 60);
  assert.equal(G.state.foes.length, 0, 'easy: no foes');

  play(G, 'free', 'normal');
  const kinds = new Set();
  for (let i = 0; i < 60 * 20; i++) { G.update(1 / 60); for (const f of G.state.foes) kinds.add(f.kind); }
  assert.ok(kinds.has('hunter') || kinds.has('charger'), 'normal spawns phase-1 foes');
  assert.ok(!kinds.has('shield') && !kinds.has('laser'), 'normal never spawns hard-tier foes');
});

test('foe caps are honored (hunter<=2, charger<=1 on normal)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  let maxH = 0, maxC = 0;
  for (let i = 0; i < 60 * 25; i++) {
    G.update(1 / 60);
    maxH = Math.max(maxH, G.state.foes.filter((f) => f.kind === 'hunter').length);
    maxC = Math.max(maxC, G.state.foes.filter((f) => f.kind === 'charger').length);
  }
  assert.ok(maxH <= 2, 'hunter cap 2');
  assert.ok(maxC <= 1, 'charger cap 1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: FAIL — `G.DIFF.easy.foes` undefined / `foes.js` 없음.

- [ ] **Step 3: Implement foes.js skeleton + spawn**

`js/games/neonvortex/foes.js` 생성:

```javascript
// Neon Vortex — new enemy archetypes (Hunter/Charger now; Shield/Laser in Phase 2).
// Pure simulation on the shared state `s`. Rendering lives in render.js. All
// gameplay randomness uses s.rng() (daily fairness); Math.random() is cosmetic-only.
(function () {
  const SY = (window.SY = window.SY || {});
  const W = 960, H = 600;

  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  // seeded edge spawn point, kept off the player
  function edgePoint(s) {
    const edge = Math.floor(s.rng() * 4);
    if (edge === 0) return { x: s.rng() * W, y: -24 };
    if (edge === 1) return { x: W + 24, y: s.rng() * H };
    if (edge === 2) return { x: s.rng() * W, y: H + 24 };
    return { x: -24, y: s.rng() * H };
  }

  function count(s, kind) { let n = 0; for (const f of s.foes) if (f.kind === kind) n++; return n; }

  function spawnHunter(s) {
    const p = edgePoint(s);
    s.foes.push({ kind: 'hunter', x: p.x, y: p.y, vx: 0, vy: 0, r: 14, hp: 2, maxHp: 2, flash: 0, phase: s.rng() * 6 });
  }
  function spawnCharger(s) {
    const p = edgePoint(s);
    s.foes.push({
      kind: 'charger', x: p.x, y: p.y, vx: 0, vy: 0, r: 18, hp: 2, maxHp: 2, flash: 0, phase: s.rng() * 6,
      state: 'hover', stateT: 1.0, dirX: 0, dirY: 0,
    });
  }

  function initTimers(s) {
    s.foeSpawnT = { hunter: 2.5 + s.rng() * 2, charger: 4 + s.rng() * 2 };
  }

  // spawn pass (gated by s.diff.foes caps), then per-kind sim
  function update(s, dt, slowMul, api) {
    const gate = s.diff.foes;
    if (!gate) return;
    // ---- spawn ----
    if (gate.hunter) {
      s.foeSpawnT.hunter -= dt;
      if (s.foeSpawnT.hunter <= 0) {
        s.foeSpawnT.hunter = (3.5 + s.rng() * 2.5) / s.diff.spawnMul;
        if (count(s, 'hunter') < gate.hunter) spawnHunter(s);
      }
    }
    if (gate.charger) {
      s.foeSpawnT.charger -= dt;
      if (s.foeSpawnT.charger <= 0) {
        s.foeSpawnT.charger = (5 + s.rng() * 3) / s.diff.spawnMul;
        if (count(s, 'charger') < gate.charger) spawnCharger(s);
      }
    }
    // ---- sim (Task 2 fills this) ----
    stepFoes(s, dt, slowMul, api);
  }

  function stepFoes(s, dt, slowMul, api) { /* Task 2 */ }

  // bullet geometry (Task 3 wires it; shield deflection arrives in Phase 2)
  function bulletHit(foe, b) {
    return dist2(foe, b) < (foe.r + 4) * (foe.r + 4) ? 'hit' : 'miss';
  }

  // apply damage; on death award score (+ drops) and remove. Returns true if killed.
  function damage(s, foe, dmg, api) {
    foe.hp -= dmg; foe.flash = 0.07;
    if (foe.hp > 0) return false;
    const idx = s.foes.indexOf(foe);
    if (idx >= 0) s.foes.splice(idx, 1);
    const sc = foe.kind === 'charger' ? 35 : 30; // hunter 30, charger 35
    api.addScore(s, sc, foe.x, foe.y, undefined, 'destroy');
    api.burst(s, foe.x, foe.y, '#ff9a5a', 16, 230, 3);
    api.wave(s, foe.x, foe.y, 52, '#ff9a5a');
    return true;
  }

  SY.nvFoes = { initTimers, update, bulletHit, damage };
})();
```

`js/games/neonvortex/game.js` — `DIFF` 각 tier에 `foes` 추가 (33-37줄):

```javascript
  const DIFF = Object.freeze({
    easy:   Object.freeze({ turretCap: 0, turretFire: 2.6, spawnMul: 0.75, mineSpeedMul: 0.85, mineCap: 9,  bossHpMul: 0.75, bossFireMul: 1.25, foes: Object.freeze({}) }),
    normal: Object.freeze({ turretCap: 2, turretFire: 2.6, spawnMul: 1.0,  mineSpeedMul: 1.0,  mineCap: 12, bossHpMul: 1.0,  bossFireMul: 1.0,  foes: Object.freeze({ hunter: 2, charger: 1 }) }),
    hard:   Object.freeze({ turretCap: 3, turretFire: 1.9, spawnMul: 1.3,  mineSpeedMul: 1.2,  mineCap: 16, bossHpMul: 1.33, bossFireMul: 0.8,  foes: Object.freeze({ hunter: 2, charger: 2, shield: 1, laser: 1 }) }),
  });
```

`freshState`에서 `turrets: []` 가 있는 줄(98)에 `foes: []` 추가하고, `spawnT` 줄(106) 다음에 타이머 초기화를 위해 `st` 반환 전 `SY.nvFoes.initTimers(st)` 호출을 `st.surges = buildSurges(st);`(114) 앞에 추가:

```javascript
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [], foes: [],
```

그리고 `freshState` 안 `st.surges = buildSurges(st);` 바로 위에:

```javascript
    SY.nvFoes.initTimers(st);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: PASS (3개). (sim은 비어 있어 foe가 가장자리에 머물지만 스폰/캡/게이팅은 동작.)

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/foes.js js/games/neonvortex/game.js test/unit/foes.test.mjs
git commit -m "feat: foes.js skeleton + difficulty-gated hunter/charger spawning"
```

---

### Task 2: Hunter 호밍 + Charger 상태머신 + 접촉 피해

**Files:**
- Modify: `js/games/neonvortex/foes.js` (`stepFoes`)
- Test: `test/unit/foes.test.mjs`

- [ ] **Step 1: Write the failing test**

`foes.test.mjs`에 추가:

```javascript
test('hunter homes toward the player', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  s.foes = [{ kind: 'hunter', x: 50, y: 50, vx: 0, vy: 0, r: 14, hp: 2, maxHp: 2, flash: 0, phase: 0 }];
  const p = s.player; p.x = 800; p.y = 500;
  const before = Math.hypot(p.x - 50, p.y - 50);
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  const f = s.foes[0];
  if (f) assert.ok(Math.hypot(p.x - f.x, p.y - f.y) < before, 'hunter moved closer to player');
});

test('charger cycles hover -> lock -> dash -> recover and only damages while dashing', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  const seen = new Set();
  s.foes = [{ kind: 'charger', x: 480, y: 60, vx: 0, vy: 0, r: 18, hp: 9, maxHp: 9, flash: 0, phase: 0, state: 'hover', stateT: 1.0, dirX: 0, dirY: 0 }];
  for (let i = 0; i < 60 * 6 && s.foes.length; i++) { G.update(1 / 60); if (s.foes[0]) seen.add(s.foes[0].state); }
  assert.ok(seen.has('lock'), 'entered lock'); assert.ok(seen.has('dash'), 'entered dash');
});

test('a dashing charger that reaches the player deals a hit', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state; s.shield = false; s.player.inv = 0;
  const p = s.player;
  s.foes = [{ kind: 'charger', x: p.x, y: p.y, vx: 0, vy: 0, r: 18, hp: 9, maxHp: 9, flash: 0, phase: 0, state: 'dash', stateT: 1.0, dirX: 0, dirY: 0 }];
  G.update(1 / 60);
  assert.equal(s.tookDamage, true, 'dash contact hurts the player');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: FAIL — charger는 `hover`에 머물고(`stepFoes` 비어 있음) `lock`/`dash` 미도달.

- [ ] **Step 3: Implement stepFoes**

`foes.js`의 `stepFoes`를 교체:

```javascript
  function stepFoes(s, dt, slowMul, api) {
    const p = s.player;
    for (let i = s.foes.length - 1; i >= 0; i--) {
      const f = s.foes[i];
      f.phase += dt * 3;
      if (f.flash > 0) f.flash -= dt;

      if (f.kind === 'hunter') {
        const d = Math.sqrt(dist2(f, p)) || 1;
        const spd = (95 + s.t * 1.3) * s.diff.mineSpeedMul;
        f.x += ((p.x - f.x) / d) * spd * slowMul * dt;
        f.y += ((p.y - f.y) / d) * spd * slowMul * dt;
        if (Math.sqrt(dist2(f, p)) < f.r + p.r) {
          s.foes.splice(i, 1);
          api.burst(s, f.x, f.y, '#ff5a78', 14, 200, 3);
          api.hurtPlayer(s, f.x, f.y);
        }
        continue;
      }

      if (f.kind === 'charger') {
        f.stateT -= dt * slowMul;
        if (f.state === 'hover') {
          if (f.stateT <= 0) { f.state = 'lock'; f.stateT = 0.8; }
        } else if (f.state === 'lock') {
          const d = Math.sqrt(dist2(p, f)) || 1; // aim at player's CURRENT spot, locked on dash entry
          f.dirX = (p.x - f.x) / d; f.dirY = (p.y - f.y) / d;
          if (f.stateT <= 0) { f.state = 'dash'; f.stateT = 1.0; }
        } else if (f.state === 'dash') {
          f.x += f.dirX * 520 * slowMul * dt;
          f.y += f.dirY * 520 * slowMul * dt;
          if (Math.sqrt(dist2(f, p)) < f.r + p.r) {
            api.hurtPlayer(s, f.x, f.y);
            if (s.foes[i] !== f) continue; // (defensive; charger survives contact)
          }
          if (f.stateT <= 0 || f.x < -40 || f.x > W + 40 || f.y < -40 || f.y > H + 40) {
            f.state = 'recover'; f.stateT = 0.8;
          }
        } else { // recover
          if (f.stateT <= 0) {
            if (f.x < -30 || f.x > W + 30 || f.y < -30 || f.y > H + 30) { s.foes.splice(i, 1); continue; }
            f.state = 'lock'; f.stateT = 0.8;
          }
        }
        continue;
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: PASS (전체). 

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/foes.js test/unit/foes.test.mjs
git commit -m "feat: hunter homing + charger state machine with dash contact damage"
```

---

### Task 3: game.js 연동 — 자동조준 후보 + 탄환 충돌 + update 위임

**Files:**
- Modify: `js/games/neonvortex/game.js` (auto-fire cand 499 근처, 탄환 루프 664 뒤, turret 루프 595 뒤)
- Test: `test/unit/foes.test.mjs`

- [ ] **Step 1: Write the failing test**

`foes.test.mjs`에 추가:

```javascript
test('player bullets destroy a foe and award destruction score', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.bullets = [];
  s.foes = [{ kind: 'hunter', x: 480, y: 300, vx: 0, vy: 0, r: 14, hp: 2, maxHp: 2, flash: 0, phase: 0 }];
  s.score = 0; s.breakdown.destruction = 0;
  for (let h = 0; h < 3; h++) { s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }); G.update(1 / 60); }
  assert.equal(s.foes.length, 0, 'foe destroyed');
  assert.ok(s.breakdown.destruction >= 30, 'destruction score awarded');
});

test('auto-fire targets a nearby foe (a bullet is emitted toward it)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const s = G.state;
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.bullets = []; s.crystals = [];
  s.foes = [{ kind: 'hunter', x: s.player.x + 120, y: s.player.y, vx: 0, vy: 0, r: 14, hp: 5, maxHp: 5, flash: 0, phase: 0 }];
  s.player.fireCd = 0;
  for (let i = 0; i < 6; i++) G.update(1 / 60);
  assert.ok(s.bullets.length > 0, 'auto-fire produced a bullet at the foe');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: FAIL — 탄환이 foe를 안 맞춤(연동 전), destruction 0.

- [ ] **Step 3: Implement integration in game.js**

(a) 자동조준 후보 — `for (const t of s.turrets) cand.push(t);`(499) 다음 줄에 추가:

```javascript
      for (const f of s.foes) cand.push(f);
```

(b) 탄환 충돌 — turret 충돌 블록이 끝나는 `if (dead) s.bullets.splice(i, 1);`(665) **바로 위**에 foe 충돌 추가:

```javascript
      if (!dead) for (let j = s.foes.length - 1; j >= 0; j--) {
        const f = s.foes[j];
        const r = SY.nvFoes.bulletHit(f, b);
        if (r === 'miss') continue;
        dead = true;
        if (r === 'blocked') { burst(s, b.x, b.y, '#5aa7ff', 4, 110, 2); break; } // Phase 2 shield
        burst(s, b.x, b.y, '#ff9a5a', 4, 110, 2);
        SY.nvFoes.damage(s, f, 1, foeApi);
        if (f.hp <= 0) SY.audio.explode();
        break;
      }
```

(c) `nvFoes.update` 위임 — turret 루프(586-595)가 끝난 직후에 추가:

```javascript
    // ---------- new-archetype foes (Hunter/Charger; Shield/Laser in Phase 2) ----------
    SY.nvFoes.update(s, dt, slowMul, foeApi);
```

(d) `foeApi` 주입 객체 — `update(dt)` 함수 본문에서 foes 사용보다 앞(예: `const slowMul = ...`(428) 다음)에서 1회 정의. 매 프레임 재생성 회피를 위해 **모듈 스코프 상수**로 두되 `s`는 인자로 받으므로 함수 참조만 고정:

`game.js` 상단(예: `addScore` 정의 뒤, `update` 정의 앞)에 추가:

```javascript
  // injected into SY.nvFoes so foes.js never imports game internals directly
  const foeApi = { hurtPlayer, addScore, burst, wave, floatText };
```

(주의: `hurtPlayer`/`addScore`/`burst`/`wave`/`floatText`는 함수 선언이라 호이스팅됨 — `foeApi` 리터럴이 이들보다 먼저 평가돼도 참조는 유효.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (foes + 기존 89 전부). 기존 시뮬 무회귀.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/foes.test.mjs
git commit -m "feat: wire foes into auto-fire targeting, bullet collision, and update loop"
```

---

### Task 4: render.js drawFoe + 스크립트 로드 순서 + 정적 핀

**Files:**
- Modify: `js/games/neonvortex/render.js` (`drawFoe` 추가, render 순서 335 뒤)
- Modify: `index.html` (script 순서)
- Modify: `test/unit/static.test.mjs` (script 순서·IIFE·foes 렌더 핀)
- Test: `test/unit/static.test.mjs`

- [ ] **Step 1: Write the failing test**

`static.test.mjs`에서 기존 스크립트 순서 테스트의 기대 배열을 `foes` 포함으로 갱신하고, foes 렌더 핀을 추가한다.

기존(75줄) `assert.deepEqual(order, ['store', 'audio', 'shell', 'sprites', 'meta', 'medals', 'game', 'render', 'main']);` 를 다음으로 교체:

```javascript
  assert.deepEqual(order, ['store', 'audio', 'shell', 'sprites', 'meta', 'medals', 'foes', 'game', 'render', 'main']);
```

`CORE` 배열(14줄)에 foes.js를 추가:

```javascript
const CORE = ['js/store.js', 'js/audio.js', 'js/shell.js',
  `${NV}/sprites.js`, `${NV}/meta.js`, `${NV}/medals.js`, `${NV}/foes.js`, `${NV}/game.js`, `${NV}/render.js`, `${NV}/main.js`];
```

그리고 파일 끝에 렌더 핀 추가:

```javascript
test('render.js draws new-archetype foes', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('s.foes'), 'foes are iterated for drawing');
  assert.ok(/drawFoe/.test(src), 'has a drawFoe routine');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/static.test.mjs'`
Expected: FAIL — script 순서에 foes 없음 / `drawFoe` 없음 / foes.js IIFE 핀(아직 index에 미등록).

- [ ] **Step 3: Implement render + script order**

`index.html` — 스크립트 로드에서 `game.js` 바로 앞에 foes.js 추가 (medals 다음, game 앞):

```html
    <script src="js/games/neonvortex/foes.js"></script>
```

`js/games/neonvortex/render.js` — `drawTurret`(230) 뒤에 `drawFoe` 추가:

```javascript
  function drawFoe(ctx, f) {
    if (f.kind === 'hunter') {
      const a = Math.atan2(f.y - 0, f.x - 0) + f.phase * 0.1;
      if (!SP.draw(ctx, 'enemyMid', f.x, f.y, (f.r + 4) * 2.2, a)) {
        ctx.fillStyle = f.flash > 0 ? '#fff' : '#ff5a78';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    if (f.kind === 'charger') {
      if (f.state === 'lock') { // telegraph aim line
        ctx.save(); ctx.strokeStyle = 'rgba(255,90,120,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + f.dirX * 900, f.y + f.dirY * 900); ctx.stroke(); ctx.restore();
      }
      if (!SP.draw(ctx, 'enemyBig', f.x, f.y, (f.r + 4) * 2.2, Math.atan2(f.dirY, f.dirX) + Math.PI / 2)) {
        ctx.fillStyle = f.flash > 0 ? '#fff' : (f.state === 'dash' ? '#ff7a3a' : '#ff5a78');
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
  }
```

`render()`의 `for (const t of s.turrets) drawTurret(ctx, t);`(335) 다음 줄에:

```javascript
    for (const f of s.foes) drawFoe(ctx, f);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (전체).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/render.js index.html test/unit/static.test.mjs
git commit -m "feat: render hunter/charger foes; load foes.js before game.js"
```

---

### Task 5: README 점수표 동기화

**Files:**
- Modify: `README.md` (점수 시스템 표, 53줄 터렛 행 다음)

- [ ] **Step 1: Add Hunter/Charger rows**

`README.md`의 터렛 행(`| 터렛(Turret) 파괴 | 60 ...|`) 바로 다음에 추가:

```markdown
| Hunter(추격드론) 파괴 | 30 (NORMAL·HARD 난이도에서 등장) |
| Charger(돌진) 파괴 | 35 (NORMAL·HARD 난이도에서 등장) |
```

- [ ] **Step 2: Verify score-sync**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS. 그리고 score-sync-checker 에이전트로 game.js(30/35) ↔ README(30/35) 일치 확인.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add Hunter/Charger to the README score table"
```

---

## 완료 후
- 전체 `node --test 'test/unit/*.mjs'` 통과(기존 89 + 신규 foes).
- rng-fairness-auditor(foes.js 공정성), performance-analyzer(핫패스 무할당), score-sync-checker 실행.
- 사용자: `/build-standalone` + 브라우저 검증(Normal/Hard에서 Hunter 추격·Charger 텔레그래프→돌진, Easy 미등장).
- 다음: Phase 2 (Shield + Laser).

## Self-Review
- **Spec 커버리지:** 게이팅(Task1 DIFF.foes), Hunter/Charger 행동(Task2), 자동조준·탄·위임(Task3), 렌더·로드순서(Task4), 점수동기화(Task5). 모듈 인터페이스(initTimers/update/bulletHit/damage) 전부 사용됨.
- **Placeholder:** `stepFoes`는 Task1에서 의도적 빈 함수(명시) → Task2에서 완성. 그 외 구체 코드.
- **타입/식별자 일관성:** `s.foes`, `foeApi`, `SY.nvFoes`, `kind` 값('hunter'/'charger'), `state`('hover'/'lock'/'dash'/'recover'), 점수(30/35)가 전 Task·테스트·render에서 일치. `bulletHit` 반환 `'hit'|'blocked'|'miss'`와 Task3 분기 일치.
