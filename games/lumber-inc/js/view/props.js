// Item and vehicle prefabs from art/props (logs, peeled logs, square timber, cash, trucks): one template per prefab
// root, cloned on demand with its root transform reset (the exporter lays roots out side by side).
import * as THREE from 'three';

export class Props {
  constructor(view, config) {
    this.templates = new Map();
    view.root.children.forEach(o => {
      o.position.set(0, 0, 0);
      this.templates.set(o.name, o);
    });
    // ItemConf: item type -> prefab names (one per tier, "A|B|C").
    this.prefabs = new Map(config.ItemConf.filter(r => r.Prefab).map(r => [r.Id, r.Prefab.split('|')]));
  }

  make(name) {
    const t = this.templates.get(name);
    if (!t) return null;
    const o = t.clone(true);
    o.visible = true;
    return o;
  }

  item(type, tier = 0) {
    const names = this.prefabs.get(type);
    return names ? this.make(names[Math.min(tier, names.length - 1)]) : null;
  }
}

// A pile of identical items laid out in a grid (cols x rows per layer, layers upward), as frames and truck beds show
// them. Keeps meshes and only adds/removes the top ones when the count changes.
export class Pile {
  constructor(parent, make, { cols = 3, rows = 3, dx = 0.6, dz = 0.6, dy = 0.3, yaw = 0 } = {}) {
    this.group = new THREE.Group();
    this.group.rotation.y = yaw;
    parent.add(this.group);
    Object.assign(this, { make, cols, rows, dx, dz, dy, items: [] });
  }

  slot(i) {
    const layer = Math.floor(i / (this.cols * this.rows)), k = i % (this.cols * this.rows);
    const c = k % this.cols, r = Math.floor(k / this.cols);
    return new THREE.Vector3((c - (this.cols - 1) / 2) * this.dx, layer * this.dy, (r - (this.rows - 1) / 2) * this.dz);
  }

  set(n) {
    while (this.items.length < n) {
      const o = this.make();
      if (!o) break;
      o.position.copy(this.slot(this.items.length));
      this.group.add(o);
      this.items.push(o);
    }
    while (this.items.length > n) this.group.remove(this.items.pop());
  }
}
