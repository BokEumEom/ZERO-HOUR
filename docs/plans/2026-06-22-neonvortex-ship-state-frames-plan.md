# 상태 반응형 함선 프레임 (핵심 3종) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 함선 헐을 게임 상태(실드·저체력·부스트)에 따라 `sprite-atlas.png`의 SHIELDED / DAMAGED / BOOSTED 프레임으로 교체하는 순수 코스메틱 렌더 기능.

**Architecture:** `sprites.js`에 순수 함수 `pickHullFrame(state)`와 신규 rect를 추가하고, 도색 캐시를 `frame:paint` 복합키로 일반화한다. `render.js`의 `drawPlayer`가 매 프레임 한 줄로 프레임을 선택해 기존 `SP.draw`로 그린다(할당 없음, 벡터 폴백 유지). `game.js`·시드 RNG·점수·히트박스는 무변경.

**Tech Stack:** Vanilla JS (IIFE on `window.SY`), Canvas 2D, `node --test` + vm 샌드박스(의존성 0).

설계 근거: [docs/plans/2026-06-22-neonvortex-ship-state-frames-design.md](2026-06-22-neonvortex-ship-state-frames-design.md)

---

## File Structure

- `test/unit/helpers.mjs` (수정) — vm 샌드박스에 `Image` 스텁 추가 → `sprites.js`(로드 시 `new Image()`)를 헤드리스로 실행 가능.
- `js/games/neonvortex/sprites.js` (수정) — `pickHullFrame` 순수 함수, 신규 rect(`shielded`/`boosted`/`damaged`), 도색 캐시 `frame:paint` 일반화.
- `test/unit/sprites.test.mjs` (생성) — `pickHullFrame` 상태→키 매핑 + atlas 키 단위 테스트.
- `js/games/neonvortex/render.js` (수정) — `drawPlayer`가 `pickHullFrame`으로 프레임 선택, shielded면 벡터 실드 링 대체.
- `test/unit/static.test.mjs` (수정) — render.js가 상태 프레임을 구동하는지 정적 핀.
- `design.md` (수정) — 자산 섹션의 사용/미사용 키 현황 갱신.

---

### Task 1: `pickHullFrame` 순수 함수 + 테스트 인프라

**Files:**
- Modify: `test/unit/helpers.mjs` (sandbox 객체 리터럴, line 62~71)
- Modify: `js/games/neonvortex/sprites.js` (함수 추가 + export, line 147)
- Test: `test/unit/sprites.test.mjs` (생성)

- [ ] **Step 1: 샌드박스에 `Image` 스텁 추가 (sprites.js 로드 가능하게)**

`test/unit/helpers.mjs`에서 sandbox 객체 리터럴에 `Image`를 추가한다. `queueMicrotask,` 줄 바로 다음에 삽입:

```js
    queueMicrotask,
    // minimal Image stub so sprite modules (new Image() at load) run headless;
    // never decodes (complete=false) so SP.isReady() stays false in tests.
    Image: class { constructor() { this.onload = null; this.complete = false; this.naturalWidth = 0; this._src = ''; } set src(v) { this._src = v; } get src() { return this._src; } },
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/unit/sprites.test.mjs` 생성:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const load = () => loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites;

test('pickHullFrame maps player state to the right hull frame', () => {
  const SP = load();
  const pick = SP.pickHullFrame;
  assert.equal(pick({ shield: false, hp: 3, boost: 0 }), 'player', 'default');
  assert.equal(pick({ shield: false, hp: 3, boost: 1.5 }), 'boosted', 'boost flair');
  assert.equal(pick({ shield: false, hp: 1, boost: 0 }), 'damaged', 'last hull');
  assert.equal(pick({ shield: true, hp: 3, boost: 0 }), 'shielded', 'shield bubble');
});

test('pickHullFrame priority: shield > damaged > boosted', () => {
  const pick = load().pickHullFrame;
  assert.equal(pick({ shield: true, hp: 1, boost: 2 }), 'shielded', 'shield wins over all');
  assert.equal(pick({ shield: false, hp: 1, boost: 2 }), 'damaged', 'danger beats flair');
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test test/unit/sprites.test.mjs`
Expected: FAIL — `SP.pickHullFrame is not a function` (아직 미구현).

- [ ] **Step 4: `pickHullFrame` 구현 + export**

`js/games/neonvortex/sprites.js`에서 `function drawFit(...)` 정의 끝(line 145, `}` 다음) 과 export 줄(line 147) 사이에 함수를 추가한다:

```js
  // Pure: choose the hull frame for the current player state. Cosmetic only —
  // reads no RNG and mutates nothing. Priority: the shield bubble hides the
  // hull (wins), then low-hull danger reads over boost flair, else default.
  function pickHullFrame(st) {
    if (st && st.shield) return 'shielded';
    if (st && st.hp <= 1) return 'damaged';
    if (st && st.boost > 0) return 'boosted';
    return 'player';
  }
```

그리고 export 줄(line 147)에 `pickHullFrame`을 추가한다:

```js
  SY.nvSprites = { draw, drawFit, drawPlayer, setPaint, getPaint, pickHullFrame, atlas: A, isReady: () => ready, image: sheet };
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test test/unit/sprites.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: 커밋**

```bash
git add test/unit/helpers.mjs js/games/neonvortex/sprites.js test/unit/sprites.test.mjs
git commit -m "feat: pickHullFrame 순수 함수 + 테스트 Image 스텁"
```

---

### Task 2: 신규 rect + 도색 캐시 `frame:paint` 일반화

**Files:**
- Modify: `js/games/neonvortex/sprites.js` (atlas `A` line 20~33, `playerCanvas` 53~80, `setPaint` 84~87, `drawPlayer` 93~100, `draw` 107~127)
- Test: `test/unit/sprites.test.mjs` (테스트 추가)

- [ ] **Step 1: 실패하는 atlas-키 테스트 추가**

`test/unit/sprites.test.mjs` 끝에 추가:

```js
test('atlas exposes hull-state frames and renames shieldDome', () => {
  const A = load().atlas;
  assert.ok(A.shielded, 'shielded rect exists');
  assert.ok(A.boosted, 'boosted rect exists');
  assert.ok(A.damaged, 'damaged rect exists');
  assert.equal(A.shieldDome, undefined, 'old shieldDome key removed');
  assert.deepEqual(A.shielded, { x: 1050, y: 826, w: 142, h: 142 });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/unit/sprites.test.mjs`
Expected: FAIL — `A.shielded` undefined / `A.shieldDome` 아직 존재.

- [ ] **Step 3: atlas `A`에서 `shieldDome` → `shielded` 리네임 + `boosted`/`damaged` 추가**

`sprites.js` line 32의 `shieldDome` 줄을 아래 3줄로 교체한다 (이름은 다른 곳에서 미참조 — 안전):

기존:
```js
    shieldDome:  { x: 1050, y: 826, w: 142, h: 142 }, // shielded-ship dome
```
교체:
```js
    shielded:    { x: 1050, y: 826, w: 142, h: 142 }, // SHIELDED frame (hull + hex bubble)
    boosted:     { x: 907,  y: 827, w: 109, h: 133 }, // BOOSTED frame (large triple flames)
    damaged:     { x: 1209, y: 833, w: 122, h: 126 }, // DAMAGED frame (cracks + sparks)
```

- [ ] **Step 4: 헐 프레임 집합 상수 추가**

`sprites.js`에서 `const playerCache = {};`(line 49) 바로 다음에 추가:

```js
  // hull-family frame keys: these get the cosmetic paint-coating treatment.
  const HULL_FRAMES = new Set(['player', 'boosted', 'damaged', 'shielded']);
```

- [ ] **Step 5: `playerCanvas`를 `(frameKey, id)`로 일반화**

`sprites.js` line 53~80의 `playerCanvas` 함수 전체를 아래로 교체한다 (캐시 키를 `frame:paint`로, rect를 `A[frameKey]`로):

```js
  // Build (once) a native-size offscreen canvas of frame `frameKey` re-tinted
  // for `id`. Returns the canvas, or null for `neon` / before the atlas decodes.
  function playerCanvas(frameKey, id) {
    const def = PAINTS[id];
    if (!def) return null;            // neon (or unknown) -> atlas sprite
    const cacheKey = frameKey + ':' + id;
    const cached = playerCache[cacheKey];
    if (cached && cached.builtReady) return cached.canvas; // already good
    if (!decoded()) return null;      // can't build yet — fall back to atlas
    const r = A[frameKey];
    const c = (cached && cached.canvas) || document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, r.w, r.h);
    // 1) base sprite, 2) translucent tint clipped to sprite pixels, 3) multiply
    // shade, 4) re-mask to the sprite's alpha.
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = def.tint;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = def.shade;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-over';
    playerCache[cacheKey] = { canvas: c, builtReady: true };
    return c;
  }
```

- [ ] **Step 6: `setPaint`의 캐시 워밍 호출 갱신**

`sprites.js` line 86을 교체:

기존:
```js
    if (paint !== 'neon') playerCanvas(paint); // warm the cache (no-op if !ready)
```
교체:
```js
    if (paint !== 'neon') playerCanvas('player', paint); // warm default hull (no-op if !ready)
```

- [ ] **Step 7: `drawPlayer`(HANGAR 미리보기)의 캐시 호출 갱신**

`sprites.js` line 96을 교체 (격납고 미리보기는 항상 기본 헐):

기존:
```js
    const tinted = playerCanvas(paint);
```
교체:
```js
    const tinted = playerCanvas('player', paint);
```

- [ ] **Step 8: `draw`의 틴트 분기를 헐 프레임 전체로 확장**

`sprites.js` line 113을 교체:

기존:
```js
    const tinted = key === 'player' ? playerCanvas(paint) : null;
```
교체:
```js
    const tinted = HULL_FRAMES.has(key) ? playerCanvas(key, paint) : null;
```

- [ ] **Step 9: 테스트 통과 확인 (신규 + 기존)**

Run: `node --test test/unit/sprites.test.mjs`
Expected: PASS (3 tests — pickHullFrame 2개 + atlas 1개).

- [ ] **Step 10: 커밋**

```bash
git add js/games/neonvortex/sprites.js test/unit/sprites.test.mjs
git commit -m "feat: 헐 상태 프레임 rect + 도색 캐시 frame:paint 일반화"
```

---

### Task 3: `render.js` — 상태 프레임으로 함선 그리기

**Files:**
- Modify: `js/games/neonvortex/render.js` (`drawPlayer` 157~208)
- Test: `test/unit/static.test.mjs` (테스트 추가)

- [ ] **Step 1: 실패하는 정적 핀 추가**

`test/unit/static.test.mjs` 끝에 추가 (기존 "render.js reacts to surge" 핀과 동일 스타일):

```js
test('render.js drives the player hull via state frames', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('pickHullFrame'), 'drawPlayer must select a hull frame');
  assert.ok(/frame === 'shielded'/.test(src), 'shielded frame replaces the vector ring path');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/unit/static.test.mjs`
Expected: FAIL — render.js에 `pickHullFrame` 미존재.

- [ ] **Step 3: `drawPlayer`의 헐+실드 렌더 교체**

`render.js` line 173~207을 교체한다. 기존(주석 173~174 + 헐 draw 175 + 벡터 폴백 + 실드 링 195~207):

기존:
```js
    // hull sprite (points up; +90° aligns sprite nose with p.angle).
    // aspect-preserving draw — the DEFAULT ship is a wide triangle.
    if (!SP.draw(ctx, 'player', p.x, p.y, 42, p.angle + Math.PI / 2)) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.shadowColor = '#2de2c6';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(11, 10); ctx.lineTo(0, 5); ctx.lineTo(-11, 10);
      ctx.closePath();
      ctx.fillStyle = '#0d2b33';
      ctx.fill();
      ctx.strokeStyle = '#2de2c6';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -3, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9ff5e8';
      ctx.fill();
      ctx.restore();
    }
    // shield ring (vector overlay)
    if (s.shield) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.arc(0, 0, 24 + Math.sin(s.t * 5) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,167,255,0.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#5aa7ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
```
교체:
```js
    // hull sprite — frame reacts to state (shielded/damaged/boosted/default).
    // shielded is the hull+bubble composite, so it draws larger; +90° aligns
    // the sprite nose with p.angle. Pure choice, no per-frame allocation.
    const frame = SP.pickHullFrame({ shield: s.shield, hp: p.hp, boost: s.fx.BOOST });
    const size = frame === 'shielded' ? 64 : 42;
    const drew = SP.draw(ctx, frame, p.x, p.y, size, p.angle + Math.PI / 2);
    if (!drew) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.shadowColor = '#2de2c6';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(11, 10); ctx.lineTo(0, 5); ctx.lineTo(-11, 10);
      ctx.closePath();
      ctx.fillStyle = '#0d2b33';
      ctx.fill();
      ctx.strokeStyle = '#2de2c6';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -3, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9ff5e8';
      ctx.fill();
      ctx.restore();
    }
    // shield ring (vector) — only when the sprite bubble wasn't drawn (atlas not
    // ready/failed). When the 'shielded' sprite drew, its bubble already shows.
    if (s.shield && !(drew && frame === 'shielded')) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.arc(0, 0, 24 + Math.sin(s.t * 5) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,167,255,0.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#5aa7ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/unit/static.test.mjs`
Expected: PASS.

- [ ] **Step 5: 전체 단위 테스트 통과 확인 (회귀 없음)**

Run: `node --test test/unit`
Expected: PASS (sprites/static/game/medals/store/surge/meta 전부).

- [ ] **Step 6: 커밋**

```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: drawPlayer가 상태 프레임으로 함선 렌더(실드 버블 대체)"
```

---

### Task 4: 문서 동기화 + 검증

**Files:**
- Modify: `design.md` (자산 섹션)

- [ ] **Step 1: `design.md` 자산 표의 사용 키 수 갱신**

`design.md`에서 교체:

기존:
```
| `sprite-atlas.png` | 게임 스프라이트 아틀라스 (13키 중 9키 렌더) | ✅ `sprites.js` + `index.html` preload |
```
교체:
```
| `sprite-atlas.png` | 게임 스프라이트 아틀라스 (15키 중 12키 렌더) | ✅ `sprites.js` + `index.html` preload |
```

- [ ] **Step 2: `design.md` 미사용 키 줄 갱신**

`design.md`에서 교체:

기존:
```
미사용 아틀라스 키 4개(`enemyMid`·`beam`·`burst`·`shieldDome`) — 보스 빔·폭발·실드는
현재 벡터/파티클로 렌더. 참조 이미지 4개는 코드 미로드(설계 자료).
```
교체:
```
함선 상태 프레임 `shielded`·`boosted`·`damaged`는 `render.drawPlayer`가 상태
(실드/저체력/부스트)에 따라 선택해 사용(`SY.nvSprites.pickHullFrame`). 미사용 키
3개(`enemyMid`·`beam`·`burst`) — 중형 적·보스 빔·정적 폭발은 대응 메커니즘 부재로
벡터/파티클 유지. 참조 이미지 4개는 코드 미로드(설계 자료).
```

- [ ] **Step 3: 문서 커밋**

```bash
git add design.md
git commit -m "docs: 함선 상태 프레임 반영 — 자산 사용 현황 갱신"
```

- [ ] **Step 4: 핫패스 성능 점검**

`performance-analyzer` 에이전트로 `render.js`(drawPlayer) + `sprites.js`(draw/playerCanvas) 변경을 점검한다. 확인 항목: 프레임당 신규 할당 0(프레임 선택은 불리언+문자열 룩업, 틴트 캔버스는 `frame:paint`별 최초 1회만 빌드), redundant canvas state 변화 없음.
Expected: 핫패스 할당 0 유지 확인.

- [ ] **Step 5: standalone 번들 재생성 (사용자 실행)**

`standalone.html`은 생성물(직접 수정 금지). 사용자에게 `/build-standalone` 실행을 요청한다. 이후 `test/run-all.ps1`(또는 `.sh`)의 해시 동기화 검사가 통과해야 한다.

- [ ] **Step 6: 스크린샷 수동 검증**

3000 포트(`http://localhost:3000`)에서 확인:
- SHIELD 파워업 획득 → 함선에 육각 보호막 버블(벡터 링 아님).
- 마지막 헐(hp=1) → 균열·잔해 DAMAGED 프레임.
- BOOST 파워업 → 대형 화염 BOOSTED 프레임.
- 도색(stealth/solar)이 각 프레임에도 적용되는지.

---

## Self-Review

**Spec coverage:**
- SHIELDED/DAMAGED/BOOSTED 매핑 → Task 1(pickHullFrame) + Task 3(렌더). ✓
- 우선순위 shielded>damaged>boosted>default → Task 1 테스트로 고정. ✓
- 소스 rect(shielded 재사용/boosted/damaged) → Task 2. ✓
- 도색 캐시 frame:paint 일반화 → Task 2. ✓
- 벡터 폴백 유지 → Task 3(`!drew` 분기 + shield 링 조건). ✓
- 히트박스·game.js·RNG·점수 무변경 → 어느 태스크도 game.js 미수정. ✓
- 핫패스 무할당 → Task 4 Step 4(performance-analyzer). ✓
- 단위 테스트(상태→키) → Task 1. ✓
- 문서 갱신 → Task 4. ✓
- standalone 재생성 → Task 4 Step 5. ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, "TBD/TODO" 없음. ✓

**Type consistency:** `pickHullFrame(st)`는 `{ shield, hp, boost }`로 일관(Task 1 정의 ↔ Task 3 호출 `{ shield: s.shield, hp: p.hp, boost: s.fx.BOOST }`). `playerCanvas(frameKey, id)` 시그니처는 모든 호출부(setPaint/drawPlayer/draw)에서 일치. atlas 키 `shielded`/`boosted`/`damaged`는 Task 2 정의 ↔ Task 1 반환값 ↔ Task 3 사용 동일. ✓
