"use strict";
/* Shepherd's Dog — engine: state, levels, flocking simulation, win/lose */

/* =========================================================
Shepherd's Dog — a single-file flocking game
World units: 1600 x 1000, scaled to fit the window.
========================================================= */

const W = 1600,
  H = 1000;
const TAU = Math.PI * 2;

/* ---------- tiny math helpers ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const rand = (a, b) => a + Math.random() * (b - a);
function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/* ---------- save / load ---------- */
const SAVE_KEY = "shepherds_dog_v1";
let save = { unlocked: 1, scores: {}, muted: false };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = Object.assign(save, JSON.parse(raw));
} catch (e) {}
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {}
}
function totalScore() {
  return Object.values(save.scores).reduce((a, b) => a + b, 0);
}

/* ---------- level definitions ---------- */
/* circles: kind 'rock'|'tree'|'pond' block movement.
walls: rectangles (fences). road: vertical strip with cars. */
const LEVELS = [
  {
    name: "First Light",
    sheep: 18,
    time: 80,
    wolves: 0,
    circles: [],
    walls: [],
    road: null,
    blurb: "An open meadow. Learn how the flock breathes.",
  },
  {
    name: "Rocky Meadow",
    sheep: 24,
    time: 85,
    wolves: 0,
    road: null,
    walls: [],
    circles: [
      { k: "rock", x: 760, y: 320, r: 38 },
      { k: "rock", x: 700, y: 640, r: 46 },
      { k: "rock", x: 920, y: 500, r: 30 },
    ],
    blurb: "Boulders split the path. Keep the flock together.",
  },
  {
    name: "The Copse",
    sheep: 30,
    time: 90,
    wolves: 0,
    road: null,
    walls: [],
    circles: [
      { k: "tree", x: 650, y: 250, r: 42 },
      { k: "tree", x: 750, y: 190, r: 36 },
      { k: "tree", x: 830, y: 300, r: 40 },
      { k: "rock", x: 760, y: 620, r: 40 },
      { k: "rock", x: 960, y: 450, r: 34 },
      { k: "rock", x: 620, y: 520, r: 30 },
    ],
    blurb: "A stand of trees. Sheep slip between the trunks.",
  },
  {
    name: "The Narrow Gate",
    sheep: 36,
    time: 95,
    wolves: 0,
    road: null,
    walls: [
      { x: 790, y: 70, w: 18, h: 310 },
      { x: 790, y: 620, w: 18, h: 310 },
    ],
    circles: [
      { k: "rock", x: 1050, y: 300, r: 34 },
      { k: "rock", x: 1020, y: 690, r: 38 },
    ],
    blurb: "A long fence with one gap. Funnel them through.",
  },
  {
    name: "Millpond",
    sheep: 42,
    time: 95,
    wolves: 0,
    road: null,
    walls: [],
    circles: [
      { k: "pond", x: 830, y: 500, r: 120 },
      { k: "rock", x: 640, y: 250, r: 36 },
      { k: "rock", x: 660, y: 740, r: 40 },
      { k: "tree", x: 1030, y: 320, r: 36 },
    ],
    blurb: "Sheep will not swim. Split around the water.",
  },
  {
    name: "The Old Road",
    sheep: 45,
    time: 100,
    wolves: 0,
    road: { x: 790, w: 120, cars: 4, speed: 210 },
    walls: [],
    circles: [
      { k: "tree", x: 600, y: 240, r: 38 },
      { k: "tree", x: 580, y: 710, r: 42 },
    ],
    blurb: "Carts rattle down the road. Time your crossing!",
  },
  {
    name: "Wolf Country",
    sheep: 50,
    time: 100,
    wolves: 1,
    road: null,
    walls: [],
    circles: [
      { k: "tree", x: 700, y: 300, r: 40 },
      { k: "tree", x: 780, y: 240, r: 34 },
      { k: "tree", x: 640, y: 650, r: 40 },
      { k: "rock", x: 980, y: 500, r: 36 },
      { k: "rock", x: 900, y: 730, r: 30 },
    ],
    blurb: "Something gray watches from the treeline…",
  },
  {
    name: "Two Waters",
    sheep: 56,
    time: 105,
    wolves: 0,
    road: null,
    walls: [
      { x: 1020, y: 70, w: 18, h: 290 },
      { x: 1020, y: 640, w: 18, h: 290 },
    ],
    circles: [
      { k: "pond", x: 700, y: 290, r: 95 },
      { k: "pond", x: 810, y: 650, r: 105 },
      { k: "rock", x: 560, y: 490, r: 34 },
    ],
    blurb: "Ponds and a fenced gap. Thread the needle.",
  },
  {
    name: "Dusk Crossing",
    sheep: 66,
    time: 110,
    wolves: 1,
    road: { x: 700, w: 120, cars: 3, speed: 190 },
    walls: [],
    circles: [
      { k: "rock", x: 990, y: 300, r: 36 },
      { k: "rock", x: 1010, y: 660, r: 40 },
      { k: "rock", x: 560, y: 360, r: 30 },
      { k: "tree", x: 930, y: 490, r: 38 },
    ],
    blurb: "Carts on the road and a wolf in the grass.",
  },
  {
    name: "The Long Night",
    sheep: 75,
    time: 140,
    wolves: 2,
    road: { x: 980, w: 110, cars: 2, speed: 170 },
    walls: [
      { x: 560, y: 70, w: 18, h: 280 },
      { x: 560, y: 650, w: 18, h: 280 },
    ],
    circles: [
      { k: "pond", x: 840, y: 250, r: 85 },
      { k: "rock", x: 820, y: 620, r: 40 },
      { k: "rock", x: 710, y: 470, r: 30 },
    ],
    blurb: "Everything the hills can throw at you. Bring them all home.",
  },
];
// win threshold ramps from a gentle 70% (tutorial) up to 80% (late game),
// so the first levels leave more margin for stray sheep.
const WIN_RATIO = [0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.8, 0.8, 0.8, 0.8];
const needFor = (lv) => Math.ceil(LEVELS[lv].sheep * (WIN_RATIO[lv] ?? 0.8));

/* ---------- pen geometry ---------- */
const PEN = { x: 1290, y: 365, w: 250, h: 270, t: 14, gate: 150 };
function penWalls() {
  const { x, y, w, h, t, gate } = PEN;
  const stub = (h - gate) / 2;
  return [
    { x, y, w, h: t, pen: true }, // top
    { x, y: y + h - t, w, h: t, pen: true }, // bottom
    { x: x + w - t, y, w: t, h, pen: true }, // right
    { x, y, w: t, h: stub, pen: true }, // left top stub
    { x, y: y + h - stub, w: t, h: stub, pen: true }, // left bottom stub
  ];
}
function inPen(px, py, inset) {
  const i = inset || 0;
  return (
    px > PEN.x + PEN.t + i &&
    px < PEN.x + PEN.w - PEN.t - i &&
    py > PEN.y + PEN.t + i &&
    py < PEN.y + PEN.h - PEN.t - i
  );
}

/* ---------- game state ---------- */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let state = "menu"; // menu | intro | play | paused | win | lose | final
let level = 0;
let sheep = [],
  wolves = [],
  cars = [],
  walls = [],
  circles = [],
  road = null;
let dog = { x: 0, y: 0, vx: 0, vy: 0, dir: 0, tx: 0, ty: 0 };
let timeLeft = 0,
  timeTotal = 1,
  elapsed = 0;
let penned = 0,
  levelScore = 0,
  barkCD = 0,
  barks = 0,
  lost = 0;
let ripples = [],
  puffs = [],
  deaths = [];
let wolvesToSpawn = [];
let winDelay = 0;
let nowT = 0; // global clock for animation

/* ---------- entity setup ---------- */
function makeSheep(x, y) {
  return {
    x,
    y,
    vx: rand(-6, 6),
    vy: rand(-6, 6),
    dir: rand(0, TAU),
    fear: 0,
    penned: false,
    phase: rand(0, TAU),
    size: rand(0.88, 1.12),
    indep: Math.random(), // independence trait: high = strays more
    gx: x,
    gy: y,
    gT: rand(0, 4), // graze target + timer
    baaT: rand(4, 16),
  };
}
function startLevel(lv) {
  level = lv;
  const L = LEVELS[lv];
  walls = penWalls().concat(L.walls.map((w) => ({ ...w })));
  circles = L.circles.map((c) => ({ ...c }));
  road = L.road ? { ...L.road } : null;
  cars = [];
  if (road) {
    const lanes = [road.x - road.w / 4, road.x + road.w / 4];
    const n = road.cars || 4,
      sp = road.speed || 210;
    for (let i = 0; i < n; i++) {
      const lane = i % 2;
      cars.push({
        x: lanes[lane],
        y: rand(0, H),
        w: 36,
        h: 66,
        vy: (lane === 0 ? 1 : -1) * rand(sp * 0.9, sp * 1.1),
        color: ["#b34a32", "#3b5a8c", "#7a6a3a", "#5a3b6e"][i % 4],
      });
    }
  }
  sheep = [];
  const sx = lv >= 9 ? 200 : 240,
    sy = 500;
  for (let i = 0; i < L.sheep; i++) {
    const a = rand(0, TAU),
      r = Math.sqrt(Math.random()) * 130;
    sheep.push(makeSheep(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.8));
  }
  wolves = [];
  wolvesToSpawn = [];
  if (L.wolves >= 1) wolvesToSpawn.push(0.12);
  if (L.wolves >= 2) wolvesToSpawn.push(0.4);
  dog.x = sx;
  dog.y = sy + 260;
  dog.vx = dog.vy = 0;
  dog.tx = dog.x;
  dog.ty = dog.y;
  timeTotal = L.time;
  timeLeft = L.time;
  elapsed = 0;
  penned = 0;
  levelScore = 0;
  barkCD = 0;
  lost = 0;
  ripples = [];
  puffs = [];
  deaths = [];
  winDelay = 0;
  hudLost.textContent = "";
  buildGrass();
  hudLevel.textContent = lv + 1;
  hudNeed.textContent = needFor(lv);
  hudPenned.textContent = 0;
  hudScore.textContent = 0;
}

/* =========================================================
FLOCKING — the heart of the game.
Three classic boids forces + fear dynamics:
- fear in (0 .. ~0.55): flock KNITS TOGETHER and flows away
from the dog as one body (cohesion boosted).
- fear above ~0.75 (bark blast / wolf): cohesion collapses,
separation spikes -> believable radial SCATTER.
- fear decays -> stragglers drift back via cohesion + a
"rejoin the mob" pull when far from the local centroid.
========================================================= */
const SEP_R = 32,
  ALI_R = 84,
  COH_R = 175,
  COH_R2 = COH_R * COH_R;
const DOG_R = 175,
  BARK_R = 300,
  WOLF_R = 215;

function updateSheep(dt) {
  const flock = sheep.filter((s) => !s.penned && !s.dead);
  // flock centroid (for rejoin behaviour)
  let cX = 0,
    cY = 0;
  for (const s of flock) {
    cX += s.x;
    cY += s.y;
  }
  if (flock.length) {
    cX /= flock.length;
    cY /= flock.length;
  }
  // mob centroid includes penned sheep: as the pen fills, stragglers
  // are drawn toward the flock already inside (realistic snowball)
  let mX = 0,
    mY = 0;
  for (const s of sheep) {
    mX += s.x;
    mY += s.y;
  }
  if (sheep.length) {
    mX /= sheep.length;
    mY /= sheep.length;
  }

  const barkActive = barkCD > 0.35; // brief window after a bark

  for (const s of sheep) {
    if (s.dead) continue;
    if (s.penned) {
      updatePennedSheep(s, dt);
      continue;
    }

    let fx = 0,
      fy = 0;
    /* --- neighbours --- */
    let sepX = 0,
      sepY = 0,
      aliX = 0,
      aliY = 0,
      nAli = 0,
      cohX = 0,
      cohY = 0,
      nCoh = 0;
    for (const o of flock) {
      if (o === s) continue;
      const dx = o.x - s.x,
        dy = o.y - s.y,
        d2 = dx * dx + dy * dy;
      if (d2 > COH_R2) continue;
      const d = Math.sqrt(d2) || 0.001;
      if (d < SEP_R) {
        const w = (SEP_R - d) / SEP_R;
        sepX -= (dx / d) * w;
        sepY -= (dy / d) * w;
      }
      if (d < ALI_R) {
        aliX += o.vx;
        aliY += o.vy;
        nAli++;
      }
      cohX += o.x;
      cohY += o.y;
      nCoh++;
    }
    const fear = s.fear;
    // cohesion: boosted at herding-level fear, collapses in panic
    const cohFactor = fear < 0.55 ? 1 + fear * 1.6 : Math.max(0, (0.9 - fear) / 0.35);
    const sepW = 95 + 130 * fear;
    const aliW = 1.5 * (1 - fear * 0.55);
    const cohW = 11 * cohFactor;

    fx += sepX * sepW;
    fy += sepY * sepW;
    if (nAli) {
      fx += (aliX / nAli - s.vx) * aliW;
      fy += (aliY / nAli - s.vy) * aliW;
    }
    if (nCoh) {
      const mx = cohX / nCoh - s.x,
        my = cohY / nCoh - s.y;
      const m = hyp(mx, my) || 0.001;
      fx += (mx / m) * cohW;
      fy += (my / m) * cohW;
    }

    /* --- fear of the dog --- */
    const ddx = s.x - dog.x,
      ddy = s.y - dog.y;
    const dd = hyp(ddx, ddy) || 0.001;
    const R = DOG_R + (barkActive ? 110 : 0);
    if (dd < R) {
      const w = 1 - dd / R;
      s.fear = Math.min(1, s.fear + w * 3.2 * dt);
      const push = w * w * 560 + 60;
      fx += (ddx / dd) * push;
      fy += (ddy / dd) * push;
    }

    /* --- fear of wolves (stronger; triggers scatter) --- */
    for (const wf of wolves) {
      const wx = s.x - wf.x,
        wy = s.y - wf.y;
      const wd = hyp(wx, wy) || 0.001;
      if (wd < WOLF_R) {
        const w = 1 - wd / WOLF_R;
        s.fear = Math.min(1, s.fear + w * 4.2 * dt + 0.04);
        const push = w * w * 700 + 90;
        fx += (wx / wd) * push;
        fy += (wy / wd) * push;
      }
    }

    /* --- fear of cars --- */
    for (const c of cars) {
      const dirY = c.vy > 0 ? 1 : -1;
      const aheadY = (s.y - c.y) * dirY; // >0: sheep is in front of the cart
      const latX = Math.abs(s.x - c.x);
      if (aheadY > -40 && aheadY < 260 && latX < c.w / 2 + 55) {
        // standing in the cart's path: bolt sideways out of the lane
        const w = 1 - Math.max(0, aheadY) / 260;
        s.fear = Math.min(1, s.fear + w * 4.5 * dt);
        const side = s.x >= c.x ? 1 : -1;
        fx += side * (w * 560 + 160);
      } else {
        const cx = s.x - c.x,
          cy = s.y - c.y;
        const cd = hyp(cx, cy) || 0.001;
        if (cd < 100) {
          const w = 1 - cd / 100;
          s.fear = Math.min(1, s.fear + w * 2.5 * dt);
          fx += (cx / cd) * w * 380;
          fy += (cy / cd) * w * 380;
        }
      }
    }

    /* --- grazing & straying (only when calm) --- */
    if (fear < 0.12) {
      s.gT -= dt;
      if (s.gT <= 0) {
        // independent sheep occasionally wander off; most drift near the mob
        const stray = s.indep > 0.78 && Math.random() < 0.35;
        const range = stray ? 280 : 95;
        const a = rand(0, TAU),
          r = rand(20, range);
        // bias graze targets gently toward the flock centroid
        const bias = stray ? 0.05 : 0.3;
        s.gx = clamp(lerp(s.x + Math.cos(a) * r, cX, bias), 40, W - 40);
        s.gy = clamp(lerp(s.y + Math.sin(a) * r, cY, bias), 40, H - 40);
        s.gT = rand(3, 8);
      }
      const gx = s.gx - s.x,
        gy = s.gy - s.y,
        gd = hyp(gx, gy);
      if (gd > 14) {
        fx += (gx / gd) * 16;
        fy += (gy / gd) * 16;
      }
      // occasional bleat
      s.baaT -= dt;
      if (s.baaT <= 0) {
        s.baaT = rand(8, 26);
        if (Math.random() < 0.5) sfx.baa();
      }
    }

    /* --- mob instinct: weak long-range pull toward the flock,
     stronger the further a sheep (or split cluster) drifts --- */
    if (sheep.length > 1) {
      const rx = mX - s.x,
        ry = mY - s.y,
        rd = hyp(rx, ry);
      if (fear < 0.7 && rd > 30) {
        const w = 8 + clamp((rd - 180) / 200, 0, 1.6) * 70;
        fx += (rx / rd) * w;
        fy += (ry / rd) * w;
      }
    }

    /* --- obstacles & bounds --- */
    const av = avoidForces(s.x, s.y, 12, 55);
    fx += av.x;
    fy += av.y;
    if (s.x < 50) fx += (50 - s.x) * 4;
    if (s.x > W - 50) fx -= (s.x - (W - 50)) * 4;
    if (s.y < 50) fy += (50 - s.y) * 4;
    if (s.y > H - 50) fy -= (s.y - (H - 50)) * 4;

    /* --- integrate --- */
    s.vx += fx * dt;
    s.vy += fy * dt;
    const maxS = 26 + 155 * Math.pow(fear, 0.85);
    const sp = hyp(s.vx, s.vy);
    if (sp > maxS) {
      s.vx *= maxS / sp;
      s.vy *= maxS / sp;
    }
    s.vx *= Math.exp(-dt * 0.9);
    s.vy *= Math.exp(-dt * 0.9);
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    s.fear = Math.max(0, s.fear - dt * 0.28);

    resolveCollisions(s, 10);

    if (hyp(s.vx, s.vy) > 6) s.dir = lerpAngle(s.dir, Math.atan2(s.vy, s.vx), 1 - Math.exp(-dt * 7));

    /* --- captured? (only counts during live play) --- */
    if (state === "play" && inPen(s.x, s.y, 4)) {
      s.penned = true;
      s.fear = 0;
      penned++;
      levelScore += 10;
      hudPenned.textContent = penned;
      hudScore.textContent = levelScore;
      sfx.ding();
      for (let i = 0; i < 7; i++)
        puffs.push({
          x: s.x,
          y: s.y,
          vx: rand(-40, 40),
          vy: rand(-50, -8),
          life: rand(0.4, 0.8),
          t: 0,
          r: rand(2, 5),
        });
      if (penned >= needFor(level) && winDelay === 0) winDelay = 1.1;
    }
  }
}
function updatePennedSheep(s, dt) {
  s.gT -= dt;
  if (s.gT <= 0) {
    s.gx = rand(PEN.x + PEN.t + 26, PEN.x + PEN.w - PEN.t - 26);
    s.gy = rand(PEN.y + PEN.t + 26, PEN.y + PEN.h - PEN.t - 26);
    s.gT = rand(2, 6);
  }
  const gx = s.gx - s.x,
    gy = s.gy - s.y,
    gd = hyp(gx, gy);
  if (gd > 10) {
    s.vx += (gx / gd) * 30 * dt * 10;
    s.vy += (gy / gd) * 30 * dt * 10;
  }
  const sp = hyp(s.vx, s.vy),
    mx = 22;
  if (sp > mx) {
    s.vx *= mx / sp;
    s.vy *= mx / sp;
  }
  s.vx *= Math.exp(-dt * 2);
  s.vy *= Math.exp(-dt * 2);
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.x = clamp(s.x, PEN.x + PEN.t + 14, PEN.x + PEN.w - PEN.t - 14);
  s.y = clamp(s.y, PEN.y + PEN.t + 14, PEN.y + PEN.h - PEN.t - 14);
  if (hyp(s.vx, s.vy) > 4) s.dir = lerpAngle(s.dir, Math.atan2(s.vy, s.vx), 1 - Math.exp(-dt * 6));
}

/* steering push away from obstacles within lookahead */
function avoidForces(px, py, bodyR, look) {
  let ax = 0,
    ay = 0;
  for (const c of circles) {
    const dx = px - c.x,
      dy = py - c.y,
      d = hyp(dx, dy) || 0.001;
    const lim = c.r + bodyR + look;
    if (d < lim) {
      const w = (lim - d) / look;
      ax += (dx / d) * w * w * 420;
      ay += (dy / d) * w * w * 420;
    }
  }
  for (const wl of walls) {
    const nx = clamp(px, wl.x, wl.x + wl.w),
      ny = clamp(py, wl.y, wl.y + wl.h);
    const dx = px - nx,
      dy = py - ny,
      d = hyp(dx, dy) || 0.001;
    const lim = bodyR + look * 0.7;
    if (d < lim && d > 0.01) {
      const w = (lim - d) / lim;
      ax += (dx / d) * w * w * 460;
      ay += (dy / d) * w * w * 460;
    }
  }
  return { x: ax, y: ay };
}
/* hard position resolution against obstacles */
function resolveCollisions(e, bodyR) {
  for (const c of circles) {
    const dx = e.x - c.x,
      dy = e.y - c.y,
      d = hyp(dx, dy) || 0.001,
      min = c.r + bodyR;
    if (d < min) {
      e.x = c.x + (dx / d) * min;
      e.y = c.y + (dy / d) * min;
    }
  }
  for (const wl of walls) {
    const nx = clamp(e.x, wl.x, wl.x + wl.w),
      ny = clamp(e.y, wl.y, wl.y + wl.h);
    let dx = e.x - nx,
      dy = e.y - ny;
    let d = hyp(dx, dy);
    if (d < bodyR) {
      if (d < 0.01) {
        // inside the rect: push out the shortest way
        const l = e.x - wl.x,
          r = wl.x + wl.w - e.x,
          t = e.y - wl.y,
          b = wl.y + wl.h - e.y;
        const m = Math.min(l, r, t, b);
        if (m === l) e.x = wl.x - bodyR;
        else if (m === r) e.x = wl.x + wl.w + bodyR;
        else if (m === t) e.y = wl.y - bodyR;
        else e.y = wl.y + wl.h + bodyR;
      } else {
        e.x = nx + (dx / d) * bodyR;
        e.y = ny + (dy / d) * bodyR;
      }
    }
  }
  for (const c of cars) {
    const hw = c.w / 2 + bodyR,
      hh = c.h / 2 + bodyR;
    if (Math.abs(e.x - c.x) < hw && Math.abs(e.y - c.y) < hh) {
      const ox = hw - Math.abs(e.x - c.x),
        oy = hh - Math.abs(e.y - c.y);
      if (ox < oy) e.x += e.x > c.x ? ox : -ox;
      else e.y += e.y > c.y ? oy : -oy;
    }
  }
  e.x = clamp(e.x, 14, W - 14);
  e.y = clamp(e.y, 14, H - 14);
}

/* ---------- death ---------- */
function killSheep(s) {
  if (s.dead || s.penned) return;
  s.dead = true;
  lost++;
  hudLost.textContent = `−${lost}`;
  deaths.push({ x: s.x, y: s.y, dir: s.dir, size: s.size, t: 0 });
  for (let i = 0; i < 12; i++)
    puffs.push({
      x: s.x,
      y: s.y,
      vx: rand(-80, 80),
      vy: rand(-90, 10),
      life: rand(0.4, 0.9),
      t: 0,
      r: rand(2, 6),
    });
  sfx.dead();
  // witnessing a death terrifies the nearby flock
  for (const o of sheep) {
    if (o.penned || o.dead) continue;
    const d = hyp(o.x - s.x, o.y - s.y);
    if (d < 280) o.fear = Math.min(1, o.fear + (1 - d / 280) * 0.9);
  }
}

/* ---------- dog ---------- */
function updateDog(dt) {
  const dx = dog.tx - dog.x,
    dy = dog.ty - dog.y,
    d = hyp(dx, dy);
  const maxSp = 320;
  const desired = d > 4 ? Math.min(maxSp, d * 6) : 0;
  const dvx = d > 4 ? (dx / d) * desired : 0;
  const dvy = d > 4 ? (dy / d) * desired : 0;
  const k = 1 - Math.exp(-dt * 8);
  dog.vx = lerp(dog.vx, dvx, k);
  dog.vy = lerp(dog.vy, dvy, k);
  dog.x += dog.vx * dt;
  dog.y += dog.vy * dt;
  resolveCollisions(dog, 11);
  if (hyp(dog.vx, dog.vy) > 12) dog.dir = lerpAngle(dog.dir, Math.atan2(dog.vy, dog.vx), 1 - Math.exp(-dt * 9));
}
function bark() {
  if (barkCD > 0 || state !== "play") return;
  barkCD = 0.55;
  barks++;
  if (barks >= 3) barkHint.classList.remove("on");
  sfx.woof();
  ripples.push({ x: dog.x, y: dog.y, t: 0 });
  for (const s of sheep) {
    if (s.penned) continue;
    const dx = s.x - dog.x,
      dy = s.y - dog.y,
      d = hyp(dx, dy) || 0.001;
    if (d < BARK_R) {
      const w = 1 - d / BARK_R;
      s.fear = Math.min(1, s.fear + 0.35 + w * 0.45);
      s.vx += (dx / d) * w * 130;
      s.vy += (dy / d) * w * 130;
    }
  }
  // barks also frighten wolves a bit
  for (const wf of wolves) {
    const d = hyp(wf.x - dog.x, wf.y - dog.y);
    if (d < BARK_R * 1.2) wf.scare = Math.max(wf.scare, 1.2);
  }
}

/* ---------- wolves ---------- */
function spawnWolf() {
  const side = Math.random() < 0.5 ? -1 : 1;
  wolves.push({
    x: rand(500, 900),
    y: side < 0 ? -40 : H + 40,
    vx: 0,
    vy: 0,
    dir: 0,
    orbit: rand(0, TAU),
    radius: 460,
    scare: 0,
    feast: 0,
  });
  sfx.howl();
}
function updateWolves(dt) {
  const flock = sheep.filter((s) => !s.penned && !s.dead);
  let cX = W / 2,
    cY = H / 2;
  if (flock.length) {
    cX = 0;
    cY = 0;
    for (const s of flock) {
      cX += s.x;
      cY += s.y;
    }
    cX /= flock.length;
    cY /= flock.length;
  }
  for (const wf of wolves) {
    let tx, ty, sp;
    const dDog = hyp(wf.x - dog.x, wf.y - dog.y);
    if (dDog < 260) wf.scare = Math.max(wf.scare, 2.4);
    if (wf.scare > 0) {
      wf.scare -= dt;
      wf.feast = 0; // abandons the kill when the dog drives it off
      wf.radius = Math.min(520, wf.radius + 260 * dt);
      const ax = wf.x - dog.x,
        ay = wf.y - dog.y,
        ad = hyp(ax, ay) || 0.001;
      tx = wf.x + (ax / ad) * 220;
      ty = wf.y + (ay / ad) * 220;
      sp = 280;
    } else if (wf.feast > 0) {
      // gorging on a kill: stands still — the player's window to regroup
      wf.feast -= dt;
      tx = wf.x;
      ty = wf.y;
      sp = 0;
    } else {
      // nearest sheep; close enough -> commit to the hunt
      let prey = null,
        pd = 1e9;
      for (const s of flock) {
        const d = hyp(s.x - wf.x, s.y - wf.y);
        if (d < pd) {
          pd = d;
          prey = s;
        }
      }
      if (prey && (pd < 320 || wf.radius <= 180)) {
        tx = prey.x;
        ty = prey.y;
        sp = 320;
        if (pd < 22) {
          killSheep(prey);
          wf.feast = 4.5;
          wf.radius = 380;
        }
      } else {
        // prowl: orbit the flock, slowly tightening
        wf.orbit += dt * 0.22;
        wf.radius = Math.max(170, wf.radius - 13 * dt);
        tx = cX + Math.cos(wf.orbit) * wf.radius;
        ty = cY + Math.sin(wf.orbit) * wf.radius * 0.8;
        sp = 140;
      }
    }
    const dx = tx - wf.x,
      dy = ty - wf.y,
      d = hyp(dx, dy) || 0.001;
    const kRate = sp > 200 ? 6 : 3;
    const k = 1 - Math.exp(-dt * kRate);
    // when hunting (sp>200) run at full speed; only dampen for prowl/flee orbits
    const targetSp = sp > 200 ? sp : Math.min(sp, d * 3);
    wf.vx = lerp(wf.vx, (dx / d) * targetSp, k);
    wf.vy = lerp(wf.vy, (dy / d) * targetSp, k);
    wf.x += wf.vx * dt;
    wf.y += wf.vy * dt;
    resolveCollisions(wf, 11);
    if (hyp(wf.vx, wf.vy) > 8) wf.dir = lerpAngle(wf.dir, Math.atan2(wf.vy, wf.vx), 1 - Math.exp(-dt * 6));
  }
}

/* ---------- cars ---------- */
function updateCars(dt) {
  for (const c of cars) {
    c.y += c.vy * dt;
    if (c.vy > 0 && c.y > H + 90) c.y = -90;
    if (c.vy < 0 && c.y < -90) c.y = H + 90;
    // run over any sheep caught under the wheels (checked right after the
    // car moves, before collision resolution pushes them back out; the
    // 8px margin is inside the 10px resolve radius, so only sheep being
    // bulldozed head-on - not ones standing beside the road - get hit)
    for (const s of sheep) {
      if (s.penned || s.dead) continue;
      if (Math.abs(s.x - c.x) < c.w / 2 + 8 && Math.abs(s.y - c.y) < c.h / 2 + 8) killSheep(s);
    }
  }
}

/* ---------- main update ---------- */
function update(dt) {
  nowT += dt;
  if (state !== "play") return;
  elapsed += dt;
  timeLeft = Math.max(0, timeLeft - dt);
  barkCD = Math.max(0, barkCD - dt);

  // scheduled wolf arrivals
  while (wolvesToSpawn.length && elapsed / timeTotal >= wolvesToSpawn[0]) {
    wolvesToSpawn.shift();
    spawnWolf();
  }

  updateDog(dt);
  updateSheep(dt);
  updateWolves(dt);
  updateCars(dt);

  if (lost) sheep = sheep.filter((s) => !s.dead);

  for (const r of ripples) r.t += dt;
  ripples = ripples.filter((r) => r.t < 0.6);
  for (const p of puffs) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  puffs = puffs.filter((p) => p.t < p.life);
  for (const d of deaths) d.t += dt;
  deaths = deaths.filter((d) => d.t < 7);

  // HUD timer
  const frac = timeLeft / timeTotal;
  timeFill.style.transform = `scaleX(${frac})`;
  timeFill.style.background =
    frac > 0.35 ? "linear-gradient(90deg,#f7c248,#e8762d)" : "linear-gradient(90deg,#e8762d,#b3303a)";
  timeIcon.textContent = frac > 0.3 ? "☀︎" : "☾";

  if (winDelay > 0) {
    winDelay -= dt;
    if (winDelay <= 0) winLevel();
  } else if (sheep.length < needFor(level)) {
    loseLevel("flock"); // not enough sheep left alive to ever reach 80%
  } else if (timeLeft <= 0) {
    loseLevel("night");
  }
}

/* ---------- win / lose ---------- */
function winLevel() {
  state = "win";
  const timeBonus = Math.ceil(timeLeft) * 2;
  const total = levelScore + timeBonus;
  save.unlocked = Math.max(save.unlocked, Math.min(level + 2, 10));
  save.scores[level] = Math.max(save.scores[level] || 0, total);
  persist();
  sfx.win();
  winBreakdown.innerHTML =
    `<b>${penned}</b> sheep penned × 10 = <b>${levelScore}</b><br>` + `Daylight bonus <b>+${timeBonus}</b>`;
  winScore.textContent = total;
  if (level === 9) {
    finalScore.textContent = totalScore();
    show("screen-final");
    state = "final";
  } else {
    btnNext.textContent = `Next: ${LEVELS[level + 1].name}`;
    show("screen-win");
  }
  hud.classList.remove("on");
}
function loseLevel(reason) {
  state = "lose";
  sfx.lose();
  const had = penned,
    need = needFor(level);
  if (reason === "flock") {
    loseTitle.textContent = "Too few sheep remain";
    loseText.innerHTML =
      `<b>${lost}</b> sheep were lost — the flock can no longer reach <b>${need}</b>.` +
      (wolves.length ? "<br>Drive wolves off by running at them — or bark!" : "") +
      (cars.length ? "<br>Wait for a gap in the carts before crossing the road." : "");
  } else {
    loseTitle.textContent = wolves.length ? "The wolves take the night" : "The flock is lost in the dark";
    loseText.innerHTML =
      `You penned <b>${had}</b> of the <b>${need}</b> sheep needed before nightfall.` +
      (lost ? ` <b>${lost}</b> were lost along the way.` : "") +
      (wolves.length ? "<br>Drive wolves off by running at them — or bark!" : "");
  }
  show("screen-lose");
  hud.classList.remove("on");
}
