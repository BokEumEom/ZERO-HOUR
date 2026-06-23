# Asset Box Fix + Mobile Crispness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스프라이트가 어떤 브라우저에서도 박스 없이, 고해상도 모바일에서도 선명하게 렌더되게 한다.

**Architecture:** 두 개의 독립적 수정 — (B1) 아틀라스 URL에 캐시버스트 버전 쿼리(`?v=2`)를 붙여 불투명 구버전 캐시를 무효화, (B2) `shell.js`에서 캔버스 백스토어를 `devicePixelRatio`로 스케일하고 컨텍스트에 `setTransform(dpr,...)`을 1회 적용해 게임 좌표계(960×600)는 그대로 두면서 고해상도로 렌더. 게임 시뮬레이션/렌더 코드는 무변경.

**Tech Stack:** Vanilla JS (IIFE on `window.SY`), Canvas 2D, `node --test` 정적 테스트(`test/unit/*.mjs`).

**테스트 실행(중요):** 디렉터리가 아니라 glob을 써야 한다 — `node --test 'test/unit/*.mjs'`. 바로 `node --test test/unit`은 "Cannot find module"로 실패한다.

**전제:** 작업 브랜치 `feat/asset-crispness` (이미 생성됨, 설계 spec 커밋됨).

---

## File Structure

- `index.html` — 아틀라스 preload `<link>` 한 줄 (URL에 `?v=2`).
- `js/games/neonvortex/sprites.js` — `sheet.src` 한 줄 (URL에 `?v=2`).
- `js/shell.js` — 캔버스 해상도 셋업 헬퍼 신규 + `boot()`/`fit()`에서 호출.
- `test/unit/static.test.mjs` — 정적 핀 2개 추가(URL 버전 일치, DPR 백스토어).

---

### Task 1: 캐시버스트로 박스(불투명 구버전 캐시) 제거

**Files:**
- Modify: `index.html:19` (atlas preload link)
- Modify: `js/games/neonvortex/sprites.js:17` (`sheet.src`)
- Test: `test/unit/static.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/unit/static.test.mjs` 끝(파일 마지막 `test(...)` 블록들 뒤, 모듈 최상위)에 추가:

```javascript
test('atlas URL carries a matching cache-bust version in index.html and sprites.js', () => {
  const html = read('index.html');
  const spr = read(`${NV}/sprites.js`);
  // preload link and the runtime image src must use the SAME versioned URL,
  // else the preload is wasted and a stale opaque atlas can persist in cache.
  const linkMatch = html.match(/href="assets\/sprite-atlas\.png\?v=(\d+)"/);
  const srcMatch = spr.match(/sheet\.src = 'assets\/sprite-atlas\.png\?v=(\d+)'/);
  assert.ok(linkMatch, 'index.html preloads a versioned atlas URL');
  assert.ok(srcMatch, 'sprites.js loads a versioned atlas URL');
  assert.equal(linkMatch[1], srcMatch[1], 'preload and runtime atlas versions match');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/*.mjs'`
Expected: FAIL — `index.html preloads a versioned atlas URL` (현재 URL에 `?v=` 없음).

- [ ] **Step 3: Implement — add the version query to both URLs**

`index.html` 19번째 줄:

```html
<link rel="preload" as="image" href="assets/sprite-atlas.png?v=2">
```

`js/games/neonvortex/sprites.js` 17번째 줄:

```javascript
  sheet.src = 'assets/sprite-atlas.png?v=2';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (신규 테스트 포함, 기존 테스트 무회귀).

- [ ] **Step 5: Commit**

```bash
git add index.html js/games/neonvortex/sprites.js test/unit/static.test.mjs
git commit -m "fix: cache-bust sprite atlas URL so stale opaque version is dropped"
```

---

### Task 2: devicePixelRatio 백스토어로 모바일 선명도 개선

**Files:**
- Modify: `js/shell.js` (canvas 셋업: 신규 헬퍼 + boot/fit 호출)
- Test: `test/unit/static.test.mjs`

- [ ] **Step 1: Write the failing test**

`test/unit/static.test.mjs`에 추가:

```javascript
test('shell.js scales the canvas backing store by devicePixelRatio', () => {
  const src = read('js/shell.js');
  assert.ok(src.includes('devicePixelRatio'), 'shell reads devicePixelRatio');
  assert.match(src, /canvas\.width = SW \* dpr/, 'backing store width scaled by dpr');
  assert.match(src, /canvas\.style\.width = SW \+ /, 'CSS width pinned to logical size');
  assert.match(src, /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\)/, 'context maps logical coords to backing store');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test 'test/unit/*.mjs'`
Expected: FAIL — `shell reads devicePixelRatio` (현재 shell.js에 없음).

- [ ] **Step 3: Implement — add the resolution helper and call it**

`js/shell.js`에서 `const ctx = canvas.getContext('2d');` (21번째 줄) 바로 아래에 헬퍼를 추가한다:

```javascript
  // High-DPR backing store: keep the logical coordinate space at SW×SH (game +
  // render code never change), but back it with devicePixelRatio physical pixels
  // so the CSS-scaled stage doesn't upsample a low-res canvas (blur on phones).
  // Re-applied on resize; only reallocates when the dpr-scaled size actually
  // changes (reassigning canvas.width clears it, so guard the assignment).
  function applyResolution() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3); // cap at 3× (perf)
    if (canvas.width !== SW * dpr) {
      canvas.width = SW * dpr;
      canvas.height = SH * dpr;
      canvas.style.width = SW + 'px';
      canvas.style.height = SH + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // logical 960×600 → physical backing store
  }
```

`fit()` 함수 본문 맨 앞(`const vv = window.visualViewport;` 위)에 호출을 추가한다:

```javascript
  function fit() {
    applyResolution();
    const vv = window.visualViewport;
```

`boot()`의 `fit();` 호출은 이미 `applyResolution()`을 포함하므로 별도 호출 불필요.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test 'test/unit/*.mjs'`
Expected: PASS (신규 + 기존 전부). 게임 좌표계 불변이라 시뮬레이션 유닛 테스트 무회귀.

- [ ] **Step 5: Commit**

```bash
git add js/shell.js test/unit/static.test.mjs
git commit -m "feat: scale canvas backing store by devicePixelRatio for crisp mobile rendering"
```

---

## 완료 후

- `test/run-all.ps1` 또는 최소 `node --test 'test/unit/*.mjs'`로 전체 통과 확인.
- 사용자: `/build-standalone` 재생성(누적 미반영분 포함) + 하드 리프레시(Ctrl+Shift+R) 후
  박스 소멸 및 모바일 선명도 육안 확인.
- 다음: 하위 프로젝트 **A(신규 적 4종)** 브레인스토밍.

## Self-Review 결과
- **Spec 커버리지:** B1(캐시버스트)=Task 1, B2(DPR)=Task 2, 테스트 핀=각 Task Step 1. standalone/범위제외는 코드 변경 없음(문서화만). 갭 없음.
- **Placeholder:** 없음(모든 코드/명령 구체값).
- **타입/식별자 일관성:** `applyResolution`, `dpr`, `SW/SH`, `ctx`, `canvas` 명칭이 shell.js 기존 심볼과 일치. 테스트 정규식이 구현 문자열과 정확히 매칭.
