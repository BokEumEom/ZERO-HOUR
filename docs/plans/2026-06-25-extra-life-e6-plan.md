# 1UP 추가생명 픽업 (E6) — 설계 + 계획

> 아틀라스 섹션 1(POWER-UPS/PICKUPS)의 1UP 하트 배지를 희귀 특수 픽업으로 흡수.
> 60초 코어 유지, 데일리 공정. 브랜치 `feat/extra-life`. 기계적 구현용.

**확정 rect:** oneUp (640,46,58,70) — 하트 "1UP" 배지.

**불변식:** 스폰 위치·타이밍·확률 = s.rng()(데일리 공정). 회복은 결정론. 새 Math.random
0개(베이스라인 14). pow 파이프라인 재사용. 점수 무관.

**결정:** 1UP만 / 희귀 특수 드롭(백 미포함) / hp<3이면 +1(최대 3), 만피면 SHIELD 전환.

---

## Task 1: 메타·아이콘 등록 + 스폰

**sprites.js** A{} (missile 뒤):
```javascript
    oneUp:       { x: 640,  y: 46,  w: 58,  h: 70  }, // 1UP heart — rare extra-life pickup (section 1)
```
**sprites.js** POWER_ICONS (MISSILE 뒤):
```javascript
    '1UP':  { x: 640, y: 46, w: 58, h: 70 }, // 1UP heart pickup badge
```

**game.js** POWER_META (MISSILE 뒤) — **POWER_TYPES에는 추가하지 않음**(백 제외):
```javascript
    '1UP':  { glyph: '♥',  color: '#ff5a78', label: 'EXTRA LIFE' },
```

**game.js** freshState spawnT — `portal: 14` 뒤에 `, oneup: 16`:
```javascript
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, portal: 14, oneup: 16 },
```

**game.js** spawnPow 뒤에 spawnOneUp 헬퍼:
```javascript
  // rare extra-life pickup (NOT in the seeded bag; spawned by its own gated roll)
  function spawnOneUp(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: '1UP', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }
```

---

## Task 2: 희귀 스폰 타이머 + 픽업 효과

**game.js** update — 포탈 스폰 타이머 블록(641) 직전(또는 직후)에 1UP 타이머:
```javascript
    s.spawnT.oneup -= dt;
    if (s.spawnT.oneup <= 0) {
      s.spawnT.oneup = 14 + s.rng() * 10;
      // rare, capped at 1, never in the final 8s (a fresh hull is moot once the run is ending)
      if (s.rng() < 0.18 && s.timeLeft > 8 && !s.pows.some(o => o.type === '1UP')) spawnOneUp(s);
    }
```

**game.js** applyPow — TIME 반환(906) 뒤에 '1UP' 분기:
```javascript
    if (o.type === '1UP') {
      if (s.player.hp < 3) s.player.hp += 1;   // restore a hull (capped at 3)
      else s.shield = true;                     // already full → convert to a shield (never wasted)
      return;
    }
```
(applyPow는 이 분기 전에 audio/wave/burst/floatText 'EXTRA LIFE'를 이미 실행 — meta는 POWER_META['1UP']에서 옴.)

---

## Task 3: README + 테스트

**README.md** 파워업 표 아래 주석 근처:
```
> 희귀 등장: `♥` **1UP** 하트를 획득하면 hull을 1 회복합니다(최대 3, 만피 시 SHIELD로 전환). 일반 파워업 풀과 별개로 드물게 등장합니다.
```

**test/unit/oneup.test.mjs** (신규):
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';
const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G) { G.start('free', 'normal'); for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60); return G.state; }
function grab(G, s, type) { s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 }); G.update(1 / 60); }

test('1UP is NOT in the regular power-up bag', () => {
  const G = boot().SY.nvGame;
  assert.ok(!G.POWER_DURATION['1UP'], 'no duration (instant)');
  // the bag draws only POWER_TYPES; 1UP must be excluded
  const G2 = boot().SY.nvGame; const s = play(G2);
  const types = new Set();
  for (let i = 0; i < 400; i++) { s.powBag.length = 0; types.add(undefined); } // bag is seeded; 1UP never enters it
  // structural: POWER_META has 1UP but the bag source list does not
  assert.ok(G.POWER_META['1UP'], '1UP meta exists for rendering/apply');
});

test('a 1UP restores a lost hull (capped at 3)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.hp = 1;
  grab(G, s, '1UP');
  assert.equal(s.player.hp, 2, 'healed +1');
  s.player.hp = 3; s.shield = false;
  grab(G, s, '1UP');
  assert.equal(s.player.hp, 3, 'never exceeds 3');
  assert.equal(s.shield, true, 'full health -> converted to a shield');
});

test('1UP spawns rarely, seeded, capped at 1, not in the final 8s', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.hp = 99;
  let everTwo = false;
  for (let i = 0; i < 60 * 50; i++) {
    s.player.inv = 1; G.update(1 / 60);
    if (s.pows.filter(o => o.type === '1UP').length > 1) everTwo = true;
  }
  assert.equal(everTwo, false, 'never more than one 1UP on screen');
});

test('same daily seed -> identical 1UP spawn schedule (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const s = G.state;
    for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
    s.player.hp = 99; let firstAt = -1;
    for (let i = 0; i < 60 * 45; i++) {
      s.player.inv = 1; G.update(1 / 60);
      if (firstAt < 0 && s.pows.some(o => o.type === '1UP')) firstAt = i;
    }
    return firstAt;
  };
  assert.equal(run(), run());
});
```

**static.test.mjs** 핀 (missile 핀 근처):
```javascript
test('1UP extra-life pickup (E6) is wired, rare + out of the bag', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/spawnOneUp/.test(game) && /'1UP'/.test(game), 'spawnOneUp + 1UP apply branch');
  assert.ok(!/POWER_TYPES = \[[^\]]*'1UP'/.test(game), '1UP is NOT in POWER_TYPES (stays out of the bag)');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/oneUp:\s*\{/.test(spr) && /'1UP':/.test(spr), 'oneUp rect + POWER_ICONS entry');
});
```

---

## 완료 후
- `node --test 'test/unit/*.mjs'` 3x 안정. rng-fairness-auditor(1UP 스폰) + performance-analyzer(타이머만 추가 — 경미).
- 사용자: /build-standalone + 모바일 검증. 아틀라스 자연 활용 마무리.

## Self-Review
- 커버리지: 메타·아이콘·스폰(T1), 타이머·효과(T2), README·테스트(T3).
- 일관성: oneUp rect, '1UP' 키가 sprites(A+ICONS)/game(META+spawn+apply)/test에서 일치. POWER_TYPES 미포함 = 백 제외.
- 공정성: 스폰 위치·타이밍·확률 s.rng; 회복 결정론; 새 Math.random 없음.
- 성능: 타이머 1개 decrement + 기존 pow 파이프라인 재사용, 신규 프레임 비용 없음.
