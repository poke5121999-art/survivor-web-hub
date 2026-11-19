// Camera director. Overview: a fixed-yaw, 55 degree perspective camera pulled back until every fighter inside the
// arena fits the portrait frame between the top and bottom HUD bands; the lens is shifted so the fight sits in the
// middle of the free band. Spectate: a chase camera behind and above one unit, blended in and out.
const THREE = window.THREE;
const BZ = window.BZ;

const PITCH = 55 * Math.PI / 180;
const YAW = 0.6;
const FOV_OVER = 30;
const FOV_CHASE = 58;
const FRAME_H = 780;
const BAND_TOP = 90 / FRAME_H * 2;
const BAND_BOT = 170 / FRAME_H * 2;
const X_MARGIN = 0.9;
const MIN_R = 9;
const MAX_R = 15;
const ARENA_R = 14;

export function createCamera(H) {
  const { camera, G } = H;
  const fit = new THREE.PerspectiveCamera(FOV_OVER, 360 / 780, 1, 500);
  const focus = new THREE.Vector3(); const wantFocus = new THREE.Vector3();
  const v = new THREE.Vector3(); const look = new THREE.Vector3(); const pos = new THREE.Vector3();
  const ring = []; for (let i = 0; i < 16; i++) ring.push(new THREE.Vector3());
  let R = 11; let dist = 80; let shift = 0.1; let blend = 0; let want = 0; let target = 0; let first = true; let fov = FOV_OVER;
  const C = { focus, mode: 'overview', spectate(uid) { target = uid || 0; want = target ? 1 : 0; }, update };
  Object.defineProperty(C, 'mode', { get: () => (target ? 'spectate' : 'overview') });

  // the bounding box, in NDC, of a ring of radius r (ground and head height) seen from distance d
  function bbox(d, r) {
    fit.aspect = H.size.w / H.size.h; fit.updateProjectionMatrix();
    fit.position.set(focus.x + Math.sin(YAW) * Math.cos(PITCH) * d, Math.sin(PITCH) * d, focus.z + Math.cos(YAW) * Math.cos(PITCH) * d);
    fit.lookAt(focus.x, 0, focus.z); fit.updateMatrixWorld(true);
    let x0 = 9; let x1 = -9; let y0 = 9; let y1 = -9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (const h of [0, 2.6]) {
        v.set(focus.x + Math.cos(a) * r, h, focus.z + Math.sin(a) * r).project(fit);
        if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
      }
    }
    return { x0, x1, y0, y1 };
  }

  function solveOverview() {
    const halfX = X_MARGIN; const halfY = (2 - BAND_TOP - BAND_BOT) / 2;
    let d = dist;
    for (let i = 0; i < 5; i++) {
      const b = bbox(d, R);
      const rx = (b.x1 - b.x0) / 2 / halfX; const ry = (b.y1 - b.y0) / 2 / halfY;
      d *= Math.max(rx, ry, 0.2);
    }
    const b = bbox(d, R);
    // bandCentre = bottom edge + half band height; the lens shift moves the bbox centre there
    const bandC = -1 + BAND_BOT + halfY;
    return { d, shift: bandC - (b.y0 + b.y1) / 2 };
  }

  function unitOf(B, uid) { return B && B.byUid && B.byUid.get(uid); }

  function update(B, dt) {
    const k = Math.min(1, dt * 4);
    // overview focus and radius from the living fighters
    let n = 0; wantFocus.set(0, 0, 0); let maxD = 0;
    if (B) {
      for (const u of B.heroes) if (u.alive) { wantFocus.x += u.x; wantFocus.z += u.z; n++; }
      if (n) { wantFocus.x /= n; wantFocus.z /= n; } else { wantFocus.set(focus.x, 0, focus.z); }
      for (const u of B.heroes) if (u.alive) maxD = Math.max(maxD, Math.hypot(u.x - wantFocus.x, u.z - wantFocus.z));
      for (const u of B.enemies) if (u.alive && Math.hypot(u.x, u.z) <= ARENA_R) maxD = Math.max(maxD, Math.hypot(u.x - wantFocus.x, u.z - wantFocus.z));
    }
    const wantR = Math.min(MAX_R, Math.max(MIN_R, maxD + 1));
    if (first) { focus.copy(wantFocus); R = wantR; }
    focus.x += (wantFocus.x - focus.x) * Math.min(1, dt * 3); focus.z += (wantFocus.z - focus.z) * Math.min(1, dt * 3);
    // zoom out fast so nobody leaves the frame, in slowly so it does not breathe
    R += (wantR - R) * Math.min(1, dt * (wantR > R ? 5 : 1.2));
    const sol = solveOverview();
    if (first) { dist = sol.d; shift = sol.shift; } else { dist += (sol.d - dist) * k; shift += (sol.shift - shift) * k; }

    blend += (want - blend) * Math.min(1, dt * 3.5); if (Math.abs(want - blend) < 0.001) blend = want;
    const aspect = H.size.w / H.size.h;
    pos.set(focus.x + Math.sin(YAW) * Math.cos(PITCH) * dist, Math.sin(PITCH) * dist, focus.z + Math.cos(YAW) * Math.cos(PITCH) * dist);
    look.set(focus.x, 0, focus.z);
    let lens = shift; let fv = FOV_OVER; let fogBase = dist;
    const u = target ? unitOf(B, target) : null;
    if (blend > 0 && u) {
      const uy = u.fly ? 3.2 : 0;
      const bx = -Math.cos(u.face); const bz = -Math.sin(u.face);
      const cx = u.x + bx * 6.5; const cz = u.z + bz * 6.5; const cy = uy + 4.6;
      const lx = u.x - bx * 4; const lz = u.z - bz * 4;
      const t = BZ.smooth(blend);
      pos.x += (cx - pos.x) * t; pos.y += (cy - pos.y) * t; pos.z += (cz - pos.z) * t;
      look.x += (lx - look.x) * t; look.y += (uy + 0.8 - look.y) * t; look.z += (lz - look.z) * t;
      fv = FOV_OVER + (FOV_CHASE - FOV_OVER) * t; lens = shift * (1 - t);
      fogBase = dist * (1 - t) + 30 * t;
    } else if (blend === 0 && target && !u) { target = 0; want = 0; }
    fov += (fv - fov) * Math.min(1, dt * 8);
    camera.fov = fov; camera.aspect = aspect; camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -lens;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // the fog starts where the far rim of the arena is, so the spawn ring dissolves into the mist
    if (H.scene.fog) { H.scene.fog.near = fogBase + 8; H.scene.fog.far = fogBase + 24; }
    G.player.pos.set(focus.x, 0, focus.z); G.player.yaw = Math.atan2(pos.x - look.x, pos.z - look.z);
    first = false;
  }
  return C;
}
