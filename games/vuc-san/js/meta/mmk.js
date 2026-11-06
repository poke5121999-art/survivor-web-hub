// Sảnh: ghép trận giả. Một lần ghép = một seed, đúng một bản đồ bốc ngẫu nhiên, 6 ghế (4 thợ lặn rồi 2 cá mập).
// Thuần: mọi ngẫu nhiên lấy từ rng truyền vào, nên cùng chuỗi rng thì cùng đội hình.
(function (VS) {
  'use strict';

  // Trọng số khi bot bốc nhân vật: nhiều 3★, ít 5★, như một sảnh thật toàn người chơi thường.
  var WEIGHT = { 3: 6, 4: 3, 5: 1 };
  var BOT_LEVEL_FLOOR = 6;      // người mới vào vẫn gặp bot cấp 6 trở lên cho đỡ trống trải

  function table(team) { return team === 'shark' ? VS.SHARKS : VS.DIVERS; }

  function weightedPick(ids, tb, rng) {
    var total = 0, i;
    for (i = 0; i < ids.length; i++) total += WEIGHT[tb[ids[i]].rarity] || 1;
    var r = rng() * total;
    for (i = 0; i < ids.length; i++) {
      r -= WEIGHT[tb[ids[i]].rarity] || 1;
      if (r < 0) return i;
    }
    return ids.length - 1;
  }

  // k tên không trùng nhau và không trùng tên người chơi: xáo từng phần (Fisher-Yates dừng ở k).
  function takeNames(k, avoid, rng) {
    var pool = (VS.NAMES || []).filter(function (n) { return n !== avoid; });
    for (var i = 0; i < k && i < pool.length; i++) {
      var j = i + Math.min(pool.length - i - 1, Math.floor(rng() * (pool.length - i)));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, k);
  }

  function ping(rng) { return 14 + Math.floor(rng() * rng() * 130); }   // lệch về thấp, thi thoảng cao

  function botLevel(base, rng) {
    var mid = Math.max(BOT_LEVEL_FLOOR, base);
    return Math.max(1, Math.round(mid + (rng() + rng() + rng() - 1.5) * 14));
  }

  function lineup(save, team, rng) {
    team = team === 'shark' ? 'shark' : 'diver';
    var cfg = VS.TUNING.match, maps = VS.MAPS;
    var seed = Math.floor(rng() * 4294967296) >>> 0;
    var mapId = maps[Math.min(maps.length - 1, Math.floor(rng() * maps.length))].id;
    var pick = save && save.pick || {};
    var myName = save && save.name || 'Bạn';
    var myLevel = save && save.level || 1;
    var names = takeNames(cfg.divers + cfg.sharks - 1, myName, rng);
    var seats = [{ team: 'diver', n: cfg.divers }, { team: 'shark', n: cfg.sharks }];
    var out = [], players = [], ni = 0;

    seats.forEach(function (side) {
      var tb = table(side.team);
      var humanDef = side.team === team ? pick[side.team] : null;
      if (humanDef && !tb[humanDef]) humanDef = null;
      if (side.team === team && !humanDef) humanDef = side.team === 'shark' ? VS.META.starter.shark : VS.META.starter.diver;
      var free = Object.keys(tb).filter(function (id) { return id !== humanDef; });   // cùng đội không có hai bản y hệt
      for (var i = 0; i < side.n; i++) {
        var human = side.team === team && i === 0, defId, name, level;
        if (human) { defId = humanDef; name = myName; level = myLevel; }
        else {
          defId = free.splice(weightedPick(free, tb, rng), 1)[0];
          name = names[ni++]; level = botLevel(myLevel, rng);
        }
        out.push({ team: side.team, defId: defId, name: name, ctrl: human ? 'human' : 'bot' });
        players.push({ name: name, level: level, ping: ping(rng), team: side.team, defId: defId, human: human });
      }
    });
    return { seed: seed, mapId: mapId, lineup: out, players: players };
  }

  VS.mmk = { lineup: lineup, WEIGHT: WEIGHT };
})(window.VS = window.VS || {});
