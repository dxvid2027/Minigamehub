// ==========================================================================
// Bastion TD — grid tower defense with a serpentine road, seven tower
// classes and ten upgrade levels.
//
// Eleven enemy families keep the waves from turning into one long healthbar:
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
import { clamp, randFloat } from "../core/utils.js";

const COLS = 12, ROWS = 7;
const MAX_LEVEL = 10;

// ------------------------------------------------------------- towers -----
// `air` says what a tower may shoot at: "both" by default, "air" for a
// dedicated anti-air mount, "ground" for anything that lobs a shell.
const TOWERS = {
  cannon: {
    name: "Cannon", cost: 45, color: "#ffd76a", accent: "#ff9f43",
    dmg: 9, range: 2.15, rate: 0.55,
    desc: "Reliable single-target fire.",
  },
  frost: {
    name: "Frost", cost: 60, color: "#7ce8ff", accent: "#3aa8ff",
    dmg: 4, range: 2.0, rate: 0.85, slow: 0.5, slowTime: 1.5, splash: 0.85,
    desc: "Chills a small area and slows what it hits.",
  },
  arc: {
    name: "Arc", cost: 80, color: "#c86bff", accent: "#7c5cff",
    dmg: 7, range: 2.35, rate: 0.8, chains: 2,
    desc: "Lightning that jumps between enemies.",
  },
  flak: {
    // The answer to a sky full of drones: triple damage in the air, and
    // barely worth building if nothing is flying.
    name: "Flak", cost: 70, color: "#8fe36b", accent: "#3f8f2c",
    dmg: 8, range: 2.6, rate: 0.7, air: "air", airBonus: 3, splash: 0.7,
    desc: "Anti-air battery. Triple damage to flyers, useless on the ground.",
  },
  mortar: {
    // Lobs a shell, so it cannot track a flyer, but it lands hard and wide.
    name: "Mortar", cost: 110, color: "#ff8f4a", accent: "#a83610",
    dmg: 26, range: 3.4, rate: 2.0, air: "ground", splash: 1.35, arcShot: true,
    desc: "Lobbed shell with a wide blast. Ground targets only.",
  },
  venom: {
    // Poison ignores armour, which is what makes brutes and juggernauts
    // solvable without stacking raw damage.
    name: "Venom", cost: 95, color: "#a8e02c", accent: "#4f7a10",
    dmg: 3, range: 2.2, rate: 1.0, poison: 7, poisonTime: 4,
    desc: "Poison that ignores armour and stacks over time.",
  },
  railgun: {
    name: "Railgun", cost: 165, color: "#ff4fd8", accent: "#7c1a68",
    dmg: 34, range: 4.6, rate: 1.9, pierce: true, locked: true,
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
    hp: 34, speed: 46, armour: 1, gold: 18, score: 34, r: 0.26, heal: 9, healRange: 2.2,
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
    hexEvery: 5.5, hexTime: 3.2, hexRange: 3.0,
  },
  juggernaut: {
    name: "Juggernaut", color: "#ff5470", dark: "#5e0f22",
    hp: 130, speed: 62, armour: 7, gold: 30, score: 62, r: 0.34,
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

/** Which families a wave may draw from, and how many of each. */
function waveComposition(wave) {
  const pool = [];
  const add = (type, n) => { for (let i = 0; i < n; i++) pool.push(type); };
  add("marcher", 4 + Math.floor(wave * 1.05));
  if (wave >= 3) add("sprinter", 2 + Math.floor(wave * 0.6));
  if (wave >= 4) add("swarm", 3 + Math.floor((wave - 3) * 0.8));
  if (wave >= 5) add("brute", 1 + Math.floor((wave - 4) * 0.5));
  if (wave >= 7) add("drone", 1 + Math.floor((wave - 6) * 0.45));
  if (wave >= 8) add("burrower", 1 + Math.floor((wave - 7) * 0.3));
  if (wave >= 9) add("mender", 1 + Math.floor((wave - 8) * 0.26));
  if (wave >= 11) add("bulwark", 1 + Math.floor((wave - 10) * 0.32));
  if (wave >= 12) add("hexer", 1 + Math.floor((wave - 11) * 0.24));
  if (wave >= 14) add("juggernaut", 1 + Math.floor((wave - 13) * 0.3));
  if (wave % 10 === 0) add("leviathan", Math.max(1, Math.floor(wave / 20)));
  else if (wave % 5 === 0) add("titan", Math.max(1, Math.floor(wave / 8)));
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

function buildPath() {
  const path = [];
  for (let x = 0; x <= 10; x++) path.push({ x, y: 1 });
  for (let y = 2; y <= 3; y++) path.push({ x: 10, y });
  for (let x = 10; x >= 1; x--) path.push({ x, y: 3 });
  for (let y = 4; y <= 5; y++) path.push({ x: 1, y });
  for (let x = 1; x <= 11; x++) path.push({ x, y: 5 });
  return path;
}

export class TowerDefenseGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getUpgrades() { return META; }
  getInstructions() {
    return [
      "Pick a tower from the bar at the bottom, then tap an empty tile to build it. Tap a tower you own to upgrade it — every tower goes up to level 10.",
      "Seven classes: Cannon is reliable single-target, Frost slows an area, Arc chains lightning, Flak triples its damage against flyers but cannot hit the ground, Mortar lobs a wide shell at ground targets only, Venom poisons through armour, and the Railgun pierces everything on its line.",
      "Eleven enemy families march the road. Swarmlings split when they die, burrowers dive underground where nothing can target them, hexers shut one of your towers down for a few seconds, and juggernauts are fast and heavily plated.",
      "A Titan comes every fifth wave and splits into brutes. Every tenth wave brings a Leviathan instead — it is immune to slowing, so frost alone will not stop it.",
      "A run banks Bastion Cores based on how deep you got. Spend them on permanent upgrades from the start screen before the next attempt.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tower type in the bar, then tap a tile. Tap an existing tower to upgrade it."; }
  getKeyboardHint() { return "Click a tower type, then click a tile. Click a tower to upgrade it. Keys 1-7 switch type."; }

  getScene() { return "grid"; }

  onInit() {
    this.createCanvas();
    this.path = buildPath();
    this.pathSet = new Set(this.path.map(p => `${p.x},${p.y}`));
    this.selected = "cannon";
    this.input.onPointer("down", (p) => this._onClick(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this._gridFromPx(p.x, p.y); });
    TOWER_KEYS.forEach((k, i) => this.input.onKey(`Digit${i + 1}`, () => {
      if (this._unlocked(k)) { this.selected = k; audioManager.play("select"); }
    }));
  }

  _unlocked(key) { return !TOWERS[key].locked || META.level("rail") > 0; }

  /** Build price after the Field Engineers discount. */
  _cost(key) { return Math.round(TOWERS[key].cost * this.costMul); }

  onResize() { this._layout(); }

  /** Grid on top, tower palette in a strip along the bottom. */
  _layout() {
    // Two rows of tower buttons need roughly double the strip.
    const twoRows = (this.viewW - 30) / TOWER_KEYS.length - 8 < 96;
    this.barH = twoRows ? clamp(this.viewH * 0.24, 92, 140) : clamp(this.viewH * 0.14, 54, 86);
    const gridH = this.viewH - this.barH;
    this.cell = Math.floor(Math.min(this.viewW / COLS, gridH / ROWS));
    this.offX = Math.round((this.viewW - this.cell * COLS) / 2);
    this.offY = Math.round((gridH - this.cell * ROWS) / 2);
  }

  onStart(difficulty) {
    this._layout();
    const cfg = {
      Easy:   { hpMul: 0.85, speedMul: 0.92, gold: 190, lives: 16, reward: 1.15, core: 0.85 },
      Normal: { hpMul: 1.12, speedMul: 1.02, gold: 150, lives: 12, reward: 0.98, core: 1.0 },
      Hard:   { hpMul: 1.55, speedMul: 1.16, gold: 115, lives: 8,  reward: 0.86, core: 1.4 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.dmgMul = 1 + META.value("dmg");
    this.rangeMul = 1 + META.value("range");
    this.goldMul = cfg.reward * (1 + META.value("income"));
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
      Wave: this.betweenWaves ? `${this.wave + 1} in ${Math.max(0, Math.ceil(this.waveTimer))}s` : this.wave,
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
   * Seven classes will not fit across a phone in one strip — at 360px each
   * slot would be 35px wide — so the bar wraps to two rows whenever a single
   * row would squeeze a slot below a readable width.
   */
  _paletteMetrics() {
    const n = TOWER_KEYS.length;
    const gap = 8;
    const oneRowW = (this.viewW - 30) / n - gap;
    const rows = oneRowW < 96 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const h = (this.barH - 10 - (rows - 1) * 6) / rows;
    const w = Math.min(150, (this.viewW - 30) / perRow - gap);
    return { w, gap, y0: this.viewH - this.barH + 5, h, rows, perRow, rowGap: 6 };
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
    const pool = waveComposition(this.wave);
    // Steeper than before: the meta upgrades are what keep this beatable, so
    // a run without them should stall well before wave 15.
    const hpMul = this.cfg.hpMul * (1 + this.wave * 0.28);
    const speedMul = this.cfg.speedMul * (1 + Math.min(0.55, this.wave * 0.015));
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
      sterile,
      x: -200, y: -200,
    };
    if (at) { e.pathIdx = at.pathIdx; e.t = at.t; e.x = at.x; e.y = at.y; }
    if (spec.flying) {
      // Drones cut the corner: they fly from the road's start to the base.
      const a = this._toPx(this.path[0].x, this.path[0].y);
      const b = this._toPx(this.path[this.path.length - 1].x, this.path[this.path.length - 1].y);
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

      const cur = this.path[e.pathIdx];
      const nextIdx = Math.min(e.pathIdx + 1, this.path.length - 1);
      const next = this.path[nextIdx];
      const a = this._toPx(cur.x, cur.y), b = this._toPx(next.x, next.y);
      e.t += (speed * dt) / this.cell;
      if (e.t >= 1) { e.t -= 1; e.pathIdx = nextIdx; }
      e.x = a.x + (b.x - a.x) * e.t;
      e.y = a.y + (b.y - a.y) * e.t;
      e.facing = Math.atan2(b.y - a.y, b.x - a.x);
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

      // Menders first, then whatever is furthest along the road.
      let target = null, bestKey = -Infinity;
      for (const e of this.enemies) {
        if (!this._canTarget(t, e)) continue;
        if (Math.hypot(e.x - pos.x, e.y - pos.y) > range) continue;
        const key = (e.spec.heal ? 1e6 : 0) + (e.spec.flying ? e.fly * 1000 : e.pathIdx + e.t);
        if (key > bestKey) { bestKey = key; target = e; }
      }
      if (target) t.angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      if (!target || t.cooldown > 0) continue;

      t.cooldown = towerStat(t, "rate");
      t.flash = 0.09;
      const dmg = towerStat(t, "dmg") * this.dmgMul;
      const spec = TOWERS[t.type];

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
      // Flak is built for the sky and says so in its numbers.
      const mult = spec.airBonus && e.spec.flying ? spec.airBonus : 1;
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

  _gameOver() {
    audioManager.play("gameover");
    const cores = Math.round(runReward({ wave: this.wave, kills: this.kills }) * this.cfg.core * (1 + META.value("yield")));
    META.award(cores);
    this.endGame({
      result: "loss", score: this.score,
      message: `The base fell on wave ${this.wave} after ${this.kills} kills. Banked ${cores} Bastion Cores \u2014 spend them before the next defence.`,
      extraStats: [
        { label: "Wave", value: this.wave },
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
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (this.pathSet.has(`${x},${y}`)) continue;
      const px = this.offX + x * c, py = this.offY + y * c;
      const shade = (x + y) % 2 === 0 ? "#1b2440" : "#182036";
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
  }

  _drawRoad(ctx) {
    const c = this.cell;
    for (const p of this.path) {
      const px = this.offX + p.x * c, py = this.offY + p.y * c;
      const g = ctx.createLinearGradient(px, py, px, py + c);
      g.addColorStop(0, "#3a2f4e");
      g.addColorStop(1, "#241d33");
      ctx.fillStyle = g;
      ctx.fillRect(px, py, c, c);
    }
    // Kerb highlight along the road, then animated chevrons showing direction.
    ctx.strokeStyle = "rgba(200,107,255,0.18)";
    ctx.lineWidth = 2;
    for (const p of this.path) {
      const px = this.offX + p.x * c, py = this.offY + p.y * c;
      if (!this.pathSet.has(`${p.x},${p.y - 1}`)) { ctx.beginPath(); ctx.moveTo(px, py + 1); ctx.lineTo(px + c, py + 1); ctx.stroke(); }
      if (!this.pathSet.has(`${p.x},${p.y + 1}`)) { ctx.beginPath(); ctx.moveTo(px, py + c - 1); ctx.lineTo(px + c, py + c - 1); ctx.stroke(); }
      if (!this.pathSet.has(`${p.x - 1},${p.y}`)) { ctx.beginPath(); ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + c); ctx.stroke(); }
      if (!this.pathSet.has(`${p.x + 1},${p.y}`)) { ctx.beginPath(); ctx.moveTo(px + c - 1, py); ctx.lineTo(px + c - 1, py + c); ctx.stroke(); }
    }

    const flow = (this.elapsed * 0.6) % 1;
    ctx.save();
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < this.path.length - 1; i += 3) {
      const a = this._toPx(this.path[i].x, this.path[i].y);
      const b = this._toPx(this.path[i + 1].x, this.path[i + 1].y);
      const t = flow;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.strokeStyle = "#c86bff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-c * 0.1, -c * 0.11);
      ctx.lineTo(c * 0.08, 0);
      ctx.lineTo(-c * 0.1, c * 0.11);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawBase(ctx) {
    const c = this.cell;
    const p = this.path[this.path.length - 1];
    const cx = this.offX + p.x * c + c / 2, cy = this.offY + p.y * c + c / 2;
    const r = c * 0.42;

    this.gfx.glow(ctx, cx, cy, r * 2.2, "#7c5cff", 0.55);
    // Keep: a squat tower with battlements and a health ring.
    ctx.fillStyle = "#5b4ba8";
    ctx.beginPath();
    ctx.moveTo(cx - r, cy + r); ctx.lineTo(cx - r * 0.78, cy - r * 0.5);
    ctx.lineTo(cx + r * 0.78, cy - r * 0.5); ctx.lineTo(cx + r, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a7ae0";
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

      // Mini turret icon
      const ix = bx + h * 0.5, iy = by + h * 0.5, ir = h * 0.26;
      const g = ctx.createRadialGradient(ix - ir * 0.3, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, spec.color);
      g.addColorStop(1, spec.accent);
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();

      // Names are clipped to the slot rather than allowed to run into the
      // next button, which is what a seven-slot bar would otherwise do.
      const tw = Math.max(18, w - h * 0.9 - 6);
      ctx.globalAlpha = unlocked ? (afford ? 1 : 0.5) : 0.4;
      ctx.fillStyle = "#eef1ff";
      ctx.font = `700 ${Math.round(h * 0.26)}px 'Sora', system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(spec.name, bx + h * 0.9, by + h * 0.45, tw);
      ctx.fillStyle = !unlocked ? "#8b90ac" : afford ? "#ffd76a" : "#ff8fa4";
      ctx.font = `700 ${Math.round(h * 0.23)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(unlocked ? `${cost}g  \u00b7  ${i + 1}` : "locked", bx + h * 0.9, by + h * 0.78, tw);
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

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hex(h) {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export default TowerDefenseGame;
