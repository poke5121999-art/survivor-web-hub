// Feature "guide" (view part): tutorial speech bubble + hand pointer, the newbie nudge banner (ui/set_newbieguide in the
// HUD's set_newbieGuide slot), the welcome-cat popup (ui/set_welcomecat) and the forest-expansion popup
// (ui/set_forestexpansion). Rules: js/sim/features/guide.js. Contract: js/view/registry.js.
import * as B from '../../sim/big.js';
import { find } from '../ngui.js';

const UI1 = 'atlas_ui1_atlas';
const FOOD = 'atlas_food_atlas';
const IMG = 'atlas_img_atlas';
const POPUP_MS = 8000;

const el = (cls, text) => { const d = document.createElement('div'); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

export default {
  id: 'guide',

  async mount(ctx) {
    this.ctx = ctx;
    this.queue = [];
    this.pop = null;
    this.since = 1;
    this.popPanels = {};
    this.ready = false;
    const { game, hud, ng, root } = ctx;
    this.sim = game.feat.guide;
    ctx.css('css/guide.css');
    // Test and screenshot states (?demo, ?size) are not a new player's first minutes.
    const q = new URLSearchParams(location.search);
    if (q.has('demo') || q.has('size')) { this.sim.skip(game); this.sim.takePopups(game); }

    this.layer = el('gd');
    hud.el.appendChild(this.layer);
    this.bubble = el('gd-bubble');
    this.bubble.style.display = 'none';
    this.layer.appendChild(this.bubble);
    ng.paint(this.bubble, UI1, 'bg_speech', true);
    this.hand = el('gd-hand');
    this.hand.style.display = 'none';
    this.hand.appendChild(el('gd-ring'));
    const finger = hud.sprite(UI1, 'icon_finger', 'gd-finger');
    this.hand.appendChild(finger);
    this.layer.appendChild(this.hand);

    // The original's own widgets: the nudge slot of the HUD and its prefab (label, gauge, speech background).
    this.host = find(root, 'mainUI/set_top/set_newbieGuide');
    if (this.host) {
      const bt = [...this.host.children].find(c => c.dataset.n === 'set_newbieBt');
      if (bt) bt.style.display = 'none';
      const panel = await ctx.panel('set_newbieguide');
      this.nudge = ng.build(panel.roots[0]);
      this.nudge.classList.add('gd-nudge');
      this.host.appendChild(this.nudge);
      this.host.style.display = 'none';
      this.nLabel = find(this.nudge, 'Label');
      this.nProg = find(this.nudge, 'set_progress');
      this.nGauge = find(this.nudge, 'set_progress/gauge');
      this.nNum = find(this.nudge, 'set_progress/num');
      const ex = find(this.nudge, 'set_progress/set_ex');
      if (ex) ex.style.display = 'none';
      if (this.nGauge && this.nGauge.box) this.nGauge.box.style.transformOrigin = '0 50%';
    }

    this.ready = true;
  },

  // ---- per-frame ----
  update(dt) {
    if (!this.ready) return;
    const { game } = this.ctx;
    for (const p of this.sim.takePopups(game)) this.queue.push(p);
    this.updatePopup();
    this.since += dt;
    if (this.since < 0.12) return;
    this.since = 0;
    this.show(this.sim.info(game));
  },

  show(info) {
    const { hud, game } = this.ctx;
    const t = this.ctx.t;
    // bubble
    if (info && info.msg && info.msg.length) {
      this.bubble.textContent = '';
      for (const k of info.msg) this.bubble.appendChild(el('gd-line', t(k)));
      this.bubble.style.display = 'block';
    } else this.bubble.style.display = 'none';
    // nudge
    if (this.host) {
      const n = info && info.nudge;
      this.host.style.display = n ? '' : 'none';
      if (n) {
        let text, frac = 1, num = '';
        if (n.kind === 'save') {
          text = t('guide_saveGold', B.format(n.price));
          const r = B.toNumber(n.gold) / B.toNumber(n.price);
          frac = Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 1;
          num = `${B.format(n.gold)} / ${B.format(n.price)}`;
        } else if (n.kind === 'build') text = t('guide_buildNow', t(`title_build${n.a}`));
        else text = t('guide_expandNow');
        if (this.nLabel && this.nLabel.box) this.nLabel.box.textContent = text;
        if (this.nProg) this.nProg.style.display = n.kind === 'save' ? '' : 'none';
        if (this.nGauge && this.nGauge.box) this.nGauge.box.style.transform = `scaleX(${frac})`;
        if (this.nNum && this.nNum.box) this.nNum.box.textContent = num;
      }
    }
    // hand
    const pt = info && info.target ? this.targetPoint(info.target, info) : null;
    if (pt) {
      this.hand.style.left = `${pt[0]}px`;
      this.hand.style.top = `${pt[1]}px`;
      this.hand.style.display = 'block';
      this.hand.classList.toggle('down', pt[1] > 1700);   // a target at the screen's lower edge: the hand comes from above
    } else this.hand.style.display = 'none';
  },

  // Centre of the thing the hand points at, in the 1080x1920 HUD space; null when it is not on screen.
  targetPoint(target, info) {
    const { hud, root, game } = this.ctx;
    const base = hud.el.getBoundingClientRect();
    const k = base.width / 1080;
    const rect = e => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(e).display !== 'none' ? [(r.left + r.width / 2 - base.left) / k, (r.top + r.height / 2 - base.top) / k] : null;
    };
    const union = e => {   // an NGUI button is a 0x0 node with .w widgets inside
      if (!e) return null;
      let l = 1e9, tp = 1e9, r = -1e9, b = -1e9;
      for (const w of e.querySelectorAll('.w')) {
        const x = w.getBoundingClientRect();
        if (x.width < 2) continue;
        l = Math.min(l, x.left); tp = Math.min(tp, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom);
      }
      return l < 1e9 ? [((l + r) / 2 - base.left) / k, ((tp + b) / 2 - base.top) / k] : null;
    };
    const panel = hud.panel && hud.panel.el;
    switch (target) {
      case 'dish': return rect(hud.shelf.querySelector('.dish'));
      case 'build': return panel ? rect(panel.querySelector('.row .price:not(.off)')) : union(find(root, 'mainUI/set_bottomRight/bt_build'));
      case 'recipe':
        // The facility card (from the upgrade step) hides the HUD; the recipe step starts with it closed.
        if (!panel && hud.selected) hud.select(null);
        return panel ? rect(panel.querySelector('.row .price.energy:not(.off)')) : union(find(root, 'mainUI/set_bottomRight/bt_recipe'));
      case 'expand': return rect(hud.expandBtn);
      case 'up': return rect(hud.card.querySelector('.up'));
      case 'work': {
        const up = hud.card.style.display !== 'none' ? hud.card.querySelector('.up') : null;
        if (up) return rect(up);
        return this.workPoint();
      }
      default: return null;
    }
  },

  // Screen point of the first facility (the soup pot), for "tap it".
  workPoint() {
    const { game, view, camera } = this.ctx;
    const w = game.state.works[0];
    const v = w && view.works.get(w.id);
    if (!v || !v.obj) return null;
    const p = new v.obj.position.constructor();
    v.obj.getWorldPosition(p);
    p.y += 0.3;
    p.project(camera.cam);
    return [(p.x + 1) * 540, (1 - p.y) * 960];
  },

  // ---- popups: welcome cat, forest expansion; one at a time, they close by themselves ----
  updatePopup() {
    if (this.pop && Date.now() > this.pop.until) this.closePop();
    if (!this.pop && this.queue.length) {
      const p = this.queue.shift();
      if (p.kind === 'welcome') this.welcome(p);
      else this.expansion(p);
    }
  },

  closePop() {
    if (!this.pop) return;
    this.pop.el.remove();
    this.pop = null;
  },

  open(cls, top) {
    const d = el(`gd-pop ${cls}`);
    d.style.top = `${top}px`;
    this.ctx.hud.el.appendChild(d);
    this.pop = { el: d, until: Date.now() + POPUP_MS };
    return d;
  },

  ok(parent, top) {
    const b = el('gd-ok', this.ctx.t('ok'));
    b.style.top = `${top}px`;
    b.onclick = () => this.closePop();
    parent.appendChild(b);
  },

  // ui/set_welcomecat: the new cat on the table (bg_table), its name; the rare prefab only differs by animation, so the
  // rare cat gets a warmer heading.
  welcome(p) {
    const { hud, ng, game } = this.ctx;
    const t = this.ctx.t;
    const d = this.open('welcome', 800);
    const card = el('gd-card gd-in');
    ng.paint(card, UI1, 'box_round1_l', true);
    const table = el('gd-table');
    ng.paint(table, IMG, 'bg_table', false);
    card.appendChild(table);
    card.appendChild(el('gd-sub', p.rare ? '★ ★ ★' : '♥'));
    const icon = hud.sprite(FOOD, `cat${p.cat.type}`, 'gd-cat');
    const info = ng.spriteInfo(FOOD, `cat${p.cat.type}`);
    const h = 220;
    icon.style.height = `${h}px`;
    icon.style.width = `${info ? Math.round(info[2] * h / info[3]) : h}px`;
    card.appendChild(icon);
    card.appendChild(el('gd-name', t(`catType${p.cat.type}`)));
    d.appendChild(card);
    this.ok(d, 250);
  },

  // ui/set_forestexpansion: title, "Mở rộng cấp {0}", the gift slots (gold, furniture coins).
  async expansion(p) {
    const { hud, ng } = this.ctx;
    const t = this.ctx.t;
    this.popPanels.forest = this.popPanels.forest || (await this.ctx.panel('set_forestexpansion'));
    if (this.pop) { this.queue.unshift(p); return; }
    const d = this.open('forest', 570);
    const tree = ng.build(this.popPanels.forest.roots[0]);
    tree.style.transform = 'scale(0.82)';
    tree.classList.add('gd-in');
    const frame = find(tree, 'bgFrame');
    const set = (path, text) => { const n = find(frame, path); if (n && n.box) n.box.textContent = text; };
    set('forest/textValue', t('forest_expansion_leveltext', p.size));
    const dt = find(frame, 'text_bg/text');   // the exported label height is one line box; a two-line text needs its own
    if (dt && dt.box) Object.assign(dt.box.style, { lineHeight: '1.25', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' });
    set('text', '');                       // "your gift went to the mailbox": the port pays at once
    const slots = [['item/bt_storage', 'icon_gold', B.format(p.gold)], ['item/bt_storage (1)', 'icon_coin', p.coin ? String(p.coin) : '']];
    for (const [path, icon, count] of slots) {
      const s = find(frame, path);
      if (!s) continue;
      if (!count) { s.style.display = 'none'; continue; }
      const ic = find(s, 'icon');
      if (ic && ic.box) { ic.box.style.backgroundImage = ''; ic.box.style.border = ''; ng.paint(ic.box, UI1, icon, false); }
      const lb = find(s, 'lbCount');
      if (lb && lb.box) lb.box.textContent = `x ${count}`;
    }
    if (slots[1][2] === '' || !p.coin) { const s0 = find(frame, 'item/bt_storage'); if (s0) s0.style.left = '0px'; }
    d.appendChild(tree);
    this.ok(d, 340);
  },
};
