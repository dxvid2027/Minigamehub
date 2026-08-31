// ==========================================================================
// AchievementSystem — evaluates all achievement definitions against the
// current save and unlocks + rewards any newly completed ones.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { progression } from "./progression.js";
import { eventBus } from "../core/eventBus.js";
import { debounce } from "../core/utils.js";
import { ACHIEVEMENTS, ACHIEVEMENT_SECTIONS, getAchievement } from "../../data/achievements.js";

class AchievementSystem {
  constructor() {
    this._checking = false;
    this._debouncedCheck = debounce(() => this.checkAll(), 180);
    eventBus.on("save:changed", () => this._debouncedCheck());
  }

  init() { this.checkAll(); }

  progressFor(ach, save = saveManager.data) {
    const current = Math.min(ach.target, Math.max(0, ach.getCurrent(save) || 0));
    return { current, target: ach.target, pct: Math.min(100, Math.round((current / ach.target) * 100)) };
  }

  isUnlocked(id) { return !!saveManager.data.achievements.unlocked[id]; }

  checkAll() {
    if (this._checking) return;
    this._checking = true;
    const save = saveManager.data;
    const newlyUnlocked = [];
    for (const ach of ACHIEVEMENTS) {
      if (save.achievements.unlocked[ach.id]) continue;
      const current = ach.getCurrent(save) || 0;
      save.achievements.progress[ach.id] = current;
      if (current >= ach.target) {
        save.achievements.unlocked[ach.id] = Date.now();
        save.profile.achievementPoints += 10;
        if (ach.reward?.coins) save.profile.coins += ach.reward.coins;
        newlyUnlocked.push(ach);
      }
    }
    if (newlyUnlocked.length) {
      saveManager.saveNow();
      for (const ach of newlyUnlocked) {
        if (ach.reward?.xp) progression.addXP(ach.reward.xp, `achievement:${ach.id}`);
        eventBus.emit("achievement:unlocked", ach);
      }
    } else {
      saveManager._persist();
    }
    this._checking = false;
    return newlyUnlocked;
  }

  all() { return ACHIEVEMENTS; }
  sections() { return ACHIEVEMENT_SECTIONS; }
  globalOnly() { return ACHIEVEMENTS.filter(a => !a.gameId); }
  forGame(gameId) { return ACHIEVEMENTS.filter(a => a.gameId === gameId); }

  summary() {
    const save = saveManager.data;
    const unlocked = Object.keys(save.achievements.unlocked).length;
    return { unlocked, total: ACHIEVEMENTS.length, pct: Math.round((unlocked / ACHIEVEMENTS.length) * 100) };
  }
}

export const achievementSystem = new AchievementSystem();
export default achievementSystem;
