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
    document.addEventListener("fullscreenchange", this._onFsChange = () => {
      if (!document.fullscreenElement) this._immersive(false);
      this._syncFullscreenUI();
      this._afterFullscreenChange();
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
        this.fsBtn = iconButton("expand", "Fullscreen", () => this.toggleFullscreen()),
        this.pauseBtn = iconButton("pause", "Pause", () => this.togglePause()),
        iconButton("restart", "Restart", () => this.confirmRestart()),
        iconLink("close", "Back to Library", "#/library"),
      ]),
    ]);

    this.stageOuter = el("div", { class: "game-stage-outer" });
    this.stageEl = el("div", { class: "game-stage" + (g.domBoard ? " dom-board" : "") });
    this.touchEl = el("div", { class: "touch-controls" });
    this.overlayEl = el("div", { class: "game-overlay", hidden: true });
    this.stageOuter.append(this.stageEl, this.overlayEl);

    this.tipEl = el("p", { class: "game-tip" }, "Tip: press P to pause anytime.");

    this.root.append(this.hud, this.stageOuter, this.touchEl, this.tipEl);
    this.setHud({ Score: 0 });

    this._fitStage();
    this._onWindowResize = () => { this._layoutTouchControls(); this._fitStage(); };
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
    const full = this.isFullscreen?.();
    const rotated = this._applyRotation();
    const mobile = window.matchMedia("(max-width: 780px)").matches;
    // When the surface is turned sideways, "screen height" is the width.
    const screenW = rotated ? window.innerHeight : window.innerWidth;
    const screenH = rotated ? window.innerWidth : window.innerHeight;

    // Fullscreen drops the desktop width cap: the point is to fill the screen.
    const cap = full ? Infinity : (this.meta.wide ? 980 : 860);
    const maxW = Math.min(this.root.clientWidth || screenW, cap);

    const hudH = this.hud?.offsetHeight || 0;
    const band = this.touchEl?.classList.contains("band") ? (this.touchEl.offsetHeight || 148) : 0;
    let maxH;
    if (full) {
      maxH = Math.max(180, (screenH || 600) - hudH - band - 20);
    } else {
      const rect = this.stageOuter.getBoundingClientRect();
      // rect.top is viewport-relative; when the page is scrolled fall back to
      // a conservative estimate of the chrome above the stage.
      const above = rect.top > 0 ? rect.top : 150;
      // On phones the bottom nav is hidden while playing, so the stage can
      // claim almost everything below the HUD.
      const reserve = mobile ? 18 : 34;
      maxH = Math.max(200, screenH - above - reserve - band);
    }

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
    // offsetWidth/Height are layout-space. getBoundingClientRect() would
    // report the *transformed* box, so in rotated fullscreen the canvas came
    // out with its width and height swapped and was then letterboxed down to
    // a fraction of the stage.
    const w = this.stageEl.offsetWidth || this.stageEl.getBoundingClientRect().width;
    const h = this.stageEl.offsetHeight || this.stageEl.getBoundingClientRect().height;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.dpr = dpr;
    this.viewW = w; this.viewH = h;
    this.onResize?.(w, h);
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
  /**
   * Start / pause / end screens hide the on-screen controls: a d-pad floating
   * over a "Game Over" panel is both ugly and tappable by accident.
   */
  _setOverlay(visible) {
    this.overlayEl.hidden = !visible;
    this.root.classList.toggle("overlay-open", visible);
  }

  showStartOverlay() {
    this.state = "idle";
    const gameData = saveManager.ensureGame(this.id);
    const diffs = this.getDifficulties?.() || ["Normal"];
    const instructions = this.getInstructions?.() || ["Have fun!"];
    const controlsLine = this.input.isTouch ? (this.getTouchHint?.() || "Use the on-screen controls.") : (this.getKeyboardHint?.() || "Use your keyboard / mouse to play.");
    const upgrades = this.getUpgrades?.();

    this._setOverlay(true);
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
        // Games with permanent between-run upgrades expose their shop here.
        upgrades
          ? labelledButton("sparkles", `Upgrades (${upgrades.cfg.icon} ${formatNumber(upgrades.currency)})`,
              "btn btn-ghost btn-lg", () => upgrades.openShop(() => this.showStartOverlay()))
          : null,
      ]),
      el("ul", { class: "instructions" }, [...instructions.map(i => el("li", {}, i)), el("li", {}, controlsLine)]),
    );
  }

  showPauseOverlay() {
    this._setOverlay(true);
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
    this._setOverlay(true);
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

  // ----------------------------------------------------------- FULLSCREEN --
  /**
   * Native fullscreen where the browser allows it, with a CSS "immersive"
   * fallback everywhere else — iOS Safari refuses element fullscreen, and
   * that is exactly the device where filling the screen matters most.
   */
  toggleFullscreen() {
    audioManager.play("click");
    if (this.isFullscreen()) this.exitFullscreen();
    else this.enterFullscreen();
  }

  isFullscreen() {
    return document.fullscreenElement === this.root || document.body.classList.contains("immersive");
  }

  enterFullscreen() {
    const done = () => { this._syncFullscreenUI(); this._afterFullscreenChange(); };
    // A natively fullscreened element cannot be transformed — the UA
    // stylesheet pins its size and clears transforms — so whenever we intend
    // to turn the surface sideways we use our own immersive mode instead.
    if (this.root.requestFullscreen && !this._rotationUseful()) {
      this.root.requestFullscreen({ navigationUI: "hide" })
        .then(done)
        .catch(() => { this._immersive(true); done(); });
    } else {
      this._immersive(true);
      done();
    }
    // Landscape suits almost every game better on a phone; browsers that
    // reject the request just carry on in whatever orientation they are in.
    screen.orientation?.lock?.("landscape").catch(() => {});
  }

  exitFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    this._immersive(false);
    screen.orientation?.unlock?.();
    this._syncFullscreenUI();
    this._afterFullscreenChange();
  }

  _immersive(on) {
    document.body.classList.toggle("immersive", on);
    this.root.classList.toggle("immersive-target", on);
    if (!on) this._applyRotation(false);
  }

  /**
   * A 16:9 game on an upright phone gets about a quarter of the screen. In
   * fullscreen we therefore turn the whole play surface sideways, which is
   * what a player would do with the device anyway. DOM buttons keep working
   * through the CSS transform; the canvas gets its coordinates un-rotated by
   * the input controller.
   */
  /** Geometry only: would turning the surface sideways actually help here? */
  _rotationUseful() {
    // _fitStage runs from _buildShell, before the input controller exists.
    if (!this.input?.isTouch) return false;
    const [rw, rh] = String(this.meta.ratio || "4/3").split("/").map(Number);
    const gameRatio = rw && rh ? rw / rh : 4 / 3;
    return gameRatio > 1.2 && window.innerHeight > window.innerWidth * 1.05;
  }

  _wantsRotation() { return this.isFullscreen() && this._rotationUseful(); }

  _applyRotation(want = this._wantsRotation()) {
    const rotate = !!want;
    if (rotate === this._rotated) return rotate;
    this._rotated = rotate;
    this.root.classList.toggle("rotated", rotate);
    if (rotate) {
      const W = window.innerWidth, H = window.innerHeight;
      Object.assign(this.root.style, {
        width: `${H}px`, height: `${W}px`,
        left: `${(W - H) / 2}px`, top: `${(H - W) / 2}px`,
      });
    } else {
      Object.assign(this.root.style, { width: "", height: "", left: "", top: "" });
    }
    this.input?.setStageRotation?.(rotate ? 90 : 0);
    return rotate;
  }

  _syncFullscreenUI() {
    if (!this.fsBtn) return;
    const on = this.isFullscreen();
    this.fsBtn.innerHTML = iconMarkup(on ? "collapse" : "expand");
    this.fsBtn.title = on ? "Exit fullscreen" : "Fullscreen";
    this.fsBtn.setAttribute("aria-label", this.fsBtn.title);
  }

  /** The stage has to be re-measured once the browser has resized us. */
  _afterFullscreenChange() {
    requestAnimationFrame(() => {
      this._layoutTouchControls();
      this._fitStage();
      this._resizeCanvas?.();
      this._resize3D?.();
    });
    setTimeout(() => {
      this._fitStage();
      this._resizeCanvas?.();
      this._resize3D?.();
    }, 260);
  }

  // ------------------------------------------------------------ LIFECYCLE --
  start() {
    this.state = "playing";
    this._setOverlay(false);
    this.pauseBtn.disabled = false;
    this.score = 0;
    this._sessionSeconds = 0;
    this._playtimeFlushed = 0;
    saveManager.recordPlay(this.id);
    eventBus.emit("game:played", { gameId: this.id });
    audioManager.play("start");
    // On a phone the windowed stage is a small letterbox in a tall page, so
    // starting a game goes straight to fullscreen. The Start button click is
    // the user gesture browsers require, and the HUD button toggles back.
    if (this.input.isTouch && window.matchMedia("(max-width: 780px)").matches && !this.isFullscreen()) {
      try { this.enterFullscreen(); } catch { /* not fatal — play windowed */ }
    }
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
    this._setOverlay(false);
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
    this._setOverlay(false);
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
    this.touchEl.classList.remove("active", "band");
    const layout = this.getTouchLayout?.() || "none";
    if (!this.input.isTouch && layout !== "swipe-only-hint") return;
    if (layout === "dpad") this.input.buildDPad(this.touchEl, { buttons: this.getTouchButtons?.() || ["a"] });
    else if (layout === "single") this.input.buildSingleButton(this.touchEl, this.getTouchIcon?.() || "▲");
    else return;  // "swipe" and "none" layouts need no injected DOM controls.

    this._layoutTouchControls();
  }

  /**
   * On a portrait screen the controls get their own band under the stage
   * instead of sitting on top of the playfield; in landscape there is no
   * room for that, so they overlay the stage as before.
   */
  _layoutTouchControls() {
    if (!this.touchEl.firstChild) return;
    // Resolve rotation first: a sideways surface is landscape, whatever the
    // physical device is doing, and landscape has no room for a control band.
    const rotated = this._applyRotation();
    const portrait = !rotated && window.innerHeight >= window.innerWidth * 1.12;
    this.touchEl.classList.toggle("band", portrait);
    this.touchEl.classList.add("active");
    this._fitStage();
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
    document.removeEventListener("fullscreenchange", this._onFsChange);
    this._immersive(false);
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
