# G1 — 효과 풀 가동 (Effects Full Activation) · 설계

> 상위 방향: `docs/plans/2026-06-29-full-asset-utilization-roadmap.md` (G1).
> 목표: `sprite-atlas.png` 섹션4(WEAPONS/EFFECTS)의 **미사용 효과 스프라이트 6종**을
> 게임 이벤트에 반영한다. **순수 코스메틱** — 시뮬/점수/시드 무관.

## 불변식 (반드시 준수)
- 데일리 공정성: 게임플레이 난수는 `s.rng`만. 이 작업은 난수를 **전혀** 쓰지 않는다.
- **신규 `Math.random` 0개** — 효과 변형(회전/오프셋)은 위치값에서 파생(기존 `blast()`
  의 `rot:(x*0.7+y*0.3)%(2π)` 선례). `Math.random` baseline은 14로 유지.
- 60fps 핫패스 무할당: 효과 리스트는 캡 + 프레임당 감쇠, 그리기는 `SP.draw`(9-arg crop,
  additive). 신규 per-frame 할당 금지.
- 디코드 전/실패 시 `SP.draw`가 false 반환 → 효과는 단순 미표시(폴백 불필요, ambience).

## 신규 아틀라스 rect (검증 완료, `sprites.js` `A`에 추가; `sheet:'el'` 없음)
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `fxWarpRing` | 745 | 398 | 151 | 98 | 틸 워프/포탈 링 (확장 등장 연출) |
| `fxBurstLg` | 1241 | 396 | 136 | 101 | 대형 오렌지 폭발 |
| `fxBurstMd` | 1088 | 414 | 102 | 79 | 중형 오렌지 폭발 |
| `fxBurstSm` | 1236 | 288 | 81 | 73 | 소형 오렌지 버스트 |
| `fxSwoosh` | 1335 | 295 | 75 | 78 | 시안 방향성 슬래시 |
| `fxDebris` | 954 | 422 | 84 | 62 | 파편(잔해) |

(섹션4 잔여 `(870,271,46,105)` 핀 달린 시안 탄환/랜스는 **효과가 아니라 투사체** →
G1 범위 제외, 추후 웨폰 변형 항목으로 트래킹.)

## 아키텍처 — 기존 효과 시스템에 얹기
현재 `game.js`/`render.js`의 효과 1회성 구조:
- `s.parts` 벡터 파티클(`burst()`), `s.waves` 벡터 링(`wave()`), `s.blasts` **아틀라스
  스프라이트 플래시**(`blast()`, additive 성장/페이드, `render.js` ~589), `s.shake`.

G1은 `s.blasts` 경로를 **스프라이트 키를 받도록 일반화**하고, 모션이 다른 3종만 전용
리스트를 둔다.

### 1) `s.blasts` 일반화 (오렌지 폭발 3종 흡수 — 최소 변경)
- 현재 `blast(s,x,y,size)`는 항상 `burst` 스프라이트로 그려짐(render.js `SP.draw(ctx,'burst',...)`).
- 변경: blast 항목에 `key`(기본 `'burst'`) 추가. `blast(s,x,y,size,key='burst')`.
  render의 blast 루프는 `SP.draw(ctx, bl.key || 'burst', ...)`.
- 신규 효과는 같은 성장/페이드/회전 로직 재사용:
  - 대형 폭발 → `blast(s,x,y,size,'fxBurstLg')`
  - 중형 → `'fxBurstMd'`, 소형 → `'fxBurstSm'`
- **변형은 위치 파생**(기존 `rot`), Math.random 미사용.

### 2) `s.warps` — 워프인 링 (확장 전용 1회성)
- `spawnWarp(s,x,y,maxSize)` → `s.warps.push({x,y,size:0,maxSize,life:1})`.
- update: `w.size += (w.maxSize)*dt*K; w.life -= dt*rate;` 제거 when life<=0. 캡(예: 6).
- render: additive, `SP.draw(ctx,'fxWarpRing', w.x,w.y, lerp(0→maxSize), rotFromPos)`,
  alpha = life. (기존 `wave()` 링은 유지 — 워프링과 겹쳐 더 풍부하게.)

### 3) `s.slashes` — 방향성 스워시 (차저 돌진 전용)
- `spawnSlash(s,x,y,angle)` → push `{x,y,angle,life:1}`. 캡(예: 8).
- update: `sl.life -= dt*rate`; 제거 시.
- render: additive, `SP.draw(ctx,'fxSwoosh', x,y, size, angle)`, alpha=life.
- 트리거: **차저(charger) 적이 `dash` 상태로 진입하는 순간** 1회(돌진 방향 `angle`).
  *(피격/플레이어는 화면 노이즈 우려로 제외 — 사용자 결정.)*

### 4) `s.debris` — 파편 (방사 튐 1회성)
- `spawnDebris(s,x,y)` → push `{x,y,size,life:1,rot:posDerived}`. 캡(예: 8).
- update: `d.life -= dt*rate`(살짝 위로/밖으로 드리프트, 속도 위치파생). 제거 시.
- render: 일반 alpha, `SP.draw(ctx,'fxDebris', x,y, size*(0.7+0.3*life), rot)`.
- 트리거: 상자/락 파괴 시(기존 파티클과 병행) 1회.

> 신규 리스트 3개는 `freshState`에 `warps:[], slashes:[], debris:[]` 추가 + `clear()`
> 리셋 포함(블래스트/웨이브와 동일 취급).

## 이벤트 → 효과 매핑 (최종)
| 이벤트 | 코드 위치(대략) | 추가 효과 |
|---|---|---|
| 보스 등장 | `spawnBoss` | `spawnWarp(보스 진입점, 큰 크기)` |
| 엘리트 등장 | elite enter | `spawnWarp(엘리트 위치, 중간)` |
| 보스 사망 | boss death 블록(game.js ~507) | `blast(...,'fxBurstLg')` ×1~2 |
| BOMB 폭발 | `bombDetonate` | `blast(중심,'fxBurstLg')` |
| 보스 파트/코어 처치 | bossCore 파괴 | `blast(...,'fxBurstMd')` |
| 적/락/상자 처치 | foe/rock/crate kill | `blast(...,'fxBurstSm')` |
| 상자/락 파괴 | crate/rock break | `spawnDebris(...)` |
| 차저 돌진 진입 | foes.js charger → dash | `spawnSlash(x,y,dashAngle)` |

## 모듈/파일 영향
- `js/games/neonvortex/sprites.js` — `A`에 6 rect 추가(끝).
- `js/games/neonvortex/game.js` — `blast()` 시그니처 +`key`; `spawnWarp/spawnSlash/
  spawnDebris` 헬퍼; freshState 3리스트; update 감쇠/캡; 이벤트 지점 wiring. 차저 dash
  진입 훅(foes.js가 상태 전이 → game.js에서 감지하거나 foeApi에 콜백).
- `js/games/neonvortex/render.js` — blast 루프 `bl.key`; drawWarps/drawSlashes/
  drawDebris 패스(블래스트 근처, additive). 무할당.
- `js/games/neonvortex/foes.js` — 차저 `idle→dash` 전이 시점 노출(이미 `foeApi`에
  `burst/wave/blast` 전달됨 → `spawnSlash` 추가 전달 또는 dash 진입에서 호출).

## 테스트 — `test/unit/fx-effects.test.mjs`
1. 6 rect가 `A`에 존재 + `sheet` 태그 없음(atlas) + 정확한 좌표.
2. `blast(s,x,y,size,'fxBurstLg')`가 `s.blasts`에 `key:'fxBurstLg'`로 push.
3. 이벤트 시뮬: BOMB → blasts에 `fxBurstLg` 1개 이상; 보스 등장 → `s.warps` 비어있지
   않음; 차저 dash 진입 → `s.slashes` push; 상자 파괴 → `s.debris` push.
4. 캡/감쇠: 리스트가 캡 초과로 무한 성장하지 않음; update 후 life 감소.
5. **신규 Math.random 0** — static.test.mjs의 baseline 14 핀 유지(이 작업으로 14 불변).
- `static.test.mjs`: 6 rect 핀(rng-free) + render에 drawWarps/Slashes/Debris 와이어 핀.
- gallery: 보스 워프링·오렌지 폭발·차저 슬래시·파편 육안 확인.

## 검증/감사
- run-all: unit + E2E + 번들 해시-싱크 PASS.
- rng-fairness-auditor: 코스메틱(난수 무사용) → PASS 기대.
- performance-analyzer: 핫패스 무할당(캡/풀, additive draw) 확인.

## DoD
- 섹션4 효과 6종이 코드에서 참조·렌더됨. README/design 자산표는 이미 최신(별도 동기화 불필요).
- 모든 테스트/감사 PASS. 시드 스트림 **불변**(난수 미소비 → 데일리 맵 시프트 없음).
