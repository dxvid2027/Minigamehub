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
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, seededRng } from "../core/utils.js";

const LEVELS = 24;
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
      "Arrow keys or WASD move one tile. Nothing happens until you move — every guard steps when you do.",
      "The shaded wedges are what the guards can see. Ending your move inside one is caught.",
      "Take every piece of loot, then reach the green exit. Loot left behind is loot you do not get paid for.",
      "Guards walk fixed patrols and turn at the ends. Their next facing is drawn faintly, so a route can be planned rather than guessed.",
      "Three gadgets: a lure to pull guards away, smoke to blind a corridor for two turns, and a pick for locked doors. Press 1, 2, 3 then click a tile.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "D-pad to step. Tap a gadget then a tile to use it."; }
  getKeyboardHint() { return "Arrows / WASD to step, 1-3 for gadgets, R to restart the vault."; }
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

  onPlayPressed() { audioManager.play("click"); this.openVaults(); }

  openVaults() {
    const store = this._store();
    const grid = el("div", { class: "orb-grid" });
    for (let i = 0; i < LEVELS; i++) {
      const open = this._unlocked(i);
      const done = store.cleared[i];
      grid.appendChild(el("button", {
        class: `orb-card${open ? "" : " locked"}${done ? " perfect" : ""}`,
        disabled: !open,
        onClick: () => { closeModal(); this.levelIdx = i; this.start(); },
      }, [
        el("span", { class: "n" }, String(i + 1)),
        el("span", { class: "st" }, open ? (done ? `${done} turns` : "Open") : "Locked"),
      ]));
    }
    openModal({
      title: "Vaults",
      bodyNode: el("div", { class: "orb-picker" }, [
        el("p", { class: "zone-intro" }, "Twenty-four vaults, each one a fixed puzzle. Guards, loot and walls are the same every time you come back."),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
    });
  }

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
    for (let i = 1; i <= 3; i++) this.input.onKey(`Digit${i}`, () => this._armGadget(i - 1));
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    this.levelIdx = 0;
    this._dpadHeld = [false, false, false, false];
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
    this.gadgets = { lure: L.gadgets.lure, smoke: L.gadgets.smoke, pick: L.gadgets.pick };
    this.armed = null;
    this.smokes = [];
    this.turns = 0;
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
    if (!this.armed) return;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    if (Math.abs(x - this.player.x) + Math.abs(y - this.player.y) > 6) { this._say("Too far to throw", "#ff5470"); return; }
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

  /** Guards step, then vision is resolved. Order matters: they move first. */
  _endTurn() {
    this.turns++;
    for (const s of this.smokes) s.turns--;
    this.smokes = this.smokes.filter(s => s.turns > 0);

    for (const g of this.guards) {
      if (g.alerted > 0) {
        g.alerted--;
        // Walk one tile toward the lure, ignoring the patrol while alerted.
        const tx = g.lure?.x ?? g.x, ty = g.lure?.y ?? g.y;
        const options = DIRS
          .map(([dx, dy], d) => ({ d, x: g.x + dx, y: g.y + dy }))
          .filter(o => !this._blocked(o.x, o.y))
          .sort((a, b) => (Math.abs(a.x - tx) + Math.abs(a.y - ty)) - (Math.abs(b.x - tx) + Math.abs(b.y - ty)));
        if (options.length) { g.dir = options[0].d; g.x = options[0].x; g.y = options[0].y; }
        if (g.alerted === 0) g.lure = null;
        continue;
      }
      // Patrol: a fixed loop of waypoints, turning to face the way it walks.
      if (!g.path || g.path.length < 2) { g.dir = (g.dir + (g.spin || 0)) % 4; continue; }
      const target = g.path[(g.i + 1) % g.path.length];
      if (g.x === target.x && g.y === target.y) { g.i = (g.i + 1) % g.path.length; continue; }
      const dx = Math.sign(target.x - g.x), dy = Math.sign(target.y - g.y);
      const nx = g.x + (dx !== 0 ? dx : 0), ny = g.y + (dx !== 0 ? 0 : dy);
      if (!this._blocked(nx, ny)) {
        g.dir = dx !== 0 ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        g.x = nx; g.y = ny;
      } else {
        g.i = (g.i + 1) % g.path.length;
      }
    }

    if (this._seen(this.player.x, this.player.y)) { this._catch(); return; }

    // Exit only opens once the vault is empty.
    if (this.player.x === this.exit.x && this.player.y === this.exit.y) {
      if (this.loot.every(l => l.taken)) this._clear();
      else this._say(`${this.loot.filter(l => !l.taken).length} still to take`, "#ffd76a");
    }
    this._updateHud();
  }

  /** Is a tile inside any guard's cone right now? */
  _seen(x, y) {
    for (const g of this.guards) if (this._sees(g, x, y)) return true;
    return false;
  }

  /**
   * A cone: `range` tiles ahead, widening by one tile of lateral spread per
   * tile of depth, stopped by anything opaque and by smoke.
   */
  _sees(g, x, y) {
    const [dx, dy] = DIRS[g.dir];
    for (let d = 1; d <= g.range; d++) {
      const cx = g.x + dx * d, cy = g.y + dy * d;
      if (this._opaque(cx, cy)) break;
      if (this.smokes.some(s => Math.abs(s.x - cx) + Math.abs(s.y - cy) <= 1)) break;
      const spread = Math.floor((d - 1) / 2);
      for (let s = -spread; s <= spread; s++) {
        const px = cx + (dx ? 0 : s), py = cy + (dx ? s : 0);
        if (this._opaque(px, py)) continue;
        if (this.smokes.some(sm => Math.abs(sm.x - px) + Math.abs(sm.y - py) <= 1)) continue;
        if (px === x && py === y) return true;
      }
    }
    return false;
  }

  _coneTiles(g) {
    const out = [];
    const [dx, dy] = DIRS[g.dir];
    for (let d = 1; d <= g.range; d++) {
      const cx = g.x + dx * d, cy = g.y + dy * d;
      if (this._opaque(cx, cy)) break;
      if (this.smokes.some(s => Math.abs(s.x - cx) + Math.abs(s.y - cy) <= 1)) break;
      const spread = Math.floor((d - 1) / 2);
      for (let s = -spread; s <= spread; s++) {
        const px = cx + (dx ? 0 : s), py = cy + (dx ? s : 0);
        if (this._opaque(px, py)) continue;
        if (this.smokes.some(sm => Math.abs(sm.x - px) + Math.abs(sm.y - py) <= 1)) continue;
        out.push([px, py]);
      }
    }
    return out;
  }

  _catch() {
    this.caught = true;
    audioManager.play("gameover");
    this.shake();
    this.endGame({
      result: "loss", score: this.score,
      message: `Spotted on turn ${this.turns}. ${this.loot.filter(l => l.taken).length} of ${this.loot.length} pieces were already in the bag.`,
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
        : `Vault ${this.levelIdx + 1} cleaned out in ${this.turns} turns.`,
      extraStats: [
        { label: "Turns", value: this.turns },
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
      Turns: this.turns,
      Gadgets: this.gadgets.lure + this.gadgets.smoke + this.gadgets.pick,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].t += dt;
      if (this.flashes[i].t > 0.6) this.flashes.splice(i, 1);
    }
    // The d-pad reports held keys, so a step fires once per press.
    const map = [["ArrowUp", "KeyW"], ["ArrowRight", "KeyD"], ["ArrowDown", "KeyS"], ["ArrowLeft", "KeyA"]];
    map.forEach((codes, d) => {
      const down = this.input.isDown(...codes);
      if (down && !this._dpadHeld[d]) this._step(d);
      this._dpadHeld[d] = down;
    });
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
    this._drawCones(ctx, c);
    this._drawSmoke(ctx, c);
    this._drawLoot(ctx, c);
    this._drawExit(ctx, c);
    this._drawGuards(ctx, c);
    this._drawPlayer(ctx, c);
    this._drawFlashes(ctx, c);
    this._drawGadgetBar(ctx, W, H);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _px(x, y) { return { x: this.ox + x * this.cell, y: this.oy + y * this.cell }; }

  _drawFloor(ctx, c) {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const t = this._at(x, y);
        const p = this._px(x, y);
        if (t === WALL) {
          // Walls read darker than the floor. The other way round — which is
          // how this first went in — turned the map into light bands where
          // the playable route was the hard part to find.
          ctx.fillStyle = "#0a0813";
          ctx.fillRect(p.x, p.y, c, c);
          ctx.fillStyle = "rgba(120,110,170,0.10)";
          ctx.fillRect(p.x, p.y, c, Math.max(2, c * 0.12));
        } else if (t === DOOR) {
          ctx.fillStyle = "#5c3a1e";
          ctx.fillRect(p.x + 1, p.y + 1, c - 2, c - 2);
          ctx.fillStyle = "#ffd76a";
          ctx.beginPath(); ctx.arc(p.x + c * 0.72, p.y + c / 2, Math.max(2, c * 0.08), 0, 7); ctx.fill();
        } else if (t === GLASS) {
          ctx.fillStyle = "rgba(120,200,240,0.16)";
          ctx.fillRect(p.x + 1, p.y + 1, c - 2, c - 2);
          ctx.strokeStyle = "rgba(160,220,255,0.4)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(p.x + 1.5, p.y + 1.5, c - 3, c - 3);
        } else {
          // Checkerboard marble, lit enough to read as the walkable floor.
          ctx.fillStyle = (x + y) & 1 ? "#2e2846" : "#28233d";
          ctx.fillRect(p.x, p.y, c, c);
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x + 0.5, p.y + 0.5, c - 1, c - 1);
          // A rim where the floor meets a wall, which is what gives the plan
          // its depth rather than reading as a flat tilemap.
          ctx.fillStyle = "rgba(0,0,0,0.32)";
          if (this._at(x, y - 1) === WALL) ctx.fillRect(p.x, p.y, c, Math.max(2, c * 0.14));
          if (this._at(x - 1, y) === WALL) ctx.fillRect(p.x, p.y, Math.max(2, c * 0.12), c);
        }
      }
    }
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
    ctx.fillStyle = open ? "#2ee6a6" : "rgba(46,230,166,0.4)";
    ctx.font = `800 ${Math.max(8, c * 0.28)}px 'Inter', system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("EXIT", p.x + c / 2, p.y + c * 0.62);
    ctx.restore();
  }

  _drawGuards(ctx, c) {
    for (const g of this.guards) {
      const p = this._px(g.x, g.y);
      const cx = p.x + c / 2, cy = p.y + c / 2;
      ctx.save();
      ctx.translate(cx, cy);
      // Body.
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.ellipse(0, c * 0.3, c * 0.3, c * 0.1, 0, 0, 7); ctx.fill();
      ctx.fillStyle = g.alerted > 0 ? "#ffd76a" : "#c9556f";
      ctx.beginPath();
      ctx.moveTo(-c * 0.22, c * 0.28);
      ctx.lineTo(-c * 0.18, -c * 0.06);
      ctx.lineTo(c * 0.18, -c * 0.06);
      ctx.lineTo(c * 0.22, c * 0.28);
      ctx.closePath(); ctx.fill();
      // Head + peaked cap.
      ctx.fillStyle = "#e8c6a8";
      ctx.beginPath(); ctx.arc(0, -c * 0.16, c * 0.14, 0, 7); ctx.fill();
      ctx.fillStyle = "#2a2438";
      ctx.beginPath(); ctx.arc(0, -c * 0.19, c * 0.15, Math.PI, 0); ctx.fill();
      ctx.fillRect(-c * 0.18, -c * 0.21, c * 0.36, c * 0.05);
      // Facing arrow, so the cone direction is readable even where it is cut off.
      const [dx, dy] = DIRS[g.dir];
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(dx * c * 0.12, dy * c * 0.12 - c * 0.04);
      ctx.lineTo(dx * c * 0.3, dy * c * 0.3 - c * 0.04);
      ctx.stroke();
      ctx.restore();
    }
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
 * Builds vault `i`. Rooms are carved into a grid, guards get patrol loops
 * along corridors, and the whole thing is validated: the start must reach
 * every piece of loot and the exit, or the layout is thrown away and
 * regenerated. A stealth level that cannot be walked is not a hard level.
 */
function buildVault(i) {
  const rng = seededRng(`vault-v1-${i}`);
  const w = 11 + Math.min(6, Math.floor(i / 4));
  const h = 9 + Math.min(5, Math.floor(i / 5));
  const lootN = 1 + Math.min(4, Math.floor(i / 5));
  const guardN = 1 + Math.min(5, Math.floor(i / 3));
  const doorN = i < 6 ? 0 : Math.min(3, Math.floor((i - 4) / 6));

  for (let attempt = 0; attempt < 60; attempt++) {
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
          range: 3 + (i > 10 ? 1 : 0) + (rng() < 0.3 ? 1 : 0),
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
    return { map, w, h, start, exit, loot, guards, gadgets };
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
