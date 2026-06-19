// Ship — sprite atlas for the ship_assets.png sheet
// (assets/illustrations/ship_assets.png — a labeled, sectioned sprite kit).
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
  sheet.src = 'assets/illustrations/ship_assets.png';

  // { x, y, w, h } source rects in the 1448×1086 sheet.
  const A = {
    player:      { x: 24,   y: 832, w: 122, h: 126 }, // teal interceptor (DEFAULT)
    boss:        { x: 748,  y: 552, w: 74,  h: 80  }, // Core Warden — pink mechanical core
    enemyBig:    { x: 900,  y: 32,  w: 112, h: 108 }, // red turret-drone (rock)
    enemyMid:    { x: 1022, y: 48,  w: 90,  h: 76  },
    enemySmall:  { x: 1124, y: 62,  w: 68,  h: 60  }, // round red orb-eye (mine)
    crystalTeal: { x: 216,  y: 734, w: 40,  h: 64  }, // collectible crystal
    crystalAmber:{ x: 400,  y: 730, w: 46,  h: 64  }, // power-up capsule
    bulletTeal:  { x: 872,  y: 270, w: 42,  h: 120 }, // player shot (cyan energy bolt)
    bulletPink:  { x: 964,  y: 274, w: 50,  h: 114 }, // enemy/boss shot (red missile)
    beam:        { x: 1152, y: 274, w: 52,  h: 114 }, // boss beam column
    burst:       { x: 1224, y: 278, w: 98,  h: 90  }, // destruction explosion
    shieldDome:  { x: 1050, y: 826, w: 142, h: 142 }, // shielded-ship dome
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

  // Build (once) a native-size offscreen canvas of the player sprite re-tinted
  // for `id`. Returns the canvas, or null for `neon` / before the atlas decodes.
  function playerCanvas(id) {
    const def = PAINTS[id];
    if (!def) return null;            // neon (or unknown) -> atlas sprite
    const cached = playerCache[id];
    if (cached && cached.builtReady) return cached.canvas; // already good
    if (!decoded()) return null;      // can't build yet — fall back to atlas
    const r = A.player;
    const c = (cached && cached.canvas) || document.createElement('canvas');
    c.width = r.w;
    c.height = r.h;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, r.w, r.h);
    // 1) the base sprite, 2) a translucent tint clipped to the sprite's pixels
    // (source-atop keeps the existing alpha/shading), 3) a multiply shade pass
    // to deepen the color so it reads clearly as the coating.
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = def.tint;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = def.shade;
    cx.fillRect(0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'destination-in'; // re-mask to sprite alpha
    cx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    cx.globalCompositeOperation = 'source-over';
    playerCache[id] = { canvas: c, builtReady: true };
    return c;
  }

  // Set the active hull coating. Cosmetic only. Pre-builds the cache eagerly so
  // the first in-game frame never pays the build cost.
  function setPaint(id) {
    paint = PAINTS[id] !== undefined ? id : 'neon';
    if (paint !== 'neon') playerCanvas(paint); // warm the cache (no-op if !ready)
  }
  function getPaint() { return paint; }

  // Blit the player sprite (current coating) into an arbitrary dest rect — used
  // by the HANGAR preview canvas, which fits the hull without rotation. Honors
  // the active paint via the same cached tinted canvas as the hot path.
  function drawPlayer(ctx, dx, dy, dw, dh) {
    if (!decoded()) return false;
    const r = A.player;
    const tinted = playerCanvas(paint);
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
    if (!ready) return false;
    const r = A[key];
    if (!r) return false;
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    const tinted = key === 'player' ? playerCanvas(paint) : null;
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
    if (!ready) return false;
    const r = A[key];
    if (!r) return false;
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

  SY.nvSprites = { draw, drawFit, drawPlayer, setPaint, getPaint, atlas: A, isReady: () => ready, image: sheet };
})();
