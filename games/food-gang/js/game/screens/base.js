// Screen = one exported Unity scene (menu or popup, PopupSceneManager.DisplayPopupScene) driven by a JS port of its
// controller. Buttons are routed by the persistent onClick method name the scene carries (MenuController.Play,
// Shop.Close...), so the wiring follows the original prefab instead of node paths.
import { localize, T } from '../text.js';

export const wait = (engine, s) => new Promise((res) => { const end = engine.realTime + s; const f = () => { if (engine.realTime >= end) res(); else setTimeout(f, 16); }; f(); });

// "1d 4h", "3h12m", "4m05s" like the game's timers (info.timer.* are not localized keys; the game formats digits)
export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

export class Screen {
  constructor(app, sceneName, layer = 0) {
    this.app = app;
    this.engine = app.engine;
    this.sceneName = sceneName;
    this.layer = layer;
    this.handlers = {};
    this.insts = new Set();
    this.hooks = [];
    this.closed = false;
  }

  async open() {
    const { engine, app } = this;
    const inst = this.inst = await engine.loadScene(this.sceneName, this.layer);
    this.insts.add(inst);
    this.root = inst.root;
    // a popup scene's own camera and post volume must not replace the camera below it
    if (this.layer > 0) for (const n of inst.nodes) { const c = n.get('Camera'); if (c) c.enabled = false; }
    localize(this.root);
    app.screens.push(this);
    await this.init();
    return this;
  }

  async init() {}

  // ---- references from the scene's MonoBehaviour fields ("#12", "#12.0")
  ref(r, inst = this.inst) { return r ? inst.ref(r) : null; }
  node(r, inst = this.inst) { const x = this.ref(r, inst); return x && x.node ? x.node : x; }
  text(r, s, inst) { const t = typeof r === 'string' && !r.startsWith('#') ? this.find(r) : this.ref(r, inst); const c = t && (t.setText ? t : t.get && t.get('Text')); if (c) c.setText(s); return c; }
  find(path, from = this.root) { return from.find(path) || from.findDeep(path); }
  script(name) { for (const n of this.inst.nodes) { const c = n.script(name); if (c) return c; } return null; }
  fields(name) { const c = this.script(name); return c ? c.fields : {}; }
  setActive(r, on) { const n = typeof r === 'string' && !r.startsWith('#') ? this.find(r) : this.node(r); if (n) n.setActive(!!on); return n; }
  setImage(r, spriteKey, inst) { const x = this.ref(r, inst); const img = x && (x.type === 'Image' ? x : x.get && x.get('Image')); if (img && spriteKey) { img.setSprite(spriteKey.startsWith('sprite:') ? spriteKey : 'sprite:' + spriteKey); img.enabled = true; } return img; }
  onState(state, on) { if (!state) return; const a = this.node(state.on), b = this.node(state.off); if (a) a.setActive(!!on); if (b) b.setActive(!on); }

  on(method, fn) { this.handlers[method] = fn; return this; }

  // a button without a persistent call (cells, clones): route its clicks by node
  onNode(node, fn) { if (!this.nodeHandlers) this.nodeHandlers = new Map(); if (node) this.nodeHandlers.set(node, fn); return this; }

  // copy of a node subtree of this scene as a new instance under `parent` (extra controls built from the scene's own
  // buttons); "#i" references inside the subtree are renumbered, references outside it are dropped
  clone(node, parent = node.parent) {
    const data = this.inst.data, idx = this.inst.nodes.indexOf(node);
    if (idx < 0) return null;
    const ids = [idx];
    for (let i = 0; i < ids.length; i++) data.nodes.forEach((nd, j) => { if (nd.parent === ids[i]) ids.push(j); });
    const map = new Map(ids.map((o, n) => [o, n]));
    const fix = (v) => {
      if (typeof v === 'string' && v[0] === '#') { const m = /^#(\d+)(\..*)?$/.exec(v); if (!m) return v; const n = map.get(+m[1]); return n === undefined ? null : '#' + n + (m[2] || ''); }
      if (Array.isArray(v)) return v.map(fix);
      if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = fix(v[k]); return o; }
      return v;
    };
    const nodes = ids.map((o) => { const nd = fix(JSON.parse(JSON.stringify(data.nodes[o]))); nd.parent = o === idx ? -1 : map.get(data.nodes[o].parent); return nd; });
    const inst = this.engine.spawn({ name: node.name + ' (clone)', kind: 'prefab', nodes, roots: [0] }, parent, this.layer);
    this.adopt(inst);
    localize(inst.root);
    return inst;
  }

  // prefab instances spawned under this screen (cells) route their buttons here too
  adopt(inst) { if (inst) { this.insts.add(inst); localize(inst.root); } return inst; }

  ownsNode(n) { return !!n && this.insts.has(n.scene); }

  click(b) {
    const nh = this.nodeHandlers && this.nodeHandlers.get(b.node);
    if (nh) { nh(b); return true; }
    const calls = b.onClickResolved || [];
    for (const o of calls) {
      const h = this.handlers[o.method];
      if (h) { h(o, b); return true; }
    }
    if (this.handlers['*']) return this.handlers['*'](b) !== false;
    return false;
  }

  hook(kind, fn) { this.engine.hooks[kind].push(fn); this.hooks.push([kind, fn]); }

  close() {
    if (this.closed) return;
    this.closed = true;
    const { engine, app } = this;
    for (const [k, f] of this.hooks) engine.hooks[k] = engine.hooks[k].filter((x) => x !== f);
    for (const i of this.insts) for (const r of i.roots) if (!r.destroyed) r.destroy();
    app.screens = app.screens.filter((s) => s !== this);
    if (this.resolve) this.resolve(this.result);
    this.onClose && this.onClose();
  }

  // resolves when the screen closes, with this.result
  done() { return this.closed ? Promise.resolve(this.result) : new Promise((r) => { const prev = this.resolve; this.resolve = (v) => { if (prev) prev(v); r(v); }; }); }

  // screen-pixel centre of a node (CSS px of the page) for tests
  btnPos(n) {
    if (!n || !n.activeInHierarchy || !n.r) return null;
    const e = this.engine, k = e.canvas.getBoundingClientRect(), q = e.ui.screenRect(n);
    return [Math.round(k.left + (q[0] + q[2] / 2) * k.width / e.canvas.width), Math.round(k.top + (e.canvas.height - q[1] - q[3] / 2) * k.height / e.canvas.height)];
  }

  // every active button of this screen with its method name and page position (test bridge / debug)
  buttons() {
    const out = [];
    for (const b of this.engine.buttons) {
      if (!this.ownsNode(b.node) || !b.node.activeInHierarchy || b.node.destroyed) continue;
      const pos = this.btnPos(b.node);
      if (!pos) continue;
      out.push({ path: b.node.path ? b.node.path(this.root) : b.node.name, name: b.node.name, method: (b.onClickResolved || []).map((o) => o.method).join(','), pos, interactable: b.interactable !== false });
    }
    return out;
  }
}

export { T };
