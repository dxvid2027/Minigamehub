// ==========================================================================
// Word Scramble — unscramble as many words as you can before time runs out.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, shuffle, choice } from "../core/utils.js";

const WORD_BANK = {
  Easy: ["game", "play", "jump", "star", "coin", "level", "score", "power", "quest", "arena", "pixel", "robot", "laser", "medal"],
  Normal: ["arcade", "puzzle", "victory", "shooter", "console", "trophy", "combat", "sprint", "wizard", "dragon", "castle", "rocket"],
  Hard: ["adventure", "champion", "highscore", "multiplayer", "strategy", "legendary", "controller", "achievement", "leaderboard", "checkpoint"],
};

export class WordScrambleGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Rearrange the scrambled letters to reveal the hidden word.",
      "Tap letters (or type them) to build your answer, Backspace to undo.",
      "Solve as many words as you can before the timer expires.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap the letter tiles to spell out the word."; }
  getKeyboardHint() { return "Type the letters, Backspace to undo, Enter to submit."; }

  onInit() {
    this.wrap = el("div", { style: "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:18px;text-align:center;" });
    this.answerEl = el("div", { style: "font-family:var(--font-mono);font-size:clamp(1.4rem,5vw,2.2rem);letter-spacing:.22em;min-height:2.2rem;color:var(--accent-2);" });
    this.lettersEl = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;justify-content:center;" });
    this.hintEl = el("div", { style: "font-size:.85rem;color:var(--text-2);" });
    this.actionsEl = el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;justify-content:center;" }, [
      el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._clear() }, "↺ Clear"),
      el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._hint() }, "💡 Hint (-5)"),
      el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._skip() }, "⏭ Skip"),
    ]);
    this.wrap.append(this.answerEl, this.lettersEl, this.hintEl, this.actionsEl);
    this.stageEl.appendChild(this.wrap);
    this._onKey = (e) => this._handleKey(e);
    window.addEventListener("keydown", this._onKey);
  }

  onStart(difficulty) {
    this.pool = WORD_BANK[difficulty] || WORD_BANK.Normal;
    this.roundTime = 90;
    this.solved = 0;
    this.hintsUsed = 0;
    this.setScore(0);
    this.setHud({ Score: 0, Solved: 0, Time: this.roundTime });
    this._nextWord();
  }

  onUpdate(dt) {
    this.roundTime -= dt;
    if (this.roundTime <= 0) return this._finish();
    this.setHud({ Score: this.score, Solved: this.solved, Time: Math.ceil(this.roundTime) });
  }

  _nextWord() {
    this.word = choice(this.pool);
    let scrambled = shuffle(this.word.split(""));
    if (scrambled.join("") === this.word) scrambled = shuffle(scrambled);
    this.letters = scrambled.map((ch, i) => ({ ch, id: i, used: false }));
    this.answer = [];
    this.hintEl.textContent = `${this.word.length} letters`;
    this._render();
  }

  _render() {
    this.answerEl.textContent = this.answer.map(a => a.ch).join("") || "_".repeat(this.word.length);
    this.lettersEl.innerHTML = "";
    this.letters.forEach(l => {
      const btn = el("button", {
        class: "btn btn-ghost",
        style: `min-width:44px;font-family:var(--font-mono);font-size:1.15rem;${l.used ? "opacity:.3;pointer-events:none;" : ""}`,
        onClick: () => this._pick(l),
      }, l.ch.toUpperCase());
      this.lettersEl.appendChild(btn);
    });
  }

  _pick(letter) {
    if (letter.used || this.state !== "playing") return;
    letter.used = true;
    this.answer.push(letter);
    audioManager.play("select");
    this._render();
    if (this.answer.length === this.word.length) this._check();
  }

  _handleKey(e) {
    if (this.state !== "playing") return;
    if (e.key === "Backspace") { e.preventDefault(); return this._undo(); }
    if (e.key === "Enter") { e.preventDefault(); return this._check(); }
    if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;
    const ch = e.key.toLowerCase();
    const letter = this.letters.find(l => !l.used && l.ch === ch);
    if (letter) this._pick(letter);
    else audioManager.play("error");
  }

  _undo() {
    const last = this.answer.pop();
    if (last) { last.used = false; this._render(); }
  }
  _clear() { this.answer.forEach(a => a.used = false); this.answer = []; this._render(); }

  _hint() {
    if (this.state !== "playing") return;
    this.hintsUsed++;
    this.addScore(-5);
    this.hintEl.textContent = `Starts with "${this.word[0].toUpperCase()}" · ${this.word.length} letters`;
    audioManager.play("toggle");
  }

  _skip() {
    if (this.state !== "playing") return;
    audioManager.play("error");
    this._nextWord();
  }

  _check() {
    if (this.answer.map(a => a.ch).join("") === this.word) {
      this.solved++;
      this.addScore(10 + this.word.length * 2);
      audioManager.play("combo");
      this.particles.confetti(this.viewW / 2, this.viewH / 2, 12);
      this._nextWord();
    } else {
      audioManager.play("error");
      this.shake();
      this._clear();
    }
  }

  _finish() {
    audioManager.play(this.solved > 0 ? "win" : "gameover");
    this.endGame({ result: "score", score: this.score, message: `${this.solved} words unscrambled!`, extraStats: [{ label: "Solved", value: this.solved }, { label: "Hints", value: this.hintsUsed }] });
  }

  onDestroy() { window.removeEventListener("keydown", this._onKey); }
}

export default WordScrambleGame;
