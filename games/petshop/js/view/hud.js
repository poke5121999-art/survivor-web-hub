// The original uGUI Canvas (art/ui/ui.json, tools/export_ui.py) driven by the sim: TopBar (day/time, energy, cash,
// store level), PlayerControls (crosshair, Interact, box Open/Close/Throw, cart button, floating joystick, touch
// look), DeliveryUI timer + boost, ObjectiveBar, EndDay, the laptop Store (Products / Animals / Furniture + Cart,
// Manage -> License / Expansion), PricePanel, checkout Cash/Card panels, DayEndPanel, LevelUpPanel, AlertBar.
// Drop 2: Service tab (Discard Boxes, Cashier, Storage), Bank free pack, HIRE CASHIER, Low Cash / Low Energy, Name your
// Store, Settings (language EN/VI, sensitivity, SFX, music), LevelRewardPanel, service-bought tips, MoveObjButtons,
// task objectives with the progress bar. Texts are the original I2 terms (data/text.json).
// Ads and in-app purchases of the original are not part of the web build: their buttons are hidden, and the
// rewarded-ad grants (level-up reward, tax free, machines, free packs) are free claims [PLACEHOLDER policy, see README].
import { UiLayer } from './ui.js';

const money = c => `$${(c / 100).toFixed(2)}`;
const dollars = d => `$${d}`;
// Alerts are I2 terms (data/text.json, en / vi). Keys the original passes that are not in its term table (it would show
// nothing) and states the original never alerts get an English line [PLACEHOLDER text].
const FALLBACK = {
  closed: 'Open the box first', notProduct: 'Not a product box', license: 'Required license missing', claimed: 'Come back tomorrow',
  service: 'Buy the Cashier Service first', StorageBoxEmpty: 'The delivery box is empty!', StorageCabinetFull: 'The cabinet is full!',
  wrongPay: 'Wrong amount', storageLocked: 'Storage', cashierBusy: 'The cashier is at the counter',
};
const USE = { 1: 'Rack', 2: 'Fridge', 3: 'AnimalCage', 4: 'RaptileCage', 5: 'Aquarium', 6: 'BirdCage' };
const STORAGE_NAME = { 1: 'Rack', 2: 'Fridge', 3: 'Animal Cage', 4: 'Reptile Cage', 5: 'Aquarium', 6: 'Bird Cage' };
const readLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

export class Hud {
  constructor(host, ui, base, iconBase, ctx) {
    this.ctx = ctx;               // { sim, G, L, sound, onExitCheckout, onEnterCheckout, interact(), ... }
    // A Screen Space canvas's own RectTransform is driven at runtime (serialized size 0, scale 0): it fills the screen.
    ui.roots.canvas.rt = { a0: [0, 0], a1: [1, 1], pos: [0, 0], size: [0, 0], pv: [0.5, 0.5], sc: [1, 1], rot: 0 };
    // Layout groups (VerticalLayoutGroup / ContentSizeFitter) place some children at runtime; their serialized rects are
    // zero. Those few nodes get the rect the layout would give them [measured from the parent, GUESS for padding].
    const node = path => path.split('/').reduce((n, seg) => n && (n.kids || []).find(k => k.n === seg), ui.roots.canvas);
    const fill = (path, txt) => { const n = node(path); if (!n) return; n.rt = { a0: [0, 0], a1: [1, 1], pos: [0, 0], size: [-10, -10], pv: [0.5, 0.5], sc: [1, 1], rot: 0 }; if (n.txt && txt) Object.assign(n.txt, txt); };
    fill('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/Description', { auto: true, max: 30, min: 16, ha: 1, wrap: true });
    // Bank: only the Free Pack stays (IAP packs hidden); it moves to the first slot of the horizontal list.
    const fp = node('Store/Store/Bank/Panels/Scroll View/Viewport/Content/Free Pack');
    if (fp) fp.rt.pos[0] = 200;
    // License / Expansion grids (GridLayoutGroup): the IAP "UnlockAll" cell is removed, the rest reflow into the grid
    // of the first row's pitch (the serialized positions of the later cells are stale editor values).
    for (const t of ['License', 'Expansion']) {
      const c = node(`Store/Store/License/Panels/${t}/Viewport/Content`);
      if (!c) continue;
      const slots = c.kids.map(k => k.rt.pos.slice());
      const cols = slots.filter(p => Math.abs(p[1] - slots[0][1]) < 1).length;
      const dx = slots[1][0] - slots[0][0], dy = slots[cols][1] - slots[0][1];
      const vis = c.kids.filter(k => k.n !== 'UnlockAll');
      c.kids.find(k => k.n === 'UnlockAll').on = false;
      vis.forEach((k, i) => { k.rt.pos = [slots[0][0] + (i % cols) * dx, slots[0][1] + Math.floor(i / cols) * dy]; });
      c.rt.size[1] = Math.ceil(vis.length / cols) * -dy + 40;
    }
    // Settings content: VerticalLayoutGroup (sections stacked from the top, centred; spacing 30 [GUESS]); Haptics dropped
    const sc = node('Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content');
    if (sc) {
      let y = -30;
      for (const k of sc.kids) {
        if (k.n === 'Haptics') { k.on = false; continue; }
        k.rt = Object.assign({}, k.rt, { a0: [0.5, 1], a1: [0.5, 1], pv: [0.5, 1], pos: [0, y] });
        y -= k.rt.size[1] + 30;
      }
      sc.rt.size[1] = -y;
    }
    // language: saved choice, else the browser's (vi -> Vietnamese, anything else -> English)
    this.text = ctx.text || {};
    this.settings = Object.assign({ lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', sens: 1, sfx: 1, music: 1 }, readLS('ps-settings', {}));
    this.T = k => { const e = this.text[k]; return e ? (e[this.settings.lang] || e.en) : null; };
    this.layer = new UiLayer(host, ui, base);
    this.p = this.layer.panel('canvas');
    this.base = base;
    this.iconBase = iconBase;
    this.cart = [];               // [{kind, type, boxes}]
    this.tab = 'Products';
    this.modal = null;
    const P = this.p;
    // hidden: ads / IAP / settings / language / rate-us / tea break / no-internet
    for (const path of ['HudUI/LeftSide', 'InterShortBreak', 'TeaBreak',
      'No InternetPanel', 'start button', 'Tutorial', 'Finger', 'Tutorial Fade', 'BlackPanel', 'HudUI/CheckOutCounter/Force']) P.show(path, false);
    P.show('HudUI/Middle/BoxContentUI', false);
    P.show('HudUI/Bottom/BoxItemCounts', false);
    P.show('HudUI/DeliveryUI/AlertTopBar', false);
    P.show('HudUI/DeliveryUI/blackbg', false);
    P.show('AlertBar', false);
    P.show('HudUI/PlayerControls/PickFillBar', false);
    P.show('TopBar/Boost/plus', false);
    P.show('TopBar/Cash/plus', false);
    const BANK = 'Store/Store/Bank/Panels/Scroll View/Viewport/Content';
    for (const x of ['Value Pack', 'Pack_1', 'Special Pack', 'Cahs_IAPPack', 'Energy_IAPPack']) P.show(`${BANK}/${x}`, false);
    for (const x of ['LowCashPanel', 'LowEnergyPanel']) P.show(`Panels/${x}/Panel/Content/CashBundle`, false);
    const SET = 'Panels/SettingUIPanel/Panel';
    for (const x of ['BugReport', 'Discord', 'Restore Purchase', 'Privacy Policy', 'RateUs']) P.show(`${SET}/Middle/Right/Buttons/${x}`, false);
    P.show(`${SET}/Middle/Left/Scroll View/Viewport/Content/Haptics`, false);   // no haptics in a browser
    P.show('Store/Store/Service/Panels/Scroll View/Viewport/Content/CashCounter', false);   // Extra Counter: off in the original
    this.bind();
    this.bind2();
    this.applyLang();
    this.alertT = 0;
  }

  applyLang() {
    this.p.translate(this.T);
    const lt = this.q('Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content/Language/LanguageButton/languageIcon');
    if (lt) lt.style.backgroundImage = `url("${this.base}/${this.settings.lang === 'vi' ? 'vietnam.webp' : 'usa.webp'}")`;
    const ln = this.q('Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content/Language/LanguageButton/languageText');
    if (ln) {
      ln.style.backgroundImage = this.settings.lang === 'vi' ? 'none' : `url("${this.base}/ENGLISH.webp")`;
      if (!ln._t) { ln._t = document.createElement('b'); ln._t.className = 'lang'; ln.appendChild(ln._t); }
      ln._t.textContent = this.settings.lang === 'vi' ? 'TIẾNG VIỆT' : '';
    }
  }

  q(path) { return this.p.q(path); }
  on(path, fn) { const el = this.q(path); if (el) { el.classList.add('b'); el.addEventListener('pointerdown', e => { e.stopPropagation(); }); el.addEventListener('click', e => { e.stopPropagation(); fn(e); }); } return el; }

  bind() {
    const c = this.ctx;
    // Interact: press / release (tap = interact, hold on a furniture = move it); HoldButtonInvoker also repeats the
    // shelf placement while pressed (main.js reads game.holdInteract)
    const ib = this.q('HudUI/PlayerControls/Interact');
    if (ib) {
      ib.classList.add('b');
      ib.addEventListener('pointerdown', e => { e.stopPropagation(); window.__game.holdInteract = true; c.press(); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ib.addEventListener(ev, e => { e.stopPropagation(); if (window.__game.holdInteract) { window.__game.holdInteract = false; c.release(); } });
    }
    this.on('HudUI/PlayerControls/BoxButtons/Open', () => c.openBox());
    this.on('HudUI/PlayerControls/BoxButtons/Closed', () => c.sim.setOpen(false));
    this.on('HudUI/PlayerControls/BoxButtons/Throw', () => c.throwBox());
    this.on('HudUI/PlayerControls/CartButton', () => this.openStore());
    this.on('HudUI/CheckOutCounter/ExitCheckOut', () => c.exitCheckout());
    this.on('HudUI/RightSide/EndDay', () => this.openDayEnd());
    this.on('HudUI/DeliveryUI/TimerSideBar/Button', () => { if (!c.sim.boost()) this.alert('Alert_LowEnergy'); });
    // laptop store
    this.on('Store/Store/Cross', () => this.closeStore());
    this.on('Store/Store/LeftButtons/Store', () => this.storeSection('Products'));
    this.on('Store/Store/LeftButtons/Manage', () => this.storeSection('License'));
    for (const t of ['Products', 'Animals', 'Furniture']) this.on(`Store/Store/Products/TopButtons/${t}`, () => this.storeTab(t));
    this.on('Store/Store/License/TopButtons/License', () => this.manageTab('License'));
    this.on('Store/Store/License/TopButtons/Expansion', () => this.manageTab('Expansion'));
    this.on('Store/Store/Products/Panels/Cart/Buy', () => this.buyCart());
    this.on('Store/Store/Products/Panels/Cart/Clear', () => { this.cart = []; this.renderCart(); });
    // price panel
    this.on('Panels/PricePanel/Panel/Confirm Button', () => this.confirmPrice());
    this.on('Panels/PricePanel/Panel/Container/Minus', () => this.nudgePrice(-1));
    this.on('Panels/PricePanel/Panel/Container/Plus', () => this.nudgePrice(1));
    this.on('Panels/PricePanel/Bg', () => this.closeModal());
    // cash / card
    const notes = { '1$': 100, '5$': 500, '10$': 1000, '20$': 2000, '50$': 5000 }, coins = { '1C': 1, '5C': 5, '10C': 10, '20C': 25, '50C': 50 };
    for (const [k, v] of Object.entries(notes)) this.on(`HudUI/CheckOutCounter/CashPayment/Panels/CashButtons/${k}`, () => { c.sim.giveChange(v); c.sound && c.sound.sfx('11_CurrencyNoteTap'); });
    for (const [k, v] of Object.entries(coins)) this.on(`HudUI/CheckOutCounter/CashPayment/Panels/CoinsButtons/${k}`, () => { c.sim.giveChange(v); c.sound && c.sound.sfx('12_CurrencyCoinTap'); });
    this.on('HudUI/CheckOutCounter/CashPayment/Panels/LowerButtons/Clear', () => c.sim.clearChange());
    this.on('HudUI/CheckOutCounter/CashPayment/Panels/LowerButtons/Back', () => this.undoChange());
    this.on('HudUI/CheckOutCounter/CashPayment/Panels/LowerButtons/OK', () => this.confirmPay());
    for (const k of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', 'Back']) {
      this.on(`HudUI/CheckOutCounter/CardPayment/Panel/Buttons/Contanier/${k}`, () => { c.sim.cardInput(k === 'Back' ? 'back' : k); c.sound && c.sound.sfx('9_POS_ButtonTap'); });
    }
    this.on('HudUI/CheckOutCounter/CardPayment/Panel/Buttons/Lower/Clear', () => c.sim.clearChange());
    this.on('HudUI/CheckOutCounter/CardPayment/Panel/Buttons/Lower/OK', () => this.confirmPay());
    // day end / level up
    this.on('Panels/DayEndPanel/Panel/LowerButton/Next Day', () => this.nextDay(false));
    this.on('Panels/DayEndPanel/Panel/LowerButton/TaxFree', () => this.nextDay(true));
    this.on('Panels/LevelUpPanel/SubPanel/_panel/ClaimButton', () => this.claimLevel(true));
    this.on('Panels/LevelUpPanel/SubPanel/_panel/No Thanks', () => this.claimLevel(false));
    this.joystick();
    this.posScreen();
  }

  // ---------- generic ----------
  alert(key, arg) {
    let t = key === 'wrongStorage' ? this.T(`Alert_AlertUse${USE[arg]}`) : null;
    if (t == null) t = this.T(key) ?? FALLBACK[key] ?? key;
    if (arg != null) t = t.replace('{x}', arg);
    this.p.show('AlertBar', true);
    this.p.set('AlertBar/Text (TMP)', t);
    this.alertT = 2.2;
  }

  openModal(name) {
    this.closeModal(); this.modal = name; this.p.show(name, true); this.ctx.uiOpen(true);
    this.layer.resize();   // TMP auto-size of the panel's texts needs them laid out while visible
  }
  closeModal() { if (!this.modal) return; this.p.show(this.modal, false); if (this.modal === 'Panels/PricePanel') this.p.show('Panels', true); this.modal = null; this.ctx.uiOpen(!!this.over); }

  // ---------- laptop store ----------
  openStore() { this.openModal('Store'); this.storeSection('Products'); this.renderCart(); }
  closeStore() { this.closeModal(); }

  storeSection(which) {
    const P = this.p;
    for (const x of ['Products', 'License', 'Service', 'Bank']) P.show(`Store/Store/${x}`, x === which);
    const btn = { Products: 'Store', License: 'Manage', Service: 'Service', Bank: 'Bank' };
    for (const b of ['Store', 'Manage', 'Service', 'Bank']) {
      const el = this.q(`Store/Store/LeftButtons/${b}`);
      if (el) el.style.filter = btn[which] === b ? '' : 'brightness(0.7)';
    }
    if (which === 'Products') this.storeTab(this.tab);
    else if (which === 'License') this.manageTab('License');
    else if (which === 'Service') this.renderService();
    else this.renderBank();
    this.layer.resize();
  }

  headerSel(path, on) {
    const el = this.q(path);
    if (!el) return;
    el.style.backgroundImage = `url("${this.base}/${on ? 'select_header.webp' : 'unselect_header.webp'}")`;
  }

  storeTab(t) {
    this.tab = t;
    for (const x of ['Products', 'Animals', 'Furniture']) {
      this.p.show(`Store/Store/Products/Panels/${x}`, x === t);
      this.headerSel(`Store/Store/Products/TopButtons/${x}`, x === t);
    }
    const { G } = this.ctx;
    let rows;
    // FurnitureUIPopulate: the 7 shelves, then the 2 storage racks
    if (t === 'Furniture') rows = G.furniture.map(f => ({ kind: 'f', type: f.type, d: f })).concat(G.storage.map(f => ({ kind: 's', type: f.type, d: f })));
    else {
      const animals = new Set([3, 4, 5, 6]);
      rows = G.products.filter(p => (t === 'Animals') === animals.has(p.storage)).map(p => ({ kind: 'p', type: p.type, d: p }));
    }
    this.fillGrid(`Store/Store/Products/Panels/${t}/Scroll View/Viewport`, rows, t === 'Furniture' ? 'furnitureCell' : 'productCell', (cell, r) => this.itemCell(cell, r));
  }

  // GridLayoutGroup of the original content: 2 columns of 500 x 338 cells (prefab rect), 20 px gaps [measured from rect].
  fillGrid(viewportPath, rows, cellName, fill) {
    const vp = this.q(viewportPath);
    if (!vp) return;
    const content = vp.firstElementChild;
    vp.style.overflowY = 'auto'; vp.style.overflowX = 'hidden'; vp.style.pointerEvents = 'auto';
    content.innerHTML = '';
    const W = 500, H = 338, GAP = 18;
    rows.forEach((r, i) => {
      const cell = this.layer.cell(cellName);
      cell.el.hidden = false;
      cell.el._cell = true;
      cell.layout(W, H);
      Object.assign(cell.el.style, { left: `${12 + (i % 2) * (W + GAP)}px`, top: `${12 + Math.floor(i / 2) * (H + GAP)}px` });
      content.appendChild(cell.el);
      fill(cell, r);
      cell.layout(W, H);   // TMP auto-size needs the element in the document to measure
      Object.assign(cell.el.style, { left: `${12 + (i % 2) * (W + GAP)}px`, top: `${12 + Math.floor(i / 2) * (H + GAP)}px` });
    });
    content.style.height = `${24 + Math.ceil(rows.length / 2) * (H + GAP)}px`;
  }

  icon(el, file) { if (el && file) { el.style.backgroundImage = `url("${this.iconBase}/${file}")`; el.style.backgroundSize = 'contain'; el.style.backgroundRepeat = 'no-repeat'; el.style.backgroundPosition = 'center'; } }

  // ItemUIScript: name, icon, items per box, storage icon + name, box price = unit cost x items, count stepper,
  // "Required License N" when the license is missing.
  itemCell(cell, r) {
    const { sim, G } = this.ctx;
    const d = r.d, isP = r.kind === 'p';
    const unit = isP ? d.cost : d.cost;
    const per = isP ? d.perBox : 1;
    let n = 1;
    cell.set('Name', d.name);
    this.icon(cell.q('image'), d.icon);
    cell.set('temsCount', String(per));
    const ui = this.layer.ui;
    const st = isP ? d.storage : null;
    if (st) { cell.set('StorageText', STORAGE_NAME[st]); const si = cell.q('StorageIcon'); if (si) si.style.backgroundImage = `url("${this.base}/${ui.storageIcons[st]}")`; }
    else { cell.show('StorageIcon', false); cell.show('StorageText', false); }
    cell.set('BottomObjects/PriceText', money(unit));
    const locked = isP && !sim.licensed(d.type);
    cell.show('LockText', locked);
    cell.show('NewHand', false);
    if (locked) cell.set('LockText', `Required License ${d.license}`);
    cell.show('BottomObjects', !locked);
    const upd = () => { cell.set('BottomObjects/bg/Text (TMP)', String(n)); cell.set('BottomObjects/Buy/Text (TMP)', money(unit * per * n)); };
    upd();
    const btn = (p, fn) => { const el = cell.q(p); if (el) { el.classList.add('b'); el.addEventListener('click', e => { e.stopPropagation(); fn(); }); } };
    btn('BottomObjects/plus', () => { n = Math.min(n + 1, 99); upd(); });
    btn('BottomObjects/minus', () => { n = Math.max(1, n - 1); upd(); });
    btn('BottomObjects/Buy', () => { this.addToCart(r.kind, r.type, n); n = 1; upd(); });
  }

  addToCart(kind, type, n) {
    const e = this.cart.find(x => x.kind === kind && x.type === type);
    if (e) e.boxes += n; else this.cart.push({ kind, type, boxes: n });
    this.ctx.sound && this.ctx.sound.sfx('42_CartBuy');
    this.renderCart();
  }

  renderCart() {
    const { sim } = this.ctx;
    const vp = this.q('Store/Store/Products/Panels/Cart/Scroll View/Viewport');
    if (!vp) return;
    const content = vp.firstElementChild;
    vp.style.overflowY = 'auto'; vp.style.pointerEvents = 'auto';
    content.innerHTML = '';
    let total = 0;
    this.cart.forEach((l, i) => {
      const cell = this.layer.cell('cartCell');
      cell.el.hidden = false;
      cell.el._cell = true;
      const W = 410, H = 66;
      cell.layout(W, H);
      Object.assign(cell.el.style, { left: '8px', top: `${6 + i * (H + 6)}px` });
      content.appendChild(cell.el);
      cell.layout(W, H);
      Object.assign(cell.el.style, { left: '8px', top: `${6 + i * (H + 6)}px` });
      const info = sim.lineInfo(l);
      const cents = sim.unitCost(l) * l.boxes;
      total += cents;
      cell.set('Name', info.name);
      cell.set('Price', money(cents));
      cell.set('Bg/Text (TMP)', String(l.boxes));
      const btn = (p, fn) => { const el = cell.q(p); if (el) { el.classList.add('b'); el.addEventListener('click', e => { e.stopPropagation(); fn(); }); } };
      btn('Plus', () => { l.boxes++; this.renderCart(); });
      btn('Mins', () => { l.boxes--; if (l.boxes <= 0) this.cart.splice(this.cart.indexOf(l), 1); this.renderCart(); });
    });
    content.style.height = `${12 + this.cart.length * 72}px`;
    this.p.set('Store/Store/Products/Panels/Cart/totalBg/Total', money(total));
  }

  buyCart() {
    const r = this.ctx.sim.buy(this.cart.map(l => ({ ...l })));
    if (!r.ok) { this.alert(r.why); return; }
    this.cart = [];
    this.renderCart();
    this.alert('Alert_CartBought');
    this.closeStore();
  }

  manageTab(t) {
    const { sim, G } = this.ctx;
    for (const x of ['License', 'Expansion']) {
      this.p.show(`Store/Store/License/Panels/${x}`, x === t);
      this.headerSel(`Store/Store/License/TopButtons/${x}`, x === t);
    }
    const base = `Store/Store/License/Panels/${t}/Viewport/Content`;
    const content = this.q(base);
    if (!content) return;
    const vp = content.parentElement;
    vp.style.overflowY = 'auto'; vp.style.pointerEvents = 'auto';
    this.p.show(`${base}/UnlockAll`, false);   // IAP "unlock all"
    const rows = t === 'License' ? G.licenses : G.expansions;
    for (const r of rows) {
      const name = `License_${r.type}`;   // the Expansion cells are License prefab copies, named License_1..6
      const path = `${base}/${name}`;
      if (!this.q(path)) continue;
      const owned = (t === 'License' ? sim.s.licenses : sim.s.expansions).includes(r.type);
      this.p.set(`${path}/Price`, dollars(r.price));
      const buy = this.q(`${path}/Buy`);
      if (!buy) continue;
      buy.style.backgroundImage = `url("${this.base}/${owned ? 'owned.webp' : 'buy_1155.webp'}")`;
      this.p.set(`${path}/Buy/Text (TMP)`, owned ? this.T('Owned_Word') : sim.s.level < r.level ? `${this.T('UnlockAtLevel')} ${r.level}` : this.T('Buy_Word'));
      if (!buy._bound) {
        buy._bound = true;
        buy.classList.add('b');
        buy.addEventListener('click', e => {
          e.stopPropagation();
          const res = t === 'License' ? sim.buyLicense(r.type) : sim.buyExpansion(r.type);
          if (!res.ok) { if (res.why) this.alert(res.why); return; }
          this.alert(t === 'License' ? 'Alert_LicenseBought' : 'Alert_ExpansionBought');
          this.manageTab(t);
        });
      }
    }
  }

  // ---------- price panel (PricePanelHelper) ----------
  openPrice(type) {
    const { sim } = this.ctx;
    const p = sim.prod.get(type);
    this.priceType = type;
    this.priceVal = sim.price(type);
    this.openModal('Panels/PricePanel');
    this.p.show('Panels', true);
    this.p.set('Panels/PricePanel/Panel/Top/NameText', p.name);
    this.p.set('Panels/PricePanel/Panel/Top/CostText', `COST: ${money(p.cost)}`);
    this.p.set('Panels/PricePanel/Panel/MarketPriceText', `Market Price: ${money(p.market)}`);
    this.icon(this.q('Panels/PricePanel/Panel/Top/ImageContainer/ItemIcon'), p.icon);
    this.p.show('Panels/PricePanel/Panel/Container/Slider/hand', false);
    const slider = this.q('Panels/PricePanel/Panel/Container/Slider');
    if (slider && !slider._bound) {
      slider._bound = true;
      slider.classList.add('b');
      const set = e => {
        const r = slider.getBoundingClientRect();
        const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const pp = sim.prod.get(this.priceType);
        this.priceVal = Math.round(pp.min + f * (pp.max - pp.min));
        this.renderPrice();
      };
      slider.addEventListener('pointerdown', e => { e.stopPropagation(); slider.setPointerCapture(e.pointerId); set(e); slider._drag = true; });
      slider.addEventListener('pointermove', e => { if (slider._drag) set(e); });
      slider.addEventListener('pointerup', () => { slider._drag = false; });
    }
    this.renderPrice();
  }

  nudgePrice(d) { const p = this.ctx.sim.prod.get(this.priceType); this.priceVal = Math.max(p.min, Math.min(p.max, this.priceVal + d * this.ctx.G.price.step)); this.renderPrice(); }

  renderPrice() {
    const { sim, G } = this.ctx;
    const p = sim.prod.get(this.priceType);
    const v = this.priceVal;
    const charge = Math.max(0, v <= p.market ? 0 : Math.min(G.price.maxEnergy, Math.max(1, Math.ceil((v - p.market) / Math.max(1, p.max - p.market) * G.price.maxEnergy))));
    this.priceCharge = charge;
    this.p.set('Panels/PricePanel/Panel/PriceText', `Price: ${money(v)}`);
    this.p.set('Panels/PricePanel/Panel/ProfitText', `Profit: ${money(v - p.cost)}`);
    this.p.set('Panels/PricePanel/Panel/Confirm Button/Energy ', String(charge));
    const f = (v - p.min) / Math.max(1, p.max - p.min);
    const fill = this.q('Panels/PricePanel/Panel/Container/Slider/Fill Area/Fill');
    if (fill) fill.style.width = `${(f * 100).toFixed(1)}%`;
    const handle = this.q('Panels/PricePanel/Panel/Container/Slider/Handle Slide Area/Handle');
    if (handle) handle.style.left = `calc(${(f * 100).toFixed(1)}% - ${parseFloat(handle.style.width) / 2}px)`;
    const line = this.q('Panels/PricePanel/Panel/Container/Slider/vertical Line');
    if (line) line.style.left = `${((p.market - p.min) / Math.max(1, p.max - p.min) * 100).toFixed(1)}%`;
  }

  confirmPrice() {
    const r = this.ctx.sim.setPrice(this.priceType, this.priceVal);
    if (!r.ok) { this.alert('Alert_LowEnergy'); return; }
    this.ctx.sound && this.ctx.sound.sfx('34_SuccessSound');
    this.closeModal();
  }

  // ---------- checkout ----------
  // The counter's POS screen (TextMeshPro in 3D: total bill, received, change, giving) drawn as a DOM readout.
  posScreen() {
    const el = document.createElement('div');
    el.className = 'pos';
    el.hidden = true;
    this.layer.host.appendChild(el);
    this.pos = el;
  }

  undoChange() {
    const k = this.ctx.sim.checkout;
    if (k.phase === 'pay' && k.method === 1 && this.ctx.lastGive) { k.given = Math.max(0, k.given - this.ctx.lastGive.pop() || 0); }
  }

  confirmPay() {
    const r = this.ctx.sim.confirmPayment();
    if (r.ok) this.ctx.sound && this.ctx.sound.sfx('10_CheckoutSuccess');
    else { this.ctx.sound && this.ctx.sound.sfx('11.1_CheckoutFailed'); this.alert('wrongPay'); }
  }

  // ---------- day end ----------
  openDayEnd() {
    const r = this.ctx.sim.dayReport();
    this.openModal('Panels/DayEndPanel');
    this.p.show('Panels', true);
    const b = 'Panels/DayEndPanel/Panel';
    this.p.set(`${b}/top/Day Count`, `DAY ${String(r.day).padStart(2, '0')}`);
    this.p.set(`${b}/Middle/Satified Customers/Text (TMP)`, `SATISFIED CUSTOMERS : ${r.customers}`);
    this.p.set(`${b}/Middle/Income/IncomeValueText`, `$${r.income.toFixed(2)}`);
    this.p.set(`${b}/Middle/Supply/CostValueText`, `$${r.supply.toFixed(2)}`);
    this.p.set(`${b}/Middle/Tax/TaxValueText`, `$${r.tax.toFixed(2)}`);
    this.p.set(`${b}/Middle/TotalProfit/ProfitValueText`, `$${r.profit.toFixed(2)}`);
    this.p.set(`${b}/Middle/Balance/BalanceValueText`, `$${r.balance.toFixed(2)}`);
  }

  // OnClickNextDay; OnClickTaxFree is a rewarded ad that refunds the tax in the original -> a free claim here.
  nextDay(taxFree) {
    const { sim } = this.ctx;
    const r = sim.dayReport();
    sim.nextDay();
    if (taxFree) { sim.s.cash += Math.round(r.tax); }
    this.closeModal();
    this.ctx.saveNow();
  }

  taskTick() { this.tickT = 1.5; }

  levelUp(level) {
    this.pendingLevel = level;
    this.openModal('Panels/LevelUpPanel');
    this.p.show('Panels', true);
    this.p.set('Panels/LevelUpPanel/SubPanel/Star/Level Text', String(level).padStart(2, '0'));
  }

  // LevelCompleteUIHelper.Reward (rewarded ad in the original): $50 + 10 energy. No Thanks gives nothing.
  claimLevel(claim) {
    const { sim, G } = this.ctx;
    if (claim) { sim.s.cash += G.rewards.levelUpCash; sim.s.energy += G.rewards.levelUpEnergy; }
    this.closeModal();
    this.levelReward(this.pendingLevel);
  }

  // ---------- Drop 2 panels ----------
  bindOnce(path, fn) { const el = this.q(path); if (el && !el._bound) { el._bound = true; this.on(path, fn); } return el; }

  // a uGUI Slider (Fill Area/Fill + Handle Slide Area/Handle) driven by a 0..1 value
  slider(path, get, set) {
    const sl = this.q(path);
    if (!sl) return () => {};
    const draw = () => {
      const f = Math.max(0, Math.min(1, get()));
      const fill = this.q(`${path}/Fill Area/Fill`);
      if (fill) fill.style.width = `${(f * 100).toFixed(1)}%`;
      const h = this.q(`${path}/Handle Slide Area/Handle`);
      if (h) h.style.left = `calc(${(f * 100).toFixed(1)}% - ${parseFloat(h.style.width) / 2}px)`;
    };
    if (!sl._bound) {
      sl._bound = true; sl.classList.add('b'); sl.style.pointerEvents = 'auto';
      const at = e => { const r = sl.getBoundingClientRect(); set(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); draw(); };
      sl.addEventListener('pointerdown', e => { e.stopPropagation(); sl.setPointerCapture(e.pointerId); sl._drag = true; at(e); });
      sl.addEventListener('pointermove', e => { if (sl._drag) at(e); });
      sl.addEventListener('pointerup', () => { sl._drag = false; });
    }
    draw();
    return draw;
  }

  // a second panel over the current modal (Low Cash / Low Energy pop over the laptop store in the original)
  overlay(name, on) {
    this.p.show(name, on);
    if (on) { this.p.show('Panels', true); this.over = name; this.ctx.uiOpen(true); this.layer.resize(); }
    else { this.over = null; if (!this.modal) this.ctx.uiOpen(false); }
  }

  bind2() {
    const c = this.ctx, P = this.p;
    this.on('Store/Store/LeftButtons/Service', () => this.storeSection('Service'));
    this.on('Store/Store/LeftButtons/Bank', () => this.storeSection('Bank'));
    this.on('TopBar/Setting', () => this.openSettings());
    // low cash / energy: LowCashUIHelper.Reward +$10, LowEnergyUIHelper.Reward +10 (rewarded ads -> free once a day)
    for (const [panel, src, val] of [['LowCashPanel', 'lowCash', `+${c.G.rewards.lowCash}`], ['LowEnergyPanel', 'lowEnergy', `+${c.G.rewards.lowEnergy}`]]) {
      P.set(`Panels/${panel}/Panel/Content/${src === 'lowCash' ? 'Cash' : 'Energy'}/Value`, val);
      this.on(`Panels/${panel}/Cross`, () => this.overlay(`Panels/${panel}`, false));
      this.on(`Panels/${panel}/Panel/Content/${src === 'lowCash' ? 'Cash' : 'Energy'}/Free`, () => {
        const r = c.sim.claim(src);
        if (!r.ok) { this.alert(r.why); return; }
        c.sound && c.sound.sfx('34_SuccessSound');
        this.overlay(`Panels/${panel}`, false);
      });
    }
    // bank free pack
    const BANK = 'Store/Store/Bank/Panels/Scroll View/Viewport/Content/Free Pack';
    for (const [x, src] of [['FreeCash', 'bankCash'], ['FreeEnergy', 'bankEnergy']]) {
      this.on(`${BANK}/${x}/Buy`, () => { const r = c.sim.claim(src); if (!r.ok) this.alert(r.why); else { c.sound && c.sound.sfx('34_SuccessSound'); this.renderBank(); } });
    }
    // service tab
    const SV = 'Store/Store/Service/Panels/Scroll View/Viewport/Content';
    this.on(`${SV}/Discard Empty/Buy`, () => { const r = c.sim.discardEmptyBoxes(); if (r.ok) { c.sound && c.sound.sfx('15_TrashThrow'); this.alert('Alert_BoxesDiscard', r.n); } else this.alert(r.why); });
    for (const [x, kind] of [['Cahier License', 'cashier'], ['Storage License', 'storage']]) {
      this.on(`${SV}/${x}/BuyButton`, () => {
        const r = c.sim.buyService(kind);
        if (!r.ok) { if (r.why) this.alert(r.why); return; }
        c.sound && c.sound.sfx('34_SuccessSound');
        this.renderService();
        this.serviceBought(kind);
      });
      this.on(`${SV}/${x}/LockButton`, () => this.alert('Alert_LowLevel'));
    }
    for (const x of ['CashierServiceBoughtPanel', 'StorageServiceBoughtPanel']) this.on(`Panels/${x}/TapButton`, () => this.tipNext(x));
    // hire cashier
    this.on('Panels/CashierPanel/Panel/Cross', () => this.closeModal());
    this.on('Panels/CashierPanel/Panel/Right/SliderSetup/Minus Button', () => { this.salary = Math.max(this.hr.min, this.salary - 1); this.renderHire(); });
    this.on('Panels/CashierPanel/Panel/Right/SliderSetup/Plus Button', () => { this.salary = Math.min(this.hr.max, this.salary + 1); this.renderHire(); });
    this.on('Panels/CashierPanel/Panel/Right/HireButton', () => {
      const r = c.sim.hire(this.salary);
      if (!r.ok) { this.alert(r.why); return; }
      c.sound && c.sound.sfx('34_SuccessSound');
      this.closeModal();
    });
    // store name
    for (let i = 1; i <= 6; i++) this.on(`Panels/Name your Store/Screen/Colors/${i}`, () => { this.nameColor = i - 1; this.renderName(); });
    this.on('Panels/Name your Store/Screen/Confirm', () => { c.sim.setStoreName(this.nameInput.value, this.nameColor); c.saveNow(); this.closeModal(); });
    // settings
    this.on('Panels/SettingUIPanel/Panel/Header/Close', () => { writeLS('ps-settings', this.settings); this.closeModal(); });
    this.on('Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content/Language/LanguageButton', () => {
      this.settings.lang = this.settings.lang === 'vi' ? 'en' : 'vi';
      writeLS('ps-settings', this.settings);
      this.applyLang();
    });
    this.on('Panels/LevelRewardPanel/Panel/KeepPlaying', () => this.closeModal());
    // MoveObjButtons (PlayerObjectMover): rotate +-90, place, sell (storage racks), cancel
    const M = 'HudUI/PlayerControls/MoveObjButtons/Container';
    this.on(`${M}/RotateRight`, () => c.place('right'));
    this.on(`${M}/RotateLeft`, () => c.place('left'));
    this.on(`${M}/Place`, () => c.place('place'));
    this.on(`${M}/Sell`, () => c.place('sell'));
    this.on(`${M}/Cancel`, () => c.place('cancel'));
    if (c.sound) c.sound.setVolume && c.sound.setVolume(this.settings.sfx, this.settings.music);
    if (c.player) c.player.sensMul = this.settings.sens;
  }

  renderService() {
    const { sim, G } = this.ctx, s = sim.s;
    const SV = 'Store/Store/Service/Panels/Scroll View/Viewport/Content';
    const vp = this.q('Store/Store/Service/Panels/Scroll View/Viewport');
    if (vp) { vp.style.overflowX = 'auto'; vp.style.pointerEvents = 'auto'; }
    this.p.show(`${SV}/Discard Empty/Buy/UnlockText`, false);
    for (const [x, kind, level, energy] of [['Cahier License', 'cashier', G.cashier.level, G.cashier.serviceEnergy], ['Storage License', 'storage', G.storageService.level, G.storageService.energy]]) {
      const owned = s[`${kind}Service`], locked = s.level < level;
      this.p.show(`${SV}/${x}/LockButton`, locked && !owned);
      this.p.show(`${SV}/${x}/BuyButton`, !locked && !owned);
      this.p.show(`${SV}/${x}/AcquiredButton`, owned);
      this.p.set(`${SV}/${x}/LockButton/UnlockText`, `${this.T('UnlockAtLevel')} : ${level}`);
      this.p.set(`${SV}/${x}/BuyButton/energyValueText`, String(energy));
    }
  }

  renderBank() {
    const { sim } = this.ctx;
    const vp = this.q('Store/Store/Bank/Panels/Scroll View/Viewport');
    if (vp) { vp.style.overflowX = 'auto'; vp.style.pointerEvents = 'auto'; }
    const BANK = 'Store/Store/Bank/Panels/Scroll View/Viewport/Content/Free Pack';
    for (const [x, src] of [['FreeCash', 'bankCash'], ['FreeEnergy', 'bankEnergy']]) {
      const el = this.q(`${BANK}/${x}/Buy`);
      if (el) el.style.filter = sim.claimable(src) ? '' : 'grayscale(1) brightness(0.8)';
    }
  }

  lowCash() { if (this.over !== 'Panels/LowCashPanel') this.overlay('Panels/LowCashPanel', true); }
  lowEnergy() { if (this.over !== 'Panels/LowEnergyPanel') this.overlay('Panels/LowEnergyPanel', true); }

  // CashierServiceBoughtPanel / StorageServiceBoughtPanel: two tip pictures, tap for next, then closed
  serviceBought(kind) {
    const name = kind === 'cashier' ? 'CashierServiceBoughtPanel' : 'StorageServiceBoughtPanel';
    this.closeModal();
    this.tipPage = 1;
    this.openModal(`Panels/${name}`);
    this.p.show('Panels', true);
    this.p.show(`Panels/${name}/Panel/ImagesPanel/1`, true);
    this.p.show(`Panels/${name}/Panel/ImagesPanel/2`, false);
  }
  tipNext(name) {
    if (this.tipPage === 1) { this.tipPage = 2; this.p.show(`Panels/${name}/Panel/ImagesPanel/1`, false); this.p.show(`Panels/${name}/Panel/ImagesPanel/2`, true); }
    else this.closeModal();
  }

  // CashierUIHelper: salary slider 0.6x .. 1x hirePrice, starts at the middle (0.8x); HIRE shows the energy cost
  openHire() {
    const { sim, G } = this.ctx;
    this.hr = sim.hireRange();
    this.salary = this.hr.mid;
    this.openModal('Panels/CashierPanel');
    this.p.show('Panels', true);
    this.p.set('Panels/CashierPanel/Panel/Left/NameText', G.cashier.name);
    this.p.set('Panels/CashierPanel/Panel/Left/WorkHours', `${G.cashier.shift / 60}:00 Hours`);
    this.renderHire();
  }
  renderHire() {
    const { sim } = this.ctx, { min, max } = this.hr;
    this.p.set('Panels/CashierPanel/Panel/Right/CurrentSalary', `$${this.salary}`);
    this.p.set('Panels/CashierPanel/Panel/Right/HireButton/CountText', String(sim.hireEnergy(this.salary)));
    this.slider('Panels/CashierPanel/Panel/Right/SliderSetup/SliderHolder/Slider', () => (this.salary - min) / (max - min),
      f => { this.salary = Math.round(min + f * (max - min)); this.renderHire(); });
  }

  // StoreNameChangeHelper: name (max 15, a-z 0-9) + 6 colours; the panel backdrop shows the chosen colour
  openStoreName() {
    const { sim } = this.ctx;
    this.openModal('Panels/Name your Store');
    this.p.show('Panels', true);
    const host = this.q('Panels/Name your Store/Screen/NameTextBg/InputField (TMP)');
    if (!this.nameInput && host) {
      const inp = this.nameInput = document.createElement('input');
      inp.className = 'name-input'; inp.maxLength = 15; inp.autocomplete = 'off';
      inp.addEventListener('input', () => { const v = inp.value.replace(/[^A-Za-z0-9 ]/g, ''); if (v !== inp.value) inp.value = v; });
      inp.addEventListener('keydown', e => e.stopPropagation());
      host.appendChild(inp);
      this.p.show('Panels/Name your Store/Screen/NameTextBg/InputField (TMP)/Text Area', false);
    }
    this.nameInput.value = sim.s.storeName;
    this.nameColor = sim.s.color || 0;
    this.renderName();
    setTimeout(() => this.nameInput.focus(), 50);
  }
  renderName() {
    for (let i = 1; i <= 6; i++) this.p.show(`Panels/Name your Store/Screen/Colors/${i}/Select`, i - 1 === this.nameColor);
    const bg = this.q('Panels/Name your Store/Screen/NameTextBg');
    if (bg) bg.style.backgroundImage = `url("${this.base}/boardpanel_${this.nameColor}.webp")`;
  }

  openSettings() {
    const { sound, player } = this.ctx;
    this.openModal('Panels/SettingUIPanel');
    this.p.show('Panels', true);
    const C = 'Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content';
    const S = this.settings;
    // sensitivity 0.25x .. 2x of FirstPersonController.sensitivity [GUESS range]
    this.slider(`${C}/Controls/Senitivity/SfxContainer/Slider`, () => (S.sens - 0.25) / 1.75, f => { S.sens = 0.25 + f * 1.75; if (player) player.sensMul = S.sens; });
    this.slider(`${C}/Audio/Audio/SFX/SfxContainer/Slider`, () => S.sfx, f => { S.sfx = f; sound && sound.setVolume && sound.setVolume(S.sfx, S.music); });
    this.slider(`${C}/Audio/Audio/Music/SfxContainer/Slider`, () => S.music, f => { S.music = f; sound && sound.setVolume && sound.setVolume(S.sfx, S.music); });
    const vp = this.q(`Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport`);
    if (vp) { vp.style.overflowY = 'auto'; vp.style.pointerEvents = 'auto'; }
  }

  // LevelRewardUIHelper: after the level-up panel, the rewards listed for the new level (rewardDataList[level - 1])
  levelReward(level) {
    const list = (this.ctx.rewards || {})[level];
    if (!list || !list.length) return;
    this.openModal('Panels/LevelRewardPanel');
    this.p.show('Panels', true);
    this.p.set('Panels/LevelRewardPanel/Panel/LevelText', `${this.T('StoreLevel') || 'STORE LEVEL'} : ${String(level).padStart(2, '0')}`);
    const mid = this.q('Panels/LevelRewardPanel/Panel/Middle');
    if (!mid) return;
    for (const el of [...mid.children]) if (el._cell) el.remove();
    const W = 265, H = 261, GAP = 20;
    list.forEach((r, i) => {
      const cell = this.layer.cell('rewardCell');
      cell.el.hidden = false; cell.el._cell = true;
      mid.appendChild(cell.el);
      cell.layout(W, H);
      Object.assign(cell.el.style, { left: `${(i - (list.length - 1) / 2) * (W + GAP) - W / 2}px`, top: `${-H / 2}px` });
      cell.set('Text (TMP)', r.name);
      if (r.icon) { const ic = cell.q('IconImage'); if (ic) ic.style.backgroundImage = `url("${this.base}/${r.icon}")`; }
    });
  }

  // ---------- floating joystick + touch look ----------
  joystick() {
    const host = this.layer.host;
    const bg = this.q('HudUI/PlayerControls/Floating Joystick/Background');
    const knob = bg && bg.firstElementChild;
    let joyId = null, lookId = null, origin = null, last = null;
    if (bg) bg.hidden = true;
    host.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || this.modal || this.ctx.inCheckout()) return;
      if (e.clientX < host.clientWidth * 0.45 && joyId == null) {
        joyId = e.pointerId; origin = [e.clientX, e.clientY];
        if (bg) { bg.hidden = false; const r = bg.getBoundingClientRect(); bg.style.transform = `translate(${e.clientX - r.left - r.width / 2}px, ${e.clientY - r.top - r.height / 2}px)`; }
      } else if (lookId == null) { lookId = e.pointerId; last = [e.clientX, e.clientY]; }
    });
    host.addEventListener('pointermove', e => {
      if (e.pointerId === joyId) {
        const R = 60, dx = e.clientX - origin[0], dy = e.clientY - origin[1], d = Math.min(R, Math.hypot(dx, dy)) / Math.max(1, Math.hypot(dx, dy));
        this.ctx.player.joy.x = dx * d / R; this.ctx.player.joy.y = -dy * d / R;
        if (knob) knob.style.transform = `translate(${dx * d}px, ${dy * d}px)`;
      } else if (e.pointerId === lookId) {
        this.ctx.player.look((e.clientX - last[0]) * 2, (e.clientY - last[1]) * 2);
        last = [e.clientX, e.clientY];
      }
    });
    const up = e => {
      if (e.pointerId === joyId) { joyId = null; this.ctx.player.joy.x = this.ctx.player.joy.y = 0; if (bg) { bg.hidden = true; bg.style.transform = ''; } if (knob) knob.style.transform = ''; }
      if (e.pointerId === lookId) lookId = null;
    };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  }

  // ---------- per frame ----------
  update(dt, st) {
    const { sim, G } = this.ctx;
    const s = sim.s, P = this.p;
    // TopBar
    P.set('TopBar/Calender/DayText', `DAY ${s.day}`);
    const h = Math.floor(s.time), m = Math.floor((s.time - h) * 60);
    const h12 = ((h + 11) % 12) + 1;
    P.set('TopBar/Calender/Time', `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
    P.set('TopBar/Boost/text', String(s.energy));
    P.set('TopBar/Cash/Text', `$${s.cash}`);
    P.set('TopBar/StoreLevel/levelText', `Level ${s.level}`);
    const need = st.pointsToNext;
    const fill = this.q('TopBar/StoreLevel/lvlbg/Fill');
    if (fill) fill.style.width = `${Math.min(100, s.points / need * 100).toFixed(1)}%`;
    // controls
    const held = sim.heldBox();
    const inChk = this.ctx.inCheckout();
    const placing = s.placing;
    P.show('HudUI/PlayerControls', !inChk && !this.modal);
    // a furniture / storage box opens into placement (FurnitureDeliveryBox.OpenBox); while placing only MoveObjButtons
    P.show('HudUI/PlayerControls/BoxButtons/Open', !!held && !placing && (held.kind !== 'p' || !held.open));
    P.show('HudUI/PlayerControls/BoxButtons/Closed', !!held && !placing && held.kind === 'p' && held.open);
    P.show('HudUI/PlayerControls/BoxButtons/Throw', !!held && !placing);
    P.show('HudUI/PlayerControls/Interact', !!st.target && !placing);
    P.show('HudUI/PlayerControls/CartButton', !placing);
    P.show('HudUI/PlayerControls/MoveObjButtons', !!placing);
    if (placing) {
      P.show('HudUI/PlayerControls/MoveObjButtons/Container/Sell', placing.kind === 's');
      const pl = this.q('HudUI/PlayerControls/MoveObjButtons/Container/Place');
      if (pl) pl.style.filter = st.placeOk ? '' : 'grayscale(1) brightness(0.7)';
    }
    // PlayerObjectMover hold: PickFillBar (radial fill) grows over thresholdTime
    const pf = this.q('HudUI/PlayerControls/PickFillBar');
    if (pf) {
      const f = st.hold || 0;
      pf.hidden = !(f > 0);
      if (f > 0) { const d = (f * 360).toFixed(0); pf.style.webkitMaskImage = pf.style.maskImage = `conic-gradient(#000 ${d}deg, transparent ${d}deg)`; }
    }
    P.show('HudUI/Bottom/BoxItemCounts', !!held && held.kind === 'p');
    if (held && held.kind === 'p') P.set('HudUI/Bottom/BoxItemCounts/Text (TMP)', `ITEM COUNT : ${held.n}`);
    // box info when aiming at a box (BaseBoxContentUIHelper)
    const tb = st.target && st.target.kind === 'box' && sim.s.boxes.find(b => b.id === st.target.id);
    P.show('HudUI/Middle/BoxContentUI', !!tb);
    if (tb) {
      const info = sim.lineInfo(tb);
      P.set('HudUI/Middle/BoxContentUI/NameText', info.name);
      P.set('HudUI/Middle/BoxContentUI/CountText', `COUNT : ${tb.kind === 'p' ? tb.n : 1}`);
      this.icon(this.q('HudUI/Middle/BoxContentUI/Prodcut_Icon'), info.icon);
      const rk = this.q('HudUI/Middle/BoxContentUI/Rack_Icon');
      if (rk && tb.kind === 'p') rk.style.backgroundImage = `url("${this.base}/${this.layer.ui.storageIcons[info.storage]}")`;
    }
    // checkout
    P.show('HudUI/CheckOutCounter/ExitCheckOut', inChk);
    const k = sim.checkout;
    P.show('HudUI/CheckOutCounter/CashPayment', inChk && k.phase === 'pay' && k.method === 1);
    P.show('HudUI/CheckOutCounter/CardPayment', inChk && k.phase === 'pay' && k.method === 2);
    if (k.phase === 'pay' && k.method === 2) P.set('HudUI/CheckOutCounter/CardPayment/Panel/Top/billText', k.card ? `$${k.card}` : money(0));
    this.pos.hidden = !inChk;
    if (inChk) {
      const lines = [`TOTAL ${money(k.bill || 0)}`];
      if (k.phase === 'pay' && k.method === 1) lines.push(`RECEIVED ${money(k.received)}`, `CHANGE ${money(k.change)}`, `GIVING ${money(k.given)}`);
      if (k.phase === 'pay' && k.method === 2) lines.push(`CARD ${k.card ? '$' + k.card : '—'}`);
      if (k.phase === 'scan') lines.push(`SCAN ${k.scanned}/${k.items.length}`);
      if (k.phase === 'offer') lines.push(k.method === 2 || (sim.customers.find(c => c.id === k.cur) || {}).pay === 2 ? 'TAKE THE CARD' : 'TAKE THE CASH');
      if (k.phase === 'idle') lines.push(sim.checkout.queue.length ? 'NEXT CUSTOMER…' : 'NO CUSTOMER');
      const txt = lines.join('\n');
      if (this.pos.textContent !== txt) this.pos.textContent = txt;
    }
    // delivery timer
    const head = s.pending[0];
    P.show('HudUI/DeliveryUI/TimerSideBar', !!head);
    if (head) {
      const t = Math.ceil(head.left);
      const ta = this.q('HudUI/DeliveryUI/TimerSideBar/TimerArea');
      if (ta) { if (!ta._txt) { ta._txt = document.createElement('b'); ta._txt.className = 'timer'; ta.appendChild(ta._txt); } ta._txt.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  x${s.pending.length}`; }
    }
    // objective + end day
    P.show('HudUI/RightSide/EndDay', sim.canEndDay() && !this.modal);
    // ObjectiveBar: GameHudUIHelper swaps the icon (open sign / normal / sad / checkout / day end) and the description.
    const obj = st.objective || { text: '', icon: 'normalIcon' };
    P.show('HudUI/RightSide/ObjectiveBar', !!obj.text && !inChk);
    P.set('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/Description', obj.text);
    // ObjectiveUIHelper.UpdateObjectiveUI: "{0}/{1}" and the fill bar for counted tasks
    P.show('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/FillBarBg', !!obj.count);
    if (obj.count) {
      P.set('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/FillBarBg/ProgressText', `${obj.n}/${obj.count}`);
      const fb = this.q('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/FillBarBg/FillBar');
      if (fb) { fb.style.transformOrigin = 'left center'; fb.style.transform = `scaleX(${obj.n / obj.count})`; }
    }
    P.show('HudUI/RightSide/ObjectiveBar/TextArea/tick', (this.tickT || 0) > 0);
    if (this.tickT > 0) this.tickT -= dt;
    const ic = this.q('HudUI/RightSide/ObjectiveBar/TextArea/IconImage');
    const icon = this.layer.ui.hudIcons[obj.icon];
    if (ic && icon && ic._icon !== icon) { ic._icon = icon; ic.style.backgroundImage = `url("${this.base}/${icon}")`; }
    if (this.alertT > 0 && (this.alertT -= dt) <= 0) P.show('AlertBar', false);
  }
}
