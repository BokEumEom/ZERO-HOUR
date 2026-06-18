"use strict";
/* Shepherd's Dog — input, UI flow, attract mode, main loop + bootstrap */

/* =========================================================
INPUT — pointer events cover mouse + touch
========================================================= */
function toWorld(e) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sx = e.clientX * dpr,
    sy = e.clientY * dpr;
  // portrait: invert the 90° CCW camera rotation so drags map to the right spot
  if (view.rot) {
    return { x: W - (sy - view.oy) / view.s, y: (sx - view.ox) / view.s };
  }
  return { x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s };
}
// Touch = relative floating joystick (Zero Hour style): a stick appears where
// you press and you steer the dog by DIRECTION — the finger never has to cover
// the dog. Mouse keeps the simpler follow-cursor behaviour. Tap = bark.
const stick = document.getElementById("stick");
const stickKnob = document.getElementById("stickKnob");
const STICK_R = 52; // max knob travel (px)
const LEAD = 360; // how far ahead of the dog we steer (world units)
let pDown = null; // {mouse:true} | {sx,sy,t,moved}
let steer = null; // held direction in WORLD space: {wx,wy,mag}

function followMouse(e) {
  const p = toWorld(e);
  dog.tx = clamp(p.x, 20, W - 20);
  dog.ty = clamp(p.y, 20, H - 20);
}
canvas.addEventListener("pointerdown", (e) => {
  audio(); // unlock on first gesture
  if (e.pointerType === "mouse") {
    pDown = { mouse: true };
    followMouse(e);
    return;
  }
  pDown = { sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
  stick.style.left = e.clientX + "px";
  stick.style.top = e.clientY + "px";
  stick.classList.add("on");
  stickKnob.style.transform = "translate(-50%,-50%)";
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") {
    if (pDown) followMouse(e);
    return;
  }
  if (!pDown || pDown.mouse) return;
  const dx = e.clientX - pDown.sx,
    dy = e.clientY - pDown.sy;
  const d = Math.hypot(dx, dy);
  pDown.moved = Math.max(pDown.moved, d);
  if (d < 8) {
    steer = null;
    stickKnob.style.transform = "translate(-50%,-50%)";
    return;
  }
  const k = Math.min(d, STICK_R),
    nx = dx / d,
    ny = dy / d;
  stickKnob.style.transform = "translate(calc(-50% + " + nx * k + "px), calc(-50% + " + ny * k + "px))";
  // remap screen direction -> world direction (portrait rotates the camera CCW)
  steer = { wx: view.rot ? -ny : nx, wy: view.rot ? nx : ny, mag: Math.min(d / STICK_R, 1) };
});
function endTouch() {
  if (pDown && !pDown.mouse) {
    const dt = performance.now() - pDown.t;
    if (dt < 280 && pDown.moved < 14) bark();
    stick.classList.remove("on");
  }
  pDown = null;
  steer = null;
  if (typeof dog !== "undefined" && dog) {
    dog.tx = dog.x;
    dog.ty = dog.y;
  } // release = stop
}
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);
addEventListener("contextmenu", (e) => e.preventDefault());

/* =========================================================
UI FLOW
========================================================= */
const $ = (id) => document.getElementById(id);
const hud = $("hud"),
  barkHint = $("barkHint");
const hudLevel = $("hudLevel"),
  hudPenned = $("hudPenned"),
  hudNeed = $("hudNeed"),
  hudScore = $("hudScore"),
  timeFill = $("timeFill"),
  timeIcon = $("timeIcon");
const winBreakdown = $("winBreakdown"),
  winScore = $("winScore"),
  finalScore = $("finalScore"),
  loseTitle = $("loseTitle"),
  loseText = $("loseText"),
  btnNext = $("btnNext");

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  if (id) $(id).classList.add("active");
}
function toMenu() {
  state = "menu";
  hud.classList.remove("on");
  barkHint.classList.remove("on");
  buildLevelRow();
  $("totalScoreLine").textContent = totalScore() > 0 ? `Total score: ${totalScore()}` : "";
  show("screen-start");
}
function buildLevelRow() {
  const row = $("levelRow");
  row.innerHTML = "";
  for (let i = 0; i < 10; i++) {
    const b = document.createElement("button");
    b.className = "lvl" + (i + 1 > save.unlocked ? " locked" : save.scores[i] !== undefined ? " done" : "");
    b.textContent = i + 1;
    b.title = LEVELS[i].name;
    b.addEventListener("click", () => openIntro(i));
    row.appendChild(b);
  }
}
function openIntro(lv) {
  startLevel(lv);
  state = "intro";
  $("introKicker").textContent = `Level ${lv + 1} of 10`;
  $("introName").textContent = LEVELS[lv].name;
  $("introGoal").innerHTML =
    `Herd <b>${needFor(lv)} of ${LEVELS[lv].sheep}</b> sheep into the pen before nightfall.<br>${LEVELS[lv].blurb}`;
  const warns = [];
  if (LEVELS[lv].wolves)
    warns.push(
      LEVELS[lv].wolves > 1
        ? "⚠ Two wolves hunt here — they will kill stragglers. Run at them or bark to drive them off."
        : "⚠ A wolf hunts here — it will kill stragglers. Run at it or bark to drive it off.",
    );
  if (LEVELS[lv].road) warns.push("⚠ The carts will not stop. Sheep caught on the road are lost.");
  $("introWarn").innerHTML = warns.join("<br>");
  show("screen-intro");
}
function beginPlay() {
  state = "play";
  show(null);
  hud.classList.add("on");
  if (barks < 3) barkHint.classList.add("on");
}

$("btnPlay").addEventListener("click", () => openIntro(Math.min(save.unlocked, 10) - 1));
$("btnBegin").addEventListener("click", beginPlay);
$("btnNext").addEventListener("click", () => openIntro(level + 1));
$("btnRetry").addEventListener("click", () => openIntro(level));
$("btnWinMenu").addEventListener("click", toMenu);
$("btnLoseMenu").addEventListener("click", toMenu);
$("btnFinalMenu").addEventListener("click", toMenu);
const muteBtn = $("muteBtn");
function syncMute() {
  muteBtn.textContent = save.muted ? "✕" : "♪";
  muteBtn.style.opacity = save.muted ? 0.5 : 1;
}
muteBtn.addEventListener("click", () => {
  save.muted = !save.muted;
  persist();
  syncMute();
});
syncMute();

/* ---------- pause / quit ---------- */
// Drop any held input so a steer/bark can't survive a state transition (ADR-0003).
function resetInput() {
  pDown = null;
  steer = null;
  stick.classList.remove("on");
  stickKnob.style.transform = "translate(-50%,-50%)";
  if (typeof dog !== "undefined" && dog) {
    dog.tx = dog.x;
    dog.ty = dog.y;
  }
}
function pauseGame() {
  if (state !== "play") return;
  state = "paused";
  resetInput();
  barkHint.classList.remove("on");
  show("screen-pause");
}
function resumeGame() {
  if (state !== "paused") return;
  state = "play";
  resetInput();
  last = performance.now(); // avoid a dt spike from the paused interval
  show(null);
  if (barks < 3) barkHint.classList.add("on");
}
$("pauseBtn").addEventListener("click", pauseGame);
$("btnResume").addEventListener("click", resumeGame);
$("btnPauseRestart").addEventListener("click", () => openIntro(level));
$("btnPauseMenu").addEventListener("click", toMenu);
// keyboard: Esc / P toggles pause during play
addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "p" || e.key === "P") {
    if (state === "play") pauseGame();
    else if (state === "paused") resumeGame();
  }
});

/* attract-mode scene behind the start menu */
function buildAttract() {
  startLevel(0);
  state = "menu";
  // scatter a calm flock mid-field for the backdrop
  for (const s of sheep) {
    s.x = rand(500, 1100);
    s.y = rand(300, 700);
  }
  dog.x = 400;
  dog.y = 750;
  dog.tx = dog.x;
  dog.ty = dog.y;
}

/* ---------- main loop ---------- */
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  if (state === "menu") {
    // gentle idle: sheep graze, dog naps
    nowT += dt;
    updateSheep(dt * 0.6);
  } else {
    // held joystick keeps steering the dog toward a point ahead in its direction
    if (steer && state === "play") {
      dog.tx = clamp(dog.x + steer.wx * LEAD * steer.mag, 20, W - 20);
      dog.ty = clamp(dog.y + steer.wy * LEAD * steer.mag, 20, H - 20);
    }
    update(dt);
  }
  render();
  requestAnimationFrame(frame);
}
buildAttract();
toMenu();
requestAnimationFrame(frame);
