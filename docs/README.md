# docs

프로젝트 의사결정·계획·검증 기록.

## 구조

| 폴더 | 내용 |
|---|---|
| [adr/](adr/) | Architecture Decision Records — 핵심 설계 결정과 그 이유 |
| [plans/](plans/) | 구현 전 승인된 계획서 (브레인스토밍 → 설계 → 승인) |
| [rubrics/](rubrics/) | Verifier용 평가 루브릭 (객관적·자동 검증 가능 기준) |
| [reviews/](reviews/) | 독립 Verifier 평가 보고서와 Refiner 반영 결과 |

루트의 [LEARNINGS.md](../LEARNINGS.md)는 이터레이션에서 발견된 문제 패턴의 증류본.

## ADR 목록

| # | 제목 | 상태 |
|---|---|---|
| [0001](adr/0001-dual-html-generated-standalone.md) | 듀얼 HTML: index.html 소스 + 생성형 standalone.html | 적용됨 |
| [0002](adr/0002-seeded-rng-daily-fairness.md) | 시드 RNG로 데일리 챌린지 공정성 보장 | 적용됨 |
| [0003](adr/0003-pause-system-and-quit-semantics.md) | 일시정지 시스템과 QUIT 무기록 의미론 | 적용됨 |
| [0004](adr/0004-daily-records-filed-by-seed-date.md) | 데일리 기록은 런의 시드 날짜로 저장 | 적용됨 |
| [0005](adr/0005-zero-dependency-test-strategy.md) | 의존성 0 테스트 전략 (vm 샌드박스 + 헤드리스 E2E) | 적용됨 |

## 타임라인 (2026-06-11)

1. Claude Code 자동화 설정 (스킬·훅·에이전트·MCP) — commit `92cb992`
2. Vercel 배포용 구조 개선 (index.html 리네임, .vercelignore) — commit `92cb992`, 배포: https://zero-hour-seven.vercel.app
3. 완성도 업그레이드 브레인스토밍 → [플랜](plans/2026-06-11-completeness-upgrade.md) 승인 → 구현 — commit `cdf9b88`
4. CSS 분리 + .gitignore — commit `e00d382`
5. [루브릭](rubrics/2026-06-11-completeness-upgrade-rubric.md) 기반 TDD·검증 루프 → [Verifier 보고서](reviews/2026-06-11-verifier-report.md) → Refiner 반영 (자정 롤오버 버그 수정 포함) — commit `dd98ea9`
