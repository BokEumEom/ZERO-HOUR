// Scoreyard — arcade shell. Game-agnostic: owns the shared canvas + rAF loop,
// the responsive layout (fit/rotation), the game registry, and the game-select
// hub. Each game plugs in via SY.registerGame({ id, title, blurb, accent,
// enter, exit, frame, pause?, resume? }) and owns its own screens/HUD/records.
(function () {
  const SY = (window.SY = window.SY || {});
  const $ = (id) => document.getElementById(id);
  SY.layout = SY.layout || { rot: 0, portrait: false };
  SY.input = SY.input || { ax: 0, ay: 0 };

  const games = [];
  let active = null;
  SY.registerGame = function (def) { games.push(def); };

  // ---------- shared canvas + loop ----------
  const SW = 960, SH = 600;
  const stage = $('stage');
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  let lastT = 0;
  function loop(t) {
    const dt = Math.min(1 / 30, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (active && active.frame) active.frame(dt, ctx);
    else ctx.clearRect(0, 0, SW, SH); // hub idle: canvas sits under the hub overlay
    requestAnimationFrame(loop);
  }

  // ---------- responsive layout (only the stage scales) — ADR-0006 ----------
  const hudEl = $('hud');
  function fit() {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const portrait = vh > vw;
    SY.layout.portrait = portrait;
    SY.layout.rot = portrait ? Math.PI / 2 : 0; // games counter-rotate overlay text by this
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);
    if (portrait) {
      // rotate the 1.6:1 arena 90° CW to fill the portrait width edge-to-edge
      const hudH = hudEl ? hudEl.offsetHeight : 0;
      const availH = vh - hudH;
      const s = Math.min(vw / SH, availH / SW);
      const dispW = SH * s, dispH = SW * s;
      const lx = (vw - dispW) / 2;
      const ly = hudH + Math.max(0, (availH - dispH) / 2);
      stage.style.transform =
        'translate(' + (lx + dispW) + 'px, ' + ly + 'px) rotate(90deg) scale(' + s + ')';
    } else {
      const s = Math.min(vw / SW, vh / SH, 1.5);
      stage.style.transform =
        'translate(' + ((vw - SW * s) / 2) + 'px, ' + ((vh - SH * s) / 2) + 'px) scale(' + s + ')';
    }
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);

  // ---------- game-select hub ----------
  // "best set N days ago" as a lightweight last-played proxy (best_all.date),
  // so no new persistence is needed. Cosmetic only — never gameplay state.
  function fmtPlayed(dateStr, today) {
    if (!dateStr) return '';
    const d = Date.parse(dateStr + 'T00:00:00Z');
    const t = Date.parse(today + 'T00:00:00Z');
    if (isNaN(d) || isNaN(t)) return '';
    const days = Math.round((t - d) / 86400000);
    if (days <= 0) return '오늘';
    if (days === 1) return '어제';
    return days + '일 전';
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function makeCard(g) {
    const btn = el('button', 'game-card');
    btn.type = 'button';
    btn.setAttribute('data-id', g.id);
    btn.style.setProperty('--c', g.accent || '#2de2c6');
    btn.append(
      el('span', 'game-card-title', g.title),
      el('span', 'game-card-blurb', g.blurb),
      el('span', 'game-card-meta', '…') // '…' is the loading state until the record resolves
    );
    btn.lastChild.setAttribute('data-meta-for', g.id);
    btn.addEventListener('click', () => SY.shell.enterGame(g.id));
    return btn;
  }

  function makeEmptyState() {
    const box = el('div', 'hub-empty');
    const reload = el('button', 'arcade-btn primary', '↻ RELOAD');
    reload.type = 'button';
    reload.addEventListener('click', () => location.reload());
    box.append(
      el('span', 'hub-empty-glyph', '▢'),
      el('span', 'hub-empty-title', 'NO MACHINES YET'),
      el('span', 'hub-empty-msg', '게임을 불러오지 못했어요. 연결을 확인하고 새로고침 해보세요.'),
      reload
    );
    return box;
  }

  // Async card scent: cards render immediately, then BEST / play-status fills in
  // as each game's record resolves. Linked games keep their own store on their
  // own page, so the shell shows them as NEW until played in-shell.
  function fillCardMeta() {
    games.forEach(async (g) => {
      const meta = document.querySelector('[data-meta-for="' + g.id + '"]');
      if (!meta) return;
      try {
        const { bestAll, today } = await SY.store.forGame(g.id).loadAll();
        meta.textContent = '';
        if (bestAll && typeof bestAll.score === 'number') {
          meta.append(el('span', 'meta-best', 'BEST ' + bestAll.score.toLocaleString()));
          const played = fmtPlayed(bestAll.date, today);
          if (played) meta.append(el('span', 'meta-played', ' · ' + played));
        } else {
          meta.append(el('span', 'meta-new', 'NEW · 처음이에요'));
        }
      } catch (e) {
        meta.textContent = ''; // record unreadable: show nothing, never a stack trace
      }
    });
  }

  function renderHub() {
    const grid = $('arcade-grid');
    const foot = $('arcade-foot');
    grid.textContent = '';
    // Fail-safe empty state: games never registered (script/CDN failure) or none.
    if (!games.length) {
      grid.append(makeEmptyState());
      if (foot) foot.textContent = '';
      return;
    }
    games.forEach((g) => grid.append(makeCard(g)));
    if (foot) foot.textContent = 'v1 · ' + games.length + ' GAMES · ALL SCORES LOCAL';
    fillCardMeta();
  }

  function showHub() {
    // hide any shared chrome / HUD a game left visible
    ['btn-mute', 'btn-pause', 'btn-fullscreen'].forEach((id) => { const e = $(id); if (e) e.style.display = 'none'; });
    const hud = $('hud'); if (hud) hud.style.visibility = 'hidden';
    renderHub();
    $('screen-arcade').classList.add('visible');
  }

  SY.shell = {
    enterGame(id) {
      const g = games.find((x) => x.id === id);
      if (!g) return;
      if (g.href) { // linked game: open its own page, fading out first to avoid a hard cut
        const vp = $('viewport');
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (vp && !reduce) {
          vp.classList.add('leaving');
          setTimeout(() => { window.location.href = g.href; }, 220);
        } else {
          window.location.href = g.href;
        }
        return;
      }
      active = g;
      $('screen-arcade').classList.remove('visible');
      if (active.enter) active.enter();
    },
    exitToHub() {
      if (active && active.exit) active.exit();
      active = null;
      showHub();
    },
    activeId() { return active ? active.id : null; },
  };

  // ---------- boot ----------
  (async function boot() {
    const settings = await SY.store.loadSettings();
    SY.settings = settings; // shared across games
    SY.audio.setMuted(!!settings.muted);
    SY.audio.setHaptics(settings.haptics !== false);
    fit();
    showHub(); // games registered synchronously before this microtask resumes
    requestAnimationFrame(loop);
  })();
})();
