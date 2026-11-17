// Animator controllers (art/anim/controllers.json) played with clips from art/anim/clips.json.
// Generic clips bind paths relative to the Animator's GameObject like Unity. Humanoid (Mecanim) clips are baked per
// avatar as '<clip key>|<rig>' with paths relative to the rig node (the child that holds the hips bone), where <rig>
// comes from clips.humanoid.owners[<Animator object name>]. Tracks bind by uuid: bone names such as
// "mixamorig:Hips" break PropertyBinding's name parser.
import * as THREE from 'three';

const TRACK = { position: THREE.VectorKeyframeTrack, scale: THREE.VectorKeyframeTrack, quaternion: THREE.QuaternionKeyframeTrack };
const DEFAULT_FADE = 0.15;

export class AnimLibrary {
  constructor(clipsJson, controllers) {
    this.clips = clipsJson.clips;
    this.humanoid = clipsJson.humanoid || { rigs: {}, owners: {} };
    this.byRef = new Map(Object.entries(controllers).map(([name, c]) => [c.ref, Object.assign({ name }, c)]));
  }

  // Animator.m_Controller {f, id}; f '' means the scene set's own file.
  controller(ref, file) {
    return ref ? this.byRef.get(`${ref.f || file}:${ref.id}`) || null : null;
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

function findWithChild(root, childName) {
  let hit = null;
  root.traverse(o => { if (!hit && o.children.some(c => c.name === childName)) hit = o; });
  return hit;
}

// 1D blend tree weights: linear between the two thresholds around the parameter, clamped at the ends.
function blendWeights(children, v) {
  const w = children.map(() => 0);
  if (children.length === 1) { w[0] = 1; return w; }
  if (v <= children[0].threshold) { w[0] = 1; return w; }
  const last = children.length - 1;
  if (v >= children[last].threshold) { w[last] = 1; return w; }
  for (let i = 0; i < last; i++) {
    const a = children[i].threshold, b = children[i + 1].threshold;
    if (v >= a && v <= b) {
      const t = b > a ? (v - a) / (b - a) : 1;
      w[i] = 1 - t;
      w[i + 1] = t;
      return w;
    }
  }
  return w;
}

export class Rig {
  constructor(lib, node, controller) {
    this.lib = lib;
    this.node = node;
    this.ctrl = controller;
    this.layer = controller.layers[0];
    this.mixer = new THREE.AnimationMixer(node);
    this.params = Object.fromEntries((controller.params || []).map(p => [p.name, p.default ?? 0]));
    this.humanRig = lib.humanoid.owners[node.name] || null;
    const info = this.humanRig && lib.humanoid.rigs[this.humanRig];
    this.humanRoot = info ? findWithChild(node, info.hips) : null;
    this.states = new Map();
    this.active = [];
    this.state = null;
    this.play(this.layer.default, 0);
  }

  clip(key) {
    if (!key) return null;
    const human = this.humanRig && this.lib.clips[`${key}|${this.humanRig}`];
    const src = human || this.lib.clips[key];
    if (!src || !src.tracks.length) return null;
    const base = human ? this.humanRoot : this.node;
    const tracks = [];
    for (const t of src.tracks) {
      const o = base && resolve(base, t.path);
      if (o) tracks.push(new TRACK[t.prop](`${o.uuid}.${t.prop}`, t.times, t.values));
    }
    return tracks.length ? new THREE.AnimationClip(key, src.duration, tracks) : null;
  }

  stateObj(name) {
    if (this.states.has(name)) return this.states.get(name);
    const st = this.layer.states[name];
    if (!st) return null;
    const children = st.blend ? st.blend.children : [{ clip: st.clip, threshold: 0 }];
    const parts = children.map(c => {
      const clip = this.clip(c.clip);
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      const loop = (this.lib.clips[c.clip] || {}).loop ?? st.loop;
      // The exporter flags the StarterAssets Idle clip (and others) non-looping, yet the original idles forever: the
      // locomotion states (blend trees and the layer's default state) always loop, one-shot states keep their flag.
      const locomotion = !!st.blend || name === this.layer.default;
      a.setLoop(st.loop || loop || locomotion ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.enabled = true;
      a.setEffectiveWeight(0);
      return { action: a, threshold: c.threshold };
    });
    const s = { name, def: st, parts, weight: 0, fade: 0 };
    this.states.set(name, s);
    return s;
  }

  has(name) {
    return !!this.layer.states[name];
  }

  set(param, value) {
    this.params[param] = value;
  }

  // Crossfade to a state by its Animator state name (Unity CrossFadeInFixedTime).
  play(name, fade = DEFAULT_FADE) {
    if (name === this.state) return;
    const s = this.stateObj(name);
    if (!s) return;
    this.state = name;
    for (const p of s.parts) if (p) p.action.reset().play();
    if (!this.active.includes(s)) this.active.push(s);
    if (fade <= 0) { for (const o of this.active) o.weight = o === s ? 1 : 0; }
    for (const o of this.active) o.fade = fade;
  }

  // Normalized time of the current state (0..1 per loop), for exit-time transitions in the game layer.
  time() {
    const s = this.states.get(this.state);
    const p = s && s.parts.find(Boolean);
    return p ? p.action.time / Math.max(1e-6, p.action.getClip().duration) : 0;
  }

  update(dt) {
    const cur = this.states.get(this.state);
    for (const s of this.active) {
      const goal = s === cur ? 1 : 0;
      s.weight = s.fade > 0 ? s.weight + Math.sign(goal - s.weight) * Math.min(Math.abs(goal - s.weight), dt / s.fade) : goal;
      const w = s.def.blend ? blendWeights(s.def.blend.children, this.params[s.def.blend.param] ?? 0) : [1];
      const speed = (s.def.speed ?? 1) * (s.def.speedParam ? this.params[s.def.speedParam] ?? 1 : 1);
      s.parts.forEach((p, i) => {
        if (!p) return;
        p.action.setEffectiveWeight(s.weight * w[i]);
        p.action.setEffectiveTimeScale(speed);
      });
    }
    this.active = this.active.filter(s => s === cur || s.weight > 0);
    this.mixer.update(dt);
    if (this.overlays) for (const o of this.overlays.values()) o.update(dt);
  }

  // Another Animator layer of this controller (weight 1, override), e.g. 'AttackState', 'HandRig', 'CarryBrainRot'.
  overlay(name) {
    this.overlays = this.overlays || new Map();
    if (!this.overlays.has(name)) {
      const def = this.ctrl.layers.find(l => l.name === name);
      if (!def) return null;
      this.overlays.set(name, new Overlay(this, def));
    }
    return this.overlays.get(name);
  }
}

// An override layer sampled on top of the base layer. The AvatarMasks were not exported: humanoid layers drive the upper
// body (Spine and everything above it), generic ones every bone the clip has. Clips are sampled with keyframe
// interpolants after the base mixer ran, then blended in by the layer's fade weight.
const UPPER = /Spine|Neck|Head|Shoulder|Arm|Hand/;
class Overlay {
  constructor(rig, def) {
    this.rig = rig;
    this.def = def;
    this.state = def.default;
    this.time = 0;
    this.weight = 0;
    this.fade = 0.25;
    this.cache = new Map();
    this.q = new THREE.Quaternion();
  }

  sampler(stateName) {
    if (this.cache.has(stateName)) return this.cache.get(stateName);
    const st = this.def.states[stateName];
    let s = null;
    const key = st && st.clip;
    if (key) {
      const rig = this.rig, human = rig.humanRig && rig.lib.clips[`${key}|${rig.humanRig}`];
      const src = human || rig.lib.clips[key];
      const base = human ? rig.humanRoot : rig.node;
      if (src && base) {
        const tracks = [];
        for (const t of src.tracks) {
          if (human && (t.prop !== 'quaternion' || !UPPER.test(t.path.split('/').pop()))) continue;
          const o = resolve(base, t.path);
          if (!o) continue;
          const tr = new TRACK[t.prop]('x', t.times, t.values);
          tracks.push({ o, prop: t.prop, it: tr.createInterpolant() });
        }
        s = { tracks, duration: src.duration, speed: st.speed ?? 1, loop: !!st.loop };
      }
    }
    this.cache.set(stateName, s);
    return s;
  }

  // restart false: keep the running state (a bool-driven transition), true: start over (an "Any State" trigger).
  play(stateName, fade = 0.25, restart = false) {
    if (stateName === this.state && !restart) return;
    this.state = stateName;
    this.time = 0;
    this.fade = fade;
  }

  // Back to the empty default state ("New State"/"Default") with a fade.
  stop(fade = 0.25) {
    if (this.state === this.def.default) return;
    this.state = this.def.default;
    this.fade = fade;
  }

  playing() { return this.state !== this.def.default; }

  // Normalized time of the current state.
  normTime() {
    const s = this.sampler(this.state);
    return s ? this.time * s.speed / Math.max(1e-6, s.duration) : 0;
  }

  update(dt) {
    const s = this.sampler(this.state);
    if (s) this.last = s;
    const goal = s ? 1 : 0;
    this.weight += Math.sign(goal - this.weight) * Math.min(Math.abs(goal - this.weight), this.fade > 0 ? dt / this.fade : 1);
    this.time += dt;
    const use = s || this.last;
    if (!use || this.weight <= 1e-3) return;
    let t = this.time * use.speed;
    t = use.loop ? t % use.duration : Math.min(t, use.duration);
    if (!s) t = use.duration;               // fading out: hold the last pose
    for (const tr of use.tracks) {
      const v = tr.it.evaluate(t);
      if (tr.prop === 'quaternion') tr.o.quaternion.slerp(this.q.fromArray(v), this.weight);
      else if (tr.prop === 'position') tr.o.position.lerp(new THREE.Vector3().fromArray(v), this.weight);
      else tr.o.scale.lerp(new THREE.Vector3().fromArray(v), this.weight);
    }
  }
}

// One Rig per object (and descendants) whose Animator has an exported controller with at least one layer.
export function attachRigs(lib, objects, file) {
  const rigs = [];
  for (const o of objects) {
    const a = o.userData.node && o.userData.node.k && o.userData.node.k.Animator;
    if (!a || !a.m_Enabled) continue;
    const ctrl = lib.controller(a.m_Controller, file);
    if (!ctrl || !ctrl.layers.length) continue;
    const rig = new Rig(lib, o, ctrl);
    o.userData.rig = rig;
    rigs.push(rig);
  }
  return rigs;
}

// Rigs face local -z (Unity +z after the exporter's z flip): yaw is the sim's angle with forward = (sin, cos).
export function faceYaw(object, yaw) {
  object.rotation.set(0, yaw + Math.PI, 0);
}
