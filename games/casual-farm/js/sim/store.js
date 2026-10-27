// Turns art/<store>/scene.json + data/<store>.json into the static description of one mart: every gameplay entity
// with its trigger boxes, slot positions and original numbers. Pure data, no THREE; see D:\minimart-ref\rules\*.md
// for where each number comes from.
import { worldMatrices, position, apply, compose, Box } from './math.js';
// NewVisualObjectActivator / NewVisualMeshRendererActivator keep one of two prop sets (old office desk, red bin, old
// chicken... or their redesigns) by RC_GeneralConfig.isNewVisualsActive. The shipped default is 1, but the gameplay
// clip this build follows (9RL-61HwGzw: grey office chair, red bin with a white logo) runs the old set, so it stays.
export const NEW_VISUALS = false;

const PRODUCERS = ['FactoryAutoProduceController', 'FactoryInputProduceController', 'FactoryDualInputController',
  'FactoryTripleInputController', 'FactoryQuadInputController', 'FactoryFishPond', 'FactoryAutoHarvester'];
// Input fields by class (production2.md): each MatInputController child, in order, takes the next input type.
const INPUT_FIELDS = {
  FactoryInputProduceController: ['inputObjectType'], FactoryFishPond: ['inputObjectType'],
  FactoryDualInputController: ['inputObjectType', 'inputObjectType_2'],
  FactoryTripleInputController: ['inputObjectType', 'inputObjectType_2', 'inputObjectType_3'],
  FactoryQuadInputController: ['inputObjectType', 'inputObjectType_2', 'inputObjectType_3', 'inputObjectType_4'],
};
// FactoryAutoHarvester (production2.md): out and back legs of 2.5 s each; cargo by level lives in sim.js.
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
  // Objects this build never shows take their NavMeshObstacles with them: the prop set not in use (NewVisualObjectActivator,
  // see NEW_VISUALS) and the ad-only carts (TurThanksgivingRvMat, AdsBoxesSpawner; hidden in view/game.js hideDebug).
  const AD_ONLY = ['TurThanksgivingRvMat', 'AdsBoxesSpawner'];
  const otherVisual = i => {
    for (let j = i; j >= 0; j = nodes[j].p) {
      const a = comp(j, '__Funflare.Scripts.Helper.NewVisualObjectActivator');
      if (a && !!(Array.isArray(a) ? a[0] : a).isNewVersion !== NEW_VISUALS) return true;
      if (AD_ONLY.some(c => comp(j, c))) return true;
    }
    return false;
  };
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

  // Mat prefabs exported under "__Prefabs" (Stores 9-14) are templates, not scene mats.
  const prefabs = new Set(byName.has('__Prefabs') ? [byName.get('__Prefabs'), ...descendants(byName.get('__Prefabs'))] : []);
  nodes.forEach((n, i) => {
    if (prefabs.has(i)) return;
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
      const inMats = descendants(i).filter(j => comp(j, 'MatInputController'));
      const kind = pc === 'FactoryAutoProduceController' ? 'auto' : pc === 'FactoryAutoHarvester' ? 'harvest' : 'input';
      const ins = (INPUT_FIELDS[pc] || []).map(k => f[k] ?? 0);
      const limit = kind === 'auto' ? f.currentInputAndOutputLimit
        : (f.factoryType === 2 && f.inputAndOutputLimitList && f.inputAndOutputLimitList.length ? f.inputAndOutputLimitList[0] : MACHINE_LIMITS[0]);
      const outSlots = outMat != null ? slotsUnder(outMat, 'SlotOutputController') : [];
      // Limit by stack level (production.md): animals use inputAndOutputLimitList, machines and trucks 4/6/8, plants fixed.
      const limits = kind === 'auto' ? [limit] : f.factoryType === 2 && f.inputAndOutputLimitList && f.inputAndOutputLimitList.length
        ? f.inputAndOutputLimitList : MACHINE_LIMITS;
      producers.push({
        name: n.n, node: i, kind, out: f.outputObjectTypeToProduce, ins, time: f.desiredProductionLength,
        limit: Math.min(limit, Math.max(outSlots.length, 1)), outZone: outMat != null ? box(outMat) : null, outSlots,
        limits: limits.map(l => Math.min(l, Math.max(outSlots.length, 1))), title: f.factoryName || n.n,
        // The legacy upgrade menu lists machines and trucks (factoryType 1, Machines tab) and animals (factoryType 2, Animals
        // tab); plants never (rules/upgrade-menu.md section 1).
        upgradable: kind === 'harvest' || kind === 'input', animal: f.factoryType === 2, factoryType: f.factoryType,
        inputs: ins.map((type, k) => {
          const j = inMats[Math.min(k, inMats.length - 1)];
          return { type, zone: j != null ? box(j) : null, slots: j != null ? slotsUnder(j, 'SlotInputController') : [] };
        }),
        truck: kind === 'harvest' ? { node: ref(f.truckTransform), drip: f.dropOffRate || 0.2, leg: 2.5 } : null,
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
        boxSlot: ref(f.boxTransformSlot) != null ? pos(ref(f.boxTransformSlot)) : pos(i), boxNode: ref(f.boxTransformSlot) ?? i,
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

  // Stores 9-14 (progression-data.md): ProgressionData clones a mat prefab per CSV row at Awake. Worker, cashier and
  // next-mart rows take the upgrade-style prefab. Placement: a store tile's zoom-out transform at scale 1.5, else the
  // item's matPos placeholder, else the object's local offset by name (machine 2 m, plant/worker 0, other 6 m in front).
  const UPGRADE_PREFAB = ['PlayerWorkerAgentController', 'PlayerWorkerFarmController', 'PlayerWorkerChefController',
    'WorkerCashierController', 'MatNextStore'];
  const label = (obj, name) => (comp(obj, 'WorkerCashierController') ? 'CASHIER' : comp(obj, 'MatNextStore') ? 'Next Mart'
    : /shel/i.test(name) ? 'SHELVER' : /chef/i.test(name) ? 'CHEF' : /farmer/i.test(name) ? 'FARMER' : /cleaner/i.test(name) ? 'CLEANER' : '');
  (data.mats || []).forEach((row, k) => {
    const obj = row.object != null ? byName.get(row.object) : null;
    if (obj == null || byName.has(row.name)) return;
    const upgrade = UPGRADE_PREFAB.some(c => comp(obj, c));
    const kind = upgrade ? 'MatUnlockUpgradeController' : 'MatActivateController';
    const template = byName.get(upgrade ? 'Mat_ActivateUpgrade' : 'Mat_Activate');
    if (template == null) return;
    const tile = comp(obj, 'StoreTileController'), item = comp(obj, 'ProgressionDataItem');
    let m;
    if (tile && tile.zoomOutHighglightTransform) {
      const p = pos(tile.zoomOutHighglightTransform.n);
      m = compose([p.x, p.y, p.z], [0, 0, 0, 1], [1.5, 1.5, 1.5]);
    } else if (item && item.matPos) {
      m = world[item.matPos.n];
    } else {
      const lower = row.object.toLowerCase();
      const p = apply(world[obj], { x: 0, y: 0, z: lower.startsWith('machine') ? 2 : /plant|worker/.test(lower) ? 0 : 6 });
      m = compose([p.x, p.y, p.z]);
    }
    mats.push({
      name: row.name, node: null, template, matrix: m, object: row.object, kind, cost: row.cost,
      zone: new Box(m, comp(template, 'BoxCollider')), pos: position(m), startsOpen: k === 0,
      activate: row.activate.map(name => ({ name, delay: 1 })), waitFor: [], highlight: row.highlight,
      upgradeType: upgrade ? label(obj, row.object) : null, noPayFor: 0,
    });
  });

  // Upgrade base price P / W: when a mat activates a MasterController it hands it its objectTypeReq through the first
  // virtual (MatActivateController.c:1939, UpdateUpgradePrice), so the base is the price of the mat that unlocked it.
  const unlockCost = name => (mats.find(m => m.activate.some(a => a.name === name)) || {}).cost || 0;
  producers.forEach(p => { p.basePrice = unlockCost(p.name); });

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
  // MyNavMeshObstacleEnablerAndDisabler: while its object is enabled the obstacle it names is switched off (OnEnable),
  // and back on when it is disabled. Store 12's "NavMeshObstacleForWhenStillLocked" walls sit under the same tile as
  // their jetty, so they never block once the tile is bought.
  const switchedBy = new Map();
  nodes.forEach((n, i) => {
    const f = comp(i, 'MyNavMeshObstacleEnablerAndDisabler');
    if (f && f.navMeshObstacleObj && f.navMeshObstacleObj.n != null) switchedBy.set(f.navMeshObstacleObj.n, i);
  });
  // Gates: names that must all be active for the box to block; `off`: names that, all active, switch it off.
  function obstacleGates(o) {
    if (o._gates) return o._gates;
    let best = null, bd = Infinity;
    for (const i of obstacleNodes) {
      if (nodes[i].n !== o.name) continue;
      const p = pos(i), d = (p.x - o.center[0]) ** 2 + (p.z - o.center[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    o._gates = best == null ? [] : gatesOf(best);
    o._hidden = best != null && otherVisual(best);
    const sw = best == null ? null : switchedBy.get(best);
    o._off = sw == null ? null : gatesOf(sw);
    return o._gates;
  }
  const obstacleOff = o => (obstacleGates(o), o._off);
  const obstacleHidden = o => (obstacleGates(o), o._hidden);

  // MatNextStore pad (sound-thief-nextmart.md): stand on it `timer` s to open the Go / Close menu; the van leaves.
  const nmNode = nodes.findIndex((n, i) => comp(i, 'MatNextStore'));
  const nextMart = nmNode < 0 ? null : (f => ({
    name: nodes[nmNode].n, node: nmNode, zone: box(nmNode), time: f.timer ?? 1.5, van: ref(f.vanTransform), left: !!f.shouldMoveLeft,
  }))(comp(nmNode, 'MatNextStore'));

  const playerNode = byName.get('Player_Chef');
  const player = comp(playerNode, 'PlayerHumanController');
  const upgradeNode = byName.get('UpgradeZone_Player');
  const prices = Object.fromEntries(Object.entries(data.prices || {}).map(([k, v]) => [k, v.price]));

  return {
    unlockCost,
    nodes, world, byName, children, mats, producers, shelves, cashiers, trash, coins, activatedLater, prices, customers, nextMart,
    quotas: Object.fromEntries(Object.entries(data.prices || {}).map(([k, v]) => [k, v.quota])),
    player: {
      node: playerNode, start: pos(playerNode), speed: player.speed, pickupRate: player.pickupRate,
      dropOffRate: player.dropOffRate, cashDelay: player.cashDelayDropOff, cashRate: player.cashDropOffRate,
      cashAccel: player.cashDropOffMultiplyOneSecondBy, cashPickupRate: player.cashPickUpRate,
      stackPrices: player.stackUpgradePrice || [15, 50, 250, 999], rotate: player.rotateControlBy ?? -12,
      // Stand-on upgrade pads are live only where RC_ActionZoneRemoteConfig says isActive (Big Marts); Store 1-14
      // buy the carry upgrade from the HUD menu.
      upgradeZone: data.actionZones && upgradeNode != null ? box(upgradeNode) : null,
    },
    obstacleGates, obstacleHidden,
    obstacleOff,
    node: name => byName.get(name),
    pos,
    box,
    comp,
    descendants,
    apply: (i, p) => apply(world[i], p),
  };
}
