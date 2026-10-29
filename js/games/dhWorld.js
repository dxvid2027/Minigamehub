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
import { GIVERS, CAMP_GIVER } from "./dhQuests.js";

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
    this.walkers = [];
    this.critters = [];
    this.safe = [];
    this.questSpots = [];
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
      if (R.village && px < 23) py = Math.round(midY);      // straight through the market
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

    // A camp by the road: someone with work for you, a fire and supplies.
    if (!R.village) this._camp(road[4]);

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
      && !this.safe.some(z => Math.hypot((x + 0.5) * T - z.x, (y + 0.5) * T - z.y) < z.r)
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
        const flat = R.props.find(k => ["flower", "kelp", "shell", "dune", "bones", "reed", "lily", "rose"].includes(k));
        this.decor.push(this._prop(flat && rng() < 0.7 ? flat : "tuft", (x + rng()) * T, (y + rng()) * T, false));
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
    // A shrine in the middle clearing: pray for a blessing.
    const sc = clearings[3];
    this.shrine = { x: (sc.tx + 0.5) * T, y: (sc.ty - 0.6) * T };
    this.props.push(this._prop("shrine", this.shrine.x, this.shrine.y, true));
    if (R.village) this._villageDecor(rng);
    this._questSpots(rng);
  }

  /** Walkable tiles reachable from the entry, for quest items. */
  _questSpots(rng) {
    const ok = (t) => t === G_GRASS || t === G_PATH || t === G_PLAZA || t === G_ARENA || (t === G_LIQUID && this.region.water === "ice");
    const seen = new Uint8Array(MW * MH);
    const sx = Math.floor(this.entry.x / T), sy = Math.floor(this.entry.y / T);
    const q = [[sx, sy]]; seen[sy * MW + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || seen[ny * MW + nx] || !ok(this.g(nx, ny))) continue;
        seen[ny * MW + nx] = 1; q.push([nx, ny]);
      }
    }
    const blockedT = new Set();
    for (const p of this.props) if (p.solid) blockedT.add(Math.floor(p.x / T) + Math.floor(p.y / T) * MW);
    const cand = [];
    for (let y = 3; y < MH - 3; y++) for (let x = 8; x < MW - 3; x++) {
      if (!seen[y * MW + x] || this.g(x, y) !== G_GRASS || blockedT.has(x + y * MW)) continue;
      const px = (x + 0.5) * T, py = (y + 0.5) * T;
      if (Math.hypot(px - this.arena.x, py - this.arena.y) < this.arena.r + 3 * T) continue;
      if (this.region.village && x < 25 && Math.abs(y - MH / 2) < 10) continue;
      if (this.safe.some(z => Math.hypot(px - z.x, py - z.y) < z.r)) continue;
      cand.push([px, py]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const minD of [7 * T, 5 * T, 3 * T]) {
      for (const c of cand) {
        if (this.questSpots.length >= 16) break;
        if (this.questSpots.every(s2 => Math.hypot(s2.x - c[0], s2.y - c[1]) > minD)) this.questSpots.push({ x: c[0], y: c[1] });
      }
    }
  }

  _camp(at) {
    const [rx, ry] = at;
    const side = ry - 8 >= 3 ? -1 : 1;
    const cx = rx + 2, cy = ry + side * 5;
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      if (Math.hypot(x - cx, y - cy) <= 3.6 && Math.min(x, y, MW - 1 - x, MH - 1 - y) >= 2 && this.g(x, y) !== G_PATH) this.setG(x, y, G_GRASS);
    }
    // A short trail from the road to the camp.
    for (let k = 1; k < 5; k++) { const y = ry + side * k; if (this.g(rx + 1, y) !== G_PATH) { this.setG(rx + 1, y, G_GRASS); this.setG(rx + 2, y, G_GRASS); } }
    const X = (cx + 0.5) * T, Y = (cy + 0.5) * T;
    this.camp = { x: X, y: Y };
    this.safe.push({ x: X, y: Y, r: 5 * T });
    const id = CAMP_GIVER[this.ri];
    const G = GIVERS[id];
    const P = (type, dx, dy, extra) => this.props.push(Object.assign(this._prop(type, X + dx * T, Y + dy * T, true), extra || {}));
    P("tent", -1.5, -1.2, { color: G.color });
    P("campfire", 1.3, 0.7);
    P("crate", 2.3, -0.9, { supplies: true });
    P("barrel", 2.8, -0.2);
    P("signpost", -2.2, 1.6);
    this.supplies = { x: X + 2.3 * T, y: Y - 0.9 * T };
    this.npcs.push({ id, giver: id, name: G.name, x: X, y: Y - 0.1 * T, color: G.color, hair: G.hair, hat: G.hat });
    this.props.push({ type: "npcblock", x: X, y: Y - 0.1 * T, r: 11, solid: true, invisible: true });
  }

  _village() {
    const cy = Math.round(MH / 2);
    for (let y = cy - 7; y <= cy + 8; y++) for (let x = 5; x <= 23; x++) {
      if (Math.min(x, y) < 2) continue;
      if (Math.abs(y - cy) <= 3 && x >= 6 && x <= 22) this.setG(x, y, G_PLAZA);
      else if (this.g(x, y) !== G_PATH) this.setG(x, y, G_GRASS);
    }
    const H = (x, y, roof, kind) => this.props.push(Object.assign(this._prop("house", x * T, y * T, true), { roof, kind }));
    H(9, cy - 4.2, "#c0503a", "home"); H(14, cy - 4.4, "#3a6ac0", "shop"); H(19, cy - 4.2, "#7a4ab0", "home");
    H(10.5, cy + 6.4, "#3a9a5a", "smith"); H(17, cy + 6.4, "#c08a3a", "home");
    this.fountain = { x: 13.5 * T, y: (cy + 0.6) * T };
    this.safe.push({ x: 14 * T, y: cy * T, r: 9 * T });
    this.props.push(Object.assign(this._prop("fountain", this.fountain.x, this.fountain.y, true), { fountain: true }));
    // The market: stalls along the plaza's north edge, their keepers behind the counters.
    const P = (type, x, y, extra) => { const p = Object.assign(this._prop(type, x * T, y * T, true), extra || {}); this.props.push(p); return p; };
    P("stall", 11.5, cy - 1.9, { variant: "fruit", color: "#d84a3a" });
    P("stall", 16.6, cy - 1.9, { variant: "cloth", color: "#b03a8a" });
    P("stall", 21.7, cy - 1.9, { variant: "scrap", color: "#5a6a7a" });
    P("stall", 7.4, cy + 3.7, { variant: "bread", color: "#d8a03a" });
    P("stall", 20.6, cy + 3.7, { variant: "fish", color: "#3a8ad8" });
    const N = (n) => { this.npcs.push(n); this.props.push({ type: "npcblock", x: n.x, y: n.y, r: 11, solid: true, invisible: true }); };
    N({ id: "shop", role: "shop", name: "Mira the Merchant", x: 14 * T, y: (cy - 2.2) * T, color: "#3a6ac0", hair: "#5a3a20", apron: "#e8d8b8" });
    N({ id: "smith", role: "smith", name: "Bram the Smith", x: 12.6 * T, y: (cy + 7.1) * T, color: "#3a9a5a", hair: "#2a1a10", apron: "#5a3a1a", beard: true });
    N({ id: "elder", giver: "elder", name: "Elder Rowan", x: 17.5 * T, y: (cy + 1.6) * T, color: "#8a6ac0", hair: "#e8e8e8", beard: true });
    N({ id: "granny", giver: "granny", name: "Granny Wen", x: 11.5 * T, y: (cy - 2.45) * T, color: "#c0503a", hair: "#e8e8e8", hat: "strawhat" });
    N({ id: "tailor", role: "tailor", name: "Lysa the Tailor", x: 16.6 * T, y: (cy - 2.45) * T, color: "#b03a8a", hair: "#ffd76a", hat: "tophat" });
    N({ id: "scrap", role: "scrap", name: "Grit the Scrapper", x: 21.7 * T, y: (cy - 2.45) * T, color: "#5a6a7a", hair: "#3a2a1a", hat: "goggles", apron: "#4a3a2a", beard: true });
    N({ id: "farmer", giver: "farmer", name: "Farmer Tom", x: 6.4 * T, y: (cy + 5.6) * T, color: "#6a8a3a", hair: "#8a5a2a", hat: "strawhat" });
  }

  /** Lanterns, bunting, benches, barrels, a well, a farm corner and people. */
  _villageDecor(rng) {
    const cy = Math.round(MH / 2);
    const P = (type, x, y, extra) => { const p = Object.assign(this._prop(type, x * T, y * T, true), extra || {}); this.props.push(p); return p; };
    P("lantern", 6.6, cy - 1.7); P("lantern", 19.9, cy - 1.7); P("lantern", 8.9, cy + 2.3); P("lantern", 18.6, cy + 2.3);
    P("bunting", 6.6, cy - 1.7, { x2: 19.9 * T, y2: (cy - 1.7) * T });
    P("bunting", 8.9, cy + 2.3, { x2: 18.6 * T, y2: (cy + 2.3) * T });
    P("board", 5.6, cy - 2.6, { board: true });
    this.board = { x: 5.6 * T, y: (cy - 2.6) * T };
    P("well", 22.4, cy - 4.8);
    P("bench", 12.1, cy + 2.6); P("bench", 15.0, cy + 2.6);
    P("crate", 12.75, cy - 1.8); P("barrel", 15.25, cy - 1.9); P("crate", 23.1, cy - 1.4); P("barrel", 23.2, cy - 2.4);
    P("barrel", 13.4, cy + 7.6); P("crate", 8.7, cy + 7.3); P("anvil", 11.9, cy + 7.6);
    P("planter", 7.2, cy - 3.6); P("planter", 10.8, cy - 3.7); P("planter", 20.6, cy - 3.6); P("planter", 15.6, cy + 5.4); P("planter", 18.4, cy + 5.4);
    P("hay", 4.6, cy + 6.6); P("hay", 5.5, cy + 7.4); P("cart", 8.2, cy + 7.6);
    P("signpost", 23.4, cy + 1.9);
    // Folk wandering the market.
    const folk = [
      { name: "Villager", color: "#c06a3a", hair: "#3a2a1a", lines: ["Fresh bread at the bakery!", "Lovely day, isn't it?", "Have you seen my cat?"], carry: "#d84a3a" },
      { name: "Villager", color: "#3a7ab0", hair: "#e8c46a", lines: ["I heard a dragon roar last night…", "The Slime King is getting bigger!", "Lysa makes the best capes."] },
      { name: "Kid", color: "#e0a03a", hair: "#6a3a1a", lines: ["Are you a real hero?!", "When I grow up I'll have a dragon helm!", "Race you to the fountain!"], small: true },
      { name: "Guard", color: "#8a90a4", hair: "#2a1a10", hat: "horned", lines: ["Move along, citizen.", "All quiet in Greenvale.", "Grit pays tokens for old gear."] },
    ];
    folk.forEach((f, i) => {
      const hx = (9 + i * 3.4) * T, hy = (cy + (i % 2 ? 1.3 : -0.6)) * T;
      this.walkers.push({ ...f, x: hx, y: hy, hx, hy, tx: hx, ty: hy, st: rng() * 3, walk: 0, moving: false, face: 1, sayT: 0, say: "", seed: i });
    });
    for (let i = 0; i < 5; i++) this.critters.push({ kind: "chicken", x: (5.5 + rng() * 3) * T, y: (cy + 5.5 + rng() * 2) * T, hx: 6.5 * T, hy: (cy + 6.2) * T, range: 70, st: rng() * 2, face: 1 });
    this.critters.push({ kind: "cat", x: 13 * T, y: (cy + 2) * T, hx: 13.5 * T, hy: (cy + 1) * T, range: 150, st: 1, face: 1 });
    // Flowers in the village grass.
    for (let k = 0; k < 90; k++) {
      const x = 5 + rng() * 19, y = cy - 7 + rng() * 16;
      if (this.g(Math.floor(x), Math.floor(y)) !== G_GRASS) continue;
      this.decor.push(this._prop(rng() < 0.6 ? "flower" : "tuft", x * T, y * T, false));
    }
  }

  _prop(type, x, y, solid) {
    const big = {
      oak: 15, pine: 13, dead: 11, snowpine: 13, charred: 11, crystal: 13, rock: 13, pillar: 13, house: 46, fountain: 30, waystone: 13,
      iceshard: 11, obsidian: 13, vent: 12, shrub: 12, pot: 10, bush: 12, snowbush: 12, mushroom: 9,
      palm: 12, cactus: 11, willow: 15, chimney: 13, stormpine: 13, voidspire: 13, goldtree: 15, obelisk: 13,
      coral: 12, gear: 13, pipe: 11, stormrock: 13, crystalcluster: 13, gravestone: 10, voidcrystal: 12, starstone: 12,
      stall: 30, lantern: 6, well: 22, barrel: 10, crate: 11, planter: 11, bench: 12, cart: 24, hay: 14, board: 12,
      tent: 30, campfire: 12, shrine: 15, signpost: 6, anvil: 10,
    };
    const tall = ["oak", "pine", "dead", "snowpine", "charred", "crystal", "pillar", "house", "waystone", "iceshard", "obsidian",
      "palm", "cactus", "willow", "chimney", "stormpine", "voidspire", "goldtree", "obelisk", "coral", "pipe", "crystalcluster",
      "gravestone", "voidcrystal", "starstone", "stormrock", "gear", "stall", "lantern", "bunting", "well", "barrel", "crate",
      "planter", "bench", "cart", "hay", "board", "tent", "campfire", "shrine", "signpost", "anvil"].includes(type);
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
    if (t === G_LIQUID && !flying && this.region.water !== "ice") return true;   // water, lava, void and cloud
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
    const lava = R.water === "lava", ice = R.water === "ice", voidL = R.water === "void", cloud = R.water === "cloud";
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.g(x, y) !== G_LIQUID) continue;
      const wx = x * T, wy = y * T;
      if (voidL) {
        // The edge of the world: a starfield that drifts.
        const sd = (x * 928371 ^ y * 12377) >>> 0;
        for (let k = 0; k < 3; k++) {
          const a = 0.3 + 0.7 * Math.abs(Math.sin(time * (1 + k * 0.7) + sd % 50 + k));
          ctx.fillStyle = `rgba(${k ? "200,170,255" : "255,255,255"},${a})`;
          ctx.fillRect(wx + ((sd >> (k * 4)) & 31), wy + ((sd >> (k * 5 + 2)) & 31), 1.6, 1.6);
        }
      } else if (cloud) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        const ph = time * 0.4 + x * 0.9 + y * 0.6;
        ctx.beginPath(); ctx.arc(wx + 10 + Math.sin(ph) * 4, wy + 14, 9, 0, 7); ctx.arc(wx + 22 + Math.cos(ph) * 3, wy + 18, 8, 0, 7); ctx.fill();
      } else if (!ice) {
        const ph = time * (lava ? 1.2 : 2) + x * 0.7 + y * 1.3;
        ctx.strokeStyle = lava ? `rgba(255,235,160,${0.35 + Math.sin(ph) * 0.2})` : `rgba(255,255,255,${0.18 + Math.sin(ph) * 0.12})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(wx + 5, wy + 10 + Math.sin(ph) * 2); ctx.quadraticCurveTo(wx + 16, wy + 6 + Math.sin(ph + 1) * 2, wx + 27, wy + 10 + Math.sin(ph) * 2); ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(wx + 6, wy + 22); ctx.lineTo(wx + 14, wy + 12); ctx.stroke();
      }
      const shore = lava ? "rgba(40,10,0,0.55)" : ice ? "rgba(255,255,255,0.7)" : voidL ? "rgba(176,107,255,0.6)" : cloud ? "rgba(255,255,255,0.9)" : "rgba(220,240,255,0.55)";
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
    case "palm": {
      shadow(18, 7);
      ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 6; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 22, x + 2, y - 44); ctx.stroke();
      const sw = Math.sin(time * 1.4 + s) * 0.08;
      ctx.fillStyle = "#2f9a4a";
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55 + sw;
        ctx.beginPath(); ctx.moveTo(x + 2, y - 44);
        ctx.quadraticCurveTo(x + 2 + Math.cos(a) * 14, y - 50 + Math.sin(a) * 10, x + 2 + Math.cos(a) * 26, y - 40 + Math.sin(a) * 18 + 8);
        ctx.quadraticCurveTo(x + 2 + Math.cos(a) * 12, y - 44 + Math.sin(a) * 6, x + 2, y - 44); ctx.fill();
      }
      ctx.fillStyle = "#6a4a2a"; ctx.beginPath(); ctx.arc(x - 1, y - 42, 2.5, 0, 7); ctx.arc(x + 4, y - 41, 2.5, 0, 7); ctx.fill();
      break;
    }
    case "cactus": {
      shadow(12, 5);
      ctx.fillStyle = "#3a9a4a"; ctx.strokeStyle = "#2a6a32"; ctx.lineWidth = 1.5;
      const pill = (px, py, w, h) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px - w / 2, py - h, w, h, w / 2) : ctx.rect(px - w / 2, py - h, w, h); ctx.fill(); ctx.stroke(); };
      pill(x, y, 11, 38); pill(x - 10, y - 12, 7, 16); pill(x + 10, y - 18, 7, 14);
      ctx.fillStyle = "#ff7fa8"; ctx.beginPath(); ctx.arc(x, y - 38, 3, 0, 7); ctx.fill();
      break;
    }
    case "willow": {
      shadow(22, 8);
      ctx.fillStyle = "#3a2e22"; ctx.fillRect(x - 4, y - 24, 8, 26);
      ctx.fillStyle = "#3a5a2a"; ctx.beginPath(); ctx.arc(x, y - 36, 20, 0, 7); ctx.fill();
      ctx.strokeStyle = "#4a6a32"; ctx.lineWidth = 2;
      for (let i = -4; i <= 4; i++) { const sw = Math.sin(time * 1.2 + i + s) * 2; ctx.beginPath(); ctx.moveTo(x + i * 4.5, y - 30); ctx.quadraticCurveTo(x + i * 5 + sw, y - 16, x + i * 5.5 + sw, y - 4); ctx.stroke(); }
      break;
    }
    case "chimney": case "pipe": {
      shadow(13, 5);
      const h = p.type === "chimney" ? 46 : 26;
      const g = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
      g.addColorStop(0, "#5a4a3a"); g.addColorStop(0.5, "#b08a5a"); g.addColorStop(1, "#4a3a2a");
      ctx.fillStyle = g; ctx.fillRect(x - 8, y - h, 16, h);
      ctx.fillStyle = "#c9a24a"; ctx.fillRect(x - 10, y - h - 4, 20, 5); ctx.fillRect(x - 10, y - h * 0.45, 20, 3);
      if (p.type === "chimney") for (let i = 0; i < 3; i++) { const t2 = (time * 0.6 + i / 3 + s * 0.01) % 1; ctx.fillStyle = `rgba(160,160,170,${0.5 * (1 - t2)})`; ctx.beginPath(); ctx.arc(x + t2 * 10, y - h - 8 - t2 * 28, 5 + t2 * 8, 0, 7); ctx.fill(); }
      break;
    }
    case "gear": {
      shadow(14, 5);
      ctx.save(); ctx.translate(x, y - 14); ctx.rotate(time * 0.6 + s);
      ctx.fillStyle = "#b08a4a";
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -16, 6, 6); }
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.fillStyle = "#3a2e22"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
      ctx.restore();
      break;
    }
    case "stormpine": {
      shadow(16, 7);
      ctx.fillStyle = "#3a2e22"; ctx.fillRect(x - 3, y - 10, 6, 12);
      for (let i = 0; i < 3; i++) {
        const w = 17 - i * 4, top = y - 14 - i * 11;
        ctx.fillStyle = i % 2 ? "#3a4a5a" : "#2a3a4a";
        ctx.beginPath(); ctx.moveTo(x - w, top + 14); ctx.lineTo(x + Math.sin(time * 2 + s) * 1.5, top - 8); ctx.lineTo(x + w, top + 14); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case "stormrock": {
      shadow(14, 6);
      ctx.fillStyle = "#4a5466";
      ctx.beginPath(); ctx.moveTo(x - 14, y + 2); ctx.lineTo(x - 9, y - 18); ctx.lineTo(x + 5, y - 22); ctx.lineTo(x + 14, y - 6); ctx.lineTo(x + 12, y + 3); ctx.closePath(); ctx.fill();
      const flick = Math.sin(time * 9 + s) > 0.6;
      ctx.strokeStyle = flick ? "#fff7a0" : "rgba(255,239,106,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 16); ctx.lineTo(x - 1, y - 9); ctx.lineTo(x - 4, y - 5); ctx.lineTo(x + 3, y + 1); ctx.stroke();
      break;
    }
    case "crystalcluster": case "voidcrystal": {
      shadow(13, 5);
      const vc = p.type === "voidcrystal";
      const cols = vc ? ["#3a1a6a", "#7a3aca", "#c99aff"] : ["#2a8ac0", "#5ad0ff", "#d6f6ff"];
      [[-7, 0, 9, 26], [7, 1, 8, 20], [0, 0, 10, 36]].forEach(([dx, dy, w, h], i) => {
        ctx.fillStyle = cols[i];
        ctx.beginPath(); ctx.moveTo(x + dx - w / 2, y + dy); ctx.lineTo(x + dx, y + dy - h); ctx.lineTo(x + dx + w / 2, y + dy); ctx.closePath(); ctx.fill();
      });
      const gl = ctx.createRadialGradient(x, y - 16, 0, x, y - 16, 22);
      gl.addColorStop(0, vc ? `rgba(200,140,255,${0.35 + Math.sin(time * 2 + s) * 0.15})` : `rgba(160,240,255,${0.35 + Math.sin(time * 2 + s) * 0.15})`); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y - 16, 22, 0, 7); ctx.fill();
      break;
    }
    case "coral": {
      shadow(12, 5);
      const cc = ["#ff6a8a", "#ff9a4a", "#b06bff"][Math.abs(s) % 3];
      ctx.strokeStyle = cc; ctx.lineCap = "round"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.lineTo(x - 8, y - 28); ctx.moveTo(x, y - 18); ctx.lineTo(x + 7, y - 30); ctx.moveTo(x, y - 10); ctx.lineTo(x + 9, y - 16); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - 8, y - 28, 1.6, 0, 7); ctx.arc(x + 7, y - 30, 1.6, 0, 7); ctx.fill();
      break;
    }
    case "gravestone": {
      shadow(11, 4);
      ctx.fillStyle = "#6a6a72"; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 9, y - 18); ctx.arc(x, y - 18, 9, Math.PI, 0); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - 1.5, y - 22, 3, 10); ctx.fillRect(x - 5, y - 19, 10, 3);
      break;
    }
    case "voidspire": case "obelisk": {
      shadow(13, 5);
      const ob = p.type === "obelisk";
      ctx.fillStyle = ob ? "#1a1428" : "#24183c";
      ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x - 5, y - 48); ctx.lineTo(x, y - 56); ctx.lineTo(x + 5, y - 48); ctx.lineTo(x + 9, y); ctx.closePath(); ctx.fill();
      const pulse = 0.5 + Math.sin(time * 2 + s) * 0.4;
      ctx.strokeStyle = ob ? `rgba(255,138,240,${pulse})` : `rgba(176,107,255,${pulse})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 46); ctx.moveTo(x - 4, y - 30); ctx.lineTo(x + 4, y - 30); ctx.stroke();
      break;
    }
    case "goldtree": {
      shadow(20, 8);
      ctx.fillStyle = "#f2e6c0"; ctx.fillRect(x - 4, y - 18, 8, 20);
      [[0, -34, 19], [-11, -27, 13], [11, -27, 13], [0, -44, 12]].forEach(([dx, dy, r], i) => {
        ctx.fillStyle = ["#ffd76a", "#ffe9a0", "#fff3c8", "#fff8e0"][i];
        ctx.beginPath(); ctx.arc(x + dx + Math.sin(time + s) * 1.2, y + dy, r, 0, 7); ctx.fill();
      });
      ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(time * 3 + s) * 0.3})`; ctx.beginPath(); ctx.arc(x + 6, y - 40, 2, 0, 7); ctx.fill();
      break;
    }
    case "starstone": {
      shadow(12, 5);
      ctx.fillStyle = "#e8e4f2"; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x - 7, y - 24); ctx.lineTo(x + 7, y - 26); ctx.lineTo(x + 10, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,215,106,${0.6 + Math.sin(time * 2.5 + s) * 0.3})`;
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 2.5 : 6; ctx.lineTo(x + Math.cos(a) * rr, y - 14 + Math.sin(a) * rr); } ctx.fill();
      break;
    }
    case "kelp": case "reed": {
      ctx.strokeStyle = p.type === "kelp" ? "#2a8a5a" : "#6a7a3a"; ctx.lineWidth = 2; ctx.lineCap = "round";
      for (let i = -1; i <= 1; i++) { const sw = Math.sin(time * 1.5 + s + i) * 3; ctx.beginPath(); ctx.moveTo(x + i * 3, y); ctx.quadraticCurveTo(x + i * 3 + sw, y - 8, x + i * 4 + sw * 1.5, y - 15); ctx.stroke(); }
      break;
    }
    case "shell": case "bones": {
      ctx.fillStyle = p.type === "shell" ? "#ffe0d0" : "#e8dcc0";
      if (p.type === "shell") { ctx.beginPath(); ctx.arc(x, y - 2, 4, Math.PI, 0); ctx.fill(); }
      else { ctx.fillRect(x - 6, y - 2, 12, 2.5); ctx.beginPath(); ctx.arc(x - 6, y - 1, 2, 0, 7); ctx.arc(x + 6, y - 1, 2, 0, 7); ctx.fill(); }
      break;
    }
    case "dune": {
      ctx.strokeStyle = "rgba(160,110,50,0.4)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 12, y + i * 4); ctx.quadraticCurveTo(x, y - 4 + i * 4, x + 12, y + i * 4); ctx.stroke(); }
      break;
    }
    case "lily": case "rose": {
      ctx.fillStyle = p.type === "lily" ? "#3a6a2a" : "#2a1a1a"; ctx.beginPath(); ctx.ellipse(x, y, 6, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = p.type === "lily" ? "#ffd0e8" : "#c01a3a"; ctx.beginPath(); ctx.arc(x, y - 2, 2.6, 0, 7); ctx.fill();
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
      // Flower boxes under the windows and a step at the door.
      for (const wx of [-31, 15]) {
        ctx.fillStyle = "#7a4a22"; ctx.fillRect(x + wx - 1, y - 22, 16, 4);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = ["#ff7fa8", "#ffd76a", "#ff5470", "#ffffff"][(i + Math.abs(s)) % 4]; ctx.beginPath(); ctx.arc(x + wx + 1.5 + i * 4, y - 23, 2, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = "#9d9a8c"; ctx.fillRect(x - 11, y, 22, 4);
      // Chimney with smoke.
      ctx.fillStyle = "#8a5a4a"; ctx.fillRect(x + 18, y - 76, 10, 22);
      ctx.fillStyle = "#6a3a2a"; ctx.fillRect(x + 16, y - 78, 14, 4);
      for (let i = 0; i < 3; i++) { const t2 = (time * 0.35 + i / 3 + Math.abs(s) * 0.013) % 1; ctx.fillStyle = `rgba(220,220,230,${0.45 * (1 - t2)})`; ctx.beginPath(); ctx.arc(x + 23 + t2 * 14, y - 82 - t2 * 34, 4 + t2 * 7, 0, 7); ctx.fill(); }
      ctx.fillStyle = p.roof;
      ctx.beginPath(); ctx.moveTo(x - 46, y - 42); ctx.lineTo(x, y - 76); ctx.lineTo(x + 46, y - 42); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const yy = y - 76 + i * 8.5, half = i * 8.5 * 46 / 34; ctx.beginPath(); ctx.moveTo(x - half, yy); ctx.lineTo(x + half, yy); ctx.stroke(); }
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.moveTo(x, y - 76); ctx.lineTo(x + 46, y - 42); ctx.lineTo(x, y - 42); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.moveTo(x - 46, y - 42); ctx.lineTo(x, y - 76); ctx.lineTo(x - 4, y - 76); ctx.lineTo(x - 48, y - 44); ctx.fill();
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
    case "stall": {
      ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(x - 32, y - 4, 66, 10);
      // Poles.
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x - 28, y - 50, 3, 50); ctx.fillRect(x + 25, y - 50, 3, 50);
      // Counter.
      ctx.fillStyle = "#8a5a2a"; ctx.fillRect(x - 28, y - 18, 56, 18);
      ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 28 + i * 14, y - 18); ctx.lineTo(x - 28 + i * 14, y); ctx.stroke(); }
      ctx.fillStyle = "#b07a3a"; ctx.fillRect(x - 31, y - 22, 62, 5);
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(x - 31, y - 22, 62, 1.5);
      // Goods.
      const v = p.variant;
      if (v === "fruit") {
        const cols = ["#d83a3a", "#7ac83a", "#ffc83a", "#ff8a2a"];
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = "#6a4422"; ctx.fillRect(x - 27 + i * 14, y - 30, 12, 8);
          ctx.fillStyle = cols[i];
          for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 24 + i * 14 + k * 3, y - 30 - (k % 2) * 2.5, 2.6, 0, 7); ctx.fill(); }
        }
      } else if (v === "cloth") {
        const cols = ["#c0203a", "#2c4f9a", "#3a9a5a", "#ffd76a", "#7a3ab0"];
        for (let i = 0; i < 5; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(x - 26 + i * 10.5, y - 27 - (i % 2) * 3, 9, 5 + (i % 2) * 3); }
        // Hats hanging from the awning.
        ctx.strokeStyle = "#3a2a1a"; ctx.beginPath(); ctx.moveTo(x - 14, y - 42); ctx.lineTo(x - 14, y - 38); ctx.moveTo(x + 12, y - 42); ctx.lineTo(x + 12, y - 38); ctx.stroke();
        ctx.fillStyle = "#1a1a24"; ctx.fillRect(x - 18, y - 38, 8, 6); ctx.fillRect(x - 20, y - 33, 12, 2);
        ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.moveTo(x + 7, y - 31); ctx.lineTo(x + 8.5, y - 37); ctx.lineTo(x + 12, y - 34); ctx.lineTo(x + 15.5, y - 37); ctx.lineTo(x + 17, y - 31); ctx.closePath(); ctx.fill();
      } else if (v === "scrap") {
        ctx.fillStyle = "#4a4a54"; ctx.beginPath(); ctx.moveTo(x - 24, y - 22); ctx.lineTo(x - 22, y - 30); ctx.lineTo(x - 8, y - 30); ctx.lineTo(x - 4, y - 26); ctx.lineTo(x - 10, y - 22); ctx.fill();
        ctx.fillStyle = "#6a6a74"; ctx.fillRect(x - 26, y - 33, 20, 3);
        ctx.strokeStyle = "#c9ccd8"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 2, y - 22); ctx.lineTo(x + 14, y - 40); ctx.moveTo(x + 8, y - 22); ctx.lineTo(x + 22, y - 34); ctx.stroke();
        ctx.fillStyle = "#8a5a2a"; ctx.beginPath(); ctx.arc(x + 20, y - 27, 5, 0, 7); ctx.fill();
        ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.arc(x + 20, y - 27, 1.8, 0, 7); ctx.fill();
        // A bowl of glinting tokens.
        const gl = 0.5 + Math.sin(time * 3 + s) * 0.4;
        ctx.fillStyle = `rgba(255,215,106,${gl})`; ctx.beginPath(); ctx.arc(x - 15, y - 34, 4, 0, 7); ctx.fill();
      } else if (v === "bread") {
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#d8a05a" : "#c0803a"; ctx.beginPath(); ctx.ellipse(x - 20 + i * 13, y - 26, 6, 3.6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.beginPath(); ctx.moveTo(x - 23 + i * 13, y - 27); ctx.lineTo(x - 18 + i * 13, y - 26); ctx.stroke(); }
      } else if (v === "fish") {
        for (let i = 0; i < 4; i++) {
          const fx = x - 20 + i * 13, fy = y - 26;
          ctx.fillStyle = i % 2 ? "#7aa8d8" : "#c9ccd8";
          ctx.beginPath(); ctx.ellipse(fx, fy, 5.5, 2.6, 0, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(fx + 5, fy); ctx.lineTo(fx + 9, fy - 3); ctx.lineTo(fx + 9, fy + 3); ctx.fill();
          ctx.fillStyle = "#111"; ctx.fillRect(fx - 3.5, fy - 1, 1, 1);
        }
      }
      // Striped awning with a scalloped edge.
      const c1 = p.color || "#c0503a";
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "#f8f0e0" : c1;
        ctx.beginPath(); ctx.moveTo(x - 32 + i * 8, y - 56); ctx.lineTo(x - 24 + i * 8, y - 56); ctx.lineTo(x - 24 + i * 8, y - 44); ctx.lineTo(x - 32 + i * 8, y - 44); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 28 + i * 8, y - 44, 4, 0, Math.PI); ctx.fill();
      }
      ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fillRect(x - 32, y - 47, 64, 3);
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(x - 32, y - 56, 64, 2);
      break;
    }
    case "lantern": {
      shadow(6, 2.5);
      ctx.fillStyle = "#2a2230"; ctx.fillRect(x - 1.5, y - 40, 3, 40); ctx.fillRect(x - 4, y - 2, 8, 3);
      ctx.fillRect(x - 1, y - 42, 9, 2);
      const fl = 0.75 + Math.sin(time * 7 + s) * 0.12 + Math.sin(time * 13 + s) * 0.06;
      const g = ctx.createRadialGradient(x + 7, y - 34, 0, x + 7, y - 34, 26);
      g.addColorStop(0, `rgba(255,200,100,${0.45 * fl})`); g.addColorStop(1, "rgba(255,200,100,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 7, y - 34, 26, 0, 7); ctx.fill();
      ctx.fillStyle = "#2a2230"; ctx.fillRect(x + 3, y - 40, 8, 2); ctx.fillRect(x + 3, y - 29, 8, 2);
      ctx.fillStyle = `rgba(255,220,130,${fl})`; ctx.fillRect(x + 4, y - 38, 6, 9);
      break;
    }
    case "bunting": {
      const x2 = p.x2, y2 = p.y2, h = 42, sag = 16;
      const at = (k) => { const u = 1 - k; return [u * u * x + 2 * u * k * (x + x2) / 2 + k * k * x2, u * u * (y - h) + 2 * u * k * ((y + y2) / 2 - h + sag * 2) + k * k * (y2 - h)]; };
      ctx.strokeStyle = "#5a4a3a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - h); ctx.quadraticCurveTo((x + x2) / 2, (y + y2) / 2 - h + sag * 2, x2, y2 - h); ctx.stroke();
      const n = Math.max(4, Math.round(Math.abs(x2 - x) / 15));
      const cols = ["#ff5470", "#ffd76a", "#4aa3ff", "#2ee6a6", "#b06bff"];
      for (let i = 1; i < n; i++) {
        const [fx, fy] = at(i / n), sw = Math.sin(time * 3 + i) * 1.5;
        ctx.fillStyle = cols[i % cols.length];
        ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.lineTo(fx + 4, fy); ctx.lineTo(fx + sw, fy + 9); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case "well": {
      shadow(22, 8);
      ctx.fillStyle = "#8d8a7c"; ctx.beginPath(); ctx.ellipse(x, y - 6, 18, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#6f6c60"; ctx.fillRect(x - 18, y - 6, 36, 8); ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 5, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = "#1e3a5a"; ctx.beginPath(); ctx.ellipse(x, y - 7, 13, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(160,220,255,${0.3 + Math.sin(time * 2) * 0.1})`; ctx.beginPath(); ctx.ellipse(x - 3, y - 8, 5, 1.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x - 17, y - 40, 3, 34); ctx.fillRect(x + 14, y - 40, 3, 34);
      ctx.fillStyle = "#a0503a"; ctx.beginPath(); ctx.moveTo(x - 22, y - 36); ctx.lineTo(x, y - 52); ctx.lineTo(x + 22, y - 36); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.moveTo(x, y - 52); ctx.lineTo(x + 22, y - 36); ctx.lineTo(x, y - 36); ctx.fill();
      ctx.strokeStyle = "#3a2a1a"; ctx.beginPath(); ctx.moveTo(x, y - 36); ctx.lineTo(x, y - 22); ctx.stroke();
      ctx.fillStyle = "#7a5a3a"; ctx.fillRect(x - 3, y - 22, 6, 6);
      break;
    }
    case "barrel": {
      shadow(10, 4);
      ctx.fillStyle = "#8a5a2a"; ctx.beginPath(); ctx.ellipse(x, y - 9, 8, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#6a4422"; ctx.beginPath(); ctx.ellipse(x, y - 18, 7, 2.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#4a4a54"; ctx.fillRect(x - 8, y - 14, 16, 1.6); ctx.fillRect(x - 8, y - 5, 16, 1.6);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x - 5, y - 16, 2, 13);
      break;
    }
    case "crate": {
      shadow(11, 4);
      ctx.fillStyle = "#a0703a"; ctx.fillRect(x - 10, y - 18, 20, 18);
      ctx.fillStyle = "#c08a4a"; ctx.beginPath(); ctx.moveTo(x - 10, y - 18); ctx.lineTo(x - 6, y - 22); ctx.lineTo(x + 14, y - 22); ctx.lineTo(x + 10, y - 18); ctx.fill();
      ctx.fillStyle = "#7a4a22"; ctx.beginPath(); ctx.moveTo(x + 10, y - 18); ctx.lineTo(x + 14, y - 22); ctx.lineTo(x + 14, y - 4); ctx.lineTo(x + 10, y); ctx.fill();
      ctx.strokeStyle = "#6a4422"; ctx.lineWidth = 1.5; ctx.strokeRect(x - 9, y - 17, 18, 16); ctx.beginPath(); ctx.moveTo(x - 9, y - 17); ctx.lineTo(x + 9, y - 1); ctx.stroke();
      if (p.supplies) { ctx.fillStyle = "#ff7fa8"; ctx.beginPath(); ctx.arc(x - 2, y - 25, 3.5, 0, 7); ctx.arc(x + 6, y - 24, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = "#c9ccd8"; ctx.fillRect(x - 3, y - 31, 2, 3); ctx.fillRect(x + 5, y - 30, 2, 3); }
      break;
    }
    case "planter": {
      shadow(12, 4);
      ctx.fillStyle = "#7a4a22"; ctx.fillRect(x - 12, y - 9, 24, 9);
      ctx.fillStyle = "#5a3a1a"; ctx.fillRect(x - 12, y - 9, 24, 2);
      const cols = ["#ff7fa8", "#ffd76a", "#ff5470", "#ffffff", "#9ad0ff"];
      ctx.fillStyle = "#3a8a3a"; ctx.beginPath(); ctx.ellipse(x, y - 11, 11, 4, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = cols[(i + Math.abs(s)) % 5]; ctx.beginPath(); ctx.arc(x - 9 + i * 4.5, y - 13 - (i % 2) * 2 + Math.sin(time * 2 + i) * 0.4, 2.2, 0, 7); ctx.fill(); }
      break;
    }
    case "bench": {
      shadow(14, 4);
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x - 12, y - 6, 2.5, 6); ctx.fillRect(x + 9.5, y - 6, 2.5, 6);
      ctx.fillStyle = "#a0703a"; ctx.fillRect(x - 14, y - 9, 28, 4);
      ctx.fillStyle = "#8a5a2a"; ctx.fillRect(x - 14, y - 17, 28, 3); ctx.fillRect(x - 12, y - 15, 2, 6); ctx.fillRect(x + 10, y - 15, 2, 6);
      break;
    }
    case "cart": {
      shadow(24, 6);
      ctx.fillStyle = "#e8c46a"; ctx.beginPath(); ctx.ellipse(x, y - 26, 20, 8, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#a0703a"; ctx.fillRect(x - 22, y - 26, 44, 12);
      ctx.strokeStyle = "#6a4422"; ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 22 + i * 11, y - 26); ctx.lineTo(x - 22 + i * 11, y - 14); ctx.stroke(); }
      ctx.fillStyle = "#6a4422"; ctx.fillRect(x + 20, y - 18, 16, 2.5);
      for (const wx of [-13, 13]) { ctx.fillStyle = "#4a2e18"; ctx.beginPath(); ctx.arc(x + wx, y - 8, 8, 0, 7); ctx.fill(); ctx.fillStyle = "#a0703a"; ctx.beginPath(); ctx.arc(x + wx, y - 8, 2.5, 0, 7); ctx.fill(); ctx.strokeStyle = "#a0703a"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + wx - 6, y - 8); ctx.lineTo(x + wx + 6, y - 8); ctx.moveTo(x + wx, y - 14); ctx.lineTo(x + wx, y - 2); ctx.stroke(); }
      break;
    }
    case "hay": {
      shadow(14, 5);
      ctx.fillStyle = "#d8b45a"; ctx.fillRect(x - 13, y - 16, 26, 16);
      ctx.fillStyle = "#e8c86a"; ctx.beginPath(); ctx.ellipse(x, y - 16, 13, 4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(120,80,20,0.45)"; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - 11 + i * 5, y - 13); ctx.lineTo(x - 12 + i * 5, y - 2); ctx.stroke(); }
      ctx.strokeStyle = "#8a5a2a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 13, y - 8); ctx.lineTo(x + 13, y - 8); ctx.stroke();
      break;
    }
    case "board": {
      shadow(14, 4);
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x - 13, y - 34, 3, 34); ctx.fillRect(x + 10, y - 34, 3, 34);
      ctx.fillStyle = "#8a5a2a"; ctx.fillRect(x - 15, y - 38, 30, 22);
      ctx.fillStyle = "#6a4422"; ctx.fillRect(x - 16, y - 40, 32, 3);
      const papers = [[-12, -35, "#f4ecd8"], [-2, -36, "#ffe9a0"], [6, -33, "#f4ecd8"], [-9, -26, "#e8f0ff"]];
      for (const [px, py, c] of papers) { ctx.fillStyle = c; ctx.fillRect(x + px, y + py, 7, 8); ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x + px + 1, y + py + 2, 5, 0.8); ctx.fillRect(x + px + 1, y + py + 4, 4, 0.8); ctx.fillStyle = "#c0203a"; ctx.fillRect(x + px + 3, y + py - 0.5, 1.2, 1.2); }
      break;
    }
    case "tent": {
      ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 1, 32, 8, 0, 0, 7); ctx.fill();
      const c = p.color || "#8a6a4a";
      ctx.fillStyle = shadeCol(c, -0.25); ctx.beginPath(); ctx.moveTo(x, y - 44); ctx.lineTo(x + 30, y); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - 44); ctx.lineTo(x - 30, y); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a1210"; ctx.beginPath(); ctx.moveTo(x - 2, y - 28); ctx.lineTo(x - 12, y); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 15, y - 22); ctx.lineTo(x + 15, y - 22); ctx.stroke();
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x - 1, y - 52, 2, 9);
      ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.moveTo(x + 1, y - 52); ctx.lineTo(x + 10 + Math.sin(time * 3) * 1.5, y - 49); ctx.lineTo(x + 1, y - 46); ctx.fill();
      break;
    }
    case "campfire": {
      ctx.fillStyle = "#6a6a72";
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 11, y - 2 + Math.sin(a) * 5, 3.5, 2.5, 0, 0, 7); ctx.fill(); }
      ctx.strokeStyle = "#4a2e18"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 6, y - 6); ctx.moveTo(x + 8, y); ctx.lineTo(x - 6, y - 6); ctx.stroke();
      const g = ctx.createRadialGradient(x, y - 8, 0, x, y - 8, 30);
      g.addColorStop(0, "rgba(255,170,60,0.4)"); g.addColorStop(1, "rgba(255,120,40,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 8, 30, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const h = 10 + Math.sin(time * 10 + i * 1.9) * 4 + (i === 1 ? 5 : 0), fx = x - 5 + i * 3.3;
        const fg = ctx.createLinearGradient(0, y - 4 - h, 0, y - 3); fg.addColorStop(0, "rgba(255,240,140,0.9)"); fg.addColorStop(1, "#ff5a1a");
        ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(fx - 3, y - 3); ctx.quadraticCurveTo(fx - 2, y - 3 - h * 0.6, fx + Math.sin(time * 8 + i) * 1.2, y - 3 - h); ctx.quadraticCurveTo(fx + 2, y - 3 - h * 0.6, fx + 3, y - 3); ctx.fill();
      }
      for (let i = 0; i < 3; i++) { const ph = (time * 0.9 + i / 3) % 1; ctx.fillStyle = `rgba(255,200,90,${1 - ph})`; ctx.fillRect(x + Math.sin(i * 4 + time * 3) * 6, y - 14 - ph * 30, 1.5, 1.5); }
      break;
    }
    case "shrine": {
      shadow(16, 6);
      const used = p.used;
      ctx.fillStyle = "#8d8a7c"; ctx.fillRect(x - 15, y - 8, 30, 8);
      ctx.fillStyle = "#a9a698"; ctx.fillRect(x - 11, y - 24, 22, 16);
      ctx.fillStyle = "#c9c6b8"; ctx.fillRect(x - 14, y - 27, 28, 4);
      ctx.strokeStyle = used ? "rgba(255,255,255,0.15)" : `rgba(255,138,240,${0.5 + Math.sin(time * 3) * 0.3})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 12); ctx.lineTo(x, y - 20); ctx.lineTo(x + 6, y - 12); ctx.moveTo(x - 3, y - 14); ctx.lineTo(x + 3, y - 14); ctx.stroke();
      const oy = y - 36 + Math.sin(time * 2 + s) * 2.5;
      if (!used) {
        const g = ctx.createRadialGradient(x, oy, 0, x, oy, 26);
        g.addColorStop(0, "rgba(255,170,250,0.55)"); g.addColorStop(1, "rgba(255,138,240,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, oy, 26, 0, 7); ctx.fill();
      }
      const og = ctx.createRadialGradient(x - 2, oy - 2, 1, x, oy, 7);
      og.addColorStop(0, used ? "#d0d0d8" : "#ffffff"); og.addColorStop(1, used ? "#6a6a72" : "#ff6ae6");
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, oy, 6.5, 0, 7); ctx.fill();
      break;
    }
    case "anvil": {
      shadow(12, 4);
      ctx.fillStyle = "#3a3a44"; ctx.fillRect(x - 5, y - 10, 10, 10); ctx.fillRect(x - 8, y - 2, 16, 3);
      ctx.fillStyle = "#5a5a66"; ctx.beginPath(); ctx.moveTo(x - 12, y - 16); ctx.lineTo(x + 9, y - 16); ctx.lineTo(x + 14, y - 13); ctx.lineTo(x + 9, y - 10); ctx.lineTo(x - 9, y - 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(x - 11, y - 16, 19, 1.5);
      const hot = 0.5 + Math.sin(time * 4) * 0.3;
      ctx.fillStyle = `rgba(255,120,40,${hot})`; ctx.fillRect(x - 4, y - 18, 8, 2);
      break;
    }
    case "signpost": {
      shadow(6, 2.5);
      ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x - 1.5, y - 32, 3, 32);
      ctx.fillStyle = "#a0703a";
      ctx.beginPath(); ctx.moveTo(x - 2, y - 30); ctx.lineTo(x + 14, y - 30); ctx.lineTo(x + 18, y - 26.5); ctx.lineTo(x + 14, y - 23); ctx.lineTo(x - 2, y - 23); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 2, y - 21); ctx.lineTo(x - 14, y - 21); ctx.lineTo(x - 18, y - 17.5); ctx.lineTo(x - 14, y - 14); ctx.lineTo(x + 2, y - 14); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 1, y - 27.5, 11, 1); ctx.fillRect(x - 13, y - 18.5, 11, 1);
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
