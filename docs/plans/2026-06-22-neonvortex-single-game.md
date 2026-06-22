# 단일 게임 전환 — "Neon Vortex Arcade Pilot"

2026-06-22 · 승인됨 (사용자 4개 범위 결정 + 진행 승인)

## 배경 / 목표

Scoreyard는 멀티게임 아케이드 셸(허브 + zerohour/neonvortex/shepherd)이었다.
앞으로 **NeonVortex 단일 게임**("Neon Vortex Arcade Pilot")으로 방향을 굳힌다.
Shepherd's Dog는 사용자가 별도 프로젝트로 분리한다.

**핵심 사실(검증 완료)**: `neonvortex/game.js`는 `zerohour/game.js`와 5줄 차이뿐
(`SY.game`→`SY.nvGame` 네임스페이스, display-only `crystalsCollected` 카운터).
게임플레이는 100% 동일 — NeonVortex가 곧 "UI 디자인이 입혀진 Zero Hour"다.
따라서 zerohour 제거 시 게임플레이 손실 없음.

**잔존 의존성**: `neonvortex/main.js`가 `SY.zh.medals`(=`zerohour/medals.js`)를 사용 →
medals 모듈을 NeonVortex로 이동해야 zerohour를 통째로 지울 수 있다.

## 범위 결정 (사용자 확정)

1. Zero Hour: **완전 제거** (코드+등록+로드순서)
2. 허브 화면: **제거**, 부팅 시 NeonVortex 직행
3. Shepherd's Dog: **파일까지 삭제** (분리는 사용자가 별도 진행)
4. 브랜딩: **전체 갱신** (README/CLAUDE.md/design.md/AGENT.md/title)

## 단계

### Phase 1 — 엔진 단일화
- `zerohour/medals.js` → `neonvortex/medals.js` 이동, `SY.zh.medals` → `SY.nvMedals`.
- `neonvortex/main.js` 4개 호출부 갱신.
- 엔진 테스트 재배치: `game.test`/`surge.test` → `neonvortex/game.js`(`SY.nvGame`),
  `medals.test` → 새 경로/네임스페이스.

### Phase 2 — 단일 게임 부팅 (허브 제거)
- `shell.js`: `boot()` → `enterGame('neonvortex')` 직행, `exitToHub` 의미 전환.
- `index.html`: `#screen-arcade` 제거, zerohour/shepherd `<script>` 제거.
- 허브 CSS(`.game-card` 등) + shell 허브 렌더 제거.

### Phase 3 — 파일 삭제
- `js/games/zerohour/`, `js/games/shepards-dog/` 삭제. 잔존 참조 정리.

### Phase 4 — 브랜딩
- 타이틀/메타, README/CLAUDE.md/design.md/AGENT.md 재정의. ADR/plans 이력 보존.

### Phase 5 — 검증
- `static.test` 로드순서/구조 단언 갱신.
- `build-standalone` 재생성. `test/run-all` ALL PASS. 핫패스 변경 시 performance-analyzer.

## 불변식 (AGENT.md)
- standalone.html 직접 수정 금지(재생성).
- 게임플레이 난수 `s.rng()`만. medals 이동은 코스메틱 — 시뮬 무영향.
- 게임 코어 React-free 유지.
