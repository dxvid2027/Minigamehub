// ==========================================================================
// Progression — XP curve, leveling, coins, and level-reward unlocks.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { eventBus } from "../core/eventBus.js";
import { AVATAR_EMOJIS } from "./saveManager.js";

export function xpForLevel(level) {
  return Math.round(60 * Math.pow(level, 1.55) + 40);
}

// Rewards granted the moment a player reaches a given level.
const LEVEL_REWARDS = {
  3: { avatar: "👾" }, 5: { theme: "crimson", coins: 100 }, 7: { avatar: "🚀" },
  10: { theme: "emerald", coins: 200 }, 12: { avatar: "🐉" }, 15: { avatar: "🦊", coins: 150 },
  20: { theme: "royal", coins: 300 }, 25: { avatar: "👑", coins: 250 }, 30: { avatar: "🤖" },
  35: { avatar: "🦉", coins: 400 }, 40: { avatar: "🌟", coins: 400 }, 50: { avatar: "🎲", coins: 1000 },
};

class Progression {
  getLevelProgress() {
    const { level, xp } = saveManager.data.profile;
    const need = xpForLevel(level);
    return { level, xp, need, pct: Math.min(100, Math.round((xp / need) * 100)) };
  }

  addCoins(amount, reason = "") {
    if (!amount) return;
    saveManager.data.profile.coins = Math.max(0, saveManager.data.profile.coins + amount);
    saveManager.save();
    eventBus.emit("coins:changed", { amount, reason, total: saveManager.data.profile.coins });
  }

  spendCoins(amount) {
    if (saveManager.data.profile.coins < amount) return false;
    saveManager.data.profile.coins -= amount;
    saveManager.save();
    eventBus.emit("coins:changed", { amount: -amount, total: saveManager.data.profile.coins });
    return true;
  }

  addXP(amount, reason = "") {
    if (!amount) return;
    const profile = saveManager.data.profile;
    profile.xp += amount;
    eventBus.emit("xp:changed", { amount, reason });
    let leveledUp = false;
    let need = xpForLevel(profile.level);
    while (profile.xp >= need) {
      profile.xp -= need;
      profile.level += 1;
      leveledUp = true;
      this._grantLevelReward(profile.level);
      need = xpForLevel(profile.level);
    }
    saveManager.save();
    if (leveledUp) eventBus.emit("level:up", { level: profile.level });
  }

  _grantLevelReward(level) {
    const reward = LEVEL_REWARDS[level];
    const profile = saveManager.data.profile;
    const grants = [];
    if (reward?.theme && !profile.unlockedThemes.includes(reward.theme)) {
      profile.unlockedThemes.push(reward.theme);
      grants.push({ type: "theme", value: reward.theme });
    }
    if (reward?.avatar && !profile.unlockedAvatars.includes(reward.avatar)) {
      profile.unlockedAvatars.push(reward.avatar);
      grants.push({ type: "avatar", value: reward.avatar });
    }
    if (reward?.coins) {
      profile.coins += reward.coins;
      grants.push({ type: "coins", value: reward.coins });
    }
    if (grants.length) eventBus.emit("reward:unlocked", { level, grants });
  }

  unlockedAvatarPool() { return AVATAR_EMOJIS; }
}

export const progression = new Progression();
export default progression;
