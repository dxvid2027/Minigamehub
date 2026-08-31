// ==========================================================================
// DailyChallenge — deterministic (seeded-by-date) rotating challenge set.
// Progress is tracked live from gameplay events emitted by GameBase.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { progression } from "./progression.js";
import { eventBus } from "../core/eventBus.js";
import { todayKey, daysBetween, seededRng, shuffle } from "../core/utils.js";
import { CHALLENGE_POOL } from "../../data/dailyChallenges.js";

const CHALLENGE_COUNT = 3;

class DailyChallengeSystem {
  constructor() {
    eventBus.on("game:score", (p) => this._onScore(p));
    eventBus.on("game:result", (p) => this._onResult(p));
    eventBus.on("game:played", (p) => this._onPlayed(p));
    eventBus.on("game:playtime", (p) => this._onPlaytime(p));
  }

  init() { this.rollIfNeeded(); }

  state() { return saveManager.data.dailyChallenge; }

  rollIfNeeded() {
    const key = todayKey();
    const dc = saveManager.data.dailyChallenge;
    if (dc.dateKey === key) return dc;

    // Streak bookkeeping: only keep the streak alive if *yesterday* was completed.
    if (dc.dateKey) {
      const gap = daysBetween(dc.dateKey, key);
      if (gap === 1 && dc.claimedToday) {
        // streak already incremented when it was claimed; nothing to do
      } else if (gap !== 0) {
        dc.streak = 0;
      }
    }

    const rng = seededRng(`megaplay-${key}`);
    const pool = shuffle([...CHALLENGE_POOL].sort(() => rng() - 0.5));
    const picked = pool.slice(0, CHALLENGE_COUNT);

    dc.dateKey = key;
    dc.claimedToday = false;
    dc.challenges = picked.map(t => ({
      tmplId: t.id, gameId: t.gameId, type: t.type, target: t.target,
      label: t.label, coins: t.coins, xp: t.xp, progress: 0, done: false,
    }));
    saveManager.saveNow();
    eventBus.emit("daily:rolled", dc);
    return dc;
  }

  _bump(tmplPredicate, amount, { max = false } = {}) {
    const dc = saveManager.data.dailyChallenge;
    let changed = false;
    for (const c of dc.challenges) {
      if (c.done || !tmplPredicate(c)) continue;
      c.progress = max ? Math.max(c.progress, amount) : c.progress + amount;
      if (c.progress >= c.target) { c.progress = c.target; c.done = true; }
      changed = true;
    }
    if (changed) {
      saveManager.save();
      eventBus.emit("daily:progress", dc);
      this._maybeComplete();
    }
  }

  _onScore({ gameId, score }) { this._bump(c => c.type === "score" && c.gameId === gameId, score, { max: true }); }
  _onResult({ gameId, result }) { if (result === "win") this._bump(c => c.type === "win" && c.gameId === gameId, 1); }
  _onPlayed({ gameId }) { this._bump(c => c.type === "plays" && (c.gameId === gameId || c.gameId === null), 1); }
  _onPlaytime({ gameId, seconds }) { this._bump(c => c.type === "playtime" && (c.gameId === gameId || c.gameId === null), seconds); }

  _maybeComplete() {
    const dc = saveManager.data.dailyChallenge;
    if (dc.claimedToday) return;
    if (!dc.challenges.every(c => c.done)) return;
    dc.claimedToday = true;
    const key = todayKey();
    dc.streak = dc.lastCompletedKey && daysBetween(dc.lastCompletedKey, key) === 1 ? dc.streak + 1 : 1;
    dc.lastCompletedKey = key;
    const coins = dc.challenges.reduce((s, c) => s + c.coins, 0);
    const xp = dc.challenges.reduce((s, c) => s + c.xp, 0);
    progression.addCoins(coins, "daily-challenge");
    progression.addXP(xp, "daily-challenge");
    saveManager.saveNow();
    eventBus.emit("daily:completed", { coins, xp, streak: dc.streak });
  }

  timeUntilReset() {
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    return midnight - now;
  }
}

export const dailyChallengeSystem = new DailyChallengeSystem();
export default dailyChallengeSystem;
