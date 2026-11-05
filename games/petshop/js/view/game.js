// Draws the sim state into the store scene: placed furniture with the products on each shelf, price plates, delivery
// boxes (on the floor, in hand, opened), customers with their Animator clips, the products on the checkout counter,
// the open/closed sign and the expansion walls. Also owns the invisible hit volumes the player's centre ray tests
// (PlayerInteraction raycasts colliders on the interactable layers in the original).
import * as THREE from 'three';
import { childAt } from './pool.js';

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const CUSTOMER_ANIM = { Walk: 'Walk', BasketWalk: 'BasketWalk', BagWalk: 'BagWalk', Idle: 'Idle', PickProduct: 'PickProduct', GiveCard: 'GiveCard', HeadNo: 'HeadNo', HeadYes: 'HeadYes', Happy: 'Happy' };

function hitBox(size, center, hit) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), HIT_MAT);
  m.position.fromArray(center);
  m.userData.hit = hit;
  return m;
}

export class GameView {
  constructor({ scene3, store, pool, sim, G, L, camera, uiBase }) {
    Object.assign(this, { scene3, store, pool, sim, G, L, camera, uiBase });
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
    // storage room (StorageSystem): shutter + inner door; their fake interactables say the unlock level until bought
    const ss = this.byComp('StorageSystem').userData.node.k.StorageSystem;
    this.shutter = N[ss.storageShutter.n]; this.door = N[ss.storageDoor.n];
    this.lockHits = ss.fakeInteractList.map(r => this.addHitFromNode(N[r.n], { kind: 'storageLocked' }));
    this.doorY = this.door.position.y; this.shutterY = this.shutter.position.y; this.openT = sim.s.storageService ? 1 : 0;
    // free reward machines (AtmMachine / RewardMachine: showAtLevel 2, objectList shown from that level)
    this.machines = [];
    for (const o of store.objects) {
      const k = o.userData.node.k || {};
      const m = k.AtmMachine ? ['atm', k.AtmMachine] : k.RewardMachine ? [k.RewardMachine.isCashReward ? 'cashMachine' : 'energyMachine', k.RewardMachine] : null;
      if (!m) continue;
      const objs = (m[1].objectList || []).map(r => N[r.n]).filter(Boolean);
      this.machines.push({ kind: m[0], level: m[1].showAtLevel, objs, hit: this.addHitFromNode(o, { kind: m[0] }) });
    }
    // store board (StoreNameChangeHelper): the board sprite (1005 x 245 px, 100 px/unit) with the store name drawn on
    const nh = this.byComp('StoreNameChangeHelper').userData.node.k.StoreNameChangeHelper;
    this.board = this.makeBoard(N[nh.bgImage.n]);
    const boardHit = N.find(o => o.userData.node.k && o.userData.node.k.GenericInteracable && o.parent === N[nh.bgImage.n].parent);
    if (boardHit) this.addHitFromNode(boardHit, { kind: 'board' });
    // RestrictAreaHelper: the red no-placement zone shows while furniture is moved
    const ra = this.byComp('RestrictAreaHelper');
    this.restrict = ra && ra.userData.node.k.RestrictAreaHelper.restrictArea ? N[ra.userData.node.k.RestrictAreaHelper.restrictArea.n] : null;
    // placement preview: the furniture model + its BoundingBoxDetector box tinted green / red
    this.preview = null;
    this.boundMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.25, depthWrite: false }));
    this.boundMesh.visible = false;
    scene3.add(this.boundMesh);
    this.cashierObj = null;
    // tutorial: the 3D arrow (@Holders/Tutorial/Arrow; its Mesh child spins -180 deg per 2 s linear, incremental, and
    // bobs 0.25 m per 1 s InOutSine yoyo, DOTweenAnimation) and the scene's own tutorial Dog Food box, which the sim
    // replaces with a real box (hidden here always)
    this.arrow = store.byName.get('Arrow');
    this.arrowMesh = this.arrow && this.arrow.children.find(c => c.name === 'Mesh');
    if (this.arrow) this.arrow.visible = false;
    this.arrowT = 0;
    const tb = N.find(o => o.name === '1_DogFood' && o.parent && o.parent.name === 'Tutorial');
    if (tb) tb.visible = false;
  }

  // Tutorial.ShowArrowAtPosition(pos, offset); null hides it
  showArrow(p) {
    if (!this.arrow) return;
    this.arrow.visible = !!p;
    if (p) this.arrow.position.set(p[0], p[1], p[2]);
  }
  animArrow(dt) {
    if (!this.arrowMesh || !this.arrow.visible) return;
    this.arrowT += dt;
    this.arrowMesh.rotation.y = -Math.PI * (this.arrowT / 2);
    const k = (this.arrowT % 2) / 1, ph = k <= 1 ? k : 2 - k;   // yoyo 0..1..0
    this.arrowMesh.position.y = 0.25 * (0.5 - 0.5 * Math.cos(Math.PI * ph));
  }

  makeBoard(node) {
    const cv = document.createElement('canvas');
    cv.width = 1005; cv.height = 245;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;
    // the exported SpriteRenderer quad of Bg shows the serialized (red) board: it is hidden and replaced by a quad of the
    // same size, 1 cm in front, carrying the chosen colour's board sprite + the name (TMP BoardName is not exported)
    node.traverse(o => { if (o.isMesh && o.parent === node) o.visible = false; });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10.05, 2.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    m.position.z = 0.013;
    node.add(m);
    return { cv, tex, key: null, imgs: [] };
  }

  drawBoard() {
    const s = this.sim.s, b = this.board;
    const key = `${s.storeName}|${s.color}`;
    if (b.key === key) return;
    const img = b.imgs[s.color] || (b.imgs[s.color] = Object.assign(new Image(), { src: `${this.uiBase}/board_${s.color}.webp` }));
    if (!img.complete) { img.onload = () => { b.key = null; }; return; }
    b.key = key;
    const g = b.cv.getContext('2d');
    g.clearRect(0, 0, b.cv.width, b.cv.height);
    g.drawImage(img, 0, 0, b.cv.width, b.cv.height);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 120px "Noto Sans", sans-serif';
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 10;
    g.strokeText(s.storeName, b.cv.width / 2, b.cv.height / 2 + 6);
    g.fillText(s.storeName, b.cv.width / 2, b.cv.height / 2 + 6);
    b.tex.needsUpdate = true;
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
          if (c.coll) { const h = hitBox(c.coll.size, c.coll.c, { kind: f.kind === 's' ? 'scab' : 'cab', fid: f.id, i }); inst.add(h); e.hits.push(h); }
          if (c.plate) {
            const plate = this.makePlate();
            plate.position.set(c.plate[0], c.plate[1], c.plate[2] - 0.012);
            inst.add(plate);
            e.plates[i] = plate;
            const h = hitBox([0.2, 0.1, 0.06], c.plate, { kind: 'plate', fid: f.id, i });
            inst.add(h); e.hits.push(h);
          }
        });
        // the furniture's own BoxCollider: PlayerObjectMover holds it to move (cab / plate hits inside take priority)
        if (lay.collider) { const h = hitBox(lay.collider.size, lay.collider.c, { kind: 'furn', fid: f.id }); h.rotation.y = lay.collider.yaw; inst.add(h); e.hits.push(h); }
        this.furn.set(f.id, e);
      }
      const pl = this.sim.s.placing;
      const mv = f.moving && pl && pl.fid === f.id;
      e.inst.position.set(mv ? pl.x : f.x, 0.047, mv ? pl.z : f.z);
      e.inst.rotation.set(0, mv ? this.yawShown(pl.yaw) : f.yaw, 0);
      for (const h of e.hits) h.visible = !mv;
      if (f.kind === 'f') lay.cabinets.forEach((c, i) => this.syncShelf(e, f, c, i));
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
        // the box prefabs were saved with their items already under the product holder (BaseDeliveryBox.itemList,
        // which GetLastItem / BoxItemsCountSet shrink as items leave); the items drawn below stand in for that list,
        // so the saved copies are hidden
        const hold = lay.holder != null ? childAt(inst, lay.holder) : null;
        if (hold && hold !== inst) for (const c of hold.children) c.visible = false;
        e = { inst, rig, items: [], open: null, hit: h };
        this.boxes.set(b.id, e);
      }
      const pl = this.sim.s.placing;
      e.inst.visible = !(pl && pl.src === 'box' && pl.box === b.id);
      if (b.stored) {   // on a storage rack: follows the rack while it is being moved
        const f = this.sim.s.furniture.find(x => x.id === b.stored.fid);
        const fe = f && this.furn.get(f.id);
        if (fe) {
          const sl = this.sim.layoutOf(f).cabinets[b.stored.i].slots[0];
          if (e.inst.parent !== fe.inst) { fe.inst.add(e.inst); }
          e.inst.position.set(sl[0], sl[1], sl[2]); e.inst.rotation.set(0, 0, 0);
        }
      } else if (b.held) {
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
      const want = b.kind === 'p' && (b.open || this.sim.isAnimalBox(b)) ? b.n : 0;   // an animal box shows its animal
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
      if (e.rig) e.rig.play(CUSTOMER_ANIM[c.anim] || 'Idle', 0.2);   // CrossFade 0.2 s
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
      if (bag) bag.visible = c.st === 'exitFull' || c.st === 'paid';
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
      for (const o of this.counter) { o.removeFromParent(); if (o.userData.rig) this.rigs.delete(o.userData.rig); }
      this.counter = want.map((it, i) => {
        const pl = this.L.products[it.type];
        const o = pl ? this.pool.instance(pl.root) : new THREE.Group();
        o.userData.ptype = it.type;
        // AnimalProduct.OnAnimalMoveToCounter: Animator.Play("Sit"), then its loop
        const rig = pl && pl.kind === 'AnimalProduct' ? this.pool.rig(o) : null;
        if (rig) {
          this.rigs.add(rig); o.userData.rig = rig;
          if (rig.has('Sit')) { rig.play('Sit', 0); o.userData.sitT = 1.0; }
        }
        const p = this.counterPos[i % this.counterPos.length];
        o.position.set(p[0], p[1], p[2]);
        const h = hitBox([0.3, 0.3, 0.3], [0, 0.12, 0], { kind: 'scan', idx: i });
        o.add(h);
        o.userData.hitMesh = h;
        this.scene3.add(o);
        return o;
      });
    }
    want.forEach((it, i) => {
      const o = this.counter[i];
      o.visible = !it.scanned;
      if (o.userData.sitT > 0 && (o.userData.sitT -= this.dt) <= 0 && o.userData.rig.has('SitLoop')) o.userData.rig.play('SitLoop', 0.2);   // [GUESS: Sit -> SitLoop after 1 s]
    });
  }

  syncScene() {
    const s = this.sim.s;
    if (this.signOpen) this.signOpen.visible = s.open;
    if (this.signClose) this.signClose.visible = !s.open;
    // StoreExpandHelper.OnExpansionUnlocked: the walls (block volumes) of the largest owned expansion only
    const on = this.sim.wallsOn();
    for (const w of this.walls) for (const n of w.nodes) n.visible = w.type === on;
    // StorageSystem.UnlockStorage: SetActive(false) on the shutter's fake interact, DOMove of the door
    // [GUESS: 2.6 m up over 1 s, then both hidden so their colliders are gone]
    if (s.storageService && this.openT < 1) this.openT = Math.min(1, this.openT + this.dt);
    const up = this.openT * 2.6;
    this.shutter.position.y = this.shutterY + up;
    this.door.position.y = this.doorY + up;
    this.shutter.visible = this.door.visible = this.openT < 1;
    for (const h of this.lockHits) h.visible = !s.storageService;
    for (const m of this.machines) { const v = s.level >= m.level; for (const o of m.objs) o.visible = v; m.hit.visible = v; }
    if (this.restrict) this.restrict.visible = !!s.placing;
    this.drawBoard();
  }

  // MoveObjButtons rotate: rotationSpeed 700 deg/s towards the target yaw
  yawShown(target) {
    if (this.shownYaw == null) this.shownYaw = target;
    const d = target - this.shownYaw, step = 700 * Math.PI / 180 * this.dt;
    this.shownYaw = Math.abs(d) <= step ? target : this.shownYaw + Math.sign(d) * step;
    return this.shownYaw;
  }

  syncPlacing() {
    const p = this.sim.s.placing;
    if (!p) {
      if (this.padOn) { this.padOn.visible = false; this.padOn = null; }
      if (this.preview) { this.preview.removeFromParent(); this.preview = null; }
      this.boundMesh.visible = false; this.shownYaw = null;
      return;
    }
    const lay = (p.kind === 'f' ? this.L.furniture : this.L.storage)[p.type];
    if (p.src === 'box') {
      if (!this.preview || this.preview.userData.key !== `${p.kind}${p.type}`) {
        if (this.preview) this.preview.removeFromParent();
        this.preview = this.pool.instance(lay.root);
        this.preview.userData.key = `${p.kind}${p.type}`;
        this.scene3.add(this.preview);
      }
      this.preview.position.set(p.x, 0.047, p.z);
      this.preview.rotation.set(0, this.yawShown(p.yaw), 0);
    }
    const ok = this.sim.placeOk();
    this.placeOk = ok;
    // the prefab's own "Pad" (ObjectPickedMat, green 0.38/1/0 at 39 % alpha, inactive in the prefab) marks the footprint
    // while it is held; it turns red when CanPlace fails [GUESS: the red tint's exact colour]
    const inst = p.src === 'box' ? this.preview : (this.furn.get(p.fid) || {}).inst;
    let pad = null;
    if (inst) inst.traverse(o => { if (!pad && o.name === 'Pad') pad = o; });
    if (pad) {
      if (this.padOn && this.padOn !== pad) this.padOn.visible = false;
      this.padOn = pad;
      pad.visible = true;
      pad.traverse(o => {
        if (!o.isMesh) return;
        // unlit copy: under the rebuilt ambient the lit transparent material washes out to white
        if (!o.userData.padMat) { o.material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3922, depthWrite: false }); o.userData.padMat = true; }
        // FurniturePlaceHelper greenColor (0.38039, 1, 0, 0.39216) / redColor (1, 0, 0, 0.39216)
        o.material.color.setRGB(ok ? 0.38039 : 1, ok ? 1 : 0, 0);
      });
      this.boundMesh.visible = false;
      return;
    }
    if (lay.bound) {
      const yaw = this.shownYaw ?? p.yaw, c = Math.cos(yaw), sn = Math.sin(yaw), b = lay.bound;
      this.boundMesh.visible = true;
      this.boundMesh.position.set(p.x + c * b.c[0] + sn * b.c[2], 0.047 + b.c[1], p.z - sn * b.c[0] + c * b.c[2]);
      this.boundMesh.rotation.set(0, yaw, 0);
      this.boundMesh.scale.set(b.size[0], b.size[1], b.size[2]);
      this.boundMesh.material.color.setHex(ok ? 0x00ff00 : 0xff0000);
    }
  }

  // CashierNPC (pool "cashier" prefab, Cashier controller: Waving_0 at the hiring spot, Walk, Idle / Checkout at work)
  syncCashier() {
    const k = this.sim.cashier;
    if (!k) { if (this.cashierObj) this.cashierObj.obj.visible = false; return; }
    if (!this.cashierObj) {
      const obj = this.pool.root(this.L.cashier);
      if (obj.parent !== this.scene3) this.scene3.add(obj);
      const rig = obj.userData.rig || (obj.userData.rig = this.pool.rig(obj));
      if (rig) this.rigs.add(rig);
      const hit = hitBox([0.8, 1.8, 0.8], [0, 0.9, 0], { kind: 'cashier' });
      obj.add(hit);
      this.cashierObj = { obj, rig, hit };
    }
    const e = this.cashierObj;
    e.obj.visible = true;
    e.obj.position.set(k.x, 0, k.z);
    e.obj.rotation.set(0, k.yaw, 0);
    if (e.rig) e.rig.play(k.anim);
    e.hit.visible = k.st === 'hiring';
  }

  // All hit meshes that are live right now.
  targets() {
    const out = this.hits.filter(h => h.visible && !this.lockHits.includes(h) && !this.machines.some(m => m.hit === h));
    for (const e of this.furn.values()) out.push(...e.hits.filter(h => h.visible));
    for (const e of this.boxes.values()) if (e.hit.visible) out.push(e.hit);
    for (const e of this.custs.values()) if (e.hit.visible) out.push(e.hit);
    if (this.cashierObj && this.cashierObj.hit.visible && this.cashierObj.obj.visible) out.push(this.cashierObj.hit);
    for (const h of this.lockHits) if (h.visible) out.push(h);
    for (const m of this.machines) if (m.hit.visible) out.push(m.hit);
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
    this.syncPlacing();
    this.syncCashier();
    this.animArrow(dt);
    for (const r of this.rigs) r.update(dt);
  }
}
