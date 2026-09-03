// ==========================================================================
// Abyss Angler — drop a line into six depth zones and see what takes it.
//
// Two halves that feed each other. The descent is a dodging run: the hook
// falls, you steer it past jellyfish and debris that snap the line, and the
// deeper it gets the better the fish. Once something bites, the reel-in is a
// tug-of-war — hold to pull, but hold too long against a fighting fish and
// the line tension snaps it.
//
// Everything you land goes in the log. Thirty species, six of them abyssal
// bosses that only appear below 400 m with the right bait on the hook.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, choice } from "../core/utils.js";

// --- Depth zones ----------------------------------------------------------
const ZONES = [
  { name: "Sunlit Shallows", from: 0,   water: ["#4fc3e8", "#2b8fc4"], mote: "#bff0ff", weed: true },
  { name: "Kelp Forest",     from: 60,  water: ["#2b8fc4", "#1d6b8f"], mote: "#a8e6c8", weed: true },
  { name: "Twilight Reach",  from: 140, water: ["#1d6b8f", "#123f5e"], mote: "#8fd0ff", weed: false },
  { name: "Midnight Drift",  from: 240, water: ["#123f5e", "#0a2138"], mote: "#6bb6ff", weed: false },
  { name: "The Trench",      from: 360, water: ["#0a2138", "#05101f"], mote: "#7c5cff", weed: false },
  { name: "Abyssal Floor",   from: 480, water: ["#05101f", "#02060d"], mote: "#ff4fd8", weed: false },
];

// --- Fish -----------------------------------------------------------------
// `fight` is how hard it pulls back, `size` scales the drawing, `min`/`max`
// bound the depths it can be hooked at. Shape drives the silhouette so the
// species read apart at a glance rather than being recoloured copies.
const FISH = [
  { id: "sardine",   name: "Sardine",        min: 0,   max: 90,  value: 12,   fight: 0.5, size: 0.55, shape: "slim",   body: "#9fd8e8", fin: "#6fb6cc", rarity: 1 },
  { id: "perch",     name: "River Perch",    min: 0,   max: 110, value: 20,   fight: 0.7, size: 0.7,  shape: "round",  body: "#8fbf5c", fin: "#5f8a34", rarity: 1 },
  { id: "mackerel",  name: "Mackerel",       min: 10,  max: 130, value: 34,   fight: 0.9, size: 0.75, shape: "slim",   body: "#5fa8d8", fin: "#2f6f9c", rarity: 1 },
  { id: "snapper",   name: "Red Snapper",    min: 20,  max: 150, value: 55,   fight: 1.1, size: 0.85, shape: "round",  body: "#e8574a", fin: "#a8302a", rarity: 2 },
  { id: "puffer",    name: "Pufferfish",     min: 25,  max: 160, value: 70,   fight: 0.8, size: 0.8,  shape: "puffer", body: "#ffd76a", fin: "#c9971c", rarity: 2 },
  { id: "clown",     name: "Clownfish",      min: 0,   max: 100, value: 48,   fight: 0.6, size: 0.55, shape: "round",  body: "#ff9f43", fin: "#ffffff", rarity: 2 },
  { id: "rockcod",   name: "Rock Cod",       min: 40,  max: 200, value: 88,   fight: 1.3, size: 0.95, shape: "round",  body: "#8a7a5c", fin: "#5c5038", rarity: 2 },
  { id: "seabass",   name: "Sea Bass",       min: 50,  max: 220, value: 120,  fight: 1.5, size: 1.05, shape: "slim",   body: "#7c8ea8", fin: "#4a5870", rarity: 2 },
  { id: "ray",       name: "Sting Ray",      min: 60,  max: 240, value: 165,  fight: 1.6, size: 1.2,  shape: "ray",    body: "#a89578", fin: "#7a6a52", rarity: 3 },
  { id: "squid",     name: "Reef Squid",     min: 70,  max: 260, value: 190,  fight: 1.4, size: 0.9,  shape: "squid",  body: "#ff8fb4", fin: "#c95f84", rarity: 3 },
  { id: "eel",       name: "Moray Eel",      min: 80,  max: 280, value: 230,  fight: 1.9, size: 1.1,  shape: "eel",    body: "#6f9c5c", fin: "#456334", rarity: 3 },
  { id: "tuna",      name: "Bluefin Tuna",   min: 100, max: 300, value: 320,  fight: 2.3, size: 1.35, shape: "slim",   body: "#4a7fd8", fin: "#2a4f9c", rarity: 3 },
  { id: "swordfish", name: "Swordfish",      min: 120, max: 320, value: 430,  fight: 2.7, size: 1.45, shape: "sword",  body: "#5c7fa8", fin: "#354f6f", rarity: 3 },
  { id: "lantern",   name: "Lanternfish",    min: 150, max: 380, value: 380,  fight: 1.2, size: 0.7,  shape: "lamp",   body: "#3a4a6f", fin: "#7cf0d0", rarity: 3, glow: "#7cf0d0" },
  { id: "hatchet",   name: "Hatchetfish",    min: 160, max: 390, value: 420,  fight: 1.3, size: 0.65, shape: "round",  body: "#c9d4e8", fin: "#8f9db8", rarity: 3, glow: "#c9d4e8" },
  { id: "viper",     name: "Viperfish",      min: 200, max: 430, value: 620,  fight: 2.5, size: 1.0,  shape: "fang",   body: "#2a3a5c", fin: "#5ce6ff", rarity: 4, glow: "#5ce6ff" },
  { id: "gulper",    name: "Gulper Eel",     min: 220, max: 460, value: 760,  fight: 2.8, size: 1.3,  shape: "eel",    body: "#3a2a4c", fin: "#a86bff", rarity: 4, glow: "#a86bff" },
  { id: "anglerf",   name: "Anglerfish",     min: 250, max: 500, value: 950,  fight: 3.1, size: 1.2,  shape: "lamp",   body: "#2a2438", fin: "#ffd76a", rarity: 4, glow: "#ffd76a" },
  { id: "oarfish",   name: "Oarfish",        min: 260, max: 520, value: 1100, fight: 2.6, size: 1.6,  shape: "eel",    body: "#c9ccd8", fin: "#ff5470", rarity: 4, glow: "#ff5470" },
  { id: "vampsquid", name: "Vampire Squid",  min: 300, max: 540, value: 1350, fight: 2.9, size: 1.15, shape: "squid",  body: "#5c2a44", fin: "#ff4fd8", rarity: 4, glow: "#ff4fd8" },
  { id: "dumbo",     name: "Dumbo Octopus",  min: 320, max: 560, value: 1500, fight: 2.2, size: 1.1,  shape: "squid",  body: "#e88fa8", fin: "#ffd0dd", rarity: 4, glow: "#ffd0dd" },
  { id: "chimaera",  name: "Ghost Shark",    min: 340, max: 580, value: 1900, fight: 3.4, size: 1.5,  shape: "sword",  body: "#8fa8c9", fin: "#c9e0ff", rarity: 4, glow: "#c9e0ff" },
  { id: "frilled",   name: "Frilled Shark",  min: 360, max: 600, value: 2400, fight: 3.8, size: 1.7,  shape: "eel",    body: "#5c5040", fin: "#8f7f60", rarity: 5 },
  { id: "goblin",    name: "Goblin Shark",   min: 380, max: 600, value: 3000, fight: 4.2, size: 1.8,  shape: "fang",   body: "#e8a8b4", fin: "#a86f7c", rarity: 5 },
  // --- Abyssal bosses: below 400 m, and only on the bait that suits them ---
  { id: "colossal",  name: "Colossal Squid", min: 400, max: 600, value: 6000,  fight: 5.5, size: 2.4, shape: "squid", body: "#a83a5c", fin: "#ff8fb4", rarity: 6, boss: true, bait: "chum",   glow: "#ff8fb4" },
  { id: "megamouth", name: "Megamouth",      min: 420, max: 600, value: 7500,  fight: 5.8, size: 2.6, shape: "fang",  body: "#3a4a5c", fin: "#7fb6d8", rarity: 6, boss: true, bait: "krill",  glow: "#7fb6d8" },
  { id: "leviathan", name: "Pale Leviathan", min: 450, max: 600, value: 9500,  fight: 6.4, size: 2.9, shape: "eel",   body: "#d8dce8", fin: "#ffffff", rarity: 6, boss: true, bait: "lure",   glow: "#ffffff" },
  { id: "kraken",    name: "Deep Kraken",    min: 480, max: 600, value: 12000, fight: 7.0, size: 3.1, shape: "squid", body: "#2a1a44", fin: "#a86bff", rarity: 6, boss: true, bait: "chum",   glow: "#a86bff" },
  { id: "seraph",    name: "Abyss Seraph",   min: 500, max: 600, value: 15000, fight: 7.6, size: 2.7, shape: "lamp",  body: "#1a2a4c", fin: "#5ce6ff", rarity: 6, boss: true, bait: "lure",   glow: "#5ce6ff" },
  { id: "titanray",  name: "Titan Ray",      min: 520, max: 600, value: 20000, fight: 8.2, size: 3.4, shape: "ray",   body: "#3a2a1a", fin: "#ffd76a", rarity: 6, boss: true, bait: "krill",  glow: "#ffd76a" },
];

// --- Gear -----------------------------------------------------------------
const GEAR = [
  { id: "line",  name: "Line Strength", desc: "Take more tension before it snaps.", base: 90,  step: 1.5,  unit: "line",  per: 0.24 },
  { id: "reel",  name: "Reel Speed",    desc: "Pull the catch up faster.",          base: 110, step: 1.52, unit: "reel",  per: 0.22 },
  { id: "depth", name: "Line Length",   desc: "Reach deeper water.",                base: 130, step: 1.55, unit: "depth", per: 55 },
  { id: "hook",  name: "Hook Control",  desc: "Steer the falling hook harder.",     base: 100, step: 1.48, unit: "steer", per: 0.26 },
  { id: "sonar", name: "Sonar",         desc: "Shows what is circling below.",      base: 150, step: 1.6,  unit: "sonar", per: 1 },
];
const GEAR_BASE = { line: 1, reel: 1, depth: 130, steer: 1, sonar: 0 };

// Bait shifts which fish bite and is spent one per cast.
const BAITS = [
  { id: "worm",  name: "Worm",   cost: 0,   desc: "Free. Common fish, shallow water.",         bias: 1, tint: "#c98f6a" },
  { id: "krill", name: "Krill",  cost: 40,  desc: "Draws mid-water shoals and one leviathan.",  bias: 2, tint: "#ff9f9f" },
  { id: "chum",  name: "Chum",   cost: 120, desc: "Blood in the water. Big, angry things.",     bias: 3, tint: "#c94a4a" },
  { id: "lure",  name: "Glow Lure", cost: 260, desc: "Only the deep answers a light.",          bias: 4, tint: "#7cf0d0" },
];

const MAX_DEPTH = 600;

export class AbyssAnglerGame extends GameBase {
  getDifficulties() { return ["Charter"]; }
  getInstructions() {
    return [
      "Cast, then steer the falling hook left and right. Jellyfish and drifting debris cut the line — one touch ends the descent.",
      "Let it fall as deep as you dare, then press down (or the reel button) to stop and wait for a bite.",
      "When something takes it, hold to reel. The tension bar climbs while you pull and falls when you let go — fill it and the line snaps.",
      "Every species goes in the log. Six abyssal giants live below 400 m and only take the right bait.",
      "Coins buy line, reel, length, steering and sonar. Better gear is the only way to reach the trench floor.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "Left/right to steer the hook, down to stop, A to reel."; }
  getKeyboardHint() { return "←/→ steer, ↓ stop the descent, hold Space to reel."; }
  getScene() { return "deep"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.angler) custom.angler = { coins: 0, lv: {}, log: {}, bestDepth: 0, bestFish: 0 };
    const a = custom.angler;
    if (typeof a.coins !== "number") a.coins = 0;
    if (!a.lv) a.lv = {};
    if (!a.log) a.log = {};
    if (typeof a.bestDepth !== "number") a.bestDepth = 0;
    if (typeof a.bestFish !== "number") a.bestFish = 0;
    return a;
  }
  _save() { saveManager.saveNow(); }
  _lv(id) { return this._store().lv[id] || 0; }
  _stat(unit) {
    const g = GEAR.find(x => x.unit === unit);
    return GEAR_BASE[unit] + this._lv(g.id) * g.per;
  }
  _cost(g) { return Math.round(g.base * Math.pow(g.step, this._lv(g.id))); }

  // ------------------------------------------------------------- MENUS ---
  getPlayLabel() { return "Head out"; }
  getStartExtras() {
    const a = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `◉ ${formatNumber(a.coins)} coins`),
      el("span", {}, `Log: ${Object.keys(a.log).length}/${FISH.length}`),
      el("span", {}, `Deepest: ${a.bestDepth} m`),
    ]);
  }

  onPlayPressed() { audioManager.play("click"); this.openDock(); }

  /** The dock: gear, bait and the species log all hang off one screen. */
  openDock() {
    const a = this._store();
    const body = el("div", { class: "rig-shop" });
    const head = el("strong", { class: "rig-credits" }, `◉ ${formatNumber(a.coins)} coins`);
    const grid = el("div", { class: "rig-grid" });
    const baitRow = el("div", { class: "bait-row" });

    const render = () => {
      head.textContent = `◉ ${formatNumber(a.coins)} coins`;
      grid.innerHTML = "";
      for (const g of GEAR) {
        const lv = this._lv(g.id), maxed = lv >= 10, cost = this._cost(g);
        grid.appendChild(el("button", {
          class: `rig-card${maxed ? " maxed" : ""}${!maxed && a.coins < cost ? " poor" : ""}`,
          disabled: maxed || a.coins < cost,
          onClick: () => {
            if (maxed || a.coins < cost) return;
            a.coins -= cost; a.lv[g.id] = lv + 1; this._save();
            audioManager.play("powerup"); render();
          },
        }, [
          el("span", { class: "nm" }, g.name),
          el("span", { class: "ds" }, g.desc),
          el("span", { class: "pips" }, [...Array(10)].map((_, i) => el("i", { class: i < lv ? "on" : "" }))),
          el("span", { class: "cost" }, maxed ? "Maxed" : `◉ ${formatNumber(cost)}`),
        ]));
      }
      baitRow.innerHTML = "";
      for (const b of BAITS) {
        const afford = a.coins >= b.cost;
        baitRow.appendChild(el("button", {
          class: `bait-card${this.bait === b.id ? " active" : ""}${afford ? "" : " poor"}`,
          disabled: !afford,
          style: `--bt:${b.tint}`,
          onClick: () => { if (!afford) return; this.bait = b.id; audioManager.play("select"); render(); },
        }, [
          el("span", { class: "sw" }),
          el("span", { class: "nm" }, b.name),
          el("span", { class: "ds" }, b.desc),
          el("span", { class: "cost" }, b.cost ? `◉ ${b.cost}` : "Free"),
        ]));
      }
    };
    this.bait = this.bait || "worm";
    render();
    body.append(
      el("p", { class: "zone-intro" }, "Bait is spent on the cast. Gear is permanent."),
      head,
      el("h4", { class: "dock-h" }, "Bait"), baitRow,
      el("h4", { class: "dock-h" }, "Gear"), grid,
    );
    openModal({
      title: "The Dock",
      bodyNode: body,
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-primary", onClick: () => { closeModal(); this.start(); } }, "Cast off"),
        el("button", { class: "btn btn-ghost", onClick: () => { closeModal(); this.openLog(); } }, "Species log"),
        el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
      ]),
    });
  }

  /** The log: every species, drawn, with the ones you have landed lit up. */
  openLog() {
    const a = this._store();
    const grid = el("div", { class: "fish-grid" });
    for (const f of FISH) {
      const caught = a.log[f.id];
      const card = el("div", { class: `fish-card${caught ? " caught" : ""}${f.boss ? " boss" : ""}` }, [
        el("span", { class: "prev" }),
        el("span", { class: "nm" }, caught ? f.name : "?????"),
        el("span", { class: "st" }, caught
          ? `${caught.n} landed · best ${caught.best} cm`
          : `${f.min}–${f.max} m${f.boss ? ` · ${BAITS.find(b => b.id === f.bait).name}` : ""}`),
      ]);
      const c = el("canvas", { width: 168, height: 96 });
      c.style.cssText = "width:84px;height:48px";
      const cx = c.getContext("2d");
      cx.scale(2, 2);
      cx.translate(42, 24);
      this._paintFish(cx, f, 0, 0.62, caught ? 1 : 0.5);
      if (!caught) {
        cx.globalCompositeOperation = "source-atop";
        cx.fillStyle = "rgba(6,12,24,0.7)";
        cx.fillRect(-42, -24, 84, 48);
      }
      card.querySelector(".prev").appendChild(c);
      grid.appendChild(card);
    }
    openModal({
      title: `Species Log — ${Object.keys(a.log).length}/${FISH.length}`,
      bodyNode: el("div", { class: "fish-log" }, [
        el("p", { class: "zone-intro" }, "Each species is logged the first time you land it, with the biggest one you have brought up."),
        grid,
      ]),
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-primary", onClick: () => { closeModal(); this.openDock(); } }, "Back to the dock"),
      ]),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.input.onKey("Space", () => { this._reelTap = true; });
    this.input.onPointer("down", () => { this._pointerHold = true; });
    this.input.onPointer("up", () => { this._pointerHold = false; });
    this.bait = "worm";
  }

  onStart() {
    const a = this._store();
    const b = BAITS.find(x => x.id === this.bait) || BAITS[0];
    if (a.coins >= b.cost) { a.coins -= b.cost; this._save(); } else { this.bait = "worm"; }

    this.maxLine = this._stat("depth");
    this.phase = "descend";          // descend -> wait -> fight -> reel -> landed
    this.hook = { x: 0.5, y: 0, vx: 0 };
    this.depth = 0;
    this.zoneIdx = 0;
    this.hazards = [];
    this.shoal = [];
    this.motes = [];
    this.bubbles = [];
    this.tension = 0;
    this.caught = null;
    this.haul = [];
    this.coinsRun = 0;
    this.elapsed = 0;
    this.waitT = 0;
    this.message = "";
    this.messageT = 0;
    this._seedMotes();
    this.setScore(0);
    this._updateHud();
  }

  _zoneAt(d) { let z = ZONES[0]; for (const x of ZONES) if (d >= x.from) z = x; return z; }

  _seedMotes() {
    this.motes = [];
    for (let i = 0; i < 60; i++) {
      this.motes.push({ x: Math.random(), y: Math.random(), r: randFloat(0.6, 2.2), s: randFloat(6, 26) });
    }
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.messageT > 0) this.messageT -= dt;

    const left = this.input.isDown("ArrowLeft", "KeyA");
    const right = this.input.isDown("ArrowRight", "KeyD");
    const down = this.input.isDown("ArrowDown", "KeyS");
    const pulling = this.input.isDown("Space", "ArrowUp", "KeyW") || this._pointerHold || this._reelTap;
    this._reelTap = false;

    if (this.phase === "descend") this._stepDescend(dt, left, right, down);
    else if (this.phase === "wait") this._stepWait(dt, pulling);
    else if (this.phase === "fight") this._stepFight(dt, pulling);
    else if (this.phase === "reel") this._stepReel(dt);

    this._stepMotes(dt);
    this.zoneIdx = ZONES.indexOf(this._zoneAt(this.depth));
    this._updateHud();
  }

  _stepDescend(dt, left, right, down) {
    const h = this.hook;
    const steer = this._stat("steer");
    // Falling gets faster with depth, which is what makes the deep water read
    // as dangerous rather than merely far away.
    const fall = 34 + this.depth * 0.055;
    this.depth += fall * dt;

    if (left) h.vx -= 2.1 * steer * dt;
    if (right) h.vx += 2.1 * steer * dt;
    if (!left && !right) h.vx *= Math.pow(0.02, dt);
    h.vx = clamp(h.vx, -1.1, 1.1);
    h.x = clamp(h.x + h.vx * dt, 0.06, 0.94);

    // Hazards rise past the hook; density climbs with depth.
    const rate = 0.9 + this.depth / 150;
    if (Math.random() < rate * dt) {
      const kinds = this.depth > 240 ? ["jelly", "debris", "jelly"] : ["jelly", "debris"];
      this.hazards.push({
        kind: choice(kinds), x: randFloat(0.08, 0.92), y: 1.15,
        r: randFloat(0.03, 0.055), drift: randFloat(-0.09, 0.09), phase: randFloat(0, 7),
      });
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const z = this.hazards[i];
      z.y -= (fall / 460) * dt * 1.0;
      z.x = clamp(z.x + Math.sin(this.elapsed * 1.4 + z.phase) * z.drift * dt, 0.04, 0.96);
      if (z.y < -0.2) { this.hazards.splice(i, 1); continue; }
      const dx = (z.x - h.x), dy = (z.y - 0.42);
      if (Math.hypot(dx * 1.1, dy) < z.r + 0.028) {
        this._snap(z.kind === "jelly" ? "A jellyfish wrapped the line." : "Debris cut the line clean.");
        return;
      }
    }

    if (down || this.depth >= this.maxLine) {
      this.depth = Math.min(this.depth, this.maxLine);
      this.phase = "wait";
      // Drift that is still on screen would otherwise hang frozen around the
      // hook for the whole wait, reading as a threat that cannot act.
      this.hazards = [];
      this.waitT = 0;
      this._spawnShoal();
      this._say(this.depth >= this.maxLine ? "End of the line — waiting" : "Waiting for a bite");
    }
  }

  /**
   * Picks what is circling down there. Bait bias shifts the roll toward the
   * rarer end, and a boss only shows up on its own bait at its own depth.
   */
  _spawnShoal() {
    const b = BAITS.find(x => x.id === this.bait) || BAITS[0];
    const pool = FISH.filter(f => this.depth >= f.min && this.depth <= f.max &&
                                  (!f.boss || f.bait === this.bait));
    this.shoal = [];
    const n = 3 + Math.min(3, Math.floor(this.depth / 180));
    for (let i = 0; i < n; i++) {
      // Weight by rarity against the bait: better bait makes rare rolls likely.
      const weighted = pool.map(f => ({ f, w: Math.pow(b.bias, f.rarity - 1) / Math.pow(2.4, f.rarity - 1) }));
      const total = weighted.reduce((s, x) => s + x.w, 0);
      let roll = Math.random() * total, pick = weighted[0]?.f;
      for (const x of weighted) { if (roll < x.w) { pick = x.f; break; } roll -= x.w; }
      if (!pick) continue;
      this.shoal.push({
        spec: pick, x: randFloat(0.1, 0.9), y: randFloat(0.52, 0.86),
        dir: Math.random() < 0.5 ? -1 : 1, t: randFloat(0, 7), speed: randFloat(0.05, 0.14),
        interest: 0,
      });
    }
  }

  _stepWait(dt, pulling) {
    this.waitT += dt;
    let biter = null;
    for (const s of this.shoal) {
      s.t += dt;
      // Circle, then close on the hook once curious enough.
      const towards = s.interest > 0.5;
      const tx = towards ? this.hook.x : s.x + s.dir * s.speed * dt;
      s.x = clamp(s.x + (tx - s.x) * (towards ? dt * 1.6 : 1), 0.06, 0.94);
      s.y += Math.sin(s.t * 1.3) * 0.02 * dt + (towards ? (0.42 - s.y) * dt * 1.2 : 0);
      if (s.x <= 0.07 || s.x >= 0.93) s.dir *= -1;
      s.interest += dt * (0.10 + (1 - Math.min(1, Math.abs(s.x - this.hook.x) * 4)) * 0.55) / s.spec.fight;
      if (s.interest > 1.6 && Math.abs(s.y - 0.42) < 0.05 && Math.abs(s.x - this.hook.x) < 0.06) biter = s;
    }
    if (biter) {
      this.caught = { spec: biter.spec, cm: this._sizeOf(biter.spec), progress: 0, mood: 0, phase: 0 };
      this.shoal = this.shoal.filter(s => s !== biter);
      this.phase = "fight";
      this.tension = 0.18;
      audioManager.play("powerup");
      this._say(`${biter.spec.name}!`);
      this.shake();
    }
    // Nothing biting after a while: the shoal moves on and you reel up empty.
    if (this.waitT > 26) { this._reelEmpty("Nothing is interested. Reeling up."); }
  }

  _sizeOf(spec) {
    // Length in centimetres, log-normal-ish around the species' size class.
    const base = 18 + spec.size * 90;
    return Math.round(base * randFloat(0.72, 1.38));
  }

  /**
   * The fight. Pulling raises tension and reels the fish in; letting go bleeds
   * tension but the fish takes line back. A fish also lunges on its own cycle,
   * so the read is on the fish rather than on a fixed rhythm.
   */
  _stepFight(dt, pulling) {
    const c = this.caught;
    const lineStr = this._stat("line");
    const reel = this._stat("reel");
    c.phase += dt * (1.1 + c.spec.fight * 0.22);
    // Mood: a slow surge that peaks and fades. Pulling into a surge is what
    // snaps the line, and the fish's body language telegraphs it.
    c.mood = Math.max(0, Math.sin(c.phase) ) * c.spec.fight;

    if (pulling) {
      c.progress += reel * 0.19 * dt;
      this.tension += (0.30 + c.mood * 0.42) / lineStr * dt;
      if (Math.random() < 0.5) this._bubble();
    } else {
      c.progress -= (0.05 + c.mood * 0.08) * dt;
      this.tension -= 0.55 * dt;
    }
    c.progress = clamp(c.progress, 0, 1);
    this.tension = clamp(this.tension, 0, 1.25);

    if (this.tension >= 1) { this._snap(`The line parted. The ${c.spec.name} is gone.`); return; }
    if (c.progress >= 1) {
      this.phase = "reel";
      this._say(`Landed a ${c.cm} cm ${c.spec.name}`);
      audioManager.play("win");
    }
  }

  _stepReel(dt) {
    this.depth -= (140 + this._stat("reel") * 60) * dt;
    if (this.depth <= 0) {
      this.depth = 0;
      this._land();
    }
  }

  _reelEmpty(msg) {
    this._say(msg);
    this.caught = null;
    this.phase = "reel";
  }

  /** A catch reaches the boat: bank it, log it, and offer the next cast. */
  _land() {
    const a = this._store();
    if (this.caught) {
      const spec = this.caught.spec;
      const cm = this.caught.cm;
      // Value scales with how big this individual is, so a record fish pays.
      const worth = Math.round(spec.value * (0.6 + cm / (18 + spec.size * 90) * 0.6));
      this.coinsRun += worth;
      a.coins += worth;
      const entry = a.log[spec.id] || { n: 0, best: 0 };
      entry.n += 1;
      entry.best = Math.max(entry.best, cm);
      a.log[spec.id] = entry;
      if (a.bestFish < worth) a.bestFish = worth;
      this.haul.push({ spec, cm, worth });
      this.addScore(worth);
    }
    if (a.bestDepth < Math.round(this.maxReached || 0)) a.bestDepth = Math.round(this.maxReached || 0);
    this._save();
    this._finish();
  }

  _snap(reason) {
    this._say(reason, true);
    audioManager.play("gameover");
    this.shake();
    const a = this._store();
    if (a.bestDepth < Math.round(this.maxReached || this.depth)) a.bestDepth = Math.round(this.maxReached || this.depth);
    this._save();
    this._finish(reason);
  }

  _finish(lossReason) {
    const a = this._store();
    const logged = Object.keys(a.log).length;
    const c = this.caught;
    this.endGame({
      result: lossReason ? "loss" : "win",
      score: this.coinsRun,
      message: lossReason
        ? `${lossReason} You reached ${Math.round(this.depth)} m.`
        : c ? `A ${c.cm} cm ${c.spec.name} from ${Math.round(this.maxReached || 0)} m.`
            : "Back at the surface with an empty hook.",
      extraStats: [
        { label: "Depth", value: `${Math.round(this.maxReached || this.depth)} m` },
        { label: "Zone", value: this._zoneAt(this.maxReached || this.depth).name },
        { label: "Log", value: `${logged}/${FISH.length}` },
      ],
    });
  }

  _say(text, bad = false) { this.message = text; this.messageBad = bad; this.messageT = 2.4; }
  _bubble() {
    this.bubbles.push({ x: this.hook.x + randFloat(-0.03, 0.03), y: 0.42, r: randFloat(1.5, 4), t: 0 });
  }
  _stepMotes(dt) {
    this.maxReached = Math.max(this.maxReached || 0, this.depth);
    for (const m of this.motes) {
      m.y -= (m.s / 900) * dt * (this.phase === "reel" ? 6 : 1);
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt; b.y -= 0.22 * dt;
      if (b.t > 1.4) this.bubbles.splice(i, 1);
    }
  }

  _updateHud() {
    this.setHud({
      Coins: `◉ ${formatNumber(this.coinsRun)}`,
      Depth: `${Math.round(this.depth)} m`,
      Line: `${Math.round(this.maxLine)} m`,
      Zone: `${ZONES.indexOf(this._zoneAt(this.depth)) + 1}/${ZONES.length}`,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawWater(ctx, W, H);
    this._drawMotes(ctx, W, H);
    if (this._zoneAt(this.depth).weed) this._drawWeed(ctx, W, H);
    this._drawLine(ctx, W, H);
    this._drawShoal(ctx, W, H);
    this._drawHazards(ctx, W, H);
    this._drawHook(ctx, W, H);
    this._drawBubbles(ctx, W, H);
    this._drawUI(ctx, W, H);

    ctx.restore();
  }

  /** Water colour blends between the two zones the hook sits between. */
  _drawWater(ctx, W, H) {
    const d = this.depth;
    const zi = ZONES.indexOf(this._zoneAt(d));
    const next = ZONES[Math.min(ZONES.length - 1, zi + 1)];
    const cur = ZONES[zi];
    const span = next.from - cur.from || 1;
    const t = clamp((d - cur.from) / span, 0, 1);
    const mix = (a, b) => blend(a, b, t);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(cur.water[0], next.water[0]));
    g.addColorStop(1, mix(cur.water[1], next.water[1]));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun shafts, only near the surface.
    const sun = clamp(1 - d / 110, 0, 1);
    if (sun > 0.01) {
      ctx.save();
      ctx.globalAlpha = sun * 0.16;
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const x = W * (0.1 + i * 0.2) + Math.sin(this.elapsed * 0.4 + i) * 18;
        ctx.beginPath();
        ctx.moveTo(x - 16, 0); ctx.lineTo(x + 16, 0);
        ctx.lineTo(x + 52, H); ctx.lineTo(x + 8, H);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // The surface itself, drawn only while it is in view.
    if (d < 40) {
      const y = (1 - d / 40) * 46 - 6;
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const yy = y + Math.sin(x * 0.05 + this.elapsed * 2) * 4;
        x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  _drawMotes(ctx, W, H) {
    const z = this._zoneAt(this.depth);
    ctx.fillStyle = z.mote;
    for (const m of this.motes) {
      ctx.globalAlpha = 0.16 + m.r * 0.1;
      ctx.beginPath(); ctx.arc(m.x * W, m.y * H, m.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawWeed(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = "rgba(30,90,60,0.5)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    for (let i = 0; i < 7; i++) {
      const x = (i / 6) * W + Math.sin(i * 3) * 20;
      ctx.beginPath();
      ctx.moveTo(x, H);
      for (let k = 1; k <= 5; k++) {
        const y = H - k * (H / 7);
        ctx.lineTo(x + Math.sin(this.elapsed * 0.9 + i + k * 0.6) * k * 4, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** The line from the boat down to the hook, with a little sway. */
  _drawLine(ctx, W, H) {
    const hx = this.hook.x * W, hy = H * 0.42;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, -10);
    ctx.quadraticCurveTo((W * 0.5 + hx) / 2 + Math.sin(this.elapsed) * 8, hy * 0.5, hx, hy);
    ctx.stroke();
  }

  _drawHook(ctx, W, H) {
    const x = this.hook.x * W, y = H * 0.42;
    const b = BAITS.find(v => v.id === this.bait) || BAITS[0];
    ctx.save();
    ctx.translate(x, y);
    // Bait blob on the hook, tinted per type, with a glow for the lure.
    if (this.bait === "lure") {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      g.addColorStop(0, "rgba(124,240,208,0.8)"); g.addColorStop(1, "rgba(124,240,208,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = "#e6eaf5"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(0, 2);
    ctx.arc(0, 4, 5, -Math.PI / 2, Math.PI * 0.85);
    ctx.stroke();
    ctx.fillStyle = b.tint;
    ctx.beginPath(); ctx.arc(1, 3, 4.5, 0, 7); ctx.fill();
    ctx.restore();

    // Sonar sweep: shows the shoal's rough positions before they commit.
    if (this._stat("sonar") > 0 && this.phase === "wait") {
      const r = ((this.elapsed * 90) % 220);
      ctx.strokeStyle = `rgba(124,240,208,${Math.max(0, 0.35 - r / 700)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    }
  }

  _drawShoal(ctx, W, H) {
    for (const s of this.shoal) {
      ctx.save();
      ctx.translate(s.x * W, s.y * H);
      const dir = s.interest > 0.5 ? Math.sign(this.hook.x - s.x) || 1 : s.dir;
      ctx.scale(dir, 1);
      this._paintFish(ctx, s.spec, s.t, 1, this._stat("sonar") > 0 || this.depth < 200 ? 1 : 0.55);
      ctx.restore();
    }
    // The hooked fish, drawn large and fighting.
    const c = this.caught;
    if (c && (this.phase === "fight" || this.phase === "reel")) {
      const y = H * (this.phase === "reel" ? 0.42 : 0.62 - c.progress * 0.16);
      ctx.save();
      ctx.translate(W * 0.5, y);
      ctx.rotate(Math.sin(c.phase * 3) * 0.16 * (1 + c.mood));
      this._paintFish(ctx, c.spec, this.elapsed * 3, 1.5, 1);
      ctx.restore();
    }
  }

  _drawHazards(ctx, W, H) {
    for (const z of this.hazards) {
      const x = z.x * W, y = z.y * H, r = z.r * H;
      if (z.kind === "jelly") {
        const g = ctx.createRadialGradient(x, y - r * 0.2, 1, x, y, r * 1.5);
        g.addColorStop(0, "rgba(220,180,255,0.55)");
        g.addColorStop(1, "rgba(160,110,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(214,180,255,0.85)";
        ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "rgba(214,180,255,0.6)"; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * r * 0.34, y);
          ctx.quadraticCurveTo(x + i * r * 0.34 + Math.sin(this.elapsed * 3 + i) * 6, y + r * 1.1,
                               x + i * r * 0.34 + Math.sin(this.elapsed * 3 + i) * 3, y + r * 1.8);
          ctx.stroke();
        }
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.elapsed * 0.6 + z.phase);
        ctx.fillStyle = "#5c5040";
        ctx.fillRect(-r, -r * 0.34, r * 2, r * 0.68);
        ctx.fillStyle = "#3a3228";
        ctx.fillRect(-r, -r * 0.34, r * 2, r * 0.2);
        ctx.restore();
      }
    }
  }

  _drawBubbles(ctx, W, H) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    for (const b of this.bubbles) {
      ctx.globalAlpha = Math.max(0, 1 - b.t / 1.4);
      ctx.beginPath(); ctx.arc(b.x * W, b.y * H, b.r, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * One routine draws every species: a body silhouette chosen by `shape`,
   * then fins, an eye and — for the deep ones — a bioluminescent glow.
   */
  _paintFish(ctx, spec, t, scale = 1, alpha = 1) {
    const L = 26 * spec.size * scale;
    const Hh = L * 0.46;
    ctx.save();
    ctx.globalAlpha = alpha;
    const wag = Math.sin(t * 4) * 0.22;

    if (spec.glow) {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, L * 1.6);
      g.addColorStop(0, hexA(spec.glow, 0.4 * alpha));
      g.addColorStop(1, hexA(spec.glow, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, L * 1.6, 0, 7); ctx.fill();
    }

    // Tail.
    ctx.save();
    ctx.translate(-L * 0.9, 0);
    ctx.rotate(wag);
    ctx.fillStyle = spec.fin;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-L * 0.45, -Hh * 0.85);
    ctx.lineTo(-L * 0.28, 0);
    ctx.lineTo(-L * 0.45, Hh * 0.85);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // Body.
    ctx.fillStyle = spec.body;
    ctx.beginPath();
    if (spec.shape === "slim") {
      ctx.ellipse(0, 0, L, Hh * 0.62, 0, 0, 7);
    } else if (spec.shape === "round") {
      ctx.ellipse(0, 0, L * 0.88, Hh, 0, 0, 7);
    } else if (spec.shape === "puffer") {
      ctx.arc(0, 0, Hh * 1.05, 0, 7);
    } else if (spec.shape === "eel") {
      ctx.moveTo(-L, 0);
      for (let i = 0; i <= 10; i++) {
        const p = i / 10;
        ctx.lineTo(-L + p * L * 2, Math.sin(t * 3 + p * 5) * Hh * 0.35 - Hh * 0.22);
      }
      for (let i = 10; i >= 0; i--) {
        const p = i / 10;
        ctx.lineTo(-L + p * L * 2, Math.sin(t * 3 + p * 5) * Hh * 0.35 + Hh * 0.22);
      }
    } else if (spec.shape === "ray") {
      ctx.moveTo(L * 0.9, 0);
      ctx.quadraticCurveTo(0, -Hh * 1.7, -L * 0.9, 0);
      ctx.quadraticCurveTo(0, Hh * 1.7, L * 0.9, 0);
    } else if (spec.shape === "squid") {
      ctx.ellipse(L * 0.2, 0, L * 0.7, Hh * 0.8, 0, 0, 7);
    } else if (spec.shape === "sword") {
      ctx.moveTo(L * 1.5, 0);
      ctx.lineTo(L * 0.55, -Hh * 0.5);
      ctx.lineTo(-L * 0.9, -Hh * 0.4);
      ctx.lineTo(-L * 0.9, Hh * 0.4);
      ctx.lineTo(L * 0.55, Hh * 0.5);
    } else if (spec.shape === "fang" || spec.shape === "lamp") {
      ctx.ellipse(0, 0, L * 0.9, Hh * 0.9, 0, 0, 7);
    }
    ctx.closePath();
    ctx.fill();

    // Squid arms trail behind the mantle.
    if (spec.shape === "squid") {
      ctx.strokeStyle = spec.fin; ctx.lineWidth = Math.max(1.4, L * 0.09); ctx.lineCap = "round";
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-L * 0.4, i * Hh * 0.22);
        ctx.quadraticCurveTo(-L * 0.9, i * Hh * 0.3 + Math.sin(t * 3 + i) * 5,
                             -L * 1.5, i * Hh * 0.5 + Math.sin(t * 3 + i) * 8);
        ctx.stroke();
      }
    }
    // Dorsal fin.
    if (spec.shape !== "ray" && spec.shape !== "squid") {
      ctx.fillStyle = spec.fin;
      ctx.beginPath();
      ctx.moveTo(-L * 0.2, -Hh * 0.6);
      ctx.lineTo(L * 0.15, -Hh * 1.25);
      ctx.lineTo(L * 0.3, -Hh * 0.55);
      ctx.closePath(); ctx.fill();
    }
    // Anglerfish lure on a stalk.
    if (spec.shape === "lamp") {
      ctx.strokeStyle = spec.fin; ctx.lineWidth = Math.max(1.2, L * 0.07);
      ctx.beginPath();
      ctx.moveTo(L * 0.4, -Hh * 0.7);
      ctx.quadraticCurveTo(L * 1.1, -Hh * 1.9, L * 0.85, -Hh * 2.1);
      ctx.stroke();
      ctx.fillStyle = spec.fin;
      ctx.beginPath(); ctx.arc(L * 0.85, -Hh * 2.1, Math.max(2, L * 0.14), 0, 7); ctx.fill();
    }
    // Teeth.
    if (spec.shape === "fang" || spec.shape === "lamp") {
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 4; i++) {
        const x = L * (0.4 + i * 0.13);
        ctx.beginPath();
        ctx.moveTo(x, Hh * 0.1); ctx.lineTo(x + L * 0.05, Hh * 0.42); ctx.lineTo(x + L * 0.1, Hh * 0.1);
        ctx.closePath(); ctx.fill();
      }
    }
    // Eye.
    if (spec.shape !== "squid") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(L * 0.5, -Hh * 0.22, Math.max(1.6, L * 0.12), 0, 7); ctx.fill();
      ctx.fillStyle = "#0b0a12";
      ctx.beginPath(); ctx.arc(L * 0.53, -Hh * 0.22, Math.max(0.9, L * 0.06), 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  /** Depth ruler, tension bar and the current message. */
  _drawUI(ctx, W, H) {
    // Depth ruler down the right edge.
    const top = 16, bot = H - 16;
    ctx.fillStyle = "rgba(8,14,26,0.5)";
    roundRect(ctx, W - 26, top, 12, bot - top, 6); ctx.fill();
    for (const z of ZONES) {
      const y = top + (z.from / MAX_DEPTH) * (bot - top);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(W - 26, y, 12, 1.5);
    }
    // Where the line runs out.
    const ly = top + (this.maxLine / MAX_DEPTH) * (bot - top);
    ctx.fillStyle = "#ff5470";
    ctx.fillRect(W - 30, ly - 1, 20, 2);
    const dy = top + (clamp(this.depth, 0, MAX_DEPTH) / MAX_DEPTH) * (bot - top);
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath(); ctx.arc(W - 20, dy, 5, 0, 7); ctx.fill();

    // Tension bar during the fight.
    if (this.phase === "fight") {
      const bw = Math.min(280, W * 0.6), bh = 14, x = (W - bw) / 2, y = H - 54;
      ctx.fillStyle = "rgba(8,14,26,0.7)";
      roundRect(ctx, x, y, bw, bh, 7); ctx.fill();
      const danger = this.tension > 0.75;
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, "#2ee6a6"); g.addColorStop(0.7, "#ffd76a"); g.addColorStop(1, "#ff5470");
      ctx.fillStyle = g;
      roundRect(ctx, x + 1, y + 1, Math.max(0, (bw - 2) * clamp(this.tension, 0, 1)), bh - 2, 6); ctx.fill();
      if (danger) {
        ctx.strokeStyle = `rgba(255,84,112,${0.4 + Math.sin(this.elapsed * 18) * 0.35})`;
        ctx.lineWidth = 2.5;
        roundRect(ctx, x, y, bw, bh, 7); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "700 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("LINE TENSION", x, y - 5);
      // Catch progress.
      ctx.fillStyle = "rgba(8,14,26,0.7)";
      roundRect(ctx, x, y + 22, bw, 8, 4); ctx.fill();
      ctx.fillStyle = "#22d3ee";
      roundRect(ctx, x + 1, y + 23, Math.max(0, (bw - 2) * this.caught.progress), 6, 3); ctx.fill();
    }

    if (this.messageT > 0) {
      ctx.textAlign = "center";
      ctx.globalAlpha = Math.min(1, this.messageT / 0.5);
      ctx.fillStyle = this.messageBad ? "#ff8fa0" : "#ffffff";
      ctx.font = "800 17px 'Sora', system-ui, sans-serif";
      ctx.fillText(this.message, W / 2, H * 0.16);
      ctx.globalAlpha = 1;
    }
    if (this.phase === "descend") {
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(this.elapsed * 3) * 0.22})`;
      ctx.font = "700 12px 'Inter', system-ui, sans-serif";
      ctx.fillText(this.useTouch ? "Steer past the drift · down to stop" : "← → steer · ↓ stop the descent", W / 2, H - 18);
    } else if (this.phase === "fight") {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "700 12px 'Inter', system-ui, sans-serif";
      ctx.fillText(this.useTouch ? "Hold A to reel · let go when it surges" : "Hold Space to reel · let go when it surges", W / 2, H - 18);
    }
  }
}

/** #rrggbb -> rgba() at the given alpha. */
function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function blend(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
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

export default AbyssAnglerGame;
