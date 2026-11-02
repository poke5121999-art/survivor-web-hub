// Draws the sim: facilities on their cells, one rigged cat per cat, and keeps them in step with Game.state and the cat
// routine (js/sim/cats.js). A cat stands on its facility's "d" node (WorkPlaceInfo body point) facing the way that node
// faces, and plays the facility's Work.workAnim; walking plays "run", handing over "put".
import * as THREE from 'three';
import { cellPos, CELL } from './forest.js';
import { Rig } from './anim.js';
import { texture } from './shaders.js';

const v3 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export class GameView {
  constructor({ game, scene, forest, placeLib, catLib, animLib, lampLib, catTypes, texBase }) {
    Object.assign(this, { game, scene, forest, placeLib, catLib, animLib, lampLib, catTypes, texBase });
    this.works = new Map();   // work id -> { obj, anchor }
    this.cats = new Map();    // cat id -> { obj, rig, state }
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pending = new Set();
  }

  rebuildForest() {
    const g = this.game;
    const baseTile = new Map(g.state.works.map(w => [`${w.pos[0]},${w.pos[1]}`, g.work.get(w.a).baseTile]));
    this.forest.build(g.field(), (x, y) => baseTile.get(`${x},${y}`) ?? null);
  }

  async ensureWork(w) {
    if (this.works.has(w.id) || this.pending.has(w.id)) return;
    this.pending.add(w.id);
    const lib = await this.placeLib(w.a);
    this.pending.delete(w.id);
    const obj = lib ? lib.instantiate(`places/place${w.a}`) : new THREE.Group();
    obj.userData.workId = w.id;
    cellPos(w.pos[0], w.pos[1], obj.position);
    this.root.add(obj);
    const anchor = obj.getObjectByName('d') || obj;
    const entry = { obj, anchor, w, sign: null, lv: 0 };
    this.decorate(entry);
    this.works.set(w.id, entry);
    obj.scale.setScalar(0.01);
    obj.userData.pop = 0;
  }

  // Level sign on the facility's "d_sign" node (prep stations carry the cloth flag sign1_1, the others the wooden
  // plaque sign2_1, as in the video) and a lantern on the stool ("handLight/p") when Work.haveLamp.
  decorate(e) {
    const map = this.forest.map;
    const a = this.game.work.get(e.w.a);
    const ds = e.obj.getObjectByName('d_sign');
    if (ds && (a.type === 1 || a.type === 2 || a.type === 3)) {
      const key = map.keys().find(k => map.scene.nodes[map.roots.get(k).node].n === (a.type === 2 ? 'sign1_1' : 'sign2_1'));
      if (key) {
        const sign = map.instantiate(key);
        ds.add(sign);
        const t = sign.getObjectByName('text_lv');
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const tex = new THREE.CanvasTexture(c);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        plane.renderOrder = 10;
        (t || sign).add(plane);
        e.sign = { c, tex, flag: a.type === 2 };
      }
    }
    const p = e.obj.getObjectByName('handLight');
    if (p && a.haveLamp) {
      // art/lamp (tools/export_prefabs.py lamp lamp/lamp0): the jar lantern sprite of Lamp.json row 0.
      const lib = this.lampLib;
      if (lib && lib.roots.has('lamp/lamp0')) (p.getObjectByName('p') || p).add(lib.instantiate('lamp/lamp0'));
    }
  }

  drawLevel(e) {
    if (!e.sign || e.lv === e.w.lv) return;
    e.lv = e.w.lv;
    const g = e.sign.c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#6b4f3f';
    g.textAlign = 'center';
    if (e.sign.flag) {
      // The cloth already prints "LV"; only the number goes under it.
      g.font = `bold ${e.w.lv > 99 ? 40 : 54}px sans-serif`;
      g.fillText(String(e.w.lv), 64, 104);
    } else {
      g.font = 'bold 60px sans-serif';
      g.fillText(String(e.w.lv), 64, 84);
    }
    e.sign.tex.needsUpdate = true;
  }

  ensureCat(cat) {
    if (this.cats.has(cat.id)) return this.cats.get(cat.id);
    const obj = this.catLib.instantiate(this.catLib.keys()[0]);
    const info = this.catTypes[cat.type];
    if (info) {
      // Body submesh (OutlineUnit, fragMode 0) takes this cat's fur; the eye submesh and the outline keep theirs.
      const tex = texture(this.texBase, info.tex).tex;
      obj.traverse(o => {
        const u = o.isSkinnedMesh && o.material.uniforms;
        if (!u || !u.map || !u.fragMode || u.fragMode.value !== 0) return;
        const m = o.material.clone();
        m.uniforms = { ...u, map: { value: tex } };
        o.material = m;
      });
    }
    const rig = new Rig(this.animLib, obj);
    this.root.add(obj);
    const e = { obj, rig, anim: null };
    this.cats.set(cat.id, e);
    return e;
  }

  play(e, state) {
    if (e.anim === state) return;
    e.anim = state;
    e.rig.play(e.rig.has(state) ? state : 'idle0');
  }

  workAnim(w) {
    const a = this.game.work.get(w.a);
    return a.workAnim && a.workAnim !== '`' ? a.workAnim : 'idle0';
  }

  update(dt) {
    const g = this.game;
    for (const w of g.state.works) this.ensureWork(w);
    for (const [id, e] of this.works) {
      if (!g.state.works.some(w => w.id === id)) { this.root.remove(e.obj); this.works.delete(id); continue; }
      this.drawLevel(e);
      if (e.drag) e.obj.position.copy(e.drag);
      else cellPos(e.w.pos[0], e.w.pos[1], e.obj.position);
      if (e.obj.userData.pop < 1) {
        e.obj.userData.pop = Math.min(1, e.obj.userData.pop + dt * 3);
        const k = e.obj.userData.pop;
        e.obj.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.15 * (1 - k) + (k - 1) * 0.0001);
        if (k >= 1) e.obj.scale.setScalar(1);
      }
    }
    for (const cat of g.state.cats) {
      const e = this.ensureCat(cat);
      const c = g.ai.cats.get(cat.id);
      const home = this.works.get(cat.work);
      if (!c || !home) { e.obj.visible = false; continue; }
      e.obj.visible = true;
      if (c.phase === 'walk') {
        cellPos(c.x, c.y, e.obj.position);
        e.obj.position.y = 0;
        const dx = (c.to[0] - c.from[0]), dz = -(c.to[1] - c.from[1]);
        // The cat rig faces -z (like My Mini Mart's rigs), so heading = atan2 + pi.
        if (dx || dz) e.obj.rotation.set(0, Math.atan2(dx, dz) + Math.PI, 0);
        this.play(e, 'run');
      } else {
        const at = c.phase === 'rest' ? this.works.get(c.rest) : c.phase === 'put' ? this.cookOf(home.w) : home;
        const tgt = at || home;
        tgt.anchor.getWorldPosition(v3);
        e.obj.position.copy(v3);
        tgt.anchor.getWorldQuaternion(q1);
        e.obj.quaternion.copy(q1);
        if (c.phase === 'work') this.play(e, this.workAnim(home.w));
        else if (c.phase === 'put') this.play(e, 'put');
        else if (c.phase === 'rest') this.play(e, at ? this.workAnim(at.w) : 'idle0');
        else if (c.phase === 'reload') {
          const r = g.work.get(home.w.a).reloadAnim;
          this.play(e, r && r !== '`' ? r : 'idle0');
        }
      }
      e.rig.update(dt);
    }
  }

  cookOf(w) {
    const cook = this.game.state.works.find(o => o.a === [0, 7, 17][w.line]);
    return cook && this.works.get(cook.id);
  }

  // Facility under a screen point (ray against each facility's cell square).
  pick(ground) {
    const x = Math.round(ground.x / CELL), y = Math.round(-ground.z / CELL);
    return this.game.workAt(x, y);
  }
}
