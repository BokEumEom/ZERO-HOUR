// Rubric #8 (core patterns), #9 (innerHTML injection surface),
// #11 (separation of concerns) — static source checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(root, f), 'utf8');

const CORE = ['js/store.js', 'js/audio.js', 'js/game.js', 'js/render.js', 'js/main.js'];

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
  const src = read('js/game.js');
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

test('index.html keeps no inline <style> block (styles live in css/style.css)', () => {
  const html = read('index.html');
  assert.ok(!/<style[\s>]/.test(html), 'no inline style block');
  assert.match(html, /<link rel="stylesheet" href="css\/style\.css">/);
});

test('inline style= attributes do not grow (pre-existing baseline: 6)', () => {
  const count = (read('index.html').match(/ style="/g) || []).length;
  assert.ok(count <= 6, `inline style attribute count grew to ${count} — move new styles to css/style.css`);
});

test('sparkline stays out of render.js (render.js is game-canvas only)', () => {
  assert.ok(!read('js/render.js').includes('over-spark'));
  assert.ok(read('js/main.js').includes('over-spark'));
});

test('innerHTML sinks in main.js only receive fmt()/fixed-format values', () => {
  const src = read('js/main.js');
  const sinkLines = src.split('\n').filter((l) => l.includes('.innerHTML'));
  // exactly the three known sinks; adding a new one forces a review here
  assert.equal(sinkLines.length, 3, `innerHTML sinks changed: ${JSON.stringify(sinkLines)}`);
  // the day-cell title only embeds d.date (toISOString slice) and a coerced number
  assert.match(src, /title="' \+ d\.date \+ \(d\.rec \? ' · ' \+ fmt\(Number\(d\.rec\.score\) \|\| 0\) : ''\)/);
});

test('script load order in index.html is store -> audio -> game -> render -> main', () => {
  const html = read('index.html');
  const order = [...html.matchAll(/<script src="js\/([a-z-]+)\.js">/g)].map((m) => m[1]);
  assert.deepEqual(order, ['store', 'audio', 'game', 'render', 'main']);
});
