# R1 — 아레나 데코 확장 (Arena Decor Expansion) · 설계+계획

> 상위 방향: full-asset-utilization 로드맵 잔여 R1. 섹션5 모듈러 잔여 조각 + miniIcon을
> 기존 `DECOR` 시스템에 저알파 ambient facility 아트로 추가. **순수 렌더(코스메틱)** —
> 시뮬/점수/시드/Math.random 무관. 매우 작은 변경이라 단일 문서(설계=계획)로 진행.

## 신규 아틀라스 rect (검증 완료; `sheet:'el'` 없음) — `sprites.js` `A`에 추가
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `decoHexFrame` | 148 | 527 | 75  | 68 | 육각 프레임(s5) |
| `decoChip`     | 363 | 616 | 108 | 67 | 회로 칩 보드(s5) |
| `decoConduit`  | 38  | 623 | 156 | 29 | 도관/레일 바(s5) |
| `miniIcon`     | 1357| 881 | 54  | 47 | 삼각 함선 마크(s8) → 코너 데코 |

## 렌더 — `render.js` `DECOR` 배열에 4개 배치 추가
중앙 플레이존(대략 x250–700, y150–450)을 피해 엣지/코너 빈 곳에 저알파:
```
{ key: 'decoChip',     x: 120, y: 250, size: 84,  rot: 0,        alpha: 0.13 },
{ key: 'decoHexFrame', x: 840, y: 215, size: 72,  rot: 0,        alpha: 0.13 },
{ key: 'decoConduit',  x: 650, y: 545, size: 150, rot: 0,        alpha: 0.12 },
{ key: 'miniIcon',     x: 120, y: 380, size: 40,  rot: 0,        alpha: 0.12 },
```
`drawDecor`는 기존대로 `globalCompositeOperation='lighter'` + `SP.draw`(미디코드 시 no-op).
별도 함수/상태 없음 — 배열 엔트리만 추가.

## 구현 단계 (inline TDD)
1. `decor.test.mjs`(신규): 4 rect 존재 + `sheet` 태그 없음 + 좌표 검증 → RED.
2. `sprites.js`에 4 rect 추가 → GREEN. 커밋.
3. `render.js` `DECOR`에 4 배치 추가.
4. `static.test.mjs` 핀: render 소스에 `decoChip`/`decoHexFrame`/`decoConduit`/`miniIcon`
   가 `DECOR`에 등장. → 풀 스위트 PASS. 커밋.
5. gallery 스크린샷으로 과밀/배치 육안(과하면 alpha↓ 또는 위치 조정) → 만족 시 확정.
6. 번들 재생성 + 해시-싱크. 커밋.

## 불변식/검증
- 코스메틱: 시드/점수/Math.random 무변경(baseline 유지). game.js 무변경.
- run-all(unit + E2E + 해시-싱크) PASS. fairness 감사 불필요(난수 무관), perf는 +4 저알파
  blit(무할당) → 무시 가능. 스크린샷 게이트로 미적 확인.

## DoD
- 섹션5 모듈러 잔여(hexFrame/chip/conduit) + miniIcon이 코드에서 참조·렌더됨.
- 모든 테스트 PASS, 스크린샷 양호. 시드 스트림 불변(난수 미소비).
- 잔여(테스트튜브·브래킷·boss콘솔·안테나·glassTube·debris)는 이후 그룹/스윕에서 처리.
