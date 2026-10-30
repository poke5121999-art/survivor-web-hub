// Scene graph: GameObject + Transform/RectTransform in one Node, components attached from exported JSON.
import { mat4, trs, mul, eulerToQuat, quatToEuler, identity } from './math.js';

let nextUid = 1;

export class Node {
  constructor(name = 'GameObject') {
    this.uid = nextUid++;
    this.name = name;
    this.parent = null;
    this.children = [];
    this.activeSelf = true;
    this.layer = 0;
    this.tag = '';
    this.lp = [0, 0, 0];
    this.lq = [0, 0, 0, 1];
    this.le = [0, 0, 0];   // euler kept for animation curves (Unity animates m_LocalEulerAngles)
    this.ls = [1, 1, 1];
    this.rect = null;      // RectTransform: {amin, amax, pivot, size, pos}; layout writes .r (computed rect)
    this.comps = [];
    this.world = mat4();
    this.local = mat4();
    this.scene = null;     // SceneInstance it came from
    this.engine = null;
    this.uiAlpha = 1;
  }

  get activeInHierarchy() {
    for (let n = this; n; n = n.parent) if (!n.activeSelf) return false;
    return true;
  }

  setActive(v) {
    v = !!v;
    if (v === this.activeSelf) return;
    this.activeSelf = v;
    if (this.engine) this.engine.onActiveChanged(this, v);
  }

  setEuler(x, y, z) { this.le[0] = x; this.le[1] = y; this.le[2] = z; eulerToQuat(x, y, z, this.lq); }

  setParent(p, keepLocal = true) {
    if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); }
    this.parent = p;
    if (p) p.children.push(this);
  }

  get(type) { for (const c of this.comps) if (c.type === type) return c; return null; }
  getAll(type) { return this.comps.filter((c) => c.type === type); }
  script(name) { for (const c of this.comps) if (c.type === 'MonoBehaviour' && c.script === name) return c; return null; }

  inChildren(type, includeInactive = true) {
    const out = [];
    const walk = (n) => { if (!includeInactive && !n.activeSelf) return; for (const c of n.comps) if (c.type === type) out.push(c); for (const ch of n.children) walk(ch); };
    walk(this);
    return out;
  }

  find(path) {
    if (!path) return this;
    let n = this;
    for (const part of path.split('/')) {
      n = n.children.find((c) => c.name === part);
      if (!n) return null;
    }
    return n;
  }

  findDeep(name) {
    if (this.name === name) return this;
    for (const c of this.children) { const r = c.findDeep(name); if (r) return r; }
    return null;
  }

  path(root) {
    const parts = [];
    for (let n = this; n && n !== root; n = n.parent) parts.push(n.name);
    return parts.reverse().join('/');
  }

  updateWorld(parentWorld, dirty) {
    trs(this.local, this.lp, this.lq, this.ls);
    if (parentWorld) mul(this.world, parentWorld, this.local); else this.world.set(this.local);
    for (const c of this.children) c.updateWorld(this.world, dirty);
  }

  worldPos() { return [this.world[12], this.world[13], this.world[14]]; }

  destroy() {
    if (this.engine) this.engine.destroyNode(this);
  }
}

// Exported node data -> live Nodes. refs "#n" and "#n.c" resolve within one instance.
export class SceneInstance {
  constructor(data, engine) {
    this.data = data;
    this.name = data.name;
    this.nodes = [];
    this.roots = [];
    this.engine = engine;
  }

  ref(r) {
    if (typeof r !== 'string' || r[0] !== '#') return r;
    const dot = r.indexOf('.');
    if (dot < 0) return this.nodes[+r.slice(1)] || null;
    const n = this.nodes[+r.slice(1, dot)];
    return n ? n.comps[+r.slice(dot + 1)] || null : null;
  }
}

export function buildNodes(data, engine) {
  const inst = new SceneInstance(data, engine);
  for (const nd of data.nodes) {
    const n = new Node(nd.name);
    n.activeSelf = !!nd.active;
    n.layer = nd.layer || 0;
    n.tag = nd.tag || '';
    n.lp = nd.tf.p.slice();
    n.ls = nd.tf.s.slice();
    if (typeof nd.tf.r === 'number') n.setEuler(0, 0, nd.tf.r);
    else { n.lq = nd.tf.r.slice(); quatToEuler(n.lq, n.le); }
    if (nd.rect) n.rect = { amin: nd.rect.amin.slice(), amax: nd.rect.amax.slice(), pivot: nd.rect.pivot.slice(), size: nd.rect.size.slice(), pos: nd.rect.pos.slice() };
    n.scene = inst;
    n.engine = engine;
    inst.nodes.push(n);
  }
  data.nodes.forEach((nd, i) => {
    const n = inst.nodes[i];
    if (nd.parent >= 0) { n.parent = inst.nodes[nd.parent]; n.parent.children.push(n); } else inst.roots.push(n);
  });
  return inst;
}

export { identity };
