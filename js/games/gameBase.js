// ==========================================================================
// GameBase — the framework every mini-game extends. Handles the start menu,
// pause menu, win/lose screens, HUD, save/stat/achievement hooks, sound,
// difficulty selection, responsive canvas sizing and touch controls so each
// game only has to implement its own simulation + rendering.
// ==========================================================================
import { saveManager } from "../systems/saveManager.js";
import { progression } from "../systems/progression.js";
import { audioManager } from "../systems/audioManager.js";
import { ParticleSystem } from "../systems/particleSystem.js";
import { createInput } from "../systems/inputManager.js";
import { GameGfx } from "./gfx.js";
import { eventBus } from "../core/eventBus.js";
import { el, formatNumber, formatTime } from "../core/utils.js";
import { iconMarkup } from "../ui/icons.js";
import { openModal, closeModal } from "../ui/modal.js";

export class GameBase {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.root       - .play-wrap container
   * @param {Object} opts.meta            - registry entry from data/games.js
   */
  constructor({ root, meta }) {
    this.root = root;
    this.meta = meta;
    this.id = meta.id;
    this.state = "idle"; // idle | playing | paused | ended
    this.score = 0;
    this.difficulty = "Normal";
    this.hudFields = {};
    this._raf = null;
    this._lastT = 0;
    this._sessionSeconds = 0;
    this._playtimeFlushed = 0;
    this._destroyed = false;
    this._usesCanvas = true;

    this._buildShell();
    this.input = createInput(this.stageEl);
    this.particles = new ParticleSystem();
    this.gfx = new GameGfx(this.meta, this.getScene?.() || "aurora");
    this.input.onKey("KeyP", () => this.togglePause());
    this.input.onKey("Escape", () => this.togglePause());

    document.addEventListener("visibilitychange", this._onVisibility = () => {
      if (document.hidden && this.state === "playing") this.pause();
    });

    this.onInit?.();
    this.showStartOverlay();
  }

  // ---------------------------------------------------------------- SHELL --
  _buildShell() {
    const g = this.meta;
    this.root.innerHTML = "";
    this.root.style.setProperty("--game-max-w", g.wide ? "980px" : "860px");
    this.root.style.setProperty("--game-ratio", g.ratio || "4/3");

    this.hud = el("div", { class: "play-hud" }, [
      el("div", { class: "hud-left" }, [
        el("span", { class: "hud-title" }, `${g.emoji} ${g.title}`),
      ]),
      this.hudStatsEl = el("div", { class: "hud-stats" }),
      el("div", { class: "hud-actions" }, [
        iconButton("info", "How to play", () => this.showHowToPlay()),
        this.pauseBtn = iconButton("pause", "Pause", () => this.togglePause()),
        iconButton("restart", "Restart", () => this.confirmRestart()),
        iconLink("close", "Back to Library", "#/library"),
      ]),
    ]);

    this.stageOuter = el("div", { class: "game-stage-outer" });
    this.stageEl = el("div", { class: "game-stage" + (g.domBoard ? " dom-board" : "") });
    this.touchEl = el("div", { class: "touch-controls" });
    this.overlayEl = el("div", { class: "game-overlay", hidden: true });
    this.stageOuter.append(this.stageEl, this.touchEl, this.overlayEl);

    this.tipEl = el("p", { class: "game-tip" }, "Tip: press P to pause anytime.");

    this.root.append(this.hud, this.stageOuter, this.tipEl);
    this.setHud({ Score: 0 });

    this._fitStage();
    this._onWindowResize = () => this._fitStage();
    window.addEventListener("resize", this._onWindowResize);
    window.addEventListener("orientationchange", this._onWindowResize);
  }

  /**
   * Sizes the stage so the playfield always keeps the game's intended aspect
   * ratio *and* fits the viewport — no scrolling mid-game on any device, and
   * no stretched boards on short/wide screens.
   */
  _fitStage() {
    const [rw, rh] = String(this.meta.ratio || "4/3").split("/").map(Number);
    const ratio = rw && rh ? rw / rh : 4 / 3;
    const maxW = Math.min(this.root.clientWidth || window.innerWidth, this.meta.wide ? 980 : 860);
    const rect = this.stageOuter.getBoundingClientRect();
    // rect.top is viewport-relative; when the page is scrolled fall back to a
    // conservative estimate of the chrome above the stage.
    const above = rect.top > 0 ? rect.top : 150;
    const reserve = window.matchMedia("(max-width: 780px)").matches ? 86 : 34;
    const maxH = Math.max(240, window.innerHeight - above - reserve);
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    this.stageOuter.style.width = `${Math.floor(w)}px`;
    this.stageOuter.style.height = `${Math.floor(h)}px`;
  }

  // Convenience canvas factory sized to the stage with devicePixelRatio handling.
  createCanvas() {
    const canvas = el("canvas");
    this.stageEl.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this._resizeCanvas();
    this._resizeObs = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObs.observe(this.stageEl);
    return canvas;
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.stageEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = rect.width + "px";
    this.canvas.style.height = rect.height + "px";
    this.dpr = dpr;
    this.viewW = rect.width; this.viewH = rect.height;
    this.onResize?.(rect.width, rect.height);
  }

  // ------------------------------------------------------------- HUD/DOM ---
  setHud(fields) {
    Object.assign(this.hudFields, fields);
    this.hudStatsEl.innerHTML = "";
    for (const [label, value] of Object.entries(this.hudFields)) {
      this.hudStatsEl.appendChild(el("div", { class: "hud-stat" }, [
        el("b", {}, String(value)),
        el("span", {}, label),
      ]));
    }
  }

  setScore(n) { this.score = n; this.setHud({ Score: formatNumber(this.score) }); }
  addScore(n) { this.setScore(this.score + n); }

  // ---------------------------------------------------------- OVERLAYS -----
  showStartOverlay() {
    this.state = "idle";
    const gameData = saveManager.ensureGame(this.id);
    const diffs = this.getDifficulties?.() || ["Normal"];
    const instructions = this.getInstructions?.() || ["Have fun!"];
    const controlsLine = this.input.isTouch ? (this.getTouchHint?.() || "Use the on-screen controls.") : (this.getKeyboardHint?.() || "Use your keyboard / mouse to play.");

    this.overlayEl.hidden = false;
    this.overlayEl.innerHTML = "";
    this.overlayEl.append(
      el("div", { class: "overlay-icon" }, this.meta.emoji),
      el("h2", {}, this.meta.title),
      el("p", {}, this.meta.desc),
      el("div", { class: "stat-strip" }, [
        statBlock("High Score", formatNumber(gameData.highScore)),
        statBlock("Plays", formatNumber(gameData.plays)),
        statBlock("Wins", formatNumber(gameData.wins)),
      ]),
      diffs.length > 1 ? el("div", { class: "diff-row" }, diffs.map(d => el("button", {
        class: `chip${d === this.difficulty ? " active" : ""}`,
        onClick: (e) => { this.difficulty = d; [...e.target.parentNode.children].forEach(c => c.classList.remove("active")); e.target.classList.add("active"); audioManager.play("select"); },
      }, d))) : null,
      el("div", { class: "overlay-actions" }, [
        labelledButton("play", "Start Game", "btn btn-primary btn-lg", () => this.start()),
      ]),
      el("ul", { class: "instructions" }, [...instructions.map(i => el("li", {}, i)), el("li", {}, controlsLine)]),
    );
  }

  showPauseOverlay() {
    this.overlayEl.hidden = false;
    this.overlayEl.innerHTML = "";
    this.overlayEl.append(
      el("div", { class: "overlay-icon" }, "⏸"),
      el("h2", {}, "Paused"),
      el("div", { class: "overlay-actions" }, [
        labelledButton("play", "Resume", "btn btn-primary btn-lg", () => this.resume()),
        labelledButton("restart", "Restart", "btn btn-ghost", () => this.confirmRestart()),
        labelledLink("library", "Exit to Library", "btn btn-outline", "#/library"),
      ]),
    );
  }

  showEndOverlay({ result = "score", isHighScore = false, title, message, extraStats = [] } = {}) {
    this.state = "ended";
    this.pauseBtn.disabled = true;
    const icon = result === "win" ? "🎉" : result === "loss" ? "💀" : "🏁";
    this.overlayEl.hidden = false;
    this.overlayEl.innerHTML = "";
    this.overlayEl.append(
      el("div", { class: "overlay-icon pop-in" }, icon),
      el("h2", {}, title || (result === "win" ? "You Win!" : result === "loss" ? "Game Over" : "Round Complete")),
      message ? el("p", {}, message) : null,
      el("div", { class: "stat-strip" }, [
        statBlock("Score", formatNumber(this.score)),
        isHighScore ? statBlock("New Best!", "🌟") : statBlock("Best", formatNumber(saveManager.ensureGame(this.id).highScore)),
        ...extraStats.map(s => statBlock(s.label, s.value)),
      ]),
      el("div", { class: "overlay-actions" }, [
        labelledButton("restart", "Play Again", "btn btn-primary btn-lg", () => this.restart()),
        labelledLink("library", "Back to Library", "btn btn-ghost", "#/library"),
      ]),
    );
    if (isHighScore) {
      const r = this.stageOuter.getBoundingClientRect();
      this._confettiBurst(r.width / 2, r.height / 2);
    }
  }

  /**
   * "How to play" panel, reachable at any time from the HUD. It reuses the
   * same content the start screen shows, plus the control scheme for the
   * device actually in use, and pauses a running game while it is open.
   */
  showHowToPlay() {
    audioManager.play("click");
    const wasPlaying = this.state === "playing";
    if (wasPlaying) this.pause();

    const instructions = this.getInstructions?.() || ["Have fun!"];
    const diffs = this.getDifficulties?.() || [];
    const gameData = saveManager.ensureGame(this.id);

    const section = (title, node) => el("div", { style: "margin-bottom:18px;" }, [
      el("div", { style: "font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;" }, title),
      node,
    ]);

    const body = el("div", {}, [
      el("p", { style: "margin-top:0;" }, this.meta.desc),
      section("Objective & rules", el("ul", { class: "howto-list" }, instructions.map(i => el("li", {}, i)))),
      section("Controls", el("div", { class: "howto-controls" }, [
        controlRow("Keyboard / mouse", this.getKeyboardHint?.() || "Use your keyboard and mouse to play."),
        controlRow("Touch", this.getTouchHint?.() || "Tap and drag on the playfield."),
        controlRow("Anytime", "Press P or Escape to pause. The restart button starts a fresh run."),
      ])),
      diffs.length > 1
        ? section("Difficulty", el("p", { style: "margin:0;font-size:.86rem;color:var(--text-1);" },
            `${diffs.join(" · ")} — currently set to ${this.difficulty}. Change it on the start screen.`))
        : null,
      section("Your record", el("div", { class: "stat-strip", style: "justify-content:flex-start;" }, [
        statBlock("High score", formatNumber(gameData.highScore)),
        statBlock("Plays", formatNumber(gameData.plays)),
        statBlock("Wins", formatNumber(gameData.wins)),
      ])),
    ]);

    const footer = el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Got it");
    openModal({ title: `How to play — ${this.meta.title}`, bodyNode: body, footerNode: footer });
  }

  _confettiBurst(x, y) {
    // Fire a quick DOM-independent confetti using the particle system rendered
    // over a lightweight temp canvas layered above the overlay for celebration.
    if (!saveManager.data.settings.particles) return;
    const c = el("canvas", { style: "position:absolute;inset:0;pointer-events:none;z-index:11;" });
    c.width = this.stageOuter.clientWidth; c.height = this.stageOuter.clientHeight;
    this.stageOuter.appendChild(c);
    const ctx = c.getContext("2d");
    const ps = new ParticleSystem();
    ps.confetti(x, y, 40);
    let last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, c.width, c.height);
      ps.update(dt); ps.render(ctx);
      if (ps.particles.length) requestAnimationFrame(loop); else c.remove();
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ LIFECYCLE --
  start() {
    this.state = "playing";
    this.overlayEl.hidden = true;
    this.pauseBtn.disabled = false;
    this.score = 0;
    this._sessionSeconds = 0;
    this._playtimeFlushed = 0;
    saveManager.recordPlay(this.id);
    eventBus.emit("game:played", { gameId: this.id });
    audioManager.play("start");
    this._setupTouchControls();
    this.onStart?.(this.difficulty);
    this._lastT = performance.now();
    this._loop();
  }

  togglePause() { this.state === "playing" ? this.pause() : this.state === "paused" && this.resume(); }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    audioManager.play("pause");
    this.onPause?.();
    this.showPauseOverlay();
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.overlayEl.hidden = true;
    this._lastT = performance.now();
    this.onResume?.();
    this._loop();
  }

  async confirmRestart() {
    audioManager.play("click");
    this.restart();
  }

  restart() {
    this._flushPlaytime();
    this.onDestroyRound?.();
    this.overlayEl.hidden = true;
    this.pauseBtn.disabled = false;
    this.start();
  }

  endGame({ result = "score", score = this.score, message, extraStats = [], statsPatch } = {}) {
    if (this.state === "ended") return;
    this.state = "ended";
    this._flushPlaytime();
    const isHighScore = saveManager.recordScore(this.id, score);
    if (result === "win" || result === "loss" || result === "draw") saveManager.recordResult(this.id, result);
    if (statsPatch) Object.assign(saveManager.ensureGame(this.id).custom, statsPatch);
    saveManager.ensureGame(this.id).completed = true;
    saveManager.save();
    eventBus.emit("game:score", { gameId: this.id, score });
    if (result === "win" || result === "loss") eventBus.emit("game:result", { gameId: this.id, result });
    audioManager.play(result === "win" ? "win" : result === "loss" ? "lose" : "gameover");
    this.showEndOverlay({ result, isHighScore, message, extraStats });
    cancelAnimationFrame(this._raf);
  }

  // --------------------------------------------------------------- LOOP ----
  _loop() {
    if (this.state !== "playing") return;
    const now = performance.now();
    let dt = (now - this._lastT) / 1000;
    dt = Math.min(dt, 0.05); // clamp to avoid spiral-of-death on tab switch
    this._lastT = now;
    this._sessionSeconds += dt;
    if (this._sessionSeconds - this._playtimeFlushed > 5) this._flushPlaytime();
    this._watchFrameBudget(dt);

    this.onUpdate?.(dt);
    this.onRender?.(this.ctx, dt);
    this.input.endFrame();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  /**
   * Rolling frame-time monitor. If a device spends more than ~22ms per frame
   * across a sustained window, the graphics kit drops glows and grain so the
   * simulation keeps its 60fps budget. It steps back up if the device recovers.
   */
  _watchFrameBudget(dt) {
    if (!this._frameSamples) { this._frameSamples = []; this._qualityChecked = 0; }
    this._frameSamples.push(dt);
    if (this._frameSamples.length < 90) return;
    const avg = this._frameSamples.reduce((a, b) => a + b, 0) / this._frameSamples.length;
    this._frameSamples.length = 0;
    if (avg > 0.022 && this.gfx.quality === "high") this.gfx.setQuality("low");
    else if (avg < 0.014 && this.gfx.quality === "low") this.gfx.setQuality("high");
  }

  _flushPlaytime() {
    const delta = this._sessionSeconds - this._playtimeFlushed;
    if (delta <= 0) return;
    this._playtimeFlushed = this._sessionSeconds;
    saveManager.addPlaytime(this.id, delta);
    eventBus.emit("game:playtime", { gameId: this.id, seconds: delta });
  }

  // -------------------------------------------------------- TOUCH CONTROL --
  _setupTouchControls() {
    this.touchEl.innerHTML = "";
    this.touchEl.classList.remove("active");
    const layout = this.getTouchLayout?.() || "none";
    if (!this.input.isTouch && layout !== "swipe-only-hint") return;
    if (layout === "dpad") this.input.buildDPad(this.touchEl, { buttons: this.getTouchButtons?.() || ["a"] });
    else if (layout === "single") this.input.buildSingleButton(this.touchEl, this.getTouchIcon?.() || "▲");
    // "swipe" and "none" layouts need no injected DOM controls.
  }

  // --------------------------------------------------------------- UTILS ---
  shake() {
    if (!saveManager.data.settings.screenShake) return;
    this.stageOuter.classList.remove("shake");
    void this.stageOuter.offsetWidth;
    this.stageOuter.classList.add("shake");
  }

  vibrateOn(pattern) { import("../core/utils.js").then(({ vibrate }) => vibrate(pattern)); }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    this._flushPlaytime();
    document.removeEventListener("visibilitychange", this._onVisibility);
    window.removeEventListener("resize", this._onWindowResize);
    window.removeEventListener("orientationchange", this._onWindowResize);
    this._resizeObs?.disconnect();
    this.onDestroy?.();
    this.input.destroy();
  }
}

function controlRow(label, text) {
  return el("div", { class: "howto-row" }, [
    el("span", { class: "k" }, label),
    el("span", { class: "v" }, text),
  ]);
}

function iconButton(name, title, onClick) {
  const btn = el("button", { class: "icon-btn", title, "aria-label": title, onClick });
  btn.innerHTML = iconMarkup(name);
  return btn;
}
function iconLink(name, title, href) {
  const a = el("a", { class: "icon-btn", title, "aria-label": title, href });
  a.innerHTML = iconMarkup(name);
  return a;
}
function labelledButton(iconName, label, className, onClick) {
  const btn = el("button", { class: className, onClick });
  btn.innerHTML = iconMarkup(iconName);
  btn.appendChild(document.createTextNode(label));
  return btn;
}
function labelledLink(iconName, label, className, href) {
  const a = el("a", { class: className, href });
  a.innerHTML = iconMarkup(iconName);
  a.appendChild(document.createTextNode(label));
  return a;
}

function statBlock(label, value) {
  return el("div", { class: "s" }, [el("b", {}, String(value)), el("span", {}, label)]);
}

export { formatTime, formatNumber };
export default GameBase;
