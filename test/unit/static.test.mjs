// Rubric #8 (core patterns), #9 (innerHTML injection surface),
// #11 (separation of concerns) — static source checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

const NV = 'js/games/neonvortex';
const CORE = ['js/store.js', 'js/audio.js', 'js/shell.js',
  `${NV}/sprites.js`, `${NV}/meta.js`, `${NV}/medals.js`, `${NV}/foes.js`, `${NV}/game.js`, `${NV}/render.js`, `${NV}/main.js`];

test('game core stays React-free', () => {
  for (const f of CORE) {
    assert.ok(!/\bReact(DOM)?\b/.test(read(f)), `${f} must not reference React`);
  }
});

test('all core modules attach to window.SY via IIFE pattern', () => {
  for (const f of CORE) {
    const src = read(f);
    assert.match(src, /\(function \(\) \{/, `${f}: IIFE`);
    assert.match(src, /window\.SY = window\.SY \|\| \{\}/, `${f}: SY namespace`);
  }
});

test('gameplay randomness in game.js uses s.rng; Math.random stays at the cosmetic baseline', () => {
  const src = read(`${NV}/game.js`);
  // Baseline: 14 pre-existing calls, all cosmetic (burst particles, boss-death
  // visuals/scatter, thrust exhaust) plus the free-play seed string. Any NEW
  // Math.random forces this test (and a fairness review) to be updated.
  const count = (src.match(/Math\.random\(\)/g) || []).length;
  assert.ok(count <= 14, `Math.random call count grew to ${count} (baseline 14) — daily fairness review required`);
  // the gameplay-critical drop/spawn decisions must be seeded
  assert.match(src, /drops = 4 \+ Math\.floor\(s\.rng\(\)/, 'rock crystal drops seeded');
  assert.match(src, /s\.rng\(\) < 0\.45/, 'powerup drop chance seeded');
  assert.match(src, /'free-' \+ Math\.random\(\)/, 'only free-play seed may use Math.random for seeding');
});

test('index.html keeps no inline <style> block (styles live in external sheets)', () => {
  const html = read('index.html');
  assert.ok(!/<style[\s>]/.test(html), 'no inline style block');
  assert.match(html, /<link rel="stylesheet" href="css\/tokens\.css">/);
  assert.match(html, /<link rel="stylesheet" href="css\/neonvortex\.css">/);
});

test('inline style= attributes do not grow (pre-existing baseline: 6)', () => {
  const count = (read('index.html').match(/ style="/g) || []).length;
  assert.ok(count <= 6, `inline style attribute count grew to ${count} — move new styles to css/neonvortex.css`);
});

test('sparkline stays out of render.js (render.js is game-canvas only)', () => {
  assert.ok(!read(`${NV}/render.js`).includes('over-spark'));
  assert.ok(read(`${NV}/main.js`).includes('over-spark'));
});

test('innerHTML sinks in main.js only receive fmt()/fixed-format values', () => {
  const src = read(`${NV}/main.js`);
  const sinkLines = src.split('\n').filter((l) => l.includes('.innerHTML'));
  // known sinks: fx badges, over-medals (reset + set), records-body, menu-week,
  // over-stats — all fed constants/fmt(); adding a new one forces a review here
  assert.equal(sinkLines.length, 6, `innerHTML sinks changed: ${JSON.stringify(sinkLines)}`);
  // the day-cell title only embeds d.date (toISOString slice) and a coerced number
  assert.match(src, /title="' \+ d\.date \+ \(d\.rec \? ' · ' \+ fmt\(Number\(d\.rec\.score\) \|\| 0\) : ''\)/);
});

test('script load order in index.html is store -> audio -> shell -> game modules', () => {
  const html = read('index.html');
  // match basenames regardless of folder (the game's modules live under js/games/neonvortex/)
  const order = [...html.matchAll(/<script src="js[^"]*\/([a-z-]+)\.js">/g)].map((m) => m[1]);
  // shell core, then the single game: sprites (atlas) -> meta -> medals -> game -> render -> main
  assert.deepEqual(order, ['store', 'audio', 'shell', 'sprites', 'meta', 'medals', 'foes', 'game', 'render', 'main']);
});

test('render.js reacts to surge state (telegraph + tint)', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('surgeWarnT'), 'render draws the surge telegraph');
  assert.ok(src.includes('inSurge'), 'render tints during a surge');
});

test('neonvortex design system is wired (css linked, tokens + utils present)', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="css\/neonvortex\.css">/, 'neonvortex.css linked');
  assert.ok(/family=Sora/.test(html) && /family=Space\+Mono/.test(html), 'Sora + Space Mono fonts loaded');
  const css = read('css/neonvortex.css');
  assert.match(css, /--nv-primary:\s*#00dbe7/, 'primary token');
  for (const cls of ['.nv-scanlines', '.nv-hexgrid', '.nv-segment', '.nv-glass', '.nv-chamfer']) {
    assert.ok(css.includes(cls), `utility ${cls} present`);
  }
});

test('no stale "ship" identifiers remain in the renamed game', () => {
  const html = read('index.html');
  assert.ok(!/js\/games\/ship\//.test(html), 'no js/games/ship path');
  assert.ok(!/css\/ship\.css/.test(html), 'no css/ship.css link');
  assert.ok(!/["'(]ship-/.test(html), 'no ship- DOM id prefix');
});

test('the single game boots straight into NEON VORTEX (no game-select hub)', () => {
  const html = read('index.html');
  assert.ok(!html.includes('id="screen-arcade"'), 'hub screen removed');
  assert.match(html, /class="game-title nv-logo"/, 'NEON VORTEX logo present');
  assert.ok(!/<span class="kicker">SHIP<\/span>/.test(html), 'no stale SHIP kicker');
  const css = read('css/neonvortex.css');
  assert.ok(!css.includes('#ship-'), 'no ship-scoped CSS selectors remain');
  assert.ok(css.includes('#neonvortex-screen-menu'), 'neonvortex menu scope present');
  const shell = read('js/shell.js');
  assert.match(shell, /SY\.shell\.enterGame\(\)/, 'shell boots directly into the registered game');
});

test('neonvortex meta stays cosmetic (lifetime/crystalsCollected never drive the sim)', () => {
  const game = read(`${NV}/game.js`);
  // crystalsCollected exists but is output-only: it must not appear in spawn counts,
  // drop probabilities, score math, or rng expressions.
  assert.ok(/crystalsCollected/.test(game), 'crystalsCollected counter present');
  assert.ok(!/crystalsCollected\s*[*/%<>]/.test(game), 'crystalsCollected not used in arithmetic/compare');
  assert.ok(!/(rng\(\)[^\n;]*crystalsCollected)|(crystalsCollected[^\n;]*rng\(\))/.test(game), 'crystalsCollected not tied to rng');
  // game.js must NOT read the persisted lifetime at all (that lives only in main.js display)
  assert.ok(!/lifetime/i.test(game), 'game.js never references lifetime');
  const main = read(`${NV}/main.js`);
  assert.ok(/nvMeta\.accumulateLifetime/.test(main), 'lifetime accumulation happens in main.js');
});

test('render.js drives the player hull via state frames', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('pickHullFrame'), 'drawPlayer must select a hull frame');
  assert.ok(/frame === 'shielded'/.test(src), 'shielded frame replaces the vector ring path');
});

test('render.js drawPow uses power-up badge sprites with conditional glyph', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('drawPowerIcon'), 'drawPow blits the badge sprite');
  assert.ok(/o\.type === 'X2' \|\| o\.type === 'SLOW' \|\| o\.type === 'TIME'/.test(src),
    'glyph kept only for the ambiguous power-up types');
});

test('main.js wires difficulty into start + per-difficulty best routing', () => {
  const src = read(`${NV}/main.js`);
  assert.ok(/G\.start\(mode, difficultyValue\(\)\)/.test(src), 'reallyStart passes selected difficulty');
  assert.ok(src.includes('saveBestFor'), 'onGameOver routes to per-difficulty best');
  assert.ok(src.includes('nvDifficulty'), 'difficulty persisted in settings');
});

test('menu has a difficulty selector wired to setDifficulty', () => {
  const html = read('index.html');
  assert.ok(html.includes('neonvortex-menu-difficulty'), 'selector markup present');
  const src = read(`${NV}/main.js`);
  assert.ok(src.includes('syncDifficultyChips'), 'chips synced to active difficulty');
});

test('render.js draws turrets', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('s.turrets'), 'turrets are rendered');
  assert.ok(/drawTurret/.test(src), 'has a drawTurret routine');
});

test('render.js draws new-archetype foes', () => {
  const src = read(`${NV}/render.js`);
  assert.ok(src.includes('s.foes'), 'foes are iterated for drawing');
  assert.ok(/drawFoe/.test(src), 'has a drawFoe routine');
});

test('crystals use context gem variants (surge amber, boss-drop purple)', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/crystalBoss:\s*\{/.test(spr), 'atlas defines the boss prize gem');
  const game = read(`${NV}/game.js`);
  assert.ok(/tier: 'boss'/.test(game), 'boss-kill crystals are tagged');
  const render = read(`${NV}/render.js`);
  assert.ok(/crystalBoss/.test(render) && /crystalAmber/.test(render), 'drawCrystal selects gem by tier/surge');
});

test('alternate hull skins are wired (atlas rects + selector + render override)', () => {
  const spr = read(`${NV}/sprites.js`);
  for (const key of ['hullUpg1', 'hullUpg2', 'hullUpg3']) {
    assert.ok(new RegExp(key + ':\\s*\\{').test(spr), `sprites atlas defines ${key}`);
  }
  assert.ok(/activeHullKey/.test(spr), 'sprites exposes activeHullKey');
  const main = read(`${NV}/main.js`);
  assert.ok(/NV_HULLS/.test(main) && /setHull/.test(main) && /nvHull/.test(main), 'hangar wires hull selection + persistence');
  const render = read(`${NV}/render.js`);
  assert.ok(/activeHullKey/.test(render), 'drawPlayer honors the active hull skin');
});

test('foes use dedicated atlas art (not tinted reuse of generic enemies)', () => {
  const spr = read(`${NV}/sprites.js`);
  for (const key of ['foeHunter', 'foeCharger', 'foeShield', 'foeLaser']) {
    assert.ok(new RegExp(key + ':\\s*\\{').test(spr), `sprites atlas defines ${key}`);
  }
  const render = read(`${NV}/render.js`);
  for (const key of ['foeHunter', 'foeCharger', 'foeShield', 'foeLaser']) {
    assert.ok(render.includes(`'${key}'`), `drawFoe blits ${key}`);
  }
});

test('main.js reads power-up durations from G.POWER_DURATION (no duplicate table)', () => {
  const src = read(`${NV}/main.js`);
  assert.ok(/G\.POWER_DURATION/.test(src), 'main.js uses the shared duration source');
  assert.ok(!/const POWER_DUR =/.test(src), 'no duplicate POWER_DUR table in main.js');
});

test('fx badge shows a numeric countdown', () => {
  const src = read(`${NV}/main.js`);
  assert.ok(/fx-num/.test(src), 'chip renders a numeric remaining-time element');
});

test('atlas URL carries a matching cache-bust version in index.html and sprites.js', () => {
  const html = read('index.html');
  const spr = read(`${NV}/sprites.js`);
  // preload link and the runtime image src must use the SAME versioned URL,
  // else the preload is wasted and a stale opaque atlas can persist in cache.
  const linkMatch = html.match(/href="assets\/sprite-atlas\.png\?v=(\d+)"/);
  const srcMatch = spr.match(/sheet\.src = 'assets\/sprite-atlas\.png\?v=(\d+)'/);
  assert.ok(linkMatch, 'index.html preloads a versioned atlas URL');
  assert.ok(srcMatch, 'sprites.js loads a versioned atlas URL');
  assert.equal(linkMatch[1], srcMatch[1], 'preload and runtime atlas versions match');
});

test('shell.js scales the canvas backing store by devicePixelRatio', () => {
  const src = read('js/shell.js');
  assert.ok(src.includes('devicePixelRatio'), 'shell reads devicePixelRatio');
  assert.match(src, /canvas\.width = SW \* dpr/, 'backing store width scaled by dpr');
  assert.match(src, /canvas\.style\.width = SW \+ /, 'CSS width pinned to logical size');
  assert.match(src, /ctx\.setTransform\(dpr, 0, 0, dpr, 0, 0\)/, 'context maps logical coords to backing store');
});
