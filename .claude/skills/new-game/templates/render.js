// Scoreyard — __TITLE__ canvas renderer
(function () {
  const SY = (window.SY = window.SY || {});
  const G = SY.game;
  const { W, H } = G;

  // Called every frame by main.frame with the shell's 2D context (already scaled
  // to fit). Math.random() HERE is fine — rendering is cosmetic and never affects
  // score, so it must not consume the seeded s.rng() stream.
  function render(ctx) {
    const s = G.state;
    // background
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, W, H);
    if (!s) return;

    // ...draw entities here.
    // Perf: avoid per-frame gradient creation and redundant fillStyle/save/
    // restore inside tight loops (see the performance-analyzer agent).
  }

  SY.render = render;
})();
