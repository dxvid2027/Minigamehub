// ==========================================================================
// Achievement definitions — 30+ global achievements plus 4 tiers per game
// (30 games × 4 = 120), for 150+ achievements total.
// Each achievement exposes getCurrent(save) so AchievementSystem can compute
// live progress without duplicating state.
// ==========================================================================
import { GAMES } from "./games.js";

const totalPlays = (save) => Object.values(save.games).reduce((s, g) => s + (g.plays || 0), 0);
const distinctPlayed = (save) => Object.values(save.games).filter(g => g.plays > 0).length;
const totalWins = (save) => Object.values(save.games).reduce((s, g) => s + (g.wins || 0), 0);
const totalPlaytime = (save) => Object.values(save.games).reduce((s, g) => s + (g.timePlayed || 0), 0);
const bestScoreAny = (save) => Object.values(save.games).reduce((m, g) => Math.max(m, g.highScore || 0), 0);
const unlockedCount = (save) => Object.keys(save.achievements.unlocked || {}).length;

// Games where "win" is the natural mastery metric rather than a numeric score.
const WIN_BASED = new Set(["pong", "tic-tac-toe", "connect-four", "chess", "checkers", "air-hockey"]);
// Sensible high-score goals for the "Legend" tier of score-based games.
const SCORE_GOALS = {
  snake: 300, tetris: 8000, "flappy-bird": 40, breakout: 4000, "space-shooter": 5000,
  "endless-runner": 2000, "tower-defense": 15, "whack-a-mole": 400, platformer: 3000,
  racing: 5000, basketball: 18, "fruit-slice": 150, "2048": 2048, "simon-says": 14,
  "color-match": 25, "bubble-shooter": 2500, "typing-rush": 18, "stack-tower": 18,
  "word-scramble": 12, "reaction-time": 1, // reaction: "current" is inverted (see below)
};

function buildGlobalAchievements() {
  return [
    // --- Getting started ---
    { id: "g_first_play", name: "First Steps", desc: "Play any game for the first time.", icon: "👣", target: 1, reward: { coins: 25, xp: 20 }, section: "Getting Started", getCurrent: totalPlays },
    { id: "g_five_games", name: "Warming Up", desc: "Play 5 different games.", icon: "🔥", target: 5, reward: { coins: 50, xp: 40 }, section: "Getting Started", getCurrent: distinctPlayed },
    { id: "g_ten_games", name: "Game Explorer", desc: "Play 10 different games.", icon: "🧭", target: 10, reward: { coins: 80, xp: 60 }, section: "Getting Started", getCurrent: distinctPlayed },
    { id: "g_twenty_games", name: "Genre Hopper", desc: "Play 20 different games.", icon: "🗺️", target: 20, reward: { coins: 150, xp: 120 }, section: "Getting Started", getCurrent: distinctPlayed },
    { id: "g_all_games", name: "Completionist", desc: `Play all ${GAMES.length} games in the library.`, icon: "🏆", target: GAMES.length, reward: { coins: 500, xp: 400 }, section: "Getting Started", getCurrent: distinctPlayed },

    // --- Volume ---
    { id: "g_plays_25", name: "Getting the Hang of It", desc: "Play games 25 times in total.", icon: "🎮", target: 25, reward: { coins: 40, xp: 30 }, section: "Dedication", getCurrent: totalPlays },
    { id: "g_plays_100", name: "Century Club", desc: "Play games 100 times in total.", icon: "💯", target: 100, reward: { coins: 120, xp: 100 }, section: "Dedication", getCurrent: totalPlays },
    { id: "g_plays_500", name: "Dedicated Gamer", desc: "Play games 500 times in total.", icon: "🎖️", target: 500, reward: { coins: 400, xp: 350 }, section: "Dedication", getCurrent: totalPlays },
    { id: "g_plays_1000", name: "Arcade Icon", desc: "Play games 1,000 times in total.", icon: "🌟", target: 1000, reward: { coins: 900, xp: 800 }, section: "Dedication", getCurrent: totalPlays },

    // --- Score / skill ---
    { id: "g_score_500", name: "On the Board", desc: "Score at least 500 points in any single game.", icon: "📈", target: 500, reward: { coins: 40, xp: 35 }, section: "Skill", getCurrent: bestScoreAny },
    { id: "g_score_2000", name: "High Scorer", desc: "Score at least 2,000 points in any single game.", icon: "🚀", target: 2000, reward: { coins: 100, xp: 90 }, section: "Skill", getCurrent: bestScoreAny },
    { id: "g_score_10000", name: "Score Legend", desc: "Score at least 10,000 points in any single game.", icon: "👑", target: 10000, reward: { coins: 300, xp: 250 }, section: "Skill", getCurrent: bestScoreAny },

    // --- Wins ---
    { id: "g_win_1", name: "First Victory", desc: "Win a match in any competitive game.", icon: "🥇", target: 1, reward: { coins: 25, xp: 20 }, section: "Competitor", getCurrent: totalWins },
    { id: "g_win_10", name: "Winning Streak", desc: "Win 10 matches in total.", icon: "🔟", target: 10, reward: { coins: 90, xp: 80 }, section: "Competitor", getCurrent: totalWins },
    { id: "g_win_50", name: "Champion", desc: "Win 50 matches in total.", icon: "🏅", target: 50, reward: { coins: 300, xp: 260 }, section: "Competitor", getCurrent: totalWins },
    { id: "g_win_200", name: "Grandmaster", desc: "Win 200 matches in total.", icon: "♛", target: 200, reward: { coins: 800, xp: 700 }, section: "Competitor", getCurrent: totalWins },

    // --- Coins ---
    { id: "g_coins_1000", name: "Piggy Bank", desc: "Hold at least 1,000 coins at once.", icon: "🐷", target: 1000, reward: { coins: 0, xp: 40 }, section: "Wealth", getCurrent: (s) => s.profile.coins },
    { id: "g_coins_5000", name: "High Roller", desc: "Hold at least 5,000 coins at once.", icon: "🪙", target: 5000, reward: { coins: 0, xp: 100 }, section: "Wealth", getCurrent: (s) => s.profile.coins },
    { id: "g_coins_20000", name: "Coin Baron", desc: "Hold at least 20,000 coins at once.", icon: "💰", target: 20000, reward: { coins: 0, xp: 300 }, section: "Wealth", getCurrent: (s) => s.profile.coins },

    // --- Levels ---
    { id: "g_level_5", name: "Rising Star", desc: "Reach player level 5.", icon: "⭐", target: 5, reward: { coins: 60, xp: 0 }, section: "Progression", getCurrent: (s) => s.profile.level },
    { id: "g_level_10", name: "Seasoned Player", desc: "Reach player level 10.", icon: "🌠", target: 10, reward: { coins: 150, xp: 0 }, section: "Progression", getCurrent: (s) => s.profile.level },
    { id: "g_level_25", name: "Veteran", desc: "Reach player level 25.", icon: "🎇", target: 25, reward: { coins: 400, xp: 0 }, section: "Progression", getCurrent: (s) => s.profile.level },
    { id: "g_level_50", name: "MegaPlay Master", desc: "Reach player level 50.", icon: "🏵️", target: 50, reward: { coins: 1000, xp: 0 }, section: "Progression", getCurrent: (s) => s.profile.level },

    // --- Daily challenges ---
    { id: "g_daily_1", name: "Challenger", desc: "Complete your first daily challenge.", icon: "📅", target: 1, reward: { coins: 40, xp: 30 }, section: "Daily", getCurrent: (s) => s.dailyChallenge.streak > 0 ? Math.max(1, s.dailyChallenge.streak) : (s.dailyChallenge.claimedToday ? 1 : 0) },
    { id: "g_daily_streak_3", name: "Consistent", desc: "Reach a 3-day daily-challenge streak.", icon: "🔗", target: 3, reward: { coins: 80, xp: 60 }, section: "Daily", getCurrent: (s) => s.dailyChallenge.streak },
    { id: "g_daily_streak_7", name: "Weekly Warrior", desc: "Reach a 7-day daily-challenge streak.", icon: "🗓️", target: 7, reward: { coins: 200, xp: 150 }, section: "Daily", getCurrent: (s) => s.dailyChallenge.streak },
    { id: "g_daily_streak_30", name: "Unstoppable", desc: "Reach a 30-day daily-challenge streak.", icon: "🔥", target: 30, reward: { coins: 800, xp: 600 }, section: "Daily", getCurrent: (s) => s.dailyChallenge.streak },

    // --- Time ---
    { id: "g_time_1h", name: "Speed Runner", desc: "Accumulate 1 hour of total playtime.", icon: "⏱️", target: 3600, reward: { coins: 60, xp: 50 }, section: "Time", getCurrent: totalPlaytime },
    { id: "g_time_10h", name: "Marathoner", desc: "Accumulate 10 hours of total playtime.", icon: "⏳", target: 36000, reward: { coins: 300, xp: 250 }, section: "Time", getCurrent: totalPlaytime },
    { id: "g_time_50h", name: "No Life Detected", desc: "Accumulate 50 hours of total playtime.", icon: "🛋️", target: 180000, reward: { coins: 1200, xp: 1000 }, section: "Time", getCurrent: totalPlaytime },

    // --- Social / collection ---
    { id: "g_fav_5", name: "Curator", desc: "Add 5 games to your favorites.", icon: "❤️", target: 5, reward: { coins: 50, xp: 40 }, section: "Collection", getCurrent: (s) => s.favorites.length },
    { id: "g_ach_25", name: "Trophy Hunter", desc: "Unlock 25 achievements.", icon: "🏆", target: 25, reward: { coins: 150, xp: 0 }, section: "Collection", getCurrent: unlockedCount },
    { id: "g_ach_75", name: "Achievement Addict", desc: "Unlock 75 achievements.", icon: "🎯", target: 75, reward: { coins: 400, xp: 0 }, section: "Collection", getCurrent: unlockedCount },
    { id: "g_ach_120", name: "Living Legend", desc: "Unlock 120 achievements.", icon: "🐉", target: 120, reward: { coins: 1000, xp: 0 }, section: "Collection", getCurrent: unlockedCount },
  ];
}

function buildPerGameAchievements() {
  const list = [];
  for (const game of GAMES) {
    const plays = (save) => save.games[game.id]?.plays || 0;
    list.push(
      { id: `pg_${game.id}_rookie`, name: `${game.title}: Rookie`, desc: `Play ${game.title} for the first time.`, icon: game.emoji, target: 1, reward: { coins: 10, xp: 15 }, section: game.title, gameId: game.id, getCurrent: plays },
      { id: `pg_${game.id}_fan`, name: `${game.title}: Fan`, desc: `Play ${game.title} 10 times.`, icon: game.emoji, target: 10, reward: { coins: 30, xp: 40 }, section: game.title, gameId: game.id, getCurrent: plays },
      { id: `pg_${game.id}_veteran`, name: `${game.title}: Veteran`, desc: `Play ${game.title} 25 times.`, icon: game.emoji, target: 25, reward: { coins: 60, xp: 80 }, section: game.title, gameId: game.id, getCurrent: plays },
    );
    if (WIN_BASED.has(game.id)) {
      list.push({ id: `pg_${game.id}_legend`, name: `${game.title}: Legend`, desc: `Win 10 matches of ${game.title}.`, icon: "👑", target: 10, reward: { coins: 100, xp: 150 }, section: game.title, gameId: game.id, getCurrent: (save) => save.games[game.id]?.wins || 0 });
    } else if (SCORE_GOALS[game.id]) {
      list.push({ id: `pg_${game.id}_legend`, name: `${game.title}: Legend`, desc: `Reach a high score of ${SCORE_GOALS[game.id]} in ${game.title}.`, icon: "👑", target: SCORE_GOALS[game.id], reward: { coins: 100, xp: 150 }, section: game.title, gameId: game.id, getCurrent: (save) => save.games[game.id]?.highScore || 0 });
    } else {
      list.push({ id: `pg_${game.id}_legend`, name: `${game.title}: Legend`, desc: `Play ${game.title} 50 times.`, icon: "👑", target: 50, reward: { coins: 100, xp: 150 }, section: game.title, gameId: game.id, getCurrent: plays });
    }
  }
  return list;
}

export const ACHIEVEMENTS = [...buildGlobalAchievements(), ...buildPerGameAchievements()];
export const ACHIEVEMENT_SECTIONS = [...new Set(ACHIEVEMENTS.map(a => a.section))];
export function getAchievement(id) { return ACHIEVEMENTS.find(a => a.id === id); }
export default ACHIEVEMENTS;
