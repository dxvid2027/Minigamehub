// ==========================================================================
// Frost Solitaire — Spider, with the suit count as the difficulty dial.
//
// Ten columns, two decks, and one rule that makes the whole game: a run of
// descending cards in the same suit moves as a unit, anything else moves
// one card at a time. Complete a King-to-Ace run in one suit and it leaves
// the table.
//
// One suit is a puzzle you can almost always win. Four suits is a different
// game — the same layout, but every sequence you build in mixed suits is a
// pile you will have to take apart again.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, shuffle, todayKey, seededRng } from "../core/utils.js";

const COLS = 10;
const SUITS = ["spade", "heart", "club", "diamond"];
const SUIT_RED = { heart: true, diamond: true };
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const MODES = [
  { suits: 1, name: "One Suit",   text: "Spades only. The rules, without the fight.", par: 1 },
  { suits: 2, name: "Two Suits",  text: "Spades and hearts. Twice the care.",         par: 2 },
  { suits: 4, name: "Four Suits", text: "The full game. Very few hands are winnable clean.", par: 4 },
];

export class FrostSolitaireGame extends GameBase {
  getDifficulties() { return ["One Suit", "Two Suits", "Four Suits"]; }
  getInstructions() {
    return [
      "Build columns downward — a 7 goes on an 8, whatever the suits.",
      "A run of cards descending in the same suit moves together. A mixed run does not: only its bottom card can be dragged.",
      "Complete King down to Ace in one suit and the run is removed from the table. Eight completed runs wins.",
      "The stock deals one card to every column at once, and it will not deal onto an empty column.",
      "Undo is unlimited and free. The daily deal gives everyone the same shuffle.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Drag a card or a run onto another column. Tap the stock to deal."; }
  getKeyboardHint() { return "Drag with the mouse. U undoes, D deals from the stock."; }
  getScene() { return "frost"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.frost) custom.frost = { wins: {}, best: {}, daily: null };
    if (!custom.frost.wins) custom.frost.wins = {};
    if (!custom.frost.best) custom.frost.best = {};
    return custom.frost;
  }
  _save() { saveManager.saveNow(); }

  getStartExtras() {
    const f = this._store();
    return el("div", { class: "delve-summary" }, MODES.map(m =>
      el("span", {}, `${m.name}: ${f.wins[m.suits] || 0} won`)));
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onPointer("down", (p) => this._down(p.x, p.y));
    this.input.onPointer("move", (p) => this._move(p.x, p.y));
    this.input.onPointer("up", (p) => this._up(p.x, p.y));
    this.input.onKey("KeyU", () => this._undo());
    this.input.onKey("KeyD", () => this._deal());
  }

  onResize() { this._fit(); }

  onStart(difficulty) {
    const mode = MODES.find(m => m.name === difficulty) || MODES[0];
    this.mode = mode;
    // The daily deal makes every player's hand identical for the day; a
    // normal game is a fresh shuffle.
    this.daily = false;
    const rng = this.daily ? seededRng(`frost-${todayKey()}-${mode.suits}`) : Math.random;

    // Two decks: 104 cards, but only `suits` distinct suits, repeated.
    const deck = [];
    for (let d = 0; d < 8; d++) {
      const suit = SUITS[d % mode.suits];
      for (let r = 0; r < 13; r++) deck.push({ suit, rank: r, faceUp: false, id: `${d}-${r}` });
    }
    // Fisher-Yates against the chosen generator so a daily deal is stable.
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    this.cols = Array.from({ length: COLS }, () => []);
    // Classic Spider layout: 54 dealt, the first four columns get six.
    let k = 0;
    for (let c = 0; c < COLS; c++) {
      const n = c < 4 ? 6 : 5;
      for (let i = 0; i < n; i++) this.cols[c].push(deck[k++]);
    }
    for (const col of this.cols) col[col.length - 1].faceUp = true;
    this.stock = deck.slice(k);
    this.done = [];               // completed runs
    this.history = [];
    this.moves = 0;
    this.drag = null;
    this.elapsed = 0;
    this.msg = `${mode.name} — good luck`;
    this.msgT = 3;
    this.setScore(500);
    this._fit();
    this._updateHud();
  }

  _fit() {
    const W = this.viewW || 600, H = this.viewH || 600;
    this.cw = Math.min(74, (W - 20) / COLS - 4);
    this.ch = this.cw * 1.42;
    this.gap = (W - this.cw * COLS) / (COLS + 1);
    this.top = 74;
    this.step = Math.max(14, Math.min(24, (H - this.top - this.ch - 20) / 14));
  }

  _colX(c) { return this.gap + c * (this.cw + this.gap); }
  _cardY(c, i) { return this.top + i * this.step; }

  // ------------------------------------------------------------- RULES ---
  /** How many cards from the end of `col` form a same-suit descending run. */
  _runLength(col) {
    let n = 1;
    for (let i = col.length - 1; i > 0; i--) {
      const a = col[i], b = col[i - 1];
      if (!b.faceUp || b.suit !== a.suit || b.rank !== a.rank + 1) break;
      n++;
    }
    return Math.min(n, col.length);
  }

  _canDropOn(col, card) {
    if (!col.length) return true;               // any card may start a column
    const top = col[col.length - 1];
    return top.faceUp && top.rank === card.rank + 1;
  }

  _grab(c, i) {
    const col = this.cols[c];
    if (i < 0 || i >= col.length) return null;
    if (!col[i].faceUp) return null;
    // Only a same-suit descending run from i to the end may be lifted.
    for (let k = i; k < col.length - 1; k++) {
      const a = col[k], b = col[k + 1];
      if (a.suit !== b.suit || a.rank !== b.rank + 1) return null;
    }
    return col.slice(i);
  }

  _pushHistory() {
    // The stock is snapshotted as a copy, not a length. Restoring it by
    // length silently failed to put back the ten cards a deal removed.
    this.history.push({
      cols: this.cols.map(c => c.map(x => ({ ...x }))),
      stock: this.stock.map(x => ({ ...x })),
      done: this.done.slice(),
      score: this.score,
      moves: this.moves,
    });
    if (this.history.length > 200) this.history.shift();
  }

  _undo() {
    if (this.state !== "playing" || !this.history.length) return;
    const h = this.history.pop();
    this.cols = h.cols;
    this.stock = h.stock;
    this.done = h.done;
    this.moves = h.moves;
    this.setScore(Math.max(0, h.score - 2));
    audioManager.play("click");
    this._say("Undone", "#8b90ac");
    this._updateHud();
  }

  _deal() {
    if (this.state !== "playing" || this.drag) return;
    if (!this.stock.length) { this._say("The stock is empty", "#ff5470"); return; }
    if (this.cols.some(c => c.length === 0)) {
      this._say("Fill every empty column before dealing", "#ff5470");
      audioManager.play("error");
      return;
    }
    this._pushHistory();
    for (let c = 0; c < COLS; c++) {
      const card = this.stock.pop();
      if (!card) break;
      card.faceUp = true;
      this.cols[c].push(card);
    }
    this.moves++;
    this.setScore(Math.max(0, this.score - 1));
    audioManager.play("place");
    this._checkRuns();
    this._updateHud();
  }

  /** A completed King-to-Ace run in one suit leaves the table. */
  _checkRuns() {
    for (let c = 0; c < COLS; c++) {
      const col = this.cols[c];
      if (col.length < 13) continue;
      const start = col.length - 13;
      let ok = col[start].rank === 12 && col[start].faceUp;
      if (ok) for (let k = 0; k < 12; k++) {
        const a = col[start + k], b = col[start + k + 1];
        if (!a.faceUp || !b.faceUp || a.suit !== b.suit || a.rank !== b.rank + 1) { ok = false; break; }
      }
      if (!ok) continue;
      const run = col.splice(start, 13);
      this.done.push(run[0].suit);
      if (col.length && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
      this.addScore(120);
      audioManager.play("win");
      this._say(`Run complete — ${this.done.length}/8`, "#2ee6a6");
      this.shake();
      if (this.done.length >= 8) { this._win(); return; }
    }
  }

  _win() {
    const store = this._store();
    const key = this.mode.suits;
    store.wins[key] = (store.wins[key] || 0) + 1;
    if (!store.best[key] || store.best[key] > this.moves) store.best[key] = this.moves;
    this._save();
    this.addScore(1000 * this.mode.par);
    this.endGame({
      result: "win", score: this.score,
      message: `All eight runs cleared on ${this.mode.name.toLowerCase()} in ${this.moves} moves.`,
      extraStats: [
        { label: "Moves", value: this.moves },
        { label: "Mode", value: this.mode.name },
        { label: "Wins", value: store.wins[key] },
      ],
    });
  }

  /** No legal move and no stock is a dead hand, not a silent stall. */
  _checkStuck() {
    if (this.stock.length) return;
    for (let a = 0; a < COLS; a++) {
      const col = this.cols[a];
      if (!col.length) return;                   // an empty column is a move
      const run = this._runLength(col);
      for (let n = 1; n <= run; n++) {
        const card = col[col.length - n];
        for (let b = 0; b < COLS; b++) {
          if (a === b) continue;
          if (this._canDropOn(this.cols[b], card)) return;
        }
      }
    }
    this.endGame({
      result: "loss", score: this.score,
      message: `No legal move is left and the stock is empty. ${this.done.length} of 8 runs were cleared.`,
      extraStats: [
        { label: "Runs", value: `${this.done.length}/8` },
        { label: "Moves", value: this.moves },
        { label: "Mode", value: this.mode.name },
      ],
    });
  }

  // ------------------------------------------------------------- INPUT ---
  _hit(x, y) {
    // Stock pile in the top-right.
    if (x > this.viewW - this.cw - 12 && y < this.top - 8) return { stock: true };
    for (let c = 0; c < COLS; c++) {
      const cx = this._colX(c);
      if (x < cx || x > cx + this.cw) continue;
      const col = this.cols[c];
      if (!col.length) {
        if (y >= this.top && y <= this.top + this.ch) return { c, i: -1 };
        continue;
      }
      for (let i = col.length - 1; i >= 0; i--) {
        const cy = this._cardY(c, i);
        const h = i === col.length - 1 ? this.ch : this.step;
        if (y >= cy && y <= cy + h) return { c, i };
      }
    }
    return null;
  }

  _down(x, y) {
    if (this.state !== "playing") return;
    const h = this._hit(x, y);
    if (!h) return;
    if (h.stock) { this._deal(); return; }
    if (h.i < 0) return;
    const cards = this._grab(h.c, h.i);
    if (!cards) { audioManager.play("error"); this._say("That run is not in one suit", "#ff9f43"); return; }
    this.drag = { from: h.c, index: h.i, cards, x, y, ox: x - this._colX(h.c), oy: y - this._cardY(h.c, h.i) };
    audioManager.play("click");
  }

  _move(x, y) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }

  _up(x, y) {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    // Which column is the drag over? Use the card's left edge, not the cursor.
    const left = x - d.ox;
    let target = -1, bestOverlap = 0;
    for (let c = 0; c < COLS; c++) {
      const cx = this._colX(c);
      const overlap = Math.min(cx + this.cw, left + this.cw) - Math.max(cx, left);
      if (overlap > bestOverlap) { bestOverlap = overlap; target = c; }
    }
    if (target < 0 || target === d.from) return;
    if (!this._canDropOn(this.cols[target], d.cards[0])) {
      audioManager.play("error");
      this._say("That does not go there", "#ff5470");
      return;
    }
    this._pushHistory();
    this.cols[d.from].splice(d.index);
    const col = this.cols[d.from];
    if (col.length && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
      this.addScore(6);
    }
    this.cols[target].push(...d.cards);
    this.moves++;
    this.setScore(Math.max(0, this.score - 1));
    audioManager.play("place");
    this._checkRuns();
    this._checkStuck();
    this._updateHud();
  }

  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 2.2; }

  _updateHud() {
    this.setHud({
      Runs: `${this.done?.length ?? 0}/8`,
      Stock: Math.ceil((this.stock?.length ?? 0) / COLS),
      Moves: this.moves ?? 0,
      Mode: this.mode?.suits ?? 1,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    this._drawFelt(ctx, W, H);
    this._drawColumns(ctx);
    this._drawStock(ctx, W);
    this._drawDone(ctx, W);
    if (this.drag) this._drawDrag(ctx);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  /** A cold felt with a frosted vignette — the game's whole visual idea. */
  _drawFelt(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#123044"); g.addColorStop(1, "#0a1c2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Frost crystals in the corners.
    ctx.strokeStyle = "rgba(200,235,255,0.09)";
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 10; k++) {
      const cx = (k % 2 ? W - 20 : 20) + Math.sin(k) * 40;
      const cy = (k < 5 ? 20 : H - 20) + Math.cos(k) * 40;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const len = 22 + (k % 3) * 9;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        ctx.moveTo(cx + Math.cos(a) * len * 0.6, cy + Math.sin(a) * len * 0.6);
        ctx.lineTo(cx + Math.cos(a + 0.5) * len * 0.85, cy + Math.sin(a + 0.5) * len * 0.85);
        ctx.stroke();
      }
    }
  }

  _drawColumns(ctx) {
    for (let c = 0; c < COLS; c++) {
      const cx = this._colX(c);
      const col = this.cols[c];
      if (!col.length) {
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        roundRect(ctx, cx, this.top, this.cw, this.ch, 7); ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const runFrom = col.length - this._runLength(col);
      col.forEach((card, i) => {
        const dragging = this.drag && this.drag.from === c && i >= this.drag.index;
        if (dragging) return;
        this._drawCard(ctx, card, cx, this._cardY(c, i), i >= runFrom && card.faceUp);
      });
    }
  }

  /**
   * One card. Face-down cards get a frosted back; face-up cards get the
   * rank in both corners and a drawn pip, never a font glyph, so the suits
   * look like one set at any size.
   */
  _drawCard(ctx, card, x, y, inRun) {
    const w = this.cw, h = this.ch;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    if (!card.faceUp) {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, "#2a4f6b"); g.addColorStop(1, "#173245");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 6); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(160,210,240,0.35)";
      ctx.lineWidth = 1.4;
      roundRect(ctx, x + 3.5, y + 3.5, w - 7, h - 7, 4); ctx.stroke();
      // Snowflake on the back.
      const cx = x + w / 2, cy = y + h / 2;
      ctx.strokeStyle = "rgba(190,230,255,0.4)";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * w * 0.24, cy + Math.sin(a) * w * 0.24);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    ctx.fillStyle = "#f4f8ff";
    roundRect(ctx, x, y, w, h, 6); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = inRun ? "rgba(46,230,166,0.85)" : "rgba(30,50,70,0.35)";
    ctx.lineWidth = inRun ? 2 : 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6); ctx.stroke();

    const red = SUIT_RED[card.suit];
    ctx.fillStyle = red ? "#c9243a" : "#16222e";
    ctx.font = `800 ${Math.round(w * 0.28)}px 'Sora', system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(RANKS[card.rank], x + 5, y + w * 0.3);
    drawPip(ctx, card.suit, x + w - 11, y + w * 0.22, w * 0.14, red);
    // A larger pip in the middle of the card's visible strip.
    drawPip(ctx, card.suit, x + w / 2, y + Math.min(h * 0.6, this.step * 1.6), w * 0.2, red);
    ctx.restore();
  }

  _drawStock(ctx, W) {
    const piles = Math.ceil(this.stock.length / COLS);
    const x = W - this.cw - 12, y = 8;
    for (let i = 0; i < Math.min(piles, 5); i++) {
      ctx.save();
      ctx.translate(-i * 5, i * 1.5);
      const g = ctx.createLinearGradient(x, y, x + this.cw, y + this.top - 20);
      g.addColorStop(0, "#2a4f6b"); g.addColorStop(1, "#173245");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, this.cw, this.top - 20, 6); ctx.fill();
      ctx.strokeStyle = "rgba(160,210,240,0.4)"; ctx.lineWidth = 1.2;
      roundRect(ctx, x + 3, y + 3, this.cw - 6, this.top - 26, 4); ctx.stroke();
      ctx.restore();
    }
    if (!piles) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
      roundRect(ctx, x, y, this.cw, this.top - 20, 6); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 13px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(piles), x + this.cw / 2, y + (this.top - 20) / 2 + 5);
    }
  }

  _drawDone(ctx, W) {
    this.done.forEach((suit, i) => {
      const x = 12 + i * 26, y = 12;
      ctx.fillStyle = "#f4f8ff";
      roundRect(ctx, x, y, 22, 30, 4); ctx.fill();
      drawPip(ctx, suit, x + 11, y + 15, 7, SUIT_RED[suit]);
    });
  }

  _drawDrag(ctx) {
    const d = this.drag;
    d.cards.forEach((card, i) => {
      this._drawCard(ctx, card, d.x - d.ox, d.y - d.oy + i * this.step, true);
    });
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.4);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,20,30,0.7)";
    roundRect(ctx, W / 2 - 160, H - 34, 320, 26, 13); ctx.fill();
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 12px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, H - 16);
    ctx.globalAlpha = 1;
  }
}

/** The four suit pips, drawn rather than typed. */
function drawPip(ctx, suit, x, y, r, red) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = red ? "#c9243a" : "#16222e";
  ctx.beginPath();
  if (suit === "heart") {
    ctx.moveTo(0, r * 0.9);
    ctx.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.5, -r * 1.2, 0, -r * 0.4);
    ctx.bezierCurveTo(r * 0.5, -r * 1.2, r * 1.4, -r * 0.2, 0, r * 0.9);
  } else if (suit === "diamond") {
    ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.75, 0);
  } else if (suit === "spade") {
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 1.3, r * 0.2, r * 0.4, r * 0.75, 0, r * 0.3);
    ctx.bezierCurveTo(-r * 0.4, r * 0.75, -r * 1.3, r * 0.2, 0, -r);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, r * 0.25);
    ctx.lineTo(r * 0.22, r * 0.25);
    ctx.lineTo(r * 0.1, r);
    ctx.lineTo(-r * 0.1, r);
  } else {
    ctx.arc(0, -r * 0.35, r * 0.45, 0, 7);
    ctx.fill();
    ctx.beginPath(); ctx.arc(-r * 0.45, r * 0.28, r * 0.45, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.45, r * 0.28, r * 0.45, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.14, r * 0.3);
    ctx.lineTo(r * 0.14, r * 0.3);
    ctx.lineTo(r * 0.08, r);
    ctx.lineTo(-r * 0.08, r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default FrostSolitaireGame;
