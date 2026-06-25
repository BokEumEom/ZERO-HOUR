// NEON VORTEX — cosmetic (display-only) meta: lifetime totals + pilot rank tier.
// ESM mirror of meta.js (IIFE on window.SY). Keep the two in sync.
//
// Tiers use an inclusive lower bound (`min`): a cumulative lifetime score falls
// in the highest tier whose `min` it reaches.
export const TIERS = [
  { key: 'ROOKIE', min: 0,      name: 'ROOKIE PILOT',    color: '#38bdf8' },
  { key: 'ELITE',  min: 5000,   name: 'ELITE WINGMAN',   color: '#a78bfa' },
  { key: 'ACE',    min: 20000,  name: 'ACE STRIKER',     color: '#34d399' },
  { key: 'CMDR',   min: 90000,  name: 'FLEET COMMANDER', color: '#fbbf24' },
  { key: 'LEGEND', min: 150000, name: 'GALAXY LEGEND',   color: '#fb7185' },
];

export function rankTier(score) {
  const s = Math.max(0, Number(score) || 0);
  let tier = TIERS[0];
  for (const t of TIERS) { if (s >= t.min) tier = t; }
  return tier;
}

export function accumulateLifetime(prev, run) {
  const p = prev || { score: 0, crystals: 0, runs: 0 };
  return {
    score: (p.score || 0) + (Number(run.score) || 0),
    crystals: (p.crystals || 0) + (Number(run.crystals) || 0),
    credits: (p.credits || 0) + (Number(run.credits) || 0),
    runs: (p.runs || 0) + 1,
  };
}
