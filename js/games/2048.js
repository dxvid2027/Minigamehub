// ==========================================================================
// 2048 — slide and merge numbered tiles to reach the target value.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, randInt } from "../core/utils.js";
import { toast } from "../ui/toast.js";

const SIZE = 4;
const TILE_COLORS = {
  2: ["#2a2f4d", "#eef1ff"], 4: ["#2f3a5a", "#eef1ff"], 8: ["#ff9f43", "#1a0d00"], 16: ["#ff7f43", "#1a0d00"],
  32: ["#ff5470", "#200008"], 64: ["#ff4fd8", "#1c0016"], 128: ["#7c5cff", "#0e0526"], 256: ["#6a4bff", "#0e0526"],
  512: ["#22d3ee", "#00181c"], 1024: ["#2ee6a6", "#00190f"], 2048: ["#ffd76a", "#231800"], 4096: ["#fff", "#000"],
};

export class Game2048 extends GameBase {
  getDifficulties() { return ["Normal"]; }
  getInstructions() {
    return [
      "Slide all tiles with arrow keys, WASD or a swipe.",
      "Two tiles with the same number merge into one when they touch.",
      "Reach the 2048 tile — then keep going for an even higher score!",
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
    this.boardEl.appendChild(this.tileLayer);
    this.stageEl.append(this.boardEl);
    this.input.onSwipe((dir) => this._move(dir));
    this._reachedGoal = false;
  }

  onResize() { this._layout(); }

  onStart() {
    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    this.setScore(0);
    this._reachedGoal = false;
    this._addRandom(); this._addRandom();
    this._layout();
    this._render();
  }

  /** Read the real cell geometry out of the grid rather than guessing it. */
  _layout() {
    const first = this.boardEl.querySelector(".cell");
    if (!first) { this.cellSize = 0; this.stride = 0; return; }
    this.gap = parseFloat(getComputedStyle(this.boardEl).rowGap) || 0;
    const cellRect = first.getBoundingClientRect();
    const layerRect = this.tileLayer.getBoundingClientRect();
    this.cellSize = cellRect.width;
    this.stride = this.cellSize + this.gap;
    // Measured, not assumed: whatever box the absolute layer resolves against,
    // this delta puts tile (0,0) exactly on cell (0,0).
    this.origin = { x: cellRect.left - layerRect.left, y: cellRect.top - layerRect.top };
  }

  onUpdate() {
    if (this.input.consumePressed("ArrowUp") || this.input.consumePressed("KeyW")) this._move("up");
    else if (this.input.consumePressed("ArrowDown") || this.input.consumePressed("KeyS")) this._move("down");
    else if (this.input.consumePressed("ArrowLeft") || this.input.consumePressed("KeyA")) this._move("left");
    else if (this.input.consumePressed("ArrowRight") || this.input.consumePressed("KeyD")) this._move("right");
  }

  _addRandom() {
    const empty = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!this.grid[r][c]) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[randInt(0, empty.length - 1)];
    this.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  }

  _move(dir) {
    if (this.state !== "playing") return;
    const before = this.grid.map(row => row.slice());
    let gained = 0, moved = false;

    const lines = [];
    for (let i = 0; i < SIZE; i++) {
      let line;
      if (dir === "left") line = this.grid[i].map((v, c) => ({ v, r: i, c }));
      else if (dir === "right") line = this.grid[i].map((v, c) => ({ v, r: i, c })).reverse();
      else if (dir === "up") line = this.grid.map((row, r) => ({ v: row[i], r, c: i }));
      else line = this.grid.map((row, r) => ({ v: row[i], r, c: i })).reverse();
      lines.push(line);
    }

    for (const line of lines) {
      const vals = line.map(cell => cell.v).filter(v => v);
      const merged = [];
      for (let i = 0; i < vals.length; i++) {
        if (i < vals.length - 1 && vals[i] === vals[i + 1]) {
          const val = vals[i] * 2;
          merged.push(val); gained += val; i++;
          if (val >= 2048 && !this._reachedGoal) { this._reachedGoal = true; toast({ type: "success", title: "You reached 2048!", message: "Keep merging for an even higher score." }); }
        } else merged.push(vals[i]);
      }
      while (merged.length < SIZE) merged.push(0);
      line.forEach((cell, i) => { if (cell.v !== merged[i]) moved = true; this.grid[cell.r][cell.c] = merged[i]; });
    }

    if (!moved) return;
    if (gained) audioManager.play("combo");
    this.addScore(gained);
    this._addRandom();
    this._render();
    if (!this._hasMoves()) this._finish();
  }

  _hasMoves() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (!this.grid[r][c]) return true;
      if (c < SIZE - 1 && this.grid[r][c] === this.grid[r][c + 1]) return true;
      if (r < SIZE - 1 && this.grid[r][c] === this.grid[r + 1][c]) return true;
    }
    return false;
  }

  _render() {
    this.tileLayer.innerHTML = "";
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = this.grid[r][c];
      if (!v) continue;
      const [bg, fg] = TILE_COLORS[v] || TILE_COLORS[4096];
      const size = this.cellSize;
      const tile = el("div", {
        class: "g2048-tile",
        style: `left:${this.origin.x + c * this.stride}px; top:${this.origin.y + r * this.stride}px; width:${size}px; height:${size}px; background:${bg}; color:${fg}; font-size:${size * 0.38}px;`,
      }, String(v));
      this.tileLayer.appendChild(tile);
    }
  }

  _finish() {
    audioManager.play("gameover");
    this.endGame({ result: "score", score: this.score, message: this._reachedGoal ? "You reached 2048 and beyond!" : "No more moves available." });
  }
}

export default Game2048;
