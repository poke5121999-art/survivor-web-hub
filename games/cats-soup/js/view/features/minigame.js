// Feature "minigame" (view part). Contract: js/view/registry.js. Rules: js/sim/features/minigame.js.
// Quick menu section "minigame": the two season sub games. The enter popup, the in-game panel and the result card are the
// original prefabs (art/ui/panels/set_subgameenterui, set_subgame_0X_*), drawn with the original atlas sprites and textures.
import * as S from '../../sim/features/minigame.js';
import { find } from '../ngui.js';

const UI = 'atlas_ui1_atlas';
let C = null;
let layer = null;     // { el, holder }
let cur = null;       // open screen: { type, close(), step(dt) }
let P = {};           // panels
let TEX = {};         // art/minigame/index.json

const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
const kids = n => [...n.children].filter(c => c.classList.contains('ng'));
const setText = (root, path, text) => { const n = find(root, path); if (n && n.box) n.box.textContent = text; return n; };
const show = (root, path, on) => { const n = find(root, path); if (n) n.style.display = on ? '' : 'none'; return n; };
const press = (n, fn) => { if (!n) return; n.classList.add('btn'); for (const w of n.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; w.onpointerdown = e => { e.stopPropagation(); fn(e); }; } };

// Widgets of kind texture have no atlas: their image is art/minigame/<prefix>.webp (tools/export_minigame_art.py).
function paintTex(node, e) {
  const w = node.w;
  if (w && w.k === 'texture' && w.tex && e.box) {
    const p = w.tex.split(':')[0];
    if (TEX[p]) { e.box.style.backgroundImage = `url(${C.base}/art/minigame/${p}.webp${globalThis.CS_V || ''})`; e.box.style.backgroundSize = '100% 100%'; }
  }
  const ks = kids(e);
  (node.c || []).forEach((c, i) => ks[i] && paintTex(c, ks[i]));
}
function build(panel) {
  const root = C.ng.build(panel.roots[0]);
  paintTex(panel.roots[0], root);
  return root;
}

// ---- reward icons: original sprites ----
const GT = { 1101: 'ticket_gold1', 1102: 'ticket_gold3', 1103: 'ticket_gold6', 1201: 'ticket_energy1', 1202: 'ticket_energy3', 1203: 'ticket_energy6' };
const ICON = { 1: 'icon_gold', 2: 'icon_energy', 3: 'icon_gem', 4: 'icon_coin', 96: 'icon_token', 98: 'icon_butterfly', 99: 'icon_stamp', 6001: 'icon_telescope_lens',
  6002: 'icon_baitSp', 21: 'icon_music', 24: 'icon_music', 44444: 'icon_xmas22', 1401: 'icon_telescope', 1402: 'icon_telescope' };
export function iconOf(type) {
  if (type === 23) return ['atlas_furniture1_atlas', 'pudding'];
  return [UI, GT[type] || ICON[type] || 'icon_stamp_b'];
}
const sprite = (type, cls = 'mg-ico') => { const [a, n] = iconOf(type); return C.hud.sprite(a, n, cls); };
const pop = (parent, text, x, y) => { const d = el('mg-pop', text); d.style.left = `${x}px`; d.style.top = `${y}px`; parent.appendChild(d); setTimeout(() => d.remove(), 800); };

// ---- layer ----
function close() {
  if (cur) { const c = cur; cur = null; if (c.close) c.close(); }
  if (layer) { layer.el.remove(); layer = null; }
}
function open(root, { x = true } = {}) {
  close();
  if (C.hud.panel) C.hud.close();
  const d = el('mg-layer'), holder = el('mg-holder');
  holder.appendChild(root);
  d.append(el('mg-dim'), holder);
  if (x) { const b = el('mg-x', '×'); b.style.left = '400px'; b.style.top = '-880px'; b.onclick = close; holder.appendChild(b); }
  C.hud.el.appendChild(d);
  layer = { el: d, holder, root };
  return layer;
}

const TITLE = { 1: 'title_season_subgame1', 2: 'title_season_subgame2' };
const PLAY = { 1: 'set_subgame_01_butterfly', 2: 'set_subgame_02_mole' };

// ---- enter popup: title, total score, the season reward list, start and practice. kind 'sub' = season sub game (butterfly 1,
// mole 2: start spends the free try or an ad try), kind 'mini' = adventure mini game (Cooking Lab 5: 2 tries a day) ----
function openEnter(type, kind = 'sub') {
  const g = C.game;
  const mini = kind === 'mini';
  const root = build(P.enter);
  open(root);
  cur = { type, kind, close() {} };
  for (const p of ['icon_ranking', 'icon_guide', 'lb_time', 'season_mini_game', 'bg_style', 'a/line', 'a/line_o', 'a/line_o (1)', 'icon_reward_button']) show(root, p, false);
  setText(root, 'set_title/Label', mini ? C.t('title_adventure') : C.t(TITLE[type]));
  setText(root, 'a/line_o (1)/total_point_name', C.t('title_totalscore'));
  const total = setText(root, 'a/line_o (1)/total_point', '0');
  show(root, 'a/line_o (1)', true);
  // The illustration of the game sits in the upper box: butterfly is the prefab's own texture, mole d57fd327, Cooking Lab
  // is the atlas sprite mg_illust_005.
  const tb0 = find(root, 'top_bg');
  if (tb0) { tb0.style.display = ''; tb0.box.style.zIndex = 5000; }
  if (type === 2 && !mini && tb0) tb0.box.style.backgroundImage = `url(${C.base}/art/minigame/d57fd327.webp${globalThis.CS_V || ''})`;
  if (mini && tb0) { tb0.box.style.backgroundImage = ''; C.ng.paint(tb0.box, 'atlas_minigame_cookinglab_atlas', 'mg_illust_005', false); }
  const msg = setText(root, 'lb_msg (1)', '');
  const list = el('mg-list');
  find(root, 'a').appendChild(list);
  const sim = S;
  const draw = () => {
    const rowsOf = mini ? sim.miniPeriodState(g, type) : sim.periodState(g, type);
    const slot = mini ? g.state.minigame.mini[type] : g.state.minigame.sub[type];
    total.box.textContent = String(slot.total);
    list.textContent = '';
    for (const p of rowsOf) {
      const row = el(`mg-row${p.done ? ' done' : ''}`);
      row.dataset.n = String(p.n);
      row.append(sprite(p.type), el('', `x${p.value}`, 'span'), el('', `${p.need}`, 'b'));
      const b = el(`go${p.ready ? '' : ' off'}`, p.done ? '✔' : C.t('getReward'));
      b.onclick = () => { if (!p.ready) return; const r = mini ? S.claimMini(g, type, p.n) : S.claimPeriod(g, type, p.n); if (r) { draw(); C.hud.toast(`+${p.value}`); } };
      row.appendChild(b);
      list.appendChild(row);
    }
    const left = mini ? S.miniTries(g, type) : S.triesLeft(g, type);
    const useAds = !mini && slot.free <= 0 && slot.ads > 0;
    show(root, 'btn_start/panelAds', useAds);
    show(root, 'btn_start/panelFree', !useAds);
    setText(root, 'btn_start/panelFree/txtStart', C.t('start'));
    setText(root, 'btn_start/panelAds/txtShowAds', C.t('showAds'));
    setText(root, 'btn_start/panelAds/txtAdsRemainCnt', `${slot.ads}/${S.DAILY_ADS}`);
    setText(root, 'btn_start/panelAds/txt_adsT', '');
    msg.box.textContent = left ? '' : C.t('msg_no_subgame_play', '');
  };
  press(find(root, 'btn_start'), () => { if ((mini ? S.miniTries(g, type) : S.triesLeft(g, type)) > 0) (mini ? openCook(false) : openPlay(type, false)); else C.hud.toast(C.t('msg_no_subgame_play', '')); });
  press(find(root, 'btn_practice'), () => (mini ? openCook(true) : openPlay(type, true)));
  setText(root, 'btn_practice/txt', C.t('btn_practice'));
  draw();
  cur.refresh = draw;
}

// ---- play ----
function openPlay(type, practice) {
  const g = C.game;
  const root = build(P[PLAY[type]]);
  const L = open(root, { x: false });
  root.classList.add('mg-r');
  const ses = S.startSub(g, type, practice);
  if (!ses) { close(); return C.hud.toast(C.t('msg_no_subgame_play', '')); }
  ses.t = -999;                       // held on the guide card until the player taps start
  const mine = { type, ses, state: 'guide', shown: new Set() };
  cur = mine;
  window.__mgSes = ses;
  show(root, 'bt_black', true);
  const ui = find(root, 'ingame_ui'), res = find(root, 'result_info_ui'), guide = find(root, 'guide_info_ui');
  ui.style.display = 'none'; res.style.display = 'none'; guide.style.display = '';
  show(root, 'ingame_ui/img_count', false);
  const key = type === 1 ? 'butterfly' : 'mole';
  setText(guide, 'guide_img/lb_title', C.t(`${key}_game_guide_title`));
  setText(guide, 'guide_img/lb_title/txt_description', C.t(`${key}_game_guide_desc01`));
  setText(guide, 'guide_img/txt_description (1)', C.t(`${key}_game_guide_desc0${type === 1 ? 3 : 2}`));
  setText(guide, 'guide_img/txt_description (2)', C.t(`${key}_game_guide_desc0${type === 1 ? 2 : 3}`));
  const d4 = find(guide, 'guide_img/txt_description (3)');
  if (d4) d4.box.textContent = C.t(`${key}_game_guide_desc04`);
  for (const n of ['guide_img/lb_title/txt_description', 'guide_img/txt_description (1)', 'guide_img/txt_description (2)', 'guide_img/txt_description (3)']) { const d = find(guide, n); if (d && d.box) d.box.classList.add('mg-wrap'); }
  setText(guide, 'guide_img/guide_3/lb_title', C.t('title_scoreInfo'));
  setText(guide, 'guide_img/guide_3/lb_score', '0');
  setText(guide, 'start_buttons/btn_start/Label', C.t('game_start_btn'));
  const score = setText(ui, 'score/lb_score', '0');
  setText(ui, 'score/lb_title', C.t('title_scoreInfo'));
  const timer = setText(ui, 'lb_timer', '20');
  const counts = ['img_count1', 'img_count2', 'img_count3', 'img_count4'].map(n => find(ui, `img_count/${n}`));
  const fieldPos = {};
  if (type === 2) {
    const holes = kids(find(ui, 'moleArea')).filter(n => n.dataset.n.startsWith('hole'));
    mine.holes = holes;
    holes.forEach((h, i) => {
      const moleBtn = find(h, 'mole/mole (1)');
      press(moleBtn, () => { const pts = S.tapHole(g, ses, i); if (pts) pop(L.holder, `+${pts}`, parseFloat(h.style.left) + parseFloat(find(ui, 'moleArea').style.left || 0), parseFloat(h.style.top) + parseFloat(find(ui, 'moleArea').style.top || 0) - 140); });
      const timerLb = find(h, 'lb_timer');
      if (timerLb) timerLb.style.display = 'none';
      for (const ptn of ['pt_NormalHit', 'pt_SpecialHit', 'pt_RareGlow', 'pt_RareHit']) show(h, `mole/${ptn}`, false);
      show(h, 'pt_RareHit', false);
    });
  } else {
    mine.area = find(ui, 'moveArea');
    mine.flies = new Map();
  }
  press(find(guide, 'start_buttons/btn_start'), () => {
    if (mine.state !== 'guide') return;
    guide.style.display = 'none';
    ui.style.display = '';
    mine.state = 'ready';
    ses.t = -S.READY_TIME;
    for (const c of counts) if (c) c.style.display = 'none';
  });
  mine.step = dt => {
    if (mine.state === 'ready' || mine.state === 'play') {
      S.stepSub(g, ses, dt);
      const n = Math.ceil(-ses.t);
      show(ui, 'img_count', ses.t < 0);
      counts.forEach((c, i) => { if (c) c.style.display = ses.t < 0 && (3 - n) === i ? '' : 'none'; });
      if (ses.t >= 0 && mine.state === 'ready') { mine.state = 'play'; if (counts[3]) { counts[3].parentElement.style.display = ''; counts[3].style.display = ''; setTimeout(() => { if (counts[3]) counts[3].style.display = 'none'; }, 700); } }
      const left = Math.max(0, Math.ceil(S.TOTAL_TIME - Math.max(0, ses.t)));
      timer.box.textContent = `00:${String(left).padStart(2, '0')}`;
      score.box.textContent = String(ses.score);
      if (type === 2) paintMoles(mine); else paintFlies(mine);
      if (ses.done) finish(mine, root, res, ui);
    }
  };
  mine.close = () => { if (mine.state === 'play' || mine.state === 'ready') { S.endSub(g, ses); } };
}

// ---- Cooking Lab: tap ingredients of the tray into the three slots in order; the third one judges the guess ----
const CL = 'atlas_minigame_cookinglab_atlas', CM = 'atlas_minigame_common_atlas';
let cookNames = null;
function openCook(practice) {
  const g = C.game;
  if (!cookNames) cookNames = Object.keys(C.ng.atlases[CL].sprites).filter(k => k.startsWith('mergeitem')).sort();
  const card = el('mg-cook');
  open(card, { x: false });
  const ses = S.startMini(g, S.MINI.cook, practice);
  if (!ses) { close(); return C.hud.toast(C.t('msg_no_subgame_play', '')); }
  const mine = { type: S.MINI.cook, kind: 'mini', ses, close() {}, state: 'guide' };
  cur = mine;
  window.__cook = ses;
  C.ng.paint(card, 'atlas_ui1_atlas', 'box_round2_l', true);
  const tray = el('mg-tray');
  C.ng.paint(tray, CL, 'bg_tray', false);
  const head = el('mg-chead', C.t('title_adventure'));
  const tries = el('mg-tries');
  const hint = el('mg-hint', '');
  const slots = el('mg-slots');
  const hist = el('mg-hist');
  const slotEls = [0, 1, 2].map(i => { const d = el('mg-slot'); d.dataset.n = String(i); slots.appendChild(d); return d; });
  card.append(head, tries, hint, slots, tray, hist);
  const picks = [];
  const nameOf = i => cookNames[ses.items[i] % cookNames.length];
  const itemEls = ses.items.map((_, i) => {
    const d = el('mg-item');
    d.dataset.i = String(i);
    C.ng.paint(d, CL, nameOf(i), false);
    d.onpointerdown = e => { e.stopPropagation(); if (mine.state === 'play') choose(i); };
    tray.appendChild(d);
    return d;
  });
  const drawSlots = () => {
    slotEls.forEach((d, k) => {
      d.style.backgroundImage = '';
      d.classList.toggle('on', k < picks.length);
      if (k < picks.length) C.ng.paint(d, CL, nameOf(picks[k]), false);
    });
    itemEls.forEach((d, i) => d.classList.toggle('used', picks.includes(i)));
    tries.textContent = `x${ses.left}`;
  };
  slotEls.forEach((d, k) => { d.onpointerdown = e => { e.stopPropagation(); if (mine.state === 'play' && k < picks.length) { picks.splice(k, 1); drawSlots(); } }; });
  const feedback = r => {
    if (r.strike > 0 && r.ball > 0) return `${C.t('minigame6_desc_2', r.strike)} ${C.t('minigame6_desc_4', r.ball)}`;
    if (r.strike > 0) return C.t('minigame6_desc_2', r.strike);
    if (r.ball > 0) return C.t('minigame6_desc_3', r.ball);
    return C.t('minigame6_desc_5');
  };
  function choose(i) {
    if (picks.includes(i) || picks.length >= 3) return;
    picks.push(i);
    drawSlots();
    if (picks.length < 3) return;
    const r = S.cookGuess(g, ses, picks.slice());
    if (!r) return;
    hint.textContent = feedback(r);
    const row = el('mg-hrow');
    r.picks.forEach(p => { const d = el('mg-hi'); C.ng.paint(d, CL, nameOf(p), false); row.appendChild(d); });
    row.appendChild(el('mg-hs', `${r.strike}/${r.ball}`, 'span'));
    hist.prepend(row);
    picks.length = 0;
    drawSlots();
    if (ses.done) setTimeout(() => finish(), 500);
  }
  function finish() {
    if (cur !== mine) return;
    mine.state = 'result';
    const res = el('mg-cres');
    const r = ses.result;
    const title = el('mg-ctitle');
    C.ng.paint(title, CM, ses.won ? 'img_miniGame_success' : 'img_miniGame_gameover', false);
    res.append(title, el('mg-cmsg', ses.won ? C.t('minigame6_desc_win') : C.t('minigame6_desc_lose')));
    const ans = el('mg-cans');
    ses.answer.forEach(p => { const d = el('mg-hi big'); C.ng.paint(d, CL, nameOf(p), false); ans.appendChild(d); });
    res.append(ans, el('mg-cscore', `${C.t('adventureScore')} ${ses.score}p`));
    const row = el('mg-crew');
    for (const rw of S.miniSingle(g, ses.gt)) {
      const c = el(`mg-rc${!practice && ses.score >= rw[1] ? ' got' : ''}`);
      c.append(sprite(rw[4]), el('', `x${rw[5]}`, 'span'), el('', `${rw[1]}p`, 'small'));
      row.appendChild(c);
    }
    res.appendChild(row);
    const ex = el('mg-cbtn', C.t('adventureExit'));
    ex.dataset.n = 'cook-exit';
    ex.onclick = () => { close(); openEnter(S.MINI.cook, 'mini'); };
    res.appendChild(ex);
    card.appendChild(res);
    window.__cookResult = r;
  }
  // guide card: the three rule lines of the original (minigame6_desc_start1..3), tries as the game data says
  const guide = el('mg-cguide');
  guide.append(el('mg-ctitle2', C.t('title_adventure')),
    el('mg-cline', C.t('minigame6_desc_start1').replace('12', String(S.COOK.tries))), el('mg-cline', C.t('minigame6_desc_start2')), el('mg-cline', C.t('minigame6_desc_start3')));
  const go = el('mg-cbtn', C.t('game_start_btn'));
  go.dataset.n = 'cook-start';
  go.onclick = () => { guide.remove(); mine.state = 'play'; hint.textContent = ''; drawSlots(); };
  guide.appendChild(go);
  card.appendChild(guide);
  drawSlots();
  mine.close = () => { if (mine.state === 'play' && !ses.done) S.endMini(g, ses, false); };
}

const BODY = ['mole00', 'mole01', 'mole02', 'mole03'];
function paintMoles(m) {
  const ses = m.ses;
  m.holes.forEach((h, i) => {
    const s = ses.holes[i];
    const mole = find(h, 'mole');
    const up = s.state === 'up' || s.state === 'caught';
    mole.style.display = up ? '' : 'none';
    if (!up) { mole.dataset.k = ''; return; }
    const k = `${s.type}:${s.grade}:${s.hits}:${s.state}`;
    if (mole.dataset.k !== k) {
      mole.dataset.k = k;
      const body = find(h, 'mole/mole (1)/spr_body').box;
      body.style.backgroundImage = '';
      C.ng.paint(body, 'atlas_subgame_mole_atlas', `${BODY[s.type]}_${s.state === 'caught' ? 'off' : 'on'}`, false);
      const hat = find(h, 'mole/mole (1)/spr_hat');
      hat.style.display = s.grade === 1 && s.hits === 0 && s.state !== 'caught' ? '' : 'none';
    }
    h.dataset.up = s.state;
  });
}

const RARE_TEX = { 1: 'f11fe67e', 2: 'fc07f18e', 3: '8e612a6e' };
function paintFlies(m) {
  const ses = m.ses, area = m.area;
  const w = 810, h = 1000;
  for (const b of ses.bf) {
    let d = m.flies.get(b);
    if (!d) {
      d = el(`mg-fly${b.type ? ' rare' : ''}`);
      if (b.type) {
        const im = new Image();
        im.src = `${C.base}/art/minigame/${RARE_TEX[b.type]}.webp${globalThis.CS_V || ''}`;
        d.appendChild(im);
      } else {
        for (const c of ['l', 'r']) { const i = el(c, null, 'i'); i.style.backgroundImage = `url(${C.base}/art/minigame/bb2620d5.webp${globalThis.CS_V || ''})`; d.appendChild(i); }
      }
      d.dataset.type = String(b.type);
      d.onpointerdown = e => {
        e.stopPropagation();
        if (S.tapButterfly(C.game, ses, b)) { d.classList.add('caught'); pop(layer.holder, '+1', parseFloat(d.style.left) - w / 2, parseFloat(d.style.top) - 170 - h / 2); }
      };
      area.appendChild(d);
      m.flies.set(b, d);
    }
    d.style.left = `${b.x * w - w / 2}px`;
    d.style.top = `${b.y * h - h / 2}px`;
  }
  for (const [b, d] of m.flies) if (!ses.bf.includes(b)) { m.flies.delete(b); setTimeout(() => d.remove(), 300); }
}

// ---- result card: score, the three single rewards (done mark when reached), exit ----
function finish(m, root, res, ui) {
  m.state = 'result';
  const g = C.game, ses = m.ses, r = ses.result;
  show(root, 'ingame_ui/img_count', false);
  ui.style.display = 'none';
  res.style.display = '';
  setText(res, 'result_info/lb_title_current_score', C.t('adventureScore'));
  setText(res, 'result_info/lb_title_current_score/lb_current_score', `${ses.score}p`);
  setText(res, 'result_info/lb_title_reward', C.t('missionReward'));
  const singles = S.singleRewards(g, m.type);
  singles.forEach((row, i) => {
    const n = find(res, `result_info/lb_title_reward/reward_0${i + 1}`);
    if (!n) return;
    const [a, nm] = iconOf(row[4]);
    const spr = find(n, 'item/spr_reward_icon');
    spr.box.style.backgroundImage = '';
    C.ng.paint(spr.box, a, nm, false);
    setText(n, 'item/lb_reward_value', `x${row[5]}`);
    setText(n, 'item/lb_need_score', `${row[1]}p`);
    const got = !ses.practice && ses.score >= row[1];
    show(n, 'item/spr_reward_icon/spr_reward_done', got);
    show(n, 'spr_lock_icon', false);
  });
  show(res, 'result_info/top_record_button', false);
  const rare = find(res, 'result_info');
  if (r.collected.length && rare) pop(layer.holder, '★', 0, -100);
  if (r.collectReward) C.hud.toast(`${C.t('eventReward')} x${r.collectReward.value}`);
  setText(res, 'result_buttons/btn_exit/Label', C.t('adventureExit'));
  press(find(res, 'result_buttons/btn_exit'), () => { close(); openEnter(m.type, 'sub'); });
  m.close = () => {};
  window.__mgResult = r;
}

export default {
  id: 'minigame',
  async mount(ctx) {
    ctx.css('css/minigame.css');
    C = ctx;
    const [enter, mole, fly, idx] = await Promise.all([ctx.panel('set_subgameenterui'), ctx.panel('set_subgame_02_mole'), ctx.panel('set_subgame_01_butterfly'), ctx.json('art/minigame/index.json')]);
    P = { enter, set_subgame_02_mole: mole, set_subgame_01_butterfly: fly };
    TEX = idx;
    ctx.hud.addMenu({ sec: 'minigame', key: TITLE[1], sprite: 'icon_butterfly', run: () => openEnter(1) });
    ctx.hud.addMenu({ sec: 'minigame', key: TITLE[2], sprite: 'mole', run: () => openEnter(2) });
    ctx.hud.addMenu({ sec: 'minigame', key: 'title_adventure', sprite: 'event_subGame', run: () => openEnter(S.MINI.cook, 'mini') });
    window.__minigame = { openEnter, close, cur: () => cur };
  },
  update(dt) {
    if (cur && cur.step) cur.step(dt);
  },
  onEvent() {},
};
