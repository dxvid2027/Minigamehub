// ==========================================================================
// Home page — hero, continue playing, daily challenge, achievements,
// featured / trending / new / recommended rails, category chips.
// ==========================================================================
import { GAMES, CATEGORIES, getGame } from "../../../data/games.js";
import { saveManager } from "../../systems/saveManager.js";
import { achievementSystem } from "../../systems/achievementSystem.js";
import { dailyChallengeSystem } from "../../systems/dailyChallenge.js";
import { statsManager } from "../../systems/statsManager.js";
import { progression } from "../../systems/progression.js";
import { el, formatNumber, shuffle } from "../../core/utils.js";
import { gameCard, isRecentlyAdded } from "../gameCard.js";
import { gameArtSVG } from "../gameArt.js";
import { iconMarkup } from "../icons.js";

function withIcon(name, label, cls = "") {
  const node = el("span", { class: cls, style: "display:inline-flex;align-items:center;gap:8px;" });
  node.innerHTML = iconMarkup(name);
  if (label) node.appendChild(document.createTextNode(label));
  return node;
}

function headIcon(name) {
  const span = el("span", { class: "ic" });
  span.innerHTML = iconMarkup(name);
  return span;
}

function rail(title, subtitle, games, seeAllHref) {
  if (!games.length) return null;
  const seeAll = seeAllHref ? el("a", { class: "see-all", href: seeAllHref }) : null;
  if (seeAll) { seeAll.appendChild(document.createTextNode("See all")); seeAll.insertAdjacentHTML("beforeend", iconMarkup("arrowRight")); }
  return el("section", {}, [
    el("div", { class: "section-title" }, [
      el("div", {}, [el("h2", {}, title), subtitle ? el("div", { class: "subtitle" }, subtitle) : null]),
      seeAll,
    ]),
    el("div", { class: "rail stagger-in" }, games.map(g => gameCard(g))),
  ]);
}

function heroSection() {
  const save = saveManager.data;
  const overview = statsManager.overview();
  const lastPlayed = save.recentlyPlayed[0];
  const heroGame = lastPlayed ? getGame(lastPlayed.gameId) : GAMES[0];
  const lp = progression.getLevelProgress();

  const playBtn = el("a", { class: "btn btn-primary btn-lg", href: `#/play/${heroGame.id}` });
  playBtn.innerHTML = iconMarkup("play");
  playBtn.appendChild(document.createTextNode(lastPlayed ? `Continue ${heroGame.title}` : `Play ${heroGame.title}`));

  const browseBtn = el("a", { class: "btn btn-ghost btn-lg", href: "#/library" });
  browseBtn.innerHTML = iconMarkup("library");
  browseBtn.appendChild(document.createTextNode("Browse Library"));

  // Cover-art collage: whatever the player last touched, plus two showcases.
  const showcase = [heroGame, ...shuffle(GAMES.filter(g => g.id !== heroGame.id)).slice(0, 2)];
  const art = el("div", { class: "hero-art", "aria-hidden": "true" }, showcase.map(g => {
    const card = el("div", { class: "hero-card" });
    card.innerHTML = gameArtSVG(g, { compact: true });
    card.appendChild(el("div", { class: "cap" }, [
      el("div", { class: "t" }, g.title),
      el("div", { class: "s" }, g.category),
    ]));
    return card;
  }));

  const h1 = el("h1");
  h1.innerHTML = `Your next favorite game is <span class="grad">one click away.</span>`;

  return el("section", { class: "hero" }, [
    el("div", { class: "hero-copy" }, [
      withIcon("bolt", `${GAMES.length} games · New content every week`, "eyebrow"),
      h1,
      el("p", { class: "lead" }, `A premium browser arcade — polished 2D and 3D games, real progression, daily challenges and ${achievementSystem.summary().total} achievements. No installs, no ads, just play.`),
      el("div", { class: "hero-actions" }, [playBtn, browseBtn]),
      el("div", { class: "hero-stats" }, [
        statItem(GAMES.length, "Games"),
        statItem(`Lv ${lp.level}`, `${lp.pct}% to next`),
        statItem(formatNumber(overview.totalPlays), "Games played"),
        statItem(`${achievementSystem.summary().unlocked}/${achievementSystem.summary().total}`, "Achievements"),
      ]),
    ]),
    art,
  ]);
}
function statItem(v, l) { return el("div", { class: "stat" }, [el("b", {}, String(v)), el("span", {}, l)]); }

function continuePlayingCard() {
  const recent = statsManager.recentActivity(4);
  return el("div", { class: "card mini-card" }, [
    el("div", { class: "head" }, [el("h4", {}, "Continue Playing"), headIcon("play")]),
    recent.length
      ? el("div", { style: "display:flex;flex-direction:column;gap:8px;" }, recent.map(r => {
          const thumb = el("div", { class: "thumb" });
          thumb.innerHTML = gameArtSVG(r.game, { compact: true });
          return el("a", { class: "continue-row", href: `#/play/${r.gameId}`, style: "color:inherit;" }, [
            thumb,
            el("div", { class: "info" }, [
              el("div", { class: "t" }, r.game.title),
              el("div", { class: "s" }, `Best ${formatNumber(saveManager.data.games[r.gameId]?.highScore || 0)}`),
            ]),
          ]);
        }))
      : el("p", { style: "color:var(--text-2);font-size:.85rem;margin:0;" }, "You haven't played anything yet — jump into a game to see it here."),
  ]);
}

function dailyChallengeCard() {
  const dc = dailyChallengeSystem.state();
  const ms = dailyChallengeSystem.timeUntilReset();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return el("div", { class: "card mini-card challenge-card" }, [
    el("div", { class: "head" }, [el("h4", {}, "Daily Challenges"), headIcon("calendar")]),
    el("ul", { class: "list" }, dc.challenges.map(c => {
      const chk = el("span", { class: "chk" });
      if (c.done) chk.innerHTML = iconMarkup("check");
      const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
      return el("li", { class: c.done ? "done" : "" }, [
        chk,
        el("span", { class: "txt" }, [
          el("span", {}, c.label),
          !c.done ? el("span", { class: "prog" }, ` ${formatNumber(c.progress)}/${formatNumber(c.target)}`) : null,
          !c.done ? el("span", { class: "pbar thin", style: "margin-top:5px;" }, el("span", { style: `width:${pct}%` })) : null,
        ]),
      ]);
    })),
    el("div", { class: "timer" }, dc.claimedToday ? `Claimed · ${dc.streak}-day streak` : `Resets in ${h}h ${m}m`),
  ]);
}

function achievementProgressCard() {
  const s = achievementSystem.summary();
  return el("div", { class: "card mini-card" }, [
    el("div", { class: "head" }, [el("h4", {}, "Achievement Progress"), headIcon("trophy")]),
    el("div", { style: "display:flex;align-items:center;gap:16px;" }, [
      el("div", { style: "font-family:var(--font-display);font-size:1.7rem;font-weight:800;letter-spacing:-.02em;" }, `${s.pct}%`),
      el("div", { style: "flex:1;" }, [
        el("div", { class: "pbar" }, el("span", { style: `width:${s.pct}%` })),
        el("div", { style: "font-size:.76rem;color:var(--text-2);margin-top:7px;" }, `${s.unlocked} of ${s.total} unlocked`),
      ]),
    ]),
    el("a", { class: "btn btn-ghost btn-sm", href: "#/achievements", style: "margin-top:12px;align-self:flex-start;" }, "View all achievements"),
  ]);
}

export function renderHome(container) {
  container.innerHTML = "";
  const save = saveManager.data;
  const trending = [...GAMES].sort((a, b) => (save.games[b.id]?.plays || 0) - (save.games[a.id]?.plays || 0)).slice(0, 8);
  const newGames = GAMES.filter(g => g.newIn).concat(GAMES.slice(0, 4)).slice(0, 8);
  const featured = GAMES.filter((_, i) => i % 4 === 0).slice(0, 8);
  const playedIds = new Set(Object.keys(save.games).filter(id => save.games[id].plays > 0));
  const unplayed = shuffle(GAMES.filter(g => !playedIds.has(g.id))).slice(0, 8);
  const recommended = unplayed.length >= 4 ? unplayed : shuffle(GAMES).slice(0, 8);

  const catRow = el("div", { class: "chip-row" }, CATEGORIES.map(c =>
    el("a", { class: "chip", href: `#/library?cat=${encodeURIComponent(c)}` }, c)));

  // Games that joined the library in the last few hours get their own rail,
  // which disappears together with their badge.
  const justAdded = GAMES.filter(isRecentlyAdded);

  container.append(
    el("div", { class: "container" }, [
      heroSection(),
      el("div", { class: "dashboard-grid" }, [continuePlayingCard(), dailyChallengeCard(), achievementProgressCard()]),
      rail("Recently Added", "Fresh arrivals — grab them while they're new", justAdded, "#/library?cat=3D"),
      rail("Featured Games", "Hand-picked favorites from the MegaPlay team", featured, "#/library"),
      rail("Trending Now", "What you've been playing most", trending, "#/library"),
      rail("New Releases", "Fresh additions to the library", newGames, "#/library"),
      el("section", {}, [
        el("div", { class: "section-title" }, [el("h2", {}, "Browse Categories")]),
        catRow,
      ]),
      rail("Recommended For You", "Games you haven't tried yet", recommended, "#/library"),
    ]),
  );
}

export default renderHome;
