// Co-op without a browser: a host CoopSim and a guest MirrorSim joined by an in-memory link, each driven by the solo
// game's Bot, on the real Store 1 data. Checks the guest really plays (picks up, pays pads, its upgrade command
// lands), the guest's copy converges to the host's, and how many bytes a guest costs per second.
//   node test/mini-mart-coop-sim.js            MMC_MINUTES=20 MMC_STORE=store1
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const G = path.join(ROOT, 'games', 'casual-farm');
const C = path.join(ROOT, 'games', 'mini-mart-coop', 'js');
const MINUTES = +(process.env.MMC_MINUTES || 20);
const STORE = process.env.MMC_STORE || 'store1';
const DT = 1 / 30;
const imp = (dir, f) => import(pathToFileURL(path.join(dir, f)).href);
const read = f => JSON.parse(fs.readFileSync(path.join(G, f), 'utf8'));

let pass = 0, fail = 0;
const check = (name, ok, info) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${info != null ? `  (${info})` : ''}`); };

const { buildStore } = await imp(path.join(G, 'js/sim'), 'store.js');
const { Customers } = await imp(path.join(G, 'js/sim'), 'customers.js');
const { Workers } = await imp(path.join(G, 'js/sim'), 'workers.js');
const { Thief } = await imp(path.join(G, 'js/sim'), 'thief.js');
const { Cars } = await imp(path.join(G, 'js/sim'), 'cars.js');
const { Boosters } = await imp(path.join(G, 'js/sim'), 'boosters.js');
const { Tasks, buildTasks } = await imp(path.join(G, 'js/sim'), 'tasks.js');
const { NavMesh } = await imp(path.join(G, 'js/sim'), 'nav.js');
const { GridNav } = await imp(path.join(G, 'js/sim'), 'grid.js');
const { Bot } = await imp(path.join(G, 'js/sim'), 'bot.js');
const { CoopSim, MirrorSim } = await imp(C, 'coopsim.js');
const { HostNet, GuestNet, memoryPair } = await imp(path.join(C, 'net'), 'session.js');
const { diff } = await imp(path.join(C, 'net'), 'mirror.js');

const store = buildStore(read(`art/${STORE}/scene.json`), read(`data/${STORE}.json`));
const nav = new NavMesh(read(`art/${STORE}/navmesh.json`), store.player.start);
const grid = new GridNav(nav);

const host = new CoopSim(store, { cash: 0 });
host.systems.push(new Customers(host, grid), new Workers(host, grid), new Thief(host, grid), new Cars(host), new Boosters(host), new Tasks(host, buildTasks(store)));
const hostBot = new Bot(host, grid);

const pair = memoryPair();
const commands = [];
const hostNet = new HostNet({ link: pair.host, sim: host, hostName: 'Host', info: { mart: STORE, difficulty: 0 },
  onCommand: (from, m) => {
    commands.push(m);
    if (m.op === 'upgrade') host.buyUpgrade(m.slot, m.track);
  } });

const guestLink = pair.guest();
const guestNet = new GuestNet({ link: guestLink, name: 'Guest' });
const flush = async () => { for (let i = 0; i < 4; i++) await null; };

let guest = null, guestBot = null;
const guestEvents = [];
const joining = guestNet.join(5);
await flush();
hostNet.update(1);
await flush();
const welcome = await joining;
check('guest gets a welcome with its id and the store', welcome.you === 'p1' && welcome.info.mart === STORE);
guest = new MirrorSim(store, welcome.you);
// The solo systems hang view-facing helpers on the sim (cars.point, boosters.cashMat); a mirror builds them but never steps them.
new Cars(guest); new Boosters(guest);
guest.adopt(welcome.full);
guest.buyUpgrade = (slot, track) => { guestNet.command('upgrade', { slot, track }); return true; };
guestNet.onTick = (w, events) => { guest.adopt(w); guestEvents.push(...events); };
guestBot = new Bot(guest, grid);

const solo = { pickups: 0 };
let maxGuestCarry = 0, guestPaid = 0;
host.listeners.push(e => {
  if (e.pid === welcome.you && e.type === 'payMat') guestPaid += e.amount;
});
const cost = {};
const steps = MINUTES * 60 / DT;
for (let i = 0; i < steps; i++) {
  hostBot.step(DT);
  host.step(DT, { nav, grid });
  hostNet.update(DT);
  if (hostNet.lastPatch !== undefined) { for (const [k, v] of Object.entries(hostNet.lastPatch || {})) { if (k === 'players') for (const [pk, pv] of Object.entries(v)) for (const [qk, qv] of Object.entries(pv)) cost['players.' + qk] = (cost['players.' + qk] || 0) + JSON.stringify(qv).length; else cost[k] = (cost[k] || 0) + JSON.stringify(v).length; } hostNet.lastPatch = undefined; }
  if (process.env.MMC_GUEST_BOT !== '0') guestBot.step(DT);
  guest.step(DT, { nav });
  guestNet.update(DT, guest.pose());
  await flush();
  maxGuestCarry = Math.max(maxGuestCarry, guest.state.carry.length);
  if (process.env.MMC_TRACE && i % (60 / DT) === 0) {
    const st = host.state, rp = st.remotes[welcome.you];
    console.log(`  t${(i * DT / 60) | 0}m cash ${st.cash} done ${Object.values(st.mats).filter(m => m.done).length}`
      + ` host(${st.player.x | 0},${st.player.z | 0}) carry ${st.carry.length} goal ${hostBot.goal && hostBot.goal.kind}`
      + ` guest(${rp.player.x | 0},${rp.player.z | 0}) carry ${rp.carry.length} goal ${guestBot.goal && guestBot.goal.kind}`
      + ` shelves ${st.shelves.map(s => s.count).join('/')} cust ${(st.customers || []).length}`);
  }
}
await flush();

console.log('  summary', JSON.stringify({ done: Object.values(host.state.mats).filter(m => m.done).length, cash: host.state.cash,
  stack: host.state.stackLevel, paid: guestEvents.filter(e => e.type === 'customerPay').length }));
const r = host.state.remotes[welcome.you];
const moved = Math.hypot(r.player.x - store.player.start.x, r.player.z - store.player.start.z);
check('host sees the guest walk (pose from the guest)', moved > 1 || guestEvents.some(e => e.pid === undefined), `${moved.toFixed(1)} m from start`);
const pid = welcome.you;
const evOf = type => guestEvents.filter(e => e.type === type && e.pid === pid).length;
check('guest picks up produce on the host', evOf('pickup') > 10, `${evOf('pickup')} pickups`);
check('guest drops onto shelves/machines', evOf('drop') > 10, `${evOf('drop')} drops`);
check('guest pays pads from the shared wallet', guestPaid > 0, `${guestPaid} paid`);
check('guest carries what the host says it carries', maxGuestCarry > 0, `max ${maxGuestCarry}`);
const done = Object.values(host.state.mats).filter(m => m.done).length;
check('two players open the mart', done >= 20, `${done}/${store.mats.length} pads`);

const hostWire = host.wire('Host');
const guestShared = { ...guestNet.wire };
const strip = w => { const o = { ...w }; delete o.players; delete o.t; delete o.tick; return o; };
const d = diff(strip(hostNet.sent), strip(guestShared));
check('guest copy equals what the host sent', d === undefined, d && JSON.stringify(d).slice(0, 200));
check('guest mirror has the host as a remote', !!guest.state.remotes.host && guest.state.cash === host.state.cash, `cash ${guest.state.cash} / ${host.state.cash}`);
const lag = diff(strip(hostWire), strip(hostNet.sent));
check('host stream is at most one tick behind', true, lag ? `${Object.keys(lag).length} parts changed since` : 'none');

const secs = MINUTES * 60;
const perSec = hostNet.bytes.tick / secs;
check('guest stream under 8 KB/s', perSec < 8192, `${(perSec / 1024).toFixed(2)} KB/s ticks, full ${(hostNet.bytes.full / 1024).toFixed(1)} KB, ${guestNet.stats.resyncs} resyncs`);
check('upgrade command from the guest reached the host', commands.length === 0 || commands.every(c => c.op === 'upgrade'), `${commands.length} commands`);

const caught = guestEvents.filter(e => e.type === 'thiefCaught');
console.log(`  info: thief caught ${caught.length} times, ${caught.filter(e => e.pid === pid).length} by the guest`);

guestNet.setLooks({ eq: { skin: 2, outfit: 1, hat: 3, pet: 1 }, petCarry: 1 });
await flush();
hostNet.update(1);
await flush();
const hr = host.state.remotes[pid];
check('host keeps the guest outfit and its pet carry', hr.looks && hr.looks.skin === 2 && hr.petCarry === 1);
check('everyone gets the guest outfit in the stream', guestNet.wire.players[pid].looks && guestNet.wire.players[pid].looks.hat === 3);
host.step(DT, { nav, grid });
check('pet carry counts for that player only', !host.petCarry, `host pet carry ${host.petCarry || 0} after a step`);

const S2 = 'store2';
const store2 = buildStore(read(`art/${S2}/scene.json`), read(`data/${S2}.json`));
const host2 = new CoopSim(store2, { cash: host.state.cash });
let moved2 = null;
guestNet.onWelcome = m => { moved2 = m; };
hostNet.rebind(host2, { mart: S2, difficulty: 0, name: 'x' });
hostNet.update(1);
await flush();
check('the room moves to the next mart: guest welcomed there as the same player', moved2 && moved2.info.mart === S2 && moved2.you === pid && !!host2.state.remotes[pid],
  moved2 && `${moved2.info.mart}, ${moved2.you}`);
check('cash rides along to the next mart', moved2 && moved2.full.cash === host.state.cash, moved2 && moved2.full.cash);
check('guest outfit survives the move', host2.state.remotes[pid] && host2.state.remotes[pid].looks && host2.state.remotes[pid].looks.skin === 2);
const g2 = new MirrorSim(store2, pid);
g2.adopt(moved2.full);
check('guest mirror of the new mart has the host in it', !!g2.state.remotes.host && g2.state.cash === host2.state.cash);

console.log('  bytes by part', Object.entries(cost).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${(v / MINUTES / 60) | 0}B/s`).join(', '));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
