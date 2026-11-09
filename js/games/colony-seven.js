// ==========================================================================
// Colony Seven — keep a settlement alive through the winters.
//
// Pick a region — a green valley, a sun-baked oasis, a frozen tundra, a
// volcanic isle — each with its own ground, its own winters and its own
// price for the Great Hall. The map starts mostly under fog: every building
// pushes the frontier back a little, a watchtower a lot, and ruins out in
// the fog hold supplies or lost settlers for whoever reaches them first.
//
// Buildings claim the ground they stand on, settlers work whichever job has
// the most open slots, and every few days a winter night burns food twice
// as fast and stops anything without heat. The failure is always the same
// shape and never the same cause: one building too many, the food dips
// under the population, and the settlers you needed have already gone.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, randInt, seededRng } from "../core/utils.js";

const COLS = 15, ROWS = 11;
const DAY = 9;            // seconds per day
const BAR_H = 74;         // building bar at the bottom

// --- Terrain --------------------------------------------------------------
const TILES = {
  grass:   { name: "Grassland", color: "#5c8a3a", edge: "#7aa84f" },
  forest:  { name: "Forest",    color: "#2f5c2a", edge: "#437a38" },
  rock:    { name: "Rocky",     color: "#6b6f7d", edge: "#878c9c" },
  ore:     { name: "Ore Seam",  color: "#7a5c3a", edge: "#a8804f" },
  water:   { name: "Water",     color: "#2f6b8a", edge: "#4a92b4" },
  ash:     { name: "Ashland",   color: "#4a4450", edge: "#615a68" },
  sand:    { name: "Sand",      color: "#c9a865", edge: "#e0c483" },
  marsh:   { name: "Marsh",     color: "#4a6a4a", edge: "#5f8460" },
  snow:    { name: "Snowfield", color: "#c8d6e4", edge: "#eef4fa" },
  crystal: { name: "Crystal",   color: "#4a6a8a", edge: "#6ac8e8" },
  vent:    { name: "Hot Vent",  color: "#5a3a34", edge: "#8a4a3a" },
};

// --- Buildings ------------------------------------------------------------
// `cost` is the build price, `jobs` how many settlers it employs, `produce`
// what one worked slot yields per day, `use` what it consumes per worked
// slot, `on` the terrain it needs (null = any dry land).
const BUILDINGS = [
  // Homes
  { id: "hut",     cat: "homes", name: "Hut",         cost: { wood: 12 },                        jobs: 0, pop: 3, heat: 1, produce: {}, on: null, color: "#c98f4a", text: "Houses three settlers and keeps them warm." },
  { id: "stonehouse", cat: "homes", name: "Stone House", cost: { wood: 10, stone: 26 },          jobs: 0, pop: 5, heat: 2, produce: {}, on: null, color: "#a8acb8", text: "Five settlers behind thick walls. Warms its neighbours too." },
  { id: "hall",    cat: "homes", name: "Great Hall",  cost: { wood: 60, stone: 50, iron: 30 },   jobs: 2, pop: 6, heat: 3, produce: {}, on: null, color: "#ffd76a", text: "Six more settlers, heat, and the colony's goal." },
  // Food
  { id: "farm",    cat: "food", name: "Farm",         cost: { wood: 16 },                        jobs: 3, pop: 0, heat: 0, produce: { food: 2.4 }, on: "grass", color: "#8fbf5c", text: "Food from grassland. The whole colony runs on this." },
  { id: "dock",    cat: "food", name: "Fishery",      cost: { wood: 22 },                        jobs: 2, pop: 0, heat: 0, produce: { food: 3.1 }, on: "water", color: "#4fa8d8", text: "More food per worker than a farm, but water is scarce." },
  { id: "hunter",  cat: "food", name: "Hunter Lodge", cost: { wood: 14 },                        jobs: 2, pop: 0, heat: 0, produce: { food: 1.7 }, on: "forest", color: "#a07a4a", text: "Game from the woods. Less than a farm, but it grows anywhere trees do." },
  { id: "paddy",   cat: "food", name: "Rice Paddy",   cost: { wood: 18, stone: 6 },              jobs: 3, pop: 0, heat: 0, produce: { food: 2.9 }, on: "marsh", color: "#9ad07a", text: "Marshland flooded into terraces — the best food in wet country." },
  { id: "bakery",  cat: "food", name: "Bakery",       cost: { wood: 24, stone: 16 },             jobs: 2, pop: 0, heat: 1, produce: { food: 3.0 }, use: { wood: 0.6 }, on: null, color: "#e0a060", text: "Bread from any dry ground, but the ovens burn wood." },
  { id: "greenhouse", cat: "food", name: "Greenhouse", cost: { wood: 20, stone: 20, iron: 6 },   jobs: 2, pop: 0, heat: 0, produce: { food: 2.2 }, winterProof: true, on: null, color: "#7af0c0", text: "Glass and warm soil: keeps growing through winter, even unheated." },
  // Resources
  { id: "camp",    cat: "res", name: "Lumber Camp",   cost: { wood: 10 },                        jobs: 3, pop: 0, heat: 0, produce: { wood: 2.2 }, on: "forest", color: "#6f9c5c", text: "Wood, which everything else is built from." },
  { id: "sawmill", cat: "res", name: "Sawmill",       cost: { wood: 30, stone: 16, iron: 6 },    jobs: 3, pop: 0, heat: 0, produce: { wood: 3.4 }, on: "forest", color: "#b0884a", text: "A water wheel and a blade: half again the wood of a camp." },
  { id: "quarry",  cat: "res", name: "Quarry",        cost: { wood: 24 },                        jobs: 3, pop: 0, heat: 0, produce: { stone: 1.8 }, on: "rock", color: "#9aa0b4", text: "Stone for the buildings that survive winter." },
  { id: "mine",    cat: "res", name: "Mine",          cost: { wood: 20, stone: 18 },             jobs: 3, pop: 0, heat: 0, produce: { iron: 1.3 }, on: "ore", color: "#c9a06a", text: "Iron, which only the late buildings need." },
  { id: "crystalmine", cat: "res", name: "Crystal Mine", cost: { wood: 24, stone: 20 },          jobs: 2, pop: 0, heat: 0, produce: { crystal: 1.0 }, on: "crystal", color: "#6ac8e8", text: "Cuts crystal from the glowing seams — the hardest regions need it." },
  { id: "smith",   cat: "res", name: "Smithy",        cost: { wood: 28, stone: 24, iron: 12 },   jobs: 2, pop: 0, heat: 1, produce: { tools: 1.1 }, on: null, color: "#8b90ac", text: "Tools. Every worked slot produces more while tools last." },
  // Services
  { id: "hearth",  cat: "serv", name: "Hearth",       cost: { wood: 20, stone: 12 },             jobs: 1, pop: 0, heat: 4, radius: 2, produce: {}, on: null, color: "#ff9f43", text: "Heats every building within two tiles through a winter night." },
  { id: "geo",     cat: "serv", name: "Geo Plant",    cost: { stone: 20, iron: 8 },              jobs: 0, pop: 0, heat: 5, radius: 3, produce: {}, on: "vent", color: "#ff6a4a", text: "Taps a hot vent: three tiles of heat, no workers needed." },
  { id: "store",   cat: "serv", name: "Storehouse",   cost: { wood: 26, stone: 20 },             jobs: 1, pop: 0, heat: 0, produce: {}, capacity: 120, on: null, color: "#a88a5c", text: "Raises what the colony can hold by 120 of everything." },
  { id: "tower",   cat: "serv", name: "Watchtower",   cost: { wood: 18, stone: 8 },              jobs: 0, pop: 0, heat: 0, reveal: 4, produce: {}, on: null, color: "#d8c8a0", text: "Pushes the fog back four tiles. Find new land and ruins." },
  { id: "market",  cat: "serv", name: "Market",       cost: { wood: 30, stone: 14 },             jobs: 2, pop: 0, heat: 0, produce: { gold: 1.0 }, use: { food: 0.4 }, on: null, color: "#e8c040", text: "Trades spare food for gold. Some regions want gold for the Hall." },
  { id: "clinic",  cat: "serv", name: "Clinic",       cost: { wood: 30, stone: 20, gold: 10 },   jobs: 1, pop: 0, heat: 1, produce: {}, on: null, color: "#f0f0f0", text: "Settlers hold out longer when food runs out, and arrive sooner." },
];
const byId = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));
const CATS = [
  { id: "homes", name: "Homes" }, { id: "food", name: "Food" },
  { id: "res", name: "Materials" }, { id: "serv", name: "Services" },
];

const RES = ["food", "wood", "stone", "iron", "tools", "gold", "crystal"];
const RES_COLOR = { food: "#8fbf5c", wood: "#c98f4a", stone: "#9aa0b4", iron: "#c9a06a", tools: "#8b90ac", gold: "#ffd76a", crystal: "#6ac8e8" };

// --- Regions ----------------------------------------------------------------
// Each picks terrain from two noise fields: `a` (lay of the land) and `m`
// (moisture), both roughly -2.5..2.5, plus a random roll.
const REGIONS = [
  {
    id: "valley", name: "Green Valley", need: 0, winter: 8, burn: 2, mult: 1, extra: {},
    sky: ["#2a3a2a", "#131a16"], sw: ["#8fbf5c", "#5c8a3a", "#2f6b8a"],
    blurb: "Gentle meadows, a river and plenty of wood. The place to learn.",
    start: { food: 60, wood: 60, stone: 20 },
    pick(a, m, r) { if (r < 0.07) return "ore"; if (a > 1.25) return "forest"; if (a < -1.1) return "rock"; return "grass"; },
    river: 0.6,
  },
  {
    id: "highlands", name: "Pine Highlands", need: 0, winter: 7, burn: 2, mult: 1.1, extra: {},
    sky: ["#24342e", "#10181a"], sw: ["#2f5c2a", "#6b6f7d", "#c8d6e4"],
    blurb: "Dense pine and rich ore seams, but little open grass and harder winters.",
    start: { food: 70, wood: 50, stone: 30 },
    pick(a, m, r) { if (r < 0.12) return "ore"; if (m > 1.7) return "snow"; if (a > 0.6) return "forest"; if (a < -0.5) return "rock"; return "grass"; },
    river: 0.45,
  },
  {
    id: "oasis", name: "Sun Oasis", need: 0, winter: 10, burn: 1.5, mult: 1.1, extra: { gold: 20 },
    sky: ["#4a3a22", "#1e160c"], sw: ["#e0c483", "#c9a865", "#4fa8d8"],
    blurb: "Endless sand around a few green pools. Mild nights, scarce food — trade for gold.",
    start: { food: 80, wood: 55, stone: 20 },
    pick(a, m, r) { if (m > 1.5) return "water"; if (m > 1.15) return "grass"; if (a > 1.55) return "forest"; if (a < -1.0) return "rock"; if (r < 0.06) return "ore"; return "sand"; },
    river: 0,
  },
  {
    id: "marsh", name: "Misty Marsh", need: 1, winter: 8, burn: 2, mult: 1.15, extra: { gold: 15 },
    sky: ["#22302c", "#0e1614"], sw: ["#5f8460", "#4a6a4a", "#2f6b8a"],
    blurb: "Reeds and still water. Farms struggle — flood the marsh into rice paddies.",
    start: { food: 70, wood: 60, stone: 20 },
    pick(a, m, r) { if (m > 1.5) return "water"; if (a > 1.2) return "forest"; if (a < -1.4) return "rock"; if (r < 0.05) return "ore"; return m > -0.3 ? "marsh" : "grass"; },
    river: 0.5,
  },
  {
    id: "tundra", name: "Frozen Tundra", need: 1, winter: 5, burn: 2.2, mult: 1.2, extra: {},
    sky: ["#1e2a3a", "#0b111c"], sw: ["#eef4fa", "#c8d6e4", "#8a4a3a"],
    blurb: "Snow to the horizon and a winter every fifth night. Hot vents and greenhouses are life.",
    start: { food: 90, wood: 70, stone: 30 },
    pick(a, m, r) { if (r < 0.045) return "vent"; if (r < 0.12) return "ore"; if (a > 1.1) return "forest"; if (a < -0.9) return "rock"; if (m < -1.1) return "grass"; return "snow"; },
    river: 0.4,
  },
  {
    id: "volcano", name: "Ember Isle", need: 2, winter: 9, burn: 1.8, mult: 1.25, extra: { crystal: 15 },
    sky: ["#3a1e1a", "#140a0a"], sw: ["#ff6a4a", "#4a4450", "#6ac8e8"],
    blurb: "Black ash, steaming vents and crystal in the lava rock. The sea rings the island.",
    start: { food: 70, wood: 60, stone: 30 },
    pick(a, m, r) { if (r < 0.06) return "vent"; if (r < 0.1) return "crystal"; if (r < 0.2) return "ore"; if (m > 1.3) return "forest"; if (m > 0.6) return "grass"; if (a < -0.6) return "rock"; return "ash"; },
    river: 0, coast: true,
  },
  {
    id: "peaks", name: "Crystal Peaks", need: 3, winter: 6, burn: 2.2, mult: 1.35, extra: { crystal: 25, gold: 20 },
    sky: ["#1e2240", "#0a0c1c"], sw: ["#6ac8e8", "#878c9c", "#eef4fa"],
    blurb: "The final frontier: thin soil, deep snow and seams of glowing crystal.",
    start: { food: 90, wood: 70, stone: 40 },
    pick(a, m, r) { if (r < 0.08) return "crystal"; if (r < 0.17) return "ore"; if (r < 0.2) return "vent"; if (m > 1.1) return "grass"; if (m > 0.5 && a < 0.6) return "forest"; if (a > 0.6) return "snow"; return "rock"; },
    river: 0.4,
  },
];

export class ColonySevenGame extends GameBase {
  getDifficulties() { return ["Settlement"]; }
  getInstructions() {
    return [
      "Choose a region, then pick a building from the bar (tabs: Homes, Food, Materials, Services) and click a hex. Buildings want particular ground — a farm needs grass, a paddy needs marsh.",
      "Most of the map starts under fog. Every building reveals the land around it; a Watchtower reveals far more. Ruins in the fog hold supplies — and sometimes lost settlers.",
      "Settlers fill jobs on their own. More homes means more settlers, and more mouths.",
      "Winter nights burn food faster and stop any building outside a heat source's reach — hearths, geo plants on hot vents, houses. Greenhouses keep growing anyway.",
      "The goal is the Great Hall. Each region prices it differently — some want gold from a market or crystal from the seams. Raising halls unlocks harder regions.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tab, tap a building, then tap a hex. ✖ demolishes."; }
  getKeyboardHint() { return "Q/E switch tab · 1-7 pick a building · click a hex to place · X demolishes."; }
  getScene() { return "meadow"; }

  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.colony) custom.colony = { bestDay: 0, bestPop: 0, halls: 0 };
    const c = custom.colony;
    if (!c.regions) c.regions = {};
    return c;
  }
  _save() { saveManager.saveNow(); }
  _open(reg) { return (this._store().halls || 0) >= reg.need; }

  getPlayLabel() { return "Found a colony"; }
  getStartExtras() {
    const c = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Longest: ${c.bestDay || 0} days`),
      el("span", {}, `Largest: ${c.bestPop || 0} settlers`),
      el("span", {}, `${c.halls || 0} halls raised`),
      el("span", {}, `Regions: ${REGIONS.filter(r => this._open(r)).length}/${REGIONS.length}`),
    ]);
  }

  /** Region picker before every new colony. */
  onPlayPressed() {
    const c = this._store();
    const grid = el("div", { class: "zone-grid" });
    REGIONS.forEach((reg, i) => {
      const open = this._open(reg);
      const rec = c.regions[reg.id] || {};
      grid.appendChild(el("button", {
        class: `zone-card${open ? "" : " locked"}${i === (this.regionIdx ?? 0) ? " current" : ""}`,
        style: `--z1:${reg.sw[0]};--z2:${reg.sw[1]};--z3:${reg.sw[2]}`,
        disabled: !open || undefined,
        onClick: () => { if (!open) return; this.regionIdx = i; audioManager.play("select"); closeModal(); this.start(); },
      }, [
        el("span", { class: "swatch" }),
        el("span", { class: "n" }, open ? `Region ${i + 1} · winter every ${reg.winter} days` : `🔒 Raise ${reg.need} Great Hall${reg.need > 1 ? "s" : ""}`),
        el("span", { class: "nm" }, `${reg.name}${rec.halls ? " 🏛" : ""}`),
        el("span", { class: "st" }, open ? `${reg.blurb}${rec.best ? ` Best: ${rec.best} days.` : ""}` : reg.blurb),
      ]));
    });
    openModal({
      title: "Choose a region",
      bodyNode: el("div", { class: "zone-picker" }, [el("p", { class: "zone-intro" }, `Each region has its own land, winters and Great Hall price. Halls raised: ${c.halls || 0}.`), grid]),
      footerNode: el("div", { class: "modal-foot" }, [el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Cancel")]),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this.map ? this._hexAt(p.x, p.y) : -1; });
    for (let k = 1; k <= 7; k++) this.input.onKey(`Digit${k}`, () => { const list = this._tabList(); if (list[k - 1]) this._pick(BUILDINGS.indexOf(list[k - 1])); });
    this.input.onKey("KeyQ", () => this._tab(-1));
    this.input.onKey("KeyE", () => this._tab(1));
    this.input.onKey("KeyX", () => { this.demolish = !this.demolish; audioManager.play("select"); });
    this.regionIdx = 0;
    this.tab = 0;
  }

  onResize() { this._fit(); }

  onStart() {
    this.reg = REGIONS[this.regionIdx ?? 0];
    if (!this._open(this.reg)) { this.regionIdx = 0; this.reg = REGIONS[0]; }
    const R = this.reg;
    const rng = seededRng(`colony-${Date.now()}-${Math.random()}`);
    const s1 = rng() * 10, s2 = rng() * 10;
    this.map = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = Math.sin(x * 0.7 + y * 0.4 + s1) + Math.sin(x * 0.23 - y * 0.9) * 0.7 + rng() * 0.9 - 0.45;
        const m = Math.sin(x * 0.31 + y * 0.77 + s2) + Math.cos(x * 0.9 - y * 0.2 + s1) * 0.6 + rng() * 0.8 - 0.4;
        let t = R.pick(a, m, rng());
        if (R.river && Math.abs(y - (ROWS / 2 + Math.sin(x * 0.6 + s2) * 2)) < R.river && rng() < 0.8) t = "water";
        if (R.coast && (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) && rng() < 0.75) t = "water";
        this.map.push({ t, b: null, worked: 0, heated: false, seen: false, cache: null });
      }
    }
    // A guaranteed opening: grass and forest around the centre.
    const c0 = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);
    this.center = c0;
    this.map[c0].t = "grass";
    this._neighbours(c0).forEach((n, k) => { this.map[n].t = k % 2 ? "forest" : "grass"; });
    // Ruins out in the fog.
    const far = this.map.map((c, i) => i).filter(i => this._dist(i, c0) >= 4 && this.map[i].t !== "water");
    for (let k = 0; k < 7 && far.length; k++) {
      const i = far.splice(Math.floor(rng() * far.length), 1)[0];
      this.map[i].cache = this._rollCache(rng);
    }

    this.res = { food: 0, wood: 0, stone: 0, iron: 0, tools: 0, gold: 0, crystal: 0, ...R.start };
    this.hallCost = {};
    for (const [k, v] of Object.entries(byId.hall.cost)) this.hallCost[k] = Math.round(v * R.mult);
    Object.assign(this.hallCost, R.extra);
    this.cap = 150;
    this.pop = 4;
    this.day = 1;
    this.dayT = 0;
    this.winter = false;
    this.selected = BUILDINGS.indexOf(byId.camp);
    this.tab = CATS.findIndex(c => c.id === "res");
    this.demolish = false;
    this.hover = -1;
    this.elapsed = 0;
    this.floaters = [];
    this.starving = 0;
    this.peakPop = 4;
    this._reveal(c0, 3);
    this._say(`${R.name} — start with a lumber camp on forest, then a farm`, "#ffffff", 5);
    this.setScore(0);
    this._fit();
    this._recount();
  }

  _rollCache(rng) {
    const opts = [
      { label: "Abandoned lumber", give: { wood: 30 } },
      { label: "Cut stone", give: { stone: 25 } },
      { label: "Old forge", give: { iron: 12 } },
      { label: "Sealed granary", give: { food: 40 } },
      { label: "Buried coins", give: { gold: 12 } },
      { label: "Crystal geode", give: { crystal: 8 } },
      { label: "Lost settlers", settlers: 2 },
    ];
    return opts[Math.floor(rng() * opts.length)];
  }

  /**
   * The camera frames the explored land plus one ring of fog, so a young
   * colony fills the screen and the view widens as the frontier moves out.
   */
  _fit() {
    const W = this.viewW || 600, H = this.viewH || 600;
    let c0 = COLS, c1 = 0, r0 = ROWS, r1 = 0;
    (this.map || []).forEach((c, i) => {
      if (!c.seen) return;
      const x = i % COLS, y = Math.floor(i / COLS);
      c0 = Math.min(c0, x); c1 = Math.max(c1, x); r0 = Math.min(r0, y); r1 = Math.max(r1, y);
    });
    if (c0 > c1) { c0 = 0; c1 = COLS - 1; r0 = 0; r1 = ROWS - 1; }
    c0 = Math.max(0, c0 - 1); c1 = Math.min(COLS - 1, c1 + 1); r0 = Math.max(0, r0 - 1); r1 = Math.min(ROWS - 1, r1 + 1);
    const nC = c1 - c0 + 1, nR = r1 - r0 + 1;
    const top = 58, availH = H - top - BAR_H - 12;
    this.r = Math.max(6, Math.min(48, (W - 16) / ((nC + 0.5) * Math.sqrt(3)), availH / (nR * 1.5 + 0.5)));
    this.hw = this.r * Math.sqrt(3);
    this.ox = (W - (nC * this.hw + this.hw / 2)) / 2 + this.hw / 2 - c0 * this.hw;
    this.oy = top + this.r + (availH - (nR * 1.5 + 0.5) * this.r) / 2 - r0 * this.r * 1.5;
  }

  _hexPos(i) {
    const x = i % COLS, y = Math.floor(i / COLS);
    return { x: this.ox + x * this.hw + (y & 1 ? this.hw / 2 : 0), y: this.oy + y * this.r * 1.5 };
  }

  _hexAt(px, py) {
    let best = -1, bestD = this.r;
    for (let i = 0; i < this.map.length; i++) {
      const p = this._hexPos(i);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  _neighbours(i) {
    const x = i % COLS, y = Math.floor(i / COLS);
    const deltas = y & 1
      ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]
      : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
    const out = [];
    for (const [dx, dy] of deltas) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      out.push(ny * COLS + nx);
    }
    return out;
  }

  _within(i, radius) {
    const seen = new Set([i]);
    let frontier = [i];
    for (let r = 0; r < radius; r++) {
      const next = [];
      for (const c of frontier) for (const n of this._neighbours(c)) if (!seen.has(n)) { seen.add(n); next.push(n); }
      frontier = next;
    }
    return [...seen];
  }

  /** Hex distance via cube coordinates (odd-r offset layout). */
  _dist(a, b) {
    const cube = (i) => { const col = i % COLS, row = Math.floor(i / COLS); const x = col - (row - (row & 1)) / 2; return [x, row, -x - row]; };
    const [ax, ay, az] = cube(a), [bx, by, bz] = cube(b);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
  }

  /** Lifts the fog; ruins pay out the moment they come into view. */
  _reveal(i, radius) {
    for (const n of this._within(i, radius)) {
      const c = this.map[n];
      if (c.seen) continue;
      c.seen = true;
      if (c.cache) {
        const k = c.cache;
        c.cache = null; c.ruin = true;
        if (k.settlers) { this.pop += k.settlers; this._float(`+${k.settlers} settlers`, "#2ee6a6", n); }
        else for (const [r, v] of Object.entries(k.give)) { this.res[r] = Math.min(this.cap, this.res[r] + v); this._float(`+${v} ${r}`, RES_COLOR[r], n); }
        this._say(`Ruins found: ${k.label}!`, "#ffd76a");
        this.addScore(60);
        audioManager.play("coin");
      }
    }
    this._fit();
  }

  _cost(spec) { return spec.id === "hall" ? this.hallCost : spec.cost; }
  _afford(spec) { return Object.entries(this._cost(spec)).every(([k, n]) => this.res[k] >= n); }
  _tabList() { return BUILDINGS.filter(b => b.cat === CATS[this.tab].id); }
  _tab(d) { this.tab = (this.tab + d + CATS.length) % CATS.length; audioManager.play("select"); }

  // ------------------------------------------------------------- INPUT ---
  _pick(i) { this.selected = i; this.demolish = false; audioManager.play("select"); }

  _click(px, py) {
    if (this.state !== "playing") return;
    for (const b of this._bar()) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        if (b.kind === "tab") { this.tab = b.i; audioManager.play("select"); }
        else if (b.kind === "demolish") { this.demolish = !this.demolish; audioManager.play("select"); }
        else this._pick(b.i);
        return;
      }
    }
    const i = this._hexAt(px, py);
    if (i < 0) return;
    const cell = this.map[i];
    if (!cell.seen) { this._say("Unexplored — build nearby or raise a watchtower", "#ff9f43"); return; }

    if (this.demolish) {
      if (!cell.b) return;
      // Half the wood back, which makes a mistake survivable but not free.
      const spec = byId[cell.b];
      this.res.wood = Math.min(this.cap, this.res.wood + Math.floor((this._cost(spec).wood || 0) / 2));
      if (spec.capacity) this.cap -= spec.capacity;
      cell.b = null;
      audioManager.play("hit");
      this._recount();
      return;
    }

    const spec = BUILDINGS[this.selected];
    const bad = this._why(cell, spec);
    if (bad) { this._say(bad, "#ff5470"); return; }
    for (const [r, n] of Object.entries(this._cost(spec))) this.res[r] -= n;
    cell.b = spec.id;
    if (spec.capacity) this.cap += spec.capacity;
    audioManager.play("place");
    this._float(spec.name, spec.color, i);
    this._reveal(i, spec.reveal || 1);
    this._recount();
    if (spec.id === "hall") this._victory();
  }

  /** Why a building cannot go here, or null if it can. */
  _why(cell, spec) {
    if (!cell.seen) return "Unexplored";
    if (cell.b) return "Something is already there";
    if (spec.on && cell.t !== spec.on) return `${spec.name} needs ${TILES[spec.on].name.toLowerCase()}`;
    if (!spec.on && (cell.t === "water" || cell.t === "vent" || cell.t === "crystal")) return `Not on ${TILES[cell.t].name.toLowerCase()}`;
    for (const [r, n] of Object.entries(this._cost(spec))) if (this.res[r] < n) return `Not enough ${r}`;
    return null;
  }

  /** Recomputes housing, clinics and the heat map after any change. */
  _recount() {
    let cap = 0;
    this.clinics = 0;
    for (const c of this.map) if (c.b) { cap += byId[c.b].pop; if (c.b === "clinic") this.clinics++; }
    this.popCap = Math.max(4, cap);
    for (const c of this.map) c.heated = false;
    this.map.forEach((c, i) => {
      if (!c.b) return;
      const spec = byId[c.b];
      if (spec.heat > 0) for (const n of this._within(i, spec.radius || 2)) this.map[n].heated = true;
    });
    this._updateHud();
  }

  _record() {
    const store = this._store();
    if ((store.bestDay || 0) < this.day) store.bestDay = this.day;
    if ((store.bestPop || 0) < this.peakPop) store.bestPop = this.peakPop;
    const rec = store.regions[this.reg.id] || (store.regions[this.reg.id] = { best: 0, halls: 0 });
    if (rec.best < this.day) rec.best = this.day;
    return { store, rec };
  }

  _victory() {
    const { store, rec } = this._record();
    store.halls = (store.halls || 0) + 1;
    rec.halls += 1;
    const unlocked = REGIONS.filter(r => r.need === store.halls);
    this._save();
    this.addScore(3000 + Math.round(1000 * (this.reg.mult - 1) * 10));
    audioManager.play("win");
    this.endGame({
      result: "win", score: this.score,
      message: `The Great Hall of ${this.reg.name} stands on day ${this.day}, with ${this.pop} settlers to fill it.${unlocked.length ? ` New region unlocked: ${unlocked.map(r => r.name).join(", ")}!` : ""}`,
      extraStats: [
        { label: "Days", value: this.day },
        { label: "Settlers", value: this.pop },
        { label: "Buildings", value: this.map.filter(c => c.b).length },
        { label: "Explored", value: `${Math.round(100 * this.map.filter(c => c.seen).length / this.map.length)}%` },
      ],
    });
  }

  _collapse() {
    this._record();
    this._save();
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score,
      message: `The last settler left ${this.reg.name} on day ${this.day}.`,
      extraStats: [
        { label: "Days", value: this.day },
        { label: "Peak", value: `${this.peakPop} settlers` },
        { label: "Buildings", value: this.map.filter(c => c.b).length },
      ],
    });
  }

  _say(t, c, time = 2.4) { this.msg = t; this.msgColor = c; this.msgT = time; }
  _float(t, c, i) { this.floaters.push({ t, c, i, time: 0 }); }

  _updateHud() {
    this.setHud({
      Day: `${this.day}${this.winter ? " ❄" : ""}`,
      Settlers: `${this.pop}/${this.popCap ?? 4}`,
      Food: Math.floor(this.res.food),
      Wood: Math.floor(this.res.wood),
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].time += dt;
      if (this.floaters[i].time > 1.5) this.floaters.splice(i, 1);
    }

    this.dayT += dt;
    if (this.dayT >= DAY) { this.dayT = 0; this._newDay(); }

    // Production runs continuously so the numbers move rather than tick.
    this._assign();
    const rate = dt / DAY;
    const toolBoost = this.res.tools > 0 ? 1.3 : 1;
    for (const c of this.map) {
      if (!c.b || !c.worked) continue;
      const spec = byId[c.b];
      if (this.winter && !c.heated && !spec.winterProof) continue;
      if (spec.use) {
        const ok = Object.entries(spec.use).every(([r, n]) => this.res[r] >= n * c.worked * rate);
        if (!ok) continue;
        for (const [r, n] of Object.entries(spec.use)) this.res[r] -= n * c.worked * rate;
      }
      for (const [r, n] of Object.entries(spec.produce)) {
        this.res[r] = Math.min(this.cap, this.res[r] + n * c.worked * rate * (r === "tools" ? 1 : toolBoost));
      }
    }
    // Food burn: one per settler per day, more through a winter night.
    const burn = this.pop * (this.winter ? this.reg.burn : 1) * rate;
    this.res.food -= burn;
    if (this.res.tools > 0) this.res.tools = Math.max(0, this.res.tools - this.pop * 0.12 * rate);

    if (this.res.food <= 0) {
      this.res.food = 0;
      this.starving += rate;
      // Settlers leave one at a time rather than all at once, so a dip is
      // recoverable and a famine is not. Clinics buy time.
      if (this.starving > 0.5 * (1 + Math.min(2, this.clinics || 0) * 0.6)) {
        this.starving = 0;
        this.pop = Math.max(0, this.pop - 1);
        this._say("A settler has gone", "#ff5470");
        audioManager.play("error");
        if (this.pop <= 0) { this._collapse(); return; }
      }
    } else {
      this.starving = Math.max(0, this.starving - rate * 0.5);
    }
    this._updateHud();
  }

  /**
   * Settlers spread across open job slots, filling the emptiest building
   * first. Deliberately not optimal — the player's job is to build the right
   * things, not to micromanage who stands where.
   */
  _assign() {
    let left = this.pop;
    const slots = [];
    for (const c of this.map) {
      c.worked = 0;
      if (!c.b) continue;
      const spec = byId[c.b];
      if (spec.jobs > 0) slots.push({ c, spec });
    }
    const hungry = this.res.food < this.pop * 2;
    slots.sort((a, b) => {
      const aFood = a.spec.produce.food ? 1 : 0, bFood = b.spec.produce.food ? 1 : 0;
      if (hungry && aFood !== bFood) return bFood - aFood;
      return b.spec.jobs - a.spec.jobs;
    });
    let round = 0;
    while (left > 0 && round < 6) {
      let placed = false;
      for (const s of slots) {
        if (left <= 0) break;
        if (s.c.worked >= s.spec.jobs) continue;
        s.c.worked++; left--; placed = true;
      }
      if (!placed) break;
      round++;
    }
    this.idle = left;
  }

  _newDay() {
    this.day++;
    this.peakPop = Math.max(this.peakPop || 0, this.pop);
    this.winter = this.day % this.reg.winter === 0;
    if (this.winter) {
      audioManager.play("error");
      this._say("Winter night — only heated buildings work", "#c9e0ff");
    }
    // Growth: a fed colony under its housing cap gains a settler.
    const need = this.clinics ? 2 : 3;
    if (!this.winter && this.pop < (this.popCap ?? 4) && this.res.food > this.pop * need) {
      this.pop++;
      audioManager.play("levelup");
      this._say("A settler arrives", "#2ee6a6");
    }
    this.addScore(20 + this.pop * 5);
    this._recount();
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx) {
    const W = this.viewW, H = this.viewH;
    if (!this.map || !W) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    this._drawSky(ctx, W, H);
    this._drawHexes(ctx);
    ctx.fillStyle = "rgba(8,12,10,0.55)"; ctx.fillRect(0, 0, W, 54);
    this._drawBar(ctx, W, H);
    this._drawResources(ctx, W);
    this._drawFloaters(ctx);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.winter) { g.addColorStop(0, "#1a2438"); g.addColorStop(1, "#0d121f"); }
    else { g.addColorStop(0, this.reg.sky[0]); g.addColorStop(1, this.reg.sky[1]); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (this.winter || this.reg.id === "tundra" || this.reg.id === "peaks") {
      ctx.fillStyle = `rgba(220,235,255,${this.winter ? 0.35 : 0.15})`;
      for (let i = 0; i < 40; i++) {
        const x = ((i * 97 + this.elapsed * 22) % (W + 20)) - 10;
        const y = ((i * 53 + this.elapsed * 34) % (H + 20)) - 10;
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
      }
    } else if (this.reg.id === "volcano") {
      for (let i = 0; i < 24; i++) {
        const x = ((i * 131 + Math.sin(this.elapsed + i) * 20) % W);
        const y = H - ((i * 71 + this.elapsed * 30) % H);
        ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},60,0.4)`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  _hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 90);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  _drawHexes(ctx) {
    const r = this.r;
    const spec = BUILDINGS[this.selected];
    for (let i = 0; i < this.map.length; i++) {
      const c = this.map[i];
      const p = this._hexPos(i);
      if (!c.seen) {
        // Fog: a dim hex with a drifting haze, hinting at what may lie there.
        this._hexPath(ctx, p.x, p.y, r * 0.96);
        ctx.fillStyle = "rgba(20,24,30,0.92)";
        ctx.fill();
        ctx.fillStyle = `rgba(160,170,190,${0.06 + 0.04 * Math.sin(this.elapsed * 0.8 + i * 0.7)})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1; ctx.stroke();
        continue;
      }
      const T = TILES[c.t];
      this._hexPath(ctx, p.x, p.y, r * 0.96);
      const g = ctx.createLinearGradient(p.x, p.y - r, p.x, p.y + r);
      g.addColorStop(0, T.edge); g.addColorStop(1, T.color);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.save();
      this._hexPath(ctx, p.x, p.y, r * 0.96);
      ctx.clip();
      this._drawTerrain(ctx, c.t, p, r, i);
      if (c.ruin && !c.b) {
        ctx.fillStyle = "rgba(60,50,40,0.85)";
        ctx.fillRect(p.x - r * 0.35, p.y - r * 0.05, r * 0.16, r * 0.35);
        ctx.fillRect(p.x + r * 0.15, p.y - r * 0.25, r * 0.16, r * 0.55);
        ctx.fillRect(p.x - r * 0.4, p.y + r * 0.28, r * 0.8, r * 0.1);
      }
      ctx.restore();

      // Edge of the known world: a soft glow so the frontier reads.
      if (this._neighbours(i).some(n => !this.map[n].seen)) {
        this._hexPath(ctx, p.x, p.y, r * 0.96);
        ctx.strokeStyle = "rgba(255,215,106,0.12)"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (this.winter && !c.heated) {
        this._hexPath(ctx, p.x, p.y, r * 0.96);
        ctx.fillStyle = "rgba(150,190,255,0.28)";
        ctx.fill();
      }

      if (c.b) this._drawBuilding(ctx, p, r, c);

      if (i === this.hover) {
        const ok = !this._why(c, spec);
        this._hexPath(ctx, p.x, p.y, r * 0.96);
        ctx.strokeStyle = this.demolish ? "#ff5470" : ok ? "#2ee6a6" : "#ff9f43";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (!this.demolish && (spec.radius || spec.reveal) && ok) {
          for (const n of this._within(i, spec.radius || spec.reveal)) {
            const q = this._hexPos(n);
            this._hexPath(ctx, q.x, q.y, r * 0.9);
            ctx.fillStyle = spec.reveal ? "rgba(255,240,200,0.08)" : "rgba(255,159,67,0.12)";
            ctx.fill();
          }
        }
      }
    }
  }

  _drawTerrain(ctx, t, p, r, i) {
    const e = this.elapsed;
    if (t === "forest") {
      for (let k = 0; k < 3; k++) {
        const tx = p.x + (k - 1) * r * 0.42, ty = p.y + (k % 2 ? r * 0.16 : -r * 0.1);
        ctx.fillStyle = this.reg.id === "oasis" ? "#3a6a2a" : "#1f4a1c";
        ctx.beginPath();
        ctx.moveTo(tx, ty - r * 0.42); ctx.lineTo(tx + r * 0.22, ty + r * 0.18); ctx.lineTo(tx - r * 0.22, ty + r * 0.18);
        ctx.closePath(); ctx.fill();
        if (this.reg.id === "tundra" || this.reg.id === "peaks") { ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.moveTo(tx, ty - r * 0.42); ctx.lineTo(tx + r * 0.09, ty - r * 0.2); ctx.lineTo(tx - r * 0.09, ty - r * 0.2); ctx.fill(); }
      }
    } else if (t === "rock") {
      ctx.fillStyle = "#565a66";
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(p.x + (k - 1) * r * 0.4, p.y + (k % 2 ? r * 0.2 : -r * 0.14), r * 0.2, 0, 7); ctx.fill(); }
    } else if (t === "ore") {
      ctx.fillStyle = "#ffd76a";
      for (let k = 0; k < 4; k++) { const a = (k / 4) * 6.28 + 0.4; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * r * 0.32, p.y + Math.sin(a) * r * 0.32, r * 0.09, 0, 7); ctx.fill(); }
    } else if (t === "water") {
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.6;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(p.x - r * 0.5, p.y + k * r * 0.3 + Math.sin(e * 2 + k + i) * 2);
        ctx.quadraticCurveTo(p.x, p.y + k * r * 0.3 - 3, p.x + r * 0.5, p.y + k * r * 0.3);
        ctx.stroke();
      }
    } else if (t === "sand") {
      ctx.strokeStyle = "rgba(140,100,40,0.35)"; ctx.lineWidth = 1.3;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(p.x - r * 0.6, p.y + k * r * 0.35); ctx.quadraticCurveTo(p.x - r * 0.1, p.y + k * r * 0.35 - r * 0.18, p.x + r * 0.6, p.y + k * r * 0.35); ctx.stroke(); }
    } else if (t === "marsh") {
      ctx.fillStyle = "rgba(47,107,138,0.6)"; ctx.beginPath(); ctx.ellipse(p.x + r * 0.15, p.y + r * 0.2, r * 0.35, r * 0.15, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#8ab060"; ctx.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) { const x = p.x - r * 0.45 + k * r * 0.18; ctx.beginPath(); ctx.moveTo(x, p.y + r * 0.1); ctx.lineTo(x + Math.sin(e + k) * 2, p.y - r * 0.35); ctx.stroke(); }
    } else if (t === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let k = 0; k < 4; k++) { const tw = 0.5 + 0.5 * Math.sin(e * 3 + k + i); ctx.globalAlpha = tw; ctx.fillRect(p.x + Math.cos(k * 2 + i) * r * 0.4, p.y + Math.sin(k * 3 + i) * r * 0.4, 2, 2); }
      ctx.globalAlpha = 1;
    } else if (t === "crystal") {
      for (let k = 0; k < 3; k++) {
        const x = p.x + (k - 1) * r * 0.32, h = r * (0.45 + (k % 2) * 0.2);
        ctx.fillStyle = `rgba(122,220,255,${0.75 + Math.sin(e * 2 + k + i) * 0.2})`;
        ctx.beginPath(); ctx.moveTo(x, p.y + r * 0.3 - h); ctx.lineTo(x + r * 0.12, p.y + r * 0.3); ctx.lineTo(x - r * 0.12, p.y + r * 0.3); ctx.fill();
      }
    } else if (t === "vent") {
      ctx.fillStyle = "#2a1a18"; ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.1, r * 0.3, r * 0.15, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,110,60,${0.6 + Math.sin(e * 5 + i) * 0.3})`; ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.1, r * 0.15, r * 0.07, 0, 0, 7); ctx.fill();
      for (let k = 0; k < 3; k++) { const ph = (e * 0.6 + k / 3) % 1; ctx.fillStyle = `rgba(220,220,230,${0.35 * (1 - ph)})`; ctx.beginPath(); ctx.arc(p.x + Math.sin(k + e) * 3, p.y - ph * r * 0.8, r * (0.1 + ph * 0.2), 0, 7); ctx.fill(); }
    } else if (t === "ash") {
      ctx.fillStyle = "rgba(255,100,60,0.25)";
      for (let k = 0; k < 3; k++) ctx.fillRect(p.x + Math.cos(k * 2.1 + i) * r * 0.4, p.y + Math.sin(k * 1.7 + i) * r * 0.4, 2, 2);
    }
  }

  /** Buildings as small drawn structures, not coloured discs. */
  _drawBuilding(ctx, p, r, cell) {
    const spec = byId[cell.b];
    const e = this.elapsed;
    ctx.save();
    ctx.translate(p.x, p.y);
    const s = r / 26;
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 12, 15, 5, 0, 0, 7); ctx.fill();
    const body = spec.color;
    const smoke = (x, y) => { const f = Math.sin(e * 4 + x); ctx.fillStyle = `rgba(200,200,210,${0.3 + f * 0.15})`; ctx.beginPath(); ctx.arc(x, y - f * 3, 4, 0, 7); ctx.fill(); };
    const house = (w, roof, wall) => {
      ctx.fillStyle = wall; ctx.fillRect(-w, -3, w * 2, 15);
      ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(-w - 3, -3); ctx.lineTo(0, -17); ctx.lineTo(w + 3, -3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2a1a10"; ctx.fillRect(-3, 3, 6, 9);
    };
    switch (spec.id) {
      case "hut": house(13, body, shade(body, -0.15)); break;
      case "hall":
        house(20, body, shade(body, -0.15));
        ctx.fillStyle = "#fff2c0"; for (const x of [-14, -8, 8, 14]) ctx.fillRect(x - 1.5, 0, 3, 10);
        ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(0, -20, 4, 0, 7); ctx.fill();
        break;
      case "stonehouse":
        ctx.fillStyle = "#8a8e9a"; ctx.fillRect(-13, -12, 26, 24);
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
        for (let y = -8; y < 12; y += 5) { ctx.beginPath(); ctx.moveTo(-13, y); ctx.lineTo(13, y); ctx.stroke(); }
        ctx.fillStyle = "#5a4a6a"; ctx.beginPath(); ctx.moveTo(-15, -12); ctx.lineTo(0, -22); ctx.lineTo(15, -12); ctx.fill();
        ctx.fillStyle = "#ffd76a"; ctx.fillRect(-9, -6, 5, 5); ctx.fillRect(4, -6, 5, 5);
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(-3, 3, 6, 9);
        break;
      case "hearth": {
        ctx.fillStyle = "#5a5460"; ctx.beginPath(); ctx.arc(0, 4, 12, Math.PI, 0); ctx.fill();
        const f = 0.7 + Math.sin(e * 9) * 0.2;
        ctx.fillStyle = `rgba(255,${140 + f * 80},60,0.9)`;
        ctx.beginPath(); ctx.moveTo(0, -12 * f); ctx.quadraticCurveTo(7, 0, 0, 4); ctx.quadraticCurveTo(-7, 0, 0, -12 * f); ctx.fill();
        break;
      }
      case "geo":
        ctx.fillStyle = "#6a6a74"; ctx.fillRect(-12, -2, 24, 12);
        ctx.fillStyle = "#8a8a94"; ctx.fillRect(-4, -18, 8, 16);
        ctx.fillStyle = "#ff6a4a"; ctx.fillRect(-12, 2, 24, 3);
        for (let k = 0; k < 3; k++) { const ph = (e * 0.7 + k / 3) % 1; ctx.fillStyle = `rgba(230,230,240,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.arc(0, -20 - ph * 14, 3 + ph * 6, 0, 7); ctx.fill(); }
        break;
      case "farm": case "camp": case "paddy":
        ctx.fillStyle = spec.id === "paddy" ? "rgba(79,168,216,0.8)" : shade(body, -0.2);
        ctx.fillRect(-14, 0, 28, 11);
        ctx.fillStyle = body;
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.moveTo(-14 + k * 8, 0); ctx.lineTo(-10 + k * 8 + Math.sin(e * 2 + k) * (spec.id === "paddy" ? 1.5 : 0), -11); ctx.lineTo(-6 + k * 8, 0); ctx.closePath(); ctx.fill();
        }
        break;
      case "hunter":
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-13, 11); ctx.lineTo(0, -14); ctx.lineTo(13, 11); ctx.fill();
        ctx.fillStyle = "#2a1a10"; ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(0, 0); ctx.lineTo(4, 11); ctx.fill();
        ctx.strokeStyle = "#e8d8b0"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-6, -19); ctx.moveTo(3, -14); ctx.lineTo(6, -19); ctx.stroke();
        break;
      case "dock":
        ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(14, 8); ctx.stroke();
        ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.lineTo(5, -4); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#e6eaf5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -16); ctx.stroke();
        break;
      case "quarry": case "mine": case "crystalmine":
        ctx.fillStyle = "#2a2833"; ctx.beginPath(); ctx.arc(0, 6, 11, Math.PI, 0); ctx.fill();
        ctx.fillStyle = spec.id === "crystalmine" ? "#4a5a6a" : body; ctx.fillRect(-13, 4, 26, 7);
        if (spec.id === "mine") { ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -10); ctx.stroke(); }
        if (spec.id === "crystalmine") { ctx.fillStyle = `rgba(122,220,255,${0.8 + Math.sin(e * 3) * 0.2})`; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(4, 2); ctx.lineTo(-4, 2); ctx.fill(); }
        break;
      case "sawmill":
        house(12, "#7a5a3a", body);
        ctx.save(); ctx.translate(13, 2); ctx.rotate(e * 3);
        ctx.fillStyle = "#c8ccd8"; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
        ctx.fillStyle = "#6a6e7a"; for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-1, -9, 2, 3); }
        ctx.restore();
        break;
      case "bakery":
        house(12, "#a0503a", body);
        ctx.fillStyle = "#c86a3a"; ctx.beginPath(); ctx.arc(11, 6, 6, Math.PI, 0); ctx.fill();
        smoke(-8, -18);
        break;
      case "greenhouse":
        ctx.fillStyle = "rgba(160,255,220,0.35)"; ctx.strokeStyle = "rgba(220,255,240,0.8)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 10, 15, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        for (const x of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 10 - Math.sqrt(225 - x * x)); ctx.stroke(); }
        ctx.fillStyle = "#4aa84a"; for (const x of [-8, -1, 6]) { ctx.beginPath(); ctx.arc(x + 1, 6, 3, 0, 7); ctx.fill(); }
        break;
      case "tower":
        ctx.fillStyle = "#8a7a5a"; ctx.fillRect(-5, -20, 10, 32);
        ctx.fillStyle = body; ctx.fillRect(-8, -24, 16, 6);
        ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -34); ctx.stroke();
        ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(9 + Math.sin(e * 5) * 2, -31); ctx.lineTo(0, -28); ctx.fill();
        break;
      case "market":
        ctx.fillStyle = "#7a5a3a"; ctx.fillRect(-13, 0, 26, 12);
        for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? "#ffffff" : "#e05a3a"; ctx.beginPath(); ctx.moveTo(-15 + k * 7.5, -8); ctx.lineTo(-7.5 + k * 7.5, -8); ctx.lineTo(-7.5 + k * 7.5, 0); ctx.lineTo(-15 + k * 7.5, 0); ctx.fill(); }
        ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(-5, 4, 2.5, 0, 7); ctx.arc(2, 4, 2.5, 0, 7); ctx.fill();
        ctx.fillStyle = "#8fbf5c"; ctx.beginPath(); ctx.arc(8, 4, 2.5, 0, 7); ctx.fill();
        break;
      case "clinic":
        ctx.fillStyle = "#e8e8f0"; ctx.fillRect(-13, -8, 26, 20);
        ctx.fillStyle = "#c8c8d0"; ctx.fillRect(-14, -11, 28, 4);
        ctx.fillStyle = "#e0404a"; ctx.fillRect(-2, -5, 4, 12); ctx.fillRect(-6, -1, 12, 4);
        break;
      case "store":
        ctx.fillStyle = body; ctx.fillRect(-15, -6, 30, 18);
        ctx.fillStyle = shade(body, 0.2); ctx.fillRect(-15, -10, 30, 5);
        ctx.fillStyle = "#2a1a10"; ctx.fillRect(-5, 2, 10, 10);
        break;
      default:
        ctx.fillStyle = body; ctx.fillRect(-13, -6, 26, 18);
        ctx.fillStyle = "#2a2833"; ctx.fillRect(4, -16, 6, 12);
        smoke(7, -20);
    }

    if (spec.jobs > 0) {
      for (let k = 0; k < spec.jobs; k++) {
        ctx.fillStyle = k < cell.worked ? "#ffd76a" : "rgba(255,255,255,0.22)";
        ctx.beginPath(); ctx.arc(-6 + k * 6, 17, 2.4, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Tabs, a demolish toggle, and the current tab's buildings. */
  _bar() {
    const W = this.viewW, H = this.viewH;
    const out = [];
    const tabW = Math.min(96, (W - 16 - 48) / CATS.length - 4);
    const tabsTotal = CATS.length * (tabW + 4) + 44;
    let x = (W - tabsTotal) / 2;
    CATS.forEach((c, i) => { out.push({ kind: "tab", i, x, y: H - BAR_H, w: tabW, h: 22 }); x += tabW + 4; });
    out.push({ kind: "demolish", x, y: H - BAR_H, w: 40, h: 22 });
    const list = this._tabList();
    const n = list.length;
    const w = Math.min(96, (W - 16 - (n - 1) * 4) / n);
    const x0 = (W - (n * w + (n - 1) * 4)) / 2;
    list.forEach((b, k) => out.push({ kind: "item", i: BUILDINGS.indexOf(b), b, x: x0 + k * (w + 4), y: H - BAR_H + 26, w, h: 40 }));
    return out;
  }

  _drawBar(ctx, W, H) {
    ctx.fillStyle = "rgba(8,12,10,0.55)";
    ctx.fillRect(0, H - BAR_H - 6, W, BAR_H + 6);
    for (const b of this._bar()) {
      if (b.kind === "tab") {
        const on = b.i === this.tab;
        ctx.fillStyle = on ? "rgba(255,255,255,0.18)" : "rgba(16,20,16,0.85)";
        roundRect(ctx, b.x, b.y, b.w, b.h, 7); ctx.fill();
        ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.55)";
        ctx.font = "800 10px 'Inter', system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(CATS[b.i].name.toUpperCase(), b.x + b.w / 2, b.y + 15);
        continue;
      }
      if (b.kind === "demolish") {
        ctx.fillStyle = this.demolish ? "#ff5470" : "rgba(16,20,16,0.85)";
        roundRect(ctx, b.x, b.y, b.w, b.h, 7); ctx.fill();
        ctx.strokeStyle = "#ff5470"; ctx.lineWidth = 1; roundRect(ctx, b.x, b.y, b.w, b.h, 7); ctx.stroke();
        ctx.fillStyle = this.demolish ? "#0b0a12" : "#ff5470"; ctx.font = "800 11px 'Inter', system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("✖", b.x + b.w / 2, b.y + 15);
        continue;
      }
      const on = this.selected === b.i && !this.demolish;
      const afford = this._afford(b.b);
      ctx.globalAlpha = afford ? 1 : 0.45;
      ctx.fillStyle = on ? hexA(b.b.color, 0.85) : "rgba(16,20,16,0.88)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
      ctx.strokeStyle = on ? "#ffffff" : hexA(b.b.color, 0.45);
      ctx.lineWidth = on ? 2 : 1;
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();
      ctx.fillStyle = on ? "#0b0a12" : b.b.color;
      const fs = b.w < 60 ? 8 : 9;
      ctx.font = `800 ${fs}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = "center";
      const name = b.b.name.toUpperCase();
      ctx.fillText(b.w < 60 ? name.slice(0, 8) : name.slice(0, 12), b.x + b.w / 2, b.y + 14);
      ctx.fillStyle = on ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.6)";
      ctx.font = "700 8px 'Inter', system-ui, sans-serif";
      const cost = Object.entries(this._cost(b.b)).map(([k, n]) => `${n}${k[0]}`).join(" ");
      ctx.fillText(cost, b.x + b.w / 2, b.y + 26);
      if (b.b.on) { ctx.fillStyle = on ? "rgba(0,0,0,0.6)" : TILES[b.b.on].edge; ctx.fillText(`on ${TILES[b.b.on].name.toLowerCase()}`, b.x + b.w / 2, b.y + 36); }
      ctx.globalAlpha = 1;
    }
  }

  _drawResources(ctx, W) {
    const n = RES.length;
    const w = Math.min(70, (W - 120) / n - 4);
    let x = 10;
    ctx.textAlign = "left";
    for (const r of RES) {
      const v = Math.floor(this.res[r]);
      ctx.fillStyle = "rgba(8,12,8,0.6)";
      roundRect(ctx, x, 10, w, 26, 8); ctx.fill();
      ctx.fillStyle = RES_COLOR[r];
      ctx.beginPath(); ctx.arc(x + 10, 23, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "800 11px 'Inter', system-ui, sans-serif";
      ctx.fillText(`${v}`, x + 18, 28);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "700 7px 'Inter', system-ui, sans-serif";
      ctx.fillText(r.toUpperCase(), x + 18, 18);
      x += w + 4;
    }
    // Day clock and region.
    ctx.textAlign = "right";
    ctx.fillStyle = this.winter ? "#c9e0ff" : "rgba(255,255,255,0.72)";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.winter ? `WINTER · DAY ${this.day}` : `DAY ${this.day}`, W - 10, 20);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, W - 90, 26, 80, 5, 2.5); ctx.fill();
    ctx.fillStyle = this.winter ? "#c9e0ff" : "#8fbf5c";
    roundRect(ctx, W - 90, 26, 80 * (this.dayT / DAY), 5, 2.5); ctx.fill();
    const toWinter = this.reg.winter - (this.day % this.reg.winter);
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "700 9px 'Inter', system-ui, sans-serif";
    ctx.fillText(`${this.reg.name}${this.winter ? "" : ` · winter in ${toWinter}d`}${this.idle > 0 ? ` · ${this.idle} idle` : ""}`, W - 10, 44);
    // What the selected building does.
    const spec = BUILDINGS[this.selected];
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.font = "600 9px 'Inter', system-ui, sans-serif";
    ctx.fillText(this.demolish ? "Demolish: tap a building for half its wood back." : `${spec.name}: ${spec.text}`.slice(0, Math.floor((W - 180) / 4.6)), 10, 48);
  }

  _drawFloaters(ctx) {
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      const p = this._hexPos(f.i);
      ctx.globalAlpha = Math.max(0, 1 - f.time / 1.5);
      ctx.fillStyle = f.c;
      ctx.font = "800 12px 'Sora', system-ui, sans-serif";
      ctx.fillText(f.t, p.x, p.y - this.r - f.time * 20);
    }
    ctx.globalAlpha = 1;
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.textAlign = "center";
    const y = H - BAR_H - 40;
    ctx.fillStyle = "rgba(8,12,8,0.72)";
    const mw = Math.min(380, W - 16);
    roundRect(ctx, W / 2 - mw / 2, y, mw, 26, 13); ctx.fill();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = `800 ${W < 460 ? 9 : 12}px 'Sora', system-ui, sans-serif`;
    ctx.fillText(this.msg, W / 2, y + 17);
    ctx.globalAlpha = 1;
  }
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

export default ColonySevenGame;
