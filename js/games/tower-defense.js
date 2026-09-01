// ==========================================================================
// Bastion TD — grid tower defense with a serpentine road, three tower
// classes and ten upgrade levels.
//
// Six enemy families keep the waves from turning into one long healthbar:
// marchers, sprinters, armoured brutes, flying drones that ignore the road,
// menders that heal their neighbours and bulwarks behind a regenerating
// shield — plus a boss every fifth wave that splits when it dies.
//
// Everything is drawn from scratch on the canvas: tiles are bevelled stone,
// the road is a worn track with chevrons, towers are plinth + turret + a
// barrel that tracks its target, and every enemy family has its own
// silhouette and animation so a wave is readable at a glance.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randFloat } from "../core/utils.js";

const COLS = 12, ROWS = 7;
const MAX_LEVEL = 10;

// ------------------------------------------------------------- towers -----
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
  titan: {
    name: "Titan", color: "#ff9f43", dark: "#7a3a05",
    hp: 340, speed: 30, armour: 6, gold: 90, score: 220, r: 0.44, boss: true, splits: 4,
  },
};

/** Which families a wave may draw from, and how many of each. */
function waveComposition(wave) {
  const pool = [];
  const add = (type, n) => { for (let i = 0; i < n; i++) pool.push(type); };
  add("marcher", 4 + Math.floor(wave * 0.9));
  if (wave >= 3) add("sprinter", 2 + Math.floor(wave * 0.5));
  if (wave >= 5) add("brute", 1 + Math.floor((wave - 4) * 0.4));
  if (wave >= 7) add("drone", 1 + Math.floor((wave - 6) * 0.35));
  if (wave >= 9) add("mender", 1 + Math.floor((wave - 8) * 0.22));
  if (wave >= 11) add("bulwark", 1 + Math.floor((wave - 10) * 0.28));
  if (wave % 5 === 0) add("titan", Math.max(1, Math.floor(wave / 10)));
  return pool;
}

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
  getInstructions() {
    return [
      "Pick a tower from the bar at the bottom, then tap an empty tile to build it.",
      "Cannon hits one target hard, Frost slows a small area, Arc chains lightning between enemies.",
      "Tap a tower you already own to upgrade it — every tower goes up to level 10.",
      "Six enemy families march the road: sprinters are fast, brutes are armoured, drones fly straight over your defences, menders heal their neighbours and bulwarks regenerate a shield. Every fifth wave brings a Titan that splits when it falls.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tower type in the bar, then tap a tile. Tap an existing tower to upgrade it."; }
  getKeyboardHint() { return "Click a tower type, then click a tile. Click a tower to upgrade it. Keys 1-3 switch type."; }

  getScene() { return "grid"; }

  onInit() {
    this.createCanvas();
    this.path = buildPath();
    this.pathSet = new Set(this.path.map(p => `${p.x},${p.y}`));
    this.selected = "cannon";
    this.input.onPointer("down", (p) => this._onClick(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this._gridFromPx(p.x, p.y); });
    TOWER_KEYS.forEach((k, i) => this.input.onKey(`Digit${i + 1}`, () => { this.selected = k; audioManager.play("select"); }));
  }

  onResize() { this._layout(); }

  /** Grid on top, tower palette in a strip along the bottom. */
  _layout() {
    this.barH = clamp(this.viewH * 0.14, 54, 86);
    const gridH = this.viewH - this.barH;
    this.cell = Math.floor(Math.min(this.viewW / COLS, gridH / ROWS));
    this.offX = Math.round((this.viewW - this.cell * COLS) / 2);
    this.offY = Math.round((gridH - this.cell * ROWS) / 2);
  }

  onStart(difficulty) {
    this._layout();
    const cfg = {
      Easy:   { hpMul: 0.8, speedMul: 0.9, gold: 190, lives: 18, reward: 1.2 },
      Normal: { hpMul: 1.0, speedMul: 1.0, gold: 150, lives: 14, reward: 1.0 },
      Hard:   { hpMul: 1.35, speedMul: 1.12, gold: 120, lives: 10, reward: 0.9 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.gold = cfg.gold;
    this.baseHP = cfg.lives;
    this.maxBaseHP = cfg.lives;
    this.wave = 0;
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.arcs = [];
    this.floaters = [];
    this.kills = 0;
    this.waveTimer = 4;
    this.betweenWaves = true;
    this.elapsed = 0;
    this.selected = "cannon";
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
      if (idx >= 0) { this.selected = TOWER_KEYS[idx]; audioManager.play("select"); }
      return;
    }

    const { x, y } = this._gridFromPx(px, py);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;

    const existing = this.towers.find(t => t.x === x && t.y === y);
    if (existing) return this._upgrade(existing);
    if (this.pathSet.has(`${x},${y}`)) return audioManager.play("error");

    const spec = TOWERS[this.selected];
    if (this.gold < spec.cost) { audioManager.play("error"); this._float(this._toPx(x, y), "Not enough gold", "#ff8fa4"); return; }
    this.gold -= spec.cost;
    this.towers.push({ x, y, type: this.selected, level: 1, cooldown: 0, angle: -Math.PI / 2, flash: 0, built: 0 });
    audioManager.play("toggle");
    this._updateHud();
  }

  _upgrade(t) {
    if (t.level >= MAX_LEVEL) { audioManager.play("error"); this._float(this._toPx(t.x, t.y), "MAX", "#ffd76a"); return; }
    const cost = upgradeCost(t);
    if (this.gold < cost) { audioManager.play("error"); this._float(this._toPx(t.x, t.y), `${cost}g needed`, "#ff8fa4"); return; }
    this.gold -= cost;
    t.level++;
    t.built = 0.35;
    audioManager.play("coin");
    this._float(this._toPx(t.x, t.y), `Lv ${t.level}`, TOWERS[t.type].color);
    this._updateHud();
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

  _paletteMetrics() {
    const h = this.barH - 14;
    const w = Math.min(150, (this.viewW - 40) / TOWER_KEYS.length - 10);
    return { w, gap: 10, y0: this.viewH - this.barH + 7, h };
  }

  _float(pos, text, color) {
    // Clamped so a message near the edge is never half off the stage.
    this.floaters.push({ x: clamp(pos.x, 60, this.viewW - 60), y: pos.y, text, color, t: 0, life: 0.9 });
  }

  // ------------------------------------------------------------- WAVES ----
  _spawnWave() {
    this.wave += 1;
    const pool = waveComposition(this.wave);
    const hpMul = this.cfg.hpMul * (1 + this.wave * 0.22);
    const speedMul = this.cfg.speedMul * (1 + Math.min(0.5, this.wave * 0.012));
    let delay = 0;
    for (const type of pool) {
      const spec = ENEMIES[type];
      delay += spec.boss ? 1.1 : randFloat(0.28, 0.52);
      this._spawn(type, hpMul, speedMul, delay);
    }
    audioManager.play("levelup");
  }

  _spawn(type, hpMul, speedMul, delay, at = null) {
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
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].t += dt;
      if (this.floaters[i].t >= this.floaters[i].life) this.floaters.splice(i, 1);
    }
    for (const t of this.towers) { if (t.flash > 0) t.flash -= dt; if (t.built > 0) t.built -= dt; }
    this.particles.update(dt);

    if (this.baseHP <= 0) return this._gameOver();
    if (!this.betweenWaves && this.enemies.length === 0) {
      this.betweenWaves = true;
      // Waves come faster the deeper you get, but never without a breather.
      this.waveTimer = Math.max(2.2, 6 - this.wave * 0.15);
      this.gold += 20 + this.wave * 4;
      this._float({ x: this.viewW / 2, y: this.offY + 24 }, `Wave ${this.wave} cleared  +${20 + this.wave * 4}g`, "#ffd76a");
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

  _fireTowers(dt) {
    for (const t of this.towers) {
      t.cooldown -= dt;
      const pos = this._toPx(t.x, t.y);
      const range = towerStat(t, "range") * this.cell;

      // Menders first, then whatever is furthest along the road.
      let target = null, bestKey = -Infinity;
      for (const e of this.enemies) {
        if (e.spawnDelay > 0) continue;
        if (Math.hypot(e.x - pos.x, e.y - pos.y) > range) continue;
        const key = (e.spec.heal ? 1e6 : 0) + (e.spec.flying ? e.fly * 1000 : e.pathIdx + e.t);
        if (key > bestKey) { bestKey = key; target = e; }
      }
      if (target) t.angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      if (!target || t.cooldown > 0) continue;

      t.cooldown = towerStat(t, "rate");
      t.flash = 0.09;
      const dmg = towerStat(t, "dmg");

      if (t.type === "arc") {
        this._arcStrike(t, pos, target, dmg);
        audioManager.play("hover");
      } else {
        this.bullets.push({
          x: pos.x, y: pos.y, target, dmg, type: t.type,
          color: TOWERS[t.type].color, tower: t, trail: [],
        });
        audioManager.play("pop");
      }
    }
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
      if (!b.target || b.target.hp <= 0 || b.target.reached) { b.dead = true; continue; }
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 6) b.trail.shift();
      if (d < this.cell * 0.22) {
        b.dead = true;
        if (b.type === "frost") {
          const spec = TOWERS.frost;
          const r = spec.splash * this.cell;
          for (const e of this.enemies) {
            if (e.spawnDelay > 0 || Math.hypot(e.x - b.x, e.y - b.y) > r) continue;
            this._damage(e, b.dmg);
            e.slow = Math.max(e.slow, spec.slow);
            e.slowT = spec.slowTime;
          }
          this.particles.burst(b.x, b.y, { count: 8, colors: ["#7ce8ff", "#ffffff"], speed: 90, life: 0.4, size: 2.5, gravity: 60 });
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

  /** Shields soak first, then armour subtracts a flat amount per hit. */
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
    const reward = Math.round(e.spec.gold * this.cfg.reward);
    this.gold += reward;
    this.addScore(e.spec.score);
    this._float({ x: e.x, y: e.y - this.cell * 0.35 }, `+${reward}g`, "#ffd76a");
    this.particles.burst(e.x, e.y, { count: e.spec.boss ? 30 : 12, colors: [e.spec.color, e.spec.dark], speed: e.spec.boss ? 260 : 150, life: 0.6, size: 3 });
    audioManager.play(e.spec.boss ? "explosion" : "hit");

    // A Titan bursts into a squad of brutes right where it stood.
    if (e.spec.splits) {
      for (let i = 0; i < e.spec.splits; i++) {
        this._spawn("brute", this.cfg.hpMul * (1 + this.wave * 0.16), this.cfg.speedMul, 0, {
          pathIdx: e.pathIdx, t: clamp(e.t - i * 0.12, 0, 0.99), x: e.x, y: e.y,
        });
      }
      this.shake();
    }
  }

  _gameOver() {
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score,
      message: `The base fell on wave ${this.wave} after ${this.kills} kills.`,
      extraStats: [{ label: "Wave", value: this.wave }, { label: "Kills", value: this.kills }],
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
  }

  /** Each family gets its own silhouette so a wave reads at a glance. */
  _drawEnemy(ctx, e) {
    if (e.spawnDelay > 0) return;
    const c = this.cell;
    const spec = e.spec;
    const r = spec.r * c;
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

  _drawArc(ctx, a) {
    const p = 1 - a.t / 0.16;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.strokeStyle = a.color;
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
    const { w, gap, y0, h } = this._paletteMetrics();
    const total = TOWER_KEYS.length * w + (TOWER_KEYS.length - 1) * gap;
    const x0 = (this.viewW - total) / 2;

    TOWER_KEYS.forEach((key, i) => {
      const spec = TOWERS[key];
      const bx = x0 + i * (w + gap);
      const active = this.selected === key;
      const afford = this.gold >= spec.cost;

      ctx.fillStyle = active ? "rgba(255,255,255,0.12)" : "rgba(10,14,30,0.72)";
      roundRect(ctx, bx, y0, w, h, 10);
      ctx.fill();
      ctx.strokeStyle = active ? spec.color : "rgba(255,255,255,0.14)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      // Mini turret icon
      const ix = bx + h * 0.5, iy = y0 + h * 0.5, ir = h * 0.26;
      const g = ctx.createRadialGradient(ix - ir * 0.3, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, spec.color);
      g.addColorStop(1, spec.accent);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();

      ctx.globalAlpha = afford ? 1 : 0.45;
      ctx.fillStyle = "#eef1ff";
      ctx.font = `700 ${Math.round(h * 0.26)}px 'Sora', system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(spec.name, bx + h * 0.9, y0 + h * 0.45);
      ctx.fillStyle = afford ? "#ffd76a" : "#ff8fa4";
      ctx.font = `700 ${Math.round(h * 0.23)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(`${spec.cost}g`, bx + h * 0.9, y0 + h * 0.78);
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
