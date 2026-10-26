// Plays the original Animator controllers (art/anim/controllers.json) with clips decoded by tools/export_anim.py.
// A track's `path` is relative to the GameObject that holds the Animator, exactly as Unity binds it, so each rig
// resolves its own objects and binds tracks by uuid (bone names such as "mixamorig:Hips" break PropertyBinding names).
import * as THREE from 'three';

export class AnimLibrary {
  constructor(clips, controllers) {
    this.clips = clips.clips;
    this.byRef = new Map(Object.entries(controllers).map(([name, c]) => [c.ref, Object.assign({ name }, c)]));
  }

  controller(ref) {
    return ref ? this.byRef.get(`${ref.f}:${ref.id}`) : null;
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

const TRACK = { position: THREE.VectorKeyframeTrack, scale: THREE.VectorKeyframeTrack, quaternion: THREE.QuaternionKeyframeTrack };

export class Rig {
  constructor(lib, root, controller) {
    this.lib = lib;
    this.root = root;
    this.ctrl = controller;
    this.mixer = new THREE.AnimationMixer(root);
    this.layer = controller.layers[0];
    this.actions = new Map();
    this.state = null;
    this.speed = 1;
    this.play(this.layer.default, 0);
  }

  action(stateName) {
    if (this.actions.has(stateName)) return this.actions.get(stateName);
    const st = this.layer.states[stateName];
    const src = st && st.clip && this.lib.clips[st.clip];
    if (!src) { this.actions.set(stateName, null); return null; }
    const tracks = [];
    for (const t of src.tracks) {
      const o = resolve(this.root, t.path);
      if (!o) continue;
      tracks.push(new TRACK[t.prop](`${o.uuid}.${t.prop}`, t.times, t.values));
    }
    const clip = new THREE.AnimationClip(`${this.ctrl.name}:${stateName}`, src.duration, tracks);
    const a = this.mixer.clipAction(clip);
    a.setLoop(st.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !st.loop;
    a.timeScale = st.speed ?? 1;
    this.actions.set(stateName, a);
    return a;
  }

  has(stateName) {
    return !!this.layer.states[stateName];
  }

  play(stateName, fade = 0.15) {
    if (stateName === this.state || !this.has(stateName)) return;
    const next = this.action(stateName);
    const prev = this.state && this.actions.get(this.state);
    this.state = stateName;
    if (!next) return;
    next.reset().play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
  }

  update(dt) {
    this.mixer.update(dt * this.speed);
  }
}

// One Rig per scene node whose Animator has a controller we exported.
export function attachRigs(lib, world) {
  const rigs = [];
  world.objects.forEach(o => {
    const a = o.userData.node.k && o.userData.node.k.Animator;
    if (!a) return;
    const ctrl = lib.controller(a.m_Controller);
    if (!ctrl || !ctrl.layers.length) return;
    const rig = new Rig(lib, o, ctrl);
    o.userData.rig = rig;
    rigs.push(rig);
  });
  return rigs;
}
