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
    renderDailyHistory();
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
    pauseBtn: $('btn-pause'),
  };

  function updateHud() {
    const s = G.state;
    const playing = G.phase === 'playing' || G.phase === 'ready';
    const active = playing || G.phase === 'paused'; // keep the frozen HUD visible behind the pause overlay
    $('hud').style.visibility = active ? 'visible' : 'hidden';
    hudEls.pauseBtn.style.display = playing ? 'block' : 'none'; // CSS default is display:none
    if (!s || !active) return;

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
    for (const id of ['screen-menu', 'screen-over', 'screen-pause', 'screen-howto']) {
      $(id).classList.toggle('visible', id === screenId);
    }
    if (screenId !== 'screen-over') stopCountdown();
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

  let pendingMode = null;
  function startGame(mode) {
    if (!recs.settings.seenHowto) {
      pendingMode = mode;
      show('screen-howto');
      return;
    }
    reallyStart(mode);
  }
  function reallyStart(mode) {
    SY.audio.unlock();
    syncToday(); // don't pace-compare a new day's run against yesterday's best
    runBestPace = mode === 'daily' && recs.dailyBest ? recs.dailyBest.pace : null;
    G.start(mode);
    show(null);
  }

  // ---------- pause ----------
  function pauseGame() {
    if (G.phase !== 'playing' && G.phase !== 'ready') return;
    G.pause();
    releaseStick();
    show('screen-pause');
  }
  function resumeGame() {
    if (G.phase !== 'paused') return;
    G.resume();
    show(null);
  }

  // ---------- daily streak + 7-day history ----------
  async function renderDailyHistory() {
    const [days, streak] = await Promise.all([
      SY.store.loadRecentDailies(7),
      SY.store.computeStreak(),
    ]);
    $('menu-streak').textContent = streak > 0
      ? 'STREAK ' + streak + (streak === 1 ? ' DAY' : ' DAYS')
      : '';
    const week = $('menu-week');
    const anyRun = days.some((d) => d.rec);
    week.style.display = anyRun ? 'block' : 'none'; // CSS default is display:none
    if (anyRun) {
      week.innerHTML = 'LAST 7 DAYS ' + days.slice().reverse().map((d) =>
        '<span class="day-cell' + (d.rec ? ' hit' : '') +
        '" title="' + d.date + (d.rec ? ' · ' + fmt(Number(d.rec.score) || 0) : '') + '"></span>'
      ).join('');
    }
  }

  // ---------- game over ----------
  // UTC midnight may roll over while the page stays open (the over-screen
  // countdown invites exactly that). Re-sync the cached daily slate.
  function syncToday() {
    const today = SY.todayUTC();
    if (today === recs.today) return;
    recs.today = today;
    recs.dailyBest = null; // brand-new day: no best yet
    renderMenuStats();
    renderDailyHistory();
  }

  G.events.onGameOver = async function (res) {
    lastResult = res;
    let newDaily = false, newAll = false;

    if (res.mode === 'daily') {
      // record under the run's seed date — a run that started before midnight
      // must not be filed (or compared) as the new day's daily
      const runDay = res.seedStr.slice('daily-'.length);
      const isCurrentDay = runDay === recs.today;
      if (isCurrentDay && (!recs.dailyBest || res.score > recs.dailyBest.score)) {
        newDaily = true;
        recs.dailyBest = { score: res.score, combo: res.maxCombo, pace: res.pace, bossDown: res.bossDown };
        SY.store.saveDaily(runDay, recs.dailyBest);
      }
      syncToday(); // after filing: refresh the slate if midnight passed mid-run
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
    const bd = res.breakdown;
    $('over-stats').innerHTML =
      statRow('CRYSTAL PTS', '+' + fmt(bd.crystals)) +
      statRow('COMBO BONUS', '+' + fmt(bd.combo)) +
      statRow('DESTRUCTION', '+' + fmt(bd.destruction)) +
      statRow('BOSS PTS', '+' + fmt(bd.boss)) +
      statRow('MAX COMBO', '\u00d7' + res.maxCombo) +
      statRow('CRYSTALS', fmt(res.collected)) +
      statRow('CORE WARDEN', res.bossDown ? 'CLEARED \u2726' : res.mode && res.duration >= 40 ? 'SURVIVED' : '\u2014') +
      statRow(res.mode === 'daily' ? 'TODAY\u2019S BEST' : 'ALL-TIME BEST',
        res.mode === 'daily'
          ? (recs.dailyBest ? fmt(recs.dailyBest.score) : '\u2014') // null right after a midnight rollover
          : fmt(recs.bestAll.score));
    drawSparkline(res.pace, res.mode === 'daily' ? runBestPace : null);

    $('btn-share').style.display = res.mode === 'daily' ? '' : 'none';
    $('btn-share').textContent = 'COPY RESULT';
    $('over-mode').textContent = res.mode === 'daily' ? 'DAILY \u00b7 ' + recs.today : 'FREE PLAY';

    renderMenuStats();
    renderDailyHistory();
    setTimeout(() => {
      show('screen-over');
      if (res.mode === 'daily') startCountdown();
      if (isNewBest) setTimeout(() => SY.audio.newBest(), 350);
    }, 650);
  };

  // ---------- pace sparkline ----------
  function drawSparkline(pace, bestPace) {
    const cv = $('over-spark'), c2 = cv.getContext('2d');
    const W = cv.width, H = cv.height, pad = 4;
    c2.clearRect(0, 0, W, H);
    const len = Math.max(pace ? pace.length : 0, bestPace ? bestPace.length : 0);
    if (len < 2) { // too short for a curve — flat baseline keeps layout stable
      c2.strokeStyle = 'rgba(45,226,198,0.4)';
      c2.lineWidth = 2;
      c2.beginPath(); c2.moveTo(pad, H - pad); c2.lineTo(W - pad, H - pad); c2.stroke();
      return;
    }
    const maxV = Math.max(1, ...(pace || [0]), ...(bestPace || [0]));
    function line(arr, color, glow) {
      if (!arr || arr.length < 2) return;
      c2.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = pad + (W - pad * 2) * (i / (len - 1));
        const y = H - pad - (H - pad * 2) * (arr[i] / maxV);
        if (i === 0) c2.moveTo(x, y); else c2.lineTo(x, y);
      }
      c2.strokeStyle = color;
      c2.lineWidth = 2;
      c2.shadowColor = color;
      c2.shadowBlur = glow;
      c2.stroke();
      c2.shadowBlur = 0;
    }
    line(bestPace, 'rgba(255,195,77,0.45)', 0); // previous best, dim amber
    line(pace, '#2de2c6', 6);                   // this run, teal + glow
  }

  // ---------- next-daily countdown ----------
  let countdownTimer = null;
  function startCountdown() {
    stopCountdown();
    const el = $('over-countdown');
    function tick() {
      const now = new Date();
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const ms = next - now.getTime();
      if (ms <= 0 || SY.todayUTC() !== recs.today) { // midnight reached while waiting
        syncToday();
        el.textContent = 'NEW DAILY READY!';
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        return;
      }
      const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60;
      el.textContent = 'NEXT DAILY IN ' +
        String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s2).padStart(2, '0');
    }
    tick();
    el.style.display = 'block';
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    $('over-countdown').style.display = 'none';
  }

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
  function quitToMenu() {
    G.toMenu();
    renderMenuStats();
    renderDailyHistory();
    show('screen-menu');
  }
  $('btn-daily').addEventListener('click', () => startGame('daily'));
  $('btn-free').addEventListener('click', () => startGame('free'));
  $('btn-retry').addEventListener('click', () => startGame(lastResult ? lastResult.mode : 'daily'));
  $('btn-menu').addEventListener('click', quitToMenu);
  $('btn-share').addEventListener('click', copyShare);
  $('btn-pause').addEventListener('click', pauseGame);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-pause-restart').addEventListener('click', () => reallyStart(G.mode));
  $('btn-pause-quit').addEventListener('click', quitToMenu); // run is discarded: no onGameOver, no saves
  $('btn-howto-start').addEventListener('click', () => {
    recs.settings.seenHowto = true;
    SY.store.saveSettings(recs.settings);
    reallyStart(pendingMode || 'daily');
  });

  // ---------- auto-pause ----------
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', pauseGame);

  // ---------- keyboard shortcuts (movement keys live in game.js) ----------
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if ($('screen-over').classList.contains('visible')) {
      // DOM-visibility check, not phase: the over screen appears 650ms after phase flips
      if (e.code === 'KeyR' || e.code === 'Enter') { e.preventDefault(); $('btn-retry').click(); }
      else if (e.code === 'KeyM' || e.code === 'Escape') $('btn-menu').click();
    } else if ($('screen-howto').classList.contains('visible')) {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); $('btn-howto-start').click(); }
    } else if (G.phase === 'paused') {
      if (e.code === 'Escape' || e.code === 'KeyP') resumeGame();
    } else if (G.phase === 'playing' || G.phase === 'ready') {
      if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
    }
  });

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
  function releaseStick() {
    stick = null;
    SY.input.ax = 0; SY.input.ay = 0;
    stickEl.style.display = 'none';
  }
  function endStick(e) {
    if (!stick || e.pointerId !== stick.id) return;
    releaseStick();
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
