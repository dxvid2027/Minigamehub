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
  onSwipe(fn) { this._swipeCb = fn; }
  onTap(fn) { this._tapCb = fn; }

  // Builds a virtual D-pad + action buttons inside `container` (a .touch-controls element).
  buildDPad(container, { buttons = ["a"] } = {}) {
    container.innerHTML = "";
    container.classList.add("active");
    const dpad = document.createElement("div");
    dpad.className = "zone dpad";
    const dirs = [["up", "▲", "up"], ["left", "◀", "left"], ["right", "▶", "right"], ["down", "▼", "down"]];
    dirs.forEach(([cls, label]) => {
      const b = document.createElement("button");
      b.className = cls; b.textContent = label; b.type = "button";
      b.setAttribute("aria-label", cls);
      this._bindHold(b, () => this.virtual[cls] = true, () => this.virtual[cls] = false);
      dpad.appendChild(b);
    });
    container.appendChild(dpad);

    if (buttons.length) {
      const wrap = document.createElement("div");
      wrap.className = "zone action-btns";
      const labels = { a: "●", b: "■" };
      buttons.forEach(key => {
        const b = document.createElement("button");
        b.className = key; b.textContent = labels[key] || key.toUpperCase(); b.type = "button";
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
    this._cleanupPointer?.();
    this.keys.clear();
  }
}

export function createInput(stageEl) { return new InputController(stageEl); }
export default InputController;
