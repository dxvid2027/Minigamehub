// ==========================================================================
// Pong Duel — classic paddle battle vs an adaptive AI, first to 11 wins.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { clamp } from "../core/utils.js";

const WIN_SCORE = 11;

export class PongGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Defend your side (right) and knock the ball past the AI.",
      `First player to reach ${WIN_SCORE} points wins the match.`,
      "The ball speeds up slightly with every rally.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag anywhere on the board to move your paddle."; }
  getKeyboardHint() { return "Arrow Up/Down or W/S to move your paddle."; }

  getScene() { return "grid"; }
  onInit() {
    this.createCanvas();
    this.input.onPointer("move", (p) => { this._dragY = p.y; });
  }

  onStart(difficulty) {
    this.pW = 12; this.pH = 80; this.ballR = 8;
    this.basePaddleH = this.pH;
    this.p1 = { y: this.viewH / 2 - this.pH / 2, score: 0 }; // AI, left
    this.p2 = { y: this.viewH / 2 - this.pH / 2, score: 0 }; // player, right

    // The AI plays with a human-like handicap: it re-reads the ball on an
    // interval (reaction), aims at a point that is off by up to `aimError`,
    // and cannot move faster than `speed`. Without those three limits a
    // perfect tracker is literally unbeatable, which is no fun.
    const profiles = {
      Easy:   { speed: 210, aimError: 74, reaction: 0.34, idleDrift: 0.35 },
      Normal: { speed: 290, aimError: 44, reaction: 0.20, idleDrift: 0.55 },
      Hard:   { speed: 375, aimError: 20, reaction: 0.11, idleDrift: 0.80 },
    };
    this.ai = { ...(profiles[difficulty] || profiles.Normal), target: this.viewH / 2, timer: 0 };

    this._resetBall(Math.random() > 0.5 ? 1 : -1);
    this.setHud({ You: 0, AI: 0 });
  }

  /**
   * Predicts where the ball will cross the AI's paddle plane, reflecting off
   * the top and bottom walls on the way. Returns null when the ball is
   * travelling away from the AI.
   */
  _predictIntercept() {
    const b = this.ball;
    if (b.vx >= 0) return null;
    const planeX = this.pW + 4 + this.ballR;
    let y = b.y;
    let vy = b.vy;
    let t = (b.x - planeX) / -b.vx;
    if (t <= 0) return null;
    const top = this.ballR, bottom = this.viewH - this.ballR;
    // Walk the flight forward, folding each wall bounce as it happens.
    let guard = 0;
    while (guard++ < 12) {
      const nextY = y + vy * t;
      if (nextY < top) { const dt = (top - y) / vy; y = top; vy = -vy; t -= dt; continue; }
      if (nextY > bottom) { const dt = (bottom - y) / vy; y = bottom; vy = -vy; t -= dt; continue; }
      y = nextY;
      break;
    }
    return y;
  }

  _resetBall(dir) {
    this.rally = 0;
    this.ball = { x: this.viewW / 2, y: this.viewH / 2, vx: 320 * dir, vy: (Math.random() * 2 - 1) * 210 };
  }

  onUpdate(dt) {
    const up = this.input.isDown("ArrowUp", "KeyW") || this.input.virtual.up;
    const down = this.input.isDown("ArrowDown", "KeyS") || this.input.virtual.down;
    const speed = 420;
    if (this._dragY != null) {
      this.p2.y += clamp(this._dragY - (this.p2.y + this.pH / 2), -speed * dt, speed * dt);
    }
    if (up) this.p2.y -= speed * dt;
    if (down) this.p2.y += speed * dt;
    this.p2.y = clamp(this.p2.y, 0, this.viewH - this.pH);

    this._updateAI(dt);

    const b = this.ball;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y - this.ballR < 0) { b.y = this.ballR; b.vy *= -1; }
    if (b.y + this.ballR > this.viewH) { b.y = this.viewH - this.ballR; b.vy *= -1; }

    if (b.vx < 0 && b.x - this.ballR < this.pW + 4 && b.y > this.p1.y && b.y < this.p1.y + this.pH) {
      this._bounce(this.p1, this.pW + 4 + this.ballR);
    }
    if (b.vx > 0 && b.x + this.ballR > this.viewW - this.pW - 4 && b.y > this.p2.y && b.y < this.p2.y + this.pH) {
      this._bounce(this.p2, this.viewW - this.pW - 4 - this.ballR);
    }

    if (b.x < -30) { this._score("p2"); }
    else if (b.x > this.viewW + 30) { this._score("p1"); }
  }

  _updateAI(dt) {
    const ai = this.ai;
    ai.timer -= dt;
    if (ai.timer <= 0) {
      ai.timer = ai.reaction;
      const intercept = this._predictIntercept();
      if (intercept == null) {
        // Ball heading away: drift lazily back toward the middle, so a good
        // player can wrong-foot the AI with a sharp return.
        ai.target = this.viewH / 2 + (ai.target - this.viewH / 2) * (1 - ai.idleDrift);
      } else {
        ai.target = intercept + (Math.random() * 2 - 1) * ai.aimError;
      }
    }
    const want = clamp(ai.target - this.pH / 2, 0, this.viewH - this.pH);
    const dy = clamp(want - this.p1.y, -ai.speed * dt, ai.speed * dt);
    this.p1.y = clamp(this.p1.y + dy, 0, this.viewH - this.pH);
  }

  _bounce(paddle, x) {
    const b = this.ball;
    b.x = x;
    this.rally = (this.rally || 0) + 1;

    const rel = (b.y - (paddle.y + this.pH / 2)) / (this.pH / 2);
    b.vy = rel * (320 + this.rally * 8);
    b.vx *= -1.055;
    // Rally escalation: two evenly matched defenders would otherwise trade
    // shots forever, so every sixth exchange raises the pace outright. Points
    // always come eventually, even between two perfect players.
    if (this.rally % 6 === 0) {
      b.vx += Math.sign(b.vx) * 55;
      this.pH = Math.max(46, this.pH - 4);   // paddles shrink as the rally drags
    }
    b.vx = clamp(b.vx, -1050, 1050);
    audioManager.play("hit");
  }

  _score(who) {
    this.pH = this.basePaddleH;              // reset paddle size for the new serve
    if (who === "p1") { this.p1.score++; this._resetBall(1); } else { this.p2.score++; this._resetBall(-1); }
    audioManager.play("score");
    this.setHud({ You: this.p2.score, AI: this.p1.score });
    this.setScore(this.p2.score);
    if (this.p1.score >= WIN_SCORE) this.endGame({ result: "loss", score: this.p2.score, message: `AI won ${this.p1.score}-${this.p2.score}` });
    else if (this.p2.score >= WIN_SCORE) this.endGame({ result: "win", score: this.p2.score, message: `You won ${this.p2.score}-${this.p1.score}!` });
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.strokeStyle = "#ffffff1c"; ctx.setLineDash([6, 12]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(this.viewW / 2, 0); ctx.lineTo(this.viewW / 2, this.viewH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#ffffff10"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.viewW / 2, this.viewH / 2, 62, 0, Math.PI * 2); ctx.stroke();

    // Brushed plates rather than flat bars: the grain gives the paddles a
    // material, and the glow underneath keeps the neon read.
    this.gfx.glow(ctx, 4 + this.pW / 2, this.p1.y + this.pH / 2, this.pH * 0.5, "#22d3ee", 0.5);
    this.gfx.panel(ctx, 4, this.p1.y, this.pW, this.pH, 6, "#22d3ee");
    this.gfx.glow(ctx, this.viewW - this.pW / 2 - 4, this.p2.y + this.pH / 2, this.pH * 0.5, "#2ee6a6", 0.5);
    this.gfx.panel(ctx, this.viewW - this.pW - 4, this.p2.y, this.pW, this.pH, 6, "#2ee6a6");

    // Motion trail behind the ball
    for (let i = 4; i >= 1; i--) {
      const t = i / 5;
      ctx.globalAlpha = 0.1 * (1 - t) + 0.05;
      this.gfx.orb(ctx, this.ball.x - this.ball.vx * 0.012 * i, this.ball.y - this.ball.vy * 0.012 * i,
                   this.ballR * (1 - t * 0.5), "#ffffff", { glow: 0 });
    }
    ctx.globalAlpha = 1;
    this.gfx.orb(ctx, this.ball.x, this.ball.y, this.ballR, "#ffffff", { glow: 0.9 });
    ctx.restore();
  }
}

export default PongGame;
