// SceneGame (level1) port: curve, player, obstacles, camera, environment, scoring.
// Every number comes from the decompiled scripts or the scene data (see ~/snail-ride-ref/CODE.md).
import { THREE, GO, buildNode, prefab, sceneRoots, colliderShape, overlap, COLLIDERS, worldAdapter, threeTexture,
  builtinMesh, attachMeshRenderer, forMaterial } from '../engine/world.js?v=20261102a';
import { A, refKey } from '../engine/assets.js?v=20261102a';
import { LegacyAnimation, Animator, clip } from '../engine/anim.js?v=20261102a';
import { publish, subscribe, clearScope } from './events.js?v=20261102a';
import { Game, addCurrency, saveUser, skinSelected, rnd, rndi } from './user.js?v=20261102a';
import * as SFX from './audio.js?v=20261102a';
import { randomSkin, missionUpdate, missionCurrent, missionOnCollect, missionOnDodge, missionOnDestroy, missionResetSession, missionData } from './systems.js?v=20261102a';

const Left = 1, Right = 2, Center = 0;
const DEG = Math.PI / 180;

// ---------------- CurveController ----------------
class Curve {
  constructor(p) {
    this.numberSection = p.numberSection; this.randomAngle = p.randomAngle; this.randomCircleRadius = p.randomCircleRadius; this.randomCircleDistance = p.randomCircleDistance;
    this.step = 100 / this.numberSection;
    this.currentAngle = 90; this.randomize = { x: 0, y: 1 }; this.last = { x: 0, y: 0 };
    this.nodes = []; this.prevOfFirst = null; // released node that is still the PrevNode of nodes[0]
    for (let i = 0; i < this.numberSection + 1; i++) this.nodes.push(this.newPoint());
  }
  newPoint() {
    const l = Math.hypot(this.randomize.x, this.randomize.y) || 1;
    const cx = this.randomize.x / l * this.randomCircleDistance, cy = this.randomize.y / l * this.randomCircleDistance;
    this.currentAngle += rnd(-this.randomAngle, this.randomAngle);
    this.randomize = { x: cx + Math.cos(this.currentAngle * DEG) * this.randomCircleRadius, y: cy + Math.sin(this.currentAngle * DEG) * this.randomCircleRadius };
    this.last = { x: this.last.x + this.randomize.x, y: this.last.y + this.randomize.y };
    return { ...this.last };
  }
  recycle() { this.prevOfFirst = this.nodes.shift(); this.nodes.push(this.newPoint()); }
  control(i) {
    const n = this.nodes;
    const prev = i === 0 ? (this.prevOfFirst || n[0]) : n[i - 1];
    const next = i + 2 < n.length ? n[i + 2] : n[i + 1];
    return [prev, n[i], n[i + 1], next];
  }
  center(p) {
    p = Math.max(0, Math.min(100, p));
    let i = Math.floor(p / this.step); const t = p / this.step - i;
    if (i > this.nodes.length - 2) i = this.nodes.length - 2; // Unity would throw at exactly 100; never reached in play
    const [p1, p2, p3, p4] = this.control(i);
    const cr = (a, b, c, d) => 0.5 * (2 * b) + 0.5 * (c - a) * t + 0.5 * (2 * a - 5 * b + 4 * c - d) * t * t + 0.5 * (-a + 3 * b - 3 * c + d) * t * t * t;
    return { x: cr(p1.x, p2.x, p3.x, p4.x), y: cr(p1.y, p2.y, p3.y, p4.y) };
  }
  // Returns {x, y, angle} like CurveController.Pos
  pos(p, type, offset = 1) {
    if (type === Center) { const c = this.center(p); return { x: c.x, y: c.y, angle: 0 }; }
    const a = this.center(p - 0.1), b = this.center(p + 0.1), c = this.center(p);
    let nx = b.y - a.y, ny = -(b.x - a.x); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; // Cross(tangent, forward)
    const s = type === Left ? -1 : 1;
    const ang = Math.acos(Math.max(-1, Math.min(1, ny))) / DEG;          // Vector3.Angle(up, n)
    const angRight = Math.acos(Math.max(-1, Math.min(1, nx))) / DEG;      // Vector3.Angle(right, n)
    return { x: c.x + s * nx * offset, y: c.y + s * ny * offset, angle: -(angRight > 90 ? 360 - ang : ang) };
  }
  // CurveCamera.Angle
  cameraAngle(p) {
    const a = this.center(Math.max(0, p - 5)), b = this.center(Math.min(100, p + 5));
    const dx = b.x - a.x, dy = b.y - a.y; const t = Math.acos(Math.max(-1, Math.min(1, dy / (Math.hypot(dx, dy) || 1)))) / DEG;
    const pp = t % 180; return pp <= 90 ? pp : 180 - pp; // Mathf.PingPong(t, 90)
  }
}

// ---------------- TextMesh as a canvas texture ----------------
function textMeshMesh(comp, text) {
  const c = document.createElement('canvas'); const fs = 64; c.width = 256; c.height = 96;
  const g = c.getContext('2d'); g.font = `${fs}px "Linotte Bold", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  const h = comp.m_FontSize * comp.m_CharacterSize * 0.1 * (96 / fs), w = h * 256 / 96;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  return m;
}

export class SceneGame {
  constructor(app) {
    this.app = app; this.scope = []; this.objects = new Set(); this.anims = []; this.time = 0;
    this.scene = new THREE.Scene();
    const P = A.game.params;
    this.P = P;
    this.state = { started: false, paused: false, resuming: false, gameOver: false, bestScore: false, score: 0, time: 0, combo: 0,
      currencyEarned: 0, currencyAtStart: 0, frames: 0, previousBest: Game.User.m_bestScore };
    this.gc = { m_speedCoef: P.GameController.m_speedCoef, m_coefDistance: P.GameController.m_coefDistance };
    this.oc = { ...P.ObstacleController };
    this.curve = new Curve(P.CurveController);
    this.ccBeh = this.curve; // timeline animates CurveController.randomAngle
    this.pc = { life: true, bonusTime: 0, invincibleTime: 0, swapping: false, bonusState: 0 };
    this.skin = skinSelected() || randomSkin(false, false);
    this.followers = []; this.curveObjects = []; this.spawners = []; this.colliders = []; this.updaters = [];
    this.build();
  }

  // ---------- helpers exposed to UI ----------
  get speedCoef() { return this.pc.bonusTime > 0 ? 4 : this.gc.m_speedCoef; }
  get score() { return this.state.score | 0; }
  on(name, fn) { this.scope.push(subscribe(name, fn)); }

  build() {
    const ids = new Map();
    this.ids = ids;
    const roots = sceneRoots('level1').filter(r => !['HUDGame', 'EventSystem', 'Session'].includes(r.name));
    for (const r of roots) { const g = buildNode(r, ids, this.hooks()); this.scene.add(g.obj); this.rootGOs = (this.rootGOs || []).concat(g); }
    const byName = n => this.rootGOs.find(g => g.name === n);
    this.player = byName('Player'); this.gcGO = byName('GameController'); this.rig = byName('GameObject');
    this.camGO = this.rig.find('Main Camera');
    const camComp = this.camGO.comp('Camera');
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, camComp['near clip plane'], camComp['far clip plane']);
    this.orthoSize = camComp['orthographic size'];
    this.camGO.obj.add(this.cam); // camera looks down three -z == Unity +z
    this.setupPlayer(); this.setupEnvironment(); this.setupTimeline();
    this.playerPercent = 20; this.playerType = this.P.CurveFollower.m_type; // m_type Left initially
    this.camOffset = 0; this.updatePlayer(0); this.updateCamera(0, true);
    this.on('StartGameEvent', e => this.onStartGame(e));
    this.app.particles && this.app.particles.attach(this);
  }

  // component hooks while building any node tree
  hooks() {
    return {
      MeshRenderer: (g, c) => { this._pendingMR = this._pendingMR || []; this._pendingMR.push([g, c]); },
      MeshFilter: (g, c) => { g._meshKey = refKey(c.m_Mesh); },
      Animation: (g, c) => { const a = new LegacyAnimation(g, worldAdapter, c); c.anim = a; this.anims.push(a); },
      Animator: (g, c) => { const k = refKey(c.m_Controller); if (k) { const a = new Animator(g, worldAdapter, k, { onBehaviour: (b, ph, info) => this.onStateBehaviour(g, b, ph, info) }); c.animator = a; this.anims.push(a); } },
      TextMesh: (g, c) => { c.setText = t => { if (c.mesh) c.mesh.removeFromParent(); c.mesh = textMeshMesh(c, t); g.obj.add(c.mesh); }; c.setText(c.m_Text); },
    };
  }
  finishRenderers(rootGO) {
    for (const [g, c] of this._pendingMR || []) {
      if (g._meshKey && !c.mesh) attachMeshRenderer(g, c, builtinMesh(g._meshKey));
    }
    this._pendingMR = [];
  }

  // ---------- Player (CurveFollower + SkinAnimation + SkinDisplay + PlayerController) ----------
  setupPlayer() {
    const pl = this.player, ids = this.ids;
    this.finishRenderers();
    const sa = pl.comp('SkinAnimation');
    this.skinAnim = sa;
    this.snailAnimator = ids.get(sa.m_animator.$).animator;
    this.bodyGO = pl.find('Body_proxy/Body');
    this.bodyComp = this.bodyGO.comp('MeshRenderer');
    // CurveSnapMesh: 11 columns x 2 rows, uv.x = i/10, uv.y = 0 inner / 1 outer
    const len = this.bodyGO.comp('CurveSnapMesh').m_length; this.snapLen = len;
    const geo = new THREE.BufferGeometry(); const uv = [], col = [], idx = [];
    for (let i = 0; i < len; i++) { uv.push(i / (len - 1), 0, i / (len - 1), 1); col.push(1, 1, 1, 1, 1, 1, 1, 1); if (i) { const n = i * 2 - 2; idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); } }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(len * 6), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); geo.setIndex(idx);
    attachMeshRenderer(this.bodyGO, this.bodyComp, geo);
    // the snap mesh is computed in world space; keep it out of the rotated hierarchy
    this.bodyMesh = this.bodyComp.mesh; this.bodyMesh.removeFromParent(); this.scene.add(this.bodyMesh);
    this.bodyMesh.position.z = -this.player.obj.position.z + 0; // body sits at the player's z
    this.applySkin(pl, this.skin);
    this.bodyOffset = 0;
    this.elementProxy = ids.get(sa.m_transforms[0].$).go;
    this.playerColliders = [];
    pl.walk(g => { if (g.tag === 6) for (const c of g.comps) if (COLLIDERS.has(c.type)) this.playerColliders.push(c); });
    this.trailRoot = ids.get(sa.m_trailRoot.$).go;
    setTimeout(() => this.newTrail(), 250);
    this.bonusSource = new SFX.Source(1);
  }
  applySkin(root, skin) {
    const res = A.art.resources;
    const sprites = (res[`snail_sprite_${String(skin.id).padStart(2, '0')}`] || []).filter(x => x[0] === 'sprite').map(x => x[1]);
    const bodyTex = (res[`snail_body_${String(skin.id).padStart(2, '0')}`] || []).find(x => x[0] === 'tex');
    root.walk(g => {
      const sd = g.comp('SkinDisplay'); if (!sd) return;
      for (const r of sd.m_shells || []) { const c = this.ids.get(r.$) || this.findComp(root, r.$); c && c.setSprite && c.setSprite(sprites[0]); }
      (sd.m_eyes || []).forEach((r, k) => { const c = this.ids.get(r.$) || this.findComp(root, r.$); c && c.setSprite && c.setSprite(sprites[k + 1]); });
      const bodyRef = sd.m_body && sd.m_body.$;
      const body = bodyRef ? (this.ids.get(bodyRef) || this.findComp(root, bodyRef)) : null;
      if (body && body.mesh && bodyTex) {
        const u = body.mesh.material.uniforms; u.map.value = threeTexture(bodyTex[1], { repeat: true });
        const alpha = skin.alphaTex || A.game.defaultAlpha; if (alpha && u.alphaMap) u.alphaMap.value = threeTexture(alpha, { repeat: true });
      }
    });
  }
  findComp(root, id) { let f = null; root.walk(g => { for (const c of g.comps) if (c.id === id) f = c; }); return f; }

  updatePlayer(dt) {
    const s = this.state;
    if (this.player.destroyed) return;
    if (!s.gameOver) {
      if (!s.paused) this.playerPercent += this.P.CurveFollower.m_speed * dt * this.speedCoef;
      const p = this.curve.pos(this.playerPercent, this.playerType);
      this.player.obj.position.x = p.x; this.player.obj.position.y = p.y; this.player.obj.rotation.z = p.angle * DEG;
      this.playerAngle = p.angle;
      if (this.playerPercent >= 60) this.recycle();
    }
    // CurveSnapMesh.UpdatePos (world-space vertices)
    const pos = this.bodyMesh.geometry.attributes.position; const L = this.snapLen;
    for (let i = 0; i < L; i++) {
      const q = this.playerPercent + (i - Math.floor(L / 2)) / 4;
      const a = this.curve.pos(q, this.playerType, 0.9), b = this.curve.pos(q, this.playerType, 1.4);
      pos.setXYZ(i * 2, a.x, a.y, 0); pos.setXYZ(i * 2 + 1, b.x, b.y, 0);
    }
    pos.needsUpdate = true;
    this.bodyMesh.position.z = this.player.obj.position.z;
    this.bodyMesh.visible = this.bodyComp.m_Enabled !== 0 && this.player.find('Body_proxy').activeInHierarchy;
    // SkinAnimation.Update: scroll body texture
    this.bodyOffset += this.skinAnim.m_offsetSpeed * dt * this.speedCoef; if (this.bodyOffset > 1) this.bodyOffset -= Math.floor(this.bodyOffset);
    this.bodyMesh.material.uniforms.uST.value.z = this.bodyOffset;
    this.snailAnimator.setFloat('SpeedCoef', this.speedCoef);
  }

  recycle() {
    this.curve.recycle();
    this.playerPercent -= this.curve.step;
    for (const f of this.followers) f.percent -= this.curve.step;
    for (const o of [...this.curveObjects]) {
      o.percent -= this.curve.step;
      if (o.index >= this.curve.nodes.length - 2) this.placeCurveObject(o);
      if (o.index === 0) this.release(o.go); else o.index--;
    }
    if (this.state.started) this.generateObstacles(this.curve.nodes.length - 2);
  }

  // ---------- input ----------
  pointerDown() {
    const s = this.state;
    if (this.player.destroyed || this.pc.swapping || s.paused || s.resuming) return;
    this.startGame();
    this.pc.swapping = true;
    SFX.playSFX('Swap' + rndi(1, 4));
    publish('CurveSwapStartEvent');
    this.snailAnimator.crossFade('SwapStart', 0, 1, 0);
  }
  onStateBehaviour(g, b, phase, info) {
    if (g !== this.player) return;
    if (b.m_swapEnd && phase === 'enter') this.onSwapEnd();
    if (b.m_swap && phase === 'update' && info.normalizedTime >= 1) this.onSwap();
  }
  onSwap() { // CurveSwapEvent
    this.playerType = this.playerType === Left ? Right : Left;
    this.snailAnimator.crossFade('Swap', 0, 1, 0);
    this.stopTrail();
  }
  onSwapEnd() { // CurveSwapEndEvent
    if (!this.pc) return;
    this.pc.swapping = false;
    const t = this.elementProxy.obj; t.position.y *= -1; t.scale.y *= -1;
    if (this.pc.bonusTime <= 0) this.newTrail();
  }
  newTrail() {
    if (this.player.destroyed || this.trail) return;
    const pk = refKey(this.skinAnim.m_trail); if (!pk || !prefab(pk)) return;
    this.trail = this.instantiate(pk, this.trailRoot);
  }
  stopTrail() {
    if (!this.trail) return;
    const t = this.trail; this.trail = null;
    const wp = new THREE.Vector3(); const wq = new THREE.Quaternion(); const ws = new THREE.Vector3();
    t.obj.matrixWorld.decompose(wp, wq, ws);
    t.obj.removeFromParent(); this.scene.add(t.obj); t.obj.position.copy(wp); t.obj.quaternion.copy(wq); t.obj.scale.copy(ws);
    t.detached = true;
    this.later(2, () => this.release(t)); // DestroyAfterDelay default 2 s
  }

  // ---------- GameController ----------
  startGame() {
    const s = this.state;
    if (s.started) return;
    s.started = true; s.previousBest = Game.User.m_bestScore; s.bestScore = false; s.score = 0; s.time = 0; s.gameOver = false; s.paused = false;
    s.currencyAtStart = Game.User.m_currency;
    missionResetSession();
    publish('StartGameEvent', { delay: true });
    publish('StartGameEvent', { delay: false });
  }
  onStartGame(e) {
    if (e.delay) return;
    this.timeline.play();
    for (let i = 4; i < this.curve.nodes.length - 1; i++) this.generateObstacles(i);
  }
  setupTimeline() {
    const comp = this.gcGO.comp('Animation');
    // Level clip animates ObstacleController weights, GameController.m_speedCoef, CurveController.randomAngle
    const self = this;
    const adapter = {
      resolve: () => self,
      get: () => 0,
      set: (_, type, prop, __, v) => {
        if (type === 'ObstacleController') self.oc[prop] = v;
        else if (type === 'GameController') self.gc[prop] = v;
        else if (type === 'CurveController') self.curve[prop] = v;
      },
    };
    this.timeline = new LegacyAnimation(this, adapter, { ...comp, m_PlayAutomatically: 0 });
    this.timeline.wrapMode = 8; // Once: values stay at the last sampled key after 240 s
    this.anims = this.anims.filter(a => a !== comp.anim);
    this.oc.bonusCooldown = this.oc.m_bonusDelay + rnd(-this.oc.m_randomCooldown, this.oc.m_randomCooldown);
  }
  addScore(dt) {
    const s = this.state;
    if (s.paused || !s.started || s.gameOver || s.resuming) return;
    s.time += dt; s.frames++;
    s.score += dt * this.speedCoef * this.gc.m_coefDistance;
  }
  kill() {
    const s = this.state;
    if (s.gameOver) return;
    s.gameOver = true; Game.User.m_deadCount++;
    this.later(1, () => this.gameOverNow());
  }
  gameOverNow() {
    const s = this.state, u = Game.User;
    s.bestScore = this.score > s.previousBest;
    u.m_forcedAdTime += s.time; u.m_forcedAd++;
    // forced interstitial ads are skipped on the web (no ads)
    u.m_gameCounter++; u.m_playTime += s.time | 0;
    if (s.bestScore) u.m_bestScore = this.score;
    saveUser();
    publish('GameOverEvent', { score: this.score, newBest: s.bestScore, currency: s.currencyEarned, timer: s.time });
  }

  // ---------- ObstacleController ----------
  pickPattern() {
    const o = this.oc, w = [o.m_weightVeryEasy, o.m_weightEasy, o.m_weightMedium, o.m_weightHard, o.m_weightVeryHard];
    const max = w.reduce((a, b) => a + b, 0); const n = rnd(0, max);
    const pats = d => A.game.patterns.filter(p => p.m_difficulty === d);
    let acc = 0;
    for (let d = 0; d < 4; d++) { acc += w[d]; if (n <= acc) { const l = pats(d); return l[rndi(0, l.length)]; } }
    const l = pats(4); return l[rndi(0, l.length)];
  }
  generateObstacles(index) {
    const pat = this.pickPattern(); const reverse = rndi(0, 2) === 0;
    const step = this.curve.step;
    for (let i = 0; i < 8; i++) {
      const pct = index * step + (i / 8) * step;
      const line = pat.m_lines[i];
      if (line.m_left) this.generateObstacle(index, i, pct, reverse, line.m_left, Left);
      if (line.m_right) this.generateObstacle(index, i, pct, reverse, line.m_right, Right);
    }
  }
  generateObstacle(index, block, pct, reverse, type, side) {
    if (type === 8 && this.oc.bonusCooldown <= 0) { type = 9; this.oc.bonusCooldown = this.oc.m_bonusCooldown + rnd(-this.oc.m_randomCooldown, this.oc.m_randomCooldown); }
    if (reverse) side = side === Left ? Right : Left;
    const key = this.oc.m_obstacles[type - 1].$;
    const g = this.instantiate(key);
    const co = this.curveObjectOf(g);
    if (co) this.setIndex(co, index, block, pct, side);
  }

  // ---------- generic instantiate / behaviours for spawned prefabs ----------
  instantiate(key, parent = null, at = null) {
    const ids = new Map();
    const g = buildNode(prefab(key), ids, this.hooks());
    g.ids = ids; g.prefabKey = key;
    this.finishRenderers(g);
    (parent ? parent.obj : this.scene).add(g.obj); if (parent) { g.parent = parent; parent.children.push(g); }
    if (at) { g.obj.position.x = at.x; g.obj.position.y = at.y; }
    this.objects.add(g);
    this.attachBehaviours(g, ids);
    this.app.particles && this.app.particles.attachTo(this, g);
    return g;
  }
  release(g) {
    if (!g || g.destroyed) return;
    g.walk(x => { for (const c of x.comps) { if (c.anim) this.anims = this.anims.filter(a => a !== c.anim); if (c.animator) this.anims = this.anims.filter(a => a !== c.animator); if (c.audio) c.audio.stop(); } });
    this.curveObjects = this.curveObjects.filter(o => o.go !== g);
    this.followers = this.followers.filter(f => f.go !== g);
    this.spawners = this.spawners.filter(s => s.go !== g);
    this.colliders = this.colliders.filter(c => !isUnder(c.comp.go, g));
    this.updaters = this.updaters.filter(u => !isUnder(u.go, g));
    this.objects.delete(g);
    this.app.particles && this.app.particles.detach(g);
    g.destroy();
  }
  curveObjectOf(g) { return this.curveObjects.find(o => o.go === g) || null; }
  attachBehaviours(root, ids) {
    const self = this;
    root.walk(g => {
      for (const c of g.comps) {
        switch (c.type) {
          case 'CurveObject': {
            const o = { go: g, comp: c, percent: 0, index: 0, block: 0, type: Left, dodge: false,
              obstacle: c.m_obstacle && ids.get(c.m_obstacle.$), destroyable: c.m_destroyable && ids.get(c.m_destroyable.$),
              follower: null, audio: null };
            if (c.m_audioSource && c.m_audio) { o.audio = new SFX.Source(1); c.audio = o.audio; o.audio.play(c.m_audio, true); }
            if (c.m_audioSourceSwap) { o.swapAudio = new SFX.Source(1); }
            c.behaviour = o; this.curveObjects.push(o);
            break;
          }
          case 'CurveFollower': {
            const f = { go: g, comp: c, percent: c.m_percent, speed: c.m_speed, type: c.m_type };
            c.behaviour = f; this.followers.push(f); break;
          }
          case 'CurveSpawner': this.spawners.push({ go: g, comp: c, triggered: false }); break;
          case 'Obstacle': case 'Destroyable': case 'Collectable': case 'Bonus':
            c.behaviour = c.behaviour || {};
            if (c.type === 'Destroyable') c.isDestroy = false;
            if (c.type === 'Obstacle') c.collision = false;
            break;
          case 'TimeTrigger': {
            const t = { go: g, comp: c, time: 0, canceled: false };
            c.behaviour = t;
            t.setOffset = off => { t.time = -off * c.m_timer; t.canceled = false; };
            this.updaters.push({ go: g, update: dt => {
              if (t.canceled) return; t.time += dt * self.speedCoef;
              if (t.time > c.m_timer) { t.time -= c.m_timer; self.invokeEvent(c.m_event, ids); if (!c.m_loop) t.canceled = true; }
            } });
            break;
          }
          case 'AutoRotate': this.updaters.push({ go: g, update: dt => { g.obj.rotateZ(c.m_rotation.z * dt * self.speedCoef * DEG); } }); break;
          case 'AutoMove': { const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z); c.dir = { x: Math.cos(a) * r, y: Math.sin(a) * r };
            this.updaters.push({ go: g, update: dt => { g.obj.position.x += c.dir.x * c.m_speed * dt; g.obj.position.y += c.dir.y * c.m_speed * dt; } }); break; }
          case 'ReleaseAfterDelay': this.later(c.m_delay, () => self.release(root)); break;
          case 'DestroyAfterDelay': this.later(c.m_delay ?? 2, () => self.release(root)); break;
          case 'OffsetStartAnimation': {
            const anim = c.m_animation ? ids.get(c.m_animation.$) : g.comp('Animation');
            const ator = c.m_animator ? ids.get(c.m_animator.$) : g.comp('Animator');
            c.setOffset = off => {
              if (anim && anim.anim) { anim.anim.stop(); anim.anim.play(); anim.anim.setNormalizedTime(off); }
              if (ator && ator.animator) { const a = ator.animator; const l = a.layers[0]; if (l) { const cl = clip(l.L.states[l.state].clips[0]); l.time = off * (cl ? cl.length : 0); } }
            };
            c.setOffset(Math.random());
            break;
          }
          case 'CurveOffsetAnimation': c.update = () => { const co = c.m_curveObject && ids.get(c.m_curveObject.$); const so = c.m_startAnimation && ids.get(c.m_startAnimation.$); if (co && so && so.setOffset) so.setOffset(1 - (co.behaviour.block % 8) * 0.125); }; break;
          case 'ResetAnimation': { const a = c.m_animation && ids.get(c.m_animation.$); if (a && a.anim) a.anim.setNormalizedTime(0); break; }
          case 'SkinDisplay': if (c.m_useSkinSelected) this.pendingSkin = (this.pendingSkin || []).concat(root); break;
        }
        if (COLLIDERS.has(c.type) && c.m_IsTrigger) this.colliders.push({ comp: c, inside: false, root });
      }
    });
    if (this.pendingSkin) { for (const r of this.pendingSkin) this.applySkin(r, this.skin); this.pendingSkin = null; }
  }
  invokeEvent(ev, ids) {
    for (const call of (ev && ev.m_PersistentCalls && ev.m_PersistentCalls.m_Calls) || []) {
      const t = call.m_Target && ids.get(call.m_Target.$);
      if (!t) continue;
      if (call.m_MethodName === 'Swap' && t.type === 'CurveObject') this.swapCurveObject(t.behaviour);
      else if (call.m_MethodName === 'CrossFade' && t.type === 'AnimationTrigger') { const a = ids.get(t.m_animator.$); a && a.animator && a.animator.crossFade(t.m_state, t.m_transitionDuration, 0, 0); }
      else if (call.m_MethodName === 'Trigger' && t.type === 'AudioEmitter') SFX.playSFX(t.m_key);
    }
  }
  setIndex(o, index, block, pct, side) {
    o.index = index; o.block = block; o.percent = pct; o.type = side;
    this.placeCurveObject(o);
    const g = o.go;
    const tt = g.comp('TimeTrigger'); if (tt && tt.behaviour) tt.behaviour.setOffset(-0.25 + (block % 8) * 0.25);
    const coa = g.comp('CurveOffsetAnimation'); if (coa && coa.update) coa.update();
  }
  placeCurveObject(o) {
    const p = this.curve.pos(o.percent, o.type);
    const g = o.go;
    g.obj.position.x = p.x; g.obj.position.y = p.y;
    if (o.comp.m_autoFlip) { const sx = g.obj.scale.x; if ((o.type === Left && sx > 0) || (o.type === Right && sx < 0)) g.obj.scale.x = -sx; }
    g.obj.rotation.z = (p.angle + (o.type === Left ? 180 : 0)) * DEG;
  }
  swapCurveObject(o) {
    const s = this.state;
    if (s.gameOver || s.paused || (o.destroyable && o.destroyable.isDestroy)) return;
    if (o.swapAudio && o.comp.m_audioSwap) o.swapAudio.play(o.comp.m_audioSwap, false);
    o.type = o.type === Left ? Right : Left;
    this.placeCurveObject(o);
  }

  updateObjects(dt) {
    const s = this.state, sc = this.speedCoef;
    if (this.oc.bonusCooldown > 0 && !s.paused && s.started) this.oc.bonusCooldown -= dt;
    // followers (non-player)
    for (const f of [...this.followers]) {
      if (!s.paused) f.percent += f.speed * dt * sc;
      const p = this.curve.pos(f.percent + (f.comp.m_offset || 0), f.type);
      const g = f.go; g.obj.position.x = p.x; g.obj.position.y = p.y;
      g.obj.rotation.z = (p.angle + (f.type === Left ? 180 : 0)) * DEG;
      if (f.percent < 0) this.release(g);
    }
    // spawners (CurveSpawner)
    for (const sp of [...this.spawners]) {
      if (sp.triggered) continue;
      const o = sp.go.comp('CurveObject').behaviour;
      if (this.playerPercent >= o.percent - sp.comp.m_offsetTrigger) {
        sp.triggered = true;
        const num = o.percent + (o.percent - this.playerPercent);
        const g = this.instantiate(sp.comp.m_prefab.$);
        const p = this.curve.pos(num, o.type); g.obj.position.x = p.x; g.obj.position.y = p.y;
        const f = this.followers.find(x => x.go === g); if (f) { f.percent = num; f.type = o.type; }
        const co = this.curveObjectOf(g); if (co) this.setIndex(co, o.index, o.block, num, o.type);
      }
    }
    // CurveObject.Update: animation speed + dodge detection
    for (const o of this.curveObjects) {
      o.go.walk(x => { for (const c of x.comps) { if (c.anim) c.anim.speed = sc; if (c.animator) c.animator.speed = sc; } });
      if (o.destroyable && o.destroyable.isDestroy && o.audio && o.audio.isPlaying) o.audio.stop();
      if (o.obstacle && !o.obstacle.collision && o.index === 2 && !o.dodge && !(o.destroyable && o.destroyable.isDestroy)) {
        const f = this.followers.find(x => x.go === o.go); const pct = f ? f.percent : o.percent;
        if (this.playerPercent > pct) { o.dodge = true; missionOnDodge(!!o.comp.m_bug, this.skin.id); publish('DodgeEvent', { bug: !!o.comp.m_bug }); }
      }
    }
    for (const u of [...this.updaters]) u.update(dt);
  }

  // ---------- triggers ----------
  checkTriggers() {
    const pcs = this.playerColliders.filter(c => !c.go.destroyed && c.go.activeInHierarchy);
    const pshapes = pcs.map(colliderShape);
    for (const t of [...this.colliders]) {
      const c = t.comp; if (c.go.destroyed) continue;
      if (!c.go.activeInHierarchy || c.m_Enabled === 0) { t.inside = false; continue; }
      const sh = colliderShape(c);
      const hit = pshapes.some(ps => overlap(ps, sh));
      if (hit && !t.inside) this.onTriggerEnter(c.go, t.root);
      t.inside = hit;
    }
  }
  onTriggerEnter(g, root) {
    for (const c of g.comps) {
      if (g.destroyed) return;
      switch (c.type) {
        case 'Obstacle': { const d = c.m_destroyable && root.ids.get(c.m_destroyable.$); if (!d || !d.isDestroy) { c.collision = true; this.onObstacle(); } break; }
        case 'Destroyable': if (!c.isDestroy) { SFX.playSFX(c.m_audio); this.destroyDestroyable(c, root, this.pc.bonusTime > 0); } break;
        case 'Collectable': this.spawnFx(refKey(c.m_impact), g); this.onCollect(); this.release(root); return;
        case 'Bonus': SFX.playSFX('Bonus'); this.onBonus(); this.release(root); return;
      }
    }
  }
  destroyDestroyable(c, root, score) {
    if (c.isDestroy || !c.go.activeInHierarchy) return;
    c.isDestroy = true;
    for (const r of c.m_gameObjects || []) { const x = root.ids.get(r.$); if (x && x.setActive) x.setActive(false); }
    if (c.m_spriteRenderer) { const sr = root.ids.get(c.m_spriteRenderer.$); sr && sr.setEnabled(false); }
    this.spawnFx(refKey(c.m_impact), c.go);
    if (c.m_impactSprite) this.spawnFx(refKey(c.m_impactSprite), c.go);
    this.shake = { t: 0.25, x: 0.25, y: 0.25 };
    const wp = c.go.worldPos();
    this.onDestroyEvent(wp, score, !!c.m_bug);
  }
  spawnFx(key, at) {
    if (!key || !prefab(key)) return null;
    const wp = at.worldPos ? at.worldPos() : at;
    const g = this.instantiate(key, null, wp);
    return g;
  }
  onDestroyEvent(pos, score, bug) {
    missionOnDestroy(bug, this.skin.id);
    if (!score) return;
    const s = this.state; s.combo++; s.score += s.combo;
    publish('ScoreUpdateEvent', { best: s.score > s.previousBest });
    const g = this.spawnFx(refKey(this.gcGO.comp('GameController').m_scoreIncrement), pos);
    if (g) { const tm = g.compDeep('TextMesh'); tm && tm.setText('+' + s.combo); const k = 1 + (2 - 1) * Math.min(1, s.combo / 10); g.obj.scale.set(k, k, k); }
  }
  onCollect() {
    SFX.playSFX('Currency');
    addCurrency(1);
    missionOnCollect(this.skin.id);
    this.state.currencyEarned = Game.User.m_currency - this.state.currencyAtStart;
    publish('CollectEvent'); publish('CurrencyUpdateEvent');
  }
  onObstacle() { // PlayerController.HandleEvent(ObstacleEvent)
    const pc = this.pc;
    if (!(pc.bonusTime <= 0) || !(pc.invincibleTime <= 0)) return;
    this.onHit();
    if (!pc.life) {
      SFX.playSFX('Hit2');
      publish('KillEvent'); this.stopTrail();
      const dead = this.spawnFx(refKey(this.player.comp('PlayerController')?.m_impact) || 'a1_607', this.player);
      if (dead) { const am = dead.comp('AutoMove'); if (am) am.m_speed = this.speedCoef * 6; }
      this.kill();
      this.release(this.player);
    } else {
      SFX.playSFX('Hit');
      pc.life = false; pc.invincibleTime = 2;
      this.snailAnimator.setBool('Invincible', true);
      this.updateShield(true);
    }
  }
  onHit() { // SkinAnimation.HandleEvent(HitEvent)
    this.spawnFx(refKey(this.skinAnim.m_hitParticle), this.player);
    const ia = this.ids.get(this.skinAnim.m_impactAnimation.$); ia && ia.anim && ia.anim.play();
    publish('HitEvent');
  }
  updateShield(remove) {
    const sh = this.ids.get(this.skinAnim.m_shield.$); sh && sh.setActive(!remove);
    if (remove && sh) { this.spawnFx(refKey(this.skinAnim.m_impactSprite), sh); this.spawnFx(refKey(this.skinAnim.m_impact), sh); }
  }
  onBonus() {
    const pc = this.pc;
    if (!pc.life) { pc.life = true; this.updateShield(false); }
    pc.bonusState = 1; pc.bonusTime = 8;
    this.updateBonus(true);
    this.bonusSource.play('BonusLoop', true);
  }
  updateBonus(enabled) {
    const sa = this.skinAnim;
    if (enabled) {
      const b = this.ids.get(sa.m_bonus.$); const fx = this.spawnFx(refKey(sa.m_bonusParticle), b);
      if (fx) { fx.obj.removeFromParent(); this.player.obj.add(fx.obj); const lp = this.player.obj.worldToLocal(new THREE.Vector3(fx.obj.position.x, fx.obj.position.y, fx.obj.position.z)); fx.obj.position.copy(lp); }
      const bg = this.ids.get(sa.m_bonusBackground.$); bg && bg.setEnabled && bg.setEnabled(true);
      this.stopTrail();
    } else this.state.combo = 0;
    this.snailAnimator.setBool('Bonus', enabled);
    const col = this.ids.get(sa.m_collider.$); col && col.setActive(!enabled);
    publish('UpdateBonusEvent', { enabled });
  }
  updatePlayerController(dt) {
    const pc = this.pc, s = this.state;
    if (pc.bonusTime > 0 && !s.paused && !s.resuming) {
      pc.bonusTime -= dt;
      if (pc.bonusTime < 1 && pc.bonusState === 1) { pc.bonusState = 2; this.snailAnimator.setBool('Bonus', false); publish('BonusWillEndEvent'); }
      if (pc.bonusTime < 0.1 && pc.bonusState === 2) { pc.bonusState = 3; this.onBonusEnd(); }
      if (pc.bonusTime <= 0 && pc.bonusState === 3) { pc.bonusState = 0; this.updateBonus(false); }
    }
    if (pc.invincibleTime > 0 && !s.paused && !s.resuming) {
      pc.invincibleTime -= dt;
      if (pc.invincibleTime <= 0) this.snailAnimator.setBool('Invincible', false);
    }
  }
  onBonusEnd() {
    // GameController: stop loop + flash ; SkinAnimation: bonus anim, particle, sound, trail ; Destroyable: destroy all (no score)
    this.bonusSource.stop();
    publish('BonusEndEvent');
    const sa = this.skinAnim;
    const ba = this.ids.get(sa.m_bonusAnimation.$); ba && ba.anim && ba.anim.play();
    this.spawnFx(refKey(sa.m_bonusParticle), this.ids.get(sa.m_bonus.$));
    SFX.playSFX('BonusEnd');
    this.newTrail();
    for (const o of [...this.objects]) o.walk(g => { for (const c of g.comps) if (c.type === 'Destroyable' && !c.isDestroy && g.activeInHierarchy) this.destroyDestroyable(c, o, false); });
  }

  // ---------- camera ----------
  updateCamera(dt, immediate = false) {
    if (this.player.destroyed) return;
    const ang = this.curve.cameraAngle(this.playerPercent);
    const target = 10 + (15 - 10) * (ang / 90);
    this.orthoSize += (target - this.orthoSize) * Math.min(1, dt * 2);
    if (!this.state.gameOver || immediate) {
      const p = this.curve.pos(this.playerPercent + this.camOffset, Center);
      this.rig.obj.position.x = p.x; this.rig.obj.position.y = p.y;
    }
    const goal = this.pc.bonusTime > 0 ? this.P.CurveCamera.m_offset / 2 : this.P.CurveCamera.m_offset;
    this.camOffset += (goal - this.camOffset) * Math.min(1, dt);
  }
  applyCamera(aspect) {
    const h = this.orthoSize, w = h * aspect;
    this.cam.left = -w; this.cam.right = w; this.cam.top = h; this.cam.bottom = -h; this.cam.updateProjectionMatrix();
    let sx = 0, sy = 0;
    if (this.shake && this.shake.t > 0) { sx = (Math.random() * 2 - 1) * this.shake.x; sy = (Math.random() * 2 - 1) * this.shake.y; }
    this.camGO.obj.position.x = sx; this.camGO.obj.position.y = sy;
    // BackgroundParallax
    const bp = this.camGO.comp('BackgroundParallax');
    if (bp) bp.m_materials.forEach((m, i) => forMaterial(m.$, mat => { mat.uniforms.uST.value.z = this.rig.obj.position.x * -bp.m_coefs[i] * this.gc.m_speedCoef; mat.uniforms.uST.value.w = this.rig.obj.position.y * -bp.m_coefs[i] * this.gc.m_speedCoef; }));
  }

  // ---------- EnvironmentController ----------
  setupEnvironment() {
    this.finishRenderers();
    const ec = this.rig.comp('EnvironmentController');
    const envs = A.game.environments, u = Game.User;
    let idx = SceneGame.lastEnv;
    if (SceneGame.lastGameCount !== u.m_gameCounter) {
      SceneGame.lastGameCount = u.m_gameCounter;
      idx = rndi(0, envs.length); let guard = 0;
      while (SceneGame.lastEnv === idx && guard++ < 50) idx = rndi(0, envs.length);
      SceneGame.lastEnv = idx;
    }
    const rain = SceneGame.lastGameCount % 4 === 3;
    const env = envs[idx]; this.env = env; this.rain = rain;
    const c4 = c => [c.r, c.g, c.b, c.a];
    forMaterial(ec.m_glow.$, m => m.uniforms.uTint.value.set(...c4(env.glow)));
    forMaterial(ec.m_background.$, m => { m.uniforms.uTop.value.set(...c4(env.top)); m.uniforms.uBottom.value.set(...c4(env.bottom)); });
    forMaterial(ec.m_glowParticle.$, m => m.uniforms.uTint.value.set(...c4(env.glow)));
    forMaterial(ec.m_rain.$, m => m.uniforms.uTint.value.set(...c4(env.glow)));
    this.curveTexKey = env.curve;
    this.ids.get(ec.m_rainRoot.$).setActive(rain);
    this.ids.get(ec.m_glowRoot.$).setActive(!rain);
    this.ids.get(ec.m_rainRoot.$).obj.rotateZ(rnd(10, 25) * Math.sign(rnd(-1, 1)) * DEG);
    this.music = rain ? 'Rain' : env.audio;
    this.buildCurveLine();
    // Rain: RandomStartAnimation + thunder AudioEmitter
    const rr = this.ids.get(ec.m_rainRoot.$);
    const rsa = rr.comp('RandomStartAnimation');
    if (rsa) { let cur = rnd(rsa.m_delayMin, rsa.m_delayMax); const an = this.ids.get(rsa.m_animation.$);
      if (an && an.anim) an.anim.onEvent = e => { if (e.fn === 'Trigger' && rr.activeInHierarchy) SFX.playSFX('Thunder'); };
      this.updaters.push({ go: rr, update: dt => { if (cur > 0) { cur -= dt; if (cur <= 0) { an && an.anim && an.anim.play(); if (rsa.m_repeat) cur = rnd(rsa.m_delayMin, rsa.m_delayMax); } } } }); }
  }
  // CurveRendering: LineRenderer width 2, Stretch texture mode, 1 + 5*accuracy points
  buildCurveLine() {
    const cr = this.P.CurveRendering; const n = 1 + (this.curve.nodes.length - 1) * cr.accuracy;
    const geo = new THREE.BufferGeometry(); const uv = [], col = [], idx = [];
    for (let i = 0; i < n; i++) { uv.push(i / (n - 1), 1, i / (n - 1), 0); col.push(1, 1, 1, 1, 1, 1, 1, 1); if (i) { const k = i * 2 - 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); geo.setIndex(idx);
    const comp = { m_Materials: [{ $: 'a1_12' }], m_Enabled: 1 };
    const holder = new GO('CurveLine'); this.scene.add(holder.obj);
    attachMeshRenderer(holder, comp, geo);
    comp.mesh.material.uniforms.map.value = threeTexture(this.curveTexKey);
    comp.mesh.renderOrder = -1;
    this.curveLine = { mesh: comp.mesh, n, width: cr.width, accuracy: cr.accuracy };
  }
  updateCurveLine() {
    const L = this.curveLine, pos = L.mesh.geometry.attributes.position, nodes = this.curve.nodes;
    const pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const [a, b, c, d] = this.curve.control(i);
      for (let k = 0; k < L.accuracy; k++) { const t = k / L.accuracy;
        const f = (p1, p2, p3, p4) => 0.5 * (2 * p2) + 0.5 * (p3 - p1) * t + 0.5 * (2 * p1 - 5 * p2 + 4 * p3 - p4) * t * t + 0.5 * (-p1 + 3 * p2 - 3 * p3 + p4) * t * t * t;
        pts.push({ x: f(a.x, b.x, c.x, d.x), y: f(a.y, b.y, c.y, d.y) }); }
    }
    pts.push(nodes[nodes.length - 1]);
    const hw = L.width / 2;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      pos.setXYZ(i * 2, pts[i].x - ty * hw, pts[i].y + tx * hw, 0.01); pos.setXYZ(i * 2 + 1, pts[i].x + ty * hw, pts[i].y - tx * hw, 0.01);
    }
    pos.needsUpdate = true;
  }

  // ---------- timers ----------
  later(sec, fn) { this.updaters.push({ go: null, t: sec, update(dt) { this.t -= dt; if (this.t <= 0) { fn(); this.done = true; } } }); }

  update(dtRaw) {
    const s = this.state;
    const dt = s.resuming ? 0 : dtRaw; // Time.timeScale = 0 while the resume countdown runs
    this.updatePlayerController(dt);
    this.addScore(dt);
    if (this.timeline.playing && !s.paused) this.timeline.update(dt);
    this.updatePlayer(s.paused ? 0 : dt);
    this.updateObjects(s.paused ? 0 : dt);
    this.updaters = this.updaters.filter(u => !u.done);
    for (const a of this.anims) a.update(s.paused ? 0 : dt);
    this.checkTriggers();
    if (this.shake) this.shake.t -= dtRaw;
    this.updateCamera(dt);
    this.updateCurveLine();
    missionUpdate(dt, { started: s.started, paused: s.paused, resuming: s.resuming, gameOver: s.gameOver, time: s.time, score: this.score,
      speedCoef: this.speedCoef, coefDistance: this.gc.m_coefDistance, skinId: this.skin.id });
    this.app.particles && this.app.particles.update(this, s.paused ? 0 : dt);
  }
  pause(b) {
    this.state.paused = b;
    for (const o of this.curveObjects) if (o.audio) b ? o.audio.pause() : o.audio.unpause();
    if (b) this.bonusSource.pause(); else if (this.pc.bonusTime > 0) this.bonusSource.unpause();
  }
  dispose() {
    clearScope(this.scope);
    for (const o of this.curveObjects) o.audio && o.audio.stop();
    this.bonusSource.stop();
    this.scene.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}
SceneGame.lastEnv = -1; SceneGame.lastGameCount = -1;
function isUnder(g, root) { while (g) { if (g === root) return true; g = g.parent; } return false; }
