// Boosters and the extra-cash mat (rules/vip-rv-boost.md: MatRVSpawnerController + BoosterAdsController). In the
// original each one is a rewarded video; this build has no ads, so tapping the offer (or standing on the mat) grants it.
// Booster offer: every COOLDOWN s while no offer is up, one random available booster button shows for OFFER s and
// lasts DURATION s once taken. Extra cash: the mat and its button show for CASH_OFFER s after CASH_COOLDOWN s off and
// pay the cheapest open mat's price (ProgressManager.GetCurrentMinimumMatActivateCost). The extra-cash timers are the
// original's ABMiscType 2 arm (120 s / 30 s); its default arm (8 s / 15 s) assumes an ad between payouts.
const COOLDOWN = 10, OFFER = 20, DURATION = 300;
const CASH_COOLDOWN = 120, CASH_OFFER = 30;

// BoosterAdsController (level1.json): machineSpeedUpMultiplier 2, playerExtraSpeed 10, workerExtraSpeed 10, extraCustomer 3.
export const BOOST = { machine: 2, player: 10, worker: 10, customer: 3, cash: 2 };

export class Boosters {
  constructor(sim) {
    this.sim = sim;
    const s = sim.store, i = s.node('Mat_RV_Extra_Cash');
    this.cashMat = i == null ? null : { node: i, zone: s.box(i), pos: s.pos(i), time: (s.comp(i, 'MatAdvertisingExtraCash') || {}).timer ?? 1.5 };
    sim.state.boost = { offer: null, offerT: 0, active: {}, cash: null, cashT: 0, stand: 0 };
    sim.boosters = this;
  }

  on(kind) {
    return (this.sim.state.boost.active[kind] || 0) > this.sim.state.t;
  }

  left(kind) {
    return Math.max(0, (this.sim.state.boost.active[kind] || 0) - this.sim.state.t);
  }

  // MatRVSpawnerController.UpdateAvailableMatRV.
  available() {
    const sim = this.sim, s = sim.store, list = [];
    if (!this.on('player')) list.push('player');
    if ((sim.state.customers || []).length > 3 && !this.on('customer')) list.push('customer');
    if (s.producers.some(p => sim.isActive(p.name)) && !this.on('machine')) list.push('machine');
    if ((sim.state.workers || []).some(w => w.def.role !== 'farmer' && w.def.role !== 'chef') && !this.on('worker')) list.push('worker');
    if (!this.on('cash')) list.push('cash');
    return list;
  }

  // Cheapest unlock among open, unfinished mats.
  extraCash() {
    const st = this.sim.state;
    const open = this.sim.store.mats.filter(m => st.mats[m.name].open && !st.mats[m.name].done && st.active.has(m.name));
    return open.length ? Math.min(...open.map(m => m.cost)) : 0;
  }

  step(dt, sim) {
    const b = sim.state.boost, t = sim.state.t;
    if (b.offer && t >= b.offer.until) b.offer = null;
    if (!b.offer) {
      b.offerT += dt;
      if (b.offerT >= COOLDOWN) {
        b.offerT = 0;
        const list = this.available();
        if (list.length) {
          b.offer = { kind: list[Math.floor(sim.rng() * list.length)], until: t + OFFER };
          sim.emit({ type: 'boostOffer', kind: b.offer.kind });
        }
      }
    }
    if (b.cash && t >= b.cash.until) b.cash = null;
    if (!b.cash) {
      b.cashT += dt;
      const amount = this.extraCash();
      if (b.cashT >= CASH_COOLDOWN && amount > 0) {
        b.cashT = 0;
        b.cash = { amount, until: t + CASH_OFFER };
        sim.emit({ type: 'cashOffer', amount });
      }
    } else if (this.cashMat) {
      const p = sim.state.player;
      b.stand = this.cashMat.zone.contains(p, 1) ? b.stand + dt : 0;
      if (b.stand >= this.cashMat.time) this.claimCash();
    }
  }

  claim() {
    const b = this.sim.state.boost;
    if (!b.offer) return false;
    const kind = b.offer.kind;
    b.offer = null;
    b.active[kind] = this.sim.state.t + DURATION;
    this.sim.emit({ type: 'boostOn', kind, duration: DURATION });
    return true;
  }

  // A booster from elsewhere (daily spin, rolling offer): the same effect for `seconds`, extending one already running.
  grant(kind, seconds) {
    const b = this.sim.state.boost, t = this.sim.state.t;
    b.active[kind] = Math.max(b.active[kind] || 0, t) + seconds;
    this.sim.emit({ type: 'boostOn', kind, duration: seconds });
  }

  claimCash() {
    const b = this.sim.state.boost;
    if (!b.cash) return 0;
    const amount = b.cash.amount;
    b.cash = null;
    b.stand = 0;
    this.sim.state.cash += amount;
    this.sim.emit({ type: 'coinPile', amount });
    this.sim.emit({ type: 'extraCash', amount });
    return amount;
  }
}
