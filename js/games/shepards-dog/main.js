"use strict";
/* Shepherd's Dog — input, UI flow, attract mode, main loop + bootstrap */

/* =========================================================
INPUT — pointer events cover mouse + touch
========================================================= */
function toWorld(e) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sx = e.clientX * dpr,
    sy = e.clientY * dpr;
  // portrait: invert the 90° camera rotation so drags map to the right spot
  if (view.rot) {
    return { x: (sy - view.oy) / view.s, y: H - (sx - view.ox) / view.s };
  }
  return { x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s };
}
let pDown = null;
canvas.addEventListener("pointerdown", (e) => {
  audio(); // unlock on first gesture
  const p = toWorld(e);
  pDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  dog.tx = clamp(p.x, 20, W - 20);
  dog.ty = clamp(p.y, 20, H - 20);
});
canvas.addEventListener("pointermove", (e) => {
  // mouse: dog always follows. touch: only while pressed.
  if (e.pointerType !== "mouse" && !pDown) return;
  const p = toWorld(e);
  dog.tx = clamp(p.x, 20, W - 20);
  dog.ty = clamp(p.y, 20, H - 20);
});
canvas.addEventListener("pointerup", (e) => {
  if (pDown) {
    const dt = performance.now() - pDown.t;
    const moved = hyp(e.clientX - pDown.x, e.clientY - pDown.y);
    if (dt < 280 && moved < 14) bark();
  }
  pDown = null;
});
canvas.addEventListener("pointercancel", () => (pDown = null));
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
    update(dt);
  }
  render();
  requestAnimationFrame(frame);
}
buildAttract();
toMenu();
requestAnimationFrame(frame);
