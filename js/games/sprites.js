// ==========================================================================
// Sprite kit — real drawn artwork for the things that used to be emoji.
//
// Emoji were placeholders with three problems: they render differently on
// every platform (an Apple apple and an Android apple are not the same
// picture), they cannot be lit or shaded to match the rest of a game, and at
// card size they are a blurry font glyph rather than artwork.
//
// Everything here is drawn with paths into a unit box, so one painter serves
// a 24px minesweeper flag and a 220px memory card equally well. Canvas games
// call drawSprite(); DOM boards use spriteURL(), which rasterises once at the
// size asked for and caches the data URI.
// ==========================================================================

/** Colour helpers, kept local so this module has no dependencies. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount;
  } else {
    const k = 1 + amount;
    r *= k; g *= k; b *= k;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Round body with a specular highlight — the base every fruit builds on. */
function orb(ctx, cx, cy, rx, ry, color, { shine = true } = {}) {
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, rx * 0.08, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.42));
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  if (!shine) return;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.36, cy - ry * 0.42, rx * 0.2, ry * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.fill();
}

function stem(ctx, cx, topY, len, w, color = "#6b4423") {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.quadraticCurveTo(cx + w * 0.6, topY - len * 0.6, cx + w * 0.2, topY - len);
  ctx.stroke();
}

function leaf(ctx, cx, cy, len, tilt, color = "#3ea75a") {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, shade(color, 0.25));
  g.addColorStop(1, shade(color, -0.3));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = Math.max(1, len * 0.05);
  ctx.beginPath();
  ctx.moveTo(len * 0.06, 0);
  ctx.lineTo(len * 0.92, 0);
  ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------- fruit ----
// Each painter fills a box of side `s` with its origin at (0, 0).
export const SPRITES = {
  apple(ctx, s) {
    const cx = s * 0.5, cy = s * 0.58, r = s * 0.34;
    // Two overlapping lobes give the apple its waist instead of a plain ball.
    orb(ctx, cx - r * 0.28, cy, r * 0.82, r * 0.94, "#e23246", { shine: false });
    orb(ctx, cx + r * 0.28, cy, r * 0.82, r * 0.94, "#c31f34", { shine: false });
    orb(ctx, cx, cy, r * 0.98, r * 0.98, "#e8253f");
    stem(ctx, cx, cy - r * 0.9, s * 0.16, s * 0.035);
    leaf(ctx, cx + s * 0.02, cy - r * 0.95, s * 0.2, -0.5);
  },

  banana(ctx, s) {
    ctx.save();
    ctx.translate(s * 0.5, s * 0.52);
    ctx.rotate(-0.35);
    const g = ctx.createLinearGradient(0, -s * 0.2, 0, s * 0.2);
    g.addColorStop(0, "#ffe27a");
    g.addColorStop(0.5, "#ffcf3a");
    g.addColorStop(1, "#d99b12");
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, -s * 0.1);
    ctx.quadraticCurveTo(0, s * 0.32, s * 0.34, -s * 0.12);
    ctx.quadraticCurveTo(s * 0.28, s * 0.04, s * 0.3, s * 0.06);
    ctx.quadraticCurveTo(0, s * 0.46, -s * 0.36, s * 0.02);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "#5e4415";
    ctx.beginPath(); ctx.ellipse(-s * 0.35, -s * 0.06, s * 0.035, s * 0.05, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.33, -s * 0.09, s * 0.03, s * 0.045, 0, 0, 6.3); ctx.fill();
    ctx.restore();
  },

  grapes(ctx, s) {
    const rows = [[0.5], [0.38, 0.62], [0.30, 0.5, 0.70], [0.38, 0.62], [0.5]];
    const r = s * 0.098;
    rows.forEach((row, i) => {
      const y = s * 0.32 + i * r * 1.55;
      row.forEach(fx => orb(ctx, s * fx, y, r, r, i % 2 ? "#8f4fd8" : "#a86bff"));
    });
    stem(ctx, s * 0.5, s * 0.32 - r, s * 0.13, s * 0.032, "#5c7a35");
    leaf(ctx, s * 0.52, s * 0.24, s * 0.19, -0.35);
  },

  watermelon(ctx, s) {
    // A wedge, which is what reads as watermelon at small sizes.
    const cx = s * 0.5, cy = s * 0.76, R = s * 0.47;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.arc(cx, cy, R, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = "#2f8f4a";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.88, cy);
    ctx.arc(cx, cy, R * 0.88, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = "#eafbe6";
    ctx.fill();
    const g = ctx.createLinearGradient(0, cy - R, 0, cy);
    g.addColorStop(0, "#ff5c6e");
    g.addColorStop(1, "#e01f3c");
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.78, cy);
    ctx.arc(cx, cy, R * 0.78, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "#22160f";
    for (const [dx, dy] of [[-0.42, -0.26], [0, -0.42], [0.42, -0.26], [-0.2, -0.12], [0.2, -0.12]]) {
      ctx.beginPath();
      ctx.ellipse(cx + R * dx, cy + R * dy, R * 0.055, R * 0.085, dx * 0.6, 0, 6.3);
      ctx.fill();
    }
  },

  strawberry(ctx, s) {
    const cx = s * 0.5, cy = s * 0.56, r = s * 0.33;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 1.2);
    g.addColorStop(0, "#ff7d8f");
    g.addColorStop(0.5, "#ee2f4c");
    g.addColorStop(1, "#a4132a");
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 1.25);
    ctx.bezierCurveTo(cx - r * 1.15, cy + r * 0.3, cx - r * 0.95, cy - r * 0.85, cx, cy - r * 0.8);
    ctx.bezierCurveTo(cx + r * 0.95, cy - r * 0.85, cx + r * 1.15, cy + r * 0.3, cx, cy + r * 1.25);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = "#ffe9a8";
    for (let i = 0; i < 14; i++) {
      const a = i * 2.399;
      const rr = r * 0.72 * Math.sqrt((i + 0.5) / 14);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.05, r * 0.05, r * 0.075, a, 0, 6.3);
      ctx.fill();
    }
    for (let i = -2; i <= 2; i++) leaf(ctx, cx, cy - r * 0.78, r * 0.62, Math.PI + i * 0.42, "#39a854");
  },

  lemon(ctx, s) {
    ctx.save();
    ctx.translate(s * 0.5, s * 0.54);
    ctx.rotate(-0.28);
    orb(ctx, 0, 0, s * 0.36, s * 0.25, "#ffd93b");
    ctx.fillStyle = "#e0aa14";
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(dx * s * 0.35, 0, s * 0.035, s * 0.03, 0, 0, 6.3);
      ctx.fill();
    }
    ctx.restore();
  },

  cherry(ctx, s) {
    ctx.strokeStyle = "#4e7a2e";
    ctx.lineWidth = s * 0.035;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.18);
    ctx.quadraticCurveTo(s * 0.34, s * 0.4, s * 0.35, s * 0.6);
    ctx.moveTo(s * 0.5, s * 0.18);
    ctx.quadraticCurveTo(s * 0.68, s * 0.42, s * 0.67, s * 0.62);
    ctx.stroke();
    orb(ctx, s * 0.35, s * 0.7, s * 0.17, s * 0.17, "#e01f3c");
    orb(ctx, s * 0.67, s * 0.72, s * 0.16, s * 0.16, "#c4142f");
    leaf(ctx, s * 0.52, s * 0.19, s * 0.2, -0.7);
  },

  kiwi(ctx, s) {
    const cx = s * 0.5, cy = s * 0.52, r = s * 0.36;
    orb(ctx, cx, cy, r, r, "#7a5a2e", { shine: false });
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, 6.3);
    ctx.fillStyle = "#8fce4a"; ctx.fill();
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.9);
    g.addColorStop(0, "#f3ffd9");
    g.addColorStop(0.35, "#e8f7c0");
    g.addColorStop(1, "#7fc23c");
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, 0, 6.3);
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "#f6ffe6";
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#2b2b1c";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = r * (0.42 + (i % 2) * 0.16);
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, r * 0.045, r * 0.07, a, 0, 6.3);
      ctx.fill();
    }
  },

  peach(ctx, s) {
    const cx = s * 0.5, cy = s * 0.58, r = s * 0.34;
    orb(ctx, cx, cy, r, r * 1.02, "#ff9c76");
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.clip();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "rgba(255,80,90,0)");
    g.addColorStop(1, "rgba(226,50,70,0.55)");
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeStyle = "rgba(150,40,40,0.35)";
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx - r * 0.25, cy, cx, cy + r);
    ctx.stroke();
    ctx.restore();
    leaf(ctx, cx + s * 0.01, cy - r * 0.98, s * 0.19, -0.55);
  },

  pineapple(ctx, s) {
    const cx = s * 0.5, cy = s * 0.63, rx = s * 0.26, ry = s * 0.31;
    for (let i = -2; i <= 2; i++) {
      leaf(ctx, cx, cy - ry * 0.95, s * 0.24, -Math.PI / 2 + i * 0.42, "#3fa84f");
    }
    orb(ctx, cx, cy, rx, ry, "#f0b32c", { shine: false });
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.3); ctx.clip();
    ctx.strokeStyle = "rgba(120,72,10,0.5)";
    ctx.lineWidth = Math.max(1, s * 0.014);
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - rx * 1.4, cy + i * ry * 0.26 - rx * 1.4 * 0.55);
      ctx.lineTo(cx + rx * 1.4, cy + i * ry * 0.26 + rx * 1.4 * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - rx * 1.4, cy + i * ry * 0.26 + rx * 1.4 * 0.55);
      ctx.lineTo(cx + rx * 1.4, cy + i * ry * 0.26 - rx * 1.4 * 0.55);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.35, cy - ry * 0.4, rx * 0.18, ry * 0.13, -0.5, 0, 6.3);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();
  },

  orange(ctx, s) {
    const cx = s * 0.5, cy = s * 0.56, r = s * 0.34;
    orb(ctx, cx, cy, r, r, "#ff9f2f");
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.clip();
    ctx.fillStyle = "rgba(190,90,10,0.22)";
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.3, rr = Math.sqrt(Math.random()) * r * 0.92;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, r * 0.035, 0, 6.3);
      ctx.fill();
    }
    ctx.restore();
    stem(ctx, cx, cy - r * 0.92, s * 0.09, s * 0.03, "#5c7a35");
    leaf(ctx, cx + s * 0.01, cy - r * 0.95, s * 0.17, -0.6);
  },

  avocado(ctx, s) {
    const cx = s * 0.5, cy = s * 0.55, rx = s * 0.26, ry = s * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.bezierCurveTo(cx + rx * 0.7, cy - ry * 0.75, cx + rx, cy + ry * 0.35, cx, cy + ry);
    ctx.bezierCurveTo(cx - rx, cy + ry * 0.35, cx - rx * 0.7, cy - ry * 0.75, cx, cy - ry);
    ctx.fillStyle = "#3f6b2c";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.86);
    ctx.bezierCurveTo(cx + rx * 0.58, cy - ry * 0.62, cx + rx * 0.84, cy + ry * 0.3, cx, cy + ry * 0.86);
    ctx.bezierCurveTo(cx - rx * 0.84, cy + ry * 0.3, cx - rx * 0.58, cy - ry * 0.62, cx, cy - ry * 0.86);
    ctx.fillStyle = "#c9dd7a";
    ctx.fill();
    ctx.restore();
    orb(ctx, cx, cy + ry * 0.22, rx * 0.42, rx * 0.42, "#8b5a2b");
  },

  // ------------------------------------------------------ characters ------
  mole(ctx, s) {
    const cx = s * 0.5, cy = s * 0.58;
    // Body
    orb(ctx, cx, cy + s * 0.16, s * 0.32, s * 0.26, "#6b4a35", { shine: false });
    // Head
    orb(ctx, cx, cy - s * 0.06, s * 0.29, s * 0.26, "#7d573d", { shine: false });
    // Ears
    for (const dx of [-1, 1]) orb(ctx, cx + dx * s * 0.24, cy - s * 0.2, s * 0.07, s * 0.07, "#5b3d2b", { shine: false });
    // Muzzle
    orb(ctx, cx, cy + s * 0.06, s * 0.17, s * 0.12, "#d9b79a", { shine: false });
    // Nose
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.005, s * 0.055, s * 0.042, 0, 0, 6.3);
    ctx.fillStyle = "#ff8fa4"; ctx.fill();
    // Eyes with a highlight, which is what makes it read as a character
    for (const dx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * s * 0.11, cy - s * 0.11, s * 0.045, s * 0.05, 0, 0, 6.3);
      ctx.fillStyle = "#17110d"; ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + dx * s * 0.115 + s * 0.015, cy - s * 0.125, s * 0.016, 0, 6.3);
      ctx.fillStyle = "#fff"; ctx.fill();
    }
    // Teeth
    ctx.fillStyle = "#fffdf5";
    ctx.fillRect(cx - s * 0.045, cy + s * 0.045, s * 0.038, s * 0.055);
    ctx.fillRect(cx + s * 0.008, cy + s * 0.045, s * 0.038, s * 0.055);
    // Whiskers
    ctx.strokeStyle = "rgba(30,20,14,0.5)";
    ctx.lineWidth = Math.max(1, s * 0.012);
    for (const dx of [-1, 1]) {
      for (const dy of [-0.02, 0.02]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * s * 0.07, cy + s * (0.03 + dy));
        ctx.lineTo(cx + dx * s * 0.26, cy + s * (0.01 + dy * 2.2));
        ctx.stroke();
      }
    }
    // Paws
    for (const dx of [-1, 1]) orb(ctx, cx + dx * s * 0.24, cy + s * 0.3, s * 0.085, s * 0.07, "#5b3d2b", { shine: false });
  },

  bomb(ctx, s) {
    const cx = s * 0.5, cy = s * 0.6, r = s * 0.3;
    orb(ctx, cx, cy, r, r, "#2b2f45");
    ctx.fillStyle = "#1a1d2c";
    ctx.fillRect(cx - r * 0.22, cy - r * 1.18, r * 0.44, r * 0.3);
    ctx.strokeStyle = "#c98a2e";
    ctx.lineWidth = Math.max(1.5, s * 0.026);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.18);
    ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 1.6, cx + r * 0.35, cy - r * 1.85);
    ctx.stroke();
    // Lit spark at the fuse tip
    const g = ctx.createRadialGradient(cx + r * 0.35, cy - r * 1.9, 0, cx + r * 0.35, cy - r * 1.9, r * 0.3);
    g.addColorStop(0, "#fff6c9");
    g.addColorStop(0.4, "#ffb43a");
    g.addColorStop(1, "rgba(255,70,40,0)");
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy - r * 1.9, r * 0.3, 0, 6.3);
    ctx.fillStyle = g; ctx.fill();
  },

  flag(ctx, s) {
    ctx.strokeStyle = "#8c94b4";
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(s * 0.36, s * 0.2);
    ctx.lineTo(s * 0.36, s * 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.84);
    ctx.lineTo(s * 0.6, s * 0.84);
    ctx.stroke();
    const g = ctx.createLinearGradient(s * 0.36, 0, s * 0.82, 0);
    g.addColorStop(0, "#ff6b86");
    g.addColorStop(1, "#d61f3c");
    ctx.beginPath();
    ctx.moveTo(s * 0.38, s * 0.18);
    ctx.lineTo(s * 0.82, s * 0.33);
    ctx.lineTo(s * 0.38, s * 0.5);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  },

  heart(ctx, s) {
    const cx = s * 0.5, cy = s * 0.42, r = s * 0.27;
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r * 2);
    g.addColorStop(0, "#ff8095");
    g.addColorStop(0.55, "#ec2743");
    g.addColorStop(1, "#a5122b");
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 1.75);
    ctx.bezierCurveTo(cx - r * 1.7, cy + r * 0.35, cx - r * 0.92, cy - r * 0.95, cx, cy - r * 0.1);
    ctx.bezierCurveTo(cx + r * 0.92, cy - r * 0.95, cx + r * 1.7, cy + r * 0.35, cx, cy + r * 1.75);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.5, cy + r * 0.05, r * 0.24, r * 0.16, -0.6, 0, 6.3);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
  },

  /** The face-down side of a memory card. */
  cardBack(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, "#7c5cff");
    g.addColorStop(1, "#22d3ee");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, s * 0.02);
    for (let i = -4; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s * 0.18, 0);
      ctx.lineTo(i * s * 0.18 + s, s);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.19, 0, 6.3);
    ctx.fillStyle = "rgba(6,10,26,0.5)";
    ctx.fill();
  },
};

export const FRUIT_NAMES = [
  "apple", "banana", "grapes", "watermelon", "strawberry", "lemon",
  "cherry", "kiwi", "peach", "pineapple", "orange", "avocado",
];

/** Draws a sprite into a canvas context, filling a `size` box at (x, y). */
export function drawSprite(ctx, name, x, y, size) {
  const painter = SPRITES[name];
  if (!painter) return false;
  ctx.save();
  ctx.translate(x, y);
  painter(ctx, size);
  ctx.restore();
  return true;
}

/** Draws centred on (cx, cy) — what a physics body actually wants. */
export function drawSpriteCentered(ctx, name, cx, cy, size, rotation = 0) {
  const painter = SPRITES[name];
  if (!painter) return false;
  ctx.save();
  ctx.translate(cx, cy);
  if (rotation) ctx.rotate(rotation);
  ctx.translate(-size / 2, -size / 2);
  painter(ctx, size);
  ctx.restore();
  return true;
}

// Rasterised once per (name, size) — DOM boards set these as background
// images and would otherwise redraw on every style recalculation.
const urlCache = new Map();

/** A PNG data URI of one sprite, for use in CSS or an <img>. */
export function spriteURL(name, size = 128) {
  const key = `${name}@${size}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const painter = SPRITES[name];
  if (!painter) return "";
  const c = document.createElement("canvas");
  // Rasterise at 2x so the sprite stays crisp on a retina board.
  c.width = c.height = size * 2;
  const ctx = c.getContext("2d");
  ctx.scale(2, 2);
  painter(ctx, size);
  const url = c.toDataURL("image/png");
  urlCache.set(key, url);
  return url;
}

/** An <img> element for a sprite, ready to drop into a DOM board. */
export function spriteImg(name, size = 96, alt = name) {
  const img = document.createElement("img");
  img.src = spriteURL(name, size);
  img.alt = alt;
  img.className = "sprite";
  img.draggable = false;
  return img;
}

export default SPRITES;
