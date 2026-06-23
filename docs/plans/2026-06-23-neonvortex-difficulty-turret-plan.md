# 난이도 티어 + 터렛 적 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 단조로움 완화 — easy/normal/hard 난이도 티어 + 신규 적 터렛. 데일리는 Normal 고정(공정성).

**Architecture:** 3개 하위 시스템으로 분리해 순차 진행. 이 문서는 **Phase 1(난이도 엔진 knob, game.js)** 의 실행 계획이다. Phase 1은 `DIFF` 상수 테이블과 `freshState(mode, seed, difficulty)` 파라미터를 추가하고 기존 스폰/기뢰/보스 코드에 knob을 곱한다. `G.start`는 데일리에 normal을 강제한다. UI 미연동 단계라 기본값 normal = 현재 동작(무회귀).

**Tech Stack:** Vanilla JS IIFE(`window.SY`), `node --test 'test/unit/*.mjs'`(vm 샌드박스).

설계: [docs/plans/2026-06-23-neonvortex-difficulty-turret-design.md](2026-06-23-neonvortex-difficulty-turret-design.md)

---

## File Structure (Phase 1)
- `js/games/neonvortex/game.js` (수정) — `DIFF` 테이블, `freshState` difficulty 파라미터+`s.diff`, 스폰/기뢰/보스 knob 적용, `G.start` 데일리 normal 강제.
- `test/unit/difficulty.test.mjs` (생성) — DIFF 값, freshState 와이어링, 데일리 강제, knob 적용 단위 테스트.

테스트 실행: `node --test 'test/unit/*.mjs'` (디렉터리 형태 `node --test test/unit`는 이 Node에서 모듈 경로로 오인되어 실패하므로 글롭 사용).

## Subsequent plans (이 Phase 이후, 각각 별도 계획)
- **Phase 1B — UI + 기록**: 메뉴 난이도 셀렉터(`recs.settings.nvDifficulty`), `startGame`→`G.start(mode, diff)`, store `best_<diff>` 접근자 + `best_all`→`best_normal` 마이그레이션, 메뉴 헤드라인이 선택 난이도 반영.
- **Phase 2 — 터렛 적**: `s.turrets[]` 스폰(난이도 `turretCap`)·조준+텔레그래프 AI·자동사격 타깃·격파(60점+크리스털3)·렌더(`enemyMid`+폴백)·README 점수표.

---

### Task 1: `DIFF` 테이블 + `freshState` difficulty 파라미터

**Files:**
- Modify: `js/games/neonvortex/game.js`
- Test: `test/unit/difficulty.test.mjs` (생성)

- [ ] **Step 1: 실패 테스트 작성** — `test/unit/difficulty.test.mjs` 생성:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(['js/store.js', 'js/games/neonvortex/game.js'], { nowIso: '2026-03-01T00:30:00Z' });

test('DIFF table exposes easy/normal/hard knobs', () => {
  const G = boot().SY.nvGame;
  const D = G.DIFF;
  assert.ok(D.easy && D.normal && D.hard, 'three tiers');
  assert.equal(D.normal.spawnMul, 1.0);
  assert.equal(D.normal.mineCap, 12);
  assert.ok(D.hard.mineCap > D.easy.mineCap, 'hard denser than easy');
  assert.ok(D.hard.bossFireMul < D.normal.bossFireMul, 'hard boss fires faster');
});

test('freshState wires the selected difficulty; unknown falls back to normal', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  assert.equal(G.state.difficulty, 'hard');
  assert.equal(G.state.diff.mineCap, G.DIFF.hard.mineCap);
  G.start('free', 'bogus');
  assert.equal(G.state.difficulty, 'normal', 'unknown -> normal');
});

test('daily is always Normal regardless of requested difficulty (fairness)', () => {
  const G = boot().SY.nvGame;
  G.start('daily', 'hard');
  assert.equal(G.state.difficulty, 'normal');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/difficulty.test.mjs'` → `G.DIFF` undefined로 실패.

- [ ] **Step 3: `DIFF` 테이블 추가** — `game.js`에서 `HEAT_TIERS` 정의(`const HEAT_TIERS = [...];`) 바로 다음 줄에 추가:
```js
  // ---- difficulty tiers (fixed knobs; daily is always 'normal') ----
  // turretCap/turretFire are inert until Phase 2 (turret enemy).
  const DIFF = {
    easy:   { turretCap: 0, turretFire: 2.6, spawnMul: 0.75, mineSpeedMul: 0.85, mineCap: 9,  bossHpMul: 0.75, bossFireMul: 1.25 },
    normal: { turretCap: 2, turretFire: 2.6, spawnMul: 1.0,  mineSpeedMul: 1.0,  mineCap: 12, bossHpMul: 1.0,  bossFireMul: 1.0 },
    hard:   { turretCap: 3, turretFire: 1.9, spawnMul: 1.3,  mineSpeedMul: 1.2,  mineCap: 16, bossHpMul: 1.33, bossFireMul: 0.8 },
  };
```

- [ ] **Step 4: `freshState`에 difficulty 반영** — 시그니처와 `st` 객체를 수정. 현재:
```js
  function freshState(mode, seedStr) {
    const rng = SY.makeRng(seedStr);
    const duration = Math.round(SY.tweaks.duration);
    const st = {
      rng, seedStr, mode, duration,
```
로 시작하는 부분을 아래로 교체(난이도 키 결정 + `st`에 `difficulty`/`diff` 추가):
```js
  function freshState(mode, seedStr, difficulty) {
    const rng = SY.makeRng(seedStr);
    const duration = Math.round(SY.tweaks.duration);
    const diffKey = DIFF[difficulty] ? difficulty : 'normal';
    const st = {
      rng, seedStr, mode, duration,
      difficulty: diffKey, diff: DIFF[diffKey],
```
(나머지 `st` 필드는 그대로 둔다.)

- [ ] **Step 5: `G.start`가 difficulty를 받고 데일리에 normal 강제** — 현재:
```js
  G.start = function (mode) {
    const seed = mode === 'daily' ? 'daily-' + SY.todayUTC() : 'free-' + Math.random().toString(36).slice(2);
    G.mode = mode;
    G.state = freshState(mode, seed);
    G.phase = 'ready';
    resetKeys(); // a key stuck since the menu (blurred mid-press) must not steer the new run
  };
```
를 아래로 교체:
```js
  G.start = function (mode, difficulty) {
    const seed = mode === 'daily' ? 'daily-' + SY.todayUTC() : 'free-' + Math.random().toString(36).slice(2);
    G.mode = mode;
    // daily is always Normal — keeps the worldwide daily map+difficulty identical (fairness)
    const diff = mode === 'daily' ? 'normal' : difficulty;
    G.state = freshState(mode, seed, diff);
    G.phase = 'ready';
    resetKeys(); // a key stuck since the menu (blurred mid-press) must not steer the new run
  };
```

- [ ] **Step 6: 통과 확인** — `node --test 'test/unit/difficulty.test.mjs'` → 3 PASS. 이어서 `node --test 'test/unit/*.mjs'` → `fail 0` (기존 회귀 없음; main.js는 여전히 `G.start(mode)` 호출 → difficulty undefined → normal → 동일 동작).

- [ ] **Step 7: 커밋**
```bash
git add js/games/neonvortex/game.js test/unit/difficulty.test.mjs
git commit -m "feat: 난이도 DIFF 테이블 + freshState difficulty 파라미터(데일리 normal 강제)"
```

---

### Task 2: 스폰·기뢰·보스에 난이도 knob 적용

**Files:**
- Modify: `js/games/neonvortex/game.js`
- Test: `test/unit/difficulty.test.mjs`

- [ ] **Step 1: 실패 테스트 추가** — `difficulty.test.mjs` 끝에 append (knob이 실제 시뮬에 반영되는지 행동 테스트):
```js
test('mine speed and cap scale with difficulty', () => {
  const G = boot().SY.nvGame;
  // hard: spawn a mine and confirm its speed uses the hard mineSpeedMul
  G.start('free', 'hard');
  const s = G.state;
  // fast-forward spawn timers by stepping a few seconds (ready -> playing first)
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  for (let i = 0; i < 600; i++) G.update(1 / 60);
  assert.ok(s.mines.length > 0, 'mines spawned');
  // every mine speed was multiplied by hard.mineSpeedMul (1.2); base at spawn = (62 + t*1.1)*1.2
  // we only assert the cap knob is honored: hard cap is 16 (> normal 12)
  assert.ok(s.mines.length <= G.DIFF.hard.mineCap, 'respects hard mine cap');
  assert.equal(s.diff.mineSpeedMul, 1.2);
});

test('boss hp scales with difficulty', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'easy');
  // boss only spawns in last 20s of a >=40s round; assert the knob, not a full run
  assert.equal(G.state.diff.bossHpMul, 0.75);
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/difficulty.test.mjs'` → `mineSpeedMul`/cap 미적용으로 실패(기뢰가 normal 캡 12 기준이거나 speed 미반영). 만약 우연히 통과하면 Step 3 적용 후에도 통과해야 함(아래 변경이 핵심).

- [ ] **Step 3: 기뢰 속도에 `mineSpeedMul` 적용** — `spawnMine`의 라인:
```js
    s.mines.push({ x, y, r: 11, hp: 1, speed: 62 + s.t * 1.1, phase: s.rng() * Math.PI * 2, flash: 0, vx: 0, vy: 0, entryT: 0 });
```
를:
```js
    s.mines.push({ x, y, r: 11, hp: 1, speed: (62 + s.t * 1.1) * s.diff.mineSpeedMul, phase: s.rng() * Math.PI * 2, flash: 0, vx: 0, vy: 0, entryT: 0 });
```
그리고 `pushFormMine`의 라인:
```js
      x, y, r: 11, hp: 1, speed: 62 + s.t * 1.1,
```
를:
```js
      x, y, r: 11, hp: 1, speed: (62 + s.t * 1.1) * s.diff.mineSpeedMul,
```

- [ ] **Step 4: 스폰 빈도/캡에 knob 적용** — 스폰 블록의 rock/mine 라인을 수정. 현재:
```js
    s.spawnT.rock -= dt;
    if (s.spawnT.rock <= 0) { s.spawnT.rock = 5; if (s.rocks.length < 4) spawnRock(s); }
    s.spawnT.mine -= dt;
    if (s.spawnT.mine <= 0) {
      const ramp = Math.max(0.45, 1 - s.t * 0.007);
      const calmEase = s.inSurge ? 1 : 1.6; // fewer ambient mines between surges
      s.spawnT.mine = (2.7 * ramp * calmEase) / Math.max(0.2, SY.tweaks.spawnRate);
      if (s.mines.length < 12) spawnMine(s);
    }
```
를:
```js
    s.spawnT.rock -= dt;
    if (s.spawnT.rock <= 0) { s.spawnT.rock = 5 / s.diff.spawnMul; if (s.rocks.length < 4) spawnRock(s); }
    s.spawnT.mine -= dt;
    if (s.spawnT.mine <= 0) {
      const ramp = Math.max(0.45, 1 - s.t * 0.007);
      const calmEase = s.inSurge ? 1 : 1.6; // fewer ambient mines between surges
      s.spawnT.mine = (2.7 * ramp * calmEase) / (Math.max(0.2, SY.tweaks.spawnRate) * s.diff.spawnMul);
      if (s.mines.length < s.diff.mineCap) spawnMine(s);
    }
```

- [ ] **Step 5: 보스 HP/발사에 knob 적용** — `spawnBoss`를 수정. 현재:
```js
  function spawnBoss(s) {
    s.boss = {
      x: W / 2, y: -90, ty: 128, r: 46, hp: 72, maxHp: 72,
      t: 0, burstT: 1.8, aimT: 2.6, flash: 0, dying: 0, ringRot: 0,
    };
```
를:
```js
  function spawnBoss(s) {
    const bhp = Math.round(72 * s.diff.bossHpMul);
    const fm = s.diff.bossFireMul;
    s.boss = {
      x: W / 2, y: -90, ty: 128, r: 46, hp: bhp, maxHp: bhp,
      t: 0, burstT: 1.8 * fm, aimT: 2.6 * fm, fireMul: fm, flash: 0, dying: 0, ringRot: 0,
    };
```
그리고 `updateBoss`의 사격 리셋 두 줄. 현재:
```js
    if (b.burstT <= 0) {
      b.burstT = 2.4;
```
를:
```js
    if (b.burstT <= 0) {
      b.burstT = 2.4 * b.fireMul;
```
그리고:
```js
    if (b.aimT <= 0) {
      b.aimT = 1.7;
```
를:
```js
    if (b.aimT <= 0) {
      b.aimT = 1.7 * b.fireMul;
```

- [ ] **Step 6: 통과 확인** — `node --test 'test/unit/difficulty.test.mjs'` → 전부 PASS. 이어서 `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 7: tripwire baseline 확인** — 기존 시드 baseline 테스트가 깨지면(스폰 시퀀스/속도가 normal에서도 바뀌었는지) 확인: normal은 `spawnMul=1, mineSpeedMul=1, mineCap=12, bossHpMul=1, bossFireMul=1`이라 **수치상 동일**해야 한다. `node --test 'test/unit/*.mjs'`가 그대로 green이면 OK. 만약 부동소수점으로 baseline이 흔들리면(예: `(62+t)*1.0` 표현), 그 테스트를 점검하고 normal 경로가 기존과 동일 값인지 확인 후 필요한 baseline만 갱신.

- [ ] **Step 8: 커밋**
```bash
git add js/games/neonvortex/game.js test/unit/difficulty.test.mjs
git commit -m "feat: 스폰/기뢰/보스에 난이도 knob 적용(normal=기존 동일)"
```

---

## Self-Review

**Spec coverage (Phase 1 부분):** DIFF 테이블 → Task1. freshState difficulty → Task1. 데일리 normal 강제 → Task1(G.start). 스폰밀도/기뢰속도·캡/보스HP·발사 knob → Task2. 헐 3 고정 → 변경 없음(player.hp=3 그대로). 점수 배수 없음 → addScore 미변경. UI/기록/터렛 → Subsequent plans(1B/2)로 명시 분리. ✓

**Placeholder scan:** 모든 스텝에 실제 코드/명령. TBD 없음. Step7(tripwire)은 "확인 후 필요한 baseline만 갱신"이라는 조건부지만, normal 경로가 수치상 무변경이라 실제로는 갱신 불필요할 가능성이 높음 — 실행자가 green 여부로 판단. ✓

**Type consistency:** `s.diff`는 `DIFF[diffKey]` 객체(필드 spawnMul/mineSpeedMul/mineCap/bossHpMul/bossFireMul/turretCap/turretFire)로 Task1 정의 ↔ Task2 사용 일치. `b.fireMul`은 spawnBoss에서 세팅 ↔ updateBoss에서 사용 일치. `G.start(mode, difficulty)` 시그니처 ↔ freshState(mode, seed, difficulty) 일치. ✓
