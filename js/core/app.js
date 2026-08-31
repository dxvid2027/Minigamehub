// ==========================================================================
// App bootstrap — wires up systems, navigation, background FX and routing.
// ==========================================================================
import { router } from "./router.js";
import { eventBus } from "./eventBus.js";
import { saveManager } from "../systems/saveManager.js";
import { settingsManager } from "../systems/settingsManager.js";
import { achievementSystem } from "../systems/achievementSystem.js";
import { dailyChallengeSystem } from "../systems/dailyChallenge.js";
import { audioManager } from "../systems/audioManager.js";
import { BackgroundFX } from "../systems/particleSystem.js";
import { initNavigation } from "../ui/navigation.js";
import { toastAchievement, toastLevelUp, toast } from "../ui/toast.js";

function boot() {
  settingsManager.applyAll();
  achievementSystem.init();
  dailyChallengeSystem.init();
  initNavigation();

  const bg = new BackgroundFX(document.getElementById("bg-canvas"));
  bg.start();
  // While a game is on screen the ambient background is invisible behind the
  // stage, so it is parked to give the game the whole frame budget.
  eventBus.on("route:after", ({ path }) => {
    if (path.startsWith("/play/")) bg.pause(); else bg.resume();
  });

  eventBus.on("achievement:unlocked", (ach) => { toastAchievement(ach); audioManager.play("achievement"); });
  eventBus.on("level:up", ({ level }) => { toastLevelUp(level); audioManager.play("levelup"); });
  eventBus.on("reward:unlocked", ({ grants }) => {
    grants.forEach(g => {
      if (g.type === "theme") toast({ type: "success", title: "New Theme Unlocked!", message: `The "${g.value}" theme is now available in Settings.` });
      if (g.type === "avatar") toast({ type: "success", title: "New Avatar Unlocked!", message: `${g.value} is now available on your Profile.` });
    });
  });
  eventBus.on("daily:completed", ({ coins, xp, streak }) => {
    toast({ type: "success", title: "Daily Challenges Complete!", message: `+${coins} coins, +${xp} XP · ${streak}-day streak` });
  });
  eventBus.on("save:error", () => {
    toast({ type: "error", title: "Save failed", message: "Your browser storage may be full or private-browsing is blocking it." });
  });

  registerRoutes();
  router.start();

  const loader = document.getElementById("boot-loader");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    loader.classList.add("hide");
    setTimeout(() => loader.remove(), 500);
  }));

  window.addEventListener("beforeunload", () => saveManager.saveNow());
  setInterval(() => saveManager.saveNow(), 15000);

  registerServiceWorker();
}

// Registers the offline/installable service worker. Skipped on file:// where
// service workers are unavailable.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("../../sw.js", import.meta.url), { scope: "./" })
      .catch((err) => console.warn("[app] service worker registration failed", err));
  });
}

function outlet() { return document.getElementById("page-outlet"); }

function registerRoutes() {
  router
    .register("/home", async () => {
      const { renderHome } = await import("../ui/pages/home.js");
      renderHome(outlet());
    })
    .register("/library", async ({ query }) => {
      const { renderLibrary } = await import("../ui/pages/library.js");
      renderLibrary(outlet(), query);
    })
    .register("/profile", async () => {
      const { renderProfile } = await import("../ui/pages/profile.js");
      renderProfile(outlet());
    })
    .register("/achievements", async () => {
      const { renderAchievements } = await import("../ui/pages/achievements.js");
      renderAchievements(outlet());
    })
    .register("/statistics", async () => {
      const { renderStatistics } = await import("../ui/pages/statistics.js");
      renderStatistics(outlet());
    })
    .register("/settings", async () => {
      const { renderSettings } = await import("../ui/pages/settings.js");
      renderSettings(outlet());
    })
    .register("/play/:id", async ({ params }) => {
      const { renderPlay } = await import("../ui/pages/play.js");
      renderPlay(outlet(), params.id);
    })
    .setNotFound(() => router.navigate("/home"));
}

// Tear down any active game instance when the route changes away from /play.
eventBus.on("route:before", async (next) => {
  if (!next.path.startsWith("/play/")) {
    const { disposeActiveGame } = await import("../ui/pages/play.js");
    disposeActiveGame();
  }
});

document.addEventListener("DOMContentLoaded", boot);
