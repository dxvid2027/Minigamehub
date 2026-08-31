// ==========================================================================
// Neon Runner — endless side-scroller: jump and slide past obstacles.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas, roundRect } from "./canvasUtils.js";
import { randInt } from "../core/utils.js";

export class EndlessRunnerGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Jump over low obstacles and slide under high ones.",
      "Your score climbs with distance — speed increases over time.",
      "One hit ends the run, so time your moves carefully.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap to jump, swipe down to slide."; }
  getKeyboardHint() { return "Space / Up to jump, Down to slide."; }

  onInit() {
    this.createCanvas();
    this.input.onTap(() => this._jump());
    this.input.onSwipe((dir) => { if (dir === "up") this._jump(); if (dir === "down") this._slideStart(); });
  }

  onStart(difficulty) {
    this.groundY = this.viewH - 46;
    this.speed = difficulty === "Hard" ? 340 : difficulty === "Normal" ? 270 : 210;
    this.baseSpeed = this.speed;
    this.player = { x: 90, y: this.groundY - 40, vy: 0, w: 32, h: 40, onGround: true, sliding: false, slideT: 0 };
    this.obstacles = [];
    this.distance = 0;
    this.spawnTimer = 1;
    this.setScore(0);
    this.setHud({ Score: 0, Speed: "1.0x" });
  }

  _jump() {
    if (this.state !== "playing" || !this.player.onGround) return;
    this.player.vy = -640;
    this.player.onGround = false;
    audioManager.play("jump");
  }
  _slideStart() {
    if (this.state !== "playing" || !this.player.onGround) return;
    this.player.sliding = true; this.player.slideT = 0.55;
  }

  onUpdate(dt) {
    if (this.input.consumePressed("Space") || this.input.consumePressed("ArrowUp") || this.input.virtual.a) this._jump();
    if (this.input.isDown("ArrowDown", "KeyS")) this._slideStart();

    this.speed += dt * 4;
    this.distance += this.speed * dt * 0.1;
    this.setScore(Math.floor(this.distance));

    const p = this.player;
    p.vy += 1700 * dt;
    p.y += p.vy * dt;
    const groundTop = this.groundY - (p.sliding ? 20 : 40);
    if (p.y >= groundTop) { p.y = groundTop; p.vy = 0; p.onGround = true; } else p.onGround = false;
    if (p.sliding) { p.slideT -= dt; if (p.slideT <= 0) p.sliding = false; }
    p.h = p.sliding ? 20 : 40;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.55, 1.3 - this.speed / 700);
      const high = Math.random() < 0.35;
      this.obstacles.push(high
        ? { x: this.viewW + 20, w: 46, h: 30, y: this.groundY - 66, type: "high" }
        : { x: this.viewW + 20, w: 24, h: 34 + randInt(0, 16), y: 0, type: "low" });
      if (this.obstacles.length) { const last = this.obstacles[this.obstacles.length - 1]; if (last.type === "low") last.y = this.groundY - last.h; }
    }
    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -10);

    for (const o of this.obstacles) {
      const px1 = p.x - p.w / 2, px2 = p.x + p.w / 2, py1 = p.y, py2 = p.y + p.h;
      const ox1 = o.x, ox2 = o.x + o.w, oy1 = o.y, oy2 = o.y + o.h;
      if (px1 < ox2 && px2 > ox1 && py1 < oy2 && py2 > oy1) return this._die();
    }
    this.setHud({ Score: this.score, Speed: (this.speed / this.baseSpeed).toFixed(1) + "x" });
  }

  _die() {
    this.shake();
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: `You ran ${this.score}m.` });
  }

  onRender(ctx, dt) {
    clearCanvas(ctx, this.canvas, "#0a0e1c");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    this._bgOffset = ((this._bgOffset || 0) + this.speed * dt * 0.3) % 80;
    ctx.strokeStyle = "#7c5cff22";
    for (let i = -1; i < this.viewW / 80 + 1; i++) { ctx.beginPath(); ctx.moveTo(i * 80 - this._bgOffset, 0); ctx.lineTo(i * 80 - this._bgOffset, this.groundY); ctx.stroke(); }
    ctx.fillStyle = "#12142a"; ctx.fillRect(0, this.groundY, this.viewW, this.viewH - this.groundY);
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, this.groundY); ctx.lineTo(this.viewW, this.groundY); ctx.stroke();

    ctx.fillStyle = "#ff4fd8";
    for (const o of this.obstacles) { roundRect(ctx, o.x, o.y, o.w, o.h, 5); ctx.fill(); }

    const p = this.player;
    ctx.fillStyle = "#2ee6a6";
    roundRect(ctx, p.x - p.w / 2, p.y, p.w, p.h, 8); ctx.fill();
    ctx.restore();
  }
}

export default EndlessRunnerGame;
