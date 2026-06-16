// Zero Hour — score tiers (ranks) + medals. Pure logic, no DOM, so it is
// unit-testable in isolation. Attaches to SY.zh.medals.
(function () {
  const SY = (window.SY = window.SY || {});

  // Ranks by final score, highest first. Thresholds are tunable.
  const TIERS = [
    { id: 'legend', name: 'LEGEND', min: 5000 },
    { id: 'ace', name: 'ACE', min: 3000 },
    { id: 'pilot', name: 'PILOT', min: 1500 },
    { id: 'recruit', name: 'RECRUIT', min: 0 },
  ];
  function rank(score) {
    for (const t of TIERS) if (score >= t.min) return t;
    return TIERS[TIERS.length - 1];
  }

  // Lean lifetime medal set. `cond` is pure: (res, ctx) -> bool.
  const MEDALS = [
    { id: 'boss', name: 'CORE WARDEN', glyph: '✦', desc: 'Defeat the Core Warden' },
    { id: 'nohit', name: 'NO HIT', glyph: '◇', desc: 'Finish without taking a hit' },
    { id: 'flawless', name: 'FLAWLESS', glyph: '★', desc: 'No hit + boss defeated' },
    { id: 'combo25', name: 'COMBO ×25', glyph: '⚡', desc: 'Reach a ×25 combo' },
    { id: 'legend', name: 'LEGEND', glyph: '♛', desc: 'Score 5,000+' },
    { id: 'streak7', name: 'WEEK STREAK', glyph: '🔥', desc: '7-day daily streak' },
  ];

  // Returns the medal ids earned by a finished run. ctx carries cross-run state
  // the result object doesn't (e.g., the current daily streak).
  function evalRun(res, ctx) {
    const streak = (ctx && ctx.streak) || 0;
    const ids = [];
    if (res.bossDown) ids.push('boss');
    if (res.noHit) ids.push('nohit');
    if (res.noHit && res.bossDown) ids.push('flawless');
    if (res.maxCombo >= 25) ids.push('combo25');
    if (rank(res.score).id === 'legend') ids.push('legend');
    if (streak >= 7) ids.push('streak7');
    return ids;
  }

  SY.zh = SY.zh || {};
  SY.zh.medals = { TIERS, MEDALS, rank, evalRun };
})();
