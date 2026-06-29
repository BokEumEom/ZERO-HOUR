# F3 — Wingman Squadron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the DRONE / WINGMAN power-up from 2 identical companions to a squadron of 6 visually-distinct wingmen, reflecting unused section-8 drone art. DPS-neutral and fully deterministic (no `s.rng()` / `Math.random()`).

**Architecture:** `game.js` `spawnDrones` loops to 6 (distinct `variant` 0..5) and the fire-cooldown reset rises 0.55→1.65 s so total shots/s is unchanged. `sprites.js` adds 4 new drone-variant atlas rects; `render.js` `drawDrone` maps `variant` → a 6-key array. The existing `drone.test.mjs` length assertions update from 2 to 6.

**Tech Stack:** Vanilla JS (`window.SY` IIFEs), Canvas 2D, `node --test` `.mjs` mirrors in a `vm` sandbox.

**Spec:** `docs/plans/2026-06-29-drone-squadron-f3-design.md`.

---

## File Structure

- `js/games/neonvortex/sprites.js` — 4 new rects: `droneV3`/`droneV4`/`droneV5`/`droneV6`.
- `js/games/neonvortex/render.js` — `DRONE_VARIANT_KEYS` array + `drawDrone` mapping.
- `js/games/neonvortex/game.js` — `spawnDrones` (6 drones); fire-cooldown reset 0.55→1.65.
- `test/unit/drone.test.mjs` — update length 2→6, add variant-distinct + cooldown-reset + rect-pin assertions.
- Verification only: `/build-standalone` regen, `test/e2e/run.sh`, `test/e2e/gallery.sh`.

**Verified rects** (`sprite-atlas.png`, atlas sheet — no `sheet:'el'`):
`droneV3` {44,1019,56,51}, `droneV4` {166,1022,64,43}, `droneV5` {660,1023,80,45}, `droneV6` {922,1017,89,54}.

---

## Task 1: Atlas rects + render mapping

**Files:**
- Modify: `js/games/neonvortex/sprites.js`, `js/games/neonvortex/render.js`
- Modify: `test/unit/drone.test.mjs` (append rect-pin test)

- [ ] **Step 1: Append the failing rect-pin test**

Add to the END of `test/unit/drone.test.mjs`:

```js
test('section-8 drone variants exist on the atlas (droneV3..droneV6)', () => {
  const A = loadModules(['js/games/neonvortex/sprites.js']).SY.nvSprites.atlas;
  const want = {
    droneV3: { x: 44, y: 1019, w: 56, h: 51 },
    droneV4: { x: 166, y: 1022, w: 64, h: 43 },
    droneV5: { x: 660, y: 1023, w: 80, h: 45 },
    droneV6: { x: 922, y: 1017, w: 89, h: 54 },
  };
  for (const [k, r] of Object.entries(want)) {
    assert.ok(A[k], `${k} rect exists`);
    assert.equal(A[k].sheet, undefined, `${k} stays on the atlas (no sheet tag)`);
    assert.deepEqual({ x: A[k].x, y: A[k].y, w: A[k].w, h: A[k].h }, r, `${k} rect`);
  }
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/drone.test.mjs`
Expected: FAIL — `droneV3..droneV6` not in `A`.

- [ ] **Step 3: Add the 4 atlas rects (sprites.js)**

Find:

```js
    drone2:      { x: 1326, y: 1023, w: 84, h: 44 }, // 2nd companion drone variant (winged core, section 8)
```

Replace with:

```js
    drone2:      { x: 1326, y: 1023, w: 84, h: 44 }, // 2nd companion drone variant (winged core, section 8)
    droneV3:     { x: 44,   y: 1019, w: 56, h: 51 }, // squadron wingman — spiked diamond (section 8)
    droneV4:     { x: 166,  y: 1022, w: 64, h: 43 }, // squadron wingman — orbital ring (section 8)
    droneV5:     { x: 660,  y: 1023, w: 80, h: 45 }, // squadron wingman — winged (section 8)
    droneV6:     { x: 922,  y: 1017, w: 89, h: 54 }, // squadron wingman — feathered wings (section 8)
```

- [ ] **Step 4: Map variant → sprite in drawDrone (render.js)**

Find:

```js
  function drawDrone(ctx, dr) {
    const key = dr.variant ? 'drone2' : 'drone'; // two companions use distinct atlas art
    if (!SP.draw(ctx, key, dr.x, dr.y, dr.variant ? 30 : 26, dr.angle * 0.5)) {
```

Replace with:

```js
  // companion wingmen: each squadron slot uses a distinct atlas sprite by variant index.
  const DRONE_VARIANT_KEYS = ['drone', 'drone2', 'droneV3', 'droneV4', 'droneV5', 'droneV6'];
  function drawDrone(ctx, dr) {
    const key = DRONE_VARIANT_KEYS[dr.variant] || 'drone'; // squadron slot → distinct sprite
    if (!SP.draw(ctx, key, dr.x, dr.y, 28, dr.angle * 0.5)) {
```

(The rest of `drawDrone` — the vector-fallback block and closing braces — is unchanged.)

- [ ] **Step 5: Run the rect-pin test → expect PASS**

Run: `node --test test/unit/drone.test.mjs`
Expected: the new rect-pin test PASSES. (Two existing tests still assert `drones.length === 2` — they remain RED until Task 2; that is expected. Confirm ONLY the rect-pin test passes here.)

- [ ] **Step 6: Commit**

```bash
git add js/games/neonvortex/sprites.js js/games/neonvortex/render.js test/unit/drone.test.mjs
git commit -m "feat: add 4 section-8 drone-variant sprites + variant-indexed drawDrone"
```

---

## Task 2: Squadron of 6 + DPS-neutral fire rate

**Files:**
- Modify: `js/games/neonvortex/game.js`
- Modify: `test/unit/drone.test.mjs`

- [ ] **Step 1: Update the behaviour tests (RED first)**

In `test/unit/drone.test.mjs`, replace this test:

```js
test('the DRONE power-up spawns two orbiting drones and arms the timer', () => {
  const G = boot().SY.nvGame; const s = play(G);
  assert.equal(s.drones.length, 0);
  pickUp(G, s, 'DRONE');
  assert.equal(s.drones.length, 2, 'two drones deploy');
  assert.ok(s.fx.DRONE > 8.9, 'drone timer armed (~9)');
});
```

with:

```js
test('the DRONE power-up deploys a six-wingman squadron and arms the timer', () => {
  const G = boot().SY.nvGame; const s = play(G);
  assert.equal(s.drones.length, 0);
  pickUp(G, s, 'DRONE');
  assert.equal(s.drones.length, 6, 'six wingmen deploy');
  assert.equal(new Set(s.drones.map((d) => d.variant)).size, 6, 'six distinct variants');
  assert.ok(s.fx.DRONE > 8.9, 'drone timer armed (~9)');
});
```

Then in the auto-fire test, after the existing `assert.ok(s.bullets.length > 0, ...)` line, add a DPS-neutral cooldown assertion:

```js
  assert.equal(s.drones[0].fireCd, 1.65, 'fire cooldown resets to the DPS-neutral 1.65s');
```

Then replace this test:

```js
test('re-picking DRONE extends the timer without adding more drones', () => {
  const G = boot().SY.nvGame; const s = play(G);
  pickUp(G, s, 'DRONE');
  s.fx.DRONE = 3;
  pickUp(G, s, 'DRONE');
  assert.equal(s.drones.length, 2, 'still two drones');
  assert.ok(s.fx.DRONE > 11.9, 'timer extended (3 + 9)');
});
```

with:

```js
test('re-picking DRONE extends the timer without adding more drones', () => {
  const G = boot().SY.nvGame; const s = play(G);
  pickUp(G, s, 'DRONE');
  s.fx.DRONE = 3;
  pickUp(G, s, 'DRONE');
  assert.equal(s.drones.length, 6, 'still one squad of six');
  assert.ok(s.fx.DRONE > 11.9, 'timer extended (3 + 9)');
});
```

- [ ] **Step 2: Run → expect FAIL**

Run: `node --test test/unit/drone.test.mjs`
Expected: FAIL — squadron is still 2 and the cooldown still resets to 0.55.

- [ ] **Step 3: Spawn a squadron of 6 (game.js)**

Find:

```js
  // two companion wingman drones, evenly spaced (deterministic — no rng)
  function spawnDrones(s) {
    for (let i = 0; i < 2; i++) {
      s.drones.push({ angle: i * Math.PI, orbitR: 40, fireCd: 0.3 + i * 0.2, x: s.player.x, y: s.player.y, variant: i });
    }
  }
```

Replace with:

```js
  // a six-wingman squadron, evenly spaced (deterministic — no rng). Per-drone fire rate
  // is tuned (see the 1.65s reset below) so total DPS matches the old two-drone setup.
  const SQUADRON_SIZE = 6;
  function spawnDrones(s) {
    for (let i = 0; i < SQUADRON_SIZE; i++) {
      s.drones.push({
        angle: i * (Math.PI * 2 / SQUADRON_SIZE),
        orbitR: 46,
        fireCd: 1.65 * i / SQUADRON_SIZE, // staggered first shots
        x: s.player.x, y: s.player.y, variant: i,
      });
    }
  }
```

- [ ] **Step 4: Make the fire rate DPS-neutral (game.js)**

Find (inside the companion-drone update loop):

```js
          dr.fireCd = 0.55;
```

Replace with:

```js
          dr.fireCd = 1.65; // 6 drones @ 1.65s == old 2 drones @ 0.55s (DPS-neutral)
```

- [ ] **Step 5: Run the drone tests → expect PASS**

Run: `node --test test/unit/drone.test.mjs`
Expected: all PASS (squadron of 6, distinct variants, 1.65 reset, rect pin).

- [ ] **Step 6: Run the full unit suite**

Run: `node --test test/unit/*.test.mjs`
Expected: all PASS. (The change is deterministic — no seed-pinned test should shift. If one does, STOP and report; it would indicate an unexpected rng coupling.)

- [ ] **Step 7: Commit**

```bash
git add js/games/neonvortex/game.js test/unit/drone.test.mjs
git commit -m "feat: DRONE power-up deploys a 6-wingman squadron (DPS-neutral fire rate)"
```

---

## Task 3: README + regenerate standalone + full gate + gallery

**Files:** `README.md`, `standalone.html` (regenerated; never hand-edited — a PreToolUse hook blocks edits).

- [ ] **Step 1: Update the WINGMAN power-up note in README**

Find (README.md line ~102):

```
| `D` | WINGMAN | 컴패니언 드론 2기가 선회하며 자동 사격 | 9초 |
```

Replace with:

```
| `D` | WINGMAN | 컴패니언 윙맨 6기 편대가 선회하며 자동 사격 (총 화력은 동일) | 9초 |
```

- [ ] **Step 2: Regenerate the bundle + hash-sync**

Run: `node .claude/skills/build-standalone/build.mjs standalone.html && node .claude/skills/build-standalone/build.mjs /tmp/c.html && cmp standalone.html /tmp/c.html && echo SYNC_OK`
Expected: `SYNC_OK`.

- [ ] **Step 3: Headless E2E**

Run: `bash test/e2e/run.sh`
Expected: all assertions pass.

- [ ] **Step 4: Gallery eyeball**

Run: `bash test/e2e/gallery.sh /tmp/sy-gallery`
Open the gallery; if a DRONE-active scene exists, confirm 6 distinct wingmen orbit and read clearly at ~28 px. (Dev tool; if no headless browser or no drone scene, note it and rely on Step 3 + the unit tests.)

- [ ] **Step 5: Commit**

```bash
git add README.md standalone.html
git commit -m "docs+chore: README wingman squadron note + regenerate standalone.html"
```

---

## Self-Review

- **Spec coverage:** squadron of 6 (T2 S3), DPS-neutral 1.65 reset (T2 S4 + test), distinct variants 0..5 (T1 rects + T2 test), variant→sprite mapping (T1 S4), no-stacking single squad (T2 test), atlas rects (T1 S3), README (T3 S1), standalone+E2E+gallery (T3). All spec sections mapped.
- **Placeholder scan:** only the README line is described-not-quoted (the exact text is unknown until read); every code edit is verbatim. The README step explicitly says "read the section, make the minimal accurate edit."
- **Type consistency:** `variant` 0..5, `DRONE_VARIANT_KEYS` (6 entries), `SQUADRON_SIZE` 6, `orbitR` 46, `fireCd` reset 1.65 used consistently across game.js, render.js, and tests.
- **Fairness:** `spawnDrones` and the fire loop use no `s.rng()`/`Math.random()`, so the daily stream and the `static.test.mjs` baseline (14) are untouched — no re-pin expected (T2 S6 guards against surprises).
- **DPS math:** 6 / 1.65 = 3.636 ≈ 2 / 0.55 = 3.636 — held constant.
