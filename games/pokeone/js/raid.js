/*
 * Đánh boss theo đội (tối đa 4 người). Không có máy chủ trận: mỗi người đánh một trận 1v1 cục bộ với boss
 * (P1.scene.go('battle', { kind:'boss', boss:{ maxHp, sharedHp, report, ended } })). Máu boss là máu chung:
 *   sharedHp = maxHp − Σ theo từng người của tổng sát thương LỚN NHẤT từng nghe thấy từ người đó.
 * Mỗi người phát dmg {id, total, down} luỹ kế sau mỗi lượt và mỗi 2 s → nhận trùng, nhận lại, mất gói
 * đều hội tụ về cùng một số. Giao thức đầy đủ: NET.md §Boss.
 *
 *   P1.raid.openLobby(bossId?)   NPC "Cổng Boss" ở Viridian gọi (không có id → chọn boss hôm nay)
 *   P1.raid.join(roomId)         nút "Tham gia" trong chat gọi
 */
(function (P1) {
  'use strict';

  const MAX = 4, FIGHT_MS = 5 * 60 * 1000, LOBBY_MS = 5 * 60 * 1000, COUNTDOWN_MS = 3000;
  const DMG_EVERY_MS = 2000, STALE_MS = 10000, HOST_WAIT_MS = 6000;

  // hp: máu khi đánh một mình; thêm mỗi người +80 %. money/exp: thưởng mỗi người có gây sát thương.
  const BOSSES = {
    snorlax:  { dex: 143, level: 30, label: 'Snorlax Khổng Lồ',     hp: 450,  money: 3000,  exp: 300,  bg: 'forest' },
    gyarados: { dex: 130, level: 30, label: 'Gyarados Cuồng Nộ',    hp: 420,  money: 3000,  exp: 300,  bg: 'ocean' },
    lapras:   { dex: 131, level: 30, label: 'Lapras Biển Băng',     hp: 440,  money: 3000,  exp: 300,  bg: 'ocean' },
    articuno: { dex: 144, level: 40, label: 'Articuno Huyền Thoại', hp: 650,  money: 6000,  exp: 600,  bg: 'land' },
    zapdos:   { dex: 145, level: 40, label: 'Zapdos Huyền Thoại',   hp: 650,  money: 6000,  exp: 600,  bg: 'land' },
    moltres:  { dex: 146, level: 40, label: 'Moltres Huyền Thoại',  hp: 650,  money: 6000,  exp: 600,  bg: 'land' },
    mewtwo:   { dex: 150, level: 50, label: 'Mewtwo Tối Thượng',    hp: 1000, money: 12000, exp: 1200, bg: 'cave 1' },
  };
  const REWARD_LEVEL = 20, SHINY_ODDS = 64;

  function maxHpFor(bossId, n) { return Math.round(BOSSES[bossId].hp * (1 + 0.8 * (Math.max(1, n) - 1))); }

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  // Ngày theo giờ Việt Nam (UTC+7) để mọi người chơi thấy cùng một bộ boss.
  function dayKey(now) { return new Date((now || Date.now()) + 7 * 3600e3).toISOString().slice(0, 10); }

  // Boss mở hôm nay: 1 boss Lv30 + 2 boss lấy từ phần còn lại, trộn theo ngày.
  function openToday(now) {
    const r = mulberry(hash('pokeone-raid:' + dayKey(now)));
    const ids = Object.keys(BOSSES);
    const low = ids.filter(id => BOSSES[id].level === 30);
    const first = low[Math.floor(r() * low.length)];
    const rest = ids.filter(id => id !== first);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    return [first, rest[0], rest[1]];
  }

  // HP chung: chỉ tính người trong danh sách trận; mỗi người lấy tổng lớn nhất từng nghe.
  function sharedHpOf(maxHp, dealt, ids) {
    return Math.max(0, maxHp - ids.reduce((a, id) => a + (dealt[id] || 0), 0));
  }

  const net = () => P1.net;
  const S = () => P1.social;
  const esc = s => P1.net.esc(s);
  function inWorld() { return P1.scene && P1.scene.name === 'world'; }
  function leadOf() {
    const party = (P1.state && P1.state.party) || [];
    const m = party.find(x => x.hp > 0) || party[0];
    return m ? { dex: m.dex, level: m.level, shiny: !!m.shiny } : null;
  }
  function iconUrl(l) { return 'art/pro/poke/icon/' + l.dex + (l.shiny ? 's' : '') + '.png'; }
  function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  /* ---------------------------------------------------------------- phòng
   * phase: joining → lobby → countdown → fight → wait (trận mình xong, đội còn đánh) → over
   */
  let room = null;

  function newRoom(id, isHost, bossId) {
    return {
      id, isHost, bossId, phase: isHost ? 'lobby' : 'joining', ch: null, roster: [], start: null,
      created: Date.now(), dealt: {}, down: {}, heard: {}, endAt: 0, fightAt: 0, result: null,
      win: null, panel: null, timers: [],
    };
  }

  function myMeta() {
    const m = { lead: leadOf(), t: room.joinedAt, host: room.isHost };
    if (room.isHost) Object.assign(m, { boss: room.bossId, phase: room.phase === 'lobby' ? 'lobby' : 'fight', start: room.start });
    return m;
  }

  function connectRoom() {
    room.joinedAt = Date.now();
    const ch = room.ch = net().channel('raid:' + room.id);
    ch.track(myMeta());
    ch.on('presence', list => onRoster(list));
    ch.on('start', (p, from) => onStart(p, from));
    ch.on('dmg', (p, from) => onDmg(p, from));
    ch.on('close', (p, from) => { if (room && room.host && from.id === room.host.id && isLobby()) end('Chủ phòng đã giải tán phòng.'); });
    ch.on('joined', () => { if (room) { const now = Date.now(); Object.keys(room.heard).forEach(id => { room.heard[id] = now; }); } });
    room.timers.push(setInterval(tick, 250));
    room.timers.push(setInterval(sendDmg, DMG_EVERY_MS));
  }

  function isLobby() { return room && (room.phase === 'joining' || room.phase === 'lobby'); }

  function sortRoster(list) {
    return list.slice().sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0) || (a.t || 0) - (b.t || 0) || (a.key < b.key ? -1 : 1));
  }

  function onRoster(list) {
    if (!room) return;
    room.roster = sortRoster(list).map(p => ({
      id: p.key, name: net().clip(p.name, 24) || '?', host: p.host === true, lead: p.lead && typeof p.lead === 'object' ? p.lead : null,
      boss: p.boss, phase: p.phase, start: p.start,
    }));
    room.roster.forEach(p => { room.heard[p.id] = Date.now(); });
    const host = room.roster.find(p => p.host);
    if (isLobby()) {
      if (!room.isHost) {
        if (!host) { renderLobby(); return; }
        room.host = { id: host.id, name: host.name };
        if (!BOSSES[host.boss]) { end('Phòng không hợp lệ.'); return; }
        room.bossId = host.boss;
        if (host.phase !== 'lobby') {
          const st = parseStart(host.start);
          if (st && st.members.some(m => m.id === net().me.id)) { beginCountdown(st, 0); return; }
          end('Phòng đã bắt đầu đánh.'); return;
        }
        const idx = room.roster.findIndex(p => p.id === net().me.id);
        if (idx >= MAX) { end('Phòng đã đủ 4 người.'); return; }
        room.phase = 'lobby';
      }
      renderLobby();
    }
  }

  function parseStart(p) {
    if (!p || typeof p !== 'object' || !BOSSES[p.boss] || !Array.isArray(p.members)) return null;
    const members = p.members.slice(0, MAX).map(net().parseFrom).filter(Boolean);
    const maxHp = p.maxHp | 0, seed = p.seed >>> 0;
    if (!members.length || maxHp !== maxHpFor(p.boss, members.length)) return null;
    return { boss: p.boss, level: BOSSES[p.boss].level, maxHp, seed, members, delay: Math.max(0, Math.min(COUNTDOWN_MS, p.delay | 0)) };
  }

  function onStart(p, from) {
    if (!room || !isLobby() || !room.host || from.id !== room.host.id) return;
    const st = parseStart(p);
    if (st) beginCountdown(st, st.delay);
  }

  function beginCountdown(st, delay) {
    if (!st.members.some(m => m.id === net().me.id)) { end('Phòng đã đủ 4 người.'); return; }
    room.start = st;
    room.bossId = st.boss;
    room.phase = 'countdown';
    room.fightAt = Date.now() + delay;
    room.endAt = room.fightAt + FIGHT_MS;
    st.members.forEach(m => { room.heard[m.id] = Date.now(); });
    if (room.isHost) room.ch.track(myMeta());
    renderLobby();
  }

  function onDmg(p, from) {
    if (!room || !room.start || p.id !== from.id || !room.start.members.some(m => m.id === from.id)) return;
    const total = Math.max(0, Math.min(1e7, p.total | 0));
    room.dealt[from.id] = Math.max(room.dealt[from.id] || 0, total);
    room.down[from.id] = p.down === true;
    room.heard[from.id] = Date.now();
  }

  function sendDmg() {
    if (!room || !room.start || !room.ch || (room.phase !== 'fight' && room.phase !== 'wait')) return;
    const id = net().me.id;
    room.ch.send('dmg', { id, total: room.dealt[id] || 0, down: !!room.down[id] });
  }

  function memberIds() { return room.start ? room.start.members.map(m => m.id) : []; }
  function sharedHp() { return room && room.start ? sharedHpOf(room.start.maxHp, room.dealt, memberIds()) : 0; }

  // Người khác coi như gục khi tự báo gục, hoặc im quá 10 s trong lúc mình vẫn đang nối mạng.
  function isDown(id) {
    if (room.down[id]) return true;
    if (id === net().me.id || net().status !== 'on') return false;
    return Date.now() - (room.heard[id] || 0) > STALE_MS;
  }
  function ended() {
    if (!room || !room.start) return true;
    return Date.now() >= room.endAt || memberIds().every(isDown);
  }

  function report(total) {
    if (!room || !room.start) return;
    const id = net().me.id;
    room.dealt[id] = Math.max(room.dealt[id] || 0, Math.max(0, total | 0));
    sendDmg();
  }

  function launchBattle() {
    const b = BOSSES[room.bossId], st = room.start;
    const saved = P1.rng;
    P1.rng = mulberry(st.seed);                  // mọi người đánh cùng một con boss (IV, tính cách, chiêu)
    let foe;
    try { foe = P1.mon.create(b.dex, b.level, { shiny: false, ot: 'Boss' }); } finally { P1.rng = saved; }
    room.phase = 'fight';
    closeLobby();
    try { goBattle(foe, b, st); } catch (e) { console.error(e); room.down[net().me.id] = true; room.phase = 'wait'; }
  }

  function goBattle(foe, b, st) {
    P1.scene.go('battle', {
      kind: 'boss', foe: [foe], name: b.label, bg: b.bg, canLose: true,
      boss: { maxHp: st.maxHp, sharedHp, report, ended },
      onEnd: out => {
        const r = room;
        if (r && r.phase === 'fight') {
          if (!(out && out.outcome === 'win')) r.down[net().me.id] = true;
          r.phase = 'wait';
          sendDmg();
        }
        return P1.scene.go('world', { resume: true });
      },
    });
  }

  function tick() {
    if (!room) return;
    const now = Date.now();
    if (room.isHost && isLobby() && now - room.created > LOBBY_MS) { disband('Phòng hết hạn chờ.'); return; }
    if (!room.isHost && room.phase === 'joining' && now - room.joinedAt > HOST_WAIT_MS && !room.host) { end('Phòng không còn tồn tại.'); return; }
    if (!room.isHost && isLobby() && room.host && !room.roster.some(p => p.id === room.host.id) && net().status === 'on') {
      end('Chủ phòng đã rời, phòng giải tán.'); return;
    }
    if (room.phase === 'countdown' && now >= room.fightAt) {
      if (inWorld()) launchBattle();
      else if (now > room.fightAt + 15000) { room.down[net().me.id] = true; room.phase = 'wait'; }
    }
    // Trận không mở được (hoặc bị đóng mà không gọi onEnd): coi như mình gục, chờ đội.
    if (room.phase === 'fight' && P1.scene.name !== 'battle' && now > room.fightAt + 5000) { room.down[net().me.id] = true; room.phase = 'wait'; }
    if (room.phase === 'wait') {
      if (sharedHp() <= 0) resolve(true);
      else if (ended()) resolve(false);
    }
    if (room && room.phase === 'lobby' || room && room.phase === 'countdown') updateLobbyClock();
    renderPanel();
  }

  function resolve(win) {
    if (!room || room.phase === 'over') return;
    room.phase = 'over';
    const b = BOSSES[room.bossId], mine = room.dealt[net().me.id] || 0;
    let text;
    if (win && mine > 0) text = reward(b);
    else if (win) text = 'Đội đã hạ ' + b.label + ', nhưng bạn chưa gây sát thương nên không có thưởng.';
    else text = Date.now() >= room.endAt ? 'Hết 5 phút, ' + b.label + ' vẫn đứng vững.' : 'Cả đội đã gục trước ' + b.label + '.';
    room.result = { win, text, dealt: mine };
    const r = room;
    setTimeout(() => { if (room === r) end(null); }, 1500);
    showResult(r, win, text);
  }

  function reward(b) {
    const s = P1.state;
    const done = s.raidDone = s.raidDone || [];
    if (done.includes(room.id)) return 'Phần thưởng phòng này đã nhận rồi.';
    done.push(room.id);
    if (done.length > 30) done.splice(0, done.length - 30);
    s.money = (s.money | 0) + b.money;
    s.trainerExp = (s.trainerExp | 0) + b.exp;
    const mon = P1.mon.create(b.dex, REWARD_LEVEL, { shiny: Math.random() < 1 / SHINY_ODDS, ot: net().me.name, metAt: 'Boss' });
    const where = net().giveMon(mon);
    if (P1.caught) P1.caught(b.dex);
    P1.save();
    return 'Thắng! Nhận ₽' + b.money + ', ' + b.exp + ' EXP huấn luyện và ' + P1.chat.monLabel(net().cardOf(mon)) +
      (where === 'box' ? ' (gửi vào PC).' : ' (vào đội).');
  }

  function showResult(r, win, text) {
    const p = S().popup({ name: 'raid-result', title: win ? 'Chiến thắng!' : 'Thất bại', w: 340 });
    p.body.innerHTML = '<p class="p1s-result">' + esc(text) + '</p>' + teamHtml(r);
    p.foot.appendChild(S().button('Đóng', { primary: true, onClick: () => p.close() }));
  }

  function end(msg) {
    if (!room) return;
    const r = room;
    room = null;
    r.timers.forEach(clearInterval);
    if (r.ch) r.ch.leave();
    closeLobby(r);
    if (r.panel) r.panel.remove();
    if (msg) S().toast(msg);
  }

  function disband(msg) {
    if (room && room.isHost && room.ch) room.ch.send('close', {});
    end(msg);
  }

  /* ---------------------------------------------------------------- API */

  function canEnter() {
    if (!inWorld()) { S().toast('Chỉ vào phòng boss khi đang đi ngoài bản đồ.'); return false; }
    if (!leadOf() || !(P1.state.party || []).some(m => m.hp > 0)) { S().toast('Cần ít nhất một Pokémon còn sức.'); return false; }
    if (net().status === 'offline') { S().toast('Đánh boss cần mạng: chưa cấu hình máy chủ.'); return false; }
    return true;
  }

  function openLobby(bossId) {
    if (room) { renderLobby(true); return; }
    const today = openToday();
    if (!bossId || !BOSSES[bossId]) { pickBoss(today); return; }
    if (!today.includes(bossId)) {
      S().toast(BOSSES[bossId].label + ' không xuất hiện hôm nay. Hôm nay: ' + today.map(id => BOSSES[id].label).join(', ') + '.');
      return;
    }
    if (!canEnter()) return;
    room = newRoom('r' + Math.random().toString(36).slice(2, 10), true, bossId);
    room.host = { id: net().me.id, name: net().me.name };
    connectRoom();
    renderLobby(true);
    P1.chat.invite({ room: room.id, boss: bossId, host: net().me.name, slots: 1, expires: room.created + LOBBY_MS });
  }

  function join(roomId) {
    if (!/^r[a-z0-9]{6,12}$/.test(String(roomId))) return;
    if (room) { if (room.id === roomId) renderLobby(true); else S().toast('Bạn đang ở một phòng boss khác.'); return; }
    if (!canEnter()) return;
    room = newRoom(roomId, false, null);
    connectRoom();
    renderLobby(true);
  }

  function parseInvite(p) {
    if (!p || typeof p !== 'object') return null;
    const room = String(p.room || ''), boss = BOSSES[p.boss];
    const expires = +p.expires;
    if (!/^r[a-z0-9]{6,12}$/.test(room) || !boss || !(expires > 0) || expires > Date.now() + LOBBY_MS + 60000) return null;
    return {
      room, boss: p.boss, host: net().clip(p.host, 24), slots: Math.max(1, Math.min(MAX, p.slots | 0)), expires,
      label: boss.label + ' Lv' + boss.level,
    };
  }

  /* ---------------------------------------------------------------- giao diện */

  function pickBoss(today) {
    const p = S().popup({ name: 'raid-pick', title: 'Cổng Boss — hôm nay', w: 360 });
    p.body.innerHTML = '<p class="p1s-note">Mỗi ngày mở 3 boss. Mở phòng rồi mời người trong chat, tối đa 4 người, 5 phút.</p>';
    today.forEach(id => {
      const b = BOSSES[id];
      const row = document.createElement('div');
      row.className = 'p1s-row';
      row.innerHTML = '<img class="ic" alt="" src="art/pro/poke/icon/' + b.dex + '.png" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="grow"><b>' + esc(b.label) + '</b><div class="sub">Lv' + b.level + ' · máu ' + b.hp + '/người · ₽' + b.money + '</div></div>';
      row.appendChild(S().button('Mở phòng', { onClick: () => { p.close(); openLobby(id); } }));
      p.body.appendChild(row);
    });
  }

  function closeLobby(r) {
    r = r || room;
    if (r && r.win) { const w = r.win; r.win = null; w.onlyHide = true; w.close(); }
  }

  function teamHtml(r) {
    const ids = r.start ? r.start.members : r.roster;
    return '<div class="p1s-team">' + ids.map(m => {
      const dealt = r.dealt[m.id] || 0;
      return '<div><span>' + esc(m.name) + '</span><b>' + dealt + '</b></div>';
    }).join('') + '</div>';
  }

  function renderLobby(show) {
    if (!room) return;
    if (!room.win && !show) return;
    if (!room.win) {
      const r = room;
      room.win = S().popup({
        name: 'raid-lobby', title: 'Phòng boss', w: 380, cls: 'p1s-lobby',
        onClose: () => { if (r.win && !r.win.onlyHide && room === r && isLobby()) { if (r.isHost) disband('Đã giải tán phòng.'); else end('Đã rời phòng.'); } r.win = null; },
      });
    }
    const w = room.win, b = BOSSES[room.bossId];
    w.setTitle(b ? 'Phòng boss — ' + b.label + ' Lv' + b.level : 'Đang vào phòng…');
    const n = room.start ? room.start.members.length : Math.min(MAX, room.roster.length || 1);
    const slots = [];
    for (let i = 0; i < MAX; i++) {
      const m = room.start ? room.roster.find(p => p.id === (room.start.members[i] || {}).id) || room.start.members[i] : room.roster[i];
      if (!m) { slots.push('<div class="p1s-slot empty">Chỗ trống</div>'); continue; }
      const lead = m.lead;
      slots.push('<div class="p1s-slot">' +
        (lead ? '<img class="ic" alt="" src="' + esc(iconUrl(lead)) + '" onerror="this.style.visibility=\'hidden\'">' : '<span class="ic"></span>') +
        '<div class="grow"><b>' + esc(m.name) + '</b>' + (m.host ? ' <i class="tag">Chủ phòng</i>' : '') +
        '<div class="sub">' + (lead ? esc(P1.chat.speciesName(lead.dex)) + ' Lv' + (lead.level | 0) + (lead.shiny ? ' ★' : '') : '') + '</div></div></div>');
    }
    w.body.innerHTML =
      '<div class="p1s-note">Mã phòng <b class="rid">' + esc(room.id) + '</b> · <span class="clock"></span></div>' +
      (b ? '<div class="p1s-note">Máu boss chung: <b>' + maxHpFor(room.bossId, n) + '</b> (' + n + ' người) · 5 phút</div>' : '') +
      '<div class="p1s-slots">' + slots.join('') + '</div>';
    w.foot.innerHTML = '';
    if (room.phase === 'countdown') {
      w.foot.innerHTML = '<div class="p1s-count">Vào trận…</div>';
    } else if (room.isHost) {
      w.foot.append(
        S().button('Giải tán', { onClick: () => w.close() }),
        S().button('Mời lại', { onClick: () => P1.chat.invite({ room: room.id, boss: room.bossId, host: net().me.name, slots: Math.min(MAX, room.roster.length || 1), expires: room.created + LOBBY_MS }) }),
        S().button('Bắt đầu', { primary: true, onClick: hostStart }));
    } else {
      w.foot.append(S().button('Rời phòng', { onClick: () => w.close() }));
    }
    updateLobbyClock();
  }

  function updateLobbyClock() {
    const c = room && room.win && room.win.body.querySelector('.clock');
    if (!c) return;
    c.textContent = room.phase === 'countdown' ? 'vào trận sau ' + mmss(room.fightAt - Date.now())
      : room.phase === 'joining' ? 'đang tìm chủ phòng…' : 'phòng đóng sau ' + mmss(room.created + LOBBY_MS - Date.now());
    const cnt = room.win.foot.querySelector('.p1s-count');
    if (cnt) cnt.textContent = 'Vào trận sau ' + Math.max(0, Math.ceil((room.fightAt - Date.now()) / 1000)) + '…';
  }

  function hostStart() {
    if (!room || !room.isHost || room.phase !== 'lobby') return;
    if (!inWorld()) { S().toast('Chỉ bắt đầu khi đang ở ngoài bản đồ.'); return; }
    const members = room.roster.slice(0, MAX).map(p => ({ id: p.id, name: p.name }));
    if (!members.some(m => m.id === net().me.id)) members.unshift({ id: net().me.id, name: net().me.name });
    const st = {
      boss: room.bossId, maxHp: maxHpFor(room.bossId, members.length), seed: (Math.random() * 4294967296) >>> 0,
      members: members.slice(0, MAX), delay: COUNTDOWN_MS, level: BOSSES[room.bossId].level, at: Date.now() + COUNTDOWN_MS,
    };
    room.ch.send('start', st);
    beginCountdown(parseStart(st), COUNTDOWN_MS);
  }

  // Bảng đồng đội phủ lên trận (và ngoài bản đồ khi mình đã gục mà đội còn đánh).
  function renderPanel() {
    const show = room && room.start && (room.phase === 'fight' || room.phase === 'wait');
    if (!show) { if (room && room.panel) { room.panel.remove(); room.panel = null; } return; }
    if (!room.panel) {
      room.panel = document.createElement('div');
      room.panel.className = 'p1s-raidpanel';
      S().sprite(room.panel, 'window_simple_BG');
      (document.getElementById('ui') || document.body).appendChild(room.panel);
    }
    const b = BOSSES[room.bossId], hp = sharedHp(), max = room.start.maxHp;
    room.panel.innerHTML =
      '<div class="rp-head"><b>' + esc(b.label) + '</b><span>' + mmss(room.endAt - Date.now()) + '</span></div>' +
      '<div class="rp-bar"><i style="width:' + (100 * hp / max).toFixed(1) + '%"></i><span>' + hp + ' / ' + max + '</span></div>' +
      room.start.members.map(m => {
        const down = isDown(m.id);
        return '<div class="rp-row' + (down ? ' down' : '') + (m.id === net().me.id ? ' me' : '') + '"><span>' + esc(m.name) + '</span>' +
          '<b>' + (room.dealt[m.id] || 0) + '</b><i>' + (down ? 'Gục' : 'Đang đánh') + '</i></div>';
      }).join('') +
      (room.phase === 'wait' ? '<div class="rp-wait">Bạn đã rời trận — chờ đồng đội…</div>' : '');
  }

  P1.raid = {
    BOSSES, openToday, dayKey, maxHpFor, sharedHpOf, openLobby, join, parseInvite,
    leave: () => { if (room) (room.isHost && isLobby() ? disband : end)('Đã rời phòng.'); },
    // Cho bộ kiểm và gỡ lỗi: ảnh chụp trạng thái phòng.
    get room() {
      return room && { id: room.id, phase: room.phase, isHost: room.isHost, bossId: room.bossId, roster: room.roster.map(p => p.id),
        members: memberIds(), dealt: Object.assign({}, room.dealt), sharedHp: sharedHp(), maxHp: room.start ? room.start.maxHp : 0, ended: room.start ? ended() : false };
    },
  };
})(window.P1 = window.P1 || {});
