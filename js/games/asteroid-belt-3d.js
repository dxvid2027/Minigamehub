// ==========================================================================
// Asteroid Belt 3D — third-person space shooter.
//
// Asteroids stream toward the ship down the Z axis. Shots are hitscan-free
// projectiles with real travel time, big rocks split into smaller ones, and
// the ship's shield gives you room to recover from a mistake.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randInt } from "../core/utils.js";

const BOUND_X = 14;
const BOUND_Y = 9;
const SPAWN_Z = 190;

export class AsteroidBelt3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Fly the ship across the belt and shoot the incoming asteroids.",
      "Large rocks split into two smaller ones — clear the fragments too.",
      "Shots take time to travel, so lead your target instead of aiming at it.",
      "Collisions cost shield; lose all three and the run ends.",
    ];
  }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "Drag to fly; hold the round ● button to keep firing."; }
  getKeyboardHint() { return "Arrow keys / WASD to fly, Space to fire."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#04061a", fogColor: "#080c26", fog: [110, 260],
      sky: "linear-gradient(#02030f 0%, #140f38 75%, #2a1550 100%)",
      lightDir: [0.5, 0.6, 0.6], ambientSky: "#3c4890", ambientGround: "#0d1024",
    })) return;

    const e = this.engine;
    e.mesh("hull", () => Geometry.cone(0.85, 2.4, 10));
    e.mesh("wing", () => Geometry.box(3.4, 0.18, 1.0));
    e.mesh("fuselage", () => Geometry.box(0.9, 0.62, 2.4));
    e.mesh("fin", () => Geometry.box(0.16, 0.85, 1.0));
    e.mesh("engine", () => Geometry.sphere(0.3, 10, 8));
    e.mesh("rockL", () => Geometry.sphere(2.4, 10, 8));
    e.mesh("rockS", () => Geometry.sphere(1.3, 8, 6));
    e.mesh("shot", () => Geometry.sphere(0.28, 8, 6));
    e.mesh("star", () => Geometry.box(0.4, 0.4, 0.4));

    e.texture("rock", () => Textures.rock(256, "#7a7d99"));
    e.texture("metal", () => Textures.metal(128, "#aab8f2"));

    this.input.onPointer("move", (p) => { this._drag = { x: p.x, y: p.y }; });
    this.input.onPointer("down", () => { this._firing = true; });
    this.input.onPointer("up", () => { this._firing = false; });

    // A static starfield gives the belt depth without costing draw calls
    // per frame beyond the boxes themselves.
    this.stars = [...Array(70)].map(() => ({
      x: (Math.random() * 2 - 1) * 90,
      y: (Math.random() * 2 - 1) * 55,
      z: Math.random() * 400,
    }));
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    this.cfg = {
      Easy:   { spawn: 1.15, speed: 26, ramp: 0.5 },
      Normal: { spawn: 0.82, speed: 34, ramp: 0.9 },
      Hard:   { spawn: 0.58, speed: 42, ramp: 1.4 },
    }[difficulty] || {};

    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.bank = 0;
    this.shield = 3;
    this.invuln = 0;
    this.rocks = [];
    this.shots = [];
    this.destroyed = 0;
    this.elapsed = 0;
    this.fireTimer = 0;
    this.spawnTimer = 0.8;
    this._drag = null;
    this._firing = false;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Rocks: this.destroyed,
      Shield: "◆".repeat(Math.max(0, this.shield)) || "—",
    });
  }

  onUpdate(dt) {
    if (!this.canPlay) return;
    this.elapsed += dt;
    const cfg = this.cfg;
    const rockSpeed = cfg.speed + this.elapsed * cfg.ramp;

    // --- flight ---
    let ax = 0, ay = 0;
    const a = this.input.axes();
    ax = a.x;
    ay = -a.y;
    if (this._drag) {
      ax = clamp((((this._drag.x / this.viewW) * 2 - 1) * BOUND_X - this.x) * 0.4, -1, 1);
      ay = clamp(((1 - (this._drag.y / this.viewH) * 2) * BOUND_Y - this.y) * 0.4, -1, 1);
    }
    this.vx = clamp(this.vx + ax * 100 * dt, -30, 30) * 0.92;
    this.vy = clamp(this.vy + ay * 82 * dt, -24, 24) * 0.92;
    this.x = clamp(this.x + this.vx * dt, -BOUND_X, BOUND_X);
    this.y = clamp(this.y + this.vy * dt, -BOUND_Y, BOUND_Y);
    this.bank += (-this.vx * 0.03 - this.bank) * Math.min(1, dt * 7);
    if (this.invuln > 0) this.invuln -= dt;

    // --- firing ---
    this.fireTimer -= dt;
    const wantsFire = this.input.isDown("Space") || this.input.virtual.a || this._firing;
    if (wantsFire && this.fireTimer <= 0) {
      this.fireTimer = 0.16;
      this.shots.push({ x: this.x, y: this.y, z: 0, life: 3 });
      audioManager.play("select");
    }
    for (const s of this.shots) { s.z += 160 * dt; s.life -= dt; }
    this.shots = this.shots.filter(s => s.life > 0 && !s.dead);

    // --- asteroids ---
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = cfg.spawn * (0.6 + Math.random() * 0.8);
      const big = Math.random() < 0.6;
      this.rocks.push({
        x: (Math.random() * 2 - 1) * BOUND_X,
        y: (Math.random() * 2 - 1) * BOUND_Y,
        z: SPAWN_Z,
        big, r: big ? 2.4 : 1.3,
        rot: [Math.random() * 6, Math.random() * 6, 0],
        spin: [(Math.random() - .5) * 1.4, (Math.random() - .5) * 1.4],
        drift: [(Math.random() - .5) * 3, (Math.random() - .5) * 2],
      });
    }
    for (const r of this.rocks) {
      r.z -= rockSpeed * dt;
      r.x = clamp(r.x + r.drift[0] * dt, -BOUND_X - 2, BOUND_X + 2);
      r.y = clamp(r.y + r.drift[1] * dt, -BOUND_Y - 2, BOUND_Y + 2);
      r.rot[0] += r.spin[0] * dt;
      r.rot[1] += r.spin[1] * dt;
    }

    // --- hits ---
    for (const s of this.shots) {
      for (const r of this.rocks) {
        if (r.dead) continue;
        if (Math.abs(s.z - r.z) < r.r + 1 && Math.hypot(s.x - r.x, s.y - r.y) < r.r + 0.5) {
          s.dead = true;
          this._destroyRock(r);
          break;
        }
      }
    }
    if (this.invuln <= 0) {
      for (const r of this.rocks) {
        if (r.dead) continue;
        if (r.z < 3 && r.z > -3 && Math.hypot(r.x - this.x, r.y - this.y) < r.r + 1.2) {
          r.dead = true;
          this._hit();
          break;
        }
      }
    }
    this.rocks = this.rocks.filter(r => !r.dead && r.z > -12);

    this.addScore(Math.round(dt * 6));
    this._updateHud();
  }

  _destroyRock(r) {
    r.dead = true;
    this.destroyed++;
    this.addScore(r.big ? 60 : 35);
    audioManager.play("explosion");
    if (r.big) {
      // Split into two fragments that fly apart.
      for (const side of [-1, 1]) {
        this.rocks.push({
          x: r.x + side * 1.6, y: r.y + (Math.random() - .5) * 1.6, z: r.z,
          big: false, r: 1.3,
          rot: [Math.random() * 6, Math.random() * 6, 0],
          spin: [(Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4],
          drift: [side * 4.5, (Math.random() - .5) * 3],
        });
      }
    }
  }

  _hit() {
    this.shield -= 1;
    this.invuln = 1.8;
    this.shake();
    audioManager.play("error");
    this.vibrateOn(60);
    this._updateHud();
    if (this.shield <= 0) {
      audioManager.play("gameover");
      this.endGame({
        result: "loss", score: this.score,
        message: `${this.destroyed} asteroids cleared in ${Math.round(this.elapsed)}s.`,
        extraStats: [{ label: "Rocks", value: this.destroyed }, { label: "Survived", value: `${Math.round(this.elapsed)}s` }],
      });
    }
  }

  onRender() {
    if (!this.canPlay) return;
    const e = this.engine;

    e.camera.pos = [this.x * 0.3, this.y * 0.26 + 3.2, -17];
    e.camera.target = [this.x * 0.12, this.y * 0.16, 46];
    e.camera.up = [Math.sin(this.bank), Math.cos(this.bank), 0];
    e.beginFrame();

    for (const s of this.stars) {
      e.draw("star", { pos: [s.x, s.y, s.z], color: "#c9d4ff", emissive: 1, alpha: 0.7 });
    }

    for (const r of this.rocks) {
      e.draw(r.big ? "rockL" : "rockS", {
        pos: [r.x, r.y, r.z], rot: [r.rot[0], r.rot[1], 0],
        color: r.big ? "#8b8fae" : "#a3a7c6", texture: "rock", uvScale: [1, 1],
      });
    }

    for (const s of this.shots) {
      e.draw("shot", { pos: [s.x, s.y, s.z], color: "#22d3ee", emissive: 0.95 });
      e.draw("shot", { pos: [s.x, s.y, s.z - 1.2], color: "#22d3ee", emissive: 0.7, alpha: 0.45, scale: [0.7, 0.7, 2.2] });
    }

    if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
      // Flying toward +Z: nose ahead, fuselage and swept wings behind it.
      const rot = [0, 0, this.bank];
      e.draw("fuselage", { pos: [this.x, this.y, 0], rot, color: "#d5deff", texture: "metal", uvScale: [1, 1] });
      e.draw("nose", { pos: [this.x, this.y, 1.9], rot: [Math.PI / 2, 0, this.bank], color: "#eef1ff", texture: "metal", uvScale: [1, 1] });
      e.draw("wing", { pos: [this.x - 1.2, this.y - 0.1, -0.5], rot: [0, -0.3, this.bank + 0.18], color: "#2ee6a6", emissive: 0.25 });
      e.draw("wing", { pos: [this.x + 1.2, this.y - 0.1, -0.5], rot: [0, 0.3, this.bank - 0.18], color: "#2ee6a6", emissive: 0.25 });
      e.draw("fin", { pos: [this.x, this.y + 0.6, -1.1], rot, color: "#2ee6a6", emissive: 0.2 });
      const flicker = 0.8 + Math.random() * 0.5;
      e.draw("engine", { pos: [this.x - 1.0, this.y - 0.15, -1.1], color: "#ffd76a", emissive: 1, scale: [1, 1, flicker * 2.2] });
      e.draw("engine", { pos: [this.x + 1.0, this.y - 0.15, -1.1], color: "#ffd76a", emissive: 1, scale: [1, 1, flicker * 2.2] });
    }
  }
}

export default AsteroidBelt3DGame;
