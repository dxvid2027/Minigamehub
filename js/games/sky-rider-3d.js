// ==========================================================================
// Sky Rider 3D — fly a glider through a canyon of light rings.
//
// Free 2D movement inside a tube: rings score points and top up your boost,
// rock pillars cost shield. The camera banks with your input, which is what
// sells the sense of flight.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randInt } from "../core/utils.js";

const BOUND_X = 13;
const BOUND_Y = 8;
const VISIBLE = 260;

export class SkyRider3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Steer the glider up, down, left and right through the canyon.",
      "Fly through the glowing rings — each one scores and refills your boost.",
      "Rock pillars cost one shield; three hits and the flight is over.",
      "Hold boost for extra speed and extra points per ring.",
    ];
  }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "Drag to fly; press the round ● button to boost."; }
  getKeyboardHint() { return "Arrow keys / WASD to fly, Space to boost."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#0a1338", fogColor: "#132048", fog: [90, 300],
      sky: "linear-gradient(#070c2c 0%, #3b3f8e 60%, #c2609a 88%, #ffb37a 100%)",
      lightDir: [0.3, 0.8, 0.5], ambientSky: "#8390d8", ambientGround: "#232a52",
    })) return;

    const e = this.engine;
    // Seen from behind, boxes read far better than a cone (whose base just
    // looks like a disc), so the glider is built from simple solids.
    e.mesh("fuselage", () => Geometry.box(0.72, 0.5, 2.8));
    e.mesh("nose", () => Geometry.cone(0.45, 1.4, 10));
    e.mesh("wing", () => Geometry.box(2.3, 0.14, 0.95));
    e.mesh("tailFin", () => Geometry.box(0.14, 0.85, 0.75));
    e.mesh("tailPlane", () => Geometry.box(1.3, 0.12, 0.5));
    e.mesh("ring", () => Geometry.torus(3.1, 0.34, 24, 10));
    e.mesh("pillar", () => Geometry.cylinder(0.95, 26, 12));
    e.mesh("floor", () => Geometry.plane(60, 240));
    e.mesh("wall", () => Geometry.box(1.2, 26, 240));
    e.mesh("strip", () => Geometry.box(0.4, 0.4, 240));
    e.mesh("arch", () => Geometry.torus(9, 0.8, 18, 8));
    e.mesh("orb", () => Geometry.sphere(0.4, 12, 10));

    e.texture("rock", () => Textures.rock(256, "#5a5f86"));
    e.texture("gridTex", () => Textures.grid(256, { bg: "#0c1130", line: "#7c5cff", cells: 4, width: 3 }));
    e.texture("metal", () => Textures.metal(128, "#a8b6f0"));

    this.input.onPointer("move", (p) => { this._drag = { x: p.x, y: p.y }; });
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    const cfg = {
      Easy:   { speed: 40, ramp: 0.6, pillars: 0.45, ringGap: 30 },
      Normal: { speed: 52, ramp: 1.0, pillars: 0.7, ringGap: 26 },
      Hard:   { speed: 64, ramp: 1.5, pillars: 1.0, ringGap: 22 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.z = 0;
    this.speed = cfg.speed;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.bank = 0; this.pitch = 0;
    this.shield = 3;
    this.boost = 1;
    this.rings = [];
    this.pillars = [];
    this.ringsPassed = 0;
    this.nextRing = 70;
    // Start the pillars well ahead so the flight never opens inside one.
    this.nextPillar = 150;
    this.invuln = 0;
    this._drag = null;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Rings: this.ringsPassed,
      Shield: "◆".repeat(Math.max(0, this.shield)) || "—",
    });
  }

  onUpdate(dt) {
    if (!this.canPlay) return;
    const cfg = this.cfg;

    const boosting = (this.input.isDown("Space") || this.input.virtual.a) && this.boost > 0;
    this.boost = clamp(this.boost + (boosting ? -dt * 0.45 : dt * 0.12), 0, 1);
    this.speed += ((cfg.speed + this.z * 0.0022 * cfg.ramp * 40 + (boosting ? 26 : 0)) - this.speed) * Math.min(1, dt * 2);
    this.z += this.speed * dt;

    // --- flight input -> velocity (with a little inertia so it feels like flying)
    let ax = 0, ay = 0;
    const a = this.input.axes();
    ax = a.x;
    ay = -a.y;                               // stick pushed up climbs
    if (this._drag) {
      ax = clamp((((this._drag.x / this.viewW) * 2 - 1) * BOUND_X - this.x) * 0.35, -1, 1);
      ay = clamp(((1 - (this._drag.y / this.viewH) * 2) * BOUND_Y - this.y) * 0.35, -1, 1);
    }
    this.vx = clamp(this.vx + ax * 90 * dt, -26, 26) * 0.94;
    this.vy = clamp(this.vy + ay * 74 * dt, -20, 20) * 0.94;
    this.x = clamp(this.x + this.vx * dt, -BOUND_X, BOUND_X);
    this.y = clamp(this.y + this.vy * dt, -BOUND_Y, BOUND_Y);
    this.bank += (-this.vx * 0.035 - this.bank) * Math.min(1, dt * 6);
    this.pitch += (this.vy * 0.018 - this.pitch) * Math.min(1, dt * 6);

    if (this.invuln > 0) this.invuln -= dt;

    // --- stream the canyon ---
    while (this.nextRing < this.z + VISIBLE) {
      this.rings.push({
        z: this.nextRing,
        x: (Math.random() * 2 - 1) * (BOUND_X - 4),
        y: (Math.random() * 2 - 1) * (BOUND_Y - 3),
        passed: false, spin: Math.random() * Math.PI,
      });
      this.nextRing += cfg.ringGap + randInt(-6, 10);
    }
    while (this.nextPillar < this.z + VISIBLE) {
      this.pillars.push({ z: this.nextPillar, x: (Math.random() * 2 - 1) * BOUND_X, flip: Math.random() > 0.5 });
      this.nextPillar += randInt(26, 60) / cfg.pillars;
    }
    this.rings = this.rings.filter(r => r.z > this.z - 20);
    this.pillars = this.pillars.filter(p => p.z > this.z - 20);

    // --- scoring & collisions ---
    for (const r of this.rings) {
      if (r.passed || r.z > this.z) continue;
      r.passed = true;
      const dist = Math.hypot(r.x - this.x, r.y - this.y);
      if (dist < 3.0) {
        this.ringsPassed++;
        this.boost = clamp(this.boost + 0.25, 0, 1);
        this.addScore(boosting ? 90 : 60);
        audioManager.play("coin");
        this.particles.burst(0, 0, { count: 4 });
      }
    }
    for (const p of this.pillars) {
      const rel = p.z - this.z;
      if (rel < -2 || rel > 2 || this.invuln > 0) continue;
      // Pillars hang from the roof or rise from the floor; the gap is the
      // other half of the tube.
      const inX = Math.abs(p.x - this.x) < 1.9;
      const inY = p.flip ? this.y > -1.5 : this.y < 1.5;
      if (inX && inY) { this._hit(); break; }
    }
    this.addScore(Math.round(this.speed * dt * 0.6));
    this._updateHud();
  }

  _hit() {
    this.shield -= 1;
    this.invuln = 1.8;
    this.shake();
    audioManager.play("explosion");
    this.vibrateOn(60);
    this._updateHud();
    if (this.shield <= 0) {
      audioManager.play("gameover");
      this.endGame({
        result: "loss", score: this.score,
        message: `${this.ringsPassed} rings threaded over ${Math.round(this.z)} m.`,
        extraStats: [{ label: "Rings", value: this.ringsPassed }, { label: "Distance", value: `${Math.round(this.z)} m` }],
      });
    }
  }

  onRender(ctx, dt) {
    if (!this.canPlay) return;
    const e = this.engine;

    e.camera.fov = 66 + (1 - this.boost) * 2;
    // Slightly above and well behind, so the glider stays small and the
    // canyon ahead does the talking.
    e.camera.pos = [this.x * 0.5, this.y * 0.45 + 3.4, -this.z + 15];
    e.camera.target = [this.x * 0.26, this.y * 0.3, -(this.z + 34)];
    e.camera.up = [Math.sin(this.bank * 0.8), Math.cos(this.bank * 0.8), 0];
    e.beginFrame();

    // The canyon is streamed as 240-unit blocks so it always surrounds the
    // glider without drawing kilometres of geometry.
    const BLOCK = 240;
    const base = Math.floor(this.z / BLOCK) * BLOCK;
    for (const off of [0, BLOCK, BLOCK * 2]) {
      const cz = -(base + off + BLOCK / 2 - 60);
      e.draw("floor", { pos: [0, -BOUND_Y - 3, cz], color: "#243066", texture: "gridTex", uvScale: [3, 12] });
      e.draw("floor", { pos: [0, BOUND_Y + 3, cz], rot: [Math.PI, 0, 0], color: "#1d2450", texture: "gridTex", uvScale: [3, 12] });
      e.draw("wall", { pos: [-BOUND_X - 3.5, 0, cz], color: "#5d6591", texture: "rock", uvScale: [1, 12] });
      e.draw("wall", { pos: [BOUND_X + 3.5, 0, cz], color: "#5d6591", texture: "rock", uvScale: [1, 12] });
      e.draw("strip", { pos: [-BOUND_X - 2.6, -BOUND_Y - 1.5, cz], color: "#7c5cff", emissive: 0.9 });
      e.draw("strip", { pos: [BOUND_X + 2.6, -BOUND_Y - 1.5, cz], color: "#22d3ee", emissive: 0.9 });
    }
    // Occasional arches to break up the corridor.
    for (let i = 0; i < 3; i++) {
      const az = base + i * 120 + 90;
      e.draw("arch", { pos: [0, -1, -az], rot: [0, 0, 0], color: "#7c5cff", emissive: 0.3, alpha: 0.85 });
    }

    for (const p of this.pillars) {
      const y = p.flip ? BOUND_Y + 4 : -BOUND_Y - 4;
      e.draw("pillar", { pos: [p.x, y, -p.z], color: "#9aa0c8", texture: "rock", uvScale: [1, 3] });
    }

    this._spin = (this._spin || 0) + (dt || 0);
    for (const r of this.rings) {
      const hit = r.passed;
      e.draw("ring", {
        pos: [r.x, r.y, -r.z],
        rot: [0, 0, r.spin + this._spin * 0.6],
        color: hit ? "#3a4680" : "#3ce6ff",
        emissive: hit ? 0.25 : 0.95,
      });
    }

    if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
      const gx = this.x, gy = this.y, gz = -this.z;
      // Nose points down -Z (the direction of travel); the fuselage sits under
      // it and the engine glow trails behind.
      e.draw("glider", { pos: [gx, gy, gz - 0.9], rot: [-Math.PI / 2 + this.pitch, 0, this.bank], color: "#f4f6ff", texture: "metal", uvScale: [1, 1] });
      e.draw("fuselage", { pos: [gx, gy - 0.15, gz + 0.5], rot: [this.pitch, 0, this.bank], color: "#c8d2ff", texture: "metal", uvScale: [1, 1] });
      e.draw("wing", { pos: [gx, gy - 0.12, gz + 0.35], rot: [0, 0, this.bank], color: "#2ee6a6", emissive: 0.3 });
      e.draw("tail", { pos: [gx, gy + 0.42, gz + 1.35], rot: [0, 0, this.bank], color: "#2ee6a6", emissive: 0.25 });
      e.draw("orb", { pos: [gx, gy - 0.12, gz + 1.7], color: "#ffd76a", emissive: 0.95, scale: [1, 1, 1 + this.boost * 1.8] });
    }
  }
}

export default SkyRider3DGame;
