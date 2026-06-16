# 스펙: Zero Hour 메달 & 점수 티어

- **날짜**: 2026-06-16
- **상태**: ✅ 구현·검증 완료 ([ADR-0009](../adr/0009-medals-and-tiers.md))
- **결정(브레인스토밍)**: 랭크 RECRUIT→PILOT→ACE→LEGEND · 린 6메달 · 데일리/프리 공통 임계값(튜닝 상수)

## 목표

Zero Hour에 목표·진행감 레이어 추가. 런마다 **랭크**와 **메달**을 판정해 결과 화면에 표시하고,
평생 누적 업적을 RECORDS에 노출. 기존 데이터 + 작은 game.js 추가만 사용(공정성·점수 무변경).

## 설계

### 랭크(티어) — 최종 점수 기준, 공통
RECRUIT(0) · PILOT(1,500) · ACE(3,000) · LEGEND(5,000). 튜닝 가능한 상수.

### 메달 6종 (런 판정 → 평생 누적, 데일리/프리 공통)
- CORE WARDEN: `res.bossDown`
- NO HIT: `res.noHit`(피해 0)
- FLAWLESS: noHit && bossDown
- COMBO ×25: `res.maxCombo >= 25`
- LEGEND: 랭크 LEGEND 도달(점수 ≥ 5,000)
- WEEK STREAK: `computeStreak() >= 7`

### 파일
- **신규** `js/games/zerohour/medals.js` — 순수 모듈(DOM 무관): `SY.zh.medals = { TIERS, MEDALS, rank(score), evalRun(res, streak) }`. React-free IIFE. 로드 순서 render 다음, main 이전.
- `game.js` — `freshState`에 `tookDamage:false`; `hurtPlayer`의 HP 감소 경로에서 `s.tookDamage=true`; `endGame` `res.noHit = !s.tookDamage`. (실드 방어는 피해 아님)
- `store.js` — `forGame(id).loadMedals()`/`addMedals(ids)`(`id:medals` 키, 병합·중복 제거, 새로 딴 id 반환).
- `main.js` — onGameOver: `rank` + `evalRun` 계산 → `addMedals` → 결과에 RANK 배지·메달(신규 강조+sfx). renderRecords: ACHIEVEMENTS 섹션(6칸 획득/미획득).
- `index.html` — #over에 `#over-rank`/`#over-medals`; RECORDS에 achievements 영역.
- `css/style.css` — 랭크 배지·메달 셀·신규 강조.

### 테스트
- 단위(medals.js 순수): `rank()` 임계값 경계, `evalRun()` 매핑(보스/노히트/플로리스/콤보/레전드/스트릭), `addMedals` 병합·멱등(store).
- E2E: 보스+노히트+고득점 강제 런 → 결과 RANK/메달 노출; RECORDS ACHIEVEMENTS 표시(결정적 부분만).
- 정적: innerHTML 싱크 핀 갱신, medals.js React-free/IIFE, 로드 순서에 medals 포함.

## Verification
`test\run-all.ps1` ALL PASS + 번들 해시 동기화 + Playwright(세로) 결과 RANK/메달 + RECORDS 업적 시각 확인.
결정 기록: [ADR-0009](../adr/0009-medals-and-tiers.md).
