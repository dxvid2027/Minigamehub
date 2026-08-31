// ==========================================================================
// Sudoku Master — generated puzzles with conflict highlighting and a numpad.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, formatTime, shuffle } from "../core/utils.js";

function generateSolved() {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  function valid(r, c, v) {
    for (let i = 0; i < 9; i++) if (grid[r][i] === v || grid[i][c] === v) return false;
    const br = r - r % 3, bc = c - c % 3;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (grid[br + y][bc + x] === v) return false;
    return true;
  }
  function fill(pos) {
    if (pos === 81) return true;
    const r = Math.floor(pos / 9), c = pos % 9;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (valid(r, c, v)) { grid[r][c] = v; if (fill(pos + 1)) return true; grid[r][c] = 0; }
    }
    return false;
  }
  fill(0);
  return grid;
}

export class SudokuGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Fill every row, column and 3×3 box with the numbers 1-9, no repeats.",
      "Select a cell, then pick a number from the pad (or your keyboard).",
      "Conflicting numbers are highlighted in red.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a cell, then tap a number on the pad below."; }
  getKeyboardHint() { return "Click a cell, then press a number key 1-9 (Backspace to clear)."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid sudoku-board" });
    this.stageEl.appendChild(this.boardEl);
    this.numpad = el("div", { class: "sudoku-numpad" });
    this.tipEl.before(this.numpad);
    for (let n = 1; n <= 9; n++) this.numpad.appendChild(el("button", { onClick: () => this._setValue(n) }, String(n)));
    this.numpad.appendChild(el("button", { onClick: () => this._setValue(0) }, "✕"));
    for (let i = 1; i <= 9; i++) this.input.onKey(`Digit${i}`, () => this._setValue(i));
    this.input.onKey("Backspace", () => this._setValue(0));
    this.input.onKey("Delete", () => this._setValue(0));
  }

  onStart(difficulty) {
    this.solution = generateSolved();
    const removeCount = difficulty === "Hard" ? 54 : difficulty === "Normal" ? 46 : 36;
    this.given = this.solution.map(row => row.slice());
    let removed = 0;
    const positions = shuffle([...Array(81).keys()]);
    for (const pos of positions) {
      if (removed >= removeCount) break;
      const r = Math.floor(pos / 9), c = pos % 9;
      this.given[r][c] = 0;
      removed++;
    }
    this.player = this.given.map(row => row.slice());
    this.selected = null;
    this.mistakes = 0;
    this.elapsed = 0;
    this.setHud({ Mistakes: 0, Time: "0s" });
    this._render();
  }

  onUpdate(dt) {
    this.elapsed += dt;
    this.setHud({ Mistakes: this.mistakes, Time: formatTime(this.elapsed) });
  }

  _render() {
    this.boardEl.innerHTML = "";
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const given = this.given[r][c] !== 0;
      const val = this.player[r][c];
      const wrong = val !== 0 && val !== this.solution[r][c];
      const cls = ["cell"];
      if (given) cls.push("given");
      if (this.selected && this.selected.r === r && this.selected.c === c) cls.push("selected");
      if (wrong) cls.push("error");
      const cell = el("div", { class: cls.join(" "), onClick: () => { if (!given) { this.selected = { r, c }; this._render(); } } }, val ? String(val) : "");
      this.boardEl.appendChild(cell);
    }
  }

  _setValue(n) {
    if (!this.selected || this.state !== "playing") return;
    const { r, c } = this.selected;
    if (this.given[r][c]) return;
    this.player[r][c] = n;
    if (n !== 0 && n !== this.solution[r][c]) { this.mistakes++; audioManager.play("error"); this.shake(); }
    else if (n !== 0) audioManager.play("select");
    this._render();
    if (this._isComplete()) this._finish();
  }

  _isComplete() {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (this.player[r][c] !== this.solution[r][c]) return false;
    return true;
  }

  _finish() {
    const score = Math.max(100, Math.round(2000 - this.mistakes * 60 - this.elapsed * 2));
    this.setScore(score);
    audioManager.play("win");
    this.endGame({ result: "win", score, message: `Solved in ${formatTime(this.elapsed)} with ${this.mistakes} mistakes.`, extraStats: [{ label: "Time", value: formatTime(this.elapsed) }, { label: "Mistakes", value: this.mistakes }] });
  }

  onDestroy() { this.numpad?.remove(); }
}

export default SudokuGame;
