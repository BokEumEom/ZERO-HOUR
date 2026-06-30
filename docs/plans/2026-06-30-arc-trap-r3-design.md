# R3 — 전기 아크 트랩 (Electric Arc Trap) · 설계+계획

> 로드맵 잔여 R3. 섹션2 xNode(두 노드 + 십자 전기 아크)를 **정지형 전기 트랩**으로 반영:
> 텔레그래프 → 전기 활성(반경 접촉 데미지) → 휴지 → 재활성 반복. 펜스/패드 패턴 미러.
> 게임플레이·시드.

## 불변식
- 스폰 파라미터(위치/타이밍) 전부 `s.rng()`. `Math.random` 신규 0(baseline 유지).
- 신규 시드 소비 → 데일리 맵 1회 버전 시프트(예고). 깨진 시드핀은 타이머 강제 재핀.
- 캡 1, 노멀/하드(`s.diff.spawnMul>=1`). 비파괴, 점수 없음.
- 핫패스 무할당, balanced save/restore.

## 신규 아틀라스 rect — `sprites.js` `A`
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `arcNode` | 1289 | 149 | 140 | 84 | 두 노드 + 십자 전기 아크(s2) |

## 아키텍처 — `s.arcs` (정지 전기 트랩)
```
function spawnArc(s) {
  const x = 160 + s.rng() * (W - 320);
  const y = 120 + s.rng() * (H - 240);
  s.arcs.push({ x, y, r: 52, state: 'warn', t: 1.0, phase: 0, life: 13 });
}
```
업데이트(펜스/패드 부근, `p`=s.player 스코프):
```
s.spawnT.arc -= dt;
if (s.spawnT.arc <= 0) {
  s.spawnT.arc = 18 + s.rng() * 9;
  if (s.arcs.length < 1 && s.diff.spawnMul >= 1) spawnArc(s);
}
for (let i = s.arcs.length - 1; i >= 0; i--) {
  const ar = s.arcs[i];
  ar.phase += dt * 5; ar.t -= dt; ar.life -= dt;
  if (ar.state === 'warn') {
    if (ar.t <= 0) { ar.state = 'active'; ar.t = 1.3; SY.audio.shoot(); }
  } else if (ar.state === 'active') {
    const dx = p.x - ar.x, dy = p.y - ar.y;
    if (dx * dx + dy * dy < (ar.r + p.r) * (ar.r + p.r)) hurtPlayer(s, p.x, p.y);
    if (ar.t <= 0) { ar.state = 'idle'; ar.t = 2.4; }
  } else { // idle -> brief re-warn -> active again
    if (ar.t <= 0) { ar.state = 'warn'; ar.t = 0.8; }
  }
  if (ar.life <= 0) s.arcs.splice(i, 1);
}
```
- `freshState`에 `arcs: []`, `spawnT`에 `arc: 19` 추가.
- 접촉은 `active`에서만. warn(예고)·idle(꺼짐)은 무해 → 공정.

## 렌더 — `render.js` `drawArc(ctx, ar)`
- `warn`: 점선 원(반경 r) + 펄스(오렌지/핑크) 텔레그래프.
- `active`: `arcNode` 스프라이트 additive, 밝게 펄스(`0.7+0.3*sin(phase)`).
- `idle`: `arcNode` 저알파(0.3) 디밍.
- `SP.draw` 미디코드 시 벡터 원 폴백. 호출: 엔티티 패스(펜스/플레일/배리어 부근).

## 구현 단계 (inline TDD)
1. `arc.test.mjs`: rect 존재; 시드 결정성(동일 daily→동일 트레이스, 비어있지 않음);
   warn→active→idle 전이; active 중 중심 접촉 데미지 / 밖 무피해 / warn·idle 무피해;
   수명 후 제거; easy 미스폰. → RED/GREEN.
2. game.js 구현. 커밋.
3. render.js drawArc + 호출 + static 핀. 풀 스위트(깨진 시드핀 재핀). 커밋.
4. 번들 재생성 + 해시-싱크. 커밋.

## 검증/감사
- run-all PASS. rng-fairness + performance 감사 디스패치. gallery 스크린샷(warn/active/idle).

## DoD
- 섹션2 xNode가 코드에서 참조·렌더됨. 데일리 맵 1회 시프트(예고). 모든 테스트/감사 PASS.
- 잔여 섹션2(분열 오브=R4, 파편)는 후속.
