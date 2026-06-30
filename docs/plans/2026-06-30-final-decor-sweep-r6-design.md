# R6 — 최종 데코 스윕 (Final Decor Sweep) · 설계+계획

> 로드맵 잔여의 마지막 자투리. 남은 미사용 스프라이트 8종을 전부 기존 `DECOR` 시스템에
> 저알파 ambient facility 아트로 추가 → **sprite-atlas 리터럴 100% 활용**. 순수 렌더(코스메틱).

## 불변식
- 순수 렌더: 시뮬/점수/시드/Math.random 무관(baseline 유지). game.js 무변경.
- 핫패스: +8 저알파 `SP.draw`(무할당). 중앙 플레이존 회피 배치.

## 신규 아틀라스 rect (검증 완료) — `sprites.js` `A`
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `glassTube`   | 620 | 269 | 54  | 105 | 냉각 캡슐 튜브(s3) |
| `antennaArr`  | 436 | 386 | 59  | 101 | 안테나/이미터(s3) |
| `testTubeA`   | 247 | 614 | 16  | 65  | 시안 시험관(s5) |
| `testTubeB`   | 299 | 614 | 31  | 69  | 핑크 시험관(s5) |
| `decoBracket` | 517 | 631 | 140 | 49  | 모듈 브래킷(s5) |
| `redCorner`   | 461 | 522 | 76  | 81  | 위험 코너 프레임(s5) |
| `bossConsole` | 754 | 531 | 81  | 73  | 보스 커맨드 콘솔 코어(s6) |
| `debris2`     | 730 | 159 | 100 | 67  | 잔해 클러스터(s2) |

## 렌더 — `render.js` `DECOR` 배열에 8개 저알파 배치 추가
중앙 플레이존(x250–700, y150–450) 회피, 엣지/코너 빈 곳, alpha 0.08–0.11:
```
{ key: 'antennaArr',  x: 55,  y: 135, size: 60,  rot: 0, alpha: 0.10 },
{ key: 'glassTube',   x: 905, y: 130, size: 52,  rot: 0, alpha: 0.11 },
{ key: 'debris2',     x: 760, y: 62,  size: 72,  rot: 0, alpha: 0.09 },
{ key: 'testTubeB',   x: 250, y: 52,  size: 44,  rot: 0, alpha: 0.10 },
{ key: 'bossConsole', x: 55,  y: 305, size: 76,  rot: 0, alpha: 0.10 },
{ key: 'redCorner',   x: 905, y: 440, size: 58,  rot: 0, alpha: 0.10 },
{ key: 'decoBracket', x: 745, y: 556, size: 110, rot: 0, alpha: 0.09 },
{ key: 'testTubeA',   x: 300, y: 556, size: 36,  rot: 0, alpha: 0.10 },
```
`drawDecor`는 기존대로(추가 변경 없음).

## 구현 단계 (inline TDD)
1. `final-decor.test.mjs`: 8 rect 존재 + `sheet` 태그 없음 + 좌표. → RED/GREEN.
2. sprites.js 8 rect 추가. 커밋.
3. render.js DECOR 8 배치 추가 + static 핀(render에 8키 등장). 풀 스위트 PASS. 커밋.
4. gallery 스크린샷으로 과밀 검증(과하면 alpha↓). 만족 시 번들 재생성 + 해시-싱크. 커밋.

## 검증
- run-all PASS. 스크린샷 게이트(중앙 명료·과밀 없음). fairness/perf 감사 불필요(코스메틱·무할당).

## DoD
- **sprite-atlas의 모든 게임 스프라이트가 코드에서 참조됨 = 리터럴 100% 활용 달성.**
  남는 건 sprite-reference.png(좌표 문서)·keyart.png(마케팅)뿐.
- 모든 테스트 PASS, 스크린샷 양호, 시드 불변.
