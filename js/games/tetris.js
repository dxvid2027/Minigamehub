// ==========================================================================
// Tetris Blocks — classic 7-piece falling-block puzzle with next preview.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas, roundRect } from "./canvasUtils.js";
import { choice } from "../core/utils.js";

const COLS = 10, ROWS = 20;
const COLORS = { I: "#22d3ee", O: "#ffd76a", T: "#c86bff", S: "#2ee6a6", Z: "#ff5470", J: "#5b7bff", L: "#ff9f43" };
const SHAPES = {
  I: [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
  O: [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]],
  T: [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
  S: [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
  J: [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]],
};
const PIECES = Object.keys(SHAPES);
const LINE_SCORES = [0, 100, 300, 500, 800];

export class TetrisGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move and rotate pieces to complete horizontal lines.",
      "Completed lines clear and award points — clear several at once for a bonus.",
      "The game speeds up as you clear more lines.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a", "b"]; }
  getTouchHint() { return "D-pad to move/soft-drop, ● to rotate, ■ to hard drop."; }
  getKeyboardHint() { return "Arrows to move/soft-drop, Up to rotate, Space to hard drop."; }

  onInit() { this.createCanvas(); }

  onStart(difficulty) {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.lines = 0; this.level = difficulty === "Hard" ? 3 : difficulty === "Easy" ? 0 : 1;
    this.dropInterval = this._speedForLevel(this.level);
    this.acc = 0;
    this.moveAcc = 0;
    this.bag = [];
    this.next = this._nextFromBag();
    this.setScore(0);
    this._spawn();
    this.setHud({ Score: 0, Lines: 0, Level: this.level });
  }

  _speedForLevel(level) { return Math.max(0.09, 0.8 - level * 0.07); }

  _nextFromBag() {
    if (!this.bag.length) this.bag = [...PIECES].sort(() => Math.random() - 0.5);
    return this.bag.pop();
  }

  _spawn() {
    this.piece = { type: this.next, rot: 0, x: 3, y: -1 };
    this.next = this._nextFromBag();
    if (this._collides(this.piece, 0, 0)) this._gameOver();
  }

  _cells(piece, rot = piece.rot) { return SHAPES[piece.type][rot]; }

  _collides(piece, dx, dy, rot = piece.rot) {
    for (const [cx, cy] of this._cells(piece, rot)) {
      const x = piece.x + cx + dx, y = piece.y + cy + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.grid[y][x]) return true;
    }
    return false;
  }

  onUpdate(dt) {
    this.moveAcc += dt;
    const moveEvery = 0.11;
    if (this.moveAcc >= moveEvery) {
      this.moveAcc = 0;
      if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) this._try(-1, 0);
      if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) this._try(1, 0);
    }
    if (this.input.consumePressed("ArrowUp") || this.input.consumePressed("KeyW")) this._rotate();
    if (this.input.virtual.a && !this._aWasDown) this._rotate();
    this._aWasDown = this.input.virtual.a;
    if (this.input.consumePressed("Space")) this._hardDrop();
    if (this.input.virtual.b && !this._bWasDown) this._hardDrop();
    this._bWasDown = this.input.virtual.b;

    const softDrop = this.input.isDown("ArrowDown", "KeyS") || this.input.virtual.down;
    this.acc += dt * (softDrop ? 8 : 1);
    if (this.acc >= this.dropInterval) {
      this.acc = 0;
      this._try(0, 1) || this._lock();
    }
  }

  _try(dx, dy) {
    if (this._collides(this.piece, dx, dy)) return false;
    this.piece.x += dx; this.piece.y += dy;
    return true;
  }

  _rotate() {
    const nextRot = (this.piece.rot + 1) % 4;
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!this._collides(this.piece, kick, 0, nextRot)) {
        this.piece.rot = nextRot; this.piece.x += kick;
        audioManager.play("select");
        return;
      }
    }
  }

  _hardDrop() {
    let dist = 0;
    while (!this._collides(this.piece, 0, dist + 1)) dist++;
    this.piece.y += dist;
    this.addScore(dist * 2);
    this._lock();
  }

  _lock() {
    for (const [cx, cy] of this._cells(this.piece)) {
      const x = this.piece.x + cx, y = this.piece.y + cy;
      if (y < 0) continue;
      this.grid[y][x] = this.piece.type;
    }
    audioManager.play("hit");
    this._clearLines();
    this._spawn();
  }

  _clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (this.grid[y].every(c => c)) {
        this.grid.splice(y, 1);
        this.grid.unshift(Array(COLS).fill(null));
        cleared++; y++;
      }
    }
    if (cleared) {
      this.lines += cleared;
      this.addScore(LINE_SCORES[cleared] * (this.level + 1));
      this.level = Math.floor(this.lines / 10) + (this.level > 3 ? 3 : 0);
      this.dropInterval = this._speedForLevel(this.level);
      audioManager.play(cleared >= 4 ? "levelup" : "score");
      this.shake();
      this.setHud({ Score: this.score, Lines: this.lines, Level: this.level });
    }
  }

  _gameOver() {
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: `Cleared ${this.lines} lines.`, extraStats: [{ label: "Lines", value: this.lines }] });
  }

  onRender(ctx) {
    clearCanvas(ctx, this.canvas, "#07080f");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    const cell = Math.floor(Math.min(this.viewW / COLS, this.viewH / (ROWS + 1)));
    const boardW = cell * COLS, boardH = cell * ROWS;
    const offX = (this.viewW - boardW - 90) / 2 + 8, offY = (this.viewH - boardH) / 2;

    ctx.strokeStyle = "#ffffff10"; ctx.strokeRect(offX - 1, offY - 1, boardW + 2, boardH + 2);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const v = this.grid[y][x];
      if (!v) continue;
      ctx.fillStyle = COLORS[v];
      roundRect(ctx, offX + x * cell + 1, offY + y * cell + 1, cell - 2, cell - 2, 3); ctx.fill();
    }
    if (this.piece) {
      ctx.fillStyle = COLORS[this.piece.type];
      let ghostDist = 0;
      while (!this._collides(this.piece, 0, ghostDist + 1)) ghostDist++;
      ctx.globalAlpha = 0.18;
      for (const [cx, cy] of this._cells(this.piece)) {
        const y = this.piece.y + cy + ghostDist;
        if (y < 0) continue;
        roundRect(ctx, offX + (this.piece.x + cx) * cell + 1, offY + y * cell + 1, cell - 2, cell - 2, 3); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const [cx, cy] of this._cells(this.piece)) {
        const y = this.piece.y + cy;
        if (y < 0) continue;
        roundRect(ctx, offX + (this.piece.x + cx) * cell + 1, offY + y * cell + 1, cell - 2, cell - 2, 3); ctx.fill();
      }
    }

    const px = offX + boardW + 20, py = offY + 6;
    ctx.fillStyle = "#ffffff99"; ctx.font = "12px sans-serif"; ctx.fillText("NEXT", px, py);
    ctx.fillStyle = COLORS[this.next];
    this._cells({ type: this.next, rot: 0 }, 0).forEach(([cx, cy]) => {
      roundRect(ctx, px + cx * (cell * 0.6), py + 12 + cy * (cell * 0.6), cell * 0.55, cell * 0.55, 2); ctx.fill();
    });
    ctx.restore();
  }
}

export default TetrisGame;
