// ==========================================================================
// Nova Strike — wave-based shooter.
//
// Enemies always arrive as a formation and move as one block: the whole wave
// slides sideways, and when the leading column reaches the edge of the
// playfield it steps down and reverses. Every enemy position is derived from
// the formation origin, which is clamped so no enemy can ever drift outside
// the visible area — you can always see what is shooting at you.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp } from "../core/utils.js";
import { shade } from "./gfx.js";

const EDGE = 26;          // keep this much clearance from the playfield walls
const CELL_W = 52;        // formation grid
const CELL_H = 44;
const ENEMY_W = 26;
const ENEMY_H = 20;

export class SpaceShooterGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Move to dodge enemy fire — your ship fires automatically.",
      "Each wave arrives as a formation that slides across the screen and drops lower every time it turns.",
      "Clear the whole formation to advance. Every 5th wave sends a boss.",
      "You have 3 lives; losing them all — or letting a wave reach your line — ends the run.",
    ];
  }
  getTouchLayout() { return "dpad"; }
  getTouchButtons() { return []; }
  getTouchHint() { return "Use the D-pad to move — your ship fires automatically."; }
  getKeyboardHint() { return "Arrow keys or A/D to move (W/S for depth). Auto-fire is always on."; }

  getScene() { return "stars"; }

  onInit() { this.createCanvas(); }

  onStart(difficulty) {
    this.diff = difficulty === "Hard" ? 1.45 : difficulty === "Normal" ? 1.1 : 0.82;
    this.player = { x: this.viewW / 2, y: this.viewH - 58, w: 26, h: 26, hp: 3, fireTimer: 0, invuln: 0 };
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.wave = 0;
    this.kills = 0;
    this.setScore(0);
    this.intermission = 1.4;   // short beat before the first wave drops in
    this._updateHud();
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Lives: "♥".repeat(Math.max(0, this.player.hp)) || "—",
      Wave: this.wave || "…",
    });
  }

  // ------------------------------------------------------------- WAVES -----
  _spawnWave() {
    this.wave += 1;
    const isBoss = this.wave % 5 === 0;
    this.enemies = [];

    if (isBoss) {
      this.formation = {
        x: this.viewW / 2, y: -70, dir: 1,
        speed: (48 + this.wave * 2) * this.diff,
        cols: 1, rows: 1, boss: true,
        entering: true, targetY: 96,
      };
      const hp = Math.round((26 + this.wave * 5) * this.diff);
      this.enemies.push({ col: 0, row: 0, hp, maxHp: hp, boss: true, w: 78, h: 52, value: 220, shootTimer: 1.2, x: 0, y: 0 });
    } else {
      // Formation grows with the wave but never wider than the playfield.
      const maxCols = Math.max(3, Math.floor((this.viewW - EDGE * 2) / CELL_W));
      const cols = Math.min(maxCols, 4 + Math.floor(this.wave / 2));
      const rows = Math.min(4, 2 + Math.floor(this.wave / 3));
      this.formation = {
        x: this.viewW / 2, y: -CELL_H * rows, dir: 1,
        speed: (34 + this.wave * 4) * this.diff,
        cols, rows, boss: false,
        entering: true, targetY: 70,
      };
      const hp = 1 + Math.floor(this.wave / 5);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          this.enemies.push({
            col: c, row: r, hp, maxHp: hp, boss: false,
            w: ENEMY_W, h: ENEMY_H, value: 15 + r * 5,
            shootTimer: 1.5 + Math.random() * 3, x: 0, y: 0,
          });
        }
      }
    }
    this._syncEnemyPositions();
    audioManager.play("levelup");
    this._updateHud();
  }

  /** Formation half-width in pixels, used to clamp the block on screen. */
  _halfWidth() {
    const f = this.formation;
    if (f.boss) return this.enemies[0] ? this.enemies[0].w / 2 : 40;
    return ((f.cols - 1) * CELL_W + ENEMY_W) / 2;
  }

  _syncEnemyPositions() {
    const f = this.formation;
    const originX = f.x - ((f.cols - 1) * CELL_W) / 2;
    for (const e of this.enemies) {
      e.x = f.boss ? f.x : originX + e.col * CELL_W;
      e.y = f.y + e.row * CELL_H;
    }
  }

  // ------------------------------------------------------------ UPDATE -----
  onUpdate(dt) {
    this._updatePlayer(dt);
    this._updateBullets(dt);

    if (!this.enemies.length) {
      this.intermission -= dt;
      if (this.intermission <= 0) { this._spawnWave(); this.intermission = 2.6; }
      return;
    }

    this._updateFormation(dt);
    this._updateEnemyFire(dt);
    this._resolveHits();
    this._updateHud();
  }

  _updatePlayer(dt) {
    const p = this.player;
    const speed = 330;
    if (this.input.isDown("ArrowLeft", "KeyA") || this.input.virtual.left) p.x -= speed * dt;
    if (this.input.isDown("ArrowRight", "KeyD") || this.input.virtual.right) p.x += speed * dt;
    if (this.input.isDown("ArrowUp", "KeyW") || this.input.virtual.up) p.y -= speed * dt;
    if (this.input.isDown("ArrowDown", "KeyS") || this.input.virtual.down) p.y += speed * dt;
    p.x = clamp(p.x, 18, this.viewW - 18);
    p.y = clamp(p.y, this.viewH * 0.5, this.viewH - 18);

    if (p.invuln > 0) p.invuln -= dt;
    p.fireTimer -= dt;
    if (p.fireTimer <= 0) {
      p.fireTimer = 0.2;
      this.bullets.push({ x: p.x, y: p.y - 16, vy: -560 });
      audioManager.play("select");
    }
  }

  _updateBullets(dt) {
    for (const b of this.bullets) b.y += b.vy * dt;
    this.bullets = this.bullets.filter(b => b.y > -20 && !b.dead);
    for (const b of this.enemyBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    this.enemyBullets = this.enemyBullets.filter(b => b.y < this.viewH + 20 && b.x > -20 && b.x < this.viewW + 20 && !b.dead);
  }

  _updateFormation(dt) {
    const f = this.formation;

    // Entry: the block glides down into view before it starts patrolling.
    if (f.entering) {
      f.y += 120 * dt;
      if (f.y >= f.targetY) { f.y = f.targetY; f.entering = false; }
      this._syncEnemyPositions();
      return;
    }

    const half = this._halfWidth();
    const minX = EDGE + half;
    const maxX = this.viewW - EDGE - half;

    // A formation wider than the playfield would make the clamp meaningless,
    // so in that case it simply parks in the middle.
    if (minX >= maxX) {
      f.x = this.viewW / 2;
    } else {
      f.x += f.speed * f.dir * dt;
      if (f.x <= minX) { f.x = minX; f.dir = 1; f.y += CELL_H * 0.45; }
      else if (f.x >= maxX) { f.x = maxX; f.dir = -1; f.y += CELL_H * 0.45; }
      f.x = clamp(f.x, minX, maxX);
    }

    this._syncEnemyPositions();

    // If the formation reaches the player's line the wave overruns you.
    const lowest = Math.max(...this.enemies.map(e => e.y + e.h / 2));
    if (lowest >= this.player.y - 14) this._overrun();
  }

  _updateEnemyFire(dt) {
    // Only the front-most enemy in each column shoots, so fire always comes
    // from something you can actually see.
    const frontline = new Map();
    for (const e of this.enemies) {
      const cur = frontline.get(e.col);
      if (!cur || e.row > cur.row) frontline.set(e.col, e);
    }
    for (const e of frontline.values()) {
      e.shootTimer -= dt;
      if (e.shootTimer > 0 || e.y < 0) continue;
      e.shootTimer = e.boss ? 0.55 + Math.random() * 0.5 : (1.6 + Math.random() * 2.4) / this.diff;
      const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x);
      const speed = e.boss ? 250 : 210;
      this.enemyBullets.push({ x: e.x, y: e.y + e.h / 2, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed });
      if (e.boss) {
        // The boss adds a spread so it stays threatening without being unfair.
        for (const off of [-0.28, 0.28]) {
          this.enemyBullets.push({ x: e.x, y: e.y + e.h / 2, vx: Math.cos(ang + off) * speed, vy: Math.sin(ang + off) * speed });
        }
      }
    }
  }

  _resolveHits() {
    for (const b of this.bullets) {
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (Math.abs(b.x - e.x) < e.w / 2 + 3 && Math.abs(b.y - e.y) < e.h / 2 + 3) {
          e.hp -= 1;
          b.dead = true;
          audioManager.play("hit");
          if (e.hp <= 0) {
            this.kills++;
            this.addScore(e.value);
            audioManager.play("explosion");
            this.particles.burst(e.x, e.y, { count: e.boss ? 26 : 10, colors: e.boss ? ["#ff4fd8", "#ffd76a"] : ["#ff9f43", "#ffd76a"], life: 0.5, speed: 220 });
            if (e.boss) this.shake();
          }
          break;
        }
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);

    const p = this.player;
    if (p.invuln <= 0) {
      for (const b of this.enemyBullets) {
        if (Math.abs(b.x - p.x) < 13 && Math.abs(b.y - p.y) < 15) { b.dead = true; this._hitPlayer(); break; }
      }
    }
    if (p.invuln <= 0) {
      for (const e of this.enemies) {
        if (Math.abs(e.x - p.x) < (e.w + 20) / 2 && Math.abs(e.y - p.y) < (e.h + 20) / 2) { e.hp = 0; this._hitPlayer(); break; }
      }
    }
  }

  _hitPlayer() {
    const p = this.player;
    p.hp -= 1;
    p.invuln = 1.6;
    this.shake();
    audioManager.play("error");
    this.vibrateOn(40);
    this.particles.burst(p.x, p.y, { count: 16, colors: ["#2ee6a6", "#22d3ee"], life: 0.5, speed: 200 });
    this._updateHud();
    if (p.hp <= 0) this._gameOver("Your ship was destroyed.");
  }

  _overrun() {
    this.player.hp = 0;
    this.shake();
    this._gameOver(`Wave ${this.wave} broke through your line.`);
  }

  _gameOver(message) {
    audioManager.play("gameover");
    this.endGame({
      result: "loss", score: this.score, message,
      extraStats: [{ label: "Wave", value: this.wave }, { label: "Kills", value: this.kills }],
    });
  }

  // ------------------------------------------------------------ RENDER -----
  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);

    // Parallax dust
    ctx.fillStyle = "#ffffff2b";
    for (let i = 0; i < 34; i++) {
      const y = (i * 97 + performance.now() / 16) % this.viewH;
      ctx.fillRect((i * 53) % this.viewW, y, 1.6, 6);
    }

    for (const b of this.enemyBullets) this.gfx.orb(ctx, b.x, b.y, 4, "#ff5470", { glow: 0.9 });
    for (const b of this.bullets) this.gfx.neonLine(ctx, b.x, b.y - 10, b.x, b.y + 4, "#22d3ee", 3.4);

    for (const e of this.enemies) this._drawEnemy(ctx, e);

    this._drawPlayer(ctx);

    if (!this.enemies.length && this.intermission > 0) {
      this.gfx.label(ctx, `WAVE ${this.wave + 1}`, this.viewW / 2, this.viewH * 0.42, { size: 30, weight: 800, color: "rgba(255,255,255,0.92)" });
      this.gfx.label(ctx, "incoming…", this.viewW / 2, this.viewH * 0.42 + 26, { size: 13, color: "rgba(255,255,255,0.6)" });
    }
    ctx.restore();
  }

  _drawEnemy(ctx, e) {
    const col = e.boss ? "#ff4fd8" : "#ff9f43";
    ctx.save();
    ctx.translate(e.x, e.y);
    this.gfx.glow(ctx, 0, 0, e.w * 0.5, col, e.boss ? 0.7 : 0.32);
    const g = ctx.createLinearGradient(0, -e.h / 2, 0, e.h / 2);
    g.addColorStop(0, shade(col, -0.22));
    g.addColorStop(1, shade(col, 0.18));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, e.h / 2);
    ctx.lineTo(-e.w / 2, -e.h / 2);
    ctx.lineTo(e.w / 2, -e.h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath(); ctx.arc(0, -e.h * 0.1, Math.max(2, e.w * 0.09), 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (e.boss) {
      const w = 92;
      ctx.fillStyle = "#00000077"; ctx.fillRect(e.x - w / 2, e.y - e.h / 2 - 14, w, 6);
      ctx.fillStyle = "#ff4fd8";
      ctx.fillRect(e.x - w / 2, e.y - e.h / 2 - 14, w * clamp(e.hp / e.maxHp, 0, 1), 6);
    }
  }

  _drawPlayer(ctx) {
    const p = this.player;
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return; // blink while invulnerable

    const flame = 10 + Math.random() * 8;
    const fg = ctx.createLinearGradient(p.x, p.y + p.h / 2, p.x, p.y + p.h / 2 + flame);
    fg.addColorStop(0, "rgba(255,214,106,0.9)");
    fg.addColorStop(1, "rgba(255,79,216,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y + p.h / 2); ctx.lineTo(p.x + 5, p.y + p.h / 2); ctx.lineTo(p.x, p.y + p.h / 2 + flame);
    ctx.closePath(); ctx.fill();

    ctx.save();
    this.gfx.glow(ctx, p.x, p.y, p.w * 0.6, "#2ee6a6", 0.5);
    const hull = ctx.createLinearGradient(p.x, p.y - p.h / 2, p.x, p.y + p.h / 2);
    hull.addColorStop(0, "#7cffd0"); hull.addColorStop(1, "#12a077");
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.h / 2); ctx.lineTo(p.x - p.w / 2, p.y + p.h / 2); ctx.lineTo(p.x + p.w / 2, p.y + p.h / 2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    this.gfx.orb(ctx, p.x, p.y + 2, 4.5, "#22d3ee", { glow: 0.8 });
  }
}

export default SpaceShooterGame;
