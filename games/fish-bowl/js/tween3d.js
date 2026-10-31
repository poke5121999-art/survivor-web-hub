// DOTweenAnimation components on 3D scene nodes (scene.json "k"), played the way DOTween does: delay, ease, loops
// (-1 = forever) with Restart / Yoyo / Incremental, relative or absolute end values. Types used by the scene:
// 1 Move (world), 2 LocalMove, 3 Rotate (world), 4 LocalRotate, 5 Scale. Values are Unity space, converted on use.
import * as THREE from 'three';
import { U, unityEuler, ease, nodeComps, activeInHierarchy } from './unity.js';

const TYPE = 'DG.Tweening.DOTweenAnimation';
const tmpQ = new THREE.Quaternion();
const ident = new THREE.Quaternion();

class Tween {
  constructor(obj, def) {
    this.obj = obj;
    this.def = def;
    this.playing = false;
    this.started = false;
    this.t = 0;
  }

  // Captures the start state and the per-cycle change.
  begin() {
    const d = this.def, o = this.obj, v = d.endValueV3;
    this.t = -d.delay;
    this.started = this.playing = true;
    this.p0 = o.position.clone();
    this.q0 = o.quaternion.clone();
    this.s0 = o.scale.clone();
    if (d.animationType === 1 || d.animationType === 2) {
      let end;
      if (d.animationType === 1) { // world move: work in world space, then back to the parent's
        o.parent.updateWorldMatrix(true, false);
        const w0 = o.getWorldPosition(new THREE.Vector3());
        const wEnd = d.isRelative ? w0.clone().add(U(v)) : U(v);
        end = o.parent.worldToLocal(wEnd);
      } else end = d.isRelative ? this.p0.clone().add(U(v)) : U(v);
      this.dp = end.sub(this.p0);
    } else if (d.animationType === 3 || d.animationType === 4) {
      // A rotation tween here always turns about one axis by endValue (relative, or absolute from ~0 with
      // incremental loops), so it is kept as a delta applied after the start rotation.
      this.dq = unityEuler(v);
    } else if (d.animationType === 5) {
      const e = d.optionalBool0 ? new THREE.Vector3(d.endValueFloat, d.endValueFloat, d.endValueFloat) : new THREE.Vector3(v.x, v.y, v.z);
      this.ds = (d.isRelative ? this.s0.clone().add(e) : e).sub(this.s0);
    }
  }

  update(dt) {
    if (!this.playing) return;
    const d = this.def;
    this.t += dt;
    if (this.t < 0) return;
    const dur = Math.max(1e-3, d.duration);
    let cycle = Math.floor(this.t / dur);
    const loops = d.loops < 0 ? Infinity : Math.max(1, d.loops);
    let k;
    if (cycle >= loops) { cycle = loops - 1; k = 1; this.playing = false; } else k = (this.t - cycle * dur) / dur;
    let e = ease(d.easeType, k);
    if (d.loopType === 1 && cycle % 2 === 1) e = 1 - ease(d.easeType, k); // yoyo
    const base = d.loopType === 2 ? cycle : 0; // incremental: each cycle starts where the last ended
    this.apply(base + e);
  }

  apply(f) {
    const o = this.obj;
    if (this.dp) o.position.copy(this.p0).addScaledVector(this.dp, f);
    else if (this.dq) {
      // whole turns first, then the fraction
      const n = Math.floor(f);
      o.quaternion.copy(this.q0);
      for (let i = 0; i < n; i++) o.quaternion.multiply(this.dq);
      o.quaternion.multiply(tmpQ.copy(ident).slerp(this.dq, f - n));
    } else if (this.ds) o.scale.copy(this.s0).addScaledVector(this.ds, f);
  }
}

export class Tweens {
  constructor(find) {
    this.find = find;
    this.byObj = new Map();
  }

  reset() { this.byObj.clear(); }

  of(obj) {
    if (!obj) return [];
    if (!this.byObj.has(obj)) this.byObj.set(obj, nodeComps(obj, TYPE).map(d => new Tween(obj, d)));
    return this.byObj.get(obj);
  }

  // DOPlay: start (or resume) every tween of the node.
  play(path) { for (const t of this.of(this.find(path))) { if (!t.started) t.begin(); else t.playing = true; } }
  restart(path) {
    for (const t of this.of(this.find(path))) {
      if (t.started) { t.apply(0); }
      t.begin();
    }
  }
  kill(path) { for (const t of this.of(this.find(path))) t.playing = false; }
  pause(path) { this.kill(path); }
  playById(path, id) { for (const t of this.of(this.find(path))) if (t.def.id === id) { if (!t.started) t.begin(); else t.playing = true; } }
  isPlaying(path) { return this.of(this.find(path)).some(t => t.playing); }

  // DOTween autoPlay: tweens start the first time their object is active.
  autoPlay(root) {
    root.traverse(o => {
      if (!o.userData.node || !o.userData.node.k || !o.userData.node.k[TYPE]) return;
      if (!activeInHierarchy(o)) return;
      for (const t of this.of(o)) if (t.def.autoPlay && !t.started) t.begin();
    });
  }

  update(dt) { for (const list of this.byObj.values()) for (const t of list) t.update(dt); }
}
