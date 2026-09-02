// ==========================================================================
// Flappy Wings — one-touch flap-and-dodge, across eight zones.
//
// The original was a bird, a gap and a green rectangle. This version keeps
// the one-touch loop exactly as it was and rebuilds everything around it:
//
//   Zones     Eight worlds with their own sky, parallax layers, obstacle
//             shape, ambient weather and hazard. The world changes every
//             twelve gates, so a long run is a journey rather than one
//             wallpaper. Reaching a zone unlocks it as a starting point.
//   Skins     Twelve drawn birds, each with its own body, wing, beak and
//             trail, unlocked by score, by distance or with feathers picked
//             up mid-flight.
//   Graphics  Three parallax layers rendered once per zone into offscreen
//             tiles and blitted, so the depth costs two draws a layer rather
//             than a few hundred shapes a frame.
// ==========================================================================
import { GameBase } from "./gameBase.js";
import { audioManager } from "../systems/audioManager.js";
import { saveManager } from "../systems/saveManager.js";
import { openModal, closeModal } from "../ui/modal.js";
import { el, formatNumber, clamp, randFloat, randInt } from "../core/utils.js";

const GATES_PER_ZONE = 12;
// Spacing is in pixels, not seconds. A fixed timer meant the faster late
// zones also crowded their gates together, so they got harder twice over —
// this way a zone's speed changes the pace, not the room to manoeuvre.
const GATE_SPACING = 330;
const GRAVITY = 1480;
const FLAP_V = -432;
const BIRD_R = 15;

// ---------------------------------------------------------------- zones ---
// `gap` and `speed` are multipliers on the baseline, so a zone can be read as
// "a bit tighter and faster than the last one" at a glance.
const ZONES = [
  {
    name: "Meadow Dawn", blurb: "Soft light, wide gaps, nothing in your way.",
    sky: ["#8ed4f0", "#d9f0e4", "#ffe9c4"],
    far: "#7fae94", mid: "#4d8a68", near: "#2f5d45", ground: "#3b6b4c",
    obstacle: "pipe", obColor: "#57b86f", obEdge: "#2f7a44",
    weather: "leaves", gap: 1.16, speed: 0.92, hazard: null,
  },
  {
    name: "Redstone Canyon", blurb: "Wind gusts push you around between the mesas.",
    sky: ["#f2a35e", "#e8734a", "#7d3a3f"],
    far: "#8a4a44", mid: "#6d3634", near: "#4a2426", ground: "#5c2c2a",
    obstacle: "rock", obColor: "#b0603f", obEdge: "#6e3423",
    weather: "dust", gap: 1.06, speed: 1.0, hazard: "wind",
  },
  {
    name: "Coral Shallows", blurb: "The gaps drift up and down with the swell.",
    sky: ["#2ec6d8", "#1a8fb8", "#0d5c86"],
    far: "#1f7fa0", mid: "#166486", near: "#0e4763", ground: "#134f6b",
    obstacle: "coral", obColor: "#ff7aa8", obEdge: "#b83a70",
    weather: "bubbles", gap: 1.08, speed: 1.02, hazard: "drift",
  },
  {
    name: "Thunder Reach", blurb: "Storm pylons, and the sky lights up behind them.",
    sky: ["#3b3f6b", "#262a4d", "#14172e"],
    far: "#3a3f66", mid: "#2a2e4d", near: "#1b1e36", ground: "#232640",
    obstacle: "pylon", obColor: "#8fa0d8", obEdge: "#4b5488",
    weather: "rain", gap: 1.0, speed: 1.08, hazard: "lightning",
  },
  {
    name: "Emberfall", blurb: "Basalt columns and rising ash. Tight and hot.",
    sky: ["#7d2d1e", "#4a1512", "#1e0a0b"],
    far: "#5c2118", mid: "#3f1611", near: "#280d0b", ground: "#33110d",
    obstacle: "basalt", obColor: "#5a4038", obEdge: "#2a1a16",
    weather: "embers", gap: 0.96, speed: 1.12, hazard: null,
  },
  {
    name: "Glacier Run", blurb: "Ice spires, and the wind cuts sideways.",
    sky: ["#cbeaf7", "#8fc4e0", "#4b7fa8"],
    far: "#9dc4dd", mid: "#7aa6c4", near: "#5b86a6", ground: "#6b93b0",
    obstacle: "ice", obColor: "#bfe8ff", obEdge: "#6aa8cc",
    weather: "snow", gap: 0.98, speed: 1.1, hazard: "wind",
  },
  {
    name: "Neon Skyline", blurb: "Between the towers, after dark.",
    sky: ["#1b1038", "#3a1a55", "#0d0820"],
    far: "#2e1a4d", mid: "#22133a", near: "#160c28", ground: "#1c1030",
    obstacle: "tower", obColor: "#3b2a63", obEdge: "#c86bff",
    weather: "city", gap: 0.94, speed: 1.16, hazard: "drift",
  },
  {
    name: "Orbit Fall", blurb: "No ground, no ceiling, only rock and vacuum.",
    sky: ["#0a0a1e", "#12102e", "#05050f"],
    far: "#1a1838", mid: "#131128", near: "#0b0a1a", ground: "#0d0c1c",
    obstacle: "asteroid", obColor: "#5c5a78", obEdge: "#a9a6cc",
    weather: "stars", gap: 0.92, speed: 1.22, hazard: "drift",
  },
];

// ---------------------------------------------------------------- skins ---
// Each skin is a small palette plus a silhouette flag. `unlock` is checked
// against the save, so the list doubles as the progression ladder.
const SKINS = [
  { id: "sunny",   name: "Sunny",      body: "#ffd76a", belly: "#fff3c4", wing: "#ff9f43", beak: "#ff8c2b", eye: "#160f00", trail: "#ffd76a", shape: "round",  unlock: null },
  { id: "robin",   name: "Robin",      body: "#8a5a3c", belly: "#ff8a5c", wing: "#5e3a24", beak: "#ffcf6a", eye: "#100a06", trail: "#ff8a5c", shape: "round",  unlock: { kind: "score", n: 5 } },
  { id: "bluejay", name: "Blue Jay",   body: "#4a8ce8", belly: "#dbeaff", wing: "#2b5fae", beak: "#2a2a34", eye: "#0a0d18", trail: "#7cb6ff", shape: "crest",  unlock: { kind: "score", n: 15 } },
  { id: "parrot",  name: "Parrot",     body: "#2ee6a6", belly: "#eaffe0", wing: "#ffd76a", beak: "#ff5470", eye: "#0d1a12", trail: "#2ee6a6", shape: "crest",  unlock: { kind: "score", n: 30 } },
  { id: "raven",   name: "Raven",      body: "#2c2f42", belly: "#3d4158", wing: "#191b28", beak: "#8b90ac", eye: "#e8ecff", trail: "#6c7396", shape: "sleek",  unlock: { kind: "score", n: 50 } },
  { id: "flamingo",name: "Flamingo",   body: "#ff7aa8", belly: "#ffd8e6", wing: "#e8407c", beak: "#2a2a34", eye: "#160b12", trail: "#ff7aa8", shape: "sleek",  unlock: { kind: "zone", n: 3 } },
  { id: "owl",     name: "Snow Owl",   body: "#eef1ff", belly: "#ffffff", wing: "#c3ccea", beak: "#ffb347", eye: "#3a2a10", trail: "#dbe4ff", shape: "round",  unlock: { kind: "zone", n: 6 } },
  { id: "phoenix", name: "Phoenix",    body: "#ff5470", belly: "#ffd76a", wing: "#ff8f4a", beak: "#ffe9a8", eye: "#2a0a0a", trail: "#ff8f4a", shape: "crest",  glow: true, unlock: { kind: "zone", n: 5 } },
  { id: "cyber",   name: "Cyberwing",  body: "#22d3ee", belly: "#0d2b3a", wing: "#7c5cff", beak: "#c86bff", eye: "#eaffff", trail: "#22d3ee", shape: "sleek",  glow: true, unlock: { kind: "feathers", n: 120 } },
  { id: "gilded",  name: "Gilded",     body: "#ffd76a", belly: "#fff8dc", wing: "#c9971c", beak: "#8a6410", eye: "#2a1f04", trail: "#ffe9a8", shape: "crest",  glow: true, unlock: { kind: "feathers", n: 400 } },
  { id: "void",    name: "Void Wing",  body: "#3a1f5c", belly: "#c86bff", wing: "#1c1030", beak: "#ff4fd8", eye: "#ffd6ff", trail: "#c86bff", shape: "sleek",  glow: true, unlock: { kind: "score", n: 90 } },
  { id: "aurora",  name: "Aurora",     body: "#7cf0d0", belly: "#eafff8", wing: "#7c5cff", beak: "#ffd76a", eye: "#0b2a22", trail: "#7cf0d0", shape: "crest",  glow: true, unlock: { kind: "feathers", n: 900 } },
];

function unlockText(u) {
  if (!u) return "Always yours";
  if (u.kind === "score") return `Clear ${u.n} gates in one run`;
  if (u.kind === "zone") return `Reach ${ZONES[u.n].name}`;
  return `Collect ${u.n} feathers`;
}

export class FlappyBirdGame extends GameBase {
  // One setting — the zones carry the difficulty, exactly as they should.
  getDifficulties() { return ["Endless"]; }
  getInstructions() {
    return [
      "Tap, click or press Space to flap. One touch is the whole game.",
      "Fly through each gate for a point. Twelve gates and the world changes — eight zones, each with its own weather, obstacles and trouble.",
      "Golden feathers float between the gates. They buy nothing, they unlock: twelve bird skins open up through score, distance and feathers.",
      "Canyon and glacier winds push you around, coral and neon gates drift as you approach, and the storm zone flashes. One hit ends the run.",
      "Press Play to pick which zone to start from — every zone you reach stays open.",
    ];
  }
  getTouchLayout() { return "none"; }
  getTouchHint() { return "Tap anywhere on the board to flap."; }
  getKeyboardHint() { return "Space, W or Arrow Up to flap."; }
  getScene() { return "stars"; }

  // ------------------------------------------------------------- SAVE ----
  _store() {
    const custom = saveManager.ensureGame(this.id).custom;
    if (!custom.flight) {
      custom.flight = { feathers: 0, skin: "sunny", skins: { sunny: true }, bestZone: 0, bestScore: 0 };
    }
    const f = custom.flight;
    if (typeof f.feathers !== "number") f.feathers = 0;
    if (!f.skins) f.skins = { sunny: true };
    if (typeof f.bestZone !== "number") f.bestZone = 0;
    if (typeof f.bestScore !== "number") f.bestScore = 0;
    return f;
  }
  _save() { saveManager.saveNow(); }

  _isUnlocked(skin) {
    if (!skin.unlock) return true;
    const f = this._store();
    if (f.skins[skin.id]) return true;
    if (skin.unlock.kind === "score") return f.bestScore >= skin.unlock.n;
    if (skin.unlock.kind === "zone") return f.bestZone >= skin.unlock.n;
    return f.feathers >= skin.unlock.n;
  }

  /** Anything newly earned is written into the save so it stays unlocked. */
  _syncUnlocks() {
    const f = this._store();
    const gained = [];
    for (const s of SKINS) {
      if (f.skins[s.id]) continue;
      if (!this._isUnlocked(s)) continue;
      f.skins[s.id] = true;
      gained.push(s);
    }
    if (gained.length) this._save();
    return gained;
  }

  // ------------------------------------------------------------- MENUS ---
  getPlayLabel() { return "Play"; }

  /** Play opens the zone picker; every zone reached stays selectable. */
  onPlayPressed() {
    audioManager.play("click");
    const f = this._store();
    const grid = el("div", { class: "zone-grid" });
    ZONES.forEach((z, i) => {
      const open = i <= f.bestZone;
      grid.appendChild(el("button", {
        class: `zone-card${open ? "" : " locked"}${i === (this.startZone ?? 0) ? " current" : ""}`,
        disabled: !open,
        style: `--z1:${z.sky[0]};--z2:${z.sky[1]};--z3:${z.sky[2]}`,
        title: open ? `${z.name} — ${z.blurb}` : `Reach zone ${i + 1} in a run to open it.`,
        onClick: () => { closeModal(); this.startZone = i; this.start(); },
      }, [
        el("span", { class: "swatch" }),
        el("span", { class: "n" }, `Zone ${i + 1}`),
        // Locked zones still show their name and terrain: the picker doubles
        // as the world map, and a column of "Locked" tells you nothing.
        el("span", { class: "nm" }, z.name),
        el("span", { class: "st" }, open ? z.blurb : `Reach zone ${i + 1} in a run`),
      ]));
    });
    openModal({
      title: "Choose a zone",
      bodyNode: el("div", { class: "zone-picker" }, [
        el("p", { class: "zone-intro" },
          `The world changes every ${GATES_PER_ZONE} gates. Start from any zone you have reached — ${f.bestZone + 1} of ${ZONES.length} open.`),
        grid,
      ]),
      footerNode: el("div", { style: "display:flex;gap:10px;" }, [
        el("button", { class: "btn btn-ghost", onClick: () => { closeModal(); this.openSkins(); } }, "Skins"),
        el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Back"),
      ]),
    });
  }

  /** The skin wardrobe, reachable from the start screen and the zone picker. */
  openSkins() {
    audioManager.play("click");
    const f = this._store();
    this._syncUnlocks();
    const grid = el("div", { class: "skin-grid" });
    const render = () => {
      grid.innerHTML = "";
      for (const s of SKINS) {
        const open = this._isUnlocked(s);
        const card = el("button", {
          class: `skin-card${open ? "" : " locked"}${f.skin === s.id ? " active" : ""}`,
          disabled: !open,
          onClick: () => {
            if (!open) return;
            f.skin = s.id; f.skins[s.id] = true; this._save();
            audioManager.play("select");
            render();
          },
        }, [
          el("span", { class: "prev" }),
          // Locked cards still name the bird — the point of a wardrobe is
          // seeing what you are flying towards, not a wall of "Locked".
          el("span", { class: "nm" }, s.name),
          el("span", { class: "st" }, open ? (f.skin === s.id ? "Equipped" : "Tap to wear") : unlockText(s.unlock)),
        ]);
        // A live drawing of the bird rather than a colour chip.
        const c = el("canvas", { width: 184, height: 136 });
        c.style.cssText = "width:92px;height:68px";
        const cx = c.getContext("2d");
        cx.scale(2, 2);
        cx.translate(46, 34);
        this._paintBird(cx, s, 0, 0.58, open ? 1 : 0.6);
        if (!open) {
          // A dark wash over the locked bird keeps its shape readable while
          // still reading as "not yours yet".
          cx.globalCompositeOperation = "source-atop";
          cx.fillStyle = "rgba(8,10,22,0.42)";
          cx.fillRect(-46, -34, 92, 68);
        }
        card.querySelector(".prev").appendChild(c);
        grid.appendChild(card);
      }
    };
    render();
    openModal({
      title: `Skins — \u{1FAB6} ${formatNumber(f.feathers)} feathers`,
      bodyNode: el("div", { class: "skin-picker" }, [
        el("p", { class: "zone-intro" }, "Feathers drift between the gates. Skins unlock by score, by how far you fly, and by how many you pick up."),
        grid,
      ]),
      footerNode: el("button", { class: "btn btn-primary", onClick: () => closeModal() }, "Done"),
    });
  }

  // -------------------------------------------------------------- SETUP --
  onInit() {
    this.createCanvas();
    this.input.onTap(() => this._flap());
    this.input.onKey("Space", () => this._flap());
    this.input.onKey("ArrowUp", () => this._flap());
    this.input.onKey("KeyW", () => this._flap());
    this.startZone = 0;
    this._layers = null;
    this.k = 1;
  }

  // The stage keeps a fixed 3:4 aspect, so one factor derived from its height
  // scales the whole world. Without it a phone got the desktop's pixel gravity
  // and pixel gate spacing inside a canvas two thirds the size, which quietly
  // made the same zone far harder there than on a laptop.
  _worldScale() { return clamp((this.viewH || 700) / 700, 0.6, 1.3); }

  onResize() { this._layers = null; this.k = this._worldScale(); }

  onStart() {
    const f = this._store();
    this.skin = SKINS.find(s => s.id === f.skin) || SKINS[0];
    this.zoneIdx = clamp(this.startZone ?? 0, 0, ZONES.length - 1);
    this.zone = ZONES[this.zoneIdx];
    this._layers = null;

    this.gates = [];
    this.feathers = [];
    this.puffs = [];
    this.motes = [];
    this.k = this._worldScale();
    this.bird = { x: this.viewW * 0.28, y: this.viewH / 2, vy: 0, r: BIRD_R * this.k, rot: 0, flap: 0, wing: 0 };
    this.gatesPassed = 0;
    this.pickedFeathers = 0;
    this.scroll = 0;
    this.elapsed = 0;
    this.windPhase = randFloat(0, 6.3);
    this.flash = 0;
    this.zoneBanner = 2.2;
    this._spawnTimer = 0.9;
    this._dead = false;
    // The run does not actually begin until the first flap: the bird hovers
    // and no gate spawns. Without it the player lost half a second to
    // gravity before they had even registered that the game had started.
    this.launched = false;
    this.setScore(0);
    this._updateHud();
    this._seedMotes();
  }

  _updateHud() {
    this.setHud({
      Score: this.score,
      Zone: `${this.zoneIdx + 1}/${ZONES.length}`,
      Feathers: `\u{1FAB6} ${this.pickedFeathers}`,
      Best: this._store().bestScore,
    });
  }

  _flap() {
    if (this.state !== "playing" || this._dead) return;
    this.launched = true;
    this.bird.vy = FLAP_V * this.k;
    this.bird.flap = 1;
    audioManager.play("flap");
    // A puff of displaced air, which is what sells the flap.
    for (let i = 0; i < 4; i++) {
      this.puffs.push({
        x: this.bird.x - 8, y: this.bird.y + 6,
        vx: randFloat(-70, -20), vy: randFloat(-10, 40),
        r: randFloat(2, 5), t: 0, life: randFloat(0.25, 0.5),
      });
    }
  }

  // ------------------------------------------------------------- UPDATE --
  onUpdate(dt) {
    if (this._dead) return;
    this.elapsed += dt;
    if (this.zoneBanner > 0) this.zoneBanner -= dt;
    if (this.flash > 0) this.flash -= dt;

    const z = this.zone;
    const k = this.k;
    const speed = 190 * z.speed * k;
    const gap = (this.useTouch ? 178 : 168) * z.gap * k;
    const b = this.bird;

    // Before the first flap the world still drifts — it just cannot kill you.
    if (!this.launched) {
      this.scroll += speed * 0.35 * dt;
      b.y = this.viewH / 2 + Math.sin(this.elapsed * 3) * 9;
      b.vy = 0;
      b.rot = Math.sin(this.elapsed * 3) * 0.12;
      b.wing += dt * 9;
      this._stepMotes(dt);
      this._updateHud();
      return;
    }
    this.scroll += speed * dt;

    // --- bird ---------------------------------------------------------
    b.vy += GRAVITY * k * dt;
    // Canyon and glacier winds shove you off your line without ever being
    // instantly fatal — the gust is vertical and slow enough to correct.
    if (z.hazard === "wind") {
      this.windPhase += dt * 1.3;
      b.vy += Math.sin(this.windPhase) * 340 * k * dt;
    }
    b.y += b.vy * dt;
    b.rot = clamp(b.vy / (620 * k), -0.55, 1.25);
    if (b.flap > 0) b.flap = Math.max(0, b.flap - dt * 4);
    b.wing += dt * (10 + b.flap * 26);

    if (b.y - b.r < 4) { b.y = b.r + 4; b.vy = Math.max(b.vy, 0); }
    if (b.y + b.r > this.viewH - this._groundH()) return this._die();

    // --- gates --------------------------------------------------------
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = (GATE_SPACING * k * (1 + (1 - z.gap) * 0.35)) / speed;
      const margin = 54 * k;
      const usable = this.viewH - this._groundH() - margin * 2 - gap;
      const gapY = margin + Math.random() * Math.max(20, usable);
      this.gates.push({
        x: this.viewW + 40, gapY, gap, w: 62 * k, passed: false,
        // Drifting gates rise and fall on their own sine, so the opening you
        // aimed at is not the opening you arrive at.
        drift: z.hazard === "drift" ? randFloat(-1, 1) : 0,
        phase: randFloat(0, 6.3),
        seed: randInt(0, 9999),
      });
      // A feather sits in the gap often enough to be worth the detour.
      if (Math.random() < 0.55) {
        this.feathers.push({ x: this.viewW + 40 + 31 * k, y: gapY + gap / 2, t: 0, taken: false });
      }
    }

    for (const g of this.gates) {
      g.x -= speed * dt;
      if (g.drift) {
        const amp = 34 * k * Math.abs(g.drift);
        g.gapY = clamp(g.gapY + Math.sin(this.elapsed * 1.6 + g.phase) * amp * dt * g.drift,
                       40 * k, this.viewH - this._groundH() - g.gap - 40 * k);
      }
      if (!g.passed && g.x + g.w < b.x) {
        g.passed = true;
        this.addScore(1);
        this.gatesPassed++;
        audioManager.play("score");
        this._maybeAdvanceZone();
      }
      const inX = b.x + b.r * 0.82 > g.x && b.x - b.r * 0.82 < g.x + g.w;
      if (inX && (b.y - b.r * 0.86 < g.gapY || b.y + b.r * 0.86 > g.gapY + g.gap)) return this._die();
    }
    this.gates = this.gates.filter(g => g.x + g.w > -20);

    // --- feathers -----------------------------------------------------
    for (const ft of this.feathers) {
      ft.x -= speed * dt;
      ft.t += dt;
      if (ft.taken) continue;
      if (Math.hypot(ft.x - b.x, ft.y - b.y) < b.r + 12) {
        ft.taken = true;
        this.pickedFeathers++;
        this.addScore(2);
        audioManager.play("coin");
        for (let i = 0; i < 8; i++) {
          this.puffs.push({
            x: ft.x, y: ft.y, vx: randFloat(-90, 90), vy: randFloat(-90, 40),
            r: randFloat(1.5, 3.5), t: 0, life: randFloat(0.3, 0.6), gold: true,
          });
        }
      }
    }
    this.feathers = this.feathers.filter(f => f.x > -30 && !(f.taken && f.t > 0.3));

    // --- effects ------------------------------------------------------
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
      if (p.t >= p.life) this.puffs.splice(i, 1);
    }
    this._stepMotes(dt, speed);
    if (z.hazard === "lightning" && Math.random() < dt * 0.35) this.flash = 0.28;

    this._updateHud();
  }

  _groundH() { return this.zone.obstacle === "asteroid" ? 0 : Math.max(28, this.viewH * 0.075); }

  _maybeAdvanceZone() {
    if (this.gatesPassed % GATES_PER_ZONE !== 0) return;
    if (this.zoneIdx >= ZONES.length - 1) return;
    this.zoneIdx++;
    this.zone = ZONES[this.zoneIdx];
    this._layers = null;
    this._seedMotes();
    this.zoneBanner = 2.4;
    audioManager.play("levelup");
    const f = this._store();
    if (f.bestZone < this.zoneIdx) { f.bestZone = this.zoneIdx; this._save(); }
  }

  _die() {
    if (this._dead) return;
    this._dead = true;
    this.shake();
    audioManager.play("gameover");

    const f = this._store();
    f.feathers += this.pickedFeathers;
    if (f.bestScore < this.score) f.bestScore = this.score;
    if (f.bestZone < this.zoneIdx) f.bestZone = this.zoneIdx;
    this._save();
    const gained = this._syncUnlocks();
    // A long first run can clear several skin thresholds at once, so name them
    // all — being told about one of five reads like the rest never happened.
    const names = gained.map(s => s.name).join(", ");

    this.endGame({
      result: "loss", score: this.score,
      message: gained.length
        ? `${this.score} points through ${this.zone.name}. New skin${gained.length > 1 ? "s" : ""} unlocked: ${names}.`
        : `${this.score} points, ${this.gatesPassed} gates, as far as ${this.zone.name}.`,
      extraStats: [
        { label: "Gates", value: this.gatesPassed },
        { label: "Zone", value: `${this.zoneIdx + 1}/${ZONES.length}` },
        { label: "Feathers", value: `\u{1FAB6} ${this.pickedFeathers}` },
      ],
    });
  }

  // ---------------------------------------------------- ambient weather --
  _seedMotes() {
    this.motes = [];
    const n = { leaves: 22, dust: 34, bubbles: 26, rain: 90, embers: 40, snow: 70, city: 0, stars: 80 }[this.zone.weather] || 0;
    for (let i = 0; i < n; i++) this.motes.push(this._newMote(true));
  }

  _newMote(anywhere = false) {
    const w = this.zone.weather;
    const m = {
      x: anywhere ? Math.random() * this.viewW : this.viewW + 10,
      y: Math.random() * this.viewH,
      s: randFloat(0.4, 1),
      a: randFloat(0, 6.3),
      seed: Math.random(),
    };
    if (w === "rain") { m.vx = -520; m.vy = 900; }
    else if (w === "snow") { m.vx = -70; m.vy = 55; }
    else if (w === "bubbles") { m.vx = -40; m.vy = -70; m.y = anywhere ? m.y : this.viewH + 10; }
    else if (w === "embers") { m.vx = -50; m.vy = -110; m.y = anywhere ? m.y : this.viewH + 10; }
    else if (w === "dust") { m.vx = -260; m.vy = randFloat(-20, 20); }
    else if (w === "leaves") { m.vx = -120; m.vy = randFloat(10, 40); }
    else { m.vx = -18; m.vy = 0; }   // stars
    return m;
  }

  _stepMotes(dt) {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.x += m.vx * m.s * dt;
      m.y += m.vy * m.s * dt;
      m.a += dt * 2;
      if (m.x < -20 || m.y < -20 || m.y > this.viewH + 20) this.motes[i] = this._newMote();
    }
  }

  // ------------------------------------------------------------- RENDER --
  onRender(ctx, dt) {
    const W = this.viewW, H = this.viewH;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this._ensureLayers();
    this._drawSky(ctx, W, H);
    this._drawParallax(ctx, W, H);
    this._drawMotes(ctx);
    for (const g of this.gates) this._drawGate(ctx, g);
    for (const f of this.feathers) this._drawFeather(ctx, f);
    this._drawGround(ctx, W, H);
    this._drawPuffs(ctx);

    ctx.save();
    ctx.translate(this.bird.x, this.bird.y);
    ctx.rotate(this.bird.rot);
    this._paintBird(ctx, this.skin, this.bird.wing, this.k, 1);
    ctx.restore();

    // Storm flash over everything but the HUD text.
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(220,230,255,${(this.flash / 0.28) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.zoneBanner > 0) this._drawBanner(ctx, W);
    if (!this.launched && !this._dead) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(this.elapsed * 4) * 0.3;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 17px 'Sora', system-ui, sans-serif";
      ctx.fillText(this.useTouch ? "TAP TO FLY" : "PRESS SPACE TO FLY", W / 2, H * 0.66);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this.zone.sky[0]);
    g.addColorStop(0.55, this.zone.sky[1]);
    g.addColorStop(1, this.zone.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * Parallax layers are drawn once into wide offscreen tiles and blitted
   * twice each. Rebuilding the silhouettes every frame would be a few hundred
   * paths per frame for scenery that never changes.
   */
  _ensureLayers() {
    if (this._layers && this._layers.w === Math.ceil(this.viewW) && this._layers.zone === this.zoneIdx) return;
    const W = Math.max(2, Math.ceil(this.viewW)), H = Math.max(2, Math.ceil(this.viewH));
    const z = this.zone;
    const make = (color, build) => {
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = color;
      build(x, W, H);
      return c;
    };
    const style = z.obstacle;
    this._layers = {
      w: W, zone: this.zoneIdx,
      far: make(z.far, (x, w, h) => this._silhouette(x, w, h, style, 0.34, 7, 11)),
      mid: make(z.mid, (x, w, h) => this._silhouette(x, w, h, style, 0.24, 13, 23)),
      near: make(z.near, (x, w, h) => this._silhouette(x, w, h, style, 0.15, 29, 37)),
    };
  }

  /** One band of background scenery, shaped to match the zone's obstacles. */
  _silhouette(x, w, h, style, heightFrac, seedA, seedB) {
    const base = h - this._groundH();
    const rnd = (i) => {
      const v = Math.sin(i * seedA * 12.9898 + seedB * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    x.beginPath();
    x.moveTo(0, base);
    if (style === "tower") {
      // City skyline: flat-topped blocks of varying height.
      let px = 0, i = 0;
      while (px < w) {
        const bw = 26 + rnd(i) * 44;
        const bh = h * heightFrac * (0.45 + rnd(i + 100) * 0.9);
        x.lineTo(px, base - bh);
        x.lineTo(px + bw, base - bh);
        px += bw; i++;
      }
    } else if (style === "asteroid") {
      // No horizon in orbit — a scatter of rocks instead of a ridge.
      x.closePath();
      for (let i = 0; i < 26; i++) {
        const cx = rnd(i) * w, cy = rnd(i + 50) * h, r = 4 + rnd(i + 90) * 16 * (heightFrac * 3);
        x.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = r * (0.7 + rnd(i * 7 + k) * 0.6);
          x[k ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        x.closePath();
        x.fill();
      }
      return;
    } else {
      // Ridgeline: peaks whose sharpness follows the obstacle style.
      const step = style === "ice" ? 46 : style === "rock" ? 64 : 78;
      const sharp = style === "ice" || style === "rock" || style === "basalt";
      for (let px = 0, i = 0; px <= w + step; px += step, i++) {
        const peak = base - h * heightFrac * (0.4 + rnd(i) * 1.0);
        if (sharp) {
          x.lineTo(px + step * 0.5, peak);
          x.lineTo(px + step, base - h * heightFrac * 0.25);
        } else {
          x.quadraticCurveTo(px + step * 0.5, peak, px + step, base - h * heightFrac * (0.3 + rnd(i + 7) * 0.4));
        }
      }
    }
    x.lineTo(w, base);
    x.lineTo(w, h);
    x.lineTo(0, h);
    x.closePath();
    x.fill();
  }

  _drawParallax(ctx, W, H) {
    const L = this._layers;
    if (!L) return;
    const blit = (img, rate, alpha) => {
      const off = -((this.scroll * rate) % W);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, off, 0);
      ctx.drawImage(img, off + W, 0);
      ctx.restore();
    };
    blit(L.far, 0.08, 0.55);
    blit(L.mid, 0.17, 0.75);
    blit(L.near, 0.32, 0.95);
  }

  _drawMotes(ctx) {
    const w = this.zone.weather;
    ctx.save();
    for (const m of this.motes) {
      if (w === "rain") {
        ctx.strokeStyle = "rgba(190,210,255,0.45)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + 5, m.y - 13); ctx.stroke();
      } else if (w === "snow") {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath(); ctx.arc(m.x + Math.sin(m.a) * 6, m.y, 1.6 * m.s + 0.6, 0, 6.3); ctx.fill();
      } else if (w === "bubbles") {
        ctx.strokeStyle = "rgba(220,250,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(m.x + Math.sin(m.a) * 8, m.y, 2.5 * m.s + 1.2, 0, 6.3); ctx.stroke();
      } else if (w === "embers") {
        ctx.fillStyle = `rgba(255,${140 + Math.floor(m.seed * 90)},60,0.85)`;
        ctx.beginPath(); ctx.arc(m.x + Math.sin(m.a) * 5, m.y, 1.4 * m.s + 0.7, 0, 6.3); ctx.fill();
      } else if (w === "dust") {
        ctx.fillStyle = "rgba(240,200,150,0.28)";
        ctx.fillRect(m.x, m.y, 12 * m.s, 1.4);
      } else if (w === "leaves") {
        ctx.save();
        ctx.translate(m.x, m.y + Math.sin(m.a) * 10);
        ctx.rotate(m.a);
        ctx.fillStyle = m.seed > 0.5 ? "rgba(150,200,120,0.8)" : "rgba(220,190,110,0.8)";
        ctx.beginPath(); ctx.ellipse(0, 0, 4.5 * m.s, 2.2 * m.s, 0, 0, 6.3); ctx.fill();
        ctx.restore();
      } else if (w === "stars") {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + m.seed * 0.6})`;
        ctx.fillRect(m.x, m.y, 1.6 * m.s + 0.5, 1.6 * m.s + 0.5);
      }
    }
    ctx.restore();
  }

  /** Each zone's obstacle is a different object, not a recoloured pipe. */
  _drawGate(ctx, g) {
    const z = this.zone;
    const top = g.gapY, bottom = g.gapY + g.gap;
    const floor = this.viewH - this._groundH();
    const style = z.obstacle;

    const column = (y0, y1, isTop) => {
      const h = y1 - y0;
      if (h <= 0) return;
      ctx.save();
      const grad = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
      grad.addColorStop(0, z.obEdge);
      grad.addColorStop(0.3, z.obColor);
      grad.addColorStop(0.72, z.obColor);
      grad.addColorStop(1, z.obEdge);

      if (style === "coral") {
        // Lumpy, organic edges.
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(g.x, y0);
        for (let y = y0; y <= y1; y += 14) {
          const bulge = Math.sin((y + g.seed) * 0.14) * 5;
          ctx.lineTo(g.x - bulge, y);
        }
        ctx.lineTo(g.x + g.w, y1);
        for (let y = y1; y >= y0; y -= 14) {
          const bulge = Math.sin((y + g.seed * 1.7) * 0.12) * 5;
          ctx.lineTo(g.x + g.w + bulge, y);
        }
        ctx.closePath();
        ctx.fill();
      } else if (style === "asteroid") {
        // Chunks stacked into a column rather than a solid bar.
        ctx.fillStyle = grad;
        for (let y = y0; y < y1; y += 34) {
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const rr = (g.w * 0.5) * (0.72 + ((Math.sin((y + k * 31 + g.seed) * 1.3) + 1) / 2) * 0.5);
            ctx[k ? "lineTo" : "moveTo"](g.x + g.w / 2 + Math.cos(a) * rr, y + 17 + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        }
      } else if (style === "ice") {
        // A spike pointing into the gap.
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (isTop) {
          ctx.moveTo(g.x, y0); ctx.lineTo(g.x + g.w, y0);
          ctx.lineTo(g.x + g.w * 0.72, y1); ctx.lineTo(g.x + g.w / 2, y1 + 16);
          ctx.lineTo(g.x + g.w * 0.28, y1);
        } else {
          ctx.moveTo(g.x + g.w / 2, y0 - 16); ctx.lineTo(g.x + g.w * 0.72, y0);
          ctx.lineTo(g.x + g.w, y1); ctx.lineTo(g.x, y1); ctx.lineTo(g.x + g.w * 0.28, y0);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(g.x + g.w * 0.22, y0, g.w * 0.14, h);
      } else {
        ctx.fillStyle = grad;
        roundRect(ctx, g.x, y0, g.w, h, style === "pipe" ? 7 : 3);
        ctx.fill();
      }

      // Surface texture: the thing that stops a column reading as a flat bar.
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.x - 8, y0, g.w + 16, h);
      ctx.clip();
      if (style === "rock" || style === "basalt") {
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1.5;
        for (let y = y0 + 12; y < y1; y += 18) {
          ctx.beginPath();
          ctx.moveTo(g.x + 2, y);
          ctx.lineTo(g.x + g.w - 2, y + (style === "basalt" ? 0 : Math.sin(y) * 3));
          ctx.stroke();
        }
        if (style === "basalt") {
          ctx.strokeStyle = "rgba(0,0,0,0.22)";
          for (const fx of [0.33, 0.66]) {
            ctx.beginPath();
            ctx.moveTo(g.x + g.w * fx, y0); ctx.lineTo(g.x + g.w * fx, y1); ctx.stroke();
          }
        }
      } else if (style === "pipe") {
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillRect(g.x + g.w * 0.16, y0, g.w * 0.13, h);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(g.x + g.w * 0.7, y0, g.w * 0.2, h);
      } else if (style === "pylon") {
        // Lattice work, so the storm zone reads as steel.
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1.4;
        for (let y = y0; y < y1; y += 22) {
          ctx.beginPath();
          ctx.moveTo(g.x + 3, y); ctx.lineTo(g.x + g.w - 3, y + 22);
          ctx.moveTo(g.x + g.w - 3, y); ctx.lineTo(g.x + 3, y + 22);
          ctx.stroke();
        }
      } else if (style === "tower") {
        // Lit windows.
        for (let y = y0 + 10; y < y1 - 6; y += 18) {
          for (let k = 0; k < 3; k++) {
            const lit = ((Math.sin((y * 3 + k * 71 + g.seed) * 1.7) + 1) / 2) > 0.45;
            ctx.fillStyle = lit ? "rgba(255,214,120,0.85)" : "rgba(255,255,255,0.07)";
            ctx.fillRect(g.x + 9 + k * 16, y, 9, 10);
          }
        }
      } else if (style === "coral") {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        for (let y = y0 + 8; y < y1; y += 26) {
          ctx.beginPath(); ctx.arc(g.x + g.w * 0.3, y, 3.5, 0, 6.3); ctx.fill();
          ctx.beginPath(); ctx.arc(g.x + g.w * 0.68, y + 13, 2.5, 0, 6.3); ctx.fill();
        }
      }
      ctx.restore();
      ctx.restore();
    };

    column(-30, top, true);
    column(bottom, floor + 30, false);

    // Gap rims — the read that matters most, so they get the accent colour
    // and a light so the opening is unmistakable at speed.
    if (style !== "asteroid" && style !== "ice") {
      const rimH = 16;
      for (const [y, up] of [[top - rimH, true], [bottom, false]]) {
        const gr = ctx.createLinearGradient(0, y, 0, y + rimH);
        gr.addColorStop(0, up ? z.obColor : z.obEdge);
        gr.addColorStop(1, up ? z.obEdge : z.obColor);
        ctx.fillStyle = gr;
        roundRect(ctx, g.x - 5, y, g.w + 10, rimH, 5);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillRect(g.x - 3, y + (up ? 1.5 : rimH - 3), g.w + 6, 1.5);
      }
    }
  }

  _drawFeather(ctx, f) {
    if (f.taken) return;
    const bob = Math.sin(f.t * 4) * 5;
    ctx.save();
    ctx.translate(f.x, f.y + bob);
    ctx.rotate(Math.sin(f.t * 2.2) * 0.35);
    this.gfx.glow(ctx, 0, 0, 16, "#ffd76a", 0.7);
    const g = ctx.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, "#fff3c4");
    g.addColorStop(0.5, "#ffd76a");
    g.addColorStop(1, "#c9971c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(7, -2, 0, 12);
    ctx.quadraticCurveTo(-7, -2, 0, -12);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,80,10,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
    ctx.restore();
  }

  _drawPuffs(ctx) {
    for (const p of this.puffs) {
      const k = 1 - p.t / p.life;
      ctx.save();
      ctx.globalAlpha = k * 0.7;
      ctx.fillStyle = p.gold ? "#ffd76a" : "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + k), 0, 6.3); ctx.fill();
      ctx.restore();
    }
  }

  _drawGround(ctx, W, H) {
    const gh = this._groundH();
    if (gh <= 0) return;
    const y = H - gh;
    const z = this.zone;
    // Body: the zone colour darkening downwards. It used to fade into 60%
    // black, which turned every biome's floor into the same near-black slab.
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, z.ground);
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, W, gh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, W, gh);
    ctx.clip();
    const off = -(this.scroll * 0.9) % 34;

    // A scalloped cap in the zone's near colour: grass tufts, dune crests,
    // a coral bed — whatever the biome reads as, it moves with the world.
    ctx.fillStyle = z.near;
    ctx.beginPath();
    ctx.moveTo(-40, y + 9);
    for (let x = -40; x < W + 40; x += 17) {
      ctx.quadraticCurveTo(x + 8.5 + off % 17, y + 1, x + 17, y + 9);
    }
    ctx.lineTo(W + 40, H); ctx.lineTo(-40, H);
    ctx.closePath();
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Highlight along the lip, then soft scrolling banding underneath.
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 1); ctx.lineTo(W, y + 1);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let x = off; x < W; x += 34) ctx.fillRect(x, y + 12, 15, gh);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = off + 17; x < W; x += 34) ctx.fillRect(x, y + 12, 9, gh);
    ctx.restore();
  }

  _drawBanner(ctx, W) {
    const k = Math.min(1, this.zoneBanner / 0.5);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(6,8,18,0.55)";
    roundRect(ctx, W / 2 - 150, 16, 300, 48, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 18px 'Sora', system-ui, sans-serif";
    ctx.fillText(`ZONE ${this.zoneIdx + 1} — ${this.zone.name.toUpperCase()}`, W / 2, 40);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "600 12px 'Inter', system-ui, sans-serif";
    ctx.fillText(this.zone.blurb, W / 2, 57);
    ctx.restore();
  }

  /**
   * The bird itself, drawn from the skin palette. Shared with the wardrobe
   * previews, which is why it takes a context and not `this.ctx`.
   * @param {number} wing  animation phase
   * @param {number} scale relative size
   */
  _paintBird(ctx, skin, wing, scale = 1, alpha = 1) {
    const r = BIRD_R * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (skin.glow) this.gfx?.glow?.(ctx, 0, 0, r * 2.4, skin.trail, 0.55);

    // Tail
    ctx.fillStyle = skin.wing;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, 0);
    ctx.lineTo(-r * 1.7, -r * 0.5);
    ctx.lineTo(-r * 1.45, 0);
    ctx.lineTo(-r * 1.7, r * 0.5);
    ctx.closePath();
    ctx.fill();

    // Body
    const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.15);
    bg.addColorStop(0, skin.belly);
    bg.addColorStop(0.42, skin.body);
    bg.addColorStop(1, skin.wing);
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (skin.shape === "sleek") ctx.ellipse(0, 0, r * 1.18, r * 0.86, 0, 0, 6.3);
    else ctx.ellipse(0, 0, r * 1.02, r * 0.98, 0, 0, 6.3);
    ctx.fill();

    // Belly patch
    ctx.fillStyle = skin.belly;
    ctx.globalAlpha = alpha * 0.75;
    ctx.beginPath();
    ctx.ellipse(r * 0.05, r * 0.3, r * 0.62, r * 0.44, 0, 0, 6.3);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // Crest, for the skins that have one
    if (skin.shape === "crest") {
      ctx.fillStyle = skin.wing;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, -r * 0.85);
      ctx.lineTo(r * 0.15, -r * 1.6);
      ctx.lineTo(r * 0.42, -r * 0.75);
      ctx.closePath();
      ctx.fill();
    }

    // Wing: a real up-and-down beat rather than a wobbling blob.
    const beat = Math.sin(wing);
    ctx.save();
    ctx.translate(-r * 0.12, -r * 0.05);
    ctx.rotate(beat * 0.85);
    const wg = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
    wg.addColorStop(0, skin.body);
    wg.addColorStop(1, skin.wing);
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.75, -r * 1.15, r * 0.42);
    ctx.quadraticCurveTo(-r * 0.7, r * 0.1, 0, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();
    ctx.restore();

    // Beak
    ctx.fillStyle = skin.beak;
    ctx.beginPath();
    ctx.moveTo(r * 0.82, -r * 0.16);
    ctx.lineTo(r * 1.62, r * 0.02);
    ctx.lineTo(r * 0.82, r * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.moveTo(r * 0.82, r * 0.05);
    ctx.lineTo(r * 1.5, r * 0.05);
    ctx.lineTo(r * 0.82, r * 0.26);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.34, r * 0.27, 0, 6.3); ctx.fill();
    ctx.fillStyle = skin.eye;
    ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.34, r * 0.14, 0, 6.3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.4, r * 0.05, 0, 6.3); ctx.fill();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default FlappyBirdGame;
