// ==========================================================================
// Nova Strike — top-down wave shooter with an escalating boss every 5 waves.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp, randInt } from "../core/utils.js";
import { shade } from "./gfx.js";

export class SpaceShooterGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move to dodge enemy fire — your ship auto-fires forward.",
      "Clear each wave of fighters; a tougher boss appears every 5th wave.",
      "You have 3 lives. Survive as long as you can for a high score.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return []; }
  getTouchHint() { return "Use the D-pad to move — your ship fires automatically."; }
  getKeyboardHint() { return "Arrow keys or WASD to move. Auto-fire is always on."; }

  getScene() { return "stars"; }
  onInit() { this.createCanvas(); }

  onStart(difficulty) {
    this.diffMul = difficulty === "Hard" ? 1.5 : difficulty === "Normal" ? 1.1 : 0.8;
    this.player = { x: this.viewW / 2, y: this.viewH - 60, w: 26, h: 26, hp: 3, fireTimer: 0 };
    this.bullets = []; this.enemyBullets = []; this.enemies = []; this.particlesFx = [];
    this.wave = 0;
    this.setScore(0);
    this._nextWaveTimer = 0.6;
    this._updateHud();
  }

  _updateHud() { this.setHud({ Score: this.score, Lives: "❤️".repeat(Math.max(0, this.player.hp)), Wave: this.wave }); }

  _spawnWave() {
    this.wave += 1;
    const isBoss = this.wave % 5 === 0;
    if (isBoss) {
      this.enemies.push({ x: this.viewW / 2, y: -60, w: 70, h: 50, hp: 40 * this.diffMul + this.wave * 4, vx: 60, vy: 40, boss: true, shootTimer: 1, dir: 1, val: 200 });
    } else {
      const count = 5 + Math.min(6, Math.floor(this.wave / 2));
      for (let i = 0; i < count; i++) {
        this.enemies.push({
          x: 40 + (i % 6) * ((this.viewW - 80) / 5), y: -40 - Math.floor(i / 6) * 50,
          w: 24, h: 20, hp: 1 + Math.floor(this.wave / 4), vx: (Math.random() > 0.5 ? 1 : -1) * (40 + this.wave * 3) * this.diffMul,
          vy: 40 * this.diffMul, shootTimer: 1 + Math.random() * 2, val: 15,
        });
      }
    }
    audioManager.play("levelup");
    this._updateHud();
  }

  onUpdate(dt) {
    const speed = 320;
    const p = this.player;
    if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) p.x -= speed * dt;
    if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) p.x += speed * dt;
    if (this.input.isDown("ArrowUp", "KeyW") || this.input.virtual.up) p.y -= speed * dt;
    if (this.input.isDown("ArrowDown", "KeyS") || this.input.virtual.down) p.y += speed * dt;
    p.x = clamp(p.x, 16, this.viewW - 16);
    p.y = clamp(p.y, this.viewH * 0.45, this.viewH - 16);

    p.fireTimer -= dt;
    if (p.fireTimer <= 0) { p.fireTimer = 0.22; this.bullets.push({ x: p.x, y: p.y - 16, vy: -520 }); audioManager.play("select"); }

    this.bullets.forEach(b => b.y += b.vy * dt);
    this.bullets = this.bullets.filter(b => b.y > -20);
    this.enemyBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });
    this.enemyBullets = this.enemyBullets.filter(b => b.y < this.viewH + 20);

    if (!this.enemies.length) {
      this._nextWaveTimer -= dt;
      if (this._nextWaveTimer <= 0) { this._spawnWave(); this._nextWaveTimer = 999; }
    }

    for (const e of this.enemies) {
      if (e.boss) {
        e.y = Math.min(e.y + e.vy * dt, 90);
        e.x += e.vx * dt * e.dir;
        if (e.x < 60 || e.x > this.viewW - 60) e.dir *= -1;
      } else {
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        if (e.x < 20 || e.x > this.viewW - 20) e.vx *= -1;
      }
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && e.y > 0) {
        e.shootTimer = e.boss ? 0.5 + Math.random() : 1.5 + Math.random() * 2;
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        this.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 200, vy: Math.sin(ang) * 200 });
      }
      if (e.y > this.viewH + 40) e.y = -30;
    }

    // bullet vs enemy
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
          e.hp -= 1; b.y = -9999;
          audioManager.play("hit");
          if (e.hp <= 0) { this.addScore(e.val); audioManager.play("explosion"); this.shake(); }
        }
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    this.bullets = this.bullets.filter(b => b.y > -100);

    for (const b of this.enemyBullets) {
      if (Math.abs(b.x - p.x) < 14 && Math.abs(b.y - p.y) < 14) { b.y = 9999; this._hitPlayer(); }
    }
    for (const e of this.enemies) {
      if (Math.abs(e.x - p.x) < (e.w + 20) / 2 && Math.abs(e.y - p.y) < (e.h + 20) / 2) { e.hp = 0; this._hitPlayer(); }
    }
    this._updateHud();
  }

  _hitPlayer() {
    this.player.hp -= 1;
    this.shake();
    audioManager.play("error");
    this.vibrateOn(40);
    if (this.player.hp <= 0) {
      audioManager.play("gameover");
      this.endGame({ result: "loss", score: this.score, message: `Survived to wave ${this.wave}.`, extraStats: [{ label: "Wave", value: this.wave }] });
    }
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    // Parallax dust streaking past the ship
    ctx.fillStyle = "#ffffff2e";
    for (let i = 0; i < 34; i++) {
      const y = (i * 97 + performance.now() / 18) % this.viewH;
      ctx.fillRect((i * 53) % this.viewW, y, 1.6, 6);
    }

    for (const b of this.enemyBullets) this.gfx.orb(ctx, b.x, b.y, 4, "#ff5470", { glow: 0.9 });
    for (const b of this.bullets) {
      this.gfx.neonLine(ctx, b.x, b.y - 10, b.x, b.y + 4, "#22d3ee", 3.4);
    }

    for (const e of this.enemies) {
      const col = e.boss ? "#ff4fd8" : "#ff9f43";
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.shadowColor = col; ctx.shadowBlur = e.boss ? 26 : 12;
      const g = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
      g.addColorStop(0, shade(col, -0.2)); g.addColorStop(1, shade(col, 0.18));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, e.h / 2); ctx.lineTo(-e.w / 2, -e.h / 2); ctx.lineTo(e.w / 2, -e.h / 2); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath(); ctx.arc(0, -e.h * 0.12, Math.max(2, e.w * 0.1), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (e.boss) {
        ctx.fillStyle = "#00000066"; ctx.fillRect(e.x - 40, e.y - e.h / 2 - 12, 80, 6);
        ctx.fillStyle = "#ff4fd8"; ctx.fillRect(e.x - 40, e.y - e.h / 2 - 12, 80 * clamp(e.hp / (40 * this.diffMul + this.wave * 4), 0, 1), 6);
      }
    }

    // Engine flame flickers with the frame
    const p = this.player;
    const flame = 10 + Math.random() * 8;
    const fg = ctx.createLinearGradient(p.x, p.y + p.h / 2, p.x, p.y + p.h / 2 + flame);
    fg.addColorStop(0, "rgba(255,214,106,0.9)");
    fg.addColorStop(1, "rgba(255,79,216,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y + p.h / 2); ctx.lineTo(p.x + 5, p.y + p.h / 2); ctx.lineTo(p.x, p.y + p.h / 2 + flame);
    ctx.closePath(); ctx.fill();

    ctx.save();
    ctx.shadowColor = "#2ee6a6"; ctx.shadowBlur = 18;
    const hull = ctx.createLinearGradient(p.x, p.y - p.h / 2, p.x, p.y + p.h / 2);
    hull.addColorStop(0, "#7cffd0"); hull.addColorStop(1, "#12a077");
    ctx.fillStyle = hull;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - p.h / 2); ctx.lineTo(p.x - p.w / 2, p.y + p.h / 2); ctx.lineTo(p.x + p.w / 2, p.y + p.h / 2); ctx.closePath(); ctx.fill();
    ctx.restore();
    this.gfx.orb(ctx, p.x, p.y + 2, 4.5, "#22d3ee", { glow: 0.8 });
    ctx.restore();
  }
}

export default SpaceShooterGame;
