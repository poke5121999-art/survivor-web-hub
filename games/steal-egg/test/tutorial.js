/*
 * Tutorial logic against a real Sim:  node test/tutorial.js   (from games/steal-egg)
 * Expected values are literals from rules/tutorial.md. The wall clock (hatch timers) follows sim time.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const G = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) {
  try { const d = fn(); pass++; console.log('  PASS ' + name + (d != null ? '  (' + d + ')' : '')); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 8).join('\n       ')); }
}

(async () => {
  const imp = f => import(pathToFileURL(path.join(G, 'js', 'sim', f)).href);
  const { Sim, STEP } = await imp('sim.js');
  const { NavMesh } = await imp('nav.js');
  const TU = await imp('tutorial.js');
  const { Tutorial, TUTORIAL_TEXTS, KEYS } = TU;
  const read = f => JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));
  const data = read('data/game.json');
  const navJson = read('art/world/navmesh.json');
  const T0 = 1763380800;

  function make(seed = 1) {
    const box = {};
    const sim = new Sim(data, new NavMesh(navJson), { seed, now: () => T0 + box.sim.state.t });
    box.sim = sim;
    for (let a = 1; a < 4; a++) sim.state.actors[a].brain.stun = { phase: 'down', t: -1e6 };   // rivals out of play
    return sim;
  }
  // Tutorial hooked to the sim's event listener (the view would do the same before draining sim.events).
  function hook(sim, saved = null, opts = {}) {
    const tut = new Tutorial(sim.state, data, saved, opts);
    sim.listeners.push(e => tut.onEvents([e]));
    return tut;
  }
  const P = sim => sim.state.actors[0];
  const put = (sim, p) => { const c = sim.nav.closest(p); sim.state.actors[0].pos = c; return c; };
  const seq = [];   // (activity/step/text) transitions seen while running
  function run(sim, tut, sec, until = null) {
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) {
      sim.step(); tut.update(STEP, sim.state);
      const v = tut.view, key = v.activity + '/' + v.step + '/' + (v.hint ? 'hint:' + v.hint.kind : '');
      if (seq[seq.length - 1] !== key) seq.push(key);
      if (until && until()) return true;
    }
    return false;
  }
  const tick = (tut, sec) => { for (let i = 0; i < Math.round(sec / STEP); i++) tut.update(STEP); };   // tutorial only, sim frozen
  const near = (a, b, m = 0.5) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= m;
  const at = (tut, pos, why) => { const p = tut.view.pointer; assert.ok(p && p.kind === 'world', why + ': no world pointer'); assert.ok(near(p.pos, pos), why + ' pointer ' + p.pos + ' vs ' + pos); };
  const farmC = data.farm.area.c, safeC = data.zones.safe.c, upC = data.farm.upgradeZone.c;

  console.log('Steal An Egg tutorial');

  check('texts: the 15 player-visible strings of rules/tutorial.md section 10', () => {
    assert.deepStrictEqual([...TUTORIAL_TEXTS].sort(), [
      'Close your gate to protect the Brainrot.', 'Go to the Brainrot on your farm and sell it.', 'Go to your farm and place the egg.',
      'Someone stole your Brainrot! Hit the AI and get it back.', 'Steal an egg from the animal.', 'Steal back your dropped Brainrot.',
      'Take the Brainrot to your farm and place it.', 'Take the stolen Brainrot to your farm and place it.', 'Take the stolen egg to the safe zone.',
      'Take your Brainrot back to your farm and place it.', 'The AI gate is open. Steal a Brainrot.', 'The AI gate is open. You can steal a Brainrot.',
      'Wait for your egg to hatch.', 'You have enough coins. Go to the farm upgrade point and upgrade your farm.',
      'Your egg is READY. Go to it and hatch the Brainrot.'].sort());
    assert.strictEqual(TUTORIAL_TEXTS.length, 15);
    return '15 strings';
  });

  let saved;
  check('main flow: egg -> safe zone -> farm -> hatch -> place -> sell -> steal from AI -> upgrade, texts + pointers + persistence', () => {
    const sim = make(2), tut = hook(sim);
    // start delay 2.0 s: nothing before the first tick, then the first activity
    run(sim, tut, 1.9);
    assert.deepStrictEqual(tut.view, { activity: null, step: null, stepIndex: null, text: null, pointer: null, hint: null });
    run(sim, tut, 0.3);
    let v = tut.view;
    assert.strictEqual(v.activity, 'EggDelivery'); assert.strictEqual(v.step, 'StealEgg');
    assert.strictEqual(v.text, 'Steal an egg from the animal.');
    const eggs = Object.values(sim.state.items).filter(i => i.kind === 'egg' && i.at.nest != null).map(i => sim.state.animals[i.at.nest].nests[i.at.slot]);
    const p0 = P(sim).pos, nearest = eggs.reduce((b, e) => (Math.hypot(e[0] - p0[0], e[2] - p0[2]) < Math.hypot(b[0] - p0[0], b[2] - p0[2]) ? e : b));
    at(tut, nearest, 'nearest nest egg');

    // steal (2 s standing in the trigger) -> ReachSafeZone
    put(sim, sim.state.animals[0].nests[0]);
    assert.ok(run(sim, tut, 3, () => P(sim).carry), 'egg picked');
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.step, 'ReachSafeZone'); assert.strictEqual(v.text, 'Take the stolen egg to the safe zone.');
    at(tut, safeC, 'safe zone');
    assert.strictEqual(tut.save()['tutorial_activity_egg_delivery_state'], 1);

    // safe zone entry -> PlaceEgg
    put(sim, safeC);
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.step, 'PlaceEgg'); assert.strictEqual(v.text, 'Go to your farm and place the egg.');
    at(tut, farmC, 'farm');
    assert.strictEqual(tut.save()['tutorial_activity_egg_delivery_state'], 2);

    // place -> activity 1 done, activity 2 (egg incubating)
    put(sim, farmC); sim.step();
    assert.ok(sim.action('place'));
    const eggId = Object.keys(sim.state.items).find(id => sim.state.items[id].kind === 'egg' && sim.state.items[id].at.farm === 0);
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.activity, 'HatchPlaceSell'); assert.strictEqual(v.step, 'HatchEgg');
    assert.strictEqual(v.text, 'Wait for your egg to hatch.');
    at(tut, sim.state.items[eggId].at.pos, 'placed egg');
    assert.deepStrictEqual(tut.save(), { tutorial_activity_egg_delivery_done: 1 });

    // 30 s hatch timer -> READY text; walk to it -> hatch -> brainrot auto-placed -> sell step
    put(sim, [100, 8.1, -20]);
    run(sim, tut, 28.5);
    assert.strictEqual(tut.view.text, 'Wait for your egg to hatch.');
    run(sim, tut, 1.6);
    assert.strictEqual(tut.view.text, 'Your egg is READY. Go to it and hatch the Brainrot.');
    put(sim, sim.state.items[eggId].at.pos);
    run(sim, tut, 1.5, () => Object.values(sim.state.items).some(i => i.kind === 'brainrot' && i.at.farm === 0));
    run(sim, tut, 0.3);
    const bid = Object.keys(sim.state.items).find(id => sim.state.items[id].kind === 'brainrot' && sim.state.items[id].at.farm === 0);
    v = tut.view;
    assert.strictEqual(v.step, 'SellBrainrot'); assert.strictEqual(v.text, 'Go to the Brainrot on your farm and sell it.');
    at(tut, sim.state.items[bid].at.pos, 'placed brainrot');

    // open AI gate with a brainrot behind it (for activity 3), then pick the brainrot up: PlaceBrainrot text
    sim.state.farms[1].gate.open = true; sim.state.farms[1].gate.remaining = 0;
    const ai = 'x1', aiPos = [data.rivalFarms[0].area.c[0], data.rivalFarms[0].area.c[1] + 0.2, data.rivalFarms[0].area.c[2]];
    sim.state.items[ai] = { kind: 'brainrot', seed: 5400, at: { farm: 1, pos: aiPos }, nextPay: null, reservedBy: null };
    put(sim, farmC); sim.step();
    assert.ok(sim.action('pickBrainrot', { item: bid }));
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.step, 'PlaceBrainrot'); assert.strictEqual(v.text, 'Take the Brainrot to your farm and place it.');
    at(tut, farmC, 'farm for brainrot');
    assert.ok(sim.action('place'));
    run(sim, tut, 0.3);
    assert.strictEqual(tut.view.step, 'SellBrainrot');
    const placed = Object.keys(sim.state.items).find(id => sim.state.items[id].kind === 'brainrot' && sim.state.items[id].at.farm === 0);
    put(sim, sim.state.items[placed].at.pos); sim.step();
    const c0 = sim.state.coins;
    assert.ok(sim.action('sell'));
    assert.ok(sim.state.coins - c0 >= 10000);

    // activity 3 (priority over the now affordable upgrade): gate open -> steal -> place on farm
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.activity, 'StealFromAI'); assert.strictEqual(v.step, 'StealBrainrot');
    assert.strictEqual(v.text, 'The AI gate is open. Steal a Brainrot.');
    at(tut, aiPos, 'AI farm brainrot');
    put(sim, aiPos);
    assert.ok(run(sim, tut, 3, () => P(sim).carry), 'brainrot stolen');
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.step, 'PlaceBrainrot'); assert.strictEqual(v.text, 'Take the stolen Brainrot to your farm and place it.');
    at(tut, farmC, 'farm for stolen brainrot');
    assert.strictEqual(tut.save()['tutorial_activity_steal_ai_state'], 1);
    put(sim, farmC); sim.step();
    assert.ok(sim.action('place'));

    // activity 4
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.activity, 'UpgradeFarm');
    assert.strictEqual(v.text, 'You have enough coins. Go to the farm upgrade point and upgrade your farm.');
    at(tut, upC, 'upgrade point');
    assert.deepStrictEqual(tut.save(), { tutorial_activity_egg_delivery_done: 1, tutorial_activity_hatch_sell_done: 1, tutorial_activity_steal_ai_done: 1 });
    put(sim, upC); sim.step();
    assert.ok(sim.action('upgradeFarm'));
    run(sim, tut, 0.5);
    assert.deepStrictEqual(tut.view, { activity: null, step: null, stepIndex: null, text: null, pointer: null, hint: null });
    saved = JSON.parse(JSON.stringify(tut.save()));
    assert.deepStrictEqual(saved, { tutorial_activity_egg_delivery_done: 1, tutorial_activity_hatch_sell_done: 1, tutorial_activity_steal_ai_done: 1,
      tutorial_activity_upgrade_done: 1, tutorial_main_activities_complete: 1 });
    return seq.filter((k, i) => k !== seq[i - 1]).join(' > ');
  });

  check('activity/step sequence seen by the view', () => {
    assert.deepStrictEqual(seq, ['null/null/', 'EggDelivery/StealEgg/', 'EggDelivery/ReachSafeZone/', 'EggDelivery/PlaceEgg/', 'null/null/', 'HatchPlaceSell/HatchEgg/',
      'HatchPlaceSell/SellBrainrot/', 'HatchPlaceSell/PlaceBrainrot/', 'HatchPlaceSell/SellBrainrot/', 'null/null/', 'StealFromAI/StealBrainrot/',
      'StealFromAI/PlaceBrainrot/', 'null/null/', 'UpgradeFarm/Upgrade/', 'null/null/']);
  });

  check('mid-way persistence: a saved sub-state and done flags restore', () => {
    const sim = make(3);
    const t = new Tutorial(sim.state, data, { tutorial_activity_egg_delivery_done: 1, tutorial_activity_hatch_sell_state: 2, tutorial_activity_steal_ai_state: 5 });
    assert.deepStrictEqual([t.eggState, t.hatchState, t.stealState, t.mainComplete], [0, 2, 1, false]);
    assert.deepStrictEqual(t.save(), { tutorial_activity_egg_delivery_done: 1, tutorial_activity_hatch_sell_state: 2, tutorial_activity_steal_ai_state: 1 });
    const all = new Tutorial(sim.state, data, { tutorial_activity_egg_delivery_done: 1, tutorial_activity_hatch_sell_done: 1, tutorial_activity_steal_ai_done: 1, tutorial_activity_upgrade_done: 1 });
    assert.strictEqual(all.mainComplete, true);
    assert.strictEqual(all.save()[KEYS.mainComplete], 1);
  });

  check('all 4 done -> never shows again after save/load, even with eggs lying around', () => {
    const sim = make(4), tut = hook(sim, saved);
    run(sim, tut, 10);
    assert.strictEqual(tut.view.activity, null); assert.strictEqual(tut.view.text, null);
    assert.ok(Object.values(sim.state.items).some(i => i.kind === 'egg' && i.at.nest != null));
    assert.strictEqual(tut.mainComplete, true);
    assert.deepStrictEqual(tut.save(), saved);
    const fresh = hook(make(4), null);
    run(make(4), fresh, 0.1);
    return 'saved ' + JSON.stringify(saved).length + ' bytes';
  });

  check('steal hints: first check 2.0 s, then every 15 s, 35 % roll, 12 s long, 60 s cooldown (seeded rng)', () => {
    const sim = make(5);
    sim.state.farms[2].gate.open = true; sim.state.farms[2].gate.remaining = 0;
    const aiPos = [data.rivalFarms[1].area.c[0], data.rivalFarms[1].area.c[1] + 0.2, data.rivalFarms[1].area.c[2]];
    sim.state.items.x2 = { kind: 'brainrot', seed: 5400, at: { farm: 2, pos: aiPos }, nextPay: null, reservedBy: null };
    const rolls = [0.5, 0.36, 0.35, 0.1, 0.1];   // fail, fail (0.36 > 0.35), hit (<= 0.35)
    let calls = 0;
    const tut = hook(sim, saved, { rng: () => rolls[Math.min(calls++, rolls.length - 1)] });
    put(sim, [100, 8.1, -20]);
    const hintAt = (limit) => { const t0 = sim.state.t; return run(sim, tut, limit - t0, () => tut.view.hint) ? sim.state.t : null; };
    // check 1 at 2.0 (roll 0.5 fails), check 2 at 17.0 (0.36 fails), check 3 at 32.0 (0.35 hits)
    assert.strictEqual(hintAt(31.8), null); assert.strictEqual(calls, 2, 'two rolls before 31.8 s');
    const t = hintAt(33);
    assert.ok(t >= 32.0 - 1e-6 && t < 32.4, 'hint at ' + t);
    let v = tut.view;
    assert.strictEqual(v.text, 'The AI gate is open. You can steal a Brainrot.'); assert.strictEqual(v.hint.kind, 'StealAIBrainrot');
    assert.strictEqual(v.activity, null);
    at(tut, aiPos, 'hint target');
    assert.ok(Math.abs(v.hint.until - (32.0 + 12)) < 0.3, 'until ' + v.hint.until);
    run(sim, tut, 11.5); assert.ok(tut.view.hint, 'still showing at ~43.5 s');
    run(sim, tut, 1.0); assert.strictEqual(tut.view.hint, null); assert.strictEqual(tut.view.text, null);
    const off = sim.state.t;                                   // ~44.2: cooldown 60 s
    run(sim, tut, 58); assert.strictEqual(tut.view.hint, null, 'no hint during cooldown');
    assert.strictEqual(calls, 3, 'no roll during cooldown');
    run(sim, tut, 3.5);
    assert.ok(tut.view.hint, 'hint after cooldown ' + (sim.state.t - off).toFixed(1) + ' s after it ended');
    // steal it for real: hint turns into "place it on your farm", placing stops it
    put(sim, aiPos);
    assert.ok(run(sim, tut, 3, () => P(sim).carry));
    run(sim, tut, 0.3);
    v = tut.view;
    assert.strictEqual(v.hint.kind, 'PlaceOnPlayerFarm'); assert.strictEqual(v.text, 'Take the stolen Brainrot to your farm and place it.');
    at(tut, farmC, 'hint farm');
    put(sim, farmC); sim.step();
    assert.ok(sim.action('place'));
    run(sim, tut, 0.3);
    assert.strictEqual(tut.view.hint, null);
    return 'hits at ' + t.toFixed(1) + ' s, gone ~' + off.toFixed(1) + ' s, none for 60 s';
  });

  check('recovery: a rival carries your brainrot -> get back, steal back, return, close gate', () => {
    const sim = make(6), tut = hook(sim, saved);
    P(sim).carry = null;
    put(sim, farmC);
    const id = 'b1';
    sim.state.items[id] = { kind: 'brainrot', seed: 5400, at: { farm: 0, pos: [farmC[0], farmC[1] + 0.1, farmC[2] + 1] }, nextPay: null, reservedBy: null };
    run(sim, tut, 2.3);                                          // start delay 2 s; gate open after 1.0 s; brainrot becomes "known"
    assert.ok(sim.state.farms[0].gate.open);
    const rival = sim.state.actors[1];
    rival.brain.stun = null; rival.pos = [-60, 8.1, 0]; rival.carry = { item: id }; sim.state.items[id].at = { carried: 1 };
    tick(tut, 0.3);
    let v = tut.view;
    assert.strictEqual(v.activity, 'Recovery'); assert.strictEqual(v.step, 'GetBackFromAI');
    assert.strictEqual(v.text, 'Someone stole your Brainrot! Hit the AI and get it back.');
    at(tut, rival.pos, 'thief');
    rival.carry = null; sim.state.items[id].at = { ground: [-61, 8.1, 0] };
    tick(tut, 0.3);
    assert.strictEqual(tut.view.step, 'RecoverDroppedBrainrot'); assert.strictEqual(tut.view.text, 'Steal back your dropped Brainrot.');
    at(tut, [-61, 8.1, 0], 'dropped');
    P(sim).carry = { item: id }; sim.state.items[id].at = { carried: 0 };
    tick(tut, 0.3);
    assert.strictEqual(tut.view.step, 'ReturnToPlayerFarm'); assert.strictEqual(tut.view.text, 'Take your Brainrot back to your farm and place it.');
    at(tut, farmC, 'farm');
    put(sim, farmC); sim.step();
    assert.ok(sim.action('place'));
    run(sim, tut, 0.5);
    v = tut.view;
    assert.strictEqual(v.step, 'ClosePlayerGate'); assert.strictEqual(v.text, 'Close your gate to protect the Brainrot.');
    at(tut, data.gates.player.pos, 'gate');
    put(sim, data.gates.player.pos); sim.step();
    assert.ok(sim.action('lockGate', { long: false }));
    run(sim, tut, 0.3);
    assert.strictEqual(tut.view.activity, null); assert.strictEqual(tut.view.text, null);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
