// ==========================================================================
// Cube Runner 3D — three-lane endless runner.
//
// The runner is locked to lanes and hops between them; obstacles either have
// to be jumped (low blocks), slid under (overhead bars) or dodged sideways
// (full-height walls), so every obstacle type asks for a different input.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randInt, choice } from "../core/utils.js";

const LANE_X = [-3.2, 0, 3.2];
const TILE = 8;
const VISIBLE = 30;
const GRAVITY = 42;

export class CubeRunner3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Left/right switches lane, up jumps, down slides.",
      "Yellow blocks must be jumped, cyan bars must be slid under, tall walls must be dodged sideways.",
      "Collect the violet cubes for bonus points; the track speeds up as you go.",
      "One hit ends the run — the score is how far you got.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return []; }
  getTouchHint() { return "Swipe or use the D-pad: left/right to switch lane, up to jump, down to slide."; }
  getKeyboardHint() { return "Arrow keys or WASD — left/right lane, up jump, down slide."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#070a1c", fogColor: "#0d1330", fog: [55, 165],
      lightDir: [0.35, 0.9, 0.3], ambientSky: "#4a4d92", ambientGround: "#111428",
    })) return;

    const e = this.engine;
    e.mesh("track", () => Geometry.box(11.6, 0.6, TILE));
    e.mesh("rail", () => Geometry.box(0.5, 1.1, TILE));
    e.mesh("runner", () => Geometry.box(1.5, 1.5, 1.5));
    e.mesh("lowBlock", () => Geometry.box(2.6, 1.2, 1.6));
    e.mesh("highBar", () => Geometry.box(2.8, 0.9, 1.2));
    e.mesh("wall", () => Geometry.box(2.6, 3.4, 1.4));
    e.mesh("pillar", () => Geometry.box(1.2, 14, 1.2));
    e.mesh("coin", () => Geometry.torus(0.5, 0.16, 16, 8));

    e.texture("trackTex", () => Textures.grid(256, { bg: "#151c3a", line: "#3ad6ff", cells: 3, width: 4 }));
    e.texture("hazard", () => Textures.stripes(128, { bg: "#ffd76a", stripe: "#1b1408", count: 6 }));
    e.texture("metal", () => Textures.metal(128, "#8ea3e8"));

    this.input.onSwipe((dir) => {
      if (dir === "left") this._switchLane(-1);
      if (dir === "right") this._switchLane(1);
      if (dir === "up") this._jump();
      if (dir === "down") this._slide();
    });
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    const cfg = {
      Easy:   { speed: 20, ramp: 0.55, gap: [16, 26] },
      Normal: { speed: 26, ramp: 0.85, gap: [13, 22] },
      Hard:   { speed: 32, ramp: 1.2, gap: [11, 18] },
    }[difficulty] || {};
    this.cfg = cfg;

    this.speed = cfg.speed;
    this.distance = 0;
    this.lane = 1;
    this.laneX = LANE_X[1];
    this.y = 0; this.vy = 0;
    this.sliding = 0;
    this.obstacles = [];
    this.coins = [];
    this.coinsGot = 0;
    this.spawnAt = 40;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({ Score: this.score, Cubes: this.coinsGot, Speed: `${(this.speed / this.cfg.speed).toFixed(1)}x` });
  }

  _switchLane(dir) {
    if (this.state !== "playing") return;
    const next = clamp(this.lane + dir, 0, 2);
    if (next === this.lane) return;
    this.lane = next;
    audioManager.play("swoosh");
  }
  _jump() {
    if (this.state !== "playing" || this.y > 0.05) return;
    this.vy = 15;
    this.sliding = 0;
    audioManager.play("jump");
  }
  _slide() {
    if (this.state !== "playing" || this.y > 0.05) return;
    this.sliding = 0.62;
    audioManager.play("swoosh");
  }

  onUpdate(dt) {
    if (!this.canPlay) return;

    if (this.input.consumePressed("ArrowLeft") || this.input.consumePressed("KeyA")) this._switchLane(-1);
    if (this.input.consumePressed("ArrowRight") || this.input.consumePressed("KeyD")) this._switchLane(1);
    if (this.input.consumePressed("ArrowUp") || this.input.consumePressed("KeyW") || this.input.consumePressed("Space")) this._jump();
    if (this.input.consumePressed("ArrowDown") || this.input.consumePressed("KeyS")) this._slide();
    // Virtual d-pad: edge-triggered so a held button doesn't repeat forever.
    const v = this.input.virtual;
    if (v.left && !this._vl) this._switchLane(-1);
    if (v.right && !this._vr) this._switchLane(1);
    if (v.up && !this._vu) this._jump();
    if (v.down && !this._vd) this._slide();
    this._vl = v.left; this._vr = v.right; this._vu = v.up; this._vd = v.down;

    this.speed += this.cfg.ramp * dt;
    this.distance += this.speed * dt;
    this.setScore(Math.floor(this.distance / 2) + this.coinsGot * 25);

    // Lane glide + jump physics
    this.laneX += (LANE_X[this.lane] - this.laneX) * Math.min(1, dt * 14);
    this.vy -= GRAVITY * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
    if (this.sliding > 0) this.sliding -= dt;

    // Stream the course ahead
    while (this.spawnAt < this.distance + VISIBLE * TILE) {
      this._spawnRow(this.spawnAt);
      this.spawnAt += randInt(this.cfg.gap[0], this.cfg.gap[1]);
    }
    this.obstacles = this.obstacles.filter(o => o.z > this.distance - 12);
    this.coins = this.coins.filter(c => c.z > this.distance - 12 && !c.taken);

    this._checkCollisions();
    this._updateHud();
  }

  _spawnRow(z) {
    // Never block every lane: at least one lane always stays passable.
    const blocked = new Set();
    const count = Math.random() < 0.35 ? 2 : 1;
    while (blocked.size < count) blocked.add(randInt(0, 2));
    for (const lane of blocked) {
      const type = choice(["low", "bar", "wall"]);
      this.obstacles.push({ z, lane, type });
    }
    const free = [0, 1, 2].filter(l => !blocked.has(l));
    if (free.length && Math.random() < 0.75) {
      const lane = choice(free);
      for (let i = 0; i < randInt(1, 3); i++) {
        this.coins.push({ z: z + i * 3, lane, taken: false, spin: Math.random() * 6 });
      }
    }
  }

  _checkCollisions() {
    const headLow = this.sliding > 0 ? 0.55 : 1.5;   // top of the runner
    const feet = this.y;
    for (const o of this.obstacles) {
      const rel = o.z - this.distance;
      if (rel < -1.2 || rel > 1.2) continue;
      if (o.lane !== this.lane) continue;
      if (o.type === "low" && feet < 1.25) return this._hit();
      if (o.type === "bar" && this.y + headLow > 1.5 && feet < 2.6) return this._hit();
      if (o.type === "wall") return this._hit();
    }
    for (const c of this.coins) {
      const rel = c.z - this.distance;
      if (c.taken || rel < -1 || rel > 1 || c.lane !== this.lane) continue;
      if (Math.abs(this.y - 0.9) < 1.6) {
        c.taken = true;
        this.coinsGot++;
        audioManager.play("coin");
      }
    }
  }

  _hit() {
    this.shake();
    audioManager.play("explosion");
    this.vibrateOn(70);
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score,
      message: `${Math.round(this.distance)} m and ${this.coinsGot} cubes collected.`,
      extraStats: [{ label: "Distance", value: `${Math.round(this.distance)} m` }, { label: "Cubes", value: this.coinsGot }],
    });
  }

  onRender(ctx, dt) {
    if (!this.canPlay) return;
    const e = this.engine;
    const d = this.distance;

    e.camera.pos = [this.laneX * 0.55, 5.2 + this.y * 0.35, -d + 10.5];
    e.camera.target = [this.laneX * 0.2, 1.6 + this.y * 0.5, -(d + 16)];
    e.beginFrame();

    // Track tiles + side rails
    const first = Math.floor(d / TILE) * TILE;
    for (let i = -2; i < VISIBLE; i++) {
      const z = first + i * TILE;
      e.draw("track", { pos: [0, -0.3, -z], color: i % 2 === 0 ? "#232c55" : "#1d2549", texture: "trackTex", uvScale: [1, 1] });
      e.draw("rail", { pos: [-6, 0.3, -z], color: "#3ad6ff", emissive: 0.55 });
      e.draw("rail", { pos: [6, 0.3, -z], color: "#c86bff", emissive: 0.55 });
      if (i % 3 === 0) {
        e.draw("pillar", { pos: [-11, 6, -z], color: "#2a3160", texture: "metal" });
        e.draw("pillar", { pos: [11, 6, -z], color: "#2a3160", texture: "metal" });
      }
    }

    for (const o of this.obstacles) {
      const x = LANE_X[o.lane];
      if (o.type === "low") {
        e.shadow(x, -o.z, 1.5);
        e.draw("lowBlock", { pos: [x, 0.6, -o.z], color: "#ffd76a", texture: "hazard", uvScale: [1, 1] });
      } else if (o.type === "bar") {
        e.draw("highBar", { pos: [x, 2.35, -o.z], color: "#22d3ee", emissive: 0.25 });
        e.draw("rail", { pos: [x - 1.5, 1.4, -o.z], scale: [0.5, 2.4, 0.2], color: "#1c6f86" });
        e.draw("rail", { pos: [x + 1.5, 1.4, -o.z], scale: [0.5, 2.4, 0.2], color: "#1c6f86" });
      } else {
        e.shadow(x, -o.z, 1.6);
        e.draw("wall", { pos: [x, 1.7, -o.z], color: "#ff5470", texture: "metal", uvScale: [1, 1] });
      }
    }

    this._coinSpin = (this._coinSpin || 0) + (dt || 0) * 3;
    for (const c of this.coins) {
      e.draw("coin", { pos: [LANE_X[c.lane], 1.1, -c.z], rot: [Math.PI / 2, this._coinSpin + c.spin, 0], color: "#c86bff", emissive: 0.5 });
    }

    // Runner: squashes while sliding, tilts into lane changes
    const squash = this.sliding > 0 ? 0.5 : 1;
    const tilt = clamp((LANE_X[this.lane] - this.laneX) * 0.09, -0.35, 0.35);
    e.shadow(this.laneX, -d, 0.9 - this.y * 0.05, { alpha: 0.42 - this.y * 0.03 });
    e.draw("runner", {
      pos: [this.laneX, 0.78 * squash + this.y, -d],
      rot: [0, 0, tilt],
      scale: [1, squash, 1],
      color: "#2ee6a6", texture: "metal", uvScale: [1, 1],
    });
    e.draw("runner", {
      pos: [this.laneX, 0.78 * squash + this.y, -d - 0.4],
      rot: [0, 0, tilt], scale: [0.7, squash * 0.55, 0.4],
      color: "#0b2b22", emissive: 0.2,
    });
  }
}

export default CubeRunner3DGame;
