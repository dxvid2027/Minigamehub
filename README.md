# 🎮 MegaPlay Hub

A premium browser gaming platform — **30 polished mini games**, a full progression
system, 150+ achievements, daily challenges, profiles, statistics and unlockables.
Written in **vanilla JavaScript (ES modules)** with **zero runtime dependencies**,
no build step and no external services: everything runs locally and offline.

---

## ✨ Highlights

| Area | What you get |
|---|---|
| **Games** | 30 complete games — arcade, puzzle, board, action, sports and skill |
| **Framework** | Every game inherits start/pause/win/lose screens, HUD, difficulty levels, high scores, statistics, sound and touch controls from a shared `GameBase` class |
| **Progression** | XP, levels, coins, achievement points, unlockable themes and avatars |
| **Achievements** | 154 achievements with live progress tracking and rewards |
| **Daily challenges** | 3 rotating challenges per day (deterministic, seeded by date) + streaks |
| **Save system** | Robust `localStorage` save with schema-merge migration, export/import, autosave |
| **Audio** | Fully procedural Web Audio SFX + ambient music with master/music/SFX volume |
| **Design** | Dark-by-default glassmorphism UI, animated particle background, 5 themes |
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

**Original additions (10)**

2048 · Simon Says · Reaction Test · Color Match (Stroop) · Bubble Shooter ·
Air Hockey · Typing Rush · Maze Runner · Stack Tower · Word Scramble

Every game ships with a tutorial/instructions screen, difficulty levels, pause
menu, restart, win/lose screens, high scores, statistics, achievements, sound
effects and adaptive touch controls.

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
    achievementSystem.js   # evaluates 154 achievements, grants rewards
    dailyChallenge.js      # date-seeded challenges, progress, streaks
    statsManager.js        # derived cross-game statistics
    audioManager.js        # procedural Web Audio SFX + ambient music
    particleSystem.js      # reusable VFX engine + animated background
    inputManager.js        # keyboard / pointer / swipe / virtual controls
    settingsManager.js     # applies theme + accessibility settings
  ui/
    navigation.js          # sidebar, bottom nav, wallet chips, search
    gameCard.js            # shared grid/list game card
    toast.js  modal.js     # notifications and dialogs
    pages/                 # home, library, profile, achievements,
                           # statistics, settings, play
  games/
    gameBase.js            # the framework every game extends
    canvasUtils.js         # shared canvas drawing helpers
    <30 game modules>      # one self-contained module per game

data/
  games.js                 # game registry (metadata + lazy module paths)
  achievements.js          # 154 achievement definitions
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
