// ==========================================================================
// ParticleSystem — lightweight reusable canvas particle engine.
// Used both for game VFX (explosions, confetti, trails) and the ambient
// animated background. Designed to stay cheap: pooled array, no allocations
// in the hot loop beyond what's required, and a hard cap on particle count.
// ==========================================================================
import { saveManager } from "./saveManager.js";

const MAX_PARTICLES = 600;

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  get enabled() { return saveManager.data.settings.particles !== false; }

  spawn(p) {
    if (!this.enabled) return;
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      x: p.x, y: p.y, vx: p.vx || 0, vy: p.vy || 0,
      life: p.life ?? 1, maxLife: p.life ?? 1,
      size: p.size || 3, color: p.color || "#7c5cff", shape: p.shape || "circle",
      gravity: p.gravity ?? 0, drag: p.drag ?? 1, rotation: p.rotation || 0, spin: p.spin || 0,
      fade: p.fade !== false,
    });
  }

  burst(x, y, { count = 18, colors = ["#7c5cff", "#22d3ee", "#ff4fd8"], speed = 220, life = 0.7, size = 4, gravity = 380, shape = "circle" } = {}) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const spd = speed * (0.5 + Math.random() * 0.6);
      this.spawn({
        x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
        life: life * (0.7 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8),
        color: colors[Math.floor(Math.random() * colors.length)], gravity, drag: 0.94, shape,
        rotation: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 10,
      });
    }
  }

  confetti(x, y, count = 24) {
    this.burst(x, y, { count, colors: ["#7c5cff", "#22d3ee", "#ff4fd8", "#ffd76a", "#2ee6a6"], speed: 260, life: 1.4, size: 6, gravity: 300, shape: "square" });
  }

  trail(x, y, color = "#22d3ee") {
    this.spawn({ x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.4, size: 3, color, gravity: 0, drag: 0.9 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rotation += p.spin * dt;
    }
  }

  render(ctx) {
    for (const p of this.particles) {
      const alpha = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === "square") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.shape === "star") {
        drawStar(ctx, p.size);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  clear() { this.particles.length = 0; }
}

function drawStar(ctx, size) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const x = Math.cos(a) * size / 2, y = Math.sin(a) * size / 2;
    ctx.lineTo(x, y);
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a2) * size / 4, Math.sin(a2) * size / 4);
  }
  ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------------------
// Ambient animated background (drifting nebula dots + shooting stars) that
// renders behind the whole app on #bg-canvas. Cheap, capped, and paused when
// the tab is hidden or reduced-motion is enabled.
// ---------------------------------------------------------------------------
export class BackgroundFX {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.stars = [];
    this.shooting = [];
    this._raf = null;
    this._last = performance.now();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause(); else this.resume();
    });
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.width = window.innerWidth * dpr;
    this.h = this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";
    this.dpr = dpr;
    const count = Math.round((window.innerWidth * window.innerHeight) / 14000);
    this.stars = [...Array(Math.min(count, 140))].map(() => ({
      x: Math.random() * this.w, y: Math.random() * this.h,
      r: (Math.random() * 1.6 + 0.4) * dpr, tw: Math.random() * Math.PI * 2,
      speed: (Math.random() * 0.15 + 0.03) * dpr,
    }));
  }

  start() {
    if (this._raf) return;
    // The ambient background only needs ~30fps — it is slow-moving decoration,
    // and halving its draw rate leaves the whole frame budget to the games.
    const FRAME = 1000 / 30;
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const elapsed = t - this._last;
      if (elapsed < FRAME) return;
      this._last = t;
      this._tick(Math.min(0.06, elapsed / 1000));
    };
    this._raf = requestAnimationFrame(loop);
  }
  pause() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }
  resume() { this._last = performance.now(); this.start(); }

  _tick(dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const reduced = saveManager.data.settings.reducedMotion;
    for (const s of this.stars) {
      s.tw += dt * (reduced ? 0.2 : 1.4);
      if (!reduced) { s.y += s.speed; if (s.y > this.h) s.y = 0; }
      const alpha = 0.35 + Math.sin(s.tw) * 0.3;
      ctx.beginPath();
      ctx.fillStyle = `rgba(200,210,255,${Math.max(0.08, alpha)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduced && Math.random() < 0.006 && this.shooting.length < 2) {
      this.shooting.push({ x: Math.random() * this.w * 0.6, y: 0, vx: 6 * this.dpr, vy: 3.4 * this.dpr, life: 1 });
    }
    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const s = this.shooting[i];
      s.x += s.vx; s.y += s.vy; s.life -= dt * 0.9;
      if (s.life <= 0 || s.y > this.h) { this.shooting.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,255,255,${s.life})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 4, s.y - s.vy * 4); ctx.stroke();
    }
  }
}

export default ParticleSystem;
