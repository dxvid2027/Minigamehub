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
import { openModal, closeModal, confirmModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { spriteURL } from "./sprites.js";

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
        // Campaign games get a level button here, so the picker is reachable
        // mid-run and not only from the start screen.
        this.levelBtn = iconButton("grid", "Levels", () => this.openLevelSelect()),
        this.inputBtn = iconButton("keyboard", "Controls", () => this.cycleInputMode()),
        // Games that keep long-run progress let you stop and bank it rather
        // than having to lose on purpose or throw the run away.
        this.bankBtn = iconButton("save", "Save & quit", () => this.confirmBankAndQuit()),
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
    // The controls button shows which mode is live, so it needs the first sync.
    queueMicrotask(() => { this._syncInputModeUI(); this._syncBankButton(); this._syncLevelButton(); });
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
      const b = el("b", {});
      // A field may hand over pips instead of text — lives as drawn hearts,
      // for instance — which text alone cannot express.
      if (value && typeof value === "object" && value.pips !== undefined) {
        b.className = "pip-row";
        for (let i = 0; i < value.pips; i++) {
          b.appendChild(el("i", {
            class: "hud-pip",
            style: `background-image:url(${spriteURL(value.sprite || "heart", 48)})`,
          }));
        }
        if (!value.pips) b.textContent = "—";
      } else {
        b.textContent = String(value);
      }
      this.hudStatsEl.appendChild(el("div", { class: "hud-stat" }, [b, el("span", {}, label)]));
    }
  }

  /** Lives as drawn hearts rather than a repeated emoji. */
  static hearts(n) { return { pips: Math.max(0, Math.floor(n)), sprite: "heart" }; }

  setScore(n) { this.score = n; this.setHud({ Score: formatNumber(this.score) }); }
  addScore(n) { this.setScore(this.score + n); }

  // -------------------------------------------------------- LEVEL NAV ------
  /**
   * Campaign contract. A game with numbered levels returns a descriptor here
   * and gets the whole menu for free: a picker in the HUD, "Next level" on the
   * win screen, and a jump list from the pause screen. Everything is optional
   * except `count` and `goTo` — the rest falls back to sensible defaults, so a
   * game with nothing but a level count still gets a working picker.
   *
   *   {
   *     index,                  // zero-based level currently loaded
   *     count,                  // how many there are
   *     label,                  // singular noun: "Vault", "Level", "Track"
   *     title,                  // picker heading (defaults to label + "s")
   *     intro,                  // one line under the heading
   *     unlocked(i) -> bool,    // default: everything up to the first unbeaten
   *     cleared(i)  -> truthy,  // shown as the "done" state
   *     note(i)     -> string,  // small line under the number
   *     goTo(i)                 // load level i and start it
   *   }
   */
  getLevelNav() { return null; }

  /** Normalised nav, or null. Every consumer below goes through this. */
  _nav() {
    const raw = this.getLevelNav?.();
    if (!raw || !raw.count || typeof raw.goTo !== "function") return null;
    const label = raw.label || "Level";
    return {
      index: raw.index || 0,
      count: raw.count,
      label,
      title: raw.title || `${label}s`,
      intro: raw.intro || "",
      cleared: raw.cleared || (() => false),
      unlocked: raw.unlocked || ((i) => i === 0 || !!(raw.cleared || (() => false))(i - 1)),
      note: raw.note || null,
      goTo: raw.goTo,
    };
  }

  _syncLevelButton() {
    if (!this.levelBtn) return;
    const nav = this._nav();
    this.levelBtn.hidden = !nav;
    if (nav) this.levelBtn.title = this.levelBtn.ariaLabel = `${nav.title} (${nav.index + 1}/${nav.count})`;
  }

  /** The next level, or null when there is none or it is still locked. */
  _nextLevel() {
    const nav = this._nav();
    if (!nav) return null;
    const i = nav.index + 1;
    if (i >= nav.count || !nav.unlocked(i)) return null;
    return { nav, i };
  }

  nextLevel() {
    const next = this._nextLevel();
    if (!next) return;
    audioManager.play("click");
    this._flushPlaytime();
    this.onDestroyRound?.();
    this._setOverlay(false);
    this.pauseBtn.disabled = false;
    next.nav.goTo(next.i);
    this._syncLevelButton();
  }

  /**
   * One picker for every campaign game. Levels you have not reached are shown
   * but disabled, so the shape of what is left is always visible.
   */
  openLevelSelect() {
    const nav = this._nav();
    if (!nav) return;
    audioManager.play("click");
    // Opening the picker mid-run pauses; closing it without picking resumes.
    // `jumped` keeps the close handler from resuming a run we just replaced.
    const wasPlaying = this.state === "playing";
    let jumped = false;
    if (wasPlaying) this.pause();

    const grid = el("div", { class: "level-grid" });
    for (let i = 0; i < nav.count; i++) {
      const open = nav.unlocked(i);
      const done = nav.cleared(i);
      const here = i === nav.index && this.state !== "idle";
      const note = nav.note ? nav.note(i) : (done ? "Cleared" : open ? "Open" : "Locked");
      grid.appendChild(el("button", {
        class: `level-card${open ? "" : " locked"}${done ? " done" : ""}${here ? " here" : ""}`,
        disabled: !open,
        onClick: () => {
          jumped = true;
          closeModal();
          this._flushPlaytime();
          this.onDestroyRound?.();
          this._setOverlay(false);
          this.pauseBtn.disabled = false;
          nav.goTo(i);
          this._syncLevelButton();
        },
      }, [
        el("span", { class: "n" }, String(i + 1)),
        el("span", { class: "st" }, String(note)),
        done ? el("span", { class: "tick" }, "\u2713") : null,
      ]));
    }

    openModal({
      title: nav.title,
      bodyNode: el("div", { class: "level-picker" }, [
        nav.intro ? el("p", { class: "zone-intro" }, nav.intro) : null,
        grid,
      ]),
      footerNode: el("button", {
        class: "btn btn-ghost",
        onClick: () => closeModal(),
      }, wasPlaying ? "Keep playing" : "Back"),
      // Resuming lives here alone, so the Escape key, the backdrop and the
      // footer button all take the same path.
      onClose: () => { if (!jumped && wasPlaying && this.state === "paused") this.resume(); },
    });
  }

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
    const controlsLine = this.useTouch ? (this.getTouchHint?.() || "Use the on-screen controls.") : (this.getKeyboardHint?.() || "Use your keyboard / mouse to play.");
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
      // A game may add its own block here — Bastion TD puts its level picker
      // in it, which needs to sit above the difficulty chips.
      this.getStartExtras?.() || null,
      diffs.length > 1 ? el("div", { class: "diff-row" }, diffs.map(d => el("button", {
        class: `chip${d === this.difficulty ? " active" : ""}`,
        onClick: (e) => { this.difficulty = d; [...e.target.parentNode.children].forEach(c => c.classList.remove("active")); e.target.classList.add("active"); audioManager.play("select"); },
      }, d))) : null,
      el("div", { class: "overlay-actions" }, [
        // A game may take over the play button — Bastion TD opens its map
        // picker rather than dropping you straight onto whichever map you
        // happened to leave the campaign pointer on.
        labelledButton("play", this.getPlayLabel?.() || "Start Game", "btn btn-primary btn-lg",
          () => (this.onPlayPressed ? this.onPlayPressed() : this.start())),
        // A campaign game always offers the picker next to the play button,
        // even when its play button drops you straight into the current level.
        this._nav() && !this.onPlayPressed
          ? labelledButton("grid", this._nav().title, "btn btn-ghost btn-lg", () => this.openLevelSelect())
          : null,
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
        this._nav() ? labelledButton("grid", this._nav().title, "btn btn-ghost", () => this.openLevelSelect()) : null,
        labelledLink("library", "Exit to Library", "btn btn-outline", "#/library"),
      ]),
    );
  }

  showEndOverlay({ result = "score", isHighScore = false, title, message, extraStats = [] } = {}) {
    this.state = "ended";
    this._syncBankButton();
    this.pauseBtn.disabled = true;
    const icon = result === "win" ? "🎉" : result === "loss" ? "💀" : "🏁";
    const nav = this._nav();
    // Only a win advances; losing a level and being offered the next one
    // would let you skip past anything you could not beat.
    const next = result === "win" ? this._nextLevel() : null;
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
        // Winning a level puts the next one under the thumb: replaying the one
        // you just beat is the rarer thing to want, so it steps back a rank.
        next
          ? labelledButton("arrowRight", `${nav.label} ${next.i + 1}`, "btn btn-primary btn-lg", () => this.nextLevel())
          : null,
        labelledButton("restart", next ? "Replay" : "Play Again",
          next ? "btn btn-ghost btn-lg" : "btn btn-primary btn-lg", () => this.restart()),
        nav ? labelledButton("grid", nav.title, "btn btn-ghost", () => this.openLevelSelect()) : null,
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

  // ----------------------------------------------------------- INPUT MODE --
  /**
   * Whether to play this session with on-screen controls.
   *
   * Device sniffing alone gets this wrong in both directions — a laptop with a
   * touchscreen reports touch and never needs a d-pad, a tablet in a keyboard
   * case is the reverse — so the detected value is only the default and the
   * player's explicit choice always wins.
   */
  get useTouch() {
    const mode = saveManager.data.settings.inputMode || "auto";
    if (mode === "keyboard") return false;
    if (mode === "touch") return true;
    return !!this.input?.isTouch;
  }

  /** Cycles auto -> keyboard -> touch and re-lays the controls out. */
  cycleInputMode() {
    const order = ["auto", "keyboard", "touch"];
    const cur = saveManager.data.settings.inputMode || "auto";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    saveManager.data.settings.inputMode = next;
    saveManager.save();
    audioManager.play("toggle");
    this.applyInputMode();
    eventBus.emit("settings:inputMode", { mode: next });
    toast({
      type: "info", title: "Controls",
      message: next === "auto" ? `Automatic — this device is treated as ${this.useTouch ? "touch" : "keyboard"}.`
        : next === "touch" ? "On-screen controls, always shown."
        : "Keyboard and mouse. On-screen buttons are hidden.",
      duration: 2600,
    });
    return next;
  }

  /** Rebuilds (or removes) the on-screen controls for the current mode. */
  applyInputMode() {
    this._syncInputModeUI();
    this._setupTouchControls();
    if (!this.useTouch) {
      // Leaving touch mode must also undo the sideways surface: rotation only
      // ever exists to make room for thumbs.
      this._applyRotation(false);
    }
    this._layoutTouchControls();
    this._fitStage();
    this._resizeCanvas?.();
    this._resize3D?.();
  }

  _syncInputModeUI() {
    if (!this.inputBtn) return;
    const mode = saveManager.data.settings.inputMode || "auto";
    const label = mode === "auto" ? `Controls: automatic (${this.useTouch ? "touch" : "keyboard"})`
      : mode === "touch" ? "Controls: touch" : "Controls: keyboard";
    this.inputBtn.innerHTML = iconMarkup(this.useTouch ? "touch" : "keyboard");
    this.inputBtn.title = label;
    this.inputBtn.setAttribute("aria-label", label);
    this.inputBtn.classList.toggle("mode-forced", mode !== "auto");
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
    if (!this.useTouch) return false;
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
      if (this.touchEl.classList.contains("overlay")) this._pinOverlayToStage();
    }, 260);
  }

  /**
   * Ends the run now and keeps everything it earned.
   *
   * `bankAndQuit()` is what a game implements: it should settle its own
   * currency and call endGame, exactly as it would on a loss. Games that do
   * not implement it never show the button.
   */
  async confirmBankAndQuit() {
    if (this.state !== "playing" && this.state !== "paused") return;
    if (!this.bankAndQuit) return;
    const wasPlaying = this.state === "playing";
    if (wasPlaying) this.pause();
    audioManager.play("click");
    const ok = await confirmModal({
      title: "Save & quit",
      message: "This ends the run here. Your score counts and everything you earned is banked, exactly as if the run had ended on its own.",
      confirmLabel: "Save & quit",
    });
    if (!ok) { if (wasPlaying) this.resume(); return; }
    // bankAndQuit finishes through endGame, which needs a live run to settle.
    this.state = "playing";
    this.bankAndQuit();
  }

  _syncBankButton() {
    if (!this.bankBtn) return;
    const usable = !!this.bankAndQuit;
    this.bankBtn.hidden = !usable;
    this.bankBtn.disabled = !usable || (this.state !== "playing" && this.state !== "paused");
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
    // Deliberately NOT auto-fullscreen. Forcing a phone into the sideways
    // immersive surface the moment Start is pressed turned two games into
    // something players read as broken: the picture goes sideways unasked and
    // the controls end up over the playfield. Fullscreen is the button next
    // to pause, pressed when the player wants it.
    this._setupTouchControls();
    this._syncBankButton();
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
    this.touchEl.classList.remove("active", "band", "overlay");
    this.touchEl.style.cssText = "";
    const layout = this.getTouchLayout?.() || "none";
    if (!this.useTouch && layout !== "swipe-only-hint") return;
    if (layout === "stick") {
      this.input.buildStick(this.touchEl, {
        buttons: this.getTouchButtons?.() || ["a"],
        labels: this.getTouchButtonLabels?.() || {},
      });
    } else if (layout === "dpad") {
      this.input.buildDPad(this.touchEl, {
        buttons: this.getTouchButtons?.() || ["a"],
        labels: this.getTouchButtonLabels?.() || {},
      });
    } else if (layout === "single") {
      this.input.buildSingleButton(this.touchEl, this.getTouchIcon?.() || "▲");
    } else {
      return;  // "swipe" and "none" layouts need no injected DOM controls.
    }

    this._layoutTouchControls();
  }

  /**
   * Controls get their own band under the stage rather than sitting on top of
   * the playfield. Overlaying them was the single worst thing about the phone
   * build: on a small stage a d-pad covers a third of the picture, and in the
   * sideways surface it landed squarely over the player.
   *
   * The one exception is the analog stick used by the 3D games, where a
   * translucent stick in the bottom corners is the expected idiom and the
   * game is built to keep its action away from them.
   */
  _layoutTouchControls() {
    if (!this.touchEl.firstChild) return;
    // Resolve rotation first: it changes which way round the surface is.
    this._applyRotation();
    // A stick belongs on the stage only when the stage actually fills the
    // screen. In a windowed portrait phone the game is a letterbox with dead
    // space under it, and putting the controls in that dead space covers
    // nothing at all — strictly better than floating them over the picture.
    // Decided from the surface, not from a measured stage: the stage is sized
    // by _fitStage against whatever band we ask for, so measuring it here to
    // choose the band would be circular.
    const stickLayout = (this.getTouchLayout?.() || "none") === "stick";
    // The viewport, not the wrapper: the wrapper is only as tall as its
    // content, so it reads as "wide" even on an upright phone.
    const wide = window.innerWidth > window.innerHeight;
    const overlay = stickLayout && (wide || this.isFullscreen());
    this.touchEl.classList.toggle("band", !overlay);
    this.touchEl.classList.toggle("overlay", overlay);
    this.touchEl.classList.add("active");
    this._fitStage();
    if (overlay) this._pinOverlayToStage();
  }

  /**
   * Pins the overlay controls onto the stage's own box.
   *
   * They used to be positioned against the whole play surface, which put the
   * stick over the middle of the picture as soon as the surface was taller
   * than the stage — and in the sideways fullscreen it landed on the player.
   * Measured in layout space (offset*, not getBoundingClientRect) so it stays
   * right when the surface is rotated.
   */
  _pinOverlayToStage() {
    const st = this.stageEl;
    if (!st?.offsetWidth) return;
    let left = 0, top = 0, node = st;
    while (node && node !== this.root) { left += node.offsetLeft; top += node.offsetTop; node = node.offsetParent; }
    Object.assign(this.touchEl.style, {
      left: `${left}px`, top: `${top}px`,
      width: `${st.offsetWidth}px`, height: `${st.offsetHeight}px`,
      right: "auto", bottom: "auto",
    });
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
    // Leaving a game leaves fullscreen — both kinds. Dropping only the CSS
    // immersive class left a natively fullscreened browser stuck on the
    // library page with no way back except the Esc key.
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    screen.orientation?.unlock?.();
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
