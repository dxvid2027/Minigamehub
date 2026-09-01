// ==========================================================================
// GameGfx — the in-game rendering kit.
//
// Every canvas game paints through this instead of flat-filling a colour, so
// all 30 games share one lighting model: a tinted radial key light, a scene
// layer (grid / stars / aurora), a vignette and a grain pass. The expensive
// layers are rendered once into an offscreen canvas and blitted per frame,
// so the whole treatment costs ~1 drawImage call at 60 fps.
// ==========================================================================
import { saveManager } from "../systems/saveManager.js";
import { roundRect } from "./canvasUtils.js";
import { rgba, shade } from "./color.js";

export { rgba, shade };

const GRAIN_TILE = 128;
let grainCanvas = null;

function grain() {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement("canvas");
  c.width = c.height = GRAIN_TILE;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 26;
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

export class GameGfx {
  /**
   * @param {Object} meta   registry entry (supplies the game's palette)
   * @param {string} scene  "grid" | "stars" | "aurora" | "plain"
   */
  constructor(meta, scene = "aurora") {
    this.meta = meta;
    this.scene = scene;
    this.c1 = meta?.grad?.[0] || "#7c5cff";
    this.c2 = meta?.grad?.[1] || "#22d3ee";
    this._backdrop = null;
    this._key = "";
    this._t = 0;
    this._caches = new Map();
    // "high" draws glows and grain; "low" is set automatically by GameBase's
    // frame monitor when a device can't hold the frame budget.
    this.quality = "high";
  }

  setQuality(q) {
    if (this.quality === q) return;
    this.quality = q;
    this._caches = new Map();
    this._backdrop = null;
    this._key = "";
  }

  setScene(scene) { this.scene = scene; this._backdrop = null; }

  get textured() { return this.quality !== "low" && saveManager.data.settings.particles !== false; }

  /** Paints the full backdrop for this frame. Call first in onRender. */
  backdrop(ctx, dt = 0) {
    const canvas = ctx.canvas;
    const w = canvas.width, h = canvas.height;
    this._t += dt;
    const key = `${w}x${h}:${this.scene}:${this.textured}`;
    if (key !== this._key) { this._key = key; this._backdrop = this._render(w, h); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this._backdrop, 0, 0);
  }

  _render(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const s = Math.min(w, h);

    // Ground: near-black with a hint of the game's cool/warm bias.
    const ground = ctx.createLinearGradient(0, 0, 0, h);
    ground.addColorStop(0, "#080a14");
    ground.addColorStop(1, "#04050b");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);

    // Key light — a soft tinted glow anchored to the top of the field.
    const key = ctx.createRadialGradient(w * 0.5, h * 0.06, 0, w * 0.5, h * 0.06, s * 1.25);
    key.addColorStop(0, rgba(this.c1, 0.3));
    key.addColorStop(0.45, rgba(this.c1, 0.08));
    key.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, w, h);

    // Cool bounce light from the bottom corner for depth.
    const bounce = ctx.createRadialGradient(w * 0.92, h, 0, w * 0.92, h, s * 0.95);
    bounce.addColorStop(0, rgba(this.c2, 0.16));
    bounce.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bounce;
    ctx.fillRect(0, 0, w, h);

    if (this.scene === "grid") this._grid(ctx, w, h);
    else if (this.scene === "stars") this._stars(ctx, w, h);
    else if (this.scene === "aurora") this._aurora(ctx, w, h);

    // Vignette keeps the eye on the playfield.
    const vig = ctx.createRadialGradient(w / 2, h * 0.45, s * 0.25, w / 2, h * 0.5, s * 0.95);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    if (this.textured) {
      const tile = grain();
      const pattern = ctx.createPattern(tile, "repeat");
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Inner rim so the playfield reads as an inset panel.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    return c;
  }

  _grid(ctx, w, h) {
    const step = Math.max(26, Math.round(Math.min(w, h) / 14));
    ctx.strokeStyle = rgba(this.c2, 0.09);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step; x < w; x += step) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); }
    for (let y = step; y < h; y += step) { ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); }
    ctx.stroke();
    // Brighter horizon band
    const band = ctx.createLinearGradient(0, h * 0.42, 0, h * 0.62);
    band.addColorStop(0, "rgba(0,0,0,0)");
    band.addColorStop(0.5, rgba(this.c1, 0.1));
    band.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, h * 0.42, w, h * 0.2);
  }

  _stars(ctx, w, h) {
    const count = Math.round((w * h) / 9000);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = Math.random() * 1.6 + 0.3;
      ctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.5 + 0.12).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // A couple of nebula blooms
    for (const [cx, cy, col, rad] of [[w * 0.22, h * 0.3, this.c1, 0.5], [w * 0.78, h * 0.68, this.c2, 0.42]]) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * rad);
      g.addColorStop(0, rgba(col, 0.14));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  _aurora(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 3; i++) {
      const col = i % 2 ? this.c2 : this.c1;
      const y = h * (0.25 + i * 0.24);
      const g = ctx.createLinearGradient(0, y - h * 0.2, 0, y + h * 0.2);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, rgba(col, 0.09));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += w / 8) {
        ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 + i) * h * 0.06);
      }
      ctx.lineTo(w, y + h * 0.25); ctx.lineTo(0, y + h * 0.25);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ PRIMITIVES --
  //
  // Canvas shadows and freshly-built gradients are by far the most expensive
  // things a 2D game can do per frame, so both are avoided in the hot path:
  // gradients are cached and painted in translated user space, and glows are
  // pre-rendered sprites blitted additively. `quality` drops the extras
  // automatically on devices that can't keep up (see GameBase's frame monitor).

  _cache(key, build) {
    if (!this._caches) this._caches = new Map();
    let entry = this._caches.get(key);
    if (!entry) { entry = build(); this._caches.set(key, entry); }
    return entry;
  }

  /** Vertical body gradient, cached per colour+height and drawn at the origin. */
  _bodyGrad(ctx, color, h) {
    return this._cache(`b|${color}|${Math.round(h)}`, () => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, shade(color, 0.14));
      g.addColorStop(0.55, color);
      g.addColorStop(1, shade(color, -0.16));
      return g;
    });
  }

  _sphereGrad(ctx, color, r) {
    return this._cache(`s|${color}|${Math.round(r)}`, () => {
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      g.addColorStop(0, shade(color, 0.35));
      g.addColorStop(0.55, color);
      g.addColorStop(1, shade(color, -0.28));
      return g;
    });
  }

  /** Pre-rendered radial glow, blitted with "lighter" instead of shadowBlur. */
  _glowSprite(color) {
    return this._cache(`g|${color}`, () => {
      const size = 64;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g2 = c.getContext("2d");
      const grad = g2.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, rgba(color, 0.85));
      grad.addColorStop(0.4, rgba(color, 0.28));
      grad.addColorStop(1, rgba(color, 0));
      g2.fillStyle = grad;
      g2.fillRect(0, 0, size, size);
      return c;
    });
  }

  glow(ctx, x, y, radius, color, strength = 1) {
    if (this.quality === "low" || strength <= 0) return;
    const sprite = this._glowSprite(color);
    const d = radius * 4;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, strength);
    ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
    ctx.restore();
  }

  /** Rounded rect with a top-lit gradient body, inner highlight and glow. */
  block(ctx, x, y, w, h, r, color, { glow = 0.35, highlight = true } = {}) {
    if (glow && this.quality !== "low") {
      this.glow(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.4, color, glow * 0.5);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = this._bodyGrad(ctx, color, h);
    roundRect(ctx, 0, 0, w, h, r); ctx.fill();
    if (highlight && h > 8) {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      roundRect(ctx, r * 0.6, 1.5, w - r * 1.2, Math.max(1.5, h * 0.16), r * 0.5); ctx.fill();
    }
    ctx.restore();
  }

  /** Sphere-shaded circle — used for balls, pucks, orbs and bubbles. */
  orb(ctx, x, y, radius, color, { glow = 0.6 } = {}) {
    if (glow) this.glow(ctx, x, y, radius, color, glow * 0.7);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = this._sphereGrad(ctx, color, radius);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    if (this.quality !== "low") {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.ellipse(-radius * 0.32, -radius * 0.38, radius * 0.3, radius * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** Glowing stroke, for lasers, trails, lane markings and outlines. */
  neonLine(ctx, x1, y1, x2, y2, color, width = 2, glowStrength = 0.8) {
    if (glowStrength && this.quality !== "low") {
      // A short additive bloom at each end reads as a glow along the stroke.
      this.glow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, Math.max(width * 2, Math.hypot(x2 - x1, y2 - y1) * 0.12), color, glowStrength * 0.35);
    }
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.9);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  /** Centred display text with a soft shadow — used for in-canvas prompts. */
  label(ctx, text, x, y, { size = 14, color = "rgba(255,255,255,0.75)", weight = 600, align = "center" } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

export default GameGfx;
