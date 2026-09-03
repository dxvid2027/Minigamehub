// ==========================================================================
// Colony Seven — keep a settlement alive through the winters.
//
// A hex map with six resources under it. You place buildings, buildings
// claim the tiles around them, and settlers work whichever job has the most
// open slots. Everything runs on a day clock; every eighth day is a winter
// night, when food burns twice as fast and anything without heat freezes.
//
// The failure is always the same shape and never the same cause: you build
// one thing too many, the food dips under the population, and by the time
// you notice, the settlers you needed to fix it have already starved.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, seededRng, choice } from "../core/utils.js";

const COLS = 11, ROWS = 9;
const DAY = 9;            // seconds per day
const WINTER_EVERY = 8;   // every Nth day is a winter night

// --- Terrain --------------------------------------------------------------
const TILES = {
  grass:  { name: "Grassland", color: "#5c8a3a", edge: "#7aa84f", yields: { food: 1 } },
  forest: { name: "Forest",    color: "#2f5c2a", edge: "#437a38", yields: { wood: 1 } },
  rock:   { name: "Rocky",     color: "#6b6f7d", edge: "#878c9c", yields: { stone: 1 } },
  ore:    { name: "Ore Seam",  color: "#7a5c3a", edge: "#a8804f", yields: { iron: 1 } },
  water:  { name: "Water",     color: "#2f6b8a", edge: "#4a92b4", yields: { food: 1 } },
  ash:    { name: "Ashland",   color: "#4a4450", edge: "#615a68", yields: {} },
};

// --- Buildings ------------------------------------------------------------
// `needs` is the build cost, `jobs` how many settlers it employs, `produce`
// what one worked slot yields per day, `on` the terrain it wants under it.
const BUILDINGS = [
  { id: "hut",     name: "Hut",        cost: { wood: 12 },              jobs: 0, pop: 3, heat: 1, produce: {},                    on: null,      color: "#c98f4a", text: "Houses three settlers and keeps them warm." },
  { id: "farm",    name: "Farm",       cost: { wood: 16 },              jobs: 3, pop: 0, heat: 0, produce: { food: 2.4 },          on: "grass",   color: "#8fbf5c", text: "Food from grassland. The whole colony runs on this." },
  { id: "dock",    name: "Fishery",    cost: { wood: 22 },              jobs: 2, pop: 0, heat: 0, produce: { food: 3.1 },          on: "water",   color: "#4fa8d8", text: "More food per worker than a farm, but water is scarce." },
  { id: "camp",    name: "Lumber Camp",cost: { wood: 10 },              jobs: 3, pop: 0, heat: 0, produce: { wood: 2.2 },          on: "forest",  color: "#6f9c5c", text: "Wood, which everything else is built from." },
  { id: "quarry",  name: "Quarry",     cost: { wood: 24 },              jobs: 3, pop: 0, heat: 0, produce: { stone: 1.8 },         on: "rock",    color: "#9aa0b4", text: "Stone for the buildings that survive winter." },
  { id: "mine",    name: "Mine",       cost: { wood: 20, stone: 18 },   jobs: 3, pop: 0, heat: 0, produce: { iron: 1.3 },          on: "ore",     color: "#c9a06a", text: "Iron, which only the late buildings need." },
  { id: "hearth",  name: "Hearth",     cost: { wood: 20, stone: 12 },   jobs: 1, pop: 0, heat: 4, produce: {},                     on: null,      color: "#ff9f43", text: "Heats every building within two tiles through a winter night." },
  { id: "store",   name: "Storehouse", cost: { wood: 26, stone: 20 },   jobs: 1, pop: 0, heat: 0, produce: {}, capacity: 120,      on: null,      color: "#a88a5c", text: "Raises what the colony can hold by 120 of everything." },
  { id: "smith",   name: "Smithy",     cost: { wood: 28, stone: 24, iron: 12 }, jobs: 2, pop: 0, heat: 1, produce: { tools: 1.1 }, on: null,      color: "#8b90ac", text: "Tools. Every worked slot produces more while tools last." },
  { id: "hall",    name: "Great Hall", cost: { wood: 60, stone: 50, iron: 30 }, jobs: 2, pop: 6, heat: 3, produce: {},             on: null,      color: "#ffd76a", text: "Six more settlers, heat, and the colony's goal." },
];
const byId = Object.fromEntries(BUILDINGS.map(b => [b.id, b]));

const RES = ["food", "wood", "stone", "iron", "tools"];
const RES_COLOR = { food: "#8fbf5c", wood: "#c98f4a", stone: "#9aa0b4", iron: "#c9a06a", tools: "#8b90ac" };

export class ColonySevenGame extends GameBase {
  getDifficulties() { return ["Settlement"]; }
  getInstructions() {
    return [
      "Pick a building from the bar, then click a hex. Buildings want particular ground — a farm needs grass, a fishery needs water.",
      "Settlers fill jobs on their own, spreading across whatever has open slots. More huts means more settlers, and more mouths.",
      "Every eighth day is a winter night. Food burns twice as fast and any building outside a hearth's two-tile reach stops working.",
      "Storehouses raise what you can hold. Without them the surplus you worked for spills on the ground.",
      "The goal is the Great Hall: sixty wood, fifty stone and thirty iron. Getting there before a winter empties the granary is the game.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a building, then tap a hex."; }
  getKeyboardHint() { return "1-9 and 0 pick a building, click a hex to place. X demolishes."; }
  getScene() { return "meadow"; }

  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.colony) custom.colony = { bestDay: 0, bestPop: 0, halls: 0 };
    return custom.colony;
  }
  _save() { saveManager.saveNow(); }

  getPlayLabel() { return "Found a colony"; }
  getStartExtras() {
    const c = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Longest: ${c.bestDay || 0} days`),
      el("span", {}, `Largest: ${c.bestPop || 0} settlers`),
      el("span", {}, `${c.halls || 0} halls raised`),
    ]);
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this._hexAt(p.x, p.y); });
    BUILDINGS.forEach((b, i) => {
      const code = i < 9 ? `Digit${i + 1}` : "Digit0";
      this.input.onKey(code, () => this._pick(i));
    });
    this.input.onKey("KeyX", () => { this.demolish = !this.demolish; audioManager.play("select"); });
  }

  onResize() { this._fit(); }

  onStart() {
    const rng = seededRng(`colony-${Date.now()}-${Math.random()}`);
    this.map = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        // Terrain by noise-ish bands, with water in a river and ore in seams.
        const n = Math.sin(x * 0.7 + y * 0.4) + Math.sin(x * 0.23 - y * 0.9) * 0.7 + rng() * 0.9;
        let t = "grass";
        if (n > 1.25) t = "forest";
        else if (n < -1.1) t = "rock";
        if (rng() < 0.07) t = "ore";
        if (Math.abs(y - (ROWS / 2 + Math.sin(x * 0.8) * 1.4)) < 0.6 && rng() < 0.75) t = "water";
        this.map.push({ t, b: null, worked: 0, heated: false });
      }
    }
    // A guaranteed opening: clear grass and forest around the centre.
    const c0 = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);
    this.map[c0].t = "grass";
    for (const n of this._neighbours(c0)) this.map[n].t = n % 2 ? "forest" : "grass";

    this.res = { food: 60, wood: 60, stone: 20, iron: 0, tools: 0 };
    this.cap = 150;
    this.pop = 4;
    this.day = 1;
    this.dayT = 0;
    this.winter = false;
    this.selected = 0;
    this.demolish = false;
    this.hover = -1;
    this.elapsed = 0;
    this.msg = "Place a lumber camp on forest, then a farm on grass";
    this.msgT = 5;
    this.floaters = [];
    this.starving = 0;
    this.setScore(0);
    this._fit();
    this._updateHud();
  }

  _fit() {
    const W = this.viewW || 600, H = this.viewH || 600;
    // Pointy-top hexes in an offset grid.
    this.r = Math.min((W - 20) / (COLS * 1.75 + 0.9), (H - 150) / (ROWS * 1.5 + 0.6));
    this.hw = this.r * Math.sqrt(3);
    this.hh = this.r * 2;
    this.ox = (W - (COLS * this.hw + this.hw / 2)) / 2 + this.hw / 2;
    this.oy = 56 + this.r;
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
    const odd = y & 1;
    const deltas = odd
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
      for (const c of frontier) for (const n of this._neighbours(c)) {
        if (!seen.has(n)) { seen.add(n); next.push(n); }
      }
      frontier = next;
    }
    return [...seen];
  }

  // ------------------------------------------------------------- INPUT ---
  _pick(i) { this.selected = i; this.demolish = false; audioManager.play("select"); }

  _click(px, py) {
    if (this.state !== "playing") return;
    for (const b of this._bar()) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { this._pick(b.i); return; }
    }
    const i = this._hexAt(px, py);
    if (i < 0) return;
    const cell = this.map[i];

    if (this.demolish) {
      if (!cell.b) return;
      // Half the wood back, which makes a mistake survivable but not free.
      const spec = byId[cell.b];
      this.res.wood = Math.min(this.cap, this.res.wood + Math.floor((spec.cost.wood || 0) / 2));
      if (spec.capacity) this.cap -= spec.capacity;
      cell.b = null;
      audioManager.play("hit");
      this._recount();
      return;
    }

    const spec = BUILDINGS[this.selected];
    if (cell.b) { this._say("Something is already there", "#ff5470"); return; }
    if (spec.on && cell.t !== spec.on) {
      this._say(`${spec.name} needs ${TILES[spec.on].name.toLowerCase()}`, "#ff5470");
      return;
    }
    if (spec.on === null && cell.t === "water") { this._say("Not on water", "#ff5470"); return; }
    for (const [r, n] of Object.entries(spec.cost)) {
      if (this.res[r] < n) { this._say(`Not enough ${r}`, "#ff5470"); return; }
    }
    for (const [r, n] of Object.entries(spec.cost)) this.res[r] -= n;
    cell.b = spec.id;
    if (spec.capacity) this.cap += spec.capacity;
    audioManager.play("place");
    this._float(`${spec.name}`, spec.color, i);
    this._recount();
    if (spec.id === "hall") this._victory();
  }

  /** Recomputes population capacity and the heat map after any change. */
  _recount() {
    let cap = 0;
    for (const c of this.map) if (c.b) cap += byId[c.b].pop;
    this.popCap = Math.max(4, cap);
    for (const c of this.map) c.heated = false;
    this.map.forEach((c, i) => {
      if (!c.b) return;
      const spec = byId[c.b];
      if (spec.heat > 0) for (const n of this._within(i, 2)) this.map[n].heated = true;
    });
    this._updateHud();
  }

  _victory() {
    const store = this._store();
    store.halls = (store.halls || 0) + 1;
    if ((store.bestDay || 0) < this.day) store.bestDay = this.day;
    if ((store.bestPop || 0) < this.pop) store.bestPop = this.pop;
    this._save();
    this.addScore(3000);
    audioManager.play("win");
    this.endGame({
      result: "win", score: this.score,
      message: `The Great Hall stands on day ${this.day}, with ${this.pop} settlers to fill it.`,
      extraStats: [
        { label: "Days", value: this.day },
        { label: "Settlers", value: this.pop },
        { label: "Buildings", value: this.map.filter(c => c.b).length },
      ],
    });
  }

  _collapse() {
    const store = this._store();
    if ((store.bestDay || 0) < this.day) store.bestDay = this.day;
    if ((store.bestPop || 0) < this.pop) store.bestPop = this.pop;
    this._save();
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score,
      message: `The last settler left on day ${this.day}. The granary had been empty for ${Math.round(this.starving)} days.`,
      extraStats: [
        { label: "Days", value: this.day },
        { label: "Peak", value: `${this.peakPop || this.pop} settlers` },
        { label: "Buildings", value: this.map.filter(c => c.b).length },
      ],
    });
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 2.4; }
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
      if (this.winter && !c.heated) continue;
      const spec = byId[c.b];
      for (const [r, n] of Object.entries(spec.produce)) {
        this.res[r] = Math.min(this.cap, this.res[r] + n * c.worked * rate * (r === "tools" ? 1 : toolBoost));
      }
    }
    // Food burn: one per settler per day, doubled through a winter night.
    const burn = this.pop * (this.winter ? 2 : 1) * rate;
    this.res.food -= burn;
    if (this.res.tools > 0) this.res.tools = Math.max(0, this.res.tools - this.pop * 0.12 * rate);

    if (this.res.food <= 0) {
      this.res.food = 0;
      this.starving += rate;
      // Settlers leave one at a time rather than all at once, so a dip is
      // recoverable and a famine is not.
      if (this.starving > 0.5) {
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
   * first. It is deliberately not optimal — the player's job is to build
   * the right things, not to micromanage who stands where.
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
    // Food first when the granary is low, so a colony tries to save itself.
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
    this.winter = this.day % WINTER_EVERY === 0;
    if (this.winter) {
      audioManager.play("error");
      this._say("Winter night — hearths only", "#c9e0ff");
    }
    // Growth: a fed colony under its housing cap gains a settler.
    if (!this.winter && this.pop < (this.popCap ?? 4) && this.res.food > this.pop * 3) {
      this.pop++;
      audioManager.play("levelup");
      this._say("A settler arrives", "#2ee6a6");
    }
    this.addScore(20 + this.pop * 5);
    this._recount();
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawSky(ctx, W, H);
    this._drawHexes(ctx);
    this._drawBar(ctx, W, H);
    this._drawResources(ctx, W);
    this._drawFloaters(ctx);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.winter) { g.addColorStop(0, "#1a2438"); g.addColorStop(1, "#0d121f"); }
    else { g.addColorStop(0, "#2a3a2a"); g.addColorStop(1, "#131a16"); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (this.winter) {
      ctx.fillStyle = "rgba(220,235,255,0.35)";
      for (let i = 0; i < 40; i++) {
        const x = ((i * 97 + this.elapsed * 22) % (W + 20)) - 10;
        const y = ((i * 53 + this.elapsed * 34) % (H + 20)) - 10;
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
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
      const T = TILES[c.t];

      this._hexPath(ctx, p.x, p.y, r * 0.96);
      const g = ctx.createLinearGradient(p.x, p.y - r, p.x, p.y + r);
      g.addColorStop(0, T.edge); g.addColorStop(1, T.color);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Terrain detail.
      ctx.save();
      this._hexPath(ctx, p.x, p.y, r * 0.96);
      ctx.clip();
      if (c.t === "forest") {
        for (let k = 0; k < 3; k++) {
          const tx = p.x + (k - 1) * r * 0.42, ty = p.y + (k % 2 ? r * 0.16 : -r * 0.1);
          ctx.fillStyle = "#1f4a1c";
          ctx.beginPath();
          ctx.moveTo(tx, ty - r * 0.42); ctx.lineTo(tx + r * 0.22, ty + r * 0.18);
          ctx.lineTo(tx - r * 0.22, ty + r * 0.18);
          ctx.closePath(); ctx.fill();
        }
      } else if (c.t === "rock") {
        ctx.fillStyle = "#565a66";
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(p.x + (k - 1) * r * 0.4, p.y + (k % 2 ? r * 0.2 : -r * 0.14), r * 0.2, 0, 7);
          ctx.fill();
        }
      } else if (c.t === "ore") {
        ctx.fillStyle = "#ffd76a";
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * 6.28 + 0.4;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * r * 0.32, p.y + Math.sin(a) * r * 0.32, r * 0.09, 0, 7);
          ctx.fill();
        }
      } else if (c.t === "water") {
        ctx.strokeStyle = "rgba(255,255,255,0.28)";
        ctx.lineWidth = 1.6;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(p.x - r * 0.5, p.y + k * r * 0.3 + Math.sin(this.elapsed * 2 + k) * 2);
          ctx.quadraticCurveTo(p.x, p.y + k * r * 0.3 - 3, p.x + r * 0.5, p.y + k * r * 0.3);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Winter shading for anything unheated.
      if (this.winter && !c.heated) {
        this._hexPath(ctx, p.x, p.y, r * 0.96);
        ctx.fillStyle = "rgba(150,190,255,0.28)";
        ctx.fill();
      }

      if (c.b) this._drawBuilding(ctx, p, r, c);

      // Placement preview.
      if (i === this.hover) {
        const ok = !c.b && (!spec.on || c.t === spec.on) && !(spec.on === null && c.t === "water") &&
                   Object.entries(spec.cost).every(([k, n]) => this.res[k] >= n);
        this._hexPath(ctx, p.x, p.y, r * 0.96);
        ctx.strokeStyle = this.demolish ? "#ff5470" : ok ? "#2ee6a6" : "#ff9f43";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }

  /** Buildings as small drawn structures, not coloured discs. */
  _drawBuilding(ctx, p, r, cell) {
    const spec = byId[cell.b];
    ctx.save();
    ctx.translate(p.x, p.y);
    const s = r / 26;
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(0, 12, 15, 5, 0, 0, 7); ctx.fill();

    const body = spec.color;
    if (spec.id === "hut" || spec.id === "hall") {
      const w = spec.id === "hall" ? 20 : 13;
      ctx.fillStyle = shade(body, -0.15);
      ctx.fillRect(-w, -3, w * 2, 15);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-w - 3, -3); ctx.lineTo(0, -17); ctx.lineTo(w + 3, -3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#2a1a10";
      ctx.fillRect(-3, 3, 6, 9);
      if (spec.id === "hall") {
        ctx.fillStyle = "#ffd76a";
        ctx.beginPath(); ctx.arc(0, -20, 4, 0, 7); ctx.fill();
      }
    } else if (spec.id === "hearth") {
      ctx.fillStyle = "#5a5460";
      ctx.beginPath(); ctx.arc(0, 4, 12, Math.PI, 0); ctx.fill();
      const f = 0.7 + Math.sin(this.elapsed * 9) * 0.2;
      ctx.fillStyle = `rgba(255,${140 + f * 80},60,${0.9})`;
      ctx.beginPath();
      ctx.moveTo(0, -12 * f); ctx.quadraticCurveTo(7, 0, 0, 4); ctx.quadraticCurveTo(-7, 0, 0, -12 * f);
      ctx.fill();
    } else if (spec.id === "farm" || spec.id === "camp") {
      ctx.fillStyle = shade(body, -0.2);
      ctx.fillRect(-14, 0, 28, 11);
      ctx.fillStyle = body;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(-14 + k * 8, 0); ctx.lineTo(-10 + k * 8, -11); ctx.lineTo(-6 + k * 8, 0);
        ctx.closePath(); ctx.fill();
      }
    } else if (spec.id === "dock") {
      ctx.strokeStyle = "#6b4a2a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(14, 8); ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.lineTo(5, -4); ctx.lineTo(-5, -4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#e6eaf5"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -16); ctx.stroke();
    } else if (spec.id === "quarry" || spec.id === "mine") {
      ctx.fillStyle = "#2a2833";
      ctx.beginPath(); ctx.arc(0, 6, 11, Math.PI, 0); ctx.fill();
      ctx.fillStyle = body;
      ctx.fillRect(-13, 4, 26, 7);
      if (spec.id === "mine") {
        ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -10); ctx.stroke();
      }
    } else if (spec.id === "store") {
      ctx.fillStyle = body;
      ctx.fillRect(-15, -6, 30, 18);
      ctx.fillStyle = shade(body, 0.2);
      ctx.fillRect(-15, -10, 30, 5);
      ctx.fillStyle = "#2a1a10";
      ctx.fillRect(-5, 2, 10, 10);
    } else {
      ctx.fillStyle = body;
      ctx.fillRect(-13, -6, 26, 18);
      ctx.fillStyle = "#2a2833";
      ctx.fillRect(4, -16, 6, 12);
      const f = Math.sin(this.elapsed * 4);
      ctx.fillStyle = `rgba(200,200,210,${0.3 + f * 0.15})`;
      ctx.beginPath(); ctx.arc(7, -20 - f * 3, 4, 0, 7); ctx.fill();
    }

    // Worker pips: how many of the jobs are actually filled.
    if (spec.jobs > 0) {
      for (let k = 0; k < spec.jobs; k++) {
        ctx.fillStyle = k < cell.worked ? "#ffd76a" : "rgba(255,255,255,0.22)";
        ctx.beginPath(); ctx.arc(-6 + k * 6, 17, 2.4, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  _bar() {
    const W = this.viewW, H = this.viewH;
    const n = BUILDINGS.length;
    const w = Math.min(78, (W - 16) / Math.ceil(n / 2) - 4);
    const perRow = Math.ceil(n / 2);
    const total = perRow * w + (perRow - 1) * 4;
    const x0 = (W - total) / 2;
    return BUILDINGS.map((b, i) => ({
      i, b,
      x: x0 + (i % perRow) * (w + 4),
      y: H - 78 + Math.floor(i / perRow) * 36,
      w, h: 32,
    }));
  }

  _drawBar(ctx, W, H) {
    for (const b of this._bar()) {
      const on = this.selected === b.i && !this.demolish;
      const afford = Object.entries(b.b.cost).every(([k, n]) => this.res[k] >= n);
      ctx.globalAlpha = afford ? 1 : 0.42;
      ctx.fillStyle = on ? hexA(b.b.color, 0.85) : "rgba(16,20,16,0.85)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
      ctx.strokeStyle = on ? "#ffffff" : hexA(b.b.color, 0.45);
      ctx.lineWidth = on ? 2 : 1;
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();
      ctx.fillStyle = on ? "#0b0a12" : b.b.color;
      ctx.font = "800 9px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.b.name.toUpperCase().slice(0, 10), b.x + b.w / 2, b.y + 13);
      ctx.fillStyle = on ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.6)";
      ctx.font = "700 8px 'Inter', system-ui, sans-serif";
      ctx.fillText(Object.entries(b.b.cost).map(([k, n]) => `${n}${k[0]}`).join(" "), b.x + b.w / 2, b.y + 25);
      ctx.globalAlpha = 1;
    }
  }

  _drawResources(ctx, W) {
    let x = 12;
    ctx.textAlign = "left";
    for (const r of RES) {
      const v = Math.floor(this.res[r]);
      ctx.fillStyle = "rgba(8,12,8,0.6)";
      roundRect(ctx, x, 12, 74, 26, 8); ctx.fill();
      ctx.fillStyle = RES_COLOR[r];
      ctx.beginPath(); ctx.arc(x + 13, 25, 5, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "800 11px 'Inter', system-ui, sans-serif";
      ctx.fillText(`${v}`, x + 24, 29);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "700 7px 'Inter', system-ui, sans-serif";
      ctx.fillText(r.toUpperCase(), x + 24, 19);
      x += 78;
      if (x > W - 90) break;
    }
    // Day clock.
    ctx.textAlign = "right";
    ctx.fillStyle = this.winter ? "#c9e0ff" : "rgba(255,255,255,0.72)";
    ctx.font = "800 13px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.winter ? `WINTER · DAY ${this.day}` : `DAY ${this.day}`, W - 12, 24);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, W - 92, 30, 80, 5, 2.5); ctx.fill();
    ctx.fillStyle = this.winter ? "#c9e0ff" : "#8fbf5c";
    roundRect(ctx, W - 92, 30, 80 * (this.dayT / DAY), 5, 2.5); ctx.fill();
    if (this.idle > 0) {
      ctx.fillStyle = "#ffd76a";
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.fillText(`${this.idle} idle`, W - 12, 46);
    }
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
    ctx.fillStyle = "rgba(8,12,8,0.62)";
    roundRect(ctx, W / 2 - 170, H - 116, 340, 26, 13); ctx.fill();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, H - 98);
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
