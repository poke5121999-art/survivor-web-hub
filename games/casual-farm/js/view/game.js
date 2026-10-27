// Draws the simulation on the exported scene: unlock visibility, player/customer/worker rigs, item stacks in every slot,
// cash piles, and the short flights between them. Reads sim.state each frame and reacts to sim events.
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';
import { makeMaterial, addSmoothNormals } from './toon.js';
import { ITEM_HEIGHT, carryLimit } from '../sim/sim.js';
import { NEW_VISUALS } from '../sim/store.js';
import { Rig } from './anim.js';

const tmp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const CASH_LAYER_STEP = 0.45;
const POP_TIME = 0.25;
// DOTween eases used by the original's moves.
const EASE = {
  linear: t => t,
  inBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
  inCirc: t => 1 - Math.sqrt(1 - t * t),
  outCirc: t => Math.sqrt(1 - (t - 1) * (t - 1)),
};

// The prop set not in use (NEW_VISUALS, sim/store.js) is hidden.
export function hideOtherVisuals(o, k) {
  const a = k['__Funflare.Scripts.Helper.NewVisualObjectActivator'];
  if (a && !!(Array.isArray(a) ? a[0] : a).isNewVersion !== NEW_VISUALS) o.visible = false;
  const r = k['__Funflare.Scripts.Helper.NewVisualMeshRendererActivator'];
  if (r && !!(Array.isArray(r) ? r[0] : r).isNewVersion !== NEW_VISUALS) {
    for (const c of o.children) if (c.isMesh && !c.userData.node) c.visible = false;
  }
}

export class GameView {
  constructor({ world, store, sim, items, itemsGltf, texBase, anim }) {
    this.world = world;
    this.store = store;
    this.sim = sim;
    this.anim = anim;
    this.items = items;
    this.root = world.root;
    this.flights = [];
    this.pops = [];
    this.tweens = [];
    this.started = false;
    this.byIndex = world.objects;

    // Item prototypes: one geometry (+ outline) per MyObjectType, shared material from the Input_Item prefab.
    const geo = [];
    itemsGltf.scene.children.forEach(o => { geo[+o.name.slice(1)] = o; });
    // items.json names textures directly; makeMaterial expects an index into a {name} list.
    const texList = items.textures.map(n => ({ name: n }));
    const itemMaterial = m => makeMaterial({ ...m, tex: m.tex != null ? items.textures.indexOf(m.tex) : null }, texBase, texList, {});
    const base = itemMaterial(items.material);
    this.itemMat = base;
    this.itemProto = {};
    for (const [type, t] of Object.entries(items.types)) {
      const src = geo[t.mesh];
      if (!src) continue;
      const mats = t.material ? itemMaterial(t.material) : base;
      const prims = src.isMesh ? [src] : src.children;
      src.updateMatrix();
      this.itemProto[type] = { prims: prims.map(p => p.geometry), matrix: src.matrix.clone(), mats };
      prims.forEach(p => { if (mats.outline) addSmoothNormals(p.geometry); });
    }
    // Checkout box (MatCustomer.boxPrefab): open and sealed meshes placed under one root, plus the 4 item slots.
    this.boxDef = items.box && items.box.open && items.box.sealed ? items.box : null;
    if (this.boxDef) {
      for (const part of ['open', 'sealed']) {
        const d = this.boxDef[part], src = geo[d.mesh];
        if (!src) { this.boxDef = null; break; }
        src.updateMatrix();
        d.proto = { prims: (src.isMesh ? [src] : src.children).map(p => p.geometry), matrix: src.matrix.clone(),
          place: new THREE.Matrix4().fromArray(d.matrix), mats: d.material ? itemMaterial(d.material) : base };
        d.proto.prims.forEach(g => { if (d.proto.mats.outline) addSmoothNormals(g); });
      }
    }
    this.checkouts = new Map();
    this.pool = [];
    this.layer = new THREE.Group();
    this.layer.name = 'items';
    this.root.add(this.layer);

    this.player = this.obj(store.player.node);
    this.hideDebug();
    const ph = store.comp(store.player.node, 'PlayerHumanController');
    this.playerSlot = this.obj(ph.carryingSlotTransform.n);
    this.playerRig = this.rigOf(this.player);
    this.customerViews = new Map();
    this.workerViews = new Map();
    this.agentTemplates = new Map(store.customers.agents.map(a => [a.name, this.obj(a.node)]));
    this.stacks = new Map();
    // CSV-built mats (Stores 9-14) are clones of the prefab under "__Prefabs", placed where ProgressionData puts them.
    for (const m of store.mats) {
      if (m.template == null) continue;
      const o = this.cloneObject(this.obj(m.template));
      o.matrix.fromArray(m.matrix);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
      o.name = m.name;
      o.visible = false;
      this.root.add(o);
      world.byName.set(m.name, o);
    }
  }

  // Entrance doors and fridge doors (rules/census-instore.md 3.2, 3.3): each opens while any player, worker, customer
  // or thief body is inside its trigger box and closes after the last one leaves.
  initDoors() {
    const s = this.store;
    this.doors = [];
    s.nodes.forEach((n, i) => {
      const k = n.k || {};
      const d = k.DoorSlidingController || k.DoorPaper;
      if (d && d.leftDoor && d.rightDoor) {
        const L = this.obj(d.leftDoor.n), R = this.obj(d.rightDoor.n);
        if (L && R) this.doors.push({ kind: k.DoorPaper ? 'paper' : 'slide', zone: s.box(i), leaves: [L, R], base: [L.position.x, R.position.x], k: 0, open: false });
      }
      if (k.FridgeRadarController && k.FridgeRadarController.shelfFridgeInstance) {
        const f = s.comp(k.FridgeRadarController.shelfFridgeInstance.n, 'ShelfFridgeController');
        const L = f && f.leftDoorTransform && this.obj(f.leftDoorTransform.n), R = f && f.rightDoorTransform && this.obj(f.rightDoorTransform.n);
        if (L && R) {
          this.doors.push({ kind: 'fridge', zone: s.box(i), leaves: [L, R], base: [L.quaternion.clone(), R.quaternion.clone()], k: 0, open: false,
            openBy: THREE.MathUtils.degToRad(f.openBy ?? 135), openT: f.openDuration ?? 0.75, closeT: f.closeDuration ?? 0.75,
            delay: (f.delayBeforeClosing ?? 0.1) + (f.openDuration ?? 0.75) });
        }
      }
    });
  }

  updateDoors(dt) {
    if (!this.doors) this.initDoors();
    if (!this.doors.length) return;
    const st = this.sim.state;
    const bodies = [st.player, ...(st.workers || []), ...(st.customers || [])];
    if (st.thief && st.thief.agent) bodies.push(st.thief.agent);
    const yAxis = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    for (const d of this.doors) {
      const inside = bodies.some(b => d.zone.contains({ x: b.x, y: d.zone.middle.y, z: b.z }));
      if (inside !== d.open) { d.open = inside; d.wait = inside ? 0 : (d.kind === 'fridge' ? d.delay : d.kind === 'paper' ? 1.5 : 2.5); }
      if (d.wait > 0) { d.wait -= dt; continue; }
      // Opening and closing speeds: slide 1.0 / 2.5 s, paper 1.0 / 2.5 s, fridge openDuration / closeDuration.
      const dur = d.open ? (d.kind === 'fridge' ? d.openT : 1) : (d.kind === 'fridge' ? d.closeT : 2.5);
      d.k = THREE.MathUtils.clamp(d.k + (d.open ? dt : -dt) / dur, 0, 1);
      // DOTween default OutQuad on the way out; the fridge closes with InQuart.
      const e = d.open || d.kind !== 'fridge' ? 1 - (1 - d.k) * (1 - d.k) : d.k * d.k * d.k * d.k;
      if (d.kind === 'slide') d.leaves.forEach(o => { o.scale.x = 1 + (0.112 - 1) * e; });
      else if (d.kind === 'paper') d.leaves.forEach((o, j) => { o.position.x = d.base[j] + (j ? 9.7 : -9.7) * e; });
      else {
        // ShelfFridgeController.OpenDoor: local euler y + openBy (left) / - openBy (right); the mirrored export flips the sign.
        d.leaves.forEach((o, j) => { o.quaternion.copy(q.setFromAxisAngle(yAxis, (j ? 1 : -1) * d.openBy * e)).multiply(d.base[j]); });
      }
    }
  }

  // Object3D.copy deep-copies userData through JSON, and a Rig points back at its object: lift rigs off first and
  // give the clone its own rigs on the same controllers.
  cloneObject(template) {
    const rigs = [];
    template.traverse(x => { if (x.userData.rig) { rigs.push([x, x.userData.rig]); delete x.userData.rig; } });
    // Whatever the view hung on the template (carried items, a checkout box) belongs to the customer using it, not
    // to the clone.
    const held = [];
    template.traverse(x => { if (x !== template && (x.userData.type !== undefined || x.name === 'PackagingBox')) held.push([x, x.parent]); });
    held.forEach(([x, p]) => p.remove(x));
    let o;
    try { o = cloneSkinned(template); } finally {
      rigs.forEach(([x, r]) => { x.userData.rig = r; });
      held.forEach(([x, p]) => p.add(x));
    }
    const ctrlByName = new Map(rigs.map(([x, r]) => [x.name, r.ctrl]));
    o.traverse(x => {
      if (ctrlByName.has(x.name)) x.userData.rig = new Rig(this.anim, x, ctrlByName.get(x.name));
    });
    return o;
  }

  obj(i) {
    return this.byIndex[i];
  }

  named(name) {
    return this.world.byName.get(name);
  }

  rigOf(o) {
    let rig = null;
    o.traverse(c => { if (!rig && c.userData.rig) rig = c.userData.rig; });
    return rig;
  }

  // Meshes the original switches off at runtime: editor helpers, slot markers whose controller disables its own
  // MeshRenderer in Start (decomp: SlotCashierQueueController, SlotRVController, MeshDisablerController), and player
  // props that only appear while chasing a thief (PlayerHumanController scales netTransform to 0 on start).
  hideDebug() {
    const SELF_HIDING = ['DebugSphere', 'SlotCashierQueueController', 'SlotRVController', 'MeshDisablerController', 'MatRVSpawnPoint'];
    this.byIndex.forEach(o => {
      const k = o.userData.node.k || {};
      if (SELF_HIDING.some(c => k[c]) || /^placeholder/i.test(o.name)) o.visible = false;
    });
    // Rewarded-video carts (ads are not part of this build) and seasonal decorations: with no season running,
    // SeasonVisual_GameObject.DisableAllVisualObjects shows the default objects and hides every seasonal one.
    // MatRVSpawnerController stays: its extra-cash mat shows while the offer is up (Boosters).
    const AD_ONLY = ['TurThanksgivingRvMat', 'AdsBoxesSpawner'];
    this.byIndex.forEach(o => {
      const k = o.userData.node.k || {};
      if (AD_ONLY.some(c => k[c])) o.visible = false;
      hideOtherVisuals(o, k);
      for (const c of ['__Funflare.Scripts.SeasonalEvents.SeasonVisual_GameObject', '__Funflare.Scripts.SeasonalEvents.SeasonVisual_GameObject_Randomized']) {
        if (!k[c]) continue;
        (k[c].seasonalVisuals || []).forEach(v => (v.visuals || []).forEach(r => { if (r && r.n != null) this.obj(r.n).visible = false; }));
      }
    });
    const ph = this.player && this.player.userData.node.k && this.player.userData.node.k.PlayerHumanController;
    if (ph) for (const f of ['netTransform', 'dottedIndicatorObj', 'thiefRadarInstance', 'objectiveRadarInstance', 'vanCarObj', 'speedBoostLeft', 'speedBoostRight']) {
      const o = ph[f] && this.obj(ph[f].n);
      if (o) o.visible = false;
    }
  }

  // --- item meshes -----------------------------------------------------------------------------------------------
  makeItem(type) {
    const proto = this.itemProto[type] || this.itemProto[1];
    let g = this.pool.find(p => !p.parent && p.userData.type === type);
    if (g) return g;
    g = new THREE.Group();
    g.userData.type = type;
    for (const geo of proto.prims) {
      const m = new THREE.Mesh(geo, proto.mats.mat);
      m.applyMatrix4(proto.matrix);
      g.add(m);
      if (proto.mats.outline) {
        const ol = new THREE.Mesh(geo, proto.mats.outline);
        ol.applyMatrix4(proto.matrix);
        g.add(ol);
      }
    }
    this.pool.push(g);
    return g;
  }

  release(g) {
    if (g.parent) g.parent.remove(g);
  }

  makeBox() {
    const root = new THREE.Group();
    root.name = 'PackagingBox';
    for (const part of ['open', 'sealed']) {
      const p = this.boxDef[part].proto, g = new THREE.Group();
      g.name = part;
      g.matrixAutoUpdate = false;
      g.matrix.copy(p.place);
      for (const geo of p.prims) {
        const m = new THREE.Mesh(geo, p.mats.mat);
        m.applyMatrix4(p.matrix);
        g.add(m);
        if (p.mats.outline) { const ol = new THREE.Mesh(geo, p.mats.outline); ol.applyMatrix4(p.matrix); g.add(ol); }
      }
      g.visible = part === 'open';
      root.add(g);
    }
    root.userData.slots = this.boxDef.slots.map(s => new THREE.Vector3(s[0], s[1], s[2]));
    return root;
  }

  // --- checkout desk (rules/checkout-anim.md) ----------------------------------------------------------------------
  // t = 0 when packing starts: the box pops in at the desk slot (0.25 s OutBack); every 0.3 s the customer's top item
  // hops into the next of the 4 slots (jump 4, 0.5 s); at `close` the lid shuts (0.6 s clip) and the trolley shrinks;
  // at close + 0.75 the sealed box replaces the open one and arcs to the customer's BoxTransformSlot (0.5 s, apex 3),
  // where it stays until the customer is gone.
  startCheckout(e) {
    if (!this.boxDef) return;
    const desk = this.store.cashiers[e.cashier], slotObj = desk && this.obj(desk.boxNode);
    if (!slotObj) return;
    const box = this.makeBox();
    slotObj.getWorldPosition(box.position);
    slotObj.getWorldQuaternion(box.quaternion);
    box.scale.setScalar(0.0001);
    this.layer.add(box);
    this.checkouts.set(e.id, { id: e.id, t: 0, box, close: e.close, items: e.items.slice(), launched: 0, hops: [], phase: 'pack',
      deskPos: box.position.clone(), deskQuat: box.quaternion.clone() });
  }

  updateCheckouts(dt) {
    const outBack = k => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
    for (const [id, co] of this.checkouts) {
      co.t += dt;
      const v = this.customerViews.get(id);
      const c = (this.sim.state.customers || []).find(x => x.id === id);
      if (!c || !v) {
        this.release(co.box);
        co.hops.forEach(h => this.release(h.g));
        this.checkouts.delete(id);
        continue;
      }
      if (co.phase === 'pack') {
        co.box.scale.setScalar(Math.max(0.0001, outBack(Math.min(co.t / 0.25, 1))));
        // LIFO: the top of the customer's stack leaves first, from where it is drawn.
        while (co.launched < co.items.length && co.t >= 0.25 + 0.3 * (co.launched + 1)) {
          const k = co.items.length - 1 - co.launched;
          const from = this.worldOfStack(`cust${id}`, k) || { x: c.x, y: 3, z: c.z };
          const g = this.makeItem(co.items[k]);
          const slot = co.box.userData.slots[co.launched % 4];
          co.box.add(g);
          co.box.updateMatrixWorld(true);
          const local = co.box.worldToLocal(new THREE.Vector3(from.x, from.y, from.z));
          g.position.copy(local);
          co.hops.push({ g, from: local, to: slot.clone(), t: 0 });
          co.launched++;
        }
        for (const h of co.hops) {
          h.t = Math.min(h.t + dt, 0.5);
          const a = h.t / 0.5, e = 1 - (1 - a) * (1 - a);
          h.g.position.lerpVectors(h.from, h.to, e);
          h.g.position.y += Math.sin(Math.PI * a) * 4 / co.box.scale.y;
        }
        // Lid: the open box's flaps fold over the 0.6 s Closing clip; drawn as a short squash (no flap bones here).
        if (co.t >= co.close) {
          const k = Math.min((co.t - co.close) / 0.6, 1);
          co.box.children[0].scale.set(1, 1 - 0.12 * Math.sin(Math.PI * k), 1);
        }
        if (co.t >= co.close + 0.75) {
          co.phase = 'lift';
          co.box.children[0].visible = false;
          co.box.children[1].visible = true;
          co.hops.forEach(h => this.release(h.g));
          co.hops = [];
          co.liftFrom = co.box.position.clone();
        }
      }
      if (co.phase === 'lift') {
        const slot = v.obj.getObjectByName('BoxTransformSlot') || v.obj;
        const to = slot.getWorldPosition(new THREE.Vector3());
        const a = Math.min((co.t - co.close - 0.75) / 0.5, 1);
        // CatmullRom through the midpoint raised to 3 above the slot: a smooth arc, approximated by a sine lift.
        co.box.position.lerpVectors(co.liftFrom, to, a);
        co.box.position.y += Math.sin(Math.PI * a) * Math.max(0, 3 - Math.abs(to.y - co.liftFrom.y) / 2);
        const q = slot.getWorldQuaternion(new THREE.Quaternion());
        co.box.quaternion.slerpQuaternions(co.deskQuat, q, a);
        if (a >= 1) {
          co.phase = 'held';
          slot.add(co.box);
          co.box.position.set(0, 0, 0);
          co.box.quaternion.identity();
          co.box.scale.setScalar(1);
          // A world scale on the slot would shrink the box; keep its desk size.
          const ws = slot.getWorldScale(new THREE.Vector3());
          co.box.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
        }
      }
    }
  }

  // Bills landing on the desk pile: one per cash, straight from the customer's cash slot (0.35 s, no arc).
  deskCash(e) {
    const c = (this.sim.state.customers || []).find(x => x.id === e.id);
    const from = c ? { x: c.x, y: 1.9, z: c.z } : null;
    if (!from) return;
    for (let i = e.total - e.amount; i < e.total; i++) this.fly(`cash${e.cashier}`, i, from, 0.35, 11, 0);
  }

  // A stack is a keyed list of item meshes that should sit at given world positions (rebuilt when counts change).
  syncStack(key, types, place, parent = this.layer) {
    let s = this.stacks.get(key);
    if (!s) { s = []; this.stacks.set(key, s); }
    while (s.length > types.length) this.release(s.pop());
    for (let k = 0; k < types.length; k++) {
      if (!s[k] || s[k].userData.type !== types[k]) {
        if (s[k]) this.release(s[k]);
        s[k] = this.makeItem(types[k]);
        parent.add(s[k]);
      }
      if (s[k].parent !== parent) parent.add(s[k]);
      place(s[k], k);
      s[k].visible = !s[k].userData.flying;
    }
    return s;
  }

  // --- per frame -------------------------------------------------------------------------------------------------
  update(dt) {
    const sim = this.sim, st = sim.state, store = this.store;
    for (const e of sim.events) this.onEvent(e);
    sim.events.length = 0;

    // Mats too: the first one starts open (not "activated later") and every mat hides once bought.
    this.matNames = this.matNames || new Set(store.mats.map(m => m.name));
    for (const name of this.toggled || (this.toggled = new Set([...store.activatedLater, ...store.mats.map(m => m.name)]))) {
      const o = this.named(name);
      if (!o) continue;
      const on = st.active.has(name);
      if (on && !o.visible && this.started) {
        this.popIn(o);
        // ActivateObject plays the Big smoke puff (Cashier/Factory/Worker controllers); mats just pop in.
        if (this.fx && !this.matNames.has(name)) this.fx.puff('big', o.getWorldPosition(new THREE.Vector3()));
      }
      o.visible = on;
    }
    const xc = this.sim.boosters && this.sim.boosters.cashMat && this.obj(this.sim.boosters.cashMat.node);
    if (xc) {
      const on = !!st.boost.cash;
      if (on && !xc.visible) {
        this.popIn(xc);
        // MatRVController.UpdateLocation: Small puff where the ad mat appears; its Sparkle runs while it shows.
        if (this.fx) this.fx.puff('small', this.sim.boosters.cashMat.pos);
      }
      xc.visible = on;
      if (this.fx) this.fx.sparkle('xcash', this.sim.boosters.cashMat.pos, on);
    }
    this.started = true;
    this.updatePops(dt);
    this.updateTweens(dt);
    store.coins.forEach((c, i) => { this.obj(c.node).visible = !st.coins[i].taken; });

    this.placeAgent(this.player, st.player);
    if (this.playerRig) {
      const carrying = st.carry.length > 0;
      this.playerRig.play(st.player.moving ? (carrying ? 'WalkingCarry' : 'Walking') : (carrying ? 'Idle_Carry' : 'Idle'));
    }
    // Past the player's own carry limit the items ride on the pet (PlayerHumanController.PickUp -> petSlotTransform):
    // StackingSlot_PetSmall/Medium/Big at y 2.3/3.0/3.9, z -0.2, one item every 1.3.
    const pet = this.looks && this.looks.pet, own = pet ? Math.min(st.carry.length, carryLimit(st.stackLevel)) : st.carry.length;
    this.syncStack('player', st.carry.slice(0, own), (g, k) => { g.position.set(0, ITEM_HEIGHT * k, 0); g.rotation.set(0, 0, 0); }, this.playerSlot);
    if (pet) {
      const y0 = { small: 2.3, medium: 3.0, big: 3.9 }[this.looks.petRow.size] || 2.3;
      this.syncStack('pet', st.carry.slice(own), (g, k) => { g.position.set(0, y0 + 1.3 * k, -0.2); g.rotation.set(0, 0, 0); }, pet.obj);
    } else if (this.stacks.has('pet')) this.syncStack('pet', [], () => {});

    store.producers.forEach((p, i) => {
      const ps = st.producers[i];
      const out = [];
      ps.out.forEach((t, k) => { if (t != null) out.push({ t, k }); });
      this.syncStack(`out${i}`, out.map(o => o.t), (g, k) => { const sp = p.outSlots[out[k].k]; g.position.set(sp.x, sp.y, sp.z); });
      p.inputs.forEach((inp, k) => {
        const n = ps.inputs[inp.type] || 0;
        this.syncStack(`in${i}.${k}`, new Array(n).fill(inp.type), (g, j) => {
          const sp = inp.slots[j % Math.max(inp.slots.length, 1)] || p.spawn;
          g.position.set(sp.x, sp.y, sp.z);
        });
      });
    });
    store.shelves.forEach((sh, i) => {
      const n = st.shelves[i].count;
      this.syncStack(`shelf${i}`, new Array(n).fill(sh.type), (g, k) => { const sp = sh.slots[k]; g.position.set(sp.x, sp.y, sp.z); });
    });
    store.cashiers.forEach((c, i) => {
      const n = Math.min(st.cashiers[i].cash, 80);
      const slots = c.cashSlots.length || 1;
      this.syncStack(`cash${i}`, new Array(n).fill(11), (g, k) => {
        const sp = c.cashSlots[k % slots];
        g.position.set(sp.x, sp.y + Math.floor(k / slots) % 8 * CASH_LAYER_STEP, sp.z);
      });
    });

    this.updateThief(dt);
    this.updateCar();
    this.updateCustomers(dt);
    this.updateCheckouts(dt);
    this.updateWorkers(dt);
    this.updateDoors(dt);
    this.updateFlights(dt);
    if (this.fx) this.updateFx(dt);
  }

  // Walking dust behind the player, boost rings while boosters run, then step every particle.
  updateFx(dt) {
    const st = this.sim.state, p = st.player, fx = this.fx;
    const last = this.lastPlayer || (this.lastPlayer = { x: p.x, z: p.z });
    const d = Math.hypot(p.x - last.x, p.z - last.z);
    if (p.moving && d > 0 && d < 5 && this.player && this.player.visible) fx.dust(p, p.dirX, p.dirZ, d);
    last.x = p.x; last.z = p.z;
    const b = this.sim.boosters;
    if (b) {
      fx.boost('player', () => st.player, b.on('player'));
      for (const w of st.workers || []) fx.boost(`w:${w.name}`, () => w, b.on('worker') && w.def.role !== 'cashier');
      this.store.producers.forEach((pr, i) => fx.boost(`p${i}`, () => pr.spawn, b.on('machine') && this.sim.isActive(pr.name)));
      this.store.cashiers.forEach((c, i) => fx.boost(`c${i}`, () => c.boxSlot, b.on('cash') && this.sim.isActive(c.name), 'revenue'));
    }
    fx.update(dt);
  }

  placeAgent(o, a) {
    if (!o) return;
    tmp.set(a.x, a.y || 0, a.z);
    o.parent.worldToLocal(tmp);
    o.position.copy(tmp);
    if (a.dirX || a.dirZ) {
      // Exported rigs face local -z (carry slot, trolley and box slot all sit at negative z).
      const yaw = Math.atan2(a.dirX, a.dirZ) + Math.PI;
      o.quaternion.setFromAxisAngle(UP, yaw);
    }
  }

  // MasterController show animation: scale 0 -> original over 0.25 s (DOTween default ease, OutQuad).
  popIn(o) {
    if (!o.userData.baseScale) o.userData.baseScale = o.scale.clone();
    o.scale.setScalar(0.0001);
    this.pops.push({ o, t: 0 });
  }

  updatePops(dt) {
    this.pops = this.pops.filter(p => {
      p.t = Math.min(p.t + dt, POP_TIME);
      const k = p.t / POP_TIME, e = 1 - (1 - k) * (1 - k);
      p.o.scale.copy(p.o.userData.baseScale).multiplyScalar(Math.max(e, 0.0001));
      return p.t < POP_TIME;
    });
  }

  // Local position (and optionally scale) tween of one object: {o, key, to, dur, delay, ease, scale, done}.
  tween(o, opts) {
    if (!o) return;
    this.tweens = this.tweens.filter(t => t.o !== o || t.key !== opts.key);
    this.tweens.push({ ...opts, o, t: -(opts.delay || 0), from: o.position.clone(), ease: EASE[opts.ease || 'linear'] });
  }

  updateTweens(dt) {
    this.tweens = this.tweens.filter(tw => {
      tw.t += dt;
      if (tw.t < 0) return true;
      if (!tw.started) { tw.started = true; tw.from = tw.o.position.clone(); if (tw.start) tw.start(); }
      const k = Math.min(tw.t / tw.dur, 1), e = tw.ease(k);
      if (tw.to) tw.o.position.lerpVectors(tw.from, tw.to, e);
      if (k < 1) return true;
      if (tw.done) tw.done();
      return false;
    });
  }

  // --- customers -------------------------------------------------------------------------------------------------
  customerObject(c) {
    let v = this.customerViews.get(c.id);
    if (v) return v;
    const name = c.agent.split('#')[0];
    const template = this.agentTemplates.get(name) || [...this.agentTemplates.values()][0];
    let o, clone = false;
    if (!c.agent.includes('#') && ![...this.customerViews.values()].some(x => x.obj === template)) {
      o = template;
    } else {
      clone = true;
      o = this.cloneObject(template);
      template.parent.add(o);
    }
    o.visible = true;
    v = { obj: o, rig: this.rigOf(o), id: c.id, clone };
    this.customerViews.set(c.id, v);
    return v;
  }

  updateCustomers(dt) {
    const alive = new Set();
    for (const c of this.sim.state.customers || []) {
      alive.add(c.id);
      const v = this.customerObject(c);
      v.obj.visible = true;
      this.placeAgent(v.obj, c);
      // limitToCarryByHand 3: a bigger order pushes the trolley (CheckWalkingAnimation plays the carry walk the whole
      // time); PickUpBox shrinks it to zero over 0.2 s when the packed box is handed over.
      const co = this.checkouts.get(c.id);
      const trolley = c.trolley && c.state < 7 && !(co && co.t >= co.close);
      if (v.trolley === undefined) {
        v.trolley = v.obj.getObjectByName('trolley') || null;
        if (v.trolley) v.trolley.userData.baseScale = v.trolley.userData.baseScale || v.trolley.scale.clone();
      }
      if (v.trolley) {
        if (trolley) { v.trolley.visible = true; v.trolley.scale.copy(v.trolley.userData.baseScale); v.shrink = 0; }
        else if (c.trolley && v.trolley.visible) {
          v.shrink = (v.shrink || 0) + dt;
          v.trolley.scale.copy(v.trolley.userData.baseScale).multiplyScalar(Math.max(0.0001, 1 - v.shrink / 0.2));
          if (v.shrink >= 0.2) v.trolley.visible = false;
        } else v.trolley.visible = false;
      }
      const left = co ? c.carried.length - co.launched : c.carried.length;
      const carrying = trolley || (left > 0 && c.state <= 5) || c.state === 7 || !!(co && co.t >= co.close + 0.75);
      if (v.rig) {
        v.rig.play(c.moving ? (carrying ? 'WalkingCarry' : 'Walking') : (carrying ? 'Idle_Carry' : 'Idle'));
        if (v.clone) v.rig.update(dt);
      }
      const hand = v.obj.getObjectByName('BoxTransformSlot') || v.obj;
      const items = c.state > 5 ? [] : c.carried.slice(0, Math.max(0, left));
      if (trolley && v.trolley) {
        // Four per layer in the basket (customers.md, inferred); trolley mesh spans local z -4.8..-0.4, top at 2.9.
        this.syncStack(`cust${c.id}`, items, (g, k) => {
          const j = k % 4, layer = Math.floor(k / 4);
          g.position.set(j % 2 ? 0.55 : -0.55, 1.5 + layer * ITEM_HEIGHT, (j < 2 ? -0.55 : 0.55) - 0.3);
        }, v.trolley);
      } else {
        this.syncStack(`cust${c.id}`, items, (g, k) => { g.position.set(0, ITEM_HEIGHT * k, 0); }, hand);
      }
    }
    for (const [id, v] of this.customerViews) {
      if (alive.has(id)) continue;
      v.obj.visible = false;
      const s = this.stacks.get(`cust${id}`);
      if (s) { s.forEach(g => this.release(g)); this.stacks.delete(`cust${id}`); }
      if (v.clone) v.obj.parent.remove(v.obj);
      this.customerViews.delete(id);
    }
  }

  // --- thief: a customer body carrying the stolen coins; the player shows the net while chasing ----------------------
  updateThief(dt) {
    const th = this.sim.state.thief, a = th && th.agent;
    if (this.net === undefined) {
      const ph = this.store.comp(this.store.player.node, 'PlayerHumanController');
      this.net = ph && ph.netTransform ? this.obj(ph.netTransform.n) : null;
    }
    if (this.net) this.net.visible = !!(th && th.chasing);
    if (!a) {
      if (this.thiefView) {
        this.thiefView.obj.visible = false;
        this.syncStack('thief', [], () => {}, this.thiefView.slot);
      }
      return;
    }
    if (!this.thiefView) {
      const template = [...this.agentTemplates.values()][0];
      const o = this.cloneObject(template);
      template.parent.add(o);
      this.thiefView = { obj: o, rig: this.rigOf(o), slot: o.getObjectByName('BoxTransformSlot') || o };
    }
    const v = this.thiefView;
    v.obj.visible = true;
    this.placeAgent(v.obj, a);
    if (v.rig) {
      v.rig.play(a.moving ? (a.carried ? 'WalkingCarry' : 'Walking') : (a.carried ? 'Idle_Carry' : 'Idle'));
      v.rig.update(dt);
    }
    this.syncStack('thief', new Array(Math.min(a.carried, 20)).fill(11), (g, k) => { g.position.set(0, CASH_LAYER_STEP * k, 0); }, v.slot);
  }

  // --- car customer: the mart's own van body parked at CarPoint, sliding in along its local z for 3 s (OutCirc) ------
  updateCar() {
    const cars = this.sim.cars, o = this.sim.state.car && this.sim.state.car.order;
    if (!cars || !cars.point) return;
    if (!this.carView) {
      const nm = this.store.nextMart, van = nm && nm.van != null ? this.obj(nm.van) : null;
      if (!van) { this.carView = { obj: null }; return; }
      const c = this.cloneObject(van);
      const pt = this.obj(cars.pointNode);
      pt.getWorldPosition(c.position);
      pt.getWorldQuaternion(c.quaternion);
      c.scale.copy(van.getWorldScale(new THREE.Vector3()));
      c.visible = false;
      this.root.add(c);
      this.carView = { obj: c, home: c.position.clone(), shown: false };
    }
    const v = this.carView;
    if (!v.obj) return;
    if (o && !v.shown) {
      v.shown = true;
      v.obj.visible = true;
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(v.obj.quaternion).multiplyScalar(150);
      v.obj.position.copy(v.home).add(back);
      this.tween(v.obj, { key: 'car', to: v.home.clone(), dur: 3, ease: 'outCirc' });
    } else if (!o && v.shown) {
      v.shown = false;
      v.obj.visible = false;
    }
  }

  // --- workers ---------------------------------------------------------------------------------------------------
  updateWorkers() {
    for (const w of this.sim.state.workers || []) {
      let v = this.workerViews.get(w.name);
      if (!v) {
        const o = this.named(w.name);
        const k = o && o.userData.node.k;
        const f = k && (k.PlayerWorkerAgentController || k.PlayerWorkerFarmController || k.PlayerWorkerChefController);
        v = { obj: o, rig: o && this.rigOf(o), slot: f && f.carryingSlotTransform ? this.obj(f.carryingSlotTransform.n) : o };
        this.workerViews.set(w.name, v);
      }
      if (!v.obj) continue;
      this.placeAgent(v.obj, w);
      const carrying = w.carry && w.carry.length > 0;
      if (v.rig) v.rig.play(w.def.role === 'cashier' && w.phase === 'work' ? 'Cashier' : w.moving ? (carrying ? 'WalkingCarry' : 'Walking') : (carrying ? 'Idle_Carry' : 'Idle'));
      if (w.carry) this.syncStack(`w${w.name}`, w.carry, (g, k) => { g.position.set(0, ITEM_HEIGHT * k, 0); }, v.slot);
    }
  }

  // --- events: producer animation states and item flights ----------------------------------------------------------
  producerRig(pi) {
    const p = this.store.producers[pi];
    return p.rig != null ? this.obj(p.rig).userData.rig : null;
  }

  onEvent(e) {
    switch (e.type) {
      case 'produceStart': {
        const r = this.producerRig(e.producer);
        if (r) r.play(r.has('Working') ? 'Working' : 'Eat');
        break;
      }
      case 'produceStop': {
        const r = this.producerRig(e.producer);
        if (r) r.play('Idle');
        break;
      }
      case 'depart': {
        // MatNextStore.FillUpCompleted: player hidden, van DOLocalMoveX +-50 over 1.5 s (InBack) after 1.0 s.
        if (this.player) this.player.visible = false;
        const nm = this.store.nextMart, van = nm && nm.van != null ? this.obj(nm.van) : null;
        if (van) this.tween(van, { key: 'van', to: van.position.clone().add(new THREE.Vector3(nm.left ? -50 : 50, 0, 0)), dur: 1.5, delay: 1, ease: 'inBack' });
        break;
      }
      case 'truck': {
        // FactoryAutoHarvester: truck slides along its local Z to -150 (Unity) and hides, then comes back to 0.
        const p = this.store.producers[e.producer], tr = p.truck && p.truck.node != null ? this.obj(p.truck.node) : null;
        if (!tr) break;
        if (!tr.userData.home) tr.userData.home = { pos: tr.position.clone(), scale: tr.scale.clone() };
        const home = tr.userData.home;
        if (e.move === 'out') {
          this.tween(tr, { key: 'truck', to: home.pos.clone().add(new THREE.Vector3(0, 0, 150)), dur: 2, delay: 0.5, ease: 'inCirc', done: () => { tr.visible = false; } });
        } else if (e.move === 'back') {
          this.tween(tr, { key: 'truck', to: home.pos.clone(), dur: 2, delay: 0.5, ease: 'outCirc', start: () => { tr.visible = true; } });
        }
        break;
      }
      case 'produced': {
        const p = this.store.producers[e.producer];
        this.fly(`out${e.producer}`, null, p.spawn, e.move, e.item, 0);
        break;
      }
      case 'pickup':
        this.fly('player', e.index, this.store.producers[e.producer].outSlots[e.slot], 0.15, e.item, 0);
        break;
      case 'drop': {
        const from = this.worldOfStack('player', e.from) || { x: this.sim.state.player.x, y: 3, z: this.sim.state.player.z };
        if (e.to.kind === 'shelf') this.fly(`shelf${e.to.i}`, e.slot, from, 0.35, e.item, 3);
        else if (e.to.kind === 'producer') this.fly(`in${e.to.i}.${e.to.k}`, null, from, 0.35, e.item, 3);
        else this.fly(null, null, from, 0.35, e.item, 3, e.to.kind === 'car' ? this.sim.cars.point : this.store.trash[e.to.i].pos);
        break;
      }
      case 'workerPick':
        this.fly(`w${e.name}`, e.index, this.store.producers[e.producer].outSlots[e.slot], 0.15, e.item, 0);
        break;
      case 'customerPick':
        this.fly(`cust${e.id}`, e.index, this.store.shelves[e.shelf].slots[e.slot], 0.3, e.item, 2);
        break;
      case 'customerPack':
        this.startCheckout(e);
        break;
      case 'customerGone': {
        // CustomerAgentController.CompletedLoop: the customer's own Big_2 smoke puff where it vanishes.
        const v = this.customerViews.get(e.id);
        if (this.fx && v) this.fx.puff('big', v.obj.getWorldPosition(new THREE.Vector3()));
        break;
      }
      case 'workerSpawn': {
        const w = (this.sim.state.workers || []).find(x => x.name === e.name);
        if (this.fx && w) this.fx.puff('big', w);
        break;
      }
      case 'thiefSpawn':
      case 'thiefGone': {
        const a = this.sim.state.thief && this.sim.state.thief.agent;
        if (this.fx && a) this.fx.puff('big', a);
        break;
      }
      case 'thiefCaught': {
        // psCaught: SmokePuff_ThiefCaught child, startDelay 0.6 s.
        const a = this.sim.state.thief && this.sim.state.thief.agent;
        if (this.fx && a) this.fx.puff('thief', { x: a.x, y: 0, z: a.z }, 0.6);
        break;
      }
      case 'upgraded':
        // PlayerController.UpgradeCarryingLimit -> PlayUpgradePS 0.4 s later (cyan spray).
        if (this.fx) this.fx.upgrade(() => this.sim.state.player, false);
        break;
      case 'levelUp':
        if (!this.fx) break;
        if (e.slot.kind === 'producer') {
          // FactoryController: Invoke("PlayConfetti", 1.0) after a level-up.
          const pr = this.store.producers[e.slot.i];
          this.fx.later(1, () => this.fx.confetti(pr.spawn));
        } else if (e.slot.kind === 'worker') {
          const w = (this.sim.state.workers || []).find(x => x.name === e.slot.name);
          if (w) this.fx.upgrade(() => w, true);
        }
        break;
      case 'deskCash':
        if (e.id != null) this.deskCash(e);
        break;
      case 'payMat': {
        const m = this.store.mats.find(x => x.name === e.name);
        if (m) this.payFlight(m.zone.middle);
        break;
      }
      case 'payUpgrade':
        if (this.store.player.upgradeZone) this.payFlight(this.store.player.upgradeZone.middle);
        break;
      case 'collect': {
        // The desk pile still holds the bill this frame (events run before the stacks resync).
        // The pile draws at most 80 bills, so a deeper index leaves from the top of what is drawn.
        const pile = this.stacks.get(`cash${e.cashier}`);
        const from = pile && pile.length ? this.worldOfStack(`cash${e.cashier}`, Math.min(e.index, pile.length - 1)) : null;
        const p = this.sim.state.player;
        // NewMoveCashTo: DOJump(power 8, 0.5 s, linear) + a full spin, to where the player was at launch.
        if (from) this.fly(null, null, from, 0.5, 11, 8, { x: p.x, y: 4, z: p.z }, { ease: 'linear', spin: true });
        break;
      }
      default:
        break;
    }
  }

  worldOfStack(key, k) {
    const s = this.stacks.get(key);
    if (!s || !s[k]) return null;
    s[k].getWorldPosition(tmp);
    return { x: tmp.x, y: tmp.y, z: tmp.z };
  }

  // Animate the item that just appeared at the end of stack `key` (or index k) from world point `from`.
  // toPoint may be a function (a moving target); opts.ease 'linear' and opts.spin (a full turn on x and y) copy the
  // cash bills' DOLocalJump + DORotate(360, 360) in MatActivateController.ReceivingAnimation.
  fly(key, k, from, duration, type, jump, toPoint = null, opts = {}) {
    if (!from) return;
    this.flights.push({ key, k, from: new THREE.Vector3(from.x, from.y, from.z), t: 0, duration: Math.max(duration, 0.05), type, jump, toPoint, ghost: null, ...opts });
  }

  // One bill per payment step, from the player's chest to a point (mat, upgrade pad).
  payFlight(to) {
    const p = this.sim.state.player;
    this.fly(null, null, { x: p.x, y: 4, z: p.z }, 0.45, 11, 8, { x: to.x, y: (to.y || 0) + 0.5, z: to.z }, { ease: 'linear', spin: true });
  }

  updateFlights(dt) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      const s = f.key ? this.stacks.get(f.key) : null;
      const target = s ? s[f.k == null ? s.length - 1 : Math.min(f.k, s.length - 1)] : null;
      if (!f.ghost) {
        f.ghost = this.makeItem(f.type);
        this.layer.add(f.ghost);
      }
      if (target) { target.userData.flying = f.t < f.duration; target.visible = !target.userData.flying; }
      const tp = typeof f.toPoint === 'function' ? f.toPoint() : f.toPoint;
      const to = target ? target.getWorldPosition(new THREE.Vector3()) : tp ? new THREE.Vector3(tp.x, tp.y, tp.z) : f.from;
      const a = Math.min(f.t / f.duration, 1), e = f.ease === 'linear' ? a : 1 - (1 - a) * (1 - a);
      f.ghost.position.lerpVectors(f.from, to, e);
      f.ghost.position.y += Math.sin(Math.PI * a) * f.jump;
      if (f.spin) f.ghost.rotation.set(a * Math.PI * 2, a * Math.PI * 2, 0);
      if (a >= 1) {
        f.ghost.rotation.set(0, 0, 0);
        this.release(f.ghost);
        if (target) { target.userData.flying = false; target.visible = true; }
        this.flights.splice(i, 1);
      }
    }
  }
}
