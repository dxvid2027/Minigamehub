// ==========================================================================
// Gridiron Kings — American football, unlocked with a secret code.
//
// Pick one of 32 teams and play a season — every week against a different
// opponent, a table of all 32, and an eight-team playoff to the
// Championship — or just play one game. Every game can be played or
// simulated.
//
// The whole game is built for two thumbs: a stick on the left, actions on
// the right, pass buttons that ride over the receivers, a playbook of cards
// you scroll with a finger, and a settings page for the size, height and
// opacity of the controls. A keyboard works too, but is never needed.
//
// Files:
//   gridironData.js      teams and players, formations, routes, playbooks
//   gridironMatch.js     the simulation: one play at a time, 11 on 11
//   gridironDraw.js      the field, the players, the scoreboard
//   gridironControls.js  the touch controls
//   gridironSeason.js    schedule, standings and playoffs
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { el, formatNumber } from "../core/utils.js";
import { confirmModal } from "../ui/modal.js";
import { TEAMS, teamById, OFF_PLAYS, SPECIAL_PLAYS, DEF_PLAYS, FORMATIONS } from "./gridironData.js";
import { FootballMatch } from "./gridironMatch.js";
import { drawMatch, pickKits, playSVG, defSVG } from "./gridironDraw.js";
import { TouchControls, DEFAULT_SETTINGS } from "./gridironControls.js";
import * as Season from "./gridironSeason.js";

const QUARTERS = [[2, "Quick · 2 min quarters"], [3, "Standard · 3 min"], [5, "Long · 5 min"]];
const WEEKS = [[6, "6 weeks"], [10, "10 weeks"], [17, "Full · 17 weeks"]];
const DIFF_MULT = { Rookie: 0.7, Pro: 1, "All-Pro": 1.4 };
const KEY_LETTERS = { Digit1: "A", Digit2: "B", Digit3: "X", Digit4: "Y", Digit5: "RB" };

const badge = (t, cls = "gi-badge") => el("span", { class: cls, style: `--c1:${t.c1};--c2:${t.c2}` }, t.abbr);
const stars = (n) => "★".repeat(n) + "☆".repeat(3 - n);

export class GridironGame extends GameBase {
  getDifficulties() { return ["Rookie", "Pro", "All-Pro"]; }
  getInstructions() {
    return [
      "Season: pick a team, play a different opponent every week, finish top eight and win three playoff games to lift the Championship. Quick Game: any two teams.",
      "Before each play the playbook opens: scroll the cards, tap one, pick a formation and press Start play. Tap a receiver's letter before the snap to change his route.",
      "Quarterback: left thumb moves, SNAP starts the play, hold SPRINT to run. Tap a receiver's letter (A, B, X, Y, RB) for a quick pass, or hold it and let go for a lob, touch or bullet throw.",
      "With the ball: Juke left/right, Spin, Stiff arm, Hurdle, Dive, Cut and Protect the ball. Each one only works as well as the runner's agility or strength.",
      "Defence: tap a defender to take him over (or SWITCH). TACKLE, jump for an INTerception or SWAT the ball away. Your teammates play their zone or man on their own.",
      "Settings (⚙) change the size, height and opacity of the buttons, a left-handed layout and a floating stick.",
    ];
  }
  getKeyboardHint() { return "WASD move · Shift sprint · Space snap · 1–5 pass (hold for power) · Q/E juke · R spin · F stiff arm · V hurdle · C dive · G cut · X protect · T tackle · I int · O swat · Tab switch · B playbook · K camera."; }
  getTouchHint() { return "Left thumb: stick. Right thumb: SNAP, SPRINT and moves. Tap a receiver's letter to throw — hold it for power."; }
  getTouchLayout() { return "none"; }
  getScene() { return "arena"; }
  getPlayLabel() { return this._store().season ? "Continue season" : "Play"; }

  // Portrait phones get a tall field instead of a thin letterbox.
  _fitStage() {
    this._baseRatio = this._baseRatio || this.meta.ratio;
    const portrait = window.innerHeight > window.innerWidth * 1.05 && !this.isFullscreen?.();
    const want = portrait && window.innerWidth < 820 ? "10/15" : this._baseRatio;
    if (this.meta.ratio !== want) this.meta = { ...this.meta, ratio: want };
    super._fitStage();
  }

  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.gk) custom.gk = { season: null, titles: 0, games: 0, wins: 0, quarter: 3, weeks: 10, settings: { ...DEFAULT_SETTINGS }, best: null };
    const s = custom.gk;
    if (!s.settings) s.settings = {};
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (s.settings[k] === undefined) s.settings[k] = v;
    return s;
  }
  _save() { saveManager.saveNow(); }
  settings() { return this._store().settings; }

  getStartExtras() {
    const s = this._store();
    const se = s.season;
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `🏆 Championships: ${s.titles || 0}`),
      el("span", {}, `${s.games || 0} games · ${s.wins || 0} wins`),
      se ? el("span", {}, `Season: ${teamById(se.user).name} · ${se.playoffs ? Season.ROUND_NAMES[se.playoffs.round] : `Week ${se.week + 1}/${se.weeks}`}`) : null,
    ]);
  }

  // -------------------------------------------------------------- setup --
  onInit() {
    this.difficulty = "Pro";
    this.createCanvas();
    this.hubEl = el("div", { class: "gg-hub gi-hub" });
    this.panelEl = el("div", { class: "gi-panel", hidden: true });
    this.stageEl.appendChild(this.hubEl);
    this.stageEl.appendChild(this.panelEl);
    this.stageEl.classList.add("gi-stage");
    this.controls = new TouchControls({
      canvas: this.canvas, input: this.input,
      getMatch: () => this.match, settings: () => this.settings(),
      onTopButton: (id) => this._topButton(id),
    });
    this._keyHeld = new Set();
    const K = (code, fn) => this.input.onKey(code, () => { if (this.match && this.mode === "match" && !this.panelOpen) fn(); });
    K("Space", () => { const m = this.match; if (m.phase === "presnap") m.snap(); });
    for (const [code, letter] of Object.entries(KEY_LETTERS)) K(code, () => {
      const m = this.match;
      if (m.phase === "pat" && m.poss === "user") { if (code === "Digit1") m.choosePat("kick"); if (code === "Digit2") m.choosePat("two"); return; }
      if (this.controls.mode === "qb" && !this.controls.charge) this.controls.charge = { letter, id: "key:" + code, t0: performance.now() };
    });
    const moves = { KeyQ: "jukeL", KeyE: "jukeR", KeyR: "spin", KeyF: "stiff", KeyV: "hurdle", KeyC: "dive", KeyG: "cut", KeyT: "tackle", KeyI: "int", KeyO: "swat" };
    for (const [code, act] of Object.entries(moves)) K(code, () => this.match.action(act));
    K("Tab", () => this.controls._press("switch", this.match));
    K("KeyB", () => this._topButton("plays"));
    K("KeyK", () => this._topButton("cam"));
  }

  onStart() {
    this.match = null;
    const se = this._store().season;
    this.setScore(se ? se.score : 0);
    if (se) this._showSeason(); else this._showMenu();
  }

  onDestroy() { this.controls?.destroy(); this._save(); }

  _setMode(mode) {
    this.mode = mode;
    this.hubEl.hidden = mode === "match";
    if (mode === "match") document.activeElement?.blur?.();
    if (mode !== "match") this._closePanel();
    this.tipEl.textContent = mode === "match"
      ? (this.useTouch ? "Left thumb: stick · right thumb: SNAP, SPRINT, moves · tap a receiver's letter to pass." : "WASD move · Space snap · 1–5 pass (hold for power) · Shift sprint · B playbook.")
      : "Tip: every game can be played or simulated — your season is saved after each week.";
  }

  // ------------------------------------------------------------- frame ---
  onUpdate(dt) {
    const m = this.match;
    if (!m || this.mode !== "match") return;
    // Keyboard into the controls.
    const I = this.input;
    this.controls.keys.x = (I.isDown("ArrowRight", "KeyD") ? 1 : 0) - (I.isDown("ArrowLeft", "KeyA") ? 1 : 0);
    this.controls.keys.y = (I.isDown("ArrowDown", "KeyS") ? 1 : 0) - (I.isDown("ArrowUp", "KeyW") ? 1 : 0);
    this._keyHeld.clear();
    if (I.isDown("ShiftLeft", "ShiftRight")) this._keyHeld.add("sprint");
    if (I.isDown("KeyX")) this._keyHeld.add("protect");
    const ch = this.controls.charge;
    if (ch && String(ch.id).startsWith("key:") && !I.isDown(ch.id.slice(4))) this.controls._release();
    if (this.panelOpen) return;            // the playbook or settings is up: the game waits
    this.controls.feed(this._keyHeld);
    m.update(dt);
    if (m.phase === "playbook" && !this.panelOpen) this._openPlaybook();
    if (m.finished) {
      this._endT = (this._endT || 0) + dt;
      if (this._endT > 3) { this._endT = 0; this._matchOver(); }
    }
  }

  onRender(ctx) {
    const w = this.viewW, h = this.viewH, dpr = this.dpr || 1;
    if (!w || !h) return;
    const m = this.match;
    if (m && this.mode === "match") {
      drawMatch(ctx, m, w, h, dpr, this.kits, { aim: this.controls.aim() });
      this.controls.layout(w, h);
      this.controls.draw(ctx, { touch: this.useTouch });
      if (!this.useTouch) this._keyLegend(ctx, w, h);
    } else this._backdrop(ctx, w, h, dpr);
  }

  _keyLegend(ctx, w, h) {
    const mode = this.controls.mode;
    const t = { "presnap-off": "Space: SNAP · B: playbook · tap a letter: hot route", "presnap-def": "Space: ready · Tab: switch · B: playbook", qb: "1–5: pass (hold = power) · Shift: sprint", run: "Q/E juke · R spin · F stiff · V hurdle · C dive · G cut · X protect", def: "T tackle · I intercept · O swat · Tab switch" }[mode];
    if (!t) return;
    ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = "center";
    const tw = ctx.measureText(t).width + 18;
    ctx.fillStyle = "rgba(8,10,20,0.7)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(w / 2 - tw / 2, h - 30, tw, 22, 10) : ctx.rect(w / 2 - tw / 2, h - 30, tw, 22); ctx.fill();
    ctx.fillStyle = "#e8ecf4"; ctx.fillText(t, w / 2, h - 15);
  }

  _backdrop(ctx, w, h, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0b1424"); g.addColorStop(1, "#14361f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 2;
    const t = performance.now() / 4000;
    for (let i = 0; i < 12; i++) { const x = ((i / 12 + t * 0.05) % 1) * w; ctx.beginPath(); ctx.moveTo(x, h * 0.45); ctx.lineTo(x - w * 0.2, h); ctx.stroke(); }
  }

  _topButton(id) {
    const m = this.match;
    if (!m) return;
    if (id === "cam") {
      const order = ["auto", "close", "wide"];
      m.cam.mode = order[(order.indexOf(m.cam.mode) + 1) % order.length];
      this.settings().camera = m.cam.mode; this._save();
      audioManager.play("toggle");
    } else if (id === "settings") this._openSettings(true);
    else if (id === "plays") {
      if (m.phase === "presnap") { m.phase = "playbook"; m.pbSide = m.poss === "user" ? "off" : "def"; this._openPlaybook(); }
    }
  }

  // =========================================================== menus ======
  _screen(cls, children) {
    this._setMode("hub");
    this.hubEl.innerHTML = "";
    const node = el("div", { class: `gg-screen ${cls}` }, children);
    this.hubEl.appendChild(node);
    this.hubEl.scrollTop = 0;
    return node;
  }

  _showMenu() {
    const s = this._store();
    this.setHud({ Mode: "Menu" });
    const card = (kind, icon, title, blurb, extra) => el("button", { class: `gg-mode gi-mode-${kind}`, onClick: () => { audioManager.play("click"); this._pickTeam(kind); } }, [
      el("span", { class: "ic" }, icon), el("span", { class: "t" }, title), el("span", { class: "d" }, blurb), extra ? el("span", { class: "won" }, extra) : null,
    ]);
    const chips = (list, key) => el("div", { class: "gg-chips" }, list.map(([v, label]) => el("button", {
      class: `chip${s[key] === v ? " active" : ""}`,
      onClick: (e) => { s[key] = v; this._save(); audioManager.play("select"); [...e.currentTarget.parentNode.children].forEach(c => c.classList.toggle("active", c === e.currentTarget)); },
    }, label)));
    this._screen("gg-menu", [
      el("div", { class: "gg-brand" }, [
        el("div", { class: "gi-logo" }, "🏈"),
        el("div", {}, [el("h2", {}, "Gridiron Kings"), el("p", {}, "32 teams · real stars · built for two thumbs")]),
      ]),
      el("div", { class: "gg-modes" }, [
        card("season", "🏆", "Season", "Play a season against the league, then the playoffs and the Championship.", `${s.titles || 0}× champion`),
        card("quick", "🏈", "Quick Game", "Pick any two teams and play one game.", null),
      ]),
      el("div", { class: "gg-opt" }, [el("span", { class: "lbl" }, "Quarter length"), chips(QUARTERS, "quarter")]),
      el("div", { class: "gg-opt" }, [el("span", { class: "lbl" }, "Season length"), chips(WEEKS, "weeks")]),
      el("div", { class: "gg-opt" }, [el("span", { class: "lbl" }, "Controls"), el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._openSettings(false) }, "⚙ Touch controls & camera")]),
      el("div", { class: "gg-opt" }, [el("span", { class: "lbl" }, "Difficulty"), el("span", { class: "val" }, `${this.difficulty} — change it on the start screen`)]),
    ]);
  }

  _pickTeam(kind, step = 0, picked = null) {
    let chosen = null;
    const grid = el("div", { class: "gg-teams gi-teams" });
    const go = el("button", { class: "btn btn-primary", disabled: true }, step ? "Choose opponent" : "Choose a team");
    const list = [...TEAMS].filter(t => t.id !== picked).sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
    for (const t of list) {
      grid.appendChild(el("button", {
        class: "gg-team gi-team", "data-k": t.id, style: `--kit:${t.c1};--trim:${t.c2}`,
        onClick: () => {
          chosen = t.id; audioManager.play("select");
          grid.querySelectorAll(".gi-team").forEach(n => n.classList.toggle("sel", n.dataset.k === t.id));
          go.disabled = false;
          go.textContent = step ? `Play against ${t.name}` : kind === "quick" ? `Pick ${t.name}` : `Start the season with ${t.name}`;
        },
      }, [
        badge(t),
        el("span", { class: "nm" }, t.name),
        el("span", { class: "rt" }, [el("b", {}, String(t.ovr)), el("i", {}, `QB ${t.qb.name}`)]),
        el("span", { class: "kit" }),
      ]));
    }
    go.addEventListener("click", () => {
      if (!chosen) return;
      audioManager.play("start");
      if (kind === "quick" && !step) { this._pickTeam("quick", 1, chosen); return; }
      if (kind === "quick") { this._startQuick(picked, chosen); return; }
      const st = this._store();
      st.season = Season.createSeason(chosen, st.weeks || 10);
      st.season.quarter = st.quarter || 3; st.season.diff = this.difficulty;
      this._save();
      this.setScore(0);
      this._showSeason();
    });
    this._screen("gg-pick", [
      el("div", { class: "gg-head" }, [
        el("button", { class: "btn btn-ghost btn-sm", onClick: () => (step ? this._pickTeam(kind) : this._showMenu()) }, "← Back"),
        el("div", { class: "gg-title" }, [el("h3", {}, step ? "Pick the opponent" : kind === "quick" ? "Pick your team" : "🏆 Season"), el("p", {}, step ? `${teamById(picked).name} will be playing` : "Every team has its real stars — the overall rating is the whole roster")]),
      ]),
      grid,
      el("div", { class: "gg-footer" }, [go]),
    ]);
  }

  _teamSheet(t) {
    const row = (pos, p) => el("div", { class: "gi-pl" }, [el("span", { class: "pos" }, pos), el("b", {}, `#${p.num} ${p.name}`), el("span", { class: "ov" }, String(p.ovr))]);
    return el("div", { class: "gi-sheet" }, [
      row("QB", t.qb), row("RB", t.rb), row("WR", t.wr[0]), row("WR", t.wr[1]), row("TE", t.te),
      row("DL", t.dl[0]), row("LB", t.lb[0]), row("CB", t.cb[0]), row("S", t.s[0]),
    ]);
  }

  // ---------------------------------------------------------- season ---
  _season() { return this._store().season; }

  _showSeason(tab = null) {
    const s = this._season();
    if (!s) { this._showMenu(); return; }
    if (s.done) { this._showFinale(); return; }
    const user = teamById(s.user);
    const g = Season.userGame(s);
    const stage = s.playoffs ? Season.ROUND_NAMES[s.playoffs.round] : `Week ${s.week + 1} of ${s.weeks}`;
    this.setHud({ Mode: "Season", Stage: stage });
    const rec = s.table[s.user];
    let next = null;
    if (g) {
      const A = teamById(g.a), B = teamById(g.b);
      next = el("div", { class: "gg-next" }, [
        el("div", { class: "lbl" }, `${stage}${s.playoffs ? " · win or go home" : ""}`),
        el("div", { class: "vs" }, [
          el("div", { class: `side${g.a === s.user ? " me" : ""}` }, [badge(A, "gi-badge lg"), el("b", {}, A.name), el("span", {}, `OVR ${A.ovr} · ${A.qb.name}`)]),
          el("div", { class: "mid" }, "VS"),
          el("div", { class: `side${g.b === s.user ? " me" : ""}` }, [badge(B, "gi-badge lg"), el("b", {}, B.name), el("span", {}, `OVR ${B.ovr} · ${B.qb.name}`)]),
        ]),
        el("div", { class: "acts" }, [
          el("button", { class: "btn btn-primary btn-lg", onClick: () => this._playSeasonGame() }, "▶  Play game"),
          el("button", { class: "btn btn-ghost", onClick: () => this._simSeasonGame() }, "Simulate"),
        ]),
      ]);
    }
    let cur = tab || (s.playoffs ? "bracket" : "table");
    const body = el("div", { class: "gg-tabbody" });
    const bar = el("div", { class: "gg-tabs" });
    const opts = [["table", "Standings"], ["games", "My games"], ["roster", "My team"]];
    if (s.playoffs) opts.unshift(["bracket", "Playoffs"]);
    const draw = () => {
      bar.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.t === cur));
      body.innerHTML = "";
      if (cur === "table") body.appendChild(this._table(s));
      else if (cur === "games") body.appendChild(this._myGames(s));
      else if (cur === "roster") body.appendChild(this._teamSheet(user));
      else body.appendChild(this._bracket(s));
    };
    opts.forEach(([k, label]) => bar.appendChild(el("button", { "data-t": k, onClick: () => { cur = k; audioManager.play("toggle"); draw(); } }, label)));
    draw();
    this._screen("gg-tour", [
      el("div", { class: "gg-head" }, [
        el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._confirmAbandon() }, "Abandon"),
        el("div", { class: "gg-title" }, [el("h3", {}, [badge(user), ` ${user.name}`]), el("p", {}, `${rec.w}–${rec.l}${rec.t ? "–" + rec.t : ""} · ${stage} · ${formatNumber(s.score)} pts`)]),
      ]),
      next,
      el("div", { class: "gg-panel" }, [bar, body]),
    ]);
  }

  _table(s) {
    const rows = Season.standings(s);
    return el("table", { class: "gg-table" }, [
      el("thead", {}, el("tr", {}, ["", "Team", "W", "L", "T", "PF", "PA"].map(h => el("th", {}, h)))),
      el("tbody", {}, rows.map((r, i) => {
        const t = teamById(r.id);
        return el("tr", { class: `${r.id === s.user ? "me " : ""}z-${i < 8 ? "q" : "n"}` }, [
          el("td", { class: "pos" }, String(i + 1)), el("td", { class: "tm" }, [badge(t), el("span", {}, t.name)]),
          el("td", {}, String(r.w)), el("td", {}, String(r.l)), el("td", {}, String(r.t)), el("td", {}, String(r.pf)), el("td", { class: "pts" }, String(r.pa)),
        ]);
      })),
    ]);
  }

  _myGames(s) {
    const list = el("div", { class: "gg-fixtures" });
    const add = (g, label) => {
      const A = teamById(g.a), B = teamById(g.b);
      const mine = g.a === s.user ? [g.sa, g.sb] : [g.sb, g.sa];
      const res = g.played ? (mine[0] > mine[1] ? "w" : mine[0] < mine[1] ? "l" : "d") : "";
      list.appendChild(el("div", { class: `gg-fx${res ? " r-" + res : ""}` }, [
        el("span", { class: "st" }, label),
        el("span", { class: `a${g.a === s.user ? " me" : ""}` }, [el("span", {}, A.name), badge(A)]),
        el("span", { class: "sc" }, g.played ? `${g.sa} – ${g.sb}` : "v"),
        el("span", { class: `b${g.b === s.user ? " me" : ""}` }, [badge(B), el("span", {}, B.name)]),
      ]));
    };
    s.schedule.forEach((wk, i) => { const g = wk.find(x => x.a === s.user || x.b === s.user); if (g) add(g, `Wk ${i + 1}`); });
    if (s.playoffs) s.playoffs.rounds.forEach((r, i) => { const g = r.find(x => x.a === s.user || x.b === s.user); if (g) add(g, Season.ROUND_NAMES[i]); });
    return list;
  }

  _bracket(s) {
    const P = s.playoffs;
    if (!P) return el("p", {}, "The top eight make the playoffs.");
    return el("div", { class: "gg-bracket" }, P.rounds.map((r, i) => el("div", { class: "col" }, [
      el("div", { class: "gg-sub" }, Season.ROUND_NAMES[i]),
      ...r.map(g => {
        const w = g.played ? (g.sa > g.sb ? g.a : g.b) : null;
        const line = (id, sc) => { const t = teamById(id); return el("div", { class: `ln${w === id ? " win" : ""}${id === s.user ? " me" : ""}` }, [badge(t), el("span", { class: "n" }, t.abbr), el("b", {}, g.played ? String(sc) : "")]); };
        return el("div", { class: "tie" }, [line(g.a, g.sa), line(g.b, g.sb)]);
      }),
    ])));
  }

  async _confirmAbandon() {
    const ok = await confirmModal({ title: "Abandon this season?", message: "Your season will be thrown away. Championships you already won are kept.", confirmLabel: "Abandon", danger: true });
    if (!ok) return;
    this._store().season = null;
    this._save();
    this.setScore(0);
    this._showMenu();
  }

  _playSeasonGame() {
    const s = this._season();
    const g = Season.userGame(s);
    if (!g) return;
    const opp = g.a === s.user ? g.b : g.a;
    this._startMatch(s.user, opp, s.quarter || 3, s.diff || this.difficulty, "season");
  }

  _simSeasonGame() {
    const s = this._season();
    const g = Season.userGame(s);
    const opp = g.a === s.user ? g.b : g.a;
    const [u, c] = Season.simulateGame(s.user, opp, this.difficulty === "Rookie" ? 4 : 0);
    audioManager.play("click");
    this._seasonResult(u, c, false);
  }

  _seasonResult(u, c, played) {
    const s = this._season();
    const g = Season.userGame(s);
    const opp = teamById(g.a === s.user ? g.b : g.a);
    const wasPlayoffs = !!s.playoffs;
    if (wasPlayoffs && u === c) u += 3;
    const mult = DIFF_MULT[s.diff] || 1;
    const pts = Math.round(((u > c ? 400 : u === c ? 120 : 0) + u * 20 + (wasPlayoffs && u > c ? 800 : 0)) * mult * (played ? 1 : 0.5));
    s.score += pts;
    const st = this._store();
    if (played) { st.games = (st.games || 0) + 1; if (u > c) st.wins = (st.wins || 0) + 1; }
    Season.finishWeek(s, u, c);
    if (s.champion === s.user) s.score += Math.round(10000 * mult);
    this.setScore(s.score);
    this._save();
    const user = teamById(s.user);
    const verdict = u > c ? "Victory!" : u < c ? "Defeat" : "Tie";
    this._screen("gg-results", [
      el("div", { class: `gg-result ${u > c ? "won" : u === c ? "drew" : "lost"}` }, [
        el("div", { class: "verdict" }, verdict),
        el("div", { class: "line" }, [
          el("div", { class: "side" }, [badge(user, "gi-badge lg"), el("b", {}, user.name)]),
          el("div", { class: "score" }, [el("span", {}, `${u} – ${c}`)]),
          el("div", { class: "side" }, [badge(opp, "gi-badge lg"), el("b", {}, opp.name)]),
        ]),
        this.lastStats && played ? this._statLine(this.lastStats) : null,
        el("div", { class: "pts" }, `+${formatNumber(pts)} pts${played ? "" : " (simulated: half points)"}`),
      ]),
      el("div", { class: "gg-footer" }, [el("button", { class: "btn btn-primary btn-lg", onClick: () => this._showSeason() }, s.done ? "Continue" : "Next week")]),
    ]);
    audioManager.play(u > c ? "win" : u === c ? "select" : "lose");
  }

  _statLine(st) {
    const u = st.user;
    return el("div", { class: "gi-stats" }, [
      el("span", {}, `Passing ${u.comp}/${u.att} · ${u.passYds} yds`),
      el("span", {}, `Rushing ${u.rushYds} yds`),
      el("span", {}, `TD ${u.td} · INT ${u.int}`),
      el("span", {}, `Sacks ${st.cpu.sacks}`),
    ]);
  }

  _showFinale() {
    const s = this._season();
    const user = teamById(s.user);
    const champ = teamById(s.champion);
    const won = s.champion === s.user;
    this._screen(`gg-finale${won ? " won" : ""}`, [
      el("div", { class: "trophy" }, won ? "🏆" : "🏈"),
      el("h2", {}, won ? `${user.name} are champions!` : `${champ.name} win the Championship`),
      el("p", {}, won ? "Three playoff wins — the trophy is yours." : `${user.name}'s season ended: ${s.out || "out"}.`),
      badge(champ, "gi-badge xl"),
      s.playoffs ? el("div", { class: "gg-panel" }, [this._bracket(s)]) : null,
      el("div", { class: "gg-footer" }, [el("button", { class: "btn btn-primary btn-lg", onClick: () => this._closeSeason() }, won ? "Lift the trophy" : "Finish")]),
    ]);
    if (won) audioManager.play("levelup");
  }

  _closeSeason() {
    const s = this._season();
    const st = this._store();
    const won = s.champion === s.user;
    if (won) st.titles = (st.titles || 0) + 1;
    const rec = s.table[s.user];
    const score = s.score;
    st.season = null;
    this._save();
    this.hubEl.innerHTML = "";
    this.endGame({ result: won ? "win" : "loss", score, message: won ? `${teamById(s.user).name} won the Championship!` : `Season over: ${s.out || ""}`, extraStats: [{ label: "Team", value: teamById(s.user).name }, { label: "Record", value: `${rec.w}–${rec.l}${rec.t ? "–" + rec.t : ""}` }] });
  }

  // ------------------------------------------------------------ quick ---
  _startQuick(a, b) {
    const st = this._store();
    this._startMatch(a, b, st.quarter || 3, this.difficulty, "quick");
  }

  // ------------------------------------------------------------ match ---
  _startMatch(userId, cpuId, quarterMin, difficulty, kind) {
    const user = teamById(userId), cpu = teamById(cpuId);
    this.kits = pickKits(user, cpu);
    this.matchKind = kind;
    this.match = new FootballMatch({ user, cpu, quarterMin, difficulty, camera: this.settings().camera });
    this._setMode("match");
    this.setHud({ Mode: kind === "season" ? "Season" : "Quick Game", Game: `${user.abbr} v ${cpu.abbr}` });
    audioManager.play("start");
  }

  _matchOver() {
    const m = this.match;
    const r = m.resultData;
    this.lastStats = r.stats;
    this.match = null;
    this._closePanel();
    if (this.matchKind === "season") { this._seasonResult(r.user, r.cpu, true); return; }
    const st = this._store();
    st.games = (st.games || 0) + 1;
    if (r.user > r.cpu) st.wins = (st.wins || 0) + 1;
    this._save();
    const mult = DIFF_MULT[this.difficulty] || 1;
    const score = Math.round(((r.user > r.cpu ? 500 : 0) + r.user * 25) * mult);
    this.hubEl.innerHTML = "";
    this.endGame({
      result: r.user > r.cpu ? "win" : r.user < r.cpu ? "loss" : "draw", score,
      message: `${m.user.name} ${r.user} – ${r.cpu} ${m.cpu.name}`,
      extraStats: [{ label: "Passing", value: `${r.stats.user.comp}/${r.stats.user.att}, ${r.stats.user.passYds} yds` }, { label: "Rushing", value: `${r.stats.user.rushYds} yds` }],
    });
  }

  // ======================================================== playbook ======
  _closePanel() { this.panelOpen = false; if (this.panelEl) { this.panelEl.hidden = true; this.panelEl.innerHTML = ""; } }

  _openPlaybook() {
    const m = this.match;
    if (!m || m.phase !== "playbook") return;
    this.panelOpen = true;
    const off = m.poss === "user";
    const situation = m.downText();
    let tab = "all";
    let sel = off ? (m.down === 4 && !m.twoPt ? null : m.lastPlay.user) : m.lastPlay.def;
    let form = sel?.forms ? sel.forms[0] : null;
    const P = this.panelEl;
    const suggest = (p) => {
      const tg = m.toGo, L = m.los;
      const s = (p.sit || "").toLowerCase();
      if (!off) return (tg <= 2 && /short|run/.test(s)) || (tg >= 8 && /deep|3rd|safe/.test(s) && !/short/.test(s));
      if (m.down === 4 && !m.twoPt) return p.kind === "fg" ? FL_IN_RANGE(L) : p.kind === "punt" ? !FL_IN_RANGE(L) : tg <= 1 && /short|goal/.test(s);
      if (L >= 90) return /goal|red zone/.test(s);
      if (tg <= 2) return /short|3rd & 1/.test(s);
      if (tg >= 8) return /long|deep|beats zone/.test(s);
      return /1st|2nd|medium/.test(s);
    };
    const render = () => {
      P.innerHTML = "";
      const plays = off ? [...OFF_PLAYS, ...(m.twoPt ? [] : SPECIAL_PLAYS)].filter(p => tab === "all" || (tab === "pass" ? p.kind === "pass" : tab === "run" ? p.kind === "run" || p.kind === "qbrun" : p.kind === "punt" || p.kind === "fg")) : DEF_PLAYS;
      const cards = el("div", { class: "gi-cards" }, plays.map(p => {
        const fm = p.forms ? (sel === p && form ? form : p.forms[0]) : null;
        return el("button", {
          class: `gi-card${sel === p ? " sel" : ""}${suggest(p) ? " sug" : ""}`,
          onClick: () => { sel = p; form = p.forms ? p.forms[0] : null; audioManager.play("select"); render(); },
        }, [
          el("div", { class: "gi-card-top" }, [el("b", {}, p.name), el("span", { class: "diff", title: "Difficulty" }, stars(p.diff))]),
          el("div", { class: "gi-diagram", html: off ? playSVG(p, fm, FORMATIONS) : defSVG(p) }),
          el("div", { class: "gi-card-meta" }, [
            el("span", { class: "form" }, off ? (p.forms ? FORMATIONS[fm].name : "Special teams") : ({ man: "Man coverage", cover2: "Cover 2 zone", cover3: "Cover 3 zone", cover0: "Cover 0 · all-out blitz", prevent: "Prevent · deep zones" })[p.cover]),
            el("span", { class: "sit" }, `${suggest(p) ? "★ " : ""}${p.sit}`),
          ]),
        ]);
      }));
      const formChips = sel?.forms && sel.forms.length > 1 ? el("div", { class: "gg-chips gi-forms" }, [el("span", { class: "lbl" }, "Formation"), ...sel.forms.map(f => el("button", {
        class: `chip${form === f ? " active" : ""}`, onClick: () => { form = f; audioManager.play("toggle"); render(); },
      }, FORMATIONS[f].name))]) : null;
      P.append(
        el("div", { class: "gi-pb-head" }, [
          el("div", {}, [el("b", {}, off ? (m.twoPt ? "Two-point try" : "Offense playbook") : "Defense playbook"), el("span", {}, `${m.user.abbr} ${m.score.user} – ${m.score.cpu} ${m.cpu.abbr} · ${m.quarterText()} ${m.ot ? "" : m.clockText()} · ${situation}`)]),
          el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._openSettings(true) }, "⚙"),
        ]),
        off ? el("div", { class: "gg-tabs gi-pbtabs" }, [["all", "All"], ["pass", "Pass"], ["run", "Run"], ...(m.twoPt ? [] : [["special", "Kick"]])].map(([k, label]) => el("button", { class: tab === k ? "active" : "", onClick: () => { tab = k; render(); } }, label))) : el("div", { class: "gi-hintline" }, `${m.cpu.name} have the ball. Pick a coverage — ★ marks calls that suit the down and distance.`),
        cards,
        el("div", { class: "gi-pb-foot" }, [
          formChips,
          el("button", { class: "btn btn-primary btn-lg gi-go", disabled: !sel || undefined, onClick: () => this._startPlay(sel, form) }, sel ? `Start play · ${sel.name}` : "Pick a play"),
        ]),
      );
      const s = P.querySelector(".gi-card.sel");
      if (s) s.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    P.hidden = false;
    P.classList.toggle("short", this.viewH < 470);
    render();
  }

  _startPlay(play, form) {
    const m = this.match;
    if (!m || !play) return;
    audioManager.play("click");
    this._closePanel();
    m.choosePlay(play, form);
  }

  // ======================================================== settings ======
  _openSettings(inMatch) {
    const st = this.settings();
    const P = inMatch ? this.panelEl : null;
    const box = el("div", { class: "gi-settings" });
    const slider = (key, label, min, max, step, fmt) => {
      const val = el("span", { class: "v" }, fmt(st[key]));
      const input = el("input", { type: "range", min, max, step, value: st[key] });
      input.addEventListener("input", () => { st[key] = +input.value; val.textContent = fmt(st[key]); this._save(); });
      return el("label", { class: "gi-set" }, [el("span", { class: "k" }, label), input, val]);
    };
    const toggle = (key, label, sub) => {
      const b = el("button", { class: `gi-toggle${st[key] ? " on" : ""}`, onClick: () => { st[key] = !st[key]; b.classList.toggle("on", st[key]); this._save(); audioManager.play("toggle"); } }, [el("i"), el("span", {}, [el("b", {}, label), sub ? el("small", {}, sub) : null])]);
      return b;
    };
    const cam = el("div", { class: "gg-chips" }, [["auto", "Auto (QB cam)"], ["close", "Close"], ["wide", "Wide · all-22"]].map(([v, label]) => el("button", {
      class: `chip${st.camera === v ? " active" : ""}`, onClick: (e) => { st.camera = v; if (this.match) this.match.cam.mode = v; this._save(); [...e.currentTarget.parentNode.children].forEach(c => c.classList.toggle("active", c === e.currentTarget)); },
    }, label)));
    box.append(
      el("h3", {}, "Touch controls"),
      slider("scale", "Button size", 0.7, 1.5, 0.05, v => `${Math.round(v * 100)}%`),
      slider("alpha", "Opacity", 0.2, 0.95, 0.05, v => `${Math.round(v * 100)}%`),
      slider("raise", "Height from the bottom", 0, 120, 5, v => `${v}px`),
      toggle("lefty", "Left-handed", "Stick on the right, buttons on the left"),
      toggle("floating", "Floating stick", "The stick appears wherever your thumb lands"),
      toggle("aimAssist", "Aim assist", "Shows where a charged pass will land"),
      toggle("vibrate", "Vibration", "A short buzz on every button"),
      el("h3", {}, "Camera"), cam,
    );
    if (inMatch) {
      this.panelOpen = true;
      P.innerHTML = "";
      P.hidden = false;
      const back = () => { if (this.match?.phase === "playbook") { this.panelOpen = false; this._openPlaybook(); } else this._closePanel(); };
      P.append(el("div", { class: "gi-pb-head" }, [el("div", {}, [el("b", {}, "Settings"), el("span", {}, "The game is paused · the buttons update live behind this panel")]), el("button", { class: "btn btn-primary btn-sm", onClick: back }, "Done")]), box);
      P.classList.add("gi-panel-settings");
      setTimeout(() => P.classList.remove("gi-panel-settings"), 0);
      return;
    }
    this._screen("gi-settings-screen", [
      el("div", { class: "gg-head" }, [el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._showMenu() }, "← Back"), el("div", { class: "gg-title" }, [el("h3", {}, "⚙ Controls"), el("p", {}, "Make the buttons fit your thumbs")])]),
      box,
    ]);
  }
}

function FL_IN_RANGE(los) { return 100 - los + 17 <= 52; }

export default GridironGame;
