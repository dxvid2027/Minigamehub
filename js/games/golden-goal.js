// ==========================================================================
// Golden Goal — a football game, unlocked with a secret code.
//
// Pick a nation and take it through a 48-team World Cup, pick a club and
// take it through the Champions League, or just play a one-off match. Every
// fixture can be played yourself on the pitch or simulated; the rest of the
// round is simulated around you, tables update, and the knockout draw is
// made from the real standings.
//
// The run is saved after every match, so a tournament can be finished over
// several sittings. Files:
//   goldenGoalData.js   teams, kits, flags and crests
//   goldenGoalCup.js    competition formats and result simulation
//   goldenGoalMatch.js  the playable match and the penalty shoot-out
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { el, formatNumber } from "../core/utils.js";
import { confirmModal } from "../ui/modal.js";
import { NATIONS, CLUBS, teamKey, getTeam, badgeURL, pickKits } from "./goldenGoalData.js";
import * as Cup from "./goldenGoalCup.js";
import { Match, Shootout, StadiumBackdrop } from "./goldenGoalMatch.js";

const LENGTHS = [[4, "Quick · 4 min"], [6, "Standard · 6 min"], [10, "Long · 10 min"]];
const DIFF_MULT = { Amateur: 0.7, Pro: 1, "World Class": 1.4 };
const STAGE_BONUS = { r32: 400, po: 300, r16: 800, qf: 1500, sf: 2500, final: 4000 };
const MODE_INFO = {
  wc: { title: "World Cup", icon: "🏆", blurb: "48 nations · 12 groups · knockout from the round of 32", pool: "nation" },
  cl: { title: "Champions League", icon: "⭐", blurb: "36 clubs · one league table · play-offs and knockouts", pool: "club" },
  fr: { title: "Quick Match", icon: "⚽", blurb: "Any two teams, one match, no table", pool: "all" },
};

const badgeImg = (team, cls = "gg-badge") => el("img", { class: cls + (team.kind === "club" ? " crest" : ""), src: badgeURL(team), alt: "", draggable: "false" });
const stars = (r) => {
  const n = Math.max(0.5, Math.min(5, Math.round(((r - 64) / 5) * 2) / 2));
  return "★".repeat(Math.floor(n)) + (n % 1 ? "½" : "");
};

export class GoldenGoalGame extends GameBase {
  getDifficulties() { return ["Amateur", "Pro", "World Class"]; }
  getInstructions() {
    return [
      "World Cup: pick one of 48 nations. Three group games, then knockout football from the round of 32 to the final.",
      "Champions League: pick one of 36 clubs. Eight league games against eight different clubs; the top 8 go straight to the last 16, 9th–24th play a knockout play-off.",
      "Play each match yourself, or simulate it. Your side always attacks to the right.",
      "With the ball: Pass, or hold Shoot to power up a shot and aim with up/down as you release. A long way from goal, Shoot becomes a long ball.",
      "Without it: Pass switches to the player nearest the ball, Shoot is a slide tackle. Running into the man on the ball tries a standing tackle.",
      "A knockout draw goes straight to penalties. Your run is saved after every match.",
    ];
  }
  getKeyboardHint() { return "Arrows / WASD run · Space pass (switch when defending) · hold K or X to shoot (slide when defending) · P pause."; }
  getTouchHint() { return "Stick to run · Pass · hold Shoot for power (slide tackle when defending)."; }
  getTouchLayout() { return "stick"; }
  getTouchButtons() { return ["a", "b"]; }
  getTouchButtonLabels() { return { a: "Pass", b: "Shoot" }; }
  getScene() { return "arena"; }
  getPlayLabel() { return this._store().career ? "Continue" : "Kick off"; }

  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.gg) custom.gg = { career: null, titles: { wc: 0, cl: 0 }, length: 6, matches: 0, wins: 0, goals: 0, best: {} };
    return custom.gg;
  }
  _save() { saveManager.saveNow(); }

  getStartExtras() {
    const s = this._store();
    const c = s.career;
    return el("div", { class: "delve-summary" }, [
      el("span", {}, `🏆 World Cups: ${s.titles.wc || 0}`),
      el("span", {}, `⭐ Champions Leagues: ${s.titles.cl || 0}`),
      el("span", {}, `${s.matches || 0} matches played`),
      c ? el("span", {}, `In progress: ${getTeam(c.user)?.name} · ${MODE_INFO[c.kind]?.title}`) : null,
    ]);
  }

  // -------------------------------------------------------------- setup --
  onInit() {
    this.difficulty = "Pro";
    this.createCanvas();
    this.hubEl = el("div", { class: "gg-hub" });
    this.stageEl.appendChild(this.hubEl);
    this.backdrop = new StadiumBackdrop();
    this.input.onPointer("down", (p) => { if (this.pens) this.pens.tap(p.x, p.y, this.viewW); });
  }

  onStart() {
    this.match = null; this.pens = null;
    const c = this._store().career;
    this.setScore(c ? c.score : 0);
    if (c) this._showTour(); else this._showMenu();
  }

  onDestroyRound() { this.match = null; this.pens = null; }

  _setMode(mode) {
    this.mode = mode;
    const inPlay = mode === "match" || mode === "pens";
    this.hubEl.hidden = inPlay;
    // A menu button left focused would swallow the first Space of the match.
    if (inPlay) document.activeElement?.blur?.();
    this.touchEl.style.visibility = inPlay ? "" : "hidden";
    this.tipEl.textContent = inPlay
      ? (this.useTouch ? "Stick to run · Pass · hold Shoot. Your side attacks to the right." : "Space pass · hold K to shoot · aim with ↑/↓ · P to pause. You attack to the right.")
      : "Tip: every match can be played or simulated — your run is saved after each one.";
  }

  onUpdate(dt) {
    if (this.match) {
      this.match.update(dt);
      if (this.match.finished) this._matchOver();
    } else if (this.pens) {
      this.pens.update(dt);
      if (this.pens.finished) this._pensOver();
    }
  }

  onRender(ctx, dt) {
    const w = this.viewW, h = this.viewH, dpr = this.dpr || 1;
    if (!w || !h) return;
    if (this.match) this.match.render(ctx, w, h, dpr);
    else if (this.pens) this.pens.render(ctx, w, h, dpr);
    else this.backdrop.render(ctx, w, h, dpr, dt);
  }

  // --------------------------------------------------------------- hub ---
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
    const modeCard = (kind) => {
      const m = MODE_INFO[kind];
      return el("button", { class: `gg-mode gg-mode-${kind}`, onClick: () => { audioManager.play("click"); this._pickTeam(kind); } }, [
        el("span", { class: "ic" }, m.icon),
        el("span", { class: "t" }, m.title),
        el("span", { class: "d" }, m.blurb),
        kind !== "fr" ? el("span", { class: "won" }, `${s.titles[kind] || 0}× champion`) : null,
      ]);
    };
    const lengthRow = el("div", { class: "gg-chips" }, LENGTHS.map(([m, label]) => el("button", {
      class: `chip${s.length === m ? " active" : ""}`,
      onClick: (e) => { s.length = m; this._save(); audioManager.play("select"); [...e.currentTarget.parentNode.children].forEach(c => c.classList.toggle("active", c === e.currentTarget)); },
    }, label)));
    this._screen("gg-menu", [
      el("div", { class: "gg-brand" }, [
        el("div", { class: "gg-logo" }, "⚽"),
        el("div", {}, [el("h2", {}, "Golden Goal"), el("p", {}, "World Cup · Champions League · Quick Match")]),
      ]),
      el("div", { class: "gg-modes" }, ["wc", "cl", "fr"].map(modeCard)),
      el("div", { class: "gg-opt" }, [el("span", { class: "lbl" }, "Match length"), lengthRow]),
      el("div", { class: "gg-opt" }, [el("span", { class: "lbl" }, "Difficulty"), el("span", { class: "val" }, `${this.difficulty} — change it on the start screen`)]),
    ]);
  }

  _pickTeam(kind, step = 0, picked = null) {
    const info = MODE_INFO[kind];
    const pool = info.pool === "nation" ? NATIONS : info.pool === "club" ? CLUBS : [...NATIONS, ...CLUBS];
    let filter = "";
    let tab = info.pool === "all" ? "nation" : info.pool;
    let chosen = null;
    const grid = el("div", { class: "gg-teams" });
    const go = el("button", { class: "btn btn-primary", disabled: true }, step ? "Choose opponent" : "Choose a team");
    const render = () => {
      grid.innerHTML = "";
      const list = pool.filter(t => (info.pool !== "all" || t.kind === tab) && (!picked || teamKey(t) !== picked)
        && (!filter || t.name.toLowerCase().includes(filter) || t.id.toLowerCase().includes(filter)))
        .sort((a, b) => b.r - a.r || a.name.localeCompare(b.name));
      for (const t of list) {
        const key = teamKey(t);
        grid.appendChild(el("button", {
          class: `gg-team${chosen === key ? " sel" : ""}`,
          style: `--kit:${t.home.shirt};--trim:${t.home.trim}`,
          onClick: () => {
            chosen = key; audioManager.play("select");
            grid.querySelectorAll(".gg-team").forEach(n => n.classList.toggle("sel", n.dataset.k === key));
            go.disabled = false;
            go.textContent = step ? `Play against ${t.name}` : kind === "fr" ? `Pick ${t.name}` : `Start with ${t.name}`;
          },
          "data-k": key,
        }, [
          badgeImg(t),
          el("span", { class: "nm" }, t.name),
          el("span", { class: "rt" }, [el("b", {}, String(t.r)), el("i", {}, stars(t.r))]),
          el("span", { class: "kit" }),
        ]));
      }
    };
    const search = el("input", { class: "text-input", type: "search", placeholder: "Search teams…" });
    search.addEventListener("input", () => { filter = search.value.trim().toLowerCase(); render(); });
    const tabs = info.pool === "all" ? el("div", { class: "gg-chips" }, [["nation", "Nations"], ["club", "Clubs"]].map(([v, label]) => el("button", {
      class: `chip${tab === v ? " active" : ""}`,
      onClick: (e) => { tab = v; [...e.currentTarget.parentNode.children].forEach(c => c.classList.toggle("active", c === e.currentTarget)); render(); },
    }, label))) : null;
    go.addEventListener("click", () => {
      if (!chosen) return;
      audioManager.play("start");
      if (kind === "fr" && !step) { this._pickTeam("fr", 1, chosen); return; }
      if (kind === "fr") this._startCareer("fr", { home: picked, away: chosen });
      else this._startCareer(kind, chosen);
    });
    render();
    this._screen("gg-pick", [
      el("div", { class: "gg-head" }, [
        el("button", { class: "btn btn-ghost btn-sm", onClick: () => (step ? this._pickTeam(kind) : this._showMenu()) }, "← Back"),
        el("div", { class: "gg-title" }, [el("h3", {}, step ? "Pick the opponent" : kind === "fr" ? "Pick your team" : `${info.icon} ${info.title}`), el("p", {}, step ? `${getTeam(picked).name} will be playing` : "Pick the team you want to take all the way")]),
      ]),
      el("div", { class: "gg-filter" }, [search, tabs]),
      grid,
      el("div", { class: "gg-footer" }, [go]),
    ]);
  }

  _startCareer(kind, user) {
    const c = Cup.createCompetition(kind, user);
    c.score = 0;
    c.minutes = this._store().length || 6;
    c.diff = this.difficulty;
    this._store().career = c;
    this._save();
    this.setScore(0);
    this._showTour();
  }

  // ---------------------------------------------------------- tournament --
  _career() { return this._store().career; }

  _showTour(tab) {
    const c = this._career();
    if (!c) { this._showMenu(); return; }
    if (c.done || c.out) { this._showFinale(); return; }
    const round = Cup.currentRound(c);
    const uf = Cup.userFixture(c);
    const user = getTeam(c.user);
    this.setHud({ Mode: MODE_INFO[c.kind].title, Stage: round ? Cup.STAGE_NAMES[round.stage] : "—" });

    let next;
    if (uf) {
      const home = getTeam(uf.a), away = getTeam(uf.b);
      const ko = !!uf.ko;
      next = el("div", { class: "gg-next" }, [
        el("div", { class: "lbl" }, `${round.label}${uf.group ? ` · Group ${uf.group}` : ""}${ko ? " · winner goes through" : ""}`),
        el("div", { class: "vs" }, [
          el("div", { class: `side${uf.a === c.user ? " me" : ""}` }, [badgeImg(home, "gg-badge lg"), el("b", {}, home.name), el("span", {}, `OVR ${home.r}`)]),
          el("div", { class: "mid" }, "VS"),
          el("div", { class: `side${uf.b === c.user ? " me" : ""}` }, [badgeImg(away, "gg-badge lg"), el("b", {}, away.name), el("span", {}, `OVR ${away.r}`)]),
        ]),
        el("div", { class: "acts" }, [
          el("button", { class: "btn btn-primary btn-lg", onClick: () => this._playFixture() }, "▶  Play match"),
          el("button", { class: "btn btn-ghost", onClick: () => this._simFixture() }, "Simulate"),
        ]),
      ]);
    } else {
      next = el("div", { class: "gg-next" }, [
        el("div", { class: "lbl" }, round.label),
        el("p", { class: "bye" }, `${user.name} ${c.kind === "cl" ? "finished in the top eight and" : ""} sit${c.kind === "cl" ? "" : "s"} this round out.`),
        el("div", { class: "acts" }, [el("button", { class: "btn btn-primary btn-lg", onClick: () => this._simRoundOnly() }, "Simulate the round")]),
      ]);
    }

    const tabs = this._tabs(c, tab);
    this._screen("gg-tour", [
      el("div", { class: "gg-head" }, [
        el("button", { class: "btn btn-ghost btn-sm", onClick: () => this._confirmAbandon() }, "Abandon"),
        el("div", { class: "gg-title" }, [
          el("h3", {}, [badgeImg(user), ` ${user.name}`]),
          el("p", {}, `${MODE_INFO[c.kind].title} · ${Cup.STAGE_NAMES[round.stage]} · ${formatNumber(c.score)} pts`),
        ]),
      ]),
      next,
      tabs,
    ]);
  }

  _tabs(c, active) {
    const opts = [];
    if (c.kind === "wc") { opts.push(["group", "My group"], ["groups", "All groups"]); }
    if (c.kind === "cl") opts.push(["league", "League table"]);
    if (Cup.knockoutRounds(c).length) opts.push(["bracket", "Knockouts"]);
    opts.push(["fixtures", "My matches"]);
    if (!opts.length) return null;
    let cur = active && opts.some(o => o[0] === active) ? active : (Cup.knockoutRounds(c).length ? "bracket" : opts[0][0]);
    const body = el("div", { class: "gg-tabbody" });
    const bar = el("div", { class: "gg-tabs" });
    const draw = () => {
      bar.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.t === cur));
      body.innerHTML = "";
      body.appendChild(this._tabContent(c, cur));
    };
    opts.forEach(([k, label]) => bar.appendChild(el("button", { "data-t": k, onClick: () => { cur = k; audioManager.play("toggle"); draw(); } }, label)));
    draw();
    return el("div", { class: "gg-panel" }, [bar, body]);
  }

  _tabContent(c, tab) {
    if (tab === "group") {
      const t = Cup.groupTables(c).find(g => g.rows.some(r => r.id === c.user));
      return el("div", {}, [el("div", { class: "gg-sub" }, `Group ${t.name} — top two qualify, and eight of the twelve third-placed teams`), this._table(t.rows, c, (i) => (i < 2 ? "q" : i === 2 ? "p" : ""))]);
    }
    if (tab === "groups") {
      return el("div", { class: "gg-groups" }, Cup.groupTables(c).map(t =>
        el("div", { class: "gg-group" }, [el("div", { class: "gg-sub" }, `Group ${t.name}`), this._table(t.rows, c, (i) => (i < 2 ? "q" : i === 2 ? "p" : ""), true)])));
    }
    if (tab === "league") {
      return el("div", {}, [el("div", { class: "gg-sub" }, "1–8 straight into the round of 16 · 9–24 knockout play-off · 25–36 out"), this._table(Cup.leagueTable(c), c, (i) => (i < 8 ? "q" : i < 24 ? "p" : "x"))]);
    }
    if (tab === "bracket") return this._bracket(c);
    // fixtures
    const list = el("div", { class: "gg-fixtures" });
    for (const { f, round } of Cup.userFixtures(c)) list.appendChild(this._fixtureRow(f, c, round.label));
    return list;
  }

  _table(rows, c, zone, compact = false) {
    const head = compact ? ["", "Team", "P", "GD", "Pts"] : ["", "Team", "P", "W", "D", "L", "GD", "Pts"];
    return el("table", { class: `gg-table${compact ? " compact" : ""}` }, [
      el("thead", {}, el("tr", {}, head.map(h => el("th", {}, h)))),
      el("tbody", {}, rows.map((r, i) => {
        const t = getTeam(r.id);
        const cells = compact ? [r.p, (r.gd > 0 ? "+" : "") + r.gd, r.pts] : [r.p, r.w, r.d, r.l, (r.gd > 0 ? "+" : "") + r.gd, r.pts];
        return el("tr", { class: `${r.id === c.user ? "me " : ""}z-${zone(i) || "n"}` }, [
          el("td", { class: "pos" }, String(i + 1)),
          el("td", { class: "tm" }, [badgeImg(t), el("span", {}, compact ? t.id : t.name)]),
          ...cells.map((v, j) => el("td", { class: j === cells.length - 1 ? "pts" : "" }, String(v))),
        ]);
      })),
    ]);
  }

  _fixtureRow(f, c, label) {
    const A = getTeam(f.a), B = getTeam(f.b);
    const score = f.played ? `${f.ga} – ${f.gb}` : "v";
    const pens = f.played && f.pa !== null && f.pa !== undefined ? ` (${f.pa}–${f.pb} pens)` : "";
    const res = f.played && (f.a === c.user || f.b === c.user)
      ? (() => { const w = Cup.winnerOf(f); const draw = f.ga === f.gb && !f.ko; return draw ? "d" : w === c.user ? "w" : "l"; })()
      : "";
    return el("div", { class: `gg-fx${res ? " r-" + res : ""}` }, [
      label ? el("span", { class: "st" }, label) : null,
      el("span", { class: `a${f.a === c.user ? " me" : ""}` }, [el("span", {}, A.name), badgeImg(A)]),
      el("span", { class: "sc" }, score + pens),
      el("span", { class: `b${f.b === c.user ? " me" : ""}` }, [badgeImg(B), el("span", {}, B.name)]),
    ]);
  }

  _bracket(c) {
    const rounds = Cup.knockoutRounds(c);
    return el("div", { class: "gg-bracket" }, rounds.map(r => el("div", { class: "col" }, [
      el("div", { class: "gg-sub" }, Cup.STAGE_NAMES[r.stage]),
      ...r.fixtures.map(f => {
        const w = Cup.winnerOf(f);
        const line = (key, g, p) => {
          const t = getTeam(key);
          return el("div", { class: `ln${w === key ? " win" : ""}${key === c.user ? " me" : ""}` }, [badgeImg(t), el("span", { class: "n" }, t.id), el("b", {}, f.played ? `${g}${p !== null && p !== undefined ? ` (${p})` : ""}` : "")]);
        };
        return el("div", { class: "tie" }, [line(f.a, f.ga, f.pa), line(f.b, f.gb, f.pb)]);
      }),
    ])));
  }

  async _confirmAbandon() {
    const ok = await confirmModal({ title: "Abandon this run?", message: "Your current tournament will be thrown away. Titles you already won are kept.", confirmLabel: "Abandon", danger: true });
    if (!ok) return;
    this._store().career = null;
    this._save();
    this.setScore(0);
    this._showMenu();
  }

  // -------------------------------------------------------- playing it ---
  _sides(c, f) {
    const userHome = f.a === c.user;
    const user = getTeam(c.user), cpu = getTeam(userHome ? f.b : f.a);
    const [hk, ak] = pickKits(getTeam(f.a), getTeam(f.b));
    return { userHome, user, cpu, userKit: userHome ? hk : ak, cpuKit: userHome ? ak : hk };
  }

  _playFixture() {
    const c = this._career();
    const f = Cup.userFixture(c);
    if (!f) return;
    const s = this._sides(c, f);
    const round = Cup.currentRound(c);
    audioManager.play("start");
    this.match = new Match({
      user: s.user, cpu: s.cpu, userKit: s.userKit, cpuKit: s.cpuKit, userHome: s.userHome,
      minutes: c.minutes || 6, difficulty: c.diff || this.difficulty, input: this.input,
      label: `${MODE_INFO[c.kind].title} · ${round.label}${f.group ? ` · Group ${f.group}` : ""}`,
    });
    this.fixtureSides = s;
    this._setMode("match");
    this.setHud({ Mode: MODE_INFO[c.kind].title, Stage: Cup.STAGE_NAMES[round.stage] });
  }

  _matchOver() {
    const m = this.match;
    const c = this._career();
    const f = Cup.userFixture(c);
    this.match = null;
    const res = m.result;
    this.lastMatch = res;
    if (f.ko && res.user === res.cpu) {
      const s = this.fixtureSides;
      this.pens = new Shootout({ user: s.user, cpu: s.cpu, userKit: s.userKit, cpuKit: s.cpuKit, input: this.input, difficulty: c.diff || this.difficulty });
      this.pendingScore = res;
      this._setMode("pens");
      return;
    }
    this._finish(res.user, res.cpu, null, null, res.events, true);
  }

  _pensOver() {
    const p = this.pens.result;
    this.pens = null;
    const r = this.pendingScore;
    this._finish(r.user, r.cpu, p.user, p.cpu, r.events, true);
  }

  _simFixture() {
    const c = this._career();
    const f = Cup.userFixture(c);
    const s = this._sides(c, f);
    const sim = Cup.simulateMatch(s.user.r + (this.difficulty === "Amateur" ? 2 : 0), s.cpu.r, !!f.ko);
    audioManager.play("click");
    // simulateMatch is from the user's side; events side 0 = user.
    this._finish(sim.ga, sim.gb, sim.pa, sim.pb, sim.events.map(e => ({ ...e, side: e.side })), false);
  }

  _simRoundOnly() {
    const c = this._career();
    const before = c.index;
    const round = Cup.currentRound(c);
    Cup.simulateRest(c);
    Cup.advance(c);
    this._stageBonus(c, before);
    this._save();
    this._showResults(round, null);
  }

  /**
   * Writes the player's result onto the fixture (in fixture order), scores
   * it, simulates everyone else and moves the competition on.
   */
  _finish(gu, gc, pu, pc, events, played) {
    const c = this._career();
    const f = Cup.userFixture(c);
    const round = Cup.currentRound(c);
    const userHome = f.a === c.user;
    const map = (u, o) => (userHome ? [u, o] : [o, u]);
    const [ga, gb] = map(gu, gc);
    const [pa, pb] = pu === null || pu === undefined ? [null, null] : map(pu, pc);
    Cup.recordResult(c, f, { ga, gb, pa, pb, events: events.map(e => ({ min: e.min, side: (e.side === 0) === userHome ? 0 : 1 })) });

    const st = this._store();
    st.matches = (st.matches || 0) + (played ? 1 : 0);
    st.goals = (st.goals || 0) + (played ? gu : 0);
    const won = gu > gc || (gu === gc && pu !== null && pu > pc);
    if (won && played) st.wins = (st.wins || 0) + 1;
    const mult = DIFF_MULT[c.diff] || 1;
    const base = (gu > gc ? 300 : gu === gc ? 100 : 0) + gu * 60 + (gu > gc && gc === 0 ? 100 : 0);
    const pts = Math.round(base * mult * (played ? 1 : 0.5));
    c.score += pts;

    const before = c.index;
    Cup.simulateRest(c);
    Cup.advance(c);
    this._stageBonus(c, before);
    this.setScore(c.score);
    this._save();
    this._showResults(round, { f, gu, gc, pu, pc, pts, played, won, userHome });
  }

  _stageBonus(c, before) {
    if (c.out || c.index === before) return;
    const mult = DIFF_MULT[c.diff] || 1;
    const next = Cup.currentRound(c);
    if (c.champion === c.user) c.score += Math.round(8000 * mult);
    else if (next && STAGE_BONUS[next.stage] && Cup.userFixture(c)) c.score += Math.round(STAGE_BONUS[next.stage] * mult);
    this.setScore(c.score);
  }

  _showResults(round, mine) {
    const c = this._career();
    const children = [];
    if (mine) {
      const A = getTeam(mine.f.a), B = getTeam(mine.f.b);
      const verdict = mine.gu > mine.gc ? "Victory!" : mine.gu < mine.gc ? "Defeat" : mine.pu !== null ? (mine.won ? "Through on penalties!" : "Out on penalties") : "Draw";
      const evs = (mine.f.events || []).slice().sort((x, y) => x.min - y.min);
      children.push(el("div", { class: `gg-result ${mine.won ? "won" : mine.gu === mine.gc && mine.pu === null ? "drew" : "lost"}` }, [
        el("div", { class: "verdict" }, verdict),
        el("div", { class: "line" }, [
          el("div", { class: "side" }, [badgeImg(A, "gg-badge lg"), el("b", {}, A.name)]),
          el("div", { class: "score" }, [el("span", {}, `${mine.f.ga} – ${mine.f.gb}`), mine.f.pa !== null ? el("small", {}, `${mine.f.pa}–${mine.f.pb} on penalties`) : null]),
          el("div", { class: "side" }, [badgeImg(B, "gg-badge lg"), el("b", {}, B.name)]),
        ]),
        evs.length ? el("div", { class: "goals" }, evs.map(e => el("span", { class: e.side === 0 ? "l" : "r" }, `⚽ ${e.min}'`))) : null,
        el("div", { class: "pts" }, `+${formatNumber(mine.pts)} pts${mine.played ? "" : " (simulated: half points)"}`),
      ]));
    }
    // The rest of the round: your group first, then everyone else.
    let fx = round.fixtures.filter(f => !mine || f !== mine.f);
    const myGroup = mine?.f.group;
    if (myGroup) fx = fx.sort((a, b) => (a.group === myGroup ? -1 : 0) - (b.group === myGroup ? -1 : 0));
    children.push(el("div", { class: "gg-panel" }, [
      el("div", { class: "gg-sub" }, `${round.label} — all results`),
      el("div", { class: "gg-fixtures" }, fx.map(f => this._fixtureRow(f, c, f.group ? `Grp ${f.group}` : ""))),
    ]));
    const nextLabel = c.done || c.out ? "Continue" : "Next match";
    this._screen("gg-results", [
      ...children,
      el("div", { class: "gg-footer" }, [el("button", { class: "btn btn-primary btn-lg", onClick: () => this._showTour() }, nextLabel)]),
    ]);
    if (mine) audioManager.play(mine.won ? "win" : mine.gu === mine.gc ? "select" : "lose");
  }

  // ------------------------------------------------------------- finale ---
  _showFinale() {
    const c = this._career();
    const user = getTeam(c.user);
    if (c.kind === "fr") {
      const f = c.rounds[0].fixtures[0];
      const userHome = f.a === c.user;
      const gu = userHome ? f.ga : f.gb, go = userHome ? f.gb : f.ga;
      this._close(gu > go ? "win" : gu < go ? "loss" : "draw", `${getTeam(f.a).name} ${f.ga} – ${f.gb} ${getTeam(f.b).name}`);
      return;
    }
    const champion = c.champion === c.user;
    if (champion) {
      this._screen("gg-finale won", [
        el("div", { class: "trophy" }, c.kind === "wc" ? "🏆" : "⭐"),
        el("h2", {}, `${user.name} are champions!`),
        el("p", {}, `You won the ${MODE_INFO[c.kind].title}.`),
        badgeImg(user, "gg-badge xl"),
        el("div", { class: "gg-footer" }, [el("button", { class: "btn btn-primary btn-lg", onClick: () => this._close("win", `${user.name} won the ${MODE_INFO[c.kind].title}!`) }, "Lift the trophy")]),
      ]);
      audioManager.play("levelup");
      return;
    }
    if (c.out && !c.done) {
      this._screen("gg-finale", [
        el("div", { class: "trophy" }, "💔"),
        el("h2", {}, `${user.name} are out`),
        el("p", {}, `Knocked out in the ${Cup.STAGE_NAMES[c.out].toLowerCase()}.`),
        el("div", { class: "gg-footer" }, [
          el("button", { class: "btn btn-ghost", onClick: () => { this._simToEnd(); } }, "See who wins it"),
          el("button", { class: "btn btn-primary btn-lg", onClick: () => this._close("loss", `Out in the ${Cup.STAGE_NAMES[c.out].toLowerCase()}.`) }, "Finish"),
        ]),
      ]);
      return;
    }
    // Out, and the competition has been played to the end.
    const champ = getTeam(c.champion);
    this._screen("gg-finale", [
      el("div", { class: "trophy" }, "🏆"),
      el("h2", {}, `${champ.name} win the ${MODE_INFO[c.kind].title}`),
      badgeImg(champ, "gg-badge xl"),
      el("p", {}, `${user.name} went out in the ${Cup.STAGE_NAMES[c.out].toLowerCase()}.`),
      Cup.knockoutRounds(c).length ? el("div", { class: "gg-panel" }, [this._bracket(c)]) : null,
      el("div", { class: "gg-footer" }, [el("button", { class: "btn btn-primary btn-lg", onClick: () => this._close("loss", `Out in the ${Cup.STAGE_NAMES[c.out].toLowerCase()}. ${champ.name} won it.`) }, "Finish")]),
    ]);
  }

  _simToEnd() {
    const c = this._career();
    let guard = 0;
    while (!c.done && guard++ < 40) { Cup.simulateRest(c); Cup.advance(c); }
    this._save();
    this._showFinale();
  }

  _close(result, message) {
    const c = this._career();
    const st = this._store();
    const stage = Cup.stageReached(c);
    if (c.kind !== "fr") {
      if (c.champion === c.user) st.titles[c.kind] = (st.titles[c.kind] || 0) + 1;
      const order = ["group", "league", "po", "r32", "r16", "qf", "sf", "final", "champion"];
      const prev = st.best[c.kind];
      if (!prev || order.indexOf(stage) > order.indexOf(prev)) st.best[c.kind] = stage;
    }
    const score = c.score;
    const extra = [
      { label: "Team", value: getTeam(c.user).name },
      c.kind !== "fr" ? { label: "Reached", value: stage === "champion" ? "Champions" : Cup.STAGE_NAMES[stage] } : null,
    ].filter(Boolean);
    st.career = null;
    this._save();
    this.hubEl.innerHTML = "";
    this.endGame({ result, score, message, extraStats: extra, statsPatch: { lastTeam: getTeam(c.user).name } });
  }
}

export default GoldenGoalGame;
