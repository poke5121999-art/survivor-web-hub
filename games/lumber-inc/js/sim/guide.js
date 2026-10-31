// Tutorial runner for guide.txt + guide_step.txt (rules/workers-guide-camera.md B1-B2). Several guides may run at
// once (guide 6 points at the hut while guide 7 waits for its panel row); each guide walks its steps in RequireStepId
// order. A step starts when its Trigger list holds, shows its display commands until one of its ending commands
// finishes, then the next step waits for its own trigger. Pure data: the view reads `show` and calls `click`.
import { WOOD } from './forest.js';

const ITEMS = { Wood: WOOD, PeeledWood: 101, WoodSquare: 102 };
const ENDS = new Set(['EventRecieveCommand', 'BuildingUnlockCommand', 'BuildingUnlockCompleteCommand', 'PlayerPackEnoughCommand',
  'PlayerPackEmptyCommand', 'EmployeeHiredNumCommand', 'CameraFocusCommand', 'ButtonHackCommand', 'ButtonCommand']);
// GameWish EventID names the guides wait for -> sim event that means the same thing.
const EVENTS = {
  OnGetGuideMoney: e => e.type === 'coins' && e.why === 'guide',
  OnVehicleGo: e => e.type === 'truckGo',
  OnWarehouseDataUpdated: e => e.type === 'deposit' || e.type === 'produced',
  OnBoostStateChange: e => e.type === 'boost',
  OnEmpBuilderPanelOpen: e => e.type === 'panel' && e.id === 10103,
  OnBuildHouseWoodAdd: e => e.type === 'houseWood',
};

const split = s => String(s || '').split(';').map(x => x.trim()).filter(Boolean);
// "Name:#0,#2" with CommonParam "a;b;c" -> ['Name', ['a', 'c']]; literal args stay as written.
function parse(cmd, params) {
  const [name, args = ''] = cmd.split(':');
  return [name, args ? args.split(',').map(a => (a[0] === '#' ? params[+a.slice(1)] : a)) : []];
}

export class Guide {
  constructor(sim) {
    this.sim = sim;
    const c = sim.config;
    this.guides = sim.mapId ? [] : c.guide; // the tutorial points at map-1 objects
    this.steps = new Map();
    for (const r of c.guide_step) {
      if (!this.steps.has(r.GuideID)) this.steps.set(r.GuideID, []);
      this.steps.get(r.GuideID).push(r);
    }
    const g = sim.state.guide = sim.state.guide || { done: [], at: {} };
    this.done = new Set(g.done);
    this.run = new Map(); // guide id -> { step row, started, t }
    for (const [id, stepId] of Object.entries(g.at)) {
      const row = (this.steps.get(+id) || []).find(r => r.Id === stepId);
      if (row) this.run.set(+id, this.step(row));
    }
    this.ui = { top: 'GamingPanel', visible: () => false };
    this.show = { arrow: null, word: null, focus: null, hand: null, tree: false };
  }

  // Trigger lists ("A;B;") hold when every entry holds.
  holds(list, params, seen = []) {
    return split(list).every(t => {
      const [name, a] = parse(t, params);
      const S = this.sim.state;
      switch (name) {
        case 'EmptyTrigger': return true;
        case 'BuildingUnlockTrigger': return !!S.bought[+a[0]] || this.sim.active(+a[0]);
        case 'EmpEmployedTrigger': return this.sim.crew.hired(+a[0]) > 0;
        case 'PlayerLvReachTrigger': return S.level >= +a[0];
        case 'GameTopPanelTrigger': return this.ui.top === a[0];
        case 'UINodeVisibleTrigger': return this.ui.visible(a[0]);
        case 'EventTrigger': return seen.some(EVENTS[a[1]] || (() => false));
        default: return false; // town, map and phone triggers arrive with those systems
      }
    });
  }

  ended(name, a, st) {
    const sim = this.sim;
    switch (name) {
      case 'EventRecieveCommand': return st.seen.some(EVENTS[a[0]] || (() => false));
      case 'BuildingUnlockCommand': case 'BuildingUnlockCompleteCommand': return sim.active(+a[0]);
      case 'PlayerPackEnoughCommand': return sim.pack.countOf(ITEMS[a[0]]) >= +a[1];
      case 'PlayerPackEmptyCommand': return sim.pack.countOf(ITEMS[a[0]]) <= +a[1];
      case 'EmployeeHiredNumCommand': return sim.crew.hired(+a[0]) > 0;
      case 'CameraFocusCommand': return +a[2] > 0 && st.t >= +a[2];
      case 'ButtonHackCommand': case 'ButtonCommand': return st.clicked.has(a[0]);
      default: return false;
    }
  }

  first(id) { return (this.steps.get(id) || []).find(r => !r.RequireStepId); }
  next(row) { return (this.steps.get(row.GuideID) || []).find(r => r.RequireStepId === row.Id); }

  finish(id) {
    this.run.delete(id);
    this.done.add(id);
  }

  step(row) { return { row, started: false, t: 0, seen: [], clicked: new Set() }; }

  tick(dt, events) {
    for (const st of this.run.values()) { st.seen.push(...events); if (st.seen.length > 64) st.seen.splice(0, st.seen.length - 64); }
    for (const g of this.guides) {
      if (this.done.has(g.Id) || this.run.has(g.Id)) continue;
      if (g.RequireGuideId && !this.done.has(g.RequireGuideId)) continue;
      if (g.JumpTrigger && this.holds(g.JumpTrigger, [])) { this.finish(g.Id); continue; }
      if (!this.holds(g.Trigger, [])) continue;
      const row = this.first(g.Id);
      if (row) this.run.set(g.Id, this.step(row));
      else this.finish(g.Id);
    }
    this.show = { arrow: null, word: null, focus: null, hand: null, tree: false, offset: null };
    for (const [id, st] of this.run) {
      const params = split(st.row.CommonParam);
      if (!st.started) {
        if (!this.holds(st.row.Trigger, params, st.seen)) continue;
        st.started = true;
        st.seen = [];
      }
      st.t += dt;
      const cmds = split(st.row.Command).map(c => parse(c, params));
      if (cmds.some(([n, a]) => ENDS.has(n) && this.ended(n, a, st))) {
        const nx = this.next(st.row);
        if (nx) this.run.set(id, this.step(nx));
        else this.finish(id);
        continue;
      }
      for (const [n, a] of cmds) {
        if (n === 'GuideArrowFollowCommand') this.show.arrow = a[0];
        else if (n === 'GuideWordCommand') { this.show.word = a[0]; this.show.offset = a[1] || null; }
        else if (n === 'CameraFocusCommand') this.show.focus = { target: a[0], level: +a[1], time: +a[2], t: st.t };
        else if (n === 'GuideHandCommand') this.show.hand = a[0];
        else if (n === 'TreeChopCommand') this.show.tree = true;
      }
    }
    const S = this.sim.state.guide;
    S.done = [...this.done];
    S.at = Object.fromEntries([...this.run].map(([id, st]) => [id, st.row.Id]));
  }

  click(path) { for (const st of this.run.values()) if (st.started) st.clicked.add(path); }
}
