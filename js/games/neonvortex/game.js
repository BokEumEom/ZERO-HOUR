// Neon Vortex — core game engine (state + simulation). Rendering lives in render.js.
(function () {
  const SY = (window.SY = window.SY || {});

  const W = 960, H = 600;
  const POWER_TYPES = ['MAGNET', 'SHIELD', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'TIME', 'DRONE', 'MISSILE'];

  const POWER_META = {
    MAGNET: { glyph: 'M',  color: '#2de2c6', label: 'MAGNET' },
    SHIELD: { glyph: 'S',  color: '#5aa7ff', label: 'SHIELD' },
    SLOW:   { glyph: 'T',  color: '#b48bff', label: 'SLOW-MO' },
    X2:     { glyph: '×2', color: '#ffc34d', label: '×2 SCORE' },
    BOOST:  { glyph: '»',  color: '#7dff8a', label: 'BOOST' },
    SPREAD: { glyph: 'Ψ',  color: '#ff9a5a', label: 'SPREAD' },
    TIME:   { glyph: '+5', color: '#eaf6ff', label: '+5 SEC' },
    DRONE:  { glyph: 'D',  color: '#5ad1ff', label: 'WINGMAN' },
    MISSILE:{ glyph: '➤',  color: '#ff8a3a', label: 'MISSILES' },
    BOMB:   { glyph: '✸',  color: '#ff5a3a', label: 'BOMB' },     // instant screen-clear (no duration)
    '1UP':  { glyph: '♥',  color: '#ff5a78', label: 'EXTRA LIFE' }, // rare pickup — NOT in POWER_TYPES (out of the bag)
    INTEL:  { glyph: 'ⓘ',  color: '#5ad1ff', label: 'INTEL' },     // rare data-cache pickup — instant score (out of the bag)
  };

  // power-up active durations (seconds). Single source of truth — main.js reads
  // these via G.POWER_DURATION for the HUD timer bar/countdown. SHIELD is
  // consumable and TIME is instant, so neither has a duration here.
  const POWER_DURATION = { MAGNET: 9, SLOW: 6, X2: 9, BOOST: 8, SPREAD: 9, DRONE: 9, MISSILE: 8 };

  // ---- surge director tuning ----
  const SURGE_WARMUP = 8;     // calm intro before the first surge (s)
  const SURGE_GAP_DIV = 16;   // field seconds per surge (count = floor(fieldLen / this))
  const SURGE_DUR = 6;        // how long a surge stays "hot" (s)
  const SURGE_WARN = 1.2;     // telegraph lead time (s)
  const SURGE_PATTERNS = ['LINE', 'RING', 'PINCER'];

  // ---- HEAT multiplier tuning (checked high → low) ----
  const HEAT_X2_CAP = 4;      // ceiling on combined X2 × HEAT multiplier
  const FENCE_BEAM_HALF = 11; // half-width of the F5 laser-fence beam hitbox (px)
  const HEAT_TIERS = [ { at: 26, mul: 2 }, { at: 14, mul: 1.5 }, { at: 6, mul: 1.25 } ];

  // ---- difficulty tiers (fixed knobs; daily is always 'normal') ----
  // turretCap/turretFire are inert until Phase 2 (turret enemy).
  // *Mul knobs multiply onto base constants. bossFireMul multiplies the boss
  // fire-interval (burstT/aimT), so <1 = faster fire, >1 = slower.
  const DIFF = Object.freeze({
    easy:   Object.freeze({ turretCap: 0, turretFire: 2.6, spawnMul: 0.75, mineSpeedMul: 0.85, mineCap: 9,  surgeMul: 0.7, lootMul: 1.0, bossHpMul: 0.75, bossFireMul: 1.25, foes: Object.freeze({}) }),
    normal: Object.freeze({ turretCap: 2, turretFire: 2.6, spawnMul: 1.0,  mineSpeedMul: 1.0,  mineCap: 12, surgeMul: 1.0, lootMul: 1.0, bossHpMul: 1.0,  bossFireMul: 1.0,  foes: Object.freeze({ hunter: 2, charger: 1 }) }),
    hard:   Object.freeze({ turretCap: 3, turretFire: 1.9, spawnMul: 1.3,  mineSpeedMul: 1.2,  mineCap: 16, surgeMul: 1.4, lootMul: 1.0, bossHpMul: 1.33, bossFireMul: 0.8,  foes: Object.freeze({ hunter: 2, charger: 2, shield: 1, laser: 1 }) }),
  });

  // ---- per-run modifiers (layer on top of DIFF; score-neutral) ----
  // *Mul fields multiply the base knob; *Add fields add to a cap; foes replaces.
  const MOD_KEYS = ['standard', 'mineRush', 'ironWarden', 'treasure', 'vanguard'];
  const MODS = Object.freeze({
    standard:   Object.freeze({ nameKo: '기본', nameEn: 'STANDARD' }),
    mineRush:   Object.freeze({ nameKo: '기뢰 폭주', nameEn: 'MINE RUSH', surgeMul: 1.5, mineCapAdd: 6, mineSpeedMul: 1.1 }),
    ironWarden: Object.freeze({ nameKo: '강철 워든', nameEn: 'IRON WARDEN', bossHpMul: 1.4, bossFireMul: 0.85, lootMul: 1.4 }),
    treasure:   Object.freeze({ nameKo: '보물 항로', nameEn: 'TREASURE', lootMul: 1.8, spawnMul: 0.8 }),
    vanguard:   Object.freeze({ nameKo: '정예 전선', nameEn: 'VANGUARD', foes: Object.freeze({ hunter: 2, charger: 2, shield: 1, laser: 1 }), turretCapAdd: 1 }),
  });

  // Compose a base DIFF tier with a modifier → a new frozen DIFF-shaped object.
  function combineDiff(base, mod) {
    return Object.freeze({
      turretCap:    base.turretCap + (mod.turretCapAdd || 0),
      turretFire:   base.turretFire * (mod.turretFireMul || 1),
      spawnMul:     base.spawnMul * (mod.spawnMul || 1),
      mineSpeedMul: base.mineSpeedMul * (mod.mineSpeedMul || 1),
      mineCap:      base.mineCap + (mod.mineCapAdd || 0),
      surgeMul:     base.surgeMul * (mod.surgeMul || 1),
      lootMul:      base.lootMul * (mod.lootMul || 1),
      bossHpMul:    base.bossHpMul * (mod.bossHpMul || 1),
      bossFireMul:  base.bossFireMul * (mod.bossFireMul || 1),
      foes:         mod.foes || base.foes,
    });
  }

  // Pick a modifier key from a seeded RNG (uniform over MOD_KEYS).
  function pickModifier(rng) { return MOD_KEYS[Math.floor(rng() * MOD_KEYS.length)]; }

  // Resolve the modifier for a seed without starting a run (daily briefing preview).
  // Dedicated ':mod' sub-RNG: does NOT consume the gameplay stream → deterministic
  // worldwide and independent of spawn/drop randomness.
  function modifierFor(seedStr) {
    const key = pickModifier(SY.makeRng(seedStr + ':mod'));
    return { key, nameKo: MODS[key].nameKo, nameEn: MODS[key].nameEn };
  }

  function buildSurges(s) {
    const fieldEnd = s.duration >= 40 ? s.duration - 20 : s.duration; // boss owns the last 20s
    const fieldStart = SURGE_WARMUP;
    const fieldLen = fieldEnd - fieldStart;
    if (fieldLen <= 0) return [];
    const n = Math.max(1, Math.floor(fieldLen / SURGE_GAP_DIV));
    // seeded pattern bag (Fisher–Yates with s.rng — daily fairness)
    const bag = SURGE_PATTERNS.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(s.rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    const surges = [];
    for (let k = 1; k <= n; k++) {
      surges.push({
        at: fieldStart + fieldLen * (k / (n + 1)), // even spacing, margins both ends
        size: Math.max(1, Math.round((6 + 3 * k) * s.diff.surgeMul)),
        pattern: bag[(k - 1) % bag.length],
      });
    }
    return surges;
  }

  // tweakable knobs (written by tweaks UI)
  SY.tweaks = SY.tweaks || { duration: 60, spawnRate: 1.0, particles: 1.0, shake: 1.0 };
  SY.input = { ax: 0, ay: 0 }; // touch joystick axis, merged with keyboard

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  function resetKeys() { for (const k in keys) keys[k] = false; }

  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  const G = {
    W, H, POWER_META, POWER_DURATION, DIFF, MODS, MOD_KEYS,
    phase: 'menu', // menu | ready | playing | paused | over
    mode: 'daily',
    state: null,
    events: {}, // onGameOver(res), onReadySound...
  };
  SY.nvGame = G;
  G.combineDiff = combineDiff;
  G.previewModifier = modifierFor;

  function freshState(mode, seedStr, difficulty) {
    const rng = SY.makeRng(seedStr);
    const duration = Math.round(SY.tweaks.duration);
    const diffKey = DIFF[difficulty] ? difficulty : 'normal';
    const modifier = modifierFor(seedStr); // { key, nameKo, nameEn } — score-neutral
    const st = {
      rng, seedStr, mode, duration,
      difficulty: diffKey, diff: combineDiff(DIFF[diffKey], MODS[modifier.key]),
      modifier,
      t: 0,                       // elapsed sim time
      timeLeft: duration,
      readyT: 1.4,
      score: 0, combo: 0, maxCombo: 0, comboT: 0,
      pace: [0], paceSec: 0,
      player: { x: W / 2, y: H * 0.68, vx: 0, vy: 0, r: 13, hp: 3, inv: 0, fireCd: 0, angle: -Math.PI / 2, thrust: 0 },
      crystals: [], rocks: [], mines: [], bullets: [], ebullets: [], pows: [], turrets: [], foes: [], crates: [], tokens: [], drones: [], fences: [], flails: [], pads: [], barriers: [], arcs: [], orbs: [],
      parts: [], waves: [], floats: [], blasts: [], warps: [], slashes: [], debris: [],
      boss: null, bossDown: false, bossWarnT: 0, bossCores: [],
      elite: null, eliteSpawned: false,
      eliteAt: (SURGE_WARMUP + (duration >= 40 ? duration - 20 : duration)) / 2,
      fx: { MAGNET: 0, SLOW: 0, X2: 0, BOOST: 0, SPREAD: 0, DRONE: 0, MISSILE: 0 },
      aimTarget: null, // display-only: current auto-fire target (for the reticle)
      clearT: 0,       // display-only: MISSION CLEAR banner timer (set on boss-down)
      shield: false,
      freeze: 0, shake: 0,
      surges: [], surgeIdx: 0, surgeWarnT: 0, surgeActiveT: 0, inSurge: false,
      heat: 0, heatMul: 1,
      spawnT: { crystal: 0.4, rock: 1.5, mine: 3.2, pow: 6, turret: 5, crate: 6, fence: 11, flail: 13, pad: 9, oneup: 16, bomb: 18, intel: 17, barrier: 15, arc: 19, orb: 10 },
      powBag: [],
      lastWholeSec: duration,
      collected: 0,
      crystalsCollected: 0, // display-only (cosmetic meta); never read by the sim
      creditsCollected: 0,  // display-only (cosmetic meta — coins banked); never read by the sim
      breakdown: { crystals: 0, combo: 0, destruction: 0, boss: 0, heat: 0, loot: 0 },
      tookDamage: false, // for the NO HIT medal (shield blocks don't count as damage)
    };
    SY.nvFoes.initTimers(st);
    st.surges = buildSurges(st);
    return st;
  }

  function nextPowType(s) {
    if (s.powBag.length === 0) {
      const bag = POWER_TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(s.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      s.powBag = bag;
    }
    return s.powBag.pop();
  }

  // ---------- spawning ----------
  function spawnCrystalCluster(s) {
    const cx = 70 + s.rng() * (W - 140);
    const cy = 70 + s.rng() * (H - 140);
    const n = 4 + Math.floor(s.rng() * 3);
    // rare seeded large gem: ~22% of clusters contain one oversized high-value gem.
    const bigIdx = s.rng() < 0.22 ? Math.floor(s.rng() * n) : -1;
    for (let i = 0; i < n; i++) {
      const a = s.rng() * Math.PI * 2, d = s.rng() * 52;
      const big = i === bigIdx;
      s.crystals.push({
        x: Math.min(W - 20, Math.max(20, cx + Math.cos(a) * d)),
        y: Math.min(H - 20, Math.max(20, cy + Math.sin(a) * d)),
        vx: 0, vy: 0, r: big ? 12 : 7, phase: s.rng() * Math.PI * 2, big,
      });
    }
  }

  // stationary aimed-fire emplacement. Seeded position kept >=260px from the
  // player so it never spawns on top of them. Gameplay threat (no contact damage).
  function spawnTurret(s) {
    const p = s.player;
    let x = 0, y = 0, tries = 0;
    do {
      x = 90 + s.rng() * (W - 180);
      y = 80 + s.rng() * (H - 200);
      tries++;
    } while (((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y)) < 260 * 260 && tries < 8);
    // fireT staggers the first shot; scaled by turretFire so hard (1.9) fires
    // sooner than normal (2.6) — shorter post-spawn grace on higher difficulty.
    s.turrets.push({ x, y, r: 16, hp: 5, maxHp: 5, fireT: 1 + s.rng() * s.diff.turretFire, flash: 0, phase: s.rng() * Math.PI * 2 });
  }

  function spawnRock(s) {
    s.rocks.push({
      x: 90 + s.rng() * (W - 180),
      y: 80 + s.rng() * (H - 200),
      r: 22, hp: 3, maxHp: 3, rot: s.rng() * Math.PI * 2,
      spin: (s.rng() - 0.5) * 0.8, flash: 0,
    });
  }

  // ---- R4 splitter orb ----
  const ORB_BIG = 30, ORB_SMALL = 15;
  function countOrbTier(s, tier) { let n = 0; for (const o of s.orbs) if (o.tier === tier) n++; return n; }
  function spawnOrb(s) {
    const a = s.rng() * Math.PI * 2, sp = 40 + s.rng() * 30;
    s.orbs.push({ x: 90 + s.rng() * (W - 180), y: 80 + s.rng() * (H - 200),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 18, hp: 3, maxHp: 3,
      tier: 'big', rot: s.rng() * 6, spin: (s.rng() - 0.5) * 1.2, flash: 0 });
  }
  function splitOrb(s, o) {
    const n = 2 + Math.floor(s.rng() * 2); // 2-3 children
    for (let k = 0; k < n; k++) {
      const a = s.rng() * Math.PI * 2, sp = 70 + s.rng() * 50;
      s.orbs.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 10, hp: 1, maxHp: 1, tier: 'small', rot: s.rng() * 6, spin: (s.rng() - 0.5) * 1.8, flash: 0 });
    }
  }

  // ---- loot economy (E1) ----
  const TOKEN_VALUE = { coin: 15, teal: 25, amber: 50, purple: 100, data: 150, core: 250 };
  const CRATE_HP = { crate: 4, canister: 3, chest: 6, console: 5, pod: 3, mimic: 3 };
  function spawnCrate(s) {
    // seeded kind roll: chest 10% (jackpot) / console 16% (bonus objective) — both kept
    // at their original rates; pod 14% + mimic 12% are carved from crate/canister only.
    const r = s.rng();
    const kind = r < 0.10 ? 'chest' : r < 0.26 ? 'console' : r < 0.40 ? 'pod' : r < 0.52 ? 'mimic' : r < 0.76 ? 'crate' : 'canister';
    const hp = CRATE_HP[kind];
    s.crates.push({ kind, x: 90 + s.rng() * (W - 180), y: 80 + s.rng() * (H - 200), r: kind === 'chest' ? 24 : 20, hp, maxHp: hp, flash: 0, phase: s.rng() * 6 });
  }
  // Spawn one reward token of `tier` at (x,y) with seeded scatter. Premium DATA
  // SALVAGE (data/core) reads larger. rng order: angle, speed, phase.
  function pushToken(s, x, y, tier) {
    const a = s.rng() * Math.PI * 2, sp = 60 + s.rng() * 90;
    const r = tier === 'data' || tier === 'core' ? 10 : 8;
    s.tokens.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, phase: s.rng() * 6, tier });
  }
  function spawnLoot(s, x, y, kind) {
    const jackpot = kind === 'chest';
    const n = jackpot ? 7 + Math.floor(s.rng() * 4) : 3 + Math.floor(s.rng() * 3); // chest 7-10, else 3-5
    for (let i = 0; i < n; i++) {
      const roll = s.rng();
      // chest: core 5%, data 12%, coin 20%, teal 21%, amber 25%, purple 17%.
      // crates skew to coins and NEVER drop DATA SALVAGE (core/data).
      const tier = jackpot
        ? (roll < 0.05 ? 'core' : roll < 0.17 ? 'data' : roll < 0.37 ? 'coin' : roll < 0.58 ? 'teal' : roll < 0.83 ? 'amber' : 'purple')
        : (roll < 0.6 ? 'coin' : roll < 0.82 ? 'teal' : roll < 0.95 ? 'amber' : 'purple');
      pushToken(s, x, y, tier);
    }
  }

  // ---- F5 laser fence: telegraphed cross-arena beam (reflect sec3 node + sec2 laser) ----
  function spawnFence(s) {
    const orient = s.rng() < 0.5 ? 'h' : 'v';
    const pos = orient === 'h' ? 120 + s.rng() * (H - 240) : 120 + s.rng() * (W - 240);
    s.fences.push({ orient, pos, state: 'warn', t: 1.1, phase: 0 });
  }

  // ---- G3 spiked flail: a seeded tethered ball that sweeps an arc (sec-2 mace) ----
  function spawnFlail(s) {
    const ax = 120 + s.rng() * (W - 240);
    const ay = 90 + s.rng() * (H - 220);
    const len = 80 + s.rng() * 60;                  // chain length
    const spin = (s.rng() < 0.5 ? -1 : 1) * 1.8;    // signed angular speed (rad/s)
    const ang = s.rng() * Math.PI * 2;              // start angle
    s.flails.push({ ax, ay, len, ang, spin, ballR: 16, state: 'warn', t: 1.0, phase: 0 });
  }

  // ---- R2 sweeping hazard barrier: telegraphed bar that slides across the arena ----
  // orient 'h' sweeps vertically (pos=y tracks the bar's y); 'v' sweeps horizontally (pos=x).
  // Mirrors the F5 fence pattern but moves. Spawn/pos all seeded — daily fairness.
  function spawnBarrier(s) {
    const horiz = s.rng() < 0.5;     // 'h' = bar runs horizontally, sweeps top→bottom or reverse
    const fromStart = s.rng() < 0.5; // which edge it starts from
    if (horiz) {
      s.barriers.push({ orient: 'h', pos: fromStart ? 70 : H - 70, half: 22,
        dir: fromStart ? 1 : -1, speed: 120, state: 'warn', t: 1.2, phase: 0 });
    } else {
      s.barriers.push({ orient: 'v', pos: fromStart ? 90 : W - 90, half: 22,
        dir: fromStart ? 1 : -1, speed: 200, state: 'warn', t: 1.2, phase: 0 });
    }
  }

  // ---- R3 electric arc trap: stationary telegraphed area-denial hazard (sec-2 xNode) ----
  // Cycles warn(1s) → active(1.3s, contact damage in radius) → idle(2.4s) → re-warn → …
  // Non-destructible, no score. Spawns only on normal/hard (spawnMul>=1). Cap 1.
  function spawnArc(s) {
    const x = 160 + s.rng() * (W - 320);
    const y = 120 + s.rng() * (H - 240);
    s.arcs.push({ x, y, r: 52, state: 'warn', t: 1.0, phase: 0, life: 13 });
  }

  // ---- G4 boost pad: a seeded friendly floor object; overlap grants fx.BOOST ----
  function spawnPad(s) {
    const x = 140 + s.rng() * (W - 280);
    const y = 130 + s.rng() * (H - 240);
    s.pads.push({ x, y, r: 30, life: 14, cd: 0, armed: true, phase: 0 });
  }

  // emit a homing mine AT a position (the portal mouth) — reuses the mine entity
  function spawnMineAt(s, x, y) {
    s.mines.push({ x, y, r: 11, hp: 1, speed: (62 + s.t * 1.1) * s.diff.mineSpeedMul, phase: s.rng() * Math.PI * 2, flash: 0, vx: 0, vy: 0, entryT: 0 });
  }

  function spawnMine(s) {
    const edge = Math.floor(s.rng() * 4);
    let x, y;
    if (edge === 0) { x = s.rng() * W; y = -20; }
    else if (edge === 1) { x = W + 20; y = s.rng() * H; }
    else if (edge === 2) { x = s.rng() * W; y = H + 20; }
    else { x = -20; y = s.rng() * H; }
    // unified mine shape: vx/vy/entryT keep standard + formation mines monomorphic
    // (entryT: 0 → the entry branch is skipped, so standard mines home as before)
    s.mines.push({ x, y, r: 11, hp: 1, speed: (62 + s.t * 1.1) * s.diff.mineSpeedMul, phase: s.rng() * Math.PI * 2, flash: 0, vx: 0, vy: 0, entryT: 0 });
  }

  function pushFormMine(s, x, y, dx, dy, speed) {
    const d = Math.hypot(dx, dy) || 1;
    s.mines.push({
      x, y, r: 11, hp: 1, speed: (62 + s.t * 1.1) * s.diff.mineSpeedMul,
      phase: s.rng() * Math.PI * 2, flash: 0,
      vx: (dx / d) * speed, vy: (dy / d) * speed, entryT: 1.5,
    });
  }

  // choreographed mine entry — all randomness via s.rng (daily fairness)
  function spawnFormation(s, pattern, size) {
    const p = s.player;
    if (pattern === 'RING') {
      const R = 280, baseA = s.rng() * Math.PI * 2;
      // clamp outside the player hitbox (mine 11 + player 13 + 2) so a corner-hugging
      // player never takes an undodgeable hit the frame the ring spawns
      const PAD = 26;
      for (let i = 0; i < size; i++) {
        const a = baseA + (i / size) * Math.PI * 2;
        const x = Math.min(W - PAD, Math.max(PAD, p.x + Math.cos(a) * R));
        const y = Math.min(H - PAD, Math.max(PAD, p.y + Math.sin(a) * R));
        pushFormMine(s, x, y, p.x - x, p.y - y, 70); // converge inward
      }
    } else if (pattern === 'PINCER') {
      const flip = s.rng() < 0.5 ? 1 : 0;
      const half = Math.floor(size / 2) + 1;
      for (let i = 0; i < size; i++) {
        const side = (i + flip) % 2;            // alternate opposite edges
        const t = (Math.floor(i / 2) + 1) / half;
        const y = 60 + t * (H - 120);
        const x = side === 0 ? -20 : W + 20;
        pushFormMine(s, x, y, side === 0 ? 1 : -1, 0, 150);
      }
    } else { // LINE sweep
      const edge = Math.floor(s.rng() * 4); // 0 top, 1 right, 2 bottom, 3 left
      for (let i = 0; i < size; i++) {
        const t = (i + 1) / (size + 1);
        let x, y, vx, vy;
        if (edge === 0) { x = t * W; y = -20; vx = 0; vy = 1; }
        else if (edge === 2) { x = t * W; y = H + 20; vx = 0; vy = -1; }
        else if (edge === 1) { x = W + 20; y = t * H; vx = -1; vy = 0; }
        else { x = -20; y = t * H; vx = 1; vy = 0; }
        pushFormMine(s, x, y, vx, vy, 130);
      }
    }
  }

  function spawnPow(s, x, y) {
    const type = nextPowType(s);
    s.pows.push({
      x: x !== undefined ? x : 80 + s.rng() * (W - 160),
      y: y !== undefined ? y : 80 + s.rng() * (H - 160),
      type, r: 12, life: 9, phase: s.rng() * Math.PI * 2, vy: -30,
    });
  }

  // rare extra-life pickup (NOT in the seeded bag; spawned by its own gated roll)
  function spawnOneUp(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: '1UP', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }

  // rare screen-clear pickup (NOT in the seeded bag; spawned by its own gated roll)
  function spawnBomb(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: 'BOMB', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }
  // rare INTEL data-cache pickup (NOT in the seeded bag; its own gated roll) — instant score
  function spawnIntel(s) {
    s.pows.push({
      x: 80 + s.rng() * (W - 160), y: 80 + s.rng() * (H - 160),
      type: 'INTEL', r: 13, life: 11, phase: s.rng() * Math.PI * 2, vy: -20,
    });
  }

  function spawnBoss(s) {
    if (s.elite) s.elite = null; // sentinel retreats when the Core Warden arrives
    const bhp = Math.round(72 * s.diff.bossHpMul);
    const fm = s.diff.bossFireMul;
    // initial burst/aim delays (1.8/2.6) are shorter than the steady-state resets
    // (2.4/1.7) — a brief opening beat before the boss's first shots.
    s.boss = {
      x: W / 2, y: -90, ty: 128, r: 46, hp: bhp, maxHp: bhp,
      t: 0, burstT: 1.8 * fm, aimT: 2.6 * fm, plasmaT: 4 * fm, fireMul: fm, flash: 0, dying: 0, ringRot: 0, coresDeployed: false,
    };
    s.bossWarnT = 1.6;
    spawnWarp(s, W / 2, 128, 240); // warp-in ring at the boss's settle point
    s.shake = Math.max(s.shake, 7);
    SY.audio.bossSpawn();
  }

  // ---------- fx helpers ----------
  function burst(s, x, y, color, n, speed, size) {
    const cnt = Math.round(n * SY.tweaks.particles);
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      s.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        color, size: size * (0.5 + Math.random() * 0.8),
      });
    }
  }
  function wave(s, x, y, maxR, color) {
    s.waves.push({ x, y, r: 6, maxR, life: 1, color });
  }
  // explosion-sprite flash on a destruction event (cosmetic). `key` selects the
  // atlas sprite (default the teal `burst`); rot is position-derived (no Math.random).
  function blast(s, x, y, size, key) {
    s.blasts.push({ x, y, size, life: 1, rot: (x * 0.7 + y * 0.3) % (Math.PI * 2), key: key || 'burst' });
  }
  // warp-in ring on a boss/elite entrance (cosmetic; position-derived rot, no rng)
  function spawnWarp(s, x, y, maxSize) {
    s.warps.push({ x, y, maxSize, life: 1, rot: (x * 0.5 + y * 0.5) % (Math.PI * 2) });
  }
  // one-shot debris flash on a crate/rock break (cosmetic; position-derived rot)
  function spawnDebris(s, x, y) {
    s.debris.push({ x, y, life: 1, rot: (x * 0.3 + y * 0.7) % (Math.PI * 2) });
  }
  // directional slash on a charger dash (cosmetic; angle from the dash vector)
  function spawnSlash(s, x, y, angle) {
    s.slashes.push({ x, y, angle, life: 1 });
  }
  function floatText(s, x, y, text, color) {
    s.floats.push({ x, y, text, color, life: 1 });
  }
  function heatTier(s) {
    if (!s.inSurge) return 1;
    for (const t of HEAT_TIERS) if (s.heat >= t.at) return t.mul;
    return 1;
  }

  function addScore(s, base, x, y, label, bucket, flatBase) {
    const x2 = s.fx.X2 > 0 ? 2 : 1;
    const mul = Math.min(HEAT_X2_CAP, x2 * heatTier(s));
    const v = Math.round(base * mul);
    const vBase = Math.round(base * x2);      // value without the HEAT boost
    const heatBonus = v - vBase;              // isolated HEAT contribution
    s.score += v;
    if (bucket === 'crystal') {
      // flatBase is the gem's flat value (10 normal, 40 large); the remainder of
      // `base` is the player's combo increment. Splitting on flatBase keeps the
      // large gem's value attributed to crystals (not folded into the combo bucket).
      const combo = Math.round((base - (flatBase || 10)) * x2); // combo part keeps integer split
      s.breakdown.crystals += vBase - combo;
      s.breakdown.combo += combo;
    } else if (bucket === 'destroy') {
      s.breakdown.destruction += vBase;
    } else if (bucket === 'boss') {
      s.breakdown.boss += vBase;
    } else if (bucket === 'loot') {
      s.breakdown.loot += vBase;
    }
    s.breakdown.heat += heatBonus;
    if (x !== undefined) floatText(s, x, y, '+' + v + (label ? ' ' + label : ''), mul > 1 ? '#ffc34d' : '#9ff5e8');
  }

  // injected into SY.nvFoes so foes.js never imports game internals directly.
  // hurtPlayer/addScore/burst/wave/floatText are hoisted function declarations,
  // so referencing them in this literal before their definitions is safe.
  // seeded crystal drop (daily fairness) — used by shield/laser foe deaths
  function dropCrystals(s, x, y, n) {
    for (let k = 0; k < n; k++) {
      const a = s.rng() * Math.PI * 2;
      s.crystals.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: s.rng() * 6 });
    }
  }
  const foeApi = { hurtPlayer, addScore, burst, wave, floatText, dropCrystals, blast, spawnSlash };
  const eliteApi = { hurtPlayer, addScore, spawnPow, spawnLoot, burst, wave, blast, floatText, spawnWarp };

  // ---------- player damage ----------
  function hurtPlayer(s, x, y) {
    const p = s.player;
    if (p.inv > 0) return;
    if (s.shield) {
      s.shield = false;
      p.inv = 1.0;
      wave(s, p.x, p.y, 90, '#5aa7ff');
      burst(s, p.x, p.y, '#5aa7ff', 18, 220, 3);
      SY.audio.shieldPop();
      s.freeze = Math.max(s.freeze, 0.09);
      s.shake = Math.max(s.shake, 5);
      return;
    }
    p.hp -= 1;
    s.tookDamage = true; // a hull was actually lost (NO HIT medal forfeited)
    p.inv = 1.5;
    s.combo = 0; s.comboT = 0;
    s.heat = 0;
    s.freeze = Math.max(s.freeze, 0.18);
    s.shake = Math.max(s.shake, 11);
    wave(s, x, y, 70, '#ff5a78');
    burst(s, p.x, p.y, '#ff5a78', 26, 260, 3.5);
    SY.audio.hit();
    if (p.hp <= 0) endGame(s, 'down');
  }

  // ---------- boss ----------
  // Boss orbital support cores (section 6): deterministic orbit + slow reactive-aimed
  // fire + contact damage. No rng (mirrors spawnDrones) -> does not touch the seeded stream.
  function updateBossCores(s, dt, slowMul) {
    const b = s.boss;
    for (const c of s.bossCores) {
      if (c.flash > 0) c.flash -= dt;
      c.ang += dt * 1.1 * slowMul;
      c.x = b.x + Math.cos(c.ang) * c.orbitR;
      c.y = b.y + Math.sin(c.ang) * c.orbitR;
      c.fireT -= dt * slowMul;
      if (c.fireT <= 0) {
        c.fireT = 2.6;
        const a = Math.atan2(s.player.y - c.y, s.player.x - c.x);
        s.ebullets.push({ x: c.x, y: c.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 5 });
      }
      if (dist2(c, s.player) < (c.r + s.player.r) * (c.r + s.player.r)) hurtPlayer(s, s.player.x, s.player.y);
    }
  }

  function updateBoss(s, dt, slowMul) {
    const b = s.boss;
    b.t += dt;
    b.ringRot += dt * 0.9;
    if (b.flash > 0) b.flash -= dt;

    if (b.dying > 0) {
      b.dying -= dt;
      if (Math.random() < 0.4) burst(s, b.x + (Math.random() - 0.5) * 70, b.y + (Math.random() - 0.5) * 70, '#ffc34d', 6, 200, 3);
      if (b.dying <= 0) {
        // final detonation
        blast(s, b.x, b.y, 200, 'fxBurstLg'); blast(s, b.x + 40, b.y - 30, 130, 'fxBurstLg');
        wave(s, b.x, b.y, 320, '#ffc34d');
        wave(s, b.x, b.y, 220, '#2de2c6');
        burst(s, b.x, b.y, '#ffc34d', 60, 420, 4);
        burst(s, b.x, b.y, '#eaf6ff', 40, 320, 2.5);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 70;
          s.crystals.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: Math.random() * 6, tier: 'boss' }); // purple prize gem (cosmetic tier)
        }
        addScore(s, 1500, b.x, b.y, 'CORE WARDEN', 'boss');
        s.bossDown = true;
        s.clearT = 2.2; // MISSION CLEAR banner (display-only)
        s.boss = null;
        s.bossCores = []; // support cores die with the boss
        s.freeze = Math.max(s.freeze, 0.32);
        s.shake = Math.max(s.shake, 16);
        SY.audio.bossDown();
      }
      return;
    }

    // entrance
    if (b.y < b.ty) { b.y += dt * 90; if (b.y > b.ty) b.y = b.ty; return; }
    // deploy 2 orbiting support cores once the boss is in position (deterministic)
    if (!b.coresDeployed) {
      b.coresDeployed = true;
      for (let i = 0; i < 2; i++) s.bossCores.push({ ang: i * Math.PI, orbitR: 96, hp: 6, maxHp: 6, fireT: 1.5 + i * 0.9, flash: 0, x: b.x, y: b.y, r: 16 });
    }
    // sway
    b.x = W / 2 + Math.sin(b.t * 0.55) * (W * 0.27);
    b.y = b.ty + Math.sin(b.t * 1.1) * 16;
    updateBossCores(s, dt, slowMul); // after sway so cores track the boss's current position

    // radial burst
    b.burstT -= dt * slowMul;
    if (b.burstT <= 0) {
      b.burstT = 2.4 * b.fireMul; // fireMul < 1 → shorter interval → faster fire
      const n = 10, off = b.t;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        s.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 6 });
      }
      wave(s, b.x, b.y, 70, '#ff5a78');
    }
    // aimed volley
    b.aimT -= dt * slowMul;
    if (b.aimT <= 0) {
      b.aimT = 1.7 * b.fireMul;
      const p = s.player;
      const base = Math.atan2(p.y - b.y, p.x - b.x);
      for (let k = -1; k <= 1; k++) {
        const a = base + k * 0.16;
        s.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 235, vy: Math.sin(a) * 235, r: 5, lance: true });
      }
    }
    // heavy plasma orb: slow, large, telegraphed aimed shot (reactive aim, no rng)
    b.plasmaT -= dt * slowMul;
    if (b.plasmaT <= 0) {
      b.plasmaT = 4.5 * b.fireMul;
      const a = Math.atan2(s.player.y - b.y, s.player.x - b.x);
      s.ebullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 15, plasma: true });
      wave(s, b.x, b.y, 52, '#5ad1ff');
    }
    // contact damage
    if (dist2(b, s.player) < (b.r + s.player.r) * (b.r + s.player.r)) hurtPlayer(s, s.player.x, s.player.y);
  }

  // ---------- end ----------
  function endGame(s, reason) {
    if (G.phase === 'over') return;
    G.phase = 'over';
    // snapshot final pace point
    s.pace.push(s.score);
    const res = {
      mode: s.mode, score: s.score, maxCombo: s.maxCombo,
      difficulty: s.difficulty,
      modifier: s.modifier,
      bossDown: s.bossDown, reason, pace: s.pace.slice(),
      collected: s.collected, duration: s.duration,
      crystalsCollected: s.crystalsCollected, // display-only (cosmetic meta)
      creditsCollected: s.creditsCollected,   // display-only (cosmetic meta — coins)
      breakdown: { ...s.breakdown },
      seedStr: s.seedStr, // daily runs record under their seed's date, not "now"
      noHit: !s.tookDamage,
    };
    SY.audio.gameOver();
    if (G.events.onGameOver) G.events.onGameOver(res);
  }

  // ---------- main update ----------
  function update(dt) {
    const s = G.state;
    if (!s) return;

    if (G.phase === 'paused') return; // sim + cosmetics fully frozen

    if (G.phase === 'ready') {
      s.readyT -= dt;
      if (s.readyT <= 0) { G.phase = 'playing'; SY.audio.start(); }
      return;
    }
    if (G.phase !== 'playing') {
      // keep ambient particles drifting on the over screen
      stepCosmetics(s, dt);
      return;
    }

    // hitstop
    if (s.freeze > 0) { s.freeze -= dt; stepCosmeticsLight(s, dt); return; }

    s.t += dt;
    s.timeLeft -= dt;
    const slowMul = s.fx.SLOW > 0 ? 0.42 : 1;

    // per-second bookkeeping: pace + time warning
    const whole = Math.ceil(s.timeLeft);
    if (whole !== s.lastWholeSec) {
      s.lastWholeSec = whole;
      s.pace.push(s.score);
      if (whole <= 5 && whole > 0) SY.audio.timeWarn();
    }
    if (s.timeLeft <= 0) { s.timeLeft = 0; endGame(s, 'time'); return; }

    // boss trigger at last 20s (only if round is long enough)
    if (!s.boss && !s.bossDown && s.duration >= 40 && s.timeLeft <= 20) spawnBoss(s);
    if (s.bossWarnT > 0) s.bossWarnT -= dt;

    // ---------- elite Sentinel (E4a): scripted mid-field beam mini-boss ----------
    if (!s.elite && !s.eliteSpawned && s.duration >= 40 && s.t >= s.eliteAt && s.timeLeft > 20) {
      s.eliteSpawned = true; SY.nvElite.spawn(s);
      if (s.elite) spawnWarp(s, s.elite.x, s.elite.y, 150);
    }
    if (s.elite) SY.nvElite.update(s, dt, slowMul, eliteApi);

    // ---------- surge director ----------
    const sd = s.surges[s.surgeIdx];
    if (sd) {
      if (!s.inSurge && s.surgeWarnT <= 0 && s.t >= sd.at - SURGE_WARN && s.t < sd.at) {
        s.surgeWarnT = SURGE_WARN;
        SY.audio.surgeWarn();
      }
      if (s.t >= sd.at) {
        s.inSurge = true;
        s.surgeActiveT = SURGE_DUR;
        s.heat = 0;                       // each surge builds fresh
        spawnFormation(s, sd.pattern, sd.size);
        s.shake = Math.max(s.shake, 4);
        s.surgeIdx++;
      }
    }
    if (s.surgeWarnT > 0) s.surgeWarnT -= dt;
    if (s.inSurge) { s.surgeActiveT -= dt; if (s.surgeActiveT <= 0) s.inSurge = false; }
    s.heatMul = heatTier(s); // cached for the HUD heat badge (read by main.js)

    // effect timers
    for (const k in s.fx) if (s.fx[k] > 0) s.fx[k] -= dt;
    if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }
    if (s.clearT > 0) s.clearT -= dt; // MISSION CLEAR banner countdown (display-only)

    // ---------- player ----------
    const p = s.player;
    let ax = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + SY.input.ax;
    let ay = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + SY.input.ay;
    const alen = Math.hypot(ax, ay);
    if (alen > 1) { ax /= alen; ay /= alen; }
    const speed = 265 * (s.fx.BOOST > 0 ? 1.5 : 1);
    p.vx += (ax * speed - p.vx) * Math.min(1, dt * 12);
    p.vy += (ay * speed - p.vy) * Math.min(1, dt * 12);
    p.x = Math.min(W - 16, Math.max(16, p.x + p.vx * dt));
    p.y = Math.min(H - 16, Math.max(16, p.y + p.vy * dt));
    p.thrust = Math.min(1, Math.hypot(p.vx, p.vy) / speed);
    if (Math.hypot(p.vx, p.vy) > 30) p.angle = Math.atan2(p.vy, p.vx);
    if (p.inv > 0) p.inv -= dt;
    // engine trail
    if (p.thrust > 0.25 && Math.random() < 0.7 * SY.tweaks.particles) {
      s.parts.push({
        x: p.x - Math.cos(p.angle) * 14, y: p.y - Math.sin(p.angle) * 14,
        vx: -Math.cos(p.angle) * 60 + (Math.random() - 0.5) * 30,
        vy: -Math.sin(p.angle) * 60 + (Math.random() - 0.5) * 30,
        life: 0.3, maxLife: 0.3, color: s.fx.BOOST > 0 ? '#7dff8a' : '#1b9e8c', size: 2.4,
      });
    }

    // ---------- auto-fire ----------
    p.fireCd -= dt;
    if (p.fireCd <= 0) {
      let target = null, best = 380 * 380;
      const cand = [];
      if (s.boss && s.boss.dying <= 0 && s.boss.y > 0) cand.push(s.boss);
      if (s.elite && s.elite.state !== 'enter') cand.push(s.elite);
      for (const m of s.mines) cand.push(m);
      for (const r of s.rocks) cand.push(r);
      for (const t of s.turrets) cand.push(t);
      for (const f of s.foes) cand.push(f);
      for (const cr of s.crates) cand.push(cr);
      for (const c of cand) { const d = dist2(c, p); if (d < best) { best = d; target = c; } }
      s.aimTarget = target; // display-only: the reticle tracks this (deterministic nearest; never read by the sim)
      if (target) {
        p.fireCd = 0.19;
        const a = Math.atan2(target.y - p.y, target.x - p.x);
        if (s.fx.MISSILE > 0) {
          // homing missile: steers to the nearest enemy each frame (reuses the bullet pipeline)
          s.bullets.push({ x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, life: 1.3, homing: true });
        } else {
          const angles = s.fx.SPREAD > 0 ? [a - 0.22, a, a + 0.22] : [a];
          for (const an of angles) {
            s.bullets.push({ x: p.x + Math.cos(an) * 16, y: p.y + Math.sin(an) * 16, vx: Math.cos(an) * 520, vy: Math.sin(an) * 520, life: 0.85 });
          }
        }
        SY.audio.shoot();
      } else p.fireCd = 0.06;
    }

    // ---------- companion drones (DRONE power-up) ----------
    if (s.fx.DRONE <= 0 && s.drones.length) s.drones.length = 0; // expired
    for (const dr of s.drones) {
      dr.angle += dt * 2.4; // orbit
      dr.x = p.x + Math.cos(dr.angle) * dr.orbitR;
      dr.y = p.y + Math.sin(dr.angle) * dr.orbitR;
      dr.fireCd -= dt;
      if (dr.fireCd <= 0) {
        const target = nearestTarget(s, dr.x, dr.y, 360 * 360);
        if (target) {
          dr.fireCd = DRONE_FIRE_PERIOD; // DPS-neutral (see spawnDrones)
          const a = Math.atan2(target.y - dr.y, target.x - dr.x);
          s.bullets.push({ x: dr.x, y: dr.y, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, life: 0.7 });
          SY.audio.shoot();
        } else dr.fireCd = 0.1;
      }
    }

    // ---------- spawning ----------
    s.spawnT.crystal -= dt;
    if (s.spawnT.crystal <= 0) { s.spawnT.crystal = 1.55; if (s.crystals.length < 36) spawnCrystalCluster(s); }
    s.spawnT.rock -= dt;
    if (s.spawnT.rock <= 0) { s.spawnT.rock = 5 / s.diff.spawnMul; if (s.rocks.length < 4) spawnRock(s); }
    s.spawnT.mine -= dt;
    if (s.spawnT.mine <= 0) {
      const ramp = Math.max(0.45, 1 - s.t * 0.007);
      const calmEase = s.inSurge ? 1 : 1.6; // fewer ambient mines between surges
      s.spawnT.mine = (2.7 * ramp * calmEase) / (Math.max(0.2, SY.tweaks.spawnRate) * s.diff.spawnMul);
      if (s.mines.length < s.diff.mineCap) spawnMine(s); // cap is ambient-only; surge formations are uncapped spikes by design
    }
    s.spawnT.pow -= dt;
    if (s.spawnT.pow <= 0) { s.spawnT.pow = 7 / s.diff.lootMul; if (s.pows.length < 4) spawnPow(s); }
    s.spawnT.turret -= dt;
    if (s.spawnT.turret <= 0) {
      s.spawnT.turret = 6 / s.diff.spawnMul; // density-scaled cadence
      if (s.diff.turretCap > 0 && s.turrets.length < s.diff.turretCap) spawnTurret(s);
    }
    s.spawnT.crate -= dt;
    if (s.spawnT.crate <= 0) {
      s.spawnT.crate = (5 + s.rng() * 3) / s.diff.lootMul;
      if (s.crates.length < 3) spawnCrate(s);
    }
    // ---------- rare extra life (1UP, E6) ----------
    s.spawnT.oneup -= dt;
    if (s.spawnT.oneup <= 0) {
      s.spawnT.oneup = 14 + s.rng() * 10;
      // rare, capped at 1, never in the final 8s (a fresh hull is moot as the run ends)
      if (s.rng() < 0.18 && s.timeLeft > 8 && !s.pows.some(o => o.type === '1UP')) spawnOneUp(s);
    }
    // ---------- rare screen-clear BOMB (rarer than 1UP — strong) ----------
    s.spawnT.bomb -= dt;
    if (s.spawnT.bomb <= 0) {
      s.spawnT.bomb = 20 + s.rng() * 12;
      // rare, capped at 1, never in the final 8s
      if (s.rng() < 0.13 && s.timeLeft > 8 && !s.pows.some(o => o.type === 'BOMB')) spawnBomb(s);
    }
    // ---------- rare INTEL data-cache pickup (instant score bonus) ----------
    s.spawnT.intel -= dt;
    if (s.spawnT.intel <= 0) {
      s.spawnT.intel = 17 + s.rng() * 11;
      if (s.rng() < 0.14 && s.timeLeft > 8 && !s.pows.some(o => o.type === 'INTEL')) spawnIntel(s);
    }
    // ---------- spawn + update laser fences (F5) ----------
    s.spawnT.fence -= dt;
    if (s.spawnT.fence <= 0) {
      s.spawnT.fence = 15 + s.rng() * 9;
      if (s.fences.length < 1 && s.diff.spawnMul >= 1) spawnFence(s); // normal/hard only
    }
    for (let i = s.fences.length - 1; i >= 0; i--) {
      const fc = s.fences[i];
      fc.phase += dt * 3; fc.t -= dt;
      if (fc.state === 'warn') {
        if (fc.t <= 0) { fc.state = 'firing'; fc.t = 1.4; SY.audio.shoot(); }
      } else if (fc.state === 'firing') {
        const perp = fc.orient === 'h' ? Math.abs(p.y - fc.pos) : Math.abs(p.x - fc.pos);
        if (perp < FENCE_BEAM_HALF + p.r) hurtPlayer(s, p.x, p.y);
        if (fc.t <= 0) { fc.state = 'fade'; fc.t = 0.35; }
      } else { // fade
        if (fc.t <= 0) s.fences.splice(i, 1);
      }
    }

    // ---------- spawn + update spiked flails (G3) ----------
    s.spawnT.flail -= dt;
    if (s.spawnT.flail <= 0) {
      s.spawnT.flail = 16 + s.rng() * 10;
      if (s.flails.length < 1 && s.diff.spawnMul >= 1) spawnFlail(s); // normal/hard only
    }
    for (let i = s.flails.length - 1; i >= 0; i--) {
      const fl = s.flails[i];
      fl.phase += dt * 3; fl.t -= dt;
      if (fl.state === 'warn') {
        if (fl.t <= 0) { fl.state = 'sweep'; fl.t = 4.5; SY.audio.shoot(); }
      } else if (fl.state === 'sweep') {
        fl.ang += fl.spin * dt;
        const bx = fl.ax + Math.cos(fl.ang) * fl.len, by = fl.ay + Math.sin(fl.ang) * fl.len;
        const dx = p.x - bx, dy = p.y - by;
        if (dx * dx + dy * dy < (fl.ballR + p.r) * (fl.ballR + p.r)) hurtPlayer(s, bx, by);
        if (fl.t <= 0) { fl.state = 'leave'; fl.t = 0.4; }
      } else { // leave
        if (fl.t <= 0) s.flails.splice(i, 1);
      }
    }

    // ---------- spawn + update sweeping hazard barriers (R2) ----------
    s.spawnT.barrier -= dt;
    if (s.spawnT.barrier <= 0) {
      s.spawnT.barrier = 17 + s.rng() * 10;
      if (s.barriers.length < 1 && s.diff.spawnMul >= 1) spawnBarrier(s); // normal/hard only
    }
    for (let i = s.barriers.length - 1; i >= 0; i--) {
      const ba = s.barriers[i];
      ba.phase += dt * 4;
      if (ba.state === 'warn') {
        ba.t -= dt;
        if (ba.t <= 0) { ba.state = 'sweep'; SY.audio.shoot(); }
      } else { // sweep
        ba.pos += ba.dir * ba.speed * dt;
        const perp = ba.orient === 'h' ? Math.abs(p.y - ba.pos) : Math.abs(p.x - ba.pos);
        if (perp < ba.half + p.r) hurtPlayer(s, p.x, p.y);
        const off = ba.orient === 'h' ? (ba.pos < -30 || ba.pos > H + 30)
                                      : (ba.pos < -30 || ba.pos > W + 30);
        if (off) s.barriers.splice(i, 1);
      }
    }

    // ---------- spawn + update electric arc traps (R3) ----------
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

    // ---------- spawn + update splitter orbs (R4) ----------
    s.spawnT.orb -= dt;
    if (s.spawnT.orb <= 0) {
      s.spawnT.orb = 9 + s.rng() * 6;
      if (countOrbTier(s, 'big') < 2) spawnOrb(s);
    }
    for (let i = s.orbs.length - 1; i >= 0; i--) {
      const o = s.orbs[i];
      o.rot += o.spin * dt; if (o.flash > 0) o.flash -= dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      if (o.x < 30 || o.x > W - 30) { o.vx = -o.vx; o.x = Math.max(30, Math.min(W - 30, o.x)); }
      if (o.y < 40 || o.y > H - 40) { o.vy = -o.vy; o.y = Math.max(40, Math.min(H - 40, o.y)); }
      if (dist2(o, p) < (o.r + p.r) * (o.r + p.r)) hurtPlayer(s, o.x, o.y);
    }

    // ---------- crystals ----------
    const magnetR = s.fx.MAGNET > 0 ? 215 : 0;
    for (let i = s.crystals.length - 1; i >= 0; i--) {
      const c = s.crystals[i];
      c.phase += dt * 3;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= Math.pow(0.05, dt); c.vy *= Math.pow(0.05, dt);
      c.x = Math.min(W - 10, Math.max(10, c.x)); c.y = Math.min(H - 10, Math.max(10, c.y));
      const d = Math.sqrt(dist2(c, p)) || 1;
      if (magnetR && d < magnetR) {
        const pull = 900 * (1 - d / magnetR) + 150;
        c.vx += ((p.x - c.x) / d) * pull * dt;
        c.vy += ((p.y - c.y) / d) * pull * dt;
      }
      if (d < p.r + c.r + 6) {
        s.crystals.splice(i, 1);
        s.combo += 1; s.comboT = 2.6;
        s.maxCombo = Math.max(s.maxCombo, s.combo);
        s.collected += 1;
        s.crystalsCollected++; // display-only counter (cosmetic meta); output-only
        if (s.inSurge) s.heat += 1;
        addScore(s, (c.big ? 40 : 10) + s.combo, c.x, c.y, undefined, 'crystal', c.big ? 40 : 10);
        burst(s, c.x, c.y, c.big ? '#7df9ff' : '#2de2c6', c.big ? 12 : 7, c.big ? 210 : 150, 2.2);
        SY.audio.collect(s.combo);
      }
    }

    // ---------- loot tokens (collect into the loot bucket; no combo) ----------
    for (let i = s.tokens.length - 1; i >= 0; i--) {
      const t = s.tokens[i];
      t.phase += dt * 3;
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.vx *= Math.pow(0.05, dt); t.vy *= Math.pow(0.05, dt);
      t.x = Math.min(W - 10, Math.max(10, t.x)); t.y = Math.min(H - 10, Math.max(10, t.y));
      const d = Math.sqrt(dist2(t, p)) || 1;
      if (magnetR && d < magnetR) {
        const pull = 900 * (1 - d / magnetR) + 150;
        t.vx += ((p.x - t.x) / d) * pull * dt;
        t.vy += ((p.y - t.y) / d) * pull * dt;
      }
      if (d < p.r + t.r + 6) {
        s.tokens.splice(i, 1);
        if (t.tier === 'coin') s.creditsCollected++; // display-only cosmetic counter
        addScore(s, TOKEN_VALUE[t.tier] || 15, t.x, t.y, undefined, 'loot');
        burst(s, t.x, t.y, '#ffd9a8', 6, 140, 2);
        SY.audio.collect(1);
      }
    }

    // ---------- rocks ----------
    for (const r of s.rocks) { r.rot += r.spin * dt; if (r.flash > 0) r.flash -= dt; }

    // ---------- mines ----------
    for (let i = s.mines.length - 1; i >= 0; i--) {
      const m = s.mines[i];
      m.phase += dt * 5;
      if (m.flash > 0) m.flash -= dt;
      if (m.entryT > 0) {
        m.entryT -= dt;                              // scripted formation entry
        m.x += m.vx * slowMul * dt;
        m.y += m.vy * slowMul * dt;
      } else {
        const dh = Math.sqrt(dist2(m, p)) || 1;      // homing
        m.x += ((p.x - m.x) / dh) * m.speed * slowMul * dt;
        m.y += ((p.y - m.y) / dh) * m.speed * slowMul * dt;
      }
      const d = Math.sqrt(dist2(m, p)) || 1;
      if (d < m.r + p.r) {
        s.mines.splice(i, 1);
        burst(s, m.x, m.y, '#ff5a78', 14, 200, 3);
        hurtPlayer(s, m.x, m.y);
        if (G.phase !== 'playing') return;
      }
    }

    // ---------- turrets (stationary aimed fire; telegraph handled in render) ----------
    for (const t of s.turrets) {
      t.phase += dt * 2;
      if (t.flash > 0) t.flash -= dt;
      t.fireT -= dt * slowMul;
      if (t.fireT <= 0) {
        const a = Math.atan2(p.y - t.y, p.x - t.x);
        s.ebullets.push({ x: t.x, y: t.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 5 });
        t.fireT = s.diff.turretFire;
      }
    }

    // ---------- new-archetype foes (Hunter/Charger; Shield/Laser in Phase 2) ----------
    SY.nvFoes.update(s, dt, slowMul, foeApi);

    // ---------- bullets vs things ----------
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      if (b.homing) {
        const tgt = nearestTarget(s, b.x, b.y, 520 * 520);
        if (tgt) {
          const desired = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = desired - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const maxTurn = 5.5 * dt;
          cur += Math.max(-maxTurn, Math.min(maxTurn, d));
          b.vx = Math.cos(cur) * 430; b.vy = Math.sin(cur) * 430;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10;
      if (!dead && s.boss && s.boss.dying <= 0 && dist2(b, s.boss) < (s.boss.r + 4) * (s.boss.r + 4)) {
        s.boss.hp -= 1; s.boss.flash = 0.08;
        addScore(s, 5, undefined, undefined, undefined, 'boss');
        burst(s, b.x, b.y, '#ffc34d', 4, 120, 2);
        s.freeze = Math.max(s.freeze, 0.016);
        SY.audio.bossHit();
        if (s.boss.hp <= 0) { s.boss.dying = 0.9; s.freeze = 0.12; s.shake = Math.max(s.shake, 8); }
        dead = true;
      }
      if (!dead && SY.nvElite.bulletHit(s, b, eliteApi)) dead = true;
      if (!dead && s.bossCores.length) for (let j = s.bossCores.length - 1; j >= 0; j--) {
        const c = s.bossCores[j];
        if (dist2(b, c) < (c.r + 4) * (c.r + 4)) {
          c.hp -= 1; c.flash = 0.08; burst(s, b.x, b.y, '#ff8fb0', 4, 120, 2); dead = true;
          if (c.hp <= 0) {
            s.bossCores.splice(j, 1);
            addScore(s, 120, c.x, c.y, 'CORE', 'destroy');
            for (let k = 0; k < 3; k++) { const a = c.ang + k * 2.094; s.crystals.push({ x: c.x, y: c.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: k * 2, tier: 'boss' }); }
            blast(s, c.x, c.y, 90, 'fxBurstMd'); SY.audio.explode();
          }
          break;
        }
      }
      if (!dead) for (let j = s.mines.length - 1; j >= 0; j--) {
        const m = s.mines[j];
        if (dist2(b, m) < (m.r + 4) * (m.r + 4)) {
          m.hp -= 1; m.flash = 0.06; dead = true;
          if (m.hp <= 0) {
            s.mines.splice(j, 1);
            addScore(s, 25, m.x, m.y, undefined, 'destroy');
            burst(s, m.x, m.y, '#ff9a5a', 12, 190, 2.6);
            wave(s, m.x, m.y, 40, '#ff9a5a');
            SY.audio.explode();
          }
          break;
        }
      }
      if (!dead) for (let j = s.rocks.length - 1; j >= 0; j--) {
        const r = s.rocks[j];
        if (dist2(b, r) < (r.r + 4) * (r.r + 4)) {
          r.hp -= 1; r.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#9ff5e8', 4, 110, 2);
          if (r.hp <= 0) {
            s.rocks.splice(j, 1);
            spawnDebris(s, r.x, r.y);
            addScore(s, 40, r.x, r.y, undefined, 'destroy');
            burst(s, r.x, r.y, '#2de2c6', 18, 220, 3);
            blast(s, r.x, r.y, 64, 'fxBurstSm');
            wave(s, r.x, r.y, 60, '#2de2c6');
            SY.audio.explode();
            const drops = 4 + Math.floor(s.rng() * 2);
            for (let k = 0; k < drops; k++) {
              const a = s.rng() * Math.PI * 2;
              s.crystals.push({ x: r.x, y: r.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, r: 7, phase: s.rng() * 6 });
            }
            if (s.rng() < 0.45) spawnPow(s, r.x, r.y);
          }
          break;
        }
      }
      if (!dead) for (let j = s.orbs.length - 1; j >= 0; j--) {
        const o = s.orbs[j];
        if (dist2(b, o) < (o.r + 4) * (o.r + 4)) {
          o.hp -= 1; o.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#ff9ad0', 4, 110, 2);
          if (o.hp <= 0) {
            s.orbs.splice(j, 1);
            if (o.tier === 'big') { addScore(s, ORB_BIG, o.x, o.y, undefined, 'destroy'); blast(s, o.x, o.y, 56, 'fxBurstSm'); splitOrb(s, o); }
            else { addScore(s, ORB_SMALL, o.x, o.y, undefined, 'destroy'); blast(s, o.x, o.y, 40, 'fxBurstSm'); }
            SY.audio.explode();
          }
          break;
        }
      }
      if (!dead) for (let j = s.turrets.length - 1; j >= 0; j--) {
        const t = s.turrets[j];
        if (dist2(b, t) < (t.r + 4) * (t.r + 4)) {
          t.hp -= 1; t.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#ff9a5a', 4, 110, 2);
          if (t.hp <= 0) {
            s.turrets.splice(j, 1);
            addScore(s, 60, t.x, t.y, undefined, 'destroy');
            burst(s, t.x, t.y, '#ff9a5a', 16, 230, 3);
            blast(s, t.x, t.y, 60, 'fxBurstSm');
            wave(s, t.x, t.y, 56, '#ff9a5a');
            SY.audio.explode();
            for (let kk = 0; kk < 3; kk++) {
              const aa = s.rng() * Math.PI * 2;
              s.crystals.push({ x: t.x, y: t.y, vx: Math.cos(aa) * 120, vy: Math.sin(aa) * 120, r: 7, phase: s.rng() * 6 });
            }
          }
          break;
        }
      }
      if (!dead) for (let j = s.foes.length - 1; j >= 0; j--) {
        const f = s.foes[j];
        const hit = SY.nvFoes.bulletHit(f, b);
        if (hit === 'miss') continue;
        dead = true;
        if (hit === 'blocked') { burst(s, b.x, b.y, '#5aa7ff', 4, 110, 2); break; } // Phase 2 shield arc
        burst(s, b.x, b.y, '#ff9a5a', 4, 110, 2);
        SY.nvFoes.damage(s, f, 1, foeApi);
        if (f.hp <= 0) SY.audio.explode();
        break;
      }
      if (!dead) for (let j = s.crates.length - 1; j >= 0; j--) {
        const cr = s.crates[j];
        if (dist2(b, cr) < (cr.r + 4) * (cr.r + 4)) {
          cr.hp -= 1; cr.flash = 0.07; dead = true;
          burst(s, b.x, b.y, '#ffd9a8', 4, 110, 2);
          if (cr.hp <= 0) {
            s.crates.splice(j, 1);
            spawnDebris(s, cr.x, cr.y);
            if (cr.kind === 'console') {
              addScore(s, 30, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 64, 'fxBurstSm');
              spawnPow(s, cr.x, cr.y); // bonus objective — guaranteed power-up
              pushToken(s, cr.x, cr.y, 'data'); // ...plus one guaranteed DATA salvage token (section-7 card)
            } else if (cr.kind === 'pod') {
              // CRYSTAL POD (section-3 capsule) — a crystal cache bursts out.
              // crystals carry no tier → render as teal/amber field gems (intentional: loot, not boss prize).
              addScore(s, 25, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 70, 'fxBurstSm');
              const n = 6 + Math.floor(s.rng() * 3);
              for (let k = 0; k < n; k++) {
                const a = s.rng() * Math.PI * 2, d = 10 + s.rng() * 30;
                s.crystals.push({ x: cr.x + Math.cos(a) * d, y: cr.y + Math.sin(a) * d, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, r: 7, phase: s.rng() * 6 });
              }
            } else if (cr.kind === 'mimic') {
              // HAZARD MIMIC (section-3 X-container) — looks like loot, bites back
              addScore(s, 35, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, 80, 'fxBurstSm');
              const m = 2 + Math.floor(s.rng() * 2);
              for (let k = 0; k < m; k++) spawnMineAt(s, cr.x, cr.y);
              spawnLoot(s, cr.x, cr.y, 'crate'); // consolation loot offsets the risk
            } else {
              addScore(s, cr.kind === 'chest' ? 40 : 20, cr.x, cr.y, undefined, 'destroy');
              blast(s, cr.x, cr.y, cr.kind === 'chest' ? 120 : 58, 'fxBurstSm');
              spawnLoot(s, cr.x, cr.y, cr.kind);
            }
            SY.audio.explode();
          }
          break;
        }
      }
      if (dead) s.bullets.splice(i, 1);
    }

    // ---------- enemy bullets ----------
    for (let i = s.ebullets.length - 1; i >= 0; i--) {
      const b = s.ebullets[i];
      b.x += b.vx * slowMul * dt; b.y += b.vy * slowMul * dt;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { s.ebullets.splice(i, 1); continue; }
      if (dist2(b, p) < (b.r + p.r - 2) * (b.r + p.r - 2)) {
        s.ebullets.splice(i, 1);
        hurtPlayer(s, b.x, b.y);
        if (G.phase !== 'playing') return;
      }
    }

    // ---------- powerups ----------
    for (let i = s.pows.length - 1; i >= 0; i--) {
      const o = s.pows[i];
      o.phase += dt * 2.4; o.life -= dt;
      o.vy *= Math.pow(0.1, dt); o.y += o.vy * dt;
      if (o.life <= 0) { s.pows.splice(i, 1); continue; }
      if (dist2(o, p) < (o.r + p.r + 4) * (o.r + p.r + 4)) {
        s.pows.splice(i, 1);
        applyPow(s, o);
      }
    }

    // ---------- spawn + update boost pads (G4) ----------
    s.spawnT.pad -= dt;
    if (s.spawnT.pad <= 0) {
      s.spawnT.pad = 14 + s.rng() * 8;
      if (s.pads.length < 1) spawnPad(s); // cap 1, all difficulties (positive buff)
    }
    for (let i = s.pads.length - 1; i >= 0; i--) {
      const pd = s.pads[i];
      pd.phase += dt * 3; pd.life -= dt;
      if (pd.cd > 0) { pd.cd -= dt; if (pd.cd <= 0) pd.armed = true; }
      if (pd.armed && dist2(pd, p) < (pd.r + p.r) * (pd.r + p.r)) {
        s.fx.BOOST = Math.max(s.fx.BOOST, 4); // 4s overdrive (speed + fire)
        pd.armed = false; pd.cd = 5;
        wave(s, pd.x, pd.y, 70, '#7dff8a'); SY.audio.powerup();
      }
      if (pd.life <= 0) s.pads.splice(i, 1);
    }

    // ---------- boss ----------
    if (s.boss) updateBoss(s, dt, slowMul);

    stepCosmetics(s, dt);
  }

  function applyPow(s, o) {
    const meta = POWER_META[o.type];
    SY.audio.powerup();
    wave(s, o.x, o.y, 56, meta.color);
    burst(s, o.x, o.y, meta.color, 12, 170, 2.6);
    floatText(s, o.x, o.y - 18, meta.label, meta.color);
    if (o.type === 'SHIELD') { s.shield = true; return; }       // consumable
    if (o.type === 'TIME') { s.timeLeft = Math.min(s.duration + 20, s.timeLeft + 5); return; } // instant
    if (o.type === '1UP') {
      if (s.player.hp < 3) s.player.hp += 1;   // restore a hull (capped at 3)
      else s.shield = true;                     // already full → convert to a shield (never wasted)
      return;
    }
    if (o.type === 'BOMB') { bombDetonate(s, o.x, o.y); return; } // instant screen clear
    if (o.type === 'INTEL') { addScore(s, 250, o.x, o.y, undefined, 'loot'); return; } // instant data-cache bonus
    // timed buffs: extend remaining time by the base duration, capped at 2x base
    const dur = POWER_DURATION[o.type];
    s.fx[o.type] = Math.min(2 * dur, s.fx[o.type] + dur);
    if (o.type === 'DRONE' && s.drones.length === 0) spawnDrones(s);
  }

  // BOMB power-up: instant screen clear. Destroys all combat enemies (score only,
  // no loot drops -> no crystal flood), wipes enemy fire, and chips the boss/elite
  // without ever killing them (clamped to >=1 hp -> they must be finished by shooting).
  // Deterministic: no s.rng(); the clear acts on already-seeded enemies. Cosmetic
  // burst/wave use Math.random only.
  function bombDetonate(s, x, y) {
    for (const m of s.mines) { addScore(s, 25, m.x, m.y, undefined, 'destroy'); burst(s, m.x, m.y, '#ff8a4a', 5, 150, 2.2); }
    for (const r of s.rocks) { addScore(s, 40, r.x, r.y, undefined, 'destroy'); burst(s, r.x, r.y, '#ff8a4a', 6, 160, 2.4); }
    for (const t of s.turrets) { addScore(s, 60, t.x, t.y, undefined, 'destroy'); burst(s, t.x, t.y, '#ff8a4a', 6, 160, 2.4); }
    for (const f of s.foes) { addScore(s, (SY.nvFoes.FOE_SCORE && SY.nvFoes.FOE_SCORE[f.kind]) || 30, f.x, f.y, undefined, 'destroy'); burst(s, f.x, f.y, '#ff8a4a', 5, 150, 2.2); }
    s.mines = []; s.rocks = []; s.turrets = []; s.foes = [];
    s.ebullets = []; // wipe all enemy fire (incl. boss plasma orbs)
    // non-lethal chip to boss/elite (boss-bucket score for the boss, like normal hits)
    if (s.boss && s.boss.dying <= 0) {
      const dmg = Math.min(8, s.boss.hp - 1);
      if (dmg > 0) { s.boss.hp -= dmg; s.boss.flash = 0.1; addScore(s, dmg * 5, undefined, undefined, undefined, 'boss'); }
    }
    if (s.elite && s.elite.state !== 'enter') { s.elite.hp = Math.max(1, s.elite.hp - 5); s.elite.flash = 0.1; }
    blast(s, x, y, 240, 'fxBurstLg');
    wave(s, x, y, 240, '#ff8a4a');
    s.shake = Math.max(s.shake, 11);
    SY.audio.explode();
  }

  // a six-wingman squadron, evenly spaced (deterministic — no rng). Per-drone fire rate
  // is tuned (DRONE_FIRE_PERIOD) so total DPS matches the old two-drone setup.
  const SQUADRON_SIZE = 6;
  const DRONE_FIRE_PERIOD = 1.65; // per-drone fire period: 6 @ 1.65s == old 2 @ 0.55s (DPS-neutral)
  function spawnDrones(s) {
    for (let i = 0; i < SQUADRON_SIZE; i++) {
      s.drones.push({
        angle: i * (Math.PI * 2 / SQUADRON_SIZE),
        orbitR: 46,
        fireCd: DRONE_FIRE_PERIOD * i / SQUADRON_SIZE, // staggered first shots
        x: s.player.x, y: s.player.y, variant: i,
      });
    }
  }

  // nearest targetable enemy to (x,y) within maxD2 (squared), or null. Deterministic.
  function nearestTarget(s, x, y, maxD2) {
    let best = maxD2, target = null;
    const probe = (e) => { const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy; if (d < best) { best = d; target = e; } };
    if (s.boss && s.boss.dying <= 0 && s.boss.y > 0) probe(s.boss);
    if (s.elite && s.elite.state !== 'enter') probe(s.elite);
    for (const c of s.bossCores) probe(c);
    for (const m of s.mines) probe(m);
    for (const r of s.rocks) probe(r);
    for (const t of s.turrets) probe(t);
    for (const f of s.foes) probe(f);
    for (const cr of s.crates) probe(cr);
    return target;
  }

  function stepCosmeticsLight(s, dt) {
    // during hitstop, only fade waves/floats slightly so the frame isn't 100% static
    for (const w of s.waves) w.life -= dt * 0.5;
  }

  function stepCosmetics(s, dt) {
    for (let i = s.parts.length - 1; i >= 0; i--) {
      const pa = s.parts[i];
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      pa.vx *= Math.pow(0.2, dt); pa.vy *= Math.pow(0.2, dt);
      pa.life -= dt;
      if (pa.life <= 0) s.parts.splice(i, 1);
    }
    for (let i = s.waves.length - 1; i >= 0; i--) {
      const w = s.waves[i];
      w.r += (w.maxR - w.r) * Math.min(1, dt * 8);
      w.life -= dt * 2.2;
      if (w.life <= 0) s.waves.splice(i, 1);
    }
    for (let i = s.floats.length - 1; i >= 0; i--) {
      const f = s.floats[i];
      f.y -= 34 * dt; f.life -= dt * 0.9;
      if (f.life <= 0) s.floats.splice(i, 1);
    }
    for (let i = s.blasts.length - 1; i >= 0; i--) {
      const bl = s.blasts[i];
      bl.life -= dt * 2.6; // ~0.38s flash
      if (bl.life <= 0) s.blasts.splice(i, 1);
    }
    for (let i = s.warps.length - 1; i >= 0; i--) { const w = s.warps[i]; w.life -= dt * 1.4; if (w.life <= 0) s.warps.splice(i, 1); }
    for (let i = s.debris.length - 1; i >= 0; i--) { const d = s.debris[i]; d.life -= dt * 1.6; if (d.life <= 0) s.debris.splice(i, 1); }
    for (let i = s.slashes.length - 1; i >= 0; i--) { const sl = s.slashes[i]; sl.life -= dt * 3.0; if (sl.life <= 0) s.slashes.splice(i, 1); }
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
  }

  // ---------- public API ----------
  G.start = function (mode, difficulty) {
    const seed = mode === 'daily' ? 'daily-' + SY.todayUTC() : 'free-' + Math.random().toString(36).slice(2);
    G.mode = mode;
    // daily is always Normal — keeps the worldwide daily map+difficulty identical (fairness)
    const diff = mode === 'daily' ? 'normal' : difficulty;
    G.state = freshState(mode, seed, diff);
    G.phase = 'ready';
    resetKeys(); // a key stuck since the menu (blurred mid-press) must not steer the new run
  };
  G.toMenu = function () { G.phase = 'menu'; G.state = null; };
  G.pause = function () {
    if (G.phase !== 'playing' && G.phase !== 'ready') return;
    G.pausedFrom = G.phase;
    G.phase = 'paused';
    resetKeys();
    SY.input.ax = 0; SY.input.ay = 0;
  };
  G.resume = function () {
    if (G.phase !== 'paused') return;
    G.phase = G.pausedFrom || 'playing';
    resetKeys(); // keys pressed while the overlay was up must not leak in
  };
  G.update = update;
})();
