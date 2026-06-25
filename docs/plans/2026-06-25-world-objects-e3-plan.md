# 월드 오브젝트 (스폰 포탈 + 콘솔 목표) — 설계 + 계획 (E3)

> 아틀라스 섹션 3을 흡수(E1이 crate/canister 사용; E3는 portal + console). 60초 코어
> 유지, 데일리 공정. **이 문서는 compact 후 기계적 구현용 — 모든 rect/앵커/코드 포함.**

**확정 rect:** portal (36,271,75,103) 청록 링 · console (206,286,96,74) 콘솔/모니터.

**불변식:** 포탈 위치/타이밍/스폰 = `s.rng()` (데일리 공정). Math.random 코스메틱만(베이스라인 14 유지). 60fps 무할당. 점수 동기화.

**전제:** 설계 승인됨(스폰 포탈 + 콘솔 보너스). 브랜치 `feat/world-objects`.

---

## E3a — 스폰 포탈 (`s.portals`)
포탈이 예고 후 열려 가까이 적(기뢰)을 토해낸 뒤 닫힘. "위협이 텔레그래프된 지점에서 차오름."

### Task 1: 포탈 엔티티 + 상태머신 + 스폰

**sprites.js** A{} (lootChest 줄 뒤):
```javascript
    portal:      { x: 36,  y: 271, w: 75, h: 103 }, // spawn portal ring
    lootConsole: { x: 206, y: 286, w: 96, h: 74  }, // console objective (drops a power-up)
```

**game.js** freshState: `drones: []` 줄에 `portals: [],` 추가; `spawnT`에 `portal: 14` 추가.

**game.js** — spawnCrate/TOKEN 근처에 헬퍼 추가:
```javascript
  function spawnPortal(s) {
    s.portals.push({ x: 120 + s.rng() * (W - 240), y: 110 + s.rng() * (H - 240),
      state: 'warn', t: 1.0, spawnT: 0, spawnsLeft: 4 + Math.floor(s.rng() * 3), phase: s.rng() * 6 });
  }
  // emit a homing mine AT a position (portal mouth) — reuses the mine entity
  function spawnMineAt(s, x, y) {
    s.mines.push({ x, y, r: 11, hp: 1, speed: (62 + s.t * 1.1) * s.diff.mineSpeedMul, phase: s.rng() * Math.PI * 2, flash: 0, vx: 0, vy: 0, entryT: 0 });
  }
```

**game.js** update — turret/crate 스폰 블록 근처에 포탈 스폰 + 상태머신:
```javascript
    s.spawnT.portal -= dt;
    if (s.spawnT.portal <= 0) {
      s.spawnT.portal = 16 + s.rng() * 8;
      if (s.portals.length < 1 && s.diff.spawnMul >= 1) spawnPortal(s); // normal/hard only
    }
    for (let i = s.portals.length - 1; i >= 0; i--) {
      const pt = s.portals[i];
      pt.phase += dt * 3; pt.t -= dt;
      if (pt.state === 'warn') {
        if (pt.t <= 0) { pt.state = 'open'; pt.t = 3.2; pt.spawnT = 0.2; }
      } else if (pt.state === 'open') {
        pt.spawnT -= dt;
        if (pt.spawnT <= 0 && pt.spawnsLeft > 0) { pt.spawnT = 0.55; pt.spawnsLeft--; spawnMineAt(s, pt.x, pt.y); }
        if (pt.t <= 0 || pt.spawnsLeft <= 0) { pt.state = 'closing'; pt.t = 0.6; }
      } else { // closing
        if (pt.t <= 0) { s.portals.splice(i, 1); }
      }
    }
```
(포탈 게이팅: `s.diff.spawnMul >= 1` → easy 제외, normal/hard만. 데일리=normal이라 등장.)

**render.js** drawPortal + 패스(기뢰 뒤, 적 앞 — 바위 패스 근처):
```javascript
  function drawPortal(ctx, pt) {
    const open = pt.state === 'open';
    const a = pt.state === 'warn' ? 0.35 + 0.25 * Math.sin(pt.phase * 6) : open ? 0.95 : 0.5;
    ctx.save(); ctx.globalAlpha = a;
    if (!SP.draw(ctx, 'portal', pt.x, pt.y, (open ? 78 : 60) + Math.sin(pt.phase) * 4, 0)) {
      ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 30, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
```
render() 의 `for (const r of s.rocks) drawRock(...)` 앞에 `for (const pt of s.portals) drawPortal(ctx, pt);`.

**test/unit/world.test.mjs** (신규):
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';
const boot = () => loadModules(['js/store.js','js/games/neonvortex/foes.js','js/games/neonvortex/game.js'], { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff='normal'){ G.start('free', diff); for(let i=0;i<200&&G.phase!=='playing';i++) G.update(1/60); return G.state; }

test('portals spawn on normal/hard and cycle warn->open->closing, emitting mines', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.portals = [{ x:480, y:300, state:'warn', t:1.0, spawnT:0, spawnsLeft:4, phase:0 }];
  s.mines = [];
  const seen = new Set();
  for (let i=0;i<60*6 && s.portals.length;i++){ G.update(1/60); if(s.portals[0]) seen.add(s.portals[0].state); }
  assert.ok(seen.has('open'), 'opened');
  assert.ok(s.mines.length > 0, 'portal emitted mines');
});

test('easy difficulty does not open portals', () => {
  const G = boot().SY.nvGame; const s = play(G, 'easy');
  for (let i=0;i<60*30;i++) G.update(1/60);
  assert.equal(s.portals.length, 0, 'no portals on easy');
});

test('same daily seed -> identical portal layout (fairness)', () => {
  const run=()=>{ const G=boot().SY.nvGame; G.start('daily'); const st=G.state; for(let i=0;i<60*30;i++) G.update(1/60); return JSON.stringify(st.portals.map(p=>[Math.round(p.x),Math.round(p.y),p.state])); };
  assert.equal(run(), run());
});
```

**static.test pin:** drawPortal/s.portals in render; spawnPortal in game.

---

## E3b — 콘솔 보너스 목표 (crate 시스템 재활용)
콘솔/패널이 등장 → 사격해 파괴 → **파워업 1개 + 보너스 점수**. E1 상자 파이프라인 재활용.

### Task 2: console crate-kind

**game.js** spawnCrate — kind 롤에 console 추가:
```javascript
    const r = s.rng();
    const kind = r < 0.10 ? 'chest' : r < 0.26 ? 'console' : r < 0.63 ? 'crate' : 'canister';
```
**game.js** CRATE_HP에 `console: 5` 추가; spawnCrate의 `r: kind === 'chest' ? 24 : 20` → 콘솔도 20(기본).

**game.js** crate 충돌 파괴 분기 — console면 loot 대신 파워업:
```javascript
          if (cr.kind === 'console') {
            addScore(s, 30, cr.x, cr.y, undefined, 'destroy');
            blast(s, cr.x, cr.y, 64);
            spawnPow(s, cr.x, cr.y);   // guaranteed power-up
          } else {
            addScore(s, cr.kind === 'chest' ? 40 : 20, cr.x, cr.y, undefined, 'destroy');
            blast(s, cr.x, cr.y, cr.kind === 'chest' ? 120 : 58);
            spawnLoot(s, cr.x, cr.y, cr.kind);
          }
          SY.audio.explode();
```
(기존 단일 분기를 위 if/else로 교체.)

**render.js** drawCrate — console kind:
```javascript
    const key = c.kind === 'chest' ? 'lootChest' : c.kind === 'console' ? 'lootConsole' : c.kind === 'canister' ? 'lootCanister' : 'lootCrate';
```

**world.test.mjs** 추가:
```javascript
test('a console drops a power-up (not loot tokens) when destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind:'console', x:480, y:300, r:20, hp:1, maxHp:5, flash:0, phase:0 }];
  s.rocks=[]; s.mines=[]; s.boss=null; s.turrets=[]; s.foes=[]; s.bullets=[]; s.tokens=[]; s.pows=[];
  s.bullets.push({ x:480, y:300, vx:0, vy:0, life:.5 }); G.update(1/60);
  assert.equal(s.crates.length, 0, 'console destroyed');
  assert.equal(s.tokens.length, 0, 'no loot tokens');
  assert.ok(s.pows.length >= 1, 'dropped a power-up');
});
```
**static.test pin:** lootConsole defined; drawCrate handles console.

**README:** 점수표에 `| 콘솔(Console) 파괴 | 30 + 파워업 1개 드랍 |` (chest 행 근처).

---

## 완료 후
- rng-fairness-auditor(portal/console), performance-analyzer. 전체 3x 안정.
- 사용자: /build-standalone + 검증. 다음: E4(엘리트 적 + 무기).

## Self-Review
- 커버리지: portal 엔티티+상태머신+스폰(T1), console crate-kind+파워업 드랍(T2).
- 일관성: portal/lootConsole rect, s.portals, spawnPortal/spawnMineAt, console kind가 game/render/test에서 일치. 콘솔은 crate 충돌 분기 재활용.
- 공정성: portal 위치/타이밍/spawnsLeft = s.rng; 콘솔 kind 롤 = s.rng. 새 Math.random 없음.
