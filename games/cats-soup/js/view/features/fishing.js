// Feature "fishing" (view part): the fishing ground (work 10), the fish inventory and sell popup, the fish book
// (aquarium collection) and the aquarium (work 33). Contract: js/view/registry.js. Layouts are the original NGUI
// panels art/ui/panels/set_fishing, set_fishinven, set_fishpopup, set_aquainven; the aquarium scene is drawn in DOM
// (the original is a 3D scene with the cats; neither its prefabs nor the Aquarium_Cat rigs are in this port).
import { find } from '../ngui.js';
import * as B from '../../sim/big.js';

const ATLAS = 'atlas_ui1_atlas';
const FISH_ATLAS = 'atlas_shop_atlas';
// Fishing round, seconds (UI_Fishing coroutines FishingStart/QuillStart; the numbers are inferred, the decompile keeps
// the fish animation in Animation clips): wait for a fish, it comes, it bites, the player raises, or it leaves.
const T_WAIT = [1.2, 2.4], T_COME = 1.3, T_BITE = 1.6, T_AWAY = 2.3, T_RESULT = 2.4;
const POND = { w: 660, h: 880, cx: 0, cy: 40 };
const TANK_BG = ['linear-gradient(#5fc4e8,#1d6f9e 60%,#0d3f66)', 'linear-gradient(#bfe6ff,#7fb7ec 55%,#f5d9ef)',
  'linear-gradient(#cfe9ff,#7ab2d8 60%,#e8f4ff)', 'linear-gradient(#27407a,#10214a 55%,#050c22)'];

export default {
  id: 'fishing',

  async mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.hud = ctx.hud;
    this.ng = ctx.ng;
    this.fx = ctx.game.feat.fishing;
    ctx.css('css/fishing.css');
    this.t = (key, fb, ...a) => (ctx.lang[key] != null ? ctx.t(key, ...a) : (fb ?? key));
    this.el = document.createElement('div');
    this.el.className = 'fx';
    ctx.hud.el.appendChild(this.el);
    this.screen = null;
    this.vibration = true;
    this.mode = 'normal';
    const [fishing, inven, popup, aqua] = await Promise.all(['set_fishing', 'set_fishinven', 'set_fishpopup', 'set_aquainven'].map(n => ctx.panel(n)));
    this.tree = { fishing, inven, popup, aqua };
    window.__fishing = this;
  },

  onTap(work) {
    if (!this.tree) return false;
    if (work.a === 10) { this.open('fishing'); return true; }
    if (work.a === 33) { this.open('aquarium'); return true; }
    return false;
  },

  onEvent(e) {
    if (!this.screen) return;
    if (e.type === 'fishCast' || e.type === 'fishSell') this.refresh();
  },

  update(dt) {
    if (!this.screen) return;
    if (this.screen === 'fishing') this.tickFishing(Math.min(dt, 0.25));
    else if (this.screen === 'aquarium') this.tickAquarium(Math.min(dt, 0.25));
  },

  // ---- screen management ----
  open(name, arg) {
    this.close(true);
    this.screen = name;
    this.hud.close();
    this.root = document.createElement('div');
    this.root.className = `fx-screen fx-${name}`;
    this.el.appendChild(this.root);
    this.el.classList.add('on');
    ({ fishing: () => this.buildFishing(), inven: () => this.buildInven(arg), popup: () => this.buildPopup(arg), book: () => this.buildBook(arg), aquarium: () => this.buildAquarium() })[name]();
  },

  close(keep) {
    if (this.root) this.root.remove();
    this.root = null;
    this.screen = null;
    if (!keep) this.el.classList.remove('on');
  },

  refresh() {
    const s = this.screen;
    if (!s) return;
    if (s === 'fishing') this.drawFishingHud();
    else if (s === 'inven') this.drawInven();
    else if (s === 'book') this.drawBook();
    else if (s === 'aquarium') this.drawAquarium();
  },

  // ng helpers
  node(tree) { const el = this.ng.build(tree.roots[0]); const w = document.createElement('div'); w.className = 'fx-nroot'; w.appendChild(el); this.root.appendChild(w); return el; },
  put(el, path) { return find(el, path); },
  text(el, path, s) {
    const n = typeof path === 'string' ? find(el, path) : path;
    if (n && n.box) { n.box.textContent = s; n.box.classList.toggle('multi', String(s).includes('\n')); }
    return n;
  },
  show(el, path, on) { const n = find(el, path); if (n) n.style.display = on ? '' : 'none'; return n; },
  btn(el, path, fn) {
    const n = find(el, path);
    if (!n) return null;
    n.classList.add('btn');
    for (const b of n.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = e => { e.stopPropagation(); fn(e); }; }
    return n;
  },
  spr(atlas, name, w, h, cls = '') {
    const d = this.hud.sprite(atlas, name, cls);
    d.style.width = `${w}px`;
    d.style.height = `${h}px`;
    return d;
  },
  place(parent, child, x, y) { child.style.position = 'absolute'; child.style.left = `${x}px`; child.style.top = `${-y}px`; parent.appendChild(child); return child; },
  circle(icon, w = 110, cls = '') {
    const d = document.createElement('div');
    d.className = `fx-circle btn ${cls}`;
    d.style.width = d.style.height = `${w}px`;
    d.appendChild(this.spr(ATLAS, 'button_circle1', w, w, 'bg'));
    const i = this.spr(ATLAS, icon, w * 0.7, w * 0.7, 'ic');
    d.appendChild(i);
    return d;
  },
  back(fn) {
    const d = this.circle('icon_exit', 120, 'fx-exit');
    d.onclick = fn;
    this.root.appendChild(d);
    return d;
  },
  fishName(id) { return this.t(`fish${id}`, id >= 100 && id < 400 ? 'Bánh quy cá' : `Cá ${id}`); },
  fishIcon(id, size) {
    const d = this.spr(FISH_ATLAS, `fish${id}`, size, size, 'fx-fish');
    return d;
  },
  stars(n) { return '★'.repeat(Math.min(n, 10)); },

  // ===================================================== fishing ground
  buildFishing() {
    const g = this.game, fx = this.fx;
    const el = this.node(this.tree.fishing);
    this.fe = el;
    el.classList.add('fx-fishroot');
    for (const p of ['set_penguin', 'set_wifi', 'icon_guide button', 'spr_fish', 'lb_time', 'set_guide', 'bt_fishEffect', 'lb_baitSpCount_top', 'set_msg/bt_earnAds/txt_adsT', 'bt_switchNormalFishing', 'sub_panel/bt_auto']) this.show(el, p, false);
    // pond: water, fish shadows, the quill
    const pond = document.createElement('div');
    pond.className = 'fx-pond';
    pond.style.cssText = `left:${POND.cx - POND.w / 2}px;top:${-(POND.cy + POND.h / 2)}px;width:${POND.w}px;height:${POND.h}px;z-index:2`;
    el.appendChild(pond);
    this.pond = pond;
    const quill = document.createElement('div');
    quill.className = 'fx-quill';
    quill.innerHTML = '<i class="ring"></i><i class="ring r2"></i><b class="float"></b><u class="bang">!</u>';
    pond.appendChild(quill);
    this.quill = quill;
    this.q = { x: POND.w / 2, y: POND.h * 0.45 };
    quill.style.left = `${this.q.x}px`;
    quill.style.top = `${this.q.y}px`;
    this.fishes = [];
    for (let i = 0; i < 4; i++) {
      const d = this.spr(FISH_ATLAS, 'fish0', 96, 96, 'fx-shadowfish');
      pond.appendChild(d);
      this.fishes.push({ el: d, x: 80 + Math.random() * (POND.w - 160), y: 80 + Math.random() * (POND.h - 160), tx: 0, ty: 0, ang: 0, sp: 70 + Math.random() * 40 });
      this.wander(this.fishes[i]);
    }
    // status label (charges and bait) next to the bait icon
    this.status = document.createElement('div');
    this.status.className = 'fx-status';
    el.appendChild(this.place(el, this.status, -262, 590));
    this.status.style.zIndex = 20;
    this.card = document.createElement('div');
    this.card.className = 'fx-catch';
    this.card.style.zIndex = 30;
    el.appendChild(this.place(el, this.card, 0, 40));
    this.hint = document.createElement('div');
    this.hint.className = 'fx-hint';
    this.hint.style.zIndex = 25;
    el.appendChild(this.place(el, this.hint, 0, 420));
    // the auto-fishing package is a real-money item: shown, disabled
    const buy = find(el, 'sub_panel/bt_buy_auto');
    if (buy) { buy.classList.add('off'); buy.style.opacity = 0.45; }
    const close = this.circle('icon_exit', 110, 'fx-exit');
    close.style.left = '330px';
    close.style.top = '-660px';
    close.onclick = () => this.close();
    el.appendChild(close);
    close.style.zIndex = 30;
    this.btn(el, 'bt_fishing', () => this.raise());
    this.btn(el, 'bt_fishInven', () => this.open('inven', { tab: 0, from: 'fishing' }));
    this.btn(el, 'bt_aqua', () => this.open('aquarium'));
    this.btn(el, 'bt_vibration', () => {
      this.vibration = !this.vibration;
      const n = find(el, 'bt_vibration/Sprite');
      if (n && n.box) this.ng.paint(n.box, ATLAS, this.vibration ? 'vibrationOn' : 'vibrationOff', false);
    });
    this.btn(el, 'bt_switchSpecialFishing', () => {
      if (this.game.state.fishing.bait >= 1) { this.mode = this.mode === 'special' ? 'normal' : 'special'; this.drawFishingHud(); this.round('wait'); }
      else this.hud.toast(this.t('msg_no_baitSp'));
    });
    this.btn(el, 'set_msg/bt_earnAds', () => { fx.adBait(g); this.drawFishingHud(); this.round('wait'); });
    this.round('wait');
    this.drawFishingHud();
  },

  drawFishingHud() {
    const el = this.fe, g = this.game, fx = this.fx;
    if (!el) return;
    const w = fx.fishWork(g);
    const max = g.work.get(10).maxValue;
    const ch = w ? w.v : 0;
    const bait = g.state.fishing.bait;
    if (this.mode === 'special' && bait < 1) this.mode = 'normal';
    const sp = this.mode === 'special';
    this.show(el, 'set_bait', !sp);
    this.show(el, 'set_starCandy', sp);
    this.show(el, 'bt_switchSpecialFishing', true);
    const swIcon = find(el, 'bt_switchSpecialFishing/Sprite');
    if (swIcon && swIcon.box) this.ng.paint(swIcon.box, ATLAS, sp ? 'bait' : 'baitSp', false);
    this.text(el, 'bt_switchSpecialFishing/lb_baitSpCount', sp ? `${ch}` : `x ${bait}`);
    this.status.textContent = sp ? `x ${bait}   ${ch}/${max}` : `${ch}/${max}`;
    const none = ch < 1 || (sp && bait < 1);
    this.noBait = none;
    this.show(el, 'set_msg', none);
    if (none) {
      const left = w ? Math.max(0, g.work.get(10).completeTime - w.t) : 0;
      const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
      this.text(el, 'set_msg/lb_msg', sp ? this.t('msg_no_baitSp') : this.t('msg_noBait', 'Mồi chưa sẵn sàng', `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`));
      const ads = this.text(el, 'set_msg/bt_earnAds/txt_ads', this.t('msg_ads_bait'));
      if (ads) { Object.assign(ads.box.style, { whiteSpace: 'normal', lineHeight: '22px', height: '48px', top: '-24px', textAlign: 'center' }); ads.box.style.setProperty('font-size', '20px', 'important'); }
      this.text(el, 'set_msg/bt_earnAds/txt', '+ 1');
    }
    this.show(el, 'bt_fishInven/Sprite', true);
    const dot = this.fx.hasNew(g);
    el.classList.toggle('has-new', dot);
  },

  // state machine of one fishing round
  round(phase) {
    this.ph = phase;
    this.pt = 0;
    if (phase === 'wait') this.pdur = T_WAIT[0] + Math.random() * (T_WAIT[1] - T_WAIT[0]);
    if (phase === 'come') this.pdur = T_COME;
    if (phase === 'bite') this.pdur = T_BITE;
    if (phase === 'away') this.pdur = T_AWAY;
    if (phase === 'result') this.pdur = T_RESULT;
    this.quill.dataset.ph = phase;
    this.root.dataset.ph = phase;
    this.target = phase === 'come' || phase === 'bite' ? (this.target || this.fishes[0]) : null;
    if (phase === 'wait' || phase === 'away') this.target = null;
    if (phase === 'wait') { this.card.style.display = 'none'; }
    const msg = { wait: 'guide_fishing0', come: 'guide_fishing1', bite: 'guide_fishing2', away: 'guide_fishing3' }[phase];
    this.hint.textContent = msg && !this.noBait ? this.t(msg) : '';
    this.hint.style.display = this.hint.textContent ? '' : 'none';
    if (phase === 'bite') {
      this.hint.classList.add('hot');
      if (this.vibration && navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* no vibration */ } }
    } else this.hint.classList.remove('hot');
  },

  // Raise the quill (UI_Fishing.OnClickRaise): only a fish that bit is caught, and only then a charge is spent.
  raise() {
    if (this.ph === 'result') { this.round('wait'); return; }
    if (this.noBait) return;
    if (this.ph === 'bite') {
      const sp = this.mode === 'special';
      const res = this.fx.cast(this.game, sp);
      if (res) { this.showCatch(res); this.drawFishingHud(); return; }
    }
    // empty raise: every fish swims away for 2.2..2.4 s
    for (const f of this.fishes) { f.tx = f.x + (f.x < POND.w / 2 ? -1 : 1) * 300; f.ty = f.y + 100 * (Math.random() - 0.5); }
    this.round('away');
  },

  showCatch(res) {
    const c = this.card;
    c.textContent = '';
    c.style.display = 'flex';
    const sp = this.mode === 'special';
    if (res.row.type === 99) {
      const r = res.reward;
      const icon = res.row.rewardType === 5 ? '🎒' : '🪙';
      const b = document.createElement('div');
      b.className = 'big';
      b.textContent = icon;
      c.appendChild(b);
      const t = document.createElement('b');
      t.textContent = `${this.t('fishingReward', 'Phần thưởng câu cá')}${res.row.rewardType === 4 ? `  +${res.row.rewardValue}` : ''}`;
      c.appendChild(t);
    } else {
      c.appendChild(this.fishIcon(res.fish, 220));
      const t = document.createElement('b');
      t.textContent = this.fishName(res.fish);
      c.appendChild(t);
      const s = document.createElement('i');
      s.textContent = `${this.stars(res.row.grade)}  ♥ ${res.row.heartValue}`;
      c.appendChild(s);
      if (res.stored === false) {
        const m = document.createElement('small');
        m.textContent = this.t('msg_fullFish');
        c.appendChild(m);
      }
    }
    this.card.dataset.fish = res.fish;
    this.hint.textContent = this.t('guide_fishing4');
    this.hint.style.display = '';
    this.round('result');
    this.hint.textContent = this.t('guide_fishing4');
    this.hint.style.display = '';
  },

  wander(f) {
    f.tx = 60 + Math.random() * (POND.w - 120);
    f.ty = 60 + Math.random() * (POND.h - 120);
  },

  tickFishing(dt) {
    if (!this.q) return;
    this.pt += dt;
    // the target fish: nearest to the quill
    if ((this.ph === 'come' || this.ph === 'bite') && !this.target) this.target = this.fishes[0];
    for (const f of this.fishes) {
      let tx = f.tx, ty = f.ty, sp = f.sp;
      if (f === this.target && (this.ph === 'come' || this.ph === 'bite')) { tx = this.q.x - 60; ty = this.q.y + 10; sp = this.ph === 'come' ? 150 : 60; }
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
      if (d < 12) { if (f !== this.target) this.wander(f); } else {
        const k = Math.min(1, (sp * dt) / d);
        f.x += dx * k; f.y += dy * k;
        f.ang = dx < 0 ? 0 : 180;
      }
      f.el.style.transform = `translate(${f.x - 48}px, ${f.y - 48}px) scaleX(${f.ang ? -1 : 1})`;
    }
    if (this.ph === 'wait' && this.pt >= this.pdur) {
      if (!this.noBait) { this.target = this.fishes[Math.floor(Math.random() * 4)]; this.round('come'); } else this.pt = 0;
    } else if (this.ph === 'come' && this.pt >= this.pdur) this.round('bite');
    else if (this.ph === 'bite' && this.pt >= this.pdur) { for (const f of this.fishes) this.wander(f); this.round('away'); }
    else if (this.ph === 'away' && this.pt >= this.pdur) this.round('wait');
    else if (this.ph === 'result' && this.pt >= this.pdur) this.round('wait');
    this.fa = (this.fa || 0) + dt;
    if (this.fa > 0.5) { this.fa = 0; this.drawFishingHud(); }
  },

  // ===================================================== fish inventory (set_fishinven)
  buildInven(arg = {}) {
    this.arg = arg;
    const el = this.node(this.tree.inven);
    this.ie = el;
    this.tab = arg.tab || 0;
    const a = find(el, 'a');
    this.grid = document.createElement('div');
    this.grid.className = 'fx-grid';
    a.appendChild(this.grid);
    this.show(el, 'a/slide', false);
    this.text(el, 'set_title/lb_title_main', this.t('fish', 'Cá').toUpperCase());
    this.text(el, 'set_title/lb_title_sub', '');
    this.show(el, 'tabs/t3', true);
    ['t1', 't2', 't3'].forEach((t, i) => {
      this.btn(el, `tabs/${t}`, () => { this.tab = i; this.drawInven(); });
      this.text(el, `tabs/${t}/txt`, '');
    });
    this.btn(el, 'tabs/t3', () => { this.tab = 2; this.drawInven(); });
    const close = this.circle('icon_exit', 110, 'fx-exit');
    close.style.left = '330px';
    close.style.top = '-840px';
    close.onclick = () => this.open(arg.from === 'aquarium' ? 'aquarium' : 'fishing');
    el.appendChild(close);
    this.drawInven();
  },

  drawInven() {
    const el = this.ie, g = this.game, fx = this.fx;
    if (!el) return;
    const inv = g.state.fishing.inv;
    ['t1', 't2', 't3'].forEach((t, i) => {
      const bg = find(el, `tabs/${t}/bg`);
      if (bg && bg.box) this.ng.paint(bg.box, ATLAS, i === this.tab ? 'tab_on' : 'tab_off', true);
      const dot = find(el, `tabs/${t}/icon_dot`);
      if (dot) dot.style.display = i < 2 && Object.keys(g.state.fishing.fresh).some(id => (i === 1) === (+id >= 400)) ? '' : 'none';
    });
    const ids = Object.keys(inv).map(Number).filter(id => {
      const v = inv[id];
      if (this.tab === 2) return v.a > 0;
      return (this.tab === 1 ? id >= 400 : id < 400) && v.n - v.a > 0;
    }).sort((x, y) => g.fishTable.get(y).grade - g.fishTable.get(x).grade || x - y);
    const label = find(el, 'bg/Label');
    this.text(el, 'bg/Label', this.t('msg_noFish'));
    if (label) label.style.display = ids.length ? 'none' : '';
    const total = this.tab === 2 ? fx.aquaCount(g) : fx.count(g, this.tab === 1 ? 'special' : 'normal') + (this.tab === 0 ? fx.count(g, 'feed') : 0);
    const cap = this.tab === 2 ? 500 : 999;
    this.text(el, 'bg/txt_info', `${total} / ${cap}`);
    this.grid.textContent = '';
    for (const id of ids) {
      const row = g.fishTable.get(id), v = inv[id];
      const n = this.tab === 2 ? v.a : v.n - v.a;
      const d = document.createElement('div');
      d.className = `fx-tile btn${g.state.fishing.fresh[id] ? ' new' : ''}`;
      d.appendChild(this.fishIcon(id, 120));
      d.insertAdjacentHTML('beforeend', `<b>x ${n}</b><i>${this.stars(row.grade)}</i><u>♥ ${row.heartValue}</u>`);
      d.onclick = () => this.open('popup', { id, tab: this.tab, from: this.arg });
      this.grid.appendChild(d);
    }
  },

  // ===================================================== fish popup (set_fishpopup): amount, sell, to aquarium
  buildPopup(arg) {
    this.arg = arg;
    const g = this.game, fx = this.fx;
    const { id, tab } = arg;
    const row = g.fishTable.get(id), v = g.state.fishing.inv[id];
    if (!v) { this.open('inven', arg.from); return; }
    fx.clearNew(g, id);
    const inAqua = tab === 2;
    const max = inAqua ? v.a : v.n - v.a;
    let amount = 1;
    const dim = document.createElement('div');
    dim.className = 'fx-dim';
    dim.onclick = () => this.open('inven', arg.from);
    this.root.appendChild(dim);
    const el = this.node(this.tree.popup);
    this.pe = el;
    this.show(el, 'popup_YESNO', false);
    const iconNode = find(el, 'icon');
    if (iconNode) iconNode.style.display = 'none';
    el.appendChild(this.place(el, this.fishIcon(id, 130), -65, 188));
    for (const p of ['gr_dot/bt_minus/Sprite/Sprite (1)', 'gr_dot/bt_plus/Sprite/Sprite (1)']) this.show(el, p, false);
    this.text(el, 'txt_title', this.fishName(id));
    this.text(el, 'txt_info', this.t('info_fish', 'Trái tim + {0}', row.heartValue));
    const price = () => B.format(fx.sellPrice(g, id, amount));
    const draw = () => {
      amount = Math.max(1, Math.min(max, amount));
      this.text(el, 'gr_dot/txt_ea', String(amount));
      this.text(el, 'bt_sell/txt', inAqua ? '' : `${this.t('sell')}  ${price()}`);
      this.text(el, 'bt_aqua/txt', inAqua ? this.t('cancel_arrangement') : this.t('fish_aqua', 'Bể cá'));
      this.text(el, 'bt_aqua/txt_count', inAqua ? '' : `${fx.aquaCount(g)} / 500`);
      this.show(el, 'bt_sell', !inAqua);
      this.show(el, 'bt_aqua', !inAqua);
      this.show(el, 'bt_cancel_deploy', inAqua);
    };
    this.btn(el, 'gr_dot/bt_min', () => { amount = 1; draw(); });
    this.btn(el, 'gr_dot/bt_max', () => { amount = max; draw(); });
    this.btn(el, 'gr_dot/bt_minus', () => { amount -= 1; draw(); });
    this.btn(el, 'gr_dot/bt_plus', () => { amount += 1; draw(); });
    this.text(el, 'gr_dot/bt_min/Sprite/txt_min', '1');
    this.text(el, 'gr_dot/bt_max/Sprite/txt_max', this.t('max'));
    const done = () => this.open('inven', arg.from);
    this.btn(el, 'bt_sell', () => { fx.sell(g, id, amount); done(); });
    this.btn(el, 'bt_aqua', () => {
      if (fx.store(g, id, amount)) { this.hud.toast(`${this.fishName(id)} x${amount}`); done(); } else this.hud.toast(this.t('msg_fullAqua').split('\n')[0]);
    });
    this.btn(el, 'bt_cancel_deploy', () => { fx.unstore(g, id, amount); done(); });
    draw();
  },

  // ===================================================== fish book (set_aquainven)
  buildBook(arg = {}) {
    this.arg = arg;
    const el = this.node(this.tree.aqua);
    this.be = el;
    this.tab = arg.tab || 0;
    const a = find(el, 'a');
    this.grid = document.createElement('div');
    this.grid.className = 'fx-grid book';
    const info = find(el, 'txt_info');
    if (info && info.box) { Object.assign(info.box.style, { width: '700px', left: '-350px', whiteSpace: 'pre-line', lineHeight: '34px', textAlign: 'center' }); info.box.style.setProperty('font-size', '28px', 'important'); }
    a.appendChild(this.grid);
    this.show(el, 'a/slide', false);
    this.text(el, 'set_title/lb_title_main', 'AQUARIUM');
    this.text(el, 'set_title/lb_title_sub', '');
    this.text(el, 'txt_info', this.t('info_Aquarium'));
    this.btn(el, 'tabs/t1', () => { this.tab = 0; this.drawBook(); });
    this.btn(el, 'tabs/t2', () => { this.tab = 1; this.drawBook(); });
    ['t1', 't2'].forEach(t => this.text(el, `tabs/${t}/txt`, ''));
    const close = this.circle('icon_exit', 110, 'fx-exit');
    close.style.left = '330px';
    close.style.top = '-840px';
    close.onclick = () => this.open('aquarium');
    el.appendChild(close);
    this.drawBook();
  },

  drawBook() {
    const el = this.be, g = this.game, fx = this.fx;
    if (!el) return;
    ['t1', 't2'].forEach((t, i) => {
      const bg = find(el, `tabs/${t}/bg`);
      if (bg && bg.box) this.ng.paint(bg.box, ATLAS, i === this.tab ? 'tab_on' : 'tab_off', true);
    });
    const bonus = fx.bookBonus(g);
    const pct = x => (x * 100).toFixed(x * 100 % 1 ? 1 : 0);
    for (const [key, special] of [['info_normal', false], ['info_special', true]]) {
      const base = find(el, `set_total/${key}`);
      if (!base) continue;
      const have = fx.bookCount(g, special), all = fx.bookMax(g, special);
      this.text(base, 'txt_total', this.t('total', 'Tổng'));
      this.text(base, 'num_total', `★ ${have}`);
      const gauge = find(base, 'set_gauge/gauge');
      if (gauge && gauge.box) { gauge.box.style.width = `${Math.max(8, 600 * have / all)}px`; gauge.box.style.filter = 'hue-rotate(120deg)'; }
      this.text(base, 'txt_info', special ? `${this.t('info_getGrade2')} +${pct(bonus.food)}%` : `${this.t('info_getEnergy')} +${pct(bonus.energy)}%`);
      base.style.display = (special === (this.tab === 1)) ? '' : 'none';
    }
    const rows = g.data.fishing.fish.filter(r => (this.tab === 1 ? r.index >= 400 : r.index < 100));
    this.grid.textContent = '';
    for (const r of rows) {
      const n = g.state.fishing.book[r.index] || 0;
      const d = document.createElement('div');
      d.className = `fx-tile book${n ? '' : ' unknown'}`;
      d.appendChild(this.fishIcon(r.index, 120));
      d.insertAdjacentHTML('beforeend', n ? `<b>${Math.min(n, r.group)} / ${r.group}</b><i>${this.stars(r.grade)}</i>` : '<b>?</b><i></i>');
      d.title = n ? this.fishName(r.index) : '';
      this.grid.appendChild(d);
    }
  },

  // ===================================================== aquarium (work 33)
  buildAquarium() {
    const g = this.game, fx = this.fx;
    const tank = document.createElement('div');
    tank.className = 'fx-tank';
    this.root.appendChild(tank);
    this.tank = tank;
    this.tfish = [];
    const mk = (icon, x, y, fn, w = 110) => { const c = this.circle(icon, w); c.style.left = `${x}px`; c.style.top = `${y}px`; c.onclick = fn; this.root.appendChild(c); return c; };
    mk('icon_exit', 940, 1740, () => this.close(), 140);
    mk('fishingNow', 40, 1180, () => this.open('fishing'));
    mk('icon_fishbrush', 40, 1330, () => this.themeUI());
    mk('star', 940, 1330, () => this.open('book'));
    mk('icon_fishBox', 940, 1480, () => this.open('inven', { tab: 2, from: 'aquarium' }));
    mk('icon_storage_all', 940, 1180, () => this.keepAll());
    mk('icon_info', 940, 30, () => this.guideUI(), 90);
    const cap = document.createElement('div');
    cap.className = 'fx-cap';
    this.root.appendChild(cap);
    this.cap = cap;
    this.drawAquarium();
  },

  drawAquarium() {
    const g = this.game, fx = this.fx;
    if (!this.tank) return;
    const f = g.state.fishing;
    this.tank.style.background = TANK_BG[f.theme] || TANK_BG[0];
    this.tank.dataset.theme = f.theme;
    const list = [];
    for (const [id, v] of Object.entries(f.inv)) for (let i = 0; i < v.a; i++) list.push(+id);
    this.tank.textContent = '';
    this.tfish = [];
    const show = list.slice(0, 80);
    show.forEach((id, i) => {
      const row = g.fishTable.get(id);
      const size = 90 * Math.max(0.8, row.size) * (0.9 + (row.grade >= 7 ? 0.5 : 0));
      const d = this.fishIcon(id, size);
      d.classList.add('swim');
      this.tank.appendChild(d);
      const o = { el: d, id, size, x: Math.random() * 900, y: 200 + Math.random() * 1200, sp: 30 + Math.random() * 50 };
      this.pick(o);
      this.tfish.push(o);
    });
    this.cap.textContent = list.length ? `${list.length} / 500` : this.t('msg_noAqua');
    this.cap.classList.toggle('empty', !list.length);
  },

  pick(o) { o.tx = 40 + Math.random() * 900; o.ty = 160 + Math.random() * 1300; },

  tickAquarium(dt) {
    for (const o of this.tfish) {
      const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy);
      if (d < 10) this.pick(o); else { const k = Math.min(1, o.sp * dt / d); o.x += dx * k; o.y += dy * k; o.flip = dx < 0 ? 1 : -1; }
      o.el.style.transform = `translate(${o.x}px, ${o.y}px) scaleX(${o.flip || 1})`;
    }
  },

  keepAll() {
    const g = this.game;
    if (!this.fx.aquaCount(g)) { this.hud.toast(this.t('msg_noAqua')); return; }
    this.confirm(this.t('msg_fishKeepAll'), () => { this.fx.unstoreAll(g); this.drawAquarium(); });
  },

  confirm(text, yes) {
    const d = document.createElement('div');
    d.className = 'fx-modal';
    d.innerHTML = `<div class="box"><p></p><div class="row"><span class="no btn"></span><span class="yes btn"></span></div></div>`;
    d.querySelector('p').textContent = text;
    d.querySelector('.no').textContent = this.t('no');
    d.querySelector('.yes').textContent = this.t('yes');
    d.querySelector('.no').onclick = () => d.remove();
    d.querySelector('.yes').onclick = () => { d.remove(); yes(); };
    this.root.appendChild(d);
  },

  guideUI() {
    const d = document.createElement('div');
    d.className = 'fx-modal';
    d.innerHTML = '<div class="box guide"></div>';
    const box = d.querySelector('.box');
    for (let i = 1; i <= 5; i++) { const p = document.createElement('p'); p.textContent = `${i}. ${this.t(`title_aquariumGuide${i}`)}`; box.appendChild(p); }
    const ok = document.createElement('div');
    ok.className = 'row';
    ok.innerHTML = '<span class="yes btn"></span>';
    ok.querySelector('span').textContent = this.t('ok');
    ok.querySelector('span').onclick = () => d.remove();
    box.appendChild(ok);
    this.root.appendChild(d);
  },

  // themes (ThemeAqua.json): pick / buy with gems
  themeUI() {
    const g = this.game, fx = this.fx;
    const themes = g.data.fishing.themes;
    let i = g.state.fishing.theme;
    const d = document.createElement('div');
    d.className = 'fx-modal theme';
    this.root.appendChild(d);
    const draw = () => {
      const th = themes[i], have = g.state.fishing.themes.includes(th.index);
      d.textContent = '';
      const box = document.createElement('div');
      box.className = 'box';
      const prev = document.createElement('span'); prev.className = 'arrow btn'; prev.textContent = '‹';
      const next = document.createElement('span'); next.className = 'arrow btn'; next.textContent = '›';
      prev.onclick = () => { i = (i + themes.length - 1) % themes.length; draw(); };
      next.onclick = () => { i = (i + 1) % themes.length; draw(); };
      const icon = this.spr('atlas_item_atlas', th.resName, 160, 160, 'icon');
      const name = document.createElement('p');
      name.textContent = this.t(th.resName, th.resName);
      const btn = document.createElement('span');
      btn.className = `yes btn${have || g.state.gem >= th.cost ? '' : ' off'}`;
      if (have) btn.textContent = g.state.fishing.theme === th.index ? '✔' : this.t('select');
      else btn.textContent = `💎 ${th.cost}`;
      btn.onclick = () => {
        if (!have) { if (!fx.buyTheme(g, th.index)) { this.hud.toast(this.t('msg_shortGem', 'Không đủ ngọc')); return; } }
        fx.setTheme(g, th.index);
        this.drawAquarium();
        draw();
      };
      const close = document.createElement('span'); close.className = 'no btn'; close.textContent = '×'; close.onclick = () => d.remove();
      const row = document.createElement('div'); row.className = 'row';
      row.append(prev, icon, next);
      box.append(name, row, btn, close);
      d.appendChild(box);
    };
    draw();
  },
};
