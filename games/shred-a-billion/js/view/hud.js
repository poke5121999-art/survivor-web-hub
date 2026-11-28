// DOM HUD laid out like the original (clips/ANALYSIS.md "HUD"): vault counter pill top-centre, cash + level top-right,
// boosts/objective top-left, hotbar bottom-left, bag pill bottom-centre, UPGRADES/PROFICIENCIES bottom-right.
import { T } from '../sim/i18n.js';
import { Num } from '../sim/economy.js';

const UI = './art/ui/';
const TOOL_ICONS = ['hand', 'bucket', 'shovel', 'vacuum', 'drone'];
// ability tiles (mb:HudAbilitySlot): accent per move, wipe = left/total, seconds text, refusal shake 0.28 s
const ACCENT = ['255,179,46', '154,217,60', '255,94,74', '60,200,255', '255,116,184'];
const SIDE_KEY = ['armful', 'heave', 'ground_pound', 'twister', 'rally'];
const BOOST_ICON = { 0: 'boost_money', 1: 'boost_speed', 2: 'boost_auto', 3: 'boost_flight', 4: 'boost_magnet', 5: 'boost_golden', 6: 'boost_bag', 7: 'boost_timewarp', 8: 'boost_frenzy' };
const BOOST_KEY = { 0: 'hud.boost.money', 1: 'hud.boost.speed', 2: 'hud.boost.auto', 3: 'hud.boost.flight', 4: 'hud.boost.magnet', 5: 'hud.boost.golden', 6: 'hud.boost.bag', 7: 'hud.boost.timewarp', 8: 'hud.boost.frenzy' };

export class Hud {
  constructor(root, actions) {
    this.root = root; this.actions = actions;
    root.innerHTML = `
      <div id="vaultPill"><img src="${UI}icon_bill.webp" alt=""><span id="vaultN">1.000.000.000</span></div>
      <div id="moneyBox"><div id="money">$0</div><div id="lvlRow"><span id="lvl">LVL 1</span><div id="xpBar"><div id="xpFill"></div></div></div></div>
      <div id="leftCol">
      <div id="objective" class="hidden"><img src="${UI}hand.webp" alt=""><span id="objT"></span><span class="prog" id="objP"></span><span class="segs" id="objS"></span></div>
      <div id="sideCard" class="hidden"><span id="sideT"></span><span class="prog" id="sideP"></span><div class="sub" id="sideS"></div></div>
      <div id="boosts"></div>
      <div id="keyChip" class="hidden"><img src="${UI}icon_key.webp" alt=""><div><div class="h" data-t="hud.key_title"></div><div class="d" data-t="hud.key_hint"></div></div></div>
      </div>
      <div id="radioLine" class="hidden"><img src="${UI}thief_sly.webp" alt=""><div><div class="n"></div><div class="t"></div></div></div>
      <div id="topCol"><div id="runTimer" class="hidden"><img src="${UI}clock.webp" alt=""><span></span></div><div id="evRow" class="hidden"><img alt=""><span class="l"></span><span class="tm"></span><i class="bar"><b></b></i></div><div id="toasts"></div>
      <div id="achCard" class="hidden"><div class="cnt"></div><div class="card"><div class="ic"><img alt=""></div><div><div class="h"></div><div class="d"></div></div></div></div></div>
      <div id="bigCard" class="hidden"><div class="h"></div><div class="d"></div><div class="c"></div></div>
      <div id="hotbar"></div>
      <div id="jetBar" class="hidden"><div class="fill"></div></div>
      <div id="bagPill" class="hidden"><span id="pumpRing" class="hidden"></span><img src="${UI}bag.webp" style="height:1.3em" alt=""><div class="bar"><div class="fill"></div></div><span id="bagT"></span></div>
      <div id="hudBtns">
        <button class="hbtn on" id="btnUp"><span class="key">TAB</span><span data-t="menu.tab.upgrades"></span><span class="dot hidden" id="upDot"></span></button>
        <button class="hbtn on" id="btnProf"><span class="key">P</span><span data-t="menu.tab.proficiencies"></span><span class="dot hidden" id="profDot"></span></button>
        <button class="hbtn on" id="btnPause">II</button>
      </div>
      <img id="cross" src="${UI}crosshair.webp" alt="">
      <div id="prompt" class="hidden"></div>
      <div id="pops"></div>
      <div id="touch" class="hidden">
        <div id="stickBase" class="hidden"></div><div id="stickKnob" class="hidden"></div>
        <div class="tb" id="tPrimary"><img src="${UI}hand.webp" alt=""></div>
        <div class="tb" id="tJump"><svg viewBox="0 0 24 24" width="55%" height="55%"><path d="M12 4l8 9h-5v7H9v-7H4z" fill="#fff"/></svg></div>
        <div class="tb" id="tInteract"><img src="${UI}icon_bill.webp" alt=""></div>
        <div class="tb hidden" id="tSecondary"><img src="${UI}sparkle.webp" alt=""></div>
        <div class="tb" id="tSprint"><img src="${UI}boot.webp" alt=""></div>
      </div>`;
    this.$ = (id) => root.querySelector('#' + id) || document.getElementById(id);
    // toasts, the event row and achievement cards live above the menus too (f18 shows the card over the shop)
    { const tc = root.querySelector('#topCol'); if (tc) { document.body.appendChild(tc); tc.style.zIndex = 30; tc.style.position = 'fixed'; } }
    const hb = this.$('hotbar');
    this.slots = TOOL_ICONS.map((ic, i) => {
      const s = document.createElement('div'); s.className = 'slot on';
      s.innerHTML = `<i class="wipe"></i><span class="k">${i + 1}</span><img class="ic" src="${UI}${ic}.webp" alt=""><img class="lk hidden" src="${UI}lock.webp" alt=""><span class="cd"></span>`;
      s.style.setProperty('--acc', ACCENT[i]); if (i === 4) s.classList.add('rally', 'hidden');
      s.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (i === 4) actions.rally(); else actions.tool(i); });
      hb.appendChild(s); return s;
    });
    this.$('btnUp').addEventListener('click', () => actions.open('upgrades'));
    this.$('btnProf').addEventListener('click', () => actions.open('proficiencies'));
    this.$('btnPause').addEventListener('click', () => actions.pause());
    this.translate();
    this.last = {};
    this.toastQ = [];
  }
  translate() { this.root.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); }); }

  bindTouch(input) {
    this.$('touch').classList.remove('hidden');
    const bind = (id, name) => {
      const el = this.$(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); input.touchButton(name, true); }, { passive: false });
      const up = (e) => { e.preventDefault(); input.touchButton(name, false); };
      el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up, { passive: false });
    };
    bind('tPrimary', 'primary'); bind('tSecondary', 'secondary'); bind('tJump', 'jump'); bind('tInteract', 'interact');
    const sp = this.$('tSprint');
    sp.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); input.touch.sprint = !input.touch.sprint; sp.style.background = input.touch.sprint ? 'rgba(249,197,47,0.6)' : ''; }, { passive: false });
    const base = this.$('stickBase'), knob = this.$('stickKnob');
    input.onStick = (on, x, y, dx = 0, dy = 0) => {
      base.classList.toggle('hidden', !on); knob.classList.toggle('hidden', !on);
      if (!on) return;
      base.style.left = x + 'px'; base.style.top = y + 'px';
      knob.style.left = (x + dx * 50) + 'px'; knob.style.top = (y + dy * 50) + 'px';
    };
  }

  set(id, prop, v) { const k = id + prop; if (this.last[k] === v) return; this.last[k] = v; const el = this.$(id); if (prop === 'text') el.textContent = v; else el.style[prop] = v; }

  update(game, frame) {
    const e = game.econ;
    this.set('vaultN', 'text', Num.dotted(game.vaultLeft()));
    this.set('money', 'text', Num.money(e.dollars));
    this.set('lvl', 'text', T('hud.level_short', e.level));
    this.set('xpFill', 'width', Math.min(100, e.xp / e.xpFor(e.level) * 100).toFixed(1) + '%');
    for (let i = 0; i < 4; i++) {
      const s = this.slots[i], un = game.unlocked(i);
      s.classList.toggle('sel', game.tool === i); s.classList.toggle('locked', !un);
      s.querySelector('.lk').classList.toggle('hidden', un);
    }
    // bag pill while a bag tool is held; with bare hands it counts handfuls once something is held (f08: "6/6")
    const bagTool = game.tool !== 0, held = game.handHeld();
    const show = bagTool || held > 0;
    this.$('bagPill').classList.toggle('hidden', !show);
    if (show) {
      const cap = bagTool ? game.bagCapacity() : game.handCap(1), u = bagTool ? game.bagUnits() : held;
      this.set('bagT', 'text', bagTool ? `${Num.short(u)} / ${Num.short(cap)}` : `${u} / ${cap}`);
      const ic = this.$('bagPill').querySelector('img'), src = UI + (bagTool ? 'bag' : 'hand') + '.webp';
      if (!ic.src.endsWith(src.slice(1))) ic.src = src;
      this.$('bagPill').querySelector('.fill').style.width = Math.min(100, u / cap * 100).toFixed(1) + '%';
      this.$('bagPill').classList.toggle('full', bagTool && game.bagFree() < 1);
      this.$('bagPill').classList.toggle('hand', !bagTool);
    }
    // affordable upgrades / unspent points
    if (frame % 15 === 0) {
      let n = 0; for (const u of game.data.content.upgrades) if (e.isVisible(u.id) && !e.isMaxed(u.id) && e.cost(u.id) <= e.dollars) n++;
      this.$('upDot').classList.toggle('hidden', n === 0); this.$('upDot').textContent = n;
      this.$('profDot').classList.toggle('hidden', e.points <= 0); this.$('profDot').textContent = e.points;
      // boosts
      const bb = this.$('boosts');
      const html = e.boosts.filter(b => b.remaining > 0).map(b => `<div class="b"><img src="${UI}${BOOST_ICON[b.kind]}.webp" alt="">${T(BOOST_KEY[b.kind], Num.short(b.power || 2))} <span style="color:#f9c52f">${Num.time(b.remaining)}</span></div>`).join('');
      if (bb._h !== html) { bb.innerHTML = html; bb._h = html; }
    }
    this.$('tPrimary').querySelector('img').src = `${UI}${TOOL_ICONS[game.tool]}.webp`;
  }
  // jet fuel bar (HudJetFuel colours; show/hide timing UNKNOWN: shown while thrusting or refuelling, 0.6 s linger)
  jet(player, owned, dt) {
    const el = this.$('jetBar');
    const f = player.fuelMax > 0 ? player.fuel / player.fuelMax : 1, active = owned && (player.thrusting || f < 0.999);
    this.jetLinger = active ? 0.6 : Math.max(0, (this.jetLinger || 0) - dt);
    el.classList.toggle('hidden', !(owned && (active || this.jetLinger > 0)));
    const c = f <= 0.001 ? 'rgb(240,77,77)' : f < 0.25 ? 'rgb(255,138,61)' : player.thrusting ? 'rgb(82,196,255)' : 'rgb(166,227,255)';
    const fill = el.firstChild; fill.style.width = (f * 100).toFixed(1) + '%'; fill.style.background = c;
  }
  // auto-pump ring on the bag card (HudBag.UpdatePump): fill in 1/64 steps, white -> green when ready
  pump(game, dt) {
    const el = this.$('pumpRing'), on = game.pump.time > 0;
    el.classList.toggle('hidden', !on); if (!on) return;
    const fill = Math.round(game.pump.charge * 64) / 64, ready = game.pump.charge >= 1;
    this.pumpBlend = Math.max(0, Math.min(1, (this.pumpBlend || 0) + (ready ? 1 : -1) * 4 * dt));
    const b = this.pumpBlend * this.pumpBlend * (3 - 2 * this.pumpBlend);
    const col = `rgba(${Math.round(255 + (92 - 255) * b)},${Math.round(255 + (224 - 255) * b)},${Math.round(255 + (122 - 255) * b)},${0.85 + 0.15 * b})`;
    el.style.background = `conic-gradient(${col} ${fill * 360}deg, #ffffff22 0deg)`;
    el.style.boxShadow = `0 0 ${8 * b}px rgba(92,224,122,${0.2 * b})`;
  }
  // objective card: {key, arg, value, max, fill, seg, pct, done} or null
  objective(c) {
    const box = this.$('objective');
    if (!c) { box.classList.add('hidden'); this.objKey = null; return; }
    box.classList.remove('hidden'); box.classList.toggle('done', !!c.done);
    const icon = c.icon || { grab: 'hand', feed: 'icon_shredder_standard', upgrade: 'currency', proficiency: 'star', boost: 'boost_money', chest: 'chest', bucket: 'bucket', bag: 'bag', stairs: 'boot', shovel: 'shovel', drones: 'drone' }[c.id] || 'hand';
    const text = c.text || T(c.key, c.arg ? T(c.arg) : ''), prog = c.prog != null ? c.prog : c.pct ? c.value + '%' : `${c.value}/${c.max}`;
    if (this.objKey !== c.id + text) {
      this.objKey = c.id + text; this.$('objT').textContent = text; box.querySelector('img').src = UI + icon + '.webp';
      this.$('objS').innerHTML = Array.from({ length: c.seg || 1 }, () => '<i><b></b></i>').join('');
    }
    this.set('objP', 'text', prog);
    const segs = this.$('objS').children;
    for (let i = 0; i < segs.length; i++) segs[i].firstChild.style.transform = `scaleX(${Math.max(0, Math.min(1, c.fill - i))})`;
  }
  // ability cooldown wipes + rally tile; owned(move), left(move), frac(move)
  abilities(game, coarse) {
    const A = game.abilities, now = performance.now();
    for (let i = 0; i < 5; i++) {
      const s = this.slots[i], m = i + 1, own = A.owned(m);
      if (i === 4) s.classList.toggle('hidden', !game.econ.hasUnlock('mech.drones'));
      s.classList.toggle('ab', own);
      const left = own ? A.cdLeft(m) : 0, f = left > 0.001 ? Math.min(1, A.cd01(m)) : 0;
      const k = (f * 360).toFixed(0);
      if (s._wk !== k) { s._wk = k; s.querySelector('.wipe').style.background = f > 0 ? `conic-gradient(rgba(var(--acc),0.35) ${k}deg, transparent 0deg)` : ''; }
      s.classList.toggle('cool', f > 0);
      const txt = left > 0 ? String(Math.ceil(left)) : '';
      if (s._ct !== txt) { s._ct = txt; s.querySelector('.cd').textContent = txt; }
      if (s._wasCool && f === 0) { s.classList.remove('ready'); void s.offsetWidth; s.classList.add('ready'); }
      s._wasCool = f > 0;
      if (s._shakeT) { const t = (now - s._shakeT) / 1000; if (t >= 0.28) { s._shakeT = 0; s.style.translate = ''; } else s.style.translate = `${Math.sin(t * 70) * 3.5 * (1 - t / 0.28)}px 0`; }
    }
    if (coarse) { const m = game.abilities.forTool(game.tool); this.$('tSecondary').classList.toggle('hidden', !(m && A.owned(m))); }
  }
  // Finale/Hud/Timer (RunTimerHud, setting "Speedrun timer"): run clock, white while running, gold when finished
  runTimer(on, text, finished) {
    const el = this.$('runTimer'); el.classList.toggle('hidden', !on); if (!on) return;
    el.classList.toggle('fin', !!finished); const sp = el.querySelector('span'); if (sp.textContent !== text) sp.textContent = text;
  }
  keyChip(on) { this.$('keyChip').classList.toggle('hidden', !on); }
  shakeSlot(move) { const s = this.slots[move - 1]; if (s) s._shakeT = performance.now(); }
  // side card (intro.side.ability.*): {move, uses, done} or null
  side(c) {
    const box = this.$('sideCard');
    if (!c) { box.classList.add('hidden'); this.sideKey = null; return; }
    box.classList.remove('hidden'); box.classList.toggle('done', !!c.done);
    if (c.title) {     // note / find card: text only
      if (this.sideKey !== c.title + (c.sub || '')) { this.sideKey = c.title + (c.sub || ''); this.$('sideT').textContent = c.title; this.$('sideS').textContent = c.sub || ''; this.$('sideP').textContent = ''; }
      return;
    }
    const key = 'intro.side.ability.' + SIDE_KEY[c.move - 1];
    if (this.sideKey !== key) { this.sideKey = key; this.$('sideT').textContent = T(key); this.$('sideS').textContent = T(key + '.sub'); }
    this.set('sideP', 'text', `${Math.min(2, c.uses)}/2`);
  }
  // vault event row (HudEventRow): icon, label, remaining time, fill = remaining/duration
  eventRow(r) {
    const el = this.$('evRow');
    if (!r) { el.classList.add('hidden'); this.evKey = null; return; }
    el.classList.remove('hidden');
    if (this.evKey !== r.icon + r.label) { this.evKey = r.icon + r.label; el.querySelector('img').src = UI + r.icon + '.webp'; el.querySelector('.l').textContent = r.label; }
    const m = Math.max(0, r.remaining); el.querySelector('.tm').textContent = m > 0 ? `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}` : '✓';
    el.querySelector('.bar b').style.transform = `scaleX(${Math.max(0, Math.min(1, m / Math.max(1, r.duration)))})`;
    el.classList.toggle('warn', m > 0 && m < 6);
  }
  // Pockets radio line (event calls): portrait + typed line, held a few seconds
  radio(text, mood = 'sly', ms = 5200) {
    const el = this.$('radioLine'); el.classList.remove('hidden'); el.querySelector('img').src = UI + 'thief_' + mood + '.webp';
    el.querySelector('.n').textContent = T('intro.thief.name'); el.querySelector('.t').textContent = text;
    clearTimeout(this.radioT); this.radioT = setTimeout(() => el.classList.add('hidden'), ms);
  }
  // achievement card (f18 layout: counter above, icon tile with a star badge, title + description)
  ach(icon, name, desc, n, total) {
    (this.achQ ||= []).push([icon, name, desc, n, total]);
    if (!this.achBusy) this.nextAch();
  }
  nextAch() {
    if (document.body.classList.contains('cine')) { setTimeout(() => this.nextAch(), 500); return; }   // held during the arrest cinematic
    const el = this.$('achCard'), a = this.achQ.shift(); if (!a) { this.achBusy = false; el.classList.add('hidden'); return; }
    this.achBusy = true; el.classList.remove('hidden', 'out');
    el.querySelector('.cnt').innerHTML = `${a[3]}<b>/</b>${a[4]}`; el.querySelector('.ic img').src = UI + a[0] + '.webp';
    el.querySelector('.h').textContent = a[1]; el.querySelector('.d').textContent = a[2];
    setTimeout(() => { el.classList.add('out'); setTimeout(() => this.nextAch(), 350); }, 4200);
  }
  // big centre card (RELIC FOUND!, GOLD TELLER prize, event titles)
  bigCard(h, d, c = '', ms = 3400) {
    const el = this.$('bigCard'); el.classList.remove('hidden');
    el.querySelector('.h').textContent = h; el.querySelector('.d').textContent = d; el.querySelector('.c').textContent = c;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.bigT); this.bigT = setTimeout(() => el.classList.add('hidden'), ms);
  }
  prompt(text) { const p = this.$('prompt'); if (!text) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); if (p.textContent !== text) p.textContent = text; }
  toast(t1, t2 = '', ms = 2600) {
    const box = this.$('toasts');
    const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<div class="t1"></div>${t2 ? '<div class="t2"></div>' : ''}`;
    d.querySelector('.t1').textContent = t1; if (t2) d.querySelector('.t2').textContent = t2;
    box.appendChild(d); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), ms);
  }
  pop(x, y, text, crit) {
    const p = this.$('pops'); if (p.children.length > 24) p.firstChild.remove();
    const d = document.createElement('div'); d.className = 'pop' + (crit ? ' crit' : ''); d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px'; p.appendChild(d); setTimeout(() => d.remove(), 1100);
  }
}
