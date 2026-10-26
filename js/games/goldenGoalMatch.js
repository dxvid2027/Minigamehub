// ==========================================================================
// Golden Goal — the match.
//
// A top-down 11-a-side match on a full 105 × 68 m pitch, in metres and
// seconds, drawn as a floodlit stadium seen from above. Your side always
// attacks to the right; you control one player at a time and the rest of
// both teams play to a formation that slides with the ball.
//
// The simulation is deliberately simple physics plus readable rules:
//   • the ball rolls with drag, flies with gravity and bounces;
//   • whoever reaches a loose ball first controls it;
//   • running into the carrier is a standing tackle, a slide is a gamble;
//   • a keeper decides once per shot whether he gets there.
// Out of play becomes a throw-in, corner or goal kick, taken by whoever is
// nearest, so the match never stalls.
//
// Also here: the penalty shoot-out, a separate behind-the-spot scene.
// ==========================================================================
import { paintBadge, shade, GK_KITS } from "./goldenGoalData.js";
import { audioManager } from "../systems/audioManager.js";

const L = 105, W = 68;
const GOAL_HALF = 3.66, GY0 = W / 2 - GOAL_HALF, GY1 = W / 2 + GOAL_HALF, BAR = 2.44;
const BOX_D = 16.5, BOX_HALF = 20.16;
const M = 13;                 // stadium margin drawn around the lines
const G = 9.81;
const PS = 1.55;              // sprite scale: people are drawn larger than life so they read
const BALL_R = 0.3;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const hyp = Math.hypot;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// x, y as fractions of the pitch from your own goal, role, shirt number.
const FORMATION = [
  [0.02, 0.5, "GK", 1],
  [0.2, 0.13, "DF", 2], [0.17, 0.38, "DF", 4], [0.17, 0.62, "DF", 5], [0.2, 0.87, "DF", 3],
  [0.42, 0.27, "MF", 8], [0.35, 0.5, "MF", 6], [0.42, 0.73, "MF", 10],
  [0.66, 0.15, "FW", 7], [0.71, 0.5, "FW", 9], [0.66, 0.85, "FW", 11],
];

const SKIN = ["#f1c9a5", "#e0ac83", "#c68c5a", "#a7703f", "#8a5530", "#6b3e22", "#4e2c17"];
const HAIR = ["#1b1410", "#2e1f15", "#4a3020", "#6e4a2a", "#b98a4a", "#d9b46a", "#111111", "#3a2a1f"];

const DIFF = {
  Amateur: { cpu: -7, user: 3, think: 0.46, tackle: 0.7, keeper: -0.1, aim: 1.25 },
  Pro: { cpu: 0, user: 0, think: 0.3, tackle: 1, keeper: 0, aim: 1 },
  "World Class": { cpu: 5, user: 0, think: 0.19, tackle: 1.25, keeper: 0.08, aim: 0.8 },
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Distance a rolling ball travels from speed v0 (drag k·v + rolling c). */
const ROLL_K = 0.55, ROLL_C = 1.6;
function rollDistance(v0) { return v0 / ROLL_K - (ROLL_C / (ROLL_K * ROLL_K)) * Math.log(1 + (ROLL_K * v0) / ROLL_C); }
function speedForDistance(d) {
  let lo = 2, hi = 40;
  for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (rollDistance(mid) < d) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// ==========================================================================
// Stadium — painted once into an offscreen canvas and blitted every frame.
// ==========================================================================
function paintStadium(ppm, colA, colB) {
  const cw = Math.round((L + 2 * M) * ppm), ch = Math.round((W + 2 * M) * ppm);
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d");
  const X = (x) => (x + M) * ppm, Y = (y) => (y + M) * ppm;

  // Concrete bowl and stands.
  ctx.fillStyle = "#11141f"; ctx.fillRect(0, 0, cw, ch);
  const crowd = [colA, colB, colA, colB, "#e9e4d8", "#2a2f45", "#c7b48a", "#7a2a35", "#e9e4d8", "#38405e"];
  const seat = 0.62 * ppm;
  ctx.save();
  for (let y = 0; y < ch; y += seat) {
    for (let x = 0; x < cw; x += seat) {
      const wx = x / ppm - M, wy = y / ppm - M;
      const inside = wx > -7.2 && wx < L + 7.2 && wy > -7.2 && wy < W + 7.2;
      if (inside) continue;
      // Tier steps: a darker aisle every few rows.
      const row = Math.floor(Math.max(-wy - 7.2, wy - W - 7.2, -wx - 7.2, wx - L - 7.2) / 0.62);
      if (row % 7 === 6) continue;
      ctx.fillStyle = crowd[(Math.random() * crowd.length) | 0];
      ctx.globalAlpha = 0.55 + Math.random() * 0.4;
      ctx.beginPath(); ctx.arc(x + seat / 2 + rand(-0.6, 0.6), y + seat / 2 + rand(-0.6, 0.6), seat * 0.32, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  // Shade the stands so they fall away from the pitch.
  const shadeBand = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, "rgba(5,6,12,0)"); g.addColorStop(1, "rgba(5,6,12,0.72)");
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  };
  shadeBand(0, 0, cw, Y(-7.2), 0, Y(-7.2), 0, 0);
  shadeBand(0, Y(W + 7.2), cw, ch, 0, Y(W + 7.2), 0, ch);
  shadeBand(0, 0, X(-7.2), ch, X(-7.2), 0, 0, 0);
  shadeBand(X(L + 7.2), 0, cw, ch, X(L + 7.2), 0, cw, 0);

  // Surround: grass apron, then a dark track.
  ctx.fillStyle = "#1f2433"; ctx.fillRect(X(-7.2), Y(-7.2), (L + 14.4) * ppm, (W + 14.4) * ppm);
  ctx.fillStyle = "#246b32"; ctx.fillRect(X(-5.2), Y(-5.2), (L + 10.4) * ppm, (W + 10.4) * ppm);

  // Pitch: mown stripes with a little texture.
  const n = 18;
  for (let i = 0; i < n + 4; i++) {
    const x0 = -5.2 + i * (L / n);
    ctx.fillStyle = i % 2 ? "#2f8f3d" : "#2a8236";
    ctx.fillRect(X(x0), Y(-5.2), (L / n) * ppm + 1, (W + 10.4) * ppm);
  }
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < (L * W) / 2.2; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "#000" : "#bfffb0";
    ctx.fillRect(X(rand(-5, L + 5)), Y(rand(-5, W + 5)), Math.max(1, ppm * 0.18), Math.max(1, ppm * 0.08));
  }
  ctx.restore();

  // Floodlight pools at the four corners and a soft vignette.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  [[-6, -6], [L + 6, -6], [-6, W + 6], [L + 6, W + 6]].forEach(([x, y]) => {
    const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), 70 * ppm);
    g.addColorStop(0, "rgba(255,250,220,0.16)"); g.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  });
  ctx.restore();
  const vg = ctx.createRadialGradient(X(L / 2), Y(W / 2), W * 0.3 * ppm, X(L / 2), Y(W / 2), L * 0.75 * ppm);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vg; ctx.fillRect(X(-5.2), Y(-5.2), (L + 10.4) * ppm, (W + 10.4) * ppm);

  // Lines.
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = Math.max(1, 0.13 * ppm);
  ctx.lineJoin = "round";
  const line = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke(); };
  ctx.strokeRect(X(0), Y(0), L * ppm, W * ppm);
  line([[L / 2, 0], [L / 2, W]]);
  ctx.beginPath(); ctx.arc(X(L / 2), Y(W / 2), 9.15 * ppm, 0, Math.PI * 2); ctx.stroke();
  const spot = (x, y, r = 0.22) => { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(X(x), Y(y), r * ppm, 0, Math.PI * 2); ctx.fill(); };
  spot(L / 2, W / 2, 0.3);
  for (const side of [0, 1]) {
    const gx = side ? L : 0, d = side ? -1 : 1;
    line([[gx, W / 2 - BOX_HALF], [gx + d * BOX_D, W / 2 - BOX_HALF], [gx + d * BOX_D, W / 2 + BOX_HALF], [gx, W / 2 + BOX_HALF]]);
    line([[gx, W / 2 - 9.16], [gx + d * 5.5, W / 2 - 9.16], [gx + d * 5.5, W / 2 + 9.16], [gx, W / 2 + 9.16]]);
    spot(gx + d * 11, W / 2);
    // The "D": the part of the 9.15 m circle round the spot outside the box.
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    if (side) ctx.arc(X(gx - 11), Y(W / 2), 9.15 * ppm, Math.PI - a, Math.PI + a);
    else ctx.arc(X(gx + 11), Y(W / 2), 9.15 * ppm, -a, a);
    ctx.stroke();
    for (const cy of [0, W]) {
      ctx.beginPath();
      ctx.arc(X(gx), Y(cy), 1 * ppm, side ? (cy ? Math.PI : Math.PI / 2) : (cy ? -Math.PI / 2 : 0), side ? (cy ? Math.PI * 1.5 : Math.PI) : (cy ? 0 : Math.PI / 2));
      ctx.stroke();
    }
    // Goal: net in depth behind the line.
    const nx0 = side ? L : -2.2, nw = 2.2;
    ctx.fillStyle = "rgba(10,14,24,0.55)";
    ctx.fillRect(X(nx0), Y(GY0), nw * ppm, (GY1 - GY0) * ppm);
    ctx.save();
    ctx.strokeStyle = "rgba(235,240,255,0.33)"; ctx.lineWidth = Math.max(0.6, 0.04 * ppm);
    for (let gy = GY0; gy <= GY1 + 0.01; gy += 0.4) { ctx.beginPath(); ctx.moveTo(X(nx0), Y(gy)); ctx.lineTo(X(nx0 + nw), Y(gy)); ctx.stroke(); }
    for (let gx2 = nx0; gx2 <= nx0 + nw + 0.01; gx2 += 0.4) { ctx.beginPath(); ctx.moveTo(X(gx2), Y(GY0)); ctx.lineTo(X(gx2), Y(GY1)); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = Math.max(1, 0.08 * ppm);
    ctx.strokeRect(X(nx0), Y(GY0), nw * ppm, (GY1 - GY0) * ppm);
  }

  // Advertising boards along all four sides.
  const ads = [["MEGAPLAY", "#7c5cff"], ["GOLDEN GOAL", "#1f9d55"], ["SEAN", "#ff5470"], ["MEGAPLAY HUB", "#22a6d3"], ["⚽  FOOTBALL", "#ff9f43"]];
  ctx.font = `800 ${Math.round(0.62 * ppm)}px Sora, Inter, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  let ai = 0;
  const board = (x, y, w, h, rot) => {
    const [txt, col] = ads[ai++ % ads.length];
    ctx.save();
    ctx.translate(X(x + w / 2), Y(y + h / 2));
    ctx.rotate(rot);
    const bw = (rot ? h : w) * ppm, bh = (rot ? w : h) * ppm;
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.35));
    ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.fillText(txt, 0, 1);
    ctx.restore();
  };
  for (let x = -2; x < L + 2; x += 10.5) { board(x, -6.1, 10.2, 0.9, 0); board(x, W + 5.2, 10.2, 0.9, 0); }
  for (let y = 4; y < W - 4; y += 10) { board(-6.1, y, 0.9, 9.8, -Math.PI / 2); board(L + 5.2, y, 0.9, 9.8, Math.PI / 2); }

  // Dugouts by the halfway line.
  for (const dx of [-14, 6]) {
    ctx.fillStyle = "rgba(20,24,36,0.92)"; ctx.fillRect(X(L / 2 + dx), Y(W + 4.2), 8 * ppm, 1.2 * ppm);
    ctx.fillStyle = "rgba(160,200,255,0.25)"; ctx.fillRect(X(L / 2 + dx), Y(W + 4.2), 8 * ppm, 0.35 * ppm);
  }
  return c;
}

// ==========================================================================
// Players
// ==========================================================================
function makeTeam(side, team, kit, gkKit, rating) {
  return FORMATION.map(([hx, hy, role, num], i) => {
    const roleSpd = role === "FW" ? 0.3 : role === "MF" ? 0.15 : role === "GK" ? -0.4 : 0;
    const stat = (bias) => clamp(Math.round(rating + bias + rand(-5, 5)), 45, 99);
    return {
      side, i, role, hx, hy, num, kit: role === "GK" ? gkKit : kit,
      x: 0, y: 0, vx: 0, vy: 0, dir: side ? Math.PI : 0,
      spd: 6.25 + (rating - 75) * 0.065 + roleSpd + rand(-0.25, 0.25),
      wit: clamp(1 - (rating - 75) * 0.015, 0.7, 1.3),
      pas: stat(role === "MF" ? 4 : 0), sho: stat(role === "FW" ? 5 : role === "DF" ? -8 : 0),
      tac: stat(role === "DF" ? 6 : role === "FW" ? -8 : 0), ctl: stat(role === "FW" ? 3 : 0),
      skin: SKIN[(Math.random() * SKIN.length) | 0], hair: HAIR[(Math.random() * HAIR.length) | 0],
      phase: Math.random() * 10, anim: Math.random() * 6,
      kickCd: 0, tackleCd: 0, stun: 0, slideT: 0, slideDir: 0, decT: rand(0.2, 0.6), hold: 0, dive: 0, celebrate: 0,
    };
  });
}

// ==========================================================================
// Match
// ==========================================================================
export class Match {
  /**
   * @param {Object} o
   * @param {Object} o.user / o.cpu  team records
   * @param {Object} o.userKit / o.cpuKit
   * @param {number} o.minutes  real minutes for the whole match
   * @param {string} o.difficulty
   * @param {Object} o.input    the game's InputController
   * @param {string} o.label    competition / stage shown on the scoreboard
   * @param {boolean} o.userHome whether the user is the home side (scoreboard order)
   */
  constructor(o) {
    this.o = o;
    this.input = o.input;
    const d = DIFF[o.difficulty] || DIFF.Pro;
    this.diff = d;
    this.teams = [o.user, o.cpu];
    const gk = GK_KITS.slice().sort(() => Math.random() - 0.5);
    this.players = [
      ...makeTeam(0, o.user, o.userKit, gk[0], o.user.r + d.user),
      ...makeTeam(1, o.cpu, o.cpuKit, gk[1], o.cpu.r + d.cpu),
    ];
    this.bySide = [this.players.filter(p => p.side === 0), this.players.filter(p => p.side === 1)];
    this.ball = { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastSide: 0, lastPlayer: null, kind: null, shotId: 0, roll: 0, target: null, inNet: false };
    this.score = [0, 0];
    this.events = [];
    this.halfLen = (o.minutes * 60) / 2;
    this.clock = 0;               // real seconds elapsed in match play
    this.half = 1;
    this.t = 0;
    this.phase = "intro";
    this.phaseT = 0;
    this.banner = { text: "KICK-OFF", sub: `${o.user.name} v ${o.cpu.name}`, t: 0, dur: 1.6 };
    this.toasts = [];
    this.particles = [];
    this.ctrl = this.bySide[0][9];
    this.lastSwitch = 0;
    this.prevPass = false; this.prevShoot = false;
    this.charge = 0; this.charging = false;
    this.kickoffSide = Math.random() < 0.5 ? 0 : 1;
    this.firstKick = this.kickoffSide;
    this.cam = { x: L / 2, y: W / 2 };
    this.stadium = null;
    this.finished = false;
    this.stats = { shots: [0, 0], onTarget: [0, 0], poss: [0, 0] };
    this._kickoffPositions(this.kickoffSide);
  }

  get minute() { return Math.min(90, Math.floor((this.clock / (this.halfLen * 2)) * 90) + 1); }

  // ------------------------------------------------------------ helpers --
  _att(side) { return side === 0 ? 1 : -1; }
  _goalX(side) { return side === 0 ? L : 0; }        // goal this side attacks
  _ownGoalX(side) { return side === 0 ? 0 : L; }
  _possSide() { return this.ball.owner ? this.ball.owner.side : -1; }
  _inOwnBox(p) {
    const gx = this._ownGoalX(p.side);
    return Math.abs(p.x - gx) < BOX_D + 0.5 && Math.abs(p.y - W / 2) < BOX_HALF + 0.5;
  }
  _toast(text, color = "#ffffff") { this.toasts.push({ text, color, t: 0 }); if (this.toasts.length > 3) this.toasts.shift(); }

  _kickoffPositions(side) {
    for (const p of this.players) {
      const att = this._att(p.side);
      let xn = Math.min(0.46, p.hx * 0.62 + 0.02);
      if (p.role === "GK") xn = 0.01;
      let x = p.side === 0 ? xn * L : L - xn * L;
      let y = p.hy * W;
      if (p.side !== side) {
        // Defending side keeps out of the centre circle.
        const dx = x - L / 2, dy = y - W / 2, d = hyp(dx, dy);
        if (d < 10) { x = L / 2 + (dx / (d || 1)) * 10; y = W / 2 + (dy / (d || 1)) * 10; if ((x - L / 2) * att > 0) x = L / 2 - att * 9.5; }
      }
      p.x = x; p.y = y; p.vx = p.vy = 0; p.dir = p.side ? Math.PI : 0;
      p.stun = p.slideT = p.dive = p.celebrate = 0; p.kickCd = 0.2;
    }
    const kicker = this.bySide[side][9], mate = this.bySide[side][7];
    const att = this._att(side);
    kicker.x = L / 2 - att * 0.68; kicker.y = W / 2; kicker.dir = side === 0 ? 0 : Math.PI;
    mate.x = L / 2 - att * 3.5; mate.y = W / 2 + 6;
    Object.assign(this.ball, { x: L / 2, y: W / 2, z: 0, vx: 0, vy: 0, vz: 0, owner: kicker, inNet: false, kind: null, target: null });
    this.setPiece = { kind: "kickoff", side, taker: kicker, x: L / 2, y: W / 2, t: 0 };
    // The picture starts on the centre spot, not wherever the camera was.
    this.cam.x = L / 2; this.cam.y = W / 2;
    if (side === 0) this.ctrl = kicker;
    else this.ctrl = this.bySide[0][9];
  }

  // -------------------------------------------------------------- update --
  update(dt) {
    if (this.finished) return;
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this._step(h);
    this._updateCamera(dt);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < 1.8);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; if (p.vz !== undefined) { p.z += p.vz * dt; p.vz -= 6 * dt; } }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  _step(dt) {
    this.t += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case "intro":
        // Everyone stands on their kick-off spot until the whistle.
        if (this.phaseT > 1.6) { this.phase = "setpiece"; this.phaseT = 0; audioManager.play("start"); }
        break;
      case "setpiece": this.clock += dt; this._setPieceStep(dt); break;
      case "play": this.clock += dt; this._playStep(dt); break;
      case "goal": this._goalStep(dt); break;
      case "dead":
        this.clock += dt;
        this._idle(dt);
        if (this.phaseT > 0.9) this.deadNext();
        break;
      case "half":
        this._idle(dt);
        if (this.phaseT > 2.6) {
          this.half = 2;
          this._kickoffPositions(1 - this.firstKick);
          this.phase = "setpiece"; this.phaseT = 0; audioManager.play("start");
        }
        break;
      case "full":
        this._idle(dt);
        if (this.phaseT > 2.6) this.finished = true;
        break;
    }
    if (this.phase === "play" || this.phase === "setpiece") {
      if (this.half === 1 && this.clock >= this.halfLen) this._whistle("half");
      else if (this.half === 2 && this.clock >= this.halfLen * 2) this._whistle("full");
      const ps = this._possSide();
      if (ps >= 0) this.stats.poss[ps] += dt;
    }
  }

  _whistle(kind) {
    this.phase = kind; this.phaseT = 0;
    this.ball.owner = null; this.ball.vx *= 0.3; this.ball.vy *= 0.3;
    this.banner = kind === "half"
      ? { text: "HALF-TIME", sub: `${this.teams[0].name} ${this.score[0]} – ${this.score[1]} ${this.teams[1].name}`, t: 0, dur: 2.6 }
      : { text: "FULL-TIME", sub: `${this.teams[0].name} ${this.score[0]} – ${this.score[1]} ${this.teams[1].name}`, t: 0, dur: 2.8 };
    audioManager.play("gameover");
  }

  /** Everyone drifts towards their shape; used while the ball is dead. */
  _idle(dt) {
    for (const p of this.players) {
      const tgt = this._formTarget(p);
      this._steer(p, tgt.x, tgt.y, 0.45, dt);
      this._integrate(p, dt);
    }
    this._ballPhysics(dt);
  }

  // ---------------------------------------------------------- movement --
  _steer(p, tx, ty, pace, dt, stopR = 0.35) {
    const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
    let vx = 0, vy = 0;
    if (d > stopR) {
      const sp = Math.min(p.spd * pace, d * 2.2);
      vx = (dx / d) * sp; vy = (dy / d) * sp;
    }
    const k = Math.min(1, dt * 7);
    p.vx += (vx - p.vx) * k; p.vy += (vy - p.vy) * k;
  }

  _integrate(p, dt) {
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.tackleCd = Math.max(0, p.tackleCd - dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.x = clamp(p.x, -1.2, L + 1.2); p.y = clamp(p.y, -2.5, W + 2.5);
    const sp = hyp(p.vx, p.vy);
    if (sp > 0.4 && p.slideT <= 0) {
      const target = Math.atan2(p.vy, p.vx);
      let da = target - p.dir;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      p.dir += da * Math.min(1, dt * 11);
    }
    p.anim += sp * dt * 2.4;
  }

  _separate() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 > 0.64 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = (0.8 - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      }
    }
  }

  /** Where a player wants to stand right now, given the ball and who has it. */
  _formTarget(p) {
    const s = p.side;
    if (p.role === "GK") return { x: this._ownGoalX(s) + this._att(s) * 1.5, y: W / 2 };
    const bxn = s === 0 ? this.ball.x / L : 1 - this.ball.x / L;
    const poss = this._possSide();
    const inPoss = poss === s || (poss < 0 && this.ball.lastSide === s);
    let xn = 0.05 + p.hx * 0.56 + bxn * 0.36 + (inPoss ? 0.07 : -0.05);
    if (!inPoss && p.role === "DF") xn = Math.min(xn, Math.max(0.06, bxn - 0.04));
    if (inPoss && p.role === "FW") xn += 0.05 + Math.sin(this.t * 0.8 + p.phase) * 0.035;
    xn = clamp(xn, 0.05, 0.9);
    let yn = 0.5 + (p.hy - 0.5) * (inPoss ? 0.98 : 0.7) + (this.ball.y / W - 0.5) * 0.32;
    yn += Math.sin(this.t * 0.55 + p.phase * 1.7) * 0.025;
    return { x: s === 0 ? xn * L : (1 - xn) * L, y: clamp(yn, 0.04, 0.96) * W };
  }

  // -------------------------------------------------------------- ball --
  _ballPhysics(dt) {
    const b = this.ball;
    if (b.owner) {
      const o = b.owner;
      const fx = Math.cos(o.dir), fy = Math.sin(o.dir);
      const tx = o.x + fx * 0.68 + o.vx * 0.04, ty = o.y + fy * 0.68 + o.vy * 0.04;
      const k = Math.min(1, dt * 16);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
      b.z = 0; b.vz = 0; b.vx = o.vx; b.vy = o.vy;
      b.roll += hyp(o.vx, o.vy) * dt / 0.11;
      return;
    }
    if (b.inNet) {
      b.vx *= 0.85; b.vy *= 0.85; b.x += b.vx * dt; b.y += b.vy * dt;
      b.x = clamp(b.x, -2.0, L + 2.0); b.y = clamp(b.y, GY0 + 0.25, GY1 - 0.25);
      if (b.z > 0) { b.vz -= G * dt; b.z = Math.max(0, b.z + b.vz * dt); }
      return;
    }
    if (b.z > 0 || b.vz > 0) {
      b.vz -= G * dt;
      b.z += b.vz * dt;
      const air = 1 - 0.12 * dt;
      b.vx *= air; b.vy *= air;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -2.2) { b.vz = -b.vz * 0.42; b.vx *= 0.82; b.vy *= 0.82; }
        else b.vz = 0;
      }
    } else {
      const sp = hyp(b.vx, b.vy);
      if (sp > 0) {
        const nsp = Math.max(0, sp - (ROLL_K * sp + ROLL_C) * dt);
        b.vx *= nsp / sp; b.vy *= nsp / sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.roll += hyp(b.vx, b.vy) * dt / 0.11;
    if (hyp(b.vx, b.vy) < 6 && b.kind === "shot") b.kind = null;
  }

  // ---------------------------------------------------------- set piece --
  _startSetPiece(kind, side, x, y) {
    const b = this.ball;
    const team = this.bySide[side];
    let taker;
    if (kind === "goalkick") taker = team[0];
    else {
      const pool = team.filter(p => p.role !== "GK");
      taker = pool.reduce((best, p) => (hyp(p.x - x, p.y - y) < hyp(best.x - x, best.y - y) ? p : best), pool[0]);
    }
    const att = this._att(side);
    if (kind === "goalkick") { x = this._ownGoalX(side) + att * 5.5; y = W / 2 + (y < W / 2 ? -4 : 4); }
    taker.x = x - (kind === "throw" ? 0 : att * 0.5); taker.y = kind === "throw" ? (y < W / 2 ? -0.4 : W + 0.4) : y;
    if (kind === "corner") taker.x = x - att * 0.4;
    taker.vx = taker.vy = 0;
    taker.dir = kind === "throw" ? (y < W / 2 ? Math.PI / 2 : -Math.PI / 2) : Math.atan2(W / 2 - y, (kind === "corner" ? this._goalX(side) - att * 11 : L / 2) - x);
    Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, owner: taker, kind: null, target: null, inNet: false });
    this.setPiece = { kind, side, taker, x, y, t: 0 };
    this.phase = "setpiece"; this.phaseT = 0;
    if (side === 0) this.ctrl = taker.role === "GK" ? this._nearestOutfield(0, x, y, taker) : taker;
    else if (this.ctrl.side !== 0) this.ctrl = this._nearestOutfield(0, x, y);
    this._toast(kind === "corner" ? "Corner" : kind === "throw" ? "Throw-in" : "Goal kick", "#ffd76a");
  }

  _setPieceStep(dt) {
    const sp = this.setPiece;
    sp.t += dt;
    const taker = sp.taker;
    for (const p of this.players) {
      // At a kick-off nobody moves until the ball is played.
      if (p === taker || sp.kind === "kickoff") { p.vx = p.vy = 0; continue; }
      if (p === this.ctrl && sp.side === 1) { this._userMove(p, dt); this._integrate(p, dt); continue; }
      let tgt = this._setPieceTarget(p, sp);
      this._steer(p, tgt.x, tgt.y, 0.8, dt);
      this._integrate(p, dt);
    }
    this._separate();
    // Opponents keep their distance from the ball.
    if (sp.kind !== "throw") {
      for (const p of this.bySide[1 - sp.side]) {
        const dx = p.x - sp.x, dy = p.y - sp.y, d = hyp(dx, dy);
        if (d < 9.15 && p.role !== "GK") { p.x = sp.x + (dx / (d || 1)) * 9.15; p.y = sp.y + (dy / (d || 1)) * 9.15; }
      }
    }
    this._ballPhysics(dt);
    // The ball sits on its spot until it is taken.
    Object.assign(this.ball, { x: sp.x, y: sp.y, z: 0, vx: 0, vy: 0, vz: 0 });

    const wait = sp.kind === "corner" ? 1.2 : sp.kind === "kickoff" ? 0.6 : 0.75;
    if (sp.t < wait) return;
    if (sp.side === 0 && taker !== this.bySide[0][0]) {
      // Your set piece: you choose when and where.
      const { pass, shoot } = this._buttons();
      if (pass || shoot || sp.t > 6) {
        if (sp.kind === "corner") this._userCross(taker);
        else this._userPass(taker, sp.kind === "throw");
        this.phase = "play"; this.phaseT = 0;
      }
      return;
    }
    this._cpuSetPiece(taker, sp);
    this.phase = "play"; this.phaseT = 0;
  }

  _setPieceTarget(p, sp) {
    const base = this._formTarget(p);
    if (sp.kind !== "corner") return base;
    const goalX = this._goalX(sp.side), att = this._att(sp.side);
    if (p.role === "GK") return base;
    if (p.side === sp.side && (p.role === "FW" || p.role === "MF" || p.i === 2 || p.i === 3)) {
      const slots = [[-6, -4], [-8, 1], [-5, 5], [-11, 0], [-13, -6], [-14, 6], [-7, -1], [-9, 4]];
      const s = slots[p.i % slots.length];
      return { x: goalX + att * s[0], y: W / 2 + s[1] };
    }
    if (p.side !== sp.side && p.role !== "FW") {
      const slots = [[-5, -3], [-6, 2], [-4, 5], [-9, 0], [-10, -5], [-11, 5], [-7, -6], [-3, 0]];
      const s = slots[p.i % slots.length];
      return { x: goalX + att * s[0], y: W / 2 + s[1] };
    }
    return base;
  }

  _cpuSetPiece(taker, sp) {
    const side = taker.side, att = this._att(side);
    if (sp.kind === "corner") {
      const tx = this._goalX(side) - att * rand(6, 12), ty = W / 2 + rand(-6, 6);
      this._loft(taker, tx, ty, rand(7.5, 9));
      return;
    }
    if (sp.kind === "goalkick") {
      const mates = this.bySide[side].filter(p => p.role !== "GK");
      const m = Math.random() < 0.6 ? mates.filter(p => p.role !== "DF")[(Math.random() * 6) | 0] : mates[(Math.random() * 4) | 0];
      if (m.role === "DF") this._passTo(taker, m, false);
      else this._loft(taker, m.x + att * 3, m.y, rand(8, 11));
      return;
    }
    const opt = this._bestPass(taker, true) || { m: this.bySide[side][6], loft: false };
    this._passTo(taker, opt.m, opt.loft, sp.kind === "throw");
  }

  // --------------------------------------------------------------- play --
  /**
   * Button edges for this step. Held state alone misses a tap that starts and
   * ends between two frames, so the latched presses are read as well.
   */
  _buttons() {
    const inp = this.input;
    const passDown = inp.isDown("Space", "KeyJ") || !!inp.virtual.a;
    const shootDown = inp.isDown("KeyK", "KeyX", "KeyL") || !!inp.virtual.b;
    const passTap = inp.consumePressed("Space") | inp.consumePressed("KeyJ") | inp.consumeTap("a");
    const shootTap = inp.consumePressed("KeyK") | inp.consumePressed("KeyX") | inp.consumePressed("KeyL") | inp.consumeTap("b");
    const out = {
      pass: (passDown && !this.prevPass) || !!passTap,
      shoot: (shootDown && !this.prevShoot) || !!shootTap,
      shootDown,
      shootUp: (!shootDown && this.prevShoot) || (!!shootTap && !shootDown),
    };
    this.prevPass = passDown; this.prevShoot = shootDown;
    return out;
  }

  _playStep(dt) {
    const b = this.ball;
    const btn = this._buttons();
    this._userActions(btn, dt);
    this._autoSwitch();

    // Who chases / presses on each side.
    const roles = [this._sideRoles(0), this._sideRoles(1)];
    for (const p of this.players) {
      if (p.stun > 0) { p.stun -= dt; p.vx *= 0.9; p.vy *= 0.9; this._integrate(p, dt); continue; }
      if (p.slideT > 0) { this._slideStep(p, dt); continue; }
      if (p.celebrate > 0) p.celebrate -= dt;
      if (p === this.ctrl) { this._userMove(p, dt); this._integrate(p, dt); continue; }
      if (p.role === "GK") { this._keeperAI(p, dt); this._integrate(p, dt); continue; }
      this._outfieldAI(p, roles[p.side], dt);
      this._integrate(p, dt);
    }
    this._separate();
    this._ballPhysics(dt);
    this._contests(dt);
    this._checkLines();
  }

  _sideRoles(side) {
    const b = this.ball;
    const team = this.bySide[side].filter(p => p.role !== "GK" && p.stun <= 0);
    const target = b.owner || b;
    let best = null, bestT = Infinity, second = null, secondT = Infinity;
    for (const p of team) {
      const t = hyp(target.x - p.x, target.y - p.y) / p.spd;
      if (t < bestT) { second = best; secondT = bestT; best = p; bestT = t; }
      else if (t < secondT) { second = p; secondT = t; }
    }
    if (side === 0) {
      // On your side the human is the first chaser; one AI mate helps out.
      if (best === this.ctrl) return { chaser: null, presser: second && secondT < 2.2 ? second : null, cover: null };
      return { chaser: best, presser: best, cover: second === this.ctrl ? null : second };
    }
    return { chaser: best, presser: best, cover: second };
  }

  _outfieldAI(p, roles, dt) {
    const b = this.ball;
    const o = b.owner;
    if (o === p) { this._carrierAI(p, dt); return; }
    if (!o) {
      if (p === roles.chaser || (b.target === p && b.lastSide === p.side)) {
        // Run to where the ball will be, not where it is.
        const tReach = hyp(b.x - p.x, b.y - p.y) / p.spd;
        const lead = Math.min(tReach, 1.2);
        this._steer(p, b.x + b.vx * lead * 0.6, b.y + b.vy * lead * 0.6, 1, dt, 0.05);
        return;
      }
      const t = this._formTarget(p);
      this._steer(p, t.x, t.y, 0.7, dt);
      return;
    }
    if (o.side === p.side || (o.role === "GK" && this._inOwnBox(o))) {
      const t = this._formTarget(p);
      // Runners offer themselves: wide players hug the line, forwards go long.
      this._steer(p, t.x, t.y, p.role === "FW" ? 0.85 : 0.7, dt);
      return;
    }
    if (p === roles.presser) {
      const lead = 0.25;
      this._steer(p, o.x + o.vx * lead, o.y + o.vy * lead, p.side === 0 ? 0.85 : 1, dt, 0.05);
      return;
    }
    if (p === roles.cover) {
      const gx = this._ownGoalX(p.side), gy = W / 2;
      const dx = gx - o.x, dy = gy - o.y, d = hyp(dx, dy) || 1;
      this._steer(p, o.x + (dx / d) * 6, o.y + (dy / d) * 6, 0.85, dt);
      return;
    }
    const t = this._formTarget(p);
    this._steer(p, t.x, t.y, 0.75, dt);
  }

  _carrierAI(p, dt) {
    const side = p.side, att = this._att(side), gx = this._goalX(side);
    const dGoal = hyp(gx - p.x, W / 2 - p.y);
    const opp = this.bySide[1 - side];
    let nearest = Infinity;
    for (const q of opp) nearest = Math.min(nearest, hyp(q.x - p.x, q.y - p.y));
    p.decT -= dt;
    if (p.decT <= 0) {
      p.decT = this.diff.think * rand(0.7, 1.3) * p.wit * (side === 0 ? 0.8 : 1);
      if (dGoal < 27 && (p.x - gx) * -att > 0) {
        let ps = dGoal < 11 ? 0.7 : dGoal < 17 ? 0.34 : dGoal < 22 ? 0.12 : 0.05;
        if (Math.abs(p.y - W / 2) > 18) ps *= 0.25;
        const blockers = opp.filter(q => q.role !== "GK" && this._nearSegment(q, p.x, p.y, gx, W / 2, 1.6)).length;
        ps *= Math.pow(0.5, blockers);
        if (Math.random() < ps) {
          const far = p.y < W / 2 ? 1 : -1;
          this._shoot(p, far * rand(0.3, 0.95), clamp(0.3 + dGoal / 45, 0.35, 0.95), nearest < 2.5);
          return;
        }
      }
      const pressured = nearest < 2.7;
      const best = this._bestPass(p, pressured);
      if (best && ((pressured && Math.random() < 0.5) || (best.prog > 9 && Math.random() < 0.2) || Math.random() < 0.035)) {
        this._passTo(p, best.m, best.loft);
        return;
      }
    }
    // Dribble towards goal, steering round anyone in the way.
    const aimX = gx - att * 7, aimY = W / 2 + (p.y - W / 2) * 0.35;
    let dx = aimX - p.x, dy = aimY - p.y;
    const d = hyp(dx, dy) || 1; dx /= d; dy /= d;
    let ax = 0, ay = 0;
    for (const q of opp) {
      const qx = q.x - p.x, qy = q.y - p.y, qd = hyp(qx, qy);
      if (qd > 7 || qd < 0.01) continue;
      if (qx * dx + qy * dy < -1) continue;
      const w = 2.2 / (qd * qd);
      ax -= (qx / qd) * w; ay -= (qy / qd) * w;
    }
    // Stay off the touchlines.
    if (p.y < 4) ay += (4 - p.y) * 0.3;
    if (p.y > W - 4) ay -= (p.y - (W - 4)) * 0.3;
    let mx = dx + ax, my = dy + ay;
    const md = hyp(mx, my) || 1;
    this._steer(p, p.x + (mx / md) * 5, p.y + (my / md) * 5, 0.86, dt, 0);
  }

  _nearSegment(q, x0, y0, x1, y1, r) {
    const sx = x1 - x0, sy = y1 - y0, l2 = sx * sx + sy * sy || 1;
    const t = ((q.x - x0) * sx + (q.y - y0) * sy) / l2;
    if (t < 0.08 || t > 0.95) return false;
    return hyp(x0 + sx * t - q.x, y0 + sy * t - q.y) < r;
  }

  _bestPass(p, pressured) {
    const side = p.side, att = this._att(side);
    const opp = this.bySide[1 - side];
    let best = null;
    for (const m of this.bySide[side]) {
      if (m === p || m.stun > 0) continue;
      if (m.role === "GK" && !pressured) continue;
      const d = hyp(m.x - p.x, m.y - p.y);
      if (d < 5 || d > 42) continue;
      const prog = (m.x - p.x) * att;
      let open = 10;
      for (const q of opp) open = Math.min(open, hyp(q.x - m.x, q.y - m.y));
      const lane = opp.some(q => this._nearSegment(q, p.x, p.y, m.x, m.y, 1.5));
      const loft = lane && d > 14;
      const score = prog * 0.08 + open * 0.28 - (lane ? (loft ? 0.9 : 3.2) : 0) - d * 0.025 - (m.role === "GK" ? 2 : 0);
      if (!best || score > best.score) best = { m, score, prog, loft };
    }
    if (!best) return null;
    if (best.score < (pressured ? -2 : 0.4)) return null;
    return best;
  }

  // ----------------------------------------------------------- kicking --
  _release(p, kind, target = null) {
    const b = this.ball;
    b.owner = null; b.lastSide = p.side; b.lastPlayer = p; b.kind = kind; b.target = target; b.inNet = false;
    p.kickCd = 0.28; p.hold = 0;
    if (target) target.kickCd = 0;
  }

  _passTo(p, m, loft = false, thrown = false, firm = false) {
    const lead = Math.min(1.2, hyp(m.x - p.x, m.y - p.y) / (firm ? 26 : 18));
    const tx = m.x + m.vx * lead * 0.8, ty = m.y + m.vy * lead * 0.8;
    if (loft) this._loft(p, tx, ty, clamp(hyp(tx - p.x, ty - p.y) * 0.24, 5, 9.5), m, firm);
    else this._ground(p, tx, ty, m, thrown, firm);
  }

  /** `firm`: your own passes — driven hard and straight at the receiver. */
  _ground(p, tx, ty, target = null, thrown = false, firm = false) {
    const b = this.ball;
    const d = hyp(tx - b.x, ty - b.y) || 1;
    const err = ((100 - p.pas) / 100) * (firm ? 0.03 : 0.16) * gauss();
    const ang = Math.atan2(ty - b.y, tx - b.x) + err;
    const v = firm
      ? clamp(speedForDistance(d + 16), 18, thrown ? 17 : 33)
      : clamp(speedForDistance(d + 3.5), 8, thrown ? 15 : 26);
    this._release(p, "pass", target);
    b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v;
    b.vz = thrown ? 2.6 : 0; b.z = thrown ? 1.8 : 0;
    p.dir = ang;
    audioManager.play("pop");
  }

  _loft(p, tx, ty, vz, target = null, firm = false) {
    const b = this.ball;
    const d = hyp(tx - b.x, ty - b.y) || 1;
    const err = ((100 - p.pas) / 100) * (firm ? 0.03 : 0.12) * gauss();
    const ang = Math.atan2(ty - b.y, tx - b.x) + err;
    const flight = (2 * vz) / G;
    const h = (d * 0.92) / flight;
    this._release(p, "cross", target);
    b.vx = Math.cos(ang) * h; b.vy = Math.sin(ang) * h; b.vz = vz; b.z = 0.05;
    p.dir = ang;
    audioManager.play("swoosh");
  }

  /** aim: −1 … 1 across the goal mouth (from the shooter's view), power 0…1. */
  _shoot(p, aim, power, pressured = false) {
    const b = this.ball, side = p.side, gx = this._goalX(side);
    const skill = p.sho / 100;
    const spread = (0.45 + (1 - skill) * 2.3 + power * 0.9 + (pressured ? 1.1 : 0)) * (side === 1 ? this.diff.aim : 1);
    const ty = W / 2 + aim * 3.2 + gauss() * spread;
    const d = hyp(gx - b.x, ty - b.y) || 1;
    const v = (14 + power * 12.5) * (0.9 + skill * 0.13);
    const ang = Math.atan2(ty - b.y, gx - b.x);
    this._release(p, "shot");
    b.shotId++;
    b.shotDist = d;
    b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v;
    b.vz = 0.6 + power * 3.4 + rand(-0.5, 1.3) * (1.2 - skill) + (d > 22 ? 1 : 0);
    b.z = 0.1;
    p.dir = ang;
    this.stats.shots[side]++;
    if (Math.abs(ty - W / 2) < GOAL_HALF) this.stats.onTarget[side]++;
    audioManager.play("hit");
    this._dust(p.x, p.y, 5);
  }

  // ---------------------------------------------------------- the human --
  _userMove(p, dt) {
    const ax = this.input.axes();
    let mx = ax.x, my = ax.y;
    const m = hyp(mx, my);
    const owner = this.ball.owner === p;
    const top = p.spd * (owner ? 0.9 : 1.04);
    let vx = 0, vy = 0;
    const b = this.ball;
    if (m > 0.15) { const k = Math.min(1, m); vx = (mx / m) * top * k; vy = (my / m) * top * k; }
    else if (!b.owner && b.target === p) {
      // A pass is on its way to you: step towards it so it arrives.
      const dx = b.x - p.x, dy = b.y - p.y, d = hyp(dx, dy);
      if (d > 0.5) { vx = (dx / d) * top; vy = (dy / d) * top; }
    }
    const acc = Math.min(1, dt * (m > 0.15 ? 8 : 6));
    p.vx += (vx - p.vx) * acc; p.vy += (vy - p.vy) * acc;
    if (this.charging && owner) { p.vx *= 0.97; p.vy *= 0.97; }
  }

  _inputDir(p) {
    const ax = this.input.axes();
    const m = hyp(ax.x, ax.y);
    return m > 0.2 ? Math.atan2(ax.y, ax.x) : p.dir;
  }

  _userActions(btn, dt) {
    const p = this.ctrl;
    const has = this.ball.owner === p;
    if (has) {
      if (btn.pass) { this._userPass(p); this.charging = false; this.charge = 0; return; }
      if ((btn.shootDown || btn.shoot) && (this.charging || btn.shoot)) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.85); }
      if (btn.shootUp && this.charging) {
        const ax = this.input.axes();
        const aim = clamp(ax.y * 1.0, -1, 1);
        const dGoal = hyp(L - p.x, W / 2 - p.y);
        if (dGoal > 38) this._loft(p, p.x + Math.cos(this._inputDir(p)) * 32, p.y + Math.sin(this._inputDir(p)) * 32, 6 + this.charge * 6);
        else this._shoot(p, aim, Math.max(0.25, this.charge), this._pressure(p) < 2.2);
        this.charging = false; this.charge = 0;
      }
      return;
    }
    this.charging = false; this.charge = 0;
    if (btn.pass) this._switch(true);
    if (btn.shoot && p.slideT <= 0 && p.stun <= 0 && p.tackleCd <= 0) {
      p.slideT = 0.5; p.slideDir = this._inputDir(p); p.dir = p.slideDir;
      p.tackleCd = 1.1;
      audioManager.play("swoosh");
      this._dust(p.x, p.y, 6);
    }
  }

  _pressure(p) {
    let n = Infinity;
    for (const q of this.bySide[1 - p.side]) n = Math.min(n, hyp(q.x - p.x, q.y - p.y));
    return n;
  }

  _userPass(p, thrown = false) {
    // A pass always finds a team-mate: the one you point at if there is one,
    // otherwise the best open man. It is never just kicked into space.
    const ax = this.input.axes();
    const aimed = hyp(ax.x, ax.y) > 0.2;
    const dir = aimed ? Math.atan2(ax.y, ax.x) : p.dir;
    const fx = Math.cos(dir), fy = Math.sin(dir);
    let best = null, bestS = -Infinity;
    for (const m of this.bySide[0]) {
      if (m === p || m.role === "GK" || m.stun > 0) continue;
      const dx = m.x - p.x, dy = m.y - p.y, d = hyp(dx, dy);
      if (d < 2.5 || d > 55) continue;
      const cos = (dx * fx + dy * fy) / d;
      const lane = this.bySide[1].some(q => this._nearSegment(q, p.x, p.y, m.x, m.y, 1.2));
      let open = 10;
      for (const q of this.bySide[1]) open = Math.min(open, hyp(q.x - m.x, q.y - m.y));
      const s = cos * (aimed ? 4 : 1.5) - d / 35 - (lane ? 1.2 : 0) + open * 0.12 + (dx > 0 ? 0.3 : 0);
      if (s > bestS) { bestS = s; best = { m, lane, d }; }
    }
    if (!best) best = { m: this._nearestOutfield(0, p.x, p.y, p), lane: false, d: 10 };
    this._passTo(p, best.m, !thrown && best.lane && best.d > 16, thrown, true);
  }

  _userCross(p) {
    const tx = L - rand(6, 12), ty = W / 2 + clamp(this.input.axes().y * 6, -7, 7) + rand(-1.5, 1.5);
    this._loft(p, tx, ty, rand(7.8, 9));
  }

  _nearestOutfield(side, x, y, exclude = null) {
    let best = null, bd = Infinity;
    for (const p of this.bySide[side]) {
      if (p.role === "GK" || p === exclude) continue;
      const d = hyp(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _switch(manual = false) {
    const b = this.ball;
    const tx = b.x + b.vx * 0.4, ty = b.y + b.vy * 0.4;
    const next = this._nearestOutfield(0, tx, ty, manual ? this.ctrl : null);
    if (next && next !== this.ctrl) { this.ctrl = next; this.lastSwitch = this.t; if (manual) audioManager.play("select"); }
  }

  _autoSwitch() {
    const b = this.ball;
    if (b.owner && b.owner.side === 0) {
      if (b.owner !== this.ctrl && b.owner.role !== "GK") { this.ctrl = b.owner; this.lastSwitch = this.t; }
      return;
    }
    // A pass to a team-mate hands you the receiver as it travels.
    if (!b.owner && b.lastSide === 0 && b.target && b.target.side === 0 && b.target.role !== "GK") {
      if (this.ctrl !== b.target && this.t - this.lastSwitch > 0.15) { this.ctrl = b.target; this.lastSwitch = this.t; }
      return;
    }
    if (this.t - this.lastSwitch < 0.9 || this.ctrl.slideT > 0) return;
    const tx = b.owner ? b.owner.x : b.x, ty = b.owner ? b.owner.y : b.y;
    const near = this._nearestOutfield(0, tx, ty);
    if (near && near !== this.ctrl && hyp(this.ctrl.x - tx, this.ctrl.y - ty) - hyp(near.x - tx, near.y - ty) > 7) {
      this.ctrl = near; this.lastSwitch = this.t;
    }
  }

  _slideStep(p, dt) {
    p.slideT -= dt;
    const sp = 3 + p.slideT * 12;
    p.vx = Math.cos(p.slideDir) * sp; p.vy = Math.sin(p.slideDir) * sp;
    this._integrate(p, dt);
    if (Math.random() < 0.4) this._dust(p.x, p.y, 1);
    const b = this.ball;
    if (b.z < 0.7 && hyp(b.x - p.x, b.y - p.y) < 1.35 && (b.owner === null || b.owner.side !== p.side)) {
      const victim = b.owner;
      if (!victim || Math.random() < 0.8) {
        if (victim) { victim.stun = 0.75; this._release(victim, null); }
        b.lastSide = p.side; b.lastPlayer = p;
        b.vx = Math.cos(p.slideDir) * 7 + p.vx * 0.2; b.vy = Math.sin(p.slideDir) * 7; b.owner = null; b.target = null;
        p.kickCd = 0.2;
        audioManager.play("hit");
        if (p.side === 0) this._toast("Great tackle!", "#2ee6a6");
      }
    }
    if (p.slideT <= 0) { p.stun = 0.4; p.slideT = 0; }
  }

  // -------------------------------------------------------- goalkeeper --
  _keeperAI(p, dt) {
    const b = this.ball, side = p.side, att = this._att(side), gx = this._ownGoalX(side);
    if (b.owner === p) {
      p.hold += dt;
      p.vx *= 0.8; p.vy *= 0.8;
      if (p.hold > 1.1) {
        const opt = this._bestPass(p, false) || this._bestPass(p, true);
        if (opt && opt.m.role === "DF" && Math.random() < 0.55) this._passTo(p, opt.m, false);
        else {
          const mates = this.bySide[side].filter(m => m.role === "MF" || m.role === "FW");
          const m = mates[(Math.random() * mates.length) | 0];
          this._loft(p, m.x + att * 2, m.y, rand(8, 11), m);
        }
      }
      return;
    }
    // Shot coming: get across.
    if (!b.owner && b.kind === "shot" && b.vx * att < 0) {
      const t = (p.x - b.x) / (b.vx || -1e-6);
      if (t > 0 && t < 1.4) {
        const ty = clamp(b.y + b.vy * t, GY0 - 1.2, GY1 + 1.2);
        const need = Math.abs(ty - p.y);
        if (need > 0.8) p.dive = Math.max(p.dive, 0.5);
        const dsp = (7 + (p.ctl - 70) * 0.05) * (need > 0.8 ? 1.25 : 1);
        const dy = ty - p.y;
        p.vy = clamp(dy * 10, -dsp, dsp);
        p.vx *= 0.8;
        if (p.dive > 0) p.dive -= dt;
        return;
      }
    }
    if (p.dive > 0) { p.dive -= dt; p.vx *= 0.9; p.vy *= 0.9; return; }
    // Someone dribbling into the box: come out, close the angle and go for
    // the ball, rather than waiting on the line to be walked past.
    const o = b.owner;
    if (o && o.side !== side && Math.abs(o.x - gx) < BOX_D + 2 && Math.abs(o.y - W / 2) < BOX_HALF + 1) {
      const dx = gx - o.x, dy = W / 2 - o.y, d = hyp(dx, dy) || 1;
      const close = hyp(o.x - p.x, o.y - p.y) < 3;
      // Stand between the ball and the middle of the goal, then dive in.
      const tx = close ? b.x : o.x + (dx / d) * 1.4, ty = close ? b.y : o.y + (dy / d) * 1.4;
      this._steer(p, tx, ty, 1.05, dt, 0);
      return;
    }
    // Loose ball in the box and nobody closer: come and claim it.
    if (!b.owner && b.kind !== "shot" && Math.abs(b.x - gx) < BOX_D && Math.abs(b.y - W / 2) < BOX_HALF && b.z < 2.4) {
      const mine = hyp(b.x - p.x, b.y - p.y);
      const theirs = Math.min(...this.bySide[1 - side].map(q => hyp(b.x - q.x, b.y - q.y)));
      if (mine < theirs * 0.9 && mine < 12) { this._steer(p, b.x, b.y, 1, dt, 0); return; }
    }
    const bd = hyp(b.x - gx, b.y - W / 2);
    const out = clamp(bd * 0.07, 0.6, 4.2);
    const ty = clamp(W / 2 + (b.y - W / 2) * 0.16, GY0 + 0.5, GY1 - 0.5);
    this._steer(p, gx + att * out, ty, 0.9, dt, 0.15);
  }

  // ------------------------------------------------------ ball contests --
  _contests(dt) {
    const b = this.ball;
    if (b.owner) {
      // Standing tackles: an opponent at the ball gets a chance every so often.
      const o = b.owner;
      if (o.role === "GK" && this._inOwnBox(o)) return;
      for (const p of this.bySide[1 - o.side]) {
        const keeper = p.role === "GK" && this._inOwnBox(p);
        if (p.stun > 0 || p.slideT > 0 || p.tackleCd > 0 || (p.role === "GK" && !keeper)) continue;
        if (hyp(b.x - p.x, b.y - p.y) > (keeper ? 1.5 : 1.05)) continue;
        p.tackleCd = keeper ? 0.35 : 0.55;
        let chance = 0.3 + (p.tac - o.ctl) * 0.008;
        if (keeper) {
          // A keeper at your feet smothers it more often than not.
          chance = 0.55 + (p.ctl - o.ctl) * 0.01;
          if (Math.random() < chance) {
            this._release(o, null); b.owner = p; b.lastSide = p.side; b.lastPlayer = p; p.hold = 0; p.dive = 0.3;
            o.stun = 0.45;
            this._toast(p.side === 0 ? "Keeper claims it!" : "Smothered by the keeper!", "#22d3ee");
            audioManager.play("hit");
            return;
          }
          continue;
        }
        if (p.side === 1) chance *= this.diff.tackle; else chance *= 1.15;
        if (Math.random() < chance) {
          if (Math.random() < 0.65) { this._release(o, null); b.owner = p; b.lastSide = p.side; b.lastPlayer = p; }
          else {
            this._release(o, null); b.lastSide = p.side;
            const a = rand(0, Math.PI * 2); b.vx = Math.cos(a) * 4 + p.vx * 0.3; b.vy = Math.sin(a) * 4 + p.vy * 0.3;
          }
          o.stun = 0.35;
          audioManager.play("step");
          if (p.side === 0 && p === this.ctrl) this._toast("Won it back!", "#2ee6a6");
          return;
        }
      }
      return;
    }
    // Loose ball: nearest player able to reach it takes it.
    let best = null, bd = Infinity;
    const speed = hyp(b.vx, b.vy);
    for (const p of this.players) {
      if (p.stun > 0 || p.kickCd > 0) continue;
      const keeper = p.role === "GK" && this._inOwnBox(p);
      // Your firm passes skim past opponents unless they are right on the line.
      const yourPass = (b.kind === "pass" || b.kind === "cross") && b.lastSide === 0 && b.target && p.side === 1;
      const reach = keeper ? (p.dive > 0 ? 1.9 : 1.3) : yourPass ? 0.55 : 0.9;
      const hmax = keeper ? 2.7 : 1.7;
      if (b.z > hmax) continue;
      const d = hyp(b.x - p.x, b.y - p.y);
      if (d < reach && d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    const p = best;
    const keeper = p.role === "GK" && this._inOwnBox(p);
    if (keeper && b.kind === "shot" && b.lastSide !== p.side) {
      if (b.savedFor === b.shotId) return;
      b.savedFor = b.shotId;
      const across = Math.abs(b.y - W / 2) / GOAL_HALF;
      // Better keepers, longer shots and slower balls are saved more often;
      // anything placed towards a post is harder.
      const chance = clamp(0.7 + (p.ctl - 75) * 0.014 + (p.side === 1 ? this.diff.keeper : 0) - (speed - 18) * 0.022
        - across * 0.24 - b.z * 0.05 + ((b.shotDist || 15) - 13) * 0.013, 0.12, 0.93);
      if (Math.random() > chance) { p.kickCd = 0.8; return; }
      if (speed < 21 && Math.random() < 0.6) {
        b.owner = p; b.kind = null; b.lastSide = p.side; p.hold = 0;
      } else {
        const att = this._att(p.side);
        const out = b.y < W / 2 ? -1 : 1;
        b.kind = null; b.lastSide = p.side; p.kickCd = 0.5;
        if (Math.random() < 0.4) {
          // Tipped round the post: the ball is dead and it is a corner.
          b.vx = -att * rand(1, 3); b.vy = out * rand(6, 9); b.vz = rand(2, 4);
          this.phase = "dead"; this.phaseT = 0;
          this.deadNext = () => this._startSetPiece("corner", 1 - p.side, this._ownGoalX(p.side) + (p.side === 0 ? 0.4 : -0.4), out < 0 ? 0.4 : W - 0.4);
        } else {
          // Parried back into play, pushed wide.
          b.vx = att * rand(0.5, 6); b.vy = out * rand(5, 11) * (Math.random() < 0.2 ? -1 : 1); b.vz = rand(1.5, 4);
        }
      }
      this._toast(p.side === 0 ? "What a save!" : "Saved!", "#22d3ee");
      audioManager.play("hit");
      return;
    }
    // A hard ball is not always tamed.
    const intended = b.target === p;
    if (!keeper && speed > 18 && !intended && Math.random() > 0.45 + p.ctl / 300) {
      b.vx *= -0.25; b.vy = b.vy * 0.4 + rand(-3, 3); p.kickCd = 0.35; b.lastSide = p.side; b.kind = null;
      audioManager.play("step");
      return;
    }
    b.owner = p; b.lastSide = p.side; b.lastPlayer = p; b.kind = null; b.target = null;
    p.hold = 0; p.decT = this.diff.think * rand(0.3, 0.8);
    if (b.z > 0.9) audioManager.play("step");
  }

  // ------------------------------------------------- lines, goals, out --
  _checkLines() {
    const b = this.ball;
    if (b.inNet) return;
    const r = BALL_R * 0.5;
    // Goal lines first: goals, posts, corners and goal kicks.
    for (const end of [0, 1]) {
      const crossed = end === 0 ? b.x < -r : b.x > L + r;
      if (!crossed) continue;
      const scoringSide = end === 0 ? 1 : 0;
      const inMouth = b.y > GY0 && b.y < GY1;
      // You cannot walk the ball into the net: a goal has to be kicked. A
      // ball carried over the line is the keeper's.
      if (b.owner && inMouth) {
        const keeper = this.bySide[end === 0 ? 0 : 1][0];
        const carrier = b.owner;
        this._release(carrier, null);
        b.vx = b.vy = 0;
        Object.assign(b, { x: keeper.x, y: keeper.y, owner: keeper, lastSide: keeper.side, lastPlayer: keeper });
        keeper.hold = 0; carrier.stun = 0.4;
        this._toast("You have to shoot to score!", "#ffd76a");
        audioManager.play("error");
        return;
      }
      // Posts: a ball right on the upright comes back out.
      const nearPost = Math.min(Math.abs(b.y - GY0), Math.abs(b.y - GY1)) < 0.22;
      if (nearPost && b.z < BAR) {
        b.x = end === 0 ? 0.2 : L - 0.2;
        b.vx = -b.vx * 0.55; b.vy += rand(-3, 3);
        b.kind = null;
        this._toast("Off the post!", "#ff9f43");
        audioManager.play("error");
        return;
      }
      if (inMouth && b.z < BAR) { this._goal(scoringSide); return; }
      if (inMouth && b.z < BAR + 0.25) {
        b.x = end === 0 ? 0.2 : L - 0.2; b.vx = -b.vx * 0.4; b.vz = -Math.abs(b.vz) * 0.5;
        this._toast("Off the bar!", "#ff9f43");
        audioManager.play("error");
        return;
      }
      const defender = end === 0 ? 0 : 1;
      if (b.kind === "shot") this._toast(b.z > BAR ? "Over the bar" : "Wide", "#8b90ac");
      if (b.lastSide === defender) this._startSetPiece("corner", scoringSide, end === 0 ? 0.4 : L - 0.4, b.y < W / 2 ? 0.4 : W - 0.4);
      else this._startSetPiece("goalkick", defender, 0, b.y);
      return;
    }
    if (b.y < -r || b.y > W + r) {
      this._startSetPiece("throw", 1 - b.lastSide, clamp(b.x, 1, L - 1), b.y < 0 ? 0 : W);
    }
  }

  _goal(side) {
    const b = this.ball;
    b.inNet = true; b.owner = null; b.kind = null;
    b.x = side === 0 ? L + 0.4 : -0.4;
    b.vx *= 0.3; b.vy *= 0.3; b.vz = 0.5;
    this.score[side]++;
    const scorer = b.lastPlayer && b.lastPlayer.side === side ? b.lastPlayer : this.bySide[side][9];
    this.scorer = scorer;
    this.events.push({ min: this.minute, side, num: scorer.num });
    this.phase = "goal"; this.phaseT = 0;
    this.goalSide = side;
    for (const p of this.bySide[side]) p.celebrate = 3.4;
    this.banner = { text: "GOAL!", sub: `${this.teams[side].name}  ·  #${scorer.num}  ${this.minute}'`, t: 0, dur: 2.8, big: true, color: side === 0 ? "#ffd76a" : "#ff5470" };
    audioManager.play(side === 0 ? "levelup" : "lose");
    // Confetti in the scoring side's colours, thrown from the net.
    const cols = [this.teams[side].home.shirt, this.teams[side].home.trim, "#ffffff", "#ffd76a"];
    for (let i = 0; i < 90; i++) {
      this.particles.push({ x: b.x, y: b.y + rand(-3, 3), z: rand(0, 2), vx: rand(-7, 7) - (side === 0 ? 4 : -4), vy: rand(-7, 7), vz: rand(2, 7), life: rand(1.2, 2.6), color: cols[i % cols.length], size: rand(0.12, 0.26), confetti: true, spin: rand(0, 6) });
    }
  }

  _goalStep(dt) {
    const sc = this.scorer;
    for (const p of this.players) {
      if (p.side === this.goalSide && p.role !== "GK") {
        if (p === sc) {
          // The scorer wheels away towards the corner flag.
          const cx = this.goalSide === 0 ? L - 4 : 4, cy = sc.y < W / 2 ? 4 : W - 4;
          this._steer(p, cx, cy, 0.9, dt, 1);
        } else this._steer(p, sc.x - Math.cos(p.i) * 1.6, sc.y - Math.sin(p.i) * 1.6, 0.95, dt, 0.6);
      } else {
        const t = this._formTarget(p);
        this._steer(p, t.x, t.y, 0.35, dt);
      }
      this._integrate(p, dt);
    }
    this._separate();
    this._ballPhysics(dt);
    if (this.phaseT > 3.4) {
      const half = this.half === 1 && this.clock >= this.halfLen;
      if (half) { this._whistle("half"); return; }
      if (this.half === 2 && this.clock >= this.halfLen * 2) { this._whistle("full"); return; }
      this._kickoffPositions(1 - this.goalSide);
      this.phase = "setpiece"; this.phaseT = 0;
      audioManager.play("start");
    }
  }

  _dust(x, y, n) {
    for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rand(-2, 2), vy: rand(-2, 2), life: rand(0.3, 0.6), color: "rgba(190,230,170,0.55)", size: rand(0.1, 0.22) });
  }

  // ------------------------------------------------------------ camera --
  _view(w, h) {
    const vw = clamp(w / 21, 27, 44);
    return { ppm: w / vw, vw, vh: h / (w / vw) };
  }

  _updateCamera(dt) {
    const b = this.ball;
    let tx = b.x + b.vx * 0.32, ty = b.y + b.vy * 0.25;
    if (this.phase === "goal" && this.scorer) { tx = this.scorer.x; ty = this.scorer.y; }
    const k = Math.min(1, dt * 3.2);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  }

  // ------------------------------------------------------------ render --
  render(ctx, w, h, dpr) {
    const { ppm, vw, vh } = this._view(w, h);
    const preScale = clamp(Math.round(ppm * dpr * 0.95), 8, 19);
    if (!this.stadium || this.stadiumScale !== preScale) {
      this.stadium = paintStadium(preScale, this.teams[0].home.shirt, this.teams[1].home.shirt);
      this.stadiumScale = preScale;
    }
    // Keep the camera inside the stadium.
    const cx = vw >= L + 2 * M ? L / 2 : clamp(this.cam.x, -M + vw / 2, L + M - vw / 2);
    const cy = vh >= W + 2 * M ? W / 2 : clamp(this.cam.y, -M + vh / 2, W + M - vh / 2);
    const S = (x, y) => [(x - cx) * ppm + w / 2, (y - cy) * ppm + h / 2];
    this._S = S; this._ppm = ppm;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0e18"; ctx.fillRect(0, 0, w, h);
    const sx = (cx - vw / 2 + M) * preScale, sy = (cy - vh / 2 + M) * preScale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.stadium, sx, sy, vw * preScale, vh * preScale, 0, 0, w, h);

    this._drawCornerFlags(ctx, S, ppm);

    // Shadows first, then bodies by depth so nobody stands on a head.
    const ps = this.players.slice().sort((a, b) => a.y - b.y);
    for (const p of ps) this._drawShadow(ctx, p, S, ppm);
    this._drawBallShadow(ctx, S, ppm);
    for (const p of ps) {
      if (p === this.ctrl) this._drawMarker(ctx, p, S, ppm);
      this._drawPlayer(ctx, p, S, ppm);
    }
    this._drawBall(ctx, S, ppm);
    this._drawGoalFrames(ctx, S, ppm);
    this._drawParticles(ctx, S, ppm);
    if (this.charging) this._drawPower(ctx, S, ppm);
    this._drawOffscreen(ctx, w, h, S);
    this._drawScoreboard(ctx, w, h);
    this._drawMinimap(ctx, w, h);
    this._drawToasts(ctx, w, h);
    if (this.banner) this._drawBanner(ctx, w, h);
    if (this.phase === "setpiece" && this.setPiece?.side === 0 && this.setPiece.t > 0.6 && this.setPiece.taker.role !== "GK") {
      const k = this.setPiece.kind;
      this._hint(ctx, w, h, k === "corner" ? "Press Pass or Shoot to cross" : k === "throw" ? "Aim and press Pass to throw" : "Press Pass to kick off");
    }
  }

  _hint(ctx, w, h, text) {
    ctx.save();
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(text).width + 26;
    const x = (w - tw) / 2, y = h * 0.3;
    ctx.fillStyle = "rgba(8,10,20,0.72)"; rr(ctx, x, y, tw, 28, 14); ctx.fill();
    ctx.fillStyle = "#ffd76a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, y + 14.5);
    ctx.restore();
  }

  _drawCornerFlags(ctx, S, ppm) {
    for (const [x, y] of [[0, 0], [L, 0], [0, W], [L, W]]) {
      const [px, py] = S(x, y);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath(); ctx.ellipse(px + ppm * 0.5, py + ppm * 0.3, ppm * 0.6, ppm * 0.18, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = Math.max(1, ppm * 0.08);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - ppm * 1.3); ctx.stroke();
      const wave = Math.sin(this.t * 6 + x) * ppm * 0.12;
      ctx.fillStyle = "#ffd400";
      ctx.beginPath(); ctx.moveTo(px, py - ppm * 1.3); ctx.lineTo(px + ppm * 0.75, py - ppm * 1.1 + wave); ctx.lineTo(px, py - ppm * 0.85); ctx.closePath(); ctx.fill();
    }
  }

  _drawShadow(ctx, p, S, ppm) {
    const [x, y] = S(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(x + ppm * 0.28 * PS, y + ppm * 0.22 * PS, ppm * 0.42 * PS, ppm * 0.26 * PS, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMarker(ctx, p, S, ppm) {
    const [x, y] = S(p.x, p.y);
    const pulse = 0.5 + Math.sin(this.t * 6) * 0.5;
    ctx.save();
    ctx.strokeStyle = `rgba(255,215,106,${0.65 + pulse * 0.35})`;
    ctx.lineWidth = Math.max(1.5, ppm * 0.12);
    ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.62 * PS, ppm * 0.48 * PS, 0, 0, Math.PI * 2); ctx.stroke();
    // Number tag above the head.
    const ty = y - ppm * 1.15 * PS - pulse * 2;
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath(); ctx.moveTo(x - 5, ty - 2); ctx.lineTo(x + 5, ty - 2); ctx.lineTo(x, ty + 4); ctx.closePath(); ctx.fill();
    ctx.font = "800 11px Sora, Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,12,20,0.85)"; ctx.strokeText(String(p.num), x, ty - 3);
    ctx.fillText(String(p.num), x, ty - 3);
    ctx.restore();
  }

  _drawPlayer(ctx, p, S, ppm) {
    const [x, y] = S(p.x, p.y);
    const s = ppm * PS;
    const kit = p.kit;
    const sp = hyp(p.vx, p.vy);
    const stride = Math.sin(p.anim) * Math.min(1, sp / 5);
    const sliding = p.slideT > 0, diving = p.role === "GK" && p.dive > 0, down = p.stun > 0.2 && !sliding;
    const cheer = p.celebrate > 0 && this.phase === "goal";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.dir);
    ctx.lineWidth = Math.max(0.8, s * 0.035);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    // Legs and boots.
    const leg = (lat, fwd) => {
      ctx.fillStyle = kit.socks;
      rr(ctx, Math.min(0, fwd * s) - s * 0.05, lat * s - s * 0.06, Math.abs(fwd * s) + s * 0.12, s * 0.12, s * 0.05); ctx.fill();
      ctx.fillStyle = "#15151c";
      ctx.beginPath(); ctx.arc(fwd * s + (fwd >= 0 ? s * 0.04 : -s * 0.04), lat * s, s * 0.075, 0, Math.PI * 2); ctx.fill();
    };
    if (sliding) { leg(-0.1, 0.62); leg(0.12, 0.38); }
    else if (diving) { leg(-0.12, -0.42); leg(0.12, -0.42); }
    else { leg(-0.13, stride * 0.34); leg(0.13, -stride * 0.34); }
    // Shorts.
    ctx.fillStyle = kit.shorts;
    ctx.beginPath(); ctx.ellipse(-s * 0.03, 0, s * 0.16, s * 0.25, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Arms (behind the torso so the shoulders overlap them).
    const swing = cheer ? 0 : -stride * 0.22;
    const armOut = cheer ? 0.52 : diving ? 0.62 : 0.36;
    const sleeve = kit.pattern === "sleeves" ? kit.trim : kit.shirt;
    for (const sgn of [-1, 1]) {
      const ax = (cheer ? 0.18 : swing * sgn) * s, ay = sgn * armOut * s;
      ctx.fillStyle = p.skin;
      ctx.beginPath(); ctx.arc(ax + (cheer ? s * 0.1 : 0), ay * 1.08, s * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.role === "GK" ? shade(kit.shirt, -0.35) : sleeve;
      ctx.beginPath(); ctx.ellipse(ax * 0.6, ay * 0.86, s * 0.1, s * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // Torso with the kit pattern clipped inside.
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.21, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = kit.shirt; ctx.fill();
    ctx.clip();
    ctx.fillStyle = kit.trim;
    const pat = kit.pattern;
    if (pat === "stripes") for (let i = -3; i <= 3; i += 2) ctx.fillRect(-s * 0.3, i * s * 0.09 - s * 0.04, s * 0.6, s * 0.08);
    else if (pat === "hoops") for (let i = -2; i <= 2; i += 2) ctx.fillRect(i * s * 0.08 - s * 0.035, -s * 0.4, s * 0.07, s * 0.8);
    else if (pat === "halves") ctx.fillRect(-s * 0.3, 0, s * 0.6, s * 0.4);
    else if (pat === "band") ctx.fillRect(-s * 0.3, -s * 0.07, s * 0.6, s * 0.14);
    else if (pat === "sash") { ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2); ctx.lineTo(-s * 0.3, -s * 0.05); ctx.lineTo(s * 0.3, s * 0.3); ctx.lineTo(s * 0.3, s * 0.15); ctx.closePath(); ctx.fill(); }
    else if (pat === "checks") { for (let i = -3; i < 3; i++) for (let j = -4; j < 4; j++) if ((i + j) & 1) ctx.fillRect(i * s * 0.08, j * s * 0.09, s * 0.08, s * 0.09); }
    // Shading: light from the top-left of the screen, so rotate it back.
    ctx.rotate(-p.dir);
    const g = ctx.createLinearGradient(-s * 0.3, -s * 0.3, s * 0.3, s * 0.3);
    g.addColorStop(0, "rgba(255,255,255,0.28)"); g.addColorStop(0.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = g; ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.21, s * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    // Collar.
    ctx.strokeStyle = kit.trim; ctx.lineWidth = Math.max(0.8, s * 0.04);
    ctx.beginPath(); ctx.arc(s * 0.01, 0, s * 0.15, -1.1, 1.1); ctx.stroke();
    // Head and hair.
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(s * 0.02, 0, s * 0.145, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.arc(-s * 0.01, 0, s * 0.14, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s * 0.02, 0, s * 0.11, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (down) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = `700 ${Math.round(s * 0.5)}px sans-serif`; ctx.textAlign = "center";
      ctx.fillText("✦", x, y - s * 0.6 + Math.sin(this.t * 8) * 2);
    }
  }

  _drawBallShadow(ctx, S, ppm) {
    const b = this.ball;
    const [x, y] = S(b.x + b.z * 0.35, b.y + b.z * 0.25);
    const r = BALL_R * ppm * (1 + b.z * 0.08);
    ctx.fillStyle = `rgba(0,0,0,${0.38 - Math.min(0.22, b.z * 0.04)})`;
    ctx.beginPath(); ctx.ellipse(x + ppm * 0.08, y + ppm * 0.06, r * 1.05, r * 0.7, 0.5, 0, Math.PI * 2); ctx.fill();
  }

  _drawBall(ctx, S, ppm) {
    const b = this.ball;
    const [x, y0] = S(b.x, b.y);
    const y = y0 - b.z * ppm * 0.55;
    const r = BALL_R * ppm * (1 + b.z * 0.07);
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, "#e9edf5"); g.addColorStop(1, "#9aa3b5");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // Panels that roll with the ball.
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    const dir = Math.atan2(b.vy, b.vx);
    ctx.rotate(dir);
    ctx.fillStyle = "#1b1f2c";
    for (let i = 0; i < 3; i++) {
      const ph = (b.roll + i * 2.1) % (Math.PI * 2);
      const px = Math.cos(ph) * r * 0.75;
      const vis = Math.sin(ph);
      if (vis < -0.2) continue;
      const py = (i - 1) * r * 0.55;
      ctx.beginPath(); ctx.ellipse(px, py, r * 0.26 * Math.max(0.3, vis), r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  _drawGoalFrames(ctx, S, ppm) {
    for (const end of [0, 1]) {
      const gx = end ? L : 0;
      const [x0, y0] = S(gx, GY0), [x1, y1] = S(gx, GY1);
      const back = end ? 2.2 : -2.2;
      const [bx0] = S(gx + back, GY0);
      // Crossbar shadow on the grass.
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(2, ppm * 0.14);
      ctx.beginPath(); ctx.moveTo(x0 + ppm * 0.9, y0 + ppm * 0.6); ctx.lineTo(x1 + ppm * 0.9, y1 + ppm * 0.6); ctx.stroke();
      // Side netting and frame.
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = Math.max(1, ppm * 0.07);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx0, y0); ctx.moveTo(x1, y1); ctx.lineTo(bx0, y1); ctx.stroke();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(2, ppm * 0.16);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.fillStyle = "#ffffff";
      for (const [px, py] of [[x0, y0], [x1, y1]]) { ctx.beginPath(); ctx.arc(px, py, Math.max(2, ppm * 0.14), 0, Math.PI * 2); ctx.fill(); }
      // The net billows where the ball went in.
      if (this.ball.inNet && ((end === 1) === (this.ball.x > L / 2)) && this.phase === "goal") {
        const [nx, ny] = S(this.ball.x, this.ball.y);
        const k = Math.max(0, 1 - this.phaseT / 1.2);
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`; ctx.lineWidth = 1.5;
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(nx, ny, (i * 0.6 + this.phaseT * 3) * ppm, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
  }

  _drawParticles(ctx, S, ppm) {
    for (const p of this.particles) {
      const [x, y] = S(p.x, p.y);
      const a = Math.min(1, p.life * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.confetti) {
        ctx.save(); ctx.translate(x, y - (p.z || 0) * ppm * 0.55); ctx.rotate(p.spin + this.t * 6);
        ctx.fillRect(-p.size * ppm, -p.size * ppm * 0.4, p.size * ppm * 2, p.size * ppm * 0.8);
        ctx.restore();
      } else { ctx.beginPath(); ctx.arc(x, y, p.size * ppm, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  _drawPower(ctx, S, ppm) {
    const p = this.ctrl;
    const [x, y] = S(p.x, p.y);
    const bw = 46, bh = 7, bx = x - bw / 2, by = y + ppm * 0.9 * PS;
    ctx.fillStyle = "rgba(8,10,20,0.75)"; rr(ctx, bx - 2, by - 2, bw + 4, bh + 4, 5); ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, "#2ee6a6"); g.addColorStop(0.6, "#ffd76a"); g.addColorStop(1, "#ff5470");
    ctx.fillStyle = g; rr(ctx, bx, by, Math.max(4, bw * this.charge), bh, 3.5); ctx.fill();
  }

  _drawOffscreen(ctx, w, h, S) {
    const [x, y] = S(this.ctrl.x, this.ctrl.y);
    if (x > 8 && x < w - 8 && y > 8 && y < h - 8) return;
    const cx = clamp(x, 16, w - 16), cy = clamp(y, 16, h - 16);
    const a = Math.atan2(y - h / 2, x - w / 2);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  _drawScoreboard(ctx, w, h) {
    const small = w < 520;
    const H = small ? 26 : 30, pad = 10;
    const order = this.o.userHome ? [0, 1] : [1, 0];
    const [A, B] = order.map(i => this.teams[i]);
    ctx.save();
    ctx.font = `800 ${small ? 12 : 14}px Sora, Inter, sans-serif`;
    const nameW = Math.max(ctx.measureText(A.id).width, ctx.measureText(B.id).width) + 8;
    const badgeW = H * 0.62 * 1.5;
    const scoreW = small ? 50 : 58, clockW = small ? 40 : 48;
    const total = badgeW * 2 + nameW * 2 + scoreW + clockW + 16;
    const x = pad, y = pad;
    ctx.fillStyle = "rgba(8,10,20,0.82)"; rr(ctx, x, y, total, H, 7); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, total - 1, H - 1, 7); ctx.stroke();
    let cx = x + 6;
    const bh = H * 0.62, by = y + (H - bh) / 2;
    paintBadge(ctx, A, cx, by, bh); cx += badgeW + 4;
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(A.id, cx, y + H / 2 + 1); cx += nameW;
    // Score in a bright box.
    const g = ctx.createLinearGradient(0, y, 0, y + H);
    g.addColorStop(0, "#ffe08a"); g.addColorStop(1, "#f2b640");
    ctx.fillStyle = g; rr(ctx, cx, y + 3, scoreW, H - 6, 5); ctx.fill();
    ctx.fillStyle = "#14161f"; ctx.textAlign = "center";
    ctx.fillText(`${this.score[order[0]]} - ${this.score[order[1]]}`, cx + scoreW / 2, y + H / 2 + 1);
    cx += scoreW + 6;
    ctx.fillStyle = "#fff"; ctx.textAlign = "left";
    ctx.fillText(B.id, cx, y + H / 2 + 1); cx += nameW - 2;
    paintBadge(ctx, B, cx, by, bh); cx += badgeW + 4;
    ctx.fillStyle = "rgba(255,255,255,0.1)"; rr(ctx, cx, y + 3, clockW, H - 6, 5); ctx.fill();
    ctx.fillStyle = "#cfe9ff"; ctx.textAlign = "center";
    ctx.font = `700 ${small ? 11 : 13}px Inter, sans-serif`;
    const min = this.phase === "half" ? "HT" : this.phase === "full" || this.finished ? "FT" : `${this.minute}'`;
    ctx.fillText(min, cx + clockW / 2, y + H / 2 + 1);
    // Stage label.
    ctx.font = `600 ${small ? 9.5 : 10.5}px Inter, sans-serif`;
    ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(this.o.label || "", x + 4, y + H + 10);
    ctx.restore();
  }

  _drawMinimap(ctx, w, h) {
    const mw = w < 520 ? 92 : 132, mh = mw * (W / L);
    const x = w - mw - 10, y = 10;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(10,40,22,0.78)"; rr(ctx, x - 3, y - 3, mw + 6, mh + 6, 5); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, mw, mh);
    ctx.beginPath(); ctx.moveTo(x + mw / 2, y); ctx.lineTo(x + mw / 2, y + mh); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + mw / 2, y + mh / 2, mh * 0.13, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(x, y + mh / 2 - mh * 0.3, mw * 0.157, mh * 0.6);
    ctx.strokeRect(x + mw - mw * 0.157, y + mh / 2 - mh * 0.3, mw * 0.157, mh * 0.6);
    const dot = (px, py, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + (px / L) * mw, y + (py / W) * mh, r, 0, Math.PI * 2); ctx.fill(); };
    const cols = [this.o.userKit.shirt, this.o.cpuKit.shirt];
    for (const p of this.players) {
      dot(p.x, p.y, 2.6, "rgba(0,0,0,0.6)");
      dot(p.x, p.y, 2, cols[p.side]);
    }
    dot(this.ctrl.x, this.ctrl.y, 3.4, "#ffd76a");
    dot(this.ctrl.x, this.ctrl.y, 2, cols[0]);
    dot(this.ball.x, this.ball.y, 2.2, "#ffffff");
    ctx.restore();
  }

  _drawToasts(ctx, w, h) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    this.toasts.forEach((t, i) => {
      const a = Math.min(1, (1.8 - t.t) * 3, t.t * 8);
      ctx.globalAlpha = a;
      ctx.font = "800 15px Sora, Inter, sans-serif";
      const y = h * 0.24 + i * 24 - Math.min(8, t.t * 16);
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(8,10,20,0.7)"; ctx.strokeText(t.text, w / 2, y);
      ctx.fillStyle = t.color; ctx.fillText(t.text, w / 2, y);
    });
    ctx.restore();
  }

  _drawBanner(ctx, w, h) {
    const bn = this.banner;
    const tIn = Math.min(1, bn.t * 4), tOut = Math.min(1, (bn.dur - bn.t) * 4);
    const k = Math.min(tIn, tOut);
    ctx.save();
    ctx.globalAlpha = k;
    const bh = bn.big ? Math.min(110, h * 0.26) : Math.min(78, h * 0.2);
    const y = h / 2 - bh / 2;
    const slide = (1 - tIn) * -w * 0.3;
    const g = ctx.createLinearGradient(0, y, w, y + bh);
    const c = bn.color || "#7c5cff";
    g.addColorStop(0, "rgba(8,10,20,0)"); g.addColorStop(0.15, "rgba(8,10,20,0.86)"); g.addColorStop(0.85, "rgba(8,10,20,0.86)"); g.addColorStop(1, "rgba(8,10,20,0)");
    ctx.fillStyle = g; ctx.fillRect(0, y, w, bh);
    ctx.fillStyle = c; ctx.fillRect(w * 0.15, y, w * 0.7, 2); ctx.fillRect(w * 0.15, y + bh - 2, w * 0.7, 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const fs = bn.big ? Math.min(64, w * 0.12) : Math.min(40, w * 0.075);
    ctx.font = `900 ${fs}px Sora, Inter, sans-serif`;
    if (bn.big) { ctx.shadowColor = c; ctx.shadowBlur = 24; }
    const gt = ctx.createLinearGradient(0, y, 0, y + bh);
    gt.addColorStop(0, "#ffffff"); gt.addColorStop(1, bn.big ? c : "#cfd6ff");
    ctx.fillStyle = gt;
    ctx.fillText(bn.text, w / 2 + slide, y + bh * 0.42);
    ctx.shadowBlur = 0;
    if (bn.sub) {
      ctx.font = `600 ${Math.max(11, fs * 0.26)}px Inter, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(bn.sub, w / 2 - slide, y + bh * 0.8);
    }
    ctx.restore();
  }

  /** Final result in the user/cpu frame. */
  get result() { return { user: this.score[0], cpu: this.score[1], events: this.events, stats: this.stats }; }
}

// ==========================================================================
// Penalty shoot-out
// ==========================================================================
export class Shootout {
  /** first: 0 if the user shoots first. */
  constructor({ user, cpu, userKit, cpuKit, input, difficulty }) {
    this.teams = [user, cpu];
    this.kits = [userKit, cpuKit];
    this.input = input;
    this.diff = DIFF[difficulty] || DIFF.Pro;
    this.kicks = [[], []];
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.first = this.turn;
    this.state = "aim";
    this.t = 0; this.st = 0;
    this.finished = false;
    this.gk = [GK_KITS[2], GK_KITS[1]];
    this._newKick();
  }

  _newKick() {
    this.state = "aim"; this.st = 0;
    this.aim = null; this.dive = 0; this.diveT = 0; this.ballT = 0;
    this.choice = null;
    this.outcome = null;
    if (this.turn === 1) {
      // The CPU picks its spot now; you have to guess.
      const miss = Math.random() < 0.07;
      this.cpuAim = { u: rand(-0.95, 0.95) * (miss ? 1.25 : 1), v: rand(0.1, miss ? 1.2 : 0.92) };
    }
  }

  tap(px, py, w) {
    if (this.state !== "aim") return;
    if (this.turn === 0) this._lockShot();
    else this.choice = px < w / 3 ? -1 : px > (w * 2) / 3 ? 1 : 0;
  }

  _lockShot() {
    this.aim = { u: Math.sin(this.t * 2.1) * 1.12, v: 0.5 + Math.sin(this.t * 3.3 + 1) * 0.62 };
    this.state = "flight"; this.st = 0;
    // Keeper reads you roughly a third of the time, better on harder levels.
    const read = 0.3 + (this.diff.keeper || 0) * 2;
    const zone = this.aim.u < -0.33 ? -1 : this.aim.u > 0.33 ? 1 : 0;
    this.dive = Math.random() < read ? zone : [-1, 0, 1][(Math.random() * 3) | 0];
    this.outcome = this._judge(this.aim, this.dive);
    audioManager.play("hit");
  }

  _judge(a, dive) {
    if (Math.abs(a.u) > 1 || a.v > 1 || a.v < 0) return a.v > 1 ? "over" : "wide";
    const corner = Math.abs(a.u) > 0.84 && a.v > 0.72;
    const zone = a.u < -0.33 ? -1 : a.u > 0.33 ? 1 : 0;
    if (dive === zone && !corner) {
      // Low, central shots are easier to keep out than ones in the side netting.
      const p = 0.82 - Math.abs(a.u) * 0.12;
      return Math.random() < p ? "saved" : "goal";
    }
    return "goal";
  }

  update(dt) {
    if (this.finished) return;
    this.t += dt; this.st += dt;
    const inp = this.input;
    const press = inp.isDown("Space", "KeyJ", "KeyK", "KeyX") || inp.virtual.a || inp.virtual.b;
    const tap = ["Space", "KeyJ", "KeyK", "KeyX"].map(k => inp.consumePressed(k)).some(Boolean) | inp.consumeTap("a") | inp.consumeTap("b");
    const edge = (press && !this.prev) || !!tap; this.prev = press;
    if (this.state === "aim") {
      if (this.turn === 0) {
        if (edge && this.st > 0.4) this._lockShot();
      } else {
        const ax = inp.axes();
        if (ax.x < -0.5) this.choice = -1; else if (ax.x > 0.5) this.choice = 1; else if (ax.y < -0.5) this.choice = 0;
        if (this.st > 1.5) {
          this.aim = this.cpuAim;
          this.dive = this.choice ?? 0;
          this.outcome = this._judge(this.aim, this.dive);
          this.state = "flight"; this.st = 0;
          audioManager.play("hit");
        }
      }
    } else if (this.state === "flight") {
      if (this.st > 0.55) {
        this.state = "result"; this.st = 0;
        const scored = this.outcome === "goal";
        this.kicks[this.turn].push(scored);
        const good = (this.turn === 0) === scored;
        audioManager.play(good ? "coin" : "error");
      }
    } else if (this.state === "result" && this.st > 1.3) {
      if (this._decided()) { this.finished = true; return; }
      this.turn = 1 - this.turn;
      this._newKick();
    }
  }

  _decided() {
    const [a, b] = this.kicks;
    const sa = a.filter(Boolean).length, sb = b.filter(Boolean).length;
    if (a.length <= 5 && b.length <= 5) {
      const leftA = 5 - a.length, leftB = 5 - b.length;
      if (sa > sb + leftB || sb > sa + leftA) return true;
      if (a.length === 5 && b.length === 5) return sa !== sb;
      return false;
    }
    return a.length === b.length && sa !== sb;
  }

  get result() { return { user: this.kicks[0].filter(Boolean).length, cpu: this.kicks[1].filter(Boolean).length }; }

  render(ctx, w, h, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Night sky over the stand, then the stand, then the pitch in perspective.
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    sky.addColorStop(0, "#070a16"); sky.addColorStop(1, "#1a2140");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    if (!this.crowd || this.crowdW !== w) {
      this.crowdW = w;
      this.crowd = [];
      const cols = [this.kits[0].shirt, this.kits[1].shirt, "#e9e4d8", "#38405e", "#c7b48a"];
      for (let i = 0; i < 900; i++) this.crowd.push({ x: Math.random() * w, y: h * (0.04 + Math.random() * 0.3), c: cols[(Math.random() * cols.length) | 0], p: Math.random() * 6 });
    }
    for (const c of this.crowd) {
      ctx.fillStyle = c.c; ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.arc(c.x, c.y + Math.sin(this.t * 4 + c.p) * 0.8, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      const fx = w * (0.1 + i * 0.27);
      const g = ctx.createRadialGradient(fx, h * 0.03, 0, fx, h * 0.03, w * 0.22);
      g.addColorStop(0, "rgba(255,250,225,0.35)"); g.addColorStop(1, "rgba(255,250,225,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.5);
    }
    const hz = h * 0.36;
    for (let i = 0; i < 12; i++) {
      const y0 = hz + (h - hz) * Math.pow(i / 12, 1.6), y1 = hz + (h - hz) * Math.pow((i + 1) / 12, 1.6);
      ctx.fillStyle = i % 2 ? "#2f8f3d" : "#2a8236";
      ctx.fillRect(0, y0, w, y1 - y0 + 1);
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, hz, w, 3);

    // Goal.
    const gw = Math.min(w * 0.62, h * 1.25), gh = gw / 3;
    const gx = (w - gw) / 2, gy = hz - gh + h * 0.07;
    this._goalBox = { gx, gy, gw, gh };
    ctx.fillStyle = "rgba(10,14,24,0.5)"; ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = "rgba(235,240,255,0.25)"; ctx.lineWidth = 1;
    for (let x = gx; x <= gx + gw; x += gw / 28) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke(); }
    for (let y = gy; y <= gy + gh; y += gh / 9) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke(); }
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(3, gw * 0.012);
    ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, gy + gh + 1); ctx.lineTo(w, gy + gh + 1); ctx.stroke();

    const U = (u) => gx + gw / 2 + u * gw / 2, V = (v) => gy + gh - v * gh;
    // Keeper.
    const keeperSide = this.turn === 0 ? 1 : 0;
    const kit = this.gk[keeperSide];
    let kx = U(0), ky = gy + gh, rot = 0;
    if (this.state !== "aim") {
      const k = Math.min(1, this.st / 0.32);
      kx = U(this.dive * 0.62 * k);
      ky = gy + gh - (this.dive ? gh * 0.25 * Math.sin(k * Math.PI * 0.8) : 0);
      rot = this.dive * k * 1.2;
    } else kx += Math.sin(this.t * 5) * gw * 0.02;
    const kh = gh * 0.78;
    ctx.save();
    ctx.translate(kx, ky); ctx.rotate(rot);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 0, kh * 0.3, kh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = kit.socks; ctx.fillRect(-kh * 0.12, -kh * 0.32, kh * 0.09, kh * 0.32); ctx.fillRect(kh * 0.03, -kh * 0.32, kh * 0.09, kh * 0.32);
    ctx.fillStyle = kit.shorts; rr(ctx, -kh * 0.15, -kh * 0.45, kh * 0.3, kh * 0.17, kh * 0.04); ctx.fill();
    ctx.fillStyle = kit.shirt; rr(ctx, -kh * 0.18, -kh * 0.8, kh * 0.36, kh * 0.38, kh * 0.08); ctx.fill();
    const armUp = this.state === "aim" ? 0.25 + Math.sin(this.t * 5) * 0.05 : 0.7;
    ctx.strokeStyle = kit.shirt; ctx.lineWidth = kh * 0.08; ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * kh * 0.15, -kh * 0.74); ctx.lineTo(s * kh * (0.3 + armUp * 0.1), -kh * (0.7 + armUp * 0.25)); ctx.stroke();
      ctx.fillStyle = "#f2f2f2"; ctx.beginPath(); ctx.arc(s * kh * (0.3 + armUp * 0.1), -kh * (0.7 + armUp * 0.25), kh * 0.055, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#c68c5a"; ctx.beginPath(); ctx.arc(0, -kh * 0.9, kh * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Ball.
    const spotX = w / 2, spotY = h * 0.86;
    let bx = spotX, by = spotY, br = Math.max(7, w * 0.018);
    if (this.state !== "aim" && this.aim) {
      const k = Math.min(1, this.st / 0.45);
      const ease = 1 - Math.pow(1 - k, 2);
      let tx = U(this.aim.u), ty = V(this.aim.v);
      if (this.outcome === "saved" && k > 0.75) { tx = kx; ty = Math.min(ty, ky - kh * 0.5); }
      bx = spotX + (tx - spotX) * ease;
      by = spotY + (ty - spotY) * ease - Math.sin(k * Math.PI) * h * 0.05;
      br = br * (1 - ease * 0.55);
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(bx, spotY + br * 0.6, br, br * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, br * 0.1, bx, by, br);
    bg.addColorStop(0, "#fff"); bg.addColorStop(1, "#9aa3b5");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1b1f2c"; ctx.beginPath(); ctx.arc(bx, by, br * 0.32, 0, Math.PI * 2); ctx.fill();

    // Aim reticle / dive prompt.
    if (this.state === "aim") {
      if (this.turn === 0) {
        const u = Math.sin(this.t * 2.1) * 1.12, v = 0.5 + Math.sin(this.t * 3.3 + 1) * 0.62;
        const rx = U(u), ry = V(v);
        ctx.strokeStyle = Math.abs(u) > 1 || v > 1 || v < 0 ? "#ff5470" : "#ffd76a";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(rx, ry, 11, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx - 17, ry); ctx.lineTo(rx - 6, ry); ctx.moveTo(rx + 6, ry); ctx.lineTo(rx + 17, ry);
        ctx.moveTo(rx, ry - 17); ctx.lineTo(rx, ry - 6); ctx.moveTo(rx, ry + 6); ctx.lineTo(rx, ry + 17); ctx.stroke();
        this._prompt(ctx, w, h, "Press Shoot / Pass or tap to strike");
      } else {
        const left = Math.max(0, 1.5 - this.st);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        for (let i = 0; i < 3; i++) if (this.choice === i - 1) { ctx.fillStyle = "rgba(255,215,106,0.18)"; ctx.fillRect(U(-1 + i * 2 / 3), gy, gw / 3, gh); }
        ctx.fillStyle = "rgba(8,10,20,0.7)"; rr(ctx, w / 2 - 80, gy - 30, 160, 8, 4); ctx.fill();
        ctx.fillStyle = "#ffd76a"; rr(ctx, w / 2 - 80, gy - 30, 160 * (left / 1.5), 8, 4); ctx.fill();
        this._prompt(ctx, w, h, this.choice === null ? "Pick your dive: ◀  ▲  ▶  (or tap a side)" : `Diving ${this.choice < 0 ? "left" : this.choice > 0 ? "right" : "centre"}…`);
      }
    }
    if (this.state === "result") {
      const good = (this.turn === 0) === (this.outcome === "goal");
      const txt = this.outcome === "goal" ? "GOAL!" : this.outcome === "saved" ? "SAVED!" : this.outcome === "over" ? "OVER!" : "WIDE!";
      ctx.save();
      ctx.font = `900 ${Math.min(56, w * 0.1)}px Sora, Inter, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = good ? "#2ee6a6" : "#ff5470"; ctx.shadowBlur = 22;
      ctx.fillStyle = good ? "#c8ffe9" : "#ffd0d8";
      ctx.fillText(txt, w / 2, h * 0.62);
      ctx.restore();
    }
    this._tally(ctx, w, h);
  }

  _prompt(ctx, w, h, text) {
    ctx.save();
    ctx.font = "700 13px Inter, sans-serif";
    const tw = ctx.measureText(text).width + 26;
    ctx.fillStyle = "rgba(8,10,20,0.72)"; rr(ctx, (w - tw) / 2, h * 0.7, tw, 28, 14); ctx.fill();
    ctx.fillStyle = "#ffd76a"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h * 0.7 + 14.5);
    ctx.restore();
  }

  _tally(ctx, w, h) {
    ctx.save();
    const rowH = 24, x = 12;
    [0, 1].forEach((side, r) => {
      const y = 12 + r * (rowH + 6);
      const n = Math.max(5, this.kicks[0].length, this.kicks[1].length);
      const width = 150 + n * 18;
      ctx.fillStyle = "rgba(8,10,20,0.8)"; rr(ctx, x, y, width, rowH, 6); ctx.fill();
      paintBadge(ctx, this.teams[side], x + 6, y + 5, 14);
      ctx.fillStyle = "#fff"; ctx.font = "800 12px Sora, Inter, sans-serif"; ctx.textBaseline = "middle";
      ctx.fillText(this.teams[side].id, x + 34, y + rowH / 2 + 1);
      ctx.fillText(String(this.kicks[side].filter(Boolean).length), x + 74, y + rowH / 2 + 1);
      for (let i = 0; i < n; i++) {
        const k = this.kicks[side][i];
        ctx.fillStyle = k === undefined ? "rgba(255,255,255,0.18)" : k ? "#2ee6a6" : "#ff5470";
        ctx.beginPath(); ctx.arc(x + 100 + i * 18, y + rowH / 2, 6, 0, Math.PI * 2); ctx.fill();
      }
      if (this.turn === side && !this.finished) { ctx.fillStyle = "#ffd76a"; ctx.beginPath(); ctx.moveTo(x + width + 6, y + rowH / 2); ctx.lineTo(x + width + 14, y + rowH / 2 - 5); ctx.lineTo(x + width + 14, y + rowH / 2 + 5); ctx.closePath(); ctx.fill(); }
    });
    ctx.restore();
  }
}

// ==========================================================================
// Menu backdrop: the empty stadium with a slow drifting camera.
// ==========================================================================
export class StadiumBackdrop {
  constructor(colA = "#1f9d55", colB = "#ffd76a") { this.cols = [colA, colB]; this.t = 0; }
  render(ctx, w, h, dpr, dt) {
    this.t += dt;
    const ppm = clamp(w / 40, 10, 30);
    const pre = clamp(Math.round(ppm * dpr * 0.7), 6, 16);
    if (!this.img || this.pre !== pre) { this.img = paintStadium(pre, ...this.cols); this.pre = pre; }
    const vw = w / ppm, vh = h / ppm;
    const cx = clamp(L / 2 + Math.sin(this.t * 0.05) * 30, -M + vw / 2, L + M - vw / 2);
    const cy = clamp(W / 2 + Math.cos(this.t * 0.07) * 12, -M + vh / 2, W + M - vh / 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.img, (cx - vw / 2 + M) * pre, (cy - vh / 2 + M) * pre, vw * pre, vh * pre, 0, 0, w, h);
    ctx.fillStyle = "rgba(6,8,16,0.55)"; ctx.fillRect(0, 0, w, h);
  }
}
