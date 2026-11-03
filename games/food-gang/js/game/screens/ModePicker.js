// Play -> CHOOSE BATTLE (owner request 2026-11-03: the layout of an event-select screen; Food Gang's own modes, art
// and theme) [ĐỀ XUẤT]. A DOM panel like the leaderboard (.fg-board): top bar (back, title, RANDOM, trophies / coins /
// gems, home), a 2-column grid of event cards (colour band with the mode icon, MODE NAME, the map line, a
// "New Event in" pill and an info button; a preview of that map in the mode below), and a wide BOSS RUSH card at the
// bottom (the one-boss-against-the-team slot). Each card's map rotates every ROTATE_H hours (UTC, staggered per card),
// which is what its countdown counts down to; tapping a card plays that mode on that map. RANDOM keeps the original
// deck draw (mode and map). Registers as a pseudo screen 'SceneModePicker' so tests / fgDebug see its cards.
import { T } from '../text.js';
import { modeChoices, savedChoice, saveChoice } from '../modes.js';

const ROTATE_H = 6;
// display order -> {choice text key, colour, icon sprite, preview kind}
const CARDS = [
  { text: 'mission.dm.2vs2', color: '#7432a8', icon: 'icon_party', kind: 'battle' },
  { text: 'mission.dm.ffa', color: '#45911a', icon: 'icon_menu_skins', kind: 'battle' },
  { text: 'mission.kill.2vs2', color: '#1488b0', icon: 'icon_life_death', kind: 'battle' },
  { text: 'mission.kill.ffa', color: '#c46b14', icon: 'icon_life_death', kind: 'battle' },
  { text: 'mission.survive.2vs2', color: '#ae3024', icon: 'icon_life_3', kind: 'battle' },
  { text: 'mission.survive.ffa', color: '#b03579', icon: 'icon_life_3', kind: 'battle' },
  { text: 'web.mode.payload', color: '#0d896e', icon: 'fridge_reward_01_close', kind: 'payload' },
  { text: 'web.mode.siege', color: '#2c4cab', icon: 'fridge_reward_03_close', kind: 'siege' },
];
const BANNER = { text: 'mission.killboss.1vs3', color: '#8c1820', icon: 'icon_boss', kind: 'boss' };
const MAPS = ['kitchen', 'dining', 'pantry'];

/** Map of card `slot` at time `now` (ms) and the seconds until it changes. */
export function rotation(slot, now = Date.now()) {
  const P = ROTATE_H * 3600, off = slot * 47 * 60 + 13 * 60;
  const t = Math.floor(now / 1000) + off;
  return { mapIndex: (Math.floor(t / P) + slot) % MAPS.length, left: P - (t % P) };
}

const fmtLeft = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
};

export class ModePicker {
  constructor(app) {
    this.app = app;
    this.sceneName = 'SceneModePicker';
    this.layer = 60;
    this.closed = false;
    this.result = null;
    this.choices = modeChoices(app.meta.db);
    this.choice = savedChoice(this.choices.length);
    this.byText = new Map(this.choices.map((c) => [c.text, c]));
  }

  // icon from art/picker/<key>.webp: the sprites cut out of their atlases at build time (a CSS background on the
  // 2048 px atlas itself made the first paint decode and rescale whole atlases: an 85 ms long task on open)
  sprite(key, box) {
    const A = this.app.engine.assets, s = A.spriteData.sprites[key];
    if (!s) return '';
    const k = Math.min(box / s.w, box / s.h);
    return `width:${(s.w * k).toFixed(1)}px;height:${(s.h * k).toFixed(1)}px;background:url(${A.base}art/picker/${key}.webp${A.rev}) center / contain no-repeat`;
  }

  preview(kind, mapIndex) { const A = this.app.engine.assets; return `${A.base}art/previews/${kind}_${MAPS[mapIndex]}.webp${A.rev}`; }

  card(def, slot, wide = false) {
    const c = this.byText.get(def.text);
    if (!c) return '';
    const r = rotation(slot);
    const on = c.choice === this.choice ? ' on' : '';
    return `<button class="fg-ev${wide ? ' wide' : ''}${on}" data-choice="${c.choice}" data-map="${r.mapIndex}" data-slot="${slot}" style="--band:${def.color}">
      <span class="badge"><i style="${this.sprite(def.kind === 'boss' ? 'icon_crown' : 'icon_trophy', 20)}"></i></span>
      <span class="pill">${T('web.picker.new')} <b data-left="${slot}">${fmtLeft(r.left)}</b></span>
      <span class="info" data-info="1">i</span>
      <span class="band"><span class="ic"><i style="${this.sprite(def.icon, wide ? 46 : 42)}"></i></span>
        <span class="tx"><b>${T(c.text)}</b><em>${T('stage.' + this.app.meta.db.maps[r.mapIndex].stageId)}</em></span></span>
      <span class="pv" style="background-image:url(${this.preview(def.kind, r.mapIndex)})"><span class="rule">${T(c.desc)}</span></span>
    </button>`;
  }

  open() {
    const { app } = this;
    const p = app.profile;
    const el = this.el = document.createElement('div');
    el.className = 'fg-picker';
    // plain blue backdrop: a scaled, blurred kitchen picture cost ~30 ms and an icon pattern tile (atlas read-back)
    // ~60 ms of long task on every open (pc test 'no long task between BATTLE! and the match', rev 20261103a)
    el.innerHTML = `<div class="fg-pk-bg"></div>
      <div class="top">
        <button class="back" data-back="1"><i style="${this.sprite('icon_menu_back', 30)}"></i></button>
        <h1>${T('web.picker.title')}</h1>
        <button class="rand${this.choice === 0 ? ' on' : ''}" data-choice="0"><i style="${this.sprite('icon_token_generic', 26)}"></i>${T('web.picker.random')}</button>
        <span class="cur"><i style="${this.sprite('icon_trophy', 22)}"></i>${p.trophies | 0}</span>
        <span class="cur"><i style="${this.sprite('icon_currency_freemium', 22)}"></i>${p.coins | 0}</span>
        <span class="cur"><i style="${this.sprite('icon_currency_premium', 22)}"></i>${p.gems | 0}</span>
        <button class="home" data-back="1" aria-label="home"><svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></button>
      </div>
      <div class="list"><div class="grid">${CARDS.map((d, i) => this.card(d, i)).join('')}</div>
        <div class="banner">${this.card(BANNER, CARDS.length, true)}</div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => this.onClick(e));
    this.onKey = (e) => { if (e.key === 'Escape') this.finish(null); };
    window.addEventListener('keydown', this.onKey);
    this.timer = setInterval(() => this.tick(), 1000);
    app.screens.push(this);
    this.done = new Promise((r) => { this.resolve = r; });
    return this;
  }

  tick() {
    for (const b of this.el.querySelectorAll('[data-left]')) b.textContent = fmtLeft(rotation(Number(b.dataset.left)).left);
  }

  onClick(e) {
    const info = e.target.closest('[data-info]');
    if (info) { info.closest('.fg-ev').classList.toggle('rules'); e.stopPropagation(); return; }
    if (e.target.closest('[data-back]')) { this.finish(null); return; }
    const b = e.target.closest('[data-choice]');
    if (!b) return;
    const choice = Number(b.dataset.choice);
    saveChoice(choice);
    this.app.audio.sfx && this.app.audio.sfx('Click');
    this.finish({ choice, mapIndex: b.dataset.map !== undefined ? Number(b.dataset.map) : -1 });
  }

  finish(result) {
    if (this.closed) return;
    this.result = result;
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    if (this.el) this.el.remove();
    const i = this.app.screens.indexOf(this); if (i >= 0) this.app.screens.splice(i, 1);
    if (this.resolve) this.resolve(this.result);
  }

  buttons() { return []; }

  debug() {
    const pos = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
    const cards = [...this.el.querySelectorAll('.fg-ev')].map((n) => ({ choice: Number(n.dataset.choice), name: n.querySelector('.tx b').textContent,
      map: n.querySelector('.tx em').textContent, left: n.querySelector('[data-left]').textContent, pos: pos(n), info: pos(n.querySelector('.info')), wide: n.classList.contains('wide') }));
    const cur = this.el.querySelector(`[data-choice="${this.choice}"]`);
    return { cards, count: cards.length + 1, choice: this.choice, random: pos(this.el.querySelector('.rand')), back: pos(this.el.querySelector('.back')),
      battleButton: pos(cur), title: this.el.querySelector('h1').textContent };
  }
}
