// The 3D saga map (ENVIRONMENT_City, rules/census-citymap.md), exported by
// `export_store.py level1 citymap --root CORE/GameManager/ENVIRONMENT_City`. Every store scene carries it at x = -1000;
// GameManager.GoIntoMapMode turns it on, swaps the player for the van (vanCarObj) parked on the mart's Mart3DController
// node, and the main vcam follows the van. Up/down on the map card calls GoToMart3D: the van shrinks to 0 in 0.1 s,
// jumps to the next mart and pops back (DOScale x1.2 OutBack) with its smoke.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { hideOtherVisuals, seasonVisuals } from './game.js';

const OFFSET = new THREE.Vector3(-1000, 0, 0);
const HIDE = ['DebugSphere', 'MatRVSpawnPoint', 'MeshDisablerController', '__Funflare.Game.Scripts.SagaMapFirstTutorial'];
const v3 = new THREE.Vector3();

export class CityMap {
  // load(): Promise<[scene.json, gltf]>; van: the player's vanCarObj in the store world; fx: view.fx (smoke, sparkles).
  constructor({ scene3, texBase, load, van, fx, storeRoot }) {
    Object.assign(this, { scene3, texBase, loadFiles: load, van, fx, storeRoot });
    this.ready = false;
    this.open = false;
    this.target = new THREE.Vector3();
  }

  async ensure() {
    if (this.loading) return this.loading;
    this.loading = this.loadFiles().then(([scene, gltf]) => {
      const world = buildWorld(scene, gltf, { texBase: this.texBase });
      world.root.position.copy(OFFSET);
      world.root.visible = false;
      this.world = world;
      world.objects.forEach(o => {
        const k = o.userData.node.k || {};
        if (HIDE.some(c => k[c]) || /^AdsBreakDropPoints/.test(o.name)) o.visible = false;
        seasonVisuals(k, n => world.objects[n]);
        hideOtherVisuals(o, k);
        // SagaMapBigMartVisualOverride: the Asian decorations on Mart02 belong to the Big Mart that can replace the Cafe
        // Mart; without Big Marts the default objects stay.
        const big = k['__Funflare.Game.Scripts.SagaMapBigMartVisualOverride'];
        if (big) (big.bigMartObjects || []).forEach(r => { if (r && r.n != null) world.objects[r.n].visible = false; });
      });
      // Mart3DController nodes in Mart01..Mart14 order = RC_MartOrder = data/marts.json order.
      this.marts = [];
      world.objects.forEach(o => {
        const c = (o.userData.node.k || {}).Mart3DController;
        if (!c) return;
        const body = c.meshRenderer ? world.objects[c.meshRenderer.n] : null;
        this.marts.push({ node: o, body, meshes: body ? body.children.filter(m => m.isMesh && !m.userData.node) : [], locked: null });
      });
      this.black = new THREE.MeshBasicMaterial({ color: 0x000000 });
      this.scene3.add(world.root);
      this.ready = true;
    });
    return this.loading;
  }

  // The map has buildings for the 14 marts of the order only; a seasonal mart's card leaves the van where it is.
  martPos(i, out = v3) {
    const m = this.marts[i] || this.marts[this.last || 0];
    return m.node.getWorldPosition(out);
  }

  // rows: martRows(); index: the mart the card shows.
  async show(rows, index) {
    this.open = true;
    this.rows = rows;
    await this.ensure();
    if (!this.open) return;
    // Mart3DController.OnEnable: a mart not unlocked yet is tinted black.
    this.marts.forEach((m, i) => {
      const locked = !(rows[i] && rows[i].visited);
      if (m.locked === locked) return;
      m.locked = locked;
      for (const mesh of m.meshes) {
        if (!mesh.userData.mat) mesh.userData.mat = mesh.material;
        if (mesh.material !== mesh.userData.mat || locked) mesh.material = locked && mesh.userData.mat.side !== THREE.BackSide ? this.black : mesh.userData.mat;
      }
    });
    this.world.root.visible = true;
    this.storeRoot.visible = false;
    if (!this.vanHome) this.vanHome = { parent: this.van.parent, pos: this.van.position.clone(), quat: this.van.quaternion.clone(), scale: this.van.scale.clone(),
      // GoIntoMapMode sets the van's local scale to 1.5 on the saga map (2.4 on the meta map and in the prefab).
      worldScale: this.van.getWorldScale(new THREE.Vector3()).multiplyScalar(1.5 / this.van.scale.x) };
    this.world.root.add(this.van);
    this.van.visible = true;
    this.van.quaternion.identity();
    this.van.scale.copy(this.vanHome.worldScale);
    this.at = index;
    this.place(index);
  }

  place(i) {
    if (this.marts[i]) this.last = i;
    this.martPos(i, v3);
    this.van.position.copy(this.world.root.worldToLocal(v3.clone()));
    this.target.copy(v3);
  }

  // GoToMart3D: shrink 0.1 s, move, pop to 1.2x OutBack then settle, smoke puff.
  goTo(i) {
    if (!this.ready || i === this.at) return;
    if (!this.marts[i] || !this.marts[this.at]) { this.at = i; this.place(i); return; }
    this.at = i;
    this.anim = { t: 0, to: i, moved: false };
  }

  hide() {
    this.open = false;
    if (!this.ready) return;
    if (this.fx) this.marts.forEach((m, i) => this.fx.sparkle(`city:${i}`, null, false));
    this.world.root.visible = false;
    this.storeRoot.visible = true;
    if (this.vanHome) {
      const h = this.vanHome;
      h.parent.add(this.van);
      this.van.position.copy(h.pos);
      this.van.quaternion.copy(h.quat);
      this.van.scale.copy(h.scale);
      this.van.visible = false;
    }
  }

  update(dt, rows) {
    if (!this.open || !this.ready) return;
    if (rows) this.rows = rows;
    const a = this.anim, base = this.vanHome.worldScale;
    if (a) {
      a.t += dt;
      if (a.t < 0.1) this.van.scale.copy(base).multiplyScalar(1 - a.t / 0.1);
      else {
        if (!a.moved) {
          a.moved = true;
          this.place(a.to);
          if (this.fx) this.fx.puff('small', this.target.clone());
        }
        const t = a.t - 0.1;
        // OutBack to 1.2 over 0.3 s, then back to 1 over 0.15 s.
        const k = t < 0.3 ? outBack(t / 0.3) * 1.2 : 1.2 - 0.2 * Math.min(1, (t - 0.3) / 0.15);
        this.van.scale.copy(base).multiplyScalar(k);
        if (t >= 0.45) this.anim = null;
      }
    }
    // Mart3DController.particleObj sparkles while the mart's idle income can be collected.
    if (this.fx && this.rows) this.marts.forEach((m, i) => this.fx.sparkle(`city:${i}`, this.martPos(i, new THREE.Vector3()), !!(this.rows[i] && this.rows[i].ready)));
  }
}

function outBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
