// ==========================================================================
// Pixel Quest — side-scrolling platformer: run, jump, collect gems, dodge
// spikes and reach the goal flag.
//
// The level lives in a fixed virtual world 540 units tall, and the renderer
// scales that to whatever the stage happens to be. Without it the platforms
// sat at absolute pixel heights and simply fell off the bottom of a phone
// screen, which made the game unplayable on mobile.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { roundRect } from "./canvasUtils.js";
import { clamp, randInt, randFloat } from "../core/utils.js";

const WORLD_H = 540;          // virtual height; everything is authored against it
const GROUND_Y = 430;         // the "default" platform height
const GRAVITY = 1900;
const MOVE_SPEED = 285;
const JUMP_V = 760;
const COYOTE = 0.1;           // grace period after walking off an edge
const JUMP_BUFFER = 0.12;     // grace period for pressing jump slightly early

export class PlatformerGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move with the arrow keys or A/D, and jump with Space / W / Up.",
      "Collect gems for bonus points and stay off the red spikes.",
      "Every platform you land on becomes your checkpoint — a fall costs a life, not the run.",
      "Reach the checkered flag at the end of the level to win.",
    ];
  }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["a"]; }
  getTouchHint() { return "D-pad to move, ● to jump."; }
  getKeyboardHint() { return "Arrow keys / A-D to move, Space, W or Up to jump."; }

  getScene() { return "aurora"; }
  onInit() { this.createCanvas(); }

  onResize() { this._fit(); }

  /** World units to canvas pixels: the world height always fills the stage. */
  _fit() {
    this.scale = (this.viewH || 1) / WORLD_H;
    this.viewWorldW = (this.viewW || 1) / this.scale;
  }

  onStart(difficulty) {
    this._fit();
    const cfg = {
      Easy:   { count: 18, gap: [40, 78], drop: 60, spike: 0.18, gem: 0.7 },
      Normal: { count: 24, gap: [55, 100], drop: 78, spike: 0.3, gem: 0.6 },
      Hard:   { count: 30, gap: [70, 124], drop: 95, spike: 0.42, gem: 0.5 },
    }[difficulty] || {};
    this.cfg = cfg;

    this._buildLevel(cfg);
    const first = this.platforms[0];
    this.player = {
      x: first.x + 30, y: first.y - 40, vx: 0, vy: 0, w: 26, h: 36,
      onGround: true, facing: 1, coyote: 0, buffer: 0, run: 0, squash: 0,
    };
    this.checkpoint = { x: this.player.x, y: this.player.y };
    this.lives = 3;
    this.gemsCollected = 0;
    this.camX = 0;
    this.elapsed = 0;
    this.setScore(0);
    this._updateHud();
  }

  /**
   * Platforms are laid out so every gap is jumpable: the horizontal reach of
   * a full jump is computed from the actual physics rather than guessed.
   */
  _buildLevel(cfg) {
    this.platforms = [];
    this.gems = [];
    this.hazards = [];
    this.clouds = [...Array(14)].map(() => ({
      x: randFloat(0, 4000), y: randFloat(40, 260), s: randFloat(0.5, 1.5), w: randFloat(80, 190),
    }));

    const airTime = (2 * JUMP_V) / GRAVITY;       // up and back down
    const reach = MOVE_SPEED * airTime * 0.82;    // with a safety margin
    const maxGap = Math.min(cfg.gap[1], reach - 30);

    let x = 0, y = GROUND_Y;
    for (let i = 0; i < cfg.count; i++) {
      const w = randInt(110, 210);
      this.platforms.push({ x, y, w, h: 22 });

      if (i > 0 && Math.random() < cfg.gem) {
        this.gems.push({ x: x + w / 2, y: y - 46, collected: false, bob: randFloat(0, 6.3) });
      }
      if (i > 2 && Math.random() < cfg.spike && w > 130) {
        // Spikes never sit at the very edge, so a landing is always safe.
        this.hazards.push({ x: x + w * 0.42, y: y - 16, w: 22, h: 16 });
      }

      const gap = randInt(cfg.gap[0], Math.max(cfg.gap[0] + 10, maxGap));
      // Climbing costs reach, so an upward step gets a shorter gap.
      const dy = randInt(-cfg.drop, cfg.drop);
      x += w + (dy < -20 ? gap * 0.7 : gap);
      y = clamp(y + dy, 210, 470);
    }

    const last = this.platforms[this.platforms.length - 1];
    this.goal = { x: last.x + last.w - 70, y: last.y - 76, w: 26, h: 76 };
    this.levelEnd = last.x + last.w + 120;
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Gems: this.gemsCollected,
      Lives: GameBase.hearts(this.lives),
    });
  }

  // ------------------------------------------------------------- UPDATE ----
  onUpdate(dt) {
    this.elapsed += dt;
    const p = this.player;
    const v = this.input.virtual;

    // Analog: a lightly held stick edges along a ledge, a full push runs.
    const ax = this.input.axes().x;
    p.vx = Math.abs(ax) > 0.12 ? ax * MOVE_SPEED : 0;
    if (p.vx < 0) p.facing = -1;
    else if (p.vx > 0) p.facing = 1;
    if (p.vx !== 0) p.run += dt * 12 * Math.min(1, Math.abs(ax) + 0.35); else p.run = 0;

    // Jump with a coyote window and an input buffer — the difference between
    // a platformer that feels tight and one that feels broken.
    const jumpPressed = this.input.consumePressed("Space") || this.input.consumePressed("ArrowUp")
      || this.input.consumePressed("KeyW") || (v.a && !this._vaPrev);
    this._vaPrev = v.a;
    if (jumpPressed) p.buffer = JUMP_BUFFER;
    if (p.buffer > 0) p.buffer -= dt;
    if (p.coyote > 0) p.coyote -= dt;

    if (p.buffer > 0 && (p.onGround || p.coyote > 0)) {
      p.vy = -JUMP_V;
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      p.squash = 0.18;
      audioManager.play("jump");
    }

    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.squash > 0) p.squash -= dt;

    const wasGrounded = p.onGround;
    p.onGround = false;
    for (const plat of this.platforms) {
      const overlapX = p.x + p.w * 0.75 > plat.x && p.x + p.w * 0.25 < plat.x + plat.w;
      if (!overlapX || p.vy < 0) continue;
      const foot = p.y + p.h;
      if (foot >= plat.y && foot <= plat.y + Math.max(24, p.vy * dt + 6)) {
        p.y = plat.y - p.h;
        p.vy = 0;
        p.onGround = true;
        this.checkpoint = { x: plat.x + 24, y: plat.y - p.h };
      }
    }
    if (wasGrounded && !p.onGround && p.vy >= 0) p.coyote = COYOTE;
    if (p.onGround && !wasGrounded) p.squash = 0.16;

    p.x = Math.max(0, p.x);

    for (const g of this.gems) {
      if (g.collected) continue;
      if (Math.abs(p.x + p.w / 2 - g.x) < 26 && Math.abs(p.y + p.h / 2 - g.y) < 30) {
        g.collected = true;
        this.gemsCollected++;
        this.addScore(25);
        audioManager.play("coin");
        this._updateHud();
      }
    }
    for (const h of this.hazards) {
      if (p.x + p.w * 0.8 > h.x && p.x + p.w * 0.2 < h.x + h.w && p.y + p.h > h.y && p.y + p.h < h.y + h.h + 12) {
        return this._hurt();
      }
    }
    if (p.y > WORLD_H + 60) return this._hurt();

    if (p.x + p.w > this.goal.x && p.x < this.goal.x + this.goal.w && p.y + p.h > this.goal.y) return this._win();

    // Camera keeps the player a bit left of centre so you can see what's next.
    const target = clamp(p.x - this.viewWorldW * 0.38, 0, Math.max(0, this.levelEnd - this.viewWorldW));
    this.camX += (target - this.camX) * Math.min(1, dt * 9);
    this.particles.update(dt);
  }

  _hurt() {
    this.lives -= 1;
    this.shake();
    audioManager.play("error");
    this._updateHud();
    if (this.lives <= 0) return this._lose();
    this.player.x = this.checkpoint.x;
    this.player.y = this.checkpoint.y;
    this.player.vy = 0;
    this.player.vx = 0;
  }

  _win() {
    audioManager.play("win");
    this.addScore(200 + this.lives * 100);
    this.endGame({
      result: "win", score: this.score,
      message: `Level cleared with ${this.gemsCollected} gems and ${this.lives} lives left.`,
      extraStats: [{ label: "Gems", value: this.gemsCollected }, { label: "Lives", value: this.lives }],
    });
  }

  _lose() {
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score,
      message: `Collected ${this.gemsCollected} gems before running out of lives.`,
      extraStats: [{ label: "Gems", value: this.gemsCollected }],
    });
  }

  // ------------------------------------------------------------- RENDER ----
  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    // Everything below is authored in world units.
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.camX, 0);

    this._drawClouds(ctx);
    for (const plat of this.platforms) this._drawPlatform(ctx, plat);
    for (const h of this.hazards) this._drawSpikes(ctx, h);
    for (const g of this.gems) this._drawGem(ctx, g);
    this._drawGoal(ctx);
    this._drawPlayer(ctx);

    ctx.restore();
  }

  _drawClouds(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#cfe3ff";
    for (const c of this.clouds) {
      // Parallax: distant clouds drift slower than the level.
      const x = c.x - this.camX * (0.25 + c.s * 0.12);
      const wrapped = ((x % 2600) + 2600) % 2600 - 300;
      const h = c.w * 0.34;
      ctx.beginPath();
      ctx.ellipse(wrapped, c.y, c.w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.ellipse(wrapped + c.w * 0.26, c.y + h * 0.12, c.w * 0.32, h * 0.4, 0, 0, Math.PI * 2);
      ctx.ellipse(wrapped - c.w * 0.28, c.y + h * 0.16, c.w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Grass-topped stone slabs with a lit rim and a fading support column. */
  _drawPlatform(ctx, plat) {
    if (plat.x + plat.w < this.camX - 60 || plat.x > this.camX + this.viewWorldW + 60) return;

    // Support column receding into the dark.
    const col = ctx.createLinearGradient(0, plat.y, 0, plat.y + 150);
    col.addColorStop(0, "rgba(30,40,70,0.85)");
    col.addColorStop(1, "rgba(20,26,48,0)");
    ctx.fillStyle = col;
    ctx.fillRect(plat.x + plat.w * 0.16, plat.y + plat.h, plat.w * 0.68, 150);

    const g = ctx.createLinearGradient(0, plat.y, 0, plat.y + plat.h);
    g.addColorStop(0, "#3d4d78");
    g.addColorStop(1, "#232e4d");
    ctx.fillStyle = g;
    roundRect(ctx, plat.x, plat.y, plat.w, plat.h, 6);
    ctx.fill();

    ctx.fillStyle = "#4ad48a";
    roundRect(ctx, plat.x, plat.y, plat.w, 7, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(plat.x + 4, plat.y + 1, plat.w - 8, 2);

    // A few grass tufts hanging over the front lip.
    ctx.fillStyle = "#2fae6c";
    for (let gx = plat.x + 8; gx < plat.x + plat.w - 8; gx += 16) {
      ctx.fillRect(gx, plat.y + 6, 3, 4 + ((gx / 16) % 3));
    }
  }

  _drawSpikes(ctx, h) {
    ctx.fillStyle = "#ff5470";
    const spikes = 3;
    const sw = h.w / spikes;
    for (let i = 0; i < spikes; i++) {
      const x = h.x + i * sw;
      ctx.beginPath();
      ctx.moveTo(x, h.y + h.h);
      ctx.lineTo(x + sw / 2, h.y);
      ctx.lineTo(x + sw, h.y + h.h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (let i = 0; i < spikes; i++) {
      const x = h.x + i * sw;
      ctx.fillRect(x + sw / 2 - 1, h.y + 2, 1.5, h.h - 4);
    }
  }

  _drawGem(ctx, g) {
    if (g.collected) return;
    const y = g.y + Math.sin(this.elapsed * 3 + g.bob) * 4;
    const spin = Math.abs(Math.cos(this.elapsed * 2.2 + g.bob));
    this.gfx.glow(ctx, g.x, y, 22, "#ffd76a", 0.55);
    ctx.save();
    ctx.translate(g.x, y);
    ctx.scale(0.35 + spin * 0.65, 1);
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, -11, 0, 11);
    grad.addColorStop(0, "#fff3c4");
    grad.addColorStop(1, "#f0a01b");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  _drawGoal(ctx) {
    const g = this.goal;
    ctx.fillStyle = "#8ea3e8";
    ctx.fillRect(g.x, g.y, 4, g.h);
    const wave = Math.sin(this.elapsed * 4) * 3;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#ffffff" : "#1b2138";
        ctx.fillRect(g.x + 4 + c * 11 + wave * (c + 1) * 0.4, g.y + r * 10, 11, 10);
      }
    }
    this.gfx.glow(ctx, g.x + 14, g.y + 20, 40, "#2ee6a6", 0.4);
  }

  _drawPlayer(ctx) {
    const p = this.player;
    const squash = p.squash > 0 ? 1 + Math.sin((p.squash / 0.18) * Math.PI) * 0.16 : 1;
    const w = p.w / squash, h = p.h * squash;
    const x = p.x + (p.w - w) / 2, y = p.y + (p.h - h);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, p.y + p.h + 3, p.w * 0.42, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs pump while running and tuck up in the air.
    const stride = p.onGround ? Math.sin(p.run) * 6 : 3;
    ctx.fillStyle = "#155f8a";
    ctx.fillRect(x + 4, y + h - 6, 7, 8 - (p.onGround ? 0 : 3) + stride * 0.2);
    ctx.fillRect(x + w - 11, y + h - 6, 7, 8 - (p.onGround ? 0 : 3) - stride * 0.2);

    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, "#6ef0ff");
    body.addColorStop(1, "#12a7c9");
    ctx.fillStyle = body;
    roundRect(ctx, x, y, w, h, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(ctx, x + 3, y + 3, w - 6, h * 0.3, 5);
    ctx.fill();

    ctx.fillStyle = "#0a0d18";
    ctx.beginPath();
    ctx.arc(x + w / 2 + p.facing * 5, y + h * 0.32, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default PlatformerGame;
