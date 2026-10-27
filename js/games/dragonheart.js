// ==========================================================================
// Dragonheart — an action RPG, unlocked with a secret code.
//
// Six regions run east from the village of Greenvale to Dragon's Spire. Each
// is a large hand-shaped map with a road, monster camps, chests and a boss
// waiting in a stone arena at the far end; beating the boss opens a portal to
// the next region and hands over a new skill or a named weapon.
//
// The hero swings a sword in a three-hit combo, dodge-rolls through attacks
// (it costs stamina and makes you briefly untouchable), casts the skills the
// bosses give up, and drinks potions. Monsters drop gold, hearts and gear in
// four rarities; the village sells potions, weapons and armour, and its
// fountain heals. Waystones carry you between regions you have reached.
//
// Every attack in the game — yours and theirs — has a visible wind-up, and
// every boss attack is telegraphed on the ground first. The game is hard
// because there is a lot to read, never because something was invisible.
//
// Progress is saved continuously: level, gear, gold, chests, bosses.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, formatNumber } from "../core/utils.js";
import { REGIONS, FOES, BOSSES, RARITY, WEAPONS, ARMORS, SKILLS, POTION_COST, xpFor } from "./dhData.js";
import { World, T, MW, MH, drawProp } from "./dhWorld.js";
import { drawHero, drawFoe, drawBoss, drawNpc, drawChest } from "./dhArt.js";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return Math.abs(d); };

const DIFF = {
  Story:  { taken: 0.6, foeHp: 0.8 },
  Hero:   { taken: 1,   foeHp: 1 },
  Legend: { taken: 1.4, foeHp: 1.3 },
};
const REGION_POW = [1, 1, 1, 1, 1, 1.6];
const HERO_SPEED = 138;
const ROLL_SPEED = 330, ROLL_TIME = 0.3, ROLL_COST = 28;
const MAX_POTIONS = 9;

const weaponOf = (it) => WEAPONS.find(w => w.id === it.id) || WEAPONS[0];
const armorOf = (it) => ARMORS.find(a => a.id === it.id) || ARMORS[0];
const itemBase = (it) => (it.kind === "weapon" ? weaponOf(it) : armorOf(it));
const itemName = (it) => `${RARITY[it.rarity].name === "Common" ? "" : RARITY[it.rarity].name + " "}${itemBase(it).name}`;
const itemPower = (it) => {
  const b = itemBase(it), m = RARITY[it.rarity].mult;
  return it.kind === "weapon" ? { atk: Math.round(b.atk * m) } : { def: Math.round(b.def * m), hp: Math.round(b.hp * m) };
};
const itemPrice = (it) => Math.round((40 * Math.pow(Math.max(1, itemBase(it).tier), 2.3) + 30) * RARITY[it.rarity].mult);

export class DragonheartGame extends GameBase {
  getDifficulties() { return ["Story", "Hero", "Legend"]; }
  getInstructions() {
    return [
      "Travel east from Greenvale through six regions. A boss waits in the stone arena at the end of each one.",
      "Beating a boss opens a portal onward and gives you a new skill or a named weapon.",
      "Attack in a three-hit combo. Roll to dodge — you are untouchable for a moment, but it costs stamina.",
      "Every attack shows a wind-up first: a flash, a shake, a glowing circle on the ground. Read it, then roll.",
      "Monsters drop gold, hearts and gear in four rarities. Open your bag to equip or sell.",
      "In the village: Mira sells potions and weapons, Bram the smith sells armour, the fountain heals. Waystones take you back.",
    ];
  }
  getKeyboardHint() { return "WASD / arrows move · J or Space attack & talk · K or Shift roll · L skill (Q switches) · H potion · I bag."; }
  getTouchHint() { return "Stick to move · ⚔ attack & talk · » roll · ✦ skill · ♥ potion · tap the bag icon for gear."; }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["d", "c", "b", "a"]; }
  getTouchButtonLabels() { return { a: "⚔", b: "»", c: "✦", d: "♥" }; }
  getScene() { return "ember"; }
  getPlayLabel() { return this._store().started ? "Continue the quest" : "Begin the quest"; }

  // -------------------------------------------------------------- save ---
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.dh) custom.dh = {};
    const s = custom.dh;
    const def = {
      started: false, lv: 1, xp: 0, gold: 40, potions: 3,
      weapon: { kind: "weapon", id: "stick", rarity: "common" },
      armor: { kind: "armor", id: "tunic", rarity: "common" },
      bag: [], skills: [], skill: null, region: 0, unlocked: 0, bosses: {}, chests: {}, kills: 0, deaths: 0, won: false,
    };
    for (const [k, v] of Object.entries(def)) if (s[k] === undefined) s[k] = JSON.parse(JSON.stringify(v));
    return s;
  }
  _save() { saveManager.saveNow(); }

  getStartExtras() {
    const s = this._store();
    const beaten = Object.keys(s.bosses).length;
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Level ${s.lv}`),
      el("span", {}, `${REGIONS[s.region]?.name || "Greenvale"}`),
      el("span", {}, `Bosses ${beaten}/${REGIONS.length}`),
      el("span", {}, `◈ ${formatNumber(s.gold)} gold`),
      s.won ? el("span", {}, "🐉 Ashvane defeated") : null,
    ]);
  }

  bankAndQuit() {
    this._save();
    this.endGame({ result: "score", score: this._score(), message: "Your progress is saved. The road east will be waiting.", extraStats: this._endStats() });
  }

  _score() {
    const s = this._store();
    return s.lv * 500 + Object.keys(s.bosses).length * 3000 + s.kills * 10 + (s.won ? 20000 : 0);
  }
  _endStats() {
    const s = this._store();
    return [{ label: "Level", value: s.lv }, { label: "Bosses", value: `${Object.keys(s.bosses).length}/${REGIONS.length}` }, { label: "Monsters", value: formatNumber(s.kills) }];
  }

  // ------------------------------------------------------------- stats ---
  get maxHp() { const s = this._store(); return Math.round(100 + (s.lv - 1) * 18 + (itemPower(s.armor).hp || 0)); }
  get atk() { const s = this._store(); return 8 + (s.lv - 1) * 3 + (itemPower(s.weapon).atk || 0); }
  get def() { return itemPower(this._store().armor).def || 0; }
  get maxMana() { return 60 + this._store().lv * 4; }

  // -------------------------------------------------------------- setup --
  onInit() {
    this.difficulty = "Hero";
    this.createCanvas();
    this.input.onKey("KeyI", () => this.state === "playing" && this._openBag());
    this.input.onKey("KeyQ", () => this._cycleSkill());
    this.input.onKey("KeyH", () => this._potion());
    this.input.onKey("KeyE", () => this._interact());
    this.input.onPointer("down", (p) => this._tap(p.x, p.y));
  }

  onStart() {
    const s = this._store();
    s.started = true;
    this.t = 0;
    this.shake = 0;
    this.hitStop = 0;
    this.modal = false;
    this.dead = null;
    this.victory = null;
    this.mana = this.maxMana;
    this.stamina = 100;
    this.hero = {
      x: 0, y: 0, vx: 0, vy: 0, ang: 0, walk: 0, moving: false,
      hp: this.maxHp, iT: 0, hurt: 0, rollT: 0, rollDir: 0, rollSpin: 0,
      swing: -1, swingDir: 0, combo: 0, lastSwing: -9, atkCd: 0, hitDone: true, skillCd: 0, slow: 0,
    };
    this._enter(s.region || 0, s.region ? "entry" : "village");
    this._hud();
  }

  onDestroy() { this._save(); }

  // Escape closes a shop or the bag; it must not also pause the game.
  togglePause() { if (this.modal) return; super.togglePause(); }

  // ----------------------------------------------------------- regions ---
  _enter(ri, spot = "entry") {
    const s = this._store();
    this.ri = ri;
    s.region = ri;
    this.world = new World(ri);
    const W = this.world;
    const R = REGIONS[ri];
    const h = this.hero;
    const at = spot === "village" && W.fountain ? { x: W.fountain.x, y: W.fountain.y + 48 }
      : spot === "arena" ? { x: W.arena.x - W.arena.r + 40, y: W.arena.y } : W.entry;
    h.x = at.x; h.y = at.y; h.vx = h.vy = 0; h.ang = 0;
    this.cam = { x: h.x, y: h.y };
    const d = DIFF[this.difficulty] || DIFF.Hero;
    const pool = Object.entries(R.foes);
    const total = pool.reduce((a, [, w]) => a + w, 0);
    this.foes = W.spawns.map((sp) => {
      let roll = Math.random() * total, type = pool[0][0];
      for (const [k, w] of pool) { if (roll < w) { type = k; break; } roll -= w; }
      const p = W.walkableNear(sp.x, sp.y);
      return this._makeFoe(type, p.x, p.y, Math.random() < 0.1 + ri * 0.02);
    });
    void d;
    this.chests = W.chests.map(c => ({ ...c, opened: !!s.chests[c.id] }));
    this.shots = [];
    this.hazards = [];
    this.fx = [];
    this.texts = [];
    this.drops = [];
    this.weather = [];
    this.boss = null;
    this.portal = s.bosses[R.boss] ? { x: W.arena.x, y: W.arena.y } : null;
    this.banner = { title: R.name, sub: R.sub, t: 0 };
    this._save();
    this._hud();
  }

  _makeFoe(type, x, y, elite = false) {
    const F = FOES[type];
    const d = DIFF[this.difficulty] || DIFF.Hero;
    const pow = REGION_POW[this.ri] || 1;
    const hp = Math.round(F.hp * d.foeHp * pow * (elite ? 2.4 : 1));
    return {
      type, ...F, x, y, hx: x, hy: y, hp, maxHp: hp, atk: F.atk * pow * (elite ? 1.4 : 1), elite,
      r: F.r * (elite ? 1.25 : 1), xp: Math.round(F.xp * (elite ? 3 : 1)), gold: Math.round(F.gold * (elite ? 3 : 1)),
      state: "idle", st: rand(0, 2), wind: 0, flash: 0, kx: 0, ky: 0, ang: 0, seed: Math.random() * 10,
      hitBy: -1, contactCd: 0, wx: x, wy: y,
    };
  }

  // ------------------------------------------------------------- input ---
  _btn(keys, v) {
    const inp = this.input;
    let pressed = false;
    for (const k of keys) if (inp.consumePressed(k)) pressed = true;
    if (v && inp.consumeTap(v)) pressed = true;
    const held = inp.isDown(...keys) || (v && !!inp.virtual[v]);
    return { pressed, held };
  }

  _tap(px, py) {
    if (this.state !== "playing" || this.modal) return;
    const b = this._bagBtn;
    if (b && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { this._openBag(); return; }
    const k = this._skillBtn;
    if (k && px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h) this._cycleSkill();
  }

  // -------------------------------------------------------------- update -
  onUpdate(dt) {
    if (this.modal) return;
    this.t += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 3.2) this.banner = null; }
    this._stepFx(dt);
    if (this.dead) {
      this.dead.t += dt;
      if (this.dead.t > 2.4) this._respawn();
      return;
    }
    if (this.victory) {
      this.victory.t += dt;
      if (this.victory.t > 4) { this.victory = null; this._win(); }
      return;
    }
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    this._stepHero(dt);
    this._stepFoes(dt);
    if (this.boss) this._stepBoss(dt);
    this._stepShots(dt);
    this._stepHazards(dt);
    this._stepDrops(dt);
    this._checkArena();
    this.shake = Math.max(0, this.shake - dt * 3);
    // Camera with a little look-ahead.
    const h = this.hero;
    const tx = h.x + h.vx * 0.18, ty = h.y + h.vy * 0.18 - 10;
    const k = Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    if (Math.floor(this.t) !== Math.floor(this.t - dt)) this._hud();
  }

  _stepHero(dt) {
    const h = this.hero, s = this._store(), W = this.world;
    h.iT = Math.max(0, h.iT - dt);
    h.hurt = Math.max(0, h.hurt - dt);
    h.atkCd = Math.max(0, h.atkCd - dt);
    h.skillCd = Math.max(0, h.skillCd - dt);
    h.slow = Math.max(0, h.slow - dt);
    this.stamina = Math.min(100, this.stamina + 38 * dt);
    this.mana = Math.min(this.maxMana, this.mana + 4 * dt);

    const atk = this._btn(["KeyJ", "Space"], "a");
    const roll = this._btn(["KeyK", "ShiftLeft", "ShiftRight"], "b");
    const skill = this._btn(["KeyL"], "c");
    const pot = this._btn([], "d");
    if (pot.pressed) this._potion();

    const ax = this.input.axes();
    const m = hyp(ax.x, ax.y);
    if (h.rollT > 0) {
      h.rollT -= dt;
      h.rollSpin += dt * 22;
      h.vx = Math.cos(h.rollDir) * ROLL_SPEED; h.vy = Math.sin(h.rollDir) * ROLL_SPEED;
    } else {
      const sp = HERO_SPEED * (h.swing >= 0 ? 0.45 : 1) * (h.slow > 0 ? 0.55 : 1);
      let tvx = 0, tvy = 0;
      if (m > 0.15) { const k = Math.min(1, m); tvx = (ax.x / m) * sp * k; tvy = (ax.y / m) * sp * k; if (h.swing < 0) h.ang = Math.atan2(ax.y, ax.x); }
      const icy = W.region.water === "ice" && W.onLiquid(h.x, h.y);
      const acc = Math.min(1, dt * (icy ? 2.5 : 14));
      h.vx += (tvx - h.vx) * acc; h.vy += (tvy - h.vy) * acc;
      if (roll.pressed && this.stamina >= ROLL_COST) {
        this.stamina -= ROLL_COST;
        h.rollT = ROLL_TIME; h.rollDir = m > 0.15 ? Math.atan2(ax.y, ax.x) : h.ang; h.iT = Math.max(h.iT, ROLL_TIME + 0.05);
        h.swing = -1;
        audioManager.play("swoosh");
        this._dust(h.x, h.y, 6);
      }
    }
    h.moving = hyp(h.vx, h.vy) > 20;
    if (h.moving) h.walk += dt * 6;
    const p = W.slide(h.x, h.y, h.x + h.vx * dt, h.y + h.vy * dt, 9);
    h.x = p.x; h.y = p.y;
    if (this.boss && this.boss.locked) {
      const d = hyp(h.x - W.arena.x, h.y - W.arena.y), lim = W.arena.r - 18;
      if (d > lim) { h.x = W.arena.x + (h.x - W.arena.x) / d * lim; h.y = W.arena.y + (h.y - W.arena.y) / d * lim; }
    }

    // Attack — or talk, when there is someone to talk to.
    if (atk.pressed && this._interact(true)) return;
    if ((atk.pressed || atk.held) && h.atkCd <= 0 && h.rollT <= 0) {
      h.combo = this.t - h.lastSwing < 0.55 && h.combo < 2 ? h.combo + 1 : 0;
      h.lastSwing = this.t;
      h.swing = 0; h.swingDir = h.ang; h.hitDone = false;
      h.atkCd = h.combo === 2 ? 0.46 : 0.27;
      audioManager.play("swoosh");
    }
    if (h.swing >= 0) {
      h.swing += dt / 0.22;
      if (!h.hitDone && h.swing > 0.35) { h.hitDone = true; this._swingHit(); }
      if (h.swing >= 1) h.swing = -1;
    }
    if (skill.pressed) this._castSkill();
  }

  _swingHit() {
    const h = this.hero;
    const range = h.combo === 2 ? 50 : 42;
    const arc = h.combo === 2 ? 1.5 : 1.15;
    const mult = h.combo === 2 ? 1.7 : 1;
    const hx = h.x, hy = h.y - 10;
    let hit = false;
    for (const f of this.foes) {
      if (f.hp <= 0) continue;
      const fy = f.y - (f.ai === "float" ? f.r * 1.8 : f.r * 0.8);
      const d = hyp(f.x - hx, fy - hy);
      if (d > range + f.r || angDiff(Math.atan2(fy - hy, f.x - hx), h.swingDir) > arc) continue;
      this._hurtFoe(f, this.atk * mult, h.swingDir, h.combo === 2 ? 260 : 150);
      hit = true;
    }
    const b = this.boss;
    if (b && b.hp > 0 && b.fade !== 0) {
      const d = hyp(b.x - hx, b.y - b.r * 0.8 - hy);
      if (d < range + b.r && (angDiff(Math.atan2(b.y - b.r * 0.8 - hy, b.x - hx), h.swingDir) < arc || d < b.r + 12)) { this._hurtBoss(this.atk * mult); hit = true; }
    }
    // Breakables.
    for (const p of this.world.props) {
      if (!p.breakable || p.gone) continue;
      if (hyp(p.x - hx, p.y - 8 - hy) < range + 8) {
        this.world.removeProp(p);
        for (let i = 0; i < 10; i++) this.fx.push({ x: p.x, y: p.y - 8, vx: rand(-90, 90), vy: rand(-140, -20), g: 300, life: rand(0.4, 0.8), t: 0, color: p.type === "pot" ? "#a0603a" : "#3d8f38", size: rand(2, 4) });
        audioManager.play("pop");
        const r = Math.random();
        if (r < 0.55) this._drop("gold", p.x, p.y, Math.round(rand(2, 6) * (this.ri + 1)));
        else if (r < 0.75) this._drop("heart", p.x, p.y);
      }
    }
    if (hit) { this.hitStop = 0.045; this.shake = Math.max(this.shake, 0.18); audioManager.play("hit"); }
  }

  _crit(dmg) { const c = Math.random() < 0.12; return { dmg: Math.round(dmg * rand(0.9, 1.1) * (c ? 1.8 : 1)), crit: c }; }

  _hurtFoe(f, raw, ang, kb) {
    const { dmg, crit } = this._crit(raw);
    f.hp -= dmg; f.flash = 0.1;
    if (f.ai !== "tank") { f.kx = Math.cos(ang) * kb; f.ky = Math.sin(ang) * kb; if (f.state === "wind") { f.state = "recover"; f.st = 0.3; f.wind = 0; } }
    this._text(f.x, f.y - f.r * 2.2, String(dmg), crit ? "#ffd76a" : "#ffffff", crit);
    this._burst(f.x, f.y - f.r, f.color, 6);
    if (f.hp <= 0) this._killFoe(f);
    else if (f.state === "idle" || f.state === "wander") { f.state = "chase"; }
  }

  _killFoe(f) {
    const s = this._store();
    s.kills++;
    this._burst(f.x, f.y - f.r, f.color, 16, true);
    audioManager.play("pop");
    this._gainXp(f.xp);
    this._drop("gold", f.x, f.y, f.gold + Math.round(rand(0, f.gold)));
    const r = Math.random();
    if (r < 0.1) this._drop("heart", f.x + 6, f.y);
    else if (r < 0.14) this._drop("potion", f.x + 6, f.y);
    if (Math.random() < (f.elite ? 0.55 : 0.035)) this._drop("gear", f.x - 6, f.y, this._rollGear(f.elite));
  }

  _hurtBoss(raw) {
    const b = this.boss;
    const { dmg, crit } = this._crit(raw);
    b.hp -= dmg; b.flash = 0.1;
    this._text(b.x + rand(-20, 20), b.y - b.r * 2, String(dmg), crit ? "#ffd76a" : "#ffffff", crit);
    this._burst(b.x, b.y - b.r, b.color, 5);
    if (!b.enraged && b.hp < b.maxHp * 0.5) {
      b.enraged = true;
      this._text(b.x, b.y - b.r * 2.6, "ENRAGED!", "#ff5470", true);
      audioManager.play("explosion");
      this.shake = 0.6;
    }
    if (b.hp <= 0) this._killBoss();
  }

  _hurtHero(raw, fromX, fromY) {
    const h = this.hero;
    if (h.iT > 0 || this.dead || this.victory) return;
    const d = DIFF[this.difficulty] || DIFF.Hero;
    const def = this.def;
    const dmg = Math.max(1, Math.round(raw * d.taken * (1 - def / (def + 80)) * rand(0.9, 1.1)));
    h.hp -= dmg; h.iT = 0.65; h.hurt = 0.65;
    const a = Math.atan2(h.y - fromY, h.x - fromX);
    h.vx += Math.cos(a) * 220; h.vy += Math.sin(a) * 220;
    this._text(h.x, h.y - 38, `-${dmg}`, "#ff5470", false);
    this.shake = Math.max(this.shake, 0.35);
    audioManager.play("hit");
    this.vibrateOn?.(30);
    if (h.hp <= 0) this._die();
  }

  _gainXp(n) {
    const s = this._store();
    s.xp += n;
    while (s.xp >= xpFor(s.lv)) {
      s.xp -= xpFor(s.lv);
      s.lv++;
      this.hero.hp = this.maxHp;
      this.mana = this.maxMana;
      this.banner = { title: `Level ${s.lv}!`, sub: `+18 health · +3 attack`, t: 0.4, gold: true };
      audioManager.play("levelup");
      for (let i = 0; i < 30; i++) this.fx.push({ x: this.hero.x, y: this.hero.y - 12, vx: rand(-60, 60), vy: rand(-180, -40), g: 60, life: rand(0.6, 1.2), t: 0, color: i % 2 ? "#ffd76a" : "#ffffff", size: rand(2, 3.5) });
    }
    this._hud();
  }

  _rollGear(good = false, tierBias = 0) {
    const r = Math.random() * (good ? 0.7 : 1);
    const rarity = r < (good ? 0.12 : 0.025) ? "legendary" : r < (good ? 0.4 : 0.11) ? "epic" : r < (good ? 0.75 : 0.38) ? "rare" : "common";
    const tier = clamp(this.ri + 1 + tierBias - (Math.random() < 0.35 ? 1 : 0), 1, 6);
    const kind = Math.random() < 0.5 ? "weapon" : "armor";
    const list = kind === "weapon" ? WEAPONS : ARMORS;
    return { kind, id: list.find(x => x.tier === tier).id, rarity };
  }

  // ---------------------------------------------------------- skills -----
  _cycleSkill() {
    const s = this._store();
    if (!s.skills.length) { this._text(this.hero.x, this.hero.y - 40, "No skills yet — beat a boss", "#9fd8ff"); return; }
    const i = s.skills.indexOf(s.skill);
    s.skill = s.skills[(i + 1) % s.skills.length];
    audioManager.play("select");
    this._text(this.hero.x, this.hero.y - 40, SKILLS[s.skill].name, SKILLS[s.skill].color);
  }

  _castSkill() {
    const s = this._store(), h = this.hero;
    const id = s.skill;
    if (!id) { this._cycleSkill(); return; }
    const sk = SKILLS[id];
    if (h.skillCd > 0) return;
    if (this.mana < sk.mana) { this._text(h.x, h.y - 40, "Not enough mana", "#7cb8ff"); audioManager.play("error"); return; }
    this.mana -= sk.mana; h.skillCd = sk.cd;
    if (id === "fireball") {
      this.shots.push({ x: h.x + Math.cos(h.ang) * 14, y: h.y - 12 + Math.sin(h.ang) * 10, vx: Math.cos(h.ang) * 380, vy: Math.sin(h.ang) * 380, r: 8, dmg: this.atk * 2.2, owner: "hero", kind: "fireball", life: 1.2, splash: 56 });
      audioManager.play("swoosh");
    } else if (id === "whirlwind") {
      h.swing = -1;
      for (let k = 0; k < 3; k++) setTimeout(() => this._spinHit(), k * 130);
      audioManager.play("swoosh");
    } else if (id === "heal") {
      const amt = Math.round(this.maxHp * 0.4);
      h.hp = Math.min(this.maxHp, h.hp + amt);
      this._text(h.x, h.y - 40, `+${amt}`, "#2ee6a6", true);
      for (let i = 0; i < 24; i++) this.fx.push({ x: h.x + rand(-16, 16), y: h.y, vx: 0, vy: rand(-90, -40), g: 0, life: rand(0.6, 1.1), t: 0, color: "#2ee6a6", size: rand(2, 4) });
      audioManager.play("achievement");
    }
  }

  _spinHit() {
    if (this.state !== "playing" || this.dead) return;
    const h = this.hero;
    this.fx.push({ ring: true, x: h.x, y: h.y - 10, r0: 10, r1: 70, life: 0.25, t: 0, color: "#7cf0ff" });
    for (const f of this.foes) if (f.hp > 0 && hyp(f.x - h.x, f.y - h.y) < 70 + f.r) this._hurtFoe(f, this.atk * 1.1, Math.atan2(f.y - h.y, f.x - h.x), 220);
    const b = this.boss;
    if (b && b.hp > 0 && hyp(b.x - h.x, b.y - h.y) < 70 + b.r) this._hurtBoss(this.atk * 1.1);
  }

  _potion() {
    const s = this._store(), h = this.hero;
    if (this.state !== "playing" || this.dead) return;
    if (s.potions <= 0) { this._text(h.x, h.y - 40, "No potions", "#ff9f43"); audioManager.play("error"); return; }
    if (h.hp >= this.maxHp) { this._text(h.x, h.y - 40, "Health is full", "#9fd8ff"); return; }
    s.potions--;
    const amt = Math.round(this.maxHp * 0.45);
    h.hp = Math.min(this.maxHp, h.hp + amt);
    this._text(h.x, h.y - 40, `+${amt}`, "#2ee6a6", true);
    audioManager.play("coin");
    this._save(); this._hud();
  }

  // ----------------------------------------------------------- monsters --
  _stepFoes(dt) {
    const h = this.hero, W = this.world;
    for (const f of this.foes) {
      if (f.hp <= 0) continue;
      f.flash = Math.max(0, f.flash - dt);
      f.contactCd = Math.max(0, f.contactCd - dt);
      const dx = h.x - f.x, dy = h.y - f.y, d = hyp(dx, dy);
      if (d > 760) continue;          // asleep off-screen
      const toHero = Math.atan2(dy, dx);
      const flying = f.ai === "float";
      let mvx = 0, mvy = 0;
      f.st -= dt;
      // Knockback decays.
      if (f.kx || f.ky) { f.kx *= Math.pow(0.002, dt); f.ky *= Math.pow(0.002, dt); if (Math.abs(f.kx) + Math.abs(f.ky) < 4) f.kx = f.ky = 0; }
      const aggro = d < 240 || f.state === "chase" || f.state === "wind" || f.state === "act" || f.state === "recover";
      if (!aggro) {
        // Wander near home.
        if (f.st <= 0) { f.st = rand(1.5, 3.5); const a = rand(0, TAU); f.wx = f.hx + Math.cos(a) * 60; f.wy = f.hy + Math.sin(a) * 60; }
        const wdx = f.wx - f.x, wdy = f.wy - f.y, wd = hyp(wdx, wdy);
        if (wd > 6) { mvx = wdx / wd * f.spd * 0.35; mvy = wdy / wd * f.spd * 0.35; f.ang = Math.atan2(wdy, wdx); }
      } else {
        if (f.state === "idle") f.state = "chase";
        // Leash: give up if dragged too far from home.
        if (hyp(f.x - f.hx, f.y - f.hy) > 620 && d > 200) { f.state = "idle"; f.hx = f.x; f.hy = f.y; }
        if (f.state === "chase") {
          f.ang = toHero;
          if (f.ai === "ranged") {
            const want = d < 150 ? -1 : d > 230 ? 1 : 0;
            const side = Math.sin(this.t * 0.8 + f.seed) * 0.6;
            mvx = (Math.cos(toHero) * want + Math.cos(toHero + Math.PI / 2) * side) * f.spd;
            mvy = (Math.sin(toHero) * want + Math.sin(toHero + Math.PI / 2) * side) * f.spd;
            if (f.st <= 0 && d < 330) { f.state = "wind"; f.st = 0.55; }
          } else {
            const reach = f.ai === "lunge" ? 130 : f.ai === "tank" ? f.r + 38 : f.ai === "float" ? 90 : f.r + 26;
            if (d > reach) { mvx = Math.cos(toHero) * f.spd; mvy = Math.sin(toHero) * f.spd; if (flying) { mvx += Math.cos(this.t * 3 + f.seed) * 40; mvy += Math.sin(this.t * 2.3 + f.seed) * 40; } }
            else if (f.st <= 0) { f.state = "wind"; f.st = f.ai === "tank" ? 0.8 : f.ai === "lunge" ? 0.5 : 0.42; f.tx = h.x; f.ty = h.y; }
          }
        } else if (f.state === "wind") {
          f.wind = 1 - Math.max(0, f.st) / (f.ai === "tank" ? 0.8 : 0.5);
          f.ang = toHero;
          if (f.ai === "tank" && !f.marked) { f.marked = true; this.hazards.push({ kind: "circle", x: f.x, y: f.y, r: 70, delay: 0.8, t: 0, dmg: f.atk, owner: f }); }
          if (f.st <= 0) {
            f.wind = 0; f.marked = false;
            if (f.ai === "ranged") { this._foeShoot(f, toHero); f.state = "recover"; f.st = rand(1.2, 2); }
            else if (f.ai === "lunge" || f.ai === "float") { f.state = "act"; f.st = f.ai === "float" ? 0.5 : 0.36; f.dashA = Math.atan2(f.ty - f.y, f.tx - f.x) || toHero; }
            else if (f.ai === "melee") {
              if (d < f.r + 38 && angDiff(toHero, f.ang) < 1) this._hurtHero(f.atk, f.x, f.y);
              this.fx.push({ slash: true, x: f.x, y: f.y - f.r, a: f.ang, life: 0.18, t: 0, color: "#ffffff" });
              f.state = "recover"; f.st = 0.7;
            } else { f.state = "recover"; f.st = 0.9; this.shake = Math.max(this.shake, 0.25); }
          }
        } else if (f.state === "act") {
          const sp = f.spd * (f.ai === "float" ? 3 : 3.6);
          mvx = Math.cos(f.dashA) * sp; mvy = Math.sin(f.dashA) * sp;
          if (f.st <= 0) { f.state = "recover"; f.st = rand(0.6, 1); }
        } else if (f.state === "recover") {
          if (f.st <= 0) { f.state = "chase"; f.st = rand(0.2, 0.7); }
        }
      }
      // Contact damage for chargers and fliers.
      if ((f.ai === "lunge" || f.ai === "float" || f.state === "act") && f.contactCd <= 0 && d < f.r + 12) {
        if (f.state === "act" || f.ai === "float") { this._hurtHero(f.atk, f.x, f.y); f.contactCd = 0.8; }
      }
      const nx = f.x + (mvx + f.kx) * dt, ny = f.y + (mvy + f.ky) * dt;
      const p = W.slide(f.x, f.y, nx, ny, Math.min(12, f.r * 0.8), flying);
      f.x = p.x; f.y = p.y;
      // Monsters never follow you into a boss fight.
      if (this.boss?.locked && hyp(f.x - W.arena.x, f.y - W.arena.y) < W.arena.r + 10 && !f.summoned) {
        const a = Math.atan2(f.y - W.arena.y, f.x - W.arena.x);
        f.x = W.arena.x + Math.cos(a) * (W.arena.r + 12); f.y = W.arena.y + Math.sin(a) * (W.arena.r + 12);
      }
    }
    // Light separation so packs do not stack into one sprite.
    const fs = this.foes;
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i], b = fs[j];
      if (a.hp <= 0 || b.hp <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy), min = (a.r + b.r) * 0.8;
      if (d < min && d > 0.01) { const k = (min - d) / 2 / d; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
    this.foes = this.foes.filter(f => f.hp > 0);
  }

  _foeShoot(f, a) {
    const kind = f.shot || "arrow";
    const spd = { arrow: 300, spore: 150, ice: 220, fire: 240 }[kind];
    const shots = kind === "spore" ? [-0.3, 0, 0.3] : kind === "fire" && f.elite ? [-0.2, 0, 0.2] : [0];
    for (const o of shots) this.shots.push({ x: f.x, y: f.y - f.r * 1.4, vx: Math.cos(a + o) * spd, vy: Math.sin(a + o) * spd, r: kind === "spore" ? 7 : 5, dmg: f.atk, owner: "foe", kind, life: 2.4 });
    audioManager.play(kind === "arrow" ? "swoosh" : "pop");
  }

  // -------------------------------------------------------------- bosses -
  _checkArena() {
    const W = this.world, h = this.hero, R = REGIONS[this.ri];
    const s = this._store();
    if (!this.boss && !s.bosses[R.boss] && hyp(h.x - W.arena.x, h.y - W.arena.y) < W.arena.r - 50) {
      const B = BOSSES[R.boss];
      const d = DIFF[this.difficulty] || DIFF.Hero;
      const hp = Math.round(B.hp * d.foeHp);
      this.boss = {
        type: R.boss, ...B, x: W.arena.x + 60, y: W.arena.y, hp, maxHp: hp, flash: 0, wind: 0, ang: Math.PI,
        state: "intro", st: 1.6, move: null, mi: 0, enraged: false, locked: true, contactCd: 0,
      };
      this.banner = { title: B.name, sub: "The arena seals behind you", t: 0, boss: true };
      audioManager.play("explosion");
      this.shake = 0.8;
      // Clear any leftover monsters inside.
      for (const f of this.foes) if (hyp(f.x - W.arena.x, f.y - W.arena.y) < W.arena.r) f.hp = 0;
    }
    if (this.portal && hyp(h.x - this.portal.x, h.y - this.portal.y) < 26 && !this._portalCd) {
      if (this.ri < REGIONS.length - 1) { this._portalCd = true; audioManager.play("levelup"); this._enter(this.ri + 1, "entry"); setTimeout(() => (this._portalCd = false), 800); }
    }
  }

  _stepBoss(dt) {
    const b = this.boss, h = this.hero, W = this.world;
    if (b.hp <= 0) { this._killBoss(); return; }
    b.flash = Math.max(0, b.flash - dt);
    b.contactCd = Math.max(0, b.contactCd - dt);
    b.st -= dt * (b.enraged ? 1.3 : 1);
    const toHero = Math.atan2(h.y - b.y, h.x - b.x), d = hyp(h.x - b.x, h.y - b.y);
    if (b.state === "intro") { if (b.st <= 0) { b.state = "idle"; b.st = 0.8; } return; }
    if (b.state === "idle") {
      b.ang = toHero;
      const sp = b.type === "lich" ? 70 : 55;
      if (d > b.r + 40) { b.x += Math.cos(toHero) * sp * dt; b.y += Math.sin(toHero) * sp * dt; }
      if (b.st <= 0) {
        b.move = b.moves[b.mi++ % b.moves.length];
        b.state = "wind"; b.st = b.move === "lunge" ? 0.75 : b.move === "spiral" ? 0.5 : 0.6;
        this._bossTelegraph(b);
      }
    } else if (b.state === "wind") {
      b.wind = clamp(1 - b.st / 0.7, 0, 1);
      if (b.move === "breath" || b.move === "lunge") b.ang = b.ang + clamp(angDiff(toHero, b.ang) * Math.sign(Math.sin(toHero - b.ang)), -dt * 1.5, dt * 1.5);
      if (b.st <= 0) { b.wind = 0; b.state = "act"; b.st = { spiral: 2.6, breath: 1.7, lunge: 0.7, blink: 0.9 }[b.move] || 0.1; b.at = 0; this._bossAct(b, true); }
    } else if (b.state === "act") {
      b.at += dt;
      this._bossAct(b, false, dt);
      if (b.st <= 0) { b.state = "idle"; b.st = rand(0.9, 1.5) * (b.enraged ? 0.7 : 1); b.fade = undefined; }
    }
    // Keep inside the arena.
    const ad = hyp(b.x - W.arena.x, b.y - W.arena.y), lim = W.arena.r - b.r * 0.6;
    if (ad > lim) { b.x = W.arena.x + (b.x - W.arena.x) / ad * lim; b.y = W.arena.y + (b.y - W.arena.y) / ad * lim; }
    // Touching the boss hurts.
    if (b.contactCd <= 0 && d < b.r * 0.85 + 8 && b.fade !== 0) { this._hurtHero(b.atk * 0.7, b.x, b.y); b.contactCd = 0.9; }
  }

  _bossTelegraph(b) {
    const h = this.hero;
    if (b.move === "slam") {
      const n = b.enraged ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const x = i === 0 ? h.x : h.x + rand(-140, 140), y = i === 0 ? h.y : h.y + rand(-110, 110);
        this.hazards.push({ kind: "circle", x, y, r: 58, delay: 0.95 + i * 0.12, t: 0, dmg: b.atk * 1.3 });
      }
    } else if (b.move === "roots") {
      const n = b.enraged ? 12 : 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + rand(0, 0.3);
        for (let i = 1; i <= 6; i++) this.hazards.push({ kind: "circle", x: b.x + Math.cos(a) * (b.r + i * 42), y: b.y + Math.sin(a) * (b.r + i * 42), r: 22, delay: 0.7 + i * 0.09, t: 0, dmg: b.atk, spike: true });
      }
    } else if (b.move === "lunge") {
      b.lungeA = Math.atan2(h.y - b.y, h.x - b.x);
      this.hazards.push({ kind: "line", x: b.x, y: b.y, a: b.lungeA, len: 420, w: b.r * 1.6, delay: 0.75, t: 0, dmg: 0, follow: b });
    } else if (b.move === "breath") {
      this.hazards.push({ kind: "cone", x: b.x, y: b.y - b.r, a: Math.atan2(h.y - b.y, h.x - b.x), len: 300, spread: 0.45, delay: 0.6, t: 0, dmg: 0, follow: b });
    }
  }

  _bossAct(b, first, dt = 0) {
    const h = this.hero;
    const toHero = Math.atan2(h.y - b.y, h.x - b.x);
    const shot = (a, spd, r = 9, kind = "orb") => this.shots.push({ x: b.x, y: b.y - b.r * 0.9, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r, dmg: b.atk * 0.8, owner: "foe", kind, life: 3.4, color: b.color });
    switch (b.move) {
      case "ring": if (first) { const n = b.enraged ? 22 : 15, o = rand(0, 1); for (let i = 0; i < n; i++) shot(o + (i / n) * TAU, 170); audioManager.play("explosion"); } break;
      case "spiral": {
        b.sp = (b.sp || 0) + dt;
        if (b.sp > (b.enraged ? 0.07 : 0.1)) {
          b.sp = 0; b.spA = (b.spA || 0) + 0.42;
          const arms = b.enraged ? 3 : 2;
          for (let k = 0; k < arms; k++) shot(b.spA + (k / arms) * TAU, 160, 7);
        }
        break;
      }
      case "summon": if (first) {
        const R = REGIONS[this.ri], types = Object.keys(R.foes);
        const alive = this.foes.filter(f => f.summoned).length;
        for (let i = 0; i < Math.min(3, 6 - alive); i++) {
          const a = rand(0, TAU), f = this._makeFoe(types[(Math.random() * types.length) | 0], b.x + Math.cos(a) * (b.r + 30), b.y + Math.sin(a) * (b.r + 30));
          f.summoned = true; f.state = "chase"; f.hx = this.world.arena.x; f.hy = this.world.arena.y;
          this.foes.push(f);
          this._burst(f.x, f.y, "#b06bff", 12);
        }
        audioManager.play("levelup");
      } break;
      case "lunge": {
        const sp = b.enraged ? 560 : 470;
        b.x += Math.cos(b.lungeA) * sp * dt; b.y += Math.sin(b.lungeA) * sp * dt; b.ang = b.lungeA;
        if (Math.random() < 0.6) this._dust(b.x, b.y, 2);
        if (hyp(h.x - b.x, h.y - b.y) < b.r + 14) this._hurtHero(b.atk * 1.2, b.x, b.y);
        break;
      }
      case "blink": {
        if (b.at < 0.35) b.fade = 1 - b.at / 0.35;
        else if (!b.blinked) {
          b.blinked = true;
          const a = rand(0, TAU); b.x = h.x + Math.cos(a) * 170; b.y = h.y + Math.sin(a) * 170;
          b.fade = 0.01;
        } else b.fade = Math.min(1, (b.at - 0.35) / 0.3);
        if (b.at > 0.7 && !b.blinkShot) { b.blinkShot = true; const n = 10; for (let i = 0; i < n; i++) shot((i / n) * TAU, 190); }
        if (b.st <= 0.02) { b.blinked = false; b.blinkShot = false; b.fade = undefined; }
        break;
      }
      case "breath": {
        b.br = (b.br || 0) + dt;
        b.ang += clamp(Math.sin(toHero - b.ang), -1, 1) * dt * 0.9;
        if (b.br > 0.04) {
          b.br = 0;
          const a = b.ang + rand(-0.4, 0.4);
          this.shots.push({ x: b.x + Math.cos(b.ang) * b.r, y: b.y - b.r * 1.3 + Math.sin(b.ang) * b.r * 0.5, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, r: 9, dmg: b.atk * 0.55, owner: "foe", kind: b.type === "dragon" ? "void" : "fire", life: 0.85 });
        }
        break;
      }
      case "slam": case "roots": if (first) { this.shake = 0.3; } break;
    }
  }

  _killBoss() {
    const b = this.boss, s = this._store(), W = this.world, R = REGIONS[this.ri];
    s.bosses[b.type] = true;
    s.unlocked = Math.max(s.unlocked, Math.min(REGIONS.length - 1, this.ri + 1));
    for (let i = 0; i < 80; i++) this.fx.push({ x: b.x + rand(-b.r, b.r), y: b.y - b.r + rand(-b.r, b.r), vx: rand(-220, 220), vy: rand(-260, 60), g: 260, life: rand(0.6, 1.6), t: 0, color: i % 3 ? b.color : "#ffd76a", size: rand(2, 6) });
    this.fx.push({ ring: true, x: b.x, y: b.y - b.r, r0: 20, r1: 260, life: 0.8, t: 0, color: "#ffd76a" });
    this.shake = 1;
    audioManager.play("win");
    this._gainXp(b.xp);
    this._drop("gold", b.x, b.y, b.gold);
    for (const f of this.foes) if (f.summoned) f.hp = 0;
    this.shots = this.shots.filter(p => p.owner === "hero");
    this.hazards = [];
    const rw = b.reward;
    let what = "";
    if (rw.skill) {
      if (!s.skills.includes(rw.skill)) s.skills.push(rw.skill);
      s.skill = rw.skill;
      what = `New skill: ${SKILLS[rw.skill].name} — press L / ✦`;
    }
    if (rw.gear) {
      const it = { kind: "weapon", id: rw.gear, rarity: "epic" };
      this._drop("gear", b.x + 30, b.y, it);
      what = `It dropped the ${itemName(it)}!`;
    }
    this.boss = null;
    if (rw.win) {
      s.won = true;
      this._save();
      this.victory = { t: 0 };
      this.banner = { title: "ASHVANE FALLS", sub: "Greenvale is safe. You are the Dragonheart.", t: 0, gold: true };
      return;
    }
    this.portal = { x: W.arena.x, y: W.arena.y };
    this.banner = { title: "VICTORY", sub: what || `The way to ${REGIONS[this.ri + 1].name} is open`, t: 0, gold: true };
    // A chest of the boss's own.
    this._drop("gear", b.x - 30, b.y + 10, this._rollGear(true, 1));
    void R;
    this._save(); this._hud();
  }

  _win() {
    this.endGame({ result: "win", score: this._score(), message: "Ashvane, the Elder Dragon, is defeated. Your save keeps everything — come back and clear the regions on Legend.", extraStats: this._endStats() });
  }

  // ------------------------------------------------- shots and hazards ---
  _stepShots(dt) {
    const h = this.hero, W = this.world;
    for (const p of this.shots) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind !== "void" && p.kind !== "orb" && W.blocked(p.x, p.y + 10, true)) p.life = 0;
      if (p.owner === "foe") {
        if (hyp(p.x - h.x, p.y - (h.y - 12)) < p.r + 9 && h.iT <= 0) {
          this._hurtHero(p.dmg, p.x - p.vx, p.y - p.vy);
          if (p.kind === "ice") h.slow = 1.5;
          p.life = 0;
        }
      } else {
        let hit = null;
        for (const f of this.foes) if (f.hp > 0 && hyp(p.x - f.x, p.y - (f.y - f.r)) < p.r + f.r) { hit = f; break; }
        const b = this.boss;
        if (!hit && b && b.hp > 0 && hyp(p.x - b.x, p.y - (b.y - b.r)) < p.r + b.r) hit = b;
        if (hit) p.life = 0;
        if (p.life <= 0) {
          // Fireball: burst on impact or at the end of its flight.
          this.fx.push({ ring: true, x: p.x, y: p.y, r0: 6, r1: p.splash, life: 0.3, t: 0, color: "#ff9f43" });
          this._burst(p.x, p.y, "#ff7a2a", 14);
          for (const f of this.foes) if (f.hp > 0 && hyp(p.x - f.x, p.y - (f.y - f.r)) < p.splash + f.r) this._hurtFoe(f, p.dmg, Math.atan2(f.y - p.y, f.x - p.x), 200);
          if (b && b.hp > 0 && hyp(p.x - b.x, p.y - (b.y - b.r)) < p.splash + b.r) this._hurtBoss(p.dmg);
          audioManager.play("explosion");
        }
      }
      if (Math.random() < 0.3) this.fx.push({ x: p.x, y: p.y, vx: 0, vy: 0, g: 0, life: 0.25, t: 0, color: this._shotColor(p), size: p.r * 0.5 });
    }
    this.shots = this.shots.filter(p => p.life > 0);
  }

  _shotColor(p) {
    return { arrow: "#e8e2d0", spore: "#d96a8a", ice: "#9fe8ff", fire: "#ff7a2a", fireball: "#ffb347", void: "#d77bff", orb: p.color || "#ff5470" }[p.kind] || "#fff";
  }

  _stepHazards(dt) {
    const h = this.hero;
    for (const z of this.hazards) {
      z.t += dt;
      if (z.follow && z.t < z.delay) { z.x = z.follow.x; z.y = z.follow.y - (z.kind === "cone" ? z.follow.r : 0); if (z.kind === "line") z.a = z.follow.lungeA ?? z.a; if (z.kind === "cone") z.a = z.follow.ang; }
      if (z.t >= z.delay && !z.done) {
        z.done = true;
        if (z.kind === "circle") {
          if (z.owner && z.owner.hp <= 0) continue;
          if (hyp(h.x - z.x, h.y - z.y) < z.r + 6) this._hurtHero(z.dmg, z.x, z.y);
          this.fx.push({ ring: true, x: z.x, y: z.y, r0: z.r * 0.3, r1: z.r * 1.1, life: 0.3, t: 0, color: z.spike ? "#8a6a3a" : "#ffb347" });
          this._dust(z.x, z.y, z.spike ? 3 : 8);
          if (!z.spike) audioManager.play("hit");
        }
      }
    }
    this.hazards = this.hazards.filter(z => z.t < z.delay + 0.35);
  }

  // -------------------------------------------------------------- drops --
  _drop(kind, x, y, val) {
    const a = rand(0, TAU);
    this.drops.push({ kind, x, y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, z: 0, vz: 140, val, t: 0 });
  }

  _stepDrops(dt) {
    const h = this.hero, s = this._store();
    for (const d of this.drops) {
      d.t += dt;
      d.vz -= 520 * dt; d.z = Math.max(0, d.z + d.vz * dt); if (d.z === 0) { d.vz = 0; d.vx *= 0.85; d.vy *= 0.85; }
      d.x += d.vx * dt; d.y += d.vy * dt;
      const dist = hyp(h.x - d.x, h.y - d.y);
      if (d.t > 0.4 && dist < 90 && d.kind !== "gear") { d.x += (h.x - d.x) * Math.min(1, dt * 8); d.y += (h.y - d.y) * Math.min(1, dt * 8); }
      if (d.t > 0.4 && dist < 16) {
        d.got = true;
        if (d.kind === "gold") { s.gold += d.val; this._text(h.x, h.y - 40, `+${d.val} gold`, "#ffd76a"); audioManager.play("coin"); }
        else if (d.kind === "heart") { const a = Math.round(this.maxHp * 0.15); h.hp = Math.min(this.maxHp, h.hp + a); this._text(h.x, h.y - 40, `+${a}`, "#2ee6a6"); audioManager.play("coin"); }
        else if (d.kind === "potion") { if (s.potions < MAX_POTIONS) { s.potions++; this._text(h.x, h.y - 40, "+1 potion", "#ff7fa8"); } else { s.gold += 15; this._text(h.x, h.y - 40, "+15 gold", "#ffd76a"); } audioManager.play("coin"); }
        else if (d.kind === "gear") { this._takeGear(d.val); }
      }
    }
    this.drops = this.drops.filter(d => !d.got);
  }

  _takeGear(it) {
    const s = this._store();
    const h = this.hero;
    const cur = it.kind === "weapon" ? s.weapon : s.armor;
    const better = (p, q) => (it.kind === "weapon" ? itemPower(p).atk > itemPower(q).atk : itemPower(p).def > itemPower(q).def);
    if (better(it, cur)) {
      if (it.kind === "weapon") s.weapon = it; else s.armor = it;
      s.bag.push(cur);
      this._text(h.x, h.y - 48, `Equipped: ${itemName(it)}`, RARITY[it.rarity].color, true);
    } else {
      s.bag.push(it);
      this._text(h.x, h.y - 48, `${itemName(it)} → bag`, RARITY[it.rarity].color);
    }
    if (s.bag.length > 24) { const old = s.bag.shift(); s.gold += Math.round(itemPrice(old) * 0.3); }
    h.hp = Math.min(h.hp, this.maxHp);
    audioManager.play("achievement");
    this._save(); this._hud();
  }

  // ------------------------------------------------------- interaction ---
  _nearby() {
    const h = this.hero, W = this.world;
    for (const n of W.npcs) if (hyp(n.x - h.x, n.y - h.y) < 46) return { kind: "npc", n, label: `Talk to ${n.name.split(" ")[0]}` };
    if (W.fountain && hyp(W.fountain.x - h.x, W.fountain.y - h.y) < 52) return { kind: "fountain", label: "Rest at the fountain" };
    if (hyp(W.stone.x - h.x, W.stone.y - h.y) < 44) return { kind: "stone", label: "Use the waystone" };
    for (const c of this.chests) if (!c.opened && hyp(c.x - h.x, c.y - h.y) < 40) return { kind: "chest", c, label: "Open the chest" };
    return null;
  }

  _interact(quiet = false) {
    if (this.state !== "playing" || this.modal || this.dead) return false;
    const it = this._nearby();
    if (!it) return false;
    const s = this._store(), h = this.hero;
    if (it.kind === "npc") {
      if (it.n.id === "shop") this._openShop("weapon");
      else if (it.n.id === "smith") this._openShop("armor");
      else this._talkElder();
    } else if (it.kind === "fountain") {
      h.hp = this.maxHp; this.mana = this.maxMana;
      this._text(h.x, h.y - 40, "Fully healed · saved", "#2ee6a6", true);
      audioManager.play("achievement");
      this._save();
    } else if (it.kind === "stone") {
      this._openTravel();
    } else if (it.kind === "chest") {
      const c = it.c;
      c.opened = true; s.chests[c.id] = true;
      audioManager.play("levelup");
      this._burst(c.x, c.y - 14, "#ffd76a", 20, true);
      this._drop("gold", c.x, c.y, Math.round(rand(20, 40) * (this.ri + 1) * (this.ri + 1)));
      if (Math.random() < 0.7) this._drop("gear", c.x, c.y, this._rollGear(Math.random() < 0.4));
      else this._drop("potion", c.x, c.y);
      this._save();
    }
    void quiet;
    return true;
  }

  _modal(title, body, footer) {
    this.modal = true;
    openModal({ title, bodyNode: body, footerNode: footer || el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Close"), onClose: () => { this.modal = false; this._hud(); } });
  }

  _talkElder() {
    const s = this._store();
    const next = REGIONS.findIndex(r => !s.bosses[r.boss]);
    const lines = next < 0
      ? ["You did it. Ashvane is gone, and the bells of Greenvale ring for you.", "The roads stay dangerous, though. A hero's work is never quite finished."]
      : next === 0
        ? ["Ah, you're awake. A dragon has woken in the far east — Ashvane — and the land is turning wild.", "Begin close to home: the Slime King lurks in the stone circle at the east end of Greenvale.", "Mira sells potions and blades, Bram forges armour. The fountain will mend you. Go well."]
        : [`The ${BOSSES[REGIONS[next].boss].name} waits at the far end of ${REGIONS[next].name}.`, `It is a place for heroes of level ${REGIONS[next].lv} or so — you are level ${s.lv}.`, "Remember: watch for the glow before a blow lands, and roll through it."];
    this._modal("Elder Rowan", el("div", { class: "dh-talk" }, lines.map(l => el("p", {}, l))));
  }

  _openShop(kind) {
    const s = this._store();
    const body = el("div", { class: "dh-shop" });
    const render = () => {
      body.innerHTML = "";
      body.append(el("div", { class: "dh-gold" }, `◈ ${formatNumber(s.gold)} gold`));
      if (kind === "weapon") {
        body.append(el("div", { class: "dh-row" }, [
          el("span", { class: "dh-ic", style: "--c:#ff7fa8" }, "⚗"),
          el("div", { class: "dh-info" }, [el("b", {}, `Health Potion (${s.potions}/${MAX_POTIONS})`), el("span", {}, "Restores 45% health. Press H or ♥.")]),
          el("button", { class: "btn btn-primary btn-sm", disabled: s.gold < POTION_COST || s.potions >= MAX_POTIONS || undefined, onClick: () => { s.gold -= POTION_COST; s.potions++; audioManager.play("coin"); this._save(); render(); } }, `◈ ${POTION_COST}`),
        ]));
      }
      const list = kind === "weapon" ? WEAPONS : ARMORS;
      const maxTier = Math.min(6, s.unlocked + 2);
      for (const g of list) {
        if (g.tier < 1 || g.tier > maxTier) continue;
        const it = { kind, id: g.id, rarity: "common" };
        const price = itemPrice(it);
        const pw = itemPower(it), cur = itemPower(kind === "weapon" ? s.weapon : s.armor);
        const diff = kind === "weapon" ? pw.atk - cur.atk : pw.def - cur.def;
        body.append(el("div", { class: "dh-row" }, [
          el("span", { class: "dh-ic", style: `--c:${g.color}` }, kind === "weapon" ? "⚔" : "🛡"),
          el("div", { class: "dh-info" }, [el("b", {}, g.name), el("span", {}, kind === "weapon" ? `Attack ${pw.atk}` : `Defence ${pw.def} · Health +${pw.hp}`), el("em", { class: diff > 0 ? "up" : "down" }, diff > 0 ? `+${diff} better than yours` : diff === 0 ? "same as yours" : `${diff} vs yours`)]),
          el("button", { class: "btn btn-primary btn-sm", disabled: s.gold < price || undefined, onClick: () => { s.gold -= price; this._takeGear(it); render(); } }, `◈ ${formatNumber(price)}`),
        ]));
      }
    };
    render();
    this._modal(kind === "weapon" ? "Mira's Goods" : "Bram's Forge", body);
  }

  _openTravel() {
    const s = this._store();
    const body = el("div", { class: "dh-shop" }, [el("p", { style: "margin-top:0" }, "The stone hums. Where to? (Your progress is saved.)")]);
    REGIONS.forEach((r, i) => {
      const open = i <= s.unlocked;
      body.append(el("div", { class: `dh-row${open ? "" : " locked"}` }, [
        el("span", { class: "dh-ic", style: `--c:${r.ground[0]}` }, s.bosses[r.boss] ? "✓" : open ? "◆" : "🔒"),
        el("div", { class: "dh-info" }, [el("b", {}, r.name), el("span", {}, open ? `${r.sub} · level ${r.lv}+` : "Defeat the previous boss")]),
        open ? el("button", { class: "btn btn-primary btn-sm", onClick: () => { closeModal(); this._enter(i, i === 0 ? "village" : "entry"); } }, i === this.ri ? "Restart here" : "Travel") : null,
      ]));
    });
    this._save();
    this._modal("Waystone", body);
  }

  _openBag() {
    if (this.modal) return;
    const s = this._store();
    const body = el("div", { class: "dh-shop" });
    const render = () => {
      body.innerHTML = "";
      body.append(el("div", { class: "dh-stats" }, [
        el("span", {}, `Level ${s.lv}`), el("span", {}, `XP ${s.xp}/${xpFor(s.lv)}`),
        el("span", {}, `Attack ${this.atk}`), el("span", {}, `Defence ${this.def}`), el("span", {}, `Health ${this.maxHp}`),
        el("span", {}, `◈ ${formatNumber(s.gold)}`), el("span", {}, `Potions ${s.potions}`),
      ]));
      const slot = (it, label) => el("div", { class: "dh-row eq" }, [
        el("span", { class: "dh-ic", style: `--c:${RARITY[it.rarity].color}` }, it.kind === "weapon" ? "⚔" : "🛡"),
        el("div", { class: "dh-info" }, [el("b", { style: `color:${RARITY[it.rarity].color}` }, itemName(it)), el("span", {}, `${label} · ${it.kind === "weapon" ? `Attack +${itemPower(it).atk}` : `Defence ${itemPower(it).def} · Health +${itemPower(it).hp}`}`)]),
      ]);
      body.append(el("h4", { class: "dock-h" }, "Equipped"), slot(s.weapon, "Weapon"), slot(s.armor, "Armour"));
      if (s.skills.length) {
        body.append(el("h4", { class: "dock-h" }, "Skills"));
        for (const id of s.skills) {
          const sk = SKILLS[id];
          body.append(el("div", { class: `dh-row${s.skill === id ? " eq" : ""}` }, [
            el("span", { class: "dh-ic", style: `--c:${sk.color}` }, "✦"),
            el("div", { class: "dh-info" }, [el("b", {}, sk.name), el("span", {}, `${sk.desc} · ${sk.mana} mana`)]),
            s.skill === id ? el("em", { class: "up" }, "Active") : el("button", { class: "btn btn-ghost btn-sm", onClick: () => { s.skill = id; render(); } }, "Use"),
          ]));
        }
      }
      body.append(el("h4", { class: "dock-h" }, `Bag (${s.bag.length})`));
      if (!s.bag.length) body.append(el("p", { class: "dh-empty" }, "Nothing yet. Monsters, chests and bosses drop gear."));
      s.bag.forEach((it, i) => {
        const pw = itemPower(it), cur = itemPower(it.kind === "weapon" ? s.weapon : s.armor);
        const diff = it.kind === "weapon" ? pw.atk - cur.atk : pw.def - cur.def;
        body.append(el("div", { class: "dh-row" }, [
          el("span", { class: "dh-ic", style: `--c:${RARITY[it.rarity].color}` }, it.kind === "weapon" ? "⚔" : "🛡"),
          el("div", { class: "dh-info" }, [el("b", { style: `color:${RARITY[it.rarity].color}` }, itemName(it)), el("span", {}, it.kind === "weapon" ? `Attack +${pw.atk}` : `Defence ${pw.def} · Health +${pw.hp}`), el("em", { class: diff > 0 ? "up" : "down" }, diff > 0 ? `+${diff}` : String(diff))]),
          el("button", { class: "btn btn-primary btn-sm", onClick: () => { const cur2 = it.kind === "weapon" ? s.weapon : s.armor; if (it.kind === "weapon") s.weapon = it; else s.armor = it; s.bag[i] = cur2; this.hero.hp = Math.min(this.hero.hp, this.maxHp); audioManager.play("select"); this._save(); render(); } }, "Equip"),
          el("button", { class: "btn btn-ghost btn-sm", onClick: () => { s.gold += Math.round(itemPrice(it) * 0.3); s.bag.splice(i, 1); audioManager.play("coin"); this._save(); render(); } }, `Sell ◈${Math.round(itemPrice(it) * 0.3)}`),
        ]));
      });
    };
    render();
    this._modal("Hero's Bag", body);
  }

  // -------------------------------------------------------- death -------
  _die() {
    const s = this._store();
    this.hero.hp = 0;
    this.dead = { t: 0 };
    s.deaths++;
    const lost = Math.round(s.gold * 0.15);
    s.gold -= lost;
    this.dead.lost = lost;
    audioManager.play("lose");
    this._save();
  }

  _respawn() {
    this.dead = null;
    this.hero.hp = this.maxHp; this.mana = this.maxMana; this.hero.iT = 1.5;
    this._enter(0, "village");
  }

  // -------------------------------------------------------------- fx -----
  _text(x, y, s, color, big = false) { this.texts.push({ x, y, s, color, big, t: 0 }); }
  _burst(x, y, color, n, big = false) {
    for (let i = 0; i < n; i++) this.fx.push({ x, y, vx: rand(-1, 1) * (big ? 200 : 120), vy: rand(-1, 0.4) * (big ? 220 : 140), g: 420, life: rand(0.3, 0.7), t: 0, color, size: rand(1.5, big ? 4.5 : 3) });
  }
  _dust(x, y, n) { for (let i = 0; i < n; i++) this.fx.push({ x: x + rand(-8, 8), y, vx: rand(-50, 50), vy: rand(-40, -5), g: 0, life: rand(0.3, 0.6), t: 0, color: "rgba(220,210,190,0.6)", size: rand(2, 4) }); }

  _stepFx(dt) {
    for (const p of this.fx) { p.t += dt; if (!p.ring && !p.slash) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; } }
    this.fx = this.fx.filter(p => p.t < p.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < 1.1);
    // Weather drifts in screen space.
    const kind = this._weatherKind();
    if (kind && this.weather.length < 60) this.weather.push({ x: Math.random(), y: kind === "ember" ? 1.05 : -0.05, v: rand(0.03, 0.08), s: rand(1, 2.6), ph: rand(0, 6) });
    for (const w of this.weather) { w.y += (kind === "ember" ? -w.v : w.v) * dt; w.x += Math.sin(this.t + w.ph) * 0.01 * dt; }
    this.weather = this.weather.filter(w => w.y > -0.1 && w.y < 1.1);
  }
  _weatherKind() { return { frostpeak: "snow", caldera: "ember", spire: "ember", whisperwood: "fly", ruins: "fly" }[REGIONS[this.ri]?.id]; }

  _hud() {
    const s = this._store();
    this.setScore(this._score());
    this.setHud({ Level: s.lv, Gold: formatNumber(s.gold), Region: REGIONS[this.ri]?.name || "" });
  }

  // ============================================================ render ====
  onRender(ctx) {
    const w = this.viewW, h = this.viewH, dpr = this.dpr || 1;
    if (!w || !this.world) return;
    const tiles = clamp(w / 52, 11, 17);
    const sc = w / (tiles * T);
    let cx = clamp(this.cam.x, w / sc / 2, MW * T - w / sc / 2);
    let cy = clamp(this.cam.y, h / sc / 2, MH * T - h / sc / 2);
    if (this.shake > 0) { cx += rand(-1, 1) * this.shake * 8; cy += rand(-1, 1) * this.shake * 8; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0f18"; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, (w / 2 - cx * sc) * dpr, (h / 2 - cy * sc) * dpr);
    const view = { x0: cx - w / sc / 2, x1: cx + w / sc / 2, y0: cy - h / sc / 2, y1: cy + h / sc / 2 };
    const W = this.world;
    W.drawGround(ctx, view, sc * dpr, this.t);
    this._drawHazards(ctx);
    if (this.portal) this._drawPortal(ctx);

    // Everything with height, back to front.
    const list = [];
    const inView = (x, y, m = 80) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m * 2;
    for (const p of W.props) if (!p.gone && !p.invisible && inView(p.x, p.y)) list.push({ y: p.y, d: () => drawProp(ctx, p, W.region, this.t) });
    for (const n of W.npcs) if (inView(n.x, n.y)) list.push({ y: n.y, d: () => drawNpc(ctx, n, this.t) });
    for (const c of this.chests) if (inView(c.x, c.y)) list.push({ y: c.y, d: () => drawChest(ctx, c, this.t) });
    for (const f of this.foes) if (inView(f.x, f.y)) list.push({ y: f.y, d: () => drawFoe(ctx, f, this.t) });
    for (const d of this.drops) if (inView(d.x, d.y)) list.push({ y: d.y, d: () => this._drawDrop(ctx, d) });
    if (this.boss) list.push({ y: this.boss.y, d: () => drawBoss(ctx, this.boss, this.t) });
    const hh = this.hero;
    if (!this.dead) list.push({ y: hh.y, d: () => drawHero(ctx, {
      ...hh, rolling: hh.rollT > 0, armorColor: armorOf(this._store().armor).color, swordColor: weaponOf(this._store().weapon).color,
    }, this.t) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();

    this._drawShots(ctx);
    this._drawFx(ctx);
    this._drawTexts(ctx);
    this._drawPrompt(ctx);

    // Screen space: tint, vignette, weather, HUD.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (W.region.tint) { ctx.fillStyle = W.region.tint; ctx.fillRect(0, 0, w, h); }
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    const low = hh.hp / this.maxHp < 0.3;
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, low ? `rgba(120,0,10,${0.45 + Math.sin(this.t * 6) * 0.15})` : "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    this._drawWeather(ctx, w, h);
    this._drawHudBars(ctx, w, h);
    this._drawMinimap(ctx, w, h);
    if (this.boss) this._drawBossBar(ctx, w, h);
    if (this.banner) this._drawBanner(ctx, w, h);
    if (this.dead) this._drawDeath(ctx, w, h);
  }

  _drawHazards(ctx) {
    for (const z of this.hazards) {
      const k = Math.min(1, z.t / z.delay);
      if (z.kind === "circle") {
        if (z.done) { continue; }
        ctx.fillStyle = `rgba(255,${z.spike ? 140 : 70},40,${0.12 + k * 0.22})`;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(255,200,120,${0.5 + k * 0.5})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,120,60,${0.3 + k * 0.3})`;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r * k, 0, TAU); ctx.fill();
      } else if (z.kind === "line" && !z.done) {
        ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.a);
        ctx.fillStyle = `rgba(255,80,80,${0.12 + k * 0.2})`; ctx.fillRect(0, -z.w / 2, z.len, z.w);
        ctx.fillStyle = `rgba(255,120,120,${0.35})`; ctx.fillRect(0, -z.w / 2, z.len * k, z.w);
        ctx.restore();
      } else if (z.kind === "cone" && !z.done) {
        ctx.fillStyle = `rgba(255,120,40,${0.1 + k * 0.22})`;
        ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.arc(z.x, z.y, z.len, z.a - z.spread, z.a + z.spread); ctx.closePath(); ctx.fill();
      }
    }
  }

  _drawPortal(ctx) {
    const { x, y } = this.portal;
    const last = this.ri >= REGIONS.length - 1;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(${last ? "255,215,106" : "124,240,255"},${0.6 - i * 0.15})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, 22 + i * 7 + Math.sin(this.t * 3 + i) * 2, 9 + i * 3, 0, 0, TAU); ctx.stroke();
    }
    const g = ctx.createRadialGradient(x, y - 20, 2, x, y - 20, 50);
    g.addColorStop(0, last ? "rgba(255,215,106,0.7)" : "rgba(124,240,255,0.7)"); g.addColorStop(1, "rgba(124,240,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 20, 50, 0, TAU); ctx.fill();
    if (!last) {
      ctx.fillStyle = "#fff"; ctx.font = "700 10px Inter, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`To ${REGIONS[this.ri + 1].name}`, x, y - 52);
    }
  }

  _drawDrop(ctx, d) {
    const y = d.y - d.z - 6 + Math.sin(this.t * 4 + d.x) * (d.z ? 0 : 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(d.x, d.y, 6, 2.5, 0, 0, TAU); ctx.fill();
    if (d.kind === "gold") {
      ctx.fillStyle = "#ffcf4a"; ctx.beginPath(); ctx.arc(d.x, y, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(d.x - 1.5, y - 1.5, 1.6, 0, TAU); ctx.fill();
    } else if (d.kind === "heart") {
      ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.arc(d.x - 3, y - 2, 3.5, 0, TAU); ctx.arc(d.x + 3, y - 2, 3.5, 0, TAU); ctx.moveTo(d.x - 6.5, y - 1); ctx.lineTo(d.x, y + 6); ctx.lineTo(d.x + 6.5, y - 1); ctx.fill();
    } else if (d.kind === "potion") {
      ctx.fillStyle = "#ff7fa8"; ctx.beginPath(); ctx.arc(d.x, y, 5, 0, TAU); ctx.fill(); ctx.fillStyle = "#c9ccd8"; ctx.fillRect(d.x - 2, y - 10, 4, 5);
    } else {
      const c = RARITY[d.val.rarity].color;
      const g = ctx.createRadialGradient(d.x, y, 0, d.x, y, 26);
      g.addColorStop(0, c + "cc"); g.addColorStop(1, c + "00");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, y, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.save(); ctx.translate(d.x, y); ctx.rotate(Math.sin(this.t * 2) * 0.3);
      ctx.fillRect(-7, -7, 14, 14); ctx.fillStyle = "#1a1424"; ctx.font = "700 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(d.val.kind === "weapon" ? "⚔" : "🛡", 0, 1); ctx.restore();
      ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(d.x, y - 12); ctx.lineTo(d.x, y - 40 - Math.sin(this.t * 3) * 4); ctx.stroke();
    }
  }

  _drawShots(ctx) {
    for (const p of this.shots) {
      const c = this._shotColor(p);
      if (p.kind === "arrow") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.strokeStyle = "#d8cfb8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = "#c9ccd8"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.fill();
        ctx.restore();
        continue;
      }
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.35, c); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, TAU); ctx.fill();
    }
  }

  _drawFx(ctx) {
    for (const p of this.fx) {
      const k = 1 - p.t / p.life;
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.globalAlpha = k; ctx.lineWidth = 3 + k * 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - k), 0, TAU); ctx.stroke();
      } else if (p.slash) {
        ctx.strokeStyle = p.color; ctx.globalAlpha = k; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 30, p.a - 0.9, p.a + 0.9); ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawTexts(ctx) {
    ctx.textAlign = "center";
    for (const t of this.texts) {
      const k = t.t / 1.1;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${t.big ? 15 : 11}px Sora, Inter, sans-serif`;
      const y = t.y - k * 26;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,10,20,0.75)"; ctx.strokeText(t.s, t.x, y);
      ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, y);
    }
    ctx.globalAlpha = 1;
  }

  _drawPrompt(ctx) {
    const it = this._nearby();
    if (!it || this.dead) return;
    const h = this.hero;
    const label = `${this.useTouch ? "⚔" : "J"}  ${it.label}`;
    ctx.font = "700 10px Inter, sans-serif";
    const tw = ctx.measureText(label).width + 16;
    const y = h.y - 56 + Math.sin(this.t * 4) * 1.5;
    ctx.fillStyle = "rgba(10,12,22,0.8)";
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(h.x - tw / 2, y - 10, tw, 18, 9) : ctx.rect(h.x - tw / 2, y - 10, tw, 18); ctx.fill();
    ctx.fillStyle = "#ffd76a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, h.x, y);
    ctx.textBaseline = "alphabetic";
  }

  _drawWeather(ctx, w, h) {
    const kind = this._weatherKind();
    if (!kind) return;
    for (const p of this.weather) {
      const x = p.x * w, y = p.y * h;
      if (kind === "snow") { ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill(); }
      else if (kind === "ember") { ctx.fillStyle = `rgba(255,${140 + Math.sin(this.t * 5 + p.ph) * 60},60,0.8)`; ctx.fillRect(x, y, p.s, p.s); }
      else { const a = 0.4 + Math.sin(this.t * 3 + p.ph) * 0.4; ctx.fillStyle = `rgba(220,255,140,${a})`; ctx.beginPath(); ctx.arc(x, y * 0.9 + 20, p.s * 0.8, 0, TAU); ctx.fill(); }
    }
  }

  _drawHudBars(ctx, w, h) {
    const s = this._store(), hh = this.hero;
    const x = 10, y = 10, bw = Math.min(170, w * 0.32);
    const panel = (px, py, pw, ph) => { ctx.fillStyle = "rgba(8,10,20,0.72)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, pw, ph, 8) : ctx.rect(px, py, pw, ph); ctx.fill(); };
    panel(x, y, bw + 50, 58);
    // Level badge.
    ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(x + 20, y + 22, 14, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1a1424"; ctx.font = "900 13px Sora, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(s.lv), x + 20, y + 23);
    const bar = (by, frac, c1, c2, hgt, label) => {
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(x + 40, by, bw, hgt);
      const g = ctx.createLinearGradient(x + 40, 0, x + 40 + bw, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(x + 40, by, bw * clamp(frac, 0, 1), hgt);
      if (label) { ctx.fillStyle = "#fff"; ctx.font = "700 9px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(label, x + 44, by + hgt / 2 + 0.5); }
    };
    bar(y + 8, hh.hp / this.maxHp, "#ff3a5a", "#ff8a6a", 12, `${Math.max(0, Math.ceil(hh.hp))} / ${this.maxHp}`);
    bar(y + 23, this.mana / this.maxMana, "#3a6aff", "#7cb8ff", 7);
    bar(y + 33, this.stamina / 100, "#2ee6a6", "#a6ffda", 4);
    bar(y + 40, s.xp / xpFor(s.lv), "#ffd76a", "#fff0ad", 3);
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 10px Inter, sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "#ffd76a"; ctx.fillText(`◈ ${formatNumber(s.gold)}`, x + 8, y + 54);
    ctx.fillStyle = "#ff9ac0"; ctx.fillText(`⚗ ${s.potions}`, x + 70, y + 54);
    // Skill slot.
    const sk = s.skill ? SKILLS[s.skill] : null;
    const kx = x + 112, ky = y + 45;
    this._skillBtn = { x: kx - 4, y: ky - 4, w: bw - 64, h: 18 };
    ctx.fillStyle = sk ? sk.color : "rgba(255,255,255,0.35)";
    ctx.fillText(sk ? `✦ ${sk.name}${hh.skillCd > 0 ? ` ${hh.skillCd.toFixed(1)}s` : ""}` : "✦ —", kx, y + 54);
    // Bag button.
    const bb = { x: x, y: y + 64, w: 34, h: 26 };
    this._bagBtn = bb;
    panel(bb.x, bb.y, bb.w, bb.h);
    ctx.font = "15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎒", bb.x + bb.w / 2, bb.y + bb.h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  _drawMinimap(ctx, w, h) {
    const W = this.world;
    const mw = w < 520 ? 96 : 140, mh = mw * MH / MW;
    const x = w - mw - 10, y = 10;
    ctx.fillStyle = "rgba(8,10,20,0.75)"; ctx.fillRect(x - 3, y - 3, mw + 6, mh + 6);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(W.minimap(), x, y, mw, mh);
    ctx.globalAlpha = 1;
    const P = (px, py) => [x + px / (MW * T) * mw, y + py / (MH * T) * mh];
    const dot = (px, py, r, c) => { const [a, b] = P(px, py); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(a, b, r, 0, TAU); ctx.fill(); };
    for (const c of this.chests) if (!c.opened) dot(c.x, c.y, 2, "#ffd76a");
    dot(W.stone.x, W.stone.y, 2.5, "#7cf0ff");
    if (W.fountain) dot(W.fountain.x, W.fountain.y, 2.5, "#2ee6a6");
    const done = this._store().bosses[REGIONS[this.ri].boss];
    if (!done) { const [a, b] = P(W.arena.x, W.arena.y); ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("💀", a, b); ctx.textBaseline = "alphabetic"; }
    if (this.portal) dot(this.portal.x, this.portal.y, 3, "#7cf0ff");
    dot(this.hero.x, this.hero.y, 3.2, "#ffffff");
    dot(this.hero.x, this.hero.y, 2, "#2c4f9a");
    ctx.font = "700 9.5px Inter, sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(REGIONS[this.ri].name, x + mw, y + mh + 13);
    ctx.fillStyle = "rgba(255,215,106,0.85)";
    const goal = done ? (this.ri < REGIONS.length - 1 ? `Portal open → ${REGIONS[this.ri + 1].name}` : "The realm is safe") : `Defeat ${BOSSES[REGIONS[this.ri].boss].name}`;
    ctx.fillText(goal, x + mw, y + mh + 25);
  }

  _drawBossBar(ctx, w, h) {
    const b = this.boss;
    const bw = Math.min(420, w * 0.6), x = (w - bw) / 2, y = h - 34;
    ctx.fillStyle = "rgba(8,10,20,0.8)"; ctx.fillRect(x - 4, y - 18, bw + 8, 30);
    ctx.fillStyle = "#fff"; ctx.font = "800 11px Sora, Inter, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(b.name + (b.enraged ? " — ENRAGED" : ""), w / 2, y - 5);
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x, y, bw, 8);
    const g = ctx.createLinearGradient(x, 0, x + bw, 0); g.addColorStop(0, "#ff3a5a"); g.addColorStop(1, b.enraged ? "#ff9f43" : "#b06bff");
    ctx.fillStyle = g; ctx.fillRect(x, y, bw * Math.max(0, b.hp / b.maxHp), 8);
  }

  _drawBanner(ctx, w, h) {
    const b = this.banner;
    const a = Math.min(1, b.t * 3, (3.2 - b.t) * 2);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const y = h * (b.boss ? 0.3 : 0.24);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(8,10,20,0)"); g.addColorStop(0.5, "rgba(8,10,20,0.75)"); g.addColorStop(1, "rgba(8,10,20,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y - 34, w, 62);
    ctx.textAlign = "center";
    ctx.font = `900 ${Math.min(36, w * 0.07)}px Sora, Inter, serif`;
    ctx.fillStyle = b.boss ? "#ff7a8a" : b.gold ? "#ffd76a" : "#ffffff";
    ctx.shadowColor = b.boss ? "#ff3a5a" : "#ffb347"; ctx.shadowBlur = 16;
    ctx.fillText(b.title, w / 2, y);
    ctx.shadowBlur = 0;
    ctx.font = "600 12px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(b.sub, w / 2, y + 20);
    ctx.restore();
  }

  _drawDeath(ctx, w, h) {
    const k = Math.min(1, this.dead.t / 0.8);
    ctx.fillStyle = `rgba(30,0,8,${0.7 * k})`; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = k; ctx.textAlign = "center";
    ctx.font = `900 ${Math.min(40, w * 0.08)}px Sora, Inter, serif`; ctx.fillStyle = "#ff5470";
    ctx.fillText("YOU HAVE FALLEN", w / 2, h / 2);
    ctx.font = "600 12px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(`You wake by the fountain in Greenvale. Lost ◈ ${this.dead.lost} gold.`, w / 2, h / 2 + 24);
    ctx.globalAlpha = 1;
  }
}

export default DragonheartGame;
