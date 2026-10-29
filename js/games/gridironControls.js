// ==========================================================================
// Gridiron Kings — touch controls, drawn on the canvas.
//
// Every finger is tracked on its own (pointer events with pointer capture),
// so a thumb can hold the stick while the other sprints, jukes or throws.
// The left thumb owns the stick; the right thumb gets whatever the moment
// needs — SNAP before the play, SPRINT and the pass buttons that ride above
// the receivers while the quarterback has the ball, the move set once
// someone is running with it, and TACKLE / INT / SWAT / SWITCH on defence.
//
// Buttons react on touch-down, not on release, so a juke is instant. The
// pass buttons are pushed apart from each other and kept clear of the other
// controls, so a tap can only ever mean one receiver. Size, opacity, height,
// a left-handed mirror and a floating stick come from the settings.
// ==========================================================================
import { LETTER_COLORS } from "./gridironDraw.js";
import { HOT_ROUTES, ROUTES } from "./gridironData.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const DEFAULT_SETTINGS = { scale: 1, alpha: 0.55, raise: 0, lefty: false, floating: true, aimAssist: true, vibrate: true, camera: "auto" };

export class TouchControls {
  /** host: { canvas, input (for _toLocal), getMatch(), settings(), onTopButton(id) } */
  constructor(host) {
    this.host = host;
    this.ptrs = new Map();
    this.stick = { active: false, id: null, bx: 0, by: 0, x: 0, y: 0 };
    this.held = new Set();
    this.charge = null;            // { letter, id, t0 }
    this.menu = null;              // hot-route menu { letter, items: [{route,x,y,w,h}] }
    this.buttons = [];
    this.icons = [];
    this.keys = { x: 0, y: 0 };
    this.lastTap = 0;
    const c = host.canvas;
    c.style.touchAction = "none";
    c.style.userSelect = "none";
    c.style.webkitUserSelect = "none";
    c.style.webkitTouchCallout = "none";
    this._down = (e) => this._onDown(e);
    this._move = (e) => this._onMove(e);
    this._up = (e) => this._onUp(e);
    this._ctx = (e) => e.preventDefault();
    c.addEventListener("pointerdown", this._down);
    c.addEventListener("pointermove", this._move);
    c.addEventListener("pointerup", this._up);
    c.addEventListener("pointercancel", this._up);
    c.addEventListener("lostpointercapture", this._up);
    c.addEventListener("contextmenu", this._ctx);
    // iOS: block the page scroll/zoom gestures that start on the canvas.
    this._tm = (e) => { if (e.target === c) e.preventDefault(); };
    c.addEventListener("touchmove", this._tm, { passive: false });
    c.addEventListener("touchstart", this._tm, { passive: false });
  }

  destroy() {
    const c = this.host.canvas;
    c.removeEventListener("pointerdown", this._down);
    c.removeEventListener("pointermove", this._move);
    c.removeEventListener("pointerup", this._up);
    c.removeEventListener("pointercancel", this._up);
    c.removeEventListener("lostpointercapture", this._up);
    c.removeEventListener("contextmenu", this._ctx);
    c.removeEventListener("touchmove", this._tm);
    c.removeEventListener("touchstart", this._tm);
  }

  get S() { const st = this.host.settings(); return st.scale * clamp(Math.min(this.w || 600, this.h || 400) / 390, 0.82, 1.3); }

  _local(e) { const l = this.host.input._toLocal(e.clientX, e.clientY); return { x: l.x, y: l.y }; }

  _buzz(ms = 8) { if (this.host.settings().vibrate) navigator.vibrate?.(ms); }

  // ------------------------------------------------------------ layout ---
  /** Rebuilds the button set for the current moment. */
  layout(w, h) {
    this.w = w; this.h = h;
    const m = this.host.getMatch();
    const st = this.host.settings();
    const S = this.S;
    const mode = m ? m.controlMode() : "none";
    this.mode = mode;
    const mirror = (x) => (st.lefty ? w - x : x);
    const raise = st.raise;
    const B = [];
    const add = (id, x, y, r, label, opts = {}) => B.push({ id, x: mirror(x), y, r, label, ...opts });
    const g = 64 * S, r = 27 * S, big = 34 * S;
    const cell = (c, row) => [w - 46 * S - (2 - c) * g, h - 48 * S - raise - (2 - row) * g];
    if (m && m.phase === "pat" && m.poss === "user") {
      const pw = Math.min(170, w * 0.38);
      B.push({ id: "pat-kick", x: w / 2 - pw / 2 - 8, y: h * 0.58, r: 30, w: pw, h: 54, rect: true, label: "Kick PAT  +1", color: "#2563eb" });
      B.push({ id: "pat-two", x: w / 2 + pw / 2 + 8, y: h * 0.58, r: 30, w: pw, h: 54, rect: true, label: "Go for 2", color: "#dc2626" });
    }
    if (mode === "presnap-off") {
      const [sx, sy] = cell(2, 2);
      add("snap", sx - 6 * S, sy - 8 * S, 44 * S, "SNAP", { color: "#16a34a", big: true });
      add("plays", sx - 98 * S, sy + 6 * S, r, "PLAYS", { color: "#334155" });
      add("form", sx - 84 * S, sy - 80 * S, r, "FORM", { color: "#334155" });
      add("flip", sx - 10 * S, sy - 104 * S, r, "FLIP", { color: "#334155" });
    } else if (mode === "presnap-def") {
      const [sx, sy] = cell(2, 2);
      add("ready", sx - 6 * S, sy - 8 * S, 40 * S, "READY", { color: "#16a34a", big: true });
      add("switch", sx - 92 * S, sy + 4 * S, r, "SWITCH", { color: "#334155" });
      add("plays", sx - 76 * S, sy - 82 * S, r, "PLAYS", { color: "#334155" });
    } else if (mode === "qb") {
      const [sx, sy] = cell(2, 2);
      add("sprint", sx, sy, big, "SPRINT", { hold: true, color: "#0ea5e9" });
      add("away", sx - 86 * S, sy + 8 * S, r * 0.92, "AWAY", { color: "#475569", sub: "throw" });
    } else if (mode === "run") {
      const L = [["hurdle", "HURDLE", "⤴"], ["spin", "SPIN", "⟳"], ["dive", "DIVE", "⇥"], ["jukeL", "JUKE", "◀"], ["cut", "CUT", "↯"], ["jukeR", "JUKE", "▶"], ["protect", "PROTECT", "🛡"], ["stiff", "STIFF", "✋"], ["sprint", "SPRINT", "»"]];
      L.forEach(([id, label, icon], i) => {
        const [x, y] = cell(i % 3, (i / 3) | 0);
        const isSprint = id === "sprint";
        let cid = id;
        if (st.lefty && id === "jukeL") cid = "jukeR"; else if (st.lefty && id === "jukeR") cid = "jukeL";
        add(cid, x, y, isSprint ? big : r, label, { icon: st.lefty && (id === "jukeL" || id === "jukeR") ? (id === "jukeL" ? "▶" : "◀") : icon, hold: isSprint || id === "protect", color: isSprint ? "#0ea5e9" : id === "protect" ? "#64748b" : "#7c3aed" });
      });
    } else if (mode === "def") {
      const L = [[1, 0, "swat", "SWAT", "✋"], [2, 0, "int", "INT", "🙌"], [0, 1, "switch", "SWITCH", "⇄"], [1, 1, "tackle", "TACKLE", "💥"], [2, 1, "sprint", "SPRINT", "»"]];
      for (const [c, row, id, label, icon] of L) {
        const [x, y] = cell(c, row + 1);
        add(id, x, y, id === "tackle" || id === "sprint" ? big : r, label, { icon, hold: id === "sprint", color: id === "tackle" ? "#dc2626" : id === "sprint" ? "#0ea5e9" : "#7c3aed" });
      }
    }
    // Always: camera and settings, small, top corner away from the stick.
    const tx = st.lefty ? 26 * S : w - 26 * S;
    if (m && !m.finished) {
      B.push({ id: "cam", x: tx, y: 66 * S, r: 19 * S, label: "CAM", color: "#1e293b", small: true, camLabel: m.cam.mode });
      B.push({ id: "settings", x: tx, y: 112 * S, r: 19 * S, label: "⚙", color: "#1e293b", small: true });
    }
    this.buttons = B;
    // Stick base.
    const fixedX = mirror(86 * S + 6), fixedY = h - 86 * S - raise;
    if (!this.stick.active) { this.stick.bx = st.floating && this.stick.lastX ? this.stick.lastX : fixedX; this.stick.by = st.floating && this.stick.lastY ? this.stick.lastY : fixedY; }
    this.stick.fixedX = fixedX; this.stick.fixedY = fixedY; this.stick.R = 58 * S;
    this._layoutIcons(m);
  }

  /** Pass buttons above the receivers, pushed apart and off the controls. */
  _layoutIcons(m) {
    this.icons = [];
    if (!m || !m.view || !(this.mode === "qb" || this.mode === "presnap-off")) return;
    if (this.mode === "qb" && m.thrown) return;
    const S = this.S, R = 23 * S, v = m.view;
    for (const p of m.players) {
      if (p.side !== "O" || !p.letter) continue;
      const [sx, sy] = v.toScreen(p.x, p.y);
      this.icons.push({ letter: p.letter, p, x: sx, y: sy - 38 * S, ax: sx, ay: sy, r: R });
    }
    const obstacles = [...this.buttons.map(b => ({ x: b.x, y: b.y, r: b.rect ? Math.max(b.w, b.h) / 2 : b.r })), { x: this.stick.bx, y: this.stick.by, r: this.stick.R }];
    const w = this.w, h = this.h;
    for (let it = 0; it < 12; it++) {
      for (const a of this.icons) {
        for (const b of this.icons) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 8;
          if (d < min) { const k = (min - d) / 2; a.x += dx / d * k; a.y += dy / d * k; b.x -= dx / d * k; b.y -= dy / d * k; }
        }
        for (const o of obstacles) {
          const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + o.r + 6;
          if (d < min) { a.x += dx / d * (min - d); a.y += dy / d * (min - d); }
        }
        a.x = clamp(a.x, a.r + 4, w - a.r - 4);
        a.y = clamp(a.y, a.r + 70, h - a.r - 4);
      }
    }
  }

  // ------------------------------------------------------------ events ---
  _onDown(e) {
    e.preventDefault();
    const pt = this._local(e);
    try { this.host.canvas.setPointerCapture(e.pointerId); } catch { /* not all pointers can be captured */ }
    const m = this.host.getMatch();
    if (!m) return;
    this.layout(this.w || 1, this.h || 1);
    // 1. Hot-route menu.
    if (this.menu) {
      const it = this.menu.items.find(i => pt.x >= i.x && pt.x <= i.x + i.w && pt.y >= i.y && pt.y <= i.y + i.h);
      if (it) { m.setHotRoute(this.menu.letter, it.route); this._buzz(); }
      this.menu = null;
      this.ptrs.set(e.pointerId, { kind: "none" });
      return;
    }
    // 2. Buttons (and PAT).
    const btn = this.buttons.find(b => (b.rect ? Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2 : Math.hypot(pt.x - b.x, pt.y - b.y) <= b.r + 6));
    if (btn) {
      this.ptrs.set(e.pointerId, { kind: "btn", id: btn.id });
      this.held.add(btn.id);
      btn.flash = 1;
      this._press(btn.id, m);
      this._buzz();
      return;
    }
    // 3. Pass buttons over the receivers.
    let best = null, bd = 1e9;
    for (const ic of this.icons) { const d = Math.hypot(pt.x - ic.x, pt.y - ic.y); if (d <= ic.r + 8 && d < bd) { bd = d; best = ic; } }
    if (best) {
      this.ptrs.set(e.pointerId, { kind: "icon", letter: best.letter });
      if (this.mode === "presnap-off") { this._openMenu(best); this._buzz(); return; }
      this.charge = { letter: best.letter, id: e.pointerId, t0: performance.now() };
      this._buzz(5);
      return;
    }
    // 4. The stick side of the screen.
    const st = this.host.settings();
    const stickSide = st.lefty ? pt.x > this.w * 0.52 : pt.x < this.w * 0.48;
    if (stickSide && pt.y > this.h * 0.22 && !this.stick.active) {
      const s = this.stick;
      s.active = true; s.id = e.pointerId;
      if (st.floating) { s.bx = pt.x; s.by = pt.y; } else { s.bx = s.fixedX; s.by = s.fixedY; }
      s.x = pt.x; s.y = pt.y;
      s.lastX = s.bx; s.lastY = s.by;
      this.ptrs.set(e.pointerId, { kind: "stick" });
      this._stickMoved();
      return;
    }
    // 5. Tap a defender to take him over.
    if ((this.mode === "def" || this.mode === "presnap-def") && m.view) {
      const [wx, wy] = m.view.toWorld(pt.x, pt.y);
      let sel = null, sd = 2.6;
      for (const p of m.players) { if (p.side !== "D") continue; const d = Math.hypot(p.x - wx, p.y - wy); if (d < sd) { sd = d; sel = p; } }
      if (sel && !(m.ball?.state === "held" && m.ball.carrier.side === "D")) { m.userSel = sel; this._buzz(); }
    }
    this.ptrs.set(e.pointerId, { kind: "none" });
  }

  _onMove(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    if (p.kind === "stick" && this.stick.id === e.pointerId) {
      const pt = this._local(e);
      this.stick.x = pt.x; this.stick.y = pt.y;
      // A floating stick follows a thumb that drifts too far.
      const s = this.stick, dx = s.x - s.bx, dy = s.y - s.by, d = Math.hypot(dx, dy);
      if (this.host.settings().floating && d > s.R * 1.6) { s.bx = s.x - dx / d * s.R * 1.6; s.by = s.y - dy / d * s.R * 1.6; }
      this._stickMoved();
    }
  }

  _onUp(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.kind === "stick" && this.stick.id === e.pointerId) { this.stick.active = false; this.stick.id = null; this._stickMoved(); }
    if (p.kind === "btn") this.held.delete(p.id);
    if (p.kind === "icon" && this.charge && this.charge.id === e.pointerId) this._release();
  }

  _stickMoved() {
    const s = this.stick;
    if (!s.active) { this.stickVec = { x: 0, y: 0 }; return; }
    const dx = s.x - s.bx, dy = s.y - s.by, d = Math.hypot(dx, dy);
    const k = d > s.R ? s.R / d : 1;
    this.stickVec = { x: dx * k / s.R, y: dy * k / s.R };
  }

  _openMenu(icon) {
    const S = this.S;
    const iw = 92 * S, ih = 34 * S;
    const items = HOT_ROUTES.map((route, i) => ({ route, label: ROUTES[route].name, w: iw, h: ih, x: 0, y: 0, i }));
    const cols = 3, rows = Math.ceil(items.length / cols);
    let x0 = clamp(icon.x - (cols * (iw + 6)) / 2, 6, this.w - cols * (iw + 6) - 6);
    let y0 = icon.y + icon.r + 8;
    if (y0 + rows * (ih + 6) > this.h - 6) y0 = icon.y - icon.r - 8 - rows * (ih + 6);
    y0 = clamp(y0, 60, this.h - rows * (ih + 6) - 4);
    items.forEach((it, i) => { it.x = x0 + (i % cols) * (iw + 6); it.y = y0 + ((i / cols) | 0) * (ih + 6); });
    this.menu = { letter: icon.letter, items };
  }

  /** Power for a pass being charged: quick tap = crisp pass; hold = ping-pong meter. */
  _power() {
    if (!this.charge) return 0;
    const t = (performance.now() - this.charge.t0) / 1000;
    if (t < 0.17) return 0.72;
    const ph = ((t - 0.17) / 1.0) % 2;
    return 0.15 + 0.85 * (ph < 1 ? ph : 2 - ph);
  }

  _release() {
    const m = this.host.getMatch();
    const ch = this.charge;
    this.charge = null;
    if (!m || !ch) return;
    const power = this._power.call({ charge: ch });
    const nudge = this.worldStick();
    if (m.throwTo(ch.letter, power, Math.hypot(nudge.x, nudge.y) > 0.3 ? nudge : null)) this._buzz(14);
  }

  _press(id, m) {
    switch (id) {
      case "snap": m.snap(); break;
      case "ready": if (m.phase === "presnap") m.snap(); break;
      case "plays": this.host.onTopButton("plays"); break;
      case "form": {
        const forms = m.offPlay.forms, i = forms.indexOf(m.offForm);
        m.setFormation(forms[(i + 1) % forms.length]);
        break;
      }
      case "flip": m.flipFormation(); break;
      case "switch": {
        const ball = m.ball;
        const pool = m.players.filter(p => p.side === "D" && p.role !== "DL");
        if (!pool.length) break;
        // Next defender nearest the ball who isn't the current one.
        const bx = ball?.x ?? m.los, by = ball?.y ?? m.ballY;
        const sorted = pool.sort((a, b) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(b.x - bx, b.y - by));
        const i = sorted.indexOf(m.userSel);
        m.userSel = sorted[(i + 1) % Math.min(sorted.length, 4)];
        break;
      }
      case "away": {
        // Throw it away over the sideline: no gain, no risk.
        const qb = m.qb;
        if (!m.thrown && m.ball?.state === "held" && m.ball.carrier === qb && qb.x <= m.los + 0.3) {
          const out = qb.y < 26.7 ? -4 : 57.3;
          const r = m.players.filter(p => p.letter).sort((a, b) => Math.abs(a.y - out) - Math.abs(b.y - out))[0];
          if (r) { const ok = m.throwTo(r.letter, 0.6, { x: 0, y: out < 0 ? -6 : 6 }); if (ok) { m.ball.to = [qb.x + 8, out, 1]; m.ball.T = 0.9; m.ball.away = true; } }
        }
        break;
      }
      case "cam": this.host.onTopButton("cam"); break;
      case "settings": this.host.onTopButton("settings"); break;
      case "pat-kick": m.choosePat("kick"); break;
      case "pat-two": m.choosePat("two"); break;
      case "sprint": case "protect": break;      // held buttons: read every frame
      default: m.action(id);
    }
  }

  /** The stick (and keys) as a world-space direction for the match. */
  worldStick() {
    const m = this.host.getMatch();
    let x = this.stickVec?.x || 0, y = this.stickVec?.y || 0;
    if (this.keys.x || this.keys.y) { x = this.keys.x; y = this.keys.y; const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; } }
    if (!m?.view) return { x, y };
    const [wx, wy] = m.view.dirToWorld(x, y);
    return { x: wx, y: wy };
  }

  /** Called once per frame before the match updates. */
  feed(keysHeld = new Set()) {
    const m = this.host.getMatch();
    if (!m) return;
    const v = this.worldStick();
    m.setInput({ x: v.x, y: v.y, sprint: this.held.has("sprint") || keysHeld.has("sprint"), protect: this.held.has("protect") || keysHeld.has("protect") });
  }

  /** Aim preview while a pass is charging, for the renderer. */
  aim() {
    const m = this.host.getMatch();
    if (!this.charge || !m || !this.host.settings().aimAssist) return null;
    const r = m.players.find(p => p.letter === this.charge.letter && p.side === "O");
    if (!r || m.thrown) return null;
    const nudge = this.worldStick();
    const a = m.aimFor(r, this._power(), Math.hypot(nudge.x, nudge.y) > 0.3 ? nudge : null);
    return { ...a, power: this._power() };
  }

  // ----------------------------------------------------------- drawing ---
  draw(ctx) {
    const m = this.host.getMatch();
    if (!m) return;
    const st = this.host.settings();
    const A = st.alpha;
    const S = this.S;
    // Stick.
    if (["qb", "run", "def", "presnap-def"].includes(this.mode) || this.stick.active) {
      const s = this.stick;
      ctx.globalAlpha = A * (s.active ? 1 : 0.7);
      ctx.fillStyle = "rgba(10,14,24,0.45)"; ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.bx, s.by, s.R, 0, TAU); ctx.fill(); ctx.stroke();
      const v = this.stickVec || { x: 0, y: 0 };
      const kx = s.bx + v.x * s.R, ky = s.by + v.y * s.R;
      const g = ctx.createRadialGradient(kx - 6, ky - 6, 2, kx, ky, 28 * S);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(1, "rgba(180,190,210,0.75)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, 26 * S, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Buttons.
    for (const b of this.buttons) {
      const down = this.held.has(b.id) || (b.flash > 0);
      if (b.flash > 0) b.flash -= 0.08;
      ctx.globalAlpha = b.rect ? 0.95 : clamp(A * (down ? 1.5 : 1), 0.15, 1);
      ctx.fillStyle = b.color || "#334155";
      ctx.strokeStyle = down ? "#ffffff" : "rgba(255,255,255,0.6)"; ctx.lineWidth = down ? 3 : 1.6;
      ctx.beginPath();
      if (b.rect) ctx.roundRect ? ctx.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, 14) : ctx.rect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      else ctx.arc(b.x, b.y, b.r * (down ? 0.94 : 1), 0, TAU);
      ctx.fill(); ctx.stroke();
      // Cooldown arc for moves.
      const c = m.controlled?.();
      if (c && this.mode === "run" && !b.hold && c.moveCd > 0 && b.id !== "sprint") {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(c.moveCd / 1.4, 0, 1)); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = clamp(A * 1.8, 0.55, 1);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (b.icon) {
        ctx.font = `${Math.round(b.r * 0.62)}px sans-serif`; ctx.fillText(b.icon, b.x, b.y - b.r * 0.18);
        ctx.font = `800 ${Math.max(8, Math.round(b.r * 0.3))}px Inter, sans-serif`; ctx.fillText(b.label, b.x, b.y + b.r * 0.45);
      } else if (b.id === "cam") {
        ctx.font = `800 ${Math.round(b.r * 0.46)}px Inter, sans-serif`; ctx.fillText("📷", b.x, b.y - b.r * 0.15);
        ctx.font = `700 ${Math.round(b.r * 0.34)}px Inter, sans-serif`; ctx.fillText(b.camLabel.toUpperCase(), b.x, b.y + b.r * 0.48);
      } else {
        ctx.font = `900 ${Math.round(b.rect ? 17 : b.big ? b.r * 0.42 : b.small ? b.r * 0.7 : b.r * 0.4)}px Sora, Inter, sans-serif`;
        ctx.fillText(b.label, b.x, b.y + (b.sub ? -4 : 1));
        if (b.sub) { ctx.font = `700 ${Math.round(b.r * 0.28)}px Inter, sans-serif`; ctx.fillText(b.sub, b.x, b.y + b.r * 0.42); }
      }
      ctx.globalAlpha = 1;
    }
    // Pass buttons over the receivers.
    for (const ic of this.icons) {
      const col = LETTER_COLORS[ic.letter] || "#fff";
      // Tether to the man it belongs to.
      ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ic.x, ic.y + ic.r); ctx.lineTo(ic.ax, ic.ay - 12); ctx.stroke();
      ctx.globalAlpha = 0.92;
      const charging = this.charge && this.charge.letter === ic.letter;
      ctx.fillStyle = col; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = charging ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(ic.x, ic.y, ic.r * (charging ? 1.12 : 1), 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ic.letter === "Y" ? "#1a1a1a" : "#ffffff";
      ctx.font = `900 ${Math.round(ic.r * (ic.letter.length > 1 ? 0.7 : 0.95))}px Sora, Inter, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ic.letter, ic.x, ic.y + 1);
      if (charging) {
        const pw = this._power();
        ctx.strokeStyle = pw > 0.8 ? "#ff5470" : pw > 0.45 ? "#ffd76a" : "#7cf0ff"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(ic.x, ic.y, ic.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * pw); ctx.stroke();
        ctx.font = "800 10px Inter, sans-serif"; ctx.fillStyle = "#fff";
        ctx.fillText(pw > 0.8 ? "BULLET" : pw > 0.45 ? "TOUCH" : "LOB", ic.x, ic.y - ic.r - 18);
      }
      if (this.mode === "presnap-off") {
        ctx.font = "700 9px Inter, sans-serif"; ctx.fillStyle = "#fff";
        ctx.fillText(ROUTES[ic.p.routeId]?.name || "", ic.x, ic.y + ic.r + 10);
      }
      ctx.globalAlpha = 1;
    }
    // Hot-route menu.
    if (this.menu) {
      const it0 = this.menu.items[0];
      const last = this.menu.items[this.menu.items.length - 1];
      ctx.fillStyle = "rgba(6,8,16,0.86)";
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(it0.x - 8, it0.y - 26, (it0.w + 6) * 3 + 10, last.y + last.h - it0.y + 34, 12) : ctx.rect(it0.x - 8, it0.y - 26, (it0.w + 6) * 3 + 10, last.y + last.h - it0.y + 34); ctx.fill();
      ctx.fillStyle = LETTER_COLORS[this.menu.letter]; ctx.font = "800 11px Inter, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(`Hot route for ${this.menu.letter}`, it0.x, it0.y - 13);
      for (const it of this.menu.items) {
        ctx.fillStyle = "#1e293b"; ctx.strokeStyle = LETTER_COLORS[this.menu.letter]; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(it.x, it.y, it.w, it.h, 8) : ctx.rect(it.x, it.y, it.w, it.h); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `800 ${Math.round(it.h * 0.38)}px Inter, sans-serif`;
        ctx.fillText(it.label, it.x + it.w / 2, it.y + it.h / 2 + 1);
      }
    }
    ctx.textBaseline = "alphabetic";
  }
}
