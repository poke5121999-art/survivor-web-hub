// Unity Gaming Services over plain REST, the same services the Boo Haul client (D:/REPO_Meta) reaches through the
// Multiplayer SDK: anonymous Authentication, Lobby for the room list and codes, Relay for the allocation.
// Boo Haul shares this project: its list reads only rooms that publish `joinCode` and its indexes are S1..S4, so a
// mini mart room keeps its relay code under `relay` (members only) and tags itself on S5.

export const PROJECT_ID = '9d277ff8-6780-4d2e-99c5-624374fee3ef';
export const GAME_TAG = 'minimart';
const AUTH = 'https://player-auth.services.api.unity.com/v1/authentication';
const RELAY = 'https://relay-allocations.services.api.unity.com/v1';
const LOBBY = 'https://lobby.services.api.unity.com/v1';
// Per tab (sessionStorage): two tabs of one browser are two players, so a host can be joined from a second tab.
const SESSION_KEY = 'mmc-ugs-session';

export class UgsError extends Error {
  constructor(where, status, body) {
    super(`${where}: HTTP ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

async function call(where, url, { method = 'POST', token = null, body, headers = {}, keepalive = false } = {}) {
  const h = { 'Content-Type': 'application/json', ProjectId: PROJECT_ID, ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method, headers: h, keepalive, body: body === undefined ? (method === 'POST' ? '{}' : undefined) : JSON.stringify(body) });
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

// One signed-in player. The session token keeps the same player id across reloads, so a host that reloads still owns
// its lobby.
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
    if (session) {
      d = await call('auth', `${AUTH}/session-token`, { body: { sessionToken: session } }).catch(() => null);
    }
    if (!d) d = await call('auth', `${AUTH}/anonymous`);
    this.token = d.idToken;
    this.playerId = d.userId || (d.user && d.user.id);
    this.expiresAt = Date.now() + (d.expiresIn || 3600) * 1000;
    if (this.keepSession && d.sessionToken) storage.set(d.sessionToken);
    return this;
  }

  // --- Relay ----------------------------------------------------------------------------------------------------
  async regions() {
    const d = await call('relay regions', `${RELAY}/regions`, { method: 'GET', token: this.token });
    return d.data.regions;
  }

  async allocate(maxConnections, region) {
    const body = { maxConnections };
    if (region) body.region = region;
    const d = await call('relay allocate', `${RELAY}/allocate`, { token: this.token, body });
    return d.data.allocation;
  }

  async joinCode(allocationId) {
    const d = await call('relay joincode', `${RELAY}/joincode`, { token: this.token, body: { allocationId } });
    return d.data.joinCode;
  }

  async joinRelay(joinCode) {
    const d = await call('relay join', `${RELAY}/join`, { token: this.token, body: { joinCode } });
    return d.data.allocation;
  }

  // --- Lobby ----------------------------------------------------------------------------------------------------
  player(name) {
    return { id: this.playerId, data: { name: { visibility: 'member', value: String(name).slice(0, 24) } } };
  }

  createLobby({ name, maxPlayers, isPrivate, data, playerName }) {
    return call('lobby create', `${LOBBY}/create`, { token: this.token,
      body: { name, maxPlayers, isPrivate, data, player: this.player(playerName) } });
  }

  async listLobbies() {
    const d = await call('lobby query', `${LOBBY}/query`, { token: this.token, body: {
      count: 50,
      filter: [{ field: 'S5', op: 'EQ', value: GAME_TAG }, { field: 'AvailableSlots', op: 'GT', value: '0' }],
      order: [{ field: 'Created', asc: false }],
    } });
    return d.results || [];
  }

  joinLobbyByCode(code, playerName) {
    return call('lobby join', `${LOBBY}/joinbycode`, { token: this.token,
      body: { lobbyCode: code.trim().toUpperCase(), player: this.player(playerName) } });
  }

  joinLobbyById(id, playerName) {
    return call('lobby join', `${LOBBY}/${id}/join`, { token: this.token, body: this.player(playerName) });
  }

  updateLobby(id, patch) {
    return call('lobby update', `${LOBBY}/${id}`, { token: this.token, body: patch });
  }

  heartbeat(id) {
    return call('lobby heartbeat', `${LOBBY}/${id}/heartbeat`, { token: this.token });
  }

  // The host may remove anyone; a player may remove itself.
  removePlayer(id, playerId, keepalive = false) {
    return call('lobby leave', `${LOBBY}/${id}/players/${playerId}`, { method: 'DELETE', token: this.token, keepalive });
  }

  leaveLobby(id, keepalive = false) {
    return this.removePlayer(id, this.playerId, keepalive);
  }

  deleteLobby(id, keepalive = false) {
    return call('lobby delete', `${LOBBY}/${id}`, { method: 'DELETE', token: this.token, keepalive });
  }
}

// Lobby data fields this game publishes. S5 is the only index; the rest are read straight off the list rows.
export const lobbyData = ({ mart, difficulty, relay, host, region }) => ({
  game: { visibility: 'public', value: GAME_TAG, index: 'S5' },
  mart: { visibility: 'public', value: mart },
  diff: { visibility: 'public', value: String(difficulty) },
  host: { visibility: 'public', value: String(host).slice(0, 24) },
  region: { visibility: 'public', value: region || '' },
  relay: { visibility: 'member', value: relay },
});
