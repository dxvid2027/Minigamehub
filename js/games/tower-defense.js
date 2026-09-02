// ==========================================================================
// Bastion TD — grid tower defense with a serpentine road, seven tower
// classes and ten upgrade levels.
//
// Fourteen enemy families keep the waves from turning into one long healthbar:
// marchers, sprinters, armoured brutes, flying drones that ignore the road,
// menders that heal their neighbours, bulwarks behind a regenerating shield,
// swarms that split when they fall, burrowers that dive underground where
// nothing can target them, hexers that shut a tower down for a few seconds
// and juggernauts that are both fast and heavily plated — plus two bosses:
// a Titan every fifth wave and a Leviathan every tenth that is immune to
// slowing effects.
//
// A run banks Bastion Cores, and Cores buy permanent upgrades from the start
// screen, so a defence that fell on wave 9 starts the next attempt stronger.
//
// Everything is drawn from scratch on the canvas: tiles are bevelled stone,
// the road is a worn track with chevrons, towers are plinth + turret + a
// barrel that tracks its target, and every enemy family has its own
// silhouette and animation so a wave is readable at a glance.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { MetaProgress, runReward } from "../systems/metaProgress.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { clamp, randFloat, el } from "../core/utils.js";

// The grid grew with the road: the track is two tiles wide now, so a 12x7
// board would have been almost entirely road.
const COLS = 16, ROWS = 10;
const MAX_LEVEL = 10;
const WAVES_PER_LEVEL = 20;

// ------------------------------------------------------------- towers -----
// `air` says what a tower may shoot at: "both" by default, "air" for a
// dedicated anti-air mount, "ground" for anything that lobs a shell.
const TOWERS = {
  cannon: {
    name: "Cannon", cost: 45, color: "#ffd76a", accent: "#ff9f43",
    dmg: 9, range: 2.85, rate: 0.55,
    desc: "Reliable single-target fire.",
  },
  frost: {
    name: "Frost", cost: 60, color: "#7ce8ff", accent: "#3aa8ff",
    dmg: 4, range: 2.65, rate: 0.85, slow: 0.5, slowTime: 1.5, splash: 0.85,
    desc: "Chills a small area and slows what it hits.",
  },
  arc: {
    name: "Arc", cost: 80, color: "#c86bff", accent: "#7c5cff",
    dmg: 7, range: 3.1, rate: 0.8, chains: 2,
    desc: "Lightning that jumps between enemies.",
  },
  flak: {
    // The answer to a sky full of drones. It was air-only, which made it a
    // tower that literally could not fire on the opening map — that map sends
    // nothing that flies. A real flak battery can depress its barrels, so it
    // now hits the ground too, just badly: triple damage up, a third down.
    name: "Flak", cost: 70, color: "#8fe36b", accent: "#3f8f2c",
    dmg: 8, range: 3.45, rate: 0.7, airBonus: 3, groundPenalty: 0.35, splash: 0.7,
    desc: "Anti-air battery. Triple damage to flyers, a third of it to ground.",
  },
  mortar: {
    // Lobs a shell, so it cannot track a flyer, but it lands hard and wide.
    name: "Mortar", cost: 110, color: "#ff8f4a", accent: "#a83610",
    dmg: 26, range: 4.5, rate: 2.0, air: "ground", splash: 1.35, arcShot: true,
    desc: "Lobbed shell with a wide blast. Ground targets only.",
  },
  venom: {
    // Poison ignores armour, which is what makes brutes and juggernauts
    // solvable without stacking raw damage.
    name: "Venom", cost: 95, color: "#a8e02c", accent: "#4f7a10",
    dmg: 3, range: 2.9, rate: 1.0, poison: 7, poisonTime: 4,
    desc: "Poison that ignores armour and stacks over time.",
  },
  railgun: {
    name: "Railgun", cost: 165, color: "#ff4fd8", accent: "#7c1a68",
    dmg: 34, range: 6.1, rate: 1.9, pierce: true, locked: true,
    desc: "Pierces every enemy on the line. Unlocked with Cores.",
  },
};
const TOWER_KEYS = Object.keys(TOWERS);

/** Level 1 is the built tower; every step multiplies its numbers. */
function towerStat(t, key) {
  const base = TOWERS[t.type][key];
  const n = t.level - 1;
  if (key === "dmg") return base * Math.pow(1.34, n);
  if (key === "range") return base * (1 + n * 0.05);
  if (key === "rate") return base * Math.pow(0.94, n);
  return base;
}
function upgradeCost(t) { return Math.round(TOWERS[t.type].cost * 0.6 * Math.pow(1.33, t.level)); }
function towerChains(t) { return (TOWERS[t.type].chains || 0) + Math.floor((t.level - 1) / 3); }

// ------------------------------------------------------------ enemies -----
const ENEMIES = {
  marcher: {
    name: "Marcher", color: "#ff6b86", dark: "#8c1f33",
    hp: 20, speed: 52, armour: 0, gold: 6, score: 10, r: 0.25,
  },
  sprinter: {
    name: "Sprinter", color: "#ffd76a", dark: "#8a6410",
    hp: 13, speed: 104, armour: 0, gold: 7, score: 14, r: 0.20,
  },
  brute: {
    name: "Brute", color: "#8fa0c8", dark: "#2c3654",
    hp: 62, speed: 34, armour: 4, gold: 16, score: 30, r: 0.33,
  },
  drone: {
    // Ignores the road entirely and flies the diagonal to the base.
    name: "Drone", color: "#7ce8ff", dark: "#134a63",
    hp: 22, speed: 76, armour: 0, gold: 12, score: 25, r: 0.22, flying: true,
  },
  mender: {
    name: "Mender", color: "#2ee6a6", dark: "#0d5c44",
    hp: 34, speed: 46, armour: 1, gold: 18, score: 34, r: 0.26, heal: 9, healRange: 2.9,
  },
  bulwark: {
    name: "Bulwark", color: "#c86bff", dark: "#43206b",
    hp: 46, speed: 40, armour: 2, gold: 20, score: 38, r: 0.30, shield: 40, shieldRegen: 9,
  },
  // --- families added in the difficulty pass ---------------------------
  swarm: {
    // Cheap on its own, but every one that dies leaves two behind, so a
    // swarm wave punishes a defence with no area damage at all.
    name: "Swarmling", color: "#ff9f43", dark: "#7a4405",
    hp: 15, speed: 68, armour: 0, gold: 4, score: 8, r: 0.17, spawnlings: 2,
  },
  burrower: {
    // Dives under the road on a cycle. While it is down nothing can target
    // it, so a single high-damage tower can no longer hold a lane alone.
    name: "Burrower", color: "#b98a5a", dark: "#5c3a1c",
    hp: 52, speed: 44, armour: 1, gold: 19, score: 36, r: 0.28,
    burrowEvery: 3.4, burrowTime: 1.5,
  },
  hexer: {
    // Shuts a tower down for a few seconds. The counter is coverage: a
    // silenced tower matters far less when two others overlap it.
    name: "Hexer", color: "#d24bff", dark: "#4b1268",
    hp: 40, speed: 50, armour: 1, gold: 24, score: 44, r: 0.26,
    hexEvery: 5.5, hexTime: 3.2, hexRange: 4.0,
  },
  juggernaut: {
    name: "Juggernaut", color: "#ff5470", dark: "#5e0f22",
    hp: 130, speed: 62, armour: 7, gold: 30, score: 62, r: 0.34,
  },
  blinker: {
    // Jumps a chunk of road every few seconds, so a single choke point can be
    // skipped entirely and the defence has to be spread along the route.
    name: "Blinker", color: "#4be0ff", dark: "#0d4a63",
    hp: 44, speed: 48, armour: 1, gold: 22, score: 42, r: 0.24,
    blinkEvery: 4.2, blinkDist: 2.4,
  },
  warlord: {
    // Hands out damage reduction to everything around it. Kill it first or
    // watch the whole escort shrug off your towers.
    name: "Warlord", color: "#ffb347", dark: "#7a4a05",
    hp: 96, speed: 40, armour: 3, gold: 34, score: 70, r: 0.32,
    auraRange: 3.4, auraCut: 0.4,
  },
  titan: {
    name: "Titan", color: "#ff9f43", dark: "#7a3a05",
    hp: 340, speed: 30, armour: 6, gold: 90, score: 220, r: 0.44, boss: true, splits: 4,
  },
  leviathan: {
    // The second boss. Slowing it does nothing, so a frost wall is not a
    // complete answer and the run has to bring real damage.
    name: "Leviathan", color: "#ff2f6d", dark: "#5c0722",
    hp: 900, speed: 26, armour: 10, gold: 220, score: 520, r: 0.5,
    boss: true, splits: 5, splitInto: "juggernaut", slowImmune: true,
  },
};

/**
 * Which families a wave may draw from, and how many of each.
 *
 * A level only ever fields what its roster allows, and inside a level the mix
 * opens up as the twenty waves go by — so wave 1 of a late level is still a
 * readable fight rather than everything at once.
 * @param {number} wave 1..20 within the level
 * @param {Object} level the LEVELS entry being played
 */
function waveComposition(wave, level) {
  const pool = [];
  const has = (t) => level.roster.includes(t);
  const add = (type, n) => { if (has(type)) for (let i = 0; i < Math.max(0, n); i++) pool.push(type); };

  add("marcher", 4 + Math.floor(wave * 1.05));
  if (wave >= 2) add("sprinter", 2 + Math.floor(wave * 0.6));
  if (wave >= 3) add("swarm", 3 + Math.floor((wave - 2) * 0.8));
  if (wave >= 4) add("brute", 1 + Math.floor((wave - 3) * 0.5));
  if (wave >= 5) add("drone", 1 + Math.floor((wave - 4) * 0.45));
  if (wave >= 6) add("burrower", 1 + Math.floor((wave - 5) * 0.3));
  if (wave >= 7) add("mender", 1 + Math.floor((wave - 6) * 0.26));
  if (wave >= 8) add("bulwark", 1 + Math.floor((wave - 7) * 0.32));
  if (wave >= 9) add("blinker", 1 + Math.floor((wave - 8) * 0.28));
  if (wave >= 10) add("hexer", 1 + Math.floor((wave - 9) * 0.24));
  if (wave >= 11) add("juggernaut", 1 + Math.floor((wave - 10) * 0.3));
  if (wave >= 13) add("warlord", 1 + Math.floor((wave - 12) * 0.2));

  // Bosses on the fives, and the level's own boss closes it out on wave 20.
  if (wave === WAVES_PER_LEVEL) {
    for (let i = 0; i < 1 + Math.floor(wave / 14); i++) pool.push(level.boss);
  } else if (wave % 5 === 0) {
    pool.push("titan");
    if (wave >= 15) pool.push("titan");
  }
  return pool;
}

// ------------------------------------------------------- meta upgrades -----
const META = new MetaProgress("tower-defense", {
  currency: "Bastion Cores", icon: "\u{1F537}",
  nodes: [
    { id: "gold",   name: "War Treasury",   icon: "\u{1FA99}", max: 10, desc: "Start every defence with more gold.",
      cost: (lv) => 45 + lv * 60, value: (lv) => lv * 30, prefix: "+", suffix: "g" },
    { id: "lives",  name: "Bastion Walls",  icon: "\u{1F6E1}\uFE0F", max: 10, desc: "The base survives more breaches.",
      cost: (lv) => 60 + lv * 80, value: (lv) => lv * 2, prefix: "+", suffix: "" },
    { id: "dmg",    name: "Rifled Barrels", icon: "\u{1F3AF}", max: 12, desc: "Every tower hits harder.",
      cost: (lv) => 55 + lv * 70, value: (lv) => lv * 0.06, suffix: "%" },
    { id: "range",  name: "Spotter Posts",  icon: "\u{1F52D}", max: 8,  desc: "Every tower sees further.",
      cost: (lv) => 70 + lv * 88, value: (lv) => lv * 0.035, suffix: "%" },
    { id: "income", name: "Salvage Crews",  icon: "\u26CF\uFE0F", max: 10, desc: "Kills pay more gold.",
      cost: (lv) => 65 + lv * 84, value: (lv) => lv * 0.07, suffix: "%" },
    { id: "build",  name: "Field Engineers", icon: "\u{1F9F1}", max: 8, desc: "Towers cost less to raise.",
      cost: (lv) => 80 + lv * 96, value: (lv) => lv * 0.035, suffix: "%" },
    { id: "yield",  name: "Core Refinery",  icon: "\u{1F537}", max: 10, desc: "Runs bank more Bastion Cores.",
      cost: (lv) => 110 + lv * 130, value: (lv) => lv * 0.1, suffix: "%" },
    { id: "rail",   name: "Railgun Permit", icon: "\u26A1", max: 1, desc: "Unlocks the piercing, long-range Railgun.",
      cost: () => 650, value: (lv) => lv, unlock: true },
  ],
});

// ------------------------------------------------------------- levels -----
// Thirty maps, composed rather than hand-listed thirty times: ten routes and
// six biomes. Every level gets a different road from the one before it, and
// the look changes every five levels, so no two consecutive maps look or play
// the same while the whole campaign stays one readable table.
//
// A route is drawn as single tiles; buildRoad() widens it to two so that two
// enemies walk abreast, which is why route coordinates stop one short of the
// board edge on both axes.
const ROUTES = [
  // 0 — long lane, one hairpin
  [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
   [12,2],[12,3],[12,4],
   [11,4],[10,4],[9,4],[8,4],[7,4],[6,4],[5,4],[4,4],[3,4],[2,4],
   [2,5],[2,6],[2,7],
   [3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],[14,7]],
  // 1 — gorge, two switchbacks
  [[0,7],[1,7],[2,7],[3,7],[4,7],
   [4,6],[4,5],[4,4],[4,3],[4,2],[4,1],
   [5,1],[6,1],[7,1],[8,1],
   [8,2],[8,3],[8,4],[8,5],[8,6],[8,7],
   [9,7],[10,7],[11,7],
   [11,6],[11,5],[11,4],[11,3],[11,2],[11,1],
   [12,1],[13,1],[14,1]],
  // 2 — wide sweeps
  [[0,4],[1,4],[2,4],
   [2,3],[2,2],[2,1],
   [3,1],[4,1],[5,1],[6,1],
   [6,2],[6,3],[6,4],[6,5],[6,6],[6,7],
   [7,7],[8,7],[9,7],[10,7],
   [10,6],[10,5],[10,4],[10,3],[10,2],[10,1],
   [11,1],[12,1],[13,1],[14,1],
   [14,2],[14,3],[14,4]],
  // 3 — tight zigzag
  [[0,1],[1,1],[2,1],[3,1],
   [3,2],[3,3],[3,4],
   [4,4],[5,4],[6,4],
   [6,5],[6,6],[6,7],
   [7,7],[8,7],[9,7],
   [9,6],[9,5],[9,4],
   [10,4],[11,4],[12,4],
   [12,3],[12,2],[12,1],
   [13,1],[14,1]],
  // 4 — the long serpentine
  [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
   [6,2],[6,3],[6,4],
   [5,4],[4,4],[3,4],[2,4],
   [2,5],[2,6],[2,7],
   [3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],
   [9,6],[9,5],[9,4],
   [10,4],[11,4],[12,4],
   [12,3],[12,2],[12,1],
   [13,1],[14,1]],
  // 5 — down the middle and back
  [[0,4],[1,4],[2,4],[3,4],[4,4],[5,4],
   [5,3],[5,2],[5,1],
   [6,1],[7,1],[8,1],[9,1],[10,1],
   [10,2],[10,3],[10,4],[10,5],[10,6],[10,7],
   [9,7],[8,7],[7,7],[6,7],[5,7],[4,7],
   [4,6],[4,5],
   [3,5],[2,5],
   [2,6],[2,7],[2,8],
   [3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8]],
  // 6 — the comb
  [[0,8],[1,8],[2,8],
   [2,7],[2,6],[2,5],[2,4],[2,3],[2,2],[2,1],
   [3,1],[4,1],[5,1],
   [5,2],[5,3],[5,4],[5,5],[5,6],[5,7],[5,8],
   [6,8],[7,8],[8,8],
   [8,7],[8,6],[8,5],[8,4],[8,3],[8,2],[8,1],
   [9,1],[10,1],[11,1],
   [11,2],[11,3],[11,4],[11,5],[11,6],[11,7],[11,8],
   [12,8],[13,8],[14,8]],
  // 7 — the spiral
  [[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
   [12,2],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8],
   [11,8],[10,8],[9,8],[8,8],[7,8],[6,8],[5,8],[4,8],[3,8],[2,8],
   [2,7],[2,6],[2,5],[2,4],
   [3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],
   [9,5],[9,6],
   [10,6],[11,6],[12,6],[13,6],[14,6]],
  // 8 — the ladder
  [[0,1],[1,1],[2,1],[3,1],[4,1],
   [4,2],[4,3],
   [3,3],[2,3],
   [2,4],[2,5],
   [3,5],[4,5],[5,5],[6,5],[7,5],
   [7,6],[7,7],
   [8,7],[9,7],[10,7],
   [10,6],[10,5],[10,4],[10,3],[10,2],[10,1],
   [11,1],[12,1],[13,1],[14,1]],
  // 9 — the long haul
  [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[7,8],
   [7,7],[7,6],[7,5],
   [6,5],[5,5],[4,5],[3,5],[2,5],
   [2,4],[2,3],[2,2],[2,1],
   [3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],
   [12,2],[12,3],[12,4],[12,5],
   [13,5],[14,5]],
];

// Six biomes. The road always carries a clear value gap against the ground it
// cuts through, or it stops reading as a road at all.
const BIOMES = [
  {
    land: "Greenfield", tileA: "#1e3b2c", tileB: "#23452f", edge: "#2f5a3c",
    road: "#4b4033", roadEdge: "#6d5c44", decor: "tree", decorColor: "#2f6b3f",
    keep: "#6fbf87", banner: "#2ee6a6", scene: "aurora",
  },
  {
    land: "Ashen", tileA: "#291c16", tileB: "#30221a", edge: "#553529",
    road: "#6d5546", roadEdge: "#d09164", decor: "rock", decorColor: "#5a3c30",
    keep: "#ff9f43", banner: "#ffd76a", scene: "grid",
  },
  {
    land: "Frostmere", tileA: "#152337", tileB: "#1a2b42", edge: "#2c4a6b",
    road: "#5d7794", roadEdge: "#bfe2fb", decor: "crystal", decorColor: "#6fd3f2",
    keep: "#7ce8ff", banner: "#22d3ee", scene: "stars",
  },
  {
    land: "Sunken", tileA: "#161b33", tileB: "#1c223e", edge: "#38406b",
    road: "#4e5478", roadEdge: "#9b86ff", decor: "pipe", decorColor: "#4a3f6e",
    keep: "#c86bff", banner: "#7c5cff", scene: "grid",
  },
  {
    land: "Emberwaste", tileA: "#2e1414", tileB: "#361a18", edge: "#5c2622",
    road: "#7a4038", roadEdge: "#ff8f6a", decor: "rock", decorColor: "#7d2f22",
    keep: "#ff5470", banner: "#ff8f4a", scene: "aurora",
  },
  {
    land: "Void", tileA: "#1c1428", tileB: "#221831", edge: "#472f63",
    road: "#523a6b", roadEdge: "#ff7ce4", decor: "shard", decorColor: "#a8329e",
    keep: "#ff4fd8", banner: "#ff2f6d", scene: "stars",
  },
];

// What the map at each index is called, and how it reads on the picker.
const ROUTE_NAMES = [
  "Pass", "Ravine", "Shelf", "Works", "Terminus",
  "Crossing", "Comb", "Spiral", "Ladder", "Long Haul",
];
const ROUTE_BLURBS = [
  "A long lane and one hairpin, with room to build.",
  "Two switchbacks through a narrow gorge.",
  "Wide sweeping curves and very little cover.",
  "Short zigzags, tight corners, constant pressure.",
  "The road doubles back on itself three times.",
  "Straight through the middle, then all the way back.",
  "Three long teeth — everything walks all of them.",
  "A spiral that ends in the centre of the board.",
  "Stepped rungs with almost no straight run.",
  "The longest road on the campaign.",
];

/** The order enemy families join the campaign, one every couple of maps. */
const ROSTER_ORDER = [
  ["marcher", "sprinter", "swarm", "drone"],   // level 1 opens with these
  ["brute"], [], ["burrower"], [], ["mender"], [],
  ["bulwark"], [], ["blinker"], [], ["hexer"], [],
  ["juggernaut"], [], ["warlord"], [], [], [], [],
];

function rosterFor(idx) {
  const out = [];
  for (let i = 0; i <= idx && i < ROSTER_ORDER.length; i++) out.push(...ROSTER_ORDER[i]);
  // Past the table every family is already in play.
  if (idx >= ROSTER_ORDER.length) {
    for (const group of ROSTER_ORDER) out.push(...group);
  }
  return [...new Set(out)];
}

/** Thirty maps: route rotates every level, biome every five. */
const LEVELS = [...Array(30)].map((_, i) => {
  const biome = BIOMES[Math.floor(i / 5) % BIOMES.length];
  const routeIdx = i % ROUTES.length;
  return {
    name: `${biome.land} ${ROUTE_NAMES[routeIdx]}`,
    blurb: ROUTE_BLURBS[routeIdx],
    theme: biome,
    route: ROUTES[routeIdx],
    roster: rosterFor(i),
    // A Leviathan closes every fifth map from the tenth onward; the rest end
    // on a Titan.
    boss: i >= 9 && (i + 1) % 5 === 0 ? "leviathan" : "titan",
  };
});

function buildRoad(route) {
  const set = new Set();
  for (const [x, y] of route) {
    set.add(`${x},${y}`);
    set.add(`${x + 1},${y}`);
    set.add(`${x},${y + 1}`);
    set.add(`${x + 1},${y + 1}`);
  }
  return set;
}

export class TowerDefenseGame extends GameBase {
  // One setting. Thirty maps already carry the difficulty curve, and a
  // three-way chip row on top of a level picker only asked the player to
  // decide something the campaign decides for them.
  getDifficulties() { return ["Campaign"]; }
  getUpgrades() { return META; }

  /** Level picker on the start screen: cleared maps stay replayable. */
  getPlayLabel() { return "Play"; }

  /**
   * Play opens the map picker rather than starting a run.
   *
   * With thirty maps an inline chip row on the start screen was a wall of
   * buttons; a grid in its own window has room to show each map's number,
   * name and how far you got, and choosing one starts it immediately.
   */
  onPlayPressed() {
    audioManager.play("click");
    const c = this._campaign();
    const open = this._unlockedLevels();
    const cleared = c.cleared;

    const grid = el("div", { class: "map-grid" });
    LEVELS.forEach((lv, i) => {
      const unlocked = i < open;
      const best = c.best[String(i)] || 0;
      const done = best >= WAVES_PER_LEVEL;
      grid.appendChild(el("button", {
        class: `map-card${unlocked ? "" : " locked"}${done ? " done" : ""}${i === this.levelIdx ? " current" : ""}`,
        disabled: !unlocked,
        title: unlocked ? `${lv.name} — ${lv.blurb}` : "Clear the map before this one to open it.",
        onClick: () => {
          if (!unlocked) return;
          closeModal();
          this._loadLevel(i);
          this._saveCampaign({ level: i });
          this.start();
        },
      }, [
        el("span", { class: "n" }, String(i + 1)),
        el("span", { class: "nm" }, unlocked ? lv.name : "Locked"),
        el("span", { class: "st" },
          !unlocked ? "\u{1F512}" : done ? "\u2713 cleared" : best ? `best ${best}/${WAVES_PER_LEVEL}` : "new"),
      ]));
    });

    const body = el("div", { class: "map-picker" }, [
      el("p", { class: "map-intro" },
        `${cleared} of ${LEVELS.length} maps cleared \u00b7 ${WAVES_PER_LEVEL} waves each. Hold every wave on a map to open the next one.`),
      grid,
    ]);
    openModal({
      title: "Choose a map",
      bodyNode: body,
      footerNode: el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
    });
  }

  getInstructions() {
    return [
      "Pick a tower from the bar at the bottom, then tap an empty tile to build it. Tap a tower you own to upgrade it — every tower goes up to level 10.",
      "Seven classes: Cannon is reliable single-target, Frost slows an area, Arc chains lightning, Flak does triple damage to flyers and only a third to ground, Mortar lobs a wide shell at ground targets only, Venom poisons through armour, and the Railgun pierces everything on its line.",
      "Fourteen enemy families, and each map brings more of them. Swarmlings split when they die, burrowers dive underground where nothing can target them, blinkers skip a stretch of road, hexers shut one of your towers down for a few seconds, juggernauts are fast and heavily plated, and a warlord's aura cuts the damage everything near it takes.",
      "The road is two tiles wide, so a wave walks two abreast. A Titan comes every fifth wave and splits into brutes; from map 10 on, every fifth map ends on a Leviathan instead, which is immune to slowing — frost alone will not stop it.",
      "Thirty maps, twenty waves each. Hold all twenty and the next map opens. The road changes every map and the whole landscape every five, and new enemy families keep joining until every one of the fourteen is in play.",
      "A run banks Bastion Cores based on how deep you got. Spend them on permanent upgrades from the start screen. The 💾 button in the top bar stops a run and keeps everything it earned.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tower type in the bar, then tap a tile. Tap an existing tower to upgrade it."; }
  getKeyboardHint() { return "Click a tower type, then click a tile. Click a tower to upgrade it. Keys 1-7 switch type."; }

  getScene() { return this.level?.theme.scene || "grid"; }

  onInit() {
    this.createCanvas();
    this.levelIdx = clamp(this._campaign().level, 0, LEVELS.length - 1);
    this._loadLevel(this.levelIdx);
    this.selected = "cannon";
    this.input.onPointer("down", (p) => this._onClick(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this._gridFromPx(p.x, p.y); });
    TOWER_KEYS.forEach((k, i) => this.input.onKey(`Digit${i + 1}`, () => {
      if (this._unlocked(k)) { this.selected = k; audioManager.play("select"); }
    }));
  }

  _unlocked(key) { return !TOWERS[key].locked || META.level("rail") > 0; }

  // ---------------------------------------------------------- CAMPAIGN ----
  /** Persisted campaign progress: which level is current, and how far each got. */
  _campaign() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.campaign) custom.campaign = { level: 0, cleared: 0, best: {} };
    const c = custom.campaign;
    if (typeof c.level !== "number") c.level = 0;
    if (typeof c.cleared !== "number") c.cleared = 0;   // levels fully finished
    if (!c.best) c.best = {};                            // levelIdx -> best wave
    return c;
  }

  _saveCampaign(patch) {
    Object.assign(this._campaign(), patch);
    // saveNow, not save: the debounced write loses campaign progress if the
    // tab closes in the quarter second after a level is cleared.
    saveManager.saveNow();
  }

  /** A level is playable once the one before it has been cleared. */
  _unlockedLevels() { return Math.min(LEVELS.length, this._campaign().cleared + 1); }

  _loadLevel(idx) {
    this.levelIdx = clamp(idx, 0, LEVELS.length - 1);
    this.level = LEVELS[this.levelIdx];
    this.route = this.level.route;
    this.roadSet = buildRoad(this.route);
    // The old code called this pathSet; keep the name so the build check and
    // the bots that poke at it keep working.
    this.pathSet = this.roadSet;
    // Movement runs down the join between the four tiles a route point covers.
    this.path = this.route.map(([x, y]) => ({ x, y }));
    this._decor = this._makeDecor();
  }

  /** Scatter of level-flavoured props on the empty tiles, seeded per level. */
  _makeDecor() {
    const props = [];
    let seed = 1337 + this.levelIdx * 7919;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (this.roadSet.has(`${x},${y}`)) continue;
        if (rnd() > 0.14) continue;
        props.push({ x, y, ox: rnd() * 0.5 - 0.25, oy: rnd() * 0.5 - 0.25, s: 0.7 + rnd() * 0.6, r: rnd() * 6.3 });
      }
    }
    return props;
  }

  /** Build price after the Field Engineers discount. */
  _cost(key) { return Math.round(TOWERS[key].cost * this.costMul); }

  onResize() { this._layout(); }

  /** Grid on top, tower palette in a strip along the bottom. */
  _layout() {
    // Two rows of tower buttons need roughly double the strip.
    const twoRows = (this.viewW - 24) / TOWER_KEYS.length - 10 < 104;
    // The floor has to stay small: on a phone a 104px minimum ate half the
    // stage and squeezed the board down to 11px cells.
    this.barH = twoRows ? clamp(this.viewH * 0.26, 72, 152) : clamp(this.viewH * 0.15, 52, 88);
    const gridH = this.viewH - this.barH;
    this.cell = Math.floor(Math.min(this.viewW / COLS, gridH / ROWS));
    this.offX = Math.round((this.viewW - this.cell * COLS) / 2);
    this.offY = Math.round((gridH - this.cell * ROWS) / 2);
  }

  onStart(difficulty) {
    this._layout();
    // A single baseline. The thirty-map ramp does all the escalating, so this
    // is only the shape of map one: firm, but not a wall for a first attempt.
    const cfg = { hpMul: 1.06, speedMul: 1.02, gold: 165, lives: 14, reward: 0.98, core: 1.0 };
    this.cfg = cfg;

    this.dmgMul = 1 + META.value("dmg");
    this.rangeMul = 1 + META.value("range");
    // Bounties climb with the map. Without this, late maps paid map-one money
    // for enemies with twenty times the health and simply could not be built
    // against, however well the player had ground.
    this.goldMul = cfg.reward * (1 + META.value("income")) * (1 + this.levelIdx * 0.34);
    this.costMul = 1 - META.value("build");

    this.gold = cfg.gold + META.value("gold");
    this.baseHP = cfg.lives + META.value("lives");
    this.maxBaseHP = this.baseHP;
    this.wave = 0;
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.arcs = [];
    this.hexes = [];
    this.blinks = [];
    this.floaters = [];
    this.kills = 0;
    this.waveTimer = 4;
    this.betweenWaves = true;
    this.elapsed = 0;
    this.selected = this._unlocked(this.selected) ? this.selected : "cannon";
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Gold: Math.floor(this.gold),
      Lives: this.baseHP,
      Wave: this.betweenWaves
        ? `L${this.levelIdx + 1} \u00b7 ${Math.min(WAVES_PER_LEVEL, this.wave + 1)}/${WAVES_PER_LEVEL} in ${Math.max(0, Math.ceil(this.waveTimer))}s`
        : `L${this.levelIdx + 1} \u00b7 ${this.wave}/${WAVES_PER_LEVEL}`,
      Score: this.score,
    });
  }

  // ------------------------------------------------------------- INPUT ----
  _gridFromPx(px, py) {
    return { x: Math.floor((px - this.offX) / this.cell), y: Math.floor((py - this.offY) / this.cell) };
  }

  _toPx(gx, gy) {
    return { x: this.offX + gx * this.cell + this.cell / 2, y: this.offY + gy * this.cell + this.cell / 2 };
  }

  /**
   * Centre of the two-wide road at route point i — the grid corner shared by
   * the four tiles that point contributes, which is why it is offset a whole
   * cell rather than half of one.
   */
  _routePx(i) {
    const p = this.path[clamp(i, 0, this.path.length - 1)];
    return { x: this.offX + (p.x + 1) * this.cell, y: this.offY + (p.y + 1) * this.cell };
  }

  _onClick(px, py) {
    if (this.state !== "playing") return;

    // Palette strip first.
    if (py > this.viewH - this.barH) {
      const idx = this._paletteHit(px, py);
      if (idx < 0) return;
      const key = TOWER_KEYS[idx];
      if (!this._unlocked(key)) {
        audioManager.play("error");
        this._float({ x: this.viewW / 2, y: this.viewH - this.barH - 14 }, "Locked \u2014 buy the Railgun Permit", "#ff8fa4");
        return;
      }
      this.selected = key;
      audioManager.play("select");
      return;
    }

    const { x, y } = this._gridFromPx(px, py);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;

    const existing = this.towers.find(t => t.x === x && t.y === y);
    if (existing) return this._upgrade(existing);
    if (this.pathSet.has(`${x},${y}`)) return audioManager.play("error");

    const cost = this._cost(this.selected);
    if (this.gold < cost) { audioManager.play("error"); this._float(this._toPx(x, y), `${cost}g needed`, "#ff8fa4"); return; }
    this.gold -= cost;
    this.towers.push({ x, y, type: this.selected, level: 1, cooldown: 0, angle: -Math.PI / 2, flash: 0, built: 0, hex: 0 });
    audioManager.play("toggle");
    this._updateHud();
  }

  _upgrade(t) {
    if (t.level >= MAX_LEVEL) { audioManager.play("error"); this._float(this._toPx(t.x, t.y), "MAX", "#ffd76a"); return; }
    const cost = Math.round(upgradeCost(t) * this.costMul);
    if (this.gold < cost) { audioManager.play("error"); this._float(this._toPx(t.x, t.y), `${cost}g needed`, "#ff8fa4"); return; }
    this.gold -= cost;
    t.level++;
    t.built = 0.35;
    audioManager.play("coin");
    this._float(this._toPx(t.x, t.y), `Lv ${t.level}`, TOWERS[t.type].color);
    this._updateHud();
  }

  _paletteHit(px, py) {
    for (let i = 0; i < TOWER_KEYS.length; i++) {
      const s = this._paletteSlot(i);
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return i;
    }
    return -1;
  }

  /**
   * Layout for seven tower buttons that does not look crushed.
   *
   * A single strip of seven only works on a genuinely wide stage. Below that
   * the bar wraps to two rows of four and three, and the slots are laid out
   * from a comfortable target width rather than by dividing whatever space is
   * left — so they stay the same readable size and the row is centred with
   * real margins instead of seven slivers edge to edge.
   */
  _paletteMetrics() {
    const n = TOWER_KEYS.length;
    const gap = 10;
    const avail = this.viewW - 24;
    const IDEAL = 132, MIN = 104;             // comfortable / smallest useful
    const rows = avail / n - gap >= MIN ? 1 : 2;
    const perRow = Math.ceil(n / rows);
    const rowGap = 8;
    const h = (this.barH - 12 - (rows - 1) * rowGap) / rows;
    const w = clamp(avail / perRow - gap, 62, IDEAL);
    return { w, gap, y0: this.viewH - this.barH + 6, h, rows, perRow, rowGap };
  }

  /** Top-left corner of palette slot i. */
  _paletteSlot(i) {
    const { w, gap, y0, h, perRow, rowGap } = this._paletteMetrics();
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, TOWER_KEYS.length - row * perRow);
    const total = inRow * w + (inRow - 1) * gap;
    return { x: (this.viewW - total) / 2 + col * (w + gap), y: y0 + row * (h + rowGap), w, h };
  }

  _float(pos, text, color) {
    // Clamped so a message near the edge is never half off the stage.
    this.floaters.push({ x: clamp(pos.x, 60, this.viewW - 60), y: pos.y, text, color, t: 0, life: 0.9 });
  }

  // ------------------------------------------------------------- WAVES ----
  _spawnWave() {
    this.wave += 1;
    const pool = waveComposition(this.wave, this.level);
    // Steeper than before: the meta upgrades are what keep this beatable, so
    // a run without them should stall well before wave 15.
    // Thirty maps need a gentler per-map step than five did, but it has to
    // keep climbing at the top end — so a linear term for the early maps and
    // a quadratic one that only really bites past the halfway mark. Map 1 is
    // 1.0x, map 10 about 5.4x, map 20 about 12x, map 30 about 22x, all before
    // the twenty-wave ramp inside the map itself.
    const li = this.levelIdx;
    const levelMul = 1 + li * 0.42 + Math.pow(li / 10, 2) * 0.95;
    const hpMul = this.cfg.hpMul * levelMul * (1 + this.wave * 0.30);
    const speedMul = this.cfg.speedMul * (1 + Math.min(0.30, li * 0.012)) * (1 + Math.min(0.55, this.wave * 0.015));
    let delay = 0;
    for (const type of pool) {
      const spec = ENEMIES[type];
      delay += spec.boss ? 1.1 : randFloat(0.28, 0.52);
      this._spawn(type, hpMul, speedMul, delay);
    }
    audioManager.play("levelup");
  }

  /**
   * @param {Object|null} at   spawn in place of a corpse rather than at the gate
   * @param {boolean} sterile  a child that must not itself split, which is the
   *   only thing stopping a swarmling wave from doubling forever
   */
  _spawn(type, hpMul, speedMul, delay, at = null, sterile = false) {
    const spec = ENEMIES[type];
    const hp = spec.hp * hpMul;
    const e = {
      type, spec, hp, maxHp: hp,
      speed: spec.speed * speedMul,
      armour: spec.armour,
      shield: spec.shield ? spec.shield * hpMul : 0,
      maxShield: spec.shield ? spec.shield * hpMul : 0,
      shieldCd: 0,
      pathIdx: 0, t: 0,
      spawnDelay: delay,
      slow: 0, slowT: 0,
      hitFlash: 0,
      wobble: randFloat(0, 6.3),
      healCd: randFloat(0.5, 2),
      // Ability clocks, offset per unit so a pack does not act in lockstep.
      burrowCd: randFloat(1.2, spec.burrowEvery || 3),
      burrowed: 0,
      hexCd: randFloat(1.5, spec.hexEvery || 5),
      poison: 0, poisonT: 0,
      // -1 .. 1 across the width of the road. Units alternate between the two
      // lanes rather than picking at random, which is what actually produces
      // pairs walking abreast instead of a loose smear down the middle.
      // Bosses take the centre because they are wider than one lane.
      lane: 0,
      laneTarget: spec.boss ? 0 : (this._laneFlip = !this._laneFlip) ? randFloat(0.5, 0.9) : randFloat(-0.9, -0.5),
      blinkCd: randFloat(1.5, spec.blinkEvery || 4),
      sterile,
      x: -200, y: -200,
    };
    if (at) { e.pathIdx = at.pathIdx; e.t = at.t; e.x = at.x; e.y = at.y; }
    if (spec.flying) {
      // Drones cut the corner: they fly from the road's start to the base.
      const a = this._routePx(0);
      const b = this._routePx(this.path.length - 1);
      e.from = a; e.to = b; e.fly = 0;
      e.x = a.x; e.y = a.y;
    }
    this.enemies.push(e);
  }

  // ------------------------------------------------------------ UPDATE ----
  onUpdate(dt) {
    this.elapsed += dt;

    if (this.betweenWaves) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this._spawnWave(); this.betweenWaves = false; }
    }

    this._moveEnemies(dt);
    this._enemyAbilities(dt);
    this._fireTowers(dt);
    this._moveBullets(dt);

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].t += dt;
      if (this.arcs[i].t > 0.16) this.arcs.splice(i, 1);
    }
    for (let i = this.hexes.length - 1; i >= 0; i--) {
      this.hexes[i].t += dt;
      if (this.hexes[i].t > 0.45) this.hexes.splice(i, 1);
    }
    for (let i = this.blinks.length - 1; i >= 0; i--) {
      this.blinks[i].t += dt;
      if (this.blinks[i].t > 0.3) this.blinks.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].t += dt;
      if (this.floaters[i].t >= this.floaters[i].life) this.floaters.splice(i, 1);
    }
    for (const t of this.towers) {
      if (t.flash > 0) t.flash -= dt;
      if (t.built > 0) t.built -= dt;
      if (t.hex > 0) t.hex -= dt;
    }
    this.particles.update(dt);

    if (this.baseHP <= 0) return this._gameOver();
    if (!this.betweenWaves && this.enemies.length === 0) {
      // Twenty waves is the level. Surviving them is a win, not a stalemate.
      if (this.wave >= WAVES_PER_LEVEL) return this._levelCleared();
      this.betweenWaves = true;
      // Waves come faster the deeper you get, but never without a breather.
      this.waveTimer = Math.max(1.8, 5.5 - this.wave * 0.17);
      const bonus = Math.round((20 + this.wave * 5) * this.goldMul);
      this.gold += bonus;
      this._float({ x: this.viewW / 2, y: this.offY + 24 }, `Wave ${this.wave} cleared  +${bonus}g`, "#ffd76a");
    }
    this._updateHud();
  }

  _moveEnemies(dt) {
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; continue; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      e.wobble += dt * 8;

      const speed = e.speed * (1 - e.slow);
      if (e.spec.flying) {
        const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
        const len = Math.hypot(dx, dy) || 1;
        e.fly += (speed * dt) / len;
        e.x = e.from.x + dx * e.fly;
        e.y = e.from.y + dy * e.fly;
        if (e.fly >= 1) e.reached = true;
        continue;
      }

      const nextIdx = Math.min(e.pathIdx + 1, this.path.length - 1);
      const a = this._routePx(e.pathIdx), b = this._routePx(nextIdx);
      e.t += (speed * dt) / this.cell;
      if (e.t >= 1) { e.t -= 1; e.pathIdx = nextIdx; }
      const cx = a.x + (b.x - a.x) * e.t;
      const cy = a.y + (b.y - a.y) * e.t;
      e.facing = Math.atan2(b.y - a.y, b.x - a.x);
      // The road is two tiles wide, so each unit holds its own line across it
      // and two of them walk abreast instead of nose to tail. The offset is
      // eased toward its target so a corner does not snap them sideways.
      const nx = -Math.sin(e.facing), ny = Math.cos(e.facing);
      e.lane += (e.laneTarget - e.lane) * Math.min(1, dt * 5);
      const off = e.lane * this.cell * 0.42;
      e.x = cx + nx * off;
      e.y = cy + ny * off;
      if (e.pathIdx >= this.path.length - 1 && e.t > 0.85) e.reached = true;
    }

    for (const e of this.enemies) {
      if (!e.reached) continue;
      this.baseHP -= e.spec.boss ? 3 : 1;
      this.shake();
      audioManager.play("error");
    }
    this.enemies = this.enemies.filter(e => !e.reached && e.hp > 0);
  }

  _enemyAbilities(dt) {
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) continue;
      // Bulwark shields come back if they are left alone.
      if (e.maxShield) {
        e.shieldCd = Math.max(0, e.shieldCd - dt);
        if (e.shieldCd === 0 && e.shield < e.maxShield) {
          e.shield = Math.min(e.maxShield, e.shield + e.spec.shieldRegen * dt);
        }
      }
      // Poison keeps working after the shot, and goes straight through
      // armour — which is the whole point of the Venom tower.
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.hp -= e.poison * dt;
        if (e.hp <= 0) { this._kill(e); continue; }
        if (e.poisonT <= 0) e.poison = 0;
      }

      // Burrowers dive on a cycle. While down they cannot be targeted at all,
      // so a lane held by one big tower now leaks.
      if (e.spec.burrowEvery) {
        if (e.burrowed > 0) {
          e.burrowed -= dt;
          if (e.burrowed <= 0) {
            e.burrowCd = e.spec.burrowEvery;
            this.particles.burst(e.x, e.y, { count: 6, colors: [e.spec.dark, "#b98a5a"], speed: 80, life: 0.4, size: 2.5 });
          }
        } else {
          e.burrowCd -= dt;
          if (e.burrowCd <= 0) {
            e.burrowed = e.spec.burrowTime;
            this.particles.burst(e.x, e.y, { count: 8, colors: [e.spec.dark], speed: 90, life: 0.45, size: 3 });
          }
        }
      }

      // Blinkers skip a stretch of road, which is why one choke point is not
      // a defence on its own.
      if (e.spec.blinkEvery) {
        e.blinkCd -= dt;
        if (e.blinkCd <= 0) {
          e.blinkCd = e.spec.blinkEvery;
          const before = { x: e.x, y: e.y };
          e.pathIdx = Math.min(this.path.length - 1, e.pathIdx + Math.floor(e.spec.blinkDist));
          e.t = Math.min(0.99, e.t + (e.spec.blinkDist % 1));
          const p = this._routePx(e.pathIdx);
          e.x = p.x; e.y = p.y;
          this.blinks.push({ x1: before.x, y1: before.y, x2: e.x, y2: e.y, t: 0 });
          this.particles.burst(before.x, before.y, { count: 8, colors: [e.spec.color, "#ffffff"], speed: 130, life: 0.35, size: 2.5 });
        }
      }

      // Hexers silence a tower for a few seconds. They pick the highest-level
      // tower in range, so the answer is coverage rather than one big gun.
      if (e.spec.hexEvery) {
        e.hexCd -= dt;
        if (e.hexCd <= 0) {
          e.hexCd = e.spec.hexEvery;
          const r = e.spec.hexRange * this.cell;
          let best = null;
          for (const t of this.towers) {
            if (t.hex > 0) continue;
            const p = this._toPx(t.x, t.y);
            if (Math.hypot(p.x - e.x, p.y - e.y) > r) continue;
            if (!best || t.level > best.level) best = t;
          }
          if (best) {
            best.hex = e.spec.hexTime;
            const p = this._toPx(best.x, best.y);
            this.hexes.push({ x1: e.x, y1: e.y, x2: p.x, y2: p.y, t: 0 });
            this._float(p, "HEXED", "#d24bff");
            audioManager.play("error");
          }
        }
      }

      if (!e.spec.heal) continue;
      e.healCd -= dt;
      if (e.healCd > 0) continue;
      e.healCd = 2;
      const r = e.spec.healRange * this.cell;
      let healed = 0;
      for (const o of this.enemies) {
        if (o === e || o.spawnDelay > 0 || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > r) continue;
        o.hp = Math.min(o.maxHp, o.hp + e.spec.heal);
        healed++;
      }
      if (healed) {
        e.pulse = 0.4;
        this._float({ x: e.x, y: e.y - this.cell * 0.4 }, `+${e.spec.heal}`, "#2ee6a6");
      }
    }
    for (const e of this.enemies) if (e.pulse > 0) e.pulse -= dt;

    // Warlord aura, resolved once per frame: everything near a living warlord
    // takes reduced damage until the warlord itself is dealt with.
    for (const e of this.enemies) e.guarded = 0;
    for (const w of this.enemies) {
      if (!w.spec.auraRange || w.spawnDelay > 0 || w.dead) continue;
      const r = w.spec.auraRange * this.cell;
      for (const e of this.enemies) {
        if (e.spawnDelay > 0) continue;
        if (Math.hypot(e.x - w.x, e.y - w.y) > r) continue;
        e.guarded = Math.max(e.guarded, w.spec.auraCut);
      }
    }
  }

  /** Can this tower shoot this enemy at all? */
  _canTarget(t, e) {
    if (e.spawnDelay > 0 || e.dead) return false;
    // A burrowed enemy is underground — nothing sees it.
    if (e.burrowed > 0) return false;
    const air = TOWERS[t.type].air || "both";
    if (air === "air" && !e.spec.flying) return false;
    if (air === "ground" && e.spec.flying) return false;
    return true;
  }

  _fireTowers(dt) {
    for (const t of this.towers) {
      // A hexed tower is inert: it neither tracks nor fires.
      if (t.hex > 0) continue;
      t.cooldown -= dt;
      const pos = this._toPx(t.x, t.y);
      const range = towerStat(t, "range") * this.rangeMul * this.cell;
      const spec = TOWERS[t.type];

      // Menders first, then whatever is furthest along the road.
      let target = null, bestKey = -Infinity;
      for (const e of this.enemies) {
        if (!this._canTarget(t, e)) continue;
        if (Math.hypot(e.x - pos.x, e.y - pos.y) > range) continue;
        // Menders first; then, for a tower with an air bonus, anything
        // flying, so a Flak never wastes shots on the road while a drone
        // slips past overhead; then whoever is closest to the base.
        //
        // That last term is normalised to 0..1 for both kinds. It used to be
        // `fly * 1000` against `pathIdx + t`, and since a route is only ~40
        // points long that made *every* tower drop a marcher at the gates to
        // shoot a drone that had barely set off.
        const progress = e.spec.flying ? e.fly : (e.pathIdx + e.t) / this.path.length;
        const key = (e.spec.heal ? 1e6 : 0)
          + (spec.airBonus && e.spec.flying ? 5e5 : 0)
          + progress;
        if (key > bestKey) { bestKey = key; target = e; }
      }
      if (target) t.angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      if (!target || t.cooldown > 0) continue;

      t.cooldown = towerStat(t, "rate");
      t.flash = 0.09;
      const dmg = towerStat(t, "dmg") * this.dmgMul;

      if (t.type === "arc") {
        this._arcStrike(t, pos, target, dmg);
        audioManager.play("hover");
      } else if (spec.pierce) {
        this._railShot(t, pos, target, dmg, range);
        audioManager.play("shoot");
      } else {
        this.bullets.push({
          x: pos.x, y: pos.y, target, dmg, type: t.type,
          color: spec.color, tower: t, trail: [],
          // A lobbed shell travels on an arc and cannot be dodged mid-flight,
          // so it stores where it is going rather than chasing.
          lob: spec.arcShot ? { sx: pos.x, sy: pos.y, tx: target.x, ty: target.y, p: 0 } : null,
        });
        audioManager.play("pop");
      }
    }
  }

  /** Railgun: one line, everything on it takes the hit. */
  _railShot(t, pos, target, dmg, range) {
    const dx = Math.cos(t.angle), dy = Math.sin(t.angle);
    const end = { x: pos.x + dx * range, y: pos.y + dy * range };
    this.arcs.push({ x1: pos.x, y1: pos.y, x2: end.x, y2: end.y, t: 0, color: TOWERS.railgun.color, wide: true });
    const halfWidth = this.cell * 0.34;
    for (const e of [...this.enemies]) {
      if (!this._canTarget(t, e)) continue;
      const ex = e.x - pos.x, ey = e.y - pos.y;
      const along = ex * dx + ey * dy;
      if (along < 0 || along > range) continue;
      if (Math.abs(ex * dy - ey * dx) > halfWidth + e.spec.r * this.cell) continue;
      this._damage(e, dmg);
    }
    this.shake();
  }

  /** Lightning that hops to nearby enemies, losing bite at each jump. */
  _arcStrike(t, pos, first, dmg) {
    const hops = towerChains(t);
    let from = pos, current = first, power = dmg;
    const seen = new Set();
    for (let i = 0; i <= hops; i++) {
      if (!current) break;
      seen.add(current);
      this.arcs.push({ x1: from.x, y1: from.y, x2: current.x, y2: current.y, t: 0, color: TOWERS.arc.color });
      this._damage(current, power);
      from = { x: current.x, y: current.y };
      power *= 0.62;
      let nearest = null, nd = this.cell * 2.2;
      for (const e of this.enemies) {
        if (seen.has(e) || e.spawnDelay > 0) continue;
        const d = Math.hypot(e.x - from.x, e.y - from.y);
        if (d < nd) { nd = d; nearest = e; }
      }
      current = nearest;
    }
  }

  _moveBullets(dt) {
    for (const b of this.bullets) {
      const spec = TOWERS[b.type];

      // A lobbed shell flies to where it was aimed and detonates there,
      // whether or not the target moved — that is the trade for the blast.
      if (b.lob) {
        b.lob.p = Math.min(1, b.lob.p + dt * 1.9);
        const p = b.lob.p;
        b.x = b.lob.sx + (b.lob.tx - b.lob.sx) * p;
        b.y = b.lob.sy + (b.lob.ty - b.lob.sy) * p;
        b.arcY = Math.sin(p * Math.PI) * this.cell * 1.1;   // drawn height only
        b.trail.push({ x: b.x, y: b.y - b.arcY });
        if (b.trail.length > 8) b.trail.shift();
        if (p >= 1) { b.dead = true; this._blast(b, spec, b.dmg); }
        continue;
      }

      if (!b.target || b.target.dead || b.target.hp <= 0 || b.target.reached) { b.dead = true; continue; }
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 6) b.trail.shift();
      if (d < this.cell * 0.22) {
        b.dead = true;
        if (spec.splash) {
          this._blast(b, spec, b.dmg);
        } else if (spec.poison) {
          // Poison refreshes rather than stacking without limit, so the
          // Venom tower is a debuff you maintain, not one you spam.
          this._damage(b.target, b.dmg);
          const t = b.tower;
          b.target.poison = Math.max(b.target.poison || 0, spec.poison * Math.pow(1.34, t.level - 1) * this.dmgMul);
          b.target.poisonT = spec.poisonTime;
          this.particles.burst(b.x, b.y, { count: 5, colors: [spec.color], speed: 60, life: 0.45, size: 2 });
        } else {
          this._damage(b.target, b.dmg);
          this.particles.burst(b.x, b.y, { count: 5, colors: [b.color], speed: 70, life: 0.3, size: 2, gravity: 120 });
        }
      } else {
        const speed = b.type === "frost" ? 520 : 720;
        b.x += (dx / d) * speed * dt;
        b.y += (dy / d) * speed * dt;
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  /** Area detonation shared by Frost, Flak and the Mortar. */
  _blast(b, spec, dmg) {
    const r = spec.splash * this.cell;
    const tower = b.tower;
    for (const e of [...this.enemies]) {
      if (!this._canTarget(tower, e)) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) > r + e.spec.r * this.cell) continue;
      // Flak is built for the sky and says so in its numbers, in both
      // directions: a bonus against flyers, a penalty against the ground.
      const mult = e.spec.flying ? (spec.airBonus || 1) : (spec.groundPenalty ?? 1);
      this._damage(e, dmg * mult);
      if (spec.slow && !e.spec.slowImmune) {
        e.slow = Math.max(e.slow, spec.slow);
        e.slowT = spec.slowTime;
      }
    }
    const colors = spec.slow ? ["#7ce8ff", "#ffffff"] : [spec.color, "#ffffff"];
    this.particles.burst(b.x, b.y, {
      count: spec.arcShot ? 20 : 8, colors,
      speed: spec.arcShot ? 220 : 90, life: spec.arcShot ? 0.55 : 0.4,
      size: spec.arcShot ? 3.5 : 2.5, gravity: 60,
    });
    if (spec.arcShot) this.shake();
  }

  /**
   * Shields soak first, then armour subtracts a flat amount per hit —
   * unless the hit is poison, which is the one thing armour does not stop.
   */
  _damage(e, amount, { pierceArmour = false } = {}) {
    if (e.dead) return;
    e.hitFlash = 0.12;
    if (e.guarded) amount *= 1 - e.guarded;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
      e.shieldCd = 3;
      if (amount <= 0) return;
    }
    e.hp -= pierceArmour ? amount : Math.max(1, amount - e.armour);
    if (e.hp > 0) return;
    this._kill(e);
  }

  /** Death, rewards and whatever the corpse leaves behind. */
  _kill(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    this.kills++;
    const reward = Math.round(e.spec.gold * this.goldMul);
    this.gold += reward;
    this.addScore(e.spec.score);
    this._float({ x: e.x, y: e.y - this.cell * 0.35 }, `+${reward}g`, "#ffd76a");
    this.particles.burst(e.x, e.y, { count: e.spec.boss ? 30 : 12, colors: [e.spec.color, e.spec.dark], speed: e.spec.boss ? 260 : 150, life: 0.6, size: 3 });
    audioManager.play(e.spec.boss ? "explosion" : "hit");

    // A boss bursts into a squad right where it stood; a swarmling leaves two
    // smaller ones, which is what makes a swarm wave need area damage.
    const litter = e.sterile ? 0 : (e.spec.splits || e.spec.spawnlings);
    if (litter) {
      const child = e.spec.splitInto || (e.spec.spawnlings ? "swarm" : "brute");
      const hpMul = this.cfg.hpMul * (1 + this.wave * (e.spec.spawnlings ? 0.1 : 0.16))
        * (e.spec.spawnlings ? 0.5 : 1);
      for (let i = 0; i < litter; i++) {
        this._spawn(child, hpMul, this.cfg.speedMul, 0, {
          pathIdx: e.pathIdx, t: clamp(e.t - i * 0.12, 0, 0.99), x: e.x, y: e.y,
        }, true);
      }
      if (e.spec.boss) this.shake();
    }
  }

  /** Cores earned so far, which every ending pays out. */
  _coresEarned() {
    // Depth counts across the campaign: a wave on level 4 is worth far more
    // than the same wave number on level 1.
    const depth = this.levelIdx * WAVES_PER_LEVEL + this.wave;
    return Math.round(runReward({ wave: depth, kills: this.kills }) * this.cfg.core * (1 + META.value("yield")));
  }

  _recordBest() {
    const c = this._campaign();
    const key = String(this.levelIdx);
    if ((c.best[key] || 0) < this.wave) c.best[key] = this.wave;
    saveManager.saveNow();
  }

  /** All twenty waves held: bank, unlock the next map, and offer it. */
  _levelCleared() {
    audioManager.play("win");
    const cores = this._coresEarned();
    META.award(cores);
    this._recordBest();
    const c = this._campaign();
    const wasLast = this.levelIdx >= LEVELS.length - 1;
    if (c.cleared < this.levelIdx + 1) c.cleared = this.levelIdx + 1;
    // Move the campaign pointer on, so the next Start lands on the new map.
    c.level = Math.min(LEVELS.length - 1, this.levelIdx + (wasLast ? 0 : 1));
    saveManager.saveNow();

    this.endGame({
      result: "win", score: this.score,
      message: wasLast
        ? `${this.level.name} held to the last wave. That is the whole campaign — every map cleared. Banked ${cores} Bastion Cores.`
        : `${this.level.name} held for all ${WAVES_PER_LEVEL} waves. ${LEVELS[this.levelIdx + 1].name} is open. Banked ${cores} Bastion Cores.`,
      extraStats: [
        { label: "Level", value: `${this.levelIdx + 1}/${LEVELS.length}` },
        { label: "Kills", value: this.kills },
        { label: "Cores", value: `\u{1F537} ${cores}` },
      ],
    });
  }

  /** The HUD's save & quit: identical settlement, just chosen rather than forced. */
  bankAndQuit() {
    const cores = this._coresEarned();
    META.award(cores);
    this._recordBest();
    audioManager.play("coin");
    this.endGame({
      result: "score", score: this.score,
      message: `Stopped on wave ${this.wave} of ${this.level.name}. Banked ${cores} Bastion Cores \u2014 the run counts exactly as if it had ended on its own.`,
      extraStats: [
        { label: "Level", value: `${this.levelIdx + 1}/${LEVELS.length}` },
        { label: "Wave", value: `${this.wave}/${WAVES_PER_LEVEL}` },
        { label: "Cores", value: `\u{1F537} ${cores}` },
      ],
    });
  }

  _gameOver() {
    audioManager.play("gameover");
    const cores = this._coresEarned();
    META.award(cores);
    this._recordBest();
    this.endGame({
      result: "loss", score: this.score,
      message: `The base fell on wave ${this.wave} of ${this.level.name} after ${this.kills} kills. Banked ${cores} Bastion Cores \u2014 spend them before the next attempt.`,
      extraStats: [
        { label: "Wave", value: `${this.wave}/${WAVES_PER_LEVEL}` },
        { label: "Kills", value: this.kills },
        { label: "Cores", value: `\u{1F537} ${cores}` },
      ],
    });
  }

  // ------------------------------------------------------------ RENDER ----
  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawGround(ctx);
    this._drawRoad(ctx);
    this._drawBase(ctx);
    if (this.hover) this._drawHover(ctx);
    for (const t of this.towers) this._drawTower(ctx, t);
    for (const e of this.enemies) this._drawEnemy(ctx, e);
    for (const a of this.arcs) this._drawArc(ctx, a);
    for (const hx of this.hexes) this._drawHex(ctx, hx);
    for (const bl of this.blinks) this._drawBlink(ctx, bl);
    for (const b of this.bullets) this._drawBullet(ctx, b);
    this.particles.render(ctx);
    for (const f of this.floaters) this._drawFloater(ctx, f);
    this._drawPalette(ctx);

    if (this.betweenWaves) {
      this.gfx.label(ctx, `WAVE ${this.wave + 1} INCOMING`, this.viewW / 2, this.offY - 6,
        { size: 14, weight: 800, color: "rgba(255,215,106,0.9)" });
    }
    ctx.restore();
  }

  _drawGround(ctx) {
    const c = this.cell;
    const th = this.level.theme;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (this.roadSet.has(`${x},${y}`)) continue;
      const px = this.offX + x * c, py = this.offY + y * c;
      const shade = (x + y) % 2 === 0 ? th.tileA : th.tileB;
      ctx.fillStyle = shade;
      ctx.fillRect(px, py, c - 1, c - 1);
      // Bevel: lit top-left, shadowed bottom-right — reads as cut stone.
      ctx.fillStyle = "rgba(255,255,255,0.055)";
      ctx.fillRect(px, py, c - 1, 2);
      ctx.fillRect(px, py, 2, c - 1);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(px, py + c - 3, c - 1, 2);
      ctx.fillRect(px + c - 3, py, 2, c - 1);
    }
    this._drawDecor(ctx);
  }

  /** Level flavour scattered on the buildable ground: trees, rocks, crystals. */
  _drawDecor(ctx) {
    const c = this.cell;
    const th = this.level.theme;
    for (const d of this._decor) {
      // Never sit on a tower — the prop would fight the turret for the tile.
      if (this.towers.some(t => t.x === d.x && t.y === d.y)) continue;
      const cx = this.offX + (d.x + 0.5 + d.ox) * c;
      const cy = this.offY + (d.y + 0.5 + d.oy) * c;
      const r = c * 0.2 * d.s;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 0.9, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = th.decorColor;
      if (th.decor === "tree") {
        ctx.fillStyle = "#3d2b18";
        ctx.fillRect(-r * 0.14, -r * 0.1, r * 0.28, r * 0.9);
        ctx.fillStyle = th.decorColor;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(0, -r * (1.5 - i * 0.42));
          ctx.lineTo(r * (0.6 + i * 0.2), -r * (0.5 - i * 0.42));
          ctx.lineTo(-r * (0.6 + i * 0.2), -r * (0.5 - i * 0.42));
          ctx.closePath(); ctx.fill();
        }
      } else if (th.decor === "crystal") {
        ctx.rotate(d.r * 0.1);
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.5); ctx.lineTo(r * 0.5, 0);
        ctx.lineTo(0, r * 0.7); ctx.lineTo(-r * 0.5, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.5); ctx.lineTo(r * 0.2, -r * 0.2); ctx.lineTo(0, r * 0.7);
        ctx.closePath(); ctx.fill();
      } else if (th.decor === "pipe") {
        ctx.rotate(d.r);
        ctx.fillRect(-r * 1.1, -r * 0.26, r * 2.2, r * 0.52);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(-r * 1.1, -r * 0.26, r * 2.2, r * 0.14);
        ctx.fillStyle = th.decorColor;
        for (const dx of [-1, 1]) { ctx.beginPath(); ctx.arc(dx * r * 1.1, 0, r * 0.34, 0, Math.PI * 2); ctx.fill(); }
      } else if (th.decor === "shard") {
        ctx.rotate(d.r);
        for (let i = 0; i < 3; i++) {
          ctx.rotate(2.1);
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(r * 0.34, -r * 1.2); ctx.lineTo(-r * 0.2, -r * 0.5);
          ctx.closePath(); ctx.fill();
        }
      } else {
        // rock
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.5);
        ctx.lineTo(-r * 0.6, -r * 0.7); ctx.lineTo(r * 0.2, -r);
        ctx.lineTo(r * 0.95, -r * 0.2); ctx.lineTo(r * 0.6, r * 0.6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.7); ctx.lineTo(r * 0.2, -r); ctx.lineTo(r * 0.1, -r * 0.4);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawRoad(ctx) {
    const c = this.cell;
    const th = this.level.theme;
    // The road is a tile set now, not the route list — a two-wide track has
    // twice the tiles the route names.
    for (const key of this.roadSet) {
      const [x, y] = key.split(",").map(Number);
      const px = this.offX + x * c, py = this.offY + y * c;
      const g = ctx.createLinearGradient(px, py, px, py + c);
      g.addColorStop(0, th.road);
      g.addColorStop(1, shadeHex(th.road, -0.3));
      ctx.fillStyle = g;
      ctx.fillRect(px, py, c, c);
    }
    // Kerb along the outer rim only, which is what makes a two-wide road read
    // as one track rather than two lanes of tiles.
    ctx.strokeStyle = th.roadEdge;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    for (const key of this.roadSet) {
      const [x, y] = key.split(",").map(Number);
      const px = this.offX + x * c, py = this.offY + y * c;
      if (!this.roadSet.has(`${x},${y - 1}`)) { ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + c, py + 1); ctx.stroke(); }
      if (!this.roadSet.has(`${x},${y + 1}`)) { ctx.beginPath(); ctx.moveTo(px, py + c - 1); ctx.lineTo(px + c, py + c - 1); ctx.stroke(); }
      if (!this.roadSet.has(`${x - 1},${y}`)) { ctx.beginPath(); ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + c); ctx.stroke(); }
      if (!this.roadSet.has(`${x + 1},${y}`)) { ctx.beginPath(); ctx.moveTo(px + c - 1, py); ctx.lineTo(px + c - 1, py + c); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;

    // Centre line down the middle of the track, so the two lanes are obvious.
    ctx.save();
    ctx.strokeStyle = th.roadEdge;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = Math.max(2, c * 0.05);
    ctx.setLineDash([c * 0.3, c * 0.3]);
    ctx.beginPath();
    for (let i = 0; i < this.path.length; i++) {
      const p = this._routePx(i);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    // Animated chevrons showing which way the road runs.
    const flow = (this.elapsed * 0.6) % 1;
    ctx.save();
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < this.path.length - 1; i += 3) {
      const a = this._routePx(i), b = this._routePx(i + 1);
      const x = a.x + (b.x - a.x) * flow, y = a.y + (b.y - a.y) * flow;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.strokeStyle = th.roadEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-c * 0.12, -c * 0.13);
      ctx.lineTo(c * 0.1, 0);
      ctx.lineTo(-c * 0.12, c * 0.13);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawBase(ctx) {
    const c = this.cell;
    const th = this.level.theme;
    const end = this._routePx(this.path.length - 1);
    const cx = end.x, cy = end.y;
    const r = c * 0.52;

    this.gfx.glow(ctx, cx, cy, r * 2.2, th.keep, 0.55);
    // Keep: a squat tower with battlements and a health ring.
    ctx.fillStyle = shadeHex(th.keep, -0.35);
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx - r * 0.78, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.78, cy - r * 0.5); ctx.lineTo(cx + r, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = th.keep;
    for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * r * 0.55 - r * 0.16, cy - r * 0.78, r * 0.32, r * 0.34);
    ctx.fillStyle = "#1a1436";
    ctx.fillRect(cx - r * 0.22, cy + r * 0.18, r * 0.44, r * 0.82);

    const pct = clamp(this.baseHP / this.maxBaseHP, 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.28, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.strokeStyle = pct > 0.5 ? "#2ee6a6" : pct > 0.25 ? "#ffd76a" : "#ff5470";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _drawHover(ctx) {
    const { x, y } = this.hover;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    const c = this.cell;
    const existing = this.towers.find(t => t.x === x && t.y === y);
    const blocked = this.pathSet.has(`${x},${y}`);
    const px = this.offX + x * c, py = this.offY + y * c;

    if (existing) {
      const range = towerStat(existing, "range") * c;
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(px + c / 2, py + c / 2, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (blocked) return;

    const spec = TOWERS[this.selected];
    const afford = this.gold >= spec.cost;
    ctx.strokeStyle = afford ? "rgba(46,230,166,0.6)" : "rgba(255,84,112,0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, c - 5, c - 5);
    if (afford) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(px + c / 2, py + c / 2, spec.range * c, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Towers are plinth + rotating turret. The silhouette gains armour plates
   * at level 4 and 7 and a crown at 10, so a maxed tower is obvious.
   */
  _drawTower(ctx, t) {
    const c = this.cell;
    const { x: cx, y: cy } = this._toPx(t.x, t.y);
    const spec = TOWERS[t.type];
    const tier = t.level >= 10 ? 3 : t.level >= 7 ? 2 : t.level >= 4 ? 1 : 0;
    const pop = t.built > 0 ? 1 + t.built * 0.5 : 1;
    const r = c * 0.36 * pop;

    // Plinth
    ctx.fillStyle = "#0d1226";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.42, r * 1.02, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    const base = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    base.addColorStop(0, "#3c4670");
    base.addColorStop(1, "#1b2138");
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.22, r * 0.95, r * 0.48, 0, 0, Math.PI * 2); ctx.fill();

    if (tier >= 1) {
      ctx.strokeStyle = spec.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.22, r * 0.95, r * 0.48, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // Turret body
    const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.28, spec.color);
    body.addColorStop(1, spec.accent);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.06, r * 0.62, 0, Math.PI * 2); ctx.fill();

    if (tier >= 2) {
      // Shoulder plates
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * r * 0.62, cy - r * 0.02, r * 0.22, r * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Barrel, tracking the target
    ctx.save();
    ctx.translate(cx, cy - r * 0.06);
    ctx.rotate(t.angle);
    const recoil = t.flash > 0 ? -r * 0.16 : 0;
    ctx.fillStyle = "#12172c";
    if (t.type === "frost") {
      ctx.fillRect(r * 0.2 + recoil, -r * 0.2, r * 0.75, r * 0.4);
      ctx.fillStyle = spec.color;
      ctx.fillRect(r * 0.75 + recoil, -r * 0.26, r * 0.22, r * 0.52);
    } else if (t.type === "arc") {
      ctx.fillRect(r * 0.2 + recoil, -r * 0.1, r * 0.72, r * 0.2);
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r * 0.98 + recoil, 0, r * 0.24, -1.1, 1.1);
      ctx.stroke();
    } else if (t.type === "flak") {
      // Twin barrels angled apart — reads as anti-air at a glance.
      for (const s2 of [-1, 1]) {
        ctx.fillStyle = "#12172c";
        ctx.save();
        ctx.rotate(s2 * 0.22);
        ctx.fillRect(r * 0.18 + recoil, -r * 0.11, r * 0.86, r * 0.22);
        ctx.fillStyle = spec.color;
        ctx.fillRect(r * 0.96 + recoil, -r * 0.14, r * 0.12, r * 0.28);
        ctx.restore();
      }
    } else if (t.type === "mortar") {
      // Short fat tube tilted up, on a wide bipod.
      ctx.fillStyle = "#12172c";
      ctx.fillRect(r * 0.05 + recoil, -r * 0.3, r * 0.7, r * 0.6);
      ctx.fillStyle = spec.accent;
      ctx.fillRect(r * 0.66 + recoil, -r * 0.34, r * 0.2, r * 0.68);
      ctx.fillStyle = "#0d1226";
      ctx.beginPath(); ctx.ellipse(r * 0.78 + recoil, 0, r * 0.1, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    } else if (t.type === "venom") {
      // Tank plus a thin nozzle, with the reservoir visible.
      ctx.fillStyle = "#12172c";
      ctx.fillRect(r * 0.2 + recoil, -r * 0.12, r * 0.9, r * 0.24);
      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.accent;
      ctx.fillRect(r * 1.04 + recoil, -r * 0.09, r * 0.16, r * 0.18);
    } else if (t.type === "railgun") {
      // Long rails with a charge coil between them.
      ctx.fillStyle = "#12172c";
      for (const s2 of [-1, 1]) ctx.fillRect(r * 0.2 + recoil, s2 * r * 0.16 - r * 0.05, r * 1.35, r * 0.1);
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(r * 0.45 + recoil, -r * 0.16);
      ctx.lineTo(r * 0.45 + recoil, r * 0.16);
      ctx.stroke();
      ctx.fillStyle = spec.color;
      ctx.beginPath(); ctx.arc(r * 0.28, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillRect(r * 0.2 + recoil, -r * 0.16, r * 0.92, r * 0.32);
      ctx.fillStyle = spec.color;
      ctx.fillRect(r * 1.02 + recoil, -r * 0.2, r * 0.14, r * 0.4);
    }
    if (t.flash > 0) {
      ctx.globalAlpha = t.flash / 0.09;
      this.gfx.glow(ctx, r * 1.2, 0, r * 0.7, spec.color, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Level pips around the base — full ring at 10, plus a crown.
    const pips = Math.min(t.level, MAX_LEVEL);
    for (let i = 0; i < pips; i++) {
      const a = -Math.PI / 2 + (i / MAX_LEVEL) * Math.PI * 2;
      ctx.fillStyle = tier >= 3 ? "#ffd76a" : spec.color;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.98, cy - r * 0.06 + Math.sin(a) * r * 0.98, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    if (tier >= 3) this.gfx.glow(ctx, cx, cy - r * 0.06, r * 2, "#ffd76a", 0.5);

    ctx.fillStyle = "#0a0d18";
    ctx.font = `800 ${Math.floor(c * 0.26)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(t.level), cx, cy - r * 0.04);

    // A hexed tower is greyed out under a spinning rune ring, so it is
    // obvious at a glance which gun has stopped answering.
    if (t.hex > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#1a1030";
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.06, r * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = "#d24bff";
      ctx.lineWidth = 2;
      ctx.setLineDash([r * 0.35, r * 0.25]);
      ctx.lineDashOffset = -this.elapsed * 30;
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.06, r * 0.95, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /** Each family gets its own silhouette so a wave reads at a glance. */
  _drawEnemy(ctx, e) {
    if (e.spawnDelay > 0) return;
    const c = this.cell;
    const spec = e.spec;
    const r = spec.r * c;

    // Underground: all that shows is a travelling mound of earth.
    if (e.burrowed > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r * 1.1, r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.dark;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y - r * 0.1, r * 0.9 + Math.sin(this.elapsed * 9 + e.wobble) * r * 0.08, r * 0.3, 0, Math.PI, 0);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(e.wobble) * (spec.flying ? r * 0.22 : r * 0.1);
    const x = e.x, y = e.y + bob;

    if (!spec.flying) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + r * 0.85, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const chilled = e.slowT > 0;
    const bodyColor = e.hitFlash > 0 ? "#ffffff" : chilled ? mix(spec.color, "#7ce8ff", 0.45) : spec.color;

    ctx.save();
    ctx.translate(x, y);

    if (spec.flying) {
      // Drone: rotor blur plus a hull.
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 1.25, r * 0.22, Math.sin(e.wobble * 2) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      roundedBody(ctx, 0, 0, r * 0.95, r * 0.66, bodyColor, spec.dark);
      ctx.fillStyle = "#0a1420";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
    } else if (spec.slowImmune) {
      // Leviathan: a spiked carapace with a bank of eyes. Deliberately not a
      // recoloured Titan — the two bosses want different answers.
      ctx.fillStyle = spec.dark;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
        ctx.lineTo(Math.cos(a) * r * 1.85, Math.sin(a) * r * 1.85);
        ctx.lineTo(Math.cos(a + 0.22) * r * 1.2, Math.sin(a + 0.22) * r * 1.2);
        ctx.closePath(); ctx.fill();
      }
      roundedBody(ctx, 0, 0, r * 1.75, r * 1.55, bodyColor, spec.dark);
      ctx.fillStyle = "#2a0410";
      ctx.beginPath(); ctx.ellipse(0, r * 0.2, r * 1.3, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      this.gfx.glow(ctx, 0, -r * 0.2, r * 1.3, "#ff2f6d", 0.9);
      ctx.fillStyle = "#ffe2ea";
      for (const dx of [-0.62, -0.2, 0.2, 0.62]) {
        ctx.beginPath();
        ctx.ellipse(dx * r, -r * 0.3, r * 0.13, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (spec.boss) {
      // Titan: broad chassis with spaulders and a glowing core.
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 1.05, -r * 0.35, r * 2.1, r * 0.7);
      roundedBody(ctx, 0, 0, r * 1.5, r * 1.35, bodyColor, spec.dark);
      for (const s of [-1, 1]) {
        ctx.fillStyle = spec.dark;
        ctx.beginPath();
        ctx.ellipse(s * r * 0.85, -r * 0.25, r * 0.42, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      this.gfx.glow(ctx, 0, 0, r * 1.1, "#ffd76a", 0.8);
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (spec.armour >= 4) {
      // Brute: plated hexagon that reads as heavy.
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = spec.dark;
      ctx.lineWidth = Math.max(2, r * 0.22);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(-r * 0.5, -r * 0.6, r * 1.0, r * 0.18);
    } else if (spec.heal) {
      // Mender: a soft orb with a cross and a pulsing aura.
      if (e.pulse > 0) {
        ctx.save();
        ctx.globalAlpha = e.pulse;
        ctx.strokeStyle = spec.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, spec.healRange * c * (1 - e.pulse * 0.4), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      roundedBody(ctx, 0, 0, r * 1.5, r * 1.5, bodyColor, spec.dark);
      ctx.fillStyle = "#eafff6";
      ctx.fillRect(-r * 0.16, -r * 0.55, r * 0.32, r * 1.1);
      ctx.fillRect(-r * 0.55, -r * 0.16, r * 1.1, r * 0.32);
    } else if (spec.shield) {
      roundedBody(ctx, 0, 0, r * 1.4, r * 1.5, bodyColor, spec.dark);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.42, -r * 0.2);
      ctx.lineTo(0, r * 0.62); ctx.lineTo(-r * 0.42, -r * 0.2);
      ctx.closePath(); ctx.fill();
    } else if (spec.blinkEvery) {
      // Blinker: a floating shard split into two halves that never quite meet,
      // so it reads as something that is only half here.
      const gap = r * 0.16 + Math.sin(this.elapsed * 4 + e.wobble) * r * 0.06;
      ctx.fillStyle = bodyColor;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * gap, -r * 1.2);
        ctx.lineTo(sgn * (gap + r * 0.85), 0);
        ctx.lineTo(sgn * gap, r * 1.2);
        ctx.closePath(); ctx.fill();
      }
      this.gfx.glow(ctx, 0, 0, r * 1.2, spec.color, 0.7);
      ctx.fillStyle = "#eaffff";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
    } else if (spec.auraRange) {
      // Warlord: a broad standard-bearer, with its aura drawn as a ring so it
      // is obvious which units are being protected.
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(this.elapsed * 2.4) * 0.05;
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, spec.auraRange * c, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = spec.color;
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 0.1, -r * 2.1, r * 0.2, r * 2.2);
      ctx.fillStyle = spec.color;
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 2.05);
      ctx.lineTo(r * 1.2, -r * 1.72);
      ctx.lineTo(r * 0.1, -r * 1.28);
      ctx.closePath(); ctx.fill();
      roundedBody(ctx, 0, 0, r * 1.7, r * 1.5, bodyColor, spec.dark);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(-r * 0.75, -r * 0.62, r * 1.5, r * 0.2);
      ctx.fillStyle = "#2a1a05";
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.12, r * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.12, r * 0.15, 0, Math.PI * 2); ctx.fill();
    } else if (spec.hexEvery) {
      // Hexer: a hooded caster with an orbiting rune.
      roundedBody(ctx, 0, r * 0.1, r * 1.2, r * 1.4, bodyColor, spec.dark);
      ctx.fillStyle = spec.dark;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.quadraticCurveTo(r * 0.85, -r * 0.5, r * 0.55, r * 0.35);
      ctx.lineTo(-r * 0.55, r * 0.35);
      ctx.quadraticCurveTo(-r * 0.85, -r * 0.5, 0, -r * 1.1);
      ctx.fill();
      ctx.fillStyle = "#ffe9ff";
      ctx.beginPath(); ctx.arc(0, -r * 0.28, r * 0.16, 0, Math.PI * 2); ctx.fill();
      const ra = this.elapsed * 3 + e.wobble;
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.cos(ra) * r * 1.25, Math.sin(ra) * r * 0.55 - r * 0.3, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    } else if (spec.burrowEvery) {
      // Burrower: a segmented grub with a digging snout.
      ctx.fillStyle = spec.dark;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-i * r * 0.5, Math.sin(e.wobble + i) * r * 0.12, r * 0.5, r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      roundedBody(ctx, 0, 0, r * 1.3, r * 1.1, bodyColor, spec.dark);
      ctx.fillStyle = "#3a2410";
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.4); ctx.lineTo(r * 1.15, 0); ctx.lineTo(r * 0.5, r * 0.4);
      ctx.closePath(); ctx.fill();
    } else if (spec.spawnlings) {
      // Swarmling: small, round, and visibly one of many.
      roundedBody(ctx, 0, 0, r * 1.5, r * 1.5, bodyColor, spec.dark);
      ctx.fillStyle = "#1a0d02";
      ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = spec.dark;
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      for (const s2 of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s2 * r * 0.55, r * 0.1);
        ctx.lineTo(s2 * r * 1.0, r * 0.55 + Math.sin(e.wobble * 2) * r * 0.2);
        ctx.stroke();
      }
    } else if (spec.armour >= 7) {
      // Juggernaut: an armoured wedge on treads, leaning into its charge.
      ctx.save();
      ctx.rotate(e.facing || 0);
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 1.15, -r * 0.85, r * 2.3, r * 1.7);
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(r * 0.2, -r * 0.9); ctx.lineTo(-r * 1.05, -r * 0.62);
      ctx.lineTo(-r * 1.05, r * 0.62); ctx.lineTo(r * 0.2, r * 0.9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fillRect(-r * 0.6, -r * 0.72, r * 1.2, r * 0.16);
      ctx.fillStyle = "#2a0510";
      for (const s2 of [-1, 1]) ctx.fillRect(-r * 1.1, s2 * r * 0.66 - r * 0.12, r * 2.1, r * 0.24);
      ctx.restore();
    } else if (spec.speed > 90) {
      // Sprinter: a wedge leaning into its run, with a speed streak.
      ctx.save();
      ctx.rotate((e.facing || 0));
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r * 0.7, -r * 0.75); ctx.lineTo(-r * 0.35, 0); ctx.lineTo(-r * 0.7, r * 0.75);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 1.7, 0); ctx.stroke();
      ctx.restore();
    } else {
      // Marcher: a capsule with two stubby legs that swing as it walks.
      const step = Math.sin(e.wobble) * r * 0.32;
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 0.42 + step, r * 0.5, r * 0.3, r * 0.5);
      ctx.fillRect(r * 0.12 - step, r * 0.5, r * 0.3, r * 0.5);
      roundedBody(ctx, 0, 0, r * 1.35, r * 1.45, bodyColor, spec.dark);
      ctx.fillStyle = "#0d1024";
      ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.12, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.26, -r * 0.12, r * 0.14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Poison haze, so a stacked debuff is visible without a status bar.
    if (e.poisonT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.sin(this.elapsed * 8 + e.wobble) * 0.12;
      ctx.fillStyle = "#a8e02c";
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Shield bubble
    if (e.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + (e.shield / e.maxShield) * 0.4;
      ctx.strokeStyle = "#c86bff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Health bar only once it matters.
    if (e.hp < e.maxHp - 0.01) {
      const bw = Math.max(20, r * 2.2), bh = 4;
      const by = e.y - r * 1.7;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - bw / 2, by, bw, bh);
      ctx.fillStyle = spec.boss ? "#ff9f43" : "#2ee6a6";
      ctx.fillRect(x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), bh);
    }
  }

  _drawBullet(ctx, b) {
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    b.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    this.gfx.orb(ctx, b.x, b.y, this.cell * (b.type === "frost" ? 0.1 : 0.07), b.color, { glow: 0.7 });
  }

  /** The streak a Blinker leaves behind when it jumps up the road. */
  _drawBlink(ctx, bl) {
    const p = 1 - bl.t / 0.3;
    ctx.save();
    ctx.globalAlpha = p * 0.8;
    ctx.strokeStyle = ENEMIES.blinker.color;
    ctx.lineWidth = 2 + p * 5;
    ctx.lineCap = "round";
    ctx.shadowColor = ENEMIES.blinker.color;
    ctx.shadowBlur = 14 * p;
    ctx.beginPath();
    ctx.moveTo(bl.x1, bl.y1);
    ctx.lineTo(bl.x2, bl.y2);
    ctx.stroke();
    ctx.restore();
  }

  /** The bolt a Hexer throws at a tower — a wobbling violet tendril. */
  _drawHex(ctx, hx) {
    const p = 1 - hx.t / 0.45;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.strokeStyle = "#d24bff";
    ctx.lineWidth = 2 + p * 3;
    ctx.beginPath();
    ctx.moveTo(hx.x1, hx.y1);
    const segs = 6;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const nx = -(hx.y2 - hx.y1), ny = hx.x2 - hx.x1;
      const len = Math.hypot(nx, ny) || 1;
      const wob = Math.sin(t * Math.PI * 3 + this.elapsed * 14) * this.cell * 0.16 * (1 - Math.abs(t - 0.5) * 2);
      ctx.lineTo(hx.x1 + (hx.x2 - hx.x1) * t + (nx / len) * wob,
                 hx.y1 + (hx.y2 - hx.y1) * t + (ny / len) * wob);
    }
    ctx.lineTo(hx.x2, hx.y2);
    ctx.stroke();
    ctx.restore();
  }

  _drawArc(ctx, a) {
    const p = 1 - a.t / 0.16;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.strokeStyle = a.color;
    if (a.wide) {
      // A railgun trace is a straight beam with a bloom, not lightning.
      ctx.lineWidth = 3 + p * 7;
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 18 * p;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.lineWidth = 2 + p * 2;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    // A couple of kinks make it read as lightning rather than a laser.
    const segs = 4;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const jitter = (Math.random() - 0.5) * this.cell * 0.22;
      ctx.lineTo(a.x1 + (a.x2 - a.x1) * t - (a.y2 - a.y1) * 0.02 + jitter,
                 a.y1 + (a.y2 - a.y1) * t + (a.x2 - a.x1) * 0.02 + jitter);
    }
    ctx.lineTo(a.x2, a.y2);
    ctx.stroke();
    ctx.restore();
  }

  _drawFloater(ctx, f) {
    const p = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = f.color;
    ctx.font = `800 ${Math.floor(this.cell * 0.26)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y - p * this.cell * 0.6);
    ctx.restore();
  }

  _drawPalette(ctx) {
    TOWER_KEYS.forEach((key, i) => {
      const spec = TOWERS[key];
      const { x: bx, y: by, w, h } = this._paletteSlot(i);
      const active = this.selected === key;
      const unlocked = this._unlocked(key);
      const cost = this._cost(key);
      const afford = unlocked && this.gold >= cost;

      ctx.fillStyle = active ? "rgba(255,255,255,0.12)" : "rgba(10,14,30,0.72)";
      roundRect(ctx, bx, by, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = active ? spec.color : "rgba(255,255,255,0.14)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      // Icon on the left with its own padding, text column to the right of
      // it. Both are laid out from the slot's own box so nothing collides.
      const pad = Math.min(10, w * 0.09);
      const ir = Math.min(h * 0.3, w * 0.15);
      const ix = bx + pad + ir, iy = by + h * 0.5;
      const g = ctx.createRadialGradient(ix - ir * 0.3, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, spec.color);
      g.addColorStop(1, spec.accent);
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
      // Hotkey number rides on the icon rather than stealing a text line.
      ctx.globalAlpha = unlocked ? 0.85 : 0.3;
      ctx.fillStyle = "#0a0d18";
      ctx.font = `800 ${Math.round(ir * 0.95)}px 'Sora', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), ix, iy + ir * 0.04);

      const tx = ix + ir + pad * 0.9;
      const tw = Math.max(14, bx + w - pad - tx);
      ctx.globalAlpha = unlocked ? (afford ? 1 : 0.55) : 0.45;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#eef1ff";
      ctx.font = `700 ${Math.round(h * 0.27)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(spec.name, tx, by + h * 0.44, tw);
      ctx.fillStyle = !unlocked ? "#8b90ac" : afford ? "#ffd76a" : "#ff8fa4";
      ctx.font = `700 ${Math.round(h * 0.24)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(unlocked ? `${cost}g` : "locked", tx, by + h * 0.78, tw);
      ctx.globalAlpha = 1;
    });
  }
}

// ---------------------------------------------------------------- helpers --
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shared enemy chassis: a lit capsule with a darker underside. */
function roundedBody(ctx, x, y, w, h, color, dark) {
  const g = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, Math.min(w, h) * 0.36);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  roundRect(ctx, x - w * 0.32, y - h * 0.42, w * 0.64, h * 0.22, h * 0.11);
  ctx.fill();
}

/** Lightens (positive) or darkens (negative) a hex colour. */
function shadeHex(h, amount) {
  const [r, g, b] = hex(h);
  const f = (v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hex(h) {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export default TowerDefenseGame;
