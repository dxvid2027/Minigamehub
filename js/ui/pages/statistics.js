// ==========================================================================
// Statistics page — playtime, completion, high scores, most played, win rate.
// ==========================================================================
import { statsManager } from "../../systems/statsManager.js";
import { el, formatNumber, formatTime } from "../../core/utils.js";

function tile(icon, val, lbl) {
  return el("div", { class: "card stat-tile" }, [el("div", { class: "ic" }, icon), el("div", {}, [el("div", { class: "val" }, val), el("div", { class: "lbl" }, lbl)])]);
}

function leaderboard(title, rows, valueFn) {
  return el("div", { class: "card card-pad" }, [
    el("h3", { style: "margin-bottom:12px;font-size:1rem;" }, title),
    rows.length
      ? el("div", {}, rows.map((r, i) => el("div", { class: "leaderboard-row" }, [
          el("div", { class: "rank" }, `#${i + 1}`),
          el("div", { class: "thumb", style: `background:linear-gradient(135deg, ${r.game.grad[0]}, ${r.game.grad[1]})` }, r.game.emoji),
          el("div", { class: "name" }, r.game.title),
          el("div", { class: "score" }, valueFn(r)),
        ])))
      : el("p", { style: "color:var(--text-2);font-size:.85rem;" }, "No data yet — go play something!"),
  ]);
}

function activityChart() {
  const days = statsManager.weeklyActivityBars();
  const max = Math.max(1, ...days.map(d => d.count));
  return el("div", { class: "card card-pad" }, [
    el("h3", { style: "margin-bottom:4px;font-size:1rem;" }, "Activity This Week"),
    el("p", { style: "margin:0 0 6px;font-size:.8rem;color:var(--text-2);" }, "Sessions started per day"),
    el("div", { class: "bar-chart" }, days.map(d => el("div", { class: "bar", style: `height:${Math.max(4, (d.count / max) * 100)}%` }, el("span", { class: "bar-lbl" }, String(d.count))))),
    el("div", { style: "display:flex;justify-content:space-between;margin-top:8px;font-size:.72rem;color:var(--text-3);" }, days.map(d => el("span", {}, d.label))),
  ]);
}

export function renderStatistics(container) {
  container.innerHTML = "";
  const ov = statsManager.overview();
  const mostPlayed = statsManager.mostPlayed(6);
  const highScores = statsManager.highScores(6);
  const byPlaytime = statsManager.playtimeByGame().slice(0, 6);

  container.append(el("div", { class: "container" }, [
    el("div", { class: "section-title" }, [el("h2", {}, "Statistics")]),
    el("div", { class: "stat-grid" }, [
      tile("⏱️", formatTime(ov.totalPlaytime), "Total Playtime"),
      tile("🎮", formatNumber(ov.totalPlays), "Games Played"),
      tile("✅", formatNumber(ov.gamesCompleted), "Games Completed"),
      tile("🏆", `${ov.gamesPlayed}/${ov.totalGames}`, "Games Tried"),
      tile("📈", `${ov.winRate}%`, "Win Rate"),
      tile("🥇", formatNumber(ov.totalWins), "Total Wins"),
    ]),
    el("div", { class: "dashboard-grid", style: "margin-top:22px;" }, [
      activityChart(),
      leaderboard("Most Played Games", mostPlayed, (r) => `${r.stats.plays}×`),
      leaderboard("Highest Scores", highScores, (r) => formatNumber(r.stats.highScore)),
      leaderboard("Most Time Invested", byPlaytime.map(x => ({ game: x.game, stats: { highScore: x.seconds } })), (r) => formatTime(r.stats.highScore)),
    ]),
  ]));
}

export default renderStatistics;
