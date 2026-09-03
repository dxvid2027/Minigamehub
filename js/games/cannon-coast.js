// ==========================================================================
// Cannon Coast — an artillery duel across a coastline that keeps changing.
//
// Two guns, one hill between them, and a wind that is redrawn every turn.
// You set an angle and a power, the shell arcs, and whatever it lands on
// stops being there — the terrain is a heightmap that craters, so a duel
// that starts across a ridge often ends across a crater you dug yourself.
//
// Ten opponents on the ladder, each a little better at reading the wind
// than the last. Beating one unlocks the next shell, and the shells are
// the real progression: a cluster round and a bunker buster ask completely
// different questions of the same hill.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, seededRng } from "../core/utils.js";

const GRAV = 320;
const COLS = 220;             // terrain sample columns
const MAX_POWER = 100;

// --- Shells ---------------------------------------------------------------
// Unlocked one per ladder win. `n` is how many the shell gives you per duel;
// the plain shell is unlimited so you are never stuck without ammunition.
const SHELLS = [
  { id: "shell",   name: "Shell",         n: Infinity, dmg: 30, radius: 26, text: "Standard round. Never runs out." },
  { id: "heavy",   name: "Heavy Shell",   n: 3, dmg: 52, radius: 34, text: "Slower, heavier, digs a wider crater." , drag: 1.25 },
  { id: "cluster", name: "Cluster",       n: 2, dmg: 22, radius: 20, text: "Splits into five bomblets at the top of its arc.", cluster: 5 },
  { id: "mortar",  name: "Mortar",        n: 3, dmg: 34, radius: 24, text: "Falls almost vertically. Ignores a ridge.", lob: 1.9 },
  { id: "driller", name: "Driller",       n: 2, dmg: 40, radius: 16, text: "Burrows through terrain before it goes off.", drill: 26 },
  { id: "napalm",  name: "Napalm",        n: 2, dmg: 16, radius: 18, text: "Twelve burning splashes across the slope.", splash: 12 },
  { id: "buster",  name: "Bunker Buster", n: 1, dmg: 74, radius: 44, text: "One shot. Removes most of a hill." },
  { id: "mirv",    name: "MIRV",          n: 1, dmg: 30, radius: 24, text: "Three warheads, spread wide, at the apex.", cluster: 3, spread: 90 },
];

// --- Opponents ------------------------------------------------------------
// `aim` is how tight the AI's error cone is; `wind` is how much of the wind
// it corrects for. The late ones are not luckier, they are better read.
const FOES = [
  { name: "Rusty Pete",     hp: 100, aim: 13,  wind: 0.1, color: "#8a7a5c", hat: "cap" },
  { name: "Deckhand Mo",    hp: 110, aim: 11,  wind: 0.25, color: "#6f9c5c", hat: "cap" },
  { name: "Gunner Wren",    hp: 120, aim: 9,   wind: 0.4, color: "#5fa8d8", hat: "helm" },
  { name: "Bosun Vale",     hp: 130, aim: 7.5, wind: 0.5, color: "#c98f4a", hat: "helm" },
  { name: "Quartermaster",  hp: 140, aim: 6,   wind: 0.62, color: "#a86bff", hat: "horn" },
  { name: "The Cartwright", hp: 150, aim: 5,   wind: 0.72, color: "#e8574a", hat: "horn" },
  { name: "Ironsight Bel",  hp: 165, aim: 4,   wind: 0.8, color: "#7c8494", hat: "scope" },
  { name: "Admiral Crane",  hp: 180, aim: 3,   wind: 0.88, color: "#ffd76a", hat: "scope" },
  { name: "The Widowmaker", hp: 200, aim: 2.2, wind: 0.94, color: "#ff4fd8", hat: "crown" },
  { name: "Coastmaster",    hp: 230, aim: 1.4, wind: 1.0, color: "#22d3ee", hat: "crown" },
];

// Terrain palettes, one per ladder rung, so the coast changes as you climb.
const COASTS = [
  { sky: ["#6fa8d8", "#c9e0f0"], land: "#6d9455", deep: "#3f5c34", sand: "#e0cf9a", sea: "#3f7fa8" },
  { sky: ["#e8a05c", "#ffd9a8"], land: "#b08a4a", deep: "#6d5228", sand: "#f0dcae", sea: "#4a7f9c" },
  { sky: ["#4a5c8a", "#8fa8c9"], land: "#5c6b7a", deep: "#343c4a", sand: "#b8bcc9", sea: "#2a4f6b" },
  { sky: ["#2a3a5c", "#6b7fa8"], land: "#4a5c6b", deep: "#2a343f", sand: "#8fa0ae", sea: "#1d3a52" },
  { sky: ["#5c2a44", "#c96b8a"], land: "#7a4a5c", deep: "#4a2434", sand: "#d8a8b8", sea: "#4a2a4a" },
];

export class CannonCoastGame extends GameBase {
  getDifficulties() { return ["Duel"]; }
  getInstructions() {
    return [
      "Drag anywhere to aim: the angle sets the barrel, the length sets the power. Release to fire.",
      "The arrow at the top is the wind. It pushes the shell sideways the whole way, so a crosswind changes the shot more than the distance does.",
      "The ground is destructible. Craters change every shot after them — including the one you are standing on.",
      "Beat an opponent to unlock the next shell. Special shells are limited per duel; the plain shell never runs out.",
      "Ten opponents. Each one reads the wind better than the last, and the final two barely miss.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag to aim and set power, release to fire. Tap a shell to switch."; }
  getKeyboardHint() { return "Drag with the mouse to aim. 1-8 picks a shell, Space fires the last shot again."; }
  getScene() { return "sunset"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.coast) custom.coast = { rung: 0, wins: 0, bestRung: 0 };
    return custom.coast;
  }
  _save() { saveManager.saveNow(); }
  _unlockedShells() { return SHELLS.slice(0, 1 + Math.min(SHELLS.length - 1, this._store().bestRung)); }

  getPlayLabel() { return "Choose an opponent"; }
  getStartExtras() {
    const c = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Ladder: ${c.bestRung}/${FOES.length}`),
      el("span", {}, `${this._unlockedShells().length}/${SHELLS.length} shells`),
      el("span", {}, `${c.wins || 0} duels won`),
    ]);
  }

  onPlayPressed() { audioManager.play("click"); this.openLadder(); }

  openLadder() {
    const c = this._store();
    const grid = el("div", { class: "foe-grid" });
    FOES.forEach((f, i) => {
      const open = i <= c.bestRung;
      grid.appendChild(el("button", {
        class: `foe-card${open ? "" : " locked"}${i < c.bestRung ? " beaten" : ""}`,
        disabled: !open,
        style: `--fc:${f.color}`,
        onClick: () => { closeModal(); this.rung = i; this.start(); },
      }, [
        el("span", { class: "sw" }),
        el("span", { class: "n" }, `${i + 1}`),
        el("span", { class: "nm" }, open ? f.name : "Locked"),
        el("span", { class: "st" }, open ? `${f.hp} hp · ${accuracyWord(f.aim)}` : `Beat ${FOES[i - 1].name}`),
      ]));
    });
    openModal({
      title: "The Ladder",
      bodyNode: el("div", { class: "foe-picker" }, [
        el("p", { class: "zone-intro" }, "Each win unlocks the next shell. Rematches are always allowed — the terrain is different every time."),
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
    for (let i = 1; i <= 8; i++) this.input.onKey(`Digit${i}`, () => this._pickShell(i - 1));
    this.rung = 0;
  }

  onResize() { this._rebuildTerrainPixels(); }

  onStart() {
    const foe = FOES[this.rung];
    this.foe = foe;
    this.coast = COASTS[this.rung % COASTS.length];
    this._genTerrain();

    this.you = { x: 0.12, hp: 130, maxHp: 130, angle: -0.7, power: 62, recoil: 0 };
    this.them = { x: 0.88, hp: foe.hp, maxHp: foe.hp, angle: -2.44, power: 62, recoil: 0 };
    this._place(this.you);
    this._place(this.them);

    this.ammo = {};
    for (const s of this._unlockedShells()) this.ammo[s.id] = s.n;
    this.shellIdx = 0;
    this.turn = "you";
    this.shots = 0;
    this.projectiles = [];
    this.blasts = [];
    this.smoke = [];
    this.aim = null;
    this.wind = randFloat(-34, 34);
    this.msg = "Your shot";
    this.msgT = 2;
    this.elapsed = 0;
    this.aiTimer = 0;
    this.setScore(0);
    this._updateHud();
  }

  /** A coastline: two ridges and a sea shelf, built from layered sines. */
  _genTerrain() {
    const rng = seededRng(`coast-${this.rung}-${Date.now()}`);
    const base = 0.62 + rng() * 0.06;
    const phase = rng() * 6.3;
    const peaks = [
      { x: 0.24 + rng() * 0.1, h: 0.1 + rng() * 0.13, w: 0.13 + rng() * 0.07 },
      { x: 0.5 + rng() * 0.06 - 0.03, h: 0.16 + rng() * 0.2, w: 0.1 + rng() * 0.09 },
      { x: 0.72 + rng() * 0.1, h: 0.09 + rng() * 0.14, w: 0.12 + rng() * 0.07 },
    ];
    this.height = new Float32Array(COLS);
    for (let i = 0; i < COLS; i++) {
      const t = i / (COLS - 1);
      let h = base
        + Math.sin(t * 7.3 + phase) * 0.012
        + Math.sin(t * 19.7) * 0.006;
      for (const p of peaks) {
        const d = (t - p.x) / p.w;
        h -= p.h * Math.exp(-d * d * 2.2);
      }
      // The outer edges fall away below the sea line so the coast actually
      // has water in it — without this the hill filled the frame and the sea
      // layer was drawn entirely behind it.
      const edge = Math.min(t, 1 - t);
      if (edge < 0.055) h += (0.055 - edge) * 7.5;
      this.height[i] = clamp(h, 0.22, 1.02);
    }
    this._rebuildTerrainPixels();
  }

  _rebuildTerrainPixels() { this._terrainDirty = true; }

  _hAt(nx) {
    const t = clamp(nx, 0, 1) * (COLS - 1);
    const i = Math.floor(t), f = t - i;
    const a = this.height[i], b = this.height[Math.min(COLS - 1, i + 1)];
    return a + (b - a) * f;
  }

  _place(tank) { tank.y = this._hAt(tank.x); }

  // ------------------------------------------------------------- INPUT ---
  _pickShell(i) {
    const list = this._unlockedShells();
    if (i >= list.length) return;
    const s = list[i];
    if (this.ammo[s.id] <= 0) { audioManager.play("error"); return; }
    this.shellIdx = i;
    audioManager.play("select");
    this._updateHud();
  }

  _shellBarLayout() {
    const W = this.viewW, H = this.viewH;
    const list = this._unlockedShells();
    const w = Math.min(74, (W - 20) / list.length - 5);
    const total = list.length * w + (list.length - 1) * 5;
    const x0 = (W - total) / 2;
    return list.map((s, i) => ({ i, s, x: x0 + i * (w + 5), y: H - 40, w, h: 30 }));
  }

  _down(x, y) {
    if (this.state !== "playing") return;
    for (const b of this._shellBarLayout()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { this._pickShell(b.i); return; }
    }
    if (this.turn !== "you" || this.projectiles.length) return;
    this.aim = { x, y, sx: x, sy: y };
  }
  _move(x, y) { if (this.aim) { this.aim.x = x; this.aim.y = y; } }
  _up() {
    if (!this.aim) return;
    const a = this.aim;
    this.aim = null;
    const dx = a.x - a.sx, dy = a.y - a.sy;
    const len = Math.hypot(dx, dy);
    if (len < 10) return;
    // Drag away from the target: the barrel points opposite the drag, like
    // pulling a sling back, which is the idiom every artillery game uses.
    this.you.angle = Math.atan2(-dy, -dx);
    this.you.power = clamp((len / (this.viewW * 0.28)) * MAX_POWER, 12, MAX_POWER);
    this._fire(this.you, 1);
  }

  // ------------------------------------------------------------- COMBAT --
  _fire(tank, dir) {
    const shell = dir > 0 ? this._unlockedShells()[this.shellIdx] : SHELLS[0];
    if (dir > 0 && this.ammo[shell.id] <= 0) return;
    if (dir > 0 && this.ammo[shell.id] !== Infinity) this.ammo[shell.id]--;
    const W = this.viewW, H = this.viewH;
    const muzzle = this._muzzle(tank);
    const speed = tank.power * 5.4 * (shell.lob ? 1 / shell.lob : 1);
    this.projectiles.push({
      x: muzzle.x, y: muzzle.y,
      vx: Math.cos(tank.angle) * speed,
      vy: Math.sin(tank.angle) * speed * (shell.lob || 1),
      shell, owner: dir > 0 ? "you" : "them",
      t: 0, split: false, trail: [],
      drag: shell.drag || 1,
    });
    tank.recoil = 1;
    this.shots++;
    audioManager.play("shoot");
    this.shake();
    this._updateHud();
  }

  _muzzle(tank) {
    const W = this.viewW, H = this.viewH;
    const x = tank.x * W, y = tank.y * H;
    return { x: x + Math.cos(tank.angle) * 26, y: y - 12 + Math.sin(tank.angle) * 26 };
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    for (const t of [this.you, this.them]) if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 4);

    this._stepProjectiles(dt);
    this._stepEffects(dt);

    if (!this.projectiles.length && this.turn === "them" && this.state === "playing") {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) this._aiShoot();
    }
    this._updateHud();
  }

  _stepProjectiles(dt) {
    const W = this.viewW, H = this.viewH;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      p.vy += GRAV * p.drag * dt;
      p.vx += this.wind * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 70) p.trail.shift();

      // Cluster shells split at the top of the arc, which is what makes them
      // a positioning weapon rather than a bigger shell.
      if (p.shell.cluster && !p.split && p.vy > 0) {
        p.split = true;
        const n = p.shell.cluster, spread = p.shell.spread || 40;
        for (let k = 0; k < n; k++) {
          this.projectiles.push({
            x: p.x, y: p.y,
            vx: p.vx + (k - (n - 1) / 2) * (spread / n) * 2,
            vy: p.vy - 20,
            shell: { ...p.shell, cluster: 0 }, owner: p.owner,
            t: 0, split: true, trail: [], drag: p.drag,
          });
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.x < -200 || p.x > W + 200 || p.y > H + 400) { this.projectiles.splice(i, 1); this._afterShot(); continue; }

      // Direct hit on a tank.
      for (const [who, tank] of [["you", this.you], ["them", this.them]]) {
        const tx = tank.x * W, ty = tank.y * H;
        if (Math.hypot(p.x - tx, p.y - ty) < 20) {
          this._detonate(p, p.x, p.y, true);
          this.projectiles.splice(i, 1);
          this._afterShot();
          break;
        }
      }
      if (!this.projectiles.includes(p)) continue;

      // Terrain.
      const nx = p.x / W;
      if (p.y / H >= this._hAt(nx) && nx >= -0.02 && nx <= 1.02) {
        if (p.shell.drill && p.drilled === undefined) p.drilled = 0;
        if (p.shell.drill && p.drilled < p.shell.drill) {
          // Burrowing: keep going, carving as it does.
          p.drilled += Math.abs(p.vy) * dt;
          this._crater(nx, p.y / H, 0.024);
          continue;
        }
        this._detonate(p, p.x, p.y, false);
        this.projectiles.splice(i, 1);
        this._afterShot();
      }
    }
  }

  _detonate(p, x, y, direct) {
    const W = this.viewW, H = this.viewH;
    const shell = p.shell;
    this.blasts.push({ x, y, t: 0, r: shell.radius * (direct ? 1.2 : 1), color: shell.id === "napalm" ? "#ff9f43" : "#ffd76a" });
    audioManager.play("explosion");
    this.shake();
    this._crater(x / W, y / H, (shell.radius / W) * 1.9);

    // Napalm keeps burning down the slope it landed on.
    if (shell.splash) {
      for (let k = 0; k < shell.splash; k++) {
        const sx = x + randFloat(-shell.radius * 2.6, shell.radius * 2.6);
        const sy = this._hAt(sx / W) * H;
        this.blasts.push({ x: sx, y: sy, t: -k * 0.05, r: shell.radius * 0.7, color: "#ff6b28" });
        this._crater(sx / W, sy / H, (shell.radius / W) * 0.6);
        this._damageAt(sx, sy, shell.radius * 0.9, shell.dmg * 0.4, p.owner);
      }
    }
    this._damageAt(x, y, shell.radius * (direct ? 1.6 : 1.35), shell.dmg * (direct ? 1.35 : 1), p.owner);

    for (let k = 0; k < 12; k++) {
      this.smoke.push({
        x, y, vx: randFloat(-90, 90), vy: randFloat(-140, -20),
        r: randFloat(4, 11), t: 0, life: randFloat(0.5, 1.2),
        color: shell.id === "napalm" ? "#ff9f43" : "#c9ccd8",
      });
    }
  }

  _damageAt(x, y, radius, dmg, owner) {
    const W = this.viewW, H = this.viewH;
    for (const [who, tank] of [["you", this.you], ["them", this.them]]) {
      const d = Math.hypot(x - tank.x * W, y - tank.y * H);
      if (d > radius) continue;
      const amount = Math.round(dmg * (1 - d / radius) + dmg * 0.25);
      tank.hp = Math.max(0, tank.hp - amount);
      this.msg = who === "them" ? `Hit for ${amount}` : `Took ${amount}`;
      this.msgT = 1.6;
      if (who === "them") this.addScore(amount * (this.rung + 1));
    }
  }

  /** Digs a bowl out of the heightmap. This is the whole destructible model. */
  _crater(nx, ny, nr) {
    const c = nx * (COLS - 1), r = nr * COLS;
    for (let i = Math.max(0, Math.floor(c - r)); i <= Math.min(COLS - 1, Math.ceil(c + r)); i++) {
      const d = Math.abs(i - c) / r;
      if (d > 1) continue;
      const dig = Math.sqrt(1 - d * d) * nr * 1.5;
      // Ground only falls away, never rises: a crater is a crater.
      this.height[i] = clamp(Math.max(this.height[i], ny) + dig * 0.55, 0.18, 0.98);
    }
    this._place(this.you);
    this._place(this.them);
    this._terrainDirty = true;
  }

  _afterShot() {
    if (this.projectiles.length) return;
    if (this.you.hp <= 0 || this.them.hp <= 0) { this._finish(); return; }
    this.turn = this.turn === "you" ? "them" : "you";
    this.wind = randFloat(-34, 34) * (1 + this.rung * 0.05);
    this.aiTimer = 1.1;
    this.msg = this.turn === "you" ? "Your shot" : `${this.foe.name} is aiming`;
    this.msgT = 2;
  }

  /**
   * The AI's shot. It solves the ballistic angle for the range it can see,
   * corrects for as much of the wind as its skill allows, then adds an error
   * cone — so a strong opponent misses narrowly rather than randomly.
   */
  _aiShoot() {
    const W = this.viewW, H = this.viewH;
    const from = this._muzzle(this.them);
    const target = { x: this.you.x * W, y: this.you.y * H };
    const dx = target.x - from.x, dy = target.y - from.y;

    // Search angles and powers for the pair whose flight lands closest,
    // simulating with the same integrator the shell will use.
    let best = null;
    for (let a = 185; a <= 355; a += 5) {
      for (let pw = 25; pw <= MAX_POWER; pw += 5) {
        const rad = (a * Math.PI) / 180;
        const speed = pw * 5.4;
        let x = from.x, y = from.y, vx = Math.cos(rad) * speed, vy = Math.sin(rad) * speed;
        let miss = Infinity;
        for (let k = 0; k < 420; k++) {
          vy += GRAV * (1 / 60);
          vx += this.wind * this.foe.wind * (1 / 60);
          x += vx / 60; y += vy / 60;
          miss = Math.min(miss, Math.hypot(x - target.x, y - target.y));
          if (y / H >= this._hAt(x / W)) break;
          if (x < -200 || x > W + 200 || y > H + 300) break;
        }
        if (!best || miss < best.miss) best = { a, pw, miss };
      }
    }
    if (!best) best = { a: 250, pw: 55 };
    // Error cone: the whole difficulty curve lives in this one number.
    this.them.angle = ((best.a + randFloat(-this.foe.aim, this.foe.aim)) * Math.PI) / 180;
    this.them.power = clamp(best.pw + randFloat(-this.foe.aim * 0.8, this.foe.aim * 0.8), 12, MAX_POWER);
    this._fire(this.them, -1);
  }

  _finish() {
    const won = this.them.hp <= 0;
    const store = this._store();
    if (won) {
      store.wins = (store.wins || 0) + 1;
      if (store.bestRung <= this.rung) store.bestRung = Math.min(FOES.length, this.rung + 1);
      this.addScore(500 + this.rung * 250);
    }
    this._save();
    const nextShell = SHELLS[Math.min(SHELLS.length - 1, this.rung + 1)];
    this.endGame({
      result: won ? "win" : "loss",
      score: this.score,
      message: won
        ? (this.rung + 1 >= FOES.length
            ? `The Coastmaster is beaten. The whole ladder is yours.`
            : `${this.foe.name} is down in ${this.shots} shots. ${nextShell ? `${nextShell.name} unlocked.` : ""}`)
        : `${this.foe.name} found the range first. ${this.shots} shots fired.`,
      extraStats: [
        { label: "Shots", value: this.shots },
        { label: "Their HP", value: `${this.them.hp}/${this.them.maxHp}` },
        { label: "Ladder", value: `${store.bestRung}/${FOES.length}` },
      ],
    });
  }

  _stepEffects(dt) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t += dt;
      if (this.blasts[i].t > 0.55) this.blasts.splice(i, 1);
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; s.vx *= 0.98;
      if (s.t >= s.life) this.smoke.splice(i, 1);
    }
  }

  _updateHud() {
    const shell = this._unlockedShells()[this.shellIdx] || SHELLS[0];
    const n = this.ammo?.[shell.id];
    this.setHud({
      You: `${this.you?.hp ?? 0}`,
      Foe: `${this.them?.hp ?? 0}`,
      Shell: shell.name,
      Ammo: n === Infinity ? "∞" : `${n ?? 0}`,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawSky(ctx, W, H);
    this._drawSea(ctx, W, H);
    this._drawTerrain(ctx, W, H);
    this._drawTank(ctx, this.you, W, H, "#2ee6a6", "cap");
    this._drawTank(ctx, this.them, W, H, this.foe.color, this.foe.hat);
    this._drawProjectiles(ctx);
    this._drawBlasts(ctx);
    this._drawSmoke(ctx);
    if (this.aim) this._drawAim(ctx, W, H);
    this._drawWind(ctx, W);
    this._drawBars(ctx, W, H);
    this._drawShellBar(ctx, W, H);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _drawSky(ctx, W, H) {
    const c = this.coast;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c.sky[0]); g.addColorStop(1, c.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // A low sun and a couple of drifting cloud banks.
    ctx.fillStyle = "rgba(255,240,200,0.5)";
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.17, 34, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for (let i = 0; i < 4; i++) {
      const x = ((this.elapsed * (5 + i * 3) + i * 260) % (W + 320)) - 160;
      const y = H * (0.09 + i * 0.055);
      ctx.beginPath();
      ctx.ellipse(x, y, 62 + i * 14, 15, 0, 0, 7);
      ctx.ellipse(x + 40, y - 8, 42, 12, 0, 0, 7);
      ctx.fill();
    }
  }

  _drawSea(ctx, W, H) {
    const c = this.coast;
    const y = H * 0.86;
    ctx.fillStyle = c.sea;
    ctx.fillRect(0, y, W, H - y);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const yy = y + 8 + k * 14 + Math.sin(x * 0.03 + this.elapsed * 1.6 + k) * 3;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
  }

  /** The heightmap as a filled band with a sand lip and a darker core. */
  _drawTerrain(ctx, W, H) {
    const c = this.coast;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < COLS; i++) ctx.lineTo((i / (COLS - 1)) * W, this.height[i] * H);
    ctx.lineTo(W, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, H * 0.3, 0, H);
    g.addColorStop(0, c.land); g.addColorStop(1, c.deep);
    ctx.fillStyle = g;
    ctx.fill();

    // Sand lip along the surface.
    ctx.strokeStyle = c.sand;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i < COLS; i++) {
      const x = (i / (COLS - 1)) * W, y = this.height[i] * H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    // Strata lines inside the hill.
    ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 3;
    for (let k = 1; k <= 5; k++) {
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const x = (i / (COLS - 1)) * W, y = this.height[i] * H + k * 22;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTank(ctx, tank, W, H, color, hat) {
    const x = tank.x * W, y = tank.y * H;
    ctx.save();
    ctx.translate(x, y - 2);
    const kick = tank.recoil * 5;
    // Barrel.
    ctx.save();
    ctx.translate(-Math.cos(tank.angle) * kick, -Math.sin(tank.angle) * kick);
    ctx.rotate(tank.angle);
    ctx.fillStyle = "#3a3f52";
    ctx.fillRect(0, -4, 30, 8);
    ctx.fillStyle = "#8b90ac";
    ctx.fillRect(24, -5, 6, 10);
    ctx.restore();
    // Hull.
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(0, 8, 22, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, 6); ctx.lineTo(-16, -6); ctx.lineTo(16, -6); ctx.lineTo(20, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    // Turret.
    ctx.fillStyle = shadeHex(color, -0.22);
    ctx.beginPath(); ctx.arc(0, -6, 10, Math.PI, 0); ctx.fill();
    // Treads.
    ctx.fillStyle = "#1c1f2e";
    ctx.fillRect(-20, 5, 40, 6);
    ctx.fillStyle = "#3a3f52";
    for (let i = 0; i < 6; i++) ctx.fillRect(-19 + i * 6.6, 6, 3.4, 4);
    // A hat, so the ten opponents are not one silhouette in ten colours.
    ctx.fillStyle = "#e6eaf5";
    if (hat === "helm") { ctx.beginPath(); ctx.arc(0, -14, 7, Math.PI, 0); ctx.fill(); ctx.fillRect(-8, -15, 16, 2.5); }
    else if (hat === "horn") {
      ctx.beginPath(); ctx.arc(0, -14, 6, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = "#e6eaf5"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-6, -16); ctx.quadraticCurveTo(-12, -22, -6, -24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, -16); ctx.quadraticCurveTo(12, -22, 6, -24); ctx.stroke();
    } else if (hat === "scope") {
      ctx.fillRect(-2, -22, 4, 8);
      ctx.fillStyle = "#ff5470";
      ctx.beginPath(); ctx.arc(0, -24, 3, 0, 7); ctx.fill();
    } else if (hat === "crown") {
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.moveTo(-9, -14); ctx.lineTo(-9, -22); ctx.lineTo(-4.5, -18); ctx.lineTo(0, -24);
      ctx.lineTo(4.5, -18); ctx.lineTo(9, -22); ctx.lineTo(9, -14);
      ctx.closePath(); ctx.fill();
    } else { ctx.fillRect(-7, -15, 14, 3); ctx.beginPath(); ctx.arc(0, -14, 6, Math.PI, 0); ctx.fill(); }
    ctx.restore();
  }

  _drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.strokeStyle = p.owner === "you" ? "rgba(124,240,208,0.6)" : "rgba(255,159,67,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      p.trail.forEach((t, i) => i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y));
      ctx.stroke();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = "#e6eaf5";
      ctx.beginPath();
      ctx.moveTo(7, 0); ctx.lineTo(-5, -3.5); ctx.lineTo(-5, 3.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.shell.id === "napalm" ? "#ff6b28" : "#ff9f43";
      ctx.fillRect(-6, -2, 3, 4);
      ctx.restore();
    }
  }

  _drawBlasts(ctx) {
    for (const b of this.blasts) {
      if (b.t < 0) continue;
      const p = b.t / 0.55;
      const r = b.r * (0.4 + p * 1.5);
      ctx.globalAlpha = Math.max(0, 1 - p);
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, b.color);
      g.addColorStop(1, hexA(b.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawSmoke(ctx) {
    for (const s of this.smoke) {
      ctx.globalAlpha = Math.max(0, 1 - s.t / s.life) * 0.6;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 + s.t), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Aiming: a dashed pull-back line plus the first stretch of the arc, wind
   * included, so the wind arrow is something you can act on rather than a
   * decoration.
   */
  _drawAim(ctx, W, H) {
    const a = this.aim;
    const dx = a.x - a.sx, dy = a.y - a.sy;
    const len = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(-dy, -dx);
    const power = clamp((len / (W * 0.28)) * MAX_POWER, 12, MAX_POWER);
    const shell = this._unlockedShells()[this.shellIdx] || SHELLS[0];
    const m = this._muzzle({ ...this.you, angle });
    const speed = power * 5.4 * (shell.lob ? 1 / shell.lob : 1);
    let x = m.x, y = m.y;
    let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed * (shell.lob || 1);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    for (let k = 0; k < 120; k++) {
      vy += GRAV * (shell.drag || 1) / 60;
      vx += this.wind / 60;
      x += vx / 60; y += vy / 60;
      if (k % 7 === 0) {
        ctx.globalAlpha = 0.75 * (1 - k / 120);
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
      }
      if (y / H >= this._hAt(x / W)) break;
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,215,106,0.75)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd76a";
    ctx.font = "800 15px 'Sora', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(power)}%  ${Math.round(-angle * 180 / Math.PI)}°`, a.sx, a.sy - 18);
  }

  _drawWind(ctx, W) {
    const cx = W / 2, y = 22;
    const mag = Math.abs(this.wind) / 40;
    ctx.save();
    ctx.fillStyle = "rgba(8,14,26,0.4)";
    roundRect(ctx, cx - 74, y - 13, 148, 26, 13); ctx.fill();
    ctx.strokeStyle = this.wind >= 0 ? "#22d3ee" : "#ff9f43";
    ctx.lineWidth = 3; ctx.lineCap = "round";
    const dir = Math.sign(this.wind) || 1;
    const L = 20 + mag * 34;
    ctx.beginPath();
    ctx.moveTo(cx - (L / 2) * dir, y); ctx.lineTo(cx + (L / 2) * dir, y);
    ctx.moveTo(cx + (L / 2) * dir, y);
    ctx.lineTo(cx + (L / 2 - 8) * dir, y - 6);
    ctx.moveTo(cx + (L / 2) * dir, y);
    ctx.lineTo(cx + (L / 2 - 8) * dir, y + 6);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "700 9px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WIND", cx, y + 20);
    ctx.restore();
  }

  _drawBars(ctx, W, H) {
    const bar = (x, tank, name, color, align) => {
      const bw = Math.min(150, W * 0.32), bh = 11;
      const bx = align === "left" ? x : x - bw;
      ctx.fillStyle = "rgba(8,14,26,0.6)";
      roundRect(ctx, bx, 46, bw, bh, 5); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, bx + 1, 47, Math.max(0, (bw - 2) * (tank.hp / tank.maxHp)), bh - 2, 4); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "700 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = align;
      ctx.fillText(`${name} ${tank.hp}`, align === "left" ? bx : bx + bw, 42);
    };
    bar(12, this.you, "You", "#2ee6a6", "left");
    bar(W - 12, this.them, this.foe.name, this.foe.color, "right");
  }

  _drawShellBar(ctx, W, H) {
    for (const b of this._shellBarLayout()) {
      const n = this.ammo[b.s.id];
      const usable = n > 0;
      ctx.globalAlpha = usable ? 1 : 0.32;
      ctx.fillStyle = b.i === this.shellIdx ? "rgba(124,92,255,0.85)" : "rgba(20,26,44,0.8)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.fill();
      ctx.strokeStyle = b.i === this.shellIdx ? "#ffffff" : "rgba(255,255,255,0.18)";
      ctx.lineWidth = b.i === this.shellIdx ? 2 : 1;
      roundRect(ctx, b.x, b.y, b.w, b.h, 8); ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 9px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.s.name.toUpperCase().slice(0, 9), b.x + b.w / 2, b.y + 13);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.fillText(n === Infinity ? "∞" : `×${n}`, b.x + b.w / 2, b.y + 24);
      ctx.globalAlpha = 1;
    }
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 18px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, H * 0.2);
    ctx.globalAlpha = 1;
    if (this.turn === "you" && !this.projectiles.length) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "700 11px 'Inter', system-ui, sans-serif";
      ctx.fillText("Drag back from your gun and release", W / 2, H * 0.2 + 20);
    }
  }
}

function accuracyWord(aim) {
  return aim > 11 ? "sprays wide" : aim > 8 ? "loose" : aim > 5.5 ? "steady" : aim > 3.5 ? "sharp" : aim > 2 ? "deadly" : "never misses";
}

function shadeHex(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + 255 * amt), 0, 255);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}

function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default CannonCoastGame;
