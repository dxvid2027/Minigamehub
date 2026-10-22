// ==========================================================================
// Golden Goal — competitions.
//
// Two formats, both as plain JSON state so a run can be saved after every
// match and picked up again later:
//
//   World Cup        48 nations, twelve groups of four. The top two and the
//                    eight best third-placed sides go into a round of 32, then
//                    straight knockout to the final.
//   Champions League 36 clubs in one league table, eight matches each against
//                    eight different opponents. 1–8 go to the round of 16,
//                    9–24 play a knockout play-off for the other eight places.
//                    Every tie is a one-off match.
//
// A competition is a list of rounds. Each round is a list of fixtures; the
// player's own fixture is played (or simulated) first, then the rest of the
// round is simulated and the next round is built from the results.
// ==========================================================================
import { NATIONS, CLUBS, teamKey, getTeam } from "./goldenGoalData.js";

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const STAGE_NAMES = {
  friendly: "Friendly", group: "Group stage", league: "League phase", po: "Knockout play-off",
  r32: "Round of 32", r16: "Round of 16", qf: "Quarter-final", sf: "Semi-final", final: "Final",
};

// --- Match simulation -----------------------------------------------------
function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L && k < 12);
  return k - 1;
}

/** Expected goals for a side, from the two ratings. */
function xg(rFor, rAgainst) { return Math.max(0.15, Math.min(4.2, 1.32 * Math.pow(10, (rFor - rAgainst) / 46))); }

/**
 * Simulates one match. A knockout draw goes to a penalty shoot-out, weighted
 * very slightly towards the stronger side. Goal minutes are spread over 90.
 */
export function simulateMatch(rA, rB, knockout = false) {
  const ga = poisson(xg(rA, rB)), gb = poisson(xg(rB, rA));
  const events = [];
  for (let i = 0; i < ga; i++) events.push({ min: 1 + Math.floor(Math.random() * 90), side: 0 });
  for (let i = 0; i < gb; i++) events.push({ min: 1 + Math.floor(Math.random() * 90), side: 1 });
  events.sort((a, b) => a.min - b.min);
  let pa = null, pb = null;
  if (knockout && ga === gb) {
    const edge = 0.5 + (rA - rB) * 0.006;
    pa = 0; pb = 0;
    for (let i = 0; i < 5; i++) { if (Math.random() < 0.76 + (edge - 0.5) * 0.3) pa++; if (Math.random() < 0.76 - (edge - 0.5) * 0.3) pb++; }
    while (pa === pb) { if (Math.random() < 0.75) pa++; if (Math.random() < 0.75) pb++; }
  }
  return { ga, gb, pa, pb, events };
}

// --- Fixtures & tables ----------------------------------------------------
const fixture = (a, b, extra = {}) => ({ a, b, ga: null, gb: null, pa: null, pb: null, played: false, ...extra });

export function winnerOf(f) {
  if (!f.played) return null;
  if (f.ga !== f.gb) return f.ga > f.gb ? f.a : f.b;
  return f.pa > f.pb ? f.a : f.b;
}
export const loserOf = (f) => (winnerOf(f) === f.a ? f.b : f.a);

/** Sorted standings for a set of teams from the fixtures they played. */
export function standings(teams, fixtures, ratingOf) {
  const rows = new Map(teams.map(t => [t, { id: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  for (const f of fixtures) {
    if (!f.played || !rows.has(f.a) || !rows.has(f.b)) continue;
    const A = rows.get(f.a), B = rows.get(f.b);
    A.p++; B.p++; A.gf += f.ga; A.ga += f.gb; B.gf += f.gb; B.ga += f.ga;
    if (f.ga > f.gb) { A.w++; B.l++; A.pts += 3; }
    else if (f.ga < f.gb) { B.w++; A.l++; B.pts += 3; }
    else { A.d++; B.d++; A.pts++; B.pts++; }
  }
  return [...rows.values()].map(r => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || ratingOf(y.id) - ratingOf(x.id) || x.id.localeCompare(y.id));
}

// --- Bracket helpers ------------------------------------------------------
/** Order of seeds down a bracket so seeds 1 and 2 can only meet in the final. */
function bracketOrder(n) {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2 + 1;
    order = order.flatMap(s => [s, m - s]);
  }
  return order;
}

/** Pairs consecutive winners of a round into the next one. */
function nextKnockout(prev) {
  const out = [];
  for (let i = 0; i < prev.length; i += 2) out.push(fixture(winnerOf(prev[i]), winnerOf(prev[i + 1]), { ko: true }));
  return out;
}

// --- Competition object ---------------------------------------------------
export function ratingOfKey(key) { return getTeam(key)?.r ?? 70; }

export function createCompetition(kind, userKey) {
  if (kind === "wc") return createWorldCup(userKey);
  if (kind === "cl") return createChampionsLeague(userKey);
  return createFriendly(userKey.home, userKey.away);
}

function createWorldCup(user) {
  const keys = NATIONS.map(teamKey);
  const hosts = ["nation:USA", "nation:MEX", "nation:CAN"];
  const rest = keys.filter(k => !hosts.includes(k)).sort((a, b) => ratingOfKey(b) - ratingOfKey(a));
  // Four pots of twelve by strength; the hosts head pot one.
  const pots = [hosts.concat(rest.slice(0, 9)), rest.slice(9, 21), rest.slice(21, 33), rest.slice(33, 45)];
  const letters = "ABCDEFGHIJKL".split("");
  const groups = letters.map(name => ({ name, teams: [] }));
  // Hosts keep A, B and D like the real draw; everything else is random.
  groups[0].teams.push(hosts[0]); groups[1].teams.push(hosts[1]); groups[3].teams.push(hosts[2]);
  const freeSlots = groups.filter(g => !g.teams.length);
  shuffle(pots[0].slice(3)).forEach((t, i) => freeSlots[i].teams.push(t));
  for (let p = 1; p < 4; p++) shuffle(pots[p]).forEach((t, i) => groups[i].teams.push(t));
  groups.forEach(g => { g.teams = shuffle(g.teams); });

  // Three matchdays: 1v2 3v4, 1v3 2v4, 1v4 2v3.
  const pairings = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  const rounds = pairings.map((md, i) => ({
    stage: "group", label: `Group stage · Matchday ${i + 1}`,
    fixtures: groups.flatMap(g => md.map(([x, y]) => fixture(g.teams[x], g.teams[y], { group: g.name }))),
  }));
  return { kind: "wc", title: "World Cup", user, groups, rounds, index: 0, out: null, champion: null, score: 0, log: [] };
}

function createChampionsLeague(user) {
  const keys = shuffle(CLUBS.map(teamKey));
  // Circle method: 35 rounds of a full round robin, of which the first eight
  // give every club eight different opponents.
  const n = keys.length, fixed = keys[0], rot = keys.slice(1);
  const rounds = [];
  for (let r = 0; r < 8; r++) {
    const order = [fixed, ...rot];
    const fx = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i], b = order[n - 1 - i];
      fx.push(r % 2 ? fixture(b, a) : fixture(a, b));
    }
    rounds.push({ stage: "league", label: `League phase · Matchday ${r + 1}`, fixtures: fx });
    rot.unshift(rot.pop());
  }
  return { kind: "cl", title: "Champions League", user, teams: keys, rounds, index: 0, out: null, champion: null, score: 0, log: [] };
}

function createFriendly(home, away) {
  return {
    kind: "fr", title: "Friendly", user: home, rounds: [{ stage: "friendly", label: "Friendly", friendly: true, fixtures: [fixture(home, away, { ko: false })] }],
    index: 0, out: null, champion: null, score: 0, log: [],
  };
}

export const currentRound = (c) => c.rounds[c.index] || null;
export function userFixture(c) {
  const r = currentRound(c);
  return r?.fixtures.find(f => f.a === c.user || f.b === c.user) || null;
}

/** Group tables (World Cup). */
export function groupTables(c) {
  const all = c.rounds.filter(r => r.stage === "group").flatMap(r => r.fixtures);
  return c.groups.map(g => ({ name: g.name, rows: standings(g.teams, all.filter(f => f.group === g.name), ratingOfKey) }));
}
/** The single league table (Champions League). */
export function leagueTable(c) {
  const all = c.rounds.filter(r => r.stage === "league").flatMap(r => r.fixtures);
  return standings(c.teams, all, ratingOfKey);
}

/** World Cup: the eight best third-placed sides. */
export function bestThirds(tables) {
  const thirds = tables.map(t => ({ ...t.rows[2], group: t.name }));
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || ratingOfKey(y.id) - ratingOfKey(x.id));
  return thirds.slice(0, 8);
}

function buildWorldCupR32(c) {
  const tables = groupTables(c);
  const rank = (rows) => rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || ratingOfKey(y.id) - ratingOfKey(x.id));
  const tag = (row, g) => ({ ...row, group: g });
  const winners = rank(tables.map(t => tag(t.rows[0], t.name)));
  const runners = rank(tables.map(t => tag(t.rows[1], t.name)));
  const thirds = bestThirds(tables);
  const seeds = [...winners, ...runners, ...thirds];
  // Seed i meets seed 33-i; swap opponents to keep group-mates apart.
  const pairs = [];
  for (let i = 0; i < 16; i++) pairs.push([seeds[i], seeds[31 - i]]);
  for (let i = 0; i < 16; i++) {
    if (pairs[i][0].group !== pairs[i][1].group) continue;
    for (let j = 0; j < 16; j++) {
      if (j === i) continue;
      if (pairs[i][0].group !== pairs[j][1].group && pairs[j][0].group !== pairs[i][1].group) {
        [pairs[i][1], pairs[j][1]] = [pairs[j][1], pairs[i][1]]; break;
      }
    }
  }
  const order = bracketOrder(16);
  return order.map(s => fixture(pairs[s - 1][0].id, pairs[s - 1][1].id, { ko: true }));
}

function buildChampionsPlayoff(c) {
  const t = leagueTable(c).map(r => r.id);
  c.seeded = t.slice(0, 8);
  // 9 v 24, 10 v 23 … 16 v 17
  return Array.from({ length: 8 }, (_, j) => fixture(t[8 + j], t[23 - j], { ko: true }));
}
function buildChampionsR16(c, po) {
  // Seed k meets the winner of the play-off headed by seed 17-k; the bracket
  // keeps seeds 1 and 2 apart until the final.
  const order = bracketOrder(8);
  return order.map(k => fixture(c.seeded[k - 1], winnerOf(po[8 - k]), { ko: true }));
}

const KO_SEQUENCE = { wc: ["r32", "r16", "qf", "sf", "final"], cl: ["po", "r16", "qf", "sf", "final"] };

/** Writes a result onto its fixture. */
export function recordResult(c, f, res) {
  Object.assign(f, { ga: res.ga, gb: res.gb, pa: res.pa ?? null, pb: res.pb ?? null, played: true, events: res.events || [] });
}

/** Simulates every unplayed fixture in the current round. */
export function simulateRest(c) {
  const r = currentRound(c);
  if (!r) return;
  for (const f of r.fixtures) {
    if (f.played) continue;
    recordResult(c, f, simulateMatch(ratingOfKey(f.a), ratingOfKey(f.b), !!f.ko));
  }
}

/**
 * Moves on to the next round once the current one is complete. Sets
 * `out` (the stage the player went out in) or `champion` as they happen.
 */
export function advance(c) {
  const r = currentRound(c);
  if (!r || r.fixtures.some(f => !f.played)) return;
  const uf = userFixture(c);

  if (r.friendly) { c.index++; c.done = true; return; }

  // Knockout: did the player survive?
  if (r.stage !== "group" && r.stage !== "league" && uf && !c.out) {
    if (winnerOf(uf) !== c.user) c.out = r.stage;
  }

  // Group and league rounds are scheduled up front; knockout rounds are
  // drawn from the results once the previous round is complete.
  let next = null;
  if (c.index + 1 >= c.rounds.length) {
    next = nextRoundFor(c, r);
    if (next) c.rounds.push(next);
    else { c.champion = winnerOf(r.fixtures[0]); c.done = true; }
  }
  c.index++;

  // Group / league exits are only known once the knockout draw is made. A
  // seeded Champions League club sits out the play-off round.
  if (next && (r.stage === "group" || r.stage === "league") && !c.out) {
    const inIt = next.fixtures.some(f => f.a === c.user || f.b === c.user);
    const seededThrough = c.kind === "cl" && c.seeded?.includes(c.user);
    if (!inIt && !seededThrough) c.out = r.stage;
  }
}

function nextRoundFor(c, r) {
  if (r.stage === "group") return { stage: "r32", label: STAGE_NAMES.r32, fixtures: buildWorldCupR32(c) };
  if (r.stage === "league") {
    return { stage: "po", label: STAGE_NAMES.po, fixtures: buildChampionsPlayoff(c) };
  }
  const seq = KO_SEQUENCE[c.kind];
  const at = seq.indexOf(r.stage);
  const stage = seq[at + 1];
  if (!stage) return null;
  const fixtures = (c.kind === "cl" && r.stage === "po") ? buildChampionsR16(c, r.fixtures) : nextKnockout(r.fixtures);
  return { stage, label: STAGE_NAMES[stage], fixtures };
}

/** Every knockout round so far, for the bracket view. */
export function knockoutRounds(c) {
  return c.rounds.filter(r => r.stage !== "group" && r.stage !== "league" && !r.friendly);
}

/** All of the player's fixtures, played ones first. */
export function userFixtures(c) {
  return c.rounds.flatMap(r => r.fixtures.filter(f => f.a === c.user || f.b === c.user).map(f => ({ f, round: r })));
}

export function stageReached(c) {
  if (c.champion === c.user) return "champion";
  if (c.out) return c.out;
  return currentRound(c)?.stage || "final";
}
