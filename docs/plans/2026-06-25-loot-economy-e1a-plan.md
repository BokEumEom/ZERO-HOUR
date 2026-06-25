# 전리품 상자 & 보상 토큰 E1a — Implementation Plan

> REQUIRED SUB-SKILL: subagent-driven-development 또는 executing-plans. 체크박스 추적.

**Goal:** 파괴 가능한 전리품 상자(crate/canister)가 코인·젬등급 토큰을 떨구는 위험-보상 시스템. 토큰 수집 = `loot` 점수 버킷. (보물상자 잭팟·코스메틱 누적은 E1b.)

**Architecture:** 신규 엔티티 `s.crates`(상자)·`s.tokens`(토큰)를 game.js 시뮬에 추가. 상자는 접촉 피해 없음, 시드 스폰, 파괴 시 토큰 분출. 토큰은 크리스털처럼 수집되나 콤보 없이 `loot` 버킷. render.js에 drawCrate/drawToken.

**불변식:** 모든 스폰·드롭 등급 = `s.rng()`(데일리 공정). Math.random 코스메틱만. 60fps 무할당. 점수 동기화(README).

**전제:** 설계 spec `docs/plans/2026-06-24-loot-economy-design.md` 승인됨. 브랜치 `feat/loot-economy`.

**확정 rect:** crate(372,266,98,78) · canister(498,278,94,90) · coin(884,709,60,56). 젬: 기존 crystalTeal/Amber/Boss.

**토큰 점수:** coin 15 / teal 25 / amber 50 / purple 100.

---

### Task 1: 엔티티 + loot 버킷 + 스폰/드롭 로직

**Files:** sprites.js, game.js, test/unit/loot.test.mjs

- [ ] **Step 1: 실패 테스트** — `test/unit/loot.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';
const boot = () => loadModules(['js/store.js','js/games/neonvortex/foes.js','js/games/neonvortex/game.js'], { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff='normal'){ G.start('free', diff); for(let i=0;i<200&&G.phase!=='playing';i++) G.update(1/60); return G.state; }

test('crates spawn (seeded, capped) and carry hp', () => {
  const G = boot().SY.nvGame; const s = play(G);
  let max = 0;
  for (let i=0;i<60*30;i++){ G.update(1/60); max = Math.max(max, s.crates.length); }
  assert.ok(max > 0, 'crates spawned');
  assert.ok(max <= 2, 'crate cap 2');
  for (const c of s.crates) assert.ok(c.hp > 0 && c.r > 0);
});

test('breaking a crate drops loot tokens and credits the loot bucket', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind:'crate', x:480, y:300, r:20, hp:1, maxHp:4, flash:0, phase:0 }];
  s.rocks=[]; s.mines=[]; s.boss=null; s.turrets=[]; s.foes=[]; s.bullets=[]; s.tokens=[];
  s.bullets.push({ x:480, y:300, vx:0, vy:0, life:.5 }); G.update(1/60);
  assert.equal(s.crates.length, 0, 'crate destroyed');
  assert.ok(s.tokens.length >= 1, 'loot tokens dropped');
});

test('collecting a token adds its tier value into the loot bucket', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crystals=[]; s.tokens=[{ x:s.player.x, y:s.player.y, vx:0, vy:0, r:8, phase:0, tier:'amber' }];
  s.breakdown.loot = 0; const before = s.score;
  G.update(1/60);
  assert.equal(s.tokens.length, 0, 'token collected');
  assert.equal(s.breakdown.loot, 50, 'amber tier = 50 into loot');
  assert.equal(s.score - before, 50);
});

test('same daily seed → identical crate + token layout (fairness)', () => {
  const run = () => { const G = boot().SY.nvGame; const s = G.start('daily'); const st = G.state;
    for (let i=0;i<60*20;i++) G.update(1/60);
    return JSON.stringify(st.crates.map(c=>[c.kind,Math.round(c.x),Math.round(c.y)])); };
  assert.equal(run(), run(), 'daily crates identical across same-seed runs');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/loot.test.mjs'` → FAIL (s.crates undefined).

- [ ] **Step 3: 구현**

`sprites.js` A{}에서 `foeLaser` 줄 다음에:
```javascript
    lootCrate:   { x: 372, y: 266, w: 98, h: 78 }, // locked loot crate
    lootCanister:{ x: 498, y: 278, w: 94, h: 90 }, // canister/module crate
    coin:        { x: 884, y: 709, w: 60, h: 56 }, // gold reward coin
```

`game.js` freshState: `foes: []` 줄에 `crates: [], tokens: [],` 추가; `breakdown:` 에 `loot: 0` 추가; `spawnT` 에 `crate: 6` 추가.

`game.js` addScore의 bucket 분기(`else if (bucket === 'boss')` 뒤)에:
```javascript
    } else if (bucket === 'loot') {
      s.breakdown.loot += vBase;
```

`game.js` — spawnRock 근처에 추가:
```javascript
  const TOKEN_VALUE = { coin: 15, teal: 25, amber: 50, purple: 100 };
  function spawnCrate(s) {
    const kind = s.rng() < 0.5 ? 'crate' : 'canister';
    s.crates.push({ kind, x: 90 + s.rng() * (W - 180), y: 80 + s.rng() * (H - 200),
      r: 20, hp: kind === 'crate' ? 4 : 3, maxHp: kind === 'crate' ? 4 : 3, flash: 0, phase: s.rng() * 6 });
  }
  function spawnLoot(s, x, y) {
    const n = 3 + Math.floor(s.rng() * 3); // 3-5 tokens
    for (let i = 0; i < n; i++) {
      const roll = s.rng();
      const tier = roll < 0.6 ? 'coin' : roll < 0.82 ? 'teal' : roll < 0.95 ? 'amber' : 'purple';
      const a = s.rng() * Math.PI * 2, sp = 60 + s.rng() * 90;
      s.tokens.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 8, phase: s.rng() * 6, tier });
    }
  }
```

- [ ] **Step 4: 통과 확인** — `node --test 'test/unit/*.mjs'` (Task 2의 update 연동 후 전부 통과; 이 시점엔 spawn/collect가 update에 아직 안 붙어 일부 실패 가능 → Task 2와 함께 GREEN).

- [ ] **Step 5: 커밋** (Task 2와 함께)

---

### Task 2: update 연동 — 상자 스폰·토큰 수집·탄 충돌·자동조준

**Files:** game.js, test/unit/loot.test.mjs(위 테스트 공유)

- [ ] **Step 1: 구현**

(a) 스폰 — spawning 블록(turret 스폰 뒤)에:
```javascript
    s.spawnT.crate -= dt;
    if (s.spawnT.crate <= 0) {
      s.spawnT.crate = 7 + s.rng() * 5;
      if (s.crates.length < 2) spawnCrate(s);
    }
```

(b) 자동조준 cand — `for (const f of s.foes) cand.push(f);` 다음:
```javascript
      for (const cr of s.crates) cand.push(cr);
```

(c) 탄 충돌 — foe 충돌 블록 다음(`if (dead) s.bullets.splice` 앞)에:
```javascript
      if (!dead) for (let j = s.crates.length - 1; j >= 0; j--) {
        const cr = s.crates[j];
        if (dist2(b, cr) < (cr.r + 4) * (cr.r + 4)) {
          cr.hp -= 1; cr.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#ffd9a8', 4, 110, 2);
          if (cr.hp <= 0) {
            s.crates.splice(j, 1);
            addScore(s, 20, cr.x, cr.y, undefined, 'destroy');
            blast(s, cr.x, cr.y, 58);
            spawnLoot(s, cr.x, cr.y);
            SY.audio.explode();
          }
          break;
        }
      }
```

(d) 토큰 이동·수집 — 크리스털 루프 다음에:
```javascript
    for (let i = s.tokens.length - 1; i >= 0; i--) {
      const t = s.tokens[i];
      t.phase += dt * 3;
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.vx *= Math.pow(0.05, dt); t.vy *= Math.pow(0.05, dt);
      t.x = Math.min(W - 10, Math.max(10, t.x)); t.y = Math.min(H - 10, Math.max(10, t.y));
      const d = Math.sqrt(dist2(t, p)) || 1;
      if (magnetR && d < magnetR) {
        const pull = 900 * (1 - d / magnetR) + 150;
        t.vx += ((p.x - t.x) / d) * pull * dt; t.vy += ((p.y - t.y) / d) * pull * dt;
      }
      if (d < p.r + t.r + 6) {
        s.tokens.splice(i, 1);
        addScore(s, TOKEN_VALUE[t.tier] || 15, t.x, t.y, undefined, 'loot');
        burst(s, t.x, t.y, '#ffd9a8', 6, 140, 2);
        SY.audio.collect(1);
      }
    }
```
(주: `magnetR`/`p`는 크리스털 루프에서 이미 선언됨 — 같은 스코프.)

- [ ] **Step 2: 통과 확인** — `node --test 'test/unit/*.mjs'` → loot 4종 + 기존 전부 PASS.

- [ ] **Step 3: 커밋**
```bash
git add js/games/neonvortex/sprites.js js/games/neonvortex/game.js test/unit/loot.test.mjs
git commit -m "feat: loot crates + reward tokens (seeded spawn, drop, collect into loot bucket)"
```

---

### Task 3: 렌더 — drawCrate/drawToken

**Files:** render.js, test/unit/static.test.mjs

- [ ] **Step 1: 실패 테스트** — static.test.mjs에:
```javascript
test('loot crates and tokens are rendered from atlas art', () => {
  const render = read(`${NV}/render.js`);
  assert.ok(/drawCrate/.test(render) && /s\.crates/.test(render), 'crates drawn');
  assert.ok(/drawToken/.test(render) && /s\.tokens/.test(render), 'tokens drawn');
  const spr = read(`${NV}/sprites.js`);
  for (const k of ['lootCrate','lootCanister','coin']) assert.ok(new RegExp(k+':\\s*\\{').test(spr), k);
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/static.test.mjs'` → FAIL.

- [ ] **Step 3: 구현** — render.js, drawTurret 뒤에:
```javascript
  function drawCrate(ctx, c) {
    const key = c.kind === 'canister' ? 'lootCanister' : 'lootCrate';
    if (!SP.draw(ctx, key, c.x, c.y, (c.r + 6) * 2.2, 0)) {
      ctx.save(); ctx.fillStyle = c.flash > 0 ? '#fff' : '#caa46a';
      ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2); ctx.restore();
    } else if (c.flash > 0) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, key, c.x, c.y, (c.r + 6) * 2.2, 0); ctx.restore();
    }
  }
  function drawToken(ctx, t) {
    const bob = Math.sin(t.phase) * 2;
    const key = t.tier === 'coin' ? 'coin' : t.tier === 'amber' ? 'crystalAmber' : t.tier === 'purple' ? 'crystalBoss' : 'crystalTeal';
    if (SP.draw(ctx, key, t.x, t.y + bob, (t.r + 2) * 2.4, Math.sin(t.phase * 0.6) * 0.15)) return;
    ctx.save(); ctx.fillStyle = t.tier === 'coin' ? '#ffcf4d' : '#9ff5e8';
    ctx.beginPath(); ctx.arc(t.x, t.y + bob, t.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
```
render()의 `for (const r of s.rocks) drawRock(ctx, r);` 다음에 `for (const c of s.crates) drawCrate(ctx, c);`; `for (const c of s.crystals) drawCrystal(...)` 다음에 `for (const t of s.tokens) drawToken(ctx, t);`.

- [ ] **Step 4: 통과 확인** — `node --test 'test/unit/*.mjs'` → PASS.

- [ ] **Step 5: 커밋**
```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: render loot crates and reward tokens"
```

---

### Task 4: loot 버킷 UI + README 점수표

**Files:** main.js, test/unit/game.test.mjs, README.md

- [ ] **Step 1: game.test 갱신** — line 168 합계에 `bd.loot` 추가; line 211 keys 배열에 `'loot'` 추가:
```javascript
  // line ~168
  bd.crystals + bd.combo + bd.destruction + bd.boss + bd.heat + bd.loot, res.score,
  // line ~211
  assert.deepEqual(Object.keys(res.breakdown).sort(), ['boss', 'combo', 'crystals', 'destruction', 'heat', 'loot']);
```

- [ ] **Step 2: main.js 결과 UI** — `statRow('BOSS PTS', ...)` 다음 줄에:
```javascript
      statRow('LOOT PTS', '+' + fmt(bd.loot || 0)) +
```

- [ ] **Step 3: README** — 점수표(보스 격파 행 뒤)에:
```markdown
| 전리품 상자(Crate) 파괴 | 20 + 코인·젬 토큰 드랍 |
| 보상 토큰 수집 | 코인 15 / teal 젬 25 / amber 젬 50 / purple 젬 100 |
```

- [ ] **Step 4: 통과 확인** — `node --test 'test/unit/*.mjs'` → 전부 PASS(3x 안정).

- [ ] **Step 5: 커밋**
```bash
git add js/games/neonvortex/main.js test/unit/game.test.mjs README.md
git commit -m "feat: loot score bucket in result breakdown + README sync"
```

---

## 완료 후
- rng-fairness-auditor(crates/tokens), performance-analyzer(핫패스), score-sync-checker.
- 사용자: /build-standalone + 검증. 다음: E1b(보물상자 잭팟 + creditsCollected 누적).

## Self-Review
- Spec 커버리지: 엔티티+버킷(T1), update 연동(T2), 렌더(T3), UI+동기화(T4).
- 일관성: `s.crates`/`s.tokens`, tier(coin/teal/amber/purple)·TOKEN_VALUE(15/25/50/100), `loot` 버킷이 freshState·addScore·테스트·UI·README에서 일치. magnetR/p 스코프 공유 명시.
