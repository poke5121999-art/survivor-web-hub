// Code-driven poses of the SHRED A BILLION player avatar for the arrest cinematic (BustedDirector): mugshot (hold the
// placard, head shake, turn to profile, peek), cell (slump, startle, shrug) and the eye blink. Port of PlayerAvatar
// MugshotBegin/Turn/Peek/Blink/End, CellBegin/Startle/Shrug/End and the LateUpdate passes PoseMugshot, PoseCell, Blink
// with their helpers HoldBoard, GripEdge, TwoBoneIK, ShrugArm, Pulse (rules/busted_pose.md has every number and the
// decompile line it comes from).
//
// Usage, once per frame AFTER the AnimationMixer:   mixer.update(dt); pose.update(dt);
// The original applies these on top of the Animator pose in LateUpdate (world-space pre-multiplied bone rotations and a
// two-bone IK), so they must run after the clip has written the bones, every frame, and are never baked into the clip.
//
// Call order the cinematic must follow (BustedDirector, times in seconds from the start of each player's shot, solo;
// with 2+ players every time and length is x0.8):
//   shot start  : place the avatar on the booking mark, then pose.mugshotBegin(placard, 2.8)
//   2.8         : front photo, pose.mugshotBlink()
//   4.5         : pose.mugshotTurn(0.8)            (root yaw turns 90 deg to the avatar's left over 0.8 s, InOutCubic)
//   6.0         : profile photo, pose.mugshotBlink()
//   7.5         : pose.mugshotPeek()               (1.3 s head turn back toward the camera, 52 deg)
//   9.0         : pose.mugshotEnd()                (next player, or the strip)
//   ToCell 0.4  : place the avatar on its cell spot, pose.mugshotEnd(), pose.cellBegin(true)   (EnterCell(false) -> slumped)
//   Cell 2.45   : pose.cellStartle()               (bars shut: door t >= 0.95 with the door started at 1.5)
//   After 0.5   : pose.cellShrug()                 (1.6 s)
//   end         : pose.cellEnd()
//
// Coordinates. All the math below runs on Unity-space numbers so it matches the decompile term by term: a three.js world
// point (x, y, z) is Unity (x, y, -z) and a three.js world quaternion (x, y, z, w) is Unity (-x, -y, z, w) (the same map
// both ways; tools/uenv.py). The avatar.glb was exported with that map applied to every local matrix (F*M*F), so a bone's
// three.js world rotation is exactly the converted Unity world rotation of the same bone: the bone axes the original
// code relies on (hand +Y along the bone, LookRotation for the hand) carry over unchanged. Quaternion products,
// AngleAxis, FromToRotation, Slerp, LookRotation and q*v are the same algebra in both handednesses, so nothing else
// changes: e.g. Unity AngleAxis(+a, right) (nod down) becomes three.js AngleAxis(-a, right) only once it is converted
// back, which setWorldQ does.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Game.Core.Ease.InOutCubic (Game.Core/Ease.c:36-57), clamps t to [0,1]
const inOutCubic = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

// Unity-space helpers (three.js classes, Unity numbers)
const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const _q3 = Q(), _qp = Q(), _v3 = V(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0), FWD = new THREE.Vector3(0, 0, 1);

function getWorldQ(obj, out) {               // Unity world rotation of a three.js object
  obj.getWorldQuaternion(_q3);
  return out.set(-_q3.x, -_q3.y, _q3.z, _q3.w);
}
function getWorldP(obj, out) {               // Unity world position
  obj.getWorldPosition(out); out.z = -out.z; return out;
}
function setWorldQ(obj, qU) {                // Transform.rotation = qU
  _q3.set(-qU.x, -qU.y, qU.z, qU.w);
  if (obj.parent) { obj.parent.getWorldQuaternion(_qp); obj.quaternion.copy(_qp.invert().multiply(_q3)); }
  else obj.quaternion.copy(_q3);
  obj.updateMatrixWorld(true);
}
function angleAxis(deg, axis, out) { return out.setFromAxisAngle(_v3.copy(axis).normalize(), deg * DEG); }
function fromTo(a, b, out) { return out.setFromUnitVectors(a.clone().normalize(), b.clone().normalize()); }
function slerp(a, b, t, out) { return out.copy(a).slerp(b, clamp01(t)); }
function lookRotation(f, u, out) {           // UnityEngine.Quaternion.LookRotation(forward, up)
  const z = f.clone().normalize(), x = V().crossVectors(u, z);
  if (x.lengthSq() < 1e-12) return fromTo(FWD, z, out);
  x.normalize(); const y = V().crossVectors(z, x);
  _m.makeBasis(x, y, z); return out.setFromRotationMatrix(_m);
}

// UnityEngine.Bounds of the placard when MugshotBegin finds no MeshFilter mesh (PlayerAvatar.c:4888-4900).
const DEFAULT_BOX = { center: [0, 0, 0], extents: [0.24, 0.16, 0.01] };
// Static PlayerAvatar.GloveGrip (cctor, PlayerAvatar.c:1312-1314)
const GLOVE_GRIP = new THREE.Vector3(0, 0.07, 0);

export class AvatarPose {
  // avatarRoot: the object that plays the PlayerAvatar transform (node "Avatar" of art/avatar/avatar.glb; its forward is
  // three.js -Z). opts.autoBlink (default true): the idle blink every 2-5.5 s that Blink() runs on every avatar.
  constructor(avatarRoot, opts = {}) {
    this.root = avatarRoot;
    const b = (n) => avatarRoot.getObjectByName(n) || null;
    this.chest = b('Chest'); this.neck = b('Neck'); this.head = b('Head'); this.eyeL = b('Eye_L'); this.eyeR = b('Eye_R');
    this.armUpperL = b('UpperArm_L'); this.armLowerL = b('LowerArm_L'); this.handL = b('Hand_L');
    this.armUpperR = b('UpperArm_R'); this.armLowerR = b('LowerArm_R'); this.handR = b('Hand_R');
    this.autoBlink = opts.autoBlink !== false;
    this.random = opts.random || Math.random;
    this.now = 0;
    this.reset();
    // Awake: blink axis = the eye's local axis closest to head.up (PlayerAvatar.c:2322-2382); first blink in 1.5..4 s
    this.blinkAxis = new THREE.Vector3(0, 1, 0);
    if (this.eyeL && this.head) {
      avatarRoot.updateMatrixWorld(true);
      const hu = UP.clone().applyQuaternion(this.head.getWorldQuaternion(Q()));
      const l = hu.applyQuaternion(this.eyeL.getWorldQuaternion(Q()).invert());
      const ax = Math.abs(l.x), ay = Math.abs(l.y), az = Math.abs(l.z);
      this.blinkAxis.set(0, 0, 0);
      if (ax <= ay || ax <= az) { if (ay <= az) this.blinkAxis.z = 1; else this.blinkAxis.y = 1; } else this.blinkAxis.x = 1;
    }
    this.nextBlink = this.now + 1.5 + this.random() * 2.5;
  }

  reset() {
    this.mug = false; this.mugBoard = null; this.mugAt = 0; this.mugSettle = 0.8;
    this.mugTurnAt = -1; this.mugTurnLen = 0.45; this.mugYaw = 0; this.mugPeekAt = -1;
    this.mugBox = { center: V(), extents: V() };
    this.cell = false; this.cellSlump = 0; this.cellSlumpTo = 0; this.cellStartAt = -1; this.cellShrugAt = -1;
    this.blinkT = -1;
  }

  // ---- triggers (PlayerAvatar.c line ranges) ----

  // MugshotBegin(Transform board, float settle = 0.8)  :4823-4968. board: the placard Object3D, or null (no hold).
  // opts.box = { center:[x,y,z], extents:[x,y,z] } in Unity board-local units overrides the bounds; otherwise the
  // board's own geometry bounds (MeshFilter.sharedMesh.bounds), else DEFAULT_BOX.
  mugshotBegin(board = null, settle = 0.8, opts = {}) {
    if (this.cell) this.cellEnd();
    this.mug = true; this.mugBoard = board;
    let box = opts.box || null;
    if (!box && board && board.isMesh && board.geometry) {
      const g = board.geometry; if (!g.boundingBox) g.computeBoundingBox();
      const c = g.boundingBox.getCenter(V()), e = g.boundingBox.getSize(V()).multiplyScalar(0.5);
      box = { center: [c.x, c.y, -c.z], extents: [e.x, e.y, e.z] };
    }
    box = box || DEFAULT_BOX;
    this.mugBox.center.fromArray(box.center); this.mugBox.extents.fromArray(box.extents);
    this.mugAt = this.now;
    this.mugSettle = Math.max(0.3, settle);
    this.mugPeekAt = -1; this.mugTurnAt = -1;
    const f = FWD.clone().applyQuaternion(getWorldQ(this.root, Q()));
    this.mugYaw = Math.atan2(f.x, f.z) / DEG;               // transform.eulerAngles.y
  }
  // MugshotTurn(float seconds) :5026-5048
  mugshotTurn(seconds = 0.8) { this.mugTurnAt = this.now; this.mugTurnLen = Math.max(0.1, seconds); }
  // MugshotPeek() :5007-5024
  mugshotPeek() { this.mugPeekAt = this.now; }
  // MugshotBlink() :4970-4979 (starts one blink now)
  mugshotBlink() { this.blinkT = 0; }
  blink() { this.blinkT = 0; }
  // MugshotEnd() :4981-5005
  mugshotEnd() {
    if (!this.mug) return;
    this.mug = false; this.mugBoard = null; this.mugPeekAt = -1; this.mugTurnAt = -1;
  }
  // CellBegin(bool slumped) :3059-3106. The arrest calls it with slumped = true.
  cellBegin(slumped = true) {
    if (this.mug) this.mugshotEnd();
    this.cell = true;
    this.cellSlumpTo = this.cellSlump = slumped ? 1 : 0;
    this.cellShrugAt = -1; this.cellStartAt = -1;
  }
  poseCell(slumped = true) { this.cellBegin(slumped); }
  // CellStartle() :3151-3170 (bars slam: straighten up with a jolt, blink)
  cellStartle() { this.cellStartAt = this.now; this.cellSlumpTo = 0; this.blinkT = 0; }
  // CellShrug() :3132-3149
  cellShrug() { this.cellShrugAt = this.now; }
  // CellEnd() :3108-3130
  cellEnd() { if (this.cell) { this.cell = false; this.cellShrugAt = -1; this.cellStartAt = -1; } }

  // ---- per frame (LateUpdate :4205-4510 calls PoseMugshot, PoseCell, ..., Blink in this order) ----
  update(dt) {
    this.now += dt;
    this.root.updateMatrixWorld(true);
    this._poseMugshot();
    this._poseCell(dt);
    this._blink(dt);
  }

  // Pulse(at, len, edge = 0.25) :1618-1652: 0 -> 1 -> 0 over len with smoothstep edges of edge*len
  _pulse(at, len, edge = 0.25) {
    if (at < 0) return 0;
    let u = (this.now - at) / len;
    if (!(u > 0 && u < 1)) return 0;
    u = clamp01(Math.min(u, 1 - u) / edge);
    return u * u * (3 - 2 * u);
  }

  // PoseMugshot() :7299-7516
  _poseMugshot() {
    if (!this.mug) return;
    let t = this.now - this.mugAt;
    if (this.mugTurnAt >= 0) {
      const e = inOutCubic((this.now - this.mugTurnAt) / this.mugTurnLen);
      setWorldQ(this.root, angleAxis(this.mugYaw - e * 90, UP, Q()));   // Quaternion.Euler(0, yaw - 90e, 0)
    }
    const rq = getWorldQ(this.root, Q());
    const fwd = FWD.clone().applyQuaternion(rq), right = RIGHT.clone().applyQuaternion(rq), up = UP;
    const peek = this._pulse(this.mugPeekAt, 1.3, 0.25);
    // "hb": the lift/nod bump, sin(pi * clamp01((t - 0.15) / 0.6)), at least 0.7 * peek
    const hb = Math.max(Math.sin(clamp01((t - 0.15) / 0.6) * Math.PI), peek * 0.7);
    // head shake before the turn: one sine cycle between 28% and 86% of settle
    let shake = 0;
    if (this.mugTurnAt < 0) {
      const u = t / this.mugSettle;
      if (u > 0.28 && u < 0.86) shake = Math.sin(2 * Math.PI * (u - 0.28) / 0.58);
    }
    if (this.head) {
      const a = angleAxis(shake * 17 + peek * 52, up, Q());
      const b = angleAxis(hb * 7, fwd, Q()), c = angleAxis(hb * -4, right, Q());
      const d = a.multiply(b).multiply(c);
      setWorldQ(this.head, d.multiply(getWorldQ(this.head, Q())));
    }
    if (this.mugBoard && this.chest) this._holdBoard(this.mugBoard, this.chest, fwd, right, up, hb);
  }

  // HoldBoard(board, box, chest, fwd, right, up, shrug) :3929-4203
  _holdBoard(board, chest, fwd, right, up, shrug) {
    const q = lookRotation(fwd, up, Q()).multiply(angleAxis(-6, RIGHT, Q()));       // BoardTilt 6
    const anchor = getWorldP(chest, V()).addScaledVector(fwd, 0.27)                // BoardAhead
      .addScaledVector(up, -(0.06 - shrug * 0.03));                                // BoardDrop, BoardShrugLift
    const ls = board.getWorldScale(V());
    const pos = anchor.clone().sub(this.mugBox.center.clone().multiply(ls).applyQuaternion(q));
    this._setBoard(board, pos, q);
    const bx = RIGHT.clone().applyQuaternion(q), by = UP.clone().applyQuaternion(q), bz = FWD.clone().applyQuaternion(q);
    const half = this.mugBox.extents.x * ls.x + 0;                                 // GripOutset 0
    const gl = anchor.clone().addScaledVector(bx, -half).addScaledVector(by, -0.03);   // GripDown
    const gr = anchor.clone().addScaledVector(bx, half).addScaledVector(by, -0.03);
    this._gripEdge(this.armUpperL, this.armLowerL, this.handL, gl, bx, by, bz, -1, fwd, right, up);
    this._gripEdge(this.armUpperR, this.armLowerR, this.handR, gr, bx, by, bz, 1, fwd, right, up);
  }
  _setBoard(board, posU, qU) {                 // Transform.SetPositionAndRotation (world)
    const p3 = new THREE.Vector3(posU.x, posU.y, -posU.z), q3 = new THREE.Quaternion(-qU.x, -qU.y, qU.z, qU.w);
    const s = board.scale.clone();
    if (board.parent) {
      board.parent.updateWorldMatrix(true, false);
      const inv = board.parent.matrixWorld.clone().invert();
      p3.applyMatrix4(inv); q3.premultiply(board.parent.getWorldQuaternion(Q()).invert());
    }
    board.position.copy(p3); board.quaternion.copy(q3);
    if (!board.matrixAutoUpdate) board.matrix.compose(p3, q3, s);
    board.updateMatrixWorld(true);
  }

  // GripEdge(upper, lower, hand, grip, bx, by, bz, side, fwd, right, up) :3544-3776
  _gripEdge(upper, lower, hand, grip, bx, by, bz, side, fwd, right, up) {
    if (!upper || !lower || !hand) return;
    const p = bz.clone().addScaledVector(bx, -side * 0.3).addScaledVector(by, -0.05).normalize();
    const u = bx.clone().addScaledVector(p, -p.dot(bx)).normalize();
    const c = V().crossVectors(u, p);
    const H = lookRotation(c, p, Q());                                              // hand: +Y along p, +Z along c
    const target = grip.clone().sub(GLOVE_GRIP.clone().applyQuaternion(H));
    const pole = up.clone().multiplyScalar(-0.85).addScaledVector(right, side * 0.45).addScaledVector(fwd, -0.25);
    this._twoBoneIK(upper, lower, hand, target, pole);
    // give half of the wrist twist (about the forearm) to the forearm, then set the hand
    const d = getWorldP(hand, V()).sub(getWorldP(lower, V()));
    if (d.lengthSq() > 1e-8) {
      d.normalize();
      const delta = H.clone().multiply(getWorldQ(hand, Q()).invert());
      const k = delta.x * d.x + delta.y * d.y + delta.z * d.z;
      const tw = new THREE.Quaternion(d.x * k, d.y * k, d.z * k, delta.w);
      const n = Math.hypot(tw.x, tw.y, tw.z, tw.w);
      if (n > 1e-5) {
        tw.set(tw.x / n, tw.y / n, tw.z / n, tw.w / n);
        const half = slerp(Q(), tw, 0.5, Q());
        setWorldQ(lower, half.multiply(getWorldQ(lower, Q())));
      }
    }
    setWorldQ(hand, H);
  }

  // TwoBoneIK(upper, lower, hand, target, pole) :11769-12008
  _twoBoneIK(upper, lower, hand, target, pole) {
    const pu = getWorldP(upper, V()), pl = getWorldP(lower, V()), ph = getWorldP(hand, V());
    const a = pu.distanceTo(pl), b = pl.distanceTo(ph);
    if (a < 1e-4 || b < 1e-4) return;
    const tv = target.clone().sub(pu);
    const dir = tv.lengthSq() <= 1e-8 ? new THREE.Vector3(0, -1, 0) : tv.clone().normalize();
    const lo = Math.abs(a - b) + 0.001, hi = a + b - 0.001, m = tv.length();
    const dist = m < lo ? lo : m > hi ? hi : m;
    let pp = pole.clone().addScaledVector(dir, -dir.dot(pole));
    if (pp.lengthSq() < 1e-8) pp = V().crossVectors(dir, RIGHT);
    pp.normalize();
    const cosA = Math.max(-1, Math.min(1, (dist * dist + a * a - b * b) / (2 * a * dist)));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = pu.clone().addScaledVector(dir, cosA * a).addScaledVector(pp, sinA * a);
    setWorldQ(upper, fromTo(pl.clone().sub(pu), elbow.sub(pu), Q()).multiply(getWorldQ(upper, Q())));
    const pl2 = getWorldP(lower, V()), ph2 = getWorldP(hand, V());
    const want = pu.clone().addScaledVector(dir, dist).sub(pl2);
    setWorldQ(lower, fromTo(ph2.sub(pl2), want, Q()).multiply(getWorldQ(lower, Q())));
  }

  // PoseCell() :7087-7297
  _poseCell(dt) {
    if (!this.cell) return;
    const step = dt / 0.4, diff = this.cellSlumpTo - this.cellSlump;               // MoveTowards, 0.4 s for 0..1
    this.cellSlump = Math.abs(diff) > step ? this.cellSlump + Math.sign(diff) * step : this.cellSlumpTo;
    let jolt = 0;
    if (this.cellStartAt >= 0) {
      const x = (this.now - this.cellStartAt) * 2;                                // 0.5 s
      if (x < 1) jolt = Math.sin(x * Math.PI) * (1 - x);
    }
    const s = this.cellSlump - jolt * 0.7;
    const shrug = this._pulse(this.cellShrugAt, 1.6, 0.25);
    const rq = getWorldQ(this.root, Q());
    const fwd = FWD.clone().applyQuaternion(rq), right = RIGHT.clone().applyQuaternion(rq), up = UP;
    if (this.chest) setWorldQ(this.chest, angleAxis(s * 9, right, Q()).multiply(getWorldQ(this.chest, Q())));
    if (this.head) {
      const h = angleAxis(s * 22, right, Q()).multiply(angleAxis(shrug * 9, fwd, Q()));
      setWorldQ(this.head, h.multiply(getWorldQ(this.head, Q())));
    }
    if (shrug > 0) {
      this._shrugArm(this.armUpperL, this.armLowerL, this.handL, fwd, right.clone().negate(), up, shrug);
      this._shrugArm(this.armUpperR, this.armLowerR, this.handR, fwd, right, up, shrug);
    }
  }

  // ShrugArm(upper, lower, hand, fwd, outward, up, weight) :10144-10325
  _shrugArm(upper, lower, hand, fwd, out, up, w) {
    if (!upper || !lower || !hand) return;
    const du = up.clone().multiplyScalar(-0.8).addScaledVector(out, 0.5).addScaledVector(fwd, 0.18).normalize();
    const dl = up.clone().multiplyScalar(0.3).addScaledVector(out, 0.8).addScaledVector(fwd, 0.52).normalize();
    let r = getWorldQ(upper, Q());
    const from = getWorldP(lower, V()).sub(getWorldP(upper, V()));
    setWorldQ(upper, slerp(r, fromTo(from, du, Q()).multiply(r.clone()), w, Q()));
    r = getWorldQ(lower, Q());
    const from2 = getWorldP(hand, V()).sub(getWorldP(lower, V()));
    setWorldQ(lower, slerp(r, fromTo(from2, dl, Q()).multiply(r.clone()), w, Q()));
  }

  // Blink() :2671-2802: 0.14 s, eye scale along blinkAxis 1 -> 0.08 -> 1; next idle blink 0.22 s (20%) or 2..5.5 s
  _blink(dt) {
    if (!this.eyeL && !this.eyeR) return;
    if (this.autoBlink && this.blinkT < 0 && this.nextBlink <= this.now) this.blinkT = 0;
    let open = 1;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const u = this.blinkT / 0.14;
      open = u < 0.5 ? 1 - 0.92 * clamp01(u * 2) : 0.08 + 0.92 * clamp01((u - 0.5) * 2);
      if (u >= 1) {
        this.blinkT = -1; open = 1;
        this.nextBlink = this.now + (this.random() < 0.2 ? 0.22 : 2 + this.random() * 3.5);
      }
    }
    const k = open - 1, ax = this.blinkAxis;
    for (const e of [this.eyeL, this.eyeR]) if (e) e.scale.set(1 + k * ax.x, 1 + k * ax.y, 1 + k * ax.z);
  }
}
