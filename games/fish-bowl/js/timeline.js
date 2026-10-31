// Plays one exported Timeline (data/timelines.json, tools/export_timelines.py) against the loaded scenes.
// Track kinds: AnimationTrack (+ its "Override" children, + an infinite "Recorded" clip), ActivationTrack,
// CinemachineTrack, TextSwitcherTrack, ControlTrack, AudioTrack, TransformTweenTrack. Group tracks only nest.
// Clip timing follows Unity's TimelineClip: start, dur, clipIn, scale, ease/blend in-out, pre/post extrapolation
// (0 None, 1 Hold, 2 Loop, 3 PingPong, 4 Continue).
import * as THREE from 'three';
import { Rig } from './anim.js';

const U = v => new THREE.Vector3(v.x, v.y, -v.z);
const UQ = q => new THREE.Quaternion(-q.x, -q.y, q.z, q.w);
const ACTIVE_POST = { 0: true, 1: false, 2: null, 3: undefined }; // Active, Inactive, Revert, LeaveAsIs

function weightAt(c, t) {
  const end = c.start + c.dur;
  const inLen = c.blendIn > 0 ? c.blendIn : c.easeIn;
  const outLen = c.blendOut > 0 ? c.blendOut : c.easeOut;
  let w = 1;
  if (inLen > 0 && t < c.start + inLen) w = Math.min(w, (t - c.start) / inLen);
  if (outLen > 0 && t > end - outLen) w = Math.min(w, (end - t) / outLen);
  return Math.max(0, Math.min(1, w));
}

// Local clip time for t, honouring extrapolation into the gaps on either side; null when the clip is not playing.
function localTime(c, t, prevEnd, nextStart) {
  const end = c.start + c.dur;
  let lt;
  if (t >= c.start && t < end) lt = t - c.start;
  else if (t >= end && t < nextStart && c.extrapolation[1]) lt = extrapolate(c.extrapolation[1], t - c.start, c.dur);
  else if (t < c.start && t >= prevEnd && c.extrapolation[0]) lt = extrapolate(c.extrapolation[0], t - c.start, c.dur);
  else return null;
  return c.clipIn + lt * (c.scale || 1);
}

function extrapolate(mode, lt, dur) {
  if (mode === 1) return Math.min(Math.max(lt, 0), dur);
  if (mode === 2) return ((lt % dur) + dur) % dur;
  if (mode === 3) { const p = ((lt % (2 * dur)) + 2 * dur) % (2 * dur); return p > dur ? 2 * dur - p : p; }
  return lt;
}

export class TimelinePlayer {
  // ctx: {find(path) -> Object3D, lib (ClipLib), cine (Cine), camera, ui: {text(path, str), uiTrack(path, prop, v)},
  //       sound: {play(name)}, rigs: Map}
  constructor(def, ctx) {
    this.def = def;
    this.ctx = ctx;
    this.t = 0;
    const byId = new Map(def.tracks.map(tr => [tr.id, tr]));
    this.tracks = def.tracks;
    this.children = new Map();
    def.tracks.forEach(tr => {
      if (tr.parent != null && byId.get(tr.parent)?.type === 'AnimationTrack') {
        if (!this.children.has(tr.parent)) this.children.set(tr.parent, []);
        this.children.get(tr.parent).push(tr);
      }
    });
    this.duration = Math.max(0, ...def.tracks.flatMap(tr => tr.clips.map(c => c.start + c.dur)));
    this.fired = new Set();
    this.activated = new Map();
  }

  rig(obj) {
    if (!this.ctx.rigs.has(obj)) this.ctx.rigs.set(obj, new Rig(this.ctx.lib, obj));
    return this.ctx.rigs.get(obj);
  }

  layersOf(track, t, override) {
    const out = [];
    const clips = [...track.clips].sort((a, b) => a.start - b.start);
    clips.forEach((c, i) => {
      const prevEnd = i > 0 ? clips[i - 1].start + clips[i - 1].dur : -Infinity;
      const nextStart = i < clips.length - 1 ? clips[i + 1].start : Infinity;
      const lt = localTime(c, t, prevEnd, nextStart);
      if (lt == null) return;
      const key = this.ctx.lib.key(c.clip, c.clipName);
      if (!key) return;
      const inside = t >= c.start && t < c.start + c.dur;
      out.push({ key, time: lt, weight: inside ? weightAt(c, t) : 1, override, clip: c });
    });
    return out;
  }

  evaluate(t, dt = 0) {
    const { find, cine, camera, ui, sound } = this.ctx;
    const shots = [];
    for (const tr of this.tracks) {
      const bind = tr.bind && tr.bind.path;
      switch (tr.type) {
        case 'AnimationTrack': {
          if (!bind || tr.parent != null && this.tracks.find(x => x.id === tr.parent)?.type === 'AnimationTrack') break;
          if (bind.startsWith('Canvas/')) { this.uiAnim(tr, t); break; }
          const obj = find(bind);
          if (!obj) break;
          const layers = [];
          if (tr.infinite) {
            const key = this.ctx.lib.key(tr.infinite, tr.infiniteName);
            if (key) layers.push({ key, time: t, weight: 1 });
          }
          layers.push(...this.layersOf(tr, t, false));
          for (const ch of this.children.get(tr.id) || []) layers.push(...this.layersOf(ch, t, true));
          if (!layers.length) break;
          const root = this.rig(obj).apply(layers);
          if (root) this.placeRoot(obj, root, layers);
          break;
        }
        case 'ActivationTrack': {
          const obj = bind && find(bind);
          if (!obj) break;
          if (!this.activated.has(obj)) this.activated.set(obj, { visible: obj.visible, post: tr.post });
          obj.visible = tr.clips.some(c => t >= c.start && t < c.start + c.dur);
          break;
        }
        case 'ControlTrack':
          for (const c of tr.clips) {
            const obj = c.source && find(c.source);
            if (!obj) continue;
            if (!this.activated.has(obj)) this.activated.set(obj, { visible: obj.visible, post: 3 });
            const on = t >= c.start && t < c.start + c.dur;
            if (on || tr.clips.every(o => o.source !== c.source || !(t >= o.start && t < o.start + o.dur))) obj.visible = on;
          }
          break;
        case 'CinemachineTrack':
          for (const c of tr.clips) {
            if (!c.vcam || t < c.start || t >= c.start + c.dur) continue;
            shots.push({ path: c.vcam, clip: c });
          }
          break;
        case 'TextSwitcherTrack': {
          const c = tr.clips.find(x => t >= x.start && t < x.start + x.dur);
          if (bind) ui.text(bind, c ? c.text : '', c && c.size);
          break;
        }
        case 'AudioTrack':
          for (const c of tr.clips) {
            const id = `${tr.id}:${c.start}`;
            if (t >= c.start && t < c.start + c.dur && !this.fired.has(id)) {
              this.fired.add(id);
              sound.play(c.audioName, { offset: Math.max(0, t - c.start) + (c.clipIn || 0) });
            }
          }
          break;
        case 'TransformTweenTrack': {
          const obj = bind && find(bind);
          const c = tr.clips.find(x => t >= x.start && t < x.start + x.dur);
          if (!obj || !c || !c.from || !c.to) break;
          const a = find(c.from), b = find(c.to);
          if (!a || !b) break;
          const k = (t - c.start) / c.dur;
          const pa = a.getWorldPosition(new THREE.Vector3()), pb = b.getWorldPosition(new THREE.Vector3());
          const wp = pa.lerp(pb, k);
          obj.parent.updateWorldMatrix(true, false);
          obj.position.copy(obj.parent.worldToLocal(wp));
          break;
        }
        default:
      }
    }
    // Overlapping shots on the Cinemachine track blend across the overlap (the later shot's blend-in).
    if (shots.length) {
      shots.sort((a, b) => a.clip.start - b.clip.start);
      const out = [];
      shots.forEach((s, i) => {
        const w = i === 0 ? 1 : Math.min(1, (t - s.clip.start) / Math.max(1e-3, Math.min(
          shots[i - 1].clip.start + shots[i - 1].clip.dur - s.clip.start, s.clip.blendIn > 0 ? s.clip.blendIn : Infinity)));
        out.forEach(o => { o.weight *= 1 - w; });
        out.push({ path: s.path, weight: w });
      });
      cine.apply(camera, out, dt);
    }
  }

  // Timeline places the root with ApplyTransformOffsets: clip offset (position, rotation) then the clip's root motion,
  // in the bound object's parent space. Clips without offsets (all zero) leave the root motion as is.
  placeRoot(obj, root, layers) {
    const main = layers.filter(l => !l.override && l.clip).sort((a, b) => b.weight - a.weight)[0];
    const off = main && main.clip.pos ? U(main.clip.pos) : new THREE.Vector3();
    const offQ = main && main.clip.rot ? UQ(main.clip.rot) : new THREE.Quaternion();
    if (root.position) obj.position.copy(root.position.clone().applyQuaternion(offQ).add(off));
    else if (main && main.clip.pos) obj.position.copy(off);
    if (root.quaternion) obj.quaternion.copy(offQ.clone().multiply(root.quaternion));
    else if (main && main.clip.rot) obj.quaternion.copy(offQ);
  }

  // Letterbox bars: "Recorded" clips animate TopBar_Img / BottomBar_Img scale on the TimelineUI canvas.
  uiAnim(tr, t) {
    const layers = this.layersOf(tr, t, false);
    if (!layers.length) return;
    const L = layers[layers.length - 1];
    const src = this.ctx.lib.clips[L.key];
    if (!src) return;
    for (const track of src.tracks) {
      const kt = new THREE.VectorKeyframeTrack('x', track.times, track.values).createInterpolant();
      const time = Math.min(L.time, src.duration);
      this.ctx.ui.uiTrack(`${tr.bind.path}/${track.path}`, track.prop, Array.from(kt.evaluate(time)));
    }
  }

  start() {
    this.t = 0;
    this.fired.clear();
    this.evaluate(0, 0);
  }

  update(dt) {
    this.t = Math.min(this.duration, this.t + dt);
    this.evaluate(this.t, dt);
    return this.t >= this.duration;
  }

  // Skip / end: jump to the last frame and apply each activation track's post-playback state.
  finish() {
    this.evaluate(this.duration - 1e-3, 0);
    for (const [obj, s] of this.activated) {
      const post = ACTIVE_POST[s.post ?? 2];
      if (post === null) obj.visible = s.visible;
      else if (post !== undefined) obj.visible = post;
    }
    for (const tr of this.tracks) if (tr.type === 'TextSwitcherTrack' && tr.bind) this.ctx.ui.text(tr.bind.path, '');
  }
}
