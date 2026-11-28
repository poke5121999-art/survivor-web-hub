// The arrest sets from level0 (Finale/Busted/Set): the booking room (x ~ 1000) and the cell (x ~ 1020), with their
// baked lightmaps (Game/BakedSet: albedo x lightmap x _LightScale), cameras and marks from the scene, the suspect avatar
// (art/avatar, the same PlayerAvatar as co-op players) and the placard. Driven by Arrest (beat clock) in arrest.js.
import * as THREE from 'three';
import { V } from '../rev.js';
import { loadSlice, buildMaterial } from './scenegraph.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { barsTravel, bulbSwing } from './arrest.js';
import { runClock } from '../sim/finale.js';
import { STRIPE, BEANIE } from './remotes.js';

const BD = { shadeK: 0.95, shadeAmb: 0.2, glowK: 1.6, bulbTint: [1.0, 0.5382355, 0.1788675],   // BulbLight colour (scene.json lights)
  bookingFov: 27, cellFov: 38, cellPullFov: 30, barsOpenOffset: 1.15, boltTurn: -90, pullLen: 8.5,
  backdrop: [0.035, 0.04, 0.06], bookingAmbient: [[0.5, 0.46, 0.44], [0.4, 0.36, 0.38], [0.28, 0.24, 0.28]], cellAmbient: [[0.3, 0.34, 0.48], [0.22, 0.25, 0.38], [0.14, 0.15, 0.24]] };
const SHOT = { pushIn: 2.4, front: 2.8, card1: 4.3, turn: 4.5, turnLen: 0.8, profile: 6.0, card2: 7.4, peek: 7.5 };
const ease = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

export class BustedStage {
  constructor(o) { this.o = o; this.ready = false; this.photos = []; }
  async load() {
    const base = './art/finale/';
    const slice = await loadSlice(base);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color().setRGB(...BD.backdrop, THREE.SRGBColorSpace);
    const tl = new THREE.TextureLoader(), lmCache = new Map();
    const lm = (info) => { if (lmCache.has(info.file)) return lmCache.get(info.file); const t = tl.load(base + 'tex/' + info.file + V); t.flipY = true; t.channel = 1; t.colorSpace = THREE.SRGBColorSpace; lmCache.set(info.file, t); return t; };   // uv2 keeps Unity's v-up orientation (uv0 is flipped by the exporter)
    this.parts = {};
    for (const mesh of slice.group.children.slice()) {
      const p = mesh.userData.path;
      if (!/^Finale\/Busted\/Set\/(Booking|Cell|Placard)/.test(p)) continue;
      const src = mesh.material.userData.src;
      if (src && src.shader === 'Game/BakedSet') {
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(src.color[0], src.color[1], src.color[2]), map: mesh.material.map || null });
        if (src._LightMap) { m.lightMap = lm(src._LightMap); m.lightMapIntensity = (src.floats && src.floats._LightScale) || 4; }
        mesh.material = m;
      } else if (src && /Unlit/.test(src.shader)) {
        mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(src.color[0], src.color[1], src.color[2]), map: mesh.material.map || null });
      }
      // the lamp: the shade (FIN_RT_Enamel, URP Lit) is lit from inside by BulbLight in the original, its outside reads
      // dark green enamel in f24; three's point light just under the rim lit the outside yellow, so the shade keeps its
      // albedo under the cell ambient only (k measured against f24, parity region 'shade'). The glow (FIN_GlowBulb,
      // colour x9 HDR) is clamped so the bloom leaves a small spot as in f24 instead of a halo.
      if (/fin_bulb$/.test(p) && src && src.name === 'FIN_RT_Enamel') mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...[0, 1, 2].map(i => src.color[i] * (BD.bulbTint[i] * BD.shadeK + BD.shadeAmb))) });   // enamel x the bulb's warm colour = f24's olive
      if (/fin_bulb_glow$/.test(p)) mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.42).multiplyScalar(BD.glowK) });
      mesh.userData.base = mesh.matrix.clone();
      scene.add(mesh);
      const k = /fin_bars_door\/fin_bars_bolt$/.test(p) ? 'bolt' : /fin_bars_door$/.test(p) ? 'door' : /fin_bulb(\/fin_bulb_glow)?$/.test(p) ? 'bulb' : /Placard$/.test(p) ? 'placard' : null;
      if (k) (this.parts[k] ||= []).push(mesh);
    }
    // lights: the four set point lights + the ambient gradient per set (bookingAmbient / cellAmbient)
    for (const L of slice.meta.lights) {
      const l = new THREE.PointLight(new THREE.Color(...L.color), L.intensity * 2, L.range, 2);   // Unity intensity -> three candela: x2, matched to f23/f24
      l.position.fromArray(L.pos); scene.add(l);
    }
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1.6); scene.add(this.hemi);
    this.setAmbient(BD.bookingAmbient);
    const mk = (path) => { const m = slice.meta.markers[path]; return m ? new THREE.Vector3().fromArray(m.p) : null; };
    this.pt = {
      bookWide: mk('Finale/Busted/Set/Booking/CameraWide'), book: mk('Finale/Busted/Set/Booking/Camera'), mark: mk('Finale/Busted/Set/Booking/Mark'),
      cellWide: mk('Finale/Busted/Set/Cell/CameraWide'), cell: mk('Finale/Busted/Set/Cell/Camera'), cellPull: mk('Finale/Busted/Set/Cell/CameraPull'),
      spots: [1, 2, 3, 4].map(i => mk('Finale/Busted/Set/Cell/Spot' + i)), placard: mk('Finale/Busted/Set/Placard'),
    };
    this.cam = new THREE.PerspectiveCamera(BD.bookingFov, innerWidth / innerHeight, 0.05, 60);
    // placard text (Name / Info / Charge are TextMeshPro labels in the original): a canvas on the board's face
    this.placardCv = document.createElement('canvas'); this.placardCv.width = 512; this.placardCv.height = 256;
    this.placardTex = new THREE.CanvasTexture(this.placardCv); this.placardTex.colorSpace = THREE.SRGBColorSpace;
    // the placard is one object (board + its labels) that PlayerAvatar.MugshotBegin places in the hands every frame
    const board = this.board = new THREE.Group(); board.position.copy(this.pt.placard || new THREE.Vector3(1000, 1.2, 1.5)); board.scale.setScalar(1.28); scene.add(board);
    board.updateMatrixWorld(true); const inv = board.matrixWorld.clone().invert();
    for (const m of this.parts.placard || []) { scene.remove(m); m.matrix.premultiply(inv); m.userData.base = m.matrix.clone(); board.add(m); }
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ map: this.placardTex, transparent: true }));
    pm.position.set(0, 0, -0.012); pm.rotation.y = Math.PI; board.add(pm);
    this.placardMesh = board;
    // the suspect (PlayerAvatar, art/avatar): materials from avatar.json, node visibility from the exported active flags,
    // palette 0 tint on the C_Stripe / C_Beanie slots (PlayerAvatar.Tint uses a property block)
    try {
      const [g, meta] = await Promise.all([new GLTFLoader().loadAsync('./art/avatar/avatar.glb' + V), fetch('./art/avatar/avatar.json' + V).then(r => r.json())]);
      const mats = meta.materials.map(m => buildMaterial('./art/avatar/', m));
      g.scene.traverse(o => {
        if (o.userData.active === false || o.userData.rendererEnabled === false) o.visible = false;
        if (o.isMesh) { const a = g.parser.associations.get(o.material); if (a && a.materials !== undefined) o.material = mats[a.materials]; o.frustumCulled = false; }
      });
      this.avatar = g.scene; this.clips = g.animations || []; this.avatarMeta = meta; scene.add(this.avatar);
      this.tints = { stripe: mats.filter(m => m && m.name === 'C_Stripe'), beanie: mats.filter(m => m && m.name === 'C_Beanie') };
      this.mixer = new THREE.AnimationMixer(this.avatar);
      this.avatarNode = this.avatar.getObjectByName('Avatar') || this.avatar; this.avatarRest = { p: this.avatarNode.position.clone(), q: this.avatarNode.quaternion.clone() };
      try { const { AvatarPose } = await import('./avatarpose.js'); this.pose = new AvatarPose(this.avatarNode); } catch (e) { this.pose = null; }
    } catch (e) { this.avatar = null; }
    this.ready = true;
    return this;
  }
  setAmbient(a) { this.hemi.color.setRGB(...a[0], THREE.SRGBColorSpace); this.hemi.groundColor.setRGB(...a[2], THREE.SRGBColorSpace); }
  clip(re) { return this.clips && this.clips.find(c => re.test(c.name)); }
  play(re, loop = true) { if (!this.mixer) return; const c = this.clip(re); if (!c) return; if (this.action) this.action.fadeOut(0.2); this.action = this.mixer.clipAction(c); this.action.reset(); this.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); this.action.clampWhenFinished = true; this.action.fadeIn(0.2).play(); }
  begin(arrest) {
    this.photos = []; this.T = arrest.o.T; this.rec = arrest.record;
    this.crew = (arrest.record.crew && arrest.record.crew.length ? arrest.record.crew : [{ s: 0, n: '' }]).slice(0, 4);
    this.cur = -1; this.suspect(0);
  }
  // one suspect per player in roster order (BustedDirector: Shots 9 s each, ShotScale 0.8 with >= 2 players): placard
  // name, the player's palette (PlayerAvatar.ApplyPalette), the mugshot pose from the start
  suspect(i) {
    this.cur = i; this.shot = 0;
    const p = this.crew[i], rec = this.rec, c = this.placardCv.getContext('2d');
    c.clearRect(0, 0, 512, 256); c.fillStyle = '#fff'; c.textAlign = 'center';
    c.font = '600 54px Fredoka, sans-serif'; c.fillText(p.n || this.T('net.player', (p.s | 0) + 1), 256, 70);
    c.font = '500 30px Fredoka, sans-serif'; c.fillText(this.T('ending.placard.finisher', rec.finisher || 1), 256, 122); c.fillText(this.T('ending.placard.time', runClock(rec.seconds)), 256, 160);
    c.fillStyle = '#f9c52f'; c.font = '600 28px Fredoka, sans-serif'; c.fillText(this.T('ending.placard.charge'), 256, 222);
    this.placardTex.needsUpdate = true;
    if (this.tints) { const s = STRIPE[(p.s | 0) & 3], b = BEANIE[(p.s | 0) & 3];
      for (const m of this.tints.stripe) m.color.setRGB(s[0], s[1], s[2], THREE.SRGBColorSpace); for (const m of this.tints.beanie) m.color.setRGB(b[0], b[1], b[2], THREE.SRGBColorSpace); }
    this.placeAvatar('booking', 0);
    this.play(/^Idle$/);
    this.done = {}; if (this.pose) { this.pose.reset(); this.pose.mugshotBegin(this.board, SHOT.front); }
  }
  once(k) { if (this.done[k]) return false; this.done[k] = true; return true; }
  placeAvatar(where, yaw) {
    if (!this.avatar) return;
    const p = where === 'booking' ? this.pt.mark : this.pt.spots[0];
    if (this.avatarRest) { this.avatarNode.position.copy(this.avatarRest.p); this.avatarNode.quaternion.copy(this.avatarRest.q); }   // the mugshot turn rotates this node
    this.avatar.position.copy(p); this.avatar.rotation.set(0, yaw, 0);   // the avatar faces -z, toward the set cameras
  }
  // a mugshot: render the booking camera into a small target and keep it as a PNG data URL
  capture() {
    const r = this.o.renderer, w = 320, h = 240, rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
    const cam = this.cam.clone(); cam.aspect = w / h; cam.updateProjectionMatrix();
    const prev = r.getRenderTarget(); r.setRenderTarget(rt); r.render(this.scene, cam); r.setRenderTarget(prev);
    const px = new Uint8Array(w * h * 4); r.readRenderTargetPixels(rt, 0, 0, w, h, px); rt.dispose();
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'), img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    c.putImageData(img, 0, 0);
    try { this.photos.push(cv.toDataURL('image/png')); } catch (e) { }
  }
  update(dt, t, b, arrest) {
    if (this.mixer) this.mixer.update(dt);
    if (this.pose) this.pose.update(dt);            // PlayerAvatar LateUpdate poses on top of the clip
    const cam = this.cam; cam.aspect = innerWidth / innerHeight;
    const head = (p) => new THREE.Vector3(p.x, p.y + 1.25, p.z);
    if (t < b.strip) {                                                  // booking room
      const n = this.crew.length, scale = n >= 2 ? 0.8 : 1, len = (b.strip - b.shots) / n, raw = Math.max(0, t - b.shots);
      const i = Math.min(n - 1, Math.floor(raw / len)); if (i !== this.cur) this.suspect(i);
      const s = (raw - i * len) / scale, k = ease(clamp01(s / SHOT.pushIn));
      cam.position.lerpVectors(this.pt.bookWide, this.pt.book, k); cam.fov = BD.bookingFov + (1 - k) * 8;
      cam.lookAt(head(this.pt.mark)); this.setAmbient(BD.bookingAmbient);
      if (this.pose) {
        if (s >= SHOT.front && this.once('blink1')) this.pose.mugshotBlink();
        if (s >= SHOT.turn && this.once('turn')) this.pose.mugshotTurn(SHOT.turnLen);
        if (s >= SHOT.profile && this.once('blink2')) this.pose.mugshotBlink();
        if (s >= SHOT.peek && this.once('peek')) this.pose.mugshotPeek();
      }
      if (this.shot === 0 && s >= SHOT.front) { this.shot = 1; this.flash(arrest); this.capture(); arrest.photoShow(this.photos[this.photos.length - 1]); }
      if (this.shot === 1 && s >= SHOT.card1 && this.once('card1')) arrest.photoFly();
      if (this.shot === 1 && s >= SHOT.profile) { this.shot = 2; this.flash(arrest); this.capture(); arrest.photoShow(this.photos[this.photos.length - 1]); }
      if (this.shot === 2 && s >= SHOT.card2 && this.once('card2')) arrest.photoFly();
      this.board.visible = true;
    } else {                                                             // cell
      this.board.visible = false;
      const c = Math.max(0, t - b.cell), a = Math.max(0, t - b.after);
      this.setAmbient(BD.cellAmbient);
      if (t < b.after) { const k = ease(clamp01(c / 4.2)); cam.position.lerpVectors(this.pt.cellWide, this.pt.cell, k); cam.fov = BD.cellFov; }
      else { const k = ease(clamp01(a / 3)); cam.position.lerpVectors(this.pt.cell, this.pt.cellPull, k); cam.fov = BD.cellFov + (BD.cellPullFov - BD.cellFov) * k; }
      cam.lookAt(head(this.pt.spots[0]).add(new THREE.Vector3(0, -0.1, 0)));
      if (this.cellPlaced !== true) { this.cellPlaced = true; if (this.pose) { this.pose.mugshotEnd(); } this.placeAvatar('cell', 0); this.play(/^Idle$/); if (this.pose) this.pose.cellBegin(true); }   // the cell marks several spots (Cell/Spots); this port seats one avatar, the last suspect (gap)
      if (this.pose && c >= 1.5 + 0.95 && this.once('startle')) this.pose.cellStartle();      // the bars finish shutting
      if (this.pose && a >= 0.5 && this.once('shrug')) this.pose.cellShrug();
      // bars slam at 1.5 s, bolt turns at 0.62 s after it, the bulb swings
      const slam = c - 1.5, open = barsTravel(slam) * BD.barsOpenOffset;
      for (const m of this.parts.door || []) m.matrix.copy(m.userData.base).premultiply(new THREE.Matrix4().makeTranslation(open, 0, 0));
      const bk = clamp01((slam - 0.62) / 0.16), boltM = new THREE.Matrix4().makeTranslation(open, 0, 0);
      for (const m of this.parts.bolt || []) { const p = new THREE.Vector3().setFromMatrixPosition(m.userData.base); m.matrix.copy(boltM).multiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)).multiply(new THREE.Matrix4().makeRotationZ(BD.boltTurn * bk * Math.PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)).multiply(m.userData.base); }
      const sw = slam > 0 ? bulbSwing(slam) : 0;
      for (const m of this.parts.bulb || []) { const p = new THREE.Vector3().setFromMatrixPosition(m.userData.base); m.matrix.makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeRotationZ(sw * Math.PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z)).multiply(m.userData.base); }
    }
    cam.updateProjectionMatrix();
  }
  flash(arrest) {
    const el = arrest.el && arrest.el.querySelector('.aWhite'); if (!el) return;
    this.o.sfx('UiClick', { vol: 1.1 });
    el.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  }
  end() { this.cellPlaced = false; if (this.pose) { this.pose.mugshotEnd(); this.pose.cellEnd(); } if (this.action) this.action.stop(); }
}
