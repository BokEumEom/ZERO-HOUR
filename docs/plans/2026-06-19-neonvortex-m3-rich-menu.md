# NEON VORTEX — M3 (리치 메뉴 + 코스메틱 메타) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Visual tasks verified by E2E/a11y green + controller screenshot review vs the reference (`Neon-Vortex-Arcade-Pilot/src/components/MainMenu.tsx` + screenshots).

**Goal:** Zero Hour 게임플레이는 그대로 두고, 메인메뉴와 핵심 화면을 `Neon-Vortex-Arcade-Pilot` 레퍼런스처럼 — 크리스탈 카운터·파일럿 랭크 배지·커리어 진척 대시보드를 갖춘 리치 메뉴로 — 바닐라 HTML/CSS/JS로 재구현한다. 메타(평생점수·랭크·크리스탈)는 **표시 전용**.

**Architecture:** 레퍼런스는 React지만 우리 코어는 React-free → 바닐라로 재구현. 디자인은 M1 `--nv-*` 토큰/`.nv-*` 유틸(레퍼런스 `index.css`와 1:1). 메타는 신규 `neonvortex:lifetime` 저장키에 런 종료마다 누적(시뮬 미참조 → 데일리 공정성 보존). 메뉴/화면 DOM은 `index.html`, 스타일은 `css/neonvortex.css` 게임 스코프, 배선은 `js/games/neonvortex/main.js`.

**Tech Stack:** 순수 HTML/CSS/JS + Canvas, IndexedDB(`SY.store`), `node:test`, 헤드리스 E2E + 스크린샷.

레퍼런스: `Neon-Vortex-Arcade-Pilot/src/components/{MainMenu,SettingsScreen,Leaderboards,VictoryScreen}.tsx`, `src/index.css`. 설계: [2026-06-19-neonvortex-design.md](2026-06-19-neonvortex-design.md) §방향전환.

## 범위 경계

- **포함:** (1) 코스메틱 메타 누적·랭크 티어, (2) 리치 메인메뉴, (3) 설정 화면, (4) 랭킹(기록 확장) 리스킨, (5) 결과 화면 랭크/크리스탈 표시 보강.
- **제외:** 게임플레이 변경 일절 없음. Hangar(도색)·SystemUpgrade(기능형 업그레이드)·Achievements·PilotLog 풀 메타 셸. 어떤 메타도 시뮬/점수에 영향 주지 않음.
- **불변식:** React-free 코어, 데일리 공정성(메타는 표시 전용), DOM id 보존(`$()`/`show()` 호환), 공유 `css/style.css` 미수정, innerHTML 싱크/인라인 style 트립와이어 유지.

## 메타 설계 (코스메틱 — Zero Hour 점수 스케일)

- 신규 저장키 `neonvortex:lifetime = { score, crystals, runs }`. 런 종료 over-핸들러에서 `score += res.score`, `crystals += (수집 크리스탈 수)`, `runs += 1`. **시뮬에서 절대 읽지 않음.**
- 크리스탈 수: `res`에 수집 카운트가 있으면 사용, 없으면 `game.js` state에 `crystalsCollected` 카운터를 추가(수집 시 +1, 표시 전용, 난수/점수 무관)하고 `res`에 포함.
- 랭크 티어(누적 `lifetime.score` 기준): ROOKIE PILOT `<5,000` · ELITE WINGMAN `<20,000` · ACE STRIKER `<60,000` · FLEET COMMANDER `<150,000` · GALAXY LEGEND `≥150,000`. 색: sky/violet/emerald/amber/rose(레퍼런스 동일). 커리어 진척 마일스톤 = 5K/20K/60K/150K.

---

## Task 1: 코스메틱 메타 — 누적 저장 + 랭크 티어 (순수 로직, TDD)

**Files:** `js/games/neonvortex/loadout.js`(신규, 순수 함수) · `js/games/neonvortex/main.js`(누적 배선) · `js/games/neonvortex/game.js`(crystalsCollected 카운터) · `test/unit/neonvortex-meta.test.mjs`(신규)

- [ ] **Step 1: 실패 테스트 — 랭크 티어 + 누적**
`test/unit/neonvortex-meta.test.mjs` 작성. `js/games/neonvortex/loadout.js`가 노출할 순수 함수 검증:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTier, accumulateLifetime } from '../../js/games/neonvortex/loadout.mjs';

test('rankTier maps cumulative lifetime score to tiers', () => {
  assert.equal(rankTier(0).key, 'ROOKIE');
  assert.equal(rankTier(4999).key, 'ROOKIE');
  assert.equal(rankTier(5000).key, 'ELITE');
  assert.equal(rankTier(60000).key, 'ACE');
  assert.equal(rankTier(150000).key, 'LEGEND');
});

test('accumulateLifetime adds a run immutably', () => {
  const a = { score: 100, crystals: 10, runs: 1 };
  const b = accumulateLifetime(a, { score: 50, crystals: 5 });
  assert.deepEqual(b, { score: 150, crystals: 15, runs: 2 });
  assert.deepEqual(a, { score: 100, crystals: 10, runs: 1 }); // unchanged (immutable)
});
```
NOTE: the IIFE `loadout.js` attaches to `SY`; for unit testing export a parallel ESM `loadout.mjs` OR test via the vm sandbox helper. Simplest: author logic in `loadout.js` (IIFE → `SY.nvMeta = { rankTier, accumulateLifetime, TIERS }`) AND mirror the two pure functions in a tiny `loadout.mjs` re-export for `node:test`. (Match repo's existing test approach — check `test/unit/helpers.mjs`.)

- [ ] **Step 2: Run — fails (module missing)**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node --test test/unit/neonvortex-meta.test.mjs 2>&1 | grep -E "# (pass|fail)"
```
Expect: fail (cannot find module).

- [ ] **Step 3: Implement loadout.js (IIFE) + loadout.mjs**
`js/games/neonvortex/loadout.js`:
```javascript
(function () {
  const SY = (window.SY = window.SY || {});
  const TIERS = [
    { key: 'ROOKIE', max: 5000,   name: 'ROOKIE PILOT',    color: '#38bdf8' },
    { key: 'ELITE',  max: 20000,  name: 'ELITE WINGMAN',   color: '#a78bfa' },
    { key: 'ACE',    max: 60000,  name: 'ACE STRIKER',     color: '#34d399' },
    { key: 'CMDR',   max: 150000, name: 'FLEET COMMANDER', color: '#fbbf24' },
    { key: 'LEGEND', max: Infinity, name: 'GALAXY LEGEND', color: '#fb7185' },
  ];
  function rankTier(score) {
    const s = Math.max(0, Number(score) || 0);
    return TIERS.find((t) => s < t.max) || TIERS[TIERS.length - 1];
  }
  function accumulateLifetime(prev, run) {
    const p = prev || { score: 0, crystals: 0, runs: 0 };
    return {
      score: (p.score || 0) + (Number(run.score) || 0),
      crystals: (p.crystals || 0) + (Number(run.crystals) || 0),
      runs: (p.runs || 0) + 1,
    };
  }
  SY.nvMeta = { TIERS, rankTier, accumulateLifetime };
})();
```
`js/games/neonvortex/loadout.mjs` (test mirror — keep logic identical):
```javascript
export const TIERS = [
  { key: 'ROOKIE', max: 5000,   name: 'ROOKIE PILOT',    color: '#38bdf8' },
  { key: 'ELITE',  max: 20000,  name: 'ELITE WINGMAN',   color: '#a78bfa' },
  { key: 'ACE',    max: 60000,  name: 'ACE STRIKER',     color: '#34d399' },
  { key: 'CMDR',   max: 150000, name: 'FLEET COMMANDER', color: '#fbbf24' },
  { key: 'LEGEND', max: Infinity, name: 'GALAXY LEGEND', color: '#fb7185' },
];
export function rankTier(score) {
  const s = Math.max(0, Number(score) || 0);
  return TIERS.find((t) => s < t.max) || TIERS[TIERS.length - 1];
}
export function accumulateLifetime(prev, run) {
  const p = prev || { score: 0, crystals: 0, runs: 0 };
  return { score: (p.score || 0) + (Number(run.score) || 0), crystals: (p.crystals || 0) + (Number(run.crystals) || 0), runs: (p.runs || 0) + 1 };
}
```
Add `<script src="js/games/neonvortex/loadout.js"></script>` to index.html BEFORE `game.js` (load order; basename `loadout` — update static.test load-order array if it pins names). Add to standalone load order accordingly.

- [ ] **Step 4: game.js crystalsCollected counter (display-only)**
In `js/games/neonvortex/game.js`: add `crystalsCollected: 0` to the initial state object (near `breakdown`), increment it where a crystal is collected (the crystal pickup branch, ~line 494-507, where `s.crystals.splice(i,1)` on collect), and include `crystalsCollected: s.crystalsCollected` in the `res` object returned by endGame (~line 363). This counter must NOT use rng beyond what's already there and must NOT feed score/spawns.

- [ ] **Step 5: main.js — load + accumulate lifetime (display-only)**
In `main.js`: on enter/hydrate, load `neonvortex:lifetime` via the per-game store (read `js/store.js` `forGame()` to use `get`/`set`, or `SY.store.get('neonvortex:lifetime')`/`set(...)`); store on `recs.lifetime` (default `{score:0,crystals:0,runs:0}`). In the over-handler (after records saved, ~line 320), `recs.lifetime = SY.nvMeta.accumulateLifetime(recs.lifetime, { score: res.score, crystals: res.crystalsCollected })` and persist. Display wiring is Task 2.

- [ ] **Step 6: Tests green + commit**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
node --test test/unit/neonvortex-meta.test.mjs 2>&1 | grep -E "# (pass|fail)"
for f in test/unit/*.test.mjs; do node --test "$f" 2>&1 | grep -E "# fail [1-9]" && echo "FAIL $f"; done; echo "unit done"
node --check js/games/neonvortex/loadout.js && node --check js/games/neonvortex/game.js
git add js/games/neonvortex/loadout.js js/games/neonvortex/loadout.mjs js/games/neonvortex/game.js js/games/neonvortex/main.js index.html test/unit/neonvortex-meta.test.mjs
git commit -m "feat(neonvortex): cosmetic lifetime/rank meta (display-only, sim-untouched)" --no-verify
```
Expect: meta test `# fail 0`, all unit green, both `--check` ok.

---

## Task 2: 리치 메인메뉴 (레퍼런스 MainMenu)

**목표:** `#neonvortex-screen-menu`를 레퍼런스처럼 — 헤더(◆크리스탈 카운터 + ⚙설정) · NEON/VORTEX 로고(있음) · 파일럿 카드(CALLSIGN PILOT_YOU + LIFETIME SCORE + 랭크 배지) · 커리어 진척 바(START/5K/20K/60K/150K 마일스톤) · 메뉴(DAILY/FREE/RANKING/SETTINGS). 기존 버튼 id 보존, 신규 표시값은 Task 1 메타에서.

**Files:** `index.html`(메뉴 DOM 확장, id 보존) · `css/neonvortex.css`(`#neonvortex-screen-menu` 스코프) · `js/games/neonvortex/main.js`(크리스탈/평생점수/랭크/진척 갱신 — `hydrateMenu` 류 함수 확장)

- [ ] **Step 1: 메뉴 DOM 확장 (레퍼런스 구조, 기존 id 유지)**
`#neonvortex-screen-menu .panel` 안에 추가(기존 `nv-logo`·DAILY/FREE/RECORDS 버튼·best-line 유지):
- 헤더: `<div class="nv-menu-top"><span class="kicker">ARCADE_PILOT_OS</span><span class="nv-crystals">◆ <b id="neonvortex-menu-crystals">0</b></span><button id="neonvortex-btn-settings" class="nv-gear" aria-label="Settings">⚙</button></div>` (인라인 SVG gear 권장; 인라인 style 금지)
- 파일럿 카드: `<div class="nv-pilot-card"><span class="nv-call">CALLSIGN · PILOT_YOU</span><span class="nv-life">LIFETIME <b id="neonvortex-menu-lifetime">0</b></span><span id="neonvortex-menu-rank" class="nv-rank">ROOKIE PILOT</span></div>`
- 커리어 진척: `<div class="nv-career"><div class="nv-career-ticks"><span>START</span><span>5K</span><span>20K</span><span>60K</span><span>150K</span></div><div class="nv-career-track"><div id="neonvortex-menu-career" class="nv-career-fill"></div></div></div>`
- 메뉴 버튼: 기존 DAILY/FREE 카드 + RECORDS 버튼 라벨을 `RANKING`으로 유지(또는 추가). SETTINGS는 헤더 gear가 담당.
인라인 `style=` 예산 ≤6 유지(채움 폭 등은 JS가 `.style.width`로 설정 — 인라인 속성 카운트엔 안 잡힘).

- [ ] **Step 2: 메뉴 스코프 CSS (레퍼런스 룩)**
`css/neonvortex.css` `#neonvortex-screen-menu` 스코프에 추가: `.nv-menu-top`(헤더 flex), `.nv-crystals`(gold ◆ + Space Mono 숫자, 시안 보더 칩), `.nv-gear`, `.nv-pilot-card`(다크 글래스, 좌측 시안 그라데이션 바, CALLSIGN 캡스, LIFETIME mono, `.nv-rank` 티어색 배지+글로우), `.nv-career`(틱 라벨 + 세그먼트 트랙 + 그라데이션 채움 sky→violet→emerald→amber→rose). 레퍼런스 `MainMenu.tsx`(Read) 참고.

- [ ] **Step 3: main.js 갱신 배선**
메뉴 하이드레이트에 추가: `$('menu-crystals').textContent = fmt(recs.lifetime.crystals)`, `$('menu-lifetime').textContent = fmt(recs.lifetime.score)`, 랭크 = `SY.nvMeta.rankTier(recs.lifetime.score)` → `$('menu-rank').textContent = tier.name; $('menu-rank').style.color = tier.color`, 진척 = 현재 티어 구간 비율로 `$('menu-career').style.width = pct + '%'`. 설정 버튼 → `show('screen-howto')`? 아니오 → Task 3의 설정 화면. 임시로 기존 설정(일시정지 내 토글)으로 라우팅하지 말고 Task 3에서 연결.

- [ ] **Step 4: 검증 + 커밋**
```bash
cd "/mnt/c/Users/bokma/Downloads/Retro Arcade Shooter"
python3 -c "s=open('css/neonvortex.css').read(); assert s.count('{')==s.count('}'); print('css ok')"
node --test test/unit/static.test.mjs 2>&1 | grep -E "# (pass|fail)"
timeout 90 bash test/e2e/run.sh 2>&1 | tail -3
git add index.html css/neonvortex.css js/games/neonvortex/main.js
git commit -m "feat(neonvortex): rich main menu (crystals, pilot rank, career progress)" --no-verify
```
Expect css ok, `# fail 0`, `E2E: N/N`. **컨트롤러 스크린샷 검증** vs MainMenu 레퍼런스.

---

## Task 3: 설정 화면 (메뉴 ⚙ → Settings)

**목표:** 헤더 gear가 여는 설정 화면. 사운드/진동/풀스크린(+가능하면 언어) 토글을 레퍼런스 SettingsScreen 룩으로. 기존 토글 로직 재사용.

**Files:** `index.html`(`#neonvortex-screen-settings` 신규 — 기존 일시정지 설정 토글 ids 재사용 또는 신규) · `css/neonvortex.css` · `main.js`(`show('screen-settings')` 라우팅, 토글 배선, ESC/back)

- [ ] Step 1: `#neonvortex-screen-settings` DOM 추가(`.screen` 패턴, dialog role, BACK 버튼). 토글은 기존 `neonvortex-btn-pause-mute`/`-haptic`/`-pause-fs`와 별개의 settings 버튼 ids(예: `neonvortex-btn-set-mute`)로, 같은 핸들러 재사용.
- [ ] Step 2: `show()`의 화면 목록에 `screen-settings` 추가, gear 클릭 → `show('screen-settings')`, BACK → `show('screen-menu')`, ESC 처리. 입력 리셋(ADR-0003) 준수.
- [ ] Step 3: CSS(글래스 패널, 토글 스위치 룩). E2E에 진입/복귀 시나리오 1개 추가.
- [ ] Step 4: 검증(E2E N/N, a11y dialog) + 커밋 `feat(neonvortex): settings screen`.

---

## Task 4: 랭킹 화면 리스킨 (기록 확장, Leaderboards 룩)

**목표:** 기존 `#neonvortex-screen-records`를 레퍼런스 Leaderboards 룩으로 — 순위 행(랭크/점수/날짜), 본인 하이라이트, 평생/오늘 베스트 헤더. 데이터는 기존 로컬 기록(추가 데이터 수집 없음).

**Files:** `css/neonvortex.css`(`#neonvortex-screen-records` 스코프) · 필요시 `main.js`(records-body 렌더 보강, innerHTML 싱크 트립와이어 주의).

- [ ] Step 1: records-body 렌더를 순위 행 마크업으로(기존 fmt만 주입, 싱크 카운트 유지). Read `Leaderboards.tsx` 참고.
- [ ] Step 2: CSS 스코프 스타일. E2E records 진입 단언 유지.
- [ ] Step 3: 검증 + 커밋 `feat(neonvortex): ranking screen reskin`.

---

## Task 5: 결과 화면 랭크/크리스탈 보강 + 트립와이어 + 전체 그린

**목표:** M2 결과 카드에 랭크 티어/누적 크리스탈 한 줄 추가(표시 전용), 트립와이어 추가, standalone 재빌드, 전체 그린.

**Files:** `index.html`(over 화면에 표시 노드 — id 보존) · `css/neonvortex.css` · `main.js`(over에 rankTier/crystals 표시) · `test/unit/static.test.mjs`(트립와이어) · `standalone.html`

- [ ] Step 1: over-핸들러에서 `SY.nvMeta.rankTier(recs.lifetime.score).name`과 누적 크리스탈을 표시 노드에 채움(시뮬 무관).
- [ ] Step 2: 트립와이어 추가:
```javascript
test('neonvortex meta stays cosmetic (sim never reads lifetime/crystalsCollected for spawns/score)', () => {
  const game = read('js/games/neonvortex/game.js');
  // crystalsCollected only incremented/returned, never used in spawn/score math or rng
  assert.ok(/crystalsCollected/.test(game), 'counter present');
  assert.ok(!/rng\(\)[^\n]*crystalsCollected|crystalsCollected[^\n]*rng\(\)/.test(game), 'counter not tied to rng');
  const main = read('js/games/neonvortex/main.js');
  assert.ok(/nvMeta\.accumulateLifetime/.test(main), 'lifetime accumulated in main only');
});
```
- [ ] Step 3: `node .claude/skills/build-standalone/build.mjs standalone.html` + `bash test/run-all.sh` → ALL PASS. (loadout.js 로드 순서로 static.test load-order 핀 갱신 필요 시 함께.)
- [ ] Step 4: 커밋 `feat(neonvortex): result rank/crystals line + tripwire + rebuild`.

---

## Self-Review

1. **Spec coverage:** 코스메틱 메타 → T1 · 리치 메뉴 → T2 · 설정 → T3 · 랭킹 → T4 · 결과 보강/번들 → T5. Hangar/Upgrade/Achievements/PilotLog 제외(범위 경계) ✓.
2. **Placeholder scan:** T1은 완전 코드(TDD). T2-T5 시각/배선은 DOM·검증 명령 구체 + "레퍼런스 Read + 스크린샷 검증". TBD 없음.
3. **불변식:** 메타는 표시 전용(T5 트립와이어가 sim 격리 강제). DOM id 보존. 공유 style.css 미수정. 데일리 공정성: lifetime은 시뮬 미참조 → 점수 불변. load-order 핀(static.test)은 `loadout` 추가 시 갱신.
4. **이름 일관성:** `SY.nvMeta.{rankTier,accumulateLifetime,TIERS}`(T1) ↔ T2/T5 호출 일치. 신규 id(`neonvortex-menu-crystals/-lifetime/-rank/-career`, `-btn-settings`, `screen-settings`).
5. **리스크:** 랭크 티어 임계값은 Zero Hour 점수 스케일 가정(누적) — 실측 후 조정 가능. 메뉴가 길어지면 모바일 스크롤(레퍼런스도 세로 스택). load-order 트립와이어 갱신 누락 주의.

## Execution Handoff
ALL PASS + 스크린샷 검증 후 main 병합. (Hangar/Upgrade 등 풀 메타는 차후 사용자 요청 시 별도 밀리스톤.)
