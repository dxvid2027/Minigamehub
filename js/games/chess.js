// ==========================================================================
// Chess — full rules (castling, en passant, promotion with choice, check,
// mate, stalemate, fifty moves, repetition, dead positions) with several
// ways to play:
//
//   Ranked     — an Elo rating and tiers from Bronze to Master; the bot is
//                matched to your rating and you alternate colours.
//   Casual     — the AI at Easy, Normal or Hard, with undo.
//   Blitz      — 3 minutes + 2 seconds a move against the clock.
//   Chess960   — shuffled back ranks (no castling in this version).
//   Puzzles    — checkmate in one move.
//   2 Players  — pass and play on one screen.
//
// Every piece is drawn from the player's own design (see chessArt.js): the
// shape family, the material, both army colours and the board.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, choice, randInt } from "../core/utils.js";
import { SHAPES, MATERIALS, PALETTE, BOARDS, DEFAULT_DESIGN, pieceSVG, boardColors } from "./chessArt.js";
import { TIERS, tierOf, tierIdx, rankInfo, pickBot, openRankPath, REWARDS, STYLE_TEXT } from "./chessRanked.js";
import { todayKey } from "../core/utils.js";
import { chooseMove, strengthFor } from "./chessEngine.js";

// Casual levels as ratings; the engine is calibrated so these are honest.
const LEVEL_ELO = { Easy: 600, Normal: 1100, Hard: 1600, Master: 2100 };

const VALUE = { p: 1, n: 3, b: 3.1, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const FILES = "abcdefgh";

const MODES = {
  ranked: { name: "Ranked", icon: "🏆", desc: "Climb the Ranked Path from Bronze III to Grandmaster against named bots. Rewards on the way.", clock: 600 },
  casual: { name: "Casual", icon: "♟", desc: "Pick a bot by rating — Easy 600 up to Master 2100 — and play at your own pace, with undo." },
  blitz:  { name: "Blitz 3+2", icon: "⚡", desc: "Three minutes each plus two seconds a move. Don't flag!", clock: 180, inc: 2 },
  c960:   { name: "Chess960", icon: "🎲", desc: "Back ranks shuffled at random — no opening theory. Castling is off." },
  puzzle: { name: "Puzzles", icon: "🧩", desc: "Find checkmate in one move." },
  local:  { name: "2 Players", icon: "👥", desc: "Pass and play with a friend on this screen." },
};

// Mate-in-one positions, each with at least one mating move (checked in tests).
const PUZZLES = [
  { fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", name: "Back rank" },
  { fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1", name: "Corner king" },
  { fen: "6k1/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1", name: "Queen on the eighth" },
  { fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", name: "Smothered" },
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4", name: "Scholar's mate" },
  { fen: "7k/R7/6K1/8/8/8/8/8 w - - 0 1", name: "Rook and king" },
  { fen: "7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1", name: "Arabian mate" },
  { fen: "k7/2Q5/1K6/8/8/8/8/8 w - - 0 1", name: "Queen kiss" },
  { fen: "7k/R7/8/8/8/8/8/1R4K1 w - - 0 1", name: "Rook ladder" },
  { fen: "rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3", name: "Fool's revenge" },
  { fen: "6k1/5ppp/8/8/8/8/1q3PPP/3RR1K1 w - - 0 1", name: "Doubled rooks" },
  { fen: "5k2/5P2/5K2/8/8/8/8/6R1 w - - 0 1", name: "Pawn shield" },
];

function emptyBoard() { return Array.from({ length: 8 }, () => Array(8).fill(null)); }
function initialBoard(back = ["r", "n", "b", "q", "k", "b", "n", "r"]) {
  const board = emptyBoard();
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: back[c], color: "b", moved: false };
    board[1][c] = { type: "p", color: "b", moved: false };
    board[6][c] = { type: "p", color: "w", moved: false };
    board[7][c] = { type: back[c], color: "w", moved: false };
  }
  return board;
}
/** A legal Chess960 back rank: bishops on opposite colours, king between the rooks. */
function back960() {
  const row = Array(8).fill(null);
  row[randInt(0, 3) * 2] = "b";
  row[randInt(0, 3) * 2 + 1] = "b";
  const free = () => row.map((x, i) => (x ? -1 : i)).filter(i => i >= 0);
  let f = free(); row[choice(f)] = "q";
  f = free(); row[choice(f)] = "n";
  f = free(); row[choice(f)] = "n";
  f = free(); row[f[0]] = "r"; row[f[1]] = "k"; row[f[2]] = "r";
  return row;
}
function parseFen(fen) {
  const [pos, turn, castle = "-", ep = "-"] = fen.split(" ");
  const board = emptyBoard();
  pos.split("/").forEach((rank, r) => {
    let c = 0;
    for (const ch of rank) {
      if (/\d/.test(ch)) { c += +ch; continue; }
      const color = ch === ch.toUpperCase() ? "w" : "b";
      board[r][c] = { type: ch.toLowerCase(), color, moved: true };
      c++;
    }
  });
  const unmove = (r, c) => { if (board[r][c]) board[r][c].moved = false; };
  if (castle.includes("K")) { unmove(7, 4); unmove(7, 7); }
  if (castle.includes("Q")) { unmove(7, 4); unmove(7, 0); }
  if (castle.includes("k")) { unmove(0, 4); unmove(0, 7); }
  if (castle.includes("q")) { unmove(0, 4); unmove(0, 0); }
  for (let c = 0; c < 8; c++) { if (board[6][c]?.type === "p" && board[6][c].color === "w") board[6][c].moved = false; if (board[1][c]?.type === "p" && board[1][c].color === "b") board[1][c].moved = false; }
  const enPassant = ep !== "-" ? { r: 8 - +ep[1], c: FILES.indexOf(ep[0]) } : null;
  return { board, turn, enPassant };
}

function clone(board) { return board.map(row => row.map(p => (p ? { ...p } : null))); }
const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const fmtClock = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), x = Math.floor(s % 60); return s < 20 ? `${m}:${String(x).padStart(2, "0")}.${Math.floor((s % 1) * 10)}` : `${m}:${String(x).padStart(2, "0")}`; };

export class ChessGame extends GameBase {
  getDifficulties() { return ["Chess"]; }
  getInstructions() {
    return [
      "Choose a mode: Ranked (Elo rating, Bronze to Master), Casual vs AI, Blitz 3+2, Chess960, Puzzles or 2 Players.",
      "Tap a piece, then a highlighted square. Castling, en passant and promotion (you choose the piece) are all supported.",
      "🎨 Design your own pieces: shape, material, both army colours and the board. Some styles unlock at higher ranks.",
      "Checkmate wins. Stalemate, fifty quiet moves, threefold repetition and bare kings are draws.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap a piece, then tap a highlighted destination."; }
  getKeyboardHint() { return "Click a piece, then click a highlighted destination."; }
  getPlayLabel() { return "Play"; }
  /** On phones the stage grows taller so the board can use the full width. */
  getStageRatio({ mobile, maxW }) { return mobile ? maxW / (maxW + 100) : null; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.chess) custom.chess = {};
    const s = custom.chess;
    s.rating ??= 800; s.peak ??= s.rating; s.games ??= 0; s.wins ??= 0; s.losses ??= 0; s.draws ??= 0; s.streak ??= 0;
    s.puzzles ??= []; s.history ??= []; s.shield ??= 0; s.bestStreak ??= 0; s.design ??= {}; for (const [k, v] of Object.entries(DEFAULT_DESIGN)) if (s.design[k] === undefined) s.design[k] = v;
    return s;
  }
  get design() { return this._store().design; }
  _openPath(anim) {
    openRankPath(this._store(), this.design, { anim, onPlay: () => { this.mode = "ranked"; this.start(); } });
  }
  _unlocked(rank) { return !rank || tierIdx(tierOf(this._store().peak).name) >= tierIdx(rank); }

  getStartExtras() {
    const s = this._store();
    const t = tierOf(s.rating);
    const prev = el("div", { class: "chess-preview-row" });
    prev.innerHTML = ["k", "q", "n"].map(k => `<span>${pieceSVG(k, "w", s.design, "s")}</span>`).join("") + ["n", "q", "k"].map(k => `<span>${pieceSVG(k, "b", s.design, "s")}</span>`).join("");
    return el("div", { class: "chess-start" }, [
      el("div", { class: "delve-summary" }, [
        el("span", {}, `${rankInfo(s.rating).label} · ${s.rating}`),
        el("span", {}, `Ranked: ${s.wins}W ${s.losses}L ${s.draws}D`),
        el("span", {}, `🧩 ${s.puzzles.length}/${PUZZLES.length}`),
      ]),
      prev,
      el("div", { class: "chess-start-btns" }, [
        el("button", { class: "btn btn-ghost", onClick: () => this._openPath() }, "🏆 Ranked Path"),
        el("button", { class: "btn btn-ghost", onClick: () => this._openDesigner(() => this.showStartOverlay()) }, "🎨 Design your pieces"),
      ]),
    ]);
  }

  /** Mode picker. Casual offers its three AI levels right on the card. */
  onPlayPressed() {
    const s = this._store();
    const t = tierOf(s.rating);
    const grid = el("div", { class: "chess-modes" });
    const go = (mode, level) => { this.mode = mode; this.aiLevel = level || "Normal"; audioManager.play("select"); closeModal(); this.start(); };
    for (const [id, m] of Object.entries(MODES)) {
      const sub = id === "ranked" ? `${rankInfo(s.rating).label} · ${s.rating}${s.streak >= 2 ? ` · 🔥${s.streak}` : ""}` : id === "puzzle" ? `${s.puzzles.length}/${PUZZLES.length} solved` : "";
      const card = el("div", { class: `chess-mode${this.mode === id ? " current" : ""}` }, [
        el("div", { class: "ic" }, m.icon),
        el("div", { class: "tx" }, [el("b", {}, m.name), sub ? el("span", { class: "sub" }, sub) : null, el("span", {}, m.desc)]),
        el("div", { class: "go" }, id === "casual" || id === "c960"
          ? Object.entries(LEVEL_ELO).map(([l, e]) => el("button", { class: "btn btn-ghost btn-sm", title: `About ${e} Elo`, onClick: () => go(id, l) }, [l, el("small", { class: "elo" }, String(e))]))
          : [el("button", { class: "btn btn-primary btn-sm", onClick: () => go(id) }, "Play"),
             id === "ranked" ? el("button", { class: "btn btn-ghost btn-sm", onClick: () => { closeModal(); setTimeout(() => this._openPath(), 30); } }, "🗺 Path") : null].filter(Boolean)),
      ]);
      grid.appendChild(card);
    }
    openModal({
      title: "Choose a mode",
      bodyNode: grid,
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-ghost", onClick: () => { closeModal(); setTimeout(() => this._openDesigner(), 30); } }, "🎨 Design"),
        el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Cancel"),
      ]),
    });
  }

  // ------------------------------------------------------------ SETUP ----
  onInit() {
    this.stageEl.classList.add("dom-board", "chess-stage");
    this.wrap = el("div", { class: "chess-wrap" });
    this.topBar = el("div", { class: "chess-bar" });
    this.boardEl = el("div", { class: "board-grid chess-board themed" });
    this.botBar = el("div", { class: "chess-bar" });
    this.actions = el("div", { class: "chess-actions" });
    this.wrap.append(this.topBar, this.boardEl, this.botBar, this.actions);
    this.stageEl.appendChild(this.wrap);
    this.mode = "casual";
    this.aiLevel = "Normal";
  }

  onStart() {
    const s = this._store();
    const M = MODES[this.mode] || MODES.casual;
    this.selected = null; this.locked = false; this.history = []; this.lastMove = null; this.promo = null;
    this.halfmove = 0; this.reps = new Map(); this.note = ""; this.over = false;
    this.human = "w";
    if (this.mode === "puzzle") {
      this._loadPuzzle(s.puzzles.length < PUZZLES.length ? PUZZLES.findIndex((_, i) => !s.puzzles.includes(i)) : randInt(0, PUZZLES.length - 1));
    } else {
      this.board = initialBoard(this.mode === "c960" ? back960() : undefined);
      if (this.mode === "c960") for (const r of [0, 7]) for (const p of this.board[r]) p.moved = true;
      this.turn = "w"; this.enPassant = null;
      if (this.mode === "ranked") {
        this.human = s.games % 2 ? "b" : "w";
        this.botRating = Math.max(400, s.rating + randInt(-50, 50));
        this.bot = pickBot(this.botRating);
        this.note = `${this.bot.emoji} ${this.bot.name} ${STYLE_TEXT[this.bot.style]}`;
      }
      if (this.mode === "local") this.human = null;
    }
    this.flip = this.human === "b";
    this.moves = [];
    this._gen = (this._gen || 0) + 1;
    this.mateKing = null; this._fx = null; this._anim = null;
    this.uci = [];
    this.hintsUsed = 0;
    this.boardEl.style.setProperty("--frame", this.mode === "ranked" ? rankInfo(s.rating).tier.color : "#4a3f6e");
    this.clock = M.clock ? { w: M.clock, b: M.clock, inc: M.inc || 0 } : null;
    this._clockT = performance.now();
    this._remember();
    this._render();
    if (this.human && this.turn !== this.human) this._scheduleAI();
  }

  _loadPuzzle(i) {
    const P = PUZZLES[i];
    const { board, turn, enPassant } = parseFen(P.fen);
    this.pIdx = i; this.board = board; this.turn = turn; this.enPassant = enPassant;
    this.human = turn; this.lastMove = null; this.selected = null; this.solved = false; this.history = [];
    this.note = `Puzzle ${i + 1}: ${P.name} — ${turn === "w" ? "White" : "Black"} mates in one`;
  }

  onResume() { this._clockT = performance.now(); }

  // -------------------------------------------------------------- AI ------
  /**
   * Engine settings. `noise` (centipawns) is how far from the best move a bot
   * may wander: weak bots pick among good-looking moves, strong ones don't.
   */
  _levelCfg() { return strengthFor(this._aiElo()); }

  /** The rating the AI plays at — its strength is calibrated to this number. */
  _aiElo() {
    if (this.mode === "ranked") return this.botRating;
    if (this.mode === "blitz") return 1300;
    return LEVEL_ELO[this.aiLevel] ?? 1100;
  }

  _scheduleAI() {
    this.locked = true;
    this._renderBars();
    const gen = this._gen;
    setTimeout(() => {
      if (gen !== this._gen) return;          // a new game started meanwhile
      if (this.state === "paused") { this.locked = false; this._scheduleAI(); return; }
      if (this.state !== "playing" || this.over) { this.locked = false; return; }
      this._aiMove();
      this.locked = false;
      this._renderBars();
    }, 380);
  }

  _aiMove() {
    const legal = this._legalMoves(this.board, this.turn, this.enPassant);
    if (!legal.length) return;
    const cfg = this._levelCfg();
    const style = this.mode === "ranked" ? this.bot?.style : null;
    const pick = chooseMove(this.board, this.turn, this.enPassant, { ...cfg, style, played: this.mode === "c960" ? null : this.uci });
    let move = pick && legal.find(m => m.from.r === pick.from.r && m.from.c === pick.from.c && m.to.r === pick.to.r && m.to.c === pick.to.c);
    if (!move) move = choice(legal);
    move = { ...move, promo: move.promotion ? (pick?.promo || "q") : undefined };
    this._makeMove(move);
  }


  // ------------------------------------------------------------ RULES -----
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
      [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        if (inb(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) push(nr, nc, { capture: !!board[nr][nc] });
      });
    } else if (piece.type === "b") slide([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    else if (piece.type === "r") slide([[-1, 0], [1, 0], [0, -1], [0, 1]]);
    else if (piece.type === "q") slide([[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
    else if (piece.type === "k") {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (inb(nr, nc) && (!board[nr][nc] || board[nr][nc].color !== piece.color)) push(nr, nc, { capture: !!board[nr][nc] });
      }
      // Standard castling only (king on e-file, rooks in the corners).
      if (!piece.moved && c === 4) {
        [[7, 5, 6, "kingside"], [0, 3, 2, "queenside"]].forEach(([rookC, throughC, kingDest, side]) => {
          const rook = board[r][rookC];
          if (rook && rook.type === "r" && rook.color === piece.color && !rook.moved) {
            const empties = side === "kingside" ? [5, 6] : [1, 2, 3];
            if (empties.every(cc => !board[r][cc]) && !this._attacked(board, r, c, piece.color) && !this._attacked(board, r, throughC, piece.color) && !this._attacked(board, r, kingDest, piece.color)) {
              push(r, kingDest, { castle: side });
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
      if (p.type === "p") { const dir = p.color === "w" ? -1 : 1; if (rr + dir === r && (cc - 1 === c || cc + 1 === c)) return true; continue; }
      if (p.type === "k") { if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) return true; continue; }
      if (p.type === "n") { const dr = Math.abs(rr - r), dc = Math.abs(cc - c); if ((dr === 1 && dc === 2) || (dr === 2 && dc === 1)) return true; continue; }
      const dr = Math.sign(r - rr), dc = Math.sign(c - cc);
      const straight = rr === r || cc === c, diag = Math.abs(rr - r) === Math.abs(cc - c);
      if (!(straight && (p.type === "r" || p.type === "q")) && !(diag && (p.type === "b" || p.type === "q"))) continue;
      let nr = rr + dr, nc = cc + dc, clear = true;
      while (nr !== r || nc !== c) { if (board[nr][nc]) { clear = false; break; } nr += dr; nc += dc; }
      if (clear) return true;
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
        const test = this._apply(clone(board), { ...m, promo: "q" }, enPassant).board;
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
    if (move.promotion) piece.type = move.promo || "q";
    if (move.double) newEnPassant = { r: (move.from.r + move.to.r) / 2, c: move.from.c };
    if (move.castle === "kingside") { board[move.to.r][5] = board[move.to.r][7]; board[move.to.r][7] = null; board[move.to.r][5].moved = true; }
    if (move.castle === "queenside") { board[move.to.r][3] = board[move.to.r][0]; board[move.to.r][0] = null; board[move.to.r][3].moved = true; }
    return { board, enPassant: newEnPassant };
  }

  _key() { return this.board.map(row => row.map(p => (p ? (p.color === "w" ? p.type.toUpperCase() : p.type) : ".")).join("")).join("/") + this.turn; }
  _remember() { const k = this._key(); this.reps.set(k, (this.reps.get(k) || 0) + 1); return this.reps.get(k); }

  _deadPosition() {
    const rest = [];
    for (const row of this.board) for (const p of row) if (p && p.type !== "k") rest.push(p.type);
    return rest.length === 0 || (rest.length === 1 && (rest[0] === "n" || rest[0] === "b"));
  }

  // ------------------------------------------------------------ PLAY ------
  _onCellClick(r, c) {
    if (this.state !== "playing" || this.locked || this.over || this.promo) return;
    if (this.human && this.turn !== this.human) return;
    if (this.mode === "puzzle" && this.solved) return;
    const piece = this.board[r][c];
    const legal = this._legalMoves(this.board, this.turn, this.enPassant);
    if (this.selected) {
      const moves = legal.filter(m => m.from.r === this.selected.r && m.from.c === this.selected.c && m.to.r === r && m.to.c === c);
      if (moves.length) {
        if (moves[0].promotion) { this.promo = { move: moves[0] }; this._render(); return; }
        return this._humanMove(moves[0]);
      }
    }
    if (piece && piece.color === this.turn) { this.selected = { r, c }; audioManager.play("click"); }
    else this.selected = null;
    this._render();
  }

  _humanMove(move) {
    if (this.mode === "puzzle") return this._puzzleMove(move);
    this._makeMove(move);
  }

  _snapshot() { return { board: clone(this.board), turn: this.turn, enPassant: this.enPassant, lastMove: this.lastMove, halfmove: this.halfmove, reps: new Map(this.reps), clock: this.clock && { ...this.clock }, moves: [...(this.moves || [])], uci: [...(this.uci || [])] }; }

  /** Short algebraic notation, with file/rank disambiguation where needed. */
  _san(move) {
    const p = this.board[move.from.r][move.from.c];
    if (move.castle) return move.castle === "kingside" ? "O-O" : "O-O-O";
    const to = FILES[move.to.c] + (8 - move.to.r);
    const cap = this.board[move.to.r][move.to.c] || move.enPassant;
    if (p.type === "p") return (cap ? FILES[move.from.c] + "x" : "") + to + (move.promotion ? "=" + (move.promo || "q").toUpperCase() : "");
    const twins = this._legalMoves(this.board, p.color, this.enPassant).filter(m => m.to.r === move.to.r && m.to.c === move.to.c && !(m.from.r === move.from.r && m.from.c === move.from.c) && this.board[m.from.r][m.from.c].type === p.type);
    let dis = "";
    if (twins.length) dis = twins.some(m => m.from.c === move.from.c) ? String(8 - move.from.r) : FILES[move.from.c];
    return p.type.toUpperCase() + dis + (cap ? "x" : "") + to;
  }

  _makeMove(move) {
    this.history.push(this._snapshot());
    this.moves.push(this._san(move));
    this.uci.push(FILES[move.from.c] + (8 - move.from.r) + FILES[move.to.c] + (8 - move.to.r));
    this._anim = { from: move.from, to: move.to, castle: move.castle };
    const capSq = move.enPassant ? { r: move.from.r, c: move.to.c } : move.to;
    const victim = this.board[capSq.r][capSq.c];
    this._fx = victim ? { ...capSq, type: victim.type, color: victim.color } : null;
    const target = this.board[move.to.r][move.to.c];
    const mover = this.board[move.from.r][move.from.c];
    const capture = !!target || move.enPassant;
    const { enPassant } = this._apply(this.board, move, this.enPassant);
    this.enPassant = enPassant;
    this.halfmove = capture || mover.type === "p" ? 0 : this.halfmove + 1;
    this.lastMove = move;
    this.selected = null;
    this.promo = null;
    if (this.clock) { this._tickClock(); this.clock[this.turn] += this.clock.inc; }
    audioManager.play(move.castle ? "powerup" : capture ? "hit" : "select");
    this._afterMove();
  }

  _afterMove() {
    const mover = this.turn;
    const next = mover === "w" ? "b" : "w";
    const legal = this._legalMoves(this.board, next, this.enPassant);
    const k = this._findKing(this.board, next);
    const inCheck = k && this._attacked(this.board, k.r, k.c, next);
    this.turn = next;
    const reps = this._remember();
    this._render();
    if (inCheck && this.moves.length) this.moves[this.moves.length - 1] += legal.length ? "+" : "#";
    this._renderBars();
    if (!legal.length) return this._finish(inCheck ? mover : null, inCheck ? "checkmate" : "stalemate");
    if (this.halfmove >= 100) return this._finish(null, "the fifty-move rule");
    if (reps >= 3) return this._finish(null, "threefold repetition");
    if (this._deadPosition()) return this._finish(null, "insufficient material");
    if (inCheck) audioManager.play("error");
    if (this.human && this.turn !== this.human) this._scheduleAI();
  }

  _puzzleMove(move) {
    const snap = this._snapshot();
    this._apply(this.board, move, this.enPassant);
    this.lastMove = move; this.selected = null; this.promo = null;
    const opp = this.turn === "w" ? "b" : "w";
    const k = this._findKing(this.board, opp);
    const mate = k && this._attacked(this.board, k.r, k.c, opp) && !this._legalMoves(this.board, opp, null).length;
    if (mate) {
      this.solved = true;
      const s = this._store();
      if (!s.puzzles.includes(this.pIdx)) { s.puzzles.push(this.pIdx); this.addScore(100); }
      saveManager.saveNow();
      this.note = `✔ Checkmate! Puzzle ${this.pIdx + 1} solved.`;
      audioManager.play("win");
    } else {
      this.note = "✘ Not mate — try again.";
      audioManager.play("error");
      setTimeout(() => { if (this.mode === "puzzle" && !this.solved) { Object.assign(this, { board: snap.board, lastMove: null }); this._render(); } }, 800);
    }
    this._render();
  }

  _nextPuzzle() {
    const s = this._store();
    const open = PUZZLES.map((_, i) => i).filter(i => !s.puzzles.includes(i) && i !== this.pIdx);
    this._loadPuzzle(open.length ? open[0] : (this.pIdx + 1) % PUZZLES.length);
    this._render();
  }

  _undo() {
    if (this.locked || this.over || !this.history.length) return;
    // Against the AI take back both plies so it is your move again.
    let snap = this.history.pop();
    if (this.human && snap.turn !== this.human && this.history.length) snap = this.history.pop();
    Object.assign(this, { board: snap.board, turn: snap.turn, enPassant: snap.enPassant, lastMove: snap.lastMove, halfmove: snap.halfmove, reps: snap.reps, moves: snap.moves, uci: snap.uci, selected: null });
    audioManager.play("click");
    this._render();
  }

  /** Casual help: flash the move the engine likes, three times a game. */
  _hint() {
    if (this.locked || this.over || (this.hintsUsed || 0) >= 3 || this.turn !== this.human) return;
    const legal = this._legalMoves(this.board, this.turn, this.enPassant);
    if (!legal.length) return;
    this.hintsUsed = (this.hintsUsed || 0) + 1;
    const m = chooseMove(this.board, this.turn, this.enPassant, { depth: 4, time: 700, book: false });
    if (!m) return;
    this.selected = { ...m.from };
    this._render();
    const cells = this.boardEl.querySelectorAll(".cell");
    const idx = (r, c) => (this.flip ? (7 - r) * 8 + (7 - c) : r * 8 + c);
    cells[idx(m.to.r, m.to.c)]?.classList.add("hint-sq");
    audioManager.play("select");
  }

  _resign() {
    if (this.over || this.state !== "playing") return;
    this._finish(this.human === "w" ? "b" : "w", "resignation");
  }

  // ----------------------------------------------------------- CLOCK ------
  _tickClock() {
    const now = performance.now();
    if (this.clock && !this.over && this.state === "playing") this.clock[this.turn] -= (now - this._clockT) / 1000;
    this._clockT = now;
  }

  onUpdate() {
    if (!this.clock || this.over) return;
    this._tickClock();
    for (const side of ["w", "b"]) {
      const elx = this._clockEls?.[side];
      if (elx) { elx.textContent = fmtClock(this.clock[side]); elx.classList.toggle("low", this.clock[side] < 20); elx.classList.toggle("on", this.turn === side); }
    }
    if (this.clock[this.turn] <= 0) {
      this.clock[this.turn] = 0;
      this._finish(this.turn === "w" ? "b" : "w", "time");
    }
  }

  // ---------------------------------------------------------- FINISH -----
  _finish(winner, reason) {
    if (this.over) return;
    this.over = true;
    this.locked = false;
    if (reason === "checkmate") {
      const loser = winner === "w" ? "b" : "w";
      this.mateKing = this._findKing(this.board, loser);
    }
    this._render();
    if (winner && (this.mode === "local" || winner === this.human)) this._confetti();
    const s = this._store();
    const name = (c) => (c === "w" ? "White" : "Black");
    const how = reason === "checkmate" ? "by checkmate" : reason === "time" ? "on time" : reason === "resignation" ? "by resignation" : "";
    setTimeout(() => {
      if (this.mode === "local") {
        if (!winner) return this.endGame({ result: "draw", score: 1, message: `Draw by ${reason}.` });
        return this.endGame({ result: "win", score: 1, message: `${name(winner)} wins ${how}!` });
      }
      const result = !winner ? "draw" : winner === this.human ? "win" : "loss";
      const extraStats = [{ label: "Moves", value: Math.ceil(this.history.length / 2) }];
      const foe = this.mode === "ranked" ? this.bot.name : "The AI";
      let message = !winner ? `Draw by ${reason}.` : result === "win" ? `You win ${how}!` : `${foe} wins ${how}.`;
      let score = result === "win" ? 1 : 0;
      let anim = null;
      if (this.mode === "ranked") {
        const before = s.rating, rBefore = rankInfo(before), peakBefore = s.peak;
        const expected = 1 / (1 + Math.pow(10, (this.botRating - before) / 400));
        const actual = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
        const k = s.games < 5 ? 48 : s.games < 15 ? 32 : 24;
        const notes = [];
        let delta = Math.round(k * (actual - expected));
        if (s.games < 5) notes.push(`Placement ${s.games + 1}/5`);
        if (result === "win") {
          s.streak++;
          if (s.streak >= 2) { const b = Math.min(8, s.streak * 2); delta += b; notes.push(`🔥 Streak ×${s.streak} +${b}`); }
          if (s.lastWinDay !== todayKey()) { s.lastWinDay = todayKey(); delta += 8; notes.push("☀ First win today +8"); }
          s.bestStreak = Math.max(s.bestStreak, s.streak);
        } else s.streak = 0;
        let after = Math.max(100, before + delta);
        // Fresh promotions come with a shield: three games before you can drop out of the tier.
        const floor = rBefore.tier.min;
        if (after < floor && s.shield > 0 && before >= floor) { after = floor; s.shield--; notes.push(`🛡 Shield held (${s.shield} left)`); }
        delta = after - before;
        s.rating = after;
        s.peak = Math.max(s.peak, after);
        s.games++; s[result === "win" ? "wins" : result === "loss" ? "losses" : "draws"]++;
        const rAfter = rankInfo(after);
        const promoted = rAfter.idx > rBefore.idx, demoted = rAfter.idx < rBefore.idx;
        if (rAfter.tier !== rBefore.tier && promoted) s.shield = 3;
        const unlocked = [];
        for (const t of TIERS) if (t.min > peakBefore && t.min <= s.peak && REWARDS[t.name]) unlocked.push(...REWARDS[t.name].map(r => r.name));
        s.history.push({ r: result === "win" ? "w" : result === "loss" ? "l" : "d", opp: `${this.bot.name} (${this.botRating})`, e: this.bot.emoji, d: delta });
        if (s.history.length > 30) s.history.splice(0, s.history.length - 30);
        message += ` ${delta >= 0 ? "+" : ""}${delta} rating → ${s.rating}.`;
        if (promoted) message += ` Promoted to ${rAfter.label}!`;
        else if (demoted) message += ` Down to ${rAfter.label}.`;
        extraStats.push({ label: "Rating", value: s.rating }, { label: "Rank", value: rAfter.label }, { label: "Opponent", value: `${this.bot.emoji} ${this.botRating}` });
        score = s.rating;
        anim = { from: before, to: after, delta, promoted, demoted, notes, unlocked };
      }
      saveManager.saveNow();
      this.endGame({ result, score, message, extraStats });
      if (anim) setTimeout(() => this._openPath(anim), 600);
    }, 700);
  }

  // ---------------------------------------------------------- RENDER -----
  _render() {
    const d = this.design;
    const bc = boardColors(d);
    this.boardEl.style.setProperty("--sq-l", bc.light);
    this.boardEl.style.setProperty("--sq-d", bc.dark);
    this.boardEl.innerHTML = "";
    const cells = [];
    const legal = this.selected ? this._legalMoves(this.board, this.turn, this.enPassant).filter(m => m.from.r === this.selected.r && m.from.c === this.selected.c) : [];
    const kingPos = this._findKing(this.board, this.turn);
    const inCheck = kingPos && this._attacked(this.board, kingPos.r, kingPos.c, this.turn);
    for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
      const r = this.flip ? 7 - vr : vr, c = this.flip ? 7 - vc : vc;
      const light = (r + c) % 2 === 0;
      const cell = el("div", { class: `cell ${light ? "light" : "dark"}`, onClick: () => this._onCellClick(r, c) });
      const piece = this.board[r][c];
      if (piece) { const p = el("span", { class: "cp" }); p.innerHTML = pieceSVG(piece.type, piece.color, d); cell.appendChild(p); }
      const lm = this.lastMove;
      if (lm && ((lm.from.r === r && lm.from.c === c) || (lm.to.r === r && lm.to.c === c))) cell.classList.add("last");
      if (this.selected && this.selected.r === r && this.selected.c === c) cell.classList.add("selected");
      const hint = d.hints && legal.find(m => m.to.r === r && m.to.c === c);
      if (hint) cell.classList.add(hint.capture ? "capture-hint" : "move-hint");
      if (inCheck && kingPos.r === r && kingPos.c === c) cell.classList.add("check");
      if (d.coords) {
        if (vc === 0) cell.appendChild(el("i", { class: "co rk" }, String(8 - r)));
        if (vr === 7) cell.appendChild(el("i", { class: "co fl" }, FILES[c]));
      }
      this.boardEl.appendChild(cell);
      cells[r * 8 + c] = cell;
    }
    // Slide the piece that just moved from its old square (and the rook in a castle).
    if (this._anim) {
      const a = this._anim; this._anim = null;
      const slide = (from, to) => {
        const piece = cells[to.r * 8 + to.c]?.querySelector(".cp");
        const f = cells[from.r * 8 + from.c]?.getBoundingClientRect(), t = cells[to.r * 8 + to.c]?.getBoundingClientRect();
        if (!piece || !f || !t || !t.width) return;
        piece.style.transition = "none";
        piece.style.transform = `translate(${f.left - t.left}px, ${f.top - t.top}px)`;
        piece.style.zIndex = 2;
        void piece.offsetWidth;
        piece.style.transition = "transform .24s cubic-bezier(.2,.8,.2,1)";
        piece.style.transform = "";
        setTimeout(() => { piece.style.zIndex = ""; piece.style.transition = ""; piece.classList.add("land"); setTimeout(() => piece.classList.remove("land"), 320); }, 240);
      };
      slide(a.from, a.to);
      if (a.castle) { const r = a.to.r; slide({ r, c: a.castle === "kingside" ? 7 : 0 }, { r, c: a.castle === "kingside" ? 5 : 3 }); }
    }
    // A captured piece shatters where it stood.
    if (this._fx) {
      const fx = this._fx; this._fx = null;
      const cell = cells[fx.r * 8 + fx.c];
      if (cell) {
        const ghost = el("div", { class: "chess-ghost", style: `left:${cell.offsetLeft}px;top:${cell.offsetTop}px;width:${cell.offsetWidth}px;height:${cell.offsetHeight}px` });
        ghost.innerHTML = pieceSVG(fx.type, fx.color, d, "g");
        const col = fx.color === "w" ? d.white : d.black;
        for (let i = 0; i < 12; i++) {
          const a2 = (i / 12) * Math.PI * 2 + Math.random() * 0.4, dist = 30 + Math.random() * 40;
          ghost.appendChild(el("i", { class: "spark", style: `--dx:${Math.cos(a2) * dist}px;--dy:${Math.sin(a2) * dist}px;--c:${i % 3 ? col : "#ffd76a"}` }));
        }
        this.boardEl.appendChild(ghost);
        setTimeout(() => ghost.remove(), 700);
      }
    }
    if (this.over && this.mateKing) {
      const k = cells[this.mateKing.r * 8 + this.mateKing.c]?.querySelector(".cp");
      if (k) k.classList.add("mated");
    }
    if (this.promo) {
      const side = this.turn;
      const pick = el("div", { class: "chess-promo" }, [el("b", {}, "Promote to"), el("div", {}, ["q", "r", "b", "n"].map(t => {
        const btn = el("button", { onClick: (e) => { e.stopPropagation(); this._humanMove({ ...this.promo.move, promo: t }); } });
        btn.innerHTML = pieceSVG(t, side, d);
        return btn;
      }))]);
      this.boardEl.appendChild(pick);
    }
    this._renderBars();
  }

  _confetti() {
    const box = el("div", { class: "chess-confetti" });
    const cols = ["#ffd76a", "#2ee6a6", "#22d3ee", "#ff6ac8", "#9a5ae8", "#ffffff"];
    for (let i = 0; i < 70; i++) {
      box.appendChild(el("i", { style: `left:${Math.random() * 100}%;--c:${cols[i % cols.length]};--d:${(Math.random() * 0.8).toFixed(2)}s;--x:${(Math.random() * 120 - 60).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg` }));
    }
    this.boardEl.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  _captured(color) {
    const left = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (const row of this.board) for (const p of row) if (p && p.color === color && p.type !== "k") left[p.type]++;
    const out = [];
    for (const t of ["q", "r", "b", "n", "p"]) for (let i = 0; i < Math.max(0, START_COUNT[t] - left[t]); i++) out.push(t);
    const mat = Object.entries(left).reduce((s, [t, n]) => s + VALUE[t] * n, 0);
    return { out, mat };
  }

  _renderBars() {
    const s = this._store();
    const d = this.design;
    const me = this.human || "w";
    const opp = me === "w" ? "b" : "w";
    const top = this.flip ? "w" : "b", bot = this.flip ? "b" : "w";
    this._clockEls = {};
    const label = (side) => {
      if (this.mode === "local") return side === "w" ? "White" : "Black";
      if (this.mode === "puzzle") return side === this.human ? "You" : "Defender";
      if (side === this.human) return this.mode === "ranked" ? `You · ${rankInfo(s.rating).label} · ${s.rating}${s.streak >= 2 ? ` 🔥${s.streak}` : ""}` : "You";
      return this.mode === "ranked" ? `${this.bot.emoji} ${this.bot.name} · ${this.botRating}` : `🤖 AI · ${this.mode === "blitz" ? "Blitz" : this.aiLevel} · ${this._aiElo()}`;
    };
    const bar = (node, side) => {
      node.innerHTML = "";
      const other = side === "w" ? "b" : "w";
      const cap = this._captured(other), mine = this._captured(side);
      const diff = Math.round(mine.mat - cap.mat);
      const caps = el("span", { class: "caps" });
      caps.innerHTML = cap.out.map(t => pieceSVG(t, other, d, "c")).join("") + (diff > 0 ? `<em>+${diff}</em>` : "");
      const av = this.mode === "ranked" && side !== this.human ? this.bot.emoji : (this.mode === "local" || this.mode === "puzzle" || side === this.human) ? (side === "w" ? "♔" : "♚") : "🤖";
      const turnDot = el("span", { class: `avatar${this.turn === side && !this.over ? " on" : ""}`, style: `--ac:${side === "w" ? d.white : d.black}` }, av);
      const thinking = this.locked && this.turn === side && this.human && side !== this.human ? el("span", { class: "think" }, "thinking…") : null;
      node.append(...[turnDot, el("b", {}, label(side)), thinking, caps].filter(Boolean));
      if (this.clock) { const ck = el("span", { class: "clock" }, fmtClock(this.clock[side])); this._clockEls[side] = ck; node.append(ck); }
    };
    bar(this.topBar, top);
    bar(this.botBar, bot);

    this.actions.innerHTML = "";
    const btn = (txt, fn, cls = "btn btn-ghost btn-sm") => el("button", { class: cls, onClick: fn }, txt);
    const acts = [btn("🎨 Design", () => this._openDesigner())];
    if (this.mode === "puzzle") {
      acts.push(el("span", { class: `chess-note${this.solved ? " ok" : ""}` }, this.note));
      acts.push(btn(this.solved ? "Next puzzle ▶" : "Skip ▶", () => this._nextPuzzle(), this.solved ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"));
    } else {
      if (this.mode === "casual" || this.mode === "local" || this.mode === "c960") acts.push(btn("↶ Undo", () => this._undo()));
      if (this.mode === "local") acts.push(btn("⇅ Flip", () => { this.flip = !this.flip; this._render(); }));
      if ((this.mode === "casual" || this.mode === "c960") && !this.over) acts.push(btn(`💡 Hint ×${3 - (this.hintsUsed || 0)}`, () => this._hint()));
      if (this.mode !== "local") acts.push(btn("🏳 Resign", () => this._resign()));
      const list = el("div", { class: "chess-moves" });
      (this.moves || []).forEach((m, i) => { if (i % 2 === 0) list.appendChild(el("i", {}, `${i / 2 + 1}.`)); list.appendChild(el("span", { class: i === this.moves.length - 1 ? "last" : "" }, m)); });
      if (!this.moves?.length) list.appendChild(el("i", {}, this.mode === "ranked" && this.note ? this.note : `${MODES[this.mode].icon} ${MODES[this.mode].name}`));
      acts.push(list);
      requestAnimationFrame(() => { list.scrollLeft = list.scrollWidth; });
    }
    this.actions.append(...acts);
    this.setHud({ Mode: this.mode === "ranked" ? rankInfo(s.rating).label : MODES[this.mode].name, Turn: this.over ? "—" : this.turn === "w" ? "White" : "Black" });
    void opp;
  }

  // -------------------------------------------------------- DESIGNER -----
  _openDesigner(onDone) {
    const s = this._store();
    const d = s.design;
    const wasPlaying = this.state === "playing";
    const preview = el("div", { class: "cd-preview" });
    const body = el("div", { class: "chess-designer" });
    const paint = () => {
      const bc = boardColors(d);
      preview.style.setProperty("--sq-l", bc.light); preview.style.setProperty("--sq-d", bc.dark);
      preview.innerHTML = "";
      const rows = [["r", "n", "b", "q", "k", "p"].map(t => ["b", t]), ["p", "k", "q", "b", "n", "r"].map(t => ["w", t])];
      rows.forEach((row, ri) => row.forEach(([side, t], ci) => {
        const cell = el("span", { class: `cd-sq ${(ri + ci) % 2 ? "d" : "l"}` });
        cell.innerHTML = pieceSVG(t, side, d, "p");
        preview.appendChild(cell);
      }));
      saveManager.saveNow();
      if (this.board) this._render();
    };
    const chips = (items, key, render) => {
      const row = el("div", { class: "cd-chips" });
      const draw = () => {
        row.innerHTML = "";
        for (const it of items) {
          const locked = it.rank && !this._unlocked(it.rank);
          const b = el("button", {
            class: `cd-chip${d[key] === it.id ? " on" : ""}${locked ? " locked" : ""}`, disabled: locked || undefined,
            title: locked ? `Reach ${it.rank} in Ranked to unlock` : it.name,
            onClick: () => { d[key] = it.id; audioManager.play("select"); draw(); paint(); },
          });
          render(b, it, locked);
          row.appendChild(b);
        }
      };
      draw();
      return row;
    };
    const colorRow = (key) => {
      const row = el("div", { class: "cd-colors" });
      const input = el("input", { type: "color", value: d[key], title: "Any colour" });
      const draw = () => {
        row.innerHTML = "";
        for (const c of PALETTE) row.appendChild(el("button", { class: `cd-sw${d[key] === c ? " on" : ""}`, style: `background:${c}`, title: c, onClick: () => { d[key] = c; input.value = c; draw(); paint(); } }));
        row.appendChild(input);
      };
      input.addEventListener("input", () => { d[key] = input.value; paint(); });
      input.addEventListener("change", () => draw());
      draw();
      return row;
    };
    const shapeItems = [...Object.entries(SHAPES).map(([id, v]) => ({ id, name: v.name })), { id: "glyph", name: "Glyph" }];
    const matItems = Object.entries(MATERIALS).map(([id, v]) => ({ id, name: v.name, rank: v.rank }));
    const boardItems = [...BOARDS, { id: "custom", name: "Custom" }];
    const customRow = el("div", { class: "cd-custom" }, [
      el("label", {}, ["Light ", (() => { const i = el("input", { type: "color", value: d.customLight }); i.addEventListener("input", () => { d.customLight = i.value; d.board = "custom"; paint(); }); return i; })()]),
      el("label", {}, ["Dark ", (() => { const i = el("input", { type: "color", value: d.customDark }); i.addEventListener("input", () => { d.customDark = i.value; d.board = "custom"; paint(); }); return i; })()]),
    ]);
    const toggle = (key, text) => {
      const i = el("input", { type: "checkbox" }); i.checked = !!d[key];
      i.addEventListener("change", () => { d[key] = i.checked; paint(); });
      return el("label", { class: "cd-toggle" }, [i, text]);
    };
    body.append(
      preview,
      el("h4", {}, "Piece shape"),
      chips(shapeItems, "shape", (b, it) => { b.innerHTML = `${pieceSVG("n", "w", { ...d, shape: it.id }, "x")}<span>${it.name}</span>`; }),
      el("h4", {}, "Material"),
      chips(matItems, "material", (b, it, locked) => { b.innerHTML = `${pieceSVG("q", "w", { ...d, material: it.id }, "m" + it.id)}<span>${locked ? "🔒 " : ""}${it.name}</span>`; }),
      el("h4", {}, "White army"), colorRow("white"),
      el("h4", {}, "Black army"), colorRow("black"),
      el("h4", {}, "Board"),
      chips(boardItems, "board", (b, it, locked) => {
        const bc = it.id === "custom" ? { light: d.customLight, dark: d.customDark } : it;
        b.innerHTML = `<i class="cd-bsw" style="background:linear-gradient(135deg, ${bc.light} 50%, ${bc.dark} 50%)"></i><span>${locked ? "🔒 " : ""}${it.name}</span>`;
      }),
      customRow,
      el("div", { class: "cd-toggles" }, [toggle("coords", "Coordinates"), toggle("hints", "Move hints")]),
      el("p", { class: "zone-intro" }, "🔒 Styles unlock as rewards on the Ranked Path: Lava at Silver, Royal at Gold, Ice and Glacier at Platinum, Aurora and Inferno at Diamond, Galaxy at Master, Champion at Grandmaster."),
    );
    paint();
    if (wasPlaying && this.clock) this._tickClock();
    openModal({
      title: "🎨 Piece Designer",
      bodyNode: body,
      onClose: () => { this._clockT = performance.now(); onDone?.(); },
      footerNode: el("div", { class: "modal-foot" }, [
        el("button", { class: "btn btn-ghost", onClick: () => { Object.assign(s.design, DEFAULT_DESIGN); closeModal(); if (this.board) this._render(); } }, "Reset"),
        el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Done"),
      ]),
    });
  }
}

export default ChessGame;
