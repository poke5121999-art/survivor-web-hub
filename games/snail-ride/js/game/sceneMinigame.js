// SceneMinigame (level2) port: MinigameSystem + MinigameSkin (claw machine that wins snail skins).
import { THREE, buildNode, sceneRoots, worldAdapter } from '../engine/world.js?v=20261102c';
import { A, refKey } from '../engine/assets.js?v=20261102c';
import { SceneGame } from './sceneGame.js?v=20261102c';
import { publish, subscribe, clearScope } from './events.js?v=20261102c';
import { Game, saveUser, timestamp, rnd, rndi } from './user.js?v=20261102c';
import * as SFX from './audio.js?v=20261102c';
import { randomSkin, NEW_SKIN_TEMPLATE } from './systems.js?v=20261102c';

export class SceneMinigame {
  constructor(app) {
    this.app = app; this.scope = []; this.objects = new Set(); this.anims = []; this.updaters = [];
    this.curveObjects = []; this.followers = []; this.spawners = []; this.colliders = [];
    this.scene = new THREE.Scene();
    this.state = { started: false, paused: false, resuming: false, gameOver: true };
    this.skin = randomSkin(false, false);
    this.music = 'MusicMinigame';
    this.price = A.game.priceMinigame;
    this.build();
  }
  get speedCoef() { return 1; }
  on(n, fn) { this.scope.push(subscribe(n, fn)); }
  build() {
    const ids = new Map(); this.ids = ids; this.rootGOs = [];
    for (const r of sceneRoots('level2').filter(r => !['HUDMinigame', 'EventSystem'].includes(r.name))) {
      const g = buildNode(r, ids, this.hooks()); this.scene.add(g.obj); this.rootGOs.push(g);
    }
    this.finishRenderers();
    for (const g of this.rootGOs) this.attachBehaviours(g, ids);
    const camGO = this.rootGOs.find(g => g.name === 'Main Camera');
    const cc = camGO.comp('Camera');
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, cc['near clip plane'], cc['far clip plane']);
    this.orthoSize = cc['orthographic size']; camGO.obj.add(this.cam);
    this.clearColor = cc.m_BackGroundColor;
    const sys = this.rootGOs.find(g => g.name === 'System').comp('MinigameSystem');
    this.sys = sys;
    this.hook = ids.get(sys.m_hook.$).go || ids.get(sys.m_hook.$);
    this.hookAnimator = ids.get(sys.m_animatorHook.$).animator;
    this.hookSprite = ids.get(sys.m_hookSpriteRenderer.$);
    this.hookSnaps = sys.m_hookSnap.map(r => ids.get(r.$).go);
    this.hookRoot = sys.m_hookRoot ? ids.get(sys.m_hookRoot.$).go : null;
    this.hookNet = ids.get(sys.m_hookNet.$); this.hookNet2 = ids.get(sys.m_hookNet2.$);
    this.hookSound = new SFX.Source(1);
    this.skins = sys.m_skins.map(r => ids.get(r.$));
    this.app.particles && this.app.particles.attach(this);
    this.hookCoef = 1; this.snapped = false; this.diving = false; this.hookDive = -40; this.hookDiveOriginY = 0; this.displayDelay = 0;
    this.retryTimer = 9; this.retryUsed = false; this.catch = false; this.freeRetry = false; this.skinCatched = null;
  }
  // Called by the UI layer once HUDMinigame exists (needs its nodes for menu / retry)
  start(ui) {
    this.ui = ui;
    MinigameLoop.loopDisplay = 0;
    this.hook.setActive(false);
    const u = Game.User;
    const remove = [], fresh = [];
    if (u.m_skins.length <= 1) { remove.push(1, 2, 4, 5); fresh.push(1, 2, 3, 4, 5); }
    else if (u.m_skins.length <= 2) { remove.push(1, 5); fresh.push(2, 4); }
    else if (u.m_skins.length <= 10) { remove.push(1, 5); fresh.push(NEW_SKIN_TEMPLATE[u.m_minigameCount % NEW_SKIN_TEMPLATE.length]); }
    else { if (u.m_skins.length <= 30) remove.push(5); fresh.push(NEW_SKIN_TEMPLATE[u.m_minigameCount % NEW_SKIN_TEMPLATE.length]); }
    const aspect = this.app.w / this.app.h; this.boundsX = this.orthoSize * aspect;
    for (let i = this.skins.length - 1; i >= 0; i--) {
      const ms = this.skins[i];
      if (remove.includes(i + 1)) { ms.go.setActive(false); this.skins.splice(i, 1); continue; }
      this.setSkinSetting(ms, randomSkin(fresh.includes(i + 1), true));
      // MinigameSkin.Start
      const t = this.ids.get(ms.m_transform.$).go;
      t.obj.position.x = rnd(-this.boundsX + 1, this.boundsX - 1);
      if (rndi(0, 2) > 0) { ms.coef = -1; t.obj.scale.x = -1; } else ms.coef = 1;
      ms.speed = rnd(8, 14); ms.t = t;
    }
    this.pay();
  }
  setSkinSetting(ms, s) {
    ms.setting = s; ms.catched = false;
    const holder = ms.go; this.applySkin(holder, s);
    this.updateNew(ms);
  }
  updateNew(ms) { ms.isNew = !ms.catched && !Game.User.m_skins.includes(ms.setting.id); this.ui && this.ui.onSkinNew && this.ui.onSkinNew(ms); }
  pay() {
    const u = Game.User;
    if (u.m_currency < this.price) return false;
    this.displayDelay = 1; u.m_minigameCount++;
    if (u.m_minigameCount === 1 && !u.m_mission) u.m_nextMissionTimestamp = timestamp();
    this.hook.setActive(true); this.hookAnimator.crossFade('Display', 0, 0, 0);
    u.m_currency -= this.price;
    this.hookAnimator.setBool('Blink', true);
    publish('MinigameStartEvent'); publish('CurrencyUpdateEvent'); saveUser();
    return true;
  }
  triggerDive() {
    if (this.diving || this.displayDelay > 0) return;
    this.hookDiveOriginY = this.hook.obj.position.y; this.diving = true; this.hookCoef = -1;
    this.hookAnimator.setBool('Blink', false);
    this.hookSound.play('HookMovingDown', true);
  }
  checkSnap() {
    const v = new THREE.Vector3();
    for (const ms of this.skins) {
      if (this.snapped) break;
      for (const h of this.hookSnaps) {
        const tp = ms.t.worldPos(), hp = h.worldPos();
        if (Math.hypot(tp.x - hp.x, tp.y - hp.y) <= 2.5) {
          SFX.playSFX('HookCatching'); this.skinCatched = ms.setting; this.snapped = true;
          const holder = this.hookRoot || h;
          ms.catched = true;
          // MinigameSkin.Catch: parent to the hook, shadow stays at x 0, animator "Catched"
          const shadow = ms.m_shadow ? this.ids.get(ms.m_shadow.$) : null;
          if (shadow) { const sg = shadow.go; const wp = new THREE.Vector3(); sg.obj.getWorldPosition(wp); sg.obj.removeFromParent(); this.scene.add(sg.obj); sg.obj.position.set(0, wp.y, wp.z); ms.shadow = shadow; }
          ms.t.obj.removeFromParent(); holder.obj.add(ms.t.obj); ms.t.obj.position.set(0, 0, 0); ms.t.obj.quaternion.identity();
          const root = this.ids.get(ms.m_root.$).go; root.obj.position.set(0, 0, 0);
          const an = ms.m_animator && this.ids.get(ms.m_animator.$); an && an.animator && an.animator.crossFade('Catched', 0);
          this.updateNew(ms);
          if (this.hookSprite && A.game.hook.m_hookCatch) this.hookSprite.setSprite(this.freeRetry ? A.game.hook.m_hookDoubleCatch : A.game.hook.m_hookCatch);
          break;
        }
      }
    }
  }
  reset(freeRetry = false) {
    this.freeRetry = freeRetry;
    this.ui && this.ui.setMenu(true);
    if (this.skinCatched) for (let i = this.skins.length - 1; i >= 0; i--) if (this.skins[i].catched) { this.skins[i].t.obj.removeFromParent(); if (this.skins[i].shadow) this.skins[i].shadow.go.obj.removeFromParent(); this.skins.splice(i, 1); }
    this.app.blurReset && this.app.blurReset(); // BlurSystem.BlurStop
    this.hook.obj.position.y = this.hookDiveOriginY;
    this.diving = false; this.skinCatched = null; this.snapped = false; this.hookCoef = 1; this.catch = false;
    this.ui && this.ui.setRetry(false);
    this.hookAnimator.setBool('Blink', true);
    this.ui && this.ui.setHookIcon(freeRetry);
    if (this.hookSprite) this.hookSprite.setSprite(freeRetry ? A.game.hook.m_hookDouble : A.game.hook.m_hookNormal);
    const goOf = x => x && (x.go || x); goOf(this.hookNet) && goOf(this.hookNet).setActive(!freeRetry); goOf(this.hookNet2) && goOf(this.hookNet2).setActive(freeRetry);
  }
  retryPay() {
    const u = Game.User;
    if (u.m_currency < this.price) return;
    this.retryUsed = true; u.m_currency -= this.price; publish('CurrencyUpdateEvent'); saveUser(); this.reset();
  }
  retryAd() { this.retryUsed = true; Game.User.m_adWatchCount++; publish('WatchAdEvent', { type: 'HookRetry' }); this.reset(); }
  retryFree() { this.retryUsed = true; this.reset(true); }
  closeRetry() { this.ui && this.ui.setRetry(false); this.newSkin(); }
  newSkin() {
    this.ui && this.ui.setMenu(false);
    if (this.popupShown) return;
    this.popupShown = true;
    SFX.playSFX('SkinUnlock');
    const s = this.skinCatched, u = Game.User;
    if (!u.m_skins.includes(s.id)) { u.m_newSkin = s.id; u.m_skins.push(s.id); publish('NewSkinEvent', { type: 'Minigame', id: s.id }); }
    saveUser();
    this.ui && this.ui.showNewSkin(s);
  }
  skinReward() {
    const u = Game.User;
    const free = u.m_skins.includes(46), ad = true, canRetry = free || ad || u.m_currency >= this.price;
    if (!u.m_skins.includes(this.skinCatched.id) || !canRetry || this.retryUsed) { this.newSkin(); return; }
    u.m_minigameFailCount++; saveUser();
    this.retryTimer = 9;
    this.ui && this.ui.showRetry({ free, canPay: u.m_currency >= this.price, ad });
  }
  update(dt) {
    if (this.displayDelay > 0) this.displayDelay -= dt;
    if (this.ui && this.ui.retryVisible && this.ui.retryVisible() && this.retryTimer > 0) {
      this.retryTimer -= dt;
      if (this.retryTimer <= 0) this.closeRetry();
      this.ui.setRetryCounter(Math.floor(1 + Math.max(0, this.retryTimer)));
    }
    const h = this.hook.obj;
    if (this.diving) {
      this.ui && this.ui.setHookEnabled(false);
      let sp = this.sys.m_hookSpeedY; if (this.snapped) sp *= 2;
      h.position.y += this.hookCoef * dt * sp;
      if (!this.snapped) this.checkSnap();
      if ((this.snapped || h.position.y <= this.hookDiveOriginY + this.hookDive) && this.hookCoef < 0) {
        this.hookSound.stop(); this.hookSound.play('HookMovingUp', false); this.hookCoef = 1;
      } else if (h.position.y >= this.hookDiveOriginY && this.hookCoef > 0) {
        this.hookSound.stop();
        if (this.skinCatched) { if (!this.catch) { this.catch = true; this.skinReward(); } }
        else this.reset(this.freeRetry);
      }
    } else if (this.displayDelay <= 0) {
      this.ui && this.ui.setHookEnabled(true);
      h.position.x += this.hookCoef * dt * this.sys.m_hookSpeedX;
      if ((h.position.x >= 15 && this.hookCoef > 0) || (h.position.x <= -15 && this.hookCoef < 0)) this.hookCoef *= -1;
    }
    for (const ms of this.skins) {
      if (ms.catched) { if (ms.shadow && ms.shadow.color && ms.shadow.color[3] > 0) { ms.shadow.color[3] = Math.max(0, ms.shadow.color[3] - dt * 2); ms.shadow.applyColor(); } continue; }
      const p = ms.t.obj.position; p.x += ms.coef * dt * ms.speed;
      if ((p.x >= this.boundsX - 1 && ms.coef > 0) || (p.x <= -this.boundsX + 1 && ms.coef < 0)) { ms.coef *= -1; ms.t.obj.scale.x = ms.coef; }
    }
    for (const u of [...this.updaters]) u.update(dt);
    this.updaters = this.updaters.filter(u => !u.done);
    for (const a of this.anims) a.update(dt);
    this.app.particles && this.app.particles.update(this, dt);
  }
  applyCamera(aspect) {
    const hgt = this.orthoSize, w = hgt * aspect;
    this.cam.left = -w; this.cam.right = w; this.cam.top = hgt; this.cam.bottom = -hgt; this.cam.updateProjectionMatrix();
    this.boundsX = w;
  }
  pointerDown() {}
  pause() {}
  dispose() { clearScope(this.scope); this.hookSound.stop(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
}
export const MinigameLoop = { loopDisplay: 0 };
for (const k of ['hooks', 'finishRenderers', 'applySkin', 'findComp', 'instantiate', 'release', 'attachBehaviours', 'invokeEvent', 'later', 'spawnFx', 'curveObjectOf'])
  SceneMinigame.prototype[k] = SceneGame.prototype[k];
