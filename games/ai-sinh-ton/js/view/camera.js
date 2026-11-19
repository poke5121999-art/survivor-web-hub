// Camera director. Overview: one fixed framing of the whole arena ellipse (ARENA from the sim, plus the spawn rim), world x to
// screen right and world z up the screen, pulled back until the near rim fills the frame width and the far rim still sits
// between the HUD bands; the lens shift centres the ellipse in the free band. No follow and no zoom, so everything the
// sim does happens inside the picture. Spectate: a chase camera behind and above one unit, blended in and out.
import { ARENA } from '../sim/battle.js?v=20261120a';
const THREE = window.THREE;
const BZ = window.BZ;

const PITCH = 50 * Math.PI / 180;
const FOV_OVER = 30;
const FOV_CHASE = 58;
const BAND_TOP = 90;    // design px (frame width 360) the HUD takes at the top and bottom, and the side margin
const BAND_BOT = 170;
const SIDE = 8;
const FIT_K = 1.08;     // the spawn rim is at 1.04 to 1.07 of the ellipse
const HEAD = 1.2;       // body height that must still clear the top band at the far rim
const PTS = 48;

export function createCamera(H) {
  const { camera, G } = H;
  const fit = new THREE.PerspectiveCamera(FOV_OVER, 360 / 780, 1, 500);
  const focus = new THREE.Vector3();
  const v = new THREE.Vector3(); const look = new THREE.Vector3(); const pos = new THREE.Vector3();
  let dist = 40; let shift = 0; let key = ''; let blend = 0; let want = 0; let target = 0; let fov = FOV_OVER;
  const C = { focus, get R() { return ARENA.z * FIT_K; }, get dist() { return dist; }, get shift() { return shift; }, mode: 'overview', spectate(uid) { target = uid || 0; want = target ? 1 : 0; H.spectateUid = target; }, update };
  Object.defineProperty(C, 'mode', { get: () => (target ? 'spectate' : 'overview') });

  // NDC bounding box of the fit ring seen from distance d (no lens shift)
  function bbox(d) {
    fit.position.set(0, Math.sin(PITCH) * d, Math.cos(PITCH) * d); fit.lookAt(0, 0, 0); fit.updateMatrixWorld(true);
    let x1 = -9; let y0 = 9; let y1 = -9;
    for (let i = 0; i < PTS; i++) {
      const a = (i / PTS) * Math.PI * 2;
      for (const h of [0, HEAD]) {
        v.set(Math.cos(a) * ARENA.x * FIT_K, h, Math.sin(a) * ARENA.z * FIT_K).project(fit);
        x1 = Math.max(x1, Math.abs(v.x)); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    return { x1, y0, y1 };
  }

  function solve() {
    const { w, h } = H.size; const u = H.size.u || 1;
    const top = 2 * BAND_TOP * u / h; const bot = 2 * BAND_BOT * u / h; const halfX = 1 - SIDE * u / (w / 2); const freeY = 2 - top - bot;
    fit.aspect = w / h; fit.updateProjectionMatrix();
    let lo = 8; let hi = 200;
    for (let i = 0; i < 40; i++) {
      const d = (lo + hi) / 2; const b = bbox(d);
      if (Math.max(b.x1 / halfX, (b.y1 - b.y0) / freeY) > 1) lo = d; else hi = d;
    }
    dist = hi; const b = bbox(dist);
    shift = (-1 + bot + freeY / 2) - (b.y0 + b.y1) / 2;
  }

  function unitOf(B, uid) { return B && B.byUid && B.byUid.get(uid); }

  function update(B, dt) {
    const k = H.size.w + 'x' + H.size.h;
    if (k !== key) { key = k; solve(); }
    blend += (want - blend) * Math.min(1, dt * 3.5); if (Math.abs(want - blend) < 0.001) blend = want;
    const aspect = H.size.w / H.size.h;
    pos.set(0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);
    look.set(0, 0, 0);
    let lens = shift; let fv = FOV_OVER; let fogBase = dist;
    const u = target ? unitOf(B, target) : null;
    if (blend > 0 && u) {
      const uy = u.fly ? 3.2 : 0;
      const bx = -Math.cos(u.face); const bz = -Math.sin(u.face);
      const sc = Math.max(1, H.scaleOf ? H.scaleOf(target) : 1);
      const cx = u.x + bx * 6.5 * sc; const cz = u.z + bz * 6.5 * sc; const cy = uy + 4.6 * sc;
      const lx = u.x - bx * 4 * sc; const lz = u.z - bz * 4 * sc;
      const t = BZ.smooth(blend);
      pos.x += (cx - pos.x) * t; pos.y += (cy - pos.y) * t; pos.z += (cz - pos.z) * t;
      look.x += (lx - look.x) * t; look.y += (uy + 0.8 * sc - look.y) * t; look.z += (lz - look.z) * t;
      fv = FOV_OVER + (FOV_CHASE - FOV_OVER) * t; lens = shift * (1 - t);
      fogBase = dist * (1 - t) + 30 * t;
    } else if (blend === 0 && target && !u) { target = 0; want = 0; }
    fov += (fv - fov) * Math.min(1, dt * 8);
    camera.fov = fov; camera.aspect = aspect; camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -lens;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // the fog starts behind the far rim, so the spawn rim dissolves into the mist
    if (H.scene.fog) { H.scene.fog.near = fogBase + 14; H.scene.fog.far = fogBase + 60; }
    G.player.pos.set(focus.x, 0, focus.z); G.player.yaw = Math.atan2(pos.x - look.x, pos.z - look.z);
  }
  return C;
}
