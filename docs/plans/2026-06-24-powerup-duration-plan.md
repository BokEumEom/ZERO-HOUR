# 파워업 지속시간 — Implementation Plan (Sub-project C)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 체크박스 추적.

**Goal:** 지속시간 단일 출처 + 더 길게 + 중복 획득 연장(캡) + HUD 숫자 카운트다운.

**Architecture:** `game.js`에 `POWER_DURATION` 추가·`G`에 노출, `applyPow`를 가산-캡으로. `main.js`는 중복 `POWER_DUR` 제거하고 `G.POWER_DURATION` 사용 + `chip()`에 숫자. README/CSS 동기화.

**Tech Stack:** Vanilla JS IIFE, `node --test 'test/unit/*.mjs'` (glob 필수).

**불변식:** 데일리 공정성(파워업 지속시간은 결정적 상수라 영향 없음), README 동기화.

**전제:** 설계 spec 승인됨. 브랜치 `feat/powerup-duration`.

---

### Task 1: POWER_DURATION 단일 출처 + 가산-캡 누적

**Files:**
- Modify: `js/games/neonvortex/game.js` (`POWER_DURATION` 상수, `G` 노출, `applyPow`)
- Test: `test/unit/foes.test.mjs` 아님 — 신규 `test/unit/powerup.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/unit/powerup.test.mjs` 생성:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });

function playing(G) {
  G.start('free', 'normal');
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}
// drop a power-up of `type` onto the player and step one frame to apply it
function pickUp(G, s, type) {
  s.pows.push({ x: s.player.x, y: s.player.y, type, r: 12, life: 9, phase: 0, vy: 0 });
  G.update(1 / 60);
}

test('G.POWER_DURATION exposes the new per-power durations', () => {
  const G = boot().SY.nvGame;
  assert.equal(G.POWER_DURATION.MAGNET, 9);
  assert.equal(G.POWER_DURATION.SLOW, 6);
  assert.equal(G.POWER_DURATION.X2, 9);
  assert.equal(G.POWER_DURATION.BOOST, 8);
  assert.equal(G.POWER_DURATION.SPREAD, 9);
});

test('picking up a power-up sets its base duration (minus the one applied frame)', () => {
  const G = boot().SY.nvGame;
  const s = playing(G);
  s.fx.X2 = 0;
  pickUp(G, s, 'X2');
  // base 9, one frame elapsed -> ~8.98
  assert.ok(s.fx.X2 > 8.9 && s.fx.X2 <= 9, `X2 ~= base after pickup, got ${s.fx.X2}`);
});

test('re-picking a power-up extends remaining time, capped at 2x base', () => {
  const G = boot().SY.nvGame;
  const s = playing(G);
  s.fx.X2 = 5;            // 5s remaining
  pickUp(G, s, 'X2');     // +9 -> 14, then minus a frame
  assert.ok(s.fx.X2 > 13.9 && s.fx.X2 <= 14, `extends to ~14, got ${s.fx.X2}`);
  s.fx.X2 = 17;           // already above cap-ish
  pickUp(G, s, 'X2');     // 17+9=26 -> capped at 18, minus a frame
  assert.ok(s.fx.X2 <= 18 && s.fx.X2 > 17.9, `capped at 2x base (18), got ${s.fx.X2}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/powerup.test.mjs'`
Expected: FAIL — `G.POWER_DURATION` undefined; durations still old (7/5/7/6/7); overwrite not additive.

- [ ] **Step 3: Implement**

`game.js` — `POWER_META` 정의 바로 뒤(line 16 근처)에 추가:

```javascript
  // power-up active durations (seconds). Single source of truth — main.js reads
  // these via G.POWER_DURATION for the HUD timer bar. SHIELD is consumable and
  // TIME is instant, so neither has a duration here.
  const POWER_DURATION = { MAGNET: 9, SLOW: 6, X2: 9, BOOST: 8, SPREAD: 9 };
```

`G` 노출 — `G` 객체 리터럴의 `W, H, POWER_META, DIFF,` 를 다음으로:

```javascript
    W, H, POWER_META, POWER_DURATION, DIFF,
```

`applyPow`의 `switch`를 가산-캡 + 상수표 기반으로 교체:

```javascript
  function applyPow(s, o) {
    const meta = POWER_META[o.type];
    SY.audio.powerup();
    wave(s, o.x, o.y, 56, meta.color);
    burst(s, o.x, o.y, meta.color, 12, 170, 2.6);
    floatText(s, o.x, o.y - 18, meta.label, meta.color);
    if (o.type === 'SHIELD') { s.shield = true; return; }       // consumable
    if (o.type === 'TIME') { s.timeLeft = Math.min(s.duration + 20, s.timeLeft + 5); return; } // instant
    const dur = POWER_DURATION[o.type];
    const key = o.type === 'SLOW' ? 'SLOW' : o.type; // fx keys match types
    s.fx[key] = Math.min(2 * dur, s.fx[key] + dur);  // extend remaining, cap at 2x base
  }
```

(주: `s.fx` 키는 MAGNET/SLOW/X2/BOOST/SPREAD로 타입과 동일하므로 `s.fx[o.type]` 직접 사용 가능 — `key` 분기는 불필요하면 `s.fx[o.type]`로 단순화한다:)

```javascript
    const dur = POWER_DURATION[o.type];
    s.fx[o.type] = Math.min(2 * dur, s.fx[o.type] + dur);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (신규 powerup + 기존 전부). 기존 `x2 powerup doubles into the correct buckets` 테스트는 `s.fx.X2 = 5`를 직접 설정하므로 영향 없음.

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/powerup.test.mjs
git commit -m "feat: single-source power-up durations (longer) + additive re-pickup capped at 2x"
```

---

### Task 2: main.js가 G.POWER_DURATION 사용 + HUD 숫자 카운트다운

**Files:**
- Modify: `js/games/neonvortex/main.js` (POWER_DUR 제거, chip 숫자)
- Modify: `css/neonvortex.css` (`.fx-num`)
- Test: `test/unit/static.test.mjs`

- [ ] **Step 1: Write the failing test**

`static.test.mjs` 끝에 추가:

```javascript
test('main.js reads power-up durations from G.POWER_DURATION (no duplicate table)', () => {
  const src = read(`${NV}/main.js`);
  assert.ok(/G\.POWER_DURATION/.test(src), 'main.js uses the shared duration source');
  assert.ok(!/const POWER_DUR =/.test(src), 'no duplicate POWER_DUR table in main.js');
});

test('fx badge shows a numeric countdown', () => {
  const src = read(`${NV}/main.js`);
  assert.ok(/fx-num/.test(src), 'chip renders a numeric remaining-time element');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/static.test.mjs'`
Expected: FAIL — main.js에 `const POWER_DUR =` 존재 / `G.POWER_DURATION` 없음 / `fx-num` 없음.

- [ ] **Step 3: Implement**

`main.js` line 66의 `const POWER_DUR = { ... };` 줄을 **삭제**.

`main.js` line 143을 `G.POWER_DURATION` 사용으로:

```javascript
      if (s.fx[k] > 0) chips += chip(meta[k], s.fx[k], G.POWER_DURATION[k]);
```

`chip()` 함수에 숫자 추가:

```javascript
  function chip(meta, secs, max) {
    const pct = max > 0 ? Math.max(0, Math.min(1, secs / max)) * 100 : 0;
    return '<span class="fx-badge" style="--c:' + meta.color + '">' +
      '<span class="fx-glyph">' + meta.glyph + '</span>' +
      (max > 0 ? '<span class="fx-num">' + Math.ceil(secs) + '</span>' : '') +
      (max > 0 ? '<span class="fx-bar"><i style="width:' + pct.toFixed(0) + '%"></i></span>' : '') +
      '</span>';
  }
```

`css/neonvortex.css`의 `.fx-badge` 블록(225줄 근처) 뒤에 추가:

```css
.fx-num { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; line-height: 1; opacity: 0.9; margin-left: 1px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (전체). `innerHTML sinks ... (6)` 테스트 유지(새 .innerHTML 라인 없음).

- [ ] **Step 5: Commit**

```bash
git add js/games/neonvortex/main.js css/neonvortex.css test/unit/static.test.mjs
git commit -m "feat: HUD power-up numeric countdown; main.js reads shared G.POWER_DURATION"
```

---

### Task 3: README 파워업 표 동기화

**Files:**
- Modify: `README.md` (파워업 표 + 누적 규칙)

- [ ] **Step 1: Update durations + add stacking note**

README 파워업 표(68-73줄)의 지속을 갱신: MAGNET 9초, SLOW-MO 6초, ×2 9초, BOOST 8초, SPREAD 9초. 표 아래에 한 줄 추가:

```markdown

같은 파워업을 다시 획득하면 남은 시간에 지속시간이 더해집니다(기본값의 2배까지).
```

- [ ] **Step 2: Verify + Commit**

Run: `node --test 'test/unit/*.mjs'` → PASS.

```bash
git add README.md
git commit -m "docs: update power-up durations and note re-pickup stacking"
```

---

## 완료 후
- 전체 테스트 통과(3x 안정).
- 사용자: `/build-standalone` + 브라우저 검증(파워업 재획득 시 바·숫자 연장, 캡, 숫자 카운트다운 표시).
- "단조롭다" 이니셔티브 A·B·C 전부 완료.

## Self-Review
- **Spec 커버리지:** 단일출처+값(T1), 누적-캡(T1), main 통합+HUD 숫자(T2), README(T3).
- **Placeholder:** 없음. applyPow는 단순화된 `s.fx[o.type]` 최종형 명시.
- **일관성:** `POWER_DURATION` 키(MAGNET/SLOW/X2/BOOST/SPREAD) = `s.fx` 키 = main.js 루프 키 일치. 값 9/6/9/8/9가 game.js·테스트·README에서 동일. 캡 `2*dur`가 T1 테스트(18)와 일치.
