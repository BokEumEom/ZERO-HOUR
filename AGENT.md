# AGENT.md — Scoreyard AI 에이전트 작업 지침서

이 저장소에서 작업하는 모든 AI 에이전트(구현·테스트·검증·리팩터)의 운영 매뉴얼.
프로젝트 개요는 [CLAUDE.md](CLAUDE.md), 함정 목록은 [LEARNINGS.md](LEARNINGS.md),
의사결정 기록은 [docs/](docs/README.md), 평가 기준은 [rubric.md](rubric.md) 참조.

## 프로젝트 한 줄 요약

60초 레트로 아케이드 슈터. 순수 HTML/CSS/JS + Canvas 2D, **빌드 도구·package.json 없음**.
배포: git push → Vercel 자동 배포 (https://zero-hour-seven.vercel.app).

## 절대 규칙 (위반 시 즉시 중단)

1. **`standalone.html` 직접 수정 금지** — 생성 산출물. 소스 수정 후
   `node .claude/skills/build-standalone/build.mjs`로 재생성 (훅이 직접 수정을 차단함).
2. **게임플레이 난수는 `s.rng()`만** — 스폰/드랍/확률에 `Math.random()` 추가는
   데일리 챌린지 공정성 파괴 ([ADR-0002](docs/adr/0002-seeded-rng-daily-fairness.md)).
   `Math.random()`은 코스메틱(파티클/흔들림) 전용.
3. **게임 코어(js/store·audio·game·render·main) React 금지** — React/Babel은 dev 트윅 패널 전용.
4. **데일리 기록은 "지금 날짜"가 아닌 런의 시드 날짜로 귀속** —
   `res.seedStr` 사용 ([ADR-0004](docs/adr/0004-daily-records-filed-by-seed-date.md)).
5. **점수 가산은 반드시 브레이크다운 버킷 태깅** — "버킷 합 ≡ 총점" 불변식 유지.
6. **비ASCII 파일을 PowerShell 기본 cmdlet로 읽고 쓰지 말 것** —
   `Get-Content`가 BOM 없는 UTF-8 한글을 파괴함. `[IO.File]::ReadAllText/WriteAllText` + 명시적 UTF-8.

## 아키텍처 (수정 위치 결정)

| 파일 | 책임 | 주의 |
|---|---|---|
| `index.html` | 마크업·화면 DOM | 인라인 `<style>` 금지, 인라인 `style=` 예산 ≤6 |
| `css/tokens.css` | 플랫폼 디자인 토큰 (팔레트·폰트·safe-area) | 단일 출처. `style.css`보다 먼저 로드. 게임별 정체성은 자체 `:root`로 오버라이드 가능 ([docs/design-system.md](docs/design-system.md)) |
| `css/style.css` | 전체 UI 스타일 | 토큰은 `tokens.css`. 기본 `display:none` 요소는 JS에서 `'block'` 명시 토글 |
| `js/store.js` | IndexedDB + 시드 RNG + 날짜 유틸 | 기록은 게임별 `SY.store.forGame(id)`; 공용 `settings`만 전역. UTC 경계는 `Date.UTC` |
| `js/audio.js` | Web Audio SFX + 햅틱 | 게임 무관 공용 |
| `js/shell.js` | 아케이드 셸: 레지스트리·rAF 루프·`fit`·허브·라우팅 | 게임 무관. 활성 게임의 `frame(dt,ctx)`만 호출 |
| `js/games/zerohour/game.js` | 엔진: phase 상태머신·시뮬·충돌·보스 | 60fps 핫패스 — 프레임 루프 내 신규 할당 금지 |
| `js/games/zerohour/render.js` | 게임 캔버스 렌더링 **전용** | UI 차트(스파크라인 등)는 main.js 소속 |
| `js/games/zerohour/main.js` | Zero Hour 등록(`enter/exit/frame`)·HUD·화면·기록·입력 | 화면 전환은 `show()` 경유 |
| `js/games/zerohour/tweaks*.jsx` | dev 밸런스 패널 (React) | 게임 코어가 의존하면 안 됨 |

새 게임 = `js/games/<id>/` 모듈이 `SY.registerGame({id,title,blurb,enter,exit,frame})` 호출 ([ADR-0008](docs/adr/0008-arcade-platform-shell.md)).

phase 상태머신(게임별): `menu | ready | playing | paused | over`. 셸: 허브 ↔ 게임.
모든 전이 지점(`pause`/`resume`/`start`)에서 입력 리셋 필수 ([ADR-0003](docs/adr/0003-pause-system-and-quit-semantics.md)).

## 표준 워크플로 (모든 비자명 변경)

```
1. 계획     — 변경 설계. 클 경우 docs/plans/YYYY-MM-DD-<topic>.md 작성, 사용자 승인
2. 테스트   — 기존 스위트에 실패하는 테스트 먼저 추가 (단위: test/unit, E2E: test/e2e/harness.html)
3. 구현     — 절대 규칙·아키텍처 표 준수
4. 실행     — test\run-all.ps1 → ALL PASS까지 수정
5. 재생성   — 소스 변경 시 standalone 재빌드 (run-all의 해시 검사가 누락을 잡음)
6. 검증     — 독립 Verifier에게 rubric.md + diff 전달, "위반하는 방법을 찾아라" 지시
7. 반영     — Verifier P1/P2 반영 → 재실행 → docs/reviews/에 보고서 기록
8. 기록     — 새 설계 결정은 docs/adr/, 새 함정은 LEARNINGS.md, 커밋 (push는 사용자)
```

작은 수정(오타·문서)은 4–5단계만으로 충분. 단, **테스트 실패 상태로 턴을 끝내지 말 것**.

## 검증 명령 모음

```powershell
node --test "test/unit/*.test.mjs"        # 단위+정적, 의존성 0, ~0.3s
powershell -NoProfile -ExecutionPolicy Bypass -File test\e2e\run.ps1   # E2E (헤드리스 Edge)
powershell -NoProfile -ExecutionPolicy Bypass -File test\run-all.ps1   # 전체 (번들 동기화 포함)
node .claude/skills/build-standalone/build.mjs                          # 번들 재생성
node --check js/<file>.js                                               # 빠른 구문 검사
```

## 테스트 작성 규칙

- **단위**: `node:test` + `test/unit/helpers.mjs`의 vm 샌드박스 사용 (IIFE 로드, IndexedDB 스텁,
  `frozenDateClass`로 시계 고정). vm 산 배열은 `Array.from`으로 호스트 복사 후 비교.
- **E2E**: `test/e2e/harness.html`에 시나리오 추가. 헤드리스 가상 시간에서 **rAF가 굶으므로**
  시뮬은 `G.update(dt)` 수동 스텝. 시나리오 라우팅은 해시(쿼리스트링은 serve가 삼킴).
  assert는 비자명 입력 위에서 (자명 통과 금지 — 리포트에 실측값 포함).
- **컨벤션은 tripwire로**: 새 규칙은 문서가 아니라 `static.test.mjs`의 베이스라인 핀으로 강제.

## 에이전트 역할 분담 (멀티 에이전트 작업 시)

| 역할 | 책임 | 핵심 지시 |
|---|---|---|
| Test Agent | 요구사항 → 실패하는 테스트 | edge case·property·integration 포함, 실행 가능하게 |
| Draft Agent | 테스트 통과하는 구현 | 절대 규칙 준수, 기존 패턴 모방 |
| Auto Test Runner | 전체 스위트 실행·결과 보고 | 실패 시 이름·입력·기대/실제 전부 표시 |
| Verifier | **독립** 평가 (구현 컨텍스트 미공유) | rubric.md 기준, 적대적으로 "위반 방법" 탐색, 직접 실행 |
| Refiner | Verifier 피드백 반영 | 수정 전/후 요약, 전 테스트 재통과까지 반복 |

Verifier의 가치는 독립성에서 나온다 — 구현자와 컨텍스트를 공유하면 같은 맹점을 공유한다
(실증: all-green 상태에서 자정 롤오버 버그 적발, [보고서](docs/reviews/2026-06-11-verifier-report.md)).

## 환경 주의사항 (Windows PowerShell 5.1)

[LEARNINGS.md §5](LEARNINGS.md) 표 참조. 요약: UTF-8은 `[IO.File]` API로,
멀티라인 커밋 메시지는 `git commit -F <file>`로, `Process.ExitCode`는 `HasExited` 확인 후
인자 없는 `WaitForExit()` 추가 호출 후 읽기, `$profile`은 자동 변수라 대입 금지.
