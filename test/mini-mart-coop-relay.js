// Real Unity Relay + Lobby round trip from plain JS: two anonymous players, one hosts, one joins by lobby code, they
// exchange messages through the relay and the lobby is deleted at the end. Run: node test/mini-mart-coop-relay.js
import { Ugs, lobbyData, GAME_TAG } from '../games/mini-mart-coop/js/net/ugs.js';
import { RelayLink } from '../games/mini-mart-coop/js/net/relay.js';

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ` (${info})` : ''}`); };
const enc = s => new TextEncoder().encode(s), dec = b => new TextDecoder().decode(b);
const REGION = process.env.MMC_REGION || 'asia-southeast1';

const host = await new Ugs({ keepSession: false }).signIn();
const guest = await new Ugs({ keepSession: false }).signIn();
check('anonymous sign-in gives two players', host.playerId && guest.playerId && host.playerId !== guest.playerId);

const regions = await host.regions();
check('relay lists regions', regions.some(r => r.id === REGION), regions.map(r => r.id).join(' '));

const alloc = await host.allocate(3, REGION);
const relayCode = await host.joinCode(alloc.allocationId);
check('host allocation has a wss endpoint', alloc.serverEndpoints.some(e => e.connectionType === 'wss'), alloc.region);

let lobby = await host.createLobby({ name: 'relay test', maxPlayers: 4, isPrivate: false, playerName: 'Host',
  data: lobbyData({ mart: 'store1', difficulty: 0, relay: relayCode, host: 'Host' }) });
check('lobby created with a code', !!lobby.lobbyCode, lobby.lobbyCode);
try {
  const listed = await guest.listLobbies();
  const row = listed.find(l => l.id === lobby.id);
  check('guest sees the room in the list', !!row && row.data.game.value === GAME_TAG && !row.data.relay, `${listed.length} rows`);
  const joined = await guest.joinLobbyByCode(lobby.lobbyCode, 'Guest');
  check('guest joins by code and reads the relay code', joined.data.relay.value === relayCode && joined.players.length === 2);

  const hostLink = await new RelayLink(alloc, { role: 'host' }).open();
  const guestAlloc = await guest.joinRelay(relayCode);
  const guestLink = new RelayLink(guestAlloc, { role: 'client' });
  const peers = [];
  hostLink.onPeer = p => peers.push(p);
  hostLink.onMessage = (from, m) => hostLink.send(from, enc(`echo:${dec(m)}`));
  await guestLink.open();
  check('client bound and accepted by host allocation', guestLink.hostId === hostLink.id);

  const rtts = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const back = new Promise(ok => { guestLink.onMessage = (from, m) => ok(dec(m)); });
    guestLink.send(guestLink.hostId, enc(`ping${i}`));
    const got = await Promise.race([back, new Promise(ok => setTimeout(() => ok(null), 3000))]);
    if (got !== `echo:ping${i}`) { check('echo through relay', false, String(got)); break; }
    rtts.push(performance.now() - t0);
  }
  rtts.sort((a, b) => a - b);
  check('20 echoes through relay', rtts.length === 20 && peers.length === 1,
    `rtt p50 ${rtts[10] | 0} ms, p95 ${rtts[18] | 0} ms`);

  // Idle 12 s: pings must keep both allocations alive past the relay's 10 s timeout.
  await new Promise(ok => setTimeout(ok, 12000));
  const after = new Promise(ok => { guestLink.onMessage = (from, m) => ok(dec(m)); });
  guestLink.send(guestLink.hostId, enc('late'));
  check('link survives 12 s idle', await Promise.race([after, new Promise(ok => setTimeout(() => ok(null), 3000))]) === 'echo:late');

  // The relay does not forward a client's DISCONNECT to the host (measured 2026-10-28): HostNet times peers out instead.
  guestLink.close();
  hostLink.close();
} finally {
  await host.deleteLobby(lobby.id).catch(e => console.log('delete failed', e.message));
}
const bad = results.filter(r => !r.ok).length;
console.log(`${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
