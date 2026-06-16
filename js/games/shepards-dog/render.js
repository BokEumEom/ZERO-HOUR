"use strict";
/* Shepherd's Dog — Canvas 2D rendering — day/night, grass, sheep, dog, wolves */

/* =========================================================
RENDERING
========================================================= */
let view = { s: 1, ox: 0, oy: 0 };
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  const s = Math.min(canvas.width / W, canvas.height / H);
  view = { s, ox: (canvas.width - W * s) / 2, oy: (canvas.height - H * s) / 2 };
}
addEventListener("resize", resize);
resize();

/* pre-rendered grass field */
let grassCanvas = null;
function buildGrass() {
  grassCanvas = document.createElement("canvas");
  grassCanvas.width = W;
  grassCanvas.height = H;
  const g = grassCanvas.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#a3c266");
  grad.addColorStop(1, "#7da04a");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // mottled light patches
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(255,250,200,${rand(0.02, 0.05)})`;
    g.beginPath();
    g.ellipse(rand(0, W), rand(0, H), rand(80, 260), rand(50, 160), rand(0, TAU), 0, TAU);
    g.fill();
  }
  // grass blades
  for (let i = 0; i < 1500; i++) {
    const x = rand(0, W),
      y = rand(0, H),
      l = rand(3, 8);
    g.strokeStyle = Math.random() < 0.5 ? "rgba(60,100,40,.25)" : "rgba(150,190,90,.3)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rand(-2, 2), y - l);
    g.stroke();
  }
  // little flowers
  for (let i = 0; i < 70; i++) {
    const x = rand(0, W),
      y = rand(0, H);
    g.fillStyle = ["#f3e9b0", "#f0f0f5", "#e8b8c8"][Math.floor(rand(0, 3))];
    g.beginPath();
    g.arc(x, y, 2, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(220,160,40,.9)";
    g.beginPath();
    g.arc(x, y, 0.8, 0, TAU);
    g.fill();
  }
  // worn dirt patch in the pen
  const inner = 6;
  g.fillStyle = "rgba(196,170,120,.55)";
  rr(g, PEN.x + inner, PEN.y + inner, PEN.w - inner * 2, PEN.h - inner * 2, 16);
  g.fill();
  g.fillStyle = "rgba(160,135,90,.3)";
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(rand(PEN.x + 20, PEN.x + PEN.w - 20), rand(PEN.y + 20, PEN.y + PEN.h - 20), rand(1, 3), 0, TAU);
    g.fill();
  }
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* stars for night */
const stars = [];
for (let i = 0; i < 110; i++) stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 1.8), p: rand(0, TAU) });

function nightTint(t) {
  // keyframes: {t, r,g,b, a}
  const K = [
    { t: 0, r: 255, g: 200, b: 120, a: 0 },
    { t: 0.45, r: 255, g: 185, b: 110, a: 0.05 },
    { t: 0.66, r: 236, g: 120, b: 80, a: 0.16 },
    { t: 0.82, r: 90, g: 70, b: 130, a: 0.32 },
    { t: 1, r: 16, g: 22, b: 58, a: 0.58 },
  ];
  let a = K[0],
    b = K[K.length - 1];
  for (let i = 0; i < K.length - 1; i++)
    if (t >= K[i].t && t <= K[i + 1].t) {
      a = K[i];
      b = K[i + 1];
      break;
    }
  const f = (t - a.t) / Math.max(0.0001, b.t - a.t);
  return { r: lerp(a.r, b.r, f) | 0, g: lerp(a.g, b.g, f) | 0, b: lerp(a.b, b.b, f) | 0, a: lerp(a.a, b.a, f) };
}

function render() {
  const { s, ox, oy } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#243018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(s, 0, 0, s, ox, oy);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  if (grassCanvas) ctx.drawImage(grassCanvas, 0, 0);
  else {
    ctx.fillStyle = "#8aad52";
    ctx.fillRect(0, 0, W, H);
  }

  drawRoad();
  drawPonds();
  drawPen();
  drawWallsAndRocks();
  drawDeadSheep();
  for (const c of cars) drawCar(c);
  for (const sp of sheep) drawSheep(sp);
  drawDog();
  for (const wf of wolves) drawWolf(wf);
  drawTreeCanopies();
  drawGhosts();

  // bark ripples
  for (const r of ripples) {
    const f = r.t / 0.6;
    ctx.strokeStyle = `rgba(255,250,230,${(1 - f) * 0.75})`;
    ctx.lineWidth = 3 * (1 - f) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 20 + f * BARK_R, 0, TAU);
    ctx.stroke();
  }
  // pen puffs
  for (const p of puffs) {
    const f = p.t / p.life;
    ctx.fillStyle = `rgba(255,255,255,${(1 - f) * 0.8})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + f), 0, TAU);
    ctx.fill();
  }

  /* --- day/night --- */
  const dayT = state === "play" || state === "win" || state === "lose" ? 1 - timeLeft / timeTotal : 0.15;
  const c = nightTint(dayT);
  if (c.a > 0.005) {
    if (c.a > 0.2 && state === "play") {
      // lantern glow around the dog
      const g = ctx.createRadialGradient(dog.x, dog.y, 40, dog.x, dog.y, 520);
      g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${c.a * 0.25})`);
      g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},${c.a})`);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a})`;
    }
    ctx.fillRect(0, 0, W, H);
  }
  if (c.a > 0.3) {
    const sa = (c.a - 0.3) / 0.28;
    for (const st of stars) {
      const tw = 0.5 + 0.5 * Math.sin(nowT * 2 + st.p);
      ctx.fillStyle = `rgba(255,250,230,${sa * tw * 0.8})`;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, TAU);
      ctx.fill();
    }
  }
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(20,24,10,.28)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawRoad() {
  if (!road) return;
  ctx.fillStyle = "#9a937f";
  ctx.fillRect(road.x - road.w / 2, 0, road.w, H);
  ctx.fillStyle = "#857e6c";
  ctx.fillRect(road.x - road.w / 2, 0, 6, H);
  ctx.fillRect(road.x + road.w / 2 - 6, 0, 6, H);
  ctx.strokeStyle = "rgba(246,239,223,.8)";
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 30]);
  ctx.beginPath();
  ctx.moveTo(road.x, 0);
  ctx.lineTo(road.x, H);
  ctx.stroke();
  ctx.setLineDash([]);
}
function drawPonds() {
  for (const c of circles) {
    if (c.k !== "pond") continue;
    ctx.fillStyle = "rgba(70,110,80,.4)";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 6, c.r * 1.06, c.r * 0.92, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#5d92b8";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r, c.r * 0.86, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#7fb2d4";
    ctx.beginPath();
    ctx.ellipse(c.x - c.r * 0.15, c.y - c.r * 0.18, c.r * 0.7, c.r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = nowT * 0.6 + i * 2.1;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(a) * c.r * 0.4, c.y + Math.sin(a) * c.r * 0.3, 6 + i * 3, 0, Math.PI);
      ctx.stroke();
    }
  }
}
function drawWallsAndRocks() {
  // fences (incl. pen walls)
  for (const wl of walls) {
    ctx.fillStyle = "rgba(60,50,30,.25)";
    ctx.fillRect(wl.x + 3, wl.y + 4, wl.w, wl.h);
    ctx.fillStyle = wl.pen ? "#a3742f" : "#8f6b3c";
    ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    ctx.fillStyle = "rgba(255,235,190,.25)";
    ctx.fillRect(wl.x, wl.y, wl.w, 3);
    // posts
    ctx.fillStyle = "#6e5128";
    if (wl.w > wl.h) {
      for (let x = wl.x + 8; x < wl.x + wl.w - 6; x += 34) ctx.fillRect(x, wl.y - 2, 7, wl.h + 4);
    } else {
      for (let y = wl.y + 8; y < wl.y + wl.h - 6; y += 34) ctx.fillRect(wl.x - 2, y, wl.w + 4, 7);
    }
  }
  // rocks + tree trunks
  for (const c of circles) {
    if (c.k === "rock") {
      ctx.fillStyle = "rgba(50,60,30,.3)";
      ctx.beginPath();
      ctx.ellipse(c.x + 4, c.y + 6, c.r, c.r * 0.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#8d8d85";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r, c.r * 0.85, -0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#a8a89e";
      ctx.beginPath();
      ctx.ellipse(c.x - c.r * 0.2, c.y - c.r * 0.25, c.r * 0.6, c.r * 0.45, -0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(70,70,64,.5)";
      ctx.beginPath();
      ctx.ellipse(c.x + c.r * 0.3, c.y + c.r * 0.3, c.r * 0.3, c.r * 0.2, 0.3, 0, TAU);
      ctx.fill();
    } else if (c.k === "tree") {
      ctx.fillStyle = "rgba(50,60,30,.35)";
      ctx.beginPath();
      ctx.ellipse(c.x + 6, c.y + 8, c.r * 0.95, c.r * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#6e5128";
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * 0.22, 0, TAU);
      ctx.fill();
    }
  }
}
function drawTreeCanopies() {
  for (const c of circles) {
    if (c.k !== "tree") continue;
    const sway = Math.sin(nowT * 0.7 + c.x) * 2;
    ctx.fillStyle = "#4e7a33";
    ctx.beginPath();
    ctx.arc(c.x + sway, c.y - 6, c.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#639645";
    ctx.beginPath();
    ctx.arc(c.x + sway - c.r * 0.25, c.y - 6 - c.r * 0.28, c.r * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(180,220,120,.35)";
    ctx.beginPath();
    ctx.arc(c.x + sway - c.r * 0.3, c.y - 6 - c.r * 0.35, c.r * 0.3, 0, TAU);
    ctx.fill();
  }
}
function drawPen() {
  // gate posts marking the opening
  const stub = (PEN.h - PEN.gate) / 2;
  ctx.fillStyle = "#f0e3c0";
  ctx.beginPath();
  ctx.arc(PEN.x + PEN.t / 2, PEN.y + stub, 8, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(PEN.x + PEN.t / 2, PEN.y + PEN.h - stub, 8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#6e5128";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(PEN.x + PEN.t / 2, PEN.y + stub, 8, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(PEN.x + PEN.t / 2, PEN.y + PEN.h - stub, 8, 0, TAU);
  ctx.stroke();
  // a small flag so players spot the goal
  const fx = PEN.x + PEN.w / 2,
    fy = PEN.y - 8;
  ctx.strokeStyle = "#6e5128";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx, fy - 46);
  ctx.stroke();
  ctx.fillStyle = "#c4552e";
  const wave = Math.sin(nowT * 3) * 3;
  ctx.beginPath();
  ctx.moveTo(fx, fy - 46);
  ctx.lineTo(fx + 34, fy - 40 + wave);
  ctx.lineTo(fx, fy - 30);
  ctx.closePath();
  ctx.fill();
}
function drawDeadSheep() {
  // the fallen sheep: on its back, little legs in the air, fading away
  for (const d of deaths) {
    const fade = 1 - Math.max(0, (d.t - 4) / 3); // solid 4s, then fades out
    if (fade <= 0) continue;
    const sz = d.size;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.dir + Math.PI / 2);
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(60,65,35,.35)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 12 * sz, 7 * sz, 0, 0, TAU);
    ctx.fill();
    // wool belly-up
    ctx.fillStyle = "#dad4c2";
    ctx.strokeStyle = "rgba(110,95,70,.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11 * sz, 7.5 * sz, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // four stiff little legs pointing up
    ctx.strokeStyle = "#4a3b2c";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const [lx, ly] of [
      [-6, -3],
      [-6, 3],
      [4, -3],
      [4, 3],
    ]) {
      ctx.beginPath();
      ctx.moveTo(lx * sz, ly * sz);
      ctx.lineTo(lx * sz + (ly < 0 ? -2 : 2), ly * sz + (ly < 0 ? -7 : 7));
      ctx.stroke();
    }
    // head flopped to the side, X eye
    ctx.fillStyle = "#4a3b2c";
    ctx.beginPath();
    ctx.ellipse(11 * sz, 2 * sz, 4.2 * sz, 3.4 * sz, 0.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#f6efdf";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10 * sz, 0.5 * sz);
    ctx.lineTo(12.4 * sz, 2.8 * sz);
    ctx.moveTo(12.4 * sz, 0.5 * sz);
    ctx.lineTo(10 * sz, 2.8 * sz);
    ctx.stroke();
    ctx.restore();
  }
}
function drawGhosts() {
  // a small sheep-spirit drifts up for the first couple of seconds
  for (const d of deaths) {
    if (d.t > 2.2) continue;
    const f = d.t / 2.2;
    const y = d.y - 14 - f * 60;
    const a = (1 - f) * 0.85;
    const sway = Math.sin(d.t * 5) * 3;
    ctx.save();
    ctx.translate(d.x + sway, y);
    ctx.globalAlpha = a;
    // halo
    ctx.strokeStyle = "#f7e9a0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -12, 7, 2.6, 0, 0, TAU);
    ctx.stroke();
    // wispy wool body with a tapering tail
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 7, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-7, 3);
    ctx.quadraticCurveTo(0, 14 + f * 6, 7, 3);
    ctx.closePath();
    ctx.fill();
    // closed eyes
    ctx.strokeStyle = "#8a8070";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-3, -1, 1.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3, -1, 1.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
  }
}
function drawSheep(s) {
  const sp = hyp(s.vx, s.vy);
  const bob = Math.sin(s.phase + nowT * (4 + sp * 0.18)) * (sp > 8 ? 1.4 : 0.5);
  ctx.save();
  ctx.translate(s.x, s.y);
  // shadow
  ctx.fillStyle = "rgba(50,60,25,.3)";
  ctx.beginPath();
  ctx.ellipse(0, 5, 11 * s.size, 6 * s.size, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(s.dir);
  ctx.translate(0, bob * 0.4);
  const sz = s.size;
  // wool body: overlapping blobs
  const wool = s.penned ? "#fffdf4" : "#f7f3e6";
  ctx.fillStyle = wool;
  ctx.strokeStyle = "rgba(110,95,70,.4)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11 * sz, 8 * sz, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-6 * sz, -3 * sz, 5.5 * sz, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-4 * sz, 3.5 * sz, 5 * sz, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3 * sz, -4 * sz, 5 * sz, 0, TAU);
  ctx.fill();
  // head
  ctx.fillStyle = "#4a3b2c";
  ctx.beginPath();
  ctx.ellipse(10.5 * sz, 0, 4.6 * sz, 3.6 * sz, 0, 0, TAU);
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.ellipse(8.5 * sz, -3.6 * sz, 2.6 * sz, 1.4 * sz, -0.5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8.5 * sz, 3.6 * sz, 2.6 * sz, 1.4 * sz, 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawDog() {
  const sp = hyp(dog.vx, dog.vy);
  ctx.save();
  ctx.translate(dog.x, dog.y);
  ctx.fillStyle = "rgba(50,60,25,.35)";
  ctx.beginPath();
  ctx.ellipse(0, 6, 14, 7, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(dog.dir);
  // tail (wags faster when running)
  const wag = Math.sin(nowT * (6 + sp * 0.06)) * 0.5;
  ctx.strokeStyle = "#2e2620";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.quadraticCurveTo(-20, wag * 8, -23, -6 + wag * 7);
  ctx.stroke();
  // body
  ctx.fillStyle = "#2e2620";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 7.5, 0, 0, TAU);
  ctx.fill();
  // white chest blaze
  ctx.fillStyle = "#f6efdf";
  ctx.beginPath();
  ctx.ellipse(4, 0, 5, 4, 0, 0, TAU);
  ctx.fill();
  // head
  ctx.fillStyle = "#2e2620";
  ctx.beginPath();
  ctx.arc(12, 0, 6.4, 0, TAU);
  ctx.fill();
  // snout
  ctx.beginPath();
  ctx.ellipse(17.5, 0, 3.6, 2.6, 0, 0, TAU);
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(9, -5);
  ctx.lineTo(12, -10);
  ctx.lineTo(14, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9, 5);
  ctx.lineTo(12, 10);
  ctx.lineTo(14, 4);
  ctx.closePath();
  ctx.fill();
  // collar
  ctx.strokeStyle = "#c4552e";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(8.5, 0, 5.6, -1.2, 1.2);
  ctx.stroke();
  // eye
  ctx.fillStyle = "#f6efdf";
  ctx.beginPath();
  ctx.arc(13.5, -2.4, 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawWolf(wf) {
  ctx.save();
  ctx.translate(wf.x, wf.y);
  ctx.fillStyle = "rgba(20,25,15,.4)";
  ctx.beginPath();
  ctx.ellipse(0, 6, 16, 7, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(wf.dir);
  const prowl = Math.sin(nowT * 5 + wf.orbit) * 0.6;
  ctx.translate(0, prowl);
  // tail
  ctx.strokeStyle = "#474750";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(-24, 3);
  ctx.stroke();
  // body
  ctx.fillStyle = "#474750";
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 7.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#5a5a64";
  ctx.beginPath();
  ctx.ellipse(-2, -2, 10, 4.5, 0, 0, TAU);
  ctx.fill();
  // head with pointed snout
  ctx.fillStyle = "#474750";
  ctx.beginPath();
  ctx.moveTo(8, -5.5);
  ctx.lineTo(22, 0);
  ctx.lineTo(8, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, 0, 5.8, 0, TAU);
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.moveTo(7, -4);
  ctx.lineTo(9, -10);
  ctx.lineTo(12, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7, 4);
  ctx.lineTo(9, 10);
  ctx.lineTo(12, 4);
  ctx.closePath();
  ctx.fill();
  // glowing eyes
  ctx.fillStyle = "#f5b53a";
  ctx.beginPath();
  ctx.arc(12, -2.2, 1.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(12, 2.2, 1.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawCar(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  if (c.vy < 0) ctx.rotate(Math.PI);
  ctx.fillStyle = "rgba(40,40,30,.35)";
  ctx.beginPath();
  ctx.ellipse(3, 4, c.w * 0.55, c.h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = c.color;
  rr(ctx, -c.w / 2, -c.h / 2, c.w, c.h, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(200,230,245,.9)";
  rr(ctx, -c.w / 2 + 5, c.h / 2 - 24, c.w - 10, 12, 4);
  ctx.fill();
  rr(ctx, -c.w / 2 + 5, -c.h / 2 + 8, c.w - 10, 10, 4);
  ctx.fill();
  ctx.fillStyle = "#f7e9a0";
  ctx.beginPath();
  ctx.arc(-c.w / 2 + 7, c.h / 2 - 4, 3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c.w / 2 - 7, c.h / 2 - 4, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}
