// City map card and prestige screens, rebuilt from the original prefabs (tools/export_menus.py, art/ui/menus/menus.json):
// MartMenu_ABTEST (MartMenuController: one mart at a time, up/down walks the RC_MartOrder list), MartPrestigeMenu
// (PrestigeMenuController), MartPrestige_WelcomeScreen (PrestigeMenuWelcome) and Info_Prestige (the one-time popup).
// Sizes are reference units of the 750x1334 canvas (--u in css), button colours are the Button ColorBlock tints.
import { STAR_MAX, PRESTIGE_MIN } from '../sim/martmap.js';

const stars = (n, next = -1) => `<span class="stars">${Array.from({ length: STAR_MAX + 1 }, (_, i) =>
  `<i class="${i < n ? 'on' : ''}${i === next ? ' nx' : ''}"></i>`).join('')}</span>`;

// MartMenuController timer texts: "{m:00}m {s:00}s", "{h}h {m:00}m {s:00}s".
export function clock(sec) {
  const s = Math.ceil(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
  const p = v => String(v).padStart(2, '0');
  return h > 0 ? `${h}h ${p(m)}m ${p(r)}s` : `${p(m)}m ${p(r)}s`;
}

export class MartMenu {
  // martMap: { rows(), collect(row, mult), go(row), prestige(row), global }; art: art root; ui(name): HUD sprite url.
  // onView(index | null): the 3D map follows the card (null when it closes).
  constructor({ root, art, ui, martMap, sound, onOpen, onView }) {
    this.map = martMap;
    this.onView = onView || (() => {});
    this.sound = sound;
    this.onOpen = onOpen || (() => {});
    this.ui = ui;
    this.art = art;
    const m = n => `${art}/ui/menus/${n}.webp`;
    this.m = m;
    root.insertAdjacentHTML('beforeend', `
      <div class="mcard" id="mapmenu"><div class="panel">
        <div class="head"><img class="icon" alt=""><div><b class="title ol"></b><span class="stars"></span></div></div>
        <div class="line">
          <div class="comp"><b class="ol"></b><i class="bar"><u></u></i><a class="tb info ol" style="--c:#ffff77">?</a></div>
          <div class="prest"><a class="tb ol" data-act="prestige" style="--c:#d56dff">Prestige</a><s class="ol">Reach ${PRESTIGE_MIN}% to Unlock</s></div>
        </div>
        <div class="mid">
          <div class="inc"><b class="ol">Income:</b><img src="${m('cashIcon')}" alt=""><b class="ol num"></b><em class="ol">MAX</em></div>
          <div class="btns">
            <a class="tb ol collect" data-act="collect" style="--c:#ffc236">Collect<s class="ol"></s></a>
            <a class="tb ol rv" data-act="collect2" style="--c:#5ef0c7"><img src="${m('adIcon')}" alt="">x150%</a>
          </div>
          <div class="lock"><img src="${m('padlock_icon')}" alt=""><b class="ol">Unlock Previous Van Mart</b></div>
        </div>
        <div class="go"><a class="tb ol" data-act="go" style="--c:#8ce971">Go</a><span class="here ol"><img src="${m('MapUI')}" alt="">You are here</span></div>
        <div class="nav"><a class="tb up" data-act="up" style="--c:#ffd434"><img src="${m('triangle')}" alt=""></a><a class="tb down" data-act="down" style="--c:#ffd434"><img src="${m('triangle')}" alt=""></a></div>
        <a class="tb x" data-act="close" style="--c:#ff585d"><img src="${m('crossUI')}" alt=""></a>
      </div></div>
      <div class="mshade pmenu" id="prestigemenu"><div class="panel">
        <b class="title ol">Prestige</b>
        <div class="info">
          <div class="mart"><img class="icon" alt=""><div><b class="name ol"></b><span class="stars"></span></div></div>
          <p class="ol">Rebuild your Mart to earn rewards and increase its <span class="g">Max Income</span>. The mart needs to be <span class="y">100% Completed</span>.</p>
          <div class="rew"><i class="ol">Rewards:</i><span><img class="vgi" src="${m('goldBarIcon')}" alt=""><b class="ol vg"></b></span><span><img src="${m('cashIcon')}" alt=""><b class="ol vc"></b></span></div>
          <div class="maxinc"><i class="ol">Max Income:</i><div><img src="${m('cashIcon')}" alt=""><b class="ol a"></b><i class="arrow"></i><img src="${m('cashIcon')}" alt=""><b class="ol b"></b></div></div>
        </div>
        <div class="foot"><div class="comp"><b class="ol"></b><i class="bar"><u></u></i></div>
          <a class="tb ol rebuild" data-act="rebuild" style="--c:#ff585d"><img src="${m('resetIcon')}" alt="">Rebuild</a></div>
        <a class="tb x" data-act="close" style="--c:#ff585d"><img src="${m('crossUI')}" alt=""></a>
      </div></div>
      <div class="mshade pwelcome" id="prestigewelcome"><div class="panel">
        <b class="title ol">Congratulations!</b>
        <div class="info">
          <i class="desc ol">You have prestiged</i>
          <div class="mart"><img class="icon" alt=""><div><b class="name ol"></b><span class="stars"></span></div></div>
          <div class="rew"><i class="ol">Rewards:</i><div><span><img src="${m('goldBarIcon')}" alt=""><b class="ol vg"></b></span><span><img src="${m('cashIcon')}" alt=""><b class="ol vc"></b></span></div></div>
          <div class="maxinc"><i class="ol">Max Income:</i><div><img src="${m('cashIcon')}" alt=""><b class="ol a"></b><i class="arrow"></i><img src="${m('cashIcon')}" alt=""><b class="ol b"></b></div></div>
        </div>
        <div class="foot"><a class="tb ol claim" data-act="claim" style="--c:#ffc236">Claim</a></div>
      </div></div>
      <div class="mshade pinfo" id="prestigeinfo"><div class="panel">
        <div class="head"><img src="${m('infoIcon')}" alt=""><b class="ol">New Update:</b></div><b class="title ol">Prestige</b>
        <div class="box"><div class="in"><p class="ol">Congratulations, your current Mart is now <span class="y">100% Completed</span>. You can now visit the Map to prestige your Mart.</p>
          <a class="tb map" data-act="map" style="--c:#ff995a"><img src="${m('MapCityUI')}" alt=""></a></div></div>
      </div><div class="hl"><a class="tb map" data-act="map" style="--c:#ff995a"><img src="${m('MapCityUI')}" alt=""></a><i class="point"></i></div></div>`);
    this.card = root.querySelector('#mapmenu');
    this.pmenu = root.querySelector('#prestigemenu');
    this.welcome = root.querySelector('#prestigewelcome');
    this.info = root.querySelector('#prestigeinfo');
    this.card.addEventListener('click', e => this.cardClick(e));
    this.pmenu.addEventListener('click', e => this.prestigeClick(e));
    this.welcome.addEventListener('click', e => this.welcomeClick(e));
    this.info.addEventListener('click', e => {
      if (!e.target.closest('[data-act="map"]')) return;
      this.tap();
      this.info.classList.remove('open');
      this.open();
    });
  }

  get isOpen() { return this.card.classList.contains('open'); }

  tap(cancel) { if (this.sound) this.sound.play(cancel ? 'cancel' : 'tap'); }

  open() {
    const rows = this.map.rows();
    this.index = Math.max(0, rows.findIndex(r => r.here));
    this.card.classList.add('open');
    this.key = null;
    this.onOpen();
    this.onView(this.index);
    this.update(true);
  }

  close() {
    if (this.isOpen) this.onView(null);
    this.card.classList.remove('open');
    this.pmenu.classList.remove('open');
  }

  row() { return this.map.rows()[this.index]; }

  cardClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const rows = this.map.rows(), r = rows[this.index], act = b.dataset.act;
    if (act === 'close') { this.tap(true); this.close(); return; }
    if (act === 'up' || act === 'down') {
      const i = this.index + (act === 'up' ? 1 : -1);
      if (i < 0 || i >= rows.length) return;
      this.tap();
      this.index = i;
      this.onView(i);
    } else if ((act === 'collect' || act === 'collect2') && r.ready) {
      this.tap();
      // The ad button pays trunc(1.5 x income) (MartMenuController.c:2987); the web gives it without the video.
      this.map.collect(r, act === 'collect2' ? 1.5 : 1);
    } else if (act === 'go' && r.open && !r.here) {
      this.tap();
      this.map.go(r);
    } else if (act === 'prestige' && r.canPrestige) {
      this.tap();
      this.showPrestige(r);
    }
    this.update(true);
  }

  // SetPrestigeMenu(completionRate, star, maxIdleIncome, >= 80, scene): the next star pulses (ActivateNextStar).
  showPrestige(r) {
    const p = this.pmenu;
    this.prow = r;
    p.querySelector('.icon').src = `${this.art}/ui/${r.icon}.webp`;
    p.querySelector('.name').textContent = r.name;
    p.querySelector('.stars').outerHTML = stars(r.star, r.star);
    p.querySelector('b.vg').textContent = r.offer.gold;
    p.querySelector('b.vc').textContent = r.offer.cash;
    p.querySelector('b.a').textContent = r.offer.now;
    p.querySelector('b.b').textContent = r.offer.next;
    p.querySelector('.comp b').textContent = `${r.pct}% Completed`;
    p.querySelector('.comp u').style.width = `${r.pct}%`;
    p.querySelector('.rebuild').classList.toggle('off', !r.canPrestige);
    p.classList.add('open');
  }

  prestigeClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || this.busy) return;
    if (b.dataset.act === 'close') { this.tap(true); this.pmenu.classList.remove('open'); return; }
    if (b.dataset.act === 'rebuild' && this.prow && this.prow.canPrestige) {
      // isPrestiging blocks the close button until the scene reloads.
      this.busy = true;
      this.map.prestige(this.prow);
    }
  }

  // PrestigeMenuWelcome after the reload: star row, gold, cash, old and new max income pop in one after another.
  showWelcome(p) {
    const w = this.welcome;
    this.pending = p;
    w.querySelector('.icon').src = `${this.art}/ui/${p.icon}.webp`;
    w.querySelector('.name').textContent = p.name;
    w.querySelector('.stars').outerHTML = stars(p.star);
    w.querySelector('b.vg').textContent = p.gold;
    w.querySelector('b.vc').textContent = p.cash;
    w.querySelector('b.a').textContent = p.before;
    w.querySelector('b.b').textContent = p.after;
    w.classList.add('open');
  }

  welcomeClick(e) {
    const b = e.target.closest('[data-act="claim"]');
    if (!b || !this.pending) return;
    this.tap();
    const p = this.pending;
    this.pending = null;
    this.welcome.classList.remove('open');
    this.map.claim(p);
  }

  // Info_Prestige also draws a copy of the HUD map button above its shade, with a bouncing arrow beside it.
  showInfo() {
    const b = document.querySelector('#mapbtn');
    const hl = this.info.querySelector('.hl');
    if (b && b.offsetParent) {
      const r = b.getBoundingClientRect(), o = this.info.getBoundingClientRect();
      Object.assign(hl.style, { display: '', left: `${r.left - o.left}px`, top: `${r.top - o.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else hl.style.display = 'none';
    this.info.classList.add('open');
  }

  // Refreshed twice a second while open (each refresh reads the other marts' saves).
  update(force) {
    if (!this.isOpen) return;
    const now = performance.now();
    if (!force && now - (this.t || 0) < 500) return;
    this.t = now;
    const rows = this.rows = this.map.rows(), r = rows[this.index];
    const c = this.card;
    const key = JSON.stringify([this.index, r.star, r.pct, r.income, r.max, r.ready, Math.ceil(r.left), r.here, r.visited, r.open]);
    if (key === this.key) return;
    this.key = key;
    c.querySelector('.head .icon').src = `${this.art}/ui/${r.icon}.webp`;
    c.querySelector('.head .icon').classList.toggle('dark', !r.open);
    c.querySelector('.title').textContent = r.name;
    c.querySelector('.head .stars').outerHTML = stars(r.star);
    // 0 % on a reached mart that is not this one: "Visit to update" (MartMenuController.c:~3640).
    c.querySelector('.comp b').textContent = r.seasonal && !r.visited ? 'Event Mart'
      : r.visited && r.pct === 0 && !r.here ? 'Visit to update' : `${r.pct}% Completed`;
    c.querySelector('.comp u').style.width = `${r.pct}%`;
    c.classList.toggle('locked', !r.open);
    c.classList.toggle('event', r.seasonal);
    c.querySelector('.prest').style.display = r.prestige ? '' : 'none';
    c.querySelector('.prest').classList.toggle('off', !r.canPrestige);
    c.querySelector('.inc .num').textContent = `${r.income}/${r.max}`;
    c.querySelector('.inc em').style.display = r.max > 0 && r.income >= r.max ? '' : 'none';
    const ready = r.ready;
    c.querySelector('.collect').classList.toggle('off', !ready);
    c.querySelector('.rv').classList.toggle('off', !ready);
    c.querySelector('.collect s').textContent = ready ? '' : clock(r.left);
    c.querySelector('.go [data-act="go"]').style.display = r.here || !r.open ? 'none' : '';
    c.querySelector('.go .here').style.display = r.here ? '' : 'none';
    c.querySelector('.up').classList.toggle('off', this.index >= rows.length - 1);
    c.querySelector('.down').classList.toggle('off', this.index <= 0);
  }
}
