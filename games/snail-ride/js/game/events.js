// NotificationSystem port: publish(name, payload) -> every subscriber's handler for that name.
const subs = new Map();
export function subscribe(name, fn) { if (!subs.has(name)) subs.set(name, new Set()); subs.get(name).add(fn); return () => subs.get(name).delete(fn); }
export function publish(name, ev = {}) { const s = subs.get(name); if (s) for (const fn of [...s]) fn(ev); }
export function clearScope(list) { for (const off of list) off(); list.length = 0; }
