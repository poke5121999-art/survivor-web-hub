// BillionMoment (million / billion overlay) and the end-of-run flow (rules/finale.md §F, §H, §I):
// arrest cinematic -> BUSTED! summary (EndOfRunScreen) -> Thanks card -> Credits -> encore ask (stay / main menu).
import { runClock, outsideDoor, DOOR, FL } from '../sim/finale.js';
import { Arrest } from './arrest.js';
import { COLORS } from '../sim/coop.js';
const UI = './art/ui/';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- BillionMoment (Finale/UI/Billion, mb L5755) ----
const BM = { rollTime: 1.1, titleAt: 1.15, teaserAt: 2.0, fadeAt: 3.5, endAt: 3.95, slowScale: 0.3, slowTime: 0.6, kick: -5, shake: 0.45, shakeTime: 0.7 };
export class Moment {
  constructor(el, fx) { this.el = el; this.fx = fx; this.t = -1; this.T = null; }
  show(step) {
    const T = this.fx.T || ((k) => k);
    this.step = step; this.t = 0;
    this.el.querySelector('.t').textContent = step >= 1e9 ? this.fx.T('finale.billion.title_usd') : this.fx.T('finale.million.title_usd');
    this.el.querySelector('.n').textContent = step >= 1e9 ? this.fx.T('ending.billion.next') : this.fx.T('finale.million.next');
    this.el.className = ''; this.fx.sfx('SideTaskDone'); this.fx.shake(BM.shake, BM.shakeTime); this.fx.kick(BM.kick);
  }
  timeScale() { return this.t >= 0 && this.t < BM.slowTime ? BM.slowScale : 1; }
  update(dt) {
    if (this.t < 0) return;
    this.t += dt; const t = this.t;
    const k = Math.min(1, t / BM.rollTime), e = 1 - Math.pow(1 - k, 3);
    const v = Math.floor(this.step * e);
    this.el.querySelector('.roll').textContent = '$' + v.toLocaleString('en-US');
    this.el.classList.toggle('title', t >= BM.titleAt); this.el.classList.toggle('teaser', t >= BM.teaserAt); this.el.classList.toggle('fade', t >= BM.fadeAt);
    if (t >= BM.endAt) { this.t = -1; this.el.className = 'hidden'; }
  }
}

// ---- end of run ----
const TOOLS = [['tool.hand.name', '#5fb8ff'], ['tool.bucket.name', '#3ea0ff'], ['tool.shovel.name', '#f9c52f'], ['tool.vacuum.name', '#4be37a'], ['finale.tool.autopump', '#b48cf2'], ['finale.tool.drones', '#ffb347']];
export class EndFlow {
  constructor(o) { Object.assign(this, o); this.phase = null; this.arrest = new Arrest(o); }
  clock(s) { return runClock(s); }
  // FinaleDirector.Begin -> BustedDirector.Play
  start(e = {}) {
    if (this.phase) return;
    this.enter(); this.phase = 'arrest';
    const r = this.game.finale.run;
    const crew = this.crew && this.crew();
    this.record = { seconds: r.finaleSeconds, finisher: 1, players: crew ? crew.players.length : e.players || 1, crew: crew ? crew.players : null, awards: e.awards || null, at: Date.now() };
    try { localStorage.setItem('shred-a-billion.last_finish', JSON.stringify(this.record)); } catch (e) { }
    this.save();
    this.game.finale.whiteK = 0;          // the cinematic draws its own white (BustedUI/White) from here on
    const w = document.getElementById('white'); if (w) { w.style.opacity = '0'; w.style.display = 'none'; w._a = '0.000'; }
    this.arrest.play(this.record, () => this.afterArrest());
  }
  afterArrest() {
    // released: "Out on bail.", parked outside the sealed door, then the summary screen opens
    const p = this.player, F = this.game.finale;
    if (-p.pos[2] > -DOOR[2] + 0.3) { p.pos = outsideDoor(); p.vel = [0, 0, 0]; p.yaw = 0; p.pitch = -0.1; }
    F.whiteK = 0;
    this.hud.toast(this.T('ending.bail'), '', 3000);
    this.summary();
  }
  update(dt, input) { if (this.phase === 'arrest') this.arrest.update(dt, input); if (this.phase === 'summary' && this.tick) this.tick(dt); }

  // EndOfRunScreen (f25)
  summary() {
    this.phase = 'summary';
    const g = this.game, F = g.finale, r = F.run, st = g.econ.stats.tracked, T = this.T, N = this.Num;
    const shredded = r.shredded > 0 ? r.shredded : (st.DollarsEarned || 0);
    const relicsTotal = (g.data.relics || []).length;
    const tiles = [
      ['currency', 'finale.stat.dollars', shredded, (v) => '$' + N.short(v), '#f9c52f'],
      ['icon_bill', 'finale.stat.bills', st.BillsShredded || 0, (v) => N.full(v), '#4be37a'],
      ['trophy', 'finale.stat.biggest', r.biggest || st.BiggestShred || 0, (v) => '$' + N.short(v), '#f9c52f'],
      ['star', 'finale.stat.upgrades', st.UpgradesBought || 0, (v) => N.full(v), '#ffffff'],
      ['crown', 'finale.stat.boosts', st.BoostsCollected || 0, (v) => N.full(v), '#ffffff'],
      ['GOLD_BAR', 'finale.stat.relics', g.econ.relics.size, (v) => T('finale.stat.relics_of', Math.round(v), relicsTotal), '#ffffff'],
    ];
    const tools = r.tools, sum = tools.reduce((a, b) => a + b, 0) || 1, fav = F.favourite();
    const rank = !r.timed ? T('finale.rank.untimed') : '';
    const photos = this.arrest.photos || [];
    // co-op: THE CREW, one row per player with their dollars (RunPlayer, all tools but the drones) and RunAward chips
    const crew = this.crew && this.crew(), ps = r.players || {}, awards = (this.record && this.record.awards) || {};
    const crewRows = crew ? crew.players.map(p => { const R = ps[p.s] || { dollars: [0, 0, 0, 0, 0, 0] }, d = R.dollars.slice(0, 5).reduce((a, b) => a + b, 0);
      const nm = p.n || T('net.player', p.s + 1);
      return `<div class="crewRow"><i style="background:${COLORS[p.s & 3]}"></i><b>${esc(nm)}${p.s === crew.me ? ` <em>${esc(T('finale.player.you'))}</em>` : ''}</b><span class="v">$${esc(N.short(d))}</span>
        <span class="chips">${(awards[p.s] || []).map(k => `<span class="chip">${esc(T('finale.award.' + k))}</span>`).join('')}</span></div>`; }).join('') : '';
    this.ui.innerHTML = `<div class="screen endScreen" id="endScr"><div class="endCard">
      <div class="endHead"><div class="endTitle">${esc(T('finale.busted.title'))}</div><div class="endSub">${esc(T('finale.busted.subtitle'))}</div></div>
      <div class="endBody">
        <div class="endLeft">
          <div class="endTimeRow"><div><div class="cap">${esc(T('finale.run_time'))}</div><div class="endTime" id="endTime">${runClock(r.finaleSeconds)}</div></div>
            <div class="endPhotos">${photos.slice(0, 2).map(u => `<img src="${u}" alt="">`).join('')}</div></div>
          <div class="endRank">${esc(rank)}</div>
          <div class="endTiles">${tiles.map((t, i) => `<div class="endTile" data-i="${i}"><img src="${UI}${t[0]}.webp" alt=""><div class="cap">${esc(T(t[1]))}</div><div class="v" style="color:${t[4]}">${esc(t[3](0))}</div></div>`).join('')}</div>
        </div>
        <div class="endRight">
          <div class="cap">${esc(T('finale.share.title'))}</div>
          <div class="shareBar">${tools.map((v, i) => v > 0 ? `<i style="width:${(100 * v / sum).toFixed(2)}%;background:${TOOLS[i][1]}"></i>` : '').join('')}</div>
          <div class="shareLeg">${TOOLS.map((t, i) => i === 0 && !tools[0] ? '' : `<span><b style="background:${t[1]}"></b>${esc(T(t[0]))} <em>${Math.round(100 * tools[i] / sum)}%</em></span>`).join('')}</div>
          <div class="cap" style="margin-top:.8em">${esc(T(crew ? 'finale.players.crew' : 'finale.players.solo'))}</div>
          ${crew ? `<div class="crewList">${crewRows}</div>` : ''}<div class="youCard${crew ? ' hidden' : ''}"><div class="you">${esc(T('finale.player.you'))}</div><div class="youV">$${esc(N.short(shredded))}</div><div class="cap">${esc(T('finale.player.fed_solo'))}</div>
            ${fav >= 0 ? `<div class="fav">${esc(T('finale.player.favourite', T(TOOLS[fav][0])))}</div>` : ''}
            <div class="walk">${esc(T('finale.player.walk', N.full(Math.round(st.DistanceWalked || 0)), Math.round(st.DeepestDepth || 0)))}</div></div>
        </div>
      </div>
      <div class="endBtns"><button class="sbtn gold" id="endCont">${esc(T('finale.continue'))}</button>${photos.length ? `<button class="sbtn" id="endPhoto">📷 ${esc(T('finale.photo.save'))}</button>` : ''}</div>
      <div class="endBrand">SHRED A BILLION</div>
    </div></div>`;
    const $ = (id) => this.ui.querySelector('#' + id);
    // tiles revealed one by one with a number ticker
    let t = 0; const els = [...this.ui.querySelectorAll('.endTile')];
    this.tick = (dt) => {
      t += dt;
      els.forEach((el, i) => { const at = 0.4 + i * 0.35, k = Math.min(1, Math.max(0, (t - at) / 0.8)); el.classList.toggle('on', t >= at); el.querySelector('.v').textContent = tiles[i][3](tiles[i][2] * (1 - Math.pow(1 - k, 3))); });
    };
    $('endCont').addEventListener('click', () => { this.sfx('UiClick'); this.thanks(); });
    const ph = $('endPhoto'); if (ph) ph.addEventListener('click', () => {
      photos.forEach((u, i) => { const a = document.createElement('a'); a.href = u; a.download = `shred-a-billion-mugshot-${i + 1}.png`; a.click(); });
      ph.textContent = T('finale.photo.saved'); this.hud.toast(T('finale.photo.toast'), '', 2600);
    });
    if (this.bot()) setTimeout(() => this.thanks(), 300);
  }
  thanks() {
    this.phase = 'thanks'; this.tick = null; const T = this.T;
    this.ui.innerHTML = `<div class="screen endScreen"><div class="endCard thanksCard"><div class="note">${esc(T('finale.credits.dev_note')).replace(/\n/g, '<br>')}</div>
      <div class="endBtns"><button class="sbtn gold" id="endNext">${esc(T('finale.continue'))}</button></div></div></div>`;
    this.ui.querySelector('#endNext').addEventListener('click', () => { this.sfx('UiClick'); this.credits(); });
    if (this.bot()) setTimeout(() => this.credits(), 300);
  }
  credits() {
    this.phase = 'credits'; const T = this.T;
    const rows = [['mainmenu.credits.created_by', 'LightTriadGames'], ['mainmenu.credits.sound', T('mainmenu.credits.synthesized_in_house_one')], ['mainmenu.credits.special_thanks', T('mainmenu.credits.everyone_who_ever_wanted')], ['finale.credits.players_title', T('finale.credits.players_line')]];
    this.ui.innerHTML = `<div class="screen endScreen creditsScr"><div class="roll" id="roll"><div class="rt">${esc(T('mainmenu.credits.title'))}</div><div class="rs">${esc(T('mainmenu.credits.subtitle'))}</div>
      ${rows.map(([h, v]) => `<div class="rh">${esc(T(h))}</div><div class="rv">${esc(v)}</div>`).join('')}<div class="rt end">${esc(T('mainmenu.credits.thanks'))}</div></div>
      <button class="sbtn" id="credSkip">${esc(T('finale.credits.skip'))}</button></div>`;
    const roll = this.ui.querySelector('#roll'); let y = 0, done = false;
    const end = () => { if (done) return; done = true; this.tick = null; this.ask(); };
    this.ui.querySelector('#credSkip').addEventListener('click', () => { this.sfx('UiClick'); end(); });
    this.tick = (dt) => { y += dt * 60; roll.style.transform = `translateY(${-y}px)`; if (y > roll.offsetHeight + innerHeight * 0.6) end(); };
    this.phase = 'summary';   // reuse the tick path
    if (this.bot()) setTimeout(end, 300);
  }
  // AfterCredits: "Keep playing?" -> stay (encore.stay, back at the spawn) or the main menu
  ask() {
    this.phase = 'ask'; const T = this.T;
    if (this.guest && this.guest()) return this.waitHost();
    this.ui.innerHTML = `<div class="screen endScreen"><div class="endCard askCard"><img src="${UI}thief_delighted.webp" alt=""><div class="note">${esc(T('encore.ask.body'))}</div>
      <div class="endBtns"><button class="sbtn gold" id="askStay">${esc(T('finale.menu.no'))}</button><button class="sbtn" id="askMenu">${esc(T('finale.main_menu'))}</button></div></div></div>`;
    const fin = (stay) => {
      this.ui.innerHTML = ''; this.phase = null; this.tick = null;
      if (stay) { this.game.flags.add(FL.STAY); const sp = this.game.markers.spawn; this.player.pos = sp.slice(); this.player.vel = [0, 0, 0]; this.player.yaw = 0; this.player.pitch = -0.15; this.hud.toast(T('encore.hint'), '', 4500); }
      this.leave(stay);
    };
    this.ui.querySelector('#askStay').addEventListener('click', () => { this.sfx('UiClick'); fin(true); });
    this.ui.querySelector('#askMenu').addEventListener('click', () => { this.sfx('UiClick'); fin(false); });
    if (this.bot()) setTimeout(() => fin(true), 300);
  }
  // co-op guest: only the host is asked (encore.wait_host); the host staying (encore.stay) brings everyone back
  waitHost() {
    const T = this.T;
    this.ui.innerHTML = `<div class="screen endScreen"><div class="endCard askCard"><img src="${UI}thief_delighted.webp" alt=""><div class="note">${esc(T('encore.wait_host'))}</div></div></div>`;
    this.phase = 'summary';
    this.tick = () => {
      if (!this.game.flags.has(FL.STAY)) return;
      this.ui.innerHTML = ''; this.phase = null; this.tick = null;
      const sp = this.game.markers.spawn; this.player.pos = sp.slice(); this.player.vel = [0, 0, 0]; this.player.yaw = 0; this.player.pitch = -0.15;
      this.hud.toast(T('encore.hint'), '', 4500); this.leave(true);
    };
  }
}
