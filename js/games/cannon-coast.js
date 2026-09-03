// ==========================================================================
// Cannon Coast — an artillery duel across a coastline that keeps changing.
//
// Two guns, a coast between them, and a wind you have to read. You set an
// angle and a power, the shell arcs, and whatever it lands on stops being
// there — the terrain is a heightmap that craters, so a duel that starts
// across a ridge often ends across a crater you dug yourself.
//
// The game is the ranging loop. A shot that misses tells you how far it
// missed by and in which direction; the wind drifts rather than being
// redrawn, so that correction is still worth something on the next shot.
// Take those two things away and artillery is a guessing game — which is
// exactly what this was, with a trajectory preview that drew the true
// landing point and a wind that was re-rolled from scratch every turn.
//
// Ten opponents on a ladder. Beating one unlocks the next shell, and the
// late ones range in on you the same way you range in on them.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randInt, randFloat, seededRng } from "../core/utils.js";

const GRAV = 320;
const COLS = 260;             // terrain sample columns
const MAX_POWER = 100;
// The coast is this many metres wide. Everything the player is told about
// distance — "18 m short", the wind speed — is derived from this one number,
// so the readouts stay consistent with each other at any canvas size.
const FIELD_M = 420;
// Where the water sits, as a fraction of canvas height. Larger values are
// lower on screen. The land used to be generated well above this, so the sea,
// the far headland and the sun glitter were all drawn behind a hill that
// filled the frame — a coast with no coast in it.
const SEA_Y = 0.80;

// --- Shells ---------------------------------------------------------------
// Unlocked one per ladder win. `n` is how many the shell gives you per duel;
// the plain shell is unlimited so you are never stuck without ammunition.
const SHELLS = [
  { id: "shell",   name: "Shell",         short: "SHELL",  n: Infinity, dmg: 30, radius: 26, text: "Standard round. Never runs out." },
  { id: "heavy",   name: "Heavy Shell",   short: "HEAVY",  n: 3, dmg: 52, radius: 34, text: "Slower, heavier, digs a wider crater.", drag: 1.25 },
  { id: "cluster", name: "Cluster",       short: "CLUSTER",n: 2, dmg: 22, radius: 20, text: "Splits into five bomblets at the top of its arc.", cluster: 5 },
  { id: "mortar",  name: "Mortar",        short: "MORTAR", n: 3, dmg: 34, radius: 24, text: "Falls almost vertically. Ignores a ridge.", lob: 1.9 },
  { id: "driller", name: "Driller",       short: "DRILLER",n: 2, dmg: 40, radius: 16, text: "Burrows through terrain before it goes off.", drill: 26 },
  { id: "napalm",  name: "Napalm",        short: "NAPALM", n: 2, dmg: 16, radius: 18, text: "Twelve burning splashes across the slope.", splash: 12 },
  { id: "buster",  name: "Bunker Buster", short: "BUSTER", n: 1, dmg: 74, radius: 44, text: "One shot. Removes most of a hill." },
  { id: "mirv",    name: "MIRV",          short: "MIRV",   n: 1, dmg: 30, radius: 24, text: "Three warheads, spread wide, at the apex.", cluster: 3, spread: 90 },
];

// --- Opponents ------------------------------------------------------------
// `aim` is the error cone on a fresh shot, in degrees. `correct` is how much
// of an observed miss the gunner takes out on the next shot — this is what
// actually makes the late ones frightening: they walk their fire onto you.
// `kit` is the special ammunition they bring, so a duel high on the ladder
// is not just the same shell fired more accurately.
const FOES = [
  { name: "Rusty Pete",     hp: 100, aim: 14,  wind: 0.10, correct: 0.15, color: "#8a7a5c", hat: "cap",   kit: [] },
  { name: "Deckhand Mo",    hp: 110, aim: 11,  wind: 0.25, correct: 0.28, color: "#6f9c5c", hat: "cap",   kit: ["heavy"] },
  { name: "Gunner Wren",    hp: 120, aim: 9,   wind: 0.40, correct: 0.40, color: "#5fa8d8", hat: "helm",  kit: ["heavy", "cluster"] },
  { name: "Bosun Vale",     hp: 130, aim: 7.5, wind: 0.50, correct: 0.50, color: "#c98f4a", hat: "helm",  kit: ["mortar", "cluster"] },
  { name: "Quartermaster",  hp: 140, aim: 6,   wind: 0.62, correct: 0.58, color: "#a86bff", hat: "horn",  kit: ["mortar", "heavy", "driller"] },
  { name: "The Cartwright", hp: 150, aim: 5,   wind: 0.72, correct: 0.65, color: "#e8574a", hat: "horn",  kit: ["napalm", "heavy", "mortar"] },
  { name: "Ironsight Bel",  hp: 165, aim: 4,   wind: 0.80, correct: 0.72, color: "#7c8494", hat: "scope", kit: ["driller", "cluster", "heavy"] },
  { name: "Admiral Crane",  hp: 180, aim: 3,   wind: 0.88, correct: 0.78, color: "#ffd76a", hat: "scope", kit: ["buster", "mortar", "napalm"] },
  { name: "The Widowmaker", hp: 200, aim: 2.2, wind: 0.94, correct: 0.85, color: "#ff4fd8", hat: "crown", kit: ["mirv", "napalm", "heavy"] },
  { name: "Coastmaster",    hp: 230, aim: 1.6, wind: 1.00, correct: 0.90, color: "#22d3ee", hat: "crown", kit: ["buster", "mirv", "mortar", "driller"] },
];

// Terrain palettes, one per ladder rung, so the coast changes as you climb.
const COASTS = [
  { name: "Green Shore",  sky: ["#6fa8d8", "#c9e0f0"], far: "#7d9fb8", land: "#6d9455", deep: "#3f5c34", rock: "#5c6650", sand: "#e0cf9a", sea: "#3f7fa8", sun: "#fff3d0" },
  { name: "Dune Reach",   sky: ["#e8a05c", "#ffd9a8"], far: "#c9945f", land: "#b08a4a", deep: "#6d5228", rock: "#8a6f3c", sand: "#f0dcae", sea: "#4a7f9c", sun: "#fff0c0" },
  { name: "Grey Cliffs",  sky: ["#4a5c8a", "#8fa8c9"], far: "#5f6f8a", land: "#5c6b7a", deep: "#343c4a", rock: "#4a5462", sand: "#b8bcc9", sea: "#2a4f6b", sun: "#e8eef8" },
  { name: "Night Sound",  sky: ["#2a3a5c", "#6b7fa8"], far: "#3c4a6b", land: "#4a5c6b", deep: "#2a343f", rock: "#3a4552", sand: "#8fa0ae", sea: "#1d3a52", sun: "#cfe0ff" },
  { name: "Rose Bay",     sky: ["#5c2a44", "#c96b8a"], far: "#83415c", land: "#7a4a5c", deep: "#4a2434", rock: "#5f3646", sand: "#d8a8b8", sea: "#4a2a4a", sun: "#ffd9e4" },
];

// --- Terrain shapes -------------------------------------------------------
// Six coastlines rather than one. Each returns a normalised height per
// column (larger = lower on screen); the caller clamps and adds the sea
// shelf at the edges. Every shape has to leave the two gun positions on
// something solid, which _genTerrain checks before accepting it.
// Each shape carries the sea level it is built around. `base` is the height
// of the flat ground it starts from: below SEA_Y it is dry land, above it the
// shape is a submerged shelf that only the peaks break through — which is how
// the islet chain and the flooded bay get any water in them at all.
const SHAPES = [
  {
    id: "ridge",
    text: "One ridge between you",
    base: 0.735,
    build: (t, rng, p) => -p.h1 * Math.exp(-(((t - 0.5) / p.w1) ** 2) * 2.2),
  },
  {
    id: "twin",
    text: "Twin headlands over a channel",
    base: 0.775,
    build: (t, rng, p) =>
      -p.h1 * Math.exp(-(((t - 0.30) / p.w1) ** 2) * 3.4)
      - p.h2 * Math.exp(-(((t - 0.70) / p.w2) ** 2) * 3.4)
      // A channel of open water down the middle, which a flat shot has to
      // clear rather than skip across.
      + 0.09 * Math.exp(-(((t - 0.5) / 0.1) ** 2) * 2),
  },
  {
    // A flat-topped plateau: a low shot is stopped dead, a high one clears it
    // and then has a long flat surface to skid a crater across.
    id: "mesa",
    text: "A plateau in the middle",
    base: 0.745,
    build: (t, rng, p) => {
      const d = Math.abs(t - 0.5) / (p.w1 * 1.6);
      return -p.h1 * (1 / (1 + Math.pow(d, 8)));
    },
  },
  {
    id: "islands",
    text: "A chain of islets",
    base: 0.9,
    build: (t, rng, p) => {
      let h = 0;
      for (let k = 0; k < 5; k++) {
        const cx = 0.12 + k * 0.19;
        h -= (0.14 + p.h1 * (0.55 + ((k * 37) % 11) / 20)) * Math.exp(-(((t - cx) / (p.w1 * 0.5)) ** 2) * 5);
      }
      return h;
    },
  },
  {
    // Asymmetric: one gun sits high on a headland, the other low on the sand.
    id: "cliff",
    text: "A cliff on one side",
    base: 0.775,
    build: (t, rng, p) => -p.h1 * (1 / (1 + Math.exp(-(t - 0.42) * 14))) * 1.3,
  },
  {
    id: "bowl",
    text: "A flooded bay between two spurs",
    base: 0.755,
    build: (t, rng, p) =>
      -p.h1 * Math.exp(-(((t - 0.16) / p.w1) ** 2) * 3.4)
      - p.h2 * Math.exp(-(((t - 0.84) / p.w2) ** 2) * 3.4)
      // The bay itself, pushed below the water line.
      + 0.13 * Math.exp(-(((t - 0.5) / 0.2) ** 2) * 1.6),
  },
];

export class CannonCoastGame extends GameBase {
  /**
   * Two ways to play. Cadet draws the whole predicted arc, which is how this
   * game used to work all the time — and with the true landing point on
   * screen there was nothing left to solve. Gunner shows only the first
   * fraction of a second out of the barrel and hands you the ranging tools
   * instead: where the last shell landed, by how much, and a wind that is
   * still roughly the wind you just fired into.
   */
  getDifficulties() { return ["Gunner", "Cadet"]; }
  getInstructions() {
    return [
      "Drag back from your gun to aim — the angle sets the barrel, the length sets the power — or use the steppers under the coast. Release, or press Fire, to shoot.",
      "You will miss the first one. That is the game: the marker shows where the shell landed and how far short or long it was, so the second shot is a correction rather than another guess.",
      "The wind drifts instead of being redrawn, so a correction is still worth something next turn. It is shown in metres per second, and a gust is announced before it lands.",
      "Arrow keys nudge the barrel by a degree and the charge by one, Shift for a tenth of that. Space fires. R repeats your last shot exactly.",
      "The ground is destructible, and it does not grow back. Undermine a gun and it falls — which hurts it, and changes every shot after that.",
      "Beat an opponent to unlock the next shell. Later opponents bring their own, and they walk their fire onto you the same way you do to them.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag to aim, or use the ◀ ▶ steppers. Tap FIRE to shoot, tap a shell to switch."; }
  getKeyboardHint() { return "Drag to aim; arrows nudge, Shift for fine, Space fires, R repeats the last shot, 1-8 picks a shell."; }
  getScene() { return "sunset"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.coast) custom.coast = { rung: 0, wins: 0, bestRung: 0, bestShots: {} };
    if (!custom.coast.bestShots) custom.coast.bestShots = {};
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

  /**
   * The ladder is a campaign: each rung unlocks the next. Describing it here
   * gets a "next opponent" button on the win screen and the ladder into the
   * HUD; the picker itself stays bespoke, since an opponent card carries a
   * name, hit points and an accuracy word that a numbered tile cannot.
   */
  getLevelNav() {
    const c = this._store();
    return {
      index: this.rung || 0,
      count: FOES.length,
      label: "Rung",
      title: "The Ladder",
      unlocked: (i) => i <= c.bestRung,
      cleared: (i) => i < c.bestRung,
      goTo: (i) => { this.rung = i; this.start(); },
    };
  }
  openLevelSelect() { this.openLadder(); }

  onPlayPressed() { this.openLadder(); }

  openLadder() {
    audioManager.play("click");
    const c = this._store();
    const grid = el("div", { class: "foe-grid" });
    FOES.forEach((f, i) => {
      const open = i <= c.bestRung;
      const best = c.bestShots[i];
      grid.appendChild(el("button", {
        class: `foe-card${open ? "" : " locked"}${i < c.bestRung ? " beaten" : ""}`,
        disabled: !open,
        style: `--fc:${f.color}`,
        onClick: () => { closeModal(); this.rung = i; this.start(); },
      }, [
        el("span", { class: "sw" }),
        el("span", { class: "n" }, `${i + 1}`),
        el("span", { class: "nm" }, open ? f.name : "Locked"),
        el("span", { class: "st" }, open
          ? `${f.hp} hp · ${accuracyWord(f.aim)}${best ? ` · best ${best} shots` : ""}`
          : `Beat ${FOES[i - 1].name}`),
      ]));
    });
    openModal({
      title: "The Ladder",
      bodyNode: el("div", { class: "foe-picker" }, [
        el("p", { class: "zone-intro" }, "Each win unlocks the next shell. Rematches are always allowed — the coast is different every time, and so is the weather."),
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
    this.input.onKey("Space", () => this._fireFromControls());
    this.input.onKey("Enter", () => this._fireFromControls());
    this.input.onKey("KeyR", () => this._repeatLast());
    this.rung = 0;
    this.difficulty = "Gunner";
    this._held = null;
  }

  onResize() { this._terrainDirty = true; }

  onStart() {
    const foe = FOES[this.rung];
    this.foe = foe;
    this.coast = COASTS[this.rung % COASTS.length];
    this._genTerrain();

    // Your gun is refitted as you climb. The opponents' hit points more than
    // double up the ladder while yours stayed at 130, which left the last two
    // rungs a race you lost by arithmetic rather than by aim.
    const hull = 130 + this.rung * 7;
    this.you = { x: this.spawn.you, hp: hull, maxHp: hull, angle: -0.72, power: 62, recoil: 0, fall: 0 };
    this.them = { x: this.spawn.them, hp: foe.hp, maxHp: foe.hp, angle: -2.42, power: 62, recoil: 0, fall: 0 };
    this._place(this.you);
    this._place(this.them);

    this.ammo = {};
    for (const s of this._unlockedShells()) this.ammo[s.id] = s.n;
    // The opponent's own magazine, so it can bring something other than the
    // plain shell without drawing on yours.
    this.foeAmmo = {};
    for (const id of foe.kit) this.foeAmmo[id] = SHELLS.find(s => s.id === id)?.n ?? 1;

    this.shellIdx = 0;
    this.turn = "you";
    this.shots = 0;
    this.hits = 0;
    this.projectiles = [];
    this.blasts = [];
    this.smoke = [];
    this.debris = [];
    this.scorch = [];
    this.gulls = Array.from({ length: 3 }, (_, i) => ({
      x: randFloat(0, 1), y: 0.14 + i * 0.05, v: randFloat(0.02, 0.05) * (randInt(0, 1) ? 1 : -1), p: randFloat(0, 6.3),
    }));
    this.aim = null;
    this.lastShot = null;      // your last angle/power/shell, for R
    this.lastImpact = null;    // where your last shell landed, and by how much
    this.ghost = null;         // the previous trajectory, drawn faintly
    this.aiMemory = null;      // the opponent's ranging memory

    // Wind drifts around a target rather than being redrawn, which is the
    // whole reason a correction survives to the next turn.
    this.windCap = 22 + this.rung * 2.4;
    this.wind = randFloat(-this.windCap * 0.6, this.windCap * 0.6);
    this.windTarget = this.wind;
    this.gustIn = randInt(3, 6);

    this.msg = "Your shot — fire one to find the range";
    this.msgT = 3;
    this.elapsed = 0;
    this.aiTimer = 0;
    this.setScore(0);
    this._updateHud();
  }

  // ----------------------------------------------------------- TERRAIN ---
  /**
   * A coastline. The shape comes from the table above; the rung picks it, so
   * climbing the ladder walks you through ridges, plateaus, islets and
   * cliffs rather than the same two bumps in five colour schemes.
   *
   * A layout is only accepted if both guns end up on ground that is neither
   * under water nor on a slope so steep the barrel points into it, which is
   * what the retry loop is for.
   */
  _genTerrain() {
    const shape = SHAPES[this.rung % SHAPES.length];
    this.shape = shape;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rng = seededRng(`coast-${this.rung}-${attempt}-${Math.floor(Date.now() / 1000)}`);
      const p = {
        h1: 0.16 + rng() * 0.2,
        h2: 0.13 + rng() * 0.18,
        w1: 0.1 + rng() * 0.08,
        w2: 0.1 + rng() * 0.08,
      };
      const base = shape.base + (rng() - 0.5) * 0.03;
      const phase = rng() * 6.3;
      const h = new Float32Array(COLS);
      for (let i = 0; i < COLS; i++) {
        const t = i / (COLS - 1);
        let v = base
          + Math.sin(t * 7.3 + phase) * 0.013
          + Math.sin(t * 19.7 + phase * 2) * 0.006
          + shape.build(t, rng, p);
        // The outer edges fall away below the sea line, so the coast runs off
        // into open water at both ends of the frame rather than being cut off
        // by it.
        const edge = Math.min(t, 1 - t);
        if (edge < 0.04) v += (0.04 - edge) * 9;
        h[i] = clamp(v, 0.2, 1.04);
      }
      this.height = h;

      // Gun positions are found, not assumed. An islet chain and a cliff put
      // their dry ground in completely different places, and the old fixed
      // "you at 0.11, them at 0.89" only ever worked for a symmetric ridge.
      const stand = (lo, hi) => {
        let best = null;
        for (let t = lo; t <= hi; t += 0.004) {
          const hh = this._hAt(t);
          if (hh > SEA_Y - 0.025) continue;                        // in the water
          const slope = Math.abs(this._hAt(t + 0.022) - this._hAt(t - 0.022));
          if (slope > 0.055) continue;                             // too steep to stand
          // Flat first, then high: a gun wants a platform, not a summit.
          const score = slope * 3 + hh;
          if (!best || score < best.score) best = { t, score };
        }
        return best;
      };
      const L = stand(0.05, 0.36), R = stand(0.64, 0.95);
      if (!L || !R) continue;
      // They also have to be far enough apart to be a duel rather than a brawl.
      if (R.t - L.t < 0.45) continue;
      this.spawn = { you: L.t, them: R.t };
      this._terrainDirty = true;
      return;
    }
    // Fallback: a plain beach with one bump. Never pretty, always playable.
    this.height = new Float32Array(COLS);
    for (let i = 0; i < COLS; i++) {
      const t = i / (COLS - 1);
      const edge = Math.min(t, 1 - t);
      this.height[i] = 0.74 - 0.14 * Math.exp(-(((t - 0.5) / 0.14) ** 2) * 2.2)
        + (edge < 0.04 ? (0.04 - edge) * 9 : 0);
    }
    this.spawn = { you: 0.12, them: 0.88 };
    this._terrainDirty = true;
  }

  _hAt(nx) {
    const t = clamp(nx, 0, 1) * (COLS - 1);
    const i = Math.floor(t), f = t - i;
    const a = this.height[i], b = this.height[Math.min(COLS - 1, i + 1)];
    return a + (b - a) * f;
  }

  /**
   * Sits a gun on the ground. If the ground has dropped out from under it
   * the gun falls, and a fall hurts — undermining an opponent is a real line
   * of attack rather than a cosmetic change to where they are drawn.
   */
  _place(tank, allowFall = false) {
    const ground = this._hAt(tank.x);
    const drop = ground - (tank.y ?? ground);
    tank.y = ground;
    if (!allowFall || drop <= 0.02) return;
    const dmg = Math.round(drop * 190);
    if (dmg <= 0) return;
    tank.hp = Math.max(0, tank.hp - dmg);
    tank.fall = 1;
    this._say(tank === this.you ? `Ground gave way — ${dmg}` : `Undermined for ${dmg}`, "#ffd76a");
    if (tank === this.them) this.addScore(dmg * (this.rung + 1));
    const W = this.viewW, H = this.viewH;
    for (let k = 0; k < 10; k++) {
      this.debris.push({
        x: tank.x * W + randFloat(-14, 14), y: tank.y * H,
        vx: randFloat(-60, 60), vy: randFloat(-120, -30),
        r: randFloat(1.5, 3.5), t: 0, life: randFloat(0.4, 0.9), color: this.coast.sand,
      });
    }
  }

  // ------------------------------------------------------------- INPUT ---
  _pickShell(i) {
    const list = this._unlockedShells();
    if (i >= list.length) return;
    const s = list[i];
    if (this.ammo[s.id] <= 0) { audioManager.play("error"); this._say("None left", "#ff5470"); return; }
    this.shellIdx = i;
    audioManager.play("select");
    this._updateHud();
  }

  _myTurn() { return this.state === "playing" && this.turn === "you" && !this.projectiles.length; }

  /**
   * One scale factor for every piece of on-canvas furniture. A 16:9 game on
   * an upright phone is a 359x201 strip, and text and gauges sized for a
   * desktop canvas covered the playfield there.
   */
  _s() { return clamp(Math.min(this.viewW, this.viewH) / 420, 0.6, 1); }

  /** Layout is derived from the stage so it survives a phone-sized canvas. */
  _bars() {
    const H = this.viewH;
    const bh = clamp(H * 0.088, 24, 34);
    const shellY = H - bh - 5;
    const ctrlY = shellY - bh - 5;
    return { bh, shellY, ctrlY };
  }

  /**
   * The ammunition row. Eight shells across a 359px canvas leaves 39px each,
   * which is not enough for a name — the labels ran into each other and off
   * the ends. Below a threshold the row drops to the digit and the count, and
   * the selected shell's name is read off the HUD instead.
   */
  _shellBarLayout() {
    const W = this.viewW;
    const { bh, shellY } = this._bars();
    const list = this._unlockedShells();
    const gap = 4;
    const w = Math.min(80, (W - 12 - (list.length - 1) * gap) / list.length);
    const total = list.length * w + (list.length - 1) * gap;
    const x0 = (W - total) / 2;
    const named = w >= 52;
    return list.map((sh, i) => ({ i, s: sh, x: x0 + i * (w + gap), y: shellY, w, h: bh, named }));
  }

  /**
   * The stepper row: nudges for angle and power either side of a Fire button.
   * Dragging is faster but imprecise, and an artillery game lives or dies on
   * the last degree — on a phone, where there is no arrow key, this row is
   * the only way to place that degree.
   *
   * Sized by solving for the button width that fits rather than by hoping:
   * the first attempt overflowed the right-hand edge of a phone canvas and
   * cut the power group in half. Where even the minimum will not fit, the
   * coarse steps are dropped before anything is allowed off screen.
   */
  _ctrlLayout() {
    const W = this.viewW;
    const { bh, ctrlY } = this._bars();
    const gap = 6;
    const avail = W - 10;
    const fireW = clamp(W * 0.16, 52, 84);
    const readW = clamp(W * 0.075, 34, 54);

    // Try four steps per group, then two, then give up on the coarse ones.
    let deltas = [[-5, "◀◀"], [-1, "◀"], [1, "▶"], [5, "▶▶"]];
    let stepW = (avail - fireW - 2 * readW - 2 * gap) / (deltas.length * 2);
    if (stepW < 18) {
      deltas = [[-1, "◀"], [1, "▶"]];
      stepW = (avail - fireW - 2 * readW - 2 * gap) / (deltas.length * 2);
    }
    stepW = clamp(stepW, 14, 34);

    const half = deltas.length / 2;
    const groupW = stepW * deltas.length + readW;
    const total = groupW * 2 + fireW + gap * 2;
    const x0 = Math.max(5, (W - total) / 2);

    const out = [];
    const group = (gx, kind) => {
      deltas.forEach(([d, label], k) => {
        // The readout sits in the middle of its group, with the decreasing
        // steps to its left and the increasing ones to its right.
        const bx = k < half ? gx + k * stepW : gx + readW + k * stepW;
        out.push({ kind, delta: d, label, x: bx, y: ctrlY, w: stepW, h: bh });
      });
      out.push({ kind: `${kind}-readout`, x: gx + stepW * half, y: ctrlY, w: readW, h: bh });
    };
    group(x0, "angle");
    out.push({ kind: "fire", x: x0 + groupW + gap, y: ctrlY, w: fireW, h: bh });
    group(x0 + groupW + fireW + gap * 2, "power");
    return out;
  }

  _nudge(kind, delta) {
    if (!this._myTurn()) return;
    if (kind === "angle") {
      // Screen-space angles run clockwise, so a positive nudge should raise
      // the barrel for both guns rather than for whichever way one faces.
      this.you.angle = clamp(this.you.angle - (delta * Math.PI) / 180, -Math.PI + 0.05, -0.05);
    } else {
      this.you.power = clamp(this.you.power + delta, 8, MAX_POWER);
    }
    audioManager.play("tick");
  }

  _fireFromControls() {
    if (!this._myTurn()) return;
    this._fire(this.you, 1);
  }

  _repeatLast() {
    if (!this._myTurn() || !this.lastShot) return;
    this.you.angle = this.lastShot.angle;
    this.you.power = this.lastShot.power;
    const idx = this._unlockedShells().findIndex(s => s.id === this.lastShot.shellId);
    if (idx >= 0 && this.ammo[this.lastShot.shellId] > 0) this.shellIdx = idx;
    this._say("Same again", "#22d3ee");
    this._fire(this.you, 1);
  }

  _down(x, y) {
    if (this.state !== "playing") return;
    for (const b of this._shellBarLayout()) {
      if (hit(b, x, y)) { this._pickShell(b.i); return; }
    }
    for (const c of this._ctrlLayout()) {
      if (!hit(c, x, y)) continue;
      if (c.kind === "fire") { this._fireFromControls(); return; }
      if (c.kind === "angle" || c.kind === "power") {
        this._nudge(c.kind, c.delta);
        // Held down, it repeats — otherwise crossing twenty degrees is
        // twenty taps.
        this._held = { kind: c.kind, delta: c.delta, t: -0.4 };
        return;
      }
      return;
    }
    if (!this._myTurn()) return;
    this.aim = { x, y, sx: x, sy: y };
  }

  _move(x, y) { if (this.aim) { this.aim.x = x; this.aim.y = y; } }

  _up() {
    this._held = null;
    if (!this.aim) return;
    const a = this.aim;
    this.aim = null;
    const dx = a.x - a.sx, dy = a.y - a.sy;
    const len = Math.hypot(dx, dy);
    // A short drag adjusts nothing and fires nothing: it is a misclick.
    if (len < 14) return;
    // Drag away from the target: the barrel points opposite the drag, like
    // pulling a sling back, which is the idiom every artillery game uses.
    this.you.angle = clamp(Math.atan2(-dy, -dx), -Math.PI + 0.05, -0.05);
    this.you.power = clamp((len / (this.viewW * 0.28)) * MAX_POWER, 8, MAX_POWER);
    this._fire(this.you, 1);
  }

  // ------------------------------------------------------------- COMBAT --
  _fire(tank, dir, forcedShell) {
    const shell = forcedShell || (dir > 0 ? this._unlockedShells()[this.shellIdx] : SHELLS[0]);
    const mag = dir > 0 ? this.ammo : this.foeAmmo;
    if (mag[shell.id] !== undefined && mag[shell.id] <= 0) return;
    if (mag[shell.id] !== undefined && mag[shell.id] !== Infinity) mag[shell.id]--;

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
    if (dir > 0) {
      this.lastShot = { angle: tank.angle, power: tank.power, shellId: shell.id };
      this.shots++;
    } else {
      // The shell is part of the record: a mortar and a plain shell fly
      // completely differently on the same charge, so a correction is only
      // meaningful against the round it was measured with.
      this.aiShot = { angle: tank.angle, power: tank.power, shellId: shell.id };
    }
    tank.recoil = 1;
    // Muzzle smoke, so a shot reads as a shot rather than a dot appearing.
    for (let k = 0; k < 7; k++) {
      this.smoke.push({
        x: muzzle.x, y: muzzle.y,
        vx: Math.cos(tank.angle) * randFloat(30, 90) + randFloat(-20, 20),
        vy: Math.sin(tank.angle) * randFloat(30, 90) + randFloat(-30, 10),
        r: randFloat(3, 7), t: 0, life: randFloat(0.3, 0.7), color: "#d8dae4",
      });
    }
    this.flash = { x: muzzle.x, y: muzzle.y, t: 0, a: tank.angle };
    audioManager.play("shoot");
    this.shake();
    this._updateHud();
  }

  _muzzle(tank) {
    const W = this.viewW, H = this.viewH;
    const len = Math.max(22, Math.min(W, H) * 0.048);
    const x = tank.x * W, y = tank.y * H;
    return { x: x + Math.cos(tank.angle) * len, y: y - 12 + Math.sin(tank.angle) * len };
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.flash) { this.flash.t += dt; if (this.flash.t > 0.12) this.flash = null; }
    for (const t of [this.you, this.them]) {
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 4);
      if (t.fall > 0) t.fall = Math.max(0, t.fall - dt * 2);
    }

    // Held stepper: repeats after a short delay, then accelerates a little.
    if (this._held) {
      this._held.t += dt;
      while (this._held.t > 0.08) { this._held.t -= 0.08; this._nudge(this._held.kind, this._held.delta); }
    }

    // The wind only moves between shots. Changing it mid-flight would make
    // the shot you aimed and the shot that flew two different shots.
    if (!this.projectiles.length) {
      this.wind += (this.windTarget - this.wind) * Math.min(1, dt * 2.4);
    }

    this._stepProjectiles(dt);
    this._stepEffects(dt);
    for (const g of this.gulls) { g.x += g.v * dt; if (g.x > 1.1) g.x = -0.1; if (g.x < -0.1) g.x = 1.1; }

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
      if (p.trail.length > 90) p.trail.shift();

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

      if (p.x < -240 || p.x > W + 240 || p.y > H + 400) {
        this.projectiles.splice(i, 1);
        this._recordImpact(p, p.x, this._hAt(p.x / W) * H, "off");
        this._afterShot();
        continue;
      }

      // Direct hit on a gun.
      let struck = false;
      for (const tank of [this.you, this.them]) {
        const tx = tank.x * W, ty = tank.y * H;
        if (Math.hypot(p.x - tx, p.y - ty) < 20) {
          this._detonate(p, p.x, p.y, true);
          this.projectiles.splice(i, 1);
          this._recordImpact(p, p.x, p.y, "hit");
          this._afterShot();
          struck = true;
          break;
        }
      }
      if (struck) continue;

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
        this._recordImpact(p, p.x, p.y, "ground");
        this._afterShot();
      }
    }
  }

  /**
   * The ranging readout. Where the shell landed relative to the gun it was
   * aimed at, in metres, short or long — the single piece of information
   * that turns a second shot into a correction.
   */
  _recordImpact(p, x, y, how) {
    const W = this.viewW;
    const mPerPx = FIELD_M / W;
    const target = p.owner === "you" ? this.them : this.you;
    const tx = target.x * W;
    const dx = x - tx;
    // "Short" means it fell between the guns; which side that is depends on
    // which gun fired.
    const towards = p.owner === "you" ? 1 : -1;
    const along = dx * towards;
    const rec = {
      x, y, owner: p.owner, how,
      metres: Math.abs(Math.round(along * mPerPx)),
      dir: how === "hit" ? "hit" : along < 0 ? "short" : "long",
      t: 0,
    };
    if (p.owner === "you") {
      this.lastImpact = rec;
      this.ghost = p.trail.slice();
    } else {
      this.aiMemory = {
        angle: this.aiShot?.angle, power: this.aiShot?.power,
        shellId: this.aiShot?.shellId, alongPx: along,
      };
    }
  }

  _detonate(p, x, y, direct) {
    const W = this.viewW, H = this.viewH;
    const shell = p.shell;
    this.blasts.push({ x, y, t: 0, r: shell.radius * (direct ? 1.2 : 1), color: shell.id === "napalm" ? "#ff9f43" : "#ffd76a" });
    audioManager.play("explosion");
    this.shake();
    this._crater(x / W, y / H, (shell.radius / W) * 1.9);
    // Scorch stays on the ground: the coast should look fought over by the
    // end of a duel, not freshly drawn.
    this.scorch.push({ nx: x / W, r: shell.radius / W, a: shell.id === "napalm" ? 0.5 : 0.32 });
    if (this.scorch.length > 40) this.scorch.shift();

    // Thrown earth.
    for (let k = 0; k < 14; k++) {
      this.debris.push({
        x, y, vx: randFloat(-190, 190), vy: randFloat(-280, -60),
        r: randFloat(1.5, 4), t: 0, life: randFloat(0.5, 1.1),
        color: k % 3 ? this.coast.land : this.coast.sand,
      });
    }

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
      this._say(who === "them" ? `Hit for ${amount}` : `Took ${amount}`, who === "them" ? "#2ee6a6" : "#ff5470");
      // Score follows the shot, not the victim: the opponent blowing itself
      // up is its mistake, not your marksmanship.
      if (who === "them" && owner === "you") { this.addScore(amount * (this.rung + 1)); this.hits++; }
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
    this._place(this.you, true);
    this._place(this.them, true);
    this._terrainDirty = true;
  }

  _afterShot() {
    if (this.projectiles.length) return;
    if (this.you.hp <= 0 || this.them.hp <= 0) { this._finish(); return; }
    this.turn = this.turn === "you" ? "them" : "you";
    this._driftWind();
    this.aiTimer = 1.0;
    if (this.turn === "you") {
      const li = this.lastImpact;
      this.msg = li && li.dir !== "hit"
        ? `${li.metres} m ${li.dir} — correct and fire again`
        : "Your shot";
    } else {
      this.msg = `${this.foe.name} is aiming`;
    }
    this.msgT = 2.4;
  }

  /**
   * Wind that can be played around. It walks rather than teleports, so the
   * correction you just earned is still roughly valid; every few turns a
   * gust re-rolls it outright, and that gust is announced so it is a change
   * in the weather rather than a change in the rules.
   */
  _driftWind() {
    this.gustIn--;
    if (this.gustIn <= 0) {
      this.gustIn = randInt(3, 6);
      this.windTarget = randFloat(-this.windCap, this.windCap);
      this.gust = 1.6;
      this._say("Gust — the wind has turned", "#22d3ee");
    } else {
      this.windTarget = clamp(this.windTarget + randFloat(-this.windCap * 0.14, this.windCap * 0.14),
                              -this.windCap, this.windCap);
    }
  }

  /**
   * The opponent's shot.
   *
   * It searches for a plausible angle and power once, then — and this is the
   * part that makes a duel feel like a duel — walks its fire in: it remembers
   * how far its last shell fell short or long and takes `correct` of that
   * error out on the next one. Rusty Pete barely corrects at all; the
   * Coastmaster has you bracketed by the third shot.
   */
  _aiShoot() {
    const W = this.viewW, H = this.viewH;
    const from = this._muzzle(this.them);
    const target = { x: this.you.x * W, y: this.you.y * H };

    // Pick a shell: a special when it has one, a mortar by preference when a
    // ridge stands between the two guns. A gunner in the middle of a bracket
    // keeps the round it is ranging with — swapping to a mortar halfway
    // through throws away everything the last shot taught it, which is what
    // produced the occasional wild shot after two good ones.
    const bracketing = this.aiMemory && Math.abs(this.aiMemory.alongPx) > 6 && this.aiMemory.power != null;
    let shell = SHELLS[0];
    if (bracketing) {
      const held = SHELLS.find(s => s.id === this.aiMemory.shellId);
      // Only if there is still one in the magazine; the plain shell always is.
      if (held && (held.id === "shell" || this.foeAmmo[held.id] > 0)) shell = held;
    }
    if (!bracketing || shell.id !== this.aiMemory.shellId) {
      const blocked = this._ridgeBetween();
      const kit = this.foe.kit.filter(id => this.foeAmmo[id] > 0);
      if (kit.length) {
        const preferred = blocked ? kit.find(id => id === "mortar" || id === "driller") : null;
        const pick = preferred || (Math.random() < 0.55 ? kit[randInt(0, kit.length - 1)] : null);
        if (pick) shell = SHELLS.find(s => s.id === pick) || SHELLS[0];
      }
    }

    let angle, power;
    // A correction is only valid against the round it was measured with.
    if (bracketing && this.aiMemory.shellId === shell.id) {
      // Correct the previous shot rather than solving from scratch. Range
      // scales roughly with the square of the muzzle speed, so the power
      // correction is taken on that curve instead of linearly.
      const flat = Math.hypot(target.x - from.x, 1);
      const err = this.aiMemory.alongPx / Math.max(60, flat);
      const scale = clamp(1 - err * this.foe.correct, 0.72, 1.32);
      power = clamp(this.aiMemory.power * Math.sqrt(scale), 12, MAX_POWER);
      angle = this.aiMemory.angle;
    } else {
      const best = this._solve(from, target, shell);
      angle = (best.a * Math.PI) / 180;
      power = best.pw;
    }

    // Error cone. The opening shot is deliberately loose — it is a ranging
    // shot, and a gunner who solves the ballistics exactly on the first pull
    // is not a duel, it is an execution. Once there is a miss to correct
    // from the cone tightens right down, which is what makes the second and
    // third shots of a bracket close in.
    const cone = this.foe.aim * (this.aiMemory ? 0.5 : 2.4);
    this.them.angle = angle + (randFloat(-cone, cone) * Math.PI) / 180;
    this.them.power = clamp(power + randFloat(-cone * 0.7, cone * 0.7), 12, MAX_POWER);
    this._fire(this.them, -1, shell);
  }

  /** Is there ground between the guns higher than both of them? */
  _ridgeBetween() {
    const a = Math.min(this.you.x, this.them.x), b = Math.max(this.you.x, this.them.x);
    const lip = Math.min(this.you.y, this.them.y) - 0.07;
    for (let t = a; t <= b; t += 0.01) if (this._hAt(t) < lip) return true;
    return false;
  }

  /** Coarse ballistic search using the same integrator the shell will use. */
  _solve(from, target, shell) {
    const W = this.viewW, H = this.viewH;
    const lob = shell.lob || 1, drag = shell.drag || 1;
    let best = null;
    for (let a = 188; a <= 352; a += 4) {
      for (let pw = 22; pw <= MAX_POWER; pw += 4) {
        const rad = (a * Math.PI) / 180;
        const speed = pw * 5.4 * (shell.lob ? 1 / lob : 1);
        let x = from.x, y = from.y;
        let vx = Math.cos(rad) * speed, vy = Math.sin(rad) * speed * lob;
        let miss = Infinity;
        for (let k = 0; k < 460; k++) {
          vy += GRAV * drag * (1 / 60);
          vx += this.wind * this.foe.wind * (1 / 60);
          x += vx / 60; y += vy / 60;
          miss = Math.min(miss, Math.hypot(x - target.x, y - target.y));
          if (y / H >= this._hAt(x / W)) break;
          if (x < -200 || x > W + 200 || y > H + 300) break;
        }
        if (!best || miss < best.miss) best = { a, pw, miss };
      }
    }
    return best || { a: 250, pw: 55, miss: 999 };
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 1.8; }

  _finish() {
    const won = this.them.hp <= 0;
    const store = this._store();
    if (won) {
      store.wins = (store.wins || 0) + 1;
      if (store.bestRung <= this.rung) store.bestRung = Math.min(FOES.length, this.rung + 1);
      const prev = store.bestShots[this.rung];
      if (!prev || this.shots < prev) store.bestShots[this.rung] = this.shots;
      // Fewer shots is a cleaner duel, so the bonus rewards ranging in fast.
      this.addScore(500 + this.rung * 250 + Math.max(0, 600 - this.shots * 45));
    }
    this._save();
    const nextShell = SHELLS[Math.min(SHELLS.length - 1, this.rung + 1)];
    this.endGame({
      result: won ? "win" : "loss",
      score: this.score,
      message: won
        ? (this.rung + 1 >= FOES.length
            ? "The Coastmaster is beaten. The whole ladder is yours."
            : `${this.foe.name} is down in ${this.shots} shots. ${nextShell ? `${nextShell.name} unlocked.` : ""}`)
        : `${this.foe.name} found the range first. ${this.shots} shots fired.`,
      extraStats: [
        { label: "Shots", value: this.shots },
        { label: "On target", value: `${this.hits}` },
        { label: "Ladder", value: `${store.bestRung}/${FOES.length}` },
      ],
    });
  }

  _stepEffects(dt) {
    if (this.gust > 0) this.gust -= dt;
    if (this.lastImpact) this.lastImpact.t += dt;
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t += dt;
      if (this.blasts[i].t > 0.55) this.blasts.splice(i, 1);
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; s.vx *= 0.98;
      if (s.t >= s.life) this.smoke.splice(i, 1);
    }
    const H = this.viewH, W = this.viewW;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt; d.vy += 620 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.t >= d.life || d.y / H > this._hAt(d.x / W)) this.debris.splice(i, 1);
    }
  }

  _updateHud() {
    const shell = this._unlockedShells()[this.shellIdx] || SHELLS[0];
    const n = this.ammo?.[shell.id];
    this.setHud({
      You: `${this.you?.hp ?? 0}`,
      Foe: `${this.them?.hp ?? 0}`,
      Wind: `${this.wind >= 0 ? "→" : "←"} ${Math.abs(this.wind * (FIELD_M / (this.viewW || 900))).toFixed(1)}`,
      Shell: shell.short,
      Ammo: n === Infinity ? "∞" : `${n ?? 0}`,
    });
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawSky(ctx, W, H);
    this._drawFarShore(ctx, W, H);
    this._drawTerrain(ctx, W, H);
    // Water goes over the land, not behind it. Drawn behind, any seabed that
    // sat below the surface came out as a green wall filling the bottom of
    // the frame; over it, and translucent, the same seabed reads as shallows.
    this._drawSea(ctx, W, H);
    this._drawGhost(ctx);
    this._drawTank(ctx, this.you, W, H, "#2ee6a6", "cap", 1);
    this._drawTank(ctx, this.them, W, H, this.foe.color, this.foe.hat, -1);
    this._drawProjectiles(ctx);
    this._drawBlasts(ctx);
    this._drawDebris(ctx);
    this._drawSmoke(ctx);
    this._drawImpactMarker(ctx, W, H);
    if (this.aim) this._drawAim(ctx, W, H);
    else if (this._myTurn()) this._drawGuide(ctx, W, H);
    this._drawWind(ctx, W, H);
    this._drawBars(ctx, W, H);
    this._drawControls(ctx, W, H);
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

    // A low sun with a soft halo.
    const sx = W * 0.78, sy = H * 0.19;
    const halo = ctx.createRadialGradient(sx, sy, 4, sx, sy, Math.min(W, H) * 0.3);
    halo.addColorStop(0, hexA(c.sun, 0.55));
    halo.addColorStop(1, hexA(c.sun, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H * 0.7);
    ctx.fillStyle = c.sun;
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(16, Math.min(W, H) * 0.035), 0, 7); ctx.fill();

    // Two cloud layers at different speeds: the parallax is what gives the
    // sky depth on a canvas this shallow.
    for (const [n, speed, alpha, scale, yy] of [[3, 4, 0.1, 1.5, 0.1], [4, 9, 0.18, 1, 0.16]]) {
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      for (let i = 0; i < n; i++) {
        const x = ((this.elapsed * (speed + i * 2) + i * 290) % (W + 360)) - 180;
        const y = H * (yy + i * 0.045);
        ctx.beginPath();
        ctx.ellipse(x, y, (58 + i * 16) * scale, 14 * scale, 0, 0, 7);
        ctx.ellipse(x + 38 * scale, y - 7 * scale, 40 * scale, 11 * scale, 0, 0, 7);
        ctx.ellipse(x - 40 * scale, y + 2, 34 * scale, 9 * scale, 0, 0, 7);
        ctx.fill();
      }
    }

    // Gulls. Three strokes each, but they are what stops the sky reading as
    // a gradient with clouds pasted on it.
    ctx.strokeStyle = "rgba(30,40,60,0.4)";
    ctx.lineWidth = 1.6;
    for (const g2 of this.gulls) {
      const x = g2.x * W, y = g2.y * H + Math.sin(this.elapsed * 1.4 + g2.p) * 5;
      const flap = Math.sin(this.elapsed * 6 + g2.p) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 7, y + flap); ctx.quadraticCurveTo(x - 3, y - 3, x, y);
      ctx.quadraticCurveTo(x + 3, y - 3, x + 7, y + flap);
      ctx.stroke();
    }
  }

  /** A headland behind the sea, flat-coloured, purely for depth. */
  _drawFarShore(ctx, W, H) {
    const c = this.coast;
    const y = H * (SEA_Y - 0.005);
    ctx.fillStyle = c.far;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 12) {
      const t = x / W;
      const hh = 26 + Math.sin(t * 5.1 + 1.3) * 12 + Math.sin(t * 11.3) * 6;
      ctx.lineTo(x, y - hh);
    }
    ctx.lineTo(W, y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * The water. A translucent band over everything below the sea line, so the
   * seabed shows through in the shallows and disappears where it drops away —
   * which is what makes an islet chain read as islets rather than as green
   * lumps on a blue stripe.
   */
  _drawSea(ctx, W, H) {
    const c = this.coast;
    const y = H * SEA_Y;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, hexA(shadeHex2(c.sea, 0.1), 0.62));
    g.addColorStop(0.5, hexA(c.sea, 0.82));
    g.addColorStop(1, hexA(shadeHex2(c.sea, -0.14), 0.94));
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, H - y);

    // Sun glitter: a column of short dashes under the sun, brightest near
    // the horizon, which is the cheapest convincing water there is.
    const sx = W * 0.78;
    ctx.fillStyle = hexA(c.sun, 0.4);
    for (let k = 0; k < 22; k++) {
      const yy = y + 3 + k * ((H - y) / 20);
      const spread = 10 + k * 5;
      const w = 12 + Math.sin(this.elapsed * 2 + k) * 7;
      ctx.globalAlpha = 0.3 * (1 - k / 26);
      ctx.fillRect(sx - spread / 2 + Math.sin(this.elapsed * 1.3 + k * 2) * spread * 0.4, yy, w, 1.6);
    }
    ctx.globalAlpha = 1;

    // Swell.
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const yy = y + 7 + k * ((H - y) / 6) + Math.sin(x * 0.03 + this.elapsed * 1.6 + k) * 3;
        x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }

    // Foam wherever the ground surface crosses the water line — the actual
    // shoreline, which moves as the coast is blown apart.
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.5;
    for (let i = 1; i < COLS; i++) {
      const a = this.height[i - 1] * H, b = this.height[i] * H;
      if ((a - y) * (b - y) > 0) continue;
      const x = (i / (COLS - 1)) * W;
      const w = 10 + Math.sin(this.elapsed * 3 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(x - w, y + Math.sin(this.elapsed * 3 + i) * 1.6);
      ctx.lineTo(x + w, y + Math.sin(this.elapsed * 3 + i + 1) * 1.6);
      ctx.stroke();
    }
    ctx.restore();

    // A boat on the horizon. One hull and one sail, but a flat sea with
    // nothing on it reads as a painted backdrop.
    const bx = ((this.elapsed * 6) % (W + 200)) - 100;
    const by = y + 10;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#1b2436";
    ctx.beginPath();
    ctx.moveTo(bx - 9, by); ctx.lineTo(bx + 9, by); ctx.lineTo(bx + 5, by + 4); ctx.lineTo(bx - 5, by + 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx, by - 1); ctx.lineTo(bx, by - 13); ctx.lineTo(bx + 8, by - 1);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /**
   * The heightmap. Three bands rather than a gradient — wet sand at the
   * waterline, dry sand above it, then rock — plus strata, speckle and the
   * scorch marks left by everything that has already gone off.
   */
  _drawTerrain(ctx, W, H) {
    const c = this.coast;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, H + 4);
      for (let i = 0; i < COLS; i++) ctx.lineTo((i / (COLS - 1)) * W, this.height[i] * H);
      ctx.lineTo(W, H + 4);
      ctx.closePath();
    };

    ctx.save();
    path();
    const g = ctx.createLinearGradient(0, H * 0.28, 0, H);
    g.addColorStop(0, c.land);
    g.addColorStop(0.55, c.rock);
    g.addColorStop(1, c.deep);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.clip();
    // Strata.
    ctx.strokeStyle = "rgba(0,0,0,0.11)";
    ctx.lineWidth = 3;
    for (let k = 1; k <= 6; k++) {
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const x = (i / (COLS - 1)) * W, y = this.height[i] * H + k * 21;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    // Speckle, seeded from the column index so it never crawls.
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    for (let i = 0; i < COLS; i += 2) {
      const x = (i / (COLS - 1)) * W;
      const n = ((i * 61) % 17) / 17;
      const y = this.height[i] * H + 6 + n * 90;
      ctx.fillRect(x, y, 2.5, 2.5);
    }
    // Scorch from every blast so far.
    for (const s of this.scorch) {
      const x = s.nx * W, y = this._hAt(s.nx) * H;
      const r = s.r * W * 1.5;
      const sg = ctx.createRadialGradient(x, y, 1, x, y, r);
      sg.addColorStop(0, `rgba(20,14,10,${s.a})`);
      sg.addColorStop(1, "rgba(20,14,10,0)");
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.restore();

    // The surface: a sand lip along the whole coastline. Below the water line
    // the sea layer tints it, so one stroke covers dry sand and seabed both.
    ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.strokeStyle = c.sand;
    ctx.beginPath();
    for (let i = 0; i < COLS; i++) {
      const x = (i / (COLS - 1)) * W, y = this.height[i] * H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    // A thin grass cap on the ground that is well clear of the water, which
    // is what separates a headland from a sandbar at a glance.
    ctx.strokeStyle = shadeHex(c.land, 0.1);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i < COLS; i++) {
      const y = this.height[i] * H;
      const x = (i / (COLS - 1)) * W;
      if (this.height[i] < SEA_Y - 0.06) {
        drawing ? ctx.lineTo(x, y - 3) : ctx.moveTo(x, y - 3);
        drawing = true;
      } else drawing = false;
    }
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  _drawTank(ctx, tank, W, H, color, hat, facing) {
    const x = tank.x * W, y = tank.y * H;
    ctx.save();
    ctx.translate(x, y - 2);
    const kick = tank.recoil * 5;
    // Barrel, with a recoil slide along its own axis.
    ctx.save();
    ctx.translate(-Math.cos(tank.angle) * kick, -Math.sin(tank.angle) * kick);
    ctx.rotate(tank.angle);
    ctx.fillStyle = "#2b3040";
    ctx.fillRect(0, -4.5, 30, 9);
    ctx.fillStyle = "#565d75";
    ctx.fillRect(2, -4.5, 26, 2);
    ctx.fillStyle = "#8b90ac";
    ctx.fillRect(24, -5.5, 6, 11);
    ctx.restore();
    // Ground shadow.
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(0, 9, 23, 5, 0, 0, 7); ctx.fill();
    // Hull.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, 6); ctx.lineTo(-16, -6); ctx.lineTo(16, -6); ctx.lineTo(20, 6);
    ctx.closePath(); ctx.fill();
    // A lit edge along the top, so the hull is not a flat colour chip.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(-16, -6); ctx.lineTo(16, -6); ctx.lineTo(15, -3.5); ctx.lineTo(-15, -3.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-20, 6); ctx.lineTo(-16, -6); ctx.lineTo(16, -6); ctx.lineTo(20, 6);
    ctx.closePath(); ctx.stroke();
    // Turret and a gun shield.
    ctx.fillStyle = shadeHex(color, -0.22);
    ctx.beginPath(); ctx.arc(0, -6, 10, Math.PI, 0); ctx.fill();
    ctx.fillStyle = shadeHex(color, -0.34);
    ctx.fillRect(facing > 0 ? 6 : -12, -12, 6, 12);
    // Wheels, which read better than a tread block at this size.
    ctx.fillStyle = "#161927";
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 12, 7, 5.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#4a5064";
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * 12, 7, 2.2, 0, 7); ctx.fill(); }
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

    // Muzzle flash on the gun that just fired.
    if (this.flash && Math.hypot(this.flash.x - x, this.flash.y - (y - 12)) < 60) {
      const k = 1 - this.flash.t / 0.12;
      ctx.save();
      ctx.rotate(tank.angle);
      ctx.globalAlpha = k;
      ctx.fillStyle = "#fff3c0";
      ctx.beginPath();
      ctx.moveTo(30, 0); ctx.lineTo(30 + 22 * k, -8 * k); ctx.lineTo(46 * k + 24, 0);
      ctx.lineTo(30 + 22 * k, 8 * k);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // A flash of white when the ground has just dropped out from under it.
    if (tank.fall > 0) {
      ctx.globalAlpha = tank.fall * 0.5;
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath(); ctx.ellipse(0, 2, 26, 16, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.strokeStyle = p.owner === "you" ? "rgba(124,240,208,0.55)" : "rgba(255,159,67,0.55)";
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

  /** Your previous shot, faint, so the correction is visible as a shape. */
  _drawGhost(ctx) {
    if (!this.ghost || this.turn !== "you") return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    this.ghost.forEach((t, i) => i ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y));
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Where the last shell landed, and by how much it missed. This is the
   * game's main feedback: without it a miss teaches you nothing at all.
   */
  _drawImpactMarker(ctx, W, H) {
    const m = this.lastImpact;
    if (!m || this.turn !== "you" || m.how === "hit") return;
    const pulse = 0.5 + Math.sin(this.elapsed * 3) * 0.12;
    ctx.save();
    ctx.strokeStyle = `rgba(255,215,106,${pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, 11, 0, 7); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x - 16, m.y); ctx.lineTo(m.x - 7, m.y);
    ctx.moveTo(m.x + 7, m.y); ctx.lineTo(m.x + 16, m.y);
    ctx.moveTo(m.x, m.y - 16); ctx.lineTo(m.x, m.y - 7);
    ctx.stroke();
    // The distance, over the target rather than over the crater, since that
    // is where you are looking when you decide the next shot.
    const tx = this.them.x * W, ty = this.them.y * H;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(255,215,106,0.4)";
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd76a";
    ctx.font = "800 12px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${m.metres} m ${m.dir}`, (m.x + tx) / 2, Math.min(m.y, ty) - 14);
    ctx.restore();
  }

  /**
   * The barrel guide. In Gunner it is the first fraction of a second out of
   * the muzzle — enough to see where the gun is pointing, not enough to be
   * told where the shell will land. Cadet draws the whole arc.
   */
  _guidePath(ctx, W, H, angle, power, shell, steps, dotEvery) {
    const m = this._muzzle({ ...this.you, angle });
    const speed = power * 5.4 * (shell.lob ? 1 / shell.lob : 1);
    let x = m.x, y = m.y;
    let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed * (shell.lob || 1);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let k = 0; k < steps; k++) {
      vy += GRAV * (shell.drag || 1) / 60;
      vx += this.wind / 60;
      x += vx / 60; y += vy / 60;
      if (k % dotEvery === 0) {
        ctx.globalAlpha = 0.7 * (1 - k / steps);
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
      }
      if (y / H >= this._hAt(x / W)) break;
    }
    ctx.globalAlpha = 1;
  }

  _guideSteps() { return this.difficulty === "Cadet" ? 130 : 22; }

  _drawGuide(ctx, W, H) {
    const shell = this._unlockedShells()[this.shellIdx] || SHELLS[0];
    this._guidePath(ctx, W, H, this.you.angle, this.you.power, shell, this._guideSteps(), 3);
  }

  _drawAim(ctx, W, H) {
    const a = this.aim;
    const dx = a.x - a.sx, dy = a.y - a.sy;
    const len = Math.hypot(dx, dy) || 1;
    const angle = clamp(Math.atan2(-dy, -dx), -Math.PI + 0.05, -0.05);
    const power = clamp((len / (W * 0.28)) * MAX_POWER, 8, MAX_POWER);
    const shell = this._unlockedShells()[this.shellIdx] || SHELLS[0];
    this._guidePath(ctx, W, H, angle, power, shell, this._guideSteps(), 3);

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

  /**
   * The wind gauge, in metres per second rather than pixels of acceleration.
   * A number you can act on: the same reading twice running means the same
   * correction works twice running, which is the point of a drifting wind.
   */
  _drawWind(ctx, W, H) {
    const s = this._s();
    const cx = W / 2, y = 16 * s + 6;
    const bw = 150 * s, bh = 27 * s;
    const mps = this.wind * (FIELD_M / W);
    const mag = Math.min(1, Math.abs(this.wind) / Math.max(1, this.windCap));
    ctx.save();
    ctx.fillStyle = "rgba(8,14,26,0.5)";
    roundRect(ctx, cx - bw / 2, y - bh / 2, bw, bh, bh / 2); ctx.fill();
    if (this.gust > 0) {
      ctx.strokeStyle = `rgba(34,211,238,${Math.min(1, this.gust)})`;
      ctx.lineWidth = 2;
      roundRect(ctx, cx - bw / 2, y - bh / 2, bw, bh, bh / 2); ctx.stroke();
    }
    ctx.strokeStyle = mag > 0.66 ? "#ff5470" : mag > 0.33 ? "#ff9f43" : "#22d3ee";
    ctx.lineWidth = 3 * s; ctx.lineCap = "round";
    const dir = Math.sign(this.wind) || 1;
    const L = (16 + mag * 28) * s;
    const ax = cx - bw * 0.26;
    const tip = 6.5 * s;
    ctx.beginPath();
    ctx.moveTo(ax - (L / 2) * dir, y); ctx.lineTo(ax + (L / 2) * dir, y);
    ctx.moveTo(ax + (L / 2) * dir, y);
    ctx.lineTo(ax + (L / 2 - tip) * dir, y - tip * 0.85);
    ctx.moveTo(ax + (L / 2) * dir, y);
    ctx.lineTo(ax + (L / 2 - tip) * dir, y + tip * 0.85);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(13 * s)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`${Math.abs(mps).toFixed(1)} m/s`, cx + bw * 0.03, y + 4.5 * s);
    ctx.restore();
  }

  _drawBars(ctx, W, H) {
    const s = this._s();
    // Under the wind gauge, and narrow enough that two of them plus the
    // gauge fit across a phone-width canvas.
    const top = 34 * s + 8;
    const bar = (x, tank, name, color, align) => {
      const bw = Math.min(140 * s, W * 0.27), bh = 10 * s;
      const bx = align === "left" ? x : x - bw;
      ctx.fillStyle = "rgba(8,14,26,0.6)";
      roundRect(ctx, bx, top, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, bx + 1, top + 1, Math.max(0, (bw - 2) * (tank.hp / tank.maxHp)), bh - 2, (bh - 2) / 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.font = `700 ${Math.round(10 * s)}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.fillText(`${name} ${tank.hp}`, align === "left" ? bx : bx + bw, top - 3);
    };
    bar(10, this.you, "You", "#2ee6a6", "left");
    bar(W - 10, this.them, this.foe.name, this.foe.color, "right");
  }

  /** Angle and power steppers either side of the Fire button. */
  _drawControls(ctx, W, H) {
    const live = this._myTurn();
    ctx.save();
    ctx.globalAlpha = live ? 1 : 0.35;
    for (const c of this._ctrlLayout()) {
      if (c.kind === "angle-readout" || c.kind === "power-readout") {
        const isAngle = c.kind === "angle-readout";
        ctx.fillStyle = "rgba(10,16,30,0.72)";
        roundRect(ctx, c.x, c.y, c.w, c.h, 8); ctx.fill();
        ctx.fillStyle = "#ffd76a";
        ctx.font = `800 ${Math.round(clamp(c.w * 0.28, 11, 15))}px 'Sora', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(isAngle
          ? `${Math.round(-this.you.angle * 180 / Math.PI)}°`
          : `${Math.round(this.you.power)}`, c.x + c.w / 2, c.y + c.h * 0.56);
        ctx.fillStyle = "rgba(255,255,255,0.42)";
        ctx.font = "700 7px 'Inter', system-ui, sans-serif";
        ctx.fillText(isAngle ? "ANGLE" : "POWER", c.x + c.w / 2, c.y + c.h - 3.5);
        continue;
      }
      if (c.kind === "fire") {
        ctx.fillStyle = live ? "rgba(255,84,112,0.9)" : "rgba(40,44,60,0.8)";
        roundRect(ctx, c.x, c.y, c.w, c.h, 9); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.4;
        roundRect(ctx, c.x, c.y, c.w, c.h, 9); ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 ${Math.round(clamp(c.w * 0.19, 11, 14))}px 'Sora', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("FIRE", c.x + c.w / 2, c.y + c.h * 0.64);
        continue;
      }
      ctx.fillStyle = "rgba(20,26,44,0.8)";
      roundRect(ctx, c.x, c.y, c.w, c.h, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
      roundRect(ctx, c.x, c.y, c.w, c.h, 7); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `800 ${Math.abs(c.delta) > 1 ? 8 : 10}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(c.label, c.x + c.w / 2, c.y + c.h * 0.62);
    }
    ctx.restore();
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
      ctx.textAlign = "center";
      if (b.named) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 9px 'Inter', system-ui, sans-serif";
        ctx.fillText(`${b.i + 1} ${b.s.short}`, b.x + b.w / 2, b.y + b.h * 0.44);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "700 9px 'Inter', system-ui, sans-serif";
        ctx.fillText(n === Infinity ? "∞" : `×${n}`, b.x + b.w / 2, b.y + b.h * 0.82);
      } else {
        // Too narrow for a name: the digit and the count only. The name of
        // the selected shell is in the HUD.
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 12px 'Sora', system-ui, sans-serif";
        ctx.fillText(String(b.i + 1), b.x + b.w / 2, b.y + b.h * 0.5);
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.font = "700 8px 'Inter', system-ui, sans-serif";
        ctx.fillText(n === Infinity ? "∞" : `×${n}`, b.x + b.w / 2, b.y + b.h * 0.86);
      }
      ctx.globalAlpha = 1;
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

  _drawDebris(ctx) {
    for (const d of this.debris) {
      ctx.globalAlpha = Math.max(0, 1 - d.t / d.life);
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x - d.r / 2, d.y - d.r / 2, d.r, d.r);
    }
    ctx.globalAlpha = 1;
  }

  _drawSmoke(ctx) {
    for (const s of this.smoke) {
      ctx.globalAlpha = Math.max(0, 1 - s.t / s.life) * 0.55;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (1 + s.t), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.min(1, this.msgT / 0.5);
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = `800 ${Math.round(clamp(17 * this._s(), 11, 17))}px 'Sora', system-ui, sans-serif`;
    // Below the gauge and the health bars rather than through them.
    ctx.fillText(this.msg, W / 2, Math.max(H * 0.28, 62 * this._s() + 12));
    ctx.globalAlpha = 1;
  }
}

function hit(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

function accuracyWord(aim) {
  return aim > 11 ? "sprays wide" : aim > 8 ? "loose" : aim > 5.5 ? "steady" : aim > 3.5 ? "sharp" : aim > 2 ? "deadly" : "never misses";
}

function shadeHex(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + 255 * amt), 0, 255);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}

/** Lighten or darken a hex colour, staying in hex so hexA can consume it. */
function shadeHex2(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + 255 * amt), 0, 255);
  const to = (c) => f(c).toString(16).padStart(2, "0");
  return `#${to((v >> 16) & 255)}${to((v >> 8) & 255)}${to(v & 255)}`;
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
