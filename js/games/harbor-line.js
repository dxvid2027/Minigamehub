// ==========================================================================
// Harbor Line — draw a transit network across a growing city.
//
// Stations appear one at a time. You have a handful of coloured lines and a
// finite pool of trains, and you connect stations by dragging a line
// through them. Passengers wait at a station showing the shape of where
// they want to go; a train carries them along the line, and they change at
// any station both lines touch.
//
// A station that stays overcrowded for too long ends the run. The pressure
// is not any single station — it is that the city keeps adding shapes, and
// a network that was elegant six stations ago becomes the thing strangling
// you. Every week you get one new asset to spend, and never enough.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, choice } from "../core/utils.js";

// Line colours, handed out in order as you unlock them.
const LINES = [
  { id: 0, name: "Red",    color: "#ff5470" },
  { id: 1, name: "Blue",   color: "#22d3ee" },
  { id: 2, name: "Yellow", color: "#ffd76a" },
  { id: 3, name: "Green",  color: "#2ee6a6" },
  { id: 4, name: "Violet", color: "#a86bff" },
  { id: 5, name: "Orange", color: "#ff9f43" },
];

// Station shapes double as passenger destinations: a passenger drawn as a
// triangle wants any triangle station.
const SHAPES = ["circle", "triangle", "square", "diamond", "star", "cross"];
// Common shapes are the backbone; the rare ones are the ones that strand you.
const SHAPE_WEIGHT = { circle: 42, triangle: 26, square: 18, diamond: 8, star: 4, cross: 2 };

const CAPACITY = 6;          // passengers a station holds before it starts choking
const OVERLOAD_LIMIT = 22;   // seconds a station may stay over capacity
const TRAIN_CAP = 6;
const WEEK = 42;             // seconds per week

export class HarborLineGame extends GameBase {
  getDifficulties() { return ["Commute"]; }
  getInstructions() {
    return [
      "Drag from one station to another to run a line between them. Drag from the end of an existing line to extend it.",
      "Passengers show the shape of the station they want. They ride any line that gets them there, changing at stations where two lines meet.",
      "A station over capacity starts a timer above it. Let that timer fill and the network is declared failed.",
      "Every week you are given one new asset — a train, a carriage, a whole new line or a tunnel. Choose from two.",
      "Tap a line's colour in the bar to select it; tap a line and then a station on it to remove that station from the line.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag between stations to lay track. Tap a line colour to switch lines."; }
  getKeyboardHint() { return "Drag between stations with the mouse. 1-6 selects a line."; }
  getScene() { return "aurora"; }

  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.harbor) custom.harbor = { bestRiders: 0, bestWeeks: 0, bestStations: 0 };
    return custom.harbor;
  }
  _save() { saveManager.saveNow(); }

  getPlayLabel() { return "Open the network"; }
  getStartExtras() {
    const h = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Best: ${formatNumber(h.bestRiders || 0)} riders`),
      el("span", {}, `${h.bestWeeks || 0} weeks survived`),
      el("span", {}, `${h.bestStations || 0} stations linked`),
    ]);
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "crosshair";
    this.input.onPointer("down", (p) => this._down(p.x, p.y));
    this.input.onPointer("move", (p) => this._move(p.x, p.y));
    this.input.onPointer("up", (p) => this._up(p.x, p.y));
    for (let i = 1; i <= 6; i++) this.input.onKey(`Digit${i}`, () => this._selectLine(i - 1));
  }

  onResize() { this._relayout(); }

  onStart() {
    this.stations = [];
    this.lines = LINES.map(l => ({ ...l, stops: [], unlocked: l.id < 3, trains: [] }));
    this.spareTrains = 3;
    this.spareCarriages = 0;
    this.spareTunnels = 2;
    this.riders = 0;
    this.week = 1;
    this.weekT = 0;
    this.elapsed = 0;
    this.selected = 0;
    this.drag = null;
    this.picking = false;
    this.floaters = [];
    this.setScore(0);

    // Open with three stations of the three commonest shapes so the first
    // line you draw already carries somebody.
    this._addStation("circle", 0.3, 0.42);
    this._addStation("triangle", 0.62, 0.33);
    this._addStation("circle", 0.5, 0.68);
    this._spawnT = 6;
    this._relayout();
    this._updateHud();
  }

  _relayout() {
    // Stations are stored in 0..1 space so a resize never breaks the network.
    this.pad = Math.min(this.viewW, this.viewH) * 0.08;
  }

  _px(s) {
    const W = this.viewW, H = this.viewH, p = this.pad || 30;
    return { x: p + s.nx * (W - p * 2), y: p + 26 + s.ny * (H - p * 2 - 76) };
  }

  _addStation(shape, nx, ny) {
    this.stations.push({
      shape, nx, ny, queue: [], over: 0, pop: 0.5,
      id: this.stations.length,
    });
  }

  /** Places a new station somewhere not too close to an existing one. */
  _spawnStation() {
    let best = null, bestD = -1;
    for (let k = 0; k < 24; k++) {
      const nx = randFloat(0.06, 0.94), ny = randFloat(0.05, 0.95);
      let d = Infinity;
      for (const s of this.stations) d = Math.min(d, Math.hypot(s.nx - nx, (s.ny - ny) * 0.8));
      if (d > bestD) { bestD = d; best = { nx, ny }; }
    }
    // Weighted shape, with rarer shapes appearing only once the city is big.
    const pool = SHAPES.filter((sh, i) => i < 3 || this.stations.length >= 4 + i * 2);
    const total = pool.reduce((a, sh) => a + SHAPE_WEIGHT[sh], 0);
    let roll = Math.random() * total, shape = pool[0];
    for (const sh of pool) { if (roll < SHAPE_WEIGHT[sh]) { shape = sh; break; } roll -= SHAPE_WEIGHT[sh]; }
    this._addStation(shape, best.nx, best.ny);
    audioManager.play("pop");
    this._float("New station", "#22d3ee");
  }

  // ------------------------------------------------------------- INPUT ---
  _stationAt(x, y) {
    for (const s of this.stations) {
      const p = this._px(s);
      if (Math.hypot(p.x - x, p.y - y) < 22) return s;
    }
    return null;
  }

  _selectLine(i) {
    if (!this.lines[i]?.unlocked) return;
    this.selected = i;
    audioManager.play("select");
  }

  _down(x, y) {
    if (this.state !== "playing" || this.picking) return;
    // The line bar along the bottom.
    const bar = this._barLayout();
    for (const b of bar) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (this.lines[b.i].unlocked) this._selectLine(b.i);
        return;
      }
    }
    const s = this._stationAt(x, y);
    if (!s) return;
    const line = this.lines[this.selected];
    // Tapping a station already on the selected line trims it back to there,
    // which is how you undo a bad branch without a separate erase mode.
    if (line.stops.includes(s) && line.stops.length > 1) {
      const i = line.stops.indexOf(s);
      if (i === 0 || i === line.stops.length - 1) {
        line.stops.splice(i, 1);
        this._retrain(line);
        audioManager.play("click");
        return;
      }
    }
    this.drag = { from: s, x, y };
  }

  _move(x, y) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }

  _up(x, y) {
    if (!this.drag) return;
    const target = this._stationAt(x, y);
    const from = this.drag.from;
    this.drag = null;
    if (!target || target === from) return;
    const line = this.lines[this.selected];
    if (!line.unlocked) return;

    if (!line.stops.length) {
      line.stops = [from, target];
    } else {
      const first = line.stops[0], last = line.stops[line.stops.length - 1];
      if (from === last && !line.stops.includes(target)) line.stops.push(target);
      else if (from === first && !line.stops.includes(target)) line.stops.unshift(target);
      else if (target === last && !line.stops.includes(from)) line.stops.push(from);
      else if (target === first && !line.stops.includes(from)) line.stops.unshift(from);
      else { audioManager.play("error"); return; }
    }
    this._retrain(line);
    audioManager.play("place");
  }

  /** A line with stops needs at least one train; a line emptied loses them. */
  _retrain(line) {
    if (line.stops.length < 2) {
      this.spareTrains += line.trains.length;
      line.trains = [];
      return;
    }
    if (!line.trains.length && this.spareTrains > 0) {
      this.spareTrains--;
      line.trains.push({ at: 0, dir: 1, t: 0, riders: [], cap: TRAIN_CAP, carriage: 0 });
    }
  }

  _barLayout() {
    const W = this.viewW, H = this.viewH;
    const n = LINES.length;
    const w = Math.min(46, (W - 24) / n - 6);
    const total = n * w + (n - 1) * 6;
    const x0 = (W - total) / 2;
    return LINES.map((l, i) => ({ i, x: x0 + i * (w + 6), y: H - 40, w, h: 26 }));
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing" || this.picking) return;
    this.elapsed += dt;
    this.weekT += dt;
    if (this.weekT >= WEEK) { this.weekT = 0; this._newWeek(); }

    // New stations arrive faster as the city grows, which is the pressure.
    this._spawnT -= dt;
    if (this._spawnT <= 0 && this.stations.length < 26) {
      this._spawnT = clamp(19 - this.stations.length * 0.35, 8, 19);
      this._spawnStation();
    }

    this._spawnPassengers(dt);
    this._runTrains(dt);
    this._checkOverload(dt);

    for (const s of this.stations) if (s.pop > 0) s.pop = Math.max(0, s.pop - dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].t += dt;
      if (this.floaters[i].t > 1.6) this.floaters.splice(i, 1);
    }
    this._updateHud();
  }

  _spawnPassengers(dt) {
    // Arrival rate per station climbs slowly with the week number.
    const rate = (0.055 + this.week * 0.011) * this.stations.length;
    this._pT = (this._pT || 0) + dt * rate;
    while (this._pT >= 1) {
      this._pT -= 1;
      const s = choice(this.stations);
      // A passenger never wants the station they are standing in.
      const others = this.stations.filter(o => o.shape !== s.shape);
      if (!others.length) continue;
      // Prefer rarer destinations: they are what makes a network hard.
      const want = choice(others).shape;
      s.queue.push({ want, t: 0 });
    }
  }

  _runTrains(dt) {
    for (const line of this.lines) {
      if (line.stops.length < 2) continue;
      for (const tr of line.trains) {
        const a = line.stops[tr.at], b = line.stops[tr.at + tr.dir];
        if (!b) { tr.dir *= -1; continue; }
        const pa = this._px(a), pb = this._px(b);
        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
        tr.t += (150 * dt) / dist;
        if (tr.t >= 1) {
          tr.t = 0;
          tr.at += tr.dir;
          if (tr.at <= 0) { tr.at = 0; tr.dir = 1; }
          if (tr.at >= line.stops.length - 1) { tr.at = line.stops.length - 1; tr.dir = -1; }
          this._callAt(line, tr, line.stops[tr.at]);
        }
      }
    }
  }

  /**
   * A train reaching a station. Riders whose destination shape is here get
   * off; riders whose route continues stay on; then the platform boards.
   *
   * Interchange is implicit rather than routed: a rider gets off wherever
   * their shape is, and otherwise gets off at any station served by another
   * line that can still help them. That is enough to make junctions matter
   * without a pathfinder the player cannot see.
   */
  _callAt(line, tr, station) {
    for (let i = tr.riders.length - 1; i >= 0; i--) {
      const r = tr.riders[i];
      if (r.want === station.shape) {
        tr.riders.splice(i, 1);
        this.riders++;
        this.addScore(4 + this.week);
        station.pop = 0.4;
        continue;
      }
      // Change here if this line will never reach their shape but another
      // line touching this station might.
      const mine = this._lineReaches(line, r.want);
      if (!mine) {
        const other = this.lines.some(l => l !== line && l.stops.includes(station) && this._lineReaches(l, r.want));
        if (other && station.queue.length < CAPACITY * 2) {
          tr.riders.splice(i, 1);
          station.queue.push(r);
        }
      }
    }
    const room = tr.cap + tr.carriage * TRAIN_CAP - tr.riders.length;
    for (let k = 0; k < room && station.queue.length; k++) {
      // Board someone this line can actually help.
      let idx = station.queue.findIndex(p => this._lineReaches(line, p.want));
      if (idx < 0) {
        idx = station.queue.findIndex(p => this.lines.some(l =>
          l !== line && l.stops.some(st => line.stops.includes(st)) && this._lineReaches(l, p.want)));
      }
      if (idx < 0) break;
      tr.riders.push(station.queue.splice(idx, 1)[0]);
    }
  }

  _lineReaches(line, shape) { return line.stops.some(s => s.shape === shape); }

  _checkOverload(dt) {
    for (const s of this.stations) {
      if (s.queue.length > CAPACITY) {
        s.over += dt;
        if (s.over >= OVERLOAD_LIMIT) { this._collapse(s); return; }
      } else {
        s.over = Math.max(0, s.over - dt * 2.2);
      }
      for (const p of s.queue) p.t += dt;
    }
  }

  _collapse(s) {
    const store = this._store();
    if (store.bestRiders < this.riders) store.bestRiders = this.riders;
    if (store.bestWeeks < this.week) store.bestWeeks = this.week;
    if (store.bestStations < this.stations.length) store.bestStations = this.stations.length;
    this._save();
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score,
      message: `The ${s.shape} station at the ${cardinal(s)} choked. ${formatNumber(this.riders)} riders got where they were going first.`,
      extraStats: [
        { label: "Weeks", value: this.week },
        { label: "Stations", value: this.stations.length },
        { label: "Riders", value: formatNumber(this.riders) },
      ],
    });
  }

  /** End of week: pick one of two assets. This is the only economy. */
  _newWeek() {
    this.week++;
    audioManager.play("levelup");
    const options = [];
    const lockedLine = this.lines.find(l => !l.unlocked);
    options.push({ id: "train", name: "New train", text: "One more train to put on any line." });
    if (lockedLine) options.push({ id: "line", name: `${lockedLine.name} line`, text: "A whole new colour to draw with." });
    options.push({ id: "carriage", name: "Carriage", text: "+6 seats on one train of your choice." });
    options.push({ id: "tunnel", name: "Tunnel", text: "Two more crossings under the water." });

    const picks = [];
    // Always offer a train; the second offer rotates through the rest.
    picks.push(options[0]);
    const rest = options.slice(1);
    picks.push(rest[(this.week - 2) % rest.length]);

    this.picking = true;
    openModal({
      title: `Week ${this.week} — pick one`,
      bodyNode: el("div", { class: "reward-body" }, [
        el("p", { class: "zone-intro" }, `${this.stations.length} stations, ${formatNumber(this.riders)} riders carried. The city is not going to stop growing.`),
        el("div", { class: "relic-grid" }, picks.map(o =>
          el("button", { class: "relic-card", onClick: () => this._takeAsset(o) }, [
            el("span", { class: "ic" }, o.name[0]),
            el("span", { class: "nm" }, o.name),
            el("span", { class: "ds" }, o.text),
          ]))),
      ]),
    });
  }

  _takeAsset(o) {
    if (o.id === "train") { this.spareTrains++; this._float("+1 train", "#22d3ee"); }
    if (o.id === "carriage") {
      this.spareCarriages++;
      // Applied to the busiest line's first train, which is where it helps.
      const busiest = this.lines.filter(l => l.trains.length)
        .sort((a, b) => b.stops.length - a.stops.length)[0];
      if (busiest) { busiest.trains[0].carriage++; this.spareCarriages--; }
      this._float("+6 seats", "#2ee6a6");
    }
    if (o.id === "tunnel") { this.spareTunnels += 2; this._float("+2 tunnels", "#ffd76a"); }
    if (o.id === "line") {
      const l = this.lines.find(x => !x.unlocked);
      if (l) { l.unlocked = true; this.selected = l.id; this._float(`${l.name} line open`, l.color); }
    }
    // A spare train is auto-assigned to any line running without one.
    for (const l of this.lines) this._retrain(l);
    closeModal();
    this.picking = false;
  }

  _float(text, color) { this.floaters.push({ text, color, t: 0 }); }

  _updateHud() {
    this.setHud({
      Riders: formatNumber(this.riders),
      Week: this.week,
      Stations: this.stations.length,
      Trains: this.spareTrains,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawMap(ctx, W, H);
    this._drawLines(ctx);
    if (this.drag) this._drawDrag(ctx);
    this._drawTrains(ctx);
    this._drawStations(ctx);
    this._drawBar(ctx, W, H);
    this._drawFloaters(ctx, W, H);
    ctx.restore();
  }

  /** A flat map: water, a river and a soft grid so the city has a place. */
  _drawMap(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#101a2c"); g.addColorStop(1, "#0a1220");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // River, drawn from a fixed sine so it is the same shape every run and
    // reads as a feature of the city rather than noise.
    ctx.save();
    ctx.strokeStyle = "rgba(34,120,180,0.28)";
    ctx.lineWidth = Math.max(26, H * 0.055);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = t * W;
      const y = H * (0.28 + Math.sin(t * 3.1 + 0.7) * 0.13);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(90,190,240,0.14)";
    ctx.lineWidth = Math.max(26, H * 0.055) - 10;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  /**
   * Points for a line, nudged sideways by a per-line amount. Two lines that
   * share a stretch of track would otherwise draw exactly on top of each
   * other and the network would look like one line with extra colours.
   */
  _linePoints(line) {
    const off = (line.id - (LINES.length - 1) / 2) * 5;
    const pts = line.stops.map(s => this._px(s));
    if (!off) return pts;
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: p.x - (dy / len) * off, y: p.y + (dx / len) * off };
    });
  }

  _drawLines(ctx) {
    for (const line of this.lines) {
      if (line.stops.length < 2) continue;
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.id === this.selected ? 7 : 5.5;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.globalAlpha = line.id === this.selected ? 1 : 0.82;
      ctx.beginPath();
      this._linePoints(line).forEach((p, i) => {
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
      // A lighter core so overlapping lines stay distinguishable.
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  _drawDrag(ctx) {
    const p = this._px(this.drag.from);
    const line = this.lines[this.selected];
    ctx.save();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 5;
    ctx.setLineDash([8, 7]);
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y); ctx.lineTo(this.drag.x, this.drag.y);
    ctx.stroke();
    ctx.restore();
  }

  _drawTrains(ctx) {
    for (const line of this.lines) {
      if (line.stops.length < 2) continue;
      const pts = this._linePoints(line);
      for (const tr of line.trains) {
        const pa = pts[tr.at], pb = pts[tr.at + tr.dir] || pa;
        const x = pa.x + (pb.x - pa.x) * tr.t;
        const y = pa.y + (pb.y - pa.y) * tr.t;
        const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        const cars = 1 + tr.carriage;
        for (let c = 0; c < cars; c++) {
          const cx = -c * 20;
          ctx.fillStyle = line.color;
          roundRect(ctx, cx - 9, -7, 18, 14, 4); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          roundRect(ctx, cx - 6, -4.5, 12, 9, 2); ctx.fill();
        }
        // Riders shown as pips on the roof: a full train is visibly full.
        ctx.rotate(-ang);
        const n = Math.min(tr.riders.length, 8);
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath(); ctx.arc(-8 + i * 2.4, -12, 1, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  _drawStations(ctx) {
    for (const s of this.stations) {
      const p = this._px(s);
      const crowded = s.queue.length > CAPACITY;
      const r = 13 + s.pop * 8;

      // Overload ring: fills as the timer runs down.
      if (s.over > 0) {
        const frac = s.over / OVERLOAD_LIMIT;
        ctx.strokeStyle = `rgba(255,84,112,${0.4 + frac * 0.6})`;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.arc(p.x, p.y + 2, r + 1, 0, 7); ctx.fill();
      ctx.fillStyle = crowded ? "#ffe3e8" : "#ffffff";
      ctx.strokeStyle = crowded ? "#ff5470" : "#1a2233";
      ctx.lineWidth = 3;
      drawShape(ctx, s.shape, p.x, p.y, r);
      ctx.fill(); ctx.stroke();

      // Waiting passengers, arranged around the station.
      s.queue.slice(0, 10).forEach((q, i) => {
        const a = -Math.PI / 2 + (i - Math.min(9, s.queue.length - 1) / 2) * 0.42;
        const d = r + 13;
        ctx.fillStyle = crowded ? "#ff8fa0" : "#c9d4e8";
        drawShape(ctx, q.want, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 4.4);
        ctx.fill();
      });
      if (s.queue.length > 10) {
        ctx.fillStyle = "#ff5470";
        ctx.font = "800 10px 'Inter', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`+${s.queue.length - 10}`, p.x, p.y - r - 20);
      }
    }
  }

  /** The line bar: colour chips, plus the spare-asset counts. */
  _drawBar(ctx, W, H) {
    for (const b of this._barLayout()) {
      const line = this.lines[b.i];
      ctx.globalAlpha = line.unlocked ? 1 : 0.22;
      ctx.fillStyle = line.color;
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
      if (b.i === this.selected && line.unlocked) {
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5;
        roundRect(ctx, b.x - 1.5, b.y - 1.5, b.w + 3, b.h + 3, 9); ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.font = "800 11px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(line.stops.length ? String(line.stops.length) : "—", b.x + b.w / 2, b.y + 17);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "700 10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Spare trains ${this.spareTrains}`, 12, H - 46);
    const nextWeek = Math.max(0, WEEK - this.weekT);
    ctx.textAlign = "right";
    ctx.fillText(`Week ${this.week} · next in ${Math.ceil(nextWeek)}s`, W - 12, H - 46);
    // Week progress hairline along the very bottom.
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, H - 4, W, 3);
    ctx.fillStyle = "#7c5cff";
    ctx.fillRect(0, H - 4, W * (this.weekT / WEEK), 3);
  }

  _drawFloaters(ctx, W, H) {
    ctx.textAlign = "center";
    this.floaters.forEach((f, i) => {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      ctx.fillStyle = f.color;
      ctx.font = "800 14px 'Sora', system-ui, sans-serif";
      ctx.fillText(f.text, W / 2, 40 + i * 18 - f.t * 14);
    });
    ctx.globalAlpha = 1;
  }
}

/** Path for one of the six station shapes, centred on (x, y). */
function drawShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(x, y, r, 0, 7);
  else if (shape === "square") ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (shape === "triangle") {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.92, y + r * 0.72); ctx.lineTo(x - r * 0.92, y + r * 0.72);
    ctx.closePath();
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath();
  } else if (shape === "star") {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rr = i % 2 ? r * 0.46 : r;
      i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
        : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  } else {
    const t = r * 0.36;
    ctx.moveTo(x - t, y - r); ctx.lineTo(x + t, y - r); ctx.lineTo(x + t, y - t);
    ctx.lineTo(x + r, y - t); ctx.lineTo(x + r, y + t); ctx.lineTo(x + t, y + t);
    ctx.lineTo(x + t, y + r); ctx.lineTo(x - t, y + r); ctx.lineTo(x - t, y + t);
    ctx.lineTo(x - r, y + t); ctx.lineTo(x - r, y - t); ctx.lineTo(x - t, y - t);
    ctx.closePath();
  }
}

function cardinal(s) {
  const ns = s.ny < 0.4 ? "north" : s.ny > 0.6 ? "south" : "";
  const ew = s.nx < 0.4 ? "west" : s.nx > 0.6 ? "east" : "";
  return `${ns}${ew}` || "centre";
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

export default HarborLineGame;
