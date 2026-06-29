// Neon Vortex — canvas renderer. Entities are drawn as sprites cut from
// sprite-atlas.png (via SY.nvSprites). Each draw falls back to the original
// vector shape until the sheet decodes (or if it fails to load), so the game
// stays playable with no image — mirroring the no-framework core invariant.
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.nvGame;
  const { W, H, POWER_META } = G;
  const SP = SY.nvSprites;

  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const POW_FONT = 'bold 13px ' + MONO;       // single-char power-up glyph
  const POW_FONT_SMALL = 'bold 11px ' + MONO; // multi-char glyph (×2, +5) shrinks to fit

  // hull sprite target size (longest-edge px). 'shielded' is a hull+bubble
  // composite, so it needs extra room than the bare hull frames.
  const HULL_SIZE = 42;
  const HULL_SIZE_SHIELDED = 64;

  // Ambient section-5 modular decor — fixed, deterministic edge/corner layout drawn
  // faintly behind gameplay. Cosmetic only (no rng, no sim). Built once at load.
  const DECOR = [
    { key: 'decoPanel',   x: 96,  y: 92,  size: 98, rot: 0,       alpha: 0.16 },
    { key: 'decoReadout', x: 872, y: 84,  size: 78, rot: 0,       alpha: 0.14 },
    { key: 'decoNode',    x: 70,  y: 512, size: 64, rot: 0,       alpha: 0.15 },
    { key: 'decoPanel',   x: 884, y: 520, size: 94, rot: Math.PI, alpha: 0.15 },
    { key: 'decoNode',    x: 480, y: 40,  size: 52, rot: 0,       alpha: 0.12 },
    { key: 'decoReadout', x: 480, y: 562, size: 70, rot: Math.PI, alpha: 0.12 },
    { key: 'decoNode',    x: 922, y: 300, size: 50, rot: 0,       alpha: 0.12 },
  ];

  function poly(ctx, x, y, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function diamond(ctx, x, y, r, squish) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * squish, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * squish, y);
    ctx.closePath();
  }

  // ambient facility decor (section-5). Additive low-alpha so only the neon edges
  // glow; skips entirely until the atlas decodes (no vector fallback for ambience).
  function drawDecor(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of DECOR) {
      ctx.globalAlpha = d.alpha;
      SP.draw(ctx, d.key, d.x, d.y, d.size, d.rot);
    }
    ctx.restore();
  }

  function drawBackground(ctx, s) {
    ctx.fillStyle = '#04090f';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.strokeStyle = 'rgba(45,226,198,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    drawDecor(ctx); // ambient section-5 facility decor (cosmetic, behind gameplay)
    if (s && s.fx.SLOW > 0) {
      ctx.fillStyle = 'rgba(120,80,255,0.07)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    if (s && s.inSurge) {
      ctx.fillStyle = 'rgba(255,90,120,0.05)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    ctx.strokeStyle = 'rgba(45,226,198,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  // gem variant by context (cosmetic): boss-kill drops = purple prize, crystals
  // during a surge = amber (HEAT window), otherwise the default teal.
  function drawCrystal(ctx, c, inSurge) {
    const bob = Math.sin(c.phase) * 2;
    const key = c.big ? 'crystalLarge' : (c.tier === 'boss' ? 'crystalBoss' : (inSurge ? 'crystalAmber' : 'crystalTeal'));
    if (SP.draw(ctx, key, c.x, c.y + bob, (c.r + 2) * 2.9, Math.sin(c.phase * 0.7) * 0.16)) return;
    const glow = c.big ? '#39d8ff' : (c.tier === 'boss' ? '#9c43e1' : (inSurge ? '#ffb028' : '#2de2c6'));
    const core = c.big ? '#cdfaff' : (c.tier === 'boss' ? '#e3b6ff' : (inSurge ? '#ffe6a8' : '#9ff5e8'));
    const squish = 0.62 + Math.sin(c.phase * 0.7) * 0.1;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    diamond(ctx, 0, 0, c.r + 2, squish);
    ctx.fillStyle = glow;
    ctx.fill();
    diamond(ctx, 0, -1, c.r - 2, squish);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  }

  function drawRock(ctx, r) {
    if (SP.draw(ctx, 'enemyBig', r.x, r.y, (r.r + 4) * 2.1, r.rot)) {
      if (r.flash > 0) { // hit highlight
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = 'lighter';
        SP.draw(ctx, 'enemyBig', r.x, r.y, (r.r + 4) * 2.1, r.rot);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.shadowColor = '#2de2c6';
    ctx.shadowBlur = 8;
    poly(ctx, 0, 0, r.r, 6, 0);
    ctx.fillStyle = r.flash > 0 ? '#9ff5e8' : '#0d2b33';
    ctx.fill();
    ctx.strokeStyle = '#2de2c6';
    ctx.lineWidth = 2;
    ctx.stroke();
    const frac = r.hp / r.maxHp;
    poly(ctx, 0, 0, r.r * 0.45 * frac + 4, 4, r.rot * -2);
    ctx.fillStyle = '#2de2c6';
    ctx.fill();
    ctx.restore();
  }

  function drawMine(ctx, m) {
    const pulse = 1 + Math.sin(m.phase) * 0.12;
    if (SP.draw(ctx, 'enemySmall', m.x, m.y, (m.r + 3) * 2.3 * pulse, m.phase * 0.4)) {
      if (m.flash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.globalCompositeOperation = 'lighter';
        SP.draw(ctx, 'enemySmall', m.x, m.y, (m.r + 3) * 2.3 * pulse, m.phase * 0.4);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.shadowColor = '#ff5a78';
    ctx.shadowBlur = 12;
    poly(ctx, 0, 0, (m.r + 3) * pulse, 8, m.phase * 0.4);
    ctx.strokeStyle = '#ff5a78';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, m.r * 0.62 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = m.flash > 0 ? '#ffffff' : '#ff5a78';
    ctx.fill();
    ctx.restore();
  }

  function drawPow(ctx, o) {
    const meta = POWER_META[o.type];
    const blink = o.life < 2 && Math.floor(o.life * 6) % 2 === 0;
    if (blink) return;
    const bob = Math.sin(o.phase) * 3;
    // dedicated badge sprite, tinted to the power-up color
    const drew = SP.drawPowerIcon(ctx, o.type, o.x, o.y + bob, (o.r + 4) * 2.3, Math.sin(o.phase * 0.3) * 0.12, meta.color);
    if (!drew) {
      // fallback: hex capsule (atlas not decoded / failed)
      ctx.save();
      ctx.translate(o.x, o.y + bob);
      ctx.shadowColor = meta.color;
      ctx.shadowBlur = 14;
      poly(ctx, 0, 0, o.r + 4, 6, Math.PI / 6 + o.phase * 0.3);
      ctx.fillStyle = '#04090f';
      ctx.fill();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    // glyph overlay: always on the vector fallback (identifies the pickup); with
    // the badge sprite, only for the ambiguous types — the rest read from their icon.
    if (!drew || o.type === 'X2' || o.type === 'SLOW' || o.type === 'TIME') {
      ctx.save();
      ctx.shadowColor = '#04090f';
      ctx.shadowBlur = 4;
      ctx.fillStyle = meta.color;
      // multi-char glyphs (X2 = '×2', TIME = '+5') shrink to fit; single-char stays 13px
      ctx.font = (o.type === 'X2' || o.type === 'TIME') ? POW_FONT_SMALL : POW_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.glyph, o.x, o.y + bob + 1);
      ctx.restore();
    }
  }

  function drawPlayer(ctx, s) {
    const p = s.player;
    if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0 && p.hp > 0) return; // blink
    // magnet radius hint (vector, around the sprite)
    if (s.fx.MAGNET > 0) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.arc(0, 0, 215, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(45,226,198,' + (0.1 + 0.06 * Math.sin(s.t * 6)) + ')';
      ctx.setLineDash([6, 10]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // hull sprite — frame reacts to state (shielded/damaged/boosted/default).
    // shielded is the hull+bubble composite, so it draws larger; +90° aligns
    // the sprite nose with p.angle. Pure choice, no per-frame allocation churn.
    // an active hull skin replaces every frame with its single ship sprite; the
    // default hull keeps its baked state frames. Shield then shows via the vector
    // ring below (frame !== 'shielded' so bubbleDrawn stays false).
    const hullKey = SP.activeHullKey();
    const frame = hullKey || SP.pickHullFrame({ shield: s.shield, hp: p.hp, boost: s.fx.BOOST });
    const size = frame === 'shielded' ? HULL_SIZE_SHIELDED : HULL_SIZE;
    const drew = SP.draw(ctx, frame, p.x, p.y, size, p.angle + Math.PI / 2);
    if (!drew) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + Math.PI / 2);
      ctx.shadowColor = '#2de2c6';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(11, 10); ctx.lineTo(0, 5); ctx.lineTo(-11, 10);
      ctx.closePath();
      ctx.fillStyle = '#0d2b33';
      ctx.fill();
      ctx.strokeStyle = '#2de2c6';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -3, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#9ff5e8';
      ctx.fill();
      ctx.restore();
    }
    // shield ring (vector) — only when the sprite bubble wasn't drawn (atlas not
    // ready/failed). When the 'shielded' sprite drew, its bubble already shows.
    const bubbleDrawn = drew && frame === 'shielded';
    if (s.shield && !bubbleDrawn) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.arc(0, 0, 24 + Math.sin(s.t * 5) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,167,255,0.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#5aa7ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTurret(ctx, t) {
    const charging = t.fireT < 0.5; // telegraph window before firing
    if (!SP.draw(ctx, 'enemyMid', t.x, t.y, (t.r + 4) * 2.2, 0)) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.shadowColor = '#ff5a78';
      ctx.shadowBlur = 10;
      poly(ctx, 0, 0, t.r, 6, t.phase * 0.2);
      ctx.fillStyle = t.flash > 0 ? '#ffd9e1' : '#2a0f16';
      ctx.fill();
      ctx.strokeStyle = '#ff5a78';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, t.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a78';
      ctx.fill();
      ctx.restore();
    } else if (t.flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, 'enemyMid', t.x, t.y, (t.r + 4) * 2.2, 0);
      ctx.restore();
    }
    if (charging) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.beginPath();
      ctx.arc(0, 0, t.r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,90,120,' + (0.35 + 0.3 * Math.sin(t.phase * 8)) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPortal(ctx, pt) {
    const open = pt.state === 'open';
    // warn: pulsing telegraph; open: bright; closing: fading
    const a = pt.state === 'warn' ? 0.35 + 0.25 * Math.sin(pt.phase * 6) : open ? 0.95 : 0.5;
    ctx.save(); ctx.globalAlpha = a;
    if (!SP.draw(ctx, 'portal', pt.x, pt.y, (open ? 78 : 60) + Math.sin(pt.phase) * 4, 0)) {
      ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 30, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawCrate(ctx, c) {
    const key = c.kind === 'chest' ? 'lootChest' : c.kind === 'console' ? 'lootConsole' : c.kind === 'pod' ? 'capsulePod' : c.kind === 'mimic' ? 'xContainer' : c.kind === 'canister' ? 'lootCanister' : 'lootCrate';
    if (!SP.draw(ctx, key, c.x, c.y, (c.r + 6) * 2.2, 0)) {
      ctx.save();
      ctx.fillStyle = c.flash > 0 ? '#fff' : '#caa46a';
      ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
      ctx.restore();
    } else if (c.flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = 'lighter';
      SP.draw(ctx, key, c.x, c.y, (c.r + 6) * 2.2, 0);
      ctx.restore();
    }
  }

  // companion wingmen: each squadron slot uses a distinct atlas sprite by variant index.
  // One entry per SQUADRON_SIZE slot (game.js) — extend both together if the squadron grows.
  const DRONE_VARIANT_KEYS = ['drone', 'drone2', 'droneV3', 'droneV4', 'droneV5', 'droneV6'];
  function drawDrone(ctx, dr) {
    const key = DRONE_VARIANT_KEYS[dr.variant] || 'drone'; // squadron slot → distinct sprite
    if (!SP.draw(ctx, key, dr.x, dr.y, 28, dr.angle * 0.5)) {
      ctx.save();
      ctx.fillStyle = '#5ad1ff'; ctx.shadowColor = '#5ad1ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(dr.x, dr.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawToken(ctx, t) {
    const bob = Math.sin(t.phase) * 2;
    const key = t.tier === 'coin' ? 'coin' : t.tier === 'data' ? 'tokenData' : t.tier === 'core' ? 'tokenCore' : t.tier === 'amber' ? 'crystalAmber' : t.tier === 'purple' ? 'crystalBoss' : 'crystalTeal';
    if (SP.draw(ctx, key, t.x, t.y + bob, (t.r + 2) * 2.4, Math.sin(t.phase * 0.6) * 0.15)) return;
    ctx.save();
    ctx.fillStyle = t.tier === 'coin' ? '#ffcf4d' : '#9ff5e8';
    ctx.beginPath(); ctx.arc(t.x, t.y + bob, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFoe(ctx, f) {
    if (f.kind === 'hunter') {
      if (!SP.draw(ctx, 'foeHunter', f.x, f.y, (f.r + 6) * 2.4, f.phase * 0.1)) {
        ctx.save();
        ctx.fillStyle = f.flash > 0 ? '#fff' : '#ff5a78';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (f.kind === 'charger') {
      if (f.state === 'lock') { // telegraph the locked dash line
        ctx.save();
        ctx.strokeStyle = 'rgba(255,90,120,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + f.dirX * 900, f.y + f.dirY * 900);
        ctx.stroke();
        ctx.restore();
      }
      const rot = (f.dirX || f.dirY) ? Math.atan2(f.dirY, f.dirX) + Math.PI / 2 : 0;
      if (!SP.draw(ctx, 'foeCharger', f.x, f.y, (f.r + 5) * 2.3, rot)) {
        ctx.save();
        ctx.fillStyle = f.flash > 0 ? '#fff' : (f.state === 'dash' ? '#ff7a3a' : '#ff5a78');
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (f.kind === 'shield') {
      if (!SP.draw(ctx, 'foeShield', f.x, f.y, (f.r + 6) * 2.4, 0)) {
        ctx.save(); ctx.fillStyle = f.flash > 0 ? '#fff' : '#5aa7ff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.save(); // shield arc facing the player
      ctx.strokeStyle = 'rgba(90,167,255,0.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 7, f.aimA - 1.05, f.aimA + 1.05); ctx.stroke();
      ctx.restore();
      return;
    }
    if (f.kind === 'laser') {
      if (f.state === 'warn' || f.state === 'fire') {
        const dx = f.bx - f.x, dy = f.by - f.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L, far = 1100;
        ctx.save();
        if (f.state === 'warn') {
          ctx.strokeStyle = 'rgba(255,90,120,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]);
        } else {
          ctx.strokeStyle = 'rgba(255,90,120,0.95)'; ctx.lineWidth = 11; ctx.shadowColor = '#ff5a78'; ctx.shadowBlur = 16;
        }
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + ux * far, f.y + uy * far); ctx.stroke();
        ctx.restore();
      }
      if (!SP.draw(ctx, 'foeLaser', f.x, f.y, (f.r + 8) * 2.6, f.phase * 0.4)) {
        ctx.save(); ctx.fillStyle = f.flash > 0 ? '#fff' : '#ff7a3a';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      return;
    }
  }

  const BEAM_DASH = [10, 8]; // hoisted so the telegraph dash doesn't alloc per frame
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
      ctx.strokeStyle = '#ff5a9e'; ctx.lineWidth = 2; ctx.setLineDash(BEAM_DASH);
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

  function drawBossCore(ctx, c, boss) {
    if (boss) { // faint tether from the boss to the core
      ctx.save();
      ctx.strokeStyle = 'rgba(255,90,120,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(boss.x, boss.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.restore();
    }
    const size = (c.r + 6) * 2.4;
    if (SP.draw(ctx, 'bossCore', c.x, c.y, size, c.ang)) {
      if (c.flash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = 'lighter';
        SP.draw(ctx, 'bossCore', c.x, c.y, size, c.ang);
        ctx.restore();
      }
      return;
    }
    ctx.save(); // vector fallback
    ctx.translate(c.x, c.y);
    ctx.shadowColor = '#ff5a78'; ctx.shadowBlur = 8;
    ctx.fillStyle = c.flash > 0 ? '#ffd9e1' : '#ff5a78';
    ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBoss(ctx, s) {
    const b = s.boss;
    const dyingShake = b.dying > 0 ? (Math.random() - 0.5) * 6 : 0;
    if (SP.draw(ctx, 'boss', b.x + dyingShake, b.y + dyingShake, (b.r + 10) * 2.4, b.ringRot * 0.25)) {
      if (b.flash > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = 'lighter';
        SP.draw(ctx, 'boss', b.x + dyingShake, b.y + dyingShake, (b.r + 10) * 2.4, b.ringRot * 0.25);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    ctx.translate(b.x + dyingShake, b.y + dyingShake);
    ctx.shadowColor = '#ff5a78';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = '#ff5a78';
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const a0 = b.ringRot + i * (Math.PI / 2);
      ctx.arc(0, 0, b.r + 10, a0, a0 + Math.PI / 3);
      ctx.stroke();
    }
    poly(ctx, 0, 0, b.r, 8, -b.ringRot * 0.5);
    ctx.fillStyle = b.flash > 0 ? '#ffd9e1' : '#1a0d18';
    ctx.fill();
    ctx.strokeStyle = '#ff5a78';
    ctx.lineWidth = 3;
    ctx.stroke();
    const pulse = 1 + Math.sin(b.t * 4) * 0.15;
    ctx.beginPath();
    ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#ffc34d';
    ctx.shadowColor = '#ffc34d';
    ctx.fill();
    ctx.restore();
  }

  // playfield cockpit frame — section-5 bracket art at the 4 corners (rotated),
  // joined by faint edge lines. Cosmetic only; deterministic (no rng).
  function drawPlayfieldFrame(ctx) {
    const m = 30;   // corner inset
    const sz = 56;  // bracket sprite size (longest edge)
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = '#5ad1ff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    ctx.globalAlpha = 0.55;
    const HALF = Math.PI / 2;
    // top-left art rotated into each corner; bail if the sheet hasn't decoded yet
    if (!SP.draw(ctx, 'frameCorner', m, m, sz, 0)) { ctx.restore(); return; }
    SP.draw(ctx, 'frameCorner', W - m, m, sz, HALF);
    SP.draw(ctx, 'frameCorner', W - m, H - m, sz, Math.PI);
    SP.draw(ctx, 'frameCorner', m, H - m, sz, -HALF);
    ctx.restore();
  }

  function render(ctx) {
    const s = G.state;
    const rot = (SY.layout && SY.layout.rot) || 0;
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    if (s && s.shake > 0) {
      const amp = s.shake * SY.tweaks.shake;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    drawBackground(ctx, s);
    if (!s) { ctx.restore(); return; }

    for (const w of s.waves) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = Math.max(0, w.life) * 0.8;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const c of s.crystals) drawCrystal(ctx, c, s.inSurge);
    for (const t of s.tokens) drawToken(ctx, t);
    for (const pt of s.portals) drawPortal(ctx, pt);
    for (const r of s.rocks) drawRock(ctx, r);
    for (const c of s.crates) drawCrate(ctx, c);
    for (const o of s.pows) drawPow(ctx, o);
    for (const m of s.mines) drawMine(ctx, m);
    for (const t of s.turrets) drawTurret(ctx, t);
    for (const f of s.foes) drawFoe(ctx, f);

    // explosion-sprite flashes (atlas burst), additive, growing + fading
    for (const bl of s.blasts) {
      const grow = bl.size * (0.6 + (1 - bl.life) * 0.9);
      ctx.save();
      ctx.globalAlpha = Math.max(0, bl.life);
      ctx.globalCompositeOperation = 'lighter';
      if (!SP.draw(ctx, 'burst', bl.x, bl.y, grow, bl.rot)) {
        ctx.beginPath();
        ctx.arc(bl.x, bl.y, grow * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd9a8';
        ctx.fill();
      }
      ctx.restore();
    }

    // player bullets (teal laser sprite, oriented along travel)
    ctx.shadowBlur = 0;
    for (const b of s.bullets) {
      if (b.homing) {
        if (!SP.draw(ctx, 'missile', b.x, b.y, 26, Math.atan2(b.vy, b.vx) + Math.PI / 2)) {
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
          ctx.fillStyle = '#ff8a3a'; ctx.fillRect(-7, -2, 14, 4); ctx.restore();
        }
        continue;
      }
      if (!SP.draw(ctx, 'bulletTeal', b.x, b.y, 18, Math.atan2(b.vy, b.vx) + Math.PI / 2)) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#9ff5e8';
        ctx.shadowColor = '#2de2c6';
        ctx.shadowBlur = 8;
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.restore();
      }
    }
    // enemy bullets (pink)
    for (const b of s.ebullets) {
      if (b.plasma) { // boss heavy plasma orb (atlas orb sprite)
        if (!SP.draw(ctx, 'plasmaOrb', b.x, b.y, b.r * 2.6, b.x * 0.5 + b.y * 0.5)) {
          ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = '#5ad1ff'; ctx.shadowColor = '#5ad1ff'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
        }
        continue;
      }
      if (!SP.draw(ctx, 'bulletPink', b.x, b.y, b.r * 3.2, Math.atan2(b.vy, b.vx) + Math.PI / 2)) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5a78';
        ctx.shadowColor = '#ff5a78';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd9e1';
        ctx.fill();
      }
    }

    if (s.elite) drawElite(ctx, s.elite);
    if (s.boss) drawBoss(ctx, s);
    for (const c of s.bossCores) drawBossCore(ctx, c, s.boss);
    drawPlayer(ctx, s);
    for (const dr of s.drones) drawDrone(ctx, dr);

    // targeting reticle on the current auto-fire target (ui-kit, additive black-key)
    if (s.aimTarget && s.aimTarget.x != null) {
      const t = s.aimTarget;
      SP.drawUi(ctx, 'reticle', t.x, t.y, (t.r || 16) * 2 + 26);
    }

    for (const pa of s.parts) {
      ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = 'bold 13px ' + MONO;
    for (const f of s.floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    drawPlayfieldFrame(ctx); // cockpit border (cosmetic), under the big alert overlays

    if (s.surgeWarnT > 0 && Math.floor(s.surgeWarnT * 6) % 2 === 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-rot);
      if (!SP.drawUi(ctx, 'bWarning', 0, 0, 380)) { // ui-kit WARNING banner (falls back to text)
        ctx.fillStyle = 'rgba(255,154,90,0.12)'; ctx.fillRect(-W, -30, W * 2, 60);
        ctx.fillStyle = '#ff9a5a'; ctx.font = 'bold 24px ' + MONO; ctx.textAlign = 'center';
        ctx.fillText('▲ SURGE INCOMING ▲', 0, 8);
      }
      ctx.restore();
    }

    if (s.bossWarnT > 0 && Math.floor(s.bossWarnT * 5) % 2 === 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-rot);
      if (!SP.drawUi(ctx, 'bBoss', 0, 0, 360)) { // ui-kit BOSS banner (falls back to text)
        ctx.fillStyle = 'rgba(255,90,120,0.12)'; ctx.fillRect(-W, -34, W * 2, 68);
        ctx.fillStyle = '#ff5a78'; ctx.font = 'bold 28px ' + MONO; ctx.textAlign = 'center';
        ctx.fillText('⚠ CORE WARDEN INBOUND ⚠', 0, 9);
      }
      ctx.restore();
    }

    if (s.clearT > 0) { // MISSION CLEAR banner on boss-down (ui-kit, fades out)
      ctx.save();
      ctx.translate(W / 2, H / 2 - 40);
      ctx.rotate(-rot);
      if (!SP.drawUi(ctx, 'bClear', 0, 0, 420, Math.min(1, s.clearT))) {
        ctx.globalAlpha = Math.min(1, s.clearT);
        ctx.fillStyle = '#2de2c6'; ctx.font = 'bold 28px ' + MONO; ctx.textAlign = 'center';
        ctx.fillText('MISSION CLEAR', 0, 9);
      }
      ctx.restore();
    }

    if (G.phase === 'ready') {
      ctx.fillStyle = 'rgba(4,9,15,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-rot);
      ctx.fillStyle = '#2de2c6';
      ctx.shadowColor = '#2de2c6';
      ctx.shadowBlur = 20;
      ctx.font = 'bold 52px ' + MONO;
      ctx.textAlign = 'center';
      ctx.fillText(s.readyT > 0.5 ? 'READY' : 'GO!', 0, 16);
      ctx.shadowBlur = 0;
      ctx.font = '14px ' + MONO;
      ctx.fillStyle = '#9ff5e8';
      ctx.fillText('DRAG TO MOVE · 사격은 자동', 0, 56);
      ctx.restore();
    }

    ctx.restore();
  }

  SY.nvRender = render;
})();
