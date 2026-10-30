// AnimationClip sampling (Unity Hermite keys), property bindings, Animator state machines and legacy Animation.
import { eulerToQuat, lerp } from './math.js';
import { stats } from './assets.js';

// ---------------------------------------------------------------------------------------------------------- curves

function prepKeys(keys) {
  for (const k of keys) {
    if (k[2] === 'inf' || k[2] === '-inf') k[2] = Infinity;
    if (k[3] === 'inf' || k[3] === '-inf') k[3] = Infinity;
  }
  return keys;
}

export function evalCurve(keys, t) {
  const n = keys.length;
  if (!n) return 0;
  if (n === 1 || t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m][0] <= t) lo = m; else hi = m; }
  const a = keys[lo], b = keys[hi];
  const dt = b[0] - a[0];
  if (dt <= 0) return b[1];
  const m0 = a[3], m1 = b[2];
  if (!Number.isFinite(m0) || !Number.isFinite(m1)) return a[1];
  const s = (t - a[0]) / dt, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * m0 * dt + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * m1 * dt;
}

export function prepClip(clip) {
  if (clip._prep) return clip;
  for (const c of clip.curves) prepKeys(c.keys);
  clip._prep = true;
  return clip;
}

function stepValue(keys, t) {
  let v = keys[0] ? keys[0][1] : null;
  for (const k of keys) { if (k[0] <= t + 1e-6) v = k[1]; else break; }
  return v;
}

// ---------------------------------------------------------------------------------------------------------- bindings

// A binding reads/writes one animated property on one target. kind: 'f' float, 'o' object reference.
class Binding {
  constructor(node, path, prop, cls, kind) {
    this.node = node; this.path = path; this.prop = prop; this.cls = cls; this.kind = kind;
    this.comp = null;
    this.key = path + '|' + (cls || '') + '|' + prop;
    this.setup();
    this.def = this.get();
  }

  setup() {
    const n = this.node, p = this.prop, cls = this.cls || '';
    if (!n) { this.get = () => 0; this.set = () => {}; return; }
    if (cls === 'Transform') {
      const ax = 'xyzw'.indexOf(p[2]);
      const arr = p[0] === 'p' ? n.lp : p[0] === 's' ? n.ls : p[0] === 'r' ? n.le : n.lq;
      this.get = () => arr[ax];
      this.set = p[0] === 'r' ? (v) => { arr[ax] = v; n._eulerDirty = true; } : (v) => { arr[ax] = v; };
      return;
    }
    if (cls === 'GameObject') {
      this.get = () => (n.activeSelf ? 1 : 0);
      this.set = (v) => n.setActive(v > 0.5);
      return;
    }
    if (cls === 'RectTransform') {
      const m = /^m_(AnchoredPosition|SizeDelta|AnchorMin|AnchorMax|Pivot|LocalPosition|LocalScale)\.([xyz])$/.exec(p);
      if (m && n.rect) {
        const ax = 'xyz'.indexOf(m[2]);
        const arr = { AnchoredPosition: n.rect.pos, SizeDelta: n.rect.size, AnchorMin: n.rect.amin, AnchorMax: n.rect.amax, Pivot: n.rect.pivot, LocalPosition: n.lp, LocalScale: n.ls }[m[1]];
        this.get = () => arr[ax];
        this.set = (v) => { arr[ax] = v; };
        return;
      }
    }
    const typeName = cls.startsWith('MonoBehaviour:') ? null : cls;
    // TMP text curves arrive as MonoBehaviour:<TMP class>; the exported component type is Text
    const comp = typeName ? n.get(typeName === 'ParticleSystemRenderer' ? 'ParticleSystem' : typeName)
      : n.comps.find((c) => c.type === 'MonoBehaviour' && c.script === cls.slice(14)) || (/Text/.test(cls) ? n.get('Text') : null) || null;
    this.comp = comp;
    if (!comp) { stats.unboundCurves = (stats.unboundCurves || 0) + 1; this.get = () => 0; this.set = () => {}; return; }
    if (p === 'm_Enabled') { this.get = () => (comp.enabled ? 1 : 0); this.set = (v) => { comp.enabled = v > 0.5; }; return; }
    let m = /^(m_Color|m_fontColor|m_FaceColor)\.([rgba])$/.exec(p);
    if (m) {
      const ax = 'rgba'.indexOf(m[2]);
      this.get = () => comp.color[ax];
      this.set = (v) => { comp.color[ax] = v; comp.dirty = true; };
      return;
    }
    // AssetRipper leaves some sprite PPtr curves under a hashed name ("script_0x..."): on an Image / SpriteRenderer
    // an object curve can only be the sprite
    if (p === 'm_Sprite' || (this.kind === 'o' && comp.setSprite)) { this.get = () => comp.spriteRef; this.set = (v) => comp.setSprite(v); return; }
    if (p === 'm_Alpha') { this.get = () => comp.alpha; this.set = (v) => { comp.alpha = v; }; return; }
    if (p === 'm_SortingOrder') { this.get = () => comp.order; this.set = (v) => { comp.order = Math.round(v); }; return; }
    if (p === 'm_FillAmount') { this.get = () => comp.fillAmount; this.set = (v) => { comp.fillAmount = v; }; return; }
    m = /^m_Size\.([xy])$/.exec(p);
    if (m) { const ax = m[1] === 'x' ? 0 : 1; this.get = () => comp.size[ax]; this.set = (v) => { comp.size[ax] = v; }; return; }
    if (p === 'm_FlipX' || p === 'm_FlipY') { const ax = p === 'm_FlipX' ? 0 : 1; this.get = () => comp.flip[ax]; this.set = (v) => { comp.flip[ax] = v > 0.5 ? 1 : 0; }; return; }
    if (p === 'm_fontSize') { this.get = () => comp.size; this.set = (v) => { comp.size = v; comp.dirty = true; }; return; }
    if (comp.type === 'ParticleSystem') {
      this.get = () => (comp.runtime ? comp.runtime.getAnimProp(p) : 0);
      this.set = (v) => { if (comp.runtime) comp.runtime.setAnimProp(p, v); };
      return;
    }
    // game MonoBehaviour field or anything else: keep in comp.anim so scripts can read it
    comp.anim = comp.anim || {};
    const f = comp.fields || {};
    this.get = () => (p in comp.anim ? comp.anim[p] : typeof f[p] === 'number' ? f[p] : 0);
    this.set = (v) => { comp.anim[p] = v; if (comp.fields && typeof comp.fields[p] === 'number') comp.fields[p] = v; };
  }
}

class BindingSet {
  constructor(root) { this.root = root; this.map = new Map(); }

  get(path, prop, cls, kind) {
    const key = path + '|' + (cls || '') + '|' + prop;
    let b = this.map.get(key);
    if (!b) {
      const node = this.root.find(path);
      b = new Binding(node, path, prop, cls, kind);
      if (kind === 'f' && cls === 'Transform' && prop[0] === 'q') b.quat = true;
      this.map.set(key, b);
    }
    return b;
  }

  // per-clip list of [binding, curveKeys]
  forClip(clip) {
    if (!clip._bind) clip._bind = new WeakMap();
    let r = clip._bind.get(this);
    if (r) return r;
    prepClip(clip);
    r = { f: clip.curves.map((c) => [this.get(c.path, c.prop, c.cls || guessCls(c.prop), 'f'), c.keys]),
          o: (clip.pptr || []).map((c) => [this.get(c.path, c.prop, c.cls, 'o'), c.keys]) };
    clip._bind.set(this, r);
    return r;
  }
}

function guessCls(prop) {
  if (/^[prsq]\.[xyzw]$/.test(prop)) return 'Transform';
  if (prop === 'm_IsActive') return 'GameObject';
  return '';
}

function applyEulers(bset) {
  for (const b of bset.map.values()) {
    const n = b.node;
    if (n && n._eulerDirty) { eulerToQuat(n.le[0], n.le[1], n.le[2], n.lq); n._eulerDirty = false; }
  }
}

function clipTime(clip, t, loop) {
  const len = clip.len || 0;
  if (len <= 0) return 0;
  if (loop) { const r = t % len; return r < 0 ? r + len : r; }
  return Math.min(Math.max(t, 0), len);
}

function fireEvents(clip, t0, t1, loop, cb, node) {
  if (!clip.events || !cb || t1 <= t0) return;
  const len = clip.len || 0;
  for (const e of clip.events) {
    if (loop && len > 0) {
      const k0 = Math.floor((t0 - e.t) / len), k1 = Math.floor((t1 - e.t) / len);
      if (k1 > k0) cb(node, e, clip);
    } else if (e.t > t0 && e.t <= t1) cb(node, e, clip);
    else if (t0 === 0 && e.t === 0 && t1 > 0) cb(node, e, clip);
  }
}

// ---------------------------------------------------------------------------------------------------------- Animator

export class AnimatorRuntime {
  constructor(comp, node, assets, engine) {
    this.comp = comp; this.node = node; this.assets = assets; this.engine = engine;
    this.bset = new BindingSet(node);
    this.speed = comp.speed ?? 1;
    this.setController(comp.ctrl);
  }

  setController(ref) {
    let c = this.assets.controller(ref);
    this.over = null;
    if (c && c.base) { this.over = c.over; c = this.assets.controller(c.base); }
    this.ctrl = c;
    this.params = new Map();
    this.layers = [];
    if (!c) return;
    for (const p of c.params) this.params.set(p.name, { type: p.type, v: p.type === 'bool' || p.type === 'trigger' ? !!p.def : p.def });
    for (const L of c.layers) {
      const st = { def: L, weight: L.weight, cur: null, next: null, tt: 0, tdur: 0, binds: new Set() };
      for (const s of L.sm.states) for (const clip of this.stateClips(s)) for (const [b] of this.bset.forClip(clip).f) st.binds.add(b);
      this.layers.push(st);
      this.enter(st, L.sm.def, 0);
    }
    this.layers[0] && (this.layers[0].weight = 1);
    stats.animators++;
  }

  clip(key) {
    if (!key) return null;
    const k = this.over && this.over[key] ? this.over[key] : key;
    return this.assets.clip(k);
  }

  stateClips(s) {
    const out = [];
    const walk = (m) => { if (!m) return; if (typeof m === 'string') { const c = this.clip(m); if (c) out.push(c); } else m.children.forEach((ch) => walk(ch.motion)); };
    walk(s.motion);
    return out;
  }

  enter(st, idx, t) {
    const s = st.def.sm.states[idx];
    st.cur = s ? { idx, s, t: t || 0, prevT: 0 } : null;
  }

  // public API (Animator.SetBool/SetFloat/SetInteger/SetTrigger/ResetTrigger/Play/CrossFade)
  setBool(n, v) { const p = this.params.get(n); if (p) p.v = !!v; }
  setFloat(n, v) { const p = this.params.get(n); if (p) p.v = +v; }
  setInteger(n, v) { const p = this.params.get(n); if (p) p.v = v | 0; }
  setTrigger(n) { const p = this.params.get(n); if (p) p.v = true; }
  resetTrigger(n) { const p = this.params.get(n); if (p && p.type === 'trigger') p.v = false; }
  getBool(n) { return !!this.params.get(n)?.v; }
  getFloat(n) { return +this.params.get(n)?.v || 0; }
  setLayerWeight(i, w) { if (this.layers[i]) this.layers[i].weight = w; }
  layerIndex(name) { return this.layers.findIndex((l) => l.def.name === name); }

  play(name, layer = -1, normTime = 0) {
    const ls = layer >= 0 ? [this.layers[layer]] : this.layers;
    for (const st of ls) {
      if (!st) continue;
      const idx = st.def.sm.states.findIndex((s) => s.name === name);
      if (idx >= 0) { this.enter(st, idx, normTime * this.stateLen(st.def.sm.states[idx])); st.next = null; if (layer < 0) return; }
    }
  }

  crossFade(name, dur, layer = -1, fixed = false) {
    const ls = layer >= 0 ? [this.layers[layer]] : this.layers;
    for (const st of ls) {
      if (!st) continue;
      const idx = st.def.sm.states.findIndex((s) => s.name === name);
      if (idx >= 0) { this.startTrans(st, { to: idx, dur, fixed: fixed ? 1 : 0, offset: 0 }); if (layer < 0) return; }
    }
  }

  stateName(layer = 0) { const st = this.layers[layer]; return st && st.cur ? st.cur.s.name : null; }
  stateNormTime(layer = 0) { const st = this.layers[layer]; if (!st || !st.cur) return 0; const L = this.stateLen(st.cur.s); return L > 0 ? st.cur.t / L : 0; }

  stateLen(s) {
    const cs = this.stateClips(s);
    return cs.length ? cs[0].len || 0 : 0;
  }

  stateSpeed(s) {
    let sp = s.speed ?? 1;
    if (s.speedParam) sp *= this.getFloat(s.speedParam);
    return sp;
  }

  condOK(c) {
    const [mode, name, th] = c;
    const p = this.params.get(name);
    if (!p) return false;
    switch (mode) {
      case 1: return !!p.v;
      case 2: return !p.v;
      case 3: return p.v > th;
      case 4: return p.v < th;
      case 6: return p.v === th;
      case 7: return p.v !== th;
      default: return false;
    }
  }

  tryTrans(st, list, cur, isAny) {
    for (const tr of list) {
      if (tr.mute) continue;
      if (isAny && !tr.canSelf && cur && tr.to === cur.idx) continue;
      if (tr.hasExit && cur) {
        const L = this.stateLen(cur.s) || 1;   // an empty state counts as one second
        const n0 = cur.prevT / L, n1 = cur.t / L;
        const et = tr.exitTime;
        const ok = et < 1 ? (n1 - Math.floor(n1) >= et || Math.floor(n1 - et) > Math.floor(n0 - et)) : n1 >= et;
        if (!ok) continue;
      }
      if (!tr.cond.every((c) => this.condOK(c))) continue;
      for (const c of tr.cond) { const p = this.params.get(c[1]); if (p && p.type === 'trigger') p.v = false; }
      return tr;
    }
    return null;
  }

  startTrans(st, tr) {
    if (tr.to === 'exit') { this.enter(st, st.def.sm.def, 0); st.next = null; return; }
    const s = st.def.sm.states[tr.to];
    if (!s) return;
    const L = this.stateLen(s);
    const curL = st.cur ? this.stateLen(st.cur.s) : 0;
    const dur = tr.fixed ? tr.dur : tr.dur * curL;
    const start = (tr.offset || 0) * L;
    if (!(dur > 0) || !st.cur) { this.enter(st, tr.to, start); st.next = null; return; }
    st.next = { idx: tr.to, s, t: start, prevT: start };
    st.tt = 0; st.tdur = dur;
  }

  update(dt) {
    if (!this.ctrl || !this.comp.enabled) return;
    dt *= this.speed;
    const cb = this.engine && this.engine.onAnimEvent;
    for (const st of this.layers) {
      const cur = st.cur;
      if (!cur) continue;
      const adv = (x) => {
        x.prevT = x.t;
        x.t += dt * this.stateSpeed(x.s);
        for (const clip of this.stateClips(x.s)) fireEvents(clip, x.prevT, x.t, clip.loop, cb, this.node);
      };
      adv(cur);
      if (st.next) {
        adv(st.next);
        st.tt += dt;
        if (st.tt >= st.tdur) { st.cur = st.next; st.next = null; }
        else {
          // ordered interruption by any-state transitions only (enough for these controllers)
          const tr = this.tryTrans(st, st.def.sm.any, st.next, true);
          if (tr) this.startTrans(st, tr);
          continue;
        }
      }
      let tr = this.tryTrans(st, st.def.sm.any, st.cur, true);
      if (!tr) tr = this.tryTrans(st, st.cur.s.trans, st.cur, false);
      if (tr) this.startTrans(st, tr);
    }
    this.evaluate();
  }

  sampleState(x, out, weight) {
    const clips = this.stateClips(x.s);
    if (!clips.length) return false;
    const clip = clips[0];
    const t = clipTime(clip, x.t, clip.loop);
    const B = this.bset.forClip(clip);
    for (const [b, keys] of B.f) {
      const v = evalCurve(keys, t);
      const e = out.get(b);
      if (e) { e.v += (v - e.v) * weight; e.w += weight; } else out.set(b, { v, w: weight });
    }
    for (const [b, keys] of B.o) {
      if (weight < 0.5 && out.has(b)) continue;
      out.set(b, { v: stepValue(keys, t), w: weight, o: true });
    }
    return true;
  }

  evaluate() {
    const vals = new Map();
    for (let li = 0; li < this.layers.length; li++) {
      const st = this.layers[li];
      const w = li === 0 ? 1 : st.weight;
      if (!st.cur || w <= 0) continue;
      const lv = new Map();
      const tw = st.next ? Math.min(1, st.tt / st.tdur) : 0;
      const hadCur = this.sampleState(st.cur, lv, 1);
      let hadNext = false;
      if (st.next) {
        const nv = new Map();
        hadNext = this.sampleState(st.next, nv, 1);
        for (const [b, e] of nv) {
          const c = lv.get(b);
          if (e.o) { if (tw >= 0.5 || !c) lv.set(b, e); continue; }
          const base = c ? c.v : (st.cur.s.wd && hadCur ? b.def : cur(vals, b));
          lv.set(b, { v: base + (e.v - base) * tw, w: 1 });
        }
        if (hadNext && st.next.s.wd) for (const [b, c] of lv) if (!c.o && !nv.has(b)) c.v += (b.def - c.v) * tw;
      }
      const activeWD = (hadCur && st.cur.s.wd) || (hadNext && st.next.s.wd);
      if (activeWD) for (const b of st.binds) if (!lv.has(b)) lv.set(b, { v: b.kind === 'o' ? b.def : b.def, w: 1 });
      for (const [b, e] of lv) {
        if (e.o) { if (w >= 0.5) vals.set(b, e.v); continue; }
        const prev = vals.has(b) ? vals.get(b) : cur(vals, b);
        vals.set(b, w >= 1 ? e.v : prev + (e.v - prev) * w);
      }
    }
    for (const [b, v] of vals) b.set(v);
    applyEulers(this.bset);
  }
}

function cur(vals, b) { return b.get(); }

// ---------------------------------------------------------------------------------------------------------- legacy

export class LegacyAnimation {
  constructor(comp, node, assets, engine) {
    this.comp = comp; this.node = node; this.assets = assets; this.engine = engine;
    this.bset = new BindingSet(node);
    this.state = null;
    this.clips = new Map();
    for (const r of [comp.clip, ...(comp.clips || [])]) { const c = assets.clip(r); if (c) this.clips.set(c.key, c); }
    const first = assets.clip(comp.clip);
    if (comp.auto && first) this.play(first.key);
  }

  play(name) {
    const clip = this.clips.get(name) || this.assets.clip(name);
    if (!clip) return false;
    // WrapMode: 0 default (clip), 1 once, 2 loop, 4 pingpong, 8 clamp forever
    const wrap = this.comp.wrap || clip.wrap || 0;
    this.state = { clip, t: 0, prevT: 0, loop: wrap === 2 || (wrap === 0 && clip.loop), ping: wrap === 4, clampForever: wrap === 8, playing: true };
    this.sample();
    return true;
  }

  stop() { if (this.state) this.state.playing = false; }
  get isPlaying() { return !!(this.state && this.state.playing); }

  update(dt) {
    const s = this.state;
    if (!s || !s.playing || !this.comp.enabled) return;
    s.prevT = s.t;
    s.t += dt;
    fireEvents(s.clip, s.prevT, s.t, s.loop, this.engine && this.engine.onAnimEvent, this.node);
    if (!s.loop && !s.ping && s.t >= s.clip.len) {
      s.t = s.clip.len;
      this.sample();
      if (!s.clampForever) s.playing = false;
      return;
    }
    this.sample();
  }

  sample() {
    const s = this.state;
    let t = s.t;
    const len = s.clip.len || 0;
    if (s.ping && len > 0) { const k = Math.floor(t / len); t = t % len; if (k % 2) t = len - t; }
    else t = clipTime(s.clip, t, s.loop);
    const B = this.bset.forClip(s.clip);
    for (const [b, keys] of B.f) b.set(evalCurve(keys, t));
    for (const [b, keys] of B.o) b.set(stepValue(keys, t));
    applyEulers(this.bset);
  }
}

export { lerp };
