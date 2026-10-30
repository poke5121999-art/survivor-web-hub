// Unity Gaming Services over plain REST (adapted from games/mini-mart-coop/js/net/ugs.js): anonymous
// Authentication, Lobby for quick-match discovery and private codes, Relay for the allocation.
// Same UGS project as Boo Haul and My Mini Mart. Boo Haul lists only rooms that publish `joinCode` on S1..S4, mini mart
// filters S5 = minimart; a Food Gang room tags S5 = foodgang, so none of the three sees the others' rooms.
// N1 = skill bracket (QuantumMatchmaker StartOnlineAsync: clamp((skinLevel - 1) / 5, 0, 3)), N2 = wire protocol.

export const PROJECT_ID = '9d277ff8-6780-4d2e-99c5-624374fee3ef';
export const GAME_TAG = 'foodgang';
const AUTH = 'https://player-auth.services.api.unity.com/v1/authentication';
const RELAY = 'https://relay-allocations.services.api.unity.com/v1';
const LOBBY = 'https://lobby.services.api.unity.com/v1';
// Per tab (sessionStorage): two tabs of one browser are two players.
const SESSION_KEY = 'fg-ugs-session';

export class UgsError extends Error {
  constructor(where, status, body) {
    super(`${where}: HTTP ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function call(where, url, { method = 'POST', token = null, body, keepalive = false } = {}) {
  const h = { 'Content-Type': 'application/json', ProjectId: PROJECT_ID };
  if (token) h.Authorization = `Bearer ${token}`;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 15000) : 0;
  let r;
  try {
    r = await fetch(url, { method, headers: h, keepalive, signal: ctl ? ctl.signal : undefined,
      body: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body) });
  } catch (e) {
    throw new UgsError(where, 0, e && e.name === 'AbortError' ? 'request timed out' : String(e && e.message || e));
  } finally { clearTimeout(timer); }
  const text = await r.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* plain text error */ }
  if (!r.ok) throw new UgsError(where, r.status, data);
  return data;
}

const storage = {
  get() { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } },
  set(v) { try { sessionStorage.setItem(SESSION_KEY, v); } catch (e) { /* storage unavailable */ } },
};

export class Ugs {
  constructor({ keepSession = true } = {}) {
    this.keepSession = keepSession;
    this.token = null;
    this.playerId = null;
    this.expiresAt = 0;
  }

  async signIn() {
    if (this.token && Date.now() < this.expiresAt - 60e3) return this;
    const session = this.keepSession && storage.get();
    let d = null;
    if (session) d = await call('auth', `${AUTH}/session-token`, { body: { sessionToken: session } }).catch(() => null);
    if (!d) d = await call('auth', `${AUTH}/anonymous`);
    this.token = d.idToken;
    this.playerId = d.userId || (d.user && d.user.id);
    this.expiresAt = Date.now() + (d.expiresIn || 3600) * 1000;
    if (this.keepSession && d.sessionToken) storage.set(d.sessionToken);
    return this;
  }

  async allocate(maxConnections, region) {
    const body = { maxConnections };
    if (region) body.region = region;
    return (await call('relay allocate', `${RELAY}/allocate`, { token: this.token, body })).data.allocation;
  }

  async joinCode(allocationId) {
    return (await call('relay joincode', `${RELAY}/joincode`, { token: this.token, body: { allocationId } })).data.joinCode;
  }

  async joinRelay(joinCode) {
    return (await call('relay join', `${RELAY}/join`, { token: this.token, body: { joinCode } })).data.allocation;
  }

  player(name) {
    return { id: this.playerId, data: { name: { visibility: 'member', value: String(name).slice(0, 24) } } };
  }

  createLobby({ name, maxPlayers, isPrivate, data, playerName }) {
    return call('lobby create', `${LOBBY}/create`, { token: this.token,
      body: { name, maxPlayers, isPrivate, data, player: this.player(playerName) } });
  }

  async queryLobbies(bracket, protocol) {
    const d = await call('lobby query', `${LOBBY}/query`, { token: this.token, body: {
      count: 25,
      filter: [
        { field: 'S5', op: 'EQ', value: GAME_TAG },
        { field: 'N1', op: 'EQ', value: String(bracket) },
        { field: 'N2', op: 'EQ', value: String(protocol) },
        { field: 'AvailableSlots', op: 'GT', value: '0' },
      ],
      order: [{ field: 'Created', asc: true }],
    } });
    return d.results || [];
  }

  joinLobbyByCode(code, playerName) {
    return call('lobby join', `${LOBBY}/joinbycode`, { token: this.token,
      body: { lobbyCode: String(code).trim().toUpperCase(), player: this.player(playerName) } });
  }

  joinLobbyById(id, playerName) {
    return call('lobby join', `${LOBBY}/${id}/join`, { token: this.token, body: this.player(playerName) });
  }

  updateLobby(id, patch) { return call('lobby update', `${LOBBY}/${id}`, { token: this.token, body: patch }); }

  heartbeat(id) { return call('lobby heartbeat', `${LOBBY}/${id}/heartbeat`, { token: this.token }); }

  removePlayer(id, playerId, keepalive = false) {
    return call('lobby leave', `${LOBBY}/${id}/players/${playerId}`, { method: 'DELETE', token: this.token, keepalive });
  }

  deleteLobby(id, keepalive = false) {
    return call('lobby delete', `${LOBBY}/${id}`, { method: 'DELETE', token: this.token, keepalive });
  }
}

export const lobbyData = ({ bracket, protocol, relay, host, kind }) => ({
  game: { visibility: 'public', value: GAME_TAG, index: 'S5' },
  bracket: { visibility: 'public', value: String(bracket), index: 'N1' },
  proto: { visibility: 'public', value: String(protocol), index: 'N2' },
  kind: { visibility: 'public', value: kind },
  host: { visibility: 'public', value: String(host).slice(0, 24) },
  relay: { visibility: 'member', value: relay },
});
