// ==========================================================================
// Iron Vanguard — circular base defense.
//
// Where Bastion TD funnels a wave along one road, here the horde closes in
// from every angle at once, so the question is coverage rather than routing.
// Turrets sit on a polar grid of rings and sectors, they have their own
// hit points, and Lancers stop at range to shell them — so a run is a
// constant argument between building outward and repairing what you have.
//
// Overcharge is the active button: every turret fires at double rate for a
// few seconds. Runs bank Alloy, which buys permanent upgrades.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { MetaProgress, runReward } from "../systems/metaProgress.js";
import { clamp, randFloat, randInt } from "../core/utils.js";

const RINGS = 4;              // buildable rings around the core
const SECTORS = 16;
const MAX_LEVEL = 8;
const OVERCHARGE_TIME = 5;
const OVERCHARGE_CD = 26;

// ------------------------------------------------------------ turrets -----
const TURRETS = {
  autocannon: { name: "Autocannon", cost: 45,  color: "#ffd76a", accent: "#ff9f43", dmg: 7,  range: 2.6, rate: 0.42, hp: 60 },
  flak:       { name: "Flak",       cost: 80,  color: "#ff8fa4", accent: "#e8253f", dmg: 12, range: 2.9, rate: 1.1,  hp: 70, splash: 0.9 },
  tesla:      { name: "Tesla",      cost: 110, color: "#7ce8ff", accent: "#3aa8ff", dmg: 6,  range: 2.4, rate: 0.7,  hp: 55, chains: 2 },
  lance:      { name: "Lance",      cost: 150, color: "#c86bff", accent: "#7c5cff", dmg: 16, range: 4.4, rate: 1.25, hp: 50, pierce: true, locked: true },
};
const TURRET_KEYS = Object.keys(TURRETS);

function stat(t, key) {
  const base = TURRETS[t.type][key];
  const n = t.level - 1;
  if (key === "dmg") return base * Math.pow(1.3, n);
  if (key === "range") return base * (1 + n * 0.05);
  if (key === "rate") return base * Math.pow(0.94, n);
  if (key === "hp") return base * (1 + n * 0.28);
  return base;
}
const upgradeCost = (t) => Math.round(TURRETS[t.type].cost * 0.55 * Math.pow(1.34, t.level));

// ------------------------------------------------------------ enemies -----
const ENEMIES = {
  husk:    { name: "Husk",    color: "#ff6b86", dark: "#8c1f33", hp: 24,  speed: 26, armour: 0, gold: 6,  score: 10, r: 13 },
  skimmer: { name: "Skimmer", color: "#ffd76a", dark: "#8a6410", hp: 16,  speed: 54, armour: 0, gold: 8,  score: 15, r: 11 },
  bulwark: { name: "Bulwark", color: "#8fa0c8", dark: "#2c3654", hp: 86,  speed: 17, armour: 5, gold: 18, score: 32, r: 18 },
  // Lancers never reach the core: they park at range and shell your turrets.
  lancer:  { name: "Lancer",  color: "#ff9f43", dark: "#7a3a05", hp: 46,  speed: 22, armour: 2, gold: 20, score: 38, r: 15, siege: true, siegeRange: 120, siegeDmg: 14, siegeRate: 2.1 },
  mender:  { name: "Mender",  color: "#2ee6a6", dark: "#0d5c44", hp: 44,  speed: 23, armour: 1, gold: 20, score: 36, r: 14, heal: 12, healRange: 110 },
  shade:   { name: "Shade",   color: "#c86bff", dark: "#43206b", hp: 58,  speed: 30, armour: 2, gold: 22, score: 42, r: 16, shield: 52, shieldRegen: 12 },
  leviath: { name: "Leviath", color: "#ff4fd8", dark: "#5c0f45", hp: 520, speed: 14, armour: 8, gold: 130, score: 300, r: 26, boss: true, splits: 5 },
};

function waveComposition(wave) {
  const pool = [];
  const add = (t, n) => { for (let i = 0; i < n; i++) pool.push(t); };
  add("husk", 5 + Math.floor(wave * 0.9));
  if (wave >= 3) add("skimmer", 2 + Math.floor(wave * 0.5));
  if (wave >= 5) add("bulwark", 1 + Math.floor((wave - 4) * 0.4));
  if (wave >= 6) add("lancer", 1 + Math.floor((wave - 5) * 0.35));
  if (wave >= 9) add("mender", 1 + Math.floor((wave - 8) * 0.25));
  if (wave >= 11) add("shade", 1 + Math.floor((wave - 10) * 0.3));
  if (wave % 5 === 0) add("leviath", Math.max(1, Math.floor(wave / 10)));
  return pool;
}

// ------------------------------------------------------- meta upgrades -----
const META = new MetaProgress("iron-vanguard", {
  currency: "Alloy", icon: "🔩",
  nodes: [
    { id: "scrap",  name: "Salvage Rigs",    icon: "🪙", max: 10, desc: "Start every run with more scrap.",
      cost: (lv) => 40 + lv * 55, value: (lv) => lv * 32, prefix: "+", suffix: "" },
    { id: "core",   name: "Reactor Shell",   icon: "🛡️", max: 10, desc: "The core takes more punishment before it goes.",
      cost: (lv) => 60 + lv * 78, value: (lv) => lv * 22, prefix: "+", suffix: " HP" },
    { id: "dmg",    name: "Rifled Barrels",  icon: "🎯", max: 12, desc: "Every turret hits harder.",
      cost: (lv) => 55 + lv * 68, value: (lv) => lv * 0.06, suffix: "%" },
    { id: "plate",  name: "Turret Plating",  icon: "🧱", max: 10, desc: "Turrets survive far more shelling.",
      cost: (lv) => 60 + lv * 72, value: (lv) => lv * 0.12, suffix: "%" },
    { id: "income", name: "Scrap Processing", icon: "⛏️", max: 10, desc: "Kills pay more scrap.",
      cost: (lv) => 65 + lv * 82, value: (lv) => lv * 0.07, suffix: "%" },
    { id: "surge",  name: "Capacitor Bank",  icon: "⚡", max: 8,  desc: "Overcharge recharges faster.",
      cost: (lv) => 90 + lv * 100, value: (lv) => lv * 1.6, prefix: "-", suffix: "s" },
    { id: "yield",  name: "Alloy Refining",  icon: "🔩", max: 10, desc: "Runs bank more Alloy.",
      cost: (lv) => 100 + lv * 125, value: (lv) => lv * 0.1, suffix: "%" },
    { id: "lance",  name: "Lance Clearance", icon: "🔱", max: 1,  desc: "Unlocks the long-range piercing Lance turret.",
      cost: () => 500, value: (lv) => lv, unlock: true },
  ],
});

export class IronVanguardGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getUpgrades() { return META; }
  getInstructions() {
    return [
      "The horde closes in from every direction — build turrets on the rings around the core to cover all of it.",
      "Turrets have their own hit points. Lancers stop at range and shell them, so tap a damaged turret to repair it.",
      "Overcharge (the ⚡ button, or Q) doubles every turret's fire rate for five seconds. Save it for a wave that is about to break through.",
      "Bulwarks are armoured, menders heal their neighbours, shades regenerate a shield and every fifth wave brings a Leviath.",
      "A run banks Alloy based on how deep you got. Spend it on permanent upgrades before the next attempt.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a turret in the bar, then tap a slot. Tap a turret you own to upgrade or repair it."; }
  getKeyboardHint() { return "Click a turret type, then click a slot. Click a turret to upgrade/repair. 1-4 pick a type, Q overcharges."; }

  getScene() { return "stars"; }

  onInit() {
    this.createCanvas();
    this.selected = "autocannon";
    this.input.onPointer("down", (p) => this._onClick(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hoverPx = { x: p.x, y: p.y }; });
    this.input.onKey("KeyQ", () => this._overcharge());
    TURRET_KEYS.forEach((k, i) => this.input.onKey(`Digit${i + 1}`, () => {
      if (this._unlocked(k)) { this.selected = k; audioManager.play("select"); }
    }));
  }

  _unlocked(key) { return !TURRETS[key].locked || META.level("lance") > 0; }

  onResize() { this._layout(); }

  _layout() {
    this.barH = clamp(this.viewH * 0.145, 52, 84);
    const fieldH = this.viewH - this.barH;
    this.cx = this.viewW / 2;
    this.cy = fieldH / 2;
    // Slot spacing derives from whichever axis is tighter, so the whole ring
    // structure always fits.
    this.unit = Math.min(this.viewW, fieldH) / (2 * (RINGS + 2.4));
    this.coreR = this.unit * 1.15;
    this.rimR = this.unit * (RINGS + 1.9);
  }

  /** Centre of a build slot, in pixels. */
  _slotPos(ring, sector) {
    const r = this.coreR + this.unit * (ring + 0.85);
    const a = (sector / SECTORS) * Math.PI * 2;
    return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r, a, r };
  }

  onStart(difficulty) {
    this._layout();
    const cfg = {
      Easy:   { hpMul: 0.78, speedMul: 0.9,  scrap: 265, core: 230, reward: 1.2, alloy: 0.85 },
      Normal: { hpMul: 1.0,  speedMul: 1.0,  scrap: 215, core: 180, reward: 1.0, alloy: 1.0 },
      Hard:   { hpMul: 1.3,  speedMul: 1.12, scrap: 180, core: 155, reward: 0.92, alloy: 1.35 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.scrap = cfg.scrap + META.value("scrap");
    this.maxCore = cfg.core + META.value("core");
    this.core = this.maxCore;
    this.dmgMul = 1 + META.value("dmg");
    this.plateMul = 1 + META.value("plate");
    this.scrapMul = cfg.reward * (1 + META.value("income"));
    this.surgeCd = Math.max(9, OVERCHARGE_CD - META.value("surge"));

    this.turrets = [];
    this.enemies = [];
    this.bullets = [];
    this.shells = [];      // enemy siege shells
    this.arcs = [];
    this.floaters = [];
    this.wave = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.waveTimer = 5;
    this.betweenWaves = true;
    this.surge = 0;        // remaining overcharge seconds
    this.surgeReady = 0;   // cooldown remaining
    this.coreFlash = 0;
    this.selected = this._unlocked(this.selected) ? this.selected : "autocannon";
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Scrap: Math.floor(this.scrap),
      Core: `${Math.max(0, Math.round(this.core))}`,
      Wave: this.betweenWaves ? `${this.wave + 1} in ${Math.max(0, Math.ceil(this.waveTimer))}s` : this.wave,
      Score: this.score,
    });
  }

  // ------------------------------------------------------------- INPUT ----
  /** Nearest build slot to a pixel, if the click is close enough to one. */
  _slotAt(px, py) {
    const dx = px - this.cx, dy = py - this.cy;
    const dist = Math.hypot(dx, dy);
    const ring = Math.round((dist - this.coreR) / this.unit - 0.85);
    if (ring < 0 || ring >= RINGS) return null;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    const sector = Math.round((a / (Math.PI * 2)) * SECTORS) % SECTORS;
    const pos = this._slotPos(ring, sector);
    if (Math.hypot(px - pos.x, py - pos.y) > this.unit * 0.75) return null;
    return { ring, sector, ...pos };
  }

  _onClick(px, py) {
    if (this.state !== "playing") return;

    if (py > this.viewH - this.barH) {
      const i = this._paletteHit(px, py);
      if (i === TURRET_KEYS.length) return this._overcharge();
      if (i >= 0 && this._unlocked(TURRET_KEYS[i])) { this.selected = TURRET_KEYS[i]; audioManager.play("select"); }
      else if (i >= 0) { audioManager.play("error"); this._float({ x: this.viewW / 2, y: this.viewH - this.barH - 12 }, "Locked — buy Lance Clearance", "#ff8fa4"); }
      return;
    }

    const slot = this._slotAt(px, py);
    if (!slot) return;
    const existing = this.turrets.find(t => t.ring === slot.ring && t.sector === slot.sector);
    if (existing) return this._tapTurret(existing);

    const spec = TURRETS[this.selected];
    if (this.scrap < spec.cost) {
      audioManager.play("error");
      this._float(slot, `${spec.cost} scrap needed`, "#ff8fa4");
      return;
    }
    this.scrap -= spec.cost;
    const maxHp = spec.hp * this.plateMul;
    this.turrets.push({
      ring: slot.ring, sector: slot.sector, type: this.selected, level: 1,
      cooldown: 0, angle: slot.a, flash: 0, built: 0.35, hp: maxHp, maxHp, hurt: 0,
    });
    audioManager.play("toggle");
    this._updateHud();
  }

  /** A damaged turret repairs first; a healthy one upgrades. */
  _tapTurret(t) {
    const maxHp = stat(t, "hp") * this.plateMul;
    if (t.hp < maxHp - 0.5) {
      const cost = Math.max(5, Math.round((maxHp - t.hp) * 0.55));
      if (this.scrap < cost) { audioManager.play("error"); this._float(this._slotPos(t.ring, t.sector), `${cost} to repair`, "#ff8fa4"); return; }
      this.scrap -= cost;
      t.hp = maxHp;
      audioManager.play("coin");
      this._float(this._slotPos(t.ring, t.sector), "Repaired", "#2ee6a6");
      this._updateHud();
      return;
    }
    if (t.level >= MAX_LEVEL) { audioManager.play("error"); this._float(this._slotPos(t.ring, t.sector), "MAX", "#ffd76a"); return; }
    const cost = upgradeCost(t);
    if (this.scrap < cost) { audioManager.play("error"); this._float(this._slotPos(t.ring, t.sector), `${cost} scrap needed`, "#ff8fa4"); return; }
    this.scrap -= cost;
    t.level++;
    t.built = 0.35;
    t.maxHp = stat(t, "hp") * this.plateMul;
    t.hp = t.maxHp;
    audioManager.play("coin");
    this._float(this._slotPos(t.ring, t.sector), `Lv ${t.level}`, TURRETS[t.type].color);
    this._updateHud();
  }

  _overcharge() {
    if (this.state !== "playing") return;
    if (this.surgeReady > 0 || this.surge > 0) { audioManager.play("error"); return; }
    this.surge = OVERCHARGE_TIME;
    this.surgeReady = this.surgeCd;
    audioManager.play("levelup");
    this._float({ x: this.cx, y: this.cy - this.coreR * 2 }, "OVERCHARGE", "#ffd76a");
  }

  _paletteMetrics() {
    const h = this.barH - 12;
    const slots = TURRET_KEYS.length + 1;   // + the overcharge button
    const w = Math.min(126, (this.viewW - 26) / slots - 8);
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

  _float(pos, text, color) {
    this.floaters.push({ x: clamp(pos.x, 70, this.viewW - 70), y: pos.y, text, color, t: 0, life: 0.95 });
  }

  // ------------------------------------------------------------- WAVES ----
  _spawnWave() {
    this.wave += 1;
    const pool = waveComposition(this.wave);
    const hpMul = this.cfg.hpMul * (1 + this.wave * 0.24);
    const speedMul = this.cfg.speedMul * (1 + Math.min(0.4, this.wave * 0.01));
    // Enemies arrive in two or three clusters rather than a perfect ring, so
    // one side is always under more pressure than the other.
    const clusters = 2 + (this.wave % 3 === 0 ? 1 : 0);
    const bases = [...Array(clusters)].map(() => randFloat(0, Math.PI * 2));
    let delay = 0;
    pool.forEach((type, i) => {
      delay += ENEMIES[type].boss ? 1.2 : randFloat(0.2, 0.42);
      const a = bases[i % clusters] + randFloat(-0.5, 0.5);
      this._spawn(type, hpMul, speedMul, delay, a);
    });
    audioManager.play("levelup");
  }

  _spawn(type, hpMul, speedMul, delay, angle, at = null) {
    const spec = ENEMIES[type];
    const hp = spec.hp * hpMul;
    const r = at ? at.r : this.rimR + this.unit * 1.2;
    this.enemies.push({
      type, spec, hp, maxHp: hp,
      speed: spec.speed * speedMul,
      armour: spec.armour,
      shield: spec.shield ? spec.shield * hpMul : 0,
      maxShield: spec.shield ? spec.shield * hpMul : 0,
      shieldCd: 0,
      a: angle, r,
      x: this.cx + Math.cos(angle) * r, y: this.cy + Math.sin(angle) * r,
      spawnDelay: delay,
      slow: 0, slowT: 0, hitFlash: 0, pulse: 0,
      wobble: randFloat(0, 6.3), healCd: randFloat(0.4, 2), siegeCd: randFloat(0.6, 2),
    });
  }

  // ------------------------------------------------------------ UPDATE ----
  onUpdate(dt) {
    this.elapsed += dt;
    if (this.surge > 0) this.surge = Math.max(0, this.surge - dt);
    if (this.surgeReady > 0) this.surgeReady = Math.max(0, this.surgeReady - dt);
    if (this.coreFlash > 0) this.coreFlash -= dt;

    if (this.betweenWaves) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this._spawnWave(); this.betweenWaves = false; }
    }

    this._moveEnemies(dt);
    this._abilities(dt);
    this._fireTurrets(dt);
    this._moveBullets(dt);
    this._moveShells(dt);

    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].t += dt; if (this.arcs[i].t > 0.16) this.arcs.splice(i, 1); }
    for (let i = this.floaters.length - 1; i >= 0; i--) { this.floaters[i].t += dt; if (this.floaters[i].t >= this.floaters[i].life) this.floaters.splice(i, 1); }
    for (const t of this.turrets) { if (t.flash > 0) t.flash -= dt; if (t.built > 0) t.built -= dt; if (t.hurt > 0) t.hurt -= dt; }
    this.particles.update(dt);

    if (this.core <= 0) return this._gameOver();
    if (!this.betweenWaves && this.enemies.length === 0) {
      this.betweenWaves = true;
      this.waveTimer = Math.max(2.5, 6.5 - this.wave * 0.16);
      const bonus = Math.round((30 + this.wave * 7) * this.scrapMul);
      this.scrap += bonus;
      this._float({ x: this.cx, y: this.cy - this.rimR * 0.75 }, `Wave ${this.wave} held  +${bonus}`, "#ffd76a");
    }
    this._updateHud();
  }

  _moveEnemies(dt) {
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; continue; }
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.pulse > 0) e.pulse -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      e.wobble += dt * 7;

      // Siege units stop as soon as a turret is in range and start shelling.
      let hold = false;
      if (e.spec.siege) {
        e.target = this._nearestTurret(e.x, e.y, e.spec.siegeRange);
        hold = !!e.target;
      }
      if (!hold) {
        e.r -= e.speed * (1 - e.slow) * dt;
        // A gentle drift around the ring keeps the pressure from stacking
        // into one perfect column.
        e.a += Math.sin(this.elapsed * 0.5 + e.wobble) * 0.12 * dt;
      }
      e.x = this.cx + Math.cos(e.a) * e.r;
      e.y = this.cy + Math.sin(e.a) * e.r;

      if (e.r <= this.coreR + e.spec.r * 0.6) e.reached = true;
    }

    for (const e of this.enemies) {
      if (!e.reached) continue;
      this.core -= (e.spec.boss ? 60 : 14) + this.wave * 0.8;
      this.coreFlash = 0.35;
      this.shake();
      audioManager.play("error");
    }
    this.enemies = this.enemies.filter(e => !e.reached && e.hp > 0);
  }

  _nearestTurret(x, y, range) {
    let best = null, bd = range;
    for (const t of this.turrets) {
      const p = this._slotPos(t.ring, t.sector);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  _abilities(dt) {
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) continue;

      if (e.maxShield) {
        e.shieldCd = Math.max(0, e.shieldCd - dt);
        if (e.shieldCd === 0 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.spec.shieldRegen * dt);
      }

      if (e.spec.siege && e.target) {
        e.siegeCd -= dt;
        if (e.siegeCd <= 0) {
          e.siegeCd = e.spec.siegeRate;
          const p = this._slotPos(e.target.ring, e.target.sector);
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          this.shells.push({ x: e.x, y: e.y, vx: (dx / d) * 210, vy: (dy / d) * 210, dmg: e.spec.siegeDmg + this.wave * 1.2, life: 3 });
          audioManager.play("hover");
        }
      }

      if (!e.spec.heal) continue;
      e.healCd -= dt;
      if (e.healCd > 0) continue;
      e.healCd = 2.1;
      let n = 0;
      for (const o of this.enemies) {
        if (o === e || o.spawnDelay > 0 || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) > e.spec.healRange) continue;
        o.hp = Math.min(o.maxHp, o.hp + e.spec.heal);
        n++;
      }
      if (n) { e.pulse = 0.4; this._float({ x: e.x, y: e.y - 20 }, `+${e.spec.heal}`, "#2ee6a6"); }
    }
  }

  _fireTurrets(dt) {
    const surging = this.surge > 0;
    for (const t of this.turrets) {
      t.cooldown -= dt * (surging ? 2 : 1);
      const pos = this._slotPos(t.ring, t.sector);
      const range = stat(t, "range") * this.unit;

      let target = null, bestKey = -Infinity;
      for (const e of this.enemies) {
        if (e.spawnDelay > 0) continue;
        if (Math.hypot(e.x - pos.x, e.y - pos.y) > range) continue;
        // Menders first, then whatever is closest to the core.
        const key = (e.spec.heal ? 1e6 : 0) - e.r;
        if (key > bestKey) { bestKey = key; target = e; }
      }
      if (target) t.angle = Math.atan2(target.y - pos.y, target.x - pos.x);
      if (!target || t.cooldown > 0) continue;

      t.cooldown = stat(t, "rate");
      t.flash = 0.09;
      const dmg = stat(t, "dmg") * this.dmgMul;
      const spec = TURRETS[t.type];

      if (spec.chains) { this._chain(t, pos, target, dmg); audioManager.play("hover"); }
      else if (spec.pierce) { this._pierce(t, pos, target, dmg, range); audioManager.play("swoosh"); }
      else { this.bullets.push({ x: pos.x, y: pos.y, target, dmg, type: t.type, color: spec.color, trail: [] }); audioManager.play("pop"); }
    }
  }

  _chain(t, pos, first, dmg) {
    const hops = 1 + Math.floor((t.level - 1) / 3);
    let from = pos, cur = first, power = dmg;
    const seen = new Set();
    for (let i = 0; i <= hops; i++) {
      if (!cur) break;
      seen.add(cur);
      this.arcs.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, t: 0, color: TURRETS.tesla.color });
      this._damage(cur, power);
      from = { x: cur.x, y: cur.y };
      power *= 0.65;
      let near = null, nd = this.unit * 2.4;
      for (const e of this.enemies) {
        if (seen.has(e) || e.spawnDelay > 0) continue;
        const d = Math.hypot(e.x - from.x, e.y - from.y);
        if (d < nd) { nd = d; near = e; }
      }
      cur = near;
    }
  }

  _pierce(t, pos, target, dmg, range) {
    const ang = Math.atan2(target.y - pos.y, target.x - pos.x);
    const ex = pos.x + Math.cos(ang) * range, ey = pos.y + Math.sin(ang) * range;
    this.arcs.push({ x1: pos.x, y1: pos.y, x2: ex, y2: ey, t: 0, color: TURRETS.lance.color, beam: true });
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) continue;
      if (pointToSegment(e.x, e.y, pos.x, pos.y, ex, ey) > e.spec.r + 6) continue;
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
      if (d < 10) {
        b.dead = true;
        const spec = TURRETS[b.type];
        if (spec.splash) {
          const r = spec.splash * this.unit;
          for (const e of this.enemies) {
            if (e.spawnDelay > 0 || Math.hypot(e.x - b.x, e.y - b.y) > r) continue;
            this._damage(e, b.dmg);
          }
          this.particles.burst(b.x, b.y, { count: 12, colors: [spec.color, "#ffffff"], speed: 130, life: 0.4, size: 3 });
        } else {
          this._damage(b.target, b.dmg);
          this.particles.burst(b.x, b.y, { count: 5, colors: [b.color], speed: 70, life: 0.28, size: 2 });
        }
      } else {
        b.x += (dx / d) * 760 * dt;
        b.y += (dy / d) * 760 * dt;
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  /** Lancer shells: they only hurt turrets, never the core directly. */
  _moveShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      let hit = false;
      for (const t of this.turrets) {
        const p = this._slotPos(t.ring, t.sector);
        if (Math.hypot(s.x - p.x, s.y - p.y) > this.unit * 0.42) continue;
        t.hp -= s.dmg;
        t.hurt = 0.25;
        hit = true;
        this.particles.burst(s.x, s.y, { count: 8, colors: ["#ff9f43", "#ffffff"], speed: 110, life: 0.35, size: 2.5 });
        if (t.hp <= 0) {
          this.turrets = this.turrets.filter(o => o !== t);
          this._float(p, "Turret lost", "#ff8fa4");
          this.shake();
          audioManager.play("explosion");
        } else {
          audioManager.play("hit");
        }
        break;
      }
      if (hit || s.life <= 0) this.shells.splice(i, 1);
    }
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
    const reward = Math.round(e.spec.gold * this.scrapMul);
    this.scrap += reward;
    this.addScore(e.spec.score);
    this._float({ x: e.x, y: e.y - e.spec.r - 6 }, `+${reward}`, "#ffd76a");
    this.particles.burst(e.x, e.y, { count: e.spec.boss ? 34 : 12, colors: [e.spec.color, e.spec.dark], speed: e.spec.boss ? 280 : 150, life: 0.6, size: 3 });
    audioManager.play(e.spec.boss ? "explosion" : "hit");

    if (e.spec.splits) {
      for (let i = 0; i < e.spec.splits; i++) {
        this._spawn("bulwark", this.cfg.hpMul * (1 + this.wave * 0.17), this.cfg.speedMul, i * 0.05,
          e.a + randFloat(-0.35, 0.35), { r: e.r });
      }
      this.shake();
    }
  }

  _gameOver() {
    audioManager.play("gameover");
    const alloy = Math.round(runReward({ wave: this.wave, kills: this.kills }) * this.cfg.alloy * (1 + META.value("yield")));
    META.award(alloy);
    this.endGame({
      result: "loss", score: this.score,
      message: `The reactor blew on wave ${this.wave}. Banked ${alloy} Alloy.`,
      extraStats: [
        { label: "Wave", value: this.wave },
        { label: "Kills", value: this.kills },
        { label: "Alloy", value: `🔩 ${alloy}` },
      ],
    });
  }

  // ------------------------------------------------------------ RENDER ----
  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawArena(ctx);
    this._drawCore(ctx);
    this._drawHover(ctx);
    for (const t of this.turrets) this._drawTurret(ctx, t);
    for (const e of this.enemies) this._drawEnemy(ctx, e);
    for (const a of this.arcs) this._drawArc(ctx, a);
    for (const b of this.bullets) this._drawBullet(ctx, b);
    for (const s of this.shells) this.gfx.orb(ctx, s.x, s.y, 4.5, "#ff9f43", { glow: 0.8 });
    this.particles.render(ctx);
    for (const f of this.floaters) this._drawFloater(ctx, f);
    this._drawPalette(ctx);

    if (this.betweenWaves) {
      this.gfx.label(ctx, `WAVE ${this.wave + 1} INCOMING`, this.cx, 22,
        { size: 14, weight: 800, color: "rgba(255,215,106,0.9)" });
    }
    ctx.restore();
  }

  /** Rings of empty sockets plus the rim the horde walks in from. */
  _drawArena(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let ring = 0; ring < RINGS; ring++) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.coreR + this.unit * (ring + 0.85), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Danger rim, pulsing while a wave is on the field.
    const heat = this.betweenWaves ? 0.12 : 0.24 + Math.sin(this.elapsed * 2) * 0.06;
    ctx.strokeStyle = `rgba(255,84,112,${heat})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.rimR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Empty sockets, so the buildable grid is legible.
    for (let ring = 0; ring < RINGS; ring++) {
      for (let s = 0; s < SECTORS; s++) {
        if (this.turrets.some(t => t.ring === ring && t.sector === s)) continue;
        const p = this._slotPos(ring, s);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawCore(ctx) {
    const r = this.coreR;
    const pct = clamp(this.core / this.maxCore, 0, 1);
    const surging = this.surge > 0;
    this.gfx.glow(ctx, this.cx, this.cy, r * (surging ? 3.2 : 2.4), surging ? "#ffd76a" : "#22d3ee", surging ? 0.9 : 0.55);

    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.fillStyle = this.coreFlash > 0 ? "#ff8fa4" : "#16204a";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    // Rotating containment vanes.
    ctx.rotate(this.elapsed * (surging ? 1.6 : 0.5));
    ctx.strokeStyle = surging ? "#ffd76a" : "#3ad6ff";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, i * 2.1, i * 2.1 + 1.3);
      ctx.stroke();
    }
    ctx.rotate(-this.elapsed * (surging ? 1.6 : 0.5) * 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, surging ? "#ff9f43" : "#22d3ee");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r * 1.25, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.strokeStyle = pct > 0.5 ? "#2ee6a6" : pct > 0.25 ? "#ffd76a" : "#ff5470";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  _drawHover(ctx) {
    if (!this.hoverPx || this.hoverPx.y > this.viewH - this.barH) return;
    const slot = this._slotAt(this.hoverPx.x, this.hoverPx.y);
    if (!slot) return;
    const existing = this.turrets.find(t => t.ring === slot.ring && t.sector === slot.sector);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = existing ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)";
    ctx.beginPath();
    const range = existing ? stat(existing, "range") : TURRETS[this.selected].range;
    ctx.arc(slot.x, slot.y, range * this.unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (!existing) {
      const afford = this.scrap >= TURRETS[this.selected].cost;
      ctx.strokeStyle = afford ? "rgba(46,230,166,0.65)" : "rgba(255,84,112,0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(slot.x, slot.y, this.unit * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawTurret(ctx, t) {
    const p = this._slotPos(t.ring, t.sector);
    const spec = TURRETS[t.type];
    const tier = t.level >= 8 ? 3 : t.level >= 6 ? 2 : t.level >= 3 ? 1 : 0;
    const pop = t.built > 0 ? 1 + t.built * 0.45 : 1;
    const r = this.unit * 0.4 * pop;
    const hurt = t.hurt > 0;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.4, r * 0.95, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();

    const base = ctx.createLinearGradient(p.x, p.y - r, p.x, p.y + r);
    base.addColorStop(0, hurt ? "#ff8fa4" : "#3a446e");
    base.addColorStop(1, "#191f36");
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.18, r * 0.9, r * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    if (tier >= 1) {
      ctx.strokeStyle = spec.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.18, r * 0.9, r * 0.46, 0, 0, Math.PI * 2); ctx.stroke();
    }

    const body = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.35, r * 0.1, p.x, p.y, r * 0.72);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.3, spec.color);
    body.addColorStop(1, spec.accent);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.05, r * 0.58, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y - r * 0.05);
    ctx.rotate(t.angle);
    const recoil = t.flash > 0 ? -r * 0.16 : 0;
    ctx.fillStyle = "#111629";
    ctx.fillRect(r * 0.24 + recoil, -r * 0.16, r * 0.9, r * 0.32);
    ctx.fillStyle = spec.color;
    ctx.fillRect(r * 1.0 + recoil, -r * 0.2, r * 0.16, r * 0.4);
    if (t.flash > 0) {
      ctx.globalAlpha = t.flash / 0.09;
      this.gfx.glow(ctx, r * 1.2, 0, r * 0.7, spec.color, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    for (let i = 0; i < Math.min(t.level, MAX_LEVEL); i++) {
      const a = -Math.PI / 2 + (i / MAX_LEVEL) * Math.PI * 2;
      ctx.fillStyle = tier >= 3 ? "#ffd76a" : spec.color;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * r * 0.88, p.y - r * 0.05 + Math.sin(a) * r * 0.88, r * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.surge > 0) this.gfx.glow(ctx, p.x, p.y, r * 1.6, "#ffd76a", 0.5);

    // Damage bar only once it has taken a hit.
    const maxHp = stat(t, "hp") * this.plateMul;
    if (t.hp < maxHp - 0.5) {
      const bw = r * 1.8, by = p.y - r * 1.15;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(p.x - bw / 2, by, bw, 3.5);
      ctx.fillStyle = t.hp / maxHp > 0.4 ? "#7ce8ff" : "#ff8fa4";
      ctx.fillRect(p.x - bw / 2, by, bw * clamp(t.hp / maxHp, 0, 1), 3.5);
    }
  }

  _drawEnemy(ctx, e) {
    if (e.spawnDelay > 0) return;
    const spec = e.spec;
    const r = spec.r;
    const bob = Math.sin(e.wobble) * r * 0.1;
    const x = e.x, y = e.y + bob;
    const chilled = e.slowT > 0;
    const color = e.hitFlash > 0 ? "#ffffff" : chilled ? mix(spec.color, "#7ce8ff", 0.45) : spec.color;
    const facing = Math.atan2(this.cy - e.y, this.cx - e.x);

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.8, r * 0.75, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facing);

    if (spec.boss) {
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 0.9, -r * 0.4, r * 1.9, r * 0.8);
      blob(ctx, 0, 0, r * 2.4, r * 2.1, color, spec.dark);
      for (const s of [-1, 1]) {
        ctx.fillStyle = spec.dark;
        ctx.beginPath(); ctx.ellipse(-r * 0.2, s * r * 0.8, r * 0.5, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      }
      this.gfx.glow(ctx, r * 0.3, 0, r * 1.1, "#ff4fd8", 0.85);
      ctx.fillStyle = "#ffe0f6";
      ctx.beginPath(); ctx.arc(r * 0.4, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
    } else if (spec.siege) {
      // Lancer: a tracked chassis with a long barrel pointed at its target.
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 0.85, -r * 0.62, r * 1.7, r * 1.24);
      blob(ctx, 0, 0, r * 1.5, r * 1.2, color, spec.dark);
      ctx.fillStyle = "#2a2033";
      ctx.fillRect(r * 0.3, -r * 0.13, r * 1.25, r * 0.26);
      ctx.fillStyle = e.target ? "#ffd76a" : "#6c7396";
      ctx.beginPath(); ctx.arc(r * 1.6, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
    } else if (spec.armour >= 5) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx[i ? "lineTo" : "moveTo"](Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = spec.dark;
      ctx.lineWidth = Math.max(2, r * 0.22);
      ctx.stroke();
    } else if (spec.heal) {
      if (e.pulse > 0) {
        ctx.save();
        ctx.globalAlpha = e.pulse;
        ctx.strokeStyle = spec.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, spec.healRange * (1 - e.pulse * 0.4), 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      blob(ctx, 0, 0, r * 1.5, r * 1.5, color, spec.dark);
      ctx.fillStyle = "#eafff6";
      ctx.fillRect(-r * 0.16, -r * 0.55, r * 0.32, r * 1.1);
      ctx.fillRect(-r * 0.55, -r * 0.16, r * 1.1, r * 0.32);
    } else if (spec.shield) {
      blob(ctx, 0, 0, r * 1.4, r * 1.5, color, spec.dark);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.moveTo(r * 0.6, 0); ctx.lineTo(0, -r * 0.45); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(0, r * 0.45);
      ctx.closePath(); ctx.fill();
    } else if (spec.speed > 45) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.7, -r * 0.8); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.7, r * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(-r * 1.8, 0); ctx.stroke();
    } else {
      const step = Math.sin(e.wobble) * r * 0.28;
      ctx.fillStyle = spec.dark;
      ctx.fillRect(-r * 0.2, -r * 0.75 + step, r * 0.45, r * 0.3);
      ctx.fillRect(-r * 0.2, r * 0.45 - step, r * 0.45, r * 0.3);
      blob(ctx, 0, 0, r * 1.5, r * 1.3, color, spec.dark);
      ctx.fillStyle = "#0d1024";
      ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.18, r * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.4, r * 0.18, r * 0.14, 0, Math.PI * 2); ctx.fill();
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
      const bw = Math.max(20, r * 2.2), by = e.y - r * 1.7;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - bw / 2, by, bw, 4);
      ctx.fillStyle = spec.boss ? "#ff9f43" : "#2ee6a6";
      ctx.fillRect(x - bw / 2, by, bw * clamp(e.hp / e.maxHp, 0, 1), 4);
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
    this.gfx.orb(ctx, b.x, b.y, b.type === "flak" ? 5.5 : 3.5, b.color, { glow: 0.7 });
  }

  _drawArc(ctx, a) {
    const p = 1 - a.t / 0.16;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.beam ? 3 + p * 4 : 2 + p * 2;
    ctx.beginPath();
    ctx.moveTo(a.x1, a.y1);
    if (a.beam) ctx.lineTo(a.x2, a.y2);
    else {
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        const j = (Math.random() - 0.5) * 12;
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
    ctx.font = `800 ${Math.floor(this.unit * 0.42)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y - p * 26);
    ctx.restore();
  }

  _drawPalette(ctx) {
    const { w, gap, y0, h, slots } = this._paletteMetrics();
    const total = slots * w + (slots - 1) * gap;
    const x0 = (this.viewW - total) / 2;

    TURRET_KEYS.forEach((key, i) => {
      const spec = TURRETS[key];
      const bx = x0 + i * (w + gap);
      const active = this.selected === key;
      const unlocked = this._unlocked(key);
      const afford = unlocked && this.scrap >= spec.cost;

      ctx.fillStyle = active ? "rgba(255,255,255,0.12)" : "rgba(10,14,30,0.72)";
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
      ctx.globalAlpha = unlocked ? 1 : 0.3;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#eef1ff";
      ctx.font = `700 ${Math.round(h * 0.24)}px 'Sora', system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const tw = Math.max(20, w - h * 0.8 - 8);
      ctx.fillText(spec.name, bx + h * 0.8, y0 + h * 0.45, tw);
      ctx.fillStyle = !unlocked ? "#8b90ac" : afford ? "#ffd76a" : "#ff8fa4";
      ctx.font = `700 ${Math.round(h * 0.21)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(unlocked ? `${spec.cost}` : "locked", bx + h * 0.8, y0 + h * 0.78, tw);
      ctx.globalAlpha = 1;
    });

    // Overcharge button, with its cooldown drawn as a sweeping wedge.
    const bx = x0 + TURRET_KEYS.length * (w + gap);
    const ready = this.surgeReady <= 0 && this.surge <= 0;
    ctx.fillStyle = this.surge > 0 ? "rgba(255,215,106,0.24)" : "rgba(10,14,30,0.72)";
    roundRect(ctx, bx, y0, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = ready ? "#ffd76a" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = ready ? 2 : 1;
    ctx.stroke();

    const ix = bx + h * 0.46, iy = y0 + h * 0.5, ir = h * 0.26;
    if (this.surgeReady > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.arc(ix, iy, ir, -Math.PI / 2, -Math.PI / 2 + (1 - this.surgeReady / this.surgeCd) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = ready ? "#ffd76a" : "#6c7396";
    ctx.font = `800 ${Math.round(h * 0.46)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", ix, iy);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#eef1ff";
    ctx.font = `700 ${Math.round(h * 0.24)}px 'Sora', system-ui, sans-serif`;
    const tw = Math.max(20, w - h * 0.8 - 8);
    ctx.fillText("Overcharge", bx + h * 0.8, y0 + h * 0.45, tw);
    ctx.fillStyle = ready ? "#ffd76a" : "#8b90ac";
    ctx.font = `700 ${Math.round(h * 0.21)}px 'Sora', system-ui, sans-serif`;
    ctx.fillText(this.surge > 0 ? `${this.surge.toFixed(1)}s` : ready ? "ready (Q)" : `${Math.ceil(this.surgeReady)}s`, bx + h * 0.8, y0 + h * 0.78, tw);
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
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  roundRect(ctx, x - w * 0.32, y - h * 0.42, w * 0.64, h * 0.22, h * 0.11);
  ctx.fill();
}

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

export default IronVanguardGame;
