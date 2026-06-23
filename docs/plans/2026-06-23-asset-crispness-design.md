# 에셋 박스 제거 + 모바일 선명도 — 설계 (Sub-project B)

> 상위 맥락: "게임이 단조롭다" 피드백 → 위협 다양성(A)을 추가하기로 결정.
> 그 전에 "스프라이트가 사각 박스로 보이고 모바일에서 흐리다"는 **선행 블로커**를
> 먼저 해결한다. 분해: **B(선명도) → A(신규 적) → C(파워업 지속시간)**.

**Goal:** 모든 브라우저(로컬·배포·모바일)에서 스프라이트가 박스 없이, 고해상도
화면에서도 선명하게 렌더되도록 한다.

## 근본 원인 (독립적 2가지)

1. **박스(사각)** — 디스크의 `assets/sprite-atlas.png`는 이미 RGBA로 정상
   (투명 ~70%, 스프라이트는 모두 깔끔한 실루엣 — 다크 배경 합성으로 육안 확인함).
   문제는 이 파일이 **버전 쿼리 없이** `assets/sprite-atlas.png`로 로드되는데,
   과거 RGB(불투명·검은 배경) 버전이 동일 파일명으로 먼저 서빙되어 브라우저/CDN에
   캐시된 것. RGB 시절 검은 사각 배경이 통째로 보이던 것이 "사각 박스 / 보스도
   사각" 증상과 정확히 일치한다.

2. **블러(흐림)** — `js/shell.js`의 캔버스는 960×600 백스토어 고정이고, 확대는
   `stage`의 CSS `transform: scale()` 로만 이뤄진다. `devicePixelRatio` 백스토어
   스케일링이 없어 고해상도(레티나) 폰에서 브라우저가 저해상도 캔버스를 업샘플 →
   흐려진다.

## 수정

### B1 — 캐시버스트 (박스)
- `index.html`의 `<link rel="preload" as="image" href="assets/sprite-atlas.png">`
  → `assets/sprite-atlas.png?v=2`
- `js/games/neonvortex/sprites.js`의 `sheet.src = 'assets/sprite-atlas.png'`
  → `'assets/sprite-atlas.png?v=2'`
- 두 URL은 **반드시 동일**해야 한다(preload 매칭). 이후 아틀라스 비트가 바뀔 때만
  `v`를 올린다는 단순 규칙.
- 위험: 낮음. 정적 호스팅·CDN·로컬 브라우저 모두에서 신버전 강제 수신.

### B2 — devicePixelRatio 백스토어 (선명도)
- `js/shell.js`에 1회성 헬퍼 `applyResolution()` 추가:
  ```js
  const dpr = Math.min(window.devicePixelRatio || 1, 3); // 3배에서 캡(성능)
  if (canvas.width !== SW * dpr) {        // 변할 때만 재설정(매 resize 클리어 방지)
    canvas.width = SW * dpr;
    canvas.height = SH * dpr;
    canvas.style.width = SW + 'px';        // CSS 크기는 논리 좌표 유지
    canvas.style.height = SH + 'px';       // → stage transform 수학 불변
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);  // 모든 그리기는 960×600 좌표 그대로
  ```
- `boot()`에서 `fit()` 직전 1회 호출 + `fit()` 안에서도 호출(모니터 간 이동/회전 시
  DPR 변동 대응; `canvas.width` 비교 가드로 불필요한 재설정 방지).
- **게임 좌표계(W=960/H=600)와 render.js·game.js는 무변경** — 컨텍스트 transform이
  좌표를 backing store로 매핑.
- `clearRect(0,0,SW,SH)`는 그대로 동작(transform이 논리 영역을 덮음).
- `ctx.imageSmoothingEnabled`: **기본값(true) 유지**. 아틀라스는 픽셀아트가 아니라
  일러스트라서 hi-res 백스토어 + 스무딩이 가장 선명/매끈하다. 블러의 원인은 스무딩이
  아니라 저해상도 업샘플이었음.
- 위험: 중간. rAF 루프·렌더 가정 회귀를 정적/유닛 테스트로 핀.

## 컴포넌트 경계
- `sprites.js` — 아틀라스 URL 한 줄. 그 외 무변경.
- `index.html` — preload URL 한 줄.
- `shell.js` — 캔버스 해상도 셋업 (신규 헬퍼 + boot/fit 호출). 좌표계·게임 로직 무관.

## 테스트
- **static.test.mjs** 핀 추가:
  - `index.html`의 atlas preload URL과 `sprites.js`의 `sheet.src`가 **동일 버전
    쿼리**를 갖는지(둘 다 `?v=2`).
  - `shell.js`가 `devicePixelRatio`와 `setTransform`을 사용하는지(DPR 백스토어
    적용 핀).
- **회귀:** 기존 87 유닛 테스트 전부 통과 유지(게임 좌표계 불변이므로 시뮬레이션
  로직 영향 없음).
- **육안(사용자):** 하드 리프레시(Ctrl+Shift+R) 후 박스 소멸 + 모바일에서 선명도
  개선 확인.

## standalone 연동
- standalone은 아틀라스를 data-URI로 인라인하므로 B1 캐시버스트는 무의미(항상
  최신). B2(DPR)는 동일하게 적용됨. `/build-standalone` 재생성 시 함께 반영.

## 범위 제외 (YAGNI)
- 아트 원본 재가공 — 이미 깨끗함.
- 신규 적(A), 파워업 지속시간(C) — 별도 하위 프로젝트.
- 오프스크린 캔버스/렌더 파이프라인 재설계 — 불필요.
