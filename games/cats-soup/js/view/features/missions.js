// Feature "missions" (view part): the HUD quest button opens one panel with the daily missions plus the all-clear
// scratch card, the levelled quests and the attendance calendar. Rules: js/sim/features/missions.js. Contract: js/view/registry.js.
import { find } from '../ngui.js';

const BUTTON = 'mainUI/set_topRight/buttons/bt_quest';
const ICON = { 1: '🪙', 2: '⚡', 3: '💎', 4: '🪑', 7: '🐟', 23: '🍮', 98: '🦋', 99: '🎟', 101: '🪙', 102: '⚡', 6002: '⭐' };
const HOURS = [1, 3, 6];

const el = (cls, text = '') => Object.assign(document.createElement('div'), { className: cls, textContent: text });

export default {
  id: 'missions',
  mount(ctx) {
    this.ctx = ctx;
    this.sim = ctx.game.feat.missions;
    ctx.css('css/missions.css');
    ctx.hud.bind(BUTTON, () => this.open());
    const btn = find(ctx.root, BUTTON);
    this.dot = document.createElement('i');
    this.dot.className = 'qdot';
    if (btn) btn.appendChild(this.dot);
    this.since = 0;
  },

  update(dt) {
    this.since += dt;
    if (this.since < 0.5) return;
    this.since = 0;
    this.dot.style.display = this.sim.pending(this.ctx.game) ? 'block' : 'none';
  },

  onEvent(e) {
    if (this.ctx.hud.panel && e.type === 'missionsReset') this.ctx.hud.panel.refresh();
  },

  // Short label of a reward (Mission.json / DailyReward.json / Montly28Rewards.json types).
  label(type, value) {
    const t = this.ctx.t;
    if (type >= 1101 && type <= 1103) return t('ticketGold', t('hour', HOURS[type - 1101]));
    if (type >= 1201 && type <= 1203) return t('ticketEnergy', t('hour', HOURS[type - 1201]));
    if (type === 101 || type === 102) return `${ICON[type]} ${value >= 3600 ? t('hour', value / 3600) : t('minute', value / 60)}`;
    return `${ICON[type] || '🎁'} ${value}`;
  },

  open() {
    const { hud, t } = this.ctx;
    // The third tab has no string of its own in the original tables (quest17 is a whole sentence).
    const tabs = [{ key: 'daily', title: t('dailyMission') }, { key: 'quest', title: t('achieve') }, { key: 'attend', title: 'Điểm danh' }];
    hud.open(t('title_quest'), '', tabs, (list, tb) => this[tb.key](list));
  },

  row(cls = '') { return el(`row mis ${cls}`); },

  txt(title, sub) {
    const d = el('txt');
    d.innerHTML = '<b></b><small></small>';
    d.querySelector('b').textContent = title;
    d.querySelector('small').textContent = sub || '';
    return d;
  },

  bar(value, max) {
    const b = el('bar');
    b.innerHTML = `<i style="width:${Math.min(100, (100 * value) / max)}%"></i><span>${value}/${max}</span>`;
    return b;
  },

  button(ok, text, fn) {
    const b = el(`price ${ok ? '' : 'off'}`, text);
    if (ok) b.onclick = fn;
    return b;
  },

  paid(out) {
    const { hud } = this.ctx;
    hud.toast([].concat(out).filter(Boolean).map(o => this.label(o.type, o.value)).join('  '));
    if (hud.panel) hud.panel.refresh();
  },

  daily(list) {
    const { game, t } = this.ctx;
    const sim = this.sim;
    for (const m of sim.listedMissions(game)) {
      const st = sim.missionState(game, m.index);
      const r = this.row(st.claimed ? 'claimed' : '');
      r.appendChild(this.txt(t(`quest${m.type}`, m.maxValue)));
      r.lastChild.appendChild(this.bar(st.count, m.maxValue));
      r.appendChild(el('rw', this.label(m.rewardType, m.rewardValue)));
      r.appendChild(st.claimed ? el('done', '✔') : this.button(st.done, t('getReward'), () => this.paid(sim.claimMission(game, m.index))));
      list.appendChild(r);
    }
    // All-clear scratch card (DailyReward.json): three rolled rewards, paid together.
    const c = game.state.missions.clear, ready = sim.clearReady(game);
    const r = this.row('clear');
    r.appendChild(this.txt(t('quest100'), ready || c.claimed ? '' : t('msg_firstOtherMission')));
    const cards = el('cards');
    for (const i of c.picks) {
      const row = game.data.missions.scratch.find(x => x.index === i);
      cards.appendChild(el(`card3 ${c.claimed ? 'open' : ''}`, c.claimed ? this.label(row.rewardType, row.rewardValue) : (ready ? '?' : '🔒')));
    }
    r.appendChild(cards);
    r.appendChild(c.claimed ? el('done', '✔') : this.button(ready, t('getReward'), () => this.paid(sim.claimClear(game))));
    list.appendChild(r);
  },

  quest(list) {
    const { game, t } = this.ctx;
    const sim = this.sim;
    const rows = sim.listedQuests(game).map(q => sim.questState(game, q.index)).sort((a, b) => Number(b.done) - Number(a.done));
    for (const st of rows) {
      const r = this.row();
      r.appendChild(this.txt(t(`quest${st.row.type}`, st.target), `Lv.${st.level + 1}`));
      r.lastChild.appendChild(this.bar(Math.min(st.value, st.target), st.target));
      r.appendChild(el('rw', this.label(st.row.rewardType, st.row.rewardValue)));
      r.appendChild(this.button(st.done, t('getReward'), () => this.paid(sim.claimQuest(game, st.row.index))));
      list.appendChild(r);
    }
  },

  attend(list) {
    const { game, t } = this.ctx;
    const a = this.sim.attendState(game);
    const grid = el('attend');
    a.rows.forEach((row, i) => {
      const d = el(`day ${i < a.next % a.rows.length ? 'done' : ''} ${i === a.next ? `next ${a.avail ? 'ready' : ''}` : ''}`);
      d.innerHTML = '<small></small><b></b>';
      d.querySelector('small').textContent = t('daysCount', i + 1);
      d.querySelector('b').textContent = i < a.next ? '✔' : this.label(row.rewardType, row.rewardValue);
      if (i === a.next && a.avail) d.onclick = () => this.paid(this.sim.claimAttend(game));
      grid.appendChild(d);
    });
    list.appendChild(grid);
  },
};
