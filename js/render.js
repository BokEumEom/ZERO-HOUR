// Scoreyard — canvas renderer
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.game;
  const { W, H, POWER_META } = G;

  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

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

  function drawBackground(ctx, s) {
    ctx.fillStyle = '#04090f';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    // grid
    ctx.strokeStyle = 'rgba(45,226,198,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // slow-mo tint
    if (s && s.fx.SLOW > 0) {
      ctx.fillStyle = 'rgba(120,80,255,0.07)';
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    // arena frame
    ctx.strokeStyle = 'rgba(45,226,198,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  function drawCrystal(ctx, c) {
    const bob = Math.sin(c.phase) * 2;
    const squish = 0.62 + Math.sin(c.phase * 0.7) * 0.1;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.shadowColor = '#2de2c6';
    ctx.shadowBlur = 10;
    diamond(ctx, 0, 0, c.r + 2, squish);
    ctx.fillStyle = '#0fae97';
    ctx.fill();
    diamond(ctx, 0, -1, c.r - 2, squish);
    ctx.fillStyle = '#9ff5e8';
    ctx.fill();
    ctx.restore();
  }

  function drawRock(ctx, r) {
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
    // inner core shows damage
    const frac = r.hp / r.maxHp;
    poly(ctx, 0, 0, r.r * 0.45 * frac + 4, 4, r.rot * -2);
    ctx.fillStyle = '#2de2c6';
    ctx.fill();
    ctx.restore();
  }

  function drawMine(ctx, m) {
    const pulse = 1 + Math.sin(m.phase) * 0.12;
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
    ctx.shadowBlur = 0;
    ctx.fillStyle = meta.color;
    ctx.font = 'bold ' + (o.type === 'X2' || o.type === 'TIME' ? 10 : 12) + 'px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.glyph, 0, 1);
    ctx.restore();
  }

  function drawPlayer(ctx, s) {
    const p = s.player;
    if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0 && p.hp > 0) return; // blink
    ctx.save();
    ctx.translate(p.x, p.y);
    // magnet radius hint
    if (s.fx.MAGNET > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 215, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(45,226,198,' + (0.1 + 0.06 * Math.sin(s.t * 6)) + ')';
      ctx.setLineDash([6, 10]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.shadowColor = '#2de2c6';
    ctx.shadowBlur = 16;
    // hull
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(11, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-11, 10);
    ctx.closePath();
    ctx.fillStyle = '#0d2b33';
    ctx.fill();
    ctx.strokeStyle = '#2de2c6';
    ctx.lineWidth = 2;
    ctx.stroke();
    // cockpit
    ctx.beginPath();
    ctx.arc(0, -3, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#9ff5e8';
    ctx.fill();
    ctx.restore();
    // shield ring
    if (s.shield) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(s.t * 5) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,167,255,0.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#5aa7ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBoss(ctx, s) {
    const b = s.boss;
    ctx.save();
    ctx.translate(b.x, b.y);
    const dyingShake = b.dying > 0 ? (Math.random() - 0.5) * 6 : 0;
    ctx.translate(dyingShake, dyingShake);
    ctx.shadowColor = '#ff5a78';
    ctx.shadowBlur = 22;
    // outer rotating ring segments
    ctx.strokeStyle = '#ff5a78';
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const a0 = b.ringRot + i * (Math.PI / 2);
      ctx.arc(0, 0, b.r + 10, a0, a0 + Math.PI / 3);
      ctx.stroke();
    }
    // body
    poly(ctx, 0, 0, b.r, 8, -b.ringRot * 0.5);
    ctx.fillStyle = b.flash > 0 ? '#ffd9e1' : '#1a0d18';
    ctx.fill();
    ctx.strokeStyle = '#ff5a78';
    ctx.lineWidth = 3;
    ctx.stroke();
    // core eye
    const pulse = 1 + Math.sin(b.t * 4) * 0.15;
    ctx.beginPath();
    ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#ffc34d';
    ctx.shadowColor = '#ffc34d';
    ctx.fill();
    ctx.restore();
    // HP bar
    const bw = 220, bh = 8;
    const bx = W / 2 - bw / 2, by = 18;
    ctx.fillStyle = 'rgba(255,90,120,0.15)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff5a78';
    ctx.fillRect(bx, by, bw * Math.max(0, b.hp / b.maxHp), bh);
    ctx.strokeStyle = 'rgba(255,90,120,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
    ctx.fillStyle = '#ff9ab0';
    ctx.font = '10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.fillText('CORE WARDEN', W / 2, by + bh + 13);
  }

  function render(ctx) {
    const s = G.state;
    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // screen shake
    if (s && s.shake > 0) {
      const amp = s.shake * SY.tweaks.shake;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    drawBackground(ctx, s);
    if (!s) { ctx.restore(); return; }

    // waves (under entities)
    for (const w of s.waves) {
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = Math.max(0, w.life) * 0.8;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const c of s.crystals) drawCrystal(ctx, c);
    for (const r of s.rocks) drawRock(ctx, r);
    for (const o of s.pows) drawPow(ctx, o);
    for (const m of s.mines) drawMine(ctx, m);

    // bullets
    ctx.shadowBlur = 0;
    for (const b of s.bullets) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillStyle = '#9ff5e8';
      ctx.shadowColor = '#2de2c6';
      ctx.shadowBlur = 8;
      ctx.fillRect(-6, -1.5, 12, 3);
      ctx.restore();
    }
    for (const b of s.ebullets) {
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

    if (s.boss) drawBoss(ctx, s);
    drawPlayer(ctx, s);

    // particles
    for (const pa of s.parts) {
      ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size);
    }
    ctx.globalAlpha = 1;

    // floating texts
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px ' + MONO;
    for (const f of s.floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // boss warning banner
    if (s.bossWarnT > 0 && Math.floor(s.bossWarnT * 5) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,90,120,0.12)';
      ctx.fillRect(0, H / 2 - 34, W, 68);
      ctx.fillStyle = '#ff5a78';
      ctx.font = 'bold 28px ' + MONO;
      ctx.fillText('⚠ CORE WARDEN INBOUND ⚠', W / 2, H / 2 + 9);
    }

    // ready countdown
    if (G.phase === 'ready') {
      ctx.fillStyle = 'rgba(4,9,15,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2de2c6';
      ctx.shadowColor = '#2de2c6';
      ctx.shadowBlur = 20;
      ctx.font = 'bold 52px ' + MONO;
      ctx.fillText(s.readyT > 0.5 ? 'READY' : 'GO!', W / 2, H / 2 + 16);
      ctx.shadowBlur = 0;
      ctx.font = '14px ' + MONO;
      ctx.fillStyle = '#9ff5e8';
      ctx.fillText('WASD / 터치 드래그로 이동 · 사격은 자동', W / 2, H / 2 + 56);
    }

    ctx.restore();
  }

  SY.render = render;
})();
