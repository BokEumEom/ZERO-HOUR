// Scoreyard — __TITLE__ UI glue: lifecycle, HUD, records, registration
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.game;

  const gameStore = SY.store.forGame('__ID__'); // namespaced per-game records

  // ---------- lifecycle (shell-driven; registered via SY.registerGame below) ----------
  function enter() {
    // Runs when the player opens this game from the hub.
    // SY.todayUTC() gives the daily seed; use a free-play seed string for casual.
    G.start(SY.todayUTC());
    // ...show this game's menu/HUD DOM here.
  }

  function exit() {
    G.toMenu();
    // ...hide this game's DOM here.
  }

  // Called every frame by the shell while this game is active.
  function frame(dt, ctx) {
    G.update(dt);
    SY.render(ctx);
    // ...update HUD DOM here.
  }

  // ---------- register with the arcade shell ----------
  SY.registerGame({
    id: '__ID__',
    title: '__TITLE__',
    blurb: '__BLURB__',
    accent: '__ACCENT__',
    enter, exit, frame,
    // pause / resume are optional — add them if the game needs to freeze.
  });
})();
