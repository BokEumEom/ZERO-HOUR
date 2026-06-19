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

  // Draw sprite `key` centred at (x,y), scaled so its longest edge spans `size`
  // px, with optional rotation (radians). Returns false until the sheet decodes
  // so the caller can fall back to a vector shape.
  function draw(ctx, key, x, y, size, rot) {
    if (!ready) return false;
    const r = A[key];
    if (!r) return false;
    const sc = size / Math.max(r.w, r.h);
    const dw = r.w * sc, dh = r.h * sc;
    if (rot) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sheet, r.x, r.y, r.w, r.h, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
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

  SY.nvSprites = { draw, drawFit, atlas: A, isReady: () => ready, image: sheet };
})();
