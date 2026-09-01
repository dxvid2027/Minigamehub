// ==========================================================================
// Hoop Shot — slingshot-style basketball: drag back and release to shoot.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp } from "../core/utils.js";

const GRAVITY = 1400;

export class BasketballGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Drag back from the ball like a slingshot, then release to shoot.",
      "Sink as many baskets as you can before the clock runs out.",
      "On higher difficulty the hoop drifts side to side.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag back from the ball and release to shoot."; }
  getKeyboardHint() { return "Click and drag back from the ball, then release."; }

  getScene() { return "aurora"; }
  onInit() {
    this.createCanvas();
    this.input.onPointer("down", (p) => { if (!this.inFlight) this.drag = { sx: p.x, sy: p.y, x: p.x, y: p.y }; });
    this.input.onPointer("move", (p) => { if (this.drag) { this.drag.x = p.x; this.drag.y = p.y; } });
    this.input.onPointer("up", () => { if (this.drag) { this._shoot(); this.drag = null; } });
  }

  onStart(difficulty) {
    this.roundTime = 45;
    this.hoopMove = difficulty === "Hard" ? 70 : difficulty === "Normal" ? 35 : 0;
    this.hoopSpeed = difficulty === "Hard" ? 1.4 : 1;
    this.baseHoopX = this.viewW / 2;
    this.hoopY = this.viewH * 0.22;
    this.hoop = { x: this.baseHoopX, y: this.hoopY, w: 70 };
    this.startPos = { x: this.viewW / 2, y: this.viewH - 60 };
    this.ball = { x: this.startPos.x, y: this.startPos.y, vx: 0, vy: 0, r: 16 };
    this.inFlight = false;
    this.streak = 0;
    this.made = 0;
    this._scoredThisFlight = false;
    this._t = 0;
    this.setScore(0);
    this.setHud({ Score: 0, Time: this.roundTime, Streak: "x1" });
  }

  _shoot() {
    const dx = this.drag.sx - this.drag.x, dy = this.drag.sy - this.drag.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) return;
    const power = clamp(dist * 7, 0, 1350);
    const ang = Math.atan2(dy, dx);
    this.ball.vx = Math.cos(ang) * power;
    this.ball.vy = Math.sin(ang) * power;
    this.inFlight = true;
    this._scoredThisFlight = false;
    audioManager.play("swoosh");
  }

  onUpdate(dt) {
    this.roundTime -= dt;
    if (this.roundTime <= 0) return this._finish();

    this._t += dt;
    if (this.hoopMove) this.hoop.x = this.baseHoopX + Math.sin(this._t * this.hoopSpeed) * this.hoopMove;

    if (this.inFlight) {
      this._prevBallY = this.ball.y;
      this.ball.vy += GRAVITY * dt;
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;

      // Score when the ball falls through the rim plane anywhere inside the
      // hoop mouth. The old window was so tight that clean-looking shots
      // passed straight through without counting.
      if (!this._scoredThisFlight && this.ball.vy > 0 &&
          this._prevBallY <= this.hoop.y && this.ball.y >= this.hoop.y &&
          Math.abs(this.ball.x - this.hoop.x) < this.hoop.w / 2 - 2) {
        this._score();
      }
      // Bounce off the side walls instead of vanishing — keeps rebounds alive.
      if (this.ball.x - this.ball.r < 0) { this.ball.x = this.ball.r; this.ball.vx = Math.abs(this.ball.vx) * 0.7; audioManager.play("hit"); }
      if (this.ball.x + this.ball.r > this.viewW) { this.ball.x = this.viewW - this.ball.r; this.ball.vx = -Math.abs(this.ball.vx) * 0.7; audioManager.play("hit"); }
      if (this.ball.y > this.viewH + 40) this._resetBall();
    } else if (!this.drag) {
      this.ball.x = this.startPos.x; this.ball.y = this.startPos.y;
    } else {
      this.ball.x = this.startPos.x - (this.drag.sx - this.drag.x) * 0.4;
      this.ball.y = this.startPos.y - (this.drag.sy - this.drag.y) * 0.4;
    }
    this.setHud({ Score: this.score, Time: Math.ceil(this.roundTime), Streak: `x${1 + Math.floor(this.streak / 2)}` });
  }

  _score() {
    this._scoredThisFlight = true;
    this.made++;
    this.streak++;
    const gained = 10 + Math.min(30, this.streak * 3);
    this.addScore(gained);
    audioManager.play("coin");
    this.particles.confetti(this.hoop.x, this.hoop.y, 14);
    setTimeout(() => this._resetBall(), 150);
  }

  _resetBall() {
    if (!this._scoredThisFlight) this.streak = 0;
    this.inFlight = false;
    this.ball.x = this.startPos.x; this.ball.y = this.startPos.y; this.ball.vx = 0; this.ball.vy = 0;
  }

  _finish() {
    audioManager.play(this.made > 0 ? "win" : "gameover");
    this.endGame({ result: this.made >= 10 ? "win" : "score", score: this.score, message: `${this.made} baskets made!`, extraStats: [{ label: "Baskets", value: this.made }] });
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);

    ctx.strokeStyle = "#ff5470"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(this.hoop.x - this.hoop.w / 2, this.hoop.y); ctx.lineTo(this.hoop.x + this.hoop.w / 2, this.hoop.y); ctx.stroke();
    ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(this.hoop.x + i * (this.hoop.w / 7), this.hoop.y); ctx.lineTo(this.hoop.x + i * (this.hoop.w / 8), this.hoop.y + 26); ctx.stroke(); }
    ctx.fillStyle = "#22314f"; ctx.fillRect(this.hoop.x + this.hoop.w / 2, this.hoop.y - 30, 8, 60);
    ctx.fillStyle = "#ffffff18"; ctx.fillRect(this.hoop.x + this.hoop.w / 2 - 4, this.hoop.y - 30, 46, 34);

    if (this.drag) {
      ctx.strokeStyle = "#22d3ee88"; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(this.startPos.x, this.startPos.y); ctx.lineTo(this.ball.x, this.ball.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = "#ff9f43";
    ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#00000055"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.ball.x - this.ball.r, this.ball.y); ctx.lineTo(this.ball.x + this.ball.r, this.ball.y); ctx.stroke();

    if (!this.inFlight && !this.drag) {
      ctx.fillStyle = "#ffffff77"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Drag back & release to shoot", this.viewW / 2, this.viewH - 20);
    }
    ctx.restore();
  }
}

export default BasketballGame;
