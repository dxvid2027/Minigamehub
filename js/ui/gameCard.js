// ==========================================================================
// GameCard — shared grid/list card component used on Home & Library.
// ==========================================================================
import { el } from "../core/utils.js";
import { saveManager } from "../systems/saveManager.js";
import { audioManager } from "../systems/audioManager.js";
import { router } from "../core/router.js";

const NEW_WINDOW_DAYS = 21;

function isNew(meta) {
  if (!meta.newIn) return false;
  const days = (Date.now() - new Date(meta.newIn).getTime()) / 86400000;
  return days >= 0 && days < NEW_WINDOW_DAYS;
}
function isHot(meta) {
  const g = saveManager.data.games[meta.id];
  return (g?.plays || 0) >= 15;
}

export function gameCard(meta, { list = false } = {}) {
  const g = saveManager.data.games[meta.id];
  const fav = saveManager.isFavorite(meta.id);
  const gradient = `linear-gradient(135deg, ${meta.grad[0]}55, ${meta.grad[1]}55), linear-gradient(160deg, ${meta.grad[0]}, ${meta.grad[1]})`;

  const favBtn = el("button", {
    class: `fav-btn${fav ? " active" : ""}`, "aria-label": "Toggle favorite", title: "Favorite",
    onClick: (e) => { e.preventDefault(); e.stopPropagation(); const now = saveManager.toggleFavorite(meta.id); favBtn.classList.toggle("active", now); audioManager.play("toggle"); },
  }, fav ? "★" : "☆");

  const card = el("a", {
    class: `game-card${list ? " list-item" : ""}`, href: `#/play/${meta.id}`, tabindex: "0",
    onClick: () => audioManager.play("click"),
  }, [
    isNew(meta) ? el("span", { class: "tag new" }, "New") : (isHot(meta) ? el("span", { class: "tag hot" }, "Hot") : null),
    favBtn,
    el("div", { class: "thumb", style: `background:${gradient}` }, el("span", { class: "emoji" }, meta.emoji)),
    el("div", { class: "body" }, [
      el("div", { class: "title" }, meta.title),
      el("div", { class: "meta" }, [
        el("span", {}, meta.category),
        g?.plays ? el("span", {}, `· Best ${formatScore(g.highScore)}`) : el("span", {}, `· ${meta.tags[0] || ""}`),
      ]),
    ]),
  ]);
  return card;
}

function formatScore(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default gameCard;
