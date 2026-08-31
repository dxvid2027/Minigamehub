// ==========================================================================
// Stack Tower — time your taps to stack blocks perfectly and build high.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas } from "./canvasUtils.js";

const BLOCK_H = 26;

export class StackTowerGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "A block slides back and forth — tap or press Space to drop it.",
      "Anything hanging over the block below gets sliced off.",
      "Perfect drops restore a little width and score a bonus.",
    ];
  }
  getTouchLayout() { return "single"; }
  getTouchIcon() { return "⬇"; }
  getTouchHint() { return "Tap anywhere (or the button) to drop the block."; }
  getKeyboardHint() { return "Space or click to drop the block."; }

  onInit() {
    this.createCanvas();
    this.input.onTap(() => this._drop());
  }

  onStart(difficulty) {
    this.speedBase = difficulty === "Hard" ? 300 : difficulty === "Normal" ? 230 : 170;
    const w = Math.min(200, this.viewW * 0.5);
    this.stack = [{ x: (this.viewW - w) / 2, w, color: this._color(0) }];
    this.current = { x: 0, w, dir: 1 };
    this.height = 0;
    this.perfects = 0;
    this.camY = 0;
    this.setScore(0);
    this.setHud({ Blocks: 0, Perfect: 0 });
  }

  _color(i) {
    const hue = (i * 18) % 360;
    return `hsl(${hue}, 70%, 58%)`;
  }

  onUpdate(dt) {
    if (this.input.consumePressed("Space") || (this.input.virtual.a && !this._wasDown)) this._drop();
    this._wasDown = this.input.virtual.a;

    const speed = this.speedBase + this.height * 5;
    this.current.x += speed * this.current.dir * dt;
    if (this.current.x <= 0) { this.current.x = 0; this.current.dir = 1; }
    if (this.current.x + this.current.w >= this.viewW) { this.current.x = this.viewW - this.current.w; this.current.dir = -1; }

    const targetCam = Math.max(0, (this.height - 6) * BLOCK_H);
    this.camY += (targetCam - this.camY) * Math.min(1, dt * 8);
  }

  _drop() {
    if (this.state !== "playing") return;
    const below = this.stack[this.stack.length - 1];
    const cur = this.current;
    const left = Math.max(cur.x, below.x);
    const right = Math.min(cur.x + cur.w, below.x + below.w);
    const overlap = right - left;

    if (overlap <= 0) {
      this.shake();
      audioManager.play("gameover");
      return this.endGame({ result: "loss", score: this.height, message: `You stacked ${this.height} blocks.`, extraStats: [{ label: "Perfect", value: this.perfects }] });
    }

    const offset = Math.abs(cur.x - below.x);
    const perfect = offset < 6;
    const newW = perfect ? Math.min(below.w + 4, below.w * 1.02 + 4) : overlap;
    const newX = perfect ? below.x : left;

    this.height += 1;
    if (perfect) { this.perfects += 1; this.addScore(15); audioManager.play("coin"); this.particles.confetti(newX + newW / 2, this.viewH - 100, 10); }
    else { this.addScore(5); audioManager.play("hit"); }

    this.stack.push({ x: newX, w: newW, color: this._color(this.height) });
    this.current = { x: this.current.dir > 0 ? 0 : this.viewW - newW, w: newW, dir: this.current.dir * -1 };
    this.setHud({ Blocks: this.height, Perfect: this.perfects });
    this.setScore(this.height * 10 + this.perfects * 15);
  }

  onRender(ctx) {
    clearCanvas(ctx, this.canvas, "#080b18");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.translate(0, this.camY);

    this.stack.forEach((b, i) => {
      const y = this.viewH - 40 - (i + 1) * BLOCK_H;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, y, b.w, BLOCK_H - 2);
      ctx.fillStyle = "#00000022";
      ctx.fillRect(b.x, y + BLOCK_H - 6, b.w, 4);
    });

    const cy = this.viewH - 40 - (this.stack.length + 1) * BLOCK_H;
    ctx.fillStyle = this._color(this.height + 1);
    ctx.fillRect(this.current.x, cy, this.current.w, BLOCK_H - 2);
    ctx.restore();

    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = "#ffffff55"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Tap / Space to drop", this.viewW / 2, this.viewH - 14);
    ctx.restore();
  }
}

export default StackTowerGame;
