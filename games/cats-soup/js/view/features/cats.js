// Feature "cats" (view part): cat list, cat info, hearts, skills, swapping and the cat gift window.
// Contract: js/view/registry.js. Rules: D:/catsoup-ref/rules/cats-full.md. Panels are DOM drawn with the game's own
// atlas sprites and strings (layouts of ui/unit/set_units, set_unitinfo, set_heartinfo, set_skillinfo, set_unitgift).
import * as B from '../../sim/big.js';
import { find } from '../ngui.js';

const FOOD = 'atlas_food_atlas', UI1 = 'atlas_ui1_atlas';
const BOX_ART = ['giftbox', 'giftbox02', 'giftbox03'];
const GIFT_ICON = { 3: '💎', 4: '🪙', 1: '💰', 2: '⚡' };

export default {
  id: 'cats',
  mount(ctx) {
    const { game, hud, ng, root } = ctx;
    const C = game.feat.cats;
    ctx.css('css/cats.css');
    const t = (k, ...a) => ctx.t(k, ...a);
    let pop = null, refresh = null;

    // ---- small builders ----
    const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
    const spr = (atlas, name, h, cls = '') => {
      const d = hud.sprite(atlas, name, cls);
      const i = ng.spriteInfo(atlas, name);
      if (i) { d.style.width = `${Math.round(i[2] * h / i[3])}px`; d.style.height = `${h}px`; } else { d.style.width = d.style.height = `${h}px`; }
      return d;
    };
    const catName = cat => t(`catType${cat.type}`);
    const catIcon = (cat, h) => spr(FOOD, `cat${cat.type}`, h, 'cs-cat');
    const workOf = cat => game.state.works.find(w => w.id === cat.work);
    const skillIcon = (ab, lv, h = 84) => {
      const d = el('cs-skill');
      d.style.width = d.style.height = `${h}px`;
      d.appendChild(spr(FOOD, `skill${ab.index}`, h * 0.72, 'ic'));
      if (ab.type === 101) d.appendChild(el('lv', '★'.repeat(lv)));
      return d;
    };
    const mainText = s => t('ability101', t(`title_build${s.ability.subIndex}`), `+${C.abilityValue(game, s.ability, s.lv)}%`);
    const subText = s => t(`abilityS_${s.ability.subIndex}`, `+${s.value}%`);
    const gauge = (cat, label = true) => {
      const x = game.state.cats_ext.byId[cat.id];
      const h = C.heartInfo(game, x.exp);
      const g = el('cs-heart');
      g.appendChild(spr(UI1, 'icon_heart_s', 40));
      const bar = el('bar');
      const fill = el('fill');
      fill.style.width = h.need ? `${Math.round(h.into / h.need * 100)}%` : '100%';
      bar.appendChild(fill);
      if (label) bar.appendChild(el('lbl', `Lv.${h.level}${h.need ? `  ${h.into}/${h.need}` : '  MAX'}`));
      g.appendChild(bar);
      return g;
    };

    // ---- popups ----
    const closePop = () => { if (pop) pop.remove(); pop = null; refresh = null; };
    const openPop = (title, build, cls = '', back = null) => {
      closePop();
      pop = el(`cs-pop ${cls}`);
      const box = el('box');
      box.appendChild(el('ttl', title));
      const x = el('x', '×');
      x.onclick = () => { closePop(); if (cls.includes('gift')) C.closeGift(game); if (back) back(); };
      box.appendChild(x);
      const body = el('body');
      box.appendChild(body);
      pop.appendChild(box);
      hud.el.appendChild(pop);
      const draw = () => { body.textContent = ''; build(body); };
      refresh = draw;
      draw();
    };

    // Heart info (ui/unit/set_heartinfo): current and next level bonuses.
    const foods = [0, 1, 2].map(i => t(`foodType${i}`)).join('/');
    const heartLines = row => [
      t('info_moreGrade', foods, row.materialUp), t('info_morePrice', foods, row.priceUp),
      t('info_moreEnergy', row.energyUp), t('info_moreCritical', row.criticalUp),
    ];
    const openHeart = cat => openPop(t('happiness'), body => {
      const x = game.state.cats_ext.byId[cat.id];
      const lv = C.heartInfo(game, x.exp).level;
      body.appendChild(el('note', t('miniroom_heart_info')));
      body.appendChild(gauge(cat));
      const col = (title, row) => {
        const c = el('hcol');
        c.appendChild(el('h', `${title}  Lv.${row.level}`));
        for (const l of heartLines(row)) c.appendChild(el('li', l));
        return c;
      };
      body.appendChild(col(t('current'), game.t.UnitHeart[lv - 1]));
      if (lv < game.t.UnitHeart.length) body.appendChild(col(t('next'), game.t.UnitHeart[lv]));
      else body.appendChild(el('note', t('msg_maxLv')));
    }, 'heart', () => openInfo(cat));

    // Skill info (ui/unit/set_skillinfo).
    const openSkill = (cat, main) => openPop(t('skillInfo'), body => {
      const s = main ? C.mainSkill(game, cat) : C.subSkill(game, cat);
      if (!s) return;
      const head = el('skhead');
      head.appendChild(skillIcon(s.ability, s.lv, 110));
      head.appendChild(el('txt', main ? mainText(s) : subText(s)));
      body.appendChild(head);
      if (main) {
        const w = workOf(cat);
        const ok = C.skillMatch(game, cat, w);
        const box = el('active');
        box.appendChild(el('note', t('msg_skillMatch')));
        const row = el('wrow');
        if (w) { row.appendChild(spr('atlas_build_atlas', `build${w.a}`, 80)); row.appendChild(el('', t(`title_build${w.a}`))); }
        row.appendChild(el(`mark ${ok ? 'ok' : 'no'}`, ok ? '✔' : '✘'));
        box.appendChild(row);
        const b = el('btn blue', t('gotoSwitch'));
        b.onclick = () => openSwap(cat);
        box.appendChild(b);
        body.appendChild(box);
      }
    }, 'skill', () => openInfo(cat));

    // Swap (ui/unit/set_units, set_catswap): choose the cat to trade facilities with.
    const openSwap = cat => openPop(t('title_switchCat'), body => {
      body.appendChild(el('note', t('info_switchCat')));
      const list = el('swaplist');
      for (const o of game.state.cats) {
        if (o === cat) continue;
        const w = workOf(o);
        const row = el('crow');
        row.appendChild(catIcon(o, 90));
        const txt = el('txt');
        txt.appendChild(el('b', catName(o)));
        txt.appendChild(el('small', w ? t(`title_build${w.a}`) : ''));
        row.appendChild(txt);
        const m = C.mainSkill(game, o);
        row.appendChild(skillIcon(m.ability, m.lv, 70));
        row.onclick = () => { C.swap(game, cat, o); hud.toast(t('cat_swap_applying')); openInfo(cat); if (hud.panel) hud.panel.refresh(); };
        list.appendChild(row);
      }
      body.appendChild(list);
    }, 'swap', () => openInfo(cat));

    // Cat info (ui/unit/set_unitinfo).
    const openInfo = cat => openPop(catName(cat), body => {
      const w = workOf(cat);
      const top = el('portrait');
      top.appendChild(catIcon(cat, 260));
      body.appendChild(top);
      body.appendChild(el('note', t(`catType_summon${cat.type}`)));
      const hv = gauge(cat);
      hv.onclick = () => openHeart(cat);
      hv.classList.add('tap');
      body.appendChild(hv);
      const sk = el('skills');
      const m = C.mainSkill(game, cat);
      const mi = skillIcon(m.ability, m.lv);
      mi.onclick = () => openSkill(cat, true);
      sk.appendChild(mi);
      const sub = C.subSkill(game, cat);
      if (sub) { const si = skillIcon(sub.ability, 1); si.onclick = () => openSkill(cat, false); sk.appendChild(si); }
      const stext = el('txt');
      stext.appendChild(el('', mainText(m)));
      if (sub) stext.appendChild(el('', subText(sub)));
      sk.appendChild(stext);
      body.appendChild(sk);
      if (w) {
        const wr = el('wrow');
        wr.appendChild(spr('atlas_build_atlas', `build${w.a}`, 80));
        wr.appendChild(el('', t(`title_build${w.a}`)));
        const ok = C.skillMatch(game, cat, w);
        wr.appendChild(el(`mark ${ok ? 'ok' : 'no'}`, ok ? '✔' : '✘'));
        body.appendChild(wr);
      }
      const bar = el('btns');
      const bs = el('btn blue', t('title_switchCat'));
      bs.onclick = () => openSwap(cat);
      bar.appendChild(bs);
      const be = el('btn green', t('equipment'));
      be.onclick = async () => {
        const m2 = (await import('./equip.js')).default;
        if (m2.openFor) { closePop(); hud.close(); m2.openFor(cat); } else hud.toast(t('equipment'));
      };
      bar.appendChild(be);
      body.appendChild(bar);
    }, 'info');

    // Cat list (ui/unit/set_units): one row per cat, tap for the info window, "move all" at the top.
    const openList = () => hud.open(t('cat'), '', [{ title: `${t('cat')} ${game.state.cats.length}` }], list => {
      const head = el('row head');
      const hb = el('btn blue', t('swap_allcat'));
      hb.onclick = () => { const n = C.bestFit(game); hud.toast(t('swap_allcat_done')); if (n && hud.panel) hud.panel.refresh(); };
      head.appendChild(el('txt', t('swap_allcat_info')));
      head.appendChild(hb);
      list.appendChild(head);
      for (const cat of game.state.cats) {
        const w = workOf(cat);
        const row = el('row crow');
        row.appendChild(catIcon(cat, 110));
        const txt = el('txt');
        txt.appendChild(el('b', catName(cat)));
        txt.appendChild(gauge(cat, false));
        txt.appendChild(el('small', `Lv.${C.heartLevel(game, cat)}`));
        row.appendChild(txt);
        const m = C.mainSkill(game, cat);
        row.appendChild(skillIcon(m.ability, m.lv, 76));
        const sub = C.subSkill(game, cat);
        if (sub) row.appendChild(skillIcon(sub.ability, 1, 76));
        if (w) {
          const wi = el('wk');
          wi.appendChild(spr('atlas_build_atlas', `build${w.a}`, 80));
          wi.appendChild(el(`mark ${C.skillMatch(game, cat, w) ? 'ok' : 'no'}`, C.skillMatch(game, cat, w) ? '✔' : ''));
          row.appendChild(wi);
        }
        row.onclick = () => openInfo(cat);
        list.appendChild(row);
      }
    });

    // Gift window (ui/unit/set_unitgift).
    const rewardText = out => {
      if (!out) return '';
      const v = typeof out.value === 'object' ? B.format(out.value) : String(out.value);
      return `${GIFT_ICON[out.type] || '🎁'} ${v}`;
    };
    const openGift = () => {
      const boxes = C.openGift(game);
      if (!boxes) return;
      const shown = boxes.map(() => null);
      openPop(t('gift'), body => {
        const taken = boxes.some(b => b.got);
        body.appendChild(el('note', taken && !boxes.every(x => x.got) ? t('msg_ads_unitGift') : taken ? '' : t('msg_selectGift')));
        const row = el('boxes');
        boxes.forEach((b, i) => {
          const d = el(`gbox ${b.got ? 'open' : ''}`);
          if (b.got) d.appendChild(el('rw', shown[i] || '🎁'));
          else d.appendChild(spr('atlas_furniture2_atlas', BOX_ART[i % BOX_ART.length], 150));
          d.onclick = () => {
            if (b.got || taken) return;
            const out = C.pickBox(game, i);
            if (out) { shown[i] = rewardText(out); hud.toast(shown[i]); refresh(); }
          };
          row.appendChild(d);
        });
        body.appendChild(row);
        if (taken && boxes.every(x => x.got)) {
          const done = el('btn blue', 'OK');
          done.onclick = () => { C.closeGift(game); closePop(); };
          body.appendChild(done);
        } else if (taken) {
          const ad = el('btn green', `${t('getAll')}  ▶ ${t('showAds')}`);
          ad.onclick = () => {
            const before = boxes.map(x => x.got);
            const outs = C.claimRest(game);
            let k = 0;
            before.forEach((got, i) => { if (!got) shown[i] = rewardText(outs[k++]); });
            refresh();
          };
          body.appendChild(ad);
        }
      }, 'gift');
    };

    // ---- HUD slots ----
    // The HUD profile slot opens the player profile (UI_Stage.UIOn_UserProfile, profile feature); the roster is in the quick menu.
    hud.addMenu({ sec: 'cat', key: 'title_cats', sprite: 'icon_cat', run: () => openList() });
    hud.bind('mainUI/set_bottomRight/rightBottomSide/bt_unitGift', () => openGift());
    const giftBtn = find(root, 'mainUI/set_bottomRight/rightBottomSide/bt_unitGift');
    const face = find(root, 'mainUI/set_topLeft/set_cat/set_userProfileSlot/imagePrimary');
    let faceKey = '';
    this.sync = () => {
      if (giftBtn) giftBtn.style.display = C.giftReady(game) ? '' : 'none';
      const c = game.state.cats[0];
      if (face && face.box && c && faceKey !== `${c.type}`) { faceKey = `${c.type}`; ng.paint(face.box, FOOD, `cat${c.type}`, false); }
    };
    this.sync();
    this.update = () => {
      this.sync();
    };
    this.onEvent = e => {
      if (e.type === 'heartLevel') hud.toast(`♥ ${catName(e.cat)}  Lv.${e.level}`);
    };
    ctx.cats = { openList, openInfo, openGift };
    window.__catsView = ctx.cats;
  },
  update(dt) { this.update && this.update(dt); },
  onEvent(e) { this.onEvent && this.onEvent(e); },
};
