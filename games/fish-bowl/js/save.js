// Progress, coins and settings in localStorage "fishbowl.save". Storage can be missing (private mode, previews): the
// game then runs with defaults and forgets on reload. Original PlayerPrefs: UnlockLevel, TotalCoins, Volume, InvertControls,
// Activity (last level started, 0-based), TutorialComplete.
const KEY = 'fishbowl.save';
export const LEVELS = 5;

export class Save {
  constructor() {
    this.d = { unlocked: 1, coins: 0, done: [], volume: 1, invert: false, activity: 0, tutorial: false };
    try { Object.assign(this.d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }
    // saves from before the tutorial flag: whoever already played a level has seen it
    if (this.d.done.length || this.d.unlocked > 1) this.d.tutorial = true;
  }

  write() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* not persisted */ } }

  get unlocked() { return this.d.unlocked; }
  get coins() { return this.d.coins; }
  unlock(n) { this.d.unlocked = Math.min(LEVELS, Math.max(this.d.unlocked, n)); this.write(); }
  addCoins(n) { this.d.coins += n; this.write(); }
  markDone(n) { if (!this.d.done.includes(n)) this.d.done.push(n); this.write(); }
  set(k, v) { this.d[k] = v; this.write(); }
}
