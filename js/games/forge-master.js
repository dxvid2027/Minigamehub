// ==========================================================================
// Forge Master — make a blade, one hammer blow at a time.
//
// Every commission is the same four stages and none of them are the same
// twice: heat the billet into a narrow band, hammer it toward a silhouette
// without overworking any one spot, quench it at the right moment, and
// grind the edge along a moving line.
//
// What is being scored is not speed. Each stage grades how close you got,
// the four grades average into the piece's quality, and quality is what a
// buyer pays for. A rushed blade sells; a good one pays for the forge.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, choice } from "../core/utils.js";

// --- What can be forged ---------------------------------------------------
// `shape` is the target silhouette as a list of half-widths down the blade;
// the hammering stage is scored against it directly.
const PATTERNS = [
  { id: "dagger",  name: "Dagger",      tier: 0, value: 60,   blows: 8,  shape: [0.35, 0.9, 1.0, 0.95, 0.8, 0.55, 0.3, 0.12] },
  { id: "cleaver", name: "Cleaver",     tier: 0, value: 90,   blows: 9,  shape: [0.3, 0.75, 1.0, 1.0, 1.0, 0.95, 0.85, 0.4, 0.1] },
  { id: "shortsw", name: "Short Sword", tier: 1, value: 150,  blows: 10, shape: [0.3, 0.85, 0.95, 0.9, 0.85, 0.8, 0.7, 0.55, 0.3, 0.1] },
  { id: "axe",     name: "War Axe",     tier: 1, value: 210,  blows: 10, shape: [0.2, 0.4, 0.55, 0.9, 1.0, 1.0, 0.8, 0.45, 0.2, 0.08] },
  { id: "spear",   name: "Spear Head",  tier: 2, value: 260,  blows: 11, shape: [0.25, 0.55, 0.9, 1.0, 0.85, 0.65, 0.5, 0.38, 0.26, 0.15, 0.06] },
  { id: "longsw",  name: "Longsword",   tier: 2, value: 380,  blows: 12, shape: [0.28, 0.8, 0.92, 0.88, 0.84, 0.8, 0.74, 0.66, 0.56, 0.42, 0.24, 0.08] },
  { id: "greatsw", name: "Greatsword",  tier: 3, value: 560,  blows: 13, shape: [0.32, 0.95, 1.0, 0.98, 0.95, 0.92, 0.88, 0.82, 0.72, 0.6, 0.44, 0.24, 0.08] },
  { id: "halberd", name: "Halberd",     tier: 3, value: 740,  blows: 13, shape: [0.2, 0.35, 0.9, 1.0, 0.7, 0.45, 0.4, 0.4, 0.38, 0.3, 0.22, 0.14, 0.06] },
  { id: "runic",   name: "Runic Blade", tier: 4, value: 1150, blows: 14, shape: [0.3, 0.86, 1.0, 0.9, 0.86, 0.9, 0.86, 0.8, 0.72, 0.6, 0.46, 0.3, 0.16, 0.06] },
  { id: "kings",   name: "King's Edge", tier: 4, value: 1800, blows: 15, shape: [0.34, 0.9, 0.98, 0.94, 0.92, 0.9, 0.88, 0.86, 0.8, 0.72, 0.6, 0.46, 0.3, 0.16, 0.05] },
];

// --- Metals ---------------------------------------------------------------
// Harder metals move less per blow and want a hotter, narrower band, so the
// same pattern in steel is a different job from the same pattern in bronze.
const METALS = [
  { id: "bronze",   name: "Bronze",   cost: 20,  hardness: 0.7,  band: 0.22, mult: 1.0,  color: "#c98f4a", hot: "#ffb347" },
  { id: "iron",     name: "Iron",     cost: 55,  hardness: 1.0,  band: 0.18, mult: 1.35, color: "#8b90ac", hot: "#ff9f43" },
  { id: "steel",    name: "Steel",    cost: 140, hardness: 1.35, band: 0.15, mult: 1.9,  color: "#c9d4e8", hot: "#ffcf6a" },
  { id: "damascus", name: "Damascus", cost: 340, hardness: 1.7,  band: 0.12, mult: 2.7,  color: "#a8b4c9", hot: "#ffe9a8" },
  { id: "starmetal",name: "Starmetal",cost: 820, hardness: 2.1,  band: 0.10, mult: 3.8,  color: "#9db4ff", hot: "#c9e0ff" },
];

// --- Forge upgrades -------------------------------------------------------
const UPGRADES = [
  { id: "bellows", name: "Bellows",     desc: "The heat band is wider and easier to hold.", base: 180, step: 1.5,  per: 0.012, unit: "band" },
  { id: "hammer",  name: "Hammer Head", desc: "Each blow moves more metal.",                base: 220, step: 1.55, per: 0.09,  unit: "force" },
  { id: "anvil",   name: "Anvil",       desc: "Blows land closer to where you aimed.",      base: 260, step: 1.5,  per: 0.11,  unit: "aim" },
  { id: "quench",  name: "Quench Tank", desc: "The quench window is longer.",               base: 200, step: 1.48, per: 0.10,  unit: "window" },
  { id: "wheel",   name: "Grinding Wheel", desc: "The grinding line moves more slowly.",    base: 240, step: 1.52, per: 0.08,  unit: "grind" },
];
const BASE = { band: 0, force: 1, aim: 1, window: 1, grind: 1 };

const STAGES = ["heat", "hammer", "quench", "grind"];

export class ForgeMasterGame extends GameBase {
  getDifficulties() { return ["Commission"]; }
  getInstructions() {
    return [
      "Heat: hold to pump the bellows. Let go when the needle is inside the green band — too cold and the metal will not move, too hot and it burns.",
      "Hammer: click a spot on the billet to strike it. Every blow spreads the metal there; you are aiming for the ghost outline behind it.",
      "Quench: press the moment the marker crosses the blue window. Early and the blade stays soft, late and it cracks.",
      "Grind: hold while the moving line is over the bright band to take metal off the edge, and let go when it is not.",
      "The four grades average into the piece's quality, and quality is what it sells for. Coins buy metal, patterns and the forge itself.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap and hold on the anvil. Everything is one finger."; }
  getKeyboardHint() { return "Space or click for every stage — hold where the stage says hold."; }
  getScene() { return "ember"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.forge) custom.forge = { coins: 200, lv: {}, made: 0, best: 0, patterns: {} };
    const f = custom.forge;
    if (typeof f.coins !== "number") f.coins = 200;
    if (!f.lv) f.lv = {};
    if (!f.patterns) f.patterns = {};
    return f;
  }
  _save() { saveManager.saveNow(); }
  _lv(id) { return this._store().lv[id] || 0; }
  _stat(unit) {
    const u = UPGRADES.find(x => x.unit === unit);
    return BASE[unit] + this._lv(u.id) * u.per;
  }
  _cost(u) { return Math.round(u.base * Math.pow(u.step, this._lv(u.id))); }
  /** Patterns and metals both open up as the smith's rank rises. */
  _rank() { return Math.min(4, Math.floor((this._store().made || 0) / 6)); }

  getPlayLabel() { return "Take a commission"; }
  getStartExtras() {
    const f = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `◉ ${formatNumber(f.coins)} coins`),
      el("span", {}, `${f.made || 0} pieces forged`),
      el("span", {}, `Best quality: ${f.best || 0}%`),
    ]);
  }

  onPlayPressed() { audioManager.play("click"); this.openWorkshop(); }

  /** The workshop: pick a pattern and a metal, and spend on the forge. */
  openWorkshop() {
    const f = this._store();
    const rank = this._rank();
    this.pattern = this.pattern || PATTERNS[0];
    this.metal = this.metal || METALS[0];

    const head = el("strong", { class: "rig-credits" }, `◉ ${formatNumber(f.coins)} coins`);
    const pats = el("div", { class: "rig-grid" });
    const mets = el("div", { class: "bait-row" });
    const ups = el("div", { class: "rig-grid" });

    const render = () => {
      head.textContent = `◉ ${formatNumber(f.coins)} coins · smith rank ${rank + 1}/5`;
      pats.innerHTML = "";
      for (const p of PATTERNS) {
        const open = p.tier <= rank;
        pats.appendChild(el("button", {
          class: `rig-card${this.pattern.id === p.id ? " maxed" : ""}${open ? "" : " poor"}`,
          disabled: !open,
          onClick: () => { this.pattern = p; audioManager.play("select"); render(); },
        }, [
          el("span", { class: "nm" }, open ? p.name : "Locked"),
          el("span", { class: "ds" }, open ? `${p.blows} blows · base ◉ ${p.value}` : `Forge ${(p.tier) * 6} pieces`),
        ]));
      }
      mets.innerHTML = "";
      for (const m of METALS) {
        const open = METALS.indexOf(m) <= rank;
        const afford = f.coins >= m.cost;
        mets.appendChild(el("button", {
          class: `bait-card${this.metal.id === m.id ? " active" : ""}${open && afford ? "" : " poor"}`,
          disabled: !open || !afford,
          style: `--bt:${m.color}`,
          onClick: () => { this.metal = m; audioManager.play("select"); render(); },
        }, [
          el("span", { class: "sw" }),
          el("span", { class: "nm" }, open ? m.name : "Locked"),
          el("span", { class: "ds" }, open ? `×${m.mult} value · harder to move` : "Higher rank needed"),
          el("span", { class: "cost" }, `◉ ${m.cost}`),
        ]));
      }
      ups.innerHTML = "";
      for (const u of UPGRADES) {
        const lv = this._lv(u.id), maxed = lv >= 10, cost = this._cost(u);
        ups.appendChild(el("button", {
          class: `rig-card${maxed ? " maxed" : ""}${!maxed && f.coins < cost ? " poor" : ""}`,
          disabled: maxed || f.coins < cost,
          onClick: () => {
            if (maxed || f.coins < cost) return;
            f.coins -= cost; f.lv[u.id] = lv + 1; this._save();
            audioManager.play("powerup"); render();
          },
        }, [
          el("span", { class: "nm" }, u.name),
          el("span", { class: "ds" }, u.desc),
          el("span", { class: "pips" }, [...Array(10)].map((_, i) => el("i", { class: i < lv ? "on" : "" }))),
          el("span", { class: "cost" }, maxed ? "Maxed" : `◉ ${formatNumber(cost)}`),
        ]));
      }
    };
    render();

    openModal({
      title: "The Workshop",
      bodyNode: el("div", { class: "rig-shop" }, [
        head,
        el("h4", { class: "dock-h" }, "Pattern"), pats,
        el("h4", { class: "dock-h" }, "Metal (bought with the commission)"), mets,
        el("h4", { class: "dock-h" }, "The forge"), ups,
      ]),
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", {
          class: "btn btn-primary",
          onClick: () => {
            if (f.coins < this.metal.cost) { audioManager.play("error"); return; }
            f.coins -= this.metal.cost; this._save();
            closeModal(); this.start();
          },
        }, "Light the forge"),
        el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
      ]),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._down(p.x, p.y));
    this.input.onPointer("up", () => this._up());
    this.input.onKey("Space", () => this._down(this.viewW / 2, this.viewH / 2));
    this.input.onKey("Space", () => this._up(), "up");
    this.pattern = PATTERNS[0];
    this.metal = METALS[0];
  }

  onStart() {
    const p = this.pattern, m = this.metal;
    this.stage = "heat";
    this.grades = {};
    this.elapsed = 0;
    this.holding = false;
    this.sparks = [];
    this.msg = "Hold to heat the billet";
    this.msgT = 3;

    // Heat stage.
    this.heat = 0;
    this.heatDir = 1;
    this.bandCentre = randFloat(0.45, 0.78);
    this.bandWidth = m.band + this._stat("band");

    // Hammer stage: the billet starts as a uniform bar.
    this.cells = p.shape.length;
    this.bar = new Array(this.cells).fill(0.55);
    this.work = new Array(this.cells).fill(0);   // how much each spot has been hit
    this.blowsLeft = p.blows;
    this.hammerY = 0;
    this.hammerT = 0;

    // Quench stage.
    this.quenchPos = 0;
    this.quenchWindow = 0.10 * this._stat("window");
    this.quenchTarget = randFloat(0.35, 0.72);
    this.quenchDone = false;

    // Grind stage.
    this.grindPos = 0;
    this.grindGood = 0;
    this.grindTotal = 0;
    this.grindBandC = randFloat(0.3, 0.7);
    this.grindBandW = 0.16;
    this.grindSpeed = 0.55 / this._stat("grind");
    this.grindTime = 0;

    this.setScore(0);
    this._updateHud();
  }

  // ------------------------------------------------------------- INPUT ---
  _down(x, y) {
    if (this.state !== "playing") return;
    this.holding = true;
    if (this.stage === "heat") return;                // handled on release
    if (this.stage === "hammer") { this._strike(x, y); return; }
    if (this.stage === "quench") { this._quench(); return; }
  }
  _up() {
    this.holding = false;
    if (this.state !== "playing") return;
    if (this.stage === "heat") this._finishHeat();
  }

  _finishHeat() {
    const d = Math.abs(this.heat - this.bandCentre);
    const grade = clamp(1 - d / (this.bandWidth * 1.9), 0, 1);
    this.grades.heat = grade;
    this.stage = "hammer";
    this._say(grade > 0.85 ? "Glowing right" : grade > 0.5 ? "Workable" : "Poorly heated", gradeColor(grade));
    audioManager.play(grade > 0.5 ? "powerup" : "error");
    this._updateHud();
  }

  /**
   * A hammer blow. It thins the struck cell and pushes metal into its
   * neighbours, which is why aiming matters: the shape is the sum of where
   * you hit, not a slider you drag.
   */
  _strike(x, y) {
    if (this.blowsLeft <= 0) return;
    const L = this._barLayout();
    let cell = Math.floor(((x - L.x) / L.w) * this.cells);
    // Anvil accuracy: a low anvil scatters the blow to a neighbour.
    const scatter = Math.max(0, 1 - this._stat("aim")) * 1.2;
    if (Math.random() < scatter) cell += Math.random() < 0.5 ? -1 : 1;
    cell = clamp(cell, 0, this.cells - 1);

    const force = (0.16 * this._stat("force")) / this.metal.hardness;
    // Cold metal barely moves; the heat grade carries into this stage.
    const heatFactor = 0.35 + (this.grades.heat ?? 0.5) * 0.9;
    this.bar[cell] = clamp(this.bar[cell] - force * heatFactor, 0.04, 1.2);
    if (cell > 0) this.bar[cell - 1] = clamp(this.bar[cell - 1] + force * 0.32 * heatFactor, 0.04, 1.2);
    if (cell < this.cells - 1) this.bar[cell + 1] = clamp(this.bar[cell + 1] + force * 0.32 * heatFactor, 0.04, 1.2);
    this.work[cell] += 1;

    this.blowsLeft--;
    this.hammerT = 0.22;
    this.hammerCell = cell;
    audioManager.play("hit");
    this.shake();
    for (let i = 0; i < 12; i++) {
      this.sparks.push({
        x: L.x + (cell + 0.5) * (L.w / this.cells),
        y: L.y,
        vx: randFloat(-160, 160), vy: randFloat(-220, -40),
        t: 0, life: randFloat(0.3, 0.75),
      });
    }
    if (this.blowsLeft <= 0) this._finishHammer();
  }

  _finishHammer() {
    // Score the silhouette: mean absolute error against the pattern, with a
    // penalty for any single spot that was worked far more than the rest.
    const shape = this.pattern.shape;
    let err = 0;
    for (let i = 0; i < this.cells; i++) err += Math.abs(this.bar[i] - shape[i]);
    err /= this.cells;
    const maxWork = Math.max(...this.work);
    const evenness = clamp(1 - Math.max(0, maxWork - 3) * 0.12, 0.4, 1);
    const grade = clamp(1 - err * 2.6, 0, 1) * evenness;
    this.grades.hammer = grade;
    this.stage = "quench";
    this._say(grade > 0.8 ? "A clean shape" : grade > 0.5 ? "Close enough" : "Misshapen", gradeColor(grade));
    this._updateHud();
  }

  _quench() {
    if (this.quenchDone) return;
    this.quenchDone = true;
    const d = Math.abs(this.quenchPos - this.quenchTarget);
    const grade = clamp(1 - d / (this.quenchWindow * 2.2), 0, 1);
    this.grades.quench = grade;
    this.stage = "grind";
    audioManager.play(grade > 0.5 ? "powerup" : "error");
    this._say(grade > 0.85 ? "Hardened perfectly" : grade > 0.5 ? "Hardened" : d > 0 && this.quenchPos < this.quenchTarget ? "Quenched too soon" : "Left too long", gradeColor(grade));
    this._updateHud();
  }

  _finishGrind() {
    const grade = this.grindTotal > 0 ? clamp(this.grindGood / this.grindTotal, 0, 1) : 0;
    this.grades.grind = grade;
    this._sell();
  }

  /** Averages the four grades into a quality and pays for the piece. */
  _sell() {
    const g = this.grades;
    const quality = clamp((g.heat + g.hammer + g.quench + g.grind) / 4, 0, 1);
    const pct = Math.round(quality * 100);
    // Quality is worth more than linearly: a 90% blade is worth far more
    // than two 45% ones, which is the whole reason to slow down.
    const pay = Math.round(this.pattern.value * this.metal.mult * (0.25 + Math.pow(quality, 1.8) * 1.6));

    const store = this._store();
    store.coins += pay;
    store.made = (store.made || 0) + 1;
    if ((store.best || 0) < pct) store.best = pct;
    store.patterns[this.pattern.id] = Math.max(store.patterns[this.pattern.id] || 0, pct);
    this._save();
    this.addScore(pay);
    audioManager.play(quality > 0.7 ? "win" : "gameover");

    this.endGame({
      result: quality >= 0.5 ? "win" : "loss",
      score: pay,
      message: `${qualityWord(quality)} ${this.metal.name.toLowerCase()} ${this.pattern.name.toLowerCase()} — ${pct}% quality, sold for ◉ ${formatNumber(pay)}.`,
      extraStats: [
        { label: "Heat", value: `${Math.round(g.heat * 100)}%` },
        { label: "Shape", value: `${Math.round(g.hammer * 100)}%` },
        { label: "Quench", value: `${Math.round(g.quench * 100)}%` },
        { label: "Edge", value: `${Math.round(g.grind * 100)}%` },
      ],
    });
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 2.2; }

  _updateHud() {
    const done = STAGES.indexOf(this.stage) + 1;
    this.setHud({
      Stage: `${done}/4`,
      Piece: this.pattern.name,
      Metal: this.metal.name,
      Blows: this.stage === "hammer" ? this.blowsLeft : "—",
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.hammerT > 0) this.hammerT -= dt;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 620 * dt;
      if (s.t >= s.life) this.sparks.splice(i, 1);
    }

    if (this.stage === "heat") {
      // The needle climbs while held and falls when not, so overshooting is
      // recoverable but costs time.
      this.heat += (this.holding ? 0.52 : -0.34) * dt;
      this.heat = clamp(this.heat, 0, 1);
      if (this.heat >= 1) this._finishHeat();
    } else if (this.stage === "quench") {
      this.quenchPos += 0.42 * dt;
      if (this.quenchPos >= 1) { this.quenchPos = 1; this._quench(); }
    } else if (this.stage === "grind") {
      this.grindTime += dt;
      this.grindPos = 0.5 + Math.sin(this.grindTime * Math.PI * 2 * this.grindSpeed) * 0.46;
      const inBand = Math.abs(this.grindPos - this.grindBandC) < this.grindBandW / 2;
      this.grindTotal++;
      if (this.holding === inBand) this.grindGood++;
      if (this.holding && inBand && Math.random() < 0.4) {
        const L = this._barLayout();
        this.sparks.push({
          x: L.x + this.grindPos * L.w, y: L.y,
          vx: randFloat(-90, 90), vy: randFloat(-160, -30),
          t: 0, life: randFloat(0.2, 0.5),
        });
      }
      // The band drifts, so holding one position is never the answer.
      this.grindBandC = clamp(0.5 + Math.sin(this.grindTime * 0.7) * 0.3, 0.15, 0.85);
      if (this.grindTime > 9) this._finishGrind();
    }
    this._updateHud();
  }

  // ------------------------------------------------------------ RENDER ---
  _barLayout() {
    const W = this.viewW, H = this.viewH;
    const w = Math.min(W - 120, 380);
    return { x: (W - w) / 2, y: H * 0.5, w, h: H * 0.17 };
  }

  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawForge(ctx, W, H);
    this._drawAnvil(ctx, W, H);
    this._drawBillet(ctx, W, H);
    this._drawSparks(ctx);
    if (this.stage === "heat") this._drawHeat(ctx, W, H);
    if (this.stage === "hammer") this._drawHammerUI(ctx, W, H);
    if (this.stage === "quench") this._drawQuench(ctx, W, H);
    if (this.stage === "grind") this._drawGrind(ctx, W, H);
    this._drawStages(ctx, W, H);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  /** The smithy: a dark room lit by the fire, which flickers on the beat. */
  _drawForge(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1008"); g.addColorStop(1, "#0a0604");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Hearth on the left, glowing.
    const fx = W * 0.14, fy = H * 0.26;
    const flick = 0.7 + Math.sin(this.elapsed * 9) * 0.12 + Math.sin(this.elapsed * 23) * 0.06;
    const heat = this.stage === "heat" ? 0.5 + this.heat * 0.9 : 0.6;
    const fg = ctx.createRadialGradient(fx, fy, 4, fx, fy, W * 0.42);
    fg.addColorStop(0, `rgba(255,190,90,${0.4 * flick * heat})`);
    fg.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#2a1a10";
    roundRect(ctx, fx - 62, fy - 44, 124, 88, 10); ctx.fill();
    ctx.fillStyle = "#3d2a18";
    roundRect(ctx, fx - 56, fy - 38, 112, 76, 8); ctx.fill();
    ctx.fillStyle = `rgba(255,${140 + flick * 70},60,${0.9 * flick})`;
    roundRect(ctx, fx - 46, fy - 28, 92, 58, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,240,180,${0.5 * flick})`;
    roundRect(ctx, fx - 32, fy - 16, 64, 34, 6); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const t = this.elapsed * 3 + i * 1.7;
      ctx.fillStyle = `rgba(255,${180 + (i * 12)},110,${0.4 + Math.sin(t) * 0.25})`;
      ctx.beginPath();
      ctx.arc(fx - 34 + i * 17, fy + 12 - ((t * 12) % 52), 3.4 + Math.sin(t) * 1.6, 0, 7);
      ctx.fill();
    }

    // Tools on the back wall.
    ctx.strokeStyle = "rgba(180,160,140,0.2)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const x = W * 0.62 + i * 26;
      ctx.beginPath(); ctx.moveTo(x, H * 0.12); ctx.lineTo(x, H * 0.12 + 40 + i * 6); ctx.stroke();
    }
  }

  _drawAnvil(ctx, W, H) {
    const L = this._barLayout();
    const ax = W / 2, ay = L.y + 34;
    ctx.save();
    ctx.fillStyle = "#2a2a33";
    // Body, horn and base.
    ctx.beginPath();
    ctx.moveTo(ax - L.w * 0.54, ay);
    ctx.lineTo(ax + L.w * 0.54, ay);
    ctx.lineTo(ax + L.w * 0.46, ay + 18);
    ctx.lineTo(ax + L.w * 0.2, ay + 26);
    ctx.lineTo(ax + L.w * 0.28, ay + 62);
    ctx.lineTo(ax - L.w * 0.28, ay + 62);
    ctx.lineTo(ax - L.w * 0.2, ay + 26);
    ctx.lineTo(ax - L.w * 0.46, ay + 18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3d3d49";
    ctx.fillRect(ax - L.w * 0.54, ay - 5, L.w * 1.08, 6);
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(ax - L.w * 0.34, ay + 62, L.w * 0.68, 10);
    ctx.restore();
  }

  /**
   * The billet itself, drawn as a mirrored profile from the cell widths, in
   * a colour that runs from cold grey to white-hot with the heat value.
   */
  _drawBillet(ctx, W, H) {
    const L = this._barLayout();
    const cw = L.w / this.cells;
    const m = this.metal;
    const glow = this.stage === "heat" ? this.heat
      : this.stage === "hammer" ? clamp(0.75 - (this.pattern.blows - this.blowsLeft) * 0.04, 0.1, 1)
      : this.stage === "quench" ? clamp(0.7 - this.quenchPos * 0.65, 0, 1) : 0;

    // The target silhouette, as a ghost behind the metal.
    if (this.stage === "hammer") {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.pattern.shape.forEach((v, i) => {
        const x = L.x + (i + 0.5) * cw, y = L.y - v * L.h * 0.5;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      for (let i = this.cells - 1; i >= 0; i--) {
        const x = L.x + (i + 0.5) * cw, y = L.y + this.pattern.shape[i] * L.h * 0.5;
        ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // The metal.
    ctx.save();
    ctx.beginPath();
    this.bar.forEach((v, i) => {
      const x = L.x + (i + 0.5) * cw, y = L.y - v * L.h * 0.5;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    for (let i = this.cells - 1; i >= 0; i--) {
      const x = L.x + (i + 0.5) * cw, y = L.y + this.bar[i] * L.h * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, L.y - L.h * 0.5, 0, L.y + L.h * 0.5);
    g.addColorStop(0, mixHex(m.color, "#ffffff", 0.35 + glow * 0.4));
    g.addColorStop(0.5, glow > 0.05 ? mixHex(m.color, m.hot, glow) : m.color);
    g.addColorStop(1, mixHex(m.color, "#000000", 0.35));
    ctx.fillStyle = g;
    ctx.fill();
    if (glow > 0.1) {
      ctx.shadowColor = m.hot; ctx.shadowBlur = 24 * glow;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Damascus pattern once it exists.
    if (m.id === "damascus" || m.id === "starmetal") {
      ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 7; k++) {
        ctx.beginPath();
        for (let x = L.x; x <= L.x + L.w; x += 8) {
          const y = L.y - L.h * 0.3 + k * (L.h * 0.09) + Math.sin(x * 0.06 + k) * 3;
          x === L.x ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // The hammer, dropping onto the last struck cell.
    if (this.stage === "hammer") {
      const cell = this.hammerCell ?? Math.floor(this.cells / 2);
      const hx = L.x + (cell + 0.5) * cw;
      const drop = this.hammerT > 0 ? (1 - this.hammerT / 0.22) : 0;
      const hy = L.y - 90 + drop * 62;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(-0.5 + drop * 0.5);
      ctx.fillStyle = "#5c3a1e";
      ctx.fillRect(-3, 0, 6, 54);
      ctx.fillStyle = "#4a4a58";
      roundRect(ctx, -20, -14, 40, 22, 4); ctx.fill();
      ctx.fillStyle = "#6d6d7d";
      roundRect(ctx, -20, -14, 40, 7, 3); ctx.fill();
      ctx.restore();
    }
  }

  _drawSparks(ctx) {
    for (const s of this.sparks) {
      const k = 1 - s.t / s.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = k > 0.6 ? "#fff6d0" : k > 0.3 ? "#ffb347" : "#ff6b28";
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.8 * k + 0.6, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- stage overlays -----------------------------------------------------
  _gauge(ctx, W, y, label) {
    const bw = Math.min(W - 60, 380), bx = (W - bw) / 2;
    // A visibly lighter track: on the smithy's dark ground a near-black bar
    // was indistinguishable from the room behind it.
    ctx.fillStyle = "rgba(90,74,58,0.85)";
    roundRect(ctx, bx, y, bw, 22, 11); ctx.fill();
    ctx.strokeStyle = "rgba(255,220,180,0.3)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, bx, y, bw, 22, 11); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "700 10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, W / 2, y - 7);
    return { bx, bw };
  }

  _drawHeat(ctx, W, H) {
    const y = H * 0.82;
    const { bx, bw } = this._gauge(ctx, W, y, "HEAT — release inside the band");
    // Band.
    const c = this.bandCentre, w = this.bandWidth;
    ctx.fillStyle = "rgba(46,230,166,0.45)";
    roundRect(ctx, bx + (c - w / 2) * bw, y + 2, w * bw, 18, 9); ctx.fill();
    // Too-hot zone.
    ctx.fillStyle = "rgba(255,84,112,0.35)";
    roundRect(ctx, bx + (c + w / 2) * bw, y + 2, (1 - c - w / 2) * bw, 18, 9); ctx.fill();
    // Needle.
    const nx = bx + this.heat * bw;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, nx - 2.5, y - 4, 5, 30, 2.5); ctx.fill();
    ctx.fillStyle = "#ffd76a";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.holding ? "HOLDING" : "HOLD TO HEAT", W / 2, y + 40);
  }

  _drawHammerUI(ctx, W, H) {
    const L = this._barLayout();
    const cw = L.w / this.cells;
    // Per-cell error strip: how far each spot is from the target.
    for (let i = 0; i < this.cells; i++) {
      const err = Math.abs(this.bar[i] - this.pattern.shape[i]);
      const good = clamp(1 - err * 3.2, 0, 1);
      ctx.fillStyle = `rgba(${Math.round(255 - good * 209)},${Math.round(84 + good * 146)},${Math.round(112 + good * 54)},0.65)`;
      ctx.fillRect(L.x + i * cw + 2, L.y + L.h * 0.62, cw - 4, 5);
    }
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "700 11px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${this.blowsLeft} blows left — click where the metal should thin`, W / 2, H * 0.85);
  }

  _drawQuench(ctx, W, H) {
    const y = H * 0.82;
    const { bx, bw } = this._gauge(ctx, W, y, "QUENCH — press as the marker crosses the window");
    const c = this.quenchTarget, w = this.quenchWindow;
    const g = ctx.createLinearGradient(bx + (c - w / 2) * bw, 0, bx + (c + w / 2) * bw, 0);
    g.addColorStop(0, "rgba(34,211,238,0.3)");
    g.addColorStop(0.5, "rgba(34,211,238,0.75)");
    g.addColorStop(1, "rgba(34,211,238,0.3)");
    ctx.fillStyle = g;
    roundRect(ctx, bx + (c - w / 2) * bw, y + 2, w * bw, 18, 9); ctx.fill();
    const nx = bx + this.quenchPos * bw;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, nx - 2.5, y - 4, 5, 30, 2.5); ctx.fill();
    ctx.fillStyle = "#22d3ee";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PRESS NOW", W / 2, y + 40);
  }

  _drawGrind(ctx, W, H) {
    const y = H * 0.82;
    const { bx, bw } = this._gauge(ctx, W, y, "GRIND — hold only while the line is in the band");
    const c = this.grindBandC, w = this.grindBandW;
    ctx.fillStyle = "rgba(255,215,106,0.42)";
    roundRect(ctx, bx + (c - w / 2) * bw, y + 2, w * bw, 18, 9); ctx.fill();
    const nx = bx + this.grindPos * bw;
    const inBand = Math.abs(this.grindPos - c) < w / 2;
    ctx.fillStyle = this.holding === inBand ? "#2ee6a6" : "#ff5470";
    roundRect(ctx, nx - 3, y - 5, 6, 32, 3); ctx.fill();
    // Live accuracy.
    const acc = this.grindTotal ? this.grindGood / this.grindTotal : 0;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "700 11px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(acc * 100)}% clean · ${Math.max(0, 9 - this.grindTime).toFixed(1)}s`, W / 2, y + 40);
  }

  /** The four-stage rail across the top, with grades as they are earned. */
  _drawStages(ctx, W, H) {
    const names = ["Heat", "Shape", "Quench", "Grind"];
    const keys = ["heat", "hammer", "quench", "grind"];
    const bw = Math.min(W - 40, 340), bx = (W - bw) / 2, cw = bw / 4;
    for (let i = 0; i < 4; i++) {
      const x = bx + i * cw;
      const active = STAGES[i] === this.stage;
      const g = this.grades[keys[i]];
      ctx.fillStyle = active ? "rgba(255,215,106,0.22)" : "rgba(255,255,255,0.05)";
      roundRect(ctx, x + 3, 12, cw - 6, 26, 8); ctx.fill();
      if (active) {
        ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 1.6;
        roundRect(ctx, x + 3, 12, cw - 6, 26, 8); ctx.stroke();
      }
      ctx.fillStyle = g !== undefined ? gradeColor(g) : active ? "#ffd76a" : "rgba(255,255,255,0.4)";
      ctx.font = "800 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(names[i].toUpperCase(), x + cw / 2, 25);
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.fillText(g !== undefined ? `${Math.round(g * 100)}%` : "—", x + cw / 2, 35);
    }
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.textAlign = "center";
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 17px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, H * 0.2);
    ctx.globalAlpha = 1;
  }
}

function gradeColor(g) {
  return g > 0.85 ? "#2ee6a6" : g > 0.6 ? "#ffd76a" : g > 0.35 ? "#ff9f43" : "#ff5470";
}
function qualityWord(q) {
  return q > 0.92 ? "A masterwork" : q > 0.8 ? "A fine" : q > 0.62 ? "A sound" : q > 0.42 ? "A serviceable" : q > 0.22 ? "A rough" : "A ruined";
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const f = (sa, sb) => Math.round(sa * (1 - t) + sb * t);
  return `rgb(${f((pa >> 16) & 255, (pb >> 16) & 255)},${f((pa >> 8) & 255, (pb >> 8) & 255)},${f(pa & 255, pb & 255)})`;
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

export default ForgeMasterGame;
