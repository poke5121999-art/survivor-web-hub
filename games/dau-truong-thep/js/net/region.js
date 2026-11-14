// The Relay region a room should live in: the one with the shortest round trip from this machine.
// Unity's allocate without a region answered us-central1 for a host in Vietnam (227 ms per leg, 29 ms to Singapore),
// and every packet between host and guest crosses the relay twice.
import { Ugs } from './ugs.js';
import { RelayLink } from './relay.js';

const KEY = 'dtt-relay-region-v1';
const KEEP = 24 * 3600e3;
const BUDGET = 4000;

// One round trip to a region's relay: BIND out, BIND_RECEIVED back, on a throwaway allocation.
async function roundTrip(ugs, region) {
  const alloc = await ugs.allocate(1, region);
  let out = 0, back = 0;
  class Timed extends WebSocket {
    constructor(url) { super(url); this.addEventListener('message', () => { if (!back) back = performance.now(); }); }
    send(data) { if (!out) out = performance.now(); super.send(data); }
  }
  const link = await new RelayLink(alloc, { role: 'host', WebSocketImpl: Timed }).open();
  link.close();
  return back - out;
}

async function measure() {
  const ugs = await new Ugs().signIn();
  const regions = await ugs.regions();
  const rows = [];
  await Promise.race([
    Promise.all(regions.map((r) => roundTrip(ugs, r.id).then((ms) => { rows.push({ region: r.id, ms: Math.round(ms) }); }, () => {}))),
    new Promise((done) => setTimeout(done, BUDGET)),
  ]);
  rows.sort((a, b) => a.ms - b.ms);
  return rows;
}

let pending = null;

// Resolves to { region, ms, rows } or null when nothing could be measured (the caller then lets Unity choose).
export function nearestRegion() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.region && Date.now() - saved.at < KEEP) return Promise.resolve(saved);
  } catch (e) { /* storage unavailable or damaged: measure again */ }
  if (!pending) {
    pending = measure().then((rows) => {
      pending = null;
      if (!rows.length) return null;
      const best = { region: rows[0].region, ms: rows[0].ms, rows, at: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(best)); } catch (e) { /* storage unavailable */ }
      return best;
    }, () => { pending = null; return null; });
  }
  return pending;
}
