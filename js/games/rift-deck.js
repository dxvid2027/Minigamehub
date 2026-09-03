// ==========================================================================
// Rift Deck — a deckbuilding roguelike fought one card at a time.
//
// You start with ten plain cards and three floors of rift between you and
// the Warden. Every fight is a turn of energy: play what you can afford,
// end the turn, take what the enemy telegraphed. Win and you pick one of
// three cards to add — which is the whole game, because the deck you leave
// a fight with is the deck you take into the next one.
//
// Enemies announce their intent before you act, so a lost fight is a
// misread rather than a surprise. Blocks expire at the start of your turn,
// so armour is a decision about this turn only.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, choice, shuffle } from "../core/utils.js";

// --- Cards ----------------------------------------------------------------
// `kind` drives the frame colour; `fx` is the effect run when it resolves.
// Keeping effects as small data instead of closures means a card can be
// described in the collection screen without executing it.
const CARDS = [
  // Starters
  { id: "strike",   name: "Strike",      cost: 1, kind: "attack", rarity: 0, text: "Deal 6 damage.",                       dmg: 6 },
  { id: "guard",    name: "Guard",       cost: 1, kind: "skill",  rarity: 0, text: "Gain 5 block.",                        blk: 5 },
  // Common
  { id: "jab",      name: "Jab",         cost: 0, kind: "attack", rarity: 1, text: "Deal 3 damage.",                       dmg: 3 },
  { id: "cleave",   name: "Cleave",      cost: 1, kind: "attack", rarity: 1, text: "Deal 5 damage twice.",                 dmg: 5, hits: 2 },
  { id: "brace",    name: "Brace",       cost: 1, kind: "skill",  rarity: 1, text: "Gain 8 block.",                        blk: 8 },
  { id: "focus",    name: "Focus",       cost: 0, kind: "skill",  rarity: 1, text: "Draw 2 cards.",                        draw: 2 },
  { id: "riposte",  name: "Riposte",     cost: 1, kind: "attack", rarity: 1, text: "Deal 4 damage. Gain 4 block.",         dmg: 4, blk: 4 },
  { id: "shiv",     name: "Shiv",        cost: 0, kind: "attack", rarity: 1, text: "Deal 4 damage. Exhausts.",             dmg: 4, exhaust: true },
  { id: "ironskin", name: "Iron Skin",   cost: 2, kind: "skill",  rarity: 1, text: "Gain 14 block.",                       blk: 14 },
  { id: "hex",      name: "Hex",         cost: 1, kind: "power",  rarity: 1, text: "Enemy takes 40% more damage.",         vuln: 3 },
  // Uncommon
  { id: "heavy",    name: "Heavy Blow",  cost: 2, kind: "attack", rarity: 2, text: "Deal 15 damage.",                      dmg: 15 },
  { id: "flurry",   name: "Flurry",      cost: 1, kind: "attack", rarity: 2, text: "Deal 3 damage four times.",            dmg: 3, hits: 4 },
  { id: "leech",    name: "Leech",       cost: 1, kind: "attack", rarity: 2, text: "Deal 7 damage. Heal for half of it.",  dmg: 7, leech: 0.5 },
  { id: "surge",    name: "Surge",       cost: 0, kind: "skill",  rarity: 2, text: "Gain 2 energy. Exhausts.",             energy: 2, exhaust: true },
  { id: "bulwark",  name: "Bulwark",     cost: 2, kind: "skill",  rarity: 2, text: "Gain 10 block. Draw 1.",               blk: 10, draw: 1 },
  { id: "temper",   name: "Temper",      cost: 1, kind: "power",  rarity: 2, text: "+3 damage on every attack this fight.", strength: 3 },
  { id: "aegis",    name: "Aegis",       cost: 1, kind: "power",  rarity: 2, text: "+3 block on every skill this fight.",   dexterity: 3 },
  { id: "rupture",  name: "Rupture",     cost: 1, kind: "attack", rarity: 2, text: "Deal 8. Enemy bleeds 4 a turn.",       dmg: 8, bleed: 4 },
  { id: "recall",   name: "Recall",      cost: 1, kind: "skill",  rarity: 2, text: "Draw 3 cards.",                        draw: 3 },
  { id: "parry",    name: "Parry",       cost: 1, kind: "skill",  rarity: 2, text: "Gain 6 block. Enemy deals 40% less.",  blk: 6, weak: 2 },
  // Rare
  { id: "execute",  name: "Execute",     cost: 2, kind: "attack", rarity: 3, text: "Deal 12. Double it below half health.", dmg: 12, execute: true },
  { id: "avalanche",name: "Avalanche",   cost: 3, kind: "attack", rarity: 3, text: "Deal damage equal to your block.",     blockDmg: true },
  { id: "fortress", name: "Fortress",    cost: 2, kind: "skill",  rarity: 3, text: "Gain 20 block. Block is kept next turn.", blk: 20, keep: true },
  { id: "riftcall", name: "Rift Call",   cost: 1, kind: "power",  rarity: 3, text: "+1 energy every turn this fight.",     econ: 1 },
  { id: "mend",     name: "Mend",        cost: 1, kind: "skill",  rarity: 3, text: "Heal 12. Exhausts.",                   heal: 12, exhaust: true },
  { id: "chorus",   name: "Rift Chorus", cost: 2, kind: "attack", rarity: 3, text: "Deal 6 damage for each card played this turn.", chorus: 6 },
  { id: "sever",    name: "Sever",       cost: 3, kind: "attack", rarity: 3, text: "Deal 26 damage. Exhausts.",            dmg: 26, exhaust: true },
];
const byId = Object.fromEntries(CARDS.map(c => [c.id, c]));

// --- Relics ---------------------------------------------------------------
// Picked up after elites and bosses; each one bends a rule for the whole run.
const RELICS = [
  { id: "coil",    name: "Rift Coil",     text: "Start each fight with 1 extra energy.",        icon: "coil" },
  { id: "plate",   name: "Cracked Plate", text: "Start each fight with 6 block.",               icon: "plate" },
  { id: "lens",    name: "Seer's Lens",   text: "Draw one extra card each turn.",               icon: "lens" },
  { id: "ember",   name: "Ember Heart",   text: "Heal 6 after every fight.",                    icon: "ember" },
  { id: "fang",    name: "Iron Fang",     text: "Your first attack each fight deals +8.",        icon: "fang" },
  { id: "sigil",   name: "Ward Sigil",    text: "The first hit of every fight is halved.",       icon: "sigil" },
  { id: "chalice", name: "Bone Chalice",  text: "+12 maximum health, healed on pickup.",         icon: "chalice" },
];

// --- Enemies --------------------------------------------------------------
// `moves` is a cycle of intents. Showing the next one before your turn is
// what turns the fight from guesswork into a read.
const ENEMIES = [
  { id: "wisp",    name: "Rift Wisp",    hp: 26,  shape: "wisp",   color: "#7c5cff", moves: [{ a: 7 }, { a: 5 }, { b: 6 }] },
  { id: "husk",    name: "Stone Husk",   hp: 38,  shape: "husk",   color: "#8b90ac", moves: [{ a: 9 }, { b: 8 }, { a: 6, weak: 1 }] },
  { id: "swarm",   name: "Mite Swarm",   hp: 30,  shape: "swarm",  color: "#2ee6a6", moves: [{ a: 3, hits: 3 }, { a: 4, hits: 2 }, { buff: 2 }] },
  { id: "leech",   name: "Rift Leech",   hp: 34,  shape: "leech",  color: "#ff5470", moves: [{ a: 8, drain: true }, { b: 5 }, { a: 5 }] },
  { id: "shade",   name: "Pale Shade",   hp: 44,  shape: "shade",  color: "#c9d4e8", moves: [{ a: 11 }, { a: 6, weak: 2 }, { b: 10 }] },
  { id: "maw",     name: "Gnashing Maw", hp: 52,  shape: "maw",    color: "#ff9f43", moves: [{ a: 13 }, { a: 7, hits: 2 }, { buff: 3 }] },
  // Elites
  { id: "sentinel", name: "Rift Sentinel", hp: 88,  elite: true, shape: "husk",  color: "#22d3ee", moves: [{ a: 14 }, { b: 14 }, { a: 8, hits: 2 }, { buff: 3 }] },
  { id: "devourer", name: "The Devourer",  hp: 104, elite: true, shape: "maw",   color: "#ff4fd8", moves: [{ a: 18 }, { a: 9, hits: 2, drain: true }, { b: 10 }, { a: 12, weak: 2 }] },
  // Bosses
  { id: "warden1", name: "Gate Warden",   hp: 130, boss: true, shape: "husk",  color: "#ffd76a", moves: [{ a: 16 }, { b: 16 }, { a: 10, hits: 2 }, { buff: 4 }] },
  { id: "warden2", name: "Hollow Choir",  hp: 175, boss: true, shape: "shade", color: "#a86bff", moves: [{ a: 20 }, { a: 11, hits: 2 }, { b: 18 }, { a: 14, weak: 2 }] },
  { id: "warden3", name: "The Rift Itself", hp: 240, boss: true, shape: "wisp", color: "#ff4fd8", moves: [{ a: 24 }, { a: 13, hits: 2 }, { buff: 5 }, { a: 16, drain: true }, { b: 20 }] },
];

const FLOORS = [
  { name: "The Fracture", fights: 5, pool: ["wisp", "husk", "swarm"],            elite: "sentinel", boss: "warden1", scale: 1 },
  { name: "The Descent",  fights: 6, pool: ["husk", "swarm", "leech", "shade"],  elite: "devourer", boss: "warden2", scale: 1.35 },
  { name: "The Core",     fights: 7, pool: ["leech", "shade", "maw", "swarm"],   elite: "sentinel", boss: "warden3", scale: 1.75 },
];

const START_DECK = ["strike", "strike", "strike", "strike", "strike",
                    "guard", "guard", "guard", "guard", "focus"];

export class RiftDeckGame extends GameBase {
  getDifficulties() { return ["Rift Run"]; }
  getInstructions() {
    return [
      "Click a card to play it. The number in the corner is what it costs from your energy; you get 3 energy a turn.",
      "The enemy shows what it will do before you act — a sword is damage, a shield is block, an arrow is a buff. Play around it.",
      "Block only lasts one turn. Spending everything on armour when the enemy is buffing is how runs end.",
      "Win a fight and you choose one of three cards to add to the deck. Elites and bosses drop relics that bend a rule for the rest of the run.",
      "Three floors, eighteen fights, three Wardens. Your health carries between fights — there is no free heal.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a card to play it, tap End Turn when you are done."; }
  getKeyboardHint() { return "Click cards to play, 1-9 to play by slot, Space or E to end the turn."; }
  getScene() { return "void"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.rift) custom.rift = { bestFloor: 0, bestFights: 0, wins: 0, seen: {} };
    const r = custom.rift;
    if (!r.seen) r.seen = {};
    return r;
  }
  _save() { saveManager.saveNow(); }

  getPlayLabel() { return "Enter the rift"; }
  getStartExtras() {
    const r = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Deepest floor: ${r.bestFloor || 0}/3`),
      el("span", {}, `Best run: ${r.bestFights || 0} fights`),
      el("span", {}, `Wardens felled: ${r.wins || 0}`),
    ]);
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    for (let i = 1; i <= 9; i++) {
      this.input.onKey(`Digit${i}`, () => this._playIndex(i - 1));
    }
    this.input.onKey("Space", () => this._endTurn());
    this.input.onKey("KeyE", () => this._endTurn());
  }

  onStart() {
    this.maxHp = 80;
    this.hp = 80;
    this.deck = [...START_DECK];
    this.relics = [];
    this.floorIdx = 0;
    this.fightNo = 0;
    this.totalFights = 0;
    this.elapsed = 0;
    this.floaters = [];
    this.setScore(0);
    this._beginFight();
  }

  // ------------------------------------------------------------- FIGHT ---
  /** Picks the next enemy for this floor and deals the opening hand. */
  _beginFight() {
    const fl = FLOORS[this.floorIdx];
    this.fightNo++;
    let spec;
    if (this.fightNo > fl.fights) spec = ENEMIES.find(e => e.id === fl.boss);
    else if (this.fightNo === Math.ceil(fl.fights * 0.7)) spec = ENEMIES.find(e => e.id === fl.elite);
    else spec = ENEMIES.find(e => e.id === choice(fl.pool));

    const scale = fl.scale * (1 + (this.fightNo - 1) * 0.05);
    const hp = Math.round(spec.hp * (spec.boss ? 1 : scale));
    this.enemy = {
      spec, hp, maxHp: hp, block: 0, strength: 0, weak: 0, vuln: 0, bleed: 0,
      moveIdx: randInt(0, spec.moves.length - 1), hitFlash: 0, wobble: 0,
    };
    this._store().seen[spec.id] = true;

    this.energyMax = 3 + (this.relics.some(r => r.id === "coil") ? 1 : 0);
    this.drawPer = 5 + (this.relics.some(r => r.id === "lens") ? 1 : 0);
    this.drawPile = shuffle([...this.deck]);
    this.discard = [];
    this.exhausted = [];
    this.hand = [];
    this.block = this.relics.some(r => r.id === "plate") ? 6 : 0;
    this.strength = 0; this.dexterity = 0; this.econ = 0;
    this.firstAttack = this.relics.some(r => r.id === "fang");
    this.wardUsed = !this.relics.some(r => r.id === "sigil");
    this.playedThisTurn = 0;
    this.turn = 0;
    this.picking = null;
    this.log = [];
    this._startTurn();
    this._updateHud();
  }

  _startTurn() {
    this.turn++;
    if (!this.keepBlock) this.block = 0;
    this.keepBlock = false;
    this.energy = this.energyMax + this.econ;
    this.playedThisTurn = 0;
    this._draw(this.drawPer);
    // Bleed ticks at the top of your turn so the enemy cannot block it.
    if (this.enemy.bleed > 0) {
      this._hurtEnemy(this.enemy.bleed, true);
      this._float(`Bleed ${this.enemy.bleed}`, "#ff5470", 0.68);
    }
    this._updateHud();
  }

  _draw(n) {
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= 9) break;
      if (!this.drawPile.length) {
        if (!this.discard.length) break;
        this.drawPile = shuffle(this.discard);
        this.discard = [];
      }
      this.hand.push(this.drawPile.pop());
    }
  }

  _playIndex(i) {
    if (this.state !== "playing" || this.picking) return;
    const id = this.hand[i];
    if (!id) return;
    this._playCard(i);
  }

  _playCard(i) {
    const id = this.hand[i];
    const c = byId[id];
    if (!c || c.cost > this.energy) { audioManager.play("error"); return; }
    this.energy -= c.cost;
    this.hand.splice(i, 1);
    this.playedThisTurn++;
    if (c.exhaust) this.exhausted.push(id); else this.discard.push(id);
    audioManager.play(c.kind === "attack" ? "hit" : "select");
    this._resolve(c);
    this._checkFightEnd();
    this._updateHud();
  }

  /** Runs a card's data-described effect. */
  _resolve(c) {
    const e = this.enemy;
    if (c.energy) this.energy += c.energy;
    if (c.draw) this._draw(c.draw);
    if (c.strength) { this.strength += c.strength; this._float(`+${c.strength} damage`, "#ff9f43"); }
    if (c.dexterity) { this.dexterity += c.dexterity; this._float(`+${c.dexterity} block`, "#22d3ee"); }
    if (c.econ) { this.econ += c.econ; this._float(`+${c.econ} energy a turn`, "#ffd76a"); }
    if (c.heal) { this.hp = Math.min(this.maxHp, this.hp + c.heal); this._float(`+${c.heal} health`, "#2ee6a6"); }
    if (c.blk) {
      const amount = c.blk + this.dexterity;
      this.block += amount;
      if (c.keep) this.keepBlock = true;
    }
    if (c.vuln) { e.vuln += c.vuln; this._float("Vulnerable", "#ff4fd8", 0.68); }
    if (c.weak) { e.weak += c.weak; this._float("Weakened", "#7c5cff", 0.68); }
    if (c.bleed) { e.bleed += c.bleed; this._float("Bleeding", "#ff5470", 0.68); }

    let dmg = 0;
    if (c.blockDmg) dmg = this.block;
    else if (c.chorus) dmg = c.chorus * this.playedThisTurn;
    else if (c.dmg) dmg = c.dmg;
    if (dmg > 0) {
      const hits = c.hits || 1;
      for (let h = 0; h < hits; h++) {
        let d = dmg + this.strength;
        if (c.execute && e.hp <= e.maxHp / 2) d *= 2;
        if (this.firstAttack) { d += 8; this.firstAttack = false; }
        const dealt = this._hurtEnemy(d);
        if (c.leech) { this.hp = Math.min(this.maxHp, this.hp + Math.round(dealt * c.leech)); }
      }
    }
  }

  _hurtEnemy(raw, pure = false) {
    const e = this.enemy;
    let d = Math.round(raw * (!pure && e.vuln > 0 ? 1.4 : 1));
    const absorbed = Math.min(e.block, d);
    e.block -= absorbed;
    d -= absorbed;
    e.hp = Math.max(0, e.hp - d);
    e.hitFlash = 0.22;
    e.wobble = 0.3;
    if (d > 0) this._float(`${d}`, "#ffffff", 0.55, true);
    return d;
  }

  _endTurn() {
    if (this.state !== "playing" || this.picking || this._resolving) return;
    // Unplayed cards go to the discard: a hand is this turn's hand only.
    this.discard.push(...this.hand);
    this.hand = [];
    this._enemyTurn();
    if (this.state === "playing" && !this.picking) this._startTurn();
  }

  _enemyTurn() {
    const e = this.enemy;
    const move = e.spec.moves[e.moveIdx % e.spec.moves.length];
    e.moveIdx++;
    if (move.b) { e.block += move.b; this._float(`Blocks ${move.b}`, "#8b90ac", 0.68); }
    if (move.buff) { e.strength += move.buff; this._float(`+${move.buff} strength`, "#ff9f43", 0.68); }
    if (move.a) {
      const hits = move.hits || 1;
      for (let h = 0; h < hits; h++) {
        let d = move.a + e.strength;
        if (e.weak > 0) d = Math.round(d * 0.6);
        if (!this.wardUsed) { d = Math.round(d / 2); this.wardUsed = true; this._float("Ward holds", "#22d3ee", 0.68); }
        const absorbed = Math.min(this.block, d);
        this.block -= absorbed;
        d -= absorbed;
        this.hp -= d;
        if (d > 0) this.shake();
        if (move.drain) e.hp = Math.min(e.maxHp, e.hp + Math.round(d * 0.5));
      }
      audioManager.play("hit");
    }
    if (e.weak > 0) e.weak--;
    if (e.vuln > 0) e.vuln--;
    if (this.hp <= 0) { this.hp = 0; this._die(); }
  }

  _checkFightEnd() {
    if (this.enemy.hp > 0 || this.state !== "playing") return;
    this.totalFights++;
    this.addScore(60 + this.floorIdx * 40 + (this.enemy.spec.boss ? 300 : this.enemy.spec.elite ? 140 : 0));
    audioManager.play("win");
    if (this.relics.some(r => r.id === "ember")) this.hp = Math.min(this.maxHp, this.hp + 6);

    const store = this._store();
    if (store.bestFights < this.totalFights) store.bestFights = this.totalFights;
    if (store.bestFloor < this.floorIdx + 1) store.bestFloor = this.floorIdx + 1;
    this._save();

    const wasBoss = this.enemy.spec.boss;
    const wasElite = this.enemy.spec.elite;
    if (wasBoss && this.floorIdx >= FLOORS.length - 1) { this._triumph(); return; }
    if (wasBoss) {
      const rest = Math.round(this.maxHp * 0.3);
      this.hp = Math.min(this.maxHp, this.hp + rest);
      this._float(`Rest: +${rest} health`, "#2ee6a6");
    }

    // Reward: a card pick, plus a relic after anything that fought back hard.
    this._offerReward(wasElite || wasBoss, () => {
      if (wasBoss) { this.floorIdx++; this.fightNo = 0; }
      this._beginFight();
    });
  }

  _offerReward(withRelic, next) {
    this.picking = true;
    const pool = CARDS.filter(c => c.rarity > 0);
    const weight = (c) => c.rarity === 1 ? 60 : c.rarity === 2 ? 30 : 10 + this.floorIdx * 6;
    const picks = [];
    while (picks.length < 3 && picks.length < pool.length) {
      const total = pool.reduce((s, c) => s + (picks.includes(c) ? 0 : weight(c)), 0);
      let roll = Math.random() * total, got = null;
      for (const c of pool) {
        if (picks.includes(c)) continue;
        if (roll < weight(c)) { got = c; break; }
        roll -= weight(c);
      }
      if (got) picks.push(got); else break;
    }

    const finish = () => {
      closeModal();
      this.picking = null;
      if (withRelic) this._offerRelic(next); else next();
    };

    const grid = el("div", { class: "card-grid" });
    for (const c of picks) {
      const node = el("button", { class: "rd-card", onClick: () => { this.deck.push(c.id); audioManager.play("powerup"); finish(); } });
      node.appendChild(this._cardNode(c));
      grid.appendChild(node);
    }
    openModal({
      title: `Fight ${this.totalFights} cleared — take a card`,
      bodyNode: el("div", { class: "reward-body" }, [
        el("p", { class: "zone-intro" }, `Health ${this.hp}/${this.maxHp} · deck ${this.deck.length} cards. A thin deck draws its good cards more often.`),
        grid,
      ]),
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-ghost", onClick: () => finish() }, "Skip (keep the deck lean)"),
        el("button", { class: "btn btn-ghost", onClick: () => this._showDeck(() => this._offerReward(withRelic, next)) }, "View deck"),
      ]),
    });
  }

  _offerRelic(next) {
    const owned = new Set(this.relics.map(r => r.id));
    const pool = RELICS.filter(r => !owned.has(r.id));
    if (!pool.length) { next(); return; }
    const picks = shuffle(pool).slice(0, 2);
    const take = (r) => {
      this.relics.push(r);
      if (r.id === "chalice") { this.maxHp += 12; this.hp += 12; }
      audioManager.play("powerup");
      closeModal();
      next();
    };
    openModal({
      title: "A relic in the rubble",
      bodyNode: el("div", { class: "reward-body" }, [
        el("p", { class: "zone-intro" }, "Relics last for the whole run."),
        el("div", { class: "relic-grid" }, picks.map(r =>
          el("button", { class: "relic-card", onClick: () => take(r) }, [
            el("span", { class: "ic" }, relicGlyph(r.icon)),
            el("span", { class: "nm" }, r.name),
            el("span", { class: "ds" }, r.text),
          ]))),
      ]),
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-ghost", onClick: () => { closeModal(); next(); } }, "Leave them"),
      ]),
    });
  }

  _showDeck(onClose) {
    const counts = {};
    for (const id of this.deck) counts[id] = (counts[id] || 0) + 1;
    const grid = el("div", { class: "card-grid small" });
    for (const [id, n] of Object.entries(counts).sort()) {
      const wrap = el("div", { class: "rd-card static" });
      wrap.appendChild(this._cardNode(byId[id]));
      if (n > 1) wrap.appendChild(el("span", { class: "count" }, `×${n}`));
      grid.appendChild(wrap);
    }
    openModal({
      title: `Your deck — ${this.deck.length} cards`,
      bodyNode: el("div", { class: "reward-body" }, [grid]),
      footerNode: el("button", {
        class: "btn btn-primary",
        onClick: () => { closeModal(); onClose?.(); },
      }, "Close"),
    });
  }

  /** A card rendered as DOM, used by every menu that shows cards. */
  _cardNode(c) {
    return el("div", { class: `card-face k-${c.kind}` }, [
      el("span", { class: "cost" }, String(c.cost)),
      el("span", { class: "nm" }, c.name),
      el("span", { class: "kind" }, c.kind),
      el("span", { class: "tx" }, c.text),
    ]);
  }

  _die() {
    const store = this._store();
    this._save();
    this.endGame({
      result: "loss", score: this.score,
      message: `${this.enemy.spec.name} finished it on ${FLOORS[this.floorIdx].name}, after ${this.totalFights} fights.`,
      extraStats: [
        { label: "Floor", value: `${this.floorIdx + 1}/3` },
        { label: "Fights", value: this.totalFights },
        { label: "Deck", value: `${this.deck.length} cards` },
      ],
    });
  }

  _triumph() {
    const store = this._store();
    store.wins = (store.wins || 0) + 1;
    store.bestFloor = 3;
    this._save();
    this.addScore(1200);
    this.endGame({
      result: "win", score: this.score,
      message: `The Rift Itself is closed. ${this.totalFights} fights, ${this.relics.length} relics, ${this.deck.length} cards.`,
      extraStats: [
        { label: "Health left", value: `${this.hp}/${this.maxHp}` },
        { label: "Relics", value: this.relics.length },
        { label: "Deck", value: `${this.deck.length} cards` },
      ],
    });
  }

  _float(text, color, scale = 1, onEnemy = false) {
    this.floaters.push({ text, color, scale, onEnemy, t: 0, dx: (Math.random() - 0.5) * 40 });
  }

  _updateHud() {
    this.setHud({
      Health: `${this.hp}/${this.maxHp}`,
      Energy: `${this.energy ?? 0}/${this.energyMax ?? 3}`,
      Block: this.block ?? 0,
      Floor: `${this.floorIdx + 1}-${this.fightNo}`,
    });
  }

  // ------------------------------------------------------------- INPUT ---
  /** Hit-tests the laid-out hand and the end-turn button. */
  _click(x, y) {
    if (this.state !== "playing" || this.picking) return;
    const L = this._layout();
    if (x >= L.end.x && x <= L.end.x + L.end.w && y >= L.end.y && y <= L.end.y + L.end.h) {
      this._endTurn();
      return;
    }
    for (let i = this.hand.length - 1; i >= 0; i--) {
      const s = L.slots[i];
      if (!s) continue;
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) { this._playCard(i); return; }
    }
  }

  /**
   * Hand layout. Cards overlap when the hand is wide so a full hand still
   * fits a phone stage, and the whole row is centred on the stage.
   */
  _layout() {
    const W = this.viewW, H = this.viewH;
    const cw = clamp(W * 0.19, 74, 108);
    const ch = cw * 1.42;
    const n = Math.max(1, this.hand?.length || 0);
    const gap = 8;
    const need = n * cw + (n - 1) * gap;
    const step = need <= W - 24 ? cw + gap : (W - 24 - cw) / Math.max(1, n - 1);
    const startX = (W - (cw + step * (n - 1))) / 2;
    const y = H - ch - 14;
    const slots = [];
    for (let i = 0; i < n; i++) slots.push({ x: startX + step * i, y, w: cw, h: ch });
    return {
      cw, ch, slots,
      end: { x: W - 108, y: y - 46, w: 96, h: 34 },
      enemyY: H * 0.28, heroY: H * 0.28,
    };
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    this.elapsed += dt;
    const e = this.enemy;
    if (e) {
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.wobble > 0) e.wobble -= dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t > 1.3) this.floaters.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const L = this._layout();

    this._drawBack(ctx, W, H);
    this._drawPlatform(ctx, W, H, L);
    if (this.enemy) {
      this._drawEnemy(ctx, W, L.enemyY);
      this._drawIntent(ctx, W, L.enemyY);
    }
    this._drawHero(ctx, W, H, L);
    this._drawPiles(ctx, W, H, L);
    this._drawHand(ctx, L);
    this._drawEndButton(ctx, L);
    this._drawRelics(ctx, W);
    this._drawFloaters(ctx, W, H, L);
    ctx.restore();
  }

  /** A rift backdrop: banded dark gradient plus a slow ring behind the enemy. */
  _drawBack(ctx, W, H) {
    const fl = FLOORS[this.floorIdx];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, ["#1a1030", "#150b26", "#0f0620"][this.floorIdx] || "#150b26");
    g.addColorStop(1, "#07040e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H * 0.30;
    for (let i = 0; i < 4; i++) {
      const r = 60 + i * 34 + Math.sin(this.elapsed * 0.7 + i) * 6;
      ctx.strokeStyle = `rgba(124,92,255,${0.16 - i * 0.03})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "700 11px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${fl.name} · fight ${this.fightNo}/${fl.fights + 1}`, W / 2, 18);
  }

  /**
   * A cracked platform under the enemy. Without it the middle of the stage
   * was a large empty band between the health bars and the hand.
   */
  _drawPlatform(ctx, W, H, L) {
    const y = L.enemyY + 136;
    const w = Math.min(W * 0.72, 320);
    ctx.save();
    ctx.translate(W / 2, y);
    const g = ctx.createLinearGradient(0, -8, 0, 26);
    g.addColorStop(0, "#2a2140"); g.addColorStop(1, "#120c1e");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, 22, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(168,107,255,0.35)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, w / 2, 22, 0, 0, 7); ctx.stroke();
    // Cracks running out from the centre.
    ctx.strokeStyle = "rgba(168,107,255,0.22)"; ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * w * 0.36, Math.sin(a) * 18);
      ctx.stroke();
    }
    ctx.restore();
    // A drifting mote field over the empty middle.
    ctx.fillStyle = "rgba(168,107,255,0.3)";
    for (let i = 0; i < 14; i++) {
      const t = this.elapsed * 0.35 + i;
      const mx = W / 2 + Math.sin(t * 0.7 + i * 2) * (W * 0.36);
      const my = y - 70 + ((t * 22 + i * 30) % 170);
      ctx.beginPath(); ctx.arc(mx, my, 1.6 + (i % 3) * 0.7, 0, 7); ctx.fill();
    }
  }

  /** Enemy body drawn from its shape, with an HP and block bar under it. */
  _drawEnemy(ctx, W, y) {
    const e = this.enemy;
    const cx = W / 2;
    const wob = e.wobble > 0 ? Math.sin(e.wobble * 60) * e.wobble * 14 : 0;
    ctx.save();
    ctx.translate(cx + wob, y);
    const scale = e.spec.boss ? 1.5 : e.spec.elite ? 1.25 : 1;
    ctx.scale(scale, scale);
    const flash = e.hitFlash > 0;
    const body = flash ? "#ffffff" : e.spec.color;
    const bob = Math.sin(this.elapsed * 1.8) * 4;
    ctx.translate(0, bob);

    // Glow.
    const gg = ctx.createRadialGradient(0, 0, 4, 0, 0, 64);
    gg.addColorStop(0, hexA(e.spec.color, 0.32));
    gg.addColorStop(1, hexA(e.spec.color, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, 64, 0, 7); ctx.fill();

    ctx.fillStyle = body;
    const s = e.spec.shape;
    if (s === "wisp") {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = 30 + Math.sin(a * 3 + this.elapsed * 2) * 6;
        i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.15) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 1.15);
      }
      ctx.closePath(); ctx.fill();
    } else if (s === "husk") {
      ctx.fillRect(-28, -34, 56, 62);
      ctx.fillStyle = hexA(e.spec.color, 0.6);
      ctx.fillRect(-34, -22, 12, 30);
      ctx.fillRect(22, -22, 12, 30);
    } else if (s === "swarm") {
      for (let i = 0; i < 7; i++) {
        const a = this.elapsed * (1 + i * 0.2) + i;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (14 + i * 3), Math.sin(a * 1.3) * (12 + i * 2), 9 - i * 0.6, 0, 7);
        ctx.fill();
      }
    } else if (s === "leech") {
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#2a0a14";
      ctx.beginPath(); ctx.ellipse(0, -18, 10, 8, 0, 0, 7); ctx.fill();
    } else if (s === "shade") {
      ctx.beginPath();
      ctx.moveTo(-26, 30);
      ctx.quadraticCurveTo(-30, -34, 0, -36);
      ctx.quadraticCurveTo(30, -34, 26, 30);
      for (let i = 4; i >= 0; i--) {
        ctx.lineTo(-26 + i * 13, 30 + Math.sin(this.elapsed * 3 + i) * 7);
      }
      ctx.closePath(); ctx.fill();
    } else if (s === "maw") {
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.fill();
      ctx.fillStyle = "#0b0510";
      const open = 8 + Math.sin(this.elapsed * 2) * 5;
      ctx.beginPath(); ctx.ellipse(0, 6, 22, open, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffffff";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 9 - 4, 6 - open); ctx.lineTo(i * 9, 6 - open + 7); ctx.lineTo(i * 9 + 4, 6 - open);
        ctx.closePath(); ctx.fill();
      }
    }
    // Eyes, on everything that has a front.
    if (s !== "swarm" && s !== "maw") {
      ctx.fillStyle = "#0b0510";
      ctx.beginPath(); ctx.arc(-9, -8, 4.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(9, -8, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = flash ? "#ff5470" : "#ffffff";
      ctx.beginPath(); ctx.arc(-8, -9, 1.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -9, 1.8, 0, 7); ctx.fill();
    }
    ctx.restore();

    // Name and bars.
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "800 14px 'Sora', system-ui, sans-serif";
    ctx.fillText(e.spec.name, cx, y + 66);
    const bw = 150, bh = 10, bx = cx - bw / 2, by = y + 74;
    ctx.fillStyle = "rgba(8,6,16,0.8)";
    roundRect(ctx, bx, by, bw, bh, 5); ctx.fill();
    ctx.fillStyle = "#ff5470";
    roundRect(ctx, bx + 1, by + 1, Math.max(0, (bw - 2) * (e.hp / e.maxHp)), bh - 2, 4); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "700 10px 'Inter', system-ui, sans-serif";
    ctx.fillText(`${e.hp}/${e.maxHp}`, cx, by + bh + 11);
    if (e.block > 0) this._shieldBadge(ctx, bx - 14, by + 5, e.block);
    // Status pips.
    const st = [];
    if (e.vuln > 0) st.push(["VULN", "#ff4fd8", e.vuln]);
    if (e.weak > 0) st.push(["WEAK", "#7c5cff", e.weak]);
    if (e.bleed > 0) st.push(["BLEED", "#ff5470", e.bleed]);
    if (e.strength > 0) st.push(["STR", "#ff9f43", e.strength]);
    st.forEach((s2, i) => {
      const x = cx - (st.length - 1) * 34 + i * 68;
      ctx.fillStyle = hexA(s2[1], 0.22);
      roundRect(ctx, x - 28, by + bh + 16, 56, 15, 7); ctx.fill();
      ctx.fillStyle = s2[1];
      ctx.font = "800 9px 'Inter', system-ui, sans-serif";
      ctx.fillText(`${s2[0]} ${s2[2]}`, x, by + bh + 27);
    });
  }

  /** The enemy's telegraphed next move, drawn as an icon plus a number. */
  _drawIntent(ctx, W, y) {
    const e = this.enemy;
    const move = e.spec.moves[e.moveIdx % e.spec.moves.length];
    const cx = W / 2, iy = y - 74;
    ctx.save();
    ctx.textAlign = "center";
    let label = "", color = "#ffffff";
    if (move.a) {
      let d = move.a + e.strength;
      if (e.weak > 0) d = Math.round(d * 0.6);
      label = move.hits ? `${d}×${move.hits}` : `${d}`;
      color = "#ff5470";
      // Sword.
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, iy - 14); ctx.lineTo(cx, iy + 8);
      ctx.moveTo(cx - 7, iy + 2); ctx.lineTo(cx + 7, iy + 2);
      ctx.stroke();
    } else if (move.b) {
      label = `${move.b}`;
      color = "#8b90ac";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, iy - 14);
      ctx.lineTo(cx + 10, iy - 9); ctx.lineTo(cx + 10, iy + 2);
      ctx.quadraticCurveTo(cx, iy + 12, cx - 10, iy + 2);
      ctx.lineTo(cx - 10, iy - 9);
      ctx.closePath(); ctx.fill();
    } else {
      label = `+${move.buff}`;
      color = "#ff9f43";
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, iy + 8); ctx.lineTo(cx, iy - 12);
      ctx.moveTo(cx - 7, iy - 5); ctx.lineTo(cx, iy - 13); ctx.lineTo(cx + 7, iy - 5);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.font = "800 14px 'Sora', system-ui, sans-serif";
    ctx.fillText(label, cx, iy + 26);
    if (move.drain) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.fillText("DRAINS", cx, iy + 38);
    }
    ctx.restore();
  }

  /** Player plate: health bar, block shield and energy orb. */
  _drawHero(ctx, W, H, L) {
    const y = L.slots[0] ? L.slots[0].y - 58 : H - 200;
    const bw = Math.min(210, W * 0.46), bx = 14, bh = 12;
    ctx.fillStyle = "rgba(8,6,16,0.75)";
    roundRect(ctx, bx, y, bw, bh, 6); ctx.fill();
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, frac < 0.3 ? "#ff5470" : "#2ee6a6");
    g.addColorStop(1, frac < 0.3 ? "#ff9f43" : "#7cf0d0");
    ctx.fillStyle = g;
    roundRect(ctx, bx + 1, y + 1, Math.max(0, (bw - 2) * frac), bh - 2, 5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "800 10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${this.hp}/${this.maxHp}`, bx + 5, y + bh - 2.5);
    if (this.block > 0) this._shieldBadge(ctx, bx + bw + 14, y + bh / 2, this.block);

    // Energy orb, on the left beside the health bar: on the right it sat on
    // top of the End Turn button on a narrow stage.
    const ex = bx + bw + 44, ey = y + 4;
    const eg = ctx.createRadialGradient(ex, ey, 2, ex, ey, 20);
    eg.addColorStop(0, "#ffe9a8"); eg.addColorStop(1, "#c9971c");
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, 18, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, 18, 0, 7); ctx.stroke();
    ctx.fillStyle = "#2a1f04";
    ctx.font = "800 15px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${this.energy}`, ex, ey + 5);
  }

  _shieldBadge(ctx, x, y, n) {
    ctx.save();
    ctx.fillStyle = "#8b90ac";
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 9, y + 2);
    ctx.quadraticCurveTo(x, y + 12, x - 9, y + 2);
    ctx.lineTo(x - 9, y - 7);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0b0a12";
    ctx.font = "800 10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(n), x, y + 3);
    ctx.restore();
  }

  _drawPiles(ctx, W, H, L) {
    const y = H - 16;
    ctx.font = "700 10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`Draw ${this.drawPile.length}`, 12, y);
    ctx.textAlign = "right";
    ctx.fillText(`Discard ${this.discard.length}`, W - 12, y);
  }

  /** The hand, drawn as painted cards with a fan-out lift. */
  _drawHand(ctx, L) {
    this.hand.forEach((id, i) => {
      const c = byId[id];
      const s = L.slots[i];
      if (!c || !s) return;
      const playable = c.cost <= this.energy;
      const lift = playable ? Math.sin(this.elapsed * 2 + i) * 2 : 0;
      ctx.save();
      ctx.translate(s.x, s.y + lift);
      ctx.globalAlpha = playable ? 1 : 0.5;

      const pal = { attack: ["#7a2233", "#ff5470"], skill: ["#1d3a52", "#22d3ee"], power: ["#3a2a5c", "#a86bff"] }[c.kind];
      const g = ctx.createLinearGradient(0, 0, 0, s.h);
      g.addColorStop(0, pal[0]); g.addColorStop(1, "#12101c");
      ctx.fillStyle = g;
      roundRect(ctx, 0, 0, s.w, s.h, 8); ctx.fill();
      ctx.strokeStyle = playable ? pal[1] : "rgba(255,255,255,0.14)";
      ctx.lineWidth = playable ? 2 : 1.2;
      roundRect(ctx, 0.5, 0.5, s.w - 1, s.h - 1, 8); ctx.stroke();

      // Art band: a simple glyph per kind so cards read at a glance.
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, 4, 20, s.w - 8, s.h * 0.34, 5);
      ctx.clip();
      ctx.fillStyle = hexA(pal[1], 0.2);
      ctx.fillRect(4, 20, s.w - 8, s.h * 0.34);
      ctx.strokeStyle = pal[1]; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      const gx = s.w / 2, gy = 20 + s.h * 0.17;
      if (c.kind === "attack") {
        ctx.beginPath(); ctx.moveTo(gx - 8, gy + 8); ctx.lineTo(gx + 8, gy - 8);
        ctx.moveTo(gx + 2, gy - 8); ctx.lineTo(gx + 8, gy - 8); ctx.lineTo(gx + 8, gy - 2);
        ctx.stroke();
      } else if (c.kind === "skill") {
        ctx.beginPath();
        ctx.moveTo(gx, gy - 9); ctx.lineTo(gx + 8, gy - 5); ctx.lineTo(gx + 8, gy + 2);
        ctx.quadraticCurveTo(gx, gy + 10, gx - 8, gy + 2);
        ctx.lineTo(gx - 8, gy - 5); ctx.closePath(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(gx, gy, 7, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(gx, gy, 3, 0, 7); ctx.fill();
      }
      ctx.restore();

      // Cost pip.
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath(); ctx.arc(12, 12, 9, 0, 7); ctx.fill();
      ctx.fillStyle = "#2a1f04";
      ctx.font = "800 11px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(c.cost), 12, 16);

      // Name + text.
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 10px 'Sora', system-ui, sans-serif";
      ctx.fillText(c.name, s.w / 2, 20 + s.h * 0.34 + 14);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "600 8px 'Inter', system-ui, sans-serif";
      wrapText(ctx, c.text, s.w / 2, 20 + s.h * 0.34 + 27, s.w - 10, 9);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  _drawEndButton(ctx, L) {
    const b = L.end;
    ctx.fillStyle = "rgba(124,92,255,0.9)";
    roundRect(ctx, b.x, b.y, b.w, b.h, 17); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.5;
    roundRect(ctx, b.x, b.y, b.w, b.h, 17); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("End Turn", b.x + b.w / 2, b.y + b.h / 2 + 4);
  }

  _drawRelics(ctx, W) {
    this.relics.forEach((r, i) => {
      const x = 16 + i * 26, y = 34;
      ctx.fillStyle = "rgba(255,215,106,0.18)";
      ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.stroke();
      ctx.fillStyle = "#ffd76a";
      ctx.font = "800 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(relicGlyph(r.icon), x, y + 4);
    });
  }

  _drawFloaters(ctx, W, H, L) {
    ctx.textAlign = "center";
    this.floaters.forEach((f) => {
      const p = f.t / 1.3;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.fillStyle = f.color;
      ctx.font = `800 ${Math.round(20 * f.scale)}px 'Sora', system-ui, sans-serif`;
      const y = (f.onEnemy ? L.enemyY - 20 : H * 0.52) - p * 40;
      ctx.fillText(f.text, W / 2 + f.dx, y);
    });
    ctx.globalAlpha = 1;
  }
}

function relicGlyph(icon) {
  return { coil: "C", plate: "P", lens: "L", ember: "E", fang: "F", sigil: "W", chalice: "H" }[icon] || "?";
}

function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
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

export default RiftDeckGame;
