// ==========================================================================
// Chain Reaction — build a contraption, press go, watch it fail.
//
// Each level gives you a ball, a goal and a handful of parts. You place the
// parts while the world is paused, then run it and see what the physics
// actually does with your idea. Nothing is scored on the first attempt —
// the loop is place, run, watch where it went wrong, adjust.
//
// Twenty-four levels. The parts are few and the interactions between them
// are the content: a ramp under a fan is a different machine from a fan
// under a ramp.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { el, clamp, formatNumber, seededRng } from "../core/utils.js";

const LEVELS = 24;
const W = 1000, H = 700;      // world units; the view scales to fit
const GRAV = 1150;
const DT = 1 / 120;

// --- Parts ----------------------------------------------------------------
// Every part is a static body plus a rule. Keeping them this simple is what
// makes the interactions readable rather than a physics soup.
const PARTS = [
  { id: "ramp",   name: "Ramp",    color: "#8a7a5c", text: "A slope. Click to place, click again to flip it." },
  { id: "wall",   name: "Wall",    color: "#8b90ac", text: "A short vertical block. Stops or redirects." },
  { id: "bouncer",name: "Bouncer", color: "#2ee6a6", text: "Throws the ball back harder than it arrived." },
  { id: "fan",    name: "Fan",     color: "#22d3ee", text: "Blows the ball upward in a column above it." },
  { id: "magnet", name: "Magnet",  color: "#ff4fd8", text: "Pulls the ball toward it while it is close." },
  { id: "boost",  name: "Booster", color: "#ffd76a", text: "Kicks the ball sideways when touched." },
];
const byId = Object.fromEntries(PARTS.map(p => [p.id, p]));

export class ChainReactionGame extends GameBase {
  getDifficulties() { return ["Contraption"]; }
  getInstructions() {
    return [
      "Pick a part, then click in the field to place it. Click a placed part to remove it; click a ramp again to flip its slope.",
      "You get a limited number of each part. What you are given is the puzzle.",
      "Press Run to drop the ball. Press Reset to put everything back and try again — there is no penalty for a failed attempt.",
      "Get the ball to every green target. Red spikes end the run.",
      "Twenty-four levels. Fewer parts used means a better score, so the second solution is usually the interesting one.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a part, tap the field to place it. Tap Run when you are ready."; }
  getKeyboardHint() { return "1-6 pick a part, click to place, Space runs, R resets."; }
  getScene() { return "aurora"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.chain) custom.chain = { cleared: {} };
    if (!custom.chain.cleared) custom.chain.cleared = {};
    return custom.chain;
  }
  _save() { saveManager.saveNow(); }
  _unlocked(i) { return i === 0 || !!this._store().cleared[i - 1]; }

  getPlayLabel() { return "Pick a level"; }
  getStartExtras() {
    const c = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `${Object.keys(c.cleared).length}/${LEVELS} solved`),
    ]);
  }

  getLevelNav() {
    const store = this._store();
    return {
      index: this.levelIdx,
      count: LEVELS,
      label: "Contraption",
      title: "Contraptions",
      intro: "Twenty-four fixed problems. The number under a solved level is the fewest parts you have used on it.",
      unlocked: (i) => this._unlocked(i),
      cleared: (i) => store.cleared[i],
      note: (i) => (store.cleared[i] ? `${store.cleared[i]} parts`
        : this._unlocked(i) ? "Open" : "Locked"),
      goTo: (i) => { this.levelIdx = i; this.start(); },
    };
  }

  onPlayPressed() { this.openLevelSelect(); }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    this.input.onPointer("move", (p) => { this.hover = this._toWorld(p.x, p.y); });
    PARTS.forEach((p, i) => this.input.onKey(`Digit${i + 1}`, () => this._pick(i)));
    this.input.onKey("Space", () => this._run());
    this.input.onKey("KeyR", () => this._reset());
    this.levelIdx = 0;
  }

  onResize() { this._fit(); }

  onStart() {
    this.level = buildLevel(this.levelIdx);
    this.placed = [];
    this.budget = { ...this.level.budget };
    this.selected = PARTS.findIndex(p => (this.budget[p.id] || 0) > 0);
    if (this.selected < 0) this.selected = 0;
    this.running = false;
    this.ball = null;
    this.trail = [];
    this.hover = null;
    this.elapsed = 0;
    this.attempts = 0;
    this.msg = "Place parts, then press Run";
    this.msgT = 3.5;
    this.sparks = [];
    this.setScore(0);
    this._fit();
    this._updateHud();
  }

  _fit() {
    const vw = this.viewW || 600, vh = this.viewH || 600;
    this.scale = Math.min(vw / W, (vh - 78) / H);
    this.ox = (vw - W * this.scale) / 2;
    this.oy = 14;
  }
  _toWorld(x, y) { return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale }; }

  // ------------------------------------------------------------- INPUT ---
  _pick(i) {
    if ((this.budget[PARTS[i].id] || 0) <= 0) { audioManager.play("error"); return; }
    this.selected = i;
    audioManager.play("select");
  }

  _click(px, py) {
    if (this.state !== "playing") return;
    for (const b of this._bar()) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
        if (b.run) { this._run(); return; }
        if (b.reset) { this._reset(); return; }
        this._pick(b.i);
        return;
      }
    }
    if (this.running) return;
    const p = this._toWorld(px, py);
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;

    // Clicking an existing part flips a ramp or removes anything else.
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const e = this.placed[i];
      if (Math.abs(e.x - p.x) < 46 && Math.abs(e.y - p.y) < 30) {
        if (e.kind === "ramp" && !e.flipped) { e.flipped = true; audioManager.play("click"); return; }
        this.placed.splice(i, 1);
        this.budget[e.kind]++;
        audioManager.play("hit");
        this._updateHud();
        return;
      }
    }

    const kind = PARTS[this.selected].id;
    if ((this.budget[kind] || 0) <= 0) { this._say("None of those left", "#ff5470"); return; }
    // Do not let a part be dropped on top of the level's own furniture.
    for (const o of this.level.obstacles) {
      if (p.x > o.x - 50 && p.x < o.x + o.w + 50 && p.y > o.y - 34 && p.y < o.y + o.h + 34) {
        this._say("Too close to the scenery", "#ff5470");
        return;
      }
    }
    this.placed.push({ kind, x: p.x, y: p.y, flipped: false });
    this.budget[kind]--;
    audioManager.play("place");
    if (this.budget[kind] <= 0) {
      const next = PARTS.findIndex(pp => (this.budget[pp.id] || 0) > 0);
      if (next >= 0) this.selected = next;
    }
    this._updateHud();
  }

  _run() {
    if (this.running) return;
    this.running = true;
    this.attempts++;
    this.ball = { x: this.level.start.x, y: this.level.start.y, vx: 0, vy: 0, r: 13, t: 0 };
    this.trail = [];
    this.targets = this.level.targets.map(t => ({ ...t, got: false }));
    audioManager.play("shoot");
    this._say("Running", "#22d3ee");
    this._updateHud();
  }

  _reset() {
    this.running = false;
    this.ball = null;
    this.trail = [];
    this.targets = null;
    this._say("Reset", "#8b90ac");
    this._updateHud();
  }

  // ------------------------------------------------------------ PHYSICS --
  // The live game and the level generator run the same functions, so a level
  // that generated as solvable is solvable in the hand.
  _stepBall() {
    const r = stepBall(this.level, this.placed, this.ball, this.targets, (t) => {
      audioManager.play("coin");
      for (let i = 0; i < 14; i++) {
        this.sparks.push({ x: t.x, y: t.y, vx: (Math.random() - 0.5) * 400, vy: (Math.random() - 0.5) * 400, t: 0, c: "#2ee6a6" });
      }
    });
    if (r === "win") { this._clear(); return; }
    if (r === "spikes") { this._fail("The ball hit the spikes."); return; }
    if (r === "out") { this._fail("The ball ran off the bottom."); return; }
    if (r === "timeout") { this._fail("The ball never got there."); return; }
  }

  _fail(reason) {
    this.running = false;
    this.ball = null;
    audioManager.play("error");
    this._say(`${reason} Press Reset and try again.`, "#ff5470");
    this._updateHud();
  }

  _clear() {
    this.running = false;
    const used = this.placed.length;
    const store = this._store();
    const prev = store.cleared[this.levelIdx];
    if (!prev || used < prev) store.cleared[this.levelIdx] = used;
    this._save();
    this.addScore(600 + Math.max(0, 400 - used * 45) + this.levelIdx * 60);
    audioManager.play("win");
    this.endGame({
      result: "win", score: this.score,
      message: this.levelIdx + 1 >= LEVELS
        ? `Every contraption built. The last one took ${used} parts.`
        : `Level ${this.levelIdx + 1} solved with ${used} part${used === 1 ? "" : "s"} on attempt ${this.attempts}.`,
      extraStats: [
        { label: "Parts", value: used },
        { label: "Attempts", value: this.attempts },
        { label: "Solved", value: `${Object.keys(store.cleared).length}/${LEVELS}` },
      ],
    });
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 2.6; }

  _updateHud() {
    const left = Object.values(this.budget || {}).reduce((a, b) => a + b, 0);
    this.setHud({
      Level: `${this.levelIdx + 1}/${LEVELS}`,
      Parts: `${this.placed?.length ?? 0} used`,
      Left: left,
      Runs: this.attempts,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt;
      if (s.t > 0.7) this.sparks.splice(i, 1);
    }
    if (!this.running || !this.ball) return;
    const steps = Math.min(20, Math.max(1, Math.round(dt / DT)));
    for (let k = 0; k < steps && this.running && this.ball; k++) {
      this._stepBall();
      if (this.ball) {
        this.trail.push({ x: this.ball.x, y: this.ball.y });
        if (this.trail.length > 320) this.trail.shift();
      }
    }
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const vw = this.viewW, vh = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, "#141a2c"); g.addColorStop(1, "#0a0d18");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);

    // Field frame and grid.
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, H);

    this._drawObstacles(ctx);
    this._drawSpikes(ctx);
    this._drawTargets(ctx);
    this._drawTrail(ctx);
    for (const p of this.placed) this._drawPart(ctx, p, 1);
    if (!this.running && this.hover) this._drawGhost(ctx);
    this._drawStart(ctx);
    if (this.ball) this._drawBall(ctx);
    this._drawSparks(ctx);
    ctx.restore();

    this._drawBar(ctx, vw, vh);
    this._drawMessage(ctx, vw, vh);
    ctx.restore();
  }

  _drawObstacles(ctx) {
    for (const o of this.level.obstacles) {
      const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
      g.addColorStop(0, "#4a4f63"); g.addColorStop(1, "#2a2e3c");
      ctx.fillStyle = g;
      roundRect(ctx, o.x, o.y, o.w, o.h, 6); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, o.x, o.y, o.w, Math.min(7, o.h * 0.25), 4); ctx.fill();
    }
  }

  _drawSpikes(ctx) {
    for (const s of this.level.spikes) {
      ctx.fillStyle = "#c93a4a";
      const n = Math.max(2, Math.floor(s.w / 22));
      for (let i = 0; i < n; i++) {
        const x = s.x + (i * s.w) / n;
        ctx.beginPath();
        ctx.moveTo(x, s.y + 22); ctx.lineTo(x + s.w / n / 2, s.y);
        ctx.lineTo(x + s.w / n, s.y + 22);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#7a1f2a";
      ctx.fillRect(s.x, s.y + 20, s.w, 5);
    }
  }

  _drawTargets(ctx) {
    const list = this.targets || this.level.targets;
    for (const t of list) {
      const got = t.got;
      ctx.save();
      ctx.translate(t.x, t.y);
      if (!got) {
        const gg = ctx.createRadialGradient(0, 0, 2, 0, 0, t.r * 1.8);
        gg.addColorStop(0, "rgba(46,230,166,0.5)");
        gg.addColorStop(1, "rgba(46,230,166,0)");
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, 0, t.r * 1.8, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = got ? "rgba(46,230,166,0.3)" : "#2ee6a6";
      ctx.lineWidth = 4;
      const spin = this.elapsed * 1.6;
      ctx.beginPath(); ctx.arc(0, 0, t.r, spin, spin + 2.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, t.r, spin + Math.PI, spin + Math.PI + 2.1); ctx.stroke();
      if (!got) {
        ctx.fillStyle = "#7cf0d0";
        ctx.beginPath(); ctx.arc(0, 0, t.r * 0.3, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawStart(ctx) {
    const s = this.level.start;
    ctx.save();
    ctx.translate(s.x, s.y - 30);
    ctx.fillStyle = "#5c5040";
    roundRect(ctx, -30, -12, 60, 20, 5); ctx.fill();
    ctx.fillStyle = "#3a3228";
    roundRect(ctx, -24, -6, 48, 12, 4); ctx.fill();
    ctx.restore();
  }

  _drawTrail(ctx) {
    if (this.trail.length < 2) return;
    ctx.strokeStyle = "rgba(255,215,106,0.4)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }

  _drawBall(ctx) {
    const b = this.ball;
    ctx.save();
    ctx.translate(b.x, b.y);
    const g = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.35, 1, 0, 0, b.r);
    g.addColorStop(0, "#fff0ad"); g.addColorStop(1, "#c9971c");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.stroke();
    ctx.restore();
  }

  /** Each part drawn as the thing it is, at the placement position. */
  _drawPart(ctx, p, alpha) {
    const spec = byId[p.kind];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    if (p.kind === "ramp") {
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 12; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-52, p.flipped ? -22 : 22);
      ctx.lineTo(52, p.flipped ? 22 : -22);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (p.kind === "wall") {
      ctx.fillStyle = spec.color;
      roundRect(ctx, -12, -46, 24, 92, 5); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      roundRect(ctx, -12, -46, 24, 8, 4); ctx.fill();
    } else if (p.kind === "bouncer") {
      ctx.fillStyle = spec.color;
      roundRect(ctx, -44, -12, 88, 24, 12); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 15, -6); ctx.lineTo(i * 15, 6);
        ctx.stroke();
      }
    } else if (p.kind === "fan") {
      // Draft column, then the fan body with spinning blades.
      const g = ctx.createLinearGradient(0, -300, 0, 0);
      g.addColorStop(0, "rgba(34,211,238,0)");
      g.addColorStop(1, "rgba(34,211,238,0.18)");
      ctx.fillStyle = g;
      ctx.fillRect(-46, -300, 92, 300);
      ctx.fillStyle = "#1d3a52";
      roundRect(ctx, -34, -14, 68, 34, 7); ctx.fill();
      ctx.save();
      ctx.translate(0, 2);
      ctx.rotate(this.elapsed * 12);
      ctx.fillStyle = spec.color;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i / 3) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -12, 5, 13, 0, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    } else if (p.kind === "magnet") {
      ctx.strokeStyle = hexA(spec.color, 0.28);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 7]);
      ctx.beginPath(); ctx.arc(0, 0, 220, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 13; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.arc(0, 6, 22, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = "#e6eaf5";
      ctx.fillRect(-29, 4, 14, 12);
      ctx.fillRect(15, 4, 14, 12);
    } else {
      // Booster: an arrow in a box, pointing the way it kicks.
      ctx.fillStyle = spec.color;
      roundRect(ctx, -26, -26, 52, 52, 8); ctx.fill();
      ctx.fillStyle = "#2a1f04";
      const d = p.flipped ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(d * 16, 0); ctx.lineTo(-d * 6, -14); ctx.lineTo(-d * 6, -5);
      ctx.lineTo(-d * 18, -5); ctx.lineTo(-d * 18, 5); ctx.lineTo(-d * 6, 5);
      ctx.lineTo(-d * 6, 14);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  _drawGhost(ctx) {
    const kind = PARTS[this.selected].id;
    if ((this.budget[kind] || 0) <= 0) return;
    const p = this.hover;
    if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;
    this._drawPart(ctx, { kind, x: p.x, y: p.y, flipped: false }, 0.4);
  }

  _drawSparks(ctx) {
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, 1 - s.t / 0.7);
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, 4 * (1 - s.t / 0.7) + 1, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _bar() {
    const vw = this.viewW, vh = this.viewH;
    const n = PARTS.length;
    const w = Math.min(76, (vw - 150) / n - 4);
    const total = n * w + (n - 1) * 4;
    const x0 = (vw - total) / 2 - 46;
    const out = PARTS.map((p, i) => ({ i, p, x: x0 + i * (w + 4), y: vh - 46, w, h: 36 }));
    out.push({ run: true, x: x0 + total + 10, y: vh - 46, w: 58, h: 36 });
    out.push({ reset: true, x: x0 - 66, y: vh - 46, w: 58, h: 36 });
    return out;
  }

  _drawBar(ctx, vw, vh) {
    for (const b of this._bar()) {
      if (b.run || b.reset) {
        ctx.fillStyle = b.run ? (this.running ? "rgba(60,70,90,0.9)" : "rgba(46,230,166,0.9)") : "rgba(60,70,90,0.9)";
        roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
        ctx.fillStyle = b.run && !this.running ? "#0b1a14" : "#ffffff";
        ctx.font = "800 12px 'Sora', system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(b.run ? "RUN" : "RESET", b.x + b.w / 2, b.y + 23);
        continue;
      }
      const n = this.budget[b.p.id] || 0;
      const on = this.selected === b.i;
      ctx.globalAlpha = n > 0 ? 1 : 0.28;
      ctx.fillStyle = on ? hexA(b.p.color, 0.85) : "rgba(18,22,36,0.9)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
      ctx.strokeStyle = on ? "#ffffff" : hexA(b.p.color, 0.5);
      ctx.lineWidth = on ? 2 : 1.2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.stroke();
      ctx.fillStyle = on ? "#0b0a12" : b.p.color;
      ctx.font = "800 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.p.name.toUpperCase(), b.x + b.w / 2, b.y + 15);
      ctx.font = "700 11px 'Inter', system-ui, sans-serif";
      ctx.fillText(`×${n}`, b.x + b.w / 2, b.y + 28);
      ctx.globalAlpha = 1;
    }
  }

  _drawMessage(ctx, vw, vh) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,10,20,0.72)";
    roundRect(ctx, vw / 2 - 190, vh - 84, 380, 26, 13); ctx.fill();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, vw / 2, vh - 66);
    ctx.globalAlpha = 1;
  }
}


/**
 * One physics step. Returns null to continue, or why the run ended.
 *
 * A ramp does not bounce the ball: it cancels the velocity into the slope and
 * keeps the velocity along it, so the ball slides. Reflecting off ramps made
 * them ricochets rather than guides, and a sweep of all 24 levels could not
 * find a solution for 20 of them.
 */
function stepBall(level, placed, b, targets, onTarget) {
  b.vy += GRAV * DT;

  for (const p of placed) {
    if (p.kind === "fan") {
      if (Math.abs(b.x - p.x) < 46 && b.y < p.y && b.y > p.y - 300) {
        b.vy -= 2100 * DT * (1 - (p.y - b.y) / 300);
      }
    } else if (p.kind === "magnet") {
      const dx = p.x - b.x, dy = p.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 220 && d > 1) {
        b.vx += (dx / d) * 900 * DT * (1 - d / 220);
        b.vy += (dy / d) * 900 * DT * (1 - d / 220);
      }
    }
  }

  b.vx = clamp(b.vx, -900, 900);
  b.vy = clamp(b.vy, -900, 1100);
  b.x += b.vx * DT;
  b.y += b.vy * DT;

  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
  if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
  if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }

  for (const o of level.obstacles) hitBox(b, o.x, o.y, o.w, o.h, 0.15);
  for (const p of placed) hitPart(b, p);

  for (const t of targets) {
    if (t.got) continue;
    if (Math.hypot(t.x - b.x, t.y - b.y) < t.r + b.r) { t.got = true; onTarget?.(t); }
  }
  for (const s of level.spikes) {
    if (b.x > s.x && b.x < s.x + s.w && b.y + b.r > s.y && b.y < s.y + 22) return "spikes";
  }
  // The empty-array guard matters: [].every() is true, so a trace run with
  // no targets — which is exactly what the level generator does — reported a
  // win on its very first step and every level fell through to the fallback.
  if (targets.length && targets.every(t => t.got)) return "win";
  if (b.y - b.r > H) return "out";
  b.t += DT;
  if (b.t > 26) return "timeout";
  return null;
}

/** Axis-aligned box collision, resolved on the smallest overlap. */
function hitBox(b, x, y, w, h, bounce) {
  const cx = clamp(b.x, x, x + w), cy = clamp(b.y, y, y + h);
  const dx = b.x - cx, dy = b.y - cy;
  if (dx * dx + dy * dy > b.r * b.r) return false;
  const d = Math.hypot(dx, dy) || 0.001;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * b.r;
  b.y = cy + ny * b.r;
  const dot = b.vx * nx + b.vy * ny;
  b.vx -= (1 + bounce) * dot * nx;
  b.vy -= (1 + bounce) * dot * ny;
  b.vx *= 0.99;
  return true;
}

function hitPart(b, p) {
  if (p.kind === "fan" || p.kind === "magnet") return;
  if (p.kind === "ramp") {
    const x0 = p.x - 52, x1 = p.x + 52;
    const y0 = p.flipped ? p.y - 22 : p.y + 22;
    const y1 = p.flipped ? p.y + 22 : p.y - 22;
    const t = clamp(((b.x - x0) * (x1 - x0) + (b.y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), 0, 1);
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    const dx = b.x - px, dy = b.y - py;
    const d = Math.hypot(dx, dy);
    if (d > b.r) return;
    const nx = dx / (d || 1), ny = dy / (d || 1);
    b.x = px + nx * b.r; b.y = py + ny * b.r;
    // Slide: cancel the component into the slope, keep the one along it.
    const dot = b.vx * nx + b.vy * ny;
    if (dot < 0) { b.vx -= dot * nx; b.vy -= dot * ny; }
    b.vx *= 0.995; b.vy *= 0.995;
    return;
  }
  if (p.kind === "wall") { hitBox(b, p.x - 12, p.y - 46, 24, 92, 0.25); return; }
  if (p.kind === "bouncer") {
    if (hitBox(b, p.x - 44, p.y - 12, 88, 24, 1.55)) audioManager.play("pop");
    return;
  }
  if (p.kind === "boost") {
    if (hitBox(b, p.x - 26, p.y - 26, 52, 52, 0.2)) b.vx += (p.flipped ? -1 : 1) * 480;
  }
}

/** Runs a whole flight with no targets and returns the path it traced. */
function tracePath(level, placed, maxSteps = 2600) {
  const b = { x: level.start.x, y: level.start.y, vx: 0, vy: 0, r: 13, t: 0 };
  const path = [];
  const none = [];
  for (let k = 0; k < maxSteps; k++) {
    const r = stepBall(level, placed, b, none, null);
    path.push({ x: b.x, y: b.y });
    if (r) break;
  }
  return path;
}

/**
 * Level `i`.
 *
 * Targets are not scattered — the generator places ramps, flies the ball,
 * and puts the targets on the path the ball actually took. Scattering them
 * left 20 of these 24 levels with no solution at all; generating from a
 * proven flight means at least one arrangement always works, and the player
 * gets more parts than that solution used, so there is room to find another.
 */
function buildLevel(i) {
  const rng = seededRng(`chain-v2-${i}`);
  const between = (a, b) => a + rng() * (b - a);
  const targetN = 1 + Math.min(2, Math.floor(i / 9));
  const obstacleN = Math.min(4, 1 + Math.floor(i / 5));
  const spikeN = i < 4 ? 0 : Math.min(3, Math.floor((i - 2) / 5));
  // How many ramps the *solution* may use. The player gets more than this.
  const solveRamps = 1 + Math.min(4, Math.floor(i / 5));

  for (let attempt = 0; attempt < 30; attempt++) {
    const start = { x: between(90, 220), y: 60 };
    const obstacles = [];
    for (let k = 0; k < obstacleN; k++) {
      for (let t = 0; t < 40; t++) {
        const w = between(120, 300), h = between(20, 34);
        const x = between(180, W - w - 60), y = between(190, H - 170);
        if (Math.abs(x + w / 2 - start.x) < 130 && y < 240) continue;
        if (obstacles.some(o => Math.abs(o.y - y) < 95 && x < o.x + o.w + 60 && x + w > o.x - 60)) continue;
        obstacles.push({ x, y, w, h });
        break;
      }
    }
    const level = { start, obstacles, spikes: [], targets: [], budget: {} };

    // Search ramp layouts for the flight that travels furthest.
    let best = null;
    for (let t = 0; t < 260; t++) {
      const n = 1 + Math.floor(rng() * solveRamps);
      const placed = [];
      for (let k = 0; k < n; k++) {
        placed.push({
          kind: "ramp",
          x: between(120, W - 120),
          y: between(160, H - 120),
          flipped: rng() < 0.5,
        });
      }
      const path = tracePath(level, placed, 2200);
      if (path.length < 220) continue;
      let span = 0;
      for (let k = 12; k < path.length; k += 12) {
        span += Math.hypot(path[k].x - path[k - 12].x, path[k].y - path[k - 12].y);
      }
      // Reward reach as well as length, so the ball is made to go somewhere.
      const reach = Math.max(...path.map(pt => Math.hypot(pt.x - start.x, pt.y - start.y)));
      const score = span * 0.4 + reach * 2;
      if (!best || score > best.score) best = { path, score, placed, n };
    }
    if (!best) continue;

    // Targets on that path, spread out and clear of the scenery.
    const path = best.path;
    const cand = [];
    for (let k = Math.floor(path.length * 0.2); k < path.length; k += 4) {
      const pt = path[k];
      if (pt.x < 50 || pt.x > W - 50 || pt.y < 60 || pt.y > H - 50) continue;
      if (Math.hypot(pt.x - start.x, pt.y - start.y) < 260) continue;
      if (obstacles.some(o => pt.x > o.x - 40 && pt.x < o.x + o.w + 40 && pt.y > o.y - 40 && pt.y < o.y + o.h + 40)) continue;
      cand.push(pt);
    }
    if (!cand.length) continue;
    for (let k = 0; k < targetN; k++) {
      const pt = cand[Math.min(cand.length - 1, Math.floor((cand.length * (k + 0.5)) / targetN))];
      if (level.targets.some(o => Math.hypot(o.x - pt.x, o.y - pt.y) < 150)) continue;
      level.targets.push({ x: pt.x, y: pt.y, r: 24 });
    }
    if (!level.targets.length) continue;

    // Spikes only where the winning path never goes.
    for (let k = 0; k < spikeN; k++) {
      for (let t = 0; t < 90; t++) {
        const w = between(90, 190);
        const x = between(220, W - w - 60);
        const y = between(280, H - 60);
        if (level.targets.some(o => Math.abs(o.x - (x + w / 2)) < w / 2 + 90 && Math.abs(o.y - y) < 110)) continue;
        if (obstacles.some(o => Math.abs(o.y - y) < 60 && x < o.x + o.w && x + w > o.x)) continue;
        if (level.spikes.some(o => Math.abs(o.y - y) < 60 && x < o.x + o.w + 40 && x + w > o.x - 40)) continue;
        let clear = true;
        for (let q = 0; q < path.length; q += 3) {
          if (path[q].x > x - 20 && path[q].x < x + w + 20 && path[q].y > y - 40 && path[q].y < y + 40) { clear = false; break; }
        }
        if (!clear) continue;
        level.spikes.push({ x, y, w });
        break;
      }
    }

    // Final proof: replay the layout the targets came from against the
    // finished level, spikes and all. A level only ships if a layout that
    // is known to beat it exists — the path the targets sit on is not
    // enough on its own, because a spike may have landed across it.
    {
      const check = level.targets.map(t => ({ ...t, got: false }));
      const b = { x: start.x, y: start.y, vx: 0, vy: 0, r: 13, t: 0 };
      let ok = false;
      for (let k = 0; k < 2600; k++) {
        const r = stepBall(level, best.placed, b, check, null);
        if (r === "win") { ok = true; break; }
        if (r) break;
      }
      if (!ok) continue;
      level.solution = best.placed.length;
    }

    // The player gets the solution's ramps plus slack, then the other parts.
    level.budget = { ramp: Math.min(9, best.n + 2 + Math.floor(i / 8)) };
    if (i >= 2) level.budget.wall = 1 + Math.floor(i / 8);
    if (i >= 5) level.budget.bouncer = 1 + Math.floor(i / 10);
    if (i >= 9) level.budget.fan = 1 + Math.floor(i / 14);
    if (i >= 13) level.budget.magnet = 1 + Math.floor(i / 18);
    if (i >= 17) level.budget.boost = 1 + Math.floor(i / 20);
    return level;
  }

  // Fallback: a bare field with the target placed on a real drop path.
  const start = { x: 140, y: 60 };
  const level = { start, obstacles: [], spikes: [], targets: [], budget: { ramp: 4 } };
  const path = tracePath(level, [{ kind: "ramp", x: 300, y: 380, flipped: false }], 1600);
  const pt = path[Math.floor(path.length * 0.7)] || { x: 700, y: 500 };
  level.targets.push({ x: pt.x, y: pt.y, r: 24 });
  return level;
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

export default ChainReactionGame;
