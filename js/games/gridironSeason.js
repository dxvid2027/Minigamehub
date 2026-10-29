// ==========================================================================
// Gridiron Kings — the season: schedule, simulated games, standings and the
// playoffs. All 32 teams play every week; the user's game is played (or
// simulated) and everybody else's is simulated drive by drive from the
// teams' offence and defence ratings.
// ==========================================================================
import { TEAMS, teamById } from "./gridironData.js";

const rand = (a, b) => a + Math.random() * (b - a);

/** A plausible final score from ratings, drive by drive. */
export function simulateGame(aId, bId, userBoost = 0) {
  const A = teamById(aId), B = teamById(bId);
  const drives = 10 + ((Math.random() * 4) | 0);
  const score = [0, 0];
  for (let d = 0; d < drives * 2; d++) {
    const side = d % 2;
    const off = side ? B.off : A.off + userBoost, def = side ? A.def + userBoost : B.def;
    const edge = (off - def) / 100;
    const r = Math.random();
    const td = 0.21 + edge * 0.9, fg = 0.15 + edge * 0.2;
    if (r < td) score[side] += Math.random() < 0.94 ? 7 : 6;
    else if (r < td + fg) score[side] += 3;
  }
  // Home edge breaks ties; real games can still end tied, rarely.
  if (score[0] === score[1]) { if (Math.random() < 0.92) score[Math.random() < 0.55 ? 0 : 1] += 3; }
  return score;
}

export function createSeason(userId, weeks) {
  const ids = TEAMS.map(t => t.id);
  const schedule = [];
  const met = new Set();
  for (let w = 0; w < weeks; w++) {
    let best = null;
    for (let tries = 0; tries < 30; tries++) {
      const sh = [...ids].sort(() => Math.random() - 0.5);
      const pairs = [];
      for (let i = 0; i < sh.length; i += 2) pairs.push(Math.random() < 0.5 ? [sh[i], sh[i + 1]] : [sh[i + 1], sh[i]]);
      const up = pairs.find(p => p.includes(userId));
      const opp = up[0] === userId ? up[1] : up[0];
      best = pairs;
      if (!met.has(opp)) { met.add(opp); break; }
    }
    schedule.push(best.map(([a, b]) => ({ a, b, played: false, sa: 0, sb: 0 })));
  }
  const table = {};
  for (const id of ids) table[id] = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  return { kind: "season", user: userId, weeks, week: 0, schedule, table, playoffs: null, done: false, champion: null, out: false, score: 0 };
}

export function userGame(s) {
  if (s.done) return null;
  if (s.playoffs) {
    const r = s.playoffs.rounds[s.playoffs.round];
    return r?.find(g => !g.played && (g.a === s.user || g.b === s.user)) || null;
  }
  return s.schedule[s.week]?.find(g => g.a === s.user || g.b === s.user) || null;
}

function record(s, g, sa, sb) {
  g.played = true; g.sa = sa; g.sb = sb;
  if (s.playoffs) return;
  const A = s.table[g.a], B = s.table[g.b];
  A.pf += sa; A.pa += sb; B.pf += sb; B.pa += sa;
  if (sa > sb) { A.w++; B.l++; } else if (sb > sa) { B.w++; A.l++; } else { A.t++; B.t++; }
}

export function standings(s) {
  return Object.entries(s.table).map(([id, r]) => ({ id, ...r, pct: (r.w + r.t * 0.5) / Math.max(1, r.w + r.l + r.t) }))
    .sort((a, b) => b.pct - a.pct || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);
}

export const ROUND_NAMES = ["Wild Card", "Semifinal", "Championship"];

/** Records the user's game, simulates the rest of the week, moves on. */
export function finishWeek(s, userScore, cpuScore) {
  const g = userGame(s);
  if (g) {
    const userHome = g.a === s.user;
    if (s.playoffs && userScore === cpuScore) userScore += 3;       // no ties in the playoffs
    record(s, g, userHome ? userScore : cpuScore, userHome ? cpuScore : userScore);
  }
  if (s.playoffs) {
    const P = s.playoffs;
    for (const x of P.rounds[P.round]) if (!x.played) { const [a, b] = simulateGame(x.a, x.b); record(s, x, a, b === a ? b + 3 : b); }
    const winners = P.rounds[P.round].map(x => (x.sa > x.sb ? x.a : x.b));
    if (!winners.includes(s.user)) s.out = s.out || ROUND_NAMES[P.round];
    if (winners.length === 1) { s.champion = winners[0]; s.done = true; return; }
    const next = [];
    for (let i = 0; i < winners.length / 2; i++) next.push({ a: winners[i], b: winners[winners.length - 1 - i], played: false, sa: 0, sb: 0 });
    P.rounds.push(next);
    P.round++;
    if (s.out) { while (!s.done) finishWeek(s, 0, 0); }
    return;
  }
  for (const x of s.schedule[s.week]) if (!x.played) { const [a, b] = simulateGame(x.a, x.b); record(s, x, a, b); }
  s.week++;
  if (s.week >= s.weeks) {
    // Top eight make the playoffs: 1v8, 2v7, 3v6, 4v5.
    const seeds = standings(s).slice(0, 8).map(r => r.id);
    s.seeds = seeds;
    s.playoffs = { round: 0, rounds: [[0, 1, 2, 3].map(i => ({ a: seeds[i], b: seeds[7 - i], played: false, sa: 0, sb: 0 }))] };
    if (!seeds.includes(s.user)) {
      s.out = "Regular season";
      while (!s.done) finishWeek(s, 0, 0);
    }
  }
}
