// ==========================================================================
// Turbo Rush — vertical-scrolling traffic dodger, speed ramps up over time.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { roundRect } from "./canvasUtils.js";
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
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return []; }
  getTouchHint() { return "Use the D-pad (or drag) to steer left and right."; }
  getKeyboardHint() { return "Arrow keys or A/D to steer."; }

  getScene() { return "grid"; }
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

  _updateHud() { this.setHud({ Score: this.score, Lives: GameBase.hearts(this.lives), Speed: (this.speed / this.baseSpeed).toFixed(1) + "x" }); }

  onUpdate(dt) {
    this.speed += dt * 6;
    this.distance += this.speed * dt * 0.08;
    this.setScore(Math.floor(this.distance));

    const steer = 380;
    if (this._dragX != null) this.player.x += clamp(this._dragX - this.player.x, -steer * dt, steer * dt);
    // Analog steering: a half-pushed stick makes a gentle lane change.
    this.player.x += this.input.axes().x * steer * dt;
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

  _drawCar(ctx, cx, cy, w, h, color, isPlayer) {
    const x = cx - w / 2, y = cy - h / 2;
    this.gfx.contactShadow(ctx, x + w / 2, y + h * 0.98, w * 0.62, h * 0.14, 0.42);
    this.gfx.block(ctx, x, y, w, h, 8, color, { glow: isPlayer ? 0.6 : 0.3 });
    // Cabin glass
    ctx.fillStyle = "rgba(6,10,24,0.55)";
    roundRect(ctx, x + w * 0.16, y + h * (isPlayer ? 0.16 : 0.5), w * 0.68, h * 0.28, 4); ctx.fill();
    // Head/tail lights
    ctx.fillStyle = isPlayer ? "rgba(255,255,255,0.9)" : "rgba(255,120,120,0.9)";
    const ly = isPlayer ? y + 2 : y + h - 5;
    ctx.fillRect(x + 4, ly, 5, 3);
    ctx.fillRect(x + w - 9, ly, 5, 3);
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    // Asphalt with a soft sheen down the middle
    const road = ctx.createLinearGradient(this.roadX, 0, this.roadX + this.roadW, 0);
    road.addColorStop(0, "#12162a"); road.addColorStop(0.5, "#1c2238"); road.addColorStop(1, "#12162a");
    ctx.fillStyle = road; ctx.fillRect(this.roadX, 0, this.roadW, this.viewH);
    this.gfx.neonLine(ctx, this.roadX, 0, this.roadX, this.viewH, "#22d3ee", 2, 0.5);
    this.gfx.neonLine(ctx, this.roadX + this.roadW, 0, this.roadX + this.roadW, this.viewH, "#22d3ee", 2, 0.5);

    this._dashOffset = ((this._dashOffset || 0) + this.speed * dt) % 44;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.setLineDash([20, 24]); ctx.lineDashOffset = -this._dashOffset;
    ctx.shadowColor = "rgba(255,255,255,0.35)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(this.roadX + this.roadW / 2, 0); ctx.lineTo(this.roadX + this.roadW / 2, this.viewH); ctx.stroke();
    ctx.restore();

    for (const c of this.traffic) this._drawCar(ctx, c.x, c.y, c.w, c.h, c.color, false);

    if (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0) {
      this._drawCar(ctx, this.player.x, this.viewH - 70, this.player.w, this.player.h, "#2ee6a6", true);
    }
    ctx.restore();
  }
}

export default RacingGame;
