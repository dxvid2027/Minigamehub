// ==========================================================================
// alchemyArt — one drawing per element for Alchemy Table.
//
// 128 elements, 128 pictures. They share a small vocabulary of primitives
// (drop, flame, ridge, disc, leaf, figure, tower, gear, spark) so the whole
// set reads as one illustrated collection rather than 128 unrelated doodles,
// but every entry composes those primitives differently — a sun is not a
// recoloured star, and a castle is not a recoloured house.
//
// Every routine draws inside a 32x32 box centred on the origin and takes
// `t` (seconds) so a few of them can move. Colour comes from the element's
// own palette, passed in, so the token frame and the picture always agree.
// ==========================================================================

// --- palettes -------------------------------------------------------------
// [ring, ink] — the ring tints the medallion, the ink is the picture's base.
export const PALETTE = {
  water: ["#3d8fd8", "#bfe4ff"], fire: ["#e8452f", "#ffd08a"], earth: ["#8a6a42", "#d8b98a"],
  air: ["#8fb8d8", "#eaf6ff"], steam: ["#9db4c9", "#f0f8ff"], mud: ["#6b4f31", "#a8845a"],
  dust: ["#a89070", "#e8d8b8"], lava: ["#d84a1c", "#ffc266"], rain: ["#4a86b8", "#cfe9ff"],
  energy: ["#ffd23f", "#fff6c9"], sea: ["#1f6f9c", "#7fd4f0"], mountain: ["#6b6f7d", "#cfd6e4"],
  wind: ["#a8c8dd", "#f2fbff"], heat: ["#ff7a2f", "#ffd9a8"], cloud: ["#8fa8bd", "#ffffff"],
  stone: ["#7a7f8c", "#c4cad6"], sand: ["#d8b972", "#f6e6bd"], clay: ["#a8683f", "#d99a6a"],
  storm: ["#4a4f70", "#c9d4ff"], lightning: ["#ffe14a", "#fffbdc"], obsidian: ["#2a2438", "#7c5cff"],
  geyser: ["#5aa8c9", "#dff4ff"], swamp: ["#4a6b3a", "#9cbf74"], desert: ["#e0b45c", "#ffe9b8"],
  island: ["#2f8a6a", "#ffe3a8"], volcano: ["#8a3a24", "#ff8a3c"], ash: ["#6b6660", "#c9c4bc"],
  glass: ["#9fd8e8", "#ffffff"], metal: ["#8b90ac", "#dfe6f2"],
  life: ["#2ee6a6", "#c9ffe9"], algae: ["#3f8a5c", "#8fd8a8"], plant: ["#4a9c3a", "#a8e08a"],
  moss: ["#5c7a3a", "#a8c47a"], tree: ["#3f6b2a", "#7aa84f"], grass: ["#6faa42", "#c4e88a"],
  flower: ["#e8578a", "#ffd0e0"], seed: ["#a8804a", "#e0c48a"], bacteria: ["#6fbf5c", "#c9f0a8"],
  egg: ["#e8dcc4", "#fffaf0"], fish: ["#4a9cd8", "#bfe8ff"], bird: ["#5fa8e8", "#d8eeff"],
  lizard: ["#5c8a3a", "#a8cf74"], beetle: ["#4a5c6b", "#8fb0c9"], worm: ["#c98f8a", "#f0cfc9"],
  sun: ["#ffb628", "#fff2b8"], sky: ["#5aa8e8", "#d4eeff"], moon: ["#b8c4dd", "#f4f8ff"],
  star: ["#ffd76a", "#fff6cc"], space: ["#241a44", "#a86bff"], rainbow: ["#e8578a", "#ffe9a8"],
  time: ["#c9a86a", "#f0dcb8"], horizon: ["#e08a5c", "#ffd8a8"],
  brick: ["#b45c42", "#e08a6a"], wall: ["#8a7f74", "#c4b8a8"], house: ["#c98f4a", "#ffd8a0"],
  wood: ["#8a5c34", "#c99a5c"], paper: ["#e8e0cc", "#fffbf0"], book: ["#a83f4a", "#e8c48a"],
  wheel: ["#7a5c3a", "#c49a6a"], cart: ["#8a6b42", "#c9a06a"], boat: ["#6b4f31", "#a8cfe8"],
  blade: ["#a8b0c4", "#eef2ff"], sword: ["#c9d4e8", "#ffd76a"], armour: ["#8b90ac", "#dfe6f2"],
  tool: ["#8a7f6a", "#d8cfb8"], forge: ["#c9521c", "#ffb347"], steel: ["#9aa4bd", "#eaf0ff"],
  gear: ["#7f8899", "#cfd8e8"], engine: ["#6b6f7d", "#ffb347"], train: ["#4a5462", "#ffd76a"],
  ship: ["#3f5c74", "#e8eef5"], plane: ["#8fa8c9", "#eef4ff"], rocket: ["#c9d4e8", "#ff6b28"],
  dinosaur: ["#5c8a4a", "#a8cf74"], dragon: ["#a8342f", "#ff8a3c"], phoenix: ["#ff5a2f", "#ffd76a"],
  mammal: ["#a8804a", "#e0c48a"], horse: ["#8a5c34", "#d8b98a"], wolf: ["#6b7280", "#c4cad6"],
  forest: ["#2f5c2a", "#6f9c5c"], jungle: ["#2a6b3a", "#7fbf5c"],
  human: ["#e8a87c", "#ffd8b8"], farmer: ["#c9a05c", "#ffe0a8"], smith: ["#8a6b4a", "#ffb347"],
  sailor: ["#4a7fa8", "#cfe9ff"], knight: ["#9aa4bd", "#eaf0ff"], wizard: ["#7c5cff", "#d8c9ff"],
  pirate: ["#4a4450", "#e8dcc4"], astronaut: ["#dfe6f2", "#5aa8e8"], scholar: ["#8a6b8f", "#e0d0e8"],
  magic: ["#a86bff", "#e8d8ff"], spell: ["#7c5cff", "#ffe9a8"], potion: ["#c96bff", "#ffd0f0"],
  curse: ["#5c2a44", "#ff4fd8"], death: ["#4a4450", "#c9c4bc"], ghost: ["#8fa8c9", "#eef6ff"],
  soul: ["#7cf0d0", "#eafff8"], golem: ["#8a6a42", "#c9a06a"], philosopher: ["#8a6b8f", "#e8d8f0"],
  gold: ["#e8b02f", "#fff0b8"], philosophers_stone: ["#c9243a", "#ffd76a"],
  elixir: ["#2ee6a6", "#ffe9a8"], immortality: ["#ffd76a", "#7cf0d0"],
  village: ["#a8804a", "#e0c48a"], city: ["#7f8899", "#ffd76a"], castle: ["#8b90ac", "#c9d4e8"],
  kingdom: ["#ffd76a", "#c9243a"], empire: ["#c9243a", "#ffd76a"], war: ["#8a2f2f", "#ff8a5c"],
  peace: ["#7fd4a8", "#eafff0"], history: ["#a8905c", "#e8dcc4"], library: ["#8a5c34", "#e8c48a"],
  university: ["#6b5c8a", "#d8c9ff"], science: ["#4a9cd8", "#bfe8ff"],
  machine: ["#6b6f7d", "#c4cad6"], computer: ["#3a4a5c", "#5ce6ff"], network: ["#2a3a5c", "#7cf0d0"],
  ai: ["#22d3ee", "#c9fbff"], satellite: ["#8fa8c9", "#ffd76a"], colony: ["#5aa8e8", "#dfe6f2"],
  galaxy: ["#5c2a8a", "#ffd0f0"], universe: ["#2a1a5c", "#a86bff"], black_hole: ["#0d0616", "#c86bff"],
  singularity: ["#1a0d2a", "#5ce6ff"], creation: ["#ffd76a", "#7cf0d0"],
  legend: ["#c9a02f", "#ffe9a8"], myth: ["#6b4f8a", "#e8d0ff"], alchemy: ["#e8b02f", "#c96bff"],
};

// --- primitives -----------------------------------------------------------
const TAU = Math.PI * 2;

function fill(ctx, c) { ctx.fillStyle = c; ctx.fill(); }
function stroke(ctx, c, w = 2) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }

function disc(ctx, x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fill(ctx, c); }
function ring(ctx, x, y, r, c, w = 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); stroke(ctx, c, w); }

function drop(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.35);
  ctx.quadraticCurveTo(x + r, y - r * 0.1, x + r * 0.72, y + r * 0.5);
  ctx.arc(x, y + r * 0.5, r * 0.72, 0, Math.PI);
  ctx.quadraticCurveTo(x - r, y - r * 0.1, x, y - r * 1.35);
  fill(ctx, c);
}

function flame(ctx, x, y, r, c, c2) {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.quadraticCurveTo(x - r * 0.95, y + r * 0.1, x - r * 0.32, y - r * 0.5);
  ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.2, x + r * 0.22, y - r * 1.45);
  ctx.quadraticCurveTo(x + r * 0.1, y - r * 0.5, x + r * 0.55, y - r * 0.72);
  ctx.quadraticCurveTo(x + r * 1.05, y + r * 0.1, x, y + r);
  fill(ctx, c);
  if (c2) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.8);
    ctx.quadraticCurveTo(x - r * 0.45, y + r * 0.1, x + 0, y - r * 0.55);
    ctx.quadraticCurveTo(x + r * 0.45, y + r * 0.1, x, y + r * 0.8);
    fill(ctx, c2);
  }
}

/** A ridgeline: the base of every landscape in the set. */
function ridge(ctx, y, peaks, c, h = 10) {
  ctx.beginPath();
  ctx.moveTo(-15, y);
  for (const [px, ph] of peaks) { ctx.lineTo(px, y - ph * h); }
  ctx.lineTo(15, y);
  ctx.closePath();
  fill(ctx, c);
}

function star(ctx, x, y, r, points, inner, c) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * TAU;
    const rr = i % 2 ? r * inner : r;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  fill(ctx, c);
}

function leaf(ctx, x, y, r, a, c) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(r * 0.7, -r * 0.55, r * 1.5, 0);
  ctx.quadraticCurveTo(r * 0.7, r * 0.55, 0, 0);
  fill(ctx, c);
  ctx.restore();
}

/** A standing figure: shared by every person in the tree. */
function figure(ctx, x, y, s, body, skin, extra) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-5, 10); ctx.lineTo(-4, -3); ctx.lineTo(4, -3); ctx.lineTo(5, 10);
  ctx.closePath(); fill(ctx, body);
  disc(ctx, 0, -7.5, 4, skin);
  extra?.(ctx);
  ctx.restore();
}

/** A building block: shared by house, village, city, castle, library. */
function tower(ctx, x, y, w, h, c, roof, roofC) {
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h, w, h);
  fill(ctx, c);
  if (roof === "pitch") {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 1.5, y - h);
    ctx.lineTo(x, y - h - w * 0.6);
    ctx.lineTo(x + w / 2 + 1.5, y - h);
    ctx.closePath(); fill(ctx, roofC);
  } else if (roof === "battlement") {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.rect(x - w / 2 + i * (w / 3), y - h - 2.6, w / 5, 2.6);
      fill(ctx, roofC);
    }
  } else if (roof === "flat") {
    ctx.beginPath(); ctx.rect(x - w / 2 - 1, y - h - 1.6, w + 2, 1.6); fill(ctx, roofC);
  }
}

function gearShape(ctx, x, y, r, teeth, c, hole) {
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * TAU;
    const rr = i % 2 ? r * 0.76 : r;
    i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); fill(ctx, c);
  if (hole) disc(ctx, x, y, r * 0.32, hole);
}

function bolt(ctx, x, y, s, c) {
  ctx.beginPath();
  ctx.moveTo(x + 2 * s, y - 12 * s);
  ctx.lineTo(x - 5 * s, y + 1 * s);
  ctx.lineTo(x - 0.5 * s, y + 1 * s);
  ctx.lineTo(x - 3 * s, y + 12 * s);
  ctx.lineTo(x + 6 * s, y - 2 * s);
  ctx.lineTo(x + 1 * s, y - 2 * s);
  ctx.closePath();
  fill(ctx, c);
}

function flask(ctx, x, y, s, glass, liquid) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-2.6, -11); ctx.lineTo(-2.6, -4);
  ctx.lineTo(-8, 8); ctx.quadraticCurveTo(-9, 11, -5, 11);
  ctx.lineTo(5, 11); ctx.quadraticCurveTo(9, 11, 8, 8);
  ctx.lineTo(2.6, -4); ctx.lineTo(2.6, -11);
  ctx.closePath();
  fill(ctx, glass);
  ctx.beginPath();
  ctx.moveTo(-6.4, 3); ctx.lineTo(-8, 8);
  ctx.quadraticCurveTo(-9, 11, -5, 11);
  ctx.lineTo(5, 11); ctx.quadraticCurveTo(9, 11, 8, 8);
  ctx.lineTo(6.4, 3);
  ctx.closePath();
  fill(ctx, liquid);
  ctx.beginPath(); ctx.rect(-3.6, -13, 7.2, 2.4); fill(ctx, "rgba(255,255,255,0.5)");
  ctx.restore();
}

function sparkle(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  fill(ctx, c);
}

// --- the set --------------------------------------------------------------
// Each entry draws its element. `a` is the ring colour, `b` the ink colour.
export const ART = {
  // ---- the four, and the first things they make ----
  water: (c, t, a, b) => { drop(c, 0, 1, 9, a); drop(c, -2, -1, 4, b); },
  fire: (c, t, a, b) => flame(c, 0, 6, 10, a, b),
  earth: (c, t, a, b) => { ridge(c, 10, [[-8, 0.6], [-2, 1.3], [5, 0.85], [11, 1.15]], a);
                           ridge(c, 12, [[-6, 0.35], [3, 0.55], [10, 0.4]], b); },
  air: (c, t, a, b) => {
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(-12, i * 6 + Math.sin(t + i) * 0.8);
      c.bezierCurveTo(-2, i * 6 - 5, 6, i * 6 + 5, 12, i * 6 - 1);
      stroke(c, i === 0 ? b : a, 2.6);
    }
  },
  steam: (c, t, a, b) => {
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      const x = -7 + i * 7;
      c.moveTo(x, 12);
      c.bezierCurveTo(x - 5, 4, x + 5, 0, x - 1, -10);
      stroke(c, i === 1 ? b : a, 3);
    }
  },
  mud: (c, t, a, b) => { ridge(c, 11, [[-7, 0.4], [2, 0.8], [10, 0.5]], a);
                         disc(c, -4, 6, 3, b); disc(c, 4, 8, 2.2, b); },
  dust: (c, t, a, b) => { for (let i = 0; i < 9; i++) {
      const an = (i / 9) * TAU + t * 0.3;
      disc(c, Math.cos(an) * (5 + (i % 3) * 3.5), Math.sin(an) * (4 + (i % 2) * 4), 1.6 + (i % 3) * 0.5, i % 2 ? a : b);
    } },
  lava: (c, t, a, b) => { ridge(c, 12, [[-8, 0.5], [0, 0.9], [9, 0.6]], "#4a1f10");
                          c.beginPath(); c.moveTo(-2, -12); c.bezierCurveTo(2, -4, -3, 0, 1, 12);
                          stroke(c, a, 4); disc(c, 1, 10, 2.4, b); },
  rain: (c, t, a, b) => { c.beginPath(); c.ellipse(0, -6, 11, 5, 0, 0, TAU); fill(c, b);
                          for (let i = -1; i <= 1; i++) { c.beginPath();
                            c.moveTo(i * 7, 1); c.lineTo(i * 7 - 1.5, 11); stroke(c, a, 2.4); } },
  energy: (c, t, a, b) => { bolt(c, 0, 0, 1, a); bolt(c, 0, 0, 0.5, b); },
  sea: (c, t, a, b) => { c.beginPath(); c.rect(-14, 0, 28, 13); fill(c, a);
                         for (let i = 0; i < 3; i++) { c.beginPath();
                           c.moveTo(-13, 2 + i * 4.4); c.bezierCurveTo(-5, -1 + i * 4.4, 5, 5 + i * 4.4, 13, 1 + i * 4.4);
                           stroke(c, b, 1.8); } },
  mountain: (c, t, a, b) => { ridge(c, 12, [[-6, 1.6], [3, 2.1], [11, 1.2]], a);
                              c.beginPath(); c.moveTo(-1, -9); c.lineTo(3, -9.5); c.lineTo(5, -6); c.lineTo(-3, -5.5);
                              c.closePath(); fill(c, b); },
  wind: (c, t, a, b) => { for (let i = -1; i <= 1; i++) { c.beginPath();
      c.moveTo(-12, i * 7); c.bezierCurveTo(0, i * 7 - 6, 6, i * 7 + 4, 10, i * 7 - 2);
      c.quadraticCurveTo(13, i * 7 - 5, 10, i * 7 - 6); stroke(c, i ? a : b, 2.4); } },
  heat: (c, t, a, b) => { for (let i = -1; i <= 1; i++) { c.beginPath();
      c.moveTo(i * 8, 12); c.bezierCurveTo(i * 8 - 4, 4, i * 8 + 4, 0, i * 8, -11); stroke(c, i ? a : b, 3); } },
  cloud: (c, t, a, b) => { c.beginPath();
      c.arc(-6, 2, 6, 0, TAU); c.arc(1, -2, 8, 0, TAU); c.arc(8, 2.5, 5.5, 0, TAU);
      c.rect(-6, 2, 14, 5); fill(c, b);
      c.beginPath(); c.arc(-6, 4, 4, 0, Math.PI); c.arc(6, 4.5, 4, 0, Math.PI); fill(c, a); },
  stone: (c, t, a, b) => { c.beginPath();
      c.moveTo(-11, 6); c.lineTo(-7, -7); c.lineTo(4, -9); c.lineTo(11, 1); c.lineTo(6, 9);
      c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(-7, -7); c.lineTo(2, -1); c.lineTo(6, 9); stroke(c, b, 1.6); },
  sand: (c, t, a, b) => { ridge(c, 12, [[-6, 0.55], [4, 0.8], [12, 0.45]], a);
      for (let i = 0; i < 7; i++) disc(c, -11 + i * 3.6, 3 + (i % 3) * 2.5, 1, b); },
  clay: (c, t, a, b) => { c.beginPath();
      c.moveTo(-6, -8); c.lineTo(6, -8); c.lineTo(8, 2); c.quadraticCurveTo(8, 11, 0, 11);
      c.quadraticCurveTo(-8, 11, -8, 2); c.closePath(); fill(c, a);
      c.beginPath(); c.rect(-7.5, -9.5, 15, 3); fill(c, b); },
  storm: (c, t, a, b) => { c.beginPath();
      c.arc(-5, -3, 6.5, 0, TAU); c.arc(3, -6, 7.5, 0, TAU); c.rect(-5, -6, 8, 6); fill(c, a);
      bolt(c, 1, 7, 0.7, b); },
  lightning: (c, t, a, b) => { bolt(c, -3, 0, 0.95, a); bolt(c, 5, 2, 0.6, b); },
  obsidian: (c, t, a, b) => { c.beginPath();
      c.moveTo(0, -12); c.lineTo(9, -2); c.lineTo(5, 11); c.lineTo(-5, 11); c.lineTo(-9, -2);
      c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(0, -12); c.lineTo(-9, -2); c.lineTo(-1, 4); c.closePath(); fill(c, b); },
  geyser: (c, t, a, b) => { ridge(c, 12, [[-9, 0.4], [-4, 0.3], [4, 0.35], [11, 0.45]], "#4a3f2a");
      c.beginPath(); c.moveTo(-3, 10); c.bezierCurveTo(-6, 0, 4, -3, 0, -12); stroke(c, a, 5);
      disc(c, 0, -12, 3.4, b); disc(c, -5, -6, 2, b); },
  swamp: (c, t, a, b) => { c.beginPath(); c.rect(-14, 3, 28, 10); fill(c, a);
      for (let i = 0; i < 3; i++) disc(c, -8 + i * 8, 6 + (i % 2) * 3, 1.8, b);
      c.beginPath(); c.moveTo(-6, 3); c.lineTo(-7, -9); c.moveTo(5, 3); c.lineTo(6, -7); stroke(c, b, 2); },
  desert: (c, t, a, b) => { disc(c, 6, -7, 4.5, b);
      ridge(c, 12, [[-5, 0.7], [6, 0.5], [12, 0.6]], a);
      c.beginPath(); c.moveTo(-8, 8); c.lineTo(-8, 1); c.moveTo(-8, 3); c.lineTo(-11, 0);
      c.moveTo(-8, 4); c.lineTo(-5, 1); stroke(c, "#4a7a3a", 2); },
  island: (c, t, a, b) => { c.beginPath(); c.rect(-14, 6, 28, 7); fill(c, "#2f6f9c");
      c.beginPath(); c.ellipse(0, 6, 10, 4.5, 0, Math.PI, 0); fill(c, b);
      c.beginPath(); c.moveTo(1, 5); c.quadraticCurveTo(3, -3, 1, -8); stroke(c, "#6b4f31", 2.4);
      for (const d of [-1, 1]) leaf(c, 1, -8, 5, d > 0 ? -0.5 : Math.PI + 0.5, a); },
  volcano: (c, t, a, b) => { ridge(c, 12, [[-5, 1.5], [0, 1.35], [5, 1.5]], a);
      c.beginPath(); c.moveTo(-4, -6); c.lineTo(4, -6); c.lineTo(2, 4); c.lineTo(-2, 4); c.closePath(); fill(c, b);
      flame(c, 0, -8, 4.5, b, "#fff0c0"); },
  ash: (c, t, a, b) => { for (let i = 0; i < 11; i++) {
      const an = i * 2.4 + t * 0.2;
      disc(c, Math.cos(an) * (3 + i), Math.sin(an * 1.3) * (2 + i * 0.7) + 2, 1.2 + (i % 3) * 0.4, i % 2 ? a : b);
    } },
  glass: (c, t, a, b) => { c.beginPath();
      c.moveTo(-7, -10); c.lineTo(7, -10); c.lineTo(5, 6); c.quadraticCurveTo(5, 11, 0, 11);
      c.quadraticCurveTo(-5, 11, -5, 6); c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(-4.5, -8); c.lineTo(-2.5, 4); stroke(c, b, 2); },
  metal: (c, t, a, b) => { c.beginPath(); c.rect(-11, -3, 22, 9); fill(c, a);
      c.beginPath(); c.moveTo(-11, -3); c.lineTo(-7, -8); c.lineTo(15, -8); c.lineTo(11, -3);
      c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(11, -3); c.lineTo(15, -8); c.lineTo(15, 1); c.lineTo(11, 6); c.closePath();
      fill(c, "rgba(0,0,0,0.25)"); },

  // ---- life ----
  life: (c, t, a, b) => { c.beginPath(); c.moveTo(0, 12); c.quadraticCurveTo(-2, 2, 0, -3); stroke(c, "#3f6b2a", 2.4);
      leaf(c, 0, -2, 6, -2.4, a); leaf(c, 0, -2, 6, -0.7, b); leaf(c, 0, 3, 5, -1.6, a); },
  algae: (c, t, a, b) => { for (let i = -1; i <= 1; i++) { c.beginPath();
      c.moveTo(i * 7, 12); c.bezierCurveTo(i * 7 - 5, 5, i * 7 + 5, 0, i * 7 - 1, -10); stroke(c, i ? a : b, 2.6); }
      disc(c, 5, -6, 2, b); disc(c, -6, -2, 1.6, b); },
  plant: (c, t, a, b) => { c.beginPath(); c.moveTo(0, 12); c.lineTo(0, -2); stroke(c, a, 2.6);
      leaf(c, 0, 1, 6, -0.5, b); leaf(c, 0, -2, 6, Math.PI + 0.5, b); },
  moss: (c, t, a, b) => { c.beginPath();
      c.moveTo(-12, 10); c.quadraticCurveTo(-6, 0, 0, 8); c.quadraticCurveTo(6, -2, 12, 10);
      c.closePath(); fill(c, a);
      for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-9 + i * 3.6, 8); c.lineTo(-9 + i * 3.6, 2); stroke(c, b, 1.4); } },
  tree: (c, t, a, b) => { c.beginPath(); c.rect(-2, 0, 4, 12); fill(c, "#6b4f31");
      disc(c, -5, -3, 7, a); disc(c, 5, -2, 6.5, a); disc(c, 0, -8, 7.5, b); },
  grass: (c, t, a, b) => { for (let i = 0; i < 6; i++) { c.beginPath();
      const x = -11 + i * 4.4;
      c.moveTo(x, 12); c.quadraticCurveTo(x + (i % 2 ? 3 : -3), 3, x + (i % 2 ? 5 : -5), -6);
      stroke(c, i % 2 ? a : b, 2.2); } },
  flower: (c, t, a, b) => { c.beginPath(); c.moveTo(0, 12); c.lineTo(0, 0); stroke(c, "#4a7f33", 2.2);
      leaf(c, 0, 6, 4.5, -0.4, "#4a7f33");
      for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU;
        c.beginPath(); c.ellipse(Math.cos(an) * 5, -3 + Math.sin(an) * 5, 4, 2.6, an, 0, TAU); fill(c, a); }
      disc(c, 0, -3, 3, b); },
  seed: (c, t, a, b) => { c.beginPath(); c.ellipse(0, 2, 6, 8.5, 0.2, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(4, -10, 6, -12); stroke(c, b, 2);
      c.beginPath(); c.ellipse(-2, 1, 2.4, 4, 0.2, 0, TAU); fill(c, b); },
  bacteria: (c, t, a, b) => { c.beginPath(); c.ellipse(0, 0, 9, 6, -0.3, 0, TAU); fill(c, a);
      for (let i = 0; i < 5; i++) { const an = (i / 5) * TAU;
        c.beginPath(); c.moveTo(Math.cos(an) * 8, Math.sin(an) * 5.4);
        c.lineTo(Math.cos(an) * 12.5, Math.sin(an) * 9); stroke(c, a, 1.4); }
      disc(c, -2, -1, 2.6, b); },
  egg: (c, t, a, b) => { c.beginPath(); c.ellipse(0, 1, 7.5, 10, 0, 0, TAU); fill(c, b);
      c.beginPath(); c.ellipse(-2.4, -2.5, 2.6, 3.4, -0.3, 0, TAU); fill(c, "rgba(255,255,255,0.7)");
      c.beginPath(); c.ellipse(0, 1, 7.5, 10, 0, 0, TAU); stroke(c, a, 1.6); },
  fish: (c, t, a, b) => { c.beginPath(); c.ellipse(1, 0, 9, 5.5, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(-8, 0); c.lineTo(-14, -5); c.lineTo(-14, 5); c.closePath(); fill(c, b);
      disc(c, 5, -1.5, 1.4, "#0b0a12"); c.beginPath(); c.moveTo(0, -5); c.lineTo(3, -9); c.lineTo(5, -4); c.closePath(); fill(c, b); },
  bird: (c, t, a, b) => { c.beginPath(); c.ellipse(0, 1, 8, 6, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-2, -8, 5, -3); c.quadraticCurveTo(-1, -1, -7, 0); fill(c, b);
      c.beginPath(); c.moveTo(7, -2); c.lineTo(12, 0); c.lineTo(7, 2); c.closePath(); fill(c, "#ff9f43");
      disc(c, 4.5, -3, 1.3, "#0b0a12");
      c.beginPath(); c.moveTo(-8, 2); c.lineTo(-13, 5); c.lineTo(-8, 6); c.closePath(); fill(c, b); },
  lizard: (c, t, a, b) => { c.beginPath(); c.ellipse(0, 1, 8, 4.5, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(-7, 1); c.quadraticCurveTo(-13, 3, -11, 9); stroke(c, a, 2.6);
      disc(c, 8, -1, 3.4, a); disc(c, 9, -2, 1.1, "#0b0a12");
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3, 4); c.lineTo(s * 6, 9); stroke(c, b, 2); } },
  beetle: (c, t, a, b) => { c.beginPath(); c.ellipse(0, 1, 7.5, 9, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(0, -8); c.lineTo(0, 10); stroke(c, b, 1.6);
      disc(c, 0, -9, 3.4, b);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath();
        c.moveTo(s * 6, -3 + i * 5); c.lineTo(s * 12, -6 + i * 6); stroke(c, a, 1.6); } },
  worm: (c, t, a, b) => { c.beginPath();
      c.moveTo(-12, 8); c.bezierCurveTo(-4, -6, 4, 12, 12, -4); stroke(c, a, 6);
      c.lineCap = "round"; disc(c, 12, -4, 3, b); disc(c, 11, -5.5, 0.9, "#0b0a12"); },

  // ---- sky ----
  sun: (c, t, a, b) => { for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU + t * 0.15;
        c.beginPath(); c.moveTo(Math.cos(an) * 8, Math.sin(an) * 8);
        c.lineTo(Math.cos(an) * (12 + (i % 2) * 2), Math.sin(an) * (12 + (i % 2) * 2)); stroke(c, a, 2.2); }
      disc(c, 0, 0, 7.5, a); disc(c, -1.5, -1.5, 4, b); },
  sky: (c, t, a, b) => { c.beginPath(); c.rect(-14, -12, 28, 24); fill(c, a);
      c.beginPath(); c.arc(-4, 4, 5, 0, TAU); c.arc(3, 1, 6.5, 0, TAU); c.rect(-4, 1, 7, 6); fill(c, b);
      disc(c, 8, -7, 3.4, "#fff0b8"); },
  moon: (c, t, a, b) => { c.beginPath(); c.arc(0, 0, 10, 0, TAU); fill(c, b);
      c.save(); c.globalCompositeOperation = "destination-out";
      c.beginPath(); c.arc(5.5, -3, 9, 0, TAU); c.fill(); c.restore();
      disc(c, -3, 3, 2, a); disc(c, -6, -3, 1.4, a); },
  star: (c, t, a, b) => { star(c, 0, 0, 12, 0.42, 5, a); star(c, 0, 0, 6, 0.45, 5, b); },
  space: (c, t, a, b) => { c.beginPath(); c.rect(-14, -12, 28, 24); fill(c, a);
      for (let i = 0; i < 14; i++) { const an = i * 2.399;
        disc(c, Math.cos(an) * (2 + i), Math.sin(an) * (1.6 + i * 0.75), 0.9 + (i % 3) * 0.4, b); } },
  rainbow: (c, t, a, b) => { const cols = ["#e8384f", "#ff9f43", "#ffd76a", "#2ee6a6", "#22d3ee", "#7c5cff"];
      cols.forEach((col, i) => { c.beginPath(); c.arc(0, 10, 12 - i * 1.8, Math.PI, 0); stroke(c, col, 1.9); }); },
  time: (c, t, a, b) => { c.beginPath();
      c.moveTo(-8, -11); c.lineTo(8, -11); c.lineTo(1.5, 0); c.lineTo(8, 11); c.lineTo(-8, 11); c.lineTo(-1.5, 0);
      c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(-6, -9); c.lineTo(6, -9); c.lineTo(0.6, -1); c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(-3, 9); c.lineTo(3, 9); c.lineTo(0, 4); c.closePath(); fill(c, b); },
  horizon: (c, t, a, b) => { c.beginPath(); c.arc(0, 6, 8, Math.PI, 0); fill(c, a);
      c.beginPath(); c.rect(-14, 6, 28, 7); fill(c, "#2f6f9c");
      for (let i = 0; i < 2; i++) { c.beginPath();
        c.moveTo(-12, 9 + i * 3); c.bezierCurveTo(-4, 7 + i * 3, 4, 11 + i * 3, 12, 8 + i * 3); stroke(c, b, 1.5); } },

  // ---- made ----
  brick: (c, t, a, b) => { for (let r = 0; r < 3; r++) for (let i = 0; i < 3; i++) {
      const off = r % 2 ? 4 : 0;
      c.beginPath(); c.rect(-13 + i * 9 + off, -9 + r * 7, 8, 6); fill(c, r % 2 ? b : a); } },
  wall: (c, t, a, b) => { c.beginPath(); c.rect(-12, -4, 24, 15); fill(c, a);
      for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) { c.beginPath();
        c.rect(-11 + i * 8 + (r % 2 ? 4 : 0), -3 + r * 7, 6.5, 5.5); fill(c, b); }
      for (let i = 0; i < 3; i++) { c.beginPath(); c.rect(-12 + i * 9, -9, 6, 5); fill(c, a); } },
  house: (c, t, a, b) => { tower(c, 0, 11, 17, 12, a, "pitch", b);
      c.beginPath(); c.rect(-3, 3, 6, 8); fill(c, "#4a3020");
      c.beginPath(); c.rect(4, 1, 5, 5); fill(c, "#ffe9a8"); },
  wood: (c, t, a, b) => { c.beginPath(); c.rect(-13, -6, 26, 12); fill(c, a);
      c.beginPath(); c.ellipse(-13, 0, 3, 6, 0, 0, TAU); fill(c, b);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(-13, 0, 1 + i, 2 + i * 2, 0, 0, TAU); stroke(c, a, 1); } },
  paper: (c, t, a, b) => { c.beginPath(); c.rect(-8, -11, 16, 22); fill(c, b);
      c.beginPath(); c.rect(-8, -11, 16, 22); stroke(c, a, 1.4);
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-5, -7 + i * 4); c.lineTo(5, -7 + i * 4); stroke(c, a, 1.2); } },
  book: (c, t, a, b) => { c.beginPath(); c.rect(-10, -9, 20, 18); fill(c, a);
      c.beginPath(); c.rect(-7, -7, 15, 14); fill(c, b);
      c.beginPath(); c.moveTo(-10, -9); c.lineTo(-10, 9); stroke(c, "rgba(0,0,0,0.35)", 3);
      c.beginPath(); c.moveTo(0, -7); c.lineTo(0, 7); stroke(c, a, 1.4); },
  wheel: (c, t, a, b) => { c.save(); c.rotate(t * 0.5);
      ring(c, 0, 0, 11, a, 3.4);
      for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(an) * 9.4, Math.sin(an) * 9.4); stroke(c, b, 1.6); }
      disc(c, 0, 0, 3, b); c.restore(); },
  cart: (c, t, a, b) => { c.beginPath(); c.rect(-11, -6, 22, 9); fill(c, a);
      c.beginPath(); c.moveTo(11, -3); c.lineTo(15, -5); stroke(c, b, 2);
      ring(c, -6, 7, 4.4, b, 2.4); ring(c, 6, 7, 4.4, b, 2.4); },
  boat: (c, t, a, b) => { c.beginPath();
      c.moveTo(-12, 2); c.lineTo(12, 2); c.lineTo(8, 10); c.lineTo(-8, 10); c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(0, 2); c.lineTo(0, -12); stroke(c, "#4a3020", 2);
      c.beginPath(); c.moveTo(1, -11); c.lineTo(9, -2); c.lineTo(1, -2); c.closePath(); fill(c, b); },
  blade: (c, t, a, b) => { c.beginPath();
      c.moveTo(-1, -12); c.lineTo(3.4, -8); c.lineTo(3.4, 6); c.lineTo(-1, 8); c.lineTo(-4.4, 6); c.lineTo(-4.4, -8);
      c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(-1, -12); c.lineTo(-1, 8); stroke(c, a, 1.4);
      c.beginPath(); c.rect(-6, 8, 10, 3); fill(c, a); },
  sword: (c, t, a, b) => { c.beginPath();
      c.moveTo(0, -13); c.lineTo(3.6, -8); c.lineTo(3.6, 3); c.lineTo(-3.6, 3); c.lineTo(-3.6, -8);
      c.closePath(); fill(c, a);
      c.beginPath(); c.rect(-9, 3, 18, 3); fill(c, b);
      c.beginPath(); c.rect(-2, 6, 4, 6); fill(c, "#6b4f31");
      disc(c, 0, 12, 2.4, b); },
  armour: (c, t, a, b) => { c.beginPath();
      c.moveTo(-9, -8); c.lineTo(9, -8); c.lineTo(8, 3); c.quadraticCurveTo(0, 12, -8, 3);
      c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(0, -8); c.lineTo(0, 8); stroke(c, b, 1.6);
      c.beginPath(); c.moveTo(-8, -3); c.lineTo(8, -3); stroke(c, b, 1.4);
      c.beginPath(); c.arc(0, -10, 4, Math.PI, 0); fill(c, b); },
  tool: (c, t, a, b) => { c.save(); c.rotate(-0.5);
      c.beginPath(); c.rect(-1.6, -4, 3.2, 15); fill(c, "#6b4f31");
      c.beginPath(); c.moveTo(-8, -9); c.lineTo(8, -9); c.lineTo(6, -3); c.lineTo(-6, -3); c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(-8, -9); c.lineTo(-11, -6); c.lineTo(-6, -3); c.closePath(); fill(c, b);
      c.restore(); },
  forge: (c, t, a, b) => { c.beginPath();
      c.moveTo(-12, 11); c.lineTo(-9, -4); c.lineTo(9, -4); c.lineTo(12, 11); c.closePath(); fill(c, "#4a3a2a");
      flame(c, 0, 6, 7, a, b);
      c.beginPath(); c.rect(-13, 11, 26, 2.4); fill(c, "#2a2018"); },
  steel: (c, t, a, b) => { c.beginPath(); c.rect(-12, -8, 24, 6); fill(c, a);
      c.beginPath(); c.rect(-12, 1, 24, 6); fill(c, a);
      c.beginPath(); c.moveTo(-12, -8); c.lineTo(-8, -12); c.lineTo(16, -12); c.lineTo(12, -8); c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(-12, 1); c.lineTo(-8, -3); c.lineTo(16, -3); c.lineTo(12, 1); c.closePath(); fill(c, b); },
  gear: (c, t, a, b) => { c.save(); c.rotate(t * 0.4); gearShape(c, 0, 0, 12, 8, a, b); c.restore(); },
  engine: (c, t, a, b) => { c.beginPath(); c.rect(-11, -4, 22, 13); fill(c, a);
      c.beginPath(); c.rect(-7, -11, 5, 7); fill(c, a);
      c.beginPath(); c.rect(2, -11, 5, 7); fill(c, a);
      disc(c, -4.5, -12, 2.6, b); disc(c, 4.5, -12, 2.6, b);
      c.beginPath(); c.rect(-9, 3, 18, 3); fill(c, b); },
  train: (c, t, a, b) => { c.beginPath(); c.rect(-13, -4, 17, 11); fill(c, a);
      c.beginPath(); c.rect(4, -9, 9, 16); fill(c, a);
      c.beginPath(); c.rect(-10, -10, 5, 6); fill(c, a);
      disc(c, -8.5, -12, 3, b);
      c.beginPath(); c.rect(6, -6, 5, 5); fill(c, b);
      ring(c, -8, 9, 3.4, b, 2); ring(c, 2, 9, 3.4, b, 2); ring(c, 9, 9, 3, b, 2); },
  ship: (c, t, a, b) => { c.beginPath();
      c.moveTo(-13, 1); c.lineTo(13, 1); c.lineTo(9, 10); c.lineTo(-9, 10); c.closePath(); fill(c, a);
      c.beginPath(); c.rect(-6, -7, 12, 8); fill(c, b);
      c.beginPath(); c.rect(-2, -13, 3, 6); fill(c, a);
      for (let i = 0; i < 3; i++) disc(c, -4 + i * 4, -3, 1.3, a); },
  plane: (c, t, a, b) => { c.beginPath();
      c.moveTo(13, 0); c.lineTo(-4, 3.4); c.lineTo(-11, 3.4); c.lineTo(-11, -3.4); c.lineTo(-4, -3.4);
      c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(2, 0); c.lineTo(-6, -12); c.lineTo(-1, -1); c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(2, 0); c.lineTo(-6, 12); c.lineTo(-1, 1); c.closePath(); fill(c, a); },
  rocket: (c, t, a, b) => { c.beginPath();
      c.moveTo(0, -13); c.quadraticCurveTo(6, -4, 5.5, 6); c.lineTo(-5.5, 6); c.quadraticCurveTo(-6, -4, 0, -13);
      fill(c, a);
      c.beginPath(); c.moveTo(-5.5, 3); c.lineTo(-10, 10); c.lineTo(-4, 8); c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(5.5, 3); c.lineTo(10, 10); c.lineTo(4, 8); c.closePath(); fill(c, b);
      disc(c, 0, -4, 2.8, "#5aa8e8");
      flame(c, 0, 12, 4.5, b, "#fff0c0"); },

  // ---- creatures ----
  dinosaur: (c, t, a, b) => { c.beginPath(); c.ellipse(-1, 2, 9, 6, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(-8, 1); c.quadraticCurveTo(-15, 0, -13, -7); stroke(c, a, 3);
      c.beginPath(); c.moveTo(5, -2); c.quadraticCurveTo(10, -10, 6, -12); stroke(c, a, 3.4);
      disc(c, 6, -12, 3.4, a); disc(c, 7.5, -13, 1, "#0b0a12");
      for (let i = 0; i < 4; i++) { c.beginPath();
        c.moveTo(-6 + i * 3.4, -4); c.lineTo(-4.6 + i * 3.4, -8); c.lineTo(-3.2 + i * 3.4, -4); c.closePath(); fill(c, b); }
      c.beginPath(); c.moveTo(-3, 7); c.lineTo(-4, 11); c.moveTo(3, 7); c.lineTo(4, 11); stroke(c, a, 2.4); },
  dragon: (c, t, a, b) => { c.beginPath();
      c.moveTo(-2, 4); c.quadraticCurveTo(-14, 0, -10, -10); c.quadraticCurveTo(-4, -4, 0, -2);
      c.closePath(); fill(c, b);
      c.beginPath(); c.ellipse(0, 3, 8, 5.5, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(6, 0); c.quadraticCurveTo(11, -7, 7, -10); stroke(c, a, 3.4);
      disc(c, 7, -10, 3.6, a); disc(c, 8.6, -11, 1.1, "#ffd76a");
      c.beginPath(); c.moveTo(-7, 4); c.quadraticCurveTo(-14, 8, -12, 12); stroke(c, a, 2.4);
      flame(c, 12, -10, 3.4, b, "#fff0c0"); },
  phoenix: (c, t, a, b) => { c.beginPath();
      c.moveTo(0, 6); c.quadraticCurveTo(-13, -2, -8, -12); c.quadraticCurveTo(-3, -4, 0, -2);
      c.quadraticCurveTo(3, -4, 8, -12); c.quadraticCurveTo(13, -2, 0, 6);
      fill(c, a);
      c.beginPath(); c.ellipse(0, 3, 5, 7, 0, 0, TAU); fill(c, b);
      c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(-3, 13, -5, 14);
      c.moveTo(0, 8); c.quadraticCurveTo(3, 13, 5, 14); stroke(c, a, 2.2);
      disc(c, 0, -4, 2.6, b); },
  mammal: (c, t, a, b) => { c.beginPath(); c.ellipse(-1, 2, 9, 5.5, 0, 0, TAU); fill(c, a);
      disc(c, 7, -3, 4.4, a);
      c.beginPath(); c.moveTo(5, -6); c.lineTo(5, -10); c.lineTo(8, -7); c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(9, -6); c.lineTo(10, -10); c.lineTo(11, -6); c.closePath(); fill(c, b);
      disc(c, 8.6, -3, 1, "#0b0a12");
      for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(-5 + i * 8, 7); c.lineTo(-5 + i * 8, 11); stroke(c, a, 2.4); }
      c.beginPath(); c.moveTo(-9, 1); c.quadraticCurveTo(-14, -2, -12, -5); stroke(c, b, 2); },
  horse: (c, t, a, b) => { c.beginPath(); c.ellipse(-2, 1, 9, 5.5, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(5, -1); c.quadraticCurveTo(10, -6, 8, -11); stroke(c, a, 4);
      disc(c, 8, -11, 3.2, a);
      c.beginPath(); c.moveTo(6, -13); c.lineTo(6.5, -16); c.lineTo(8, -13); c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(4, -4); c.quadraticCurveTo(7, -12, 6, -14); stroke(c, b, 2.4);
      c.beginPath(); c.moveTo(-11, 0); c.quadraticCurveTo(-15, 4, -13, 9); stroke(c, b, 2.4);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-7 + i * 6, 5); c.lineTo(-7 + i * 6, 12); stroke(c, a, 2.2); } },
  wolf: (c, t, a, b) => { c.beginPath(); c.ellipse(-2, 2, 9, 5, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.moveTo(4, -1); c.lineTo(11, -4); c.lineTo(13, 1); c.lineTo(5, 3); c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(5, -3); c.lineTo(4, -9); c.lineTo(9, -5); c.closePath(); fill(c, b);
      disc(c, 9, -1, 1, "#ffd76a");
      c.beginPath(); c.moveTo(-10, 1); c.quadraticCurveTo(-15, -3, -13, -7); stroke(c, b, 2.6);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-7 + i * 6, 6); c.lineTo(-7 + i * 6, 12); stroke(c, a, 2); } },
  forest: (c, t, a, b) => { const tree3 = (x, y, s, col) => {
        c.beginPath(); c.rect(x - 1 * s, y, 2 * s, 5 * s); fill(c, "#4a3020");
        c.beginPath(); c.moveTo(x, y - 11 * s); c.lineTo(x + 5.5 * s, y + 1 * s); c.lineTo(x - 5.5 * s, y + 1 * s);
        c.closePath(); fill(c, col); };
      tree3(-8, 8, 0.85, a); tree3(8, 9, 0.75, a); tree3(0, 6, 1.05, b); },
  jungle: (c, t, a, b) => { c.beginPath(); c.rect(-14, -12, 28, 24); fill(c, a);
      for (let i = 0; i < 5; i++) { const x = -12 + i * 6;
        c.beginPath(); c.moveTo(x, 13); c.quadraticCurveTo(x + 2, 2, x - 1, -8); stroke(c, b, 2); }
      leaf(c, -8, -6, 6, -0.7, b); leaf(c, 7, -3, 7, 2.6, b); leaf(c, 0, 2, 6, 0.6, b); },

  // ---- people ----
  human: (c, t, a, b) => figure(c, 0, 3, 1.15, "#5c6b8a", a),
  farmer: (c, t, a, b) => figure(c, 0, 3, 1.1, "#6f9c5c", "#e8a87c", (x) => {
      x.beginPath(); x.moveTo(-9, -9); x.lineTo(9, -9); x.lineTo(0, -12); x.closePath(); x.fillStyle = a; x.fill();
      x.beginPath(); x.moveTo(7, -4); x.lineTo(7, 10); x.strokeStyle = "#6b4f31"; x.lineWidth = 1.6; x.stroke(); }),
  smith: (c, t, a, b) => figure(c, 0, 3, 1.1, a, "#e8a87c", (x) => {
      x.beginPath(); x.rect(-4, -3, 8, 9); x.fillStyle = "#4a3020"; x.fill();
      x.beginPath(); x.rect(6, -6, 6, 3); x.fillStyle = b; x.fill();
      x.beginPath(); x.rect(8, -3, 1.6, 7); x.fillStyle = "#6b4f31"; x.fill(); }),
  sailor: (c, t, a, b) => figure(c, 0, 3, 1.1, a, "#e8a87c", (x) => {
      x.beginPath(); x.rect(-5, -10, 10, 2.4); x.fillStyle = b; x.fill();
      x.beginPath(); x.moveTo(-4, -3); x.lineTo(4, -3); x.lineTo(0, 2); x.closePath(); x.fillStyle = b; x.fill(); }),
  knight: (c, t, a, b) => figure(c, 0, 3, 1.1, a, "#c4cad6", (x) => {
      x.beginPath(); x.rect(-4, -10.5, 8, 3); x.fillStyle = "#3a3f52"; x.fill();
      x.beginPath(); x.moveTo(-8, -2); x.lineTo(-8, 6); x.lineTo(-5, 9); x.lineTo(-2, 6); x.lineTo(-2, -2);
      x.closePath(); x.fillStyle = b; x.fill();
      x.beginPath(); x.rect(6, -8, 1.8, 16); x.fillStyle = b; x.fill(); }),
  wizard: (c, t, a, b) => figure(c, 0, 4, 1.1, a, "#e8c6a8", (x) => {
      x.beginPath(); x.moveTo(-6, -8); x.lineTo(6, -8); x.lineTo(0, -18); x.closePath(); x.fillStyle = a; x.fill();
      x.beginPath(); x.moveTo(8, -12); x.lineTo(6, 8); x.strokeStyle = "#6b4f31"; x.lineWidth = 1.8; x.stroke();
      x.beginPath(); x.arc(8, -13, 2.6, 0, TAU); x.fillStyle = b; x.fill(); }),
  pirate: (c, t, a, b) => figure(c, 0, 3, 1.1, a, "#e8a87c", (x) => {
      x.beginPath(); x.moveTo(-7, -9); x.lineTo(7, -9); x.quadraticCurveTo(0, -14, -7, -9); x.fillStyle = "#2a2433"; x.fill();
      x.beginPath(); x.moveTo(-4.4, -7.4); x.lineTo(0.6, -7.4); x.strokeStyle = "#2a2433"; x.lineWidth = 1.6; x.stroke();
      x.beginPath(); x.moveTo(6, -6); x.lineTo(9, 3); x.strokeStyle = b; x.lineWidth = 1.8; x.stroke(); }),
  astronaut: (c, t, a, b) => figure(c, 0, 3, 1.15, a, "#f4f8ff", (x) => {
      x.beginPath(); x.arc(0, -7.5, 5.2, 0, TAU); x.fillStyle = "rgba(255,255,255,0.9)"; x.fill();
      x.beginPath(); x.arc(0, -7.5, 3.6, 0, TAU); x.fillStyle = b; x.fill();
      x.beginPath(); x.rect(-6.5, -3, 3, 6); x.fillStyle = "#8b90ac"; x.fill(); }),
  scholar: (c, t, a, b) => figure(c, 0, 3, 1.1, a, "#e8c6a8", (x) => {
      x.beginPath(); x.moveTo(-7, -9.5); x.lineTo(7, -9.5); x.lineTo(0, -12.5); x.closePath(); x.fillStyle = "#2a2433"; x.fill();
      x.beginPath(); x.rect(-9, 9, 2, 5); x.fillStyle = b; x.fill();
      x.beginPath(); x.rect(-5, -2, 7, 5); x.fillStyle = b; x.fill(); }),

  // ---- magic ----
  magic: (c, t, a, b) => { for (let i = 0; i < 3; i++) { const an = t * 0.7 + (i / 3) * TAU;
        c.save(); c.rotate(an); c.beginPath(); c.ellipse(0, 0, 12, 4.4, 0, 0, TAU); stroke(c, a, 2); c.restore(); }
      disc(c, 0, 0, 4.4, b); sparkle(c, 8, -8, 4, b); },
  spell: (c, t, a, b) => { c.beginPath(); c.rect(-9, -10, 18, 20); fill(c, a);
      c.beginPath(); c.rect(-6.5, -7.5, 13, 15); fill(c, "#1a1230");
      star(c, 0, 0, 6, 0.45, 5, b); sparkle(c, 8, -11, 3.4, b); },
  potion: (c, t, a, b) => { flask(c, 0, 0, 1.05, "rgba(220,240,255,0.35)", a);
      for (let i = 0; i < 3; i++) disc(c, -3 + i * 3, 5 - ((t * 12 + i * 5) % 9), 1.2, b); },
  curse: (c, t, a, b) => { c.beginPath(); c.arc(0, -1, 8, Math.PI * 0.15, Math.PI * 0.85, true); fill(c, b);
      c.beginPath(); c.rect(-8, -1, 16, 5); fill(c, b);
      c.beginPath(); c.moveTo(-8, 4); c.lineTo(-4, 10); c.lineTo(0, 4); c.lineTo(4, 10); c.lineTo(8, 4);
      c.closePath(); fill(c, b);
      disc(c, -3.4, -2, 1.8, a); disc(c, 3.4, -2, 1.8, a); },
  death: (c, t, a, b) => { c.beginPath(); c.arc(0, -3, 8, Math.PI, 0); c.rect(-8, -3, 16, 6); fill(c, b);
      c.beginPath(); c.moveTo(-5, 3); c.lineTo(-3, 9); c.lineTo(0, 3); c.lineTo(3, 9); c.lineTo(5, 3);
      c.closePath(); fill(c, b);
      disc(c, -3.4, -3, 2.2, a); disc(c, 3.4, -3, 2.2, a);
      c.beginPath(); c.moveTo(-1.6, 1); c.lineTo(0, -1); c.lineTo(1.6, 1); c.closePath(); fill(c, a); },
  ghost: (c, t, a, b) => { const w = Math.sin(t * 2) * 1.2;
      c.beginPath();
      c.moveTo(-8, 10); c.lineTo(-8, -2); c.quadraticCurveTo(-8, -11, 0, -11);
      c.quadraticCurveTo(8, -11, 8, -2); c.lineTo(8, 10);
      c.lineTo(4, 6 + w); c.lineTo(0, 10); c.lineTo(-4, 6 - w);
      c.closePath(); fill(c, b);
      disc(c, -3, -4, 1.8, a); disc(c, 3, -4, 1.8, a); },
  soul: (c, t, a, b) => { const g = c.createRadialGradient(0, 0, 1, 0, 0, 12);
      g.addColorStop(0, b); g.addColorStop(1, "rgba(124,240,208,0)");
      c.beginPath(); c.arc(0, 0, 12, 0, TAU); fill(c, g);
      c.beginPath(); c.moveTo(0, -9); c.quadraticCurveTo(6, -2, 3, 5); c.quadraticCurveTo(0, 10, -3, 5);
      c.quadraticCurveTo(-6, -2, 0, -9); fill(c, a); },
  golem: (c, t, a, b) => { c.beginPath(); c.rect(-8, -4, 16, 12); fill(c, a);
      c.beginPath(); c.rect(-6, -11, 12, 7); fill(c, b);
      disc(c, -2.6, -8, 1.4, "#ff5470"); disc(c, 2.6, -8, 1.4, "#ff5470");
      c.beginPath(); c.rect(-12, -3, 4, 9); fill(c, a);
      c.beginPath(); c.rect(8, -3, 4, 9); fill(c, a);
      c.beginPath(); c.rect(-6, 8, 4, 5); fill(c, b);
      c.beginPath(); c.rect(2, 8, 4, 5); fill(c, b); },
  philosopher: (c, t, a, b) => figure(c, 0, 4, 1.1, a, "#e8c6a8", (x) => {
      x.beginPath(); x.arc(0, -8, 5, Math.PI, 0); x.fillStyle = b; x.fill();
      x.beginPath(); x.moveTo(-3, -4); x.quadraticCurveTo(0, 3, 3, -4); x.fillStyle = "#e8e0d0"; x.fill();
      x.beginPath(); x.arc(0, 0, 9, -0.6, 0.6); x.strokeStyle = b; x.lineWidth = 1.4; x.stroke(); }),
  gold: (c, t, a, b) => { for (let i = 0; i < 3; i++) {
        c.beginPath(); c.ellipse(-5 + i * 5, 7 - i * 0.5, 7, 2.6, 0, 0, TAU); fill(c, a); }
      c.beginPath(); c.ellipse(0, -1, 7.5, 3, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.ellipse(0, -2, 7.5, 3, 0, 0, TAU); fill(c, b);
      sparkle(c, 8, -8, 3.4, b); },
  philosophers_stone: (c, t, a, b) => { c.beginPath();
      c.moveTo(0, -12); c.lineTo(10, -4); c.lineTo(6, 10); c.lineTo(-6, 10); c.lineTo(-10, -4);
      c.closePath(); fill(c, a);
      c.beginPath(); c.moveTo(0, -12); c.lineTo(-10, -4); c.lineTo(0, 1); c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(0, -12); c.lineTo(10, -4); c.lineTo(0, 1); c.closePath(); fill(c, "rgba(255,255,255,0.3)");
      sparkle(c, -9, -10, 3, b); },
  elixir: (c, t, a, b) => { flask(c, 0, 0, 1.1, "rgba(230,255,245,0.4)", a);
      sparkle(c, 8, -9, 3.6, b); sparkle(c, -8, -3, 2.6, b);
      for (let i = 0; i < 3; i++) disc(c, -3 + i * 3, 5 - ((t * 10 + i * 4) % 9), 1.1, b); },
  immortality: (c, t, a, b) => { c.save(); c.rotate(t * 0.25);
      ring(c, 0, 0, 11, a, 3.2);
      c.beginPath(); c.moveTo(11, 0); c.lineTo(7, -3.4); c.lineTo(7, 3.4); c.closePath(); fill(c, a);
      c.restore();
      c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(5, 0, 2.5, 4); c.quadraticCurveTo(0, 8, -2.5, 4);
      c.quadraticCurveTo(-5, 0, 0, -6); fill(c, b); },

  // ---- civilisation ----
  village: (c, t, a, b) => { tower(c, -7, 11, 10, 7, a, "pitch", b);
      tower(c, 6, 11, 11, 9, a, "pitch", b);
      c.beginPath(); c.rect(-14, 11, 28, 2.4); fill(c, "#4a3a2a"); },
  city: (c, t, a, b) => { tower(c, -9, 12, 8, 13, "#5c6470", "flat", a);
      tower(c, 0, 12, 9, 20, "#6b7280", "flat", a);
      tower(c, 9, 12, 8, 16, "#5c6470", "flat", a);
      for (let i = 0; i < 8; i++) { c.beginPath();
        c.rect(-11 + (i % 4) * 6, -5 + Math.floor(i / 4) * 6, 2.4, 2.4); fill(c, b); } },
  castle: (c, t, a, b) => { tower(c, -9, 12, 8, 14, a, "battlement", b);
      tower(c, 9, 12, 8, 14, a, "battlement", b);
      tower(c, 0, 12, 12, 10, b, "battlement", a);
      c.beginPath(); c.moveTo(-3, 12); c.lineTo(-3, 5); c.arc(0, 5, 3, Math.PI, 0); c.lineTo(3, 12);
      c.closePath(); fill(c, "#3a2a1a"); },
  kingdom: (c, t, a, b) => { c.beginPath();
      c.moveTo(-11, 2); c.lineTo(-11, -8); c.lineTo(-5.5, -2); c.lineTo(0, -11); c.lineTo(5.5, -2);
      c.lineTo(11, -8); c.lineTo(11, 2); c.closePath(); fill(c, a);
      c.beginPath(); c.rect(-11, 2, 22, 4); fill(c, b);
      disc(c, -11, -9, 2, b); disc(c, 0, -12.5, 2.2, b); disc(c, 11, -9, 2, b);
      disc(c, -5, 0, 1.6, b); disc(c, 5, 0, 1.6, b); },
  empire: (c, t, a, b) => { disc(c, 0, 1, 10, a);
      c.beginPath(); c.ellipse(0, 1, 10, 4, 0, 0, TAU); stroke(c, b, 1.6);
      c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 11); stroke(c, b, 1.6);
      c.beginPath(); c.rect(-1.6, -16, 3.2, 7); fill(c, b);
      c.beginPath(); c.rect(-5, -13.5, 10, 2.6); fill(c, b); },
  war: (c, t, a, b) => { c.save(); c.rotate(-0.7);
      c.beginPath(); c.rect(-1.6, -13, 3.2, 26); fill(c, a);
      c.beginPath(); c.rect(-7, -3, 14, 3); fill(c, b); c.restore();
      c.save(); c.rotate(0.7);
      c.beginPath(); c.rect(-1.6, -13, 3.2, 26); fill(c, a);
      c.beginPath(); c.rect(-7, -3, 14, 3); fill(c, b); c.restore(); },
  peace: (c, t, a, b) => { c.beginPath();
      c.moveTo(-9, 3); c.quadraticCurveTo(-2, -6, 7, -3); c.quadraticCurveTo(0, 1, -9, 3); fill(c, b);
      c.beginPath(); c.ellipse(-1, 5, 8, 4.4, -0.2, 0, TAU); fill(c, b);
      c.beginPath(); c.moveTo(7, 3); c.lineTo(12, 1); c.lineTo(7, 7); c.closePath(); fill(c, b);
      leaf(c, -9, 6, 5, 2.5, a); },
  history: (c, t, a, b) => { c.beginPath();
      c.moveTo(-11, -8); c.lineTo(11, -8); c.lineTo(11, 8); c.lineTo(-11, 8); c.closePath(); fill(c, b);
      c.beginPath(); c.ellipse(-11, 0, 3, 8, 0, 0, TAU); fill(c, a);
      c.beginPath(); c.ellipse(11, 0, 3, 8, 0, 0, TAU); fill(c, a);
      for (let i = 0; i < 4; i++) { c.beginPath();
        c.moveTo(-7, -4 + i * 3); c.lineTo(6, -4 + i * 3); stroke(c, a, 1.2); } },
  library: (c, t, a, b) => { for (let i = 0; i < 5; i++) { c.beginPath();
        c.rect(-11 + i * 4.6, -10 + (i % 2) * 1.5, 3.6, 13 - (i % 2) * 1.5); fill(c, i % 2 ? b : a); }
      c.beginPath(); c.rect(-13, 3, 26, 3); fill(c, "#4a3020");
      for (let i = 0; i < 3; i++) { c.beginPath(); c.rect(-8 + i * 6, 6, 5, 6); fill(c, i % 2 ? a : b); } },
  university: (c, t, a, b) => { c.beginPath(); c.rect(-12, 2, 24, 9); fill(c, a);
      c.beginPath(); c.moveTo(-13, 2); c.lineTo(0, -7); c.lineTo(13, 2); c.closePath(); fill(c, b);
      for (let i = 0; i < 4; i++) { c.beginPath(); c.rect(-9 + i * 5.4, 3.5, 2.6, 7.5); fill(c, b); }
      c.beginPath(); c.rect(-14, 11, 28, 2.4); fill(c, b); },
  science: (c, t, a, b) => { ring(c, 0, 0, 3, a, 2);
      for (let i = 0; i < 3; i++) { c.save(); c.rotate((i / 3) * Math.PI);
        c.beginPath(); c.ellipse(0, 0, 12, 4.6, 0, 0, TAU); stroke(c, b, 1.8); c.restore(); }
      disc(c, 0, 0, 2.6, b); },
  machine: (c, t, a, b) => { c.save(); c.rotate(t * 0.4); gearShape(c, -4, -2, 8.5, 8, a, b); c.restore();
      c.save(); c.rotate(-t * 0.5); gearShape(c, 6, 5, 6.5, 7, b, a); c.restore(); },
  computer: (c, t, a, b) => { c.beginPath(); c.rect(-11, -9, 22, 15); fill(c, a);
      c.beginPath(); c.rect(-8.5, -6.5, 17, 10); fill(c, "#0b1a22");
      for (let i = 0; i < 3; i++) { c.beginPath();
        c.moveTo(-6, -4 + i * 3); c.lineTo(-6 + (i === 1 ? 11 : 7), -4 + i * 3); stroke(c, b, 1.4); }
      c.beginPath(); c.rect(-6, 6, 12, 2.4); fill(c, a);
      c.beginPath(); c.rect(-10, 8.4, 20, 3); fill(c, a); },
  network: (c, t, a, b) => { const pts = [[0, -10], [-10, -2], [10, -2], [-6, 9], [6, 9]];
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        c.beginPath(); c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[j][0], pts[j][1]); stroke(c, a, 1.1); }
      for (const [x, y] of pts) disc(c, x, y, 3, b); },
  ai: (c, t, a, b) => { c.beginPath();
      c.moveTo(-9, -6); c.quadraticCurveTo(-9, -11, -3, -11); c.lineTo(6, -11);
      c.quadraticCurveTo(11, -11, 11, -5); c.quadraticCurveTo(11, 1, 5, 1); c.lineTo(-2, 1);
      c.quadraticCurveTo(-9, 1, -9, -6); fill(c, a);
      c.beginPath(); c.moveTo(-4, 1); c.lineTo(-6, 7); c.lineTo(0, 2); c.closePath(); fill(c, a);
      const pts = [[-4, -8], [3, -8], [-1, -4], [6, -4], [1, -1]];
      for (let i = 0; i < pts.length - 1; i++) { c.beginPath();
        c.moveTo(pts[i][0], pts[i][1]); c.lineTo(pts[i + 1][0], pts[i + 1][1]); stroke(c, b, 1.2); }
      for (const [x, y] of pts) disc(c, x, y, 1.7, b); },

  // ---- cosmic ----
  satellite: (c, t, a, b) => { c.beginPath(); c.rect(-4, -5, 8, 10); fill(c, a);
      c.beginPath(); c.rect(-13, -3.5, 8, 7); fill(c, b);
      c.beginPath(); c.rect(5, -3.5, 8, 7); fill(c, b);
      for (let i = 0; i < 2; i++) { c.beginPath();
        c.moveTo(-13 + i * 4, -3.5); c.lineTo(-13 + i * 4, 3.5); stroke(c, a, 1);
        c.beginPath(); c.moveTo(5 + i * 4, -3.5); c.lineTo(5 + i * 4, 3.5); stroke(c, a, 1); }
      c.beginPath(); c.arc(0, -9, 4, Math.PI, 0); stroke(c, b, 2); },
  colony: (c, t, a, b) => { c.beginPath(); c.arc(0, 6, 10, Math.PI, 0); fill(c, "rgba(160,220,255,0.28)");
      c.beginPath(); c.arc(0, 6, 10, Math.PI, 0); stroke(c, a, 1.8);
      tower(c, -4, 6, 5, 6, b, "flat", a);
      tower(c, 4, 6, 4, 9, b, "flat", a);
      c.beginPath(); c.rect(-13, 6, 26, 3); fill(c, "#6b6260"); },
  galaxy: (c, t, a, b) => { c.save(); c.rotate(t * 0.15);
      for (let arm = 0; arm < 2; arm++) { c.save(); c.rotate(arm * Math.PI);
        c.beginPath();
        for (let i = 0; i < 26; i++) { const r = i * 0.5, an = i * 0.25;
          const x = Math.cos(an) * r, y = Math.sin(an) * r * 0.55;
          i ? c.lineTo(x, y) : c.moveTo(x, y); }
        stroke(c, b, 2.4); c.restore(); }
      disc(c, 0, 0, 4, "#fff0c0"); c.restore();
      for (let i = 0; i < 5; i++) disc(c, Math.cos(i * 2.3) * 12, Math.sin(i * 1.7) * 9, 0.9, b); },
  universe: (c, t, a, b) => { c.beginPath(); c.arc(0, 0, 13, 0, TAU); fill(c, "#0d0620");
      for (let i = 0; i < 18; i++) { const an = i * 2.399, r = 2 + (i % 6) * 2;
        disc(c, Math.cos(an) * r, Math.sin(an) * r, 0.8 + (i % 3) * 0.35, i % 4 ? b : "#ffffff"); }
      c.save(); c.rotate(-0.5); c.beginPath(); c.ellipse(0, 0, 12, 4, 0, 0, TAU); stroke(c, b, 1.4); c.restore(); },
  black_hole: (c, t, a, b) => { c.save(); c.rotate(t * 0.5);
      c.beginPath(); c.ellipse(0, 0, 13, 4.4, 0, 0, TAU); stroke(c, b, 3); c.restore();
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 9);
      g.addColorStop(0, "#000000"); g.addColorStop(0.75, "#000000"); g.addColorStop(1, b);
      c.beginPath(); c.arc(0, 0, 9, 0, TAU); fill(c, g); },
  singularity: (c, t, a, b) => { for (let i = 6; i > 0; i--) {
        c.beginPath(); c.arc(0, 0, i * 2.1, 0, TAU); stroke(c, `rgba(92,230,255,${0.1 + i * 0.06})`, 1.4); }
      disc(c, 0, 0, 2.6, "#ffffff");
      for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU + t;
        c.beginPath(); c.moveTo(Math.cos(an) * 13, Math.sin(an) * 13);
        c.lineTo(Math.cos(an) * 5, Math.sin(an) * 5); stroke(c, b, 1.2); } },
  creation: (c, t, a, b) => { const g = c.createRadialGradient(0, 0, 1, 0, 0, 13);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, a); g.addColorStop(1, "rgba(124,240,208,0)");
      c.beginPath(); c.arc(0, 0, 13, 0, TAU); fill(c, g);
      for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU + t * 0.3;
        c.beginPath(); c.moveTo(Math.cos(an) * 5, Math.sin(an) * 5);
        c.lineTo(Math.cos(an) * 13, Math.sin(an) * 13); stroke(c, b, 1.6); }
      disc(c, 0, 0, 3.4, "#ffffff"); },
  legend: (c, t, a, b) => { c.beginPath();
      c.moveTo(-8, -10); c.lineTo(8, -10); c.lineTo(8, 6); c.lineTo(0, 13); c.lineTo(-8, 6);
      c.closePath(); fill(c, a);
      star(c, 0, -2, 6, 0.42, 5, b);
      c.beginPath(); c.rect(-9.5, -12, 19, 3); fill(c, b); },
  myth: (c, t, a, b) => { c.beginPath();
      c.moveTo(-11, -6); c.lineTo(-2, -6); c.lineTo(-2, -12); c.lineTo(11, -3);
      c.lineTo(-2, 6); c.lineTo(-2, 0); c.lineTo(-11, 0); c.closePath(); fill(c, "rgba(0,0,0,0)");
      c.beginPath(); c.arc(0, 0, 11, 0.5, 5.2); stroke(c, a, 2.6);
      for (let i = 0; i < 5; i++) { const an = 0.9 + i * 0.9;
        disc(c, Math.cos(an) * 11, Math.sin(an) * 11, 1.8, b); }
      star(c, 0, 0, 5.5, 0.42, 5, b); },
  alchemy: (c, t, a, b) => { c.save(); c.rotate(t * 0.2);
      ring(c, 0, 0, 12, a, 2);
      for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU;
        c.beginPath(); c.moveTo(Math.cos(an) * 12, Math.sin(an) * 12);
        c.lineTo(Math.cos(an + 1.57) * 12, Math.sin(an + 1.57) * 12); stroke(c, a, 1.4); }
      c.restore();
      c.beginPath(); c.moveTo(0, -7); c.lineTo(6, 4); c.lineTo(-6, 4); c.closePath(); fill(c, b);
      c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); stroke(c, a, 1.6); },
};

/**
 * Draws element `id` centred on the origin. Falls back to a lettered disc
 * for anything without art, so a new recipe never renders as nothing.
 */
export function drawElement(ctx, id, t = 0) {
  const [a, b] = PALETTE[id] || ["#8b90ac", "#dfe6f2"];
  const fn = ART[id];
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (fn) fn(ctx, t, a, b);
  else {
    disc(ctx, 0, 0, 11, a);
    ctx.fillStyle = b;
    ctx.font = "800 13px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText((id[0] || "?").toUpperCase(), 0, 5);
  }
  ctx.restore();
}

export function ringColor(id) { return (PALETTE[id] || ["#8b90ac"])[0]; }
export function inkColor(id) { return (PALETTE[id] || ["#8b90ac", "#dfe6f2"])[1]; }

export default { ART, PALETTE, drawElement, ringColor, inkColor };
