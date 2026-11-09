// ==========================================================================
// Chess engine for the AI opponents.
//
// A 10×12 mailbox board with make/unmake, alpha-beta search with iterative
// deepening, captures-first move ordering (MVV-LVA plus killer moves), a
// quiescence search so it never stops thinking halfway through an exchange,
// and an evaluation built from piece-square tables: develop the knights and
// bishops, take the centre, castle, keep the king safe, push passed pawns,
// and walk the king up in the endgame.
//
// Weaker levels don't play random moves. They search the same way but pick
// among the *good* moves with some noise, so a low-rated bot still develops
// its pieces and plays sensible chess — it just misses the best idea.
// ==========================================================================

const EMPTY = 0, OFF = 7;
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, BLACK = 8;
const VAL = [0, 100, 320, 330, 500, 900, 0];
const CHAR = { p: P, n: N, b: B, r: R, q: Q, k: K };
const TYPE = ["", "p", "n", "b", "r", "q", "k"];

// Piece-square tables, from White's point of view, a8..h8 first.
const PST = {
  [P]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 22, 22, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -22, -22, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [N]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [B]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -12, -10, -10, -12, -10, -20],
  [R]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [Q]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [K]: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, -5, -5, -5, -5, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

const sq120 = (r, c) => 21 + r * 10 + c;      // r 0 = rank 8
const sq64 = (s) => { const r = Math.floor((s - 21) / 10), c = (s - 21) % 10; return r * 8 + c; };
const N_DIRS = [-21, -19, -12, -8, 8, 12, 19, 21];
const B_DIRS = [-11, -9, 9, 11], R_DIRS = [-10, -1, 1, 10], K_DIRS = [-11, -10, -9, -1, 1, 9, 10, 11];

class Pos {
  constructor() { this.b = new Int8Array(120).fill(OFF); this.side = 0; this.castle = 0; this.ep = 0; this.hist = []; }

  static fromGame(board, turn, enPassant) {
    const p = new Pos();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const x = board[r][c];
      p.b[sq120(r, c)] = x ? CHAR[x.type] | (x.color === "b" ? BLACK : 0) : EMPTY;
    }
    p.side = turn === "w" ? 0 : BLACK;
    const unmoved = (r, c, t, col) => { const x = board[r][c]; return x && x.type === t && x.color === col && !x.moved; };
    if (unmoved(7, 4, "k", "w")) { if (unmoved(7, 7, "r", "w")) p.castle |= 1; if (unmoved(7, 0, "r", "w")) p.castle |= 2; }
    if (unmoved(0, 4, "k", "b")) { if (unmoved(0, 7, "r", "b")) p.castle |= 4; if (unmoved(0, 0, "r", "b")) p.castle |= 8; }
    p.ep = enPassant ? sq120(enPassant.r, enPassant.c) : 0;
    return p;
  }

  attacked(s, by) {   // is square s attacked by colour `by` (0 / BLACK)
    const b = this.b;
    const pawn = P | by;
    if (by === 0) { if (b[s + 9] === pawn || b[s + 11] === pawn) return true; }
    else if (b[s - 9] === pawn || b[s - 11] === pawn) return true;
    for (const d of N_DIRS) if (b[s + d] === (N | by)) return true;
    for (const d of K_DIRS) if (b[s + d] === (K | by)) return true;
    for (const d of B_DIRS) { let t = s + d; while (b[t] === EMPTY) t += d; if (b[t] === (B | by) || b[t] === (Q | by)) return true; }
    for (const d of R_DIRS) { let t = s + d; while (b[t] === EMPTY) t += d; if (b[t] === (R | by) || b[t] === (Q | by)) return true; }
    return false;
  }

  kingSq(col) { const k = K | col; for (let s = 21; s < 99; s++) if (this.b[s] === k) return s; return 0; }
  inCheck(col) { return this.attacked(this.kingSq(col), col ^ BLACK); }

  /** Pseudo-legal moves; `capturesOnly` for quiescence. */
  gen(capturesOnly = false) {
    const b = this.b, us = this.side, them = us ^ BLACK, out = [];
    const add = (f, t, flag = 0, promo = 0) => out.push({ f, t, flag, promo, cap: b[t] !== EMPTY && b[t] !== OFF ? b[t] : 0 });
    const enemy = (x) => x !== EMPTY && x !== OFF && (x & BLACK) === them;
    for (let s = 21; s < 99; s++) {
      const x = b[s];
      if (x === EMPTY || x === OFF || (x & BLACK) !== us) continue;
      const t = x & 7;
      if (t === P) {
        const dir = us ? 10 : -10, startRow = us ? 1 : 6, promoRow = us ? 7 : 0;
        const r = Math.floor((s - 21) / 10);
        const one = s + dir;
        const promo = Math.floor((one - 21) / 10) === promoRow;
        if (b[one] === EMPTY && (!capturesOnly || promo)) {
          if (promo) { for (const pr of [Q, N]) add(s, one, 0, pr); }
          else {
            add(s, one);
            if (r === startRow && b[one + dir] === EMPTY) add(s, one + dir, 2);
          }
        }
        for (const d of [dir - 1, dir + 1]) {
          const to = s + d;
          if (enemy(b[to])) { if (promo) { for (const pr of [Q, N]) add(s, to, 0, pr); } else add(s, to); }
          else if (to === this.ep && this.ep) out.push({ f: s, t: to, flag: 1, promo: 0, cap: P | them });
        }
        continue;
      }
      if (t === N || t === K) {
        for (const d of t === N ? N_DIRS : K_DIRS) {
          const to = s + d, y = b[to];
          if (y === OFF) continue;
          if (y === EMPTY) { if (!capturesOnly) add(s, to); }
          else if ((y & BLACK) === them) add(s, to);
        }
        if (t === K && !capturesOnly) {
          if (!us) {
            if ((this.castle & 1) && b[96] === EMPTY && b[97] === EMPTY && !this.attacked(95, them) && !this.attacked(96, them) && !this.attacked(97, them)) add(95, 97, 3);
            if ((this.castle & 2) && b[94] === EMPTY && b[93] === EMPTY && b[92] === EMPTY && !this.attacked(95, them) && !this.attacked(94, them) && !this.attacked(93, them)) add(95, 93, 3);
          } else {
            if ((this.castle & 4) && b[26] === EMPTY && b[27] === EMPTY && !this.attacked(25, them) && !this.attacked(26, them) && !this.attacked(27, them)) add(25, 27, 3);
            if ((this.castle & 8) && b[24] === EMPTY && b[23] === EMPTY && b[22] === EMPTY && !this.attacked(25, them) && !this.attacked(24, them) && !this.attacked(23, them)) add(25, 23, 3);
          }
        }
        continue;
      }
      const dirs = t === B ? B_DIRS : t === R ? R_DIRS : K_DIRS;
      for (const d of dirs) {
        let to = s + d;
        while (b[to] === EMPTY) { if (!capturesOnly) add(s, to); to += d; }
        if (b[to] !== OFF && (b[to] & BLACK) === them) add(s, to);
      }
    }
    return out;
  }

  make(m) {
    const b = this.b;
    this.hist.push({ cap: b[m.t], castle: this.castle, ep: this.ep, moved: b[m.f] });
    const x = b[m.f];
    b[m.t] = m.promo ? (m.promo | this.side) : x;
    b[m.f] = EMPTY;
    if (m.flag === 1) b[m.t + (this.side ? -10 : 10)] = EMPTY;
    if (m.flag === 3) {
      if (m.t === 97) { b[96] = b[98]; b[98] = EMPTY; } else if (m.t === 93) { b[94] = b[91]; b[91] = EMPTY; }
      else if (m.t === 27) { b[26] = b[28]; b[28] = EMPTY; } else if (m.t === 23) { b[24] = b[21]; b[21] = EMPTY; }
    }
    this.ep = m.flag === 2 ? (m.f + m.t) / 2 : 0;
    // Castling rights fall away when a king or rook leaves home (or a rook is taken).
    for (const s of [m.f, m.t]) {
      if (s === 95) this.castle &= ~3; else if (s === 25) this.castle &= ~12;
      else if (s === 98) this.castle &= ~1; else if (s === 91) this.castle &= ~2;
      else if (s === 28) this.castle &= ~4; else if (s === 21) this.castle &= ~8;
    }
    this.side ^= BLACK;
  }

  unmake(m) {
    const b = this.b, h = this.hist.pop();
    this.side ^= BLACK;
    b[m.f] = h.moved;
    b[m.t] = h.cap;
    if (m.flag === 1) { b[m.t] = EMPTY; b[m.t + (this.side ? -10 : 10)] = P | (this.side ^ BLACK); }
    if (m.flag === 3) {
      if (m.t === 97) { b[98] = b[96]; b[96] = EMPTY; } else if (m.t === 93) { b[91] = b[94]; b[94] = EMPTY; }
      else if (m.t === 27) { b[28] = b[26]; b[26] = EMPTY; } else if (m.t === 23) { b[21] = b[24]; b[24] = EMPTY; }
    }
    this.castle = h.castle; this.ep = h.ep;
  }

  legal() {
    const out = [];
    const us = this.side;
    for (const m of this.gen()) { this.make(m); if (!this.inCheck(us)) out.push(m); this.unmake(m); }
    return out;
  }

  /** Score from the side to move's point of view, in centipawns. */
  evaluate() {
    const b = this.b;
    let mg = 0, nonPawn = 0;
    let wb = 0, bb = 0;
    const pawnsW = new Int8Array(8), pawnsB = new Int8Array(8);
    const pawnList = [];
    let wk = 0, bk = 0;
    for (let s = 21; s < 99; s++) {
      const x = b[s];
      if (x === EMPTY || x === OFF) continue;
      const t = x & 7, black = x & BLACK;
      const i = sq64(s), ix = black ? (7 - (i >> 3)) * 8 + (i & 7) : i;
      if (t === K) { if (black) bk = ix; else wk = ix; continue; }
      if (t !== P) nonPawn += VAL[t];
      if (t === B) { if (black) bb++; else wb++; }
      if (t === P) { (black ? pawnsB : pawnsW)[i & 7]++; pawnList.push([i, black]); }
      const v = VAL[t] + PST[t][ix];
      mg += black ? -v : v;
    }
    // King: middle-game shelter or endgame activity, blended by material left.
    const phase = Math.min(1, nonPawn / 6200);
    mg += Math.round((PST[K][wk] - PST[K][bk]) * phase + (KING_END[wk] - KING_END[bk]) * (1 - phase));
    if (wb >= 2) mg += 30;
    if (bb >= 2) mg -= 30;
    // Pawn structure: doubled and isolated pawns hurt; passed pawns are gold, more so late.
    for (let f = 0; f < 8; f++) {
      if (pawnsW[f] > 1) mg -= 14 * (pawnsW[f] - 1);
      if (pawnsB[f] > 1) mg += 14 * (pawnsB[f] - 1);
      if (pawnsW[f] && !pawnsW[f - 1] && !pawnsW[f + 1]) mg -= 10;
      if (pawnsB[f] && !pawnsB[f - 1] && !pawnsB[f + 1]) mg += 10;
    }
    for (const [i, black] of pawnList) {
      const r = i >> 3, f = i & 7;
      let passed = true;
      for (const [j, bl2] of pawnList) {
        if (bl2 === black || Math.abs((j & 7) - f) > 1) continue;
        const r2 = j >> 3;
        if (black ? r2 > r : r2 < r) { passed = false; break; }
      }
      if (passed) { const adv = black ? r - 1 : 6 - r; const bonus = Math.round((10 + adv * adv * 6) * (1.4 - phase * 0.6)); mg += black ? -bonus : bonus; }
    }
    return this.side ? -mg : mg;
  }
}

const MATE = 100000;

/**
 * Search a position. Returns { move, scores } where `scores` rates every
 * root move (used by the weaker levels to choose among good moves).
 */
function search(pos, { depth = 3, time = 800, allScores = false } = {}) {
  const deadline = performance.now() + time;
  let aborted = false;
  let nodes = 0;
  const killers = [];

  const order = (moves, ply, pv) => {
    for (const m of moves) {
      m.o = 0;
      if (pv && m.f === pv.f && m.t === pv.t) m.o = 1e6;
      else if (m.cap) m.o = 10000 + VAL[m.cap & 7] * 10 - VAL[pos.b[m.f] & 7] / 10;
      else if (m.promo) m.o = 9000;
      else if (killers[ply] && killers[ply].some(k => k.f === m.f && k.t === m.t)) m.o = 5000;
    }
    moves.sort((a, b) => b.o - a.o);
  };

  const quiesce = (alpha, beta, qd) => {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true;
    const stand = pos.evaluate();
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return alpha;
    const moves = pos.gen(true);
    order(moves, 99);
    const us = pos.side;
    for (const m of moves) {
      if (stand + VAL[m.cap & 7] + 200 < alpha && !m.promo) continue;   // delta pruning
      pos.make(m);
      if (pos.inCheck(us)) { pos.unmake(m); continue; }
      const sc = -quiesce(-beta, -alpha, qd + 1);
      pos.unmake(m);
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  };

  const negamax = (d, alpha, beta, ply) => {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) aborted = true;
    if (aborted) return 0;
    const us = pos.side;
    const check = pos.inCheck(us);
    if (d <= 0 && !check) return quiesce(alpha, beta, 0);
    const moves = pos.gen();
    order(moves, ply);
    let legal = 0;
    for (const m of moves) {
      pos.make(m);
      if (pos.inCheck(us)) { pos.unmake(m); continue; }
      legal++;
      const sc = -negamax(d - 1, -beta, -alpha, ply + 1);
      pos.unmake(m);
      if (aborted) return 0;
      if (sc >= beta) {
        if (!m.cap) { (killers[ply] ||= []).unshift(m); killers[ply].length = 2; }
        return beta;
      }
      if (sc > alpha) alpha = sc;
    }
    if (!legal) return check ? -MATE + ply : 0;
    return alpha;
  };

  const root = pos.legal();
  if (!root.length) return { move: null, scores: [] };
  let best = root[0], bestScores = root.map(m => ({ m, s: 0 }));
  for (let d = 1; d <= depth; d++) {
    order(root, 0, best);
    const scores = [];
    let alpha = -MATE * 2, bestHere = null;
    for (const m of root) {
      pos.make(m);
      // With allScores every move gets a real score; otherwise a null window
      // after the first move keeps it fast.
      const sc = -negamax(d - 1, -MATE * 2, allScores ? MATE * 2 : -alpha, 1);
      pos.unmake(m);
      if (aborted) break;
      scores.push({ m, s: sc });
      if (sc > alpha) { alpha = sc; bestHere = m; }
    }
    if (aborted) break;
    best = bestHere || best;
    bestScores = scores;
    if (alpha > MATE - 100) break;                       // found a mate
    if (performance.now() > deadline - time * 0.45) break;  // not enough time for another ply
  }
  return { move: best, scores: bestScores };
}

// Short opening book (from-to squares), so bots open like chess players.
const BOOK = [
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7",
  "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6",
  "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 b1c3 f8b4",
  "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6",
  "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5",
  "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7",
  "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6",
  "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5",
  "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8",
  "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5",
  "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5",
  "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8",
  "c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5",
  "g1f3 d7d5 d2d4 g8f6 c2c4 e7e6 b1c3 f8e7 c1f4 e8g8",
  "e2e4 e7e5 b1c3 g8f6 f2f4 d7d5 f4e5 f6e4 g1f3 f8e7",
];

function bookMove(played) {
  const prefix = played.join(" ");
  const options = [];
  for (const line of BOOK) {
    const mv = line.split(" ");
    if (mv.length <= played.length) continue;
    if (mv.slice(0, played.length).join(" ") === prefix) options.push(mv[played.length]);
  }
  return options.length ? options[Math.floor(Math.random() * options.length)] : null;
}

const uciOf = (m) => { const a = sq64(m.f), b = sq64(m.t); return "abcdefgh"[a & 7] + (8 - (a >> 3)) + "abcdefgh"[b & 7] + (8 - (b >> 3)); };

/**
 * Pick a move for the side to move.
 *  board/turn/enPassant — the game's own representation
 *  opts.depth, opts.time — search limits
 *  opts.noise           — centipawns: choose among moves within this of the best
 *  opts.style           — bot flavour, a small nudge at the root
 *  opts.played          — moves so far as "e2e4" strings, for the opening book
 * Returns { from:{r,c}, to:{r,c}, promo } or null.
 */
export function chooseMove(board, turn, enPassant, opts = {}) {
  const pos = Pos.fromGame(board, turn, enPassant);
  const toRC = (s) => { const i = sq64(s); return { r: i >> 3, c: i & 7 }; };
  if (opts.played && opts.book !== false && opts.played.length < 10) {
    const bm = bookMove(opts.played);
    if (bm) {
      const m = pos.legal().find(x => uciOf(x) === bm);
      if (m) return { from: toRC(m.f), to: toRC(m.t), promo: null, book: true };
    }
  }
  const noise = opts.noise || 0;
  const res = search(pos, { depth: opts.depth || 3, time: opts.time || 800, allScores: noise > 0 || !!opts.style });
  if (!res.move) return null;
  let pick = res.move;
  if (res.scores.length) {
    const style = opts.style;
    const rated = res.scores.map(({ m, s }) => {
      let v = s;
      const t = pos.b[m.f] & 7;
      if (style === "aggressive" && (m.cap || m.promo)) v += 18;
      if (style === "pawns" && t === P) v += 12;
      if (style === "knights" && t === N) v += 12;
      if (style === "solid" && m.flag === 3) v += 20;
      return { m, v, raw: s };
    });
    const top = Math.max(...rated.map(x => x.v));
    if (noise > 0) {
      // Weighted pick among good moves — never a move that just hangs material.
      const pool = rated.filter(x => x.v >= top - noise && x.raw > -MATE / 2);
      const w = pool.map(x => Math.exp((x.v - top) / Math.max(8, noise / 2.5)));
      let roll = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { roll -= w[i]; if (roll <= 0) { pick = pool[i].m; break; } }
    } else pick = rated.find(x => x.v === top).m;
  }
  const promo = pick.promo ? TYPE[pick.promo] : null;
  return { from: toRC(pick.f), to: toRC(pick.t), promo };
}
