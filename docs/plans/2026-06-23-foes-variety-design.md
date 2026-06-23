# 신규 적 4종 (위협 다양성) — 설계 (Sub-project A)

> 상위 맥락: "게임이 단조롭다" → 플레이어 동사가 '이동' 하나뿐. 위협 다양성으로
> '피하기' 외의 대응을 강제한다. 분해 B(완료)→**A(이 문서)**→C(파워업 지속시간).

**Goal:** 서로 다른 대응을 요구하는 신규 적 4종(Hunter·Charger·Shield·Laser)을
추가해 60초 루프의 단조로움을 깬다. 데일리 공정성·60fps 무할당·난이도 게이팅·
점수표 동기화를 모두 지킨다.

---

## 1. 아키텍처 — 신규 모듈 `js/games/neonvortex/foes.js`

`game.js`는 769줄로 800줄 상한에 근접 → 신규 적 시뮬을 별도 모듈로 분리.

- **`SY.nvFoes`** (IIFE, `window.SY`). 순수 시뮬 — 렌더 없음.
- 상태: `game.js`의 `freshState`가 `s.foes = []`, `s.foeSpawnT = { hunter, charger, shield, laser }` (각 초기값은 `nvFoes.initTimers(s)`가 채움)를 둔다.
- foe 엔트리(공통 + kind별):
  ```
  { kind, x, y, vx, vy, r, hp, maxHp, flash, phase,
    // charger: state('hover'|'lock'|'dash'|'recover'), lockT, dirX, dirY
    // shield: aimA (방패가 향하는 각, 플레이어로 천천히 회전)
    // laser: state('warn'|'fire'|'cool'), beamT, ax,ay,bx,by (빔 라인 양끝) }
  ```
- 인터페이스:
  - `SY.nvFoes.initTimers(s)` — 스폰 타이머 시드(s.rng).
  - `SY.nvFoes.update(s, dt, slowMul, api)` — 스폰(난이도 게이팅) + 이동/상태머신 +
    빔·접촉 피해 + 자가소멸. `api = { hurtPlayer, addScore, burst, wave, floatText,
    dropRewards }` (game.js가 주입; foes.js는 game.js 내부 함수에 직접 의존하지 않음).
  - `SY.nvFoes.bulletHit(foe, b)` — 순수 기하 판정. 반환 `'hit' | 'blocked' | 'miss'`.
    Shield는 탄 접근각이 방패호(aimA ± ARC/2) 안이면 `'blocked'`.
  - `SY.nvFoes.damage(s, foe, dmg, api)` — HP 차감, 사망 시 점수+드랍, foe 제거.
- **game.js 연동(불가피한 교차 지점):**
  1. 자동조준 `cand`에 `s.foes` 중 **targetable**(Shield/Charger/Hunter/Laser-emitter)
     포함 — 가장 가까운 표적 선정 로직은 그대로.
  2. 탄환 루프에서 각 탄 vs `s.foes`를 `nvFoes.bulletHit` → `'hit'`이면 `nvFoes.damage`,
     `'blocked'`이면 스파크(코스메틱)만.
  3. `update()` 본문에서 `if (s.diff.foes) SY.nvFoes.update(s, dt, slowMul, api);` 1줄 위임.

## 2. 적 4종 행동·수치

모든 스폰 위치/타이밍/조준 분기는 **`s.rng()`** (데일리 공정성). 코스메틱(스파크·
파티클)만 `Math.random()`.

### Hunter (추격드론) — Normal·Hard
- HP **2**, r 14. 가장자리 스폰. 매 프레임 플레이어 방향으로 가속(상한 속도
  `(95 + s.t*1.3) * s.diff.mineSpeedMul`, 기뢰보다 빠름). 접촉 시 `hurtPlayer`.
- 처치: 거리 벌리며 자동사격으로 격파. 가만히 있으면 잡힘. **점수 30, 드랍 없음.**

### Charger (돌진) — Normal·Hard
- HP **2**, r 18. 상태머신:
  - `hover`(가장자리, 1.0s) → `lock`(플레이어 현재 위치 조준선 텔레그래프 0.8s) →
    `dash`(조준 방향 직선, 속도 520, 1.0s 또는 화면 밖) → `recover`(0.8s, 감속) →
    화면 밖이면 제거, 아니면 `lock` 재진입.
  - `dash` 중에만 접촉 피해. `lock`/`recover` 중 무방비(사격 호기).
- 처치: 돌진 옆굴리기 + 무방비 구간 사격. **점수 35, 드랍 없음.**

### Shield (방패) — Hard
- HP **4**, r 20. 느린 드리프트(랜덤 방향, 화면 안 반사). `aimA`가 플레이어 쪽으로
  매 프레임 천천히 회전(rotLerp ~2.2 rad/s). 방패호 반각 `ARC = 1.05 rad`(약 ±60°).
- `bulletHit`: 탄→foe 방향이 `aimA`의 반대(즉 정면)면 `blocked`(스파크), 측·후면이면 `hit`.
- 접촉 피해 있음. 처치: **돌아 들어가 측/후면 사격.** **점수 50 + 크리스털 3개.**

### Laser (지대차단) — Hard
- 이미터 HP **3**, r 16. 가장자리 고정. 상태머신:
  - `warn`(빔 라인 예고, 1.0s — 라인은 이미터→플레이어 당시 위치로 고정) →
    `fire`(지속 빔 1.2s, 빔 선분 접촉 시 `hurtPlayer`) → `cool`(1.6s) → `warn` 반복.
  - 일정 수명(예: 10s) 후 자가소멸. 이미터는 사격으로 조기 격파 가능.
- 빔 접촉 판정: 점-선분 거리 < (player.r + 빔 반폭 6). 빔은 `fire` 중에만 피해.
- **점수 40 + 크리스털 2개.** 스프라이트: `beam` 컬럼(빔) + enemyMid(이미터).

## 3. 난이도 게이팅 (DIFF 테이블 확장)

`game.js`의 `DIFF`에 `foes` 추가 — kind→캡(0/미존재=비활성):

| tier | foes |
|---|---|
| easy | `{}` (신규 적 없음 — 터렛 0과 일관, 입문용) |
| normal | `{ hunter: 2, charger: 1 }` |
| hard | `{ hunter: 2, charger: 2, shield: 1, laser: 1 }` |

- 스폰 케이던스는 기존 `spawnMul`로 스케일(Hard가 더 잦음).
- 데일리=Normal → Hunter+Charger 등장(전 세계 동일, 공정).
- `s.diff.foes`가 비어 있으면(`easy`) `nvFoes.update`는 즉시 반환(무비용).

## 4. 점수 동기화 (README 점수표 + score-sync)
신규 행을 README `## 점수 시스템` 표에 추가하고 game.js 상수와 일치:

| 행동 | 점수 |
|---|---|
| Hunter(추격드론) 파괴 | 30 (NORMAL·HARD) |
| Charger(돌진) 파괴 | 35 (NORMAL·HARD) |
| Shield(방패) 파괴 | 50 + 크리스털 3개 (HARD) |
| Laser(지대차단) 파괴 | 40 + 크리스털 2개 (HARD) |

`destruction` 버킷에 합산(터렛과 동일 경로). score-sync-checker로 검증.

## 5. 불변식 (반드시 지킴)
- **데일리 공정성**: 모든 게임플레이 RNG는 `s.rng()`. (rng-fairness-auditor로 검증)
- **60fps 무할당**: `s.foes` 배열·엔트리 재사용 패턴, 9-arg drawImage, 루프 내 객체
  리터럴 생성 회피. (performance-analyzer로 검증)
- **React-free / vanilla**: foes.js도 IIFE on `window.SY`.
- **코스메틱 메타 불간섭**: 신규 적은 `crystalsCollected`/lifetime을 읽지 않음.

## 6. 렌더 (render.js)
- `drawFoe(ctx, foe)` 디스패치 + kind별 그리기:
  - Hunter: enemyMid 틴트(빨강) + 회전.
  - Charger: enemyBig 틴트 + `lock` 중 조준선(텔레그래프) + `dash` 중 모션 스트릭.
  - Shield: enemyBig + 방패호(aimA 기준 호 stroke, blocked 시 스파크).
  - Laser: 이미터(enemyMid) + `warn` 점선 라인 → `fire` `beam` 컬럼(라인 따라).
- 디코드 전 벡터 폴백(기존 패턴). 렌더 순서: 기뢰·터렛 뒤, 보스 앞.

## 7. 단계 분할 (구현)
- **Phase 1 — Hunter + Charger** (Normal 티어). foes.js 골격 + 이 2종 + 자동조준/탄
  연동 + 난이도 게이팅 + 점수 + 렌더 + 테스트. 데일리에도 즉시 다양성.
- **Phase 2 — Shield + Laser** (Hard 티어). 방패호 디플렉션 + 빔 상태머신/판정 추가.

각 Phase는 자체 유닛 테스트(스폰 게이팅·상태전이·공정성·점수)로 핀하고 87+테스트
무회귀를 유지.

## 8. 범위 제외 (YAGNI)
- 분열 기뢰(사용자가 이전에 제외).
- 신규 파워업/플레이어 능동 액션(이번 방향 아님).
- 파워업 지속시간(C에서 별도).
- foe 전용 신규 아틀라스 아트(기존 스프라이트 틴트/재활용으로 충분).

## 9. 테스트 전략
- `test/unit/foes.test.mjs` (신규):
  - DIFF.foes 게이팅: easy=0, normal=hunter+charger만, hard=4종.
  - 데일리=normal → hunter/charger 스폰, shield/laser 미스폰.
  - Charger 상태전이(hover→lock→dash→recover), dash 중에만 접촉피해.
  - Shield `bulletHit`: 정면=blocked, 후면=hit(순수 함수, 시드 불필요).
  - Laser `warn→fire→cool`, fire 중에만 빔 피해.
  - 사망 시 destruction 버킷에 정확한 점수.
- 정적: foes.js가 IIFE/SY 패턴(static.test), Math.random 베이스라인 불변(공정성).
- 실행: `node --test 'test/unit/*.mjs'` (glob 필수).
