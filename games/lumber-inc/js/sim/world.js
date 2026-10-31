// Static description of one Lumber Inc world from art/<world>/scene.json: every building (BuildingCtrller and its
// subclasses) with its unlock pad, cost, prerequisites and trigger volumes, plus trees and solid colliders.
// Pure data, no THREE. Component and field names are the original IL2CPP ones (GameWish.Game.*).
import { worldMatrices, position, apply, Box } from './math.js';

const NS = 'GameWish.Game.';
const KINDS = {
  ForestAreaCtrller: 'forest', ArearCtrller: 'area', PlayerHouseCtrller: 'playerHouse',
  FactoryBuildingCtrller_Debarker: 'factory', FactoryBuildingCtrller_Canting: 'factory',
  RawItemWarehouseCtrller: 'warehouse', VehicleHouseCtrller: 'truckStation', EmployeeHouseCtrller: 'employeeHouse',
  GuideMoneyCtrller: 'guideMoney', BuildingCtrller: 'ground', RecycleHouseCtrller: 'recycle',
  BikeStationCtrller: 'bike', GasHouseCtrller: 'gas', OrderManCtrller: 'orderMan', SpecialWorkerCtrller: 'special',
  UavStationCtrller: 'uav', BuildVehicleHouseCtrller: 'buildTruck', HomeTownBuilding: 'townHouse',
  ConstructionBuilding: 'construction',
};
export const COIN = 1;
const PLAYER_HITS = new Set([0, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 24, 30, 31]);

export function describeWorld(scene) {
  const nodes = scene.nodes;
  const world = worldMatrices(nodes);
  const children = nodes.map(() => []);
  nodes.forEach((n, i) => { if (n.p >= 0) children[n.p].push(i); });
  const comp = (i, name) => nodes[i].k && (nodes[i].k[NS + name] || nodes[i].k[name]);
  const one = c => (Array.isArray(c) ? c[0] : c);
  const ref = r => (r && r.n != null ? r.n : null);
  const pos = i => position(world[i]);
  const descendants = i => {
    const out = [];
    const stack = [...children[i]];
    while (stack.length) {
      const j = stack.pop();
      out.push(j);
      stack.push(...children[j]);
    }
    return out;
  };
  // Trigger volume of a node: its BoxCollider, or a SphereCollider as a circle.
  const volume = i => {
    if (i == null) return null;
    const b = comp(i, 'BoxCollider');
    if (b) return new Box(world[i], one(b));
    const s = comp(i, 'SphereCollider');
    if (s) {
      const c = one(s);
      const sc = Math.hypot(world[i][0], world[i][1], world[i][2]);
      return { sphere: true, middle: apply(world[i], { x: c.m_Center.x, y: c.m_Center.y, z: -c.m_Center.z }), r: c.m_Radius * sc,
        contains(p, r = 0) { const dx = p.x - this.middle.x, dz = p.z - this.middle.z; return dx * dx + dz * dz <= (this.r + r) ** 2; } };
    }
    return null;
  };

  const buildings = new Map();
  nodes.forEach((n, i) => {
    if (!n.k) return;
    for (const [full, raw] of Object.entries(n.k)) {
      const cls = full.startsWith(NS) ? full.slice(NS.length) : null;
      const kind = cls && KINDS[cls];
      if (!kind) continue;
      const c = one(raw);
      const b = {
        id: c.m_BuildingId, kind, cls, node: i, name: n.n, pos: pos(i), line: c.m_WorkerLine,
        lockRoot: ref(c.m_TrsLockBuild), activeRoot: ref(c.m_TrsActiveBuild), lockLvRoot: ref(c.m_TrsLockedPlayerLv),
        cost: (c.m_UnlockNeeds || []).filter(u => u.m_Type === COIN).reduce((s, u) => s + u.m_Need, 0),
        lv: c.m_LockPlayerLv || 0, pre: c.m_PreBuildings || [], hasLock: !!c.m_HasLock, c,
      };
      // The unlock pad (Pre_LockFrame, spawned by BuildingCtrller) sits at LockOffset in the building's local XZ plane.
      if (b.hasLock && c.m_LockSize && (c.m_LockSize.x || c.m_LockSize.y)) {
        const m = world[i];
        const o = c.m_LockOffset || { x: 0, y: 0 };
        b.pad = { center: apply(m, { x: o.x, y: 0, z: -o.y }), w: c.m_LockSize.x, d: c.m_LockSize.y,
          yaw: Math.atan2(m[8], m[10]) };
      }
      if (kind === 'factory') {
        Object.assign(b, {
          typeIn: c.m_PropTypeIn, typeOut: c.m_PropTypeOut,
          inNode: ref(c.m_InTrigger), outNode: ref(c.m_OutTrigger), moneyNode: ref(c.m_TriggerMoney),
          mainNode: ref(c.m_MainTrigger), enter: ref(c.m_EnterPoint), exit: ref(c.m_ExitPoint),
        });
        b.inBox = volume(b.inNode); b.outBox = volume(b.outNode); b.moneyBox = volume(b.moneyNode);
        b.mainBox = volume(b.mainNode);
        b.machine = descendants(i).find(j => comp(j, 'FactoryMachine_Debarker'));
      } else if (kind === 'warehouse') {
        Object.assign(b, { type: c.m_PropType, inNode: ref(c.m_TriggerEnter) || ref(c.m_TrsPointIn), showNode: ref(c.m_TriggerShow) });
        b.inBox = volume(b.inNode);
      } else if (kind === 'truckStation') {
        Object.assign(b, {
          type: c.m_FocusType, storeId: c.m_WareHouseBuildingId, inNode: ref(c.m_TriggerIn), showNode: ref(c.m_TriggerShow),
          itemIn: ref(c.m_ObjItemIn), itemOut: ref(c.m_ObjItemOut), segIn: ref(c.m_TrafficSegmentIn),
          segOut: ref(c.m_TrafficSegmentOut),
        });
        b.inBox = volume(b.inNode); b.showBox = volume(b.showNode);
        b.exitNode = ref(c.m_TriggerExit);
        b.exitBox = volume(b.exitNode);
        // Traffic.Segment waypoints: trucks drive the in-segment to the bay (its last point) and leave on the out-segment.
        const wp = s => (s == null ? [] : (one(comp(s, 'Traffic.Segment')).waypoints || []).map(r => pos(ref(r))));
        b.pathIn = wp(b.segIn);
        b.pathOut = wp(b.segOut);
      } else if (kind === 'employeeHouse') {
        Object.assign(b, { workTypes: c.m_LstWorkItemType || [], workerType: c.m_WorkerType, showNode: ref(c.m_TriggerShow) });
        b.showBox = volume(b.showNode);
      } else if (kind === 'guideMoney') {
        Object.assign(b, { moneyNode: ref(c.m_TriggerMoney), amount: c.m_MoneyNum });
        b.moneyBox = volume(b.moneyNode);
      } else if (kind === 'area') {
        b.walls = (c.m_LockedWall || []).map(ref).filter(x => x != null);
      } else if (kind === 'playerHouse') {
        b.showNode = ref(c.m_TriggerShow);
        b.showBox = volume(b.showNode);
      }
      buildings.set(b.id, b);
    }
  });

  // Trees (TreeCtrller) belong to the forest building above them.
  const trees = [];
  nodes.forEach((n, i) => {
    const t = comp(i, 'TreeCtrller');
    if (!t) return;
    let f = i;
    while (f >= 0 && !comp(f, 'ForestAreaCtrller')) f = nodes[f].p;
    trees.push({ node: i, pos: pos(i), stand: ref(t.m_ObjStand), drop: ref(t.m_ObjDropTree), type: t.m_TypeIndex,
      shake: t.m_ShakeOffset, forest: f >= 0 ? one(comp(f, 'ForestAreaCtrller')).m_BuildingId : null });
  });

  // Solid (non-trigger) box colliders the player's layer hits (PhysicsManager matrix row of layer 18 "Player"), minus
  // floors (ground planes the player stands on); whether one blocks depends on which lock/active root is showing.
  const solids = [];
  nodes.forEach((n, i) => {
    const b = comp(i, 'BoxCollider');
    if (!b || !PLAYER_HITS.has(n.layer || 0)) return;
    for (const c of Array.isArray(b) ? b : [b]) {
      if (c.m_IsTrigger || !c.m_Enabled) continue;
      const box = new Box(world[i], c);
      const sy = Math.hypot(world[i][4], world[i][5], world[i][6]);
      if (box.middle.y + box.half.y * sy < 0.2) continue;
      solids.push({ node: i, box });
    }
  });

  return { nodes, world, children, buildings, trees, solids, descendants, pos, volume };
}
