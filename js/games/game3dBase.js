// ==========================================================================
// Game3D — bridges the WebGL renderer into the existing game framework.
//
// A 3D game gets the same start/pause/win/lose screens, HUD, save hooks,
// achievements and touch controls as every other game; the only difference
// is that it renders through Engine3D instead of a 2D context.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { Engine3D, Geometry, Textures, M4, V3 } from "./engine3d.js";
import { el } from "../core/utils.js";

export class Game3D extends GameBase {
  /**
   * Boots the renderer. Call from onInit().
   * @param {Object} opts passed to Engine3D (fog, colours, light)
   * @returns {boolean} false when WebGL is unavailable (a notice is shown)
   */
  setup3D(opts = {}) {
    const canvas = el("canvas");
    canvas.style.display = "block";
    this.stageEl.appendChild(canvas);
    this.canvas = canvas;

    try {
      this.engine = new Engine3D(canvas, opts);
    } catch (err) {
      console.warn("[Game3D] WebGL unavailable", err);
      this.webglFailed = true;
      canvas.remove();
      this.stageEl.appendChild(el("div", { class: "gl-fallback" }, [
        el("div", { class: "ic" }, "🧊"),
        el("h3", {}, "3D is not available"),
        el("p", {}, "This game needs WebGL, which your browser or device has disabled. The rest of the library still works — every other game runs in 2D."),
        el("a", { class: "btn btn-primary", href: "#/library" }, "Back to library"),
      ]));
      return false;
    }

    // 3D fills far more pixels than a 2D game, so the pixel ratio is capped
    // lower — the difference is invisible, the frame time is not.
    this.maxDpr = opts.maxDpr ?? 1.5;
    this._resize3D();
    this._resizeObs = new ResizeObserver(() => this._resize3D());
    this._resizeObs.observe(this.stageEl);
    return true;
  }

  _resize3D() {
    if (!this.engine) return;
    const rect = this.stageEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.engine.resize(rect.width, rect.height, dpr);
    this.onResize?.(rect.width, rect.height);
  }

  /** Guard used by 3D games so they never simulate without a renderer. */
  get canPlay() { return !this.webglFailed && !!this.engine; }

  start() {
    if (this.webglFailed) return;
    super.start();
  }

  onDestroy() {
    this.engine?.dispose();
    this.engine = null;
  }
}

export { Geometry, Textures, M4, V3 };
export default Game3D;
