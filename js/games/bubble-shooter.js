// ==========================================================================
// Bubble Shooter — aim and fire to match 3+ same-color bubbles.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clearCanvas } from "./canvasUtils.js";
import { clamp, randInt, choice } from "../core/utils.js";

const COLS = 8;
const MAX_ROWS = 11;
const PALETTE = ["#ff5470", "#22d3ee", "#2ee6a6", "#ffd76a", "#c86bff"];

export class BubbleShooterGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Drag to aim, release to fire a bubble up into the grid.",
      "Match 3 or more of the same color to pop them.",
      "New rows creep down over time — don't let them reach the bottom!",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag from the cannon to aim, release to shoot."; }
  getKeyboardHint() { return "Click and drag from the cannon to aim, release to shoot."; }

  onInit() {
    this.createCanvas();
    this.input.onPointer("down", (p) => { this.aiming = { x: p.x, y: p.y }; });
    this.input.onPointer("move", (p) => { if (this.aiming) this.aiming.x2 = p.x, this.aiming.y2 = p.y; });
    this.input.onPointer("up", () => { if (this.aiming) { this._fire(); this.aiming = null; } });
  }

  onResize() { this.cell = this.viewW / COLS; }

  onStart(difficulty) {
    this.onResize();
    this.colorCount = difficulty === "Hard" ? 5 : difficulty === "Normal" ? 4 : 3;
    this.shotsPerRow = difficulty === "Hard" ? 4 : 6;
    this.grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
    for (let r = 0; r < 5; r++) for (let c = 0; c < COLS; c++) if (Math.random() < 0.85) this.grid[r][c] = choice(PALETTE.slice(0, this.colorCount));
    this.cannon = { x: this.viewW / 2, y: this.viewH - 30 };
    this.current = choice(PALETTE.slice(0, this.colorCount));
    this.next = choice(PALETTE.slice(0, this.colorCount));
    this.shots = 0;
    this.flying = null;
    this.setScore(0);
    this.setHud({ Score: 0, Rows: 5 });
  }

  _fire() {
    if (this.flying || this.state !== "playing") return;
    const dx = this.aiming.x - (this.aiming.x2 ?? this.aiming.x), dy = this.aiming.y - (this.aiming.y2 ?? this.aiming.y);
    let ang = Math.atan2(-dy, dx);
    if (dx === 0 && dy === 0) return;
    // clamp to an upward arc
    ang = clamp(ang, 0.18, Math.PI - 0.18);
    const speed = 640;
    this.flying = { x: this.cannon.x, y: this.cannon.y, vx: Math.cos(ang) * speed, vy: -Math.sin(ang) * speed, color: this.current };
  }

  onUpdate(dt) {
    if (this.flying) {
      const f = this.flying;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < this.cell / 2) { f.x = this.cell / 2; f.vx *= -1; }
      if (f.x > this.viewW - this.cell / 2) { f.x = this.viewW - this.cell / 2; f.vx *= -1; }
      const row = Math.round(f.y / this.cell);
      let collided = row <= 0;
      if (!collided) {
        for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (!this.grid[r][c]) continue;
          const cx = c * this.cell + this.cell / 2, cy = r * this.cell + this.cell / 2;
          if (Math.hypot(f.x - cx, f.y - cy) < this.cell * 0.92) { collided = true; break; }
        }
      }
      if (f.y < 0) collided = true;
      if (collided) this._settle(f);
    }
  }

  _settle(f) {
    let bestR = 0, bestC = 0, bestD = Infinity;
    for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (this.grid[r][c]) continue;
      const cx = c * this.cell + this.cell / 2, cy = r * this.cell + this.cell / 2;
      const d = Math.hypot(f.x - cx, f.y - cy);
      if (d < bestD) { bestD = d; bestR = r; bestC = c; }
    }
    this.grid[bestR][bestC] = f.color;
    this.flying = null;
    audioManager.play("pop");
    this._resolveMatches(bestR, bestC);
    this.shots++;
    this.current = this.next;
    this.next = choice(PALETTE.slice(0, this.colorCount));
    if (this.shots % this.shotsPerRow === 0) this._advanceRow();
    if (this.grid[MAX_ROWS - 2].some(v => v) || this.grid[MAX_ROWS - 1].some(v => v)) this._gameOver();
  }

  _neighbors(r, c) { return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => rr >= 0 && rr < MAX_ROWS && cc >= 0 && cc < COLS); }

  _resolveMatches(r, c) {
    const color = this.grid[r][c];
    const seen = new Set(); const stack = [[r, c]]; const group = [];
    while (stack.length) {
      const [rr, cc] = stack.pop();
      const key = `${rr},${cc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.grid[rr][cc] !== color) continue;
      group.push([rr, cc]);
      this._neighbors(rr, cc).forEach(n => stack.push(n));
    }
    if (group.length >= 3) {
      group.forEach(([rr, cc]) => this.grid[rr][cc] = null);
      this.addScore(group.length * 12);
      audioManager.play("combo");
      this.particles.burst(c * this.cell + this.cell / 2, r * this.cell + this.cell / 2, { count: 16, colors: [color], life: 0.5, speed: 220 });
      this._dropFloating();
    }
  }

  _dropFloating() {
    const connected = new Set();
    const stack = [];
    for (let c = 0; c < COLS; c++) if (this.grid[0][c]) stack.push([0, c]);
    while (stack.length) {
      const [r, c] = stack.pop();
      const key = `${r},${c}`;
      if (connected.has(key) || !this.grid[r][c]) continue;
      connected.add(key);
      this._neighbors(r, c).forEach(n => stack.push(n));
    }
    let dropped = 0;
    for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (this.grid[r][c] && !connected.has(`${r},${c}`)) { this.grid[r][c] = null; dropped++; }
    }
    if (dropped) { this.addScore(dropped * 15); audioManager.play("coin"); }
  }

  _advanceRow() {
    for (let r = MAX_ROWS - 1; r > 0; r--) this.grid[r] = this.grid[r - 1];
    this.grid[0] = Array.from({ length: COLS }, () => (Math.random() < 0.8 ? choice(PALETTE.slice(0, this.colorCount)) : null));
    const filledRows = this.grid.filter(row => row.some(v => v)).length;
    this.setHud({ Score: this.score, Rows: filledRows });
  }

  _gameOver() {
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: "The bubbles reached the bottom!" });
  }

  onRender(ctx) {
    clearCanvas(ctx, this.canvas, "#0a0e1c");
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS; c++) {
      const color = this.grid[r][c];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(c * this.cell + this.cell / 2, r * this.cell + this.cell / 2, this.cell * 0.44, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#ff547055"; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, (MAX_ROWS - 1) * this.cell); ctx.lineTo(this.viewW, (MAX_ROWS - 1) * this.cell); ctx.stroke();
    ctx.setLineDash([]);

    if (this.aiming) {
      const x2 = this.aiming.x2 ?? this.aiming.x, y2 = this.aiming.y2 ?? this.aiming.y;
      const dx = this.aiming.x - x2, dy = this.aiming.y - y2;
      const len = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = "#ffffff77"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(this.cannon.x, this.cannon.y); ctx.lineTo(this.cannon.x + (dx / len) * 200, this.cannon.y + (dy / len) * 200); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.flying) { ctx.fillStyle = this.flying.color; ctx.beginPath(); ctx.arc(this.flying.x, this.flying.y, this.cell * 0.44, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = this.current; ctx.beginPath(); ctx.arc(this.cannon.x, this.cannon.y, this.cell * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffffff88"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = this.next; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(this.cannon.x + 34, this.cannon.y + 4, this.cell * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

export default BubbleShooterGame;
