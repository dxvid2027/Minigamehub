// ==========================================================================
// Chess — full rules (castling, en passant, promotion, check/mate/stalemate)
// with an alpha-beta AI, or 2-player pass-and-play.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, choice } from "../core/utils.js";

// Both sides use the *solid* glyphs; the two armies are told apart by fill and
// outline (see .piece-w / .piece-b in games.css), which reads far better on a
// dark board than mixing outline and solid figures.
const GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const VALUE = { p: 1, n: 3, b: 3.1, r: 5, q: 9, k: 0 };

function initialBoard() {
  const back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: "b", moved: false };
    board[1][c] = { type: "p", color: "b", moved: false };
    board[6][c] = { type: "p", color: "w", moved: false };
    board[7][c] = { type: back[c], color: "w", moved: false };
  }
  return board;
}

function clone(board) { return board.map(row => row.map(p => (p ? { ...p } : null))); }
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export class ChessGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard", "2 Player"]; }
  getInstructions() {
    return [
      "You play White and move first. Tap a piece, then a highlighted square.",
      "Castling, en passant and pawn promotion (to queen) are all supported.",
      "Checkmate the opposing king to win — or choose 2 Player to play a friend.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a piece, then tap a highlighted destination."; }
  getKeyboardHint() { return "Click a piece, then click a highlighted destination."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.boardEl = el("div", { class: "board-grid chess-board" });
    this.stageEl.appendChild(this.boardEl);
  }

  onStart(difficulty) {
    this.board = initialBoard();
    this.turn = "w";
    this.enPassant = null;
    this.twoPlayer = difficulty === "2 Player";
    this.selected = null;
    this.locked = false;
    this.history = [];
    this.setHud({ Turn: "White (You)" });
    this._render();
  }

  // ---------------------------------------------------------------- RULES --
  _pseudoMoves(board, r, c, enPassant) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    const push = (nr, nc, flags = {}) => { if (inb(nr, nc)) moves.push({ from: { r, c }, to: { r: nr, c: nc }, ...flags }); };
    const slide = (dirs) => dirs.forEach(([dr, dc]) => {
      let nr = r + dr, nc = c + dc;
      while (inb(nr, nc)) {
        if (!board[nr][nc]) push(nr, nc);
        else { if (board[nr][nc].color !== piece.color) push(nr, nc, { capture: true }); break; }
        nr += dr; nc += dc;
      }
    });
    if (piece.type === "p") {
      const dir = piece.color === "w" ? -1 : 1;
      const startRow = piece.color === "w" ? 6 : 1;
      const promoRow = piece.color === "w" ? 0 : 7;
      if (inb(r + dir, c) && !board[r + dir][c]) {
        push(r + dir, c, { promotion: r + dir === promoRow });
        if (r === startRow && !board[r + dir * 2][c]) push(r + dir * 2, c, { double: true });
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inb(nr, nc) && board[nr][nc] && board[nr][nc].color !== piece.color) push(nr, nc, { capture: true, promotion: nr === promoRow });
        else if (enPassant && enPassant.r === nr && enPassant.c === nc) push(nr, nc, { capture: true, enPassant: true });
      }
    } else if (piece.type === "n") {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => {
        const nr = r+dr, nc = c+dc;
        if (inb(nr,nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) push(nr, nc, { capture: !!board[nr][nc] });
      });
    } else if (piece.type === "b") slide([[-1,-1],[-1,1],[1,-1],[1,1]]);
    else if (piece.type === "r") slide([[-1,0],[1,0],[0,-1],[0,1]]);
    else if (piece.type === "q") slide([[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
    else if (piece.type === "k") {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r+dr, nc = c+dc;
        if (inb(nr,nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) push(nr, nc, { capture: !!board[nr][nc] });
      }
      if (!piece.moved) {
        [[0,7,5,6,'kingside'],[0,0,3,1,'queenside']].forEach(([, rookC, kingDest, throughC, side]) => {
          const rook = board[r][rookC];
          if (rook && rook.type === "r" && !rook.moved) {
            const empties = side === 'kingside' ? [5,6] : [1,2,3];
            if (empties.every(cc => !board[r][cc])) {
              if (!this._attacked(board, r, c, piece.color) && !this._attacked(board, r, throughC, piece.color) && !this._attacked(board, r, kingDest, piece.color)) {
                push(r, kingDest, { castle: side });
              }
            }
          }
        });
      }
    }
    return moves;
  }

  _attacked(board, r, c, byDefenderColor) {
    const attacker = byDefenderColor === "w" ? "b" : "w";
    for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
      const p = board[rr][cc];
      if (!p || p.color !== attacker) continue;
      if (p.type === "p") {
        const dir = p.color === "w" ? -1 : 1;
        if (rr + dir === r && (cc - 1 === c || cc + 1 === c)) return true;
        continue;
      }
      if (p.type === "k") { if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) return true; continue; }
      const moves = this._pseudoMoves(board, rr, cc, null);
      if (moves.some(m => m.to.r === r && m.to.c === c)) return true;
    }
    return false;
  }

  _findKing(board, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.type === "k" && board[r][c].color === color) return { r, c };
    return null;
  }

  _legalMoves(board, color, enPassant) {
    const all = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      for (const m of this._pseudoMoves(board, r, c, enPassant)) {
        const test = this._apply(clone(board), m, enPassant).board;
        const k = this._findKing(test, color);
        if (k && !this._attacked(test, k.r, k.c, color)) all.push(m);
      }
    }
    return all;
  }

  _apply(board, move, enPassant) {
    const piece = board[move.from.r][move.from.c];
    let newEnPassant = null;
    if (move.enPassant) board[move.from.r][move.to.c] = null;
    board[move.to.r][move.to.c] = piece;
    board[move.from.r][move.from.c] = null;
    piece.moved = true;
    if (move.promotion) piece.type = "q";
    if (move.double) newEnPassant = { r: (move.from.r + move.to.r) / 2, c: move.from.c };
    if (move.castle === "kingside") { board[move.to.r][5] = board[move.to.r][7]; board[move.to.r][7] = null; board[move.to.r][5].moved = true; }
    if (move.castle === "queenside") { board[move.to.r][3] = board[move.to.r][0]; board[move.to.r][0] = null; board[move.to.r][3].moved = true; }
    return { board, enPassant: newEnPassant };
  }

  // ---------------------------------------------------------------- UI -----
  _render() {
    this.boardEl.innerHTML = "";
    const legalForSel = this.selected ? this._legalMoves(this.board, this.turn, this.enPassant).filter(m => m.from.r === this.selected.r && m.from.c === this.selected.c) : [];
    const kingPos = this._findKing(this.board, this.turn);
    const inCheck = kingPos && this._attacked(this.board, kingPos.r, kingPos.c, this.turn);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const light = (r + c) % 2 === 0;
      const cell = el("div", { class: `cell ${light ? "light" : "dark"}`, onClick: () => this._onCellClick(r, c) });
      const piece = this.board[r][c];
      if (piece) {
        const glyph = el("span", { class: `piece-glyph piece-${piece.color}` });
        glyph.textContent = GLYPH[piece.type];
        cell.appendChild(glyph);
      }
      if (this.selected && this.selected.r === r && this.selected.c === c) cell.classList.add("selected");
      const hint = legalForSel.find(m => m.to.r === r && m.to.c === c);
      if (hint) cell.classList.add(hint.capture ? "capture-hint" : "move-hint");
      if (inCheck && kingPos.r === r && kingPos.c === c) cell.classList.add("check");
      this.boardEl.appendChild(cell);
    }
  }

  _onCellClick(r, c) {
    if (this.state !== "playing" || this.locked) return;
    if (!this.twoPlayer && this.turn !== "w") return;
    const piece = this.board[r][c];
    const legal = this._legalMoves(this.board, this.turn, this.enPassant);
    if (this.selected) {
      const move = legal.find(m => m.from.r === this.selected.r && m.from.c === this.selected.c && m.to.r === r && m.to.c === c);
      if (move) return this._makeMove(move);
    }
    if (piece && piece.color === this.turn) { this.selected = { r, c }; this._render(); }
    else { this.selected = null; this._render(); }
  }

  _makeMove(move) {
    const capture = !!this.board[move.to.r][move.to.c] || move.enPassant;
    const { enPassant } = this._apply(this.board, move, this.enPassant);
    this.enPassant = enPassant;
    this.selected = null;
    audioManager.play(capture ? "hit" : "select");
    this._render();
    this._afterMove();
  }

  _afterMove() {
    const nextColor = this.turn === "w" ? "b" : "w";
    const legal = this._legalMoves(this.board, nextColor, this.enPassant);
    const kingPos = this._findKing(this.board, nextColor);
    const inCheck = kingPos && this._attacked(this.board, kingPos.r, kingPos.c, nextColor);
    if (!legal.length) {
      if (inCheck) return this._finish(this.turn); // checkmate: mover wins
      return this._finish(null); // stalemate
    }
    if (inCheck) audioManager.play("error");
    this.turn = nextColor;
    this.setHud({ Turn: this.turn === "w" ? "White (You)" : (this.twoPlayer ? "Black" : "AI Thinking…") });
    if (!this.twoPlayer && this.turn === "b") {
      this.locked = true;
      setTimeout(() => { this._aiMove(); this.locked = false; }, 450);
    }
  }

  _aiMove() {
    if (this.state !== "playing") return;
    const legal = this._legalMoves(this.board, "b", this.enPassant);
    if (!legal.length) return;
    let move;
    if (this.difficulty === "Easy") move = choice(legal);
    else {
      const depth = this.difficulty === "Hard" ? 3 : 2;
      move = this._bestMove(legal, depth);
    }
    this._makeMove(move);
  }

  _bestMove(legal, depth) {
    let best = null, bestScore = -Infinity;
    const shuffled = [...legal].sort(() => Math.random() - 0.5);
    for (const m of shuffled) {
      const b2 = clone(this.board);
      const { board, enPassant } = this._apply(b2, m, this.enPassant);
      const score = -this._search(board, "w", enPassant, depth - 1, -Infinity, Infinity);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best || choice(legal);
  }

  _search(board, color, enPassant, depth, alpha, beta) {
    const legal = this._legalMoves(board, color, enPassant);
    if (!legal.length) {
      const k = this._findKing(board, color);
      const inCheck = k && this._attacked(board, k.r, k.c, color);
      return inCheck ? -1000 - depth : 0; // checkmate is very bad for the side to move; stalemate is neutral
    }
    if (depth === 0) return this._evaluate(board, color);
    let best = -Infinity;
    for (const m of legal) {
      const { board: b2, enPassant: ep2 } = this._apply(clone(board), m, enPassant);
      const score = -this._search(b2, color === "w" ? "b" : "w", ep2, depth - 1, -beta, -alpha);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  _evaluate(board, forColor) {
    let score = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = VALUE[p.type] + (p.type !== "k" && p.type !== "p" ? (3.5 - Math.hypot(r - 3.5, c - 3.5)) * 0.02 : 0);
      score += p.color === forColor ? val : -val;
    }
    return score;
  }

  _finish(winnerColor) {
    audioManager.play(winnerColor ? (winnerColor === "w" ? "win" : "lose") : "gameover");
    if (!winnerColor) return this.endGame({ result: "draw", score: 1, message: "Stalemate — the game is a draw." });
    if (this.twoPlayer) return this.endGame({ result: "win", score: 1, message: `${winnerColor === "w" ? "White" : "Black"} wins by checkmate!` });
    const humanWon = winnerColor === "w";
    this.endGame({ result: humanWon ? "win" : "loss", score: humanWon ? 1 : 0, message: humanWon ? "Checkmate — you win!" : "Checkmate — the AI wins." });
  }
}

export default ChessGame;
