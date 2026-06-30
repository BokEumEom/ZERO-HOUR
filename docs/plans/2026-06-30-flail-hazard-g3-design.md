# G3 — 스파이크 플레일(철퇴) 하자드 · 설계

> 상위 방향: `docs/plans/2026-06-29-full-asset-utilization-roadmap.md` (G3).
> 목표: `sprite-atlas.png` 섹션2의 **사슬 철퇴(flail)** 가시 볼 스프라이트를 새로운
> **텔레그래프 회전 하자드**로 반영한다. 게임에 없던 아키타입(궤도 스윕 회피).

## 불변식 (반드시 준수)
- **데일리 공정성:** 모든 스폰 파라미터(앵커 위치·사슬 길이·회전 방향·시작 각·타이밍)는
  시드 `s.rng()`만 사용. `Math.random` 신규 추가 0(baseline 14 유지).
- **시드 스트림 시프트(예고됨):** 신규 `s.spawnT.flail` 타이머 + `spawnFlail`의 `s.rng()`
  소비가 데일리 맵 스트림을 시프트한다 = 의도된 버전 변경. → **시드핀 테스트가 깨질 수
  있음**(world/loot/data-salvage 등 특정 시드 결과를 단언하는 것). LEARNINGS 원칙대로
  "타이머 강제(결정적 도달)"로 재핀하고 값 추격은 피한다. 풀 스위트 필수 실행.
- 60fps 핫패스: 캡 1, 상태 머신, 벡터 사슬 + `SP.draw` 볼. 점선 배열은 모듈 상수로
  호이스트(per-frame alloc 금지). balanced save/restore.
- 비파괴 하자드(총알 통과, 점수 없음) → README 점수표 동기화 불필요.

## 신규 아틀라스 rect (검증 완료; `sheet:'el'` 없음)
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `flailBall` | 835 | 64 | 46 | 54 | 가시 메이스 볼(핸들 없는 클린 컷) |

(섹션2 잔여 — 스파이크 오브 등급(843,156…), xNode 전기 테더(~1289,149), 파편(730,159) —
은 G3 범위 제외, 후속 G3b(분열 오브)/G3c(전기 테더)로 트래킹.)

## 아키텍처 — F5 레이저 펜스(`s.fences`)와 동일 패턴
새 리스트 `s.flails`. 각 flail은 고정 앵커 `(ax,ay)` 둘레를 사슬 길이 `len`만큼 떨어진
가시 볼이 각속도 `spin`으로 회전. 상태 머신 `warn`(예고) → `sweep`(가동) → `leave`(소멸).

```
function spawnFlail(s) {
  const ax = 120 + s.rng() * (W - 240);
  const ay = 90  + s.rng() * (H - 220);
  const len = 80 + s.rng() * 60;            // chain length
  const spin = (s.rng() < 0.5 ? -1 : 1) * 1.8; // signed angular speed (rad/s)
  const ang = s.rng() * Math.PI * 2;        // start angle
  s.flails.push({ ax, ay, len, ang, spin, ballR: 16, state: 'warn', t: 1.0, phase: 0 });
}
```

업데이트(펜스 미러, `game.js` 펜스 블록 바로 뒤):
```
s.spawnT.flail -= dt;
if (s.spawnT.flail <= 0) {
  s.spawnT.flail = 16 + s.rng() * 10;
  if (s.flails.length < 1 && s.diff.spawnMul >= 1) spawnFlail(s); // normal/hard only
}
for (let i = s.flails.length - 1; i >= 0; i--) {
  const fl = s.flails[i];
  fl.phase += dt * 3; fl.t -= dt;
  if (fl.state === 'warn') {
    if (fl.t <= 0) { fl.state = 'sweep'; fl.t = 4.5; SY.audio.shoot(); }
  } else if (fl.state === 'sweep') {
    fl.ang += fl.spin * dt;
    const bx = fl.ax + Math.cos(fl.ang) * fl.len, by = fl.ay + Math.sin(fl.ang) * fl.len;
    const dx = p.x - bx, dy = p.y - by;
    if (dx * dx + dy * dy < (fl.ballR + p.r) * (fl.ballR + p.r)) hurtPlayer(s, bx, by);
    if (fl.t <= 0) { fl.state = 'leave'; fl.t = 0.4; }
  } else { // leave
    if (fl.t <= 0) s.flails.splice(i, 1);
  }
}
```

- `warn` 동안 `ang` 고정 → 렌더가 휩쓰는 원(둘레)을 점선으로 보여줘 위험 구역 예고(공정).
- 접촉 데미지는 `sweep`에서 볼 1점 vs 플레이어. `hurtPlayer`가 i-frame/실드 처리.
- `freshState`(151줄)에 `flails: []`, `spawnT`(163줄)에 `flail: 13` 추가.

## 렌더 — `render.js` `drawFlail(ctx, fl)`
- `warn`: 점선 스윕 원(`FLAIL_DASH` 모듈 상수) + 펄스 알파.
- 항상: 벡터 사슬(앵커→볼) + 앵커 노드 점 + 볼 스프라이트 `flailBall` 회전(`fl.ang*2`).
- `SP.draw` 실패(미디코드) 시 벡터 원 폴백(다른 적과 동일 관례).
- 호출: `s.foes`/`s.fences` 그리는 부근(엔티티 패스)에 `for (const fl of s.flails) drawFlail(ctx, fl);`.

## 테스트 — `test/unit/flail.test.mjs`
1. `flailBall` rect 존재 + `sheet` 태그 없음 + 좌표(835,64,46,54).
2. `spawnFlail` 시드 결정성: 같은 시드 두 상태 → 동일 `ax/ay/len/spin/ang`.
3. 상태 전이: warn(t=1.0) → 충분히 step → sweep → leave → 리스트에서 제거.
4. 접촉 데미지: sweep 중 플레이어를 볼 위치에 놓고 `p.inv=0` → `hurtPlayer` 경로로
   `p.hp` 감소(또는 `tookDamage`=true).
5. 비파괴: 볼 위에 총알을 둬도 `s.flails` 길이 불변(충돌 루프에 미포함).
- `static.test.mjs`: `spawnFlail`/`s.flails` (game) + `drawFlail`/`flailBall` (render) 핀,
  rng-free 아님(시드 사용)이므로 "seeded" 성격만 확인. `Math.random` baseline 14 유지.
- **풀 스위트 실행** 후 깨진 시드핀 재핀(타이머 강제 방식).

## 검증/감사
- run-all: unit + E2E + 번들 해시-싱크 PASS.
- rng-fairness-auditor: 스폰 전부 `s.rng`, `Math.random` 무추가 → PASS 기대.
- performance-analyzer: 캡1·무할당·dash 상수 호이스트 → PASS 기대.
- gallery: warn 점선 원 + sweep 회전 볼 육안.

## DoD
- 섹션2 철퇴 볼 스프라이트가 코드에서 참조·렌더됨. 데일리 맵 1회 버전 시프트(예고).
- 모든 테스트/감사 PASS, 깨진 시드핀 재핀 완료. 잔여 섹션2(오브/xNode/파편)는 후속.
