// Draws the simulation on the exported scene: unlock visibility, player/customer/worker rigs, item stacks in every slot,
// cash piles, and the short flights between them. Reads sim.state each frame and reacts to sim events.
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';
import { makeMaterial, addSmoothNormals } from './toon.js';
import { ITEM_HEIGHT } from '../sim/sim.js';
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

  // Object3D.copy deep-copies userData through JSON, and a Rig points back at its object: lift rigs off first and
  // give the clone its own rigs on the same controllers.
  cloneObject(template) {
    const rigs = [];
    template.traverse(x => { if (x.userData.rig) { rigs.push([x, x.userData.rig]); delete x.userData.rig; } });
    let o;
    try { o = cloneSkinned(template); } finally { rigs.forEach(([x, r]) => { x.userData.rig = r; }); }
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
    for (const name of this.toggled || (this.toggled = new Set([...store.activatedLater, ...store.mats.map(m => m.name)]))) {
      const o = this.named(name);
      if (!o) continue;
      const on = st.active.has(name);
      if (on && !o.visible && this.started) this.popIn(o);
      o.visible = on;
    }
    const xc = this.sim.boosters && this.sim.boosters.cashMat && this.obj(this.sim.boosters.cashMat.node);
    if (xc) {
      const on = !!st.boost.cash;
      if (on && !xc.visible) this.popIn(xc);
      xc.visible = on;
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
    this.syncStack('player', st.carry, (g, k) => { g.position.set(0, ITEM_HEIGHT * k, 0); g.rotation.set(0, 0, 0); }, this.playerSlot);

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
    this.updateWorkers(dt);
    this.updateFlights(dt);
  }

  placeAgent(o, a) {
    if (!o) return;
    tmp.set(a.x, a.y || 0, a.z);
    o.parent.worldToLocal(tmp);
    o.position.copy(tmp);
    if (a.dirX || a.dirZ) {
      const yaw = Math.atan2(a.dirX, a.dirZ);
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
      const carrying = c.carried.length > 0 && c.state !== 7;
      if (v.rig) {
        v.rig.play(c.moving ? (carrying ? 'WalkingCarry' : 'Walking') : (carrying ? 'Idle_Carry' : 'Idle'));
        if (v.clone) v.rig.update(dt);
      }
      const slot = v.obj.getObjectByName('BoxTransformSlot') || v.obj;
      this.syncStack(`cust${c.id}`, c.state >= 5 ? [] : c.carried, (g, k) => { g.position.set(0, ITEM_HEIGHT * k, 0); }, slot);
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
  fly(key, k, from, duration, type, jump, toPoint = null) {
    if (!from) return;
    this.flights.push({ key, k, from: new THREE.Vector3(from.x, from.y, from.z), t: 0, duration: Math.max(duration, 0.05), type, jump, toPoint, ghost: null });
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
      const to = target ? target.getWorldPosition(new THREE.Vector3()) : f.toPoint ? new THREE.Vector3(f.toPoint.x, f.toPoint.y, f.toPoint.z) : f.from;
      const a = Math.min(f.t / f.duration, 1), e = 1 - (1 - a) * (1 - a);
      f.ghost.position.lerpVectors(f.from, to, e);
      f.ghost.position.y += Math.sin(Math.PI * a) * f.jump;
      if (a >= 1) {
        this.release(f.ghost);
        if (target) { target.userData.flying = false; target.visible = true; }
        this.flights.splice(i, 1);
      }
    }
  }
}
