"use strict";
/* Shepherd's Dog — tiny WebAudio synth (SFX) + mute state */

/* ---------- audio (tiny WebAudio synth) ---------- */
let AC = null;
function audio() {
  if (save.muted) return null;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    return AC;
  } catch (e) {
    return null;
  }
}
function tone(freq, dur, type, vol, slideTo) {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ac.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + dur + 0.02);
}
const sfx = {
  woof() {
    tone(170, 0.09, "square", 0.18, 75);
    setTimeout(() => tone(140, 0.07, "square", 0.12, 70), 60);
  },
  ding() {
    tone(740, 0.22, "triangle", 0.14);
    tone(1108, 0.3, "triangle", 0.06);
  },
  howl() {
    tone(300, 0.9, "sine", 0.1, 560);
    setTimeout(() => tone(560, 0.7, "sine", 0.07, 260), 350);
  },
  lose() {
    tone(220, 0.5, "sawtooth", 0.1, 70);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.28, "triangle", 0.13), i * 120));
  },
  baa() {
    tone(rand(420, 520), 0.15, "sawtooth", 0.035, 380);
  },
  dead() {
    tone(480, 0.5, "triangle", 0.14, 160);
    tone(110, 0.35, "sine", 0.16, 55);
  },
};
