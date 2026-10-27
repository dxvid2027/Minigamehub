// ==========================================================================
// Secret codes — a typed code unlocks a game that is otherwise hidden from
// the library. One code, one game: anything else is simply rejected.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { eventBus } from "../core/eventBus.js";
import { SECRET_GAMES } from "../../data/games.js";

const CODES = {
  SEAN: "golden-goal",
  SEANALPHA: "dragonheart",
};

/**
 * Codes are forgiving about case, spaces and dashes, never about the
 * letters and digits themselves.
 */
function normalize(code) { return String(code || "").toUpperCase().replace(/[\s\-_]+/g, ""); }
const LOOKUP = Object.fromEntries(Object.entries(CODES).map(([c, id]) => [normalize(c), id]));

function unlockedList() {
  const p = saveManager.data.profile;
  if (!Array.isArray(p.unlockedSecrets)) p.unlockedSecrets = [];
  return p.unlockedSecrets;
}

export function isSecretUnlocked(gameId) { return unlockedList().includes(gameId); }

/** Secret games the player has opened, in registry order. */
export function unlockedSecretGames() {
  return SECRET_GAMES.filter(g => isSecretUnlocked(g.id));
}

/**
 * Tries a code. Returns { ok:false } for a wrong code, otherwise the game it
 * opens and whether it was already open.
 */
export function redeemCode(code) {
  const gameId = LOOKUP[normalize(code)];
  const game = gameId && SECRET_GAMES.find(g => g.id === gameId);
  if (!game) return { ok: false };
  const list = unlockedList();
  const already = list.includes(game.id);
  if (!already) {
    list.push(game.id);
    saveManager.saveNow();
    eventBus.emit("secret:unlocked", { gameId: game.id });
  }
  return { ok: true, game, already };
}

export default { redeemCode, isSecretUnlocked, unlockedSecretGames };
