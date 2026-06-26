// Neon Vortex — sprite atlas for the sprite-atlas.png sheet
// (assets/sprite-atlas.png — a labeled, sectioned sprite kit).
// Rects were extracted by a connected-component sweep of the sheet's black
// background, then hand-verified against per-sprite crops. Drawing uses the
// 9-arg drawImage crop (no per-frame allocation) so it is safe on the 60fps
// hot path.
(function () {
  const SY = (window.SY = window.SY || {});

  const sheet = new Image();
  let ready = false;
  sheet.onload = () => { ready = true; };
  // pixels are usable once onload fired OR the image is already decoded (covers
  // the standalone data-URI atlas, where onload may not have run yet)
  const decoded = () => ready || (sheet.complete && sheet.naturalWidth > 0);
  // relative path works both from index.html and the generated standalone.html
  sheet.src = 'assets/sprite-atlas.png?v=3';

  // ---- ui-kit sheet: neon-on-black HUD art drawn over the canvas arena with an
  // additive blend, so the black background keys out (no matte box). Reticle +
  // game-state banners only — see drawUi(). RGB, no alpha; never tinted/cached.
  const uiSheet = new Image();
  let uiReady = false;
  uiSheet.onload = () => { uiReady = true; };
  const uiDecoded = () => uiReady || (uiSheet.complete && uiSheet.naturalWidth > 0);
  uiSheet.src = 'assets/ui-kit.png';
  const UI = {
    reticle: { x: 1129, y: 632,  w: 67,  h: 63 },  // cyan circular target reticle
    bWarning:{ x: 234,  y: 931,  w: 210, h: 70 },  // "WARNING" banner (surge telegraph)
    bBoss:   { x: 460,  y: 931,  w: 190, h: 70 },  // "BOSS" banner (Core Warden inbound)
    bClear:  { x: 236,  y: 1001, w: 208, h: 68 },  // "MISSION CLEAR" banner (boss downed)
  };
  // draw a ui-kit rect centred at (x,y), scaled so its longest edge spans `size`,
  // additively (black background keys out). Returns false until the sheet decodes.
  function drawUi(ctx, key, x, y, size, alpha) {
    if (!uiDecoded()) return false;
    const r = UI[key]; if (!r) return false;
    const sc = size / Math.max(r.w, r.h), dw = r.w * sc, dh = r.h * sc;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(uiSheet, r.x, r.y, r.w, r.h, x - dw / 2, y - dh / 2, dw, dh);
    ctx.restore();
    return true;
  }

  // { x, y, w, h } source rects in the 1448×1086 sheet.
  const A = {
    player:      { x: 24,   y: 832, w: 122, h: 126 }, // teal interceptor (DEFAULT)
    boss:        { x: 748,  y: 552, w: 74,  h: 80  }, // Core Warden — pink mechanical core
    enemyBig:    { x: 900,  y: 32,  w: 112, h: 108 }, // red turret-drone (rock)
    enemyMid:    { x: 1022, y: 48,  w: 90,  h: 76  },
    enemySmall:  { x: 1124, y: 62,  w: 68,  h: 60  }, // round red orb-eye (mine)
    crystalTeal: { x: 216,  y: 734, w: 40,  h: 64  }, // collectible crystal (normal)
    crystalAmber:{ x: 400,  y: 730, w: 46,  h: 64  }, // amber gem — surge (HEAT) crystals
    crystalBoss: { x: 758,  y: 701, w: 46,  h: 89  }, // purple prize gem — boss-kill drops
    bulletTeal:  { x: 872,  y: 270, w: 42,  h: 120 }, // player shot (cyan energy bolt)
    bulletPink:  { x: 964,  y: 274, w: 50,  h: 114 }, // enemy/boss shot (red missile)
    beam:        { x: 1152, y: 274, w: 52,  h: 114 }, // boss beam column
    burst:       { x: 1224, y: 278, w: 98,  h: 90  }, // destruction explosion
    shielded:    { x: 1050, y: 826, w: 142, h: 142 }, // SHIELDED frame (hull + hex bubble)
    boosted:     { x: 907,  y: 827, w: 109, h: 133 }, // BOOSTED frame (large triple flames)
    damaged:     { x: 1209, y: 833, w: 122, h: 126 }, // DAMAGED frame (cracks + sparks)
    // dedicated art for the new foe archetypes (used by render.drawFoe). Each
    // keeps its native colour for maximum visual distinction (red/teal/purple/cyan).
    foeHunter:   { x: 1228, y: 36,  w: 88,  h: 92  }, // red hex orb-drone (relentless chaser)
    foeCharger:  { x: 606,  y: 832, w: 85,  h: 68  }, // teal chevron interceptor (dasher)
    foeShield:   { x: 1344, y: 709, w: 68,  h: 47  }, // purple hex pod (front-armoured)
    foeLaser:    { x: 756,  y: 405, w: 131, h: 83  }, // cyan emitter ring (beam source)
    // selectable alternate hulls (hangar skins) — the atlas "UPGRADED I/II/III"
    // ship variants. Cosmetic only; used as the player sprite for every state.
    hullUpg1:    { x: 150,  y: 828, w: 120, h: 100 },
    hullUpg2:    { x: 292,  y: 828, w: 118, h: 100 },
    hullUpg3:    { x: 432,  y: 828, w: 122, h: 100 },
    hullUpg4:    { x: 755,  y: 833, w: 100, h: 105 }, // 4th selectable hull (section 8 ship variant)
    // loot economy (E1): destructible containers + reward tokens
    lootCrate:   { x: 372,  y: 266, w: 98,  h: 78  }, // locked loot crate
    lootCanister:{ x: 498,  y: 278, w: 94,  h: 90  }, // canister/module crate
    coin:        { x: 884,  y: 709, w: 60,  h: 56  }, // gold reward coin
    lootChest:   { x: 1258, y: 697, w: 94,  h: 64  }, // rare treasure chest (jackpot)
    drone:       { x: 1215, y: 1019, w: 44, h: 38 }, // companion wingman drone
    portal:      { x: 36,   y: 271, w: 75,  h: 103 }, // spawn portal ring (world object)
    lootConsole: { x: 206,  y: 286, w: 96,  h: 74  }, // console objective — drops a power-up
    eliteCore:   { x: 1097, y: 532, w: 89,  h: 101 }, // elite sentinel — hex armored core (beam emitter)
    frameCorner: { x: 454,  y: 511, w: 54,  h: 54  }, // cockpit/targeting frame corner bracket (section 5)
    missile:     { x: 966,  y: 284, w: 44,  h: 105 }, // homing missile projectile (section 4)
    oneUp:       { x: 640,  y: 46,  w: 58,  h: 70  }, // 1UP heart — rare extra-life pickup (section 1)
    plasmaOrb:   { x: 1057, y: 293, w: 60,  h: 66  }, // heavy plasma orb (boss enemy projectile, section 4)
    drone2:      { x: 1326, y: 1023, w: 84, h: 44 }, // 2nd companion drone variant (winged core, section 8)
    crystalLarge:{ x: 36,   y: 706, w: 44, h: 95 }, // rare large value gem (section 7 — largest teal crystal)
  };

  // power-up pickup badges (atlas section 1 "POWER-UPS / PICKUPS", cyan row).
  // Keyed by SY.nvGame power-up type. Tinted per POWER_META color at draw time.
  const POWER_ICONS = {
    MAGNET: { x: 228, y: 23, w: 66, h: 87 }, // horseshoe-U magnet badge
    SHIELD: { x: 88,  y: 16, w: 66, h: 94 }, // shield badge
    BOOST:  { x: 158, y: 16, w: 66, h: 94 }, // lightning-bolt badge
    SPREAD: { x: 298, y: 23, w: 66, h: 87 }, // double-chevron badge
    X2:     { x: 369, y: 23, w: 66, h: 87 }, // burst/star badge
    SLOW:   { x: 509, y: 24, w: 66, h: 86 }, // orbit-ring badge
    TIME:   { x: 19,  y: 16, w: 65, h: 94 }, // plus badge (+5 sec)
    DRONE:  { x: 1215, y: 1019, w: 44, h: 38 }, // companion drone (also the entity sprite)
    MISSILE:{ x: 966, y: 284, w: 44, h: 105 }, // homing missile (also the projectile sprite)
    '1UP':  { x: 640, y: 46, w: 58, h: 70 }, // 1UP heart pickup badge
  };

  // ---- hull coatings (cosmetic paint) -------------------------------------
  // The player ship can be re-tinted to one of these coatings. This is PURELY
  // visual — it never touches the simulation, hitboxes, RNG, or the daily seed.
  // `neon` is the original atlas sprite (no tint). `stealth`/`solar` are
  // pre-rendered ONCE into a cached offscreen canvas (see playerCanvas) and the
  // hot-path draw() blits that cache — no per-frame filter/canvas allocation.
  const PAINTS = {
    neon:    null, // use the atlas sprite unchanged
    stealth: { tint: 'rgba(96, 64, 220, 0.6)',  shade: 'rgba(40, 20, 90, 0.45)'  }, // void violet/indigo
    solar:   { tint: 'rgba(255, 150, 24, 0.62)', shade: 'rgba(190, 70, 0, 0.4)'  }, // warm gold/orange
  };
  let paint = 'neon';
  // cache: paint id -> { canvas, builtReady } (builtReady = was the atlas ready
  // when this cache was built; if not, rebuild once the atlas decodes).
  const playerCache = {};

  // hull-family frame keys: these get the cosmetic paint-coating treatment.
  const HULL_FRAMES = new Set(['player', 'boosted', 'damaged', 'shielded']);

  // Build (once) a native-size offscreen canvas of frame `frameKey` re-tinted
  // for `id`. Returns the canvas, or null for `neon` / before the atlas decodes.
  // Cache is nested (playerCache[frameKey][id]) so hot-path hits allocate nothing.
  function playerCanvas(frameKey, id) {
    const def = PAINTS[id];
    if (!def) return null;            // neon (or unknown) -> atlas sprite
    let byFrame = playerCache[frameKey];
    const cached = byFrame && byFrame[id];
    if (cached && cached.builtReady) return cached.canvas; // already good
    if (!decoded()) return null;      // can't build yet — fall back to atlas
    const r = A[frameKey];
    const c = (cached && cached.canvas) || document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, r.w, r.h);
    // 1) base sprite, 2) translucent tint clipped to sprite pixels, 3) multiply
    // shade, 4) re-mask to the sprite's alpha.
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = def.tint;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = def.shade;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-over';
    // intentional mutation: playerCache is a build-once singleton cache; making
    // it immutable would re-allocate the cache structure on the hot path.
    if (!byFrame) byFrame = playerCache[frameKey] = {};
    byFrame[id] = { canvas: c, builtReady: true };
    return c;
  }

  // Set the active hull coating. Cosmetic only. Pre-builds the cache eagerly so
  // the first in-game frame never pays the build cost.
  function setPaint(id) {
    paint = PAINTS[id] !== undefined ? id : 'neon';
    // warm every hull frame's tinted cache so no in-game state transition pays
    // the first-build cost (no-op until the atlas decodes).
    if (paint !== 'neon') HULL_FRAMES.forEach((frameKey) => playerCanvas(frameKey, paint));
  }
  function getPaint() { return paint; }

  // ---- alternate hull skins (cosmetic) ---------------------------------------
  // A hull skin replaces the player sprite with an atlas ship variant for ALL
  // states (the default hull keeps its baked shielded/boosted/damaged frames).
  // Display-only: never touches the sim, hitboxes, RNG, or the daily seed.
  const HULL_SKINS = { upg1: 'hullUpg1', upg2: 'hullUpg2', upg3: 'hullUpg3', upg4: 'hullUpg4' };
  let hull = 'default';
  function setHull(id) { hull = HULL_SKINS[id] ? id : 'default'; }
  function getHull() { return hull; }
  // the atlas key to draw for the active hull, or null to use the default frames
  function activeHullKey() { return hull === 'default' ? null : HULL_SKINS[hull]; }

  // Blit the player sprite (current coating) into an arbitrary dest rect — used
  // by the HANGAR preview canvas, which fits the hull without rotation. Honors
  // the active paint via the same cached tinted canvas as the hot path.
  function drawPlayer(ctx, dx, dy, dw, dh) {
    if (!decoded()) return false;
    const r = A.player;
    const tinted = playerCanvas('player', paint);
    if (tinted) ctx.drawImage(tinted, dx, dy, dw, dh);
    else ctx.drawImage(sheet, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
    return true;
  }

  // Draw sprite `key` centred at (x,y), scaled so its longest edge spans `size`
  // px, with optional rotation (radians). Returns false until the sheet decodes
  // so the caller can fall back to a vector shape. For the player sprite under a
  // non-neon coating, blits the CACHED tinted canvas (built once, never rebuilt
  // per frame) instead of the atlas — same scale/rotate math.
  function draw(ctx, key, x, y, size, rot) {
    if (!decoded()) return false;
    const r = A[key];
    if (!r) return false;
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    const tinted = HULL_FRAMES.has(key) ? playerCanvas(key, paint) : null;
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      if (tinted) ctx.drawImage(tinted, -dw / 2, -dh / 2, dw, dh);
      else ctx.drawImage(sheet, r.x, r.y, r.w, r.h, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else if (tinted) {
      ctx.drawImage(tinted, x - dw / 2, y - dh / 2, dw, dh);
    } else {
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, x - dw / 2, y - dh / 2, dw, dh);
    }
    return true;
  }

  // Draw the player sprite stretched to an explicit width/height (the hull is
  // taller than wide), centred at (x,y), pointing up; optional rotation.
  function drawFit(ctx, key, x, y, w, h, rot) {
    if (!decoded()) return false;
    const r = A[key];
    if (!r) return false;
    // note: drawFit blits the raw atlas (no paint tint) — not for hull frames.
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, x - w / 2, y - h / 2, w, h);
    }
    return true;
  }

  // ---- power-up pickup icons -------------------------------------------------
  // Each badge is tinted to its power-up's color once per (type,color) and
  // cached (nested object key — no per-frame string allocation on the hot path).
  const iconCache = {}; // iconCache[type][color] -> { canvas, builtReady }
  function powerIconCanvas(type, color) {
    const r = POWER_ICONS[type];
    if (!r) return null;
    let byType = iconCache[type];
    const cached = byType && byType[color];
    if (cached && cached.builtReady) return cached.canvas; // cache hit first
    if (!decoded()) return null;                            // then atlas guard
    const c = (cached && cached.canvas) || document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, r.w, r.h);
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    // single translucent recolor pass (no multiply shade — keeps small icons crisp)
    cx.globalCompositeOperation = 'source-atop';
    cx.globalAlpha = 0.55;
    cx.fillStyle = color;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    if (!byType) byType = iconCache[type] = {};
    byType[color] = { canvas: c, builtReady: true };
    return c;
  }

  // Draw power-up `type` centred at (x,y), longest edge = `size`, tinted to
  // `color`. Returns false until the atlas decodes (caller falls back to vector).
  function drawPowerIcon(ctx, type, x, y, size, rot, color) {
    const r = POWER_ICONS[type];
    if (!r) return false;
    const img = powerIconCanvas(type, color);
    if (!img) return false;
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
    }
    return true;
  }

  // Pure: choose the hull frame for the current player state. Cosmetic only —
  // reads no RNG and mutates nothing. `st` is a non-null { shield, hp, boost }
  // object (caller's responsibility). Priority: the shield bubble hides the
  // hull (wins), then low-hull danger reads over boost flair, else default.
  function pickHullFrame(st) {
    if (st.shield) return 'shielded';
    if (st.hp <= 1) return 'damaged';
    if (st.boost > 0) return 'boosted';
    return 'player';
  }

  SY.nvSprites = { draw, drawFit, drawPlayer, drawPowerIcon, drawUi, setPaint, getPaint, setHull, getHull, activeHullKey, pickHullFrame, atlas: A, ui: UI, powerIcons: POWER_ICONS, isReady: () => ready, image: sheet };
})();
