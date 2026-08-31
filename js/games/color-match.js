// ==========================================================================
// Color Match — a Stroop-effect reflex test: tap the button matching the
// INK color the word is drawn in, not the word itself.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, choice, shuffle, formatTime } from "../core/utils.js";

const COLORS = [
  { name: "Red", hex: "#ff5470" }, { name: "Blue", hex: "#22d3ee" }, { name: "Green", hex: "#2ee6a6" },
  { name: "Yellow", hex: "#ffd76a" }, { name: "Purple", hex: "#c86bff" }, { name: "Orange", hex: "#ff9f43" },
];

export class ColorMatchGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "A color word appears, drawn in an ink color.",
      "Tap the button matching the INK COLOR — ignore what the word says!",
      "Answer as many as you can correctly before time runs out.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap the button matching the ink color."; }
  getKeyboardHint() { return "Click the button matching the ink color."; }

  onInit() {
    this.wordEl = el("div", { style: "font-family:var(--font-display);font-weight:800;font-size:clamp(2.2rem,7vw,3.4rem);" });
    this.wrap = el("div", { style: "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:16px;" });
    this.btnRow = el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;justify-content:center;" });
    this.wrap.append(this.wordEl, this.btnRow);
    this.stageEl.appendChild(this.wrap);
  }

  onStart(difficulty) {
    this.optionCount = difficulty === "Hard" ? 6 : difficulty === "Normal" ? 5 : 4;
    this.roundTime = difficulty === "Hard" ? 35 : 45;
    this.streak = 0;
    this.correct = 0;
    this.setScore(0);
    this.setHud({ Score: 0, Time: this.roundTime, Streak: "x1" });
    this._nextRound();
  }

  onUpdate(dt) {
    this.roundTime -= dt;
    if (this.roundTime <= 0) return this._finish();
    this.setHud({ Score: this.score, Time: Math.ceil(this.roundTime), Streak: `x${1 + Math.floor(this.streak / 3)}` });
  }

  _nextRound() {
    const options = shuffle(COLORS).slice(0, this.optionCount);
    const word = choice(options);
    const ink = choice(options);
    this.current = { word, ink };
    this.wordEl.textContent = word.name.toUpperCase();
    this.wordEl.style.color = ink.hex;
    this.wordEl.style.textShadow = `0 0 24px ${ink.hex}66`;
    this.btnRow.innerHTML = "";
    shuffle(options).forEach(opt => {
      this.btnRow.appendChild(el("button", {
        class: "btn btn-ghost",
        style: `border-color:${opt.hex}55;`,
        onClick: () => this._answer(opt),
      }, opt.name));
    });
  }

  _answer(opt) {
    if (this.state !== "playing") return;
    if (opt.hex === this.current.ink.hex) {
      this.streak++; this.correct++;
      const gained = 10 + Math.min(30, this.streak * 2);
      this.addScore(gained);
      audioManager.play("combo");
    } else {
      this.streak = 0;
      audioManager.play("error");
      this.shake();
    }
    this._nextRound();
  }

  _finish() {
    audioManager.play(this.correct > 0 ? "win" : "gameover");
    this.endGame({ result: "score", score: this.score, message: `${this.correct} correct answers.`, extraStats: [{ label: "Correct", value: this.correct }] });
  }
}

export default ColorMatchGame;
