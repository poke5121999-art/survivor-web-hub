// HUD over the 3D view. The money counter, the upgrade office popup (PlayerTotalUpgradeUI), the HR popup
// (HRUpgradeUI) and the offline reward popup are the original uGUI screens rebuilt from art/ui (view/ui.js); the
// tutorial line and the price tags on pads stay plain HTML (the original draws those with TextMeshPro in the world).
// Ad buttons, jewel buttons and the boost bubbles of those screens are hidden: the web build has no ads or shop.
import * as THREE from 'three';
import { UiLayer } from './ui.js';

const fmt = n => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}K` : `${Math.floor(n)}`);
const v = new THREE.Vector3();
// UIManager..ctor upgradePointColor: [0] empty level, [1] reached level.
const POINT = ['rgba(188,183,168,1)', 'rgba(116,211,7,1)'];

export class Hud {
  constructor(root, { sim, text, camera, canvas, ui, uiBase, sound, stage = 1, meta = null, stageData = null, enter = null, skins = null }) {
    this.skins = skins;
    this.stageN = stage;
    this.meta = meta;
    this.stageData = stageData;
    this.enter = enter;
    this.sim = sim;
    this.text = text;
    this.camera = camera;
    this.canvas = canvas;
    this.sound = sound;
    root.innerHTML = `
      <div class="tags" id="tags"></div>
      <div class="balloons" id="balloons"></div>
      <button class="snd" id="snd" title="Sound"></button>
      <button class="map" id="map" title="Burger Map"></button>
      <div class="mapnav" id="mapnav" hidden><button id="prev">◀</button><button id="next">▶</button></div>`;
    this.el = id => root.querySelector(`#${id}`);
    this.tags = new Map();
    this.balloons = new Map();
    this.ui = ui;
    this.uiBase = uiBase;
    this.menuKind = null;
    this.closed = null;
    const snd = this.el('snd');
    snd.hidden = !sound;
    const sndLabel = () => { snd.textContent = sound && sound.on ? '🔊' : '🔇'; };
    sndLabel();
    snd.addEventListener('click', () => { sound.unlock(); sound.toggle(); sndLabel(); });

    this.layer = new UiLayer(root, ui, uiBase);
    this.money = this.layer.panel('money');
    for (const p of ['currencyEffectPool', 'spreadpoint']) this.money.show(p, false);
    this.money.show('', true);
    this.guide = this.layer.panel('guide');
    this.office = this.layer.panel('upgrade');
    this.hr = this.layer.panel('hr');
    this.offline = this.layer.panel('offline');
    this.setupOffice();
    this.setupHr();
    this.setupOffline();
    this.setupStages();
    if (skins) this.setupSkins();
  }

  // ---- skin shop (SkinView + one SkinForm cell per skin) ----
  // Listed: the stage-reward uniforms (cost_stage, free: "open on stage N", then TAKE IT), the token skins (Skin.cost_type
  // 8, bought with tokens the web build has no source for: grey cost button) and the VIP one (subscription: locked).
  // Battle-pass, eating-challenge, renovation and event skins come from features the web build lacks and are left out.
  setupSkins() {
    const k = this.skins, sp = this.ui.skinSprites;
    const p = this.skinPanel = this.layer.panel('skinView');
    this.localise(p);
    p.el.id = 'skinview';
    this.click(p.q('Menu/Top/BtnClose'), () => this.hideSkins());
    // Preview: the original turns a 3D PlayerSkin model on the stand; here the skin's own thumbnail stands in.
    const stand = p.q('Stand');
    const pv = this.skinPreview = document.createElement('div');
    pv.className = 'u skinpv';
    stand.appendChild(pv);
    const place = () => {
      const h = parseFloat(stand.style.height) || this.layer.ch;
      Object.assign(pv.style, { left: `${(parseFloat(stand.style.width) || this.layer.cw) / 2 - 260}px`, top: `${h - 1180}px`, width: '400px', height: '480px' });
    };
    this.skinPlace = place;
    const vp = p.q('Menu/Bottom/ScrSkin/Viewport');
    const row = this.skinRow = document.createElement('div');
    row.className = 'skinrow';
    vp.appendChild(row);
    vp.classList.add('skinvp');
    this.skinCells = [];
    const list = k.lib.rows.filter(r => !r.battle_path && !r.eating_challenge && !r.renovation && r.cost_stage !== 1000);
    for (const r of list) {
      const c = this.layer.cell('skinForm');
      const wrap = document.createElement('div');
      wrap.className = 'skincell';
      wrap.dataset.id = r.id;
      wrap.appendChild(c.el);
      row.appendChild(wrap);
      c.layout(180, 370);
      const th = c.q('Grp/PnlThumb/Mask/ImgThumb');
      const tf = k.lib.thumbs[r.id - 1];
      if (th && tf) Object.assign(th.style, { backgroundImage: `url("${this.uiBase}/${tf}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom' });
      c.set('Grp/BtnShop/Txt', this.t('SKIN_TAKE_IT'));
      c.q('Grp/PnlCond/Txt').classList.add('wrap');   // TMP word wrap: "open on stage N" breaks inside the panel
      this.click(c.q('Grp'), () => this.pickSkin(r.id));
      this.click(c.q('Grp/BtnShop'), () => { k.take(r.id); this.pickSkin(r.id); });
      this.skinCells.push({ r, c });
    }
    this.skinSel = k.state.sel;
    p.show('', false);
    this.labelFor = t => sp[t <= 2 ? 'assetLabelPink' : t <= 4 ? 'assetLabelGreen' : t <= 7 ? 'assetLabelBlue' : 'assetLabelOrange'];
  }

  // A skin's state for the cell: owned / takeable (stage reached) / locked by stage / token / vip.
  skinState(r) {
    const k = this.skins;
    if (k.state.owned.includes(r.id)) return 'owned';
    if (r.vip) return 'vip';
    if (r.cost_type === 8) return 'token';
    if (r.cost_type === 0 && r.cost_stage >= 0) return k.maxStage() - 1 >= r.cost_stage ? 'take' : 'stage';
    return 'locked';
  }

  showSkins() {
    if (!this.skinPanel) return;
    this.skinPanel.show('', true);
    document.body.classList.add('skins');
    this.skinPanel.layout(this.layer.cw, this.layer.ch);
    this.skinPlace();
    this.skinSel = this.skins.state.sel;
    this.refreshSkins();
    const cur = this.skinCells.find(x => x.r.id === this.skinSel);
    if (cur) cur.c.el.parentNode.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  hideSkins() { if (this.skinPanel) this.skinPanel.show('', false); document.body.classList.remove('skins'); }

  get skinsOpen() { return !!this.skinPanel && !this.skinPanel.el.hidden; }

  // Tapping a cell previews it; tapping an owned one also wears it (SkinManager.ChangeSkin).
  pickSkin(id) {
    this.skinSel = id;
    const r = this.skins.lib.rows.find(x => x.id === id);
    if (r && this.skinState(r) === 'owned' && this.skins.state.sel !== id) this.skins.equip(id);
    this.refreshSkins();
  }

  refreshSkins() {
    const k = this.skins, sp = this.ui.skinSprites, p = this.skinPanel;
    for (const { r, c } of this.skinCells) {
      const st = this.skinState(r);
      c.show('Grp/PnlThumb/ObjSelect', r.id === this.skinSel);
      c.show('Grp/PnlThumb/IconVip', r.vip);
      c.show('Grp/PnlThumb/IconLock', st !== 'owned' && st !== 'take');
      c.show('Grp/PnlCond', st === 'stage');
      if (st === 'stage') c.set('Grp/PnlCond/Txt', this.t('SKIN_OPEN').replace('{0}', r.cost_stage + 1));
      c.show('Grp/ObjSelect', st === 'owned');
      c.show('Grp/ObjSelect/IconCheck', k.state.sel === r.id);
      c.show('Grp/BtnShop', st === 'take');
      c.show('Grp/BtnCost', st === 'token');
      c.show('Grp/BtnRv', false);
      c.show('Grp/BtnJewel', false);
      if (st === 'token') {
        c.show('Grp/BtnCost/IconToken', true);
        c.set('Grp/BtnCost/Txt', r.cost_value);
        const b = c.q('Grp/BtnCost').querySelector(':scope > i.sl');
        if (b && sp.assetUnbuyable) b.style.borderImageSource = `url("${this.uiBase}/${sp.assetUnbuyable}")`;
      }
      c.el.parentNode.dataset.state = st;
    }
    const r = k.lib.rows.find(x => x.id === this.skinSel);
    if (!r) return;
    p.set('Stand/Name/TxtName', this.t(`SKIN_NAME_${r.id}`));
    const tf = k.lib.thumbs[r.id - 1];
    this.skinPreview.style.backgroundImage = tf ? `url("${this.uiBase}/${tf}")` : '';
    for (let i = 1; i <= 3; i++) {
      const ab = r.ab[i - 1];
      p.show(`Stand/GrpAbility/Info_${i}`, !!ab);
      if (!ab) continue;
      p.set(`Stand/GrpAbility/Info_${i}/TxtName`, this.t(`SKIN_ABILITY_${ab[0]}`));
      p.set(`Stand/GrpAbility/Info_${i}/TxtValue`, `+${ab[1]}`);
      const b = p.q(`Stand/GrpAbility/Info_${i}`).querySelector(':scope > i.sl');
      const lab = this.labelFor(ab[0]);
      if (b && lab) b.style.borderImageSource = `url("${this.uiBase}/${lab}")`;
    }
  }

  // World map stage popups (StagePopup / StageLockedPopup), browsed with arrows from the store-logo button.
  setupStages() {
    this.stagePanel = this.layer.panel('stagePopup');
    this.lockedPanel = this.layer.panel('stageLocked');
    this.localise(this.stagePanel);
    this.localise(this.lockedPanel);
    this.stagePanel.show('Slot/HRRoomButton', false);
    this.stagePanel.show('Slot/OfflineRewardPlus/PnlThumb', false);
    const logo = n => `url("${this.uiBase}/${this.ui.logos[n - 1]}")`;
    this.el('map').style.backgroundImage = logo(this.stageN);
    this.el('map').addEventListener('click', () => this.showStage(this.stageN));
    this.click(this.stagePanel.q('Slot/ButtonClose'), () => this.hideStages());
    this.click(this.lockedPanel.q('ButtonClose'), () => this.hideStages());
    this.click(this.stagePanel.q('Slot/EnterButton'), () => {
      if (this.browse === this.stageN) this.hideStages();
      else if (this.enter) this.enter(this.browse);
    });
    this.stagePanel.q('Slot/EnterButton').id = 'enter';
    this.el('prev').addEventListener('click', () => this.showStage(Math.max(1, this.browse - 1)));
    this.el('next').addEventListener('click', () => this.showStage(Math.min(10, this.browse + 1)));
    this.logo = logo;
  }

  hideStages() {
    this.browse = null;
    this.stagePanel.show('', false);
    this.lockedPanel.show('', false);
    this.el('mapnav').hidden = true;
  }

  async showStage(n) {
    this.browse = n;
    const open = !this.meta || !!this.meta.open[n];
    this.el('mapnav').hidden = false;
    this.stagePanel.show('', open);
    this.lockedPanel.show('', !open);
    if (!open) {
      for (const k of ['Logo']) { const e = this.lockedPanel.q(k); if (e) e.style.backgroundImage = this.logo(n); }
      this.lockedPanel.set('Desc', this.t('STAGE_OPEN_CONDITION_DESC'));
      this.lockedPanel.layout(this.layer.cw, this.layer.ch);
      return;
    }
    const p = this.stagePanel;
    p.set('Slot/Slot (1)/PlaceNameText', `${this.t('Stage')} ${n}`);
    const lg = p.q('Slot/Slot (1)/PlaceNameText/Logo');
    if (lg) lg.style.backgroundImage = this.logo(n);
    p.set('Slot/EnterButton/Text', n === this.stageN ? 'OK' : this.t('Enter'));
    p.layout(this.layer.cw, this.layer.ch);
    // Offline income of that stage: offline_reward_plus per 10 s, capped at _offlineMaxMinutes x plus x 6.
    if (this.stageData) {
      try {
        const d = await this.stageData(n);
        if (this.browse !== n) return;
        const o = d.offline;
        p.set('Slot/OfflineRewardPlus/Text', 'per 10s');
        p.set('Slot/OfflineRewardPlus/Box/CafeIncomText', fmt(o.plus));
        p.set('Slot/OfflineRewardPlus/Box (1)/MaxIncomText', fmt(o.maxMinutes * o.plus * o.maxUnit));
      } catch (e) { /* stage data missing: keep the defaults */ }
    }
  }

  t(key) { return this.text[key] || key; }

  // Localised labels on the panels (StringChange ids -> Locale_128).
  localise(panel) {
    for (const [, { el, n }] of panel.nodes) if (n.txt && n.txt.key && el._span) panel.text(el, n, this.t(n.txt.key));
  }

  click(el, fn) {
    if (!el) return;
    el.classList.add('b');
    el.addEventListener('click', e => { e.stopPropagation(); fn(); });
  }

  setupOffice() {
    const p = this.office;
    this.localise(p);
    this.officeRows = [['UpgradeFrame1', 'player.speed'], ['UpgradeFrame2', 'player.cap'], ['UpgradeFrame3', 'player.price']];
    for (const [f, kind] of this.officeRows) {
      for (const hide of ['ADButton', 'ADMax', 'Bubble']) p.show(`Frame/${f}/${hide}`, false);
      const btn = p.q(`Frame/${f}/PurchaseButton`);
      btn.dataset.buy = kind;
      this.click(btn, () => { if (this.sim.buyUpgrade(kind)) this.menuKey = null; });
    }
    this.click(p.q('ButtonClose'), () => { this.closed = 'office'; });
  }

  setupHr() {
    const p = this.hr;
    this.localise(p);
    this.hrRows = [['MoveSpeedSlot', 'worker.speed'], ['CapacitySlot', 'worker.cap'], ['EmploySlot', 'worker.employ']];
    for (const [slot, kind] of this.hrRows) {
      const base = `Bg/${slot}`;
      for (const [, { el, n }] of p.nodes) {
        if (!el.parentElement || el.parentElement !== p.q(base)) continue;
        if (/^(CurrencyButtonView|AD|Bubble)/.test(n.n)) el.hidden = true;
        if (/^Button/.test(n.n)) { el.dataset.buy = kind; this.click(el, () => { if (this.sim.buyUpgrade(kind)) this.menuKey = null; }); }
      }
    }
    this.click(p.q('Bg/ButtonClose'), () => { this.closed = 'hr'; });
  }

  setupOffline() {
    const p = this.offline;
    this.localise(p);
    for (const hide of ['Bg/CurrencyButtonView', 'Bg/ADButton']) p.show(hide, false);
    const get = p.q('Bg/GetButton');
    get.hidden = false;
    get.style.opacity = 1;                // fades in by animation in the original (colour alpha 0 at rest)
    get.id = 'claim';
    this.click(get, () => { p.show('', false); const f = this.onClaim; this.onClaim = null; if (f) f(); });
  }

  update() {
    const sim = this.sim, s = sim.s;
    this.money.set('ItemCount', fmt(s.money));
    const step = sim.d.guide[s.guide];
    const g = step && step.text && sim.guideActive() ? this.t(step.text) : '';
    this.guide.set('Text (TMP)', g);
    this.guide.show('', !!g);
    this.updateTags();
    this.updateBalloons();
    this.updateMenu();
  }

  // Order balloons (OrderBalloonManager): one over the customer or car at the head of each line, a sliced
  // outline_box with "<sprite=N> count" (N = item icon of the stage's TMP sprite asset). Sized in world units through
  // the orthographic camera: SpriteRenderer m_Size 1.6 x 1.0, TextMeshPro size 6 = 0.6 units.
  updateBalloons() {
    const sim = this.sim, B = this.ui.balloons;
    if (!B) return;
    const want = sim.balloons();
    const h = this.canvas.clientHeight, w = this.canvas.clientWidth;
    const ppu = h / (this.camera.top - this.camera.bottom);
    const seen = new Set();
    for (const b of want) {
      const def = B[b.kind === 'car' ? 'CarOrderBalloon' : 'CustomerOrderBalloon'];
      seen.add(b.key);
      let el = this.balloons.get(b.key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'balloon';
        const [l, bt, r, t] = def.border;
        const sc = 1 / def.ppu;   // border in world units
        el.innerHTML = `<i class="bg"></i><img alt=""><b></b>`;
        Object.assign(el.querySelector('.bg').style, {
          borderImage: `url("${this.uiBase}/${def.bg}") ${t} ${r} ${bt} ${l} fill / ${t * sc}em ${r * sc}em ${bt * sc}em ${l * sc}em`,
          borderWidth: `${t * sc}em ${r * sc}em ${bt * sc}em ${l * sc}em`, opacity: def.alpha });
        el.querySelector('b').style.color = `rgba(${def.c.slice(0, 3).map(x => x * 255).join(',')},${def.c[3]})`;
        this.el('balloons').appendChild(el);
        this.balloons.set(b.key, el);
      }
      // 1 em = 1 world unit on screen.
      el.style.fontSize = `${ppu}px`;
      el.style.width = `${def.size[0]}em`;
      el.style.height = `${def.size[1]}em`;
      const icon = B.icons[b.icon];
      const img = el.querySelector('img');
      const src = `${this.uiBase}/${icon.s}`;
      if (img.dataset.s !== src) { img.src = src; img.dataset.s = src; }
      const txt = el.querySelector('b');
      if (txt.textContent !== String(b.count)) txt.textContent = b.count;
      txt.style.fontSize = `${def.fs / 10}em`;
      v.set(b.pos[0], (b.pos[1] || 0) + def.y, b.pos[2]).project(this.camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
    for (const [k, el] of this.balloons) if (!seen.has(k)) { el.remove(); this.balloons.delete(k); }
  }

  // Remaining price over every pad the player can buy now (the original prints it with TextMeshPro on the pad).
  updateTags() {
    const sim = this.sim, s = sim.s;
    const vis = sim.visiblePads();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const seen = new Set();
    for (const id of vis) {
      const cost = sim.upgradeCost(id);
      if (cost == null || sim.canBuy(id)) continue;
      seen.add(id);
      let el = this.tags.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag';
        this.el('tags').appendChild(el);
        this.tags.set(id, el);
      }
      const p = sim.pads.get(id);
      const left = cost - (s.paid[id] || 0);
      const lock = !sim.canBuy(id) && sim.districts.get(id);
      // Prices are drawn on the pads in 3D (game.js); only the star lock of a district pad stays as a tag.
      const label = lock ? `★${lock.star}` : '';
      if (el.textContent !== label) el.textContent = label;
      el.classList.toggle('poor', !!lock || left > s.money);
      v.set(p.box[0], 0.2, p.box[1]).project(this.camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); }
  }

  // Standing in the upgrade office or the HR office opens its popup (PlayerUpgradeArea / HRUpgradeArea); the close
  // button keeps it shut until the player walks out and back in.
  zoneMenu() {
    const sim = this.sim, s = sim.s, p = s.player.pos;
    const near = id => s.built[id] && Math.hypot(p[0] - sim.pads.get(id).box[0], p[2] - sim.pads.get(id).box[1]) < 2.2;
    if (near('office1')) return 'office';
    if (near('hr1')) return 'hr';
    return null;
  }

  updateMenu() {
    let kind = this.zoneMenu();
    if (!kind) this.closed = null;
    if (kind && this.closed === kind) kind = null;
    const o = this.sim.upgradeOffer(), money = this.sim.s.money;
    const key = kind && `${kind}:${JSON.stringify(o)}:${Math.floor(money)}`;
    if (key === this.menuKey) return;
    this.menuKey = key;
    this.office.show('', kind === 'office');
    this.hr.show('', kind === 'hr');
    if (kind === 'office') {
      for (const [f, kind_] of this.officeRows) {
        const r = o.player[kind_.split('.')[1]];
        const max = r.cost == null || r.next == null;
        const base = `Frame/${f}`;
        this.office.set(`${base}/Level/Level`, `Lv.${r.level + 1}`);
        this.office.show(`${base}/PurchaseButton`, !max && r.cost <= money);
        this.office.show(`${base}/PurchaseButtonDisable`, !max && r.cost > money);
        this.office.show(`${base}/Max`, max);
        this.office.set(`${base}/PurchaseButton/PriceText`, fmt(r.cost ?? 0));
        this.office.set(`${base}/PurchaseButtonDisable/PriceText`, fmt(r.cost ?? 0));
      }
      this.office.layout(this.layer.cw, this.layer.ch);
    } else if (kind === 'hr') {
      for (const [slot, kind_] of this.hrRows) {
        const what = kind_.split('.')[1];
        const r = o.worker[what];
        const level = what === 'employ' ? r.level : r.level;
        const max = r.cost == null || (what === 'employ' ? r.level > r.max : r.next == null);
        const base = `Bg/${slot}`;
        for (const [, { el, n }] of this.hr.nodes) {
          const parent = el.parentElement;
          if (!parent || !this.hr.q(base) || !this.hr.q(base).contains(el)) continue;
          if (/^Button/.test(n.n)) el.hidden = !(!max && r.cost <= money);
          if (/^DisableButton/.test(n.n)) el.hidden = !(!max && r.cost > money);
          if (n.n === 'MaxButton') el.hidden = !max;
          if (n.n === 'PriceText' && /Button\d$/.test(parent.dataset.n)) this.hr.text(el, n, fmt(r.cost ?? 0));
        }
        const pts = this.hr.q(`${base}/LevelPoint`);
        if (pts) [...pts.children].forEach((pt, i) => { pt.style.backgroundColor = POINT[i < level ? 1 : 0]; });
      }
      this.hr.layout(this.layer.cw, this.layer.ch);
    }
  }

  popup(title, amount, onClose) {
    const p = this.offline;
    p.set('Bg/Reward/RewardText', fmt(amount));
    p.show('', true);
    p.layout(this.layer.cw, this.layer.ch);
    this.onClaim = onClose;
  }
}
