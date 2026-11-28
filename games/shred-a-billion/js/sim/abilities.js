// Tool abilities (rules/abilities.md): Armful (hand), Heave (bucket), Ground Pound (shovel), Overload (vacuum),
// Rally (drones). Secondary (RMB) triggers the tool's move; Rally has its own key. Wind-up HIT before firing,
// cooldown starts at fire. Pure JS, owned by Game.
import { SRC } from './economy.js';
import { roundHE, NX, CELL, OX, OZ } from './pile.js';

export const MOVE = { Armful: 1, Heave: 2, Pound: 3, Overload: 4, Rally: 5 };
const MOVE_TOOL = { 1: 0, 2: 1, 3: 2, 4: 3 };
const UNLOCK = { 1: 'ability.armful', 2: 'ability.heave', 3: 'ability.ground_pound', 4: 'ability.twister', 5: 'ability.rally' };
const HIT = { 1: 0.18, 2: 0.4, 3: 0.8, 4: 0.3, 5: 0.2 };
export const REFUSE = { None: 0, NotOwned: 1, Cooldown: 2, WrongTool: 3, OutOfRange: 4, BagState: 5, NoTarget: 6, Busy: 7 };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

export class Abilities {
  constructor(game) { this.g = game; this.reset(); }
  reset() { this.cdReady = {}; this.cdTotal = {}; this.wind = null; this.overloadUntil = 0; this.overloadRate = 1; this.rally = null; }
  get now() { return this.g.time; }
  owned(m) { return this.g.econ.hasUnlock(UNLOCK[m]); }
  forTool(t) { return { 0: 1, 1: 2, 2: 3, 3: 4 }[t]; }
  n() {
    const v = (id, lo, hi) => clamp(this.g.stat(id), lo, hi);
    return { armfulSize: v(45, 1, 1e9), armfulCd: v(46, 1, 1e9), armfulR: v(47, 0.3, 6), heaveRange: v(48, 2, 80), heaveCd: v(49, 1, 1e9),
      poundScoops: v(51, 1, 1e9), poundCd: v(52, 1, 1e9), crater: v(53, 1, 8), overloadTime: v(54, 1, 80), overloadCd: v(55, 1, 1e9),
      overloadPower: v(56, 0, 1), rallyTime: v(57, 1, 600), rallyCd: v(58, 1, 1e9), rallyDig: v(59, 0, 10) };
  }
  cdLeft(m) { return Math.max(0, (this.cdReady[m] || 0) - this.now); }
  cd01(m) { const t = this.cdTotal[m] || 1; return this.cdLeft(m) / t; }
  heaveDist(eye) { const p = this.g.markers.shredderIntake; return Math.hypot(eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]); }
  armfulWant(n) { return Math.max(0, Math.floor(Math.max(1, this.g.handCap(1)) * Math.max(1, n.armfulSize)) - this.g.handHeld()); }
  check(m, eye, dir, atPress) {
    const g = this.g;
    if (!this.owned(m)) return REFUSE.NotOwned;
    if (g.finds && g.finds.carry) return REFUSE.Busy;            // hands full: tools are put away
    if (g.finale && g.finale.movesOff()) return REFUSE.Busy;       // Encore.MovesOff: the vault is clean between rounds [inferred]
    if (this.cdLeft(m) > 0) return REFUSE.Cooldown;
    if (m !== 5 && g.tool !== MOVE_TOOL[m]) return REFUSE.WrongTool;
    const n = this.n(), st = g._st;
    switch (m) {
      case 1: return !g.aimPile(eye, dir, st.reach + 0.6) ? REFUSE.OutOfRange : this.armfulWant(n) > 0 ? REFUSE.None : REFUSE.BagState;
      case 2: if (!atPress && this.heaveDist(eye) > n.heaveRange) return REFUSE.OutOfRange;
        return g.bagUnits() >= g.bagCapacity() * 0.5 - 1e-6 && g.bagUnits() > 0 ? REFUSE.None : REFUSE.BagState;
      case 3: return !g.aimPile(eye, dir, st.reach + 0.5) ? REFUSE.OutOfRange : g.bagFree() > 0 ? REFUSE.None : REFUSE.BagState;
      case 4: return g.bagFree() >= 1 && this.now >= this.overloadUntil ? REFUSE.None : REFUSE.BagState;
      case 5: { if (!g.drones.length) return REFUSE.BagState; const a = g.aimPile(eye, dir, 60);
        if (!a) return g.aimPile(eye, dir, 180) ? REFUSE.OutOfRange : REFUSE.NoTarget; return REFUSE.None; }
    }
    return REFUSE.None;
  }
  refused(m, why) { this.g.events.push({ type: 'abilityRefused', move: m, why }); this.wind = null; return false; }
  // secondaryPressed / secondaryHeld / secondaryReleased: RMB; rallyPressed: Rally key
  step(dt, inp) {
    const g = this.g, eye = inp.eye, dir = inp.dir;
    if (!eye) return;
    if (this.wind) {
      const w = this.wind; w.t += dt;
      if (w.m === 2) {                    // Heave: hold, fire on release after HIT
        if (inp.secondaryReleased || !inp.secondaryHeld) { if (w.t >= HIT[2]) this.fire(2, eye, dir); else this.wind = null; }
      } else if (w.m === 3) {             // Pound: hold HIT; early release cancels
        if (!inp.secondaryHeld && w.t < HIT[3]) this.wind = null; else if (w.t >= HIT[3]) this.fire(3, eye, dir);
      } else if (w.t >= HIT[w.m]) this.fire(w.m, eye, dir);
    } else {
      let m = 0;
      if (inp.secondaryPressed) m = this.forTool(g.tool);
      if (inp.rallyPressed) m = 5;
      if (m) { const why = this.check(m, eye, dir, true); if (why) this.refused(m, why); else { this.wind = { m, t: 0 }; g.events.push({ type: 'abilityWind', move: m }); } }
    }
    if (this.rally && this.now >= this.rally.until) this.rally = null;
  }
  fire(m, eye, dir) {
    const g = this.g, n = this.n(), why = this.check(m, eye, dir, false); if (why) return this.refused(m, why);
    let cd = 1;
    if (m === 1) {
      const a = g.aimPile(eye, dir, g._st.reach + 0.6), w = Math.max(1, g.topWeightAt(a.cell));
      const got = g.collect(a.point, n.armfulR, Math.max(1, Math.floor(this.armfulWant(n) / w)), 0, false, 0);
      if (got < 1) return this.refused(1, REFUSE.NoTarget); cd = n.armfulCd;
    } else if (m === 2) {
      const load = g.bag.slice(); g.bag = [0, 0, 0, 0, 0, 0];
      const d = this.heaveDist(eye), flight = clamp(0.9 + 0.0182 * Math.max(0, d - 6), 0.9, 1.3);
      g.enqueue(load, g.player.pos, SRC.Heave, flight);   // notes land after the flight time
      g.econ.track('BagDumps'); cd = n.heaveCd;
      g.events.push({ type: 'heave', flight, n: load.reduce((x, y) => x + y, 0) });
    } else if (m === 3) {
      const a = g.aimPile(eye, dir, g._st.reach + 0.5), w = Math.max(1, g.topWeightAt(a.cell)), free = g.freeNotes(w);
      if (free < 1) return this.refused(3, REFUSE.BagState);
      const total = Math.min(Math.max(1, roundHE(n.poundScoops * g._st.shovelItems / w)), free);
      const r0 = g._st.shovelRadius, R2 = Math.max(0.3, r0) * n.crater;
      let got = g.collect(a.point, r0, Math.max(1, roundHE(total * 0.4)), 2, true, 0);
      if (total - got > 0) got += g.collect(a.point, R2, total - got, 2, true, 0);
      if (got < 1) return this.refused(3, REFUSE.NoTarget); cd = n.poundCd;
      g.events.push({ type: 'pound', point: a.point });
    } else if (m === 4) {
      this.overloadRate = (n.overloadPower + 1) * 3; this.overloadUntil = this.now + n.overloadTime; cd = n.overloadCd;
    } else if (m === 5) {
      const a = g.aimPile(eye, dir, 60);
      this.rally = { at: a.point.slice(), until: this.now + n.rallyTime, dig: 1 + n.rallyDig }; cd = n.rallyCd;
    }
    this.cdReady[m] = this.now + cd; this.cdTotal[m] = cd; this.wind = null;
    g.econ.track('AbilityUses' + m);
    g.events.push({ type: 'ability', move: m });
    return true;
  }
  // Rally slot i: ring 0 (6 slots at 3.4 m), ring 1 (12 slots at 6.8 m)
  rallySlot(i) {
    if (!this.rally) return null;
    const ring = i < 6 ? 0 : 1, k = ring ? i - 6 : i, cnt = ring ? 12 : 6, r = ring ? 6.8 : 3.4, ang = k / cnt * Math.PI * 2;
    const x = this.rally.at[0] + Math.cos(ang) * r, z = this.rally.at[2] + Math.sin(ang) * r, c = this.g.field.cellOf(x, z);
    return c >= 0 && this.g.field.count[c] > 0 ? [x, 0, z, c] : null;
  }
  save() { const cd = {}; for (const m in this.cdReady) cd[m] = this.cdLeft(m); return { cd }; }
  load(s) { this.reset(); if (s && s.cd) for (const m in s.cd) { this.cdReady[m] = this.now + s.cd[m]; this.cdTotal[m] = s.cd[m] || 1; } }
}
