// ==========================================================================
// Typing Rush — type the falling words before they hit the ground.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { choice } from "../core/utils.js";

const WORDS = [
  "pixel", "arcade", "combo", "rocket", "shield", "quest", "turbo", "nova", "vector", "cosmic",
  "puzzle", "sprint", "glitch", "matrix", "photon", "cyber", "laser", "orbit", "portal", "level",
  "score", "bonus", "player", "energy", "engine", "system", "stream", "coding", "keyboard", "target",
  "victory", "champion", "strategy", "adventure", "explosion", "highscore", "challenge", "legendary",
];

export class TypingRushGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Words fall from the top — type them to destroy them.",
      "Typing automatically targets the closest matching word.",
      "Let 3 words hit the ground and the run is over.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "This game needs a physical keyboard (or an on-screen one)."; }
  getKeyboardHint() { return "Just start typing — Backspace clears your current input."; }

  getScene() { return "aurora"; }
  onInit() {
    this.createCanvas();
    this._onKey = (e) => this._handleKey(e);
    window.addEventListener("keydown", this._onKey);
    // On touch devices, focus a hidden input so the on-screen keyboard opens.
    this.hiddenInput = document.createElement("input");
    this.hiddenInput.setAttribute("aria-label", "Typing input");
    this.hiddenInput.style.cssText = "position:absolute;opacity:0;width:1px;height:1px;left:0;top:0;";
    this.stageEl.appendChild(this.hiddenInput);
    this.stageEl.addEventListener("click", () => this.hiddenInput.focus());
  }

  onStart(difficulty) {
    this.fallSpeed = difficulty === "Hard" ? 58 : difficulty === "Normal" ? 42 : 30;
    this.spawnEvery = difficulty === "Hard" ? 1.5 : difficulty === "Normal" ? 2 : 2.6;
    this.words = [];
    this.typed = "";
    this.lives = 3;
    this.completed = 0;
    this.spawnTimer = 0.6;
    this.startedAt = performance.now();
    this.typedChars = 0;
    this.setScore(0);
    this._updateHud();
    if (this.input.isTouch) setTimeout(() => this.hiddenInput.focus(), 100);
  }

  _updateHud() {
    const mins = Math.max(0.01, (performance.now() - this.startedAt) / 60000);
    const wpm = Math.round((this.typedChars / 5) / mins);
    this.setHud({ Score: this.score, Lives: GameBase.hearts(this.lives), WPM: isFinite(wpm) ? wpm : 0 });
  }

  _handleKey(e) {
    if (this.state !== "playing") return;
    if (e.key === "Backspace") { this.typed = ""; e.preventDefault(); return; }
    if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;
    e.preventDefault();
    this.typed += e.key.toLowerCase();
    this.typedChars++;
    const matches = this.words.filter(w => w.text.startsWith(this.typed));
    if (!matches.length) { this.typed = ""; audioManager.play("error"); return; }
    audioManager.play("select");
    const done = matches.find(w => w.text === this.typed);
    if (done) {
      this.words = this.words.filter(w => w !== done);
      this.completed++;
      this.addScore(10 + done.text.length * 2);
      this.typed = "";
      audioManager.play("combo");
      this.particles.burst(done.x, done.y, { count: 10, colors: ["#2ee6a6", "#22d3ee"], life: 0.4, speed: 180 });
    }
    this._updateHud();
  }

  onUpdate(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnEvery * (0.7 + Math.random() * 0.6);
      const text = choice(WORDS);
      this.words.push({ text, x: 40 + Math.random() * Math.max(10, this.viewW - 160), y: -10 });
    }
    const speed = this.fallSpeed + this.completed * 1.6;
    for (const w of this.words) w.y += speed * dt;
    const missed = this.words.filter(w => w.y > this.viewH - 16);
    if (missed.length) {
      this.words = this.words.filter(w => w.y <= this.viewH - 16);
      this.lives -= missed.length;
      this.shake();
      audioManager.play("error");
      this._updateHud();
      if (this.lives <= 0) return this._finish();
    }
  }

  _finish() {
    const mins = Math.max(0.01, (performance.now() - this.startedAt) / 60000);
    const wpm = Math.round((this.typedChars / 5) / mins);
    audioManager.play("gameover");
    this.endGame({ result: "loss", score: this.completed, message: `${this.completed} words typed at ${wpm} WPM.`, extraStats: [{ label: "Words", value: this.completed }, { label: "WPM", value: wpm }] });
  }

  onRender(ctx, dt) {
    this.gfx.backdrop(ctx, dt);
    ctx.save(); ctx.scale(this.dpr, this.dpr);
    ctx.strokeStyle = "#ff547055";
    ctx.beginPath(); ctx.moveTo(0, this.viewH - 16); ctx.lineTo(this.viewW, this.viewH - 16); ctx.stroke();

    ctx.font = "600 20px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    for (const w of this.words) {
      const matched = w.text.startsWith(this.typed) && this.typed.length > 0;
      const done = matched ? this.typed.length : 0;
      ctx.fillStyle = "#2ee6a6";
      ctx.fillText(w.text.slice(0, done), w.x, w.y);
      const offset = ctx.measureText(w.text.slice(0, done)).width;
      ctx.fillStyle = matched ? "#f4f6ff" : "#c7cbe0";
      ctx.fillText(w.text.slice(done), w.x + offset, w.y);
    }

    ctx.fillStyle = "#22d3ee"; ctx.font = "700 22px ui-monospace, monospace"; ctx.textAlign = "center";
    ctx.fillText(this.typed || "…", this.viewW / 2, this.viewH - 44);
    ctx.textAlign = "left";
    ctx.restore();
  }

  onDestroy() { window.removeEventListener("keydown", this._onKey); }
}

export default TypingRushGame;
