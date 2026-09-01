// ==========================================================================
// Air Hockey — fast puck physics vs an AI mallet, first to 7 goals wins.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp } from "../core/utils.js";

const WIN_GOALS = 5;
const MATCH_SECONDS = 90;

export class AirHockeyGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Drag your mallet (bottom half) to strike the puck.",
      `First to ${WIN_GOALS} goals wins — or the higher score when the ${MATCH_SECONDS}s clock runs out.`,
      "Hit the puck with a moving mallet for extra power.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag your mallet around the bottom half of the table."; }
  getKeyboardHint() { return "Move the mouse to control your mallet (arrow keys also work)."; }

  getScene() { return "grid"; }
  onInit() {
    this.createCanvas();
    this.input.onPointer("move", (p) => { this._target = { x: p.x, y: p.y }; });
  }

  onStart(difficulty) {
    // Same handicap model as Pong: capped speed, a reaction interval and an
    // aim error, so the AI defends convincingly but can be beaten.
    const profiles = {
      Easy:   { speed: 200, reaction: 0.30, aimError: 60 },
      Normal: { speed: 285, reaction: 0.18, aimError: 34 },
      Hard:   { speed: 360, reaction: 0.10, aimError: 16 },
    };
    this.aiCfg = profiles[difficulty] || profiles.Normal;
    this.aiSpeed = this.aiCfg.speed;
    this._aiTimer = 0;
    this._aiTarget = { x: this.viewW / 2, y: 70 };
    this.goalW = this.viewW * 0.52;
    // Serve the puck immediately so a match opens with play, not a stand-off.
    this.puck = { x: this.viewW / 2, y: this.viewH / 2, vx: (Math.random() * 2 - 1) * 120, vy: (Math.random() > 0.5 ? 1 : -1) * 240, r: 13 };
    this.player = { x: this.viewW / 2, y: this.viewH - 70, r: 24, vx: 0, vy: 0 };
    this.ai = { x: this.viewW / 2, y: 70, r: 24 };
    this.scoreP = 0; this.scoreAI = 0;
    this._target = null;
    this.timeLeft = MATCH_SECONDS;
    this.setHud({ You: 0, AI: 0, Time: MATCH_SECONDS });
    this.setScore(0);
  }

  onUpdate(dt) {
    // A running clock guarantees every match ends, even between two players
    // who never miss.
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; return this._timeUp(); }

    const p = this.player;
    const speed = 520;
    const prevX = p.x, prevY = p.y;
    if (this._target) {
      p.x += clamp(this._target.x - p.x, -speed * dt, speed * dt);
      p.y += clamp(this._target.y - p.y, -speed * dt, speed * dt);
    }
    if (this.input.isDown("ArrowLeft", "KeyA")) p.x -= speed * dt;
    if (this.input.isDown("ArrowRight", "KeyD")) p.x += speed * dt;
    if (this.input.isDown("ArrowUp", "KeyW")) p.y -= speed * dt;
    if (this.input.isDown("ArrowDown", "KeyS")) p.y += speed * dt;
    p.x = clamp(p.x, p.r, this.viewW - p.r);
    p.y = clamp(p.y, this.viewH / 2 + p.r, this.viewH - p.r);
    p.vx = (p.x - prevX) / Math.max(dt, 0.001);
    p.vy = (p.y - prevY) / Math.max(dt, 0.001);

    // AI mallet: re-reads the puck on an interval, aims imperfectly, and
    // falls back to guarding its goal when the puck is on the player's half.
    const ai = this.ai;
    this._aiTimer -= dt;
    if (this._aiTimer <= 0) {
      this._aiTimer = this.aiCfg.reaction;
      const err = () => (Math.random() * 2 - 1) * this.aiCfg.aimError;
      if (this.puck.y < this.viewH / 2) {
        this._aiTarget = {
          x: this.puck.x + err(),
          y: Math.min(this.puck.y - 8, this.viewH / 2 - ai.r) + err() * 0.3,
        };
      } else {
        // Guard position: stay between the puck and the goal, not dead centre.
        this._aiTarget = { x: this.viewW / 2 + (this.puck.x - this.viewW / 2) * 0.35 + err() * 0.5, y: 78 };
      }
    }
    ai.x += clamp(this._aiTarget.x - ai.x, -this.aiSpeed * dt, this.aiSpeed * dt);
    ai.y += clamp(this._aiTarget.y - ai.y, -this.aiSpeed * dt, this.aiSpeed * dt);
    ai.x = clamp(ai.x, ai.r, this.viewW - ai.r);
    ai.y = clamp(ai.y, ai.r, this.viewH / 2 - ai.r);

    const k = this.puck;
    k.x += k.vx * dt; k.y += k.vy * dt;
    k.vx *= 0.998; k.vy *= 0.998;   // near-frictionless table, like the real thing

    if (k.x - k.r < 0) { k.x = k.r; k.vx = Math.abs(k.vx); audioManager.play("hit"); }
    if (k.x + k.r > this.viewW) { k.x = this.viewW - k.r; k.vx = -Math.abs(k.vx); audioManager.play("hit"); }

    const goalMinX = (this.viewW - this.goalW) / 2, goalMaxX = goalMinX + this.goalW;
    if (k.y - k.r < 0) {
      if (k.x > goalMinX && k.x < goalMaxX) return this._goal("player");
      k.y = k.r; k.vy = Math.abs(k.vy); audioManager.play("hit");
    }
    if (k.y + k.r > this.viewH) {
      if (k.x > goalMinX && k.x < goalMaxX) return this._goal("ai");
      k.y = this.viewH - k.r; k.vy = -Math.abs(k.vy); audioManager.play("hit");
    }

    this._collide(p, true);
    this._collide(ai, false);
    this.setHud({ You: this.scoreP, AI: this.scoreAI, Time: Math.ceil(this.timeLeft) });
  }

  _timeUp() {
    const won = this.scoreP > this.scoreAI;
    const drew = this.scoreP === this.scoreAI;
    audioManager.play(won ? "win" : drew ? "gameover" : "lose");
    this.endGame({
      result: drew ? "draw" : won ? "win" : "loss",
      score: this.scoreP,
      message: drew ? `Full time — ${this.scoreP}-${this.scoreAI}, honours even.`
                    : `Full time — ${this.scoreP}-${this.scoreAI}.`,
    });
  }

  _collide(mallet, isPlayer) {
    const k = this.puck;
    const dx = k.x - mallet.x, dy = k.y - mallet.y;
    const dist = Math.hypot(dx, dy);
    const minDist = k.r + mallet.r;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist, ny = dy / dist;
    k.x = mallet.x + nx * minDist;
    k.y = mallet.y + ny * minDist;
    const impact = isPlayer ? Math.hypot(mallet.vx || 0, mallet.vy || 0) * 0.35 : 180;
    const base = Math.hypot(k.vx, k.vy) * 0.6;
    const power = clamp(base + impact + 260, 300, 1000);
    k.vx = nx * power; k.vy = ny * power;
    audioManager.play("pop");
    this.vibrateOn(15);
  }

  _goal(scorer) {
    if (scorer === "player") { this.scoreP++; audioManager.play("coin"); this.particles.confetti(this.viewW / 2, 40, 16); }
    else { this.scoreAI++; audioManager.play("error"); this.shake(); }
    this.setHud({ You: this.scoreP, AI: this.scoreAI, Time: Math.ceil(this.timeLeft) });
    this.setScore(this.scoreP);
    if (this.scoreP >= WIN_GOALS) return this.endGame({ result: "win", score: this.scoreP, message: `You won ${this.scoreP}-${this.scoreAI}!` });
    if (this.scoreAI >= WIN_GOALS) return this.endGame({ result: "loss", score: this.scoreP, message: `The AI won ${this.scoreAI}-${this.scoreP}.` });
    this.puck = { x: this.viewW / 2, y: this.viewH / 2, vx: 0, vy: (scorer === "player" ? 1 : -1) * 180, r: 13 };
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    // Table markings
    this.gfx.neonLine(ctx, 0, this.viewH / 2, this.viewW, this.viewH / 2, "#ffffff", 1.6, 0.35);
    ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(this.viewW / 2, this.viewH / 2, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(this.viewW / 2, this.viewH / 2, 6, 0, Math.PI * 2); ctx.stroke();

    const goalMinX = (this.viewW - this.goalW) / 2;
    this.gfx.block(ctx, goalMinX, 0, this.goalW, 7, 3, "#2ee6a6", { glow: 0.8 });
    this.gfx.block(ctx, goalMinX, this.viewH - 7, this.goalW, 7, 3, "#ff5470", { glow: 0.8 });

    this.gfx.orb(ctx, this.ai.x, this.ai.y, this.ai.r, "#22d3ee", { glow: 0.55 });
    this.gfx.orb(ctx, this.player.x, this.player.y, this.player.r, "#2ee6a6", { glow: 0.55 });
    // Puck sits on a shadow so it reads as floating on the table
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(this.puck.x, this.puck.y + 5, this.puck.r, this.puck.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    this.gfx.orb(ctx, this.puck.x, this.puck.y, this.puck.r, "#f4f6ff", { glow: 0.9 });
    ctx.restore();
  }
}

export default AirHockeyGame;
