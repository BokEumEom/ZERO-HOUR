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
  function renderHub() {
    $('arcade-grid').innerHTML = games.map((g) =>
      '<button class="game-card" data-id="' + g.id + '" type="button" style="--c:' + (g.accent || '#2de2c6') + '">' +
      '<span class="game-card-title">' + g.title + '</span>' +
      '<span class="game-card-blurb">' + g.blurb + '</span>' +
      '</button>'
    ).join('');
    $('arcade-grid').querySelectorAll('.game-card').forEach((el) =>
      el.addEventListener('click', () => SY.shell.enterGame(el.getAttribute('data-id'))));
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
      if (g.href) { window.location.href = g.href; return; } // linked game: open its own page
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
