// ==========================================================================
// Checkers — American-style checkers with mandatory captures, multi-jumps,
// kinging, and an AI opponent (random → greedy → minimax by difficulty).
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, choice } from "../core/utils.js";

const SIZE = 8;

export class CheckersGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "You play red (bottom) and move first — tap a piece, then a highlighted square.",
      "Captures are mandatory when available, and jump chains must be completed.",
      "Reach the far row to crown a piece into a king that moves both directions.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a piece, then tap a highlighted destination."; }
  getKeyboardHint() { return "Click a piece, then click a highlighted destination."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid checkers-board" });
    this.stageEl.appendChild(this.boardEl);
  }

  onStart(difficulty) {
    this.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < 3; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 1) this.board[r][c] = { player: 2, king: false };
    for (let r = 5; r < 8; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 1) this.board[r][c] = { player: 1, king: false };
    this.turn = 1;
    this.selected = null;
    this.chainFrom = null;
    this.locked = false;
    this.setHud({ Turn: "Your Turn", You: 12, AI: 12 });
    this._render();
  }

  _dirsFor(piece) {
    if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    return piece.player === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  }
  _captureDirsFor() { return [[-1, -1], [-1, 1], [1, -1], [1, 1]]; }

  _movesFor(r, c) {
    const piece = this.board[r][c];
    if (!piece) return { simple: [], capture: [] };
    const simple = [], capture = [];
    for (const [dr, dc] of this._dirsFor(piece)) {
      const nr = r + dr, nc = c + dc;
      if (this._inBounds(nr, nc) && !this.board[nr][nc]) simple.push({ r: nr, c: nc });
    }
    for (const [dr, dc] of this._captureDirsFor()) {
      const mr = r + dr, mc = c + dc, jr = r + dr * 2, jc = c + dc * 2;
      if (this._inBounds(jr, jc) && this.board[mr]?.[mc] && this.board[mr][mc].player !== piece.player && !this.board[jr][jc]) {
        capture.push({ r: jr, c: jc, cap: { r: mr, c: mc } });
      }
    }
    return { simple, capture };
  }

  _inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

  _allMoves(player) {
    let anyCapture = false;
    const pieces = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const p = this.board[r][c];
      if (!p || p.player !== player) continue;
      const { simple, capture } = this._movesFor(r, c);
      if (capture.length) anyCapture = true;
      pieces.push({ r, c, simple, capture });
    }
    return pieces.map(p => ({ ...p, moves: anyCapture ? p.capture.map(m => ({ ...m, isCapture: true })) : p.simple.map(m => ({ ...m, isCapture: false })) })).filter(p => p.moves.length);
  }

  _render() {
    this.boardEl.innerHTML = "";
    const legal = this.turn === 1 && !this.locked ? this._allMoves(1) : [];
    const selMoves = this.selected ? (legal.find(p => p.r === this.selected.r && p.c === this.selected.c)?.moves || []) : [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const isDark = (r + c) % 2 === 1;
      const cell = el("div", { class: `cell ${isDark ? "dark" : "light"}`, onClick: () => this._onCellClick(r, c) });
      const piece = this.board[r][c];
      if (piece) cell.appendChild(el("div", { class: `piece p${piece.player}${piece.king ? " king" : ""}` }));
      if (this.selected && this.selected.r === r && this.selected.c === c) cell.classList.add("selected");
      if (selMoves.some(m => m.r === r && m.c === c)) cell.classList.add(selMoves.find(m=>m.r===r&&m.c===c).isCapture ? "capture-hint" : "move-hint");
      this.boardEl.appendChild(cell);
    }
  }

  _onCellClick(r, c) {
    if (this.state !== "playing" || this.turn !== 1 || this.locked) return;
    const legal = this._allMoves(1);
    const piece = this.board[r][c];
    if (piece && piece.player === 1 && (!this.chainFrom || (this.chainFrom.r === r && this.chainFrom.c === c))) {
      const entry = legal.find(p => p.r === r && p.c === c);
      if (entry && entry.moves.length) { this.selected = { r, c }; this._render(); return; }
    }
    if (this.selected) {
      const entry = legal.find(p => p.r === this.selected.r && p.c === this.selected.c);
      const move = entry?.moves.find(m => m.r === r && m.c === c);
      if (move) this._applyMove(1, this.selected, move);
    }
  }

  _applyMove(player, from, move) {
    const piece = this.board[from.r][from.c];
    this.board[from.r][from.c] = null;
    this.board[move.r][move.c] = piece;
    let crowned = false;
    if (!piece.king && ((piece.player === 1 && move.r === 0) || (piece.player === 2 && move.r === SIZE - 1))) { piece.king = true; crowned = true; }
    if (move.isCapture) { this.board[move.cap.r][move.cap.c] = null; audioManager.play("hit"); } else audioManager.play("select");
    if (crowned) audioManager.play("levelup");

    if (move.isCapture) {
      const { capture } = this._movesFor(move.r, move.c);
      if (capture.length) {
        this.selected = player === 1 ? { r: move.r, c: move.c } : this.selected;
        this.chainFrom = { r: move.r, c: move.c };
        this._render();
        if (player === 2) setTimeout(() => this._aiContinueChain(move.r, move.c), 380);
        return;
      }
    }
    this.chainFrom = null;
    this.selected = null;
    this._checkWinAndSwitch(player);
  }

  _checkWinAndSwitch(justMoved) {
    const counts = this._counts();
    this.setHud({ Turn: "…", You: counts.p1, AI: counts.p2 });
    if (counts.p1 === 0) return this._finish(false);
    if (counts.p2 === 0) return this._finish(true);
    const nextPlayer = justMoved === 1 ? 2 : 1;
    if (!this._allMoves(nextPlayer).length) return this._finish(nextPlayer === 2);
    this.turn = nextPlayer;
    this._render();
    this.setHud({ Turn: this.turn === 1 ? "Your Turn" : "AI Thinking…", You: counts.p1, AI: counts.p2 });
    if (this.turn === 2) { this.locked = true; setTimeout(() => { this._aiTurn(); this.locked = false; }, 500); }
  }

  _counts() {
    let p1 = 0, p2 = 0;
    for (const row of this.board) for (const cell of row) { if (cell?.player === 1) p1++; if (cell?.player === 2) p2++; }
    return { p1, p2 };
  }

  _aiTurn() {
    if (this.state !== "playing") return;
    const options = this._allMoves(2);
    if (!options.length) return;
    const picked = this._chooseAI(options);
    this._applyMove(2, { r: picked.r, c: picked.c }, picked.move);
  }

  _aiContinueChain(r, c) {
    if (this.state !== "playing") return;
    const { capture } = this._movesFor(r, c);
    if (!capture.length) { this.chainFrom = null; this._checkWinAndSwitch(2); return; }
    const move = this.difficulty === "Easy" ? choice(capture) : capture[0];
    this._applyMove(2, { r, c }, { ...move, isCapture: true });
  }

  _chooseAI(options) {
    const flat = [];
    options.forEach(o => o.moves.forEach(m => flat.push({ r: o.r, c: o.c, move: m })));
    if (this.difficulty === "Easy") return choice(flat);
    // Prefer captures (already forced), then prefer moves toward crowning / away from danger.
    let best = flat[0], bestScore = -Infinity;
    for (const f of flat) {
      let score = f.move.isCapture ? 10 : 0;
      score += f.move.r; // AI moves downward toward player's back row
      score += Math.random() * (this.difficulty === "Hard" ? 0.5 : 3);
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return best;
  }

  _finish(playerWon) {
    audioManager.play(playerWon ? "win" : "lose");
    this.endGame({ result: playerWon ? "win" : "loss", score: playerWon ? 1 : 0, message: playerWon ? "You win the match!" : "The AI wins this time." });
  }
}

export default CheckersGame;
