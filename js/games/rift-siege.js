// ==========================================================================
// Rift Siege — maze-building tower defense.
//
// Unlike Bastion TD there is no fixed road: the swarm walks a breadth-first
// path from the rift to your core, and every tower you plant is an obstacle
// that reroutes it. The game is therefore about *shaping* the walk, and a
// build that would seal the core off completely is rejected outright.
//
// It is built to be ground. A run banks Rift Shards scaled to how deep you
// got, and those buy permanent upgrades that make the next attempt start
// stronger — see js/systems/metaProgress.js.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { MetaProgress, runReward } from "../systems/metaProgress.js";
import { clamp, randFloat } from "../core/utils.js";

const COLS = 17, ROWS = 11;
const SPAWN = { x: 0, y: 5 };
const CORE = { x: COLS - 1, y: 5 };
const MAX_LEVEL = 8;

// ------------------------------------------------------------- towers -----
const TOWERS = {
  spike: {
    name: "Spike", cost: 40, color: "#ffd76a", accent: "#ff9f43",
    dmg: 8, range: 2.0, rate: 0.5,
  },
  coil: {
    name: "Coil", cost: 70, color: "#7ce8ff", accent: "#3aa8ff",
    dmg: 5, range: 1.9, rate: 0.75, chains: 2,
  },
  mortar: {
    name: "Mortar", cost: 95, color: "#ff8fa4", accent: "#e8253f",
    dmg: 14, range: 3.1, rate: 1.45, splash: 1.1,
  },
  prism: {
    name: "Prism", cost: 130, color: "#c86bff", accent: "#7c5cff",
    dmg: 11, range: 2.8, rate: 0.95, pierce: true, locked: true,
  },
};
const TOWER_KEYS = Object.keys(TOWERS);

function towerStat(t, key) {
  const base = TOWERS[t.type][key];
  const n = t.level - 1;
  if (key === "dmg") return base * Math.pow(1.31, n);
  if (key === "range") return base * (1 + n * 0.055);
  if (key === "rate") return base * Math.pow(0.945, n);
  return base;
}
const upgradeCost = (t) => Math.round(TOWERS[t.type].cost * 0.55 * Math.pow(1.36, t.level));

// ------------------------------------------------------------ enemies -----
const ENEMIES = {
  crawler:  { name: "Crawler",  color: "#ff6b86", dark: "#8c1f33", hp: 22,  speed: 1.65, armour: 0, gold: 6,  score: 10, r: 0.24 },
  dasher:   { name: "Dasher",   color: "#ffd76a", dark: "#8a6410", hp: 15,  speed: 3.2,  armour: 0, gold: 8,  score: 15, r: 0.19 },
  hulk:     { name: "Hulk",     color: "#8fa0c8", dark: "#2c3654", hp: 78,  speed: 1.05, armour: 5, gold: 18, score: 32, r: 0.33 },
  wraith:   { name: "Wraith",   color: "#7ce8ff", dark: "#134a63", hp: 26,  speed: 2.3,  armour: 0, gold: 14, score: 28, r: 0.22, flying: true },
  weaver:   { name: "Weaver",   color: "#2ee6a6", dark: "#0d5c44", hp: 40,  speed: 1.45, armour: 1, gold: 20, score: 36, r: 0.26, heal: 11, healRange: 2.4 },
  warden:   { name: "Warden",   color: "#c86bff", dark: "#43206b", hp: 54,  speed: 1.3,  armour: 2, gold: 22, score: 40, r: 0.30, shield: 48, shieldRegen: 11 },
  colossus: { name: "Colossus", color: "#ff9f43", dark: "#7a3a05", hp: 420, speed: 0.9,  armour: 7, gold: 110, score: 260, r: 0.44, boss: true, splits: 5 },
};

function waveComposition(wave) {
  const pool = [];
  const add = (t, n) => { for (let i = 0; i < n; i++) pool.push(t); };
  add("crawler", 5 + Math.floor(wave * 0.85));
  if (wave >= 3) add("dasher", 2 + Math.floor(wave * 0.55));
  if (wave >= 5) add("hulk", 1 + Math.floor((wave - 4) * 0.42));
  if (wave >= 7) add("wraith", 1 + Math.floor((wave - 6) * 0.38));
  if (wave >= 9) add("weaver", 1 + Math.floor((wave - 8) * 0.24));
  if (wave >= 11) add("warden", 1 + Math.floor((wave - 10) * 0.3));
  if (wave % 5 === 0) add("colossus", Math.max(1, Math.floor(wave / 10)));
  return pool;
}

// ------------------------------------------------------- meta upgrades -----
const META = new MetaProgress("rift-siege", {
  currency: "Rift Shards", icon: "💠",
  nodes: [
    { id: "gold",    name: "Deep Reserves",  icon: "🪙", max: 10, desc: "Start every run with more gold.",
      cost: (lv) => 40 + lv * 55, value: (lv) => lv * 30, prefix: "+", suffix: "g" },
    { id: "core",    name: "Core Plating",   icon: "🛡️", max: 8,  desc: "The core survives more leaks before it fails.",
      cost: (lv) => 60 + lv * 80, value: (lv) => lv * 2, prefix: "+", suffix: " HP" },
    { id: "dmg",     name: "Focused Optics", icon: "🎯", max: 12, desc: "Every tower deals more damage.",
      cost: (lv) => 55 + lv * 70, value: (lv) => lv * 0.06, suffix: "%" },
    { id: "income",  name: "Shard Refinery", icon: "⛏️", max: 10, desc: "Kills pay more gold during a run.",
      cost: (lv) => 65 + lv * 85, value: (lv) => lv * 0.07, suffix: "%" },
    { id: "build",   name: "Field Foundry",  icon: "🔧", max: 8,  desc: "Towers and upgrades cost less to build.",
      cost: (lv) => 80 + lv * 95, value: (lv) => lv * 0.035, suffix: "%" },
    { id: "yield",   name: "Shard Attunement", icon: "💠", max: 10, desc: "Runs bank more Rift Shards.",
      cost: (lv) => 100 + lv * 130, value: (lv) => lv * 0.1, suffix: "%" },
    { id: "prism",   name: "Prism Licence",  icon: "🔮", max: 1,  desc: "Unlocks the piercing Prism tower for every run.",
      cost: () => 450, value: (lv) => lv, unlock: true },
  ],
});

export class RiftSiegeGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getUpgrades() { return META; }
  getInstructions() {
    return [
      "There is no fixed road: the swarm walks the shortest open path from the rift to your core.",
      "Every tower you plant is a wall, so building is how you lengthen the walk — the longer the maze, the longer they stay in range.",
      "You can never seal the core off completely; a build that would block the last path is refused.",
      "Wraiths fly straight over the maze, hulks are armoured, weavers heal and wardens regenerate a shield.",
      "A run banks Rift Shards based on how deep you got. Spend them on permanent upgrades before the next attempt.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tower in the bar, then tap a tile. Tap a tower you own to upgrade it."; }
  getKeyboardHint() { return "Click a tower type, then click a tile. Click a tower to upgrade it. Keys 1-4 pick a type."; }

  getScene() { return "grid"; }

  onInit() {
    this.createCanvas();
    this.selected = "spike";
    this.input.onPointer("down", (p) => this._onClick(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this._gridFromPx(p.x, p.y); });
    TOWER_KEYS.forEach((k, i) => this.input.onKey(`Digit${i + 1}`, () => {
      if (this._unlocked(k)) { this.selected = k; audioManager.play("select"); }
    }));
  }

  _unlocked(key) { return !TOWERS[key].locked || META.level("prism") > 0; }

  onResize() { this._layout(); }

  _layout() {
    this.barH = clamp(this.viewH * 0.145, 52, 84);
    const gridH = this.viewH - this.barH;
    this.cell = Math.floor(Math.min(this.viewW / COLS, gridH / ROWS));
    this.offX = Math.round((this.viewW - this.cell * COLS) / 2);
    this.offY = Math.round((gridH - this.cell * ROWS) / 2);
  }

  onStart(difficulty) {
    this._layout();
    const cfg = {
      Easy:   { hpMul: 0.78, speedMul: 0.9,  gold: 200, lives: 20, reward: 1.2, shard: 0.85 },
      Normal: { hpMul: 1.0,  speedMul: 1.0,  gold: 160, lives: 15, reward: 1.0, shard: 1.0 },
      Hard:   { hpMul: 1.4,  speedMul: 1.12, gold: 130, lives: 11, reward: 0.9, shard: 1.35 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.gold = cfg.gold + META.value("gold");
    this.maxCore = cfg.lives + META.value("core");
    this.core = this.maxCore;
    this.dmgMul = 1 + META.value("dmg");
    this.goldMul = cfg.reward * (1 + META.value("income"));
    this.buildMul = 1 - META.value("build");

    this.blocked = new Set();      // "x,y" of occupied tiles
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.arcs = [];
    this.floaters = [];
    this.wave = 0;
    this.kills = 0;
    this.leaks = 0;
    this.waveTimer = 5;
    this.betweenWaves = true;
    this.elapsed = 0;
    this.selected = this._unlocked(this.selected) ? this.selected : "spike";
    this._recomputePath();
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Gold: Math.floor(this.gold),
      Core: `${Math.max(0, this.core)}/${this.maxCore}`,
      Wave: this.betweenWaves ? `${this.wave + 1} in ${Math.max(0, Math.ceil(this.waveTimer))}s` : this.wave,
      Score: this.score,
    });
  }

  // ------------------------------------------------------- PATHFINDING ----
  /**
   * Breadth-first flow field from the core outwards. Every walker just steps
   * to the neighbour with the lower distance, which keeps thousands of
   * lookups cheap and makes rerouting a single recompute.
   */
  _computeField(extraBlocked = null) {
    const dist = new Int32Array(COLS * ROWS).fill(-1);
    const idx = (x, y) => y * COLS + x;
    const blocked = (x, y) => {
      const k = `${x},${y}`;
      return this.blocked.has(k) || (extraBlocked && extraBlocked === k);
    };
    const queue = [CORE];
    dist[idx(CORE.x, CORE.y)] = 0;
    for (let head = 0; head < queue.length; head++) {
      const { x, y } = queue[head];
      const d = dist[idx(x, y)];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (dist[idx(nx, ny)] !== -1 || blocked(nx, ny)) continue;
        dist[idx(nx, ny)] = d + 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return dist;
  }

  _recomputePath() {
    this.field = this._computeField();
    this.pathLength = this.field[SPAWN.y * COLS + SPAWN.x];
  }

  /** A build is legal only when the rift can still reach the core after it. */
  _wouldSeal(x, y) {
    const field = this._computeField(`${x},${y}`);
    return field[SPAWN.y * COLS + SPAWN.x] === -1;
  }

  _stepToward(gx, gy) {
    const here = this.field[gy * COLS + gx];
    if (here <= 0) return null;
    let best = null, bestD = here;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const d = this.field[ny * COLS + nx];
      if (d === -1 || d >= bestD) continue;
      bestD = d; best = { x: nx, y: ny };
    }
    return best;
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
    if (py > this.viewH - this.barH) {
      const i = this._paletteHit(px, py);
      if (i >= 0 && this._unlocked(TOWER_KEYS[i])) { this.selected = TOWER_KEYS[i]; audioManager.play("select"); }
      else if (i >= 0) { audioManager.play("error"); this._float({ x: this.viewW / 2, y: this.viewH - this.barH - 12 }, "Locked — buy the Prism Licence", "#ff8fa4"); }
      return;
    }

    const { x, y } = this._gridFromPx(px, py);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;

    const existing = this.towers.find(t => t.x === x && t.y === y);
    if (existing) return this._upgrade(existing);
    if ((x === SPAWN.x && y === SPAWN.y) || (x === CORE.x && y === CORE.y)) return audioManager.play("error");

    const spec = TOWERS[this.selected];
    const cost = Math.round(spec.cost * this.buildMul);
    if (this.gold < cost) {
      audioManager.play("error");
      this._float(this._toPx(x, y), `${cost}g needed`, "#ff8fa4");
      return;
    }
    if (this._wouldSeal(x, y)) {
      audioManager.play("error");
      this._float(this._toPx(x, y), "That would seal the core", "#ff8fa4");
      return;
    }

    this.gold -= cost;
    this.blocked.add(`${x},${y}`);
    this.towers.push({ x, y, type: this.selected, level: 1, cooldown: 0, angle: -Math.PI / 2, flash: 0, built: 0.35 });
    this._recomputePath();
    audioManager.play("toggle");
    this._updateHud();
  }

  _upgrade(t) {
    if (t.level >= MAX_LEVEL) { audioManager.play("error"); this._float(this._toPx(t.x, t.y), "MAX", "#ffd76a"); return; }
    const cost = Math.round(upgradeCost(t) * this.buildMul);
    if (this.gold < cost) { audioManager.play("error"); this._float(this._toPx(t.x, t.y), `${cost}g needed`, "#ff8fa4"); return; }
    this.gold -= cost;
    t.level++;
    t.built = 0.35;
    audioManager.play("coin");
    this._float(this._toPx(t.x, t.y), `Lv ${t.level}`, TOWERS[t.type].color);
    this._updateHud();
  }

  _paletteMetrics() {
    const h = this.barH - 12;
    const w = Math.min(132, (this.viewW - 30) / TOWER_KEYS.length - 8);
    return { w, gap: 8, y0: this.viewH - this.barH + 6, h };
  }
  _paletteHit(px, py) {
    const { w, gap, y0, h } = this._paletteMetrics();
    const total = TOWER_KEYS.length * w + (TOWER_KEYS.length - 1) * gap;
    const x0 = (this.viewW - total) / 2;
    if (py < y0 || py > y0 + h) return -1;
    for (let i = 0; i < TOWER_KEYS.length; i++) {
      const bx = x0 + i * (w + gap);
      if (px >= bx && px <= bx + w) return i;
    }
    return -1;
  }

  _float(pos, text, color) {
    this.floaters.push({ x: clamp(pos.x, 70, this.viewW - 70), y: pos.y, text, color, t: 0, life: 0.95 });
  }

  // ------------------------------------------------------------- WAVES ----
  _spawnWave() {
    this.wave += 1;
    const pool = waveComposition(this.wave);
    const hpMul = this.cfg.hpMul * (1 + this.wave * 0.24);
    const speedMul = this.cfg.speedMul * (1 + Math.min(0.45, this.wave * 0.011));
    let delay = 0;
    for (const type of pool) {
      delay += ENEMIES[type].boss ? 1.2 : randFloat(0.24, 0.46);
      this._spawn(type, hpMul, speedMul, delay);
    }
    audioManager.play("levelup");
  }

  _spawn(type, hpMul, speedMul, delay, at = null) {
    const spec = ENEMIES[type];
    const hp = spec.hp * hpMul;
    const start = at || { gx: SPAWN.x, gy: SPAWN.y };
    const px = this._toPx(start.gx, start.gy);
    this.enemies.push({
      type, spec, hp, maxHp: hp,
      speed: spec.speed * speedMul,
      armour: spec.armour,
      shield: spec.shield ? spec.shield * hpMul : 0,
      maxShield: spec.shield ? spec.shield * hpMul : 0,
      shieldCd: 0,
      gx: start.gx, gy: start.gy,
      x: at?.x ?? px.x, y: at?.y ?? px.y,
      tx: at?.x ?? px.x, ty: at?.y ?? px.y,
      spawnDelay: delay,
      slow: 0, slowT: 0, hitFlash: 0, pulse: 0,
      wobble: randFloat(0, 6.3), healCd: randFloat(0.4, 2), facing: 0,
      fly: 0,
    });
  }

  // ------------------------------------------------------------ UPDATE ----
  onUpdate(dt) {
    this.elapsed += dt;
    if (this.betweenWaves) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this._spawnWave(); this.betweenWaves = false; }
    }

    this._moveEnemies(dt);
    this._abilities(dt);
    this._fireTowers(dt);
    this._moveBullets(dt);

    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].t += dt; if (this.arcs[i].t > 0.16) this.arcs.splice(i, 1); }
    for (let i = this.floaters.length - 1; i >= 0; i--) { this.floaters[i].t += dt; if (this.floaters[i].t >= this.floaters[i].life) this.floaters.splice(i, 1); }
    for (const t of this.towers) { if (t.flash > 0) t.flash -= dt; if (t.built > 0) t.built -= dt; }
    this.particles.update(dt);

    if (this.core <= 0) return this._gameOver();
    if (!this.betweenWaves && this.enemies.length === 0) {
      this.betweenWaves = true;
      this.waveTimer = Math.max(2.5, 6.5 - this.wave * 0.16);
      const bonus = Math.round((22 + this.wave * 5) * this.goldMul);
      this.gold += bonus;
      this._float({ x: this.viewW / 2, y: this.offY + 22 }, `Wave ${this.wave} held  +${bonus}g`, "#ffd76a");
    }
    this._updateHud();
  }

  _moveEnemies(dt) {
    const corePx = this._toPx(CORE.x, CORE.y);
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; continue; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.pulse > 0) e.pulse -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      e.wobble += dt * 7;

      const speed = e.speed * (1 - e.slow) * this.cell;

      if (e.spec.flying) {
        // Wraiths ignore the maze entirely and fly the straight line.
        const spawnPx = this._toPx(SPAWN.x, SPAWN.y);
        const dx = corePx.x - spawnPx.x, dy = corePx.y - spawnPx.y;
        const len = Math.hypot(dx, dy) || 1;
        e.fly += (speed * dt) / len;
        e.x = spawnPx.x + dx * e.fly;
        e.y = spawnPx.y + dy * e.fly;
        e.facing = Math.atan2(dy, dx);
        if (e.fly >= 1) e.reached = true;
        continue;
      }

      // Walk toward the centre of the next tile on the flow field.
      const dx = e.tx - e.x, dy = e.ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) {
        const next = this._stepToward(e.gx, e.gy);
        if (!next) {
          // Standing on the core, or walled in by a build this frame.
          if (e.gx === CORE.x && e.gy === CORE.y) { e.reached = true; continue; }
          const px = this._toPx(e.gx, e.gy);
          e.tx = px.x; e.ty = px.y;
        } else {
          e.gx = next.x; e.gy = next.y;
          const px = this._toPx(next.x, next.y);
          e.tx = px.x; e.ty = px.y;
          e.facing = Math.atan2(px.y - e.y, px.x - e.x);
        }
      } else {
        e.x += (dx / d) * speed * dt;
        e.y += (dy / d) * speed * dt;
      }
    }

    for (const e of this.enemies) {
      if (!e.reached) continue;
      this.core -= e.spec.boss ? 3 : 1;
      this.leaks++;
      this.shake();
      audioManager.play("error");
    }
    this.enemies = this.enemies.filter(e => !e.reached && e.hp > 0);
  }

  _abilities(dt) {
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) continue;
      if (e.maxShield) {
        e.shieldCd = Math.max(0, e.shieldCd - dt);
        if (e.shieldCd === 0 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.spec.shieldRegen * dt);
      }
      if (!e.spec.heal) continue;
      e.healCd -= dt;
      if (e.healCd > 0) continue;
      e.healCd = 2.1;
      const r = e.spec.healRange * this.cell;
      let n = 0;
      for (const o of this.enemies) {
        if (o === e || o.spawnDelay > 0 || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > r) continue;
        o.hp = Math.min(o.maxHp, o.hp + e.spec.heal);
        n++;
      }
      if (n) { e.pulse = 0.4; this._float({ x: e.x, y: e.y - this.cell * 0.4 }, `+${e.spec.heal}`, "#2ee6a6"); }
    }
  }

  _fireTowers(dt) {
    for (const t of this.towers) {
      t.cooldown -= dt;
      const pos = this._toPx(t.x, t.y);
      const range = towerStat(t, "range") * this.cell;

      let target = null, bestKey = -Infinity;
      for (const e of this.enemies) {
        if (e.spawnDelay > 0) continue;
        if (Math.hypot(e.x - pos.x, e.y - pos.y) > range) continue;
        // Healers first, then whoever is closest to the core.
        const remaining = e.spec.flying ? (1 - e.fly) * 100 : (this.field[e.gy * COLS + e.gx] ?? 999);
        const key = (e.spec.heal ? 1e6 : 0) - remaining;
        if (key > bestKey) { bestKey = key; target = e; }
      }
      if (target) t.angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      if (!target || t.cooldown > 0) continue;

      t.cooldown = towerStat(t, "rate");
      t.flash = 0.09;
      const dmg = towerStat(t, "dmg") * this.dmgMul;
      const spec = TOWERS[t.type];

      if (spec.chains) {
        this._chain(t, pos, target, dmg);
        audioManager.play("hover");
      } else if (spec.pierce) {
        this._pierce(t, pos, target, dmg);
        audioManager.play("swoosh");
      } else {
        this.bullets.push({ x: pos.x, y: pos.y, target, dmg, type: t.type, color: spec.color, trail: [] });
        audioManager.play("pop");
      }
    }
  }

  _chain(t, pos, first, dmg) {
    const hops = 1 + Math.floor((t.level - 1) / 3);
    let from = pos, cur = first, power = dmg;
    const seen = new Set();
    for (let i = 0; i <= hops; i++) {
      if (!cur) break;
      seen.add(cur);
      this.arcs.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, t: 0, color: TOWERS.coil.color });
      this._damage(cur, power);
      from = { x: cur.x, y: cur.y };
      power *= 0.65;
      let near = null, nd = this.cell * 2.3;
      for (const e of this.enemies) {
        if (seen.has(e) || e.spawnDelay > 0) continue;
        const d = Math.hypot(e.x - from.x, e.y - from.y);
        if (d < nd) { nd = d; near = e; }
      }
      cur = near;
    }
  }

  /** Prism fires a beam that damages everything along the line. */
  _pierce(t, pos, target, dmg) {
    const range = towerStat(t, "range") * this.cell;
    const ang = Math.atan2(target.y - pos.y, target.x - pos.x);
    const ex = pos.x + Math.cos(ang) * range, ey = pos.y + Math.sin(ang) * range;
    this.arcs.push({ x1: pos.x, y1: pos.y, x2: ex, y2: ey, t: 0, color: TOWERS.prism.color, beam: true });
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) continue;
      if (pointToSegment(e.x, e.y, pos.x, pos.y, ex, ey) > this.cell * 0.34 + e.spec.r * this.cell) continue;
      this._damage(e, dmg);
    }
  }

  _moveBullets(dt) {
    for (const b of this.bullets) {
      if (!b.target || b.target.hp <= 0 || b.target.reached) { b.dead = true; continue; }
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 6) b.trail.shift();
      if (d < this.cell * 0.24) {
        b.dead = true;
        const spec = TOWERS[b.type];
        if (spec.splash) {
          const r = spec.splash * this.cell;
          for (const e of this.enemies) {
            if (e.spawnDelay > 0 || Math.hypot(e.x - b.x, e.y - b.y) > r) continue;
            this._damage(e, b.dmg);
          }
          this.particles.burst(b.x, b.y, { count: 12, colors: [spec.color, "#ffffff"], speed: 130, life: 0.4, size: 3 });
          this.shake();
        } else {
          this._damage(b.target, b.dmg);
          this.particles.burst(b.x, b.y, { count: 5, colors: [b.color], speed: 70, life: 0.28, size: 2 });
        }
      } else {
        const speed = b.type === "mortar" ? 460 : 720;
        b.x += (dx / d) * speed * dt;
        b.y += (dy / d) * speed * dt;
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  _damage(e, amount) {
    e.hitFlash = 0.12;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed;
      amount -= absorbed;
      e.shieldCd = 3;
      if (amount <= 0) return;
    }
    e.hp -= Math.max(1, amount - e.armour);
    if (e.hp > 0) return;

    e.hp = 0;
    this.kills++;
    const reward = Math.round(e.spec.gold * this.goldMul);
    this.gold += reward;
    this.addScore(e.spec.score);
    this._float({ x: e.x, y: e.y - this.cell * 0.35 }, `+${reward}g`, "#ffd76a");
    this.particles.burst(e.x, e.y, { count: e.spec.boss ? 32 : 12, colors: [e.spec.color, e.spec.dark], speed: e.spec.boss ? 270 : 150, life: 0.6, size: 3 });
    audioManager.play(e.spec.boss ? "explosion" : "hit");

    if (e.spec.splits) {
      for (let i = 0; i < e.spec.splits; i++) {
        this._spawn("hulk", this.cfg.hpMul * (1 + this.wave * 0.17), this.cfg.speedMul, i * 0.05,
          { gx: e.gx, gy: e.gy, x: e.x + randFloat(-8, 8), y: e.y + randFloat(-8, 8) });
      }
      this.shake();
    }
  }

  _gameOver() {
    audioManager.play("gameover");
    const shards = Math.round(runReward({ wave: this.wave, kills: this.kills }) * this.cfg.shard * (1 + META.value("yield")));
    META.award(shards);
    this.endGame({
      result: "loss", score: this.score,
      message: `The core fell on wave ${this.wave}. Banked ${shards} Rift Shards.`,
      extraStats: [
        { label: "Wave", value: this.wave },
        { label: "Kills", value: this.kills },
        { label: "Shards", value: `💠 ${shards}` },
      ],
    });
  }

  // ------------------------------------------------------------ RENDER ----
  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawField(ctx);
    this._drawEnds(ctx);
    if (this.hover) this._drawHover(ctx);
    for (const t of this.towers) this._drawTower(ctx, t);
    for (const e of this.enemies) this._drawEnemy(ctx, e);
    for (const a of this.arcs) this._drawArc(ctx, a);
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

  /**
   * Floor tiles tinted by their distance to the core, so the route the swarm
   * will actually take is readable at a glance.
   */
  _drawField(ctx) {
    const c = this.cell;
    const maxD = Math.max(1, this.pathLength || 1);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (this.blocked.has(`${x},${y}`)) continue;
      const px = this.offX + x * c, py = this.offY + y * c;
      const d = this.field[y * COLS + x];
      const onRoute = d >= 0 && d <= maxD;
      const t = onRoute ? 1 - d / maxD : 0;
      ctx.fillStyle = onRoute ? `rgba(124,92,255,${0.06 + t * 0.2})` : "#151b33";
      ctx.fillRect(px, py, c - 1, c - 1);
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      ctx.fillRect(px, py, c - 1, 1.5);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(px, py + c - 2.5, c - 1, 1.5);
    }

    // Flow arrows along the walk, drifting toward the core.
    const flow = (this.elapsed * 0.7) % 1;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = "#c86bff";
    ctx.lineWidth = 2;
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
      if ((x + y) % 2) continue;
      if (this.blocked.has(`${x},${y}`)) continue;
      const next = this._stepToward(x, y);
      if (!next) continue;
      const a = this._toPx(x, y), b = this._toPx(next.x, next.y);
      const ix = a.x + (b.x - a.x) * flow, iy = a.y + (b.y - a.y) * flow;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.save();
      ctx.translate(ix, iy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-c * 0.09, -c * 0.09);
      ctx.lineTo(c * 0.07, 0);
      ctx.lineTo(-c * 0.09, c * 0.09);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawEnds(ctx) {
    const c = this.cell;
    // Rift: a torn portal that pulses.
    const s = this._toPx(SPAWN.x, SPAWN.y);
    const pulse = 0.75 + Math.sin(this.elapsed * 3) * 0.12;
    this.gfx.glow(ctx, s.x, s.y, c * 1.5 * pulse, "#ff4fd8", 0.75);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(this.elapsed * 0.6);
    ctx.fillStyle = "#2a0f38";
    ctx.beginPath();
    ctx.ellipse(0, 0, c * 0.36, c * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff4fd8";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Core: a crystal in a socket, with an integrity ring.
    const k = this._toPx(CORE.x, CORE.y);
    const r = c * 0.4;
    this.gfx.glow(ctx, k.x, k.y, r * 2.4, "#2ee6a6", 0.6);
    ctx.fillStyle = "#123a2f";
    ctx.beginPath();
    ctx.ellipse(k.x, k.y + r * 0.5, r * 0.95, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(k.x, k.y - r, k.x, k.y + r);
    g.addColorStop(0, "#b9ffe6");
    g.addColorStop(1, "#12a97a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(k.x, k.y - r);
    ctx.lineTo(k.x + r * 0.62, k.y);
    ctx.lineTo(k.x, k.y + r * 0.72);
    ctx.lineTo(k.x - r * 0.62, k.y);
    ctx.closePath();
    ctx.fill();

    const pct = clamp(this.core / this.maxCore, 0, 1);
    ctx.beginPath();
    ctx.arc(k.x, k.y, r * 1.35, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.strokeStyle = pct > 0.5 ? "#2ee6a6" : pct > 0.25 ? "#ffd76a" : "#ff5470";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  _drawHover(ctx) {
    const { x, y } = this.hover;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    const c = this.cell;
    const px = this.offX + x * c, py = this.offY + y * c;
    const existing = this.towers.find(t => t.x === x && t.y === y);

    if (existing) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(px + c / 2, py + c / 2, towerStat(existing, "range") * c, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if ((x === SPAWN.x && y === SPAWN.y) || (x === CORE.x && y === CORE.y)) return;

    const spec = TOWERS[this.selected];
    const cost = Math.round(spec.cost * this.buildMul);
    const ok = this.gold >= cost && !this._wouldSeal(x, y);
    ctx.strokeStyle = ok ? "rgba(46,230,166,0.65)" : "rgba(255,84,112,0.65)";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, c - 5, c - 5);
    if (ok) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(px + c / 2, py + c / 2, spec.range * c, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Towers read as a plinth, a lit core and a barrel tracking its target. */
  _drawTower(ctx, t) {
    const c = this.cell;
    const { x: cx, y: cy } = this._toPx(t.x, t.y);
    const spec = TOWERS[t.type];
    const tier = t.level >= 8 ? 3 : t.level >= 6 ? 2 : t.level >= 3 ? 1 : 0;
    const pop = t.built > 0 ? 1 + t.built * 0.45 : 1;
    const r = c * 0.38 * pop;

    ctx.fillStyle = "#0c1020";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const base = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    base.addColorStop(0, "#3a446e");
    base.addColorStop(1, "#191f36");
    ctx.fillStyle = base;
    ctx.fillRect(cx - r * 0.92, cy - r * 0.92, r * 1.84, r * 1.84);
    ctx.strokeStyle = tier >= 1 ? spec.accent : "rgba(255,255,255,0.12)";
    ctx.lineWidth = tier >= 2 ? 2 : 1;
    ctx.strokeRect(cx - r * 0.92, cy - r * 0.92, r * 1.84, r * 1.84);

    const body = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.34, r * 0.1, cx, cy, r * 0.7);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.3, spec.color);
    body.addColorStop(1, spec.accent);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t.angle);
    const recoil = t.flash > 0 ? -r * 0.15 : 0;
    ctx.fillStyle = "#111629";
    ctx.fillRect(r * 0.24 + recoil, -r * 0.15, r * 0.85, r * 0.3);
    ctx.fillStyle = spec.color;
    ctx.fillRect(r * 0.95 + recoil, -r * 0.19, r * 0.16, r * 0.38);
    if (t.flash > 0) {
      ctx.globalAlpha = t.flash / 0.09;
      this.gfx.glow(ctx, r * 1.15, 0, r * 0.65, spec.color, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    for (let i = 0; i < Math.min(t.level, MAX_LEVEL); i++) {
      const a = -Math.PI / 2 + (i / MAX_LEVEL) * Math.PI * 2;
      ctx.fillStyle = tier >= 3 ? "#ffd76a" : spec.color;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86, r * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    if (tier >= 3) this.gfx.glow(ctx, cx, cy, r * 2, "#ffd76a", 0.45);

    ctx.fillStyle = "#080b15";
    ctx.font = `800 ${Math.floor(c * 0.24)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(t.level), cx, cy);
  }

  _drawEnemy(ctx, e) {
    if (e.spawnDelay > 0) return;
    const c = this.cell;
    const spec = e.spec;
    const r = spec.r * c;
    const bob = Math.sin(e.wobble) * (spec.flying ? r * 0.22 : r * 0.09);
    const x = e.x, y = e.y + bob;
    const chilled = e.slowT > 0;
    const color = e.hitFlash > 0 ? "#ffffff" : chilled ? mix(spec.color, "#7ce8ff", 0.45) : spec.color;

    if (!spec.flying) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + r * 0.85, r * 0.78, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);

    if (spec.flying) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.5, r * 1.3, r * 0.2, Math.sin(e.wobble * 2) * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      blob(ctx, 0, 0, r * 1.8, r * 1.2, color, spec.dark);
      ctx.fillStyle = "#0a1420";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
    } else if (spec.boss) {
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 1.1, -r * 0.35, r * 2.2, r * 0.7);
      blob(ctx, 0, 0, r * 2.9, r * 2.6, color, spec.dark);
      for (const s of [-1, 1]) {
        ctx.fillStyle = spec.dark;
        ctx.beginPath();
        ctx.ellipse(s * r * 0.9, -r * 0.3, r * 0.44, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      this.gfx.glow(ctx, 0, 0, r * 1.2, "#ffd76a", 0.85);
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (spec.armour >= 5) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = spec.dark;
      ctx.lineWidth = Math.max(2, r * 0.22);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(-r * 0.5, -r * 0.62, r, r * 0.18);
    } else if (spec.heal) {
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
      blob(ctx, 0, 0, r * 1.5, r * 1.5, color, spec.dark);
      ctx.fillStyle = "#eafff6";
      ctx.fillRect(-r * 0.16, -r * 0.55, r * 0.32, r * 1.1);
      ctx.fillRect(-r * 0.55, -r * 0.16, r * 1.1, r * 0.32);
    } else if (spec.shield) {
      blob(ctx, 0, 0, r * 1.4, r * 1.5, color, spec.dark);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.42, -r * 0.2);
      ctx.lineTo(0, r * 0.62); ctx.lineTo(-r * 0.42, -r * 0.2);
      ctx.closePath(); ctx.fill();
    } else if (spec.speed > 3) {
      ctx.save();
      ctx.rotate(e.facing || 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(r * 1.25, 0); ctx.lineTo(-r * 0.7, -r * 0.78); ctx.lineTo(-r * 0.35, 0); ctx.lineTo(-r * 0.7, r * 0.78);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 1.75, 0); ctx.stroke();
      ctx.restore();
    } else {
      const step = Math.sin(e.wobble) * r * 0.3;
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 0.42 + step, r * 0.5, r * 0.3, r * 0.5);
      ctx.fillRect(r * 0.12 - step, r * 0.5, r * 0.3, r * 0.5);
      blob(ctx, 0, 0, r * 1.35, r * 1.45, color, spec.dark);
      ctx.fillStyle = "#0d1024";
      ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.26, -r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    if (e.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + (e.shield / e.maxShield) * 0.4;
      ctx.strokeStyle = "#c86bff";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (e.hp < e.maxHp - 0.01) {
      const bw = Math.max(20, r * 2.2), bh = 4, by = e.y - r * 1.7;
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
    this.gfx.orb(ctx, b.x, b.y, this.cell * (b.type === "mortar" ? 0.11 : 0.07), b.color, { glow: 0.7 });
  }

  _drawArc(ctx, a) {
    const p = 1 - a.t / 0.16;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.beam ? 3 + p * 4 : 2 + p * 2;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    if (a.beam) {
      ctx.lineTo(a.x2, a.y2);
    } else {
      const segs = 4;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const j = (Math.random() - 0.5) * this.cell * 0.22;
        ctx.lineTo(a.x1 + (a.x2 - a.x1) * t + j, a.y1 + (a.y2 - a.y1) * t + j);
      }
      ctx.lineTo(a.x2, a.y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawFloater(ctx, f) {
    const p = f.t / f.life;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = f.color;
    ctx.font = `800 ${Math.floor(this.cell * 0.28)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y - p * this.cell * 0.6);
    ctx.restore();
  }

  _drawPalette(ctx) {
    const { w, gap, y0, h } = this._paletteMetrics();
    const total = TOWER_KEYS.length * w + (TOWER_KEYS.length - 1) * gap;
    const x0 = (this.viewW - total) / 2;

    TOWER_KEYS.forEach((key, i) => {
      const spec = TOWERS[key];
      const bx = x0 + i * (w + gap);
      const active = this.selected === key;
      const unlocked = this._unlocked(key);
      const cost = Math.round(spec.cost * this.buildMul);
      const afford = unlocked && this.gold >= cost;

      ctx.fillStyle = active ? "rgba(255,255,255,0.12)" : "rgba(10,14,30,0.72)";
      roundRect(ctx, bx, y0, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = active ? spec.color : "rgba(255,255,255,0.14)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      const ix = bx + h * 0.48, iy = y0 + h * 0.5, ir = h * 0.24;
      const g = ctx.createRadialGradient(ix - ir * 0.3, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, spec.color);
      g.addColorStop(1, spec.accent);
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#eef1ff";
      ctx.font = `700 ${Math.round(h * 0.25)}px 'Sora', system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const tw = Math.max(20, w - h * 0.85 - 8);
      ctx.fillText(spec.name, bx + h * 0.85, y0 + h * 0.45, tw);
      ctx.fillStyle = !unlocked ? "#8b90ac" : afford ? "#ffd76a" : "#ff8fa4";
      ctx.font = `700 ${Math.round(h * 0.22)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(unlocked ? `${cost}g` : "locked", bx + h * 0.85, y0 + h * 0.78, tw);
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

function blob(ctx, x, y, w, h, color, dark) {
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

/** Distance from a point to a line segment — used by the Prism beam. */
function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hex(h) {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export default RiftSiegeGame;
