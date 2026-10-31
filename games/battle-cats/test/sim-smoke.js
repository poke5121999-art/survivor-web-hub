// Headless sim smoke. Two layers:
//  (1) real data loads with sane fields (export sanity)
//  (2) sim MECHANICS with synthetic, controlled stats (deterministic win & loss)
const fs = require('fs'), path = require('path');
const BCSim = require('../js/sim.js');
const D = path.join(__dirname, '..', 'data');
const cats = JSON.parse(fs.readFileSync(path.join(D, 'cats.json')));
const enemies = JSON.parse(fs.readFileSync(path.join(D, 'enemies.json')));

let ok = true;
function assert(c, m) { if (!c) { ok = false; console.log('FAIL:', m); } else console.log('pass:', m); }

// ---- (1) data sanity ----
const catIds = Object.keys(cats).filter(u => cats[u].forms[0]);
assert(catIds.length > 50, `cats with deploy form loaded (${catIds.length})`);
assert(Object.keys(enemies).length > 40, `enemies loaded (${Object.keys(enemies).length})`);
const sample = cats[catIds[0]];
assert(sample && typeof sample.name === 'string', 'cat name resolves (' + sample.name + ')');
const sf = sample.forms[0];
assert(sf.hp > 0 && sf.atk >= 0 && sf.range > 0 && sf.cost >= 0, 'deploy form has hp/atk/range/cost');

// ---- (2) mechanics with synthetic stats ----
const S = (o) => Object.assign({ hp: 100, kb: 1, speed: 10, atk: 50, tba: 20, range: 140,
  cost: 100, recharge: 20, cs: 0, cw: 50, area: 0, fsw: 5 }, o);

const brawler = { uid: 900, form: 'f', name: 'Brawler', stat: S({ hp: 2000, atk: 300, range: 150, cost: 120, recharge: 30 }) };
const loadout = { 0: brawler };
const weak = S({ hp: 400, atk: 40, range: 120, speed: 8, tba: 30 });
const strong = S({ hp: 6000, atk: 800, range: 300, speed: 12, area: 1, kb: 2 });
const enemyIndex = { 90: weak, 91: strong };

function play(stage, frames) {
  const sim = new BCSim.Sim(stage, loadout, enemyIndex);
  let deploys = 0, maxE = 0, baseHitFrame = 0;
  for (let f = 0; f < frames && !sim.over; f++) {
    sim.tick();
    if (sim.frame % 6 === 0) {
      if (sim.workerLvl < 4 && sim.money > BCSim.regenCost(sim.workerLvl) + 150) sim.upgradeWorker();
      if (sim.deploy(0)) deploys++;
    }
    if (!baseHitFrame && sim.enemyBaseHp < sim.enemyBaseMax) baseHitFrame = sim.frame;
    maxE = Math.max(maxE, sim.units.filter(u => u.side === 'enemy').length);
  }
  return { sim, deploys, maxE, baseHitFrame };
}

const winStage = { length: 2200, baseHp: 3000, bg: 0, maxOnScreen: 8,
  spawns: [{ id: 90, count: 3, first: 90, rmin: 240, rmax: 360, base: 0, mult: 100 }] };
const loseStage = { length: 4000, baseHp: 200000, bg: 0, maxOnScreen: 12,
  spawns: [{ id: 91, count: 30, first: 20, rmin: 30, rmax: 50, base: 0, mult: 100 }] };

const W = play(winStage, BCSim.FPS * 300);
const L = play(loseStage, BCSim.FPS * 300);

console.log('WIN stage  ->', W.sim.over === 1 ? 'WIN' : W.sim.over === -1 ? 'LOSE' : 'TIMEOUT',
  '| deploys', W.deploys, '| maxEnemies', W.maxE, '| enemyBase', Math.round(W.sim.enemyBaseHp), '/', W.sim.enemyBaseMax, '| firstBaseHit@', W.baseHitFrame);
console.log('LOSE stage ->', L.sim.over === 1 ? 'WIN' : L.sim.over === -1 ? 'LOSE' : 'TIMEOUT',
  '| catBase', Math.round(L.sim.catBaseHp));

assert(W.deploys > 0, 'cats deployed (money economy works)');
assert(W.maxE > 0, 'enemies spawned');
assert(W.baseHitFrame > 0, 'cats advanced and damaged enemy base');
assert(W.sim.over === 1, 'winnable stage is won');
assert(L.sim.over === -1, 'overwhelming stage is lost');

// ---- (3) money drop on kill + base-boost opts ----
const dropStage = { length: 1800, baseHp: 999999, maxOnScreen: 8,
  spawns: [{ id: 90, count: 1, first: 5, rmin: 0, rmax: 0, base: 0, mult: 100 }] };
const dropEnemy = { 90: S({ hp: 50, atk: 10, range: 100, speed: 6, money: 777 }) };
const ds = new BCSim.Sim(dropStage, { 0: brawler }, dropEnemy, { startMoney: 200, startWorkerLvl: 1, catBaseHp: 40000 });
assert(ds.money === 200, 'startMoney opt applied');
assert(ds.catBaseMax === 40000, 'catBaseHp opt applied');
let before = ds.money, killedGain = 0;
for (let f = 0; f < BCSim.FPS * 120 && !ds.over; f++) {
  ds.tick();
  if (f === 10) ds.deploy(0);
  if (ds.money - before > 500) { killedGain = ds.money; break; } // jump = reward credited
}
assert(killedGain > 0, 'killing an enemy credits its money drop');

console.log(ok ? '\nSMOKE OK' : '\nSMOKE FAILED');
process.exit(ok ? 0 : 1);
