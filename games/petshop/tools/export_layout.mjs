// node tools/export_layout.mjs -> data/layout.json
// Gameplay geometry of the runtime prefabs in art/pool (export_store.py sharedassets1.assets pool), in each prefab's own
// frame (three.js axes): furniture cabinets (storage type, item slots, customer stand points, price plate, the
// interaction collider), the obstacle box (NavMeshObstacle) and footprint (BoxCollider) of every furniture, the item
// slots of every delivery box, and which pool root holds each product / box / customer model.
import fs from 'fs';

const G = new URL('../', import.meta.url);
const s = JSON.parse(fs.readFileSync(new URL('art/pool/scene.json', G)));
const pool = JSON.parse(fs.readFileSync(new URL('data/pool.json', G)));
const N = s.nodes;
const roots = N.map((n, i) => i).filter(i => N[i].p < 0);
const kids = new Map();
N.forEach((n, i) => { if (n.p >= 0) { if (!kids.has(n.p)) kids.set(n.p, []); kids.get(n.p).push(i); } });

// 4x4 column-major-free helpers: affine as [m00..m22, tx, ty, tz] rows
function trs(n) {
  const [x, y, z, w] = n.r || [0, 0, 0, 1], [sx, sy, sz] = n.s || [1, 1, 1], t = n.t || [0, 0, 0];
  const r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
  return r.map((row, i) => [row[0] * sx, row[1] * sy, row[2] * sz, t[i]]);
}
const mul = (a, b) => a.map(row => [0, 1, 2, 3].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j] + (j === 3 ? row[3] : 0)));
const app = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2] + row[3]);
const appDir = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
// Matrix of node i relative to root r (root's own transform excluded).
function rel(i, r) {
  if (i === r) return I;
  return mul(rel(N[i].p, r), trs(N[i]));
}
const r3 = v => v.map(x => Math.round(x * 1000) / 1000);
const yawOf = m => Math.atan2(m[0][2], m[2][2]);   // three.js yaw of the local +z axis
function box(i, r, k) {
  const m = rel(i, r);
  const c = k.m_Center, sz = k.m_Size || { x: 2 * k.m_Extents?.x, y: 2 * k.m_Extents?.y, z: 2 * k.m_Extents?.z };
  const center = app(m, [c.x, c.y, -c.z]);
  const ax = appDir(m, [sz.x / 2, 0, 0]), az = appDir(m, [0, 0, sz.z / 2]), ay = appDir(m, [0, sz.y / 2, 0]);
  const L = v => Math.hypot(...v);
  return { c: r3(center), size: r3([2 * L(ax), 2 * L(ay), 2 * L(az)]), yaw: Math.round(Math.atan2(-ax[2], ax[0]) * 1e4) / 1e4 };
}
const CAB = ['RackCabinet', 'AnimalCabinet', 'FridgeCabinet', 'AquariumCabinet', 'BirdCabinet', 'ReptileCabinet', 'StorageCabinet'];

function sub(r) { const out = []; (function w(i) { out.push(i); (kids.get(i) || []).forEach(w); })(r); return out; }

function furniture(rootIdx) {
  const r = roots[rootIdx];
  const out = { root: rootIdx, name: N[r].n, cabinets: [] };
  for (const i of sub(r)) {
    const k = N[i].k || {};
    const cn = CAB.find(c => k[c]);
    if (cn) {
      const c = k[cn];
      const slots = (c.positionList || []).map(p => r3(app(rel(p.n, r), [0, 0, 0])));
      const stand = (c.standPointList || []).map(p => { const v = app(rel(p.n, r), [0, 0, 0]); return r3([v[0], v[2]]); });
      const plate = c.pricePlate ? r3(app(rel(c.pricePlate.n, r), [0, 0, 0])) : null;
      // interaction collider: the child holding *CabinetInteraction / *Interactable + BoxCollider
      const ci = sub(i).find(j => N[j].k && Object.keys(N[j].k).some(x => /Cabinet(Interaction|Interactable)$/.test(x)) && N[j].k.BoxCollider);
      const coll = ci != null ? box(ci, r, Array.isArray(N[ci].k.BoxCollider) ? N[ci].k.BoxCollider[0] : N[ci].k.BoxCollider) : null;
      const slotYaw = (c.positionList || []).map(p => Math.round(yawOf(rel(p.n, r)) * 1e4) / 1e4);
      out.cabinets.push({ kind: cn, storage: c.storageType, node: i - r, slots, slotYaw, stand, plate, coll,
        plateNode: c.pricePlate ? c.pricePlate.n - r : null, holder: c.productsHolder ? c.productsHolder.n - r : null });
    }
  }
  // FurniturePlaceHelper.CanPlace: every floorDetector (RaycastDetector, straight down, targetLayer) hits the floor
  // layer and the BoundingBoxDetector box overlaps no collider.
  for (const i of sub(r)) {
    const k = N[i].k || {};
    if (k.RaycastDetector) {
      (out.detectors || (out.detectors = [])).push(r3(app(rel(i, r), [0, 0, 0])));
      out.floorMask = k.RaycastDetector.targetLayer.m_Bits;
    }
    if (k.BoundingBoxDetector) {
      const m = rel(i, r), bs = k.BoundingBoxDetector.boxSize;
      out.bound = { c: r3(app(m, [0, 0, 0])), size: r3([bs.x, bs.y, bs.z]) };
    }
  }
  const k = N[r].k || {};
  if (k.NavMeshObstacle) { const o = k.NavMeshObstacle; out.obstacle = box(r, r, { m_Center: o.m_Center, m_Size: o.m_Extents ? { x: 2 * o.m_Extents.x, y: 2 * o.m_Extents.y, z: 2 * o.m_Extents.z } : o.m_Size }); }
  if (k.BoxCollider) out.collider = box(r, r, Array.isArray(k.BoxCollider) ? k.BoxCollider[0] : k.BoxCollider);
  return out;
}

const layout = { furniture: {}, storage: {}, products: {}, boxes: {}, customers: [], cashier: roots.indexOf(roots[pool.cashier[0]]) };
pool.furniture.forEach((ri, j) => { layout.furniture[j + 1] = furniture(ri); });
pool.storage.forEach((ri, j) => { layout.storage[j + 1] = furniture(ri); });
pool.products.forEach((ri, j) => {
  const r = roots[ri];
  const bp = sub(r).map(i => N[i].k || {}).map(k => Object.entries(k).find(([c]) => /Product$/.test(c))).find(Boolean);
  // BaseProduct move-to-rack / move-to-counter AudioClip (asset id; art/audio name mapped in main.js)
  const clipC = sub(r).map(i => N[i].k || {}).flatMap(k => Object.values(k)).find(v => v && v.moveToRackClip !== undefined);
  layout.products[bp ? bp[1].type : j + 1] = { root: ri, name: N[r].n, kind: bp ? bp[0] : null, clip: clipC && clipC.moveToRackClip ? clipC.moveToRackClip.id : null };
});
pool.boxes.forEach((ri) => {
  const r = roots[ri];
  const bx = sub(r).map(i => [i, N[i].k || {}]).map(([i, k]) => [i, Object.entries(k).find(([c]) => /DeliveryBox$/.test(c))]).find(([, e]) => e);
  if (!bx) return;
  const [bi, [kind, d]] = bx;
  const slots = (d.positionList || []).map(p => r3(app(rel(p.n, r), [0, 0, 0])));
  const coll = (N[r].k && N[r].k.BoxCollider) ? box(r, r, Array.isArray(N[r].k.BoxCollider) ? N[r].k.BoxCollider[0] : N[r].k.BoxCollider) : null;
  layout.boxes[d.deliveryBoxType] = { root: ri, name: N[r].n, kind, storage: d.storageType, product: d.productType ?? null, slots, coll,
    holder: d.productsParent ? d.productsParent.n - r : null };
});
pool.customers.forEach(ri => {
  const r = roots[ri];
  const pay = sub(r).map(i => N[i].k && N[i].k.CustomerPaymentHelper).find(Boolean);
  const anim = sub(r).find(i => N[i].k && N[i].k.Animator);
  layout.customers.push({ root: ri, name: N[r].n, pay: pay ? pay.paymentMethod : 1, animNode: anim != null ? anim - r : null });
});
fs.writeFileSync(new URL('data/layout.json', G), JSON.stringify(layout));
console.log('furniture', Object.keys(layout.furniture).length, 'storage', Object.keys(layout.storage).length, 'products', Object.keys(layout.products).length,
  'boxes', Object.keys(layout.boxes).length, 'customers', layout.customers.length);
console.log(JSON.stringify(layout.furniture[1]).slice(0, 700));
console.log(JSON.stringify(layout.boxes[11]));
