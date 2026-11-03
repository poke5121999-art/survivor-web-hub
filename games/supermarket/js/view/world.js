// three.js view of the store. All meshes are built in code (original low-poly look).
import * as THREE from 'three';
import { LAYOUT, DOOR, roomFor, slots, slotById, SHELF } from '../sim/layout.js';
import { iconOf } from './icons.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class World {
  constructor(canvas, sim) {
    this.sim = sim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fd3f0');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camYaw = 0;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a7f72', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.4); sun.position.set(-4, 10, 6); this.scene.add(sun);
    this.sun = sun;
    this.prodMat = new Map(); this.prodGeo = new THREE.BoxGeometry(1, 1, 1);
    this.roomGroup = null; this.builtSections = -1;
    this.buildFurniture();
    this.shelfObjs = new Map(); this.ghosts = new THREE.Group(); this.scene.add(this.ghosts); this.ghostSig = '';
    this.buildOutside();
    this.player = this.person('#2e86de', '#1b4f72', true);
    this.player.position.set(0, 0, 1);
    this.scene.add(this.player);
    this.carryBox = this.cardboard(); this.carryBox.position.set(0, 1.05, 0.38); this.player.add(this.carryBox); this.carryBox.visible = false;
    this.people = new Map(); this.boxMeshes = new Map(); this.layerGroups = [];
    this.highlight = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    this.highlight.rotation.x = -Math.PI / 2; this.highlight.position.y = 0.02; this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.resize();
  }

  resize() {
    const w = this.renderer.domElement.clientWidth || window.innerWidth, h = this.renderer.domElement.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 62 : 48;
    this.camera.updateProjectionMatrix();
  }

  buildOutside() {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), lam('#c8c6c0'));
    walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.01, 6 + 3); this.scene.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 10), lam('#55595e'));
    road.rotation.x = -Math.PI / 2; road.position.set(0, -0.02, 6 + 11); this.scene.add(road);
    for (let x = -28; x < 30; x += 4) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.2), lam('#f1f1f1')); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.01, 6 + 11); this.scene.add(m); }
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), lam('#7cb26b'));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, -0.03, 0); this.scene.add(grass);

    // a few trees outside
    for (const [x, z] of [[9.5, 7.6], [12, -2], [10.5, 3], [13, 5.5], [-4, -8.5], [-15, -8.2], [6, -8.4], [-24, 2], [-25, -4]]) {
      const t = new THREE.Group(); t.position.set(x, 0, z);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), lam('#8b5a2b')); tr.position.y = 0.6; t.add(tr);
      const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), lam('#4f9d4f', { flatShading: true })); top.position.y = 1.7; t.add(top);
      this.scene.add(t);
    }
  }

  buildRoom(sections) {
    if (this.roomGroup) this.scene.remove(this.roomGroup);
    const G = this.roomGroup = new THREE.Group(); this.scene.add(G); this.builtSections = sections;
    const R = roomFor(sections), W = R.x1 - R.x0, D = R.z1 - R.z0;
    const tiles = canvasTex(256, 256, (g, w, h) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#ece6da' : '#f7f3ea'; g.fillRect(x * 64, y * 64, 64, 64); }
      g.strokeStyle = 'rgba(0,0,0,0.06)'; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    });
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(W / 2, D / 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), lam('#ffffff', { map: tiles }));
    floor.rotation.x = -Math.PI / 2; floor.position.set((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
    G.add(floor);
    const wallM = lam('#f3e9d2'), band = lam('#2a9d8f'), H = R.h;
    const wall = (w, h, d, x, y, z, m = wallM) => { const o = new THREE.Mesh(box(w, h, d), m); o.position.set(x, y, z); G.add(o); return o; };
    wall(W + 0.3, H, 0.15, (R.x0 + R.x1) / 2, H / 2, R.z0 - 0.075);
    wall(W + 0.3, 0.35, 0.17, (R.x0 + R.x1) / 2, 1.0, R.z0 - 0.06, band);
    // side walls are cut low so the camera always sees in
    wall(0.15, 1.1, D, R.x0 - 0.075, 0.55, (R.z0 + R.z1) / 2);
    wall(0.15, 1.1, D, R.x1 + 0.075, 0.55, (R.z0 + R.z1) / 2);
    wall(0.17, 0.08, D, R.x0 - 0.075, 1.12, (R.z0 + R.z1) / 2, band);
    wall(0.17, 0.08, D, R.x1 + 0.075, 1.12, (R.z0 + R.z1) / 2, band);
    // front: low wall + glass so the camera sees in
    const glass = lam('#bfe6ff', { transparent: true, opacity: 0.18, depthWrite: false });
    const fl = DOOR.x0 - R.x0, fr = R.x1 - DOOR.x1;
    wall(fl, 0.5, 0.15, R.x0 + fl / 2, 0.25, R.z1 + 0.075);
    wall(fr, 0.5, 0.15, DOOR.x1 + fr / 2, 0.25, R.z1 + 0.075);
    wall(fl, 1.2, 0.05, R.x0 + fl / 2, 1.1, R.z1 + 0.075, glass);
    wall(fr, 1.2, 0.05, DOOR.x1 + fr / 2, 1.1, R.z1 + 0.075, glass);
    for (const x of [R.x0, DOOR.x0, DOOR.x1, R.x1]) wall(0.12, 1.75, 0.18, x, 0.87, R.z1 + 0.075, lam('#3d5a80'));
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), lam('#3d5a80')); mat.rotation.x = -Math.PI / 2; mat.position.set(4, 0.005, R.z1 - 0.3); G.add(mat);
    // sign
    const sign = canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#e76f51'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 56px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('CORNER MART', w / 2, h / 2 + 3);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.75), new THREE.MeshBasicMaterial({ map: sign })); s.position.set(0, 2.6, R.z0 + 0.02); G.add(s);
    // delivery zone
    const D2 = LAYOUT.delivery;
    const dz = new THREE.Mesh(new THREE.PlaneGeometry(D2.cols * D2.dx + 0.3, D2.rows * D2.dz + 0.3), lam('#f4d35e', { transparent: true, opacity: 0.55 }));
    dz.rotation.x = -Math.PI / 2; dz.position.set(D2.x + (D2.cols - 1) * D2.dx / 2, 0.006, D2.z + (D2.rows - 1) * D2.dz / 2); G.add(dz);
  }

  buildFurniture() {
    // register
    const r = LAYOUT.register;
    const reg = new THREE.Group(); reg.position.set(r.x, 0, r.z);
    const body = new THREE.Mesh(box(r.w, 0.9, r.d), lam('#b5835a')); body.position.y = 0.45; reg.add(body);
    const top = new THREE.Mesh(box(r.w + 0.04, 0.04, r.d + 0.04), lam('#f1ece4')); top.position.y = 0.92; reg.add(top);
    const belt = new THREE.Mesh(box(r.w * 0.55, 0.02, r.d * 0.6), lam('#2f3640')); belt.position.set(r.w * 0.18, 0.95, 0); reg.add(belt);
    const pos = new THREE.Mesh(box(0.35, 0.25, 0.08), lam('#2d3436')); pos.position.set(-r.w * 0.3, 1.1, -0.1); pos.rotation.x = -0.3; reg.add(pos);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), new THREE.MeshBasicMaterial({ color: '#55efc4' })); scr.position.set(-r.w * 0.3, 1.11, -0.055); scr.rotation.x = -0.3; scr.rotation.y = Math.PI; reg.add(scr);
    const scanner = new THREE.Mesh(box(0.25, 0.04, 0.25), lam('#636e72')); scanner.position.set(-0.05, 0.955, 0); reg.add(scanner);
    const laser = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ color: '#ff4757', transparent: true, opacity: 0.6 })); laser.rotation.x = -Math.PI / 2; laser.position.set(-0.05, 0.98, 0); reg.add(laser);
    this.laser = laser; this.beltItems = new THREE.Group(); this.beltItems.position.set(r.w * 0.18, 0.97, 0); reg.add(this.beltItems);
    this.scene.add(reg);
    // queue stanchions
    for (let i = 1; i < 8; i++) { const q = LAYOUT.queue(i); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), lam('#b8b8b8')); p.position.set(q.x + 0.4, 0.45, q.z - 0.42); this.scene.add(p); }
    // computer desk
    const c = LAYOUT.computer, desk = new THREE.Group(); desk.position.set(c.x, 0, c.z);
    const dt = new THREE.Mesh(box(c.w, 0.05, c.d), lam('#8d6e63')); dt.position.y = 0.75; desk.add(dt);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(box(0.05, 0.75, 0.05), lam('#5d4037')); l.position.set(lx * (c.w / 2 - 0.05), 0.375, lz * (c.d / 2 - 0.05)); desk.add(l); }
    const mon = new THREE.Mesh(box(0.6, 0.38, 0.04), lam('#222')); mon.position.set(0, 1.0, -0.15); desk.add(mon);
    const ms = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.32), new THREE.MeshBasicMaterial({ color: '#74b9ff' })); ms.position.set(0, 1.0, -0.128); desk.add(ms);
    const kb = new THREE.Mesh(box(0.42, 0.02, 0.14), lam('#444')); kb.position.set(0, 0.785, 0.1); desk.add(kb);
    this.scene.add(desk);
    // trash bin
    const t = LAYOUT.trash, bin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.7, 12), lam('#27ae60')); bin.position.set(t.x, 0.35, t.z); this.scene.add(bin);
  }

  makeShelf(slotId, kind) {
    const sl = slotById(slotId, this.sim.sections); if (!sl) return null;
    const S = SHELF, g = new THREE.Group(); g.position.set(sl.x, 0, sl.z);
    const frame = lam(kind === 305 ? '#f2c14e' : kind === 303 ? '#f5f6fa' : '#9aa5b1'), board = lam(kind === 305 ? '#ffe08a' : '#dfe4ea');
    if (kind === 303) { // fridge: white body, dark inside, glass door
      for (const sx of [-1, 1]) { const sd = new THREE.Mesh(box(0.05, 1.95, S.d), lam('#ffffff')); sd.position.set(sx * (S.w / 2 - 0.025), 0.975, 0); g.add(sd); }
      const bot = new THREE.Mesh(box(S.w, 0.1, S.d), lam('#ffffff')); bot.position.set(0, 0.05, 0); g.add(bot);
      const inner = new THREE.Mesh(box(S.w - 0.1, 1.75, S.d - 0.06), lam('#dfe9f0', { side: THREE.BackSide })); inner.position.set(0, 0.97, 0.01); g.add(inner);
      const back = new THREE.Mesh(box(S.w - 0.1, 1.75, 0.02), lam('#b8d4e6')); back.position.set(0, 0.97, -S.d / 2 + 0.04); g.add(back);
      const top = new THREE.Mesh(box(S.w, 0.18, S.d + 0.02), lam('#74b9ff')); top.position.set(0, 1.86, 0); g.add(top);
    } else {
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(box(0.05, 1.9, S.d), frame); p.position.set(sx * (S.w / 2 - 0.025), 0.95, 0); g.add(p); }
      const back = new THREE.Mesh(box(S.w, 1.9, 0.03), lam(kind === 305 ? '#e9b949' : '#c9d1d9')); back.position.set(0, 0.95, -S.d / 2 + 0.015); g.add(back);
    }
    const layers = [];
    for (let i = 0; i < 4; i++) {
      const y = 0.12 + i * 0.44;
      const b = new THREE.Mesh(box(S.w - 0.06, 0.03, S.d), kind === 303 ? lam('#dfe6e9', { transparent: true, opacity: 0.6 }) : board); b.position.set(0, y, 0);
      if (kind === 305) b.rotation.x = 0.35;
      g.add(b);
      const lg = new THREE.Group(); lg.position.set(0, y + 0.015, 0); if (kind === 305) lg.rotation.x = 0.35; g.add(lg); layers.push(lg);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff' })); tag.position.set(0, y - 0.015, S.d / 2 + 0.012); g.add(tag);
    }
    if (kind === 303) { const glass = new THREE.Mesh(new THREE.PlaneGeometry(S.w - 0.06, 1.7), lam('#dff3ff', { transparent: true, opacity: 0.22, depthWrite: false })); glass.position.set(0, 0.97, S.d / 2 + 0.01); g.add(glass); }
    this.scene.add(g);
    return { g, layers, sig: [], kind };
  }

  matFor(pid) {
    if (this.prodMat.has(pid)) return this.prodMat.get(pid);
    const p = this.sim.P.get(pid), ic = iconOf(p);
    const face = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = ic.color; g.fillRect(0, 0, w, h);
      g.font = '44px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ic.emoji, w / 2, h / 2 + 3);
    });
    const side = lam(ic.color), front = lam('#ffffff', { map: face });
    const m = [side, side, side, side, front, side];
    this.prodMat.set(pid, m);
    return m;
  }

  cardboard() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(box(0.46, 0.32, 0.38), lam('#c9925a')); b.position.y = 0.16; g.add(b);
    const tape = new THREE.Mesh(box(0.47, 0.02, 0.08), lam('#e8d3a9')); tape.position.y = 0.325; g.add(tape);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); label.position.set(0, 0.17, 0.191); g.add(label);
    g.userData.label = label;
    return g;
  }
  setBoxLabel(g, pid) {
    if (g.userData.pid === pid) return;
    g.userData.pid = pid;
    g.userData.label.material = new THREE.MeshBasicMaterial({ map: this.matFor(pid)[4].map });
  }

  person(color, dark, isPlayer = false) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), lam(color)); body.position.y = 0.62; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), lam('#f1c27d')); head.position.y = 1.28; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam(dark)); hair.position.y = 1.3; g.add(hair);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), lam('#222')); e.position.set(sx * 0.06, 1.3, 0.155); g.add(e); }
    if (isPlayer) { const ap = new THREE.Mesh(box(0.3, 0.4, 0.05), lam('#e9c46a')); ap.position.set(0, 0.66, 0.2); g.add(ap); }
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; g.add(sh);
    g.userData.body = body;
    return g;
  }

  // ---- per-frame sync with the sim ---------------------------------------------------------------------------
  sync(dt, player) {
    const sim = this.sim, s = sim.s;
    this.player.position.set(player.x, 0, player.z);
    this.player.rotation.y = player.dir;
    this.player.userData.body.position.y = 0.62 + (player.moving ? Math.abs(Math.sin(performance.now() / 120)) * 0.04 : 0);
    const cb = sim.carried();
    this.carryBox.visible = !!cb; if (cb) this.setBoxLabel(this.carryBox, cb.pid);

    if (this.builtSections !== sim.sections) {
      this.buildRoom(sim.sections);
      for (const [, o] of this.shelfObjs) this.scene.remove(o.g);
      this.shelfObjs.clear(); this.ghostSig = '';
    }
    // shelves
    for (const sh of s.shelves) if (!this.shelfObjs.has(sh.id)) { const o = this.makeShelf(sh.id, sh.kind); if (o) this.shelfObjs.set(sh.id, o); }
    // free slots glow while furniture waits to be placed
    const gsig = s.toPlace.length ? sim.freeSlots().map(f => f.id).join(',') : '';
    if (gsig !== this.ghostSig) {
      this.ghostSig = gsig; this.ghosts.clear();
      if (gsig) for (const f of sim.freeSlots()) { const m = new THREE.Mesh(new THREE.PlaneGeometry(SHELF.w, SHELF.d), new THREE.MeshBasicMaterial({ color: '#2a9d8f', transparent: true, opacity: 0.35 })); m.rotation.x = -Math.PI / 2; m.position.set(f.x, 0.012, f.z); this.ghosts.add(m); }
    }
    s.shelves.forEach((sh) => {
      const obj = this.shelfObjs.get(sh.id); if (!obj) return;
      sh.layers.forEach((L, li) => {
        const sig = L ? L.pid + ':' + L.count : '';
        if (obj.sig[li] === sig) return;
        obj.sig[li] = sig;
        const grp = obj.layers[li]; grp.clear();
        if (!L || !L.count) return;
        const p = sim.P.get(L.pid), [w, h, d] = p.foot.map(v => v / 100), S = SHELF, LW = sh.kind === 305 ? 0.90 : 0.92;
        const nx = Math.max(1, Math.floor(LW / w)), nz = Math.max(1, Math.floor(0.38 / d)), ny = p.stack ? Math.max(1, Math.floor(0.30 / h)) : 1;
        const sx = Math.min(1, (S.w - 0.12) / (nx * w)), m = this.matFor(L.pid);
        let k = 0;
        for (let y = 0; y < ny && k < L.count; y++) for (let z = 0; z < nz && k < L.count; z++) for (let x = 0; x < nx && k < L.count; x++, k++) {
          const it = new THREE.Mesh(this.prodGeo, m);
          it.scale.set(w * 0.92 * sx, h * 0.95, d * 0.92);
          it.position.set((x - (nx - 1) / 2) * w * sx, h / 2 + y * h, S.d / 2 - d / 2 - z * d - 0.02);
          grp.add(it);
        }
      });
    });

    // boxes on the floor
    const seen = new Set();
    for (const b of s.boxes) {
      if (b.where !== 'floor') continue;
      seen.add(b.id);
      let m = this.boxMeshes.get(b.id);
      if (!m) { m = this.cardboard(); this.scene.add(m); this.boxMeshes.set(b.id, m); }
      this.setBoxLabel(m, b.pid);
      m.position.set(b.x, b.y * 0.33, b.z);
    }
    for (const [id, m] of this.boxMeshes) if (!seen.has(id)) { this.scene.remove(m); this.boxMeshes.delete(id); }

    // customers
    const live = new Set();
    for (const c of sim.customers) {
      live.add(c.id);
      let m = this.people.get(c.id);
      if (!m) {
        const hue = (c.look * 37) % 360;
        m = this.person(`hsl(${hue},55%,55%)`, `hsl(${(hue + 160) % 360},30%,25%)`);
        const basket = new THREE.Mesh(box(0.34, 0.18, 0.24), lam('#e63946')); basket.position.set(0.28, 0.6, 0.12); basket.visible = false; m.add(basket);
        m.userData.basket = basket;
        this.scene.add(m); this.people.set(c.id, m);
      }
      const px = m.position.x, pz = m.position.z;
      m.position.set(c.x, 0, c.z);
      const moved = Math.hypot(c.x - px, c.z - pz) > 0.001;
      if (moved) m.rotation.y = Math.atan2(c.x - px, c.z - pz);
      else if (c.state === 'pick') m.rotation.y = Math.PI;
      else if (c.state === 'register' || c.state === 'queue') m.rotation.y = c.qn === 0 ? Math.PI : -Math.PI / 2;
      m.userData.body.position.y = 0.62 + (moved ? Math.abs(Math.sin(performance.now() / 130 + c.id)) * 0.04 : 0);
      m.userData.basket.visible = c.cart.length > 0;
    }
    for (const [id, m] of this.people) if (!live.has(id)) { this.scene.remove(m); this.people.delete(id); }

    // belt shows unscanned items
    const R = sim.register, bsig = R ? R.cid + ':' + R.belt.length : '';
    if (this.beltSig !== bsig) {
      this.beltSig = bsig; this.beltItems.clear();
      if (R) R.belt.slice(0, 12).forEach((pid, i) => { const it = new THREE.Mesh(this.prodGeo, this.matFor(pid)); it.scale.set(0.13, 0.13, 0.13); it.position.set(-0.3 + (i % 6) * 0.13, 0.065 + Math.floor(i / 6) * 0.13, 0); this.beltItems.add(it); });
    }
    this.laser.material.opacity = R ? 0.5 + 0.3 * Math.sin(performance.now() / 90) : 0.15;

    // sky by hour
    const h = s.time / 3600, k = Math.max(0, Math.min(1, (h - 17) / 5));
    this.scene.background.setRGB(0.62 - 0.45 * k, 0.83 - 0.6 * k, 0.94 - 0.55 * k);
    this.sun.intensity = 1.4 - 0.8 * k;

    // camera follows the player
    // camera follows the player; at the register it frames the counter in the top half (the panel covers the rest)
    const fx = player.atRegister ? LAYOUT.register.x + 0.6 : player.x, fz = player.atRegister ? LAYOUT.register.z + 2.6 : player.z + 1.4;
    const portrait = this.camera.aspect < 1, up = player.atRegister ? 5.2 : portrait ? 13 : 11, back = player.atRegister ? 3.4 : portrait ? 7.5 : 7.8;
    const want = new THREE.Vector3(fx, up, fz + back);
    if (!this.camInit) { this.camera.position.copy(want); this.camInit = true; }
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 6));
    this.camLook = this.camLook || new THREE.Vector3(fx, 0.6, fz);
    this.camLook.lerp(new THREE.Vector3(fx, 0.6, fz), 1 - Math.exp(-dt * 6));
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  markAt(p) { if (!p) { this.highlight.visible = false; return; } this.highlight.visible = true; this.highlight.position.x = p.x; this.highlight.position.z = p.z; }
  screenOf(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.renderer.domElement;
    return { x: (v.x + 1) / 2 * el.clientWidth, y: (1 - v.y) / 2 * el.clientHeight, vis: v.z < 1 };
  }
}
