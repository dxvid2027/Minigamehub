// ==========================================================================
// Pong Duel — classic paddle battle vs an adaptive AI, first to 11 wins.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas } from "./canvasUtils.js";
import { clamp } from "../core/utils.js";

const WIN_SCORE = 11;

export class PongGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Defend your side (right) and knock the ball past the AI.",
      `First player to reach ${WIN_SCORE} points wins the match.`,
      "The ball speeds up slightly with every rally.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag anywhere on the board to move your paddle."; }
  getKeyboardHint() { return "Arrow Up/Down or W/S to move your paddle."; }

  onInit() {
    this.createCanvas();
    this.input.onPointer("move", (p) => { this._dragY = p.y; });
  }

  onStart(difficulty) {
    this.pW = 12; this.pH = 80; this.ballR = 8;
    this.p1 = { y: this.viewH / 2 - this.pH / 2, score: 0 }; // AI, left
    this.p2 = { y: this.viewH / 2 - this.pH / 2, score: 0 }; // player, right
    this.aiSpeed = difficulty === "Hard" ? 430 : difficulty === "Normal" ? 320 : 220;
    this._resetBall(Math.random() > 0.5 ? 1 : -1);
    this.setHud({ You: 0, AI: 0 });
  }

  _resetBall(dir) {
    this.ball = { x: this.viewW / 2, y: this.viewH / 2, vx: 260 * dir, vy: (Math.random() * 2 - 1) * 200 };
  }

  onUpdate(dt) {
    const up = this.input.isDown("ArrowUp", "KeyW") || this.input.virtual.up;
    const down = this.input.isDown("ArrowDown", "KeyS") || this.input.virtual.down;
    const speed = 420;
    if (this._dragY != null) {
      this.p2.y += clamp(this._dragY - (this.p2.y + this.pH / 2), -speed * dt, speed * dt);
    }
    if (up) this.p2.y -= speed * dt;
    if (down) this.p2.y += speed * dt;
    this.p2.y = clamp(this.p2.y, 0, this.viewH - this.pH);

    const target = this.ball.y - this.pH / 2 + (Math.random() - 0.5) * 30;
    const dy = clamp(target - this.p1.y, -this.aiSpeed * dt, this.aiSpeed * dt);
    this.p1.y = clamp(this.p1.y + dy, 0, this.viewH - this.pH);

    const b = this.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y - this.ballR < 0) { b.y = this.ballR; b.vy *= -1; }
    if (b.y + this.ballR > this.viewH) { b.y = this.viewH - this.ballR; b.vy *= -1; }

    if (b.vx < 0 && b.x - this.ballR < this.pW + 4 && b.y > this.p1.y && b.y < this.p1.y + this.pH) {
      this._bounce(this.p1, this.pW + 4 + this.ballR);
    }
    if (b.vx > 0 && b.x + this.ballR > this.viewW - this.pW - 4 && b.y > this.p2.y && b.y < this.p2.y + this.pH) {
      this._bounce(this.p2, this.viewW - this.pW - 4 - this.ballR);
    }

    if (b.x < -30) { this._score("p2"); }
    else if (b.x > this.viewW + 30) { this._score("p1"); }
  }

  _bounce(paddle, x) {
    const b = this.ball;
    b.x = x;
    const rel = (b.y - (paddle.y + this.pH / 2)) / (this.pH / 2);
    b.vy = rel * 320;
    b.vx *= -1.045;
    b.vx = clamp(b.vx, -620, 620);
    audioManager.play("hit");
  }

  _score(who) {
    if (who === "p1") { this.p1.score++; this._resetBall(1); } else { this.p2.score++; this._resetBall(-1); }
    audioManager.play("score");
    this.setHud({ You: this.p2.score, AI: this.p1.score });
    this.setScore(this.p2.score);
    if (this.p1.score >= WIN_SCORE) this.endGame({ result: "loss", score: this.p2.score, message: `AI won ${this.p1.score}-${this.p2.score}` });
    else if (this.p2.score >= WIN_SCORE) this.endGame({ result: "win", score: this.p2.score, message: `You won ${this.p2.score}-${this.p1.score}!` });
  }

  onRender(ctx) {
    clearCanvas(ctx, this.canvas, "#070912");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.strokeStyle = "#ffffff22"; ctx.setLineDash([8, 10]);
    ctx.beginPath(); ctx.moveTo(this.viewW / 2, 0); ctx.lineTo(this.viewW / 2, this.viewH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#22d3ee"; ctx.fillRect(4, this.p1.y, this.pW, this.pH);
    ctx.fillStyle = "#2ee6a6"; ctx.fillRect(this.viewW - this.pW - 4, this.p2.y, this.pW, this.pH);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ballR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export default PongGame;
