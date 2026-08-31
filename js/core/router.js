// ==========================================================================
// Router — tiny hash-based SPA router.
// Routes are registered as `/path/:param` patterns mapped to async render fns.
// ==========================================================================
import { eventBus } from "./eventBus.js";

class Router {
  constructor() {
    this.routes = [];
    this.notFound = null;
    this.current = null;
    window.addEventListener("hashchange", () => this._resolve());
  }

  register(pattern, handler) {
    const paramNames = [];
    const regexStr = pattern.replace(/:[^/]+/g, (m) => {
      paramNames.push(m.slice(1));
      return "([^/]+)";
    });
    const regex = new RegExp(`^${regexStr}$`);
    this.routes.push({ pattern, regex, paramNames, handler });
    return this;
  }

  setNotFound(handler) { this.notFound = handler; return this; }

  start() {
    if (!location.hash) location.hash = "#/home";
    this._resolve();
  }

  navigate(path) { location.hash = `#${path}`; }

  _currentPath() {
    const hash = location.hash || "#/home";
    return hash.slice(1).split("?")[0] || "/home";
  }

  _query() {
    const hash = location.hash || "";
    const qIdx = hash.indexOf("?");
    const params = new URLSearchParams(qIdx >= 0 ? hash.slice(qIdx + 1) : "");
    return Object.fromEntries(params.entries());
  }

  async _resolve() {
    const path = this._currentPath();
    const query = this._query();
    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
        this.current = { path, params, query };
        eventBus.emit("route:before", this.current);
        try {
          await route.handler({ params, query, path });
        } catch (err) {
          console.error("[Router] handler error", err);
        }
        eventBus.emit("route:after", this.current);
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
        return;
      }
    }
    if (this.notFound) this.notFound({ path, query });
  }
}

export const router = new Router();
export default router;
