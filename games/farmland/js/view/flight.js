// Seaplane trip (Hydravion.Travel -> Animator "Plane", trigger Fly -> state Travel, clip RoadToNewWorld x1.1).
// The clip moves Hydravion / Hydravion/Root / Hydravion/Root/YRoot under the SectionFinal "Plane" object, and three
// camera nodes the game parents under Hydravion/CamRoot at runtime (their paths survive only as hashes): yaw (y
// rotation), pitch (x rotation, 50 deg at t=0 like the play camera) and the camera itself (local z = distance 20 -> 42).
// Events: EnableSkipButton at 11.68 s, OnTravelComplete at 28.5 s (then WorldController.ChangeWorld).
import * as THREE from 'three';

const CAM_YAW = 'path_0x5F18E2D6_thhiVRL', CAM_PITCH = 'path_0x7A19AF6F_mWHJwNL', CAM_POS = 'path_0xD52DF6A7_inmPlLN';
const SPEED = 1.1;   // Plane.controller Travel state speed
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3();

let CLIP = null;
export async function loadFlight(url) {
  if (!CLIP) CLIP = (await fetch(url).then(r => r.json())).clips.RoadToNewWorld;
  return CLIP;
}

export class Flight {
  // holder: the SectionFinal "Plane" Object3D; onSkip(): show the skip button; onDone(): change world
  constructor(world, holder, { onSkip, onDone }) {
    this.world = world; this.holder = holder; this.onSkip = onSkip; this.onDone = onDone;
    this.t = 0; this.fired = new Set();
    holder.traverse(o => { o.matrixAutoUpdate = true; });
    const camRoot = holder.getObjectByName('CamRoot') || holder;
    this.yaw = new THREE.Object3D(); this.pitch = new THREE.Object3D(); this.cam = new THREE.Object3D();
    camRoot.add(this.yaw); this.yaw.add(this.pitch); this.pitch.add(this.cam);
    this.tracks = [];
    for (const [path, kind, ...a] of CLIP.tracks) {
      let o = path === CAM_YAW ? this.yaw : path === CAM_PITCH ? this.pitch : path === CAM_POS ? this.cam : holder;
      if (o === holder) for (const seg of path.split('/')) { o = o?.children.find(c => c.name === seg); if (!o) break; }
      if (o) this.tracks.push([o, kind, a]);
    }
    this.helix = holder.getObjectByName('Helix');
    this.apply();
  }

  apply() {
    const f = Math.min(this.t, CLIP.dur) * 30;
    for (const [o, kind, a] of this.tracks) {
      const w = kind === 'q' ? 4 : 3, n = a.length / w;
      const i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), k = f - Math.floor(f);
      if (kind === 'q') {
        qa.set(a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]);
        if (j !== i) qa.slerp(qb.set(a[j * 4], a[j * 4 + 1], a[j * 4 + 2], a[j * 4 + 3]), k);
        o.quaternion.copy(qa);
      } else {
        va.set(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
        if (j !== i) va.lerp(vb.set(a[j * 3], a[j * 3 + 1], a[j * 3 + 2]), k);
        (kind === 'p' ? o.position : o.scale).copy(va);
      }
    }
    this.world.touch(this.holder);
  }

  // drives the stage camera; returns false once the trip is over
  update(dt, camera) {
    this.t += dt * SPEED;
    // Hydravion.HelixSpeedTraveling = 700 deg/s (Rotator); the propeller spins about the plane's forward axis
    if (this.helix) this.helix.rotateZ(dt * 700 * Math.PI / 180);
    this.apply();
    this.cam.matrixWorld.decompose(camera.position, camera.quaternion, va);
    for (const [time, name] of CLIP.events || []) {
      if (this.t >= time && !this.fired.has(name)) {
        this.fired.add(name);
        if (name === 'EnableSkipButton') this.onSkip?.();
        if (name === 'OnTravelComplete') { this.onDone?.(); return false; }
      }
    }
    return true;
  }
}
