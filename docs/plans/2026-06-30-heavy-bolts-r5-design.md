# R5 — 헤비 투사체 변형 (Heavy Projectile Variants) · 설계+계획

> 로드맵 잔여 R5(마지막). 섹션4 핀 볼트 + 섹션6 핑크 랜스를 **조건부 투사체 스프라이트
> 변형**으로 반영. 게임은 자동발사라 차지샷 대신 **시각 변형**이 자연스러움. 거의 코스메틱.

## 불변식
- **게임플레이/공정성 무변경**: 탄 속도·데미지·스폰·난수 불변. `lance` 플래그는 코스메틱
  (`b.plasma` 선례와 동일). `Math.random`/`s.rng` 신규 0 → 데일리 스트림 불변(시드핀 무파손).
- 핫패스: `SP.draw` 스왑만(추가 할당 없음), 기존 폴백 유지.

## 신규 아틀라스 rect — `sprites.js` `A`
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `finnedBolt` | 870 | 271 | 35 | 105 | 시안 핀 볼트(s4) — BOOST 시 플레이어 탄 |
| `pinkLance`  | 878 | 538 | 78 | 96  | 핑크 랜스(s6) — 보스 조준 볼리 |

## 변경
### 1) finnedBolt — BOOST 중 플레이어 탄 (render-only)
`render.js` 플레이어 탄 루프(`for (const b of s.bullets)`, 일반 탄 분기): 키/크기를 BOOST로 분기.
```
const heavy = s.fx.BOOST > 0;
if (!SP.draw(ctx, heavy ? 'finnedBolt' : 'bulletTeal', b.x, b.y, heavy ? 24 : 18,
             Math.atan2(b.vy, b.vx) + Math.PI / 2)) { ...기존 벡터 폴백... }
```
(`s`는 drawAll 스코프에 있음. homing/missile 분기는 그대로.)

### 2) pinkLance — 보스 조준 볼리 (cosmetic flag + render)
`game.js` 보스 aimed volley push에 `lance: true` 추가(코스메틱; 탄 거동 불변):
```
s.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 235, vy: Math.sin(a) * 235, r: 5, lance: true });
```
`render.js` 적 탄 루프(`for (const b of s.ebullets)`): `b.plasma` 분기 다음에 `b.lance` 분기 추가:
```
if (b.lance) {
  if (!SP.draw(ctx, 'pinkLance', b.x, b.y, b.r * 5, Math.atan2(b.vy, b.vx) + Math.PI / 2)) {
    ...간단 벡터 폴백(원/선)...
  }
  continue;
}
```

## 구현 단계 (inline TDD)
1. `bolts.test.mjs`: finnedBolt/pinkLance rect 존재 + `sheet` 태그 없음 + 좌표. → RED/GREEN.
2. sprites.js rect 추가. 커밋.
3. render.js 두 스왑 + game.js volley `lance:true`. + static 핀(render에 finnedBolt가 `fx.BOOST`
   문맥, pinkLance가 `b.lance` 문맥; game volley에 `lance`). 풀 스위트 PASS. 커밋.
4. 번들 재생성 + 해시-싱크. 커밋.

## 검증/감사
- run-all PASS. rng-fairness 감사(거의 코스메틱; 신규 난수 0 확인) + perf(스왑만). gallery 스크린샷:
  BOOST 시 핀 볼트 + 보스 랜스 볼리 육안.

## DoD
- 섹션4 핀 볼트 + 섹션6 랜스가 코드에서 참조·렌더됨. 시드 스트림 불변(난수 미소비).
- 모든 테스트/감사 PASS. **이로써 sprite-atlas 잔여 핵심 스프라이트 소진(R1-R5 완료)** —
  남은 자투리(테스트튜브·브래킷·boss콘솔·안테나·glassTube·debris·red-corner)는 선택적 최종 데코 스윕.
