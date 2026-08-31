// ==========================================================================
// Air Hockey — fast puck physics vs an AI mallet, first to 7 goals wins.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas } from "./canvasUtils.js";
import { clamp } from "../core/utils.js";

const WIN_GOALS = 7;

export class AirHockeyGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Drag your mallet (bottom half) to strike the puck.",
      `First to ${WIN_GOALS} goals wins the match.`,
      "Hit the puck with a moving mallet for extra power.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag your mallet around the bottom half of the table."; }
  getKeyboardHint() { return "Move the mouse to control your mallet (arrow keys also work)."; }

  onInit() {
    this.createCanvas();
    this.input.onPointer("move", (p) => { this._target = { x: p.x, y: p.y }; });
  }

  onStart(difficulty) {
    this.aiSpeed = difficulty === "Hard" ? 420 : difficulty === "Normal" ? 310 : 220;
    this.goalW = this.viewW * 0.42;
    this.puck = { x: this.viewW / 2, y: this.viewH / 2, vx: 0, vy: 0, r: 13 };
    this.player = { x: this.viewW / 2, y: this.viewH - 70, r: 24, vx: 0, vy: 0 };
    this.ai = { x: this.viewW / 2, y: 70, r: 24 };
    this.scoreP = 0; this.scoreAI = 0;
    this._target = null;
    this.setHud({ You: 0, AI: 0 });
    this.setScore(0);
  }

  onUpdate(dt) {
    const p = this.player;
    const speed = 520;
    const prevX = p.x, prevY = p.y;
    if (this._target) {
      p.x += clamp(this._target.x - p.x, -speed * dt, speed * dt);
      p.y += clamp(this._target.y - p.y, -speed * dt, speed * dt);
    }
    if (this.input.isDown("ArrowLeft", "KeyA")) p.x -= speed * dt;
    if (this.input.isDown("ArrowRight", "KeyD")) p.x += speed * dt;
    if (this.input.isDown("ArrowUp", "KeyW")) p.y -= speed * dt;
    if (this.input.isDown("ArrowDown", "KeyS")) p.y += speed * dt;
    p.x = clamp(p.x, p.r, this.viewW - p.r);
    p.y = clamp(p.y, this.viewH / 2 + p.r, this.viewH - p.r);
    p.vx = (p.x - prevX) / Math.max(dt, 0.001);
    p.vy = (p.y - prevY) / Math.max(dt, 0.001);

    // AI mallet tracks the puck when it's on its half, otherwise recenters.
    const ai = this.ai;
    const targetX = this.puck.y < this.viewH / 2 ? this.puck.x : this.viewW / 2;
    const targetY = this.puck.y < this.viewH / 2 ? Math.min(this.puck.y - 6, this.viewH / 2 - ai.r) : 70;
    ai.x += clamp(targetX - ai.x, -this.aiSpeed * dt, this.aiSpeed * dt);
    ai.y += clamp(targetY - ai.y, -this.aiSpeed * dt, this.aiSpeed * dt);
    ai.x = clamp(ai.x, ai.r, this.viewW - ai.r);
    ai.y = clamp(ai.y, ai.r, this.viewH / 2 - ai.r);

    const k = this.puck;
    k.x += k.vx * dt; k.y += k.vy * dt;
    k.vx *= 0.995; k.vy *= 0.995;

    if (k.x - k.r < 0) { k.x = k.r; k.vx = Math.abs(k.vx); audioManager.play("hit"); }
    if (k.x + k.r > this.viewW) { k.x = this.viewW - k.r; k.vx = -Math.abs(k.vx); audioManager.play("hit"); }

    const goalMinX = (this.viewW - this.goalW) / 2, goalMaxX = goalMinX + this.goalW;
    if (k.y - k.r < 0) {
      if (k.x > goalMinX && k.x < goalMaxX) return this._goal("player");
      k.y = k.r; k.vy = Math.abs(k.vy); audioManager.play("hit");
    }
    if (k.y + k.r > this.viewH) {
      if (k.x > goalMinX && k.x < goalMaxX) return this._goal("ai");
      k.y = this.viewH - k.r; k.vy = -Math.abs(k.vy); audioManager.play("hit");
    }

    this._collide(p, true);
    this._collide(ai, false);
  }

  _collide(mallet, isPlayer) {
    const k = this.puck;
    const dx = k.x - mallet.x, dy = k.y - mallet.y;
    const dist = Math.hypot(dx, dy);
    const minDist = k.r + mallet.r;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist, ny = dy / dist;
    k.x = mallet.x + nx * minDist;
    k.y = mallet.y + ny * minDist;
    const impact = isPlayer ? Math.hypot(mallet.vx || 0, mallet.vy || 0) * 0.35 : 180;
    const base = Math.hypot(k.vx, k.vy) * 0.6;
    const power = clamp(base + impact + 220, 220, 900);
    k.vx = nx * power; k.vy = ny * power;
    audioManager.play("pop");
    this.vibrateOn(15);
  }

  _goal(scorer) {
    if (scorer === "player") { this.scoreP++; audioManager.play("coin"); this.particles.confetti(this.viewW / 2, 40, 16); }
    else { this.scoreAI++; audioManager.play("error"); this.shake(); }
    this.setHud({ You: this.scoreP, AI: this.scoreAI });
    this.setScore(this.scoreP);
    if (this.scoreP >= WIN_GOALS) return this.endGame({ result: "win", score: this.scoreP, message: `You won ${this.scoreP}-${this.scoreAI}!` });
    if (this.scoreAI >= WIN_GOALS) return this.endGame({ result: "loss", score: this.scoreP, message: `The AI won ${this.scoreAI}-${this.scoreP}.` });
    this.puck = { x: this.viewW / 2, y: this.viewH / 2, vx: 0, vy: (scorer === "player" ? 1 : -1) * 180, r: 13 };
  }

  onRender(ctx) {
    clearCanvas(ctx, this.canvas, "#0b1220");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, this.viewH / 2); ctx.lineTo(this.viewW, this.viewH / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(this.viewW / 2, this.viewH / 2, 56, 0, Math.PI * 2); ctx.stroke();

    const goalMinX = (this.viewW - this.goalW) / 2;
    ctx.fillStyle = "#2ee6a655"; ctx.fillRect(goalMinX, 0, this.goalW, 6);
    ctx.fillStyle = "#ff547055"; ctx.fillRect(goalMinX, this.viewH - 6, this.goalW, 6);

    ctx.fillStyle = "#22d3ee";
    ctx.beginPath(); ctx.arc(this.ai.x, this.ai.y, this.ai.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2ee6a6";
    ctx.beginPath(); ctx.arc(this.player.x, this.player.y, this.player.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.shadowColor = "#fff"; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

export default AirHockeyGame;
