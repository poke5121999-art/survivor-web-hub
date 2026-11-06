// Copied from games/mini-mart-coop/js/net/relay.js (2026-10-31) so the two games can change independently.
// Unity Relay message protocol over a browser WebSocket, byte for byte what com.unity.transport writes
// (Runtime/Relay/Messages/*.cs, RelayServerData.ComputeBindHMAC): no Unity runtime, so the page stays a few KB.
//   header   = DA 72 | version 0 | type
//   BIND     = header | acceptMode 0 | nonce u16 LE | 255 | connectionData[255] | HMAC-SHA256(key[64], msg[263])
//   PING     = header | from[16] | seq u16 LE
//   CONNECT  = header | from[16] | 255 | hostConnectionData[255]
//   RELAY    = header | from[16] | to[16] | length u16 BE | payload
//   ACCEPTED, DISCONNECT = header | from[16] | to[16];  ERROR = header | allocation[16] | code

const T = { BIND: 0, BIND_RECEIVED: 1, PING: 2, CONNECT: 3, ACCEPTED: 6, REJECTED: 8, DISCONNECT: 9, RELAY: 10, ERROR: 12 };
const ERRORS = ['invalid protocol version', 'player timed out', 'unauthorized', 'allocation id client mismatch',
  'allocation id not found', 'not connected', 'self-connect not allowed'];
// UTP pings when nothing was sent for RelayNetworkParameter.k_DefaultConnectionTimeMS (3 s); the relay drops an
// allocation idle for 10 s.
const PING_IDLE = 1.5;
const BIND_TIMEOUT = 8;

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = (u8, at = 0) => Array.from(u8.subarray(at, at + 16), b => b.toString(16).padStart(2, '0')).join('');
const unhex = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16));

function header(type, size) {
  const m = new Uint8Array(size);
  m[0] = 0xDA; m[1] = 0x72; m[2] = 0; m[3] = type;
  return m;
}

async function bindMessage(connectionData, key, nonce) {
  const msg = new Uint8Array(263);
  msg[0] = 0xDA; msg[1] = 0x72; msg[5] = nonce & 255; msg[6] = nonce >> 8; msg[7] = 255;
  msg.set(connectionData, 8);
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const m = header(T.BIND, 295);
  m[5] = nonce & 255; m[6] = nonce >> 8; m[7] = 255;
  m.set(connectionData, 8);
  m.set(hmac, 263);
  return m;
}

// One bound allocation. Peers are named by the hex of their allocation id; a client has exactly one peer, the host.
// The host learns of a client from its first RELAY message (the relay tells only the connecting side, ACCEPTED).
export class RelayLink {
  constructor(alloc, { role, WebSocketImpl = globalThis.WebSocket } = {}) {
    this.role = role;
    this.alloc = alloc;
    this.self = b64(alloc.allocationIdBytes);
    this.id = hex(this.self);
    this.WS = WebSocketImpl;
    const ep = alloc.serverEndpoints.find(e => e.connectionType === 'wss');
    if (!ep) throw new Error('relay allocation has no wss endpoint');
    this.url = `wss://${ep.host}:${ep.port}`;
    this.peers = new Set();
    this.hostId = null;
    this.lastSent = 0;
    this.closed = false;
    this.stats = { tx: 0, rx: 0, txMsgs: 0, rxMsgs: 0 };
    this.onMessage = () => {};
    this.onPeer = () => {};
    this.onPeerLeft = () => {};
    this.onClose = () => {};
  }

  now() { return performance.now() / 1000; }

  open() {
    return new Promise((resolve, reject) => {
      const ws = this.ws = new this.WS(this.url);
      ws.binaryType = 'arraybuffer';
      let phase = 'bind';
      const fail = why => {
        if (phase === 'open') return;
        phase = 'failed';
        clearTimeout(timer);
        try { ws.close(); } catch (e) { /* already closed */ }
        reject(new Error(why));
      };
      const timer = setTimeout(() => fail(`relay ${phase} timed out`), BIND_TIMEOUT * 1000);
      ws.onopen = async () => {
        const nonce = (Math.random() * 65536) | 0;
        this.raw(await bindMessage(b64(this.alloc.connectionData), b64(this.alloc.key), nonce));
      };
      ws.onerror = () => fail('relay websocket error');
      ws.onclose = e => {
        if (phase !== 'open') fail(`relay websocket closed (${e.code})`);
        else this.shut(`websocket closed (${e.code})`);
      };
      ws.onmessage = e => {
        const m = new Uint8Array(e.data);
        if (m.length < 4 || m[0] !== 0xDA || m[1] !== 0x72) return;
        this.stats.rx += m.length;
        this.stats.rxMsgs++;
        const type = m[3];
        if (type === T.BIND_RECEIVED && phase === 'bind') {
          if (this.role === 'host') { phase = 'open'; clearTimeout(timer); this.startPings(); resolve(this); return; }
          phase = 'connect';
          const c = header(T.CONNECT, 276);
          c.set(this.self, 4);
          c[20] = 255;
          c.set(b64(this.alloc.hostConnectionData), 21);
          this.raw(c);
        } else if (type === T.ACCEPTED && phase === 'connect') {
          this.hostId = hex(m, 4);
          this.peers.add(this.hostId);
          phase = 'open';
          clearTimeout(timer);
          this.startPings();
          resolve(this);
        } else if (type === T.REJECTED) {
          fail('room is full');
        } else if (type === T.ERROR) {
          const why = `relay error: ${ERRORS[m[20]] || m[20]}`;
          if (phase !== 'open') fail(why); else this.shut(why);
        } else if (type === T.RELAY) {
          const from = hex(m, 4), len = (m[36] << 8) | m[37];
          if (!this.peers.has(from)) {
            this.peers.add(from);
            this.onPeer(from);
          }
          this.onMessage(from, m.subarray(38, 38 + len));
        } else if (type === T.DISCONNECT) {
          const from = hex(m, 4);
          if (this.peers.delete(from)) this.onPeerLeft(from);
          if (from === this.hostId) this.shut('host left');
        }
      };
    });
  }

  raw(m) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.ws.send(m);
    this.lastSent = this.now();
    this.stats.tx += m.length;
    this.stats.txMsgs++;
  }

  send(to, payload) {
    const m = header(T.RELAY, 38 + payload.length);
    m.set(this.self, 4);
    m.set(unhex(to), 20);
    m[36] = payload.length >> 8; m[37] = payload.length & 255;
    m.set(payload, 38);
    this.raw(m);
  }

  broadcast(payload) {
    for (const p of this.peers) this.send(p, payload);
  }

  // Drop a peer the app decided is gone (no traffic): tell the relay so its slot frees up.
  drop(peer) {
    if (!this.peers.delete(peer)) return;
    const m = header(T.DISCONNECT, 36);
    m.set(this.self, 4);
    m.set(unhex(peer), 20);
    this.raw(m);
  }

  startPings() {
    const ping = header(T.PING, 22);
    ping.set(this.self, 4);
    ping[20] = 1;
    this.pinger = setInterval(() => {
      if (this.now() - this.lastSent >= PING_IDLE) this.raw(ping);
    }, 500);
  }

  shut(why) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    try { this.ws.close(); } catch (e) { /* already closed */ }
    this.onClose(why);
  }

  close() {
    for (const p of [...this.peers]) this.drop(p);
    this.shut('closed');
  }
}
