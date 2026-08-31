// ==========================================================================
// Toast notifications — success / achievement / level-up / error popups.
// ==========================================================================
import { el } from "../core/utils.js";

const ICONS = { success: "✅", error: "⚠️", achievement: "🏆", levelup: "⭐", info: "ℹ️" };

export function toast({ type = "info", title, message, duration = 4200 }) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const node = el("div", { class: `toast ${type}` }, [
    el("div", { class: "ic" }, ICONS[type] || "ℹ️"),
    el("div", { class: "txt" }, [
      el("div", { class: "t1" }, title),
      message ? el("div", { class: "t2" }, message) : null,
    ]),
  ]);
  root.appendChild(node);
  const remove = () => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 220);
  };
  const t = setTimeout(remove, duration);
  node.addEventListener("click", () => { clearTimeout(t); remove(); });
  return node;
}

export function toastAchievement(ach) {
  toast({ type: "achievement", title: `Achievement Unlocked: ${ach.name}`, message: `${ach.desc}${ach.reward?.coins ? ` · +${ach.reward.coins} coins` : ""}${ach.reward?.xp ? ` · +${ach.reward.xp} XP` : ""}` });
}

export function toastLevelUp(level) {
  toast({ type: "levelup", title: `Level Up! You reached Level ${level}`, message: "Keep playing to unlock more rewards." });
}

export default toast;
