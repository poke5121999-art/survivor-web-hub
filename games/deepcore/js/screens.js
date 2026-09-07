/*
 * screens.js — mọi màn hình NGOÀI ván, dựng bằng DOM.
 *
 * Vì sao DOM chứ không vẽ lên canvas: mấy màn này toàn danh sách cuộn được và
 * nút bấm. Trình duyệt làm hai việc đó tốt hơn bất kỳ thứ gì tự viết, nhất là
 * cuộn có quán tính trên điện thoại.
 *
 * Nhưng phải NHÌN RA GAME chứ không ra trang web:
 *   - nút cao tối thiểu 60px, có gờ nổi, bấm là lún xuống
 *   - tab nằm ở ĐÁY màn hình, có chấm đỏ báo việc chưa làm
 *   - không có chữ nhỏ li ti, không gạch chân, không con trỏ chữ I
 *   - ảnh vật phẩm là sprite thật vẽ ra canvas, không phải emoji
 * Toàn bộ mấy điều đó nằm ở css/ui.css.
 */
(function (G) {
  'use strict';

  var root, game, tab = 'hang';

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  function clear() { while (root.firstChild) root.removeChild(root.firstChild); }

  /* Vẽ một ô vật phẩm từ atlas ra canvas nhỏ. */
  function icon(idx, size) {
    var c = document.createElement('canvas');
    var d = size || 32;
    c.width = d; c.height = d;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (G.Atlas.has('items')) {
      G.Atlas.draw(g, 'items', idx, d / 2, d, { scale: d / 16, ax: 0.5, ay: 1 });
    }
    return c;
  }

  function petIcon(art, size) {
    var c = document.createElement('canvas');
    var d = size || 40;
    c.width = d; c.height = d;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    var k = G.Atlas.pick(art + '.idle', art + '.move', art + '.idle_side');
    if (k) {
      var sz = G.Atlas.size(k, 0);
      var s = Math.min(3, (d - 6) / Math.max(sz[0], sz[1]));
      G.Atlas.draw(g, k, 0, d / 2, d - 3, { scale: s });
    }
    return c;
  }

  /* Hình nhân vật ghép lớp — đây là chỗ phô ra chuyện "đội mũ vào thì thấy mũ".
   * Cùng đúng hàm layers() mà lúc chơi dùng, nên không bao giờ lệch. */
  function doll(size, frame) {
    var c = document.createElement('canvas');
    var d = size || 96;
    c.width = d; c.height = d;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    var st = G.Meta.stats(), look = G.Meta.s.look;
    var body = look.female ? 'f_' : '';
    var e = st.eq;
    var ls = ['pc.' + body + 'skin',
              e.pants ? 'pc.pants.' + e.pants : 'pc.pants',
              e.chest ? 'pc.chest.' + e.chest : 'pc.' + body + 'shirt',
              'pc.' + body + 'eyes',
              (e.helm ? 'pc.hairhelm.' : 'pc.hair.') + (look.hair || '1')];
    if (e.helm) ls.push('pc.helm.' + e.helm);
    var s = d / 30;
    for (var i = 0; i < ls.length; i++) {
      if (G.Atlas.has(ls[i])) {
        G.Atlas.draw(g, ls[i], frame === undefined ? 0 : frame, d / 2, d - 2, { scale: s });
      }
    }
    return c;
  }

  function wallet() {
    var w = el('div', 'wallet');
    var s = G.Meta.s;
    var g1 = el('div', 'coin');
    g1.appendChild(icon(153, 18));
    g1.appendChild(el('b', null, String(s.gold)));
    var g2 = el('div', 'coin gem');
    g2.appendChild(icon(152, 18));
    g2.appendChild(el('b', null, String(s.gem)));
    w.appendChild(g1);
    w.appendChild(el('div', 'sp'));
    w.appendChild(g2);
    return w;
  }

  function tabs() {
    var t = el('div', 'tabs');
    var defs = [['hang', '⛏', 'HANG'], ['thu', '🐾', 'LINH THÚ'],
                ['do', '🛡', 'TRANG BỊ'], ['quay', '🎁', 'QUẦY']];
    defs.forEach(function (d) {
      var b = el('div', 'tab' + (tab === d[0] ? ' on' : ''));
      b.appendChild(el('div', 'ic', d[1]));
      b.appendChild(el('div', null, d[2]));
      b.onclick = function () { tab = d[0]; render(); };
      t.appendChild(b);
    });
    return t;
  }

  function btn(label, sub, cls, fn) {
    var b = el('div', 'btn ' + (cls || ''));
    var box = el('div');
    box.style.textAlign = 'center';
    box.appendChild(el('div', null, label));
    if (sub) box.appendChild(el('div', 'sub', sub));
    b.appendChild(box);
    b.onclick = fn;
    return b;
  }

  // ---------------------------------------------------------------- HANG

  function screenHang(s) {
    var sc = el('div', 'scroll');
    sc.appendChild(el('div', 'htitle', 'CHỌN HANG'));
    sc.appendChild(el('div', 'hsub',
      'Mỗi hang là MỘT TẦNG, khoảng mười phút. Làm xong nhiệm vụ thì khoang thoát hạ xuống đúng chỗ bạn vào — chạy về đó.'));

    G.BIOMES.forEach(function (b) {
      var unlocked = s.stage[b.id] !== undefined;
      var card = el('div', 'card');
      card.style.flexDirection = 'row';
      card.style.alignItems = 'flex-start';
      card.style.gap = '10px';
      card.style.minHeight = '0';
      card.style.padding = '10px';
      card.style.marginBottom = '8px';
      card.style.opacity = unlocked ? '1' : '.45';

      var sw = el('div');
      sw.style.cssText = 'width:44px;height:44px;flex:0 0 44px;border:2px solid #3c2e52;' +
        'background:' + b.glow + '22';
      var pv = document.createElement('canvas');
      pv.width = 40; pv.height = 40;
      var pg = pv.getContext('2d');
      pg.imageSmoothingEnabled = false;
      if (G.Atlas.has('tile.' + b.id + '.wall')) {
        for (var yy = 0; yy < 40; yy += 16) {
          for (var xx = 0; xx < 40; xx += 16) {
            G.Atlas.draw(pg, 'tile.' + b.id + '.wall', (xx + yy) % 20, xx, yy, { ax: 0, ay: 0 });
          }
        }
      }
      sw.appendChild(pv);

      var txt = el('div');
      txt.style.cssText = 'flex:1;text-align:left;display:flex;flex-direction:column;gap:3px';
      var h = el('div', null, b.name);
      h.style.cssText = 'font-size:15px;color:#ffd98a';
      txt.appendChild(h);
      txt.appendChild(el('div', 'hsub', unlocked ? b.desc : 'Khoá — qua ải 3 của hang trước'));
      if (unlocked) {
        var lv = el('div', null, 'Ải cao nhất: ' + (s.stage[b.id]));
        lv.style.cssText = 'font-size:11px;color:#8ad8ff';
        txt.appendChild(lv);
      }
      card.appendChild(sw);
      card.appendChild(txt);
      if (unlocked) card.onclick = function () { stageList(b); };
      sc.appendChild(card);
    });

    sc.appendChild(el('div', 'hr'));
    sc.appendChild(el('div', 'htitle', 'NÂNG CẤP VĨNH VIỄN'));
    sc.appendChild(el('div', 'hsub',
      'Mua một lần, ván nào cũng có. Ải nào chưa qua nổi thì nâng ở đây rồi vào lại.'));
    var grid = el('div', 'grid c2');
    G.Meta.UPGRADES.forEach(function (u) {
      var lv = s.up[u.id] || 0;
      var maxed = lv >= u.max;
      var cost = maxed ? 0 : G.Meta.upCost(u, lv);
      var c = el('div', 'card');
      c.style.minHeight = '104px';
      c.appendChild(icon(u.icon, 26));
      c.appendChild(el('div', 'cname', u.name));
      var st = el('div', null, u.txt(lv));
      st.style.cssText = 'font-size:9px;color:#9ad8ff;text-align:center;line-height:1.2';
      c.appendChild(st);
      var lvb = el('div', 'lv', lv + '/' + u.max);
      c.appendChild(lvb);
      var buy = el('div', null, maxed ? 'TỐI ĐA' : String(cost));
      buy.style.cssText = 'margin-top:auto;font-size:11px;padding:5px 10px;border-radius:5px;' +
        'background:' + (maxed ? '#2a2436' : (s.gold >= cost ? '#4a3a20' : '#2a2028')) +
        ';border:2px solid ' + (maxed ? '#3c2e52' : (s.gold >= cost ? '#7a5c2c' : '#3c2e52')) +
        ';color:' + (s.gold >= cost && !maxed ? '#ffd98a' : '#6a6078');
      c.appendChild(buy);
      c.onclick = function () {
        if (G.Meta.buyUpgrade(u.id)) render();
      };
      grid.appendChild(c);
    });
    sc.appendChild(grid);
    return sc;
  }

  function stageList(b) {
    var s = G.Meta.s;
    var top = s.stage[b.id] || 1;
    var m = el('div', 'modal');
    var p = el('div', 'panel');
    p.appendChild(el('h3', null, b.name.toUpperCase()));
    p.appendChild(el('div', 'hsub', b.desc));
    var sc = el('div', 'scroll');
    sc.style.maxHeight = '46vh';
    var grid = el('div', 'grid c3');
    for (var i = 1; i <= Math.max(6, top + 2); i++) {
      (function (lv) {
        var open = lv <= top;
        var c = el('div', 'card');
        c.style.minHeight = '62px';
        c.style.opacity = open ? '1' : '.35';
        var n = el('div', null, 'Ải ' + lv);
        n.style.cssText = 'font-size:14px;color:#ffd98a';
        c.appendChild(n);
        var d = el('div', null, lv < top ? 'đã qua' : lv === top ? 'MỚI' : 'khoá');
        d.style.cssText = 'font-size:9px;color:' + (lv === top ? '#7dff9a' : '#8a7f9c');
        c.appendChild(d);
        if (open) c.onclick = function () { root.removeChild(m); game.startRun(b.id, lv); };
        grid.appendChild(c);
      })(i);
    }
    sc.appendChild(grid);
    p.appendChild(sc);
    p.appendChild(btn('ĐÓNG', null, 'ghost', function () { root.removeChild(m); }));
    m.appendChild(p);
    root.appendChild(m);
  }

  // ---------------------------------------------------------------- LINH THÚ

  function screenThu(s) {
    var sc = el('div', 'scroll');
    sc.appendChild(el('div', 'htitle', 'ĐỘI HÌNH'));
    sc.appendChild(el('div', 'hsub',
      'Bạn KHÔNG tự đánh. Linh thú mang theo mới là vũ khí. Vào ván chỉ con đầu tiên ra trận ngay, những con còn lại phải gọi bằng thẻ lên cấp.'));

    var team = el('div', 'grid c3');
    for (var i = 0; i < 6; i++) {
      (function (idx) {
        var id = s.team[idx];
        var c = el('div', 'card' + (id ? ' sel' : ''));
        c.style.minHeight = '78px';
        if (id) {
          var d = G.PET[id];
          c.appendChild(petIcon(d.art, 38));
          c.appendChild(el('div', 'cname', d.name));
          c.appendChild(el('div', 'lv', 'b' + s.pets[id].tier));
          c.onclick = function () { s.team.splice(idx, 1); G.Meta.save(); render(); };
        } else {
          var pl = el('div', null, '+');
          pl.style.cssText = 'font-size:26px;color:#4a3a63;margin:auto';
          c.appendChild(pl);
        }
        team.appendChild(c);
      })(i);
    }
    sc.appendChild(team);

    sc.appendChild(el('div', 'hr'));
    sc.appendChild(el('div', 'htitle', 'KHO LINH THÚ'));
    var grid = el('div', 'grid c2');
    G.PETS.forEach(function (d) {
      var rec = s.pets[d.id];
      var own = rec && rec.own;
      var c = el('div', 'card r' + d.rare);
      c.style.minHeight = '150px';
      c.style.opacity = own ? '1' : '.42';
      c.appendChild(petIcon(d.art, 46));
      var nm = el('div', 'cname', d.name);
      nm.style.fontSize = '12px';
      c.appendChild(nm);
      var role = el('div', null, d.role);
      role.style.cssText = 'font-size:9px;color:#9ad8ff';
      c.appendChild(role);
      // BA DÒNG LUẬT — cái làm mười con này khác nhau, in thẳng ra chứ không giấu
      var rules = el('div');
      rules.style.cssText = 'font-size:8px;color:#8a7f9c;text-align:center;line-height:1.35';
      rules.textContent = G.PET_FOLLOW[d.bam] + ' · ' + G.PET_AIM[d.ngam];
      c.appendChild(rules);
      if (own) {
        c.appendChild(el('div', 'lv', 'bậc ' + rec.tier));
        var cost = G.PET_UP_COST[rec.tier];
        var frag = s.frag[d.id] || 0;
        var line = el('div');
        line.style.cssText = 'margin-top:auto;font-size:9px;width:100%;text-align:center';
        if (rec.tier >= 5) {
          line.textContent = 'BẬC TỐI ĐA';
          line.style.color = '#ffd98a';
        } else {
          var ok = frag >= cost.frag && s.gold >= cost.gold;
          line.innerHTML = '';
          line.appendChild(el('div', null, 'mảnh ' + frag + '/' + cost.frag));
          line.appendChild(el('div', null, 'vàng ' + cost.gold));
          line.style.color = ok ? '#7dff9a' : '#8a7f9c';
        }
        c.appendChild(line);
        c.onclick = function () { petDetail(d, rec); };
      } else {
        var lk = el('div', null, 'chưa có — quay ở Quầy');
        lk.style.cssText = 'margin-top:auto;font-size:9px;color:#6a6078';
        c.appendChild(lk);
      }
      grid.appendChild(c);
    });
    sc.appendChild(grid);
    return sc;
  }

  function petDetail(d, rec) {
    var s = G.Meta.s;
    var m = el('div', 'modal');
    var p = el('div', 'panel');
    p.appendChild(el('h3', null, d.name.toUpperCase()));
    var row = el('div', 'row');
    row.appendChild(petIcon(d.art, 64));
    var info = el('div');
    info.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:3px';
    info.appendChild(el('div', 'hsub', d.desc));
    row.appendChild(info);
    p.appendChild(row);

    var st = G.petStats(d, rec.tier);
    function line(a, b) {
      var r = el('div', 'stat');
      r.appendChild(el('span', null, a));
      r.appendChild(el('b', null, b));
      p.appendChild(r);
    }
    line('Vai', d.role);
    line('Bám chủ', G.PET_FOLLOW[d.bam]);
    line('Luật ngắm', G.PET_AIM[d.ngam]);
    if (d.nhip) {
      line('Sát thương', st.dmg.toFixed(1));
      line('Nhịp đánh', d.nhip.toFixed(2).replace('.', ',') + ' giây');
      line('Tầm đánh', d.range + ' px');
    }
    line('Máu', Math.round(st.hp));
    p.appendChild(el('div', 'hr'));
    var t3 = el('div', 'hsub', 'Bậc 3 — ' + d.t3);
    t3.style.color = rec.tier >= 3 ? '#7dff9a' : '#8a7f9c';
    p.appendChild(t3);
    var t5 = el('div', 'hsub', 'Bậc 5 — ' + d.t5);
    t5.style.color = rec.tier >= 5 ? '#7dff9a' : '#8a7f9c';
    p.appendChild(t5);
    p.appendChild(el('div', 'hsub', 'Tiến hoá: ' + d.evo.name + ' — cần bậc 5 và ' + d.evo.need + '.'));

    if (rec.tier < 5) {
      var c = G.PET_UP_COST[rec.tier];
      var ok = (s.frag[d.id] || 0) >= c.frag && s.gold >= c.gold;
      var b = btn('LÊN BẬC ' + (rec.tier + 1), c.frag + ' mảnh · ' + c.gold + ' vàng',
        ok ? 'primary wide' : 'wide', function () {
          if (G.Meta.upgradePet(d.id)) { root.removeChild(m); render(); }
        });
      if (!ok) b.setAttribute('disabled', '');
      p.appendChild(b);
    }
    var inTeam = s.team.indexOf(d.id) >= 0;
    p.appendChild(btn(inTeam ? 'BỎ KHỎI ĐỘI' : 'ĐƯA VÀO ĐỘI', null, 'ghost wide', function () {
      if (inTeam) s.team = s.team.filter(function (x) { return x !== d.id; });
      else if (s.team.length < 6) s.team.push(d.id);
      G.Meta.save();
      root.removeChild(m); render();
    }));
    p.appendChild(btn('ĐÓNG', null, 'ghost wide', function () { root.removeChild(m); }));
    m.appendChild(p);
    root.appendChild(m);
  }

  // ---------------------------------------------------------------- TRANG BỊ

  function screenDo(s) {
    var sc = el('div', 'scroll');
    sc.appendChild(el('div', 'htitle', 'TRANG BỊ'));

    // Hình nhân vật to ở giữa — mặc gì vào là thấy ngay trên người.
    var stage = el('div');
    stage.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;' +
      'padding:10px;background:linear-gradient(#1a1426,#0e0a16);' +
      'border:2px solid #3c2e52;border-radius:10px';
    var slotsL = el('div');
    slotsL.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    var slotsR = el('div');
    slotsR.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    var dollBox = el('div');
    dollBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
    dollBox.appendChild(doll(112, 0));
    var st = G.Meta.stats();
    var sum = el('div');
    sum.style.cssText = 'font-size:9px;color:#9ad8ff;text-align:center;line-height:1.4';
    sum.textContent = 'máu ' + Math.round(st.hp) + ' · giáp ' + Math.round(st.armor * 100) +
      '% · đào ' + Math.round(st.minePower) + ' · đèn ' + Math.round(st.light);
    dollBox.appendChild(sum);

    G.EQ_SLOTS.forEach(function (sl, i) {
      var id = s.eq[sl.id];
      var c = el('div', 'card');
      c.style.cssText = 'min-height:52px;width:52px;padding:4px;gap:2px';
      c.appendChild(icon(id ? G.eqIcon(id) : sl.icon, 26));
      var nm = el('div', 'cname', id ? '+' + s.inv[id].lv : sl.name);
      nm.style.fontSize = '9px';
      c.appendChild(nm);
      if (!id) c.style.opacity = '.5';
      c.onclick = function () { slotPicker(sl); };
      (i < 3 ? slotsL : slotsR).appendChild(c);
    });

    stage.appendChild(slotsL);
    stage.appendChild(dollBox);
    stage.appendChild(slotsR);
    sc.appendChild(stage);
    sc.appendChild(el('div', 'hsub',
      'Mũ, áo, quần đổi luôn hình nhân vật. Cuốc quyết định đào nhanh hay chậm và đào nổi đá cứng hay không. Đèn quyết định bạn thấy được bao xa.'));

    sc.appendChild(el('div', 'hr'));
    sc.appendChild(el('div', 'htitle', 'KHO ĐỒ'));
    var grid = el('div', 'grid c4');
    var ids = Object.keys(s.inv);
    ids.sort();
    ids.forEach(function (id) {
      var d = G.EQ_ALL[id];
      if (!d) return;
      var rare = d.armorSet
        ? G.EQ_SETS.filter(function (x) { return x.id === d.set; })[0].rare : d.rare;
      var c = el('div', 'card r' + rare +
        (s.eq[d.slot] === id ? ' sel' : ''));
      c.style.minHeight = '74px';
      c.appendChild(icon(G.eqIcon(id), 28));
      var nm = el('div', 'cname', d.name.split(' — ')[0]);
      nm.style.fontSize = '9px';
      c.appendChild(nm);
      c.appendChild(el('div', 'lv', '+' + s.inv[id].lv));
      c.onclick = function () { G.Meta.equip(d.slot, id); render(); };
      grid.appendChild(c);
    });
    sc.appendChild(grid);
    return sc;
  }

  function slotPicker(sl) {
    var s = G.Meta.s;
    var m = el('div', 'modal');
    var p = el('div', 'panel');
    p.appendChild(el('h3', null, sl.name.toUpperCase()));
    var sc = el('div', 'scroll');
    sc.style.maxHeight = '48vh';
    var grid = el('div', 'grid c3');
    var found = 0;
    Object.keys(s.inv).forEach(function (id) {
      var d = G.EQ_ALL[id];
      if (!d || d.slot !== sl.id) return;
      found++;
      var rare = d.armorSet
        ? G.EQ_SETS.filter(function (x) { return x.id === d.set; })[0].rare : d.rare;
      var c = el('div', 'card r' + rare + (s.eq[sl.id] === id ? ' sel' : ''));
      c.style.minHeight = '84px';
      c.appendChild(icon(G.eqIcon(id), 28));
      var nm = el('div', 'cname', d.name.split(' — ')[0]);
      nm.style.fontSize = '9px';
      c.appendChild(nm);
      c.appendChild(el('div', 'lv', '+' + s.inv[id].lv));
      c.onclick = function () { G.Meta.equip(sl.id, id); root.removeChild(m); render(); };
      grid.appendChild(c);
    });
    if (!found) sc.appendChild(el('div', 'hsub', 'Chưa có món nào cho ô này. Quay ở Quầy.'));
    sc.appendChild(grid);
    p.appendChild(sc);
    p.appendChild(btn('ĐÓNG', null, 'ghost wide', function () { root.removeChild(m); }));
    m.appendChild(p);
    root.appendChild(m);
  }

  // ---------------------------------------------------------------- QUẦY

  function screenQuay(s) {
    var sc = el('div', 'scroll');
    sc.appendChild(el('div', 'htitle', 'QUẦY'));
    sc.appendChild(el('div', 'hsub',
      'Quay trúng thứ đã có thì thành mảnh (linh thú) hoặc lên cấp món (trang bị) — không có lần quay nào là vứt đi.'));

    ['pet', 'gear'].forEach(function (bid) {
      var b = G.Meta.BANNERS[bid];
      var card = el('div', 'card');
      card.style.cssText = 'min-height:0;padding:12px;gap:8px;margin-bottom:10px;' +
        'border-color:#7a5c2c;background:linear-gradient(#2a2038,#16101f)';
      var head = el('div', 'row');
      head.appendChild(icon(b.icon, 44));
      var ht = el('div');
      ht.style.cssText = 'flex:1;text-align:left';
      var h = el('div', null, b.name);
      h.style.cssText = 'font-size:15px;color:#ffd98a;letter-spacing:2px';
      ht.appendChild(h);
      ht.appendChild(el('div', 'hsub', b.pity));
      head.appendChild(ht);
      card.appendChild(head);

      var rates = el('div');
      rates.style.cssText = 'display:flex;gap:5px;width:100%;justify-content:center;flex-wrap:wrap';
      var tot = b.table.reduce(function (a, x) { return a + x[0]; }, 0);
      b.table.forEach(function (t) {
        var r = G.EQ_RARE[t[1] - 1];
        var chip = el('div', null, r.name + ' ' + (t[0] / tot * 100).toFixed(0) + '%');
        chip.style.cssText = 'font-size:9px;padding:3px 7px;border-radius:4px;' +
          'border:1px solid ' + r.col + ';color:' + r.col;
        rates.appendChild(chip);
      });
      card.appendChild(rates);

      var row = el('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%';
      row.appendChild(btn('QUAY 1', b.one + ' ngọc',
        s.gem >= b.one ? 'primary' : '', function () { doPull(bid, 1); }));
      row.appendChild(btn('QUAY 10', b.ten + ' ngọc',
        s.gem >= b.ten ? 'primary' : '', function () { doPull(bid, 10); }));
      card.appendChild(row);
      sc.appendChild(card);
    });

    sc.appendChild(el('div', 'hr'));
    var st = s.stats;
    sc.appendChild(el('div', 'hsub',
      'Đã chơi ' + st.runs + ' ván · thoát được ' + st.wins + ' · hạ ' + st.kills +
      ' con · đào ' + st.dug + ' vỉa quặng.'));
    return sc;
  }

  function doPull(bid, n) {
    var out = G.Meta.pull(bid, n);
    if (!out) { flash('Không đủ ngọc'); return; }
    var m = el('div', 'modal');
    var p = el('div', 'panel');
    p.appendChild(el('h3', null, 'KẾT QUẢ'));
    var grid = el('div', 'grid ' + (n === 1 ? 'c2' : 'c4'));
    out.forEach(function (r) {
      var c = el('div', 'card r' + r.rare);
      c.style.minHeight = '92px';
      c.appendChild(r.kind === 'pet' ? petIcon(r.art, 38) : icon(r.icon, 30));
      var nm = el('div', 'cname', r.name.split(' — ')[0]);
      nm.style.fontSize = '9px';
      c.appendChild(nm);
      var tag = el('div', null, r.dup
        ? (r.kind === 'pet' ? '+' + r.frag + ' mảnh' : 'nâng +' + r.lv)
        : 'MỚI!');
      tag.style.cssText = 'font-size:9px;color:' + (r.dup ? '#8a7f9c' : '#7dff9a');
      c.appendChild(tag);
      grid.appendChild(c);
    });
    p.appendChild(grid);
    p.appendChild(btn('XONG', null, 'primary wide', function () { root.removeChild(m); render(); }));
    m.appendChild(p);
    root.appendChild(m);
  }

  function flash(msg) {
    var d = el('div');
    d.style.cssText = 'position:absolute;left:50%;top:26%;transform:translateX(-50%);' +
      'background:rgba(10,8,14,.9);border:2px solid #7a5c2c;border-radius:8px;' +
      'padding:10px 18px;font-size:13px;color:#ffd98a;z-index:99';
    d.textContent = msg;
    root.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 1300);
  }

  // ---------------------------------------------------------------- lên cấp

  function levelUp(cards, cb) {
    clear();
    var sh = el('div', 'screen sheet');
    var h = el('div', 'htitle', 'LÊN CẤP');
    h.style.textAlign = 'center';
    sh.appendChild(h);
    sh.appendChild(el('div', 'hsub', 'Chọn một.'));
    var box = el('div');
    box.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:10px;justify-content:center';
    cards.forEach(function (cd) {
      var c = el('div', 'card');
      c.style.cssText = 'flex-direction:row;align-items:center;gap:12px;padding:12px;' +
        'min-height:92px;text-align:left;' +
        (cd.big ? 'border-color:#ffce7a;box-shadow:0 0 18px #ff9a3c44' : '');
      c.appendChild(cd.art ? petIcon(cd.art, 52) : icon(cd.icon || 152, 44));
      var t = el('div');
      t.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:3px';
      var tag = el('div', null, cd.role || '');
      tag.style.cssText = 'font-size:9px;color:#9ad8ff;letter-spacing:1px';
      t.appendChild(tag);
      var nm = el('div', null, cd.name);
      nm.style.cssText = 'font-size:14px;color:#ffd98a';
      t.appendChild(nm);
      cd.lines.forEach(function (l) {
        var d = el('div', null, l);
        d.style.cssText = 'font-size:10px;color:#d8ccec;line-height:1.35';
        t.appendChild(d);
      });
      if (cd.txt) {
        var d2 = el('div', null, cd.txt);
        d2.style.cssText = 'font-size:9px;color:#8a7f9c;line-height:1.3';
        t.appendChild(d2);
      }
      c.appendChild(t);
      c.onclick = function () { hideAll(); cb(cd); };
      box.appendChild(c);
    });
    sh.appendChild(box);
    root.appendChild(sh);
  }

  // ---------------------------------------------------------------- kết ván

  function results(res, reward) {
    clear();
    var sh = el('div', 'screen sheet');
    var h = el('div', 'htitle', res.won ? 'THOÁT ĐƯỢC' : 'THẤT BẠI');
    h.style.cssText += ';text-align:center;color:' + (res.won ? '#7dff9a' : '#ff7a5a');
    sh.appendChild(h);
    var why = el('div', 'hsub', res.why);
    why.style.textAlign = 'center';
    sh.appendChild(why);

    var sc = el('div', 'scroll');
    var box = el('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:10px;' +
      'background:#150f1f;border:2px solid #3c2e52;border-radius:8px';
    function row(a, b, col) {
      var r = el('div', 'stat');
      r.appendChild(el('span', null, a));
      var v = el('b', null, b);
      if (col) v.style.color = col;
      r.appendChild(v);
      box.appendChild(r);
    }
    row('Hạ được', res.kills + ' con');
    var dug = 0;
    for (var k in res.carry) dug += res.carry[k];
    row('Đào được', dug + ' vỉa');
    box.appendChild(el('div', 'hr'));
    row('Vàng', '+' + reward.gold, '#ffd98a');
    row('Ngọc', '+' + reward.gem, '#8ad8ff');
    sc.appendChild(box);

    var oreGrid = el('div', 'grid c4');
    oreGrid.style.marginTop = '8px';
    for (var o in res.carry) {
      var d = G.ORE[o];
      if (!d) continue;
      var c = el('div', 'card');
      c.style.minHeight = '64px';
      c.appendChild(icon(d.icon, 24));
      var nm = el('div', 'cname', d.name);
      nm.style.fontSize = '9px';
      c.appendChild(nm);
      var q = el('div', null, 'x' + res.carry[o]);
      q.style.cssText = 'font-size:11px;color:' + d.col;
      c.appendChild(q);
      oreGrid.appendChild(c);
    }
    sc.appendChild(oreGrid);

    if (reward.frags && Object.keys(reward.frags).length) {
      sc.appendChild(el('div', 'hsub', 'Mảnh linh thú (chỉ rơi cho con mang theo):'));
      var fg = el('div', 'grid c3');
      for (var pid in reward.frags) {
        var pd = G.PET[pid];
        var pc = el('div', 'card');
        pc.style.minHeight = '68px';
        pc.appendChild(petIcon(pd.art, 32));
        var pn = el('div', 'cname', '+' + reward.frags[pid]);
        pn.style.cssText = 'font-size:11px;color:#7dff9a';
        pc.appendChild(pn);
        fg.appendChild(pc);
      }
      sc.appendChild(fg);
    }
    if (reward.unlocked) {
      var u = el('div', 'hsub', '★ MỞ HANG MỚI: ' + reward.unlocked.name);
      u.style.cssText += ';color:#ffd98a;font-size:14px;text-align:center';
      sc.appendChild(u);
    }
    sh.appendChild(sc);
    sh.appendChild(btn('VỀ TRẠM', null, 'primary wide', function () {
      game.state = 'menu';
      game.world = null;
      tab = 'hang';
      render();
    }));
    root.appendChild(sh);
  }

  // ---------------------------------------------------------------- khung

  function render() {
    clear();
    var s = G.Meta.s;
    var sh = el('div', 'screen');
    sh.appendChild(wallet());
    var body = tab === 'hang' ? screenHang(s)
             : tab === 'thu' ? screenThu(s)
             : tab === 'do' ? screenDo(s)
             : screenQuay(s);
    sh.appendChild(body);
    if (tab === 'hang') {
      sh.appendChild(btn('XUỐNG HANG', 'ải mới nhất', 'primary wide', function () {
        // Nút to nhất màn hình đi thẳng vào ải mới nhất — người chơi quay lại
        // sau một ngày không phải nhớ mình đang ở đâu.
        var best = null, bl = 0;
        for (var b in s.stage) { if (s.stage[b] >= bl) { bl = s.stage[b]; best = b; } }
        game.startRun(best || 'dirt', bl || 1);
      }));
    }
    sh.appendChild(tabs());
    root.appendChild(sh);
  }

  function hideAll() { clear(); }

  G.Screens = {
    init: function (g) { game = g; root = document.getElementById('ui'); },
    home: function () { tab = 'hang'; render(); },
    render: render,
    hideAll: hideAll,
    levelUp: levelUp,
    results: results,
    doll: doll,
    icon: icon
  };
})(window.DC = window.DC || {});
