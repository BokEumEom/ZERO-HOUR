# 전리품 상자 & 보상 토큰 (경제/보상) — 설계 (E1)

> 상위 맥락: 사용자가 "아틀라스를 *자연스럽게* 풀 활용하는 게임"을 원함. 아틀라스
> 섹션 라벨 = 제작자가 의도한 시스템 목록. E1은 **섹션 7(CURRENCY/REWARD) + 섹션
> 3(INTERACTIVE/WORLD OBJECTS) 일부**를 흡수한다. 60초 데일리 런 코어·데일리
> 공정성은 유지하고 그 위에 얹는다.

**Goal:** 파괴 가능한 전리품 상자가 코인·젬 등급 보상 토큰을 떨구는 위험-보상
시스템을 추가해, 아틀라스의 통화/상자 아트를 자연스럽게 활용한다. 코인은 런 내
점수 토큰이며 평생 누적은 표시 전용(상점 없음).

## 1. 전리품 상자 (`s.crates`)
- 종류: `crate`(잠긴 상자)·`canister`(섹션 3), `chest`(보물상자, 섹션 7·희귀).
- 파괴형, **접촉 피해 없음** — 위협이 아니라 사격 시간을 투자하는 위험-보상.
  HP: crate 4 / canister 3 / chest 6 (바위 3보다 단단).
- 엔트리: `{ kind, x, y, r, hp, maxHp, flash, phase }`.
- **시드 스폰**(데일리 공정): 위치·종류·타이밍 전부 `s.rng()`. 캡 ≤2 (chest는
  별도 낮은 시드 확률로 등장). `s.spawnT.crate` 타이머.
- 파괴 시 → `spawnLoot(s, x, y, kind)` 가 보상 토큰 한 무더기 분출(개수·등급 시드).

## 2. 보상 토큰 (`s.tokens`, 크리스털과 유사 수집)
- 시각적으로 구별되는 **4등급**(원안의 5값에서 정제 — 크기변형은 그릴 때 스케일돼
  구별 안 되므로 색으로 등급화):
  | 토큰 | 스프라이트 | 점수 |
  |---|---|---|
  | 코인 | 골드 디스크(섹션 7 coin) | 15 |
  | teal 젬 | crystalTeal | 25 |
  | amber 젬 | crystalAmber | 50 |
  | purple 젬 | crystalBoss | 100 |
- 엔트리: `{ x, y, vx, vy, r, phase, tier }` (tier ∈ coin/teal/amber/purple).
- 자석(MAGNET) 적용. 수집 시 → `addScore(value, …, 'loot')` + 코인이면 코스메틱
  누적(§4). 크리스털 콤보와 별개(토큰은 콤보에 안 들어감 — 단순·명확).

## 3. 신규 `loot` 점수 버킷
- `freshState`의 `breakdown`에 `loot: 0` 추가. `addScore`의 bucket 분기에 `loot`
  추가. 결과 화면 브레이크다운 표시 + "합계=점수" 불변식 테스트에 `loot` 포함.

## 4. 보물상자 잭팟 + 코스메틱 누적
- `chest` 파괴 시 대량 토큰 분출(잭팟 연출 — 기존 `blast` 플래시 재사용).
- 런에서 모은 **코인 개수 총합** → 평생 `creditsCollected`(표시 전용). 기존
  `crystalsCollected`와 동일 규약: **시뮬·스폰·드롭·RNG·점수식에 절대 안 먹임**.
  결과/RECORDS/ACHIEVEMENTS에 표시. nvMeta 경로 사용.

## 5. 불변식
- 모든 상자 스폰·토큰 등급 분기 = `s.rng()` (rng-fairness-auditor 검증).
- `Math.random()`은 파티클 등 코스메틱만.
- 60fps 무할당(`s.crates`/`s.tokens` 배열·엔트리 재사용, 9-arg drawImage).
- React-free / vanilla. 점수 동기화(score-sync-checker, README 표).
- 코스메틱 `creditsCollected`는 출력 전용(static.test의 메타-불간섭 핀 확장).

## 6. 렌더 (render.js)
- `drawCrate(ctx, c)`: kind별 스프라이트(crate/canister/chest) + flash + 파괴 직전
  균열 연출. 디코드 전 벡터 폴백.
- `drawToken(ctx, t)`: tier별 스프라이트(coin/teal/amber/purple) + bob/회전.
- 렌더 순서: 상자는 바위와 함께(적 뒤), 토큰은 크리스털과 함께.
- **아틀라스 rect는 구현 계획에서 그리드로 추출**: crate/canister(섹션 3),
  chest/coin(섹션 7). teal/amber/purple 젬은 기존 키 재사용.

## 7. 단계 분할
- **E1a**: 상자(crate/canister) + 토큰(4등급) + 수집/점수/`loot` 버킷 + 렌더 +
  자동조준/탄 충돌 연동.
- **E1b**: 보물상자(chest) 잭팟 + 코스메틱 `creditsCollected` 누적 + RECORDS 표시.

## 8. 범위 제외 (YAGNI)
- 상점·영구 해금·런 중 즉서 업그레이드 (사용자가 점수토큰 방식 선택).
- 상자 접촉 피해/폭발 위험물(섹션 2 하자드는 별도 시스템).
- 콘솔·텔레포터·포탈(섹션 3 나머지는 별도 "월드 오브젝트" 시스템).

## 9. 테스트
- `test/unit/loot.test.mjs`: 상자 시드 스폰·캡, 파괴 시 토큰 분출(개수≥1, 등급
  시드 결정성), 토큰 수집 점수=등급값·`loot` 버킷 적립, 데일리 동일 시드→동일 상자/
  토큰 배치(공정성), chest 잭팟(E1b), `creditsCollected` 출력 전용(E1b).
- 정적: 렌더 핀(drawCrate/drawToken/s.crates/s.tokens), 메타-불간섭.
- 실행: `node --test 'test/unit/*.mjs'`.
