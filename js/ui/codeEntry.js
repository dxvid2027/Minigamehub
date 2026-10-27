// ==========================================================================
// Code entry — the small form that redeems a secret code. Used as a modal
// from the library and inline on the settings page.
// ==========================================================================
import { el } from "../core/utils.js";
import { redeemCode } from "../systems/secretCodes.js";
import { audioManager } from "../systems/audioManager.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";

/**
 * Builds the input + button. `onUnlock(game)` runs after a correct code.
 */
export function codeForm({ onUnlock } = {}) {
  const input = el("input", {
    class: "text-input code-input", type: "text", placeholder: "Enter code",
    autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "48",
    "aria-label": "Secret code",
  });
  const msg = el("div", { class: "code-msg", "aria-live": "polite" });
  const submit = () => {
    const res = redeemCode(input.value);
    if (!res.ok) {
      audioManager.play("error");
      msg.className = "code-msg bad";
      msg.textContent = "That code doesn't unlock anything.";
      input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
      input.select();
      return;
    }
    audioManager.play("achievement");
    msg.className = "code-msg good";
    msg.textContent = res.already ? `${res.game.title} is already unlocked.` : `Unlocked: ${res.game.emoji} ${res.game.title}!`;
    if (!res.already) toast({ type: "success", title: "Secret game unlocked!", message: `${res.game.emoji} ${res.game.title} is now in your library.` });
    input.value = "";
    onUnlock?.(res.game, res.already);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  const btn = el("button", { class: "btn btn-primary", type: "button", onClick: submit }, "Redeem");
  return { node: el("div", { class: "code-form" }, [el("div", { class: "code-row" }, [input, btn]), msg]), input };
}

/** Opens the code form in a modal; a correct code offers to play right away. */
export function openCodeModal({ onUnlock } = {}) {
  audioManager.play("click");
  const play = el("a", { class: "btn btn-primary", hidden: true, onClick: () => closeModal() }, "Play now");
  const { node, input } = codeForm({
    onUnlock: (game, already) => { onUnlock?.(game, already); play.href = `#/play/${game.id}`; play.hidden = false; play.textContent = `Play ${game.title}`; },
  });
  openModal({
    title: "Secret code",
    bodyNode: el("div", {}, [
      el("p", { style: "margin-top:0;" }, "Got a code? Type it in to unlock a hidden game."),
      node,
    ]),
    footerNode: el("div", { style: "display:flex;gap:10px;" }, [
      el("button", { class: "btn btn-ghost", onClick: () => closeModal() }, "Close"),
      play,
    ]),
  });
  setTimeout(() => input.focus(), 30);
}

export default openCodeModal;
