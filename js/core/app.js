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
import { disposeActiveGame } from "../ui/pages/play.js";
import { GAMES } from "../../data/games.js";

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

  // Stamp the "recently added" window for any game flagged as a new arrival.
  GAMES.filter(g => g.addedAt).forEach(g => saveManager.markSeen(g.id));

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
  // Each page module is imported on demand; `token` guards against a slow
  // import landing after the player has already navigated elsewhere.
  const page = (loader, render) => async (ctx) => {
    const mod = await loader();
    if (router.isStale(ctx.token)) return;
    render(mod, ctx);
  };

  router
    .register("/home", page(() => import("../ui/pages/home.js"), (m) => m.renderHome(outlet())))
    .register("/library", page(() => import("../ui/pages/library.js"), (m, ctx) => m.renderLibrary(outlet(), ctx.query)))
    .register("/profile", page(() => import("../ui/pages/profile.js"), (m) => m.renderProfile(outlet())))
    .register("/achievements", page(() => import("../ui/pages/achievements.js"), (m) => m.renderAchievements(outlet())))
    .register("/statistics", page(() => import("../ui/pages/statistics.js"), (m) => m.renderStatistics(outlet())))
    .register("/settings", page(() => import("../ui/pages/settings.js"), (m) => m.renderSettings(outlet())))
    .register("/play/:id", page(() => import("../ui/pages/play.js"), (m, ctx) => m.renderPlay(outlet(), ctx.params.id, ctx.token)))
    .setNotFound(() => router.navigate("/home"));
}

// Tear down any active game instance when the route changes away from /play.
// Imported statically: awaiting an import here would let the teardown land
// after the *next* game had already mounted, destroying the wrong instance.
eventBus.on("route:before", (next) => {
  if (!next.path.startsWith("/play/")) disposeActiveGame();
});

document.addEventListener("DOMContentLoaded", boot);
