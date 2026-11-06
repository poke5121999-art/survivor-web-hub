// Samples the exported clips (art/anim/clips.json from the game's AnimationClips, art/anim/humanoid.json from Timmy's
// Humanoid clips baked by tools/humanoid) onto a rig, several weighted layers at a time, the way Timeline's mixer and
// override tracks combine them. Track paths are relative to the Animator's GameObject, as Unity binds them; "" is the
// Animator object itself (root motion), which the caller places with Timeline's clip offsets.
import * as THREE from 'three';

const TRACK = { position: THREE.VectorKeyframeTrack, scale: THREE.VectorKeyframeTrack, quaternion: THREE.QuaternionKeyframeTrack };

export class ClipLib {
  constructor(...sets) {
    this.clips = Object.assign({}, ...sets.map(s => s.clips));
  }

  // Timeline names a clip by its path id in sharedassets2; humanoid clips are keyed by name.
  key(id, name) {
    for (const f of ['sharedassets2', 'sharedassets4']) {
      const k = `${name}@${f}:${id}`;
      if (this.clips[k]) return k;
    }
    return this.clips[`${name}@humanoid`] ? `${name}@humanoid` : null;
  }

  byName(name) {
    return Object.keys(this.clips).find(k => k.startsWith(`${name}@`)) || null;
  }
}

export function resolve(root, path) {
  let o = root;
  for (const seg of path.split('/')) {
    if (!seg) continue;
    o = o.children.find(c => c.name === seg);
    if (!o) return null;
  }
  return o;
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class Rig {
  constructor(lib, root) {
    this.lib = lib;
    this.root = root;
    this.samplers = new Map();
    this.acc = new Map();
  }

  sampler(key) {
    if (this.samplers.has(key)) return this.samplers.get(key);
    const src = this.lib.clips[key];
    let s = null;
    if (src) {
      const tracks = [];
      for (const t of src.tracks) {
        const obj = t.path === '' ? null : resolve(this.root, t.path);
        if (t.path !== '' && !obj) continue;
        const kt = new TRACK[t.prop]('x', t.times, t.values);
        tracks.push({ obj, prop: t.prop, interp: kt.createInterpolant(), size: t.prop === 'quaternion' ? 4 : 3 });
      }
      s = { key, duration: src.duration, loop: src.loop, tracks, hasRoot: tracks.some(t => !t.obj) };
    }
    this.samplers.set(key, s);
    return s;
  }

  clipTime(key, t) {
    const s = this.sampler(key);
    if (!s) return 0;
    if (s.loop && s.duration > 0) return ((t % s.duration) + s.duration) % s.duration;
    return Math.min(Math.max(t, 0), s.duration);
  }

  // layers: [{key, time, weight, override}] in order. Bone tracks are written to the transforms; root tracks ("")
  // are blended into the returned {position, quaternion} (null when no layer moves the root).
  apply(layers) {
    this.acc.clear();
    let rootP = null, rootQ = null, rootW = 0;
    for (const L of layers) {
      const s = this.sampler(L.key);
      if (!s || L.weight <= 0) continue;
      const time = this.clipTime(L.key, L.time);
      for (const tr of s.tracks) {
        const v = tr.interp.evaluate(time);
        if (!tr.obj) {
          if (tr.prop === 'position') {
            tmpV.fromArray(v);
            if (!rootP || L.override) rootP = (rootP || new THREE.Vector3()).lerp(tmpV, rootP ? L.weight : 1);
            else rootP.lerp(tmpV, L.weight / (rootW + L.weight));
          } else if (tr.prop === 'quaternion') {
            tmpQ.fromArray(v);
            if (!rootQ || L.override) rootQ = (rootQ || new THREE.Quaternion()).slerp(tmpQ, rootQ ? L.weight : 1);
            else rootQ.slerp(tmpQ, L.weight / (rootW + L.weight));
          }
          continue;
        }
        const id = tr.obj.id * 4 + (tr.prop === 'position' ? 0 : tr.prop === 'quaternion' ? 1 : 2);
        const acc = this.acc.get(id) || 0;
        // First writer this frame sets (or eases in from the held pose); later ones of the same track crossfade by
        // their share of the weight; an override layer blends over whatever is there.
        const k = L.override ? L.weight : acc === 0 ? Math.min(1, L.weight) : L.weight / (acc + L.weight);
        if (tr.prop === 'quaternion') tr.obj.quaternion.slerp(tmpQ.fromArray(v), k);
        else tr.obj[tr.prop].lerp(tmpV.fromArray(v), k);
        this.acc.set(id, acc + L.weight);
      }
      if (s.hasRoot && !L.override) rootW += L.weight;
    }
    return rootP || rootQ ? { position: rootP, quaternion: rootQ } : null;
  }

  // One looping clip, for gameplay (no Timeline): play(name), then update(dt) each frame.
  play(name, fade = 0.2) {
    const key = this.lib.byName(name) || name;
    if (this.current && this.current.key === key) return;
    this.prev = this.current ? { ...this.current, fadeOut: fade } : null;
    this.current = { key, time: 0, fade, w: this.prev ? 0 : 1 };
  }

  update(dt, speed = 1) {
    if (!this.current) return;
    const c = this.current;
    c.time += dt * speed;
    c.w = c.fade > 0 ? Math.min(1, c.w + dt / c.fade) : 1;
    const layers = [];
    if (this.prev && c.w < 1) {
      this.prev.time += dt * speed;
      layers.push({ key: this.prev.key, time: this.prev.time, weight: 1 });
      layers.push({ key: c.key, time: c.time, weight: c.w, override: true });
    } else {
      this.prev = null;
      layers.push({ key: c.key, time: c.time, weight: 1 });
    }
    return this.apply(layers);
  }
}
