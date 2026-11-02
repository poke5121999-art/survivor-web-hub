// Animation clip sampling, legacy Animation player and Animator state machine.
// Clip data: data/clips.json (tools/export_anim.py + combine_anim.py).
import { A } from './assets.js?v=20261102a';

export function clip(key) { return A.clips && A.clips.clips[key]; }
export function controller(key) { return A.clips && A.clips.controllers[key]; }

const INF = v => v === 'Infinity' || v === '-Infinity' || v === Infinity || v === -Infinity;
export function evalKeys(keys, t) {
  const n = keys.length;
  if (!n) return 0;
  if (typeof keys[0][1] === 'string') { // pptr curve: step
    let v = keys[0][1]; for (const k of keys) { if (k[0] <= t + 1e-6) v = k[1]; else break; } return v;
  }
  if (t <= keys[0][0] || n === 1) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (i < n - 2 && keys[i + 1][0] <= t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  if (INF(k0[3]) || INF(k1[2])) return k0[1];
  const dt = k1[0] - k0[0], s = (t - k0[0]) / dt;
  const m0 = k0[3] * dt, m1 = k1[2] * dt, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * k1[1] + (s3 - s2) * m1;
}

// Bind a clip's curves against a target through an adapter {resolve(root, path), set(t, type, prop, comp, v), get(...)}
function bindingKey(c) { return `${c.path}|${c.type}|${c.prop}|${c.comp ?? ''}`; }

export class Binder {
  constructor(root, adapter) { this.root = root; this.ad = adapter; this.cache = new Map(); this.defaults = new Map(); }
  target(path) { if (!this.cache.has(path)) this.cache.set(path, this.ad.resolve(this.root, path)); return this.cache.get(path); }
  apply(c, v) { const t = this.target(c.path); if (t) this.ad.set(t, c.type, c.prop, c.comp, v); }
  captureDefault(c) {
    const k = bindingKey(c);
    if (this.defaults.has(k)) return;
    const t = this.target(c.path);
    this.defaults.set(k, { c, v: t ? this.ad.get(t, c.type, c.prop, c.comp) : undefined });
  }
  writeDefaults() { for (const { c, v } of this.defaults.values()) if (v !== undefined) this.apply(c, v); }
  sample(cl, time, weightApply = true) {
    if (!cl) return;
    for (const c of cl.curves) this.apply(c, evalKeys(c.keys, time));
  }
}

function fireEvents(cl, t0, t1, onEvent) {
  if (!cl || !cl.events || !cl.events.length || !onEvent) return;
  for (const e of cl.events) if (e.time > t0 && e.time <= t1) onEvent(e);
}

// Legacy Animation component
export class LegacyAnimation {
  constructor(root, adapter, comp, { onEvent } = {}) {
    this.binder = new Binder(root, adapter);
    this.clips = (comp.m_Animations || []).filter(Boolean).map(r => r.$);
    this.clipKey = comp.m_Animation ? comp.m_Animation.$ : this.clips[0];
    this.playing = false; this.time = 0; this.speed = 1; this.onEvent = onEvent;
    this.wrapMode = comp.m_WrapMode || 0;
    if (comp.m_PlayAutomatically) this.play();
  }
  get clip() { return clip(this.clipKey); }
  get length() { const c = this.clip; return c ? c.length : 0; }
  play(key) { if (key) this.clipKey = key; this.playing = true; this.time = 0; this.binder.sample(this.clip, 0); }
  stop() { this.playing = false; }
  rewind() { this.time = 0; }
  setNormalizedTime(n) { this.time = n * this.length; }
  isPlaying() { return this.playing; }
  update(dt) {
    if (!this.playing) return;
    const c = this.clip; if (!c) { this.playing = false; return; }
    const t0 = this.time; this.time += dt * this.speed;
    const loop = c.loop || c.wrapMode === 2 || this.wrapMode === 2;
    const ping = c.wrapMode === 4 || this.wrapMode === 4;
    const L = c.length || 1e-6;
    let t = this.time;
    fireEvents(c, t0, Math.min(t, L), this.onEvent);
    if (t >= L) {
      if (loop) { t = t % L; this.time = t; }
      else if (ping) { const k = Math.floor(t / L); t = k % 2 ? L - (t % L) : t % L; }
      else if (this.wrapMode === 8 || c.wrapMode === 8) { t = L; }
      else { this.binder.sample(c, L); this.playing = false; this.time = 0; return; }
    }
    this.binder.sample(c, t);
  }
}

// Animator (Mecanim) with write-defaults semantics and StateMachineBehaviour hooks.
export class Animator {
  constructor(root, adapter, ctrlKey, { onBehaviour, onEvent } = {}) {
    this.ctrl = controller(ctrlKey);
    this.binder = new Binder(root, adapter);
    this.params = {}; this.speed = 1; this.onBehaviour = onBehaviour; this.onEvent = onEvent; this.enabled = true;
    if (!this.ctrl) { this.layers = []; return; }
    for (const p of this.ctrl.params) this.params[p[0]] = p[1] === 4 ? false : 0;
    // capture defaults for every curve of every clip used by this controller
    for (const L of this.ctrl.layers) for (const s of L.states) for (const ck of s.clips) { const c = clip(ck); if (c) for (const cv of c.curves) this.binder.captureDefault(cv); }
    this.layers = this.ctrl.layers.map(L => ({ L, state: L.default, time: 0, prevNorm: 0, entered: false }));
    for (let i = 0; i < this.layers.length; i++) this._enter(i, this.layers[i].state, 0);
  }
  setBool(n, v) { this.params[n] = !!v; }
  setFloat(n, v) { this.params[n] = v; }
  setInteger(n, v) { this.params[n] = v | 0; }
  stateIndex(layer, name) { return this.layers[layer].L.states.findIndex(s => s.name === name); }
  currentStateName(layer = 0) { const l = this.layers[layer]; return l && l.L.states[l.state].name; }
  normalizedTime(layer = 0) { const l = this.layers[layer]; const s = l.L.states[l.state]; const c = clip(s.clips[0]); return c && c.length ? l.time / c.length : 1; }
  crossFade(name, dur = 0, layer = -1, normTime = 0) { this.play(name, layer, normTime); }
  play(name, layer = -1, normTime = 0) {
    for (let i = 0; i < this.layers.length; i++) {
      if (layer >= 0 && i !== layer) continue;
      const si = this.stateIndex(i, name);
      if (si >= 0) { const s = this.layers[i].L.states[si]; const c = clip(s.clips[0]); this._enter(i, si, (normTime || 0) * (c ? c.length : 0)); if (layer < 0) return; }
    }
  }
  _enter(li, si, t) {
    const l = this.layers[li]; l.state = si; l.time = t; l.prevNorm = -1;
    const s = l.L.states[si];
    for (const b of s.beh) this.onBehaviour && this.onBehaviour(b, 'enter', { layer: li, state: s.name });
  }
  _cond(c) {
    const [mode, name, th] = c; const v = this.params[name];
    switch (mode) { case 1: return !!v; case 2: return !v; case 3: return v > th; case 4: return v < th; case 6: return v === th; case 7: return v !== th; }
    return false;
  }
  update(dt) {
    if (!this.ctrl || !this.enabled) return;
    this.binder.writeDefaults();
    for (let li = 0; li < this.layers.length; li++) {
      const l = this.layers[li]; let s = l.L.states[l.state];
      const c = clip(s.clips[0]); const len = c ? c.length : 0;
      const sp = s.speed * (s.speedParam ? (this.params[s.speedParam] ?? 1) : 1) * this.speed;
      const t0 = l.time; l.time += dt * sp;
      const norm = len > 0 ? l.time / len : 1;
      fireEvents(c, t0 % (len || 1), (l.time % (len || 1)) || len, this.onEvent);
      // transitions
      let moved = false;
      for (const tr of [...l.L.any, ...s.trans]) {
        const exitOk = tr.exit == null || (l.prevNorm < tr.exit && norm >= tr.exit) || (tr.exit != null && norm >= tr.exit && !s.loop);
        if (tr.exit == null && !tr.conds.length) continue;
        if (exitOk && tr.conds.every(cd => this._cond(cd)) && tr.dst !== undefined && !(tr.dst === l.state && tr.exit == null)) {
          this._enter(li, tr.dst, 0); moved = true; break;
        }
      }
      if (!moved) {
        for (const b of s.beh) this.onBehaviour && this.onBehaviour(b, 'update', { layer: li, state: s.name, normalizedTime: norm });
      }
      l.prevNorm = norm;
      s = l.L.states[l.state];
      const cc = clip(s.clips[0]);
      if (cc) {
        let t = l.time;
        if (cc.length > 0) t = (s.loop || cc.loop) ? t % cc.length : Math.min(t, cc.length);
        this.binder.sample(cc, t);
      }
    }
  }
}
