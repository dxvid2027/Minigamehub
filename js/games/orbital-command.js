// ==========================================================================
// Orbital Command — thirty slingshot problems, solved with gravity.
//
// You aim a probe out of a launch pad and it coasts. Planets pull it, and
// the whole game is in that pull: the direct line to the target is almost
// never the answer, and the elegant solution is usually to fall around
// something first.
//
// Each level has a probe budget. Clear every beacon inside it for three
// stars, one over for two, anything else for one — so a level is finished
// the moment you hit them all, but only *solved* when you find the line
// that does it in one shot.
//
// Levels are generated from the level number, so number 24 is the same
// problem for everyone and stays the same every time you come back to it.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, seededRng } from "../core/utils.js";

const LEVELS = 30;
const G = 5200;              // gravitational constant in world units
const MAX_STEPS = 2600;      // a probe that has not resolved by here is lost
const DT = 1 / 120;          // fixed physics step, independent of frame rate
const TIME_SCALE = 3;        // physics steps run per step of wall clock

// Planet flavours. Mass drives the pull, so a small dense body is a
// different problem from a large light one even at the same radius.
const BODIES = [
  { kind: "rock",  color: "#8a7a5c", edge: "#b8a37a", density: 1.0 },
  { kind: "ice",   color: "#9dc4dd", edge: "#d8ecf7", density: 0.72 },
  { kind: "gas",   color: "#c98f4a", edge: "#f0c07a", density: 0.55 },
  { kind: "iron",  color: "#7c8494", edge: "#b6c0d4", density: 1.7 },
  { kind: "molten",color: "#c9432a", edge: "#ff9b5c", density: 1.35 },
];

export class OrbitalCommandGame extends GameBase {
  getDifficulties() { return ["Mission"]; }
  getInstructions() {
    return [
      "Drag out from the launch pad to aim: the direction sets the heading, the length sets the speed.",
      "Planets pull the probe. The straight line to a beacon is almost never the shot — fall past something instead.",
      "Collect every beacon in one flight. A probe that hits a planet, or drifts off the map, is spent.",
      "Three stars for clearing the level in one probe, two for a second, one for anything after. Stars are saved per level.",
      "Red rings are exclusion zones: crossing one ends that probe. Black holes pull far harder than their size suggests.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag from the pad to aim and set power, release to launch."; }
  getKeyboardHint() { return "Drag from the pad with the mouse. R restarts the level."; }
  getScene() { return "stars"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.orbit) custom.orbit = { stars: {}, cleared: 0 };
    if (!custom.orbit.stars) custom.orbit.stars = {};
    return custom.orbit;
  }
  _save() { saveManager.saveNow(); }
  _totalStars() { return Object.values(this._store().stars).reduce((a, b) => a + b, 0); }
  _unlocked(i) {
    // Levels open in order, but a few stars of slack means one hard level
    // never walls the whole campaign off.
    if (i === 0) return true;
    return this._store().stars[i - 1] > 0 || this._totalStars() >= i * 2;
  }

  getPlayLabel() { return "Mission select"; }
  getStartExtras() {
    const s = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `★ ${this._totalStars()}/${LEVELS * 3}`),
      el("span", {}, `${Object.keys(s.stars).length}/${LEVELS} solved`),
    ]);
  }

  onPlayPressed() { audioManager.play("click"); this.openLevels(); }

  openLevels() {
    const store = this._store();
    const grid = el("div", { class: "orb-grid" });
    for (let i = 0; i < LEVELS; i++) {
      const open = this._unlocked(i);
      const stars = store.stars[i] || 0;
      grid.appendChild(el("button", {
        class: `orb-card${open ? "" : " locked"}${stars === 3 ? " perfect" : ""}`,
        disabled: !open,
        onClick: () => { closeModal(); this.levelIdx = i; this.start(); },
      }, [
        el("span", { class: "n" }, String(i + 1)),
        el("span", { class: "st" }, open ? "★★★".slice(0, stars) + "☆☆☆".slice(0, 3 - stars) : "Locked"),
      ]));
    }
    openModal({
      title: "Mission Select",
      bodyNode: el("div", { class: "orb-picker" }, [
        el("p", { class: "zone-intro" }, `Thirty gravity problems. ★ ${this._totalStars()} of ${LEVELS * 3} collected — three stars means you cleared it with a single probe.`),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "crosshair";
    this.input.onPointer("down", (p) => this._down(p.x, p.y));
    this.input.onPointer("move", (p) => this._move(p.x, p.y));
    this.input.onPointer("up", () => this._up());
    this.input.onKey("KeyR", () => this._resetLevel());
    this.levelIdx = 0;
  }

  onResize() { this._fit(); }

  onStart() {
    this.level = buildLevel(this.levelIdx);
    this._resetLevel();
    this.setScore(0);
  }

  _resetLevel() {
    if (this.state !== "playing" && this.state !== "ready") { /* restart mid-run is fine */ }
    const L = this.level;
    this.beacons = L.beacons.map(b => ({ ...b, got: false, pulse: 0 }));
    this.probe = null;
    this.trail = [];
    this.probesUsed = 0;
    this.aim = null;
    this.explosions = [];
    this.elapsed = 0;
    this.won = false;
    this._fit();
    this._updateHud();
  }

  /** World is 1000x1000; the view scales it to fit the stage. */
  _fit() {
    const W = this.viewW || 600, H = this.viewH || 600;
    this.scale = Math.min(W / 1000, H / 1000);
    this.offX = (W - 1000 * this.scale) / 2;
    this.offY = (H - 1000 * this.scale) / 2;
  }
  _toWorld(x, y) { return { x: (x - this.offX) / this.scale, y: (y - this.offY) / this.scale }; }
  _toScreen(p) { return { x: this.offX + p.x * this.scale, y: this.offY + p.y * this.scale }; }

  // ------------------------------------------------------------- INPUT ---
  _down(x, y) {
    if (this.state !== "playing" || this.probe || this.won) return;
    const p = this._toWorld(x, y);
    const pad = this.level.pad;
    if (Math.hypot(p.x - pad.x, p.y - pad.y) > 220) return;
    this.aim = { x: p.x, y: p.y };
  }
  _move(x, y) { if (this.aim) { const p = this._toWorld(x, y); this.aim.x = p.x; this.aim.y = p.y; } }
  _up() {
    if (!this.aim) return;
    const pad = this.level.pad;
    const dx = this.aim.x - pad.x, dy = this.aim.y - pad.y;
    const len = Math.hypot(dx, dy);
    this.aim = null;
    if (len < 12) return;
    const speed = clamp(len * 1.5, 40, 330);
    this.probe = {
      x: pad.x, y: pad.y,
      vx: (dx / len) * speed, vy: (dy / len) * speed,
      steps: 0, alive: true,
    };
    this.trail = [{ x: pad.x, y: pad.y }];
    this.probesUsed++;
    audioManager.play("shoot");
    this._updateHud();
  }

  // ------------------------------------------------------------ PHYSICS --
  _step(s) { stepBodies(this.level.bodies, s); }
  _hitTest(s) { return hitTest(this.level, s); }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    for (const b of this.beacons) if (b.pulse > 0) b.pulse -= dt;
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].t += dt;
      if (this.explosions[i].t > 0.7) this.explosions.splice(i, 1);
    }
    if (!this.probe) return;

    // Several physics steps per frame so a fast probe cannot tunnel through
    // a planet between frames, and TIME_SCALE of them so a flight resolves in
    // a few seconds — at 1:1 the long slingshots took a tedious twelve.
    const steps = Math.min(60, Math.max(1, Math.round((dt / DT) * TIME_SCALE)));
    for (let k = 0; k < steps; k++) {
      const s = this.probe;
      this._step(s);
      s.steps++;
      this.trail.push({ x: s.x, y: s.y });
      if (this.trail.length > 900) this.trail.shift();

      // Beacons stay collected between probes: a level is finished by
      // clearing them all, and the probe count is what the stars measure.
      for (const b of this.beacons) {
        if (b.got) continue;
        if (Math.hypot(b.x - s.x, b.y - s.y) < b.r) {
          b.got = true; b.pulse = 0.5;
          audioManager.play("coin");
          this.addScore(120);
        }
      }
      if (this.beacons.every(b => b.got)) { this._clear(); return; }

      const hit = this._hitTest(s);
      if (hit) { this._lose(hit); return; }
      if (s.steps > MAX_STEPS) { this._lose("drift"); return; }
    }
    this._updateHud();
  }

  _lose(kind) {
    const s = this.probe;
    this.explosions.push({ x: s.x, y: s.y, t: 0, kind });
    this.probe = null;
    audioManager.play(kind === "hole" ? "warp" : "explosion");
    this.shake();
    this._updateHud();
  }

  _clear() {
    this.won = true;
    this.probe = null;
    const stars = this.probesUsed <= 1 ? 3 : this.probesUsed === 2 ? 2 : 1;
    const store = this._store();
    const prev = store.stars[this.levelIdx] || 0;
    if (stars > prev) store.stars[this.levelIdx] = stars;
    store.cleared = Object.keys(store.stars).length;
    this._save();
    this.addScore(400 + stars * 300 - (this.probesUsed - 1) * 60);
    audioManager.play("win");

    const last = this.levelIdx >= LEVELS - 1;
    this.endGame({
      result: "win", score: this.score,
      message: last
        ? `Every mission flown. ★ ${this._totalStars()} of ${LEVELS * 3}.`
        : `Level ${this.levelIdx + 1} cleared with ${this.probesUsed} probe${this.probesUsed > 1 ? "s" : ""} — ${"★".repeat(stars)}${"☆".repeat(3 - stars)}`,
      extraStats: [
        { label: "Probes", value: this.probesUsed },
        { label: "Stars", value: `${stars}/3` },
        { label: "Total", value: `★ ${this._totalStars()}` },
      ],
    });
  }

  _updateHud() {
    this.setHud({
      Level: `${this.levelIdx + 1}/${LEVELS}`,
      Probes: this.probesUsed,
      Beacons: `${this.beacons.filter(b => b.got).length}/${this.beacons.length}`,
      Stars: `★ ${this._store().stars[this.levelIdx] || 0}`,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    this._drawSpace(ctx, W, H);

    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    this._drawZones(ctx);
    this._drawBodies(ctx);
    this._drawPad(ctx);
    this._drawBeacons(ctx);
    this._drawTrail(ctx);
    if (this.aim) this._drawAim(ctx);
    this._drawProbe(ctx);
    this._drawExplosions(ctx);
    ctx.restore();

    this._drawHint(ctx, W, H);
    ctx.restore();
  }

  _drawSpace(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.8);
    g.addColorStop(0, "#141028"); g.addColorStop(1, "#05030c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // A fixed starfield seeded from the level, so each mission has its own sky.
    if (!this._stars || this._starsFor !== this.levelIdx) {
      const rng = seededRng(`sky-${this.levelIdx}`);
      this._stars = [...Array(130)].map(() => ({ x: rng(), y: rng(), r: rng() * 1.5 + 0.3, a: rng() * 0.7 + 0.2 }));
      this._starsFor = this.levelIdx;
    }
    for (const s of this._stars) {
      ctx.globalAlpha = s.a * (0.7 + Math.sin(this.elapsed * 2 + s.x * 30) * 0.3);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawZones(ctx) {
    for (const z of this.level.zones) {
      ctx.save();
      const pulse = 0.28 + Math.sin(this.elapsed * 2.2) * 0.1;
      ctx.strokeStyle = `rgba(255,84,112,${pulse + 0.3})`;
      ctx.setLineDash([12, 9]);
      ctx.lineDashOffset = -this.elapsed * 18;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,84,112,${pulse * 0.22})`;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
      ctx.restore();
    }
  }

  /** Planets: banded body, terminator shading and a faint gravity halo. */
  _drawBodies(ctx) {
    for (const b of this.level.bodies) {
      if (b.hole) { this._drawHole(ctx, b); continue; }
      // Influence halo, sized by mass — the only cue for how hard it pulls.
      const halo = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.r + b.mass * 22);
      halo.addColorStop(0, hexA(b.edge, 0.16));
      halo.addColorStop(1, hexA(b.edge, 0));
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + b.mass * 22, 0, 7); ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.clip();
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      // Bands rotate slowly, which is what makes a gas giant read as one.
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = b.edge;
      for (let i = -3; i <= 3; i++) {
        const y = b.y + i * b.r * 0.34 + Math.sin(this.elapsed * 0.3 + i) * 2;
        ctx.fillRect(b.x - b.r, y, b.r * 2, b.r * 0.16);
      }
      ctx.globalAlpha = 1;
      // Terminator: light from the top-left.
      const sh = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.4, b.r * 0.15,
                                          b.x, b.y, b.r * 1.25);
      sh.addColorStop(0, "rgba(255,255,255,0.28)");
      sh.addColorStop(0.5, "rgba(0,0,0,0)");
      sh.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = sh;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      ctx.restore();
      ctx.strokeStyle = hexA(b.edge, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke();
    }
  }

  _drawHole(ctx, b) {
    const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.8, b.x, b.y, b.r + b.mass * 26);
    halo.addColorStop(0, "rgba(168,107,255,0.4)");
    halo.addColorStop(1, "rgba(168,107,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + b.mass * 26, 0, 7); ctx.fill();
    // Accretion ring.
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(this.elapsed * 0.8);
    ctx.strokeStyle = "rgba(255,180,255,0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 2.1, b.r * 0.7, 0, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#04020a";
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
  }

  _drawPad(ctx) {
    const p = this.level.pad;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "#3a3f52";
    ctx.beginPath(); ctx.ellipse(0, 8, 30, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#8b90ac";
    ctx.fillRect(-16, -6, 32, 12);
    ctx.fillStyle = "#22d3ee";
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * 11 - 2.5, -4, 5, 8);
    // Launch gantry.
    ctx.strokeStyle = "#8b90ac"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, -6); ctx.lineTo(-14, -34);
    ctx.moveTo(20, -6); ctx.lineTo(14, -34);
    ctx.stroke();
    const pulse = 0.4 + Math.sin(this.elapsed * 3) * 0.3;
    ctx.fillStyle = `rgba(34,211,238,${pulse})`;
    ctx.beginPath(); ctx.arc(0, -40, 5, 0, 7); ctx.fill();
    ctx.restore();
  }

  _drawBeacons(ctx) {
    for (const b of this.beacons) {
      ctx.save();
      ctx.translate(b.x, b.y);
      if (b.got) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = "#2ee6a6"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, b.r * (1 + b.pulse), 0, 7); ctx.stroke();
      } else {
        const spin = this.elapsed * 1.4;
        ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, b.r, spin, spin + 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, b.r, spin + Math.PI, spin + Math.PI + 1.9); ctx.stroke();
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, b.r);
        g.addColorStop(0, "rgba(255,215,106,0.55)");
        g.addColorStop(1, "rgba(255,215,106,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff0ad";
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawTrail(ctx) {
    if (this.trail.length < 2) return;
    ctx.strokeStyle = "rgba(124,240,208,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }

  /**
   * Aim preview: the same integrator run forward for a limited number of
   * steps, so it shows the beginning of the real arc without giving away
   * whether it eventually lands.
   */
  _drawAim(ctx) {
    const pad = this.level.pad;
    const dx = this.aim.x - pad.x, dy = this.aim.y - pad.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = clamp(len * 1.5, 40, 330);
    const ghost = { x: pad.x, y: pad.y, vx: (dx / len) * speed, vy: (dy / len) * speed };
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 260; i++) {
      this._step(ghost);
      if (i % 12 === 0) {
        ctx.globalAlpha = 0.7 * (1 - i / 260);
        ctx.beginPath(); ctx.arc(ghost.x, ghost.y, 2.6, 0, 7); ctx.fill();
      }
      if (this._hitTest(ghost)) break;
    }
    ctx.restore();

    // Power gauge on the aiming line.
    ctx.strokeStyle = "rgba(255,215,106,0.8)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(pad.x, pad.y);
    ctx.lineTo(pad.x + (dx / len) * Math.min(len, 220), pad.y + (dy / len) * Math.min(len, 220));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd76a";
    ctx.font = "800 20px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round((speed / 330) * 100)}%`, pad.x, pad.y - 56);
  }

  _drawProbe(ctx) {
    const s = this.probe;
    if (!s) return;
    const ang = Math.atan2(s.vy, s.vx);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    const g = ctx.createLinearGradient(-16, 0, 0, 0);
    g.addColorStop(0, "rgba(124,240,208,0)");
    g.addColorStop(1, "rgba(124,240,208,0.8)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-18, -3); ctx.lineTo(0, 0); ctx.lineTo(-18, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e6eaf5";
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(-4, -1.5, 4, 3);
    ctx.restore();
  }

  _drawExplosions(ctx) {
    for (const e of this.explosions) {
      const p = e.t / 0.7;
      const r = 6 + p * 46;
      ctx.globalAlpha = Math.max(0, 1 - p);
      const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, r);
      const hot = e.kind === "hole" ? "#c86bff" : e.kind === "zone" ? "#ff5470" : "#ffb347";
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.4, hot); g.addColorStop(1, hexA(hot, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawHint(ctx, W, H) {
    if (this.probe || this.won) return;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(this.elapsed * 3) * 0.22})`;
    ctx.font = "700 12px 'Inter', system-ui, sans-serif";
    const msg = this.probesUsed === 0
      ? (this.useTouch ? "Drag out from the pad to aim" : "Drag out from the pad to aim, release to launch")
      : `Probe ${this.probesUsed} spent — drag again${this.probesUsed >= 2 ? " (R restarts for three stars)" : ""}`;
    ctx.fillText(msg, W / 2, H - 14);
  }
}

/** One fixed gravity step against a set of bodies. */
function stepBodies(bodies, s) {
  let ax = 0, ay = 0;
  for (const b of bodies) {
    const dx = b.x - s.x, dy = b.y - s.y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    const pull = (G * b.mass) / Math.max(d2, 400);
    ax += (dx / d) * pull;
    ay += (dy / d) * pull;
  }
  s.vx += ax * DT; s.vy += ay * DT;
  s.x += s.vx * DT; s.y += s.vy * DT;
}

function hitTest(level, s) {
  for (const b of level.bodies) {
    if (Math.hypot(b.x - s.x, b.y - s.y) < b.r + 4) return b.hole ? "hole" : "crash";
  }
  for (const z of level.zones) {
    if (Math.hypot(z.x - s.x, z.y - s.y) < z.r) return "zone";
  }
  if (s.x < -80 || s.x > 1080 || s.y < -80 || s.y > 1080) return "lost";
  return null;
}

/** Flies one shot and returns the path it traced before it ended. */
function flightPath(level, angle, power, maxSteps = MAX_STEPS) {
  const s = { x: level.pad.x, y: level.pad.y, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power };
  const path = [];
  for (let k = 0; k < maxSteps; k++) {
    stepBodies(level.bodies, s);
    if (hitTest(level, s)) break;
    path.push({ x: s.x, y: s.y });
  }
  return path;
}

/**
 * Builds level `i` from its number.
 *
 * Beacons are not scattered — they are placed *along a trajectory the level
 * has already been shown to produce*. Scattering them at random made 23 of
 * these 30 levels unsolvable in one shot, which is the shot the third star
 * asks for. Generating from a real flight means a perfect line always
 * exists; finding it is the puzzle.
 */
function buildLevel(i) {
  const rng = seededRng(`orbital-v2-${i}`);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const between = (a, b) => a + rng() * (b - a);

  const bodyCount = clamp(1 + Math.floor(i / 4), 1, 5);
  const beaconCount = i < 3 ? 1 : clamp(1 + Math.floor((i - 1) / 6), 1, 4);
  const zoneCount = i < 8 ? 0 : clamp(Math.floor((i - 6) / 7), 0, 3);
  const wantHole = i >= 14 && (i % 5 === 4 || i >= 24);

  // Attempts: a whole level layout is cheap to throw away, and rejecting a
  // layout whose flights are all short is what keeps the late levels from
  // degenerating into "fire straight up".
  for (let attempt = 0; attempt < 40; attempt++) {
    const pad = { x: between(80, 200), y: between(150, 850) };
    const bodies = [];
    const far = (x, y, r) => {
      if (Math.hypot(x - pad.x, y - pad.y) < r + 150) return false;
      for (const b of bodies) if (Math.hypot(x - b.x, y - b.y) < r + b.r + 60) return false;
      return true;
    };
    for (let k = 0; k < bodyCount; k++) {
      for (let t = 0; t < 60; t++) {
        const r = between(38, 78) * (1 - k * 0.05);
        const x = between(320, 900), y = between(110, 890);
        if (!far(x, y, r)) continue;
        const kind = pick(BODIES);
        bodies.push({ x, y, r, mass: (r / 44) * kind.density, hole: false, ...kind });
        break;
      }
    }
    if (wantHole) {
      for (let t = 0; t < 60; t++) {
        const r = 20, x = between(380, 880), y = between(140, 860);
        if (!far(x, y, r + 40)) continue;
        bodies.push({ x, y, r, mass: 3.4, hole: true, color: "#04020a", edge: "#c86bff" });
        break;
      }
    }
    const level = { pad, bodies, beacons: [], zones: [] };

    // Find the longest, most interesting flight this layout produces.
    let bestPath = null;
    for (let t = 0; t < 150; t++) {
      const angle = rng() * Math.PI * 2;
      const power = between(70, 300);
      // Capped shorter than a real flight: generation only needs to know the
      // shape of the arc, and 40 attempts x 150 shots adds up fast.
      const path = flightPath(level, angle, power, 1500);
      if (path.length < 380) continue;
      // Prefer a path that actually travels: total arc length, not step count,
      // so a probe stuck in a tight orbit does not win.
      let span = 0;
      for (let k = 8; k < path.length; k += 8) span += Math.hypot(path[k].x - path[k - 8].x, path[k].y - path[k - 8].y);
      if (!bestPath || span > bestPath.span) bestPath = { path, span };
    }
    if (!bestPath) continue;

    // Beacons go on points of that path that are actually valid spots —
    // clear of every planet, inside the map, and far enough from the pad.
    // Collecting the candidates first and then spreading the beacons across
    // them is what makes four-beacon levels generate at all: picking fixed
    // fractions of the path and rejecting the layout whenever one landed in
    // a planet threw away every late level.
    const path = bestPath.path;
    const cand = [];
    for (let k = Math.floor(path.length * 0.14); k < path.length; k += 3) {
      const p = path[k];
      if (p.x < 40 || p.x > 960 || p.y < 40 || p.y > 960) continue;
      if (Math.hypot(p.x - pad.x, p.y - pad.y) < 240) continue;
      let ok = true;
      for (const b of bodies) if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 24) { ok = false; break; }
      if (ok) cand.push(p);
    }
    if (!cand.length) continue;
    for (let k = 0; k < beaconCount; k++) {
      const p = cand[Math.min(cand.length - 1, Math.floor((cand.length * (k + 0.5)) / beaconCount))];
      // Beacons that would overlap read as one, so keep them apart.
      if (level.beacons.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 70)) continue;
      level.beacons.push({ x: p.x, y: p.y, r: 26 });
    }
    if (!level.beacons.length) continue;

    // Exclusion zones go anywhere the winning path does not run, so they
    // narrow the search without invalidating the solution.
    for (let k = 0; k < zoneCount; k++) {
      for (let t = 0; t < 120; t++) {
        const r = between(52, 92);
        const x = between(300, 900), y = between(120, 880);
        if (Math.hypot(x - pad.x, y - pad.y) < r + 200) continue;
        let ok = true;
        for (const b of bodies) if (Math.hypot(x - b.x, y - b.y) < r + b.r + 20) ok = false;
        for (const b of level.beacons) if (Math.hypot(x - b.x, y - b.y) < r + 70) ok = false;
        for (const z of level.zones) if (Math.hypot(x - z.x, y - z.y) < r + z.r + 20) ok = false;
        if (ok) for (let q = 0; q < path.length; q += 4) {
          if (Math.hypot(x - path[q].x, y - path[q].y) < r + 12) { ok = false; break; }
        }
        if (ok) { level.zones.push({ x, y, r }); break; }
      }
    }
    return level;
  }

  // Fallback for the (unreached in testing) case where every layout is
  // rejected: one planet, and a beacon placed on a flight this layout is
  // known to produce — never a guessed position, which would be unsolvable.
  const pad = { x: 140, y: 500 };
  const level = {
    pad,
    bodies: [{ x: 520, y: 500, r: 60, mass: 1.4, hole: false, ...BODIES[0] }],
    beacons: [],
    zones: [],
  };
  const p = flightPath(level, -0.35, 190, 1200);
  const spot = p[Math.floor(p.length * 0.6)] || { x: 860, y: 320 };
  level.beacons.push({ x: spot.x, y: spot.y, r: 26 });
  return level;
}

function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export default OrbitalCommandGame;
