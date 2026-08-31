// ==========================================================================
// MegaPlay Hub service worker.
//
// Strategy:
//   • navigations  → network-first (so a fresh deploy is picked up straight
//                    away), falling back to the cached shell when offline
//   • everything   → stale-while-revalidate: instant from cache, refreshed in
//     else           the background for the next visit
//
// Bump CACHE_VERSION whenever the shell changes in a breaking way; old caches
// are deleted on activate.
// ==========================================================================
const CACHE_VERSION = "megaplay-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/variables.css",
  "./css/base.css",
  "./css/components.css",
  "./css/pages.css",
  "./css/games.css",
  "./css/animations.css",
  "./js/core/app.js",
  "./js/core/router.js",
  "./js/core/eventBus.js",
  "./js/core/utils.js",
  "./js/systems/saveManager.js",
  "./js/systems/progression.js",
  "./js/systems/achievementSystem.js",
  "./js/systems/dailyChallenge.js",
  "./js/systems/statsManager.js",
  "./js/systems/audioManager.js",
  "./js/systems/particleSystem.js",
  "./js/systems/inputManager.js",
  "./js/systems/settingsManager.js",
  "./js/ui/navigation.js",
  "./js/ui/gameCard.js",
  "./js/ui/toast.js",
  "./js/ui/modal.js",
  "./js/ui/pages/home.js",
  "./js/ui/pages/library.js",
  "./js/ui/pages/play.js",
  "./data/games.js",
  "./data/achievements.js",
  "./data/dailyChallenges.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll is atomic — one bad entry would fail the whole install, so add
      // each file independently and tolerate individual misses.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
