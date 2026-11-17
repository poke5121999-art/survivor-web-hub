// Drop 2 panels, each the original uGUI node of art/ui/level2.json opened where the original opens it, buttons calling
// sim.action like the original onClick listeners (every ad button grants its reward at once, never charges coins):
//   ShopPanle     InGame/ShopButton -> GoToGamePlay.ShowShop (PlayerCam on, MainCamera off); CrossBtn -> HideShop.
//                 27 UnlockItems buttons: locked (clapperboard child) -> UnlockWithAd; unlocked -> PickObject.
//   Bat shop      EnableShop area (Area_magic_multicolor, goid 3553): SetActive on enter / off on exit; the panel's
//   shoes shop    DOTween Move (0.5 s OutQuad) to (960, 418) from its serialized off-screen position; cross button hides it.
//                 batButton: coins button UpgradePlayer, video button Watchads. ThirdPersonUpgrade: Button / Button (1).
//   pedestals     UnlockManager: inside the trigger Unlockbtn2 (locked) or PickButton1 (unlocked); Unlockbtn2 opens the
//                 WeponUnlockPanel (Back closes it, leaving the trigger does not); CoinButton 500 coins, AdsBtn one ad.
//                 The pedestal turns to the player every frame (Update LookAt). weaponManager.ChangeWapon: weapon in hand,
//                 its pedestal hidden.
//   cosmetics     UnlockItems.PickObject: ActiveObjects on the player rig (Player1 objects of the 6 per item).
//   Inventory     InventoryManager strip of SeedBtn buttons (art/ui/seedbtn.json), one per held or stowed brainrot.
//   Pause/Setting TopPanel/Pause and TopPanel/Setting pause the game (Time.timeScale 0); Settings: sound, music, sensitivity.
//   ads break     "Add in" chip mm:ss, ads panel (coins 25/50/75/100) and ads panel (1) (full health), GetCoins (+100).
import * as THREE from 'three';
import { t, tf } from './vi.js';
import { inventory } from '../sim/items.js';

const outQuad = x => 1 - (1 - x) * (1 - x);
const two = n => String(n).padStart(2, '0');
const C = p => (p.startsWith('Canvas/') ? p.slice(7) : p);

export class Panels {
  constructor({ sim, hud, view, sound, tweens = {}, seedbtn = null, spriteBase, version = '', onPurchase = () => {}, onPause = () => {} }) {
    this.sim = sim;
    this.hud = hud;
    this.view = view;
    this.world = view.world;
    this.sound = sound;
    this.tweens = tweens;
    this.seedbtn = seedbtn;
    this.spriteBase = spriteBase;
    this.q = version ? `?v=${version}` : '';
    this.onPurchase = onPurchase;
    this.onPause = onPause;
    this.D = sim.D;
    this.shown = {};
    this.shopOpen = false;                       // ShopPanle (cosmetics / weapons grid)
    this.areaShop = { bat: false, shoes: false };  // EnableShop panels
    this.lastZone = null;
    this.moves = {};                              // panel path -> { t }
    this.pedestalPanel = -1;                      // open WeponUnlockPanel (pedestal index) or -1
    this.pickHidden = new Set();                  // PickObject hid the Pick button until the next trigger entry
    this.lastPedestal = null;
    this.paused = null;                           // 'pause' | 'setting' | null
    this.invKey = '';
    this.camNode = this.world.node('Player1/Camera');
    this.playerObj = this.world.node('Player1');
    this.envWeapons = this.world.envWeapons('Player1');
    this.pedestalObjs = this.D.weapons.pedestals.map(p => this.world.objects[p.node]);
    // Player1's object of every cosmetic (UnlockItems.ActiveObjects, one per player model)
    this.cosmetics = this.D.weapons.shopItems.filter(d => !d.weapon).map(d => ({
      key: d.key, objs: d.active.filter(p => p.startsWith('Player1/')).map(p => this.world.node(p)).filter(Boolean) }));
    this.allCosmeticObjs = [...new Set(this.cosmetics.flatMap(c => c.objs))];
    this.equipKey = null;
    this.bind();
    this.buildInventory();
    // InGame/TopPanel/GetCoins ("Free Coins", +100 ad) stays inactive like in the scene: no script that activates it was
    // found (rules/ads-iap.md 1.4), and shown it would cover the tutorial panel. The +100 coin ad is the counter's green
    // plus (TopPanel/Coins -> coins.WatchAds), wired in ui.js. Its click is bound here in case it is ever shown.
    this.applySettings();
    this.applyEquip(true);
  }

  node(p) { return this.hud.node(C(p)); }

  set(path, on) {
    const p = C(path);
    if (this.shown[p] === on) return;
    this.shown[p] = on;
    this.hud.show(p, on);
  }

  click(path, f) {
    const el = this.node(path);
    if (!el) return;
    el.addEventListener('click', e => { e.stopPropagation(); this.sound.play('click'); f(e); });
  }

  act(name, arg, save = true) {
    const ok = this.sim.action(name, arg);
    if (ok && save) this.onPurchase();
    return ok;
  }

  // --- wiring ---------------------------------------------------------------------------------------------------------
  bind() {
    const D = this.D;
    // ShopPanle
    this.click('InGame/ShopButton', () => this.openShop(true));
    this.click('ShopPanle/Image/CrossBtn', () => this.openShop(false));
    this.shopButtons = D.weapons.shopItems.filter(d => d.ui.startsWith('Canvas/ShopPanle/'));
    for (const d of this.shopButtons) {
      this.click(d.ui, () => {
        const bag = d.weapon ? this.sim.state.upgrades.weapons.unlocked : this.sim.state.upgrades.cosmetics.unlocked;
        if (bag[d.key]) this.act('shopPick', { key: d.key });       // PickObject
        else this.act('shopUnlock', { key: d.key });                 // UnlockWithAd: ad = unlocked at once
      });
    }
    // Bat shop / shoes shop
    this.click('Bat shop/Button', () => this.areaPanel('bat', false));
    this.click('shoes shop/Button', () => this.areaPanel('shoes', false));
    D.weapons.batShop.forEach((d, i) => {
      this.click(d.btn, () => this.act('batBuy', { i }));
      this.click(d.video, () => this.act('batBuy', { i, ad: true }));
      this.hud.setText(C(d.coinsText), d.cost);                     // batButton.Start: coinstxt = upgradeCost
    });
    D.speedPlans.forEach(p => {
      this.click(`${p.ui}/Button`, () => this.act('buySpeed', { plan: p.plan }));
      this.click(`${p.ui}/Button (1)`, () => this.act('buySpeed', { plan: p.plan, ad: true }));
    });
    // pedestals
    D.weapons.pedestals.forEach((d, i) => {
      this.click(d.ui.unlock, () => { this.pedestalPanel = i; });                  // Unlockbtn
      this.click(d.ui.back, () => { this.pedestalPanel = -1; });                   // Back
      this.click(d.ui.coin, () => { if (this.act('weaponBuy')) this.pedestalPanel = -1; });
      this.click(d.ui.ad, () => {
        if (this.act('weaponAd') && this.sim.state.upgrades.weapons.unlocked[d.key]) this.pedestalPanel = -1;
      });
      this.click(d.ui.pick, () => { if (this.act('weaponPick')) this.pickHidden.add(i); });
      this.hud.setText(C(d.ui.coinText), d.price);
    });
    // pause / settings
    this.click('InGame/TopPanel/Pause', () => this.pause('pause'));
    this.click('PauseGame/Panel/Resume', () => this.pause(null));
    this.click('PauseGame/Panel/Restart', () => { this.onPurchase(); location.reload(); });
    this.click('PauseGame/Panel/Home', () => { this.onPurchase(); location.href = '../../index.html'; });
    this.click('InGame/TopPanel/Setting', () => this.pause('setting'));
    this.click('Setting/Panel/Panel/Sound/sound', () => { this.act('settings', { sound: !this.sim.state.settings.sound }); this.applySettings(); });
    this.click('Setting/Panel/Panel/Music/sound', () => { this.act('settings', { music: !this.sim.state.settings.music }); this.applySettings(); });
    this.click('Setting/Panel/Save', () => { this.applySettings(); this.onPurchase(); this.pause(null); });   // Settings.Continue
    this.bindSlider();
    // ads break and the coin ad
    this.click('ads panel/Panel/bottem/Ads', () => this.act('adsBreakCoins'));
    this.click('ads panel (1)/Panel/bottem/Ads', () => this.act('adsBreakHealth'));
    this.click('InGame/TopPanel/GetCoins', () => this.act('adCoins'));
  }

  // Settings.ChangeSensitivity: the slider (0..10) drags; the value is stored as an int.
  bindSlider() {
    const path = 'Setting/Panel/Panel/Sensitvity/Slider', el = this.node(path);
    if (!el) return;
    el.classList.add('ugui-hit');
    let down = false;
    const setFrom = e => {
      const r = el.getBoundingClientRect(), rot = window.__game && window.__game.stage.rotated;
      const k = rot ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      const v = Math.max(0, Math.min(10, k * 10));
      this.hud.setSlider(path, v);
      this.sim.action('settings', { sensitivity: v });
    };
    el.addEventListener('pointerdown', e => { down = true; setFrom(e); e.stopPropagation(); });
    el.addEventListener('pointermove', e => { if (down) setFrom(e); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { down = false; });
  }

  applySettings() {
    const st = this.sim.state.settings;
    this.set('Setting/Panel/Panel/Sound/sound/Image (1)', !st.sound);    // the cross shows when OFF
    this.set('Setting/Panel/Panel/Music/sound/Image (1)', !st.music);
    this.hud.setSlider('Setting/Panel/Panel/Sensitvity/Slider', st.sensitivity);
    this.sound.setSettings({ sound: st.sound, music: st.music });
    if (this.view.follow) this.view.follow.rotationSpeed = st.sensitivity;  // CameraFollow reloads rotationSpeed
  }

  pause(which) {
    if (this.paused === which) return;
    this.paused = which;
    this.set('PauseGame', which === 'pause');
    this.set('Setting', which === 'setting');
    if (which === 'setting') this.applySettings();
    this.onPause(!!which);                                     // PauseAndResumegame: Time.timeScale 0 / 1
  }

  openShop(on) {
    this.shopOpen = on;
    this.set('ShopPanle', on);
    if (on) this.hud.relayout('ShopPanle');
  }

  areaPanel(which, on) {
    const path = which === 'bat' ? 'Bat shop' : 'shoes shop';
    this.areaShop[which] = on;
    this.set(path, on);
    if (on) { this.hud.relayout(path); this.moves[path] = { t: 0 }; } else delete this.moves[path];
  }

  // --- per frame ------------------------------------------------------------------------------------------------------
  draw(dt) {
    const s = this.sim.state, ui = s.ui, D = this.D;
    // EnableShop: enter -> panel on, exit -> off (a cross-closed panel stays closed until the next entry)
    if (ui.shop !== this.lastZone) {
      if (this.lastZone) this.areaPanel(this.lastZone, false);
      if (ui.shop) this.areaPanel(ui.shop, true);
      this.lastZone = ui.shop;
    }
    for (const [path, mv] of Object.entries(this.moves)) this.drawMove(path, mv, dt);
    if (this.areaShop.shoes) {
      D.speedPlans.forEach(p => this.hud.setText(C(`${p.ui}/Button/Text (TMP)`), s.upgrades.speedPlans[p.plan] ? t('MAX') : p.cost));
    }
    if (this.shopOpen) {
      for (const d of this.shopButtons) {
        const bag = d.weapon ? s.upgrades.weapons.unlocked : s.upgrades.cosmetics.unlocked;
        this.set(`${d.ui}/Image`, !bag[d.key]);                    // videoIcon while locked
      }
    }
    this.drawPedestals();
    this.applyEquip(false);
    this.drawInventory();
    this.drawAdsBreak();
  }

  // DOTween Move of an EnableShop panel: from its serialized rect to the overlay position (960, 418), 0.5 s OutQuad.
  drawMove(path, mv, dt) {
    const tw = this.tweens[`Canvas/${path}`], el = this.node(path), i = this.hud.index(path);
    if (!tw || !el || i < 0 || !this.hud.size) return;
    mv.t += dt;
    const a = this.hud.abs[i], ch = this.hud.size[1] / this.hud.scale;
    const dx = tw.endValueV3.x - (a.x + a.w / 2), dy = (ch - tw.endValueV3.y) - (a.y + a.h / 2);
    const k = outQuad(Math.min(1, mv.t / tw.duration));
    el.style.translate = `${dx * k}px ${dy * k}px`;
  }

  drawPedestals() {
    const s = this.sim.state, ui = s.ui, w = s.upgrades.weapons;
    if (ui.pedestal !== this.lastPedestal) { this.pickHidden.clear(); this.lastPedestal = ui.pedestal; }
    const p3 = this.playerObj.getWorldPosition(new THREE.Vector3());
    this.D.weapons.pedestals.forEach((d, i) => {
      const inside = ui.pedestal === i, unlocked = !!w.unlocked[d.key];
      this.set(d.ui.unlock, inside && !unlocked && this.pedestalPanel !== i);
      this.set(d.ui.pick, inside && unlocked && !this.pickHidden.has(i));
      if (unlocked && this.pedestalPanel === i) this.pedestalPanel = -1;
      this.set(d.ui.panel, this.pedestalPanel === i);
      const n = w.ads[d.adsKey] || 0;
      this.set(d.ui.adText, n < d.ads);
      if (n < d.ads) this.hud.setText(C(d.ui.adText), tf('{0}/{1} ads', n, d.ads));
      // UnlockManager.Update: transform.LookAt(player.position)
      const o = this.pedestalObjs[i];
      if (o && o.visible && o.parent) {
        const pos = o.getWorldPosition(new THREE.Vector3());
        const m = new THREE.Matrix4().lookAt(pos, p3, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        o.quaternion.copy(pq.multiply(q));
      }
    });
  }

  // weaponManager.ChangeWapon + UnlockItems.PickObject, from the saved choices.
  applyEquip(force) {
    const u = this.sim.state.upgrades, key = JSON.stringify([u.weapons.equipped, u.weapons.changed, u.cosmetics.picked]);
    if (!force && key === this.equipKey) return;
    this.equipKey = key;
    this.world.setHandWeapon(u.weapons.equipped, 'Player1');
    this.envWeapons.forEach((o, i) => { if (o) o.visible = !(u.weapons.changed && i === u.weapons.equipped); });
    for (const o of this.allCosmeticObjs) o.visible = false;
    for (const c of this.cosmetics) if (u.cosmetics.picked[c.key]) for (const o of c.objs) o.visible = true;
  }

  // --- inventory ------------------------------------------------------------------------------------------------------
  buildInventory() {
    this.inv = { el: this.node('InGame/Inventory/Image/InventoryPng/Scroll View/Viewport/Contern'), buttons: new Map() };
  }

  // One SeedBtn per brainrot in hand or stowed (InventoryManager), left to right from padding 32, spacing 42.05; the one in
  // hand pulses (DOFade 0.35, 0.5 s InOutSine yoyo). A tap: stow it, or take it out with empty hands.
  drawInventory() {
    const sb = this.seedbtn, inv = this.inv;
    if (!sb || !inv.el) return;
    const s = this.sim.state, ids = inventory(this.sim, 0);
    const key = ids.map(id => `${id}:${s.items[id].at.carried === 0 ? 1 : 0}`).join(',');
    if (key === this.invKey) return;
    this.invKey = key;
    // The strip is shown while it has a button (its transparent scroll view would otherwise eat camera drags along the
    // bottom of the screen; the scene keeps Inventory inactive until something enables it).
    this.set('InGame/Inventory', ids.length > 0);
    const size = sb.root.rect.sizeDelta, pad = 32, gap = 42.05;
    const contern = this.hud.index('InGame/Inventory/Image/InventoryPng/Scroll View/Viewport/Contern');
    this.hud.sizeOverride.set(contern, [pad + ids.length * size[0] + Math.max(0, ids.length - 1) * gap, null]);
    this.hud.relayout(contern);
    for (const [id, b] of inv.buttons) if (!ids.includes(id)) { b.remove(); inv.buttons.delete(id); }
    ids.forEach((id, k) => {
      let b = inv.buttons.get(id);
      if (!b) {
        b = this.makeSeedButton(id);
        inv.el.appendChild(b);
        inv.buttons.set(id, b);
      }
      Object.assign(b.style, { left: `${pad + k * (size[0] + gap)}px`, top: `calc(50% - ${size[1] / 2}px)` });
      b.classList.toggle('seed-selected', s.items[id].at.carried === 0);
    });
  }

  makeSeedButton(id) {
    const sb = this.seedbtn, it = this.sim.state.items[id], br = this.D.seedIndex.get(it.seed);
    const b = document.createElement('div');
    b.className = 'ugui ugui-hit ugui-btn seed-btn';
    b.dataset.path = `Canvas/InGame/Inventory/SeedBtn/${id}`;
    b.dataset.item = id;
    Object.assign(b.style, { width: `${sb.root.rect.sizeDelta[0]}px`, height: `${sb.root.rect.sizeDelta[1]}px` });
    const bg = document.createElement('div');
    bg.className = 'ugui-img seed-bg';
    bg.style.backgroundImage = `url("${this.spriteBase}/${sb.root.sprite.file}.webp${this.q}")`;
    bg.style.backgroundSize = '100% 100%';
    const icon = document.createElement('div');
    icon.className = 'ugui-img';
    const r = sb.icon.rect;                                  // stretch to the parent with sizeDelta -20: inset 10
    Object.assign(icon.style, { inset: `${-r.sizeDelta[1] / 2}px ${-r.sizeDelta[0] / 2}px` });
    const sp = sb.seeds[String(br.type)];
    if (sp) { icon.style.backgroundImage = `url("${this.spriteBase}/${sp.file}.webp${this.q}")`; icon.style.backgroundSize = '100% 100%'; }
    b.append(bg, icon);
    const press = on => b.classList.toggle('ugui-pressed', on);
    b.addEventListener('pointerdown', () => press(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => press(false));
    b.addEventListener('click', e => { e.stopPropagation(); this.sound.play('click'); this.act('inventory', { item: id }); });
    return b;
  }

  // --- ads break ------------------------------------------------------------------------------------------------------
  drawAdsBreak() {
    const b = this.sim.state.adsBreak;
    if (!b) return;
    this.hud.setText('InGame/TopPanel/Add in/Text (TMP) (1)', `${two(Math.floor(b.left / 60))}:${two(b.left % 60)}`);
    this.set('ads panel', b.panel === 'coin');
    this.set('ads panel (1)', b.panel === 'health');
    if (b.panel === 'coin') {
      const n = this.D.code.adsLoadingCount;
      this.hud.setText('ads panel/Panel/Text (TMP) (2)', b.loading >= n ? t('Ad loading : ') : b.loading > 0 ? tf('Ad loading: {0}', b.loading) : t('Ad loaded '));
      // Rewardpanel: effects[CurrentReward - 1] (UIEffect Shiny, gold band) on the card that the claim pays
      this.D.adsBreak.rewardEffects.forEach((p, k) => {
        const el = this.node(p), L = el && el.querySelector(':scope > .ugui-img');
        if (!el) return;
        if (L && !L.style.getPropertyValue('--shine-mask')) L.style.setProperty('--shine-mask', L.style.backgroundImage);
        el.classList.toggle('reward-shine', k === b.reward - 1);
      });
    }
  }
}
