// ==========================================================================
// Citadel Wars 3D — tower defense on real terrain.
//
// The board is a height-mapped valley rendered in WebGL: the road winds
// through it at ground level while the buildable plots sit on plateaus of
// three different heights. Height is not decoration — a tower on a high
// plateau sees further, which is the whole reason to fight over the good
// ground instead of just carpeting the road.
//
// Clicks are turned into board coordinates by raycasting the camera ray
// against each plateau's own plane, so picking stays exact at any camera
// angle. The camera orbits with a drag (or Q/E), which is also why a build
// only fires on a press that did not turn into a drag.
//
// Like Bastion TD this is built to be ground: a run banks Crowns, and
// Crowns buy permanent upgrades that carry into the next attempt.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { MetaProgress, runReward } from "../systems/metaProgress.js";
import { clamp, randFloat, randInt } from "../core/utils.js";

const COLS = 15;
const ROWS = 11;
const TILE = 2.35;
const MAX_LEVEL = 10;
const STEP = 1.15;              // world height of one elevation step
const RALLY_TIME = 5;           // seconds of horn before a rally

// ------------------------------------------------------------- terrain -----
// The road, hand-drawn so it doubles back on itself and passes every corner
// of the valley. Everything not on this list is buildable ground.
const ROAD = [
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
  [4, 7], [4, 8], [5, 8], [6, 8], [7, 8], [7, 7], [7, 6], [7, 5], [7, 4],
  [7, 3], [7, 2], [8, 2], [9, 2], [10, 2], [10, 3], [10, 4], [10, 5],
  [10, 6], [10, 7], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
];

// Plateaus: [col, row, height-step]. Anything left out is flat ground (0).
// Height 2 plots are deliberately scarce and away from the road, so the
// range bonus has to be paid for with coverage.
const PLATEAUS = [
  [2, 4, 1], [3, 4, 1], [2, 5, 1], [3, 5, 1], [2, 6, 2], [3, 6, 1],
  [5, 4, 1], [6, 4, 2], [5, 5, 1], [6, 5, 1], [5, 6, 1], [6, 6, 1],
  [8, 4, 1], [9, 4, 1], [8, 5, 2], [9, 5, 1], [8, 6, 1], [9, 6, 1],
  [12, 4, 1], [13, 4, 1], [12, 5, 2], [13, 5, 1], [12, 6, 1], [13, 6, 1],
  [1, 0, 1], [2, 0, 1], [5, 0, 1], [6, 0, 1], [12, 1, 1], [13, 1, 1],
  [1, 9, 1], [2, 9, 1], [5, 10, 1], [6, 10, 1], [8, 10, 1], [9, 10, 1],
];

// ------------------------------------------------------------- towers ------
const TOWERS = {
  ballista: {
    name: "Ballista", cost: 55, color: "#ffd76a", accent: "#c9871c",
    dmg: 11, range: 6.4, rate: 0.66, shot: "bolt",
  },
  frost: {
    name: "Frost Spire", cost: 85, color: "#7ce8ff", accent: "#2f7fd6",
    dmg: 6, range: 5.6, rate: 0.9, shot: "shard", slow: 0.42, slowTime: 1.5,
  },
  pylon: {
    name: "Arc Pylon", cost: 120, color: "#c86bff", accent: "#5d2fa8",
    dmg: 9, range: 5.9, rate: 1.05, shot: "arc", chains: 2,
  },
  sunlance: {
    name: "Sunlance", cost: 190, color: "#ff8f4a", accent: "#a83610",
    dmg: 26, range: 8.6, rate: 1.5, shot: "beam", pierce: true, locked: true,
  },
};
const TOWER_KEYS = Object.keys(TOWERS);

function stat(t, key) {
  const base = TOWERS[t.type][key];
  const n = t.level - 1;
  if (key === "dmg") return base * Math.pow(1.32, n);
  if (key === "range") return base * (1 + n * 0.045);
  if (key === "rate") return base * Math.pow(0.945, n);
  return base;
}
const upgradeCost = (t) => Math.round(TOWERS[t.type].cost * 0.58 * Math.pow(1.31, t.level));

// ------------------------------------------------------------ enemies ------
const ENEMIES = {
  grunt:   { name: "Grunt",    hp: 30,  speed: 3.1, armour: 0, gold: 7,   score: 10,  r: 0.5,  body: "cube",   color: "#ff7a90", dark: "#7d1a2c", h: 1.0 },
  scout:   { name: "Scout",    hp: 21,  speed: 6.2, armour: 0, gold: 9,   score: 16,  r: 0.42, body: "cone",   color: "#ffd76a", dark: "#7d5a10", h: 0.9 },
  ogre:    { name: "Ogre",     hp: 118, speed: 2.1, armour: 6, gold: 22,  score: 36,  r: 0.8,  body: "cube",   color: "#8fa0c8", dark: "#2b3450", h: 1.5 },
  // Wyverns fly straight to the citadel — the road never slows them down.
  wyvern:  { name: "Wyvern",   hp: 52,  speed: 4.9, armour: 1, gold: 20,  score: 34,  r: 0.55, body: "wing",   color: "#7ce8ff", dark: "#1d5a80", h: 1.0, flying: true },
  shaman:  { name: "Shaman",   hp: 58,  speed: 2.9, armour: 2, gold: 24,  score: 40,  r: 0.55, body: "orb",    color: "#2ee6a6", dark: "#0c5540", h: 1.1, heal: 15, healRange: 5.2 },
  warden:  { name: "Warden",   hp: 76,  speed: 3.2, armour: 3, gold: 26,  score: 46,  r: 0.62, body: "cube",   color: "#c86bff", dark: "#421f6b", h: 1.2, shield: 64, shieldRegen: 14 },
  behemoth:{ name: "Behemoth", hp: 720, speed: 1.7, armour: 10, gold: 150, score: 320, r: 1.2, body: "cube",  color: "#ff4fd8", dark: "#5c0f45", h: 2.1, boss: true, splits: 5 },
};

function waveComposition(wave) {
  const pool = [];
  const add = (t, n) => { for (let i = 0; i < n; i++) pool.push(t); };
  add("grunt", 6 + Math.floor(wave * 0.85));
  if (wave >= 3) add("scout", 2 + Math.floor(wave * 0.45));
  if (wave >= 5) add("ogre", 1 + Math.floor((wave - 4) * 0.4));
  if (wave >= 7) add("wyvern", 1 + Math.floor((wave - 6) * 0.35));
  if (wave >= 9) add("shaman", 1 + Math.floor((wave - 8) * 0.25));
  if (wave >= 11) add("warden", 1 + Math.floor((wave - 10) * 0.3));
  if (wave % 5 === 0) add("behemoth", Math.max(1, Math.floor(wave / 10)));
  return pool;
}

// ------------------------------------------------------- meta upgrades -----
const META = new MetaProgress("citadel-wars-3d", {
  currency: "Crowns", icon: "👑",
  nodes: [
    { id: "gold",   name: "War Chest",      icon: "🪙", max: 10, desc: "Start every siege with more gold.",
      cost: (lv) => 45 + lv * 60, value: (lv) => lv * 38, prefix: "+", suffix: "" },
    { id: "keep",   name: "Curtain Wall",   icon: "🛡️", max: 10, desc: "The citadel holds against more breaches.",
      cost: (lv) => 60 + lv * 80, value: (lv) => lv * 2, prefix: "+", suffix: " HP" },
    { id: "dmg",    name: "Forged Heads",   icon: "🎯", max: 12, desc: "Every tower hits harder.",
      cost: (lv) => 55 + lv * 72, value: (lv) => lv * 0.06, suffix: "%" },
    { id: "range",  name: "Watch Towers",   icon: "🔭", max: 8,  desc: "Every tower sees further.",
      cost: (lv) => 70 + lv * 85, value: (lv) => lv * 0.035, suffix: "%" },
    { id: "income", name: "Tithe Collectors", icon: "⛏️", max: 10, desc: "Kills pay more gold.",
      cost: (lv) => 65 + lv * 85, value: (lv) => lv * 0.07, suffix: "%" },
    { id: "build",  name: "Master Masons",  icon: "🧱", max: 8,  desc: "Towers cost less to raise.",
      cost: (lv) => 80 + lv * 95, value: (lv) => lv * 0.035, suffix: "%" },
    { id: "yield",  name: "Royal Mint",     icon: "👑", max: 10, desc: "Runs bank more Crowns.",
      cost: (lv) => 110 + lv * 130, value: (lv) => lv * 0.1, suffix: "%" },
    { id: "lance",  name: "Sunlance Writ",  icon: "☀️", max: 1,  desc: "Unlocks the piercing, long-range Sunlance.",
      cost: () => 600, value: (lv) => lv, unlock: true },
  ],
});

export class CitadelWars3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getUpgrades() { return META; }
  getInstructions() {
    return [
      "Pick a tower from the bar, then click a green plot beside the road to raise it. Click a tower you own to upgrade it — up to level 10.",
      "The valley has three ground levels. A tower on a plateau sees further, so the high ground is worth fighting over.",
      "Wyverns fly straight over the road to the citadel, ogres are heavily armoured, shamans heal their escort and wardens regenerate a shield.",
      "Drag with the mouse (or two fingers) to orbit the camera; Q and E turn it as well.",
      "A siege banks Crowns based on how deep you got. Spend them on permanent upgrades before the next attempt.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tower in the bar, then tap a plot. Tap your own tower to upgrade it. Drag to orbit the camera."; }
  getKeyboardHint() { return "Click to build or upgrade, 1-4 pick a tower, Q/E orbit the camera, P pauses."; }

  // -------------------------------------------------------------- SETUP ---
  onInit() {
    if (!this.setup3D({
      clearColor: "#070b1c", fogColor: "#141c3d", fog: [46, 120],
      sky: "linear-gradient(#050818 0%, #16204a 38%, #40407e 66%, #b8657a 86%, #ffc79c 100%)",
      lightDir: [0.42, 0.86, 0.32], lightColor: "#fff2df",
      ambientSky: "#5f6ba8", ambientGround: "#1a1c30",
    })) return;

    const e = this.engine;
    e.mesh("cube", () => Geometry.box(1, 1, 1));
    e.mesh("ball", () => Geometry.sphere(0.5, 14, 10));
    e.mesh("cone", () => Geometry.cone(0.5, 1, 14));
    e.mesh("cyl", () => Geometry.cylinder(0.5, 1, 16));
    e.mesh("ring", () => Geometry.torus(0.62, 0.09, 22, 8));

    e.texture("grass",  () => Textures.rock(256, "#3f6b4a"));
    e.texture("stone",  () => Textures.rock(256, "#6b7290"));
    e.texture("road",   () => Textures.asphalt(256));
    e.texture("brick",  () => Textures.checker(128, "#c9c2ae", "#8a8271", 6));
    e.texture("metal",  () => Textures.metal(128, "#a6b2e0"));

    this.hud2d = this.overlay2D();
    this.selected = "ballista";
    this._buildBoard();
    this._buildTerrainMeshes(e);

    // Camera orbit: a press that never turns into a drag is a build click.
    this.camYaw = -Math.PI / 2;
    this.camPitch = 1.02;
    this.camDist = 34;
    this._drag = null;
    this.input.onPointer("down", (p) => { this._drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: 0 }; });
    this.input.onPointer("move", (p) => {
      this.hoverPx = { x: p.x, y: p.y };
      if (!this._drag) return;
      const dx = p.x - this._drag.x, dy = p.y - this._drag.y;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this._drag.moved > 10) {
        this.camYaw -= dx * 0.006;
        this.camPitch = clamp(this.camPitch - dy * 0.005, 0.55, 1.34);
        this._fitCamera();
      }
      this._drag.x = p.x; this._drag.y = p.y;
    });
    this.input.onPointer("up", (p) => {
      const d = this._drag;
      this._drag = null;
      if (d && d.moved <= 10) this._onClick(p.x ?? d.sx, p.y ?? d.sy);
    });

    this.input.onKey("KeyQ", () => { this.camYaw -= 0.22; });
    this.input.onKey("KeyE", () => { this.camYaw += 0.22; });
    TOWER_KEYS.forEach((k, i) => this.input.onKey(`Digit${i + 1}`, () => {
      if (this._unlocked(k)) { this.selected = k; audioManager.play("select"); }
    }));
  }

  _unlocked(key) { return !TOWERS[key].locked || META.level("lance") > 0; }

  /** Tile grid, elevation map, road polyline and the citadel, once. */
  _buildBoard() {
    this.roadSet = new Set(ROAD.map(([c, r]) => `${c},${r}`));
    this.height = {};
    for (const [c, r, h] of PLATEAUS) this.height[`${c},${r}`] = h;

    this.plots = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = `${c},${r}`;
        if (this.roadSet.has(key)) continue;
        // Keep the ring right around the citadel clear so the last stretch
        // never becomes a kill box you can trivially wall off.
        this.plots.push({ c, r, h: this.height[key] || 0, key });
      }
    }

    // Road polyline in world space, plus its total length for spawn pacing.
    this.pathPts = ROAD.map(([c, r]) => ({ x: this.wx(c), z: this.wz(r) }));
    this.pathLen = [0];
    for (let i = 1; i < this.pathPts.length; i++) {
      const a = this.pathPts[i - 1], b = this.pathPts[i];
      this.pathLen.push(this.pathLen[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.totalLen = this.pathLen[this.pathLen.length - 1];
    this.keepPos = this.pathPts[this.pathPts.length - 1];
    this.spawnPos = this.pathPts[0];
  }

  wx(c) { return (c - (COLS - 1) / 2) * TILE; }
  wz(r) { return (r - (ROWS - 1) / 2) * TILE; }
  hAt(c, r) { return (this.height[`${c},${r}`] || 0) * STEP; }

  /** World position at distance d along the road. */
  _onPath(d) {
    const total = this.totalLen;
    const dist = clamp(d, 0, total);
    let i = 1;
    while (i < this.pathLen.length - 1 && this.pathLen[i] < dist) i++;
    const a = this.pathPts[i - 1], b = this.pathPts[i];
    const seg = this.pathLen[i] - this.pathLen[i - 1] || 1;
    const t = (dist - this.pathLen[i - 1]) / seg;
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      dir: Math.atan2(b.x - a.x, b.z - a.z),
    };
  }

  onResize() { this._layoutBar(); this._fitCamera(); }

  _layoutBar() {
    this.barH = clamp((this.viewH || 400) * 0.15, 54, 86);
  }

  /**
   * Pulls the camera back far enough that the whole valley fits, on whatever
   * aspect the stage happens to be. Without this a phone in portrait sees a
   * third of the board and a wide monitor sees it swimming in empty sky.
   */
  _fitCamera() {
    const bw = COLS * TILE + 5, bd = ROWS * TILE + 5;
    const aspect = (this.viewW || 16) / (this.viewH || 9);
    const t = Math.tan((this.engine?.camera.fov ?? 60) * Math.PI / 360);
    // The board is viewed at an angle, so its on-screen height is the depth
    // foreshortened by the pitch plus the height the plateaus stand up.
    const shown = bd * Math.sin(this.camPitch ?? 1) + 4;
    this.camDist = Math.max(bw / (2 * aspect * t), shown / (2 * t)) * 1.12;
    this.camDist = clamp(this.camDist, 24, 70);
  }

  // -------------------------------------------------------------- START ---
  onStart(difficulty) {
    if (!this.canPlay) return;
    this._layoutBar();
    this._fitCamera();
    const cfg = {
      Easy:   { hpMul: 0.8,  speedMul: 0.9,  gold: 280, keep: 24, reward: 1.2, crown: 0.85 },
      Normal: { hpMul: 1.0,  speedMul: 1.0,  gold: 225, keep: 18, reward: 1.0, crown: 1.0 },
      Hard:   { hpMul: 1.32, speedMul: 1.12, gold: 190, keep: 14, reward: 0.92, crown: 1.35 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.gold = cfg.gold + META.value("gold");
    this.maxKeep = cfg.keep + META.value("keep");
    this.keep = this.maxKeep;
    this.dmgMul = 1 + META.value("dmg");
    this.rangeMul = 1 + META.value("range");
    this.goldMul = cfg.reward * (1 + META.value("income"));
    this.costMul = 1 - META.value("build");

    this.towers = [];
    this.enemies = [];
    this.shots = [];
    this.beams = [];
    this.floaters = [];
    this.wave = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.waveTimer = RALLY_TIME;
    this.betweenWaves = true;
    this.queue = [];
    this.keepFlash = 0;
    this.selected = this._unlocked(this.selected) ? this.selected : "ballista";
    this.hovered = null;
    this.setScore(0);
    this._updateHud();
  }

  _cost(key) { return Math.round(TOWERS[key].cost * this.costMul); }

  _updateHud() {
    this.setHud({
      Gold: Math.floor(this.gold),
      Keep: `${Math.max(0, this.keep)}/${this.maxKeep}`,
      Wave: this.betweenWaves ? `${this.wave + 1} in ${Math.max(0, Math.ceil(this.waveTimer))}s` : this.wave,
      Score: this.score,
    });
  }

  // -------------------------------------------------------------- INPUT ---
  /**
   * Picks the board tile under a pixel. Each elevation level is its own
   * horizontal plane, so the ray is tested against all three (tallest first)
   * and the first hit that actually lands on a tile of that height wins —
   * otherwise a click on a plateau top would resolve to the ground behind it.
   */
  _tileAt(px, py) {
    for (const step of [2, 1, 0]) {
      const p = this.engine.pickGround(px, py, this.viewW, this.viewH, step * STEP);
      if (!p) continue;
      const c = Math.round(p.x / TILE + (COLS - 1) / 2);
      const r = Math.round(p.z / TILE + (ROWS - 1) / 2);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      if ((this.height[`${c},${r}`] || 0) !== step) continue;
      // Reject a hit that lands in the gutter between two tiles.
      if (Math.abs(p.x - this.wx(c)) > TILE * 0.52 || Math.abs(p.z - this.wz(r)) > TILE * 0.52) continue;
      return { c, r, h: step };
    }
    return null;
  }

  _onClick(px, py) {
    if (this.state !== "playing") return;

    if (py > this.viewH - this.barH) {
      const i = this._paletteHit(px, py);
      if (i >= 0 && this._unlocked(TOWER_KEYS[i])) { this.selected = TOWER_KEYS[i]; audioManager.play("select"); }
      else if (i >= 0) { audioManager.play("error"); this._float(this.keepPos, 0, "Locked — buy the Sunlance Writ", "#ff8fa4"); }
      return;
    }

    const tile = this._tileAt(px, py);
    if (!tile) return;
    const existing = this.towers.find(t => t.c === tile.c && t.r === tile.r);
    if (existing) return this._upgrade(existing);
    if (this.roadSet.has(`${tile.c},${tile.r}`)) {
      audioManager.play("error");
      this._float({ x: this.wx(tile.c), z: this.wz(tile.r) }, 0.4, "Not on the road", "#ff8fa4");
      return;
    }

    const cost = this._cost(this.selected);
    if (this.gold < cost) {
      audioManager.play("error");
      this._float({ x: this.wx(tile.c), z: this.wz(tile.r) }, tile.h * STEP, `${cost}g needed`, "#ff8fa4");
      return;
    }
    this.gold -= cost;
    this.towers.push({
      c: tile.c, r: tile.r, h: tile.h, type: this.selected, level: 1,
      cooldown: 0, angle: 0, flash: 0, built: 0.4, spin: randFloat(0, 6.3),
    });
    audioManager.play("toggle");
    this._updateHud();
  }

  _upgrade(t) {
    if (t.level >= MAX_LEVEL) {
      audioManager.play("error");
      this._float({ x: this.wx(t.c), z: this.wz(t.r) }, t.h * STEP + 1.6, "MAX", "#ffd76a");
      return;
    }
    const cost = Math.round(upgradeCost(t) * this.costMul);
    if (this.gold < cost) {
      audioManager.play("error");
      this._float({ x: this.wx(t.c), z: this.wz(t.r) }, t.h * STEP + 1.6, `${cost}g needed`, "#ff8fa4");
      return;
    }
    this.gold -= cost;
    t.level++;
    t.built = 0.4;
    audioManager.play("coin");
    this._float({ x: this.wx(t.c), z: this.wz(t.r) }, t.h * STEP + 1.6, `Lv ${t.level}`, TOWERS[t.type].color);
    this._updateHud();
  }

  _float(pos, y, text, color) {
    this.floaters.push({ x: pos.x, y: y + 1.2, z: pos.z, text, color, t: 0, life: 1.05 });
  }

  _paletteMetrics() {
    const h = this.barH - 12;
    const slots = TOWER_KEYS.length;
    const w = Math.min(150, (this.viewW - 26) / slots - 8);
    return { w, gap: 8, y0: this.viewH - this.barH + 6, h, slots };
  }
  _paletteHit(px, py) {
    const { w, gap, y0, h, slots } = this._paletteMetrics();
    const total = slots * w + (slots - 1) * gap;
    const x0 = (this.viewW - total) / 2;
    if (py < y0 || py > y0 + h) return -1;
    for (let i = 0; i < slots; i++) {
      const bx = x0 + i * (w + gap);
      if (px >= bx && px <= bx + w) return i;
    }
    return -1;
  }

  // -------------------------------------------------------------- WAVES ---
  _spawnWave() {
    this.wave += 1;
    const pool = waveComposition(this.wave);
    const hpMul = this.cfg.hpMul * (1 + this.wave * 0.3);
    const speedMul = this.cfg.speedMul * (1 + Math.min(0.35, this.wave * 0.012));
    let delay = 0;
    this.queue = pool.map((type) => {
      delay += ENEMIES[type].boss ? 1.2 : randFloat(0.26, 0.46);
      return { type, hpMul, speedMul, at: delay };
    });
    audioManager.play("levelup");
  }

  _spawn(type, hpMul, speedMul, dist = 0) {
    const spec = ENEMIES[type];
    const hp = spec.hp * hpMul;
    this.enemies.push({
      type, spec, hp, maxHp: hp,
      speed: spec.speed * speedMul,
      armour: spec.armour,
      shield: spec.shield ? spec.shield * hpMul : 0,
      maxShield: spec.shield ? spec.shield * hpMul : 0,
      d: dist,
      // Flyers ignore the road and cut straight across the valley.
      fx: spec.flying ? this.spawnPos.x : 0,
      fz: spec.flying ? this.spawnPos.z : 0,
      x: this.spawnPos.x, z: this.spawnPos.z, y: spec.flying ? 3.2 : 0,
      angle: 0, slow: 0, slowT: 0, hitFlash: 0, pulse: 0,
      bob: randFloat(0, 6.3), healCd: randFloat(0.3, 2), shieldCd: 0,
      lane: randFloat(-0.42, 0.42),
    });
  }

  // ------------------------------------------------------------- UPDATE ---
  onUpdate(dt) {
    if (!this.canPlay) return;
    this.elapsed += dt;
    if (this.keepFlash > 0) this.keepFlash -= dt;

    if (this.betweenWaves) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this._spawnWave(); this.betweenWaves = false; }
    }
    // Drip the queued wave onto the road.
    if (this.queue.length) {
      const t = this.elapsed;
      if (this._queueStart === undefined || this._queueWave !== this.wave) { this._queueStart = t; this._queueWave = this.wave; }
      while (this.queue.length && t - this._queueStart >= this.queue[0].at) {
        const q = this.queue.shift();
        this._spawn(q.type, q.hpMul, q.speedMul);
      }
    }

    this._moveEnemies(dt);
    this._abilities(dt);
    this._fireTowers(dt);
    this._moveShots(dt);

    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t += dt; if (this.beams[i].t > 0.18) this.beams.splice(i, 1); }
    for (let i = this.floaters.length - 1; i >= 0; i--) { this.floaters[i].t += dt; if (this.floaters[i].t >= this.floaters[i].life) this.floaters.splice(i, 1); }
    for (const t of this.towers) { if (t.flash > 0) t.flash -= dt; if (t.built > 0) t.built -= dt; t.spin += dt * 0.7; }

    if (this.keep <= 0) return this._gameOver();
    if (!this.betweenWaves && !this.queue.length && this.enemies.length === 0) {
      this.betweenWaves = true;
      this.waveTimer = Math.max(2.5, RALLY_TIME - this.wave * 0.14);
      const bonus = Math.round((32 + this.wave * 8) * this.goldMul);
      this.gold += bonus;
      this._float(this.keepPos, 2.6, `Wave ${this.wave} held  +${bonus}g`, "#ffd76a");
      audioManager.play("win");
    }

    this._moveCamera(dt);
    this._updateHud();
  }

  _moveCamera(dt) {
    // A slow idle drift keeps the valley reading as 3D even when the player
    // never touches the camera.
    if (!this._drag) this.camYaw += dt * 0.035;
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    this.engine.camera.pos = [cy * cp * this.camDist, sp * this.camDist, sy * cp * this.camDist];
    this.engine.camera.target = [0, 1.2, 0];
  }

  _moveEnemies(dt) {
    const reached = [];
    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.pulse > 0) e.pulse -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      e.bob += dt * 6;
      const v = e.speed * (1 - e.slow) * dt;

      if (e.spec.flying) {
        const dx = this.keepPos.x - e.fx, dz = this.keepPos.z - e.fz;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) { reached.push(e); continue; }
        e.fx += (dx / d) * v; e.fz += (dz / d) * v;
        e.x = e.fx; e.z = e.fz;
        e.y = 3.2 + Math.sin(e.bob * 0.6) * 0.35;
        e.angle = Math.atan2(dx, dz);
      } else {
        e.d += v;
        if (e.d >= this.totalLen) { reached.push(e); continue; }
        const p = this._onPath(e.d);
        // Spread walkers across the width of the road instead of stacking
        // them into a single file.
        e.x = p.x + Math.cos(p.dir) * e.lane * TILE;
        e.z = p.z - Math.sin(p.dir) * e.lane * TILE;
        e.y = Math.abs(Math.sin(e.bob)) * 0.11;
        e.angle = p.dir;
      }
    }
    for (const e of reached) {
      this.keep -= e.spec.boss ? 5 : 1;
      this.keepFlash = 0.4;
      this.shake();
      audioManager.play("error");
    }
    if (reached.length) this.enemies = this.enemies.filter(e => !reached.includes(e));
  }

  _abilities(dt) {
    for (const e of this.enemies) {
      if (e.maxShield) {
        e.shieldCd = Math.max(0, e.shieldCd - dt);
        if (e.shieldCd === 0 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.spec.shieldRegen * dt);
      }
      if (!e.spec.heal) continue;
      e.healCd -= dt;
      if (e.healCd > 0) continue;
      e.healCd = 2.2;
      let n = 0;
      for (const o of this.enemies) {
        if (o === e || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) > e.spec.healRange) continue;
        o.hp = Math.min(o.maxHp, o.hp + e.spec.heal);
        n++;
      }
      if (n) { e.pulse = 0.45; this._float(e, e.spec.h, `+${e.spec.heal}`, "#2ee6a6"); }
    }
  }

  _towerPos(t) {
    return { x: this.wx(t.c), y: t.h * STEP, z: this.wz(t.r) };
  }

  /** Height is range: a plateau tower reaches noticeably further. */
  _range(t) {
    return stat(t, "range") * this.rangeMul * (1 + t.h * 0.12);
  }

  _fireTowers(dt) {
    for (const t of this.towers) {
      t.cooldown -= dt;
      const pos = this._towerPos(t);
      const range = this._range(t);

      let target = null, bestKey = -Infinity;
      for (const e of this.enemies) {
        if (Math.hypot(e.x - pos.x, e.z - pos.z) > range) continue;
        // Shamans first — they undo the whole line's work — then whoever is
        // furthest along the road.
        const key = (e.spec.heal ? 1e6 : 0) + (e.spec.flying ? e.spec.speed * 10 : e.d);
        if (key > bestKey) { bestKey = key; target = e; }
      }
      if (target) t.angle = Math.atan2(target.x - pos.x, target.z - pos.z);
      if (!target || t.cooldown > 0) continue;

      t.cooldown = stat(t, "rate");
      t.flash = 0.1;
      const dmg = stat(t, "dmg") * this.dmgMul;
      const spec = TOWERS[t.type];
      const muzzle = { x: pos.x, y: pos.y + 1.55 + t.level * 0.045, z: pos.z };

      if (spec.shot === "arc") {
        this._chain(muzzle, target, dmg, spec.chains, range);
        audioManager.play("hover");
      } else if (spec.shot === "beam") {
        this._beam(t, muzzle, target, dmg, range);
        audioManager.play("shoot");
      } else {
        this.shots.push({
          x: muzzle.x, y: muzzle.y, z: muzzle.z, target, dmg,
          speed: spec.shot === "shard" ? 26 : 34, kind: spec.shot,
          color: spec.color, slow: spec.slow, slowTime: spec.slowTime, life: 2.2,
        });
        audioManager.play("shoot");
      }
    }
  }

  _chain(from, target, dmg, chains, range) {
    let cur = target, prev = from, power = dmg;
    const hit = new Set();
    for (let i = 0; i <= chains && cur; i++) {
      this.beams.push({ a: { ...prev }, b: { x: cur.x, y: cur.y + cur.spec.h * 0.5, z: cur.z }, t: 0, color: "#c86bff" });
      this._damage(cur, power);
      hit.add(cur);
      prev = { x: cur.x, y: cur.y + cur.spec.h * 0.5, z: cur.z };
      power *= 0.62;
      let next = null, nd = 4.4;
      for (const e of this.enemies) {
        if (hit.has(e) || e.hp <= 0) continue;
        const d = Math.hypot(e.x - cur.x, e.z - cur.z);
        if (d < nd) { nd = d; next = e; }
      }
      cur = next;
    }
  }

  _beam(t, muzzle, target, dmg, range) {
    // The Sunlance burns everything on the line out to its range.
    const dx = Math.sin(t.angle), dz = Math.cos(t.angle);
    const end = { x: muzzle.x + dx * range, y: muzzle.y, z: muzzle.z + dz * range };
    this.beams.push({ a: { ...muzzle }, b: end, t: 0, color: "#ff8f4a", wide: true });
    for (const e of this.enemies) {
      const ex = e.x - muzzle.x, ez = e.z - muzzle.z;
      const along = ex * dx + ez * dz;
      if (along < 0 || along > range) continue;
      const off = Math.abs(ex * dz - ez * dx);
      if (off > 0.85 + e.spec.r) continue;
      this._damage(e, dmg);
    }
  }

  _moveShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      const tgt = s.target;
      if (s.life <= 0 || !tgt || tgt.hp <= 0 || !this.enemies.includes(tgt)) { this.shots.splice(i, 1); continue; }
      const ty = tgt.y + tgt.spec.h * 0.5;
      const dx = tgt.x - s.x, dy = ty - s.y, dz = tgt.z - s.z;
      const d = Math.hypot(dx, dy, dz);
      const step = s.speed * dt;
      if (d <= step) {
        this._damage(tgt, s.dmg);
        if (s.slow) { tgt.slow = Math.max(tgt.slow, s.slow); tgt.slowT = s.slowTime; }
        this.shots.splice(i, 1);
        continue;
      }
      s.x += (dx / d) * step; s.y += (dy / d) * step; s.z += (dz / d) * step;
      s.angle = Math.atan2(dx, dz);
    }
  }

  _damage(e, dmg) {
    // Armour is flat mitigation with a floor, so an armoured target is worth
    // fewer, bigger hits rather than a hail of small ones.
    let left = Math.max(dmg * 0.22, dmg - e.armour);
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, left);
      e.shield -= absorbed;
      left -= absorbed;
      e.shieldCd = 2.6;
    }
    e.hp -= left;
    e.hitFlash = 0.12;
    if (e.hp > 0) return;
    this._kill(e);
  }

  _kill(e) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.enemies.splice(i, 1);
    this.kills++;
    const gold = Math.round(e.spec.gold * this.goldMul);
    this.gold += gold;
    this.addScore(e.spec.score);
    this._float(e, e.spec.h, `+${gold}g`, "#ffd76a");
    audioManager.play("pop");

    // A behemoth does not simply die — it comes apart into a pack of grunts.
    if (e.spec.splits) {
      const hpMul = this.cfg.hpMul * (1 + this.wave * 0.3);
      for (let n = 0; n < e.spec.splits; n++) {
        this._spawn("grunt", hpMul * 0.9, this.cfg.speedMul, Math.max(0, e.d - n * 0.7));
      }
    }
  }

  _gameOver() {
    audioManager.play("gameover");
    const crowns = Math.round(runReward({ wave: this.wave, kills: this.kills }) * this.cfg.crown * (1 + META.value("yield")));
    META.award(crowns);
    this.endGame({
      result: "loss", score: this.score,
      message: `The citadel fell on wave ${this.wave}. Banked ${crowns} Crowns.`,
      extraStats: [
        { label: "Wave", value: this.wave },
        { label: "Kills", value: this.kills },
        { label: "Crowns", value: `\u{1F451} ${crowns}` },
      ],
    });
  }

  // ------------------------------------------------------------- RENDER ---
  onRender(ctx, dt) {
    if (!this.canPlay) return;
    const e = this.engine;
    e.beginFrame();
    this._drawTerrain(e);
    this._drawKeep(e);
    this._drawTowers(e);
    this._drawEnemies(e);
    this._drawShots(e);
    this._drawOverlay();
  }

  /**
   * The valley is 165 tiles. Drawn one box at a time that is ~200 draw calls
   * a frame for geometry that never moves, so every static tile is baked into
   * one merged mesh per material at load and the whole floor costs five calls.
   * Only the handful of tiles that change — the one under the cursor and the
   * ones carrying a tower — are still drawn individually, on top.
   */
  _buildTerrainMeshes(e) {
    const groups = { road: [], flat: [], mid: [], high: [], flank: [] };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = `${c},${r}`;
        const h = this.height[key] || 0;
        const y = h * STEP;
        if (this.roadSet.has(key)) {
          groups.road.push({ pos: [this.wx(c), -0.06, this.wz(r)], scale: [TILE, 0.16, TILE] });
          continue;
        }
        if (h > 0) groups.flank.push({ pos: [this.wx(c), y / 2 - 0.1, this.wz(r)], scale: [TILE, y + 0.2, TILE] });
        const cap = { pos: [this.wx(c), y + 0.045, this.wz(r)], scale: [TILE * 0.9, 0.1, TILE * 0.9] };
        (h === 2 ? groups.high : h === 1 ? groups.mid : groups.flat).push(cap);
      }
    }
    for (const [name, boxes] of Object.entries(groups)) {
      e.mesh(`terrain_${name}`, () => mergeBoxes(boxes));
    }
  }

  _drawTerrain(e) {
    // Ground slab under everything, so the valley never shows a hole.
    e.draw("cube", {
      pos: [0, -0.62, 0], scale: [COLS * TILE + 6, 1, ROWS * TILE + 6],
      color: "#22301f", texture: "grass", uvScale: [COLS, ROWS],
    });

    e.draw("terrain_road",  { color: "#5c5346", texture: "road" });
    e.draw("terrain_flank", { color: "#7a83a6", texture: "stone" });
    e.draw("terrain_flat",  { color: "#3f6b4a", texture: "grass" });
    e.draw("terrain_mid",   { color: "#4c7350", texture: "grass" });
    e.draw("terrain_high",  { color: "#5c7f5e", texture: "grass" });

    // Overrides: a tower's plot is darkened and the hovered plot lights up.
    // Lifted a hair so they win the depth test against the baked cap.
    for (const t of this.towers) {
      e.draw("cube", {
        pos: [this.wx(t.c), t.h * STEP + 0.055, this.wz(t.r)], scale: [TILE * 0.9, 0.1, TILE * 0.9],
        color: "#3d4a63", texture: "grass",
      });
    }
    const hv = this.hovered;
    if (hv && !this.towers.some(t => t.c === hv.c && t.r === hv.r) && !this.roadSet.has(`${hv.c},${hv.r}`)) {
      e.draw("cube", {
        pos: [this.wx(hv.c), hv.h * STEP + 0.055, this.wz(hv.r)], scale: [TILE * 0.9, 0.1, TILE * 0.9],
        color: "#8ef0c0", texture: "grass", emissive: 0.35,
      });
    }

    // Spawn arch, so it is obvious where the raiders come from.
    const s = this.spawnPos;
    for (const off of [-1.1, 1.1]) {
      e.draw("cube", { pos: [s.x - 1.4, 1.1, s.z + off], scale: [0.5, 2.2, 0.5], color: "#7d2436", texture: "stone" });
    }
    e.draw("cube", { pos: [s.x - 1.4, 2.3, s.z], scale: [0.5, 0.4, 2.9], color: "#a33049", emissive: 0.25 });
  }

  _drawKeep(e) {
    const k = this.keepPos;
    const pct = clamp(this.keep / this.maxKeep, 0, 1);
    const hurt = this.keepFlash > 0;
    e.draw("cube", { pos: [k.x + 1.6, 0.9, k.z], scale: [3.4, 1.8, 4.4], color: hurt ? "#ff8fa4" : "#b9b09a", texture: "brick", uvScale: [2, 1] });
    e.draw("cube", { pos: [k.x + 1.6, 2.15, k.z], scale: [2.6, 0.7, 3.4], color: "#cfc6ad", texture: "brick" });
    for (const dz of [-1.7, 1.7]) {
      e.draw("cyl", { pos: [k.x + 0.2, 1.5, k.z + dz], scale: [1.05, 3, 1.05], color: "#cfc6ad", texture: "brick" });
      e.draw("cone", { pos: [k.x + 0.2, 3.5, k.z + dz], scale: [1.35, 1.3, 1.35], color: "#3f5fa8" });
    }
    // Banner: its height is the remaining keep, which reads at a glance.
    e.draw("cube", {
      pos: [k.x + 1.6, 2.9 + pct * 0.6, k.z], scale: [0.16, 0.4 + pct * 1.2, 1.2],
      color: pct > 0.5 ? "#2ee6a6" : pct > 0.25 ? "#ffd76a" : "#ff5470", emissive: 0.5,
    });
    e.shadow(k.x + 1.6, k.z, 3.6, { y: 0.12, alpha: 0.3 });
  }

  _drawTowers(e) {
    for (const t of this.towers) {
      const spec = TOWERS[t.type];
      const p = this._towerPos(t);
      const grow = t.built > 0 ? 1 - t.built / 0.4 * 0.35 : 1;
      const lift = 1 + (t.level - 1) * 0.055;

      e.shadow(p.x, p.z, 0.85, { y: p.y + 0.11, alpha: 0.32 });
      e.draw("cyl", { pos: [p.x, p.y + 0.24 * grow, p.z], scale: [1.5, 0.48 * grow, 1.5], color: "#7b8298", texture: "stone" });
      e.draw("cube", {
        pos: [p.x, p.y + (0.5 + 0.42 * lift) * grow, p.z], rot: [0, t.angle, 0],
        scale: [1.05, 0.9 * lift * grow, 1.05], color: "#9aa3bd", texture: "brick",
      });

      // The head, which is what actually tells the towers apart at a glance.
      const hy = p.y + (0.95 + 0.85 * lift) * grow;
      if (t.type === "ballista") {
        e.draw("cube", { pos: [p.x, hy, p.z], rot: [0, t.angle, 0], scale: [0.95, 0.34, 1.5], color: "#6b4b2a", texture: "metal" });
        e.draw("cube", { pos: [p.x, hy + 0.3, p.z], rot: [0, t.angle, 0], scale: [1.9, 0.16, 0.18], color: spec.color, emissive: t.flash > 0 ? 0.9 : 0.15 });
      } else if (t.type === "frost") {
        e.draw("cone", { pos: [p.x, hy + 0.45, p.z], rot: [0, t.spin, 0], scale: [1.1, 1.5, 1.1], color: spec.color, emissive: 0.35 + (t.flash > 0 ? 0.5 : 0), alpha: 0.92 });
        e.draw("ring", { pos: [p.x, hy + 0.1, p.z], rot: [Math.PI / 2, t.spin * 1.6, 0], scale: [1.5, 1.5, 1.5], color: "#bff2ff", emissive: 0.5 });
      } else if (t.type === "pylon") {
        e.draw("cyl", { pos: [p.x, hy + 0.35, p.z], scale: [0.34, 1.3, 0.34], color: "#4a3f6e", texture: "metal" });
        e.draw("ball", { pos: [p.x, hy + 1.05, p.z], scale: [0.78, 0.78, 0.78], color: spec.color, emissive: 0.55 + (t.flash > 0 ? 0.45 : 0) });
      } else {
        e.draw("cyl", { pos: [p.x, hy + 0.2, p.z], rot: [0, t.angle, 0], scale: [0.5, 1, 0.5], color: "#c8935a", texture: "metal" });
        e.draw("cube", { pos: [p.x + Math.sin(t.angle) * 0.7, hy + 0.5, p.z + Math.cos(t.angle) * 0.7], rot: [0, t.angle, 0], scale: [0.34, 0.34, 1.5], color: spec.color, emissive: 0.4 + (t.flash > 0 ? 0.6 : 0) });
      }

      // Level pips as a stack of studs — no text needed in the 3D layer.
      for (let i = 0; i < t.level; i++) {
        const a = (i / MAX_LEVEL) * Math.PI * 2 + t.spin * 0.2;
        e.draw("cube", {
          pos: [p.x + Math.cos(a) * 0.72, p.y + 0.56, p.z + Math.sin(a) * 0.72],
          scale: [0.13, 0.13, 0.13], color: spec.color, emissive: 0.7,
        });
      }
    }
  }

  _drawEnemies(e) {
    for (const en of this.enemies) {
      const s = en.spec;
      const hurt = en.hitFlash > 0;
      const col = hurt ? "#ffffff" : s.color;
      const y = en.y + s.h * 0.5;

      if (!s.flying) e.shadow(en.x, en.z, s.r * 1.5, { y: 0.09, alpha: 0.3 });

      if (s.body === "cone") {
        e.draw("cone", { pos: [en.x, en.y, en.z], rot: [0, en.angle, 0], scale: [s.r * 2.1, s.h * 1.3, s.r * 2.1], color: col });
      } else if (s.body === "orb") {
        e.draw("ball", { pos: [en.x, y + 0.2, en.z], scale: [s.r * 2, s.r * 2, s.r * 2], color: col, emissive: 0.3 + (en.pulse > 0 ? 0.5 : 0) });
        e.draw("ring", { pos: [en.x, y - 0.35, en.z], rot: [Math.PI / 2, en.bob * 0.4, 0], scale: [s.r * 3.2, 1, s.r * 3.2], color: "#2ee6a6", emissive: 0.6 });
      } else if (s.body === "wing") {
        e.draw("ball", { pos: [en.x, y, en.z], rot: [0, en.angle, 0], scale: [s.r * 1.7, s.r * 1.5, s.r * 2.6], color: col });
        const flap = Math.sin(en.bob * 2) * 0.55;
        for (const sgn of [-1, 1]) {
          e.draw("cube", {
            pos: [en.x + Math.cos(en.angle) * sgn * s.r * 1.5, y + flap * 0.3, en.z - Math.sin(en.angle) * sgn * s.r * 1.5],
            rot: [0, en.angle, flap * sgn], scale: [s.r * 2.6, 0.08, s.r * 1.3], color: s.dark,
          });
        }
      } else {
        // The workhorse body: a torso that squashes as it walks, plus a head.
        const gait = 1 + Math.sin(en.bob) * 0.07;
        e.draw("cube", {
          pos: [en.x, en.y + s.h * 0.45 * gait, en.z], rot: [0, en.angle, 0],
          scale: [s.r * 1.9, s.h * 0.9 * gait, s.r * 1.6], color: col, texture: s.boss ? "metal" : null,
        });
        e.draw("ball", {
          pos: [en.x, en.y + s.h * 1.02, en.z], scale: [s.r * 1.15, s.r * 1.15, s.r * 1.15],
          color: hurt ? "#ffffff" : s.dark,
        });
        if (s.armour >= 5) {
          e.draw("cube", {
            pos: [en.x, en.y + s.h * 0.62, en.z], rot: [0, en.angle, 0],
            scale: [s.r * 2.2, s.h * 0.28, s.r * 1.9], color: "#c3ccea", texture: "metal", emissive: 0.1,
          });
        }
      }

      if (en.shield > 0) {
        e.draw("ball", {
          pos: [en.x, y + 0.1, en.z], scale: [s.r * 3.1, s.h * 1.9, s.r * 3.1],
          color: "#c86bff", emissive: 0.4, alpha: 0.2 + 0.2 * (en.shield / en.maxShield),
        });
      }
      if (en.slow > 0) {
        e.draw("ring", { pos: [en.x, en.y + 0.08, en.z], rot: [Math.PI / 2, 0, 0], scale: [s.r * 3.4, 1, s.r * 3.4], color: "#7ce8ff", emissive: 0.6, alpha: 0.75 });
      }
    }
  }

  _drawShots(e) {
    for (const s of this.shots) {
      if (s.kind === "shard") {
        e.draw("cone", { pos: [s.x, s.y, s.z], rot: [Math.PI, s.angle || 0, 0], scale: [0.3, 0.55, 0.3], color: s.color, emissive: 0.8 });
      } else {
        e.draw("cube", { pos: [s.x, s.y, s.z], rot: [0, s.angle || 0, 0], scale: [0.13, 0.13, 0.72], color: s.color, emissive: 0.85 });
      }
    }
  }

  // ------------------------------------------------ 2D overlay on top -----
  _drawOverlay() {
    const ctx = this.hud2d;
    if (!ctx) return;
    const W = this.viewW, H = this.viewH;
    ctx.clearRect(0, 0, W, H);

    const proj = (x, y, z) => this.engine.project([x, y, z], W, H);

    // Health bars, only where they carry information.
    for (const en of this.enemies) {
      if (en.hp >= en.maxHp && !en.maxShield) continue;
      const p = proj(en.x, en.y + en.spec.h * 1.5, en.z);
      if (!p.visible) continue;
      const w = clamp(46 / Math.max(1, p.depth / 26), 22, 54);
      const h = 4.5;
      const x = p.x - w / 2, y = p.y;
      ctx.fillStyle = "rgba(4,7,18,0.72)";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = en.spec.boss ? "#ff4fd8" : "#2ee6a6";
      ctx.fillRect(x, y, w * clamp(en.hp / en.maxHp, 0, 1), h);
      if (en.shield > 0) {
        ctx.fillStyle = "#c86bff";
        ctx.fillRect(x, y - 3.5, w * clamp(en.shield / en.maxShield, 0, 1), 2.6);
      }
    }

    // Beams are drawn here rather than as geometry: a screen-space line is
    // exactly one stroke, and it never z-fights with the terrain.
    for (const b of this.beams) {
      const a = proj(b.a.x, b.a.y, b.a.z), c = proj(b.b.x, b.b.y, b.b.z);
      if (!a.visible || !c.visible) continue;
      const fade = 1 - b.t / 0.18;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.wide ? 6 : 2.4;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.restore();
    }

    // Range ring for the tower under the cursor, or for the plot about to
    // be built on — the single most useful thing to show while placing.
    if (this.hoverPx && this.state === "playing" && this.hoverPx.y < H - this.barH) {
      const tile = this._tileAt(this.hoverPx.x, this.hoverPx.y);
      this.hovered = tile;
      if (tile) {
        const own = this.towers.find(t => t.c === tile.c && t.r === tile.r);
        const range = own
          ? this._range(own)
          : TOWERS[this.selected].range * this.rangeMul * (1 + tile.h * 0.12);
        this._strokeRing(ctx, this.wx(tile.c), tile.h * STEP + 0.1, this.wz(tile.r), range,
          own ? TOWERS[own.type].color : this.roadSet.has(`${tile.c},${tile.r}`) ? "#ff5470" : TOWERS[this.selected].color);
      }
    } else {
      this.hovered = null;
    }

    for (const f of this.floaters) {
      const p = proj(f.x, f.y + f.t * 1.4, f.z);
      if (!p.visible) continue;
      ctx.save();
      ctx.globalAlpha = 1 - f.t / f.life;
      ctx.font = "800 14px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(4,7,18,0.85)";
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
      ctx.restore();
    }

    if (this.betweenWaves) {
      ctx.save();
      ctx.font = "800 15px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,215,106,0.92)";
      ctx.fillText(`WAVE ${this.wave + 1} RALLYING — ${Math.max(0, Math.ceil(this.waveTimer))}s`, W / 2, 26);
      ctx.restore();
    }

    this._drawPalette(ctx);
  }

  /** A world-space circle, projected point by point onto the overlay. */
  _strokeRing(ctx, cx, cy, cz, radius, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const p = this.engine.project([cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius], this.viewW, this.viewH);
      if (!p.visible) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawPalette(ctx) {
    const { w, gap, y0, h, slots } = this._paletteMetrics();
    const total = slots * w + (slots - 1) * gap;
    const x0 = (this.viewW - total) / 2;

    TOWER_KEYS.forEach((key, i) => {
      const spec = TOWERS[key];
      const bx = x0 + i * (w + gap);
      const active = this.selected === key;
      const unlocked = this._unlocked(key);
      const cost = this._cost(key);
      const afford = unlocked && this.gold >= cost;

      ctx.fillStyle = active ? "rgba(255,255,255,0.13)" : "rgba(8,12,28,0.76)";
      roundRect(ctx, bx, y0, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = active ? spec.color : "rgba(255,255,255,0.14)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      const ix = bx + h * 0.46, iy = y0 + h * 0.5, ir = h * 0.23;
      const g = ctx.createRadialGradient(ix - ir * 0.3, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, spec.color);
      g.addColorStop(1, spec.accent);
      ctx.globalAlpha = unlocked ? 1 : 0.32;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();

      const tw = Math.max(20, w - h * 0.85 - 8);
      ctx.fillStyle = "#eef1ff";
      ctx.font = `700 ${Math.round(h * 0.24)}px 'Sora', system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(spec.name, bx + h * 0.85, y0 + h * 0.45, tw);
      ctx.fillStyle = !unlocked ? "#8b90ac" : afford ? "#ffd76a" : "#ff8fa4";
      ctx.font = `700 ${Math.round(h * 0.21)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(unlocked ? `${cost}g  ·  ${i + 1}` : "locked", bx + h * 0.85, y0 + h * 0.78, tw);
      ctx.globalAlpha = 1;
    });
  }
}

// ---------------------------------------------------------------- helpers --
/** Bakes a list of {pos, scale} axis-aligned boxes into one mesh. */
function mergeBoxes(boxes) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (const b of boxes) {
    const g = Geometry.box(b.scale[0], b.scale[1], b.scale[2]);
    const base = positions.length / 3;
    for (let i = 0; i < g.positions.length; i += 3) {
      positions.push(g.positions[i] + b.pos[0], g.positions[i + 1] + b.pos[1], g.positions[i + 2] + b.pos[2]);
    }
    normals.push(...g.normals);
    uvs.push(...g.uvs);
    for (const idx of g.indices) indices.push(base + idx);
  }
  return { positions, normals, uvs, indices };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default CitadelWars3DGame;
