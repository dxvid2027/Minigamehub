// ==========================================================================
// Simon Says — watch the growing color/sound pattern, then repeat it.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el } from "../core/utils.js";

const PADS = [
  { cls: "b1", freq: 329.63 }, { cls: "b2", freq: 392.0 }, { cls: "b3", freq: 493.88 }, { cls: "b4", freq: 587.33 },
];

export class SimonSaysGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Watch the pads light up in sequence, then repeat the pattern by tapping them in order.",
      "Each round adds one more step to the sequence.",
      "One wrong tap ends the game — how long a sequence can you remember?",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap the pads in the order they lit up."; }
  getKeyboardHint() { return "Click the pads in the order they lit up."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.wrap = el("div", { class: "board-wrap" });
    this.pad = el("div", { class: "simon-pad" });
    PADS.forEach((p, i) => {
      const btn = el("button", { class: p.cls, type: "button", onClick: () => this._playerTap(i) });
      this.pad.appendChild(btn);
    });
    this.wrap.appendChild(this.pad);
    this.stageEl.appendChild(this.wrap);
  }

  onStart(difficulty) {
    this.speed = difficulty === "Hard" ? 0.32 : difficulty === "Normal" ? 0.42 : 0.55;
    this.sequence = [];
    this.playerIdx = 0;
    this.accepting = false;
    this.setScore(0);
    this.setHud({ Round: 0, Best: 0 });
    setTimeout(() => this._nextRound(), 700);
  }

  _nextRound() {
    this.sequence.push(Math.floor(Math.random() * 4));
    this.playerIdx = 0;
    this.accepting = false;
    this.setScore(this.sequence.length - 1);
    this.setHud({ Round: this.sequence.length, Best: this.sequence.length });
    this._playback();
  }

  _playback() {
    let i = 0;
    const step = () => {
      if (i > 0) this._lightOff(this.sequence[i - 1]);
      if (i >= this.sequence.length) { this.accepting = true; return; }
      this._lightOn(this.sequence[i]);
      i++;
      setTimeout(step, this.speed * 1000);
    };
    setTimeout(step, 400);
  }

  _lightOn(i) {
    const btn = this.pad.children[i];
    btn.classList.add("lit");
    audioManager.play("select");
    this._playTone(PADS[i].freq);
  }
  _lightOff(i) { this.pad.children[i]?.classList.remove("lit"); }

  _playTone(freq) {
    audioManager._ensureCtx();
    audioManager._tone({ freq, dur: this.speed * 0.9, type: "triangle", gain: 0.18 });
  }

  _playerTap(i) {
    if (!this.accepting || this.state !== "playing") return;
    this._lightOn(i);
    setTimeout(() => this._lightOff(i), 220);
    if (this.sequence[this.playerIdx] !== i) return this._fail();
    this.playerIdx++;
    if (this.playerIdx >= this.sequence.length) {
      this.accepting = false;
      setTimeout(() => this._nextRound(), 700);
    }
  }

  _fail() {
    this.accepting = false;
    this.shake();
    audioManager.play("gameover");
    const round = this.sequence.length - 1;
    this.endGame({ result: "score", score: round, message: `You reached round ${round + 1}.` });
  }
}

export default SimonSaysGame;
