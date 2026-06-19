// Scoreyard — UI glue: loop, HUD, screens, records, share, touch
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.nvGame;

  const $ = (id) => document.getElementById('neonvortex-' + id);
  // stage rotation (radians) so render.js can keep in-canvas overlay text upright
  SY.layout = SY.layout || { rot: 0 };
  let recs = { settings: { muted: false }, bestAll: null, dailyBest: null, today: SY.todayUTC(),
    lifetime: { score: 0, crystals: 0, runs: 0 } }; // cosmetic meta (display-only)
  let lastResult = null;
  let runBestPace = null; // daily pace snapshot for live comparison

  const fmt = (n) => n.toLocaleString('en-US');

  const gameStore = SY.store.forGame('neonvortex'); // namespaced records

  // ---------- lifecycle (shell-driven; registered via SY.registerGame below) ----------
  function enter() {
    recs.settings = SY.settings; // shared settings, loaded by the shell at boot
    applyVolume(volumeValue());  // cosmetic SFX level from persisted settings
    applyCrt(crtOn());           // cosmetic CRT overlay from persisted settings
    updateMuteBtn();
    updateHapticBtn();
    updateVolumeUi();
    updateCrtBtn();
    renderMenuStats();           // shows defaults until records load
    show('screen-menu');         // instant — records hydrate asynchronously
    loadRecords();
  }
  async function loadRecords() {
    await SY.store.migrate('neonvortex'); // one-time: legacy keys -> ship:*
    const gr = await gameStore.loadAll();
    recs.bestAll = gr.bestAll;
    recs.dailyBest = gr.dailyBest;
    recs.today = gr.today;
    recs.lifetime = await gameStore.loadLifetime(); // cosmetic meta (display-only)
    renderMenuStats();
    renderDailyHistory();
  }
  function exit() {
    G.toMenu();
    releaseStick();
    show(null);            // hide all Zero Hour screens
    $('hud').style.visibility = 'hidden';
  }
  // called every frame by the shell while Zero Hour is the active game
  function frame(dt, ctx) {
    G.update(dt);
    SY.nvRender(ctx);
    updateHud();
  }

  // ---------- HUD ----------
  const POWER_DUR = { MAGNET: 7, SLOW: 5, X2: 7, BOOST: 6, SPREAD: 7 }; // for effect timer bars
  const hudEls = {
    time: $('hud-time'), score: $('hud-score'), combo: $('hud-combo'), heat: $('hud-heat'),
    hearts: $('hud-hearts'), pace: $('hud-pace'), fx: $('hud-fx'), mode: $('hud-mode'),
    pauseBtn: $('btn-pause'), muteBtn: $('btn-mute'), fsBtn: $('btn-fullscreen'),
    bossHp: $('boss-hp'), bossHpFill: $('boss-hp-fill'),
    vignette: $('danger-vignette'), hitFlash: $('hit-flash'),
  };
  let lastHp = 3, dangerOn = false; // tracked across frames for hit-flash / low-HP toggles

  function updateHud() {
    const s = G.state;
    const playing = G.phase === 'playing' || G.phase === 'ready';
    const active = playing || G.phase === 'paused'; // keep the frozen HUD visible behind the pause overlay
    const inGame = active; // during play/pause the corner toggles move into the pause menu
    $('hud').style.visibility = active ? 'visible' : 'hidden';
    hudEls.pauseBtn.style.display = playing ? 'block' : 'none'; // CSS default is display:none
    hudEls.muteBtn.style.display = inGame ? 'none' : 'block';
    hudEls.fsBtn.style.display = (inGame || !fsSupported) ? 'none' : 'block';
    if (!s || !active) {
      if (dangerOn) { hudEls.vignette.classList.remove('active'); dangerOn = false; }
      hudEls.bossHp.classList.remove('show');
      return;
    }

    // boss HP (upright DOM; the canvas bar was removed for portrait rotation)
    if (s.boss && s.boss.dying <= 0) {
      hudEls.bossHp.classList.add('show');
      hudEls.bossHpFill.style.width = (Math.max(0, s.boss.hp / s.boss.maxHp) * 100).toFixed(1) + '%';
    } else {
      hudEls.bossHp.classList.remove('show');
    }

    // damage feedback: flash on any hull loss, pulse vignette while on the last hull
    if (s.player.hp < lastHp) {
      hudEls.hitFlash.classList.remove('flash');
      void hudEls.hitFlash.offsetWidth; // reflow so the animation restarts
      hudEls.hitFlash.classList.add('flash');
    }
    lastHp = s.player.hp;
    const danger = playing && s.player.hp <= 1 && s.player.hp > 0;
    if (danger !== dangerOn) { hudEls.vignette.classList.toggle('active', danger); dangerOn = danger; }


    const tl = Math.max(0, s.timeLeft);
    hudEls.time.textContent = Math.ceil(tl).toString().padStart(2, '0');
    hudEls.time.classList.toggle('warn', tl <= 5.5);
    hudEls.score.textContent = fmt(s.score);
    hudEls.combo.textContent = s.combo > 1 ? '×' + s.combo : '';
    const heatOn = s.inSurge && s.heatMul > 1;
    hudEls.heat.textContent = heatOn ? 'HEAT ×' + s.heatMul : '';
    hudEls.heat.classList.toggle('on', heatOn);
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

    // active effect badges: glyph + depleting timer bar
    let chips = '';
    const meta = G.POWER_META;
    if (s.shield) chips += chip(meta.SHIELD, 0, 0); // consumable: glyph only, no bar
    for (const k of ['MAGNET', 'SLOW', 'X2', 'BOOST', 'SPREAD']) {
      if (s.fx[k] > 0) chips += chip(meta[k], s.fx[k], POWER_DUR[k]);
    }
    hudEls.fx.innerHTML = chips;
  }

  function chip(meta, secs, max) {
    const pct = max > 0 ? Math.max(0, Math.min(1, secs / max)) * 100 : 0;
    return '<span class="fx-badge" style="--c:' + meta.color + '">' +
      '<span class="fx-glyph">' + meta.glyph + '</span>' +
      (max > 0 ? '<span class="fx-bar"><i style="width:' + pct.toFixed(0) + '%"></i></span>' : '') +
      '</span>';
  }

  // ---------- screens ----------
  // a11y: move focus to each modal screen's primary action when it opens, so
  // keyboard/screen-reader users aren't stranded on the (now-dead) canvas.
  const PRIMARY_ACTION = {
    'screen-over': 'btn-retry',
    'screen-pause': 'btn-resume',
    'screen-howto': 'btn-howto-start',
    'screen-records': 'btn-records-back',
    'screen-settings': 'btn-settings-back',
    'screen-challenge': 'btn-challenge-launch', // a11y: focus the CTA on open
    'screen-hangar': 'btn-hangar-back',
    'screen-overhaul': 'btn-overhaul-back',
    'screen-achievements': 'btn-achievements-back',
    'screen-pilotlog': 'btn-pilotlog-back',
  };
  function show(screenId) {
    for (const id of ['screen-menu', 'screen-over', 'screen-pause', 'screen-howto', 'screen-records', 'screen-settings', 'screen-challenge', 'screen-hangar', 'screen-overhaul', 'screen-achievements', 'screen-pilotlog']) {
      $(id).classList.toggle('visible', id === screenId);
    }
    if (screenId !== 'screen-over') stopCountdown();
    const focusId = PRIMARY_ACTION[screenId];
    if (focusId) { const btn = $(focusId); if (btn) btn.focus(); }
  }

  // screen-reader announcement sink (#a11y-live); used for one-shot moments like
  // the game-over result — NOT the per-frame HUD, which would flood the reader.
  function announce(msg) {
    const live = document.getElementById('a11y-live');
    if (live) live.textContent = msg;
  }

  // streak + medal persistence + result badges (async; doesn't block the screen)
  async function applyMedals(res, isNewBest) {
    const streak = await gameStore.computeStreak();
    const earned = SY.zh.medals.evalRun(res, { streak });
    const newly = await gameStore.addMedals(earned);
    renderEarnedMedals(earned, newly);
    if (newly.length && !isNewBest) SY.audio.powerup(); // new-medal jingle (newBest has its own)
  }
  // earned-medal badges on the result screen (newly-unlocked ones glow)
  function renderEarnedMedals(earned, newly) {
    const el = $('over-medals');
    if (!earned.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.display = 'flex';
    const isNew = new Set(newly);
    el.innerHTML = earned.map((id) => {
      const m = SY.zh.medals.MEDALS.find((x) => x.id === id);
      return m ? '<span class="medal earned' + (isNew.has(id) ? ' is-new' : '') + '">' +
        '<span class="medal-glyph">' + m.glyph + '</span>' +
        '<span class="medal-name">' + m.name + (isNew.has(id) ? ' • NEW' : '') + '</span></span>' : '';
    }).join('');
  }

  // ---------- records screen ----------
  // K-format an axis value (>=1000 -> "12K"), used only for the chart's Y labels
  const kFmt = (v) => (v >= 1000 ? Math.round(v / 1000) + 'K' : String(Math.round(v)));

  // Build the TACTICAL COMPARATIVE MATRIX as an inline-SVG bar chart (display-only).
  // cyanRows: top-5 ranked scores (cumulative leaders); goldDays: recent daily
  // history (newest-first). All values are REAL local records — no fabricated data.
  function buildMatrixChart(cyanRows, goldDays) {
    const cyan = cyanRows.slice(0, 5).map((r) => ({ score: Number(r.score) || 0 }));
    // recent daily runs, chronological (oldest -> newest), most recent 5
    const gold = goldDays
      .filter((d) => d.rec)
      .slice(0, 5)
      .reverse()
      .map((d) => ({ score: Number(d.rec.score) || 0 }));

    // Y ceiling: max real score, rounded up to a clean step; floor of 1000 so an
    // empty/sparse board still renders sensible gridlines.
    const peak = Math.max(0, ...cyan.map((c) => c.score), ...gold.map((g) => g.score));
    const step = peak >= 1000 ? 1000 : 100;
    const yCeil = Math.max(step, Math.ceil(peak / step) * step) || 1000;

    const X0 = 55, X1 = 485, Y_TOP = 15, Y_BASE = 155, H = Y_BASE - Y_TOP; // plot frame
    const MID = 262; // divider between cyan (left) and gold (right) groups
    const barW = 24, gap = 36;

    const barY = (score) => Y_BASE - Math.max(3, (score / yCeil) * H);
    const barH = (score) => Math.max(3, (score / yCeil) * H);

    // Y gridlines + labels at 0/25/50/75/100%
    let grid = '';
    [0, 0.25, 0.5, 0.75, 1].forEach((ratio) => {
      const y = Y_TOP + (1 - ratio) * H;
      const val = Math.round(ratio * yCeil);
      const label = val === 0 ? '0' : kFmt(val);
      grid += '<line class="nv-mx-grid" x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y + '"/>' +
        '<text class="nv-mx-ylabel" x="48" y="' + (y + 3.5) + '" text-anchor="end">' + label + '</text>';
    });

    // cyan bars (left group)
    let cyanBars = '';
    cyan.forEach((c, i) => {
      const x = X0 + 15 + i * gap;
      cyanBars += '<rect class="nv-mx-bar" x="' + x + '" y="' + barY(c.score) + '" width="' + barW +
        '" height="' + barH(c.score) + '" rx="2" fill="url(#nvMxCyan)"/>' +
        '<line class="nv-mx-cap nv-mx-cap-cyan" x1="' + x + '" y1="' + barY(c.score) + '" x2="' + (x + barW) + '" y2="' + barY(c.score) + '"/>' +
        '<text class="nv-mx-tag" x="' + (x + barW / 2) + '" y="166" text-anchor="middle">#' + (i + 1) + '</text>';
    });

    // gold bars (right group) — or a faint "no recent runs" note
    let goldBars = '';
    if (gold.length) {
      gold.forEach((g, i) => {
        const x = MID + 20 + i * gap;
        goldBars += '<rect class="nv-mx-bar" x="' + x + '" y="' + barY(g.score) + '" width="' + barW +
          '" height="' + barH(g.score) + '" rx="2" fill="url(#nvMxGold)"/>' +
          '<line class="nv-mx-cap nv-mx-cap-gold" x1="' + x + '" y1="' + barY(g.score) + '" x2="' + (x + barW) + '" y2="' + barY(g.score) + '"/>' +
          '<text class="nv-mx-tag" x="' + (x + barW / 2) + '" y="166" text-anchor="middle">R' + (i + 1) + '</text>';
      });
    } else {
      goldBars = '<text class="nv-mx-empty" x="373" y="88" text-anchor="middle">최근 런 없음</text>';
    }

    const svg = '<svg class="nv-mx-svg" viewBox="0 0 500 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="nvMxCyan" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#00dbe7" stop-opacity="0.95"/>' +
          '<stop offset="100%" stop-color="#00dbe7" stop-opacity="0.15"/>' +
        '</linearGradient>' +
        '<linearGradient id="nvMxGold" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#ffba20" stop-opacity="0.95"/>' +
          '<stop offset="100%" stop-color="#ffba20" stop-opacity="0.15"/>' +
        '</linearGradient>' +
      '</defs>' +
      grid +
      '<line class="nv-mx-divider" x1="' + MID + '" y1="10" x2="' + MID + '" y2="162"/>' +
      '<line class="nv-mx-axis" x1="' + X0 + '" y1="' + Y_BASE + '" x2="' + X1 + '" y2="' + Y_BASE + '"/>' +
      '<line class="nv-mx-axis" x1="' + X0 + '" y1="' + Y_TOP + '" x2="' + X0 + '" y2="' + Y_BASE + '"/>' +
      cyanBars + goldBars +
      '<text class="nv-mx-grouplabel nv-mx-grouplabel-cyan" x="137" y="178" text-anchor="middle">누적 TOP</text>' +
      '<text class="nv-mx-grouplabel nv-mx-grouplabel-gold" x="373" y="178" text-anchor="middle">최근 런</text>' +
      '</svg>';

    return '<section class="nv-mx-card clip-chamfer">' +
      '<header class="nv-mx-head">' +
        '<div class="nv-mx-head-text">' +
          '<span class="nv-mx-title"><span class="nv-mx-dot"></span>TACTICAL COMPARATIVE MATRIX</span>' +
          '<span class="nv-mx-sub">SYSTEM TELEMETRY // TOP-5 점수 vs 최근 런</span>' +
        '</div>' +
        '<span class="nv-mx-anl">TCE_ANL_V3</span>' +
      '</header>' +
      '<div class="nv-mx-legend">' +
        '<span class="nv-mx-leg nv-mx-leg-cyan"><span class="nv-mx-swatch"></span>누적 TOP</span>' +
        '<span class="nv-mx-leg nv-mx-leg-gold"><span class="nv-mx-swatch"></span>최근 런</span>' +
      '</div>' +
      '<div class="nv-mx-plot">' + svg + '</div>' +
      '</section>';
  }

  async function renderRecords() {
    const [days, streak, owned] = await Promise.all([
      gameStore.loadRecentDailies(14),
      gameStore.computeStreak(),
      gameStore.loadMedals(),
    ]);
    const ownedSet = new Set(owned);
    const b = recs.bestAll;

    // Leaderboard rows from REAL local data only (no invented/fetched entries):
    // the all-time best plus each played day in the recent history, ranked by
    // score (desc). The all-time-best row is flagged "you" for highlight. A
    // display-only pilot rank-tier chip labels each row.
    const rows = [];
    if (b) {
      rows.push({ label: 'ALL-TIME', score: Number(b.score) || 0,
        meta: (b.mode === 'daily' ? 'DAILY' : 'FREE') + ' · ' + b.date, you: true });
    }
    for (const d of days) {
      if (d.rec) {
        rows.push({ label: d.date, score: Number(d.rec.score) || 0,
          meta: 'DAILY' + (d.rec.bossDown ? ' · BOSS' : ''), you: false });
      }
    }
    rows.sort((x, y) => y.score - x.score);

    // TACTICAL COMPARATIVE MATRIX: cyan = cumulative top-5 (same ranked rows
    // the table uses), gold = recent daily-run progression (chronological).
    let html = buildMatrixChart(rows, days);

    html += '<div class="nv-lb">';
    html += '<div class="nv-lb-head"><span class="nv-lb-rank">RANK</span>' +
      '<span class="nv-lb-pilot">PILOT_FILE</span>' +
      '<span class="nv-lb-score">SCORE</span></div>';
    if (rows.length) {
      html += rows.map((r, i) => {
        const tier = SY.nvMeta.rankTier(r.score);
        return '<div class="nv-lb-row' + (r.you ? ' is-you' : '') + '">' +
          '<span class="nv-lb-rank">' + (r.you ? '▸' : '') + String(i + 1).padStart(2, '0') + '</span>' +
          '<span class="nv-lb-pilot"><span class="nv-lb-name">' + r.label + '</span>' +
          '<span class="nv-lb-tier" style="--nv-tier:' + tier.color + '">' + tier.name + '</span>' +
          '<span class="nv-lb-meta">' + r.meta + '</span></span>' +
          '<span class="nv-lb-score">' + fmt(r.score) + '</span></div>';
      }).join('');
    } else {
      html += '<div class="nv-lb-empty">NO PILOT FILES LOGGED</div>';
    }
    html += '</div>';

    if (streak > 0) {
      html += '<div class="rec-streak">🔥 STREAK ' + streak + (streak === 1 ? ' DAY' : ' DAYS') + '</div>';
    }
    html += '<div><div class="rec-section-title">ACHIEVEMENTS</div><div class="medal-grid">' +
      SY.zh.medals.MEDALS.map((m) =>
        '<span class="medal ' + (ownedSet.has(m.id) ? 'earned' : 'locked') + '" title="' + m.desc + '">' +
        '<span class="medal-glyph">' + m.glyph + '</span>' +
        '<span class="medal-name">' + m.name + '</span></span>').join('') + '</div></div>';
    $('records-body').innerHTML = html;
  }

  function renderMenuStats() {
    $('menu-date').textContent = recs.today + ' (UTC)';
    $('menu-daily-best').textContent = recs.dailyBest
      ? 'TODAY\u2019S BEST ' + fmt(recs.dailyBest.score)
      : 'NO RUN YET TODAY';
    $('menu-all-best').textContent = recs.bestAll
      ? 'ALL-TIME BEST ' + fmt(recs.bestAll.score) + ' \u00b7 \u00d7' + recs.bestAll.combo + ' \u00b7 ' + recs.bestAll.date
      : 'ALL-TIME BEST \u2014';

    // ---- Arcade Pilot meta (display-only; never read by the simulation) ----
    const lt = recs.lifetime || { score: 0, crystals: 0, runs: 0 };
    $('menu-crystals').textContent = fmt(lt.crystals);
    $('menu-lifetime').textContent = fmt(lt.score);
    const tier = SY.nvMeta.rankTier(lt.score);
    const rankEl = $('menu-rank');
    rankEl.textContent = tier.name;
    rankEl.style.color = tier.color;
    rankEl.style.borderColor = tier.color;
    // career ticks: START + each tier with a positive min (1K-formatted)
    const tiers = SY.nvMeta.TIERS;
    const tickLabels = ['START'].concat(
      tiers.filter((t) => t.min > 0).map((t) => (t.min >= 1000 ? t.min / 1000 + 'K' : '' + t.min))
    );
    const ticksEl = $('menu-ticks');
    ticksEl.textContent = ''; // rebuild from constants via createElement/textContent (no innerHTML)
    for (const label of tickLabels) {
      const span = document.createElement('span');
      span.textContent = label;
      ticksEl.appendChild(span);
    }
    // fill: cosmetic progress across the whole START..LEGEND.min range
    const maxBand = tiers[tiers.length - 1].min || 150000;
    const pct = Math.max(0, Math.min(100, (lt.score / maxBand) * 100));
    $('menu-career').style.width = pct.toFixed(1) + '%';
  }

  // ---------- daily challenge briefing (display-only; no gameplay effect) ----------
  // Mirrors the menu stats but framed as a mission briefing. Every field reads
  // existing records — nothing here re-seeds, rerolls, or multiplies the run.
  async function renderChallenge() {
    $('chal-seed').textContent = 'daily-' + recs.today + ' (UTC)';
    $('chal-daily-best').textContent = recs.dailyBest ? fmt(recs.dailyBest.score) : '아직 기록 없음';
    $('chal-all-best').textContent = recs.bestAll ? fmt(recs.bestAll.score) : '—';

    const streak = await gameStore.computeStreak();
    $('chal-streak').textContent = streak > 0 ? '🔥 ' + streak + '일 연속' : '0';
    // cosmetic bar capped at 7 days — labels streak only, grants no bonus
    const streakPct = Math.max(0, Math.min(100, (streak / 7) * 100));
    $('chal-streak-fill').style.width = streakPct.toFixed(0) + '%';
  }

  // ---- display-only meta pages; implemented per-page. Each only READS recs /
  // recs.lifetime / medals and renders into its *-body via createElement; none
  // touch the simulation, score, drops, or the daily seed. ----
  function renderHangar() {}
  function renderOverhaul() {}
  function renderAchievements() {}
  function renderPilotLog() {}

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
    // touch devices: ride the start gesture into fullscreen (silently ignored if blocked)
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) enterFullscreen();
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
      gameStore.loadRecentDailies(7),
      gameStore.computeStreak(),
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
        gameStore.saveDaily(runDay, recs.dailyBest);
      }
      syncToday(); // after filing: refresh the slate if midnight passed mid-run
    }
    if (!recs.bestAll || res.score > recs.bestAll.score) {
      newAll = true;
      recs.bestAll = { score: res.score, combo: res.maxCombo, date: recs.today, mode: res.mode };
      gameStore.saveBestAll(recs.bestAll);
    }
    // cosmetic lifetime totals (display-only; wired to UI in a later task)
    recs.lifetime = SY.nvMeta.accumulateLifetime(recs.lifetime, { score: res.score, crystals: res.crystalsCollected || 0 });
    gameStore.saveLifetime(recs.lifetime);
    const tier = SY.nvMeta.rankTier(recs.lifetime.score);
    const prEl = $('over-pilot-rank'); prEl.textContent = tier.name; prEl.style.color = tier.color;
    $('over-bank').textContent = fmt(recs.lifetime.crystals);
    const isNewBest = newAll || newDaily;

    $('over-reason').textContent = res.reason === 'down' ? 'DRONE DESTROYED' : 'TIME UP';
    $('over-score').textContent = fmt(res.score);
    $('over-best-banner').classList.toggle('show', isNewBest);
    $('over-best-label').textContent = newAll ? 'NEW ALL-TIME BEST!' : 'NEW DAILY BEST!';
    const bd = res.breakdown;
    $('over-stats').innerHTML =
      statRow('CRYSTAL PTS', '+' + fmt(bd.crystals)) +
      statRow('COMBO BONUS', '+' + fmt(bd.combo)) +
      statRow('HEAT BONUS', '+' + fmt(bd.heat || 0)) +
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

    // rank is synchronous (deterministic); medals persist asynchronously so the
    // IndexedDB round-trip never delays the result screen / countdown
    const r = SY.zh.medals.rank(res.score);
    $('over-rank').textContent = 'RANK \u00b7 ' + r.name;
    $('over-rank').className = 'rank-' + r.id;
    $('over-medals').style.display = 'none';
    applyMedals(res, isNewBest);

    renderMenuStats();
    renderDailyHistory();
    setTimeout(() => {
      show('screen-over');
      announce('게임 오버. 점수 ' + fmt(res.score) + '점, 랭크 ' + r.name + (isNewBest ? ', 신기록!' : '') + '.');
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
      'SHIP \u00b7 Daily ' + recs.today,
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

  // ---------- mute (top button + pause-menu toggle + settings switch) ----------
  // The settings screen renders an iOS-style switch (ON = sound enabled, i.e. not
  // muted); the corner button + pause toggle keep their existing label form.
  function updateMuteBtn() {
    const m = SY.audio.isMuted();
    $('btn-mute').classList.toggle('muted', m); // SVG: show slash / hide waves
    $('btn-mute').setAttribute('aria-label', m ? 'Unmute' : 'Mute');
    $('btn-pause-mute').textContent = 'SOUND: ' + (m ? 'OFF' : 'ON');
    $('btn-set-mute').setAttribute('aria-checked', m ? 'false' : 'true');
    updateVolumeUi(); // sound off disables the volume row
  }
  function toggleMute() {
    SY.audio.setMuted(!SY.audio.isMuted());
    recs.settings.muted = SY.audio.isMuted();
    SY.store.saveSettings(recs.settings);
    updateMuteBtn();
  }
  $('btn-mute').addEventListener('click', toggleMute);
  $('btn-pause-mute').addEventListener('click', toggleMute);
  $('btn-set-mute').addEventListener('click', toggleMute);

  // ---------- master SFX volume (cosmetic level; settings slider only) ----------
  const volSlider = $('set-volume'), volVal = $('set-volume-val'), volRow = $('set-volume-row');
  function volumeValue() {
    const v = recs.settings && typeof recs.settings.volume === 'number' ? recs.settings.volume : 70;
    return Math.max(0, Math.min(100, v));
  }
  function applyVolume(v0to100) { SY.audio.setVolume(v0to100 / 100); }
  function updateVolumeUi() {
    const v = volumeValue();
    volSlider.value = String(v);
    volVal.textContent = v + '%';
    const off = SY.audio.isMuted();
    volRow.classList.toggle('is-disabled', off);
    volSlider.disabled = off;
  }
  volSlider.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, parseInt(volSlider.value, 10) || 0));
    recs.settings.volume = v;
    applyVolume(v);
    volVal.textContent = v + '%';
  });
  volSlider.addEventListener('change', () => { SY.store.saveSettings(recs.settings); });

  // ---------- CRT screen render (cosmetic scanline/vignette overlay) ----------
  const crtBtn = $('btn-set-crt'), stageEl = document.getElementById('stage');
  function crtOn() { return recs.settings ? recs.settings.crt !== false : true; }
  function applyCrt(on) { if (stageEl) stageEl.classList.toggle('crt-off', !on); }
  function updateCrtBtn() { crtBtn.setAttribute('aria-checked', crtOn() ? 'true' : 'false'); }
  function toggleCrt() {
    recs.settings.crt = !crtOn();
    applyCrt(recs.settings.crt);
    SY.store.saveSettings(recs.settings);
    updateCrtBtn();
  }
  crtBtn.addEventListener('click', toggleCrt);

  // ---------- buttons ----------
  function quitToMenu() {
    G.toMenu();
    renderMenuStats();
    renderDailyHistory();
    show('screen-menu');
  }
  $('btn-start').addEventListener('click', () => startGame('daily')); // headline action → today's daily
  $('btn-daily').addEventListener('click', () => { renderChallenge(); show('screen-challenge'); });
  $('btn-free').addEventListener('click', () => startGame('free'));
  $('btn-retry').addEventListener('click', () => startGame(lastResult ? lastResult.mode : 'daily'));
  $('btn-menu').addEventListener('click', quitToMenu);
  $('btn-share').addEventListener('click', copyShare);
  $('btn-pause').addEventListener('click', pauseGame);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-pause-restart').addEventListener('click', () => reallyStart(G.mode));
  $('btn-pause-quit').addEventListener('click', quitToMenu); // run is discarded: no onGameOver, no saves
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen(); else enterFullscreen();
  }
  $('btn-pause-fs').addEventListener('click', toggleFullscreen);
  $('btn-howto-start').addEventListener('click', () => {
    recs.settings.seenHowto = true;
    SY.store.saveSettings(recs.settings);
    reallyStart(pendingMode || 'daily');
  });
  $('btn-records').addEventListener('click', () => { renderRecords(); show('screen-records'); });
  $('btn-records-back').addEventListener('click', () => show('screen-menu'));
  $('btn-challenge-launch').addEventListener('click', () => startGame('daily'));
  $('btn-challenge-back').addEventListener('click', () => show('screen-menu'));
  // ---- display-only meta pages (Hangar / Overhaul / Achievements / Pilot Log) ----
  // render* bodies are implemented per-page; they only READ recs/lifetime/medals
  // and never mutate gameplay, score, or the daily seed.
  $('btn-hangar').addEventListener('click', () => { renderHangar(); show('screen-hangar'); });
  $('btn-hangar-back').addEventListener('click', () => show('screen-menu'));
  $('btn-overhaul').addEventListener('click', () => { renderOverhaul(); show('screen-overhaul'); });
  $('btn-overhaul-back').addEventListener('click', () => show('screen-menu'));
  $('btn-achievements').addEventListener('click', () => { renderAchievements(); show('screen-achievements'); });
  $('btn-achievements-back').addEventListener('click', () => show('screen-menu'));
  $('btn-pilotlog').addEventListener('click', () => { renderPilotLog(); show('screen-pilotlog'); });
  $('btn-pilotlog-back').addEventListener('click', () => show('screen-menu'));

  // ---------- settings screen (gear-opened; reuses the pause-menu toggle logic) ----------
  function openSettings() {
    updateMuteBtn();    // reflect current sound state on the settings switches
    updateHapticBtn();
    updateVolumeUi();
    updateCrtBtn();
    show('screen-settings');
  }
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-settings-back').addEventListener('click', () => show('screen-menu'));
  $('btn-set-fs').addEventListener('click', toggleFullscreen);

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
    } else if ($('screen-records').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-records-back').click();
    } else if ($('screen-settings').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-settings-back').click();
    } else if ($('screen-challenge').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-challenge-back').click();
    } else if ($('screen-hangar').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-hangar-back').click();
    } else if ($('screen-overhaul').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-overhaul-back').click();
    } else if ($('screen-achievements').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-achievements-back').click();
    } else if ($('screen-pilotlog').classList.contains('visible')) {
      if (e.code === 'Escape' || e.code === 'KeyM') $('btn-pilotlog-back').click();
    } else if (G.phase === 'paused') {
      if (e.code === 'Escape' || e.code === 'KeyP') resumeGame();
    } else if (G.phase === 'playing' || G.phase === 'ready') {
      if (e.code === 'Escape' || e.code === 'KeyP') pauseGame();
    }
  });

  // ---------- touch drag-to-move (whole viewport; arena is rotated 90° in portrait) ----------
  let stick = null;
  const stickEl = document.getElementById('joystick'), knobEl = document.getElementById('joystick-knob');
  document.getElementById('viewport').addEventListener('pointerdown', (e) => {
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
    if (SY.layout.portrait) {
      // arena rotated 90° CW: screen (dx,dy) -> arena (dy,-dx) so drag matches on-screen motion
      SY.input.ax = dy / max;
      SY.input.ay = -dx / max;
    } else {
      SY.input.ax = dx / max;
      SY.input.ay = dy / max;
    }
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

  // ---------- fullscreen ----------
  const fsBtn = $('btn-fullscreen');
  const fsSupported = !!document.documentElement.requestFullscreen;
  if (fsSupported) fsBtn.classList.add('available');
  else { $('btn-pause-fs').style.display = 'none'; $('btn-set-fs').style.display = 'none'; } // hide fullscreen toggles too
  function enterFullscreen() {
    if (!fsSupported || document.fullscreenElement) return;
    document.documentElement.requestFullscreen().catch(() => {});
  }
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else enterFullscreen();
  });

  // ---------- haptics toggle (pause + settings screens; only on devices that vibrate) ----------
  const hapticBtn = $('btn-haptic'), setHapticBtn = $('btn-set-haptic');
  if (navigator.vibrate) { hapticBtn.classList.add('available'); setHapticBtn.classList.add('available'); }
  function updateHapticBtn() {
    hapticBtn.textContent = 'VIBRATION: ' + (SY.audio.hapticsOn() ? 'ON' : 'OFF');
    setHapticBtn.setAttribute('aria-checked', SY.audio.hapticsOn() ? 'true' : 'false'); // settings switch
  }
  function toggleHaptic() {
    const on = !SY.audio.hapticsOn();
    SY.audio.setHaptics(on);
    recs.settings.haptics = on;
    SY.store.saveSettings(recs.settings);
    updateHapticBtn();
  }
  hapticBtn.addEventListener('click', toggleHaptic);
  setHapticBtn.addEventListener('click', toggleHaptic);
  updateHapticBtn();

  // ---------- register with the arcade shell ----------
  $('btn-arcade').addEventListener('click', () => SY.shell.exitToHub());
  SY.registerGame({
    id: 'neonvortex',
    title: 'NEON VORTEX',
    blurb: 'ARCADE_PILOT_OS · BEAT THE CORE WARDEN',
    accent: '#00dbe7',
    enter, exit, frame,
    pause: pauseGame, resume: resumeGame,
  });
})();
