// ==========================================================================
// InputManager — per-game input controller abstracting keyboard, pointer,
// swipe-gesture and on-screen virtual controls behind one small API so a
// game never has to branch on device type itself.
// ==========================================================================
import { isTouchDevice } from "../core/utils.js";

export class InputController {
  constructor(stageEl) {
    this.stageEl = stageEl;
    this.keys = new Set();
    this.pressedThisFrame = new Set();
    this._keyHandlers = [];
    this._pointerHandlers = [];
    this._swipeCb = null;
    this._tapCb = null;
    this.pointer = { x: 0, y: 0, down: false };
    this.virtual = { up: false, down: false, left: false, right: false, a: false, b: false };
    // Taps on the on-screen controls, latched until a game reads them. A tap
    // can be shorter than a frame, so a game that only samples "is it held
    // down" during its update never sees one — which is why the d-pad did
    // nothing in the turn-based games. This queue survives until consumed.
    this.virtualTaps = new Set();
    this._touchStart = null;
    this._rot = 0;   // stage rotation in degrees; see setStageRotation()
    this._onKeyDown = (e) => {
      const code = e.code || e.key;
      if (!this.keys.has(code)) this.pressedThisFrame.add(code);
      this.keys.add(code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", " "].includes(code)) e.preventDefault();
      this._keyHandlers.forEach(h => h.on === "down" && h.code === code && h.fn(e));
    };
    this._onKeyUp = (e) => {
      const code = e.code || e.key;
      this.keys.delete(code);
      this._keyHandlers.forEach(h => h.on === "up" && h.code === code && h.fn(e));
    };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);

    if (stageEl) this._bindPointer(stageEl);
  }

  get isTouch() { return isTouchDevice(); }

  onKey(code, fn, on = "down") { this._keyHandlers.push({ code, fn, on }); }
  isDown(...codes) { return codes.some(c => this.keys.has(c)); }
  /**
   * One press of an on-screen button, consumed. Use this instead of `isDown`
   * wherever a press means a discrete action — a step on a grid, a card
   * flipped — rather than a direction held.
   */
  consumeTap(name) {
    if (!this.virtualTaps.has(name)) return false;
    this.virtualTaps.delete(name);
    return true;
  }
  consumePressed(code) {
    if (this.pressedThisFrame.has(code)) { this.pressedThisFrame.delete(code); return true; }
    return false;
  }
  endFrame() { this.pressedThisFrame.clear(); }

  /**
   * Tells the controller that the stage is displayed rotated (fullscreen on a
   * portrait phone turns landscape games sideways). DOM buttons are hit-tested
   * through the CSS transform by the browser, but canvas coordinates are not,
   * so pointer positions and swipe directions are un-rotated here.
   */
  setStageRotation(deg) { this._rot = ((deg % 360) + 360) % 360; }

  /** Client-space point to stage-local coordinates, undoing any rotation. */
  _toLocal(x, y) {
    const r = this.stageEl.getBoundingClientRect();
    if (!this._rot) return { x: x - r.left, y: y - r.top, w: r.width, h: r.height };
    // Rotation is about the centre, which the bounding box preserves; a
    // quarter turn also swaps the element's own width and height.
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = x - cx, dy = y - cy;
    const w = r.height, h = r.width;
    return this._rot === 90
      ? { x: dy + w / 2, y: -dx + h / 2, w, h }
      : { x: -dy + w / 2, y: dx + h / 2, w, h };
  }

  /** Rotates a client-space delta into stage space. */
  _rotateDelta(dx, dy) {
    if (this._rot === 90) return { dx: dy, dy: -dx };
    if (this._rot === 270) return { dx: -dy, dy: dx };
    return { dx, dy };
  }

  _bindPointer(el) {
    const move = (x, y) => {
      const l = this._toLocal(x, y);
      this.pointer.x = l.x;
      this.pointer.y = l.y;
      this.pointer.nx = l.x / l.w;
      this.pointer.ny = l.y / l.h;
    };
    const down = (e) => {
      this.pointer.down = true;
      const p = e.touches ? e.touches[0] : e;
      move(p.clientX, p.clientY);
      this._touchStart = { x: p.clientX, y: p.clientY, t: Date.now() };
      this._pointerHandlers.forEach(h => h.type === "down" && h.fn({ ...this.pointer }));
    };
    const moveHandler = (e) => {
      const p = e.touches ? e.touches[0] : e;
      move(p.clientX, p.clientY);
      this._pointerHandlers.forEach(h => h.type === "move" && h.fn({ ...this.pointer }));
    };
    const up = (e) => {
      this.pointer.down = false;
      this._pointerHandlers.forEach(h => h.type === "up" && h.fn({ ...this.pointer }));
      if (this._touchStart) {
        const p = e.changedTouches ? e.changedTouches[0] : e;
        const rawX = p.clientX - this._touchStart.x, rawY = p.clientY - this._touchStart.y;
        const { dx, dy } = this._rotateDelta(rawX, rawY);
        const dt = Date.now() - this._touchStart.t;
        const dist = Math.hypot(dx, dy);
        if (dist > 32 && dt < 700) {
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
          this._swipeCb?.(dir, { dx, dy, dist });
        } else if (dist < 14 && dt < 350) {
          this._tapCb?.({ x: this.pointer.x, y: this.pointer.y });
        }
      }
      this._touchStart = null;
    };
    el.addEventListener("mousedown", down);
    el.addEventListener("mousemove", moveHandler);
    window.addEventListener("mouseup", up);
    el.addEventListener("touchstart", (e) => { down(e); }, { passive: true });
    el.addEventListener("touchmove", (e) => { moveHandler(e); }, { passive: true });
    el.addEventListener("touchend", up, { passive: true });
    this._cleanupPointer = () => {
      el.removeEventListener("mousedown", down);
      el.removeEventListener("mousemove", moveHandler);
      window.removeEventListener("mouseup", up);
    };
  }

  onPointer(type, fn) { this._pointerHandlers.push({ type, fn }); }

  /**
   * One movement vector from whatever the player is actually using — arrows,
   * WASD, the analog stick or the d-pad. Screen convention: +x right, +y down.
   * Keys read as full deflection; the stick reads however far it is pushed.
   */
  axes() {
    let x = 0, y = 0;
    if (this.isDown("ArrowLeft", "KeyA")) x -= 1;
    if (this.isDown("ArrowRight", "KeyD")) x += 1;
    if (this.isDown("ArrowUp", "KeyW")) y -= 1;
    if (this.isDown("ArrowDown", "KeyS")) y += 1;
    const vx = this.virtual.axisX || 0, vy = this.virtual.axisY || 0;
    if (Math.abs(vx) > Math.abs(x)) x = vx;
    if (Math.abs(vy) > Math.abs(y)) y = vy;
    // D-pad layouts have no axes, so fall back to their booleans.
    if (!x) x = this.virtual.left ? -1 : this.virtual.right ? 1 : 0;
    if (!y) y = this.virtual.up ? -1 : this.virtual.down ? 1 : 0;
    return { x, y };
  }
  onSwipe(fn) { this._swipeCb = fn; }
  onTap(fn) { this._tapCb = fn; }

  // Builds a virtual D-pad + action buttons inside `container` (a .touch-controls element).
  /**
   * D-pad plus action buttons.
   *
   * Each direction sets its `virtual` flag *and* the arrow key it stands for.
   * Half the grid games ask `isDown("ArrowUp", "KeyW")` and never looked at
   * `virtual.up`, which meant their on-screen d-pad did nothing at all on a
   * phone — the buttons were drawn, pressed, and ignored. Feeding the key set
   * makes one d-pad work for every game regardless of which of the two it
   * reads, and `pressedThisFrame` makes `consumePressed` fire once per tap.
   *
   * Only the d-pad does this. The analog stick deliberately does not: an
   * injected key reads as a full-deflection ±1 and would flatten the stick
   * back into eight directions.
   */
  buildDPad(container, { buttons = ["a"], labels: customLabels = {} } = {}) {
    container.innerHTML = "";
    container.classList.add("active");
    const dpad = document.createElement("div");
    dpad.className = "zone dpad";
    const dirs = [["up", "▲", "ArrowUp"], ["left", "◀", "ArrowLeft"],
                  ["right", "▶", "ArrowRight"], ["down", "▼", "ArrowDown"]];
    dirs.forEach(([cls, label, code]) => {
      const b = document.createElement("button");
      b.className = cls; b.textContent = label; b.type = "button";
      b.setAttribute("aria-label", cls);
      this._bindHold(b,
        () => {
          this.virtual[cls] = true;
          this.virtualTaps.add(cls);
          if (!this.keys.has(code)) this.pressedThisFrame.add(code);
          this.keys.add(code);
        },
        () => { this.virtual[cls] = false; this.keys.delete(code); });
      dpad.appendChild(b);
    });
    container.appendChild(dpad);

    if (buttons.length) {
      const wrap = document.createElement("div");
      wrap.className = "zone action-btns";
      const labels = { a: "●", b: "■" };
      const codes = { a: "Space", b: "ShiftLeft" };
      buttons.forEach(key => {
        const b = document.createElement("button");
        b.className = key; b.textContent = customLabels[key] || labels[key] || key.toUpperCase();
        b.type = "button";
        if (customLabels[key]) b.classList.add("labelled");
        const code = codes[key];
        this._bindHold(b,
          () => {
            this.virtual[key] = true;
            this.virtualTaps.add(key);
            if (code) { if (!this.keys.has(code)) this.pressedThisFrame.add(code); this.keys.add(code); }
          },
          () => { this.virtual[key] = false; if (code) this.keys.delete(code); });
        wrap.appendChild(b);
      });
      container.appendChild(wrap);
    }
  }

  /**
   * Analog thumb stick plus action buttons — what a 3D game actually needs.
   *
   * A four-way d-pad cannot express "forward and slightly left", which is
   * most of moving in a 3D space, and it forces the thumb to hunt for a small
   * key. The stick reports a real vector in `virtual.axisX/axisY` and also
   * sets the four booleans, so games written against the d-pad keep working
   * unchanged. The base follows the first touch down inside its zone, so the
   * thumb never has to find it.
   */
  buildStick(container, { buttons = ["a"], labels: btnLabels = {} } = {}) {
    container.innerHTML = "";
    container.classList.add("active");
    this.virtual.axisX = 0;
    this.virtual.axisY = 0;

    const zone = document.createElement("div");
    zone.className = "zone stick-zone";
    const base = document.createElement("div");
    base.className = "stick-base";
    const knob = document.createElement("div");
    knob.className = "stick-knob";
    base.appendChild(knob);
    zone.appendChild(base);

    const RADIUS = 52;          // px of travel for a full-deflection reading
    let touchId = null, cx = 0, cy = 0;

    const setAxis = (x, y) => {
      this.virtual.axisX = x;
      this.virtual.axisY = y;
      // Mirror onto the booleans with a dead zone, so a resting thumb does
      // not creep the character forward.
      this.virtual.left = x < -0.28;
      this.virtual.right = x > 0.28;
      this.virtual.up = y < -0.28;
      this.virtual.down = y > 0.28;
      knob.style.transform = `translate(calc(-50% + ${x * RADIUS}px), calc(-50% + ${y * RADIUS}px))`;
    };

    const begin = (px, py) => {
      // Re-centre the stick under the thumb that grabbed it.
      const r = zone.getBoundingClientRect();
      cx = Math.min(Math.max(px, r.left + RADIUS + 8), r.right - RADIUS - 8);
      cy = Math.min(Math.max(py, r.top + RADIUS + 8), r.bottom - RADIUS - 8);
      base.style.left = `${cx - r.left}px`;
      base.style.top = `${cy - r.top}px`;
      base.classList.add("held");
      setAxis(0, 0);
    };
    const move = (px, py) => {
      const dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / RADIUS);
      setAxis((dx / d) * k, (dy / d) * k);
    };
    const end = () => {
      touchId = null;
      base.classList.remove("held");
      base.style.left = ""; base.style.top = "";
      setAxis(0, 0);
    };

    zone.addEventListener("touchstart", (e) => {
      if (touchId !== null) return;
      const t = e.changedTouches[0];
      touchId = t.identifier;
      begin(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        move(t.clientX, t.clientY);
        e.preventDefault();
      }
    }, { passive: false });
    const drop = (e) => {
      for (const t of e.changedTouches) if (t.identifier === touchId) end();
    };
    zone.addEventListener("touchend", drop);
    zone.addEventListener("touchcancel", drop);
    // Mouse, so the stick is testable and usable on a touch-mode desktop.
    zone.addEventListener("mousedown", (e) => { touchId = -1; begin(e.clientX, e.clientY); e.preventDefault(); });
    window.addEventListener("mousemove", this._stickMove = (e) => { if (touchId === -1) move(e.clientX, e.clientY); });
    window.addEventListener("mouseup", this._stickUp = () => { if (touchId === -1) end(); });

    container.appendChild(zone);

    if (buttons.length) {
      const wrap = document.createElement("div");
      wrap.className = "zone action-btns";
      const labels = { a: "●", b: "■", ...btnLabels };
      buttons.forEach(key => {
        const b = document.createElement("button");
        b.className = key; b.textContent = labels[key] || key.toUpperCase(); b.type = "button";
        b.setAttribute("aria-label", labels[key] ? String(labels[key]) : key);
        this._bindHold(b, () => this.virtual[key] = true, () => this.virtual[key] = false);
        wrap.appendChild(b);
      });
      container.appendChild(wrap);
    }
  }

  buildSingleButton(container, icon = "▲") {
    container.innerHTML = "";
    container.classList.add("active");
    const b = document.createElement("button");
    b.className = "single-btn"; b.type = "button"; b.textContent = icon;
    this._bindHold(b, () => this.virtual.a = true, () => this.virtual.a = false);
    container.appendChild(b);
  }

  _bindHold(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { onUp(); };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    el.addEventListener("mousedown", down);
    el.addEventListener("mouseup", up);
    el.addEventListener("mouseleave", up);
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    if (this._stickMove) window.removeEventListener("mousemove", this._stickMove);
    if (this._stickUp) window.removeEventListener("mouseup", this._stickUp);
    this._cleanupPointer?.();
    this.keys.clear();
  }
}

export function createInput(stageEl) { return new InputController(stageEl); }
export default InputController;
