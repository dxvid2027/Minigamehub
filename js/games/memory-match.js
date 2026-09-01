// ==========================================================================
// Memory Match — flip cards, find every pair, score from speed + efficiency.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, shuffle, formatTime } from "../core/utils.js";
import { FRUIT_NAMES, spriteURL } from "./sprites.js";

// Drawn fruit rather than emoji: emoji render as a different picture on every
// platform and are a blurry font glyph at card size.
const SYMBOLS = FRUIT_NAMES;

export class MemoryMatchGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Flip two cards at a time to find a matching pair.",
      "Matched pairs stay face-up — clear the whole board.",
      "Fewer moves and faster times earn a higher score.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap two cards to flip them."; }
  getKeyboardHint() { return "Click / tap two cards to flip them."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid memory-grid" });
    this.stageEl.appendChild(this.boardEl);
  }

  onStart(difficulty) {
    const pairCount = difficulty === "Hard" ? 12 : difficulty === "Normal" ? 8 : 6;
    const symbols = shuffle(SYMBOLS).slice(0, pairCount);
    this.cards = shuffle([...symbols, ...symbols]).map((s, i) => ({ id: i, symbol: s, flipped: false, matched: false }));
    this.cols = pairCount <= 6 ? 4 : pairCount <= 8 ? 4 : 6;
    this.boardEl.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
    this.boardEl.style.gridTemplateRows = `repeat(${Math.ceil(this.cards.length / this.cols)}, 1fr)`;
    this.moves = 0;
    this.matchedPairs = 0;
    this.totalPairs = pairCount;
    this.elapsed = 0;
    this.locked = false;
    this.selection = [];
    this.setScore(0);
    this.setHud({ Moves: 0, Pairs: `0/${pairCount}`, Time: "0s" });
    this._renderBoard();
  }

  onUpdate(dt) {
    this.elapsed += dt;
    this.setHud({ Moves: this.moves, Pairs: `${this.matchedPairs}/${this.totalPairs}`, Time: formatTime(this.elapsed) });
  }

  _renderBoard() {
    this.boardEl.innerHTML = "";
    this.cards.forEach(card => {
      const node = el("div", { class: `memory-card${card.flipped || card.matched ? " flipped" : ""}${card.matched ? " matched" : ""}`, onClick: () => this._flip(card.id) }, [
        el("div", { class: "inner" }, [
          el("div", { class: "face front" }, [el("span", { class: "card-mark" }, "?")]),
          el("div", {
            class: "face back",
            style: `background-image:url(${spriteURL(card.symbol, 128)})`,
          }),
        ]),
      ]);
      this.boardEl.appendChild(node);
    });
  }

  _flip(id) {
    if (this.locked || this.state !== "playing") return;
    const card = this.cards.find(c => c.id === id);
    if (!card || card.flipped || card.matched) return;
    card.flipped = true;
    audioManager.play("select");
    this._renderBoard();
    this.selection.push(card);
    if (this.selection.length === 2) {
      this.moves += 1;
      this.locked = true;
      const [a, b] = this.selection;
      if (a.symbol === b.symbol) {
        setTimeout(() => {
          a.matched = b.matched = true;
          this.matchedPairs += 1;
          audioManager.play("coin");
          this.selection = [];
          this.locked = false;
          this._renderBoard();
          if (this.matchedPairs === this.totalPairs) this._finish();
        }, 320);
      } else {
        setTimeout(() => {
          a.flipped = b.flipped = false;
          this.selection = [];
          this.locked = false;
          this._renderBoard();
        }, 700);
      }
    }
  }

  _finish() {
    const score = Math.max(50, Math.round(1000 - this.moves * 12 - this.elapsed * 2.5 + this.totalPairs * 20));
    this.setScore(score);
    audioManager.play("win");
    this.endGame({ result: "win", score, message: `Cleared in ${this.moves} moves, ${formatTime(this.elapsed)}.`, extraStats: [{ label: "Moves", value: this.moves }, { label: "Time", value: formatTime(this.elapsed) }] });
  }
}

export default MemoryMatchGame;
