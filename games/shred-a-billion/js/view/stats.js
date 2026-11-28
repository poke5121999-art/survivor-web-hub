// STATS screen (SystemUI/Stats; rules/drop2.md §F): header totals + 28 tiles in 6 groups, values count up when opened,
// refreshed every 0.5 s.
import { T } from '../sim/i18n.js';
import { Num } from '../sim/economy.js';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const G = [
  ['time', [['TimePlayedSeconds', 3], ['SessionCount', 0], ['VacuumSeconds', 3], ['FlightSeconds', 3]]],
  ['collecting', [['BillsCollected', 0], ['ItemsCollected', 0], ['HandPickups', 0], ['BucketPickups', 0], ['ShovelScoops', 0]]],
  ['shredding', [['BillsShredded', 0], ['ItemsShredded', 0], ['ItemsThrown', 0], ['ThrowsIntoShredder', 0], ['BagDumps', 0], ['AutoPumps', 0]]],
  ['money', [['DollarsEarned', 1], ['DollarsSpent', 1], ['MaxDollars', 1], ['CritCount', 0], ['LuckyCount', 0]]],
  ['progress', [['UpgradesBought', 0], ['NodesLearned', 0], ['LevelsGained', 0], ['GoldBarsEarned', 0], ['MilestonesReached', 0]]],
  ['fun', [['BoostsCollected', 0], ['Jumps', 0], ['DistanceWalked', 4]]],
];
const fmt = (v, f) => f === 1 ? Num.money(Math.floor(v)) : f === 2 ? T('stats.fmt.perSecond', Num.money(v)) : f === 3 ? Num.time(Math.floor(v)) : f === 4 ? T('stats.fmt.meters', Num.full(Math.floor(v))) : Num.full(Math.floor(v));

export class Stats {
  constructor(root, game) { this.root = root; this.g = game; this.open = false; }
  show() {
    this.open = true; this.t = 0; this.refreshT = 0;
    this.root.innerHTML = `<div class="screen" id="statsScreen"><div class="panel"><div class="ptitle">${esc(T('menu.tab.stats'))}</div>
      <button class="pclose sbtn" id="statsClose">✕</button><div class="statsHead" id="statsHead"></div><div class="statsBody" id="statsBody"></div>
      <div class="foot"><span><b>ESC</b>${esc(T('menu.hint.close'))}</span></div></div></div>`;
    this.root.querySelector('#statsClose').addEventListener('click', () => this.onClose && this.onClose());
    this.root.querySelector('#statsScreen').addEventListener('pointerdown', (e) => { if (e.target.id === 'statsScreen') this.onClose && this.onClose(); });
    this.render(0);
  }
  hide() { this.open = false; this.root.innerHTML = ''; }
  update(dt) { if (!this.open) return; this.t += dt; this.refreshT -= dt; if (this.refreshT <= 0 || this.t < 0.7) { this.refreshT = 0.5; this.render(Math.min(1, this.t / 0.6)); } }
  render(k) {
    const e = this.g.econ, tr = e.stats.tracked, up = (v) => v * (1 - (1 - k) ** 3);
    this.root.querySelector('#statsHead').innerHTML = [
      [T('stats.header.totalearned.caption'), Num.money(up(e.lifetime || e.total || 0))], [T('demo.thanks.bills'), Num.full(Math.floor(up(tr.BillsShredded || 0)))],
      [T('stats.header.level.caption'), e.level], [T('demo.thanks.time'), Num.time(Math.floor(tr.TimePlayedSeconds || 0))]].map(([c, v]) => `<div><span>${esc(c)}</span><b>${esc(v)}</b></div>`).join('');
    this.root.querySelector('#statsBody').innerHTML = G.map(([g, tiles]) => `<div class="sgroup"><div class="sg">${esc(T(`stats.${g}.title`))}</div>${tiles.map(([id, f]) =>
      `<div class="stile"><b>${esc(fmt(up(tr[id] || 0), f))}</b><span>${esc(T(`stats.${g}.${id.toLowerCase()}.label`))}</span></div>`).join('')}</div>`).join('');
  }
}
