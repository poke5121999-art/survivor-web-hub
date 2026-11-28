// Co-op screens (rules/coop.md §A, UC/CoopMenuPanel): PLAY WITH FRIENDS -> HOST A GAME (pick the vault slot, privacy) or
// JOIN A GAME (room code or the list of open rooms), the JOINING overlay, the CO-OP error card, the in-game roster bar
// (room code + coloured players) and the PLAYERS block of the pause menu. Text from the game's own net.* keys.
// The web build has no Steam: friends join with the 6-character Lobby code (or from the list when the host lets
// friends join), which is the "own code" rules/coop.md A asks the port for.
import { T } from '../sim/i18n.js';
import { Save } from '../save.js';
import { Num } from '../sim/economy.js';
import { COLORS } from '../sim/coop.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LAST = 'shred-a-billion.coop.last', DAY = 24 * 3600 * 1000;
export function rememberSession(o) { try { localStorage.setItem(LAST, JSON.stringify({ ...o, at: Date.now() })); } catch (e) { } }
export function lastSession() { try { const L = JSON.parse(localStorage.getItem(LAST) || 'null'); return L && Date.now() - L.at < DAY ? L : null; } catch (e) { return null; } }
export const playerName = (p) => (p && p.n) || T('net.player', ((p && p.s) | 0) + 1);

export class CoopUi {
  // h: { sfx(name), back(), host(slot, fresh, isPrivate), join({ code } | { lobbyId }), list() -> Promise<rows> }
  constructor(root, h) { this.root = root; this.h = h; this.isPrivate = false; this.timer = null; }
  click(el, fn) { if (el) el.addEventListener('click', (e) => { e.stopPropagation(); this.h.sfx('UiClick'); fn(e); }); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  panel(title, sub, body, wide = 620) {
    this.stop();
    this.root.innerHTML = `<div class="screen" id="coopScr"><div class="panel coopPanel" style="width:min(94vw,${wide}px)">
      <div class="ptitle">${esc(title)}</div><button class="pclose sbtn" id="cpClose">✕</button>
      ${sub ? `<div class="small coopSub">${esc(sub)}</div>` : ''}${body}</div></div>`;
    this.click(this.root.querySelector('#cpClose'), () => { this.stop(); this.h.back(); });
    return (id) => this.root.querySelector('#' + id);
  }
  // PLAY WITH FRIENDS
  menu() {
    const $ = this.panel(T('net.menu.title'), T('net.menu.sub'), `<div class="coopRoot">
      <button class="coopBig" id="cpHost"><b>${esc(T('net.host.title'))}</b><span>${esc(T('net.ui.root.host.sub'))}</span></button>
      <button class="coopBig" id="cpJoin"><b>${esc(T('net.join.title'))}</b><span>${esc(T('net.ui.root.join.sub'))}</span></button></div>${this.lastCard()}`);
    this.click($('cpHost'), () => this.hostScreen());
    const L = lastSession();
    if ($('cpRejoin')) this.click($('cpRejoin'), () => this.h.join({ lobbyId: L.lobbyId }));
    if ($('cpReopen')) this.click($('cpReopen'), () => this.h.host(L.slot, false, !!L.isPrivate));
    this.click($('cpJoin'), () => this.joinScreen());
  }
  // RejoinCard (UC/RejoinCard.c): REJOIN the room you were in, or (host) REOPEN TO FRIENDS the slot you hosted < 24 h ago
  lastCard() {
    const L = lastSession(); if (!L) return '';
    if (L.kind === 'join') return `<div class="coopRe"><b>${esc(T('net.rejoin.title.friend'))}</b><span>${esc(T('net.rejoin.sub'))}</span><button class="sbtn gold" id="cpRejoin">${esc(T('net.rejoin.button'))}</button></div>`;
    if (L.kind === 'host' && Save.summary(L.slot)) return `<div class="coopRe"><b>${esc(T('net.reopen.title'))}</b><span>${esc(T('net.reopen.sub', L.slot + 1))}</span><button class="sbtn gold" id="cpReopen">${esc(T('net.reopen.button'))}</button></div>`;
    return '';
  }
  // HOST A GAME: a saved slot is loaded and opened, an empty one starts a new vault there
  hostScreen() {
    const card = (i) => {
      const s = Save.summary(i);
      const d = s ? T('net.host.slot_sub', Num.money(s.dollars || 0), s.level || 1, Num.time(s.played || 0)) : T('net.host.new_vault');
      return `<div class="slotCard" data-i="${i}"><div class="h">${esc(T('net.host.slot', i + 1))}</div><div class="d">${esc(d)}</div></div>`;
    };
    const $ = this.panel(T('net.host.title'), T('net.host.sub'), `<div class="coopPriv"><button class="sbtn" id="cpPub">${esc(T('net.privacy.friends'))}</button><button class="sbtn" id="cpPriv">${esc(T('net.privacy.invite'))}</button></div>
      <div class="slots">${[0, 1, 2].map(card).join('')}</div>`);
    const paint = () => { $('cpPub').classList.toggle('off', this.isPrivate); $('cpPriv').classList.toggle('off', !this.isPrivate); };
    paint();
    this.click($('cpPub'), () => { this.isPrivate = false; paint(); });
    this.click($('cpPriv'), () => { this.isPrivate = true; paint(); });
    this.root.querySelectorAll('.slotCard').forEach(c => this.click(c, () => { const i = +c.dataset.i; this.h.host(i, !Save.summary(i), this.isPrivate); }));
  }
  // JOIN A GAME: a room code, or a row of the open-room list (refreshed every 10 s while open)
  joinScreen() {
    const $ = this.panel(T('net.join.title'), T('net.join.sub'), `<div class="coopCode"><input id="cpCode" maxlength="6" autocomplete="off" spellcheck="false" placeholder="ABC123">
      <button class="sbtn gold" id="cpGo">${esc(T('net.invite.yes'))}</button></div>
      <div class="coopListHead"><span class="small"></span><button class="sbtn off" id="cpRef">${esc(T('net.ui.join.refresh.label'))}</button></div>
      <div class="coopList" id="cpList"></div>`);
    const code = $('cpCode');
    code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); $('cpGo').classList.toggle('off', code.value.length !== 6); });
    code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && code.value.length === 6) this.h.join({ code: code.value }); });
    $('cpGo').classList.add('off');
    this.click($('cpGo'), () => { if (code.value.length === 6) this.h.join({ code: code.value }); });
    const load = () => this.h.list().then(rows => {
      const L = this.root.querySelector('#cpList'); if (!L) return;
      L.innerHTML = rows.length ? rows.map(r => `<button class="coopRow${r.players >= r.max ? ' off' : ''}" data-id="${esc(r.id)}"><b>${esc(r.host || r.name)}</b><span>${esc(r.vault || '')}</span><em>${esc(T('net.join.players#other', r.players, r.max))}</em></button>`).join('')
        : `<div class="small">${esc(T('net.lobby.alone'))}</div>`;
      L.querySelectorAll('.coopRow').forEach(b => { if (!b.classList.contains('off')) this.click(b, () => this.h.join({ lobbyId: b.dataset.id })); });
    }).catch(e => { const L = this.root.querySelector('#cpList'); if (L) L.innerHTML = `<div class="small">${esc(T('net.err.join_failed'))}<br>${esc(e.message || e)}</div>`; });
    this.click($('cpRef'), load);
    load(); this.timer = setInterval(load, 10000);
    setTimeout(() => code.focus(), 50);
  }
  overlay(title, sub) {
    this.stop();
    this.root.innerHTML = `<div class="screen" id="coopScr"><div class="panel coopPanel" style="width:min(90vw,460px);text-align:center"><div class="ptitle">${esc(title)}</div>
      <div class="coopSpin"></div><div class="small">${esc(sub || '')}</div></div></div>`;
  }
  error(msg, detail, retry) {
    const $ = this.panel(T('net.err.join_title'), '', `<div class="coopErr">${esc(msg)}</div>${detail ? `<div class="small coopDetail">${esc(detail)}</div>` : ''}
      <div class="endBtns">${retry ? `<button class="sbtn gold" id="cpRetry">${esc(T('net.err.retry'))}</button>` : ''}<button class="sbtn off" id="cpBack">${esc(T('menu.close'))}</button></div>`, 520);
    if (retry) this.click($('cpRetry'), retry);
    this.click($('cpBack'), () => this.h.back());
  }
}

// voice badge on a roster row (rules/voice.md K, VoiceRosterBadge): local row = mic muted (red) or live (gold mic);
// remote row = muted by me / volume 0 (grey speaker-off), else speaking (gold mic). Nothing outside a voice session.
const voiceOf = () => { const v = typeof window !== 'undefined' && window.__voice; return v && v.attached && v.attached() ? v : null; };
function vbadge(p, me) {
  const v = voiceOf(); if (!v) return '';
  if (p.s === me) return v.micMuted ? '<span class="vbadge mmut"></span>' : p.talk ? '<span class="vbadge"></span>' : '';
  if (v.playerMuted(p.s) || v.playerVolume(p.s) <= 0.001) return '<span class="vbadge pmut"></span>';
  return p.talk ? '<span class="vbadge"></span>' : '';
}
// per-player mute + volume 0..2 (step 0.05) in the pause PLAYERS list (VoicePlayerControls), remembered for the session
function vctl(p, me) {
  const v = voiceOf(); if (!v || p.s === me) return '';
  const vol = v.playerVolume(p.s);
  return `<span class="vctl" data-vid="${p.s}"><button class="${v.playerMuted(p.s) ? 'mut' : ''}" data-vmute="${p.s}"><i></i></button><input type="range" min="0" max="2" step="0.05" value="${vol}" data-vvol="${p.s}"><span>${Math.round(vol * 100)}%</span></span>`;
}
if (typeof document !== 'undefined') {
  document.addEventListener('input', (e) => {
    const t = e.target, v = voiceOf(); if (!v || !t.dataset || t.dataset.vvol == null) return;
    v.setPlayerVolume(+t.dataset.vvol, +t.value); if (t.nextElementSibling) t.nextElementSibling.textContent = Math.round(v.playerVolume(+t.dataset.vvol) * 100) + '%';
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-vmute]'), v = voiceOf(); if (!b || !v) return;
    e.stopPropagation(); const id = +b.dataset.vmute; v.setPlayerMuted(id, !v.playerMuted(id)); b.classList.toggle('mut', v.playerMuted(id));
  }, true);
}

// the in-game bar: room code (click copies it) and the players by colour; hidden in solo
export class CoopBar {
  constructor() { this.el = document.createElement('div'); this.el.id = 'coopBar'; this.el.className = 'hidden'; (document.getElementById('hud') || document.body).appendChild(this.el); this.sig = ''; }
  set(info) {
    if (!info) { this.el.className = 'hidden'; this.sig = ''; return; }
    const html = `${info.code ? `<button class="code" title="copy">${esc(info.code)}</button>` : ''}${info.players.map(p => `<span class="pl"><i style="background:${COLORS[p.s & 3]}"></i>${esc(playerName(p))}${vbadge(p, info.me)}${p.s === 0 ? ` <em>${esc(T(info.me === 0 ? 'net.tag.host_you' : 'net.tag.host'))}</em>` : p.s === info.me ? ` <em>${esc(T('net.tag.you'))}</em>` : ''}</span>`).join('')}`;
    if (html === this.sig) return; this.sig = html;
    this.el.className = '';
    this.el.innerHTML = html;
    const b = this.el.querySelector('.code'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); try { navigator.clipboard.writeText(info.code); } catch (err) { } });
  }
}
// PLAYERS block for the pause menu
export function pausePlayers(info) {
  if (!info) return '';
  return `<div class="coopPause"><div class="cap">${esc(T('net.pause.players'))}${info.code ? ` · <b>${esc(info.code)}</b>` : ''}</div>${info.players.map(p => `<div class="pl"><i style="background:${COLORS[p.s & 3]}"></i>${esc(playerName(p))}${vbadge(p, info.me)}${vctl(p, info.me)}<em>${p.s === info.me ? esc(T(p.s === 0 ? 'net.tag.host_you' : 'net.tag.you')) : p.s === 0 ? esc(T('net.tag.host')) : ''}</em></div>`).join('')}</div>`;
}
