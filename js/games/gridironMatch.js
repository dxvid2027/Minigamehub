// ==========================================================================
// Gridiron Kings — the match.
//
// Eleven against eleven on a 120 × 53⅓-yard field, in yards and seconds.
// Everything is simulated in the offence's frame: x runs from the offence's
// own goal line (0) to the opponent's (100), y across the field, so the side
// with the ball always attacks to the right (or up, on an upright phone).
// When possession changes, the field turns round with it.
//
// One play at a time: pre-snap → live → dead. While live, every player has a
// job — routes, pass protection, run blocks, rush lanes, man or zone
// coverage, pursuit — and the user drives one of them with the controls.
// Passing is physics, not a dice roll: the ball is led to where the target
// will be, inaccuracy grows with pressure and distance, it can be tipped by a
// defender underneath, and at the catch point the nearest players fight for
// it with their hands, ball skills and the user's timing.
//
// The simulation steps at a fixed 120 Hz so coverage reaction delays (read
// from each player's recent path) behave the same on every device.
// ==========================================================================
import { ROUTES, FORMATIONS, OFF_PLAYS, DEF_PLAYS, DIFFICULTY } from "./gridironData.js";
import { audioManager } from "../systems/audioManager.js";

export const FL = 100, FW = 160 / 3;          // field length (goal to goal) and width
export const CY = FW / 2;
const HASH0 = 23.58, HASH1 = FW - 23.58;
const STEP = 1 / 120;
const G = 10.7;                                // yards / s²
const HIST = 120;                              // one second of path history

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const hyp = Math.hypot;
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += Math.random(); return (s - 2) / 0.58; };

const MOVES = {
  jukeL:  { t: 0.32, cd: 0.8, label: "Juke ◀" },
  jukeR:  { t: 0.32, cd: 0.8, label: "Juke ▶" },
  spin:   { t: 0.45, cd: 1.1, label: "Spin" },
  stiff:  { t: 0.5,  cd: 1.0, label: "Stiff Arm" },
  hurdle: { t: 0.55, cd: 1.4, label: "Hurdle" },
  dive:   { t: 0.6,  cd: 9,   label: "Dive" },
  cut:    { t: 0.22, cd: 0.55, label: "Cut" },
};
export { MOVES };

export class FootballMatch {
  /**
   * opts: { user, cpu (team objects), userKit, cpuKit, quarterMin, difficulty,
   *         label, otOnly (college-style overtime only, for 2-pt drills) }
   */
  constructor(opts) {
    this.o = opts;
    this.user = opts.user; this.cpu = opts.cpu;
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.Pro;
    this.qlen = (opts.quarterMin || 3) * 60;
    this.score = { user: 0, cpu: 0 };
    this.quarter = 1;
    this.clock = this.qlen;
    this.t = 0;
    this.finished = false;
    this.events = [];
    this.stats = { user: { passYds: 0, rushYds: 0, comp: 0, att: 0, td: 0, int: 0, sacks: 0 }, cpu: { passYds: 0, rushYds: 0, comp: 0, att: 0, td: 0, int: 0, sacks: 0 } };
    this.banner = null;
    this.flash = [];
    this.fx = [];
    this.cam = { x: 30, y: CY, z: 20, mode: opts.camera || "auto" };
    this.lastPlay = { user: OFF_PLAYS[0], def: DEF_PLAYS[0] };
    this.receiving = Math.random() < 0.5 ? "user" : "cpu";
    this.ot = null;
    this.players = [];
    this.ball = null;
    this._acc = 0;
    // Opening kickoff.
    this._kickoff(this.receiving === "user" ? "cpu" : "user", true);
  }

  // ------------------------------------------------------------ helpers ---
  get userOnOffense() { return this.poss === "user"; }
  teamOf(side) { return side === "user" ? this.user : this.cpu; }
  opp(side) { return side === "user" ? "cpu" : "user"; }
  _adj(side) { return side === "user" ? this.diff.user : this.diff.cpu; }

  _say(title, sub = "", kind = "info", time = 1.8) { this.banner = { title, sub, kind, t: 0, time }; }

  /** Situation text: "2nd & 7 · OWN 35". */
  downText() {
    if (this.special) return this.special;
    const n = ["1st", "2nd", "3rd", "4th"][this.down - 1] || "4th";
    const goal = this.los + this.toGo >= FL;
    const where = this.los === 50 ? "50" : this.los < 50 ? `OWN ${Math.round(this.los)}` : `OPP ${Math.round(FL - this.los)}`;
    return `${n} & ${goal ? "Goal" : Math.max(1, Math.round(this.toGo))} · ${where}`;
  }
  clockText() {
    const s = Math.max(0, Math.ceil(this.clock));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  quarterText() { return this.quarter > 4 ? "OT" : `Q${this.quarter}`; }

  // ------------------------------------------------------- possessions ---
  _kickoff(kicker, opening = false) {
    const recv = this.opp(kicker);
    this.poss = recv;
    // Touchback to the 35, or a return somewhere between the 20 and 45.
    const tb = Math.random() < 0.62;
    this.los = tb ? 35 : Math.round(clamp(rand(18, 46) + (Math.random() < 0.04 ? 30 : 0), 15, 75));
    this.ballY = CY;
    this.down = 1; this.toGo = 10;
    this.special = null;
    this.kick = { kind: "kickoff", t: 0, dur: 1.8, from: 100 - 35, to: this.los, tb };
    this.phase = "kick";
    const T = this.teamOf(recv);
    this._say(opening ? "KICKOFF" : "KICKOFF", tb ? `Touchback · ${T.name} ball at the 35` : `${T.name} return it to the ${this.los <= 50 ? "own " + this.los : "opp " + (100 - this.los)}`, "info", 2);
  }

  _changePossession(newLosForNewTeam) {
    this.poss = this.opp(this.poss);
    this.los = clamp(newLosForNewTeam, 1, 99);
    this.down = 1; this.toGo = Math.min(10, FL - this.los);
    this.special = null;
  }

  // ------------------------------------------------------------ pre-snap --
  /** Sets the next play up. Called after kicks and dead balls. */
  _nextPlay() {
    if (this.finished) return;
    if (this._clockCheck()) return;
    this.players = [];
    this.ball = null;
    this.result = null;
    if (this.poss === "user") { this.phase = "playbook"; this.pbSide = "off"; }
    else { this.phase = "playbook"; this.pbSide = "def"; }
    // The CPU picks its call now; the user's playbook opens.
    if (this.poss === "cpu") this.cpuOff = this._cpuOffenseCall();
    else this.cpuDef = this._cpuDefenseCall();
  }

  /** The user picked a play in the playbook (offence or defence). */
  choosePlay(play, form) {
    if (this.phase !== "playbook") return;
    if (play.kind === "punt" || play.kind === "fg") { this._specialTeams(this.poss, play.kind); return; }
    if (this.poss === "user") { this.offPlay = play; this.offForm = form || play.forms[0]; this.defPlay = this.cpuDef || this._cpuDefenseCall(); this.lastPlay.user = play; }
    else {
      this.defPlay = play; this.lastPlay.def = play;
      if (!this.cpuOff) this.cpuOff = this._cpuOffenseCall();
      if (this.cpuOff.special) { this._specialTeams("cpu", this.cpuOff.special); return; }
      this.offPlay = this.cpuOff.play; this.offForm = this.cpuOff.form;
    }
    this.hotRoutes = {};
    this.flipped = false;
    this._setupPlay();
  }

  setFormation(form) { if (this.phase === "presnap" && this.poss === "user" && this.offPlay.forms.includes(form)) { this.offForm = form; this._setupPlay(); } }
  flipFormation() { if (this.phase === "presnap" && this.poss === "user") { this.flipped = !this.flipped; this._setupPlay(); } }
  setHotRoute(letter, route) {
    if (this.phase !== "presnap" || this.poss !== "user") return;
    this.hotRoutes[letter] = route;
    const p = this.players.find(q => q.letter === letter);
    if (p) this._assignRoute(p, route);
    audioManager.play("select");
  }

  _setupPlay() {
    const off = this.teamOf(this.poss), def = this.teamOf(this.opp(this.poss));
    const offAdj = this._adj(this.poss), defAdj = this._adj(this.opp(this.poss));
    const F = FORMATIONS[this.offForm];
    const L = this.los, by = this.ballY, fl = this.flipped ? -1 : 1;
    const ps = [];
    const mk = (side, role, p, x, y, adj) => {
      const q = { side, role, p: boost(p, adj), x, y, vx: 0, vy: 0, face: side === "O" ? 0 : Math.PI, dvx: 0, dvy: 0, hist: [], walk: Math.random() * 6, cd: 0, slow: 0, move: null, moveCd: 0, down: 0, eng: null, engCd: 0 };
      ps.push(q);
      return q;
    };
    // Offence.
    const C = mk("O", "OL", off.ol[2], L - 0.6, by, offAdj);
    C.center = true;
    [-4, -2, 2, 4].forEach((dy, i) => mk("O", "OL", off.ol[[0, 1, 3, 4][i]], L - 0.8 - (Math.abs(dy) > 3 ? 0.4 : 0), by + dy, offAdj));
    const qb = mk("O", "QB", off.qb, L - F.qb[0], by, offAdj);
    if (F.rb) { const rb = mk("O", "RB", off.rb, L - F.rb[0], by + F.rb[1] * fl, offAdj); rb.letter = "RB"; }
    if (F.fb) { const fb = mk("O", "TE", off.fb, L - F.fb[0], by + F.fb[1], offAdj); fb.fb = true; }
    let wi = 0, ti = 0;
    for (const [letter, pos, back, lat] of F.skill) {
      const pl = pos === "WR" ? off.wr[wi++ % 3] : pos === "TE" ? (ti++ === 0 ? off.te : off.te2) : off.rb;
      const y = clamp(by + lat * fl, 2.5, FW - 2.5);
      const q = mk("O", pos === "RB" ? "RB" : pos, pl, L - back, y, offAdj);
      q.letter = letter;
    }
    const fbp = ps.find(p => p.fb);
    this.qb = qb;
    const play = this.offPlay;
    for (const p of ps) if (p.letter) this._assignRoute(p, this.hotRoutes[p.letter] || play.routes?.[p.letter] || (p.role === "RB" ? "block" : "go"));
    if (fbp) fbp.route = { block: true, pts: [] };

    // Defence: 4 DL, 3 LB, 2 CB, 2 S.
    const D = this.defPlay;
    const box = D.box ? -1.5 : 0;
    [-4.6, -1.6, 1.6, 4.6].forEach((dy, i) => { const d = mk("D", "DL", def.dl[i], L + 1.1, by + dy, defAdj); d.job = "rush"; d.dl = i; });
    const lbs = [-5, 0, 5].map((dy, i) => mk("D", "LB", def.lb[i], L + 5 + box, by + dy, defAdj));
    lbs.forEach((l, i) => (l.tag = "LB" + i));
    const elig = ps.filter(p => p.side === "O" && p.letter).sort((a, b) => a.y - b.y);
    const wideL = elig.filter(p => p.role === "WR")[0] || elig[0];
    const wideR = elig.filter(p => p.role === "WR").slice(-1)[0] || elig[elig.length - 1];
    const cb0 = mk("D", "CB", def.cb[0], L + 6, wideL.y, defAdj); cb0.tag = "CB0";
    const cb1 = mk("D", "CB", def.cb[1], L + 6, wideR.y, defAdj); cb1.tag = "CB1";
    const s0 = mk("D", "S", def.s[0], L + 13, CY - 10, defAdj); s0.tag = "S0";
    const s1 = mk("D", "S", def.s[1], L + 12, CY + 10, defAdj); s1.tag = "S1";
    this.players = ps;
    this._assignDefense(D, elig, wideL, wideR);
    // Place zone/man defenders at their pre-snap spots.
    for (const d of ps.filter(p => p.side === "D" && p.role !== "DL")) {
      if (d.job === "man" && d.man) { d.x = L + (d.role === "CB" ? (D.cover === "cover0" ? 1.6 : 5.5) : 4.5); d.y = d.man.y + (d.man.y < CY ? 1 : -1); }
      else if (d.job === "rush") { d.x = L + 3.5; }
      else if (d.zone) { d.x = L + clamp(d.zone[0] - L, 4, 14); d.y = d.zone[1] * 0.6 + d.y * 0.4; }
      d.x = Math.max(d.x, L + 1.2);
    }
    this.ball = { state: "held", carrier: C, x: C.x, y: C.y, z: 0.5 };
    this.phase = "presnap";
    this.snapT = 0;
    this.playT = 0;
    this.thrown = false;
    this.target = null;
    this.result = null;
    this.userSel = this.poss === "user" ? qb : (lbs[1]);
    this.passAim = null;
    if (this.poss === "cpu") this.cpuSnapIn = 1.6;     // the CPU snaps on its own when the user is on defence
  }

  _assignRoute(p, routeId) {
    const R = ROUTES[routeId] || ROUTES.go;
    const inward = p.y < CY ? 1 : -1;
    p.routeId = routeId;
    p.route = { block: !!R.block, stops: !!R.stops, i: 0, pts: R.pts.map(([f, l]) => [p.x + f, clamp(p.y + l * inward, 1, FW - 1)]) };
  }

  _assignDefense(D, elig, wideL, wideR) {
    const L = this.los;
    const by = (tag) => this.players.find(p => p.tag === tag);
    const others = elig.filter(p => p !== wideL && p !== wideR);
    const te = elig.find(p => p.letter === "Y") || others[0];
    const rb = this.players.find(p => p.role === "RB");
    const slot = others.find(p => p !== te && p.role !== "RB");
    const man = (d, r) => { if (!r) { d.job = "zone"; d.zone = [L + 9, d.y]; return; } d.job = "man"; d.man = r; };
    const zone = (d, x, y, deep = false) => { d.job = "zone"; d.zone = [L + x, y]; d.deep = deep; };
    const C = D.cover;
    if (C === "man" || C === "cover0") {
      man(by("CB0"), wideL); man(by("CB1"), wideR);
      man(by("S1"), te || slot || rb);
      if (rb) man(by("LB0"), rb); else zone(by("LB0"), 7, CY - 6);
      if (slot) man(by("LB1"), slot); else zone(by("LB1"), 7, CY + 6);
      zone(by("LB2"), 6, CY);
      if (C === "man") zone(by("S0"), 20, CY, true); else if (others.length > 2) man(by("S0"), others.find(o => ![te, slot, rb].includes(o)) || slot); else zone(by("S0"), 16, CY, true);
    } else if (C === "cover2") {
      zone(by("CB0"), 5, 8); zone(by("CB1"), 5, FW - 8);
      zone(by("S0"), 18, 14, true); zone(by("S1"), 18, FW - 14, true);
      zone(by("LB0"), 8, 18); zone(by("LB1"), 8, FW - 18); zone(by("LB2"), 11, CY);
    } else if (C === "cover3") {
      zone(by("CB0"), 18, 9, true); zone(by("CB1"), 18, FW - 9, true); zone(by("S0"), 22, CY, true);
      zone(by("S1"), 6, FW - 10); zone(by("LB0"), 7, 12); zone(by("LB1"), 8, CY - 4); zone(by("LB2"), 8, CY + 5);
    } else if (C === "prevent") {
      zone(by("CB0"), 22, 10, true); zone(by("CB1"), 22, FW - 10, true);
      zone(by("S0"), 30, 18, true); zone(by("S1"), 30, FW - 18, true);
      zone(by("LB0"), 13, 14); zone(by("LB1"), 15, CY); zone(by("LB2"), 13, FW - 14);
    }
    for (const tag of D.blitz || []) { const d = by(tag); if (d) { d.job = "rush"; d.man = null; } }
  }

  // ------------------------------------------------------- CPU play calls --
  _cpuOffenseCall() {
    const d = this.down, tg = this.toGo, L = this.los;
    const behind = this.score.cpu - this.score.user;
    const late = this.quarter >= 4 && this.clock < 120;
    if (d === 4 && this.ot) {
      if (FL - L + 17 <= 52 && (this.ot.turn % 2 === 0 || this.score.cpu + 3 >= this.score.user)) return { special: "fg" };
    } else if (d === 4) {
      const fgDist = FL - L + 17;
      const mustGo = late && behind < 0 && (behind < -3 || fgDist > 52);
      if (!mustGo && !(tg <= 1 && L > 45 && L < 75)) {
        if (fgDist <= 54) return { special: "fg" };
        return { special: "punt" };
      }
    }
    const shortY = tg <= 2;
    let runP = d === 1 ? 0.5 : shortY ? 0.6 : tg >= 8 ? 0.15 : 0.38;
    if (late && behind < 0) runP *= 0.4;
    const pool = OFF_PLAYS.filter(p => (Math.random() < runP ? p.kind !== "pass" : p.kind === "pass") && p.id !== "hail" && (p.kind !== "qbrun" || this.cpu.qb.spd > 9.2));
    let play = pool[(Math.random() * pool.length) | 0] || OFF_PLAYS[0];
    if (late && this.clock < 8 && behind < 0 && L < 60) play = OFF_PLAYS.find(p => p.id === "hail");
    if (L >= 92 && play.kind === "pass" && Math.random() < 0.5) play = OFF_PLAYS.find(p => p.id === "fades");
    return { play, form: play.forms[(Math.random() * play.forms.length) | 0] };
  }

  _cpuDefenseCall() {
    const tg = this.toGo, d = this.down;
    const late = this.quarter >= 4 && this.clock < 60 && this.score.cpu > this.score.user;
    const pick = (id) => DEF_PLAYS.find(p => p.id === id);
    if (late) return pick("prevent");
    if (tg <= 2) return pick(Math.random() < 0.5 ? "runstop" : "lbblitz");
    if (d === 3 && tg >= 7) return pick(Math.random() < 0.6 ? "c3" : Math.random() < 0.5 ? "c2" : "c0");
    const r = Math.random();
    return pick(r < 0.3 ? "c3" : r < 0.55 ? "c2" : r < 0.75 ? "c1" : r < 0.9 ? "lbblitz" : "c0");
  }

  // -------------------------------------------------------- special teams --
  _specialTeams(side, kind) {
    const T = this.teamOf(side);
    const L = this.los;
    if (kind === "punt") {
      const net = clamp(rand(34, 48) + (T.kicker.kick - 80) * 0.15, 25, 60);
      const land = L + net;
      const tb = land >= FL;
      this.kick = { kind: "punt", t: 0, dur: 2.2, from: L - 12, to: Math.min(land, 108), side };
      this.phase = "kick";
      this.special = null;
      const newLos = tb ? 20 : FL - land;
      this._afterKick = () => { if (this._otAfterPossession()) return; this._changePossession(newLos); this._say("PUNT", tb ? "Touchback" : `${this.teamOf(this.poss).name} ball at their ${Math.round(newLos)}`, "info", 1.8); this._nextPlay(); };
      this._say("PUNT", `${T.kicker.name} boots it`, "info", 1.4);
      this._runoff(true);
    } else {
      const dist = Math.round(FL - L + 17);
      const p = clamp(1.0 - Math.max(0, dist - 22) * 0.0125 * (1.25 - T.kicker.kick / 100 * 0.45) - Math.max(0, dist - 50) * 0.04, 0.03, 0.99);
      const good = Math.random() < p;
      this.kick = { kind: "fg", t: 0, dur: 2.0, from: L - 7, to: 110, side, good, dist };
      this.phase = "kick";
      this._say(`${dist}-YARD FIELD GOAL`, "…", "info", 1.2);
      this._afterKick = () => {
        if (good) {
          this.score[side] += 3;
          this.events.push({ side, kind: "FG", q: this.quarter, txt: `${dist}-yd FG` });
          this._say("IT'S GOOD!", `${T.name} +3 · ${dist} yards`, side === "user" ? "good" : "bad", 2);
          audioManager.play(side === "user" ? "win" : "lose");
          if (this._otCheckAfterScore(side)) return;
          this._kickoff(side);
        } else {
          this._say("NO GOOD", `Wide from ${dist}`, side === "user" ? "bad" : "good", 2);
          audioManager.play("hit");
          if (this._otAfterPossession()) return;
          this._changePossession(FL - Math.max(L - 7, 20));
          this._nextPlay();
        }
      };
      this._runoff(true);
    }
  }

  // ---------------------------------------------------------------- snap --
  snap() {
    if (this.phase !== "presnap") return;
    this.phase = "live";
    this.playT = 0;
    const C = this.players.find(p => p.center);
    const qb = this.qb;
    const F = FORMATIONS[this.offForm];
    audioManager.play("click");
    if (F.qb[0] >= 3) {
      // Shotgun: the snap flies back.
      this.ball = { state: "air", x: C.x, y: C.y, z: 0.4, from: [C.x, C.y, 0.4], to: [qb.x, qb.y, 1.3], t: 0, T: 0.32, snap: true, target: qb };
    } else {
      this.ball = { state: "held", carrier: qb, x: qb.x, y: qb.y, z: 1 };
      qb.drop = 0.75;
    }
    const play = this.offPlay;
    this.runPlay = play.kind === "run" ? play.run : null;
    this.handoffDone = false;
    if (play.kind === "run") {
      const rb = this.players.find(p => p.role === "RB");
      this.rb = rb;
      const g = (this.flipped ? -1 : 1) * play.run.gap;
      this.runGap = [this.los + 1.5, this.ballY + g];
      if (play.run.counter) rb.counter = 0.35;
    }
    for (const p of this.players) {
      if (p.side === "D" && p.zone && play.playAction && p.role === "LB") p.bite = 0.6;     // play action freezes linebackers
    }
  }

  // ===================================================== simulation step ===
  update(dt) {
    if (this.finished) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.time) this.banner = null; }
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.life);
    if (this.phase === "kick") {
      this.kick.t += dt;
      if (this.kick.t >= this.kick.dur) {
        const k = this.kick;
        this.kick = null;
        if (k.kind === "kickoff") this._nextPlay();
        else this._afterKick?.();
      }
      this._camera(dt);
      return;
    }
    if (this.phase === "dead") {
      this.deadT += dt;
      for (const p of this.players) { p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * dt; p.y += p.vy * dt; }
      if (this.deadT > 1.9) this._afterDead();
      this._camera(dt);
      return;
    }
    if (this.phase === "presnap") {
      this.snapT += dt;
      if (this.poss === "cpu") { this.cpuSnapIn -= dt; if (this.cpuSnapIn <= 0) this.snap(); }
      this._camera(dt);
      return;
    }
    if (this.phase !== "live") { this._camera(dt); return; }
    this._acc += dt;
    while (this._acc >= STEP) { this._acc -= STEP; this._step(STEP); if (this.phase !== "live") break; }
    this._camera(dt);
  }

  _step(dt) {
    this.playT += dt;
    this.clock = Math.max(0, this.clock - dt);
    const ball = this.ball;
    // Ball in flight.
    if (ball.state === "air") this._stepBall(dt);
    else if (ball.state === "loose") this._stepLoose(dt);
    // Brains.
    const ctl = this.controlled();
    for (const p of this.players) {
      p.cd = Math.max(0, p.cd - dt); p.slow = Math.max(0, p.slow - dt); p.moveCd = Math.max(0, p.moveCd - dt); p.engCd = Math.max(0, p.engCd - dt);
      if (p.move) { p.move.t += dt; if (p.move.t >= MOVES[p.move.kind].t) p.move = null; }
      if (p.down > 0) { p.down -= dt; p.dvx = p.dvy = 0; continue; }
      if (p === ctl) this._userDrive(p, dt);
      else if (p.side === "O") this._aiOffense(p, dt);
      else this._aiDefense(p, dt);
    }
    // Blocking engagements, then movement.
    this._engagements(dt);
    for (const p of this.players) this._move(p, dt);
    this._separate();
    // Carry the ball.
    if (ball.state === "held") {
      const c = ball.carrier;
      ball.x = c.x + Math.cos(c.face) * 0.35; ball.y = c.y + Math.sin(c.face) * 0.35; ball.z = 1;
      this._checkCarrier(c);
      if (this.phase === "live") this._tackles(c, dt);
    }
    // Handoff.
    if (this.runPlay && !this.handoffDone && ball.state === "held" && ball.carrier === this.qb) {
      const rb = this.rb;
      if (this.runPlay.toss && this.playT > 0.25) {
        this.handoffDone = true;
        const tx = rb.x + rb.vx * 0.4, ty = rb.y + rb.vy * 0.4;
        this.ball = { state: "air", x: this.qb.x, y: this.qb.y, z: 1.2, from: [this.qb.x, this.qb.y, 1.2], to: [tx, ty, 1.1], t: 0, T: 0.42, target: rb, pitch: true };
      } else if (!this.runPlay.toss && (hyp(rb.x - this.qb.x, rb.y - this.qb.y) < 1.3 || this.playT > 1.1)) {
        this.handoffDone = true;
        ball.carrier = rb;
        audioManager.play("swoosh");
      }
    }
    // Play action fake.
    if (this.offPlay.playAction && !this.handoffDone && this.playT > 0.7) this.handoffDone = true;
    // Time's up on a loose snap or anything odd: never let a play hang.
    if (this.playT > 25) this._deadBall(this.ball.x, "timeout");
  }

  /** The player the user is steering right now. */
  controlled() {
    if (this.phase === "presnap") return this.poss === "user" ? this.qb : this.userSel;
    if (this.phase !== "live") return null;
    const ball = this.ball;
    const userSide = this.poss === "user" ? "O" : "D";
    if (ball.state === "held" && ball.carrier.side === userSide) return ball.carrier;
    if (ball.state === "air" && ball.snap && userSide === "O") return this.qb;
    if (ball.state === "air" && ball.pitch && userSide === "O") return ball.target;
    if (userSide === "O" && ball.state !== "held" && !ball.snap) return null;   // pass in flight: receivers run it themselves
    // Defending (or the other side has the ball): the selected man.
    let sel = this.userSel;
    if (!sel || sel.side !== (ball.state === "held" ? (ball.carrier.side === "O" ? "D" : "O") : "D")) sel = null;
    if (!sel) {
      const want = ball.state === "held" ? (ball.carrier.side === "O" ? "D" : "O") : "D";
      sel = this._nearestTo(ball.x, ball.y, q => q.side === want && q.role !== "DL" && q.role !== "OL") || this._nearestTo(ball.x, ball.y, q => q.side === want);
      this.userSel = sel;
    }
    return sel;
  }

  /** What the controls should offer right now. */
  controlMode() {
    if (this.phase === "presnap") return this.poss === "user" ? "presnap-off" : "presnap-def";
    if (this.phase !== "live") return "none";
    const c = this.controlled();
    if (!c) return "wait";
    const b = this.ball;
    if (b.state === "held" && b.carrier === c) {
      if (c === this.qb && !this.thrown && c.x <= this.los + 0.3 && !this.runPlay && !this.qbRun) return "qb";
      return "run";
    }
    if (b.state === "air" && b.snap) return "qb";
    return "def";
  }

  _nearestTo(x, y, f) {
    let best = null, bd = 1e9;
    for (const p of this.players) { if (!f(p)) continue; const d = hyp(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // --------------------------------------------------------- user input ---
  /** Set by the controls every frame: stick (world-space), sprint, protect. */
  setInput(inp) { this.inp = inp; }

  _userDrive(p, dt) {
    const inp = this.inp || { x: 0, y: 0, sprint: false, protect: false };
    const m = Math.min(1, hyp(inp.x, inp.y));
    const carrier = this.ball.state === "held" && this.ball.carrier === p;
    let spd = p.p.spd * (inp.sprint ? 1 : 0.8) * (inp.protect && carrier ? 0.88 : 1);
    if (p.slow > 0) spd *= 0.5;
    // QB auto-drop under centre unless the user is already steering.
    if (p === this.qb && p.drop > 0 && m < 0.2) { p.drop -= dt; p.dvx = -6.5; p.dvy = 0; return; }
    p.drop = 0;
    if (m > 0.12) { p.dvx = (inp.x / (hyp(inp.x, inp.y) || 1)) * spd * Math.min(1, m * 1.25); p.dvy = (inp.y / (hyp(inp.x, inp.y) || 1)) * spd * Math.min(1, m * 1.25); }
    else { p.dvx = 0; p.dvy = 0; }
    p.sprint = !!inp.sprint;
    p.protect = !!inp.protect && carrier;
    // Moves bend the path.
    if (p.move) this._applyMove(p);
    // A QB who crosses the line is a runner now.
    if (p === this.qb && carrier && p.x > this.los + 0.3) this.qbRun = true;
  }

  /** A button press from the controls: a move, tackle, swat, catch try… */
  action(kind) {
    const p = this.controlled();
    if (!p || this.phase !== "live") return false;
    const carrier = this.ball.state === "held" && this.ball.carrier === p;
    if (carrier && MOVES[kind]) {
      if (p.moveCd > 0 || p.move) return false;
      if (p.protect && kind !== "dive") return false;
      p.move = { kind, t: 0, dir: Math.atan2(p.vy, p.vx), inp: { ...(this.inp || { x: 0, y: 0 }) } };
      p.moveCd = MOVES[kind].cd;
      if (kind === "dive") { p.move.dir = hyp(p.vx, p.vy) > 1 ? Math.atan2(p.vy, p.vx) : 0; }
      audioManager.play(kind === "spin" ? "swoosh" : "click");
      return true;
    }
    if (kind === "tackle" && !carrier) {
      if (p.moveCd > 0) return false;
      p.moveCd = 0.9;
      const c = this.ball.state === "held" ? this.ball.carrier : null;
      if (c && c.side !== p.side) {
        const d = hyp(c.x - p.x, c.y - p.y);
        const a = Math.atan2(c.y - p.y, c.x - p.x);
        p.vx = Math.cos(a) * p.p.spd * 1.15; p.vy = Math.sin(a) * p.p.spd * 1.15;
        p.dive = 0.35;
        if (d < 2.6) { this._tryTackle(p, c, 0.18, true); return true; }
      }
      // Diving at nothing costs you.
      p.down = 0.55; p.dive = 0.5;
      audioManager.play("swoosh");
      return true;
    }
    if ((kind === "int" || kind === "swat") && this.ball.state === "air" && !this.ball.snap && !this.ball.pitch) {
      p.leap = { kind, t: 0 };
      audioManager.play("swoosh");
      return true;
    }
    if (kind === "int" || kind === "swat") { p.leap = { kind, t: 0 }; return true; }
    return false;
  }

  _applyMove(p) {
    const m = p.move, k = m.t / MOVES[m.kind].t;
    const sp = Math.max(p.p.spd * 0.75, hyp(p.vx, p.vy));
    const fwd = Math.atan2(p.dvy || p.vy, p.dvx || p.vx);
    if (m.kind === "jukeL" || m.kind === "jukeR") {
      // Sideways burst relative to the way he is running.
      const side = (m.kind === "jukeL" ? -1 : 1);
      const a = fwd + side * Math.PI / 2;
      const burst = k < 0.6 ? 1 : 0.4;
      p.dvx = Math.cos(a) * sp * 0.9 * burst + Math.cos(fwd) * sp * 0.35;
      p.dvy = Math.sin(a) * sp * 0.9 * burst + Math.sin(fwd) * sp * 0.35;
      p.instant = true;
    } else if (m.kind === "spin") {
      p.dvx = Math.cos(fwd) * sp * 0.82; p.dvy = Math.sin(fwd) * sp * 0.82;
      p.spinA = (p.spinA || 0) + 0.45;
    } else if (m.kind === "dive") {
      const a = m.dir;
      p.dvx = Math.cos(a) * 7.5 * (1 - k); p.dvy = Math.sin(a) * 7.5 * (1 - k);
      p.instant = true;
      if (k > 0.92) { this._deadBall(p.x + Math.cos(a) * 0.5, "dive"); }
    } else if (m.kind === "cut") {
      const ix = m.inp.x, iy = m.inp.y, im = hyp(ix, iy);
      if (im > 0.2) { p.dvx = ix / im * p.p.spd; p.dvy = iy / im * p.p.spd; p.instant = k < 0.5; }
    } else if (m.kind === "hurdle") {
      p.dvx = Math.cos(fwd) * sp; p.dvy = Math.sin(fwd) * sp;
    } else if (m.kind === "stiff") {
      p.dvx *= 0.95; p.dvy *= 0.95;
    }
  }

  // ---------------------------------------------------------- passing ---
  /**
   * Where a pass to `r` with this power would be aimed, before error.
   * Leads the receiver by where he will be when the ball gets there.
   */
  aimFor(r, power, nudge = null) {
    const qb = this.qb;
    const v = 15 + power * 14;
    let tx = r.x, ty = r.y;
    for (let i = 0; i < 3; i++) {
      const T = hyp(tx - qb.x, ty - qb.y) / v + 0.12;
      const path = this._predict(r, T);
      tx = path[0]; ty = path[1];
    }
    if (nudge) { tx += nudge.x * 2.8; ty += nudge.y * 2.8; }
    ty = clamp(ty, -1, FW + 1);
    const dist = hyp(tx - qb.x, ty - qb.y);
    return { x: tx, y: ty, T: dist / v + 0.12, v, dist, err: this._throwError(qb, dist) };
  }

  /** Where a receiver will be in T seconds if he keeps to his route. */
  _predict(r, T) {
    let x = r.x, y = r.y;
    const sp = r.p.spd * 0.97;
    if (r.route && !r.route.block && r.route.pts.length) {
      let left = T * sp, i = r.route.i;
      const pts = r.route.pts;
      while (left > 0 && i < pts.length) {
        const [px, py] = pts[i], d = hyp(px - x, py - y);
        if (d >= left) { x += (px - x) / d * left; y += (py - y) / d * left; left = 0; break; }
        x = px; y = py; left -= d; i++;
      }
      if (left > 0 && !r.route.stops) {
        const n = pts.length;
        const a = n >= 2 ? Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]) : Math.atan2(r.vy, r.vx);
        x += Math.cos(a) * left; y += Math.sin(a) * left;
      }
      return [x, y];
    }
    return [x + r.vx * T, y + r.vy * T];
  }

  _pressure() {
    const qb = this.qb;
    let d = 99;
    for (const p of this.players) if (p.side === "D" && !p.eng && p.down <= 0) d = Math.min(d, hyp(p.x - qb.x, p.y - qb.y));
    return clamp((4 - d) / 3.2, 0, 1);
  }

  _throwError(qb, dist) {
    const userQb = this.poss === "user";
    const pr = this._pressure();
    const moving = hyp(qb.vx, qb.vy) > 4 ? 1.35 : 1;
    let s = ((100 - qb.p.aim) / 100 * 2.3 + 0.35) * (1 + pr * 1.3) * moving + dist * 0.016;
    if (userQb) s *= this.diff.aimErr;
    return s;
  }

  /** The user's (or CPU's) pass. power 0…1; nudge is the stick at release. */
  throwTo(letter, power, nudge) {
    if (this.thrown || this.phase !== "live") return false;
    const qb = this.qb;
    if (this.ball.state !== "held" || this.ball.carrier !== qb || qb.x > this.los + 0.3) return false;
    const r = this.players.find(p => p.letter === letter && p.side === "O");
    if (!r) return false;
    const aim = this.aimFor(r, power, nudge);
    const maxRange = 42 + qb.p.thr * 0.22;
    let tx = aim.x, ty = aim.y;
    if (aim.dist > maxRange) { const k = maxRange / aim.dist; tx = qb.x + (tx - qb.x) * k; ty = qb.y + (ty - qb.y) * k; }
    const e = aim.err;
    tx += gauss() * e * 0.75; ty += gauss() * e;
    const dist = hyp(tx - qb.x, ty - qb.y);
    const T = dist / aim.v + 0.12;
    this.ball = { state: "air", x: qb.x, y: qb.y, z: 2, from: [qb.x, qb.y, 2], to: [tx, ty, 1.3], t: 0, T, target: r, power, tipped: false };
    this.thrown = true;
    this.target = r;
    r.chasing = [tx, ty];
    this.stats[this.poss].att++;
    qb.throwAnim = 0.3;
    audioManager.play("swoosh");
    return true;
  }

  _stepBall(dt) {
    const b = this.ball;
    b.t += dt;
    const k = Math.min(1, b.t / b.T);
    b.x = b.from[0] + (b.to[0] - b.from[0]) * k;
    b.y = b.from[1] + (b.to[1] - b.from[1]) * k;
    const arc = G * b.T * b.T / 8;
    b.z = b.from[2] + (b.to[2] - b.from[2]) * k + arc * 4 * k * (1 - k);
    if (b.snap || b.pitch) {
      if (k >= 1) {
        const t = b.target;
        if (hyp(t.x - b.x, t.y - b.y) < 2.2 && Math.random() > 0.01) { this.ball = { state: "held", carrier: t, x: t.x, y: t.y, z: 1 }; }
        else this._fumble(b.x, b.y);
      }
      return;
    }
    // Defenders underneath can get a hand to a low ball.
    if (k > 0.15 && k < 0.85 && b.z < 3.1 && !b.tipped) {
      for (const p of this.players) {
        if (p.side !== "D" || p.down > 0) continue;
        if (hyp(p.x - b.x, p.y - b.y) < 0.9) {
          b.tipped = true;
          const leap = p.leap && p.leap.t < 0.7;
          const pInt = 0.1 + p.p.ball / 100 * 0.12 + (leap && p.leap.kind === "int" ? 0.25 : 0);
          const pTip = 0.4 + (leap ? 0.3 : 0);
          const r = Math.random();
          if (r < pInt) { this._intercept(p); return; }
          if (r < pInt + pTip) { this._incomplete("Batted down", p); return; }
        }
      }
    }
    // Receivers and defenders converge on the ball.
    if (k >= 1) this._resolveCatch();
  }

  _resolveCatch() {
    const b = this.ball;
    const R = 1.7;
    const near = (p) => hyp(p.x - b.x, p.y - b.y);
    const defs = this.players.filter(p => p.side === "D" && p.down <= 0 && near(p) < R).sort((a, c) => near(a) - near(c));
    const offs = this.players.filter(p => p.side === "O" && p.letter && p.down <= 0 && near(p) < R).sort((a, c) => near(a) - near(c));
    const rec = offs.includes(b.target) ? b.target : offs[0];
    const recD = rec ? near(rec) : 9;
    for (const d of defs) {
      const dd = near(d);
      const leap = d.leap && d.leap.t < 0.9;
      const ahead = dd < recD - 0.3 ? 0.14 : 0;
      const pInt = clamp(0.06 + d.p.ball / 100 * 0.2 + ahead + (leap && d.leap.kind === "int" ? 0.38 : 0) - dd * 0.07 + (b.power > 0.85 ? -0.04 : 0), 0, 0.85);
      const pSwat = clamp(0.12 + d.p.cov / 100 * 0.18 + (leap && d.leap.kind === "swat" ? 0.45 : 0) + (leap && d.leap.kind === "int" ? 0.1 : 0) - dd * 0.09, 0, 0.85);
      const r = Math.random();
      if (r < pInt) { this._intercept(d); return; }
      if (r < pInt + pSwat) { this._incomplete(rec ? "Broken up!" : "Knocked away", d); return; }
    }
    if (rec) {
      const contest = defs.reduce((a, d) => a + Math.max(0, 1.8 - near(d)) / 1.8, 0);
      const pCatch = clamp(0.5 + rec.p.hands / 100 * 0.46 - contest * 0.22 - recD * 0.1 - (b.power > 0.9 && b.T < 0.7 ? 0.06 : 0), 0.05, 0.98);
      if (Math.random() < pCatch) {
        this.ball = { state: "held", carrier: rec, x: rec.x, y: rec.y, z: 1 };
        rec.chasing = null;
        rec.slow = 0.3;                      // securing the catch costs a step
        this.caught = { by: rec, x: rec.x, from: this.los };
        this.stats[this.poss].comp++;
        audioManager.play("coin");
        this.fx.push({ kind: "text", x: rec.x, y: rec.y, txt: "CATCH!", t: 0, life: 0.9, color: "#ffd76a" });
        for (const p of this.players) { if (p.side === "O" && p !== rec) p.route = { block: true, pts: [] }; }
        return;
      }
      this._incomplete("Dropped!", rec);
      return;
    }
    this._incomplete("Incomplete", null);
  }

  _intercept(d) {
    this.ball = { state: "held", carrier: d, x: d.x, y: d.y, z: 1 };
    this.intercepted = true;
    this.stats[this.poss].int++;
    this.fx.push({ kind: "text", x: d.x, y: d.y, txt: "INTERCEPTED!", t: 0, life: 1.4, color: "#ff5470" });
    audioManager.play(this.poss === "user" ? "lose" : "win");
    this.userSel = null;
    // Everyone switches jobs: the offence now has to make the tackle.
    for (const p of this.players) { p.route = null; p.job = p.side === "O" ? "pursue" : "escort"; p.eng = null; }
  }

  _incomplete(why, who) {
    const b = this.ball;
    this.fx.push({ kind: "text", x: b.x, y: b.y, txt: why.toUpperCase(), t: 0, life: 1.1, color: "#ffffff" });
    if (who) this.fx.push({ kind: "puff", x: b.x, y: b.y, t: 0, life: 0.5 });
    audioManager.play("hit");
    this.ball = { state: "dead", x: b.x, y: b.y, z: 0.2, bounce: 0 };
    this._endPlay({ kind: "inc", why });
  }

  _fumble(x, y) {
    this.ball = { state: "loose", x, y, z: 0.4, vx: rand(-4, 4), vy: rand(-4, 4), t: 0 };
    this.fx.push({ kind: "text", x, y, txt: "FUMBLE!", t: 0, life: 1.2, color: "#ff9a3a" });
    audioManager.play("hit");
  }

  _stepLoose(dt) {
    const b = this.ball;
    b.t += dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.97; b.vy *= 0.97;
    b.z = Math.abs(Math.sin(b.t * 9)) * 0.6 * Math.max(0, 1 - b.t);
    if (b.t < 0.35) return;
    let best = null, bd = 1.1;
    for (const p of this.players) { if (p.down > 0) continue; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = p; } }
    if (best) {
      if (best.side === "O") { this.ball = { state: "held", carrier: best, x: best.x, y: best.y, z: 1 }; this._deadBall(best.x, "recovered"); }
      else { this.ball = { state: "held", carrier: best, x: best.x, y: best.y, z: 1 }; this.fumbleLost = true; this._deadBall(best.x, "recovered"); }
    }
    if (b.y < 0 || b.y > FW || b.t > 5) this._deadBall(b.x, "out");
  }

  // ----------------------------------------------------------- tackling ---
  _checkCarrier(c) {
    if (c.y < 0.2 || c.y > FW - 0.2) { this._deadBall(c.x, "out"); return; }
    const toward = c.side === "O" || !this.intercepted ? 1 : -1;
    if (!this.intercepted && c.x >= FL) { this._touchdown(this.poss); return; }
    if (this.intercepted && c.x <= 0) { this._touchdown(this.opp(this.poss)); return; }
    void toward;
  }

  _tackles(c, dt) {
    for (const d of this.players) {
      if (d.side === c.side || d.down > 0 || d.cd > 0 || d.eng) continue;
      const dist = hyp(d.x - c.x, d.y - c.y);
      if (dist < 1.45) this._tryTackle(d, c, 0, false);
      if (this.phase !== "live") return;
    }
    void dt;
  }

  _tryTackle(d, c, bonus, userDive) {
    d.cd = 0.75;
    const ca = c.p;
    // Gang tackles: more hands, better odds.
    let gang = 0;
    for (const q of this.players) if (q !== d && q.side === d.side && q.down <= 0 && hyp(q.x - c.x, q.y - c.y) < 2) gang++;
    let p = 0.74 + (d.p.tac - (ca.agi * 0.55 + ca.str * 0.45)) / 100 * 0.9 + gang * 0.12 + bonus;
    // The user's own moves, timed by hand, are worth more than the CPU's.
    const userRunner = this.poss === "user" ? c.side === "O" && !this.intercepted : c.side === "D";
    const mv = userRunner ? 1 : 0.7;
    if (c === this.qb && !this.thrown && !this.qbRun) p += 0.1;           // a sack is easier than open-field tackling
    if (c.side !== "O") p += 0.05;
    const front = Math.cos(Math.atan2(d.y - c.y, d.x - c.x) - Math.atan2(c.vy, c.vx)) > 0.2;
    const m = c.move;
    let evaded = null;
    if (m) {
      if ((m.kind === "jukeL" || m.kind === "jukeR") && m.t < 0.3) { p *= 1 - ca.agi / 100 * 0.62 * mv; evaded = "Juked!"; }
      else if (m.kind === "spin" && m.t < 0.42) { p *= 1 - ca.agi / 100 * 0.55 * mv; evaded = "Spun away!"; }
      else if (m.kind === "stiff" && front) { p *= 1 - clamp(0.35 + (ca.str - d.p.str) / 100 * 1.2, 0.1, 0.75) * mv; evaded = "Stiff arm!"; }
      else if (m.kind === "hurdle" && m.t < 0.5) { p *= userDive || d.dive ? 0.18 : 1 - 0.45 * mv; evaded = "Hurdled!"; }
      else if (m.kind === "cut" && m.t < 0.2) { p *= 1 - ca.agi / 100 * 0.35 * mv; evaded = "Cut back!"; }
    }
    if (c.sprint && !m) p += 0.03;
    p = clamp(p, 0.08, 0.95);
    if (Math.random() < p) {
      // Down. Did it come out?
      let fum = 0.012 + (d.p.str - ca.str) / 100 * 0.02 + (m?.kind === "spin" ? 0.03 : 0) + (m?.kind === "hurdle" ? 0.02 : 0);
      if (c.protect) fum *= 0.08;
      if (this.ball.state === "held" && Math.random() < Math.max(0.003, fum) && !(c === this.qb && !this.thrown && this.playT < 0.4)) {
        c.down = 1.2;
        d.down = 0.8;
        this._fumble(c.x + 0.5, c.y);
        return;
      }
      const sack = c === this.qb && !this.thrown && !this.qbRun && c.x < this.los;
      c.down = 2; d.down = 1; d.dive = 0.4;
      if (sack) { this.stats[this.opp(this.poss)].sacks++; this.fx.push({ kind: "text", x: c.x, y: c.y, txt: "SACK!", t: 0, life: 1.2, color: "#ff5470" }); }
      else this.fx.push({ kind: "hit", x: (c.x + d.x) / 2, y: (c.y + d.y) / 2, t: 0, life: 0.4 });
      audioManager.play("hit");
      const fwd = c.side === "O" && !this.intercepted ? 0.6 : -0.6;
      this._deadBall(c.x + fwd, sack ? "sack" : "tackle");
    } else {
      d.slow = 0.45; d.down = userDive ? 0.6 : 0.2;
      if (evaded) this.fx.push({ kind: "text", x: c.x, y: c.y, txt: evaded, t: 0, life: 0.9, color: "#2ee6a6" });
      else this.fx.push({ kind: "text", x: c.x, y: c.y, txt: "Broken tackle!", t: 0, life: 0.9, color: "#2ee6a6" });
    }
  }

  // ------------------------------------------------------- end of plays ---
  _deadBall(x, why) {
    if (this.phase !== "live") return;
    const c = this.ball.state === "held" ? this.ball.carrier : null;
    if (this.intercepted || this.fumbleLost) {
      this._endPlay({ kind: "turnover", x, why });
      return;
    }
    if (c && x < 0 && c.side === "O") { this._safety(); return; }
    this._endPlay({ kind: "spot", x: clamp(x, 0, FL), why });
  }

  _touchdown(side) {
    this.score[side] += 6;
    this.stats[side].td++;
    const T = this.teamOf(side);
    const c = this.ball.carrier;
    this.events.push({ side, kind: "TD", q: this.quarter, txt: `${c?.p.name || ""} TD` });
    this._say("TOUCHDOWN!", `${c?.p.name || T.name} · ${T.name}`, side === "user" ? "good" : "bad", 2.4);
    audioManager.play(side === "user" ? "win" : "lose");
    for (let i = 0; i < 40; i++) this.fx.push({ kind: "conf", x: c.x, y: c.y, vx: rand(-8, 8), vy: rand(-8, 8), t: 0, life: rand(0.8, 1.6), color: [this.teamOf(side).c1, this.teamOf(side).c2, "#ffffff"][i % 3] });
    this._endPlay({ kind: "td", side });
  }

  _safety() {
    const def = this.opp(this.poss);
    this.score[def] += 2;
    this.events.push({ side: def, kind: "SAF", q: this.quarter, txt: "Safety" });
    this._say("SAFETY!", `${this.teamOf(def).name} +2`, def === "user" ? "good" : "bad", 2.2);
    this._endPlay({ kind: "safety", side: def });
  }

  _endPlay(res) {
    this.result = res;
    this.phase = "dead";
    this.deadT = 0;
    // Yardage stats.
    if (res.kind === "spot" && !this.intercepted) {
      const gain = res.x - this.los;
      const st = this.stats[this.poss];
      if (this.caught) st.passYds += Math.round(gain);
      else if (res.why !== "sack") st.rushYds += Math.round(gain);
    }
  }

  /** After a dead ball: move the chains, run the clock, decide what's next. */
  _afterDead() {
    const res = this.result;
    const wasUser = this.poss === "user";
    const twoPt = this.twoPt;
    this.twoPt = null;
    this.caught = null;
    const intercepted = this.intercepted, fumbleLost = this.fumbleLost;
    this.intercepted = false; this.fumbleLost = false; this.qbRun = false;
    if (twoPt) {
      const good = res.kind === "td";
      if (good) { this.score[this.poss] += 2 - 6; }   // the "touchdown" was worth 2, not 6
      this._say(good ? "TWO-POINT CONVERSION!" : "NO GOOD", good ? "+2" : "The try fails", (good === wasUser) ? "good" : "bad", 2);
      if (this._otCheckAfterScore(this.poss)) return;
      this._kickoff(this.poss);
      return;
    }
    if (res.kind === "td") {
      if (res.side !== this.poss) {
        // Pick six / scoop and score.
        this.poss = res.side;
      }
      this.phase = "pat";
      if (this.poss === "cpu") {
        const behind = this.score.cpu - this.score.user;
        const go2 = this.quarter >= 4 && (behind === -2 || behind === 1 || behind === -5);
        this._pat(go2 ? "two" : "kick");
      }
      return;
    }
    if (res.kind === "safety") { this._kickoff(this.opp(res.side)); this._runoff(true); return; }
    if (res.kind === "inc") {
      this._runoff(true);
      this._advanceDown(0, "Incomplete");
      return;
    }
    if (res.kind === "turnover") {
      const T = this.teamOf(this.opp(this.poss));
      const x = res.x;
      // Spot is in the old offence's frame; the new offence sees it flipped.
      let newLos = FL - x;
      if (newLos <= 0) newLos = 20;          // downed in the end zone: touchback
      this._say(intercepted ? "TURNOVER" : fumbleLost ? "FUMBLE LOST" : "TURNOVER", `${T.name} ball`, wasUser ? "bad" : "good", 1.8);
      this._runoff(true);
      if (this._otAfterPossession()) return;
      this._changePossession(clamp(newLos, 1, 99));
      this._nextPlay();
      return;
    }
    // A spot: tackle, out of bounds, sack, dive.
    const gain = res.x - this.los;
    const out = res.why === "out";
    this._runoff(out);
    this.ballY = clamp(this.ball.y, HASH0, HASH1);
    this._advanceDown(gain, null);
  }

  _advanceDown(gain, label) {
    this.los = clamp(this.los + gain, 1, 99);
    this.toGo -= gain;
    const g = Math.round(gain);
    if (this.toGo <= 0) {
      this.down = 1; this.toGo = Math.min(10, FL - this.los);
      this._say("FIRST DOWN", g ? `${g > 0 ? "+" : ""}${g} yards` : "", this.poss === "user" ? "good" : "bad", 1.4);
      audioManager.play("select");
    } else if (this.down >= 4) {
      this._say("TURNOVER ON DOWNS", "", this.poss === "user" ? "bad" : "good", 1.8);
      if (this._otAfterPossession()) return;
      this._changePossession(FL - this.los);
    } else {
      this.down++;
      if (!label) label = g > 0 ? `Gain of ${g}` : g < 0 ? `Loss of ${-g}` : "No gain";
      this._say(label, this.downText(), "info", 1.3);
    }
    this._nextPlay();
  }

  /** Clock between plays: a running clock eats ~25 seconds. */
  _runoff(stopped) {
    if (this.ot) return;
    if (!stopped) this.clock = Math.max(0, this.clock - (this.quarter >= 4 && this.clock < 120 ? 12 : 24));
    else this.clock = Math.max(0, this.clock - 3);
  }

  /** End of quarter / half / game. Returns true if it took over the flow. */
  _clockCheck() {
    if (this.ot || this.clock > 0) return false;
    if (this.quarter === 2) {
      this.quarter = 3; this.clock = this.qlen;
      this._say("HALFTIME", `${this.user.name} ${this.score.user} – ${this.score.cpu} ${this.cpu.name}`, "info", 2.6);
      this._kickoff(this.receiving);           // the team that received first kicks now
      return true;
    }
    if (this.quarter >= 4) {
      if (this.score.user === this.score.cpu) { this._startOT(); return true; }
      this._finish();
      return true;
    }
    this.quarter++; this.clock = this.qlen;
    this._say(`END OF Q${this.quarter - 1}`, `${this.user.name} ${this.score.user} – ${this.score.cpu} ${this.cpu.name}`, "info", 1.8);
    return false;
  }

  // ------------------------------------------------- PAT and overtime ---
  /** "kick" or "two" for the extra point after a touchdown. */
  _pat(kind) {
    if (this.phase !== "pat") return;
    const side = this.poss;
    if (kind === "kick") {
      const good = Math.random() < 0.93 + this.teamOf(side).kicker.kick / 100 * 0.05;
      if (good) this.score[side] += 1;
      this.kick = { kind: "fg", t: 0, dur: 1.6, from: FL - 15, to: 110, side, good, dist: 33 };
      this.phase = "kick";
      this._say(good ? "EXTRA POINT GOOD" : "EXTRA POINT MISSED", "", (good === (side === "user")) ? "good" : "bad", 1.6);
      this._afterKick = () => { if (this._otCheckAfterScore(side)) return; this._kickoff(side); };
      return;
    }
    // Two-point try from the 2.
    this.twoPt = true;
    this.los = 98; this.down = 1; this.toGo = 2; this.ballY = CY;
    this.special = "2-PT TRY";
    this._nextPlay();
    this.special = "2-PT TRY";
  }
  choosePat(kind) { if (this.phase === "pat" && this.poss === "user") this._pat(kind); }

  _startOT() {
    this.quarter = 5;
    this.clock = 0;
    this.ot = { first: this.receiving, turn: 0, pts: { user: 0, cpu: 0 }, start: { ...this.score } };
    this._say("OVERTIME", "Each side gets the ball at the 25", "info", 2.4);
    this._otPossession(this.ot.first);
  }
  _otPossession(side) {
    this.poss = side;
    this.los = 75; this.down = 1; this.toGo = 10; this.ballY = CY; this.special = null;
    this.ot.side = side;
    this._nextPlay();
  }
  /** Called when an OT possession ends without points. */
  _otAfterPossession() {
    if (!this.ot) return false;
    this._otNext();
    return true;
  }
  _otCheckAfterScore() {
    if (!this.ot) return false;
    this._otNext();
    return true;
  }
  _otNext() {
    const o = this.ot;
    o.turn++;
    if (o.turn % 2 === 0) {
      // Both have had the ball this round.
      if (this.score.user !== this.score.cpu) { this._finish(); return; }
      if (o.turn >= 8) { this._finish(); return; }
    }
    this._otPossession(o.turn % 2 === 0 ? o.first : this.opp(o.first));
  }

  _finish() {
    this.finished = true;
    this.phase = "over";
    const u = this.score.user, c = this.score.cpu;
    this._say(u > c ? "VICTORY!" : u < c ? "DEFEAT" : "TIE GAME", `${this.user.name} ${u} – ${c} ${this.cpu.name}`, u > c ? "good" : u < c ? "bad" : "info", 99);
    this.resultData = { user: u, cpu: c, events: this.events, stats: this.stats };
  }

  // ================================================================ AI ====
  _aiOffense(p, dt) {
    const b = this.ball;
    const carrier = b.state === "held" ? b.carrier : null;
    // Ball carrier (CPU on offence, or the user's team after a turnover).
    if (carrier === p) { this._aiRunner(p, dt); return; }
    if (this.intercepted) { this._pursue(p, carrier || b); return; }
    if (b.state === "loose") { this._goTo(p, b.x, b.y, p.p.spd); return; }
    if (p.role === "QB") { this._aiQBwithoutBall(p, dt); return; }
    // Pass in the air to me: go and get it.
    if (b.state === "air" && b.target === p && !b.snap) {
      const [tx, ty] = b.pitch ? [b.to[0], b.to[1]] : (p.chasing || b.to);
      this._goTo(p, tx, ty, p.p.spd);
      return;
    }
    if (p.role === "OL") { this._aiLineman(p, dt); return; }
    // Run plays: the back follows the play, everyone else blocks.
    if (this.runPlay && p === this.rb && !this.handoffDone) {
      if (p.counter > 0) { p.counter -= dt; this._goVel(p, 0.3, -Math.sign(this.runGap[1] - p.y || 1) * 0.9, p.p.spd * 0.6); return; }
      const mesh = this.runPlay.toss ? [this.los - 3, this.runGap[1]] : [this.qb.x + 0.4, this.qb.y + Math.sign(this.runGap[1] - this.qb.y || 1) * 0.6];
      this._goTo(p, mesh[0], mesh[1], p.p.spd * 0.75);
      return;
    }
    if (this.offPlay.playAction && p.role === "RB" && this.playT < 0.8) { this._goTo(p, this.qb.x + 0.5, this.qb.y + 1, p.p.spd * 0.7); return; }
    if (carrier && carrier.side === "O" && carrier !== this.qb && (carrier !== p)) { this._blockFor(p, carrier); return; }
    if (this.runPlay || (carrier && carrier.side === "O" && this.qbRun)) { this._blockFor(p, carrier || this.qb); return; }
    // Routes.
    const r = p.route;
    if (!r || r.block) { this._passBlock(p); return; }
    if (this.offPlay.screen && p.role === "RB" && this.playT < 0.9) { this._passBlock(p); return; }
    if (r.i < r.pts.length) {
      const [tx, ty] = r.pts[r.i];
      const d = hyp(tx - p.x, ty - p.y);
      if (d < 0.7) r.i++;
      this._goTo(p, tx, ty, p.p.spd * (r.i === 0 ? 1 : 0.97));
      // Sharp breaks: agile receivers lose less speed.
      if (d < 0.7) { const k = 0.35 + p.p.agi / 100 * 0.45; p.vx *= k; p.vy *= k; }
    } else if (r.stops) {
      // Settle, then drift into space.
      const dn = this._nearestTo(p.x, p.y, q => q.side === "D");
      if (dn && hyp(dn.x - p.x, dn.y - p.y) < 2.5) this._goVel(p, -0.2, Math.sign(p.y - dn.y) || 1, 3);
      else { p.dvx = 0; p.dvy = 0; p.face = Math.PI; }
    } else {
      const n = r.pts.length;
      const a = n >= 2 ? Math.atan2(r.pts[n - 1][1] - r.pts[n - 2][1], r.pts[n - 1][0] - r.pts[n - 2][0]) : 0;
      let vx = Math.cos(a), vy = Math.sin(a);
      // Stay in bounds.
      if (p.y < 3 && vy < 0) vy = 0.15; if (p.y > FW - 3 && vy > 0) vy = -0.15;
      this._goVel(p, vx, vy, p.p.spd);
    }
  }

  _aiQBwithoutBall(p, dt) {
    if (this.runPlay && this.handoffDone) { this._goVel(p, -0.6, (p.y < CY ? -1 : 1) * 0.4, 5); return; }   // carry out the fake
    p.dvx = 0; p.dvy = 0;
    void dt;
  }

  /** CPU quarterback: drop, read, throw, or tuck it and run. */
  _aiQB(p, dt) {
    if (p.drop > 0) { p.drop -= dt; this._goVel(p, -1, 0, 6.5); return; }
    const pr = this._pressure();
    const t = this.playT;
    if (this.offPlay.kind === "qbrun" && t > 0.7) { this.qbRun = true; this._aiRunner(p, dt); return; }
    // Feel the rush: step up or slide.
    const rusher = this._nearestTo(p.x, p.y, q => q.side === "D" && !q.eng && q.down <= 0);
    if (rusher && hyp(rusher.x - p.x, rusher.y - p.y) < 3) {
      const a = Math.atan2(p.y - rusher.y, p.x - rusher.x);
      this._goVel(p, Math.cos(a) * 0.6 + 0.4, Math.sin(a), p.p.spd * 0.8);
    } else { p.dvx = 0; p.dvy = 0; }
    p.readT = (p.readT || 0) - dt;
    if (t < 0.9 || p.readT > 0) return;
    p.readT = 0.2;
    // Who is open?
    let best = null, bestS = -1e9;
    const need = this.toGo;
    for (const r of this.players) {
      if (r.side !== "O" || !r.letter || (r.route && r.route.block)) continue;
      const aim = this.aimFor(r, 0.7);
      let sep = 99;
      for (const d of this.players) if (d.side === "D") sep = Math.min(sep, hyp(d.x - aim.x, d.y - aim.y) - 0.0);
      const gain = aim.x - this.los;
      const score = sep * 1.6 + Math.min(gain, 30) * 0.12 + (gain >= need ? 2.2 : 0) - aim.err * 0.6 - (aim.dist > 40 ? 3 : 0) - (aim.y < 1 || aim.y > FW - 1 ? 4 : 0);
      if (sep > 2.1 && score > bestS) { bestS = score; best = r; }
    }
    const patience = 2.2 + (p.p.awr - 70) / 100;
    if (best && (bestS > 5 || t > patience || pr > 0.6)) { this.throwTo(best.letter, clamp(0.5 + rand(-0.2, 0.35), 0.2, 1), null); return; }
    if (t > 3.6 || pr > 0.85) {
      // Nobody open: scramble if there's room, else throw it away.
      const lane = this._clearance(p, 0, 6);
      if (lane > 3.5 && p.p.spd > 8.3) { this.qbRun = true; return; }
      const any = this.players.filter(r => r.side === "O" && r.letter).sort((a, b) => b.x - a.x)[0];
      if (any) this.throwTo(any.letter, 0.4, null);
    }
  }

  /** How much space there is in direction a over `look` yards. */
  _clearance(p, a, look) {
    const cx = Math.cos(a), cy = Math.sin(a);
    let min = 99;
    for (const d of this.players) {
      if (d.side === p.side || d.down > 0) continue;
      const rx = d.x - p.x, ry = d.y - p.y;
      const along = rx * cx + ry * cy;
      if (along < -1 || along > look) continue;
      const perp = Math.abs(rx * cy - ry * cx);
      min = Math.min(min, perp + Math.max(0, along) * 0.15);
    }
    return min;
  }

  /** CPU ball carrier: pick the open lane, and use a move when it's close. */
  _aiRunner(p, dt) {
    if (p === this.qb && !this.thrown && !this.qbRun && !this.runPlay && this.poss === "cpu") { this._aiQB(p, dt); return; }
    if (p === this.qb && this.runPlay && !this.handoffDone) { this._goVel(p, -1, 0, this.runPlay.toss ? 2 : 3.5); return; }
    const forward = p.side === "O" && !this.intercepted ? 0 : Math.PI;
    let bestA = forward, bestS = -1e9;
    const toGap = this.runPlay && p.x < this.los + 1 && p === this.rb ? Math.atan2(this.runGap[1] - p.y, this.runGap[0] + 1 - p.x) : null;
    for (let k = -5; k <= 5; k++) {
      const a = (toGap ?? forward) + k * 0.24;
      const clr = this._clearance(p, a, 7);
      const fwd = Math.cos(a - forward);
      const nx = p.x + Math.cos(a) * 3, ny = p.y + Math.sin(a) * 3;
      const edge = ny < 1.5 || ny > FW - 1.5 ? -4 : 0;
      const s = Math.min(clr, 5) * 1.0 + fwd * 3.2 + edge - Math.abs(k) * 0.05;
      if (s > bestS) { bestS = s; bestA = a; }
      void nx;
    }
    this._goVel(p, Math.cos(bestA), Math.sin(bestA), p.p.spd * (p.side === "O" ? 0.98 : 0.95));
    // A tackler bearing down: try a move, if the cooldown allows.
    if (!p.move && p.moveCd <= 0) {
      const d = this._nearestTo(p.x, p.y, q => q.side !== p.side && q.down <= 0);
      if (d && hyp(d.x - p.x, d.y - p.y) < 2.2 && Math.random() < dt * 1.3) {
        const opts = p.p.str > p.p.agi ? ["stiff", "stiff", "spin", "jukeL", "jukeR"] : ["jukeL", "jukeR", "spin", "stiff", "hurdle"];
        let kind = opts[(Math.random() * opts.length) | 0];
        if (kind.startsWith("juke")) kind = (d.y > p.y) ? "jukeL" : "jukeR";
        p.move = { kind, t: 0, dir: Math.atan2(p.vy, p.vx), inp: { x: Math.cos(bestA), y: Math.sin(bestA) } };
        p.moveCd = MOVES[kind].cd + 0.4;
      }
    }
    if (p.move) this._applyMove(p);
    // Near the line to gain on fourth down, or near the goal: dive for it.
    void dt;
  }

  _aiLineman(p, dt) {
    if (this.runPlay || (this.ball.state === "held" && this.ball.carrier !== this.qb)) {
      // Run block: find a man and drive him.
      const t = this._nearestTo(p.x + 2, p.y, q => q.side === "D" && q.down <= 0 && (!q.eng || q.eng === p));
      if (t) this._goTo(p, t.x - 0.6, t.y, p.p.spd);
      else this._goVel(p, 1, 0, p.p.spd * 0.7);
      return;
    }
    if (this.offPlay.screen && this.playT > 1.0) {
      const rb = this.players.find(q => q.role === "RB");
      const t = this._nearestTo(rb.x + 3, rb.y, q => q.side === "D" && q.down <= 0);
      if (t) this._goTo(p, t.x - 0.6, t.y, p.p.spd);
      return;
    }
    this._passBlock(p);
    void dt;
  }

  /** Stay between the nearest rusher and the quarterback. */
  _passBlock(p) {
    const qb = this.qb;
    let best = null, bd = 99;
    for (const d of this.players) {
      if (d.side !== "D" || d.down > 0 || d.job !== "rush") continue;
      if (d.eng && d.eng !== p) continue;
      const dist = hyp(d.x - p.x, d.y - p.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    const homeX = this.los - (p.role === "OL" ? 1.6 : 2.2);
    if (!best || bd > 7) { this._goTo(p, Math.min(homeX, qb.x + 1.8), p.y, 4); return; }
    // Set up on the line from the rusher to the QB.
    const a = Math.atan2(qb.y - best.y, qb.x - best.x);
    const tx = best.x + Math.cos(a) * 0.9, ty = best.y + Math.sin(a) * 0.9;
    this._goTo(p, Math.min(tx, homeX + 1), ty, p.p.spd);
  }

  _blockFor(p, carrier) {
    if (!carrier) { const b = this.ball; if (b) this._goTo(p, b.x, b.y, p.p.spd); return; }
    const t = this._nearestTo(carrier.x + 3, carrier.y, q => q.side !== p.side && q.down <= 0 && hyp(q.x - carrier.x, q.y - carrier.y) < 12);
    if (t) this._goTo(p, (t.x + carrier.x) / 2 + 0.3, (t.y + carrier.y) / 2, p.p.spd * 0.95);
    else this._goTo(p, carrier.x + 4, carrier.y + (p.y > carrier.y ? 3 : -3), p.p.spd * 0.9);
  }

  _aiDefense(p, dt) {
    const b = this.ball;
    const carrier = b.state === "held" ? b.carrier : null;
    if (this.intercepted) {
      if (carrier === p) { this._aiRunner(p, dt); return; }
      this._blockFor(p, carrier);
      return;
    }
    if (b.state === "loose") { this._goTo(p, b.x, b.y, p.p.spd); return; }
    if (p.bite > 0) { p.bite -= dt; this._goVel(p, -1, 0, 5); return; }
    const runner = carrier && (carrier !== this.qb || this.qbRun || this.thrown) && this.phase === "live" ? carrier : null;
    // Ball in the air: break on it.
    if (b.state === "air" && !b.snap && !b.pitch) {
      const [tx, ty] = b.to;
      const tLeft = (b.T - b.t);
      const d = hyp(tx - p.x, ty - p.y);
      const react = this.diff.react * (p.side === "D" && this.poss === "user" ? 1 : 1.3) * (1.2 - p.p.awr / 100 * 0.5);
      if (b.t > react && d < p.p.spd * (tLeft + 0.6) + 2) { this._goTo(p, tx, ty, p.p.spd); return; }
    }
    // Rushers.
    if (p.job === "rush" && !runner && !(b.state === "air" && !b.snap)) {
      if (this.runPlay && this.handoffDone) { this._pursue(p, this.ball.carrier); return; }
      const qb = this.qb;
      const lane = p.dl !== undefined ? (p.dl - 1.5) * 0.9 : 0;
      this._goTo(p, qb.x, qb.y + lane * (hyp(qb.x - p.x, qb.y - p.y) > 4 ? 1 : 0), p.p.spd);
      return;
    }
    if (runner) {
      // Read the run: zone and man defenders come up once it's past the line or after a beat.
      const read = this.runPlay ? 0.45 + (1 - p.p.awr / 100) * 0.4 : 0.15;
      if (this.playT > read || runner.x > this.los - 1 || p.job === "rush") { this._pursue(p, runner); return; }
    }
    if (p.job === "man" && p.man) {
      const r = p.man;
      const lag = clamp(0.05 + (100 - p.p.cov) / 100 * 0.3 + (this.poss === "cpu" ? 0 : 0.05), 0.05, 0.6) * (this.poss === "user" ? 1 + (this.diff.react - 0.3) : 1);
      const h = this._past(r, lag);
      const cushion = 1.1 + (p.role === "CB" ? 0 : 0.6);
      const tx = h.x + h.vx * lag + cushion * (r.x - this.los > 8 ? 0.6 : 1), ty = h.y + h.vy * lag + (r.y < CY ? 0.7 : -0.7);
      this._goTo(p, tx, ty, p.p.spd * 0.99, true);
      return;
    }
    if (p.job === "zone" && p.zone) {
      const [zx, zy] = p.zone;
      const R = p.deep ? 13 : 8;
      // The most dangerous receiver in my area.
      let threat = null, ts = -1e9;
      for (const r of this.players) {
        if (r.side !== "O" || !r.letter || (r.route && r.route.block)) continue;
        const d = hyp(r.x - zx, r.y - zy);
        if (d > R + (p.deep ? 4 : 2)) continue;
        const s = r.x - d * 0.5;
        if (s > ts) { ts = s; threat = r; }
      }
      if (threat) {
        const h = this._past(threat, 0.25 + (100 - p.p.cov) / 100 * 0.3);
        if (p.deep) this._goTo(p, Math.max(h.x + 2.5, zx - 2), h.y * 0.7 + zy * 0.3, p.p.spd);
        else this._goTo(p, h.x + 0.8, h.y * 0.75 + zy * 0.25, p.p.spd);
      } else this._goTo(p, zx, zy, p.p.spd * 0.85);
      return;
    }
    if (carrier) this._pursue(p, carrier);
  }

  _past(r, lag) {
    const n = Math.min(r.hist.length - 1, Math.round(lag / STEP));
    return n >= 0 ? r.hist[r.hist.length - 1 - n] : { x: r.x, y: r.y, vx: r.vx, vy: r.vy };
  }

  /** Chase with an angle: aim where the carrier will be. */
  _pursue(p, c) {
    if (!c) return;
    const d = hyp(c.x - p.x, c.y - p.y);
    const lead = clamp(d / (p.p.spd + 0.1), 0, 1.2) * 0.8;
    this._goTo(p, c.x + (c.vx || 0) * lead, c.y + (c.vy || 0) * lead, p.p.spd * 1.04);
    p.pursuing = true;
  }

  _goTo(p, tx, ty, spd, precise = false) {
    const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy);
    if (d < 0.15) { p.dvx = 0; p.dvy = 0; return; }
    const s = precise ? Math.min(spd, d * 6) : Math.min(spd, d * 4 + 1.5);
    p.dvx = dx / d * s; p.dvy = dy / d * s;
  }
  _goVel(p, vx, vy, spd) { const m = hyp(vx, vy) || 1; p.dvx = vx / m * spd; p.dvy = vy / m * spd; }

  // ----------------------------------------------------------- blocking ---
  _engagements(dt) {
    const ps = this.players;
    for (const p of ps) {
      if (p.eng) {
        const q = p.eng;
        if (q.eng !== p || q.down > 0 || p.down > 0 || hyp(p.x - q.x, p.y - q.y) > 2.2) { p.eng = null; continue; }
        // Once the ball is past them, linemen stop wrestling and chase.
        const cc = this.ball.state === "held" ? this.ball.carrier : null;
        if (cc && cc !== this.qb && hyp(cc.x - p.x, cc.y - p.y) > 6 && hyp(cc.x - q.x, cc.y - q.y) > 6) { p.eng = null; q.eng = null; q.engCd = 1.5; p.engCd = 1.5; }
      }
    }
    const c = this.ball.state === "held" ? this.ball.carrier : null;
    const runAfter = c && c.side === "O" && (c !== this.qb || this.qbRun) && !this.intercepted;
    const blockers = ps.filter(p => p.side === "O" && p !== c && (p.role === "OL" || (p.route && p.route.block) || (runAfter && p.role !== "QB")));
    for (const bk of blockers) {
      if (bk.eng || bk.down > 0) continue;
      for (const d of ps) {
        if (d.side !== "D" || d.eng || d.down > 0 || d.engCd > 0) continue;
        if (this.ball.state === "held" && this.ball.carrier === d) continue;
        if (hyp(d.x - bk.x, d.y - bk.y) < 1.35) { bk.eng = d; d.eng = bk; d.engT = 0; break; }
      }
    }
    for (const d of ps) {
      if (d.side !== "D" || !d.eng || d.eng.eng !== d) continue;
      const bk = d.eng;
      d.engT += dt;
      // Who wins the rep.
      const pass = !this.runPlay && !(this.ball.state === "held" && this.ball.carrier !== this.qb);
      const skill = (pass ? d.p.rush : (d.p.tac + d.p.str) / 2) - bk.p.blk;
      const rate = (pass ? 0.07 : 0.3) + skill / 100 * (pass ? 0.55 : 1.1) + (pass && d.engT > 3 ? 0.35 : 0);
      if (Math.random() < Math.max(0.02, rate) * dt) {
        d.eng = null; bk.eng = null; d.engCd = 0.9;
        const a = Math.atan2(d.y - bk.y, d.x - bk.x);
        d.x += Math.cos(a + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1)) * 0.6;
        continue;
      }
      // Locked up: push depends on strength.
      const push = (bk.p.str - d.p.str) / 100 * 2.2 + (pass ? 0.4 : 1.4);
      const a = Math.atan2(d.y - bk.y, d.x - bk.x);
      d.dvx = Math.cos(a) * push; d.dvy = Math.sin(a) * push;
      bk.dvx = Math.cos(a) * push; bk.dvy = Math.sin(a) * push;
    }
  }

  // ----------------------------------------------------------- movement ---
  _move(p, dt) {
    if (p.down > 0) { p.vx *= 0.85; p.vy *= 0.85; }
    else {
      const accel = (p.instant ? 60 : 13 + p.p.agi * 0.08) * (p.sprint ? 0.85 : 1);
      p.instant = false;
      const dvx = p.dvx - p.vx, dvy = p.dvy - p.vy, dm = hyp(dvx, dvy);
      const k = Math.min(1, accel * dt / (dm || 1));
      p.vx += dvx * k; p.vy += dvy * k;
      const cap = p.p.spd * (p.move && (p.move.kind === "jukeL" || p.move.kind === "jukeR") ? 1.1 : 1) * (p.slow > 0 ? 0.6 : 1) * (p.pursuing ? 1.04 : 1);
      p.pursuing = false;
      const sp = hyp(p.vx, p.vy);
      if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (!(this.ball.state === "held" && this.ball.carrier === p)) p.y = clamp(p.y, -1.5, FW + 1.5);
    const sp = hyp(p.vx, p.vy);
    if (sp > 0.6) p.face = Math.atan2(p.vy, p.vx);
    p.walk += sp * dt * 1.6;
    if (p.leap) { p.leap.t += dt; if (p.leap.t > 0.8) p.leap = null; }
    if (p.dive > 0) p.dive -= dt;
    if (p.throwAnim > 0) p.throwAnim -= dt;
    p.hist.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy });
    if (p.hist.length > HIST) p.hist.shift();
  }

  /** Bodies don't overlap: a soft push apart. */
  _separate() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
      const min = 0.85;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        const ca = this.ball.state === "held" && this.ball.carrier === a, cb = this.ball.state === "held" && this.ball.carrier === b;
        a.x -= nx * push * (cb ? 1.4 : ca ? 0.6 : 1); a.y -= ny * push * (cb ? 1.4 : ca ? 0.6 : 1);
        b.x += nx * push * (ca ? 1.4 : cb ? 0.6 : 1); b.y += ny * push * (ca ? 1.4 : cb ? 0.6 : 1);
      }
    }
  }

  // ------------------------------------------------------------ camera ---
  /** view: { w, h, up } — set by the renderer every frame. */
  _camera(dt) {
    const v = this.view;
    if (!v) return;
    // The field's width runs along the screen's long side.
    const longAx = v.up ? v.w : v.h, shortAx = v.up ? v.h : v.w;
    const mode = this.cam.mode;
    const base = mode === "wide" ? 54 : mode === "close" ? 22 : 30;
    let cx, cy, span = base, fwdFit = 0;
    const fwdVis = (sp) => shortAx / (longAx / sp);
    const b = this.ball;
    if (this.phase === "kick" && this.kick) {
      const k = Math.min(1, this.kick.t / this.kick.dur);
      cx = this.kick.from + (this.kick.to - this.kick.from) * k; cy = CY; span = 50;
    } else if (this.phase === "presnap" || this.phase === "playbook" || this.phase === "pat" || this.phase === "wait" || !b) {
      cy = this.ballY;
      if (this.players.length && mode !== "close") {
        const ys = this.players.filter(p => p.side === "O" && p.letter).map(p => p.y);
        if (ys.length) { const y0 = Math.min(...ys), y1 = Math.max(...ys); span = clamp(y1 - y0 + 9, base, 56); cy = (y0 + y1) / 2; }
      }
      cx = this.los - 7 + fwdVis(span) * 0.5;
    } else {
      const c = b.state === "held" ? b.carrier : null;
      if (mode !== "wide" && c === this.qb && !this.thrown && !this.qbRun && !this.runPlay) {
        // Passing: the QB and every receiver he can throw to stay in shot.
        const rs = this.players.filter(p => p.side === "O" && p.letter && !(p.route && p.route.block));
        const ys = [c.y, ...rs.map(r => r.y)], xs = rs.map(r => r.x);
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        span = clamp(y1 - y0 + 9, base, 58);
        cy = (y0 + y1) / 2;
        const fv = fwdVis(span), x0 = c.x - 3, x1 = Math.max(c.x, ...xs) + 4;
        cx = x1 - x0 > fv ? x0 + fv / 2 : (x0 + x1) / 2;
      } else if (b.state === "air" && !b.snap && !b.pitch) {
        const [tx, ty] = b.to;
        cx = (b.from[0] + tx) / 2; cy = (b.from[1] + ty) / 2;
        span = clamp(Math.abs(ty - b.from[1]) + 12, base, 58);
        fwdFit = Math.abs(tx - b.from[0]) + 12;
      } else {
        const t = c || b;
        const dir = c && c.side === "D" && this.intercepted ? -1 : 1;
        cx = t.x + dir * fwdVis(span) * 0.18 + (c ? (c.vx || 0) * 0.25 : 0); cy = t.y;
      }
    }
    let z = longAx / span;
    if (fwdFit) z = Math.min(z, shortAx / fwdFit);
    const k = Math.min(1, dt * 3.5);
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (cy - this.cam.y) * k;
    this.cam.z += (z - this.cam.z) * Math.min(1, dt * 2.5);
    // Keep the camera on the field across, so there's no dead space.
    const half = longAx / this.cam.z / 2;
    this.cam.y = half * 2 >= FW + 6 ? CY : clamp(this.cam.y, half - 3, FW + 3 - half);
  }
}

/** A copy of a player's attributes nudged by the difficulty. */
function boost(p, adj) {
  if (!adj) return { ...p };
  const q = { ...p };
  for (const k of ["acc", "agi", "str", "hands", "thr", "aim", "tac", "cov", "rush", "blk", "ball", "awr"]) q[k] = clamp(q[k] + adj, 30, 99);
  q.spd = p.spd * (1 + adj * 0.003);
  return q;
}
