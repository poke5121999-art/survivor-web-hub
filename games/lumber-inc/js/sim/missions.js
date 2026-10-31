// Main task bar (MissionConf, rules/workers-guide-camera.md B3): one task at a time in Order; progress is read from
// the game state, the reward (coins) is claimed by tapping the bar, then the next task loads.
export class Missions {
  constructor(sim) {
    this.sim = sim;
    this.list = [...sim.config.MissionConf].sort((a, b) => a.Order - b.Order);
    this.type = new Map(sim.config.BuildingConf.map(r => [r.Id, r.BuildingTypeId]));
    sim.state.task = sim.state.task || 0;
  }

  get current() { return this.list[this.sim.state.task] || null; }

  // [value, target] of a task, derived from the state (AbstractTaskHandler_*).
  progress(m = this.current) {
    if (!m) return [0, 0];
    const S = this.sim.state;
    const kind = m.Handler.replace('AbstractTaskHandler_', '');
    const para = +m.EventPara;
    let v = 0;
    if (kind === 'UnlockBuilding') v = S.bought[para] ? 1 : 0;
    else if (kind === 'UnlockEmp') v = Object.entries(S.hired || {}).filter(([h]) => +h % 100 === para).reduce((a, [, n]) => a + n, 0);
    else if (kind === 'UpgradeBuildingStar') v = Object.entries(S.stars || {}).filter(([b]) => this.type.get(+b) === para).reduce((a, [, n]) => a + n, 0);
    else if (kind === 'PlayerLv') v = S.level;
    return [Math.min(v, m.Target), m.Target];
  }

  done() { const [v, t] = this.progress(); return !!this.current && v >= t; }

  claim() {
    const m = this.current;
    if (!m || !this.done()) return false;
    this.sim.earn(m.RewardNum, 'task');
    this.sim.state.task++;
    this.sim.emit({ type: 'task', id: m.Id, reward: m.RewardNum });
    return true;
  }
}
