// ==========================================================================
// EventBus — tiny pub/sub used to decouple systems, UI and games.
// ==========================================================================
class EventBus {
  constructor() { this._listeners = new Map(); }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  once(event, handler) {
    const off = this.on(event, (...args) => { off(); handler(...args); });
    return off;
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    // copy to avoid mutation issues if a handler subscribes/unsubscribes mid-emit
    [...set].forEach(fn => {
      try { fn(payload); } catch (err) { console.error(`[EventBus] handler for "${event}" threw`, err); }
    });
  }
}

export const eventBus = new EventBus();
export default eventBus;
