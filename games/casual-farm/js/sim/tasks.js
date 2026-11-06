// Tutorial chain of a mart: the TaskController children of TaskManager, in scene order. Each names what the player
// must do (taskActionType), where the focus arrow points (focusTaskTransform) and how many times (triggerAmount).
// Timing from TaskManager: the first task shows 3.5 s after start, each next one 1.0 s after the previous completes.
// Mats with enableArrowSlotWhenActivated carry their own arrow while open (Cashier, Tomato shelf, Tomato plant...).
import { CState } from './customers.js';

export const Action = { Pick: 1, Feed: 2, Shelf: 4, Checkout: 6, WaitQueue: 7, WaitMat: 8, Upgrade: 9, Cash: 12 };
const FIRST_DELAY = 3.5, NEXT_DELAY = 1.0;
const RADAR = new Set([0, 1, 2, 4, 6, 10]);
const AT_CASHIER = new Set([CState.Queue, CState.Ready, CState.Packing]);

export function buildTasks(store) {
  const tm = store.node('TaskManager');
  if (tm == null) return [];
  const owner = (focus, list) => list.findIndex(x => x.node === focus || store.descendants(x.node).includes(focus));
  return store.children[tm].filter(i => store.comp(i, 'TaskController')).map(i => {
    const f = store.comp(i, 'TaskController');
    const focus = f.focusTaskTransform ? f.focusTaskTransform.n : null;
    const task = {
      name: store.nodes[i].n, text: f.taskDescription || '', action: f.taskActionType, amount: f.triggerAmount || 1,
      producer: owner(focus, store.producers), shelf: owner(focus, store.shelves), mat: store.mats.findIndex(m => m.node === focus),
      color: f.buttonColor,
    };
    // Carry tasks focus the player in Store 1: a live upgrade pad is the target, otherwise the HUD upgrade button
    // (task.menu, no world arrow).
    const playerFocus = focus === store.player.node;
    task.menu = playerFocus && !store.player.upgradeZone;
    task.target = playerFocus ? (store.player.upgradeZone ? store.player.upgradeZone.middle : null) : focus != null ? store.pos(focus) : null;
    // TaskController.SetTask calls SetFocusArrow only for the doing tasks (actions 0, 1, 2, 4, 6, 10); the waiting ones
    // (5, 7, 8, 12) and the upgrade task (9) call DeactivateRadar.
    task.radar = RADAR.has(task.action) && !!task.target;
    task.item = task.action === Action.Pick ? store.producers[task.producer]?.out
      : task.action === Action.Feed ? store.producers[task.producer]?.ins[0]
        : task.action === Action.Shelf ? store.shelves[task.shelf]?.type : null;
    return task;
  });
}

export function matArrows(store) {
  return store.mats.map(m => {
    const f = m.node != null ? store.comp(m.node, m.kind) : null;
    return f && f.enableArrowSlotWhenActivated && f.arrowSlot ? store.pos(f.arrowSlot.n) : null;
  });
}

export class Tasks {
  constructor(sim, list) {
    this.sim = sim;
    this.list = list;
    if (!sim.state.task) sim.state.task = { index: 0, count: 0, showAt: FIRST_DELAY };
    sim.listeners.push(e => this.on(e));
  }

  // The task on screen, or null while waiting for the next one to show (or when the chain is finished).
  get current() {
    const t = this.sim.state.task;
    return t.index < this.list.length && this.sim.state.t >= t.showAt ? this.list[t.index] : null;
  }

  on(e) {
    const task = this.current;
    if (!task) return;
    const hit = task.action === Action.Pick ? e.type === 'pickup' && e.producer === task.producer
      : task.action === Action.Feed ? e.type === 'drop' && e.to.kind === 'producer' && e.to.i === task.producer
        : task.action === Action.Shelf ? e.type === 'drop' && e.to.kind === 'shelf' && e.to.i === task.shelf
          : task.action === Action.Checkout ? e.type === 'customerPay'
            : task.action === Action.Upgrade ? e.type === 'upgraded' : false;
    if (hit) this.progress(this.sim.state.task.count + 1);
  }

  step() {
    const task = this.current;
    if (!task) return;
    const st = this.sim.state;
    if (task.action === Action.WaitMat) {
      const m = this.sim.store.mats[task.mat];
      if (!m || st.mats[m.name].done) this.progress(task.amount);
    } else if (task.action === Action.Cash) {
      this.progress(Math.min(st.cash, task.amount));
    } else if (task.action === Action.WaitQueue) {
      if ((st.customers || []).some(c => AT_CASHIER.has(c.state))) this.progress(task.amount);
    }
  }

  progress(n) {
    const t = this.sim.state.task, task = this.list[t.index];
    t.count = n;
    if (n < task.amount) return;
    this.sim.emit({ type: 'taskDone', index: t.index, name: task.name });
    t.index++;
    t.count = 0;
    t.showAt = this.sim.state.t + NEXT_DELAY;
  }
}
