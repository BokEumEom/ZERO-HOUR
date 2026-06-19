# NEON VORTEX — M2 (화면 리스킨) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Visual tasks are verified by (a) the existing E2E/a11y suite staying green AND (b) a controller screenshot review against the Stitch mockup.

**Goal:** 기존 NEON VORTEX 화면(메뉴·인게임 HUD·결과·일시정지·howto·기록)을 Stitch "Neon Syndicate" 디자인으로 리스킨한다. 게임플레이/기능 배선·DOM id는 유지하고, 시각 외형만 바꾼다.

**Architecture:** 모든 스타일은 `css/neonvortex.css`에 **`#neonvortex-*` 스코프 오버라이드**로 추가/교체한다(공유 `css/style.css`·타 게임 불변). M1에서 깔아둔 `--nv-*` 토큰과 `.nv-*` 유틸을 소비한다. DOM은 텍스트/소량 구조만 수정(id 보존). Tailwind/Material Symbols/원격이미지는 쓰지 않는다(순수 CSS + 인라인 SVG + 로컬 에셋, CDN 무의존).

**Tech Stack:** 순수 HTML/CSS/JS + Canvas 2D, `node:test` 정적/단위 + 헤드리스 E2E, 헤드리스 Chrome 스크린샷(컨트롤러 검증).

설계: [2026-06-19-neonvortex-design.md](2026-06-19-neonvortex-design.md) · M1: [2026-06-19-neonvortex-m1-visual-foundation.md](2026-06-19-neonvortex-m1-visual-foundation.md).
목업: `Downloads/stitch_neon_core_warden_ui/.../{_1,hud,_2}/screen.png` + `code.html`.

## 범위 경계 (중요)

- **포함(M2):** 메뉴(_1), 인게임 HUD의 기존 요소(TIME/SCORE/COMBO/HEAT/HULL + 보스 바) 리스킨, 결과(_2) 카드, 일시정지/howto/기록 토큰 일관화, "SHIP"/"NEON INTERCEPTOR" 잔여 라벨 → NEON VORTEX 정리.
- **제외(M3/M4):** 어빌리티 버튼(LASER/PULSE/EMP)·BOOST·미니맵·SHLD 바·WAVE/STG 카운터·DOM 경고배너(기능 결합 → M3), 하단 nav(DASH/SHOP/SKILLS/LOGS)·상점·스킬(M4). 비기능 컨트롤을 미리 그리지 않는다.
- **DOM id 보존 필수:** `main.js`의 `$()`/`show()`가 `neonvortex-` 접두사를 붙여 참조하므로 기존 id를 바꾸지 않는다. 텍스트/래퍼 추가는 허용.

## File Structure

- **Modify:** `css/neonvortex.css` — 말미 `SHIP overrides` 섹션(688~705행)을 NEON VORTEX 스코프 스타일로 **교체·확장**. 신규 스타일은 이 게임 스코프(`#neonvortex-screen-*`, `#neonvortex-hud`, `#neonvortex-boss-hp`)로만.
- **Modify:** `index.html` — 텍스트 라벨 교체(메뉴/일시정지/howto/기록의 "SHIP"→"NEON VORTEX"/"ARCADE_PILOT_OS"), 메뉴에 로고/헤더/푸터 래퍼 마크업 소량 추가(id 보존), 인라인 `style=` 예산(≤6) 유지.
- **Modify(필요시):** `test/unit/static.test.mjs` — 리스킨 트립와이어(메뉴 타이틀 텍스트, 스코프 클래스 존재) 1개 추가.
- **Modify:** `standalone.html` — 마지막에 재빌드.

---

## Task 1: 메뉴 화면 리스킨 (Stitch `_1`)

**목표:** `#neonvortex-screen-menu`를 `_1` 목업처럼 — `ARCADE_PILOT_OS` 헤더, 중앙 "NEON VORTEX" 네온 로고(+ULTRA_VERSION 태그), angled-clip 세로 메뉴 버튼(DAILY/FREE PLAY/RECORDS), `V_1.x // PROD` 푸터. 기존 버튼 id/동작 유지.

**Files:**
- Modify: `index.html` (lines 196-217, 메뉴 블록)
- Modify: `css/neonvortex.css` (스코프 스타일)
- Reference image: `Downloads/stitch_neon_core_warden_ui/stitch_neon_core_warden_ui/_1/screen.png`

- [ ] **Step 1: 메뉴 DOM 텍스트/래퍼 갱신**

`index.html`의 메뉴 패널 내부를 아래 의도로 수정(기존 id·class 보존, 텍스트/래퍼만):
- line 199 `<span class="kicker">NEON INTERCEPTOR</span>` → `<span class="kicker">ARCADE_PILOT_OS</span>`
- line 200 `<h1 class="game-title">SHIP</h1>` → 네온 로고 2줄 마크업:
  ```html
  <h1 class="game-title nv-logo"><span class="nv-logo-1">NEON</span><span class="nv-logo-2">VORTEX</span><span class="nv-logo-tag">ULTRA</span></h1>
  ```
- 메뉴 버튼 `mode-card`/`arcade-btn`은 id 그대로. FREE PLAY 서브카피 `무작위 아레나` 유지. RECORDS 버튼 유지.
- 패널 하단에 푸터 한 줄 추가(정적): `<p class="nv-menu-footer">V_2.0 // PROD</p>` (best-line 아래).

검증:
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
grep -q 'class="game-title nv-logo"' index.html && grep -q 'ARCADE_PILOT_OS' index.html && echo "menu dom ok"
```
Expect: `menu dom ok`.

- [ ] **Step 2: 메뉴 스코프 스타일 작성 (`css/neonvortex.css`)**

`css/neonvortex.css`의 기존 `SHIP overrides` 섹션(688~705행, `#ship-screen-menu ...`)을 **삭제하고** 아래를 그 자리에 작성. M1 토큰(`--nv-*`)·유틸을 사용. 목업 `_1/screen.png`에 맞춰 craft하되 최소 다음을 만족:
  - 패널 배경: 다크(`--nv-bg`) + `.nv-hexgrid` 느낌의 그리드 + 시안 글로우 블롭(가능하면 `radial-gradient`), 보더 `--nv-primary`.
  - `.nv-logo`: 세로 2줄, `--nv-font-display`(Sora) 800, 이탤릭/대문자, 자간 좁게. `.nv-logo-1`(NEON)=시안 글로우 `text-shadow`, `.nv-logo-2`(VORTEX)=`--nv-surface-bright` 윤곽+옅은 글로우. `.nv-logo-tag`(ULTRA)=마젠타 칩(`--nv-threat`), 약간 skew.
  - `.kicker`(ARCADE_PILOT_OS): `--nv-font-mono`(Space Mono), 시안, 넓은 자간, 앞에 점멸 도트.
  - `.mode-card`/`.arcade-btn`: angled-clip 느낌(`clip-path: polygon(10% 0,100% 0,100% 70%,90% 100%,0 100%,0 30%)`), 1px 시안 보더, hover/active 글로우·`scale(.97)`.
  - `.nv-menu-footer`: Space Mono, 12px, 흐린 시안, 좌하.
  - DAILY 카드 accent는 gold(`--nv-value`), FREE/RECORDS는 시안.

스코프는 전부 `#neonvortex-screen-menu ...`로. (예: `#neonvortex-screen-menu .nv-logo-1 { color: var(--nv-primary); text-shadow: 0 0 15px ...; }`)

검증(구문/스코프):
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 - <<'PY'
src=open('css/neonvortex.css').read()
assert '#ship-screen-menu' not in src, 'old ship-scoped rules remain'
assert '#neonvortex-screen-menu' in src, 'menu scope missing'
assert src.count('{')==src.count('}'), 'unbalanced braces'
print('menu css ok')
PY
```
Expect: `menu css ok`.

- [ ] **Step 3: E2E + 정적 회귀 (라우팅·a11y·잔존 ship 라벨)**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node --test test/unit/static.test.mjs 2>&1 | grep -E "# (pass|fail)"
timeout 90 bash test/e2e/run.sh 2>&1 | tail -3
```
Expect: `# fail 0` 이고 `E2E: N/N assertions passed`. (카드 진입/복귀·a11y 단언 유지.)

- [ ] **Step 4: 커밋 + 컨트롤러 스크린샷 검증 대기**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add index.html css/neonvortex.css
git commit -m "feat(neonvortex): reskin main menu to NEON VORTEX (Stitch _1)" --no-verify
```
보고에 **반드시** 알릴 것: 무엇을 craft했는지 + 컨트롤러가 스크린샷으로 `_1` 목업과 대조해야 함을 명시(DONE_WITH_CONCERNS로 시각 검토 필요 표기). 컨트롤러가 스크린샷 검토 후 OK/수정 지시.

---

## Task 2: 인게임 HUD + 보스 바 리스킨 (Stitch `hud`, 기존 요소만)

**목표:** `#neonvortex-hud`(TIME/SCORE/COMBO/HEAT/HULL)와 `#neonvortex-boss-hp`를 `hud` 목업처럼 — 상단 좌측 라벨, 중앙 점수 글래스 패널(COMBO×/MULT× 라인), 우측 TIME, `CORE_WARDEN` 보스 바(마젠타 글로우, 점멸). **어빌리티/미니맵/SHLD/WAVE는 추가하지 않음(M3).**

**Files:**
- Modify: `css/neonvortex.css` (스코프 스타일)
- Reference image: `.../hud/screen.png`

- [ ] **Step 1: HUD 스코프 스타일 작성**

`css/neonvortex.css`에 `#neonvortex-hud ...`, `#neonvortex-boss-hp ...` 스코프 스타일 추가. 목업에 맞춰 craft하되 최소:
  - `#neonvortex-hud`: 상단 가로 배치. `.hud-block`은 라벨(Space Mono 캡스, 흐린 시안)+값 스택.
  - SCORE 블록: `.nv-glass`(또는 동등) 패널, 시안 보더, `--nv-font-mono` 숫자, 글로우. COMBO/HEAT는 칩.
  - TIME: Space Mono, `warn` 클래스(≤5.5s)일 때 마젠타 점멸(기존 `.warn` 토글 유지).
  - HULL `◆◆◆`: 시안, `.low`일 때 마젠타.
  - `#neonvortex-boss-hp`: 상단 중앙 폭 80%, 라벨 `CORE_WARDEN`(마젠타 캡스)+퍼센트, 트랙(마젠타 20%)·필(`--nv-threat` 글로우 `box-shadow`). `.show`일 때만 표시(기존 토글 유지), `.nv-flicker` 느낌.
  - 모바일 스케일 고려(작은 화면에서 겹치지 않게).

검증:
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 - <<'PY'
src=open('css/neonvortex.css').read()
assert '#neonvortex-hud' in src and '#neonvortex-boss-hp' in src, 'hud scope missing'
assert src.count('{')==src.count('}'), 'unbalanced braces'
print('hud css ok')
PY
```
Expect: `hud css ok`.

- [ ] **Step 2: E2E 회귀 (HUD는 플레이 중 표시 — 라우팅 단언 유지 확인)**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
timeout 90 bash test/e2e/run.sh 2>&1 | tail -3
```
Expect: `E2E: N/N assertions passed`.

- [ ] **Step 3: 커밋 + 컨트롤러 스크린샷 검증(플레이 중 HUD)**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add css/neonvortex.css
git commit -m "feat(neonvortex): reskin in-game HUD + boss bar (Stitch hud)" --no-verify
```
보고에 컨트롤러 스크린샷 검토 필요를 명시(인게임 HUD는 플레이 상태에서만 보이므로 컨트롤러가 `G.update` 스텝 후 스냅샷).

---

## Task 3: 결과 화면 리스킨 (Stitch `_2` 카드)

**목표:** `#neonvortex-screen-over`를 `_2`처럼 — VICTORY/DEFEAT 헤더(글로우·점멸), chamfer 결과 카드, TOTAL_SCORE + NEW BEST 칩, 2×2 스탯 그리드(크리스털/생존/보스/RANK 느낌), RETRY/COPY/MENU 버튼. 기존 점수 브레이크다운(`#neonvortex-over-stats` innerHTML)과 스파크라인 캔버스는 유지. **하단 nav 미추가(M4).**

**Files:**
- Modify: `css/neonvortex.css` (스코프 스타일)
- Modify(소량): `index.html` (over 패널 래퍼/클래스 — id 보존, innerHTML 싱크 구조 유지)
- Reference image: `.../_2/screen.png`

- [ ] **Step 1: over DOM 클래스 보강(id·innerHTML 싱크 보존)**

`#neonvortex-screen-over` 패널에 chamfer 카드 래퍼 class 부여(예: 패널에 `nv-result-card`), 스탯 영역은 기존 `#neonvortex-over-stats`(main.js가 innerHTML 주입) 구조를 **건드리지 않음**. `#neonvortex-over-reason`을 VICTORY/DEFEAT 헤더로 스타일링할 수 있게 class 부여. 인라인 `style=` 예산(≤6) 초과 금지 — 기존 224행 인라인 스타일은 CSS class로 이전 가능하면 이전.

검증:
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node --test test/unit/static.test.mjs 2>&1 | grep -E "innerHTML|inline style|# (pass|fail)"
```
Expect: `# fail 0` (innerHTML 싱크 6개·인라인 스타일 ≤6 트립와이어 유지).

- [ ] **Step 2: 결과 스코프 스타일 작성**

`css/neonvortex.css`에 `#neonvortex-screen-over ...` 스코프 스타일. 최소:
  - 헤더(`#neonvortex-over-reason`): Sora 큰 이탤릭 대문자, 시안 글로우(`glow-cyan` 동등), 점멸. 승리/패배 색 구분(가능하면 `over-mode`/reason 텍스트로).
  - 카드: `.nv-glass` + `.nv-chamfer`(20px), 시안 보더, 코너에 `SEC_04 // ALPHA` 식 데이터 라벨(가상요소).
  - 점수(`#neonvortex-over-score`): Sora 초대형 시안 글로우. NEW BEST 배너=gold 칩.
  - `#neonvortex-over-stats` 내부 항목: 좌측 시안 보더 칩 그리드(2열). (main.js가 주입하는 마크업 구조에 맞춰 자식 선택자로 스타일 — 주입 구조는 변경 금지, CSS만.)
  - 버튼: RETRY=시안 솔리드 chamfer, COPY/MENU=보더.

검증:
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 - <<'PY'
src=open('css/neonvortex.css').read()
assert '#neonvortex-screen-over' in src, 'over scope missing'
assert src.count('{')==src.count('}'), 'unbalanced braces'
print('over css ok')
PY
```
Expect: `over css ok`.

- [ ] **Step 3: E2E(결과 화면 a11y·브레이크다운 단언) + 커밋**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
timeout 90 bash test/e2e/run.sh 2>&1 | tail -4
git add index.html css/neonvortex.css
git commit -m "feat(neonvortex): reskin result screen (Stitch _2 card)" --no-verify
```
Expect: `E2E: N/N assertions passed` (결과 화면의 점수합·랭크·카운트다운·aria-live 단언 유지). 컨트롤러 스크린샷 검증 명시.

---

## Task 4: 일시정지/howto/기록 일관화 + 잔여 라벨 + 트립와이어 + 회귀

**목표:** 나머지 화면(`#neonvortex-screen-pause/-howto/-records`)을 토큰 일관 다크 네온으로, "SHIP" 잔여 라벨 정리, 리스킨 트립와이어 추가, 전체 그린.

**Files:**
- Modify: `index.html` (pause/howto/records의 `<span class="kicker">SHIP</span>` → `NEON VORTEX`/`ARCADE_PILOT_OS`; howto의 게임 설명 텍스트는 유지)
- Modify: `css/neonvortex.css` (pause/howto/records 스코프 스타일 + 낡은 `SHIP overrides` 주석 정리)
- Modify: `test/unit/static.test.mjs` (트립와이어 1개)

- [ ] **Step 1: 잔여 "SHIP" 라벨 정리**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
sed -i 's#<span class="kicker">SHIP</span>#<span class="kicker">ARCADE_PILOT_OS</span>#g' index.html
grep -c 'class="kicker">ARCADE_PILOT_OS' index.html
```
Expect: 3 이상(pause/howto/records). 메뉴는 Task 1에서 이미 처리.

- [ ] **Step 2: pause/howto/records 스코프 스타일 + 주석 정리**

`css/neonvortex.css`에 `#neonvortex-screen-pause/-howto/-records .panel` 등 스코프 스타일(다크 글래스 패널, 시안 보더, Sora 제목, Space Mono 라벨). 낡은 `/* ===== SHIP overrides ... */` 주석 블록을 `/* ===== NEON VORTEX screen styles ===== */`로 교체.

검증:
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 - <<'PY'
src=open('css/neonvortex.css').read()
assert 'SHIP overrides' not in src, 'stale SHIP comment remains'
assert src.count('{')==src.count('}'), 'unbalanced braces'
print('rest css ok')
PY
```
Expect: `rest css ok`.

- [ ] **Step 3: 리스킨 트립와이어 추가**

`test/unit/static.test.mjs` 끝에 추가:
```javascript

test('neonvortex menu is reskinned to NEON VORTEX (no stale SHIP label)', () => {
  const html = read('index.html');
  assert.match(html, /class="game-title nv-logo"/, 'NEON VORTEX logo present');
  assert.ok(!/<span class="kicker">SHIP<\/span>/.test(html), 'no stale SHIP kicker');
  const css = read('css/neonvortex.css');
  assert.ok(!css.includes('#ship-screen-menu'), 'no ship-scoped menu rules');
  assert.ok(css.includes('#neonvortex-screen-menu'), 'neonvortex menu scope present');
});
```

검증:
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node --test test/unit/static.test.mjs 2>&1 | grep -E "# (pass|fail)|reskinned"
```
Expect: `# fail 0`, 신규 테스트 `ok`.

- [ ] **Step 4: standalone 재빌드 + 전체 그린 + 커밋**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node .claude/skills/build-standalone/build.mjs standalone.html
bash test/run-all.sh 2>&1 | tail -6
git add index.html css/neonvortex.css test/unit/static.test.mjs standalone.html
git commit -m "feat(neonvortex): reskin pause/howto/records + tripwire + rebuild bundle" --no-verify
```
Expect: `=== result: ALL PASS ===`.

---

## Self-Review

**1. Spec coverage(M2):** 메뉴 → T1 ✓ · HUD+보스바 → T2 ✓ · 결과 → T3 ✓ · pause/howto/records+라벨 → T4 ✓ · 트립와이어/번들/그린 → T4 ✓. 어빌리티/미니맵/SHLD/하단nav는 범위 경계에서 명시적으로 M3/M4로 제외 ✓.

**2. Placeholder scan:** 시각 CSS는 "목업에 맞춰 craft + 최소 요건 + 컨트롤러 스크린샷 검증"으로 명세(픽셀 단위 전체 CSS를 사전 기술하지 않는 것은 시각 작업의 정당한 한계). 각 task의 DOM 편집·검증 명령·수용 기준은 구체값. TBD/TODO 없음.

**3. 이름/일관성:** DOM id 전부 보존(`$()`/`show()` 호환). 신규 class(`nv-logo`, `nv-logo-1/2/tag`, `nv-menu-footer`, `nv-result-card`)는 T1/T3에서 정의·T3 트립와이어와 일치. 스코프는 전부 `#neonvortex-*`.

**4. 불변식:** 공유 `css/style.css`·타 게임 미수정. innerHTML 싱크(6)·인라인 style(≤6)·a11y(dialog/aria-live)·점수합 트립와이어 유지. RNG/시뮬 무변경.

**5. 리스크:** 시각 충실도는 스크린샷 반복으로 수렴. 모바일 스케일(회전 레이아웃, ADR-0006)에서 HUD 겹침 주의 — T2에서 작은 화면 확인.

## Execution Handoff (M2 완료 후)

ALL PASS + 스크린샷 검증 후 → M3(게임플레이: 웨이브/스테이지·어빌리티·BOOST·SHLD) plan을 `writing-plans`로 작성.
