// ==========================================================================
// Home page — hero, continue playing, daily challenge, achievements,
// featured / trending / new / recommended rails, category chips.
// ==========================================================================
import { GAMES, CATEGORIES, getGame } from "../../../data/games.js";
import { saveManager } from "../../systems/saveManager.js";
import { achievementSystem } from "../../systems/achievementSystem.js";
import { dailyChallengeSystem } from "../../systems/dailyChallenge.js";
import { statsManager } from "../../systems/statsManager.js";
import { el, formatNumber, shuffle } from "../../core/utils.js";
import { gameCard } from "../gameCard.js";
import { eventBus } from "../../core/eventBus.js";

function rail(title, subtitle, games, seeAllHref) {
  if (!games.length) return null;
  return el("section", {}, [
    el("div", { class: "section-title" }, [
      el("div", {}, [el("h2", {}, title), subtitle ? el("div", { class: "subtitle" }, subtitle) : null]),
      seeAllHref ? el("a", { class: "see-all", href: seeAllHref }, "See all →") : null,
    ]),
    el("div", { class: "rail stagger-in" }, games.map(g => gameCard(g))),
  ]);
}

function heroSection() {
  const save = saveManager.data;
  const overview = statsManager.overview();
  const lastPlayed = save.recentlyPlayed[0];
  const heroGame = lastPlayed ? getGame(lastPlayed.gameId) : GAMES[0];

  return el("section", { class: "hero" }, [
    el("span", { class: "eyebrow" }, "⚡ 30+ Games · New content every week"),
    el("h1", {}, ["Your next favorite game is one click away."]),
    el("p", { class: "lead" }, "MegaPlay Hub is a premium browser arcade — polished mini games, real progression, daily challenges and achievements. No installs, no ads, just play."),
    el("div", { class: "hero-actions" }, [
      el("a", { class: "btn btn-primary btn-lg", href: `#/play/${heroGame.id}` }, `▶ ${lastPlayed ? "Continue " + heroGame.title : "Play " + heroGame.title}`),
      el("a", { class: "btn btn-ghost btn-lg", href: "#/library" }, "Browse Library"),
    ]),
    el("div", { class: "hero-stats" }, [
      statItem(GAMES.length + "+", "Games"),
      statItem(formatNumber(achievementSystem.summary().total), "Achievements"),
      statItem("Lv " + save.profile.level, "Your Level"),
      statItem(formatNumber(overview.totalPlays), "Games Played"),
    ]),
  ]);
}
function statItem(v, l) { return el("div", { class: "stat" }, [el("b", {}, v), el("span", {}, l)]); }

function continuePlayingCard() {
  const recent = statsManager.recentActivity(4);
  return el("div", { class: "card mini-card" }, [
    el("div", { class: "head" }, [el("h4", {}, "Continue Playing"), el("span", { class: "ic" }, "▶️")]),
    recent.length
      ? el("div", { style: "display:flex;flex-direction:column;gap:8px;" }, recent.map(r => el("a", { class: "continue-row", href: `#/play/${r.gameId}`, style: "color:inherit;" }, [
          el("div", { class: "thumb", style: `background:linear-gradient(135deg, ${r.game.grad[0]}, ${r.game.grad[1]})` }, r.game.emoji),
          el("div", { class: "info" }, [el("div", { class: "t" }, r.game.title), el("div", { class: "s" }, `Best ${formatNumber(saveManager.data.games[r.gameId]?.highScore || 0)}`)]),
        ])))
      : el("p", { style: "color:var(--text-2);font-size:.85rem;" }, "You haven't played anything yet — jump into a game to see it here."),
  ]);
}

function dailyChallengeCard() {
  const dc = dailyChallengeSystem.state();
  const ms = dailyChallengeSystem.timeUntilReset();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return el("div", { class: "card mini-card challenge-card" }, [
    el("div", { class: "head" }, [el("h4", {}, "Daily Challenges"), el("span", { class: "ic" }, "📅")]),
    el("ul", { class: "list" }, dc.challenges.map(c => el("li", { class: c.done ? "done" : "" }, [
      el("span", { class: "chk" }, c.done ? "✓" : ""),
      el("span", { class: "txt" }, c.label),
    ]))),
    el("div", { class: "timer" }, dc.claimedToday ? `✅ Claimed · ${dc.streak}-day streak` : `Resets in ${h}h ${m}m`),
  ]);
}

function achievementProgressCard() {
  const s = achievementSystem.summary();
  return el("div", { class: "card mini-card" }, [
    el("div", { class: "head" }, [el("h4", {}, "Achievement Progress"), el("span", { class: "ic" }, "🏆")]),
    el("div", { style: "display:flex;align-items:center;gap:14px;" }, [
      el("div", { style: "font-family:var(--font-display);font-size:1.6rem;font-weight:800;" }, `${s.pct}%`),
      el("div", { style: "flex:1;" }, [
        el("div", { class: "pbar" }, el("span", { style: `width:${s.pct}%` })),
        el("div", { style: "font-size:.76rem;color:var(--text-2);margin-top:6px;" }, `${s.unlocked} / ${s.total} unlocked`),
      ]),
    ]),
    el("a", { class: "btn btn-ghost btn-sm", href: "#/achievements", style: "margin-top:14px;" }, "View All Achievements"),
  ]);
}

export function renderHome(container) {
  container.innerHTML = "";
  const save = saveManager.data;
  const trending = [...GAMES].sort((a, b) => (save.games[b.id]?.plays || 0) - (save.games[a.id]?.plays || 0)).slice(0, 8);
  const newGames = GAMES.filter(g => g.newIn).concat(GAMES.slice(0, 4)).slice(0, 8);
  const featured = GAMES.filter((_, i) => i % 4 === 0).slice(0, 8);
  const playedIds = new Set(Object.keys(save.games).filter(id => save.games[id].plays > 0));
  const recommended = shuffle(GAMES.filter(g => !playedIds.has(g.id))).slice(0, 8);
  const recommendedFinal = recommended.length >= 4 ? recommended : shuffle(GAMES).slice(0, 8);

  container.append(
    el("div", { class: "container" }, [
      heroSection(),
      el("div", { class: "dashboard-grid" }, [continuePlayingCard(), dailyChallengeCard(), achievementProgressCard()]),
      rail("Featured Games", "Hand-picked favorites from the MegaPlay team", featured, "#/library"),
      rail("Trending Now", "What the community is playing most", trending, "#/library"),
      rail("New Releases", "Fresh additions to the library", newGames, "#/library"),
      el("section", {}, [
        el("div", { class: "section-title" }, [el("h2", {}, "Browse Categories")]),
        el("div", { class: "chip-row" }, CATEGORIES.map(c => el("a", { class: "chip", href: `#/library?cat=${encodeURIComponent(c)}` }, c))),
      ]),
      rail("Recommended For You", "Games picked based on what you haven't tried yet", recommendedFinal, "#/library"),
    ]),
  );
}

export default renderHome;
