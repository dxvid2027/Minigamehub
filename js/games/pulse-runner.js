// ==========================================================================
// Pulse Runner — a four-lane rhythm game with charts built from the music.
//
// There is no audio file. Each track is a small piece of generated music —
// a tempo, a chord progression, a drum pattern — played through the Web
// Audio API, and the note chart is generated from that same pattern. So the
// notes are not laid over the music, they *are* the music: a kick is a tap
// on lane 1, a snare is lane 3, a held pad is a hold note.
//
// Judgement is by timing window: Perfect, Great, Good, or Miss. Combo
// multiplies score, accuracy grades the run, and a health bar that only
// misses drain means a chart is failed rather than merely scored badly.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, seededRng } from "../core/utils.js";

const LANES = 4;
const LANE_KEYS = [["KeyD", "ArrowLeft"], ["KeyF", "ArrowDown"], ["KeyJ", "ArrowUp"], ["KeyK", "ArrowRight"]];
const LANE_COLORS = ["#22d3ee", "#2ee6a6", "#ffd76a", "#ff4fd8"];

// Timing windows in seconds, either side of the beat.
const WINDOWS = [
  { name: "Perfect", t: 0.045, score: 300, health: 1.2, color: "#ffd76a" },
  { name: "Great",   t: 0.090, score: 200, health: 0.7, color: "#2ee6a6" },
  { name: "Good",    t: 0.150, score: 100, health: 0.2, color: "#22d3ee" },
];
const MISS_WINDOW = 0.19;

// --- Tracks ---------------------------------------------------------------
// Each is a seed plus a musical shape. `density` is notes per beat, `swing`
// offsets the off-beats, `keys` is the scale the melody walks.
const TRACKS = [
  { id: "dawnline",  name: "Dawnline",     bpm: 92,  bars: 32, density: 1.0, swing: 0,    root: 220.00, mode: "minor", hue: "#22d3ee", blurb: "A gentle opener. Quarter notes and a lot of room." },
  { id: "neonrain",  name: "Neon Rain",    bpm: 104, bars: 32, density: 1.35, swing: 0,   root: 246.94, mode: "minor", hue: "#7c5cff", blurb: "Eighths start creeping in between the kicks." },
  { id: "glasscoast",name: "Glass Coast",  bpm: 112, bars: 36, density: 1.6, swing: 0.06, root: 261.63, mode: "major", hue: "#2ee6a6", blurb: "A shuffle. The off-beats sit late on purpose." },
  { id: "ironpulse", name: "Iron Pulse",   bpm: 124, bars: 36, density: 1.9, swing: 0,    root: 196.00, mode: "minor", hue: "#ff9f43", blurb: "Four on the floor, and it does not let up." },
  { id: "starfall",  name: "Starfall",     bpm: 132, bars: 40, density: 2.2, swing: 0,    root: 293.66, mode: "major", hue: "#ffd76a", blurb: "Sixteenth runs across all four lanes." },
  { id: "voidwalk",  name: "Voidwalk",     bpm: 140, bars: 40, density: 2.5, swing: 0.05, root: 174.61, mode: "minor", hue: "#a86bff", blurb: "Swung sixteenths. Holds under the runs." },
  { id: "riptide",   name: "Riptide",      bpm: 152, bars: 44, density: 2.9, swing: 0,    root: 220.00, mode: "minor", hue: "#ff5470", blurb: "Jack patterns: the same lane, twice, fast." },
  { id: "eventhz",   name: "Event Horizon", bpm: 168, bars: 48, density: 3.3, swing: 0,   root: 164.81, mode: "minor", hue: "#ff4fd8", blurb: "The wall. Chords, jacks and holds at once." },
];

const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };

export class PulseRunnerGame extends GameBase {
  getDifficulties() { return ["Standard"]; }
  getInstructions() {
    return [
      "Notes fall down four lanes. Hit each one as it crosses the bar at the bottom.",
      "Keyboard: D, F, J, K for the four lanes (arrow keys work too). Touch: tap the lane pad.",
      "Long notes are held: press as the head crosses the bar and let go at the tail.",
      "Perfect, Great and Good are timing windows. Combo multiplies the score; misses drain the health bar and empty is a fail.",
      "Eight tracks, faster and denser each time. The music is generated live, and the chart is generated from the same pattern.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap the four pads at the bottom as the notes reach the bar."; }
  getKeyboardHint() { return "D F J K (or the arrow keys) — one per lane."; }
  getScene() { return "void"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.pulse) custom.pulse = { best: {}, cleared: 0 };
    if (!custom.pulse.best) custom.pulse.best = {};
    return custom.pulse;
  }
  _save() { saveManager.saveNow(); }
  _unlocked(i) { return i === 0 || !!this._store().best[TRACKS[i - 1].id]; }

  getPlayLabel() { return "Track select"; }
  getStartExtras() {
    const p = this._store();
    const done = Object.keys(p.best).length;
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `${done}/${TRACKS.length} cleared`),
      el("span", {}, `Best combo: ${Math.max(0, ...Object.values(p.best).map(b => b.combo || 0))}`),
    ]);
  }

  onPlayPressed() { audioManager.play("click"); this.openTracks(); }

  openTracks() {
    const store = this._store();
    const grid = el("div", { class: "track-grid" });
    TRACKS.forEach((t, i) => {
      const open = this._unlocked(i);
      const best = store.best[t.id];
      grid.appendChild(el("button", {
        class: `track-card${open ? "" : " locked"}${best ? " cleared" : ""}`,
        disabled: !open,
        style: `--tc:${t.hue}`,
        onClick: () => { closeModal(); this.trackIdx = i; this.start(); },
      }, [
        el("span", { class: "sw" }),
        el("span", { class: "nm" }, open ? t.name : "Locked"),
        el("span", { class: "meta" }, open ? `${t.bpm} BPM · ${difficultyStars(t.density)}` : `Clear ${TRACKS[i - 1].name}`),
        el("span", { class: "st" }, open ? (best ? `${best.grade} · ${best.acc}% · ${formatNumber(best.score)}` : t.blurb) : ""),
      ]));
    });
    openModal({
      title: "Track Select",
      bodyNode: el("div", { class: "track-picker" }, [
        el("p", { class: "zone-intro" }, "Every track is generated live — the same seed produces the same chart, so a run is repeatable."),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.held = [false, false, false, false];
    LANE_KEYS.forEach((codes, lane) => {
      for (const c of codes) {
        this.input.onKey(c, () => this._press(lane));
        this.input.onKey(c, () => this._release(lane), "up");
      }
    });
    this.input.onPointer("down", (p) => { const l = this._laneAt(p.x, p.y); if (l >= 0) this._press(l, true); });
    this.input.onPointer("up", () => { for (let l = 0; l < LANES; l++) if (this._touchLane[l]) this._release(l); });
    this._touchLane = [false, false, false, false];
    this.trackIdx = 0;
  }

  onStart() {
    const track = TRACKS[this.trackIdx];
    this.track = track;
    this.chart = buildChart(track);
    this.notes = this.chart.notes.map(n => ({ ...n, judged: null, holding: false, done: false }));
    this.songLen = this.chart.length;
    this.time = -2.2;                 // lead-in before the first bar
    this.combo = 0;
    this.maxCombo = 0;
    this.health = 80;
    this.counts = { Perfect: 0, Great: 0, Good: 0, Miss: 0 };
    this.judgeText = null;
    this.judgeT = 0;
    this.hits = [];
    this.laneFlash = [0, 0, 0, 0];
    this.beatFlash = 0;
    this.setScore(0);
    this._nextEvent = 0;
    this._startAudio();
    this._updateHud();
  }

  onDestroyRound() { this._stopAudio(); }
  onDestroy() { this._stopAudio(); }
  onPause() { this._stopAudio(); }
  onResume() { this._startAudio(); }

  // -------------------------------------------------------------- AUDIO --
  /**
   * The track plays through one shared AudioContext with a small gain bus.
   * Everything is scheduled a lookahead ahead of the playhead so the
   * browser's timer jitter never lands on a beat.
   */
  _startAudio() {
    if (this._ac) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this._ac = new AC();
      this._bus = this._ac.createGain();
      this._bus.gain.value = 0.22;
      this._bus.connect(this._ac.destination);
      this._audioStart = this._ac.currentTime + 2.2;
      this._scheduled = 0;
    } catch { this._ac = null; }
  }
  _stopAudio() {
    if (!this._ac) return;
    try { this._ac.close(); } catch { /* already closed */ }
    this._ac = null;
  }

  _schedule() {
    if (!this._ac || !this.chart) return;
    const ahead = this._ac.currentTime - this._audioStart + 0.35;
    while (this._scheduled < this.chart.events.length &&
           this.chart.events[this._scheduled].t < ahead) {
      const ev = this.chart.events[this._scheduled++];
      this._voice(ev, this._audioStart + ev.t);
    }
  }

  _voice(ev, when) {
    const ac = this._ac;
    if (!ac || when < ac.currentTime) return;
    if (ev.kind === "kick") {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(150, when);
      o.frequency.exponentialRampToValueAtTime(46, when + 0.11);
      g.gain.setValueAtTime(0.9, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.19);
      o.connect(g); g.connect(this._bus); o.start(when); o.stop(when + 0.22);
    } else if (ev.kind === "snare") {
      // Noise burst through a bandpass: a drum machine snare in six lines.
      const len = Math.floor(ac.sampleRate * 0.14);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1750; f.Q.value = 0.9;
      const g = ac.createGain(); g.gain.setValueAtTime(0.45, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.14);
      src.connect(f); f.connect(g); g.connect(this._bus); src.start(when);
    } else if (ev.kind === "hat") {
      const len = Math.floor(ac.sampleRate * 0.05);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7200;
      const g = ac.createGain(); g.gain.setValueAtTime(0.16, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      src.connect(f); f.connect(g); g.connect(this._bus); src.start(when);
    } else {
      // Melody / pad: a detuned pair through a short envelope.
      const dur = ev.dur || 0.22;
      for (const det of [0, 4]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = ev.kind === "pad" ? "sawtooth" : "triangle";
        o.frequency.value = ev.freq * (1 + det / 1200);
        const peak = ev.kind === "pad" ? 0.14 : 0.24;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(peak, when + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        const f = ac.createBiquadFilter();
        f.type = "lowpass"; f.frequency.value = ev.kind === "pad" ? 1400 : 3200;
        o.connect(f); f.connect(g); g.connect(this._bus);
        o.start(when); o.stop(when + dur + 0.05);
      }
    }
  }

  // ------------------------------------------------------------- INPUT ---
  _laneAt(x, y) {
    const L = this._layout();
    if (y < L.judgeY - 40) return -1;
    for (let i = 0; i < LANES; i++) {
      if (x >= L.x0 + i * L.lw && x < L.x0 + (i + 1) * L.lw) { this._touchLane[i] = true; return i; }
    }
    return -1;
  }

  _press(lane) {
    if (this.state !== "playing") return;
    this.held[lane] = true;
    this.laneFlash[lane] = 0.18;
    // Nearest unjudged note in this lane.
    let best = null, bestD = Infinity;
    for (const n of this.notes) {
      if (n.lane !== lane || n.judged || n.done) continue;
      const d = Math.abs(n.t - this.time);
      if (d < bestD) { bestD = d; best = n; }
    }
    if (!best || bestD > MISS_WINDOW) { audioManager.play("click"); return; }
    const w = WINDOWS.find(x => bestD <= x.t) || null;
    if (!w) { this._judge(best, "Miss"); return; }
    this._judge(best, w.name);
    if (best.hold) { best.holding = true; }
    else best.done = true;
    this.hits.push({ lane, t: 0, color: w.color });
  }

  _release(lane) {
    this.held[lane] = false;
    this._touchLane[lane] = false;
    for (const n of this.notes) {
      if (n.lane !== lane || !n.holding) continue;
      n.holding = false;
      n.done = true;
      // Letting go early costs the tail, but the head still counted.
      if (this.time < n.t + n.hold - 0.12) {
        this.combo = 0;
        this.health -= 3;
        this._flash("Dropped", "#ff5470");
      } else {
        this.addScore(120);
        this.health = Math.min(100, this.health + 0.6);
      }
    }
  }

  _judge(note, name) {
    note.judged = name;
    const w = WINDOWS.find(x => x.name === name);
    this.counts[name]++;
    if (name === "Miss") {
      this.combo = 0;
      this.health -= 7;
      this._flash("Miss", "#ff5470");
      note.done = true;
      if (this.health <= 0) this._fail();
      return;
    }
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + Math.min(1.5, Math.floor(this.combo / 25) * 0.25);
    this.addScore(Math.round(w.score * mult));
    this.health = Math.min(100, this.health + w.health);
    this._flash(name, w.color);
  }

  _flash(text, color) { this.judgeText = text; this.judgeColor = color; this.judgeT = 0.45; }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    // Drive the clock from the audio context when it exists, so the chart
    // never drifts from the music on a slow frame.
    if (this._ac) this.time = this._ac.currentTime - this._audioStart;
    else this.time += dt;
    this._schedule();

    if (this.judgeT > 0) this.judgeT -= dt;
    for (let i = 0; i < LANES; i++) if (this.laneFlash[i] > 0) this.laneFlash[i] -= dt;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      this.hits[i].t += dt;
      if (this.hits[i].t > 0.4) this.hits.splice(i, 1);
    }
    const beat = 60 / this.track.bpm;
    this.beatFlash = 1 - ((this.time / beat) % 1);

    // Notes that fell past the window without a press.
    for (const n of this.notes) {
      if (n.judged || n.done) continue;
      if (this.time - n.t > MISS_WINDOW) this._judge(n, "Miss");
    }
    // A held note whose tail has passed resolves itself.
    for (const n of this.notes) {
      if (n.holding && this.time > n.t + n.hold) {
        n.holding = false; n.done = true;
        this.addScore(120);
        this.health = Math.min(100, this.health + 0.6);
      }
    }

    if (this.time > this.songLen + 1.6) this._clear();
    this._updateHud();
  }

  _accuracy() {
    const total = this.counts.Perfect + this.counts.Great + this.counts.Good + this.counts.Miss;
    if (!total) return 100;
    const got = this.counts.Perfect * 1 + this.counts.Great * 0.7 + this.counts.Good * 0.35;
    return Math.round((got / total) * 1000) / 10;
  }

  _grade(acc) {
    return acc >= 98 ? "S+" : acc >= 95 ? "S" : acc >= 90 ? "A" : acc >= 82 ? "B" : acc >= 70 ? "C" : "D";
  }

  _fail() {
    this._stopAudio();
    this.endGame({
      result: "loss", score: this.score,
      message: `The bar emptied ${Math.round((this.time / this.songLen) * 100)}% of the way through ${this.track.name}.`,
      extraStats: [
        { label: "Combo", value: this.maxCombo },
        { label: "Accuracy", value: `${this._accuracy()}%` },
        { label: "Misses", value: this.counts.Miss },
      ],
    });
  }

  _clear() {
    this._stopAudio();
    const acc = this._accuracy();
    const grade = this._grade(acc);
    const store = this._store();
    const prev = store.best[this.track.id];
    if (!prev || prev.score < this.score) {
      store.best[this.track.id] = { score: this.score, acc, grade, combo: this.maxCombo };
    }
    store.cleared = Object.keys(store.best).length;
    this._save();
    this.addScore(Math.round(acc * 20));
    this.endGame({
      result: "win", score: this.score,
      message: `${this.track.name} cleared — ${grade}, ${acc}% accuracy, ${this.maxCombo} combo.`,
      extraStats: [
        { label: "Perfect", value: this.counts.Perfect },
        { label: "Great", value: this.counts.Great },
        { label: "Miss", value: this.counts.Miss },
      ],
    });
  }

  _updateHud() {
    this.setHud({
      Combo: this.combo,
      Accuracy: `${this._accuracy()}%`,
      Health: `${Math.max(0, Math.round(this.health))}%`,
      Track: `${this.trackIdx + 1}/${TRACKS.length}`,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  _layout() {
    const W = this.viewW, H = this.viewH;
    const lw = Math.min(84, (W - 24) / LANES);
    const x0 = (W - lw * LANES) / 2;
    return { lw, x0, judgeY: H - 104, speed: H * 0.62 };
  }

  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const L = this._layout();

    this._drawBack(ctx, W, H, L);
    this._drawLanes(ctx, W, H, L);
    this._drawNotes(ctx, L);
    this._drawJudgeBar(ctx, W, L);
    this._drawPads(ctx, H, L);
    this._drawHits(ctx, L);
    this._drawHud(ctx, W, H);
    ctx.restore();
  }

  _drawBack(ctx, W, H, L) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0d0a1c"); g.addColorStop(1, "#05040c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // A pulse ring behind the lanes, on the beat.
    const b = Math.pow(this.beatFlash ?? 0, 3);
    const gg = ctx.createRadialGradient(W / 2, L.judgeY, 20, W / 2, L.judgeY, W * 0.7);
    gg.addColorStop(0, hexA(this.track.hue, 0.16 + b * 0.2));
    gg.addColorStop(1, hexA(this.track.hue, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
  }

  _drawLanes(ctx, W, H, L) {
    for (let i = 0; i < LANES; i++) {
      const x = L.x0 + i * L.lw;
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.028)" : "rgba(255,255,255,0.052)";
      ctx.fillRect(x, 0, L.lw, L.judgeY + 46);
      if (this.laneFlash[i] > 0) {
        ctx.fillStyle = hexA(LANE_COLORS[i], this.laneFlash[i] * 0.9);
        ctx.fillRect(x, 0, L.lw, L.judgeY + 46);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L.judgeY + 46); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(L.x0 + LANES * L.lw, 0); ctx.lineTo(L.x0 + LANES * L.lw, L.judgeY + 46);
    ctx.stroke();

    // Bar lines scrolling with the music give the chart a sense of metre.
    const beat = 60 / this.track.bpm;
    const barLen = beat * 4;
    const firstBar = Math.floor(this.time / barLen) - 1;
    for (let b = firstBar; b < firstBar + 8; b++) {
      const y = L.judgeY - (b * barLen - this.time) * L.speed;
      if (y < -20 || y > L.judgeY + 20) continue;
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(L.x0, y); ctx.lineTo(L.x0 + LANES * L.lw, y);
      ctx.stroke();
    }
  }

  _drawNotes(ctx, L) {
    for (const n of this.notes) {
      if (n.done && !n.holding) continue;
      const y = L.judgeY - (n.t - this.time) * L.speed;
      if (y < -120 || y > L.judgeY + 90) continue;
      const x = L.x0 + n.lane * L.lw;
      const c = LANE_COLORS[n.lane];

      if (n.hold) {
        // Tail first, so the head sits on top of it.
        const tailY = L.judgeY - (n.t + n.hold - this.time) * L.speed;
        const top = Math.max(tailY, -40);
        const bottom = n.holding ? L.judgeY : y;
        ctx.fillStyle = hexA(c, n.holding ? 0.7 : 0.38);
        roundRect(ctx, x + L.lw * 0.28, top, L.lw * 0.44, Math.max(0, bottom - top), 6);
        ctx.fill();
      }
      if (n.holding) continue;

      // Head: a rounded slab with a bright lip.
      const h = 17;
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, c); g.addColorStop(1, shade(c, -0.3));
      ctx.fillStyle = g;
      roundRect(ctx, x + 5, y - h / 2, L.lw - 10, h, 6); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      roundRect(ctx, x + 8, y - h / 2 + 2, L.lw - 16, 3.5, 2); ctx.fill();
      ctx.strokeStyle = hexA(c, 0.9); ctx.lineWidth = 1.4;
      roundRect(ctx, x + 5, y - h / 2, L.lw - 10, h, 6); ctx.stroke();
    }
  }

  _drawJudgeBar(ctx, W, L) {
    const y = L.judgeY;
    ctx.save();
    const g = ctx.createLinearGradient(L.x0, y - 8, L.x0, y + 8);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(L.x0, y - 8, LANES * L.lw, 16);
    ctx.restore();
  }

  _drawPads(ctx, H, L) {
    const labels = this.useTouch ? ["", "", "", ""] : ["D", "F", "J", "K"];
    for (let i = 0; i < LANES; i++) {
      const x = L.x0 + i * L.lw;
      const down = this.held[i];
      ctx.fillStyle = down ? hexA(LANE_COLORS[i], 0.75) : "rgba(255,255,255,0.07)";
      roundRect(ctx, x + 4, L.judgeY + 12, L.lw - 8, 54, 10); ctx.fill();
      ctx.strokeStyle = hexA(LANE_COLORS[i], down ? 1 : 0.42);
      ctx.lineWidth = down ? 2.5 : 1.5;
      roundRect(ctx, x + 4, L.judgeY + 12, L.lw - 8, 54, 10); ctx.stroke();
      ctx.fillStyle = down ? "#0b0a12" : hexA(LANE_COLORS[i], 0.75);
      ctx.font = "800 16px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(labels[i], x + L.lw / 2, L.judgeY + 46);
    }
  }

  _drawHits(ctx, L) {
    for (const h of this.hits) {
      const p = h.t / 0.4;
      const x = L.x0 + h.lane * L.lw + L.lw / 2;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = h.color;
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath(); ctx.arc(x, L.judgeY, 12 + p * 34, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawHud(ctx, W, H) {
    // Combo, big and centred above the lanes.
    if (this.combo > 3) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `800 ${Math.min(46, 26 + this.combo * 0.12)}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(String(this.combo), W / 2, H * 0.3);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "700 11px 'Inter', system-ui, sans-serif";
      ctx.fillText("COMBO", W / 2, H * 0.3 + 16);
    }
    if (this.judgeT > 0) {
      ctx.textAlign = "center";
      ctx.globalAlpha = Math.min(1, this.judgeT / 0.2);
      ctx.fillStyle = this.judgeColor;
      ctx.font = "800 22px 'Sora', system-ui, sans-serif";
      ctx.fillText(this.judgeText, W / 2, H * 0.38);
      ctx.globalAlpha = 1;
    }

    // Health bar down the left edge.
    const bh = H * 0.5, bx = 10, by = (H - bh) / 2;
    ctx.fillStyle = "rgba(8,6,16,0.6)";
    roundRect(ctx, bx, by, 9, bh, 5); ctx.fill();
    const frac = clamp(this.health / 100, 0, 1);
    const g = ctx.createLinearGradient(0, by + bh, 0, by);
    g.addColorStop(0, frac < 0.3 ? "#ff5470" : "#2ee6a6");
    g.addColorStop(1, frac < 0.3 ? "#ff9f43" : "#7cf0d0");
    ctx.fillStyle = g;
    roundRect(ctx, bx + 1, by + bh - bh * frac + 1, 7, Math.max(0, bh * frac - 2), 4); ctx.fill();

    // Song progress along the top.
    const prog = clamp(this.time / this.songLen, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, 0, W, 4);
    ctx.fillStyle = this.track.hue;
    ctx.fillRect(0, 0, W * prog, 4);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "700 10px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${this.track.name} · ${this.track.bpm} BPM`, 24, 18);

    if (this.time < 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 26px 'Sora', system-ui, sans-serif";
      ctx.fillText(Math.ceil(-this.time).toString(), W / 2, H * 0.34);
    }
  }
}

/**
 * Turns a track description into both a chart and a list of audio events.
 *
 * The two are generated together from one pass over the bars, which is the
 * point: a note on lane 1 exists because there is a kick at that instant,
 * so hitting the chart and hearing the music agree by construction.
 */
function buildChart(track) {
  const rng = seededRng(`pulse-${track.id}`);
  const beat = 60 / track.bpm;
  const notes = [];
  const events = [];
  const scale = SCALES[track.mode];
  let melodyStep = 0;

  for (let bar = 0; bar < track.bars; bar++) {
    const barT = bar * beat * 4;
    const intense = bar / track.bars;             // the chart thickens as it goes
    const chordRoot = scale[[0, 5, 3, 4][bar % 4] % scale.length];

    // Pad under every bar.
    events.push({ t: barT, kind: "pad", freq: track.root * Math.pow(2, chordRoot / 12) / 2, dur: beat * 3.6 });

    for (let step = 0; step < 16; step++) {
      const swing = (step % 2 === 1) ? track.swing * beat : 0;
      const t = barT + (step / 4) * beat + swing;

      // --- drums ---
      const isKick = step % 8 === 0 || (track.density > 1.8 && step === 11);
      const isSnare = step === 4 || step === 12;
      const isHat = step % 2 === 0 && track.density > 1.2;
      if (isKick) events.push({ t, kind: "kick" });
      if (isSnare) events.push({ t, kind: "snare" });
      if (isHat) events.push({ t, kind: "hat" });

      // --- chart ---
      // Density decides how much of the drum pattern becomes a note, and
      // the intensity ramp means the last third of a track is its hardest.
      const chance = clamp((track.density - 1) * 0.32 + intense * 0.3, 0, 0.95);
      let lane = -1;
      if (isKick) lane = 0;
      else if (isSnare) lane = 2;
      else if (step % 4 === 0 && rng() < 0.75) lane = Math.floor(rng() * LANES);
      else if (rng() < chance) lane = Math.floor(rng() * LANES);
      if (lane < 0) continue;
      if (bar < 1) continue;                       // one empty bar to settle in

      // A melody note sounds with every chart note, walking the scale.
      melodyStep = (melodyStep + (rng() < 0.5 ? 1 : -1) + scale.length) % scale.length;
      const semi = scale[melodyStep] + (rng() < 0.25 ? 12 : 0);
      events.push({ t, kind: "lead", freq: track.root * Math.pow(2, semi / 12), dur: beat * 0.4 });

      // Holds appear from the middle tracks on, on the long gaps.
      const hold = (track.density > 1.5 && step % 8 === 0 && rng() < 0.22) ? beat * 1.5 : 0;
      notes.push({ t, lane, hold });

      // Chords: two lanes at once, only on the dense tracks.
      if (track.density > 2.4 && rng() < 0.12) {
        let l2 = (lane + 1 + Math.floor(rng() * (LANES - 1))) % LANES;
        notes.push({ t, lane: l2, hold: 0 });
      }
    }
  }
  notes.sort((a, b) => a.t - b.t);
  events.sort((a, b) => a.t - b.t);
  return { notes, events, length: track.bars * beat * 4 };
}

function difficultyStars(d) {
  const n = clamp(Math.round((d - 0.8) * 3), 1, 10);
  return `${"◆".repeat(n)}${"◇".repeat(Math.max(0, 5 - n))}`.slice(0, 10) || "◆";
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

export default PulseRunnerGame;
