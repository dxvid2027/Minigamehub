// ==========================================================================
// Colour parsing shared by the 2D graphics kit and the 3D renderer.
//
// Games express colours in whatever form suits them — hex, rgb() or hsl()
// (procedural palettes are far easier to write in HSL) — so every renderer
// funnels through this one parser instead of assuming a format.
// ==========================================================================

/** @returns {{r:number,g:number,b:number}} channels in 0-255 */
export function parseColor(input) {
  if (typeof input !== "string") return { r: 255, g: 255, b: 255 };
  const c = input.trim();

  if (c[0] === "#") {
    const h = c.slice(1);
    const full = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
    return {
      r: parseInt(full.slice(0, 2), 16) || 0,
      g: parseInt(full.slice(2, 4), 16) || 0,
      b: parseInt(full.slice(4, 6), 16) || 0,
    };
  }

  const rgbMatch = c.match(/^rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1].split(/[,\s/]+/).map(Number);
    return { r: r || 0, g: g || 0, b: b || 0 };
  }

  const hslMatch = c.match(/^hsla?\(([^)]+)\)/i);
  if (hslMatch) {
    const parts = hslMatch[1].split(/[,\s/]+/);
    const h = ((parseFloat(parts[0]) % 360) + 360) % 360 / 360;
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    if (!s) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return {
      r: Math.round(hue(h + 1 / 3) * 255),
      g: Math.round(hue(h) * 255),
      b: Math.round(hue(h - 1 / 3) * 255),
    };
  }

  return { r: 255, g: 255, b: 255 };
}

/** Channels normalised to 0-1, the form WebGL uniforms want. */
export function toUnit(color) {
  const { r, g, b } = parseColor(color);
  return [r / 255, g / 255, b / 255];
}

export function rgba(color, alpha) {
  const { r, g, b } = parseColor(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Lightens (amount > 0) or darkens (amount < 0) by a fraction of full range. */
export function shade(color, amount) {
  const { r, g, b } = parseColor(color);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export default parseColor;
