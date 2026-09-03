// ==========================================================================
// Duel Ring — a fencing match decided by reading, not by mashing.
//
// Four actions and a rock-paper-scissors under them: a strike beats a
// thrust, a thrust beats a parry, a parry beats a strike. The fourth,
// stepping back, beats nothing but costs nothing and refills stamina.
//
// Every action has a wind-up you can see on your opponent. That wind-up is
// the whole game: the animation is the tell, the timing window is the
// decision, and stamina is what stops you from simply always parrying.
//
// Twelve opponents on the ladder, each faster to commit and better at
// punishing the move you leaned on last.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, clamp, formatNumber, randFloat, choice } from "../core/utils.js";

// --- Actions --------------------------------------------------------------
// `wind` is how long the tell shows before it lands, `active` how long the
// action is live, `rec` the recovery you are open during.
const ACTIONS = {
  strike: { name: "Strike", wind: 0.34, active: 0.16, rec: 0.30, stam: 22, dmg: 14, beats: "thrust", color: "#ff5470" },
  thrust: { name: "Thrust", wind: 0.24, active: 0.12, rec: 0.40, stam: 18, dmg: 11, beats: "parry",  color: "#ffd76a" },
  parry:  { name: "Parry",  wind: 0.14, active: 0.26, rec: 0.34, stam: 14, dmg: 0,  beats: "strike", color: "#22d3ee" },
  step:   { name: "Step",   wind: 0.10, active: 0.20, rec: 0.14, stam: -26, dmg: 0, beats: null,     color: "#8b90ac" },
};
const ORDER = ["strike", "thrust", "parry", "step"];

// --- Opponents ------------------------------------------------------------
// `tell` scales how long their wind-up shows (lower is harder to read),
// `read` how strongly they punish whatever you have been favouring.
const FOES = [
  { name: "Squire Dell",   hp: 90,  tell: 1.6,  read: 0.0,  aggression: 0.35, color: "#8a7a5c", crest: "leaf" },
  { name: "Hedge Knight",  hp: 100, tell: 1.45, read: 0.1,  aggression: 0.45, color: "#6f9c5c", crest: "leaf" },
  { name: "Sister Wren",   hp: 105, tell: 1.3,  read: 0.2,  aggression: 0.5,  color: "#5fa8d8", crest: "bird" },
  { name: "Ser Halloway",  hp: 115, tell: 1.2,  read: 0.28, aggression: 0.55, color: "#c98f4a", crest: "sun" },
  { name: "The Ironbound", hp: 130, tell: 1.1,  read: 0.34, aggression: 0.45, color: "#7c8494", crest: "shield" },
  { name: "Duelist Vane",  hp: 120, tell: 1.0,  read: 0.42, aggression: 0.7,  color: "#a86bff", crest: "star" },
  { name: "Blackthorn",    hp: 140, tell: 0.92, read: 0.5,  aggression: 0.6,  color: "#4a4450", crest: "thorn" },
  { name: "The Falconer",  hp: 135, tell: 0.85, read: 0.56, aggression: 0.72, color: "#e8a05c", crest: "bird" },
  { name: "Lady Ashgrave", hp: 150, tell: 0.78, read: 0.64, aggression: 0.62, color: "#c93a5c", crest: "thorn" },
  { name: "The Quiet Man", hp: 155, tell: 0.7,  read: 0.72, aggression: 0.5,  color: "#5c5c6b", crest: "shield" },
  { name: "Storm of Ash",  hp: 170, tell: 0.62, read: 0.8,  aggression: 0.85, color: "#ff6b28", crest: "star" },
  { name: "The Ring Queen",hp: 195, tell: 0.55, read: 0.9,  aggression: 0.75, color: "#ffd76a", crest: "sun" },
];

const MAX_STAM = 100;

export class DuelRingGame extends GameBase {
  getDifficulties() { return ["Bout"]; }
  getInstructions() {
    return [
      "Four actions: Strike, Thrust, Parry, Step back. Strike beats Thrust, Thrust beats Parry, Parry beats Strike.",
      "Every action shows a wind-up before it lands — on you and on them. The wind-up is the tell you are reading.",
      "Stamina is spent on everything except stepping back, which refills it. At zero you can only step.",
      "A parry that catches a strike staggers them wide open. A thrust into a parry does the same to you.",
      "Twelve opponents. The late ones telegraph for barely a blink, and they punish whichever action you have been leaning on.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap one of the four buttons. Timing is everything."; }
  getKeyboardHint() { return "A strike, S thrust, D parry, Space step back."; }
  getScene() { return "ember"; }

  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.duel) custom.duel = { rung: 0, wins: 0, flawless: 0 };
    return custom.duel;
  }
  _save() { saveManager.saveNow(); }

  getPlayLabel() { return "Enter the ring"; }
  getStartExtras() {
    const d = this._store();
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `Ladder: ${d.rung}/${FOES.length}`),
      el("span", {}, `${d.wins || 0} bouts won`),
      el("span", {}, `${d.flawless || 0} flawless`),
    ]);
  }

  /** The ladder as a campaign, so the win screen offers the next opponent. */
  getLevelNav() {
    const d = this._store();
    return {
      index: this.rung || 0,
      count: FOES.length,
      label: "Bout",
      title: "The Ladder",
      unlocked: (i) => i <= d.rung,
      cleared: (i) => i < d.rung,
      goTo: (i) => { this.rung = i; this.start(); },
    };
  }
  openLevelSelect() { this.openLadder(); }

  onPlayPressed() { this.openLadder(); }

  openLadder() {
    audioManager.play("click");
    const d = this._store();
    const grid = el("div", { class: "foe-grid" });
    FOES.forEach((f, i) => {
      const open = i <= d.rung;
      grid.appendChild(el("button", {
        class: `foe-card${open ? "" : " locked"}${i < d.rung ? " beaten" : ""}`,
        disabled: !open,
        style: `--fc:${f.color}`,
        onClick: () => { closeModal(); this.rung = i; this.start(); },
      }, [
        el("span", { class: "sw" }),
        el("span", { class: "n" }, `${i + 1}`),
        el("span", { class: "nm" }, open ? f.name : "Locked"),
        el("span", { class: "st" }, open ? `${f.hp} hp · ${tellWord(f.tell)}` : `Beat ${FOES[i - 1].name}`),
      ]));
    });
    openModal({
      title: "The Ladder",
      bodyNode: el("div", { class: "foe-picker" }, [
        el("p", { class: "zone-intro" }, "Each opponent telegraphs for a shorter moment than the last, and reads whichever action you have been favouring."),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.canvas.style.cursor = "pointer";
    this.input.onKey("KeyA", () => this._act("strike"));
    this.input.onKey("KeyS", () => this._act("thrust"));
    this.input.onKey("KeyD", () => this._act("parry"));
    this.input.onKey("Space", () => this._act("step"));
    this.input.onPointer("down", (p) => this._click(p.x, p.y));
    this.rung = 0;
  }

  onStart() {
    const foe = FOES[this.rung];
    this.foe = foe;
    this.you = { hp: 120, maxHp: 120, stam: MAX_STAM, act: null, t: 0, phase: null, stagger: 0, x: 0.32, lunge: 0 };
    this.them = { hp: foe.hp, maxHp: foe.hp, stam: MAX_STAM, act: null, t: 0, phase: null, stagger: 0, x: 0.68, lunge: 0 };
    this.usage = { strike: 0, thrust: 0, parry: 0, step: 0 };
    this.log = [];
    this.elapsed = 0;
    this.aiTimer = randFloat(0.7, 1.3);
    this.hits = [];
    this.msg = "Read the wind-up";
    this.msgT = 2.4;
    this.flawless = true;
    this.exchanges = 0;
    this.setScore(0);
    this._updateHud();
  }

  // ------------------------------------------------------------- COMBAT --
  _act(kind) {
    if (this.state !== "playing") return;
    const y = this.you;
    if (y.act || y.stagger > 0) return;
    const a = ACTIONS[kind];
    if (a.stam > 0 && y.stam < a.stam) { this._say("Out of breath — step back", "#ff9f43"); audioManager.play("error"); return; }
    this._begin(y, kind);
    this.usage[kind]++;
    audioManager.play(kind === "parry" ? "select" : "swoosh");
  }

  _begin(f, kind) {
    const a = ACTIONS[kind];
    f.act = kind;
    f.t = 0;
    f.phase = "wind";
    if (a.stam > 0) f.stam = Math.max(0, f.stam - a.stam);
    f.lunge = 0;
  }

  _click(px, py) {
    for (const b of this._buttons()) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) { this._act(b.id); return; }
    }
  }

  /**
   * Resolves what happens when one fighter's action goes active. Both are
   * checked each frame, so a genuine clash — both landing in the same
   * moment — is possible and reads as a clash rather than one free hit.
   */
  _resolveActive(att, def, attIsYou) {
    const a = ACTIONS[att.act];
    if (!a.dmg) return;
    // Does the defender have something live that answers it?
    const dAct = def.act && def.phase === "active" ? def.act : null;
    if (dAct && ACTIONS[dAct].beats === att.act) {
      // Countered: the attacker is staggered wide open.
      att.stagger = 0.75;
      att.act = null; att.phase = null;
      this._flash(attIsYou ? "Countered" : "Counter!", attIsYou ? "#ff5470" : "#2ee6a6", !attIsYou);
      audioManager.play("hit");
      this.shake();
      if (!attIsYou) this.addScore(40);
      return;
    }
    if (dAct === "parry") {
      // A parry that does not beat this attack still blunts it.
      const dmg = Math.round(a.dmg * 0.3);
      def.hp -= dmg;
      this._hit(def === this.you, dmg, true);
      return;
    }
    if (def.phase === "wind" || def.phase === "recover" || def.stagger > 0 || !def.act) {
      let dmg = a.dmg;
      if (def.stagger > 0) dmg = Math.round(dmg * 1.7);   // punish a stagger
      def.hp -= dmg;
      this._hit(def === this.you, dmg, false);
      if (def === this.you) this.flawless = false;
    }
  }

  _hit(onYou, dmg, blocked) {
    this.hits.push({ onYou, dmg, blocked, t: 0 });
    audioManager.play(blocked ? "click" : "hit");
    if (!blocked) this.shake();
    if (!onYou) this.addScore(dmg * (this.rung + 1));
  }

  _flash(text, color, good) { this.msg = text; this.msgColor = color; this.msgT = 1.2; }
  _say(t, c) { this.msg = t; this.msgColor = c; this.msgT = 1.8; }

  /**
   * The opponent's choice. It weights the action that beats whatever you
   * have used most, scaled by its `read`, then commits with a wind-up you
   * can see. A high-read opponent is not faster — it is better informed.
   */
  _aiChoose() {
    const t = this.them;
    if (t.act || t.stagger > 0) return;
    const foe = this.foe;
    if (t.stam < 20) { this._begin(t, "step"); return; }

    const weights = { strike: 1, thrust: 1, parry: 0.8, step: 0.35 };
    // Punish the player's favourite: find what beats it.
    const fav = ORDER.filter(k => k !== "step").sort((a, b) => this.usage[b] - this.usage[a])[0];
    const counter = ORDER.find(k => ACTIONS[k].beats === fav);
    if (counter) weights[counter] += 2.4 * foe.read;
    // Openings: if you are winding up or recovering, a fast thrust lands.
    if (this.you.phase === "wind" || this.you.phase === "recover" || this.you.stagger > 0) {
      weights.thrust += 1.6 * foe.aggression;
      weights.strike += 1.1 * foe.aggression;
      weights.parry -= 0.5;
    }
    // Low on health, they defend more.
    if (t.hp < t.maxHp * 0.3) { weights.parry += 0.9; weights.step += 0.7; }

    let total = 0;
    for (const k of ORDER) { weights[k] = Math.max(0.05, weights[k]); total += weights[k]; }
    let roll = Math.random() * total, pick = "strike";
    for (const k of ORDER) { if (roll < weights[k]) { pick = k; break; } roll -= weights[k]; }
    this._begin(t, pick);
  }

  _stepFighter(f, dt, isYou) {
    if (f.stagger > 0) { f.stagger -= dt; if (f.stagger <= 0) f.stagger = 0; return; }
    if (!f.act) {
      // Idle: stamina trickles back.
      f.stam = Math.min(MAX_STAM, f.stam + 9 * dt);
      return;
    }
    const a = ACTIONS[f.act];
    const tellScale = isYou ? 1 : this.foe.tell;
    f.t += dt;
    const wind = a.wind * tellScale;
    if (f.phase === "wind") {
      f.lunge = clamp(f.t / wind, 0, 1) * 0.3;
      if (f.t >= wind) {
        f.phase = "active"; f.t = 0;
        this._resolveActive(f, isYou ? this.them : this.you, isYou);
        if (f.act === "step") { f.stam = Math.min(MAX_STAM, f.stam - ACTIONS.step.stam); }
      }
    } else if (f.phase === "active") {
      f.lunge = 1;
      if (f.t >= a.active) { f.phase = "recover"; f.t = 0; }
    } else {
      f.lunge = clamp(1 - f.t / a.rec, 0, 1);
      if (f.t >= a.rec) { f.act = null; f.phase = null; f.lunge = 0; this.exchanges++; }
    }
  }

  _finish() {
    const won = this.them.hp <= 0;
    const store = this._store();
    if (won) {
      store.wins = (store.wins || 0) + 1;
      if (this.flawless) store.flawless = (store.flawless || 0) + 1;
      if (store.rung <= this.rung) store.rung = Math.min(FOES.length, this.rung + 1);
      this.addScore(400 + this.rung * 220 + (this.flawless ? 800 : 0));
    }
    this._save();
    audioManager.play(won ? "win" : "gameover");
    this.endGame({
      result: won ? "win" : "loss",
      score: this.score,
      message: won
        ? (this.rung + 1 >= FOES.length
            ? "The Ring Queen is beaten. The ladder is yours."
            : `${this.foe.name} is down${this.flawless ? ", and never touched you" : ""}.`)
        : `${this.foe.name} read you. ${this.exchanges} exchanges.`,
      extraStats: [
        { label: "Their HP", value: `${Math.max(0, this.them.hp)}/${this.them.maxHp}` },
        { label: "Exchanges", value: this.exchanges },
        { label: "Ladder", value: `${store.rung}/${FOES.length}` },
      ],
    });
  }

  _updateHud() {
    this.setHud({
      You: Math.max(0, this.you?.hp ?? 0),
      Foe: Math.max(0, this.them?.hp ?? 0),
      Stamina: `${Math.round(this.you?.stam ?? 0)}%`,
      Rung: `${this.rung + 1}/${FOES.length}`,
    });
  }

  // ------------------------------------------------------------ UPDATE ---
  onUpdate(dt) {
    if (this.state !== "playing") return;
    this.elapsed += dt;
    if (this.msgT > 0) this.msgT -= dt;
    for (let i = this.hits.length - 1; i >= 0; i--) {
      this.hits[i].t += dt;
      if (this.hits[i].t > 1) this.hits.splice(i, 1);
    }

    this._stepFighter(this.you, dt, true);
    this._stepFighter(this.them, dt, false);

    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this._aiChoose();
      // A more aggressive opponent commits more often.
      this.aiTimer = randFloat(0.45, 1.5) / (0.6 + this.foe.aggression);
    }

    if (this.you.hp <= 0 || this.them.hp <= 0) { this._finish(); return; }
    this._updateHud();
  }

  // ------------------------------------------------------------ RENDER ---
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._drawArena(ctx, W, H);
    this._drawFighter(ctx, W, H, this.them, false);
    this._drawFighter(ctx, W, H, this.you, true);
    this._drawTells(ctx, W, H);
    this._drawBars(ctx, W, H);
    this._drawButtons(ctx);
    this._drawHits(ctx, W, H);
    this._drawMessage(ctx, W, H);
    ctx.restore();
  }

  _drawArena(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1c1420"); g.addColorStop(1, "#0d0910");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Crowd: staggered rows of heads and shoulders at varying sizes. Drawn
    // as an even lattice it read as a dot grid rather than as people.
    for (let r = 2; r >= 0; r--) {
      const n = 20 + r * 4;
      for (let i = 0; i < n; i++) {
        const jitter = Math.sin(i * 12.9898 + r * 78.233) * 43758.5453;
        const j = jitter - Math.floor(jitter);
        const x = ((i + (r % 2) * 0.5) / n) * W + j * 14 - 7;
        const y = H * 0.16 + r * 17 + Math.sin(this.elapsed * 0.6 + i * 0.9 + r) * 2;
        const rad = (9 - r * 1.6) * (0.8 + j * 0.4);
        const shade2 = 46 + r * 16 + j * 18;
        ctx.fillStyle = `rgb(${shade2},${shade2 - 8},${shade2 + 12})`;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y + rad * 1.5, rad * 1.25, rad * 0.9, 0, Math.PI, 0); ctx.fill();
      }
    }
    // Ring floor.
    const fy = H * 0.62;
    const fg = ctx.createLinearGradient(0, fy - 20, 0, H);
    fg.addColorStop(0, "#4a3a2a"); fg.addColorStop(1, "#2a1f16");
    ctx.fillStyle = fg;
    ctx.fillRect(0, fy, W, H - fy);
    ctx.strokeStyle = "rgba(255,215,106,0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, fy + (H - fy) * 0.42, W * 0.42, (H - fy) * 0.34, 0, 0, 7);
    ctx.stroke();
    // Torches.
    for (const tx of [W * 0.1, W * 0.9]) {
      const f = 0.7 + Math.sin(this.elapsed * 8 + tx) * 0.25;
      const tg = ctx.createRadialGradient(tx, H * 0.3, 2, tx, H * 0.3, 90);
      tg.addColorStop(0, `rgba(255,170,80,${0.28 * f})`);
      tg.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.arc(tx, H * 0.3, 90, 0, 7); ctx.fill();
      ctx.fillStyle = "#5c4030";
      ctx.fillRect(tx - 3, H * 0.3, 6, 54);
      ctx.fillStyle = `rgba(255,${150 + f * 80},70,0.95)`;
      ctx.beginPath();
      ctx.moveTo(tx, H * 0.3 - 20 * f);
      ctx.quadraticCurveTo(tx + 8, H * 0.3, tx, H * 0.3 + 4);
      ctx.quadraticCurveTo(tx - 8, H * 0.3, tx, H * 0.3 - 20 * f);
      ctx.fill();
    }
  }

  /** A fencer drawn from stance + lunge, so the wind-up is visible in the body. */
  _drawFighter(ctx, W, H, f, isYou) {
    const dir = isYou ? 1 : -1;
    const baseX = f.x * W + dir * f.lunge * W * 0.06;
    const y = H * 0.62 + (H * 0.38) * 0.42;
    const color = isYou ? "#2ee6a6" : this.foe.color;
    const scale = Math.min(W, H) / 420;

    ctx.save();
    ctx.translate(baseX, y);
    ctx.scale(dir * scale, scale);
    if (f.stagger > 0) ctx.rotate(Math.sin(f.stagger * 30) * 0.12);

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(0, 6, 34, 8, 0, 0, 7); ctx.fill();

    // Legs in a fencing stance, widening on a lunge.
    const spread = 18 + f.lunge * 26;
    ctx.strokeStyle = "#2a2433"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-6, -34); ctx.lineTo(-spread * 0.6, 2);
    ctx.moveTo(-6, -34); ctx.lineTo(spread, 2);
    ctx.stroke();
    // Body.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-14, -34);
    ctx.quadraticCurveTo(-10, -68, 4, -72);
    ctx.quadraticCurveTo(16, -68, 12, -34);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.6; ctx.stroke();
    // Head with a crest.
    ctx.fillStyle = "#e8c6a8";
    ctx.beginPath(); ctx.arc(6, -84, 11, 0, 7); ctx.fill();
    ctx.fillStyle = shade(color, -0.2);
    ctx.beginPath(); ctx.arc(6, -86, 12, Math.PI, 0); ctx.fill();
    ctx.fillRect(-5, -88, 22, 4);
    if (!isYou) drawCrest(ctx, this.foe.crest, 6, -100, color);

    // Sword arm: the angle is the tell.
    const a = f.act ? ACTIONS[f.act] : null;
    let armA = -0.5, len = 46;
    if (a) {
      if (f.act === "strike") armA = f.phase === "wind" ? -2.0 + f.lunge * 0.4 : 0.15;
      else if (f.act === "thrust") { armA = -0.15; len = 46 + f.lunge * 28; }
      else if (f.act === "parry") armA = -1.0;
      else armA = -0.35;
    }
    ctx.save();
    ctx.translate(10, -56);
    ctx.rotate(armA);
    ctx.strokeStyle = "#e8c6a8"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.stroke();
    // Blade.
    ctx.strokeStyle = f.phase === "active" ? "#ffffff" : "#c9d4e8";
    ctx.lineWidth = f.phase === "active" ? 5 : 3.4;
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(26 + len, 0); ctx.stroke();
    ctx.fillStyle = "#8b90ac";
    ctx.fillRect(24, -6, 4, 12);
    ctx.restore();

    // Off hand holds a small buckler, raised on a parry.
    ctx.save();
    ctx.translate(-12, -54);
    ctx.rotate(f.act === "parry" ? -0.9 : 0.3);
    ctx.fillStyle = shade(color, -0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath(); ctx.ellipse(-2, -3, 3, 5, 0, 0, 7); ctx.fill();
    ctx.restore();
    ctx.restore();

    // Action ring under the fighter, coloured by what they are doing.
    if (f.act) {
      const spec = ACTIONS[f.act];
      const total = spec.wind * (isYou ? 1 : this.foe.tell) + spec.active + spec.rec;
      const done = (f.phase === "wind" ? f.t
                  : f.phase === "active" ? spec.wind * (isYou ? 1 : this.foe.tell) + f.t
                  : spec.wind * (isYou ? 1 : this.foe.tell) + spec.active + f.t) / total;
      ctx.strokeStyle = spec.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(baseX, y + 10, 40, -Math.PI / 2, -Math.PI / 2 + clamp(done, 0, 1) * Math.PI * 2);
      ctx.stroke();
    }
    if (f.stagger > 0) {
      ctx.fillStyle = `rgba(255,84,112,${0.5 * f.stagger})`;
      ctx.font = "800 13px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("OPEN", baseX, y - 110);
    }
  }

  /** The opponent's tell, named above their head while they wind up. */
  _drawTells(ctx, W, H) {
    const t = this.them;
    if (!t.act || t.phase !== "wind") return;
    const spec = ACTIONS[t.act];
    const x = t.x * W, y = H * 0.32;
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,6,14,0.72)";
    roundRect(ctx, x - 52, y - 18, 104, 26, 13); ctx.fill();
    ctx.strokeStyle = spec.color; ctx.lineWidth = 2;
    roundRect(ctx, x - 52, y - 18, 104, 26, 13); ctx.stroke();
    ctx.fillStyle = spec.color;
    ctx.font = "800 13px 'Sora', system-ui, sans-serif";
    ctx.fillText(spec.name.toUpperCase(), x, y);
    // A shrinking bar: how long is left to answer it.
    const total = spec.wind * this.foe.tell;
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundRect(ctx, x - 46, y + 11, 92, 4, 2); ctx.fill();
    ctx.fillStyle = spec.color;
    roundRect(ctx, x - 46, y + 11, 92 * (1 - clamp(t.t / total, 0, 1)), 4, 2); ctx.fill();
    ctx.restore();
  }

  _drawBars(ctx, W, H) {
    const bar = (x, f, name, color, align) => {
      const bw = Math.min(170, W * 0.34), bh = 12;
      const bx = align === "left" ? x : x - bw;
      ctx.fillStyle = "rgba(8,6,14,0.7)";
      roundRect(ctx, bx, 14, bw, bh, 6); ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, bx + 1, 15, Math.max(0, (bw - 2) * clamp(f.hp / f.maxHp, 0, 1)), bh - 2, 5); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "700 10px 'Inter', system-ui, sans-serif";
      ctx.textAlign = align;
      ctx.fillText(`${name} ${Math.max(0, f.hp)}`, align === "left" ? bx + 3 : bx + bw - 3, 24);
    };
    bar(12, this.you, "You", "#2ee6a6", "left");
    bar(W - 12, this.them, this.foe.name, this.foe.color, "right");

    // Your stamina, under your health.
    const bw = Math.min(170, W * 0.34);
    ctx.fillStyle = "rgba(8,6,14,0.7)";
    roundRect(ctx, 12, 30, bw, 6, 3); ctx.fill();
    const low = this.you.stam < 25;
    ctx.fillStyle = low ? "#ff9f43" : "#22d3ee";
    roundRect(ctx, 13, 31, Math.max(0, (bw - 2) * (this.you.stam / MAX_STAM)), 4, 2); ctx.fill();
  }

  _buttons() {
    const W = this.viewW, H = this.viewH;
    const n = ORDER.length;
    const w = Math.min(96, (W - 24) / n - 6);
    const total = n * w + (n - 1) * 6;
    const x0 = (W - total) / 2;
    const keys = { strike: "A", thrust: "S", parry: "D", step: "SPACE" };
    return ORDER.map((id, i) => ({ id, key: keys[id], x: x0 + i * (w + 6), y: H - 58, w, h: 44 }));
  }

  _drawButtons(ctx) {
    const y = this.you;
    for (const b of this._buttons()) {
      const spec = ACTIONS[b.id];
      const usable = !y.act && y.stagger <= 0 && (spec.stam <= 0 || y.stam >= spec.stam);
      const active = y.act === b.id;
      ctx.globalAlpha = usable || active ? 1 : 0.35;
      ctx.fillStyle = active ? hexA(spec.color, 0.9) : "rgba(20,16,28,0.9)";
      roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
      ctx.strokeStyle = active ? "#ffffff" : hexA(spec.color, 0.55);
      ctx.lineWidth = active ? 2.5 : 1.4;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.stroke();
      ctx.fillStyle = active ? "#0b0a12" : spec.color;
      ctx.font = "800 12px 'Sora', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(spec.name.toUpperCase(), b.x + b.w / 2, b.y + 19);
      ctx.fillStyle = active ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.45)";
      ctx.font = "700 9px 'Inter', system-ui, sans-serif";
      ctx.fillText(this.useTouch ? (spec.stam > 0 ? `${spec.stam} stam` : "+stam") : `${b.key} · ${spec.stam > 0 ? spec.stam : "+"}`,
                   b.x + b.w / 2, b.y + 33);
      ctx.globalAlpha = 1;
    }
    // The triangle, drawn small so the matchup is always on screen.
    const W = this.viewW, H = this.viewH;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "700 9px 'Inter', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("strike ▸ thrust ▸ parry ▸ strike", W / 2, H - 64);
  }

  _drawHits(ctx, W, H) {
    for (const h of this.hits) {
      const x = (h.onYou ? this.you.x : this.them.x) * W;
      const y = H * 0.5 - h.t * 44;
      ctx.globalAlpha = Math.max(0, 1 - h.t);
      ctx.textAlign = "center";
      ctx.fillStyle = h.blocked ? "#8b90ac" : h.onYou ? "#ff5470" : "#ffd76a";
      ctx.font = `800 ${h.blocked ? 16 : 22}px 'Sora', system-ui, sans-serif`;
      ctx.fillText(h.blocked ? `blocked ${h.dmg}` : `${h.dmg}`, x, y);
    }
    ctx.globalAlpha = 1;
  }

  _drawMessage(ctx, W, H) {
    if (this.msgT <= 0) return;
    ctx.globalAlpha = Math.min(1, this.msgT / 0.4);
    ctx.textAlign = "center";
    ctx.fillStyle = this.msgColor || "#ffffff";
    ctx.font = "800 20px 'Sora', system-ui, sans-serif";
    ctx.fillText(this.msg, W / 2, H * 0.44);
    ctx.globalAlpha = 1;
  }
}

function drawCrest(ctx, kind, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (kind === "leaf") {
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 9, 0.5, 0, 7); ctx.fill();
  } else if (kind === "bird") {
    ctx.beginPath();
    ctx.moveTo(-9, 2); ctx.quadraticCurveTo(0, -8, 9, 2);
    ctx.quadraticCurveTo(0, -2, -9, 2);
    ctx.fill();
  } else if (kind === "sun") {
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
      ctx.stroke();
    }
  } else if (kind === "shield") {
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(7, -4); ctx.lineTo(7, 3);
    ctx.quadraticCurveTo(0, 10, -7, 3); ctx.lineTo(-7, -4);
    ctx.closePath(); ctx.fill();
  } else if (kind === "thorn") {
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(4, 0); ctx.lineTo(0, 8); ctx.lineTo(-4, 0);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 4 : 9;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function tellWord(t) {
  return t > 1.4 ? "telegraphs everything" : t > 1.1 ? "readable" : t > 0.85 ? "quick" : t > 0.65 ? "barely a blink" : "almost no tell";
}
function shade(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const f = (c) => clamp(Math.round(c + 255 * amt), 0, 255);
  return `rgb(${f((v >> 16) & 255)},${f((v >> 8) & 255)},${f(v & 255)})`;
}
function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
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

export default DuelRingGame;
