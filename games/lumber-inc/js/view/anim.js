// Plays the clips decoded by tools/export_anim.py (art/anim/clips.json) on the exported rigs.
// Lumber Inc drives characters with Animancer, not Animator controllers: a role component names a RoleAnimSO
// (art/anim/roles.json: idle/walk/run/chop... -> clip keys), and playing is "pick a clip, crossfade to it".
// A track's `path` is relative to the GameObject that holds the Animator (or the legacy Animation), exactly as Unity
// binds it, so each rig resolves its own objects and binds tracks by uuid (bone names break PropertyBinding names).
import * as THREE from 'three';

export class AnimLibrary {
  constructor(clips, roles = {}, rolesOf = {}) {
    this.clips = clips.clips || clips;
    this.roles = roles;
    this.rolesOf = rolesOf;
  }

  role(prefabName) {
    const so = this.rolesOf[prefabName];
    return so ? this.roles[so] : null;
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
  // root: the node that holds the Animator; role: an entry of roles.json (or null for a bare clip player)
  constructor(lib, root, role = null) {
    this.lib = lib;
    this.root = root;
    this.role = role;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.current = null;
    this.speed = 1;
    this.missing = new Set();
  }

  action(key, loop) {
    if (this.actions.has(key)) return this.actions.get(key);
    const src = this.lib.clips[key];
    if (!src) { this.missing.add(key); this.actions.set(key, null); return null; }
    const tracks = [];
    for (const t of src.tracks) {
      const o = resolve(this.root, t.path);
      if (!o) continue;
      tracks.push(new TRACK[t.prop](`${o.uuid}.${t.prop}`, t.times, t.values));
    }
    const a = this.mixer.clipAction(new THREE.AnimationClip(key, src.duration, tracks));
    const rep = loop ?? src.loop;
    a.setLoop(rep ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !rep;
    this.actions.set(key, a);
    return a;
  }

  has(key) { return !!this.lib.clips[key]; }

  // play(clipKey, { fade, speed, loop, restart })
  play(key, { fade = 0.15, speed = 1, loop, restart = false } = {}) {
    if (!key) return null;
    if (key === this.current && !restart) return this.actions.get(key);
    const next = this.action(key, loop);
    if (!next) return null;
    const prev = this.current && this.actions.get(this.current);
    this.current = key;
    next.timeScale = speed;
    next.reset().play();
    if (prev && prev !== next) {
      if (fade > 0) prev.crossFadeTo(next, fade, false); else prev.stop();
    }
    return next;
  }

  // Role helpers: kind = 'idle' | 'walk' | 'run' | 'riding' | 'ridingIdle'; idle picks idle[i].
  playRole(kind, opts = {}) {
    const r = this.role;
    if (!r) return null;
    const key = kind === 'idle' ? r.idle[opts.index || 0] : r[kind];
    return this.play(key, opts);
  }

  // Chop transitions carry {clip, speed, fade, events}: kind = 'chopWood' | 'chopRock' | 'chopDrill' | 'chopSaw'.
  playChop(kind, opts = {}) {
    const c = this.role && this.role[kind];
    if (!c || !c.clip) return null;
    return this.play(c.clip, { fade: c.fade, speed: c.speed, ...opts });
  }

  update(dt) {
    this.mixer.update(dt * this.speed);
  }
}

// One Rig per scene node that holds an Animator and whose prefab root has a role in roles-of.json.
// The prefab root is the ancestor whose parent is the scene root; its node name is the prefab name.
export function attachRigs(lib, world) {
  const rigs = [];
  world.objects.forEach(o => {
    const n = o.userData.node;
    if (!(n.k && n.k.Animator)) return;
    let top = o;
    while (top.parent && top.parent !== world.root) top = top.parent;
    const rig = new Rig(lib, o, lib.role(top.name));
    rig.prefab = top.name;
    o.userData.rig = rig;
    rigs.push(rig);
  });
  return rigs;
}
