// Turns art/<store>/scene.json + data/<store>.json into the static description of one mart: every gameplay entity
// with its trigger boxes, slot positions and original numbers. Pure data, no THREE; see D:\minimart-ref\rules\*.md
// for where each number comes from.
import { worldMatrices, position, apply, Box } from './math.js';

const PRODUCERS = ['FactoryAutoProduceController', 'FactoryInputProduceController', 'FactoryDualInputController'];
const MATS = ['MatActivateController', 'MatSpecialConditionActivateController', 'MatUnlockUpgradeController'];
const SHELVES = ['ShelfController', 'ShelfFridgeController'];
// FactoryInputProduceController.UpdateInputAndOutputUI: animals use inputAndOutputLimitList[level], machines 4/6/8.
const MACHINE_LIMITS = [4, 6, 8];
export const COIN = 11;

export function buildStore(scene, data) {
  const nodes = scene.nodes;
  const world = worldMatrices(nodes);
  const children = nodes.map(() => []);
  nodes.forEach((n, i) => { if (n.p >= 0) children[n.p].push(i); });
  const byName = new Map();
  nodes.forEach((n, i) => { if (!byName.has(n.n)) byName.set(n.n, i); });

  const comp = (i, name) => nodes[i].k && nodes[i].k[name];
  const compOf = (i, names) => names.find(c => comp(i, c));
  const descendants = i => {
    const out = [];
    const stack = [...children[i]];
    while (stack.length) {
      const j = stack.shift();
      out.push(j);
      stack.unshift(...children[j]);
    }
    return out;
  };
  const findDesc = (i, name) => descendants(i).find(j => comp(j, name));
  // Trigger volume of a node as a Box; capsules (Animal_Cow's input) and spheres become their bounding box.
  const box = i => {
    const one = c => (Array.isArray(c) ? c[0] : c);
    const b = comp(i, 'BoxCollider');
    if (b) return new Box(world[i], one(b));
    const cap = comp(i, 'CapsuleCollider') || comp(i, 'SphereCollider');
    if (!cap) return null;
    const c = one(cap), r = c.m_Radius * 2, h = c.m_Height != null ? Math.max(c.m_Height, r) : r;
    const size = [r, r, r];
    if (c.m_Height != null) size[c.m_Direction ?? 1] = h;
    return new Box(world[i], { m_Center: c.m_Center, m_Size: { x: size[0], y: size[1], z: size[2] } });
  };
  const slotsUnder = (i, name) => descendants(i).filter(j => comp(j, name)).map(j => position(world[j]));
  const pos = i => position(world[i]);
  const ref = r => (r && r.n != null ? r.n : null);

  const mats = [], producers = [], shelves = [], cashiers = [], trash = [], coins = [];
  const matRows = new Map((data.mats || []).map(m => [m.name, m]));

  nodes.forEach((n, i) => {
    const mc = compOf(i, MATS);
    if (mc) {
      const f = comp(i, mc);
      const row = matRows.get(n.n);
      const activate = row ? row.activate.map((name, k) => ({ name, delay: row.delays[k] ?? 1 }))
        : f.objectToActivateList.map((r, k) => ({ name: r && nodes[ref(r)] ? nodes[ref(r)].n : null, delay: f.delayForObjectToActivateList[k] ?? 1 }))
          .filter(a => a.name);
      mats.push({
        name: n.n, node: i, kind: mc, cost: row ? row.cost : f.objectTypeReq, zone: box(i), pos: pos(i),
        startsOpen: !!f.isUnlocked, activate,
        waitFor: (f.matToBeCheckedList || []).map(r => ref(r)).filter(j => j != null).map(j => nodes[j].n),
        highlight: row ? row.highlight : [f.objectToHighlight, f.secondObjectToHighlight].map(ref).filter(j => j != null).map(j => nodes[j].n),
        upgradeType: f.upgradeType || null,
        noPayFor: mc === 'MatSpecialConditionActivateController' ? 0.25 : 0,
      });
      return;
    }
    const pc = compOf(i, PRODUCERS);
    if (pc) {
      const f = comp(i, pc);
      const outMat = findDesc(i, 'MatOutputController');
      const inMat = findDesc(i, 'MatInputController');
      const auto = pc === 'FactoryAutoProduceController';
      const ins = auto ? [] : pc === 'FactoryDualInputController' ? [f.inputObjectType ?? 0, f.inputObjectType_2 ?? 0] : [f.inputObjectType ?? 0];
      const limit = auto ? f.currentInputAndOutputLimit
        : (f.factoryType === 2 && f.inputAndOutputLimitList && f.inputAndOutputLimitList.length ? f.inputAndOutputLimitList[0] : MACHINE_LIMITS[0]);
      const outSlots = outMat != null ? slotsUnder(outMat, 'SlotOutputController') : [];
      producers.push({
        name: n.n, node: i, kind: auto ? 'auto' : 'input', out: f.outputObjectTypeToProduce, ins, time: f.desiredProductionLength,
        limit: Math.min(limit, Math.max(outSlots.length, 1)), outZone: outMat != null ? box(outMat) : null, outSlots,
        inZone: inMat != null ? box(inMat) : null, inSlots: inMat != null ? slotsUnder(inMat, 'SlotInputController') : [],
        spawn: f.factoryOutputSlot && ref(f.factoryOutputSlot) != null ? pos(ref(f.factoryOutputSlot)) : pos(i),
        moveTime: f.lerpDurationForOutput ?? 0.5, workerSlot: ref(f.workerSlot) != null ? pos(ref(f.workerSlot)) : pos(i),
        inputWorkerSlot: ref(f.inputWorkerSlot) != null ? pos(ref(f.inputWorkerSlot)) : null,
        rig: findAnimator(i),
      });
      return;
    }
    const sc = compOf(i, SHELVES);
    if (sc) {
      const f = comp(i, sc);
      const mat = findDesc(i, 'MatShelfController');
      shelves.push({
        name: n.n, node: i, type: f.shelfObjectType ?? 0, zone: mat != null ? box(mat) : null,
        slots: mat != null ? slotsUnder(mat, 'SlotInputShelfController') : [],
        queue: children[i].filter(j => comp(j, 'SlotShelfQueueController')).map(j => ({
          pos: pos(j), look: children[j].length ? pos(children[j][0]) : pos(i),
        })),
        workerSlot: ref(f.workerSlot) != null ? pos(ref(f.workerSlot)) : pos(i), fridge: sc === 'ShelfFridgeController',
      });
      return;
    }
    if (comp(i, 'CashierController')) {
      const cashMat = findDesc(i, 'MatCashOutputController');
      const f = comp(i, 'CashierController');
      cashiers.push({
        name: n.n, node: i, desk: box(i), cashZone: cashMat != null ? box(cashMat) : null,
        cashSlots: cashMat != null ? slotsUnder(cashMat, 'SlotOutputController') : [],
        queue: children[i].filter(j => comp(j, 'SlotCashierQueueController')).map(j => ({
          pos: pos(j), look: children[j].length ? pos(children[j][0]) : pos(i),
        })),
        boxSlot: ref(f.boxTransformSlot) != null ? pos(ref(f.boxTransformSlot)) : pos(i),
        workerSlot: (() => { const j = children[i].find(c => nodes[c].n === 'CashierSlot'); return j != null ? pos(j) : pos(i); })(),
      });
      return;
    }
    if (comp(i, 'TrashBinController')) {
      const mat = findDesc(i, 'MatTrashController');
      trash.push({ name: n.n, node: i, zone: mat != null ? box(mat) : null, pos: pos(i) });
      return;
    }
    const oc = comp(i, 'MyObjectController');
    if (oc && comp(i, 'CoinIdleController') && oc.myObjectType === COIN) {
      coins.push({ name: n.n, node: i, amount: oc.Amount || 1, pos: pos(i), zone: box(i) });
    }
  });

  function findAnimator(i) {
    if (comp(i, 'Animator')) return i;
    return descendants(i).find(j => comp(j, 'Animator')) ?? null;
  }

  function activatedLaterNames() { return activatedLater; }
  // Every object a mat switches on starts hidden (MasterController.Start hides itself until ActivateObject).
  const activatedLater = new Set();
  mats.forEach(m => m.activate.forEach(a => activatedLater.add(a.name)));
  mats.forEach(m => { if (!m.startsOpen) activatedLater.add(m.name); });

  const kids = name => (byName.has(name) ? children[byName.get(name)] : []);
  const cm = comp(byName.get('CUSTOMERS'), 'CustomerManager') || {};
  const customers = {
    agents: kids('CUSTOMERS').filter(j => comp(j, 'CustomerAgentController')).map(j => ({ name: nodes[j].n, node: j })),
    spawns: kids('SpawnPoints').map(pos),
    exits: kids('ExitPoints').map(pos),
    demands: kids('Section1').filter(j => comp(j, 'CustomerDemand')).map(j => {
      const d = comp(j, 'CustomerDemand');
      return d.objectTypeList.map((t, k) => ({ type: t, n: d.objectTypeReqList[k] }));
    }),
    basicUpTo: cm.basicDemandUpToIndex ?? 34,
    proceduralFrom: cm.startProceduralFromIndex ?? 45,
    codeProceduralFrom: cm.startCodeProceduralFromIndex ?? 61,
    maxUnachievable: cm.maxPercetageOfDemandUnachievable ?? 0.4,
  };

  // NavMeshObstacle boxes (navmesh.json) block only while every gameplay ancestor that a mat unlocks is active.
  const obstacleNodes = nodes.map((n, i) => i).filter(i => comp(i, 'NavMeshObstacle'));
  const gatesOf = i => {
    const out = [];
    for (let j = i; j >= 0; j = nodes[j].p) if (activatedLaterNames().has(nodes[j].n)) out.push(nodes[j].n);
    return out;
  };
  function obstacleGates(o) {
    if (o._gates) return o._gates;
    let best = null, bd = Infinity;
    for (const i of obstacleNodes) {
      if (nodes[i].n !== o.name) continue;
      const p = pos(i), d = (p.x - o.center[0]) ** 2 + (p.z - o.center[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    o._gates = best == null ? [] : gatesOf(best);
    return o._gates;
  }

  const playerNode = byName.get('Player_Chef');
  const player = comp(playerNode, 'PlayerHumanController');
  const upgradeNode = byName.get('UpgradeZone_Player');
  const prices = Object.fromEntries(Object.entries(data.prices || {}).map(([k, v]) => [k, v.price]));

  return {
    nodes, world, byName, children, mats, producers, shelves, cashiers, trash, coins, activatedLater, prices, customers,
    quotas: Object.fromEntries(Object.entries(data.prices || {}).map(([k, v]) => [k, v.quota])),
    player: {
      node: playerNode, start: pos(playerNode), speed: player.speed, pickupRate: player.pickupRate,
      dropOffRate: player.dropOffRate, cashDelay: player.cashDelayDropOff, cashRate: player.cashDropOffRate,
      cashAccel: player.cashDropOffMultiplyOneSecondBy, cashPickupRate: player.cashPickUpRate,
      stackPrices: player.stackUpgradePrice || [15, 50, 250, 999], rotate: player.rotateControlBy ?? -12,
      upgradeZone: upgradeNode != null ? box(upgradeNode) : null,
    },
    obstacleGates,
    node: name => byName.get(name),
    pos,
    box,
    comp,
    descendants,
    apply: (i, p) => apply(world[i], p),
  };
}
