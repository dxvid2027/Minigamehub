// ==========================================================================
// Fruit Merge — drop fruit into a box; two of the same kind fuse into the
// next one up. Ten tiers, and only the first four ever fall from the chute,
// so every big fruit has to be built.
//
// The physics is a small impulse solver: circles, gravity, positional
// correction and a couple of substeps. With at most a few dozen fruit the
// naive O(n^2) pass is cheaper than any broad phase would be.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { clamp, randInt } from "../core/utils.js";

/**
 * The ladder. `r` is the fruit's diameter as a fraction of the box width, so
 * the whole set scales with the stage; `points` is what a merge *into* that
 * tier scores.
 */
const TIERS = [
  { name: "Cherry",     color: "#ff3f5f", leaf: true,  r: 0.080, points: 4 },
  { name: "Strawberry", color: "#ff6f8e", leaf: true,  r: 0.100, points: 8 },
  { name: "Grape",      color: "#a86bff", leaf: false, r: 0.122, points: 14 },
  { name: "Orange",     color: "#ff9f2f", leaf: false, r: 0.149, points: 24 },
  { name: "Persimmon",  color: "#ff6b28", leaf: true,  r: 0.178, points: 40 },
  { name: "Apple",      color: "#e8253f", leaf: true,  r: 0.212, points: 64 },
  { name: "Pear",       color: "#b6dd45", leaf: true,  r: 0.248, points: 100 },
  { name: "Peach",      color: "#ffa48c", leaf: true,  r: 0.289, points: 150 },
  { name: "Pineapple",  color: "#ffcf4a", leaf: false, r: 0.332, points: 230 },
  { name: "Melon",      color: "#37d98a", leaf: true,  r: 0.381, points: 400 },
];

const MAX_DROP_TIER = 4;     // the chute never hands out anything bigger
const GRAVITY = 2100;        // px/s^2 at a 1000px-wide box, scaled at runtime
const SUBSTEPS = 3;
const RESTITUTION = 0.12;
const WALL_DAMP = 0.55;

export class FruitMergeGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move the chute and drop fruit into the box.",
      "Two of the same fruit that touch fuse into the next one up — ten tiers, from cherry to melon.",
      "Only tiers 1-4 ever drop, so everything bigger has to be merged.",
      "If fruit stays piled above the red line, the box overflows and the run ends.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag across the box to aim the chute, lift your finger to drop."; }
  getKeyboardHint() { return "Move the mouse (or ←/→) to aim, click or press Space to drop."; }

  getScene() { return "aurora"; }

  onInit() {
    this.createCanvas();
    this.input.onPointer("down", (p) => { this._aimTo(p.x); this._pointerDown = true; });
    this.input.onPointer("move", (p) => { this._aimTo(p.x); });
    this.input.onPointer("up", () => { if (this._pointerDown) { this._pointerDown = false; this._drop(); } });
    this.input.onKey("Space", () => this._drop());
    this.input.onKey("ArrowDown", () => this._drop());
  }

  onResize() { this._layout(); }

  onStart(difficulty) {
    this._layout();
    this.maxDropTier = difficulty === "Easy" ? 3 : MAX_DROP_TIER;
    this.overflowGrace = difficulty === "Hard" ? 1.2 : difficulty === "Normal" ? 2 : 3;
    this.fruits = [];
    this.effects = [];
    this.dropX = this.box.x + this.box.w / 2;
    this.cooldown = 0;
    this.overflow = 0;
    this.best = 0;
    this.merges = 0;
    this.current = this._roll();
    this.next = this._roll();
    this.setScore(0);
    this.setHud({ Score: 0, Best: TIERS[0].name, Merges: 0 });
  }

  /** The playfield is a box inset in the stage, with the chute above it. */
  _layout() {
    // Tight margins: the box should own the stage, so the fruit read large.
    const pad = Math.min(this.viewW, this.viewH) * 0.028;
    const chute = clamp(this.viewH * 0.115, 46, 78);
    const w = this.viewW - pad * 2;
    const h = this.viewH - pad - chute;
    this.box = { x: pad, y: chute, w, h };
    this.dangerY = this.box.y + this.box.h * 0.055;
    this.scale = w;                      // radii are fractions of the box width
    this.gravity = GRAVITY * (w / 1000);
    if (this.dropX !== undefined) this._aimTo(this.dropX);
  }

  _radius(tier) { return TIERS[tier].r * this.scale * 0.5; }

  _roll() { return randInt(0, (this.maxDropTier ?? MAX_DROP_TIER) - 1); }

  _aimTo(x) {
    const r = this._radius(this.current ?? 0);
    this.dropX = clamp(x, this.box.x + r + 2, this.box.x + this.box.w - r - 2);
  }

  _drop() {
    if (this.state !== "playing" || this.cooldown > 0) return;
    const tier = this.current;
    const r = this._radius(tier);
    this.fruits.push({
      x: clamp(this.dropX, this.box.x + r, this.box.x + this.box.w - r),
      y: this.box.y - r * 0.2,
      vx: 0, vy: 0, r, tier,
      rot: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 1.4,
      // A freshly dropped fruit is exempt from the overflow check until it
      // has been inside the box for a moment — otherwise dropping *is* losing.
      settle: 0,
      pop: 0.18,
    });
    this.current = this.next;
    this.next = this._roll();
    this._aimTo(this.dropX);
    this.cooldown = 0.28;
    audioManager.play("swoosh");
  }

  // ------------------------------------------------------------- UPDATE ----
  onUpdate(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.input.isDown("ArrowLeft", "KeyA")) this._aimTo(this.dropX - 520 * dt);
    if (this.input.isDown("ArrowRight", "KeyD")) this._aimTo(this.dropX + 520 * dt);

    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this._step(h);

    for (const f of this.fruits) {
      f.settle += dt;
      f.rot += f.va * dt;
      if (f.pop > 0) f.pop = Math.max(0, f.pop - dt);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.t >= e.life) this.effects.splice(i, 1);
    }
    this.particles.update(dt);
    this._checkOverflow(dt);
  }

  _step(h) {
    const b = this.box;
    for (const f of this.fruits) {
      f.vy += this.gravity * h;
      f.x += f.vx * h;
      f.y += f.vy * h;
      f.vx *= 0.999;

      // Walls and floor.
      if (f.x - f.r < b.x) { f.x = b.x + f.r; f.vx = Math.abs(f.vx) * WALL_DAMP; f.va += 0.4; }
      if (f.x + f.r > b.x + b.w) { f.x = b.x + b.w - f.r; f.vx = -Math.abs(f.vx) * WALL_DAMP; f.va -= 0.4; }
      if (f.y + f.r > b.y + b.h) {
        f.y = b.y + b.h - f.r;
        f.vy = -Math.abs(f.vy) * RESTITUTION;
        f.vx *= 0.86;
        f.va *= 0.86;
      }
    }

    // Pair pass: merge first, then push apart.
    for (let i = 0; i < this.fruits.length; i++) {
      const a = this.fruits[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.fruits.length; j++) {
        const c = this.fruits[j];
        if (c.dead) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const min = a.r + c.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.0001;

        if (a.tier === c.tier && a.tier < TIERS.length - 1) { this._merge(a, c); continue; }

        const nx = dx / d, ny = dy / d;
        const overlap = min - d;
        // Heavier (bigger) fruit moves less.
        const ma = a.r * a.r, mc = c.r * c.r, total = ma + mc;
        a.x -= nx * overlap * (mc / total); a.y -= ny * overlap * (mc / total);
        c.x += nx * overlap * (ma / total); c.y += ny * overlap * (ma / total);

        const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
        const sep = rvx * nx + rvy * ny;
        if (sep < 0) {
          const imp = (-(1 + RESTITUTION) * sep) / total;
          a.vx -= imp * mc * nx; a.vy -= imp * mc * ny;
          c.vx += imp * ma * nx; c.vy += imp * ma * ny;
          const spin = (rvx * -ny + rvy * nx) * 0.004;
          a.va -= spin; c.va += spin;
        }
      }
    }

    if (this.fruits.some(f => f.dead)) this.fruits = this.fruits.filter(f => !f.dead);
  }

  _merge(a, c) {
    a.dead = c.dead = true;
    const tier = a.tier + 1;
    const t = TIERS[tier];
    const x = (a.x + c.x) / 2, y = (a.y + c.y) / 2;
    this.fruits.push({
      x, y,
      vx: (a.vx + c.vx) / 2, vy: (a.vy + c.vy) / 2 - 40,
      r: this._radius(tier), tier,
      rot: 0, va: (Math.random() - 0.5) * 2,
      settle: Math.min(a.settle, c.settle), pop: 0.26,
    });
    this.effects.push({ x, y, r: this._radius(tier), color: t.color, t: 0, life: 0.42 });
    this.merges++;
    this.addScore(t.points);
    this.best = Math.max(this.best, tier);
    this.setHud({ Best: TIERS[this.best].name, Merges: this.merges });
    this.particles.burst(x, y, { count: tier >= 5 ? 22 : 12, colors: [t.color, lighten(t.color, 0.45)], speed: 90 + tier * 22, size: 3 + tier * 0.3 });
    audioManager.play(tier >= 7 ? "levelup" : "pop");
    if (tier >= 6) this.shake();
    if (tier === TIERS.length - 1) this._melon();
  }

  /** Reaching the top tier is the win condition, but the run can continue. */
  _melon() {
    if (this._melonSeen) return;
    this._melonSeen = true;
    this.addScore(1000);
    saveManager.recordResult(this.id, "win");
    saveManager.save();
    audioManager.play("win");
  }

  /**
   * The box overflows when fruit has been resting above the red line for
   * longer than the grace period — a brief splash over the line is fine.
   */
  _checkOverflow(dt) {
    const over = this.fruits.some(f => f.settle > 0.9 && f.y - f.r < this.dangerY && Math.abs(f.vy) < 60);
    if (over) {
      this.overflow += dt;
      if (this.overflow >= this.overflowGrace) {
        this.endGame({
          result: "loss",
          message: `The box overflowed. Biggest fruit: ${TIERS[this.best].name}.`,
          extraStats: [{ label: "Biggest", value: TIERS[this.best].name }, { label: "Merges", value: this.merges }],
        });
      }
    } else {
      this.overflow = Math.max(0, this.overflow - dt * 2);
    }
  }

  // ------------------------------------------------------------- RENDER ----
  onRender(ctx, dt) {
    const { viewW: W, viewH: H } = this;
    this.gfx.backdrop(ctx, dt);
    // The backdrop is blitted in device pixels; everything below is authored
    // in CSS pixels, so it has to be scaled by the device pixel ratio. Without
    // this the whole game drew into the top-left corner of a retina canvas.
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const b = this.box;

    // Box: glass walls with a lit rim and a soft floor shadow.
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    const wall = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    wall.addColorStop(0, "rgba(255,255,255,0.05)");
    wall.addColorStop(1, "rgba(6,10,24,0.55)");
    ctx.fillStyle = wall;
    ctx.fill();
    ctx.clip();

    // Danger line — pulses once the pile starts pressing against it.
    const heat = this.overflow / (this.overflowGrace || 1);
    ctx.strokeStyle = `rgba(255,84,112,${0.35 + heat * 0.6})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(b.x, this.dangerY);
    ctx.lineTo(b.x + b.w, this.dangerY);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const f of this.fruits) this._drawFruit(ctx, f);
    for (const e of this.effects) this._drawMergeRing(ctx, e);
    this.particles.render(ctx);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    roundRect(ctx, b.x, b.y, b.w, b.h, 16);
    ctx.stroke();

    this._drawChute(ctx);
    this._drawNext(ctx, W);
    if (heat > 0.25) {
      this.gfx.label(ctx, "OVERFLOWING", W / 2, b.y + 26, { size: 15, weight: 800, color: `rgba(255,120,140,${heat})` });
    }
    ctx.restore();
  }

  _drawFruit(ctx, f) {
    const t = TIERS[f.tier];
    const pop = f.pop > 0 ? 1 + Math.sin((f.pop / 0.26) * Math.PI) * 0.16 : 1;
    const r = f.r * pop;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);

    ctx.beginPath();
    ctx.arc(0, r * 0.16, r * 0.96, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fill();

    const g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.1, 0, 0, r);
    g.addColorStop(0, lighten(t.color, 0.5));
    g.addColorStop(0.55, t.color);
    g.addColorStop(1, darken(t.color, 0.4));
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Specular dot and a rim light, so fruit reads as round at every size.
    ctx.beginPath();
    ctx.arc(-r * 0.34, -r * 0.4, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.97, Math.PI * 0.15, Math.PI * 0.85);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();

    if (t.leaf && r > 9) {
      ctx.beginPath();
      ctx.ellipse(r * 0.18, -r * 0.92, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = "#4bbd6b";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.86);
      ctx.lineTo(0, -r * 1.02);
      ctx.strokeStyle = "#7a5232";
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMergeRing(ctx, e) {
    const p = e.t / e.life;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * (1 + p * 0.9), 0, Math.PI * 2);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 3 * (1 - p) + 1;
    ctx.stroke();
    ctx.restore();
  }

  _drawChute(ctx) {
    const b = this.box;
    const t = TIERS[this.current];
    const r = this._radius(this.current);
    const y = b.y - r - 8;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(this.dropX, y + r);
    ctx.lineTo(this.dropX, b.y + b.h);
    ctx.stroke();
    ctx.restore();

    const ready = this.cooldown <= 0;
    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.45;
    this._drawFruit(ctx, { x: this.dropX, y, r, tier: this.current, rot: 0, pop: 0 });
    ctx.restore();
    this.gfx.glow(ctx, this.dropX, y, r * 1.6, t.color, ready ? 0.5 : 0.2);
  }

  _drawNext(ctx, W) {
    const t = TIERS[this.next];
    const r = Math.min(16, this._radius(this.next));
    const x = W - 26, y = 26;
    this.gfx.label(ctx, "NEXT", x - r - 34, y + 4, { size: 10, weight: 800, align: "right", color: "rgba(255,255,255,0.5)" });
    this._drawFruit(ctx, { x, y, r, tier: this.next, rot: 0, pop: 0 });
    void t;
  }
}

// ---------------------------------------------------------------- helpers --
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mixChannel(a, b, t) { return Math.round(a + (b - a) * t); }
function hexParts(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lighten(hex, t) {
  const [r, g, b] = hexParts(hex);
  return `rgb(${mixChannel(r, 255, t)},${mixChannel(g, 255, t)},${mixChannel(b, 255, t)})`;
}
function darken(hex, t) {
  const [r, g, b] = hexParts(hex);
  return `rgb(${mixChannel(r, 0, t)},${mixChannel(g, 0, t)},${mixChannel(b, 0, t)})`;
}

export default FruitMergeGame;
