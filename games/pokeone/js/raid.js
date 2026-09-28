/*
 * Boss là HUẤN LUYỆN VIÊN như PRO (8 thủ lĩnh Kanto, Tứ Thiên Vương, Nhà vô địch), đánh theo mô hình co-op của PokéOne
 * (BattleLobbyHandler / LobbyWindow / LootVote, NET.md §Boss):
 *   nói chuyện với boss → "Đánh một mình" (trận huấn luyện viên thường) hoặc "Lập phòng" → phòng chờ có MÃ PHÒNG
 *   (Team1 người chơi, Team2 boss NPC; mỗi người Idle → Accept → Confirm) → đếm ngược → MỘT trận Showdown chung:
 *   mọi người phe p1, mỗi người một ô; phe p2 là đội của boss, ra sân đủ số ô, AI điều khiển mọi ô (P1.CoopBattle) →
 *   thắng thì chia chiến lợi phẩm Cần / Tham / Bỏ trong 20 s. Thắng xong mỗi người chờ 12 ngày mới đánh lại boss đó.
 *
 * Không có máy chủ trận. Mọi máy chạy cùng một sim từ (seed, đội đã chốt, nhật ký lựa chọn). Trạng thái phòng là các
 * DÒNG của từng người trong kênh 'raid:<mã>': mỗi người chỉ tự ghi dòng của mình và broadcast cả dòng ('row', số thứ tự
 * seq tăng dần) khi đổi và mỗi 2 s. Presence chỉ để biết ai đang ở phòng và thứ tự vào (track một lần — máy chủ đóng
 * kênh nếu track quá ~5 lần / 30 s [đo]). Chủ phòng (host) là người đầu tiên trong danh sách trận còn ở đó, chỉ việc
 * quyết mục nhật ký kế tiếp.
 *
 *   P1.raid.openLobby(bossId)    lệnh kịch bản `raid <bossId>` của NPC boss gọi → hỏi Đánh một mình / Lập phòng
 *   P1.raid.join(code)           nút "Tham gia" cạnh mã phòng trong chat, hoặc ô "Nhập mã phòng"
 */
(function (P1) {
  'use strict';

  const MAX = 3;                                   // PokéOne: đội tối đa 3 người (boss ít Pokémon hơn thì ít hơn)
  const MONS = 3;                                  // mỗi người mang tối đa 3 Pokémon (PokemonCount), 1 con trên sân
  const LOBBY_MS = 5 * 60 * 1000, CONFIRM_MS = 6000, COUNTDOWN_MS = 3000, JOIN_WAIT_MS = 8000;
  // ActorTimer: hết giờ thì chủ phòng tự chọn thay. ?raidturn=<giây> chỉ để bộ kiểm rút ngắn.
  const TURN_MS = (+new URLSearchParams(location.search).get('raidturn') || 30) * 1000;
  const ANIM_GRACE_MS = 20000;                     // chủ phòng chưa diễn xong lượt trước thì đồng hồ vẫn chạy sau chừng này
  // Vắng khỏi presence lâu hơn LOST_MS → mất quyền làm chủ phòng (dính). Chính mình mất kênh lâu hơn SELF_LOST_MS thì
  // tự nhường trước — ngưỡng của mình ngắn hơn ngưỡng người khác dùng để thay mình, nên không có lúc hai chủ phòng.
  const LOST_MS = 4000, SELF_LOST_MS = 1500;
  const ROW_EVERY_MS = 2000, ROW_GAP_MS = 150;
  // Bỏ phiếu mở khi mọi người còn ở phòng đã xem xong trận (dòng có done), chậm nhất LOOT_WAIT_MS sau lượt cuối;
  // mỗi máy tính lúc mở theo lúc chính nó thấy đủ done → lệch nhau cỡ độ trễ broadcast. Chốt kết quả sau LOOT_SETTLE_MS.
  const LOOT_WAIT_MS = 30000, LOOT_MS = 20000, LOOT_SETTLE_MS = 3000, LINGER_MS = 8000;
  const COOLDOWN_MS = 12 * 24 * 3600e3;            // PRO bosses.json: "cooldown": "12 days" (mỗi người, mỗi boss)
  const EGG_LEVEL = 5, SHINY_ODDS = 64;
  // Mã phòng 6 ký tự, bỏ chữ dễ nhầm (0/O, 1/I). Nhận ra trong chat khi đứng riêng và có cả chữ lẫn số.
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_RE = /(^|[^A-Za-z0-9])([A-HJ-NP-Z2-9]{6})(?![A-Za-z0-9])/g;

  /*
   * Đội hình và cấp theo FRLG [MAINLINE FRLG, PRO không công bố đội hình] — chép theo trí nhớ Bulbapedia, chưa đối
   * chiếu lại. Chiêu không phải moveset gốc: mỗi con lấy 4 chiêu học gần nhất theo cấp (P1.mon.create).
   * sprite: npc/sprite<N> của PRO, nhận bằng mắt trên bảng ghép D:\pro-ref\cache\npc (dấu ? = chưa chắc).
   * money: tiền thưởng FRLG (100 × cấp con cuối; Nhà vô địch 200 ×). item: [ĐỀ XUẤT]. egg: trứng loài đặc trưng →
   * nở ngay thành dạng gốc Lv5 (trò chơi chưa có ấp trứng). map: gợi ý cho luồng bản đồ, chưa có map này.
   */
  const BOSSES = {
    brock:    { name: 'Brock',     title: 'Thủ lĩnh Pewter',   sprite: 27,  map: 'pewter_gym',     bg: 'indoor', money: 1400,  item: ['superpotion', 5], egg: 95,
      team: [[74, 12], [95, 14]] },
    misty:    { name: 'Misty',     title: 'Thủ lĩnh Cerulean', sprite: 181, map: 'cerulean_gym',   bg: 'indoor', money: 2100,  item: ['greatball', 5], egg: 120,
      team: [[120, 18], [121, 21]] },
    surge:    { name: 'Lt. Surge', title: 'Thủ lĩnh Vermilion', sprite: 37, map: 'vermilion_gym',  bg: 'indoor', money: 2400,  item: ['hyperpotion', 3], egg: 172,
      team: [[100, 21], [25, 18], [26, 24]] },
    erika:    { name: 'Erika',     title: 'Thủ lĩnh Celadon',  sprite: 36,  map: 'celadon_gym',    bg: 'indoor', money: 2900,  item: ['ultraball', 5], egg: 43,
      team: [[71, 29], [114, 24], [45, 29]] },
    koga:     { name: 'Koga',      title: 'Thủ lĩnh Fuchsia',  sprite: 167, spriteSure: false, map: 'fuchsia_gym', bg: 'indoor', money: 4300, item: ['maxpotion', 2], egg: 109,
      team: [[109, 37], [89, 39], [109, 37], [110, 43]] },
    sabrina:  { name: 'Sabrina',   title: 'Thủ lĩnh Saffron',  sprite: 39,  spriteSure: false, map: 'saffron_gym', bg: 'indoor', money: 4300, item: ['rarecandy', 1], egg: 63,
      team: [[64, 38], [122, 37], [49, 38], [65, 43]] },
    blaine:   { name: 'Blaine',    title: 'Thủ lĩnh Cinnabar', sprite: 34,  spriteSure: false, map: 'cinnabar_gym', bg: 'indoor', money: 4700, item: ['revive', 3], egg: 58,
      team: [[58, 42], [77, 40], [78, 42], [59, 47]] },
    giovanni: { name: 'Giovanni',  title: 'Thủ lĩnh Viridian', sprite: 47,  map: 'viridian_gym',   bg: 'indoor', money: 5000,  item: ['rarecandy', 2], egg: 111,
      team: [[111, 45], [51, 42], [31, 44], [34, 45], [112, 50]] },
    lorelei:  { name: 'Lorelei',   title: 'Tứ Thiên Vương',    sprite: 64,  map: 'indigo_lorelei', bg: 'indoor', money: 5400,  item: ['fullrestore', 2], egg: 131,
      team: [[87, 52], [91, 51], [80, 52], [124, 54], [131, 54]] },
    bruno:    { name: 'Bruno',     title: 'Tứ Thiên Vương',    sprite: 74,  map: 'indigo_bruno',   bg: 'indoor', money: 5600,  item: ['maxrevive', 2], egg: 66,
      team: [[95, 51], [107, 53], [106, 53], [95, 54], [68, 56]] },
    agatha:   { name: 'Agatha',    title: 'Tứ Thiên Vương',    sprite: 9,   spriteSure: false, map: 'indigo_agatha', bg: 'indoor', money: 5800, item: ['ppup', 2], egg: 92,
      team: [[94, 54], [42, 54], [93, 53], [24, 56], [94, 58]] },
    lance:    { name: 'Lance',     title: 'Tứ Thiên Vương',    sprite: 67,  map: 'indigo_lance',   bg: 'indoor', money: 6000,  item: ['rarecandy', 3], egg: 147,
      team: [[130, 56], [148, 54], [148, 54], [142, 58], [149, 60]] },
    blue:     { name: 'Blue',      title: 'Nhà vô địch',       sprite: 46,  map: 'indigo_champion', bg: 'indoor', money: 12600, item: ['masterball', 1], egg: 4,
      team: [[18, 59], [65, 57], [112, 59], [130, 59], [103, 61], [6, 63]] },
  };
  const exp = b => 50 * Math.max(...b.team.map(t => t[1]));   // EXP huấn luyện cho mỗi người thắng [ĐỀ XUẤT]

  // Số người tối đa: 3, nhưng không quá số Pokémon của boss (phe boss phải đủ con cho mọi ô, không thêm con bịa).
  function maxFor(bossId) { return Math.min(MAX, BOSSES[bossId].team.length); }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

  /* Đội boss dựng giống hệt trên mọi máy (P1.rng gieo bằng seed). n con đầu ra sân; phần còn lại dự bị. */
  function trainerTeam(bossId, seed) {
    const b = BOSSES[bossId], saved = P1.rng;
    P1.rng = P1.mulberry(seed ^ 0x5bd1e995);
    try { return b.team.map(([dex, level]) => P1.mon.create(dex, level, { shiny: false, ot: b.name })); } finally { P1.rng = saved; }
  }

  // Hồi 12 ngày tính từ lần THẮNG gần nhất của người chơi này (thua / bỏ cuộc thì đánh lại được ngay).
  function cooldownLeft(bossId, now) {
    const t = ((P1.state && P1.state.bossWins) || {})[bossId] || 0;
    return Math.max(0, t + COOLDOWN_MS - (now || Date.now()));
  }
  function markWin(bossId) {
    const s = P1.state;
    s.bossWins = Object.assign({}, s.bossWins, { [bossId]: Date.now() });
  }
  function daysLeft(ms) { return Math.ceil(ms / 864e5); }

  function newCode() {
    const b = new Uint8Array(6);
    (window.crypto || { getRandomValues: a => a.forEach((_, i) => { a[i] = Math.random() * 256 | 0; }) }).getRandomValues(b);
    let c = [...b].map(x => CODE_ABC[x % CODE_ABC.length]).join('');
    if (!/[2-9]/.test(c)) c = c.slice(0, 5) + '7';
    if (!/[A-Z]/.test(c)) c = 'K' + c.slice(1);
    return c;
  }
  function normCode(raw) { const c = String(raw || '').trim().toUpperCase(); return /^[A-HJ-NP-Z2-9]{6}$/.test(c) ? c : null; }
  // Các mã phòng trong một câu chat: [{ index, code }]. Chỉ nhận mã có cả chữ lẫn số để ít bắt nhầm chữ in hoa.
  function findCodes(text) {
    const out = [];
    String(text || '').replace(CODE_RE, (m, pre, code, at) => {
      if (/[2-9]/.test(code) && /[A-Z]/.test(code)) out.push({ index: at + pre.length, code });
      return m;
    });
    return out;
  }
  function codeText(bossId, code) { return '[Boss] ' + BOSSES[bossId].name + ' — mã phòng ' + code; }

  /* ---------------------------------------------------------------- chiến lợi phẩm (LootVote) */

  function lootFor(bossId) {
    const b = BOSSES[bossId];
    return [
      { id: 'money', kind: 'money', amount: b.money },
      { id: 'item', kind: 'item', key: b.item[0], qty: b.item[1] },
      { id: 'egg', kind: 'egg', dex: b.egg, level: EGG_LEVEL },
    ];
  }
  function lootRoll(seed, lootId, id) { return 1 + hash(seed + '|' + lootId + '|' + id) % 100; }
  /*
   * Người thắng một món, tính giống nhau trên mọi máy từ (seed, lootId, phiếu): có Need thì chỉ xét Need, không thì
   * Greed; điểm 1–100 băm từ seed; bằng điểm thì id nhỏ hơn. Mọi người Pass (hoặc im) → không ai nhận.
   */
  function lootWinner(seed, lootId, votes, ids) {
    for (const tier of ['need', 'greed']) {
      const c = ids.filter(id => votes[id] === tier).map(id => ({ id, tier, roll: lootRoll(seed, lootId, id) }));
      if (c.length) return c.sort((a, b) => b.roll - a.roll || (a.id < b.id ? -1 : 1))[0];
    }
    return null;
  }

  /* ---------------------------------------------------------------- Pokémon mang vào trận */

  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const STATUS = ['', 'brn', 'par', 'psn', 'tox', 'slp', 'frz'];

  // Dòng presence mang đủ để dựng con trong sim: MonCard + EV, PP, HP, trạng thái.
  function fighterOf(mon) {
    return Object.assign(P1.net.cardOf(mon), {
      evs: Object.assign({}, mon.evs), moves: mon.moves.map(s => ({ id: s.id, pp: s.pp })), hp: mon.hp, status: mon.status || '',
      happiness: mon.happiness,
    });
  }
  // Dữ liệu người khác gửi: dựng lại qua parseMon (kẹp mọi trường), rồi HP/trạng thái đã kiểm. Hỏng → null.
  function parseFighter(raw) {
    const m = raw && P1.net.parseMon(raw);
    if (!m) return null;
    const max = P1.mon.stats(m).hp;
    m.hp = Math.max(0, Math.min(max, Math.floor(+raw.hp)));
    if (!(m.hp >= 0)) m.hp = max;
    m.status = STATUS.includes(raw.status) ? raw.status : '';
    return m.hp > 0 ? m : null;
  }
  function parseEntry(e) {
    const ok = x => x === null || (typeof x === 'string' && x.length <= 200);
    return Array.isArray(e) && e.length === 2 && ok(e[0]) && ok(e[1]) ? [e[0], e[1]] : null;
  }
  function parseLog(raw) {
    if (!Array.isArray(raw) || raw.length > 400) return [];
    const out = [];
    for (const e of raw) { const x = parseEntry(e); if (!x) break; out.push(x); }
    return out;
  }

  /* ---------------------------------------------------------------- phòng: một máy trạng thái
   *
   * Lobby = { room, boss, leader, actors:[Actor], phase:'lobby'|'countdown'|'battle'|'loot'|'closed', seed,
   *           order:[id], party:[{id,name,mons}], reason }
   * Actor = { id, name, team:1|2, kind:'leader'|'user'|'npc', state:'idle'|'accept'|'confirm', mons:[mon], count, active }
   *
   * reduce(lobby, sự kiện) là hàm thuần. Sự kiện: { type:'rows', rows, me } (ảnh chụp presence, dòng của mình là bản
   * cục bộ), { type:'result', win } (trận chung xong — tất định trên mọi máy), { type:'close', reason }.
   * Mọi việc có hiệu ứng (vào trận, quyết lượt, mở cửa sổ) làm trong effects(trước, sau).
   */
  function emptyLobby(room) {
    return { room, boss: null, leader: null, actors: [], phase: 'lobby', seed: 0, order: [], party: [], reason: '', launch: '' };
  }

  function reduce(L, ev) {
    if (L.phase === 'closed') return L;
    if (ev.type === 'close') return Object.assign({}, L, { phase: 'closed', reason: ev.reason || '' });
    if (ev.type === 'result') return Object.assign({}, L, { phase: ev.win ? 'loot' : 'closed', reason: ev.reason || '' });
    if (ev.type !== 'rows') return L;
    const rows = ev.rows, me = ev.me;
    const lead = rows.find(r => r.lead && BOSSES[r.lead.boss]);
    const next = Object.assign({}, L);
    if (L.phase === 'lobby' || L.phase === 'countdown') {
      if (!lead) {
        if (L.leader && !ev.offline) return Object.assign(next, { phase: 'closed', reason: 'Chủ phòng đã rời, phòng giải tán.' });
        return next;
      }
      const d = lead.lead;
      next.leader = lead.id;
      next.boss = d.boss;
      next.launch = d.launch || '';
      const players = rows.filter(r => r.id === lead.id || !r.lead)
        .sort((a, b) => (a.id === lead.id ? -1 : b.id === lead.id ? 1 : (a.t - b.t) || (a.id < b.id ? -1 : 1)));
      const cap = maxFor(d.boss);
      next.actors = players.slice(0, cap).map(r => ({
        id: r.id, name: r.name, team: 1, kind: r.id === lead.id ? 'leader' : 'user', state: r.state, mons: r.mons,
        count: r.mons.length, active: 1,
      }));
      if (d.phase === 'countdown' || d.phase === 'battle') {
        if (!d.order.includes(me)) return Object.assign(next, { phase: 'closed', reason: 'Phòng đã bắt đầu đánh.' });
        Object.assign(next, { phase: d.phase, order: d.order, party: d.party, seed: d.seed });
      } else if (players.findIndex(r => r.id === me) >= cap) {
        return Object.assign(next, { phase: 'closed', reason: 'Phòng đã đủ ' + cap + ' người.' });
      }
      const n = Math.max(1, next.phase === 'lobby' ? next.actors.length : next.order.length);
      const b = BOSSES[next.boss];
      next.actors.push({ id: 'boss', name: b.name, team: 2, kind: 'npc', state: 'confirm', mons: [], count: b.team.length, active: n });
      return next;
    }
    return next;                                     // battle / loot: đội đã chốt, presence chỉ còn là đường truyền lượt
  }

  /* Dòng presence → dữ liệu đã kiểm. */
  function parseRow(p) {
    const lead = p.lead && typeof p.lead === 'object' && BOSSES[p.lead.boss] ? {
      boss: p.lead.boss, phase: ['lobby', 'countdown', 'battle'].includes(p.lead.phase) ? p.lead.phase : 'lobby',
      launch: P1.net.clip(p.lead.launch, 16), seed: p.lead.seed >>> 0, created: +p.lead.created || 0,
      order: Array.isArray(p.lead.order) ? p.lead.order.slice(0, MAX).map(x => P1.net.clip(x, 48)).filter(Boolean) : [],
      party: Array.isArray(p.lead.party) ? p.lead.party.slice(0, MAX).map(x => x && {
        id: P1.net.clip(x.id, 48), name: P1.net.clip(x.name, 24) || '?',
        mons: (Array.isArray(x.mons) ? x.mons.slice(0, MONS) : []).map(parseFighter).filter(Boolean),
      }).filter(x => x && x.id && x.mons.length) : [],
    } : null;
    const pick = p.pick && typeof p.pick === 'object' && Number.isInteger(p.pick.n) && p.pick.c && typeof p.pick.c === 'object' ? p.pick : null;
    return {
      id: p.key, name: P1.net.clip(p.name, 24) || '?', t: +p.t || 0, lead,
      state: ['idle', 'accept', 'confirm'].includes(p.state) ? p.state : 'idle', confirmFor: P1.net.clip(p.confirmFor, 16),
      mons: (Array.isArray(p.mons) ? p.mons.slice(0, MONS) : []).map(parseFighter).filter(Boolean),
      pick, log: parseLog(p.log), votes: p.votes && typeof p.votes === 'object' ? p.votes : {}, done: p.done === true, quit: p.quit === true,
    };
  }

  /* ---------------------------------------------------------------- phòng đang chạy */

  const net = () => P1.net;
  const S = () => P1.social;
  const esc = s => P1.net.esc(s);
  function inWorld() { return P1.scene && P1.scene.name === 'world'; }
  function iconUrl(m) { return 'art/pro/poke/icon/' + m.dex + '.png'; }
  function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  let room = null;

  function newRoom(id, bossId) {
    const me = net().me.id;
    const healthy = (P1.state.party || []).filter(m => m.hp > 0);
    const r = {
      id, me, lobby: emptyLobby(id), rows: {}, members: {}, raw: {}, seq: 0, lastSend: 0, sendTimer: 0, ch: null, win: null, timers: [], created: Date.now(),
      picks: healthy.slice(0, MONS).map(m => m.uid),
      row: { t: Date.now(), state: 'idle', confirmFor: '', mons: [], pick: null, log: [], votes: {}, done: false },
      fight: null, loot: null, launchAt: 0, countdownAt: 0,
    };
    r.row.mons = r.picks.map(uid => fighterOf(P1.state.party.find(m => m.uid === uid)));
    if (bossId) {
      r.row.lead = { boss: bossId, phase: 'lobby', launch: '', seed: 0, order: [], party: [], created: r.created };
      r.row.state = 'accept';
    }
    return r;
  }

  // Gửi dòng của mình (gộp đuôi ROW_GAP_MS: nhiều thay đổi liền nhau chỉ gửi bản mới nhất).
  function publish() {
    if (!room || !room.ch || room.sendTimer) return;
    const wait = room.lastSend + ROW_GAP_MS - Date.now();
    if (wait > 0) { room.sendTimer = setTimeout(() => { if (room) { room.sendTimer = 0; publish(); } }, wait); return; }
    room.lastSend = Date.now();
    const row = Object.assign({}, room.row, { seq: ++room.seq });
    if (room.fight) row.log = room.fight.cb.log;
    room.ch.send('row', row);
  }

  // Ảnh chụp các dòng: người đang ở phòng (presence) có dòng đã nhận; của mình là bản cục bộ.
  function rowsNow() {
    const out = [];
    Object.values(room.rows).forEach(r => { if (r.id !== room.me) out.push(r); });
    out.push(parseRow(Object.assign({ key: room.me, name: net().me.name }, room.row, { mons: room.row.mons })));
    return out;
  }
  function rebuildRows() {
    const rows = {};
    Object.keys(room.members).forEach(id => {
      const raw = room.raw[id];
      if (raw) rows[id] = Object.assign({}, raw, { t: room.members[id].t, name: room.members[id].name || raw.name });
    });
    room.rows = rows;
  }
  function onRows() {
    if (!room) return;
    rebuildRows();
    if (room.fight) noteRoster();
    refresh();
    if (room && room.fight) { syncLog(); hostStep(); }
    if (room && room.loot) lootStep();
  }

  function dispatch(ev) {
    if (!room) return;
    const prev = room.lobby;
    const next = reduce(prev, ev);
    room.lobby = next;
    effects(prev, next);
  }
  function refresh() {
    if (!room) return;
    dispatch({ type: 'rows', rows: rowsNow(), me: room.me, offline: !channelUp() });
  }

  function connect() {
    room.ch = net().channel('raid:' + room.id);
    room.ch.on('presence', list => {
      if (!room) return;
      const members = {};
      list.forEach(p => { members[p.key] = { t: +p.t || 0, name: net().clip(p.name, 24) }; });
      const fresh = Object.keys(members).some(id => !room.members[id] && id !== room.me);
      room.members = members;
      if (fresh) publish();                      // người mới vào: gửi dòng của mình ngay, khỏi chờ nhịp 2 s
      onRows();
    });
    room.ch.on('row', (p, from) => {
      if (!room || !p || typeof p !== 'object') return;
      const seq = p.seq | 0, old = room.raw[from.id];
      if (old && seq <= old.seq) return;
      const r = parseRow(Object.assign({}, p, { key: from.id, name: from.name }));
      r.seq = seq;
      room.raw[from.id] = r;
      onRows();
    });
    room.ch.on('joined', () => { if (room) { room.ch.track({ t: room.row.t }); publish(); } });
    room.ch.track({ t: room.row.t });
    room.timers.push(setInterval(tick, 250));
    room.timers.push(setInterval(publish, ROW_EVERY_MS));
  }

  function effects(prev, L) {
    if (L.phase === 'closed') {
      if (prev.phase === 'closed') return;
      // Trận thua: nán lại để người chậm vẫn đọc được lượt cuối trong dòng của mình.
      if (room.fight && room.fight.cb.result && !room.fight.left) room.closing = Date.now();
      else end(L.reason);
      return;
    }
    if (L.phase === 'lobby') {
      const lead = room.row.lead;
      if (!lead && L.boss && cooldownLeft(L.boss) > 0) {
        dispatch({ type: 'close', reason: 'Bạn đã thắng ' + BOSSES[L.boss].name + ', còn ' + daysLeft(cooldownLeft(L.boss)) + ' ngày mới đánh lại được.' });
        return;
      }
      if (lead) leaderLobby(L);
      else memberLobby(L);
      renderLobby();
    }
    if (L.phase === 'countdown' && prev.phase !== 'countdown') { room.countdownAt = Date.now(); renderLobby(); }
    if (L.phase === 'battle' && prev.phase !== 'battle') startFight(L);
    if (L.phase === 'loot' && prev.phase !== 'loot') startLoot();
  }

  /* Chủ phòng ở phòng chờ: mọi người Confirm cho lần khởi động hiện tại → đếm ngược, chốt đội. */
  function leaderLobby(L) {
    const lead = room.row.lead;
    if (!lead.launch) return;
    const players = L.actors.filter(a => a.team === 1);
    const all = players.every(a => a.state === 'confirm' && (a.id === room.me || (room.rows[a.id] || {}).confirmFor === lead.launch));
    if (all) {
      lead.phase = 'countdown';
      lead.order = players.map(a => a.id);
      lead.party = players.map(a => ({ id: a.id, name: a.name, mons: a.id === room.me ? room.row.mons : (room.rows[a.id] || {}).mons.map(fighterOf) }));
      lead.seed = (Math.random() * 4294967296) >>> 0;
      publish();
      refresh();
    }
  }

  /* Thành viên: chủ phòng bấm Bắt đầu (launch mới) → mình Accept và đang ở ngoài bản đồ thì tự Confirm. */
  function memberLobby(L) {
    const row = room.row;
    if (L.launch && row.state === 'accept' && row.confirmFor !== L.launch && inWorld() && row.mons.length) {
      row.state = 'confirm'; row.confirmFor = L.launch; publish();
    } else if (!L.launch && row.state === 'confirm') {
      row.state = 'accept'; row.confirmFor = ''; publish();
    }
  }

  function tick() {
    if (!room) return;
    const now = Date.now(), L = room.lobby, lead = room.row.lead;
    if (L.phase === 'lobby') {
      if (lead && now - room.created > LOBBY_MS) { dispatch({ type: 'close', reason: 'Phòng hết hạn chờ.' }); return; }
      if (!lead && !L.leader && now - room.created > JOIN_WAIT_MS) { dispatch({ type: 'close', reason: 'Phòng không còn tồn tại.' }); return; }
      if (lead && lead.launch && now - room.launchAt > CONFIRM_MS) {
        const slow = L.actors.filter(a => a.team === 1 && a.state !== 'confirm').map(a => a.name);
        lead.launch = ''; publish(); refresh();
        S().toast((slow.join(', ') || 'Đồng đội') + ' chưa xác nhận — thử bắt đầu lại.');
      }
      updateClock();
    }
    if (L.phase === 'countdown') {
      if (lead && lead.phase === 'countdown' && now - room.countdownAt >= COUNTDOWN_MS) { lead.phase = 'battle'; publish(); refresh(); }
      updateClock();
    }
    if (room && room.fight) { noteRoster(); hostStep(); }
    if (room && room.loot) lootStep();
    if (room && room.closing && now - room.closing > LINGER_MS && !room.fight.scene) end(null);
  }

  /* ---------------------------------------------------------------- trận chung (lockstep) */

  function startFight(L) {
    const party = L.party;
    if (!party.length || party.length !== L.order.length) { dispatch({ type: 'close', reason: 'Thiếu dữ liệu đội, không vào trận được.' }); return; }
    let cb;
    try {
      cb = new P1.CoopBattle({ players: party, foes: trainerTeam(L.boss, L.seed), seed: L.seed });
    } catch (e) { console.error(e); dispatch({ type: 'close', reason: 'Không dựng được trận boss.' }); return; }
    const f = room.fight = {
      cb, order: L.order.slice(), names: {}, intro: cb.begin(), queue: [], waiters: [], lost: new Set(), absent: {},
      readyAt: {}, decisionN: -1, decisionAt: 0, offSince: 0, endAt: 0, left: false, scene: false,
    };
    party.forEach(p => { f.names[p.id] = p.name; });
    closeLobby();
    syncLog();
    if (inWorld()) goBattle();
    publish();
  }

  function goBattle() {
    const f = room.fight, b = BOSSES[room.lobby.boss];
    f.scene = true;
    P1.scene.go('battle', {
      kind: 'boss', coop: driver(f), foe: f.cb.foes, name: b.name, bg: b.bg, canLose: true, music: 'battle_gym',
      onEnd: out => { f.scene = false; afterScene(out); return P1.scene.go('world', { resume: true }); },
    });
  }

  // Mỗi dòng vắng khỏi presence quá LOST_MS thì mất quyền làm chủ phòng (dính, trở lại cũng không lấy lại).
  function noteRoster() {
    const f = room.fight, now = Date.now();
    f.order.forEach(id => {
      if (id === room.me) return;
      // Người tự nhường chủ phòng báo trong dòng của mình → mọi máy coi là mất ngay, không chờ đủ LOST_MS.
      if ((room.raw[id] || {}).quit) f.lost.add(id);
      if (room.members[id]) { f.absent[id] = 0; return; }
      if (!f.absent[id]) f.absent[id] = now;
      else if (now - f.absent[id] > LOST_MS) f.lost.add(id);
    });
    if (!channelUp() && f.order.length > 1) {
      if (!f.offSince) f.offSince = now;
      else if (now - f.offSince > SELF_LOST_MS && !f.lost.has(room.me)) { f.lost.add(room.me); room.row.quit = true; publish(); }
    } else f.offSince = 0;
  }
  function present(id) { return id === room.me || !!room.members[id]; }
  function channelUp() { return net().status === 'on' && room.ch && !room.ch.closed; }
  // Chủ phòng = người đầu tiên trong danh sách trận chưa bị coi là mất (vắng thoáng qua không làm đổi chủ phòng).
  function hostId() { const f = room.fight; return f.order.find(id => !f.lost.has(id)) || null; }

  /* Nhận mục nhật ký dài nhất trong các dòng (mọi nhật ký là tiền tố của nhau), áp phần mình chưa có. */
  function syncLog() {
    const f = room.fight;
    if (!f || f.left) return;
    let best = f.cb.log;
    // Cả dòng của người đã rời (room.raw): lượt cuối chủ phòng cũ kịp gửi vẫn được giữ khi đổi chủ phòng.
    f.order.forEach(id => { const r = room.raw[id]; if (r && r.log.length > best.length) best = r.log; });
    for (let i = 0; i < Math.min(best.length, f.cb.log.length); i++) {
      if (JSON.stringify(best[i]) !== JSON.stringify(f.cb.log[i])) { desync(); return; }
    }
    for (let i = f.cb.log.length; i < best.length && !f.cb.result; i++) {
      const r = f.cb.apply(best[i]);
      if (JSON.stringify(r.entry) !== JSON.stringify(best[i])) { desync(); return; }
      pushEvents(r.events);
    }
  }

  function pushEvents(events) {
    const f = room.fight;
    f.queue.push(events);
    if (f.cb.result && !f.endAt) fightOver();
    wake();
  }
  function wake() { const f = room && room.fight; if (f) f.waiters.splice(0).forEach(fn => fn()); }

  function desync() {
    const f = room.fight;
    if (!f || f.cb.result) return;
    f.cb.result = 'desync';
    f.endAt = Date.now();
    wake();
    dispatch({ type: 'result', win: false, reason: 'Trận bị lệch giữa các máy — kết thúc, không có thưởng.' });
  }

  /* Chủ phòng: chờ mọi người điều khiển ô đã chọn (vắng mặt thì khỏi chờ), hết giờ thì tự chọn thay. */
  function hostStep() {
    const f = room.fight;
    if (!f || f.cb.result || f.left || hostId() !== room.me) return;
    if (f.order.length > 1 && !channelUp()) return;
    const now = Date.now(), n = f.cb.log.length;
    if (f.decisionN !== n) { f.decisionN = n; f.decisionAt = now; }
    const ctrl = f.cb.controllers(), picks = {};
    const waiting = new Set();
    ctrl.forEach((id, slot) => {
      if (!id) return;
      const row = id === room.me ? room.row : room.rows[id];
      const pk = row && row.pick && row.pick.n === n ? row.pick.c[slot] : null;
      if (pk) picks[slot] = pk;
      else if (present(id)) waiting.add(id);          // "mất" chỉ là mất quyền chủ phòng, vẫn được chọn cho ô của mình
    });
    const start = Math.min(f.readyAt[n] || Infinity, f.decisionAt + ANIM_GRACE_MS);
    if (waiting.size && now < start + TURN_MS) return;
    const r = f.cb.apply(f.cb.decide(picks));
    publish();                                       // trước khi xử lý kết quả: lượt cuối phải tới được mọi người
    pushEvents(r.events);
  }

  function fightOver() {
    const f = room.fight;
    f.endAt = Date.now();
    const mine = [];
    f.cb.roster.forEach((x, k) => { if (x.owner === room.me) mine.push(k); });
    mine.forEach((k, j) => {
      const m = (P1.state.party || []).find(x => x.uid === room.picks[j]);
      if (!m) return;
      const fin = f.cb.finalOf(k);
      m.hp = fin.hp; m.status = fin.status;
      m.moves.forEach((s, i) => { if (fin.pp[i] != null) s.pp = Math.min(s.ppMax, fin.pp[i]); });
    });
    const win = f.cb.result === 'win';
    if (win) markWin(room.lobby.boss);
    P1.save();
    dispatch({ type: 'result', win, reason: win ? '' : 'Đội đã thua ' + BOSSES[room.lobby.boss].name + '.' });
  }

  function afterScene(out) {
    if (!room || !room.fight) return;
    room.row.done = true;
    publish();
    if (out && out.outcome === 'ran' && !room.fight.cb.result) leaveFight();
    if (room && room.loot) renderLoot();
  }

  function leaveFight() {
    const f = room.fight;
    f.left = true;
    wake();
    end('Bạn đã rời trận boss.');
  }

  /* Cầu nối cho cảnh trận (battle.js): hàng đợi sự kiện, việc của mình, gửi lựa chọn, trạng thái đồng đội. */
  // Giữ tham chiếu phòng riêng: sau khi rời phòng (room = null) cảnh trận vẫn đang diễn nốt và còn gọi vào đây.
  function driver(f) {
    const r = room, live = () => room === r && !f.left;
    return {
      battle: f.cb, me: r.me, intro: f.intro, names: f.names, turnMs: TURN_MS,
      take() { return f.queue.shift() || null; },
      over() { return !!f.cb.result || f.left; },
      wait() { return new Promise(res => { if (f.queue.length || f.cb.result || f.left) res(); else f.waiters.push(res); }); },
      request() { return f.queue.length || !live() ? null : f.cb.requestFor(r.me); },
      ready(n) {
        if (f.readyAt[n]) return f.readyAt[n];
        f.readyAt[n] = Date.now();
        return f.readyAt[n];
      },
      submit(slot, pick) {
        if (!live()) return;
        const n = f.cb.log.length;
        const cur = r.row.pick && r.row.pick.n === n ? r.row.pick.c : {};
        r.row.pick = { n, c: Object.assign({}, cur, { [slot]: pick }) };
        publish();
        hostStep();
      },
      // Ô của đồng đội đang chờ gì: 'choosing' | 'done' | 'auto' (vắng mặt, chủ phòng chọn thay).
      status() {
        const n = f.cb.log.length, out = {};
        f.cb.controllers().forEach((id, slot) => {
          if (!id) return;
          const row = id === r.me ? r.row : r.rows[id];
          const here = id === r.me || !!r.members[id];
          out[slot] = { id, name: f.names[id] || '?', state: !here ? 'auto' : row && row.pick && row.pick.n === n && row.pick.c[slot] ? 'done' : 'choosing' };
        });
        return out;
      },
      leave() { if (live()) leaveFight(); },
    };
  }

  /* ---------------------------------------------------------------- chia đồ */

  function startLoot() {
    const f = room.fight;
    room.loot = { items: lootFor(room.lobby.boss), openAt: 0, results: null, win: null, applied: false };
    room.row.votes = {};
    grantExp();
    if (!f.scene) renderLoot();
  }

  function grantExp() {
    const s = P1.state;
    s.trainerExp = (s.trainerExp | 0) + exp(BOSSES[room.lobby.boss]);
    P1.save();
  }

  function vote(lootId, v) {
    const lt = room && room.loot;
    if (!lt || lt.results || !lt.openAt || Date.now() < lt.openAt || Date.now() > lt.openAt + LOOT_MS) return;
    room.row.votes = Object.assign({}, room.row.votes, { [lootId]: v });
    publish();
    renderLoot();
    lootStep();
  }

  function votesOf(id) { return (id === room.me ? room.row.votes : (room.rows[id] || {}).votes) || {}; }

  function lootStep() {
    const lt = room.loot, f = room.fight, now = Date.now();
    if (!lt || lt.results) { if (lt && lt.results && now > lt.doneAt + LINGER_MS) end(null); return; }
    const ids = f.order;
    if (!lt.openAt) {
      const done = ids.filter(present).every(id => (id === room.me ? room.row : room.rows[id] || {}).done === true || (id === room.me && !f.scene));
      if (done || now > f.endAt + LOOT_WAIT_MS) { lt.openAt = now; if (lt.win) renderLoot(); }
      else { if (lt.win) updateLootClock(); return; }
    }
    const allIn = ids.filter(present).every(id => lt.items.every(it => ['need', 'greed', 'pass'].includes(votesOf(id)[it.id])));
    if (!(allIn && now >= lt.openAt) && now < lt.openAt + LOOT_MS + LOOT_SETTLE_MS) { if (lt.win) updateLootClock(); return; }
    lt.results = lt.items.map(it => {
      const votes = {};
      ids.forEach(id => { const v = present(id) ? votesOf(id)[it.id] : ''; votes[id] = ['need', 'greed', 'pass'].includes(v) ? v : 'pass'; });
      return { item: it, votes, win: lootWinner(room.lobby.seed, it.id, votes, ids) };
    });
    lt.doneAt = now;
    applyLoot(lt);
    renderLoot();
  }

  function applyLoot(lt) {
    const s = P1.state;
    const done = s.raidDone = s.raidDone || [];
    if (done.includes(room.id)) { lt.note = 'Phần thưởng phòng này đã nhận rồi.'; return; }
    done.push(room.id);
    if (done.length > 30) done.splice(0, done.length - 30);
    lt.got = [];
    lt.results.forEach(r => {
      if (!r.win || r.win.id !== room.me) return;
      const it = r.item;
      if (it.kind === 'money') { s.money = (s.money | 0) + it.amount; lt.got.push('₽' + it.amount); }
      if (it.kind === 'item') { s.bag = s.bag || {}; s.bag[it.key] = (s.bag[it.key] | 0) + it.qty; lt.got.push(itemName(it.key) + ' ×' + it.qty); }
      if (it.kind === 'egg') lt.got.push(hatch(it));
    });
    P1.save();
  }

  // Trứng nở ngay thành dạng gốc Lv5, IV ngẫu nhiên, shiny 1/64.
  function hatch(it) {
    const mon = P1.mon.create(it.dex, it.level, { shiny: Math.random() < 1 / SHINY_ODDS, ot: net().me.name, metAt: 'Trứng boss' });
    const where = net().giveMon(mon);
    if (P1.caught) P1.caught(it.dex);
    return P1.chat.monLabel(net().cardOf(mon)) + ' nở từ trứng' + (where === 'box' ? ' (gửi vào PC)' : ' (vào đội)');
  }

  function itemName(key) {
    const it = Object.values(P1.ITEMS || {}).find(x => x.battleId === key);
    return it ? it.name : key;
  }
  function itemImg(key) {
    const it = Object.values(P1.ITEMS || {}).find(x => x.battleId === key);
    return it && it.img;
  }

  /* ---------------------------------------------------------------- vào / rời */

  function end(msg) {
    if (!room) return;
    const r = room;
    room = null;
    r.timers.forEach(clearInterval);
    clearTimeout(r.sendTimer);
    if (r.ch) r.ch.leave();
    closeLobby(r);
    if (r.loot && r.loot.win && !r.loot.results) { r.loot.win.onlyHide = true; r.loot.win.close(); }
    if (r.fight) { r.fight.left = true; r.fight.waiters.splice(0).forEach(fn => fn()); }
    if (msg) S().toast(msg);
  }

  function canEnter(bossId) {
    if (!inWorld()) { S().toast('Chỉ đánh boss khi đang đi ngoài bản đồ.'); return false; }
    if (!(P1.state.party || []).some(m => m.hp > 0)) { S().toast('Cần ít nhất một Pokémon còn sức.'); return false; }
    const cd = bossId ? cooldownLeft(bossId) : 0;
    if (cd > 0) { S().toast('Đã thắng ' + BOSSES[bossId].name + '. Còn ' + daysLeft(cd) + ' ngày nữa mới đánh lại được.'); return false; }
    return true;
  }

  /* Lệnh kịch bản `raid <bossId>` (cuối lời thoại của NPC boss): hỏi đánh một mình hay lập phòng. */
  async function openLobby(bossId) {
    if (room) { renderLobby(true); return; }
    if (!bossId || !BOSSES[bossId]) { pickBoss(); return; }
    if (!canEnter(bossId)) return;
    const b = BOSSES[bossId], opts = ['Đánh một mình', 'Lập phòng (tối đa ' + maxFor(bossId) + ' người)', 'Thôi'];
    const q = b.title + ' ' + b.name + ': "Muốn thách đấu ta à?"';
    let pick;
    if (P1.dialog && P1.dialog.choose) pick = await P1.dialog.choose(q, opts);
    else pick = await new Promise(res => {
      let done = false;
      const p = S().popup({ name: 'raid-choice', title: b.name, w: 340, onClose: () => { if (!done) res(2); } });
      p.body.innerHTML = '<p class="p1s-note">' + esc(q) + '</p>';
      opts.forEach((label, k) => p.foot.appendChild(S().button(label, { primary: k === 1, onClick: () => { done = true; p.close(); res(k); } })));
    });
    if (pick === 0) soloFight(bossId);
    else if (pick === 1) createRoom(bossId);
  }

  /* Đánh một mình = trận huấn luyện viên thường với cùng đội boss; thắng thì nhận cả ba món và tính hồi 12 ngày. */
  function soloFight(bossId) {
    if (room || !canEnter(bossId)) return;
    const b = BOSSES[bossId];
    const foe = trainerTeam(bossId, (Math.random() * 4294967296) >>> 0);
    P1.scene.go('battle', {
      kind: 'trainer', gym: true, foe, name: b.name, bg: b.bg, money: b.money,
      onEnd: out => {
        if (out && out.outcome === 'win') {
          markWin(bossId);
          const s = P1.state;
          s.bag = s.bag || {};
          s.bag[b.item[0]] = (s.bag[b.item[0]] | 0) + b.item[1];
          s.trainerExp = (s.trainerExp | 0) + exp(b);
          const got = [itemName(b.item[0]) + ' ×' + b.item[1], hatch({ dex: b.egg, level: EGG_LEVEL })];
          P1.save();
          setTimeout(() => S().toast('Thắng ' + b.name + '! Nhận ₽' + b.money + ', ' + got.join(', ') + '.'), 400);
        }
        return P1.scene.go('world', { resume: true });
      },
    });
  }

  function createRoom(bossId) {
    if (room || !canEnter(bossId)) return;
    if (net().status === 'offline') { S().toast('Lập phòng cần mạng: chưa cấu hình máy chủ.'); return; }
    room = newRoom(newCode(), bossId);
    connect();
    refresh();
    renderLobby(true);
  }

  function join(raw) {
    const code = normCode(raw);
    if (!code) { S().toast('Mã phòng gồm 6 chữ và số, ví dụ K7Q2M9.'); return; }
    if (room) { if (room.id === code) renderLobby(true); else S().toast('Bạn đang ở một phòng boss khác.'); return; }
    if (!canEnter(null)) return;
    if (net().status === 'offline') { S().toast('Vào phòng cần mạng: chưa cấu hình máy chủ.'); return; }
    room = newRoom(code, null);
    connect();
    refresh();
    renderLobby(true);
  }

  /* Ô "Nhập mã phòng" (nút ở khung chat). */
  function promptCode() {
    const p = S().popup({ name: 'raid-code', title: 'Nhập mã phòng', w: 320 });
    p.body.innerHTML = '<p class="p1s-note">Dán mã (hoặc cả câu mời) người chơi khác gửi trong chat.</p>' +
      '<input class="rc-in" type="text" maxlength="80" placeholder="K7Q2M9" autocomplete="off" spellcheck="false"><div class="p1s-err"></div>';
    const inp = p.body.querySelector('input'), err = p.body.querySelector('.p1s-err');
    const go = () => {
      const found = findCodes(inp.value.toUpperCase());
      const code = normCode(inp.value) || (found[0] && found[0].code);
      if (!code) { err.textContent = 'Không thấy mã phòng hợp lệ (6 chữ và số).'; return; }
      p.close();
      join(code);
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    p.foot.append(S().button('Huỷ', { onClick: () => p.close() }), S().button('Tham gia', { primary: true, onClick: go }));
    inp.focus();
  }

  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, fallback);
    return Promise.resolve(fallback());
  }

  /* ---------------------------------------------------------------- giao diện: chọn boss, phòng chờ */

  function pickBoss() {
    const p = S().popup({ name: 'raid-pick', title: 'Boss Kanto', w: 400 });
    p.body.innerHTML = '<p class="p1s-note">Thủ lĩnh, Tứ Thiên Vương và Nhà vô địch. Đánh một mình hoặc lập phòng tối đa ' + MAX +
      ' người (mỗi người 1–' + MONS + ' Pokémon). Thắng xong chờ 12 ngày mới đánh lại.</p>';
    Object.keys(BOSSES).forEach(id => {
      const b = BOSSES[id], cd = cooldownLeft(id);
      const row = document.createElement('div');
      row.className = 'p1s-row';
      row.innerHTML = faceHtml(b) +
        '<div class="grow"><b>' + esc(b.name) + '</b> <span class="sub">' + esc(b.title) + '</span><div class="sub">' +
        b.team.length + ' Pokémon, Lv' + Math.max(...b.team.map(t => t[1])) + ' · ₽' + b.money + (cd ? ' · còn ' + daysLeft(cd) + ' ngày' : '') + '</div></div>';
      const btn = S().button('Thách đấu', { onClick: () => { p.close(); openLobby(id); } });
      btn.disabled = cd > 0;
      row.appendChild(btn);
      p.body.appendChild(row);
    });
  }

  // Mặt huấn luyện viên: ô hàng 2 (mặt), cột 1 của tấm npc/sprite<N> 256² (ô 64px). Chưa bóc thì hiện loài đặc trưng.
  function faceHtml(b, big) {
    const sig = b.team[b.team.length - 1][0];
    return '<span class="tr-face' + (big ? ' big' : '') + '"><img alt="" src="art/pro/npc/sprite' + b.sprite + '.png" ' +
      'onerror="this.onerror=null;this.parentNode.classList.add(\'fb\');this.src=\'art/pro/poke/icon/' + sig + '.png\'"></span>';
  }

  function closeLobby(r) {
    r = r || room;
    if (r && r.win) { const w = r.win; r.win = null; w.onlyHide = true; w.close(); }
  }

  const STATE_TEXT = { idle: 'Đang chọn', accept: 'Sẵn sàng', confirm: 'Đã xác nhận' };

  function monChip(m, opt) {
    opt = opt || {};
    const max = P1.mon.stats(m).hp, r = Math.max(0, Math.min(1, m.hp / max));
    return '<span class="lb-mon' + (opt.cls ? ' ' + opt.cls : '') + '"' + (opt.key != null ? ' data-uid="' + esc(opt.key) + '"' : '') +
      ' title="' + esc(P1.mon.name(m) + ' Lv' + m.level + ' · HP ' + m.hp + '/' + max) + '">' +
      '<img alt="" src="' + esc(iconUrl(m)) + '" onerror="this.style.visibility=\'hidden\'">' +
      '<i class="lv">' + m.level + '</i><i class="hp"><i style="width:' + Math.round(100 * r) + '%"' + (r <= 0.2 ? ' class="low"' : r <= 0.5 ? ' class="mid"' : '') + '></i></i>' +
      (opt.n ? '<i class="n">' + opt.n + '</i>' : '') + '</span>';
  }

  function renderLobby(show) {
    if (!room) return;
    const L = room.lobby;
    if (L.phase !== 'lobby' && L.phase !== 'countdown') return;
    if (!room.win && !show) return;
    if (!room.win) {
      const r = room;
      room.win = S().popup({
        name: 'raid-lobby', title: 'Phòng boss', w: 600, cls: 'p1s-lobby',
        onClose: () => {
          const w = r.win;
          r.win = null;
          if (w && !w.onlyHide && room === r && (r.lobby.phase === 'lobby' || r.lobby.phase === 'countdown')) end(r.row.lead ? 'Đã giải tán phòng.' : 'Đã rời phòng.');
        },
      });
    }
    const w = room.win, b = BOSSES[L.boss], isLead = !!room.row.lead;
    w.setTitle(b ? 'Phòng boss — ' + b.title + ' ' + b.name : 'Đang vào phòng…');
    const players = L.actors.filter(a => a.team === 1), npc = L.actors.find(a => a.team === 2);
    const n = Math.max(1, players.length);
    const slots = [];
    for (let i = 0; i < (b ? maxFor(L.boss) : MAX); i++) {
      const a = players[i];
      if (!a) { slots.push('<div class="lb-actor empty"><span class="lb-name">Chỗ trống</span><span class="lb-sub">Gửi mã phòng qua chat</span></div>'); continue; }
      slots.push('<div class="lb-actor ' + a.state + (a.id === room.me ? ' me' : '') + '" data-actor="' + esc(a.id) + '">' +
        '<div class="lb-top"><span class="lb-name">' + (a.kind === 'leader' ? '<i class="crown" title="Chủ phòng">♛</i>' : '') + esc(a.name) + '</span>' +
        '<span class="lb-state">' + STATE_TEXT[a.state] + '</span></div>' +
        '<div class="lb-mons">' + a.mons.map((m, j) => monChip(m, { n: String(j + 1), cls: j === 0 ? 'lead' : '' })).join('') +
        '<span class="lb-count">' + a.count + '/' + MONS + '</span></div></div>');
    }
    let foe = '';
    if (b) {
      const team = trainerTeam(L.boss, 0);
      foe = '<div class="lb-actor npc"><div class="lb-top"><span class="lb-name">' + esc(b.name) + '</span><span class="lb-state">NPC</span></div>' +
        '<div class="lb-boss">' + faceHtml(b, true) + '</div>' +
        '<div class="lb-mons">' + team.map((m, j) => '<span class="lb-mon' + (j < n ? ' lead' : '') + '" title="' + esc(P1.mon.name(m) + ' Lv' + m.level) + '">' +
          '<img alt="" src="' + esc(iconUrl(m)) + '"><i class="lv">' + m.level + '</i></span>').join('') + '</div>' +
        '<div class="lb-sub">' + team.length + ' Pokémon · ' + n + ' con ra sân · ' + ['đánh đơn', 'đánh đôi', 'đánh ba'][n - 1] + '</div></div>';
    }
    const locked = room.row.state === 'confirm' || L.phase === 'countdown';
    const party = (P1.state.party || []).map(m => {
      const k = room.picks.indexOf(m.uid);
      return monChip(m, { key: m.uid, cls: (k >= 0 ? 'on' : '') + (m.hp <= 0 ? ' off' : '') + (locked ? ' locked' : ''), n: k >= 0 ? String(k + 1) : '' });
    }).join('');
    const isReady = players.length > 0 && players.every(a => a.id === room.me || a.state !== 'idle') && room.row.mons.length > 0;
    const html =
      '<div class="lb-code"><span class="lb-codel">Mã phòng</span><b class="rid">' + esc(room.id) + '</b>' +
      '<button type="button" class="lb-copy">Sao chép mã mời</button><span class="lb-copied"' + (room.copied ? '' : ' hidden') + '>' +
      esc(room.copied || '') + '</span></div>' +
      '<div class="lb-info"><span class="clock"></span><span>' + (b ? maxFor(L.boss) : MAX) + ' người · 1–' + MONS + ' Pokémon/người · ' + (TURN_MS / 1000) + ' s/lượt</span></div>' +
      '<div class="lb-main"><div class="lb-teams"><div class="lb-team"><div class="lb-h">Đội 1</div>' + slots.join('') + '</div>' +
      '<div class="lb-vs">VS</div><div class="lb-team foe"><div class="lb-h">Đội 2</div>' + foe + '</div></div>' +
      '<div class="lb-pick"><div class="lb-h">Pokémon mang vào <span>bấm để chọn · số 1 ra sân trước</span></div><div class="lb-party">' + party + '</div></div></div>';
    // Dòng của mọi người tới mỗi 2 s: chỉ dựng lại cửa sổ khi nội dung đổi (không thì mất trạng thái rê chuột / bấm dở).
    const sig = html + '|' + L.phase + '|' + isLead + '|' + isReady + '|' + (isLead && room.row.lead.launch) + '|' + room.row.state;
    if (sig === room.lobbySig && w.body.firstChild) { updateClock(); return; }
    room.lobbySig = sig;
    w.body.innerHTML = html;
    w.body.querySelectorAll('.lb-party .lb-mon').forEach(el => el.addEventListener('click', () => togglePick(el.dataset.uid)));
    const copy = w.body.querySelector('.lb-copy');
    S().sprite(copy, 'Battle_attack_normal');
    copy.addEventListener('click', () => {
      if (!L.boss) return;
      const r = room;
      copyText(codeText(L.boss, r.id)).then(ok => {
        r.copied = ok ? 'Đã chép — dán vào chat để mời' : 'Không chép được, hãy gõ mã ' + r.id;
        const note = r.win && r.win.body.querySelector('.lb-copied');
        if (note) { note.hidden = false; note.textContent = r.copied; }
      });
    });
    w.foot.innerHTML = '';
    if (L.phase === 'countdown') {
      w.foot.innerHTML = '<div class="p1s-count">Vào trận…</div>';
    } else if (isLead) {
      const start = S().button(room.row.lead.launch ? 'Chờ xác nhận…' : 'Bắt đầu', { primary: true, onClick: hostStart });
      start.disabled = !isReady || !!room.row.lead.launch;
      w.foot.append(S().button('Giải tán', { onClick: () => w.close() }), start);
    } else {
      const me = room.row;
      w.foot.append(S().button('Rời phòng', { onClick: () => w.close() }),
        S().button(me.state === 'idle' ? 'Sẵn sàng' : 'Huỷ sẵn sàng', { primary: me.state === 'idle', onClick: toggleReady }));
    }
    updateClock();
  }

  function togglePick(uid) {
    if (!room || room.row.state === 'confirm' || room.lobby.phase !== 'lobby') return;
    const m = P1.state.party.find(x => x.uid === uid);
    if (!m || m.hp <= 0) return;
    const k = room.picks.indexOf(uid);
    if (k >= 0) room.picks.splice(k, 1);
    else if (room.picks.length < MONS) room.picks.push(uid);
    else { S().toast('Mỗi người mang tối đa ' + MONS + ' Pokémon.'); return; }
    room.row.mons = room.picks.map(u => fighterOf(P1.state.party.find(x => x.uid === u)));
    if (!room.row.mons.length && room.row.state === 'accept' && !room.row.lead) room.row.state = 'idle';
    publish();
    refresh();
  }

  function toggleReady() {
    if (!room || room.lobby.phase !== 'lobby') return;
    const row = room.row;
    if (row.state === 'idle') {
      if (!row.mons.length) { S().toast('Chọn ít nhất một Pokémon.'); return; }
      row.state = 'accept';
    } else { row.state = 'idle'; row.confirmFor = ''; }
    publish();
    refresh();
  }

  function hostStart() {
    if (!room || !room.row.lead || room.lobby.phase !== 'lobby' || room.row.lead.launch) return;
    if (!inWorld()) { S().toast('Chỉ bắt đầu khi đang ở ngoài bản đồ.'); return; }
    if (!room.row.mons.length) { S().toast('Chọn ít nhất một Pokémon.'); return; }
    room.row.lead.launch = Math.random().toString(36).slice(2, 10);
    room.row.state = 'confirm'; room.row.confirmFor = room.row.lead.launch;
    room.launchAt = Date.now();
    publish();
    refresh();
  }

  function updateClock() {
    const c = room && room.win && room.win.body.querySelector('.clock');
    if (!c) return;
    const L = room.lobby, now = Date.now();
    c.textContent = L.phase === 'countdown' ? 'vào trận sau ' + Math.max(0, Math.ceil((room.countdownAt + COUNTDOWN_MS - now) / 1000)) + ' s'
      : !L.leader ? 'đang tìm chủ phòng…' : 'phòng đóng sau ' + mmss(room.created + LOBBY_MS - now);
    const cnt = room.win.foot.querySelector('.p1s-count');
    if (cnt) cnt.textContent = 'Vào trận sau ' + Math.max(0, Math.ceil((room.countdownAt + COUNTDOWN_MS - now) / 1000)) + '…';
  }

  /* ---------------------------------------------------------------- giao diện: chia đồ (LootWindow) */

  const VOTE_TEXT = { need: 'Cần', greed: 'Tham', pass: 'Bỏ' };

  function lootLabel(it) {
    if (it.kind === 'money') return '₽' + it.amount.toLocaleString('vi-VN');
    if (it.kind === 'item') return itemName(it.key) + ' ×' + it.qty;
    return 'Trứng ' + P1.chat.speciesName(it.dex) + ' (nở Lv' + it.level + ')';
  }
  function lootIcon(it) {
    if (it.kind === 'egg') return 'art/pro/poke/icon/' + it.dex + '.png';
    if (it.kind === 'item') return itemImg(it.key) || '';
    return itemImg('nugget') || '';
  }

  function renderLoot() {
    const lt = room && room.loot;
    if (!lt) return;
    if (!lt.win) {
      const r = room;
      lt.win = S().popup({
        name: 'raid-loot', title: 'Chiến lợi phẩm — ' + BOSSES[room.lobby.boss].name, w: 460, cls: 'p1s-loot',
        onClose: () => { if (r.loot) r.loot.win = null; if (!r.loot || !r.loot.results) { /* đóng sớm = bỏ phiếu Pass mặc định */ } },
      });
    }
    const w = lt.win, mine = room.row.votes, f = room.fight;
    const res = lt.results;
    w.body.innerHTML = '<div class="lt-clock"><span class="lt-bar"><i></i></span><b></b></div>' + lt.items.map((it, k) => {
      const r = res && res[k];
      let right;
      if (r) {
        const winner = r.win ? (f.names[r.win.id] || '?') : null;
        right = '<div class="lt-res' + (r.win && r.win.id === room.me ? ' me' : '') + '">' +
          (r.win ? '<b>' + esc(winner) + '</b> nhận (' + VOTE_TEXT[r.win.tier] + ' ' + r.win.roll + ')' : 'Không ai nhận') + '</div>';
      } else {
        right = '<div class="lt-votes" data-loot="' + it.id + '">' + ['need', 'greed', 'pass'].map(v =>
          '<button type="button" class="lt-v ' + v + (mine[it.id] === v ? ' on' : '') + '" data-v="' + v + '">' + VOTE_TEXT[v] + '</button>').join('') + '</div>';
      }
      const others = f.order.filter(id => id !== room.me).map(id => {
        const v = r ? r.votes[id] : votesOf(id)[it.id];
        return '<span class="lt-who">' + esc(f.names[id] || '?') + ': ' + (v ? VOTE_TEXT[v] + (r && v !== 'pass' ? ' ' + lootRoll(room.lobby.seed, it.id, id) : '') : '…') + '</span>';
      }).join('');
      const icon = lootIcon(it);
      return '<div class="lt-row"><span class="lt-ic">' + (icon ? '<img alt="" src="' + esc(icon) + '">' : '') + '</span>' +
        '<div class="grow"><b>' + esc(lootLabel(it)) + '</b><div class="lt-others">' + others + '</div></div>' + right + '</div>';
    }).join('') + (res ? '<p class="lt-got">' + esc(lt.note || (lt.got && lt.got.length ? 'Bạn nhận: ' + lt.got.join(', ') + '.' : 'Lần này bạn không nhận món nào.')) + '</p>' :
      '<p class="p1s-note">Cần = cần thật (ưu tiên trước), Tham = lấy nếu không ai cần, Bỏ = nhường. Điểm 1–100 cao nhất thắng.</p>');
    w.body.querySelectorAll('.lt-votes').forEach(el => el.querySelectorAll('.lt-v').forEach(btn => {
      S().sprite(btn, 'Battle_attack_normal');
      btn.addEventListener('click', () => vote(el.dataset.loot, btn.dataset.v));
    }));
    w.foot.innerHTML = '';
    if (res) w.foot.append(S().button('Đóng', { primary: true, onClick: () => w.close() }));
    updateLootClock();
  }

  function updateLootClock() {
    const lt = room && room.loot;
    if (!lt || !lt.win) return;
    const now = Date.now(), c = lt.win.body.querySelector('.lt-clock');
    if (!c) return;
    const open = !!lt.openAt && now >= lt.openAt, left = lt.openAt + LOOT_MS - now;
    c.querySelector('b').textContent = lt.results ? 'Đã chia xong' : !open ? 'Chờ mọi người xem xong trận…' : left > 0 ? 'Còn ' + Math.ceil(left / 1000) + ' s' : 'Đang chốt…';
    c.querySelector('i').style.width = (lt.results ? 0 : open ? Math.max(0, 100 * left / LOOT_MS) : 100).toFixed(1) + '%';
    lt.win.body.querySelectorAll('.lt-v').forEach(b => { b.disabled = !open || left <= 0; });
  }

  P1.raid = {
    BOSSES, MAX, MONS, maxFor, openLobby, soloFight, createRoom, join, promptCode, findCodes, codeText, normCode, cooldownLeft,
    reduce, trainerTeam, lootFor, lootRoll, lootWinner, parseFighter, fighterOf,
    leave: () => { if (room) end('Đã rời phòng.'); },
    // Cho bộ kiểm và gỡ lỗi: ảnh chụp trạng thái phòng.
    get room() {
      if (!room) return null;
      const f = room.fight, lt = room.loot;
      return {
        id: room.id, phase: room.lobby.phase, isLeader: !!room.row.lead, boss: room.lobby.boss, actors: room.lobby.actors.map(a => ({ id: a.id, kind: a.kind, state: a.state, count: a.count, active: a.active })),
        order: room.lobby.order, seed: room.lobby.seed, host: f ? hostId() : null, log: f ? f.cb.log.length : 0, result: f ? f.cb.result : null,
        members: Object.keys(room.members), lost: f ? [...f.lost] : [], chan: channelUp(),
        picked: room.row.pick ? room.row.pick.n : -1,
        hp: f ? f.cb.sim.p1.pokemon.concat(f.cb.sim.p2.pokemon).map(p => p.name + '=' + p.hp).sort().join(',') : '',
        loot: lt && lt.results ? lt.results.map(r => ({ id: r.item.id, win: r.win && r.win.id, tier: r.win && r.win.tier, roll: r.win && r.win.roll })) : null,
        lootOpen: !!(lt && lt.openAt && Date.now() >= lt.openAt),
      };
    },
  };
})(window.P1 = window.P1 || {});
