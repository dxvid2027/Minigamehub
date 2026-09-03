// ==========================================================================
// Alchemy Table — start with four elements and end with a hundred and
// twenty-eight, every one of them with its own picture.
//
// Drag one thing onto another. If the pair is a recipe, you discover what it
// makes and it joins the shelf permanently. That is the entire rule, and
// everything else in the game is the recipe tree: 124 recipes in eight
// tiers, where the interesting ones need something you only got two steps
// earlier.
//
// The shelf is a real scrolling cabinet with category tabs and a scrollbar.
// It used to be a fixed two-row strip with a `scroll` field nothing ever
// wrote to, so past about a dozen discoveries the rest were simply
// unreachable — you could make things you could never pick up again.
//
// Artwork lives in alchemyArt.js: one drawing per element, sharing a small
// vocabulary of primitives so the set reads as one illustrated collection.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, choice } from "../core/utils.js";
import { drawElement, ringColor, inkColor } from "./alchemyArt.js";

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
const ORDER = Object.fromEntries(ALL.map((id, i) => [id, i]));

// --- Categories -----------------------------------------------------------
// The shelf can be filtered down to one family. With 128 elements a single
// flat list is a haystack even when it scrolls.
const CATS = [
  { id: "all",     name: "All",     match: () => true },
  { id: "nature",  name: "Nature",  ids: "water fire earth air steam mud dust lava rain energy sea mountain wind heat cloud stone sand clay storm lightning obsidian geyser swamp desert island volcano ash glass metal" },
  { id: "life",    name: "Life",    ids: "life algae plant moss tree grass flower seed bacteria egg fish bird lizard beetle worm forest jungle dinosaur dragon phoenix mammal horse wolf" },
  { id: "sky",     name: "Sky",     ids: "sun sky moon star space rainbow time horizon galaxy universe black_hole singularity satellite colony creation" },
  { id: "made",    name: "Crafted", ids: "brick wall house wood paper book wheel cart boat blade sword armour tool forge steel gear engine train ship plane rocket machine computer network ai" },
  { id: "people",  name: "People",  ids: "human farmer smith sailor knight wizard pirate astronaut scholar philosopher" },
  { id: "magic",   name: "Arcane",  ids: "magic spell potion curse death ghost soul golem gold philosophers_stone elixir immortality myth alchemy" },
  { id: "civ",     name: "Realms",  ids: "village city castle kingdom empire war peace history library university science legend" },
];
for (const c of CATS) if (c.ids) { const set = new Set(c.ids.split(" ")); c.match = (id) => set.has(id); }

function label(id) {
  return id.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export class AlchemyTableGame extends GameBase {
  getDifficulties() { return ["Discovery"]; }
  getInstructions() {
    return [
      "Drag one element onto another. If the pair makes something, it is discovered and joins the shelf for good.",
      "You start with water, fire, earth and air. Everything else — all 124 of them — comes out of those four.",
      "The shelf scrolls: use the wheel, drag the scrollbar on its right edge, or the tabs above it to show one family at a time.",
      "Tapping an element on the shelf puts a copy straight onto the table, which is quicker than dragging on a phone.",
      "Order never matters. Stuck? A hint names two things you already own that make something new, for a slice of your score.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap an element to place it, then drag it onto another. Swipe the shelf to scroll."; }
  getKeyboardHint() { return "Drag with the mouse, wheel to scroll the shelf. H for a hint, L for the codex."; }
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
  /** Discovered elements, in tree order so the shelf never reshuffles. */
  _foundList() {
    const f = this._store().found;
    return ALL.filter(id => f[id]);
  }
  _shelfList() {
    const cat = CATS[this.catIdx || 0];
    return this._foundList().filter(id => cat.match(id));
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
    this.input.onKey("KeyL", () => this.openCodex());
    this.input.onKey("KeyC", () => { this.bench = []; audioManager.play("click"); });
    // The wheel is the natural way to scroll a cabinet on a desktop.
    this._onWheel = (e) => {
      if (this.state !== "playing") return;
      const r = this.canvas.getBoundingClientRect();
      if (e.clientY < r.top + (this.shelfY || 0) * (r.height / (this.viewH || 1))) return;
      e.preventDefault();
      this._scrollBy(e.deltaY * 0.6);
    };
    this.canvas.addEventListener("wheel", this._onWheel, { passive: false });
    this.catIdx = 0;
  }

  onDestroy() { this.canvas?.removeEventListener("wheel", this._onWheel); }

  onResize() { this._relayout(); }

  onStart() {
    this.bench = [];               // things placed out on the table
    this.drag = null;
    this.scroll = 0;
    this.pops = [];
    this.motes = [];
    this.msg = "Drag one element onto another";
    this.msgT = 3.5;
    this.elapsed = 0;
    this.newest = null;
    this.newestT = 0;
    this.discoveredThisRun = 0;
    this.catIdx = 0;
    this.setScore(Object.keys(this._store().found).length * 40);
    this._relayout();
    this._updateHud();
  }

  _relayout() {
    const W = this.viewW || 600, H = this.viewH || 600;
    // The cabinet takes the bottom 40% of a tall stage but never less than
    // three rows, which is what makes it worth scrolling at all.
    this.cell = clamp(Math.round(W / 7), 56, 78);
    // A row is `cell` tall and its name sits in the last few pixels, so the
    // panel needs the tab strip plus a little slack or the bottom row's
    // label is clipped by the stage edge.
    const rows = clamp(Math.floor((H * 0.42 - 40) / this.cell), 2, 5);
    this.shelfH = rows * this.cell + 40;
    this.shelfY = H - this.shelfH;
    this.tabY = this.shelfY + 5;
    this.gridY = this.shelfY + 34;
    this.perRow = Math.max(1, Math.floor((W - 26) / this.cell));
    this._clampScroll();
  }

  _rowsNeeded() { return Math.ceil(this._shelfList().length / this.perRow); }
  _maxScroll() {
    const visible = this.shelfH - 40;
    return Math.max(0, this._rowsNeeded() * this.cell - visible);
  }
  _clampScroll() { this.scroll = clamp(this.scroll || 0, 0, this._maxScroll()); }
  _scrollBy(d) { this.scroll = clamp((this.scroll || 0) + d, 0, this._maxScroll()); }

  // ------------------------------------------------------------- LAYOUT --
  _tabs() {
    const W = this.viewW;
    // Leave room on the right for the scrollbar so the last tab and the bar
    // never share a pixel.
    const w = Math.min(74, (W - 30) / CATS.length - 3);
    const total = CATS.length * w + (CATS.length - 1) * 3;
    const x0 = (W - 14 - total) / 2;
    return CATS.map((c, i) => ({ i, c, x: x0 + i * (w + 3), y: this.tabY, w, h: 24 }));
  }

  _shelfSlots() {
    const c = this.cell;
    const list = this._shelfList();
    return list.map((id, i) => ({
      id,
      x: 13 + (i % this.perRow) * c,
      y: this.gridY + Math.floor(i / this.perRow) * c - this.scroll,
      w: c - 6, h: c - 6,
    }));
  }

  _scrollbar() {
    const max = this._maxScroll();
    if (max <= 0) return null;
    const track = { x: this.viewW - 9, y: this.gridY, w: 6, h: this.shelfH - 40 };
    const frac = track.h / (track.h + max);
    const thumbH = Math.max(26, track.h * frac);
    const t = this.scroll / max;
    return { track, thumb: { x: track.x, y: track.y + t * (track.h - thumbH), w: track.w, h: thumbH } };
  }

  _hitShelf(x, y) {
    if (y < this.gridY - 4 || y > this.viewH) return null;
    for (const s of this._shelfSlots()) {
      if (s.y + s.h < this.gridY - 4 || s.y > this.viewH) continue;
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
    // Tabs.
    for (const t of this._tabs()) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        this.catIdx = t.i; this.scroll = 0; audioManager.play("select");
        this._say(`${t.c.name} — ${this._shelfList().length} shown`, "#ffd76a");
        return;
      }
    }
    // Scrollbar thumb.
    const sb = this._scrollbar();
    if (sb && x > sb.track.x - 10 && y >= sb.track.y && y <= sb.track.y + sb.track.h) {
      this.barDrag = { grabY: y, from: this.scroll };
      return;
    }
    const b = this._hitBench(x, y);
    if (b) {
      this.drag = { id: b.id, x, y, from: b };
      this.bench = this.bench.filter(v => v !== b);
      return;
    }
    const s = this._hitShelf(x, y);
    if (s) {
      // A press on the shelf may become a drag or a swipe-scroll; which one
      // is decided on the first move, so both gestures live on one finger.
      this.shelfPress = { id: s.id, x, y, sy: y, scroll0: this.scroll, moved: 0 };
      return;
    }
  }

  _move(x, y) {
    if (this.barDrag) {
      const sb = this._scrollbar();
      if (sb) {
        const max = this._maxScroll();
        const span = sb.track.h - sb.thumb.h;
        this.scroll = clamp(this.barDrag.from + ((y - this.barDrag.grabY) / (span || 1)) * max, 0, max);
      }
      return;
    }
    if (this.shelfPress) {
      const p = this.shelfPress;
      p.moved = Math.max(p.moved, Math.hypot(x - p.x, y - p.y));
      // A mostly-vertical drag inside the cabinet scrolls it; anything else
      // lifts the element out.
      if (!p.mode && p.moved > 8) {
        p.mode = Math.abs(y - p.y) > Math.abs(x - p.x) * 1.2 && y > this.gridY ? "scroll" : "lift";
        if (p.mode === "lift") { this.drag = { id: p.id, x, y, from: null }; this.shelfPress = null; return; }
      }
      if (p.mode === "scroll") this.scroll = clamp(p.scroll0 - (y - p.sy), 0, this._maxScroll());
      return;
    }
    if (this.drag) { this.drag.x = x; this.drag.y = y; }
  }

  _up(x, y) {
    if (this.barDrag) { this.barDrag = null; return; }
    if (this.shelfPress) {
      const p = this.shelfPress;
      this.shelfPress = null;
      // A tap (no real movement) drops a copy onto the table. On a phone this
      // is the whole difference between playable and not.
      if (p.moved < 8) {
        const tx = this.viewW / 2 + (Math.random() - 0.5) * this.viewW * 0.32;
        const ty = this.shelfY * (0.34 + Math.random() * 0.3);
        const onto = this._hitBench(tx, ty);
        if (onto) this._combine(p.id, onto, tx, ty);
        else this.bench.push({ id: p.id, x: tx, y: ty, pop: 0.3 });
        audioManager.play("place");
      }
      return;
    }
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (y > this.shelfY) return;             // dropped back into the cabinet
    const onto = this._hitBench(x, y);
    if (onto) { this._combine(d.id, onto, x, y); return; }
    this.bench.push({ id: d.id, x, y, pop: 0.3 });
  }

  _combine(idA, target, x, y) {
    const idB = target.id;
    const out = LOOKUP.get(`${idA}|${idB}`);
    if (!out) {
      this.bench.push({ id: idA, x: x - 36, y, pop: 0.2, shake: 0.35 });
      target.x = x + 36;
      target.shake = 0.35;
      audioManager.play("error");
      this._say(`${label(idA)} + ${label(idB)} — nothing`, "#8b90ac");
      return;
    }
    this.bench = this.bench.filter(v => v !== target);
    this.bench.push({ id: out, x, y, pop: 0.6 });
    this.pops.push({ x, y, t: 0, color: ringColor(out) });
    for (let i = 0; i < 16; i++) {
      this.motes.push({
        x, y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260,
        t: 0, life: 0.5 + Math.random() * 0.5, c: i % 2 ? ringColor(out) : inkColor(out),
      });
    }

    const store = this._store();
    const isNew = !store.found[out];
    if (isNew) {
      store.found[out] = true;
      this._save();
      this.newest = out;
      this.newestT = 6;
      this.discoveredThisRun++;
      this.addScore(120 + tierOf(out) * 40);
      audioManager.play("powerup");
      this._say(`Discovered ${label(out)}`, ringColor(out));
      // Jump the cabinet to the new arrival so it is never hidden below.
      this._revealNewest();
      if (Object.keys(store.found).length >= ALL.length) this._complete();
    } else {
      audioManager.play("select");
      this._say(`${label(out)}`, ringColor(out));
    }
    this._updateHud();
  }

  /** Scrolls (and if needed re-filters) the cabinet so `newest` is visible. */
  _revealNewest() {
    if (!this.newest) return;
    if (!CATS[this.catIdx].match(this.newest)) this.catIdx = 0;
    const i = this._shelfList().indexOf(this.newest);
    if (i < 0) return;
    const row = Math.floor(i / this.perRow);
    const visible = this.shelfH - 40;
    const top = row * this.cell, bottom = top + this.cell;
    if (top < this.scroll) this.scroll = top;
    else if (bottom > this.scroll + visible) this.scroll = bottom - visible;
    this._clampScroll();
  }

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

  /** The codex: every element, drawn, with what makes it once you know. */
  openCodex() {
    const store = this._store();
    const grid = el("div", { class: "fish-grid" });
    for (const id of ALL) {
      const found = store.found[id];
      const made = RECIPES.find(r => r[0] === id);
      const card = el("div", { class: `fish-card${found ? " caught" : ""}` }, [
        el("span", { class: "prev" }),
        el("span", { class: "nm" }, found ? label(id) : "?????"),
        el("span", { class: "st" }, found
          ? (made ? `${label(made[1])} + ${label(made[2])}` : "A starting element")
          : "Undiscovered"),
      ]);
      const c = el("canvas", { width: 128, height: 96 });
      c.style.cssText = "width:64px;height:48px";
      const cx = c.getContext("2d");
      cx.scale(2, 2);
      cx.translate(32, 24);
      cx.globalAlpha = found ? 1 : 0.16;
      drawElement(cx, id, 0);
      card.querySelector(".prev").appendChild(c);
      grid.appendChild(card);
    }
    openModal({
      title: `Codex — ${Object.keys(store.found).length}/${ALL.length}`,
      bodyNode: el("div", { class: "fish-log" }, [
        el("p", { class: "zone-intro" }, "Everything you have found, with the pair that makes it. The rest stay silhouettes until you get there."),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Back to the table"),
    });
  }

  _say(text, color) { this.msg = text; this.msgColor = color; this.msgT = 2.6; }

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
    if (this.newestT > 0) this.newestT -= dt;
    for (const b of this.bench) {
      if (b.pop > 0) b.pop -= dt;
      if (b.shake > 0) b.shake -= dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].t += dt;
      if (this.pops[i].t > 0.8) this.pops.splice(i, 1);
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt; m.vy += 180 * dt; m.vx *= 0.96;
      if (m.t >= m.life) this.motes.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawRoom(ctx, W, H);
    this._drawCircle(ctx, W);
    for (const p of this.pops) this._drawPop(ctx, p);
    for (const b of this.bench) this._drawToken(ctx, b.id, b.x, b.y, 30 + Math.max(0, b.pop) * 20, b.shake);
    this._drawMotes(ctx);
    this._drawCabinet(ctx, W, H);
    if (this.drag) this._drawToken(ctx, this.drag.id, this.drag.x, this.drag.y, 34, 0, true);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  /** The room: a lamplit workbench with shelves and glassware behind it. */
  _drawRoom(ctx, W, H) {
    const top = this.shelfY;
    const g = ctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, "#241a16"); g.addColorStop(0.55, "#1a1210"); g.addColorStop(1, "#120c0b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, top);

    // Lamp glow from the top-left, which is where every highlight points.
    const lamp = ctx.createRadialGradient(W * 0.18, -20, 10, W * 0.18, -20, H * 0.85);
    lamp.addColorStop(0, "rgba(255,196,110,0.30)");
    lamp.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, top);

    // Back shelf with jars.
    const sy = top * 0.2;
    ctx.fillStyle = "rgba(60,42,32,0.85)";
    ctx.fillRect(W * 0.52, sy, W * 0.46, 7);
    const jars = [["#7cf0d0", 12], ["#ff9f43", 15], ["#a86bff", 10], ["#5aa8e8", 13], ["#ffd76a", 11]];
    jars.forEach(([col, h], i) => {
      const x = W * 0.56 + i * (W * 0.083);
      ctx.fillStyle = "rgba(210,235,245,0.14)";
      roundRect(ctx, x - 7, sy - h, 14, h, 3); ctx.fill();
      ctx.fillStyle = col + "55";
      roundRect(ctx, x - 6, sy - h * 0.55, 12, h * 0.55, 2); ctx.fill();
      ctx.fillStyle = "rgba(90,64,48,0.9)";
      roundRect(ctx, x - 8, sy - h - 3, 16, 3.4, 1.6); ctx.fill();
    });

    // A hanging lantern on the left, gently swinging.
    const lx = W * 0.14, ly = top * 0.16 + Math.sin(this.elapsed * 0.8) * 3;
    ctx.strokeStyle = "rgba(120,90,60,0.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly - 10); ctx.stroke();
    ctx.fillStyle = "rgba(70,50,34,0.95)";
    roundRect(ctx, lx - 9, ly - 10, 18, 20, 4); ctx.fill();
    const flick = 0.6 + Math.sin(this.elapsed * 9) * 0.18 + Math.sin(this.elapsed * 21) * 0.08;
    ctx.fillStyle = `rgba(255,196,110,${0.85 * flick})`;
    roundRect(ctx, lx - 6, ly - 7, 12, 14, 3); ctx.fill();
    const halo = ctx.createRadialGradient(lx, ly, 2, lx, ly, 90);
    halo.addColorStop(0, `rgba(255,190,110,${0.22 * flick})`);
    halo.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(lx, ly, 90, 0, 7); ctx.fill();

    // The bench top: planks with a grain, catching the lamp.
    const benchTop = top * 0.30;
    const bg = ctx.createLinearGradient(0, benchTop, 0, top);
    bg.addColorStop(0, "#5c3d28"); bg.addColorStop(1, "#3a2618");
    ctx.fillStyle = bg;
    ctx.fillRect(0, benchTop, W, top - benchTop);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    for (let y = benchTop + 26; y < top; y += 30) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 22) ctx.lineTo(x, y + Math.sin(x * 0.02 + y) * 1.6);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,196,110,0.05)";
    ctx.fillRect(0, benchTop, W, 4);
    // Front edge.
    ctx.fillStyle = "#2a1a12";
    ctx.fillRect(0, top - 5, W, 5);
  }

  /** The chalk working circle, and the prompt when the table is empty. */
  _drawCircle(ctx, W) {
    const cx = W / 2, cy = this.shelfY * 0.62;
    const r = Math.min(W, this.shelfY) * 0.3;
    ctx.save();
    ctx.strokeStyle = "rgba(255,240,210,0.11)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.74, 0, 7); ctx.stroke();
    // A slowly turning inner sigil.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.elapsed * 0.07);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 / 5) * Math.PI * 2;
      const x = Math.cos(a) * r * 0.74, y = Math.sin(a) * r * 0.74;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,240,210,0.09)";
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    if (!this.bench.length) {
      ctx.fillStyle = "rgba(255,240,210,0.22)";
      ctx.font = "700 13px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.useTouch ? "tap an element below to place it here"
                                 : "drag elements from the cabinet onto this circle", cx, cy + 4);
    }
    ctx.restore();
  }

  /** The cabinet: tabs, a scrolling grid of medallions, and a scrollbar. */
  _drawCabinet(ctx, W, H) {
    const top = this.shelfY;
    ctx.save();
    // Panel.
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, "#1b1420"); g.addColorStop(1, "#100b14");
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, H - top);
    ctx.strokeStyle = "rgba(255,215,150,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, top + 1); ctx.lineTo(W, top + 1); ctx.stroke();

    // Tabs.
    for (const t of this._tabs()) {
      const on = this.catIdx === t.i;
      ctx.fillStyle = on ? "rgba(255,215,106,0.9)" : "rgba(255,255,255,0.06)";
      roundRect(ctx, t.x, t.y, t.w, t.h, 7); ctx.fill();
      ctx.fillStyle = on ? "#2a1f04" : "rgba(255,255,255,0.55)";
      ctx.font = "800 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.c.name.toUpperCase(), t.x + t.w / 2, t.y + 16);
    }

    // Grid, clipped to the cabinet so scrolled rows cut off cleanly.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.gridY - 4, W, H - this.gridY + 4);
    ctx.clip();
    const list = this._shelfSlots();
    for (const s of list) {
      if (s.y + s.h < this.gridY - 6 || s.y > H) continue;
      const isNew = s.id === this.newest && this.newestT > 0;
      this._drawToken(ctx, s.id, s.x + s.w / 2, s.y + s.h / 2 - 5, s.w * 0.40, 0, false, isNew);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "700 8px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      const nm = label(s.id);
      ctx.fillText(nm.length > 12 ? nm.slice(0, 11) + "…" : nm, s.x + s.w / 2, s.y + s.h - 1);
    }
    if (!list.length) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "700 12px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Nothing discovered in this family yet", W / 2, this.gridY + 34);
    }
    ctx.restore();

    // Scrollbar, plus a fade at the top and bottom edges so it is obvious
    // there is more above or below.
    const sb = this._scrollbar();
    if (sb) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, sb.track.x, sb.track.y, sb.track.w, sb.track.h, 3); ctx.fill();
      ctx.fillStyle = this.barDrag ? "#ffd76a" : "rgba(255,215,106,0.6)";
      roundRect(ctx, sb.thumb.x, sb.thumb.y, sb.thumb.w, sb.thumb.h, 3); ctx.fill();

      if (this.scroll > 2) {
        const f = ctx.createLinearGradient(0, this.gridY, 0, this.gridY + 18);
        f.addColorStop(0, "rgba(16,11,20,0.95)"); f.addColorStop(1, "rgba(16,11,20,0)");
        ctx.fillStyle = f; ctx.fillRect(0, this.gridY - 2, W - 12, 20);
      }
      if (this.scroll < this._maxScroll() - 2) {
        const f = ctx.createLinearGradient(0, H, 0, H - 18);
        f.addColorStop(0, "rgba(16,11,20,0.95)"); f.addColorStop(1, "rgba(16,11,20,0)");
        ctx.fillStyle = f; ctx.fillRect(0, H - 18, W - 12, 18);
      }
    }
    ctx.restore();
  }

  /**
   * One element as a medallion: a metal rim, a tinted well, the element's
   * own drawing, and a glass highlight over the top.
   */
  _drawToken(ctx, id, x, y, r, shakeT = 0, lifted = false, isNew = false) {
    const rim = ringColor(id);
    const sx = shakeT > 0 ? Math.sin(shakeT * 60) * shakeT * 16 : 0;
    ctx.save();
    ctx.translate(x + sx, y);

    if (lifted) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 18; ctx.shadowOffsetY = 7;
    }
    if (isNew) {
      const p = 0.5 + Math.sin(this.elapsed * 5) * 0.5;
      ctx.strokeStyle = `rgba(255,215,106,${0.35 + p * 0.5})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, r + 5 + p * 2, 0, 7); ctx.stroke();
    }

    // Well.
    const well = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
    well.addColorStop(0, shade(rim, 0.16));
    well.addColorStop(0.72, shade(rim, -0.34));
    well.addColorStop(1, shade(rim, -0.52));
    ctx.fillStyle = well;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;

    // Picture, scaled from the art module's 32px box.
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.94, 0, 7); ctx.clip();
    ctx.scale(r / 17, r / 17);
    drawElement(ctx, id, this.elapsed);
    ctx.restore();

    // Rim: a bright arc top-left, dark bottom-right, then a glass sheen.
    ctx.lineWidth = Math.max(1.6, r * 0.1);
    ctx.strokeStyle = shade(rim, 0.42);
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, Math.PI * 0.9, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = shade(rim, -0.4);
    ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, Math.PI * 1.95, Math.PI * 0.9); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.46, r * 0.5, r * 0.24, -0.5, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  _drawPop(ctx, p) {
    const k = p.t / 0.8;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3.4 * (1 - k) + 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 12 + k * 62, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 + k * 34, 0, 7); ctx.stroke();
    ctx.restore();
  }

  _drawMotes(ctx) {
    for (const m of this.motes) {
      ctx.globalAlpha = Math.max(0, 1 - m.t / m.life);
      ctx.fillStyle = m.c;
      ctx.beginPath(); ctx.arc(m.x, m.y, 2.6 * (1 - m.t / m.life) + 0.6, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.textAlign = "center";
    ctx.font = "800 14px 'Sora', system-ui, sans-serif";
    const w = Math.max(180, ctx.measureText(this.msg).width + 40);
    ctx.fillStyle = "rgba(10,7,14,0.78)";
    roundRect(ctx, W / 2 - w / 2, 12, w, 30, 15); ctx.fill();
    ctx.strokeStyle = hexA(this.msgColor || "#ffffff", 0.5);
    ctx.lineWidth = 1.4;
    roundRect(ctx, W / 2 - w / 2, 12, w, 30, 15); ctx.stroke();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.fillText(this.msg, W / 2, 32);
    ctx.restore();
  }
}

/** How deep in the tree something is — used only to score discoveries. */
function tierOf(id) {
  const i = RECIPES.findIndex(x => x[0] === id);
  return i < 0 ? 0 : Math.floor(i / 16);
}

function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + 255 * amt), 0, 255);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}

function hexA(hex, a) {
  if (!hex.startsWith("#")) return hex;
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
