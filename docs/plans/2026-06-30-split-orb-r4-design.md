# R4 — 분열 오브 적 (Splitter Orb) · 설계+계획

> 로드맵 잔여 R4. 섹션2 스파이크 오브를 **처치 시 분열하는 적**으로 반영: 큰 오브를 쏘면
> 작은 오브 2~3개로 갈라진다. rock 패턴 + 분열 메커니즘. 게임플레이·시드·**점수(README 동기화)**.

## 불변식
- 스폰/이동시드/분열 난수 전부 `s.rng()`. `Math.random` 신규 0(baseline 유지).
- 신규 시드 소비 → 데일리 맵 1회 버전 시프트(예고). 깨진 시드핀은 타이머 강제 재핀.
- **점수 추가** → README "점수 시스템" 표 + score-sync-checker 동기화 필수.
- 핫패스: 큰 오브 캡 2, 충돌 squared-distance, 무할당. blast는 G1 `fxBurstSm` 재사용.

## 신규 아틀라스 rect — `sprites.js` `A`
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `orbBig`   | 1134 | 147 | 51 | 53 | 부모 가시 오브(s2) |
| `orbSmall` | 1244 | 187 | 30 | 30 | 분열 자식 오브(s2) |

## 점수 (README 동기화 필수)
- `ORB_BIG = 30` (destroy 버킷), `ORB_SMALL = 15`. README 점수표에 "분열 오브 30 / 파편 오브 15" 행 추가.

## 아키텍처 — `s.orbs` (이동·분열 적; game.js 총알 루프 통합)
```
const ORB_BIG = 30, ORB_SMALL = 15;
function countOrbTier(s, tier) { let n = 0; for (const o of s.orbs) if (o.tier === tier) n++; return n; }
function spawnOrb(s) {
  const a = s.rng() * Math.PI * 2, sp = 40 + s.rng() * 30;
  s.orbs.push({ x: 90 + s.rng() * (W - 180), y: 80 + s.rng() * (H - 200),
    vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 18, hp: 3, maxHp: 3,
    tier: 'big', rot: s.rng() * 6, spin: (s.rng() - 0.5) * 1.2, flash: 0 });
}
function splitOrb(s, o) {
  const n = 2 + Math.floor(s.rng() * 2); // 2-3 children
  for (let k = 0; k < n; k++) {
    const a = s.rng() * Math.PI * 2, sp = 70 + s.rng() * 50;
    s.orbs.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: 10, hp: 1, maxHp: 1, tier: 'small', rot: s.rng() * 6, spin: (s.rng() - 0.5) * 1.8, flash: 0 });
  }
}
```
업데이트(모브/락 업데이트 부근, `p`=s.player):
```
s.spawnT.orb -= dt;
if (s.spawnT.orb <= 0) {
  s.spawnT.orb = 9 + s.rng() * 6;
  if (countOrbTier(s, 'big') < 2) spawnOrb(s);
}
for (let i = s.orbs.length - 1; i >= 0; i--) {
  const o = s.orbs[i];
  o.rot += o.spin * dt; if (o.flash > 0) o.flash -= dt;
  o.x += o.vx * dt; o.y += o.vy * dt;
  if (o.x < 30 || o.x > W - 30) { o.vx = -o.vx; o.x = Math.max(30, Math.min(W - 30, o.x)); }
  if (o.y < 40 || o.y > H - 40) { o.vy = -o.vy; o.y = Math.max(40, Math.min(H - 40, o.y)); }
  if (dist2(o, p) < (o.r + p.r) * (o.r + p.r)) hurtPlayer(s, o.x, o.y);
}
```
총알 충돌(게임.js 총알 루프, 락 분기 부근에 추가):
```
if (!dead) for (let j = s.orbs.length - 1; j >= 0; j--) {
  const o = s.orbs[j];
  if (dist2(b, o) < (o.r + 4) * (o.r + 4)) {
    o.hp -= 1; o.flash = 0.07; dead = true;
    burst(s, b.x, b.y, '#ff9ad0', 4, 110, 2);
    if (o.hp <= 0) {
      s.orbs.splice(j, 1);
      if (o.tier === 'big') { addScore(s, ORB_BIG, o.x, o.y, undefined, 'destroy'); blast(s, o.x, o.y, 56, 'fxBurstSm'); splitOrb(s, o); }
      else { addScore(s, ORB_SMALL, o.x, o.y, undefined, 'destroy'); blast(s, o.x, o.y, 40, 'fxBurstSm'); }
      SY.audio.explode();
    }
    break;
  }
}
```
- `freshState`에 `orbs: []`, `spawnT`에 `orb: 10` 추가. 모든 난이도(표준 적).
- 충돌은 squared-distance. 분열은 부모 1회만(자식은 small이라 재분열 없음).

## 렌더 — `render.js` `drawOrb(ctx, o)`
- `o.tier==='big'?'orbBig':'orbSmall'` 스프라이트, `o.rot` 회전, flash 시 화이트 틴트/추가 블릿.
- `SP.draw` 실패 시 벡터 원(핑크) 폴백. 호출: 엔티티 패스(락/모브 부근) `for (const o of s.orbs) drawOrb(ctx, o);`.

## 구현 단계 (subagent + 리뷰)
1. `orb.test.mjs`: rect 2종; 시드 결정성(동일 daily 트레이스, 비어있지 않음); big 처치 → small 2~3
   생성(분열); small 처치 → 분열 없음·점수; 접촉 데미지; 바운스(아레나 내 유지); easy도 스폰(표준 적).
2. sprites.js rect → game.js 엔티티/스폰/분열/업데이트/총알충돌 → render.js drawOrb → README 점수행 + static 핀.
3. 풀 스위트(깨진 시드핀 재핀) + 번들 재생성 + 해시-싱크.

## 검증/감사
- run-all PASS. **score-sync-checker**(README↔game.js 점수) + rng-fairness + performance 감사.
- gallery 스크린샷: big 오브 + 분열된 small 오브 육안.

## DoD
- 섹션2 스파이크 오브(big/small)가 코드에서 참조·렌더됨. 점수 README 동기화. 데일리 1회 시프트.
- 모든 테스트/감사 PASS. 잔여(파편 730,159 등)는 최종 스윕.
