// Draws the simulation on the exported world: building lock/active roots, unlock pads with their paid fraction,
// falling and regrowing trees, the log stack on the player's back, item piles at machines, stores and on trucks,
// cash piles, the chop swing with the axe in hand.
import * as THREE from 'three';
import { frameMaterial } from './lowpoly.js';
import { Pile } from './props.js';
import { TREE } from '../sim/forest.js';
import { pathAt } from '../sim/sim.js';
import { clone as skClone } from '../../vendor/SkeletonUtils.js';
import { Rig } from './anim.js';

// Height of one item on a stack (ItemConf BackPosOffset y, rules/chop-carry.md C6).
const STEP_Y = { 10: 0.5, 101: 0.5, 102: 0.35, 1: 0.12, 1001: 0.38 };
const TRUCKS = ['Pre_Car_Truck1', 'Pre_Car_Truck2', 'Pre_Car_Truck3'];

export class GameView {
  constructor({ scene3, view, world, sim, props, playerObj, rig, tool, padGizmo, chars, lib, machines, cash = 'Pre_Cash' }) {
    Object.assign(this, { scene3, view, world, sim, props, playerObj, rig, tool, lib });
    // Research star looks (ResearchUpgradeConf.NewPrefab "normal|senior|senior2", FactoryRenderComponent.CheckMachineModel):
    // the machine (Pre_MachineBase*) or truck house (Pre_vehicle_r*) baked in the scene is swapped for the star's prefab.
    this.machineTpl = new Map((machines ? machines.root.children : []).map(o => [o.name, o]));
    this.models = new Map();
    for (const b of world.buildings.values()) {
      if (!sim.research.has(b.id)) continue;
      const i = world.descendants(b.node).find(j => /^Pre_(MachineBase|vehicle_r)/.test(world.nodes[j].n));
      if (i != null) this.models.set(b.id, { base: view.objects[i], shown: null, name: '' });
    }
    this.charTemplates = new Map((chars ? chars.root.children : []).map(o => [o.name, o]));
    this.workerViews = new Map();
    const W = new THREE.Vector3();
    this.worldPos = i => view.objects[i].getWorldPosition(W.clone());

    // Unlock pads (BuildingCtrller spawns Pre_LockFrame with m_LockSize at m_LockOffset).
    this.pads = new Map();
    const quad = new THREE.PlaneGeometry(1, 1);
    for (const b of world.buildings.values()) {
      if (!b.pad) continue;
      const m = new THREE.Mesh(quad, frameMaterial(padGizmo));
      m.rotation.set(-Math.PI / 2, b.pad.yaw, 0, 'YXZ');
      m.scale.set(b.pad.w, b.pad.d, 1);
      m.position.set(b.pad.center.x, 0.06, b.pad.center.z);
      m.renderOrder = 1;
      m.visible = false;
      scene3.add(m);
      this.pads.set(b.id, m);
    }

    // Trees: the standing trunk (m_ObjStand) falls 90 degrees in 1 s and regrows with a 0.5 s scale tween.
    this.trees = sim.forest.trees.map(t => {
      const o = t.stand != null ? view.objects[t.stand] : null;
      return { o, rot: o ? o.quaternion.clone() : null, scale: o ? o.scale.clone() : null, last: -1 };
    });

    // Back stack on the player.
    this.back = new THREE.Group();
    this.back.position.set(0, 1.0, 0.42);
    playerObj.add(this.back);
    this.backItems = [];

    // Piles at buildings.
    this.piles = new Map();
    const pileAt = (key, node, make, opts) => {
      if (node == null) return;
      const g = new THREE.Group();
      g.position.copy(this.worldPos(node));
      g.position.y = 0.15;
      scene3.add(g);
      this.piles.set(key, new Pile(g, make, opts));
    };
    for (const b of world.buildings.values()) {
      if (b.kind === 'factory') {
        pileAt(`${b.id}:in`, b.inNode, () => props.item(b.typeIn), { cols: 3, rows: 2, dx: 0.75, dz: 1.0, dy: STEP_Y[b.typeIn] });
        pileAt(`${b.id}:out`, b.outNode, () => props.item(b.typeOut), { cols: 3, rows: 2, dx: 0.75, dz: 1.0, dy: STEP_Y[b.typeOut] });
        pileAt(`${b.id}:cash`, b.moneyNode, () => props.make(cash), { cols: 2, rows: 2, dx: 0.55, dz: 0.8, dy: 0.12 });
      } else if (b.kind === 'warehouse') {
        pileAt(`${b.id}:in`, b.inNode, () => props.item(b.type), { cols: 4, rows: 3, dx: 0.6, dz: 0.75, dy: STEP_Y[b.type] });
      } else if (b.kind === 'truckStation') {
        pileAt(`${b.id}:cash`, b.exitNode, () => props.make(cash), { cols: 2, rows: 2, dx: 0.55, dz: 0.8, dy: 0.12 });
      } else if (b.kind === 'gas') {
        // GasHouseCtrller draws up to 8 cans of what the station holds (WarehouseRenderComponent with 8).
        pileAt(`${b.id}:gas`, b.outNode, () => props.item(1001), { cols: 2, rows: 2, dx: 0.5, dz: 0.5, dy: STEP_Y[1001] });
      } else if (b.kind === 'uav') {
        pileAt(`${b.id}:cash`, b.moneyNode, () => props.make(cash), { cols: 2, rows: 2, dx: 0.55, dz: 0.8, dy: 0.12 });
        // The drone (ExternalControlledDrone) leaves the station and flies on its own.
        const d = b.modelNode != null && view.objects[b.modelNode];
        if (d) { scene3.attach(d); this.drone = { o: d, y: d.position.y, log: props.item(10) }; d.add(this.drone.log); this.drone.log.position.set(0, -0.6, 0); }
      }
    }
    // A rented bike rides under the player (SkinBikeConf 100, Pre_Vehicle01_Vespa).
    this.bike = props.make('Pre_Vehicle01_Vespa');
    if (this.bike) { this.bike.visible = false; playerObj.add(this.bike); }
    this.trucks = new Map();
    this.flash = [];
  }

  // Lock/active roots and pads follow each building's status.
  syncStatus() {
    for (const b of this.world.buildings.values()) {
      const s = this.sim.status(b);
      const set = (i, v) => { if (i != null) this.view.objects[i].visible = v; };
      set(b.lockRoot, s !== 'active');
      set(b.activeRoot, s === 'active');
      set(b.lockLvRoot, s === 'levelLocked');
      if (b.kind === 'area') for (const w of b.walls) set(w, s !== 'active');
      // GuideMoneyCtrller: the startup cash on its frame is there only until it is picked up.
      if (b.kind === 'guideMoney') set(b.activeRoot, !this.sim.state.guideMoney);
      if (b.kind === 'bike') set(b.modelNode, s === 'active' && !this.sim.extras.riding);
      const pad = this.pads.get(b.id);
      if (pad) pad.visible = s === 'locked';
    }
  }

  syncModels() {
    const sim = this.sim;
    for (const [id, m] of this.models) {
      const r = sim.starRow(id);
      const name = r ? (r.NewPrefab || '').split('|')[sim.state.starAd[id] || 0] : '';
      if (name === m.name) continue;
      const tpl = name && this.machineTpl.get(name);
      if (m.shown) m.shown.parent.remove(m.shown);
      m.shown = null;
      m.name = name;
      m.base.visible = !tpl;
      if (!tpl) continue;
      const o = tpl.clone(true);
      o.position.copy(m.base.position);
      o.quaternion.copy(m.base.quaternion);
      o.scale.copy(m.base.scale);
      o.visible = true;
      m.base.parent.add(o);
      m.shown = o;
    }
  }

  // Items on a back point, rebuilt only when the pack changes (RoleBackpackComponent.SetObjectToPack).
  stack(group, shown, items) {
    if (items.length === shown.length && items.every((t, i) => shown[i].type === t)) return shown;
    shown.forEach(o => group.remove(o.obj));
    let y = 0;
    return items.map(type => {
      const obj = this.props.item(type) || new THREE.Group();
      obj.position.set(0, y, 0);
      obj.rotation.y = Math.PI / 2;
      y += STEP_Y[type] || 0.4;
      group.add(obj);
      return { type, obj };
    });
  }

  // Hired workers: a clone of their EmployeeConf prefab (or the nearest exported look-alike) with its own rig.
  workerView(w) {
    let v = this.workerViews.get(w);
    if (v) return v;
    const pool = w.kind === 'carrier' ? ['Pre_Carrier001', 'Pre_Carrier002'] : ['Pre_Timber001', 'Pre_Timber002', 'Pre_Timber003', 'Pre_Timber004'];
    const name = this.charTemplates.has(w.prefab) ? w.prefab : pool[w.index % pool.length];
    const src = this.charTemplates.get(name);
    if (!src) return null;
    const obj = skClone(src);
    obj.position.set(0, 0, 0);
    obj.visible = true;
    this.scene3.add(obj);
    let animObj = obj;
    obj.traverse(o => { if (animObj === obj && o.userData.node && o.userData.node.k && o.userData.node.k.Animator) animObj = o; });
    const rig = new Rig(this.lib, animObj, this.lib.role(name));
    const back = new THREE.Group();
    back.position.set(0, 1.0, 0.42);
    obj.add(back);
    let tool = null;
    const hand = obj.getObjectByName('+ R Hand');
    if (w.kind === 'timber' && hand && this.tool) {
      tool = this.tool.clone(true);
      hand.add(tool);
    }
    v = { obj, rig, back, items: [], tool };
    this.workerViews.set(w, v);
    return v;
  }

  updateWorkers(dt) {
    for (const w of this.sim.crew.workers) {
      const v = this.workerView(w);
      if (!v) continue;
      v.obj.position.set(w.x, 0, w.z);
      v.obj.rotation.y = w.dir + Math.PI;
      if (w.moving) v.rig.playRole('run');
      else if (w.chopping) v.rig.playChop('chopWood');
      else v.rig.playRole('idle');
      v.rig.update(dt);
      if (v.tool) v.tool.visible = w.chopping;
      v.items = this.stack(v.back, v.items, w.pack.items);
    }
  }

  // Collected cash (BuildingMoneyComponent.GetMoney): each note flies 0.7-1.5 m out from 0.5 m above the pile's
  // centre in 0.3 s while spinning to a random angle in 0.4 s, then is gone.
  scatter(o) {
    const g = o.parent;
    const from = o.getWorldPosition(new THREE.Vector3());
    const c = g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0));
    const dir = from.clone().sub(c);
    if (dir.lengthSq() < 1e-10) dir.set(0, 1, 0);
    dir.normalize().multiplyScalar(0.7 + Math.random() * 0.8);
    g.remove(o);
    o.position.copy(from);
    this.scene3.add(o);
    const spin = new THREE.Euler(Math.random() * 5.2, Math.random() * 5.2, Math.random() * 6.3);
    (this.flying || (this.flying = [])).push({ o, from, to: from.clone().add(dir), q0: o.quaternion.clone(),
      q1: new THREE.Quaternion().setFromEuler(spin), t: 0 });
  }

  flyCash(dt) {
    if (!this.flying) return;
    this.flying = this.flying.filter(f => {
      f.t += dt;
      const k = Math.min(1, f.t / 0.3), e = 1 - (1 - k) ** 3;
      f.o.position.lerpVectors(f.from, f.to, e);
      f.o.quaternion.slerpQuaternions(f.q0, f.q1, Math.min(1, f.t / 0.4));
      if (f.t < 0.4) return true;
      this.scene3.remove(f.o);
      return false;
    });
  }

  update(dt) {
    const sim = this.sim, S = sim.state;
    for (const [id, pad] of this.pads) {
      if (!pad.visible) continue;
      const b = this.world.buildings.get(id);
      pad.material.uniforms.progress.value = (S.paid[id] || 0) / b.cost;
    }

    sim.forest.trees.forEach((t, i) => {
      const v = this.trees[i];
      if (!v.o) return;
      if (t.state === TREE.FALLING) {
        const k = 1 - Math.max(0, t.timer);
        v.o.visible = true;
        const fall = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 * k * k);
        v.o.quaternion.copy(v.rot).premultiply(fall);
      } else if (t.state === TREE.STUMP) {
        v.o.visible = false;
      } else {
        v.o.visible = true;
        v.o.quaternion.copy(v.rot);
        if (t.grow > 0) {
          t.grow = Math.max(0, t.grow - dt);
          v.o.scale.copy(v.scale).multiplyScalar(1 - t.grow / 0.5);
        } else if (v.o.scale.x !== v.scale.x) {
          v.o.scale.copy(v.scale);
        }
      }
    });

    this.backItems = this.stack(this.back, this.backItems, sim.pack.items);
    this.updateWorkers(dt);

    for (const [key, pile] of this.piles) {
      const [id, kind] = key.split(':');
      const b = this.world.buildings.get(+id);
      const on = sim.active(+id);
      pile.group.visible = on;
      if (!on) continue;
      if (kind === 'gas') { pile.set(Math.min(8, sim.extras.gasStock())); continue; }
      if (kind === 'cash') {
        const n = Math.min(16, Math.ceil((S.piles[id] || 0) / 20));
        while (pile.items.length > n) this.scatter(pile.items.pop());
        pile.set(n);
      }
      else pile.set(sim.stock(key));
      void b;
    }

    this.flyCash(dt);
    if (this.riding !== sim.extras.riding) { this.riding = sim.extras.riding; this.syncStatus(); }
    if (this.bike) this.bike.visible = this.riding;
    if (this.drone) {
      const d = sim.extras.drone;
      this.drone.o.visible = sim.active(-10) && !!d;
      if (d) {
        this.drone.o.position.set(d.x, this.drone.y + d.y, d.z);
        this.drone.log.visible = d.carry;
      }
    }

    // Trucks along their paths with the load on the bed.
    for (const [id, q] of sim.trucks) {
      const b = this.world.buildings.get(id);
      let list = this.trucks.get(id);
      if (!list) { list = new Map(); this.trucks.set(id, list); }
      const alive = new Set(q);
      for (const [t, v] of list) if (!alive.has(t)) { this.scene3.remove(v.obj); list.delete(t); }
      for (const t of q) {
        let v = list.get(t);
        if (!v) {
          const obj = this.props.make(TRUCKS[t.model % TRUCKS.length]) || new THREE.Group();
          this.scene3.add(obj);
          const bed = new THREE.Group();
          bed.position.set(0, 1.0, 1.2);
          obj.add(bed);
          v = { obj, pile: new Pile(bed, () => this.props.item(b.type), { cols: 2, rows: 3, dx: 0.6, dz: 0.7, dy: STEP_Y[b.type] }) };
          list.set(t, v);
        }
        const at = t.phase === 'out' ? pathAt(b.pathOut, t.d) : pathAt(b.pathIn, t.d);
        v.obj.position.set(at.x, 0, at.z);
        v.obj.rotation.y = at.dir + Math.PI;
        v.pile.set(t.load);
      }
    }

    // Player pose: chop swing with the axe out while chopping.
    if (this.tool) this.tool.visible = sim.chopping;
  }
}
