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
import { REGIONS, FOES, BOSSES, RARITY, WEAPONS, ARMORS, SKILLS, POTION_COST, xpFor, WEAPON_FX, MAX_TIER } from "./dhData.js";
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
const REGION_POW = [1, 1, 1, 1, 1, 1.6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.25];
// Nightmare bosses: the same fight, much nastier, for legendary loot.
const NIGHTMARE = { hp: 2.6, atk: 1.6 };
const HERO_SPEED = 138;
const ROLL_SPEED = 330, ROLL_TIME = 0.3, ROLL_COST = 28;
const MAX_POTIONS = 9;

const weaponOf = (it) => WEAPONS.find(w => w.id === it.id) || WEAPONS[0];
const armorOf = (it) => ARMORS.find(a => a.id === it.id) || ARMORS[0];
const itemBase = (it) => (it.kind === "weapon" ? weaponOf(it) : armorOf(it));
const itemName = (it) => `${RARITY[it.rarity].name === "Common" ? "" : RARITY[it.rarity].name + " "}${itemBase(it).name}`;
const itemFx = (it) => (it.kind === "weapon" ? WEAPON_FX[weaponOf(it).fx] : null);
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
      "Sixteen regions in all. Named weapons burn, freeze, shock or drain. Bosses grow a third, desperate phase below a quarter of their health.",
      "Beaten a boss? Its altar in the arena summons its Nightmare form — far stronger, and it always drops legendary gear.",
    ];
  }
  getKeyboardHint() { return "WASD / arrows move · J or Space attack & talk · K or Shift roll · L skill (Q or 1–9 switch) · H potion · I bag."; }
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
    if (!s.nightmares) s.nightmares = {};
    // Saves from before the ten new regions: Ashvane used to be the end.
    if (s.bosses.dragon && s.unlocked < 6) {
      s.unlocked = 6;
      if (!s.skills.includes("chain")) s.skills.push("chain");
    }
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
      Object.keys(s.nightmares).length ? el("span", {}, `☠ Nightmares ${Object.keys(s.nightmares).length}`) : null,
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
    const nm = Object.values(s.nightmares || {}).reduce((a, b) => a + b, 0);
    return s.lv * 500 + Object.keys(s.bosses).length * 3000 + nm * 5000 + s.kills * 10 + (s.won ? 20000 : 0);
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
    for (let i = 1; i <= 9; i++) this.input.onKey(`Digit${i}`, () => this._pickSkill(i - 1));
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
      swing: -1, swingDir: 0, combo: 0, lastSwing: -9, atkCd: 0, hitDone: true, skillCd: 0, slow: 0, shield: 0, shieldT: 0,
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
    for (const k of this._skillBtns || []) if (px >= k.x && px <= k.x + k.w && py >= k.y && py <= k.y + k.h) { this._pickSkill(k.i); return; }
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
    if (h.shieldT > 0) { h.shieldT -= dt; if (h.shieldT <= 0) h.shield = 0; }
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
      this._hurtFoe(f, this.atk * mult, h.swingDir, h.combo === 2 ? 260 : 150, true);
      hit = true;
    }
    const b = this.boss;
    if (b && b.hp > 0 && b.fade !== 0) {
      const d = hyp(b.x - hx, b.y - b.r * 0.8 - hy);
      if (d < range + b.r && (angDiff(Math.atan2(b.y - b.r * 0.8 - hy, b.x - hx), h.swingDir) < arc || d < b.r + 12)) { this._hurtBoss(this.atk * mult, true); hit = true; }
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

  get weaponFx() { return weaponOf(this._store().weapon).fx || null; }

  _crit(dmg, sword = false) {
    const keen = sword && (this.weaponFx === "crit");
    const c = Math.random() < (keen ? 0.27 : 0.12);
    return { dmg: Math.round(dmg * rand(0.9, 1.1) * (c ? (keen ? 2.1 : 1.8) : 1)), crit: c };
  }

  /** What a named weapon does on every sword hit. */
  _onHitFx(target, dmg, isBoss) {
    const fx = this.weaponFx;
    if (!fx) return;
    if (fx === "burn" || fx === "storm") { target.burn = 3; target.burnDps = this.atk * 0.18; }
    if (fx === "chill") target.chill = 2;
    if (fx === "leech") { const h = this.hero, heal = Math.max(1, Math.round(dmg * 0.06)); h.hp = Math.min(this.maxHp, h.hp + heal); }
    if ((fx === "shock" || fx === "storm") && Math.random() < 0.3) {
      let from = target;
      const hit = new Set([target]);
      for (let k = 0; k < 2; k++) {
        let best = null, bd = 150;
        for (const f of this.foes) { if (f.hp <= 0 || hit.has(f)) continue; const d = hyp(f.x - from.x, f.y - from.y); if (d < bd) { bd = d; best = f; } }
        if (!best) break;
        this._bolt(from.x, from.y - (from.r || 20), best.x, best.y - best.r);
        hit.add(best);
        this._hurtFoe(best, this.atk * 0.5, Math.atan2(best.y - from.y, best.x - from.x), 60);
        from = best;
      }
    }
    void isBoss;
  }

  _bolt(x0, y0, x1, y1, color = "#ffef6a") {
    const pts = [[x0, y0]];
    for (let i = 1; i < 6; i++) { const k = i / 6; pts.push([x0 + (x1 - x0) * k + rand(-9, 9), y0 + (y1 - y0) * k + rand(-9, 9)]); }
    pts.push([x1, y1]);
    this.fx.push({ bolt: true, pts, life: 0.22, t: 0, color });
  }

  _hurtFoe(f, raw, ang, kb, sword = false) {
    const { dmg, crit } = this._crit(raw, sword);
    f.hp -= dmg; f.flash = 0.1;
    if (sword && f.hp > 0) this._onHitFx(f, dmg, false);
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

  _hurtBoss(raw, sword = false) {
    const b = this.boss;
    if (!b) return;
    const { dmg, crit } = this._crit(raw, sword);
    b.hp -= dmg; b.flash = 0.1;
    if (sword) this._onHitFx(b, dmg, true);
    this._text(b.x + rand(-20, 20), b.y - b.r * 2, String(dmg), crit ? "#ffd76a" : "#ffffff", crit);
    this._burst(b.x, b.y - b.r, b.color, 5);
    if (!b.enraged && b.hp < b.maxHp * 0.5) {
      b.enraged = true;
      this._text(b.x, b.y - b.r * 2.6, "ENRAGED!", "#ff5470", true);
      audioManager.play("explosion");
      this.shake = 0.6;
    }
    if (!b.desperate && b.hp < b.maxHp * 0.25) {
      // Third phase: everything at once, faster.
      b.desperate = true;
      this.banner = { title: "DESPERATE!", sub: `${b.name} holds nothing back`, t: 0.6, boss: true };
      audioManager.play("explosion");
      this.shake = 0.9;
      this.flashScreen = { t: 0, color: "255,40,60" };
    }
    if (b.hp <= 0) this._killBoss();
  }

  _hurtHero(raw, fromX, fromY) {
    const h = this.hero;
    if (h.iT > 0 || this.dead || this.victory) return;
    const d = DIFF[this.difficulty] || DIFF.Hero;
    const def = this.def;
    // Armour matters in every region, but never makes you untouchable.
    const k = 80 + this.ri * 90;
    let dmg = Math.max(1, Math.round(raw * d.taken * (1 - def / (def + k)) * rand(0.9, 1.1)));
    if (h.shield > 0) {
      const soak = Math.min(h.shield, dmg);
      h.shield -= soak; dmg -= soak;
      this._text(h.x, h.y - 48, `⛨ ${soak}`, "#ffd76a");
      if (h.shield <= 0) { h.shieldT = 0; this._burst(h.x, h.y - 16, "#ffd76a", 16, true); }
      if (dmg <= 0) { h.iT = 0.3; return; }
    }
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
    const tier = clamp(this.ri + 1 + tierBias - (Math.random() < 0.35 ? 1 : 0), 1, MAX_TIER);
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

  _pickSkill(i) {
    const s = this._store();
    const id = s.skills[i];
    if (!id || this.state !== "playing") return;
    s.skill = id;
    audioManager.play("select");
    this._text(this.hero.x, this.hero.y - 40, SKILLS[id].name, SKILLS[id].color);
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
    } else if (id === "chain") {
      const targets = this._targets(280);
      if (!targets.length) { this.mana += sk.mana; h.skillCd = 0; this._text(h.x, h.y - 40, "No target in range", "#ffef6a"); return; }
      let from = { x: h.x, y: h.y - 16 };
      const hit = new Set();
      for (let k = 0; k < 5; k++) {
        let best = null, bd = k ? 170 : 280;
        for (const t of targets) { if (hit.has(t)) continue; const d = hyp(t.x - from.x, t.y - from.y); if (d < bd) { bd = d; best = t; } }
        if (!best) break;
        hit.add(best);
        this._bolt(from.x, from.y, best.x, best.y - best.r);
        if (best === this.boss) this._hurtBoss(this.atk * 1.8); else this._hurtFoe(best, this.atk * 1.8, Math.atan2(best.y - h.y, best.x - h.x), 80);
        from = { x: best.x, y: best.y - best.r };
      }
      this.flashScreen = { t: 0, color: "255,240,140" };
      audioManager.play("explosion");
    } else if (id === "frost") {
      this.fx.push({ ring: true, x: h.x, y: h.y - 10, r0: 10, r1: 120, life: 0.4, t: 0, color: "#bfe8ff" });
      for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; this.fx.push({ x: h.x, y: h.y - 10, vx: Math.cos(a) * 260, vy: Math.sin(a) * 200, g: 0, life: 0.45, t: 0, color: "#dff6ff", size: 3 }); }
      for (const f of this.foes) if (f.hp > 0 && hyp(f.x - h.x, f.y - h.y) < 120 + f.r) { this._hurtFoe(f, this.atk * 1.2, Math.atan2(f.y - h.y, f.x - h.x), 0); f.frozen = 2.2; f.state = "recover"; f.st = 2.2; f.wind = 0; }
      const b = this.boss; if (b && hyp(b.x - h.x, b.y - h.y) < 120 + b.r) { this._hurtBoss(this.atk * 1.2); b.chill = 2.5; }
      audioManager.play("explosion");
    } else if (id === "dash") {
      const a = h.ang, len = 190;
      const sx = h.x, sy = h.y;
      let ex = h.x, ey = h.y;
      for (let d = 0; d <= len; d += 8) { const px = sx + Math.cos(a) * d, py = sy + Math.sin(a) * d; if (this.world.blocked(px, py)) break; ex = px; ey = py; }
      for (let i = 0; i < 14; i++) { const k = i / 14; this.fx.push({ x: sx + (ex - sx) * k, y: sy + (ey - sy) * k - 14, vx: 0, vy: -20, g: 0, life: 0.4, t: 0, color: "#b06bff", size: 6 - k * 3 }); }
      h.x = ex; h.y = ey; h.iT = Math.max(h.iT, 0.35);
      for (const f of this.foes) { if (f.hp <= 0) continue; if (this._nearSeg(f.x, f.y, sx, sy, ex, ey) < f.r + 20) this._hurtFoe(f, this.atk * 1.6, a, 120, true); }
      const b = this.boss; if (b && this._nearSeg(b.x, b.y, sx, sy, ex, ey) < b.r + 20) this._hurtBoss(this.atk * 1.6, true);
      audioManager.play("swoosh");
    } else if (id === "meteor") {
      const t = this._targets(420)[0];
      const tx = t ? t.x : h.x + Math.cos(h.ang) * 160, ty = t ? t.y : h.y + Math.sin(h.ang) * 160;
      this.hazards.push({ kind: "circle", x: tx, y: ty, r: 95, delay: 0.9, t: 0, dmg: 0, friendly: true, meteor: true, power: this.atk * 4.5 });
      audioManager.play("swoosh");
    } else if (id === "aegis") {
      h.shield = Math.round(this.maxHp * 0.33); h.shieldT = 8;
      this._text(h.x, h.y - 44, "Aegis", "#ffd76a", true);
      audioManager.play("achievement");
    } else if (id === "storm") {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + h.ang;
        this.shots.push({ x: h.x, y: h.y - 14, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, r: 7, dmg: this.atk * 1.1, owner: "hero", kind: "blade", life: 0.8, splash: 0, pierce: true, hitSet: new Set() });
      }
      audioManager.play("swoosh");
    }
  }

  /** Living enemies (and the boss) nearest first, within a range. */
  _targets(range) {
    const h = this.hero;
    const list = this.foes.filter(f => f.hp > 0 && hyp(f.x - h.x, f.y - h.y) < range);
    if (this.boss && this.boss.hp > 0 && hyp(this.boss.x - h.x, this.boss.y - h.y) < range + this.boss.r) list.push(this.boss);
    return list.sort((a, b) => hyp(a.x - h.x, a.y - h.y) - hyp(b.x - h.x, b.y - h.y));
  }

  _nearSeg(px, py, x0, y0, x1, y1) {
    const sx = x1 - x0, sy = y1 - y0, l2 = sx * sx + sy * sy || 1;
    const t = clamp(((px - x0) * sx + (py - y0) * sy) / l2, 0, 1);
    return hyp(x0 + sx * t - px, y0 + sy * t - py);
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
      if (f.burn > 0) { f.burn -= dt; f.burnAcc = (f.burnAcc || 0) + f.burnDps * dt; if (f.burnAcc >= 1) { const n = Math.floor(f.burnAcc); f.burnAcc -= n; f.hp -= n; if (f.hp <= 0) { this._killFoe(f); continue; } } }
      if (f.chill > 0) f.chill -= dt;
      if (f.frozen > 0) { f.frozen -= dt; continue; }
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
      const slowK = f.chill > 0 ? 0.5 : 1;
      const nx = f.x + (mvx * slowK + f.kx) * dt, ny = f.y + (mvy * slowK + f.ky) * dt;
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
    const spd = { arrow: 300, spore: 150, ice: 220, fire: 240, bolt: 330, void: 230, orb: 200 }[kind] || 220;
    const shots = kind === "spore" ? [-0.3, 0, 0.3] : kind === "fire" && f.elite ? [-0.2, 0, 0.2] : [0];
    for (const o of shots) this.shots.push({ x: f.x, y: f.y - f.r * 1.4, vx: Math.cos(a + o) * spd, vy: Math.sin(a + o) * spd, r: kind === "spore" ? 7 : 5, dmg: f.atk, owner: "foe", kind, life: 2.4 });
    audioManager.play(kind === "arrow" ? "swoosh" : "pop");
  }

  // -------------------------------------------------------------- bosses -
  _checkArena() {
    const W = this.world, h = this.hero, R = REGIONS[this.ri];
    const s = this._store();
    if (!this.boss && !s.bosses[R.boss] && hyp(h.x - W.arena.x, h.y - W.arena.y) < W.arena.r - 50) this._startBoss(false);
    if (this.portal && hyp(h.x - this.portal.x, h.y - this.portal.y) < 26 && !this._portalCd) {
      if (this.ri < REGIONS.length - 1) { this._portalCd = true; audioManager.play("levelup"); this._enter(this.ri + 1, "entry"); setTimeout(() => (this._portalCd = false), 800); }
    }
  }

  _startBoss(nightmare) {
    const W = this.world, R = REGIONS[this.ri];
    const B = BOSSES[R.boss];
    const d = DIFF[this.difficulty] || DIFF.Hero;
    const hp = Math.round(B.hp * d.foeHp * (nightmare ? NIGHTMARE.hp : 1));
    // Nightmares learn one move from the boss of the next region along.
    const moves = B.moves.slice();
    if (nightmare) { const extra = ["meteor", "laser", "walls", "homing"].filter(m => !moves.includes(m)); if (extra.length) moves.push(extra[this.ri % extra.length]); }
    this.boss = {
      type: R.boss, ...B, moves, atk: B.atk * (nightmare ? NIGHTMARE.atk : 1), nightmare,
      name: nightmare ? `Nightmare ${B.name}` : B.name,
      x: W.arena.x + 60, y: W.arena.y, hp, maxHp: hp, flash: 0, wind: 0, ang: Math.PI,
      state: "intro", st: 2.2, move: null, mi: 0, enraged: nightmare, desperate: false, locked: true, contactCd: 0,
    };
    this.intro = { t: 0, name: this.boss.name, sub: nightmare ? "A nightmare given form" : R.name };
    audioManager.play("explosion");
    this.shake = 0.8;
    // Clear any leftover monsters inside.
    for (const f of this.foes) if (hyp(f.x - W.arena.x, f.y - W.arena.y) < W.arena.r) f.hp = 0;
  }

  _stepBoss(dt) {
    const b = this.boss, h = this.hero, W = this.world;
    if (b.hp <= 0) { this._killBoss(); return; }
    b.flash = Math.max(0, b.flash - dt);
    b.contactCd = Math.max(0, b.contactCd - dt);
    if (b.burn > 0) { b.burn -= dt; b.burnAcc = (b.burnAcc || 0) + b.burnDps * dt; if (b.burnAcc >= 1) { const n = Math.floor(b.burnAcc); b.burnAcc -= n; b.hp -= n; } }
    const slowB = b.chill > 0 ? 0.6 : 1;
    if (b.chill > 0) b.chill -= dt;
    b.st -= dt * (b.desperate ? 1.6 : b.enraged ? 1.3 : 1) * slowB;
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
      if (b.st <= 0) { b.wind = 0; b.state = "act"; b.st = { spiral: 2.6, breath: 1.7, lunge: 0.7, blink: 0.9, laser: 2.6, walls: 2.2, meteor: 1.4, homing: 1.2 }[b.move] || 0.1; b.at = 0; this._bossAct(b, true); }
    } else if (b.state === "act") {
      b.at += dt;
      this._bossAct(b, false, dt);
      if (b.st <= 0) {
        b.state = "idle"; b.st = rand(0.7, 1.2) * (b.desperate ? 0.45 : b.enraged ? 0.65 : 1); b.fade = undefined;
        // Desperate bosses chain a second attack straight after the first.
        if (b.desperate && !b.chained) { b.chained = true; b.st = 0.15; } else b.chained = false;
      }
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
    } else if (b.move === "meteor") {
      // A rain of meteors: the first lands where you stand.
      const n = b.desperate ? 12 : b.enraged ? 9 : 6;
      const W = this.world;
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = i ? rand(40, W.arena.r - 40) : 0;
        const x = i ? W.arena.x + Math.cos(a) * d : h.x, y = i ? W.arena.y + Math.sin(a) * d : h.y;
        this.hazards.push({ kind: "circle", x, y, r: 48, delay: 1.0 + i * 0.13, t: 0, dmg: b.atk * 1.2, meteorFx: true });
      }
    } else if (b.move === "laser") {
      // A beam that sweeps round the arena. The thin line shows where it starts.
      const a0 = Math.atan2(h.y - b.y, h.x - b.x) - 1.2;
      const beams = b.desperate ? 3 : b.enraged ? 2 : 1;
      for (let k = 0; k < beams; k++) this.hazards.push({ kind: "beam", x: b.x, y: b.y - b.r, a: a0 + (k / beams) * TAU, spin: (b.mi % 2 ? -1 : 1) * (b.desperate ? 1.15 : 0.9), len: 520, w: 22, delay: 0.85, live: 2.6, t: 0, dmg: b.atk * 0.9, follow: b });
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
      case "slam": case "roots": case "meteor": if (first) { this.shake = 0.3; } break;
      case "walls": {
        // Walls of shots sweep across with a gap you have to find.
        b.wl = (b.wl || 0) - (first ? 0 : dt);
        if (first || b.wl <= 0) {
          b.wl = b.desperate ? 0.45 : 0.65;
          const W = this.world, R = W.arena.r;
          // Launched from the far side of the arena, travelling towards you.
          const a = Math.atan2(h.y - W.arena.y, h.x - W.arena.x);
          const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
          const ox = W.arena.x - ux * (R + 10), oy = W.arena.y - uy * (R + 10);
          const gap = rand(-R * 0.6, R * 0.6), gw = b.desperate ? 46 : 60;
          for (let o = -R; o <= R; o += 26) {
            if (Math.abs(o - gap) < gw) continue;
            this.shots.push({ x: ox + nx * o, y: oy + ny * o, vx: ux * 200, vy: uy * 200, r: 9, dmg: b.atk * 0.75, owner: "foe", kind: "orb", life: 3.2, color: b.color });
          }
          audioManager.play("swoosh");
        }
        break;
      }
      case "homing": if (first) {
        const n = b.desperate ? 8 : b.enraged ? 6 : 4;
        for (let i = 0; i < n; i++) { const a = (i / n) * TAU; this.shots.push({ x: b.x + Math.cos(a) * b.r, y: b.y - b.r + Math.sin(a) * b.r, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, r: 10, dmg: b.atk * 0.9, owner: "foe", kind: "homing", life: 4, homeT: 1.8, color: b.color }); }
        audioManager.play("levelup");
      } break;
      case "laser": break;
    }
  }

  _killBoss() {
    const b = this.boss, s = this._store(), W = this.world, R = REGIONS[this.ri];
    if (b.nightmare) {
      s.nightmares[b.type] = (s.nightmares[b.type] || 0) + 1;
      for (let i = 0; i < 90; i++) this.fx.push({ x: b.x + rand(-b.r, b.r), y: b.y - b.r + rand(-b.r, b.r), vx: rand(-240, 240), vy: rand(-280, 60), g: 260, life: rand(0.6, 1.6), t: 0, color: i % 2 ? "#b06bff" : "#ffd76a", size: rand(2, 6) });
      this.shake = 1; audioManager.play("win");
      this._gainXp(Math.round(b.xp * 1.5));
      this._drop("gold", b.x, b.y, b.gold * 2);
      for (const f of this.foes) if (f.summoned) f.hp = 0;
      this.shots = this.shots.filter(p => p.owner === "hero"); this.hazards = [];
      const it = this._rollGear(true, 2); it.rarity = "legendary";
      this._drop("gear", b.x, b.y + 10, it);
      this.boss = null;
      this.banner = { title: "NIGHTMARE BANISHED", sub: `It dropped the ${itemName(it)}`, t: 0, gold: true };
      this._save(); this._hud();
      return;
    }
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
      this.banner = { title: "NYXARA FALLS", sub: "Every road is safe. You are the Dragonheart.", t: 0, gold: true };
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
    this.endGame({ result: "win", score: this._score(), message: "Nyxara, the World Eater, is defeated — all sixteen regions are free. Your save keeps everything: come back for the Nightmare bosses.", extraStats: this._endStats() });
  }

  // ------------------------------------------------- shots and hazards ---
  _stepShots(dt) {
    const h = this.hero, W = this.world;
    for (const p of this.shots) {
      p.life -= dt;
      if (p.kind === "homing" && p.homeT > 0) {
        p.homeT -= dt;
        const want = Math.atan2(h.y - 12 - p.y, h.x - p.x), cur = Math.atan2(p.vy, p.vx);
        let da = want - cur; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const na = cur + clamp(da, -2.4 * dt, 2.4 * dt), sp = Math.min(230, hyp(p.vx, p.vy) + 60 * dt);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!["void", "orb", "homing", "blade"].includes(p.kind) && W.blocked(p.x, p.y + 10, true)) p.life = 0;
      if (p.owner === "foe") {
        if (hyp(p.x - h.x, p.y - (h.y - 12)) < p.r + 9 && h.iT <= 0) {
          this._hurtHero(p.dmg, p.x - p.vx, p.y - p.vy);
          if (p.kind === "ice") h.slow = 1.5;
          p.life = 0;
        }
      } else {
        const b = this.boss;
        if (p.pierce) {
          // Spectral blades pass through, hitting each enemy once.
          for (const f of this.foes) if (f.hp > 0 && !p.hitSet.has(f) && hyp(p.x - f.x, p.y - (f.y - f.r)) < p.r + f.r) { p.hitSet.add(f); this._hurtFoe(f, p.dmg, Math.atan2(p.vy, p.vx), 90); }
          if (b && b.hp > 0 && !p.hitSet.has(b) && hyp(p.x - b.x, p.y - (b.y - b.r)) < p.r + b.r) { p.hitSet.add(b); this._hurtBoss(p.dmg); }
          if (Math.random() < 0.5) this.fx.push({ x: p.x, y: p.y, vx: 0, vy: 0, g: 0, life: 0.2, t: 0, color: "#fff3c0", size: 3 });
          continue;
        }
        let hit = null;
        for (const f of this.foes) if (f.hp > 0 && hyp(p.x - f.x, p.y - (f.y - f.r)) < p.r + f.r) { hit = f; break; }
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
    // A shot that has lost its position must never reach the renderer.
    this.shots = this.shots.filter(p => p.life > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  }

  _shotColor(p) {
    return { arrow: "#e8e2d0", spore: "#d96a8a", ice: "#9fe8ff", fire: "#ff7a2a", fireball: "#ffb347", void: "#d77bff", bolt: "#ffef6a", blade: "#fff3c0", orb: p.color || "#ff5470", homing: p.color || "#ff5470" }[p.kind] || "#fff";
  }

  _stepHazards(dt) {
    const h = this.hero;
    for (const z of this.hazards) {
      z.t += dt;
      if (z.kind === "beam") {
        // Beams follow their caster and sweep while live.
        if (z.follow) { z.x = z.follow.x; z.y = z.follow.y - z.follow.r; }
        if (z.t >= z.delay) {
          z.a += z.spin * dt;
          if (this.boss && this._nearSeg(h.x, h.y - 12, z.x, z.y, z.x + Math.cos(z.a) * z.len, z.y + Math.sin(z.a) * z.len) < z.w / 2 + 8) this._hurtHero(z.dmg, z.x, z.y);
        }
        continue;
      }
      if (z.follow && z.t < z.delay) { z.x = z.follow.x; z.y = z.follow.y - (z.kind === "cone" ? z.follow.r : 0); if (z.kind === "line") z.a = z.follow.lungeA ?? z.a; if (z.kind === "cone") z.a = z.follow.ang; }
      if (z.t >= z.delay && !z.done) {
        z.done = true;
        if (z.kind === "circle") {
          if (z.owner && z.owner.hp <= 0) continue;
          if (z.meteorFx || z.meteor) { this.fx.push({ ring: true, x: z.x, y: z.y, r0: 4, r1: z.r * 1.4, life: 0.45, t: 0, color: z.meteor ? "#ffb347" : "#ff7a2a" }); this._burst(z.x, z.y, "#ff7a2a", 18, true); this.shake = Math.max(this.shake, 0.35); audioManager.play("explosion"); }
          if (z.friendly) {
            for (const f of this.foes) if (f.hp > 0 && hyp(f.x - z.x, f.y - z.y) < z.r + f.r) this._hurtFoe(f, z.power, Math.atan2(f.y - z.y, f.x - z.x), 260);
            const b = this.boss; if (b && b.hp > 0 && hyp(b.x - z.x, b.y - z.y) < z.r + b.r) this._hurtBoss(z.power);
            continue;
          }
          if (hyp(h.x - z.x, h.y - z.y) < z.r + 6) this._hurtHero(z.dmg, z.x, z.y);
          this.fx.push({ ring: true, x: z.x, y: z.y, r0: z.r * 0.3, r1: z.r * 1.1, life: 0.3, t: 0, color: z.spike ? "#8a6a3a" : "#ffb347" });
          this._dust(z.x, z.y, z.spike ? 3 : 8);
          if (!z.spike) audioManager.play("hit");
        }
      }
    }
    this.hazards = this.hazards.filter(z => z.t < z.delay + (z.kind === "beam" ? z.live : 0.35) && (z.kind !== "beam" || this.boss));
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
    const R = REGIONS[this.ri];
    if (!this.boss && this._store().bosses[R.boss] && hyp(W.arena.x - h.x, W.arena.y + 90 - h.y) < 40) return { kind: "altar", label: `Summon Nightmare ${BOSSES[R.boss].name.replace(/^The /, "")}` };
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
    } else if (it.kind === "altar") {
      this._startBoss(true);
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
      const maxTier = Math.min(MAX_TIER, s.unlocked + 2);
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
    for (const p of this.fx) { p.t += dt; if (!p.ring && !p.slash && !p.bolt) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; } }
    this.fx = this.fx.filter(p => p.t < p.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < 1.1);
    // Weather drifts in screen space.
    const kind = this._weatherKind();
    const rising = ["ember", "bubble", "spore", "void", "light"].includes(kind);
    const still = ["glint", "star", "fly"].includes(kind);
    const cap = kind === "rain" ? 110 : 60;
    if (kind && this.weather.length < cap) {
      this.weather.push({
        x: kind === "sand" ? -0.05 : Math.random(), y: still ? Math.random() : rising ? 1.05 : kind === "sand" ? Math.random() : -0.05,
        v: kind === "rain" ? rand(0.9, 1.3) : kind === "sand" ? rand(0.25, 0.5) : rand(0.03, 0.08), s: rand(1, 2.6), ph: rand(0, 6), life: still ? rand(2, 5) : 99,
      });
    }
    for (const w of this.weather) {
      w.life -= dt;
      if (kind === "sand") { w.x += w.v * dt; w.y += Math.sin(this.t * 3 + w.ph) * 0.02 * dt; }
      else if (still) w.x += Math.sin(this.t + w.ph) * 0.004 * dt;
      else { w.y += (rising ? -w.v : w.v) * dt; w.x += (kind === "rain" ? 0.25 : Math.sin(this.t + w.ph) * 0.01) * dt; }
    }
    this.weather = this.weather.filter(w => w.y > -0.1 && w.y < 1.1 && w.x < 1.1 && w.life > 0);
    // Lightning over Stormspire.
    if (kind === "rain" && Math.random() < dt * 0.12) { this.flashScreen = { t: 0, color: "220,230,255" }; setTimeout(() => audioManager.play("explosion"), 300); }
  }
  _weatherKind() { return REGIONS[this.ri]?.weather || null; }

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
    const st = this._store(), arm = armorOf(st.armor), wpn = weaponOf(st.weapon);
    if (!this.dead) list.push({ y: hh.y, d: () => drawHero(ctx, {
      ...hh, rolling: hh.rollT > 0, armorColor: arm.color, swordColor: wpn.color, tier: arm.tier,
      capeColor: arm.tier >= 7 ? "#3a1a5a" : arm.tier >= 4 ? "#8a1a2a" : "#2c4f9a",
      trimColor: arm.tier >= 10 ? "#fff3c0" : "#c9a24a", fxColor: wpn.fx ? WEAPON_FX[wpn.fx].color : null,
    }, this.t) });
    // The nightmare altar, once the region's boss is beaten.
    if (st.bosses[W.region.boss] && !this.boss) list.push({ y: W.arena.y + 90, d: () => this._drawAltar(ctx, W.arena.x, W.arena.y + 90) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.d();

    this._drawShots(ctx);
    this._drawFx(ctx);
    this._drawTexts(ctx);
    this._drawPrompt(ctx);

    // Screen space: light, tint, vignette, weather, HUD.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawLighting(ctx, w, h, dpr, sc, cx, cy, view);
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
    if (this.intro) this._drawIntro(ctx, w, h);
    if (this.flashScreen) {
      this.flashScreen.t += 1 / 60;
      const a = Math.max(0, 0.45 - this.flashScreen.t * 1.6);
      if (a <= 0) this.flashScreen = null;
      else { ctx.fillStyle = `rgba(${this.flashScreen.color},${a})`; ctx.fillRect(0, 0, w, h); }
    }
    if (this.dead) this._drawDeath(ctx, w, h);
  }

  /**
   * Darkness with lights cut out of it. Dark regions are genuinely dark: the
   * hero carries a lamp, and lava, crystals, spells and bosses light the
   * world around them. Daylit regions skip all of this.
   */
  _drawLighting(ctx, w, h, dpr, sc, cx, cy, view) {
    const R = this.world.region;
    const dark = R.dark || 0;
    if (dark <= 0.02) return;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (!this._lightCv || this._lightCv.width !== cw || this._lightCv.height !== ch) {
      this._lightCv = document.createElement("canvas"); this._lightCv.width = cw; this._lightCv.height = ch;
    }
    const L = this._lightCv.getContext("2d");
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = "source-over";
    L.clearRect(0, 0, cw, ch);
    L.fillStyle = `rgba(6,4,16,${dark})`;
    L.fillRect(0, 0, cw, ch);
    L.globalCompositeOperation = "destination-out";
    const S = (x, y) => [((x - cx) * sc + w / 2) * dpr, ((y - cy) * sc + h / 2) * dpr];
    const glows = [];
    const light = (x, y, r, a = 1, col = null) => {
      const [px, py] = S(x, y), rr = r * sc * dpr;
      if (px < -rr || py < -rr || px > cw + rr || py > ch + rr) return;
      const g = L.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`); g.addColorStop(1, "rgba(0,0,0,0)");
      L.fillStyle = g; L.beginPath(); L.arc(px, py, rr, 0, TAU); L.fill();
      if (col) glows.push([px, py, rr, col]);
    };
    const h0 = this.hero;
    light(h0.x, h0.y - 14, 175 + dark * 60, 1, "255,220,160");
    const W = this.world;
    for (const p of W.props) {
      if (p.gone || p.x < view.x0 - 120 || p.x > view.x1 + 120 || p.y < view.y0 - 120 || p.y > view.y1 + 160) continue;
      if (["crystal", "crystalcluster"].includes(p.type)) light(p.x, p.y - 18, 90, 0.8, "120,220,255");
      else if (["voidcrystal", "voidspire", "obelisk"].includes(p.type)) light(p.x, p.y - 20, 85, 0.7, "190,120,255");
      else if (["vent", "charred"].includes(p.type)) light(p.x, p.y - 6, 70, 0.7, "255,120,40");
      else if (["waystone", "starstone", "goldtree"].includes(p.type)) light(p.x, p.y - 20, 100, 0.8, "160,240,255");
      else if (p.type === "fountain") light(p.x, p.y - 10, 110, 0.8, "120,255,200");
      else if (["stormrock", "chimney"].includes(p.type)) light(p.x, p.y - 20, 60, 0.5, "255,230,120");
    }
    // Glowing liquids light their banks.
    if (["lava", "void"].includes(R.water) || R.id === "caverns") {
      const col = R.water === "lava" ? "255,120,40" : R.water === "void" ? "170,110,255" : "120,220,255";
      const x0 = Math.max(0, Math.floor(view.x0 / T)), x1 = Math.min(MW - 1, Math.ceil(view.x1 / T));
      const y0 = Math.max(0, Math.floor(view.y0 / T)), y1 = Math.min(MH - 1, Math.ceil(view.y1 / T));
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) if (W.g(x, y) === 2) light((x + 0.5) * T, (y + 0.5) * T, 70, 0.55, col);
    }
    for (const p of this.shots) light(p.x, p.y, p.owner === "hero" ? 80 : 55, 0.8, null);
    for (const f of this.foes) if (["imp", "wisp", "eye"].includes(f.art || f.type) || f.elite) light(f.x, f.y - f.r * 1.5, 70, 0.6, null);
    for (const z of this.hazards) if (z.kind === "beam" && z.t >= z.delay) light(z.x + Math.cos(z.a) * z.len / 2, z.y + Math.sin(z.a) * z.len / 2, z.len / 2, 0.5, null); else if (z.kind === "circle") light(z.x, z.y, z.r * 1.3, 0.45, null);
    for (const fx of this.fx) if (fx.bolt || fx.ring) light(fx.pts ? fx.pts[0][0] : fx.x, fx.pts ? fx.pts[0][1] : fx.y, 120, 0.6, null);
    if (this.boss) light(this.boss.x, this.boss.y - this.boss.r, this.boss.r * 3.2, 0.8, null);
    if (this.portal) light(this.portal.x, this.portal.y - 20, 130, 0.9, "124,240,255");
    for (const c of this.chests) if (!c.opened) light(c.x, c.y - 10, 60, 0.6, "255,215,106");
    for (const d of this.drops) light(d.x, d.y, d.kind === "gear" ? 70 : 34, 0.6, null);
    ctx.drawImage(this._lightCv, 0, 0, w, h);
    // Warm light spills back over the darkness.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [px, py, rr, col] of glows) {
      const g = ctx.createRadialGradient(px / dpr, py / dpr, 0, px / dpr, py / dpr, rr / dpr * 0.8);
      g.addColorStop(0, `rgba(${col},${0.12 * dark})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px / dpr, py / dpr, rr / dpr * 0.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  _drawAltar(ctx, x, y) {
    const n = (this._store().nightmares || {})[this.world.region.boss] || 0;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y + 2, 22, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#2a1a3a"; ctx.fillRect(x - 16, y - 18, 32, 20);
    ctx.fillStyle = "#4a2a6a"; ctx.fillRect(x - 19, y - 22, 38, 6);
    const p = 0.5 + Math.sin(this.t * 3) * 0.4;
    const g = ctx.createRadialGradient(x, y - 30, 2, x, y - 30, 30);
    g.addColorStop(0, `rgba(176,107,255,${p})`); g.addColorStop(1, "rgba(176,107,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 30, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = "#e8d8ff"; ctx.font = "16px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("☠", x, y - 31 + Math.sin(this.t * 2) * 2);
    ctx.textBaseline = "alphabetic";
    if (n) { ctx.font = "700 9px Inter, sans-serif"; ctx.fillStyle = "#d9b3ff"; ctx.fillText(`Banished ×${n}`, x, y + 14); }
  }

  /** Letterbox bars and a name card while a boss rises. */
  _drawIntro(ctx, w, h) {
    const it = this.intro;
    it.t += 1 / 60;
    if (it.t > 2.4) { this.intro = null; return; }
    const k = Math.min(1, it.t * 4, (2.4 - it.t) * 3);
    const bar = h * 0.12 * k;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = "center";
    ctx.font = `900 ${Math.min(40, w * 0.075)}px Sora, Inter, serif`;
    ctx.shadowColor = this.boss?.nightmare ? "#b06bff" : "#ff3a5a"; ctx.shadowBlur = 24;
    ctx.fillStyle = "#ffffff";
    const slide = (1 - Math.min(1, it.t * 2)) * 60;
    ctx.fillText(it.name, w / 2 - slide, h * 0.5);
    ctx.shadowBlur = 0;
    ctx.font = "700 12px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(it.sub.toUpperCase(), w / 2 + slide, h * 0.5 + 24);
    ctx.restore();
  }

  _drawHazards(ctx) {
    for (const z of this.hazards) {
      const k = Math.min(1, z.t / z.delay);
      if (z.kind === "beam") {
        const ex = z.x + Math.cos(z.a) * z.len, ey = z.y + Math.sin(z.a) * z.len;
        if (z.t < z.delay) {
          ctx.strokeStyle = `rgba(255,80,80,${0.3 + k * 0.5})`; ctx.lineWidth = 2 + k * 2; ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        } else {
          const col = this.boss?.color || "#ff5470";
          ctx.lineCap = "round";
          ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = z.w * 1.8; ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.globalAlpha = 0.9; ctx.lineWidth = z.w; ctx.stroke();
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = z.w * 0.35; ctx.stroke();
          ctx.globalAlpha = 1;
        }
        continue;
      }
      if (z.kind === "circle" && (z.meteorFx || z.meteor) && !z.done) {
        // The meteor itself, falling towards its mark.
        const mx = z.x - 120 * (1 - k), my = z.y - 260 * (1 - k);
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 16);
        g.addColorStop(0, "#fff3c0"); g.addColorStop(0.4, "#ff9a3a"); g.addColorStop(1, "rgba(255,80,20,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 16, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,160,60,0.5)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - 40, my - 80); ctx.stroke();
        if (z.friendly) { ctx.strokeStyle = `rgba(255,215,106,${0.5 + k * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); continue; }
      }
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
      if (p.kind === "blade") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.globalAlpha = 0.85;
        const g = ctx.createLinearGradient(-14, 0, 12, 0); g.addColorStop(0, "rgba(255,243,192,0)"); g.addColorStop(1, "#ffffff");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-14, -2.5); ctx.lineTo(10, -2); ctx.lineTo(15, 0); ctx.lineTo(10, 2); ctx.lineTo(-14, 2.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
      if (p.kind === "homing") {
        ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4 + Math.sin(this.t * 10) * 2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      }
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
      if (p.bolt) {
        ctx.globalAlpha = k; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (const [lw, col] of [[7, p.color], [2.5, "#ffffff"]]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.globalAlpha = lw > 3 ? k * 0.5 : k;
          ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        }
        continue;
      }
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
      const tw = 0.4 + Math.sin(this.t * 3 + p.ph) * 0.4;
      if (kind === "snow") { ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill(); }
      else if (kind === "ember") { ctx.fillStyle = `rgba(255,${140 + Math.sin(this.t * 5 + p.ph) * 60},60,0.8)`; ctx.fillRect(x, y, p.s, p.s); }
      else if (kind === "rain") { ctx.strokeStyle = "rgba(170,200,255,0.45)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 14); ctx.stroke(); }
      else if (kind === "bubble") { ctx.strokeStyle = "rgba(220,250,255,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + Math.sin(this.t * 2 + p.ph) * 6, y, p.s * 1.6, 0, TAU); ctx.stroke(); }
      else if (kind === "sand") { ctx.fillStyle = "rgba(240,200,130,0.55)"; ctx.fillRect(x, y, p.s * 2.5, 1.2); }
      else if (kind === "spore") { ctx.fillStyle = `rgba(180,255,120,${tw * 0.7})`; ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill(); }
      else if (kind === "spark") { ctx.fillStyle = `rgba(255,230,120,${0.6 + tw * 0.4})`; ctx.fillRect(x, y, 1.5, p.s * 2); }
      else if (kind === "void") { ctx.fillStyle = `rgba(190,130,255,${tw})`; ctx.beginPath(); ctx.arc(x, y, p.s, 0, TAU); ctx.fill(); }
      else if (kind === "light") { ctx.fillStyle = `rgba(255,236,170,${tw})`; ctx.beginPath(); ctx.arc(x, y, p.s * 1.1, 0, TAU); ctx.fill(); }
      else if (kind === "petal") { ctx.fillStyle = REGIONS[this.ri].id === "bloodmoon" ? "rgba(200,20,50,0.7)" : "rgba(255,190,220,0.75)"; ctx.save(); ctx.translate(x, y); ctx.rotate(this.t * 2 + p.ph); ctx.beginPath(); ctx.ellipse(0, 0, p.s * 1.6, p.s * 0.8, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      else if (kind === "glint" || kind === "star") { const a = Math.max(0, Math.sin(this.t * 2 + p.ph)) * Math.min(1, p.life); ctx.strokeStyle = kind === "star" ? `rgba(255,200,255,${a})` : `rgba(180,240,255,${a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke(); }
      else { ctx.fillStyle = `rgba(220,255,140,${tw})`; ctx.beginPath(); ctx.arc(x, y * 0.9 + 20, p.s * 0.8, 0, TAU); ctx.fill(); }
    }
  }

  _drawHudBars(ctx, w, h) {
    const s = this._store(), hh = this.hero;
    const x = 10, y = 10, bw = Math.min(170, w * 0.32);
    const rr = (px, py, pw, ph, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, pw, ph, r) : ctx.rect(px, py, pw, ph); };
    const panel = (px, py, pw, ph) => {
      const g = ctx.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, "rgba(22,18,40,0.86)"); g.addColorStop(1, "rgba(8,8,18,0.86)");
      ctx.fillStyle = g; rr(px, py, pw, ph, 9); ctx.fill();
      ctx.strokeStyle = "rgba(255,215,106,0.35)"; ctx.lineWidth = 1; rr(px + 0.5, py + 0.5, pw - 1, ph - 1, 9); ctx.stroke();
    };
    panel(x, y, bw + 50, 60);
    // Level crest.
    const lg = ctx.createRadialGradient(x + 18, y + 18, 2, x + 20, y + 22, 16);
    lg.addColorStop(0, "#fff0ad"); lg.addColorStop(1, "#d4a23a");
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x + 20, y + 22, 14, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#7a5a1a"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#2a1a08"; ctx.font = `900 ${s.lv >= 100 ? 10 : 13}px Sora, Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(s.lv), x + 20, y + 23);
    const bar = (by, frac, c1, c2, hgt, label, ticks) => {
      ctx.fillStyle = "rgba(255,255,255,0.08)"; rr(x + 40, by, bw, hgt, hgt / 2); ctx.fill();
      const g = ctx.createLinearGradient(0, by, 0, by + hgt); g.addColorStop(0, c2); g.addColorStop(1, c1);
      ctx.fillStyle = g; rr(x + 40, by, Math.max(hgt, bw * clamp(frac, 0, 1)), hgt, hgt / 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(x + 42, by + 1, Math.max(0, bw * clamp(frac, 0, 1) - 4), 1);
      if (ticks) { ctx.fillStyle = "rgba(0,0,0,0.3)"; for (let i = 1; i < ticks; i++) ctx.fillRect(x + 40 + (bw * i) / ticks, by + 1, 1, hgt - 2); }
      if (label) { ctx.fillStyle = "#fff"; ctx.font = "700 9px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(label, x + 45, by + hgt / 2 + 0.5); }
    };
    bar(y + 8, hh.hp / this.maxHp, "#c8203a", "#ff7a6a", 13, `${Math.max(0, Math.ceil(hh.hp))} / ${this.maxHp}`, 10);
    if (hh.shield > 0) { ctx.fillStyle = "rgba(255,215,106,0.55)"; rr(x + 40, y + 6, bw * clamp(hh.shield / this.maxHp, 0, 1), 3, 1.5); ctx.fill(); }
    bar(y + 24, this.mana / this.maxMana, "#2a4ad0", "#8cc0ff", 7);
    bar(y + 34, this.stamina / 100, "#1aa678", "#a6ffda", 4);
    bar(y + 41, s.xp / xpFor(s.lv), "#c99a2a", "#fff0ad", 3);
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 10px Inter, sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "#ffd76a"; ctx.fillText(`◈ ${formatNumber(s.gold)}`, x + 8, y + 55);
    ctx.fillStyle = "#ff9ac0"; ctx.fillText(`⚗ ${s.potions}`, x + 78, y + 55);
    const wf = this.weaponFx;
    if (wf) { ctx.fillStyle = WEAPON_FX[wf].color; ctx.fillText(`⚔ ${WEAPON_FX[wf].name}`, x + 118, y + 55); }
    // Bag button and the skill bar beside it.
    const bb = { x, y: y + 66, w: 34, h: 30 };
    this._bagBtn = bb;
    panel(bb.x, bb.y, bb.w, bb.h);
    ctx.font = "15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎒", bb.x + bb.w / 2, bb.y + bb.h / 2 + 1);
    this._skillBtns = [];
    s.skills.forEach((id, i) => {
      const sk = SKILLS[id];
      const sz = clamp(Math.floor((w * 0.6 - 50) / Math.max(1, s.skills.length)) - 2, 20, 30);
      const sx = x + 40 + i * (sz + 2), sy = y + 66;
      const active = s.skill === id;
      ctx.fillStyle = active ? "rgba(40,30,70,0.92)" : "rgba(10,10,20,0.75)";
      rr(sx, sy, sz, sz, 7); ctx.fill();
      ctx.strokeStyle = active ? sk.color : "rgba(255,255,255,0.18)"; ctx.lineWidth = active ? 2 : 1; rr(sx + 0.5, sy + 0.5, sz - 1, sz - 1, 7); ctx.stroke();
      ctx.font = `${Math.round(sz * 0.47)}px sans-serif`; ctx.fillStyle = sk.color; ctx.fillText(sk.icon, sx + sz / 2, sy + sz / 2 + 1);
      if (active && hh.skillCd > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath(); ctx.moveTo(sx + sz / 2, sy + sz / 2);
        ctx.arc(sx + sz / 2, sy + sz / 2, sz * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * (hh.skillCd / sk.cd)); ctx.closePath(); ctx.fill();
      }
      if (this.mana < sk.mana) { ctx.fillStyle = "rgba(20,40,120,0.45)"; rr(sx, sy, sz, sz, 7); ctx.fill(); }
      ctx.font = "700 8px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillText(String(i + 1), sx + sz - 5, sy + 7);
      this._skillBtns.push({ x: sx, y: sy, w: sz, h: sz, i });
    });
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
