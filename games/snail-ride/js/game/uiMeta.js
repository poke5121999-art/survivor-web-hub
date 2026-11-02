// Collection (skin carousel), HorizontalScrollSnap and the minigame HUD bridge.
import { A, refKey, tr } from '../engine/assets.js?v=20261102c';
import { registerScript } from './uiScripts.js?v=20261102c';
import { publish } from './events.js?v=20261102c';
import { Game, saveUser } from './user.js?v=20261102c';
import * as SFX from './audio.js?v=20261102c';
import * as Sys from './systems.js?v=20261102c';

const U = () => Game.User;

// ---------- HorizontalScrollSnap ----------
registerScript('HorizontalScrollSnap', ({ u, c, S }) => {
  const step = c.PageStep, speed = c.transitionSpeed;
  let positions = [], cur = 0, lerp = false, target = 0, dragging = false, offset = 0;
  const content = () => u.scrollContent;
  const lx = () => content().getProp('RectTransform', 'm_LocalPosition', 0);
  const setLx = v => content().setProp('RectTransform', 'm_LocalPosition', v, 0);
  const closest = x => { let bi = 0, bd = Infinity; positions.forEach((p, i) => { const d = Math.abs(p - x); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const b = {
    start() {
      offset = (u.rect().w / 2) | 0;
      u.onBeginDrag = () => { cur = closest(lx()); lerp = false; dragging = true; };
      u.onDrag = () => { lerp = false; dragging = true; };
      u.onEndDrag = () => { dragging = false; lerp = false; b.snap(); };
      u.onScroll = () => b.snap();
    },
    distribute() {
      const ct = content(); const kids = ct.children; const num = (kids.length - 1) * step;
      ct.setOffsetMax(num, 0);
      positions = kids.map((k, i) => { k.setSizeDelta(c.m_panelDimensions.x, c.m_panelDimensions.y); k.setAnchoredPos(offset + i * step, 0); return num / 2 - i * step; });
    },
    AddChild(node) { return S.instantiate(node, content()); },
    RefreshPos() { b.distribute(); },
    GoToScreen(i) { if (i >= 0 && i < positions.length) { u.stopScroll(); target = positions[i]; setLx(target); cur = i; } },
    snap() {
      const v = u.scroll ? Math.abs(u.scroll.velocity[0]) : 0;
      if (v <= c.m_threshold && !dragging) { lerp = true; cur = closest(lx()); target = positions[cur]; if (u.scroll) u.scroll.velocity = [0, 0]; }
      else { lerp = false; cur = closest(lx()); }
    },
    get CurrentPage() { return cur; },
    update(dt) {
      if (!lerp) { if (!dragging && u.scroll && Math.abs(u.scroll.velocity[0]) <= c.m_threshold && positions.length) b.snap(); return; }
      const x = lx(); const nx = x + (target - x) * Math.min(1, speed * dt); setLx(nx);
      if (Math.abs(nx - target) < 0.005) { setLx(target); lerp = false; }
    },
  };
  return b;
});

// ---------- Collection ----------
registerScript('Collection', ({ u, c, S }) => {
  let index = 0, init = false;
  const n = r => S.node(r, u);
  const skins = () => A.game.skins;
  const b = {
    start() {
      const cnt = n(c.m_counter); cnt && cnt.setText(`${U().m_skins.length}/${skins().length}`);
      if (c.m_root) publish('DisplayCollectionEvent');
      const sel = Sys.skinSelectedSetting ? Sys.skinSelectedSetting() : null;
      const ss = skins().findIndex(s => !U().m_randomSelection && U().m_skinSelected > 0 && s.id === U().m_skinSelected);
      index = ss >= 0 ? ss + 1 : 0;
      b.alert();
      S.sub('DisplayCollectionEvent', () => b.alert(), b);
      if (c.m_root) setTimeout(() => b.build(), 0);
    },
    alert() { n(c.m_alert)?.setActive(U().m_newSkin >= 0 && U().m_newSkin !== 0); },
    snap() { return S.beh(c.m_horizontalScrollSnap, u); },
    build() {
      const hs = b.snap(); if (!hs) return;
      hs.AddChild(A.scene.prefabs[refKey(c.m_prefabRandom)]);
      for (let i = 0; i < skins().length; i++) hs.AddChild(A.scene.prefabs[refKey(c.m_prefabCell)]);
      hs.RefreshPos(); hs.GoToScreen(index); init = true; b.current(index, true);
    },
    cell(i) { return n(c.m_root).children[i]; },
    cellDisplay(i) { const cl = b.cell(i); if (!cl) return null; const d = cl.compList.find(x => x.type === 'SkinSettingDisplay'); return d && d.beh; },
    update() { if (!init) return; const hs = b.snap(); if (hs && index !== hs.CurrentPage) b.current(hs.CurrentPage); },
    current(ni, first = false) {
      if (!first) SFX.playSFX('UIScrollStep');
      const root = n(c.m_root);
      if (index > 0) b.cellDisplay(index)?.Hide(false); else root.children[0]?.findComp('Image')?.setActive(true);
      for (let i = index - 10; i < index + 10; i++) if (i > 0 && i < root.children.length) b.cellDisplay(i)?.SetSetting(skins()[i - 1]);
      for (let i = ni - 10; i < ni + 10; i++) if (i > 0 && i < root.children.length) b.cellDisplay(i)?.SetSetting(skins()[i - 1]);
      index = ni;
      const off = ['m_locked', 'm_lockedFacebook', 'm_lockedGame', 'm_lockedPay', 'm_share', 'm_shareLocked'];
      if (index === 0) {
        n(c.m_random)?.setActive(true); S.beh(c.m_display, u)?.u.setActive(false); n(c.m_display)?.setActive(false);
        root.children[0]?.findComp('Image')?.setActive(false);
        for (const k of off) n(c[k])?.setActive(false);
        n(c.m_lockedPayCurrency)?.setActive(false); n(c.m_play)?.setActive(true);
        n(c.m_special)?.setActive(false); n(c.m_doubleMinigame)?.setActive(false); n(c.m_doubleCurrency)?.setActive(false);
        n(c.m_infoDownloadGame)?.setActive(false); n(c.m_infoRateGame)?.setActive(false); n(c.m_infoFacebook)?.setActive(false);
        const ar = S.comp(c.m_animationRandom, u); ar && ar.anim && (ar.anim.rewind(), ar.anim.play());
        return;
      }
      n(c.m_random)?.setActive(false); n(c.m_display)?.setActive(true);
      b.cellDisplay(index)?.Hide(true);
      const s = skins()[index - 1]; const av = s.availability;
      n(c.m_new)?.setActive(s.id === U().m_newSkin);
      S.beh(c.m_display, u)?.SetSetting(s);
      const own = U().m_skins.includes(s.id);
      n(c.m_locked)?.setActive(!own && av === 1);
      n(c.m_lockedFacebook)?.setActive(!own && av === 2);
      n(c.m_lockedGame)?.setActive(!own && (av === 3 || av === 5));
      n(c.m_lockedPay)?.setActive(false); // in-app purchase button: IAP is not available on the web
      n(c.m_lockedPayCurrency)?.setActive(!own && av === 6 && s.price > 0);
      S.beh(c.m_buttonPayCurrency, u)?.SetEnable(U().m_currency >= s.price);
      n(c.m_play)?.setActive(own); n(c.m_share)?.setActive(own); n(c.m_shareLocked)?.setActive(!own);
      n(c.m_special)?.setActive(!own && av === 1);
      n(c.m_infoDownloadGame)?.setActive(!own && av === 3); n(c.m_infoRateGame)?.setActive(!own && av === 5); n(c.m_infoFacebook)?.setActive(!own && av === 2);
      n(c.m_doubleMinigame)?.setActive(s.id === 46); n(c.m_doubleCurrency)?.setActive(s.id === 45);
      if (av === 4 || av === 6 || av === 0) n(c.m_lockedPrice)?.setText(Sys.iapPrice(s));
      if (av === 6) n(c.m_lockedCurrencyPrice)?.setText(Sys.formatNumber(s.price));
      if (s.icon) n(c.m_lockedGameIcon)?.setSprite(s.icon);
    },
    SelectSkin() {
      const s = index <= 0 ? null : skins()[index - 1];
      if (!s) U().m_randomSelection = true;
      else if (U().m_skins.includes(s.id)) { U().m_randomSelection = false; U().m_skinSelected = s.id; }
      saveUser(); publish('SkinSelectionEvent', { skin: s, collection: true });
      S.app.loadScene('SceneGame');
    },
    Unlock() { Sys.unlockPromoted(skins()[index - 1]); S.app.loadScene('SceneGame'); },
    Pay() { /* IAP not available on the web */ },
    PayCurrency() { if (Sys.payCurrency(skins()[index - 1])) { publish('CurrencyUpdateEvent'); S.app.loadScene('SceneGame'); } },
    _destroy() { if (c.m_root) { U().m_newSkin = -1; saveUser(); publish('DisplayCollectionEvent'); } },
  };
  // Collection.OnDestroy
  const off = setInterval(() => { if (u.destroyed) { clearInterval(off); b._destroy(); } }, 300);
  return b;
});
export function setupCollection() {}

// ---------- Minigame HUD bridge (MinigameSystem's UI references) ----------
export function setupMinigameUI(app, hud) {
  const sc = app.scene, S = app.scripts, sys = sc.sys;
  const n = r => hud.findById(refKey(r));
  S.byId.set(sys.id, {
    TriggerDive: () => sc.triggerDive(), CloseRetry: () => sc.closeRetry(), RetryAd: () => sc.retryAd(),
    RetryPay: () => sc.retryPay(), RetryFree: () => sc.retryFree(),
  });
  const btnBlink = r => { const x = n(r); return x && x.compList.find(c => c.type === 'ButtonBlink' || c.type === 'ButtonDisplay')?.beh; };
  const display = r => { const x = n(r); return x && x.compList.find(c => c.type === 'ButtonDisplay')?.beh; };
  const animBtn = n(sys.m_animatorButton); const ab = animBtn && animBtn.comps.Animator && animBtn.comps.Animator.animator; ab && ab.setBool('Blink', true);
  const priceT = n(sys.m_retryPrice); priceT && priceT.setText(String(A.game.priceMinigame));
  let newMarkers = new Map();
  const ui = {
    setMenu: v => n(sys.m_menu)?.setActive(v),
    setRetry: v => n(sys.m_retry)?.setActive(v),
    retryVisible: () => !!(n(sys.m_retry) && n(sys.m_retry).active),
    setRetryCounter: v => n(sys.m_retryCounter)?.setText(String(v)),
    setHookEnabled: v => display(sys.m_hookButtonDisplay)?.SetEnable(v),
    setHookIcon: free => n(sys.m_hookIcon)?.setSprite(free ? A.game.hook.m_hookIconDouble : A.game.hook.m_hookIconNormal),
    showRetry({ free, canPay, ad }) {
      app.blur(true); n(sys.m_retry)?.setActive(true); n(sys.m_menu)?.setActive(false);
      n(sys.m_retryFree)?.setActive(free); n(sys.m_retryButtons)?.setActive(!free);
      display(sys.m_retryButtonDisplay)?.SetEnable(canPay); display(sys.m_retryAdButtonDisplay)?.SetEnable(ad);
    },
    showNewSkin(skin) {
      app.blur(true); publish('PopupDisplayEvent');
      const p = S.instantiate(A.scene.prefabs[refKey(sys.m_popupNewSkin)]);
      S.setSkinPopup(p, skin);
    },
    onSkinNew(ms) {
      // MinigameSkin "New" marker follows the floating snail (FollowTarget on prefab a2_25, a world-space canvas)
      const key = refKey(ms.m_new); if (!key) return;
      let mk = newMarkers.get(ms);
      if (ms.isNew && !mk) { mk = S.instantiate(A.scene.prefabs[key]); newMarkers.set(ms, mk); }
      if (!ms.isNew && mk) { (mk.host || mk).destroy(); newMarkers.delete(ms); }
    },
  };
  // keep "New" markers over their snails (project world -> canvas units)
  S.behs.push({ u: null, update() {
    for (const [ms, mk] of newMarkers) {
      const root = sc.ids.get(ms.m_root.$).go; const wp = root.worldPos();
      const hh = sc.orthoSize, ww = hh * app.w / app.h; const cv = (mk.host || mk);
      const cw = cv.rect().w, ch = cv.rect().h;
      mk.setAnchors(0.5, 0.5, 0.5, 0.5);
      mk.setAnchoredPos(wp.x / ww * cw / 2, wp.y / hh * ch / 2);
    }
  } });
  return ui;
}
