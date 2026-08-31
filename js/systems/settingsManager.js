// ==========================================================================
// SettingsManager — applies persisted settings to the document root so
// theming / accessibility toggles take effect immediately and on boot.
// ==========================================================================
import { saveManager } from "./saveManager.js";
import { eventBus } from "../core/eventBus.js";

const THEME_LABELS = { dark: "Midnight", light: "Daylight", crimson: "Crimson", emerald: "Emerald", royal: "Royal Violet" };

class SettingsManager {
  applyAll() {
    const s = saveManager.data.settings;
    const root = document.documentElement;
    root.setAttribute("data-theme", s.theme || "dark");
    root.setAttribute("data-colorblind", s.colorblindMode || "none");
    root.setAttribute("data-contrast", s.highContrast ? "high" : "normal");
    root.setAttribute("data-reduced-motion", s.reducedMotion ? "true" : "false");
    root.style.setProperty("--ui-scale", s.uiScale || 1);
  }

  set(key, value) {
    saveManager.data.settings[key] = value;
    saveManager.save();
    this.applyAll();
    eventBus.emit("settings:changed", { key, value });
  }

  themeLabel(id) { return THEME_LABELS[id] || id; }
  themeOptions() { return Object.keys(THEME_LABELS); }
}

export const settingsManager = new SettingsManager();
export default settingsManager;
