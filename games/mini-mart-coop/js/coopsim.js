// The solo Sim with more than one player. The host runs it: its own player stays in state.player / state.carry, so
// tasks, the bot, the thief and the HUD work unchanged, and every other player is an entry of state.remotes stepped
// through the same per-player code by swapping its fields in. Shared: cash, mats, machines, shelves, staff (Supermarket
// Together keeps one wallet per store too). Per player: position, carried stack, pickup/drop timers, cash drain.
import { Sim } from '../../casual-farm/js/sim/sim.js';
import { plain, live, assignDeep } from './net/mirror.js';

const OWN = ['player', 'carry', 'acc', 'drain', 'upgrade'];
const POSE = ['x', 'y', 'z', 'dirX', 'dirZ', 'moving'];
// Thief.step only lets state.player catch the thief (games/casual-farm/js/sim/thief.js: CATCH_R 2.5, FREEZE 2).
const CATCH_R = 2.5, FREEZE = 2;

export const freshPlayer = (store) => ({
  player: { x: store.player.start.x, y: 0, z: store.player.start.z, dirX: 0, dirZ: 1, moving: false, frozen: 0, inputMag: 0 },
  carry: [],
  acc: { pick: 0, drop: 0, coin: 0 },
  drain: { delay: 0, rate: 0, mult: 1, inc: 0, amount: 1, step: 0, stop: false, target: null },
  upgrade: { present: 0, paid: 0, cooldownUntil: 0 },
});

export class CoopSim extends Sim {
  constructor(store, opts = {}) {
    super(store, opts);
    this.state.remotes = {};
    this.pid = null;
  }

  addRemote(pid, name, looks = null) {
    const r = this.state.remotes[pid] || (this.state.remotes[pid] = freshPlayer(this.store));
    r.name = name;
    this.setLooks(pid, looks);
    // Spread joiners around the start point so they do not stand inside each other.
    const n = Object.keys(this.state.remotes).length;
    r.player.x = this.store.player.start.x + 3 * Math.cos(n * 2.1);
    r.player.z = this.store.player.start.z + 3 * Math.sin(n * 2.1);
    this.emit({ type: 'playerJoin', pid, name });
    return r;
  }

  // What a leaving player carried is lost, as when a customer walks off with it.
  removeRemote(pid) {
    if (!this.state.remotes[pid]) return;
    delete this.state.remotes[pid];
    this.emit({ type: 'playerLeave', pid });
  }

  // Movement is the joiner's own (no input lag on their screen); the host keeps everything the position triggers.
  setPose(pid, pose) {
    const r = this.state.remotes[pid];
    if (!r) return;
    for (const k of POSE) if (pose[k] !== undefined) r.player[k] = pose[k];
  }

  // Outfit, hat, skin and pet of one player (their eq ids) and the carry their pet adds. Store-wide outfit skills
  // (faster machines, revenue) are the host's, through Sim.setCosmetics; speed is each player's own and lives on
  // their own screen, where they walk.
  setLooks(pid, looks) {
    const r = pid === 'host' ? null : this.state.remotes[pid];
    const eq = looks && looks.eq ? looks.eq : null, petCarry = looks && looks.petCarry ? +looks.petCarry || 0 : 0;
    if (r) { r.looks = eq; r.petCarry = petCarry; } else if (pid === 'host') this.hostLooks = eq;
  }

  emit(e) {
    if (this.pid != null && e.pid === undefined) e.pid = this.pid;
    super.emit(e);
  }

  // Sim.step runs the host's player (stepPlayer, zones, stepCarry, stepMoney, stepNextMart) and then the systems.
  // The other players must step in that same gap: customers read cashiers[].playerOn when the systems run, and the
  // host's zones() rewrites it at the start of every step.
  stepNextMart(dt, zone) {
    super.stepNextMart(dt, zone);
    this.stepRemotes(dt);
  }

  stepRemotes(dt) {
    const st = this.state;
    const pids = Object.keys(st.remotes);
    if (!pids.length) return;
    const own = {};
    for (const k of OWN) own[k] = st[k];
    const ownZone = this.zone, ownPet = this.petCarry;
    const on = st.cashiers.map(c => c.playerOn);
    try {
      for (const pid of pids) {
        const r = st.remotes[pid];
        for (const k of OWN) st[k] = r[k];
        this.pid = pid;
        this.petCarry = r.petCarry || 0;
        r.player.frozen = Math.max(0, (r.player.frozen || 0) - dt);
        const zone = this.zones();
        this.stepCarry(dt, zone);
        this.stepMoney(dt, zone);
        st.cashiers.forEach((c, i) => { on[i] = on[i] || c.playerOn; });
        this.catchThief(r);
        this.standOnCashMat(pid, r, dt);
      }
    } finally {
      this.pid = null;
      this.petCarry = ownPet;
      for (const k of OWN) st[k] = own[k];
      this.zone = ownZone;
      st.cashiers.forEach((c, i) => { c.playerOn = on[i]; });
    }
  }

  // Same catch as Thief.step's, for any player: the coins come back when the thief's caught state runs out.
  catchThief(r) {
    const th = this.state.thief, a = th && th.agent;
    if (!a || a.state !== 'escape' || Math.hypot(r.player.x - a.x, r.player.z - a.z) > CATCH_R + 1) return;
    Object.assign(a, { state: 'caught', timer: 0, moving: false });
    r.player.frozen = Math.max(r.player.frozen || 0, FREEZE);
    th.chasing = false;
    this.emit({ type: 'thiefCaught' });
  }

  // Boosters.step counts only state.player standing on the bonus-cash mat; anyone else counts here.
  standOnCashMat(pid, r, dt) {
    const b = this.state.boost, mat = this.boosters && this.boosters.cashMat;
    this.matStand = this.matStand || {};
    if (!b || !b.cash || !mat || !mat.zone.contains(r.player, 1)) { this.matStand[pid] = 0; return; }
    this.matStand[pid] = (this.matStand[pid] || 0) + dt;
    if (this.matStand[pid] >= mat.time) { this.matStand[pid] = 0; this.boosters.claimCash(); }
  }

  // --- replication ----------------------------------------------------------------------------------------------
  // Wire form: the shared state plus every player under `players`, the host as "host".
  wire(hostName) {
    const st = this.state, players = { host: { name: hostName, player: st.player, carry: st.carry, looks: this.hostLooks || null } };
    for (const [pid, r] of Object.entries(st.remotes)) players[pid] = { name: r.name, player: r.player, carry: r.carry, looks: r.looks || null };
    const shared = {};
    for (const k of Object.keys(st)) if (!OWN.includes(k) && k !== 'remotes') shared[k] = st[k];
    shared.players = players;
    return plain(shared);
  }
}

// A joiner's copy: never stepped as a whole, only its own player moves locally. adopt() lays the host's wire state
// over it with this player as state.player and everyone else, the host included, under state.remotes.
export class MirrorSim extends CoopSim {
  constructor(store, me, opts = {}) {
    super(store, opts);
    this.me = me;
  }

  adopt(wire) {
    const st = this.state, w = live(wire);
    const players = w.players || {};
    delete w.players;
    const mine = players[this.me];
    const pose = {};
    for (const k of POSE) pose[k] = st.player[k];
    const remotes = {};
    for (const [pid, p] of Object.entries(players)) if (pid !== this.me) remotes[pid] = { ...freshPlayer(this.store), ...p };
    for (const k of Object.keys(w)) {
      const cur = st[k];
      if (cur && typeof cur === 'object' && !(cur instanceof Set) && !Array.isArray(cur) && w[k] && typeof w[k] === 'object' && !Array.isArray(w[k]) && !(w[k] instanceof Set)) assignDeep(cur, w[k]);
      else st[k] = w[k];
    }
    st.remotes = remotes;
    if (mine) {
      if (!this.placed) {
        this.placed = true;
        Object.assign(st.player, mine.player);
      } else Object.assign(st.player, mine.player, pose);
      st.carry = mine.carry;
    }
  }

  // Local walking only: the rest of the step is the host's.
  step(dt, { nav = null } = {}) {
    this.stepPlayer(dt, nav);
    this.state.t += dt;
  }

  pose() {
    const p = this.state.player, o = {};
    for (const k of POSE) o[k] = typeof p[k] === 'number' ? Math.round(p[k] * 100) / 100 : p[k];
    return o;
  }
}
