# 파워업 픽업 아이콘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파워업 7종의 픽업을 동일 앰버 캡슐+글자에서 `sprite-atlas.png` 섹션 1의 종류별 전용 배지(색 틴트)로 교체하는 순수 코스메틱 변경.

**Architecture:** `sprites.js`에 `POWER_ICONS` rect 맵 + `drawPowerIcon`(type:color 중첩 캐시 틴트)을 추가하고, `render.drawPow`가 캡슐 대신 배지를 블릿한다. 명확 4종은 아이콘만, 모호 3종(X2/SLOW/TIME)은 글리프 유지. `game.js`/RNG/점수/히트박스 무변경, 핫패스 무할당, 벡터 폴백 유지.

**Tech Stack:** Vanilla JS IIFE(`window.SY`), Canvas 2D, `node --test 'test/unit/*.mjs'`.

설계: [docs/plans/2026-06-23-neonvortex-powerup-icons-design.md](2026-06-23-neonvortex-powerup-icons-design.md)

---

## File Structure
- `js/games/neonvortex/sprites.js` (수정) — `POWER_ICONS`, `powerIconCanvas`, `drawPowerIcon`, export.
- `test/unit/sprites.test.mjs` (수정) — POWER_ICONS 완전성 + drawPowerIcon 가드 테스트.
- `js/games/neonvortex/render.js` (수정) — `drawPow` 배지 블릿 + 조건부 글리프.
- `test/unit/static.test.mjs` (수정) — drawPow가 배지를 쓰는지 정적 핀.
- `design.md` (수정) — 자산 섹션 갱신.

테스트 실행: `node --test 'test/unit/*.mjs'` (디렉터리 형태 `node --test test/unit`는 이 Node에서 모듈 경로로 오인되어 실패하므로 글롭 사용).

---

### Task 1: sprites.js — POWER_ICONS + drawPowerIcon

**Files:**
- Modify: `js/games/neonvortex/sprites.js`
- Test: `test/unit/sprites.test.mjs`

- [ ] **Step 1: 실패 테스트 추가** — `test/unit/sprites.test.mjs` 끝에 append:
```js
test('power-up icons: all 7 types mapped + drawPowerIcon guards on undecoded atlas', () => {
  const SP = load();
  const types = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME'];
  for (const t of types) {
    const r = SP.powerIcons[t];
    assert.ok(r && typeof r.x === 'number' && r.w > 0 && r.h > 0, `${t} icon rect`);
  }
  assert.equal(typeof SP.drawPowerIcon, 'function', 'drawPowerIcon exported');
  // atlas never decodes in the test sandbox (Image stub complete=false) -> false
  assert.equal(SP.drawPowerIcon({}, 'MAGNET', 0, 0, 20, 0, '#2de2c6'), false);
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/sprites.test.mjs'` → `SP.powerIcons` undefined로 실패.

- [ ] **Step 3: `POWER_ICONS` 맵 추가** — `sprites.js`에서 atlas `A` 객체 정의가 끝나는 `};` 바로 다음 줄에 추가:
```js
  // power-up pickup badges (atlas section 1 "POWER-UPS / PICKUPS", cyan row).
  // Keyed by SY.nvGame power-up type. Tinted per POWER_META color at draw time.
  const POWER_ICONS = {
    MAGNET: { x: 228, y: 23, w: 66, h: 87 }, // horseshoe-U magnet badge
    SHIELD: { x: 88,  y: 16, w: 66, h: 94 }, // shield badge
    BOOST:  { x: 158, y: 16, w: 66, h: 94 }, // lightning-bolt badge
    SPREAD: { x: 298, y: 23, w: 66, h: 87 }, // double-chevron badge
    X2:     { x: 369, y: 23, w: 66, h: 87 }, // burst/star badge
    SLOW:   { x: 509, y: 24, w: 66, h: 86 }, // orbit-ring badge
    TIME:   { x: 19,  y: 16, w: 65, h: 94 }, // plus badge (+5 sec)
  };
```

- [ ] **Step 4: 아이콘 틴트 캐시 + 드로우 추가** — `sprites.js`에서 `drawFit` 함수 정의 끝(`}`) 다음, `pickHullFrame` 정의 앞에 추가:
```js
  // ---- power-up pickup icons -------------------------------------------------
  // Each badge is tinted to its power-up's color once per (type,color) and
  // cached (nested object key — no per-frame string allocation on the hot path).
  const iconCache = {}; // iconCache[type][color] -> { canvas, builtReady }
  function powerIconCanvas(type, color) {
    const r = POWER_ICONS[type];
    if (!r || !decoded()) return null;
    let byType = iconCache[type];
    const cached = byType && byType[color];
    if (cached && cached.builtReady) return cached.canvas;
    const c = (cached && cached.canvas) || document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, r.w, r.h);
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    // single translucent recolor pass (no multiply shade — keeps small icons crisp)
    cx.globalCompositeOperation = 'source-atop';
    cx.globalAlpha = 0.55;
    cx.fillStyle = color;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    if (!byType) byType = iconCache[type] = {};
    byType[color] = { canvas: c, builtReady: true };
    return c;
  }

  // Draw power-up `type` centred at (x,y), longest edge = `size`, tinted to
  // `color`. Returns false until the atlas decodes (caller falls back to vector).
  function drawPowerIcon(ctx, type, x, y, size, rot, color) {
    const r = POWER_ICONS[type];
    if (!r) return false;
    const img = powerIconCanvas(type, color);
    if (!img) return false;
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    }
    return true;
  }
```

- [ ] **Step 5: export 갱신** — `SY.nvSprites = { ... }` 객체에 `drawPowerIcon`과 `powerIcons: POWER_ICONS`를 추가(기존 키 뒤에):
```js
  SY.nvSprites = { draw, drawFit, drawPlayer, drawPowerIcon, setPaint, getPaint, pickHullFrame, atlas: A, powerIcons: POWER_ICONS, isReady: () => ready, image: sheet };
```

- [ ] **Step 6: 통과 확인** — `node --test 'test/unit/sprites.test.mjs'` → 전부 PASS. 이어서 `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 7: 커밋**
```bash
git add js/games/neonvortex/sprites.js test/unit/sprites.test.mjs
git commit -m "feat: 파워업 배지 아이콘 rect + drawPowerIcon(틴트 캐시)"
```

---

### Task 2: render.js — drawPow가 배지 사용

**Files:**
- Modify: `js/games/neonvortex/render.js`
- Test: `test/unit/static.test.mjs`

- [ ] **Step 1: 실패 정적 핀 추가** — `test/unit/static.test.mjs` 끝에 append:
```js
test('render.js drawPow uses power-up badge sprites with conditional glyph', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('drawPowerIcon'), 'drawPow blits the badge sprite');
  assert.ok(/o\.type === 'X2' \|\| o\.type === 'SLOW' \|\| o\.type === 'TIME'/.test(src),
    'glyph kept only for the ambiguous power-up types');
});
```

- [ ] **Step 2: 실패 확인** — `node --test 'test/unit/static.test.mjs'`.

- [ ] **Step 3: `drawPow` 교체** — `render.js`의 현재 `drawPow` 함수 전체를 아래로 교체:
```js
  function drawPow(ctx, o) {
    const meta = POWER_META[o.type];
    const blink = o.life < 2 && Math.floor(o.life * 6) % 2 === 0;
    if (blink) return;
    const bob = Math.sin(o.phase) * 3;
    // dedicated badge sprite, tinted to the power-up color
    const drew = SP.drawPowerIcon(ctx, o.type, o.x, o.y + bob, (o.r + 4) * 2.3, Math.sin(o.phase * 0.3) * 0.12, meta.color);
    if (!drew) {
      // fallback: hex capsule (atlas not decoded / failed)
      ctx.save();
      ctx.translate(o.x, o.y + bob);
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 14;
      poly(ctx, 0, 0, o.r + 4, 6, Math.PI / 6 + o.phase * 0.3);
      ctx.fillStyle = '#04090f';
      ctx.fill();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    // glyph overlay: always on the vector fallback (identifies the pickup); with
    // the badge sprite, only for the ambiguous types — the rest read from their icon.
    if (!drew || o.type === 'X2' || o.type === 'SLOW' || o.type === 'TIME') {
      ctx.save();
      ctx.shadowColor = '#04090f';
      ctx.shadowBlur = 4;
      ctx.fillStyle = meta.color;
      ctx.font = 'bold ' + (o.type === 'X2' || o.type === 'TIME' ? 11 : 13) + 'px ' + MONO;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.glyph, o.x, o.y + bob + 1);
      ctx.restore();
    }
  }
```

- [ ] **Step 4: 통과 확인** — `node --test 'test/unit/static.test.mjs'` → PASS.

- [ ] **Step 5: 전체 회귀 확인** — `node --test 'test/unit/*.mjs'` → `fail 0`.

- [ ] **Step 6: 커밋**
```bash
git add js/games/neonvortex/render.js test/unit/static.test.mjs
git commit -m "feat: drawPow가 파워업 전용 배지 렌더(모호 3종만 글리프)"
```

---

### Task 3: 문서 + 검증

**Files:**
- Modify: `design.md`

- [ ] **Step 1: design.md 자산 섹션 갱신** — 다음 줄을 교체.

기존:
```
| `sprite-atlas.png` | 게임 스프라이트 아틀라스 (15키 중 12키 렌더) | ✅ `sprites.js` + `index.html` preload |
```
교체:
```
| `sprite-atlas.png` | 게임 스프라이트 아틀라스 (엔티티 12키 + 파워업 배지 7종 렌더) | ✅ `sprites.js` + `index.html` preload |
```

그리고 미사용 키 문단 끝에 한 줄 추가(파워업 배지 사실 반영). 기존 문단 마지막 문장
"참조 이미지 4개는 코드 미로드(설계 자료)." 바로 앞에 삽입:
```
파워업 7종은 섹션1 "POWER-UPS/PICKUPS" 배지를 색 틴트해 사용(`SY.nvSprites.drawPowerIcon`).
```

- [ ] **Step 2: 문서 커밋**
```bash
git add design.md
git commit -m "docs: 파워업 배지 아이콘 반영 — 자산 현황 갱신"
```

- [ ] **Step 3: 핫패스 성능 점검** — `performance-analyzer` 에이전트로 `render.drawPow` + `sprites.drawPowerIcon/powerIconCanvas` 점검. 확인: 프레임당 신규 할당 0(틴트 캔버스는 `type:color` 중첩 캐시 1회 빌드, 키 문자열 미생성), redundant canvas state 없음.

- [ ] **Step 4: standalone 재생성 (사용자 실행)** — `/build-standalone` 요청. 이후 해시 동기화 검사 통과 확인.

- [ ] **Step 5: 스크린샷 수동 검증** — `http://localhost:3000`에서 7종 파워업 픽업이 종류별 배지로 보이는지, 색 틴트가 탁하지 않은지 확인. **탁하면** 설계 §4 폴백(무틴트 시안 배지 + 전종 글리프)으로 전환.

---

## Self-Review

**Spec coverage:** 매핑 7종 → Task1 POWER_ICONS. 틴트 캐시 → Task1 powerIconCanvas(중첩 캐시). drawPow 교체 + 조건부 글리프 → Task2. 벡터 폴백 → Task2(`!drew`). 무틴트 폴백 게이트 → Task3 Step5. 문서 → Task3. game.js 무변경 → 어느 태스크도 game.js 미수정. ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드, TBD 없음. rect "±2px 시각 검증"은 Task3 Step5 스크린샷 게이트로 처리. ✓

**Type consistency:** `drawPowerIcon(ctx, type, x, y, size, rot, color)` 시그니처가 Task1 정의 ↔ Task2 호출 일치. `powerIcons`/`POWER_ICONS` 키는 POWER_TYPES(MAGNET/SHIELD/SLOW/X2/BOOST/SPREAD/TIME)와 동일. 테스트의 7종 배열도 동일. ✓
