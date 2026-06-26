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
  `${NV}/sprites.js`, `${NV}/meta.js`, `${NV}/medals.js`, `${NV}/foes.js`, `${NV}/elite.js`, `${NV}/game.js`, `${NV}/render.js`, `${NV}/main.js`];

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
  assert.deepEqual(order, ['store', 'audio', 'shell', 'sprites', 'meta', 'medals', 'foes', 'elite', 'game', 'render', 'main']);
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
  // creditsCollected (E1b cosmetic coin total) is output-only too
  assert.ok(!/creditsCollected\s*[*/%<>]/.test(game), 'creditsCollected not used in arithmetic/compare');
  assert.ok(!/(rng\(\)[^\n;]*creditsCollected)|(creditsCollected[^\n;]*rng\(\))/.test(game), 'creditsCollected not tied to rng');
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

test('companion drone (DRONE power-up) is wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/'DRONE'/.test(game) && /spawnDrones/.test(game), 'DRONE type + drone spawn');
  assert.ok(/nearestTarget/.test(game), 'drones target the nearest enemy');
  const render = read(`${NV}/render.js`);
  assert.ok(/drawDrone/.test(render) && /s\.drones/.test(render), 'drones drawn');
  const main = read(`${NV}/main.js`);
  assert.ok(/'BOOST', 'SPREAD', 'DRONE'/.test(main), 'DRONE badge in the HUD loop');
});

test('loot crates and tokens are rendered from atlas art', () => {
  const render = read(`${NV}/render.js`);
  assert.ok(/drawCrate/.test(render) && /s\.crates/.test(render), 'crates drawn');
  assert.ok(/drawToken/.test(render) && /s\.tokens/.test(render), 'tokens drawn');
  const spr = read(`${NV}/sprites.js`);
  for (const k of ['lootCrate', 'lootCanister', 'coin', 'lootChest']) assert.ok(new RegExp(k + ':\\s*\\{').test(spr), k);
});

test('world objects (E3): spawn portal + console objective are wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/spawnPortal/.test(game) && /s\.portals/.test(game), 'portal spawn + state array');
  assert.ok(/'console'/.test(game), 'console crate kind');
  const render = read(`${NV}/render.js`);
  assert.ok(/drawPortal/.test(render) && /s\.portals/.test(render), 'portals drawn');
  const spr = read(`${NV}/sprites.js`);
  for (const k of ['portal', 'lootConsole']) assert.ok(new RegExp(k + ':\\s*\\{').test(spr), k);
});

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

test('companion drones use two distinct atlas variants', () => {
  const sprD = read(`${NV}/sprites.js`);
  assert.ok(/drone2:\s*\{/.test(sprD), 'drone2 rect defined');
  const renderD = read(`${NV}/render.js`);
  assert.ok(/dr\.variant \? 'drone2' : 'drone'/.test(renderD), 'drawDrone picks the variant sprite');
});

test('boss heavy plasma orb (atlas orb projectile) is wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/plasmaT/.test(game) && /plasma: true/.test(game), 'boss plasma attack + flagged ebullet');
  const render = read(`${NV}/render.js`);
  assert.ok(/b\.plasma/.test(render) && /'plasmaOrb'/.test(render), 'plasma ebullets drawn as the orb sprite');
  const sprP = read(`${NV}/sprites.js`);
  assert.ok(/plasmaOrb:\s*\{/.test(sprP), 'plasmaOrb rect');
});

test('crystal large-gem value tier (section-7 gem) is wired', () => {
  const sprC = read(`${NV}/sprites.js`);
  assert.ok(/crystalLarge:\s*\{/.test(sprC), 'crystalLarge rect defined');
  const game = read(`${NV}/game.js`);
  assert.ok(/s\.rng\(\)\s*<\s*0\.22/.test(game), 'seeded ~22% big-gem roll');
  assert.ok(/c\.big \? 40 : 10/.test(game), 'big-gem flat value 40 vs 10');
  assert.ok(/flatBase \|\| 10/.test(game), 'crystal bucket splits on flatBase (correct attribution)');
  const render = read(`${NV}/render.js`);
  assert.ok(/c\.big \? 'crystalLarge'/.test(render), 'large gem renders the crystalLarge sprite');
});

test('BOMB screen-clear power is wired (rare gated drop)', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(!/POWER_TYPES = \[[^\]]*'BOMB'/.test(game), 'BOMB is NOT in the seeded bag');
  assert.match(game, /function spawnBomb/, 'spawnBomb helper present');
  assert.match(game, /s\.spawnT\.bomb/, 'BOMB rare timer present');
  assert.match(game, /BOMB:\s*\{[^}]*label: 'BOMB'/, 'BOMB meta present');
  assert.match(game, /function bombDetonate/, 'bombDetonate helper present');
  assert.match(game, /o\.type === 'BOMB'/, 'applyPow BOMB branch present');
  const durLine = game.match(/POWER_DURATION = \{[^}]*\}/)[0];
  assert.ok(!/BOMB/.test(durLine), 'BOMB absent from POWER_DURATION (instant)');
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /BOMB:\s*\{ x: 437/, 'BOMB badge icon rect present');
});

test('section-5 arena decor is wired (cosmetic, rng-free)', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /decoPanel:\s*\{/, 'decoPanel rect');
  assert.match(spr, /decoNode:\s*\{/, 'decoNode rect');
  assert.match(spr, /decoReadout:\s*\{/, 'decoReadout rect');
  const render = read(`${NV}/render.js`);
  assert.match(render, /const DECOR = \[/, 'DECOR layout const present');
  assert.match(render, /function drawDecor/, 'drawDecor function present');
  assert.match(render, /drawDecor\(ctx\)/, 'drawDecor called in the background pass');
  assert.ok(!/DECOR[\s\S]{0,400}Math\.random/.test(render), 'decor layout uses no Math.random (deterministic)');
});

test('boss orbital support cores are wired (deterministic)', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /bossCore:\s*\{/, 'bossCore rect');
  const game = read(`${NV}/game.js`);
  assert.match(game, /function updateBossCores/, 'updateBossCores helper present');
  assert.match(game, /bossCores: \[\]/, 'bossCores state array initialised');
  assert.match(game, /coresDeployed/, 'deploy guard present');
  const fn = game.match(/function updateBossCores[\s\S]*?\n  \}/)[0];
  assert.ok(!/s\.rng\(|Math\.random\(/.test(fn), 'updateBossCores uses no rng (deterministic)');
  const render = read(`${NV}/render.js`);
  assert.match(render, /function drawBossCore/, 'drawBossCore present');
});

test('difficulty surge scaling + free-play label are wired', () => {
  const game = read(`${NV}/game.js`);
  assert.match(game, /surgeMul: 0\.7/, 'easy surgeMul');
  assert.match(game, /surgeMul: 1\.4/, 'hard surgeMul');
  assert.match(game, /\(6 \+ 3 \* k\) \* s\.diff\.surgeMul/, 'buildSurges scales by surgeMul');
  const main = read(`${NV}/main.js`);
  assert.match(main, /free-sub/, 'FREE PLAY sub-label updated with difficulty');
  const html = read('index.html');
  assert.match(html, /id="neonvortex-free-sub"/, 'free-sub span id present');
});

test('foeCharger is re-tinted (not player-coloured) via cached canvas', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.match(spr, /FOE_TINTS\s*=/, 'FOE_TINTS map present');
  assert.match(spr, /foeCharger:\s*\{\s*tint:/, 'foeCharger has a tint def');
  assert.match(spr, /function foeTintCanvas/, 'foeTintCanvas builder present');
  assert.match(spr, /FOE_TINTS\[key\] \? foeTintCanvas\(key\)/, 'draw() applies the foe tint');
});

test('ui-kit arena art (reticle + game-state banners) is wired, cosmetic', () => {
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/ui-kit\.png/.test(spr) && /function drawUi/.test(spr), 'ui-kit sheet + drawUi helper');
  assert.ok(/globalCompositeOperation = 'lighter'/.test(spr), 'additive black-key blend (no matte box)');
  const render = read(`${NV}/render.js`);
  assert.ok(/drawUi\(ctx, 'reticle'/.test(render), 'reticle drawn on the auto-fire target');
  assert.ok(/'bWarning'/.test(render) && /'bBoss'/.test(render) && /'bClear'/.test(render), 'WARNING/BOSS/MISSION CLEAR banners');
  const game = read(`${NV}/game.js`);
  assert.ok(/s\.aimTarget = target/.test(game) && /s\.clearT = 2\.2/.test(game), 'aim target + clear timer set (display-only)');
});

test('1UP extra-life pickup (E6) is wired, rare + out of the bag', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/spawnOneUp/.test(game) && /'1UP'/.test(game), 'spawnOneUp + 1UP apply branch');
  assert.ok(!/POWER_TYPES = \[[^\]]*'1UP'/.test(game), '1UP is NOT in POWER_TYPES (stays out of the bag)');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/oneUp:\s*\{/.test(spr) && /'1UP':/.test(spr), 'oneUp rect + POWER_ICONS entry');
});

test('homing missile weapon (E4b) is wired', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/'MISSILE'/.test(game) && /homing/.test(game), 'MISSILE type + homing logic');
  assert.ok(/nearestTarget\(s, b\.x, b\.y/.test(game), 'missiles steer via nearestTarget');
  const render = read(`${NV}/render.js`);
  assert.ok(/b\.homing/.test(render) && /'missile'/.test(render), 'homing bullets drawn as missiles');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/missile:\s*\{/.test(spr), 'missile rect');
  const main = read(`${NV}/main.js`);
  assert.ok(/'SPREAD', 'DRONE', 'MISSILE'/.test(main), 'MISSILE HUD badge');
});

test('playfield cockpit frame (E5) is wired, cosmetic-only', () => {
  const render = read(`${NV}/render.js`);
  assert.ok(/function drawPlayfieldFrame/.test(render), 'frame draw routine');
  assert.ok(/drawPlayfieldFrame\(ctx\);/.test(render), 'frame pass in render()');
  const spr = read(`${NV}/sprites.js`);
  assert.ok(/frameCorner:\s*\{/.test(spr), 'frameCorner rect');
  // cosmetic: the frame body must not introduce gameplay randomness
  const start = render.indexOf('function drawPlayfieldFrame');
  const body = render.slice(start, render.indexOf('\n  function ', start + 1));
  assert.ok(!/Math\.random|s\.rng/.test(body), 'frame is deterministic (no rng)');
});

test('big kills spawn an atlas burst-sprite explosion flash (FX polish)', () => {
  const game = read(`${NV}/game.js`);
  assert.ok(/function blast\(/.test(game), 'game has a blast() helper');
  assert.ok(/blasts: \[\]/.test(game), 'state seeds a blasts array');
  const render = read(`${NV}/render.js`);
  assert.ok(/s\.blasts/.test(render), 'render iterates blasts');
  assert.ok(/SP\.draw\(ctx, 'burst'/.test(render), 'blasts blit the atlas burst sprite');
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
  for (const key of ['hullUpg1', 'hullUpg2', 'hullUpg3', 'hullUpg4']) {
    assert.ok(new RegExp(key + ':\\s*\\{').test(spr), `sprites atlas defines ${key}`);
  }
  assert.ok(/upg4:\s*'hullUpg4'/.test(spr), 'HULL_SKINS maps the 4th hull');
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
