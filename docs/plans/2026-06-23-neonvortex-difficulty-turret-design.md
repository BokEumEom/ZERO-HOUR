# 설계 — 난이도 티어(easy/normal/hard) + 터렛 적

**날짜**: 2026-06-23
**상태**: 설계 승인 (스펙 검토 대기)
**범위**: 게임플레이. 단조로움 완화를 위해 (1) 신규 적 **터렛** 1종, (2) **easy/normal/hard
난이도 티어**. 데일리는 항상 Normal 고정(공정성 유지), 난이도는 프리플레이 전용.

## 1. 목표 / 제약

- 단조로움 원인 = 위협 2종(바위·기뢰)뿐 + 평평한 난이도. → 터렛(엄폐·회피 요구)으로 위협
  다양성, 난이도 티어로 밀도·속도 변주.
- **한 손 조작(이동+자동사격) 불변** — 신규 입력 없음.
- **데일리 공정성 불변**: 데일리는 Normal 강제, 모든 신규 난수는 `s.rng()`.
- 60초·아레나 960×600·바닐라 IIFE·핫패스 무할당 불변.

## 2. 터렛 적 (Turret)

- **고정 포대**: 시드 위치(플레이어에서 ≥260px 떨어진 곳)에 등장, 이동 없음.
- **HP 5**, 자동사격 타깃 후보(`cand`)에 포함 → 우선 처치 대상.
- **조준 사격**: 내부 타이머 `fireT`(시드 초기값). 발사 전 **텔레그래프**(`warnT` ~0.5s,
  렌더가 점멸/조준선). 발사 시 플레이어 방향 ebullet 1발(속도 ~210). 발사 간격은 난이도별.
- **접촉 데미지 없음**(원거리 위협). ebullet만 데미지.
- **격파**: 점수 **60**(`destroy` 버킷), 크리스털 **3** 드랍(소량), 파워업 드랍 없음.
- **스폰**: `spawnT.turret` 타이머 + 난이도 캡(easy 0 / normal 2 / hard 3). 위치·발사각·간격
  전부 `s.rng()`.
- **렌더**: 미사용이던 **`enemyMid` 아틀라스 키 활용**(빨강 중형 드론, rect `{1022,48,90,76}`) +
  텔레그래프 링. 디코드 전 벡터 폴백(육각 포대 + 총구).
- **상태 필드**: `s.turrets[]` (entity: `{x,y,r:16,hp:5,maxHp:5,fireT,warnT,flash,phase}`).

## 3. 난이도 티어

`DIFF` 상수 테이블(게임 무관 난수 아님 — 고정 knob):

| knob | easy | normal | hard | 적용처 |
|---|---|---|---|---|
| `turretCap` | 0 | 2 | 3 | 터렛 스폰 상한 |
| `turretFire` | — | 2.6s | 1.9s | 터렛 발사 간격 |
| `spawnMul` | 0.75 | 1.0 | 1.3 | 기뢰/바위 스폰 빈도(타이머 나눗셈) |
| `mineSpeedMul` | 0.85 | 1.0 | 1.2 | 기뢰 속도 |
| `mineCap` | 9 | 12 | 16 | 기뢰 상한 |
| `bossHpMul` | 0.75 | 1.0 | 1.33 | 보스 HP (54/72/96) |
| `bossFireMul` | 1.25 | 1.0 | 0.8 | 보스 burstT/aimT 리셋 곱(작을수록 빠름) |

- 헐(목숨)은 **전 난이도 3** 고정(목숨↓는 cheap, 밀도·속도로 난이도 표현).
- `freshState(mode, seed, difficulty)`에 difficulty 전달, `s.diff = DIFF[difficulty]`,
  `s.difficulty = difficulty` 저장. 기존 스폰/보스/기뢰 코드가 `s.diff.*`를 곱해 적용.
- 점수 배수 **없음** — addScore "버킷 합 ≡ score" 불변식·README 점수표 무변경. Hard는
  적이 많아 자연히 점수↑.

## 4. 데일리 공정성 (가) + 기록

- **데일리 = 항상 Normal**: `startGame('daily')`는 difficulty 인자 무시하고 `'normal'` 강제.
  데일리 시드/맵/난이도 전 세계 동일 유지.
- **난이도 선택 = 프리플레이 전용**: 메뉴에 셀렉터(3칩), `recs.settings.nvDifficulty`에 영속
  (`nvPaint` 패턴 동일). 기본 `normal`.
- **프리플레이 베스트 = 난이도별 분리**: store에 `<id>:best_<diff>` 접근자 추가
  (`saveBestFor/loadBestFor`). 프리 런은 `best_<선택난이도>` 갱신. 데일리(=normal)는
  `best_normal` + `daily_<date>` 갱신.
- **마이그레이션**: 기존 `<id>:best_all` → `best_normal`로 1회 복사(idempotent, 기존
  플레이어 베스트를 normal로 귀속). 기존 `migrate()` 패턴 준용.
- **메뉴 헤드라인**: "ALL-TIME BEST"는 **현재 선택 난이도의 best_<diff>** 표시(셀렉터 변경 시
  갱신). 데일리 카드 무변경.
- `best_<diff>` 레코드는 기존 `{score,combo,date,mode}` 형태 유지(+의미상 difficulty는 키에 내재).

## 5. UI (메뉴 난이도 셀렉터)

- 메뉴(프리플레이 영역 근처)에 EASY/NORMAL/HARD 칩 3개. 선택 시 `setDifficulty(id)`:
  `recs.settings.nvDifficulty` 저장 + 헤드라인 베스트 갱신 + 칩 active 토글.
- `startGame('free')`는 선택 난이도로, `startGame('daily')`는 normal로 시작.
- 스타일은 기존 도색 셀렉터(`nv-hgr-coat`/`nv-ovh-paint`) 칩 패턴 재사용.

## 6. 불변식 / 테스트

- **rng-fairness**: 터렛 스폰·발사각·간격, 난이도 적용 모두 `s.rng()` (Math.random은 코스메틱만).
  rng-fairness-auditor 통과 목표.
- **단위 테스트(`node --test`)**: `DIFF` 테이블 존재/값, `freshState`가 difficulty별 knob 반영,
  데일리가 normal 강제, 터렛 스폰/발사 시드 결정성, 버킷 합 ≡ score 유지.
- **tripwire**: 시드 baseline 갱신(스폰 시퀀스 변경되므로 재기록 필요), React-free 유지.
- **store 테스트**: `saveBestFor/loadBestFor` 라운드트립 + 마이그레이션 idempotent.
- **README 점수표**: 터렛 격파 60 행 추가(score-sync-checker).
- **핫패스**: 터렛/텔레그래프/탄 루프 프레임당 무할당.

## 7. 구현 단계 (2단계, 순차)

- **Phase 1 — 난이도 시스템**: `DIFF` 테이블, `freshState(...,difficulty)`, 기존 스폰/보스/기뢰에
  knob 적용, 데일리 normal 강제, `nvDifficulty` 설정, 메뉴 셀렉터, store `best_<diff>` +
  마이그레이션, 헤드라인. (터렛 없이도 easy/normal/hard 체감.)
- **Phase 2 — 터렛 적**: `s.turrets[]`, 스폰(난이도 캡), 조준+텔레그래프 AI, 자동사격 타깃 포함,
  bullet 충돌/격파/드랍, 렌더(`enemyMid`+폴백), 점수 60 + README.

각 단계 독립 동작·테스트. Phase 1 머지 후 Phase 2 진행.

## 8. 대안 (기각)

- 난이도 점수 배수: 점수 코어/README/버킷 불변식 건드림 → 제외(자연 점수차 + 난이도별 보드로 충분).
- Hard 헐 2: cheap-death 느낌 → 제외.
- 분열체 적: 이번 범위 제외(터렛만).
