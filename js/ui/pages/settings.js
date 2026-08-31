// ==========================================================================
// Settings page — audio, theme, accessibility, performance, data management.
// ==========================================================================
import { saveManager } from "../../systems/saveManager.js";
import { settingsManager } from "../../systems/settingsManager.js";
import { audioManager } from "../../systems/audioManager.js";
import { el } from "../../core/utils.js";
import { confirmModal } from "../modal.js";
import { toast } from "../toast.js";

function sliderRow(label, key, onInput) {
  const s = saveManager.data.settings;
  const val = el("span", { class: "val" }, Math.round(s[key] * 100) + "%");
  const slider = el("input", { type: "range", class: "slider", min: "0", max: "1", step: "0.01", value: s[key] });
  slider.addEventListener("input", () => {
    const v = parseFloat(slider.value);
    val.textContent = Math.round(v * 100) + "%";
    onInput(v);
  });
  return el("div", { class: "field" }, [el("label", {}, label), el("div", { class: "slider-row" }, [slider, val])]);
}

function switchRow(title, desc, checked, onChange) {
  const input = el("input", { type: "checkbox", checked: checked || undefined });
  input.addEventListener("change", () => onChange(input.checked));
  return el("div", { class: "switch-row" }, [
    el("div", { class: "label-block" }, [el("div", { class: "title" }, title), el("div", { class: "desc" }, desc)]),
    el("label", { class: "switch" }, [input, el("span", { class: "track" }, el("span", { class: "thumb" }))]),
  ]);
}

function panel(id, title, children, active = false) {
  return el("div", { class: `settings-panel${active ? " active" : ""}`, "data-panel": id }, [el("h3", { style: "margin-bottom:18px;" }, title), ...children]);
}

export function renderSettings(container) {
  container.innerHTML = "";
  const s = saveManager.data.settings;
  const profile = saveManager.data.profile;

  // --- Audio ---
  const audioPanel = panel("audio", "🔊 Audio", [
    sliderRow("Master Volume", "masterVolume", (v) => audioManager.setVolume("masterVolume", v)),
    sliderRow("Music Volume", "musicVolume", (v) => audioManager.setVolume("musicVolume", v)),
    sliderRow("Sound Effects", "sfxVolume", (v) => audioManager.setVolume("sfxVolume", v)),
    switchRow("Mute All", "Silence every in-game and UI sound.", s.muted, (v) => audioManager.toggleMute(v)),
  ], true);

  // --- Appearance ---
  const themeRow = el("div", { class: "field" }, [
    el("label", {}, "Theme"),
    el("div", { class: "swatch-row" }, ["dark", "light", "crimson", "emerald", "royal"].map(t => {
      const unlocked = t === "dark" || t === "light" || profile.unlockedThemes.includes(t);
      const colors = { dark: "#0a0d18", light: "#eef0f8", crimson: "#3a1420", emerald: "#0f2f28", royal: "#241c4d" };
      const sw = el("button", { class: `swatch${s.theme === t ? " active" : ""}`, style: `background:${colors[t]};`, title: settingsManager.themeLabel(t), disabled: !unlocked || undefined,
        onClick: () => { settingsManager.set("theme", t); audioManager.play("select"); document.querySelectorAll(".swatch").forEach(x => x.classList.remove("active")); sw.classList.add("active"); } },
        !unlocked ? el("div", { class: "lock" }, "🔒") : null);
      return sw;
    })),
    el("div", { class: "hint" }, "Unlock more themes by leveling up your profile."),
  ]);
  const uiScaleRow = el("div", { class: "field" }, [
    el("label", {}, "UI Scale"),
    el("div", { class: "slider-row" }, (() => {
      const val = el("span", { class: "val" }, Math.round(s.uiScale * 100) + "%");
      const slider = el("input", { type: "range", class: "slider", min: "0.85", max: "1.25", step: "0.05", value: s.uiScale });
      slider.addEventListener("input", () => { const v = parseFloat(slider.value); val.textContent = Math.round(v * 100) + "%"; settingsManager.set("uiScale", v); });
      return [slider, val];
    })()),
  ]);
  const appearancePanel = panel("appearance", "🎨 Appearance", [themeRow, uiScaleRow]);

  // --- Accessibility ---
  const colorblindRow = el("div", { class: "field" }, [
    el("label", {}, "Colorblind Mode"),
    (() => {
      const select = el("select", { class: "select" }, ["none", "protanopia", "deuteranopia", "tritanopia"].map(o => el("option", { value: o, selected: s.colorblindMode === o || undefined }, o[0].toUpperCase() + o.slice(1))));
      select.addEventListener("change", () => settingsManager.set("colorblindMode", select.value));
      return select;
    })(),
  ]);
  const accessibilityPanel = panel("accessibility", "♿ Accessibility", [
    colorblindRow,
    switchRow("High Contrast", "Increase border and text contrast across the UI.", s.highContrast, (v) => settingsManager.set("highContrast", v)),
    switchRow("Reduced Motion", "Minimize animations and transitions platform-wide.", s.reducedMotion, (v) => settingsManager.set("reducedMotion", v)),
    switchRow("Keyboard Navigation Highlight", "Show a clear focus ring while navigating with a keyboard.", s.keyboardNav, (v) => settingsManager.set("keyboardNav", v)),
    switchRow("Show Tutorials", "Display instructions and control hints before each game starts.", s.showTutorials, (v) => settingsManager.set("showTutorials", v)),
  ]);

  // --- Performance ---
  const performancePanel = panel("performance", "⚡ Performance", [
    switchRow("Particle Effects", "Confetti, explosions and trail effects in games.", s.particles, (v) => settingsManager.set("particles", v)),
    switchRow("Screen Shake", "Camera shake on impacts for extra feedback.", s.screenShake, (v) => settingsManager.set("screenShake", v)),
    el("div", { class: "field" }, [
      el("label", {}, "Default Difficulty"),
      (() => {
        const select = el("select", { class: "select" }, ["Easy", "Normal", "Hard"].map(o => el("option", { value: o, selected: s.difficulty === o.toLowerCase() || undefined }, o)));
        select.addEventListener("change", () => settingsManager.set("difficulty", select.value.toLowerCase()));
        return select;
      })(),
    ]),
  ]);

  // --- Data ---
  const dataPanel = panel("data", "💾 Save Data", [
    el("p", {}, "Your entire progress — scores, achievements, stats and settings — is stored locally in your browser. Nothing is sent to a server."),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;" }, [
      el("button", { class: "btn btn-ghost", onClick: () => {
        const blob = new Blob([saveManager.exportJSON()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "megaplayhub-save.json"; a.click();
        URL.revokeObjectURL(url);
        toast({ type: "success", title: "Save exported" });
      } }, "⬇ Export Save"),
      el("button", { class: "btn btn-ghost", onClick: () => {
        const input = document.createElement("input"); input.type = "file"; input.accept = "application/json";
        input.addEventListener("change", () => {
          const file = input.files[0]; if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const ok = saveManager.importJSON(reader.result);
            toast(ok ? { type: "success", title: "Save imported" } : { type: "error", title: "Import failed", message: "That file isn't a valid save." });
            if (ok) renderSettings(container);
          };
          reader.readAsText(file);
        });
        input.click();
      } }, "⬆ Import Save"),
      el("button", { class: "btn btn-danger", onClick: async () => {
        const ok = await confirmModal({ title: "Reset all progress?", message: "This permanently deletes your scores, achievements, coins and settings. This cannot be undone.", confirmLabel: "Delete Everything", danger: true });
        if (ok) { saveManager.resetAll(); toast({ type: "success", title: "Progress reset" }); renderSettings(container); }
      } }, "🗑 Reset All Progress"),
    ]),
  ]);

  const panels = [audioPanel, appearancePanel, accessibilityPanel, performancePanel, dataPanel];
  const navBtns = panels.map((p, i) => el("button", { class: i === 0 ? "active" : "", onClick: (e) => {
    panels.forEach(pp => pp.classList.remove("active"));
    p.classList.add("active");
    nav.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
  } }, p.querySelector("h3").textContent));
  const nav = el("div", { class: "settings-nav" }, navBtns);

  container.append(el("div", { class: "container" }, [
    el("div", { class: "section-title" }, [el("h2", {}, "Settings")]),
    el("div", { class: "settings-layout" }, [nav, el("div", { class: "card card-pad" }, panels)]),
  ]));
}

export default renderSettings;
