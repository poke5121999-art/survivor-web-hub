// Progress, coins and settings in localStorage "fishbowl.save". Storage can be missing (private mode, previews): the
// game then runs with defaults and forgets on reload.
const KEY = 'fishbowl.save';
export const LEVELS = 5;

export class Save {
  constructor() {
    this.d = { unlocked: 1, coins: 0, done: [], volume: 1, invert: false };
    try { Object.assign(this.d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }
  }

  write() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* not persisted */ } }

  get unlocked() { return this.d.unlocked; }
  get coins() { return this.d.coins; }
  unlock(n) { this.d.unlocked = Math.min(LEVELS, Math.max(this.d.unlocked, n)); this.write(); }
  addCoins(n) { this.d.coins += n; this.write(); }
  markDone(n) { if (!this.d.done.includes(n)) this.d.done.push(n); this.write(); }
  set(k, v) { this.d[k] = v; this.write(); }
}
