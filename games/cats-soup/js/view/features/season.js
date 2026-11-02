// Feature "season" (view part): the event box of the HUD (set_eventBox, opened by bt_eventOpen, which core hides) with the
// season exchange shop / event missions / event pass, the login calendars, the soup pass and the play-point rewards, plus
// a quick-menu entry for the beginner / welcome / return gifts. Rules: js/sim/features/season.js.
// Paid (premium / royal / special) tracks are drawn disabled; nothing in them is ever granted.
import { find } from '../ngui.js';

const BOX = 'mainUI/set_topRight/buttons/set_eventBox';
const OPEN = 'mainUI/set_topRight/buttons/bt_eventOpen';
const BTS = `${BOX}/eventBts`;
const BUTTONS = { // button -> panel it opens; the rest of eventBts is not part of this port
  bt_eventSeason: 'shop', bt_eventPass_Season: 'mission', bt_dailyReward_Season: 'season', bt_eventMain: 'group', bt_soupPass: 'soup', bt_playPoint: 'play',
};
const HIDDEN = ['bt_attendance', 'bt_monthly', 'bt_eventCrane', 'bt_catGiftInfo'];
const DOT = { shop: 'shop', mission: 'mission', season: 'season', group: 'group', soup: 'soup', play: 'playPoint' };
const ICON = { 1: '🪙', 2: '⚡', 3: '💎', 4: '🪑', 7: '🐟', 23: '🍮', 24: '🍪', 98: '🦋', 99: '🎟', 6002: '⭐', 44444: '🎁', 97: '🪙' };
const HOURS = [1, 3, 6];

const el = (cls = '', text = '', tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text !== '') d.textContent = text; return d; };

export default {
  id: 'season',
  mount(ctx) {
    this.ctx = ctx;
    this.sim = ctx.game.feat.season;
    ctx.css('css/season.css');
    this.tx = (key, fb, ...a) => (ctx.lang[key] != null ? ctx.t(key, ...a) : fb);
    this.dots = {};
    this.since = 1;
    this.shown = false;
    const box = find(ctx.root, BOX);
    if (!box) return;
    box.style.display = '';
    for (const n of ['bg', 'eventLines']) { const c = [...box.children].find(x => x.dataset.n === n); if (c) c.style.display = 'none'; }
    this.box = box;
    this.back = el('sn-back');
    box.insertBefore(this.back, box.firstChild);
    this.bts = find(ctx.root, BTS);
    for (const c of [...this.bts.children]) {
      const name = c.dataset.n;
      if (HIDDEN.includes(name) || !BUTTONS[name]) { c.style.display = 'none'; continue; }
      c.style.display = ''; // the prefab keeps these buttons inactive until their event runs
      const panel = BUTTONS[name];
      ctx.hud.bind(`${BTS}/${name}`, () => this.open(panel));
      const sh = [...c.children].find(x => x.dataset.n === 'pt_shine'); if (sh) sh.style.display = 'none';
      const dot = el('sn-dot'); c.appendChild(dot); this.dots[DOT[panel]] = dot;
    }
    this.layout(true);
    // bt_eventOpen (the offer wall's slot in this port) folds the box away and brings it back.
    const ob = find(ctx.root, OPEN);
    if (ob) { ob.style.display = ''; ctx.hud.bind(OPEN, () => { this.shown = !this.shown; this.since = 1; }); }
    ctx.hud.addMenu({ sec: 'etc', key: 'title_beginnerEvent', sprite: 'icon_event0', run: () => this.open('gift') });
  },

  // eventBts children all sit at the origin in the prefab (a UIGrid lays them out at run time): a 3-wide grid of 104 px cells
  // that skips the calendars and the soup pass until 3 cats are owned (DataManager.IsActiveSoupPassEvent).
  layout(force) {
    const ok = this.sim.unlocked(this.ctx.game);
    if (!force && ok === this.laid) return;
    this.laid = ok;
    const order = ['bt_eventSeason', 'bt_eventPass_Season', 'bt_playPoint', 'bt_dailyReward_Season', 'bt_eventMain', 'bt_soupPass'];
    let k = 0;
    for (const n of order) {
      const c = [...this.bts.children].find(x => x.dataset.n === n);
      if (!c) continue;
      const gated = ['bt_dailyReward_Season', 'bt_eventMain', 'bt_soupPass'].includes(n);
      c.style.visibility = gated && !ok ? 'hidden' : '';
      if (gated && !ok) continue;
      c.style.left = `${(k % 3) * 104 - 150}px`;
      c.style.top = `${Math.floor(k / 3) * 104 + 60 + 36}px`; // eventBts itself sits 36 px above the box origin
      k += 1;
    }
    Object.assign(this.back.style, { left: '-214px', top: '0px', width: '332px', height: `${Math.ceil(k / 3) * 104 + 32}px` });
  },

  update(dt) {
    this.since += dt;
    if (this.since < 0.5) return;
    this.since = 0;
    const game = this.ctx.game, ok = this.sim.unlocked(game);
    const p = this.sim.pending(game);
    for (const [k, d] of Object.entries(this.dots)) d.style.display = p[k] ? 'block' : 'none';
    if (this.box) this.box.style.display = this.ctx.hud.moving || !this.shown ? 'none' : '';
    this.layout();
  },

  onEvent(e) {
    if (this.ctx.hud.panel && /^(seasonStart|seasonDay)$/.test(e.type)) this.ctx.hud.panel.refresh();
  },

  // ---- labels ----
  label(type, value) {
    const t = this.tx;
    if (type >= 1101 && type <= 1103) return `${t('ticketGold', 'Vé vàng', t('hour', '{0} giờ', HOURS[type - 1101]))}`;
    if (type >= 1201 && type <= 1203) return `${t('ticketEnergy', 'Vé điểm công thức', t('hour', '{0} giờ', HOURS[type - 1201]))}`;
    if (type >= 1401 && type <= 1408) return `🔭 ${value}`;
    const NAME = { 5: ['👕', 'Trang bị'], 6: ['🪑', 'Nội thất'], 14: ['💡', 'Đèn'], 15: ['🎀', 'Vật phẩm'], 21: ['🎵', 'Nhạc'], 22: ['🏞', 'Chủ đề'], 26: ['🏠', 'Skin'], 28: ['⏱', 'Skin'], 201: ['🧶', 'Đồ tháp'] };
    if (NAME[type]) return `${NAME[type][0]} ${NAME[type][1]} #${value}`;
    if (type === 'pass') return `🏅 ${value}`;
    if (type >= 7101 && type <= 7109) return `🐟 ${value}`;
    if (type === 101 || type === 102) return `${ICON[type === 101 ? 1 : 2]} ${value >= 3600 ? t('hour', '{0} giờ', value / 3600) : t('minute', '{0} phút', value / 60)}`;
    return `${ICON[type] || '🎁'} ${value}`;
  },
  rw(type, value, cls = 'rw') { return el(cls, this.label(type, value)); },
  premium(type, value) { const d = el('prem', `🔒 ${this.label(type, value)}`); d.title = this.tx('premiumPass', 'Thẻ cao cấp'); return d; },
  txt(title, sub) {
    const d = el('txt');
    d.innerHTML = '<b></b><small></small>';
    d.querySelector('b').textContent = title;
    d.querySelector('small').textContent = sub || '';
    return d;
  },
  bar(v, max) {
    const b = el('bar');
    b.innerHTML = `<i style="width:${Math.min(100, (100 * v) / max)}%"></i><span>${v}/${max}</span>`;
    return b;
  },
  button(ok, text, fn) { const b = el(`price ${ok ? '' : 'off'}`, text); if (ok) b.onclick = fn; return b; },
  paid(out) {
    const { hud } = this.ctx;
    hud.toast([].concat(out).filter(Boolean).map(o => this.label(o.type, o.value) + (o.held ? '' : '')).join('  '));
    if (hud.panel) hud.panel.refresh();
  },
  head(list, title, sub) { const r = el('row head sn'); r.appendChild(this.txt(title, sub)); list.appendChild(r); return r; },

  // ---- panels ----
  open(which) {
    const { hud } = this.ctx;
    const t = this.tx, sim = this.sim, game = this.ctx.game, info = sim.seasonInfo(game);
    const season = `${t('event', 'Sự kiện')}: ${info.name}`;
    const days = t('day', '{0} ngày', info.daysLeft);
    const sub = `${t('time_eventFinish', 'Cho đến cuối sự kiện')}: ${days}`;
    if (which === 'shop') hud.open(season, '', [{ k: 'shop', title: t('eventReward', 'Đổi quà') }], l => this.shop(l));
    else if (which === 'mission') hud.open(season, '', [{ k: 'mission', title: t('eventMission', 'Nhiệm vụ') }, { k: 'pass', title: t('pass', 'Thẻ sự kiện') }], (l, tb) => this[tb.k](l));
    else if (which === 'season' || which === 'group') {
      const tabs = [{ k: 'season', title: 'Điểm danh mùa' }, { k: 'group', title: 'Điểm danh ngày' }];
      if (which === 'group') tabs.reverse();
      hud.open('Điểm danh', '', tabs, (l, tb) => this.calendar(l, tb.k));
    } else if (which === 'soup') hud.open(t('title_soupPass1', 'Thẻ Súp'), '', [{ k: 'soupLevels', title: t('title_soupPass1', 'Thẻ Súp') }, { k: 'soupPlay', title: 'Chơi' }], (l, tb) => this[tb.k](l));
    else if (which === 'play') hud.open(t('playTime', 'Điểm chơi'), '', [{ k: 'play', title: t('playTime', 'Giờ chơi') }], l => this.play(l));
    else if (which === 'gift') {
      const tabs = [];
      for (const c of ['beginner', 'welcome']) { const st = sim.calState(game, c); if (st && st.open) tabs.push({ k: c, title: c === 'beginner' ? t('title_beginnerEvent', 'Quà 7 ngày') : t('title_welcomeback', 'Chào mừng') }); }
      if (sim.retState(game)) tabs.push({ k: 'ret', title: t('title_returningUser', 'Trở lại') });
      if (!tabs.length) { hud.toast(t('msg_eventLock', 'Chưa có quà tặng.').split('\n')[0]); return; }
      hud.open(t('event', 'Sự kiện'), '', tabs, (l, tb) => (tb.k === 'ret' ? this.ret(l) : this.calendar(l, tb.k)));
    }
  },

  shop(list) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    const s = game.state.season;
    const h = this.head(list, `${t('obtainedPoint', 'Vật phẩm sự kiện')}: ${s.items}`, `${t('time_eventFinish', 'Cho đến cuối sự kiện')}: ${t('day', '{0} ngày', sim.seasonInfo(game).daysLeft)}`);
    h.appendChild(el('rw', '🎁'));
    for (const it of sim.shopList(game)) {
      const r = el('row sn' + (it.left <= 0 ? ' claimed' : ''));
      r.appendChild(this.txt(this.label(it.row.rewardType, it.row.rewardValue), `${t('LimitGoods', 'Còn lại')}: ${it.left}/${it.row.enableCount}`));
      r.appendChild(it.left <= 0 ? el('done', '✔') : this.button(it.can, `🎁 ${it.row.requireValue}`, () => this.paid(sim.buyShop(game, it.row.index))));
      list.appendChild(r);
    }
  },

  mission(list) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    this.head(list, `${t('obtainedPoint', 'Điểm')}: ${game.state.season.passPts}`, t('info_eventMission02', ''));
    for (const m of sim.missionList(game)) {
      const r = el('row sn' + (m.claimed ? ' claimed' : ''));
      r.appendChild(this.txt(t(`quest${m.row.type}`, '', m.max)));
      r.lastChild.appendChild(this.bar(m.count, m.max));
      r.appendChild(el('rw', `${this.label('pass', m.row.rewardPoint)}  ${this.label(44444, m.row.rewardValue)}`));
      r.appendChild(m.claimed ? el('done', '✔') : this.button(m.done, t('getReward', 'Nhận'), () => this.paid(sim.claimMission(game, m.row.index))));
      list.appendChild(r);
    }
  },

  pass(list) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    this.head(list, `${t('obtainedPoint', 'Điểm')}: ${game.state.season.passPts}`, t('guide_eventPass02', ''));
    for (const p of sim.passList(game)) {
      const r = el('row sn' + (p.claimed ? ' claimed' : ''));
      r.appendChild(this.txt(`Lv.${p.row.index + 1}`, `${p.row.unlockValue} ${t('obtainedPoint', 'điểm')}`));
      r.appendChild(this.rw(p.row.rewardType, p.row.rewardValue));
      r.appendChild(this.premium(p.row.rewardTypeP, p.row.rewardValueP));
      r.appendChild(p.claimed ? el('done', '✔') : this.button(p.open, t('getReward', 'Nhận'), () => this.paid(sim.claimPass(game, p.row.index))));
      list.appendChild(r);
    }
  },

  calendar(list, which) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    const st = sim.calState(game, which);
    if (!st) { list.appendChild(el('row locked', t('title_catplayGuide1', 'Cần 3 mèo con').split('!')[0])); return; }
    const grid = el('sn-grid');
    for (const row of st.rows) {
      const claimed = !!st.claimed[row.requireValue], ready = !claimed && row.requireValue <= st.unlock;
      const d = el(`day${claimed ? ' done' : ''}${ready ? ' ready' : ''}`);
      d.innerHTML = '<small></small><b></b><em></em>';
      d.querySelector('small').textContent = t('daysCount', 'Ngày {0}', row.requireValue + 1);
      d.querySelector('b').textContent = claimed ? '✔' : this.label(row.rewardType, row.rewardValue);
      d.querySelector('em').textContent = row.rewardTypeP1 ? `🔒 ${this.label(row.rewardTypeP1, row.rewardValueP1)}` : '';
      if (ready) d.onclick = () => this.paid(sim.claimCal(game, which, row.requireValue));
      grid.appendChild(d);
    }
    list.appendChild(grid);
  },

  ret(list) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    const st = sim.retState(game);
    if (!st) return;
    this.head(list, t('title_welcomeback', 'Chào mừng trở lại!'), t('daysCount', 'Ngày {0}', st.day));
    for (const m of st.rows) {
      const r = el('row sn' + (m.claimed ? ' claimed' : ''));
      r.appendChild(this.txt(t(`return_quest${m.row.missionType}`, '', m.row.missionValue)));
      r.lastChild.appendChild(this.bar(m.count, m.row.missionValue));
      r.appendChild(this.rw(m.row.rewardType, m.row.rewardValue));
      r.appendChild(m.claimed ? el('done', '✔') : this.button(m.done, t('getReward', 'Nhận'), () => this.paid(sim.claimReturn(game, m.row.index))));
      list.appendChild(r);
    }
    if (st.clearRow) {
      const r = el('row sn clear' + (st.clearClaimed ? ' claimed' : ''));
      r.appendChild(this.txt(t('return_quest100', 'Hoàn thành tất cả')));
      r.appendChild(this.rw(st.clearRow.rewardType, st.clearRow.rewardValue));
      r.appendChild(st.clearClaimed ? el('done', '✔') : this.button(st.clearReady, t('getReward', 'Nhận'), () => this.paid(sim.claimReturnClear(game))));
      list.appendChild(r);
    }
  },

  soupLevels(list) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    const pts = game.state.season.soup.pts;
    this.head(list, `${t('soupPass_point', 'Súp Xu')}: ${pts}`, t('msg_soupPassInfo8', ''));
    for (const lv of sim.soupLevels(game)) {
      const r = el('row sn' + (lv.claimed ? ' claimed' : ''));
      r.appendChild(this.txt(`Lv.${lv.index + 1}`, `${lv.need} ${t('soupPass_point', 'xu')}`));
      r.appendChild(this.rw(lv.row.rewardType, lv.row.rewardValue));
      r.appendChild(this.premium(lv.row.rewardTypeP, lv.row.rewardValueP));
      r.appendChild(lv.claimed ? el('done', '✔') : this.button(lv.open, t('getReward', 'Nhận'), () => this.paid(sim.claimSoup(game, lv.index))));
      list.appendChild(r);
    }
  },

  // The mini game: the guest wants three ingredients (shown on top); pick three from the six below.
  soupPlay(list) {
    const { game, hud } = this.ctx, sim = this.sim, t = this.tx;
    const s = game.state.season.soup, gm = s.game;
    this.head(list, `${t('soupPass_point', 'Súp Xu')}: ${s.pts}`, `${s.plays}/${sim.soupCap(game)}`);
    const ing = (i, cls = '') => {
      const name = game.data.season.soup.minigame.find(x => x.index === i).resName;
      const d = el(`ing ${cls}`);
      d.appendChild(hud.sprite('atlas_food_atlas', name, 'ingico'));
      return d;
    };
    if (!gm) {
      const r = el('row sn');
      r.appendChild(this.txt(t('info_soupPass_minigame', 'Thêm nguyên liệu và nấu súp!'), sim.soupLimit(game) ? '' : `${s.plays}/${sim.soupCap(game)}`));
      r.appendChild(this.button(sim.soupLimit(game), 'Chơi', () => { sim.soupStart(game); hud.panel.refresh(); }));
      list.appendChild(r);
      return;
    }
    const wrap = el('sn-soup');
    const want = el('want'); want.appendChild(el('', t('msg_soupPassInfo2', '').split('!')[0], 'small'));
    const wrow = el('ings'); gm.target.forEach(i => wrow.appendChild(ing(i, 'want')));
    want.appendChild(wrow);
    wrap.appendChild(want);
    const opts = el('ings opts');
    for (const i of gm.options) {
      const d = ing(i, gm.select.includes(i) ? 'picked' + (gm.done ? (gm.target.includes(i) ? ' right' : ' wrong') : '') : '');
      if (!gm.done) d.onclick = () => { sim.soupPick(game, i); hud.panel.refresh(); };
      opts.appendChild(d);
    }
    wrap.appendChild(opts);
    if (gm.done) {
      wrap.appendChild(el('gain', `+${gm.gain} ${t('soupPass_point', 'xu')}`));
      const again = this.button(sim.soupLimit(game), 'Chơi tiếp', () => { sim.soupStart(game); hud.panel.refresh(); });
      wrap.appendChild(again);
    }
    list.appendChild(wrap);
  },

  play(list) {
    const { game } = this.ctx, sim = this.sim, t = this.tx;
    const sec = game.state.season.pp.sec;
    this.head(list, `🎟 ${sim.playPoints(game)}`, `${t('playTime', 'Giờ chơi')}: ${Math.floor(sec / 60)} ${t('minute', '{0} phút', '').replace('{0}', '').trim() || 'phút'}`);
    for (const p of sim.ppList(game)) {
      const r = el('row sn' + (p.claimed ? ' claimed' : ''));
      r.appendChild(this.txt(t('minute', '{0} phút', p.row.playTime)));
      r.lastChild.appendChild(this.bar(Math.min(p.row.playTime, Math.floor(sec / 60)), p.row.playTime));
      r.appendChild(this.rw(p.row.rewardType, p.row.rewardValue));
      r.appendChild(p.claimed ? el('done', '✔') : this.button(p.open, t('getReward', 'Nhận'), () => this.paid(sim.claimPlayPoint(game, p.row.index))));
      list.appendChild(r);
    }
    // PlayPoint.json grades are Google Play Points purchases: shown, never available.
    for (const g of game.data.season.playPoint) {
      const r = el('row sn off');
      r.appendChild(this.txt(`${t('playGameService', 'Google Play')} · ${g.grade}`));
      r.appendChild(this.rw(g.rewardType, g.rewardValue));
      r.appendChild(this.button(false, '🔒', null));
      list.appendChild(r);
    }
  },
};
