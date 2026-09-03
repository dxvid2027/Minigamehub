// ==========================================================================
// Bloom Garden — a plot, four seasons, and a genetics problem.
//
// Plant seeds in a 6×5 plot and let the seasons turn. Each species has a
// season it thrives in and one it hates, so the plot you laid out in spring
// is the wrong plot by autumn. Water costs a turn; pests eat what you do
// not notice.
//
// The real game is breeding. Two flowers blooming next to each other can be
// crossed, and the child inherits a mix of their traits — colour, hardiness,
// height and season — with the occasional mutation. Sixteen species are
// found rather than unlocked: you get to them by crossing your way there.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, choice } from "../core/utils.js";

const COLS = 6, ROWS = 5;
const SEASONS = [
  { name: "Spring", sky: ["#a8d8f0", "#e8f4d8"], ground: "#5c7a3a", tint: "#c9e8a8", growth: 1.25 },
  { name: "Summer", sky: ["#7fc4e8", "#ffe9b8"], ground: "#4a7a2a", tint: "#ffe9a8", growth: 1.1 },
  { name: "Autumn", sky: ["#e8a860", "#ffd8a8"], ground: "#6b5a2a", tint: "#ffc07c", growth: 0.85 },
  { name: "Winter", sky: ["#9db4d8", "#e0eaf5"], ground: "#4a5468", tint: "#dbe8f5", growth: 0.55 },
];
const SEASON_LEN = 26;   // seconds per season

// --- Species --------------------------------------------------------------
// The four starters are seeds you always have. The rest are found by
// crossing; `from` records the pair that first produced them, purely so the
// almanac can tell you where a flower came from.
const SPECIES = [
  { id: "daisy",    name: "Daisy",        petals: 8,  form: "round",  a: "#ffffff", b: "#ffd76a", best: 0, worst: 3, hardy: 0.7, height: 0.5, value: 18,  starter: true },
  { id: "poppy",    name: "Poppy",        petals: 5,  form: "cup",    a: "#e8384f", b: "#2a1a10", best: 1, worst: 3, hardy: 0.6, height: 0.6, value: 24,  starter: true },
  { id: "blueb",    name: "Bluebell",     petals: 6,  form: "bell",   a: "#5c6bd8", b: "#c9d4ff", best: 0, worst: 1, hardy: 0.55, height: 0.45, value: 26, starter: true },
  { id: "marigold", name: "Marigold",     petals: 12, form: "round",  a: "#ff9f43", b: "#c9671c", best: 1, worst: 3, hardy: 0.8, height: 0.4, value: 20,  starter: true },
  { id: "tulip",    name: "Tulip",        petals: 6,  form: "cup",    a: "#ff5470", b: "#ffd0dd", best: 0, worst: 2, hardy: 0.6, height: 0.65, value: 46,  from: "daisy+poppy" },
  { id: "iris",     name: "Iris",         petals: 6,  form: "star",   a: "#7c5cff", b: "#ffd76a", best: 0, worst: 3, hardy: 0.5, height: 0.7, value: 62,   from: "bluebell+poppy" },
  { id: "lily",     name: "Lily",         petals: 6,  form: "star",   a: "#fff4e0", b: "#ff9f43", best: 1, worst: 3, hardy: 0.55, height: 0.75, value: 78,  from: "daisy+bluebell" },
  { id: "aster",    name: "Aster",        petals: 16, form: "round",  a: "#c86bff", b: "#ffe9a8", best: 2, worst: 1, hardy: 0.7, height: 0.5, value: 90,   from: "daisy+marigold" },
  { id: "dahlia",   name: "Dahlia",       petals: 20, form: "round",  a: "#ff4fd8", b: "#5c1a3a", best: 2, worst: 3, hardy: 0.65, height: 0.7, value: 130,  from: "aster+tulip" },
  { id: "orchid",   name: "Orchid",       petals: 5,  form: "orchid", a: "#e8a8ff", b: "#7c5cff", best: 1, worst: 3, hardy: 0.35, height: 0.6, value: 190,  from: "iris+lily" },
  { id: "lotus",    name: "Lotus",        petals: 14, form: "cup",    a: "#ffc9dd", b: "#fff0d0", best: 1, worst: 3, hardy: 0.4, height: 0.55, value: 250,  from: "lily+tulip" },
  { id: "protea",   name: "Protea",       petals: 18, form: "star",   a: "#ff8f6a", b: "#c93a4a", best: 2, worst: 0, hardy: 0.85, height: 0.85, value: 320,  from: "dahlia+marigold" },
  { id: "frost",    name: "Frostbloom",   petals: 8,  form: "star",   a: "#c9f0ff", b: "#5fa8d8", best: 3, worst: 1, hardy: 0.95, height: 0.5, value: 420,   from: "bluebell+aster" },
  { id: "ember",    name: "Emberflower",  petals: 10, form: "cup",    a: "#ff6b28", b: "#ffd76a", best: 1, worst: 3, hardy: 0.75, height: 0.65, value: 520,   from: "protea+poppy", glow: true },
  { id: "moon",     name: "Moonpetal",    petals: 7,  form: "orchid", a: "#e0e8ff", b: "#a86bff", best: 3, worst: 1, hardy: 0.5, height: 0.7, value: 760,    from: "orchid+frostbloom", glow: true },
  { id: "eternal",  name: "Eternal Rose", petals: 24, form: "round",  a: "#ffd76a", b: "#ff4fd8", best: -1, worst: -1, hardy: 1.0, height: 0.9, value: 1400,  from: "moonpetal+emberflower", glow: true },
];
const byId = Object.fromEntries(SPECIES.map(s => [s.id, s]));

// Which cross makes which. Order does not matter.
const CROSSES = {};
for (const s of SPECIES) {
  if (!s.from) continue;
  const [a, b] = s.from.split("+").map(n => SPECIES.find(x => x.name.toLowerCase() === n)?.id || n);
  CROSSES[`${a}|${b}`] = s.id;
  CROSSES[`${b}|${a}`] = s.id;
}

const TOOLS = [
  { id: "plant", name: "Plant",  color: "#2ee6a6", text: "Sow the selected seed in an empty bed." },
  { id: "water", name: "Water",  color: "#22d3ee", text: "Water a bed. Dry beds grow at a crawl." },
  { id: "cross", name: "Cross",  color: "#ff4fd8", text: "Cross two neighbouring blooms into a seed." },
  { id: "pick",  name: "Harvest",color: "#ffd76a", text: "Take a bloom for coins, freeing the bed." },
];

export class BloomGardenGame extends GameBase {
  getDifficulties() { return ["Season"]; }
  getInstructions() {
    return [
      "Pick a tool, then a bed. Plant a seed, water it, harvest the bloom, or cross two blooms that are next to each other.",
      "Each species has a season it loves and one it hates. A flower out of season grows slowly and is easy prey for pests.",
      "Beds dry out. A dry bed grows at a crawl, so watering is the rhythm of the whole garden.",
      "Aphids arrive on their own and eat one plant at a time. Harvesting or watering an infested bed clears them.",
      "Crossing two different blooms makes a seed of a new species — sixteen in all, and the rare ones need two rare parents.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tool, then tap a bed."; }
  getKeyboardHint() { return "1-4 pick a tool, click a bed. Q/E cycle the selected seed."; }
  getScene() { return "meadow"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.garden) custom.garden = { coins: 0, found: {}, best: 0, harvested: 0 };
    const g = custom.garden;
    if (!g.found) g.found = {};
    for (const s of SPECIES) if (s.starter) g.found[s.id] = true;
    return g;
  }
  _save() { saveManager.saveNow(); }

  getPlayLabel() { return "Open the garden" }
  getStartExtras() {
    const g = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `${Object.keys(g.found).length}/${SPECIES.length} species`),
      el("span", {}, `◉ ${formatNumber(g.coins)} coins`),
      el("span", {}, `${g.harvested || 0} blooms cut`),
    ]);
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    for (let i = 1; i <= 4; i++) this.input.onKey(`Digit${i}`, () => this._pickTool(i - 1));
    this.input.onKey("KeyQ", () => this._cycleSeed(-1));
    this.input.onKey("KeyE", () => this._cycleSeed(1));
    this.input.onKey("KeyL", () => this.openAlmanac());
  }

  onResize() { this._fit(); }

  onStart() {
    this.beds = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      this.beds.push({ plant: null, water: 0.6, pest: 0, sparkle: 0 });
    }
    this.tool = 0;
    this.seedIdx = 0;
    this.crossFirst = null;
    this.season = 0;
    this.seasonT = 0;
    this.year = 1;
    this.coinsRun = 0;
    this.elapsed = 0;
    this.msg = "Plant a seed to begin";
    this.msgT = 3;
    this.floaters = [];
    this.seeds = {};
    for (const s of SPECIES) if (s.starter) this.seeds[s.id] = 99;   // starters never run out
    this.setScore(0);
    this._fit();
    this._updateHud();
  }

  _fit() {
    const W = this.viewW || 600, H = this.viewH || 600;
    const availH = H - 150;
    this.cell = Math.floor(Math.min((W - 24) / COLS, availH / ROWS));
    this.ox = Math.round((W - this.cell * COLS) / 2);
    this.oy = 58;
  }

  _seedList() {
    const found = this._store().found;
    return SPECIES.filter(s => found[s.id] && (s.starter || (this.seeds[s.id] || 0) > 0));
  }
  _selectedSeed() {
    const list = this._seedList();
    if (!list.length) return null;
    return list[clamp(this.seedIdx, 0, list.length - 1)];
  }
  _cycleSeed(d) {
    const list = this._seedList();
    if (!list.length) return;
    this.seedIdx = (this.seedIdx + d + list.length) % list.length;
    audioManager.play("select");
  }
  _pickTool(i) { this.tool = i; this.crossFirst = null; audioManager.play("select"); }

  // ------------------------------------------------------------- INPUT ---
  _click(x, y) {
    if (this.state !== "playing") return;
    for (const b of this._toolBar()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this._pickTool(b.i); return; }
    }
    for (const b of this._seedBar()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.seedIdx = b.i; this.tool = 0; audioManager.play("select"); return;
      }
    }
    const cx = Math.floor((x - this.ox) / this.cell);
    const cy = Math.floor((y - this.oy) / this.cell);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    this._useTool(cy * COLS + cx);
  }

  _useTool(i) {
    const bed = this.beds[i];
    const tool = TOOLS[this.tool].id;

    if (tool === "plant") {
      if (bed.plant) { this._say("That bed is taken", "#ff5470"); return; }
      const spec = this._selectedSeed();
      if (!spec) { this._say("No seeds", "#ff5470"); return; }
      if (!spec.starter) {
        if ((this.seeds[spec.id] || 0) <= 0) { this._say("No seeds of that kind", "#ff5470"); return; }
        this.seeds[spec.id]--;
      }
      bed.plant = { spec, growth: 0, age: 0 };
      bed.water = Math.max(bed.water, 0.55);
      audioManager.play("place");
      this._say(`${spec.name} sown`, spec.a);
    } else if (tool === "water") {
      bed.water = 1;
      bed.pest = 0;
      bed.sparkle = 0.5;
      audioManager.play("pop");
    } else if (tool === "pick") {
      if (!bed.plant || bed.plant.growth < 1) { this._say("Not in bloom yet", "#ff5470"); return; }
      const spec = bed.plant.spec;
      const pay = Math.round(spec.value * (1 + this.year * 0.12));
      const store = this._store();
      store.coins += pay;
      store.harvested = (store.harvested || 0) + 1;
      this._save();
      this.coinsRun += pay;
      this.addScore(pay);
      this._float(`+◉ ${pay}`, "#ffd76a", i);
      bed.plant = null;
      bed.sparkle = 0.6;
      audioManager.play("coin");
    } else if (tool === "cross") {
      if (!bed.plant || bed.plant.growth < 1) { this._say("Only blooms can be crossed", "#ff5470"); return; }
      if (this.crossFirst === null) {
        this.crossFirst = i;
        this._say(`${bed.plant.spec.name} selected — pick a neighbour`, "#ff4fd8");
        return;
      }
      if (this.crossFirst === i) { this.crossFirst = null; this._say("Cancelled", "#8b90ac"); return; }
      const a = this.crossFirst, b = i;
      const ax = a % COLS, ay = Math.floor(a / COLS), bx = b % COLS, by = Math.floor(b / COLS);
      if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) {
        this._say("They have to be next to each other", "#ff5470");
        this.crossFirst = null;
        return;
      }
      this._cross(a, b);
      this.crossFirst = null;
    }
    this._updateHud();
  }

  /**
   * Crossing. A known pair gives its species; an unknown pair gives a seed
   * of whichever parent is rarer, so a wrong cross still returns something
   * rather than eating two grown flowers for nothing.
   */
  _cross(ai, bi) {
    const A = this.beds[ai].plant.spec, B = this.beds[bi].plant.spec;
    const key = `${A.id}|${B.id}`;
    const outId = CROSSES[key];
    this.beds[ai].plant = null;
    this.beds[bi].plant = null;
    this.beds[ai].sparkle = 0.8;
    this.beds[bi].sparkle = 0.8;

    if (outId) {
      const spec = byId[outId];
      this.seeds[outId] = (this.seeds[outId] || 0) + 2;
      const store = this._store();
      const isNew = !store.found[outId];
      if (isNew) {
        store.found[outId] = true;
        this.addScore(400);
        audioManager.play("powerup");
        this._say(`New species: ${spec.name}`, spec.a);
      } else {
        audioManager.play("levelup");
        this._say(`${spec.name} — 2 seeds`, spec.a);
      }
      this._save();
      if (Object.keys(store.found).length >= SPECIES.length) this._complete();
      return;
    }
    // No recipe: the rarer parent's seed comes back, plus a mutation chance
    // that can jump you to something you have not seen.
    const rarer = A.value >= B.value ? A : B;
    if (Math.random() < 0.12) {
      const pool = SPECIES.filter(s => !s.starter && !this._store().found[s.id]);
      if (pool.length) {
        const got = choice(pool);
        this.seeds[got.id] = (this.seeds[got.id] || 0) + 1;
        this._store().found[got.id] = true;
        this._save();
        this.addScore(300);
        audioManager.play("powerup");
        this._say(`A sport! ${got.name}`, got.a);
        return;
      }
    }
    this.seeds[rarer.id] = (this.seeds[rarer.id] || 0) + 1;
    audioManager.play("click");
    this._say(`Nothing new — one ${rarer.name} seed back`, "#8b90ac");
  }

  _complete() {
    this.endGame({
      result: "win", score: this.score,
      message: `Every one of the ${SPECIES.length} species has bloomed in this garden, ending with the Eternal Rose.`,
      extraStats: [
        { label: "Year", value: this.year },
        { label: "Coins", value: `◉ ${formatNumber(this.coinsRun)}` },
        { label: "Species", value: `${SPECIES.length}/${SPECIES.length}` },
      ],
    });
  }

  openAlmanac() {
    const store = this._store();
    const grid = el("div", { class: "fish-grid" });
    for (const s of SPECIES) {
      const found = store.found[s.id];
      const card = el("div", { class: `fish-card${found ? " caught" : ""}` }, [
        el("span", { class: "prev" }),
        el("span", { class: "nm" }, found ? s.name : "?????"),
        el("span", { class: "st" }, found
          ? `◉ ${s.value} · loves ${s.best >= 0 ? SEASONS[s.best].name : "every season"}`
          : (s.from ? `Cross: ${s.from.replace("+", " + ")}` : "")),
      ]);
      const c = el("canvas", { width: 140, height: 100 });
      c.style.cssText = "width:70px;height:50px";
      const cx = c.getContext("2d");
      cx.scale(2, 2);
      cx.translate(35, 32);
      drawFlower(cx, s, 1, 1, 0, found ? 1 : 0.28);
      card.querySelector(".prev").appendChild(c);
      grid.appendChild(card);
    }
    openModal({
      title: `Almanac — ${Object.keys(store.found).length}/${SPECIES.length}`,
      bodyNode: el("div", { class: "fish-log" }, [
        el("p", { class: "zone-intro" }, "Crossing two blooms that sit next to each other makes a seed. The pair each species needs is listed once you have found it."),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Back to the garden"),
    });
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 2.4; }
  _float(t, c, bedIdx) {
    this.floaters.push({ t, c, i: bedIdx, time: 0 });
  }

  _updateHud() {
    const store = this._store();
    this.setHud({
      Coins: `◉ ${formatNumber(this.coinsRun)}`,
      Season: SEASONS[this.season].name,
      Year: this.year,
      Species: `${Object.keys(store.found).length}/${SPECIES.length}`,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;

    this.seasonT += dt;
    if (this.seasonT >= SEASON_LEN) {
      this.seasonT = 0;
      this.season = (this.season + 1) % SEASONS.length;
      if (this.season === 0) { this.year++; this.addScore(200); }
      audioManager.play("levelup");
      this._say(`${SEASONS[this.season].name}${this.season === 0 ? `, year ${this.year}` : ""}`, SEASONS[this.season].tint);
    }
    const season = SEASONS[this.season];

    for (const bed of this.beds) {
      bed.water = Math.max(0, bed.water - dt * 0.035);
      if (bed.sparkle > 0) bed.sparkle -= dt;
      if (!bed.plant) continue;
      const p = bed.plant;
      p.age += dt;
      // Season fit, water and pests all multiply into the growth rate.
      const fit = p.spec.best === this.season ? 1.35
                : p.spec.worst === this.season ? 0.35
                : p.spec.best === -1 ? 1.1 : 0.85;
      const wet = 0.25 + bed.water * 0.9;
      const bugs = bed.pest > 0 ? 0.35 : 1;
      p.growth = clamp(p.growth + dt * 0.055 * fit * wet * bugs * season.growth * (0.6 + p.spec.hardy * 0.6), 0, 1);
      // Pests eat an ungrown plant back down.
      if (bed.pest > 0) p.growth = Math.max(0, p.growth - dt * 0.02);
    }

    // Aphids arrive on their own, preferring the weakest plant on the plot.
    this._pestT = (this._pestT || 12) - dt;
    if (this._pestT <= 0) {
      this._pestT = clamp(24 - this.year * 1.4, 9, 24);
      const candidates = this.beds.filter(b => b.plant && !b.pest);
      if (candidates.length) {
        candidates.sort((a, b) => (a.plant.spec.hardy - b.plant.spec.hardy) || (a.water - b.water));
        candidates[0].pest = 1;
        audioManager.play("error");
        this._say("Aphids", "#9ce86a");
      }
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].time += dt;
      if (this.floaters[i].time > 1.4) this.floaters.splice(i, 1);
    }
    this._updateHud();
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawSky(ctx, W, H);
    this._drawBeds(ctx);
    this._drawToolBar(ctx, W, H);
    this._drawSeedBar(ctx, W, H);
    this._drawSeasonRing(ctx, W);
    this._drawFloaters(ctx);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _drawSky(ctx, W, H) {
    const s = SEASONS[this.season];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, s.sky[0]); g.addColorStop(1, s.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Weather: petals in spring, haze in summer, leaves in autumn, snow in winter.
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = this.elapsed * (this.season === 3 ? 0.25 : 0.5) + i * 0.83;
      const x = ((i * 137 + t * 40) % (W + 40)) - 20;
      const y = ((i * 71 + t * (this.season === 3 ? 24 : 46)) % (H + 40)) - 20;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = s.tint;
      if (this.season === 3) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); }
      else if (this.season === 2) { ctx.save(); ctx.translate(x, y); ctx.rotate(t); ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
      else { ctx.beginPath(); ctx.ellipse(x, y, 4, 2, t, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  _drawBeds(ctx) {
    const c = this.cell, season = SEASONS[this.season];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        const bed = this.beds[i];
        const px = this.ox + x * c, py = this.oy + y * c;

        // Soil, darker when wet.
        const wet = bed.water;
        ctx.fillStyle = mixHex(season.ground, "#2a1c10", 0.2 + wet * 0.4);
        roundRect(ctx, px + 2, py + 2, c - 4, c - 4, 7); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1.5;
        roundRect(ctx, px + 2, py + 2, c - 4, c - 4, 7); ctx.stroke();
        // Furrows.
        ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(px + 5, py + 4 + k * (c - 8) / 4);
          ctx.lineTo(px + c - 5, py + 4 + k * (c - 8) / 4);
          ctx.stroke();
        }
        // Dry warning.
        if (wet < 0.25) {
          ctx.fillStyle = `rgba(255,159,67,${0.2 + Math.sin(this.elapsed * 3 + i) * 0.1})`;
          roundRect(ctx, px + 2, py + 2, c - 4, c - 4, 7); ctx.fill();
        }

        if (bed.plant) {
          drawFlower(ctx, bed.plant.spec, c / 96, bed.plant.growth, this.elapsed + i,
                     1, px + c / 2, py + c * 0.78);
        }
        if (bed.pest > 0) {
          for (let k = 0; k < 3; k++) {
            const a = this.elapsed * 2 + k * 2.1;
            ctx.fillStyle = "#9ce86a";
            ctx.beginPath();
            ctx.arc(px + c / 2 + Math.cos(a) * c * 0.24, py + c * 0.45 + Math.sin(a * 1.3) * c * 0.16,
                    Math.max(2, c * 0.045), 0, 7);
            ctx.fill();
          }
        }
        if (this.crossFirst === i) {
          ctx.strokeStyle = "#ff4fd8"; ctx.lineWidth = 2.5;
          roundRect(ctx, px + 2, py + 2, c - 4, c - 4, 7); ctx.stroke();
        }
        if (bed.sparkle > 0) {
          ctx.globalAlpha = bed.sparkle;
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(px + c / 2, py + c / 2, c * 0.3 + (1 - bed.sparkle) * c * 0.4, 0, 7);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // Water level pip in the corner.
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        roundRect(ctx, px + c - 12, py + 6, 5, c * 0.3, 2.5); ctx.fill();
        ctx.fillStyle = wet < 0.25 ? "#ff9f43" : "#22d3ee";
        const hgt = (c * 0.3 - 2) * wet;
        roundRect(ctx, px + c - 11.5, py + 6 + (c * 0.3 - 1) - hgt, 4, hgt, 2); ctx.fill();
      }
    }
  }

  _toolBar() {
    const W = this.viewW, H = this.viewH;
    const w = Math.min(88, (W - 24) / 4 - 5);
    const total = 4 * w + 15;
    const x0 = (W - total) / 2;
    return TOOLS.map((t, i) => ({ i, t, x: x0 + i * (w + 5), y: H - 84, w, h: 30 }));
  }

  _drawToolBar(ctx, W, H) {
    for (const b of this._toolBar()) {
      const on = this.tool === b.i;
      ctx.fillStyle = on ? hexA(b.t.color, 0.85) : "rgba(20,26,18,0.75)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
      ctx.strokeStyle = on ? "#ffffff" : hexA(b.t.color, 0.5);
      ctx.lineWidth = on ? 2 : 1.2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.stroke();
      ctx.fillStyle = on ? "#0b0a12" : b.t.color;
      ctx.font = "800 11px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${b.i + 1} ${b.t.name}`, b.x + b.w / 2, b.y + 19);
    }
  }

  _seedBar() {
    const W = this.viewW, H = this.viewH;
    const list = this._seedList();
    const w = Math.min(56, (W - 20) / Math.max(1, list.length) - 4);
    const total = list.length * w + (list.length - 1) * 4;
    const x0 = (W - total) / 2;
    return list.map((s, i) => ({ i, s, x: x0 + i * (w + 4), y: H - 46, w, h: 36 }));
  }

  _drawSeedBar(ctx, W, H) {
    for (const b of this._seedBar()) {
      const on = this.seedIdx === b.i && this.tool === 0;
      ctx.fillStyle = on ? "rgba(46,230,166,0.28)" : "rgba(20,26,18,0.7)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
      ctx.strokeStyle = on ? "#2ee6a6" : "rgba(255,255,255,0.14)";
      ctx.lineWidth = on ? 2 : 1;
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h * 0.7);
      drawFlower(ctx, b.s, 0.3, 1, this.elapsed, 1);
      ctx.restore();
      if (!b.s.starter) {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "800 9px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${this.seeds[b.s.id] || 0}`, b.x + b.w - 4, b.y + 11);
      }
    }
  }

  /** A season dial in the corner, filling as the season runs out. */
  _drawSeasonRing(ctx, W) {
    const cx = W - 34, cy = 30, r = 16;
    ctx.fillStyle = "rgba(8,14,8,0.5)";
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, 7); ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i === this.season ? SEASONS[i].tint : "rgba(255,255,255,0.16)";
      ctx.lineWidth = i === this.season ? 5 : 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, (i / 4) * Math.PI * 2 - Math.PI / 2 + 0.06,
              ((i + 1) / 4) * Math.PI * 2 - Math.PI / 2 - 0.06);
      ctx.stroke();
    }
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
    const a = (this.season / 4 + (this.seasonT / SEASON_LEN) / 4) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
    ctx.stroke();
  }

  _drawFloaters(ctx) {
    const c = this.cell;
    ctx.textAlign = "center";
    for (const f of this.floaters) {
      const x = this.ox + (f.i % COLS) * c + c / 2;
      const y = this.oy + Math.floor(f.i / COLS) * c + c / 2 - f.time * 34;
      ctx.globalAlpha = Math.max(0, 1 - f.time / 1.4);
      ctx.fillStyle = f.c;
      ctx.font = "800 14px 'Sora', system-ui, sans-serif";
      ctx.fillText(f.t, x, y);
    }
    ctx.globalAlpha = 1;
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,14,8,0.55)";
    roundRect(ctx, W / 2 - 150, 12, 300, 28, 14); ctx.fill();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 13px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, 31);
    ctx.globalAlpha = 1;
  }
}

/**
 * Draws one flower. Everything — petal count, form, the two colours, the
 * height — comes from the species record, so sixteen species are sixteen
 * distinct silhouettes out of one routine.
 */
function drawFlower(ctx, spec, scale, growth, t, alpha = 1, cx = 0, cy = 0) {
  const g = clamp(growth, 0, 1);
  const s = scale * (0.35 + g * 0.65);
  const stem = 46 * s * (0.5 + spec.height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = alpha;
  const sway = Math.sin(t * 1.4) * 0.06 * g;

  // Stem and leaves.
  ctx.strokeStyle = "#3f6b2a";
  ctx.lineWidth = Math.max(1.4, 3 * s);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(sway * 20, -stem * 0.5, sway * 30, -stem);
  ctx.stroke();
  ctx.fillStyle = "#4a7f33";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 7 * s, -stem * 0.45, 8 * s, 3.4 * s, side * 0.6 + sway, 0, 7);
    ctx.fill();
  }

  if (g < 0.35) {
    // A bud before it opens.
    ctx.fillStyle = mixHex(spec.a, "#4a7f33", 0.5);
    ctx.beginPath();
    ctx.ellipse(sway * 30, -stem, 4 * s, 6 * s, 0, 0, 7);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.translate(sway * 30, -stem);
  const open = clamp((g - 0.35) / 0.65, 0, 1);
  const R = 13 * s * (0.55 + open * 0.45);

  if (spec.glow) {
    const gg = ctx.createRadialGradient(0, 0, 1, 0, 0, R * 2.4);
    gg.addColorStop(0, hexA(spec.a, 0.4 * alpha));
    gg.addColorStop(1, hexA(spec.a, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, R * 2.4, 0, 7); ctx.fill();
  }

  ctx.fillStyle = spec.a;
  ctx.strokeStyle = mixHex(spec.a, "#000000", 0.25);
  ctx.lineWidth = Math.max(0.6, 0.9 * s);
  for (let i = 0; i < spec.petals; i++) {
    const a = (i / spec.petals) * Math.PI * 2 + t * 0.08;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    if (spec.form === "round") {
      ctx.ellipse(0, -R * 0.72, R * 0.36, R * 0.68, 0, 0, 7);
    } else if (spec.form === "cup") {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(R * 0.55, -R * 0.5, 0, -R * 1.15);
      ctx.quadraticCurveTo(-R * 0.55, -R * 0.5, 0, 0);
    } else if (spec.form === "bell") {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(R * 0.42, -R * 0.2, R * 0.3, -R * 0.95);
      ctx.quadraticCurveTo(0, -R * 1.2, -R * 0.3, -R * 0.95);
      ctx.quadraticCurveTo(-R * 0.42, -R * 0.2, 0, 0);
    } else if (spec.form === "star") {
      ctx.moveTo(0, 0);
      ctx.lineTo(R * 0.24, -R * 0.7);
      ctx.lineTo(0, -R * 1.25);
      ctx.lineTo(-R * 0.24, -R * 0.7);
      ctx.closePath();
    } else {
      // orchid: a broad lower lip and narrow uppers
      const wide = i < 2 ? 1.5 : 0.7;
      ctx.ellipse(0, -R * 0.7, R * 0.3 * wide, R * 0.62, 0, 0, 7);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Centre.
  ctx.fillStyle = spec.b;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, 7); ctx.fill();
  ctx.fillStyle = mixHex(spec.b, "#ffffff", 0.4);
  ctx.beginPath(); ctx.arc(-R * 0.1, -R * 0.1, R * 0.13, 0, 7); ctx.fill();
  ctx.restore();
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const f = (sa, sb) => Math.round(sa * (1 - t) + sb * t);
  return `rgb(${f((pa >> 16) & 255, (pb >> 16) & 255)},${f((pa >> 8) & 255, (pb >> 8) & 255)},${f(pa & 255, pb & 255)})`;
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

export default BloomGardenGame;
