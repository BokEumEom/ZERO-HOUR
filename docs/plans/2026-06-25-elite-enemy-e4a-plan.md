# 엘리트 「센티넬」 — 빔 스윕 미니보스 (E4a) — 설계 + 계획

> 아틀라스 섹션 6(BOSS/ELITE)을 자연 흡수. 60초 코어 유지, 데일리 공정.
> **이 문서는 기계적 구현용 — 모든 rect/앵커/코드 포함.** 브랜치 `feat/elite-enemy`.

**확정 rect:** eliteCore (1097,532,89,101) 육각 장갑 코어 · beam (1152,274,52,114, 기존).

**불변식:** 스폰 위치·빔 시작 방향(CW/CCW) = `s.rng()`. 빔 조준각은 보스 조준탄과
동일하게 플레이어를 향함(반응형, 공정). 텔레그래프/스윕/쿨다운 = 고정 상수.
새 Math.random 0개(베이스라인 14). 60fps 무할당. 점수표 동기화.

**결정 요약:** 빔 스윕 시그니처 / 필드 중반 1회 스크립트(전 난이도, duration>=40) /
보상 = 확정 파워업 + 250점 + 잭팟 루트(chest-tier).

---

## Task 1: elite.js 모듈 (sim)

**sprites.js** A{} (lootConsole 줄 뒤):
```javascript
    eliteCore:   { x: 1097, y: 532, w: 89, h: 101 }, // elite sentinel — hex armored core (beam emitter)
```

**신규 `js/games/neonvortex/elite.js`** (foes.js 패턴 — IIFE on SY, api 주입):
```javascript
// Neon Vortex — elite "Sentinel" mini-boss (beam-sweep). Pure simulation on the
// shared state `s`; rendering lives in render.js. Spawn position + beam sweep
// direction use s.rng() (daily fairness); aim tracks the player like the boss
// (reactive, fair). Math.random() is never used here.
(function () {
  const SY = (window.SY = window.SY || {});
  const W = 960, H = 600;
  const HP = 20, R = 30;
  const BEAM_LEN = 760, BEAM_HALF = 14;
  const T_TELE = 1.0, T_FIRE = 1.4, T_COOL = 2.0, SWEEP = Math.PI * 2 / 3; // 120°

  function edgePoint(s) {
    const edge = Math.floor(s.rng() * 4);
    if (edge === 0) return { x: s.rng() * W, y: -30 };
    if (edge === 1) return { x: W + 30, y: s.rng() * H };
    if (edge === 2) return { x: s.rng() * W, y: H + 30 };
    return { x: -30, y: s.rng() * H };
  }

  function spawn(s) {
    const ep = edgePoint(s);
    const hx = 220 + s.rng() * (W - 440);   // seeded hover anchor
    const hy = 130 + s.rng() * 150;          // upper-mid band
    s.elite = {
      x: ep.x, y: ep.y, hx, hy, r: R, hp: HP, maxHp: HP,
      state: 'enter', t: 0, flash: 0, phase: s.rng() * 6,
      beamA: 0, beamFrom: 0, beamTo: 0, beamDir: 1,
    };
    s.shake = Math.max(s.shake, 6);
    SY.audio.bossSpawn();
  }

  function startTelegraph(s, e) {
    e.state = 'telegraph'; e.t = T_TELE;
    const p = s.player;
    const aim = Math.atan2(p.y - e.y, p.x - e.x); // reactive aim (fair, like boss)
    e.beamDir = s.rng() < 0.5 ? 1 : -1;
    e.beamFrom = aim - e.beamDir * SWEEP / 2;
    e.beamTo = aim + e.beamDir * SWEEP / 2;
    e.beamA = e.beamFrom;
  }

  function hitPlayerByBeam(s, e, api) {
    const p = s.player;
    const dx = Math.cos(e.beamA), dy = Math.sin(e.beamA);
    const rx = p.x - e.x, ry = p.y - e.y;
    const proj = rx * dx + ry * dy;            // along the ray
    if (proj < 0 || proj > BEAM_LEN) return;
    const perp = Math.abs(rx * dy - ry * dx);  // perpendicular distance
    if (perp < BEAM_HALF + p.r) api.hurtPlayer(s, p.x, p.y);
  }

  function update(s, dt, slowMul, api) {
    const e = s.elite; if (!e) return;
    e.phase += dt * 3; if (e.flash > 0) e.flash -= dt;
    if (e.state === 'enter') {
      e.x += (e.hx - e.x) * Math.min(1, dt * 2.2);
      e.y += (e.hy - e.y) * Math.min(1, dt * 2.2);
      if (Math.abs(e.x - e.hx) < 4 && Math.abs(e.y - e.hy) < 4) startTelegraph(s, e);
      return;
    }
    e.x = e.hx + Math.sin(e.phase * 0.5) * 26; // gentle hover
    e.t -= dt * slowMul;
    if (e.state === 'telegraph') {
      if (e.t <= 0) { e.state = 'firing'; e.t = T_FIRE; e.beamA = e.beamFrom; SY.audio.shoot(); }
    } else if (e.state === 'firing') {
      const k = 1 - Math.max(0, e.t) / T_FIRE; // 0..1 sweep progress
      e.beamA = e.beamFrom + (e.beamTo - e.beamFrom) * k;
      hitPlayerByBeam(s, e, api);
      if (e.t <= 0) { e.state = 'cooldown'; e.t = T_COOL; }
    } else { // cooldown
      if (e.t <= 0) startTelegraph(s, e);
    }
  }

  // bullet collision + damage + death reward. Returns true if the bullet hit.
  function bulletHit(s, b, api) {
    const e = s.elite; if (!e || e.state === 'enter') return false;
    const dx = e.x - b.x, dy = e.y - b.y;
    if (dx * dx + dy * dy > (e.r + 4) * (e.r + 4)) return false;
    e.hp -= 1; e.flash = 0.08;
    api.burst(s, b.x, b.y, '#ff7ad1', 4, 120, 2);
    SY.audio.bossHit();
    if (e.hp <= 0) die(s, e, api);
    return true;
  }

  function die(s, e, api) {
    s.elite = null;
    api.addScore(s, 250, e.x, e.y, 'SENTINEL', 'destroy');
    api.blast(s, e.x, e.y, 150);
    api.wave(s, e.x, e.y, 180, '#ff7ad1');
    api.burst(s, e.x, e.y, '#ff7ad1', 40, 320, 3.5);
    api.spawnPow(s, e.x, e.y);            // guaranteed power-up
    api.spawnLoot(s, e.x, e.y, 'chest');  // jackpot loot burst (reuses E1)
    s.freeze = Math.max(s.freeze, 0.2);
    s.shake = Math.max(s.shake, 12);
    SY.audio.bossDown();
  }

  SY.nvElite = { spawn, update, bulletHit, HP };
})();
```

**index.html** — game.js 앞에 로드:
```html
  <script src="js/games/neonvortex/elite.js"></script>
```
(현재 foes.js(414) 다음, game.js(415) 앞 줄에 삽입.)

---

## Task 2: game.js 통합

**freshState** — `boss: null,` 줄 근처에 슬롯/스케줄 추가:
```javascript
      boss: null, bossDown: false, bossWarnT: 0,
      elite: null, eliteSpawned: false,
      eliteAt: (SURGE_WARMUP + (duration >= 40 ? duration - 20 : duration)) / 2,
```
(60초: (8+40)/2 = 24초. duration<40이면 트리거가 duration>=40 게이트로 어차피 스킵.)

**eliteApi** — foeApi 정의 근처에 추가(모두 game.js의 hoisted 선언):
```javascript
  const eliteApi = { hurtPlayer, addScore, spawnPow, spawnLoot, burst, wave, blast, floatText };
```

**spawnBoss** 함수 안 — 보스 등장 시 엘리트 후퇴(겹침 방지):
```javascript
    if (s.elite) s.elite = null; // sentinel retreats when the Core Warden arrives
```
(spawnBoss 본문 첫 줄 근처, `s.boss = {...}` 직전.)

**update()** — 보스 트리거(`if (!s.boss && ... s.timeLeft <= 20) spawnBoss(s);`) 근처에 추가:
```javascript
    if (!s.elite && !s.eliteSpawned && s.duration >= 40 && s.t >= s.eliteAt && s.timeLeft > 20) {
      s.eliteSpawned = true; SY.nvElite.spawn(s);
    }
    if (s.elite) SY.nvElite.update(s, dt, slowMul, eliteApi);
```
(SY.nvFoes.update 호출 근처/뒤에 두면 됨.)

**auto-fire cand** — 보스 push 근처:
```javascript
      if (s.elite && s.elite.state !== 'enter') cand.push(s.elite);
```

**nearestTarget probe** — 보스 probe 근처:
```javascript
    if (s.elite && s.elite.state !== 'enter') probe(s.elite);
```

**bullets vs things** — 보스 피격 블록(`if (!dead && s.boss && ...)`) 바로 뒤:
```javascript
      if (!dead && SY.nvElite.bulletHit(s, b, eliteApi)) dead = true;
```

---

## Task 3: render.js drawElite

**drawElite** (drawFoe 근처에 추가):
```javascript
  function drawBeamRay(ctx, x, y, a, len, w) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(255,90,158,0.22)'; ctx.fillRect(0, -w, len, w * 2);
    ctx.fillStyle = 'rgba(255,160,210,0.65)'; ctx.fillRect(0, -w * 0.4, len, w * 0.8);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, -2, len, 4);
    ctx.restore();
  }

  function drawElite(ctx, e) {
    // telegraph warning ray (dashed, pulsing)
    if (e.state === 'telegraph') {
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(e.phase * 8);
      ctx.strokeStyle = '#ff5a9e'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + Math.cos(e.beamFrom) * 760, e.y + Math.sin(e.beamFrom) * 760);
      ctx.stroke(); ctx.restore();
    }
    // firing beam
    if (e.state === 'firing') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      drawBeamRay(ctx, e.x, e.y, e.beamA, 760, 26);
      SP.draw(ctx, 'beam', e.x + Math.cos(e.beamA) * 22, e.y + Math.sin(e.beamA) * 22, e.r * 1.6, e.beamA + Math.PI / 2); // emitter muzzle (beam sprite)
      ctx.restore();
    }
    // core body
    if (!SP.draw(ctx, 'eliteCore', e.x, e.y, (e.r + 8) * 2.2, e.phase * 0.05)) {
      ctx.save(); ctx.fillStyle = e.flash > 0 ? '#fff' : '#ff5a9e';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else if (e.flash > 0) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'eliteCore', e.x, e.y, (e.r + 8) * 2.2, e.phase * 0.05); ctx.restore();
    }
    // thin HP arc
    const f = Math.max(0, e.hp / e.maxHp);
    ctx.save(); ctx.strokeStyle = '#ff7ad1'; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
```

**render() 패스** — 보스 그리기 근처(또는 foes 뒤, player 앞)에:
```javascript
    if (s.elite) drawElite(ctx, s.elite);
```

---

## Task 4: 테스트 + 문서

**test/unit/elite.test.mjs** (신규):
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './helpers.mjs';

const boot = () => loadModules(
  ['js/store.js', 'js/games/neonvortex/foes.js', 'js/games/neonvortex/elite.js', 'js/games/neonvortex/game.js'],
  { nowIso: '2026-03-01T00:30:00Z' });
function play(G, diff = 'normal') {
  G.start('free', diff);
  for (let i = 0; i < 200 && G.phase !== 'playing'; i++) G.update(1 / 60);
  return G.state;
}

test('elite spawns once mid-run (~24s) on a 60s run, not before', () => {
  const G = boot().SY.nvGame; const s = play(G);
  for (let i = 0; i < 60 * 20; i++) G.update(1 / 60);   // ~20s
  assert.equal(s.elite, null, 'no elite before eliteAt');
  for (let i = 0; i < 60 * 8; i++) G.update(1 / 60);    // ~28s
  assert.ok(s.eliteSpawned, 'elite scheduled');
});

test('the beam sweep can hit the player on the ray', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.player.x = 480; s.player.y = 300; s.player.inv = 0; s.shield = false;
  s.elite = { x: 480, y: 120, hx: 480, hy: 120, r: 30, hp: 20, maxHp: 20, state: 'firing', t: 1.4, flash: 0, phase: 0, beamA: Math.PI / 2, beamFrom: Math.PI / 2, beamTo: Math.PI / 2, beamDir: 1 };
  const hp0 = s.player.hp;
  G.update(1 / 60);
  assert.ok(s.player.hp < hp0, 'beam damaged the player');
});

test('killing the elite drops a power-up + jackpot loot + big score, clears slot', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.elite = { x: 480, y: 200, hx: 480, hy: 200, r: 30, hp: 1, maxHp: 20, state: 'telegraph', t: 1, flash: 0, phase: 0, beamA: 0, beamFrom: 0, beamTo: 0, beamDir: 1 };
  s.pows = []; s.tokens = []; const sc0 = s.score;
  s.bullets = [{ x: 480, y: 200, vx: 0, vy: 0, life: 0.5 }];
  G.update(1 / 60);
  assert.equal(s.elite, null, 'elite cleared');
  assert.ok(s.score - sc0 >= 250, 'awarded >=250');
  assert.ok(s.pows.length >= 1, 'guaranteed power-up');
  assert.ok(s.tokens.length >= 1, 'jackpot loot burst');
});

test('the sentinel retreats when the boss arrives (no overlap)', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.elite = { x: 480, y: 200, hx: 480, hy: 200, r: 30, hp: 20, maxHp: 20, state: 'telegraph', t: 1, flash: 0, phase: 0, beamA: 0, beamFrom: 0, beamTo: 0, beamDir: 1 };
  s.timeLeft = 19.9; s.bossDown = false; s.boss = null;
  G.update(1 / 60);
  assert.ok(s.boss, 'boss spawned'); assert.equal(s.elite, null, 'elite retreated');
});

test('same daily seed + no input -> identical elite spawn (fairness)', () => {
  const run = () => {
    const G = boot().SY.nvGame; G.start('daily'); const st = G.state;
    for (let i = 0; i < 60 * 30; i++) G.update(1 / 60);
    const e = st.elite;
    return e ? [Math.round(e.x), Math.round(e.y), Math.round(e.hx), Math.round(e.hy), e.beamDir].join(',') : 'none';
  };
  assert.equal(run(), run());
});
```

**test/unit/static.test.mjs** 핀 (world-objects 핀 근처):
```javascript
test('elite sentinel (E4a) is wired', () => {
  const elite = read(`${NV}/elite.js`);
  assert.ok(/SY\.nvElite/.test(elite) && /function spawn/.test(elite), 'nvElite module + spawn');
  assert.ok(/beamA/.test(elite) && /hurtPlayer/.test(elite), 'beam sweep + player damage');
  const game = read(`${NV}/game.js`);
  assert.ok(/s\.elite/.test(game) && /nvElite\.update/.test(game), 'game drives the elite');
  const render = read(`${NV}/render.js`);
  assert.ok(/drawElite/.test(render), 'elite drawn');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/eliteCore:\s*\{/.test(spr), 'eliteCore rect');
});
```

**README.md** 점수표 — 콘솔 행 근처:
```
| 엘리트 센티넬(Sentinel) 격파 | 250 + 파워업 1개 + 잭팟 루트 드랍 (필드 중반 1회 등장, 빔 스윕) |
```

---

## 완료 후
- `node --test 'test/unit/*.mjs'` 3x 안정. rng-fairness-auditor(elite.js) + performance-analyzer(elite.js sim + drawElite).
- 사용자: /build-standalone + 모바일 검증. 다음: E4b(빔/무기 파워업) 또는 E5(환경/HUD).

## Self-Review
- 커버리지: 엔티티+상태머신+빔충돌+격파보상(T1), 트리거·타겟·피격디스패치·후퇴(T2), 렌더+빔+HP(T3), 테스트·문서(T4).
- 일관성: eliteCore/beam rect, s.elite, SY.nvElite.{spawn,update,bulletHit}, eliteApi 키가 elite/game/render/test에서 일치. spawnLoot('chest')·spawnPow는 기존 E1/파워업 재사용.
- 공정성: 스폰 위치·beamDir = s.rng; 조준각은 보스와 동일한 반응형(공정). 새 Math.random 없음. 빔충돌·drawBeamRay 무할당(상수 문자열, gradient 없음).
