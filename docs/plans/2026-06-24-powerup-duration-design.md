# 파워업 지속시간 — 설계 (Sub-project C)

> 상위 맥락: "단조롭다" 분해의 마지막 조각. A(신규 적 4종)·B(에셋 박스/선명도) 완료 후 C.

**Goal:** 파워업 지속시간을 단일 출처로 통합하고, 더 길게/개별 재조정하며, 중복 획득 시 연장(캡)되도록 하고, HUD에 숫자 카운트다운을 추가한다.

## 현재 문제
지속시간이 **두 곳에 중복** — `game.js applyPow`(매직넘버 `s.fx.X2 = 7` 등)와 `main.js POWER_DUR`(line 66). 동기화 위험.

## 설계

### 1. 단일 출처 (DRY)
`game.js`에 `POWER_DURATION` 상수 추가하고 `G.POWER_DURATION`으로 노출. `main.js`는 자체 `POWER_DUR`를 삭제하고 `G.POWER_DURATION` 사용.

```js
const POWER_DURATION = { MAGNET: 9, SLOW: 6, X2: 9, BOOST: 8, SPREAD: 9 };
```

### 2. 신규 지속시간 (전반 ↑ + 개별 재조정)
MAGNET 7→9, SLOW 5→6, X2 7→9, BOOST 6→8, SPREAD 7→9. SHIELD(소모형)·TIME(즉시 +5s) 유지.

### 3. 중복 획득 시 연장/누적 (캡)
`applyPow`에서 덮어쓰기 → 가산:
```js
const DUR = POWER_DURATION[type];
s.fx[type] = Math.min(2 * DUR, s.fx[type] + DUR); // 남은 시간 + base, base의 2배에서 캡
```
SHIELD(`s.shield = true`)·TIME(`s.timeLeft += 5`)은 누적 대상 아님 — 유지.

### 4. HUD 숫자 카운트다운
`main.js`의 `chip(meta, secs, max)`에 올림 초 숫자 추가:
```js
'<span class="fx-num">' + Math.ceil(secs) + '</span>'
```
CSS `.fx-num` 추가(작은 모노 숫자). innerHTML 싱크 개수 불변(`hud-fx` 한 곳, 숫자는 강제 정수라 XSS 안전).

## 동기화
- README 파워업 표 지속시간 신규 값 + 누적 규칙 한 줄.

## 테스트
- `applyPow` 누적+캡(같은 파워업 2회 → 남은+base, 2×base 초과 안 함).
- `G.POWER_DURATION` 노출 및 값.
- 정적: main.js가 `G.POWER_DURATION` 사용(자체 POWER_DUR 중복 제거 핀).

## 범위 제외 (YAGNI)
효과 수치(자석 반경·SLOW 배율 등), 신규 파워업.
