/*
 * pokeui.js - every Pokemon screen: the party, the full stat sheet, the work
 * orders, the battle, the box, the dex, and the three machines on Đảo Nghiên
 * Cứu that let a player finish a Pokemon rather than just catch one.
 *
 * The stat sheet is the important one and it is deliberately NOT simplified.
 * It shows IVs as numbers, EVs as numbers with the 510 budget spent so far,
 * the nature's exact +10/-10, gender, shininess, happiness, the growth curve
 * and experience to the next level. All of it is real - poke.js is doing
 * Generation 3 arithmetic underneath - and showing it is what makes the
 * difference between a collectible and a thing you can work on.
 *
 * The battle screen plays the engine's EVENT LIST back one entry at a time on
 * a timer rather than resolving instantly, because a turn that happens all at
 * once is unreadable. The engine itself is in pokebattle.js and does not know
 * this file exists.
 */
(function (global) {
  'use strict';

  var UI = global.ISL_UI;
  var PK = global.ISL_POKE;
  var PA = global.ISL_POKEART;
  var PW = global.ISL_POKEWORK;
  var IA = global.ISL_ITEMART;

  function el(t, c, x) { return UI.el(t, c, x); }
  function btn(l, f, c) { return UI.btn(l, f, c); }

  /* The Pokemon atlas is loaded lazily - it is 916 KB and not wanted until the
   * player owns something. That means the FIRST panel to ask for a sprite gets
   * an empty canvas: `PA.icon` draws nothing and returns, and nothing ever
   * repaints it. Every panel that shows sprites therefore registers a one-shot
   * repaint for when the atlas lands. Without it the very first time a player
   * opens their party they see a list of names with blank squares beside them,
   * and it is fixed by closing and reopening - which is exactly the kind of
   * bug that never reproduces for the person who wrote it. */
  function repaintWhenArtLoads(paint, body) {
    if (PA.ready()) return;
    PA.load(function () {
      if (body && body.parentNode) paint(body);
    });
  }

  // ------------------------------------------------------------------ party
  function openParty(g) {
    UI.panel('Đội Pokémon', function (b) { paint(b); },
             { sub: g.sim.party.length + '/6' });
    function paint(b) {
      b.innerHTML = '';
      repaintWhenArtLoads(paint, b);
      if (!g.sim.party.length) {
        b.appendChild(el('div', 'isl-hint',
          'Bạn chưa có Pokémon nào. Mở Đảo Cỏ Xanh để bắt con đầu tiên.'));
        return;
      }
      var m = el('div', 'isl-menu');
      g.sim.party.forEach(function (p, i) {
        m.appendChild(partyRow(g, p, i, function () { paint(b); }));
      });
      b.appendChild(m);

      var jobs = PW.partySkills(g.sim.party);
      b.appendChild(el('div', 'isl-sub', 'SAI VIỆC — không tốn thể lực của bạn'));
      if (!jobs.length) {
        b.appendChild(el('div', 'isl-hint',
          'Đội hiện tại chưa làm được việc nào. Hệ của Pokémon quyết định việc nó làm được.'));
      } else {
        var jm = el('div', 'isl-menu');
        jobs.forEach(function (row) {
          var r = el('button', 'isl-mbtn isl-inline');
          r.appendChild(PA.icon(row.poke, 30));
          var t = el('div');
          t.appendChild(el('div', null, row.skill.name +
            '  ·  ' + row.skill.cost + ' sức'));
          t.appendChild(el('div', 'isl-cost', row.ok
            ? PK.nameOf(row.poke) + ' — ' + row.skill.desc
            : row.why));
          r.appendChild(t);
          if (!row.ok) r.className += ' isl-off';
          r.onclick = function () {
            if (!row.ok) { g.toast(row.why); return; }
            if (row.skill.picker === 'island') { islandPicker(g, row); return; }
            var res = PW.cast(g, row.poke, row.skill.id);
            g.toast(res.msg);
            paint(b);
          };
          jm.appendChild(r);
        });
        b.appendChild(jm);
      }
      b.appendChild(el('div', 'isl-hint',
        'Sức làm hồi lại mỗi khi bạn NGỦ. Pokémon càng mạnh và càng quý bạn thì càng làm được nhiều.'));
    }
  }

  function partyRow(g, p, i, repaint) {
    var r = el('button', 'isl-mbtn isl-inline');
    r.appendChild(PA.icon(p, 40));
    var t = el('div', 'isl-grow');
    var head = el('div', 'isl-mrow');
    head.appendChild(el('b', null, PK.nameOf(p) + (p.shiny ? ' ✨' : '')));
    head.appendChild(el('span', 'isl-cost',
      'Cv' + p.lv + '  ' + PK.genderSymbol(p.gender)));
    t.appendChild(head);
    var bar = el('div', 'isl-hpbar');
    var fill = el('i');
    var pct = p.hp / p.stats[0];
    fill.style.width = Math.round(pct * 100) + '%';
    fill.style.background = pct > 0.5 ? '#5fa855' : pct > 0.2 ? '#e8c33c' : '#c0453b';
    bar.appendChild(fill);
    t.appendChild(bar);
    var line = el('div', 'isl-cost',
      p.hp + '/' + p.stats[0] + ' HP' +
      (p.status ? '  · ' + (STATUS_VN[p.status] || p.status) : '') +
      (p.conf > 0 ? '  · Lú lẫn' : '') +
      '  ·  sức làm ' + PK.workLeft(p) + '/' + PK.maxWork(p));
    t.appendChild(line);
    var types = el('div', 'isl-types');
    PK.mon(p.id).t.forEach(function (ty) {
      var c = el('span', 'isl-type', PK.typeName(ty));
      c.style.background = PK.typeColour(ty);
      types.appendChild(c);
    });
    t.appendChild(types);
    r.appendChild(t);
    r.onclick = function () { openSummary(g, p, i, repaint); };
    return r;
  }
  var STATUS_VN = { par: 'Tê liệt', brn: 'Bỏng', psn: 'Độc', tox: 'Độc nặng',
                    slp: 'Ngủ', frz: 'Đóng băng' };

  // ---------------------------------------------------------------- summary
  function openSummary(g, p, index, repaint) {
    if (global.ISL_TUTORIAL) global.ISL_TUTORIAL.fire('firstPokeSummary');
    UI.panel(PK.nameOf(p), function (b) { paint(b); },
             { sub: '#' + String(p.id).padStart(3, '0') });
    function paint(b) {
      b.innerHTML = '';
      repaintWhenArtLoads(paint, b);
      var sp = PK.mon(p.id);

      var top = el('div', 'isl-inforow');
      var big = document.createElement('canvas');
      big.width = 80; big.height = 80;
      big.className = 'isl-pokebig';
      PA.drawInto(big.getContext('2d'), p, 0, 0, 80);
      top.appendChild(big);
      var meta = el('div', 'isl-grow');
      meta.appendChild(el('div', 'isl-big2',
        PK.nameOf(p) + (p.shiny ? '  ✨' : '') + '  ' + PK.genderSymbol(p.gender)));
      var ty = el('div', 'isl-types');
      sp.t.forEach(function (t) {
        var c = el('span', 'isl-type', PK.typeName(t));
        c.style.background = PK.typeColour(t);
        ty.appendChild(c);
      });
      meta.appendChild(ty);
      meta.appendChild(el('div', 'isl-cost',
        'Cấp ' + p.lv + '  ·  ' + PK.natureName(p.nature) + ' (' + PK.natureText(p.nature) + ')'));
      meta.appendChild(el('div', 'isl-cost',
        'Thân thiết: ' + PK.happyText(p.happy) + ' (' + p.happy + ')'));
      top.appendChild(meta);
      b.appendChild(top);

      // exp
      var need = PK.expAt(sp.gr, p.lv + 1), have = PK.expAt(sp.gr, p.lv);
      var xbar = el('div', 'isl-bar2');
      var xf = el('i');
      xf.style.width = p.lv >= 100 ? '100%'
        : Math.round((p.exp - have) / Math.max(1, need - have) * 100) + '%';
      xbar.appendChild(xf);
      b.appendChild(el('div', 'isl-cost', p.lv >= 100 ? 'Đã tối đa cấp'
        : 'Còn ' + (need - p.exp).toLocaleString('vi') + ' EXP nữa lên cấp'));
      b.appendChild(xbar);

      // stats table
      b.appendChild(el('div', 'isl-sub', 'CHỈ SỐ'));
      var evTotal = p.ev.reduce(function (a, c) { return a + c; }, 0);
      var tbl = el('div', 'isl-stattbl');
      var head = el('div', 'isl-statrow isl-stathead');
      ['', 'Tổng', 'Gốc', 'Cá thể', 'Nỗ lực'].forEach(function (h) {
        head.appendChild(el('span', null, h));
      });
      tbl.appendChild(head);
      for (var i = 0; i < 6; i++) {
        var row = el('div', 'isl-statrow');
        var nm = el('span', 'isl-statname', PK.STAT_SHORT[i]);
        var mod = PK.natureMod(p.nature, i);
        if (mod > 1) nm.className += ' isl-up';
        if (mod < 1) nm.className += ' isl-down';
        row.appendChild(nm);
        row.appendChild(el('b', null, p.stats[i]));
        row.appendChild(el('span', null, sp.b[i]));
        var iv = el('span', null, p.iv[i]);
        if (p.iv[i] === 31) iv.className = 'isl-perfect';
        row.appendChild(iv);
        row.appendChild(el('span', null, p.ev[i]));
        tbl.appendChild(row);
      }
      b.appendChild(tbl);
      b.appendChild(el('div', 'isl-cost',
        'Nỗ lực đã dùng ' + evTotal + '/510  ·  ' + PK.ivTotalText(p)));

      // moves
      b.appendChild(el('div', 'isl-sub', 'CHIÊU THỨC'));
      var mm = el('div', 'isl-menu');
      p.moves.forEach(function (m) {
        var mv = PK.move(m.id);
        var r = el('div', 'isl-mbtn');
        var h = el('div', 'isl-mrow');
        h.appendChild(el('b', null, mv ? mv.n : '?'));
        var tt = el('span', 'isl-type', mv ? PK.typeName(mv.t) : '');
        if (mv) tt.style.background = PK.typeColour(mv.t);
        h.appendChild(tt);
        r.appendChild(h);
        r.appendChild(el('div', 'isl-cost',
          (mv && mv.p ? 'Sức mạnh ' + mv.p + ' · ' : 'Hỗ trợ · ') +
          (mv && mv.a ? 'Chính xác ' + mv.a + '% · ' : '') +
          'PP ' + m.pp + '/' + m.ppMax));
        mm.appendChild(r);
      });
      b.appendChild(mm);

      // provenance
      b.appendChild(el('div', 'isl-sub', 'HỒ SƠ'));
      var prov = [];
      prov.push('Bắt bằng ' + (p.ball || 'Poké Ball'));
      if (p.caught) {
        var isl = global.ISL_ISLANDS.byId(p.caught.island);
        prov.push('tại ' + (isl ? isl.name : p.caught.island));
      }
      prov.push('Huấn luyện viên: ' + (p.ot || 'Bạn'));
      prov.push('Đường lên cấp: ' + CURVE_VN[PK.mon(p.id).gr]);
      b.appendChild(el('div', 'isl-hint', prov.join('\n')));

      // actions
      var act = el('div', 'isl-menu');
      var jobs = PW.skillsFor(p);
      if (jobs.length) {
        act.appendChild(el('div', 'isl-sub', 'VIỆC CON NÀY LÀM ĐƯỢC'));
        jobs.forEach(function (j) {
          var r = el('button', 'isl-mbtn');
          r.appendChild(el('div', null, j.skill.name + '  ·  ' + j.skill.cost + ' sức'));
          r.appendChild(el('div', 'isl-cost', j.ok ? j.skill.desc : j.why));
          if (!j.ok) r.className += ' isl-off';
          r.onclick = function () {
            if (!j.ok) { g.toast(j.why); return; }
            if (j.skill.picker === 'island') { islandPicker(g, { poke: p, skill: j.skill }); return; }
            var res = PW.cast(g, p, j.skill.id);
            g.toast(res.msg);
            paint(b);
          };
          act.appendChild(r);
        });
      }
      act.appendChild(btn('Đổi tên', function () {
        var n = prompt('Tên mới cho ' + PK.nameOf(p), p.nick || PK.speciesName(p.id));
        if (n != null) { p.nick = n.trim().slice(0, 12) || null; paint(b); if (repaint) repaint(); }
      }));
      if (index > 0) {
        act.appendChild(btn('Đưa lên đầu đội', function () {
          g.sim.party.splice(index, 1);
          g.sim.party.unshift(p);
          UI.close(); if (repaint) repaint();
        }));
      }
      act.appendChild(btn('Gửi vào tủ', function () {
        var i2 = g.sim.party.indexOf(p);
        if (g.sim.party.length <= 1) { g.toast('Phải giữ ít nhất một con trong đội.'); return; }
        g.sim.party.splice(i2, 1);
        g.sim.boxes.push(p);
        UI.close(); if (repaint) repaint();
        g.toast(PK.nameOf(p) + ' đã vào tủ.');
      }));
      b.appendChild(act);
    }
  }
  var CURVE_VN = ['Chậm', 'Trung bình', 'Nhanh', 'Trung bình chậm',
                  'Thất thường', 'Dao động'];

  function islandPicker(g, row) {
    UI.panel('Bay tới đảo nào?', function (b) {
      var m = el('div', 'isl-menu');
      (g.area().islands || []).forEach(function (rec) {
        if (!rec.owned) return;
        m.appendChild(btn(rec.isl.name, function () {
          var res = PW.cast(g, row.poke, row.skill.id, rec);
          g.toast(res.msg);
          UI.closeAll();
        }));
      });
      b.appendChild(m);
    });
  }

  // ------------------------------------------------------------------ battle
  /* The engine hands back a list of events; this plays them one every 520ms so
   * the fight is readable. Buttons are disabled while the queue drains, which
   * is also what stops a double-tap resolving two turns. */
  function openBattle(g, battle) {
    PA.load(function () { start(); });
    var body = null, scene = null, log = null, actions = null;
    var queue = [], playing = false;
    /* WHY onClose: this panel is built with the generic UI.panel(), which
     * always adds a ✕. Only the "Xong" button called g.endBattle(), so tapping
     * the ✕ (or Escape) removed the last panel while game.battle stayed set -
     * and Game.busy() is `paused || modal > 0 || !!this.battle`. The stick,
     * the action button, the clock, encounters and sleep were all dead for the
     * rest of the session, with nothing on screen to close. endBattle is safe
     * to call twice; it nulls this.battle first and returns. */
    UI.panel('Gặp Pokémon hoang', function (b) {
      body = b;
      b.className += ' isl-battle';
      scene = document.createElement('canvas');
      scene.className = 'isl-scene';
      scene.width = 320; scene.height = 150;
      b.appendChild(scene);
      log = el('div', 'isl-log');
      b.appendChild(log);
      actions = el('div', 'isl-actions2');
      b.appendChild(actions);
      start();
    }, {
      onClose: function () {
        /* Leaving an unfinished fight is running away: no reward, and the
         * wild Pokémon keeps whatever damage it took. A fight already decided
         * still pays out, so closing on the victory screen is not a loss. */
        if (!battle.over) battle.result = battle.result || 'fled';
        g.endBattle();
      }
    });

    function start() {
      if (!body) return;
      queue = queue.concat(battle.drain());
      drawScene();
      pump();
    }

    function pump() {
      if (playing) return;
      if (!queue.length) { drawScene(); showActions(); return; }
      playing = true;
      var e = queue.shift();
      apply(e);
      drawScene();
      setTimeout(function () { playing = false; pump(); }, e.t === 'msg' ? 620 : 340);
    }

    function apply(e) {
      if (e.t === 'msg') say(e.text);
      else if (e.t === 'end') finish(e);
      else if (e.t === 'evolve') queueEvolve(e);
      else if (e.t === 'learnFull') queueLearn(e);
      else if (e.t === 'throw') say(null);
    }

    function say(text) {
      if (!text) return;
      var line = el('div', 'isl-logline', text);
      log.appendChild(line);
      while (log.childNodes.length > 40) log.removeChild(log.firstChild);
      log.scrollTop = log.scrollHeight;
    }

    function drawScene() {
      var x = scene.getContext('2d');
      x.imageSmoothingEnabled = false;
      var grd = x.createLinearGradient(0, 0, 0, scene.height);
      grd.addColorStop(0, '#8fd0e8'); grd.addColorStop(1, '#cfe9a8');
      x.fillStyle = grd;
      x.fillRect(0, 0, scene.width, scene.height);
      // platforms
      x.fillStyle = 'rgba(80,140,60,.45)';
      x.beginPath(); x.ellipse(235, 78, 52, 13, 0, 0, 6.284); x.fill();
      x.beginPath(); x.ellipse(80, 132, 60, 15, 0, 0, 6.284); x.fill();

      var wild = battle.wild;
      PA.drawStanding(x, wild, 235, 82, 1.15, false);
      hpBox(x, 8, 8, wild, true);
      var you = battle.you;
      if (you) {
        PA.drawStanding(x, you, 80, 136, 1.35, true);
        hpBox(x, 168, 92, you, false);
      }
      if (wild.shiny) {
        x.fillStyle = '#ffe680';
        for (var i = 0; i < 5; i++) {
          var a = (g.time / 400 + i) % 6.283;
          x.fillRect(235 + Math.cos(a) * 40, 50 + Math.sin(a) * 22, 2, 2);
        }
      }
    }

    function hpBox(x, bx, by, p, wild) {
      x.fillStyle = 'rgba(24,28,36,.85)';
      x.fillRect(bx, by, 144, wild ? 34 : 42);
      x.strokeStyle = '#c9924a'; x.lineWidth = 1;
      x.strokeRect(bx + .5, by + .5, 143, (wild ? 34 : 42) - 1);
      x.fillStyle = '#f4ecd8';
      x.font = 'bold 10px system-ui,sans-serif';
      x.fillText(PK.nameOf(p) + (p.shiny ? ' *' : '') + '  ' + PK.genderSymbol(p.gender),
                 bx + 6, by + 14);
      x.font = '9px system-ui,sans-serif';
      x.fillText('Cv' + p.lv, bx + 116, by + 14);
      var pct = Math.max(0, p.hp / p.stats[0]);
      x.fillStyle = '#3a4450'; x.fillRect(bx + 6, by + 19, 132, 6);
      x.fillStyle = pct > 0.5 ? '#5fa855' : pct > 0.2 ? '#e8c33c' : '#c0453b';
      x.fillRect(bx + 6, by + 19, 132 * pct, 6);
      if (!wild) {
        x.fillStyle = '#f4ecd8';
        x.fillText(p.hp + '/' + p.stats[0], bx + 6, by + 36);
      }
      if (p.status) {
        x.fillStyle = '#e8a13c';
        x.fillRect(bx + 96, by + 27, 42, 11);
        x.fillStyle = '#241a10';
        x.fillText(STATUS_VN[p.status] || p.status, bx + 99, by + 36);
      }
    }

    function showActions() {
      actions.innerHTML = '';
      if (battle.over) {
        actions.appendChild(btn('Xong', function () {
          UI.closeAll();
          g.endBattle();
        }, 'isl-mbtn isl-primary'));
        return;
      }
      var row = el('div', 'isl-arow');
      row.appendChild(btn('ĐÁNH', function () { moveMenu(); }, 'isl-abtn'));
      row.appendChild(btn('BÓNG', function () { ballMenu(); }, 'isl-abtn'));
      row.appendChild(btn('TÚI', function () { itemMenu(); }, 'isl-abtn'));
      row.appendChild(btn('ĐỔI', function () { swapMenu(); }, 'isl-abtn'));
      row.appendChild(btn('CHẠY', function () { act({ kind: 'run' }); }, 'isl-abtn'));
      actions.appendChild(row);
      var chance = Math.round(PK.catchChance(battle.wild, 'Poké Ball',
        { turn: battle.turn + 1, night: g.sim.isNight() }) * 100);
      actions.appendChild(el('div', 'isl-cost',
        'Cơ hội bắt bằng Bóng Thường lúc này: ~' + chance + '%'));
    }

    function act(a) {
      queue = queue.concat(battle.act(a));
      actions.innerHTML = '';
      pump();
    }

    function moveMenu() {
      actions.innerHTML = '';
      var m = el('div', 'isl-menu');
      battle.you.moves.forEach(function (mv, i) {
        var d = PK.move(mv.id);
        var eff = d && d.p ? PK.effect(d.t, PK.mon(battle.wild.id).t) : 1;
        var r = el('button', 'isl-mbtn');
        var h = el('div', 'isl-mrow');
        h.appendChild(el('b', null, d ? d.n : '?'));
        var tt = el('span', 'isl-type', d ? PK.typeName(d.t) : '');
        if (d) tt.style.background = PK.typeColour(d.t);
        h.appendChild(tt);
        r.appendChild(h);
        r.appendChild(el('div', 'isl-cost',
          'PP ' + mv.pp + '/' + mv.ppMax +
          (d && d.p ? '  ·  Sức mạnh ' + d.p : '  ·  Hỗ trợ') +
          (d && d.p ? '  ·  ' + (PK.effectText(eff) || 'Bình thường') : '')));
        if (mv.pp <= 0) r.className += ' isl-off';
        r.onclick = function () { if (mv.pp > 0) act({ kind: 'move', slot: i }); };
        m.appendChild(r);
      });
      m.appendChild(btn('← Quay lại', function () { showActions(); }));
      actions.appendChild(m);
    }

    function ballMenu() {
      actions.innerHTML = '';
      var m = el('div', 'isl-menu');
      var any = false;
      for (var name in PK.BALLS) {
        (function (nm) {
          var have = g.sim.count(nm);
          if (!have) return;
          any = true;
          var pct = Math.round(PK.catchChance(battle.wild, nm,
            { turn: battle.turn + 1, night: g.sim.isNight() }) * 100);
          var r = el('button', 'isl-mbtn isl-inline');
          r.appendChild(IA.icon(nm, 26));
          var t = el('div');
          t.appendChild(el('div', null, nm + '  ×' + have));
          t.appendChild(el('div', 'isl-cost', '~' + pct + '% bắt được' +
            (PK.BALLS[nm].note ? '  ·  ' + PK.BALLS[nm].note : '')));
          r.appendChild(t);
          r.onclick = function () { act({ kind: 'ball', ball: nm }); };
          m.appendChild(r);
        })(name);
      }
      if (!any) m.appendChild(el('div', 'isl-hint', 'Bạn không còn quả bóng nào.'));
      m.appendChild(btn('← Quay lại', function () { showActions(); }));
      actions.appendChild(m);
    }

    function itemMenu() {
      actions.innerHTML = '';
      var m = el('div', 'isl-menu');
      var any = false;
      for (var name in global.ISL_POKEITEMS.ITEMS) {
        (function (nm) {
          if (g.sim.count(nm) <= 0) return;
          any = true;
          m.appendChild(btn(nm + ' ×' + g.sim.count(nm), function () {
            act({ kind: 'item', item: nm });
          }));
        })(name);
      }
      if (!any) m.appendChild(el('div', 'isl-hint', 'Không có thuốc nào.'));
      m.appendChild(btn('← Quay lại', function () { showActions(); }));
      actions.appendChild(m);
    }

    function swapMenu() {
      actions.innerHTML = '';
      var m = el('div', 'isl-menu');
      g.sim.party.forEach(function (p, i) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(PA.icon(p, 28));
        var t = el('div');
        t.appendChild(el('div', null, PK.nameOf(p) + ' Cv' + p.lv));
        t.appendChild(el('div', 'isl-cost', p.hp + '/' + p.stats[0] + ' HP'));
        r.appendChild(t);
        if (p.hp <= 0 || p === battle.you) r.className += ' isl-off';
        r.onclick = function () {
          if (p.hp > 0 && p !== battle.you) act({ kind: 'switch', index: i });
        };
        m.appendChild(r);
      });
      m.appendChild(btn('← Quay lại', function () { showActions(); }));
      actions.appendChild(m);
    }

    function queueEvolve(e) {
      var into = e.into;
      setTimeout(function () {
        UI.panel('Tiến hoá!', function (b) {
          b.appendChild(el('div', 'isl-say',
            PK.nameOf(e.poke) + ' đang toả sáng...'));
          var c = document.createElement('canvas');
          c.width = 96; c.height = 96; c.className = 'isl-pokebig';
          PA.drawInto(c.getContext('2d'), e.poke, 0, 0, 96);
          b.appendChild(c);
          var m = el('div', 'isl-menu');
          m.appendChild(btn('Cho tiến hoá', function () {
            var was = PK.speciesName(e.poke.id);
            PK.evolve(e.poke, into);
            g.sim.dexCatch(into);
            g.toast(was + ' đã tiến hoá thành ' + PK.speciesName(into) + '!');
            UI.close();
          }, 'isl-mbtn isl-primary'));
          m.appendChild(btn('Khoan đã', function () { UI.close(); }));
          b.appendChild(m);
        });
      }, 400);
    }

    function queueLearn(e) {
      var mv = PK.move(e.move);
      setTimeout(function () {
        UI.panel(PK.nameOf(e.poke) + ' muốn học ' + mv.n, function (b) {
          b.appendChild(el('div', 'isl-say',
            'Nhưng nó đã biết bốn chiêu. Bỏ chiêu nào?'));
          var m = el('div', 'isl-menu');
          e.poke.moves.forEach(function (old, i) {
            var od = PK.move(old.id);
            m.appendChild(btn('Quên ' + (od ? od.n : '?'), function () {
              PK.replaceMove(e.poke, i, e.move);
              g.toast(PK.nameOf(e.poke) + ' học được ' + mv.n + '!');
              UI.close();
            }));
          });
          m.appendChild(btn('Không học', function () { UI.close(); }));
          b.appendChild(m);
        });
      }, 400);
    }

    function finish(e) {
      if (e.result === 'caught') g.sim.dexCatch(e.wild.id);
    }
  }

  // -------------------------------------------------------------------- box
  function openBox(g) {
    UI.panel('Tủ gửi Pokémon', function (b) { paint(b); },
             { sub: g.sim.boxes.length + ' con' });
    function paint(b) {
      b.innerHTML = '';
      repaintWhenArtLoads(paint, b);
      b.appendChild(el('div', 'isl-sub', 'ĐỘI (' + g.sim.party.length + '/6)'));
      var pm = el('div', 'isl-boxgrid');
      g.sim.party.forEach(function (p) {
        pm.appendChild(boxCell(g, p, function () {
          if (g.sim.party.length <= 1) { g.toast('Phải giữ ít nhất một con.'); return; }
          g.sim.party.splice(g.sim.party.indexOf(p), 1);
          g.sim.boxes.push(p);
          paint(b);
        }));
      });
      b.appendChild(pm);
      b.appendChild(el('div', 'isl-sub', 'TRONG TỦ'));
      if (!g.sim.boxes.length) {
        b.appendChild(el('div', 'isl-hint', 'Tủ trống.'));
        return;
      }
      var bm = el('div', 'isl-boxgrid');
      g.sim.boxes.forEach(function (p) {
        bm.appendChild(boxCell(g, p, function () {
          if (g.sim.party.length >= 6) { g.toast('Đội đã đủ 6 con.'); return; }
          g.sim.boxes.splice(g.sim.boxes.indexOf(p), 1);
          g.sim.party.push(p);
          paint(b);
        }));
      });
      b.appendChild(bm);
      b.appendChild(el('div', 'isl-hint', 'Chạm để chuyển giữa đội và tủ.'));
    }
  }
  function boxCell(g, p, fn) {
    var c = el('button', 'isl-boxcell');
    c.appendChild(PA.icon(p, 44));
    c.appendChild(el('span', null, PK.nameOf(p)));
    c.appendChild(el('i', null, 'Cv' + p.lv + (p.shiny ? ' ✨' : '')));
    c.onclick = fn;
    return c;
  }

  // -------------------------------------------------------------------- dex
  function openDex(g) {
    UI.panel('Pokédex', function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      repaintWhenArtLoads(paint, b);
      b.appendChild(el('div', 'isl-big', g.sim.pokeCaught + ' / 151'));
      b.appendChild(el('div', 'isl-sub',
        'Đã thấy ' + g.sim.pokeSeen + '  ·  Đã bắt ' + g.sim.pokeCaught));
      var grid = el('div', 'isl-dexgrid');
      for (var i = 1; i <= 151; i++) {
        (function (id) {
          var flag = g.sim.dex[id] || 0;
          var cell = el('button', 'isl-dexcell');
          if (flag & 2) cell.appendChild(PA.icon({ id: id, shiny: false }, 36));
          else if (flag & 1) cell.appendChild(PA.silhouette(id, 36));
          else cell.appendChild(el('span', 'isl-dexq', '?'));
          cell.appendChild(el('i', null, String(id).padStart(3, '0')));
          if (flag) {
            cell.onclick = function () { dexEntry(g, id, flag); };
          } else cell.className += ' isl-off';
          grid.appendChild(cell);
        })(i);
      }
      b.appendChild(grid);
    }
  }

  function dexEntry(g, id, flag) {
    var sp = PK.mon(id);
    UI.panel(sp.n, function (b) {
      var c = document.createElement('canvas');
      c.width = 80; c.height = 80; c.className = 'isl-pokebig';
      if (flag & 2) PA.drawInto(c.getContext('2d'), { id: id, shiny: false }, 0, 0, 80);
      else c.getContext('2d').drawImage(PA.silhouette(id, 80), 0, 0);
      b.appendChild(c);
      var ty = el('div', 'isl-types');
      sp.t.forEach(function (t) {
        var s = el('span', 'isl-type', PK.typeName(t));
        s.style.background = PK.typeColour(t);
        ty.appendChild(s);
      });
      b.appendChild(ty);
      if (!(flag & 2)) {
        b.appendChild(el('div', 'isl-hint', 'Bạn mới chỉ nhìn thấy loài này.'));
        return;
      }
      b.appendChild(el('div', 'isl-sub', 'CHỈ SỐ GỐC'));
      var tbl = el('div', 'isl-stattbl');
      for (var i = 0; i < 6; i++) {
        var r = el('div', 'isl-statrow');
        r.appendChild(el('span', 'isl-statname', PK.STAT_SHORT[i]));
        r.appendChild(el('b', null, sp.b[i]));
        var bar = el('div', 'isl-bar2');
        var f = el('i');
        f.style.width = Math.min(100, sp.b[i] / 1.8) + '%';
        bar.appendChild(f);
        r.appendChild(bar);
        tbl.appendChild(r);
      }
      b.appendChild(tbl);
      b.appendChild(el('div', 'isl-hint',
        'Cao ' + (sp.ht / 10).toFixed(1) + 'm  ·  Nặng ' + (sp.wt / 10).toFixed(1) + 'kg\n' +
        'Độ khó bắt: ' + sp.c + '/255  ·  ' + (sp.lg ? 'HUYỀN THOẠI' : 'Thường')));
      // where it lives
      var where = [];
      (global.ISL_ISLANDS.list || []).forEach(function (isl) {
        (isl.enc || []).forEach(function (row) {
          if (row[0] === id && row[1] && where.indexOf(isl.name) < 0) where.push(isl.name);
        });
      });
      if (where.length) {
        b.appendChild(el('div', 'isl-sub', 'GẶP Ở'));
        var chips = el('div', 'isl-chips');
        where.forEach(function (w) { chips.appendChild(el('span', 'isl-chip', w)); });
        b.appendChild(chips);
      }
    });
  }

  // ------------------------------------------------------------ lab machines
  function pickPoke(g, title, fn, filter) {
    var pool = g.sim.party.concat(g.sim.boxes).filter(filter || function () { return true; });
    if (!pool.length) { g.toast('Không có Pokémon phù hợp.'); return; }
    UI.panel(title, function (b) { paint(b); });
    function paint(b) {
      b.innerHTML = '';
      repaintWhenArtLoads(paint, b);
      var m = el('div', 'isl-menu');
      pool.forEach(function (p) {
        var r = el('button', 'isl-mbtn isl-inline');
        r.appendChild(PA.icon(p, 30));
        var t = el('div');
        t.appendChild(el('div', null, PK.nameOf(p) + '  Cv' + p.lv));
        t.appendChild(el('div', 'isl-cost', PK.natureName(p.nature)));
        r.appendChild(t);
        r.onclick = function () { UI.close(); fn(p); };
        m.appendChild(r);
      });
      b.appendChild(m);
    }
  }

  function openJudge(g) {
    pickPoke(g, 'Soi cá thể con nào?', function (p) {
      UI.panel('Kết quả soi — ' + PK.nameOf(p), function (b) {
        b.appendChild(el('div', 'isl-say', PK.ivTotalText(p) + '.'));
        var best = PK.bestIv(p);
        b.appendChild(el('div', 'isl-tip',
          'Nổi trội nhất: ' + PK.STAT_VN[best.stat] + ' — ' + PK.ivStatText(best.value)));
        var tbl = el('div', 'isl-stattbl');
        for (var i = 0; i < 6; i++) {
          var r = el('div', 'isl-statrow');
          r.appendChild(el('span', 'isl-statname', PK.STAT_SHORT[i]));
          r.appendChild(el('b', null, p.iv[i] + '/31'));
          r.appendChild(el('span', null, PK.ivStatText(p.iv[i])));
          var bar = el('div', 'isl-bar2');
          var f = el('i'); f.style.width = (p.iv[i] / 31 * 100) + '%';
          bar.appendChild(f); r.appendChild(bar);
          tbl.appendChild(r);
        }
        b.appendChild(tbl);
        b.appendChild(el('div', 'isl-hint',
          'Cá thể là bẩm sinh và không đổi được. Muốn con hoàn hảo thì phải bắt lại con khác.'));
      });
    });
  }

  var EV_PRICE = 4000;
  function openEvTrainer(g) {
    pickPoke(g, 'Luyện nỗ lực cho con nào?', function (p) {
      UI.panel('Luyện nỗ lực — ' + PK.nameOf(p), function (b) { paint(b); });
      function paint(b) {
        b.innerHTML = '';
        var total = p.ev.reduce(function (a, c) { return a + c; }, 0);
        b.appendChild(el('div', 'isl-big', total + ' / 510'));
        b.appendChild(el('div', 'isl-sub',
          'Mỗi lượt luyện +20 nỗ lực vào một chỉ số. ' + EV_PRICE.toLocaleString('vi') + 'v.'));
        var m = el('div', 'isl-menu');
        for (var i = 0; i < 6; i++) {
          (function (idx) {
            var room = Math.min(255 - p.ev[idx], 510 - total);
            var r = el('button', 'isl-mbtn');
            var h = el('div', 'isl-mrow');
            h.appendChild(el('b', null, PK.STAT_VN[idx]));
            h.appendChild(el('span', 'isl-cost', p.ev[idx] + '/255'));
            r.appendChild(h);
            var bar = el('div', 'isl-bar2');
            var f = el('i'); f.style.width = (p.ev[idx] / 255 * 100) + '%';
            bar.appendChild(f); r.appendChild(bar);
            if (room <= 0) {
              r.className += ' isl-off';
              r.appendChild(el('div', 'isl-cost',
                total >= 510 ? 'Đã dùng hết 510 điểm' : 'Chỉ số này đã tối đa'));
            }
            r.onclick = function () {
              if (room <= 0) return;
              if (!g.sim.spendGold(EV_PRICE)) { g.toast('Không đủ vàng.'); return; }
              var add = Math.min(20, room);
              p.ev[idx] += add;
              PK.recalc(p);
              g.toast('+' + add + ' nỗ lực ' + PK.STAT_VN[idx] + '.');
              paint(b);
            };
            m.appendChild(r);
          })(i);
        }
        b.appendChild(m);
        b.appendChild(el('div', 'isl-hint',
          'Bốn điểm nỗ lực đổi được một điểm chỉ số ở cấp 100. Tổng tối đa 510, mỗi chỉ số tối đa 255.'));
      }
    });
  }

  var MINT_PRICE = 12000;
  function openMint(g) {
    pickPoke(g, 'Đổi tính cách con nào?', function (p) {
      UI.panel('Bạc hà tính cách', function (b) {
        b.appendChild(el('div', 'isl-say',
          PK.nameOf(p) + ' đang là ' + PK.natureName(p.nature) +
          ' (' + PK.natureText(p.nature) + ').'));
        b.appendChild(el('div', 'isl-sub',
          'Mỗi lá bạc hà ' + MINT_PRICE.toLocaleString('vi') + 'v.'));
        var m = el('div', 'isl-menu');
        for (var i = 0; i < 25; i++) {
          (function (id) {
            var r = el('button', 'isl-mbtn');
            var h = el('div', 'isl-mrow');
            h.appendChild(el('b', null, PK.natureName(id)));
            h.appendChild(el('span', 'isl-cost', PK.natureText(id)));
            r.appendChild(h);
            if (id === p.nature) r.className += ' isl-off';
            r.onclick = function () {
              if (id === p.nature) return;
              if (!g.sim.spendGold(MINT_PRICE)) { g.toast('Không đủ vàng.'); return; }
              /* Change the PID, not a separate field: nature is READ from the
               * PID everywhere, and a second source of truth is how a saved
               * Pokemon comes back with the nature it used to have. But the
               * PID is ALSO where gender and shininess come from, and nudging
               * it by hand broke both - a minted shiny looked shiny for the
               * rest of the session and came back plain on the next load.
               * mintNature searches for a PID that keeps all three. */
              PK.mintNature(p, id, g.sim.tid, g.sim.sid);
              g.toast(PK.nameOf(p) + ' giờ là ' + PK.natureName(id) + '.');
              UI.close();
            };
            m.appendChild(r);
          })(i);
        }
        b.appendChild(m);
      });
    });
  }

  function useItemOn(g, itemName) {
    pickPoke(g, 'Dùng ' + itemName + ' cho ai?', function (p) {
      /* Check possession BEFORE applying the effect. ISL_POKEITEMS.use only
       * asks whether the effect is legal for that Pokémon - the battle path
       * checks the bag separately and this one did not, so any stale button
       * still pointing at a consumed item worked forever. take() on an empty
       * bag just returns false, which nothing looked at. */
      if (g.sim.count(itemName) < 1) { g.toast('Bạn không còn ' + itemName + '.'); return; }
      var r = global.ISL_POKEITEMS.use(itemName, p, null);
      if (!r.ok) { g.toast(r.msg); return; }
      g.sim.take(itemName, 1);
      g.toast(r.msg);
      if (r.evolved) g.sim.dexCatch(r.evolved);
    });
  }

  global.ISL_POKEUI = {
    openParty: openParty, openSummary: openSummary, openBattle: openBattle,
    openBox: openBox, openDex: openDex, openJudge: openJudge,
    openEvTrainer: openEvTrainer, openMint: openMint, useItemOn: useItemOn,
    STATUS_VN: STATUS_VN
  };
})(window);
