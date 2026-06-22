# 설계 — 상태 반응형 함선 프레임 (핵심 3종)

**날짜**: 2026-06-22
**상태**: 설계 승인 (구현 계획 대기)
**범위**: 코스메틱 렌더 — 단일 헐을 게임 상태에 따라 SHIELDED / DAMAGED / BOOSTED
프레임으로 교체. `assets/sprite-atlas.png` 하단 "PLAYER SHIP / DRONE VARIANTS"
프레임을 활용한다.

## 1. 배경 & 동기

`sprite-atlas.png` 하단 행은 별도 스킨이 아니라 **같은 청록 함선의 상태 프레임**
(DEFAULT · UPGRADED I/II/III · BANK L/R · BOOSTED · SHIELDED · DAMAGED · MINI)이다.
현재 게임은 DEFAULT 헐(`A.player`) 하나만 그리고, 실드는 벡터 링으로 그린다.
이 프레임들은 게임 상태에 반응해 바꿔 끼우도록 설계된 자산이므로, 상태 연출에
연결하는 것이 자산의 올바른 사용이다.

이번 범위는 상태 매핑이 명확하고 체감이 큰 **핵심 3종**:
- **SHIELDED** — `s.shield`가 켜질 때 (함선+육각 보호막 합성 프레임)
- **DAMAGED** — 마지막 헐일 때 (`s.player.hp <= 1`)
- **BOOSTED** — BOOST 파워업 활성 시 (`s.fx.BOOST > 0`)

**제외 (근거)**: `BANK L/R`는 함선이 이동방향으로 회전하는 현 모델(`game.js:447`
`p.angle = atan2(vy,vx)`)과 충돌. `MINI ICON`은 HUD가 DOM/CSS 정책
([ADR-0007](../adr/0007-records-screen-and-arena-hud.md))이라 부적합. 추진 램프
(UPGRADED I/II/III)는 이번 범위 밖.

## 2. 불변식 (반드시 유지)

- 순수 코스메틱: 시뮬·시드 RNG·점수·데일리 공정성에 **무영향**. 히트박스
  `player.r = 13` 불변, `game.js` 무변경.
- 60fps 핫패스 **프레임당 할당 0** (CLAUDE.md/[ADR-0008] 불변식).
- 스프라이트 미디코드/실패 시 **현행 벡터 폴백 그대로** 유지.
- 색 코팅(neon/stealth/solar)은 모든 프레임에 그대로 적용.

## 3. 소스 rect (sprite-atlas.png, 1448×1086)

| 프레임 | rect | 비고 |
|---|---|---|
| `player` (DEFAULT) | `{24, 832, 122, 126}` | 기존 |
| `shieldDome` (SHIELDED) | `{1050, 826, 142, 142}` | 기존 키 재사용 (함선+버블 합성) |
| `boosted` (신규) | `{907, 827, 109, 133}` | 대형 3중 화염 — 구현 시 골짜기 스캔으로 ±2px 미세조정 |
| `damaged` (신규) | `{1209, 833, 122, 126}` | 균열·잔해 스파크 |

## 4. 컴포넌트 변경

### 4.1 `sprites.js` — 프레임 rect + 도색 캐시 일반화
- `A`에 `boosted`, `damaged` 추가 (SHIELDED는 `shieldDome` 재사용).
- 도색 캐시 키를 `paint` 단일키 → **`frame:paint` 복합키**로 일반화
  (예: `damaged:stealth`). 각 조합은 **최초 1회만** 오프스크린 틴트 빌드 →
  핫패스는 캐시 blit. `neon`은 원본 크롭(틴트 없음).
- `playerCanvas(id)` → `playerCanvas(frameKey, paintId)`. 기존 컴포지팅 로직
  (source-atop 틴트 → multiply 셰이드 → destination-in 재마스크) 그대로, rect만
  `A[frameKey]`로 일반화.
- `draw`/`drawPlayer`가 player 계열 프레임 키면 동일 틴트 경로를 타도록 분기 확장.

### 4.2 프레임 선택 — 순수 함수 (테스트 대상)
- `pickHullFrame({ shield, hp, boost })` → `'shielded' | 'damaged' | 'boosted' | 'player'`
- 우선순위: **shielded > damaged(hp ≤ 1) > boosted(boost > 0) > 'player'**.
  실드 버블이 헐을 덮으므로 최상위; 위험 가독성(damaged) > 연출(boosted).
- 부수효과 0, 인자는 plain 객체(`SY.nvGame` 비의존). `SY.nvSprites.pickHullFrame`로
  노출(sprites.js가 render.js보다 먼저 로드됨) → `node --test` vm 샌드박스에서
  상태→키 매핑 단위 테스트.

### 4.3 `render.js` — `drawPlayer`
- `const frame = pickHullFrame({ shield: s.shield, hp: s.player.hp, boost: s.fx.BOOST })`
  한 줄 추가 후 `SP.draw(ctx, frame, p.x, p.y, size, p.angle + Math.PI/2)`.
  불리언 몇 개 + 문자열 룩업 → 할당 없음.
- `frame === 'shielded'`이면 **기존 벡터 실드 링 분기(195~207행) 미실행** — 스프라이트
  버블이 대체. 버블이 헐보다 ~1.4× 크므로 shielded만 타깃 size 보정(예: 42 → 60).
- 스프라이트 미디코드/실패 시: 현행 벡터 함선 + 벡터 실드 링 그대로(`SP.draw`가
  false 반환 → 기존 폴백 경로). damaged/boosted는 벡터에서 무변화(폴백 동일).

## 5. 데이터 흐름

```
game.js (무변경) ──► s.shield / s.player.hp / s.fx.BOOST
                         │ (읽기 전용)
render.drawPlayer ──► pickHullFrame(...) ──► frameKey
                         │
sprites.draw(frameKey) ──► neon? 원본크롭 : 캐시[frame:paint] blit
                         └─ 미디코드 → false → render 벡터 폴백
```

## 6. 테스트

- **단위 (`node --test`)**: `pickHullFrame`의 상태 조합별 반환 키
  (실드 단독, hp=1, boost, 중첩 우선순위, 기본값). 순수 함수라 IDB·canvas 불필요.
- **정적 (tripwire)**: React-free·시드 RNG baseline 영향 없음 확인(자동).
- **E2E**: 기존 시나리오 무영향. 부팅 시 함선이 정상 렌더되는지 스모크만.
- **수동**: 스크린샷 검증 — 실드 켤 때 버블, hp=1일 때 균열, BOOST 시 화염.

## 7. 영향 없음 / 후속

- `game.js`·시드 RNG·점수표 무변경 → README 점수 동기화 불필요.
- 변경 후 `performance-analyzer` 에이전트로 핫패스 점검.
- `standalone.html` 재생성 필요 — `/build-standalone` (사용자 실행).
- 데일리 공정성([ADR-0002](../adr/0002-seeded-rng-daily-fairness.md)) 불변.

## 8. 대안 (기각)

- **render.js 단독 선택 + 기존 SP.draw**: 도색 틴트가 현재 `key === 'player'`에만
  적용돼 어차피 프레임별 틴트 일반화가 필요 → 4.1로 수렴.
- **런타임 합성(기본 헐 + 이펙트 오버레이)**: 전용 프레임 자산이 이미 있어 불필요,
  핫패스 비용만 증가.
