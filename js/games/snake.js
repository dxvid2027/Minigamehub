// ==========================================================================
// Snake — classic grid snake with wrap-around Easy mode and speed ramp-up.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { randInt } from "../core/utils.js";
import { lerpColor } from "./canvasUtils.js";

export class SnakeGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Eat the glowing orbs to grow longer and score points.",
      "Avoid hitting yourself — Easy mode wraps around the walls.",
      "The snake speeds up gradually as you grow.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Swipe up/down/left/right to steer."; }
  getKeyboardHint() { return "Arrow keys or WASD to steer, P to pause."; }

  getScene() { return "grid"; }
  onInit() {
    this.createCanvas();
    this.cols = 20; this.rows = 20;
    this.input.onSwipe((dir) => this._setDir(dir));
  }

  onResize() { this.cell = Math.floor(Math.min(this.viewW, this.viewH) / this.cols); }

  onStart(difficulty) {
    this.onResize();
    this.snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    this.wrap = difficulty === "Easy";
    this.baseInterval = difficulty === "Hard" ? 0.085 : difficulty === "Normal" ? 0.12 : 0.16;
    this.interval = this.baseInterval;
    this.acc = 0;
    this._placeFood();
    this.setScore(0);
    this.setHud({ Score: 0, Length: this.snake.length });
  }

  _setDir(dir) {
    const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const d = map[dir];
    if (!d) return;
    if (d.x === -this.dir.x && d.y === -this.dir.y) return;
    this.nextDir = d;
  }

  onUpdate(dt) {
    if (this.input.isDown("ArrowUp", "KeyW")) this._setDir("up");
    else if (this.input.isDown("ArrowDown", "KeyS")) this._setDir("down");
    else if (this.input.isDown("ArrowLeft", "KeyA")) this._setDir("left");
    else if (this.input.isDown("ArrowRight", "KeyD")) this._setDir("right");

    this.acc += dt;
    while (this.acc >= this.interval) {
      this.acc -= this.interval;
      this._tick();
      if (this.state !== "playing") return;
    }
  }

  _tick() {
    this.dir = this.nextDir;
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    if (this.wrap) {
      head.x = (head.x + this.cols) % this.cols;
      head.y = (head.y + this.rows) % this.rows;
    } else if (head.x < 0 || head.x >= this.cols || head.y < 0 || head.y >= this.rows) {
      return this._die();
    }
    if (this.snake.some(s => s.x === head.x && s.y === head.y)) return this._die();
    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.addScore(10);
      audioManager.play("coin");
      this._placeFood();
      this.interval = Math.max(0.06, this.interval - 0.0025);
      this.setHud({ Score: this.score, Length: this.snake.length });
    } else {
      this.snake.pop();
    }
  }

  _placeFood() {
    let pos;
    do { pos = { x: randInt(0, this.cols - 1), y: randInt(0, this.rows - 1) }; }
    while (this.snake.some(s => s.x === pos.x && s.y === pos.y));
    this.food = pos;
    this._foodPulse = 0;
  }

  _die() {
    this.shake();
    this.endGame({ result: "loss", score: this.score, message: `Final length: ${this.snake.length}`, extraStats: [{ label: "Length", value: this.snake.length }] });
  }

  onRender(ctx, dt) {
    this._foodPulse = (this._foodPulse || 0) + dt;
    this.gfx.backdrop(ctx, dt);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const offX = (this.viewW - this.cell * this.cols) / 2;
    const offY = (this.viewH - this.cell * this.rows) / 2;

    ctx.strokeStyle = "#ffffff08";
    for (let x = 0; x <= this.cols; x++) { ctx.beginPath(); ctx.moveTo(offX + x * this.cell, offY); ctx.lineTo(offX + x * this.cell, offY + this.rows * this.cell); ctx.stroke(); }
    for (let y = 0; y <= this.rows; y++) { ctx.beginPath(); ctx.moveTo(offX, offY + y * this.cell); ctx.lineTo(offX + this.cols * this.cell, offY + y * this.cell); ctx.stroke(); }

    const pulse = 1 + Math.sin(this._foodPulse * 6) * 0.12;
    this.gfx.orb(ctx, offX + this.food.x * this.cell + this.cell / 2,
                 offY + this.food.y * this.cell + this.cell / 2,
                 this.cell * 0.34 * pulse, "#ff4fd8", { glow: 0.85 });

    // Body drawn tail-first so each segment overlaps the one behind it.
    for (let i = this.snake.length - 1; i >= 0; i--) {
      const s = this.snake[i];
      const t = i / Math.max(1, this.snake.length - 1);
      const color = i === 0 ? "#3df2b4" : lerpColor("#22d3ee", "#1c7fa8", Math.min(1, t * 1.2));
      const inset = i === 0 ? 0.5 : 1.5;
      this.gfx.block(ctx, offX + s.x * this.cell + inset, offY + s.y * this.cell + inset,
                     this.cell - inset * 2, this.cell - inset * 2, i === 0 ? 7 : 5, color,
                     { glow: i === 0 ? 0.55 : 0.18 });
      if (i === 0) {
        // Eyes, oriented along the direction of travel.
        const cx = offX + s.x * this.cell + this.cell / 2, cy = offY + s.y * this.cell + this.cell / 2;
        const ox = this.dir.y !== 0 ? this.cell * 0.18 : 0, oy = this.dir.x !== 0 ? this.cell * 0.18 : 0;
        const fx = this.dir.x * this.cell * 0.12, fy = this.dir.y * this.cell * 0.12;
        ctx.fillStyle = "#06120f";
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + fx + ox * sgn, cy + fy + oy * sgn, this.cell * 0.085, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
}

export default SnakeGame;
