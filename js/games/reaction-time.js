// ==========================================================================
// Reaction Test — classic red/green reflex tester across 5 rounds.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { el, randFloat } from "../core/utils.js";

const ROUNDS = 5;

export class ReactionTimeGame extends GameBase {
  getDifficulties() { return ["Normal"]; }
  getInstructions() {
    return [
      "Wait for the red panel to turn green, then tap as fast as you can.",
      `You'll get ${ROUNDS} rounds — your average reaction time becomes your score.`,
      "Tapping too early resets that round, so stay patient!",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap the panel the instant it turns green."; }
  getKeyboardHint() { return "Click the panel (or press Space) the instant it turns green."; }

  onInit() {
    this.panel = el("div", {
      style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;cursor:pointer;transition:background .15s;font-family:var(--font-display);font-weight:800;color:#fff;text-align:center;padding:20px;",
      onClick: () => this._tap(),
    });
    this.stageEl.appendChild(this.panel);
    this.input.onKey("Space", () => this._tap());
  }

  onStart() {
    this.round = 0;
    this.times = [];
    this.setScore(0);
    this.setHud({ Round: "0/" + ROUNDS, Best: "—" });
    this._armRound();
  }

  _armRound() {
    this.phase = "waiting";
    this._setPanel("#ff5470", `Round ${this.round + 1} of ${ROUNDS}`, "Wait for green…");
    const delay = randFloat(1000, 3600);
    this._timer = setTimeout(() => { this.phase = "ready"; this._readyAt = performance.now(); this._setPanel("#2ee6a6", "TAP NOW!", ""); }, delay);
  }

  _setPanel(color, big, small) {
    this.panel.style.background = color;
    this.panel.innerHTML = "";
    this.panel.appendChild(el("div", { style: "font-size:1.6rem;" }, big));
    if (small) this.panel.appendChild(el("div", { style: "font-size:.85rem;font-weight:600;opacity:.85;" }, small));
  }

  _tap() {
    if (this.state !== "playing") return;
    if (this.phase === "waiting") {
      clearTimeout(this._timer);
      audioManager.play("error");
      this._setPanel("#ffd76a", "Too soon!", "Wait for the green panel.");
      setTimeout(() => this._armRound(), 900);
      return;
    }
    if (this.phase === "ready") {
      const rt = Math.round(performance.now() - this._readyAt);
      this.times.push(rt);
      this.round++;
      audioManager.play("score");
      this._setPanel("#22d3ee", `${rt} ms`, this.round < ROUNDS ? "Nice! Get ready…" : "Done!");
      this.setHud({ Round: `${this.round}/${ROUNDS}`, Best: Math.min(...this.times) + " ms" });
      this.phase = "cooldown";
      if (this.round >= ROUNDS) setTimeout(() => this._finish(), 900);
      else setTimeout(() => this._armRound(), 1000);
    }
  }

  _finish() {
    const avg = Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length);
    const best = Math.min(...this.times);
    const score = Math.max(1, Math.round(1200 - avg));
    this.setScore(score);
    audioManager.play("win");
    this.endGame({ result: "score", score, message: `Average ${avg}ms · Best ${best}ms`, extraStats: [{ label: "Avg ms", value: avg }, { label: "Best ms", value: best }] });
  }

  onDestroyRound() { clearTimeout(this._timer); }
  onDestroy() { clearTimeout(this._timer); }
}

export default ReactionTimeGame;
