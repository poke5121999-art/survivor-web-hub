// Entry: the menu paints first (DOM only); the store backdrop, three.js and the solo game's modules load after it.
// New / Load Store host a room, Join Store joins one; either way the page then becomes one co-op store, and the whole
// room moves together when the host drives the van to the next mart or picks one on the map.
import { mountMenu } from './menu.js';

// The network modules load on first use, so the menu waits on two files only (Pages answers an edge miss in 0.4-1 s).
const loadNet = () => Promise.all([import('./net/room.js'), import('./net/session.js'), import('./cloud.js')])
  .then(([r, s, c]) => ({ ...r, ...s, cloud: c }));

const V = new URL(import.meta.url).searchParams.get('v') || '';
const SOLO = new URL('../../casual-farm/', import.meta.url).href;
const params = new URLSearchParams(location.search);
const MAX_PLAYERS = 4;
const RECONNECTS = 3;

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
  keys() { try { return Object.keys(localStorage); } catch (e) { return []; } },
};

// --- stores -----------------------------------------------------------------------------------------------------
// One record per co-op store, the solo game's "global" plus every mart's sim save:
//   { id, name, difficulty, mart, cash, gold, visited, idleAt, stars, prestige, shop, ..., marts: { id: simSave },
//     savedAt, done, total }
const STORE_KEY = id => `mmc-store-${id}`;
const records = {
  all() {
    const out = {};
    for (const k of local.keys()) if (k.startsWith('mmc-store-')) { const r = local.get(k, null); if (r && r.id) out[r.id] = r; }
    return out;
  },
  put(r) { local.set(STORE_KEY(r.id), r); },
  del(id) { local.del(STORE_KEY(id)); },
};
// Rev 20261028a kept one mart per store: mmc-saves (list) + mmc-save-<id> (that mart's sim save).
for (const s of local.get('mmc-saves', [])) {
  const d = local.get(`mmc-save-${s.id}`, null);
  if (!local.get(STORE_KEY(s.id), null)) records.put({ ...s, cash: d ? d.cash || 0 : 0, marts: d ? { [s.mart]: d } : {}, visited: [s.mart] });
  local.del(`mmc-save-${s.id}`);
}
local.del('mmc-saves');

const options = local.get('mmc-options', { name: '', music: 0.6, sfx: 0.8 });
if (!options.name) options.name = `Player${Math.floor(Math.random() * 900 + 100)}`;
// The player's own outfits: their solo wardrobe the first time (games/casual-farm keeps it in mmm-global-v1).
const wardrobe = {
  saved: local.get('mmc-wardrobe', null) || ((local.get('mmm-global-v1', {}) || {}).cosmetics || null),
  keep(s) { this.saved = s; local.set('mmc-wardrobe', s); },
};

const allMarts = await fetch(`${SOLO}data/marts.json?v=${V}`).then(r => r.json());
const marts = allMarts.map(m => ({ id: m.id, name: m.name, mats: m.mats, seasonal: !!m.seasonal,
  icon: `${SOLO}art/ui/${m.seasonal ? 'menus/Mart_GrocerIcon' : m.icon}.webp` }));

const menuRoot = document.getElementById('menu');
const bg = document.getElementById('bg');
const stageEl = document.getElementById('stage');
let backdrop = null;
let session = null;   // { kind: 'host' | 'guest', game, net, room }
const mmc = window.__mmc = { stage: 'menu' };

const ctl = {
  lang: local.get('mmc-lang', document.documentElement.lang === 'en' ? 'en' : 'vi'),
  setLang: l => local.set('mmc-lang', l),
  marts,
  regions: REGIONS,
  region: local.get('mmc-region', guessRegion()),
  options,
  saveOptions: o => { Object.assign(options, o); local.set('mmc-options', options); },
  newStore: o => host({ id: `s${Date.now().toString(36)}`, name: (o.name || `${options.name}'s Mart`).slice(0, 32), difficulty: o.difficulty,
    mart: o.mart, cash: 0, marts: {} }, o),
  listSaves: () => Object.values(records.all()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .map(r => ({ id: r.id, name: r.name, mart: r.mart, difficulty: r.difficulty || 0, savedAt: r.savedAt || 0, done: r.done || 0, total: r.total || 0 })),
  loadStore: (id, o) => {
    const r = records.all()[id];
    return r ? host(r, o) : Promise.reject(new Error('save not found'));
  },
  deleteSave: id => records.del(id),
  listRooms: () => loadNet().then(n => n.listRooms()),
  joinStore: o => join(o),
};
const menu = mountMenu(menuRoot, ctl);
mmc.menuAt = performance.now();
if (params.get('msg')) menu.error(params.get('msg'));

// A signed-in hub account brings its stores from other devices (the Load Store list reads records afresh each time).
loadNet().then(n => n.cloud.pull(() => records.all(), r => records.put(r), id => records.del(id))).then(s => { mmc.cloud = s; }, () => { mmc.cloud = 'off'; });

// The backdrop waits for the first paint of the menu and for an idle moment, then plays Store 1 with the solo bot.
const startBackdrop = async () => {
  if (session || backdrop || params.has('nobg')) return;
  const { startGame } = await import(`./game.js?v=${V}`);
  if (session) return;
  backdrop = startGame({ canvas: bg, hudRoot: document.createElement('div'), mart: 'store1', role: 'attract', marts: allMarts,
    onStage: s => { mmc.backdrop = s; } }).catch(e => { console.warn('backdrop', e); return null; });
};
(window.requestIdleCallback || (f => setTimeout(f, 200)))(() => startBackdrop(), { timeout: 800 });

// Each store gets a fresh canvas: a stopped renderer loses its WebGL context and the canvas cannot get another.
async function enterStore(mart, role, extra) {
  const { startGame, prefetch } = await import(`./game.js?v=${V}`);
  prefetch(mart);
  const b = backdrop && await backdrop;
  backdrop = null;
  if (b) b.stop();
  if (session && session.game) { session.game.stop(); session.game = null; }
  bg.hidden = true;
  stageEl.hidden = false;
  menu.hide();
  document.body.classList.add('in-store');
  const old = document.getElementById('game'), canvas = document.createElement('canvas');
  canvas.id = 'game';
  old.replaceWith(canvas);
  mmc.stage = 'loading';
  return startGame({ canvas, hudRoot: document.getElementById('hud'), mart, role, marts: allMarts, wardrobe, ...extra,
    onStage: s => { mmc.stage = s; } });
}

// --- host -------------------------------------------------------------------------------------------------------
async function host(record, o) {
  const { hostRoom, HostNet, cloud } = await loadNet();
  local.set('mmc-region', o.region);
  const room = await hostRoom({ name: record.name, isPrivate: o.isPrivate, mart: record.mart, difficulty: record.difficulty, region: o.region,
    playerName: options.name, maxPlayers: MAX_PLAYERS });
  const info = () => ({ mart: record.mart, difficulty: record.difficulty, name: record.name });
  session = { kind: 'host', room, game: null, net: null };
  let travelling = false;
  const save = (force = false) => {
    const game = session.game;
    if (game) {
      const d = game.sim.save();
      record.cash = d.cash;
      keepBoosts(game.sim, record);
      record.marts = record.marts || {};
      record.marts[game.mart] = d;
      record.done = Object.values(game.sim.state.mats).filter(m => m.done).length;
      record.total = game.store.mats.length;
    }
    record.savedAt = Date.now();
    records.put(record);
    cloud.push(() => records.all(), force);
  };
  // Every way to another mart ends here: the next-mart van, the map card's GO, a prestige (wipe = that mart's save).
  const travel = async (id, wipe = null) => {
    if (travelling) return;
    travelling = true;
    if (wipe && session.game && session.game.mart === wipe) {
      record.cash = session.game.sim.state.cash;
      keepBoosts(session.game.sim, record);
    } else save();
    if (wipe && record.marts) delete record.marts[wipe];
    record.mart = id;
    records.put(record);
    room.ugs.updateLobby(room.lobby.id, { data: { mart: { visibility: 'public', value: id } } }).catch(() => {});
    try {
      await open(id);
    } finally {
      travelling = false;
    }
  };
  const open = async id => {
    const d = record.marts && record.marts[id];
    const game = await enterStore(id, 'host', { difficulty: record.difficulty, record, save: d ? { ...d, cash: record.cash } : null,
      hooks: { travel, save: () => save(true), deleteAccount } });
    session.game = game;
    if (session.net) session.net.rebind(game.sim, info());
    else {
      session.net = new HostNet({ link: room.link, sim: game.sim, hostName: options.name, maxPlayers: MAX_PLAYERS, info: info(),
        onCommand: (pid, m) => command(session.game, m),
        onRoster: (list, change) => { if (change && change.uid && change.why === 'timeout') room.free(change.uid); bar.roster(list); } });
    }
    let saveT = 0;
    game.afterStep = dt => {
      // Gold lives on the record; guests read it off the store state to pay for outfits.
      game.sim.state.coopGold = record.gold || 0;
      session.net.update(dt);
      saveT += dt;
      if (saveT > 10) { saveT = 0; save(); }
    };
    save();
    Object.assign(mmc, { role: 'host', code: room.code, net: session.net, game, room, record, travel });
  };
  try {
    await open(record.mart);
  } catch (e) {
    room.close();
    session = null;
    throw e;
  }
  const bar = storeBar({ name: record.name, code: room.code, onLeave: () => { save(true); session.net.close(); room.close(); back(); } });
  window.addEventListener('pagehide', () => { if (!session.leaving) { save(true); session.net.close(); room.close(true); } });
  bar.roster(session.net.roster());
  document.addEventListener('visibilitychange', () => { if (document.hidden && !session.leaving) save(true); });
}

// Running boosters as play seconds left (solo main.js keepBoosts): a reload or the next mart carries on with them.
function keepBoosts(sim, record) {
  const b = sim.state.boost, t = sim.state.t;
  record.boostLeft = Object.fromEntries(Object.entries(b.active || {}).map(([k, until]) => [k, Math.round((until - t) * 10) / 10]).filter(([, s]) => s > 0));
}

// Settings > Delete Account: every co-op store and the wardrobe go, here and in the hub account; a host's room closes
// first so nothing saves again.
async function deleteAccount() {
  const { cloud } = await loadNet();
  if (session) {
    session.leaving = true;
    if (session.kind === 'host') { session.net.close(); session.room.close(); } else { session.net.leave(); session.room.leave(); }
  }
  for (const id of Object.keys(records.all())) records.del(id);
  local.del('mmc-wardrobe');
  await cloud.wipe();
  back();
}

// What a guest's buttons change in the store, run on the host.
function command(game, m) {
  // Between marts there is no store to change; the guest's button press is dropped.
  if (!game) return;
  const sim = game.sim;
  if (m.op === 'upgrade' && m.slot) sim.buyUpgrade({ kind: m.slot.kind, i: m.slot.i, name: m.slot.name }, m.track || null);
  else if (m.op === 'claim' && sim.boosters) sim.boosters.claim();
  else if (m.op === 'claimCash' && sim.boosters) sim.boosters.claimCash();
  else if (m.op === 'carsCollect' && sim.cars && sim.cars.full()) sim.cars.collect();
  else if (m.op === 'spend') {
    // Outfits: cash from the shared wallet, gold from the store's prestige gold; never below zero.
    sim.state.cash -= Math.max(0, Math.min(+m.cash || 0, sim.state.cash));
    if (game.record) game.record.gold = Math.max(0, (game.record.gold || 0) - Math.max(0, +m.gold || 0));
  }
}

// --- guest ------------------------------------------------------------------------------------------------------
async function join(o, attempt = 0) {
  const { joinRoom, GuestNet } = await loadNet();
  const room = await joinRoom({ ...o, playerName: options.name });
  const net = new GuestNet({ link: room.link, name: options.name, uid: room.uid, looks: wardrobe.looks || null });
  let welcome;
  try {
    welcome = await net.join();
  } catch (e) {
    room.leave();
    room.link.close();
    throw e;
  }
  if (!session || session.kind !== 'guest') session = { kind: 'guest' };
  Object.assign(session, { net, room, rejoin: { lobbyId: room.lobby.id, relay: room.relay, lobbyCode: room.lobby.lobbyCode } });
  const bar = session.bar || (session.bar = storeBar({ name: welcome.info.name, code: room.lobby.lobbyCode,
    onLeave: () => { session.leaving = true; session.net.leave(); session.room.leave(); back(); } }));
  let ready = false;
  const open = async m => {
    ready = false;
    const game = await enterStore(m.info.mart, 'guest', { difficulty: m.info.difficulty, welcome: m, hooks: {
      deleteAccount,
      looks: l => { wardrobe.looks = l; net.setLooks(l); },
      wallet: {
        cash: () => game.sim.state.cash,
        spendCash: n => { game.sim.state.cash -= n; net.command('spend', { cash: n }); },
        gold: () => game.sim.state.coopGold || 0,
        spendGold: n => { game.sim.state.coopGold -= n; net.command('spend', { gold: n }); },
      } } });
    session.game = game;
    const sim = game.sim;
    sim.buyUpgrade = (slot, track) => { net.command('upgrade', { slot: { kind: slot.kind, i: slot.i, name: slot.name }, track }); return true; };
    if (sim.boosters) {
      sim.boosters.claim = () => net.command('claim');
      sim.boosters.claimCash = () => net.command('claimCash');
    }
    if (sim.cars) sim.cars.collect = () => net.command('carsCollect');
    game.afterStep = dt => net.update(dt, sim.pose());
    // Ticks that came while the new mart loaded are already in net.wire.
    if (net.wire) sim.adopt(net.wire);
    ready = true;
    Object.assign(mmc, { role: 'guest', me: m.you, net, game, room });
  };
  net.onTick = (wire, events) => {
    if (!ready) return;
    const sim = session.game.sim;
    sim.adopt(wire);
    for (const e of events) {
      if (e.pid === sim.me) delete e.pid;
      else if (e.pid == null) e.pid = 'host';
      sim.emit(e);
    }
    bar.roster(Object.entries(wire.players || {}).map(([id, p]) => ({ id, name: p.name })));
  };
  // A later welcome: a resync of the same mart, or the host took the room to another one.
  net.onWelcome = m => {
    if (ready && session.game && m.info.mart === session.game.mart && m.you === session.game.sim.me) session.game.sim.adopt(m.full);
    else open(m).catch(e => back(String(e.message || e)));
  };
  await open(welcome);
  net.onKick = why => {
    if (session.leaving) return;
    // A host's kick says why; anything else is the relay link dropping, worth a few tries on the same allocation
    // (the lobby seat is kept for those).
    if (['host closed the store', 'full', 'version'].includes(why) || attempt >= RECONNECTS) {
      room.leave();
      back(why === 'version' ? 'Phiên bản khác chủ phòng, tải lại trang' : why === 'full' ? 'Cửa hàng đã đủ người' : 'Chủ phòng đã đóng cửa hàng');
      return;
    }
    mmc.reconnecting = (mmc.reconnecting || 0) + 1;
    const r = session.rejoin;
    setTimeout(() => join(r, attempt + 1).catch(() => back('Mất kết nối với chủ phòng')), 1000 * (attempt + 1));
  };
  if (!session.unload) {
    session.unload = true;
    window.addEventListener('pagehide', () => { session.leaving = true; session.net.leave(); session.room.leave(true); });
  }
}

// Back to the menu: a fresh page is the simplest clean slate (WebGL, sockets, timers); the tab keeps its UGS session.
function back(msg) {
  const q = new URLSearchParams();
  if (msg) q.set('msg', msg);
  location.href = `${location.pathname}${q.toString() ? `?${q}` : ''}`;
}

// The strip over the store: name, room code (tap to copy), who is in, leave.
function storeBar({ name, code, onLeave }) {
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
