# 신규 적 Phase 2 (Shield + Laser) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 체크박스(`- [ ]`) 추적.

**Goal:** Hard 난이도에 방패 적(Shield)과 지대차단 레이저(Laser)를 추가한다. Shield는 정면 자동사격을 튕겨 측·후면 사격을 강제(새 동사), Laser는 빔 라인 area-denial.

**Architecture:** Phase 1의 `js/games/neonvortex/foes.js`(`SY.nvFoes`)에 두 종을 확장. `bulletHit`에 Shield 방패호 디플렉션(`'blocked'`)을 더한다(게임은 이미 `'blocked'` 분기 처리). 드랍을 위해 `foeApi`에 `dropCrystals` 주입. `render.js`에 Shield 호/Laser 빔 그리기.

**Tech Stack:** Vanilla JS IIFE, Canvas 2D, `node --test 'test/unit/*.mjs'` (glob 필수).

**전제:** A 설계 spec 승인됨. Phase 1 머지됨(`DIFF.hard.foes`에 `shield:1, laser:1` 이미 존재; foes.js의 `bulletHit`/`damage`/`update` 스캐폴드 존재; game.js의 `'blocked'` 분기·`foeApi` 존재). 브랜치 `feat/foes-phase2`.

**불변식:** 모든 게임플레이 RNG는 `s.rng()`; Math.random 코스메틱만. 60fps 무할당. README 점수표 동기화.

---

## File Structure
- Modify: `js/games/neonvortex/foes.js` — `spawnShield`/`spawnLaser`, `initTimers`(타이머 2종 추가), `update`(스폰 게이팅 2종), `stepFoes`(2종 sim), `bulletHit`(shield arc), `damage`(점수 50/40 + 드랍).
- Modify: `js/games/neonvortex/game.js` — `foeApi`에 `dropCrystals` 추가, 헬퍼 `dropCrystals(s,x,y,n)`.
- Modify: `js/games/neonvortex/render.js` — `drawFoe`에 shield/laser 분기.
- Modify: `README.md` — 점수표에 Shield/Laser 행.
- Test: `test/unit/foes.test.mjs`.

---

### Task 1: drops 배관 + Shield/Laser 스폰 (Hard 게이팅)

**Files:**
- Modify: `js/games/neonvortex/game.js` (`dropCrystals` 헬퍼 + `foeApi`)
- Modify: `js/games/neonvortex/foes.js` (`spawnShield`/`spawnLaser`, `initTimers`, `update`)
- Test: `test/unit/foes.test.mjs`

- [ ] **Step 1: Write the failing test**

`foes.test.mjs`에 추가:

```javascript
test('hard spawns shield and laser; normal never does', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'normal');
  const nk = new Set();
  for (let i = 0; i < 60 * 20; i++) { G.update(1 / 60); for (const f of G.state.foes) nk.add(f.kind); }
  assert.ok(!nk.has('shield') && !nk.has('laser'), 'normal excludes hard-tier foes');

  play(G, 'free', 'hard');
  const hk = new Set();
  for (let i = 0; i < 60 * 25; i++) { G.update(1 / 60); for (const f of G.state.foes) hk.add(f.kind); }
  assert.ok(hk.has('shield'), 'hard spawns shield');
  assert.ok(hk.has('laser'), 'hard spawns laser');
});

test('shield/laser caps honored on hard (each <=1)', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  let maxS = 0, maxL = 0;
  for (let i = 0; i < 60 * 25; i++) {
    G.update(1 / 60);
    maxS = Math.max(maxS, G.state.foes.filter((f) => f.kind === 'shield').length);
    maxL = Math.max(maxL, G.state.foes.filter((f) => f.kind === 'laser').length);
  }
  assert.ok(maxS <= 1 && maxL <= 1, 'shield/laser cap 1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: FAIL — `hard spawns shield` (spawn 미구현).

- [ ] **Step 3: Implement spawn + drops 배관**

`game.js` — `foeApi` 정의를 드랍 헬퍼 포함으로 교체. 기존:

```javascript
  const foeApi = { hurtPlayer, addScore, burst, wave, floatText };
```

→ (위에 헬퍼 추가하고 api에 포함)

```javascript
  // seeded crystal drop (daily fairness) — used by shield/laser foe deaths
  function dropCrystals(s, x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = s.rng() * Math.PI * 2;
      s.crystals.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: s.rng() * 6 });
    }
  }
  const foeApi = { hurtPlayer, addScore, burst, wave, floatText, dropCrystals };
```

`foes.js` — `initTimers`에 shield/laser 타이머 추가:

```javascript
  function initTimers(s) {
    s.foeSpawnT = { hunter: 2.5 + s.rng() * 2, charger: 4 + s.rng() * 2, shield: 6 + s.rng() * 3, laser: 8 + s.rng() * 3 };
  }
```

`spawnHunter`/`spawnCharger` 뒤에 추가:

```javascript
  function spawnShield(s) {
    const x = 120 + s.rng() * (W - 240), y = 90 + s.rng() * (H - 220);
    s.foes.push({
      kind: 'shield', x, y, r: 20, hp: 4, maxHp: 4, flash: 0, phase: s.rng() * 6,
      driftA: s.rng() * Math.PI * 2, aimA: s.rng() * Math.PI * 2,
    });
  }
  function spawnLaser(s) {
    const p = edgePoint(s); // edge-anchored emitter
    const x = Math.max(40, Math.min(W - 40, p.x)), y = Math.max(40, Math.min(H - 40, p.y));
    s.foes.push({
      kind: 'laser', x, y, r: 16, hp: 3, maxHp: 3, flash: 0, phase: s.rng() * 6,
      state: 'warn', stateT: 1.0, life: 11, bx: x, by: y,
    });
  }
```

`update`의 charger 스폰 블록 뒤에 shield/laser 스폰 추가:

```javascript
    if (gate.shield) {
      s.foeSpawnT.shield -= dt;
      if (s.foeSpawnT.shield <= 0) {
        s.foeSpawnT.shield = (9 + s.rng() * 4) / s.diff.spawnMul;
        if (count(s, 'shield') < gate.shield) spawnShield(s);
      }
    }
    if (gate.laser) {
      s.foeSpawnT.laser -= dt;
      if (s.foeSpawnT.laser <= 0) {
        s.foeSpawnT.laser = (10 + s.rng() * 5) / s.diff.spawnMul;
        if (count(s, 'laser') < gate.laser) spawnLaser(s);
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: PASS (스폰/캡). sim은 다음 Task — shield는 그 자리에 머물고 laser는 warn에 멈춤.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/foes.js js/games/neonvortex/game.js test/unit/foes.test.mjs
git commit -m "feat: shield/laser spawning (hard-gated) + seeded crystal drop plumbing"
```

---

### Task 2: Shield 드리프트 + 방패호 회전 + 디플렉션, Laser 빔 상태머신

**Files:**
- Modify: `js/games/neonvortex/foes.js` (`stepFoes` shield/laser, `bulletHit` arc, `damage` 점수/드랍)
- Test: `test/unit/foes.test.mjs`

- [ ] **Step 1: Write the failing test**

`foes.test.mjs`에 추가:

```javascript
test('shield blocks frontal bullets and takes flank/rear hits', () => {
  const G = boot().SY.nvGame;
  const F = G; // SY.nvFoes via state not needed; use module on sandbox
  const foe = { kind: 'shield', x: 480, y: 300, r: 20, hp: 4, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: 0 }; // faces +x (right)
  // bullet sitting to the RIGHT of the foe (frontal, within arc) -> blocked
  const front = { x: 495, y: 300, vx: -100, vy: 0, life: 0.5 };
  // bullet to the LEFT (rear) -> hit
  const rear = { x: 465, y: 300, vx: 100, vy: 0, life: 0.5 };
  assert.equal(G.SYnvFoes ? 0 : 0, 0); // placeholder to keep harness happy
  assert.equal(globalThis.__nvFoesBulletHit ? 0 : 0, 0);
});
```

> 주: `SY.nvFoes`는 샌드박스의 전역이라 테스트에서 `boot().SY.nvFoes`로 접근한다. 위 placeholder를 실제 단언으로 교체:

```javascript
test('shield blocks frontal bullets and takes flank/rear hits', () => {
  const nvFoes = boot().SY.nvFoes;
  const foe = { kind: 'shield', x: 480, y: 300, r: 20, hp: 4, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: 0 }; // aimA=0 faces +x
  const front = { x: 495, y: 300, vx: -100, vy: 0, life: 0.5 }; // bullet on the +x side (within arc)
  const rear = { x: 465, y: 300, vx: 100, vy: 0, life: 0.5 };   // bullet on the -x side (rear)
  assert.equal(nvFoes.bulletHit(foe, front), 'blocked', 'frontal bullet deflected');
  assert.equal(nvFoes.bulletHit(foe, rear), 'hit', 'rear bullet lands');
});

test('shield aimA rotates toward the player', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  const s = G.state;
  s.foes = [{ kind: 'shield', x: 480, y: 300, r: 20, hp: 4, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: Math.PI }];
  s.player.x = 800; s.player.y = 300; // player to the +x; target aim ~0
  for (let i = 0; i < 60; i++) G.update(1 / 60);
  const f = s.foes[0];
  if (f) assert.ok(Math.abs(Math.atan2(Math.sin(f.aimA), Math.cos(f.aimA))) < 1.0, 'aim turned toward player (+x)');
});

test('laser cycles warn -> fire -> cool and damages the player only while firing', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  const s = G.state; s.shield = false; s.player.inv = 0;
  const p = s.player;
  // emitter to the left, beam aimed across the player's row
  s.foes = [{ kind: 'laser', x: 40, y: p.y, r: 16, hp: 9, maxHp: 9, flash: 0, phase: 0, state: 'warn', stateT: 1.0, life: 11, bx: p.x + 400, by: p.y }];
  const seen = new Set();
  for (let i = 0; i < 60 * 4 && s.foes.length; i++) { G.update(1 / 60); if (s.foes[0]) seen.add(s.foes[0].state); }
  assert.ok(seen.has('fire'), 'entered fire'); assert.ok(seen.has('cool'), 'entered cool');
  assert.equal(s.tookDamage, true, 'beam hit the player while firing');
});

test('destroying a shield/laser awards its score into destruction', () => {
  const G = boot().SY.nvGame;
  play(G, 'free', 'hard');
  const s = G.state; s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.bullets = [];
  s.foes = [{ kind: 'shield', x: 465, y: 300, r: 20, hp: 1, maxHp: 4, flash: 0, phase: 0, driftA: 0, aimA: 0 }];
  s.breakdown.destruction = 0;
  s.bullets.push({ x: 465, y: 300, vx: 100, vy: 0, life: 0.5 }); // rear hit
  G.update(1 / 60);
  assert.ok(s.breakdown.destruction >= 50, 'shield worth 50');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/foes.test.mjs'`
Expected: FAIL — `bulletHit` shield arc 미구현(현재 모두 'hit'), laser sim 없음, 점수 50 미적용.

- [ ] **Step 3: Implement sim + arc + score/drops**

`foes.js` — `bulletHit` 교체:

```javascript
  const SHIELD_ARC = 1.05; // half-angle (~60deg) of the deflecting front
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }

  function bulletHit(foe, b) {
    if (dist2(foe, b) >= (foe.r + 4) * (foe.r + 4)) return 'miss';
    if (foe.kind === 'shield') {
      const toB = Math.atan2(b.y - foe.y, b.x - foe.x); // side the bullet is on
      if (angDiff(toB, foe.aimA) < SHIELD_ARC) return 'blocked'; // hit the shielded front
    }
    return 'hit';
  }
```

`stepFoes`의 charger 블록 뒤(루프 안)에 shield/laser 추가:

```javascript
      if (f.kind === 'shield') {
        // slow drift, bounce off the inner bounds
        const spd = 26 * s.diff.mineSpeedMul;
        f.x += Math.cos(f.driftA) * spd * slowMul * dt;
        f.y += Math.sin(f.driftA) * spd * slowMul * dt;
        if (f.x < 40 || f.x > W - 40) { f.driftA = Math.PI - f.driftA; f.x = Math.max(40, Math.min(W - 40, f.x)); }
        if (f.y < 60 || f.y > H - 60) { f.driftA = -f.driftA; f.y = Math.max(60, Math.min(H - 60, f.y)); }
        // rotate the shield to face the player (shortest direction)
        const want = Math.atan2(p.y - f.y, p.x - f.x);
        let d = want - f.aimA; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const step = 2.2 * dt; f.aimA += Math.max(-step, Math.min(step, d));
        if (dist2(f, p) < (f.r + p.r) * (f.r + p.r)) api.hurtPlayer(s, f.x, f.y);
        continue;
      }

      if (f.kind === 'laser') {
        f.life -= dt;
        f.stateT -= dt * slowMul;
        if (f.state === 'warn') {
          if (f.stateT >= 0.98) { f.bx = p.x; f.by = p.y; } // lock the beam target at warn entry
          if (f.stateT <= 0) { f.state = 'fire'; f.stateT = 1.2; }
        } else if (f.state === 'fire') {
          // point->segment distance from player to the beam line (emitter -> locked target, extended)
          const ex = f.x, ey = f.y, dx = f.bx - ex, dy = f.by - ey;
          const len2 = dx * dx + dy * dy || 1;
          let t = ((p.x - ex) * dx + (p.y - ey) * dy) / len2;
          t = Math.max(0, Math.min(1.4, t)); // allow the beam to overshoot past the locked point
          const cx = ex + dx * t, cy = ey + dy * t;
          if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) < (p.r + 6) * (p.r + 6)) api.hurtPlayer(s, p.x, p.y);
          if (f.stateT <= 0) { f.state = 'cool'; f.stateT = 1.6; }
        } else { // cool
          if (f.stateT <= 0) { f.state = 'warn'; f.stateT = 1.0; }
        }
        if (f.life <= 0) { s.foes.splice(i, 1); continue; }
        continue;
      }
```

`damage` 교체(kind별 점수 + 드랍):

```javascript
  const FOE_SCORE = { hunter: 30, charger: 35, shield: 50, laser: 40 };
  function damage(s, foe, dmg, api) {
    foe.hp -= dmg; foe.flash = 0.07;
    if (foe.hp > 0) return false;
    const idx = s.foes.indexOf(foe);
    if (idx >= 0) s.foes.splice(idx, 1);
    api.addScore(s, FOE_SCORE[foe.kind] || 30, foe.x, foe.y, undefined, 'destroy');
    api.burst(s, foe.x, foe.y, '#ff9a5a', 16, 230, 3);
    api.wave(s, foe.x, foe.y, 52, '#ff9a5a');
    if (foe.kind === 'shield') api.dropCrystals(s, foe.x, foe.y, 3);
    else if (foe.kind === 'laser') api.dropCrystals(s, foe.x, foe.y, 2);
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (전체).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/foes.js test/unit/foes.test.mjs
git commit -m "feat: shield drift+arc deflection and laser warn/fire/cool beam"
```

---

### Task 3: render.js — Shield 호 + Laser 빔

**Files:**
- Modify: `js/games/neonvortex/render.js` (`drawFoe` shield/laser 분기)
- Test: 기존 정적 핀(`drawFoe`)이 이미 커버 — 추가 테스트 불필요. 육안 검증.

- [ ] **Step 1: Implement render branches**

`render.js`의 `drawFoe`에서 charger `return;` 뒤(함수 끝 `}` 앞)에 추가:

```javascript
    if (f.kind === 'shield') {
      if (!SP.draw(ctx, 'enemyBig', f.x, f.y, (f.r + 4) * 2.2, 0)) {
        ctx.save(); ctx.fillStyle = f.flash > 0 ? '#fff' : '#5aa7ff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // shield arc facing the player
      ctx.save();
      ctx.strokeStyle = 'rgba(90,167,255,0.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 7, f.aimA - 1.05, f.aimA + 1.05); ctx.stroke();
      ctx.restore();
      return;
    }
    if (f.kind === 'laser') {
      // beam: telegraph (warn) dashed, solid column (fire)
      if (f.state === 'warn' || f.state === 'fire') {
        const dx = f.bx - f.x, dy = f.by - f.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L, far = 1100;
        ctx.save();
        if (f.state === 'warn') {
          ctx.strokeStyle = 'rgba(255,90,120,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
        } else {
          ctx.strokeStyle = 'rgba(255,90,120,0.95)'; ctx.lineWidth = 11; ctx.shadowColor = '#ff5a78'; ctx.shadowBlur = 16;
        }
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + ux * far, f.y + uy * far); ctx.stroke();
        ctx.restore();
      }
      if (!SP.draw(ctx, 'enemyMid', f.x, f.y, (f.r + 4) * 2.2, f.phase * 0.1)) {
        ctx.save(); ctx.fillStyle = f.flash > 0 ? '#fff' : '#ff7a3a';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      return;
    }
```

- [ ] **Step 2: Run tests + verify pin**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (전체). `render.js draws new-archetype foes` 핀 유지.

- [ ] **Step 3: Commit**

```bash
git add js/games/neonvortex/render.js
git commit -m "feat: render shield arc and laser warn/fire beam"
```

---

### Task 4: README 점수표 동기화

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Shield/Laser rows**

Charger 행 다음에 추가:

```markdown
| Shield(방패) 파괴 | 50 + 크리스털 3개 드랍 (HARD 난이도에서 등장, 정면은 방패에 막힘) |
| Laser(지대차단) 파괴 | 40 + 크리스털 2개 드랍 (HARD 난이도에서 등장) |
```

- [ ] **Step 2: Verify + Commit**

Run: `node --test 'test/unit/*.mjs'` → PASS. score-sync 자체확인(50/40 ↔ README).

```bash
git add README.md
git commit -m "docs: add Shield/Laser to the README score table"
```

---

## 완료 후
- 전체 테스트 통과(3x 안정). rng-fairness-auditor(shield/laser 공정성), performance-analyzer(빔/호 그리기·sim 무할당).
- 사용자: `/build-standalone` + 브라우저 검증(Hard에서 방패 적 정면 튕김→측후면 격파, 레이저 예고→빔, Easy/Normal 미등장).
- A 전체(4종) 완료 → 다음: C(파워업 지속시간).

## Self-Review
- **Spec 커버리지:** 스폰/게이팅(T1), Shield drift+arc+deflect & Laser beam(T2), 렌더(T3), 점수동기화(T4). `bulletHit`의 'blocked'는 game.js 기존 분기가 처리.
- **Placeholder:** T2 Step1의 첫 placeholder 테스트 블록은 "실제 단언으로 교체" 명시 후 완전한 테스트 제공.
- **타입/식별자 일관성:** `kind` 'shield'/'laser', shield 필드(`driftA`,`aimA`), laser 필드(`state`,`stateT`,`life`,`bx`,`by`), `FOE_SCORE`(50/40), `SHIELD_ARC`(1.05)와 render 호 각도(±1.05) 일치, `api.dropCrystals` 주입과 사용 일치.
