// Scoreyard — UI glue: loop, HUD, screens, records, share, touch
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.game;

  const $ = (id) => document.getElementById(id);
  let recs = { settings: { muted: false }, bestAll: null, dailyBest: null, today: SY.todayUTC() };
  let lastResult = null;
  let runBestPace = null; // daily pace snapshot for live comparison

  const fmt = (n) => n.toLocaleString('en-US');

  // ---------- boot ----------
  async function boot() {
    recs = await SY.store.loadAll();
    SY.audio.setMuted(!!recs.settings.muted);
    updateMuteBtn();
    renderMenuStats();
    requestAnimationFrame(loop);
  }

  // ---------- game loop ----------
  let lastT = 0;
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  function loop(t) {
    const dt = Math.min(1 / 30, (t - lastT) / 1000 || 0.016);
    lastT = t;
    G.update(dt);
    SY.render(ctx);
    updateHud();
    requestAnimationFrame(loop);
  }

  // ---------- HUD ----------
  const hudEls = {
    time: $('hud-time'), score: $('hud-score'), combo: $('hud-combo'),
    hearts: $('hud-hearts'), pace: $('hud-pace'), fx: $('hud-fx'), mode: $('hud-mode'),
  };

  function updateHud() {
    const s = G.state;
    const playing = G.phase === 'playing' || G.phase === 'ready';
    $('hud').style.visibility = playing ? 'visible' : 'hidden';
    if (!s || !playing) return;

    const tl = Math.max(0, s.timeLeft);
    hudEls.time.textContent = Math.ceil(tl).toString().padStart(2, '0');
    hudEls.time.classList.toggle('warn', tl <= 5.5);
    hudEls.score.textContent = fmt(s.score);
    hudEls.combo.textContent = s.combo > 1 ? '×' + s.combo : '';
    hudEls.mode.textContent = s.mode === 'daily' ? 'DAILY ' + recs.today : 'FREE PLAY';

    // hearts
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += i < s.player.hp ? '\u25c6 ' : '\u25c7 ';
    hudEls.hearts.textContent = hearts.trim();
    hudEls.hearts.classList.toggle('low', s.player.hp <= 1);

    // pace vs best (daily only, only when a best run exists)
    if (s.mode === 'daily' && runBestPace && runBestPace.length > 1) {
      const idx = Math.min(runBestPace.length - 1, Math.floor(s.t));
      const diff = s.score - runBestPace[idx];
      hudEls.pace.style.display = '';
      hudEls.pace.textContent = (diff >= 0 ? '+' : '\u2212') + fmt(Math.abs(diff)) + ' vs best';
      hudEls.pace.classList.toggle('ahead', diff >= 0);
      hudEls.pace.classList.toggle('behind', diff < 0);
    } else {
      hudEls.pace.style.display = 'none';
    }

    // active effect chips
    let chips = '';
    const meta = G.POWER_META;
    if (s.shield) chips += chip(meta.SHIELD, null);
    for (const k of ['MAGNET', 'SLOW', 'X2', 'BOOST', 'SPREAD']) {
      if (s.fx[k] > 0) chips += chip(meta[k], s.fx[k]);
    }
    hudEls.fx.innerHTML = chips;
  }

  function chip(meta, secs) {
    return '<span class="fx-chip" style="--c:' + meta.color + '">' + meta.label +
      (secs != null ? ' ' + Math.ceil(secs) : '') + '</span>';
  }

  // ---------- screens ----------
  function show(screenId) {
    for (const id of ['screen-menu', 'screen-over']) {
      $(id).classList.toggle('visible', id === screenId);
    }
  }

  function renderMenuStats() {
    $('menu-date').textContent = recs.today + ' (UTC)';
    $('menu-daily-best').textContent = recs.dailyBest
      ? 'TODAY\u2019S BEST ' + fmt(recs.dailyBest.score)
      : 'NO RUN YET TODAY';
    $('menu-all-best').textContent = recs.bestAll
      ? 'ALL-TIME BEST ' + fmt(recs.bestAll.score) + ' \u00b7 \u00d7' + recs.bestAll.combo + ' \u00b7 ' + recs.bestAll.date
      : 'ALL-TIME BEST \u2014';
  }

  function startGame(mode) {
    SY.audio.unlock();
    runBestPace = mode === 'daily' && recs.dailyBest ? recs.dailyBest.pace : null;
    G.start(mode);
    show(null);
  }

  // ---------- game over ----------
  G.events.onGameOver = async function (res) {
    lastResult = res;
    let newDaily = false, newAll = false;

    if (res.mode === 'daily') {
      if (!recs.dailyBest || res.score > recs.dailyBest.score) {
        newDaily = true;
        recs.dailyBest = { score: res.score, combo: res.maxCombo, pace: res.pace, bossDown: res.bossDown };
        SY.store.saveDaily(recs.today, recs.dailyBest);
      }
    }
    if (!recs.bestAll || res.score > recs.bestAll.score) {
      newAll = true;
      recs.bestAll = { score: res.score, combo: res.maxCombo, date: recs.today, mode: res.mode };
      SY.store.saveBestAll(recs.bestAll);
    }
    const isNewBest = newAll || newDaily;

    $('over-reason').textContent = res.reason === 'down' ? 'DRONE DESTROYED' : 'TIME UP';
    $('over-score').textContent = fmt(res.score);
    $('over-best-banner').classList.toggle('show', isNewBest);
    $('over-best-label').textContent = newAll ? 'NEW ALL-TIME BEST!' : 'NEW DAILY BEST!';
    $('over-stats').innerHTML =
      statRow('MAX COMBO', '\u00d7' + res.maxCombo) +
      statRow('CRYSTALS', fmt(res.collected)) +
      statRow('CORE WARDEN', res.bossDown ? 'CLEARED \u2726' : res.mode && res.duration >= 40 ? 'SURVIVED' : '\u2014') +
      statRow(res.mode === 'daily' ? 'TODAY\u2019S BEST' : 'ALL-TIME BEST',
        fmt(res.mode === 'daily' ? recs.dailyBest.score : recs.bestAll.score));

    $('btn-share').style.display = res.mode === 'daily' ? '' : 'none';
    $('btn-share').textContent = 'COPY RESULT';
    $('over-mode').textContent = res.mode === 'daily' ? 'DAILY \u00b7 ' + recs.today : 'FREE PLAY';

    renderMenuStats();
    setTimeout(() => {
      show('screen-over');
      if (isNewBest) setTimeout(() => SY.audio.newBest(), 350);
    }, 650);
  };

  function statRow(k, v) {
    return '<div class="stat-row"><span class="stat-k">' + k + '</span><span class="stat-v">' + v + '</span></div>';
  }

  // ---------- share string (no personal info, ever) ----------
  function buildShare(res) {
    const cells = 10;
    const filled = Math.max(0, Math.min(cells, Math.round(res.score / 1500)));
    const bar = '\ud83d\udfe9'.repeat(filled) + '\u2b1b'.repeat(cells - filled);
    return [
      'ZERO HOUR \u00b7 Daily ' + recs.today,
      'SCORE ' + fmt(res.score) + ' \u00b7 MAX COMBO \u00d7' + res.maxCombo,
      (res.bossDown ? '\ud83d\udc8e CORE WARDEN CLEARED' : '\u2b21 core survived\u2026'),
      bar,
    ].join('\n');
  }

  async function copyShare() {
    if (!lastResult) return;
    const text = buildShare(lastResult);
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    $('btn-share').textContent = 'COPIED \u2713';
    setTimeout(() => { $('btn-share').textContent = 'COPY RESULT'; }, 1800);
  }

  // ---------- mute ----------
  function updateMuteBtn() {
    $('btn-mute').textContent = SY.audio.isMuted() ? '\ud83d\udd07' : '\ud83d\udd0a';
    $('btn-mute').setAttribute('aria-label', SY.audio.isMuted() ? 'Unmute' : 'Mute');
  }
  $('btn-mute').addEventListener('click', () => {
    SY.audio.setMuted(!SY.audio.isMuted());
    recs.settings.muted = SY.audio.isMuted();
    SY.store.saveSettings(recs.settings);
    updateMuteBtn();
  });

  // ---------- buttons ----------
  $('btn-daily').addEventListener('click', () => startGame('daily'));
  $('btn-free').addEventListener('click', () => startGame('free'));
  $('btn-retry').addEventListener('click', () => startGame(lastResult ? lastResult.mode : 'daily'));
  $('btn-menu').addEventListener('click', () => { G.toMenu(); renderMenuStats(); show('screen-menu'); });
  $('btn-share').addEventListener('click', copyShare);

  // ---------- touch joystick ----------
  const stage = $('stage');
  let stick = null;
  const stickEl = $('joystick'), knobEl = $('joystick-knob');
  stage.addEventListener('pointerdown', (e) => {
    if (G.phase !== 'playing' && G.phase !== 'ready') return;
    if (e.pointerType === 'mouse') return;
    stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stickEl.style.display = 'block';
    positionStick(e.clientX, e.clientY, 0, 0);
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
    const len = Math.hypot(dx, dy);
    const max = 52;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    SY.input.ax = dx / max;
    SY.input.ay = dy / max;
    positionStick(stick.x, stick.y, dx, dy);
  });
  function endStick(e) {
    if (!stick || e.pointerId !== stick.id) return;
    stick = null;
    SY.input.ax = 0; SY.input.ay = 0;
    stickEl.style.display = 'none';
  }
  window.addEventListener('pointerup', endStick);
  window.addEventListener('pointercancel', endStick);
  function positionStick(x, y, dx, dy) {
    stickEl.style.left = x + 'px';
    stickEl.style.top = y + 'px';
    knobEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  }

  // ---------- stage scaling ----------
  const SW = 960, SH = 664;
  function fit() {
    const pad = 18;
    const scale = Math.min((window.innerWidth - pad) / SW, (window.innerHeight - pad) / SH, 1.4);
    stage.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
  }
  window.addEventListener('resize', fit);
  fit();

  show('screen-menu');
  boot();
})();
