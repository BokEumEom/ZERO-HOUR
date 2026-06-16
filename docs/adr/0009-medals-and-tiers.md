# ADR-0009: Zero Hour 메달 & 점수 티어

- **상태**: 적용됨 (2026-06-16)
- **관련**: [스펙](../plans/2026-06-16-medals-and-tiers.md), [ADR-0008](0008-arcade-platform-shell.md)

## Context

Zero Hour는 코어 루프·데일리·기록·UX는 갖췄으나 목표·진행감 레이어가 없었다. 리텐션을
높일 가벼운 메타 시스템이 필요. 서버 없음 → 로컬 저장으로.

## Decision

- **점수 티어(랭크)**: RECRUIT/PILOT/ACE/LEGEND, 최종 점수 기준(1.5k/3k/5k), 데일리·프리 공통.
  결과 화면에 RANK 배지(랭크별 색).
- **메달 6종**(평생 누적, 양 모드 공통): CORE WARDEN(보스), NO HIT(피해 0), FLAWLESS(둘 다),
  COMBO ×25, LEGEND(랭크 도달), WEEK STREAK(연속 7일).
- **순수 모듈** `js/games/zerohour/medals.js`: `rank(score)`, `evalRun(res, ctx)→ids`, 정의 테이블.
  DOM 무관 → 단위 테스트로 임계값·매핑 검증. (게임 로직과 표현 분리.)
- **판정 데이터**: `res.noHit = !s.tookDamage` (game.js에 `tookDamage` 추가; 실드 방어는 피해 아님).
  나머지는 기존 `res`(bossDown/maxCombo/score) + `computeStreak()`.
- **저장**: `store.forGame(id).loadMedals()/addMedals(ids)` (`id:medals`, 병합·멱등, 새 id 반환).
- **결과 화면**: RANK 배지 + 이번 런 메달(처음 딴 건 NEW 강조 + powerup sfx). **메달 적립은
  비동기(fire-and-forget)** — 결과 화면/카운트다운 타이밍을 IDB 왕복이 지연시키지 않게.
- **RECORDS**: ACHIEVEMENTS 섹션(6칸 획득/미획득), 14일 리스트 위에 배치.

## Consequences

- (+) 명확한 목표·리텐션 훅, 기존 데이터 재사용, 게임플레이/점수/공정성 무변경(noHit 플래그만 추가).
- (+) medals.js 순수 분리로 로직이 DOM/IDB 없이 단위 테스트됨(임계값 경계·전 메달 매핑).
- (−) 메달/RECORDS 업적 표시는 rAF 루프·IDB 의존이라 헤드리스 E2E에선 비결정적 → 랭크(동기)만
  E2E로 검증하고 메달·업적 내용은 Playwright 라이브 + medals/store 단위 테스트로 커버.

## Verification

단위 45(medals 9 + store 멱등/격리 포함), E2E 41(랭크 배지 포함; 4연속 안정), 번들 해시 동기화.
Playwright 라이브(390×844): RANK·LEGEND + 5메달 NEW 강조, RECORDS 업적 5획득/1미획득 확인.
(부수 수정: E2E 포트 랜덤화로 연속 실행 바인드 레이스 제거; 루프 의존 cosmetic 단언 제거.)
