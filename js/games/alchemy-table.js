// ==========================================================================
// Alchemy Table — start with four elements and end with a hundred and twenty-eight.
//
// Drag one thing onto another. If the pair is a recipe, you discover what it
// makes and it joins the shelf permanently. That is the entire rule, and
// everything else in the game is the recipe tree: 124 recipes in eight
// tiers reaching 128 elements, where the interesting ones need something
// you only got two steps earlier.
//
// Discoveries are saved, so the shelf is a collection you build across
// sessions rather than a puzzle you solve once. A hint costs a little of
// the score you have banked, which keeps it a real decision.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, choice, shuffle } from "../core/utils.js";

// --- The tree -------------------------------------------------------------
// [result, a, b]. Written as a flat list because the tree is the content:
// keeping it in one readable table is worth more than any clever structure.
const RECIPES = [
  // Tier 1 — the four starters combine into the world's basics
  ["steam", "water", "fire"], ["mud", "water", "earth"], ["dust", "earth", "air"],
  ["lava", "earth", "fire"], ["rain", "water", "air"], ["energy", "fire", "air"],
  ["sea", "water", "water"], ["mountain", "earth", "earth"], ["wind", "air", "air"],
  ["heat", "fire", "fire"],
  // Tier 2
  ["cloud", "steam", "air"], ["stone", "lava", "water"], ["sand", "stone", "air"],
  ["clay", "mud", "sand"], ["storm", "cloud", "energy"], ["lightning", "storm", "energy"],
  ["obsidian", "lava", "sea"], ["geyser", "steam", "earth"], ["swamp", "mud", "rain"],
  ["desert", "sand", "heat"], ["island", "sea", "mountain"], ["volcano", "mountain", "lava"],
  ["ash", "fire", "dust"], ["glass", "sand", "fire"], ["metal", "stone", "fire"],
  // Tier 3 — life
  ["life", "energy", "swamp"], ["algae", "life", "water"], ["plant", "life", "earth"],
  ["moss", "plant", "stone"], ["tree", "plant", "time"], ["grass", "plant", "rain"],
  ["flower", "plant", "sun"], ["seed", "plant", "sand"], ["bacteria", "life", "swamp"],
  ["egg", "life", "stone"], ["fish", "life", "sea"], ["bird", "life", "air"],
  ["lizard", "egg", "swamp"], ["beetle", "life", "plant"], ["worm", "life", "mud"],
  // Sky
  ["sun", "fire", "sky"], ["sky", "cloud", "air"], ["moon", "sky", "stone"],
  ["star", "sky", "energy"], ["space", "sky", "sky"], ["rainbow", "rain", "sun"],
  ["time", "sand", "glass"], ["horizon", "sky", "sea"],
  // Tier 4 — the made world
  ["brick", "clay", "fire"], ["wall", "brick", "brick"], ["house", "wall", "wood"],
  ["wood", "tree", "metal"], ["paper", "wood", "water"], ["book", "paper", "time"],
  ["wheel", "wood", "stone"], ["cart", "wheel", "wood"], ["boat", "wood", "sea"],
  ["blade", "metal", "stone"], ["sword", "blade", "wood"], ["armour", "metal", "metal"],
  ["tool", "metal", "wood"], ["forge", "fire", "metal"], ["steel", "forge", "metal"],
  ["gear", "steel", "tool"], ["engine", "gear", "energy"], ["train", "engine", "cart"],
  ["ship", "engine", "boat"], ["plane", "engine", "bird"], ["rocket", "engine", "space"],
  // Tier 5 — creatures
  ["dinosaur", "lizard", "time"], ["dragon", "dinosaur", "fire"], ["phoenix", "bird", "fire"],
  ["mammal", "life", "grass"], ["horse", "mammal", "grass"], ["wolf", "mammal", "forest"],
  ["forest", "tree", "tree"], ["jungle", "forest", "rain"], ["human", "mammal", "tool"],
  ["farmer", "human", "seed"], ["smith", "human", "forge"], ["sailor", "human", "boat"],
  ["knight", "human", "armour"], ["wizard", "human", "magic"], ["pirate", "sailor", "sword"],
  ["astronaut", "human", "rocket"], ["scholar", "human", "book"],
  // Tier 6 — the abstract
  ["magic", "energy", "star"], ["spell", "magic", "book"], ["potion", "magic", "water"],
  ["curse", "ghost", "magic"], ["death", "life", "time"], ["ghost", "death", "magic"],
  ["soul", "life", "magic"], ["golem", "clay", "magic"], ["philosopher", "scholar", "time"],
  ["gold", "metal", "sun"], ["philosophers_stone", "philosopher", "gold"],
  ["elixir", "philosophers_stone", "potion"], ["immortality", "elixir", "soul"],
  // Tier 7 — civilisation
  ["village", "house", "human"], ["city", "village", "village"], ["castle", "city", "wall"],
  ["kingdom", "castle", "knight"], ["empire", "kingdom", "kingdom"], ["war", "empire", "sword"],
  ["peace", "war", "time"], ["history", "peace", "book"], ["library", "house", "book"],
  ["university", "library", "scholar"], ["science", "university", "time"],
  ["machine", "science", "gear"], ["computer", "machine", "lightning"],
  ["network", "computer", "computer"], ["ai", "network", "life"],
  // Tier 8 — the far end
  ["satellite", "rocket", "computer"], ["colony", "city", "space"],
  ["galaxy", "star", "space"], ["universe", "galaxy", "galaxy"],
  ["black_hole", "star", "death"], ["singularity", "black_hole", "ai"],
  ["creation", "universe", "life"], ["legend", "history", "dragon"],
  ["myth", "legend", "time"], ["alchemy", "philosophers_stone", "science"],
];

// --- Presentation ---------------------------------------------------------
// Each element gets a glyph family and a palette; the glyph is drawn, never
// an emoji, so the shelf looks like one set rather than a font sample.
const GROUPS = {
  base:    { colors: ["#5fa8d8", "#c96b4a", "#8a7a5c", "#c9d4e8"] },
  nature:  { color: "#6f9c5c" }, water: { color: "#4fa8d8" }, fire: { color: "#e8574a" },
  earth:   { color: "#a8875c" }, air: { color: "#a8c4d8" }, life: { color: "#2ee6a6" },
  made:    { color: "#8b90ac" }, sky: { color: "#7c9cd8" }, magic: { color: "#a86bff" },
  people:  { color: "#ffb07c" }, civ: { color: "#ffd76a" }, cosmic: { color: "#ff4fd8" },
};
const GROUP_OF = {
  water: "water", sea: "water", rain: "water", steam: "water", cloud: "water", swamp: "water",
  geyser: "water", storm: "water", horizon: "water", ocean: "water",
  fire: "fire", lava: "fire", heat: "fire", energy: "fire", lightning: "fire", ash: "fire",
  volcano: "fire", forge: "fire",
  earth: "earth", mud: "earth", dust: "earth", stone: "earth", sand: "earth", clay: "earth",
  mountain: "earth", desert: "earth", island: "earth", obsidian: "earth", glass: "earth",
  air: "air", wind: "air", sky: "sky", sun: "sky", moon: "sky", star: "sky", space: "sky",
  rainbow: "sky", time: "sky", galaxy: "cosmic", universe: "cosmic", black_hole: "cosmic",
  singularity: "cosmic", creation: "cosmic", satellite: "cosmic", colony: "cosmic",
  life: "life", algae: "life", plant: "life", moss: "life", tree: "life", grass: "life",
  flower: "life", seed: "life", bacteria: "life", egg: "life", fish: "life", bird: "life",
  lizard: "life", beetle: "life", worm: "life", forest: "life", jungle: "life",
  dinosaur: "life", dragon: "magic", phoenix: "magic", mammal: "life", horse: "life", wolf: "life",
  metal: "made", brick: "made", wall: "made", house: "made", wood: "made", paper: "made",
  book: "made", wheel: "made", cart: "made", boat: "made", blade: "made", sword: "made",
  armour: "made", tool: "made", steel: "made", gear: "made", engine: "made", train: "made",
  ship: "made", plane: "made", rocket: "made", machine: "made", computer: "made", network: "made",
  human: "people", farmer: "people", smith: "people", sailor: "people", knight: "people",
  wizard: "people", pirate: "people", astronaut: "people", scholar: "people",
  philosopher: "people", ai: "made",
  magic: "magic", spell: "magic", potion: "magic", curse: "magic", death: "magic",
  ghost: "magic", soul: "magic", golem: "magic", gold: "civ",
  philosophers_stone: "magic", elixir: "magic", immortality: "magic", alchemy: "magic",
  village: "civ", city: "civ", castle: "civ", kingdom: "civ", empire: "civ", war: "civ",
  peace: "civ", history: "civ", library: "civ", university: "civ", science: "civ",
  legend: "civ", myth: "magic",
};

const START = ["water", "fire", "earth", "air"];

// Recipes keyed both ways so order never matters.
const LOOKUP = new Map();
for (const [out, a, b] of RECIPES) {
  LOOKUP.set(`${a}|${b}`, out);
  LOOKUP.set(`${b}|${a}`, out);
}
const ALL = [...new Set([...START, ...RECIPES.map(r => r[0])])];

function label(id) {
  return id.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export class AlchemyTableGame extends GameBase {
  getDifficulties() { return ["Discovery"]; }
  getInstructions() {
    return [
      "Drag one element onto another. If the pair makes something, it is discovered and joins the shelf for good.",
      "You start with water, fire, earth and air. Everything else — all 124 of them — comes out of those four.",
      "Order never matters. Water on fire and fire on water are the same combination.",
      "Stuck? A hint names two things on your shelf that make something new, for a small slice of your score.",
      "Discoveries are saved between sessions. The shelf is a collection, not a puzzle you finish in one sitting.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag an element from the shelf onto another to combine them."; }
  getKeyboardHint() { return "Drag with the mouse. H asks for a hint."; }
  getScene() { return "aurora"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.alch) custom.alch = { found: {}, hints: 0 };
    const a = custom.alch;
    if (!a.found) a.found = {};
    for (const s of START) a.found[s] = true;
    return a;
  }
  _save() { saveManager.saveNow(); }
  _foundList() {
    const f = this._store().found;
    return ALL.filter(id => f[id]);
  }

  getPlayLabel() { return "Open the table"; }
  getStartExtras() {
    const a = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `${Object.keys(a.found).length}/${ALL.length} discovered`),
      el("span", {}, `${RECIPES.length} recipes in the tree`),
    ]);
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "grab";
    this.input.onPointer("down", (p) => this._down(p.x, p.y));
    this.input.onPointer("move", (p) => this._move(p.x, p.y));
    this.input.onPointer("up", (p) => this._up(p.x, p.y));
    this.input.onKey("KeyH", () => this._hint());
  }

  onResize() { this._relayout(); }

  onStart() {
    this.found = this._foundList();
    this.bench = [];               // things placed out on the table
    this.drag = null;
    this.scroll = 0;
    this.pops = [];
    this.msg = "Drag one element onto another";
    this.msgT = 3;
    this.elapsed = 0;
    this.newest = null;
    this.discoveredThisRun = 0;
    this.setScore(Object.keys(this._store().found).length * 40);
    this._relayout();
    this._updateHud();
  }

  _relayout() {
    const W = this.viewW || 600, H = this.viewH || 600;
    this.shelfY = H - 132;
    this.cell = clamp(Math.floor(W / 7), 58, 84);
  }

  // ------------------------------------------------------------- LAYOUT --
  /** Shelf slots along the bottom, in a scrolling two-row strip. */
  _shelfSlots() {
    const W = this.viewW, c = this.cell;
    const perRow = Math.max(1, Math.floor((W - 16) / c));
    return this.found.map((id, i) => ({
      id,
      x: 8 + (i % perRow) * c,
      y: this.shelfY + 8 + Math.floor(i / perRow) * c - this.scroll,
      w: c - 6, h: c - 6,
    }));
  }

  _hitShelf(x, y) {
    if (y < this.shelfY) return null;
    for (const s of this._shelfSlots()) {
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
    }
    return null;
  }

  _hitBench(x, y) {
    for (let i = this.bench.length - 1; i >= 0; i--) {
      const b = this.bench[i];
      if (Math.hypot(b.x - x, b.y - y) < 30) return b;
    }
    return null;
  }

  // ------------------------------------------------------------- INPUT ---
  _down(x, y) {
    if (this.state !== "playing") return;
    const b = this._hitBench(x, y);
    if (b) { this.drag = { id: b.id, x, y, from: b }; this.bench = this.bench.filter(v => v !== b); return; }
    const s = this._hitShelf(x, y);
    if (s) { this.drag = { id: s.id, x, y, from: null }; return; }
  }

  _move(x, y) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }

  _up(x, y) {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    // Dropped back on the shelf: put it away.
    if (y > this.shelfY) return;
    const onto = this._hitBench(x, y);
    if (onto) { this._combine(d.id, onto, x, y); return; }
    this.bench.push({ id: d.id, x, y, pop: 0.3 });
  }

  _combine(idA, target, x, y) {
    const idB = target.id;
    const out = LOOKUP.get(`${idA}|${idB}`);
    if (!out) {
      // No recipe: both stay on the table, nudged apart, and say so.
      this.bench.push({ id: idA, x: x - 34, y, pop: 0.2, shake: 0.3 });
      target.x = x + 34;
      target.shake = 0.3;
      audioManager.play("error");
      this._say(`${label(idA)} + ${label(idB)} — nothing`, "#8b90ac");
      return;
    }
    this.bench = this.bench.filter(v => v !== target);
    this.bench.push({ id: out, x, y, pop: 0.55 });
    this.pops.push({ x, y, t: 0, color: colorOf(out) });

    const store = this._store();
    const isNew = !store.found[out];
    if (isNew) {
      store.found[out] = true;
      this._save();
      this.found = this._foundList();
      this.newest = out;
      this.discoveredThisRun++;
      this.addScore(120 + tierOf(out) * 40);
      audioManager.play("powerup");
      this._say(`Discovered ${label(out)}`, colorOf(out));
      if (Object.keys(store.found).length >= ALL.length) this._complete();
    } else {
      audioManager.play("select");
      this._say(`${label(out)}`, colorOf(out));
    }
    this._updateHud();
  }

  /**
   * A hint names a pair on the shelf that makes something undiscovered. It
   * costs score rather than being free, so it stays a decision.
   */
  _hint() {
    if (this.state !== "playing") return;
    const store = this._store();
    const have = new Set(this._foundList());
    const options = RECIPES.filter(([out, a, b]) => !store.found[out] && have.has(a) && have.has(b));
    if (!options.length) {
      this._say("Nothing on the shelf combines into anything new", "#ffd76a");
      return;
    }
    const [out, a, b] = choice(options);
    store.hints = (store.hints || 0) + 1;
    this._save();
    this.setScore(Math.max(0, this.score - 80));
    this._say(`Try ${label(a)} + ${label(b)}`, "#ffd76a");
    audioManager.play("click");
  }

  _complete() {
    this.endGame({
      result: "win", score: this.score,
      message: `Every one of the ${ALL.length} elements is on the shelf. The table is complete.`,
      extraStats: [
        { label: "Discovered", value: ALL.length },
        { label: "This session", value: this.discoveredThisRun },
        { label: "Hints used", value: this._store().hints || 0 },
      ],
    });
  }

  _say(text, color) { this.msg = text; this.msgColor = color; this.msgT = 2.4; }

  _updateHud() {
    const store = this._store();
    this.setHud({
      Found: `${Object.keys(store.found).length}/${ALL.length}`,
      Session: this.discoveredThisRun,
      Table: this.bench.length,
      Hints: store.hints || 0,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    for (const b of this.bench) {
      if (b.pop > 0) b.pop -= dt;
      if (b.shake > 0) b.shake -= dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].t += dt;
      if (this.pops[i].t > 0.7) this.pops.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawTable(ctx, W, H);
    for (const p of this.pops) this._drawPop(ctx, p);
    for (const b of this.bench) this._drawToken(ctx, b.id, b.x, b.y, 30 + (b.pop > 0 ? b.pop * 18 : 0), b.shake);
    this._drawShelf(ctx, W, H);
    if (this.drag) this._drawToken(ctx, this.drag.id, this.drag.x, this.drag.y, 34, 0, true);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  /** The table surface: wood grain, a chalk circle and a couple of tools. */
  _drawTable(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#241a14"); g.addColorStop(1, "#160f0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.02)";
    ctx.lineWidth = 8;
    for (let y = 20; y < this.shelfY; y += 34) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const yy = y + Math.sin(x * 0.02 + y) * 3;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
    // Chalk working circle.
    const cx = W / 2, cy = (this.shelfY) * 0.46;
    const r = Math.min(W, this.shelfY) * 0.34;
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, 7); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + this.elapsed * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    if (!this.bench.length) {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.font = "700 13px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("drop elements here", cx, cy + 4);
    }
  }

  /** The shelf strip: every discovered element, in discovery order. */
  _drawShelf(ctx, W, H) {
    ctx.fillStyle = "rgba(10,7,16,0.9)";
    ctx.fillRect(0, this.shelfY, W, H - this.shelfY);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, this.shelfY); ctx.lineTo(W, this.shelfY); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.rect(0, this.shelfY + 1, W, H - this.shelfY - 1); ctx.clip();
    for (const s of this._shelfSlots()) {
      if (s.y > H || s.y + s.h < this.shelfY) continue;
      const isNew = s.id === this.newest;
      this._drawToken(ctx, s.id, s.x + s.w / 2, s.y + s.h / 2 - 4, s.w * 0.42, 0, false, isNew);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "700 8px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      const nm = label(s.id);
      ctx.fillText(nm.length > 11 ? nm.slice(0, 10) + "…" : nm, s.x + s.w / 2, s.y + s.h - 1);
    }
    ctx.restore();
  }

  /**
   * One element token. The glyph is chosen by the element's group, so a
   * creature never looks like a machine even though nothing here is a
   * bespoke drawing for each of the 120.
   */
  _drawToken(ctx, id, x, y, r, shakeT = 0, lifted = false, isNew = false) {
    const c = colorOf(id);
    const sx = shakeT > 0 ? Math.sin(shakeT * 60) * shakeT * 14 : 0;
    ctx.save();
    ctx.translate(x + sx, y);

    if (lifted) {
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    }
    if (isNew) {
      const p = 0.5 + Math.sin(this.elapsed * 5) * 0.5;
      ctx.strokeStyle = hexA("#ffd76a", 0.4 + p * 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, 7); ctx.stroke();
    }
    // Disc.
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, shade(c, 0.28));
    g.addColorStop(1, shade(c, -0.3));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.strokeStyle = shade(c, 0.4);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.shadowBlur = 0;

    // Glyph.
    ctx.save();
    ctx.scale(r / 30, r / 30);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    drawGlyph(ctx, GROUP_OF[id] || "made", id, this.elapsed);
    ctx.restore();
    ctx.restore();
  }

  _drawPop(ctx, p) {
    const k = p.t / 0.7;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3 * (1 - k) + 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 12 + k * 52, 0, 7); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = 14 + k * 46;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2.6 * (1 - k), 0, 7);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.restore();
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,6,14,0.7)";
    const w = ctx.measureText(this.msg).width;
    roundRect(ctx, W / 2 - 130, 14, 260, 30, 15); ctx.fill();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 14px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, 34);
    ctx.restore();
  }
}

/** Group glyphs. One routine, switched on the group, plus a few specials. */
function drawGlyph(ctx, group, id, t) {
  if (id === "water" || group === "water") {
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.quadraticCurveTo(9, 1, 0, 10); ctx.quadraticCurveTo(-9, 1, 0, -11);
    ctx.closePath(); ctx.fill();
  } else if (group === "fire") {
    ctx.beginPath();
    ctx.moveTo(0, 11);
    ctx.quadraticCurveTo(-9, 3, -3, -4);
    ctx.quadraticCurveTo(-2, -10, 2, -12);
    ctx.quadraticCurveTo(1, -5, 5, -6);
    ctx.quadraticCurveTo(10, 1, 0, 11);
    ctx.closePath(); ctx.fill();
  } else if (group === "earth") {
    ctx.beginPath();
    ctx.moveTo(-11, 8); ctx.lineTo(-3, -8); ctx.lineTo(4, 2); ctx.lineTo(8, -4); ctx.lineTo(12, 8);
    ctx.closePath(); ctx.fill();
  } else if (group === "air") {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-11, i * 6);
      ctx.quadraticCurveTo(2, i * 6 - 4, 9, i * 6);
      ctx.stroke();
    }
  } else if (group === "sky" || group === "cosmic") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 4.5 : 11;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  } else if (group === "life") {
    ctx.beginPath();
    ctx.moveTo(0, 11); ctx.lineTo(0, -2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-5, -5, 5.5, 3.4, -0.7, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(5, -7, 5.5, 3.4, 0.7, 0, 7); ctx.fill();
  } else if (group === "magic") {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + t * 0.6;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
    }
    ctx.stroke();
  } else if (group === "people") {
    ctx.beginPath(); ctx.arc(0, -6, 4, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -2); ctx.lineTo(0, 6);
    ctx.moveTo(-6, 1); ctx.lineTo(6, 1);
    ctx.moveTo(0, 6); ctx.lineTo(-5, 12);
    ctx.moveTo(0, 6); ctx.lineTo(5, 12);
    ctx.stroke();
  } else if (group === "civ") {
    ctx.fillRect(-11, -2, 6, 13);
    ctx.fillRect(-2, -8, 6, 19);
    ctx.fillRect(7, -4, 5, 15);
  } else {
    // made: a gear, which is the honest default for a manufactured thing
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
      ctx.lineTo(Math.cos(a) * 11.5, Math.sin(a) * 11.5);
      ctx.stroke();
    }
  }
}

function colorOf(id) {
  const g = GROUP_OF[id];
  if (g && GROUPS[g]?.color) return GROUPS[g].color;
  const i = START.indexOf(id);
  return i >= 0 ? GROUPS.base.colors[i] : "#8b90ac";
}

/** How deep in the tree something is — used only to score discoveries. */
function tierOf(id) {
  const r = RECIPES.find(x => x[0] === id);
  if (!r) return 0;
  const idx = RECIPES.indexOf(r);
  return Math.floor(idx / 16);
}

function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + 255 * amt), 0, 255);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}

function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
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

export default AlchemyTableGame;
