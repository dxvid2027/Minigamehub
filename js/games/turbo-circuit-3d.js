// ==========================================================================
// Turbo Circuit 3D — third-person racer on an endless procedural circuit.
//
// The track is generated as a stream of segments whose centre line curves and
// rises with distance. Everything in the world (traffic, barriers, lamps) is
// anchored to that centre line, so the road genuinely winds and crests while
// the car stays on it.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randInt } from "../core/utils.js";

const SEG_LEN = 9;          // world units per road segment
const VISIBLE = 30;         // segments drawn ahead of the car (fog hides the rest)
const ROAD_HALF = 7;        // half road width
const LANE = 4.2;

export class TurboCircuit3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Steer left and right to keep your car on the road and out of traffic.",
      "The circuit curves and crests — read the road ahead, not just the car.",
      "Your speed climbs the longer you survive; score is distance covered.",
      "Three crashes end the run. Clipping a barrier costs speed, not a life.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "D-pad or drag to steer, ● for a speed boost."; }
  getKeyboardHint() { return "Arrow keys / A-D to steer, Space for a boost."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#0a1024", fogColor: "#101a38", fog: [60, 210],
      lightDir: [0.4, 0.85, 0.35], ambientSky: "#43508c", ambientGround: "#131829",
    })) return;

    const e = this.engine;
    e.mesh("road", () => Geometry.box(ROAD_HALF * 2, 0.4, SEG_LEN));
    e.mesh("shoulder", () => Geometry.box(1.6, 0.7, SEG_LEN));
    e.mesh("stripe", () => Geometry.box(0.42, 0.02, SEG_LEN * 0.4));
    e.mesh("carBody", () => Geometry.box(2.1, 0.8, 4.2));
    e.mesh("carCabin", () => Geometry.box(1.7, 0.72, 1.9));
    e.mesh("wheel", () => Geometry.cylinder(0.42, 0.34, 14));
    e.mesh("lampPost", () => Geometry.box(0.24, 6, 0.24));
    e.mesh("lampHead", () => Geometry.box(1.5, 0.3, 0.4));
    e.mesh("tree", () => Geometry.cone(1.6, 4.4, 10));
    e.mesh("ground", () => Geometry.plane(600, 1400));
    e.mesh("sky", () => Geometry.quad(900, 300));

    e.texture("asphalt", () => Textures.asphalt(256));
    e.texture("metal", () => Textures.metal(128, "#9fb0e8"));
    e.texture("hazard", () => Textures.stripes(128, { bg: "#ffd76a", stripe: "#20160a", count: 8 }));
    e.texture("grass", () => Textures.rock(256, "#1d3a2c"));
    e.texture("sky", () => {
      // Dusk gradient with a low sun — gives the road a horizon to run toward.
      const c = document.createElement("canvas"); c.width = 8; c.height = 256;
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#0a1038");
      grad.addColorStop(0.55, "#2a2f6e");
      grad.addColorStop(0.82, "#6b4a9c");
      grad.addColorStop(1, "#ff9f6b");
      g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
      return c;
    });

    this.input.onPointer("move", (p) => { this._dragX = p.x; });
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    const cfg = {
      Easy:   { base: 34, ramp: 0.9, traffic: 0.55, curve: 0.55 },
      Normal: { base: 44, ramp: 1.5, traffic: 0.85, curve: 0.9 },
      Hard:   { base: 54, ramp: 2.2, traffic: 1.2, curve: 1.25 },
    }[difficulty] || {};
    this.cfg = cfg;

    this.distance = 0;
    this.speed = cfg.base;
    this.boost = 0;
    this.lives = 3;
    this.carX = 0;
    this.carTilt = 0;
    this.traffic = [];
    this.props = [];
    this.spawnAt = 40;
    this.propAt = 20;
    this.invuln = 0;
    this._dragX = null;
    this._seed = Math.random() * 1000;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Speed: `${Math.round(this.speed * 3.1)} km/h`,
      Lives: "♥".repeat(Math.max(0, this.lives)) || "—",
    });
  }

  // Centre line of the road at a given distance — one function drives the
  // road mesh, the props and the car's own frame of reference.
  _curveAt(z) {
    const s = this._seed;
    return Math.sin((z + s) * 0.008) * 22 * this.cfg.curve
         + Math.sin((z + s) * 0.021) * 7 * this.cfg.curve;
  }
  _heightAt(z) {
    const s = this._seed;
    return Math.sin((z + s) * 0.013) * 2.6 + Math.sin((z + s) * 0.005) * 4.2;
  }

  onUpdate(dt) {
    if (!this.canPlay) return;
    const cfg = this.cfg;

    // --- speed & steering ---
    const boosting = this.input.isDown("Space") || this.input.virtual.a;
    this.boost = clamp(this.boost + (boosting ? dt * 1.6 : -dt * 1.1), 0, 1);
    const targetSpeed = cfg.base + this.distance * 0.0012 * cfg.ramp * 40 + this.boost * 26;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 1.6);

    const steer = 16 + this.speed * 0.08;
    let dx = 0;
    if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) dx -= 1;
    if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) dx += 1;
    if (this._dragX != null) {
      // Drag steering: map the pointer across the road width.
      const want = ((this._dragX / this.viewW) * 2 - 1) * ROAD_HALF;
      dx = clamp((want - this.carX) * 0.6, -1, 1);
    }
    this.carX = clamp(this.carX + dx * steer * dt, -ROAD_HALF - 2.5, ROAD_HALF + 2.5);
    this.carTilt += (dx * 0.16 - this.carTilt) * Math.min(1, dt * 8);

    this.distance += this.speed * dt;
    this.setScore(Math.floor(this.distance / 4));

    // Off-road: heavy drag and a rumble, but not an instant loss.
    const offRoad = Math.abs(this.carX) > ROAD_HALF - 1;
    if (offRoad) {
      this.speed = Math.max(cfg.base * 0.55, this.speed - 42 * dt);
      if (Math.random() < dt * 8) this.particles.burst(0, 0, { count: 1 });
      this.shakeSoft = true;
    }

    if (this.invuln > 0) this.invuln -= dt;

    // --- world streaming ---
    while (this.spawnAt < this.distance + VISIBLE * SEG_LEN) {
      this._spawnTraffic(this.spawnAt);
      this.spawnAt += randInt(26, 52) / cfg.traffic;
    }
    while (this.propAt < this.distance + VISIBLE * SEG_LEN) {
      this.props.push({ z: this.propAt, side: Math.random() > 0.5 ? 1 : -1, type: Math.random() > 0.45 ? "tree" : "lamp" });
      this.propAt += randInt(14, 30);
    }
    this.traffic = this.traffic.filter(t => t.z > this.distance - 20);
    this.props = this.props.filter(p => p.z > this.distance - 20);

    for (const t of this.traffic) t.z += t.speed * dt;

    // --- collisions ---
    for (const t of this.traffic) {
      const rel = t.z - this.distance;
      if (rel > -3.2 && rel < 3.2 && Math.abs(t.x - this.carX) < 2.1 && this.invuln <= 0) {
        this._crash();
        t.z = this.distance - 30;
        break;
      }
    }
    this._updateHud();
  }

  _spawnTraffic(z) {
    const lanes = [-LANE, 0, LANE];
    const lane = lanes[randInt(0, lanes.length - 1)];
    this.traffic.push({
      z, x: lane,
      speed: this.speed * (0.35 + Math.random() * 0.25),
      color: ["#ff5470", "#ffd76a", "#22d3ee", "#c86bff", "#2ee6a6"][randInt(0, 4)],
    });
  }

  _crash() {
    this.lives -= 1;
    this.invuln = 2;
    this.speed *= 0.45;
    this.shake();
    audioManager.play("explosion");
    this.vibrateOn(60);
    this._updateHud();
    if (this.lives <= 0) {
      audioManager.play("gameover");
      this.endGame({
        result: "loss", score: this.score,
        message: `You covered ${Math.round(this.distance)} m.`,
        extraStats: [{ label: "Distance", value: `${Math.round(this.distance)} m` }],
      });
    }
  }

  onRender() {
    if (!this.canPlay) return;
    const e = this.engine;
    const d = this.distance;
    const camX = this._curveAt(d) + this.carX * 0.55;
    const camY = this._heightAt(d) + 5.4;

    e.camera.fov = 62 + this.boost * 8 + Math.min(12, this.speed * 0.12);
    e.camera.pos = [camX, camY, -d + 11];
    e.camera.target = [this._curveAt(d + 26) + this.carX * 0.18, this._heightAt(d + 26) + 1.6, -(d + 26)];
    e.beginFrame();

    // Sky wall parked far down the road; the fog blends the road into it.
    e.draw("sky", {
      pos: [this._curveAt(d + 320), this._heightAt(d + 320) + 84, -(d + 340)],
      color: "#ffffff", texture: "sky", emissive: 1,
    });

    // Ground plane far below the road, tinted like distant terrain.
    e.draw("ground", { pos: [this._curveAt(d + 200), this._heightAt(d + 200) - 3.4, -(d + 200)], color: "#16301f", texture: "grass", uvScale: [40, 90] });

    // Road ribbon
    for (let i = -3; i < VISIBLE; i++) {
      const z = Math.floor(d / SEG_LEN) * SEG_LEN + i * SEG_LEN;
      const cx = this._curveAt(z), cy = this._heightAt(z);
      const shade = i % 2 === 0 ? "#3b415e" : "#353b56";
      e.draw("road", { pos: [cx, cy, -z], color: shade, texture: "asphalt", uvScale: [3, 1] });
      e.draw("shoulder", { pos: [cx - ROAD_HALF - 0.6, cy + 0.2, -z], color: i % 2 === 0 ? "#ff5470" : "#f4f6ff", texture: "hazard", uvScale: [1, 1] });
      e.draw("shoulder", { pos: [cx + ROAD_HALF + 0.6, cy + 0.2, -z], color: i % 2 === 0 ? "#f4f6ff" : "#ff5470", texture: "hazard", uvScale: [1, 1] });
      // Lane markings only where they still read — distant ones are a waste.
      if (i % 2 === 0 && i < 18) {
        e.draw("stripe", { pos: [cx - LANE / 2, cy + 0.22, -z], color: "#e9edff", emissive: 0.35 });
        e.draw("stripe", { pos: [cx + LANE / 2, cy + 0.22, -z], color: "#e9edff", emissive: 0.35 });
      }
    }

    // Scenery
    for (const p of this.props) {
      const cx = this._curveAt(p.z), cy = this._heightAt(p.z);
      const x = cx + p.side * (ROAD_HALF + 4.5);
      if (p.type === "tree") {
        e.draw("tree", { pos: [x, cy + 2, -p.z], color: "#1f6b45" });
      } else {
        e.draw("lampPost", { pos: [x, cy + 3, -p.z], color: "#6c7398", texture: "metal" });
        e.draw("lampHead", { pos: [x - p.side * 0.7, cy + 5.9, -p.z], color: "#ffd76a", emissive: 0.8 });
      }
    }

    // Traffic
    for (const t of this.traffic) {
      const cx = this._curveAt(t.z), cy = this._heightAt(t.z);
      this._drawCar(cx + t.x, cy + 0.75, -t.z, t.color, 0);
    }

    // Player car (blinks while invulnerable after a crash)
    if (this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0) {
      const cy = this._heightAt(d);
      this._drawCar(this._curveAt(d) + this.carX, cy + 0.75, -d, "#2ee6a6", this.carTilt, true);
    }
  }

  _drawCar(x, y, z, color, tilt, isPlayer = false) {
    const e = this.engine;
    e.shadow(x, z, 1.6, { y: y - 0.72, alpha: 0.4 });
    e.draw("carBody", { pos: [x, y, z], rot: [0, 0, tilt], color, texture: "metal", uvScale: [1, 1] });
    e.draw("carCabin", { pos: [x, y + 0.72, z - 0.2], rot: [0, 0, tilt], color: "#0d1326", alpha: 0.92 });
    for (const [ox, oz] of [[-1.02, 1.35], [1.02, 1.35], [-1.02, -1.35], [1.02, -1.35]]) {
      e.draw("wheel", { pos: [x + ox, y - 0.42, z + oz], rot: [0, 0, Math.PI / 2], color: "#15182a" });
    }
    // Lights: white in front for the player, red tail lights for traffic ahead.
    e.draw("stripe", { pos: [x, y + 0.1, z + (isPlayer ? -2.1 : 2.1)], scale: [3.6, 1, 0.25], color: isPlayer ? "#ffffff" : "#ff5470", emissive: 0.9 });
  }
}

export default TurboCircuit3DGame;
