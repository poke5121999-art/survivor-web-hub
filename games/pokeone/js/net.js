/*
 * Lớp mạng PokéOne: một WebSocket tới Supabase Realtime (giao thức Phoenix vsn 1.0.0, không supabase-js)
 * và REST/RPC PostgREST bằng fetch với token thành viên hub. Thiết kế và giao thức: NET.md.
 *
 *   P1.net.me                         → { id, name, member }
 *   const ch = P1.net.channel('global')     (chủ đề thật: realtime:pokeone:[<netns>:]global)
 *   ch.on('chat', (payload, from) => …); ch.send('chat', { text }); ch.track({ name, map }); ch.presence(); ch.leave()
 *   P1.net.rpc('p1_bid', { … })       → { ok, status, data, code, unreachable, noAccount }
 *   P1.net.cardOf(mon), P1.net.parseCard(raw), P1.net.esc(s)
 *
 * Mọi thứ hỏng thì im lặng: không cấu hình, không mạng, máy chủ từ chối → trò chơi solo chạy như thường.
 */
(function (P1) {
  'use strict';

  const HEARTBEAT_MS = 25000, BACKOFF_MS = [1000, 2000, 5000, 10000, 20000, 30000];
  const NETID_KEY = 'pokeone.netid';

  const q = new URLSearchParams(location.search);
  // ?netns=test-xxx: tách kênh cho bộ kiểm để không làm phiền người chơi thật.
  const ns = (q.get('netns') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 32);

  function cfg() { return window.SUPABASE_CONFIG || {}; }
  function configured() { const c = cfg(); return !!(c.url && c.anonKey); }
  function base() { return String(cfg().url || '').replace(/\/+$/, ''); }

  /* ---------------------------------------------------------------- danh tính */

  function hubSession() { return (window.HubSession && window.HubSession.get()) || null; }
  function memberSession() { const s = hubSession(); return s && s.kind === 'member' && s.accessToken && s.userId ? s : null; }

  let localId = null;
  function stableLocalId() {
    if (localId) return localId;
    try { localId = localStorage.getItem(NETID_KEY); } catch (e) { /* bị chặn */ }
    if (!localId) {
      localId = 'g-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem(NETID_KEY, localId); } catch (e) { /* chỉ sống trong trang này */ }
    }
    return localId;
  }

  function clip(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n); }

  const me = {
    get member() { return !!memberSession(); },
    get id() { const s = memberSession(); return s ? s.userId : stableLocalId(); },
    get name() {
      const p = P1.state && P1.state.player;
      return clip((p && p.name) || (hubSession() && hubSession().name) || 'Trainer', 24) || 'Trainer';
    },
  };

  /* ---------------------------------------------------------------- thoát HTML, thẻ Pokémon */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]); }

  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  function moveName(id) {
    try { const m = P1.Dex && P1.Dex.moves.get(id); return (m && m.exists && m.name) || String(id); } catch (e) { return String(id); }
  }

  // Ảnh chụp công khai của một Pokémon để khoe/đăng chợ. Không mang uid, exp, EV, vật phẩm.
  function cardOf(mon) {
    const ivs = {};
    STATS.forEach(s => { ivs[s] = mon.ivs ? mon.ivs[s] | 0 : 0; });
    return {
      dex: mon.dex, nick: mon.nick || '', level: mon.level, shiny: !!mon.shiny, gender: mon.gender || '',
      nature: mon.nature || '', ability: mon.ability || '', ivs,
      moves: (mon.moves || []).map(m => moveName(m.id || m)).slice(0, 4), ball: mon.ball || 'pokeball', ot: mon.ot || '',
    };
  }

  // Thẻ đến từ người khác là dữ liệu không tin cậy: ép kiểu, kẹp miền, cắt độ dài. Sai hình → null.
  function parseCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const dexMax = (P1.PRO && P1.PRO.dexMax) || 251;
    const dex = raw.dex | 0, level = raw.level | 0;
    if (dex < 1 || dex > dexMax || level < 1 || level > 100) return null;
    const ivs = {};
    STATS.forEach(s => { ivs[s] = Math.max(0, Math.min(31, (raw.ivs && raw.ivs[s]) | 0)); });
    return {
      dex, level, ivs, shiny: raw.shiny === true,
      nick: clip(raw.nick, 12), gender: raw.gender === 'M' || raw.gender === 'F' ? raw.gender : '',
      nature: clip(raw.nature, 12), ability: clip(raw.ability, 24),
      moves: (Array.isArray(raw.moves) ? raw.moves : []).slice(0, 4).map(m => clip(m, 24)).filter(Boolean),
      ball: clip(raw.ball, 16).replace(/[^a-z]/g, '') || 'pokeball', ot: clip(raw.ot, 24),
    };
  }

  const BALLS = ['pokeball', 'greatball', 'ultraball', 'masterball', 'premierball', 'cherishball', 'healball', 'friendball',
    'luxuryball', 'netball', 'nestball', 'quickball', 'timerball', 'duskball', 'levelball', 'loveball', 'lureball', 'moonball',
    'heavyball', 'fastball', 'dreamball', 'diveball', 'repeatball', 'safariball', 'sportball'];
  const num = (v, lo, hi, d) => { v = Math.floor(+v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

  // Pokémon nhận từ chợ là bản lưu của người khác: dựng lại từ P1.mon.create rồi chỉ chép trường đã kiểm,
  // để dữ liệu hỏng/độc không vào được bản lưu hay làm vỡ trình giả lập trận. Vật phẩm cầm theo không đi kèm.
  function parseMon(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const dexMax = (P1.PRO && P1.PRO.dexMax) || 251;
    const dex = raw.dex | 0, level = raw.level | 0;
    if (dex < 1 || dex > dexMax || level < 1 || level > 100) return null;
    let m, sp;
    try {
      sp = P1.mon.species(dex);
      m = P1.mon.create(dex, level, { shiny: raw.shiny === true, ot: clip(raw.ot, 24), ball: BALLS.includes(raw.ball) ? raw.ball : 'pokeball' });
    } catch (e) { return null; }
    STATS.forEach(s => { m.ivs[s] = num(raw.ivs && raw.ivs[s], 0, 31, m.ivs[s]); m.evs[s] = num(raw.evs && raw.evs[s], 0, 252, 0); });
    const evSum = STATS.reduce((a, s) => a + m.evs[s], 0);
    if (evSum > 510) STATS.forEach(s => { m.evs[s] = Math.floor(m.evs[s] * 510 / evSum); });
    if (typeof raw.nature === 'string' && P1.Dex.natures.get(raw.nature).exists) m.nature = P1.Dex.natures.get(raw.nature).name;
    if (Object.values(sp.abilities).includes(raw.ability)) m.ability = raw.ability;
    if (!sp.gender && (raw.gender === 'M' || raw.gender === 'F')) m.gender = raw.gender;
    const seen = new Set(), moves = [];
    (Array.isArray(raw.moves) ? raw.moves : []).forEach(x => {
      const mv = x && P1.Dex.moves.get(String(x.id || x));
      if (!mv || !mv.exists || seen.has(mv.id) || moves.length >= 4) return;
      seen.add(mv.id);
      moves.push({ id: mv.id, pp: num(x.pp, 0, mv.pp, mv.pp), ppMax: mv.pp });
    });
    if (moves.length) m.moves = moves;
    m.nick = clip(raw.nick, 12) || null;
    m.happiness = num(raw.happiness, 0, 255, m.happiness);
    const lo = P1.mon.expAt(dex, level), hi = level >= 100 ? lo : P1.mon.expAt(dex, level + 1) - 1;
    m.exp = num(raw.exp, lo, hi, lo);
    m.metAt = clip(raw.metAt, 32); m.metLevel = num(raw.metLevel, 1, level, level);
    m.hp = P1.mon.stats(m).hp;
    return m;
  }

  function parseFrom(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = clip(raw.id, 48), name = clip(raw.name, 24);
    return id && name ? { id, name } : null;
  }

  /* ---------------------------------------------------------------- socket Phoenix */

  const channels = {};          // chủ đề → kênh
  const statusFns = [];
  let sock = null, ref = 0, hbTimer = 0, retryTimer = 0, tries = 0, wanted = false;
  let status = configured() && typeof WebSocket === 'function' ? 'off' : 'offline';

  function setStatus(s) {
    if (s === status) return;
    status = s;
    statusFns.forEach(f => { try { f(s); } catch (e) { console.error(e); } });
  }

  function raw(msg) {
    if (!sock || sock.readyState !== 1) return false;
    msg.ref = String(++ref);
    try { sock.send(JSON.stringify(msg)); return true; } catch (e) { return false; }
  }

  function connect() {
    wanted = true;
    if (status === 'offline' || sock) return;
    clearTimeout(retryTimer);
    setStatus('connecting');
    const url = base().replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(cfg().anonKey) + '&vsn=1.0.0';
    let s;
    try { s = new WebSocket(url); } catch (e) { scheduleRetry(); return; }
    sock = s;
    s.onopen = () => {
      tries = 0;
      setStatus('on');
      clearInterval(hbTimer);
      hbTimer = setInterval(() => raw({ topic: 'phoenix', event: 'heartbeat', payload: {} }), HEARTBEAT_MS);
      Object.values(channels).forEach(join);
    };
    s.onmessage = e => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      const ch = m && channels[m.topic];
      if (ch) ch.handle(m);
    };
    s.onclose = () => {
      if (sock !== s) return;
      sock = null;
      clearInterval(hbTimer);
      Object.values(channels).forEach(ch => { ch.joined = false; ch.state = {}; ch.emitPresence(); });
      if (wanted) scheduleRetry(); else setStatus('off');
    };
    s.onerror = () => { /* onclose theo sau */ };
  }

  function scheduleRetry() {
    sock = null;
    setStatus('connecting');
    const wait = BACKOFF_MS[Math.min(tries++, BACKOFF_MS.length - 1)];
    retryTimer = setTimeout(connect, wait);
  }

  function join(ch) {
    ch.joinRef = String(ref + 1);
    ch.synced = false;
    ch.pending = [];
    raw({
      topic: ch.topic, event: 'phx_join', join_ref: ch.joinRef,
      // presence.enabled:true là bắt buộc: thiếu nó máy chủ chỉ gửi lại presence của chính mình [đo 2026-09-28].
      payload: { config: { broadcast: { self: false, ack: false }, presence: { key: me.id, enabled: true }, private: false } },
    });
  }

  function makeChannel(name) {
    const topic = 'realtime:pokeone:' + (ns ? ns + ':' : '') + name;
    const handlers = {};
    const ch = {
      topic, joined: false, joinRef: null, meta: null, state: {}, synced: false, pending: [],
      handle(m) {
        if (m.event === 'phx_reply' && m.ref === ch.joinRef) {
          if (m.payload && m.payload.status === 'ok') { ch.joined = true; if (ch.meta) sendTrack(); emit('joined', {}); }
          return;
        }
        if (m.event === 'broadcast' && m.payload) {
          const p = m.payload.payload || {};
          const from = parseFrom(p.from);
          if (from && from.id !== me.id) emit(m.payload.event, p, from);
          return;
        }
        // Như Phoenix Presence: diff đến trước presence_state (máy chủ gửi được theo thứ tự đó [đo]) thì
        // xếp chờ và áp sau ảnh chụp, nếu không ảnh chụp rỗng sẽ xoá mất người vừa track.
        if (m.event === 'presence_state') {
          ch.state = {};
          mergeJoins(m.payload || {});
          ch.pending.splice(0).forEach(applyDiff);
          ch.synced = true;
          ch.emitPresence();
          return;
        }
        if (m.event === 'presence_diff') {
          if (!ch.synced) { ch.pending.push(m.payload || {}); return; }
          applyDiff(m.payload || {});
          ch.emitPresence();
        }
      },
      emitPresence() { emit('presence', ch.presence()); },
      on(event, fn) { (handlers[event] = handlers[event] || []).push(fn); return ch; },
      off(event, fn) { handlers[event] = (handlers[event] || []).filter(f => f !== fn); return ch; },
      send(event, payload) {
        const p = Object.assign({}, payload, { from: { id: me.id, name: me.name } });
        return raw({ topic, event: 'broadcast', payload: { type: 'broadcast', event, payload: p } });
      },
      // Mỗi khoá presence là một người (key = me.id); track lại thay thế meta cũ.
      track(meta) { ch.meta = Object.assign({}, meta); if (ch.joined) sendTrack(); },
      presence() {
        return Object.keys(ch.state).map(k => {
          const metas = ch.state[k];
          return Object.assign({}, metas[metas.length - 1], { key: k, at: metas[0].phx_ref });
        });
      },
      leave() {
        if (ch.joined) raw({ topic, event: 'phx_leave', payload: {} });
        delete channels[topic];
        ch.joined = false;
      },
    };
    function sendTrack() {
      raw({ topic, event: 'presence', payload: { type: 'presence', event: 'track', payload: Object.assign({}, ch.meta, { name: me.name }) } });
    }
    function applyDiff(d) {
      Object.keys(d.leaves || {}).forEach(k => {
        const gone = new Set(((d.leaves[k] || {}).metas || []).map(x => x.phx_ref));
        const left = (ch.state[k] || []).filter(x => !gone.has(x.phx_ref));
        if (left.length) ch.state[k] = left; else delete ch.state[k];
      });
      mergeJoins(d.joins || {});
    }
    function mergeJoins(joins) {
      Object.keys(joins).forEach(k => {
        const metas = (joins[k] || {}).metas || [];
        const have = ch.state[k] || [];
        const refs = new Set(have.map(x => x.phx_ref));
        ch.state[k] = have.concat(metas.filter(x => !refs.has(x.phx_ref)));
      });
    }
    function emit(event, payload, from) {
      (handlers[event] || []).forEach(f => { try { f(payload, from); } catch (e) { console.error(e); } });
    }
    return ch;
  }

  function channel(name) {
    const topic = 'realtime:pokeone:' + (ns ? ns + ':' : '') + name;
    if (channels[topic]) return channels[topic];
    const ch = channels[topic] = makeChannel(name);
    connect();
    if (status === 'on') join(ch);
    return ch;
  }

  /* ---------------------------------------------------------------- REST / RPC (thành viên hub) */

  // Làm mới token sắp hết hạn trước khi gọi; null nếu phiên hỏng hẳn.
  function freshSession() {
    const s = memberSession();
    if (!s) return Promise.resolve(null);
    const expired = window.HubSession.isExpired && window.HubSession.isExpired();
    if (!expired || !window.HubAuth) return Promise.resolve(s);
    return window.HubAuth.refresh(s).then(r => {
      if (r && r.ok) { window.HubSession.set(r.session); return r.session; }
      return r && r.unreachable ? s : null;
    });
  }

  function call(method, path, body, session, retried) {
    const headers = { apikey: cfg().anonKey, Authorization: 'Bearer ' + (session ? session.accessToken : cfg().anonKey) };
    if (body != null) headers['Content-Type'] = 'application/json';
    return fetch(base() + '/rest/v1' + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined })
      .then(res => {
        if (res.status === 401 && session && !retried && window.HubAuth) {
          return window.HubAuth.refresh(session).then(r => {
            if (r && r.ok) { window.HubSession.set(r.session); return call(method, path, body, r.session, true); }
            return { ok: false, status: 401, noAccount: true };
          });
        }
        return res.text().then(t => {
          let data = null;
          try { data = t ? JSON.parse(t) : null; } catch (e) { data = t; }
          const code = !res.ok && data && data.code ? String(data.code) : '';
          return { ok: res.ok, status: res.status, data, code, message: !res.ok && data && data.message ? String(data.message) : '' };
        });
      })
      .catch(() => ({ ok: false, unreachable: true }));
  }

  // opts.member: bắt buộc đăng nhập hub (không có → { noAccount:true }).
  function rest(path, opts) {
    opts = opts || {};
    if (!configured()) return Promise.resolve({ ok: false, unreachable: true });
    if (!opts.member) return call(opts.method || 'GET', path, opts.body, null);
    return freshSession().then(s => s ? call(opts.method || 'GET', path, opts.body, s) : { ok: false, noAccount: true });
  }
  function rpc(fn, args) { return rest('/rpc/' + fn, { method: 'POST', body: args || {}, member: true }); }

  // Bảng/hàm chưa cài: PostgREST trả 404 kèm PGRST202 (hàm) / PGRST205 (bảng), Postgres 42P01/42883.
  function notInstalled(r) {
    return !!r && !r.ok && (r.code === 'PGRST202' || r.code === 'PGRST205' || r.code === '42P01' || r.code === '42883' || (r.status === 404 && !r.code));
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    (window.crypto || { getRandomValues: a => a.forEach((_, i) => { a[i] = Math.random() * 256 | 0; }) }).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // Pokémon mới (thưởng boss, hàng chợ) vào đội nếu còn chỗ, không thì vào hộp PC đầu tiên còn trống.
  const BOX_SIZE = 24, BOX_COUNT = 10;
  function giveMon(mon) {
    const s = P1.state;
    if (s.party.length < 6) { s.party.push(mon); return 'party'; }
    let b = 0;
    while (b < BOX_COUNT - 1 && s.box.filter(m => (m.boxNo | 0) === b).length >= BOX_SIZE) b++;
    mon.boxNo = b;
    s.box.push(mon);
    return 'box';
  }

  P1.net = {
    me, ns,
    get status() { return status; },
    onStatus(fn) { statusFns.push(fn); },
    connect, channel, rest, rpc, notInstalled, uuid, giveMon,
    cardOf, parseCard, parseMon, parseFrom, esc, clip,
    hubUrl: '../../login.html',
  };
})(window.P1 = window.P1 || {});
