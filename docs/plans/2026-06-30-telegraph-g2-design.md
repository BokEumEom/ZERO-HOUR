# G2 — 위험 텔레그래프 배지 (Danger Telegraphs) · 설계

> 상위 방향: `docs/plans/2026-06-29-full-asset-utilization-roadmap.md` (G2).
> 목표: `sprite-atlas.png` 섹션6(BOSS/ELITE)의 **미사용 텔레그래프 배지 2종**을 기존
> 위험-예고 순간에 표시한다. **순수 렌더 전용** — 게임 로직/타이밍/난수 변경 0.

## 불변식 (반드시 준수)
- **`game.js`/`foes.js`/`elite.js`/`sprites.js`(rect 추가 제외)/시뮬은 일절 수정하지 않는다.**
  변경은 `render.js`(+ `sprites.js` rect 2개 추가)에 한정 → `Math.random` baseline 14
  자동 유지, 데일리 시드 스트림 완전 불변, 시드핀 무파손.
- 펄스 알파는 기존 엔티티 필드(`e.phase`/`f.phase`/타이머)에서 `sin`으로 파생 — 결정적,
  난수 무사용. (render.js의 기존 셰이크 `Math.random`은 그대로, 신규 추가 없음.)
- 60fps 핫패스: 배지 그리기는 `SP.draw`(9-arg crop) + balanced save/restore, additive.
  per-frame 할당 없음. `SP.draw`는 미디코드 시 false → 배지 미표시(폴백 불필요, ambience).

## 신규 아틀라스 rect (검증 완료, `sprites.js` `A`에 추가; `sheet:'el'` 없음)
| 키 | x | y | w | h | 용도 |
|---|---|---|---|---|---|
| `warnTri` | 991 | 536 | 71 | 95 | 경고 삼각형(!) — 엘리트 발사 예고 |
| `skullHex` | 1327 | 545 | 91 | 85 | 해골 휘장 — 차저 돌진 예고 |

(섹션6 잔여 — 핑크 랜스(878,538,78,96)·보스 콘솔(739,515,213,121) — 은 성격이 달라
G2 범위 제외, 후속 항목으로 트래킹. 콘솔=보스 도착 HUD 플러시 후보, 랜스=빔 직격 후보.)

## 아키텍처 — 기존 텔레그래프 순간에 배지 덧그림 (render.js 전용)

### 1) warnTri → 엘리트 텔레그래프
- 위치: `render.js`의 `drawElite` 안 `if (e.state === 'telegraph') { ... }` 블록
  (현재 점선 경고 레이를 그리는 곳, ~438-445).
- 추가: 엘리트 위쪽 `(e.x, e.y - (e.r + 40))`에 `warnTri`를 additive로 그림.
  알파 = `0.45 + 0.4 * Math.sin(e.phase * 8)` (기존 레이 펄스와 동일 cadence).
  크기 ~48. 점선 레이는 유지(겹쳐 더 명확).

### 2) skullHex → 차저 lock(돌진 조준)
- 위치: `render.js`의 `drawFoe` charger 분기 `if (f.state === 'lock') { ... }` 블록
  (현재 돌진 점선을 그리는 곳, ~375-385).
- 추가: 차저 위쪽 `(f.x, f.y - (f.r + 34))`에 `skullHex`를 additive로 그림.
  알파 = `0.5 + 0.4 * Math.sin(f.phase * 10)` (결정적 펄스). 크기 ~40.
  돌진 점선은 유지.

> 신규 상태/리스트/타이머 없음. `game.js` freshState/update 무변경. 두 배지는 기존
> `e.state`/`f.state`/`*.phase`만 읽는다.

## 모듈/파일 영향
- `js/games/neonvortex/sprites.js` — `A`에 `warnTri`, `skullHex` 2 rect 추가(끝).
- `js/games/neonvortex/render.js` — `drawElite` telegraph 블록 + `drawFoe` charger lock
  블록에 배지 draw 추가. (그 외 파일 무변경.)

## 테스트 — `test/unit/telegraph.test.mjs`
1. `warnTri`/`skullHex` rect가 `A`에 존재 + `sheet` 태그 없음 + 정확한 좌표.
2. `static.test.mjs` 핀: `render.js` 소스에 `warnTri`가 `e.state === 'telegraph'`
   문맥에서, `skullHex`가 `f.state === 'lock'` 문맥에서 등장(상태 게이트 확인).
3. 기존 `Math.random` baseline-14 핀 유지(이 작업은 game.js 무변경 → 자동).
- gallery: 엘리트 텔레그래프 시 경고 삼각형, 차저 lock 시 해골 휘장 육안 확인.

## 검증/감사
- run-all: unit + E2E + 번들 해시-싱크 PASS.
- rng-fairness-auditor: render-only·난수 무사용 → PASS(자명).
- performance-analyzer: 배지 2 draw(상태 게이트), 무할당, balanced state → PASS.

## DoD
- 섹션6 텔레그래프 배지 2종이 코드에서 참조·렌더됨. 시드 스트림 불변.
- 모든 테스트/감사 PASS. 잔여 섹션6(랜스·콘솔)은 후속 트래킹.
