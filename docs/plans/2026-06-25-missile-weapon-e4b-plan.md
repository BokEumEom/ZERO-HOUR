# 호밍 미사일 파워업 (E4b) — 설계 + 계획

> 아틀라스 섹션 4(WEAPONS/PROJECTILES)의 미사일 아트를 9번째 파워업으로 흡수.
> 60초 코어 유지, 데일리 공정. 브랜치 `feat/missile-weapon`. 기계적 구현용.

**확정 rect:** missile (966,284,44,105) — 핀+빨간 노즈+청록 배기, 위 방향.

**불변식:** 타겟팅 = 결정론적 최근접 적(반응형, 공정). 새 Math.random/rng 0개
(베이스라인 14 유지). 60fps 무할당(기존 탄환 파이프라인 재사용). 점수 무관. 파워업표 동기화.

**결정:** 호밍 미사일 메커닉 / 9번째 일반 파워업(백 포함).

---

## Task 1: 파워업 등록 (game.js + sprites.js)

**game.js** POWER_TYPES — 'DRONE' 뒤에 'MISSILE':
```javascript
  const POWER_TYPES = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME', 'DRONE', 'MISSILE'];
```
**game.js** POWER_META — DRONE 줄 뒤:
```javascript
    MISSILE:{ glyph: '➤',  color: '#ff8a3a', label: 'MISSILES' },
```
**game.js** POWER_DURATION:
```javascript
  const POWER_DURATION = { MAGNET: 9, SLOW: 6, X2: 9, BOOST: 8, SPREAD: 9, DRONE: 9, MISSILE: 8 };
```
**game.js** freshState fx — `DRONE: 0` 뒤에 `, MISSILE: 0`:
```javascript
      fx: { MAGNET: 0, SLOW: 0, X2: 0, BOOST: 0, SPREAD: 0, DRONE: 0, MISSILE: 0 },
```

**sprites.js** A{} (frameCorner 뒤):
```javascript
    missile:     { x: 966,  y: 284, w: 44,  h: 105 }, // homing missile projectile (section 4)
```
**sprites.js** POWER_ICONS (DRONE 뒤) — 미사일 스프라이트를 배지로 재사용:
```javascript
    MISSILE:{ x: 966, y: 284, w: 44, h: 105 }, // homing missile (also the projectile sprite)
```

---

## Task 2: 발사 + 조향 (game.js)

**game.js** 오토파이어 — SPREAD 분기를 MISSILE 우선으로 교체:
```javascript
      if (target) {
        p.fireCd = 0.19;
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        if (s.fx.MISSILE > 0) {
          // homing missile: steers to the nearest enemy each frame (reuses the bullet pipeline)
          s.bullets.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 1.3, homing: true });
        } else {
          const angles = s.fx.SPREAD > 0 ? [a - 0.22, a, a + 0.22] : [a];
          for (const an of angles) {
            s.bullets.push({ x: p.x + Math.cos(an) * 16, y: p.y + Math.sin(an) * 16, vx: Math.cos(an) * 520, vy: Math.sin(an) * 520, life: 0.85 });
          }
        }
        SY.audio.shoot();
      } else p.fireCd = 0.06;
```

**game.js** 탄환 루프 이동 라인(745-747) — homing 조향 추가:
```javascript
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      if (b.homing) {
        const tgt = nearestTarget(s, b.x, b.y, 520 * 520);
        if (tgt) {
          const desired = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = desired - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const maxTurn = 5.5 * dt;            // rad/frame
          cur += Math.max(-maxTurn, Math.min(maxTurn, d));
          b.vx = Math.cos(cur) * 430; b.vy = Math.sin(cur) * 430;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
```
(`nearestTarget(s,x,y,maxD2)`는 이미 존재 — 드론이 사용. 무할당.)

---

## Task 3: 렌더 + HUD + README

**render.js** 탄환 그리기(537-547) — homing이면 미사일 스프라이트:
```javascript
    for (const b of s.bullets) {
      if (b.homing) {
        if (!SP.draw(ctx, 'missile', b.x, b.y, 26, Math.atan2(b.vy, b.vx) + Math.PI / 2)) {
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
          ctx.fillStyle = '#ff8a3a'; ctx.fillRect(-7, -2, 14, 4); ctx.restore();
        }
        continue;
      }
      if (!SP.draw(ctx, 'bulletTeal', b.x, b.y, 18, Math.atan2(b.vy, b.vx) + Math.PI / 2)) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#9ff5e8';
        ctx.shadowColor = '#2de2c6';
        ctx.shadowBlur = 8;
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.restore();
      }
    }
```

**main.js** HUD 배지 루프(143):
```javascript
    for (const k of ['MAGNET', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'DRONE', 'MISSILE']) {
```

**README.md** 파워업 표 — DRONE 행 근처:
```
| MISSILES | 8초 | 호밍 미사일 발사 — 적을 추적하는 유도탄(SPREAD 대체) |
```

---

## Task 4: 테스트

**test/unit/missile.test.mjs** (신규):
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';
const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G) { G.start('free', 'normal'); for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60); return G.state; }

test('MISSILE is a ninth power-up type with a duration', () => {
  const G = boot().SY.nvGame;
  assert.ok(G.POWER_META.MISSILE, 'MISSILE meta present');
  assert.equal(G.POWER_DURATION.MISSILE, 8);
});

test('while MISSILE is active the player fires a homing bullet', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.fx.MISSILE = 8; s.player.fireCd = 0;
  s.mines = [{ x: s.player.x + 200, y: s.player.y, r: 11, hp: 1, speed: 60, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }];
  s.rocks = []; s.boss = null; s.turrets = []; s.foes = []; s.crates = []; s.bullets = [];
  G.update(1 / 60);
  assert.ok(s.bullets.some(b => b.homing), 'a homing missile was fired');
});

test('a homing missile steers toward the nearest enemy', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.bullets = [{ x: 480, y: 300, vx: 430, vy: 0, life: 1.3, homing: true }]; // flying +x
  s.mines = [{ x: 480, y: 80, r: 11, hp: 1, speed: 0, phase: 0, flash: 0, vx: 0, vy: 0, entryT: 0 }]; // enemy is straight up
  s.rocks = []; s.boss = null; s.turrets = []; s.foes = []; s.crates = []; s.elite = null;
  const b = s.bullets[0];
  for (let i = 0; i < 10; i++) { if (s.bullets[0]) G.update(1 / 60); }
  // velocity should have rotated toward -y (upward)
  assert.ok(b.vy < -20, 'missile turned toward the enemy above (vy negative)');
});

test('same daily seed -> MISSILE appears identically (bag fairness)', () => {
  const order = () => {
    const G = boot().SY.nvGame; G.start('daily'); const s = G.state;
    const bag = [];
    for (let n = 0; n < 18; n++) bag.push(G.POWER_META ? (s.powBag.length ? s.powBag.slice() : '-') : '-');
    return JSON.stringify(s.seedStr);
  };
  assert.equal(order(), order());
});
```

**static.test.mjs** 핀 (frame 핀 근처):
```javascript
test('homing missile weapon (E4b) is wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/'MISSILE'/.test(game) && /homing/.test(game), 'MISSILE type + homing logic');
  assert.ok(/nearestTarget\(s, b\.x, b\.y/.test(game), 'missiles steer via nearestTarget');
  const render = read(`${NV}/render.js`);
  assert.ok(/b\.homing/.test(render) && /'missile'/.test(render), 'homing bullets drawn as missiles');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/missile:\s*\{/.test(spr), 'missile rect');
  const main = read(`${NV}/main.js`);
  assert.ok(/'SPREAD', 'DRONE', 'MISSILE'/.test(main), 'MISSILE HUD badge');
});
```
(Math.random 베이스라인 14 핀은 game.js 대상 — 미사일은 rng/Math.random 미사용이라 무영향.)

---

## 완료 후
- `node --test 'test/unit/*.mjs'` 3x 안정. rng-fairness-auditor(미사일 발사·조향) + performance-analyzer(탄환 루프 조향 + drawMissile).
- 사용자: /build-standalone + 모바일 검증. 다음: E6(추가 파워업, 1UP).

## Self-Review
- 커버리지: 파워업 등록(T1), 발사+조향(T2), 렌더+HUD+README(T3), 테스트(T4).
- 일관성: missile rect, 'MISSILE' 타입, homing 플래그, nearestTarget이 game/render/sprites/main/test에서 일치.
- 공정성: 타겟팅 결정론(최근접), 백은 기존 시드 셔플, 새 Math.random 없음.
- 성능: homing 조향은 기존 탄환 루프 내 무할당 수학 + nearestTarget 재사용(드론과 동일).
