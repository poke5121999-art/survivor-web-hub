// Stickman animation from the game's own humanoid clips (art/anim/stickman.json, tools/export_anim.py).
// BaseCharacter.controller: Base Layer = 1D blend tree on Speed (Idle 0, Walking 3, Running_0 6), clips synced on
// normalised time; TopBody layer = tool clips (Seeding x1.2, Irrigate x1, Slashing x1.5) over the upper body.
import * as THREE from 'three';

let DATA = null;
export async function loadAnims(url) { DATA = await fetch(url).then(r => r.json()); }
export const animsLoaded = () => !!DATA;

const LOCO = [['Idle', 0], ['Walking', 3], ['Running_0', 6]];
const TOOL = { seed: ['LT_Seeding', 1.2], water: ['Irrigate', 1], scythe: ['LT_Slash', 1.5] };
const UPPER_HUMAN = ['Spine', 'Chest', 'UpperChest', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftUpperArm',
  'RightUpperArm', 'LeftLowerArm', 'RightLowerArm', 'LeftHand', 'RightHand'];
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vd = new THREE.Vector3();

function sampleQ(clip, bone, t, out) {
  const a = clip.q[bone], n = a.length / 4;
  const f = Math.max(0, Math.min(n - 1, t * DATA.fps)), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
  out.set(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]);
  if (k > 0) out.slerp(qc.set(a[j * 4], a[j * 4 + 1], a[j * 4 + 2], a[j * 4 + 3]), k);
  return out;
}

function sampleHips(clip, t, out) {
  const a = clip.hips, n = a.length / 3;
  const f = Math.max(0, Math.min(n - 1, t * DATA.fps)), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
  out.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
  if (k > 0) out.lerp(vb.set(a[j * 3], a[j * 3 + 1], a[j * 3 + 2]), k);
  return out;
}

const wrap = (t, d) => d > 0 ? t - Math.floor(t / d) * d : 0;

export class Rig {
  // root: an instance of a stickman prefab (bones found by name under it)
  constructor(root) {
    this.ok = !!DATA;
    if (!this.ok) return;
    this.bones = [];
    for (const [human, name] of Object.entries(DATA.bones)) {
      const o = root.getObjectByName(name);
      if (o) this.bones.push({ human, name, o, upper: UPPER_HUMAN.includes(human) });
    }
    this.hips = this.bones.find(b => b.human === 'Hips');
    this.ok = this.bones.length > 10 && !!this.hips;
    this.phase = Math.random();
    this.toolT = 0; this.toolW = 0; this.tool = null;
    this.speed = 0;
    this.layers = [];   // full-body state clips (merchant StandingArmSpace / Happy) faded over the locomotion
  }

  // speed: Animator "Speed" (world units/s); tool: 'seed' | 'water' | 'scythe' | null;
  // state: name of a looping full-body clip that replaces the locomotion (0.25 s cross-fade), or null
  update(dt, speed, tool, state = null) {
    if (!this.ok) return;
    this.speed += (speed - this.speed) * Math.min(1, dt * 10);
    const s = Math.max(0, Math.min(6, this.speed));
    let k = s < 3 ? 0 : 1;
    const w = (s - LOCO[k][1]) / 3;
    const A = DATA.clips[LOCO[k][0]], B = DATA.clips[LOCO[k + 1][0]];
    // blend tree: one normalised phase, cycle length = weighted clip durations
    this.phase = wrap(this.phase + dt / (A.dur * (1 - w) + B.dur * w), 1);
    const ta = this.phase * A.dur, tb = this.phase * B.dur;
    if (tool) { this.tool = tool; }
    this.toolW = Math.max(0, Math.min(1, this.toolW + (tool ? dt : -dt) * 6));
    const T = this.toolW > 0 && this.tool ? DATA.clips[TOOL[this.tool][0]] : null;
    if (T) this.toolT = wrap(this.toolT + dt * TOOL[this.tool][1], T.dur); else this.toolT = 0;
    for (const b of this.bones) {
      sampleQ(A, b.name, ta, qa);
      if (w > 0) qa.slerp(sampleQ(B, b.name, tb, qb), w);
      if (T && b.upper) qa.slerp(sampleQ(T, b.name, this.toolT, qb), this.toolW);
      b.o.quaternion.copy(qa);
    }
    sampleHips(A, ta, va);
    if (w > 0) va.lerp(sampleHips(B, tb, vd), w);
    if (state && DATA.clips[state] && !this.layers.some(l => l.name === state)) this.layers.push({ name: state, t: 0, w: 0 });
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i], C = DATA.clips[l.name];
      l.w = Math.max(0, Math.min(1, l.w + (l.name === state ? dt : -dt) * 4));
      if (!l.w && l.name !== state) { this.layers.splice(i, 1); continue; }
      l.t = wrap(l.t + dt, C.dur);
      for (const b of this.bones) b.o.quaternion.slerp(sampleQ(C, b.name, l.t, qb), l.w);
      va.lerp(sampleHips(C, l.t, vd), l.w);
    }
    this.hips.o.position.copy(va);
  }
}

// ---- Generic animal clips (art/anim/animals.json, tools/export_generic.py) ------------------------------------------
// AC_<Animal>.controller: default "Idle A"; the remake plays Idle A and now and then Idle B / Idle C / Munch-Peck once,
// and Bounce once when the animal is collected.
let GEN = null;
export async function loadGeneric(url) { GEN = await fetch(url).then(r => r.json()); }
export const genericControllers = () => (GEN ? Object.keys(GEN.controllers) : []);

const IDLE_EXTRA = ['Idle B', 'Idle C', 'Munch/Peck'];

export class GenericRig {
  // holder: the object that carried the Animator (tracks are paths below it); ctrl: 'AC_Cow' ...
  constructor(holder, ctrl) {
    this.c = GEN?.controllers[ctrl];
    this.ok = !!this.c;
    if (!this.ok) return;
    this.holder = holder;
    this.bound = new Map();   // clip name -> [[object, kind, frames]]
    this.state = null;
    this.play(this.c.default || 'Idle A');
    this.t = Math.random() * 2;
  }

  bind(name) {
    if (!this.bound.has(name)) {
      const list = [];
      for (const [path, kind, ...frames] of GEN.clips[name].tracks) {
        let o = this.holder;
        for (const seg of path ? path.split('/') : []) { o = o?.children.find(c => c.name === seg); if (!o) break; }
        if (o) list.push([o, kind, frames]);
      }
      this.bound.set(name, list);
    }
    return this.bound.get(name);
  }

  play(state, once = false) {
    const st = this.c.states[state];
    if (!st) return;
    this.state = state; this.once = once; this.t = 0;
    this.clip = GEN.clips[st.clip]; this.speed = st.speed || 1; this.tracks = this.bind(st.clip);
  }

  update(dt) {
    if (!this.ok || !this.clip) return;
    this.t += dt * this.speed;
    const d = this.clip.dur;
    if (this.t >= d) {
      if (this.once || this.state === 'Idle A') {
        // back to Idle A; after an Idle A loop, sometimes one of the other idles
        const extra = !this.once && Math.random() < 0.3 ? IDLE_EXTRA[Math.floor(Math.random() * 3)] : null;
        if (extra && this.c.states[extra]) this.play(extra, true); else this.play(this.c.default || 'Idle A');
      } else this.t %= d;
    }
    const f = Math.min(this.t, d) * GEN.fps;
    for (const [o, kind, a] of this.tracks) {
      const w = kind === 'q' ? 4 : 3, n = a.length / w;
      const i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), k = n > 1 ? f - i : 0;
      if (kind === 'q') {
        qa.set(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]);
        if (k > 0) qa.slerp(qc.set(a[j * 4], a[j * 4 + 1], a[j * 4 + 2], a[j * 4 + 3]), k);
        o.quaternion.copy(qa);
      } else {
        va.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
        if (k > 0) va.lerp(vb.set(a[j * 3], a[j * 3 + 1], a[j * 3 + 2]), k);
        (kind === 'p' ? o.position : o.scale).copy(va);
      }
    }
  }
}
