// Leaderboard + achievements. The game shows Google Play Games' own UI (LeaderboardManager / AchievementManager), which
// is not in the rip: the web build draws a game-styled panel [ĐỀ XUẤT] with the local profile ranked among the bot
// names of the matchmaker (seeded trophies) and the 43 achievements of MetaDb with their progress.
import { T } from '../text.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export class LeaderboardScreen {
  constructor(app) { this.app = app; this.layer = 0; this.sceneName = 'Leaderboard'; this.closed = false; this.insts = new Set(); }

  rows() {
    const { app } = this, p = app.profile;
    const top = Math.max(600, p.trophies * 2 + 300);
    const rows = app.meta.db.botNames.slice(0, 60).map((n) => ({ name: n, trophies: hash(n) % top }));
    rows.push({ name: p.name, trophies: p.trophies, me: true });
    rows.sort((a, b) => b.trophies - a.trophies || (a.me ? -1 : 1));
    return rows;
  }

  async open() {
    const { app } = this, p = app.profile;
    const el = this.el = document.createElement('div');
    el.className = 'fg-board';
    const rows = this.rows();
    const ach = app.meta.db.achievements.map((a) => {
      const v = app.meta.achievementProgress(p, a);
      const done = p.achievements.includes(a.id);
      return { name: a.name, v: Math.min(v, a.isEvent ? 1 : a.threshold), max: a.isEvent ? 1 : a.threshold, done };
    });
    el.innerHTML = `<div class="panel"><div class="tabs"><button data-t="lb" class="on">${T('league.title')}</button><button data-t="ach">${'ACHIEVEMENTS'}</button>
      <button class="x" aria-label="close">✕</button></div>
      <ol class="lb">${rows.map((r, i) => `<li class="${r.me ? 'me' : ''}"><b>${i + 1}</b><span>${esc(r.name)}</span><em>🏆 ${r.trophies}</em></li>`).join('')}</ol>
      <ul class="ach" hidden>${ach.map((a) => `<li class="${a.done ? 'done' : ''}"><span>${esc(a.name)}</span><i><u style="width:${Math.round(100 * a.v / Math.max(1, a.max))}%"></u></i><em>${a.v}/${a.max}</em></li>`).join('')}</ul></div>`;
    el.querySelector('.x').onclick = () => { app.audio.sfx('UIBack'); this.close(); };
    for (const b of el.querySelectorAll('.tabs [data-t]')) b.onclick = () => {
      for (const x of el.querySelectorAll('.tabs [data-t]')) x.classList.toggle('on', x === b);
      el.querySelector('.lb').hidden = b.dataset.t !== 'lb';
      el.querySelector('.ach').hidden = b.dataset.t !== 'ach';
      app.audio.sfx('UIOk');
    };
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.appendChild(el);
    app.screens.push(this);
    const me = el.querySelector('li.me'); if (me) me.scrollIntoView({ block: 'center' });
    return this;
  }

  ownsNode() { return false; }
  click() { return false; }
  buttons() { return []; }
  close() { if (this.closed) return; this.closed = true; this.el.remove(); this.app.screens = this.app.screens.filter((s) => s !== this); if (this.resolve) this.resolve(null); }
  done() { return this.closed ? Promise.resolve(null) : new Promise((r) => { this.resolve = r; }); }
  debug() { const r = this.rows(); return { rank: r.findIndex((x) => x.me) + 1, entries: r.length, achievements: this.app.meta.db.achievements.length }; }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
