// Entry: the menu paints first (DOM only); the store backdrop, three.js and the solo game's modules load after it.
// New / Load Store host a room, Join Store joins one; either way the page then becomes one co-op store.
import { mountMenu } from './menu.js';
import { hostRoom, joinRoom, listRooms } from './net/room.js';
import { HostNet, GuestNet } from './net/session.js';

const V = new URL(import.meta.url).searchParams.get('v') || '';
const SOLO = new URL('../../casual-farm/', import.meta.url).href;
const params = new URLSearchParams(location.search);
const MAX_PLAYERS = 4;

// Unity Relay regions (GET /v1/regions, 2026-10-28) grouped by the menu's map areas.
const REGIONS = [
  { id: 'asia-southeast1', label: 'Singapore', area: 'asia' },
  { id: 'asia-northeast1', label: 'Tokyo', area: 'asia' },
  { id: 'asia-south1', label: 'Mumbai', area: 'india' },
  { id: 'australia-southeast1', label: 'Sydney', area: 'oceania' },
  { id: 'europe-west4', label: 'Netherlands', area: 'eu' },
  { id: 'europe-north1', label: 'Finland', area: 'eu' },
  { id: 'europe-central2', label: 'Warsaw', area: 'eu' },
  { id: 'us-central1', label: 'Iowa', area: 'na' },
  { id: 'us-east1', label: 'South Carolina', area: 'na' },
  { id: 'us-west1', label: 'Oregon', area: 'na' },
  { id: 'southamerica-east1', label: 'São Paulo', area: 'sa' },
];
// The browser cannot measure relay latency, so the time zone picks (RelayRegions.For in D:/REPO_Meta does the same).
function guessRegion() {
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/')[0];
  const off = -new Date().getTimezoneOffset() / 60;
  if (tz === 'Australia' || tz === 'Pacific') return 'australia-southeast1';
  if (tz === 'Asia') return off >= 8.5 ? 'asia-northeast1' : off <= 6 ? 'asia-south1' : 'asia-southeast1';
  if (tz === 'Europe' || tz === 'Africa') return 'europe-west4';
  if (tz === 'America') return off <= -7 ? 'us-west1' : off >= -3 ? 'southamerica-east1' : 'us-east1';
  return 'asia-southeast1';
}

const local = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
};
const SAVES = 'mmc-saves';
const options = local.get('mmc-options', { name: '', music: 0.6, sfx: 0.8 });
if (!options.name) options.name = `Player${Math.floor(Math.random() * 900 + 100)}`;

const marts = (await fetch(`${SOLO}data/marts.json?v=${V}`).then(r => r.json())).filter(m => !m.seasonal)
  .map(m => ({ id: m.id, name: m.name, mats: m.mats, icon: `${SOLO}art/ui/${m.icon}.webp` }));

const menuRoot = document.getElementById('menu');
const bg = document.getElementById('bg');
const stageEl = document.getElementById('stage');
let backdrop = null;
let session = null;   // { kind: 'host' | 'guest', game, net, room, ... }
const mmc = window.__mmc = { stage: 'menu' };

const ctl = {
  lang: local.get('mmc-lang', document.documentElement.lang === 'en' ? 'en' : 'vi'),
  setLang: l => local.set('mmc-lang', l),
  marts,
  regions: REGIONS,
  region: local.get('mmc-region', guessRegion()),
  options,
  saveOptions: o => { Object.assign(options, o); local.set('mmc-options', options); },
  newStore: o => host({ ...o, id: `s${Date.now().toString(36)}`, save: null }),
  listSaves: () => local.get(SAVES, []),
  loadStore: (id, o) => {
    const meta = local.get(SAVES, []).find(s => s.id === id);
    if (!meta) return Promise.reject(new Error('save not found'));
    return host({ ...meta, ...o, save: local.get(`mmc-save-${id}`, null) });
  },
  deleteSave: id => { local.set(SAVES, local.get(SAVES, []).filter(s => s.id !== id)); local.del(`mmc-save-${id}`); },
  listRooms: () => listRooms(),
  joinStore: o => join(o),
};
const menu = mountMenu(menuRoot, ctl);
mmc.menuAt = performance.now();
if (params.get('msg')) menu.error(params.get('msg'));

// The backdrop waits for the first paint of the menu and for an idle moment, then plays Store 1 with the solo bot.
const startBackdrop = async () => {
  if (session || backdrop || params.has('nobg')) return;
  const { startGame } = await import(`./game.js?v=${V}`);
  if (session) return;
  backdrop = startGame({ canvas: bg, hudRoot: document.createElement('div'), mart: 'store1', role: 'attract',
    onStage: s => { mmc.backdrop = s; } }).catch(e => { console.warn('backdrop', e); return null; });
};
(window.requestIdleCallback || (f => setTimeout(f, 200)))(() => startBackdrop(), { timeout: 800 });

async function enterStore(mart, role, extra) {
  const { startGame, prefetch } = await import(`./game.js?v=${V}`);
  prefetch(mart);
  const b = backdrop && await backdrop;
  backdrop = null;
  if (b) b.stop();
  bg.hidden = true;
  stageEl.hidden = false;
  menu.hide();
  document.body.classList.add('in-store');
  return startGame({ canvas: document.getElementById('game'), hudRoot: document.getElementById('hud'), mart, role, ...extra,
    onStage: s => { mmc.stage = s; } });
}

// --- host -------------------------------------------------------------------------------------------------------
async function host(o) {
  local.set('mmc-region', o.region);
  const name = (o.name || `${options.name}'s Mart`).slice(0, 32);
  const room = await hostRoom({ name, isPrivate: o.isPrivate, mart: o.mart, difficulty: o.difficulty, region: o.region,
    playerName: options.name, maxPlayers: MAX_PLAYERS });
  let game;
  try {
    game = await enterStore(o.mart, 'host', { difficulty: o.difficulty, save: o.save });
  } catch (e) {
    room.close();
    throw e;
  }
  const meta = { id: o.id, name, mart: o.mart, difficulty: o.difficulty };
  const net = new HostNet({ link: room.link, sim: game.sim, hostName: options.name, maxPlayers: MAX_PLAYERS,
    info: { mart: o.mart, difficulty: o.difficulty, name },
    onCommand: (pid, m) => command(game.sim, m),
    onRoster: (list, change) => { if (change && change.uid) room.free(change.uid); bar.roster(list); } });
  session = { kind: 'host', game, net, room };
  const save = () => {
    const d = game.sim.save();
    const list = local.get(SAVES, []).filter(s => s.id !== meta.id);
    const done = Object.values(game.sim.state.mats).filter(m => m.done).length;
    list.unshift({ ...meta, savedAt: Date.now(), done, total: game.store.mats.length });
    local.set(SAVES, list.slice(0, 20));
    local.set(`mmc-save-${meta.id}`, d);
  };
  let saveT = 0;
  game.afterStep = dt => {
    net.update(dt);
    saveT += dt;
    if (saveT > 10) { saveT = 0; save(); }
  };
  save();
  const bar = storeBar({ name, code: room.code, isPrivate: o.isPrivate, onLeave: () => { save(); net.close(); room.close(); back(); } });
  bar.roster(net.roster());
  window.addEventListener('pagehide', () => { save(); net.close(); room.close(true); });
  Object.assign(mmc, { role: 'host', code: room.code, net, game, room });
}

// A guest's HUD buttons that change the store, run on the host instead.
function command(sim, m) {
  if (m.op === 'upgrade' && m.slot) sim.buyUpgrade({ kind: m.slot.kind, i: m.slot.i, name: m.slot.name }, m.track || null);
  else if (m.op === 'claim' && sim.boosters) sim.boosters.claim();
  else if (m.op === 'claimCash' && sim.boosters) sim.boosters.claimCash();
}

// --- guest ------------------------------------------------------------------------------------------------------
async function join(o) {
  const room = await joinRoom({ ...o, playerName: options.name });
  const net = new GuestNet({ link: room.link, name: options.name, uid: room.uid });
  let welcome;
  try {
    welcome = await net.join();
  } catch (e) {
    room.leave();
    room.link.close();
    throw e;
  }
  const game = await enterStore(welcome.info.mart, 'guest', { difficulty: welcome.info.difficulty, welcome });
  const sim = game.sim, me = welcome.you;
  sim.buyUpgrade = (slot, track) => { net.command('upgrade', { slot: { kind: slot.kind, i: slot.i, name: slot.name }, track }); return true; };
  if (sim.boosters) {
    sim.boosters.claim = () => net.command('claim');
    sim.boosters.claimCash = () => net.command('claimCash');
  }
  net.onTick = (wire, events) => {
    sim.adopt(wire);
    for (const e of events) {
      if (e.pid === me) delete e.pid;
      else if (e.pid == null) e.pid = 'host';
      sim.emit(e);
    }
    const names = Object.entries(wire.players || {}).map(([id, p]) => ({ id, name: p.name }));
    bar.roster(names, me);
  };
  net.onKick = why => { session = null; room.leave(); back(why === 'version' ? 'Phiên bản khác chủ phòng, tải lại trang' : 'Chủ phòng đã đóng cửa hàng'); };
  game.afterStep = dt => net.update(dt, sim.pose());
  session = { kind: 'guest', game, net, room };
  const bar = storeBar({ name: welcome.info.name, code: room.lobby.lobbyCode, onLeave: () => { net.leave(); room.leave(); back(); } });
  window.addEventListener('pagehide', () => { net.leave(); room.leave(true); });
  Object.assign(mmc, { role: 'guest', me, net, game, room });
}

// Back to the menu: a fresh page is the simplest clean slate (WebGL, sockets, timers); the tab keeps its UGS session.
function back(msg) {
  const q = new URLSearchParams();
  if (msg) q.set('msg', msg);
  location.href = `${location.pathname}${q.toString() ? `?${q}` : ''}`;
}

// The strip over the store: name, room code (tap to copy), who is in, leave.
function storeBar({ name, code, isPrivate, onLeave }) {
  const el = document.createElement('div');
  el.className = 'mmc-bar';
  el.innerHTML = '<b class="n"></b><button class="code" title="Copy"></button><span class="who"></span><button class="leave">✕</button>';
  el.querySelector('.n').textContent = name;
  el.querySelector('.code').textContent = code;
  el.querySelector('.code').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(code).catch(() => {}); });
  el.querySelector('.leave').addEventListener('click', onLeave);
  stageEl.appendChild(el);
  const colors = ['#ff5a5a', '#4fb3ff', '#ffd23f', '#7ee06b', '#c77dff'];
  return {
    roster(list) {
      const who = el.querySelector('.who');
      who.replaceChildren(...list.map(p => {
        const s = document.createElement('i');
        const n = p.id === 'host' ? 0 : (parseInt(String(p.id).replace(/\D/g, ''), 10) || 0);
        s.style.background = colors[n % colors.length];
        s.textContent = p.name;
        return s;
      }));
      mmc.roster = list.map(p => p.name);
    },
  };
}
