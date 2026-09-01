// ==========================================================================
// Tower Blocks 3D — stack sliding blocks into a tower.
//
// Blocks arrive alternately along X and Z. Whatever hangs over the block
// below is sliced off and tumbles away, so the tower narrows with every
// imprecise drop. A perfect drop restores a sliver of width.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp } from "../core/utils.js";

const BLOCK_H = 1.0;
const START_SIZE = 6;

export class TowerBlocks3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "A block slides over the tower — drop it so it lines up with the one below.",
      "Any overhang is sliced off, so sloppy drops make the tower thinner.",
      "Land a near-perfect drop and you win a little width back, plus bonus points.",
      "Miss the tower completely and the run ends.",
    ];
  }
  getTouchLayout() { return "single"; }
  getTouchIcon() { return "▼"; }
  getTouchHint() { return "Tap anywhere (or the button) to drop the block."; }
  getKeyboardHint() { return "Space, Enter or a click drops the block."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#0a1030", fogColor: "#141d47", fog: [50, 190],
      sky: "linear-gradient(#050827 0%, #16205a 70%, #1f2a72 100%)",
      lightDir: [0.42, 0.88, 0.42], ambientSky: "#7b86c8", ambientGround: "#252c52",
    })) return;

    const e = this.engine;
    e.mesh("block", () => Geometry.box(1, BLOCK_H, 1));
    e.mesh("ground", () => Geometry.plane(300, 300));
    e.texture("metal", () => Textures.metal(128, "#9fb0e8"));
    e.texture("grid", () => Textures.grid(256, { bg: "#0e1430", line: "#3ad6ff", cells: 8, width: 2 }));

    this.input.onTap(() => this._drop());
    this.input.onKey("Space", () => this._drop());
    this.input.onKey("Enter", () => this._drop());
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    this.cfg = {
      Easy:   { speed: 5.5, ramp: 0.10, perfect: 0.42 },
      Normal: { speed: 7.5, ramp: 0.16, perfect: 0.30 },
      Hard:   { speed: 9.8, ramp: 0.24, perfect: 0.22 },
    }[difficulty] || {};

    this.stack = [{ x: 0, z: 0, w: START_SIZE, d: START_SIZE, y: 0, color: this._color(0) }];
    this.debris = [];
    this.height = 0;
    this.perfects = 0;
    this.camY = 0;
    this.axis = "x";
    this._spawnMoving();
    this.setScore(0);
    this._updateHud();
  }

  _color(i) { return `hsl(${(196 + i * 9) % 360}, 74%, ${56 + (i % 3) * 6}%)`; }

  _updateHud() { this.setHud({ Score: this.score, Height: this.height, Perfect: this.perfects }); }

  _spawnMoving() {
    const top = this.stack[this.stack.length - 1];
    const speed = this.cfg.speed + this.height * this.cfg.ramp;
    this.moving = {
      w: top.w, d: top.d,
      y: (this.height + 1) * BLOCK_H,
      x: this.axis === "x" ? -12 : top.x,
      z: this.axis === "z" ? -12 : top.z,
      dir: 1, speed,
      color: this._color(this.height + 1),
    };
  }

  onUpdate(dt) {
    if (!this.canPlay || !this.moving) return;

    const m = this.moving;
    const limit = 12;
    if (this.axis === "x") {
      m.x += m.speed * m.dir * dt;
      if (m.x > limit) { m.x = limit; m.dir = -1; }
      if (m.x < -limit) { m.x = -limit; m.dir = 1; }
    } else {
      m.z += m.speed * m.dir * dt;
      if (m.z > limit) { m.z = limit; m.dir = -1; }
      if (m.z < -limit) { m.z = -limit; m.dir = 1; }
    }

    // Falling slices
    for (const d of this.debris) {
      d.vy -= 26 * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
    }
    this.debris = this.debris.filter(d => d.y > -30);

    // Camera rises with the tower
    const wantY = this.height * BLOCK_H;
    this.camY += (wantY - this.camY) * Math.min(1, dt * 3.4);
  }

  _drop() {
    if (this.state !== "playing" || !this.moving) return;
    const top = this.stack[this.stack.length - 1];
    const m = this.moving;

    const movingAxis = this.axis;
    const posKey = movingAxis;                       // "x" or "z"
    const sizeKey = movingAxis === "x" ? "w" : "d";

    const delta = m[posKey] - top[posKey];
    const overlap = top[sizeKey] - Math.abs(delta);

    if (overlap <= 0.05) {
      // Missed the tower entirely.
      this.debris.push({ x: m.x, z: m.z, y: m.y, w: m.w, d: m.d, vy: 0, rot: 0, spin: 3, color: m.color });
      this.moving = null;
      this.shake();
      audioManager.play("gameover");
      return this.endGame({
        result: "loss", score: this.score,
        message: `Tower reached ${this.height} blocks.`,
        extraStats: [{ label: "Height", value: this.height }, { label: "Perfect", value: this.perfects }],
      });
    }

    const perfect = Math.abs(delta) <= this.cfg.perfect;
    const newSize = perfect ? Math.min(START_SIZE, top[sizeKey] + 0.12) : overlap;
    const newPos = perfect ? top[posKey] : m[posKey] - delta / 2;

    const placed = {
      x: movingAxis === "x" ? newPos : m.x,
      z: movingAxis === "z" ? newPos : m.z,
      w: movingAxis === "x" ? newSize : m.w,
      d: movingAxis === "z" ? newSize : m.d,
      y: m.y, color: m.color,
    };
    this.stack.push(placed);

    if (!perfect) {
      // The sliced-off remainder tumbles away on the side it hung over.
      const sliceSize = Math.abs(delta);
      const sliceCentre = delta > 0
        ? placed[posKey] + newSize / 2 + sliceSize / 2
        : placed[posKey] - newSize / 2 - sliceSize / 2;
      this.debris.push({
        x: movingAxis === "x" ? sliceCentre : placed.x,
        z: movingAxis === "z" ? sliceCentre : placed.z,
        y: m.y,
        w: movingAxis === "x" ? sliceSize : placed.w,
        d: movingAxis === "z" ? sliceSize : placed.d,
        vy: 0, rot: 0, spin: (Math.random() - 0.5) * 5, color: m.color,
      });
      audioManager.play("hit");
      this.addScore(10 + this.height);
    } else {
      this.perfects++;
      this.addScore(40 + this.height * 2);
      audioManager.play("coin");
      this.particles.confetti(this.viewW / 2, this.viewH * 0.45, 12);
    }

    this.height++;
    this.axis = this.axis === "x" ? "z" : "x";
    this._spawnMoving();
    this._updateHud();
  }

  onRender() {
    if (!this.canPlay) return;
    const e = this.engine;

    // Slow orbit keeps the tower readable in depth without disorienting.
    const orbit = this.height * 0.045;
    e.camera.fov = 52;
    e.camera.pos = [Math.sin(orbit) * 13, this.camY + 7.5, Math.cos(orbit) * 13];
    e.camera.target = [0, this.camY + 1.2, 0];
    e.beginFrame();

    e.draw("ground", { pos: [0, -0.6, 0], color: "#5a67b8", texture: "grid", uvScale: [14, 14], emissive: 0.25 });

    // Only the top of the tower needs drawing — anything far below the camera
    // is out of frame anyway.
    const from = Math.max(0, this.stack.length - 26);
    for (let i = from; i < this.stack.length; i++) {
      const b = this.stack[i];
      e.draw("block", {
        pos: [b.x, b.y, b.z], scale: [b.w, BLOCK_H, b.d],
        color: b.color, texture: "metal", uvScale: [1, 1],
      });
    }

    for (const d of this.debris) {
      e.draw("block", { pos: [d.x, d.y, d.z], rot: [d.rot, d.rot * 0.6, 0], scale: [d.w, BLOCK_H, d.d], color: d.color, alpha: 0.9 });
    }

    if (this.moving) {
      const m = this.moving;
      e.draw("block", { pos: [m.x, m.y, m.z], scale: [m.w, BLOCK_H, m.d], color: m.color, texture: "metal", uvScale: [1, 1], emissive: 0.18 });
      // Drop guide: a faint marker on the block below shows the landing zone.
      const top = this.stack[this.stack.length - 1];
      e.shadow(m.x, m.z, Math.max(m.w, m.d) * 0.5, { y: top.y + BLOCK_H / 2 + 0.02, alpha: 0.35 });
    }
  }
}

export default TowerBlocks3DGame;
