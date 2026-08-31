// ==========================================================================
// Turbo Rush — vertical-scrolling traffic dodger, speed ramps up over time.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas, roundRect } from "./canvasUtils.js";
import { clamp, randInt } from "../core/utils.js";

export class RacingGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Steer left and right to weave through oncoming traffic.",
      "Your speed — and your score — climbs the longer you survive.",
      "You have 3 lives; colliding costs one and grants brief invincibility.",
    ];
  }
  getTouchLayout() { return "dpad" ;}
  getTouchButtons() { return []; }
  getTouchHint() { return "Use the D-pad (or drag) to steer left and right."; }
  getKeyboardHint() { return "Arrow keys or A/D to steer."; }

  onInit() {
    this.createCanvas();
    this.input.onPointer("move", (p) => { this._dragX = p.x; });
  }

  onStart(difficulty) {
    this.roadW = Math.min(this.viewW * 0.72, 320);
    this.roadX = (this.viewW - this.roadW) / 2;
    this.baseSpeed = difficulty === "Hard" ? 320 : difficulty === "Normal" ? 250 : 190;
    this.speed = this.baseSpeed;
    this.player = { x: this.viewW / 2, w: 30, h: 50 };
    this.traffic = [];
    this.spawnTimer = 0.9;
    this.lives = 3;
    this.invuln = 0;
    this.distance = 0;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() { this.setHud({ Score: this.score, Lives: "❤️".repeat(Math.max(0, this.lives)), Speed: (this.speed / this.baseSpeed).toFixed(1) + "x" }); }

  onUpdate(dt) {
    this.speed += dt * 6;
    this.distance += this.speed * dt * 0.08;
    this.setScore(Math.floor(this.distance));

    const steer = 380;
    if (this._dragX != null) this.player.x += clamp(this._dragX - this.player.x, -steer * dt, steer * dt);
    if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) this.player.x -= steer * dt;
    if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) this.player.x += steer * dt;
    this.player.x = clamp(this.player.x, this.roadX + 20, this.roadX + this.roadW - 20);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.45, 1.1 - this.speed / 900);
      const lane = this.roadX + 30 + Math.random() * (this.roadW - 60);
      this.traffic.push({ x: lane, y: -60, w: 28, h: 46, color: ["#ff5470", "#ffd76a", "#22d3ee", "#ff9f43"][randInt(0, 3)] });
    }
    for (const c of this.traffic) c.y += this.speed * dt;
    this.traffic = this.traffic.filter(c => c.y < this.viewH + 60);

    if (this.invuln > 0) this.invuln -= dt;
    if (this.invuln <= 0) {
      for (const c of this.traffic) {
        if (Math.abs(c.x - this.player.x) < (c.w + this.player.w) / 2 - 6 && Math.abs(c.y - (this.viewH - 70)) < (c.h + this.player.h) / 2 - 6) {
          this._crash();
          break;
        }
      }
    }
    this._updateHud();
  }

  _crash() {
    this.lives -= 1;
    this.shake();
    audioManager.play("explosion");
    this.vibrateOn(60);
    if (this.lives <= 0) return this._gameOver();
    this.invuln = 1.6;
    this.traffic = this.traffic.filter(c => Math.abs(c.y - (this.viewH - 70)) > 60);
  }

  _gameOver() {
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: `You drove ${this.score}m.` });
  }

  onRender(ctx, dt) {
    clearCanvas(ctx, this.canvas, "#0a0a12");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = "#181c2c"; ctx.fillRect(this.roadX, 0, this.roadW, this.viewH);
    ctx.strokeStyle = "#ffffff33"; ctx.lineWidth = 3; ctx.strokeRect(this.roadX, 0, this.roadW, this.viewH);

    this._dashOffset = ((this._dashOffset || 0) + this.speed * dt) % 40;
    ctx.strokeStyle = "#ffffff55"; ctx.setLineDash([18, 18]); ctx.lineDashOffset = -this._dashOffset;
    ctx.beginPath(); ctx.moveTo(this.roadX + this.roadW / 2, 0); ctx.lineTo(this.roadX + this.roadW / 2, this.viewH); ctx.stroke();
    ctx.setLineDash([]);

    for (const c of this.traffic) { ctx.fillStyle = c.color; roundRect(ctx, c.x - c.w / 2, c.y - c.h / 2, c.w, c.h, 6); ctx.fill(); }

    if (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0) {
      ctx.fillStyle = "#2ee6a6";
      roundRect(ctx, this.player.x - this.player.w / 2, this.viewH - 70 - this.player.h / 2, this.player.w, this.player.h, 7); ctx.fill();
    }
    ctx.restore();
  }
}

export default RacingGame;
