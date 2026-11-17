/*
 * Steal An Egg rules sim, no browser:  node test/sim.js   (from games/steal-egg)
 * Each check plays the real data (data/game.json) on the real navmesh and compares against a literal number from
 * rules/*.md. The wall clock (hatch timers) is a fake clock that follows sim time.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const G = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) {
  try { const d = fn(); pass++; console.log('  PASS ' + name + (d != null ? '  (' + d + ')' : '')); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}

(async () => {
  const imp = f => import(pathToFileURL(path.join(G, 'js', 'sim', f)).href);
  const { Sim, STEP } = await imp('sim.js');
  const { NavMesh } = await imp('nav.js');
  const { STATE, OBJ } = await imp('rivals.js');
  const read = f => JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));
  const data = read('data/game.json');
  const navJson = read('art/world/navmesh.json');
  const T0 = 1763380800;  // integer unix seconds; FarmPlacedEgg uses whole seconds

  function make(seed = 1) {
    const box = {};
    const sim = new Sim(data, new NavMesh(navJson), { seed, now: () => T0 + box.sim.state.t });
    box.sim = sim;
    return sim;
  }
  const run = (sim, sec, until = null) => {
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) { sim.step(); if (until && until()) return true; }
    return false;
  };
  const P = sim => sim.state.actors[0];
  const put = (sim, a, p) => { const c = sim.nav.closest(p); sim.state.actors[a].pos = c; return c; };
  const away = [100, 8.1, -20];  // on the animal strip, far from every farm and rival patrol point
  const eggOf = (sim, animal) => Object.keys(sim.state.items).find(id => sim.state.items[id].at.nest === animal && sim.state.items[id].at.slot === 0);
  const clearEggs = sim => {
    for (const id of Object.keys(sim.state.items)) if (sim.state.items[id].kind === 'egg') delete sim.state.items[id];
    sim.state.animals.forEach(a => { a.respawnAt = null; a.stolen = []; a.egg = null; });
  };
  // Park the rivals out of play (stunned at home far from the test) unless a test needs them.
  const freezeRivals = sim => { for (let a = 1; a < 4; a++) { sim.state.actors[a].brain.stun = { phase: 'down', t: -1e6 }; } };
  const giveBrainrot = (sim, seed) => {
    const id = 'i' + sim.state.nextId++;
    sim.state.items[id] = { kind: 'brainrot', seed, at: { carried: 0 }, nextPay: null, reservedBy: null };
    P(sim).carry = { item: id };
    return id;
  };
  const farmPoint = sim => sim.nav.closest(data.farm.zone.c);

  console.log('Steal An Egg sim rules');

  check('start coins 1000', () => { const sim = make(); assert.strictEqual(sim.state.coins, 1000); return sim.state.coins; });

  check('3 rivals + 7 sleeping animals with 2-3 eggs each', () => {
    const sim = make();
    assert.strictEqual(sim.state.actors.length, 4);
    assert.deepStrictEqual(sim.state.actors.slice(1).map(a => a.id), ['AI_01', 'AI_02', 'AI_03']);
    assert.ok(sim.state.animals.every(a => a.state === 'sleep'));
    const per = sim.state.animals.map((a, i) => Object.values(sim.state.items).filter(it => it.at.nest === i).length);
    assert.ok(per.every(n => n >= 2 && n <= 3), per.join(','));
    return 'eggs per nest ' + per.join(',');
  });

  let stealSim, stolenEgg;
  check('stealing an egg takes 2.0 s of standing in its trigger', () => {
    const sim = stealSim = make(2);
    freezeRivals(sim);
    put(sim, 0, sim.state.animals[0].nests[0]);
    sim.step();
    const t0 = P(sim).steal ? P(sim).steal.t0 : null;
    assert.ok(P(sim).steal, 'fill started');
    const id = stolenEgg = P(sim).steal.item;   // several eggs may overlap: the last trigger entered wins (BeginEggSteal)
    let picked = null;
    sim.listeners.push(e => { if (e.type === 'pick' && e.actor === 0) picked = e; });
    run(sim, 1.9 - STEP);
    assert.strictEqual(P(sim).carry, null, 'not yet at 1.9 s');
    run(sim, 0.2, () => P(sim).carry);
    assert.ok(P(sim).carry && P(sim).carry.item === id);
    const took = picked.t - t0;
    assert.ok(Math.abs(took - 2.0) < 1e-6, 'took ' + took);
    return 'carried after ' + took.toFixed(3) + ' s';
  });

  check('a stolen egg wakes exactly its animal', () => {
    const sim = stealSim;
    const states = sim.state.animals.map(a => a.state);
    assert.deepStrictEqual(states, ['chase', 'sleep', 'sleep', 'sleep', 'sleep', 'sleep', 'sleep']);
    assert.strictEqual(sim.state.animals[0].target, 0);
    return 'White Duck chases, 6 others asleep';
  });

  check('an animal hit drops the egg at the carrier (needs a new entry to steal again)', () => {
    const sim = stealSim;
    const hit = run(sim, 20, () => !P(sim).carry);
    assert.ok(hit, 'duck reached the player');
    const it = sim.state.items[stolenEgg];
    assert.ok(it.at.ground, 'egg on the ground');
    const d = Math.hypot(it.at.ground[0] - P(sim).pos[0], it.at.ground[2] - P(sim).pos[2]);
    assert.ok(d < 1e-6, 'at the carrier, off by ' + d);
    assert.strictEqual(it.waitExit, true);
    assert.strictEqual(P(sim).steal, null);
    run(sim, 0.5);
    assert.strictEqual(sim.state.animals[0].state, 'return', 'animal goes home');
    return 'dropped at ' + it.at.ground.map(v => v.toFixed(2)).join(',');
  });

  check('a placed egg hatches after 30 s into one of its reward options', () => {
    const sim = make(3);
    freezeRivals(sim);
    put(sim, 0, sim.state.animals[0].nests[0]);
    run(sim, 2.1, () => P(sim).carry);
    const id = P(sim).carry.item, type = sim.state.items[id].eggType;
    put(sim, 0, farmPoint(sim));
    while ((T0 + sim.state.t) % 1 > 1e-6 && (T0 + sim.state.t) % 1 < 1 - 1e-6) sim.step();  // whole second of the clock
    sim.step();
    assert.ok(sim.state.ui.placeButton === 'PLACE EGG');
    assert.ok(sim.action('place'));
    const placedAt = sim.state.t, it = sim.state.items[id];
    assert.ok(it.at.farm === 0 && it.readyAt === Math.floor(T0 + placedAt) + 30);
    assert.strictEqual(sim.state.animals[0].state === 'chase', false, 'committing the egg ends the chase');
    put(sim, 0, away);
    run(sim, 29.9);
    assert.strictEqual(it.ready, false, 'not ready at 29.9 s');
    run(sim, 0.2);
    assert.strictEqual(it.ready, true, 'ready at 30 s');
    put(sim, 0, it.at.pos);
    let hatched = null;
    sim.listeners.push(e => { if (e.type === 'hatch' && e.egg === id) hatched = e; });
    run(sim, 1, () => hatched);
    assert.ok(hatched, 'hatched');
    const opts = data.eggs.find(e => e.id === type).options;
    assert.ok(opts.includes(hatched.seed), hatched.seed + ' in ' + opts);
    const br = sim.state.items[hatched.item];
    assert.strictEqual(br.at.farm, 0, 'auto-placed on the farm');
    return `egg ${type} -> seed ${hatched.seed} (options ${opts.join('/')}), ready 30 s after placing`;
  });

  check('a placed brainrot pays its rate every 1.0 s', () => {
    const sim = make(4);
    freezeRivals(sim);
    clearEggs(sim);
    put(sim, 0, farmPoint(sim));
    giveBrainrot(sim, 5403);            // DinDinDinDun Character: ratePerSecond 17
    assert.ok(sim.action('place'));
    const c0 = sim.state.coins;
    run(sim, 1.0 - 1e-6);
    const c1 = sim.state.coins;
    run(sim, 2.0);
    assert.strictEqual(c1 - c0, 17);
    assert.strictEqual(sim.state.coins - c0, 51);
    return '+17 at 1.0 s, +51 at 3.0 s';
  });

  check('selling a placed brainrot pays MemeRotCharacter.price', () => {
    const sim = make(5);
    freezeRivals(sim);
    clearEggs(sim);
    put(sim, 0, farmPoint(sim));
    const id = giveBrainrot(sim, 5411);  // Saturno_Saturnita_Character: price 38000 (SeedData.price 55 is not used)
    sim.action('place');
    put(sim, 0, sim.state.items[id].at.pos);
    sim.step();
    assert.strictEqual(sim.state.ui.sellTarget, id);
    const c0 = sim.state.coins;
    assert.ok(sim.action('sell'));
    assert.strictEqual(sim.state.coins - c0, 38000);
    assert.strictEqual(sim.state.items[id], undefined);
    return '+38000';
  });

  check('farm capacity 3 -> upgrade costs 4000 -> capacity 5', () => {
    const sim = make(6);
    freezeRivals(sim);
    clearEggs(sim);
    put(sim, 0, farmPoint(sim));
    for (const seed of [5400, 5401, 5402]) { giveBrainrot(sim, seed); assert.ok(sim.action('place')); }
    giveBrainrot(sim, 5403);
    let toast = null;
    sim.listeners.push(e => { if (e.type === 'toast') toast = e.text; });
    assert.strictEqual(sim.action('place'), false);
    assert.strictEqual(toast, 'Farm is full. Upgrade capacity first');
    assert.strictEqual(sim.state.ui.capacity.max, 3);
    assert.strictEqual(sim.state.ui.capacity.cost, 4000);
    sim.state.coins = 5000;
    put(sim, 0, data.farm.upgradeZone.c);
    sim.step();
    assert.ok(sim.state.ui.upgradePanel);
    assert.ok(sim.action('upgradeFarm'));
    assert.strictEqual(sim.state.coins, 1000);
    assert.strictEqual(sim.state.ui.capacity.max, 5);
    assert.strictEqual(sim.state.ui.capacity.cost, 10000);
    put(sim, 0, farmPoint(sim));
    sim.step();
    assert.ok(sim.action('place'));
    return 'level 1: capacity 5, next 10000';
  });

  check('speed plan 1 costs 3000 -> speed 10 (and the exact-coins quirk)', () => {
    const sim = make(7);
    freezeRivals(sim);
    put(sim, 0, data.zones.shops.shoes.c);
    sim.step();
    assert.strictEqual(sim.state.ui.shop, 'shoes');
    sim.state.coins = 5000;
    assert.strictEqual(P(sim).moveSpeed, 5.5);
    assert.ok(sim.action('buySpeed', { plan: 1 }));
    assert.strictEqual(sim.state.coins, 2000);
    assert.strictEqual(P(sim).moveSpeed, 10);
    // UpdateSpeed quirk: paying exactly your balance charges nothing now, but saves the speed for the next session.
    const q = make(8);
    freezeRivals(q);
    put(q, 0, data.zones.shops.shoes.c);
    q.step();
    q.state.coins = 3000;
    q.action('buySpeed', { plan: 1 });
    assert.strictEqual(q.state.coins, 3000);
    assert.strictEqual(P(q).moveSpeed, 5.5);
    assert.strictEqual(q.state.upgrades.speedPlans[1], true);
    q.startSession();
    assert.strictEqual(P(q).moveSpeed, 10);
    return '5000 -> 2000 coins, speed 5.5 -> 10; exact 3000: free, applied next session';
  });

  check('a rival steals an egg and hatches it on its farm', () => {
    const sim = make(9);
    put(sim, 0, away);
    const placed = new Map();
    let done = null;
    sim.listeners.push(e => {
      if (e.type === 'place' && e.kind === 'egg' && e.farm > 0) placed.set(e.item, { type: sim.state.items[e.item].eggType, farm: e.farm, actor: e.actor });
      if (e.type === 'hatch' && e.farm > 0 && placed.has(e.egg) && !done) done = { ...placed.get(e.egg), seed: e.seed, item: e.item };
    });
    const ok = run(sim, 600, () => done);
    assert.ok(ok, 'a rival egg hatched within 10 min');
    const opts = data.eggs.find(x => x.id === done.type).options;
    assert.ok(opts.includes(done.seed));
    assert.strictEqual(sim.state.items[done.item].at.farm, done.farm);
    assert.strictEqual(done.farm, data.rivals[done.actor - 1].farm + 1);
    return `${sim.state.actors[done.actor].id}: egg ${done.type} -> seed ${done.seed} on farm ${done.farm} at t=${sim.state.t.toFixed(1)} s`;
  });

  function brainrotTheft(gateClosed) {
    const sim = make(10);
    clearEggs(sim);
    put(sim, 0, farmPoint(sim));
    giveBrainrot(sim, 5400);
    sim.action('place');
    run(sim, 1.5);   // the player gate opens after 1.0 s
    if (gateClosed) {
      put(sim, 0, data.gates.player.pos);
      sim.step();
      assert.ok(sim.state.ui.gateLock, 'lock buttons shown at the open gate');
      assert.ok(sim.action('lockGate', { long: true }));   // 180 s (ad, granted at once)
    }
    put(sim, 0, away);
    let stole = null, blocked = 0;
    sim.listeners.push(e => { if (e.type === 'rivalStole' && e.from === 0) stole = e; if (e.type === 'rivalBlocked') blocked++; });
    run(sim, 170, () => stole && sim.state.items[stole.item].at.farm > 0);
    return { sim, stole, blocked };
  }

  check('a rival steals a player brainrot through the open gate', () => {
    const { sim, stole } = brainrotTheft(false);
    assert.ok(stole, 'stolen');
    const it = sim.state.items[stole.item];
    assert.strictEqual(it.at.farm, data.rivals[stole.actor - 1].farm + 1);
    return `${sim.state.actors[stole.actor].id} took it home by t=${sim.state.t.toFixed(1)} s`;
  });

  check('... but not through the closed gate', () => {
    const { sim, stole, blocked } = brainrotTheft(true);
    assert.strictEqual(stole, null);
    assert.ok(blocked > 0, 'objective aborted as blocked');
    assert.strictEqual(Object.values(sim.state.items).filter(i => i.kind === 'brainrot' && i.at.farm === 0).length, 1);
    return `${blocked} blocked attempts in 170 s, gate ${sim.state.farms[0].gate.remaining.toFixed(1)} s left`;
  });

  check('a player hit stuns a rival 10 s and pays 100', () => {
    const sim = make(11);
    clearEggs(sim);
    const r = sim.state.actors[2], home = r.home;
    r.brain.nextObjectiveCheck = 1e9;
    const rp = put(sim, 2, [-60, 8.1, 0]);
    const pp = put(sim, 0, [rp[0], rp[1], rp[2] - 1.2]);
    P(sim).yaw = 0;   // facing +z, towards the rival
    sim.state.actors[0].targetYaw = 0;
    const c0 = sim.state.coins;
    assert.ok(sim.action('attack'));
    run(sim, 0.3 + 2 * STEP, () => r.brain.stun);
    assert.ok(r.brain.stun, 'stunned');
    assert.strictEqual(sim.state.coins - c0, 100);
    const t0 = sim.state.t;
    run(sim, 10.3 + 1, () => !r.brain.stun);
    const dur = sim.state.t - t0;
    assert.ok(Math.abs(dur - 10.3) <= 2 * STEP, 'down for ' + dur);
    assert.deepStrictEqual(r.pos, data.rivals[1].home);
    return `+100 coins, down ${dur.toFixed(2)} s (0.3 + 10), back home`;
  });

  check('a rival hit costs the player 1 HP of 5 and 3 s of stun', () => {
    const sim = make(12);
    clearEggs(sim);
    const a = 2, r = sim.state.actors[a];
    r.brain.nextObjectiveCheck = 1e9;
    const rp = put(sim, a, [-60, 8.1, 0]);
    put(sim, 0, [rp[0] + 0.8, rp[1], rp[2]]);
    let hit = null;
    sim.listeners.push(e => { if (e.type === 'hit' && e.target === 0 && !hit) hit = { ...e, t: sim.state.t }; });
    run(sim, 6, () => hit);
    assert.ok(hit, 'hit');
    assert.strictEqual(P(sim).hp, 4);
    assert.strictEqual(P(sim).combat.state, 'knock');
    const p0 = P(sim).pos.slice();
    run(sim, 1.0);
    const thrown = Math.hypot(P(sim).pos[0] - p0[0], P(sim).pos[2] - p0[2]);
    assert.ok(thrown > 5, 'thrown ' + thrown);
    run(sim, 3.0 - 1.0 - STEP, () => P(sim).combat.state === 'ok');
    assert.notStrictEqual(P(sim).combat.state, 'ok');
    run(sim, 3 * STEP, () => P(sim).combat.state === 'ok');
    assert.strictEqual(P(sim).combat.state, 'ok');
    return `HP 5 -> 4, thrown ${thrown.toFixed(1)} m, stunned 3.0 s`;
  });

  check('save -> load gives the same state, and both copies stay equal while playing', () => {
    const sim = make(13);
    run(sim, 120);
    const json = sim.save();
    const twin = make(99);
    assert.ok(twin.load(json));
    assert.deepStrictEqual(JSON.parse(twin.save()), JSON.parse(json));
    assert.deepStrictEqual(twin.state, JSON.parse(json));
    run(sim, 60); run(twin, 60);
    assert.strictEqual(twin.save(), sim.save());
    return `${(json.length / 1024).toFixed(1)} kB, ${Object.keys(sim.state.items).length} items`;
  });

  check('a new session keeps coins, farm and brainrots, resets world and gates', () => {
    const sim = make(14);
    freezeRivals(sim);
    clearEggs(sim);
    put(sim, 0, farmPoint(sim));
    giveBrainrot(sim, 5400); sim.action('place');
    giveBrainrot(sim, 5401);
    run(sim, 5);
    const coins = sim.state.coins;
    const s2 = make(15);
    s2.load(sim.save());
    s2.startSession();
    assert.strictEqual(s2.state.coins, coins);
    const br = Object.values(s2.state.items).filter(i => i.kind === 'brainrot');
    assert.deepStrictEqual(br.map(i => Object.keys(i.at)[0]).sort(), ['farm', 'stowed']);
    assert.strictEqual(s2.state.farms[0].gate.remaining, 1);
    assert.strictEqual(s2.state.farms[1].gate.remaining, 30);
    assert.ok(s2.state.animals.every(a => a.state === 'sleep'));
    return 'coins ' + coins + ', 1 placed + 1 stowed brainrot kept';
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
