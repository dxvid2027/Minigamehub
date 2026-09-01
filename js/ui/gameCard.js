// ==========================================================================
// GameCard — shared grid/list card used on Home & Library.
// ==========================================================================
import { el, formatNumber } from "../core/utils.js";
import { saveManager } from "../systems/saveManager.js";
import { audioManager } from "../systems/audioManager.js";
import { gameArt } from "./gameArt.js";
import { iconMarkup } from "./icons.js";

const NEW_WINDOW_DAYS = 21;
// A freshly added game wears its badge for three hours of wall-clock time,
// counted from the moment this player first saw it (see saveManager.markSeen).
export const RECENT_WINDOW_MS = 3 * 60 * 60 * 1000;

export function isRecentlyAdded(meta) {
  if (!meta.addedAt) return false;
  const seen = saveManager.firstSeenAt(meta.id);
  if (!seen) return false;
  return Date.now() - seen < RECENT_WINDOW_MS;
}

function isNew(meta) {
  if (!meta.newIn) return false;
  const days = (Date.now() - new Date(meta.newIn).getTime()) / 86400000;
  return days >= 0 && days < NEW_WINDOW_DAYS;
}
function isHot(meta) {
  return (saveManager.data.games[meta.id]?.plays || 0) >= 15;
}

export function gameCard(meta, { list = false } = {}) {
  const stats = saveManager.data.games[meta.id];
  const fav = saveManager.isFavorite(meta.id);

  const favBtn = el("button", {
    class: `fav-btn${fav ? " active" : ""}`, "aria-label": "Toggle favorite", title: "Favorite", type: "button",
    onClick: (e) => {
      e.preventDefault(); e.stopPropagation();
      const now = saveManager.toggleFavorite(meta.id);
      favBtn.classList.toggle("active", now);
      favBtn.innerHTML = iconMarkup(now ? "starFilled" : "star");
      audioManager.play("toggle");
    },
  });
  favBtn.innerHTML = iconMarkup(fav ? "starFilled" : "star");

  const metaLine = el("div", { class: "meta" }, [
    el("span", {}, meta.category),
    el("span", { class: "dot" }),
    el("span", {}, stats?.plays ? `Best ${formatNumber(stats.highScore)}` : (meta.tags[0] || "new")),
  ]);

  return el("a", {
    class: `game-card${list ? " list-item" : ""}`, href: `#/play/${meta.id}`, tabindex: "0",
    "aria-label": `Play ${meta.title}`,
    onClick: () => audioManager.play("click"),
  }, [
    isRecentlyAdded(meta)
      ? el("span", { class: "tag recent" }, "Recently added")
      : (isNew(meta) ? el("span", { class: "tag new" }, "New") : (isHot(meta) ? el("span", { class: "tag hot" }, "Hot") : null)),
    favBtn,
    gameArt(meta, { compact: list }),
    el("div", { class: "body" }, [
      el("div", { class: "title" }, meta.title),
      metaLine,
    ]),
  ]);
}

export default gameCard;
