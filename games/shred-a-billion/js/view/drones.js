// Drone fleet view: one clone of the original Drone prefab (art/drone) per sim drone, placed from game.drones.
import { V } from '../rev.js';
// Rotor blur discs and the dig vortex are hidden (the original swaps them by speed); rotors spin while flying,
// cargo bundles (Cargo_0..5/Bundle) fill with the load.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { buildMaterial } from './scenegraph.js';

export class DroneView {
  constructor(scene) { this.scene = scene; this.views = []; }
  async load(base) {
    const meta = await fetch(base + 'drone.json' + V).then(r => r.json());
    const mats = meta.materials.map(m => buildMaterial(base, m));
    const g = await new GLTFLoader().loadAsync(base + 'drone.glb' + V);
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const i = g.parser.json.materials.findIndex(x => x.name === o.material.name);
      if (i >= 0) o.material = mats[i];
      if (/^(Blur_|Vortex)/.test(o.name) || (o.userData && o.userData.rendererEnabled === false)) o.visible = false;
    });
    this.proto = g.scene;
    return this;
  }
  make() {
    const r = this.proto.clone(true);
    const v = { root: r, rotors: [], cargo: [] };
    r.traverse(o => { if (/^Rotor_/.test(o.name)) v.rotors.push(o); const m = /^Cargo_(\d)$/.exec(o.name); if (m) v.cargo[+m[1]] = o.children.find(c => c.name === 'Bundle'); });
    this.scene.add(r);
    return v;
  }
  update(dt, game) {
    const ds = game.drones;
    while (this.views.length < ds.length) this.views.push(this.make());
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i], d = ds[i];
      v.root.visible = !!d;
      if (!d) continue;
      v.root.position.set(d.pos[0], d.pos[1], d.pos[2]);
      v.root.rotation.y = d.heading || 0;
      const flying = d.state !== 'docked' && d.state !== 'recharge';
      for (const r of v.rotors) r.rotation.y += dt * (flying ? 60 : 0);
      const tot = d.cargo ? d.cargo.reduce((a, b) => a + b, 0) : 0;
      const fill = tot > 0 ? Math.max(1, Math.ceil(Math.min(1, (d.value || 0) / Math.max(1, game.droneCapacity ? game.droneCapacity() : 1)) * 6)) : 0;
      v.cargo.forEach((b, k) => { if (b) b.visible = k < fill; });
    }
  }
}
