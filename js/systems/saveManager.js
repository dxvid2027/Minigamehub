// ==========================================================================
// SaveManager — single source of truth persisted to localStorage.
// Everything else (progression, stats, achievements, settings) reads and
// writes through this module so the whole app has one consistent save file.
// ==========================================================================
import { eventBus } from "../core/eventBus.js";
import { uid, debounce } from "../core/utils.js";

const STORAGE_KEY = "megaplayhub_save_v1";
const SAVE_VERSION = 1;

const AVATAR_EMOJIS = ["🎮", "👾", "🕹️", "🚀", "🐉", "🦊", "🐺", "🦉", "🎯", "⚡", "🔥", "🌟", "🤖", "👑", "🎲"];

function defaultSave() {
  return {
    version: SAVE_VERSION,
    profile: {
      id: uid("player"),
      username: "Player" + Math.floor(Math.random() * 9000 + 1000),
      avatarEmoji: "🎮",
      createdAt: Date.now(),
      level: 1,
      xp: 0,
      coins: 250,
      achievementPoints: 0,
      unlockedThemes: ["dark"],
      unlockedAvatars: ["🎮"],
      activeTheme: "dark",
      titleBadge: null,
      unlockedBadges: [],
    },
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.5,
      sfxVolume: 0.85,
      muted: false,
      theme: "dark",
      colorblindMode: "none",
      reducedMotion: false,
      highContrast: false,
      uiScale: 1,
      showTutorials: true,
      screenShake: true,
      particles: true,
      difficulty: "normal",
      keyboardNav: true,
      // "auto" follows the device, but a player on a laptop with a
      // touchscreen, or on a tablet with a keyboard, gets it wrong — so
      // the choice is theirs to override and it sticks.
      inputMode: "auto",   // "auto" | "keyboard" | "touch"
    },
    games: {}, // gameId -> { highScore, plays, wins, losses, timePlayed, lastPlayed, bestTimeMs, completed, custom:{} }
    achievements: { unlocked: {}, progress: {} },
    favorites: [],
    recentlyPlayed: [],
    dailyChallenge: { dateKey: null, challenges: [], claimedToday: false, streak: 0, lastCompletedKey: null },
    meta: { firstPlayTs: Date.now(), totalSessions: 1, lastActiveKey: null, firstSeen: {} },
  };
}

function deepMerge(base, incoming) {
  if (typeof incoming !== "object" || incoming === null) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const key of Object.keys(base)) {
    if (incoming[key] === undefined) continue;
    if (typeof base[key] === "object" && base[key] !== null && !Array.isArray(base[key]) && typeof incoming[key] === "object") {
      out[key] = deepMerge(base[key], incoming[key]);
    } else {
      out[key] = incoming[key];
    }
  }
  // keep any extra keys that already exist (e.g. per-game custom data)
  for (const key of Object.keys(incoming)) {
    if (!(key in base)) out[key] = incoming[key];
  }
  return out;
}

class SaveManager {
  constructor() {
    this.data = defaultSave();
    this._persistDebounced = debounce(() => this._persist(), 250);
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = deepMerge(defaultSave(), parsed);
      } else {
        this.data = defaultSave();
      }
    } catch (err) {
      console.warn("[SaveManager] failed to load save, starting fresh", err);
      this.data = defaultSave();
    }
    this.data.meta.totalSessions = (this.data.meta.totalSessions || 0) + 1;
    this._persist();
    return this.data;
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.error("[SaveManager] persist failed (storage full/blocked)", err);
      eventBus.emit("save:error", err);
    }
  }

  save() { this._persistDebounced(); eventBus.emit("save:changed", this.data); }
  saveNow() { this._persist(); eventBus.emit("save:changed", this.data); }

  get(path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), this.data);
  }

  set(path, value) {
    const keys = path.split(".");
    let obj = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] == null) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  ensureGame(gameId) {
    if (!this.data.games[gameId]) {
      this.data.games[gameId] = {
        highScore: 0, plays: 0, wins: 0, losses: 0, draws: 0,
        timePlayed: 0, lastPlayed: null, bestTimeMs: null, completed: false,
        custom: {},
      };
    }
    return this.data.games[gameId];
  }

  recordPlay(gameId) {
    const g = this.ensureGame(gameId);
    g.plays += 1;
    g.lastPlayed = Date.now();
    this.touchRecent(gameId);
    this.save();
    return g;
  }

  recordScore(gameId, score) {
    const g = this.ensureGame(gameId);
    let isHigh = false;
    if (score > g.highScore) { g.highScore = score; isHigh = true; }
    this.save();
    return isHigh;
  }

  recordResult(gameId, result) {
    const g = this.ensureGame(gameId);
    if (result === "win") g.wins += 1;
    else if (result === "loss") g.losses += 1;
    else if (result === "draw") g.draws += 1;
    this.save();
  }

  addPlaytime(gameId, seconds) {
    const g = this.ensureGame(gameId);
    g.timePlayed += seconds;
    this.save();
  }

  touchRecent(gameId) {
    const list = this.data.recentlyPlayed.filter(r => r.gameId !== gameId);
    list.unshift({ gameId, ts: Date.now() });
    this.data.recentlyPlayed = list.slice(0, 12);
  }

  /**
   * Records the first time this player laid eyes on a game. Used for the
   * "Recently added" badge, which runs for a fixed window from that moment
   * rather than from a fixed release date — so the badge is meaningful no
   * matter when someone opens the platform.
   */
  markSeen(gameId) {
    if (!this.data.meta.firstSeen) this.data.meta.firstSeen = {};
    if (this.data.meta.firstSeen[gameId]) return this.data.meta.firstSeen[gameId];
    this.data.meta.firstSeen[gameId] = Date.now();
    this.save();
    return this.data.meta.firstSeen[gameId];
  }
  firstSeenAt(gameId) { return this.data.meta.firstSeen?.[gameId] || null; }

  toggleFavorite(gameId) {
    const idx = this.data.favorites.indexOf(gameId);
    if (idx >= 0) this.data.favorites.splice(idx, 1);
    else this.data.favorites.unshift(gameId);
    this.save();
    return idx < 0;
  }
  isFavorite(gameId) { return this.data.favorites.includes(gameId); }

  exportJSON() { return JSON.stringify(this.data, null, 2); }
  importJSON(json) {
    try {
      const parsed = JSON.parse(json);
      this.data = deepMerge(defaultSave(), parsed);
      this.saveNow();
      eventBus.emit("save:imported", this.data);
      return true;
    } catch (err) {
      console.error("[SaveManager] import failed", err);
      return false;
    }
  }

  resetAll() {
    this.data = defaultSave();
    this.saveNow();
    eventBus.emit("save:reset", this.data);
  }
}

export const saveManager = new SaveManager();
export { AVATAR_EMOJIS };
export default saveManager;
