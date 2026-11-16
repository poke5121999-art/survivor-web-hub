// The original crew line-up and playground (from ../js/app.js), as two modes of the combined page. Uses the per-part
// Bot of ../js/bot.js (each robot its own meshes), so these modes are the detailed showcase, not the crowd renderer.
import * as THREE from '../vendor/three.module.min.js';
import { Bot, ANIMS } from '../js/bot.js';
import { makeSpec } from '../js/crew.js';
import { crateGeo } from '../js/parts.js';
import { crateMat } from '../js/bot.js';

export { ANIMS };
export const CREW_ANIM_VI = { idle: 'Đứng yên', walk: 'Đi bộ', run: 'Chạy', jump: 'Nhảy lên', carry: 'Bê đồ nặng', fall: 'Ngã rồi dậy', wave: 'Vẫy tay', dance: 'Nhảy nhót', scared: 'Run sợ', sleep: 'Ngủ gật' };

function blobTex() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(0.5, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
function stripeTex() { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#e8b923'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#1b1b1d'; for (let i = -2; i < 18; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16 + 8, 32); g.lineTo(i * 16 + 24, 0); g.lineTo(i * 16 + 16, 0); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }

export class CrewModes {
  constructor(scene) {
    this.scene = scene; this.root = new THREE.Group(); scene.add(this.root); this.bots = []; this.mode = null; this.BLOB = blobTex(); this.anim = 'idle'; this.emote = null; this.seed = 1;
    this.PG = { half: 3.2, crate: null, carriers: [], state: 'approach', t: 0, target: new THREE.Vector3(), yaw: 0, cv: 0, wanderers: [] };
  }
  clear() { for (const b of this.bots) b.dispose(); this.bots = []; while (this.root.children.length) this.root.remove(this.root.children[0]); this.mode = null; }
  lineup(n) {
    this.clear(); this.mode = 'crew';
    const portrait = innerWidth / innerHeight < 0.85;
    n = n || (portrait ? 16 : 32);
    const st = new THREE.Group(); this.root.add(st);
    for (let i = 0; i < n; i++) { const b = new Bot(makeSpec(this.seed * 1000 + i), { blobTex: this.BLOB }); b.idx = i; b.treadmill = true; this.root.add(b.root); this.bots.push(b); b.setAnim(this.anim); b.emote = this.emote; }
    const cols = portrait ? 4 : 8, rows = Math.ceil(n / cols), sx = 0.8, sz = 1.05;
    this.bots.forEach((b, i) => { const r = Math.floor(i / cols), c = i % cols; const x = (c - (cols - 1) / 2) * sx + (r % 2 ? sx * 0.25 : -sx * 0.25) * (portrait ? 0.6 : 1), z = -r * sz + (rows - 1) * sz * 0.5; b.home = new THREE.Vector3(x, 0, z); b.homeYaw = 0; b.root.position.copy(b.home); });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(cols * sx + 1.2, 0.04, rows * sz + 0.8), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.3 })); plat.position.y = -0.021; plat.receiveShadow = true; st.add(plat);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(cols * sx + 1.2, 0.1), new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6 })); edge.rotation.x = -Math.PI / 2; edge.position.set(0, 0.002, rows * sz / 2 + 0.38); st.add(edge);
    return { w: cols * sx, d: rows * sz };
  }
  play() {
    this.clear(); this.mode = 'play'; const PG = this.PG, H = PG.half, play = this.root;
    const railM = new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.5, metalness: 0.4 }), postM = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6, metalness: 0.5 });
    for (const [x, z, w, d] of [[0, -H, 2 * H, 0.06], [0, H, 2 * H, 0.06], [-H, 0, 0.06, 2 * H], [H, 0, 0.06, 2 * H]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), railM); r.position.set(x, 0.32, z); r.castShadow = true; play.add(r); }
    for (let i = -4; i <= 4; i++) for (const [x, z] of [[i * H / 4, -H], [i * H / 4, H], [-H, i * H / 4], [H, i * H / 4]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 8), postM); p.position.set(x, 0.17, z); p.castShadow = true; play.add(p); }
    const zone = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 4, 1), new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.6 })); zone.rotation.x = -Math.PI / 2; zone.rotation.z = Math.PI / 4; zone.position.y = 0.004; play.add(zone); PG.zone = zone;
    for (const [x, z, s] of [[-2.6, -2.5, 0.5], [-2.1, -2.7, 0.35], [2.6, 2.5, 0.45], [2.7, -2.4, 0.3]]) { const b = new THREE.Mesh(crateGeo(s, s * 0.8, s), crateMat()); b.position.set(x, s * 0.4, z); b.rotation.y = x * 2; b.castShadow = b.receiveShadow = true; play.add(b); }
    PG.crate = new THREE.Mesh(crateGeo(0.42, 0.3, 0.32), crateMat()); PG.crate.castShadow = true; PG.crate.receiveShadow = true; play.add(PG.crate);
    PG.crate.position.set(0, 0.15, 0); PG.state = 'approach'; PG.t = 0; PG.yaw = 0; PG.crate.rotation.set(0, 0, 0); this.newTarget();
    for (let i = 0; i < 7; i++) {
      const b = new Bot(makeSpec(this.seed * 1000 + 500 + i), { blobTex: this.BLOB }); b.treadmill = false; b.setAnim('idle'); b.maxSpeed = 0.45 + Math.random() * 0.25;
      const a = i / 7 * Math.PI * 2; b.root.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8); b.root.rotation.y = Math.random() * 6; play.add(b.root); this.bots.push(b); b.idx = i;
      b.ai = { t: Math.random() * 2, cool: 0, emoT: 0, role: i < 2 ? 'carrier' : 'wander' };
    }
    PG.carriers = this.bots.slice(0, 2); PG.wanderers = this.bots.slice(2);
  }
  newTarget() { const PG = this.PG, H = PG.half - 0.9; for (let k = 0; k < 20; k++) { PG.target.set((Math.random() * 2 - 1) * H, 0, (Math.random() * 2 - 1) * H); if (PG.target.distanceTo(PG.crate.position) > 1.6) break; } PG.zone.position.set(PG.target.x, 0.004, PG.target.z); }
  setAnim(a) { this.anim = a; for (const b of this.bots) { if (this.mode === 'play' && (a === 'walk' || a === 'run')) { b.goal = new THREE.Vector3((Math.random() * 2 - 1) * 2.5, 0, (Math.random() * 2 - 1) * 2.5); b.maxSpeed = a === 'run' ? 1.1 : 0.45; b.setAnim('idle'); } else b.setAnim(a); } }
  setEmote(e) { this.emote = e === 'auto' ? null : e; for (const b of this.bots) b.emote = this.emote; }
  update(dt, cam) { if (this.mode === 'play') this.stepPlay(dt); for (const b of this.bots) b.update(dt, cam); }
  stepPlay(dt) {
    const PG = this.PG, c = PG.crate, [A, B] = PG.carriers, H = PG.half - 0.35; PG.t += dt;
    const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
    const tempEmote = (b, e, d) => { b.emote = e; b.ai.emoT = d; };
    const crateHandles = (b, side) => { const w = 0.42, out = []; for (const s of [1, -1]) out.push(new THREE.Vector3(side * (w / 2 + 0.01), 0.04, s * 0.09).applyEuler(c.rotation).add(c.position)); const right = tmpV.set(Math.cos(b.root.rotation.y), 0, -Math.sin(b.root.rotation.y)); return out[0].clone().sub(b.root.position).dot(right) > out[1].clone().sub(b.root.position).dot(right) ? out : [out[1], out[0]]; };
    const axis = tmpV2.set(Math.cos(PG.yaw), 0, -Math.sin(PG.yaw));
    const standOff = (b) => 0.21 + b.T.d + 0.12;
    const knocked = A.rag || A.getup || B.rag || B.getup;
    const place = (b, side) => { b.goal = c.position.clone().addScaledVector(axis, side * standOff(b)); b.goal.y = 0; b.face = Math.atan2(c.position.x - b.root.position.x, c.position.z - b.root.position.z); };
    if (PG.state === 'approach') {
      for (const b of [A, B]) b.carry = null;
      if (!knocked) { place(A, 1); place(B, -1); }
      if (!knocked && A.goal && A.root.position.distanceTo(A.goal) < 0.09 && B.root.position.distanceTo(B.goal) < 0.09) { PG.state = 'lift'; PG.t = 0; }
    } else if (PG.state === 'lift' || PG.state === 'move') {
      if (knocked) { PG.state = 'drop'; PG.t = 0; PG.cv = 0; for (const b of [A, B]) { b.carry = null; if (!b.rag && !b.getup) tempEmote(b, 'scared', 1.2); } }
      else {
        const k = PG.state === 'lift' ? Math.min(1, PG.t / 0.9) : 1;
        const hh = [A, B].map((b) => b.H - 0.15 * b.L + b.torsoY + b.T.sh[1] - (b.a1 + b.a2) * 0.55 + (b.pelvis.position.y - b.H) * 0.8);
        c.position.y = 0.15 + (Math.max(0.3, (hh[0] + hh[1]) / 2) - 0.15) * (k * k * (3 - 2 * k)); c.rotation.set(0, PG.yaw, Math.atan2(hh[0] - hh[1], 0.8) * k * 0.8 + Math.sin(PG.t * 9) * 0.01 * k);
        if (PG.state === 'lift') { if (PG.t > 1.0) { PG.state = 'move'; PG.t = 0; } }
        else {
          const to = tmpV.subVectors(PG.target, c.position).setY(0), d = to.length();
          const yawT = Math.atan2(-to.z, to.x); const dy = Math.atan2(Math.sin(yawT - PG.yaw), Math.cos(yawT - PG.yaw)); PG.yaw += dy * Math.min(1, dt * 1.2);
          if (Math.abs(dy) < 0.5 && d > 0.05) { const sp = Math.min(0.32, d) * (1 - Math.abs(dy)); c.position.addScaledVector(to.normalize(), sp * dt); }
          if (d < 0.08) { PG.state = 'drop'; PG.t = 0; PG.cv = 0; PG.cheer = true; }
        }
        place(A, 1); place(B, -1);
        for (const [b, s] of [[A, 1], [B, -1]]) b.carry = { hands: crateHandles(b, s), emote: Math.sin(PG.t * 1.3 + s) > 0.85 ? 'angry' : 'strain' };
      }
    } else if (PG.state === 'drop') {
      for (const b of [A, B]) b.carry = null;
      PG.cv -= 9.8 * dt; c.position.y += PG.cv * dt; if (c.position.y < 0.15) { c.position.y = 0.15; PG.cv = Math.abs(PG.cv) > 1 ? -PG.cv * 0.3 : 0; }
      c.rotation.z *= 1 - Math.min(1, dt * 6);
      if (PG.t > 0.4 && PG.cheer) { PG.cheer = false; for (const b of [A, B]) if (!b.rag && !b.getup) { b.setAnim('jump'); b.goal = null; tempEmote(b, 'happy', 1.6); b.ai.unjump = 1.6; } this.newTarget(); }
      if (PG.t > 1.8 && !knocked) { PG.state = 'approach'; PG.t = 0; }
    }
    for (const b of PG.wanderers) {
      const ai = b.ai; ai.t -= dt; if (b.rag || b.getup) continue;
      if (ai.t <= 0) {
        const r = Math.random();
        if (r < 0.62) { b.goal = new THREE.Vector3((Math.random() * 2 - 1) * H, 0, (Math.random() * 2 - 1) * H); b.setAnim('idle'); ai.t = 3 + Math.random() * 3; b.maxSpeed = Math.random() < 0.25 ? 1.0 : 0.4 + Math.random() * 0.2; }
        else if (r < 0.75) { b.goal = null; b.setAnim('wave'); ai.t = 2; }
        else if (r < 0.85) { b.goal = null; b.setAnim('dance'); ai.t = 3; }
        else { b.goal = null; b.setAnim('idle'); ai.t = 1.5 + Math.random() * 2; }
        b.face = null;
      }
      if (b.goal && b.goal.distanceTo(b.root.position) < 0.1) b.goal = null;
    }
    for (const b of this.bots) {
      if (b.ai.emoT > 0) { b.ai.emoT -= dt; if (b.ai.emoT <= 0) b.emote = this.emote; }
      if (b.ai.unjump > 0) { b.ai.unjump -= dt; if (b.ai.unjump <= 0) b.setAnim('idle'); }
      b.ai.cool -= dt; const p = b.root.position; p.x = Math.max(-H, Math.min(H, p.x)); p.z = Math.max(-H, Math.min(H, p.z));
    }
    const bots = this.bots;
    for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) {
      const a = bots[i], b = bots[j]; if (a.rag || b.rag || a.getup || b.getup) continue;
      const d = tmpV.subVectors(b.root.position, a.root.position).setY(0), L = d.length(), rr = a.T.w + b.T.w + 0.04;
      if (L < rr && L > 1e-4) {
        d.multiplyScalar(1 / L); const push = (rr - L) * 0.5; a.root.position.addScaledVector(d, -push); b.root.position.addScaledVector(d, push);
        const rel = tmpV2.subVectors(a.vel, b.vel).dot(d);
        if (rel > 0.45 && a.ai.cool <= 0 && b.ai.cool <= 0) { const victim = (a.T.w + a.spec.legLen * 0.3 < b.T.w + b.spec.legLen * 0.3) ? a : b, other = victim === a ? b : a, dir = victim === a ? d.clone().negate() : d.clone(); victim.knock(dir, 1.0 + rel); tempEmote(other, Math.random() < 0.5 ? 'happy' : 'scared', 1.5); a.ai.cool = b.ai.cool = 3; other.vel.multiplyScalar(-0.3); if (victim.ai.role === 'wander') victim.goal = null; }
        else if (rel > 0.05) { a.vel.addScaledVector(d, -rel * 0.6); b.vel.addScaledVector(d, rel * 0.6); }
      }
    }
    for (const b of PG.wanderers) { const d = tmpV.subVectors(b.root.position, c.position).setY(0), L = d.length(), rr = 0.3 + b.T.w; if (L < rr && L > 1e-4) b.root.position.addScaledVector(d, (rr - L) / L); }
  }
}
