// ==========================================================================
// Pixel Quest — side-scrolling platformer: run, jump, collect gems, survive
// spike hazards and reach the goal flag.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { roundRect } from "./canvasUtils.js";
import { clamp, randInt } from "../core/utils.js";

const GRAVITY = 1900;

export class PlatformerGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move with the arrow keys or A/D, and jump with Space / Up.",
      "Collect gems for bonus points and avoid the red spike hazards.",
      "Reach the checkered flag at the end of the level to win.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "D-pad to move, ● to jump."; }
  getKeyboardHint() { return "Arrow keys / A-D to move, Space or Up to jump."; }

  getScene() { return "aurora"; }
  onInit() { this.createCanvas(); }

  onStart(difficulty) {
    const gapRange = difficulty === "Hard" ? [70, 130] : difficulty === "Normal" ? [55, 105] : [40, 85];
    const platCount = difficulty === "Hard" ? 26 : 20;
    this._buildLevel(platCount, gapRange);
    this.player = { x: 40, y: 0, vx: 0, vy: 0, w: 26, h: 34, onGround: false, facing: 1 };
    const first = this.platforms[0];
    this.player.y = first.y - this.player.h;
    this.checkpoint = { x: this.player.x, y: this.player.y };
    this.lives = 3;
    this.gemsCollected = 0;
    this.camX = 0;
    this.setScore(0);
    this._updateHud();
  }

  _buildLevel(count, gapRange) {
    this.platforms = [];
    this.gems = [];
    this.hazards = [];
    let x = 0, y = 320;
    for (let i = 0; i < count; i++) {
      const w = randInt(90, 170);
      this.platforms.push({ x, y, w, h: 20 });
      if (Math.random() < 0.55) this.gems.push({ x: x + w / 2, y: y - 34, collected: false });
      if (i > 2 && Math.random() < 0.3) this.hazards.push({ x: x + w * 0.3, y: y - 14, w: 18, h: 14 });
      const dy = randInt(-70, 70);
      x += w + randInt(gapRange[0], gapRange[1]);
      y = clamp(y + dy, 200, 380);
    }
    this.goal = { x: x + 40, y: y - 60, w: 20, h: 60 };
    this.levelEnd = x + 140;
  }

  _updateHud() { this.setHud({ Score: this.score, Gems: this.gemsCollected, Lives: "❤️".repeat(Math.max(0, this.lives)) }); }

  onUpdate(dt) {
    const p = this.player;
    const speed = 260;
    const left = this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left;
    const right = this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right;
    p.vx = 0;
    if (left) { p.vx = -speed; p.facing = -1; }
    if (right) { p.vx = speed; p.facing = 1; }
    if ((this.input.consumePressed("Space") || this.input.consumePressed("ArrowUp") || this.input.consumePressed("KeyW") || this.input.virtual.a) && p.onGround) {
      p.vy = -720; p.onGround = false; audioManager.play("jump");
    }

    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.onGround = false;

    for (const plat of this.platforms) {
      if (p.vy >= 0 && p.x + p.w * 0.3 > plat.x && p.x + p.w * 0.7 < plat.x + plat.w && p.y + p.h >= plat.y && p.y + p.h <= plat.y + 22) {
        p.y = plat.y - p.h; p.vy = 0; p.onGround = true;
        this.checkpoint = { x: plat.x + 10, y: plat.y - p.h };
      }
    }

    for (const g of this.gems) {
      if (g.collected) continue;
      if (Math.hypot(p.x - g.x, p.y - g.y) < 26) { g.collected = true; this.gemsCollected++; this.addScore(25); audioManager.play("coin"); }
    }
    for (const h of this.hazards) {
      if (p.x + p.w > h.x && p.x < h.x + h.w && p.y + p.h > h.y && p.y < h.y + h.h) return this._hurt();
    }
    if (p.y > 480) return this._hurt();

    if (p.x + p.w > this.goal.x && p.x < this.goal.x + this.goal.w && p.y + p.h > this.goal.y) return this._win();

    this.camX = clamp(p.x - this.viewW * 0.4, 0, Math.max(0, this.levelEnd - this.viewW + 100));
  }

  _hurt() {
    this.lives -= 1;
    this.shake();
    audioManager.play("error");
    this._updateHud();
    if (this.lives <= 0) return this._lose();
    this.player.x = this.checkpoint.x; this.player.y = this.checkpoint.y; this.player.vy = 0;
  }

  _win() {
    audioManager.play("win");
    this.endGame({ result: "win", score: this.score, message: `Collected ${this.gemsCollected} gems!`, extraStats: [{ label: "Gems", value: this.gemsCollected }] });
  }
  _lose() {
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: `Collected ${this.gemsCollected} gems before falling.` });
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.translate(-this.camX, 0);

    ctx.fillStyle = "#22314f";
    for (const plat of this.platforms) { roundRect(ctx, plat.x, plat.y, plat.w, plat.h, 4); ctx.fill(); }

    ctx.fillStyle = "#ffd76a";
    for (const g of this.gems) { if (g.collected) continue; ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(performance.now() / 400); ctx.fillRect(-6, -6, 12, 12); ctx.restore(); }

    ctx.fillStyle = "#ff5470";
    for (const h of this.hazards) { ctx.beginPath(); ctx.moveTo(h.x, h.y + h.h); ctx.lineTo(h.x + h.w / 2, h.y); ctx.lineTo(h.x + h.w, h.y + h.h); ctx.fill(); }

    ctx.fillStyle = "#2ee6a6";
    ctx.fillRect(this.goal.x, this.goal.y, 4, this.goal.h);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 === 0 ? "#fff" : "#0a0d18"; ctx.fillRect(this.goal.x + 4, this.goal.y + i * 10, 16, 10); }

    const p = this.player;
    ctx.fillStyle = "#22d3ee";
    roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fill();
    ctx.fillStyle = "#0a0d18";
    ctx.beginPath(); ctx.arc(p.x + p.w / 2 + p.facing * 5, p.y + 10, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

export default PlatformerGame;
