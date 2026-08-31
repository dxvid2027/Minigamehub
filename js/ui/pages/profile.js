// ==========================================================================
// Profile page — avatar, level/XP, stats, achievements, favorites, recent.
// ==========================================================================
import { saveManager, AVATAR_EMOJIS } from "../../systems/saveManager.js";
import { progression } from "../../systems/progression.js";
import { achievementSystem } from "../../systems/achievementSystem.js";
import { statsManager } from "../../systems/statsManager.js";
import { audioManager } from "../../systems/audioManager.js";
import { getGame } from "../../../data/games.js";
import { el, formatNumber, formatTime, timeAgo } from "../../core/utils.js";
import { gameCard } from "../gameCard.js";
import { openModal, closeModal } from "../modal.js";

function openEditModal(refresh) {
  const nameInput = el("input", { class: "text-input", value: saveManager.data.profile.username, maxlength: "18" });
  const unlockedAvatars = saveManager.data.profile.unlockedAvatars;
  let chosenAvatar = saveManager.data.profile.avatarEmoji;
  const swatches = el("div", { class: "swatch-row", style: "margin-top:8px;" }, AVATAR_EMOJIS.map(a => {
    const unlocked = unlockedAvatars.includes(a);
    const sw = el("button", { class: `swatch${a === chosenAvatar ? " active" : ""}`, style: "font-size:1.6rem;", disabled: !unlocked || undefined,
      onClick: () => { chosenAvatar = a; swatches.querySelectorAll(".swatch").forEach(s => s.classList.remove("active")); sw.classList.add("active"); audioManager.play("select"); } },
      [a, !unlocked ? el("div", { class: "lock" }, "🔒") : null]);
    return sw;
  }));
  const body = el("div", {}, [
    el("div", { class: "field" }, [el("label", {}, "Username"), nameInput]),
    el("div", { class: "field" }, [el("label", {}, "Avatar"), el("div", { class: "hint" }, "Unlock more avatars by leveling up."), swatches]),
  ]);
  const footer = el("div", { style: "display:flex;gap:10px;" }, [
    el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Cancel"),
    el("button", { class: "btn btn-primary", onClick: () => {
      saveManager.data.profile.username = nameInput.value.trim() || saveManager.data.profile.username;
      saveManager.data.profile.avatarEmoji = chosenAvatar;
      saveManager.saveNow();
      closeModal(); refresh();
    } }, "Save Changes"),
  ]);
  openModal({ title: "Edit Profile", bodyNode: body, footerNode: footer });
}

export function renderProfile(container) {
  function refresh() { renderProfile(container); }
  container.innerHTML = "";
  const save = saveManager.data;
  const lp = progression.getLevelProgress();
  const overview = statsManager.overview();
  const achSummary = achievementSystem.summary();
  const favorites = save.favorites.map(getGame).filter(Boolean);
  const recent = statsManager.recentActivity(6);
  const recentAch = Object.entries(save.achievements.unlocked).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id]) => achievementSystem.all().find(a => a.id === id)).filter(Boolean);

  container.append(el("div", { class: "container" }, [
    el("div", { class: "card profile-header" }, [
      el("div", { class: "avatar avatar-lg" }, save.profile.avatarEmoji),
      el("div", { class: "name-block", style: "flex:1;" }, [
        el("h1", {}, save.profile.username),
        el("span", { class: "level-pill" }, `⭐ Level ${lp.level}`),
        el("div", { class: "xp-track" }, [
          el("div", { class: "lbl" }, [el("span", {}, `${formatNumber(lp.xp)} / ${formatNumber(lp.need)} XP`), el("span", {}, `${lp.pct}%`)]),
          el("div", { class: "pbar" }, el("span", { style: `width:${lp.pct}%` })),
        ]),
      ]),
      el("button", { class: "btn btn-ghost", onClick: () => openEditModal(refresh) }, "✏️ Edit Profile"),
    ]),

    el("div", { class: "profile-stats-row" }, [
      statBox(formatTime(overview.totalPlaytime), "Playtime"),
      statBox(formatNumber(overview.totalPlays), "Games Played"),
      statBox(`${achSummary.unlocked}/${achSummary.total}`, "Achievements"),
      statBox(formatNumber(save.profile.coins), "Coins"),
      statBox(`${overview.winRate}%`, "Win Rate"),
      statBox(formatNumber(save.profile.achievementPoints), "Ach. Points"),
    ]),

    el("div", { class: "dashboard-grid" }, [
      el("div", { class: "card mini-card" }, [
        el("div", { class: "head" }, [el("h4", {}, "Favorite Games"), el("span", { class: "ic" }, "❤️")]),
        favorites.length
          ? el("div", { class: "game-grid list", style: "gap:8px;" }, favorites.slice(0, 5).map(g => gameCard(g, { list: true })))
          : el("p", { style: "color:var(--text-2);font-size:.85rem;" }, "Favorite games from the Library to see them here."),
      ]),
      el("div", { class: "card mini-card" }, [
        el("div", { class: "head" }, [el("h4", {}, "Recently Played"), el("span", { class: "ic" }, "🕒")]),
        recent.length
          ? el("div", { style: "display:flex;flex-direction:column;gap:8px;" }, recent.map(r => el("a", { class: "continue-row", href: `#/play/${r.gameId}`, style: "color:inherit;" }, [
              el("div", { class: "thumb", style: `background:linear-gradient(135deg, ${r.game.grad[0]}, ${r.game.grad[1]})` }, r.game.emoji),
              el("div", { class: "info" }, [el("div", { class: "t" }, r.game.title), el("div", { class: "s" }, timeAgo(r.ts))]),
            ])))
          : el("p", { style: "color:var(--text-2);font-size:.85rem;" }, "Nothing played yet."),
      ]),
      el("div", { class: "card mini-card" }, [
        el("div", { class: "head" }, [el("h4", {}, "Recent Achievements"), el("span", { class: "ic" }, "🏆")]),
        recentAch.length
          ? el("div", { style: "display:flex;flex-direction:column;gap:4px;" }, recentAch.map(a => el("div", { class: "ach-card unlocked", style: "padding:8px;" }, [
              el("div", { class: "ic" }, a.icon),
              el("div", { class: "info" }, [el("div", { class: "name" }, a.name), el("div", { class: "desc" }, a.desc)]),
            ])))
          : el("p", { style: "color:var(--text-2);font-size:.85rem;" }, "Play games to start earning achievements."),
        el("a", { class: "btn btn-ghost btn-sm", href: "#/achievements", style: "margin-top:10px;" }, "View All"),
      ]),
    ]),
  ]));
}

function statBox(val, label) { return el("div", { class: "card stat-box" }, [el("b", {}, val), el("span", {}, label)]); }

export default renderProfile;
