// ==========================================================================
// Chess art — the piece sets, materials, colours and boards a player can mix
// into their own design. Every piece is a small inline SVG drawn from simple
// shapes, so a design is just data: a shape family, a material and two army
// colours, plus a board.
// ==========================================================================

// --- Colour helpers --------------------------------------------------------
function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function toHex([r, g, b]) { return "#" + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join(""); }
export function lighten(hex, t) { return toHex(rgb(hex).map(c => c + (255 - c) * t)); }
export function darken(hex, t) { return toHex(rgb(hex).map(c => c * (1 - t))); }
export function luma(hex) { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

// --- Shapes ----------------------------------------------------------------
// 100×100 boxes, standing on y≈90. `body` is filled, `lines` are detail
// strokes drawn on top in the outline colour.
const STAUNTON_BASE = "M24 90h52v-6c0-4-3-7-7-7H31c-4 0-7 3-7 7z";
const MODERN_BASE = "M28 90h44v-9a3 3 0 0 0-3-3H31a3 3 0 0 0-3 3z";

export const SHAPES = {
  staunton: {
    name: "Staunton",
    p: { body: [STAUNTON_BASE, "M34 77c2-11 6-18 11-21h10c5 3 9 10 11 21z", "M37 56h26v-6H37z", "M50 23a13 13 0 1 1 0 26a13 13 0 1 1 0-26z"], lines: [] },
    r: { body: [STAUNTON_BASE, "M31 77l3-33h32l3 33z", "M28 44V24h9v7h7v-7h12v7h7v-7h9v20z"], lines: ["M33 52h34", "M32 70h36"] },
    n: { body: [STAUNTON_BASE, "M31 77c-1-12 5-19 13-26c-6 3-13 6-17 3c-4-3-2-8 3-12c8-6 12-14 15-22l4-8l5 8c15 4 24 18 22 37c-1 8-4 14-5 20z"], lines: ["M58 22c4 2 7 6 8 10"], eye: [47, 33, 2.6] },
    b: { body: [STAUNTON_BASE, "M33 77c0-13 6-21 10-25h14c4 4 10 12 10 25z", "M50 15c-12 8-17 21-14 33h28c3-12-2-25-14-33z", "M50 4a5 5 0 1 1 0 10a5 5 0 1 1 0-10z"], lines: ["M53 23l-8 14", "M38 52h24"] },
    q: { body: [STAUNTON_BASE, "M31 77L23 33l13 14l6-24l8 22l8-22l6 24l13-14l-8 44z", "M23 26a5 5 0 1 1 0 10a5 5 0 1 1 0-10z", "M42 17a5 5 0 1 1 0 10a5 5 0 1 1 0-10z", "M58 17a5 5 0 1 1 0 10a5 5 0 1 1 0-10z", "M77 26a5 5 0 1 1 0 10a5 5 0 1 1 0-10z"], lines: ["M31 64h38"] },
    k: { body: [STAUNTON_BASE, "M32 77c0-15 4-25 8-33h20c4 8 8 18 8 33z", "M36 44h28v-8H36z", "M46 6h8v8h8v8h-8v12h-8V22h-8v-8h8z"], lines: ["M34 64h32"] },
  },
  modern: {
    name: "Modern",
    p: { body: [MODERN_BASE, "M38 78l5-24h14l5 24z", "M50 24a14 14 0 1 1 0 28a14 14 0 1 1 0-28z"], lines: [] },
    r: { body: [MODERN_BASE, "M34 78V42h32v36z", "M28 42V20h10v9h6v-9h12v9h6v-9h10v22z"], lines: [] },
    n: { body: [MODERN_BASE, "M33 78V58l17-15l-15 3l-3-11l20-21h10l9 24l-5 40z"], lines: [], eye: [55, 26, 2.6] },
    b: { body: [MODERN_BASE, "M50 16l16 35l-9 27H43l-9-27z", "M50 4a6 6 0 1 1 0 12a6 6 0 1 1 0-12z"], lines: ["M56 30L45 48"] },
    q: { body: [MODERN_BASE, "M34 78l-7-46l14 17l9-25l9 25l14-17l-7 46z", "M50 10a6 6 0 1 1 0 12a6 6 0 1 1 0-12z"], lines: [] },
    k: { body: [MODERN_BASE, "M36 78l-4-40h36l-4 40z", "M46 6h8v9h9v8h-9v13h-8V23h-9v-8h9z"], lines: ["M34 50h32"] },
  },
  royal: {
    name: "Royal",
    p: { body: [STAUNTON_BASE, "M36 77l6-20h16l6 20z", "M40 57h20l-3-6H43z", "M50 26c8 0 13 6 13 13s-5 13-13 13s-13-6-13-13s5-13 13-13z"], lines: ["M44 36l6-4l6 4"] },
    r: { body: [STAUNTON_BASE, "M30 77l4-30h32l4 30z", "M27 47l2-24h10v6h6v-8h10v8h6v-6h10l2 24z"], lines: ["M36 60h28", "M50 47v30"] },
    n: { body: [STAUNTON_BASE, "M30 77c0-10 4-17 11-23l-11 1c-5 0-6-6-2-10l14-12c2-9 7-16 13-20l2 7c13 2 24 15 22 35c-1 9-5 16-6 22z"], lines: ["M56 16c6 6 13 10 18 21", "M50 25c5 5 9 9 13 16"], eye: [48, 32, 2.8] },
    b: { body: [STAUNTON_BASE, "M34 77l6-24h20l6 24z", "M50 12c-10 6-15 18-13 30l3 11h20l3-11c2-12-3-24-13-30z", "M50 2l5 6l-5 6l-5-6z"], lines: ["M44 30h12", "M50 24v12"] },
    q: { body: [STAUNTON_BASE, "M32 77l-6-36h48l-6 36z", "M26 41l4-18l8 10l6-16l6 12l6-12l6 16l8-10l4 18z", "M50 1l4 5l-4 5l-4-5z"], lines: ["M34 56h32", "M38 66h24"] },
    k: { body: [STAUNTON_BASE, "M32 77l-4-34h44l-4 34z", "M28 43l3-14h38l3 14z", "M47 4h6v7h7v6h-7v12h-6V17h-7v-6h7z"], lines: ["M36 58h28", "M50 50v20"] },
  },
};
export const GLYPHS = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
// U+FE0E asks for the text form: without it phones draw the pawn as a black
// emoji that ignores the army colour.
const VS15 = "\uFE0E";
const GLYPH_FONT = "'DejaVu Sans','Segoe UI Symbol','Noto Sans Symbols 2','Noto Sans Symbols','Arial Unicode MS',serif";

// --- Materials -------------------------------------------------------------
export const MATERIALS = {
  classic: { name: "Classic" },
  glass:   { name: "Glass" },
  neon:    { name: "Neon" },
  flat:    { name: "Flat" },
  metal:   { name: "Metal" },
  marble:  { name: "Marble" },
  lava:    { name: "Lava", rank: "Silver" },
  ice:     { name: "Ice", rank: "Platinum" },
  aurora:  { name: "Aurora", rank: "Diamond" },
  galaxy:  { name: "Galaxy", rank: "Master" },
};

export const PALETTE = [
  "#f4f1ea", "#2a2d3e", "#ffd76a", "#c0c6d4", "#e0405a", "#3a6ad8",
  "#2ea86a", "#9a5ae8", "#ff6ac8", "#22d3ee", "#ff9f43", "#5a3a22",
];

export const BOARDS = [
  { id: "indigo",   name: "Indigo",   light: "#cfd6ee", dark: "#3b4470" },
  { id: "wood",     name: "Walnut",   light: "#ecd1a4", dark: "#9a6234" },
  { id: "marble",   name: "Marble",   light: "#eeece6", dark: "#8d929b" },
  { id: "emerald",  name: "Emerald",  light: "#e6f0d8", dark: "#3f7a52" },
  { id: "ocean",    name: "Ocean",    light: "#cbe8f2", dark: "#2b6b8f" },
  { id: "candy",    name: "Candy",    light: "#ffe0ef", dark: "#d0609a" },
  { id: "midnight", name: "Midnight", light: "#2f3556", dark: "#151830" },
  { id: "royal",    name: "Royal",    light: "#f3dd8a", dark: "#6a2a5a", rank: "Gold" },
  { id: "glacier",  name: "Glacier",  light: "#eaf8ff", dark: "#5a9ac8", rank: "Platinum" },
  { id: "inferno",  name: "Inferno",  light: "#ffb070", dark: "#5a1410", rank: "Diamond" },
  { id: "galaxy",   name: "Galaxy",   light: "#4a3a8a", dark: "#120a2e", rank: "Master" },
  { id: "champion", name: "Champion", light: "#ffe9a0", dark: "#1a1a1a", rank: "Grandmaster" },
];

export const DEFAULT_DESIGN = {
  shape: "staunton", material: "classic", white: "#f4f1ea", black: "#2a2d3e",
  board: "indigo", customLight: "#d8e0f0", customDark: "#4a5070", coords: true, hints: true,
};

/** Fill, stroke, gradient defs and CSS filter for one army in one material. */
function look(color, material, uid) {
  const light = luma(color) > 0.5;
  const outline = light ? darken(color, 0.7) : lighten(color, 0.55);
  const id = `cg-${uid}`;
  const lg = (stops, x2 = 1, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
  switch (material) {
    case "glass": return { defs: lg([[0, lighten(color, 0.5), 0.6], [1, color, 0.85]]), fill: `url(#${id})`, stroke: lighten(color, 0.7), sw: 2, shine: true, filter: `drop-shadow(0 0 3px ${color}88) drop-shadow(0 3px 3px #0006)` };
    case "neon": return { defs: "", fill: darken(color, 0.85), stroke: luma(color) < 0.3 ? lighten(color, 0.6) : lighten(color, 0.15), sw: 3.5, filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 7px ${color}aa)` };
    case "flat": return { defs: "", fill: color, stroke: light ? "#00000055" : "#ffffff55", sw: 1.5, filter: "drop-shadow(0 2px 0 #0004)" };
    case "metal": return { defs: lg([[0, lighten(color, 0.6)], [0.35, color], [0.55, darken(color, 0.4)], [0.75, lighten(color, 0.3)], [1, darken(color, 0.25)]], 1, 0), fill: `url(#${id})`, stroke: darken(color, 0.65), sw: 2.5, filter: "drop-shadow(0 3px 3px #0008)" };
    case "marble": return { defs: `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(color, 0.3)}"/><stop offset=".45" stop-color="${color}"/><stop offset=".5" stop-color="${light ? darken(color, 0.25) : lighten(color, 0.35)}"/><stop offset=".55" stop-color="${color}"/><stop offset="1" stop-color="${darken(color, 0.15)}"/></linearGradient>`, fill: `url(#${id})`, stroke: outline, sw: 2.5, veins: light ? darken(color, 0.3) : lighten(color, 0.4), filter: "drop-shadow(0 3px 3px #0007)" };
    case "lava": return { defs: lg([[0, "#ffd070"], [0.35, "#ff6a2a"], [1, darken(color, 0.55)]], 0.3, 1), fill: `url(#${id})`, stroke: luma(color) > 0.5 ? "#7a1a08" : "#ffb060", sw: 2.5, cracks: "#ffe08a", filter: "drop-shadow(0 0 4px #ff6a2acc) drop-shadow(0 3px 3px #0008)" };
    case "ice": return { defs: lg([[0, "#ffffff", 0.95], [0.5, lighten(color, 0.55), 0.8], [1, color, 0.85]]), fill: `url(#${id})`, stroke: luma(color) > 0.5 ? "#4a8ab0" : "#e8fbff", sw: 2.2, shine: true, filter: "drop-shadow(0 0 4px #9ae8ffaa) drop-shadow(0 3px 3px #0007)" };
    case "galaxy": return { defs: lg([[0, "#2a1060"], [0.5, color], [1, "#05030f"]]), fill: `url(#${id})`, stroke: "#c8b8ff", sw: 2.5, stars: true, filter: "drop-shadow(0 0 5px #9a7affaa) drop-shadow(0 3px 3px #0008)" };
    case "aurora": return { defs: lg([[0, color], [0.5, "#7cf0ff"], [1, "#c08bff"]]), fill: `url(#${id})`, stroke: "#ffffffcc", sw: 2.5, filter: `drop-shadow(0 0 5px #7cf0ffaa) drop-shadow(0 3px 3px #0007)` };
    default: return { defs: lg([[0, lighten(color, 0.35)], [1, darken(color, 0.12)]]), fill: `url(#${id})`, stroke: outline, sw: 3, filter: "drop-shadow(0 3px 3px #0007)" };
  }
}

/** One piece as an SVG string. `side` is "w" or "b". */
export function pieceSVG(type, side, design = DEFAULT_DESIGN, uidPrefix = "b") {
  const color = side === "w" ? design.white : design.black;
  if (design.shape === "glyph") {
    const L = look(color, design.material, `${uidPrefix}${side}`);
    return `<svg viewBox="0 0 100 100" class="cp-svg" style="filter:${L.filter}"><text x="50" y="84" text-anchor="middle" font-size="86" font-family="${GLYPH_FONT}" fill="${L.fill.startsWith("url") ? color : L.fill}" stroke="${L.stroke}" stroke-width="2" paint-order="stroke" style="font-variant-emoji:text">${GLYPHS[type]}${VS15}</text></svg>`;
  }
  const set = SHAPES[design.shape] || SHAPES.staunton;
  const sh = set[type];
  const L = look(color, design.material, `${uidPrefix}${side}`);
  const body = sh.body.map(d => `<path d="${d}"/>`).join("");
  const lines = sh.lines.map(d => `<path d="${d}" fill="none" stroke="${L.stroke}" stroke-width="${Math.max(1.6, L.sw * 0.8)}" stroke-linecap="round"/>`).join("");
  const eye = sh.eye ? `<circle cx="${sh.eye[0]}" cy="${sh.eye[1]}" r="${sh.eye[2]}" fill="${L.stroke}"/>` : "";
  const shine = L.shine ? `<ellipse cx="42" cy="50" rx="5" ry="16" fill="#fff" opacity=".35"/>` : "";
  const veins = L.veins ? `<path d="M36 60c6-4 10 4 16-2s8-10 14-6M40 80c4-6 10-2 14-8" fill="none" stroke="${L.veins}" stroke-width="1.2" opacity=".6"/>` : "";
  const cracks = L.cracks ? `<path d="M40 82l6-10l-3-8l7-10M58 80l-4-9l5-7" fill="none" stroke="${L.cracks}" stroke-width="1.6" opacity=".85"/>` : "";
  const stars = L.stars ? [[42, 70, 1.4], [56, 62, 1], [47, 50, 1.2], [60, 78, 1.1], [38, 60, 0.9], [52, 40, 1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".9"/>`).join("") : "";
  return `<svg viewBox="0 0 100 100" class="cp-svg" style="filter:${L.filter}"><defs>${L.defs}</defs>` +
    `<g fill="${L.fill}" stroke="${L.stroke}" stroke-width="${L.sw}" stroke-linejoin="round">${body}</g>${veins}${cracks}${stars}${lines}${eye}${shine}</svg>`;
}

export function boardColors(design) {
  if (design.board === "custom") return { light: design.customLight, dark: design.customDark };
  return BOARDS.find(b => b.id === design.board) || BOARDS[0];
}
