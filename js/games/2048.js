// ==========================================================================
// 2048 — slide and merge numbered tiles, with combos.
//
// Tiles are tracked by identity so they really slide: each one is a DOM node
// that moves with a transform, two that merge travel to the same cell before
// one disappears, and the survivor pops with its new value.
//
// Combos keep a long game alive:
//   • a merge that makes 32 or more (16 + 16 and up) is a COMBO — it blasts
//     the smallest tile elsewhere on the board off it;
//   • 128 or more, or two big merges in one move, is a MEGA COMBO and blasts
//     two tiles;
//   • merging on consecutive moves builds a streak that multiplies the score.
// Blasted tiles score double their value and free up room to keep going.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, randInt } from "../core/utils.js";
import { toast } from "../ui/toast.js";

const SIZE = 4;
const SLIDE_MS = 120;
const TILE_COLORS = {
  2: ["#2a2f4d", "#eef1ff"], 4: ["#2f3a5a", "#eef1ff"], 8: ["#ff9f43", "#1a0d00"], 16: ["#ff7f43", "#1a0d00"],
  32: ["#ff5470", "#200008"], 64: ["#ff4fd8", "#1c0016"], 128: ["#7c5cff", "#0e0526"], 256: ["#6a4bff", "#0e0526"],
  512: ["#22d3ee", "#00181c"], 1024: ["#2ee6a6", "#00190f"], 2048: ["#ffd76a", "#231800"], 4096: ["#fff", "#000"],
};
const COMBO_MIN = 32;      // 16 + 16
const MEGA_MIN = 128;

let nextId = 1;

export class Game2048 extends GameBase {
  getDifficulties() { return ["Normal"]; }
  getInstructions() {
    return [
      "Slide all tiles with arrow keys, WASD or a swipe. Two tiles with the same number merge.",
      "COMBO: merging 16 + 16 or higher blasts the smallest tile elsewhere off the board.",
      "MEGA COMBO: a 128 or bigger, or two big merges in one move, blasts two tiles.",
      "Merge on every move to build a streak — each step adds 10% to the points you score.",
      "Blasted tiles score double and make room, so you can keep going far past 2048.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Swipe in any direction to slide the tiles."; }
  getKeyboardHint() { return "Arrow keys or WASD to slide the tiles."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid g2048-board" });
    for (let i = 0; i < SIZE * SIZE; i++) this.boardEl.appendChild(el("div", { class: "cell" }));
    // The tile layer sits inside the board so it shares the grid's padding
    // box — tile coordinates then line up with the cells exactly.
    this.tileLayer = el("div", { class: "g2048-tiles" });
    this.fxLayer = el("div", { class: "g2048-fx" });
    this.boardEl.append(this.tileLayer, this.fxLayer);
    this.stageEl.append(this.boardEl);
    this.input.onSwipe((dir) => this._queue(dir));
    this._reachedGoal = false;
    this._timers = new Set();
    this._watchSize();
    window.addEventListener("resize", this._onWinResize = () => this._relayout());
  }

  // The board is plain DOM (no canvas), so GameBase never calls onResize for
  // it: entering fullscreen or turning the phone used to leave every tile at
  // its old size and position. The board watches its own size instead.
  _watchSize() {
    if (typeof ResizeObserver === "undefined") return;
    this._sizeObs = new ResizeObserver(() => this._relayout());
    this._sizeObs.observe(this.boardEl);
  }

  onStart() {
    this._clearTimers();
    this.tileLayer.innerHTML = "";
    this.fxLayer.innerHTML = "";
    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    this.setScore(0);
    this._reachedGoal = false;
    this.streak = 0;
    this.combos = 0;
    this.best = 0;
    this.busy = false;
    this.pending = null;
    this._layout();
    this._spawn(); this._spawn();
    this._hud();
  }

  onDestroyRound() { this._clearTimers(); }
  onDestroy() {
    this._clearTimers();
    this._sizeObs?.disconnect();
    window.removeEventListener("resize", this._onWinResize);
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (!this._destroyed) fn(); }, ms);
    this._timers.add(t);
  }
  _clearTimers() { this._timers?.forEach(clearTimeout); this._timers?.clear(); }

  /**
   * Read the real cell geometry out of the grid rather than guessing it.
   * Layout offsets, not getBoundingClientRect: those stay correct when the
   * board is scaled or turned for fullscreen. Measured cell to cell, so the
   * gap and any rounding are included.
   */
  _layout() {
    const cells = this.boardEl.querySelectorAll(".cell");
    if (cells.length < SIZE + 1 || !cells[0].offsetWidth) { this.cellSize = 0; this.stride = 0; this.strideY = 0; return; }
    const first = cells[0];
    this.cellSize = first.offsetWidth;
    this.stride = cells[1].offsetLeft - first.offsetLeft;
    this.strideY = cells[SIZE].offsetTop - first.offsetTop;
    this.origin = { x: first.offsetLeft - this.tileLayer.offsetLeft, y: first.offsetTop - this.tileLayer.offsetTop };
    this._measured = `${this.cellSize}|${this.stride}|${this.strideY}|${this.origin.x}|${this.origin.y}`;
  }

  /** Re-measure and snap every tile whenever the board changes size. */
  _relayout() {
    const before = this._measured;
    this._layout();
    if (this._measured !== before) this._placeAll(true);
  }

  _xy(r, c) { return { x: this.origin.x + c * this.stride, y: this.origin.y + r * this.strideY }; }

  onUpdate() {
    if (this.input.consumePressed("ArrowUp") || this.input.consumePressed("KeyW")) this._queue("up");
    else if (this.input.consumePressed("ArrowDown") || this.input.consumePressed("KeyS")) this._queue("down");
    else if (this.input.consumePressed("ArrowLeft") || this.input.consumePressed("KeyA")) this._queue("left");
    else if (this.input.consumePressed("ArrowRight") || this.input.consumePressed("KeyD")) this._queue("right");
  }

  /** One move may wait while the previous one is still sliding. */
  _queue(dir) {
    if (this.state !== "playing") return;
    if (this.busy) { this.pending = dir; return; }
    this._move(dir);
  }

  _hud() {
    this.setHud({ Best: this.best || 0, Combo: this.streak > 1 ? `x${this.streak}` : "—" });
  }

  // -------------------------------------------------------------- tiles --
  _makeTile(v, r, c, cls = "spawn") {
    const t = { id: nextId++, v, r, c, node: el("div", { class: `g2048-tile ${cls}` }) };
    this._paint(t);
    this.tileLayer.appendChild(t.node);
    this._place(t, true);
    this.grid[r][c] = t;
    this.best = Math.max(this.best, v);
    return t;
  }

  _paint(t) {
    const [bg, fg] = TILE_COLORS[t.v] || TILE_COLORS[4096];
    const size = this.cellSize;
    const digits = String(t.v).length;
    Object.assign(t.node.style, {
      width: `${size}px`, height: `${size}px`, background: bg, color: fg,
      fontSize: `${size * (digits > 3 ? 0.28 : digits > 2 ? 0.33 : 0.4)}px`,
      "--glow": bg,
    });
    t.node.classList.toggle("hot", t.v >= 128);
    t.node.textContent = String(t.v);
  }

  _place(t, instant = false) {
    const { x, y } = this._xy(t.r, t.c);
    if (instant) t.node.style.transition = "none";
    // `translate` is applied before `scale`, so the pop animations scale the
    // tile around its own centre instead of dragging it across the board.
    t.node.style.translate = `${x}px ${y}px`;
    if (instant) { void t.node.offsetWidth; t.node.style.transition = ""; }
  }

  _placeAll(instant) {
    if (!this.grid) return;
    for (const row of this.grid) for (const t of row) if (t) { this._paint(t); this._place(t, instant); }
  }

  _spawn() {
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!this.grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[randInt(0, empty.length - 1)];
    this._makeTile(Math.random() < 0.9 ? 2 : 4, r, c);
  }

  // --------------------------------------------------------------- move --
  _move(dir) {
    const merges = [];          // { into, from, v }
    let moved = false;

    for (let i = 0; i < SIZE; i++) {
      const cells = [];
      for (let k = 0; k < SIZE; k++) {
        if (dir === "left") cells.push([i, k]);
        else if (dir === "right") cells.push([i, SIZE - 1 - k]);
        else if (dir === "up") cells.push([k, i]);
        else cells.push([SIZE - 1 - k, i]);
      }
      const tiles = cells.map(([r, c]) => this.grid[r][c]).filter(Boolean);
      cells.forEach(([r, c]) => { this.grid[r][c] = null; });
      let slot = 0;
      for (let j = 0; j < tiles.length; j++) {
        const t = tiles[j], n = tiles[j + 1];
        const [r, c] = cells[slot];
        if (n && n.v === t.v) {
          // Both slide to the same cell; `t` survives with double the value.
          for (const m of [t, n]) { if (m.r !== r || m.c !== c) moved = true; m.r = r; m.c = c; }
          merges.push({ into: t, from: n, v: t.v * 2 });
          this.grid[r][c] = t;
          j++;
        } else {
          if (t.r !== r || t.c !== c) moved = true;
          t.r = r; t.c = c;
          this.grid[r][c] = t;
        }
        slot++;
      }
    }
    if (!moved) return;

    this.busy = true;
    for (const row of this.grid) for (const t of row) if (t) this._place(t);
    for (const m of merges) this._place(m.from);

    // Score: merged values, multiplied by the streak.
    this.streak = merges.length ? this.streak + 1 : 0;
    const mult = 1 + Math.min(this.streak - 1, 10) * 0.1;
    let gained = 0;
    for (const m of merges) gained += m.v;
    gained = Math.round(gained * (merges.length ? mult : 1));

    // Combos are decided now, so the board (and the next spawn) already
    // knows which tiles are gone.
    const big = merges.filter(m => m.v >= COMBO_MIN);
    const mega = big.some(m => m.v >= MEGA_MIN) || big.length >= 2;
    let victims = [];
    if (big.length) {
      const keep = new Set(merges.map(m => m.into));
      const pool = [];
      for (const row of this.grid) for (const t of row) if (t && !keep.has(t)) pool.push(t);
      pool.sort((a, b) => a.v - b.v || Math.random() - 0.5);
      victims = pool.slice(0, mega ? 2 : 1);
      for (const v of victims) { this.grid[v.r][v.c] = null; gained += v.v * 2; }
    }
    this.addScore(gained);

    this._later(() => {
      for (const m of merges) {
        m.from.node.remove();
        m.into.v = m.v;
        this._paint(m.into);
        m.into.node.classList.remove("spawn", "merge");
        void m.into.node.offsetWidth;
        m.into.node.classList.add("merge");
        this.best = Math.max(this.best, m.v);
        this._floatText(m.into, `+${Math.round(m.v * mult)}`, m.v >= COMBO_MIN ? "big" : "");
        if (m.v >= 64) this._burst(m.into, 8, TILE_COLORS[m.v]?.[0] || "#fff");
        if (m.v >= 2048 && !this._reachedGoal) {
          this._reachedGoal = true;
          toast({ type: "success", title: "You reached 2048!", message: "Keep merging — combos will keep the board open." });
        }
      }
      if (merges.length) audioManager.play(big.length ? "coin" : "combo");
      if (victims.length) this._blast(victims, mega, big);
      this._spawn();
      this._hud();
      this.busy = false;
      if (!this._hasMoves()) { this._later(() => this._finish(), victims.length ? 520 : 200); return; }
      if (this.pending) { const d = this.pending; this.pending = null; this._move(d); }
    }, SLIDE_MS);
  }

  // ------------------------------------------------------------ effects --
  _blast(victims, mega, big) {
    this.combos++;
    audioManager.play(mega ? "explosion" : "pop");
    this.shake();
    this._banner(mega ? "MEGA COMBO!" : "COMBO!", this.streak > 1 ? `streak x${this.streak}` : `${big[0].v / 2} + ${big[0].v / 2}`, mega);
    // A beam from the merged tile to each tile it destroys.
    const src = big[0].into;
    victims.forEach((v, i) => {
      this._beam(src, v);
      v.node.classList.add("doomed");
      this._later(() => {
        this._shockwave(v);
        this._burst(v, mega ? 18 : 12, TILE_COLORS[v.v]?.[0] || "#fff", true);
        this._floatText(v, `+${v.v * 2}`, "big");
        v.node.remove();
      }, 260 + i * 90);
    });
  }

  _center(t) {
    const { x, y } = this._xy(t.r, t.c);
    return { x: x + this.cellSize / 2, y: y + this.cellSize / 2 };
  }

  _fx(cls, style, ms) {
    const n = el("div", { class: cls, style });
    this.fxLayer.appendChild(n);
    this._later(() => n.remove(), ms);
    return n;
  }

  _floatText(t, text, cls) {
    const { x, y } = this._center(t);
    this._fx(`g2048-float ${cls}`, `left:${x}px;top:${y}px;`, 900).textContent = text;
  }

  _burst(t, n, color, big = false) {
    const { x, y } = this._center(t);
    const s = this.cellSize;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = s * (big ? 0.9 + Math.random() * 0.9 : 0.5 + Math.random() * 0.4);
      const size = s * (big ? 0.12 + Math.random() * 0.14 : 0.07 + Math.random() * 0.06);
      this._fx("g2048-shard", `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};`
        + `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--rot:${Math.random() * 540 - 270}deg;`, 700);
    }
  }

  _shockwave(t) {
    const { x, y } = this._center(t);
    this._fx("g2048-wave", `left:${x}px;top:${y}px;width:${this.cellSize}px;height:${this.cellSize}px;`, 600);
  }

  _beam(a, b) {
    const p = this._center(a), q = this._center(b);
    const len = Math.hypot(q.x - p.x, q.y - p.y), ang = Math.atan2(q.y - p.y, q.x - p.x);
    this._fx("g2048-beam", `left:${p.x}px;top:${p.y}px;width:${len}px;transform:rotate(${ang}rad);`, 420);
  }

  _banner(text, sub, mega) {
    this.fxLayer.querySelectorAll(".g2048-banner").forEach(n => n.remove());
    const n = this._fx(`g2048-banner${mega ? " mega" : ""}`, "", 1100);
    n.append(el("b", {}, text), el("span", {}, sub));
  }

  // --------------------------------------------------------------- rules --
  _hasMoves() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const t = this.grid[r][c];
      if (!t) return true;
      if (c < SIZE - 1 && this.grid[r][c + 1]?.v === t.v) return true;
      if (r < SIZE - 1 && this.grid[r + 1][c]?.v === t.v) return true;
    }
    return false;
  }

  _finish() {
    if (this.state !== "playing") return;
    audioManager.play("gameover");
    this.endGame({
      result: "score", score: this.score,
      message: this._reachedGoal ? "You reached 2048 and beyond!" : "No more moves available.",
      extraStats: [{ label: "Best tile", value: this.best }, { label: "Combos", value: this.combos }],
    });
  }
}

export default Game2048;
