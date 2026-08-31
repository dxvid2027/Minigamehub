// ==========================================================================
// Whack-a-Mole — bop moles as they pop up before the round timer runs out.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, randInt, choice } from "../core/utils.js";

const HOLES = 9;

export class WhackAMoleGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Moles pop up at random holes — tap or click them fast.",
      "Score as many hits as you can before time runs out.",
      "Higher difficulty means faster, shorter mole appearances.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap the moles as soon as they appear."; }
  getKeyboardHint() { return "Click the moles as soon as they appear."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid whack-grid" });
    this.holes = [];
    for (let i = 0; i < HOLES; i++) {
      const mole = el("div", { class: "mole" }, "🐹");
      const hole = el("div", { class: "whack-hole", onClick: () => this._whack(i) }, mole);
      this.holes.push({ el: hole, up: false, upTime: 0, hit: false });
      this.boardEl.appendChild(hole);
    }
    this.stageEl.appendChild(this.boardEl);
  }

  onStart(difficulty) {
    this.roundTime = difficulty === "Hard" ? 30 : difficulty === "Normal" ? 40 : 50;
    this.spawnInterval = difficulty === "Hard" ? 0.45 : difficulty === "Normal" ? 0.65 : 0.85;
    this.moleUpTime = difficulty === "Hard" ? 0.55 : difficulty === "Normal" ? 0.75 : 1;
    this.spawnTimer = 0.6;
    this.combo = 0;
    this.hits = 0;
    this.misses = 0;
    this.holes.forEach(h => { h.up = false; h.hit = false; h.el.className = "whack-hole"; });
    this.setScore(0);
    this.setHud({ Score: 0, Time: this.roundTime, Combo: "x1" });
  }

  onUpdate(dt) {
    this.roundTime -= dt;
    if (this.roundTime <= 0) { this.roundTime = 0; this._finish(); return; }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval * (0.7 + Math.random() * 0.6);
      const downHoles = this.holes.map((h, i) => (!h.up ? i : -1)).filter(i => i >= 0);
      if (downHoles.length) {
        const i = choice(downHoles);
        const h = this.holes[i];
        h.up = true; h.hit = false; h.upTime = this.moleUpTime;
        h.el.classList.add("up"); h.el.classList.remove("hit");
      }
    }
    for (const h of this.holes) {
      if (!h.up) continue;
      h.upTime -= dt;
      if (h.upTime <= 0) {
        h.up = false;
        h.el.classList.remove("up");
        if (!h.hit) { this.combo = 0; this.setHud({ Score: this.score, Time: Math.ceil(this.roundTime), Combo: "x1" }); }
      }
    }
  }

  _whack(i) {
    if (this.state !== "playing") return;
    const h = this.holes[i];
    if (!h.up || h.hit) return;
    h.hit = true;
    h.el.classList.add("hit");
    this.combo += 1;
    this.hits += 1;
    const gained = 10 + Math.min(40, this.combo * 2);
    this.addScore(gained);
    audioManager.play("hit");
    this.vibrateOn(20);
    this.setHud({ Score: this.score, Time: Math.ceil(this.roundTime), Combo: `x${1 + Math.floor(this.combo / 3)}` });
  }

  _finish() {
    this.holes.forEach(h => { h.up = false; h.el.classList.remove("up"); });
    audioManager.play(this.score > 0 ? "win" : "gameover");
    this.endGame({ result: this.score >= 200 ? "win" : "score", score: this.score, message: `${this.hits} moles whacked!`, extraStats: [{ label: "Hits", value: this.hits }] });
  }
}

export default WhackAMoleGame;
