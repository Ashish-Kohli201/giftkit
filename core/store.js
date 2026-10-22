// Progress storage. Namespaced, scoped, and never throws (private mode / in-app browsers can block localStorage).
// Pass { persist: false } for previews: state lives in memory only.

export function createStore(namespace, { persist = true } = {}) {
  const mem = new Map();
  const key = (k) => `gk:${namespace}:${k}`;
  return {
    get(k, fallback) {
      try {
        const raw = persist ? localStorage.getItem(key(k)) : mem.get(key(k));
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(k, v) {
      try {
        const raw = JSON.stringify(v);
        if (persist) localStorage.setItem(key(k), raw); else mem.set(key(k), raw);
      } catch { /* storage unavailable - progress just won't persist */ }
    },
    clear() {
      try {
        mem.clear();
        if (persist) Object.keys(localStorage).filter((x) => x.startsWith(`gk:${namespace}:`)).forEach((x) => localStorage.removeItem(x));
      } catch { /* ignore */ }
    },
    /** A sub-store for one element instance, e.g. store.scope('day3'). */
    scope(sub) { return createStore(`${namespace}:${sub}`, { persist }); },
  };
}
