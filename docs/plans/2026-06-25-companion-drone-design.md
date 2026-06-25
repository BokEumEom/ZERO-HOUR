# 컴패니언 드론 (DRONE 파워업) — 설계 + 계획 (E2)

> 아틀라스 섹션 8(DRONE/COMPANION VARIANTS)을 흡수. 60초 코어 유지, 기존 파워업
> 시스템에 8번째 타입으로 자연 편입.

**Goal:** DRONE 파워업 획득 시 임시 윙맨 드론 2기가 플레이어를 선회하며 가장 가까운
적을 자동 사격하는 시스템.

## 설계
- **8번째 파워업 `DRONE`** — 시드 파워업 백에서 등장(데일리 공정 유지). 지속시간 동안
  유지, 재획득 시 연장(다른 파워업과 동일 가산-캡).
- **드론 `s.drones`** — 2기, 플레이어 주위 반경 40px 선회(시작 각 균등, 시간 기반 →
  결정적). 사거리 360px 내 최근접 적에게 fireCd 0.55s로 사격. 총알은 기존 `s.bullets`에
  push(기존 충돌/점수 재사용). **rng 없음 → 데일리 공정 자동 보장.**
- 아트: 드론 엔티티 = 아틀라스 `drone`(1215,1019,44,38) 회전; HUD 배지 = 같은 스프라이트
  `POWER_ICONS.DRONE` 틴트.

## 통합 지점
- game.js: `POWER_TYPES`+DRONE, `POWER_META`+DRONE(glyph 'D', color), `POWER_DURATION`+DRONE(9),
  `fx`+`DRONE:0`, `freshState`+`drones:[]`, `applyPow` DRONE 분기(타이머 연장+드론 생성),
  update에 드론 선회·사격(+ fx.DRONE 0이면 드론 제거), `spawnDrones`/`nearestTarget` 헬퍼.
- sprites.js: A{}+`drone`, `POWER_ICONS`+DRONE.
- render.js: `drawDrone` + 선회 드론 그리기.
- main.js: HUD 배지 루프 `['MAGNET','SLOW','X2','BOOST','SPREAD']`에 `'DRONE'` 추가.
- README: 파워업 표에 DRONE 행.

## 불변식
- 새 Math.random/s.rng 없음(드론 행동 결정적). 60fps 무할당(s.drones 재사용). 점수 신규값
  없음(드론 총알=기존 파괴 점수). 정적 Math.random 베이스라인 14 유지.

## 단계 (단일)
- Task1: 파워업 타입+메타+지속+아이콘+applyPow+드론 생성/제거 + 테스트.
- Task2: 드론 선회·사격 update + render + HUD + README.

## 테스트 (test/unit/drone.test.mjs)
- DRONE 파워업이 백에 있음; applyPow DRONE → s.drones 2기 + fx.DRONE>0.
- 드론이 적 방향으로 s.bullets 발사(사거리 내).
- fx.DRONE 만료 → 드론 제거.
- 재획득 시 fx.DRONE 연장(캡).
- 정적: POWER_TYPES에 DRONE, HUD 배지 루프에 DRONE, drawDrone.
