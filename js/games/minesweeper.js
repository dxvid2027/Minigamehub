// ==========================================================================
// Minesweeper — classic flood-fill mine clearing with flag mode for touch.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, formatTime } from "../core/utils.js";

const NUM_CLASS = ["", "mine-n1", "mine-n2", "mine-n3", "mine-n4", "mine-n5", "mine-n6", "mine-n7", "mine-n8"];

export class MinesweeperGame extends GameBase {
  getDifficulties() { return ["Easy", "Normal", "Hard"]; }
  getInstructions() {
    return [
      "Reveal cells without clicking on a mine. Numbers show how many mines touch that cell.",
      "Right-click (or toggle Flag Mode) to flag suspected mines.",
      "Reveal every safe cell to win.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap to reveal. Use the Flag Mode button to place flags."; }
  getKeyboardHint() { return "Left-click to reveal, right-click to flag."; }

  onInit() {
    this.stageEl.classList.add("dom-board");
    this.flagMode = false;
    this.toolbar = el("div", { style: "position:absolute;top:8px;left:8px;z-index:3;" }, [
      this.flagBtn = el("button", { class: "chip", onClick: () => { this.flagMode = !this.flagMode; this.flagBtn.classList.toggle("active", this.flagMode); audioManager.play("toggle"); } }, "🚩 Flag Mode"),
    ]);
    this.boardEl = el("div", { class: "board-grid mine-board" });
    this.stageEl.append(this.toolbar, this.boardEl);
  }

  onStart(difficulty) {
    const cfg = { Easy: { size: 9, mines: 10 }, Normal: { size: 12, mines: 24 }, Hard: { size: 14, mines: 38 } }[difficulty];
    this.size = cfg.size; this.mineCount = cfg.mines;
    this.boardEl.style.gridTemplateColumns = `repeat(${this.size}, 1fr)`;
    this.boardEl.style.gridTemplateRows = `repeat(${this.size}, 1fr)`;
    this.cells = Array.from({ length: this.size * this.size }, () => ({ mine: false, adj: 0, revealed: false, flagged: false }));
    this.firstClick = true;
    this.revealedSafe = 0;
    this.totalSafe = this.size * this.size - this.mineCount;
    this.elapsed = 0;
    this.flagMode = false; this.flagBtn.classList.remove("active");
    this.setHud({ Mines: this.mineCount, Flags: 0, Time: "0s" });
    this._renderBoard();
  }

  onUpdate(dt) {
    if (!this.firstClick) this.elapsed += dt;
    const flags = this.cells.filter(c => c.flagged).length;
    this.setHud({ Mines: this.mineCount, Flags: flags, Time: formatTime(this.elapsed) });
  }

  _idx(x, y) { return y * this.size + x; }
  _neighbors(x, y) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < this.size && ny >= 0 && ny < this.size) out.push(this._idx(nx, ny));
    }
    return out;
  }

  _placeMines(avoidIdx) {
    let placed = 0;
    while (placed < this.mineCount) {
      const i = Math.floor(Math.random() * this.cells.length);
      if (i === avoidIdx || this.cells[i].mine) continue;
      this.cells[i].mine = true; placed++;
    }
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const i = this._idx(x, y);
      if (this.cells[i].mine) continue;
      this.cells[i].adj = this._neighbors(x, y).filter(n => this.cells[n].mine).length;
    }
  }

  _renderBoard() {
    this.boardEl.innerHTML = "";
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const i = this._idx(x, y);
      const c = this.cells[i];
      const cell = el("div", {
        class: `cell${c.revealed ? " revealed" : ""}${c.flagged ? " flag" : ""}${c.revealed && c.mine ? " mine" : ""}`,
        onClick: () => this._click(x, y),
        oncontextmenu: (e) => { e.preventDefault(); this._flag(x, y); },
      });
      if (c.revealed && c.mine) cell.textContent = "💣";
      else if (c.revealed && c.adj > 0) { cell.textContent = c.adj; cell.classList.add(NUM_CLASS[c.adj]); }
      else if (c.flagged) cell.textContent = "🚩";
      this.boardEl.appendChild(cell);
    }
  }

  _click(x, y) {
    if (this.state !== "playing") return;
    const i = this._idx(x, y);
    const c = this.cells[i];
    if (c.flagged) return;
    if (this.flagMode) return this._flag(x, y);
    if (this.firstClick) { this._placeMines(i); this.firstClick = false; }
    if (c.revealed) return;
    if (c.mine) return this._explode(i);
    this._reveal(x, y);
    this._renderBoard();
    if (this.revealedSafe >= this.totalSafe) this._win();
  }

  _flag(x, y) {
    if (this.state !== "playing") return;
    const c = this.cells[this._idx(x, y)];
    if (c.revealed) return;
    c.flagged = !c.flagged;
    audioManager.play("toggle");
    this._renderBoard();
  }

  _reveal(x, y) {
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const i = this._idx(cx, cy);
      const c = this.cells[i];
      if (c.revealed || c.flagged) continue;
      c.revealed = true;
      this.revealedSafe++;
      if (c.adj === 0) this._neighbors(cx, cy).forEach(n => { if (!this.cells[n].revealed && !this.cells[n].mine) stack.push([n % this.size, Math.floor(n / this.size)]); });
    }
    audioManager.play("pop");
  }

  _explode(i) {
    this.cells[i].revealed = true;
    this.cells.forEach(c => { if (c.mine) c.revealed = true; });
    this._renderBoard();
    this.shake();
    const score = Math.round(this.revealedSafe * 5);
    this.endGame({ result: "loss", score, message: "You hit a mine!", extraStats: [{ label: "Revealed", value: this.revealedSafe }] });
  }

  _win() {
    const score = Math.max(100, Math.round(this.totalSafe * 12 - this.elapsed * 3));
    audioManager.play("win");
    this.endGame({ result: "win", score, message: `Board cleared in ${formatTime(this.elapsed)}!`, extraStats: [{ label: "Time", value: formatTime(this.elapsed) }] });
  }
}

export default MinesweeperGame;
