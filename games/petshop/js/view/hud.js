// The original uGUI Canvas (art/ui/ui.json, tools/export_ui.py) driven by the sim: TopBar (day/time, energy, cash,
// store level), PlayerControls (crosshair, Interact, box Open/Close/Throw, cart button, floating joystick, touch
// look), DeliveryUI timer + boost, ObjectiveBar, EndDay, the laptop Store (Products / Animals / Furniture + Cart,
// Manage -> License / Expansion), PricePanel, checkout Cash/Card panels, DayEndPanel, LevelUpPanel, AlertBar.
// Ads and in-app purchases of the original are not part of the web build: their buttons are hidden, and the
// rewarded-ad grants (level-up reward, tax free) are free one-time claims [PLACEHOLDER policy, see README].
import { UiLayer } from './ui.js';

const money = c => `$${(c / 100).toFixed(2)}`;
const dollars = d => `$${d}`;
// Alert keys of the original (I2 Localization terms). The term table is not decoded yet; these are English
// paraphrases of the key names [PLACEHOLDER text].
const ALERT = {
  Alert_CabinetFull: 'Shelf is full', Alert_BoxEmpty: 'Box is empty', Alert_ItemMissMatch: 'Different item on this shelf',
  Alert_LowCash: 'Not enough cash', Alert_LowEnergy: 'Not enough energy', Alert_LowLevel: 'Store level too low',
  Alert_CartEmpty: 'Cart is empty', Alert_CartBought: 'Order placed! Delivery is on the way', Alert_LicenseBought: 'License bought',
  Alert_ExpansionBought: 'Expansion bought', Alert_CloseStore: 'The day is over', Alert_OpenStore: 'Store is open',
  Alert_Trashbin: 'Empty the box first', wrongStorage: 'Use the {0}', closed: 'Open the box first', notProduct: 'Not a product box',
  license: 'Required license missing',
};
const STORAGE_NAME = { 1: 'Rack', 2: 'Fridge', 3: 'Animal Cage', 4: 'Reptile Cage', 5: 'Aquarium', 6: 'Bird Cage' };

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
    this.layer = new UiLayer(host, ui, base);
    this.p = this.layer.panel('canvas');
    this.base = base;
    this.iconBase = iconBase;
    this.cart = [];               // [{kind, type, boxes}]
    this.tab = 'Products';
    this.modal = null;
    const P = this.p;
    // hidden: ads / IAP / settings / language / rate-us / tea break / no-internet
    for (const path of ['HudUI/LeftSide', 'Store/Store/LeftButtons/Service', 'Store/Store/LeftButtons/Bank', 'InterShortBreak', 'TeaBreak',
      'No InternetPanel', 'start button', 'Tutorial', 'Finger', 'Tutorial Fade', 'BlackPanel', 'HudUI/CheckOutCounter/Force']) P.show(path, false);
    P.show('HudUI/Middle/BoxContentUI', false);
    P.show('HudUI/Bottom/BoxItemCounts', false);
    P.show('HudUI/DeliveryUI/AlertTopBar', false);
    P.show('HudUI/DeliveryUI/blackbg', false);
    P.show('AlertBar', false);
    P.show('HudUI/PlayerControls/PickFillBar', false);
    P.show('TopBar/Boost/plus', false);
    P.show('TopBar/Cash/plus', false);
    this.bind();
    this.alertT = 0;
  }

  q(path) { return this.p.q(path); }
  on(path, fn) { const el = this.q(path); if (el) { el.classList.add('b'); el.addEventListener('pointerdown', e => { e.stopPropagation(); }); el.addEventListener('click', e => { e.stopPropagation(); fn(e); }); } return el; }

  bind() {
    const c = this.ctx;
    const ib = this.on('HudUI/PlayerControls/Interact', () => c.interact());
    // HoldButtonInvoker: keeping the button pressed repeats the action (main.js reads game.holdInteract)
    if (ib) { ib.addEventListener('pointerdown', () => { window.__game.holdInteract = true; }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ib.addEventListener(ev, () => { window.__game.holdInteract = false; }); }
    this.on('HudUI/PlayerControls/BoxButtons/Open', () => c.sim.setOpen(true));
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
    let t = ALERT[key] || key;
    if (arg != null) t = t.replace('{0}', arg);
    this.p.show('AlertBar', true);
    this.p.set('AlertBar/Text (TMP)', t);
    this.alertT = 2.2;
  }

  openModal(name) {
    this.closeModal(); this.modal = name; this.p.show(name, true); this.ctx.uiOpen(true);
    this.layer.resize();   // TMP auto-size of the panel's texts needs them laid out while visible
  }
  closeModal() { if (!this.modal) return; this.p.show(this.modal, false); if (this.modal === 'Panels/PricePanel') this.p.show('Panels', true); this.modal = null; this.ctx.uiOpen(false); }

  // ---------- laptop store ----------
  openStore() { this.openModal('Store'); this.storeSection('Products'); this.renderCart(); }
  closeStore() { this.closeModal(); }

  storeSection(which) {
    const P = this.p;
    P.show('Store/Store/Products', which === 'Products');
    P.show('Store/Store/License', which === 'License');
    P.show('Store/Store/Service', false); P.show('Store/Store/Bank', false);
    for (const b of ['Store', 'Manage']) {
      const el = this.q(`Store/Store/LeftButtons/${b}`);
      if (el) el.style.filter = (b === 'Store') === (which === 'Products') ? '' : 'brightness(0.7)';
    }
    if (which === 'Products') this.storeTab(this.tab); else this.manageTab('License');
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
    if (t === 'Furniture') rows = G.furniture.map(f => ({ kind: 'f', type: f.type, d: f }));
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
      const name = t === 'License' ? `License_${r.type}` : `Expansion_${r.type}`;
      const path = `${base}/${name}`;
      if (!this.q(path)) continue;
      const owned = (t === 'License' ? sim.s.licenses : sim.s.expansions).includes(r.type);
      this.p.set(`${path}/Price`, dollars(r.price));
      const buy = this.q(`${path}/Buy`);
      if (!buy) continue;
      buy.style.backgroundImage = `url("${this.base}/${owned ? 'owned.webp' : 'buy_1155.webp'}")`;
      this.p.set(`${path}/Buy/Text (TMP)`, owned ? 'OWNED' : sim.s.level < r.level ? `Level ${r.level}` : 'Buy');
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
    else { this.ctx.sound && this.ctx.sound.sfx('11.1_CheckoutFailed'); this.alert('Wrong amount'); }
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
    P.show('HudUI/PlayerControls', !inChk && !this.modal);
    P.show('HudUI/PlayerControls/BoxButtons/Open', !!held && held.kind === 'p' && !held.open);
    P.show('HudUI/PlayerControls/BoxButtons/Closed', !!held && held.kind === 'p' && held.open);
    P.show('HudUI/PlayerControls/BoxButtons/Throw', !!held);
    P.show('HudUI/PlayerControls/Interact', !!st.target);
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
    const ic = this.q('HudUI/RightSide/ObjectiveBar/TextArea/IconImage');
    const icon = this.layer.ui.hudIcons[obj.icon];
    if (ic && icon && ic._icon !== icon) { ic._icon = icon; ic.style.backgroundImage = `url("${this.base}/${icon}")`; }
    if (this.alertT > 0 && (this.alertT -= dt) <= 0) P.show('AlertBar', false);
  }
}
