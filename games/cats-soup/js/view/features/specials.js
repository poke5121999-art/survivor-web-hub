// Feature "specials" (view part). Contract: js/view/registry.js. Rules: js/sim/features/specials.js.
// Tapping a type-4 facility opens its dialog (DOM, original sprites and strings); the jar fairy bubble and the elephant
// icon are the original HUD nodes mainUI/set_bottom/set_jar and set_trader; the special-order board and the reward
// popup are built from the exported prefabs set_specialorder and popup_showitem.
import * as B from '../../sim/big.js';
import * as S from '../../sim/features/specials.js';
import { find } from '../ngui.js';

const UI = 'atlas_ui1_atlas';
let C = null;            // ctx
let layer = null;        // dialogs live here (hud.el)
let cur = null;          // open dialog: { dim, refresh(), tick(dt), close() }
let balloon = null;      // the shaking balloon: { el, work, taps }
const anims = [];        // dt driven animations: fn(dt) -> true when finished
let panels = {};
let acc = 0;

const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
const fmt = v => (typeof v === 'number' ? String(v) : B.format(v));
const clock = s => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };
const works = a => C.game.state.works.find(w => w.a === a);
const gem = () => C.hud.sprite(UI, 'icon_gem_s', 'gem');
const play = n => C.sound.play(n);

// ---- what a reward looks like: sprite + text ----
function equipSprite(index) {
  const e = C.game.t.Equip.find(x => x.index === index);
  if (!e) return null;
  for (const a of ['atlas_equip1_atlas', 'atlas_equip2_atlas', 'atlas_equip3_atlas', 'atlas_equip4_atlas']) if (C.ng.spriteInfo(a, e.resName)) return [a, e.resName, C.t(`name_${e.resName}`) === `name_${e.resName}` ? '' : C.t(`name_${e.resName}`)];
  return null;
}
export function describe(r) {
  const ty = r.type, v = r.amount || r.value;
  const hours = { 1101: 1, 1102: 3, 1103: 6, 1201: 1, 1202: 3, 1203: 6 };
  if (ty === 1 || ty === 101) return { atlas: UI, sprite: 'icon_gold', text: `+${fmt(v)}`, };
  if (ty === 2 || ty === 102) return { atlas: UI, sprite: 'icon_energy', text: `+${fmt(v)}` };
  if (ty === 3) return { atlas: UI, sprite: 'icon_gem', text: `+${fmt(v)}` };
  if (ty === 4) return { atlas: UI, sprite: 'icon_coin', text: `+${fmt(v)}` };
  if (ty === 23) return { atlas: 'atlas_furniture1_atlas', sprite: 'pudding', text: `x${fmt(v)}` };
  if (ty === 6002) return { atlas: UI, sprite: 'icon_baitSp', text: `x${fmt(v)}` };
  if (hours[ty]) return { atlas: UI, sprite: `ticket_${ty < 1200 ? 'gold' : 'energy'}${hours[ty]}`, text: C.t(ty < 1200 ? 'ticketGold' : 'ticketEnergy', `${hours[ty]}h`) };
  if (ty === 5) {
    const q = r.equip != null ? equipSprite(r.equip) : null;
    return q ? { atlas: q[0], sprite: q[1], text: q[2] || 'x1' } : { atlas: UI, sprite: 'multiCard', text: `x${fmt(v)}` };
  }
  if (ty === 6) { // furniture: the icon of the furniture feature's atlases, named by its Furniture row
    const fr = C.game.feat.furniture && C.game.feat.furniture.row(C.game, Number(r.value));
    const at = fr && ['atlas_furniture1_atlas', 'atlas_furniture2_atlas'].find(a => C.ng.spriteInfo(a, fr.resName));
    if (at) return { atlas: at, sprite: fr.resName, text: C.t(`name_${fr.resName}`) === `name_${fr.resName}` ? `x1` : C.t(`name_${fr.resName}`) };
  }
  return { atlas: UI, sprite: 'icon_treasure', text: `x${fmt(v)}` };
}
const iconOf = (d, cls = 'ic') => { const i = C.hud.sprite(d.atlas, d.sprite, cls); return i; };

// ---- dialogs ----
function close() {
  if (cur) { if (cur.onClose) cur.onClose(); cur.dim.remove(); cur = null; }
}
function dialog(title, build) {
  close();
  const dim = el('sp-dim');
  const box = el('sp-box');
  box.appendChild(el('sp-title', title));
  const x = el('sp-x', '×');
  x.onclick = close;
  box.appendChild(x);
  dim.appendChild(box);
  layer.appendChild(dim);
  cur = { dim, box };
  build(cur, box);
  return cur;
}
function floater(text, x = 540, y = 800, color = '#ffe066') {
  const d = el('floater', text);
  d.style.left = `${x}px`; d.style.top = `${y}px`; d.style.color = color;
  C.hud.el.appendChild(d);
  setTimeout(() => d.remove(), 1200);
}
const button = (cls, ...kids) => { const b = el(`sp-btn ${cls || ''}`); for (const k of kids) b.appendChild(typeof k === 'string' ? el('', k, 'span') : k); return b; };
const cost = (n, kind = 'gem') => { const c = el('cost'); c.appendChild(kind === 'gem' ? gem() : C.hud.sprite(UI, 'icon_coin_s', 'gem')); c.appendChild(el('', String(n), 'span')); return c; };

// Reward popup (prefab popup_showitem), one after another; a tap closes the current one.
function showItems(list) {
  const queue = list.filter(r => r && r.type !== 5);   // equip cards: the equip feature shows its own reveal on the reward event
  const next = () => {
    const r = queue.shift();
    if (!r) return;
    play('007_Powerup upgrade 35');
    const d = describe(r);
    const pop = el('sp-pop');
    const root = C.ng.build(panels.showitem.roots[0]);
    const spr = find(root, 'spr');
    spr.box.style.backgroundImage = '';
    C.ng.paint(spr.box, d.atlas, d.sprite, false);
    const sb = find(root, 'spr/spr_b');
    if (sb) sb.style.display = 'none';
    find(root, 'txt_info').box.textContent = C.t('getReward');
    find(root, 'txt_name').box.textContent = d.text;
    find(root, 'txt_etc').box.textContent = '';
    for (const n of root.querySelectorAll('[data-n="pt_show"]')) n.style.display = 'none';
    const black = find(root, 'black');
    black.box.style.opacity = '0.6';
    const hit = el('sp-click');
    hit.onclick = () => { pop.remove(); next(); };
    pop.appendChild(root);
    pop.appendChild(hit);
    layer.appendChild(pop);
  };
  next();
}

// ---- treasure chest ----
function openChest(w) {
  dialog(C.t('title_gacha'), (c, box) => {
    box.appendChild(C.hud.sprite('atlas_img_atlas', 'img_treasure', 'sp-chest'));
    const left = el('sp-row');
    box.appendChild(left);
    const row = el('sp-row');
    const free = button('', el('', C.t('showAds'), 'span'), el('', '', 'small'));
    const gemBtn = button('blue', cost(C.game.data.specials.chestGem), el('', '', 'small'));
    row.append(free, gemBtn);
    box.appendChild(row);
    const result = r => {
      if (!r) return C.hud.toast(S.chestWait(C.game) > 0 ? clock(S.chestWait(C.game)) : C.t('msg_cantTrade'));
      if (r.short) return C.hud.toast(C.t('msg_shortGem'));
      showItems([r.given]);
    };
    free.onclick = () => result(S.openChest(C.game, w, 'free'));
    gemBtn.onclick = () => result(S.openChest(C.game, w, 'gem'));
    c.refresh = () => {
      left.textContent = '';
      left.appendChild(C.hud.sprite(UI, 'multiCard', 'gem'));
      left.appendChild(el('', `${w.v} / ${C.game.work.get(w.a).dailyCount}`, 'span'));
      const wait = S.chestWait(C.game);
      free.classList.toggle('off', !S.chestReady(C.game, w));
      free.lastChild.textContent = w.v < 1 ? '' : wait > 0 ? clock(wait) : '';
      gemBtn.lastChild.textContent = '';
    };
    c.tick = c.refresh;
    c.refresh();
  });
}

// ---- jar fairy bubble (HUD nodes of the original) ----
let jarBubble = null;
function setupJar() {
  const base = 'mainUI/set_bottom/set_jar';
  const jar = find(C.root, base), jini = find(C.root, `${base}/set_jini`), sp = find(C.root, `${base}/set_jini/set_speech`);
  if (!jar || !jini || !sp) return;
  const yes = find(sp, 'bt_yes');
  const ads = yes.cloneNode(true);
  ads.style.top = '-230px';   // under the gift button: the jar now sits on the shelf edge, so the old spot (150 px below) is over the dishes
  yes.parentElement.appendChild(ads);
  for (const n of [ads, ...ads.querySelectorAll('.ng')]) { const b = [...n.children].find(k => k.classList.contains('w')); if (b) n.box = b; }
  // The jar icon keeps the original's place (set_jar t=[60,230]) on the edge of the shelf; the shelf lets taps through to it.
  jarBubble = { jar, jini, yes, ads, shown: false };
  find(sp, 'txt_title').box.textContent = C.t('jarGift');
  find(sp, 'num_foodCount').style.display = 'none';
  find(sp, 'num_gold').style.display = 'none';
  const pay = free => () => {
    const w = works(5);
    if (!w) return;
    const g = free ? S.claimJarFree(C.game, w) : S.claimJarAds(C.game, w);
    if (g) floater(`+${B.format(g)}`, 560, 900);
    toggleJar(false);
  };
  const wire = (node, fn) => { node.classList.add('btn'); for (const b of node.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = fn; } };
  wire(yes, pay(true));
  wire(ads, pay(false));
  C.hud.bind(`${base}/anim/bt_jar`, () => toggleJar(!jarBubble.shown));
  for (const b of [yes, ads]) find(b, 'txt_adsT').style.display = 'none';
  find(yes, 'txt_reward').box.textContent = C.t('getReward');
  find(ads, 'txt_reward').box.textContent = C.t('showAds');
}
function toggleJar(on) {
  if (!jarBubble) return;
  jarBubble.shown = on;
  jarBubble.jini.style.display = on ? '' : 'none';
  if (!on) return;
  find(jarBubble.yes, 'txt_ads').box.textContent = `+${B.format(S.jarGold(C.game, 20))}`;
  find(jarBubble.ads, 'txt_ads').box.textContent = `+${B.format(S.jarGold(C.game, 1))}`;
}
function tapJar(w) {
  if (!jarBubble || w.v < 1) return false;
  toggleJar(!jarBubble.shown);
  return true;
}

// ---- search light: a balloon to shake ----
function showBalloon(w) {
  if (balloon || w.v < 1) return;
  const e = el('sp-balloon');
  e.appendChild(C.hud.sprite(UI, 'bt_balloon'));
  const n = el('', `0/${S.balloonTaps(C.game)}`, 'b');
  e.appendChild(n);
  const x = el('sp-x', '×');
  x.style.cssText = 'right:0;top:0;width:54px;height:54px;line-height:52px;font-size:44px';
  e.appendChild(x);
  balloon = { el: e, work: w, taps: 0, n, shake: 0 };
  x.onclick = ev => { ev.stopPropagation(); e.remove(); balloon = null; };
  e.onclick = () => {
    if (!balloon) return;
    balloon.taps += 1;
    balloon.shake = 0.25;
    n.textContent = `${balloon.taps}/${S.balloonTaps(C.game)}`;
    play('048_bubble pop');
    if (balloon.taps < S.balloonTaps(C.game)) return;
    const g = S.popBalloon(C.game, balloon.work);
    e.remove();
    balloon = null;
    play('040_balloon_popping');
    if (g) floater(`+${B.format(g)}`, 540, 800);
  };
  layer.appendChild(e);
}
function tapLight(w) {
  if (w.v < 1) { C.hud.toast(clock(C.game.work.get(w.a).completeTime - w.t)); return true; }
  showBalloon(w);
  return true;
}

// ---- capsule crane ----
const BALL_AT = i => [70 + (i % 4) * 115 + (Math.floor(i / 4) % 2) * 28, 340 + Math.floor(i / 4) * 85];
function openCrane(w) {
  dialog(C.t('title_build14'), (c, box) => {
    const m = el('sp-machine');
    const claw = el('sp-claw');
    const rope = el('', '', 'i'); rope.style.height = '40px';
    claw.append(rope, el('', '', 'em'));
    m.appendChild(el('sp-chute'));
    box.appendChild(m);
    const balls = [];
    const draw = () => {
      for (const b of balls) b.remove();
      balls.length = 0;
      S.craneBalls(C.game).forEach((idx, i) => {
        const b = el(`sp-ball b${idx}`);
        [b.style.left, b.style.top] = BALL_AT(i).map(v => `${v}px`);
        m.insertBefore(b, claw.parentElement ? claw : null);
        balls.push(b);
      });
    };
    m.appendChild(claw);
    draw();
    const st = { x: 320, busy: false };
    claw.style.left = `${st.x}px`;
    const info = el('sp-row');
    box.appendChild(info);
    const ctl = el('sp-row');
    const l = button('blue', '◀'), g = button('', C.hud.sprite(UI, 'bt_crane', 'gem'), '▼'), r = button('blue', '▶');
    l.style.minWidth = r.style.minWidth = '150px';
    ctl.append(l, g, r);
    box.appendChild(ctl);
    const move = d => { if (!st.busy) { st.x = Math.max(60, Math.min(580, st.x + d)); claw.style.left = `${st.x}px`; } };
    l.onclick = () => move(-60);
    r.onclick = () => move(60);
    g.onclick = () => {
      if (st.busy) return;
      if (w.v < 1) return C.hud.toast(C.t('msg_noBait', clock(C.game.work.get(w.a).completeTime - w.t)));
      const res = S.playCrane(C.game, w);
      if (!res) return C.hud.toast(C.t('msg_cantTrade'));
      st.busy = true;
      const old = BALL_AT(res.slot);
      const ball = balls[res.slot];
      ball.className = `sp-ball b${res.ball.index}`;
      let phase = 0, len = 40;
      anims.push(dt => {
        if (!cur || cur !== c) return true;
        const sp = 520 * dt;
        if (phase === 0) { st.x += Math.sign(old[0] - st.x) * Math.min(Math.abs(old[0] - st.x), sp); if (Math.abs(st.x - old[0]) < 0.5) phase = 1; }
        else if (phase === 1) { len = Math.min(old[1] - 30, len + sp); if (len >= old[1] - 30) phase = 2; }
        else if (phase === 2) { len = Math.max(40, len - sp); ball.style.top = `${len + 40}px`; if (len <= 40) phase = 3; }
        else if (phase === 3) { st.x += Math.sign(555 - st.x) * Math.min(Math.abs(555 - st.x), sp); ball.style.left = `${st.x}px`; if (Math.abs(st.x - 555) < 0.5) phase = 4; }
        else if (phase === 4) { ball.style.top = `${parseFloat(ball.style.top) + sp}px`; if (parseFloat(ball.style.top) > 570) { phase = 5; } }
        if (phase < 4) ball.style.left = phase >= 2 ? `${st.x}px` : ball.style.left;
        claw.style.left = `${st.x}px`;
        rope.style.height = `${len}px`;
        if (phase < 5) return false;
        st.busy = false;
        draw();
        play('002_Coins 2');
        showItems([res.given]);
        return true;
      });
    };
    c.refresh = () => {
      info.textContent = '';
      info.appendChild(C.hud.sprite(UI, 'craneCoin', 'gem'));
      info.appendChild(el('', `${w.v} / ${C.game.work.get(w.a).maxValue}`, 'span'));
      if (w.v < 1) info.appendChild(el('sp-note', clock(C.game.work.get(w.a).completeTime - w.t)));
      g.classList.toggle('off', w.v < 1 || st.busy);
    };
    c.tick = c.refresh;
    c.refresh();
  });
}

// ---- basketball: tap to throw, the hoop sweeps; Init[48] s ready, Init[49] s of play, Init[50] points a goal ----
function openBasket(w) {
  dialog(C.t('title_build97'), (c, box) => {
    const rules = S.basketRules(C.game);
    const court = el('sp-court');
    const hud = el('sp-hud');
    const score = el('', '0', 'span'), time = el('', String(rules.time), 'span');
    hud.append(score, time);
    const hoop = el('sp-hoop');
    const ball = el('sp-bball');
    ball.appendChild(C.hud.sprite(UI, 'icon_basketball'));
    const say = el('sp-say', C.t('guide_basketball0'));
    court.append(hud, hoop, ball, say);
    box.appendChild(court);
    const start = button('', C.t('guide_basketball0').replace(/[!.]$/, ''), el('', `${w.v} / ${C.game.work.get(w.a).maxValue}`, 'small'));
    box.appendChild(start);
    const st = { phase: 'idle', t: 0, goals: 0, shot: null, hx: 320 };
    window.__sp = { basket: st };
    const BX = 320, BY = 640;
    ball.style.left = `${BX}px`; ball.style.top = `${BY}px`;
    hoop.style.left = '320px';
    start.onclick = () => {
      if (st.phase !== 'idle') return;
      if (!S.startBasket(C.game, w)) return C.hud.toast(clock(C.game.work.get(w.a).completeTime - w.t));
      st.phase = 'ready'; st.t = rules.ready; st.goals = 0;
      start.style.display = 'none';
      say.textContent = C.t('guide_basketball1');
    };
    court.onpointerdown = () => {
      if (st.phase !== 'play' || st.shot) return;
      st.shot = { t: 0, hit: Math.abs(st.hx - BX) < 90 };   // judged at the throw; the 0.2 s flight only shows it
      play('SFX_Pop_Mouth_Med_1');
    };
    anims.push(dt => {
      if (cur !== c) { if (st.phase === 'ready' || st.phase === 'play') S.finishBasket(C.game, w, st.goals); return true; }
      st.clock = (st.clock || 0) + dt;
      st.hx = 320 + 230 * Math.sin(st.clock * 1.3);
      hoop.style.left = `${st.hx}px`;
      hoop.dataset.x = String(Math.round(st.hx));
      if (st.phase === 'ready') {
        st.t -= dt;
        say.textContent = st.t > 0 ? String(Math.ceil(st.t)) : '';
        if (st.t <= 0) { st.phase = 'play'; st.t = rules.time; say.textContent = ''; }
      } else if (st.phase === 'play') {
        st.t -= dt;
        time.textContent = String(Math.max(0, Math.ceil(st.t)));
        if (st.shot) {
          st.shot.t += dt;
          const k = Math.min(1, st.shot.t / 0.2);
          ball.style.top = `${BY - (BY - 150) * k}px`;
          ball.style.transform = `scale(${1 - 0.3 * k})`;
          if (k >= 1) {
            if (st.shot.hit) { st.goals += 1; score.textContent = String(st.goals * rules.perGoal); play('002_Coins 2'); floater(`+${rules.perGoal}`, 540, 760); }
            st.shot = null;
            ball.style.top = `${BY}px`; ball.style.transform = '';
          }
        }
        if (st.t <= 0) {
          st.phase = 'done';
          const res = S.finishBasket(C.game, w, st.goals);
          say.textContent = `${res.points}`;
          if (res.given.length) showItems(res.given); else C.hud.toast(C.t('msg_noBasketballScore'));
          setTimeout(() => { if (cur === c) close(); }, 300);
        }
      }
      return false;
    });
    c.tick = c.refresh = () => { start.lastChild.textContent = `${w.v} / ${C.game.work.get(w.a).maxValue}`; start.classList.toggle('off', w.v < 1); };
    c.refresh();
  });
}

// ---- elephant trader ----
function slotView(slot, i, c) {
  const d = el(`sp-slot${slot ? '' : ' gap'}`);
  if (!slot) return d;
  const r = { type: slot.type, value: slot.value, equip: slot.value };
  const info = describe(r);
  d.appendChild(iconOf(info));
  d.appendChild(el('nm', info.name && slot.type !== 5 ? info.name : info.text.replace(/^\+/, '')));
  const pr = el('pr');
  pr.appendChild(slot.costType === 3 ? gem() : C.hud.sprite(UI, 'icon_coin_s', 'gem'));
  pr.appendChild(el('', String(slot.cost), 'span'));
  d.appendChild(pr);
  if (slot.bought) d.classList.add('sold');
  else if (C.game.state[slot.costType === 3 ? 'gem' : 'coin'] < slot.cost) d.classList.add('off');
  d.onclick = () => {
    const res = S.buyTrader(C.game, i);
    if (!res) return C.hud.toast(C.t('msg_cantTrade'));
    if (res.short) return C.hud.toast(C.t('msg_shortGem'));
    c.refresh();
    showItems([res.given]);
  };
  return d;
}
function openTrader() {
  dialog(C.t('tradingPost'), (c, box) => {
    const head = el('sp-note');
    const grid = el('sp-grid');
    const tix = el('sp-tickets');
    box.append(head, grid, tix);
    const draw = () => {
      const win = S.traderWindow(C.game);
      grid.textContent = ''; tix.textContent = '';
      if (!win.open) {
        head.textContent = `${C.t('facilityGuide_tradingPost2')}  ${new Date(win.next).toTimeString().slice(0, 5)}`;
      } else {
        head.textContent = `${C.t('time_tradeTimeFinish')}  ${clock(win.left)}`;
        S.traderStock(C.game).forEach((s, i) => { if (s) grid.appendChild(slotView(s, i, c)); });
      }
      for (const [type, n] of Object.entries(C.game.state.specials.tickets)) {
        if (!(n > 0)) continue;
        const d = describe({ type: Number(type), value: 1 });
        const b = button('blue', iconOf(d, 'gem'), `${C.t('useTicket')} x${n}`);
        b.onclick = () => { const r = S.useTicket(C.game, Number(type)); if (r) showItems([r]); c.refresh(); };
        tix.appendChild(b);
      }
    };
    c.refresh = draw;
    let shown = null;
    c.tick = () => {
      const win = S.traderWindow(C.game);
      if (shown !== (win.open ? win.id : 'closed')) { shown = win.open ? win.id : 'closed'; draw(); } else if (win.open) head.textContent = `${C.t('time_tradeTimeFinish')}  ${clock(win.left)}`;
    };
    draw();
  });
}
function tapTrader() { openTrader(); return true; }

// ---- music player ----
function bgmAudio(row) {
  const key = Object.keys(C.sound.list).find(k => k.endsWith(row.resName));
  return key && C.sound.url(key);
}
function playBgm(row) {
  const url = bgmAudio(row);
  if (!url) return false;
  if (C.sound.music) C.sound.music.pause();
  const a = new Audio(url);
  a.loop = true;
  a.volume = 0.35;
  C.sound.music = a;
  if (C.sound.on) a.play().catch(() => {});
  return true;
}
function openMusic() {
  dialog(C.t('bgm'), (c, box) => {
    const tabs = el('sp-tabs');
    const list = el('sp-list');
    let tab = 0;
    ['musicPlayer_tap1', 'buy'].forEach((k, i) => { const d = el('', C.t(k)); d.onclick = () => { tab = i; c.refresh(); }; tabs.appendChild(d); });
    box.append(tabs, list);
    c.refresh = () => {
      const sp = C.game.state.specials;
      [...tabs.children].forEach((d, i) => d.classList.toggle('on', i === tab));
      list.textContent = '';
      for (const row of C.game.data.specials.bgm) {
        const owned = sp.bgmOwned.includes(row.index);
        if (tab === 0 ? !owned : owned || row.cost === 0) continue;
        const it = el(`sp-item${sp.bgm === row.index ? ' on' : ''}`);
        it.appendChild(C.hud.sprite(UI, 'icon_music', 'gem'));
        it.appendChild(el('txt', C.t(`bgmName_${row.index}`) === `bgmName_${row.index}` ? row.resName : C.t(`bgmName_${row.index}`)));
        const b = tab === 0 ? button('blue', sp.bgm === row.index ? '♪' : '▶') : button(C.game.state[row.costType === 3 ? 'gem' : 'coin'] >= row.cost ? '' : 'off', cost(row.cost, row.costType === 3 ? 'gem' : 'coin'));
        b.onclick = () => {
          if (tab === 0) { S.selectBgm(C.game, row.index); playBgm(row); }
          else { const r = S.buyBgm(C.game, row.index); if (r && r.short) C.hud.toast(C.t(r.short === 'gem' ? 'msg_shortGem' : 'msg_shortCoin')); }
          c.refresh();
        };
        it.appendChild(b);
        list.appendChild(it);
      }
    };
    c.refresh();
  });
}

// ---- special order board ----
function openBoard(w) {
  dialog(C.t('specialOrder'), (c, box) => {
    const holder = el('sp-order');
    const root = C.ng.build(panels.order.roots[0]);
    root.style.left = '300px'; root.style.top = '350px';
    holder.appendChild(root);
    box.appendChild(holder);
    const claim = button('', C.t('getReward'));
    box.appendChild(claim);
    claim.onclick = () => {
      const g = S.claimOrder(C.game, w);
      if (!g) return;
      play('006_Notification sound 15');
      floater(`+${B.format(g)}`, 540, 800);
      c.refresh();
    };
    find(root, 'txt_title').box.textContent = C.t('specialOrder');
    find(root, 'txt_reward').box.textContent = C.t('missionReward');
    c.refresh = () => {
      const o = C.game.state.specials.order;
      const food = C.game.food.get(o.food);
      const spr = find(root, 'icon_food/spr_food');
      if (food && spr.dataset.f !== String(food.index)) { spr.dataset.f = String(food.index); spr.box.style.backgroundImage = ''; C.ng.paint(spr.box, 'atlas_food_atlas', food.resName, false); }
      find(root, 'icon_food/spr_dish').style.display = 'none';
      const name = food ? C.t(`name_${food.resName}`) : '';
      find(root, 'txt_info').box.textContent = C.t('msg_specialOrder1', name, o.need);
      find(root, 'num_prograss').box.textContent = `${o.have} / ${o.need}`;
      const gauge = find(root, 'set_progress/gauge').box;
      gauge.style.width = `${140 * (o.need ? Math.min(1, o.have / o.need) : 0)}px`;
      find(root, 'num_reward').box.textContent = `+${B.format(S.orderGold(C.game))}`;
      claim.classList.toggle('off', !S.orderDone(C.game));
    };
    c.tick = c.refresh;
    c.refresh();
  });
}

const TAP = { 3: openChest, 5: tapJar, 8: openBoard, 12: tapLight, 14: openCrane, 87: tapTrader, 90: openMusic, 97: openBasket };

// ---- HUD buttons: balloon ready, elephant open ----
let hudBalloon = null;
function setupHud() {
  hudBalloon = el('sp-hudbtn');
  hudBalloon.style.left = '24px'; hudBalloon.style.top = '1010px';
  hudBalloon.appendChild(C.hud.sprite(UI, 'bt_balloon'));
  hudBalloon.onclick = () => { const w = works(12); if (w) showBalloon(w); };
  hudBalloon.style.display = 'none';
  layer.appendChild(hudBalloon);
  const tr = find(C.root, 'mainUI/set_bottom/set_trader');
  tr.style.top = `${parseFloat(tr.style.top) - 200}px`;
  tr.style.left = `${parseFloat(tr.style.left) - 260}px`;
  C.hud.bind('mainUI/set_bottom/set_trader/anim/bt_trader', () => tapTrader());
  return tr;
}
let traderNode = null;

export default {
  id: 'specials',
  async mount(ctx) {
    ctx.css('css/specials.css');
    const [showitem, order] = await Promise.all([ctx.panel('popup_showitem'), ctx.panel('set_specialorder')]);
    panels = { showitem, order };
    C = ctx;
    layer = ctx.hud.el;
    traderNode = setupHud();
    setupJar();
    window.__specials = { open: w => TAP[w.a] && TAP[w.a](w), close, describe, reset() { close(); if (balloon) { balloon.el.remove(); balloon = null; } } };
    const sp = ctx.game.state.specials;
    const row = ctx.game.data.specials.bgm.find(b => b.index === sp.bgm);
    if (row && sp.bgm !== 1 && bgmAudio(row)) addEventListener('pointerdown', () => playBgm(row), { once: true });
  },
  onTap(w) { const f = TAP[w.a]; return !!f && f(w) !== false; },
  update(dt) {
    if (!C) return;
    for (let i = anims.length - 1; i >= 0; i--) if (anims[i](dt)) anims.splice(i, 1);
    if (balloon) {
      balloon.shake = Math.max(0, balloon.shake - dt);
      balloon.el.style.transform = `rotate(${Math.sin(balloon.shake * 60) * balloon.shake * 40}deg) translateY(${Math.sin(performance.now() / 500) * 8}px)`;
      if (!C.game.state.works.includes(balloon.work) || balloon.work.v < 1) { balloon.el.remove(); balloon = null; }
    }
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const g = C.game;
    if (cur && cur.tick) cur.tick();
    const jar = works(5), light = works(12), trader = works(87);
    if (jarBubble) {
      const ready = !!jar && jar.v >= 1;
      jarBubble.jar.style.display = ready ? '' : 'none';
      if (!ready && jarBubble.shown) toggleJar(false);
    }
    hudBalloon.style.display = light && light.v >= 1 && !balloon ? '' : 'none';
    if (traderNode) traderNode.style.display = trader && S.traderWindow(g).open && S.traderStock(g).some(s => s && !s.bought) ? '' : 'none';
  },
  onEvent() {},
};
