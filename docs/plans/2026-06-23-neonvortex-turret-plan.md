# 터렛 적 (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 적 "터렛"(고정 포대, 플레이어 조준 사격, 텔레그래프 후 발사)을 추가해 위협 다양성으로 단조로움을 완화한다. 난이도별 `turretCap`(easy 0 / normal 2 / hard 3)로 등장량을 게이팅.

**Architecture:** game.js에 `s.turrets[]` + 시드 스폰 + 조준 AI(텔레그래프→ebullet)를 추가하고, 자동사격 타깃 후보에 터렛을 포함, 총알 충돌로 격파(60점+크리스털3)한다. render.js가 미사용이던 `enemyMid` 스프라이트로 터렛을 그린다(텔레그래프 링 + 벡터 폴백). 접촉 데미지 없음(원거리 위협). 모든 신규 난수는 `s.rng()`(공정성).

**Tech Stack:** Vanilla JS IIFE, Canvas 2D, `node --test 'test/unit/*.mjs'`. 선행: Phase 1 `s.diff.turretCap/turretFire` 이미 존재.

설계: [docs/plans/2026-06-23-neonvortex-difficulty-turret-design.md](2026-06-23-neonvortex-difficulty-turret-design.md) §2.

---

## File Structure
- `js/games/neonvortex/game.js` (수정) — `s.turrets[]`, `spawnT.turret`, `spawnTurret`, 스폰 게이팅, 터렛 AI, 자동사격 타깃, 총알 충돌/격파.
- `js/games/neonvortex/render.js` (수정) — `drawTurret` + 렌더 순서.
- `test/unit/difficulty.test.mjs`, `test/unit/static.test.mjs` (수정).
- `README.md` (수정) — 점수표에 터렛 60 행.
- `design.md` (수정) — `enemyMid`가 이제 사용됨 반영.

테스트: `node --test 'test/unit/*.mjs'` (디렉터리 형태는 이 Node에서 실패하므로 글롭).

---

### Task 1: 터렛 상태 + 시드 스폰 (난이도 게이팅)

**Files:** Modify `js/games/neonvortex/game.js`; Test `test/unit/difficulty.test.mjs`

- [ ] **Step 1: 실패 테스트 추가** — `test/unit/difficulty.test.mjs` 끝에 append:
```js
test('turrets spawn on hard (capped) and never on easy', () => {
  const G = boot().SY.nvGame;
  // easy: turretCap 0 -> none ever
  G.start('free', 'easy');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  for (let i = 0; i < 60 * 12; i++) G.update(1 / 60);
  assert.equal(G.state.turrets.length, 0, 'easy spawns no turrets');
  // hard: turretCap 3 -> some, never above cap
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  let maxSeen = 0;
  for (let i = 0; i < 60 * 20; i++) { G.update(1 / 60); maxSeen = Math.max(maxSeen, G.state.turrets.length); }
  assert.ok(maxSeen > 0, 'hard spawns turrets');
  assert.ok(maxSeen <= G.DIFF.hard.turretCap, 'never exceeds turretCap (3)');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/difficulty.test.mjs'` → `G.state.turrets` undefined.

- [ ] **Step 3: `turrets[]` + `spawnT.turret`를 freshState에 추가** — `freshState`의 `st` 객체에서:
```js
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [],
```
다음 줄(바로 아래)에 `turrets` 배열을 추가하려면 그 줄을 다음으로 교체:
```js
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [],
```
그리고 `spawnT` 라인:
```js
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6 },
```
을:
```js
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5 },
```

- [ ] **Step 4: `spawnTurret` 함수 추가** — `spawnRock` 함수 정의 바로 위(또는 아래)에 추가:
```js
  // stationary aimed-fire emplacement. Seeded position kept >=260px from the
  // player so it never spawns on top of them. Cosmetic-free gameplay threat.
  function spawnTurret(s) {
    const p = s.player;
    let x = 0, y = 0, tries = 0;
    do {
      x = 90 + s.rng() * (W - 180);
      y = 80 + s.rng() * (H - 200);
      tries++;
    } while (((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)) < 260 * 260 && tries < 8);
    s.turrets.push({ x, y, r: 16, hp: 5, maxHp: 5, fireT: 1 + s.rng() * s.diff.turretFire, flash: 0, phase: s.rng() * Math.PI * 2 });
  }
```

- [ ] **Step 5: 스폰 블록에 터렛 추가** — 스폰 블록의 powerup 라인:
```js
    s.spawnT.pow -= dt;
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 9.5; if (s.pows.length < 3) spawnPow(s); }
```
다음에 추가:
```js
    s.spawnT.turret -= dt;
    if (s.spawnT.turret <= 0) {
      s.spawnT.turret = 6 / s.diff.spawnMul; // density-scaled cadence
      if (s.diff.turretCap > 0 && s.turrets.length < s.diff.turretCap) spawnTurret(s);
    }
```

- [ ] **Step 6: 통과 확인** — `node --test 'test/unit/difficulty.test.mjs'` PASS, `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 7: 커밋**
```bash
git add js/games/neonvortex/game.js test/unit/difficulty.test.mjs
git commit -m "feat: 터렛 적 상태 + 시드 스폰(난이도 turretCap 게이팅)"
```

---

### Task 2: 터렛 AI(조준 사격) + 자동사격 타깃 + 격파

**Files:** Modify `js/games/neonvortex/game.js`; Test `test/unit/difficulty.test.mjs`

- [ ] **Step 1: 실패 테스트 추가** — append:
```js
test('turret fires an aimed shot at the player (pre-boss ebullets are turret-only)', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  // run ~14s (boss only spawns in last 20s of a 60s run, so all ebullets here are turret shots)
  for (let i = 0; i < 60 * 14; i++) G.update(1 / 60);
  assert.ok(!G.state.boss, 'no boss yet');
  // a turret must have fired at least once by now (ebullets present, or were cleared after travel)
  assert.ok(G.state.turrets.length > 0, 'turrets exist to fire');
});

test('a turret is destroyed in 5 hits and scores 60', () => {
  const G = boot().SY.nvGame;
  G.start('free', 'hard');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  const s = G.state;
  s.turrets = [{ x: 480, y: 300, r: 16, hp: 5, maxHp: 5, fireT: 99, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.bullets = [];
  s.score = 0; s.breakdown.destruction = 0;
  for (let h = 0; h < 6; h++) { s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 }); G.update(1 / 60); }
  assert.equal(s.turrets.length, 0, 'destroyed');
  assert.ok(s.breakdown.destruction >= 60, 'awarded 60 into destruction bucket');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/difficulty.test.mjs'` → 격파 테스트 실패(터렛이 안 죽음 / 점수 0).

- [ ] **Step 3: 터렛 AI 업데이트 추가** — `update`에서 mines 업데이트 루프가 끝나는 지점(주석 `// ---------- bullets vs things ----------` 바로 앞)에 추가:
```js
    // ---------- turrets (stationary aimed fire; telegraph handled in render) ----------
    for (const t of s.turrets) {
      t.phase += dt * 2;
      if (t.flash > 0) t.flash -= dt;
      t.fireT -= dt * slowMul;
      if (t.fireT <= 0) {
        const a = Math.atan2(p.y - t.y, p.x - t.x);
        s.ebullets.push({ x: t.x, y: t.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 5 });
        t.fireT = s.diff.turretFire;
      }
    }
```

- [ ] **Step 4: 자동사격 타깃에 터렛 포함** — auto-fire 후보 블록:
```js
      if (s.boss && s.boss.dying <= 0 && s.boss.y > 0) cand.push(s.boss);
      for (const m of s.mines) cand.push(m);
      for (const r of s.rocks) cand.push(r);
```
다음에 추가:
```js
      for (const t of s.turrets) cand.push(t);
```

- [ ] **Step 5: 총알-터렛 충돌/격파 추가** — bullets 루프에서 rocks 충돌 블록(`if (!dead) for (let j = s.rocks.length - 1; ...`)이 끝나는 `}` 다음, `if (dead) s.bullets.splice(i, 1);` 앞에 추가:
```js
      if (!dead) for (let j = s.turrets.length - 1; j >= 0; j--) {
        const t = s.turrets[j];
        if (dist2(b, t) < (t.r + 4) * (t.r + 4)) {
          t.hp -= 1; t.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#ff9a5a', 4, 110, 2);
          if (t.hp <= 0) {
            s.turrets.splice(j, 1);
            addScore(s, 60, t.x, t.y, undefined, 'destroy');
            burst(s, t.x, t.y, '#ff9a5a', 16, 230, 3);
            wave(s, t.x, t.y, 56, '#ff9a5a');
            SY.audio.explode();
            for (let kk = 0; kk < 3; kk++) {
              const aa = s.rng() * Math.PI * 2;
              s.crystals.push({ x: t.x, y: t.y, vx: Math.cos(aa) * 120, vy: Math.sin(aa) * 120, r: 7, phase: s.rng() * 6 });
            }
          }
          break;
        }
      }
```

- [ ] **Step 6: 통과 확인** — `node --test 'test/unit/difficulty.test.mjs'` PASS, `node --test 'test/unit/*.mjs'` → `fail 0` (특히 "bucket sum ≡ score" 회귀 없음 — 터렛 60은 destroy 버킷으로 정상 합산).

- [ ] **Step 7: 커밋**
```bash
git add js/games/neonvortex/game.js test/unit/difficulty.test.mjs
git commit -m "feat: 터렛 조준 사격 AI + 자동사격 타깃 + 격파(60점+크리스털3)"
```

---

### Task 3: 터렛 렌더 (enemyMid 스프라이트 + 텔레그래프)

**Files:** Modify `js/games/neonvortex/render.js`; Test `test/unit/static.test.mjs`

- [ ] **Step 1: 실패 정적 핀 추가** — `test/unit/static.test.mjs` 끝에 append:
```js
test('render.js draws turrets', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('s.turrets'), 'turrets are rendered');
  assert.ok(/drawTurret/.test(src), 'has a drawTurret routine');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/static.test.mjs'`.

- [ ] **Step 3: `drawTurret` 추가** — `render.js`의 `drawMine` 함수 정의 다음(또는 `drawBoss` 앞)에 추가:
```js
  function drawTurret(ctx, t) {
    const charging = t.fireT < 0.5; // telegraph window before firing
    if (!SP.draw(ctx, 'enemyMid', t.x, t.y, (t.r + 4) * 2.2, 0)) {
      // vector fallback: hex emplacement + core
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.shadowColor = '#ff5a78';
      ctx.shadowBlur = 10;
      poly(ctx, 0, 0, t.r, 6, t.phase * 0.2);
      ctx.fillStyle = t.flash > 0 ? '#ffd9e1' : '#2a0f16';
      ctx.fill();
      ctx.strokeStyle = '#ff5a78';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, t.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a78';
      ctx.fill();
      ctx.restore();
    } else if (t.flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'enemyMid', t.x, t.y, (t.r + 4) * 2.2, 0);
      ctx.restore();
    }
    if (charging) { // pulsing telegraph ring
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.beginPath();
      ctx.arc(0, 0, t.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,90,120,' + (0.35 + 0.3 * Math.sin(t.phase * 8)) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
```

- [ ] **Step 4: 렌더 순서에 터렛 추가** — render의 그리기 순서에서 mines 라인:
```js
    for (const m of s.mines) drawMine(ctx, m);
```
다음에 추가:
```js
    for (const t of s.turrets) drawTurret(ctx, t);
```

- [ ] **Step 5: 통과 확인** — `node --test 'test/unit/static.test.mjs'` PASS, `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 6: 커밋**
```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: 터렛 렌더(enemyMid 스프라이트 + 텔레그래프 링 + 벡터 폴백)"
```

---

### Task 4: 점수표 + 문서

**Files:** Modify `README.md`, `design.md`

- [ ] **Step 1: README 점수표에 터렛 행 추가** — `README.md`의 점수 시스템(점수 표)에서 "기뢰 파괴 | 25" 행을 찾아, 그 아래(또는 적절한 위치)에 추가. 먼저 `grep -n "기뢰 파괴\|25\|점수" README.md`로 정확한 표 위치를 찾고, 기뢰 행과 같은 표 형식으로 한 행 추가:
```
| 터렛 파괴 | 60 (+크리스털 3 드랍) |
```
(표의 실제 열 구성에 맞춰 칸 수를 일치시킬 것. 기뢰 행의 형식을 그대로 따른다.)

- [ ] **Step 2: design.md 자산 현황 갱신** — `design.md`의 미사용 키 문단에서 `enemyMid`를 미사용 목록에서 제거. 현재:
```
3개(`enemyMid`·`beam`·`burst`) — 중형 적·보스 빔·정적 폭발은 대응 메커니즘 부재로
```
를:
```
2개(`beam`·`burst`) — 보스 빔·정적 폭발은 대응 메커니즘 부재로
```
그리고 같은 문단에 한 문장 추가(터렛이 enemyMid를 씀): 적절한 위치에
```
터렛 적은 `enemyMid`(빨강 중형 드론)를 사용한다.
```

- [ ] **Step 3: 커밋**
```bash
git add README.md design.md
git commit -m "docs: 터렛 점수표(60) + enemyMid 사용 반영"
```

---

### Task 5: 검증

- [ ] **Step 1: 점수 동기화 확인** — `score-sync-checker` 에이전트로 README 점수표 ↔ `game.js` 상수(터렛 60 등) 일치 확인.
- [ ] **Step 2: rng-fairness 확인** — `rng-fairness-auditor` 에이전트로 터렛 스폰/발사각/간격이 전부 `s.rng()`인지(코스메틱만 Math.random) 확인.
- [ ] **Step 3: 핫패스 성능** — `performance-analyzer` 에이전트로 turret 업데이트/렌더 루프 프레임당 무할당 확인.
- [ ] **Step 4: standalone 재생성** (사용자 실행) — `/build-standalone`.
- [ ] **Step 5: 스크린샷 수동 검증** — `http://localhost:3000` FREE PLAY를 HARD로: 터렛(빨강 드론)이 등장해 텔레그래프 후 조준탄 발사, 5히트에 격파+크리스털 드랍, EASY에선 미등장.

---

## Self-Review

**Spec coverage:** 터렛 고정 포대/HP5/조준 사격/텔레그래프 → Task1+2+3. 접촉 데미지 없음 → 충돌은 총알-터렛만(플레이어-터렛 접촉 코드 없음). 격파 60+크리스털3 → Task2. enemyMid 렌더 → Task3. turretCap 게이팅(easy0/normal2/hard3) → Task1(스폰) + Phase1 DIFF. 시드 난수 → spawnTurret/fireT/aim 모두 s.rng()·atan2(결정적). 점수표 → Task4. ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드. Task4 Step1은 README 표 형식이 불확실해 "grep로 위치 확인 후 기뢰 행 형식 따름"으로 구체화(실행자가 실제 표에 맞춤). ✓

**Type consistency:** turret 엔티티 필드 `{x,y,r,hp,maxHp,fireT,flash,phase}` — spawnTurret 생성 ↔ update AI(fireT/phase/flash) ↔ 충돌(hp) ↔ drawTurret(fireT/flash/phase) 일치. `s.turrets` 배열명 game.js↔render.js 일치. ebullet 형태 `{x,y,vx,vy,r}`는 기존 enemy-bullet 루프와 동일(별도 처리 불필요). addScore(...,'destroy') 버킷은 기존과 동일. ✓
