// ==========================================================================
// Dragonheart — the world: generating a region and drawing it.
//
// A region is a 72 × 46 tile map built from its own seed, so it is the same
// place on every visit. The shape is always readable: a winding road runs
// west to east from the waystone to the boss arena, clearings hang off it
// with monster camps and chests, and the rest is forest, rock and water.
// Greenvale also holds the village: the shop, the smith, the elder and the
// healing fountain.
//
// Drawing: ground tiles are painted once into small textures at the current
// screen scale (so they stay sharp at any zoom) and stamped every frame;
// trees and other tall props are drawn in depth order with the characters,
// so you walk behind a trunk rather than over it.
// ==========================================================================
import { REGIONS } from "./dhData.js";

export const T = 32;
export const MW = 72, MH = 46;
const G_GRASS = 0, G_PATH = 1, G_LIQUID = 2, G_WALL = 3, G_ARENA = 4, G_PLAZA = 5;

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
}

/** Smooth value noise on a coarse lattice. */
function noiseField(rng, w, h, cell) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rng());
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = sm(fx - ix), ty = sm(fy - iy);
    const v = (a, b) => g[(iy + b) * gw + ix + a];
    return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty;
  };
}

export class World {
  constructor(regionIndex) {
    this.ri = regionIndex;
    this.region = REGIONS[regionIndex];
    this.ground = new Uint8Array(MW * MH);
    this.variant = new Uint8Array(MW * MH);
    this.props = [];
    this.decor = [];
    this.spawns = [];
    this.chests = [];
    this.npcs = [];
    this._generate();
    this._index();
    const hexA = (h, a) => { const v = parseInt(h.slice(1), 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; };
    this.patches = Array.from({ length: 170 }, () => {
      const c = this.region.ground[1 + ((this.rng() * 2) | 0)];
      return { x: this.rng() * MW * T, y: this.rng() * MH * T, r: 50 + this.rng() * 110, c: hexA(c, 0.75), c0: hexA(c, 0) };
    });
  }

  g(x, y) { return x < 0 || y < 0 || x >= MW || y >= MH ? G_WALL : this.ground[y * MW + x]; }
  setG(x, y, v) { if (x >= 0 && y >= 0 && x < MW && y < MH) this.ground[y * MW + x] = v; }

  _generate() {
    const R = this.region, rng = rngFrom(9173 + this.ri * 7919);
    this.rng = rng;
    const n1 = noiseField(rng, MW, MH, 7), n2 = noiseField(rng, MW, MH, 4), n3 = noiseField(rng, MW, MH, 11);
    for (let i = 0; i < MW * MH; i++) this.variant[i] = (rng() * 3) | 0;

    // Base: grass, liquid where the slow noise dips, a thick edge of wall.
    const midY = MH / 2;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      let v = G_GRASS;
      const edge = Math.min(x, y, MW - 1 - x, MH - 1 - y);
      if (edge < 2 || (edge < 4 && n2(x, y) > 0.55)) v = G_WALL;
      else if (n3(x, y) > 0.66) v = G_LIQUID;
      this.setG(x, y, v);
    }

    // The road: a wandering walk from the waystone in the west to the arena.
    const arena = { tx: MW - 10, ty: Math.round(midY), r: 7.5 };
    this.arena = { x: (arena.tx + 0.5) * T, y: (arena.ty + 0.5) * T, r: arena.r * T };
    let px = 3, py = Math.round(midY), dyDrift = 0;
    const road = [];
    while (px < arena.tx) {
      road.push([px, py]);
      if (rng() < 0.7) px++;
      else { dyDrift = rng() < 0.5 ? -1 : 1; }
      if (rng() < 0.35) py = Math.max(6, Math.min(MH - 7, py + dyDrift));
      if (Math.abs(py - midY) > 12) py += py > midY ? -1 : 1;
    }
    for (const [x, y] of road) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.setG(x + dx, y + dy, G_PATH);
      // Keep the road's shoulders walkable.
      for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (this.g(x + dx, y + dy) === G_LIQUID || (this.g(x + dx, y + dy) === G_WALL && Math.min(x + dx, y + dy, MW - 1 - x - dx, MH - 1 - y - dy) >= 2)) this.setG(x + dx, y + dy, G_GRASS);
      }
    }
    this.road = road;

    // Arena: a ring of worn stone.
    for (let y = arena.ty - 9; y <= arena.ty + 9; y++) for (let x = arena.tx - 9; x <= arena.tx + 9; x++) {
      const d = Math.hypot(x - arena.tx, y - arena.ty);
      if (d <= arena.r) this.setG(x, y, G_ARENA);
      else if (d <= arena.r + 1.5 && this.g(x, y) !== G_PATH) this.setG(x, y, G_GRASS);
    }

    // Clearings along the road for camps and chests.
    const clearings = [];
    const startX = R.village ? 26 : 12;
    for (let k = 0; k < 6; k++) {
      const [rx, ry] = road[Math.min(road.length - 1, Math.floor(startX + (k + 0.5) * (road.length - startX) / 6.5))] || [30, midY];
      const side = rng() < 0.5 ? -1 : 1;
      const cx = rx + Math.round(rng() * 4 - 2), cy = Math.max(7, Math.min(MH - 8, ry + side * (5 + Math.round(rng() * 5))));
      const rad = 3.5 + rng() * 2;
      for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) {
        if (Math.hypot(x - cx, y - cy) <= rad && this.g(x, y) !== G_PATH && Math.min(x, y, MW - 1 - x, MH - 1 - y) >= 2) this.setG(x, y, G_GRASS);
      }
      clearings.push({ tx: cx, ty: cy, r: rad });
    }
    this.clearings = clearings;

    // The village: a plaza with houses round it.
    if (R.village) this._village();

    // Waystone at the start of the road.
    this.stone = { x: 4.5 * T, y: (road[0][1] - 1.5) * T };
    this.entry = { x: 4.5 * T, y: (road[0][1] + 0.5) * T };

    // Props: trees on the wall band and scattered through the grass by noise.
    const occupied = new Set();
    const clearOf = (x, y) => this.g(x, y) === G_GRASS && !occupied.has(y * MW + x)
      && Math.hypot((x + 0.5) * T - this.arena.x, (y + 0.5) * T - this.arena.y) > this.arena.r + T * 1.5
      && !(R.village && x < 24 && Math.abs(y - midY) < 10)
      && Math.hypot(x - 4, y - road[0][1]) > 4;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = this.g(x, y);
      if (t === G_WALL && rng() < 0.75) {
        this.props.push(this._prop(R.tree, (x + 0.5 + (rng() - 0.5) * 0.6) * T, (y + 0.7 + (rng() - 0.5) * 0.4) * T, false));
        continue;
      }
      if (!clearOf(x, y)) continue;
      const nearClearing = clearings.some(c => Math.hypot(x - c.tx, y - c.ty) < c.r + 1);
      if (nearClearing) continue;
      if (n1(x, y) > 0.58 && rng() < 0.55) {
        this.props.push(this._prop(R.tree, (x + 0.5) * T + (rng() - 0.5) * 12, (y + 0.7) * T, true));
        occupied.add(y * MW + x);
      } else if (rng() < 0.05) {
        const kind = R.props[(rng() * R.props.length) | 0];
        const p = this._prop(kind, (x + 0.5) * T + (rng() - 0.5) * 10, (y + 0.6) * T, true);
        (p.solid || p.tall ? this.props : this.decor).push(p);
        occupied.add(y * MW + x);
      } else if (rng() < 0.06) {
        this.decor.push(this._prop(R.props[0] === "flower" ? "flower" : "tuft", (x + rng()) * T, (y + rng()) * T, false));
      }
    }

    // Camps: each clearing gets a pack of monsters and maybe a chest.
    clearings.forEach((c, i) => {
      const n = 2 + ((rng() * 3) | 0) + (this.ri > 2 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2, d = rng() * (c.r - 1) * T;
        this.spawns.push({ x: (c.tx + 0.5) * T + Math.cos(a) * d, y: (c.ty + 0.5) * T + Math.sin(a) * d });
      }
      if (i % 2 === 0 || rng() < 0.3) this.chests.push({ x: (c.tx + 0.5) * T, y: (c.ty + 0.5) * T, id: `${this.region.id}-${i}` });
    });
    // Stragglers along the road.
    for (let k = startX + 6; k < road.length - 12; k += 7 + ((rng() * 5) | 0)) {
      const [x, y] = road[k];
      this.spawns.push({ x: (x + 0.5) * T + (rng() - 0.5) * 60, y: (y + 0.5) * T + (rng() - 0.5) * 60 });
    }
    // Breakable bushes / pots near the road: a little gold and the odd heart.
    for (let k = 8; k < road.length - 8; k += 5) {
      if (rng() < 0.45) {
        const [x, y] = road[k];
        const side = rng() < 0.5 ? -2 : 2;
        if (this.g(x, y + side) === G_GRASS) {
          const p = this._prop(this.ri >= 2 ? "pot" : "shrub", (x + 0.5) * T, (y + side + 0.6) * T, true);
          p.breakable = true;
          this.props.push(p);
        }
      }
    }
    this.props.push(Object.assign(this._prop("waystone", this.stone.x, this.stone.y, true), { waystone: true }));
  }

  _village() {
    const cy = Math.round(MH / 2);
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = 6; x <= 20; x++) {
      if (Math.min(x, y) >= 2 && this.g(x, y) !== G_PATH) this.setG(x, y, Math.abs(y - cy) <= 3 && x >= 8 && x <= 18 ? G_PLAZA : G_GRASS);
    }
    const H = (x, y, roof, kind) => this.props.push(Object.assign(this._prop("house", x * T, y * T, true), { roof, kind }));
    H(9, cy - 4.2, "#c0503a", "home"); H(14, cy - 4.4, "#3a6ac0", "shop"); H(19, cy - 4.2, "#7a4ab0", "home");
    H(10.5, cy + 6.4, "#3a9a5a", "smith"); H(17, cy + 6.4, "#c08a3a", "home");
    this.fountain = { x: 13.5 * T, y: (cy + 0.6) * T };
    this.props.push(Object.assign(this._prop("fountain", this.fountain.x, this.fountain.y, true), { fountain: true }));
    this.npcs.push({ id: "shop", name: "Mira the Merchant", x: 14 * T, y: (cy - 2.2) * T, color: "#3a6ac0", hair: "#5a3a20" });
    this.npcs.push({ id: "smith", name: "Bram the Smith", x: 10.5 * T, y: (cy + 4.3) * T, color: "#3a9a5a", hair: "#2a1a10" });
    this.npcs.push({ id: "elder", name: "Elder Rowan", x: 17.5 * T, y: (cy + 1.2) * T, color: "#8a6ac0", hair: "#e8e8e8" });
    for (const n of this.npcs) this.props.push({ type: "npcblock", x: n.x, y: n.y, r: 11, solid: true, invisible: true });
  }

  _prop(type, x, y, solid) {
    const big = { oak: 15, pine: 13, dead: 11, snowpine: 13, charred: 11, crystal: 13, rock: 13, pillar: 13, house: 46, fountain: 30, waystone: 13, iceshard: 11, obsidian: 13, vent: 12, shrub: 12, pot: 10, bush: 12, snowbush: 12, mushroom: 9 };
    const tall = ["oak", "pine", "dead", "snowpine", "charred", "crystal", "pillar", "house", "waystone", "iceshard", "obsidian"].includes(type);
    const isSolid = solid && big[type] !== undefined;
    return { type, x, y, r: big[type] || 0, solid: isSolid, tall, seed: (x * 31 + y * 17) | 0 };
  }

  /** Spatial index of solid props for collision. */
  _index() {
    this.cells = new Map();
    for (const p of this.props) {
      if (!p.solid) continue;
      const k = Math.floor(p.x / T) + Math.floor(p.y / T) * MW;
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(p);
    }
  }

  removeProp(p) {
    p.gone = true; p.solid = false;
    const k = Math.floor(p.x / T) + Math.floor(p.y / T) * MW;
    const a = this.cells.get(k);
    if (a) this.cells.set(k, a.filter(q => q !== p));
  }

  /** Tile blocks movement? Liquids block walkers; flyers ignore them. */
  blocked(px, py, flying = false) {
    const t = this.g(Math.floor(px / T), Math.floor(py / T));
    if (t === G_WALL) return true;
    if (t === G_LIQUID && !flying && this.region.water !== "ice") return true;
    return false;
  }
  onLiquid(px, py) { return this.g(Math.floor(px / T), Math.floor(py / T)) === G_LIQUID; }

  /**
   * Moves a circle through the world, sliding along walls and props.
   * Returns the corrected position.
   */
  slide(x, y, nx, ny, r, flying = false) {
    const free = (cx, cy) => {
      for (const [ox, oy] of [[-r, 0], [r, 0], [0, -r], [0, r], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, r * 0.7]]) {
        if (this.blocked(cx + ox, cy + oy, flying)) return false;
      }
      return true;
    };
    let ox = x, oy = y;
    if (free(nx, oy)) ox = nx;
    if (free(ox, ny)) oy = ny;
    if (!flying) {
      // Push out of solid props.
      const tx = Math.floor(ox / T), ty = Math.floor(oy / T);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const list = this.cells.get(tx + dx + (ty + dy) * MW);
        if (!list) continue;
        for (const p of list) {
          const pr = p.r * (p.type === "house" ? 0.75 : 0.55);
          const ddx = ox - p.x, ddy = oy - (p.y - (p.type === "house" ? 10 : 0)), d = Math.hypot(ddx, ddy);
          const min = pr + r;
          if (d < min && d > 0.001) {
            const px2 = p.x + (ddx / d) * min, py2 = (p.y - (p.type === "house" ? 10 : 0)) + (ddy / d) * min;
            if (free(px2, py2)) { ox = px2; oy = py2; }
          }
        }
      }
    }
    return { x: ox, y: oy };
  }

  /** A walkable point near (x, y), for spawning. */
  walkableNear(x, y) {
    for (let k = 0; k < 40; k++) {
      const a = k * 2.4, d = k * 6;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (!this.blocked(px, py) && !this.blocked(px + 12, py) && !this.blocked(px - 12, py)) return { x: px, y: py };
    }
    return { x, y };
  }

  // ---------------------------------------------------------------- draw --
  /** Tile textures at the current pixel scale, built on demand. */
  _tex(kind, v, px) {
    if (!this.texCache || this.texPx !== px) { this.texCache = new Map(); this.texPx = px; }
    const key = kind * 4 + v;
    let c = this.texCache.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = px;
    const g = c.getContext("2d");
    const R = this.region;
    const k = px / T;
    g.scale(k, k);
    const rng = rngFrom(1000 + kind * 37 + v * 11 + this.ri);
    if (kind === G_GRASS || kind === G_WALL) {
      // One base colour for every tile — variation comes from the soft
      // patches drawn over the top, so the ground never reads as a grid.
      g.fillStyle = R.ground[0]; g.fillRect(0, 0, T, T);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = rng() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
        const x = rng() * T, y = rng() * T;
        g.fillRect(x, y, 1.5, 3 + rng() * 3);
      }
      if (kind === G_WALL) { g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(0, 0, T, T); }
    } else if (kind === G_PATH || kind === G_PLAZA) {
      g.fillStyle = R.ground[0]; g.fillRect(0, 0, T, T);
      g.fillStyle = kind === G_PLAZA ? "#b9ad92" : R.path;
      g.fillRect(0, 0, T, T);
      if (kind === G_PLAZA) {
        g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 1;
        for (let y = 0; y <= T; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(T, y); g.stroke(); }
        for (let y = 0; y < T; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x <= T; x += 10) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
      } else {
        for (let i = 0; i < 9; i++) {
          g.fillStyle = rng() < 0.5 ? R.pathEdge : "rgba(255,255,255,0.12)";
          g.beginPath(); g.ellipse(rng() * T, rng() * T, 1.5 + rng() * 2, 1 + rng() * 1.5, 0, 0, 7); g.fill();
        }
      }
    } else if (kind === G_ARENA) {
      g.fillStyle = "#6b6a72"; g.fillRect(0, 0, T, T);
      g.strokeStyle = "rgba(0,0,0,0.16)"; g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, T - 1, T - 1);
      for (let i = 0; i < 6; i++) { g.fillStyle = rng() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)"; g.fillRect(rng() * T, rng() * T, 3, 2); }
    } else if (kind === G_LIQUID) {
      const [a, b] = R.liquid;
      const grd = g.createLinearGradient(0, 0, T, T);
      grd.addColorStop(0, a); grd.addColorStop(1, b);
      g.fillStyle = grd; g.fillRect(0, 0, T, T);
    }
    this.texCache.set(key, c);
    return c;
  }

  drawGround(ctx, view, pxPerUnit, time) {
    const x0 = Math.max(0, Math.floor(view.x0 / T)), x1 = Math.min(MW - 1, Math.ceil(view.x1 / T));
    const y0 = Math.max(0, Math.floor(view.y0 / T)), y1 = Math.min(MH - 1, Math.ceil(view.y1 / T));
    const px = Math.max(8, Math.ceil(T * pxPerUnit));
    const R = this.region;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = this.g(x, y);
      // Paths and plazas sit on grass with soft edges, so draw grass first.
      const base = t === G_PATH || t === G_PLAZA ? G_GRASS : t;
      ctx.drawImage(this._tex(base, this.variant[y * MW + x], px), x * T, y * T, T + 0.5, T + 0.5);
    }
    // Soft patches of lighter and darker ground.
    for (const pt of this.patches) {
      if (pt.x + pt.r < view.x0 || pt.x - pt.r > view.x1 || pt.y + pt.r < view.y0 || pt.y - pt.r > view.y1) continue;
      const gr = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, pt.r);
      gr.addColorStop(0, pt.c); gr.addColorStop(1, pt.c0);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
    }
    // Stone and water stay clean: stamp them again over the patches.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = this.g(x, y);
      if (t === G_ARENA || t === G_LIQUID) ctx.drawImage(this._tex(t, this.variant[y * MW + x], px), x * T, y * T, T + 0.5, T + 0.5);
    }
    // Paths as overlapping rounded blobs: an organic edge, not a grid.
    for (const kind of [G_PATH, G_PLAZA]) {
      ctx.fillStyle = kind === G_PLAZA ? "#b9ad92" : R.path;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (this.g(x, y) !== kind) continue;
        ctx.drawImage(this._tex(kind, this.variant[y * MW + x], px), x * T, y * T, T + 0.5, T + 0.5);
        const n = this.g(x, y - 1) === kind, s = this.g(x, y + 1) === kind, w = this.g(x - 1, y) === kind, e = this.g(x + 1, y) === kind;
        ctx.fillStyle = kind === G_PLAZA ? "#b9ad92" : R.path;
        if (!n) { ctx.beginPath(); ctx.ellipse(x * T + T / 2, y * T + 2, T * 0.55, 5, 0, 0, 7); ctx.fill(); }
        if (!s) { ctx.beginPath(); ctx.ellipse(x * T + T / 2, y * T + T - 2, T * 0.55, 5, 0, 0, 7); ctx.fill(); }
        if (!w) { ctx.beginPath(); ctx.ellipse(x * T + 2, y * T + T / 2, 5, T * 0.55, 0, 0, 7); ctx.fill(); }
        if (!e) { ctx.beginPath(); ctx.ellipse(x * T + T - 2, y * T + T / 2, 5, T * 0.55, 0, 0, 7); ctx.fill(); }
      }
    }
    // Liquid: animated highlights and a bright edge where it meets land.
    const lava = R.water === "lava", ice = R.water === "ice";
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.g(x, y) !== G_LIQUID) continue;
      const wx = x * T, wy = y * T;
      if (!ice) {
        const ph = time * (lava ? 1.2 : 2) + x * 0.7 + y * 1.3;
        ctx.strokeStyle = lava ? `rgba(255,235,160,${0.35 + Math.sin(ph) * 0.2})` : `rgba(255,255,255,${0.18 + Math.sin(ph) * 0.12})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(wx + 5, wy + 10 + Math.sin(ph) * 2); ctx.quadraticCurveTo(wx + 16, wy + 6 + Math.sin(ph + 1) * 2, wx + 27, wy + 10 + Math.sin(ph) * 2); ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(wx + 6, wy + 22); ctx.lineTo(wx + 14, wy + 12); ctx.stroke();
      }
      const shore = lava ? "rgba(40,10,0,0.55)" : ice ? "rgba(255,255,255,0.7)" : "rgba(220,240,255,0.55)";
      ctx.fillStyle = shore;
      if (this.g(x, y - 1) !== G_LIQUID) ctx.fillRect(wx, wy, T, 3);
      if (this.g(x, y + 1) !== G_LIQUID) ctx.fillRect(wx, wy + T - 2, T, 2);
      if (this.g(x - 1, y) !== G_LIQUID) ctx.fillRect(wx, wy, 2, T);
      if (this.g(x + 1, y) !== G_LIQUID) ctx.fillRect(wx + T - 2, wy, 2, T);
    }
    // Arena rune ring.
    if (this.arena.x > view.x0 - this.arena.r && this.arena.x < view.x1 + this.arena.r) {
      ctx.strokeStyle = "rgba(255,215,106,0.35)"; ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(this.arena.x, this.arena.y, this.arena.r - 10, time * 0.1, time * 0.1 + Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Flat decor.
    for (const d of this.decor) {
      if (d.x < view.x0 - 20 || d.x > view.x1 + 20 || d.y < view.y0 - 20 || d.y > view.y1 + 20) continue;
      drawProp(ctx, d, R, time);
    }
  }

  /** Minimap, painted once. */
  minimap() {
    if (this._mini) return this._mini;
    const c = document.createElement("canvas");
    c.width = MW * 2; c.height = MH * 2;
    const g = c.getContext("2d");
    const R = this.region;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = this.g(x, y);
      g.fillStyle = t === G_WALL ? "#10141c" : t === G_LIQUID ? R.liquid[0] : t === G_PATH || t === G_PLAZA ? R.path : t === G_ARENA ? "#8a8a96" : R.ground[0];
      g.fillRect(x * 2, y * 2, 2, 2);
    }
    for (const p of this.props) if (p.tall && !p.gone && p.type !== "house") { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(Math.floor(p.x / T) * 2, Math.floor(p.y / T) * 2, 2, 2); }
    this._mini = c;
    return c;
  }
}

// ==========================================================================
// Props
// ==========================================================================
export function drawProp(ctx, p, R, time) {
  if (p.gone || p.invisible) return;
  const { x, y } = p;
  const s = p.seed;
  const shadow = (rx, ry = rx * 0.4, a = 0.28) => { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(x + 3, y + 2, rx, ry, 0, 0, 7); ctx.fill(); };
  switch (p.type) {
    case "oak": {
      shadow(20, 8);
      ctx.fillStyle = "#5a3a22"; ctx.fillRect(x - 4, y - 18, 8, 20);
      const sway = Math.sin(time * 1.3 + s) * 1.2;
      const cols = ["#2f7a2f", "#3d8f38", "#56a84a"];
      [[0, -34, 19], [-11, -27, 13], [11, -27, 13], [0, -44, 12]].forEach(([dx, dy, r], i) => {
        ctx.fillStyle = cols[Math.min(2, i === 3 ? 2 : i % 2)];
        ctx.beginPath(); ctx.arc(x + dx + sway, y + dy, r, 0, 7); ctx.fill();
      });
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(x - 6 + sway, y - 42, 7, 0, 7); ctx.fill();
      break;
    }
    case "pine": case "snowpine": case "crystal": {
      shadow(16, 7);
      if (p.type === "crystal") {
        const cols = ["#7a4ab0", "#b06bff", "#d9b3ff"];
        [[-7, 0, 9, 34], [6, 2, 8, 26], [0, 0, 10, 46]].forEach(([dx, dy, w, h], i) => {
          ctx.fillStyle = cols[i];
          ctx.beginPath(); ctx.moveTo(x + dx - w / 2, y + dy); ctx.lineTo(x + dx, y + dy - h); ctx.lineTo(x + dx + w / 2, y + dy); ctx.closePath(); ctx.fill();
        });
        ctx.fillStyle = `rgba(220,180,255,${0.25 + Math.sin(time * 2 + s) * 0.15})`;
        ctx.beginPath(); ctx.arc(x, y - 22, 16, 0, 7); ctx.fill();
        break;
      }
      ctx.fillStyle = "#4a2e1a"; ctx.fillRect(x - 3, y - 10, 6, 12);
      const dark = p.type === "snowpine" ? "#2f5a4a" : "#1f5a32", mid = p.type === "snowpine" ? "#3a6a58" : "#2a7040";
      for (let i = 0; i < 3; i++) {
        const w = 18 - i * 4, top = y - 14 - i * 11;
        ctx.fillStyle = i % 2 ? mid : dark;
        ctx.beginPath(); ctx.moveTo(x - w, top + 14); ctx.lineTo(x, top - 8); ctx.lineTo(x + w, top + 14); ctx.closePath(); ctx.fill();
        if (p.type === "snowpine") { ctx.fillStyle = "#f4f8fc"; ctx.beginPath(); ctx.moveTo(x - w * 0.6, top + 4); ctx.lineTo(x, top - 8); ctx.lineTo(x + w * 0.6, top + 4); ctx.closePath(); ctx.fill(); }
      }
      break;
    }
    case "dead": case "charred": {
      shadow(12, 5);
      ctx.strokeStyle = p.type === "charred" ? "#1a1412" : "#5a4a3a"; ctx.lineCap = "round";
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x - 12, y - 34); ctx.moveTo(x, y - 28); ctx.lineTo(x + 11, y - 40); ctx.moveTo(x, y - 34); ctx.lineTo(x - 4, y - 46); ctx.stroke();
      if (p.type === "charred") { ctx.fillStyle = `rgba(255,120,40,${0.5 + Math.sin(time * 4 + s) * 0.4})`; ctx.beginPath(); ctx.arc(x + 1, y - 18, 2, 0, 7); ctx.fill(); }
      break;
    }
    case "rock": case "obsidian": {
      shadow(14, 6);
      ctx.fillStyle = p.type === "obsidian" ? "#2a2238" : "#7d7f8a";
      ctx.beginPath(); ctx.moveTo(x - 14, y + 2); ctx.lineTo(x - 10, y - 12); ctx.lineTo(x + 3, y - 16); ctx.lineTo(x + 14, y - 6); ctx.lineTo(x + 13, y + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.type === "obsidian" ? "rgba(176,107,255,0.4)" : "rgba(255,255,255,0.22)";
      ctx.beginPath(); ctx.moveTo(x - 10, y - 12); ctx.lineTo(x + 3, y - 16); ctx.lineTo(x, y - 6); ctx.closePath(); ctx.fill();
      break;
    }
    case "iceshard": {
      shadow(12, 5);
      ctx.fillStyle = "#bfe3f7"; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 2, y - 32); ctx.lineTo(x + 8, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x - 2, y - 30); ctx.lineTo(x + 1, y - 4); ctx.closePath(); ctx.fill();
      break;
    }
    case "pillar": {
      shadow(14, 6);
      ctx.fillStyle = "#9d9a8c"; ctx.fillRect(x - 9, y - 40, 18, 40);
      ctx.fillStyle = "#b9b6a8"; ctx.fillRect(x - 12, y - 44, 24, 6);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x + 3, y - 38, 6, 38);
      ctx.fillStyle = "#4a7a3a"; ctx.fillRect(x - 9, y - 18, 5, 12);
      break;
    }
    case "bush": case "shrub": case "snowbush": {
      shadow(13, 5);
      const c = p.type === "snowbush" ? ["#dfe8f2", "#f4f8fc"] : ["#2f7a2f", "#46963e"];
      ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(x - 6, y - 7, 8, 0, 7); ctx.arc(x + 6, y - 7, 8, 0, 7); ctx.fill();
      ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(x, y - 12, 8, 0, 7); ctx.fill();
      if (p.type === "shrub") { ctx.fillStyle = "#ff5470"; ctx.beginPath(); ctx.arc(x - 4, y - 12, 1.8, 0, 7); ctx.arc(x + 5, y - 8, 1.8, 0, 7); ctx.fill(); }
      break;
    }
    case "pot": {
      shadow(9, 4);
      ctx.fillStyle = "#a0603a"; ctx.beginPath(); ctx.ellipse(x, y - 8, 9, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#7a4528"; ctx.fillRect(x - 5, y - 20, 10, 4);
      ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.beginPath(); ctx.ellipse(x - 3, y - 11, 2.5, 4, 0, 0, 7); ctx.fill();
      break;
    }
    case "mushroom": {
      shadow(8, 3);
      ctx.fillStyle = "#efe6d8"; ctx.fillRect(x - 2, y - 8, 4, 8);
      ctx.fillStyle = "#d94a5a"; ctx.beginPath(); ctx.arc(x, y - 9, 7, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - 3, y - 12, 1.3, 0, 7); ctx.arc(x + 2, y - 13, 1.1, 0, 7); ctx.fill();
      break;
    }
    case "vent": {
      ctx.fillStyle = "#2a1a16"; ctx.beginPath(); ctx.ellipse(x, y - 3, 12, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,120,40,${0.5 + Math.sin(time * 3 + s) * 0.3})`; ctx.beginPath(); ctx.ellipse(x, y - 3, 7, 3, 0, 0, 7); ctx.fill();
      break;
    }
    case "flower": {
      const cols = ["#ff7fa8", "#ffd76a", "#ffffff", "#9ad0ff"];
      ctx.fillStyle = cols[Math.abs(s) % 4];
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * 4, y + ((i * 7) % 5) - 2, 2, 0, 7); ctx.fill(); }
      break;
    }
    case "tuft": case "fern": {
      ctx.strokeStyle = R ? shadeCol(R.ground[1], -0.25) : "#2a6033"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 6, y - 7); ctx.moveTo(x, y); ctx.lineTo(x, y - 9); ctx.moveTo(x + 4, y); ctx.lineTo(x + 6, y - 7); ctx.stroke();
      break;
    }
    case "rubble": case "skull": {
      ctx.fillStyle = p.type === "skull" ? "#e8e2d0" : "#8d8a7c";
      ctx.beginPath(); ctx.arc(x, y - 3, p.type === "skull" ? 4 : 3, 0, 7); ctx.arc(x + 6, y - 1, 2.5, 0, 7); ctx.fill();
      if (p.type === "skull") { ctx.fillStyle = "#222"; ctx.fillRect(x - 2, y - 4, 1.5, 1.5); ctx.fillRect(x + 1, y - 4, 1.5, 1.5); }
      break;
    }
    case "house": {
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - 40, y - 6, 86, 14);
      ctx.fillStyle = "#e8d8b8"; ctx.fillRect(x - 38, y - 44, 76, 46);
      ctx.fillStyle = "#8a6a4a"; ctx.fillRect(x - 38, y - 44, 76, 4); ctx.fillRect(x - 38, y - 2, 76, 4);
      ctx.fillStyle = "#6a4a2a"; ctx.fillRect(x - 8, y - 26, 16, 28);
      ctx.fillStyle = "#ffd76a"; ctx.fillRect(x + 5, y - 13, 2, 2);
      ctx.fillStyle = "#9fd8ff"; ctx.fillRect(x - 30, y - 34, 14, 12); ctx.fillRect(x + 16, y - 34, 14, 12);
      ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(x - 30, y - 34, 5, 12); ctx.fillRect(x + 16, y - 34, 5, 12);
      ctx.fillStyle = p.roof;
      ctx.beginPath(); ctx.moveTo(x - 46, y - 42); ctx.lineTo(x, y - 76); ctx.lineTo(x + 46, y - 42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.moveTo(x, y - 76); ctx.lineTo(x + 46, y - 42); ctx.lineTo(x, y - 42); ctx.closePath(); ctx.fill();
      if (p.kind === "shop" || p.kind === "smith") {
        ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 20, y - 58, 40, 14);
        ctx.fillStyle = "#ffd76a"; ctx.font = "700 9px Sora, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(p.kind === "shop" ? "SHOP" : "SMITH", x, y - 51);
      }
      break;
    }
    case "fountain": {
      shadow(30, 10);
      ctx.fillStyle = "#9d9a8c"; ctx.beginPath(); ctx.ellipse(x, y - 4, 30, 14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#4aa3e0"; ctx.beginPath(); ctx.ellipse(x, y - 6, 25, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#b9b6a8"; ctx.fillRect(x - 4, y - 28, 8, 22);
      for (let i = 0; i < 6; i++) {
        const t = (time * 1.5 + i / 6) % 1;
        ctx.fillStyle = `rgba(200,235,255,${1 - t})`;
        ctx.beginPath(); ctx.arc(x + Math.cos(i) * t * 18, y - 28 + t * t * 22 - t * 10, 2, 0, 7); ctx.fill();
      }
      ctx.fillStyle = `rgba(46,230,166,${0.25 + Math.sin(time * 2) * 0.1})`; ctx.beginPath(); ctx.ellipse(x, y - 6, 25, 10, 0, 0, 7); ctx.fill();
      break;
    }
    case "waystone": {
      shadow(14, 6);
      ctx.fillStyle = "#5a5f72"; ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 8, y - 36); ctx.lineTo(x + 8, y - 38); ctx.lineTo(x + 11, y); ctx.closePath(); ctx.fill();
      const glow = 0.5 + Math.sin(time * 2.4) * 0.3;
      ctx.fillStyle = `rgba(124,240,255,${glow})`;
      ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x + 4, y - 22); ctx.lineTo(x, y - 14); ctx.lineTo(x - 4, y - 22); ctx.closePath(); ctx.fill();
      const g = ctx.createRadialGradient(x, y - 22, 2, x, y - 22, 30);
      g.addColorStop(0, `rgba(124,240,255,${glow * 0.4})`); g.addColorStop(1, "rgba(124,240,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 22, 30, 0, 7); ctx.fill();
      break;
    }
  }
}

function shadeCol(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}
