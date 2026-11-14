// Two-bone arm IK for two-handed holds (hand-written adapter). Lanternfall only solves the legs (src/25-anim.js:150-207);
// rifles, hoes, spears and poles need the support hand on the shaft whatever the clip does with the leading hand.
// Method follows the leg solver: run the normal FK solve, find where the grip point on the weapon ended up, solve
// shoulder-elbow-wrist with a pole vector, turn each bone's world rotation with rotUV, and solve again with those
// bones in Figure.free (the kit's override slot, 10-kit.js:335).
//
// grip = { side: 1 (left hand) | -1 (right hand), bone: 'wR', point: [x,y,z] rest-space point fixed to that bone,
//          pole: [x,y,z] model-space elbow direction, w: 0..1 }
import { rotUV } from './lf/anim.js';
import { Figure } from './lf/kit.js';

const _p = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const origSolve = Figure.prototype.solve;

export function attachGrip(fig, grip) {
  const n = fig.rig.names, H = fig.rig.head, s = grip.side > 0 ? 'l' : 'r';
  const iU = n[s + 'Up'], iF = n[s + 'Fore'], iH = n[s + 'Hand'], iB = n[grip.bone];
  const L = (a, b) => Math.hypot(H[b * 3] - H[a * 3], H[b * 3 + 1] - H[a * 3 + 1], H[b * 3 + 2] - H[a * 3 + 2]);
  const L1 = L(iU, iF), L2 = L(iF, iH), handOff = 0.05; // hand centre sits ~5 cm past the wrist joint
  const fr = { [iU]: { R: new Array(9), p: [0, 0, 0] }, [iF]: { R: new Array(9), p: [0, 0, 0] }, [iH]: { R: new Array(9), p: [0, 0, 0] } };
  fig.grip = grip;
  fig.solve = function () {
    origSolve.call(this);
    const g = this.grip; if (!g || g.off || !(g.w > 0)) return;
    const W = this.Wp, R = this.R;
    // grip target in model space
    this.bonePoint(iB, g.point[0], g.point[1], g.point[2], _p);
    const sx = W[iU * 3], sy = W[iU * 3 + 1], sz = W[iU * 3 + 2];
    let tx = _p.x - sx, ty = _p.y - sy, tz = _p.z - sz; let d = Math.hypot(tx, ty, tz) || 1e-6;
    // the wrist goes handOff short of the grip point, along shoulder->grip
    const dw = Math.max(0.05, d - handOff); tx *= dw / d; ty *= dw / d; tz *= dw / d; d = dw;
    // blend from the FK wrist toward the target
    const fx = W[iH * 3] - sx, fy = W[iH * 3 + 1] - sy, fz = W[iH * 3 + 2] - sz, w = g.w;
    tx = fx + (tx - fx) * w; ty = fy + (ty - fy) * w; tz = fz + (tz - fz) * w; d = Math.hypot(tx, ty, tz) || 1e-6;
    const dd = Math.min(d, (L1 + L2) * 0.999), ux = tx / d, uy = ty / d, uz = tz / d;
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    let px = g.pole[0], py = g.pole[1], pz = g.pole[2]; const pd = px * ux + py * uy + pz * uz; px -= ux * pd; py -= uy * pd; pz -= uz * pd;
    const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
    const ex = sx + ux * a + px * h, ey = sy + uy * a + py * h, ez = sz + uz * a + pz * h;
    const wx = sx + ux * dd, wy = sy + uy * dd, wz = sz + uz * dd;
    // upper arm: old direction (elbow - shoulder) -> new
    const ox = W[iF * 3] - sx, oy = W[iF * 3 + 1] - sy, oz = W[iF * 3 + 2] - sz, ol = Math.hypot(ox, oy, oz) || 1;
    rotUV(ox / ol, oy / ol, oz / ol, (ex - sx) / L1, (ey - sy) / L1, (ez - sz) / L1, R, iU * 9, fr[iU].R); fr[iU].p[0] = sx; fr[iU].p[1] = sy; fr[iU].p[2] = sz;
    const qx = W[iH * 3] - W[iF * 3], qy = W[iH * 3 + 1] - W[iF * 3 + 1], qz = W[iH * 3 + 2] - W[iF * 3 + 2], ql = Math.hypot(qx, qy, qz) || 1;
    rotUV(qx / ql, qy / ql, qz / ql, (wx - ex) / L2, (wy - ey) / L2, (wz - ez) / L2, R, iF * 9, fr[iF].R); fr[iF].p[0] = ex; fr[iF].p[1] = ey; fr[iF].p[2] = ez;
    // hand keeps its pose relative to the forearm: Rh' = Rf' * (Rf^T * Rh)
    const Rf = R.subarray(iF * 9, iF * 9 + 9), Rh = R.subarray(iH * 9, iH * 9 + 9), Fn = fr[iF].R, M = new Array(9), out = fr[iH].R;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r * 3 + c] = Rf[r] * Rh[c] + Rf[3 + r] * Rh[3 + c] + Rf[6 + r] * Rh[6 + c];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = Fn[r * 3] * M[c] + Fn[r * 3 + 1] * M[3 + c] + Fn[r * 3 + 2] * M[6 + c];
    fr[iH].p[0] = wx; fr[iH].p[1] = wy; fr[iH].p[2] = wz;
    const saved = this.free, merged = Object.assign({}, saved || {}, fr);
    this.free = merged; origSolve.call(this); this.free = saved;
  };
  return fig;
}

// rest-space point of a hand-frame offset (local +Y forward, +Z down), matching theme-kit inHand(side, aim)
export function handPoint(P, side, local, aim) {
  const x = side * (P.sh + 0.03), y = 0.835, a = aim === undefined ? Math.PI / 2 : Math.PI - aim, c = Math.cos(a), s = Math.sin(a);
  return [x + local[0], y + c * local[1] - s * local[2], s * local[1] + c * local[2]];
}
