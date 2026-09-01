// ==========================================================================
// Storm Arena 3D — a third-person arena shooter.
//
// You hold an arena against waves of drones while a storm ring closes in.
// The signature move is building: a wall you can drop in front of you for
// instant cover, on a small material budget that refills with every kill.
//
// Aiming is a yaw/pitch pair driven by pointer drag (or the right half of a
// touch screen); shooting is hitscan against enemy spheres and the world's
// cover boxes, so a drone behind a wall is genuinely safe.
// ==========================================================================
import { Game3D, Geometry, Textures } from "./game3dBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randFloat } from "../core/utils.js";

const ARENA = 46;            // half-extent of the ground plate
const EYE = 1.7;
const MOVE = 9.5;
const GRAVITY = 30;
const JUMP_V = 11;
const MAG = 24;
const RELOAD_TIME = 1.5;
const FIRE_RATE = 0.11;
const RANGE = 90;

export class StormArena3DGame extends Game3D {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Survive waves of drones in a shrinking arena — the storm ring drains your health outside it.",
      "WASD moves. Click once to take aim, then the mouse turns you and holding the button fires. Reload with R.",
      "Build a wall with E (or the ■ button): instant cover that soaks fire and fades after a few seconds. Kills refill materials.",
      "Shields absorb damage first and drop from every fourth drone. Score is kills, waves and time survived.",
    ];
  }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["a", "b"]; }
  getTouchHint() { return "Left thumb stick moves. Drag anywhere on the view with your other thumb to aim. ● fires, ■ builds a wall."; }
  getKeyboardHint() { return "Click the view once to take aim. WASD moves, the mouse turns you, hold the button to fire, R reloads, E builds, Space jumps."; }

  onInit() {
    if (!this.setup3D({
      clearColor: "#0d1330", fogColor: "#232d63", fog: [80, 220],
      sky: "linear-gradient(#05081f 0%, #16204e 50%, #4a3d80 80%, #d98a6a 100%)",
      lightDir: [0.4, 0.9, 0.25], ambientSky: "#7d8ad0", ambientGround: "#20264a",
    })) return;

    const e = this.engine;
    e.mesh("unit", () => Geometry.box(1, 1, 1));
    e.mesh("ground", () => Geometry.plane(ARENA * 2, ARENA * 2));
    e.mesh("drone", () => Geometry.sphere(0.85, 14, 10));
    e.mesh("rotor", () => Geometry.box(2.2, 0.1, 0.3));
    e.mesh("shot", () => Geometry.sphere(0.22, 8, 6));
    e.mesh("orb", () => Geometry.sphere(0.5, 10, 8));
    e.mesh("ringPost", () => Geometry.cylinder(0.35, 9, 8));

    e.texture("floor", () => Textures.grid(256, { bg: "#1a2450", line: "#3ad6ff", cells: 4, width: 3 }));
    e.texture("crate", () => Textures.metal(128, "#8ea3e8"));
    e.texture("rock", () => Textures.rock(256, "#5b6390"));
    e.texture("hazard", () => Textures.stripes(128, { bg: "#ffd76a", stripe: "#1b1408", count: 6 }));

    this.overlay2D();
    this._bindLook();
    this.input.onKey("KeyR", () => this._reload());
    this.input.onKey("KeyE", () => this._build());
    this.input.onKey("Space", () => this._jump());
  }

  /**
   * Mouse look uses pointer lock, so moving the mouse aims and holding the
   * button fires — the two used to cancel each other out, because any drag
   * that turned the camera also cancelled the shot.
   * Without pointer lock (touch, or a browser that refuses it) dragging aims
   * and the on-screen buttons fire, which keeps the two inputs separate.
   */
  _bindLook() {
    const el = this.stageEl;
    this.pointerLocked = false;

    this._onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === el;
    };
    document.addEventListener("pointerlockchange", this._onLockChange);

    this._onRawMove = (ev) => {
      if (!this.pointerLocked || this.state !== "playing") return;
      this.yaw -= ev.movementX * 0.0022;
      this.pitch = clamp(this.pitch - ev.movementY * 0.0018, -0.5, 0.62);
    };
    document.addEventListener("mousemove", this._onRawMove);

    this._onDown = (ev) => {
      if (this.state !== "playing") return;
      if (!this.pointerLocked && el.requestPointerLock) {
        // The first click grabs the pointer; after that clicks are shots.
        el.requestPointerLock();
        return;
      }
      this.firing = true;
      ev.preventDefault?.();
    };
    this._onUp = () => { this.firing = false; };
    el.addEventListener("mousedown", this._onDown);
    window.addEventListener("mouseup", this._onUp);

    // Touch: one finger drags to aim and never fires — that is the ● button.
    // The look finger is tracked by identifier, because the other thumb is
    // almost always on the stick: reading touches[0] made every stick press
    // yank the camera to wherever that thumb happened to be.
    this._lookId = null;
    el.addEventListener("touchstart", this._onTouchStart = (ev) => {
      if (this._lookId !== null) return;
      const t = ev.changedTouches[0];
      this._lookId = t.identifier;
      this._look = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    el.addEventListener("touchmove", this._onTouchMove = (ev) => {
      for (const t of ev.changedTouches) {
        if (t.identifier !== this._lookId || !this._look) continue;
        this.yaw -= (t.clientX - this._look.x) * 0.006;
        this.pitch = clamp(this.pitch - (t.clientY - this._look.y) * 0.0045, -0.5, 0.62);
        this._look = { x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    const dropLook = (ev) => {
      for (const t of ev.changedTouches) {
        if (t.identifier === this._lookId) { this._lookId = null; this._look = null; }
      }
    };
    el.addEventListener("touchend", this._onTouchEnd = dropLook, { passive: true });
    el.addEventListener("touchcancel", dropLook, { passive: true });
  }

  onPause() { if (this.pointerLocked) document.exitPointerLock?.(); }

  onDestroy() {
    document.removeEventListener("pointerlockchange", this._onLockChange);
    document.removeEventListener("mousemove", this._onRawMove);
    window.removeEventListener("mouseup", this._onUp);
    if (document.pointerLockElement === this.stageEl) document.exitPointerLock?.();
    super.onDestroy();
  }

  onStart(difficulty) {
    if (!this.canPlay) return;
    this.cfg = {
      Easy:   { hp: 170, dmg: 5,  droneHp: 24, droneSpeed: 4.0, fire: 2.5, perWave: 3, walls: 6 },
      Normal: { hp: 135, dmg: 8,  droneHp: 32, droneSpeed: 4.8, fire: 2.0, perWave: 3, walls: 5 },
      Hard:   { hp: 130, dmg: 9,  droneHp: 42, droneSpeed: 5.6, fire: 1.9, perWave: 4, walls: 5 },
    }[difficulty] || {};

    this.firing = false;
    this.px = 0; this.pz = 0; this.py = 0; this.vy = 0;
    this.yaw = 0; this.pitch = 0.06;
    this.hp = this.cfg.hp; this.maxHp = this.cfg.hp;
    this.shield = 0;
    this.ammo = MAG; this.reloading = 0; this.cool = 0;
    this.walls = this.cfg.walls;
    this.kills = 0; this.wave = 0;
    this.elapsed = 0;
    this.intermission = 2.2;
    this.stormR = ARENA * 0.95;
    this.hitFlash = 0;

    this.enemies = [];
    this.bullets = [];      // enemy projectiles (travel time)
    this.tracers = [];      // player hitscan lines, purely visual
    this.pickups = [];
    this.builds = [];       // player-made walls, with a lifetime
    this.cover = this._buildArena();

    this.setScore(0);
    this._updateHud();
  }

  /** Fixed cover layout: a ring of crates plus a raised centre platform. */
  _buildArena() {
    const cover = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 16 + (i % 2) * 7;
      cover.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: 4.2, h: 3.2, d: 4.2, tex: "crate", color: "#6d7ab5" });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      cover.push({ x: Math.cos(a) * 31, z: Math.sin(a) * 31, w: 6.5, h: 5.4, d: 2.4, tex: "rock", color: "#4d5580" });
    }
    cover.push({ x: 0, z: 0, w: 11, h: 1.6, d: 11, tex: "crate", color: "#5a67a5", platform: true });
    return cover;
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Wave: this.wave || "…",
      HP: `${Math.max(0, Math.round(this.hp))}${this.shield > 0 ? ` +${Math.round(this.shield)}` : ""}`,
      Ammo: this.reloading > 0 ? "R…" : `${this.ammo}/${MAG}`,
      Walls: this.walls,
    });
  }

  // ------------------------------------------------------------ ACTIONS ----
  _forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }

  _jump() {
    if (this.state !== "playing") return;
    if (this.py <= this._floorAt(this.px, this.pz) + 0.02) { this.vy = JUMP_V; audioManager.play("jump"); }
  }

  _reload() {
    if (this.state !== "playing" || this.reloading > 0 || this.ammo === MAG) return;
    this.reloading = RELOAD_TIME;
    audioManager.play("click");
  }

  /** Drops a wall a few metres ahead — the panic button. */
  _build() {
    if (this.state !== "playing" || this.walls <= 0) return;
    const [fx, fz] = this._forward();
    this.walls--;
    this.builds.push({
      x: this.px + fx * 3.4, z: this.pz + fz * 3.4,
      yaw: this.yaw, life: 14, hp: 60,
      w: 5.4, h: 3.6, d: 0.6,
      y: this._floorAt(this.px + fx * 3.4, this.pz + fz * 3.4),
    });
    audioManager.play("toggle");
    this._updateHud();
  }

  _fire() {
    if (this.state !== "playing" || this.cool > 0 || this.reloading > 0) return;
    if (this.ammo <= 0) { this._reload(); return; }
    this.ammo--;
    this.cool = FIRE_RATE;
    audioManager.play("pop");

    const dir = this._aimDir();
    const origin = [this.px, this.py + EYE, this.pz];
    const hit = this._raycast(origin, dir);
    this.tracers.push({ from: origin, to: hit.point, t: 0 });
    if (hit.enemy) {
      hit.enemy.hp -= 12;
      hit.enemy.flash = 0.12;
      if (hit.enemy.hp <= 0) this._killDrone(hit.enemy);
    }
    if (this.ammo === 0) this._reload();
    this._updateHud();
  }

  _aimDir() {
    const cp = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp];
  }

  /**
   * Hitscan against drones and every solid box. Cover really blocks shots —
   * both ways — which is what makes the arena worth using.
   */
  _raycast(o, d) {
    let best = { dist: RANGE, point: [o[0] + d[0] * RANGE, o[1] + d[1] * RANGE, o[2] + d[2] * RANGE], enemy: null };
    for (const e of this.enemies) {
      const t = raySphere(o, d, [e.x, e.y, e.z], 1.0);
      if (t !== null && t < best.dist) best = { dist: t, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], enemy: e };
    }
    for (const b of this._solids()) {
      const t = rayBox(o, d, b);
      if (t !== null && t < best.dist) best = { dist: t, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], enemy: null, wall: b };
    }
    return best;
  }

  /** Cover crates plus the player's own walls, as axis-ish boxes. */
  _solids() {
    const out = this.cover.map(c => ({ min: [c.x - c.w / 2, 0, c.z - c.d / 2], max: [c.x + c.w / 2, c.h, c.z + c.d / 2], ref: c }));
    for (const w of this.builds) {
      // Built walls are treated as a box on their dominant axis; close enough
      // for cover and much cheaper than an oriented-box test.
      const along = Math.abs(Math.cos(w.yaw)) > Math.abs(Math.sin(w.yaw));
      const hw = along ? w.w / 2 : w.d / 2;
      const hd = along ? w.d / 2 : w.w / 2;
      out.push({ min: [w.x - hw, w.y, w.z - hd], max: [w.x + hw, w.y + w.h, w.z + hd], ref: w, built: true });
    }
    return out;
  }

  /** Ground height at a point: the centre platform is walkable. */
  _floorAt(x, z) {
    for (const c of this.cover) {
      if (!c.platform) continue;
      if (Math.abs(x - c.x) < c.w / 2 && Math.abs(z - c.z) < c.d / 2) return c.h;
    }
    return 0;
  }

  _killDrone(e) {
    e.dead = true;
    this.kills++;
    this.walls = Math.min(this.cfg.walls + 3, this.walls + 1);
    this.addScore(25 + this.wave * 3);
    audioManager.play("explosion");
    if (this.kills % 4 === 0) this.pickups.push({ x: e.x, z: e.z, kind: "shield", spin: 0 });
    else if (this.kills % 7 === 0) this.pickups.push({ x: e.x, z: e.z, kind: "health", spin: 0 });
    this._updateHud();
  }

  _hurt(amount) {
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
    }
    if (amount <= 0) { this._updateHud(); return; }
    this.hp -= amount;
    this.hitFlash = 0.3;
    this.shake();
    audioManager.play("hit");
    if (this.hp <= 0) {
      this.endGame({
        result: "loss", score: this.score,
        message: `Wave ${this.wave} took you down after ${this.kills} kills.`,
        extraStats: [{ label: "Wave", value: this.wave }, { label: "Kills", value: this.kills }],
      });
    }
    this._updateHud();
  }

  // ------------------------------------------------------------- WAVES -----
  _spawnWave() {
    this.wave++;
    const count = this.cfg.perWave + Math.floor(this.wave * 0.9);
    const hp = this.cfg.droneHp + this.wave * 7;
    for (let i = 0; i < count; i++) {
      const a = randFloat(0, Math.PI * 2);
      const r = randFloat(this.stormR * 0.55, this.stormR * 0.92);
      const heavy = this.wave >= 3 && i % 5 === 4;
      this.enemies.push({
        x: Math.cos(a) * r, z: Math.sin(a) * r, y: randFloat(1.4, 3.4),
        hp: heavy ? hp * 2.2 : hp, maxHp: heavy ? hp * 2.2 : hp,
        heavy,
        speed: this.cfg.droneSpeed * (heavy ? 0.65 : randFloat(0.85, 1.15)),
        // A drone spends its first moment closing in before it can shoot, so
        // a wave never lands as a wall of fire the instant it appears.
        cd: this.cfg.fire + randFloat(0.6, 1.6),
        bob: randFloat(0, 6.3), spin: randFloat(0, 6.3),
        flash: 0,
      });
    }
    // Every wave tightens the ring, but never past a fightable arena.
    this.stormR = Math.max(15, this.stormR - 2.6);
    audioManager.play("levelup");
    this._updateHud();
  }

  // ------------------------------------------------------------- UPDATE ----
  onUpdate(dt) {
    if (!this.canPlay) return;
    this.elapsed += dt;
    if (this.cool > 0) this.cool -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.ammo = MAG; audioManager.play("coin"); }
      this._updateHud();
    }

    this._movePlayer(dt);

    // Firing: hold the mouse button (pointer-locked) or the ● pad button.
    const v = this.input.virtual;
    if (this.firing || v.a) this._fire();
    if (v.b && !this._vb) this._build();
    this._vb = v.b;

    if (!this.enemies.length) {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this._spawnWave();
        // Waves keep arriving faster the longer you hold the arena.
        this.intermission = Math.max(1.2, 3.2 - this.wave * 0.18);
      }
    }

    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updatePickups(dt);
    this._updateStorm(dt);

    for (let i = this.builds.length - 1; i >= 0; i--) {
      this.builds[i].life -= dt;
      if (this.builds[i].life <= 0 || this.builds[i].hp <= 0) this.builds.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].t += dt;
      if (this.tracers[i].t > 0.07) this.tracers.splice(i, 1);
    }

    this.addScore(0);
    this._updateHud();
  }

  _movePlayer(dt) {
    // Analog when the thumb stick is driving, digital on a keyboard. The
    // magnitude is clamped rather than normalised, so a half-deflected stick
    // walks at half speed instead of sprinting like a held key.
    const ax = this.input.axes();
    const f = -ax.y, s = ax.x;
    const mag = Math.hypot(f, s);
    const k = mag > 1 ? 1 / mag : 1;
    const [fx, fz] = this._forward();
    const rx = fz, rz = -fx;                 // right vector
    let nx = this.px + (fx * f + rx * s) * k * MOVE * dt;
    let nz = this.pz + (fz * f + rz * s) * k * MOVE * dt;

    // Slide along cover instead of walking through it.
    if (!this._blocked(nx, this.pz)) this.px = nx;
    if (!this._blocked(this.px, nz)) this.pz = nz;
    const lim = ARENA - 1.5;
    this.px = clamp(this.px, -lim, lim);
    this.pz = clamp(this.pz, -lim, lim);

    const floor = this._floorAt(this.px, this.pz);
    this.vy -= GRAVITY * dt;
    this.py += this.vy * dt;
    if (this.py <= floor) { this.py = floor; this.vy = 0; }
  }

  /** Cylinder-vs-box test for the player against solid (non-platform) cover. */
  _blocked(x, z) {
    const R = 0.75;
    for (const c of this.cover) {
      if (c.platform) continue;
      if (Math.abs(x - c.x) < c.w / 2 + R && Math.abs(z - c.z) < c.d / 2 + R) return true;
    }
    for (const b of this._solids()) {
      if (!b.built) continue;
      if (x > b.min[0] - R && x < b.max[0] + R && z > b.min[2] - R && z < b.max[2] + R) return true;
    }
    return false;
  }

  _updateEnemies(dt) {
    const t = this.elapsed;
    for (const e of this.enemies) {
      if (e.flash > 0) e.flash -= dt;
      e.bob += dt * 3;
      e.spin += dt * 9;

      const dx = this.px - e.x, dz = this.pz - e.z;
      const d = Math.hypot(dx, dz) || 1;
      // Close to a preferred range, then orbit rather than piling on top.
      const want = e.heavy ? 9 : 13;
      const push = d > want ? 1 : d < want - 3 ? -0.7 : 0;
      const ox = -dz / d, oz = dx / d;
      const orbit = Math.sin(t * 0.6 + e.bob) * 0.9;
      e.x += ((dx / d) * push + ox * orbit) * e.speed * dt;
      e.z += ((dz / d) * push + oz * orbit) * e.speed * dt;
      e.y += Math.sin(t * 2 + e.bob) * 0.6 * dt;
      e.y = clamp(e.y, 1.2, 4.2);

      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = this.cfg.fire * randFloat(0.8, 1.3);
        // Only shoot with a clear line — cover has to mean something.
        const origin = [e.x, e.y, e.z];
        const to = [this.px - e.x, this.py + EYE * 0.6 - e.y, this.pz - e.z];
        const dist = Math.hypot(to[0], to[1], to[2]) || 1;
        const dir = [to[0] / dist, to[1] / dist, to[2] / dist];
        // Drones only engage inside their own range: sniping from the far
        // edge of the arena made every wave land as crossfire.
        if (dist < 27 && !this._blockedBySolid(origin, dir, dist)) {
          this.bullets.push({
            x: e.x, y: e.y, z: e.z,
            vx: dir[0] * 34, vy: dir[1] * 34, vz: dir[2] * 34,
            dmg: this.cfg.dmg * (e.heavy ? 1.6 : 1), life: 3,
          });
          audioManager.play("hover");
        }
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  _blockedBySolid(o, d, maxDist) {
    for (const b of this._solids()) {
      const t = rayBox(o, d, b);
      if (t !== null && t < maxDist) return true;
    }
    return false;
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const px = b.x, py = b.y, pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.life -= dt;

      // Walls the player built soak hits and eventually break.
      let absorbed = false;
      for (const s of this._solids()) {
        if (b.x > s.min[0] && b.x < s.max[0] && b.y > s.min[1] && b.y < s.max[1] && b.z > s.min[2] && b.z < s.max[2]) {
          if (s.built) s.ref.hp -= b.dmg;
          absorbed = true;
          break;
        }
      }
      const hitPlayer = Math.hypot(b.x - this.px, b.y - (this.py + EYE * 0.7), b.z - this.pz) < 1.05;
      if (hitPlayer) this._hurt(b.dmg);
      if (absorbed || hitPlayer || b.life <= 0 || b.y < 0) this.bullets.splice(i, 1);
      void px; void py; void pz;
    }
  }

  _updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.spin += dt * 3;
      if (Math.hypot(p.x - this.px, p.z - this.pz) < 1.8) {
        if (p.kind === "shield") this.shield = Math.min(60, this.shield + 30);
        else this.hp = Math.min(this.maxHp, this.hp + 28);
        audioManager.play("coin");
        this.pickups.splice(i, 1);
        this._updateHud();
      }
    }
  }

  _updateStorm(dt) {
    const d = Math.hypot(this.px, this.pz);
    if (d > this.stormR) {
      this._stormTick = (this._stormTick || 0) + dt;
      if (this._stormTick > 0.5) { this._stormTick = 0; this._hurt(5 + this.wave); }
    } else {
      this._stormTick = 0;
      this.addScore(0);
    }
  }

  // ------------------------------------------------------------- RENDER ----
  onRender(ctx, dt) {
    if (!this.canPlay) return;
    const e = this.engine;
    const t = this.elapsed;

    // Third-person camera slung behind and above the player.
    const [fx, fz] = this._forward();
    const back = 8.2, up = 3.4;
    e.camera.pos = [this.px - fx * back, this.py + EYE + up - this.pitch * 3, this.pz - fz * back];
    e.camera.target = [this.px + fx * 8, this.py + EYE + this.pitch * 9, this.pz + fz * 8];
    e.beginFrame();

    e.draw("ground", { pos: [0, 0, 0], color: "#2b3670", texture: "floor", uvScale: [14, 14] });

    for (const c of this.cover) {
      e.shadow(c.x, c.z, Math.max(c.w, c.d) * 0.62, { alpha: 0.3 });
      e.draw("unit", {
        pos: [c.x, c.h / 2, c.z], scale: [c.w, c.h, c.d],
        color: c.color, texture: c.tex, uvScale: [Math.max(1, c.w / 3), Math.max(1, c.h / 3)],
      });
      if (!c.platform) e.draw("unit", { pos: [c.x, c.h + 0.06, c.z], scale: [c.w * 0.9, 0.12, c.d * 0.9], color: "#3ad6ff", emissive: 0.55 });
    }

    for (const w of this.builds) {
      const wear = clamp(w.hp / 60, 0.2, 1);
      e.draw("unit", {
        pos: [w.x, w.y + w.h / 2, w.z], rot: [0, -w.yaw, 0], scale: [w.w, w.h, w.d],
        color: "#ffd76a", texture: "hazard", uvScale: [2, 1], alpha: 0.55 + wear * 0.45,
      });
    }

    // Storm ring: a circle of posts that closes in each wave.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      e.draw("ringPost", {
        pos: [Math.cos(a) * this.stormR, 4.5, Math.sin(a) * this.stormR],
        color: "#c86bff", emissive: 0.6, alpha: 0.42 + Math.sin(t * 2 + i) * 0.12,
      });
    }

    for (const en of this.enemies) {
      const col = en.flash > 0 ? "#ffffff" : en.heavy ? "#ffa03a" : "#ff6b86";
      e.shadow(en.x, en.z, en.heavy ? 1.3 : 0.9, { alpha: 0.3 });
      e.draw("drone", { pos: [en.x, en.y, en.z], scale: en.heavy ? [1.5, 1.5, 1.5] : [1, 1, 1], color: col, texture: "crate", uvScale: [1, 1] });
      e.draw("rotor", { pos: [en.x, en.y + (en.heavy ? 1.3 : 0.9), en.z], rot: [0, en.spin, 0], scale: en.heavy ? [1.4, 1, 1.4] : [1, 1, 1], color: "#cfd6ff", emissive: 0.35 });
      e.draw("orb", { pos: [en.x, en.y, en.z + 0.9], scale: [0.5, 0.5, 0.5], color: "#ffe08a", emissive: 0.8 });
    }

    for (const b of this.bullets) {
      e.draw("shot", { pos: [b.x, b.y, b.z], color: "#ff9f43", emissive: 0.9 });
    }

    for (const p of this.pickups) {
      e.draw("orb", {
        pos: [p.x, 1 + Math.sin(p.spin) * 0.2, p.z], rot: [0, p.spin, 0],
        color: p.kind === "shield" ? "#22d3ee" : "#2ee6a6", emissive: 0.75,
      });
    }

    // Tracers: a thin box stretched between muzzle and impact.
    for (const tr of this.tracers) {
      const dx = tr.to[0] - tr.from[0], dy = tr.to[1] - tr.from[1], dz = tr.to[2] - tr.from[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      e.draw("unit", {
        pos: [(tr.from[0] + tr.to[0]) / 2, (tr.from[1] + tr.to[1]) / 2, (tr.from[2] + tr.to[2]) / 2],
        rot: [Math.asin(clamp(dy / len, -1, 1)), -Math.atan2(dx, dz), 0],
        scale: [0.07, 0.07, len], color: "#fff3c4", emissive: 1, alpha: 0.8,
      });
    }

    this._drawPlayer(e, t);
    this._drawOverlay(this.hudCtx);
  }

  _drawPlayer(e, t) {
    const [fx, fz] = this._forward();
    const y = this.py;
    e.shadow(this.px, this.pz, 0.9, { y: this._floorAt(this.px, this.pz) + 0.03, alpha: 0.38 });
    e.draw("unit", { pos: [this.px, y + 0.95, this.pz], rot: [0, -this.yaw, 0], scale: [0.85, 1.15, 0.6], color: "#2ee6a6", texture: "crate", uvScale: [1, 1] });
    e.draw("orb", { pos: [this.px, y + 1.85, this.pz], scale: [0.85, 0.85, 0.85], color: "#eaf6ff" });
    // Weapon, pointing where the camera looks.
    e.draw("unit", {
      pos: [this.px + fx * 1.0 + fz * 0.42, y + 1.35 + this.pitch * 0.7, this.pz + fz * 1.0 - fx * 0.42],
      rot: [this.pitch, -this.yaw, 0], scale: [0.22, 0.24, 1.5], color: "#39406b", texture: "crate", uvScale: [1, 1],
    });
    void t;
  }

  /** 2D layer on top of the WebGL canvas: crosshair, health, storm warning. */
  _drawOverlay(ctx) {
    if (!ctx) return;
    const W = this.viewW, H = this.viewH;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H * 0.46;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 11, cy);
    ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 11);
    ctx.stroke();

    // Health + shield bar
    const bw = Math.min(260, W * 0.32), bh = 9, bx = 18, by = H - 34;
    ctx.fillStyle = "rgba(6,10,24,0.6)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = "#2ee6a6";
    ctx.fillRect(bx, by, bw * clamp(this.hp / this.maxHp, 0, 1), bh);
    if (this.shield > 0) {
      ctx.fillStyle = "#22d3ee";
      ctx.fillRect(bx, by - 12, bw * clamp(this.shield / 60, 0, 1), 6);
    }

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,60,80,${this.hitFlash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (Math.hypot(this.px, this.pz) > this.stormR) {
      this.gfx.label(ctx, "OUTSIDE THE STORM", W / 2, 40, { size: 17, weight: 800, color: "#ff8fa4" });
    }
    if (!this.enemies.length && this.intermission > 0) {
      this.gfx.label(ctx, `WAVE ${this.wave + 1}`, W / 2, H * 0.3, { size: 30, weight: 800, color: "rgba(255,255,255,0.92)" });
    }
    // Mouse players need to know the first click grabs the pointer.
    if (!this.pointerLocked && !this.input.isTouch) {
      this.gfx.label(ctx, "Click to take aim — then hold to fire", W / 2, H - 16,
        { size: 13, weight: 700, color: "rgba(255,255,255,0.66)" });
    }
  }
}

// ------------------------------------------------------------- ray maths --
function raySphere(o, d, c, r) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

/** Slab test against an axis-aligned box; returns the near hit distance. */
function rayBox(o, d, box) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null;
    } else {
      const inv = 1 / d[i];
      let t1 = (box.min[i] - o[i]) * inv;
      let t2 = (box.max[i] - o[i]) * inv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : null;
}

export default StormArena3DGame;
