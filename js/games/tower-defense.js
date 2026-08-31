// ==========================================================================
// Bastion TD — grid tower defense with a serpentine path and upgradeable
// towers. Survive endless escalating waves for the highest score.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp } from "../core/utils.js";

const COLS = 12, ROWS = 7;
const TOWER_COST = 40, UPGRADE_COST = 35;

function buildPath() {
  const path = [];
  for (let x = 0; x <= 10; x++) path.push({ x, y: 1 });
  for (let y = 2; y <= 3; y++) path.push({ x: 10, y });
  for (let x = 10; x >= 1; x--) path.push({ x, y: 3 });
  for (let y = 4; y <= 5; y++) path.push({ x: 1, y });
  for (let x = 1; x <= 11; x++) path.push({ x, y: 5 });
  return path;
}

export class TowerDefenseGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      `Tap an empty tile to build a tower (costs ${TOWER_COST} gold). Tap a tower to upgrade it.`,
      "Towers auto-fire at enemies walking the glowing path.",
      "Don't let enemies reach the base — you have limited lives. Survive as many waves as you can!",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a tile to build or upgrade a tower."; }
  getKeyboardHint() { return "Click a tile to build or upgrade a tower."; }

  getScene() { return "grid"; }
  onInit() {
    this.createCanvas();
    this.path = buildPath();
    this.pathSet = new Set(this.path.map(p => `${p.x},${p.y}`));
    this.input.onPointer("down", (p) => this._onClick(p.x, p.y));
  }

  onResize() { this.cell = Math.floor(Math.min(this.viewW / COLS, this.viewH / ROWS)); }

  onStart(difficulty) {
    this.onResize();
    this.diffMul = difficulty === "Hard" ? 1.5 : difficulty === "Normal" ? 1.15 : 0.85;
    this.gold = 150;
    this.baseHP = 12;
    this.wave = 0;
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.kills = 0;
    this.waveTimer = 3;
    this.betweenWaves = true;
    this.setScore(0);
    this._updateHud();
  }

  _updateHud() { this.setHud({ Gold: this.gold, Lives: this.baseHP, Wave: this.wave, Score: this.score }); }

  _gridFromPx(px, py) {
    const offX = (this.viewW - this.cell * COLS) / 2, offY = (this.viewH - this.cell * ROWS) / 2;
    return { x: Math.floor((px - offX) / this.cell), y: Math.floor((py - offY) / this.cell) };
  }

  _onClick(px, py) {
    if (this.state !== "playing") return;
    const { x, y } = this._gridFromPx(px, py);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    if (this.pathSet.has(`${x},${y}`)) return;
    const existing = this.towers.find(t => t.x === x && t.y === y);
    if (existing) {
      const cost = UPGRADE_COST * existing.level;
      if (existing.level >= 4 || this.gold < cost) return audioManager.play("error");
      this.gold -= cost; existing.level++; existing.dmg *= 1.5; existing.range += 6;
      audioManager.play("coin");
    } else {
      if (this.gold < TOWER_COST) return audioManager.play("error");
      this.gold -= TOWER_COST;
      this.towers.push({ x, y, level: 1, dmg: 8 * this.diffMul, range: this.cell * 2.1, cooldown: 0, fireRate: 0.55 });
      audioManager.play("select");
    }
    this._updateHud();
  }

  _spawnWave() {
    this.wave += 1;
    const count = 6 + this.wave * 2;
    const hp = (14 + this.wave * 6) * this.diffMul;
    const speed = (55 + Math.min(60, this.wave * 2)) * this.diffMul;
    for (let i = 0; i < count; i++) this.enemies.push({ pathIdx: 0, t: 0, hp, maxHp: hp, speed, spawnDelay: i * 0.55, x: -100, y: -100 });
    audioManager.play("levelup");
  }

  onUpdate(dt) {
    if (this.betweenWaves) {
      this.waveTimer -= dt;
      this.setHud({ Gold: this.gold, Lives: this.baseHP, Wave: `${this.wave + 1} in ${Math.ceil(this.waveTimer)}s`, Score: this.score });
      if (this.waveTimer <= 0) { this._spawnWave(); this.betweenWaves = false; }
    }

    const offX = (this.viewW - this.cell * COLS) / 2, offY = (this.viewH - this.cell * ROWS) / 2;
    const toPx = (gx, gy) => ({ x: offX + gx * this.cell + this.cell / 2, y: offY + gy * this.cell + this.cell / 2 });

    for (const e of this.enemies) {
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; continue; }
      const cur = this.path[e.pathIdx];
      const nextIdx = Math.min(e.pathIdx + 1, this.path.length - 1);
      const next = this.path[nextIdx];
      const a = toPx(cur.x, cur.y), b = toPx(next.x, next.y);
      e.t += (e.speed * dt) / this.cell;
      if (e.t >= 1) { e.t = 0; e.pathIdx = nextIdx; }
      e.x = a.x + (b.x - a.x) * e.t; e.y = a.y + (b.y - a.y) * e.t;
      if (e.pathIdx >= this.path.length - 1 && e.t > 0.9) e.reached = true;
    }

    for (const e of this.enemies) {
      if (e.reached) { this.baseHP -= 1; this.shake(); audioManager.play("error"); }
    }
    this.enemies = this.enemies.filter(e => !e.reached && e.hp > 0);

    for (const t of this.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const pos = toPx(t.x, t.y);
      let target = null, bestDist = Infinity;
      for (const e of this.enemies) {
        if (e.spawnDelay > 0) continue;
        const d = Math.hypot(e.x - pos.x, e.y - pos.y);
        if (d <= t.range && d < bestDist) { bestDist = d; target = e; }
      }
      if (target) {
        t.cooldown = t.fireRate;
        this.bullets.push({ x: pos.x, y: pos.y, target, dmg: t.dmg });
        audioManager.play("pop");
      }
    }

    for (const b of this.bullets) {
      if (!b.target || b.target.hp <= 0) { b.dead = true; continue; }
      const dx = b.target.x - b.x, dy = b.target.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        b.target.hp -= b.dmg;
        b.dead = true;
        if (b.target.hp <= 0) { this.kills++; this.addScore(10); this.gold += 6; }
      } else { b.x += (dx / d) * 640 * dt; b.y += (dy / d) * 640 * dt; }
    }
    this.bullets = this.bullets.filter(b => !b.dead);

    if (this.baseHP <= 0) return this._gameOver();
    if (!this.betweenWaves && this.enemies.length === 0) {
      this.betweenWaves = true; this.waveTimer = 5;
    }
    this._updateHud();
  }

  _gameOver() {
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.score, message: `Survived ${this.wave} waves, ${this.kills} kills.`, extraStats: [{ label: "Wave", value: this.wave }, { label: "Kills", value: this.kills }] });
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    const offX = (this.viewW - this.cell * COLS) / 2, offY = (this.viewH - this.cell * ROWS) / 2;

    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const isPath = this.pathSet.has(`${x},${y}`);
      ctx.fillStyle = isPath ? "#2a2140" : "#12162a";
      ctx.fillRect(offX + x * this.cell, offY + y * this.cell, this.cell - 1, this.cell - 1);
    }

    ctx.fillStyle = "#7c5cff";
    const basePt = this.path[this.path.length - 1];
    ctx.fillRect(offX + basePt.x * this.cell, offY + basePt.y * this.cell, this.cell - 1, this.cell - 1);

    for (const t of this.towers) {
      const cx = offX + t.x * this.cell + this.cell / 2, cy = offY + t.y * this.cell + this.cell / 2;
      ctx.fillStyle = ["#22d3ee", "#2ee6a6", "#ffd76a", "#ff4fd8"][Math.min(t.level - 1, 3)];
      ctx.beginPath(); ctx.arc(cx, cy, this.cell * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0a0d18"; ctx.font = `${Math.floor(this.cell * 0.32)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(t.level), cx, cy);
    }

    for (const b of this.bullets) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill(); }

    for (const e of this.enemies) {
      if (e.spawnDelay > 0) continue;
      ctx.fillStyle = "#ff5470";
      ctx.beginPath(); ctx.arc(e.x, e.y, this.cell * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#00000088"; ctx.fillRect(e.x - 12, e.y - this.cell * 0.42, 24, 4);
      ctx.fillStyle = "#2ee6a6"; ctx.fillRect(e.x - 12, e.y - this.cell * 0.42, 24 * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
    ctx.restore();
  }
}

export default TowerDefenseGame;
