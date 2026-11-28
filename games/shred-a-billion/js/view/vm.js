// First-person viewmodel: Toolbelt/Sway/{Hand,Bucket,Shovel,Vacuum} from the original prefab (art/vm).
import { V } from '../rev.js';
// The original drives these with ToolMotion springs; here a light procedural version: walk bob, look lag,
// hand dart on grab, bucket dip on scoop, shovel wind-up/thrust from the sim phase, vacuum shake by spin,
// tool tilt while pouring, drop/raise on tool swap. Held_0..23 bills show how full the hand is.
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { buildMaterial } from './scenegraph.js';

const NAMES = ['Hand', 'Bucket', 'Shovel', 'Vacuum'];
// HandTool scene values (mb, Player/CameraPivot/.../Hand): hold pose and held-bill fan
const HT = { holdArm: [-4, 10, 0], holdArmPos: [0, 0.01, 0], holdWrist: [-38, -6, -90], fanStep: 13, fanMax: 88, heldShown: 5, heldSize: 0.9, slotEuler: [0, -90, 0],
  poseRelaxed: { Thumb: 0.14, Index: 0.08, Middle: 0.12, Ring: 0.18, Pinky: 0.24 }, poseHold: { Thumb: 0.74, Index: 0.76, Middle: 0.82, Ring: 0.88, Pinky: 0.92 } };
const D2R = Math.PI / 180;
// Unity local Euler (degrees, applied Z then X then Y) -> three.js quaternion under the z-flip
function uq(e) {
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), e[2] * D2R);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), e[0] * D2R);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e[1] * D2R);
  const q = qy.multiply(qx).multiply(qz);
  return new THREE.Quaternion(-q.x, -q.y, q.z, q.w);
}
const FAN_AXIS = new THREE.Vector3(0, 1, 0);   // fan opens around the slot's up axis (matches clip f06)
// APPROXIMATION: HandTool places the held hand at runtime (meetBias/reachDepth); this lift matches clip f06 by eye
const HOLD_LIFT = [0.15, 0.08, 0.04];
const FINGER_CURL = 75;   // degrees of bend per joint at pose 1 (not in the data; matches the clip's closed grip)

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.01, 20);   // ToolService.viewmodelFov 80, fovMatch 1
    this.scene.add(new THREE.HemisphereLight(0xfff2e0, 0x4a3f38, 2.2));
    const d = new THREE.DirectionalLight(0xfff0d8, 1.6); d.position.set(0.6, 1.5, 0.8); this.scene.add(d);
    this.t = 0; this.dart = 0; this.dip = 0; this.drop = 0; this.lagX = 0; this.lagY = 0;
    this.shown = -1;
  }
  async load(base) {
    const meta = await fetch(base + 'toolbelt.json' + V).then(r => r.json());
    const mats = meta.materials.map(m => buildMaterial(base, m));
    const g = await new GLTFLoader().loadAsync(base + 'toolbelt.glb' + V);
    g.scene.traverse(o => {
      if (o.isMesh) {
        const i = g.parser.json.materials.findIndex(x => x.name === o.material.name);
        if (i >= 0) o.material = mats[i];
        o.frustumCulled = false;
        if (o.userData && o.userData.rendererEnabled === false && !/^Held_/.test(o.name)) o.visible = false;
      }
    });
    this.root = g.scene;
    this.scene.add(this.root);
    this.sway = this.root.getObjectByName('Sway');
    this.tools = NAMES.map(n => this.sway.children.find(c => c.name === n));
    for (const c of this.sway.children) c.visible = false;
    this.models = this.tools.map(t => t && (t.children.find(c => c.name === 'Model') || t));
    this.base = this.models.map(m => m && { p: m.position.clone(), r: m.rotation.clone() });
    this.held = [];
    this.root.traverse(o => { const m = /^Held_(\d+)$/.exec(o.name); if (m) this.held[+m[1]] = o; });
    for (const h of this.held) if (h) h.visible = false;
    this.swayBase = this.sway.position.clone();
    const hand = this.tools[0];
    // GLTFLoader makes duplicate names unique ("Arm_1"), so match the base name inside the Hand subtree
    const find = (n) => { let r = null; hand.traverse(o => { if (!r && new RegExp('^' + n + '(_\\d+)?$').test(o.name)) r = o; }); return r; };
    this.arm = find('Arm'); this.wrist = find('Wrist'); this.fan = find('Fan');
    this.armRest = { q: this.arm.quaternion.clone(), p: this.arm.position.clone() }; this.wristRest = this.wrist.quaternion.clone();
    this.qHoldArm = uq(HT.holdArm); this.qHoldWrist = uq(HT.holdWrist); this.qSlot = uq(HT.slotEuler);
    this.fingers = [];
    hand.traverse(o => { const m = /^(Thumb|Index|Middle|Ring|Pinky)([123])(_\d+)?$/.exec(o.name); if (m) this.fingers.push({ o, f: m[1], rest: o.quaternion.clone() }); });
    this.hold = 0;
    return this;
  }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
  onEvent(e) {
    if (e.type === 'take' && e.tool === 0) this.dart = 1;
    if (e.type === 'take' && e.tool === 1) this.dip = Math.min(1, this.dip + 0.5);
    if (e.type === 'tool') this.drop = 1;
  }
  update(dt, game, player, look) {
    if (!this.root) return;
    this.t += dt;
    const tool = game.tool;
    if (tool !== this.shown) { this.tools.forEach((t, i) => t && (t.visible = i === tool)); this.shown = tool; }
    // look lag + walk bob on the Sway node
    this.lagX += (-look[0] * 0.00025 - this.lagX) * Math.min(1, dt * 10);
    this.lagY += (look[1] * 0.00025 - this.lagY) * Math.min(1, dt * 10);
    const moving = player.grounded && Math.hypot(player.vel[0], player.vel[2]) > 0.5;
    const ph = player.walked * 1.9;
    const bob = moving ? 1 : 0;
    this.drop = Math.max(0, this.drop - dt / 0.25);
    const dropY = Math.sin(this.drop * Math.PI) * -0.12;
    this.sway.position.set(this.swayBase.x + this.lagX + Math.sin(ph) * 0.008 * bob, this.swayBase.y + this.lagY + Math.abs(Math.cos(ph)) * 0.01 * bob + dropY, this.swayBase.z);
    // per-tool motion on the Model node
    const m = this.models[tool], b = this.base[tool];
    if (!m) return;
    m.position.copy(b.p); m.rotation.copy(b.r);
    const pouring = !!game.stream;
    if (tool === 0) {
      this.dart = Math.max(0, this.dart - dt / 0.18);
      const d = Math.sin(this.dart * Math.PI);
      m.position.z -= d * 0.1; m.position.y -= d * 0.03;
      const held = game.handHeld(), cap = Math.max(1, game.handCap(1));
      // hold pose blends in while money is in the hand (HandTool holdArm/holdWrist/poseHold)
      this.hold += ((held > 0 ? 1 : 0) - this.hold) * Math.min(1, dt * 12);
      const h = this.hold;
      this.arm.quaternion.copy(this.armRest.q).slerp(this.armRest.q.clone().multiply(this.qHoldArm), h);
      this.arm.position.set(this.armRest.p.x + (HT.holdArmPos[0] + HOLD_LIFT[0]) * h, this.armRest.p.y + (HT.holdArmPos[1] + HOLD_LIFT[1]) * h, this.armRest.p.z - (HT.holdArmPos[2] - HOLD_LIFT[2]) * h);
      this.wrist.quaternion.copy(this.wristRest).slerp(this.wristRest.clone().multiply(this.qHoldWrist), h);
      for (const f of this.fingers) {
        const c = HT.poseRelaxed[f.f] + (HT.poseHold[f.f] - HT.poseRelaxed[f.f]) * h;
        f.o.quaternion.copy(f.rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), c * FINGER_CURL * D2R * (f.f === 'Thumb' ? 0.5 : 1)));
      }
      // fan: one bill per handful up to heldShown, fanStep apart, capped at fanMax
      const n = held > 0 ? Math.min(HT.heldShown, Math.max(1, Math.round(held / Math.max(1, cap) * HT.heldShown))) : 0;
      const spread = Math.min(HT.fanMax, (n - 1) * HT.fanStep);
      for (let i = 0; i < this.held.length; i++) {
        const b = this.held[i]; if (!b) continue;
        b.visible = i < n;
        if (i < n) {
          const a = (n > 1 ? -spread / 2 + i * spread / (n - 1) : 0) * D2R;
          b.quaternion.copy(this.qSlot).multiply(new THREE.Quaternion().setFromAxisAngle(FAN_AXIS, a));
          b.scale.setScalar(HT.heldSize); b.position.set(0, 0, -i * 0.002);
        }
      }
    } else if (tool === 1) {
      this.dip = Math.max(0, this.dip - dt * 3);
      m.rotation.x -= this.dip * 0.35; m.position.y -= this.dip * 0.04;
    } else if (tool === 2) {
      const sh = game.shovel;
      if (sh.phase === 1) { m.rotation.x += sh.t * 0.55; m.position.z += sh.t * 0.06; }
      else if (sh.phase === 2) { m.rotation.x += (1 - sh.t) * 0.55 - sh.t * 0.5; m.position.z -= sh.t * 0.14; m.position.y -= sh.t * 0.05; }
    } else if (tool === 3) {
      const s = game.vac.spin;
      m.position.x += (Math.random() - 0.5) * 0.004 * s; m.position.y += (Math.random() - 0.5) * 0.004 * s;
    }
    if (pouring) { m.rotation.z += 0.6; m.rotation.x -= 0.3; m.position.y += 0.03; }
  }
}
