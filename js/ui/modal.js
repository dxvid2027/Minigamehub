// ==========================================================================
// Modal — accessible, keyboard-dismissible modal dialogs.
// ==========================================================================
import { el } from "../core/utils.js";

let activeCleanup = null;

export function openModal({ title, bodyNode, footerNode, onClose } = {}) {
  closeModal();
  const root = document.getElementById("modal-root");
  const backdrop = el("div", { class: "modal-backdrop", role: "dialog", "aria-modal": "true" });
  const modal = el("div", { class: "modal" }, [
    el("div", { class: "modal-head" }, [
      el("h3", {}, title || ""),
      el("button", { class: "icon-btn", "aria-label": "Close", onClick: () => closeModal() }, "✕"),
    ]),
    el("div", { class: "modal-body" }, bodyNode || ""),
    footerNode ? el("div", { class: "modal-foot" }, footerNode) : null,
  ]);
  backdrop.appendChild(modal);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) closeModal(); });
  const onKey = (e) => { if (e.key === "Escape") closeModal(); };
  window.addEventListener("keydown", onKey);
  root.appendChild(backdrop);
  activeCleanup = () => { window.removeEventListener("keydown", onKey); onClose?.(); };
  return backdrop;
}

export function closeModal() {
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
  if (activeCleanup) { activeCleanup(); activeCleanup = null; }
}

export function confirmModal({ title = "Are you sure?", message = "", confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const footer = document.createElement("div");
    footer.style.display = "flex"; footer.style.gap = "10px";
    const cancelBtn = el("button", { class: "btn btn-ghost", onClick: () => { closeModal(); resolve(false); } }, "Cancel");
    const okBtn = el("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, onClick: () => { closeModal(); resolve(true); } }, confirmLabel);
    footer.append(cancelBtn, okBtn);
    openModal({ title, bodyNode: el("p", {}, message), footerNode: footer, onClose: () => resolve(false) });
  });
}

export default { openModal, closeModal, confirmModal };
