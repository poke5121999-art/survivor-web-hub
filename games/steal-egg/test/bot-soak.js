/*
 * Bot soak: the bot plays the real data on the real navmesh for MINUTES simulated minutes (default 60) through the
 * same sim.input / sim.action a human uses. Logs stalls (no bot progress for 120 s), coins over time, farm level,
 * eggs stolen, brainrots sold, rival thefts. Fails on an exception or a farm level below 3 at the end.
 *   node test/bot-soak.js            MINUTES=120 SEED=7 node test/bot-soak.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const G = path.resolve(__dirname, '..');
const MINUTES = +(process.env.MINUTES || 60);
const SEED = +(process.env.SEED || 1);

(async () => {
  const imp = f => import(pathToFileURL(path.join(G, 'js', 'sim', f)).href);
  const { Sim, STEP } = await imp('sim.js');
  const { NavMesh } = await imp('nav.js');
  const { Bot } = await imp('bot.js');
  const read = f => JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));
  const data = read('data/game.json');
  const nav = new NavMesh(read('art/world/navmesh.json'));
  const colliders = path.join(G, 'art', 'world', 'colliders.json');
  if (fs.existsSync(colliders) && nav.setColliders) nav.setColliders(read('art/world/colliders.json'));
  const T0 = 1763380800;
  const box = {};
  const sim = box.sim = new Sim(data, nav, { seed: SEED, now: () => T0 + box.sim.state.t });
  const bot = new Bot(sim);

  const n = {};
  const count = k => { n[k] = (n[k] || 0) + 1; };
  sim.listeners.push(e => {
    if (e.type === 'pick' && e.actor === 0 && e.kind === 'egg') count('eggsStolen');
    if (e.type === 'pick' && e.actor > 0 && e.kind === 'egg') count('rivalEggSteals');
    if (e.type === 'place' && e.actor === 0 && e.kind === 'egg') count('eggsPlaced');
    if (e.type === 'hatch' && e.farm === 0) count('hatched');
    if (e.type === 'hatch' && e.farm > 0) count('rivalHatched');
    if (e.type === 'sell') count('sold');
    if (e.type === 'rivalStole' && e.from === 0) count('rivalThefts');
    if (e.type === 'rivalTookCarried') count('rivalTookFromHands');
    if (e.type === 'animalHit' && e.actor === 0) count('animalHitsOnBot');
    if (e.type === 'hit' && e.attacker === 0) count('knockouts');
    if (e.type === 'hit' && e.target === 0) count('botHit');
    if (e.type === 'death') count('deaths');
    if (e.type === 'farmUpgrade') console.log(`  t=${fmt(sim.state.t)} farm level ${e.level} (capacity ${e.capacity}), coins ${sim.state.coins}`);
    if (e.type === 'speedPlan') console.log(`  t=${fmt(sim.state.t)} speed plan ${e.plan}, speed ${sim.state.actors[0].moveSpeed}, coins ${sim.state.coins}`);
  });
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  console.log(`Bot soak: ${MINUTES} min, seed ${SEED}${fs.existsSync(colliders) ? ', with colliders' : ''}`);
  const total = Math.round(MINUTES * 60 / STEP), every = Math.round(5 * 60 / STEP);
  const curve = [];
  let error = null;
  const wall = Date.now();
  try {
    for (let i = 1; i <= total; i++) {
      sim.input(bot.input());
      sim.step();
      sim.events.length = 0;
      if (i % every === 0) curve.push(`${Math.round(sim.state.t / 60)}m:${sim.state.coins}`);
    }
  } catch (e) { error = e; }
  const s = sim.state;
  console.log('  coins over time: ' + curve.join('  '));
  console.log(`  end t=${fmt(s.t)}: coins ${s.coins}, farm level ${s.farms[0].level}, speed ${s.actors[0].moveSpeed}, ` +
    `placed ${Object.values(s.items).filter(i => i.at.farm === 0 && i.kind === 'brainrot').length} brainrots, ` +
    `rival farms ${[1, 2, 3].map(f => Object.values(s.items).filter(i => i.at.farm === f && i.kind === 'brainrot').length).join('/')} brainrots`);
  console.log('  ' + Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(`  stalls (120 s without progress): ${bot.stalls.length}` + (bot.stalls.length ? '  ' + bot.stalls.slice(0, 8).map(x => `${fmt(x.t)} ${x.goal} @${x.pos.join(',')}`).join(' | ') : ''));
  console.log(`  wall time ${((Date.now() - wall) / 1000).toFixed(1)} s`);
  let ok = true;
  if (error) { ok = false; console.log('  FAIL exception: ' + (error.stack || error)); }
  if (s.farms[0].level < 3) { ok = false; console.log('  FAIL farm level ' + s.farms[0].level + ' < 3'); }
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
