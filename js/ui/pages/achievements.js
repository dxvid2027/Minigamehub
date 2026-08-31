// ==========================================================================
// Achievements page — categories, progress tracking, rewards, completion %.
// ==========================================================================
import { achievementSystem } from "../../systems/achievementSystem.js";
import { saveManager } from "../../systems/saveManager.js";
import { el, formatNumber } from "../../core/utils.js";
import { iconMarkup } from "../icons.js";

function lockIcon() {
  const s = el("span", { style: "display:inline-flex;color:var(--text-3);" });
  s.innerHTML = iconMarkup("lock");
  return s;
}

function drawRing(canvas, pct) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 84 * dpr; canvas.height = 84 * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const cx = 42, cy = 42, r = 34;
  ctx.lineWidth = 8; ctx.lineCap = "round";
  ctx.strokeStyle = "#ffffff1a";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, 84, 84);
  grad.addColorStop(0, "#7c5cff"); grad.addColorStop(1, "#22d3ee");
  ctx.strokeStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2); ctx.stroke();
}

function rewardChip(reward = {}) {
  const wrap = el("div", { class: "reward" });
  if (reward.coins) {
    const c = el("span", { class: "r-coin" });
    c.innerHTML = iconMarkup("coin");
    c.appendChild(document.createTextNode(String(reward.coins)));
    wrap.appendChild(c);
  }
  if (reward.xp) {
    const x = el("span", { class: "r-xp" });
    x.innerHTML = iconMarkup("star");
    x.appendChild(document.createTextNode(String(reward.xp)));
    wrap.appendChild(x);
  }
  return wrap;
}

function achCard(ach) {
  const unlocked = achievementSystem.isUnlocked(ach.id);
  const prog = achievementSystem.progressFor(ach);
  return el("div", { class: `card ach-card${unlocked ? " unlocked" : " locked"}` }, [
    el("div", { class: "ic" }, unlocked ? ach.icon : lockIcon()),
    el("div", { class: "info" }, [
      el("div", { class: "name" }, ach.name),
      el("div", { class: "desc" }, ach.desc),
      !unlocked ? el("div", { class: "pbar thin" }, el("span", { style: `width:${prog.pct}%` })) : null,
      !unlocked ? el("div", { style: "font-size:.7rem;color:var(--text-3);margin-top:4px;" }, `${formatNumber(prog.current)} / ${formatNumber(prog.target)}`) : null,
    ]),
    rewardChip(ach.reward),
  ]);
}

export function renderAchievements(container) {
  container.innerHTML = "";
  const summary = achievementSystem.summary();
  const all = achievementSystem.all();
  const state = { filter: "all", q: "" };

  const grid = el("div", { class: "ach-grid" });
  const countLbl = el("div", { class: "results-count" });

  function renderGrid() {
    let list = all;
    if (state.filter === "unlocked") list = list.filter(a => achievementSystem.isUnlocked(a.id));
    if (state.filter === "locked") list = list.filter(a => !achievementSystem.isUnlocked(a.id));
    if (state.filter === "global") list = list.filter(a => !a.gameId);
    if (state.filter === "game") list = list.filter(a => a.gameId);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter(a => `${a.name} ${a.desc}`.toLowerCase().includes(q));
    }
    // Unlocked-first, then by target ascending within each group for a natural progression feel.
    list = [...list].sort((a, b) => {
      const ua = achievementSystem.isUnlocked(a.id), ub = achievementSystem.isUnlocked(b.id);
      if (ua !== ub) return ua ? -1 : 1;
      return a.target - b.target;
    });
    countLbl.textContent = `${list.length} achievement${list.length === 1 ? "" : "s"}`;
    grid.innerHTML = "";
    list.forEach(a => grid.appendChild(achCard(a)));
  }

  const tabs = el("div", { class: "tabs" }, ["all", "unlocked", "locked", "global", "game"].map(f => {
    const labels = { all: "All", unlocked: "Unlocked", locked: "Locked", global: "Global", game: "Per-Game" };
    const btn = el("button", { class: `tab-btn${f === "all" ? " active" : ""}`, onClick: () => {
      state.filter = f;
      tabs.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderGrid();
    } }, labels[f]);
    return btn;
  }));

  const search = el("input", { class: "text-input", placeholder: "Search achievements…", style: "max-width:280px;" });
  search.addEventListener("input", () => { state.q = search.value; renderGrid(); });

  const ring = el("canvas");
  const summaryCard = el("div", { class: "card ach-summary" }, [
    el("div", { class: "ach-ring" }, [ring, el("div", { class: "pct" }, `${summary.pct}%`)]),
    el("div", { style: "flex:1;" }, [
      el("h3", { style: "margin-bottom:4px;" }, "Your Achievement Journey"),
      el("p", { style: "margin:0;" }, `You've unlocked ${summary.unlocked} of ${summary.total} achievements across the platform, earning ${formatNumber(saveManager.data.profile.achievementPoints)} achievement points.`),
    ]),
    search,
  ]);

  container.append(el("div", { class: "container" }, [
    el("div", { class: "section-title" }, [el("h2", {}, "Achievements")]),
    summaryCard,
    tabs,
    countLbl,
    grid,
  ]));

  drawRing(ring, summary.pct);
  renderGrid();
}

export default renderAchievements;
