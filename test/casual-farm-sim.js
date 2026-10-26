/*
 * My Mini Mart (games/casual-farm): plays Store 1 with the bot on the real data (scene.json, data/store1.json,
 * navmesh.json) and checks the loop end to end without a browser: every mat completes, money and stock invariants hold.
 *
 *   node test/casual-farm-sim.js            # 90 sim-minutes, seed 1
 *   MM_MINUTES=30 MM_SEED=7 node test/casual-farm-sim.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const G = path.resolve(__dirname, '..', 'games', 'casual-farm');
const MINUTES = +(process.env.MM_MINUTES || 90);
const SEED = +(process.env.MM_SEED || 1);
const DT = 1 / 30;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

(async () => {
  const imp = f => import(pathToFileURL(path.join(G, 'js', 'sim', f)).href);
  const { buildStore } = await imp('store.js');
  const { Sim, carryLimit } = await imp('sim.js');
  const { Customers } = await imp('customers.js');
  const { NavMesh } = await imp('nav.js');
  const { Bot } = await imp('bot.js');
  const { GridNav } = await imp('grid.js');
  const { Workers } = await imp('workers.js');
  const { Tasks, buildTasks } = await imp('tasks.js');
  const read = f => JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));

  const store = buildStore(read('art/store1/scene.json'), read('data/store1.json'));
  const nav = new NavMesh(read('art/store1/navmesh.json'));
  const grid = new GridNav(nav);
  const sim = new Sim(store, { rng: mulberry32(SEED) });
  const customers = new Customers(sim, grid);
  const taskList = buildTasks(store);
  sim.systems.push(customers, new Workers(sim, grid), new Tasks(sim, taskList));
  const bot = new Bot(sim, grid);

  const firstDone = {}, tasksDone = [];
  let midSave = null;
  let paid = 0, served = 0, gaveUp = 0, maxCustomers = 0, invariantErr = null;
  const steps = Math.round(MINUTES * 60 / DT);
  for (let k = 0; k < steps; k++) {
    bot.step(DT);
    sim.step(DT, { nav, grid });
    for (const e of sim.events) {
      if (e.type === 'matDone' && firstDone[e.name] == null) firstDone[e.name] = sim.state.t;
      if (e.type === 'customerPay') { paid += e.amount; served++; }
      if (e.type === 'customerLeave' && !e.paid) gaveUp++;
      if (e.type === 'taskDone') tasksDone.push([e.index, sim.state.t]);
    }
    sim.events.length = 0;
    const st = sim.state;
    if (!midSave && Object.keys(firstDone).length >= 8) midSave = { json: JSON.stringify(sim.save()), cash: st.cash, task: st.task.index, done: Object.keys(firstDone).length };
    maxCustomers = Math.max(maxCustomers, st.customers.length);
    if (!invariantErr) {
      if (st.cash < 0) invariantErr = `cash ${st.cash} at ${st.t.toFixed(1)}s`;
      store.shelves.forEach((sh, i) => { if (st.shelves[i].count < 0 || st.shelves[i].count > sh.slots.length) invariantErr = `${sh.name} count ${st.shelves[i].count}`; });
      if (st.carry.length > carryLimit(st.stackLevel)) invariantErr = `carry ${st.carry.length} > ${carryLimit(st.stackLevel)}`;
      store.producers.forEach((p, i) => { if (st.producers[i].out.filter(x => x != null).length > p.limit) invariantErr = `${p.name} output over limit`; });
    }
    if (Object.keys(firstDone).length === store.mats.length && k % 300 === 0 && sim.state.t > 60) break;
  }

  const t = n => (firstDone[n] != null ? (firstDone[n] / 60).toFixed(1) + ' min' : 'never');
  const st = sim.state;
  console.log(`Store 1, seed ${SEED}, ${(st.t / 60).toFixed(1)} sim-minutes: ${Object.keys(firstDone).length}/${store.mats.length} mats, ` +
    `cash ${st.cash}, stack level ${st.stackLevel}, served ${served} (paid ${paid}), gave up ${gaveUp}, max customers on map ${maxCustomers}`);
  ['Mat_Activate_Cashier', 'Mat_Activate_Tomato_Shelf', 'Mat_Activate_Plant_Tomato', 'Mat_Activate_Chicken', 'Mat_Unlock_Worker_ShelfA',
    'Mat_Activate_Blender', 'Mat_Activate_StoreTile1', 'Mat_Activate_StoreTile2', 'Mat_Activate_Oven_Tabletop', 'Mat_Activate_NextMart']
    .forEach(n => console.log(`    ${n}: ${t(n)}`));

  check('the 10 starting coin piles are collected', st.coins.every(c => c.taken));
  check('first three mats complete from the starting cash', ['Mat_Activate_Cashier', 'Mat_Activate_Tomato_Shelf', 'Mat_Activate_Plant_Tomato'].every(n => firstDone[n] != null));
  check('customers buy and pay at the cashier', served >= 20, `${served} served`);
  check('the player stack is upgraded at least once', st.stackLevel >= 1, `level ${st.stackLevel}`);
  check('every Store 1 mat completes', Object.keys(firstDone).length === store.mats.length,
    store.mats.filter(m => firstDone[m.name] == null).map(m => m.name).join(', ') || 'all 40');
  console.log(`    tutorial: ${tasksDone.map(([i, t]) => `${i}@${(t / 60).toFixed(1)}`).join(' ')}`);
  check('the tutorial has the 15 TaskControllers of Store 1', taskList.length === 15, `${taskList.length} tasks`);
  check('every tutorial task completes, in order', tasksDone.length === taskList.length && tasksDone.every(([i], k) => i === k),
    `${tasksDone.length}/${taskList.length}`);
  if (midSave) {
    const back = new Sim(store, { rng: mulberry32(SEED), save: JSON.parse(midSave.json) });
    const doneBack = store.mats.filter(m => back.state.mats[m.name].done).length;
    check('a save restores cash, finished mats and the tutorial step', back.state.cash === midSave.cash && doneBack === midSave.done && back.state.task.index === midSave.task,
      `cash ${back.state.cash}/${midSave.cash}, mats ${doneBack}/${midSave.done}, task ${back.state.task.index}/${midSave.task}`);
  }
  check('money and stock invariants hold all run', !invariantErr, invariantErr || 'ok');
  console.log(`PASS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
