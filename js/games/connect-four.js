// ==========================================================================
// Connect Four — drop discs vs an AI using depth-limited minimax.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, choice } from "../core/utils.js";

const COLS = 7, ROWS = 6;

export class ConnectFourGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Click a column to drop your disc (yellow) into it.",
      "Connect four discs in a row — horizontal, vertical or diagonal — to win.",
      "The AI gets tougher on higher difficulties.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a column to drop your disc."; }
  getKeyboardHint() { return "Click / tap a column to drop your disc."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid c4-board" });
    this.stageEl.appendChild(this.boardEl);
  }

  onStart(difficulty) {
    this.grid = Array.from({ length: COLS }, () => []); // grid[col] = stack bottom-up
    this.turn = 1; // 1 = player, 2 = AI
    this.locked = false;
    this.setHud({ Turn: "Your Turn" });
    this._renderBoard();
  }

  _renderBoard() {
    this.boardEl.innerHTML = "";
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        const val = this.grid[c][r];
        const cell = el("div", { class: "cell", onClick: () => this._drop(c) });
        if (val) cell.appendChild(el("div", { class: `disc p${val}` }));
        this.boardEl.appendChild(cell);
      }
    }
  }

  _drop(col) {
    if (this.locked || this.state !== "playing" || this.turn !== 1) return;
    if (this.grid[col].length >= ROWS) return;
    this.grid[col].push(1);
    audioManager.play("pop");
    this._renderBoard();
    if (this._checkWinFor(1)) return this._finish(1);
    if (this._isFull()) return this._finish(0);
    this.turn = 2;
    this.setHud({ Turn: "AI Thinking…" });
    this.locked = true;
    setTimeout(() => { this._aiMove(); this.locked = false; }, 480);
  }

  _isFull() { return this.grid.every(c => c.length >= ROWS); }

  _validCols() { return [...Array(COLS).keys()].filter(c => this.grid[c].length < ROWS); }

  _aiMove() {
    if (this.state !== "playing") return;
    const valid = this._validCols();
    if (!valid.length) return;
    let col;
    if (this.difficulty === "Easy") {
      col = this._findWinningCol(2) ?? (Math.random() < 0.5 ? this._findWinningCol(1) : null) ?? choice(valid);
    } else {
      const depth = this.difficulty === "Hard" ? 5 : 3;
      col = this._findWinningCol(2) ?? this._findWinningCol(1) ?? this._minimaxRoot(depth);
    }
    this.grid[col].push(2);
    audioManager.play("pop");
    this._renderBoard();
    if (this._checkWinFor(2)) return this._finish(2);
    if (this._isFull()) return this._finish(0);
    this.turn = 1;
    this.setHud({ Turn: "Your Turn" });
  }

  _findWinningCol(player) {
    for (const c of this._validCols()) {
      this.grid[c].push(player);
      const win = this._checkWinFor(player);
      this.grid[c].pop();
      if (win) return c;
    }
    return null;
  }

  _minimaxRoot(depth) {
    const valid = this._validCols();
    let best = -Infinity, bestCol = choice(valid);
    for (const c of valid) {
      this.grid[c].push(2);
      const score = this._minimax(depth - 1, false, -Infinity, Infinity);
      this.grid[c].pop();
      if (score > best) { best = score; bestCol = c; }
    }
    return bestCol;
  }

  _minimax(depth, maximizing, alpha, beta) {
    if (this._checkWinFor(2)) return 1000 + depth;
    if (this._checkWinFor(1)) return -1000 - depth;
    const valid = this._validCols();
    if (depth === 0 || !valid.length) return this._heuristic();
    if (maximizing) {
      let val = -Infinity;
      for (const c of valid) {
        this.grid[c].push(2);
        val = Math.max(val, this._minimax(depth - 1, false, alpha, beta));
        this.grid[c].pop();
        alpha = Math.max(alpha, val);
        if (alpha >= beta) break;
      }
      return val;
    } else {
      let val = Infinity;
      for (const c of valid) {
        this.grid[c].push(1);
        val = Math.min(val, this._minimax(depth - 1, true, alpha, beta));
        this.grid[c].pop();
        beta = Math.min(beta, val);
        if (alpha >= beta) break;
      }
      return val;
    }
  }

  _heuristic() {
    // Favor center-column control — a cheap but effective proxy for board strength.
    let score = 0;
    for (let c = 0; c < COLS; c++) {
      const weight = 3 - Math.abs(c - 3);
      for (const v of this.grid[c]) score += (v === 2 ? 1 : -1) * weight;
    }
    return score;
  }

  _checkWinFor(player) {
    const get = (c, r) => (this.grid[c] && this.grid[c][r]) || 0;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (get(c, r) !== player) continue;
        if (get(c + 1, r) === player && get(c + 2, r) === player && get(c + 3, r) === player) return true;
        if (get(c, r + 1) === player && get(c, r + 2) === player && get(c, r + 3) === player) return true;
        if (get(c + 1, r + 1) === player && get(c + 2, r + 2) === player && get(c + 3, r + 3) === player) return true;
        if (get(c + 1, r - 1) === player && get(c + 2, r - 2) === player && get(c + 3, r - 3) === player) return true;
      }
    }
    return false;
  }

  _finish(winner) {
    this.locked = true;
    setTimeout(() => {
      if (winner === 0) return this.endGame({ result: "draw", score: 1, message: "The board filled up — it's a draw!" });
      const humanWon = winner === 1;
      this.endGame({ result: humanWon ? "win" : "loss", score: humanWon ? 1 : 0, message: humanWon ? "You connected four!" : "The AI connected four." });
    }, 300);
  }
}

export default ConnectFourGame;
