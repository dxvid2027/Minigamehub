# 🎮 MegaPlay Hub

A premium browser gaming platform — **38 polished games, seven of them real-time 3D
(WebGL)** — with a full progression system, 174 achievements, daily challenges,
profiles, statistics and unlockables.
Written in **vanilla JavaScript (ES modules)** with **zero runtime dependencies**,
no build step and no external services: everything runs locally and offline.

---

## ✨ Highlights

| Area | What you get |
|---|---|
| **Games** | 38 complete games — arcade, puzzle, board, action, sports, skill and seven 3D titles |
| **3D** | A dependency-free WebGL renderer (`js/games/engine3d.js`): lit shading, fog, procedural textures, blob shadows, free CSS sky backdrops |
| **Framework** | Every game inherits start/pause/win/lose screens, a HUD with an in-game **How to play** panel, difficulty levels, high scores, statistics, sound and touch controls from a shared `GameBase` class |
| **Progression** | XP, levels, coins, achievement points, unlockable themes and avatars |
| **Achievements** | 186 achievements with live progress tracking and rewards |
| **Daily challenges** | 3 rotating challenges per day (deterministic, seeded by date) + streaks |
| **Save system** | Robust `localStorage` save with schema-merge migration, export/import, autosave |
| **Audio** | Fully procedural Web Audio SFX + ambient music with master/music/SFX volume |
| **Design** | Self-hosted Inter + Sora, layered glass surfaces, film-grain texture, procedural cover art for every game, 5 themes |
| **Performance** | 60 fps across all games; expensive effects (backdrop blur, blend passes, glow) are budgeted, and the graphics kit auto-downgrades on slow devices |
| **Accessibility** | Colorblind modes, high contrast, reduced motion, UI scaling, keyboard nav |
| **Devices** | Desktop, laptop, iPad, Android tablets and phones — controls adapt automatically |
| **Installable** | Web app manifest + service worker: add it to your home screen and it launches full-screen with its own icon and plays offline |

---

## 🚀 Run it locally

The app uses native ES modules, so it must be served over HTTP (opening
`index.html` via `file://` will block dynamic imports).

```bash
# any static server works — for example:
npm start                     # → http://localhost:8080
# or
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

---

## ☁️ Deploy to Cloudflare Workers

The site deploys as an **assets-only Worker** using
[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) —
no server-side code, no bundler.

```bash
npm install          # installs wrangler (dev dependency only)
npx wrangler login   # one-time Cloudflare auth

npm run deploy       # builds ./dist and deploys
```

Your site goes live at `https://megaplay-hub.<your-subdomain>.workers.dev`.

Useful commands:

```bash
npm run build        # copy the site into ./dist (what gets uploaded)
npm run dev          # local preview on the real Workers runtime
npm run tail         # stream production logs
```

**How the deployment is wired up** (`wrangler.jsonc`):

- `assets.directory: "./dist"` — `scripts/build.mjs` copies only `index.html`,
  `css/`, `js/`, `data/` and `assets/` there, so repo internals (`.git`,
  `node_modules`, configs) can never be uploaded.
- `not_found_handling: "single-page-application"` — the hash router means every
  deep link resolves through `index.html`.
- Change the deployed name by editing `name` in `wrangler.jsonc`.
- To use a custom domain, add a `routes` entry, e.g.
  `"routes": [{ "pattern": "play.example.com", "custom_domain": true }]`.

Because everything is static, the platform is equally deployable to Cloudflare
Pages, Netlify, GitHub Pages or any static host — just serve the repo root
(or `dist/`).

---

## 📱 Install it on a phone or tablet

MegaPlay Hub is a full PWA, so it can live on the home screen like a native app:

- **iOS / iPadOS** — open the site in Safari → *Share* → **Add to Home Screen**.
- **Android / Chrome** — open the site → menu → **Install app** (or *Add to
  Home screen*).
- **Desktop Chrome/Edge** — click the install icon in the address bar.

You get the MegaPlay Hub icon, a full-screen standalone window (no browser
chrome), long-press shortcuts to Library / Achievements / Statistics, and — via
`sw.js` — offline play: navigations are network-first so new deploys land
immediately, while everything else is served cache-first and refreshed in the
background.

Icons are generated from a single master artwork into two variants: full-bleed
for iOS (which applies its own squircle mask) and safe-zone padded for Android
adaptive icons — see [`assets/icons/README.md`](assets/icons/README.md).

> Installability requires HTTPS (or `localhost`). Once deployed to Workers,
> both are satisfied automatically.

---

## 🕹️ The games

**Required classics (20)**

Snake · Tetris Blocks · Pong Duel · Flappy Wings · Breakout Arena · Nova Strike
(space shooter) · Neon Runner · Bastion TD (tower defense) · Memory Match ·
Whack-a-Mole · Tic Tac Toe · Connect Four · Minesweeper · Sudoku Master · Chess ·
Checkers · Pixel Quest (platformer) · Turbo Rush (racing) · Hoop Shot
(basketball) · Fruit Slice

**Original additions (11)**

2048 · Simon Says · Reaction Test · Color Match (Stroop) · Bubble Shooter ·
Air Hockey · Typing Rush · Maze Runner · Stack Tower · Word Scramble ·
Fruit Merge (drop fruit into a box; two of a kind fuse up a ten-tier ladder,
and only the first four ever fall from the chute)

**3D games (7, WebGL)**

Turbo Circuit 3D (third-person racer on a curving, cresting circuit) ·
Cube Runner 3D (three-lane endless runner with jump and slide) ·
Sky Rider 3D (glider flight through a canyon of light rings) ·
Tower Blocks 3D (stack sliding blocks; overhang is sliced off) ·
Asteroid Belt 3D (space shooter with travel-time projectiles and splitting rocks) ·
Sky Parkour 3D (endless obstacle course over floating platforms — gaps, spinners,
pushers, bouncers and a double jump) ·
Storm Arena 3D (third-person arena shooter: drone waves, buildable cover, a
closing storm ring)

They run on a small renderer written for this project — mat4/vec3 maths, one
lit shader with directional + hemisphere light and fog, primitive mesh
builders, canvas-generated textures (asphalt, brushed metal, rock, neon grid)
and blob shadows. No 3D library, nothing downloaded at runtime. If a device
has no WebGL, the game shows a clear notice instead of failing.

Every game ships with a tutorial/instructions screen, difficulty levels, pause
menu, restart, win/lose screens, high scores, statistics, achievements, sound
effects and adaptive touch controls.

**Bastion TD** deserves its own line: three tower classes (single-target Cannon,
area-slowing Frost, chaining Arc), ten upgrade levels each, and six enemy
families — marchers, sprinters, armoured brutes, drones that fly straight over
the road, menders that heal their neighbours and bulwarks behind a regenerating
shield — plus a Titan every fifth wave that bursts into a squad when it dies.

Highlights worth calling out: **Chess** implements full legal-move generation
including castling, en passant, promotion, check/checkmate/stalemate plus an
alpha-beta AI; **Connect Four** uses depth-limited minimax with alpha-beta
pruning; **Checkers** enforces mandatory captures and jump chains; **Sudoku**
generates fresh puzzles via backtracking; **Maze Runner** generates mazes with a
recursive-backtracker.

---

## 📁 Project structure

```
index.html                 # SPA shell (sidebar, topbar, page outlet, overlays)
manifest.webmanifest       # PWA manifest (icons, shortcuts, standalone mode)
sw.js                      # service worker: offline play + install support
wrangler.jsonc             # Cloudflare Workers config (static assets)
scripts/build.mjs          # copies the deployable site into ./dist

css/
  fonts.css                # self-hosted Inter + Sora variable fonts
  variables.css            # design tokens, themes, accessibility overrides
  base.css                 # reset, layout primitives, focus handling
  components.css           # nav, cards, buttons, modals, toasts, forms
  pages.css                # per-page layouts + in-game HUD/overlays
  games.css                # DOM-based game boards (chess, sudoku, 2048, …)
  animations.css           # keyframes, transitions, effect utilities

js/
  core/
    app.js                 # bootstrap: systems, routes, background FX
    router.js              # hash router with params + query
    eventBus.js            # pub/sub used to decouple systems
    utils.js               # formatting, RNG, DOM helper, seeded RNG
  systems/
    saveManager.js         # single localStorage save file + migrations
    progression.js         # XP curve, levels, coins, level rewards
    achievementSystem.js   # evaluates 186 achievements, grants rewards
    dailyChallenge.js      # date-seeded challenges, progress, streaks
    statsManager.js        # derived cross-game statistics
    audioManager.js        # procedural Web Audio SFX + ambient music
    particleSystem.js      # reusable VFX engine + animated background
    inputManager.js        # keyboard / pointer / swipe / virtual controls
    settingsManager.js     # applies theme + accessibility settings
  ui/
    navigation.js          # sidebar, bottom nav, wallet chips, search
    icons.js               # inline SVG icon set (24px grid, currentColor)
    gameArt.js             # procedural, seeded SVG cover art per game
    gameCard.js            # shared grid/list game card
    toast.js  modal.js     # notifications and dialogs
    pages/                 # home, library, profile, achievements,
                           # statistics, settings, play
  games/
    gameBase.js            # the framework every game extends
    game3dBase.js          # WebGL bridge: same framework, 3D renderer
    engine3d.js            # the WebGL renderer (maths, shader, meshes, textures)
    gfx.js                 # in-game graphics kit: backdrops, lighting, glow
    color.js               # shared colour parser (hex / rgb() / hsl())
    canvasUtils.js         # shared canvas drawing helpers
    <38 game modules>      # one self-contained module per game

data/
  games.js                 # game registry (metadata + lazy module paths)
  achievements.js          # 186 achievement definitions
  dailyChallenges.js       # daily challenge template pool

assets/                    # audio / images / icons (all generated at runtime)
```

### Architecture notes

- **Lazy loading** — a game module is only fetched when you open it
  (`import(meta.module)` from the play page), keeping first paint fast.
- **One save file** — every system reads and writes through `saveManager`, so
  statistics, achievements and progression can never drift out of sync.
- **Frame-budget discipline** — `GameBase` owns a single rAF loop per game with
  a clamped delta time, auto-pauses on tab blur, disposes listeners/observers on
  route change, and caps particle counts to avoid leaks in long sessions.
- **Cheap pixels** — backdrops are rendered once into an offscreen canvas and
  blitted; gradients are cached and painted in translated space; glows are
  pre-rendered sprites blitted additively rather than `shadowBlur`. A rolling
  frame monitor drops glow and grain automatically if a device falls behind.
  In 3D the sky is a CSS gradient behind a transparent colour buffer, so the
  horizon costs no fill rate at all.
- **Physical boards** — the DOM games are styled as real objects: raised and
  pressed minesweeper cells, glossy Connect Four discs that drop, sculpted
  chess pieces on a high-contrast board, a whack-a-mole pit with soil texture.
  Every board keeps its own aspect ratio and is centred in its stage, so
  nothing stretches or overflows on any screen.
- **One visual language** — the same palette drives a game's cover art, its
  in-game lighting and its card, because all three read `grad` from the registry.
- **Navigation is race-proof** — every navigation carries a token, so a slow
  page import can never render over a newer page (which used to wipe a game
  that had just mounted).
- **Balance is measured, not assumed** — bot-driven tests play Pong and Air
  Hockey with human-like reaction, speed and aim error to confirm the AI is
  beatable on Easy/Normal and a real fight on Hard, and that matches always
  end rather than stalling into endless rallies.
- **Device-adaptive input** — `InputController` exposes keyboard state, pointer,
  swipe gestures and virtual D-pad/buttons behind one API; a game declares
  `getTouchLayout()` and the framework injects the right on-screen controls.

---

## 🎨 Themes & unlocks

Level up to unlock avatars and themes (Crimson at level 5, Emerald at 10, Royal
Violet at 20). Themes, colorblind modes, contrast, motion and UI scale all live
in **Settings**, and everything is persisted immediately.

## 💾 Save data

All progress is stored in `localStorage` under `megaplayhub_save_v1` and can be
exported/imported as JSON from **Settings → Save Data**. Nothing is ever sent to
a server.

---

## 📄 License

MIT
