// Plays the cat Animator controller (art/anim/controllers.json, tools/export_anim.py). Clips sit one per file in
// art/anim/clips/<n>.json (tools/split_clips.py) and load the first time a state plays; until then the rig keeps its
// previous pose. Track paths are relative to the Animator GameObject and bind by uuid, as in casual-farm/anim.js.
import * as THREE from 'three';

const TRACK = { position: THREE.VectorKeyframeTrack, scale: THREE.VectorKeyframeTrack, quaternion: THREE.QuaternionKeyframeTrack };

export class AnimLibrary {
  constructor(base, controllers, index) {
    this.base = base;
    this.controllers = controllers;
    this.index = index;
    this.clips = new Map();
  }

  static async load(base) {
    const [controllers, index] = await Promise.all([
      fetch(`${base}/art/anim/controllers.json${globalThis.CS_V || ''}`).then(r => r.json()),
      fetch(`${base}/art/anim/clip-index.json${globalThis.CS_V || ''}`).then(r => r.json()),
    ]);
    return new AnimLibrary(base, controllers, index);
  }

  clip(key) {
    if (!this.clips.has(key)) {
      const n = this.index[key];
      this.clips.set(key, n == null ? Promise.resolve(null) : fetch(`${this.base}/art/anim/clips/${n}.json${globalThis.CS_V || ''}`).then(r => r.json()));
    }
    return this.clips.get(key);
  }
}

function resolve(root, path) {
  let o = root;
  for (const seg of path.split('/')) {
    if (!seg) continue;
    o = o.children.find(c => c.name === seg);
    if (!o) return null;
  }
  return o;
}

export class Rig {
  constructor(lib, root, controller = 'cat1') {
    this.lib = lib;
    this.root = root;
    this.ctrl = lib.controllers[controller];
    this.layer = this.ctrl.layers[0];
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.state = null;
    this.current = null;
    this.speed = 1;
    this.play(this.layer.default, 0);
  }

  has(state) { return !!this.layer.states[state]; }

  async action(state) {
    if (this.actions.has(state)) return this.actions.get(state);
    const st = this.layer.states[state];
    const src = st && st.clip ? await this.lib.clip(st.clip) : null;
    let a = null;
    if (src) {
      const tracks = [];
      for (const t of src.tracks) {
        const o = resolve(this.root, t.path);
        if (o) tracks.push(new TRACK[t.prop](`${o.uuid}.${t.prop}`, t.times, t.values));
      }
      a = this.mixer.clipAction(new THREE.AnimationClip(state, src.duration, tracks));
      a.setLoop(st.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !st.loop;
      a.timeScale = st.speed ?? 1;
    }
    this.actions.set(state, a);
    return a;
  }

  // Resolves once the state's clip is playing (or immediately if the state has no clip).
  async play(state, fade = 0.15) {
    if (state === this.state || !this.has(state)) return;
    this.state = state;
    const next = await this.action(state);
    if (this.state !== state || !next) return;
    const prev = this.current;
    this.current = next;
    next.reset().play();
    if (prev && prev !== next && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev && prev !== next) prev.stop();
  }

  update(dt) { this.mixer.update(dt * this.speed); }
}
