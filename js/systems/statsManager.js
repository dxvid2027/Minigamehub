// ==========================================================================
// StatsManager — aggregates cross-game statistics from the save file.
// Nothing here is stored independently; it's all derived on demand so it
// can never drift out of sync with the raw per-game records.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { GAMES, getGame } from "../../data/games.js";

class StatsManager {
  overview() {
    const games = saveManager.data.games;
    const entries = Object.entries(games);
    const totalPlaytime = entries.reduce((s, [, g]) => s + (g.timePlayed || 0), 0);
    const totalPlays = entries.reduce((s, [, g]) => s + (g.plays || 0), 0);
    const totalWins = entries.reduce((s, [, g]) => s + (g.wins || 0), 0);
    const totalLosses = entries.reduce((s, [, g]) => s + (g.losses || 0), 0);
    const totalDraws = entries.reduce((s, [, g]) => s + (g.draws || 0), 0);
    const decided = totalWins + totalLosses;
    const winRate = decided > 0 ? Math.round((totalWins / decided) * 100) : 0;
    const gamesCompleted = entries.filter(([, g]) => g.completed).length;
    const gamesPlayed = entries.filter(([, g]) => g.plays > 0).length;
    return { totalPlaytime, totalPlays, totalWins, totalLosses, totalDraws, winRate, gamesCompleted, gamesPlayed, totalGames: GAMES.length };
  }

  mostPlayed(limit = 5) {
    return Object.entries(saveManager.data.games)
      .filter(([, g]) => g.plays > 0)
      .sort((a, b) => b[1].plays - a[1].plays)
      .slice(0, limit)
      .map(([id, g]) => ({ game: getGame(id), stats: g }));
  }

  highScores(limit = 8) {
    return Object.entries(saveManager.data.games)
      .filter(([, g]) => g.highScore > 0)
      .sort((a, b) => b[1].highScore - a[1].highScore)
      .slice(0, limit)
      .map(([id, g]) => ({ game: getGame(id), stats: g }));
  }

  playtimeByGame() {
    return Object.entries(saveManager.data.games)
      .filter(([, g]) => g.timePlayed > 0)
      .sort((a, b) => b[1].timePlayed - a[1].timePlayed)
      .map(([id, g]) => ({ game: getGame(id), seconds: g.timePlayed }));
  }

  recentActivity(limit = 8) {
    return saveManager.data.recentlyPlayed.slice(0, limit).map(r => ({ ...r, game: getGame(r.gameId) })).filter(r => r.game);
  }

  weeklyActivityBars() {
    // Bucket recentlyPlayed timestamps (only source of dated events we retain) into last 7 days.
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
      return { label: d.toLocaleDateString(undefined, { weekday: "short" }), start: d.getTime(), count: 0 };
    });
    saveManager.data.recentlyPlayed.forEach(r => {
      for (const day of days) {
        if (r.ts >= day.start && r.ts < day.start + 86400000) { day.count++; break; }
      }
    });
    return days;
  }
}

export const statsManager = new StatsManager();
export default statsManager;
