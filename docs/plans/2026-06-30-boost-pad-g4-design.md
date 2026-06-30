# G4 — 부스트 패드 (Boost Pad) · 설계

> 상위 방향: `docs/plans/2026-06-29-full-asset-utilization-roadmap.md` (G4).
> 목표: 포탈 제거로 비워진 `sprite-atlas.png` 섹션3의 **텔레포터 화살표 + 링 노드**를
> **아군 부스트 패드**로 반영(텔레포트 아님). 게임에 없던 긍정적 바닥 오브젝트.

## 불변식 (반드시 준수)
- **포탈/텔레포트 재도입 금지.** 이 패드는 이동 없음 — 밟으면 버프만 준다.
- **데일리 공정성:** 스폰 위치·타이밍은 시드 `s.rng()`만. 버프는 결정적. `Math.random` 신규 0.
- **시드 스트림 시프트(예고됨):** 신규 `s.spawnT.pad` 타이머 + `spawnPad`의 `s.rng()` 소비가
  데일리 맵을 1회 버전 시프트. 깨진 시드핀은 타이머 강제로 재핀(값 추격 금지). 풀 스위트 필수.
- 60fps 핫패스: 캡 1, 상태 in-place, `SP.draw` + 벡터 폴백. balanced save/restore, 무할당.
- **점수 없음**(순수 버프) → README 점수표 동기화 불필요.

## 신규 아틀라스 rect (검증 완료; `sheet:'el'` 없음)
| 키 | x | y | w | h | 비고 |
|---|---|---|---|---|---|
| `padRing`  | 34  | 392 | 117 | 95 | 공중 링 노드 — 패드 바닥 |
| `padArrow` | 152 | 273 | 74  | 99 | 위 화살표 — armed 글리프 |

(섹션3 잔여 — 글라스튜브 보급 캡슐(620,269,54,105), 안테나/이미터 — 는 G4 범위 제외,
후속 G4b로 트래킹. 포탈 rect는 이미 제거됨.)

## 아키텍처 — `s.pads` (시드 스폰 + 바닥 트리거)
```
function spawnPad(s) {
  const x = 140 + s.rng() * (W - 280);
  const y = 130 + s.rng() * (H - 240);
  s.pads.push({ x, y, r: 30, life: 14, cd: 0, armed: true, phase: 0 });
}
```
업데이트(파워업 픽업 루프 부근, `p`=s.player 스코프 내):
```
s.spawnT.pad -= dt;
if (s.spawnT.pad <= 0) {
  s.spawnT.pad = 14 + s.rng() * 8;
  if (s.pads.length < 1) spawnPad(s);   // 캡 1, 모든 난이도(긍정 버프)
}
for (let i = s.pads.length - 1; i >= 0; i--) {
  const pd = s.pads[i];
  pd.phase += dt * 3; pd.life -= dt;
  if (pd.cd > 0) { pd.cd -= dt; if (pd.cd <= 0) pd.armed = true; }
  if (pd.armed && dist2(pd, p) < (pd.r + p.r) * (pd.r + p.r)) {
    s.fx.BOOST = Math.max(s.fx.BOOST, 4);   // 4s overdrive (속도+연사)
    pd.armed = false; pd.cd = 5;             // 5s 쿨다운 후 재무장
    wave(s, pd.x, pd.y, 70, '#7dff8a'); SY.audio.powerup();
  }
  if (pd.life <= 0) s.pads.splice(i, 1);
}
```
- `freshState`(151)에 `pads: []`, `spawnT`(163)에 `pad: 9` 추가.
- `dist2`는 game.js 기존 헬퍼. `wave`/`SY.audio.powerup`도 기존.

## 렌더 — `render.js` `drawPad(ctx, pd)`
- 바닥 링: `padRing`을 `pd.armed?1:0.4` 알파로(쿨다운 디밍). 미디코드 시 벡터 원 폴백.
- armed 글리프: `padArrow`를 패드 위쪽에 additive 펄스(`0.6+0.4*sin(phase*3)`).
- 호출: **엔티티보다 먼저(바닥)** — 배경/decor 직후, `s.waves` 부근(크리스털 전)에
  `for (const pd of s.pads) drawPad(ctx, pd);`.

## 테스트 — `test/unit/pad.test.mjs`
1. `padRing`/`padArrow` rect 존재 + `sheet` 태그 없음 + 좌표.
2. 시드 결정성: 같은 daily 시드 두 런 → 동일 패드 위치 트레이스(+ 비어있지 않음).
3. 부여: armed 패드를 플레이어 위에 두고 step → `s.fx.BOOST > 0`, `pd.armed===false`, `pd.cd>0`.
4. 쿨다운 재무장: 부여 후 ~5s step → `pd.armed===true` 다시.
5. 수명 제거: `pd.life`를 0 근처로 두고 step → `s.pads`에서 제거.
6. `static.test.mjs` 핀: game에 `spawnPad`/`s.pads`(시드), render에 `drawPad`/`padRing`.
- `Math.random` baseline 유지. 풀 스위트 후 깨진 시드핀 재핀.

## 검증/감사
- run-all: unit + E2E + 번들 해시-싱크 PASS.
- rng-fairness-auditor: 스폰 시드, 버프 결정적, Math.random 무추가 → PASS 기대.
- performance-analyzer: 캡1·무할당·balanced → PASS 기대.
- gallery: armed 패드(링+화살표 펄스) + 쿨다운(디밍) 육안.

## DoD
- 섹션3 링노드+화살표가 코드에서 참조·렌더됨. 데일리 맵 1회 버전 시프트(예고).
- 모든 테스트/감사 PASS, 깨진 시드핀 재핀. 잔여 섹션3(글라스튜브/안테나)는 G4b 후속.
