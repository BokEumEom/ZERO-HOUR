# NEON VORTEX — M1 (비주얼 기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ship` 게임을 `neonvortex`로 개명하고, Stitch "Neon Syndicate" 디자인 시스템(토큰·폰트·네온 효과 유틸)을 순수 CSS로 깔아 "NEON VORTEX" 정체성을 확립한다. **게임플레이 변경은 0.**

**Architecture:** 기존 `js/games/ship/` 플러그인 모듈을 폴더·네임스페이스·DOM 접두사·저장 네임스페이스까지 `neonvortex`로 일괄 개명(기능 동일, 테스트 그린 유지). 그 위에 `css/neonvortex.css`로 디자인 토큰(`--nv-*`)과 재사용 유틸(스캔라인·헥스그리드·분절바·글래스·chamfer)을 추가. 화면 레이아웃 전면 리스킨은 M2 소관.

**Tech Stack:** 순수 HTML/CSS/JS + Canvas 2D(빌드 도구 없음), `SY.registerGame` 플러그인, `node:test` 단위/정적 + 헤드리스 E2E, Google Fonts(폴백 필수).

설계 출처: [docs/plans/2026-06-19-neonvortex-design.md](2026-06-19-neonvortex-design.md) · 디자인 토큰: `Downloads/stitch_neon_core_warden_ui/.../neon_syndicate/DESIGN.md`.

---

## File Structure

- **Rename:** `js/games/ship/` → `js/games/neonvortex/` (`sprites.js`, `game.js`, `render.js`, `main.js`)
- **Rename:** `css/ship.css` → `css/neonvortex.css` (이후 디자인 토큰/유틸 추가)
- **Modify:** `index.html` (스크립트 경로, css 링크, 폰트 링크, DOM id 접두사 `ship-`→`neonvortex-`)
- **Modify:** `js/games/neonvortex/main.js` (네임스페이스, 저장 id, `registerGame` 메타)
- **Modify:** `js/games/neonvortex/{game,render,sprites}.js` (네임스페이스, DOM id 참조)
- **Modify:** `test/e2e/harness.html` (`data-id`, id 접두사, 타이틀 정규식)
- **Modify:** `test/unit/static.test.mjs` (디자인 시스템 트립와이어 추가)

개명 토큰은 충돌 없음: `ship-`는 DOM id 접두사로만, `SY.ship*`는 3개 네임스페이스로만, `'ship'`는 저장 id로만 등장. `shepards-dog`/`ship_assets.png`(언더스코어)는 패턴이 달라 안전.

---

## Task 1: 모듈 폴더·네임스페이스·저장 id 개명 (기능 동일)

**Files:**
- Rename: `js/games/ship/` → `js/games/neonvortex/`
- Rename: `css/ship.css` → `css/neonvortex.css`
- Modify: `js/games/neonvortex/{sprites,game,render,main}.js`
- Modify: `index.html` (lines 19, 332-335 영역)

- [ ] **Step 1: git mv로 폴더·CSS 이동**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add -A js/games/ship css/ship.css            # 기존 미추적분 스테이지(개명 추적용)
git mv js/games/ship js/games/neonvortex 2>/dev/null || { mkdir -p js/games/neonvortex && mv js/games/ship/* js/games/neonvortex/ && rmdir js/games/ship; }
git mv css/ship.css css/neonvortex.css 2>/dev/null || mv css/ship.css css/neonvortex.css
ls js/games/neonvortex/ && ls css/neonvortex.css
```
Expected: `sprites.js game.js render.js main.js` 와 `css/neonvortex.css` 출력.

- [ ] **Step 2: JS 네임스페이스·DOM 참조·저장 id 치환**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
F="js/games/neonvortex/sprites.js js/games/neonvortex/game.js js/games/neonvortex/render.js js/games/neonvortex/main.js"
sed -i \
  -e 's/SY\.shipGame/SY.nvGame/g' \
  -e 's/SY\.shipRender/SY.nvRender/g' \
  -e 's/SY\.shipSprites/SY.nvSprites/g' \
  -e "s/forGame('ship')/forGame('neonvortex')/g" \
  -e "s/migrate('ship')/migrate('neonvortex')/g" \
  -e "s/id: 'ship'/id: 'neonvortex'/g" \
  -e 's/ship-/neonvortex-/g' \
  $F
grep -rl "SY\.ship\|'ship'\|ship-" $F || echo "no stale ship refs"
```
Expected: `no stale ship refs`.

- [ ] **Step 3: index.html 경로·링크 치환**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
sed -i \
  -e 's#js/games/ship/#js/games/neonvortex/#g' \
  -e 's#css/ship\.css#css/neonvortex.css#g' \
  -e 's/ship-/neonvortex-/g' \
  index.html
grep -nE "games/ship/|css/ship\.css|\"ship-|'ship-| ship-" index.html || echo "index clean"
```
Expected: `index clean` (단 `ship_assets.png` preload은 그대로 남아야 정상 — `ship-`/`ship/`에 안 걸림).

- [ ] **Step 4: 구문 검사**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
for f in js/games/neonvortex/*.js; do node --check "$f" && echo "ok $f"; done
```
Expected: 4개 모두 `ok`.

- [ ] **Step 5: 단위/정적 테스트 그린 확인**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
for f in test/unit/*.test.mjs; do node --test "$f" 2>&1 | grep -E "# (pass|fail)"; done
```
Expected: 모든 파일 `# fail 0`. (static.test의 로드순서 단언은 basename 기준이라 개명에 영향 없음.)

- [ ] **Step 6: 커밋**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add -A js/games/neonvortex css/neonvortex.css index.html
git commit -m "refactor(neonvortex): rename ship game module -> neonvortex (no behavior change)"
```

---

## Task 2: registerGame 메타 리브랜딩 + E2E 하니스 갱신

**Files:**
- Modify: `js/games/neonvortex/main.js:600-607` (registerGame 블록)
- Modify: `test/e2e/harness.html:66-73`

- [ ] **Step 1: E2E 하니스를 새 id/타이틀로 갱신 (실패 유도)**

`test/e2e/harness.html`에서 ship 블록을 치환:

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
sed -i \
  -e 's/data-id="ship"/data-id="neonvortex"/g' \
  -e 's#/SHIP/#/NEON VORTEX/#g' \
  -e 's/ship-screen-menu/neonvortex-screen-menu/g' \
  -e 's/ship-btn-arcade/neonvortex-btn-arcade/g' \
  -e 's/Ship card/NEON VORTEX card/g' \
  -e 's/enters Ship/enters NEON VORTEX/g' \
  -e 's/returns from Ship/returns from NEON VORTEX/g' \
  test/e2e/harness.html
grep -nE "neonvortex|NEON VORTEX" test/e2e/harness.html
```
Expected: 갱신된 라인들 출력 (`data-id="neonvortex"`, `/NEON VORTEX/`, `neonvortex-screen-menu`, `neonvortex-btn-arcade`).

- [ ] **Step 2: E2E 실행 — 타이틀 불일치로 실패 확인**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
timeout 90 bash test/e2e/run.sh 2>&1 | grep -iE "NEON VORTEX card|FAIL|assertions"
```
Expected: `FAIL ... NEON VORTEX card is listed` (registerGame title이 아직 'SHIP'이므로 `/NEON VORTEX/` 정규식 실패).

- [ ] **Step 3: registerGame 메타를 NEON VORTEX로 변경**

`js/games/neonvortex/main.js`의 registerGame 블록을 아래로 교체:

```javascript
  SY.registerGame({
    id: 'neonvortex',
    title: 'NEON VORTEX',
    blurb: 'ARCADE_PILOT_OS · BEAT THE CORE WARDEN',
    accent: '#00dbe7',
    enter, exit, frame,
    pause: pauseGame, resume: resumeGame,
  });
```

- [ ] **Step 4: E2E 실행 — 그린 확인**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
timeout 90 bash test/e2e/run.sh 2>&1 | tail -3
```
Expected: `E2E: N/N assertions passed` (FAIL 0).

- [ ] **Step 5: 커밋**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add js/games/neonvortex/main.js test/e2e/harness.html
git commit -m "feat(neonvortex): rebrand hub card to NEON VORTEX (cyan accent)"
```

---

## Task 3: Neon Syndicate 디자인 토큰 + 폰트 로드

**Files:**
- Modify: `index.html:16` (Google Fonts 링크에 Sora/Hanken/Space Mono 추가)
- Modify: `css/neonvortex.css` (상단에 `--nv-*` 토큰 블록 추가)

- [ ] **Step 1: 폰트 링크 확장**

`index.html` line 16의 Google Fonts `<link>`에서 `family=IBM+Plex+Mono` 앞에 세 패밀리를 추가. 즉 `...&amp;family=IBM+Plex+Mono...` 를 다음으로 교체:

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
sed -i 's#&amp;family=IBM+Plex+Mono#\&amp;family=Sora:wght@400;700;800\&amp;family=Hanken+Grotesk:wght@400;600\&amp;family=Space+Mono:wght@400;700\&amp;family=IBM+Plex+Mono#' index.html
grep -o "family=Sora[^\"]*Space+Mono" index.html && echo "fonts added"
```
Expected: `fonts added`.

- [ ] **Step 2: 디자인 토큰 블록을 css/neonvortex.css 최상단에 추가**

`css/neonvortex.css` 맨 위에 아래 블록을 삽입(기존 내용은 그 아래 유지):

```css
/* ===== NEON VORTEX — Neon Syndicate design tokens (Stitch DESIGN.md) ===== */
/* Custom props are namespaced --nv-*; they do not override platform tokens
   unless explicitly consumed by neonvortex-scoped selectors. */
:root {
  /* Void & Vapor surfaces */
  --nv-bg: #0a0a0f;
  --nv-surface: #131318;
  --nv-surface-low: #1b1b20;
  --nv-surface-container: #1f1f25;
  --nv-surface-high: #2a292f;
  --nv-surface-highest: #35343a;
  --nv-on-surface: #e4e1e9;
  --nv-on-surface-variant: #b9cacb;
  --nv-outline: #849495;
  --nv-outline-variant: #3a494b;
  /* Neon accents */
  --nv-primary: #00dbe7;        /* cyan — player / positive */
  --nv-primary-bright: #74f5ff;
  --nv-threat: #ff24e4;         /* magenta — enemy / critical */
  --nv-threat-soft: #fface8;
  --nv-value: #ffba20;          /* gold — currency / advancement */
  --nv-value-soft: #ffd58c;
  --nv-error: #ffb4ab;
  /* Type families (fallbacks keep the core working if Google Fonts fail) */
  --nv-font-display: 'Sora', 'Press Start 2P', system-ui, sans-serif;
  --nv-font-body: 'Hanken Grotesk', system-ui, sans-serif;
  --nv-font-mono: 'Space Mono', 'IBM Plex Mono', ui-monospace, monospace;
  /* 4px hard grid */
  --nv-unit: 4px;
  --nv-gutter: 16px;
  --nv-margin: 24px;
}
```
주의: 위 블록에 surface 키 중복 없이 정확히 입력(아래 Self-Review에서 중복 키 점검).

- [ ] **Step 3: 토큰 적용 확인 (헤드리스 스냅샷)**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 - <<'PY'
src=open('css/neonvortex.css').read()
assert '--nv-primary: #00dbe7' in src, 'primary token missing'
assert "--nv-font-display: 'Sora'" in src, 'display font missing'
print('tokens ok')
PY
```
Expected: `tokens ok`.

- [ ] **Step 4: 커밋**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add index.html css/neonvortex.css
git commit -m "feat(neonvortex): add Neon Syndicate design tokens + load Sora/Hanken/Space Mono"
```

---

## Task 4: 재사용 네온 효과 유틸 (스캔라인·헥스그리드·분절바·글래스·chamfer)

**Files:**
- Modify: `css/neonvortex.css` (토큰 블록 아래에 유틸 추가)

- [ ] **Step 1: 유틸 클래스 추가**

`css/neonvortex.css`의 토큰 블록 바로 아래에 삽입(Stitch `hud/code.html`의 효과를 순수 CSS로 포팅):

```css
/* ===== NEON VORTEX — reusable effect utilities (ready for M2 screens) ===== */
.nv-scanlines {            /* 3% 수평 스캔라인 오버레이 */
  background: linear-gradient(to bottom, transparent 50%, rgba(0, 219, 231, 0.05) 50%);
  background-size: 100% 4px;
  pointer-events: none;
}
.nv-hexgrid {              /* 헥스 메시 배경(레이디얼 마스크) */
  background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0l17.32 10v20L20 40 2.68 30V10z' fill='none' stroke='%2300dbe7' stroke-width='0.5' stroke-opacity='0.1'/%3E%3C/svg%3E");
  -webkit-mask-image: radial-gradient(circle, #000 40%, transparent 90%);
  mask-image: radial-gradient(circle, #000 40%, transparent 90%);
}
.nv-segment {              /* 분절 HUD 바 한 칸 (슬랜트 칩) */
  clip-path: polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%);
}
.nv-glass {                /* Level-2 글래스 패널 */
  background: color-mix(in srgb, var(--nv-surface-high) 80%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--nv-primary) 25%, transparent);
}
.nv-chamfer {              /* 45° 모서리 클립(버튼/카드) */
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}
.nv-glow-primary { box-shadow: 0 0 15px color-mix(in srgb, var(--nv-primary) 40%, transparent); }
.nv-glow-threat  { box-shadow: 0 0 15px color-mix(in srgb, var(--nv-threat) 45%, transparent); }
@keyframes nv-flicker { 0%,100% { opacity: 1; } 50% { opacity: 0.82; } }
.nv-flicker { animation: nv-flicker 1s infinite; }
```

- [ ] **Step 2: 유틸 존재 확인**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 - <<'PY'
src=open('css/neonvortex.css').read()
for cls in ['.nv-scanlines','.nv-hexgrid','.nv-segment','.nv-glass','.nv-chamfer']:
    assert cls in src, cls+' missing'
print('utils ok')
PY
```
Expected: `utils ok`.

- [ ] **Step 3: 커밋**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add css/neonvortex.css
git commit -m "feat(neonvortex): add neon effect utilities (scanlines, hexgrid, segment, glass, chamfer)"
```

---

## Task 5: 디자인 시스템 트립와이어 + 정적 테스트

**Files:**
- Modify: `test/unit/static.test.mjs` (말미에 테스트 추가)

- [ ] **Step 1: 실패하는 트립와이어 추가**

`test/unit/static.test.mjs` 끝에 추가:

```javascript
test('neonvortex design system is wired (css linked, tokens + utils present)', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="css\/neonvortex\.css">/, 'neonvortex.css linked');
  assert.ok(/family=Sora/.test(html) && /family=Space\+Mono/.test(html), 'Sora + Space Mono fonts loaded');
  const css = read('css/neonvortex.css');
  assert.match(css, /--nv-primary:\s*#00dbe7/, 'primary token');
  for (const cls of ['.nv-scanlines', '.nv-hexgrid', '.nv-segment', '.nv-glass', '.nv-chamfer']) {
    assert.ok(css.includes(cls), `utility ${cls} present`);
  }
});

test('no stale "ship" identifiers remain in the renamed game', () => {
  const html = read('index.html');
  assert.ok(!/js\/games\/ship\//.test(html), 'no js/games/ship path');
  assert.ok(!/css\/ship\.css/.test(html), 'no css/ship.css link');
  assert.ok(!/["'(]ship-/.test(html), 'no ship- DOM id prefix');
});
```

- [ ] **Step 2: 실행 — 추가 테스트 통과 확인**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node --test test/unit/static.test.mjs 2>&1 | grep -E "# (pass|fail)"
```
Expected: `# fail 0` (신규 2개 포함 전부 통과).

- [ ] **Step 3: 커밋**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add test/unit/static.test.mjs
git commit -m "test(neonvortex): tripwire for design-system wiring + no stale ship ids"
```

---

## Task 6: standalone 재빌드 + 전체 스위트 그린

**Files:**
- Modify: `standalone.html` (생성물 — 재빌드)

- [ ] **Step 1: standalone 재생성**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node .claude/skills/build-standalone/build.mjs standalone.html
echo "rebuilt"
```
Expected: `rebuilt` (에러 없음).

- [ ] **Step 2: 전체 스위트 실행**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
bash test/run-all.sh 2>&1 | tail -8
```
Expected: `=== result: ALL PASS ===` (단위+정적, E2E, standalone 해시 동기화 전부 통과).

- [ ] **Step 3: 커밋**

```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
git add standalone.html
git commit -m "chore(neonvortex): regenerate standalone bundle for M1"
```

---

## Self-Review

**1. Spec coverage (M1 항목):**
- 디자인 토큰 포팅 → Task 3 ✓ · 효과 유틸(스캔라인·헥스그리드·분절바·글래스·chamfer) → Task 4 ✓
- 폰트 로드+폴백 → Task 3 (Step 1 링크 + `--nv-font-*` 폴백 체인) ✓
- 폴더/id 개명(ship→neonvortex) → Task 1 ✓ · 허브 카드 리브랜딩 → Task 2 ✓
- index.html 로드순서·preload → Task 1 Step 3(경로 치환), preload는 `ship_assets.png` 유지 ✓
- 검증(정적/E2E/standalone) → Task 5, 6 ✓

**2. Placeholder scan:** TBD/TODO 없음. 모든 코드 블록·명령 구체값. ✓

**3. Type/이름 일관성:** 네임스페이스 `SY.nvGame/nvRender/nvSprites`가 Task 1 치환과 일치. registerGame `id:'neonvortex'`(Task 1 Step 2 sed + Task 2 블록 동일). 트립와이어가 참조하는 클래스(`.nv-*`)·토큰(`--nv-primary`)이 Task 3·4 정의와 일치. ✓

**4. 토큰 일관성:** `:root` surface 키는 `--nv-surface`/`--nv-surface-low`/`--nv-surface-container`/`--nv-surface-high`/`--nv-surface-highest`로 중복 없이 정의. `.nv-glass`가 참조하는 `--nv-surface-high`가 토큰에 존재함을 확인. ✓

**5. RNG/공정성:** M1은 시뮬·스폰·점수 미변경 → 공정성 불변식 무영향. `guard-seeded-rng` 훅과 충돌 없음.

---

## Execution Handoff (M1 완료 후)

M1 그린 출하 후 → M2(화면 리스킨) plan을 `writing-plans`로 작성. 각 마일스톤은 독립적으로 ALL PASS + standalone 동기화 상태로 출하.
