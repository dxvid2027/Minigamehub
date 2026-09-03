// ==========================================================================
// Deep Delve — a drill rig, a shaft, and everything you can carry back up.
//
// The loop: dig down through seven strata, fill the cargo hold with ore,
// and get back to the surface before the fuel runs out or the hull gives.
// Sell what you brought up, spend the credits on the rig, go deeper.
//
// The tension is entirely in the return trip. Ore gets richer the deeper you
// go, but so does the climb home, and thrusters burn fuel far faster than
// the drill does. Every run is a bet on how much further you can push.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, seededRng } from "../core/utils.js";

const TILE = 40;              // world units; the camera scales this to fit
const COLS = 14;
const SURFACE_ROWS = 3;       // sky + depot above the dirt line
const WORLD_ROWS = 460;       // ~11 000 units of shaft

// --- Strata ---------------------------------------------------------------
// Each band owns its rock colours, how hard it is to drill, which ores appear
// (weighted) and which hazards. Depth is measured in metres = rows.
const STRATA = [
  {
    name: "Topsoil", from: 0, rock: "#6b4a2f", rock2: "#54371f", grain: "#7d5a3a",
    hardness: 1, ores: { copper: 40, iron: 14 }, hazard: null, density: 0.11,
  },
  {
    name: "Clay Beds", from: 34, rock: "#8a5c3c", rock2: "#6a4229", grain: "#9c6d48",
    hardness: 1.35, ores: { copper: 30, iron: 34, silver: 6 }, hazard: "gas", density: 0.125,
  },
  {
    name: "Granite Shelf", from: 84, rock: "#5c5f70", rock2: "#42465a", grain: "#6d7183",
    hardness: 2.1, ores: { iron: 34, silver: 22, gold: 7 }, hazard: "gas", density: 0.14,
  },
  {
    name: "Basalt Deep", from: 150, rock: "#3d3a4c", rock2: "#2a2837", grain: "#4c485e",
    hardness: 3.0, ores: { silver: 26, gold: 20, crystal: 8 }, hazard: "lava", density: 0.155,
  },
  {
    name: "Magma Shelf", from: 230, rock: "#5a2a24", rock2: "#3d1a17", grain: "#6d3730",
    hardness: 4.1, ores: { gold: 26, crystal: 18, obsidian: 8 }, hazard: "lava", density: 0.17,
  },
  {
    name: "Crystal Deep", from: 320, rock: "#2a3a5c", rock2: "#1c2842", grain: "#37496f",
    hardness: 5.4, ores: { crystal: 30, obsidian: 20, voidstone: 7 }, hazard: "gas", density: 0.185,
  },
  {
    name: "The Void Layer", from: 400, rock: "#241a38", rock2: "#170f26", grain: "#31234a",
    hardness: 7.0, ores: { obsidian: 26, voidstone: 24 }, hazard: "lava", density: 0.2,
  },
];

// --- Ores -----------------------------------------------------------------
const ORES = {
  copper:    { name: "Copper",    color: "#e08a4a", edge: "#ffb877", value: 9,    mass: 1 },
  iron:      { name: "Iron",      color: "#b8bcc9", edge: "#e6eaf5", value: 22,   mass: 1 },
  silver:    { name: "Silver",    color: "#dfe6f2", edge: "#ffffff", value: 55,   mass: 1 },
  gold:      { name: "Gold",      color: "#ffcf4a", edge: "#fff0ad", value: 130,  mass: 2 },
  crystal:   { name: "Crystal",   color: "#5ce6ff", edge: "#c9f7ff", value: 300,  mass: 2 },
  obsidian:  { name: "Obsidian",  color: "#7c5cff", edge: "#c9b6ff", value: 700,  mass: 3 },
  voidstone: { name: "Voidstone", color: "#ff4fd8", edge: "#ffc2f2", value: 1600, mass: 3 },
};

// --- Rig upgrades ---------------------------------------------------------
// Ten levels each. Costs climb ~55% a level, so the late tiers are a real
// commitment rather than something you buy on the way past.
const UPGRADES = [
  { id: "drill",  name: "Drill Head",   desc: "Cuts through rock faster.",           base: 240,  step: 1.55, unit: "speed",  per: 0.34 },
  { id: "tank",   name: "Fuel Tank",    desc: "More fuel means a deeper run.",       base: 200,  step: 1.52, unit: "fuel",   per: 26 },
  { id: "hull",   name: "Hull Plating", desc: "Survives longer falls and lava.",     base: 260,  step: 1.58, unit: "hull",   per: 22 },
  { id: "cargo",  name: "Cargo Hold",   desc: "Carry more ore per trip.",            base: 220,  step: 1.5,  unit: "slots",  per: 6 },
  { id: "thrust", name: "Thrusters",    desc: "Climb faster and burn less doing it.", base: 300, step: 1.6,  unit: "lift",   per: 0.22 },
  { id: "lamp",   name: "Lamp Array",   desc: "Lights more of the shaft around you.", base: 180, step: 1.45, unit: "light",  per: 1.5 },
];

const BASE = { speed: 1, fuel: 100, hull: 100, slots: 12, lift: 1, light: 5 };

// Hazard pockets are the reason a run ends badly rather than slowly.
const HAZARDS = {
  gas:  { color: "#9ce86a", damage: 0, fuelBurn: 22, name: "gas pocket" },
  lava: { color: "#ff6b28", damage: 46, fuelBurn: 0, name: "lava" },
};

export class DeepDelveGame extends GameBase {
  getDifficulties() { return ["Expedition"]; }
  getInstructions() {
    return [
      "Drive the rig left and right along the ground; press down to drill into the rock beneath you.",
      "Hold up to fire the thrusters and climb. Thrusters burn fuel far faster than the drill does.",
      "Ore fills the cargo hold. Fly back to the depot on the surface to sell it — ore you are still carrying when the run ends is lost.",
      "Green gas pockets burn fuel. Lava tears the hull apart. Long falls hurt too, so ride the thrusters down the deep shafts.",
      "Credits buy permanent rig upgrades between runs. Seven strata lie below, and the ore gets far richer as you go.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "D-pad to drive and drill, up to thrust. A sells at the depot."; }
  getKeyboardHint() { return "Arrows / WASD to drive and drill, Up or Space to thrust."; }
  getScene() { return "ember"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.rig) custom.rig = { credits: 0, lv: {}, bestDepth: 0, bestRun: 0, totalOre: 0 };
    const r = custom.rig;
    if (typeof r.credits !== "number") r.credits = 0;
    if (!r.lv) r.lv = {};
    if (typeof r.bestDepth !== "number") r.bestDepth = 0;
    if (typeof r.bestRun !== "number") r.bestRun = 0;
    if (typeof r.totalOre !== "number") r.totalOre = 0;
    return r;
  }
  _save() { saveManager.saveNow(); }

  _lv(id) { return this._store().lv[id] || 0; }
  _stat(unit) {
    const u = UPGRADES.find(x => x.unit === unit);
    return BASE[unit] + this._lv(u.id) * u.per;
  }
  _cost(u) { return Math.round(u.base * Math.pow(u.step, this._lv(u.id))); }

  // ------------------------------------------------------------- MENUS ---
  getPlayLabel() { return "Head to the shaft"; }

  getStartExtras() {
    const r = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `◆ ${formatNumber(r.credits)} credits`),
      el("span", {}, `Deepest: ${r.bestDepth} m`),
      el("span", {}, `Best haul: ◆ ${formatNumber(r.bestRun)}`),
    ]);
  }

  onPlayPressed() {
    audioManager.play("click");
    this.openGarage(() => this.start());
  }

  /** The garage: spend credits on the rig before dropping down the shaft. */
  openGarage(onGo) {
    const r = this._store();
    const grid = el("div", { class: "rig-grid" });
    const render = () => {
      grid.innerHTML = "";
      for (const u of UPGRADES) {
        const lv = this._lv(u.id);
        const maxed = lv >= 10;
        const cost = this._cost(u);
        const afford = r.credits >= cost;
        const card = el("button", {
          class: `rig-card${maxed ? " maxed" : ""}${!maxed && !afford ? " poor" : ""}`,
          disabled: maxed || !afford,
          onClick: () => {
            if (maxed || r.credits < cost) return;
            r.credits -= cost;
            r.lv[u.id] = lv + 1;
            this._save();
            audioManager.play("powerup");
            render();
            head.textContent = `◆ ${formatNumber(r.credits)} credits`;
          },
        }, [
          el("span", { class: "nm" }, u.name),
          el("span", { class: "ds" }, u.desc),
          el("span", { class: "pips" }, [...Array(10)].map((_, i) =>
            el("i", { class: i < lv ? "on" : "" }))),
          el("span", { class: "cost" }, maxed ? "Maxed" : `◆ ${formatNumber(cost)}`),
        ]);
        grid.appendChild(card);
      }
    };
    const head = el("strong", { class: "rig-credits" }, `◆ ${formatNumber(r.credits)} credits`);
    render();
    openModal({
      title: "The Garage",
      bodyNode: el("div", { class: "rig-shop" }, [
        el("p", { class: "zone-intro" }, "Upgrades are permanent. Credits come from ore you actually carried back to the depot."),
        head,
        grid,
      ]),
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-primary", onClick: () => { closeModal(); onGo(); } }, "Drop the rig"),
        el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
      ]),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.input.onKey("Space", () => { this._thrustKey = true; });
    this.input.onKey("KeyE", () => this._tryDepot());
    this.input.onKey("Enter", () => this._tryDepot());
    this._thrustKey = false;
  }

  onResize() { this._sky = null; }

  onStart() {
    this._buildWorld();

    const maxFuel = this._stat("fuel");
    const maxHull = this._stat("hull");
    this.rig = {
      x: (COLS / 2) * TILE + TILE / 2,
      y: (SURFACE_ROWS - 0.5) * TILE,
      vx: 0, vy: 0,
      facing: 1, drillSpin: 0, drilling: null, thrusting: false,
      onGround: false, fallFrom: null,
    };
    this.fuel = maxFuel; this.maxFuel = maxFuel;
    this.hull = maxHull; this.maxHull = maxHull;
    this.slots = Math.round(this._stat("slots"));
    this.cargo = {};
    this.cargoMass = 0;
    this.credits = 0;              // earned this run, banked at the depot
    this.depth = 0;
    this.maxDepth = 0;
    this.dust = [];
    this.floaters = [];
    this.shakeT = 0;
    this.camY = 0;
    this.elapsed = 0;
    this._sky = null;
    this._warned = 0;
    this.setScore(0);
    this._updateHud();
  }

  /**
   * Builds the shaft. Ore and hazards are placed per row from the stratum's
   * own table, and a seeded generator keeps a run reproducible while it lasts
   * (the seed changes every run, so no two expeditions share a map).
   */
  _buildWorld() {
    const rng = seededRng(`delve-${Date.now()}-${Math.random()}`);
    const rows = WORLD_ROWS + SURFACE_ROWS;
    this.grid = new Array(rows * COLS).fill(0);   // 0 = air
    this.tileData = new Map();                    // idx -> { ore } | { hazard }

    for (let y = SURFACE_ROWS; y < rows; y++) {
      const depth = y - SURFACE_ROWS;
      const st = this._stratumAt(depth);
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        this.grid[i] = 1;                          // rock

        // Caves: a scattering of open pockets that get more common with depth
        // so the deep shaft reads as broken rather than uniform.
        if (rng() < 0.035 + Math.min(0.05, depth / 9000)) { this.grid[i] = 0; continue; }

        // Ore.
        if (rng() < st.density) {
          const total = Object.values(st.ores).reduce((a, b) => a + b, 0);
          let roll = rng() * total;
          let picked = null;
          for (const [ore, w] of Object.entries(st.ores)) {
            if (roll < w) { picked = ore; break; }
            roll -= w;
          }
          if (picked) { this.grid[i] = 2; this.tileData.set(i, { ore: picked }); continue; }
        }

        // Hazards.
        if (st.hazard && rng() < 0.022 + depth / 40000) {
          this.grid[i] = 3;
          this.tileData.set(i, { hazard: st.hazard });
        }
      }
    }
    // The depot sits on the surface; clear a landing pad around it.
    this.depotX = Math.floor(COLS / 2);
    for (let x = this.depotX - 2; x <= this.depotX + 2; x++) {
      for (let y = 0; y < SURFACE_ROWS; y++) this.grid[y * COLS + x] = 0;
    }
    this.rows = rows;
  }

  _stratumAt(depth) {
    let s = STRATA[0];
    for (const st of STRATA) if (depth >= st.from) s = st;
    return s;
  }

  _tile(cx, cy) {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= this.rows) return 1;   // walls are solid
    return this.grid[cy * COLS + cx];
  }
  _solid(cx, cy) { const t = this._tile(cx, cy); return t === 1 || t === 2; }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    const r = this.rig;
    const cx = Math.floor(r.x / TILE), cy = Math.floor(r.y / TILE);

    const left = this.input.isDown("ArrowLeft", "KeyA");
    const right = this.input.isDown("ArrowRight", "KeyD");
    const down = this.input.isDown("ArrowDown", "KeyS");
    const up = this.input.isDown("ArrowUp", "KeyW") || this.input.isDown("Space") || this._thrustKey;
    this._thrustKey = false;

    // --- thrust ------------------------------------------------------
    const lift = this._stat("lift");
    r.thrusting = false;
    if (up && this.fuel > 0) {
      r.vy -= 1150 * lift * dt;
      this.fuel = Math.max(0, this.fuel - 9.5 * dt);
      r.thrusting = true;
      if (Math.random() < 0.6) this._puff(r.x, r.y + 14, "#ffb877");
    }

    // --- horizontal --------------------------------------------------
    const accel = r.onGround ? 1500 : 620;
    if (left) { r.vx -= accel * dt; r.facing = -1; }
    if (right) { r.vx += accel * dt; r.facing = 1; }
    if (!left && !right) r.vx *= Math.pow(r.onGround ? 0.0008 : 0.22, dt);
    r.vx = clamp(r.vx, -230, 230);

    // --- gravity -----------------------------------------------------
    r.vy += 1250 * dt;
    r.vy = clamp(r.vy, -420, 620);

    // --- drilling ----------------------------------------------------
    // A dig is a held action with a timer, so hard rock genuinely costs time
    // and the drill upgrade is felt rather than merely counted.
    let digTarget = null;
    if (down) digTarget = [cx, cy + 1];
    else if (left && this._solid(cx - 1, cy)) digTarget = [cx - 1, cy];
    else if (right && this._solid(cx + 1, cy)) digTarget = [cx + 1, cy];

    if (digTarget && this._solid(digTarget[0], digTarget[1])) {
      const key = `${digTarget[0]},${digTarget[1]}`;
      if (!r.drilling || r.drilling.key !== key) {
        const st = this._stratumAt(digTarget[1] - SURFACE_ROWS);
        r.drilling = { key, cx: digTarget[0], cy: digTarget[1], t: 0, need: st.hardness / this._stat("speed") * 0.42 };
      }
      r.drilling.t += dt;
      r.drillSpin += dt * 26;
      this.fuel = Math.max(0, this.fuel - 1.6 * dt);
      if (Math.random() < 0.5) {
        this._puff(digTarget[0] * TILE + TILE / 2, digTarget[1] * TILE + TILE / 2,
                   this._stratumAt(digTarget[1] - SURFACE_ROWS).grain);
      }
      if (r.drilling.t >= r.drilling.need) { this._dig(r.drilling.cx, r.drilling.cy); r.drilling = null; }
      // While cutting downward the rig creeps into the hole rather than
      // hovering above it, which is what makes digging feel like descending.
      if (down) r.vy = Math.max(r.vy, 40);
    } else {
      r.drilling = null;
      if (r.thrusting || Math.abs(r.vx) > 20) r.drillSpin += dt * 6;
    }

    // --- integrate + collide -----------------------------------------
    this._move(dt);

    // --- hazards under the rig ---------------------------------------
    const t = this._tile(cx, cy);
    if (t === 3) {
      const h = HAZARDS[this.tileData.get(cy * COLS + cx)?.hazard || "gas"];
      if (h.fuelBurn) this.fuel = Math.max(0, this.fuel - h.fuelBurn * dt);
      if (h.damage) { this._damage(h.damage * dt, "lava"); this.shakeT = 0.12; }
    }

    // --- depth / fuel / hull ----------------------------------------
    this.depth = Math.max(0, Math.floor(r.y / TILE) - SURFACE_ROWS + 1);
    if (this.depth > this.maxDepth) this.maxDepth = this.depth;
    // Idling still costs a trickle: standing in the shaft is never free.
    this.fuel = Math.max(0, this.fuel - 0.55 * dt);

    if (this.depth <= 0 && Math.abs(r.x - (this.depotX * TILE + TILE / 2)) < TILE * 2.2) this._tryDepot();

    if (this.fuel <= 0 && !this._stranded) {
      this._stranded = true;
      this._float("Out of fuel", "#ff6b6b");
    }
    if (this.fuel <= 0) {
      // Stranded: the hull grinds down slowly, so there is a moment to be
      // rescued by gravity if the depot is close below.
      this._damage(7 * dt, "stranded");
    }

    this._stepDust(dt);
    if (this.shakeT > 0) this.shakeT -= dt;
    this._updateHud();
  }

  _move(dt) {
    const r = this.rig;
    const halfW = TILE * 0.34, halfH = TILE * 0.36;

    r.x += r.vx * dt;
    // Horizontal collision.
    for (const s of [-1, 1]) {
      const edge = r.x + s * halfW;
      const cx = Math.floor(edge / TILE), cy = Math.floor(r.y / TILE);
      if (this._solid(cx, cy)) {
        r.x = cx * TILE + (s < 0 ? TILE + halfW : -halfW);
        r.vx = 0;
      }
    }
    r.x = clamp(r.x, halfW, COLS * TILE - halfW);

    const prevVy = r.vy;
    r.y += r.vy * dt;
    r.onGround = false;
    for (const s of [-1, 1]) {
      const edge = r.y + s * halfH;
      const cx = Math.floor(r.x / TILE), cy = Math.floor(edge / TILE);
      if (this._solid(cx, cy)) {
        r.y = cy * TILE + (s < 0 ? TILE + halfH : -halfH);
        if (s > 0) {
          r.onGround = true;
          // Fall damage, above a generous free drop.
          const impact = prevVy - 400;
          if (impact > 0) {
            this._damage(impact * 0.26, "fall");
            this.shakeT = 0.2;
            for (let i = 0; i < 8; i++) this._puff(r.x + randFloat(-14, 14), r.y + 14, "#cbb6a0");
          }
        }
        r.vy = 0;
      }
    }
    r.y = Math.max(halfH, r.y);
  }

  _dig(cx, cy) {
    const i = cy * COLS + cx;
    const data = this.tileData.get(i);
    this.grid[i] = 0;
    audioManager.play("hit");
    this.shakeT = Math.max(this.shakeT, 0.07);
    for (let k = 0; k < 6; k++) {
      this._puff(cx * TILE + TILE / 2 + randFloat(-12, 12), cy * TILE + TILE / 2 + randFloat(-12, 12),
                 this._stratumAt(cy - SURFACE_ROWS).grain);
    }
    if (data?.ore) {
      const ore = ORES[data.ore];
      if (this.cargoMass + ore.mass > this.slots) {
        this._float("Hold full", "#ffd76a");
      } else {
        this.cargo[data.ore] = (this.cargo[data.ore] || 0) + 1;
        this.cargoMass += ore.mass;
        this._float(`+1 ${ore.name}`, ore.edge);
        audioManager.play("coin");
      }
      this.tileData.delete(i);
    }
  }

  _damage(amount, cause) {
    this.hull -= amount;
    if (this.hull <= 0) { this.hull = 0; this._end(cause); }
  }

  /** The depot: sell the hold, refuel, and keep going or bank the run. */
  _tryDepot() {
    if (this.state !== "playing" || this.depth > 0) return;
    if (Math.abs(this.rig.x - (this.depotX * TILE + TILE / 2)) > TILE * 2.2) return;
    let earned = 0;
    for (const [ore, n] of Object.entries(this.cargo)) earned += ORES[ore].value * n;
    if (earned > 0) {
      this.credits += earned;
      this.cargo = {}; this.cargoMass = 0;
      this._float(`Sold for ◆ ${formatNumber(earned)}`, "#ffd76a");
      audioManager.play("powerup");
      const store = this._store();
      store.credits += earned;
      store.totalOre += 1;
      this._save();
      this.addScore(earned);
    }
    // Refuelling and repairs are free at the depot — the cost of a trip is
    // the ore you failed to bring home, not a service charge.
    if (this.fuel < this.maxFuel - 1 || this.hull < this.maxHull - 1) {
      this.fuel = this.maxFuel;
      this.hull = this.maxHull;
      this._stranded = false;
      this._float("Refuelled and patched", "#7cf0d0");
    }
    this._updateHud();
  }

  _end(cause) {
    if (this._dead) return;
    this._dead = true;
    const store = this._store();
    if (store.bestDepth < this.maxDepth) store.bestDepth = this.maxDepth;
    if (store.bestRun < this.credits) store.bestRun = this.credits;
    this._save();
    const lost = Object.values(this.cargo).reduce((a, b) => a + b, 0);
    const reason = cause === "lava" ? "The hull burned through in the lava."
      : cause === "fall" ? "The rig broke apart on impact."
      : "Stranded with no fuel, the hull ground itself away.";
    this.endGame({
      result: "loss", score: this.credits,
      message: `${reason} ${lost ? `${lost} pieces of ore went down with it.` : "The hold was empty, at least."}`,
      extraStats: [
        { label: "Deepest", value: `${this.maxDepth} m` },
        { label: "Stratum", value: this._stratumAt(this.maxDepth).name },
        { label: "Banked", value: `◆ ${formatNumber(this.credits)}` },
      ],
    });
  }

  _float(text, color) { this.floaters.push({ text, color, t: 0, y: 0 }); }
  _puff(x, y, color) {
    this.dust.push({ x, y, vx: randFloat(-40, 40), vy: randFloat(-70, 10), r: randFloat(2, 5),
                     t: 0, life: randFloat(0.3, 0.7), color });
  }
  _stepDust(dt) {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.t += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 220 * dt;
      if (d.t >= d.life) this.dust.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt; f.y -= 34 * dt;
      if (f.t > 1.6) this.floaters.splice(i, 1);
    }
  }

  _updateHud() {
    this.setHud({
      Credits: `◆ ${formatNumber(this.credits)}`,
      Depth: `${this.depth} m`,
      Fuel: `${Math.round((this.fuel / this.maxFuel) * 100)}%`,
      Hold: `${this.cargoMass}/${this.slots}`,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // The camera scales the world so the shaft always fills the stage width.
    const scale = W / (COLS * TILE);
    const viewRows = H / (TILE * scale);
    const target = this.rig ? this.rig.y / TILE - viewRows * 0.42 : 0;
    this.camY += (target - this.camY) * Math.min(1, dt * 7);
    this.camY = clamp(this.camY, -SURFACE_ROWS, this.rows - viewRows);

    this._drawSky(ctx, W, H, scale, viewRows);

    ctx.save();
    if (this.shakeT > 0) {
      const k = this.shakeT * 22;
      ctx.translate(randFloat(-k, k), randFloat(-k, k));
    }
    ctx.scale(scale, scale);
    ctx.translate(0, -this.camY * TILE);

    this._drawTiles(ctx, viewRows);
    this._drawDepot(ctx);
    this._drawDust(ctx);
    this._drawRig(ctx);
    this._drawLight(ctx, viewRows);
    ctx.restore();

    this._drawGauges(ctx, W, H);
    this._drawFloaters(ctx, W, H);
    ctx.restore();
  }

  /** Sky above the dirt line, fading to the stratum colour as you descend. */
  _drawSky(ctx, W, H, scale, viewRows) {
    const st = this._stratumAt(Math.max(0, Math.floor(this.camY) - SURFACE_ROWS));
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (this.camY < 2) {
      g.addColorStop(0, "#2a4d7a"); g.addColorStop(0.5, "#4d7fae"); g.addColorStop(1, "#8fb4cd");
    } else {
      g.addColorStop(0, st.rock2); g.addColorStop(1, "#0b0a12");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  _drawTiles(ctx, viewRows) {
    const y0 = Math.max(0, Math.floor(this.camY) - 1);
    const y1 = Math.min(this.rows, Math.ceil(this.camY + viewRows) + 1);
    for (let y = y0; y < y1; y++) {
      const depth = y - SURFACE_ROWS;
      const st = this._stratumAt(Math.max(0, depth));
      for (let x = 0; x < COLS; x++) {
        const t = this.grid[y * COLS + x];
        if (t === 0) continue;
        const px = x * TILE, py = y * TILE;
        if (t === 3) { this._drawHazard(ctx, px, py, this.tileData.get(y * COLS + x)?.hazard); continue; }

        // Rock body: two-tone checker plus a hash of grain so a wall of tiles
        // does not read as one flat slab.
        const alt = (x + y) & 1;
        ctx.fillStyle = alt ? st.rock : st.rock2;
        ctx.fillRect(px, py, TILE, TILE);
        const seed = (x * 73856093 ^ y * 19349663) >>> 0;
        ctx.fillStyle = st.grain;
        ctx.globalAlpha = 0.25;
        for (let k = 0; k < 3; k++) {
          const s = (seed >> (k * 5)) & 31;
          ctx.fillRect(px + (s % 6) * 6, py + ((s >> 2) % 6) * 6, 5, 4);
        }
        ctx.globalAlpha = 1;
        // Top lip catches the light from above.
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(px, py, TILE, 3);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(px, py + TILE - 3, TILE, 3);

        if (t === 2) this._drawOre(ctx, px, py, this.tileData.get(y * COLS + x)?.ore, seed);
      }
    }
  }

  _drawOre(ctx, px, py, ore, seed) {
    const o = ORES[ore];
    if (!o) return;
    const cx = px + TILE / 2, cy = py + TILE / 2;
    // Three facets rather than a circle: it reads as crystal in rock.
    for (let k = 0; k < 3; k++) {
      const a = ((seed >> (k * 3)) & 7) / 8 * Math.PI * 2;
      const d = 6 + ((seed >> (k * 4)) & 3) * 2;
      const r = 5.5 - k * 0.9;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fillStyle = o.color; ctx.fill();
      ctx.strokeStyle = o.edge; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x - 1.4, y - r + 1.6, 2.2, 2.2);
    }
  }

  _drawHazard(ctx, px, py, kind) {
    const h = HAZARDS[kind || "gas"];
    const t = this.elapsed * 2.4 + px * 0.03;
    if (kind === "lava") {
      const g = ctx.createLinearGradient(0, py, 0, py + TILE);
      g.addColorStop(0, "#ffb347"); g.addColorStop(0.5, "#ff6b28"); g.addColorStop(1, "#8a1f0d");
      ctx.fillStyle = g;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(255,240,180,0.5)";
      for (let k = 0; k < 3; k++) {
        const bx = px + 8 + k * 12, by = py + TILE - 6 - ((t * 9 + k * 13) % (TILE - 8));
        ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, 7); ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(20,30,18,0.85)";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = h.color;
      ctx.globalAlpha = 0.35 + Math.sin(t) * 0.14;
      for (let k = 0; k < 4; k++) {
        const bx = px + 9 + (k % 2) * 16, by = py + 10 + Math.floor(k / 2) * 16 + Math.sin(t + k) * 3;
        ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** The surface depot: a gantry and a landing pad you fly back to. */
  _drawDepot(ctx) {
    const x = this.depotX * TILE + TILE / 2;
    const y = SURFACE_ROWS * TILE;
    ctx.save();
    // Ground line.
    ctx.fillStyle = "#4a6b3c";
    ctx.fillRect(0, y - 8, COLS * TILE, 8);
    ctx.fillStyle = "#6d9455";
    ctx.fillRect(0, y - 8, COLS * TILE, 3);
    // Pad.
    ctx.fillStyle = "#3a3f52";
    ctx.fillRect(x - 46, y - 16, 92, 10);
    ctx.fillStyle = "#ffd76a";
    for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * 12 - 3, y - 14, 6, 3);
    // Gantry.
    ctx.strokeStyle = "#8b90ac"; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 34, y - 16); ctx.lineTo(x - 26, y - 74);
    ctx.moveTo(x + 34, y - 16); ctx.lineTo(x + 26, y - 74);
    ctx.moveTo(x - 30, y - 46); ctx.lineTo(x + 30, y - 46);
    ctx.stroke();
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(x - 30, y - 84, 60, 12);
    ctx.fillStyle = "#0b0a12";
    ctx.font = "700 9px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DEPOT", x, y - 75);
    // A beacon so the pad is findable from the top of the shaft.
    const pulse = 0.4 + Math.sin(this.elapsed * 3) * 0.3;
    ctx.fillStyle = `rgba(34,211,238,${pulse})`;
    ctx.beginPath(); ctx.arc(x, y - 90, 6, 0, 7); ctx.fill();
    ctx.restore();
  }

  _drawRig(ctx) {
    const r = this.rig;
    if (!r) return;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(r.facing, 1);

    // Thruster plume, drawn under the hull.
    if (r.thrusting) {
      const len = 16 + Math.sin(this.elapsed * 40) * 5;
      const g = ctx.createLinearGradient(0, 12, 0, 12 + len);
      g.addColorStop(0, "rgba(255,220,140,0.95)");
      g.addColorStop(1, "rgba(255,90,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-7, 12); ctx.lineTo(7, 12); ctx.lineTo(0, 12 + len);
      ctx.closePath(); ctx.fill();
    }

    // Treads.
    ctx.fillStyle = "#1c1f2e";
    ctx.fillRect(-15, 6, 30, 9);
    ctx.fillStyle = "#3a3f52";
    for (let i = 0; i < 5; i++) {
      const off = ((this.elapsed * 60 * Math.sign(r.vx || 1) + i * 7) % 30 + 30) % 30;
      ctx.fillRect(-15 + off, 7, 4, 7);
    }
    // Hull.
    const g = ctx.createLinearGradient(0, -14, 0, 8);
    g.addColorStop(0, "#ffb03a"); g.addColorStop(1, "#c9761c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-14, 6); ctx.lineTo(-11, -10); ctx.lineTo(9, -13); ctx.lineTo(15, 0); ctx.lineTo(15, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.4; ctx.stroke();
    // Cabin glass.
    ctx.fillStyle = "rgba(140,220,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(-6, -9); ctx.lineTo(6, -11); ctx.lineTo(8, -2); ctx.lineTo(-6, -1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(-4, -8, 4, 3);

    // Drill: a spinning cone on the nose, cutting downward when digging.
    ctx.save();
    if (r.drilling && r.drilling.cy > Math.floor(r.y / TILE)) ctx.rotate(Math.PI / 2);
    ctx.translate(14, 0);
    ctx.rotate(r.drillSpin);
    ctx.fillStyle = "#c9ccd8";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const a = (i / 3) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(11, 0);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "#e6eaf5" : "#9aa0b4";
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  /**
   * Darkness with a lamp cut out of it. Without this the deep strata read the
   * same as the shallow ones; with it, the lamp upgrade is the difference
   * between seeing a lava pocket and driving into it.
   */
  _drawLight(ctx, viewRows) {
    if (this.camY < 1) return;
    const r = this.rig;
    const dark = Math.min(0.86, 0.2 + this.depth / 240);
    const radius = this._stat("light") * TILE;
    const g = ctx.createRadialGradient(r.x, r.y, radius * 0.25, r.x, r.y, radius);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.7, `rgba(4,4,10,${dark * 0.55})`);
    g.addColorStop(1, `rgba(4,4,10,${dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, this.camY * TILE - TILE, COLS * TILE, (viewRows + 2) * TILE);
  }

  _drawDust(ctx) {
    for (const d of this.dust) {
      ctx.globalAlpha = Math.max(0, 1 - d.t / d.life) * 0.8;
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Fuel and hull bars plus the stratum name, drawn in screen space. */
  _drawGauges(ctx, W, H) {
    const pad = 12, bw = Math.min(190, W * 0.32), bh = 11;
    const bar = (x, y, frac, color, label) => {
      ctx.fillStyle = "rgba(8,10,20,0.6)";
      roundRect(ctx, x, y, bw, bh, 5); ctx.fill();
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, color); g.addColorStop(1, "rgba(255,255,255,0.85)");
      ctx.fillStyle = g;
      roundRect(ctx, x + 1, y + 1, Math.max(0, (bw - 2) * frac), bh - 2, 4); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, x + 4, y + bh + 10);
    };
    const fuelLow = this.fuel / this.maxFuel < 0.25;
    bar(pad, pad, this.fuel / this.maxFuel,
        fuelLow ? (Math.sin(this.elapsed * 9) > 0 ? "#ff5470" : "#ff9f43") : "#ffd76a", "FUEL");
    bar(pad, pad + 30, this.hull / this.maxHull, "#2ee6a6", "HULL");

    const st = this._stratumAt(this.depth);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "800 15px 'Sora', system-ui, sans-serif";
    ctx.fillText(`${this.depth} m`, W - pad, pad + 14);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "600 11px 'Inter', system-ui, sans-serif";
    ctx.fillText(st.name, W - pad, pad + 30);

    // Cargo readout: one pip per mass unit, coloured by what is in the hold.
    const pips = [];
    for (const [ore, n] of Object.entries(this.cargo)) {
      for (let i = 0; i < n * ORES[ore].mass; i++) pips.push(ORES[ore].color);
    }
    const px = W - pad - 6;
    for (let i = 0; i < this.slots; i++) {
      const x = px - (i % 12) * 11, y = pad + 44 + Math.floor(i / 12) * 11;
      ctx.fillStyle = pips[i] || "rgba(255,255,255,0.14)";
      roundRect(ctx, x - 4, y, 8, 8, 2); ctx.fill();
    }

    if (this.depth === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(this.elapsed * 4) * 0.3})`;
      ctx.font = "700 12px 'Inter', system-ui, sans-serif";
      ctx.fillText(this.cargoMass ? "Land on the pad to sell" : "Drill down — press Down", W / 2, H - 16);
    }
  }

  _drawFloaters(ctx, W, H) {
    ctx.textAlign = "center";
    this.floaters.forEach((f, i) => {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      ctx.fillStyle = f.color;
      ctx.font = "800 14px 'Sora', system-ui, sans-serif";
      ctx.fillText(f.text, W / 2, H * 0.34 + f.y + i * 2);
    });
    ctx.globalAlpha = 1;
  }
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

export default DeepDelveGame;
