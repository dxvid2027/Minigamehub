// ==========================================================================
// Play page — loads the requested game module and mounts it via GameBase.
// ==========================================================================
import { getGame } from "../../../data/games.js";
import { el } from "../../core/utils.js";
import { router } from "../../core/router.js";

let activeGame = null;

/** The game currently mounted, or null. Used by tooling and debugging. */
export function getActiveGame() { return activeGame; }

export function disposeActiveGame() {
  if (activeGame) {
    try { activeGame.destroy(); } catch (err) { console.error("[play] destroy failed", err); }
    activeGame = null;
  }
  // Mobile hides the top bar and bottom nav while a game is mounted; both
  // come back the moment we leave.
  document.body.classList.remove("in-game");
}

export async function renderPlay(container, gameId, token) {
  disposeActiveGame();
  const meta = getGame(gameId);
  if (!meta) {
    container.innerHTML = "";
    container.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "ic" }, "🕹️"),
      el("h3", {}, "Game not found"),
      el("p", {}, "That game doesn't exist yet. Try another one from the library."),
      el("a", { class: "btn btn-primary", href: "#/library" }, "Browse Library"),
    ]));
    return;
  }

  container.innerHTML = "";
  const wrap = el("div", { class: "play-wrap" });
  const loading = el("div", { class: "empty-state" }, [el("div", { class: "spinner", style: "margin: 0 auto 14px;" }), el("p", {}, `Loading ${meta.title}…`)]);
  container.append(wrap);
  wrap.appendChild(loading);

  try {
    const mod = await import(/* @vite-ignore */ meta.module);
    const GameClass = mod[meta.exportName] || mod.default;
    if (!GameClass) throw new Error(`Export "${meta.exportName}" not found in ${meta.module}`);
    // Bail out if the player navigated away while the module was loading.
    if (router.current?.path !== `/play/${gameId}`) return;
    if (token !== undefined && router.isStale(token)) return;
    loading.remove();
    activeGame = new GameClass({ root: wrap, meta });
    document.body.classList.add("in-game");
  } catch (err) {
    console.error("[play] failed to load game", err);
    loading.innerHTML = "";
    loading.append(
      el("div", { class: "ic" }, "⚠️"),
      el("h3", {}, "This game couldn't load"),
      el("p", {}, "Please try again or pick another game."),
      el("a", { class: "btn btn-primary", href: "#/library" }, "Browse Library"),
    );
  }
}

export default renderPlay;
