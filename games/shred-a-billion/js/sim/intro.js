// Intro objective chain (rules/intro.md, Game.Intro.IntroDirector / ObjectiveChain). Pure JS: the view feeds a
// snapshot every frame and reads `card` (top-left objective) and `arrow` (tutorial arrow target kind).
const TUNE = { dialogueDelay: 1.6, cardDelay: 0.7, poll: 0.25, completeHold: 1.5, basicsHold: 0.6, stairsDepth: 5, quietAfter: 15, boostDelay: 2, noticeCard: 9, noticeArrow: 15 };
export const INTRO_TUNE = TUNE;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export const STEPS = [
  { id: 'look', key: 'intro.card.look', kind: 'look', seg: 2, pct: true, basics: true },
  { id: 'move', key: 'intro.card.move', kind: 'count', seg: 8, need: 8, src: s => s.stat.DistanceWalked || 0, basics: true },
  { id: 'jump', key: 'intro.card.jump', kind: 'count', seg: 2, need: 2, src: s => s.stat.Jumps || 0, basics: true },
  { id: 'crouch', key: 'intro.card.crouch', kind: 'crouch', seg: 2, pct: true, basics: true },
  { id: 'sprint', key: 'intro.card.sprint', kind: 'count', seg: 6, need: 6, src: s => s.basics.sprint, basics: true },
  { id: 'grab', key: 'intro.card.grab', kind: 'stat', handful: true, src: s => s.stat.ItemsCollected || 0, arrow: 'pile' },
  { id: 'feed', key: 'intro.card.feed', kind: 'stat', handful: true, src: s => s.stat.ItemsShredded || 0, arrow: 'shredder' },
  { id: 'upgrade', key: 'intro.card.upgrade', kind: 'phases', p1: (s, I) => I.latch || s.upgradesOpen, done: s => (s.stat.UpgradesBought || 0) >= 1 },
  { id: 'proficiency', key: 'intro.card.proficiency', kind: 'phases', p1: s => s.points > 0, done: s => (s.stat.NodesLearned || 0) >= 1, arrow: 'prof' },
  { id: 'boost', key: 'intro.card.boost', kind: 'stat', target: 1, src: s => s.stat.BoostsCollected || 0, arrow: 'boost', needs: 'boosts' },
  { id: 'chest', key: 'intro.card.chest', kind: 'notice', flag: 'chest.1.open', arrow: 'chest', needs: 'chests' },
  { id: 'bucket', key: 'intro.card.buy', arg: 'upg.bucket.unlock.name', kind: 'buy', upg: 'bucket.unlock', unlock: 'tool.bucket' },
  { id: 'bag', key: 'intro.card.bag', kind: 'phases', p1: (s, I) => I.latch || s.bagFull, done: s => (s.stat.BagDumps || 0) >= 1 },
  { id: 'stairs', key: 'intro.card.stairs', kind: 'stairs', ramp: 0 },
  { id: 'shovel', key: 'intro.card.buy', arg: 'upg.shovel.unlock.name', kind: 'buy', upg: 'shovel.unlock', unlock: 'tool.shovel' },
  { id: 'drones', key: 'intro.card.buy', arg: 'upg.automation.drone_bay.name', kind: 'buy', upg: 'automation.drone_bay', unlock: 'mech.drones' },
];
const FIRST_REGULAR = 5, QUIET_FROM = 11;

export class Intro {
  constructor() { this.reset(); }
  reset() {
    this.seen = false; this.done = false; this.step = 0; this.latch = false; this.goal = 0;
    this.basics = { yaw: 0, lo: 0, hi: 0, crouch: 0, sprint: 0, began: false };
    this.t = 0; this.pollT = 0; this.cardsAt = 0; this.advanceAt = -1; this.presented = -1; this.fresh = false;
    this.card = null; this.arrow = null; this.quietT = 0; this.resting = false; this.lastValue = null; this.noticeT = 0;
  }
  newGame(basicsSeen) { this.reset(); this.fresh = true; this.step = basicsSeen ? FIRST_REGULAR : 0; }
  save() { return { v: 1, seen: this.seen, done: this.done, step: this.step, latch: this.latch, goal: this.goal }; }
  load(s) {
    this.reset();
    if (!s) { this.seen = true; this.done = true; return; }          // saves without an intro entry: seen and done
    Object.assign(this, { seen: !!s.seen, done: !!s.done, step: s.step | 0, latch: !!s.latch, goal: s.goal | 0 });
  }
  get dialoguePending() { return this.fresh && !this.seen; }
  // every frame while a basics step is up: camera yaw delta (rad), pitch (rad), crouch/sprint flags, metres moved
  sampleBasics(dt, dyaw, pitch, crouching, sprinting, grounded, moved) {
    if (this.done || this.step >= FIRST_REGULAR) return;
    const B = this.basics, deg = 180 / Math.PI;
    if (!B.began) { B.began = true; B.lo = B.hi = pitch * deg; }
    if (Math.abs(dyaw * deg) < 90) B.yaw = Math.min(720, B.yaw + Math.abs(dyaw * deg));
    B.lo = Math.min(B.lo, pitch * deg); B.hi = Math.max(B.hi, pitch * deg);
    if (crouching) B.crouch = Math.min(4, B.crouch + dt);
    if (sprinting && grounded && moved > 0 && moved < 2) B.sprint = Math.min(24, B.sprint + moved);
  }
  measure(st, s) {
    const B = this.basics;
    switch (st.kind) {
      case 'look': { const span = B.hi - B.lo, share = 0.5 * Math.min(1, B.yaw / 180) + 0.5 * Math.min(1, span / 20), done = B.yaw >= 180 && span >= 20;
        return { value: done ? 100 : Math.min(99, Math.floor(share * 100)), max: 100, fill: share * st.seg, seg: st.seg, done, ready: true, pct: true }; }
      case 'crouch': { const share = Math.min(1, B.crouch), done = B.crouch >= 1;
        return { value: done ? 100 : Math.min(99, Math.floor(share * 100)), max: 100, fill: share * st.seg, seg: st.seg, done, ready: true, pct: true }; }
      case 'count': { const have = st.src(s), v = Math.min(Math.floor(have), st.need);
        return { value: v, max: st.need, fill: v, seg: st.seg, done: have >= st.need, ready: true }; }
      case 'stat': { const max = st.handful ? (this.goal ||= clamp(s.handCapacity, 1, 99)) : Math.max(1, st.target);
        const v = Math.min(Math.floor(st.src(s)), max), seg = clamp(max, 1, 10);
        return { value: v, max, fill: v / max * seg, seg, done: v >= max, ready: true }; }
      case 'phases': { const d = st.done(s, this), p = d || st.p1(s, this); if (p) this.latch = true; const v = d ? 2 : p ? 1 : 0;
        return { value: v, max: 2, fill: v, seg: 2, done: d, ready: true }; }
      case 'buy': { const done = s.hasUnlock(st.unlock), cost = s.cost(st.upg), $ = s.dollars;
        const pct = done ? 100 : cost <= 0 ? 0 : $ >= cost ? 100 : clamp(Math.floor($ / cost * 100), 0, 100);
        return { value: pct, max: 100, fill: done ? 8 : 8 * clamp($ / cost, 0, 1), seg: 8, done, ready: done || s.isVisible(st.upg), pct: true, title: pct > 99 ? 'intro.card.buy.now' : st.key }; }
      case 'stairs': { const done = !!(s.stairsMask & (1 << st.ramp));
        return { value: +done, max: 1, fill: done ? 5 : 5 * 0.95 * clamp((s.stat.DeepestDepth || 0) / TUNE.stairsDepth, 0, 1), seg: 5, done, ready: true }; }
      case 'notice': { const done = s.flags.has(st.flag);
        return { value: +done, max: 1, fill: +done, seg: 1, done: done || (!s.chestSpotted && s.chestKnown), ready: done || s.chestKnown }; }
    }
    return null;
  }
  // s: snapshot {stat, dollars, points, handCapacity, cost(id), isVisible(id), hasUnlock(key), bagFull, upgradesOpen,
  //   stairsMask, flags:Set, has:{boosts,chests}, inDialogue, hudCovered}
  update(dt, s) {
    this.t += dt;
    if (this.done || !this.seen) { this.card = null; this.arrow = null; return; }
    this.pollT -= dt;
    if (this.pollT > 0) return;
    this.pollT = TUNE.poll;
    for (let guard = 0; guard < 32; guard++) {
      if (this.step >= STEPS.length) { this.done = true; this.card = null; this.arrow = null; return; }
      const st = STEPS[this.step];
      // systems that arrive in later drops: step skipped (labelled in STATUS)
      if (st.needs && !(s.has && s.has[st.needs])) { this.next(); continue; }
      const m = this.measure(st, s);
      if (this.presented !== this.step) {
        if (m.done && !st.basics) { this.next(); continue; }        // already done: skipped silently
        if (!m.ready || this.t < this.cardsAt) { this.card = null; this.arrow = null; return; }
        this.presented = this.step; this.quietT = 0; this.resting = false; this.lastValue = m.value;
        if (m.done) this.advanceAt = this.t + TUNE.basicsHold;
      }
      if (m.value !== this.lastValue) { this.lastValue = m.value; if (st.kind !== 'buy') this.quietT = 0; }
      if (m.done && this.advanceAt < 0) { this.advanceAt = this.t + TUNE.completeHold; this.quietT = 0; }
      if (this.advanceAt >= 0 && this.t >= this.advanceAt) { this.next(); this.cardsAt = this.t; continue; }
      // resting from "bucket" on: hide after 15 s without progress (an affordable buy card never rests)
      this.quietT += TUNE.poll;
      this.resting = this.step >= QUIET_FROM && !m.done && this.quietT > TUNE.quietAfter && !(st.kind === 'buy' && m.value >= 100);
      this.card = this.resting || s.hudCovered ? null : { id: st.id, key: m.title || st.key, arg: st.arg, value: m.value, max: m.max, fill: m.fill, seg: m.seg, pct: !!m.pct, done: m.done };
      this.arrow = this.card && !m.done ? (st.id === 'proficiency' && s.points <= 0 ? 'shredder' : st.arrow || null) : null;
      return;
    }
  }
  next() { this.step++; this.latch = false; this.goal = 0; this.advanceAt = -1; this.presented = -1; this.quietT = 0; this.resting = false; this.basics.began = false; }
  // dialogue finished or skipped
  dialogueDone() { this.seen = true; this.cardsAt = this.t + TUNE.cardDelay; }
}
