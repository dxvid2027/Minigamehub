// ==========================================================================
// Shadow Vault — turn-based stealth on a grid.
//
// Nothing moves until you do. Step, and every guard takes its step too, so
// a heist is a sequence of positions rather than a reaction test: you can
// see exactly where each cone will be after your next move, because the
// guards walk fixed patrols and the game shows you the next one.
//
// Twenty-four vaults. Take the loot, reach the exit, and do not stand in a
// cone at the end of a turn. Three gadgets — a noise lure, a smoke bomb and
// a lockpick — are the only way through the late floors, and you get few
// enough of them that spending one is a decision.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";

import { el, clamp, formatNumber, seededRng } from "../core/utils.js";

const LEVELS = 24;
// Being seen used to end a forty-turn heist outright. Three alarms give a
// misread cone a cost without throwing the whole plan away: you are pulled
// back to where you stood, the guards reset with you, and the third one is
// the one that actually ends it.
const ALARMS = 3;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N E S W

// Tiles
const FLOOR = 0, WALL = 1, DOOR = 2, EXIT = 3, GLASS = 4;

const GADGETS = [
  { id: "lure",  name: "Noise Lure", text: "Pulls every guard within four tiles toward the spot you throw it.", color: "#ffd76a" },
  { id: "smoke", name: "Smoke Bomb", text: "Blocks every cone through a three-tile cloud for two turns.", color: "#8b90ac" },
  { id: "pick",  name: "Lockpick",   text: "Opens any locked door next to you, permanently.", color: "#22d3ee" },
];

export class ShadowVaultGame extends GameBase {
  getDifficulties() { return ["Heist"]; }
  getInstructions() {
    return [
      "Arrow keys, WASD, or a tap on the tile next to you moves one square. Nothing happens until you move — every guard steps when you do.",
      "The solid red wedges are what the guards see right now. Ending your move inside one trips an alarm.",
      "The orange hatching is where those wedges will be after your next step, and the dashed boxes are where the guards will stand. Between them, every move can be checked before you make it.",
      "Every vault is built by solving it, so a clean route always exists. Par in the HUD is the length of the shortest one.",
      "Three alarms and the heist is over. The first two pull you back to where you stood and rewind the guards with you, so a misread costs a turn rather than the vault.",
      "Take every piece of loot, then reach the green exit — it stays shut until the vault is empty.",
      "Space, or a tap on your own tile, holds still for one turn — the way to let a patrol walk past instead of walking into it.",
      "Three gadgets: a lure to pull guards away, smoke to blind a corridor for two turns, and a pick for locked doors. Press 1, 2, 3 then tap a tile.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchButtonLabels() { return { a: "WAIT" }; }
  getTouchHint() { return "Tap the tile next to you to step, your own tile to wait. Tap a gadget then a tile to use it."; }
  getKeyboardHint() { return "Arrows / WASD to step, Space to wait, 1-3 for gadgets, R to restart the vault."; }
  getScene() { return "void"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.vault) custom.vault = { cleared: {}, best: 0 };
    if (!custom.vault.cleared) custom.vault.cleared = {};
    return custom.vault;
  }
  _save() { saveManager.saveNow(); }
  _unlocked(i) { return i === 0 || !!this._store().cleared[i - 1]; }

  getPlayLabel() { return "Pick a vault"; }
  getStartExtras() {
    const v = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `${Object.keys(v.cleared).length}/${LEVELS} vaults cracked`),
    ]);
  }

  /**
   * The campaign, handed to the framework: it draws the picker, puts the next
   * vault on the win screen and keeps the HUD button in step. A cleared vault
   * records its turn count, which is what the note shows — the score to beat
   * on a return visit.
   */
  getLevelNav() {
    const store = this._store();
    return {
      index: this.levelIdx,
      count: LEVELS,
      label: "Vault",
      title: "Vaults",
      intro: "Twenty-four vaults, each one a fixed puzzle. Guards, loot and walls are the same every time you come back.",
      unlocked: (i) => this._unlocked(i),
      cleared: (i) => store.cleared[i],
      note: (i) => (store.cleared[i] ? `${store.cleared[i]} turns`
        : this._unlocked(i) ? "Open" : "Locked"),
      goTo: (i) => { this.levelIdx = i; this.start(); },
    };
  }

  onPlayPressed() { this.openLevelSelect(); }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.input.onKey("ArrowUp", () => this._step(0));
    this.input.onKey("KeyW", () => this._step(0));
    this.input.onKey("ArrowRight", () => this._step(1));
    this.input.onKey("KeyD", () => this._step(1));
    this.input.onKey("ArrowDown", () => this._step(2));
    this.input.onKey("KeyS", () => this._step(2));
    this.input.onKey("ArrowLeft", () => this._step(3));
    this.input.onKey("KeyA", () => this._step(3));
    this.input.onKey("KeyR", () => this.start());
    this.input.onKey("Space", () => this._wait());
    this.input.onKey("Period", () => this._wait());
    for (let i = 1; i <= 3; i++) this.input.onKey(`Digit${i}`, () => this._armGadget(i - 1));
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    this.levelIdx = 0;

  }

  onResize() { this._fit(); }

  onStart() {
    const L = buildVault(this.levelIdx);
    this.map = L.map;
    this.W = L.w; this.H = L.h;
    this.player = { x: L.start.x, y: L.start.y };
    this.guards = L.guards.map(g => ({ ...g, i: 0, dir: g.dir, alerted: 0 }));
    this.loot = L.loot.map(p => ({ ...p, taken: false }));
    this.exit = L.exit;
    this.lamps = L.lamps || [];
    this.par = L.par || 0;
    this.gadgets = { lure: L.gadgets.lure, smoke: L.gadgets.smoke, pick: L.gadgets.pick };
    this.armed = null;
    this.smokes = [];
    this.turns = 0;
    this.alarms = 0;
    this._dangerKey = null;
    this.snap = null;
    this.pulse = 0;
    this.caught = false;
    this.elapsed = 0;
    this.msg = "";
    this.msgT = 0;
    this.flashes = [];
    this.setScore(0);
    this._fit();
    this._updateHud();
  }

  _fit() {
    const W = this.viewW || 600, H = this.viewH || 600;
    if (!this.W) return;
    this.cell = Math.floor(Math.min((W - 16) / this.W, (H - 72) / this.H));
    this.ox = Math.round((W - this.cell * this.W) / 2);
    this.oy = Math.round((H - 56 - this.cell * this.H) / 2) + 10;
  }

  _at(x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return WALL;
    return this.map[y * this.W + x];
  }
  _blocked(x, y) { const t = this._at(x, y); return t === WALL || t === DOOR; }
  /** Glass blocks movement but not sight; walls block both. */
  _opaque(x, y) { const t = this._at(x, y); return t === WALL || t === DOOR; }

  // ------------------------------------------------------------- INPUT ---
  _armGadget(i) {
    if (this.state !== "playing") return;
    const g = GADGETS[i];
    if (this.gadgets[g.id] <= 0) { audioManager.play("error"); this._say("None left", "#ff5470"); return; }
    if (g.id === "pick") { this._usePick(); return; }
    this.armed = this.armed === g.id ? null : g.id;
    audioManager.play("select");
    this._say(this.armed ? `${g.name} — pick a tile` : "Cancelled", g.color);
  }

  _usePick() {
    for (const [dx, dy] of DIRS) {
      const x = this.player.x + dx, y = this.player.y + dy;
      if (this._at(x, y) === DOOR) {
        this.snap = this._snapshot();
        this.map[y * this.W + x] = FLOOR;
        this.gadgets.pick--;
        audioManager.play("place");
        this._say("Door picked", "#22d3ee");
        this._endTurn();
        return;
      }
    }
    this._say("No door next to you", "#ff5470");
  }

  _click(px, py) {
    if (this.state !== "playing") return;
    const bar = this._gadgetBar();
    for (const b of bar) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { this._armGadget(b.i); return; }
    }
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    // With nothing armed, tapping the tile next to you walks onto it. On a
    // phone this is the whole control scheme: a turn-based game does not need
    // a d-pad when the board itself is the input.
    if (!this.armed) {
      const dx = x - this.player.x, dy = y - this.player.y;
      if (dx === 0 && dy === 0) this._wait();
      else if (Math.abs(dx) + Math.abs(dy) === 1) {
        this._step(dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0);
      }
      return;
    }
    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) > 6) { this._say("Too far to throw", "#ff5470"); return; }
    this.snap = this._snapshot();
    if (this.armed === "lure") {
      this.gadgets.lure--;
      this.flashes.push({ x, y, t: 0, color: "#ffd76a" });
      // Guards within four tiles reroute toward the noise for a few turns.
      for (const g of this.guards) {
        if (Math.abs(g.x - x) + Math.abs(g.y - y) <= 4) { g.lure = { x, y }; g.alerted = 3; }
      }
      audioManager.play("pop");
      this._say("Noise thrown", "#ffd76a");
    } else if (this.armed === "smoke") {
      this.gadgets.smoke--;
      this.smokes.push({ x, y, turns: 2 });
      this.flashes.push({ x, y, t: 0, color: "#8b90ac" });
      audioManager.play("swoosh");
      this._say("Smoke out", "#8b90ac");
    }
    this.armed = null;
    this._endTurn();
  }

  _step(dir) {
    if (this.state !== "playing" || this.caught) return;
    const [dx, dy] = DIRS[dir];
    const nx = this.player.x + dx, ny = this.player.y + dy;
    if (this._blocked(nx, ny)) {
      if (this._at(nx, ny) === DOOR) this._say("Locked — use a pick", "#ff5470");
      audioManager.play("error");
      return;
    }
    this.snap = this._snapshot();
    this.player.x = nx; this.player.y = ny;
    audioManager.play("step");
    // Loot is taken by standing on it.
    for (const l of this.loot) {
      if (!l.taken && l.x === nx && l.y === ny) {
        l.taken = true;
        this.addScore(150);
        this.flashes.push({ x: nx, y: ny, t: 0, color: "#ffd76a" });
        audioManager.play("coin");
      }
    }
    this._endTurn();
  }

  /**
   * Stand still for a turn. Letting a patrol walk past is half of stealth,
   * and without this the only way to spend a turn was to step somewhere and
   * step back — two moves for what should cost one, and often impossible in
   * a corridor with only one exit.
   */
  _wait() {
    if (this.state !== "playing" || this.caught) return;
    this.snap = this._snapshot();
    audioManager.play("tick");
    this._say("Held still", "#8b90ac");
    this._endTurn();
  }

  /** Guards step, then vision is resolved. Order matters: they move first. */
  _endTurn() {
    this.turns++;
    for (const s of this.smokes) s.turns--;
    this.smokes = this.smokes.filter(s => s.turns > 0);

    for (const g of this.guards) Object.assign(g, this._guardNext(g));

    if (this._seen(this.player.x, this.player.y)) { this._spotted(); return; }

    // Exit only opens once the vault is empty.
    if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
      if (this.loot.every(l => l.taken)) this._clear();
      else this._say(`${this.loot.filter(l => !l.taken).length} still to take`, "#ffd76a");
    }
    this._updateHud();
  }

  // ------------------------------------------------------- REWIND --------
  /**
   * The state a turn starts from. Cheap enough to take every turn: a vault is
   * a few dozen tiles of mutable state, so there is no reason to be clever.
   */
  _snapshot() {
    return {
      player: { ...this.player },
      guards: this.guards.map(g => ({ ...g, path: g.path, lure: g.lure ? { ...g.lure } : null })),
      loot: this.loot.map(l => ({ ...l })),
      smokes: this.smokes.map(sm => ({ ...sm })),
      gadgets: { ...this.gadgets },
      doors: this.map.slice(),
      turns: this.turns,
      score: this.score,
    };
  }

  _restore(sn) {
    this.player = { ...sn.player };
    this.guards = sn.guards.map(g => ({ ...g, lure: g.lure ? { ...g.lure } : null }));
    this.loot = sn.loot.map(l => ({ ...l }));
    this.smokes = sn.smokes.map(sm => ({ ...sm }));
    this.gadgets = { ...sn.gadgets };
    this.map = sn.doors.slice();
    this.turns = sn.turns;
    this.setScore(sn.score);
    this._dangerKey = null;
  }

  /**
   * Where a guard stands and faces after one more turn. Pure: it reads the
   * guard but writes nothing, so the same routine drives both the real step
   * and the ghost preview the player plans against. Everything the preview
   * shows is therefore what will actually happen, not a second guess at it.
   */
  _guardNext(g) { return guardNext(g, (x, y) => this._blocked(x, y)); }

  /**
   * The tiles that will be watched when your next step lands. This is the
   * whole game: a turn-based stealth level is only fair if you can see the
   * consequence of a move before you commit to it.
   */
  _dangerNext() {
    // Keyed on the level too: turns reset to 0 on every start, so a key of
    // just the turn number handed a freshly loaded vault the *previous*
    // vault's cones until the first move cleared the cache.
    const key = `${this.levelIdx}:${this.turns}:${this.smokes.length}`;
    if (this._dangerKey === key) return this._dangerSet;
    const set = new Set();
    for (const g of this.guards) {
      const n = this._guardNext(g);
      // Smoke thrown this turn is still up next turn only if it has a turn
      // left after the decrement, so the preview honours it the same way.
      for (const [x, y] of this._coneTiles(n, this.smokes.filter(s => s.turns > 1))) set.add(`${x},${y}`);
    }
    this._dangerKey = key;
    this._dangerSet = set;
    return set;
  }

  /**
   * Is a tile inside any guard's cone right now? One definition of a cone,
   * used by sight, by the drawn wedges and by the next-turn preview, so the
   * three can never disagree about what a guard can see.
   */
  _seen(x, y) {
    for (const g of this.guards) {
      if (this._coneTiles(g).some(([cx, cy]) => cx === x && cy === y)) return true;
    }
    return false;
  }

  /** Cone tiles for a guard, optionally against a hypothetical smoke set. */
  _coneTiles(g, smokes = this.smokes) {
    return coneTiles(g, (x, y) => this._opaque(x, y), smokes);
  }

  /**
   * Seen. The first two cost an alarm and rewind the turn; the third is the
   * heist. Rewinding restores the guards too, so the level is exactly as it
   * was before the move rather than a turn further along its patrol.
   */
  _spotted() {
    this.alarms++;
    this.flashes.push({ x: this.player.x, y: this.player.y, t: 0, color: "#ff5470" });
    this.shake();
    if (this.alarms >= ALARMS || !this.snap) { this._catch(); return; }
    audioManager.play("error");
    this._restore(this.snap);
    this.pulse = 1;
    this._say(`Spotted — pulled back (${ALARMS - this.alarms} left)`, "#ff5470");
    this._updateHud();
  }

  _catch() {
    this.caught = true;
    audioManager.play("gameover");
    this.shake();
    this.endGame({
      result: "loss", score: this.score,
      message: `Third alarm on turn ${this.turns}. ${this.loot.filter(l => l.taken).length} of ${this.loot.length} pieces were already in the bag.`,
      extraStats: [
        { label: "Vault", value: `${this.levelIdx + 1}/${LEVELS}` },
        { label: "Turns", value: this.turns },
        { label: "Loot", value: `${this.loot.filter(l => l.taken).length}/${this.loot.length}` },
      ],
    });
  }

  _clear() {
    const store = this._store();
    const prev = store.cleared[this.levelIdx];
    if (!prev || this.turns < prev) store.cleared[this.levelIdx] = this.turns;
    store.best = Object.keys(store.cleared).length;
    this._save();
    // Fewer turns is a cleaner heist, so the bonus rewards a tight route.
    this.addScore(600 + Math.max(0, 400 - this.turns * 6) + this.levelIdx * 80);
    audioManager.play("win");
    this.endGame({
      result: "win", score: this.score,
      message: this.levelIdx + 1 >= LEVELS
        ? `Every vault in the building. ${this.turns} turns on the last one.`
        : this.par && this.turns <= this.par
          ? `Vault ${this.levelIdx + 1} in ${this.turns} turns — the shortest route there is.`
          : `Vault ${this.levelIdx + 1} cleaned out in ${this.turns} turns.` +
            (this.par ? ` The tightest route is ${this.par}.` : ""),
      extraStats: [
        { label: "Turns", value: this.par ? `${this.turns} (par ${this.par})` : this.turns },
        { label: "Loot", value: `${this.loot.length}/${this.loot.length}` },
        { label: "Cleared", value: `${Object.keys(store.cleared).length}/${LEVELS}` },
      ],
    });
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 2; }

  _updateHud() {
    this.setHud({
      Vault: `${this.levelIdx + 1}/${LEVELS}`,
      Loot: `${this.loot.filter(l => l.taken).length}/${this.loot.length}`,
      Turns: this.par ? `${this.turns}/${this.par}` : this.turns,
      Alarms: `${this.alarms}/${ALARMS}`,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 1.6);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t > 0.6) this.flashes.splice(i, 1);
    }
    // Keyboard steps come through the onKey handlers; this is only the
    // on-screen pad. Taps are consumed rather than sampled, so a tap shorter
    // than a frame still costs exactly one turn.
    ["up", "right", "down", "left"].forEach((name, d) => {
      if (this.input.consumeTap(name)) this._step(d);
    });
    if (this.input.consumeTap("a")) this._wait();
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    const c = this.cell;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.fillStyle = "#0a0812";
    ctx.fillRect(0, 0, W, H);

    this._drawFloor(ctx, c);
    this._drawDanger(ctx, c);
    this._drawCones(ctx, c);
    this._drawSmoke(ctx, c);
    this._drawLoot(ctx, c);
    this._drawExit(ctx, c);
    this._drawGuards(ctx, c);
    this._drawGhosts(ctx, c);
    this._drawPlayer(ctx, c);
    this._drawFlashes(ctx, c);
    this._drawVignette(ctx, W, H);
    this._drawGadgetBar(ctx, W, H);
    this._drawAlarms(ctx, W, H);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _px(x, y) { return { x: this.ox + x * this.cell, y: this.oy + y * this.cell }; }

  /**
   * The building. Walls are solid blocks with a lit top edge and a cast
   * shadow onto the floor below, so the plan reads as rooms seen from above
   * rather than a flat tilemap; the floor is marble with a faint vein per
   * tile, deterministic from its coordinates so it never crawls between
   * frames. Lamps in the room centres pool light on the stone.
   */
  _drawFloor(ctx, c) {
    // Marble first, walls on top, so wall shadows fall over finished floor.
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const t = this._at(x, y);
        if (t === WALL) continue;
        const p = this._px(x, y);
        const warm = (x * 7 + y * 13) % 5;
        ctx.fillStyle = (x + y) & 1 ? "#2b2742" : "#26223a";
        ctx.fillRect(p.x, p.y, c, c);
        // One vein per tile, its angle fixed by the tile's own coordinates.
        if (warm < 2 && c > 14) {
          const a = ((x * 31 + y * 17) % 100) / 100 * Math.PI;
          ctx.strokeStyle = "rgba(190,185,225,0.07)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x + c * 0.2, p.y + c * (0.3 + warm * 0.2));
          ctx.quadraticCurveTo(p.x + c * 0.5, p.y + c * 0.5 + Math.sin(a) * c * 0.2,
                               p.x + c * 0.85, p.y + c * (0.4 + warm * 0.25));
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,255,255,0.045)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, c - 1, c - 1);
      }
    }

    // Lamp pools: a soft warm light in each room, which is what makes the
    // dark corridors between them read as cover rather than as unlit filler.
    for (const l of this.lamps || []) {
      const p = this._px(l.x, l.y);
      const g = ctx.createRadialGradient(p.x + c / 2, p.y + c / 2, c * 0.2,
                                         p.x + c / 2, p.y + c / 2, c * l.r);
      g.addColorStop(0, "rgba(255,214,150,0.16)");
      g.addColorStop(1, "rgba(255,214,150,0)");
      ctx.fillStyle = g;
      ctx.fillRect(p.x - c * l.r, p.y - c * l.r, c * l.r * 2 + c, c * l.r * 2 + c);
    }

    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const t = this._at(x, y);
        const p = this._px(x, y);
        if (t === WALL) {
          // Wall body, a lit cap along the top and a darker foot, which is
          // the whole trick: three bands read as a solid block.
          ctx.fillStyle = "#15121f";
          ctx.fillRect(p.x, p.y, c, c);
          const cap = Math.max(2, c * 0.16);
          ctx.fillStyle = this._at(x, y - 1) === WALL ? "#1a1626" : "#221d33";
          ctx.fillRect(p.x, p.y, c, cap);
          ctx.fillStyle = "rgba(150,140,200,0.14)";
          ctx.fillRect(p.x, p.y, c, Math.max(1, c * 0.05));
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(p.x, p.y + c - Math.max(1, c * 0.07), c, Math.max(1, c * 0.07));
        } else if (t === DOOR) {
          ctx.fillStyle = "#43301c";
          ctx.fillRect(p.x, p.y, c, c);
          ctx.fillStyle = "#6b4826";
          ctx.fillRect(p.x + c * 0.1, p.y + c * 0.08, c * 0.8, c * 0.84);
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x + c * 0.22, p.y + c * 0.18, c * 0.56, c * 0.3);
          ctx.strokeRect(p.x + c * 0.22, p.y + c * 0.54, c * 0.56, c * 0.3);
          // Brass lock, the thing the pick is for.
          ctx.fillStyle = "#ffd76a";
          ctx.beginPath(); ctx.arc(p.x + c * 0.78, p.y + c / 2, Math.max(2, c * 0.075), 0, 7); ctx.fill();
        } else if (t === GLASS) {
          ctx.fillStyle = "rgba(120,200,240,0.14)";
          ctx.fillRect(p.x + 1, p.y + 1, c - 2, c - 2);
          ctx.strokeStyle = "rgba(160,220,255,0.42)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.x + 1.5, p.y + 1.5, c - 3, c - 3);
          // A diagonal highlight, so glass reads as glass and not as water.
          ctx.strokeStyle = "rgba(220,245,255,0.25)";
          ctx.beginPath();
          ctx.moveTo(p.x + c * 0.15, p.y + c * 0.85); ctx.lineTo(p.x + c * 0.85, p.y + c * 0.15);
          ctx.stroke();
        }
        // Shadow the floor takes from the wall beside it.
        if (t !== WALL) {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          if (this._at(x, y - 1) === WALL) ctx.fillRect(p.x, p.y, c, Math.max(2, c * 0.16));
          if (this._at(x - 1, y) === WALL) ctx.fillRect(p.x, p.y, Math.max(2, c * 0.13), c);
          if (this._at(x + 1, y) === WALL) {
            ctx.fillStyle = "rgba(0,0,0,0.16)";
            ctx.fillRect(p.x + c - Math.max(2, c * 0.1), p.y, Math.max(2, c * 0.1), c);
          }
        }
      }
    }
  }

  /**
   * Where the cones will be after your next step, hatched rather than filled
   * so it never competes with the live cones. Standing here is safe now and
   * fatal in one move, which is exactly the thing a plan turns on.
   */
  _drawDanger(ctx, c) {
    const danger = this._dangerNext();
    if (!danger.size) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,159,67,0.34)";
    ctx.lineWidth = 1;
    for (const key of danger) {
      const [x, y] = key.split(",").map(Number);
      const p = this._px(x, y);
      ctx.fillStyle = "rgba(255,159,67,0.07)";
      ctx.fillRect(p.x, p.y, c, c);
      // Diagonal hatching: reads as "pending" against the solid live cones.
      ctx.save();
      ctx.beginPath(); ctx.rect(p.x, p.y, c, c); ctx.clip();
      ctx.beginPath();
      for (let o = -c; o < c; o += Math.max(5, c * 0.28)) {
        ctx.moveTo(p.x + o, p.y + c);
        ctx.lineTo(p.x + o + c, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  _drawCones(ctx, c) {
    for (const g of this.guards) {
      const tiles = this._coneTiles(g);
      const col = g.alerted > 0 ? "255,215,106" : "255,84,112";
      for (const [x, y] of tiles) {
        const p = this._px(x, y);
        ctx.fillStyle = `rgba(${col},0.19)`;
        ctx.fillRect(p.x, p.y, c, c);
      }
      // Outline so the cone edge is unambiguous where two overlap.
      ctx.strokeStyle = `rgba(${col},0.5)`;
      ctx.lineWidth = 1.5;
      for (const [x, y] of tiles) {
        const p = this._px(x, y);
        for (const [dx, dy] of DIRS) {
          if (tiles.some(([tx, ty]) => tx === x + dx && ty === y + dy)) continue;
          ctx.beginPath();
          if (dx === 1) { ctx.moveTo(p.x + c, p.y); ctx.lineTo(p.x + c, p.y + c); }
          else if (dx === -1) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + c); }
          else if (dy === 1) { ctx.moveTo(p.x, p.y + c); ctx.lineTo(p.x + c, p.y + c); }
          else { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + c, p.y); }
          ctx.stroke();
        }
      }
    }
  }

  _drawSmoke(ctx, c) {
    for (const s of this.smokes) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        const p = this._px(s.x + dx, s.y + dy);
        ctx.fillStyle = `rgba(180,190,210,${0.24 + Math.sin(this.elapsed * 3 + dx + dy) * 0.06})`;
        ctx.beginPath();
        ctx.arc(p.x + c / 2, p.y + c / 2, c * 0.56, 0, 7);
        ctx.fill();
      }
    }
  }

  _drawLoot(ctx, c) {
    for (const l of this.loot) {
      if (l.taken) continue;
      const p = this._px(l.x, l.y);
      const bob = Math.sin(this.elapsed * 3 + l.x) * c * 0.05;
      ctx.save();
      ctx.translate(p.x + c / 2, p.y + c / 2 + bob);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, c * 0.5);
      g.addColorStop(0, "rgba(255,215,106,0.5)"); g.addColorStop(1, "rgba(255,215,106,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, c * 0.5, 0, 7); ctx.fill();
      // A small gem: two facets and a highlight.
      const r = c * 0.24;
      ctx.fillStyle = "#ffd76a";
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, -r * 0.25); ctx.lineTo(r * 0.6, r); ctx.lineTo(-r * 0.6, r);
      ctx.lineTo(-r, -r * 0.25);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.35, -r * 0.15); ctx.lineTo(-r * 0.35, -r * 0.15);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  _drawExit(ctx, c) {
    const p = this._px(this.exit.x, this.exit.y);
    const open = this.loot.every(l => l.taken);
    ctx.save();
    ctx.strokeStyle = open ? "#2ee6a6" : "rgba(46,230,166,0.3)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash(open ? [] : [5, 5]);
    ctx.strokeRect(p.x + 3, p.y + 3, c - 6, c - 6);
    ctx.setLineDash([]);
    if (open) {
      ctx.fillStyle = `rgba(46,230,166,${0.15 + Math.sin(this.elapsed * 4) * 0.1})`;
      ctx.fillRect(p.x + 3, p.y + 3, c - 6, c - 6);
    }
    // A doorway glyph rather than the word: on a phone a cell is barely
    // twenty pixels across and "EXIT" rendered as an unreadable smear that
    // overlapped whatever stood next to it.
    ctx.fillStyle = open ? "#2ee6a6" : "rgba(46,230,166,0.45)";
    const dw = c * 0.34, dh = c * 0.46;
    const dx0 = p.x + (c - dw) / 2, dy0 = p.y + (c - dh) / 2;
    ctx.fillRect(dx0, dy0, dw, dh);
    ctx.fillStyle = "#0a0812";
    ctx.fillRect(dx0 + dw * 0.18, dy0 + dh * 0.16, dw * 0.64, dh * 0.84);
    if (open) {
      // An arrow through the doorway once it is unlocked.
      ctx.strokeStyle = "#2ee6a6";
      ctx.lineWidth = Math.max(1.4, c * 0.06);
      ctx.beginPath();
      ctx.moveTo(p.x + c * 0.5, p.y + c * 0.78);
      ctx.lineTo(p.x + c * 0.5, p.y + c * 0.36);
      ctx.moveTo(p.x + c * 0.38, p.y + c * 0.47);
      ctx.lineTo(p.x + c * 0.5, p.y + c * 0.34);
      ctx.lineTo(p.x + c * 0.62, p.y + c * 0.47);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A guard: coat, peaked cap, and a lantern held out in the direction it is
   * facing. The lantern is the point — it puts a light source at the near end
   * of the cone, so the wedge on the floor reads as something the guard is
   * casting rather than an abstract overlay.
   */
  _drawGuards(ctx, c) {
    for (const g of this.guards) {
      const p = this._px(g.x, g.y);
      const cx = p.x + c / 2, cy = p.y + c / 2;
      const [dx, dy] = DIRS[g.dir];
      const alert = g.alerted > 0;

      // Lantern glow on the floor at the guard's feet.
      const lg = ctx.createRadialGradient(cx + dx * c * 0.3, cy + dy * c * 0.3, 1,
                                          cx + dx * c * 0.3, cy + dy * c * 0.3, c * 0.9);
      lg.addColorStop(0, alert ? "rgba(255,215,106,0.30)" : "rgba(255,140,150,0.22)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(cx - c, cy - c, c * 2, c * 2);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath(); ctx.ellipse(0, c * 0.31, c * 0.29, c * 0.1, 0, 0, 7); ctx.fill();

      // Long coat, flared at the hem.
      const coat = alert ? "#e0a83c" : "#a83f57";
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.moveTo(-c * 0.23, c * 0.29);
      ctx.lineTo(-c * 0.17, -c * 0.07);
      ctx.lineTo(c * 0.17, -c * 0.07);
      ctx.lineTo(c * 0.23, c * 0.29);
      ctx.closePath(); ctx.fill();
      // Lit side, so the figure has a light direction of its own.
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.moveTo(-c * 0.23, c * 0.29);
      ctx.lineTo(-c * 0.17, -c * 0.07);
      ctx.lineTo(-c * 0.04, -c * 0.07);
      ctx.lineTo(-c * 0.07, c * 0.29);
      ctx.closePath(); ctx.fill();
      // Belt.
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(-c * 0.2, c * 0.08, c * 0.4, Math.max(1.5, c * 0.06));

      // Head and peaked cap.
      ctx.fillStyle = "#e8c6a8";
      ctx.beginPath(); ctx.arc(0, -c * 0.17, c * 0.135, 0, 7); ctx.fill();
      ctx.fillStyle = "#231d31";
      ctx.beginPath(); ctx.arc(0, -c * 0.2, c * 0.15, Math.PI, 0); ctx.fill();
      ctx.fillRect(-c * 0.19, -c * 0.22, c * 0.38, Math.max(1.5, c * 0.05));
      ctx.fillStyle = alert ? "#ffd76a" : "#7b8098";
      ctx.fillRect(-c * 0.04, -c * 0.3, c * 0.08, c * 0.05);

      // Lantern, held out the way the guard looks.
      const lx = dx * c * 0.29, ly = dy * c * 0.29 + c * 0.02;
      ctx.strokeStyle = "rgba(230,220,240,0.5)"; ctx.lineWidth = Math.max(1, c * 0.035);
      ctx.beginPath(); ctx.moveTo(0, c * 0.02); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = alert ? "#ffe9a8" : "#ffd0a0";
      ctx.beginPath(); ctx.arc(lx, ly, Math.max(2, c * 0.09), 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(60,50,40,0.7)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(lx, ly, Math.max(2, c * 0.09), 0, 7); ctx.stroke();
      ctx.restore();

      // "!" over an alerted guard, so the yellow cone has a cause on screen.
      if (alert) {
        ctx.fillStyle = "#ffd76a";
        ctx.font = `900 ${Math.max(10, c * 0.4)}px 'Sora', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("!", cx, cy - c * 0.44 + Math.sin(this.elapsed * 6) * c * 0.04);
      }
    }
  }

  /** A ghost of every guard where it will stand after your next step. */
  _drawGhosts(ctx, c) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    for (const g of this.guards) {
      const n = this._guardNext(g);
      if (n.x === g.x && n.y === g.y && n.dir === g.dir) continue;
      const p = this._px(n.x, n.y);
      const [dx, dy] = DIRS[n.dir];
      ctx.strokeStyle = "#ff9f43";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(p.x + c * 0.18, p.y + c * 0.18, c * 0.64, c * 0.64);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(p.x + c / 2, p.y + c / 2);
      ctx.lineTo(p.x + c / 2 + dx * c * 0.34, p.y + c / 2 + dy * c * 0.34);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPlayer(ctx, c) {
    const p = this._px(this.player.x, this.player.y);
    const cx = p.x + c / 2, cy = p.y + c / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath(); ctx.ellipse(0, c * 0.3, c * 0.28, c * 0.1, 0, 0, 7); ctx.fill();
    // A hooded figure in dark blue: reads as "you" against the red guards.
    ctx.fillStyle = "#2a3a6b";
    ctx.beginPath();
    ctx.moveTo(-c * 0.2, c * 0.28);
    ctx.quadraticCurveTo(-c * 0.24, -c * 0.14, 0, -c * 0.26);
    ctx.quadraticCurveTo(c * 0.24, -c * 0.14, c * 0.2, c * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#0d1226";
    ctx.beginPath(); ctx.arc(0, -c * 0.13, c * 0.12, 0, 7); ctx.fill();
    ctx.fillStyle = "#7cf0d0";
    ctx.beginPath(); ctx.arc(-c * 0.045, -c * 0.14, c * 0.028, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(c * 0.045, -c * 0.14, c * 0.028, 0, 7); ctx.fill();
    ctx.restore();
    // Ring when standing on a watched tile — should never happen, but if the
    // rules ever let it, it must be visible rather than silent.
    if (this._seen(this.player.x, this.player.y)) {
      ctx.strokeStyle = "#ff5470"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.42, 0, 7); ctx.stroke();
    }
  }

  _drawFlashes(ctx, c) {
    for (const f of this.flashes) {
      const p = this._px(f.x, f.y);
      const k = f.t / 0.6;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(p.x + c / 2, p.y + c / 2, c * 0.3 + k * c * 1.6, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _gadgetBar() {
    const W = this.viewW, H = this.viewH;
    const w = Math.min(110, (W - 24) / 3 - 6);
    const total = 3 * w + 12;
    const x0 = (W - total) / 2;
    return GADGETS.map((g, i) => ({ i, g, x: x0 + i * (w + 6), y: H - 42, w, h: 32 }));
  }

  _drawGadgetBar(ctx, W, H) {
    for (const b of this._gadgetBar()) {
      const n = this.gadgets[b.g.id];
      const on = this.armed === b.g.id;
      ctx.globalAlpha = n > 0 ? 1 : 0.3;
      ctx.fillStyle = on ? hexA(b.g.color, 0.8) : "rgba(20,17,32,0.9)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.fill();
      ctx.strokeStyle = on ? "#ffffff" : hexA(b.g.color, 0.5);
      ctx.lineWidth = on ? 2 : 1.2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 9); ctx.stroke();
      ctx.fillStyle = on ? "#0b0a12" : b.g.color;
      ctx.font = "800 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${b.i + 1} ${b.g.name.split(" ")[0].toUpperCase()}`, b.x + b.w / 2, b.y + 14);
      ctx.fillStyle = on ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.65)";
      ctx.font = "700 10px 'Inter', system-ui, sans-serif";
      ctx.fillText(`×${n}`, b.x + b.w / 2, b.y + 26);
      ctx.globalAlpha = 1;
    }
  }

  /** Darkens the edges of the plan, which is what sells "at night". */
  _drawVignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34,
                                       W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Red wash on a rewind, fading out over the turn after it.
    if (this.pulse > 0) {
      ctx.fillStyle = `rgba(255,84,112,${this.pulse * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /**
   * Three pips top-right. A number in the HUD is easy to miss mid-heist; a
   * pip going dark while the screen flashes red is not.
   */
  _drawAlarms(ctx, W, H) {
    const r = 5, gap = 15;
    const x0 = W - 14 - (ALARMS - 1) * gap;
    ctx.save();
    ctx.textAlign = "right";
    ctx.font = "800 9px 'Inter', system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText("ALARMS", W - 14, 12);
    for (let i = 0; i < ALARMS; i++) {
      const spent = i < this.alarms;
      ctx.beginPath();
      ctx.arc(x0 + i * gap, 24, r, 0, 7);
      ctx.fillStyle = spent ? "#ff5470" : "rgba(255,255,255,0.10)";
      ctx.fill();
      ctx.strokeStyle = spent ? "#ff8ba0" : "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.4);
    ctx.textAlign = "center";
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 14px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, 20);
    ctx.globalAlpha = 1;
  }
}

/**
 * One patrol step, and one sight cone. Both live at module scope because the
 * generator has to run the exact same rules as the game does: the level check
 * below proves a vault is beatable, and that proof is only worth anything if
 * the guards it simulates behave like the guards you will actually meet.
 */
function guardNext(g, blocked) {
  if (g.alerted > 0) {
    // While alerted the guard abandons the patrol and walks at the noise.
    const tx = g.lure?.x ?? g.x, ty = g.lure?.y ?? g.y;
    const options = DIRS
      .map(([dx, dy], d) => ({ d, x: g.x + dx, y: g.y + dy }))
      .filter(o => !blocked(o.x, o.y))
      .sort((a, b) => (Math.abs(a.x - tx) + Math.abs(a.y - ty)) - (Math.abs(b.x - tx) + Math.abs(b.y - ty)));
    const alerted = g.alerted - 1;
    if (!options.length) return { ...g, alerted, lure: alerted ? g.lure : null };
    return { ...g, alerted, lure: alerted ? g.lure : null, dir: options[0].d, x: options[0].x, y: options[0].y };
  }
  // Patrol: a fixed loop of waypoints, turning to face the way it walks.
  if (!g.path || g.path.length < 2) return { ...g, dir: (g.dir + (g.spin || 0)) % 4 };
  const target = g.path[(g.i + 1) % g.path.length];
  if (g.x === target.x && g.y === target.y) return { ...g, i: (g.i + 1) % g.path.length };
  const dx = Math.sign(target.x - g.x), dy = Math.sign(target.y - g.y);
  const nx = g.x + (dx !== 0 ? dx : 0), ny = g.y + (dx !== 0 ? 0 : dy);
  if (blocked(nx, ny)) return { ...g, i: (g.i + 1) % g.path.length };
  return { ...g, x: nx, y: ny, dir: dx !== 0 ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0) };
}

function coneTiles(g, opaque, smokes = []) {
  const out = [];
  const blind = (x, y) => smokes.some(s => Math.abs(s.x - x) + Math.abs(s.y - y) <= 1);
  const [dx, dy] = DIRS[g.dir];
  for (let d = 1; d <= g.range; d++) {
    const cx = g.x + dx * d, cy = g.y + dy * d;
    if (opaque(cx, cy) || blind(cx, cy)) break;
    const spread = Math.floor((d - 1) / 2);
    for (let s = -spread; s <= spread; s++) {
      const px = cx + (dx ? 0 : s), py = cy + (dx ? s : 0);
      if (opaque(px, py) || blind(px, py)) continue;
      out.push([px, py]);
    }
  }
  return out;
}

/**
 * Does a clean route through this vault exist at all?
 *
 * Eleven of the twenty-four vaults used to be impossible. The old generator
 * checked that the loot and exit could be *walked* to and stopped there, which
 * says nothing about whether the walk survives six patrolling cones — on the
 * later floors the cones covered every neighbouring tile from turn one.
 *
 * Guards are deterministic and take exactly one step per player action, so the
 * danger set for every turn can be precomputed and the whole thing becomes a
 * breadth-first search over (tile, turn, loot collected). Waiting is one of the
 * moves, doors are treated as walls and gadgets are ignored, so anything this
 * proves is beatable is beatable the hard way, with the lures and picks left
 * over as slack. Returns the optimal turn count, which the game shows as par.
 */
function solveVault({ map, w, h, start, exit, loot, guards }, horizon = 220) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? WALL : map[y * w + x]);
  const opaque = (x, y) => at(x, y) === WALL || at(x, y) === DOOR;
  const blocked = opaque;

  let live = guards.map(g => ({ ...g, i: 0 }));
  const danger = [];
  for (let t = 0; t <= horizon; t++) {
    const set = new Set();
    for (const g of live) for (const [x, y] of coneTiles(g, opaque)) set.add(y * w + x);
    danger.push(set);
    live = live.map(g => guardNext(g, blocked));
  }

  const startI = start.y * w + start.x;
  if (danger[0].has(startI)) return { solvable: false, par: 0 };

  const lootAt = new Map(loot.map((l, k) => [l.y * w + l.x, k]));
  const exitI = exit.y * w + exit.x;
  const full = (1 << loot.length) - 1;
  const seen = new Set([`${startI},0,0`]);
  let frontier = [[startI, 0, 0]];

  while (frontier.length) {
    const next = [];
    for (const [pi, t, mask] of frontier) {
      if (t >= horizon) continue;
      const px = pi % w, py = (pi - px) / w;
      // Standing still is a move, which is what makes waiting out a patrol a
      // real option rather than a two-step shuffle.
      for (const [dx, dy] of [[0, 0], ...DIRS]) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (blocked(nx, ny)) continue;
        const ni = ny * w + nx;
        if (danger[t + 1].has(ni)) continue;
        let nmask = mask;
        if (lootAt.has(ni)) nmask |= 1 << lootAt.get(ni);
        if (ni === exitI && nmask === full) return { solvable: true, par: t + 1 };
        const key = `${ni},${t + 1},${nmask}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push([ni, t + 1, nmask]);
      }
    }
    frontier = next;
  }
  return { solvable: false, par: 0 };
}

/**
 * Builds vault `i`. Rooms are carved into a grid, guards get patrol loops
 * along corridors, and the whole thing is validated: the start must reach
 * every piece of loot and the exit, or the layout is thrown away and
 * regenerated. A stealth level that cannot be walked is not a hard level.
 */
function buildVault(i) {
  const rng = seededRng(`vault-v1-${i}`);
  // Rooms grow faster than the garrison does. Six guards on an eleven-wide
  // map was the shape that made the late vaults impossible: cones covered
  // every tile, and difficulty stopped being about routing.
  const w = 12 + Math.min(8, Math.floor(i / 3));
  const h = 10 + Math.min(7, Math.floor(i / 3));
  const lootN = 1 + Math.min(4, Math.floor(i / 5));
  const guardN = 1 + Math.min(4, Math.floor(i / 4));
  const doorN = i < 6 ? 0 : Math.min(3, Math.floor((i - 4) / 6));

  for (let attempt = 0; attempt < 260; attempt++) {
    const map = new Uint8Array(w * h).fill(WALL);
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? WALL : map[y * w + x]);
    const set = (x, y, v) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) map[y * w + x] = v; };

    // Carve rooms, then join their centres with L-corridors.
    const rooms = [];
    const roomN = 3 + Math.floor(rng() * 3) + Math.floor(i / 8);
    for (let r = 0; r < roomN; r++) {
      const rw = 2 + Math.floor(rng() * 3), rh = 2 + Math.floor(rng() * 3);
      const rx = 1 + Math.floor(rng() * (w - rw - 2));
      const ry = 1 + Math.floor(rng() * (h - rh - 2));
      for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) set(x, y, FLOOR);
      rooms.push({ x: rx + (rw >> 1), y: ry + (rh >> 1) });
    }
    for (let r = 1; r < rooms.length; r++) {
      const a = rooms[r - 1], b = rooms[r];
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) set(x, a.y, FLOOR);
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) set(b.x, y, FLOOR);
    }

    const open = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (map[y * w + x] === FLOOR) open.push({ x, y });
    if (open.length < 18 + lootN * 3) continue;

    const start = open[Math.floor(rng() * open.length)];
    // Exit as far from the start as the map allows.
    let exit = open[0];
    for (const o of open) {
      if (Math.abs(o.x - start.x) + Math.abs(o.y - start.y) >
          Math.abs(exit.x - start.x) + Math.abs(exit.y - start.y)) exit = o;
    }
    if (Math.abs(exit.x - start.x) + Math.abs(exit.y - start.y) < 6) continue;

    const used = new Set([`${start.x},${start.y}`, `${exit.x},${exit.y}`]);
    const loot = [];
    for (let k = 0; k < lootN; k++) {
      for (let t = 0; t < 80; t++) {
        const o = open[Math.floor(rng() * open.length)];
        const key = `${o.x},${o.y}`;
        if (used.has(key)) continue;
        if (Math.abs(o.x - start.x) + Math.abs(o.y - start.y) < 3) continue;
        used.add(key);
        loot.push({ x: o.x, y: o.y });
        break;
      }
    }
    if (loot.length < lootN) continue;

    // Locked doors on corridor squares, never on a room centre.
    const doors = [];
    for (let k = 0; k < doorN; k++) {
      for (let t = 0; t < 80; t++) {
        const o = open[Math.floor(rng() * open.length)];
        const key = `${o.x},${o.y}`;
        if (used.has(key)) continue;
        const horiz = at(o.x - 1, o.y) === FLOOR && at(o.x + 1, o.y) === FLOOR &&
                      at(o.x, o.y - 1) === WALL && at(o.x, o.y + 1) === WALL;
        const vert = at(o.x, o.y - 1) === FLOOR && at(o.x, o.y + 1) === FLOOR &&
                     at(o.x - 1, o.y) === WALL && at(o.x + 1, o.y) === WALL;
        if (!horiz && !vert) continue;
        used.add(key);
        doors.push(o);
        map[o.y * w + o.x] = DOOR;
        break;
      }
    }

    // Guards patrol between two open tiles a few squares apart.
    const guards = [];
    for (let k = 0; k < guardN; k++) {
      for (let t = 0; t < 90; t++) {
        const a = open[Math.floor(rng() * open.length)];
        if (used.has(`${a.x},${a.y}`)) continue;
        if (Math.abs(a.x - start.x) + Math.abs(a.y - start.y) < 4) continue;
        // Straight run in one axis, so the patrol is legible.
        const horiz = rng() < 0.5;
        let len = 0;
        while (len < 5 && at(a.x + (horiz ? len + 1 : 0), a.y + (horiz ? 0 : len + 1)) === FLOOR) len++;
        if (len < 2) continue;
        const b = { x: a.x + (horiz ? len : 0), y: a.y + (horiz ? 0 : len) };
        used.add(`${a.x},${a.y}`);
        guards.push({
          x: a.x, y: a.y, dir: horiz ? 1 : 2,
          path: [{ x: a.x, y: a.y }, b],
          range: 3 + (i > 14 ? 1 : 0),
        });
        break;
      }
    }
    if (guards.length < guardN) continue;

    // The start tile must not already be inside a cone: three of the
    // twenty-four vaults were generated lost before the first move.
    const watched = (px, py) => guards.some(g => {
      const [dx, dy] = DIRS[g.dir];
      for (let d = 1; d <= g.range; d++) {
        const cx = g.x + dx * d, cy = g.y + dy * d;
        if (at(cx, cy) === WALL || at(cx, cy) === DOOR) break;
        const spread = Math.floor((d - 1) / 2);
        for (let sp = -spread; sp <= spread; sp++) {
          const tx = cx + (dx ? 0 : sp), ty = cy + (dx ? sp : 0);
          if (at(tx, ty) === WALL || at(tx, ty) === DOOR) continue;
          if (tx === px && ty === py) return true;
        }
      }
      return false;
    });
    if (watched(start.x, start.y)) continue;
    // Nor should the exit be permanently parked under a cone, which would
    // make the last step a coin flip rather than a plan.
    if (watched(exit.x, exit.y)) continue;

    // Reachability: everything must be walkable from the start, treating
    // locked doors as passable since the pick opens them.
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length) {
      const c = queue.shift();
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx, ny = c.y + dy;
        const t = at(nx, ny);
        if (t === WALL) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    if (!seen.has(`${exit.x},${exit.y}`)) continue;
    if (!loot.every(l => seen.has(`${l.x},${l.y}`))) continue;
    // Enough picks for every locked door, plus the gadgets the floor grants.
    const gadgets = {
      lure: 1 + Math.floor(i / 8),
      smoke: i < 4 ? 0 : 1 + Math.floor(i / 10),
      pick: doors.length,
    };
    // A lamp over each room centre that survived as floor. Purely lighting,
    // but it is what separates "rooms and corridors" from "carved noise".
    const lamps = rooms
      .filter(r => at(r.x, r.y) === FLOOR)
      .map(r => ({ x: r.x, y: r.y, r: 2.4 + rng() * 1.2 }));

    // The gate. Everything above only proves the vault can be *walked*; this
    // proves it can be *stolen from*, guards and all. A layout that fails here
    // is thrown away and the seed rolls on.
    const proof = solveVault({ map, w, h, start, exit, loot, guards });
    if (!proof.solvable) continue;
    // A vault that falls out in four moves is not a puzzle either.
    if (proof.par < 6 + Math.min(10, i)) continue;

    return { map, w, h, start, exit, loot, guards, gadgets, lamps, par: proof.par };
  }

  // Fallback: an open room with one guard, always walkable.
  const map = new Uint8Array(w * h).fill(WALL);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) map[y * w + x] = FLOOR;
  return {
    map, w, h,
    start: { x: 1, y: 1 },
    exit: { x: w - 2, y: h - 2 },
    loot: [{ x: w >> 1, y: h >> 1 }],
    guards: [{ x: w - 3, y: 1, dir: 2, path: [{ x: w - 3, y: 1 }, { x: w - 3, y: h - 3 }], range: 3 }],
    gadgets: { lure: 1, smoke: 1, pick: 0 },
    lamps: [{ x: w >> 1, y: h >> 1, r: 3 }],
    par: w + h,
  };
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

export default ShadowVaultGame;
