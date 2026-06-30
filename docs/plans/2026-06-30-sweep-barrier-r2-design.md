# R2 — 스위핑 위험 배리어 (Sweeping Hazard Barrier) · 설계+계획

> 로드맵 잔여 R2. 섹션5 오렌지 위험 스트라이프를 **텔레그래프 후 아레나를 가로질러
> 슬라이드하는 위험 바**로 반영. F5 펜스 패턴 미러(단, 이동형). 게임플레이·시드.

## 불변식
- 스폰 파라미터(방향/시작변/타이밍) 전부 `s.rng()`. `Math.random` 신규 0(baseline 유지).
- 신규 시드 소비 → 데일리 맵 1회 버전 시프트(예고). 깨진 시드핀은 타이머 강제로 재핀.
- 캡 1, 노멀/하드 전용(`s.diff.spawnMul>=1`). 비파괴, 점수 없음(README 동기화 불필요).
- 핫패스 무할당(대시 배열 호이스트 불필요 — 채움 rect + 소수 SP.draw), balanced save/restore.

## 신규 아틀라스 rect — `sprites.js` `A`
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `hazardStripe` | 363 | 523 | 69 | 79 | 오렌지 대각 위험 스트라이프(s5) |

## 아키텍처 — `s.barriers` (이동형 하자드)
```
function spawnBarrier(s) {
  const horiz = s.rng() < 0.5;       // 'h' = sweeps vertically (pos=y); 'v' = horizontally (pos=x)
  const fromStart = s.rng() < 0.5;   // which edge it starts from
  if (horiz) {
    s.barriers.push({ orient: 'h', pos: fromStart ? 70 : H - 70, half: 22,
      dir: fromStart ? 1 : -1, speed: 120, state: 'warn', t: 1.2, phase: 0 });
  } else {
    s.barriers.push({ orient: 'v', pos: fromStart ? 90 : W - 90, half: 22,
      dir: fromStart ? 1 : -1, speed: 200, state: 'warn', t: 1.2, phase: 0 });
  }
}
```
업데이트(펜스 미러; `p`=s.player 스코프 내, 펜스/플레일 블록 부근):
```
s.spawnT.barrier -= dt;
if (s.spawnT.barrier <= 0) {
  s.spawnT.barrier = 17 + s.rng() * 10;
  if (s.barriers.length < 1 && s.diff.spawnMul >= 1) spawnBarrier(s);
}
for (let i = s.barriers.length - 1; i >= 0; i--) {
  const ba = s.barriers[i];
  ba.phase += dt * 4;
  if (ba.state === 'warn') {
    ba.t -= dt;
    if (ba.t <= 0) { ba.state = 'sweep'; SY.audio.shoot(); }
  } else { // sweep
    ba.pos += ba.dir * ba.speed * dt;
    const perp = ba.orient === 'h' ? Math.abs(p.y - ba.pos) : Math.abs(p.x - ba.pos);
    if (perp < ba.half + p.r) hurtPlayer(s, p.x, p.y);
    const off = ba.orient === 'h' ? (ba.pos < -30 || ba.pos > H + 30)
                                  : (ba.pos < -30 || ba.pos > W + 30);
    if (off) s.barriers.splice(i, 1);
  }
}
```
- `freshState`에 `barriers: []`, `spawnT`에 `barrier: 15` 추가.
- warn 1.2초 동안 시작 엣지에 바 표시 → 플레이어가 회피 방향 인지(공정).

## 렌더 — `render.js` `drawBarrier(ctx, ba)`
- `warn`: 시작 위치에 점선 + 펄스(펜스 warn 스타일, 오렌지).
- `sweep`: 반투명 오렌지 채움 띠(`fillRect`, perp 두께 `half*2`, 길이축 전체) + `hazardStripe`
  스프라이트를 길이축 따라 ~140px 간격 타일(additive)로 위험 마킹.
- 호출: 엔티티 패스(펜스/플레일 부근) `for (const ba of s.barriers) drawBarrier(ctx, ba);`.

## 구현 단계 (inline TDD)
1. `barrier.test.mjs`: rect 존재; 시드 결정성(동일 daily → 동일 트레이스); warn→sweep 전이 +
   pos 이동; 라인 위 접촉 데미지 / 라인 밖 무피해; 오프스크린 제거; easy 미스폰. → RED/GREEN.
2. game.js 구현(freshState/spawnT/spawnBarrier/update). 커밋.
3. render.js drawBarrier + 호출 + static 핀. 풀 스위트(깨진 시드핀 재핀). 커밋.
4. 번들 재생성 + 해시-싱크. 커밋.

## 검증/감사
- run-all PASS. rng-fairness-auditor + performance-analyzer 디스패치(시드 게임플레이 게이트).
- gallery 스크린샷: warn 점선 + sweep 띠 육안.

## DoD
- 섹션5 위험 스트라이프가 코드에서 참조·렌더됨. 데일리 맵 1회 시프트(예고).
- 모든 테스트/감사 PASS, 스크린샷 양호. 잔여 섹션5(테스트튜브/브래킷/red-corner)는 후속 스윕.
