// ==========================================================================
// MetaProgress — permanent, between-run upgrades.
//
// The defense games are built to be ground: a run ends, you bank a currency
// earned from how deep you got, and you spend it on upgrades that make the
// next run start stronger. Everything lives in the normal save file under
// the game's own `custom.meta`, so it survives like any other progress.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { audioManager } from "./audioManager.js";
import { el, formatNumber } from "../core/utils.js";
import { openModal, closeModal } from "../ui/modal.js";

export class MetaProgress {
  /**
   * @param {string} gameId
   * @param {Object} cfg
   * @param {string} cfg.currency      display name, e.g. "Rift Shards"
   * @param {string} cfg.icon          emoji shown next to the amount
   * @param {Array}  cfg.nodes         [{ id, name, desc, icon, max, cost(lv), value(lv), suffix }]
   */
  constructor(gameId, cfg) {
    this.gameId = gameId;
    this.cfg = cfg;
    this.nodes = cfg.nodes;
    this.byId = Object.fromEntries(cfg.nodes.map(n => [n.id, n]));
  }

  get _store() {
    const custom = saveManager.ensureGame(this.gameId).custom;
    if (!custom.meta) custom.meta = { cur: 0, lv: {}, earned: 0, runs: 0 };
    if (typeof custom.meta.cur !== "number") custom.meta.cur = 0;
    if (!custom.meta.lv) custom.meta.lv = {};
    return custom.meta;
  }

  get currency() { return Math.floor(this._store.cur); }
  get lifetimeEarned() { return Math.floor(this._store.earned || 0); }
  get runs() { return this._store.runs || 0; }

  level(id) { return this._store.lv[id] || 0; }
  maxLevel(id) { return this.byId[id]?.max ?? 0; }
  isMaxed(id) { return this.level(id) >= this.maxLevel(id); }

  /** Cost of the *next* level, or null when maxed. */
  cost(id) {
    if (this.isMaxed(id)) return null;
    return Math.round(this.byId[id].cost(this.level(id)));
  }

  /** The upgrade's current effect — what the game actually reads. */
  value(id) {
    const node = this.byId[id];
    return node ? node.value(this.level(id)) : 0;
  }

  canAfford(id) {
    const c = this.cost(id);
    return c !== null && this.currency >= c;
  }

  buy(id) {
    if (!this.canAfford(id)) return false;
    const store = this._store;
    store.cur -= this.cost(id);
    store.lv[id] = this.level(id) + 1;
    saveManager.save();
    audioManager.play("levelup");
    return true;
  }

  /** Banked at the end of a run. */
  award(amount) {
    const n = Math.max(0, Math.round(amount));
    if (!n) return 0;
    const store = this._store;
    store.cur += n;
    store.earned = (store.earned || 0) + n;
    store.runs = (store.runs || 0) + 1;
    saveManager.save();
    return n;
  }

  /** Wipes every purchase and refunds the full lifetime total. */
  respec() {
    const store = this._store;
    store.cur = this.lifetimeEarned;
    store.lv = {};
    saveManager.save();
  }

  // ------------------------------------------------------------------ UI --
  /** The upgrade shop, opened from a game's start screen. */
  openShop(onClose) {
    audioManager.play("click");
    const body = el("div", { class: "meta-shop" });
    const header = el("div", { class: "meta-balance" });

    const renderBalance = () => {
      header.innerHTML = "";
      header.append(
        el("span", { class: "amount" }, `${this.cfg.icon} ${formatNumber(this.currency)}`),
        el("span", { class: "label" }, this.cfg.currency),
        el("span", { class: "runs" }, `${this.runs} run${this.runs === 1 ? "" : "s"} banked`),
      );
    };

    const list = el("div", { class: "meta-list" });
    const renderList = () => {
      list.innerHTML = "";
      for (const node of this.nodes) {
        const lv = this.level(node.id);
        const maxed = this.isMaxed(node.id);
        const cost = this.cost(node.id);
        const afford = this.canAfford(node.id);

        const pips = el("div", { class: "pips" });
        for (let i = 0; i < node.max; i++) {
          pips.appendChild(el("span", { class: `pip${i < lv ? " on" : ""}` }));
        }

        const btn = el("button", {
          class: `btn ${maxed ? "btn-outline" : afford ? "btn-primary" : "btn-ghost"} btn-sm`,
          disabled: maxed || !afford,
          onClick: () => { if (this.buy(node.id)) { renderBalance(); renderList(); } },
        }, maxed ? "Maxed" : `${this.cfg.icon} ${formatNumber(cost)}`);

        list.appendChild(el("div", { class: `meta-node${maxed ? " maxed" : ""}` }, [
          el("div", { class: "ic" }, node.icon),
          el("div", { class: "body" }, [
            el("div", { class: "row" }, [
              el("b", {}, node.name),
              el("span", { class: "lv" }, `Lv ${lv}/${node.max}`),
            ]),
            el("p", {}, node.desc),
            el("div", { class: "row" }, [
              pips,
              el("span", { class: "eff" }, this._effectLabel(node)),
            ]),
          ]),
          btn,
        ]));
      }
    };

    renderBalance();
    renderList();
    body.append(header, list);

    const footer = el("div", { style: "display:flex;gap:10px;" }, [
      el("button", {
        class: "btn btn-ghost btn-sm",
        onClick: () => { this.respec(); renderBalance(); renderList(); audioManager.play("toggle"); },
      }, "Refund all"),
      el("button", { class: "btn btn-primary", onClick: () => { closeModal(); onClose?.(); } }, "Done"),
    ]);

    openModal({ title: `Upgrades — ${this.cfg.currency}`, bodyNode: body, footerNode: footer });
  }

  _effectLabel(node) {
    // One-shot unlocks read better as words than as "+0 → +1".
    if (node.unlock) return this.level(node.id) ? "Unlocked" : "Locked → Unlocked";
    const now = node.value(this.level(node.id));
    const fmt = (v) => (node.suffix === "%" ? `+${Math.round(v * 100)}%` : `${node.prefix || "+"}${Math.round(v * 10) / 10}${node.suffix || ""}`);
    if (this.isMaxed(node.id)) return fmt(now);
    const next = node.value(this.level(node.id) + 1);
    return `${fmt(now)} → ${fmt(next)}`;
  }
}

/**
 * Shared reward curve: going deeper pays far better than going wide, which is
 * what makes another attempt worth it.
 */
export function runReward({ wave = 0, kills = 0, bonus = 0 }) {
  return Math.floor(Math.pow(Math.max(0, wave), 1.35) * 2 + kills * 0.35 + bonus);
}

export default MetaProgress;
