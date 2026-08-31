// ==========================================================================
// Navigation — sidebar, bottom nav, topbar wallet/avatar, search wiring.
// ==========================================================================
import { saveManager } from "../systems/saveManager.js";
import { progression } from "../systems/progression.js";
import { achievementSystem } from "../systems/achievementSystem.js";
import { audioManager } from "../systems/audioManager.js";
import { router } from "../core/router.js";
import { eventBus } from "../core/eventBus.js";
import { el, formatNumber } from "../core/utils.js";

const NAV_ITEMS = [
  { path: "/home", icon: "🏠", label: "Home" },
  { path: "/library", icon: "🎮", label: "Library" },
  { path: "/profile", icon: "👤", label: "Profile" },
  { path: "/achievements", icon: "🏆", label: "Achievements" },
  { path: "/statistics", icon: "📊", label: "Statistics" },
  { path: "/settings", icon: "⚙️", label: "Settings" },
];

function navItemNode(item, mobile = false) {
  const active = router.current?.path === item.path;
  const node = el("a", {
    class: mobile ? `bn-item${active ? " active" : ""}` : `nav-item${active ? " active" : ""}`,
    href: `#${item.path}`,
    "data-route": item.path,
    onClick: () => audioManager.play("click"),
  }, [
    el("span", { class: mobile ? "ic" : "nav-icon" }, item.icon),
    el(mobile ? "span" : "span", { class: mobile ? "" : "nav-label" }, item.label),
  ]);
  return node;
}

export function renderNav() {
  const list = document.getElementById("nav-list");
  const bottom = document.getElementById("bottom-nav");
  if (list) { list.innerHTML = ""; NAV_ITEMS.forEach(i => list.appendChild(navItemNode(i, false))); }
  if (bottom) { bottom.innerHTML = ""; NAV_ITEMS.filter(i => i.path !== "/settings").slice(0, 5).forEach(i => bottom.appendChild(navItemNode(i, true))); }
}

export function updateWallet() {
  const coinsEl = document.getElementById("topbar-coins");
  const xpEl = document.getElementById("topbar-xp");
  const avatarEl = document.getElementById("topbar-avatar");
  if (coinsEl) coinsEl.textContent = formatNumber(saveManager.data.profile.coins);
  if (xpEl) xpEl.textContent = `Lv ${saveManager.data.profile.level}`;
  if (avatarEl) avatarEl.textContent = saveManager.data.profile.avatarEmoji;
}

export function initNavigation() {
  renderNav();
  updateWallet();

  eventBus.on("route:after", renderNav);
  eventBus.on("save:changed", updateWallet);
  eventBus.on("coins:changed", updateWallet);
  eventBus.on("xp:changed", updateWallet);
  eventBus.on("level:up", updateWallet);

  const toggle = document.getElementById("nav-toggle");
  const sidebar = document.getElementById("sidebar");
  toggle?.addEventListener("click", () => {
    sidebar.classList.toggle("is-open");
    audioManager.play("click");
  });

  const muteBtn = document.getElementById("mute-btn");
  const syncMute = () => { muteBtn.textContent = saveManager.data.settings.muted ? "🔇" : "🔊"; };
  syncMute();
  muteBtn?.addEventListener("click", () => { audioManager.toggleMute(); syncMute(); });

  const search = document.getElementById("global-search");
  search?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && search.value.trim()) {
      router.navigate(`/library?q=${encodeURIComponent(search.value.trim())}`);
    }
  });

  document.body.addEventListener("mousedown", () => document.body.classList.remove("user-is-tabbing"));
  document.body.addEventListener("keydown", (e) => { if (e.key === "Tab") document.body.classList.add("user-is-tabbing"); });
}

export default initNavigation;
