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
// DeliveryCatalogItem.FormatTime / DeliveryUI: "{0:00}:{1:00}" of minutes and seconds
const fmtTime = sec => { const t = Math.max(0, Math.ceil(sec)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
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
// I2 LanguageSourceAsset column order (= the Language Screen's button order)
const LANGS = ['en', 'pt', 'id', 'ar', 'ru', 'es', 'th', 'it', 'fr', 'nl', 'zh', 'ko', 'vi', 'ja', 'tr', 'de', 'uk'];
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
    // License / Expansion grids: the IAP "UnlockAll" cell is removed and the cells after it move up one slot.
    // Expansion's Content has a GridLayoutGroup (4 columns, cell 355 x 435, spacing 15, padding left 25), so every cell
    // reflows. License's Content has no layout group: Licenses 1-5 sit in the 3-column rows of 411-wide cells and
    // Licenses 6-11 in their own 2-column rows of 571-wide cells (level1), so only the narrow cells take the free slot.
    for (const t of ['License', 'Expansion']) {
      const c = node(`Store/Store/License/Panels/${t}/Viewport/Content`);
      if (!c) continue;
      const slots = c.kids.map(k => k.rt.pos.slice());
      const cols = slots.filter(p => Math.abs(p[1] - slots[0][1]) < 1).length;
      const dx = slots[1][0] - slots[0][0], dy = slots[cols][1] - slots[0][1];
      const vis = c.kids.filter(k => k.n !== 'UnlockAll');
      c.kids.find(k => k.n === 'UnlockAll').on = false;
      const w0 = vis[0].rt.size[0];
      vis.filter(k => t === 'Expansion' || k.rt.size[0] === w0).forEach((k, i) => { k.rt.pos = [slots[0][0] + (i % cols) * dx, slots[0][1] + Math.floor(i / cols) * dy]; });
      c.rt.size[1] = Math.max(...vis.map(k => -k.rt.pos[1] + k.rt.size[1] / 2)) + 40;
    }
    // PricePanelHelper tweens its panel from panelHidePos (536, -1200) to panelShowPos (536, -57) (.ctor constants);
    // the serialized rect is the hidden one
    const pp = node('Panels/PricePanel/Panel');
    if (pp) pp.rt.pos = [536, -57];
    // delivery boost buttons (HorizontalLayoutGroup, serialized at zero width): Get It Now and Free side by side, gap 10
    // [GUESS: the spacing], in the side bar and in the catalogue cell prefab
    const row = n => {
      if (!n) return;
      const [w, h] = n.kids[0].rt.size, gap = 10;
      n.rt = Object.assign({}, n.rt, { size: [2 * w + gap, h] });
      n.kids.forEach((k, i) => { k.rt = Object.assign({}, k.rt, { a0: [0.5, 0.5], a1: [0.5, 0.5], pv: [0.5, 0.5], pos: [(i - 0.5) * (w + gap), 0] }); });
    };
    row(node('HudUI/DeliveryUI/TimerSideBar/TimerArea/Buttons'));
    row(['UIContainer', 'Right', 'Buttons'].reduce((n, k) => n && (n.kids || []).find(x => x.n === k), ui.roots.catalogCell));
    // Finger pointer: its root becomes a full-screen layer so the pointer can sit on any button (placeFinger)
    const fg = ui.roots.canvas.kids.find(k => k.n === 'Finger');
    if (fg) fg.rt = { a0: [0, 0], a1: [1, 1], pos: [0, 0], size: [0, 0], pv: [0.5, 0.5], sc: [1, 1], rot: 0 };
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
    const nav = (navigator.language || 'en').toLowerCase().slice(0, 2);
    this.settings = Object.assign({ lang: LANGS.includes(nav) ? nav : 'en', sens: 1, sfx: 1, music: 1 }, readLS('ps-settings', {}));
    if (!LANGS.includes(this.settings.lang)) this.settings.lang = 'en';
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
    for (const x of ['LowCashPanel', 'LowEnergyPanel']) {
      P.show(`Panels/${x}/Panel/Content/CashBundle`, false);
      // [ĐỀ XUẤT] with the IAP pack (CashBundle) gone, the free card moves from x 529.5 to the middle of Content (695 wide)
      const free = this.q(`Panels/${x}/Panel/Content/Cash`) || this.q(`Panels/${x}/Panel/Content/Energy`);
      if (free && free._n) free._n.rt = Object.assign({}, free._n.rt, { pos: [347.5, free._n.rt.pos[1]] });
    }
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
    // the Settings language button shows the chosen language's flag and name sprites (from its Language Screen button)
    const C = this.layer.ui.roots.canvas;
    const cont = ['Panels', 'Language Screen', 'Screen', 'Scroll View', 'Viewport', 'Content'].reduce((n, k) => n && n.kids.find(x => x.n === k), C);
    const b = cont && cont.kids[LANGS.indexOf(this.settings.lang)];
    const spr = name => { const k = b && b.kids.find(x => x.n === name); return k && k.img && k.img.s; };
    const base = 'Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content/Language/LanguageButton/';
    const lt = this.q(`${base}languageIcon`), ln = this.q(`${base}languageText`);
    if (lt && spr('Flag')) lt.style.backgroundImage = `url("${this.base}/${spr('Flag')}")`;
    if (ln && spr('Language')) ln.style.backgroundImage = `url("${this.base}/${spr('Language')}")`;
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
    // DeliveryUI: the side bar's transparent Button opens the Delivery Queue (openCataLogButton); UseBoost pays
    // reqBoostCount energy (InstantDelivery); SkipDeliveryAd is the rewarded-ad skip (free once a day here)
    this.on('HudUI/DeliveryUI/TimerSideBar/Button', () => this.openCatalog());
    this.on('HudUI/DeliveryUI/TimerSideBar/TimerArea/Buttons/UseBoost', () => this.useBoost());
    this.on('HudUI/DeliveryUI/TimerSideBar/TimerArea/Buttons/SkipDeliveryAd', () => this.skipAd());
    this.on('Panels/DeliveryCatalogueUIHelper/Panel/CrossButton', () => this.closeCatalog());
    this.on('Panels/DeliveryCatalogueUIHelper/Bg', () => this.closeCatalog());
    // laptop store
    // [ĐỀ XUẤT] the close X is Store's first child, so the Products / Service / Bank panels drawn after it covered it
    // completely (no way to close the laptop store by touch); it is lifted above them
    const cross = this.on('Store/Store/Cross', () => this.closeStore());
    if (cross) { cross.style.zIndex = '4'; if (cross._n) cross._n.rt = Object.assign({}, cross._n.rt, { pos: [830, 352] }); }   // on the panel's corner, off the cart's UNIT header
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
    // ExtraCash: "You gave extra change of x"
    if (arg != null) t = key === 'ExtraCash' ? t.replace(/x\s*$/, arg) : t.replace('{x}', arg);
    this.p.show('AlertBar', true);
    this.p.set('AlertBar/Text (TMP)', t);
    this.alertT = 2.2;
  }

  openModal(name) {
    this.closeModal(); this.modal = name; this.p.show(name, true); this.ctx.uiOpen(true);
    this.layer.resize();   // TMP auto-size of the panel's texts needs them laid out while visible
  }
  closeModal() {
    if (!this.modal) return;
    const m = this.modal;
    this.p.show(m, false);
    if (m === 'Panels/PricePanel') this.p.show('Panels', true);
    this.modal = null;
    this.ctx.uiOpen(!!this.over || !!this.tutModal);
    // tutorial: StoreNameChangeHelper.OnPanelCloseEventAction, PricePanelHelper.OnPricePanelClose
    if (m === 'Panels/Name your Store') this.ctx.sim.tutEvent('nameClosed');
    if (m === 'Panels/PricePanel') this.ctx.sim.tutEvent('priceClose');
  }

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
    // tutorial CloseMarketPlace (step 18): ItemUIScript.UpdateBoxCount keeps the quantity at 1
    btn('BottomObjects/plus', () => { n = sim.tut.type() === 18 ? 1 : Math.min(n + 1, 99); upd(); });
    btn('BottomObjects/minus', () => { n = Math.max(1, n - 1); upd(); });
    btn('BottomObjects/Buy', () => { this.addToCart(r.kind, r.type, n); n = 1; upd(); });
  }

  addToCart(kind, type, n) {
    const e = this.cart.find(x => x.kind === kind && x.type === type);
    if (this.ctx.sim.tut.type() === 18) n = 1;
    if (e) e.boxes = this.ctx.sim.tut.type() === 18 ? 1 : e.boxes + n; else this.cart.push({ kind, type, boxes: n });
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
      btn('Plus', () => { if (sim.tut.type() !== 18) l.boxes++; this.renderCart(); });
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
    // PricePanelHelper.ShowHand during the SetItemsPrice tutorial step
    this.p.show('Panels/PricePanel/Panel/Container/Slider/hand', this.ctx.sim.tut.type() === 11);
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
    // the customer's voice answers (main.js 'reaction'); the checkout chime plays 2 s later ('checkoutChime')
    if (!r.ok) this.alert('wrongPay');
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

  // ButtonMarkerHelper: the red dot on each button of the current task's path, hidden once that button is pressed
  // [GUESS: the hide-on-click]; all go when the task changes
  taskMarks(paths) {
    const key = paths.join('|');
    if (key !== this.markKey) {
      for (const p of this.markShown || []) this.p.show(p, false);
      this.markKey = key; this.markShown = paths; this.markDone = new Set();
      for (const p of paths) {
        const el = this.q(p), btn = el && el.parentElement;
        if (btn && !btn._markBound) { btn._markBound = true; btn.addEventListener('click', () => { if (this.markShown && this.markShown.includes(p)) { this.markDone.add(p); this.p.show(p, false); } }); }
      }
    }
    for (const p of paths) this.p.show(p, !this.markDone.has(p));
  }

  // DeliveryUI.ShowTopAlertBar: "Your Delivery Arrived" with the item icon slides down 0.5 s (OutSine), stays 1.5 s,
  // slides back up 500 px in 0.5 s (InSine); the arrival sound plays with it
  deliveryArrived(info) {
    this.p.show('HudUI/DeliveryUI/AlertTopBar', true);
    if (info) this.icon(this.q('HudUI/DeliveryUI/AlertTopBar/Icon'), info.icon);
    this.topBarT = 0;
  }
  slideTopBar(dt) {
    const el = this.q('HudUI/DeliveryUI/AlertTopBar');
    if (!el || this.topBarT == null) return;
    this.topBarT += dt;
    const t = this.topBarT;
    let y;
    if (t < 0.5) y = -500 * (1 - Math.sin(t / 0.5 * Math.PI / 2));
    else if (t < 2.0) y = 0;
    else if (t < 2.5) y = -500 * (1 - Math.cos((t - 2.0) / 0.5 * Math.PI / 2));
    else { this.p.show('HudUI/DeliveryUI/AlertTopBar', false); this.topBarT = null; el.style.translate = ''; return; }
    el.style.translate = `0 ${y.toFixed(1)}px`;
  }

  useBoost() { const r = this.ctx.sim.boost(); if (r) this.ctx.sound && this.ctx.sound.sfx('34_SuccessSound'); }
  skipAd() { const r = this.ctx.sim.skipDelivery(); if (!r.ok) { if (r.why) this.alert(r.why); return; } this.ctx.sound && this.ctx.sound.sfx('34_SuccessSound'); }

  // DeliveriesCatalogUIHelper ("Delivery Queue"): opens only after the tutorial and with at least one pending delivery;
  // one catalogCell per pending delivery in purchase order, the first is the active one (coloured icon and bar, Skip
  // Delivery + Get It Now buttons), the rest are queued (grey icon, full grey bar, "Previous orders needs to delivered
  // first!"); closes itself when the queue empties
  openCatalog() {
    const { sim } = this.ctx;
    if (!sim.s.tutorialDone || !sim.s.pending.length) return;
    this.openModal('Panels/DeliveryCatalogueUIHelper');
    this.p.show('Panels', true);
    this.catKey = null;
    this.renderCatalog();
  }
  closeCatalog() { if (this.modal === 'Panels/DeliveryCatalogueUIHelper') this.closeModal(); }

  renderCatalog() {
    const { sim } = this.ctx, s = sim.s;
    if (!s.pending.length) { this.closeCatalog(); return; }
    const vp = this.q('Panels/DeliveryCatalogueUIHelper/Panel/Scroll View/Viewport');
    if (!vp) return;
    const content = [...vp.children].find(e => e._n);
    vp.style.overflowY = 'auto'; vp.style.pointerEvents = 'auto';
    const key = s.pending.map(p => `${p.kind}${p.type}x${p.boxes}`).join(',');
    const W = 651, H = 186, GAP = 12;
    if (this.catKey !== key) {
      this.catKey = key;
      content.querySelectorAll('[data-cat]').forEach(e => e.remove());
      this.catCells = s.pending.map((p, i) => {
        const cell = this.layer.cell('catalogCell');
        cell.el.hidden = false; cell.el._cell = true; cell.el.dataset.cat = i;
        content.appendChild(cell.el);
        cell.layout(W, H);
        Object.assign(cell.el.style, { left: '50%', marginLeft: `${-W / 2}px`, top: `${10 + i * (H + GAP)}px` });
        cell.p = p;
        const btn = (path, fn) => { const el = cell.q(path); if (el) { el.classList.add('b'); el.addEventListener('click', e => { e.stopPropagation(); fn(); }); } };
        btn('UIContainer/Right/Buttons/UseBoost', () => this.useBoost());
        btn('UIContainer/Right/Buttons/SkipDeliveryAd', () => this.skipAd());
        cell.translate && cell.translate(this.T);
        // the active / queued parts first, then the layout: TMP auto-size measures only visible texts
        const active = i === 0;
        cell.show('UIContainer/Right/MiddleText', active);
        cell.show('UIContainer/Right/Buttons', active);
        cell.show('UIContainer/Right/Text (TMP)', !active);
        cell.layout(W, H);
        Object.assign(cell.el.style, { left: '50%', marginLeft: `${-W / 2}px`, top: `${10 + i * (H + GAP)}px` });
        return cell;
      });
      content.style.height = `${20 + s.pending.length * (H + GAP)}px`;
    }
    this.catCells.forEach((cell, i) => {
      const p = s.pending[i], active = i === 0, info = sim.lineInfo(p);
      this.icon(cell.q('UIContainer/Left/Icon'), active ? info.icon : (info.grey || info.icon));
      cell.set('UIContainer/Left/Text (TMP)', `X${p.boxes}`);
      cell.set('UIContainer/Right/FillImage/Text (TMP)', fmtTime(active ? p.left : p.wait));
      const fb = cell.q('UIContainer/Right/FillImage/FillBar');
      if (fb) { fb.style.transformOrigin = 'left center'; fb.style.transform = `scaleX(${active ? Math.max(0, p.left) / Math.max(1, p.wait) : 1})`; fb.style.filter = active ? '' : 'grayscale(1)'; }
      cell.show('UIContainer/Right/MiddleText', active);
      cell.show('UIContainer/Right/Buttons', active);
      cell.show('UIContainer/Right/Text (TMP)', !active);
      if (active) cell.set('UIContainer/Right/Buttons/UseBoost/Text (TMP)', String(sim.boostCost()));
    });
  }

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
      // UnityEngine.UI.Slider drives the anchors at run time: Fill (0, 0)-(value, 1), Handle (value, 0)-(value, 1); the
      // serialized rects have zero height, which left the settings sliders empty
      const fill = this.q(`${path}/Fill Area/Fill`);
      if (fill) Object.assign(fill.style, { left: '0', top: '0', height: '100%', width: `${(f * 100).toFixed(1)}%` });
      const h = this.q(`${path}/Handle Slide Area/Handle`);
      if (h) Object.assign(h.style, { top: '0', height: '100%', left: `calc(${(f * 100).toFixed(1)}% - ${parseFloat(h.style.width) / 2}px)` });
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
    // Settings -> language: the same Language Screen (LanguageUIHelper.OnClickShowScreen)
    this.on('Panels/SettingUIPanel/Panel/Middle/Left/Scroll View/Viewport/Content/Language/LanguageButton', () => this.showLanguage(null));
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

  // CashierServiceBoughtPanel / StorageServiceBoughtPanel (Buy*ServiceHelper.storageTipPanel): both tip pictures side by
  // side (ImagesPanel/1 and /2 at x +-256); successPanelButton -> CloseCashierSuccessPanel, so one tap closes it
  serviceBought(kind) {
    const name = kind === 'cashier' ? 'CashierServiceBoughtPanel' : 'StorageServiceBoughtPanel';
    this.closeModal();
    this.openModal(`Panels/${name}`);
    this.p.show('Panels', true);
    this.p.show(`Panels/${name}/Panel/ImagesPanel/1`, true);
    this.p.show(`Panels/${name}/Panel/ImagesPanel/2`, true);
  }
  tipNext() { this.closeModal(); }

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
      // Middle is 261 high with its own top-left as origin: the cells fill it (top 0); x is centred on its zero width
      Object.assign(cell.el.style, { left: `${(i - (list.length - 1) / 2) * (W + GAP) - W / 2}px`, top: '0px' });
      cell.set('Text (TMP)', r.name);
      if (r.icon) { const ic = cell.q('IconImage'); if (ic) ic.style.backgroundImage = `url("${this.base}/${r.icon}")`; }
    });
  }

  // ---------- tutorial screens (Tutorial component's UI) ----------
  // Language Screen (LanguageUIHelper): the 17 original language buttons (flag + name sprites), in the I2 column order;
  // the chosen one is marked [GUESS: the selected sprite is not exported, a glow stands in]. Confirm applies it.
  showLanguage(onDone) {
    const P = this.p, path = 'Panels/Language Screen';
    P.show('Panels', true); P.show(path, true);
    this.tutModal = path; this.ctx.uiOpen(true); this.layer.resize();
    const content = this.q(`${path}/Screen/Scroll View/Viewport/Content`);
    const vp = content && content.parentElement;
    if (vp) { vp.style.overflowY = 'auto'; vp.style.pointerEvents = 'auto'; }
    const btns = [...content.children].filter(e => e._n);
    const mark = () => btns.forEach((b, i) => { b.style.filter = LANGS[i] === this.settings.lang ? 'drop-shadow(0 0 6px #ffe14d) brightness(1.15)' : ''; });
    btns.forEach((b, i) => {
      if (b._lang) return;
      b._lang = LANGS[i];
      b.classList.add('b');
      b.addEventListener('click', e => { e.stopPropagation(); this.settings.lang = LANGS[i]; writeLS('ps-settings', this.settings); this.applyLang(); mark(); });
    });
    mark();
    this.onLang = onDone;
    this.bindOnce(`${path}/Screen/Confirm`, () => {
      P.show(path, false); this.tutModal = null; this.ctx.uiOpen(!!this.modal);
      const f = this.onLang; this.onLang = null; if (f) f();
    });
  }

  // a Tutorial UI screen (Welcome Screen, Change Name Tip, Follow Objective, MoveCamera, Move JoyStick); onTap for the
  // screens that wait for a tap / button, null for the guide overlays that wait for a movement
  tutScreen(name, on, onTap) {
    const path = `Tutorial/${name}`;
    this.p.show('Tutorial', true);
    this.p.show(path, on);
    if (!on) { if (this.tutModal === path) { this.tutModal = null; this.ctx.uiOpen(!!this.modal); } return; }
    this.layer.resize();
    if (!onTap) return;
    this.tutModal = path; this.ctx.uiOpen(true);
    this.tutTap = onTap;
    const btn = { 'Welcome Screen': 'Button', 'Change Name Tip': 'Screen/Confirm', 'Follow Objective': 'Screen/Confirm' }[name];
    if (name === 'Welcome Screen') {
      this.p.show(`${path}/Button`, true); this.p.show(`${path}/Panel/Screen/LoweText`, true);
      // [ĐỀ XUẤT] "Tap for next..." sits where the LowerBar (drawn later) covers its lower half; keep it readable above it
      const lt = this.q(`${path}/Panel/Screen/LoweText`); if (lt) lt.style.zIndex = '3';
      // upper / lower black bars: sizeDelta (0, 0) -> (0, 125) in 1.0 s
      for (const b of ['UpperBar', 'LowerBar']) {
        const el = this.q(`${path}/${b}`);
        if (el && el.animate) el.animate([{ height: '0px' }, { height: '125px' }], { duration: 1000, easing: 'ease-out' });
      }
    }
    this.bindOnce(`${path}/${btn}`, () => { const f = this.tutTap; this.tutTap = null; this.tutScreen(name, false); if (f) f(); });
  }

  // GenericFingerPointer: the hand that points at a UI button (path) during the tutorial; null hides it
  finger(path) {
    const f = this.q('Finger');
    if (!f) return;
    if (!path) { f.hidden = true; this.fingerAt = null; return; }
    this.fingerAt = path;
    f.hidden = false;
  }
  // HUD Navigation off-screen indicator (IndicatorPrefab not exported: the original's UpUIArrow sprite at the edge)
  navArrow(p) {
    if (!this.nav) {
      this.nav = document.createElement('div');
      this.nav.className = 'navarrow';
      this.nav.style.backgroundImage = `url("${this.base}/UpUIArrow.webp")`;
      document.body.appendChild(this.nav);
    }
    this.nav.hidden = !p;
    if (p) this.nav.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${(p.angle + Math.PI / 2).toFixed(3)}rad)`;
  }

  placeFinger() {
    if (!this.fingerAt) return;
    const at = this.fingerAt, isPt = at && typeof at === 'object' && 'x' in at && !(at instanceof Element);
    const t = isPt ? null : typeof at === 'string' ? this.q(at) : at, f = this.q('Finger/GenericFingerPointer');
    if ((!t && !isPt) || !f) return;
    const r = isPt ? { left: at.x, top: at.y, width: 1, height: 1 } : t.getBoundingClientRect(), k = this.layer.k, hr = this.layer.host.getBoundingClientRect();
    if (!r.width) { this.q('Finger').hidden = true; return; }
    this.q('Finger').hidden = false;
    const x = (r.left + r.width / 2 - hr.left) / k, y = (r.top + r.height / 2 - hr.top) / k;
    Object.assign(f.style, { left: `${x - 50}px`, top: `${y - 50}px`, transform: `rotate(35deg) translateY(${8 * Math.sin(performance.now() / 160)}px)` });
  }

  // ---------- floating joystick + touch look ----------
  // The listeners sit on #stage: #hud has pointer-events none and is a sibling of the canvas, so touches on the canvas
  // never reached it (no walking or looking on a phone at all). Only touches that start on the canvas steer: one on a
  // HUD button is that button's.
  joystick() {
    const host = this.layer.host.parentElement || this.layer.host;
    const onCanvas = e => e.target && e.target.tagName === 'CANVAS';
    const bg = this.q('HudUI/PlayerControls/Floating Joystick/Background');
    const knob = bg && bg.firstElementChild;
    let joyId = null, lookId = null, origin = null, last = null;
    if (bg) bg.hidden = true;
    host.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || this.modal || this.ctx.inCheckout() || !onCanvas(e)) return;
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
  // Unity Scrollbar driven by its ScrollRect: the Handle's anchors are [v * (1 - size), v * (1 - size) + size] along
  // the bar, size = viewport / content, v = normalized position (1 = top for a vertical bar); its 20-unit sizeDelta
  // stays. The serialized Handle rect is a stale editor value, so it is set from the scroll position every frame.
  syncScrollbars() {
    if (!this.modal && !this.over) return;
    if (!this._bars) {
      this._bars = [...this.layer.el.querySelectorAll('[data-n^="Scrollbar"]')].map(bar => {
        const vp = [...bar.parentElement.children].find(e => e.dataset.n === 'Viewport');
        const h = bar.querySelector('[data-n="Handle"]');
        const rt = bar._n && bar._n.rt;
        return vp && h ? { vp, h, bar, horiz: !!rt && rt.a0[1] === rt.a1[1] } : null;
      }).filter(Boolean);
    }
    for (const b of this._bars) {
      if (!b.bar.offsetParent) continue;
      const { vp, h } = b;
      const len = b.horiz ? vp.scrollWidth : vp.scrollHeight, view = b.horiz ? vp.clientWidth : vp.clientHeight;
      if (!len || !view) continue;
      const size = Math.min(1, Math.max(0.05, view / len));
      const pos = b.horiz ? vp.scrollLeft : vp.scrollTop, max = len - view;
      const along = max > 0 ? pos / max : 0;   // 0 = top / left
      const st = `${(along * (1 - size) * 100).toFixed(2)}%`, ln = `${(size * 100).toFixed(2)}%`;
      if (b.horiz) Object.assign(h.style, { left: `calc(${st} - 10px)`, width: `calc(${ln} + 20px)`, right: 'auto' });
      else Object.assign(h.style, { top: `calc(${st} - 10px)`, height: `calc(${ln} + 20px)`, bottom: 'auto' });
    }
  }

  update(dt, st) {
    const { sim, G } = this.ctx;
    const s = sim.s, P = this.p;
    this.syncScrollbars();
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
    const animal = !!held && sim.isAnimalBox(held);
    P.show('HudUI/PlayerControls/BoxButtons/Open', !!held && !placing && !animal && (held.kind !== 'p' || !held.open));
    P.show('HudUI/PlayerControls/BoxButtons/Closed', !!held && !placing && !animal && held.kind === 'p' && held.open);
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
    this.pos.hidden = !inChk || !!this.modal || !!this.over;   // the register screen sits in 3D, under any panel
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
    // delivery side bar (DeliveryUI): truck badge = queue length, icon + "x{boxes}", fill = remaining / full, mm:ss,
    // UseBoost shows reqBoostCount
    const head = s.pending[0];
    P.show('HudUI/DeliveryUI/TimerSideBar', !!head);
    if (head) {
      const B = 'HudUI/DeliveryUI/TimerSideBar/';
      const info = sim.lineInfo(head);
      P.set(`${B}Truck/CountBg/CountText`, String(s.pending.length));
      this.icon(this.q(`${B}TimerArea/Icon`), info.icon);
      P.set(`${B}TimerArea/Icon/Text (TMP)`, `x${head.boxes}`);
      P.set(`${B}TimerArea/FillImage/Text (TMP)`, fmtTime(head.left));
      const fb = this.q(`${B}TimerArea/FillImage/FillBar`);
      if (fb) { fb.style.transformOrigin = 'left center'; fb.style.transform = `scaleX(${Math.max(0, head.left) / Math.max(1, head.wait)})`; }
      P.set(`${B}TimerArea/Buttons/UseBoost/Text (TMP)`, String(sim.boostCost()));
      const ad = this.q(`${B}TimerArea/Buttons/SkipDeliveryAd`);
      if (ad) ad.style.filter = sim.s.claims.deliverySkip === s.day ? 'grayscale(1) brightness(0.8)' : '';
    }
    if (this.modal === 'Panels/DeliveryCatalogueUIHelper') this.renderCatalog();
    // objective + end day
    P.show('HudUI/RightSide/EndDay', sim.canEndDay() && !this.modal);
    // ObjectiveBar: GameHudUIHelper swaps the icon (open sign / normal / sad / checkout / day end) and the description.
    const obj = st.objective || { text: '', icon: 'normalIcon' };
    P.show('HudUI/RightSide/ObjectiveBar', !!obj.text && !inChk);
    P.set('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/Description', obj.text);
    // ObjectiveUIHelper.UpdateObjectiveUI: "{0}/{1}" and the fill bar for counted tasks
    P.show('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/FillBarBg', !!obj.count);
    // StatArea is a VerticalLayoutGroup: with the fill bar on top the description takes the space below it
    const de = this.q('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/Description');
    if (de && de._withBar !== !!obj.count) {
      de._withBar = !!obj.count;
      de._n.rt = obj.count ? { a0: [0, 0], a1: [1, 1], pos: [0, -20], size: [-10, -50], pv: [0.5, 0.5], sc: [1, 1], rot: 0 }
        : { a0: [0, 0], a1: [1, 1], pos: [0, 0], size: [-10, -10], pv: [0.5, 0.5], sc: [1, 1], rot: 0 };
      const sa = de.parentElement;
      this.p.layout(parseFloat(sa.style.width), parseFloat(sa.style.height), de);
    }
    if (obj.count) {
      P.set('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/FillBarBg/ProgressText', `${obj.n}/${obj.count}`);
      const fb = this.q('HudUI/RightSide/ObjectiveBar/TextArea/StatArea/FillBarBg/FillBar');
      if (fb) { fb.style.transformOrigin = 'left center'; fb.style.transform = `scaleX(${obj.n / obj.count})`; }
    }
    P.show('HudUI/RightSide/ObjectiveBar/TextArea/tick', (this.tickT || 0) > 0);
    if (this.tickT > 0) this.tickT -= dt;
    const ic = this.q('HudUI/RightSide/ObjectiveBar/TextArea/IconImage');
    const icon = obj.iconFile || this.layer.ui.hudIcons[obj.icon];
    if (ic && icon && ic._icon !== icon) { ic._icon = icon; ic.style.backgroundImage = `url("${this.base}/${icon}")`; }
    if (this.alertT > 0 && (this.alertT -= dt) <= 0) P.show('AlertBar', false);
    // tutorial: the HUD parts each step enables (Tutorial stepDataList OnStartEvent SetActive calls), the finger
    const tv = st.tutVis;
    if (tv) {
      P.show('HudUI', tv.hud); P.show('TopBar', tv.hud);
      if (!tv.cart) P.show('HudUI/PlayerControls/CartButton', false);
      if (!tv.interact) P.show('HudUI/PlayerControls/Interact', false);
      if (tv.exit === false) P.show('HudUI/CheckOutCounter/ExitCheckOut', false);   // CheckOutCounter.HideExitButton
    } else if (this.tutVisWas) { P.show('HudUI', true); P.show('TopBar', true); }
    this.tutVisWas = !!tv;
    // SettingUIHelper.ShowPanel calls topBarUIHelper.HidePanel, HidePanel's tween end calls ShowPanel again
    const setOpen = this.modal === 'Panels/SettingUIPanel';
    if (setOpen !== this.settingsWas) { if (!tv || tv.hud) P.show('TopBar', !setOpen); this.settingsWas = setOpen; }
    this.navArrow(tv && tv.nav);
    this.taskMarks(st.marks || []);
    this.slideTopBar(dt);
    if (st.finger !== undefined && st.finger !== this.fingerAt) this.finger(st.finger);
    this.placeFinger();
  }
}
