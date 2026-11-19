// Camera director. Overview: one fixed framing of the whole arena ellipse (ARENA from the sim, plus the spawn rim), world x to
// screen right and world z up the screen, pulled back until the near rim fills the frame width and the far rim still sits
// between the HUD bands; the lens shift centres the ellipse in the free band. No follow and no zoom, so everything the
// sim does happens inside the picture. Spectate: a chase camera behind and above one unit, blended in and out.
import { ARENA } from '../sim/battle.js?v=20261120c';
import { FLY_Y } from './keys.js?v=20261120c';
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
const PUSH = 0.028;      // push-in on an ultimate: 2.8% scale about the casting hero, clamped so the rim stays in the frame
const RIM_PAD = 0.012;   // NDC margin kept between the rim and the frame edge while pushing
const SHAKE_PAD = 0.003;
const CHASE_FILL = 0.26; // share of the frame height the followed unit stands tall
const CHASE_FILL_MIN = 0.15; // never pull back so far that the unit gets small, whatever its width
const CHASE_PITCH = 22 * Math.PI / 180;

export function createCamera(H) {
  const { camera, G } = H;
  const fit = new THREE.PerspectiveCamera(FOV_OVER, 360 / 780, 1, 500);
  const focus = new THREE.Vector3();
  const v = new THREE.Vector3(); const look = new THREE.Vector3(); const pos = new THREE.Vector3();
  let dist = 40; let shift = 0; let rim = { x: 0.95, y0: -0.5, y1: 0.7 }; let key = ''; let blend = 0; let want = 0; let target = 0; let fov = FOV_OVER;
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
    rim = { x: b.x1, y0: b.y0 + shift, y1: b.y1 + shift };
  }

  function unitOf(B, uid) { return B && B.byUid && B.byUid.get(uid); }

  // push-in about the casting hero and screen shake, applied to the projection after the lens shift: ndc' = s * ndc + t.
  // The push and pull are clamped so the fit ring of the arena stays inside the frame; a chase view only gets the shake.
  function juiceView(chase) {
    const j = H.juice; if (!j) return;
    const el = camera.projectionMatrix.elements; const { w, h } = H.size;
    let s = 1; let tx = 0; let ty = 0;
    if (!chase && j.push > 0) {
      s = Math.min(1 + PUSH * j.push, (1 - RIM_PAD) / Math.max(rim.x, Math.abs(rim.y0), Math.abs(rim.y1)));
      let hx = 0; let hy = 0;
      if (j.pull.k > 0) { v.set(j.pull.x, 0, j.pull.z).project(camera); hx = v.x; hy = v.y; }
      tx = (1 - s) * hx; ty = (1 - s) * hy;
      tx = Math.max(-(1 - RIM_PAD) + s * rim.x, Math.min((1 - RIM_PAD) - s * rim.x, tx));
      ty = Math.max(-(1 - RIM_PAD) - s * rim.y0, Math.min((1 - RIM_PAD) - s * rim.y1, ty));
    }
    if (j.shake.px > 0) {
      tx += j.shake.x * 2 / w; ty += j.shake.y * 2 / h;
      if (!chase) { tx = Math.max(-(1 - SHAKE_PAD) + s * rim.x, Math.min((1 - SHAKE_PAD) - s * rim.x, tx)); ty = Math.max(-(1 - SHAKE_PAD) - s * rim.y0, Math.min((1 - SHAKE_PAD) - s * rim.y1, ty)); }
    }
    if (s === 1 && tx === 0 && ty === 0) return;
    el[0] *= s; el[5] *= s; el[8] = s * el[8] - tx; el[9] = s * el[9] - ty;
  }

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
      // size the shot by the unit: the distance gives it CHASE_FILL of the frame height, the camera sits behind it on the line
      // from its target (or along its facing) and a little above, and the look point leans toward the target so it stays in view
      const h = Math.max(1.2, H.heightOf ? H.heightOf(target) : 2.7);
      const uy = u.fly ? (FLY_Y[u.kind] || 3.2) : 0;
      const tg = B.byUid.get(u.target); let dx = Math.cos(u.face); let dz = Math.sin(u.face); let dT = 0;
      if (tg && tg.alive) { const ax = tg.x - u.x; const az = tg.z - u.z; dT = Math.hypot(ax, az); if (dT > 0.8) { dx = ax / dT; dz = az / dT; } else dT = 0; }
      // the distance gives the unit CHASE_FILL of the frame height and keeps its widest extent (wings, a saucer) inside the frame width
      const wide = H.widthOf ? H.widthOf(target) : 0;
      const perFill = (f) => h / (2 * Math.tan(FOV_CHASE * Math.PI / 360) * f); // distance that gives height fraction f
      const D = Math.max(5, Math.min(Math.max(perFill(CHASE_FILL), wide * 2.2), perFill(CHASE_FILL_MIN)));
      const cx = u.x - dx * D * Math.cos(CHASE_PITCH); const cz = u.z - dz * D * Math.cos(CHASE_PITCH); const cy = uy + h * 0.5 + D * Math.sin(CHASE_PITCH);
      const ahead = Math.min(dT * 0.5, h * 2.5);
      const lx = u.x + dx * ahead; const lz = u.z + dz * ahead;
      const t = BZ.smooth(blend);
      pos.x += (cx - pos.x) * t; pos.y += (cy - pos.y) * t; pos.z += (cz - pos.z) * t;
      look.x += (lx - look.x) * t; look.y += (uy + h * 0.45 - look.y) * t; look.z += (lz - look.z) * t;
      fv = FOV_OVER + (FOV_CHASE - FOV_OVER) * t; lens = shift * (1 - t);
      fogBase = dist * (1 - t) + 30 * t;
    } else if (blend === 0 && target && !u) { target = 0; want = 0; }
    fov += (fv - fov) * Math.min(1, dt * 8);
    camera.fov = fov; camera.aspect = aspect; camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -lens;
    juiceView(blend > 0 && u);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // the fog starts behind the far rim, so the spawn rim dissolves into the mist
    if (H.scene.fog) { H.scene.fog.near = fogBase + 14; H.scene.fog.far = fogBase + 60; }
    G.player.pos.set(focus.x, 0, focus.z); G.player.yaw = Math.atan2(pos.x - look.x, pos.z - look.z);
  }
  return C;
}
