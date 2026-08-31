// ==========================================================================
// Flappy Wings — one-touch flap-and-dodge endless pipes.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas } from "./canvasUtils.js";

export class FlappyBirdGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Tap, click or press Space to flap and gain height.",
      "Fly through the gaps in each pipe to score a point.",
      "One collision ends the run — beat your best score!",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap anywhere on the board to flap."; }
  getKeyboardHint() { return "Space or Arrow Up to flap."; }

  onInit() {
    this.createCanvas();
    this.input.onTap(() => this._flap());
  }

  onStart(difficulty) {
    this.gapSize = difficulty === "Hard" ? 130 : difficulty === "Normal" ? 165 : 205;
    this.pipeSpeed = difficulty === "Hard" ? 210 : difficulty === "Normal" ? 175 : 145;
    this.gravity = 1000;
    this.bird = { x: this.viewW * 0.28, y: this.viewH / 2, vy: 0, r: 14, rot: 0 };
    this.pipes = [];
    this._spawnTimer = 0;
    this.setScore(0);
    this._dead = false;
  }

  _flap() {
    if (this.state !== "playing" || this._dead) return;
    this.bird.vy = -360;
    audioManager.play("flap");
  }

  onUpdate(dt) {
    if (this.input.consumePressed("Space") || this.input.consumePressed("ArrowUp") || this.input.virtual.a) this._flap();

    const b = this.bird;
    b.vy += this.gravity * dt;
    b.y += b.vy * dt;
    b.rot = Math.max(-0.5, Math.min(1.2, b.vy / 500));

    if (b.y - b.r < 0) { b.y = b.r; b.vy = 0; }
    if (b.y + b.r > this.viewH) return this._die();

    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = Math.max(1.1, 1.7 - this.pipeSpeed / 400);
      const margin = 60;
      const gapY = margin + Math.random() * (this.viewH - margin * 2 - this.gapSize);
      this.pipes.push({ x: this.viewW + 30, gapY, w: 58, passed: false });
    }
    for (const p of this.pipes) {
      p.x -= this.pipeSpeed * dt;
      if (!p.passed && p.x + p.w < b.x) { p.passed = true; this.addScore(1); audioManager.play("score"); }
      const inX = b.x + b.r > p.x && b.x - b.r < p.x + p.w;
      if (inX && (b.y - b.r < p.gapY || b.y + b.r > p.gapY + this.gapSize)) return this._die();
    }
    this.pipes = this.pipes.filter(p => p.x + p.w > -10);
  }

  _die() {
    if (this._dead) return;
    this._dead = true;
    this.shake();
    this.endGame({ result: "loss", score: this.score, message: `You cleared ${this.score} pipes.` });
  }

  onRender(ctx, dt) {
    clearCanvas(ctx, this.canvas, "#0c1a2b");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = "#132840";
    for (let i = 0; i < 3; i++) ctx.fillRect(0, this.viewH - 20 - i * 40, this.viewW, 2);

    ctx.fillStyle = "#2ee6a6";
    for (const p of this.pipes) {
      ctx.fillRect(p.x, 0, p.w, p.gapY);
      ctx.fillRect(p.x, p.gapY + this.gapSize, p.w, this.viewH - (p.gapY + this.gapSize));
      ctx.fillStyle = "#22d3ee"; ctx.fillRect(p.x - 3, p.gapY - 14, p.w + 6, 14); ctx.fillRect(p.x - 3, p.gapY + this.gapSize, p.w + 6, 14);
      ctx.fillStyle = "#2ee6a6";
    }

    ctx.save();
    ctx.translate(this.bird.x, this.bird.y);
    ctx.rotate(this.bird.rot);
    ctx.fillStyle = "#ffd76a";
    ctx.beginPath(); ctx.arc(0, 0, this.bird.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff9f43";
    ctx.beginPath(); ctx.moveTo(this.bird.r - 2, -3); ctx.lineTo(this.bird.r + 10, 0); ctx.lineTo(this.bird.r - 2, 5); ctx.fill();
    ctx.fillStyle = "#1a1200";
    ctx.beginPath(); ctx.arc(5, -5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}

export default FlappyBirdGame;
