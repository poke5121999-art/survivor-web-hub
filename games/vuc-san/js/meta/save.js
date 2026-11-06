// Sảnh: lưu trữ (localStorage 'vs.save.v1'), làm sạch dữ liệu và quyết toán cuối trận (VS.meta.settle).
// Hàm thuần nhận đầu vào tường minh; chỉ dayIndex() và load()/store() chạm vào đồng hồ hoặc bộ nhớ trình duyệt.
(function (VS) {
  'use strict';

  var KEY = 'vs.save.v1';

  // data/tuning.js không thuộc nhánh sảnh nên các số của sảnh nằm ở đây, gacha.js và lobby.js đọc lại từ VS.META.
  var META = VS.META = {
    copyCap: 9999,              // số bản sao ghi nhận tối đa của một nhân vật (chỉ để hiện, không ảnh hưởng chỉ số)
    bankPerPoint: 50,           // thợ lặn được 1 điểm mỗi 50 kho báu nộp; tuning.js chỉ ghi chú số này, không có khoá riêng
    exp: { win: 100, lose: 50, perLevel: 500 },
    nameMax: 16,
    pearlCap: 99999999,
    levelCap: 999,
    starter: { diver: 'dave', shark: 'Blacktip_Reefshark' }
  };

  var mem = null;               // chỗ giữ tạm khi trình duyệt không cho dùng localStorage (và trong Node)

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function num(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) return dflt;
    v = Math.floor(v);
    return v < lo ? lo : v > hi ? hi : v;
  }
  function table(team) { return team === 'shark' ? VS.SHARKS : VS.DIVERS; }
  function economy() { return (VS.TUNING && VS.TUNING.economy) || {}; }

  function defaults() {
    var pity = {};
    (VS.BANNERS || []).forEach(function (b) { pity[b.id] = { n5: 0, n4: 0, guar: false }; });
    var start = economy().start;
    var owned = { diver: {}, shark: {} };
    owned.diver[META.starter.diver] = 1;
    owned.shark[META.starter.shark] = 1;
    return {
      v: 1, name: 'Bạn', level: 1, exp: 0, pearls: typeof start === 'number' ? start : 3200,
      owned: owned,
      pick: { team: 'diver', diver: META.starter.diver, shark: META.starter.shark },
      pity: pity,
      daily: { day: 0, firstWin: false },
      stats: { matches: 0, wins: 0, asDiver: 0, asShark: 0 },
      seq: 0
    };
  }

  // Giữ đúng khoá đã biết, bỏ id lạ, ép số xấu về giá trị hợp lệ. Luôn trả một đối tượng mới.
  function sanitize(raw) {
    var s = defaults();
    if (!raw || typeof raw !== 'object') return s;
    if (typeof raw.name === 'string') {
      var nm = raw.name.replace(/\s+/g, ' ').trim().slice(0, META.nameMax);
      if (nm) s.name = nm;
    }
    s.level = num(raw.level, 1, META.levelCap, 1);
    s.exp = num(raw.exp, 0, META.exp.perLevel - 1, 0);
    s.pearls = num(raw.pearls, 0, META.pearlCap, s.pearls);

    ['diver', 'shark'].forEach(function (team) {
      var tb = table(team), src = raw.owned && typeof raw.owned === 'object' ? raw.owned[team] : null, out = {};
      if (src && typeof src === 'object') {
        Object.keys(src).forEach(function (id) {
          if (tb && own(tb, id)) out[id] = num(src[id], 1, META.copyCap, 1);
        });
      }
      if (!out[META.starter[team]]) out[META.starter[team]] = 1;   // hai nhân vật khởi đầu không bao giờ mất
      s.owned[team] = out;
    });

    var pk = raw.pick && typeof raw.pick === 'object' ? raw.pick : {};
    s.pick.team = pk.team === 'shark' ? 'shark' : 'diver';
    ['diver', 'shark'].forEach(function (team) {
      var id = pk[team];
      s.pick[team] = typeof id === 'string' && own(s.owned[team], id) ? id : META.starter[team];
    });

    (VS.BANNERS || []).forEach(function (b) {
      var rp = raw.pity && typeof raw.pity === 'object' && raw.pity[b.id] && typeof raw.pity[b.id] === 'object' ? raw.pity[b.id] : {};
      s.pity[b.id] = {
        n5: num(rp.n5, 0, b.hard - 1, 0),
        n4: num(rp.n4, 0, b.pity4 - 1, 0),
        guar: rp.guar === true || rp.guar === 1
      };
    });

    var dl = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
    s.daily = { day: num(dl.day, 0, 99999999, 0), firstWin: dl.firstWin === true };
    var st = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    s.stats = {
      matches: num(st.matches, 0, 999999999, 0), wins: num(st.wins, 0, 999999999, 0),
      asDiver: num(st.asDiver, 0, 999999999, 0), asShark: num(st.asShark, 0, 999999999, 0)
    };
    s.seq = num(raw.seq, 0, 2147483647, 0);
    return s;
  }

  function storage() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }

  function load() {
    var text = null, ls = storage();
    if (ls) { try { text = ls.getItem(KEY); } catch (e) { text = null; } }
    else text = mem;
    var raw = null;
    if (text) { try { raw = JSON.parse(text); } catch (e) { raw = null; } }
    var s = sanitize(raw);
    VS.save.current = s;        // lobby dùng chung đúng đối tượng này với main.js
    return s;
  }

  function store(save) {
    var text = JSON.stringify(save), ls = storage();
    mem = text;
    if (ls) { try { ls.setItem(KEY, text); } catch (e) { /* hết chỗ hoặc chế độ riêng tư: giữ bản trong bộ nhớ */ } }
    return save;
  }

  // Chỉ số ngày theo lịch địa phương (số ngày kể từ 1970 tính trên ngày-tháng-năm địa phương): cùng một
  // ngày dương lịch của người chơi cho cùng một số, bất kể múi giờ. Đây là chỗ duy nhất dùng đồng hồ.
  function dayIndex(date) {
    var d = date || new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }

  VS.save = { KEY: KEY, defaults: defaults, sanitize: sanitize, load: load, store: store, dayIndex: dayIndex, current: null };

  function findActor(m, id) {
    var list = m && m.actors || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return list[id] || null;
  }
  function count(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0; }

  // Quyết toán một trận cho người xem (viewerId). Sửa save tại chỗ, trả phần thưởng để màn kết quả hiện.
  // Điểm: thợ lặn 1 mỗi 50 kho báu nộp và 1 mỗi lần cứu; cá mập 1 mỗi thợ lặn hạ gục. Ngọc từ điểm bị chặn ở pointCap.
  // day: chỉ số ngày địa phương (mặc định đồng hồ máy); thắng trận đầu của ngày được thưởng thêm.
  function settle(save, m, viewerId, day) {
    var eco = economy(), actor = findActor(m, viewerId);
    var team = actor ? actor.team : 'diver', st = actor && actor.stats || {};
    var win = !!(actor && m.result && m.result.winner === actor.team);
    var per = typeof eco.bankPerPoint === 'number' && eco.bankPerPoint > 0 ? eco.bankPerPoint : META.bankPerPoint;
    var points = team === 'shark' ? count(st.downs) : Math.floor(count(st.banked) / per) + count(st.revives);
    var today = typeof day === 'number' ? day : dayIndex();

    if (!save.daily || save.daily.day !== today) save.daily = { day: today, firstWin: false };
    var firstWin = win && !save.daily.firstWin;
    if (firstWin) save.daily.firstWin = true;

    var pearls = (win ? eco.win : eco.lose) + Math.min(points * eco.perPoint, eco.pointCap) + (firstWin ? eco.firstWin : 0);
    var exp = win ? META.exp.win : META.exp.lose;

    save.pearls = Math.min(META.pearlCap, save.pearls + pearls);
    save.exp += exp;
    var levelUp = false;
    while (save.exp >= META.exp.perLevel) { save.exp -= META.exp.perLevel; save.level++; levelUp = true; }

    var stats = save.stats || (save.stats = { matches: 0, wins: 0, asDiver: 0, asShark: 0 });
    stats.matches++;
    if (win) stats.wins++;
    if (team === 'shark') stats.asShark++; else stats.asDiver++;

    return { win: win, pearls: pearls, exp: exp, levelUp: levelUp, firstWin: firstWin, points: points };
  }

  VS.meta = VS.meta || {};
  VS.meta.settle = settle;
})(window.VS = window.VS || {});
