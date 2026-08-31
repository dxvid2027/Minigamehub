// ==========================================================================
// Tic Tac Toe — vs adaptive AI or pass-and-play with a friend.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, choice } from "../core/utils.js";

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

export class TicTacToeGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard", "2 Player"]; }
  getInstructions() {
    return [
      "You are X and always move first.",
      "Get three in a row — horizontally, vertically or diagonally.",
      "Choose 2 Player to pass the device to a friend instead of the AI.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a cell to place your mark."; }
  getKeyboardHint() { return "Click / tap a cell to place your mark."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid ttt-board" });
    this.stageEl.appendChild(this.boardEl);
  }

  onStart(difficulty) {
    this.board = Array(9).fill(null);
    this.turn = "X";
    this.twoPlayer = difficulty === "2 Player";
    this.locked = false;
    this.setHud({ Turn: "You (X)" });
    this._renderBoard();
  }

  _renderBoard() {
    this.boardEl.innerHTML = "";
    this.board.forEach((v, i) => {
      const cell = el("button", {
        class: "cell", type: "button",
        onClick: () => this._play(i),
      }, v || "");
      if (v === "X") cell.style.color = "#22d3ee";
      if (v === "O") cell.style.color = "#ff4fd8";
      this.boardEl.appendChild(cell);
    });
  }

  _play(i) {
    if (this.locked || this.state !== "playing" || this.board[i]) return;
    if (!this.twoPlayer && this.turn !== "X") return;
    this.board[i] = this.turn;
    audioManager.play("select");
    this._renderBoard();
    const result = this._checkEnd();
    if (result) return this._finish(result);
    this.turn = this.turn === "X" ? "O" : "X";
    this.setHud({ Turn: this.twoPlayer ? `Player ${this.turn}` : (this.turn === "X" ? "You (X)" : "AI (O)") });
    if (!this.twoPlayer && this.turn === "O") {
      this.locked = true;
      setTimeout(() => { this._aiMove(); this.locked = false; }, 420);
    }
  }

  _aiMove() {
    if (this.state !== "playing") return;
    const empty = this.board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
    if (!empty.length) return;
    let move;
    if (this.difficulty === "Easy") move = choice(empty);
    else if (this.difficulty === "Normal") move = Math.random() < 0.5 ? choice(empty) : this._bestMove("O");
    else move = this._bestMove("O");
    this.board[move] = "O";
    audioManager.play("select");
    this._renderBoard();
    const result = this._checkEnd();
    if (result) return this._finish(result);
    this.turn = "X";
    this.setHud({ Turn: "You (X)" });
  }

  _bestMove(player) {
    const opponent = player === "X" ? "O" : "X";
    const minimax = (board, isMax) => {
      const winner = this._winnerOf(board);
      if (winner === player) return { score: 10 };
      if (winner === opponent) return { score: -10 };
      if (board.every(c => c)) return { score: 0 };
      const empties = board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      let best = null;
      for (const i of empties) {
        board[i] = isMax ? player : opponent;
        const { score } = minimax(board, !isMax);
        board[i] = null;
        const adjusted = isMax ? score : score;
        if (best === null || (isMax && adjusted > best.score) || (!isMax && adjusted < best.score)) best = { score: adjusted, move: i };
      }
      return best;
    };
    return minimax(this.board.slice(), true).move;
  }

  _winnerOf(board) {
    for (const [a, b, c] of LINES) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    return null;
  }

  _checkEnd() {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) return { winner: this.board[a], line };
    }
    if (this.board.every(c => c)) return { winner: null, line: null };
    return null;
  }

  _finish({ winner, line }) {
    if (line) line.forEach(i => this.boardEl.children[i].classList.add("win"));
    this.boardEl.querySelectorAll(".cell").forEach(c => c.classList.add("disabled"));
    setTimeout(() => {
      if (!winner) return this.endGame({ result: "draw", score: 1, message: "It's a draw!" });
      const humanWon = this.twoPlayer ? true : winner === "X";
      this.endGame({ result: humanWon ? "win" : "loss", score: humanWon ? 1 : 0, message: this.twoPlayer ? `Player ${winner} wins!` : (winner === "X" ? "You win!" : "The AI wins!") });
    }, line ? 500 : 100);
  }
}

export default TicTacToeGame;
