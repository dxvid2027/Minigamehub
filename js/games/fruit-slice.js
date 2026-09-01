// ==========================================================================
// Fruit Slice — swipe to slice flying fruit, dodge the bombs.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { randInt, choice } from "../core/utils.js";
import { drawSpriteCentered } from "./sprites.js";

const GRAVITY = 900;
// Drawn fruit, not emoji: the colour is the juice-splash colour, matched to
// the artwork so a slice throws the right coloured spray.
const FRUITS = [
  { sprite: "watermelon", color: "#e01f3c" }, { sprite: "orange", color: "#ff9f43" },
  { sprite: "grapes",     color: "#a86bff" }, { sprite: "strawberry", color: "#ee2f4c" },
  { sprite: "pineapple",  color: "#f0b32c" }, { sprite: "kiwi",   color: "#8fce4a" },
  { sprite: "apple",      color: "#e8253f" }, { sprite: "lemon",  color: "#ffd93b" },
  { sprite: "peach",      color: "#ff9c76" }, { sprite: "banana", color: "#ffcf3a" },
];

export class FruitSliceGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Swipe or drag across fruit to slice them for points.",
      "Avoid slicing the bombs — one hit ends the run.",
      "You have 3 lives; missing a fruit costs one.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Swipe across the fruit to slice it."; }
  getKeyboardHint() { return "Click and drag across the fruit to slice it."; }

  getScene() { return "stars"; }
  onInit() {
    this.createCanvas();
    this.trail = [];
    this.input.onPointer("down", (p) => { this._last = { x: p.x, y: p.y }; this._dragging = true; });
    this.input.onPointer("move", (p) => {
      if (!this._dragging) return;
      this._slice(this._last, { x: p.x, y: p.y });
      this._last = { x: p.x, y: p.y };
      this.trail.push({ x: p.x, y: p.y, t: 0.25 });
    });
    this.input.onPointer("up", () => { this._dragging = false; });
  }

  onStart(difficulty) {
    this.spawnInterval = difficulty === "Hard" ? 0.55 : difficulty === "Normal" ? 0.75 : 1;
    this.bombChance = difficulty === "Hard" ? 0.22 : difficulty === "Normal" ? 0.15 : 0.08;
    this.items = [];
    this.lives = 3;
    this.spawnTimer = 0.6;
    this.combo = 0;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() { this.setHud({ Score: this.score, Lives: GameBase.hearts(this.lives) }); }

  onUpdate(dt) {
    this.trail.forEach(t => t.t -= dt);
    this.trail = this.trail.filter(t => t.t > 0);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval * (0.7 + Math.random() * 0.6);
      const isBomb = Math.random() < this.bombChance;
      const x = 60 + Math.random() * (this.viewW - 120);
      const vy = -(680 + Math.random() * 220);
      const vx = (Math.random() - 0.5) * 160;
      this.items.push(isBomb
        ? { x, y: this.viewH + 20, vx, vy, r: 26, bomb: true, rot: 0, spin: (Math.random()-0.5)*4 }
        : { x, y: this.viewH + 20, vx, vy, r: 30, bomb: false, ...choice(FRUITS), rot: 0, spin: (Math.random() - 0.5) * 4, sliced: false });
    }

    for (const it of this.items) {
      it.vy += GRAVITY * dt;
      it.x += it.vx * dt; it.y += it.vy * dt;
      it.rot += it.spin * dt;
    }
    for (const it of this.items) {
      if (it.y > this.viewH + 60 && !it.sliced && !it.bomb) {
        this.lives--; this.combo = 0;
        audioManager.play("error");
        this._updateHud();
        if (this.lives <= 0) return this._finish();
      }
    }
    this.items = this.items.filter(it => it.y < this.viewH + 60 && !it.sliced);
  }

  _slice(a, b) {
    for (const it of this.items) {
      if (it.sliced) continue;
      const d = this._pointSegDist(it.x, it.y, a.x, a.y, b.x, b.y);
      if (d < it.r + 6) {
        it.sliced = true;
        if (it.bomb) { this._bombHit(); return; }
        this.combo++;
        const gained = 10 + Math.min(30, this.combo * 3);
        this.addScore(gained);
        audioManager.play("pop");
        this.particles.burst(it.x, it.y, { count: 10, colors: [it.color], life: 0.5, speed: 200, gravity: 500 });
        this.vibrateOn(15);
      }
    }
  }

  _pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  _bombHit() {
    this.shake();
    audioManager.play("explosion");
    this.particles.burst(this.viewW / 2, this.viewH / 2, { count: 30, colors: ["#ff5470", "#ff9f43"], life: 0.8, speed: 300 });
    this._finish(true);
  }

  _finish(bombDeath = false) {
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: bombDeath ? "Boom! You sliced a bomb." : "Out of lives." });
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);

    if (this.trail.length > 1) {
      ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath();
      this.trail.forEach((t, i) => { if (i === 0) ctx.moveTo(t.x, t.y); else ctx.lineTo(t.x, t.y); });
      ctx.stroke();
    }

    for (const it of this.items) {
      // The painters fill roughly 70% of their box, so the box is oversized to
      // make the fruit read at the size the hit radius implies.
      drawSpriteCentered(ctx, it.bomb ? "bomb" : it.sprite, it.x, it.y, it.r * 3.4, it.rot);
    }
    ctx.restore();
  }
}

export default FruitSliceGame;
