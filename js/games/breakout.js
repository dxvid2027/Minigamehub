// ==========================================================================
// Breakout Arena — paddle & ball brick-breaker with escalating levels.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { roundRect } from "./canvasUtils.js";
import { clamp } from "../core/utils.js";

const ROW_COLORS = ["#ff5470", "#ff9f43", "#ffd76a", "#2ee6a6", "#22d3ee", "#7c5cff"];

export class BreakoutGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move the paddle to keep the ball in play and smash every brick.",
      "Clear a level to advance to a faster, denser one.",
      "You have 3 lives — don't let the ball fall past your paddle.",
    ];
  }
  getTouchLayout() { return "single"; }
  getTouchIcon() { return "▶"; }
  getTouchHint() { return "Drag left/right to move the paddle, tap the button to launch."; }
  getKeyboardHint() { return "Arrow keys or A/D to move the paddle, Space to launch."; }

  getScene() { return "grid"; }
  onInit() {
    this.createCanvas();
    this.input.onPointer("move", (p) => { this._dragX = p.x; });
  }

  onStart(difficulty) {
    this.lives = 3;
    this.level = 1;
    this.baseSpeed = difficulty === "Hard" ? 420 : difficulty === "Normal" ? 340 : 270;
    this.paddleW = difficulty === "Easy" ? 120 : 96;
    this.paddle = { x: this.viewW / 2 - this.paddleW / 2, w: this.paddleW, h: 14 };
    this._buildLevel();
    this.setScore(0);
    this._updateHud();
    this._launched = false;
    this._resetBall();
  }

  _buildLevel() {
    const rows = clamp(3 + this.level, 3, 8);
    const cols = 9;
    this.bricks = [];
    const bw = (this.viewW - 20) / cols;
    const bh = 22;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.bricks.push({ x: 10 + c * bw, y: 50 + r * (bh + 6), w: bw - 6, h: bh, color: ROW_COLORS[r % ROW_COLORS.length], hp: r >= rows - 2 ? 2 : 1, alive: true, val: (rows - r) * 5 });
      }
    }
  }

  _resetBall() {
    this._launched = false;
    this.ball = { x: this.paddle.x + this.paddle.w / 2, y: this.viewH - 40, vx: 0, vy: 0, r: 7 };
  }

  _launch() {
    if (this._launched) return;
    this._launched = true;
    const speed = this.baseSpeed + this.level * 12;
    this.ball.vx = speed * (Math.random() > 0.5 ? 0.5 : -0.5);
    this.ball.vy = -speed;
  }

  onUpdate(dt) {
    const speed = 620;
    if (this._dragX != null) this.paddle.x = clamp(this._dragX - this.paddle.w / 2, 0, this.viewW - this.paddle.w);
    if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) this.paddle.x -= speed * dt;
    if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) this.paddle.x += speed * dt;
    this.paddle.x = clamp(this.paddle.x, 0, this.viewW - this.paddle.w);
    if (this.input.consumePressed("Space") || this.input.virtual.a) this._launch();

    if (!this._launched) {
      this.ball.x = this.paddle.x + this.paddle.w / 2;
      return;
    }

    const b = this.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x - b.r < 0) { b.x = b.r; b.vx *= -1; }
    if (b.x + b.r > this.viewW) { b.x = this.viewW - b.r; b.vx *= -1; }
    if (b.y - b.r < 0) { b.y = b.r; b.vy *= -1; }

    const py = this.viewH - 24;
    if (b.vy > 0 && b.y + b.r >= py && b.y - b.r <= py + this.paddle.h && b.x >= this.paddle.x - b.r && b.x <= this.paddle.x + this.paddle.w + b.r) {
      b.y = py - b.r;
      const rel = (b.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
      const speedNow = Math.hypot(b.vx, b.vy);
      b.vx = rel * speedNow;
      b.vy = -Math.sqrt(Math.max(1, speedNow * speedNow - b.vx * b.vx));
      audioManager.play("hit");
    }

    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      if (b.x + b.r > brick.x && b.x - b.r < brick.x + brick.w && b.y + b.r > brick.y && b.y - b.r < brick.y + brick.h) {
        brick.hp -= 1;
        if (brick.hp <= 0) { brick.alive = false; this.addScore(brick.val); }
        const overlapX = Math.min(b.x + b.r - brick.x, brick.x + brick.w - (b.x - b.r));
        const overlapY = Math.min(b.y + b.r - brick.y, brick.y + brick.h - (b.y - b.r));
        if (overlapX < overlapY) b.vx *= -1; else b.vy *= -1;
        audioManager.play("pop");
        break;
      }
    }

    if (b.y - b.r > this.viewH) {
      this.lives -= 1;
      this.shake();
      this._updateHud();
      if (this.lives <= 0) {
        this.endGame({ result: "loss", score: this.score, message: `Reached level ${this.level}`, extraStats: [{ label: "Level", value: this.level }] });
      } else {
        this._resetBall();
      }
    }

    if (this.bricks.every(br => !br.alive)) {
      this.level += 1;
      audioManager.play("levelup");
      this._buildLevel();
      this._resetBall();
      this._updateHud();
    }
  }

  _updateHud() { this.setHud({ Score: this.score, Lives: "❤️".repeat(Math.max(0, this.lives)), Level: this.level }); }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      // Reinforced bricks (2 hp) read brighter and carry a stronger rim.
      this.gfx.block(ctx, brick.x, brick.y, brick.w, brick.h, 5, brick.color,
                     { glow: brick.hp > 1 ? 0.5 : 0.22 });
      if (brick.hp > 1) {
        ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1;
        roundRect(ctx, brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2, 4); ctx.stroke();
      }
    }
    this.gfx.block(ctx, this.paddle.x, this.viewH - 24, this.paddle.w, this.paddle.h, 7, "#7c5cff", { glow: 0.6 });
    this.gfx.orb(ctx, this.ball.x, this.ball.y, this.ball.r, "#ffffff", { glow: 0.9 });
    if (!this._launched) {
      this.gfx.label(ctx, "Press Space / Tap to launch", this.viewW / 2, this.viewH - 44, { size: 13 });
    }
    ctx.restore();
  }
}

export default BreakoutGame;
