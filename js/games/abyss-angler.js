// ==========================================================================
// Abyss Angler — drop a line into seven depth zones and see what takes it.
//
// A trip is a run of casts from your boat. Each cast is a dive and a fight:
// the hook falls and you steer it past jellyfish, debris, patrolling sharks
// and old sea mines (one touch snaps the line), picking up pearls on the
// way; stop where you like and wait for a bite; then reel against the fish
// — pull too hard into a surge and the line parts, and when it runs to one
// side, hold the other way to turn it.
//
// Nothing ends the trip but you. A catch comes up on deck as a card — its
// size, weight and worth, whether it is new for your log, a record, or a
// rare golden one — and from there you cast again, swap bait on the spot,
// visit the dock for gear, or head home. Captain's orders pay a bonus for
// particular catches. Fifty-five species, plus treasure and junk, eight of
// them abyssal giants that only take the right bait.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randFloat, choice } from "../core/utils.js";
import { ZONES, FISH, TREASURES, BAITS, MAX_DEPTH, paintFish, paintTreasure, hexA } from "./anglerFish.js";

// --- Gear -----------------------------------------------------------------
const GEAR = [
  { id: "line",  name: "Line Strength", desc: "Take more tension before it snaps.", base: 90,  step: 1.5,  unit: "line",  per: 0.24 },
  { id: "reel",  name: "Reel Speed",    desc: "Pull the catch up faster.",          base: 110, step: 1.52, unit: "reel",  per: 0.22 },
  { id: "depth", name: "Line Length",   desc: "Reach deeper water — all the way to the Hadal Gate.", base: 130, step: 1.55, unit: "depth", per: 60 },
  { id: "hook",  name: "Hook Control",  desc: "Steer the falling hook harder.",     base: 100, step: 1.48, unit: "steer", per: 0.26 },
  { id: "sonar", name: "Sonar",         desc: "See what circles below, even in the dark.", base: 150, step: 1.6, unit: "sonar", per: 1 },
  { id: "charm", name: "Lucky Charm",   desc: "More golden fish and more treasure.", base: 220, step: 1.6, unit: "luck", per: 1 },
];
const GEAR_BASE = { line: 1, reel: 1, depth: 130, steer: 1, sonar: 0, luck: 0 };
const PACK = 5;                       // bait is bought in packs
const TIMES = [
  { name: "Dawn",   sky: ["#ffb38a", "#7ab8e8"], sun: "#ffd8a0", night: 0.15 },
  { name: "Day",    sky: ["#6ac8ff", "#c8ecff"], sun: "#fff6c8", night: 0 },
  { name: "Sunset", sky: ["#ff7a5a", "#5a4a9a"], sun: "#ffb060", night: 0.25 },
  { name: "Night",  sky: ["#0a1030", "#1a2a5a"], sun: "#e8ecff", night: 0.7 },
];

export class AbyssAnglerGame extends GameBase {
  getDifficulties() { return ["Charter"]; }
  getInstructions() {
    return [
      "A trip is as many casts as you like. Cast from the boat, then steer the falling hook past jellyfish, debris, sharks and sea mines — one touch snaps the line. Grab pearls on the way down.",
      "Press down (or ▼) to stop and wait for a bite. Sonar shows what is circling.",
      "When something bites, hold to reel. Tension climbs while you pull — let go when the fish surges. When it runs to one side, hold the opposite arrow to turn it and reel faster.",
      "Every catch comes up on deck: size, weight, value, new species, records and rare golden fish. Then cast again, switch bait right there, or visit the dock.",
      "Captain's orders pay a bonus. Eight abyssal giants live below 400 m and only take the right bait — two of them at the Hadal Gate beyond 600 m.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "◀ ▶ steer · ▼ stop · hold A to reel · during a fight, hold the arrow away from the run."; }
  getKeyboardHint() { return "←/→ steer · ↓ stop the descent · hold Space to reel · Enter casts again."; }
  getScene() { return "deep"; }
  getPlayLabel() { return "Head out"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.angler) custom.angler = { coins: 0, lv: {}, log: {}, bestDepth: 0, bestFish: 0 };
    const a = custom.angler;
    if (typeof a.coins !== "number") a.coins = 0;
    if (!a.lv) a.lv = {};
    if (!a.log) a.log = {};
    if (!a.baits) a.baits = { krill: 0, chum: 0, lure: 0, pearl: 0 };
    if (!a.treasure) a.treasure = {};
    if (!Array.isArray(a.orders)) a.orders = [];
    if (typeof a.bestDepth !== "number") a.bestDepth = 0;
    if (typeof a.bestFish !== "number") a.bestFish = 0;
    if (typeof a.trips !== "number") a.trips = 0;
    if (typeof a.golden !== "number") a.golden = 0;
    return a;
  }
  _save() { saveManager.saveNow(); }
  _lv(id) { return this._store().lv[id] || 0; }
  _stat(unit) { const g = GEAR.find(x => x.unit === unit); return GEAR_BASE[unit] + this._lv(g.id) * g.per; }
  _cost(g) { return Math.round(g.base * Math.pow(g.step, this._lv(g.id))); }
  _baitLeft(id) { return id === "worm" ? Infinity : this._store().baits[id] || 0; }

  getStartExtras() {
    const a = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `◉ ${formatNumber(a.coins)} coins`),
      el("span", {}, `Log: ${Object.keys(a.log).length}/${FISH.length}`),
      el("span", {}, `Deepest: ${a.bestDepth} m`),
      a.golden ? el("span", {}, `✨ Golden: ${a.golden}`) : null,
    ]);
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.panel = el("div", { class: "aa-panel", hidden: true });
    this.stageEl.appendChild(this.panel);
    this.input.onKey("Space", () => { this._reelTap = true; });
    this.input.onKey("Enter", () => { if (this.state === "playing" && (this.phase === "boat" || this.phase === "result") && !this._modalOpen) this._cast(); });
    this.input.onPointer("down", () => { this._pointerHold = true; });
    this.input.onPointer("up", () => { this._pointerHold = false; });
    this.bait = "worm";
  }

  onStart() {
    const a = this._store();
    a.trips += 1;
    this._fillOrders();
    this._save();
    this.trip = { coins: 0, fish: 0, casts: 0, best: null };
    this.coinsRun = 0;
    this.elapsed = 0;
    this.timeIdx = 1;
    this.maxLine = this._stat("depth");
    this.hook = { x: 0.5, y: 0, vx: 0 };
    this.depth = 0;
    this.hazards = []; this.shoal = []; this.bubbles = []; this.pickups = []; this.distant = [];
    this._seedMotes();
    this.setScore(0);
    if (this._baitLeft(this.bait) <= 0) this.bait = "worm";
    this._toBoat();
  }

  onDestroy() { this.panel?.remove(); }

  _seedMotes() {
    this.motes = [];
    for (let i = 0; i < 70; i++) this.motes.push({ x: Math.random(), y: Math.random(), r: randFloat(0.6, 2.4), s: randFloat(6, 26) });
  }
  _zoneAt(d) { let z = ZONES[0]; for (const x of ZONES) if (d >= x.from) z = x; return z; }

  // ============================================================= BOAT ====
  _toBoat() {
    this.phase = "boat";
    this.depth = 0;
    this.caught = null;
    this.hazards = []; this.shoal = []; this.pickups = [];
    this._showBoat();
    this._updateHud();
  }

  /** The bait picker: usable from the boat and from every catch card. */
  _baitChips(onPick) {
    return el("div", { class: "aa-baits" }, BAITS.map(b => {
      const left = this._baitLeft(b.id);
      return el("button", {
        class: `aa-bait${this.bait === b.id ? " on" : ""}${left <= 0 ? " empty" : ""}`, style: `--bt:${b.tint}`, disabled: left <= 0 || undefined,
        title: b.desc,
        onClick: () => { this.bait = b.id; audioManager.play("select"); onPick?.(); },
      }, [el("i"), el("b", {}, b.name), el("span", {}, left === Infinity ? "∞" : `×${left}`)]);
    }));
  }

  _orderRows() {
    const a = this._store();
    return el("div", { class: "aa-orders" }, a.orders.map(o => el("div", { class: `aa-order${o.have >= o.n ? " done" : ""}` }, [
      el("span", { class: "ic" }, o.type === "depth" ? "⬇" : o.type === "size" ? "📏" : o.type === "trip" ? "🧺" : "🐟"),
      el("span", { class: "tx" }, o.text),
      el("span", { class: "pg" }, `${Math.min(o.have, o.n)}/${o.n}`),
      el("span", { class: "rw" }, `◉ ${formatNumber(o.reward)}`),
    ])));
  }

  _showBoat() {
    const a = this._store();
    const P = this.panel;
    P.hidden = false;
    P.className = "aa-panel boat";
    P.innerHTML = "";
    const render = () => this._showBoat();
    P.append(
      el("div", { class: "aa-head" }, [
        el("b", {}, this.trip.casts ? `Trip: ${this.trip.fish} caught · ◉ ${formatNumber(this.trip.coins)}` : "On the boat"),
        el("span", {}, `◉ ${formatNumber(a.coins)} · line ${Math.round(this.maxLine)} m`),
      ]),
      el("div", { class: "aa-lbl" }, "Bait"),
      this._baitChips(render),
      el("div", { class: "aa-lbl" }, "Captain's orders"),
      this._orderRows(),
      el("div", { class: "aa-acts" }, [
        el("button", { class: "btn btn-primary btn-lg aa-cast", onClick: () => this._cast() }, `🎣 Cast · ${BAITS.find(b => b.id === this.bait).name}`),
        el("button", { class: "btn btn-ghost", onClick: () => this._openDock() }, "⚓ Dock"),
        el("button", { class: "btn btn-ghost", onClick: () => this._openLog() }, "📖 Log"),
        el("button", { class: "btn btn-ghost", onClick: () => this._endTrip() }, "🏠 Home"),
      ]),
    );
  }

  _hidePanel() { this.panel.hidden = true; this.panel.innerHTML = ""; }

  /** Spend the bait and drop the line. */
  _cast() {
    if (this.phase !== "boat" && this.phase !== "result") return;
    const a = this._store();
    if (this._baitLeft(this.bait) <= 0) this.bait = "worm";
    if (this.bait !== "worm") a.baits[this.bait] -= 1;
    this._save();
    this._hidePanel();
    this.trip.casts += 1;
    this.timeIdx = (this.trip.casts + 1) % TIMES.length;
    this.maxLine = this._stat("depth");
    this.phase = "descend";
    this.hook = { x: 0.5, y: 0, vx: 0 };
    this.depth = 0; this.maxReached = 0;
    this.hazards = []; this.shoal = []; this.pickups = []; this.bubbles = [];
    this.tension = 0; this.caught = null; this.waitT = 0; this.message = ""; this.messageT = 0;
    this.pearlsRun = 0;
    this.perfect = true;
    audioManager.play("swoosh");
    this._say(`${this._zoneAt(0).name}`);
  }

  // ============================================================ UPDATE ===
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.messageT > 0) this.messageT -= dt;
    const left = this.input.isDown("ArrowLeft", "KeyA");
    const right = this.input.isDown("ArrowRight", "KeyD");
    const down = this.input.isDown("ArrowDown", "KeyS");
    const pulling = this.input.isDown("Space", "ArrowUp", "KeyW") || this._pointerHold || this._reelTap || !!this.input.virtual?.a;
    this._reelTap = false;

    if (this.phase === "descend") this._stepDescend(dt, left, right, down);
    else if (this.phase === "wait") this._stepWait(dt);
    else if (this.phase === "fight") this._stepFight(dt, pulling, left, right);
    else if (this.phase === "reel") this._stepReel(dt);
    this._stepMotes(dt);
    this._stepDistant(dt);
    if (this.phase !== "boat" && this.phase !== "result") this._updateHud();
  }

  _stepDescend(dt, left, right, down) {
    const h = this.hook;
    const steer = this._stat("steer");
    const fall = 34 + this.depth * 0.055;
    this.depth += fall * dt;
    if (left) h.vx -= 2.1 * steer * dt;
    if (right) h.vx += 2.1 * steer * dt;
    if (!left && !right) h.vx *= Math.pow(0.02, dt);
    h.vx = clamp(h.vx, -1.1, 1.1);
    h.x = clamp(h.x + h.vx * dt, 0.06, 0.94);

    // Hazards rise past the hook; the mix changes with depth.
    const rate = 0.9 + this.depth / 150;
    if (Math.random() < rate * dt) {
      const kinds = ["jelly", "debris"];
      if (this.depth > 240) kinds.push("jelly");
      if (this.depth > 300) kinds.push("mine");
      this.hazards.push({ kind: choice(kinds), x: randFloat(0.08, 0.92), y: 1.15, r: randFloat(0.03, 0.055), drift: randFloat(-0.09, 0.09), phase: randFloat(0, 7) });
    }
    // Sharks patrol across the twilight water — the warning comes first.
    if (this.depth > 100 && this.depth < 480 && Math.random() < dt * 0.09 && !this.hazards.some(z => z.kind === "shark")) {
      const fromLeft = Math.random() < 0.5;
      this.hazards.push({ kind: "shark", x: fromLeft ? -0.3 : 1.3, y: randFloat(0.55, 0.8), dir: fromLeft ? 1 : -1, r: 0.06, warn: 1.2, phase: 0 });
    }
    // Pearls to grab on the way down.
    if (Math.random() < dt * 0.55) this.pickups.push({ x: randFloat(0.1, 0.9), y: 1.1, kind: Math.random() < 0.12 + this._stat("luck") * 0.01 ? "gold" : "pearl", ph: randFloat(0, 6) });

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const z = this.hazards[i];
      if (z.kind === "shark") {
        if (z.warn > 0) { z.warn -= dt; continue; }
        z.x += z.dir * 0.42 * dt; z.y -= (fall / 460) * dt * 0.4; z.phase += dt;
        if (z.x < -0.4 || z.x > 1.4) { this.hazards.splice(i, 1); continue; }
        if (Math.abs(z.x - h.x) < 0.12 && Math.abs(z.y - 0.42) < 0.05) { this._snap("A shark bit straight through the line!"); return; }
        continue;
      }
      z.y -= (fall / 460) * dt;
      z.x = clamp(z.x + Math.sin(this.elapsed * 1.4 + z.phase) * z.drift * dt, 0.04, 0.96);
      if (z.y < -0.2) { this.hazards.splice(i, 1); continue; }
      const dx = z.x - h.x, dy = z.y - 0.42;
      if (Math.hypot(dx * 1.1, dy) < z.r * (z.kind === "mine" ? 1.25 : 1) + 0.028) {
        this._snap(z.kind === "jelly" ? "A jellyfish wrapped the line." : z.kind === "mine" ? "BOOM — an old sea mine!" : "Debris cut the line clean.");
        return;
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.y -= (fall / 460) * dt; p.ph += dt;
      if (p.y < -0.1) { this.pickups.splice(i, 1); continue; }
      if (Math.hypot((p.x - h.x) * 1.1, p.y - 0.42) < 0.05) {
        const v = Math.round((p.kind === "gold" ? 30 : 6) * (1 + this.depth / 120));
        this.pearlsRun += v; this.trip.coins += v; this.coinsRun += v; this._store().coins += v;
        this.addScore(v);
        this._float(`+${v}`, p.kind === "gold" ? "#ffd76a" : "#ffffff");
        audioManager.play("coin");
        this.pickups.splice(i, 1);
      }
    }
    if (down || this.depth >= this.maxLine) {
      this.depth = Math.min(this.depth, this.maxLine);
      this.phase = "wait";
      this.hazards = []; this.pickups = [];
      this.waitT = 0;
      this._spawnShoal();
      this._say(this.depth >= this.maxLine ? "End of the line — waiting" : "Waiting for a bite");
      this._checkOrders("depth", { depth: this.depth });
    }
  }

  /** Who is circling down here. Better bait tilts the roll toward rarities. */
  _spawnShoal() {
    const b = BAITS.find(x => x.id === this.bait) || BAITS[0];
    const pool = FISH.filter(f => this.depth >= f.min && this.depth <= f.max && (!f.boss || f.bait === this.bait));
    this.shoal = [];
    const n = 3 + Math.min(3, Math.floor(this.depth / 180));
    const luck = this._stat("luck");
    for (let i = 0; i < n && pool.length; i++) {
      const weighted = pool.map(f => ({ f, w: Math.pow(b.bias, f.rarity - 1) / Math.pow(2.4, f.rarity - 1) }));
      const total = weighted.reduce((s, x) => s + x.w, 0);
      let roll = Math.random() * total, pick = weighted[0].f;
      for (const x of weighted) { if (roll < x.w) { pick = x.f; break; } roll -= x.w; }
      this.shoal.push({
        spec: pick, golden: !pick.boss && Math.random() < 0.025 + luck * 0.006,
        x: randFloat(0.1, 0.9), y: randFloat(0.52, 0.86), dir: Math.random() < 0.5 ? -1 : 1, t: randFloat(0, 7), speed: randFloat(0.05, 0.14), interest: 0,
      });
    }
    // Sometimes it's not a fish at all.
    const tre = TREASURES.filter(x => this.depth >= x.min);
    if (Math.random() < 0.18 + luck * 0.015 && tre.length) {
      const tot = tre.reduce((s, x) => s + x.weight * (x.value > 50 ? 1 + luck * 0.15 : 1), 0);
      let r = Math.random() * tot, pick = tre[0];
      for (const x of tre) { const w = x.weight * (x.value > 50 ? 1 + luck * 0.15 : 1); if (r < w) { pick = x; break; } r -= w; }
      this.shoal.push({ item: pick, x: randFloat(0.2, 0.8), y: randFloat(0.6, 0.85), dir: 1, t: 0, speed: 0, interest: 0.2 });
    }
  }

  _stepWait(dt) {
    this.waitT += dt;
    let biter = null;
    for (const s of this.shoal) {
      s.t += dt;
      if (s.item) {
        // Treasure doesn't swim: it drifts up the line to the hook slowly.
        s.interest += dt * 0.12;
        s.x += (this.hook.x - s.x) * dt * 0.3; s.y += (0.42 - s.y) * dt * 0.25;
        if (s.interest > 2.4 && Math.abs(s.y - 0.42) < 0.06) biter = s;
        continue;
      }
      const towards = s.interest > 0.5;
      const tx = towards ? this.hook.x : s.x + s.dir * s.speed * dt;
      s.x = clamp(s.x + (tx - s.x) * (towards ? dt * 1.6 : 1), 0.06, 0.94);
      s.y += Math.sin(s.t * 1.3) * 0.02 * dt + (towards ? (0.42 - s.y) * dt * 1.2 : 0);
      if (s.x <= 0.07 || s.x >= 0.93) s.dir *= -1;
      s.interest += dt * (0.10 + (1 - Math.min(1, Math.abs(s.x - this.hook.x) * 4)) * 0.55) / s.spec.fight;
      if (s.interest > 1.6 && Math.abs(s.y - 0.42) < 0.05 && Math.abs(s.x - this.hook.x) < 0.06) biter = s;
    }
    if (biter) {
      if (biter.item) {
        this.caught = { item: biter.item, progress: 0, mood: 0, phase: 0, fight: 0.4, run: 0, runT: 3 };
        this._say(`Something heavy… ${biter.item.name}?`);
      } else {
        this.caught = { spec: biter.spec, golden: biter.golden, cm: this._sizeOf(biter.spec), progress: 0, mood: 0, phase: 0, fight: biter.spec.fight, run: 0, runT: randFloat(1, 2) };
        this._say(`${biter.golden ? "✨ GOLDEN " : ""}${biter.spec.name}!`);
      }
      this.shoal = this.shoal.filter(s => s !== biter);
      this.phase = "fight";
      this.tension = 0.1;
      audioManager.play("powerup");
      this.shake();
    }
    if (this.waitT > 26) { this.caught = null; this._say("Nothing is interested. Reeling up."); this.phase = "reel"; }
  }

  _sizeOf(spec) { return Math.round((18 + spec.size * 90) * randFloat(0.72, 1.38)); }

  /**
   * The fight. Pulling raises tension and reels in; letting go bleeds tension
   * but gives line back. The fish surges on its own rhythm, and now and then
   * runs to one side: hold the opposite way and it tires faster.
   */
  _stepFight(dt, pulling, left, right) {
    const c = this.caught;
    const lineStr = this._stat("line"), reel = this._stat("reel");
    c.phase += dt * (1.1 + c.fight * 0.22);
    c.mood = Math.max(0, Math.sin(c.phase)) * c.fight;
    c.runT -= dt;
    if (c.runT <= 0) { c.run = c.run ? 0 : (Math.random() < 0.5 ? -1 : 1); c.runT = c.run ? randFloat(1.2, 2.2) : randFloat(1, 2.4); }
    const against = c.run && ((c.run < 0 && right) || (c.run > 0 && left));
    const withIt = c.run && ((c.run < 0 && left) || (c.run > 0 && right));
    if (pulling) {
      c.progress += reel * 0.19 * dt * (against ? 1.45 : withIt ? 0.6 : c.run ? 0.8 : 1);
      this.tension += (0.30 + c.mood * 0.42) / lineStr * dt * (against ? 0.65 : c.run ? 1.25 : 1);
      if (Math.random() < 0.5) this._bubble();
    } else {
      c.progress -= (0.05 + c.mood * 0.08) * dt * (c.run ? 1.4 : 1);
      this.tension -= 0.55 * dt;
    }
    c.progress = clamp(c.progress, 0, 1);
    this.tension = clamp(this.tension, 0, 1.25);
    if (this.tension > 0.8) this.perfect = false;
    if (this.tension >= 1) { this._snap(`The line parted. The ${c.item ? c.item.name : c.spec.name} is gone.`); return; }
    if (c.progress >= 1) {
      this.phase = "reel";
      this._say(c.item ? `Hauling up the ${c.item.name}` : `Got it! Reeling up…`);
      audioManager.play("win");
    }
  }

  _stepReel(dt) {
    this.depth -= (140 + this._stat("reel") * 60) * dt;
    if (this.depth <= 0) { this.depth = 0; this._land(); }
  }

  // ====================================================== OUTCOMES =======
  /** A catch reaches the deck: bank it, log it, show the card. */
  _land() {
    const a = this._store();
    const c = this.caught;
    if (a.bestDepth < Math.round(this.maxReached || 0)) a.bestDepth = Math.round(this.maxReached || 0);
    if (!c) { this._save(); this._result({ kind: "empty" }); return; }
    if (c.item) {
      const it = c.item;
      const worth = Math.round(it.value * randFloat(0.8, 1.3));
      a.coins += worth; this.trip.coins += worth; this.coinsRun += worth; this.addScore(worth);
      a.treasure[it.id] = (a.treasure[it.id] || 0) + 1;
      this._save();
      this._result({ kind: "item", item: it, worth });
      return;
    }
    const spec = c.spec, cm = c.cm;
    let worth = Math.round(spec.value * (0.6 + cm / (18 + spec.size * 90) * 0.6));
    if (c.golden) worth *= 4;
    const bonus = this.perfect ? Math.round(worth * 0.2) : 0;
    worth += bonus;
    a.coins += worth; this.trip.coins += worth; this.coinsRun += worth; this.trip.fish += 1;
    const entry = a.log[spec.id] || { n: 0, best: 0 };
    const isNew = entry.n === 0, record = !isNew && cm > entry.best;
    entry.n += 1; entry.best = Math.max(entry.best, cm);
    if (c.golden) { entry.golden = (entry.golden || 0) + 1; a.golden += 1; }
    a.log[spec.id] = entry;
    if (a.bestFish < worth) a.bestFish = worth;
    if (!this.trip.best || worth > this.trip.best.worth) this.trip.best = { spec, cm, worth };
    this.addScore(worth);
    const done = this._checkOrders("catch", { spec, cm });
    this._save();
    this._result({ kind: "fish", spec, cm, worth, golden: c.golden, isNew, record, perfect: bonus, orders: done, kg: weightKg(spec, cm) });
  }

  _snap(reason) {
    this._say(reason, true);
    audioManager.play("gameover");
    this.shake();
    const a = this._store();
    if (a.bestDepth < Math.round(this.maxReached || this.depth)) a.bestDepth = Math.round(this.maxReached || this.depth);
    this._save();
    this.phase = "snapped";
    this.snapT = 0;
    this.hazards = []; this.pickups = [];
    setTimeout(() => { if (this.phase === "snapped" && this.state === "playing") this._result({ kind: "snap", reason }); }, 900);
  }

  /** The card on deck after every cast. The trip goes on from here. */
  _result(r) {
    this.phase = "result";
    this.depth = 0;
    const P = this.panel;
    P.hidden = false;
    P.className = `aa-panel result ${r.kind}${r.golden ? " golden" : ""}`;
    P.innerHTML = "";
    const card = el("div", { class: "aa-card" });
    if (r.kind === "fish" || r.kind === "item") {
      const cv = el("canvas", { width: 520, height: 260, class: "aa-trophy" });
      card.appendChild(cv);
      this._trophy = { cv, r, t: 0 };
      const badges = [];
      if (r.isNew) badges.push(el("span", { class: "aa-badge new" }, "NEW SPECIES"));
      if (r.record) badges.push(el("span", { class: "aa-badge rec" }, "RECORD"));
      if (r.golden) badges.push(el("span", { class: "aa-badge gold" }, "✨ GOLDEN ×4"));
      if (r.perfect) badges.push(el("span", { class: "aa-badge perf" }, `Perfect fight +◉${formatNumber(r.perfect)}`));
      if (r.spec?.boss) badges.push(el("span", { class: "aa-badge boss" }, "ABYSSAL GIANT"));
      const name = r.kind === "fish" ? `${r.golden ? "Golden " : ""}${r.spec.name}` : r.item.name;
      card.append(
        el("div", { class: "aa-badges" }, badges),
        el("h3", {}, name),
        r.kind === "fish" ? el("div", { class: "aa-stats" }, [el("span", {}, `📏 ${r.cm} cm`), el("span", {}, `⚖ ${r.kg} kg`), el("span", {}, `⬇ ${Math.round(this.maxReached)} m`), el("span", { class: "v" }, `◉ ${formatNumber(r.worth)}`)])
          : el("div", { class: "aa-stats" }, [el("span", {}, `⬇ ${Math.round(this.maxReached)} m`), el("span", { class: "v" }, `◉ ${formatNumber(r.worth)}`)]),
        el("p", { class: "aa-fact" }, r.kind === "fish" ? r.spec.fact || "" : r.item.fact),
      );
      for (const o of r.orders || []) card.append(el("div", { class: "aa-orderdone" }, `✔ Order complete: ${o.text} · +◉ ${formatNumber(o.reward)}`));
      audioManager.play(r.isNew || r.golden ? "achievement" : "coin");
    } else if (r.kind === "snap") {
      card.append(el("div", { class: "aa-big" }, "💥"), el("h3", {}, "Line snapped!"), el("p", { class: "aa-fact" }, r.reason), el("p", { class: "aa-fact" }, `You reached ${Math.round(this.maxReached || 0)} m${this.pearlsRun ? ` and picked up ◉ ${this.pearlsRun} in pearls` : ""}.`));
    } else {
      card.append(el("div", { class: "aa-big" }, "🪝"), el("h3", {}, "Empty hook"), el("p", { class: "aa-fact" }, "Nothing bit this time. Try different bait, or a different depth."));
    }
    const rerender = () => { const chips = P.querySelector(".aa-baits"); if (chips) chips.replaceWith(this._baitChips(rerender)); const btn = P.querySelector(".aa-cast"); if (btn) btn.textContent = `🎣 Cast again · ${BAITS.find(b => b.id === this.bait).name}`; };
    P.append(
      card,
      el("div", { class: "aa-lbl" }, "Bait for the next cast"),
      this._baitChips(rerender),
      el("div", { class: "aa-acts" }, [
        el("button", { class: "btn btn-primary btn-lg aa-cast", onClick: () => this._cast() }, `🎣 Cast again · ${BAITS.find(b => b.id === this.bait).name}`),
        el("button", { class: "btn btn-ghost", onClick: () => this._toBoat() }, "⛵ Boat"),
        el("button", { class: "btn btn-ghost", onClick: () => this._openDock() }, "⚓ Dock"),
        el("button", { class: "btn btn-ghost", onClick: () => this._endTrip() }, "🏠 Home"),
      ]),
    );
    this._updateHud();
  }

  _endTrip() {
    const a = this._store();
    this._hidePanel();
    const t = this.trip;
    this.endGame({
      result: "score",
      score: this.coinsRun,
      message: t.fish ? `Back in port with ${t.fish} fish${t.best ? ` — best: a ${t.best.cm} cm ${t.best.spec.name}` : ""}.` : "Back in port. The sea keeps its secrets — for now.",
      extraStats: [
        { label: "Casts", value: t.casts }, { label: "Fish", value: t.fish },
        { label: "Log", value: `${Object.keys(a.log).length}/${FISH.length}` }, { label: "Deepest", value: `${a.bestDepth} m` },
      ],
    });
  }

  // ======================================================== ORDERS =======
  _fillOrders() {
    const a = this._store();
    a.orders = a.orders.filter(o => o.have < o.n);
    let guard = 0;
    while (a.orders.length < 3 && guard++ < 20) {
      const o = this._makeOrder();
      if (o && !a.orders.some(x => x.text === o.text)) a.orders.push(o);
    }
  }

  _makeOrder() {
    const reach = this._stat("depth");
    const pool = FISH.filter(f => !f.boss && f.min < reach - 20);
    const r = Math.random();
    if (r < 0.5 && pool.length) {
      const f = choice(pool.slice(-Math.min(pool.length, 16)));
      const n = f.rarity <= 2 ? 3 : f.rarity === 3 ? 2 : 1;
      return { type: "species", id: f.id, n, have: 0, text: `Catch ${n === 1 ? "a" : n} ${f.name}${n > 1 ? "s" : ""}`, reward: Math.round(f.value * (1.4 + n * 0.6)) };
    }
    if (r < 0.7 && pool.length) {
      const f = choice(pool);
      const cm = Math.round((18 + f.size * 90) * 1.15);
      return { type: "size", id: f.id, n: 1, have: 0, min: cm, text: `A ${f.name} of ${cm} cm or more`, reward: Math.round(f.value * 3) };
    }
    if (r < 0.85) {
      const d = Math.round(Math.min(reach, Math.max(80, this._store().bestDepth + 40)) / 10) * 10;
      return { type: "depth", n: 1, have: 0, min: d, text: `Wait for a bite at ${d} m or deeper`, reward: Math.round(40 + d * 1.6) };
    }
    return { type: "trip", n: 4, have: 0, text: "Land 4 fish in one trip", reward: Math.round(120 + reach * 1.2) };
  }

  /** Updates orders; pays and replaces the finished ones. Returns those paid. */
  _checkOrders(event, d) {
    const a = this._store();
    const done = [];
    for (const o of a.orders) {
      if (o.have >= o.n) continue;
      if (event === "catch" && o.type === "species" && d.spec.id === o.id) o.have++;
      else if (event === "catch" && o.type === "size" && d.spec.id === o.id && d.cm >= o.min) o.have++;
      else if (event === "catch" && o.type === "trip") o.have = Math.max(o.have, this.trip.fish);
      else if (event === "depth" && o.type === "depth" && d.depth >= o.min) o.have++;
      if (o.have >= o.n) { a.coins += o.reward; this.trip.coins += o.reward; this.coinsRun += o.reward; this.addScore(o.reward); done.push(o); }
    }
    if (done.length) {
      // Trip orders reset each trip; the rest are replaced.
      this._fillOrders();
      if (event === "depth") this._say(`Order complete! +◉ ${done.reduce((s, o) => s + o.reward, 0)}`);
      audioManager.play("achievement");
    }
    return done;
  }

  // ========================================================= DOCK ========
  _openDock() {
    const a = this._store();
    this._modalOpen = true;
    const body = el("div", { class: "rig-shop" });
    const head = el("strong", { class: "rig-credits" });
    const grid = el("div", { class: "rig-grid" });
    const baitRow = el("div", { class: "bait-row" });
    const tre = el("div", { class: "aa-tre" });
    const render = () => {
      head.textContent = `◉ ${formatNumber(a.coins)} coins`;
      grid.innerHTML = "";
      for (const g of GEAR) {
        const lv = this._lv(g.id), maxed = lv >= 10, cost = this._cost(g);
        grid.appendChild(el("button", {
          class: `rig-card${maxed ? " maxed" : ""}${!maxed && a.coins < cost ? " poor" : ""}`, disabled: maxed || a.coins < cost,
          onClick: () => { if (maxed || a.coins < cost) return; a.coins -= cost; a.lv[g.id] = lv + 1; this.maxLine = this._stat("depth"); this._save(); audioManager.play("powerup"); render(); },
        }, [
          el("span", { class: "nm" }, g.name), el("span", { class: "ds" }, g.desc),
          el("span", { class: "pips" }, [...Array(10)].map((_, i) => el("i", { class: i < lv ? "on" : "" }))),
          el("span", { class: "cost" }, maxed ? "Maxed" : `◉ ${formatNumber(cost)}`),
        ]));
      }
      baitRow.innerHTML = "";
      for (const b of BAITS.filter(x => x.cost > 0)) {
        const price = b.cost * PACK, afford = a.coins >= price;
        baitRow.appendChild(el("button", {
          class: `bait-card${afford ? "" : " poor"}`, disabled: !afford, style: `--bt:${b.tint}`,
          onClick: () => { if (!afford) return; a.coins -= price; a.baits[b.id] = (a.baits[b.id] || 0) + PACK; this._save(); audioManager.play("coin"); render(); },
        }, [el("span", { class: "sw" }), el("span", { class: "nm" }, `${b.name} ×${PACK}`), el("span", { class: "ds" }, `${b.desc} You have ${a.baits[b.id] || 0}.`), el("span", { class: "cost" }, `◉ ${formatNumber(price)}`)]));
      }
      tre.innerHTML = "";
      for (const t of TREASURES) tre.appendChild(el("span", { class: `aa-tr${a.treasure[t.id] ? "" : " none"}` }, `${a.treasure[t.id] ? t.name : "???"} ×${a.treasure[t.id] || 0}`));
    };
    render();
    body.append(
      el("p", { class: "zone-intro" }, "Bait comes in packs of five and is spent one per cast. Gear is permanent."),
      head,
      el("h4", { class: "dock-h" }, "Bait"), baitRow,
      el("h4", { class: "dock-h" }, "Gear"), grid,
      el("h4", { class: "dock-h" }, "Treasure found"), tre,
    );
    openModal({
      title: "The Dock", bodyNode: body,
      onClose: () => { this._modalOpen = false; if (this.phase === "boat") this._showBoat(); else if (this.phase === "result") this._refreshResultBaits(); },
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Back to the boat"),
        el("button", { class: "btn btn-ghost", onClick: () => { closeModal(); setTimeout(() => this._openLog(), 30); } }, "Species log"),
      ]),
    });
  }

  _refreshResultBaits() {
    const chips = this.panel.querySelector(".aa-baits");
    if (chips) chips.replaceWith(this._baitChips(() => this._refreshResultBaits()));
    const btn = this.panel.querySelector(".aa-cast");
    if (btn) btn.textContent = `🎣 Cast again · ${BAITS.find(b => b.id === this.bait).name}`;
  }

  _openLog() {
    const a = this._store();
    this._modalOpen = true;
    const grid = el("div", { class: "fish-grid" });
    for (const f of FISH) {
      const caught = a.log[f.id];
      const card = el("div", { class: `fish-card${caught ? " caught" : ""}${f.boss ? " boss" : ""}` }, [
        el("span", { class: "prev" }),
        el("span", { class: "nm" }, caught ? `${caught.golden ? "✨ " : ""}${f.name}` : "?????"),
        el("span", { class: "st" }, caught ? `${caught.n} landed · best ${caught.best} cm` : `${f.min}–${f.max} m${f.boss ? ` · ${BAITS.find(b => b.id === f.bait).name}` : ""}`),
        caught && f.fact ? el("span", { class: "st fact" }, f.fact) : null,
      ]);
      const c = el("canvas", { width: 200, height: 112 });
      c.style.cssText = "width:100px;height:56px";
      const cx = c.getContext("2d");
      cx.scale(2, 2); cx.translate(50, 28);
      const k = Math.min(0.7, 0.62 / Math.max(0.6, f.size * 0.55));
      paintFish(cx, f, 0.5, k * 1.4, { alpha: caught ? 1 : 0.6 });
      if (!caught) { cx.globalCompositeOperation = "source-atop"; cx.fillStyle = "rgba(6,12,24,0.78)"; cx.fillRect(-50, -28, 100, 56); }
      card.querySelector(".prev").appendChild(c);
      grid.appendChild(card);
    }
    openModal({
      title: `Species Log — ${Object.keys(a.log).length}/${FISH.length}`,
      bodyNode: el("div", { class: "fish-log" }, [el("p", { class: "zone-intro" }, "Each species is logged the first time you land it. Golden catches are marked ✨."), grid]),
      onClose: () => { this._modalOpen = false; },
      footerNode: el("div", { class: "modal-foot" }, [el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Close")]),
    });
  }

  // ======================================================== HELPERS ======
  _say(text, bad = false) { this.message = text; this.messageBad = bad; this.messageT = 2.4; }
  _float(text, color) { (this.floats = this.floats || []).push({ text, color, x: this.hook.x, y: 0.4, t: 0 }); }
  _bubble() { this.bubbles.push({ x: this.hook.x + randFloat(-0.03, 0.03), y: 0.42, r: randFloat(1.5, 4), t: 0 }); }
  _stepMotes(dt) {
    this.maxReached = Math.max(this.maxReached || 0, this.depth);
    const fast = this.phase === "reel" ? 6 : this.phase === "descend" ? 2.2 : 1;
    for (const m of this.motes) { m.y -= (m.s / 900) * dt * fast; if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); } }
    for (let i = this.bubbles.length - 1; i >= 0; i--) { const b = this.bubbles[i]; b.t += dt; b.y -= 0.22 * dt; if (b.t > 1.4) this.bubbles.splice(i, 1); }
    if (this.floats) { for (const f of this.floats) { f.t += dt; f.y -= 0.08 * dt; } this.floats = this.floats.filter(f => f.t < 1); }
  }
  /** Big shapes passing far off in the gloom: whales, shoals, a turtle. */
  _stepDistant(dt) {
    if (this.phase === "boat" || this.phase === "result") return;
    if (Math.random() < dt * 0.05 && this.distant.length < 2) {
      const kind = this.depth < 120 ? choice(["turtle", "shoal", "shoal"]) : this.depth < 400 ? choice(["whale", "shoal"]) : "whale";
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.distant.push({ kind, dir, x: dir > 0 ? -0.4 : 1.4, y: randFloat(0.2, 0.85), s: randFloat(0.7, 1.3), t: 0 });
    }
    for (const d of this.distant) { d.t += dt; d.x += d.dir * dt * (d.kind === "whale" ? 0.03 : 0.06); }
    this.distant = this.distant.filter(d => d.x > -0.6 && d.x < 1.6);
  }

  _updateHud() {
    this.setHud({
      Coins: `◉ ${formatNumber(this.coinsRun)}`,
      Depth: `${Math.round(this.depth)} m`,
      Line: `${Math.round(this.maxLine)} m`,
      Zone: `${ZONES.indexOf(this._zoneAt(this.depth)) + 1}/${ZONES.length}`,
    });
  }

  // ======================================================== RENDER =======
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    if (!W || !H) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    if (this.phase === "boat" || this.phase === "result") this._drawSurface(ctx, W, H);
    else {
      this._drawWater(ctx, W, H);
      this._drawDistant(ctx, W, H);
      this._drawMotes(ctx, W, H);
      this._drawFloor(ctx, W, H);
      if (this._zoneAt(this.depth).weed) this._drawWeed(ctx, W, H);
      this._drawLine(ctx, W, H);
      this._drawPickups(ctx, W, H);
      this._drawShoal(ctx, W, H);
      this._drawHazards(ctx, W, H);
      this._drawHook(ctx, W, H);
      this._drawBubbles(ctx, W, H);
      this._drawDark(ctx, W, H);
      this._drawUI(ctx, W, H);
    }
    ctx.restore();
    if (this._trophy && this.phase === "result") this._paintTrophy(dt || 1 / 60);
  }

  /** The surface: sky by time of day, sun or moon, the boat and you. */
  _drawSurface(ctx, W, H) {
    const T = TIMES[this.timeIdx || 1];
    const sea = H * 0.42;
    const g = ctx.createLinearGradient(0, 0, 0, sea);
    g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, sea);
    if (T.night > 0.5) for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.abs(Math.sin(this.elapsed + i))})`; ctx.fillRect((i * 97) % W, (i * 53) % (sea * 0.8), 1.5, 1.5); }
    const sx = W * 0.78, sy = sea * (T.night > 0.5 ? 0.3 : T.name === "Day" ? 0.25 : 0.7);
    const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 60); sg.addColorStop(0, hexA(T.sun, 0.9)); sg.addColorStop(1, hexA(T.sun, 0));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, 7); ctx.fill();
    ctx.fillStyle = T.sun; ctx.beginPath(); ctx.arc(sx, sy, 18, 0, 7); ctx.fill();
    // Clouds.
    ctx.fillStyle = `rgba(255,255,255,${T.night > 0.5 ? 0.12 : 0.7})`;
    for (let i = 0; i < 4; i++) { const cx = ((i * 0.31 + this.elapsed * 0.008) % 1.3 - 0.15) * W, cy = sea * (0.15 + (i % 2) * 0.18); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(cx + k * 18, cy + Math.sin(k) * 5, 14 + (k % 2) * 6, 0, 7); ctx.fill(); } }
    // Distant island.
    ctx.fillStyle = T.night > 0.5 ? "#0a1428" : "#3a7a5a";
    ctx.beginPath(); ctx.moveTo(W * 0.05, sea); ctx.quadraticCurveTo(W * 0.15, sea - 34, W * 0.3, sea); ctx.fill();
    // Sea.
    const wg = ctx.createLinearGradient(0, sea, 0, H);
    wg.addColorStop(0, T.night > 0.5 ? "#13305a" : "#2b8fc4"); wg.addColorStop(1, T.night > 0.5 ? "#050c1a" : "#0a3a5e");
    ctx.fillStyle = wg; ctx.fillRect(0, sea, W, H - sea);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5;
    for (let r = 0; r < 6; r++) { const y = sea + 10 + r * 22; ctx.beginPath(); for (let x = 0; x <= W; x += 10) { const yy = y + Math.sin(x * 0.04 + this.elapsed * 1.5 + r) * 2; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke(); }
    // Sun glitter.
    ctx.fillStyle = hexA(T.sun, 0.5); for (let i = 0; i < 20; i++) { const y = sea + 6 + i * 8; ctx.fillRect(sx - 20 + Math.sin(this.elapsed * 3 + i) * 14, y, 24 - i, 2); }
    // The boat, bobbing.
    const bx = W * 0.45, by = sea + 4 + Math.sin(this.elapsed * 1.4) * 3, rot = Math.sin(this.elapsed * 1.1) * 0.03;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(rot);
    ctx.fillStyle = "#8a4a2a"; ctx.beginPath(); ctx.moveTo(-70, -10); ctx.lineTo(70, -10); ctx.lineTo(52, 16); ctx.lineTo(-56, 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#f4f0e8"; ctx.fillRect(-70, -12, 140, 5);
    ctx.fillStyle = "#c0503a"; ctx.fillRect(-60, 2, 112, 4);
    ctx.fillStyle = "#e8e0d0"; ctx.fillRect(-40, -38, 34, 28); ctx.fillStyle = "#3a6a8a"; ctx.fillRect(-34, -32, 10, 9); ctx.fillRect(-20, -32, 10, 9);
    ctx.fillStyle = "#c0503a"; ctx.beginPath(); ctx.moveTo(-44, -38); ctx.lineTo(-23, -50); ctx.lineTo(-2, -38); ctx.fill();
    // The angler and the rod.
    ctx.fillStyle = "#2c4f9a"; ctx.fillRect(18, -32, 14, 22);
    ctx.fillStyle = "#f1c9a5"; ctx.beginPath(); ctx.arc(25, -38, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8c46a"; ctx.beginPath(); ctx.ellipse(25, -43, 12, 3.5, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(25, -45, 6, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(30, -22); ctx.lineTo(78, -70); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx + 78, by - 70); ctx.quadraticCurveTo(bx + 100, sea - 20, bx + 108, sea + 6); ctx.stroke();
    ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.arc(bx + 108, sea + 6 + Math.sin(this.elapsed * 2) * 2, 3.5, 0, 7); ctx.fill();
    // Gulls.
    ctx.strokeStyle = T.night > 0.5 ? "rgba(255,255,255,0.3)" : "#2a2a3a"; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const gx = ((this.elapsed * 0.03 + i * 0.3) % 1.2 - 0.1) * W, gy = sea * (0.25 + i * 0.12) + Math.sin(this.elapsed * 2 + i) * 5, f = Math.sin(this.elapsed * 6 + i) * 3; ctx.beginPath(); ctx.moveTo(gx - 8, gy + f); ctx.quadraticCurveTo(gx - 4, gy - 4, gx, gy); ctx.quadraticCurveTo(gx + 4, gy - 4, gx + 8, gy + f); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "700 12px Inter, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(T.name, 12, 20);
  }

  /** The caught fish on the card, slowly turning in the light. */
  _paintTrophy(dt) {
    const tr = this._trophy;
    if (!tr.cv.isConnected) { this._trophy = null; return; }
    tr.t += dt;
    const c = tr.cv.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, 520, 260);
    const g = c.createRadialGradient(260, 130, 10, 260, 130, 250);
    g.addColorStop(0, tr.r.golden ? "rgba(255,215,106,0.45)" : "rgba(124,240,255,0.25)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 520, 260);
    c.translate(260, 130 + Math.sin(tr.t * 2) * 4);
    c.rotate(Math.sin(tr.t * 1.3) * 0.06);
    if (tr.r.kind === "item") paintTreasure(c, tr.r.item.id, tr.t, 3.2);
    else {
      const s = tr.r.spec;
      const k = Math.min(3.2, 190 / (26 * s.size * (["eel", "sword", "shark", "squid"].includes(s.body) ? 1.9 : 1.35)));
      paintFish(c, s, tr.t * 1.4, k, { golden: tr.r.golden });
    }
  }

  _drawWater(ctx, W, H) {
    const d = this.depth;
    const zi = ZONES.indexOf(this._zoneAt(d));
    const next = ZONES[Math.min(ZONES.length - 1, zi + 1)], cur = ZONES[zi];
    const span = next.from - cur.from || 1, t = clamp((d - cur.from) / span, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, blend(cur.water[0], next.water[0], t)); g.addColorStop(1, blend(cur.water[1], next.water[1], t));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // God rays and caustics near the surface.
    const sun = clamp(1 - d / 130, 0, 1);
    if (sun > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const x = W * (0.05 + i * 0.18) + Math.sin(this.elapsed * 0.35 + i * 1.7) * 22;
        const rg = ctx.createLinearGradient(0, 0, 0, H);
        rg.addColorStop(0, `rgba(255,255,240,${0.16 * sun})`); rg.addColorStop(1, "rgba(255,255,240,0)");
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.moveTo(x - 14, 0); ctx.lineTo(x + 14, 0); ctx.lineTo(x + 70, H); ctx.lineTo(x + 10, H); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.09 * sun})`; ctx.lineWidth = 1.4;
      for (let k = 0; k < 18; k++) {
        const cx = ((k * 0.137 + Math.sin(this.elapsed * 0.3 + k) * 0.02) % 1) * W, cy = ((k * 0.29) % 0.5) * H;
        ctx.beginPath(); ctx.ellipse(cx, cy, 16 + Math.sin(this.elapsed + k) * 4, 7, k, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
    if (d < 40) {
      const y = (1 - d / 40) * 46 - 6;
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(0, 0, W, Math.max(0, y));
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 3;
      ctx.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = y + Math.sin(x * 0.05 + this.elapsed * 2) * 4; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke();
    }
  }

  _drawDistant(ctx, W, H) {
    for (const d of this.distant) {
      const x = d.x * W, y = d.y * H;
      ctx.save(); ctx.translate(x, y); ctx.scale(d.dir * d.s, d.s);
      ctx.fillStyle = "rgba(0,10,25,0.22)";
      if (d.kind === "whale") {
        ctx.beginPath(); ctx.ellipse(0, 0, 120, 30, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-110, 0); ctx.lineTo(-170, -26 + Math.sin(d.t) * 8); ctx.lineTo(-160, 0); ctx.lineTo(-170, 26 + Math.sin(d.t) * 8); ctx.fill();
        ctx.beginPath(); ctx.ellipse(20, 26, 40, 8, 0.4, 0, 7); ctx.fill();
      } else if (d.kind === "turtle") {
        ctx.beginPath(); ctx.ellipse(0, 0, 28, 18, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(32, -2, 8, 0, 7); ctx.fill();
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(10, s * 20, 16, 5, s * (0.5 + Math.sin(d.t * 3) * 0.3), 0, 7); ctx.fill(); }
      } else {
        for (let i = 0; i < 18; i++) { const fx = (i % 6) * 14 + Math.sin(d.t * 2 + i) * 4, fy = Math.floor(i / 6) * 10 + Math.cos(d.t + i) * 3; ctx.beginPath(); ctx.ellipse(fx, fy, 6, 2.4, 0, 0, 7); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  _drawMotes(ctx, W, H) {
    const z = this._zoneAt(this.depth);
    ctx.fillStyle = z.mote;
    for (const m of this.motes) { ctx.globalAlpha = 0.14 + m.r * 0.1; ctx.beginPath(); ctx.arc(m.x * W, m.y * H, m.r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  /** The sea floor rises into view at the end of the line, deep down. */
  _drawFloor(ctx, W, H) {
    if (this.phase === "descend" || this.depth < this.maxLine - 2 || this.depth < 200) return;
    const y = H * 0.9;
    const g = ctx.createLinearGradient(0, y - 30, 0, H);
    g.addColorStop(0, "rgba(40,36,48,0)"); g.addColorStop(0.3, "#1a1620"); g.addColorStop(1, "#0a080e");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.03) * 10 + Math.sin(x * 0.11) * 4); ctx.lineTo(W, H); ctx.fill();
    if (this.depth > 400) {
      // A hydrothermal vent puffing away.
      const vx = W * 0.78;
      ctx.fillStyle = "#2a2028"; ctx.beginPath(); ctx.moveTo(vx - 16, y + 10); ctx.lineTo(vx - 6, y - 26); ctx.lineTo(vx + 6, y - 26); ctx.lineTo(vx + 16, y + 10); ctx.fill();
      for (let i = 0; i < 6; i++) { const ph = (this.elapsed * 0.4 + i / 6) % 1; ctx.fillStyle = `rgba(60,50,70,${0.5 * (1 - ph)})`; ctx.beginPath(); ctx.arc(vx + Math.sin(i * 2 + this.elapsed) * 6 * ph, y - 30 - ph * 110, 8 + ph * 20, 0, 7); ctx.fill(); }
      ctx.fillStyle = "rgba(255,120,60,0.6)"; ctx.beginPath(); ctx.arc(vx, y - 26, 4, 0, 7); ctx.fill();
    }
  }

  _drawWeed(ctx, W, H) {
    ctx.save(); ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const x = (i / 8) * W + Math.sin(i * 3) * 20;
      for (const [lw, col] of [[9, "rgba(20,70,45,0.55)"], [4, "rgba(60,140,80,0.5)"]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x, H);
        for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(this.elapsed * 0.9 + i + k * 0.6) * k * 4, H - k * (H / 13));
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(60,140,80,0.5)";
      for (let k = 2; k <= 6; k += 2) { const yy = H - k * (H / 13), xx = x + Math.sin(this.elapsed * 0.9 + i + k * 0.6) * k * 4; ctx.beginPath(); ctx.ellipse(xx + 8, yy, 10, 4, 0.5, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }

  _drawLine(ctx, W, H) {
    const hx = this.hook.x * W, hy = H * 0.42;
    const taut = this.phase === "fight" ? this.tension : 0;
    ctx.strokeStyle = taut > 0.75 ? `rgba(255,120,140,${0.6 + Math.sin(this.elapsed * 30) * 0.3})` : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(W * 0.5, -10);
    ctx.quadraticCurveTo((W * 0.5 + hx) / 2 + Math.sin(this.elapsed) * 8 * (1 - taut), hy * 0.5, hx, hy); ctx.stroke();
  }

  _drawHook(ctx, W, H) {
    const x = this.hook.x * W, y = H * 0.42;
    const b = BAITS.find(v => v.id === this.bait) || BAITS[0];
    ctx.save(); ctx.translate(x, y);
    if (this.bait === "lure" || this.bait === "pearl") {
      const gg = ctx.createRadialGradient(0, 0, 1, 0, 0, 30);
      gg.addColorStop(0, hexA(b.tint, 0.8)); gg.addColorStop(1, hexA(b.tint, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = "#e6eaf5"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 2); ctx.arc(0, 4, 5, -Math.PI / 2, Math.PI * 0.85); ctx.stroke();
    ctx.fillStyle = "#c9ccd8"; ctx.beginPath(); ctx.arc(0, -14, 3, 0, 7); ctx.fill();
    ctx.fillStyle = b.tint; ctx.beginPath(); ctx.arc(1, 3, 4.5, 0, 7); ctx.fill();
    ctx.restore();
    if (this._stat("sonar") > 0 && this.phase === "wait") {
      const r = (this.elapsed * 90) % 220;
      ctx.strokeStyle = `rgba(124,240,208,${Math.max(0, 0.35 - r / 700)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    }
  }

  _drawPickups(ctx, W, H) {
    for (const p of this.pickups) {
      const x = p.x * W, y = p.y * H + Math.sin(p.ph * 2) * 3;
      const col = p.kind === "gold" ? "255,215,106" : "240,240,255";
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14); g.addColorStop(0, `rgba(${col},0.6)`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.fill();
      const pg = ctx.createRadialGradient(x - 2, y - 2, 0.5, x, y, 6); pg.addColorStop(0, "#ffffff"); pg.addColorStop(1, `rgb(${col})`);
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7); ctx.fill();
    }
    if (this.floats) for (const f of this.floats) { ctx.globalAlpha = 1 - f.t; ctx.fillStyle = f.color; ctx.font = "800 14px Sora, sans-serif"; ctx.textAlign = "center"; ctx.fillText(f.text, f.x * W, f.y * H - f.t * 30); ctx.globalAlpha = 1; }
  }

  _drawShoal(ctx, W, H) {
    const dim = this._stat("sonar") > 0 || this.depth < 200 ? 1 : 0.55;
    for (const s of this.shoal) {
      ctx.save(); ctx.translate(s.x * W, s.y * H);
      if (s.item) { ctx.rotate(Math.sin(s.t) * 0.1); paintTreasure(ctx, s.item.id, s.t, 0.6); ctx.restore(); continue; }
      const dir = s.interest > 0.5 ? Math.sign(this.hook.x - s.x) || 1 : s.dir;
      ctx.scale(dir, 1);
      paintFish(ctx, s.spec, s.t, 1.45, { alpha: dim, golden: s.golden });
      ctx.restore();
    }
    const c = this.caught;
    if (c && (this.phase === "fight" || this.phase === "reel")) {
      const y = H * (this.phase === "reel" ? 0.42 : 0.62 - c.progress * 0.16);
      const x = W * (0.5 + (this.phase === "fight" ? c.run * 0.18 : 0));
      ctx.save(); ctx.translate(x, y);
      if (c.item) { ctx.rotate(Math.sin(this.elapsed * 2) * 0.15); paintTreasure(ctx, c.item.id, this.elapsed, 1.2); }
      else {
        ctx.scale(c.run < 0 ? -1 : 1, 1);
        ctx.rotate(Math.sin(c.phase * 3) * 0.16 * (1 + c.mood));
        paintFish(ctx, c.spec, this.elapsed * (3 + c.mood), 1.9, { golden: c.golden, puffed: c.mood > 0.5 ? 1 : 0.3 });
      }
      ctx.restore();
    }
  }

  _drawHazards(ctx, W, H) {
    for (const z of this.hazards) {
      const x = z.x * W, y = z.y * H, r = z.r * H;
      if (z.kind === "jelly") {
        const g = ctx.createRadialGradient(x, y - r * 0.2, 1, x, y, r * 1.6);
        g.addColorStop(0, "rgba(220,180,255,0.55)"); g.addColorStop(1, "rgba(160,110,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.fill();
        const pulse = 1 + Math.sin(this.elapsed * 4 + z.phase) * 0.08;
        const bg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
        bg.addColorStop(0, "rgba(255,240,255,0.9)"); bg.addColorStop(1, "rgba(190,150,255,0.75)");
        ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(x, y, r * pulse, r * 0.85, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(214,180,255,0.65)"; ctx.lineWidth = 1.6;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath(); ctx.moveTo(x + i * r * 0.26, y);
          ctx.bezierCurveTo(x + i * r * 0.26 + Math.sin(this.elapsed * 3 + i) * 6, y + r * 0.9, x + i * r * 0.3 - Math.sin(this.elapsed * 3 + i) * 5, y + r * 1.5, x + i * r * 0.3 + Math.sin(this.elapsed * 3 + i) * 3, y + r * 2.1);
          ctx.stroke();
        }
      } else if (z.kind === "mine") {
        ctx.strokeStyle = "#2a2a30"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.lineTo(x, H + 10); ctx.stroke();
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.strokeStyle = "#3a3a42"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35); ctx.stroke(); }
        const mg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r); mg.addColorStop(0, "#6a6a74"); mg.addColorStop(1, "#1a1a20");
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        const blink = Math.sin(this.elapsed * 6 + z.phase) > 0.3;
        ctx.fillStyle = blink ? "#ff3a3a" : "#5a1a1a"; ctx.beginPath(); ctx.arc(x, y - r * 0.5, 3, 0, 7); ctx.fill();
      } else if (z.kind === "shark") {
        if (z.warn > 0) {
          const ex = z.dir > 0 ? 18 : W - 18;
          ctx.fillStyle = `rgba(255,84,112,${0.5 + Math.sin(this.elapsed * 14) * 0.4})`;
          ctx.beginPath(); ctx.moveTo(ex + 10 * z.dir, y); ctx.lineTo(ex - 6 * z.dir, y - 10); ctx.lineTo(ex - 6 * z.dir, y + 10); ctx.fill();
          ctx.font = "800 11px Inter, sans-serif"; ctx.textAlign = z.dir > 0 ? "left" : "right"; ctx.fillText("SHARK!", ex + 16 * z.dir, y + 4);
          continue;
        }
        ctx.save(); ctx.translate(x, y); ctx.scale(z.dir, 1);
        paintFish(ctx, { body: "shark", back: "#5a6a78", belly: "#d8e0e8", fin: "#4a5a68", tail: "shark", size: 2.2 }, this.elapsed * 2, 1);
        ctx.restore();
      } else {
        ctx.save(); ctx.translate(x, y); ctx.rotate(this.elapsed * 0.6 + z.phase);
        ctx.fillStyle = "#5c5040"; ctx.fillRect(-r, -r * 0.34, r * 2, r * 0.68);
        ctx.fillStyle = "#3a3228"; ctx.fillRect(-r, -r * 0.34, r * 2, r * 0.2);
        ctx.strokeStyle = "#7a6a52"; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.35, -r * 0.34); ctx.lineTo(i * r * 0.35, r * 0.34); ctx.stroke(); }
        ctx.fillStyle = "#3a6a3a"; ctx.beginPath(); ctx.ellipse(-r * 0.6, -r * 0.4, r * 0.3, r * 0.1, 0.3, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
  }

  _drawBubbles(ctx, W, H) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1;
    for (const b of this.bubbles) { ctx.globalAlpha = Math.max(0, 1 - b.t / 1.4); ctx.beginPath(); ctx.arc(b.x * W, b.y * H, b.r, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  /** The deep is dark: only the hook's glow and glowing fish cut through it. */
  _drawDark(ctx, W, H) {
    const dark = clamp((this.depth - 200) / 420, 0, 0.72);
    if (dark <= 0.01) return;
    const hx = this.hook.x * W, hy = H * 0.42;
    const g = ctx.createRadialGradient(hx, hy, 40, hx, hy, Math.max(W, H) * 0.8);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.35, `rgba(0,0,6,${dark * 0.6})`); g.addColorStop(1, `rgba(0,0,6,${dark})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  _drawUI(ctx, W, H) {
    const top = 16, bot = H - 16;
    ctx.fillStyle = "rgba(8,14,26,0.5)"; roundRect(ctx, W - 26, top, 12, bot - top, 6); ctx.fill();
    for (const z of ZONES) { const y = top + (z.from / MAX_DEPTH) * (bot - top); ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(W - 26, y, 12, 1.5); }
    const ly = top + (this.maxLine / MAX_DEPTH) * (bot - top);
    ctx.fillStyle = "#ff5470"; ctx.fillRect(W - 30, ly - 1, 20, 2);
    const dy = top + (clamp(this.depth, 0, MAX_DEPTH) / MAX_DEPTH) * (bot - top);
    ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(W - 20, dy, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "700 11px Inter, sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`${this._zoneAt(this.depth).name} · ${Math.round(this.depth)} m`, 12, 20);

    if (this.phase === "fight" && this.caught) {
      const c = this.caught;
      const bw = Math.min(280, W * 0.6), bh = 14, x = (W - bw) / 2, y = H - 64;
      ctx.fillStyle = "rgba(8,14,26,0.7)"; roundRect(ctx, x, y, bw, bh, 7); ctx.fill();
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, "#2ee6a6"); g.addColorStop(0.7, "#ffd76a"); g.addColorStop(1, "#ff5470");
      ctx.fillStyle = g; roundRect(ctx, x + 1, y + 1, Math.max(0, (bw - 2) * clamp(this.tension, 0, 1)), bh - 2, 6); ctx.fill();
      if (this.tension > 0.75) { ctx.strokeStyle = `rgba(255,84,112,${0.4 + Math.sin(this.elapsed * 18) * 0.35})`; ctx.lineWidth = 2.5; roundRect(ctx, x, y, bw, bh, 7); ctx.stroke(); }
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "700 10px 'Inter', system-ui, sans-serif"; ctx.textAlign = "left";
      ctx.fillText("LINE TENSION", x, y - 5);
      ctx.fillStyle = "rgba(8,14,26,0.7)"; roundRect(ctx, x, y + 22, bw, 8, 4); ctx.fill();
      ctx.fillStyle = "#22d3ee"; roundRect(ctx, x + 1, y + 23, Math.max(0, (bw - 2) * c.progress), 6, 3); ctx.fill();
      // The fish is running: show which way to hold.
      if (c.run) {
        const ax = W / 2 - c.run * 90, ay = H * 0.3;
        ctx.fillStyle = `rgba(255,215,106,${0.6 + Math.sin(this.elapsed * 10) * 0.3})`;
        ctx.beginPath(); ctx.moveTo(ax - c.run * 18, ay); ctx.lineTo(ax + c.run * 6, ay - 14); ctx.lineTo(ax + c.run * 6, ay + 14); ctx.fill();
        ctx.font = "800 12px Inter, sans-serif"; ctx.textAlign = "center"; ctx.fillText(`It's running! Hold ${c.run > 0 ? "◀" : "▶"}`, W / 2, ay - 22);
      }
    }
    if (this.messageT > 0) {
      ctx.textAlign = "center"; ctx.globalAlpha = Math.min(1, this.messageT / 0.5);
      ctx.fillStyle = this.messageBad ? "#ff8fa0" : "#ffffff"; ctx.font = "800 17px 'Sora', system-ui, sans-serif";
      ctx.fillText(this.message, W / 2, H * 0.16); ctx.globalAlpha = 1;
    }
    ctx.textAlign = "center"; ctx.font = "700 12px 'Inter', system-ui, sans-serif";
    if (this.phase === "descend") {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(this.elapsed * 3) * 0.22})`;
      ctx.fillText(this.useTouch ? "Steer past the drift · grab pearls · ▼ to stop" : "← → steer · grab pearls · ↓ stop", W / 2, H - 18);
    } else if (this.phase === "fight") {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(this.useTouch ? "Hold A to reel · let go when it surges" : "Hold Space to reel · let go when it surges", W / 2, H - 18);
    }
  }
}

/** Weight from length and build: a stout grouper outweighs an eel. */
function weightKg(spec, cm) {
  const k = { deep: 1.6, disc: 1.4, mola: 3, puffer: 1.5, shark: 1.1, sword: 1.0, fusiform: 1.0, slim: 0.6, eel: 0.25, flat: 0.9, ray: 0.9, manta: 1.2, squid: 0.7, octopus: 0.8, angler: 1.4, crab: 0.8, blob: 0.9, seahorse: 0.1 }[spec.body] || 1;
  const kg = 0.0000125 * cm * cm * cm * k;
  return kg < 1 ? kg.toFixed(2) : kg < 10 ? kg.toFixed(1) : Math.round(kg);
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
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default AbyssAnglerGame;
