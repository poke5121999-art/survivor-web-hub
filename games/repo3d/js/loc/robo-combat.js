// Ported verbatim from games/robot-loc-coc/twt/robo-combat.js (origin/main, Xưởng Robot Lóc Cóc, same owner); only the three.js import path changed.
// Combat layer for RoboBody (robo-rig.js): held weapons with both hands on the grips, melee combos, guard, dodge,
// punches, guns (aim, recoil, fire, per-gun reloads, shotgun pump), throws, hit reacts, knockback, and the zombie moves
// (claw combo, lunge, grab, bite / headbutt, spit). Poses follow anticipation -> impact -> follow-through; impacts push
// the body springs so the robot wobbles. Events (impact, fire, release, eject, magout, spit) go to body.ev for the page.
import * as THREE from '../../vendor/three.module.min.js';
import { WEAPONS, WSCALE } from './robo-weapons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (u, a, b, c, d) => sstep(a, b, u) * (1 - sstep(c, d, u));
const lerp = (a, b, t) => a + (b - a) * t;
const Yv = V(0, 1, 0), Zv = V(0, 0, 1);
// gun orientation: barrel (+Z) along dir, rolled so the gun's top stays as close to `up` as it can
function uprightQ(dir, up, out = new THREE.Quaternion()) {
  out.setFromUnitVectors(Zv, dir);
  const a = V(0, 1, 0).applyQuaternion(out); a.addScaledVector(dir, -a.dot(dir)); const b = up.clone().addScaledVector(dir, -up.dot(dir));
  if (a.lengthSq() > 1e-4 && b.lengthSq() > 1e-4) { a.normalize(); b.normalize(); let ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (V().crossVectors(a, b).dot(dir) < 0) ang = -ang; out.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, ang)); }
  return out;
}

// clip table: duration (s) and event times (fraction)
export const ACTS = {
  combo1: { dur: 1.25, ev: [[0.2, 'impact'], [0.52, 'impact'], [0.86, 'impact', 1]], vi: 'Đánh liên hoàn' },
  combo2: { dur: 1.6, ev: [[0.3, 'impact', 1], [0.74, 'impact', 1]], vi: 'Đánh liên hoàn' },
  punch: { dur: 0.95, ev: [[0.2, 'impact'], [0.45, 'impact'], [0.76, 'impact', 1]], vi: 'Đấm' },
  shove: { dur: 0.65, ev: [[0.32, 'impact', 2]], vi: 'Xô ngã' },
  dodgeL: { dur: 0.5, ev: [], vi: 'Né' }, dodgeR: { dur: 0.5, ev: [] },
  reload: { dur: 1.4, ev: [], vi: 'Nạp đạn' },
  pump: { dur: 0.55, ev: [[0.42, 'eject']], vi: 'Lên đạn' },
  throw: { dur: 0.95, ev: [[0.55, 'release']], vi: 'Ném' },
  hitF: { dur: 0.5, ev: [] }, hitB: { dur: 0.5, ev: [] },
  knock: { dur: 1.7, ev: [] },
  claw2: { dur: 1.25, ev: [[0.32, 'impact'], [0.62, 'impact'], [0.9, 'impact', 1]], vi: 'Cào liên hoàn' },
  lunge: { dur: 0.95, ev: [[0.6, 'impact', 1]], vi: 'Vồ' },
  grab: { dur: 1.5, ev: [[0.35, 'impact'], [0.7, 'impact']], vi: 'Túm' },
  bite: { dur: 0.85, ev: [[0.47, 'impact', 1]], vi: 'Húc / cắn' },
  spit: { dur: 1.0, ev: [[0.55, 'spit']], vi: 'Phun' },
};
const RELOAD_DUR = (d) => d.reload || 1.4;

export function installCombat(RB) {
  const pr = RB.prototype;
  pr.setWeapon = function (id) {
    const d = WEAPONS[id] || null; this.weap = d && d.kind !== 'fist' ? id : null; this.wdef = d; this.ammo = d && d.mag ? d.mag : 0;
    this.wM = this.wM || new THREE.Matrix4(); this.g2 = null; this.aim = 0; this.guard = 0; this.pumpZ = 0; this.holdPart = null; this.held = true;
    this.recoil = this.recoil || { x: 0, v: 0 }; this.slideZ = 0; this.slideKick = 0;
    if (this.hide) this.hide[21] = this.weap || (d && d.kind === 'fist') ? 1 : this.hide[21]; // twt prop weapon bone off
  };
  pr.act = function (name, o = {}) {
    if (name === 'combo') name = this.wdef && this.wdef.kind === 'm2' ? 'combo2' : (!this.weap ? 'punch' : 'combo1');
    const a = ACTS[name]; if (!a) return false;
    let dur = a.dur; if (name === 'reload' && this.wdef) dur = RELOAD_DUR(this.wdef);
    this.actS = { name, t: 0, dur: dur * (o.speed ? 1 / o.speed : 1), ev: a.ev, done: 0, o };
    if (name === 'hitF' || name === 'hitB') { const k = o.k || 1, s = name === 'hitF' ? -1 : 1; this.tTilt[0].v += 9 * k * s; this.hRot[0].v += 11 * k * s; this.hRot[2].v += (this.rand() - 0.5) * 14 * k; this.squash.v += 2.5 * k; this.flash = 1; this.eyeFlick = 0.1; }
    if (name === 'knock') { this.tTilt[0].v -= 12; this.squash.v += 3; this.flash = 1; }
    if (name === 'pump') this.pend({ e: 'pumpStart' });
    return true;
  };
  pr.fire = function () {
    const d = this.wdef; if (!d || !d.muzzle || this.actS) return false;
    if (this.ammo <= 0) return false; this.ammo--;
    const kick = { pistol: 9, smg: 4.5, rifle: 14, shotgun: 19 }[d.kind] || 6;
    this.recoil.v += kick; this.tTilt[0].v -= kick * 0.4; this.hRot[0].v -= kick * 0.45; this.squash.v -= kick * 0.1;
    if (d.slide) this.slideKick = 1;
    this.pend({ e: 'fire' });
    if (d.kind !== 'shotgun') this.pend({ e: 'eject' });
    return true;
  };
  // events raised between updates (fire, act) are handed to body.ev at the start of the next update
  pr.pend = function (e) { (this.evPend || (this.evPend = [])).push(e); };
  pr.stepAct = function (dt) {
    const a = this.actS; if (!a) return null;
    const u0 = a.t / a.dur; a.t += dt; const u = Math.min(1, a.t / a.dur);
    for (const [t, e, k] of a.ev) if (u0 < t && u >= t) { this.ev.push({ e, k: k || 0, act: a.name }); this.onEvent(e, k || 0, a.name); }
    if (a.name === 'reload') { if (u0 < 0.24 && u >= 0.24) this.ev.push({ e: 'magout' }); }
    if (u >= 1) { if (a.name === 'reload' && this.wdef) this.ammo = this.wdef.mag; if (a.name === 'throw') this.held = true; this.actS = null; return null; }
    return u;
  };
  pr.onEvent = function (e, k, name) {
    if (e === 'impact') { this.squash.v -= 2 + k * 3; this.tTilt[0].v += 3 + k * 4; if (k) this.hRot[0].v += 6; }
    if (e === 'release') this.held = false;
  };

  // pose of the held weapon (torso space): hand target, weapon axis direction, roll, off hand
  pr.armedStance = function (p) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, Td = T.d, d = this.wdef;
    const w = p.w || (p.w = { pos: V(), dir: V(), roll: 0, oh: 'free', ohPt: V(), ohPos: V() });
    w.roll = 0; w.oh = 'free'; w.ohPos.set(sx + 0.035, sy - A * 0.9, 0.02); w.show = true;
    if (!d) return;
    const k = d.kind;
    if (d.muzzle) { this.gunStance(p, w, d); return; }
    if (k === 'm1') { if (d.two) { w.pos.set(-sx * 0.45, sy - A * 0.45, Td + 0.1); w.dir.set(0.35, 0.85, 0.2); w.oh = 'grip'; } else { w.pos.set(-sx - 0.03, sy - A * 0.62, 0.08); w.dir.set(0, -0.55, 1); } }
    else if (k === 'm2') { w.pos.set(-sx * 0.4, sy - A * 0.55, Td + 0.1); w.dir.set(0.5, 0.75, 0.3); w.oh = 'grip'; }
    else if (k === 'throw') { w.pos.set(-sx - 0.03, sy - A * 0.6, 0.1); w.dir.set(0, 1, 0); w.show = this.held; }
    if (this.guard && (k === 'm1' || k === 'm2')) { w.pos.set(-sx * 0.5, sy + 0.12, Td + 0.16); w.dir.set(1, 0.2, 0.05); w.oh = d.two ? 'grip' : 'free'; w.ohPos.set(sx * 0.35, sy + 0.08, Td + 0.12); p.hip.y -= 0.06 * D.L; p.trot.x += 0.1; p.emote = 'strain'; }
  };
  // guns: long guns blade the body (support shoulder forward), butt in the trigger-side shoulder pocket, cheek on
  // the stock; pistols at the end of a straight arm (one hand) or centred with both arms (isosceles). Writes w.pos =
  // gun origin (the grip) and w.dir = barrel, both in torso space; hands are then put on the grips (solveWeapon).
  pr.gunStance = function (p, w, d) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, Td = T.d, k = d.kind, aim = this.aim, S = WSCALE;
    const dt = Math.min(this.dtNow || 0.016, 0.05), r = this.recoil;
    if (r) { r.v += (-230 * r.x - 17 * r.v) * dt; r.x += r.v * dt; }
    const rx = r ? r.x : 0;
    this.slideKick = Math.max(0, this.slideKick - dt * 9); this.slideZ = -0.045 * Math.sin(Math.min(1, this.slideKick) * Math.PI) * (this.slideKick > 0 ? 1 : 0);
    w.oh = d.two ? 'grip' : 'free'; w.gun = true;
    const long = k === 'rifle' || k === 'shotgun' || k === 'smg';
    const dirR = V(0, 0, 1); let pocket = null, org = null;
    if (long) {
      const blade = aim ? 0.5 : 0.36; p.trot.y -= blade; p.prot.y -= blade * 0.3; p.hrot.y += blade * 0.85;
      if (aim) { pocket = V(-sx * 0.6, sy + 0.005, Td * 0.5); p.hrot.x += 0.2; p.hrot.z -= 0.14; p.trot.x += 0.07; p.hip.y -= 0.03 * D.L; }
      else { pocket = V(-sx * 0.5, sy - 0.06, Td * 0.55); dirR.set(-0.12, -0.42, 0.9); }
      // kick: butt shoves back into the shoulder, muzzle climbs, torso rocks back
      pocket.z -= rx * 0.05; pocket.y += rx * 0.012; dirR.y += rx * 0.22; p.trot.x -= rx * 0.11; p.trot.y += rx * 0.05; p.hrot.x -= rx * 0.12;
    } else { // pistol
      if (aim) {
        if (d.two) { org = V(0.0, sy + 0.035, A * 0.8); p.trot.x += 0.05; }
        else { const b = 0.32; p.trot.y += b; p.hrot.y -= b * 0.9; org = null; }
      } else if (d.two) { org = V(-sx * 0.1, sy - A * 0.38, Td + 0.17); dirR.set(0, -0.6, 0.8); }
      else { org = V(-sx * 0.95, sy - A * 0.55, Td + 0.09); dirR.set(0, -0.75, 0.66); }
      dirR.y += rx * 0.5; p.trot.x -= rx * 0.07; p.hrot.x -= rx * 0.1;
    }
    // desired root-space barrel -> torso space (undo torso yaw and pitch)
    const yaw = p.prot.y + p.trot.y, pit = p.trot.x + p.prot.x;
    w.dir.copy(dirR.normalize()).applyEuler(new THREE.Euler(-pit, -yaw, 0, 'XYZ'));
    const q = uprightQ(w.dir, Yv);
    if (long) org = pocket.clone().sub(V(...d.stock).multiplyScalar(S).applyQuaternion(q));
    else if (!org) org = V(-sx, sy + 0.03, 0).addScaledVector(w.dir, A * 0.86).add(V(0, -0.02 * S, 0));
    if (aim && !long) org.z -= rx * 0.05;
    w.pos.copy(org); w.roll = 0;
    if (aim) p.emote = 'angry';
  };

  // combat clip u 0..1 (writes p.w for weapons, hands for unarmed / zombie)
  pr.combat = function (p, name, u) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, Td = T.d, L = D.L, H = p.hands, w = p.w, d = this.wdef;
    const key = (keys) => { // keys [t, pos[3], dir[3], tw, lean, crouch]; returns blended values into w and body
      let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[i + 1], f = sstep(0, 1, (u - a[0]) / Math.max(1e-4, b[0] - a[0]));
      w.pos.set(lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f));
      w.dir.set(lerp(a[2][0], b[2][0], f), lerp(a[2][1], b[2][1], f), lerp(a[2][2], b[2][2], f));
      p.trot.y += lerp(a[3] || 0, b[3] || 0, f); p.trot.x += lerp(a[4] || 0, b[4] || 0, f); p.hip.y -= lerp(a[5] || 0, b[5] || 0, f) * L;
      p.prot.y += lerp(a[3] || 0, b[3] || 0, f) * 0.4;
    };
    const idle = () => [w.pos.toArray(), w.dir.toArray()];
    switch (name) {
      case 'combo1': {
        const [ip, id] = this._idle || (this._idle = idle());
        key([[0, ip, id], [0.1, [-sx - 0.14, sy + 0.14, -0.04], [-0.6, 0.6, -0.5], 0.55, -0.05], [0.2, [sx * 0.55, sy - 0.02, Td + A * 0.62], [0.9, 0.1, 0.6], -0.6, 0.15, 0.06],
          [0.3, [sx * 0.95, sy - 0.14, Td + A * 0.25], [0.7, -0.4, -0.2], -0.8, 0.12], [0.42, [sx * 0.7, sy + 0.12, Td * 0.5], [0.6, 0.7, -0.3], -0.7, 0],
          [0.52, [-sx * 0.6, sy - 0.04, Td + A * 0.6], [-0.9, 0.1, 0.6], 0.6, 0.15, 0.06], [0.62, [-sx - 0.1, sy - 0.12, Td + A * 0.2], [-0.7, -0.4, -0.2], 0.75, 0.1],
          [0.76, [-sx * 0.3, sy + A * 0.8, -0.04], [0, 0.5, -0.85], 0, -0.18], [0.86, [-sx * 0.1, sy - A * 0.3, Td + A * 0.62], [0, -0.5, 0.85], 0, 0.45, 0.16], [0.94, [-sx * 0.1, sy - A * 0.32, Td + A * 0.6], [0, -0.55, 0.8], 0, 0.4, 0.14], [1, ip, id]]);
        if (d && d.two) w.oh = 'grip'; p.handK = 5; p.emote = 'angry'; this.stepFoot(p, bump(u, 0.12, 0.2, 0.9, 1)); break;
      }
      case 'combo2': {
        const [ip, id] = this._idle || (this._idle = idle());
        key([[0, ip, id], [0.14, [-sx * 0.5, sy + A * 0.6, -0.06], [0.1, 0.4, -0.9], 0, -0.2], [0.3, [-sx * 0.2, sy - A * 0.45, Td + A * 0.55], [0, -0.7, 0.7], 0, 0.55, 0.25], [0.42, [-sx * 0.2, sy - A * 0.47, Td + A * 0.53], [0, -0.72, 0.68], 0, 0.5, 0.24],
          [0.58, [-sx - 0.15, sy, -0.02], [-0.9, 0.2, -0.4], 0.7, 0], [0.74, [sx * 0.4, sy - 0.08, Td + A * 0.55], [0.95, 0, 0.3], -0.8, 0.1, 0.06], [0.86, [sx * 0.9, sy - 0.1, Td * 0.6], [0.6, -0.2, -0.7], -1.0, 0.05], [1, ip, id]]);
        w.oh = 'grip'; p.handK = 4; p.emote = 'strain'; this.stepFoot(p, bump(u, 0.15, 0.3, 0.85, 1)); break;
      }
      case 'punch': {
        const jab = bump(u, 0.08, 0.2, 0.26, 0.36), cross = bump(u, 0.3, 0.45, 0.5, 0.6), upc0 = bump(u, 0.56, 0.64, 0.68, 0.72), upc = bump(u, 0.68, 0.76, 0.82, 0.95);
        const guardL = V(sx * 0.4, sy + 0.04, Td + 0.12), guardR = V(-sx * 0.4, sy + 0.04, Td + 0.12);
        H[0].copy(guardL).lerp(V(sx * 0.2, sy + 0.05, Td + A * 0.85), jab); H[1].copy(guardR).lerp(V(-sx * 0.15, sy + 0.05, Td + A * 0.9), cross).lerp(V(-sx * 0.3, sy - 0.12, Td + 0.18), upc0).lerp(V(-sx * 0.05, sy + 0.22, Td + A * 0.6), upc);
        p.trot.y += 0.25 * jab - 0.5 * cross - 0.3 * upc; p.prot.y += 0.1 * jab - 0.25 * cross; p.trot.x += 0.12 * (jab + cross) - 0.1 * upc; p.hip.y -= 0.06 * L * upc0;
        p.handK = 6; p.emote = 'angry'; this.stepFoot(p, Math.max(jab, cross)); break;
      }
      case 'shove': {
        const k = bump(u, 0.12, 0.32, 0.45, 0.8), pre = bump(u, 0, 0.12, 0.2, 0.32);
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].set(s * sx * 0.4, sy, Td + 0.08).lerp(V(s * sx * 0.45, sy + 0.02, Td + A * 0.88), k); }
        p.trot.x += 0.3 * k - 0.15 * pre; p.hip.y -= 0.08 * L * pre; p.handK = 6; this.stepFoot(p, k); p.emote = 'angry'; break;
      }
      case 'dodgeL': case 'dodgeR': {
        const s = name === 'dodgeL' ? 1 : -1, k = bump(u, 0, 0.25, 0.55, 1);
        p.hip.x += s * 0.26 * L * k; p.hip.y -= 0.18 * L * k; p.prot.z -= s * 0.35 * k; p.trot.z += s * 0.15 * k; p.feet[0].x += s * 0.2 * L * k; p.feet[1].x += s * 0.2 * L * k; p.feet[s > 0 ? 1 : 0].y += 0.05 * bump(u, 0, 0.12, 0.2, 0.35);
        p.hrot.z -= s * 0.2 * k; break;
      }
      case 'reload': this.reloadPose(p, u); break;
      case 'pump': { const k = bump(u, 0.04, 0.38, 0.46, 0.86); this.pumpZ = -0.11 * k; w.oh = 'pump'; w.pos.y -= 0.025 * k; w.pos.z -= 0.02 * k; p.trot.x += 0.05 * k; p.hrot.x += 0.06 * k; this.tTilt[0].v += 0.3 * k; break; }
      case 'throw': {
        const wind = bump(u, 0, 0.42, 0.45, 0.6), thr = bump(u, 0.45, 0.58, 0.7, 1);
        w.pos.set(-sx - 0.03, sy - A * 0.6, 0.1).lerp(V(-sx * 0.6, sy + A * 0.7, -0.14), wind).lerp(V(-sx * 0.1, sy + 0.12, Td + A * 0.78), thr); w.dir.set(0, 1, 0);
        w.oh = 'free'; w.ohPos.lerp(V(sx * 0.4, sy + 0.08, Td + A * 0.55), wind);
        p.trot.y += 0.5 * wind - 0.55 * thr; p.prot.y += 0.2 * wind - 0.2 * thr; p.trot.x += -0.12 * wind + 0.28 * thr; this.stepFoot(p, thr); p.handK = 5; break;
      }
      case 'hitF': case 'hitB': { const k = bump(u, 0, 0.1, 0.3, 1); p.emote = 'dizzy'; p.jitter = Math.max(p.jitter, 0.008 * k); p.hip.y -= 0.05 * L * k; if (name === 'hitF') p.hip.z -= 0.06 * L * k; else p.hip.z += 0.06 * L * k; break; }
      case 'knock': { const k = bump(u, 0, 0.22, 0.6, 1.0); this.poseDown(p, k, -1); p.emote = k > 0.5 ? 'dizzy' : 'scared'; break; }
      // ---- zombie moves (hands in torso space) ----
      case 'claw2': {
        const l0 = bump(u, 0.05, 0.22, 0.24, 0.3), l1 = bump(u, 0.24, 0.32, 0.36, 0.48), r0 = bump(u, 0.36, 0.52, 0.54, 0.58), r1 = bump(u, 0.54, 0.62, 0.66, 0.78), b0 = bump(u, 0.66, 0.8, 0.82, 0.86), b1 = bump(u, 0.82, 0.9, 0.95, 1);
        H[0].lerp(V(sx * 0.95, sy + A * 0.55, -0.04), l0).lerp(V(-sx * 0.15, sy - 0.12, Td + A * 0.75), l1).lerp(V(sx * 0.5, sy + A * 0.75, 0.0), b0).lerp(V(sx * 0.3, sy - A * 0.3, Td + A * 0.7), b1);
        H[1].lerp(V(-sx * 0.95, sy + A * 0.55, -0.04), r0).lerp(V(sx * 0.15, sy - 0.12, Td + A * 0.75), r1).lerp(V(-sx * 0.5, sy + A * 0.75, 0.0), b0).lerp(V(-sx * 0.3, sy - A * 0.3, Td + A * 0.7), b1);
        p.trot.y += 0.4 * l0 - 0.5 * l1 - 0.4 * r0 + 0.5 * r1; p.trot.x += 0.25 * (l1 + r1) - 0.2 * b0 + 0.5 * b1; p.hip.y -= 0.1 * L * b1; p.handK = 6; p.eyeK = 1.5; this.stepFoot(p, Math.max(l1, r1, b1)); break;
      }
      case 'lunge': {
        const c = bump(u, 0, 0.32, 0.36, 0.45), air = bump(u, 0.35, 0.5, 0.55, 0.65), land = bump(u, 0.58, 0.65, 0.75, 1);
        p.hip.y += (-0.3 * c + 0.25 * air - 0.25 * land) * L; p.hip.z += (0.5 * air + 0.55 * land) * L; p.trot.x += 0.4 * c + 0.3 * air + 0.5 * land;
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].lerp(V(s * sx * 0.5, sy + 0.06, Td + A * 0.85), Math.max(air, land)); p.feet[i].z += (0.5 * air + 0.55 * land) * L * (i ? 0.6 : 1); p.feet[i].y += 0.15 * L * air; }
        p.handK = 6; p.eyeK = 1.6; break;
      }
      case 'grab': {
        const k = bump(u, 0.05, 0.3, 0.85, 1), pull = Math.sin(u * 30) * 0.5 + 0.5;
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].lerp(V(s * sx * 0.32, sy + 0.03, Td + A * (0.72 - 0.08 * pull * k)), k); }
        p.trot.x += 0.2 * k; p.hip.z -= 0.03 * L * pull * k; p.jitter = Math.max(p.jitter, 0.012 * k); p.handK = 5; p.eyeK = 1.4; break;
      }
      case 'bite': {
        const back = bump(u, 0.05, 0.35, 0.38, 0.45), snap = bump(u, 0.38, 0.47, 0.55, 0.85);
        p.hrot.x += -0.55 * back + 0.65 * snap; p.trot.x += -0.2 * back + 0.5 * snap; p.hip.z += 0.12 * L * snap; p.hip.y -= 0.05 * L * snap;
        for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; H[i].lerp(V(s * sx * 0.45, sy, Td + A * 0.65), Math.max(back, snap)); }
        p.handK = 4; p.eyeK = 1 + snap; break;
      }
      case 'spit': {
        const back = bump(u, 0.05, 0.45, 0.48, 0.55), jerk = bump(u, 0.5, 0.56, 0.62, 0.9);
        p.hrot.x += -0.6 * back + 0.35 * jerk; p.trot.x += -0.22 * back + 0.3 * jerk; p.squash += 0.04 * back; p.eyeK = 1 + jerk; break;
      }
    }
  };
  pr.stepFoot = function (p, k) { p.feet[1].z += 0.12 * this.D.L * k; p.feet[0].z -= 0.06 * this.D.L * k; p.hip.z += 0.04 * this.D.L * k; };
  pr.reloadPose = function (p, u) {
    const D = this.D, T = D.T, [sx, sy] = T.sh, A = D.a1 + D.a2, Td = T.d, d = this.wdef, w = p.w; if (!d) return;
    const belt = V(sx + 0.03, T.h * 0.18 + 0.0, 0.06);
    w.oh = 'pt'; this.holdPart = null;
    const go = (pt, k) => { w.ohPt.lerp(V(...pt), k); };
    const tilt = bump(u, 0, 0.12, 0.88, 1);
    if (d.kind === 'pistol') {
      w.pos.lerp(V(-sx * 0.1, sy - 0.03, Td + A * 0.4), tilt); w.dir.lerp(V(0.12, 0.22, 0.97), tilt); w.roll = 0.55 * tilt;
      w.ohPt.set(0, -0.1, 0); const out = bump(u, 0.18, 0.3, 0.36, 0.5);
      if (out > 0.01) { w.oh = 'free'; w.ohPos.copy(belt).lerp(V(sx * 0.1, sy - 0.12, Td + A * 0.38), sstep(0.36, 0.5, u)); this.holdPart = u > 0.3 && u < 0.5 ? 'mag' : null; }
      if (u > 0.5 && u < 0.62) { go([0, -0.12 + 0.07 * sstep(0.5, 0.6, u), 0], 1); this.holdPart = 'mag'; }
      if (u > 0.64 && u < 0.92) { const pull = bump(u, 0.7, 0.78, 0.8, 0.88); go([0.0, 0.1, -0.03 - 0.05 * pull], 1); this.slideZ = -0.05 * pull; }
      if (u > 0.6 && u < 0.62) this.squash.v -= 0.8;
      if (u > 0.92) w.oh = d.two ? 'grip' : 'free';
    } else if (d.kind === 'shotgun') {
      w.pos.lerp(V(-sx * 0.3, sy - 0.03, Td + 0.3), tilt); w.dir.lerp(V(0.35, 0.3, 0.9), tilt); w.roll = -0.9 * tilt;
      const n = 4, seg = Math.min(n - 1, Math.floor((u - 0.08) / 0.18)), f = ((u - 0.08) / 0.18) - seg;
      if (u < 0.08) go([0, 0.0, 0.2], 1); else if (u < 0.8) { if (f < 0.5) { w.oh = 'free'; w.ohPos.copy(belt).lerp(V(sx * 0.2, sy - 0.08, Td + 0.18), sstep(0.25, 0.5, f)); this.holdPart = 'shell'; } else { w.ohPt.set(0, -0.0, 0.05); this.holdPart = f < 0.7 ? 'shell' : null; } }
      else { w.oh = 'pump'; const pk = bump(u, 0.82, 0.88, 0.92, 0.98); this.pumpZ = -0.11 * pk; w.pos.y -= 0.02 * pk; if (u > 0.86 && !this._ej) { this._ej = 1; this.ev.push({ e: 'pumpStart' }); } }
      if (u < 0.5) this._ej = 0;
    } else { // smg / rifle: mag out, belt, mag in, charge
      const magZ = d.kind === 'rifle' ? 0.1 : 0.1;
      w.pos.lerp(V(-sx * 0.3, sy - 0.05, Td + 0.3), tilt); w.dir.lerp(V(0.3, 0.32, 0.9), tilt); w.roll = 0.75 * tilt;
      go([0, -0.07, magZ], 1);
      if (u > 0.18 && u < 0.25) { go([0, -0.15, magZ], sstep(0.18, 0.25, u)); }
      const out = bump(u, 0.24, 0.32, 0.38, 0.47);
      if (u > 0.24 && u < 0.47) { w.oh = 'free'; w.ohPos.copy(belt).lerp(V(sx * 0.1, sy - 0.12, Td + 0.18), sstep(0.38, 0.47, u)); this.holdPart = u > 0.33 ? 'mag' : null; }
      if (u >= 0.47 && u < 0.66) { go([0, -0.15 + 0.08 * sstep(0.6, 0.66, u), magZ], 1); this.holdPart = u < 0.64 ? 'mag' : null; }
      if (u >= 0.7 && u < 0.88) { const pull = bump(u, 0.74, 0.8, 0.82, 0.88); w.ohPt.set(0.04, 0.07, 0.0 - 0.07 * pull); }
      if (u >= 0.9) w.oh = 'grip';
      if (u > 0.64 && u < 0.67) this.squash.v -= 0.6;
    }
  };

  // weapon matrix (root space) after the arm IK; g2 = root-space point for the off hand next frame
  pr.solveWeapon = function (p, MT, qTorso, el, wr) {
    const d = this.wdef, w = p.w; if (!d || !d.geo || !w || !w.show) { this.wShown = false; return; }
    const gun = !!d.muzzle;
    if (gun) {
      const dir = V().copy(w.dir).normalize().applyQuaternion(qTorso), q = uprightQ(dir, Yv);
      if (w.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, w.roll));
      this.wM.compose(V().copy(w.pos).applyMatrix4(MT), q, V(WSCALE, WSCALE, WSCALE)); this.wShown = true; this.wQ = q;
      const [sx, sy, sz] = this.D.T.sh, wrist = (pt, side) => { const g = V(...pt).applyMatrix4(this.wM), sh = V(side * sx, sy, sz).applyMatrix4(MT); return g.sub(sh.sub(g).multiplyScalar(-1).normalize().multiplyScalar(0.03)); };
      this.g1 = wrist([0, -0.012, -0.004], -1);
      const pt = w.oh === 'grip' && d.grip2 ? [d.grip2[0], d.grip2[1] - 0.012, d.grip2[2]] : w.oh === 'pump' && d.pump ? [d.pump[0], d.pump[1] - 0.025, d.pump[2] + this.pumpZ] : w.oh === 'pt' ? w.ohPt.toArray() : null;
      this.g2 = pt ? wrist(pt, 1) : null;
      return;
    }
    const dir = V().copy(w.dir).normalize().applyQuaternion(qTorso);
    const q = new THREE.Quaternion().setFromUnitVectors(gun ? Zv : Yv, dir);
    // keep guns upright (roll so weapon up is close to world up), melee keep the edge facing forward
    const upW = V(0, 1, 0).applyQuaternion(q), want = gun ? V(0, 1, 0) : V(0, 0, 1).applyQuaternion(qTorso);
    const ax = gun ? dir : dir; const proj = (v) => v.clone().addScaledVector(ax, -v.dot(ax)).normalize();
    const a = proj(upW), b = proj(gun ? want : V(0, 0, 1).applyQuaternion(q).add(want).normalize());
    if (gun && a.lengthSq() > 0.5 && b.lengthSq() > 0.5) { let ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (V().crossVectors(a, b).dot(ax) < 0) ang = -ang; q.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, ang)); }
    if (w.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, w.roll));
    const fist = V().subVectors(wr, el).normalize().multiplyScalar(0.035).add(wr);
    const o = gun ? fist.clone().sub(V(0, -0.04, 0).applyQuaternion(q)) : fist;
    this.wM.compose(o, q, V(WSCALE, WSCALE, WSCALE)); this.wShown = true; this.wQ = q;
    const pt = w.oh === 'grip' && d.grip2 ? d.grip2 : w.oh === 'pump' && d.pump ? [d.pump[0], d.pump[1] - 0.03, d.pump[2] + this.pumpZ] : w.oh === 'pt' ? w.ohPt.toArray() : null;
    this.g2 = pt ? V(...pt).add(V(0, -0.03, 0)).applyMatrix4(this.wM) : null;
  };
  // world matrices of the parts to draw for this body (root matrix rm): weapon, pump, held mag / shell / thrown object
  pr.weaponDraw = function (rm, out) {
    if (!this.wShown) return;
    const M = new THREE.Matrix4().multiplyMatrices(rm, this.wM); out.push([this.weap, M]);
    const d = this.wdef;
    if (d.pump) out.push(['part:pump', M.clone().multiply(new THREE.Matrix4().makeTranslation(d.pump[0], d.pump[1], d.pump[2] + this.pumpZ))]);
    if (d.slide) out.push(['part:slide', M.clone().multiply(new THREE.Matrix4().makeTranslation(d.slide[0], d.slide[1], d.slide[2] + (this.slideZ || 0)))]);
    if (this.holdPart && this.lw) out.push(['part:' + this.holdPart, new THREE.Matrix4().multiplyMatrices(rm, new THREE.Matrix4().compose(this.lw, this.wQ || new THREE.Quaternion(), V(1, 1, 1).multiplyScalar(WSCALE * (this.holdPart === 'shell' ? 1.8 : 1.15))))]);
  };
  pr.weaponPoint = function (rm, local) { return V(...local).applyMatrix4(this.wM).applyMatrix4(rm); };
}
