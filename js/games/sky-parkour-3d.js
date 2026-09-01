// ==========================================================================
// Sky Parkour 3D — an endless obstacle course of floating platforms.
//
// Unlike the lane-locked runner, movement here is free across the width of
// whatever platform you are standing on, so the course can use narrow beams,
// staggered ledges and sideways gaps. The track is streamed as a list of
// platform segments; everything (hurdles, spinners, pushers, bouncers,
// coins) is attached to the segment it sits on, so culling one line of the
// course removes all of it at once.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randInt, randFloat, choice } from "../core/utils.js";

const GRAVITY = 44;
const JUMP_V = 15.4;
const DOUBLE_V = 13.2;
const BOUNCE_V = 26;
const STRAFE = 11.5;
const VIEW_AHEAD = 190;
const STEP_HEIGHTS = [0, 1.15, 2.3];

export class SkyParkour3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "You run forward automatically — steer left and right, and jump the gaps.",
      "Press jump twice for a double jump; the glowing orange pads fling you much higher.",
      "Yellow hurdles and the spinning arms cost a heart. The grey pushers just shove you — off the edge, if you let them.",
      "Falling off ends the run instantly. Score is the distance you cover plus the rings you grab.",
    ];
  }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "Push the thumb stick left/right to steer, tap ● to jump — tap it again in mid-air for a double jump."; }
  getKeyboardHint() { return "A/D or ←/→ to steer, Space / W / ↑ to jump — press it again in mid-air to double jump."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#0b1030", fogColor: "#1b2352", fog: [80, 260],
      sky: "linear-gradient(#060a24 0%, #1c2a63 45%, #6b5aa8 74%, #e08a7a 90%, #ffcf9c 100%)",
      lightDir: [0.35, 0.85, 0.4], ambientSky: "#8794d8", ambientGround: "#242a52",
    })) return;

    const e = this.engine;
    e.mesh("unit", () => Geometry.box(1, 1, 1));
    e.mesh("ring", () => Geometry.torus(0.62, 0.17, 16, 8));
    e.mesh("pad", () => Geometry.cylinder(1.5, 0.4, 16));
    e.mesh("post", () => Geometry.cylinder(0.28, 1.6, 10));
    e.mesh("head", () => Geometry.sphere(0.42, 12, 10));
    e.mesh("cloud", () => Geometry.sphere(3.2, 8, 6));

    e.texture("deck", () => Textures.grid(256, { bg: "#232c5e", line: "#6ee7ff", cells: 3, width: 4 }));
    e.texture("stone", () => Textures.rock(256, "#4a5182"));
    e.texture("hazard", () => Textures.stripes(128, { bg: "#ffd76a", stripe: "#1b1408", count: 7 }));
    e.texture("metal", () => Textures.metal(128, "#9fb0e8"));

    this.input.onSwipe((dir) => { if (dir === "up") this._jump(); });
    this.input.onTap(() => this._jump());
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    this.cfg = {
      Easy:   { speed: 12.5, ramp: 0.30, gap: [3.0, 6.0], widths: [8, 8, 6.5], hazard: 0.42, lives: 4 },
      Normal: { speed: 15.5, ramp: 0.46, gap: [4.0, 8.5], widths: [7, 5.5, 5.5, 4.2], hazard: 0.62, lives: 3 },
      Hard:   { speed: 18.5, ramp: 0.62, gap: [5.0, 10.5], widths: [6, 4.6, 4.6, 3.2], hazard: 0.82, lives: 3 },
    }[difficulty] || {};

    this.speed = this.cfg.speed;
    this.distance = 0;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.jumps = 0;
    this.grounded = true;
    this.lives = this.cfg.lives;
    this.invuln = 0;
    this.coinsGot = 0;
    this.bestAir = 0;
    this.stride = 0;
    this.falling = 0;
    this.tilt = 0;

    this.segments = [];
    this.nextZ = -14;
    // A generous opening runway so nobody dies before they have moved.
    this._pushSegment({ len: 44, cx: 0, w: 9, top: 0, safe: true });
    while (this.nextZ < VIEW_AHEAD) this._pushSegment();

    this.clouds = [...Array(26)].map(() => ({
      x: randFloat(-90, 90), y: randFloat(-34, 26), z: randFloat(0, VIEW_AHEAD * 1.6), s: randFloat(0.7, 2.1),
    }));

    this.setScore(0);
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Distance: `${Math.round(this.distance)} m`,
      Rings: this.coinsGot,
      Lives: GameBase.hearts(this.lives),
    });
  }

  // -------------------------------------------------------- COURSE GEN -----
  /**
   * Appends one platform. Everything the player can interact with lives on
   * the segment, so culling is a single filter on z.
   */
  _pushSegment(force = null) {
    const cfg = this.cfg;
    const prev = this.segments[this.segments.length - 1];
    const gap = force ? 0 : randFloat(cfg.gap[0], cfg.gap[1]);
    const z = this.nextZ + gap;

    let cx = force?.cx ?? 0;
    let top = force?.top ?? 0;
    let w = force?.w ?? 8;
    let len = force?.len ?? 20;

    if (!force) {
      w = choice(cfg.widths);
      len = randFloat(14, 30);
      // Drift sideways, but never further than a jump can carry you.
      const drift = randFloat(-5.5, 5.5);
      cx = clamp((prev?.cx ?? 0) + drift, -13, 13);
      // Steps stay within one level of the previous platform so every ledge
      // is reachable with a single jump.
      const prevIdx = STEP_HEIGHTS.indexOf(prev?.top ?? 0);
      const idx = clamp((prevIdx < 0 ? 0 : prevIdx) + randInt(-1, 1), 0, STEP_HEIGHTS.length - 1);
      top = STEP_HEIGHTS[idx];
    }

    const seg = { z, len, cx, w, top, hazards: [], coins: [], safe: !!force?.safe };
    if (!force) this._decorate(seg);
    this.segments.push(seg);
    this.nextZ = z + len;
    return seg;
  }

  _decorate(seg) {
    const cfg = this.cfg;
    const room = seg.len - 8;
    if (room > 4 && Math.random() < cfg.hazard) {
      const kinds = ["hurdle", "hurdle", "spinner", "pusher"];
      if (seg.w >= 6) kinds.push("pusher");
      const kind = choice(kinds);
      const z = seg.z + randFloat(5, seg.len - 3);
      if (kind === "hurdle") {
        // A hurdle never spans the whole platform: there is always a way past
        // it on foot as well as over it.
        const width = Math.min(seg.w * 0.62, 3.4);
        seg.hazards.push({ kind, z, x: seg.cx + randFloat(-1, 1) * (seg.w - width) / 2, w: width });
      } else if (kind === "spinner") {
        seg.hazards.push({ kind, z, x: seg.cx, len: Math.min(seg.w * 0.95, 7), spin: randFloat(1.5, 2.6) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 6.28 });
      } else {
        seg.hazards.push({ kind, z, x: seg.cx, range: Math.max(1.4, seg.w / 2 - 1.4), spin: randFloat(0.9, 1.7), phase: Math.random() * 6.28 });
      }
    }
    // A bouncer at the end of a platform turns the next gap into a big leap.
    if (Math.random() < 0.22) seg.bouncer = { z: seg.z + seg.len - 3, x: seg.cx + randFloat(-1, 1) * Math.max(0, seg.w / 2 - 2) };

    const count = randInt(0, 4);
    for (let i = 0; i < count; i++) {
      seg.coins.push({ z: seg.z + 4 + i * 3.2, x: seg.cx + randFloat(-1, 1) * Math.max(0, seg.w / 2 - 1), taken: false });
    }
  }

  /** The platform the player is over right now, or null if over thin air. */
  _platformAt(z, x) {
    for (const s of this.segments) {
      if (z < s.z || z > s.z + s.len) continue;
      if (Math.abs(x - s.cx) > s.w / 2) continue;
      return s;
    }
    return null;
  }

  // ------------------------------------------------------------ ACTIONS ----
  _jump() {
    if (this.state !== "playing" || this.falling > 0) return;
    if (this.grounded) {
      this.vy = JUMP_V; this.jumps = 1; this.grounded = false;
      audioManager.play("jump");
    } else if (this.jumps < 2) {
      this.vy = DOUBLE_V; this.jumps = 2;
      audioManager.play("swoosh");
    }
  }

  _hurt(reason) {
    if (this.invuln > 0) return;
    this.lives -= 1;
    this.invuln = 1.1;
    this.speed = Math.max(this.cfg.speed * 0.8, this.speed - 3);
    this.shake();
    this.vibrateOn(60);
    audioManager.play("hit");
    if (this.lives <= 0) this._end(reason);
  }

  _end(message) {
    if (this.state === "ended") return;
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score, message,
      extraStats: [
        { label: "Distance", value: `${Math.round(this.distance)} m` },
        { label: "Rings", value: this.coinsGot },
      ],
    });
  }

  // ------------------------------------------------------------- UPDATE ----
  onUpdate(dt) {
    if (!this.canPlay) return;

    if (this.falling > 0) { this._updateFall(dt); return; }

    if (this.input.consumePressed("Space") || this.input.consumePressed("KeyW") || this.input.consumePressed("ArrowUp")) this._jump();
    // Jump is its own button. It used to be "stick pushed up", which meant
    // steering diagonally fired a jump you never asked for.
    const v = this.input.virtual;
    if (v.a && !this._va) this._jump();
    this._va = v.a;

    const dir = this.input.axes().x;
    this.x = clamp(this.x + dir * STRAFE * dt, -18, 18);
    this.tilt += (dir * -0.22 - this.tilt) * Math.min(1, dt * 9);

    this.speed = Math.min(this.speed + this.cfg.ramp * dt, this.cfg.speed * 2.1);
    this.distance += this.speed * dt;
    if (this.invuln > 0) this.invuln -= dt;

    // Vertical motion, then landing resolution.
    const prevY = this.y;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    this.stride += dt * (this.grounded ? this.speed * 0.55 : 3);

    const seg = this._platformAt(this.distance, this.x);
    this.grounded = false;
    if (seg) {
      if (this.vy <= 0 && prevY >= seg.top - 0.35 && this.y <= seg.top) {
        this.y = seg.top;
        this.vy = 0;
        this.jumps = 0;
        this.grounded = true;
        this.bestAir = 0;
      } else if (this.y < seg.top && this.y > seg.top - 1.6) {
        // Clipped the lip of a ledge on the way up: step onto it rather than
        // tunnelling through. Anything deeper than a step is a real fall, so
        // the gaps stay dangerous.
        this.y = seg.top;
        this.vy = 0;
        this.jumps = 0;
        this.grounded = true;
      }
    }

    if (this.grounded && seg?.bouncer && Math.abs(this.distance - seg.bouncer.z) < 1.6 && Math.abs(this.x - seg.bouncer.x) < 1.7) {
      this.vy = BOUNCE_V;
      this.jumps = 1;
      this.grounded = false;
      audioManager.play("levelup");
    }

    if (!seg && this.y < -4) { this.falling = 0.9; return; }
    if (this.y < -22) { this.falling = 0.9; return; }

    this._hazards(dt, seg);
    this._coins();

    while (this.nextZ < this.distance + VIEW_AHEAD) this._pushSegment();
    this.segments = this.segments.filter(s => s.z + s.len > this.distance - 30);

    this.setScore(Math.floor(this.distance) + this.coinsGot * 25);
    this._updateHud();
  }

  /** Short cinematic drop before the run is scored. */
  _updateFall(dt) {
    this.falling -= dt;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    this.distance += this.speed * 0.4 * dt;
    if (this.falling <= 0) this._end(`You fell at ${Math.round(this.distance)} m.`);
  }

  _hazards(dt, seg) {
    if (!seg) return;
    const t = performance.now() / 1000;
    for (const h of seg.hazards) {
      if (h.kind === "hurdle") {
        if (Math.abs(this.distance - h.z) < 1.0 && Math.abs(this.x - h.x) < h.w / 2 + 0.5 && this.y < seg.top + 1.05) {
          this._hurt(`A hurdle stopped you at ${Math.round(this.distance)} m.`);
        }
      } else if (h.kind === "spinner") {
        const a = h.phase + t * h.spin;
        const half = h.len / 2;
        // Distance from the player to the rotating arm, in the platform plane.
        const dx = this.x - h.x, dz = this.distance - h.z;
        const along = clamp(dx * Math.cos(a) + dz * Math.sin(a), -half, half);
        const px = Math.cos(a) * along, pz = Math.sin(a) * along;
        const dist = Math.hypot(dx - px, dz - pz);
        if (dist < 0.85 && this.y < seg.top + 1.25) {
          this._hurt(`A spinner swept you at ${Math.round(this.distance)} m.`);
        }
      } else if (h.kind === "pusher") {
        const px = h.x + Math.sin(h.phase + t * h.spin) * h.range;
        if (Math.abs(this.distance - h.z) < 1.4 && Math.abs(this.x - px) < 1.9 && this.y < seg.top + 1.4) {
          const push = Math.sign(this.x - px) || 1;
          this.x = clamp(this.x + push * 16 * dt, -18, 18);
          audioManager.play("swoosh");
        }
      }
    }
  }

  _coins() {
    for (const s of this.segments) {
      for (const c of s.coins) {
        if (c.taken) continue;
        if (Math.abs(this.distance - c.z) > 1.1) continue;
        if (Math.abs(this.x - c.x) > 1.5) continue;
        if (Math.abs(this.y - (s.top + 1.2)) > 1.9) continue;
        c.taken = true;
        this.coinsGot++;
        audioManager.play("coin");
      }
    }
  }

  // ------------------------------------------------------------- RENDER ----
  onRender(ctx, dt) {
    if (!this.canPlay) return;
    const e = this.engine;
    const d = this.distance;
    const t = performance.now() / 1000;

    e.camera.pos = [this.x * 0.6, this.y + 5.6, -d + 12];
    e.camera.target = [this.x * 0.35, this.y + 1.8, -(d + 18)];
    e.beginFrame();

    for (const c of this.clouds) {
      // Recycle clouds ahead of the camera so the sky never empties out.
      if (c.z < d - 40) { c.z += VIEW_AHEAD * 1.6; c.x = randFloat(-90, 90); }
      e.draw("cloud", { pos: [c.x, c.y, -c.z], scale: [c.s * 1.6, c.s * 0.7, c.s], color: "#8f9ad8", emissive: 0.55, alpha: 0.32 });
    }

    for (const s of this.segments) {
      const cz = s.z + s.len / 2;
      e.draw("unit", {
        pos: [s.cx, s.top - 0.45, -cz], scale: [s.w, 0.9, s.len],
        color: s.safe ? "#2a3468" : "#242d5e", texture: "deck", uvScale: [Math.max(1, s.w / 4), Math.max(1, s.len / 4)],
      });
      // Underside so a platform reads as a slab, not a decal.
      e.draw("unit", { pos: [s.cx, s.top - 1.6, -cz], scale: [s.w * 0.86, 1.5, s.len * 0.96], color: "#161d3f", texture: "stone", uvScale: [2, 3] });
      // Lit edge strips.
      e.draw("unit", { pos: [s.cx - s.w / 2, s.top + 0.06, -cz], scale: [0.22, 0.16, s.len], color: "#6ee7ff", emissive: 0.7 });
      e.draw("unit", { pos: [s.cx + s.w / 2, s.top + 0.06, -cz], scale: [0.22, 0.16, s.len], color: "#c86bff", emissive: 0.7 });

      if (s.bouncer) {
        e.draw("pad", {
          pos: [s.bouncer.x, s.top + 0.24, -s.bouncer.z],
          scale: [1, 1 + Math.sin(t * 5) * 0.12, 1],
          color: "#ff9f43", emissive: 0.65,
        });
      }

      for (const h of s.hazards) this._drawHazard(e, s, h, t);

      for (const c of s.coins) {
        if (c.taken) continue;
        e.draw("ring", { pos: [c.x, s.top + 1.2, -c.z], rot: [Math.PI / 2, t * 3, 0], color: "#ffd76a", emissive: 0.6 });
      }
    }

    this._drawRunner(e, d, t);
  }

  _drawHazard(e, s, h, t) {
    if (h.kind === "hurdle") {
      e.shadow(h.x, -h.z, h.w * 0.55, { y: s.top + 0.03 });
      e.draw("unit", { pos: [h.x, s.top + 0.55, -h.z], scale: [h.w, 1.1, 0.7], color: "#ffd76a", texture: "hazard", uvScale: [1, 1] });
      e.draw("unit", { pos: [h.x - h.w / 2, s.top + 0.3, -h.z], scale: [0.24, 0.6, 0.5], color: "#7a5a12" });
      e.draw("unit", { pos: [h.x + h.w / 2, s.top + 0.3, -h.z], scale: [0.24, 0.6, 0.5], color: "#7a5a12" });
    } else if (h.kind === "spinner") {
      const a = h.phase + t * h.spin;
      e.draw("post", { pos: [h.x, s.top + 0.8, -h.z], color: "#8ea3e8", texture: "metal", uvScale: [1, 1] });
      e.draw("unit", {
        pos: [h.x, s.top + 0.75, -h.z], rot: [0, -a, 0],
        scale: [h.len, 0.34, 0.5], color: "#ff5470", emissive: 0.32,
      });
      e.draw("unit", {
        pos: [h.x + Math.cos(a) * h.len / 2, s.top + 0.75, -(h.z + Math.sin(a) * h.len / 2)],
        rot: [0, -a, 0], scale: [0.7, 0.62, 0.8], color: "#ff8fa4", emissive: 0.45,
      });
    } else {
      const px = h.x + Math.sin(h.phase + t * h.spin) * h.range;
      e.shadow(px, -h.z, 1.5, { y: s.top + 0.03 });
      e.draw("unit", { pos: [px, s.top + 0.9, -h.z], scale: [2.6, 1.8, 1.1], color: "#95a0c8", texture: "metal", uvScale: [1, 1] });
      e.draw("unit", { pos: [px, s.top + 1.85, -h.z], scale: [2.2, 0.2, 0.9], color: "#22d3ee", emissive: 0.5 });
    }
  }

  /** A small runner built from boxes: legs and arms swing with the stride. */
  _drawRunner(e, d, t) {
    const blink = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    if (blink) return;

    const swing = Math.sin(this.stride) * (this.grounded ? 0.55 : 0.18);
    const bob = this.grounded ? Math.abs(Math.sin(this.stride)) * 0.09 : 0;
    const y = this.y + 0.95 + bob;
    const body = "#2ee6a6";

    e.shadow(this.x, -d, 0.85, { y: (this._platformAt(d, this.x)?.top ?? -99) + 0.04, alpha: 0.4 });

    e.draw("unit", { pos: [this.x, y, -d], rot: [0, 0, this.tilt], scale: [0.78, 1.0, 0.55], color: body, texture: "metal", uvScale: [1, 1] });
    e.draw("head", { pos: [this.x, y + 0.78, -d], color: "#eaf6ff" });
    e.draw("unit", { pos: [this.x, y + 0.82, -d - 0.34], scale: [0.5, 0.24, 0.16], color: "#0d3b30", emissive: 0.3 });

    // Arms
    e.draw("unit", { pos: [this.x - 0.52, y + 0.18, -(d - swing * 0.5)], rot: [swing, 0, 0.2], scale: [0.2, 0.72, 0.2], color: "#1aa87a" });
    e.draw("unit", { pos: [this.x + 0.52, y + 0.18, -(d + swing * 0.5)], rot: [-swing, 0, -0.2], scale: [0.2, 0.72, 0.2], color: "#1aa87a" });
    // Legs
    e.draw("unit", { pos: [this.x - 0.22, y - 0.62, -(d + swing * 0.6)], rot: [-swing, 0, 0], scale: [0.26, 0.8, 0.26], color: "#155f8a" });
    e.draw("unit", { pos: [this.x + 0.22, y - 0.62, -(d - swing * 0.6)], rot: [swing, 0, 0], scale: [0.26, 0.8, 0.26], color: "#155f8a" });
  }
}

export default SkyParkour3DGame;
