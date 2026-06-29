# F4 — World Containers (Crystal Pod + Hazard Mimic) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two destructible container kinds to the crate system — `pod` (Crystal Pod → crystal cache) and `mimic` (Hazard Mimic → homing mines + consolation loot) — reflecting two unused section-3 atlas sprites. Seeded/daily-fair.

**Architecture:** Extend `spawnCrate` (kind roll), `CRATE_HP`, and the crate-break branch in `game.js`; add `capsulePod`/`xContainer` rects in `sprites.js` and map them in `render.js` `drawCrate`. Reuses existing helpers (`spawnMineAt`, `spawnLoot`, crystal push).

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors in a `vm` sandbox.

**Spec:** `docs/plans/2026-06-29-world-containers-f4-design.md`.

---

## File Structure

- `js/games/neonvortex/game.js` — `spawnCrate` roll + `CRATE_HP` + two new break branches.
- `js/games/neonvortex/sprites.js` — `capsulePod` / `xContainer` rects.
- `js/games/neonvortex/render.js` — `drawCrate` kind→key map.
- `test/unit/world.test.mjs` — pod/mimic break tests + rect pin.
- `README.md` — score-table rows. Verification: `/build-standalone`, E2E, gallery.

**Verified rects** (`sprite-atlas.png`, atlas sheet — no `sheet:'el'`):
`capsulePod` {195,390,76,82}, `xContainer` {563,390,87,82}.

---

## Task 1: New container kinds + break payoffs (game.js)

**Files:**
- Modify: `js/games/neonvortex/game.js`, `test/unit/world.test.mjs`

- [ ] **Step 1: Add the failing tests**

Append to `test/unit/world.test.mjs`:

```js
test('a crystal pod bursts a crystal cache (no mines) when destroyed', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'pod', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.crystals = [];
  s.spawnT.mine = 999; s.spawnT.crystal = 999; // suppress timer spawns so counts are clean
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'pod destroyed');
  assert.ok(s.crystals.length >= 6, 'crystal cache burst out');
  assert.equal(s.mines.length, 0, 'pod releases no mines');
});

test('a hazard mimic releases homing mines plus consolation loot', () => {
  const G = boot().SY.nvGame; const s = play(G);
  s.crates = [{ kind: 'mimic', x: 480, y: 300, r: 20, hp: 1, maxHp: 3, flash: 0, phase: 0 }];
  s.rocks = []; s.mines = []; s.boss = null; s.turrets = []; s.foes = []; s.bullets = []; s.tokens = [];
  s.spawnT.mine = 999; // suppress the timer mine so only the mimic's mines count
  s.bullets.push({ x: 480, y: 300, vx: 0, vy: 0, life: 0.5 });
  G.update(1 / 60);
  assert.equal(s.crates.length, 0, 'mimic destroyed');
  assert.ok(s.mines.length >= 2 && s.mines.length <= 3, 'released 2-3 homing mines');
  assert.ok(s.tokens.length >= 1, 'dropped consolation loot tokens');
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/world.test.mjs`
Expected: FAIL — `pod`/`mimic` fall through to the generic `spawnLoot` branch (no crystals/mines).

- [ ] **Step 3: Add pod/mimic to the spawn roll + CRATE_HP**

Find:

```js
  const CRATE_HP = { crate: 4, canister: 3, chest: 6, console: 5 };
```

Replace with:

```js
  const CRATE_HP = { crate: 4, canister: 3, chest: 6, console: 5, pod: 3, mimic: 3 };
```

Find:

```js
    const kind = r < 0.10 ? 'chest' : r < 0.26 ? 'console' : r < 0.63 ? 'crate' : 'canister';
```

Replace with:

```js
    const kind = r < 0.08 ? 'chest' : r < 0.20 ? 'console' : r < 0.34 ? 'pod' : r < 0.46 ? 'mimic' : r < 0.73 ? 'crate' : 'canister';
```

- [ ] **Step 4: Add the pod + mimic break branches**

Find:

```js
              pushToken(s, cr.x, cr.y, 'data'); // ...plus one guaranteed DATA salvage token (section-7 card)
            } else {
```

Replace with:

```js
              pushToken(s, cr.x, cr.y, 'data'); // ...plus one guaranteed DATA salvage token (section-7 card)
            } else if (cr.kind === 'pod') {
              // CRYSTAL POD (section-3 capsule) — a crystal cache bursts out
              addScore(s, 25, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 70);
              const n = 6 + Math.floor(s.rng() * 3);
              for (let k = 0; k < n; k++) {
                const a = s.rng() * Math.PI * 2, d = 10 + s.rng() * 30;
                s.crystals.push({ x: cr.x + Math.cos(a) * d, y: cr.y + Math.sin(a) * d, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, r: 7, phase: s.rng() * 6 });
              }
            } else if (cr.kind === 'mimic') {
              // HAZARD MIMIC (section-3 X-container) — looks like loot, bites back
              addScore(s, 35, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 80);
              const m = 2 + Math.floor(s.rng() * 2);
              for (let k = 0; k < m; k++) spawnMineAt(s, cr.x, cr.y);
              spawnLoot(s, cr.x, cr.y, 'crate'); // consolation loot offsets the risk
            } else {
```

- [ ] **Step 5: Run the new tests → expect PASS**

Run: `node --test test/unit/world.test.mjs`
Expected: PASS (pod + mimic tests, plus the existing portal/console tests).

- [ ] **Step 6: Run the full unit suite; re-pin any seed-shifted test**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS. The spawn-roll change shifts the daily seed stream, which MAY break a
seed-pinned probabilistic assertion. If one breaks, re-pin the established way (force the
relevant roll/timer to make the event deterministically reachable — do NOT weaken a
determinism assertion). Report exactly what (if anything) you re-pinned. If nothing breaks,
touch no other test.

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/world.test.mjs
git commit -m "feat: crystal pod + hazard mimic container kinds (reflect section-3 world objects)"
```

---

## Task 2: Atlas rects + render mapping

**Files:**
- Modify: `js/games/neonvortex/sprites.js`, `js/games/neonvortex/render.js`, `test/unit/world.test.mjs`

- [ ] **Step 1: Append the failing rect-pin test**

Append to `test/unit/world.test.mjs`:

```js
test('section-3 container sprites exist on the atlas (capsulePod/xContainer)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = { capsulePod: { x: 195, y: 390, w: 76, h: 82 }, xContainer: { x: 563, y: 390, w: 87, h: 82 } };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/world.test.mjs`
Expected: FAIL — `capsulePod`/`xContainer` not in `A`.

- [ ] **Step 3: Add the two atlas rects**

In `js/games/neonvortex/sprites.js`, find:

```js
    lootConsole: { x: 206,  y: 286, w: 96,  h: 74  }, // console objective — drops a power-up
```

Replace with:

```js
    lootConsole: { x: 206,  y: 286, w: 96,  h: 74  }, // console objective — drops a power-up
    capsulePod:  { x: 195,  y: 390, w: 76,  h: 82  }, // crystal pod container (section 3)
    xContainer:  { x: 563,  y: 390, w: 87,  h: 82  }, // hazard mimic container (section 3, X-marked)
```

- [ ] **Step 4: Map the new kinds in drawCrate (render.js)**

Find:

```js
    const key = c.kind === 'chest' ? 'lootChest' : c.kind === 'console' ? 'lootConsole' : c.kind === 'canister' ? 'lootCanister' : 'lootCrate';
```

Replace with:

```js
    const key = c.kind === 'chest' ? 'lootChest' : c.kind === 'console' ? 'lootConsole' : c.kind === 'pod' ? 'capsulePod' : c.kind === 'mimic' ? 'xContainer' : c.kind === 'canister' ? 'lootCanister' : 'lootCrate';
```

- [ ] **Step 5: Run the rect-pin test → expect PASS**

Run: `node --test test/unit/world.test.mjs`
Expected: all PASS.

- [ ] **Step 6: Run the full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/sprites.js js/games/neonvortex/render.js test/unit/world.test.mjs
git commit -m "feat: render crystal pod + hazard mimic with section-3 atlas art"
```

---

## Task 3: README + regenerate standalone + full gate + gallery

**Files:** `README.md`, `standalone.html` (regenerated; never hand-edited — a PreToolUse hook blocks edits).

- [ ] **Step 1: Add score rows to the README table**

In `README.md`, find:

```
| 콘솔(Console) 파괴 | 30 + 파워업 1개 + 데이터 살베지 1개 드랍 |
```

Replace with:

```
| 콘솔(Console) 파괴 | 30 + 파워업 1개 + 데이터 살베지 1개 드랍 |
| 크리스털 포드(Pod) 파괴 | 25 + 크리스털 캐시 분출 |
| 위험 컨테이너(Mimic) 파괴 | 35 + 호밍 지뢰 2~3기 방출 + 위로 루트 (X 표식 = 위험) |
```

- [ ] **Step 2: Regenerate the bundle + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html && node .claude/skills/build-standalone/build.mjs /tmp/c.html && cmp standalone.html /tmp/c.html && echo SYNC_OK`
Expected: `SYNC_OK`.

- [ ] **Step 3: Headless E2E**

Run: `bash test/e2e/run.sh`
Expected: all assertions pass.

- [ ] **Step 4: Gallery eyeball**

Run: `bash test/e2e/gallery.sh /tmp/sy-gallery`
If a crate/loot scene exists, confirm the pod (capsule) and mimic (X-container) render
distinctly. (Dev tool; if no headless browser or no such scene, note it and rely on Step 3 +
unit tests.)

- [ ] **Step 5: Commit**

```bash
git add README.md standalone.html
git commit -m "docs+chore: README pod/mimic score rows + regenerate standalone.html"
```

---

## Self-Review

- **Spec coverage:** pod kind + crystal cache (T1 S4), mimic kind + mines+loot (T1 S4), spawn
  roll + HP (T1 S3), atlas rects (T2 S3), render mapping (T2 S4), README score-sync (T3 S1),
  seeded/fairness + re-pin (T1 S6), standalone+E2E+gallery (T3). All spec sections mapped.
- **Placeholder scan:** none — every code step is verbatim with exact anchors.
- **Type consistency:** kinds `'pod'`/`'mimic'`, keys `capsulePod`/`xContainer`, HP 3/3,
  scores 25/35 used identically across game.js, render.js, README, and tests.
- **Test robustness:** `s.spawnT.mine`/`s.spawnT.crystal` forced high so timer spawns don't
  contaminate the pod "no mines" / mimic "2-3 mines" counts (avoids flakiness).
- **Fairness:** all new randomness via `s.rng()`; no new `Math.random()` → `static.test.mjs`
  baseline (14) untouched; stream-shift re-pin handled in T1 S6.
