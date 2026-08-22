/*
 * progress.js - the long arcs: professions at skill 5 and 10, seasonal forage,
 * the festivals you can actually attend, and what finishing a Community Centre
 * room gives back to the valley.
 *
 * These are the systems that make year 2 different from year 1. Without them a
 * Stardew clone is a crop timer with a town attached.
 */
(function (global) {
  'use strict';

  var UI = global.SDV_UI.UI, el = global.SDV_UI.el, icon = global.SDV_UI.icon;
  var EV = global.SDV_EVENTS;

  // ------------------------------------------------------------------ professions
  /* name -> what it actually does, applied in the value/roll helpers below. */
  var PROFESSIONS = {
    farming: {
      5: [{ id: 'Rancher', text: 'Sản phẩm vật nuôi đắt thêm 20%' },
          { id: 'Tiller', text: 'Nông sản đắt thêm 10%' }],
      10: [{ id: 'Coopmaster', text: 'Thân thiết với gia cầm nhanh hơn', needs: 'Rancher' },
           { id: 'Shepherd', text: 'Thân thiết với gia súc nhanh hơn', needs: 'Rancher' },
           { id: 'Artisan', text: 'Hàng thủ công đắt thêm 40%', needs: 'Tiller' },
           { id: 'Agriculturist', text: 'Cây lớn nhanh hơn 10%', needs: 'Tiller' }]
    },
    mining: {
      5: [{ id: 'Miner', text: 'Mỗi mạch quặng thêm 1 viên' },
          { id: 'Geologist', text: 'Đá có cơ hội rơi thêm đá quý' }],
      10: [{ id: 'Blacksmith', text: 'Thanh kim loại đắt thêm 50%', needs: 'Miner' },
           { id: 'Prospector', text: 'Gấp đôi cơ hội ra than', needs: 'Miner' },
           { id: 'Excavator', text: 'Gấp đôi cơ hội ra geode', needs: 'Geologist' },
           { id: 'Gemologist', text: 'Đá quý đắt thêm 30%', needs: 'Geologist' }]
    },
    foraging: {
      5: [{ id: 'Forester', text: 'Cây cho thêm gỗ' },
          { id: 'Gatherer', text: 'Có cơ hội hái được gấp đôi' }],
      10: [{ id: 'Lumberjack', text: 'Cây thường cũng rơi gỗ cứng', needs: 'Forester' },
           { id: 'Tapper', text: 'Nhựa cây đắt thêm 25%', needs: 'Forester' },
           { id: 'Botanist', text: 'Đồ hái luôn ở phẩm cấp cao nhất', needs: 'Gatherer' },
           { id: 'Tracker', text: 'Thấy được đồ hái trên bản đồ nhỏ', needs: 'Gatherer' }]
    },
    fishing: {
      5: [{ id: 'Fisher', text: 'Cá đắt thêm 25%' },
          { id: 'Trapper', text: 'Lồng cua rẻ nguyên liệu hơn' }],
      10: [{ id: 'Angler', text: 'Cá đắt thêm 50%', needs: 'Fisher' },
           { id: 'Pirate', text: 'Cơ hội có rương kho báu cao hơn', needs: 'Fisher' },
           { id: 'Mariner', text: 'Lồng cua không dính rác', needs: 'Trapper' },
           { id: 'Luremaster', text: 'Lồng cua không cần mồi', needs: 'Trapper' }]
    },
    combat: {
      5: [{ id: 'Fighter', text: 'Sát thương +10%' },
          { id: 'Scout', text: 'Tỉ lệ chí mạng +50%' }],
      10: [{ id: 'Brute', text: 'Sát thương thêm 15%', needs: 'Fighter' },
           { id: 'Defender', text: 'Máu tối đa +25', needs: 'Fighter' },
           { id: 'Acrobat', text: 'Hồi chiêu nhanh hơn', needs: 'Scout' },
           { id: 'Desperado', text: 'Chí mạng mạnh hơn hẳn', needs: 'Scout' }]
    }
  };

  var SKILL_VN = { farming: 'Nông nghiệp', mining: 'Khai khoáng',
                   foraging: 'Hái lượm', fishing: 'Câu cá', combat: 'Chiến đấu' };

  function has(sim, id) { return !!sim.professions[id]; }

  /* Applied wherever a price is computed. Kept in one place so the numbers are
   * auditable instead of scattered through the UI. */
  function priceMultiplier(sim, cat) {
    var m = 1;
    if (cat === 'crop' || cat === 'fruit') { if (has(sim, 'Tiller')) m *= 1.1; }
    if (cat === 'artisan') { if (has(sim, 'Artisan')) m *= 1.4; }
    if (cat === 'fish') {
      if (has(sim, 'Angler')) m *= 1.5;
      else if (has(sim, 'Fisher')) m *= 1.25;
    }
    if (cat === 'mineral' && has(sim, 'Gemologist')) m *= 1.3;
    if (cat === 'resource' && has(sim, 'Blacksmith')) m *= 1.5;
    return m;
  }

  // ------------------------------------------------------------------ forage
  var FORAGE = {
    Spring: ['Wild Horseradish', 'Daffodil', 'Leek', 'Dandelion', 'Spring Onion'],
    Summer: ['Spice Berry', 'Grape', 'Sweet Pea', 'Fiddlehead Fern'],
    Fall:   ['Common Mushroom', 'Wild Plum', 'Hazelnut', 'Blackberry'],
    Winter: ['Winter Root', 'Crystal Fruit', 'Snow Yam', 'Crocus']
  };
  var FORAGE_AREAS = ['forest', 'mountain', 'busstop', 'town', 'farm'];

  function spawnForage(game) {
    var sim = game.sim;
    var pool = FORAGE[sim.season()] || [];
    var made = 0;
    FORAGE_AREAS.forEach(function (key) {
      var a = game.world.areas[key];
      if (!a) return;
      // clear yesterday's leftovers so the map does not silt up
      a.objs = a.objs.filter(function (o) { return o.kind !== 'forage'; });
      // The original scatters a handful across the whole valley per day,
      // not a harvest per map. Five maps x5 was free money.
      var want = key === 'forest' ? 3 : (key === 'farm' ? 1 : 2);
      var tries = want * 30;
      while (want > 0 && tries-- > 0) {
        var x = 2 + Math.floor(sim.rand() * (a.w - 4));
        var y = 2 + Math.floor(sim.rand() * (a.h - 4));
        var t = a.name_of(x, y);
        if (t !== 'grass' && t !== 'dirt') continue;
        if (game.world.objAt(x, y, a)) continue;
        var name = pool[Math.floor(sim.rand() * pool.length)];
        if (!name || !sim.itemInfo(name)) continue;
        a.objs.push({ x: x, y: y, kind: 'forage', item: name });
        want--; made++;
      }
    });
    return made;
  }

  // ------------------------------------------------------------------ CC rewards
  var ROOM_REWARDS = {
    'Crafts Room':    { flag: 'bridgeFixed',  text: 'Cây cầu ngoài bãi biển đã được sửa.' },
    'Pantry':         { flag: 'greenhouse',   text: 'Nhà kính trên nông trại đã dựng lại.' },
    'Fish Tank':      { flag: 'glitteringBoulder', text: 'Tảng đá chắn suối đã được dời đi.' },
    'Boiler Room':    { flag: 'minecart',     text: 'Tàu điện trong mỏ chạy lại được.' },
    'Bulletin Board': { flag: 'friendship',   text: 'Cả làng quý bạn hơn hẳn.' },
    'Vault':          { flag: 'busFixed',     text: 'Xe buýt đi sa mạc đã sửa xong.' }
  };

  function applyRoomReward(game, room) {
    var r = ROOM_REWARDS[room];
    if (!r) return null;
    var s = game.sim;
    if (s.flags[r.flag]) return null;
    s.flags[r.flag] = true;
    if (r.flag === 'bridgeFixed') {
      var beach = game.world.areas.beach;
      beach.objs = beach.objs.filter(function (o) { return o.kind !== 'brokenBridge'; });
      beach.rect(13, 14, 9, 2, 'sand');
    }
    if (r.flag === 'greenhouse') {
      var farm = game.world.areas.farm;
      farm.objs = farm.objs.filter(function (o) { return o.kind !== 'greenhouseShell'; });
      farm.building(35, 29, 6, 4, { label: 'Nhà kính', color: '#cfe4d0', roof: '#7fae86',
                                    to: 'greenhouse', tx: 8, ty: 12 });
    }
    if (r.flag === 'friendship') {
      for (var n in s.friendship) s.friendship[n].points += 250;
    }
    return r.text;
  }

  // ------------------------------------------------------------------ wiring
  /* Prices flow through sim.sellPrice, so professions hook in there once. */
  var baseSell = global.SDV_SIM.Sim.prototype.sellPrice;
  global.SDV_SIM.Sim.prototype.sellPrice = function (name, quality) {
    var raw = baseSell.call(this, name, quality);
    var info = this.itemInfo(name);
    if (!info) return raw;
    return Math.floor(raw * priceMultiplier(this, info.cat));
  };

  /* Levelling to 5 or 10 opens a choice that cannot be skipped silently. */
  var baseAddXp = global.SDV_SIM.Sim.prototype.addXp;
  global.SDV_SIM.Sim.prototype.addXp = function (skill, n) {
    var lvl = baseAddXp.call(this, skill, n);
    if (lvl === 5 || lvl === 10) {
      this.pendingProfession = { skill: skill, level: lvl };
    }
    return lvl;
  };

  UI.prototype.openProfession = function (skill, level) {
    var self = this, s = this.sim;
    var opts = (PROFESSIONS[skill] || {})[level] || [];
    if (level === 10) {
      opts = opts.filter(function (o) { return !o.needs || has(s, o.needs); });
    }
    if (!opts.length) { s.pendingProfession = null; return; }
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-sub',
      SKILL_VN[skill] + ' đạt cấp ' + level + ' — chọn một hướng. Chọn rồi không đổi được.'));
    opts.forEach(function (o) {
      var b = el('button', 'sdv-mbtn');
      b.appendChild(el('span', null, o.id));
      b.appendChild(el('small', 'sdv-cost', o.text));
      b.addEventListener('click', function () {
        s.professions[o.id] = true;
        s.pendingProfession = null;
        if (o.id === 'Defender') { s.maxHealth += 25; s.health += 25; }
        self.game.toast('Đã chọn nghề ' + o.id);
        self.close();
      });
      body.appendChild(b);
    });
    this.openPanel('Chọn nghề', body);
  };

  /* Forage picked off the ground - the one interaction the tool does not cover,
   * because picking a leek should not cost a swing or any energy. */
  var baseOpenObject = UI.prototype.openObject;
  UI.prototype.openObject = function (o, x, y) {
    if (o.kind === 'forage') {
      var s = this.sim;
      var q = has(s, 'Botanist') ? 3 : s.rollQuality(0);
      var n = has(s, 'Gatherer') && Math.random() < 0.2 ? 2 : 1;
      if (!s.give(o.item, n, q)) return this.game.toast('Túi đầy!');
      var lvl = s.addXp('foraging', 7);
      if (lvl) this.game.toast('Hái lượm lên cấp ' + lvl + '!');
      this.game.world.removeObj(o);
      this.game.toast('Nhặt ' + o.item + (n > 1 ? ' ×2' : ''));
      return;
    }
    return baseOpenObject.call(this, o, x, y);
  };

  /* Completing a bundle can complete a room, and a room changes the map. */
  var baseBundles = UI.prototype.openBundles;
  UI.prototype.openBundles = function (room) {
    baseBundles.call(this, room);
    var s = this.sim, g = this.game;
    var all = g.data.bundles.filter(function (b) { return b.room === room; });
    var done = all.every(function (b) { return s.bundlesDone[b.name]; });
    if (done && !s.flags[(ROOM_REWARDS[room] || {}).flag]) {
      var text = applyRoomReward(g, room);
      if (text) {
        g.toast('🎉 Hoàn thành ' + room + '! ' + text);
        if (this.panel) {
          var body = this.panel.querySelector('.sdv-body');
          if (body) body.insertBefore(el('div', 'sdv-speech', '🎉 ' + text), body.firstChild);
        }
      }
    }
  };

  // ------------------------------------------------------------------ festivals
  UI.prototype.openFestival = function (fest) {
    var self = this, s = this.sim, g = this.game;
    var body = el('div', 'sdv-body');
    body.appendChild(el('div', 'sdv-speech', fest.blurb));
    if (s.flags['fest_' + fest.name + '_' + s.year]) {
      body.appendChild(el('div', 'sdv-sub', 'Bạn đã tham gia lễ này năm nay rồi.'));
    } else {
      var b = el('button', 'sdv-mbtn', '🎪 Tham gia');
      b.addEventListener('click', function () {
        s.flags['fest_' + fest.name + '_' + s.year] = true;
        if (fest.reward.gold) {
          s.gold += fest.reward.gold;
          g.toast('Nhận ' + fest.reward.gold + 'g từ lễ hội');
        }
        if (fest.reward.item) {
          s.give(fest.reward.item, fest.reward.qty || 1);
          g.toast('Nhận ' + fest.reward.item);
        }
        // everyone at the festival warms to you a little
        Object.keys(s.friendship).forEach(function (n) {
          s.friendship[n].points = Math.min(2500, s.friendship[n].points + 25);
        });
        g.data.villagers.slice(0, 12).forEach(function (v) {
          s.friend(v.name).points = Math.min(2500, s.friend(v.name).points + 25);
        });
        self.close();
      });
      body.appendChild(b);
    }
    this.openPanel(fest.name, body);
  };

  global.SDV_PROGRESS = {
    PROFESSIONS: PROFESSIONS, FORAGE: FORAGE, ROOM_REWARDS: ROOM_REWARDS,
    spawnForage: spawnForage, priceMultiplier: priceMultiplier,
    applyRoomReward: applyRoomReward, SKILL_VN: SKILL_VN
  };
})(window);
