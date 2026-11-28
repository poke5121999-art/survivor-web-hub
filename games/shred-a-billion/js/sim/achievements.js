// Achievements (rules/events.md §B): 100 defs, evaluated locally every 1 s and on game callbacks, stored per browser profile
// (the original keeps a local AchievementStore and pushes to Steam on top). Kinds and thresholds come from the description
// text (the catalog constructor is truncated in the decompile). Pure JS.
// row: [id, kind, arg, threshold]
export const ACH = [
  ['AUTOPUMP', 'unlock', 'mech.autopump'], ['AUTOPUMP_100', 'stat', 'AutoPumps', 12], ['BAG_DUMPS_100', 'stat', 'BagDumps', 50],
  ['BARE_HANDS', 'before', 'tool.bucket', 1e4], ['BIG_TICKET', 'shredD', null, 1e9], ['BILLS_1B', 'stat', 'BillsShredded', 1e9],
  ['BILLS_1K', 'stat', 'BillsShredded', 1e3], ['BILLS_1M', 'stat', 'BillsShredded', 1e6], ['BOOST_20', 'stat', 'BoostsCollected', 20],
  ['BOOST_ALL', 'boostAll', null, 9], ['BOOST_FIRST', 'stat', 'BoostsCollected', 1], ['BOOST_TRIPLE', 'boostActive', null, 3],
  ['BULK_ORDER', 'shredI', null, 5e5], ['COMPLETIONIST', 'all', null, 99], ['COOP_BILLION', 'stat', 'HandPickups', 5000],
  ['COOP_CREW', 'cat', 'automation'], ['COOP_FINALE', 'nodes', null, 100], ['COOP_FRIEND', 'stat', 'DroneDeliveries', 1],
  ['COOP_GUEST', 'level', null, 2], ['COOP_HOST', 'depth', null, 4.5], ['COOP_HOUR', 'movesL', null, 1],
  ['COOP_MILLION', 'stat', 'ShovelScoops', 1000], ['COOP_SHARED_BUY', 'stat', 'DollarsSpent', 1e6], ['CRIT_1000', 'stat', 'CritCount', 1000],
  ['CRIT_FIRST', 'stat', 'CritCount', 1], ['DEPTH_10', 'depth', null, 9.5], ['DEPTH_20', 'depth', null, 19.5],
  ['DIG_BRICK', 'digTier', null, 3], ['DIG_BUNDLE', 'digTier', null, 2], ['DIG_CRATE', 'digTier', null, 4], ['DIG_STACK', 'digTier', null, 1],
  ['DOUBLE_LUCKY', 'critLucky', null, 1], ['DPS_1B', 'stat', 'BestDollarsPerSecond', 1e9], ['DPS_1M', 'stat', 'BestDollarsPerSecond', 1e6],
  ['DPS_1T', 'stat', 'BestDollarsPerSecond', 1e12], ['DRONES', 'unlock', 'mech.drones'], ['DRONE_500', 'stat', 'DroneDeliveries', 200],
  ['DRONE_SWARM', 'unlock', 'mech.swarm'], ['FIRST_SHRED', 'stat', 'BillsShredded', 1], ['FIRST_THROW', 'stat', 'ThrowsIntoShredder', 1],
  ['FLIGHT_2MIN', 'stat', 'FlightSeconds', 120], ['GOLDEN_KEY', 'flagOrUnlock', 'item.golden_key'], ['GOLD_BAR', 'flag', 'event.finale'],
  ['GOLD_BARS_100', 'gold', null, 5], ['GOLD_PERK', 'gold', null, 1], ['GOLD_PERK_25', 'gold', null, 10], ['GOLD_PERK_ALL', 'gold', null, 20],
  ['HAND_500', 'stat', 'HandPickups', 500], ['HOARDER', 'wallet', null, 1e9], ['JETPACK', 'unlock', 'move.jetpack'], ['JUMPS_500', 'stat', 'Jumps', 200],
  ['LEVEL_10', 'level', null, 10], ['LEVEL_100', 'level', null, 100], ['LEVEL_25', 'level', null, 25], ['LEVEL_50', 'level', null, 50],
  ['LUCKY_100', 'stat', 'LuckyCount', 100], ['LUCKY_FIRST', 'stat', 'LuckyCount', 1], ['MAXED_OUT', 'maxed', null, 3],
  ['MAX_BOOSTS', 'cat', 'boosts'], ['MAX_BUCKET', 'cat', 'bucket'], ['MAX_ECONOMY', 'cat', 'economy'], ['MAX_HANDS', 'cat', 'hands'],
  ['MAX_MOBILITY', 'cat', 'mobility'], ['MAX_SHOVEL', 'cat', 'shovel'], ['MAX_SHREDDER', 'cat', 'shredder'], ['MAX_VACUUM', 'cat', 'vacuum'],
  ['MONEY_1B', 'total', null, 1e9], ['MONEY_1K', 'total', null, 1e3], ['MONEY_1M', 'total', null, 1e6], ['MONEY_1QA', 'total', null, 1e15],
  ['MONEY_1QI', 'total', null, 1e16], ['MONEY_1T', 'total', null, 1e12], ['OLD_SCHOOL', 'before', 'tool.vacuum', 5e11],
  ['PAPER_PLANE', 'stat', 'ThrowsIntoShredder', 500], ['PLAY_1H', 'movesU', null, 100], ['PLAY_3H', 'movesL', null, 5],
  ['RELIC_5', 'relics', null, 5], ['RELIC_ALL', 'relicsAll'], ['RELIC_DIAMOND', 'relic', 'vault_diamond'], ['RELIC_FIRST', 'relics', null, 1],
  ['ROCK_BOTTOM', 'depth', null, 38.5], ['SHOVEL_500', 'stat', 'ShovelScoops', 500], ['SPEED_FINALE', 'speedFlag', 'event.finale', 13500],
  ['SPEED_MILLION', 'speedDollars', 3600, 1e8], ['SPENT_1B', 'stat', 'DollarsSpent', 1e9], ['SPENT_1QA', 'stat', 'DollarsSpent', 1e15],
  ['TOOL_BUCKET', 'unlock', 'tool.bucket'], ['TOOL_SHOVEL', 'unlock', 'tool.shovel'], ['TOOL_VACUUM', 'unlock', 'tool.vacuum'],
  ['TREE_10', 'nodes', null, 10], ['TREE_25', 'nodes', null, 25], ['TREE_FIRST', 'nodes', null, 1], ['UPGRADES_150', 'upg', null, 150],
  ['UPGRADES_25', 'upg', null, 25], ['UPGRADES_75', 'upg', null, 75], ['UPGRADE_FIRST', 'upg', null, 1], ['VACUUM_20MIN', 'stat', 'VacuumSeconds', 1200],
  ['VAULT_CLEARED', 'flag', 'ending.clean'], ['WALK_10KM', 'stat', 'DistanceWalked', 5000], ['WALLET_1M', 'wallet', null, 1e6]];
export const ACH_TOTAL = ACH.length;
const MOVES = ['ability.armful', 'ability.heave', 'ability.ground_pound', 'ability.twister', 'ability.rally'];
const LOBBY_Y = 3.0;   // depth is measured below the lobby floor

export class Achievements {
  constructor(store) { this.store = store || { done: {} }; this.t = 0; this.pending = []; this.boostMask = this.store.boostMask | 0; this.skip = new Set(); }
  // co-op join (AC/AchievementRules.c:1020-1140): what the host's world already holds is not handed out to the guest
  skipHeld(g) { this.skip.clear(); for (const row of ACH) if (!this.done(row[0]) && this.holds(row, g)) this.skip.add(row[0]); }
  done(id) { return !!this.store.done[id]; }
  get count() { return Object.keys(this.store.done).length; }
  unlock(id) {
    if (this.done(id)) return;
    this.store.done[id] = Math.floor(Date.now() / 1000); this.store.dirty = true; this.pending.push(id);
  }
  // pushed kinds, from game events
  onEvent(e, g) {
    if (e.type === 'shred') {
      const r = e.res;
      if (r.crit && r.lucky) this.unlock('DOUBLE_LUCKY');
      if (r.dollars >= 1e9) this.unlock('BIG_TICKET');
      if (r.notes >= 5e5) this.unlock('BULK_ORDER');
    } else if (e.type === 'take' && e.tier != null) {
      for (const [id, t] of [['DIG_STACK', 1], ['DIG_BUNDLE', 2], ['DIG_BRICK', 3], ['DIG_CRATE', 4]]) if (e.tier >= t) this.unlock(id);
    } else if (e.type === 'boost') { this.boostMask |= 1 << e.kind; this.store.boostMask = this.boostMask; this.store.dirty = true; }
  }
  holds(row, g) {
    const [id, kind, arg, th] = row, e = g.econ, st = e.stats.tracked;
    switch (kind) {
      case 'total': return e.total >= th;
      case 'wallet': return e.dollars >= th;
      case 'stat': return (st[arg] || 0) >= th;
      case 'unlock': return e.hasUnlock(arg);
      case 'flag': return g.flags.has(arg) || e.worldFlags.has(arg);
      case 'flagOrUnlock': return e.hasUnlock(arg) || g.flags.has(arg) || e.worldFlags.has(arg);
      case 'level': return e.level >= th;
      case 'nodes': return (st.NodesLearned || 0) >= th;
      case 'upg': return Object.values(e.upgrades).reduce((a, b) => a + b, 0) >= th;
      case 'relics': return e.relics.size >= th;
      case 'relicsAll': { const n = (g.data.relics || []).length; return n > 0 && e.relics.size >= n; }
      case 'relic': return e.relics.has(arg);
      case 'gold': return (g.finds ? g.finds.fed : 0) >= th;
      case 'movesL': return MOVES.filter(k => e.hasUnlock(k)).length >= th;
      case 'movesU': return [1, 2, 3, 4, 5].reduce((a, m) => a + (st['AbilityUses' + m] || 0), 0) >= th;
      case 'maxed': return g.data.content.upgrades.some(u => u.maxLevel >= th && (e.upgrades[u.id] || 0) >= u.maxLevel);
      case 'cat': { const us = g.data.content.upgrades.filter(u => u.category === arg && u.maxLevel > 0); return us.length > 0 && us.every(u => (e.upgrades[u.id] || 0) >= u.maxLevel); }
      case 'boostAll': return (this.boostMask & 0x1ff) === 0x1ff;
      case 'boostActive': return e.boosts.filter(b => b.remaining > 0).length >= th;
      case 'before': return e.total >= th && !e.hasUnlock(arg);
      case 'speedDollars': return e.total >= th && (g.played || 0) < arg;
      case 'speedFlag': return (g.flags.has(arg) || e.worldFlags.has(arg)) && (g.played || 0) < th;
      case 'depth': return (st.DeepestDepth || 0) >= th;
      case 'all': return ACH.filter(r => r[0] !== id).every(r => this.done(r[0]));
    }
    return false;
  }
  // every 1 s (tickSeconds); returns ids unlocked this call
  step(dt, g) {
    this.t += Math.min(dt, 1);
    if (this.t >= 1) { this.t = 0; for (const row of ACH) if (!this.done(row[0]) && !this.skip.has(row[0]) && this.holds(row, g)) this.unlock(row[0]); }
    const out = this.pending; this.pending = []; return out;
  }
}
export { LOBBY_Y };
