// Bạn Bè, Thư, Đội Đua, Cặp Đôi, BXH bằng bot, một người chơi (nhánh Xã hội, đợt 2).
// Bản gốc chạy trên máy chủ (ui/social/#normalsocial, #racingteam, #mentor; ranklist): ở đây người khác là bot sinh theo hash của tên,
// mọi trạng thái nằm trong TD.save.d.social và làm mới theo ngày (như save.quests.day). Chuỗi VN lấy từ Localization_VN_Base:
// Bạn Bè 2be5a27c, Thư 3b2e7f9f, Đội Đua 553b5869, Cặp Đôi 0ab76dcc, BXH 1558ce68, Xóa bạn 0b0043c7, Tạo Đội 2f0e26f9,
// Xin vào d026a2cb, Đội trưởng b585a53d, Thành viên 982af985, Nhận thưởng 6e5606ed, Rời đội 5db00669, Đua Đạo Cụ-Đôi 408fa2b0.
// Chuỗi không có bản VN (trạng thái hoạt động, tên tác vụ tuần…) là chữ chọn.
(function (TD) {
  'use strict';
  const S = { now: () => Date.now() };   // now: bài kiểm đổi đồng hồ để thử qua ngày
  const A = 'art/social/', LA = 'art/lobby/';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = () => document.getElementById('ui');
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const sfx = (e) => TD.audio && TD.audio.play(e);
  const MAX_FRIENDS = 20;   // src: 9a1e8a1b "Bạn bè đã đạt giới hạn rồi"; số 20 là chọn
  const MAX_MAIL = 40;      // chọn
  const CLUB_COST = 1000;   // chọn: giá Tạo Đội

  // ---------- thời gian và hash ----------
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const monthKey = (t) => dayKey(t).slice(0, 7);
  const dayNum = (t) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 864e5);
  const weekKey = (t) => String(Math.floor((dayNum(t) + 3) / 7));   // tuần bắt đầu thứ Hai (1/1/1970 là thứ Năm)
  const sHash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619); return x >>> 0; };
  // hash hai số nguyên -> [0, 1): bot cùng tên luôn cùng thông số giữa các lần mở game
  function h(a, b) {
    let x = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D) >>> 0; x ^= x >>> 12;
    return (x >>> 0) / 4294967296;
  }

  // ---------- bot ----------
  // Tên mở rộng ngoài TD.BOT_NAMES (tên trong trận) để đủ 40 người cho BXH và danh sách đội.
  const EXTRA = ['Lốc Xoáy', 'Điện Quang', 'Hắc Long', 'Bạch Hổ', 'Chim Sẻ', 'Cáo Lửa', 'Gấu Trúc', 'Sư Tử', 'Vua Tốc Độ', 'Thần Gió', 'Mây Đen',
    'Sóng Thần', 'Địa Chấn', 'Lưu Tinh', 'Ngựa Hoang', 'Cá Voi', 'Diều Hâu', 'Rắn Độc', 'Bướm Đêm', 'Sao Mai', 'Ánh Dương', 'Trăng Khuyết',
    'Mãnh Hổ', 'Tuyết Lang'];
  let POOL = null;
  function bots() {
    if (POOL) return POOL;
    const names = TD.BOT_NAMES.concat(EXTRA.filter((n) => TD.BOT_NAMES.indexOf(n) < 0)).slice(0, 40), cars = Object.keys(TD.CARS);
    const top = TD.RANK ? TD.RANK.tiers[TD.RANK.tiers.length - 1].start : 3000;
    POOL = names.map((name, i) => ({
      id: 'b' + i, i, name, av: h(i, 1) < 0.5 ? 'nam' : 'nu',
      lv: 3 + Math.floor(Math.pow(h(i, 2), 1.3) * 62),               // chọn: cấp 3–65, nhiều người cấp thấp
      pts: Math.floor(Math.pow(h(i, 3), 1.5) * top * 1.15),           // chọn: điểm bậc phân bố lệch về bậc thấp
      car: cars[Math.floor(h(i, 4) * cars.length)], skill: h(i, 5),
    }));
    return POOL;
  }
  const botBy = (id) => bots().find((b) => b.id === id) || null;
  const botByName = (n) => bots().find((b) => b.name === n) || null;
  // Thời gian đường của bot: tốc độ trung bình 42–56 m/s theo tay nghề, lệch nhẹ theo từng đường (chọn).
  function botTime(b, trackId) {
    const T = TD.TRACKS[trackId];
    return T.laps * T.length / (42 + 14 * b.skill + (h(b.i, sHash(trackId)) - 0.5) * 3);
  }
  // Hoạt động đổi theo khung 30 phút: nửa số bot đang trực tuyến.
  const online = (b) => h(b.i, Math.floor(S.now() / 1800000)) < 0.5;
  const seen = (b) => { const m = 5 + Math.floor(h(b.i, Math.floor(S.now() / 1800000) + 77) * 175); return m < 60 ? m + ' phút trước' : Math.floor(m / 60) + ' giờ trước'; };
  const me = () => { const d = TD.save.d; return { id: 'me', name: d.name, av: d.driver === 'nu' ? 'nu' : 'nam', lv: TD.LEVEL.of(d.xp).lv, pts: d.rank.pts, me: true }; };

  // ---------- đội đua bot ----------
  // xp0 + rate·ngày: đội bot lớn dần theo ngày (chọn); req = cấp tối thiểu để xin vào.
  const CLUBS = [
    { id: 'c0', name: 'Phong Hỏa Đoàn', req: 1, xp0: 1200, rate: 40 }, { id: 'c1', name: 'Bóng Đêm Racing', req: 5, xp0: 4200, rate: 70 },
    { id: 'c2', name: 'Thiên Long Hội', req: 10, xp0: 9000, rate: 110 }, { id: 'c3', name: 'Gió Mới', req: 1, xp0: 600, rate: 25 },
    { id: 'c4', name: 'Kỳ Lân Tốc Độ', req: 20, xp0: 16000, rate: 150 },
  ];
  const EPOCH = 20736;   // ngày 2026-10-10: đội bot bắt đầu lớn dần từ ngày làm game
  const CLUB_MAX_LV = 30, CLUB_MEMBERS = 12;
  const clubNeed = (lv) => 400 + 200 * (lv - 1);   // chọn
  function lvOf(xp, need, cap) { let lv = 1; while (lv < cap && xp >= need(lv)) { xp -= need(lv); lv++; } return { lv, into: lv >= cap ? 0 : xp, need: need(lv) }; }
  const clubLv = (xp) => lvOf(xp, clubNeed, CLUB_MAX_LV);
  // Việc tuần (chọn): số lượng, thưởng xu, điểm cống hiến (đổi ở cửa hàng đội), XP đội.
  const TASKS = [
    { id: 'races', name: 'Hoàn thành {n} trận đua', need: 8, coins: 200, cp: 30, xp: 100 },
    { id: 'wins', name: 'Về nhất {n} lần', need: 2, coins: 300, cp: 40, xp: 150 },
    { id: 'top3', name: 'Vào top 3 {n} lần', need: 5, coins: 250, cp: 30, xp: 120 },
  ];
  const SHOP = [{ id: 'bag1', name: 'Túi xu nhỏ', cost: 30, coins: 300 }, { id: 'bag2', name: 'Túi xu lớn', cost: 80, coins: 900 }];
  const clubXpFor = (place, dnf) => (dnf ? 5 : 20 + ([0, 20, 14, 10, 6, 4, 2][place] || 0));   // chọn
  const clubDef = (c) => (c.id === 'mine' ? { id: 'mine', name: c.mine || 'Đội của tôi', req: 1, xp0: 0, rate: 0 } : CLUBS.find((x) => x.id === c.id) || null);
  function clubTotalXp(c) { const k = clubDef(c); return k ? k.xp0 + k.rate * Math.max(0, dayNum(S.now()) - EPOCH) + c.xp : 0; }
  // Thành viên: 12 bot cố định theo mã đội; cống hiến tuần của bot đổi theo tuần.
  function clubMembers(c) {
    const k = clubDef(c), seed = sHash(k.name), wk = dayNum(S.now()) / 7 | 0;
    const list = bots().slice().sort((a, b) => h(a.i, seed) - h(b.i, seed)).slice(0, CLUB_MEMBERS - 1)
      .map((b, n) => ({ bot: b, c: Math.floor(120 + h(b.i, seed + wk) * 880), lead: n === 0 && c.id !== 'mine' }));
    const M = me();
    list.push({ bot: M, c: c.w.c, lead: c.id === 'mine' });
    return list.sort((a, b) => b.c - a.c);
  }

  // ---------- bản lưu ----------
  const def = () => ({ day: '', last: '', streak: 0, welcome: 0, season: '', friends: [], sent: {}, recent: [], mail: [], mseq: 0,
    club: { id: '', mine: '', xp: 0, cp: 0, w: { k: '', races: 0, wins: 0, top3: 0, c: 0, done: {} } },
    couple: { partner: '', xp: {}, day: '' } });
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  TD.save.norms.push((o) => {
    const s = o.social && typeof o.social === 'object' ? o.social : {}, D = def(), c = s.club && typeof s.club === 'object' ? s.club : {};
    const w = c.w && typeof c.w === 'object' ? c.w : {}, cp = s.couple && typeof s.couple === 'object' ? s.couple : {};
    const ids = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && /^b\d+$/.test(x)) : []);
    const out = D;
    out.day = str(s.day, 10); out.last = str(s.last, 10); out.streak = num(s.streak, 0, 9999); out.welcome = s.welcome ? 1 : 0; out.season = str(s.season, 7);
    out.friends = [...new Set(ids(s.friends))].slice(0, MAX_FRIENDS);
    out.sent = {}; if (s.sent && typeof s.sent === 'object') for (const k of Object.keys(s.sent)) if (/^b\d+$/.test(k)) out.sent[k] = str(s.sent[k], 10);
    out.recent = [...new Set(ids(s.recent))].slice(0, 8);
    out.mseq = num(s.mseq, 0, 1e9);
    out.mail = (Array.isArray(s.mail) ? s.mail : []).filter((m) => m && typeof m === 'object').slice(0, MAX_MAIL).map((m) => ({
      id: num(m.id, 0, 1e9), kind: str(m.kind, 12) || 'sys', title: str(m.title, 60), body: str(m.body, 300), coins: num(m.coins, 0, 1e6),
      day: str(m.day, 10), read: m.read ? 1 : 0, got: m.got ? 1 : 0 }));
    out.club = { id: c.id === 'mine' || CLUBS.some((x) => x.id === c.id) ? c.id : '', mine: str(c.mine, 16), xp: num(c.xp, 0, 1e9), cp: num(c.cp, 0, 1e6),
      w: { k: str(w.k, 8), races: num(w.races, 0, 9999), wins: num(w.wins, 0, 9999), top3: num(w.top3, 0, 9999), c: num(w.c, 0, 1e6),
        done: Object.fromEntries(TASKS.filter((t) => w.done && w.done[t.id]).map((t) => [t.id, 1])) } };
    if (out.club.id === 'mine' && !out.club.mine) out.club.id = '';
    out.couple = { partner: /^b\d+$/.test(cp.partner) ? cp.partner : '', xp: {}, day: str(cp.day, 10) };
    if (cp.xp && typeof cp.xp === 'object') for (const k of Object.keys(cp.xp)) if (/^b\d+$/.test(k)) out.couple.xp[k] = num(cp.xp[k], 0, 1e9);
    o.social = out;
  });
  const soc = () => { const d = TD.save.d; if (!d.social) TD.save.norms.forEach((f) => f(d)); return d.social; };

  // ---------- thư ----------
  function addMail(s, kind, title, body, coins) {
    s.mail.unshift({ id: ++s.mseq, kind, title, body, coins: coins | 0, day: dayKey(S.now()), read: 0, got: 0 });
    // Quá giới hạn thì bỏ thư đã nhận cũ nhất trước, rồi mới tới thư cũ nhất.
    while (s.mail.length > MAX_MAIL) {
      let i = -1;
      for (let j = s.mail.length - 1; j >= 0; j--) if (s.mail[j].got || !s.mail[j].coins) { i = j; break; }
      s.mail.splice(i < 0 ? s.mail.length - 1 : i, 1);
    }
  }
  const unread = (s) => s.mail.filter((m) => !m.read || (m.coins && !m.got)).length;

  // Làm mới theo ngày: thư chào, thưởng đăng nhập (chuỗi ngày), quà bạn bè, thưởng mùa giải theo tháng, đặt lại quà đã tặng và việc tuần.
  S.refresh = function () {
    const s = soc(), now = S.now(), today = dayKey(now);
    let dirty = false;
    if (!s.welcome) { s.welcome = 1; dirty = true; addMail(s, 'sys', 'Chào mừng đến Tốc Độ', 'Chúc bạn đua vui! Hộp thư sẽ nhận thưởng đăng nhập, quà bạn bè và thưởng mùa giải.', 500); }
    if (s.day !== today) {
      s.day = today;
      dirty = true;
      const yday = dayKey(now - 864e5);
      s.streak = s.last === yday ? Math.min(s.streak + 1, 7) : 1; s.last = today;
      addMail(s, 'daily', 'Thưởng đăng nhập ngày ' + s.streak, 'Đăng nhập liên tục ' + s.streak + ' ngày.', 100 + 50 * (s.streak - 1));
      // Bạn tặng lại xăng nếu hôm qua mình đã tặng; còn lại mỗi ngày tối đa 3 bạn tự tặng (chọn).
      let n = 0;
      s.friends.forEach((id) => {
        const b = botBy(id);
        if (!b) return;
        if (s.sent[id] === yday) addMail(s, 'gift', b.name + ' tặng lại xăng', 'Cảm ơn quà hôm qua của bạn!', 30);
        else if (n < 3 && h(b.i, dayNum(now)) < 0.5) { n++; addMail(s, 'gift', b.name + ' tặng xăng', 'Quà bạn bè hằng ngày.', 20); }
      });
      s.sent = {};
      const mk = monthKey(now);
      if (s.season && s.season !== mk && TD.save.d.rank.pts > 0) {
        const r = TD.RANK.of(TD.save.d.rank.pts);
        addMail(s, 'season', 'Thưởng mùa giải ' + s.season, 'Bậc cuối mùa: ' + r.name + '.', 200 + 100 * r.tier);
      }
      s.season = mk;
    }
    const wk = weekKey(now), c = s.club;
    if (c.w.k !== wk) { c.w = { k: wk, races: 0, wins: 0, top3: 0, c: 0, done: {} }; dirty = true; }
    if (dirty) TD.save.save();
    return s;
  };

  function claimMail(id) {
    const s = soc(), m = s.mail.find((x) => x.id === id);
    if (!m || m.got || !m.coins) return 0;
    m.got = 1; m.read = 1; TD.save.d.coins += m.coins; TD.save.save();
    return m.coins;
  }

  // ---------- trận: nhận diện đối thủ, XP đội, điểm tình ----------
  const loveNeed = (lv) => 100 * lv;   // chọn
  const loveLv = (xp) => lvOf(xp, loveNeed, 20);
  const perk = (lv) => Math.min(10, lv) / 100;   // thưởng xu +1%/cấp, tối đa 10% (chọn)

  function settleRace(F, ctx) {
    const s = S.refresh(), d = TD.save.d, c = s.club, R = ctx.R, place = F.place, dnf = F.dnf;
    // Đối thủ vừa đua: bot trong danh sách mới gần nhất lên đầu, để thêm bạn ở màn Bạn Bè.
    const ids = R.karts.filter((k) => k !== ctx.me).map((k) => botByName(k.name)).filter(Boolean).map((b) => b.id);
    s.recent = [...new Set(ids.concat(s.recent))].slice(0, 8);
    let html = '', bonus = 0;
    if (c.id) {
      const lvA = clubLv(clubTotalXp(c)).lv, gain = clubXpFor(place, dnf);
      c.xp += gain;
      c.w.races++; if (!dnf && place === 1) c.w.wins++; if (!dnf && place <= 3) c.w.top3++;
      c.w.c += gain;
      const lvB = clubLv(clubTotalXp(c)).lv, add = Math.round(F.reward * perk(lvB));
      bonus += add;
      html += `<div class="fin-card sc-fin"><h4>${esc(clubDef(c).name)}</h4><div class="fin-gain">+${gain} XP</div><small>Đội Đua cấp ${lvB}${lvB > lvA ? ' · Lên cấp!' : ''}${add ? ' · +' + add + ' xu' : ''}</small></div>`;
    }
    const cp = s.couple;
    if (R.mode.id === 'couple' && cp.partner) {
      const b = botBy(cp.partner), lvA = loveLv(cp.xp[cp.partner] || 0).lv, today = dayKey(S.now());
      const gain = dnf ? 2 : 10 + (F.team && F.team.win === ctx.me.team ? 15 : 0) + (cp.day !== today ? 20 : 0);   // chọn: lần đầu trong ngày thưởng thêm 20
      cp.day = today;
      cp.xp[cp.partner] = (cp.xp[cp.partner] || 0) + gain;
      const lvB = loveLv(cp.xp[cp.partner]).lv, add = Math.round(F.reward * perk(lvB));
      bonus += add;
      html += `<div class="fin-card sc-fin love"><h4>Cặp Đôi · ${esc(b.name)}</h4><div class="fin-gain">+${gain} ♥</div><small>Cấp tình ${lvB}${lvB > lvA ? ' · Lên cấp!' : ''}${add ? ' · +' + add + ' xu' : ''}</small></div>`;
    }
    if (bonus) { d.coins += bonus; F.reward += bonus; }
    if (html) F.cards.push(html);
    TD.save.save();
  }

  // Cặp Đôi: tô bạn đồng đội (cùng đội với mình) thành người yêu đã chọn: đổi tên, tay đua, xe, dựng lại hình.
  function seatPartner(ctx) {
    const s = soc(), b = s.couple.partner && botBy(s.couple.partner);
    if (!b || ctx.R.mode.id !== 'couple') return;
    const R = ctx.R, k = R.karts.find((x) => x !== ctx.me && x.team === ctx.me.team);
    if (!k) return;
    const spare = TD.BOT_NAMES.concat(EXTRA).filter((n) => n !== b.name && !R.karts.some((x) => x.name === n));
    R.karts.forEach((x) => { if (x !== k && x.name === b.name) x.name = spare.shift() || x.name + ' 2'; });
    k.name = b.name; k.carId = b.car; k.driverId = TD.DRIVERS[b.av] ? b.av : k.driverId; k.p = TD.Kart.carParams(b.car);
    const M = ctx.M, i = R.karts.indexOf(k), old = M.views[i], V = TD.kartView;
    if (!old) return;
    ctx.root.remove(old.root);
    const at = V.list.indexOf(old); if (at >= 0) V.list.splice(at, 1);
    M.views[i] = V.create(ctx.root, k);
  }
  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push({ start: seatPartner, settle: settleRace });

  // Chế độ Cặp Đôi: mình và người yêu một đội, hai đội bot còn lại (3 đội × 2). src: 408fa2b0 "Đua Đạo Cụ-Đôi" / 邂逅道具赛.
  TD.MODES.couple = { id: 'couple', match: true, name: 'Đua Đạo Cụ-Đôi', karts: 6, teams: 3, items: true };
  // Thẻ ghép phòng: ô đồng đội hiện đúng người yêu đã chọn.
  if (TD.lobby && TD.lobby.rosterFor) {
    const base = TD.lobby.rosterFor;
    TD.lobby.rosterFor = function (mode, fresh) {
      const r = base.call(TD.lobby, mode, fresh), b = mode.id === 'couple' && botBy(soc().couple.partner);
      if (b) {
        const p = r.list.find((x) => !x.me && x.team === 1);
        if (p) { r.list.forEach((x) => { if (x !== p && x.name === b.name) x.name = x.name + ' 2'; }); Object.assign(p, { name: b.name, lv: b.lv, av: b.av, car: b.car }); }
      }
      return r;
    };
  }

  // ---------- giao diện ----------
  const V = { screen: '', tab: '', sel: '', track: '', msg: '' };
  const avatar = (p, cls) => `<img class="sc-av${cls ? ' ' + cls : ''}" src="${LA}avatar_${p.av === 'nu' ? 'nu' : 'nam'}.webp" alt="">`;
  const tierOf = (pts) => TD.RANK.of(pts);
  const badge = (pts) => { const r = tierOf(pts); return `<img class="sc-bd" src="${r.badge}" alt="${esc(r.name)}" title="${esc(r.name)}">`; };
  const coinsBar = () => `<div class="sc-coins"><img src="${LA}coin.webp" alt=""><b>${fmt(TD.save.d.coins)}</b></div>`;
  const bar = (v, max, cls) => `<i class="sc-bar${cls ? ' ' + cls : ''}"><b style="width:${max ? Math.min(100, Math.round(100 * v / max)) : 100}%"></b></i>`;
  const TITLES = { mail: 'Thư', friends: 'Bạn Bè', club: 'Đội Đua', couple: 'Cặp Đôi', rank: 'BXH' };

  function toast(msg) {
    const r = root(), old = r.querySelector('.sc-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'sc-toast'; t.textContent = msg;
    r.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }
  const tabs = (list, cur) => `<nav class="sc-tabs">${list.map(([id, label]) => `<button class="sc-tab${id === cur ? ' on' : ''}" data-act="tab" data-id="${id}">${label}</button>`).join('')}</nav>`;
  function frame(screen, tabHtml, body) {
    return `<div class="sc sc-${screen}" data-screen="${screen}">
  <header class="sc-h"><button class="sc-back btn gray" data-act="back" aria-label="Về sảnh">‹ Về sảnh</button><h2>${TITLES[screen]}</h2>${coinsBar()}</header>
  ${tabHtml || ''}<main class="sc-b">${body}</main></div>`;
  }

  // -- Bạn Bè --
  function bestRows(b) {
    const d = TD.save.d;
    return Object.keys(TD.TRACKS).map((id) => {
      const t = botTime(b, id), mine = d.best[id], diff = mine != null ? mine - t : null;
      return `<div class="sc-bt"><span>${esc(TD.TRACKS[id].name)}</span><b>${TD.fmtTime(t)}</b><em>${mine != null ? TD.fmtTime(mine) : '--:--.--'}</em>` +
        `<i class="${diff == null ? '' : diff <= 0 ? 'up' : 'dn'}">${diff == null ? '' : (diff <= 0 ? '−' : '+') + Math.abs(diff).toFixed(1) + 's'}</i></div>`;
    }).join('');
  }
  function friendRow(b, s, on) {
    const o = online(b);
    return `<button class="sc-row${on ? ' on' : ''}" data-act="pick" data-id="${b.id}">${avatar(b)}<span class="sc-nm"><b>${esc(b.name)}</b>` +
      `<small>Lv.${b.lv} · ${esc(tierOf(b.pts).name)}</small></span><span class="sc-st ${o ? 'on' : ''}">${o ? 'Online' : esc(seen(b))}</span></button>`;
  }
  function viewFriends() {
    const s = soc(), list = s.friends.map(botBy).filter(Boolean), today = dayKey(S.now());
    const rec = s.recent.map(botBy).filter((b) => b && s.friends.indexOf(b.id) < 0);
    if (!V.tab) V.tab = 'list';
    let left, right = '';
    if (V.tab === 'list') {
      if (!list.some((b) => b.id === V.sel)) V.sel = list[0] ? list[0].id : '';
      left = list.length ? list.map((b) => friendRow(b, s, b.id === V.sel)).join('') : '<div class="sc-empty">Chưa có bạn bè. Vào mục "Vừa đua" để kết bạn.</div>';
      const b = botBy(V.sel);
      if (b) {
        const sent = s.sent[b.id] === today;
        right = `<div class="sc-card">${avatar(b, 'big')}<div class="sc-who"><b>${esc(b.name)}</b><small>Lv.${b.lv} · ${esc(tierOf(b.pts).name)}</small>` +
          `<span class="sc-st ${online(b) ? 'on' : ''}">${online(b) ? 'Online' : 'Hoạt động ' + esc(seen(b))}</span></div>${badge(b.pts)}</div>
        <div class="sc-act"><button class="btn yellow sc-bn" data-act="gift" data-id="${b.id}"${sent ? ' disabled' : ''}>${sent ? 'Đã tặng xăng' : 'Tặng xăng'}</button>
        <button class="btn gray sc-bn" data-act="del" data-id="${b.id}">Xóa bạn</button></div>
        <div class="sc-bth"><span>Kỷ lục đường</span><b>${esc(b.name)}</b><em>Bạn</em><i></i></div><div class="sc-bts">${bestRows(b)}</div>`;
      }
    } else {
      left = rec.length ? rec.map((b) => `<div class="sc-row">${avatar(b)}<span class="sc-nm"><b>${esc(b.name)}</b><small>Lv.${b.lv} · ${esc(tierOf(b.pts).name)}</small></span>` +
        `<button class="btn blue sc-add" data-act="add" data-id="${b.id}">Kết Bạn</button></div>`).join('')
        : '<div class="sc-empty">Chưa có đối thủ mới. Đua một trận rồi quay lại đây.</div>';
      right = '<div class="sc-empty">Kết bạn để tặng xăng mỗi ngày và so kỷ lục đường.</div>';
    }
    return frame('friends', tabs([['list', `Bạn Bè ${s.friends.length}/${MAX_FRIENDS}`], ['recent', `Vừa đua ${rec.length}`]], V.tab),
      `<section class="sc-l sc-list">${left}</section><section class="sc-r">${right}</section>`);
  }

  // -- Thư --
  function viewMail() {
    const s = soc();
    if (!s.mail.some((m) => String(m.id) === String(V.sel))) V.sel = s.mail[0] ? String(s.mail[0].id) : '';
    const sel = s.mail.find((m) => String(m.id) === String(V.sel)), pending = s.mail.filter((m) => m.coins && !m.got).length;
    const left = s.mail.length ? s.mail.map((m) => `<button class="sc-row${String(m.id) === String(V.sel) ? ' on' : ''}" data-act="pick" data-id="${m.id}">` +
      `<img class="sc-mi" src="${A}ic_mail.webp" alt=""><span class="sc-nm"><b>${esc(m.title)}</b><small>${esc(m.day)}${m.coins && !m.got ? ' · có quà' : ''}</small></span>` +
      `${!m.read ? '<i class="sc-new">Mới</i>' : ''}</button>`).join('') : '<div class="sc-empty">Hộp thư trống</div>';
    const right = sel ? `<div class="sc-mh"><b>${esc(sel.title)}</b><small>${esc(sel.day)}</small></div><p class="sc-mb">${esc(sel.body)}</p>` +
      (sel.coins ? `<div class="sc-att"><img src="${LA}coin.webp" alt=""><b>${fmt(sel.coins)}</b>` +
        `<button class="btn yellow sc-bn" data-act="claim" data-id="${sel.id}"${sel.got ? ' disabled' : ''}>${sel.got ? 'Đã nhận' : 'Nhận thưởng'}</button></div>` : '')
      : '<div class="sc-empty">Chọn một thư để đọc</div>';
    const tools = `<div class="sc-tool"><button class="btn blue sc-bn" data-act="claimall"${pending ? '' : ' disabled'}>Nhận tất cả${pending ? ' (' + pending + ')' : ''}</button>` +
      `<button class="btn gray sc-bn" data-act="clean">Xóa thư đã nhận</button></div>`;
    return frame('mail', '', `<section class="sc-l"><div class="sc-list">${left}</div>${tools}</section><section class="sc-r">${right}</section>`);
  }

  // -- Đội Đua --
  function viewClub() {
    const s = soc(), c = s.club, d = TD.save.d;
    if (!c.id) {
      const lv = TD.LEVEL.of(d.xp).lv;
      const cards = CLUBS.map((k) => {
        const l = clubLv(k.xp0 + k.rate * Math.max(0, dayNum(S.now()) - EPOCH)).lv, ok = lv >= k.req;
        return `<div class="sc-row nohov"><img class="sc-cb" src="${A}ic_club.webp" alt=""><span class="sc-nm"><b>${esc(k.name)}</b><small>Cấp ${l} · ${CLUB_MEMBERS}/30 người · cần Lv.${k.req}</small></span>` +
          `<button class="btn blue sc-add" data-act="join" data-id="${k.id}"${ok ? '' : ' disabled'}>Xin vào</button></div>`;
      }).join('');
      return frame('club', '', `<section class="sc-l sc-list">${cards}</section><section class="sc-r"><div class="sc-empty">Đội đua của bạn chưa báo danh.<br>Tham gia một đội để nhận XP đội, nhiệm vụ tuần và thưởng xu.</div>` +
        `<label class="sc-name">Tên đội mới<input id="sc-cname" maxlength="16" placeholder="3–16 ký tự" autocomplete="off"></label>` +
        `<button class="btn yellow sc-bn" data-act="create">Tạo Đội · ${fmt(CLUB_COST)} xu</button></section>`);
    }
    const k = clubDef(c), L = clubLv(clubTotalXp(c)), cur = c.w;
    if (!V.tab) V.tab = 'members';
    let right;
    if (V.tab === 'members') {
      right = `<div class="sc-rows">${clubMembers(c).map((m, n) => `<div class="sc-row nohov${m.bot.me ? ' me' : ''}"><i class="sc-no">${n + 1}</i>${avatar(m.bot)}<span class="sc-nm"><b>${esc(m.bot.name)}</b>` +
        `<small>Lv.${m.bot.lv}${m.lead ? ' · Đội trưởng' : ''}</small></span><span class="sc-val">${fmt(m.c)}</span></div>`).join('')}</div>`;
    } else if (V.tab === 'tasks') {
      right = `<div class="sc-rows">${TASKS.map((t) => {
        const v = Math.min(cur[t.id], t.need), done = !!cur.done[t.id], can = v >= t.need && !done;
        return `<div class="sc-row nohov"><span class="sc-nm"><b>${esc(t.name.replace('{n}', t.need))}</b><small>${v}/${t.need} · ${t.coins} xu · ${t.cp} cống hiến · ${t.xp} XP đội</small>${bar(v, t.need)}</span>` +
          `<button class="btn yellow sc-add" data-act="task" data-id="${t.id}"${can ? '' : ' disabled'}>${done ? 'Đã nhận' : 'Nhận thưởng'}</button></div>`;
      }).join('')}</div>`;
    } else {
      right = `<div class="sc-rows"><div class="sc-empty left">Điểm cống hiến: <b>${c.cp}</b></div>${SHOP.map((it) => `<div class="sc-row nohov"><img class="sc-mi" src="${LA}coin.webp" alt=""><span class="sc-nm"><b>${esc(it.name)}</b>` +
        `<small>+${fmt(it.coins)} xu</small></span><button class="btn blue sc-add" data-act="buy" data-id="${it.id}"${c.cp >= it.cost ? '' : ' disabled'}>${it.cost} CH</button></div>`).join('')}</div>`;
    }
    const info = `<section class="sc-l sc-info"><img class="sc-cbig" src="${A}ic_club.webp" alt=""><b class="sc-cn">${esc(k.name)}</b>` +
      `<small>Cấp ${L.lv} · ${L.lv >= CLUB_MAX_LV ? 'tối đa' : L.into + '/' + L.need + ' XP'}</small>${bar(L.into, L.need)}` +
      `<small>Thưởng xu đội: +${Math.round(perk(L.lv) * 100)}%</small><small>Cống hiến tuần: ${cur.c}</small>` +
      `<button class="btn gray sc-bn" data-act="leave">Rời đội</button></section>`;
    return frame('club', tabs([['members', 'Thành viên'], ['tasks', 'Nhiệm vụ tuần'], ['shop', 'Cửa hàng đội']], V.tab), `${info}<section class="sc-r">${right}</section>`);
  }

  // -- Cặp Đôi --
  function viewCouple() {
    const s = soc(), cp = s.couple, b = botBy(cp.partner);
    if (!b || V.tab === 'pick') {
      const list = bots().slice().sort((x, y) => x.lv - y.lv).map((p) => `<button class="sc-row${p.id === cp.partner ? ' on' : ''}" data-act="partner" data-id="${p.id}">${avatar(p)}` +
        `<span class="sc-nm"><b>${esc(p.name)}</b><small>Lv.${p.lv} · ${esc(tierOf(p.pts).name)}</small></span><span class="sc-st ${online(p) ? 'on' : ''}">${online(p) ? 'Online' : esc(seen(p))}</span></button>`).join('');
      return frame('couple', '', `<section class="sc-l sc-list">${list}</section><section class="sc-r"><div class="sc-empty">Chọn một người đồng hành.<br>Hai bạn cùng một đội trong Đua Đạo Cụ-Đôi, mỗi trận cộng điểm tình.</div></section>`);
    }
    const xp = cp.xp[b.id] || 0, L = loveLv(xp);
    const right = `<div class="sc-heart"><img src="${A}ic_couple.webp" alt=""><b>Cấp tình ${L.lv}</b><small>${L.lv >= 20 ? 'tối đa' : L.into + '/' + L.need + ' điểm tình'}</small>${bar(L.into, L.need, 'love')}` +
      `<small>Thưởng xu cặp đôi: +${Math.round(perk(L.lv) * 100)}%</small><small>Trận đầu tiên mỗi ngày: +20 điểm tình</small></div>
      <div class="sc-act"><button class="btn yellow sc-bn" data-act="race">Đua Đạo Cụ-Đôi</button><button class="btn gray sc-bn" data-act="change">Đổi người</button></div>`;
    const pair = `<section class="sc-l sc-pair">${avatar(me(), 'big')}<img class="sc-hh" src="${A}ic_couple.webp" alt="">${avatar(b, 'big')}` +
      `<b>${esc(TD.save.d.name)} &amp; ${esc(b.name)}</b><small>Lv.${me().lv} · Lv.${b.lv}</small></section>`;
    return frame('couple', '', pair + `<section class="sc-r">${right}</section>`);
  }

  // -- BXH --
  function viewRank() {
    const d = TD.save.d, ids = Object.keys(TD.TRACKS);
    if (!V.tab) V.tab = 'lv';
    if (!TD.TRACKS[V.track]) V.track = TD.TRACKS[d.track] ? d.track : ids[0];
    const M = me();
    let rows, valOf;
    if (V.tab === 'time') {
      rows = bots().map((b) => ({ p: b, v: botTime(b, V.track) }));
      if (d.best[V.track] != null) rows.push({ p: M, v: d.best[V.track] });
      rows.sort((a, b) => a.v - b.v);
      valOf = (r) => TD.fmtTime(r.v);
    } else {
      const key = V.tab === 'rank' ? 'pts' : 'lv';
      rows = bots().concat(M).map((p) => ({ p, v: p[key] })).sort((a, b) => b.v - a.v || (b.p.me ? 1 : 0) - (a.p.me ? 1 : 0));
      valOf = V.tab === 'rank' ? (r) => `${badge(r.v)}<span>${esc(tierOf(r.v).name)}</span>` : (r) => 'Lv.' + r.v;
    }
    const mine = rows.findIndex((r) => r.p.me);
    const chips = V.tab === 'time' ? `<div class="sc-chips">${ids.map((id) => `<button class="sc-chip${id === V.track ? ' on' : ''}" data-act="track" data-id="${id}">${esc(TD.TRACKS[id].name)}</button>`).join('')}</div>` : '';
    const list = rows.map((r, n) => `<div class="sc-row nohov${r.p.me ? ' me' : ''}"><i class="sc-no n${n < 3 ? n + 1 : 0}">${n + 1}</i>${avatar(r.p)}` +
      `<span class="sc-nm"><b>${esc(r.p.name)}</b><small>Lv.${r.p.lv}</small></span><span class="sc-val">${valOf(r)}</span></div>`).join('');
    const head = `<div class="sc-mine"><img src="${A}ic_rank.webp" alt=""><span>${mine >= 0 ? 'Hạng của bạn: <b>' + (mine + 1) + '</b>/' + rows.length : 'Bạn chưa có kỷ lục đường này'}</span></div>`;
    return frame('rank', tabs([['lv', 'Cấp độ'], ['rank', 'Xếp hạng'], ['time', 'Thời gian đường']], V.tab), `<section class="sc-l sc-wide">${head}${chips}<div class="sc-list">${list}</div></section>`);
  }

  // ---------- vẽ và xử lý ----------
  const VIEWS = { friends: viewFriends, mail: viewMail, club: viewClub, couple: viewCouple, rank: viewRank };
  function render() {
    const r = root(), keep = r.querySelector('.sc-list'), top = keep ? keep.scrollTop : 0, name = r.querySelector('#sc-cname'), typed = name ? name.value : '';
    S.refresh();
    r.innerHTML = VIEWS[V.screen]();
    const l = r.querySelector('.sc-list');
    if (l) l.scrollTop = top;
    const nm = r.querySelector('#sc-cname');
    if (nm && typed) nm.value = typed;
    r.onclick = (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) act(b.dataset.act, b.dataset.id); };
  }
  function act(a, id) {
    sfx('Play_UI_Click');
    const s = soc(), d = TD.save.d, say = (m) => { render(); toast(m); };
    if (a === 'back') { V.screen = ''; (TD.lobby && TD.lobby.show) ? TD.lobby.show() : TD.main.toLobby(); return; }
    if (a === 'tab') { V.tab = id; V.sel = ''; return render(); }
    if (a === 'pick') { V.sel = id; if (V.screen === 'mail') { const m = s.mail.find((x) => String(x.id) === id); if (m && !m.read) { m.read = 1; TD.save.save(); } } return render(); }
    if (a === 'track') { V.track = id; return render(); }
    // Bạn Bè
    if (a === 'add') {
      if (s.friends.length >= MAX_FRIENDS) return say('Bạn bè đã đạt giới hạn rồi');
      s.friends.push(id); s.recent = s.recent.filter((x) => x !== id); TD.save.save(); return say('Kết bạn thành công');
    }
    if (a === 'del') { s.friends = s.friends.filter((x) => x !== id); delete s.sent[id]; TD.save.save(); V.sel = ''; return say('Đã xóa bạn'); }
    if (a === 'gift') { s.sent[id] = dayKey(S.now()); TD.save.save(); return say('Tặng xăng thành công. Mai bạn sẽ nhận quà lại'); }
    // Thư
    if (a === 'claim') { const n = claimMail(+id); return say(n ? 'Nhận được ' + fmt(n) + ' xu' : 'Không có quà'); }
    if (a === 'claimall') { let n = 0; s.mail.forEach((m) => { n += claimMail(m.id); }); return say('Nhận được ' + fmt(n) + ' xu'); }
    if (a === 'clean') { s.mail = s.mail.filter((m) => m.coins && !m.got); TD.save.save(); return say('Đã xóa thư đã nhận'); }
    // Đội Đua
    if (a === 'join') {
      const k = CLUBS.find((x) => x.id === id);
      if (TD.LEVEL.of(d.xp).lv < k.req) return say('Cấp chưa đủ để vào đội');
      s.club.id = id; s.club.xp = 0; V.tab = ''; TD.save.save(); return say('Đã vào ' + k.name);
    }
    if (a === 'create') {
      const nm = (root().querySelector('#sc-cname').value || '').trim();
      if (nm.length < 3) return say('Tên đội cần từ 3 ký tự');
      if (d.coins < CLUB_COST) return say('Không đủ xu để tạo đội');
      d.coins -= CLUB_COST; Object.assign(s.club, { id: 'mine', mine: nm.slice(0, 16), xp: 0 }); V.tab = ''; TD.save.save(); return say('Tạo đội thành công');
    }
    if (a === 'leave') { Object.assign(s.club, { id: '', mine: '', xp: 0 }); V.tab = ''; TD.save.save(); return say('Đã rời đội'); }
    if (a === 'task') {
      const t = TASKS.find((x) => x.id === id), w = s.club.w;
      if (w[t.id] < t.need || w.done[t.id]) return;
      w.done[t.id] = 1; d.coins += t.coins; s.club.cp += t.cp; s.club.xp += t.xp; TD.save.save(); return say('Nhận được ' + t.coins + ' xu');
    }
    if (a === 'buy') {
      const it = SHOP.find((x) => x.id === id);
      if (s.club.cp < it.cost) return;
      s.club.cp -= it.cost; d.coins += it.coins; TD.save.save(); return say('Nhận được ' + fmt(it.coins) + ' xu');
    }
    // Cặp Đôi
    if (a === 'partner') { s.couple.partner = id; V.tab = ''; TD.save.save(); return say('Đã chọn người đồng hành'); }
    if (a === 'change') { V.tab = 'pick'; return render(); }
    if (a === 'race') { V.screen = ''; TD.lobby.match(TD.MODES.couple); }
  }

  S.open = function (screen) {
    V.screen = screen; V.tab = ''; V.sel = '';
    if (TD.lobby) TD.lobby.screen = null;
    TD.main.lobbyCam = null;
    render();
  };
  S.badge = {
    mail: () => unread(S.refresh()),
    friends: () => { const s = S.refresh(), t = dayKey(S.now()); return s.friends.filter((id) => s.sent[id] !== t).length ? 1 : 0; },
    club: () => { const c = S.refresh().club; return c.id ? TASKS.filter((t) => c.w[t.id] >= t.need && !c.w.done[t.id]).length : 0; },
  };
  S.claimMail = claimMail; S.bots = bots; S.addMail = (...a) => addMail(soc(), ...a); S.state = soc;

  // ---------- sảnh ----------
  // order: các nhánh khác (PET, thời trang…) đăng ký thêm cùng nơi; số nhỏ đứng trước.
  const L = TD.lobby;
  if (L && L.add) {
    const top = (id, label, icon, order, scr) => L.add({ id, where: 'top', label, icon: A + icon, order, open: () => S.open(scr), badge: S.badge[scr] });
    top('mail', 'Thư', 'ic_mail.webp', 10, 'mail');
    top('friends', 'Bạn Bè', 'ic_friend.webp', 11, 'friends');
    top('rank', 'BXH', 'ic_rank.webp', 12, 'rank');
    L.add({ id: 'club', where: 'bar', label: 'Đội Đua', icon: A + 'ic_club.webp', order: 10, open: () => S.open('club'), badge: S.badge.club });
    L.add({ id: 'couple', where: 'bar', label: 'Cặp Đôi', icon: A + 'ic_couple.webp', order: 11, open: () => S.open('couple') });
  }
  addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || !V.screen || !TD.main || TD.main.state !== 'lobby') return;
    const b = root().querySelector('.sc-back');
    if (b) b.click();
  });

  TD.social = S;
})(globalThis.TD = globalThis.TD || {});
