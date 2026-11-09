// ==========================================================================
// Chess ranked ladder — tiers with three divisions each, named bots for every
// tier, rewards along the way, and the Ranked Path: a winding road from
// Bronze III to Grandmaster that shows where you stand and what comes next.
// ==========================================================================
import { el } from "../core/utils.js";
import { openModal, closeModal } from "../ui/modal.js";
import { pieceSVG } from "./chessArt.js";

export const TIERS = [
  { name: "Bronze",      min: 0,    floor: 650, icon: "🥉", color: "#c98a5a" },
  { name: "Silver",      min: 900,  icon: "🥈", color: "#c0c8d8" },
  { name: "Gold",        min: 1100, icon: "🥇", color: "#ffd76a" },
  { name: "Platinum",    min: 1300, icon: "💠", color: "#5ae8d0" },
  { name: "Diamond",     min: 1500, icon: "💎", color: "#7ab8ff" },
  { name: "Master",      min: 1700, icon: "👑", color: "#c08bff" },
  { name: "Grandmaster", min: 2000, icon: "🏆", color: "#ff7a5a", top: true },
];
const DIVS = ["III", "II", "I"];

export const tierOf = (r) => [...TIERS].reverse().find(t => r >= t.min);
export const tierIdx = (name) => TIERS.findIndex(t => t.name === name);

/** Tier, division and progress through the division for a rating. */
export function rankInfo(r) {
  const t = tierOf(r);
  const i = TIERS.indexOf(t);
  if (t.top) return { tier: t, div: "", label: `${t.icon} ${t.name}`, progress: Math.min(1, (r - t.min) / 300), next: null, idx: i * 3 };
  const lo = t.floor ?? t.min, hi = TIERS[i + 1].min, step = (hi - lo) / 3;
  const d = Math.max(0, Math.min(2, Math.floor((r - lo) / step)));
  const progress = Math.max(0, Math.min(1, (r - lo - d * step) / step));
  const nextAt = Math.round(lo + (d + 1) * step);
  return { tier: t, div: DIVS[d], label: `${t.icon} ${t.name} ${DIVS[d]}`, progress, next: nextAt, idx: i * 3 + d };
}

/** Every step on the road, bottom to top. */
export function pathNodes() {
  const out = [];
  TIERS.forEach((t, i) => {
    if (t.top) { out.push({ tier: t, div: "", at: t.min, idx: i * 3 }); return; }
    const lo = t.floor ?? t.min, step = (TIERS[i + 1].min - lo) / 3;
    DIVS.forEach((div, d) => out.push({ tier: t, div, at: Math.round(d === 0 ? t.min : lo + d * step), idx: i * 3 + d }));
  });
  return out;
}

// Rewards unlock when your peak reaches the tier.
export const REWARDS = {
  Silver:      [{ kind: "material", id: "lava", name: "Lava pieces" }],
  Gold:        [{ kind: "board", id: "royal", name: "Royal board" }],
  Platinum:    [{ kind: "material", id: "ice", name: "Ice pieces" }, { kind: "board", id: "glacier", name: "Glacier board" }],
  Diamond:     [{ kind: "material", id: "aurora", name: "Aurora pieces" }, { kind: "board", id: "inferno", name: "Inferno board" }],
  Master:      [{ kind: "material", id: "galaxy", name: "Galaxy pieces" }, { kind: "board", id: "galaxy", name: "Galaxy board" }],
  Grandmaster: [{ kind: "board", id: "champion", name: "Champion board" }, { kind: "title", id: "gm", name: "Grandmaster crown" }],
};

// Two opponents per tier, each with a playing style.
export const BOTS = {
  Bronze:      [{ name: "Rookie Rolf", emoji: "🐣", style: "random" }, { name: "Pawn-Pusher Pia", emoji: "🐢", style: "pawns" }],
  Silver:      [{ name: "Knightly Nils", emoji: "🐴", style: "knights" }, { name: "Bishop Bea", emoji: "🦉", style: "solid" }],
  Gold:        [{ name: "Gambit Greta", emoji: "🦊", style: "aggressive" }, { name: "Castle Carl", emoji: "🏰", style: "solid" }],
  Platinum:    [{ name: "Tactician Tomo", emoji: "🐍", style: "aggressive" }, { name: "Endgame Emma", emoji: "🐺", style: "solid" }],
  Diamond:     [{ name: "Grandmaster Gus", emoji: "🦅", style: "solid" }, { name: "Zugzwang Zoe", emoji: "🐉", style: "aggressive" }],
  Master:      [{ name: "Deep Dora", emoji: "🧠", style: "solid" }, { name: "Blitz Baron", emoji: "🦁", style: "aggressive" }],
  Grandmaster: [{ name: "The Machine", emoji: "🤖", style: "solid" }],
};
export const STYLE_TEXT = {
  random: "plays on instinct", pawns: "loves pushing pawns", knights: "jumps knights everywhere",
  solid: "plays solid and safe", aggressive: "attacks at every chance",
};

export function pickBot(rating) {
  const t = tierOf(rating);
  const list = BOTS[t.name];
  return { ...list[Math.floor(Math.random() * list.length)], tier: t };
}

/**
 * The Ranked Path. With `anim` ({ from, to, delta, promoted, demoted }) the
 * marker slides from the old position to the new one after a game.
 */
export function openRankPath(store, design, { anim, onPlay } = {}) {
  const nodes = pathNodes();
  const cur = rankInfo(store.rating);
  const peak = rankInfo(store.peak);
  const H = 92;                                 // vertical spacing per node
  const W = 320;
  const total = nodes.length * H + 60;
  const xOf = (i) => W / 2 + Math.sin(i * 0.9) * 95;
  const yOf = (i) => total - 50 - i * H;

  const road = el("div", { class: "rp-road", style: `height:${total}px` });
  // The road itself.
  const pts = nodes.map((_, i) => `${xOf(i)},${yOf(i)}`).join(" ");
  const doneTo = Math.max(0, cur.idx);
  const donePts = nodes.slice(0, doneTo + 1).map((_, i) => `${xOf(i)},${yOf(i)}`).join(" ");
  road.innerHTML = `<svg class="rp-svg" viewBox="0 0 ${W} ${total}" preserveAspectRatio="xMidYMin meet" style="height:${total}px">
    <polyline points="${pts}" fill="none" stroke="#ffffff18" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${pts}" fill="none" stroke="#ffffff22" stroke-width="2" stroke-dasharray="6 8"/>
    <polyline points="${donePts}" fill="none" stroke="url(#rpg)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <defs><linearGradient id="rpg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c98a5a"/><stop offset=".5" stop-color="#ffd76a"/><stop offset="1" stop-color="#c08bff"/></linearGradient></defs>
  </svg>`;

  nodes.forEach((n, i) => {
    const reached = n.idx <= peak.idx, here = n.idx === cur.idx;
    const first = n.div === "III" || n.div === "";
    const node = el("div", {
      class: `rp-node${reached ? " got" : ""}${here ? " here" : ""}${first ? " big" : ""}`,
      style: `left:${(xOf(i) / W) * 100}%;top:${yOf(i)}px;--tc:${n.tier.color}`,
    }, [
      el("span", { class: "rp-dot" }, first ? n.tier.icon : n.div),
      el("span", { class: `rp-lbl ${xOf(i) > W / 2 ? "l" : "r"}` }, [
        el("b", {}, `${n.tier.name}${n.div ? " " + n.div : ""}`),
        el("small", {}, `${n.at}+`),
        first && REWARDS[n.tier.name] ? el("span", { class: "rp-rw" }, REWARDS[n.tier.name].map(rw => el("i", { class: reached ? "ok" : "" }, `${reached ? "✔" : "🎁"} ${rw.name}`))) : null,
      ]),
    ]);
    road.appendChild(node);
  });

  // "You" marker with your king.
  const me = el("div", { class: "rp-me" });
  me.innerHTML = pieceSVG("k", "w", design, "rp");
  road.appendChild(me);
  const place = (rating) => {
    const ri = rankInfo(rating);
    const i = nodes.findIndex(n => n.idx === ri.idx);
    const j = Math.min(nodes.length - 1, i + 1);
    const f = nodes[i].tier.top ? 0 : ri.progress;
    const x = xOf(i) + (xOf(j) - xOf(i)) * f, y = yOf(i) + (yOf(j) - yOf(i)) * f;
    me.style.left = `${(x / W) * 100}%`; me.style.top = `${y}px`;
    return y;
  };

  const head = el("div", { class: "rp-head", style: `--tc:${cur.tier.color}` }, [
    el("div", { class: "rp-badge" }, cur.tier.icon),
    el("div", { class: "rp-info" }, [
      el("b", {}, `${cur.tier.name} ${cur.div}`.trim()),
      el("span", {}, `Rating ${store.rating} · peak ${store.peak}${cur.next ? ` · next division at ${cur.next}` : ""}`),
      el("div", { class: "rp-bar" }, [el("i", { style: `width:${Math.round(cur.progress * 100)}%` })]),
      el("span", { class: "rp-chips" }, [
        store.games < 5 ? el("em", {}, `Placement ${store.games}/5`) : null,
        store.streak >= 2 ? el("em", { class: "fire" }, `🔥 ${store.streak} win streak`) : null,
        store.shield > 0 ? el("em", {}, `🛡 Demotion shield ×${store.shield}`) : null,
        el("em", {}, `${store.wins}W ${store.losses}L ${store.draws}D`),
      ]),
    ]),
  ]);

  let banner = null;
  if (anim) {
    const cls = anim.promoted ? "up" : anim.demoted ? "down" : anim.delta >= 0 ? "win" : "loss";
    const txt = anim.promoted ? `PROMOTED — ${rankInfo(anim.to).label}!` : anim.demoted ? `Demoted to ${rankInfo(anim.to).label}` : `${anim.delta >= 0 ? "+" : ""}${anim.delta} rating`;
    banner = el("div", { class: `rp-banner ${cls}` }, [el("b", {}, txt), anim.notes?.length ? el("span", {}, anim.notes.join(" · ")) : null, anim.unlocked?.length ? el("span", { class: "rw" }, `🎁 Unlocked: ${anim.unlocked.join(", ")}`) : null]);
  }

  const hist = el("div", { class: "rp-hist" }, (store.history || []).slice(-12).reverse().map(h => el("span", { class: `rp-h ${h.r}`, title: `${h.opp} · ${h.d >= 0 ? "+" : ""}${h.d}` }, [el("b", {}, h.r.toUpperCase()), el("small", {}, `${h.e || ""} ${h.d >= 0 ? "+" : ""}${h.d}`)])));

  const scroller = el("div", { class: "rp-scroll" }, [road]);
  const body = el("div", { class: "rank-path" }, [banner, head, store.history?.length ? el("div", { class: "rp-sub" }, "Recent games") : null, store.history?.length ? hist : null, scroller]);

  openModal({
    title: "🏆 Ranked Path",
    bodyNode: body,
    footerNode: el("div", { class: "modal-foot" }, [
      onPlay ? el("button", { class: "btn btn-primary", onClick: () => { closeModal(); onPlay(); } }, "Play ranked") : null,
      el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Close"),
    ].filter(Boolean)),
  });

  // Scroll to the marker, then animate it if a game just finished.
  requestAnimationFrame(() => {
    const y = place(anim ? anim.from : store.rating);
    scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 2);
    if (anim) setTimeout(() => {
      me.classList.add("moving");
      const y2 = place(anim.to);
      scroller.scrollTo({ top: Math.max(0, y2 - scroller.clientHeight / 2), behavior: "smooth" });
    }, 500);
  });
}
