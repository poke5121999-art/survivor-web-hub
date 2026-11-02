// UI MonoBehaviours of Snail Ride ported onto the DOM UI runtime (engine/ui.js).
// Each factory gets ctx {u: UINode, c: component dict, S: UIScripts} and returns a behaviour object.
import { A, tr, refKey } from '../engine/assets.js?v=20261102a';
import { Animator, LegacyAnimation } from '../engine/anim.js?v=20261102a';
import { spriteKeyFromRef } from '../engine/world.js?v=20261102a';
import { publish, subscribe } from './events.js?v=20261102a';
import { Game, saveUser, addCurrency, resetUser, skinById, timestamp, rnd } from './user.js?v=20261102a';
import * as SFX from './audio.js?v=20261102a';
import * as Sys from './systems.js?v=20261102a';
import { MinigameLoop } from './sceneMinigame.js?v=20261102a';

const U = () => Game.User;

// ---------- animation adapter for UI nodes ----------
export const uiAdapter = {
  resolve(root, path) { return path ? root.find(path) : root; },
  get(u, type, prop, comp) { try { const v = u.getProp(type === 'Transform' ? 'RectTransform' : type, prop, comp); return v; } catch (e) { return undefined; } },
  set(u, type, prop, comp, v) {
    if (prop === 'm_Sprite') { u.setSprite(spriteKeyFromRef(v)); return; }
    if (type === 'MonoBehaviour') return;
    u.setProp(type === 'Transform' ? 'RectTransform' : type, prop, v, comp);
  },
};

export class UIScripts {
  constructor(app) {
    this.app = app; this.ui = app.ui; this.behs = []; this.byId = new Map(); this.subs = []; this.popups = [];
  }
  get scene() { return this.app.scene; }
  sub(n, fn, owner) { const off = subscribe(n, fn); (owner ? (owner._subs = owner._subs || []) : this.subs).push(off); return off; }
  instantiate(node, parent = null, opts = {}) {
    const u = this.ui.instantiate(node, parent, { onClick: (n, call) => this.click(n, call), onPointerDown: (n, e) => this.pointerDown(n, e), ...opts });
    const created = [];
    u.walk(n => {
      if (n.tree !== u.tree) return;
      for (const c of n.compList) {
        if (c.type === 'Animator' && refKey(c.m_Controller)) { const a = new Animator(n, uiAdapter, refKey(c.m_Controller)); c.animator = a; this.behs.push({ u: n, update: dt => n.activeInHierarchy && a.update(dt) }); }
        if (c.type === 'Animation') { const a = new LegacyAnimation(n, uiAdapter, c); c.anim = a; this.behs.push({ u: n, update: dt => a.update(dt) }); }
        const f = SCRIPTS[c.type];
        if (f) { const b = f({ u: n, c, S: this }); if (b) { b.u = b.u || n; b.c = c; c.beh = b; this.byId.set(c.id, b); created.push(b); this.behs.push(b); } }
      }
    });
    // Unity: Awake/Start run when the GameObject is first active in the hierarchy
    for (const b of created) { b._pending = true; }
    this.runPending(created);
    return u;
  }
  beh(ref, from) { const id = ref && (ref.$ || ref); return id ? this.byId.get(id) || null : null; }
  node(ref, from) { const id = ref && (ref.$ || ref); return id && from ? from.findById(id) : null; }
  comp(ref, from) { const id = ref && (ref.$ || ref); const n = this.node(id, from); return n ? (n.id === id ? null : n.compList.find(c => c.id === id)) : null; }
  click(n, call) {
    SFX.playSFX(n.compList.some(c => c.type === 'AudioClick' && c.m_negative) ? 'UIBack' : (n.compList.some(c => c.type === 'AudioClick') ? 'UIOk' : null));
    if (!call) return;
    const b = this.byId.get(call.targetId);
    if (b && typeof b[call.method] === 'function') { b[call.method](call.arg); return; }
    if (call.targetType === 'GameObject' && call.method === 'SetActive' && call.targetNode) { call.targetNode.setActive(!!call.arg); return; }
    if (call.method === 'Play' && call.targetNode) { const c = call.targetNode.compList.find(x => x.id === call.targetId); c && c.anim && c.anim.play(); return; }
    console.warn('unhandled UI call', call.targetType, call.method);
  }
  runPending(list = this.behs) {
    const ready = list.filter(b => b._pending && (!b.u || b.u.activeInHierarchy));
    for (const b of ready) { b._pending = false; b.awake && b.awake(); }
    for (const b of ready) b.start && b.start();
  }
  pointerDown(n, e) { for (const c of n.compList) if (c.beh && c.beh.onPointerDown) c.beh.onPointerDown(e); }
  update(dt) {
    this.behs = this.behs.filter(b => !(b.u && b.u.destroyed && (b._subs && b._subs.forEach(f => f()), true)));
    if (this.behs.some(b => b._pending)) this.runPending();
    for (const b of [...this.behs]) if (!b._pending && b.update && (!b.u || b.u.activeInHierarchy || b.always)) b.update(dt);
  }
  clear() { for (const b of this.behs) b._subs && b._subs.forEach(f => f()); this.behs = []; this.byId.clear(); this.subs.forEach(f => f()); this.subs = []; }
  // Popup (instantiate a prefab on its own canvas)
  popup(prefabKey, { blur = true } = {}) {
    publish('PopupDisplayEvent');
    if (blur) this.app.blur(true);
    const u = this.instantiate(A.scene.prefabs[prefabKey]);
    return u;
  }
  closePopup(u, { blur = true } = {}) {
    publish('PopupHideEvent');
    if (blur) this.app.blur(false);
    const root = u.host || topOf(u); root.destroy();
  }
}
function topOf(u) { while (u.parent) u = u.parent; return u; }
const nodeOf = (S, ref, from) => S.node(ref, from);
const setTxt = (S, ref, from, s) => { const n = S.node(ref, from); if (n) n.setText(String(s)); };
const animOf = (S, ref, from) => { const c = S.comp(ref, from); return c && (c.animator || c.anim) || null; };

// ---------- scripts ----------
const SCRIPTS = {
  // --- generic ---
  Localize: () => null, // handled by UIRoot.instantiate (opts.localize)
  AudioClick: () => null,
  RaycastClaim: () => null,
  ButtonBlink({ u, c }) {
    const b = { en: true,
      update() {},
      apply() { const a = u.comps.Animator && u.comps.Animator.animator; if (a) { a.setBool('Facebook', !!c.m_isFacebook); a.setBool('Blink', b.en); } },
      SetEnable(v) { b.en = !!v; b.apply(); }, start() { b.apply(); } };
    return b;
  },
  ButtonDisplay({ u, c, S }) {
    const b = { en: true,
      SetEnable(v) { b.en = !!v; b.apply(); },
      apply() {
        const a = u.comps.Animator && u.comps.Animator.animator; if (a) a.setBool('Disable', !b.en);
        const bg = S.node(c.m_background, u); const g = A.game.buttons;
        if (bg) bg.setSprite(b.en ? (c.m_large ? g.m_buttonLarge : g.m_button) : (c.m_large ? g.m_buttonLargeDisabled : g.m_buttonDisabled));
      }, start() { b.apply(); } };
    return b;
  },
  Popup({ u, c, S }) {
    return {
      DisplayPopup() { S.popup(refKey(c.m_popup), { blur: !!c.m_blur }); },
      Close() { S.closePopup(u, { blur: !!c.m_blur }); },
    };
  },
  DisableOnPopup({ u, S }) {
    const b = { always: true, awake() { S.sub('PopupDisplayEvent', () => u.setActive(false), b); S.sub('PopupHideEvent', () => u.setActive(true), b); } };
    return b;
  },
  LoadScene({ c, S }) {
    const b = { start() { if (c.m_autoLoad > 0) setTimeout(() => b.Load(), c.m_autoLoad * 1000); }, Load() { S.app.loadScene(c.m_sceneName); } };
    return b;
  },
  OpenUrl({ c }) { return { Open() { const url = c.m_urlAndroid || c.m_url; if (url) window.open(url, '_blank', 'noopener'); }, OpenURL() { this.Open(); } }; },
  ImageOS({ u, c, S }) { return { start() { const k = refKey(c.m_android || c.m_spriteAndroid); if (k) u.setSprite(k); } }; },
  AutoRotate({ u, c, S }) { let z = 0; return { update(dt) { z += c.m_rotation.z * dt * (S.scene && S.scene.speedCoef || 1); u.setLocalEulerZ(z); } }; },
  OffsetStartAnimation({ u, c, S }) {
    return { start() { const off = Math.random(); const an = (c.m_animation ? S.comp(c.m_animation, u) : u.comps.Animation); const at = (c.m_animator ? S.comp(c.m_animator, u) : u.comps.Animator);
      if (an && an.anim) { an.anim.play(); an.anim.setNormalizedTime(off); }
      if (at && at.animator) { const l = at.animator.layers[0]; if (l) l.time = off; } } };
  },
  AnimatorSetState({ c, S, u }) { return { start() { const a = S.comp(c.m_animator, u); a && a.animator && a.animator.crossFade(c.m_state, 0, 0, 0); } }; },
  AudioEmitter({ c }) { return { Trigger() { SFX.playSFX(c.m_key); } }; },
  FollowTarget() { return null; },
  Leaderboard({ u }) { return { start() { }, Open() { /* Google Play leaderboards are not available on the web */ } }; },
  RestorePurchase() { return { Restore() {} }; },
  GenerateItem({ u, c, S }) {
    return { Generate() {
      const tpl = A.scene.prefabs[refKey(c.m_item)]; const parent = S.node(c.m_parent, u); const tr0 = S.node(c.m_transform, u);
      if (!tpl || !parent || !tr0) return;
      let i = 0; const ap = tr0.getAnchoredPos();
      const tick = () => { for (let k = 0; k < 10 && i < c.m_number; k++, i++) { const it = S.instantiate(tpl, parent); const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * c.m_radius; it.setAnchoredPos(ap[0] + Math.cos(a) * r, ap[1] + Math.sin(a) * r); } if (i < c.m_number) setTimeout(tick, 100); };
      setTimeout(tick, 100);
    } };
  },
  // --- displays ---
  CurrencyDisplay({ u, c, S }) {
    const b = { start() { if (!c.m_disableInit) b.upd(); S.sub('CurrencyUpdateEvent', () => { b.upd(); const a = animOf(S, c.m_animator, u); a && a.crossFade && a.crossFade('ScoreUp', 0, -1, 0); }, b); },
      upd() { setTxt(S, c.m_text, u, Sys.formatNumber(U().m_currency)); } };
    return b;
  },
  DoubleCurrencyDisplay({ u }) { return { awake() { if (!U().m_skins.includes(45)) u.destroy(); } }; },
  BestScoreDisplay({ u, c, S }) { const b = { start() { b.UpdateDisplay(); S.sub('BestScoreUpdateEvent', () => b.UpdateDisplay(), b); }, UpdateDisplay() { setTxt(S, c.m_text, u, U().m_bestScore); } }; return b; },
  ScoreDisplay({ u, c, S }) {
    let prev = -1;
    const b = { always: true,
      start() { setTxt(S, c.m_text, u, S.scene && S.scene.score || 0); S.sub('ScoreUpdateEvent', () => b.upd(), b); },
      update() { const sc = S.scene && S.scene.score; if (c.m_autoUpdate && sc != null && prev !== sc) { prev = sc; b.upd(); } },
      upd() { const sc = S.scene ? S.scene.score : 0; const a = animOf(S, c.m_animator, u); a && a.crossFade && a.crossFade('Score Up', 0, -1, 0);
        const nr = S.node(c.m_newRecord, u); nr && nr.setActive(sc > (S.scene ? S.scene.state.previousBest : 0)); setTxt(S, c.m_text, u, sc); } };
    return b;
  },
  RewardDisplay({ u, c, S }) { return { SetReward(n) { setTxt(S, c.m_reward, u, n); } }; },
  MissionDataDisplay({ u, c, S }) {
    let mission = null, last = -1;
    const b = {
      SetMission(m) { if (mission !== m || (m && m.m_progression !== last)) { mission = m; if (!m) return; last = m.m_progression; b.upd(); m.m_new = false; } },
      upd() {
        const m = mission; if (!m) return; const d = Sys.missionData(m.m_missionData); const ok = !!m._success;
        const pf = S.node(c.m_progressFill, u); pf && pf.setActive(m.m_progression > 0);
        const pb = S.node(c.m_progressBar, u); if (pb) { pb.setActive(!ok); pb.setSliderValue(Math.max(0.1, Sys.missionPercent(m))); }
        const ck = S.node(c.m_check, u); ck && ck.setActive(ok);
        setTxt(S, c.m_progressText, u, ok ? tr('mission.success') : m.m_new ? tr('info.new') : `${m.m_progression | 0}/${d.m_goalValue}`);
        setTxt(S, c.m_text, u, Sys.missionDescription(m));
        setTxt(S, c.m_currency, u, m.m_reward);
      } };
    return b;
  },
  MissionProgressionDisplay({ u, c, S }) {
    let timer = 0, lastT = -1;
    const root = () => S.node(c.m_root, u), rootTimer = () => S.node(c.m_rootTimer, u);
    const b = { always: true,
      start() {
        root() && root().setActive(false);
        S.sub('MissionUpdateEvent', e => { if (e.audio) SFX.playSFX('MissionPoint'); b.Display(e.mission.m_progression | 0, Sys.missionData(e.mission.m_missionData).m_goalValue); }, b);
        S.sub('MissionResetEvent', () => { const m = Sys.missionCurrent(); if (m && !m._success) S.infoBar && S.infoBar.DisplayMission(4); }, b);
        S.sub('GameOverEvent', () => root() && root().setActive(false), b);
      },
      Display(p, t) { const a = animOf(S, c.m_animator, u); a && a.crossFade && a.crossFade('Score Up', 0, -1, 0); timer = p >= t ? 2 : 3; root() && root().setActive(true); setTxt(S, c.m_text, u, `${p}/${t}`); },
      update(dt) {
        if (timer > 0) { timer -= dt; if (timer <= 0) root() && root().setActive(false); }
        const sc = S.scene; const m = Sys.missionCurrent(); const st = sc && sc.state;
        const d = m && Sys.missionData(m.m_missionData);
        const show = !!(m && !Sys.missionFinished(m) && st && st.started && !st.gameOver && (d.m_type === 2 || (d.m_goal === 0 && m.m_progression > 0)));
        rootTimer() && rootTimer().setActive(show);
        if (m && !Sys.missionFinished(m) && st && st.started) {
          const n = d.m_type !== 2 ? ((1 + d.m_goalValue - m.m_progression) | 0) : d.m_timer - (st.time | 0);
          if (lastT !== n) { setTxt(S, c.m_textTimer, u, `${n}s`); lastT = n; }
        }
      } };
    return b;
  },
  InfoBar({ u, c, S }) {
    let time = 0, yT = 0, aT = 0, type = 0;
    const cg = () => S.node(c.m_canvasGroup, u);
    const b = { always: true,
      start() { S.infoBar = b; },
      DisplayMessage(msg, icon = 0) {
        S.node(c.m_rootMission, u)?.setActive(false); S.node(c.m_rootMessage, u)?.setActive(true); setTxt(S, c.m_text, u, msg);
        S.node(c.m_success, u)?.setActive(icon === 1); S.node(c.m_fail, u)?.setActive(icon === 2);
        if (type !== 1) { type = 1; const p = u.getAnchoredPos(); u.setAnchoredPos(p[0], 80); }
        time = 3; yT = 0; aT = 1;
      },
      DisplayMission(t = 2) {
        S.node(c.m_rootMission, u)?.setActive(true); S.node(c.m_rootMessage, u)?.setActive(false);
        const md = S.beh(c.m_missionDisplay); md && md.SetMission(Sys.missionCurrent());
        if (type !== 2) { type = 2; const p = u.getAnchoredPos(); u.setAnchoredPos(p[0], 128); }
        time = t; yT = 0; aT = 1;
      },
      update(dt) {
        if (time <= 0) return;
        const p = u.getAnchoredPos(); u.setAnchoredPos(p[0], p[1] + (yT - p[1]) * Math.min(1, 5 * dt));
        const g = cg(); if (g) { const a0 = g.cg ? g.cg.alpha : 0; g.setProp('CanvasGroup', 'm_Alpha', a0 + (aT - a0) * Math.min(1, 5 * dt)); }
        time -= dt; if (time <= 0) { time = 3; yT = type !== 2 ? 80 : 128; aT = 0; }
      } };
    return b;
  },
  // --- game HUD ---
  PlayerController({ S }) { return { onPointerDown() { S.scene && S.scene.pointerDown && S.scene.pointerDown(); } }; },
  PauseMenu({ u, c, S }) {
    let count = 0, pm = null;
    const b = { always: true,
      start() { b.upd(); S.sub('StartGameEvent', e => e.delay && b.upd(), b); S.sub('GameOverEvent', () => b.upd(), b); S.pauseMenu = b; },
      upd() { const st = S.scene && S.scene.state; S.node(c.m_pauseButton, u)?.setActive(!!(st && st.started && !st.paused && !st.gameOver)); },
      Pause() {
        const sc = S.scene; if (!sc || sc.state.gameOver) return;
        S.app.blur(true); sc.state.paused = true; sc.pause(true); SFX.setSfxPaused(true);
        if (!pm) { publish('PopupDisplayEvent'); pm = S.instantiate(A.scene.prefabs[refKey(c.m_pauseMenu)]); }
        publish('PauseEvent', { state: 'Pause' }); b.upd();
      },
      Resume() {
        const sc = S.scene; S.app.blur(false); publish('PopupHideEvent');
        sc.state.paused = false; sc.state.resuming = true; SFX.setSfxPaused(false);
        if (pm) { (pm.host || pm).destroy(); pm = null; }
        count = 3; publish('PauseEvent', { state: 'Resuming' }); b.tick();
      },
      tick() {
        const sc = S.scene;
        if (count === 0) { setTxt(S, c.m_resume, u, ''); sc.state.resuming = false; sc.pause(false); publish('PauseEvent', { state: 'Game' }); b.upd(); return; }
        SFX.playSFX('TimerPause'); setTxt(S, c.m_resume, u, count); count--; setTimeout(() => b.tick(), 1000);
      } };
    return b;
  },
  Resume({ S }) { return { Trigger() { S.pauseMenu && S.pauseMenu.Resume(); } }; },
  MenuController({ u, c, S }) {
    let unlocked = null;
    const b = { always: true,
      start() {
        Sys.refreshMission(); b.upd(); Sys.checkSpecialSkins(); b.skinUnlocked();
        S.sub('PopupHideEvent', () => b.skinUnlocked(), b); S.sub('StartGameEvent', e => e.delay && b.upd(), b); S.sub('GameOverEvent', () => b.upd(), b);
      },
      upd() {
        const st = S.scene ? S.scene.state : { started: false, gameOver: false };
        const n = r => S.node(r, u);
        n(c.m_menu)?.setActive(!st.started); n(c.m_missionReminder)?.setActive(false);
        n(c.m_bestScore)?.setActive(U().m_gameCounter > 0 && !st.started);
        n(c.m_currency)?.setActive(!st.gameOver && (st.started || U().m_gameCounter > 0));
        n(c.m_score)?.setActive(st.started && !st.gameOver);
        n(c.m_bottomBar)?.setActive(U().m_gameCounter > 0);
      },
      skinUnlocked() {
        const st = S.scene && S.scene.state;
        if ((st && st.started) || !U().m_animationSkinUnlocked.length || (unlocked && !unlocked.destroyed)) return;
        const id = U().m_animationSkinUnlocked.shift(); const s = skinById(id);
        if (!s) return;
        SFX.playSFX('SkinUnlock'); S.node(c.m_hint, u)?.setActive(false);
        S.app.blur(true); publish('PopupDisplayEvent');
        unlocked = S.instantiate(A.scene.prefabs[refKey(c.m_prefabSkinSpecialUnlocked)]);
        S.setSkinPopup(unlocked, s);
        if (!U().m_skins.includes(id)) U().m_skins.push(id);
        saveUser();
      } };
    return b;
  },
  // --- game over ---
  GameOver({ u, c, S }) {
    const n = r => S.node(r, u);
    const b = {
      start() {
        S.app.blur(true);
        const m = Sys.missionCurrent(); if (m && !m._success) m.m_gameCount++;
        SFX.setMuteAll(false);
        const sc = S.scene;
        if (sc.state.bestScore && sc.state.previousBest > 0 && sc.score > 100) { n(c.m_bottom)?.setActive(false); n(c.m_bestScore)?.setActive(true); n(c.m_menu)?.setActive(false); n(c.m_noAds)?.setActive(false); publish('BestScoreUpdateEvent'); }
        else b.ClosePopups();
      },
      ClosePopups() { n(c.m_bottom)?.setActive(U().m_minigameCount > 0); n(c.m_noAds)?.setActive(false); n(c.m_bestScore)?.setActive(false); n(c.m_menu)?.setActive(true); },
      PurchaseNoAds() { b.ClosePopups(); },
    };
    return b;
  },
  InfoStack({ u, c, S }) {
    const f = { gift: false, mission: false, adReward: false, share: false, promote: false }; let loopIncr = false;
    const b = {
      start() {
        const m = Sys.missionCurrent();
        if (m && m._success) f.mission = true;
        else if (Sys.giftRemaining() <= 0) f.gift = true;
        else if (U().m_minigameCount > 0) {
          const need = A.game.priceMinigame - U().m_currency;
          if (need > 0 && need <= 150) { if (InfoLoop.currencyAd % 2 === 0) f.adReward = true; InfoLoop.currencyAd++; }
          if (!f.adReward) {
            let done = false, guard = 0;
            while (!done && guard++ < 8) {
              const k = InfoLoop.info % 4;
              if (k === 0) { f.mission = true; done = true; } else if (k === 1) { f.share = true; done = true; } else if (k === 2) { f.gift = true; done = true; }
              else if (k === 3 && Sys.hasPromoteSkin()) { f.promote = true; done = true; }
              InfoLoop.info++;
            }
          }
        }
        for (const e of ['ClaimGiftEvent', 'MissionStackUpdateEvent', 'CurrencyUpdateEvent', 'PopupHideEvent']) S.sub(e, () => b.UpdateDisplay(), b);
        S.sub('WatchAdEvent', e => { if (e.type === 'Currency') InfoLoop.currencyAd = 0; }, b);
        b.UpdateDisplay();
      },
      UpdateDisplay() {
        const get = r => S.beh(r); const node = r => S.node(r, u);
        for (const k of ['m_minigameController', 'm_giftController', 'm_missionController', 'm_adRewardController', 'm_shareScreenshot']) get(c[k])?.UpdateDisplay?.();
        let fl = A.game.skins.some(s => s.availability === 0 && !U().m_skins.includes(s.id)) && U().m_currency >= A.game.priceMinigame;
        const m = Sys.missionCurrent();
        if (f.mission && m && m._success) fl = false; else if (f.gift && Sys.giftRemaining() <= 0) fl = false;
        if (fl && !loopIncr) { loopIncr = true; const k = MinigameLoop.loopDisplay % 5; if (k === 1 || k === 3 || k === 4) fl = false; MinigameLoop.loopDisplay++; }
        const set = (r, v) => { const bb = get(r); (bb && bb.u ? bb.u : node(r))?.setActive(v); };
        set(c.m_minigameController, fl); set(c.m_giftController, !fl && f.gift); set(c.m_missionController, !fl && f.mission);
        set(c.m_adRewardController, !fl && f.adReward); set(c.m_promote, !fl && f.promote); set(c.m_shareScreenshot, !fl && f.share);
        get(c.m_shareButton)?.SetEnable?.(!fl && f.share);
      } };
    return b;
  },
  MinigameController({ u, c, S }) {
    let avail = false;
    const b = {
      start() { avail = Sys.minigameSkinAvailable() && U().m_currency >= A.game.priceMinigame; S.sub('CurrencyUpdateEvent', () => b.UpdateDisplay(), b); b.UpdateDisplay(); },
      OpenMinigame() { if (avail) S.app.loadScene('SceneMinigame'); },
      UpdateDisplay() {
        const p = A.game.priceMinigame;
        setTxt(S, c.m_text, u, tr('minigame.next').replace('[X]', String(p - U().m_currency)));
        setTxt(S, c.m_textMinigame, u, tr('minigame.available').replace('[X]', String(p)));
        setTxt(S, c.m_priceMinigame, u, p);
        S.node(c.m_button, u)?.setActive(avail);
        S.beh(c.m_buttonDisplay)?.SetEnable?.(avail);
      } };
    return b;
  },
  GiftController({ u, c, S }) {
    let dbl = false;
    const n = r => S.node(r, u);
    const b = { always: false,
      start() { S.sub('WatchAdEvent', e => { if (e.type === 'DoubleReward') { dbl = true; b.anim(); } }, b); b.UpdateDisplay(); b.anim(); },
      anim() { const a = S.comp(c.m_animation, u); if (!a || !a.anim) return; a.anim.play(); S.beh(c.m_rewardFX)?.Generate(); SFX.playSFX('Reward'); n(c.m_buttonContinue)?.setActive(false); n(c.m_buttonRoot)?.setActive(false);
        setTimeout(() => publish('CurrencyUpdateEvent'), 1500); setTimeout(() => b.enable(), 2500); },
      enable() {
        n(c.m_buttonContinue)?.setActive(true); n(c.m_buttonRoot)?.setActive(true);
        n(c.m_buttonDoubleReward)?.setActive(!dbl && U().m_gameCounter > 1);
        const need = A.game.priceMinigame - U().m_currency;
        const nm = n(c.m_nextMinigame); nm && nm.setActive(!!(n(c.m_buttonDoubleReward)?.activeInHierarchy) && Sys.minigameSkinAvailable() && need > 0 && need <= 150);
        n(c.m_nextTimer)?.setActive(!(nm && nm.activeInHierarchy) && Sys.giftRemaining() > 0);
      },
      UpdateDisplay() {
        const r = Sys.giftRemaining();
        const t = n(c.m_text); if (t) { t.setActive(r > 0); t.setText(tr('gift.next').replace('[T]', Sys.formatTime(r))); }
        n(c.m_claim)?.setActive(r <= 0); n(c.m_next)?.setActive(r > 0); n(c.m_reminder)?.setActive(false);
      },
      update() { b.UpdateDisplay(); },
      Claim() {
        if (Sys.giftRemaining() > 0) return;
        publish('PopupDisplayEvent');
        const p = S.instantiate(A.scene.prefabs[refKey(c.m_popup)]);
        const cd = p.findComp('CurrencyDisplay'); const cdb = cd && cd.compList.find(x => x.type === 'CurrencyDisplay');
        const rew = Sys.claimGift(); saveUser();
        if (cdb) { const t = S.node(cdb.m_text, cd); t && t.setText(Sys.formatNumber(U().m_currency - rew)); }
        const rd = p.findComp('RewardDisplay'); rd && rd.compList.find(x => x.type === 'RewardDisplay').beh?.SetReward(rew);
        publish('ClaimGiftEvent');
      },
      RegisterPush() { U().m_localNotificationReminderAsked = true; b.UpdateDisplay(); } };
    return b;
  },
  NextGiftTimer({ u, c, S }) { return { update() { setTxt(S, c.m_text, u, tr('gift.next').replace('[T]', Sys.formatTime(U().m_nextGiftTimestamp - timestamp()))); } }; },
  NextMissionTimer({ u, c, S }) {
    return { update() { setTxt(S, c.m_text, u, tr('mission.next').replace('[T]', Sys.formatTime(U().m_nextMissionTimestamp - timestamp()))); },
      WatchAd() { U().m_nextMissionTimestamp = timestamp(); Sys.watchAd('NewMission'); publish('MissionStackUpdateEvent'); } };
  },
  MissionController({ u, c, S }) {
    let dbl = false, replaced = false;
    const n = r => S.node(r, u);
    const b = {
      start() { S.sub('MissionStackUpdateEvent', () => b.UpdateDisplay(), b); S.sub('WatchAdEvent', e => { if (e.type === 'NewMission') b.UpdateDisplay(); if (e.type === 'DoubleReward') { dbl = true; b.anim(); } }, b); b.UpdateDisplay(); b.anim(); },
      anim() { const a = S.comp(c.m_animation, u); if (!a || !a.anim) return; a.anim.play(); S.beh(c.m_rewardFX)?.Generate(); SFX.playSFX('Reward'); n(c.m_buttonContinue)?.setActive(false); n(c.m_buttonRoot)?.setActive(false);
        setTimeout(() => publish('CurrencyUpdateEvent'), 1500); setTimeout(() => b.enable(), 2500); },
      enable() {
        const f1 = !dbl, f2 = Sys.missionRemaining() > 0;
        n(c.m_buttonContinue)?.setActive(true); n(c.m_buttonRoot)?.setActive(f1 || f2); n(c.m_next)?.setActive(f2);
        n(c.m_buttonDoubleReward)?.setActive(f1);
        const need = A.game.priceMinigame - U().m_currency; const nm = n(c.m_nextMinigame);
        nm && nm.setActive(!!(n(c.m_buttonDoubleReward)?.activeInHierarchy) && Sys.minigameSkinAvailable() && need > 0 && need <= 150);
        n(c.m_nextTimer)?.setActive(!(nm && nm.activeInHierarchy) && Sys.missionRemaining() > 0);
      },
      UpdateDisplay() {
        const m = Sys.missionCurrent();
        n(c.m_rootNew)?.setActive(!m && Sys.missionRemaining() > 0); n(c.m_buttonNew)?.setActive(true); n(c.m_rootCurrent)?.setActive(!!m);
        if (m) { S.beh(c.m_missionDisplay)?.SetMission(m); n(c.m_buttonClaim)?.setActive(!!m._success); n(c.m_buttonReplace)?.setActive(!m._success && !replaced && m.m_gameCount > 1); }
      },
      Replace() { replaced = true; Sys.replaceMission(); Sys.watchAd('ReplaceMission'); saveUser(); b.UpdateDisplay(); },
      Claim() {
        const m = Sys.missionCurrent(); if (!m || !m._success) return;
        publish('PopupDisplayEvent');
        const p = S.instantiate(A.scene.prefabs[refKey(c.m_popup)]);
        const before = U().m_currency;
        Sys.claimMission(m); saveUser();
        const cd = p.findComp('CurrencyDisplay'); const cdb = cd && cd.compList.find(x => x.type === 'CurrencyDisplay');
        if (cdb) { const t = S.node(cdb.m_text, cd); t && t.setText(Sys.formatNumber(before)); }
        publish('MissionStackUpdateEvent');
        const md = p.findComp('MissionDataDisplay'); md && md.compList.find(x => x.type === 'MissionDataDisplay').beh?.SetMission(m);
      } };
    return b;
  },
  AdRewardController({ u, c, S }) {
    const n = r => S.node(r, u);
    const b = {
      start() { b.UpdateDisplay(); b.anim(); },
      anim() { const a = S.comp(c.m_animation, u); if (!a || !a.anim) return; a.anim.play(); S.beh(c.m_rewardFX)?.Generate(); SFX.playSFX('Reward'); n(c.m_buttonContinue)?.setActive(false);
        setTimeout(() => publish('CurrencyUpdateEvent'), 1500); setTimeout(() => n(c.m_buttonContinue)?.setActive(true), 2500); },
      UpdateDisplay() { setTxt(S, c.m_label, u, tr('info.morecurrency')); },
      Watch() { // the ad is granted instantly on the web
        const before = U().m_currency; const rew = Sys.claimAdReward(); Sys.watchAd('Currency'); saveUser();
        publish('PopupDisplayEvent');
        const p = S.instantiate(A.scene.prefabs[refKey(c.m_popup)]);
        const cd = p.findComp('CurrencyDisplay'); const cdb = cd && cd.compList.find(x => x.type === 'CurrencyDisplay');
        if (cdb) { const t = S.node(cdb.m_text, cd); t && t.setText(Sys.formatNumber(before)); }
        const rd = p.findComp('RewardDisplay'); rd && rd.compList.find(x => x.type === 'RewardDisplay').beh?.SetReward(rew);
      } };
    return b;
  },
  DoubleReward({ u, c, S }) {
    return { start() { setTxt(S, c.m_label, u, tr('info.doublereward')); },
      Watch() { const v = c.m_type === 0 ? Sys.giftLastReward : Sys.missionLastReward; addCurrency(v); Sys.watchAd('DoubleReward'); } };
  },
  ScreenshotController({ u, c, S }) {
    return { UpdateDisplay() {}, Hide() { u.setActive(false); },
      ShareScore() {
        const text = tr('share.score').replace('[X]', String(S.scene ? S.scene.score : U().m_bestScore));
        if (navigator.share) navigator.share({ text, url: location.href }).catch(() => {});
        U().m_shareCount++; saveUser(); publish('ShareScoreEvent');
      } };
  },
  Promote({ u, c, S }) {
    let s = null;
    const n = r => S.node(r, u);
    const b = {
      start() { s = Sys.promoteSkin(); if (!s) { u.setActive(false); return; } S.beh(c.m_display)?.SetSetting(s); b.buttons(); },
      buttons() {
        const av = s.availability;
        n(c.m_lockedFacebook)?.setActive(av === 2); n(c.m_lockedGame)?.setActive(av === 3 || av === 5);
        n(c.m_lockedPay)?.setActive(av === 4 || av === 6 || av === 0); n(c.m_lockedPayCurrency)?.setActive(av === 6 && s.price > 0);
        n(c.m_infoDownloadGame)?.setActive(av === 3); n(c.m_infoRateGame)?.setActive(av === 5); n(c.m_infoFacebook)?.setActive(av === 2);
        n(c.m_doubleMinigame)?.setActive(s.id === 46); n(c.m_doubleCurrency)?.setActive(s.id === 45);
        S.beh(c.m_buttonPayCurrency)?.SetEnable(U().m_currency >= s.price);
        if (s.icon) n(c.m_iconGame)?.setSprite(s.icon);
        setTxt(S, c.m_lockedPrice, u, Sys.iapPrice(s));
        if (av === 6) setTxt(S, c.m_lockedCurrencyPrice, u, Sys.formatNumber(s.price));
      },
      Unlock() { Sys.unlockPromoted(s); S.app.loadScene('SceneGame'); },
      Pay() { Sys.unlockPaid(s); S.app.loadScene('SceneGame'); },
      PayCurrency() { if (Sys.payCurrency(s)) { publish('CurrencyUpdateEvent'); S.app.loadScene('SceneGame'); } } };
    return b;
  },
  SkinSettingDisplay({ u, c, S }) {
    let s = null;
    const b = {
      SetSetting(x) {
        const an = S.comp(c.m_animation, u); if (an && an.anim) { an.anim.rewind(); an.anim.play(); }
        if (s === x) return; s = x;
        const isNew = !U().m_skins.includes(s.id), unknown = !!c.m_displayUnknownState && isNew;
        S.node(c.m_new, u)?.setActive(isNew);
        const nm = S.node(c.m_name, u);
        if (nm) { nm.setText(!unknown || s.availability !== 1 ? s.name : '???'); nm.setColor(!unknown ? [1, 1, 1, 1] : col(c.m_colorTextUnknownState)); }
        const rr = S.node(c.m_rarity, u);
        if (rr) { rr.setText(Sys.localizedRarity(s)); rr.setActive(s.rarity !== 0); rr.setColor(Sys.rarityColor(s)); }
        setTxt(S, c.m_specialHint, u, Sys.skinHint(s));
        const color = unknown ? (s.availability === 1 ? [0, 0, 0, 1] : col(c.m_colorUnknownState)) : [1, 1, 1, 1];
        const im = S.node(c.m_image, u); if (im) im.setColor(color);
        const d = S.beh(c.m_display); if (d) { d.SetSkin(s); d.SetTint(color); }
        b.skin = s;
      },
      Hide(h) { const d = S.beh(c.m_display); d && d.u.setActive(!h); S.node(c.m_image, u)?.setActive(!h); },
      Share() { if (navigator.share) navigator.share({ text: tr('share.skin').replace('[X]', s.name), url: location.href }).catch(() => {}); U().m_shareCount++; saveUser(); publish('ShareSkinEvent'); } };
    return b;
  },
  SkinDisplay({ u, c, S }) {
    let tint = [1, 1, 1, 1], skin = null;
    const b = {
      start() { if (c.m_useSkinSelected) b.SetSkin(S.scene && S.scene.skin || skinById(1)); },
      SetSkin(s) { skin = s; b.apply(); }, SetTint(t) { tint = t; b.apply(); },
      apply() {
        if (!skin) return;
        const sp = (A.art.resources[`snail_sprite_${String(skin.id).padStart(2, '0')}`] || []).filter(x => x[0] === 'sprite').map(x => x[1]);
        (c.m_images || []).forEach((r, i) => { const n = S.node(r, u); if (n && sp[i]) { n.setSprite(sp[i]); n.setColor(tint); } });
        const bu = S.node(c.m_bodyUI, u); if (bu && sp.length) { bu.setSprite(sp[sp.length - 1]); }
      } };
    return b;
  },
  SkinSelection({ S }) {
    let s = null;
    return { SetSetting(x) { s = x; }, Select() { if (s && U().m_skins.includes(s.id)) { U().m_randomSelection = false; U().m_skinSelected = s.id; saveUser(); publish('SkinSelectionEvent', { skin: s }); } } };
  },
  Mute({ u, c, S }) {
    let mute = false;
    const b = { start() { mute = c.m_type === 0 ? U().m_musicMute : U().m_sfxMute; b.upd(); },
      upd() { S.node(c.m_image, u)?.setSprite(refKey(mute ? c.m_off : c.m_on)); },
      SwitchMute() { mute = !mute; b.upd(); if (c.m_type === 0) { U().m_musicMute = mute; SFX.applyMute(); } else U().m_sfxMute = mute; saveUser(); } };
    return b;
  },
  ResetData({ u, c, S }) {
    return { DisplayPopup() { S.node(c.m_confirmPopup, u)?.setActive(true); }, HidePopup() { S.node(c.m_confirmPopup, u)?.setActive(false); },
      Reset() { resetUser(); S.app.loadScene('SceneGame'); }, AddCurrency() { addCurrency(5000); saveUser(); publish('CurrencyUpdateEvent'); }, Minigame() { S.app.loadScene('SceneMinigame'); } };
  },
  Slider() { return null; },
};
const col = c => c ? [c.r, c.g, c.b, c.a] : [1, 1, 1, 1];
export const InfoLoop = { info: 0, currencyAd: 0 };
export function registerScript(name, f) { SCRIPTS[name] = f; }
