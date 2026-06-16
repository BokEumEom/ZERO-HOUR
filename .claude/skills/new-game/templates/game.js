// Scoreyard — __TITLE__ core engine (state + simulation). Rendering lives in render.js.
(function () {
  const SY = (window.SY = window.SY || {});

  const W = 960, H = 600; // world units; the shell scales this to fit the screen

  const G = {
    W, H,
    state: null,

    // Build a fresh run. `seed` is the daily seed string (or a free-play seed).
    // IMPORTANT: every gameplay-affecting random MUST draw from s.rng() so the
    // same seed always produces the same world (daily-challenge fairness).
    start(seed) {
      const rng = SY.makeRng(seed); // seeded RNG — gameplay randomness ONLY via this
      G.state = {
        rng,
        t: 0,
        over: false,
        score: 0,
        // ...entities go here. Example seeded spawn:
        // spawnX: rng() * W,
      };
    },

    // Advance the simulation by dt seconds (called every frame by main.frame).
    update(dt) {
      const s = G.state;
      if (!s || s.over) return;
      s.t += dt;
      // ...movement, spawning (use s.rng()), collision, scoring.
      // Keep this allocation-free: no object/array literals or .map/.filter
      // per frame (60fps hot path). Spawn-time allocation is fine.
    },

    toMenu() { G.state = null; },
  };

  SY.game = G;
})();
