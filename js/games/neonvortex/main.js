// Neon Vortex — UI glue: loop, HUD, screens, records, share, touch
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.nvGame;

  const $ = (id) => document.getElementById('neonvortex-' + id);
  // stage rotation (radians) so render.js can keep in-canvas overlay text upright
  SY.layout = SY.layout || { rot: 0 };
  let recs = { settings: { muted: false }, bestByDiff: { easy: null, normal: null, hard: null },
    dailyBest: null, today: SY.todayUTC(),
    lifetime: { score: 0, crystals: 0, runs: 0 } }; // cosmetic meta (display-only)
  let lastResult = null;
  let runBestPace = null; // daily pace snapshot for live comparison

  const fmt = (n) => n.toLocaleString('en-US');

  const gameStore = SY.store.forGame('neonvortex'); // namespaced records

  // difficulty (free-play only; daily is always Normal — engine-enforced)
  const NV_DIFFICULTIES = ['easy', 'normal', 'hard'];
  const difficultyValue = () => {
    const d = recs.settings && recs.settings.nvDifficulty;
    return NV_DIFFICULTIES.includes(d) ? d : 'normal';
  };

  // ---------- lifecycle (shell-driven; registered via SY.registerGame below) ----------
  function enter() {
    recs.settings = SY.settings; // shared settings, loaded by the shell at boot
    SY.nvSprites.setPaint(paintValue()); // cosmetic hull coating from persisted settings
    SY.nvSprites.setHull(hullValue());   // cosmetic hull skin from persisted settings
    applyVolume(volumeValue());  // cosmetic SFX level from persisted settings
    applyCrt(crtOn());           // cosmetic CRT overlay from persisted settings
    updateMuteBtn();
    updateHapticBtn();
    updateVolumeUi();
    updateCrtBtn();
    renderMenuStats();           // shows defaults until records load
    syncDifficultyChips(); // highlight the persisted difficulty on menu entry
    show('screen-menu');         // instant — records hydrate asynchronously
    loadRecords();
  }
  async function loadRecords() {
    await SY.store.migrate('neonvortex'); // one-time: legacy keys -> neonvortex:*
    await SY.store.migrateBest('neonvortex'); // one-time: best_all -> bestByDiff.normal
    const gr = await gameStore.loadAll();
    recs.dailyBest = gr.dailyBest;
    recs.today = gr.today;
    recs.lifetime = await gameStore.loadLifetime(); // cosmetic meta (display-only)
    recs.bestByDiff = await gameStore.loadBests(NV_DIFFICULTIES);
    renderMenuStats();
    renderDailyHistory();
  }
  function exit() {
    G.toMenu();
    releaseStick();
    show(null);            // hide all screens
    $('hud').style.visibility = 'hidden';
  }
  // called every frame by the shell while this game is active
  function frame(dt, ctx) {
    G.update(dt);
    SY.nvRender(ctx);
    updateHud();
  }

  // ---------- HUD ----------
  // power-up durations come from G.POWER_DURATION (single source in game.js)
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
    for (const k of ['MAGNET', 'SLOW', 'X2', 'BOOST', 'SPREAD', 'DRONE', 'MISSILE']) {
      if (s.fx[k] > 0) chips += chip(meta[k], s.fx[k], G.POWER_DURATION[k]);
    }
    hudEls.fx.innerHTML = chips;
  }

  function chip(meta, secs, max) {
    const pct = max > 0 ? Math.max(0, Math.min(1, secs / max)) * 100 : 0;
    return '<span class="fx-badge" style="--c:' + meta.color + '">' +
      '<span class="fx-glyph">' + meta.glyph + '</span>' +
      (max > 0 ? '<span class="fx-num">' + Math.ceil(secs) + '</span>' : '') +
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
    const earned = SY.nvMedals.evalRun(res, { streak });
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
      const m = SY.nvMedals.MEDALS.find((x) => x.id === id);
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
    const [days, streak] = await Promise.all([
      gameStore.loadRecentDailies(14),
      gameStore.computeStreak(),
    ]);
    // leaderboard uses Normal as the canonical board (matches daily = Normal); per-difficulty boards are out of scope
    const b = (recs.bestByDiff && recs.bestByDiff.normal) || null;

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
    $('records-body').innerHTML = html;
  }

  function renderMenuStats() {
    $('menu-date').textContent = recs.today + ' (UTC)';
    $('menu-daily-best').textContent = recs.dailyBest
      ? 'TODAY\u2019S BEST ' + fmt(recs.dailyBest.score)
      : 'NO RUN YET TODAY';
    const selDiff = difficultyValue();
    const dBest = (recs.bestByDiff && recs.bestByDiff[selDiff]) || null;
    $('menu-all-best').textContent = dBest
      ? selDiff.toUpperCase() + ' BEST ' + fmt(dBest.score) + ' \u00b7 \u00d7' + dBest.combo + ' \u00b7 ' + dBest.date
      : selDiff.toUpperCase() + ' BEST \u2014';

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
    $('chal-all-best').textContent = (recs.bestByDiff && recs.bestByDiff.normal) ? fmt(recs.bestByDiff.normal.score) : '—';

    const streak = await gameStore.computeStreak();
    $('chal-streak').textContent = streak > 0 ? '🔥 ' + streak + '일 연속' : '0';
    // cosmetic bar capped at 7 days — labels streak only, grants no bonus
    const streakPct = Math.max(0, Math.min(100, (streak / 7) * 100));
    $('chal-streak-fill').style.width = streakPct.toFixed(0) + '%';
  }

  // ---- display-only meta pages; implemented per-page. Each only READS recs /
  // recs.lifetime / medals and renders into its *-body via createElement; none
  // touch the simulation, score, drops, or the daily seed. ----
  // STRIKER HANGAR — 격납고 제원 관제소 (DISPLAY-ONLY spec sheet). Reads only
  // recs.lifetime.score (for the pilot rank-tier chip, same as the menu pilot
  // card) and the SY.nvSprites atlas (to blit the player striker). It writes no
  // record, touches no simulation/score/drop/seed state. The SYSTEM SPECS bars
  // and PHYSICAL TELEMETRY are FIXED FLAVOR readouts (the base striker loadout),
  // NOT the live game balance — purely a presentation matrix.
  const NV_HGR_SPECS = [
    { titleEN: 'LASER CANNON CAPACITY', titleKR: '레이저 위력 등급', pct: 60, accent: 'gold' },
    { titleEN: 'REINFORCED CHASSIS HP', titleKR: '강화 선체 내구도', pct: 60, accent: 'green' },
    { titleEN: 'NANO CRYSTAL MAGNET', titleKR: '나노 입자 흡착기', pct: 40, accent: 'sky' },
    { titleEN: 'WARP BOOST UNIT', titleKR: '워프 부스터 엔진', pct: 100, accent: 'violet' },
  ];
  const NV_HGR_TELEMETRY = [
    { labelEN: 'DRY MASS', labelKR: '순 기동 질량', value: '14.2 MET TON' },
    { labelEN: 'WINGSPAN', labelKR: '주익 너비', value: '11.8 METERS' },
    { labelEN: 'ION REACTOR CORES', labelKR: '이온 원자로 코어', value: 'TWIN TRITIUM' },
  ];
  // TOTAL COMBAT EFFICIENCY — derived only from the fixed spec readout above, so
  // it is a deterministic display number (not the live balance).
  const NV_HGR_TCE = Math.round(
    NV_HGR_SPECS.reduce((sum, s) => sum + s.pct, 0) / NV_HGR_SPECS.length
  );

  // Blit the player striker sprite, scaled up and centred, onto the holographic
  // plinth canvas. The atlas may not have decoded yet on first open, so guard on
  // isReady() and redraw on the sheet's decode/load if needed (no throw on a
  // cold cache; the plinth backdrop is CSS so it never looks empty).
  function drawHangarShip(canvas) {
    const SP = SY.nvSprites;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const hullKey = SP && SP.activeHullKey && SP.activeHullKey(); // active alternate hull, or null
    const r = SP && SP.atlas && (hullKey ? SP.atlas[hullKey] : SP.atlas.player); // source rect
    const sheet = SP && SP.image;
    // gate on the image being decoded (works for the standalone data-URI atlas,
    // where the module's onload-driven isReady() may not have fired yet)
    if (!r || !sheet || !sheet.complete || !sheet.naturalWidth) return false;
    // fit the player rect into the canvas with margin, preserving aspect
    const margin = 0.62;
    const sc = Math.min((w * margin) / r.w, (h * margin) / r.h);
    const dw = r.w * sc, dh = r.h * sc;
    ctx.save();
    ctx.shadowBlur = 28;
    ctx.shadowColor = 'rgba(0, 219, 231, 0.55)'; // cyan hologram glow
    // alternate hull: blit its sprite (native colour); default: the coated player
    if (hullKey) SP.draw(ctx, hullKey, w / 2, h / 2, Math.max(dw, dh), 0);
    else SP.drawPlayer(ctx, w / 2 - dw / 2, h / 2 - dh / 2, dw, dh);
    ctx.restore();
    return true;
  }

  function renderHangar() {
    const lt = recs.lifetime || { score: 0, crystals: 0, runs: 0 };
    const tier = SY.nvMeta.rankTier(lt.score); // display-only pilot rank

    const body = $('hangar-body');
    body.replaceChildren(); // clear (no innerHTML)

    // ---- header ----
    const header = nvEl('header', 'nv-hgr-head');
    const tag = nvEl('div', 'nv-hgr-tag');
    tag.appendChild(nvEl('span', 'nv-hgr-tag-kicker', 'HANGAR_BAY_OK'));
    tag.appendChild(nvEl('span', 'nv-hgr-tag-code', 'TACTICAL DECK // SPECIFICATION MATRIX'));
    header.appendChild(tag);
    const titleWrap = nvEl('div', 'nv-hgr-title-wrap');
    titleWrap.appendChild(nvEl('h2', 'nv-hgr-title', 'STRIKER HANGAR'));
    titleWrap.appendChild(nvEl('p', 'nv-hgr-subtitle', '격납고 제원 관제소'));
    header.appendChild(titleWrap);
    header.appendChild(nvEl('div', 'nv-hgr-rule'));
    body.appendChild(header);

    // ---- ship showcase: player sprite on a holographic grid plinth ----
    const show = nvEl('section', 'nv-hgr-show clip-chamfer');
    show.appendChild(nvEl('span', 'nv-hgr-show-deco nv-hgr-show-deco-l', 'SYS_RENDERER // ONLINE'));
    show.appendChild(nvEl('span', 'nv-hgr-show-deco nv-hgr-show-deco-r', 'SCANNING'));
    const plinth = nvEl('div', 'nv-hgr-plinth');
    const canvas = document.createElement('canvas');
    canvas.className = 'nv-hgr-canvas';
    canvas.width = 260;
    canvas.height = 230;
    plinth.appendChild(canvas);
    show.appendChild(plinth);
    // model name + functional EQUIPPED COATING selector (cosmetic paint)
    const model = nvEl('div', 'nv-hgr-model');
    model.appendChild(nvEl('span', 'nv-hgr-model-name', 'MODEL: X-77 STRIKER INTERCEPTOR'));
    model.appendChild(nvEl('span', 'nv-hgr-coat-label', 'EQUIPPED COATING · 기체 도장'));
    const coatRow = nvEl('div', 'nv-hgr-coats');
    const active = paintValue();
    for (const c of NV_COATINGS) {
      const chip = nvEl('button', 'nv-coat-chip' + (c.id === active ? ' is-active' : ''));
      chip.type = 'button';
      chip.dataset.paint = c.id;
      chip.setAttribute('aria-pressed', c.id === active ? 'true' : 'false');
      chip.setAttribute('aria-label', c.nameEN + ' // ' + c.nameKR);
      chip.appendChild(nvEl('span', 'nv-coat-chip-glyph', c.glyph));
      const names = nvEl('span', 'nv-coat-chip-names');
      names.appendChild(nvEl('span', 'nv-coat-chip-en', c.nameEN));
      names.appendChild(nvEl('span', 'nv-coat-chip-kr', c.nameKR));
      chip.appendChild(names);
      chip.addEventListener('click', () => {
        setPaint(c.id);                          // persist + apply to live ship
        for (const el of coatRow.children) {
          const on = el.dataset.paint === c.id;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        drawHangarShip(canvas);                   // refresh preview immediately
      });
      coatRow.appendChild(chip);
    }
    model.appendChild(coatRow);

    // HULL selector (cosmetic alternate ship sprites from the atlas)
    model.appendChild(nvEl('span', 'nv-hgr-coat-label', 'HULL FRAME · 기체 형식'));
    const hullRow = nvEl('div', 'nv-hgr-coats');
    const activeHull = hullValue();
    for (const hh of NV_HULLS) {
      const chip = nvEl('button', 'nv-coat-chip' + (hh.id === activeHull ? ' is-active' : ''));
      chip.type = 'button';
      chip.dataset.hull = hh.id;
      chip.setAttribute('aria-pressed', hh.id === activeHull ? 'true' : 'false');
      chip.setAttribute('aria-label', hh.nameEN + ' // ' + hh.nameKR);
      chip.appendChild(nvEl('span', 'nv-coat-chip-glyph', hh.glyph));
      const names = nvEl('span', 'nv-coat-chip-names');
      names.appendChild(nvEl('span', 'nv-coat-chip-en', hh.nameEN));
      names.appendChild(nvEl('span', 'nv-coat-chip-kr', hh.nameKR));
      chip.appendChild(names);
      chip.addEventListener('click', () => {
        setHull(hh.id);
        for (const el of hullRow.children) {
          const on = el.dataset.hull === hh.id;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        drawHangarShip(canvas);
      });
      hullRow.appendChild(chip);
    }
    model.appendChild(hullRow);
    show.appendChild(model);
    body.appendChild(show);

    // draw the striker now; if the atlas hasn't decoded, redraw on decode/load
    if (drawHangarShip(canvas) === false) {
      const sheet = SY.nvSprites && SY.nvSprites.image;
      if (sheet) {
        const redraw = () => drawHangarShip(canvas);
        if (sheet.decode) sheet.decode().then(redraw).catch(() => {});
        sheet.addEventListener('load', redraw, { once: true });
      }
    }

    // ---- SYSTEM SPECS card (fixed flavor readout) ----
    const specCard = nvEl('section', 'nv-hgr-card clip-chamfer');
    const specHead = nvEl('div', 'nv-hgr-card-head');
    const specTitles = nvEl('div', 'nv-hgr-card-titles');
    specTitles.appendChild(nvEl('h3', 'nv-hgr-card-title', 'SYSTEM SPECS'));
    specTitles.appendChild(nvEl('span', 'nv-hgr-card-title-kr', '서브시스템 명세 · 제원 표시'));
    specHead.appendChild(specTitles);
    // TOTAL COMBAT EFFICIENCY ring
    const tce = nvEl('div', 'nv-hgr-tce');
    tce.appendChild(nvEl('span', 'nv-hgr-tce-val', NV_HGR_TCE + '%'));
    tce.appendChild(nvEl('span', 'nv-hgr-tce-label', 'TOTAL COMBAT EFFICIENCY'));
    specHead.appendChild(tce);
    specCard.appendChild(specHead);

    const bars = nvEl('div', 'nv-hgr-bars');
    for (const sp of NV_HGR_SPECS) {
      const row = nvEl('div', 'nv-hgr-bar-row');
      const rowHead = nvEl('div', 'nv-hgr-bar-head');
      const names = nvEl('div', 'nv-hgr-bar-names');
      names.appendChild(nvEl('span', 'nv-hgr-bar-name', sp.titleEN));
      names.appendChild(nvEl('span', 'nv-hgr-bar-name-kr', sp.titleKR));
      rowHead.appendChild(names);
      rowHead.appendChild(nvEl('span', 'nv-hgr-bar-pct nv-hgr-acc-' + sp.accent, sp.pct + '%'));
      row.appendChild(rowHead);
      const track = nvEl('div', 'nv-hgr-bar-track');
      const fill = nvEl('div', 'nv-hgr-bar-fill nv-hgr-acc-' + sp.accent);
      fill.style.width = sp.pct + '%';
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    }
    specCard.appendChild(bars);
    specCard.appendChild(nvEl('p', 'nv-hgr-spec-note',
      '* 제원 표시 전용 · 실제 게임 밸런스가 아닙니다'));
    body.appendChild(specCard);

    // ---- PHYSICAL TELEMETRY card (static flavor stats) ----
    const teleCard = nvEl('section', 'nv-hgr-tele');
    const teleHead = nvEl('div', 'nv-hgr-tele-head');
    teleHead.appendChild(nvEl('span', 'nv-hgr-tele-title', 'PHYSICAL TELEMETRY · 선체 물리 제원'));
    teleHead.appendChild(nvEl('span', 'nv-hgr-tele-code', 'ST_X77_SYS'));
    teleCard.appendChild(teleHead);
    const teleGrid = nvEl('div', 'nv-hgr-tele-grid');
    for (const m of NV_HGR_TELEMETRY) {
      const cell = nvEl('div', 'nv-hgr-tele-cell');
      cell.appendChild(nvEl('span', 'nv-hgr-tele-label', m.labelEN));
      cell.appendChild(nvEl('span', 'nv-hgr-tele-label-kr', m.labelKR));
      cell.appendChild(nvEl('span', 'nv-hgr-tele-val', m.value));
      teleGrid.appendChild(cell);
    }
    teleCard.appendChild(teleGrid);
    body.appendChild(teleCard);

    // ---- PILOT RECOGNITION chip (callsign + display-only rank tier) ----
    const pilot = nvEl('section', 'nv-hgr-pilot');
    const pilotInfo = nvEl('div', 'nv-hgr-pilot-info');
    pilotInfo.appendChild(nvEl('span', 'nv-hgr-pilot-label', 'PILOT RECOGNITION · 인증 파일럿'));
    pilotInfo.appendChild(nvEl('span', 'nv-hgr-pilot-call', 'CALLSIGN · PILOT_YOU'));
    const rankChip = nvEl('span', 'nv-hgr-pilot-rank', tier.name);
    rankChip.style.color = tier.color;
    rankChip.style.borderColor = tier.color;
    pilotInfo.appendChild(rankChip);
    pilot.appendChild(pilotInfo);
    const status = nvEl('span', 'nv-hgr-pilot-status', 'GRID READY');
    pilot.appendChild(status);
    body.appendChild(pilot);
  }

  // SYSTEM OVERHAUL — 신디케이트 오버홀. The UPGRADE shop is a DISPLAY-ONLY mock:
  // it READS recs.lifetime.crystals for the bank readout but NEVER decrements it,
  // spends nothing, writes no gameplay stat, and persists no upgrade. Every
  // UPGRADE control is disabled and labelled 표시 전용 // PREVIEW (all LV 0). The
  // one exception is the HULL FINISH selector, which sets the cosmetic ship
  // coating (purely visual) and stays in sync with the HANGAR selector.
  const NV_OVH_UPGRADES = [
    { icon: 'M13 2 4.5 13H11l-1 9 8.5-11H12z', titleEN: 'LASER DAMAGE', titleKR: '레이저 출력', cost: 800 },
    { icon: 'M12 3 5 6v5c0 4.2 2.9 8.1 7 9 4.1-.9 7-4.8 7-9V6z', titleEN: 'SHIELD CAPACITY', titleKR: '보호막 용량', cost: 500 },
    { icon: 'M7 4v6a5 5 0 0 0 10 0V4M7 4H4m3 0h3m7 0h-3m3 0h3M12 15v5', titleEN: 'CRYSTAL MAGNET', titleKR: '크리스탈 자석', cost: 300 },
    { icon: 'M13 2 4.5 13H11l-1 9 8.5-11H12zM5 5l-2 2m18-2 2 2', titleEN: 'BOOST SPEED', titleKR: '부스트 속도', cost: 5000 },
  ];

  function renderOverhaul() {
    const lt = recs.lifetime || { score: 0, crystals: 0, runs: 0 };

    const body = $('overhaul-body');
    body.textContent = ''; // clear (no innerHTML)

    // ---- header ----
    const header = nvEl('header', 'nv-ovh-head');
    const tag = nvEl('div', 'nv-ovh-tag');
    tag.appendChild(nvEl('span', 'nv-ovh-tag-kicker', '빌드 4.2.0-ARC'));
    tag.appendChild(nvEl('span', 'nv-ovh-tag-code', 'OVERHAUL_BAY_OK'));
    header.appendChild(tag);

    const titleRow = nvEl('div', 'nv-ovh-title-row');
    const titleWrap = nvEl('div', 'nv-ovh-title-wrap');
    titleWrap.appendChild(nvEl('h2', 'nv-ovh-title', 'SYSTEM OVERHAUL'));
    titleWrap.appendChild(nvEl('p', 'nv-ovh-subtitle', '신디케이트 오버홀'));
    titleRow.appendChild(titleWrap);
    // CRYSTAL_BANK chip — display-only; never decremented
    const bank = nvEl('div', 'nv-ovh-bank');
    bank.appendChild(nvEl('span', 'nv-ovh-bank-label', 'CRYSTAL_BANK'));
    const bankVal = nvEl('span', 'nv-ovh-bank-val');
    bankVal.appendChild(nvEl('span', 'nv-ovh-bank-gem', '◆'));
    bankVal.appendChild(document.createTextNode(' ' + fmt(lt.crystals || 0)));
    bank.appendChild(bankVal);
    titleRow.appendChild(bank);
    header.appendChild(titleRow);
    header.appendChild(nvEl('div', 'nv-ovh-rule'));
    body.appendChild(header);

    // ---- preview notice ----
    body.appendChild(nvEl('p', 'nv-ovh-note',
      '* 미리보기입니다 · 현재 게임플레이에 영향을 주지 않습니다'));

    // ---- upgrade cards ----
    const grid = nvEl('section', 'nv-ovh-grid');
    for (const u of NV_OVH_UPGRADES) {
      const card = nvEl('div', 'nv-ovh-card');

      const iconWrap = nvEl('div', 'nv-ovh-icon');
      iconWrap.appendChild(nvSvg(u.icon, 'nv-ovh-icon-svg'));
      card.appendChild(iconWrap);

      const info = nvEl('div', 'nv-ovh-info');
      const infoHead = nvEl('div', 'nv-ovh-info-head');
      const titles = nvEl('div', 'nv-ovh-titles');
      titles.appendChild(nvEl('h3', 'nv-ovh-name', u.titleEN));
      titles.appendChild(nvEl('span', 'nv-ovh-name-kr', u.titleKR));
      infoHead.appendChild(titles);
      infoHead.appendChild(nvEl('span', 'nv-ovh-lv', 'LV 0'));
      info.appendChild(infoHead);

      // level pips — all empty at level 0
      const pips = nvEl('div', 'nv-ovh-pips');
      for (let i = 0; i < 5; i++) pips.appendChild(nvEl('span', 'nv-ovh-pip'));
      info.appendChild(pips);

      const cost = nvEl('div', 'nv-ovh-cost');
      cost.appendChild(nvEl('span', 'nv-ovh-cost-gem', '◆'));
      cost.appendChild(nvEl('span', 'nv-ovh-cost-val', fmt(u.cost)));
      info.appendChild(cost);
      card.appendChild(info);

      // inert UPGRADE button — disabled, labelled 표시 전용 / PREVIEW
      const btn = nvEl('button', 'nv-ovh-btn', '표시 전용');
      btn.type = 'button';
      btn.disabled = true;
      btn.setAttribute('aria-label', '표시 전용 // PREVIEW');
      card.appendChild(btn);

      grid.appendChild(card);
    }
    body.appendChild(grid);

    // ---- hull finish registry (paint) ----
    const paintSec = nvEl('section', 'nv-ovh-paint');
    const paintHead = nvEl('div', 'nv-ovh-paint-head');
    paintHead.appendChild(nvEl('span', 'nv-ovh-paint-title', 'HULL FINISH REGISTRY'));
    paintHead.appendChild(nvEl('span', 'nv-ovh-paint-title-kr', '전술 편대 기체 도장'));
    paintSec.appendChild(paintHead);
    paintSec.appendChild(nvEl('p', 'nv-ovh-paint-desc',
      '특수 파장 제어 반사 코팅 — 선택 시 기체에 즉시 적용됩니다 (외형 전용).'));

    // functional coating selector, synced with the HANGAR selector
    const active = paintValue();
    const gallery = nvEl('div', 'nv-ovh-gallery');
    for (const c of NV_COATINGS) {
      const swatch = nvEl('button', 'nv-ovh-swatch nv-coat-chip' + (c.id === active ? ' is-active' : ''));
      swatch.type = 'button';
      swatch.dataset.paint = c.id;
      swatch.setAttribute('aria-pressed', c.id === active ? 'true' : 'false');
      swatch.setAttribute('aria-label', c.nameEN + ' // ' + c.nameKR);
      swatch.appendChild(nvEl('span', 'nv-ovh-swatch-glyph', c.glyph));
      swatch.appendChild(nvEl('span', 'nv-ovh-swatch-name', c.nameKR));
      swatch.addEventListener('click', () => {
        setPaint(c.id);
        for (const el of gallery.children) {
          const on = el.dataset.paint === c.id;
          el.classList.toggle('is-active', on);
          el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      });
      gallery.appendChild(swatch);
    }
    paintSec.appendChild(gallery);
    body.appendChild(paintSec);
  }

  // TACTICAL BADGES (display-only). `earned` is computed from REAL persisted
  // data only — recs.lifetime ({score,crystals,runs}) for the cumulative
  // milestones and the owned medal set (gameStore.loadMedals()) for
  // the combat badges. Where no real signal exists (5-consecutive-perfect runs
  // are not persisted), the badge stays LOCKED — it is never fake-earned.
  const NV_BADGES = [
    { id: 'crystals_1k', glyph: '✦', titleKR: '크리스탈 미광', descKR: '누적 1,000 나노 크리스탈을 채굴하십시오.', kind: 'crystals', target: 1000 },
    { id: 'crystals_10k', glyph: '◈', titleKR: '자원 통제관', descKR: '누적 10,000 나노 크리스탈을 채굴하십시오.', kind: 'crystals', target: 10000 },
    { id: 'crystals_100k', glyph: '◆', titleKR: '신디케이트 국고', descKR: '누적 100,000 나노 크리스탈을 징수 완료하십시오.', kind: 'crystals', target: 100000 },
    { id: 'score_100k', glyph: '♜', titleKR: '파괴의 임계값', descKR: '누적 시뮬레이션 점수 100,000점을 돌파하십시오.', kind: 'score', target: 100000 },
    { id: 'score_500k', glyph: '♛', titleKR: '구역 절대 지배자', descKR: '누적 시뮬레이션 점수 500,000점을 돌파하십시오.', kind: 'score', target: 500000 },
    { id: 'win_1', glyph: '✧', titleKR: '시뮬레이션 승인', descKR: '코어 워든 보스를 1회 격파 완료하십시오.', kind: 'medal', medal: 'boss' },
    { id: 'perfect_1', glyph: '◇', titleKR: '무결의 편향막', descKR: '피격 없이 기지 방어 시뮬레이션 1회를 완수하십시오.', kind: 'medal', medal: 'nohit' },
    { id: 'perfect_5_consecutive', glyph: '★', titleKR: '무적의 강습 기동함', descKR: '연속 5회 피격 없이 완벽 수비를 완주하십시오.', kind: 'unsupported' },
  ];

  // svg helper — build a namespaced <svg> via createElement (no innerHTML sink)
  function nvSvg(pathD, cls) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    if (cls) svg.setAttribute('class', cls);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', pathD);
    svg.appendChild(p);
    return svg;
  }
  // small element factory
  function nvEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  async function renderAchievements() {
    const owned = new Set(await gameStore.loadMedals());
    const lt = recs.lifetime || { score: 0, crystals: 0, runs: 0 };
    const isEarned = (b) => {
      if (b.kind === 'crystals') return (lt.crystals || 0) >= b.target;
      if (b.kind === 'score') return (lt.score || 0) >= b.target;
      if (b.kind === 'medal') return owned.has(b.medal);
      return false; // 'unsupported' — no persisted signal; never fake-earn
    };
    const badges = NV_BADGES.map((b) => ({ ...b, earned: isEarned(b) }));
    const earnedCount = badges.filter((b) => b.earned).length;
    const syncPct = Math.round((earnedCount / badges.length) * 100);
    // PERFECT SIMS: reflect the no-hit medal when owned, else fall back to TOTAL SIMS
    const hasPerfect = owned.has('nohit');
    const perfectVal = hasPerfect ? '1+' : fmt(lt.runs || 0);
    const perfectLabel = hasPerfect ? 'PERFECT SIMS' : 'TOTAL SIMS';

    const body = $('achievements-body');
    body.textContent = ''; // clear (no innerHTML)

    // ---- header ----
    const header = nvEl('header', 'nv-ach-head');
    const tag = nvEl('div', 'nv-ach-tag');
    tag.appendChild(nvEl('span', 'nv-ach-tag-kicker', 'REGISTRATION MEMORY'));
    tag.appendChild(nvEl('span', 'nv-ach-tag-code', 'BADGE_REGISTRY_OK'));
    header.appendChild(tag);
    const titleWrap = nvEl('div', 'nv-ach-title-wrap');
    titleWrap.appendChild(nvEl('h2', 'nv-ach-title', 'TACTICAL BADGES'));
    titleWrap.appendChild(nvEl('p', 'nv-ach-subtitle', '전술 훈장'));
    header.appendChild(titleWrap);
    header.appendChild(nvEl('div', 'nv-ach-rule'));
    body.appendChild(header);

    // ---- stat strip ----
    const strip = nvEl('section', 'nv-ach-strip');
    const chip = (label, value, gold) => {
      const c = nvEl('div', 'nv-ach-chip' + (gold ? ' nv-ach-chip-gold' : ''));
      c.appendChild(nvEl('span', 'nv-ach-chip-label', label));
      c.appendChild(nvEl('span', 'nv-ach-chip-val', value));
      return c;
    };
    strip.appendChild(chip('LIFETIME SCORE', fmt(lt.score || 0), false));
    strip.appendChild(chip('CRYSTALS', fmt(lt.crystals || 0), true));
    strip.appendChild(chip('CREDITS', fmt(lt.credits || 0), false));
    strip.appendChild(chip(perfectLabel, perfectVal, false));
    body.appendChild(strip);

    // ---- achievement sync bar ----
    const sync = nvEl('section', 'nv-ach-sync');
    const syncHead = nvEl('div', 'nv-ach-sync-head');
    syncHead.appendChild(nvEl('span', 'nv-ach-sync-label', 'ACHIEVEMENT SYNC'));
    syncHead.appendChild(nvEl('span', 'nv-ach-sync-val', earnedCount + ' / ' + badges.length + ' (' + syncPct + '%)'));
    sync.appendChild(syncHead);
    const syncBar = nvEl('div', 'nv-ach-sync-bar');
    const syncFill = nvEl('i');
    syncFill.style.width = syncPct + '%';
    syncBar.appendChild(syncFill);
    sync.appendChild(syncBar);
    body.appendChild(sync);

    // ---- badge grid ----
    const grid = nvEl('section', 'nv-ach-grid');
    for (const b of badges) {
      const card = nvEl('div', 'nv-ach-card' + (b.earned ? ' is-earned' : ' is-locked'));
      const badge = nvEl('div', 'nv-ach-badge');
      badge.appendChild(nvEl('span', 'nv-ach-glyph', b.glyph));
      if (!b.earned) {
        const lock = nvEl('span', 'nv-ach-lock');
        lock.appendChild(nvSvg('M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5z', 'nv-ach-lock-icon'));
        badge.appendChild(lock);
      }
      card.appendChild(badge);
      const info = nvEl('div', 'nv-ach-info');
      const infoHead = nvEl('div', 'nv-ach-info-head');
      infoHead.appendChild(nvEl('h3', 'nv-ach-name', b.titleKR));
      infoHead.appendChild(nvEl('span', 'nv-ach-state', b.earned ? 'VERIFIED' : 'ENCRYPTED'));
      info.appendChild(infoHead);
      info.appendChild(nvEl('p', 'nv-ach-desc', b.descKR));
      card.appendChild(info);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  // PILOT TELEMETRY BLACKBOX — 파일럿 비행 기록 블랙박스 (DISPLAY-ONLY). Reads
  // only persisted records: recs.lifetime ({score,crystals,runs}), recs.bestByDiff.normal
  // (record score), the owned medal set (for the perfect-flight count),
  // and the recent daily history (gameStore.loadRecentDailies). It writes no
  // record, touches no simulation/score/drop/seed state — and intentionally has
  // NO data-purge action (unlike the reference): the page only READS.
  async function renderPilotLog() {
    const [days, owned] = await Promise.all([
      gameStore.loadRecentDailies(14),
      gameStore.loadMedals(),
    ]);
    const ownedSet = new Set(owned);
    const lt = recs.lifetime || { score: 0, crystals: 0, runs: 0 };

    // logged runs: every recent day that has a daily record, most-recent first
    // (loadRecentDailies already returns newest-first, so it is the natural order)
    const entries = days.filter((d) => d.rec);

    // PERFECT FLIGHTS — derive from the owned no-hit / flawless medal
    // (the only persisted flawless-run signal). Owned => 1+; otherwise 0. No
    // per-run "took no damage" flag is persisted, so it is never fabricated.
    const hasPerfect = ownedSet.has('nohit') || ownedSet.has('flawless');
    const perfectVal = hasPerfect ? '1+' : '0';

    const body = $('pilotlog-body');
    body.replaceChildren(); // clear (no innerHTML)

    // ---- header ----
    const header = nvEl('header', 'nv-plg-head');
    const tag = nvEl('div', 'nv-plg-tag');
    const status = nvEl('span', 'nv-plg-tag-kicker');
    status.appendChild(nvEl('span', 'nv-plg-tag-dot'));
    status.appendChild(document.createTextNode('RECORDER ONLINE'));
    tag.appendChild(status);
    tag.appendChild(nvEl('span', 'nv-plg-tag-code', 'BLACKBOX_OK'));
    header.appendChild(tag);
    const titleWrap = nvEl('div', 'nv-plg-title-wrap');
    titleWrap.appendChild(nvEl('h2', 'nv-plg-title', 'PILOT TELEMETRY BLACKBOX'));
    titleWrap.appendChild(nvEl('p', 'nv-plg-subtitle', '파일럿 비행 기록 블랙박스'));
    titleWrap.appendChild(nvEl('p', 'nv-plg-subtitle-kr',
      '암호화된 비행 데이터 복구 및 전투 종합 기록 분석서'));
    header.appendChild(titleWrap);
    header.appendChild(nvEl('div', 'nv-plg-rule'));
    body.appendChild(header);

    // ---- summary stat grid (4 chips from real persisted data) ----
    const strip = nvEl('section', 'nv-plg-strip');
    const chip = (labelEN, labelKR, value, accent) => {
      const c = nvEl('div', 'nv-plg-chip' + (accent ? ' nv-plg-chip-' + accent : ''));
      const labels = nvEl('div', 'nv-plg-chip-labels');
      labels.appendChild(nvEl('span', 'nv-plg-chip-label', labelEN));
      labels.appendChild(nvEl('span', 'nv-plg-chip-label-kr', labelKR));
      c.appendChild(labels);
      c.appendChild(nvEl('span', 'nv-plg-chip-val', value));
      return c;
    };
    strip.appendChild(chip('TOTAL MISSIONS', '총 작전 수행 수', fmt(lt.runs || 0), null));
    strip.appendChild(chip('PERFECT FLIGHTS', '무결점 완벽 비행', perfectVal, 'green'));
    strip.appendChild(chip('CRYSTAL YIELD', '획득 차원 결정', fmt(lt.crystals || 0), 'cyan'));
    strip.appendChild(chip('CREDIT YIELD', '획득 크레딧', fmt(lt.credits || 0), 'amber'));
    strip.appendChild(chip('RECORD SCORE', '역대 최고 점수',
      (recs.bestByDiff && recs.bestByDiff.normal) ? fmt(recs.bestByDiff.normal.score) : '—', 'gold'));
    body.appendChild(strip);

    // ---- flight log list ----
    const list = nvEl('section', 'nv-plg-list');
    if (entries.length === 0) {
      const empty = nvEl('div', 'nv-plg-empty');
      empty.appendChild(nvEl('span', 'nv-plg-empty-glyph', '⌖'));
      empty.appendChild(nvEl('p', 'nv-plg-empty-text',
        '탐지된 비행 로그가 없습니다. 스트라이커 기체를 첫 전투에 출격시키십시오.'));
      list.appendChild(empty);
    } else {
      for (const d of entries) {
        const rec = d.rec;
        const tier = SY.nvMeta.rankTier(rec.score); // display-only pilot grade
        const card = nvEl('article', 'nv-plg-entry');

        // top row: date + boss flag, then the pilot-grade badge
        const head = nvEl('header', 'nv-plg-entry-head');
        const ident = nvEl('div', 'nv-plg-entry-ident');
        ident.appendChild(nvEl('time', 'nv-plg-entry-date', d.date));
        const flags = nvEl('div', 'nv-plg-entry-flags');
        flags.appendChild(nvEl('span', 'nv-plg-entry-mode', 'DAILY SORTIE'));
        if (rec.bossDown) flags.appendChild(nvEl('span', 'nv-plg-entry-boss', 'BOSS'));
        ident.appendChild(flags);
        head.appendChild(ident);
        const grade = nvEl('span', 'nv-plg-entry-grade', tier.name);
        grade.style.color = tier.color;
        grade.style.borderColor = tier.color;
        head.appendChild(grade);
        card.appendChild(head);

        // detail row: SCORE RECORD + YIELD (×combo) detail
        const detail = nvEl('div', 'nv-plg-entry-detail');
        const scoreCell = nvEl('div', 'nv-plg-entry-cell');
        scoreCell.appendChild(nvEl('span', 'nv-plg-entry-cell-label', 'SCORE RECORD'));
        scoreCell.appendChild(nvEl('span', 'nv-plg-entry-cell-val', fmt(rec.score)));
        detail.appendChild(scoreCell);
        const yieldCell = nvEl('div', 'nv-plg-entry-cell');
        yieldCell.appendChild(nvEl('span', 'nv-plg-entry-cell-label', 'YIELD'));
        const yieldVal = nvEl('span', 'nv-plg-entry-cell-val nv-plg-entry-yield',
          rec.combo ? '×' + rec.combo : '×1');
        yieldCell.appendChild(yieldVal);
        detail.appendChild(yieldCell);
        card.appendChild(detail);

        list.appendChild(card);
      }
    }
    body.appendChild(list);
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
    // fullscreen is opt-in via the ⛶ button — we no longer force it on game start
    syncToday(); // don't pace-compare a new day's run against yesterday's best
    runBestPace = mode === 'daily' && recs.dailyBest ? recs.dailyBest.pace : null;
    G.start(mode, difficultyValue()); // daily ignores it (engine forces Normal)
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
    const runDiff = res.difficulty || 'normal';
    recs.bestByDiff = recs.bestByDiff || { easy: null, normal: null, hard: null };
    if (!recs.bestByDiff[runDiff] || res.score > recs.bestByDiff[runDiff].score) {
      newAll = true;
      const rec = { score: res.score, combo: res.maxCombo, date: recs.today, mode: res.mode };
      recs.bestByDiff = { ...recs.bestByDiff, [runDiff]: rec };
      gameStore.saveBestFor(runDiff, rec);
    }
    // cosmetic lifetime totals (display-only; wired to UI in a later task)
    recs.lifetime = SY.nvMeta.accumulateLifetime(recs.lifetime, { score: res.score, crystals: res.crystalsCollected || 0, credits: res.creditsCollected || 0 });
    gameStore.saveLifetime(recs.lifetime);
    const tier = SY.nvMeta.rankTier(recs.lifetime.score);
    const prEl = $('over-pilot-rank'); prEl.textContent = tier.name; prEl.style.color = tier.color;
    $('over-bank').textContent = fmt(recs.lifetime.crystals);
    const isNewBest = newAll || newDaily;

    $('over-reason').textContent = res.reason === 'down' ? 'DRONE DESTROYED' : 'TIME UP';
    $('over-score').textContent = fmt(res.score);
    $('over-best-banner').classList.toggle('show', isNewBest);
    $('over-best-label').textContent = newAll
      ? 'NEW ' + (runDiff === 'normal' ? 'ALL-TIME' : runDiff.toUpperCase()) + ' BEST!'
      : 'NEW DAILY BEST!';
    const bd = res.breakdown;
    $('over-stats').innerHTML =
      statRow('CRYSTAL PTS', '+' + fmt(bd.crystals)) +
      statRow('COMBO BONUS', '+' + fmt(bd.combo)) +
      statRow('HEAT BONUS', '+' + fmt(bd.heat || 0)) +
      statRow('DESTRUCTION', '+' + fmt(bd.destruction)) +
      statRow('LOOT PTS', '+' + fmt(bd.loot || 0)) +
      statRow('BOSS PTS', '+' + fmt(bd.boss)) +
      statRow('MAX COMBO', '\u00d7' + res.maxCombo) +
      statRow('CRYSTALS', fmt(res.collected)) +
      statRow('CORE WARDEN', res.bossDown ? 'CLEARED \u2726' : res.mode && res.duration >= 40 ? 'SURVIVED' : '\u2014') +
      statRow(res.mode === 'daily' ? 'TODAY\u2019S BEST' : 'ALL-TIME BEST',
        res.mode === 'daily'
          ? (recs.dailyBest ? fmt(recs.dailyBest.score) : '\u2014') // null right after a midnight rollover
          : fmt((recs.bestByDiff[res.difficulty || 'normal'] || { score: res.score }).score));
    drawSparkline(res.pace, res.mode === 'daily' ? runBestPace : null);

    $('btn-share').style.display = res.mode === 'daily' ? '' : 'none';
    $('btn-share').textContent = 'COPY RESULT';
    $('over-mode').textContent = res.mode === 'daily' ? 'DAILY \u00b7 ' + recs.today : 'FREE PLAY';

    // rank is synchronous (deterministic); medals persist asynchronously so the
    // IndexedDB round-trip never delays the result screen / countdown
    const r = SY.nvMedals.rank(res.score);
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
      'NEON VORTEX \u00b7 Daily ' + recs.today,
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

  // ---------- difficulty selector (free-play only; daily is always Normal) ----------
  // NV_DIFFICULTIES / difficultyValue are declared at the top of the IIFE (used by
  // loadRecords + renderMenuStats); setDifficulty lives here with the other settings setters.
  function setDifficulty(id) {
    const next = NV_DIFFICULTIES.includes(id) ? id : 'normal';
    recs.settings.nvDifficulty = next;
    SY.store.saveSettings(recs.settings);
    renderMenuStats();           // headline best reflects the selected difficulty
    syncDifficultyChips();
  }
  function syncDifficultyChips() {
    const sel = difficultyValue();
    for (const d of NV_DIFFICULTIES) {
      const el = $('diff-' + d);
      if (el) {
        el.classList.toggle('is-active', d === sel);
        el.setAttribute('aria-pressed', d === sel ? 'true' : 'false');
      }
    }
    const sub = $('free-sub');
    if (sub) sub.textContent = '무작위 시드 아레나 · ' + sel.toUpperCase();
  }

  // ---------- hull coating (cosmetic ship paint) ----------
  // Persisted under recs.settings.nvPaint (neonvortex-scoped). Purely visual:
  // sets the cached tint in SY.nvSprites — no gameplay/seed effect.
  const NV_COATINGS = [
    { id: 'neon',    nameEN: 'NEON MATRIX',  nameKR: '네온 매트릭스', glyph: '◆' },
    { id: 'stealth', nameEN: 'VOID STEALTH', nameKR: '공허 스텔스',   glyph: '◈' },
    { id: 'solar',   nameEN: 'SOLAR FORGE',  nameKR: '태양 용광로',   glyph: '✦' },
  ];
  const paintValue = () => {
    const id = recs.settings && recs.settings.nvPaint;
    return NV_COATINGS.some((c) => c.id === id) ? id : 'neon';
  };
  function setPaint(id) {
    const next = NV_COATINGS.some((c) => c.id === id) ? id : 'neon';
    recs.settings.nvPaint = next;
    SY.nvSprites.setPaint(next);
    SY.store.saveSettings(recs.settings);
  }
  // alternate hull skins (atlas ship variants). Persisted under settings.nvHull.
  // Purely visual — swaps the player sprite, no gameplay/seed effect.
  const NV_HULLS = [
    { id: 'default', nameEN: 'INTERCEPTOR', nameKR: '인터셉터',   glyph: '▲' },
    { id: 'upg1',    nameEN: 'STRIKE MK-I', nameKR: '스트라이크 I', glyph: '◤' },
    { id: 'upg2',    nameEN: 'STRIKE MK-II', nameKR: '스트라이크 II', glyph: '◢' },
    { id: 'upg3',    nameEN: 'STRIKE MK-III', nameKR: '스트라이크 III', glyph: '✪' },
    { id: 'upg4',    nameEN: 'STRIKE MK-IV', nameKR: '스트라이크 IV', glyph: '◥' },
  ];
  const hullValue = () => {
    const id = recs.settings && recs.settings.nvHull;
    return NV_HULLS.some((h) => h.id === id) ? id : 'default';
  };
  function setHull(id) {
    const next = NV_HULLS.some((h) => h.id === id) ? id : 'default';
    recs.settings.nvHull = next;
    SY.nvSprites.setHull(next);
    SY.store.saveSettings(recs.settings);
  }
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
  for (const d of NV_DIFFICULTIES) {
    $('diff-' + d).addEventListener('click', () => setDifficulty(d));
  }
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

  // ---------- register with the runtime shell ----------
  SY.registerGame({
    id: 'neonvortex',
    title: 'NEON VORTEX',
    blurb: 'ARCADE_PILOT_OS · BEAT THE CORE WARDEN',
    accent: '#00dbe7',
    enter, exit, frame,
    pause: pauseGame, resume: resumeGame,
  });
})();
