// ==========================================================================
// Maze Runner — procedurally generated mazes solved against the clock.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas } from "./canvasUtils.js";
import { formatTime, randInt } from "../core/utils.js";

// Wall bit flags per cell
const N = 1, E = 2, S = 4, W = 8;
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
const OPP = { [N]: S, [S]: N, [E]: W, [W]: E };

export class MazeRunnerGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Find your way from the green start to the glowing gold exit.",
      "Collect the gems along the way for bonus points.",
      "Solve it as fast as you can — your time drives your score.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return []; }
  getTouchHint() { return "Use the D-pad or swipe to move through the maze."; }
  getKeyboardHint() { return "Arrow keys or WASD to move."; }

  onInit() {
    this.createCanvas();
    this.input.onSwipe((dir) => this._move({ up: N, down: S, left: W, right: E }[dir]));
  }

  onStart(difficulty) {
    this.size = difficulty === "Hard" ? 17 : difficulty === "Normal" ? 13 : 9;
    this._generate();
    this.player = { x: 0, y: 0 };
    this.exit = { x: this.size - 1, y: this.size - 1 };
    this.gems = [];
    for (let i = 0; i < Math.floor(this.size / 2); i++) {
      this.gems.push({ x: randInt(1, this.size - 1), y: randInt(1, this.size - 1), taken: false });
    }
    this.elapsed = 0;
    this.moves = 0;
    this.collected = 0;
    this._moveCooldown = 0;
    this.setScore(0);
    this.setHud({ Time: "0s", Moves: 0, Gems: `0/${this.gems.length}` });
  }

  _generate() {
    const size = this.size;
    this.cells = Array.from({ length: size }, () => Array(size).fill(N | E | S | W));
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    const stack = [[0, 0]];
    visited[0][0] = true;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const dirs = [N, E, S, W].filter(d => {
        const nx = x + DX[d], ny = y + DY[d];
        return nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny][nx];
      });
      if (!dirs.length) { stack.pop(); continue; }
      const d = dirs[randInt(0, dirs.length - 1)];
      const nx = x + DX[d], ny = y + DY[d];
      this.cells[y][x] &= ~d;
      this.cells[ny][nx] &= ~OPP[d];
      visited[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }

  onUpdate(dt) {
    this.elapsed += dt;
    this._moveCooldown -= dt;
    if (this._moveCooldown <= 0) {
      let dir = null;
      if (this.input.isDown("ArrowUp", "KeyW") || this.input.virtual.up) dir = N;
      else if (this.input.isDown("ArrowDown", "KeyS") || this.input.virtual.down) dir = S;
      else if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) dir = W;
      else if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) dir = E;
      if (dir) { this._move(dir); this._moveCooldown = 0.13; }
    }
    this.setHud({ Time: formatTime(this.elapsed), Moves: this.moves, Gems: `${this.collected}/${this.gems.length}` });
  }

  _move(dir) {
    if (!dir || this.state !== "playing") return;
    const { x, y } = this.player;
    if (this.cells[y][x] & dir) { audioManager.play("error"); return; }
    this.player = { x: x + DX[dir], y: y + DY[dir] };
    this.moves++;
    audioManager.play("select");
    for (const g of this.gems) {
      if (!g.taken && g.x === this.player.x && g.y === this.player.y) { g.taken = true; this.collected++; audioManager.play("coin"); }
    }
    if (this.player.x === this.exit.x && this.player.y === this.exit.y) this._finish();
  }

  _finish() {
    const score = Math.max(100, Math.round(this.size * 120 - this.elapsed * 6 - this.moves * 2 + this.collected * 40));
    this.setScore(score);
    audioManager.play("win");
    this.endGame({ result: "win", score, message: `Escaped in ${formatTime(this.elapsed)} with ${this.collected} gems.`, extraStats: [{ label: "Time", value: formatTime(this.elapsed) }, { label: "Moves", value: this.moves }] });
  }

  onRender(ctx) {
    clearCanvas(ctx, this.canvas, "#080b16");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    const cell = Math.floor(Math.min(this.viewW, this.viewH) / this.size);
    const offX = (this.viewW - cell * this.size) / 2, offY = (this.viewH - cell * this.size) / 2;

    ctx.fillStyle = "#ffd76a";
    ctx.globalAlpha = 0.25;
    ctx.fillRect(offX + this.exit.x * cell, offY + this.exit.y * cell, cell, cell);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "#7c5cff"; ctx.lineWidth = 2; ctx.lineCap = "round";
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const px = offX + x * cell, py = offY + y * cell;
      const w = this.cells[y][x];
      ctx.beginPath();
      if (w & N) { ctx.moveTo(px, py); ctx.lineTo(px + cell, py); }
      if (w & S) { ctx.moveTo(px, py + cell); ctx.lineTo(px + cell, py + cell); }
      if (w & W) { ctx.moveTo(px, py); ctx.lineTo(px, py + cell); }
      if (w & E) { ctx.moveTo(px + cell, py); ctx.lineTo(px + cell, py + cell); }
      ctx.stroke();
    }

    ctx.fillStyle = "#ffd76a";
    for (const g of this.gems) {
      if (g.taken) continue;
      ctx.save();
      ctx.translate(offX + g.x * cell + cell / 2, offY + g.y * cell + cell / 2);
      ctx.rotate(performance.now() / 500);
      ctx.fillRect(-cell * 0.15, -cell * 0.15, cell * 0.3, cell * 0.3);
      ctx.restore();
    }

    ctx.fillStyle = "#2ee6a6";
    ctx.beginPath();
    ctx.arc(offX + this.player.x * cell + cell / 2, offY + this.player.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export default MazeRunnerGame;
