// Draws the sim state into the store scene: placed furniture with the products on each shelf, price plates, delivery
// boxes (on the floor, in hand, opened), customers with their Animator clips, the products on the checkout counter,
// the open/closed sign and the expansion walls. Also owns the invisible hit volumes the player's centre ray tests
// (PlayerInteraction raycasts colliders on the interactable layers in the original).
import * as THREE from 'three';
import { childAt } from './pool.js';

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const CUSTOMER_ANIM = { Walk: 'Walk', BasketWalk: 'BasketWalk', BagWalk: 'BagWalk', Idle: 'Idle', PickProduct: 'PickProduct', GiveCard: 'GiveCard', HeadNo: 'HeadNo', Happy: 'Happy' };

function hitBox(size, center, hit) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), HIT_MAT);
  m.position.fromArray(center);
  m.userData.hit = hit;
  return m;
}

export class GameView {
  constructor({ scene3, store, pool, sim, G, L, camera }) {
    Object.assign(this, { scene3, store, pool, sim, G, L, camera });
    this.rigs = new Set();
    this.hits = [];          // meshes the ray tests, rebuilt lazily per frame from the live state
    this.furn = new Map();   // furniture id -> { inst, items: [[...product objs] per cabinet], plates: [] }
    this.boxes = new Map();  // box id -> { inst, rig, items: [], open }
    this.custs = new Map();  // customer id -> { obj, rig }
    this.counter = [];       // product objects on the counter
    this.holder = new THREE.Group();   // Player/Root/BoxHold in front of the camera
    this.holder.position.set(0.006, -0.586, -0.773);
    camera.add(this.holder);
    const N = store.objects;
    const node = name => store.byName.get(name);
    this.byComp = comp => store.objects.find(o => o.userData.node.k && o.userData.node.k[comp]);
    // fixed interactables of the scene
    this.sceneHit('LaptopDesk', { kind: 'laptop' });
    this.sceneHit('TrashBin', { kind: 'trash' });
    const chk = this.byComp('CheckOutCounter').userData.node.k.CheckOutCounter;
    this.counterCam = N[chk.virtualCamera.n];
    this.addHitFromNode(N[chk.checkoutInteracable.n], { kind: 'counter' });
    const sign = this.byComp('StoreSign').userData.node.k.StoreSign;
    this.signOpen = sign.openSign && N[sign.openSign.n];
    this.signClose = sign.closeSign && N[sign.closeSign.n];
    if (sign.storeSignInteracable) this.addHitFromNode(N[sign.storeSignInteracable.n], { kind: 'sign' });
    this.walls = G.expansions.map(e => ({ type: e.type, nodes: e.walls.map(i => N[i]) }));
    this.counterPos = sim.points.counterItems;
    this.priceCanvas = new Map();
  }

  sceneHit(comp, hit) {
    const o = this.byComp(comp);
    if (o) this.addHitFromNode(o, hit);
  }

  addHitFromNode(o, hit) {
    const k = o.userData.node.k || {};
    const bc = Array.isArray(k.BoxCollider) ? k.BoxCollider[0] : k.BoxCollider;
    let m;
    if (bc) m = hitBox([bc.m_Size.x, bc.m_Size.y, bc.m_Size.z], [bc.m_Center.x, bc.m_Center.y, -bc.m_Center.z], hit);
    else m = hitBox([0.6, 0.6, 0.6], [0, 0.3, 0], hit);
    o.add(m);
    this.hits.push(m);
    return m;
  }

  // ---- furniture & shelves ----
  syncFurniture() {
    const seen = new Set();
    for (const f of this.sim.s.furniture) {
      seen.add(f.id);
      let e = this.furn.get(f.id);
      const lay = this.sim.layoutOf(f);
      if (!e) {
        const inst = this.pool.instance(lay.root);
        this.scene3.add(inst);
        e = { inst, items: lay.cabinets.map(() => []), plates: [], hits: [] };
        lay.cabinets.forEach((c, i) => {
          if (c.coll) { const h = hitBox(c.coll.size, c.coll.c, { kind: 'cab', fid: f.id, i }); inst.add(h); e.hits.push(h); }
          if (c.plate) {
            const plate = this.makePlate();
            plate.position.set(c.plate[0], c.plate[1], c.plate[2] - 0.012);
            inst.add(plate);
            e.plates[i] = plate;
            const h = hitBox([0.2, 0.1, 0.06], c.plate, { kind: 'plate', fid: f.id, i });
            inst.add(h); e.hits.push(h);
          }
        });
        this.furn.set(f.id, e);
      }
      e.inst.position.set(f.x, 0.047, f.z);
      e.inst.rotation.set(0, f.yaw, 0);
      lay.cabinets.forEach((c, i) => this.syncShelf(e, f, c, i));
    }
    for (const [id, e] of this.furn) if (!seen.has(id)) { e.inst.removeFromParent(); this.furn.delete(id); }
  }

  syncShelf(e, f, c, i) {
    const st = f.cab[i];
    const items = e.items[i];
    while (items.length > st.n) items.pop().removeFromParent();
    if (items.length && items[0].userData.ptype !== st.p) { while (items.length) items.pop().removeFromParent(); }
    while (items.length < st.n) {
      const k = items.length;
      const pl = this.L.products[st.p];
      if (!pl) break;
      const o = this.pool.instance(pl.root);
      o.userData.ptype = st.p;
      o.position.fromArray(c.slots[k]);
      o.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.slotYaw[k] || 0));
      const rig = this.pool.rig(o);
      if (rig) { o.userData.rig = rig; this.rigs.add(rig); }
      e.inst.add(o);
      items.push(o);
    }
    const plate = e.plates[i];
    if (plate) {
      const txt = st.n > 0 || st.p ? `$${(this.sim.price(st.p || f.cab[i].p) / 100).toFixed(2)}` : '';
      plate.visible = !!(st.p && st.n > 0);
      if (plate.visible) this.plateText(plate, txt);
    }
  }

  // PricePlate shows the TextMeshPro price; the plate's text is not exported as a mesh, so it is a canvas label here.
  makePlate() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 48;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.rotation.y = Math.PI;
    m.userData.cv = cv; m.userData.txt = null;
    return m;
  }

  plateText(m, txt) {
    if (m.userData.txt === txt) return;
    m.userData.txt = txt;
    const cv = m.userData.cv, g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#111'; g.font = 'bold 34px "Noto Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, cv.width / 2, cv.height / 2 + 2);
    m.material.map.needsUpdate = true;
  }

  // ---- delivery boxes ----
  syncBoxes() {
    const seen = new Set();
    for (const b of this.sim.s.boxes) {
      seen.add(b.id);
      let e = this.boxes.get(b.id);
      const lay = this.L.boxes[b.bt];
      if (!e) {
        const inst = this.pool.instance(lay.root);
        const rig = this.pool.rig(inst);
        if (rig) this.rigs.add(rig);
        const h = lay.coll ? hitBox(lay.coll.size, lay.coll.c, { kind: 'box', id: b.id }) : hitBox([0.6, 0.35, 0.5], [0, 0.17, 0], { kind: 'box', id: b.id });
        inst.add(h);
        e = { inst, rig, items: [], open: null, hit: h };
        this.boxes.set(b.id, e);
      }
      if (b.held) {
        if (e.inst.parent !== this.holder) { this.holder.add(e.inst); e.inst.position.set(0, 0, 0); e.inst.rotation.set(0, Math.PI, 0); }
      } else {
        if (e.inst.parent !== this.scene3) this.scene3.add(e.inst);
        let y = b.y;
        if (b.dropFrom != null) {        // falling from the delivery point (gravity -9.81, no bounce [GUESS])
          e.fall = (e.fall || 0) + this.dt;
          y = Math.max(b.y, b.dropFrom - 4.905 * e.fall * e.fall);
          if (y <= b.y) delete b.dropFrom;
        }
        e.inst.position.set(b.x, y, b.z);
        e.inst.rotation.set(0, b.yaw, 0);
      }
      e.hit.visible = !b.held;
      if (e.open !== b.open) {
        e.open = b.open;
        if (e.rig) e.rig.play(b.open ? 'Open' : 'Close', 0.1);
      }
      // items visible inside an opened product box
      const want = b.kind === 'p' && b.open ? b.n : 0;
      while (e.items.length > want) e.items.pop().removeFromParent();
      while (e.items.length < want && lay.slots[e.items.length]) {
        const pl = this.L.products[b.type];
        if (!pl) break;
        const o = this.pool.instance(pl.root);
        o.position.fromArray(lay.slots[e.items.length]);
        const holder = childAt(e.inst, lay.holder) || e.inst;
        (holder === e.inst ? e.inst : e.inst).add(o);
        e.items.push(o);
      }
    }
    for (const [id, e] of this.boxes) if (!seen.has(id)) { e.inst.removeFromParent(); if (e.rig) this.rigs.delete(e.rig); this.boxes.delete(id); }
  }

  // ---- customers ----
  syncCustomers() {
    const seen = new Set();
    for (const c of this.sim.customers) {
      seen.add(c.id);
      let e = this.custs.get(c.id);
      if (!e) {
        const ri = this.L.customers[c.model].root;
        const obj = this.pool.root(ri);
        obj.visible = true;
        if (obj.parent !== this.scene3) this.scene3.add(obj);
        if (!obj.userData.rig) obj.userData.rig = this.pool.rig(obj);
        const helper = this.findComp(obj, 'CustomerShoppingStuffHelper');
        const pay = this.findComp(obj, 'CustomerPaymentHelper');
        e = { obj, rig: obj.userData.rig, helper, pay, hit: null };
        if (e.rig) this.rigs.add(e.rig);
        const h = hitBox([0.7, 1.8, 0.7], [0, 0.9, 0], { kind: 'pay', id: c.id });
        obj.add(h); e.hit = h;
        this.custs.set(c.id, e);
      }
      e.obj.position.set(c.x, 0, c.z);
      e.obj.rotation.set(0, c.yaw, 0);
      if (e.rig) e.rig.play(CUSTOMER_ANIM[c.anim] || 'Idle');
      e.hit.visible = c.st === 'pay';
      this.showStuff(e, c);
    }
    for (const [id, e] of this.custs) if (!seen.has(id)) {
      e.obj.visible = false;
      if (e.rig) this.rigs.delete(e.rig);
      e.hit.removeFromParent();
      this.custs.delete(id);
    }
  }

  findComp(root, comp) {
    let hit = null;
    root.traverse(o => { if (!hit && o.userData.node && o.userData.node.k && o.userData.node.k[comp]) hit = { obj: o, k: o.userData.node.k[comp] }; });
    return hit;
  }

  // CustomerShoppingStuffHelper: basket while shopping, bag after checkout; CustomerPaymentHelper: cash or card in hand.
  showStuff(e, c) {
    const pool = this.pool.world.objects;
    const ref = r => (r && r.n != null ? pool[r.n] : null);
    if (e.helper) {
      const k = e.helper.k;
      const basket = ref(k.basket), stuff = ref(k.basketStuff), bag = ref(k.shoppingBag);
      const shopping = c.inside && c.st !== 'exitFull';
      if (basket) basket.visible = shopping && c.st !== 'atCounter' && c.st !== 'pay';
      if (stuff) stuff.visible = shopping && c.cart.length > 0 && c.st !== 'atCounter' && c.st !== 'pay';
      if (bag) bag.visible = c.st === 'exitFull';
    }
    if (e.pay) {
      const k = e.pay.k;
      const cash = ref(k.cash), card = ref(k.card);
      if (cash) cash.visible = c.st === 'pay' && c.pay === 1;
      if (card) card.visible = c.st === 'pay' && c.pay === 2;
    }
  }

  // ---- checkout counter ----
  syncCounter() {
    const k = this.sim.checkout;
    const want = k.items || [];
    if (this.counter.length !== want.length || this.counter.some((o, i) => o.userData.ptype !== want[i].type)) {
      for (const o of this.counter) o.removeFromParent();
      this.counter = want.map((it, i) => {
        const pl = this.L.products[it.type];
        const o = pl ? this.pool.instance(pl.root) : new THREE.Group();
        o.userData.ptype = it.type;
        const p = this.counterPos[i % this.counterPos.length];
        o.position.set(p[0], p[1], p[2]);
        const h = hitBox([0.3, 0.3, 0.3], [0, 0.12, 0], { kind: 'scan', idx: i });
        o.add(h);
        o.userData.hitMesh = h;
        this.scene3.add(o);
        return o;
      });
    }
    want.forEach((it, i) => { this.counter[i].visible = !it.scanned; });
  }

  syncScene() {
    const s = this.sim.s;
    if (this.signOpen) this.signOpen.visible = s.open;
    if (this.signClose) this.signClose.visible = !s.open;
    for (const w of this.walls) for (const n of w.nodes) n.visible = !s.expansions.includes(w.type);
  }

  // All hit meshes that are live right now.
  targets() {
    const out = this.hits.slice();
    for (const e of this.furn.values()) out.push(...e.hits);
    for (const e of this.boxes.values()) if (e.hit.visible) out.push(e.hit);
    for (const e of this.custs.values()) if (e.hit.visible) out.push(e.hit);
    for (const o of this.counter) if (o.visible) out.push(o.userData.hitMesh);
    return out;
  }

  update(dt) {
    this.dt = dt;
    this.syncScene();
    this.syncFurniture();
    this.syncBoxes();
    this.syncCustomers();
    this.syncCounter();
    for (const r of this.rigs) r.update(dt);
  }
}
