/*
 * Ca Trực Đêm: Biệt Đội — toàn bộ màn hình ngoài trận: sảnh, chọn map, biệt đội,
 * trang bị, tiến hoá, gacha, cửa hàng, nhiệm vụ — và HUD trong trận.
 *
 * WHY: menu là DOM chứ không vẽ lên canvas, để chữ tiếng Việt luôn có dấu đúng.
 * ROOT-CAUSE: memory os-font-empty-in-browser — hỏi hệ điều hành lấy font trong
 *      WebGL trả về rỗng và mọi dấu tiếng Việt bị rụng. DOM thì trình duyệt lo.
 */
(function (root) {
  'use strict';
  const SQ = root.SQ;
  const UI = SQ.ui = {};
  const $ = sel => document.querySelector(sel);
  const money = SQ.money;

  function el(tag, cls, html) {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
  function btn(label, cls, fn) {
    const b = el('button', 'b ' + (cls || ''), label);
    on(b, 'click', e => { e.preventDefault(); fn(e); });
    return b;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  let screenName = 'home';
  let sel = { char: null, slot: null, item: null, banner: 'char', questTab: 'daily' };
  let toastT = 0;

  UI.toast = function (text, good) {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'toast show' + (good ? ' good' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'toast'; }, 2200);
  };

  // ---------------------------------------------------------------------------
  UI.go = function (name) {
    screenName = name;
    UI.render();
  };
  UI.current = () => screenName;

  UI.render = function () {
    const M = SQ.M;
    const wrap = $('#menu');
    if (!wrap) return;
    clear(wrap);

    // ví tiền — luôn hiện
    const bar = el('div', 'wallet');
    SQ.WALLET_KEYS.forEach(k => {
      const c = el('span', 'w', '<i>' + SQ.WALLET_ICON[k] + '</i>' + money(M[k] || 0));
      c.title = SQ.WALLET_LABEL[k];
      bar.appendChild(c);
    });
    wrap.appendChild(bar);

    const body = el('div', 'screen-body');
    wrap.appendChild(body);

    if (screenName !== 'home') {
      const back = btn('← Về sảnh', 'ghost small back', () => UI.go('home'));
      body.appendChild(back);
    }

    ({
      home: scrHome, maps: scrMaps, squad: scrSquad, equip: scrEquip,
      evol: scrEvol, gacha: scrGacha, shop: scrShop, quest: scrQuest
    }[screenName] || scrHome)(body);
  };

  // ---------------------------------------------------------------------------
  // SẢNH
  // ---------------------------------------------------------------------------
  function scrHome(b) {
    const list = SQ.squadList();
    const power = SQ.squadPower();

    const head = el('div', 'hero');
    head.appendChild(el('div', 'hero-t', 'Ca Trực Đêm: <b>Biệt Đội</b>'));
    head.appendChild(el('div', 'hero-p', 'Một người cầm lái, bốn cái xác đi theo. Khuân cho đủ chỉ tiêu rồi ra.'));
    const pw = el('div', 'power', '⚡ Lực chiến <b>' + money(power) + '</b>');
    head.appendChild(pw);
    b.appendChild(head);

    const strip = el('div', 'squad-strip');
    list.forEach(m => strip.appendChild(charCard(m.id, m.player, m.tactic, () => UI.go('squad'))));
    for (let i = list.length; i < 5; i++) {
      const e = el('div', 'cc empty', '<div class="cc-plus">+</div><div class="cc-n">trống</div>');
      on(e, 'click', () => UI.go('squad'));
      strip.appendChild(e);
    }
    b.appendChild(strip);

    const go = btn('▶ ĐI CA', 'big', () => UI.go('maps'));
    b.appendChild(go);

    const q = SQ.questList();
    const pending = q.daily.concat(q.weekly, q.ach).filter(x => x.done && !x.claimed).length;

    const grid = el('div', 'menu-grid');
    [
      ['squad', '👥', 'Biệt Đội', 'Xếp tổ, đổi chiến thuật'],
      ['equip', '🎒', 'Trang Bị', 'Lắp đồ cho từng xác'],
      ['evol', '🧬', 'Tiến Hoá', 'Nâng chỉ số cho cả tổ'],
      ['gacha', '🎰', 'Gacha', 'Quay xác và trang bị'],
      ['shop', '🏪', 'Cửa Hàng', 'Nạp ngọc, đổi vàng'],
      ['quest', '📜', 'Nhiệm Vụ', pending ? pending + ' phần chưa nhận' : 'Ngày / tuần / thành tựu']
    ].forEach(([id, icon, name, sub]) => {
      const c = el('div', 'mtile', '<div class="mi">' + icon + '</div><div class="mn">' + name + '</div><div class="ms">' + sub + '</div>');
      if (id === 'quest' && pending) c.appendChild(el('span', 'dot', String(pending)));
      on(c, 'click', () => UI.go(id));
      grid.appendChild(c);
    });
    b.appendChild(grid);

    const foot = el('div', 'foot-note');
    foot.appendChild(el('span', '', 'Tiến độ lưu ngay trên máy bạn.'));
    const rs = btn('Xoá dữ liệu', 'ghost tiny', () => {
      if (!confirm('Xoá sạch tài khoản trong game này? Không lấy lại được.')) return;
      SQ.hardReset(); UI.go('home'); UI.toast('Đã xoá. Bắt đầu lại.');
    });
    foot.appendChild(rs);
    b.appendChild(foot);
  }

  function charCard(id, isLead, tacticId, fn) {
    const c = SQ.CHAR_BY_ID[id];
    const own = SQ.M.chars[id];
    const st = SQ.charStats(id, tacticId);
    const r = SQ.RARITY[c.star];
    const d = el('div', 'cc s' + c.star);
    d.style.setProperty('--hue', c.hue);
    d.innerHTML =
      '<div class="cc-face"><span class="cc-emo">' + faceOf(c) + '</span></div>' +
      '<div class="cc-n">' + c.name + '</div>' +
      '<div class="cc-s">' + '★'.repeat(c.star) + ' · Lv' + (own ? own.lv : 1) + '</div>' +
      (isLead ? '<div class="cc-tag lead">BẠN CẦM</div>'
              : '<div class="cc-tag">' + (tacticId ? SQ.TACTIC_BY_ID[tacticId].icon + ' ' + SQ.TACTIC_BY_ID[tacticId].name : '—') + '</div>') +
      '<div class="cc-p">⚡' + money(st ? st.power : 0) + '</div>';
    d.style.borderColor = r.color;
    if (fn) on(d, 'click', fn);
    return d;
  }
  function faceOf(c) {
    return { bao: '🔦', hue: '💉', tam: '💪', ky: '🔑', linh: '🌑', dung: '🔨', mai: '🔔',
             phuc: '🚑', son: '🧱', nga: '⚡', khoi: '👁️', van: '❄️', hai: '🧲', tuyet: '🕊️' }[c.id] || '🙂';
  }

  // ---------------------------------------------------------------------------
  // CHỌN MAP LỚN
  // ---------------------------------------------------------------------------
  function scrMaps(b) {
    b.appendChild(el('h2', '', 'Map lớn'));
    b.appendChild(el('p', 'hint', 'Mỗi map có số tầng cố định. Hết tầng cuối là phá đảo — không có vòng lặp vô tận. Thua giữa chừng vẫn giữ phần đã giao.'));
    const power = SQ.squadPower();

    SQ.MAPS.forEach(m => {
      const st = SQ.M.maps[m.id];
      const unlocked = SQ.mapUnlocked(m.id);
      const row = el('div', 'map' + (unlocked ? '' : ' locked') + (st.cleared ? ' done' : ''));
      row.innerHTML =
        '<div class="map-h"><b>' + m.name + '</b><span class="map-f">' + m.floors + ' tầng</span></div>' +
        '<div class="map-d">' + m.desc + '</div>' +
        '<div class="map-s">' +
          '<span class="' + (power >= m.power ? 'ok' : 'bad') + '">⚡ khuyên ' + money(m.power) + '</span>' +
          '<span>Chỉ tiêu tầng 1: ' + money(m.quotaBase) + '</span>' +
          '<span>Quái: ' + m.foes.map(f => SQ.FOES[f].name).join(', ') + '</span>' +
        '</div>' +
        '<div class="map-r">Phá đảo: ' + rewardText(m.clear) + (st.cleared ? '' : ' · <b>Lần đầu:</b> ' + rewardText(m.first)) + '</div>';
      if (st.cleared) row.appendChild(el('div', 'map-badge', '✔ ĐÃ PHÁ ĐẢO'));
      else if (st.floor > 0) row.appendChild(el('div', 'map-badge dim', 'Xa nhất: tầng ' + st.floor));

      if (unlocked) {
        row.appendChild(btn('Vào ca', '', () => SQ.game.enter(m.id)));
      } else {
        row.appendChild(el('div', 'lockmsg', '🔒 Phá đảo map trước để mở'));
      }
      b.appendChild(row);
    });
  }
  function rewardText(r) {
    if (!r) return '—';
    return Object.keys(r).map(k => SQ.WALLET_ICON[k] + money(r[k])).join(' ');
  }

  // ---------------------------------------------------------------------------
  // BIỆT ĐỘI
  // ---------------------------------------------------------------------------
  function scrSquad(b) {
    b.appendChild(el('h2', '', 'Biệt đội'));
    b.appendChild(el('p', 'hint', 'Ô đầu là xác BẠN cầm — kỹ năng của nó nằm dưới nút bấm trong trận. Bốn ô còn lại là bot; mỗi bot chạy theo chiến thuật bạn giao.'));

    const M = SQ.M;
    const slots = el('div', 'slot-row');
    slots.appendChild(slotBox('lead', M.squad.lead, true));
    M.squad.mates.forEach((id, i) => slots.appendChild(slotBox(i, id, false)));
    b.appendChild(slots);

    if (sel.char && M.chars[sel.char]) b.appendChild(charDetail(sel.char));

    b.appendChild(el('h3', '', 'Xác đang có (' + Object.keys(M.chars).length + '/' + SQ.CHARS.length + ')'));
    const grid = el('div', 'char-grid');
    SQ.CHARS.forEach(c => {
      if (!M.chars[c.id]) return;
      const inSquad = M.squad.lead === c.id || M.squad.mates.indexOf(c.id) >= 0;
      const card = charCard(c.id, M.squad.lead === c.id, M.tactics[c.id], () => { sel.char = c.id; UI.render(); });
      if (inSquad) card.classList.add('in');
      if (sel.char === c.id) card.classList.add('sel');
      grid.appendChild(card);
    });
    b.appendChild(grid);

    const missing = SQ.CHARS.filter(c => !M.chars[c.id]);
    if (missing.length) {
      b.appendChild(el('h3', '', 'Chưa có (' + missing.length + ')'));
      const g2 = el('div', 'char-grid dimmed');
      missing.forEach(c => {
        const d = el('div', 'cc s' + c.star + ' unknown');
        d.innerHTML = '<div class="cc-face"><span class="cc-emo">' + faceOf(c) + '</span></div>' +
          '<div class="cc-n">' + c.name + '</div><div class="cc-s">' + '★'.repeat(c.star) + '</div>' +
          '<div class="cc-tag">' + c.skill.name + '</div>';
        d.style.borderColor = SQ.RARITY[c.star].color;
        on(d, 'click', () => { UI.toast('Chưa sở hữu — quay ở Gacha Xác.'); });
        g2.appendChild(d);
      });
      b.appendChild(g2);
    }

    function slotBox(which, id, isLead) {
      const box = el('div', 'slot' + (id ? '' : ' empty') + (isLead ? ' lead' : ''));
      const label = isLead ? 'BẠN CẦM' : 'BOT ' + (which + 1);
      box.appendChild(el('div', 'slot-l', label));
      if (id) {
        const c = SQ.CHAR_BY_ID[id];
        box.appendChild(el('div', 'slot-f', faceOf(c)));
        box.appendChild(el('div', 'slot-n', c.name));
        if (!isLead) {
          const t = SQ.M.tactics[id] || 'loot';
          const s = el('select', 'tac');
          SQ.TACTICS.forEach(tt => {
            const o = el('option', '', tt.icon + ' ' + tt.name);
            o.value = tt.id;
            if (tt.id === t) o.selected = true;
            s.appendChild(o);
          });
          on(s, 'change', () => { SQ.setTactic(id, s.value); UI.render(); });
          box.appendChild(s);
          box.appendChild(el('div', 'tac-d', SQ.TACTIC_BY_ID[t].desc));
        } else {
          box.appendChild(el('div', 'tac-d', SQ.CHAR_BY_ID[id].skill.name + ' — ' + SQ.CHAR_BY_ID[id].skill.desc));
        }
        const acts = el('div', 'slot-acts');
        if (sel.char && sel.char !== id) {
          acts.appendChild(btn('Đặt vào đây', 'tiny', () => {
            if (isLead) SQ.setLead(sel.char); else SQ.setMate(which, sel.char);
            UI.render();
          }));
        }
        if (!isLead) acts.appendChild(btn('Bỏ ra', 'tiny ghost', () => { SQ.setMate(which, null); UI.render(); }));
        box.appendChild(acts);
      } else {
        box.appendChild(el('div', 'slot-f dim', '＋'));
        if (sel.char) box.appendChild(btn('Đặt vào đây', 'tiny', () => { SQ.setMate(which, sel.char); UI.render(); }));
        else box.appendChild(el('div', 'tac-d', 'Chọn một xác bên dưới rồi bấm vào đây.'));
      }
      return box;
    }
  }

  function charDetail(id) {
    const c = SQ.CHAR_BY_ID[id], own = SQ.M.chars[id];
    const st = SQ.charStats(id, SQ.M.tactics[id]);
    const d = el('div', 'detail');
    const needShard = SQ.charShardCost(own.lv);
    const cost = SQ.charLevelCost(own.lv);
    d.innerHTML =
      '<div class="det-h"><b>' + c.name + '</b> · ' + c.epithet + ' <span class="stars">' + '★'.repeat(c.star) + '</span></div>' +
      '<div class="det-sk"><b>' + c.skill.name + '</b> — ' + c.skill.desc + '<br><span class="dim">Hồi chiêu ' + c.skill.cd + 's (còn ' + (c.skill.cd * (1 - st.cd)).toFixed(1) + 's sau giảm hồi chiêu)</span></div>' +
      '<div class="det-sk"><b>Nội tại: ' + c.passive.name + '</b> — ' + c.passive.desc + '</div>' +
      '<div class="stat-grid">' +
        statCell('Máu', Math.round(st.hp)) + statCell('Sát thương', st.atk.toFixed(1)) +
        statCell('Tốc chạy', (st.spd * 100).toFixed(0) + '%') + statCell('Sức mang', st.carry.toFixed(0) + 'kg') +
        statCell('Giảm hồi chiêu', (st.cd * 100).toFixed(0) + '%') + statCell('Giáp', (st.grit * 100).toFixed(0) + '%') +
        statCell('Tầm nhìn', (st.eye * 100).toFixed(0) + '%') + statCell('Giá đồ', (st.luck * 100).toFixed(0) + '%') +
      '</div>' +
      '<div class="det-lv">Cấp ' + own.lv + '/' + SQ.CHAR_MAX_LV + ' · Mảnh ' + own.shard + '/' + needShard + ' · ' + SQ.WALLET_ICON.gold + money(cost.gold) + '</div>';
    const row = el('div', 'row');
    row.appendChild(btn('Lên cấp', '', () => {
      const r = SQ.levelUpChar(id);
      UI.toast(r.ok ? c.name + ' lên cấp ' + r.lv : r.why, r.ok);
      UI.render();
    }));
    row.appendChild(btn('Lắp đồ cho xác này', 'ghost', () => { sel.char = id; UI.go('equip'); }));
    d.appendChild(row);
    return d;
  }
  function statCell(k, v) { return '<div class="sc"><span>' + k + '</span><b>' + v + '</b></div>'; }

  // ---------------------------------------------------------------------------
  // TRANG BỊ — chọn xác trước, rồi lắp sáu ô.
  // ---------------------------------------------------------------------------
  function scrEquip(b) {
    const M = SQ.M;
    if (!sel.char || !M.chars[sel.char]) sel.char = M.squad.lead;
    b.appendChild(el('h2', '', 'Trang bị'));
    b.appendChild(el('p', 'hint', 'Chọn xác, rồi lắp đủ sáu ô. Đủ 2 hoặc 4 món cùng bộ thì có thưởng bộ.'));

    const pickRow = el('div', 'char-strip');
    Object.keys(M.chars).forEach(id => {
      const c = SQ.CHAR_BY_ID[id];
      const t = el('div', 'chip' + (sel.char === id ? ' on' : ''), faceOf(c) + ' ' + c.name);
      t.style.borderColor = SQ.RARITY[c.star].color;
      on(t, 'click', () => { sel.char = id; sel.item = null; UI.render(); });
      pickRow.appendChild(t);
    });
    b.appendChild(pickRow);

    const own = M.chars[sel.char];
    const st = SQ.charStats(sel.char, M.tactics[sel.char]);
    b.appendChild(el('div', 'eq-power', '⚡ Lực chiến xác này: <b>' + money(st.power) + '</b>'));

    const slots = el('div', 'eq-slots');
    SQ.SLOTS.forEach(s => {
      const instId = own.equip && own.equip[s.id];
      const it = instId ? SQ.itemById(instId) : null;
      const box = el('div', 'eqs' + (it ? ' has s' + it.star : ''));
      box.innerHTML = '<div class="eqs-i">' + s.icon + '</div><div class="eqs-n">' + s.name + '</div>' +
        (it ? '<div class="eqs-t">' + it.name + '</div><div class="eqs-v">+' + SQ.fmtStat(it.main, SQ.mainValue(it)).slice(1) + ' ' + SQ.STATS[it.main].short + '</div><div class="eqs-l">Lv' + it.lv + '</div>'
            : '<div class="eqs-t dim">trống</div>');
      if (it) box.style.borderColor = SQ.RARITY[it.star].color;
      on(box, 'click', () => { sel.slot = s.id; sel.item = instId || null; UI.render(); });
      slots.appendChild(box);
    });
    b.appendChild(slots);

    // thưởng bộ đang có
    if (st.sets.length) {
      const sb = el('div', 'setbox');
      st.sets.forEach(s => {
        const def = SQ.SET_BY_ID[s.id];
        sb.appendChild(el('div', 'setline', '<b>' + def.name + ' ' + s.n + ' món</b> — ' + (s.n === 2 ? def.d2 : def.d4)));
      });
      b.appendChild(sb);
    }

    if (sel.slot) {
      b.appendChild(el('h3', '', 'Kho ' + SQ.SLOT_BY_ID[sel.slot].name + ' (' + SQ.M.inv.filter(i => i.slot === sel.slot).length + ')'));
      if (sel.item) {
        const it = SQ.itemById(sel.item);
        if (it) b.appendChild(itemDetail(it));
      }
      const list = el('div', 'inv-grid');
      const items = M.inv.filter(i => i.slot === sel.slot)
        .sort((a, z) => (z.star - a.star) || (z.lv - a.lv));
      if (!items.length) list.appendChild(el('div', 'hint', 'Chưa có món nào ở ô này — quay Gacha Trang Bị.'));
      items.forEach(it => {
        const wearer = SQ.equippedBy(it.id);
        const card = el('div', 'inv s' + it.star + (sel.item === it.id ? ' sel' : ''));
        card.style.borderColor = SQ.RARITY[it.star].color;
        card.innerHTML =
          '<div class="inv-h">' + SQ.SLOT_BY_ID[it.slot].icon + ' <b>' + it.name + '</b></div>' +
          '<div class="inv-s">' + '★'.repeat(it.star) + ' · Lv' + it.lv + ' · ' + SQ.SET_BY_ID[it.set].name + '</div>' +
          '<div class="inv-m">' + SQ.STATS[it.main].name + ' ' + SQ.fmtStat(it.main, SQ.mainValue(it)) + '</div>' +
          '<div class="inv-sub">' + it.subs.filter(s => s.on).map(s => SQ.STATS[s.k].short + ' ' + SQ.fmtStat(s.k, s.v)).join(' · ') + '</div>' +
          (wearer ? '<div class="inv-w">đang đeo: ' + SQ.CHAR_BY_ID[wearer].name + '</div>' : '');
        on(card, 'click', () => { sel.item = it.id; UI.render(); });
        list.appendChild(card);
      });
      b.appendChild(list);
    }
  }

  function itemDetail(it) {
    const d = el('div', 'detail');
    const cost = SQ.upgradeCost(it);
    const wearer = SQ.equippedBy(it.id);
    d.innerHTML =
      '<div class="det-h"><b>' + it.name + '</b> <span class="stars">' + '★'.repeat(it.star) + '</span> · Lv' + it.lv + '/' + SQ.EQUIP_MAX_LV + '</div>' +
      '<div class="det-sk">' + SQ.STATS[it.main].name + ' <b>' + SQ.fmtStat(it.main, SQ.mainValue(it)) + '</b> · Bộ ' + SQ.SET_BY_ID[it.set].name + '</div>' +
      '<div class="subs">' + it.subs.map(s =>
        '<div class="sub' + (s.on ? '' : ' off') + '">' + SQ.STATS[s.k].name + ' ' + (s.on ? SQ.fmtStat(s.k, s.v) : '<span class="dim">khoá</span>') + '</div>').join('') + '</div>' +
      '<div class="det-lv">Nâng cấp: ' + SQ.WALLET_ICON.gold + money(cost.gold) + ' + ' + SQ.WALLET_ICON.core + cost.core +
        ' · mở thêm dòng phụ ở cấp ' + SQ.SUB_UNLOCK_AT.join(', ') + '</div>';
    const row = el('div', 'row');
    row.appendChild(btn('Nâng cấp', '', () => {
      const r = SQ.upgradeItem(it.id);
      if (!r.ok) return UI.toast(r.why);
      UI.toast('Lên Lv' + r.lv + (r.unlocked ? ' · ' + SQ.STATS[r.unlocked.k].name + ' ' + SQ.fmtStat(r.unlocked.k, r.unlocked.v) : ''), true);
      UI.render();
    }));
    row.appendChild(btn('Nâng tối đa', 'ghost', () => {
      let n = 0;
      while (SQ.upgradeItem(it.id).ok) n++;
      UI.toast(n ? 'Nâng ' + n + ' cấp.' : 'Không đủ tài nguyên.', n > 0);
      UI.render();
    }));
    if (wearer === sel.char) {
      row.appendChild(btn('Tháo ra', 'ghost', () => { SQ.unequip(sel.char, it.slot); UI.render(); }));
    } else {
      row.appendChild(btn('Lắp cho ' + SQ.CHAR_BY_ID[sel.char].name, '', () => {
        SQ.equipItem(sel.char, it.id); UI.toast('Đã lắp.', true); UI.render();
      }));
    }
    row.appendChild(btn(it.lock ? '🔒 Bỏ khoá' : '🔓 Khoá', 'ghost tiny', () => { it.lock = !it.lock; SQ.save(); UI.render(); }));
    row.appendChild(btn('Phân rã', 'ghost tiny danger', () => {
      const r = SQ.dismantle(it.id);
      if (!r.ok) return UI.toast(r.why || 'Không phân rã được.');
      UI.toast('Được ' + SQ.WALLET_ICON.core + r.core + ' và ' + SQ.WALLET_ICON.gold + money(r.gold), true);
      sel.item = null; UI.render();
    }));
    d.appendChild(row);
    return d;
  }

  // ---------------------------------------------------------------------------
  // TIẾN HOÁ
  // ---------------------------------------------------------------------------
  function scrEvol(b) {
    b.appendChild(el('h2', '', 'Tiến hoá'));
    b.appendChild(el('p', 'hint', 'Nâng ở đây cộng cho <b>cả năm người</b> trong tổ, kể cả xác mới quay được sau này.'));
    b.appendChild(el('div', 'eq-power', '⚡ Lực chiến tổ: <b>' + money(SQ.squadPower()) + '</b> · Tổng cấp tiến hoá: <b>' + SQ.evolTotal() + '</b>'));
    SQ.EVOL.forEach(e => {
      const lv = SQ.M.evol[e.id] || 0;
      const cost = SQ.evolCost(e);
      const maxed = lv >= e.max;
      const row = el('div', 'evo' + (maxed ? ' maxed' : ''));
      row.innerHTML =
        '<div class="evo-i">' + e.icon + '</div>' +
        '<div class="evo-b"><div class="evo-n">' + e.name + ' <span class="dim">' + lv + '/' + e.max + '</span></div>' +
        '<div class="evo-d">' + e.desc + '</div>' +
        '<div class="evo-bar"><i style="width:' + (lv / e.max * 100) + '%"></i></div></div>';
      row.appendChild(maxed ? el('div', 'evo-max', 'TỐI ĐA')
        : btn(SQ.WALLET_ICON.gold + money(cost.gold), '', () => {
          const r = SQ.evolUp(e.id);
          UI.toast(r.ok ? e.name + ' lên cấp ' + r.lv : r.why, r.ok);
          UI.render();
        }));
      b.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // GACHA
  // ---------------------------------------------------------------------------
  function scrGacha(b) {
    b.appendChild(el('h2', '', 'Gacha'));
    const tabs = el('div', 'tabs');
    ['char', 'equip'].forEach(id => {
      const t = el('button', 'tab' + (sel.banner === id ? ' on' : ''), SQ.GACHA[id].name);
      on(t, 'click', () => { sel.banner = id; UI.render(); });
      tabs.appendChild(t);
    });
    b.appendChild(tabs);

    const g = SQ.GACHA[sel.banner];
    const pity = SQ.M.pity[g.id];
    const box = el('div', 'banner');
    box.style.setProperty('--bc', g.color);
    box.innerHTML =
      '<div class="ban-t">' + g.name + '</div>' +
      '<div class="ban-d">' + g.desc + '</div>' +
      '<div class="ban-r">Tỉ lệ 5★ ' + (g.rate5 * 100).toFixed(1) + '% · 4★ ' + (g.rate4 * 100).toFixed(1) + '% · ' +
        'bảo hiểm 5★ sau <b>' + g.hard + '</b> lượt' + (g.soft < 900 ? ' (tăng dần từ lượt ' + g.soft + ')' : '') + '</div>' +
      '<div class="ban-p">Đã quay không ra 5★: <b>' + pity.c5 + '/' + g.hard + '</b> · 4★: ' + pity.c4 + '/' + g.pity4 + '</div>';
    b.appendChild(box);

    if (sel.banner === 'char') {
      const pool = el('div', 'pool');
      pool.appendChild(el('div', 'pool-t', 'Có thể ra:'));
      [5, 4, 3].forEach(star => {
        const names = SQ.CHARS.filter(c => c.star === star).map(c => {
          const owned = SQ.M.chars[c.id] ? '' : ' class="dim"';
          return '<span' + owned + '>' + faceOf(c) + c.name + '</span>';
        }).join(' ');
        pool.appendChild(el('div', 'pool-r', '<b style="color:' + SQ.RARITY[star].color + '">' + '★'.repeat(star) + '</b> ' + names));
      });
      b.appendChild(pool);
    }

    const row = el('div', 'row pull');
    row.appendChild(btn('Quay 1 · ' + SQ.WALLET_ICON.gem + g.costGem, '', () => doPull(g.id, 1, false)));
    row.appendChild(btn('Quay 10 · ' + SQ.WALLET_ICON.gem + money(g.costGem * 10), 'big', () => doPull(g.id, 10, false)));
    const tickets = SQ.M[g.ticket] || 0;
    row.appendChild(btn('Dùng vé (' + tickets + ')', 'ghost', () => {
      if (tickets < 1) return UI.toast('Hết vé.');
      doPull(g.id, tickets >= 10 ? 10 : 1, true);
    }));
    b.appendChild(row);
    b.appendChild(el('p', 'hint', 'Hết ngọc thì sang Cửa Hàng — ở đây "nạp" chỉ là bấm nút, không có cổng thanh toán nào cả.'));
  }

  function doPull(bannerId, n, ticket) {
    const r = SQ.pull(bannerId, n, ticket);
    if (!r.ok) return UI.toast(r.why);
    showPulls(r.items);
    UI.render();
  }

  function showPulls(items) {
    const ov = $('#modal');
    clear(ov);
    ov.className = 'modal show';
    const card = el('div', 'mcard');
    card.appendChild(el('h3', '', 'Kết quả ' + items.length + ' lượt'));
    const g = el('div', 'pull-grid');
    items.forEach(it => {
      const star = it.star;
      const d = el('div', 'pcard s' + star);
      d.style.borderColor = SQ.RARITY[star].color;
      if (it.kind === 'char') {
        d.innerHTML = '<div class="pc-f">' + faceOf(it.char) + '</div><div class="pc-n">' + it.char.name + '</div>' +
          '<div class="pc-s">' + '★'.repeat(star) + '</div>' +
          '<div class="pc-t">' + (it.isNew ? '<b class="new">XÁC MỚI</b>' : '+' + it.shard + ' mảnh') + '</div>';
      } else {
        const item = it.item;
        d.innerHTML = '<div class="pc-f">' + SQ.SLOT_BY_ID[item.slot].icon + '</div><div class="pc-n">' + item.name + '</div>' +
          '<div class="pc-s">' + '★'.repeat(star) + '</div>' +
          '<div class="pc-t">' + SQ.STATS[item.main].short + ' ' + SQ.fmtStat(item.main, SQ.mainValue(item)) + '</div>';
      }
      g.appendChild(d);
    });
    card.appendChild(g);
    card.appendChild(btn('Xong', 'big', () => { ov.className = 'modal'; UI.render(); }));
    ov.appendChild(card);
  }

  // ---------------------------------------------------------------------------
  // CỬA HÀNG
  // ---------------------------------------------------------------------------
  function scrShop(b) {
    b.appendChild(el('h2', '', 'Cửa hàng'));
    b.appendChild(el('div', 'fakebox', '⚠️ <b>Nạp ở đây là giả.</b> Không có cổng thanh toán, không mất tiền thật — bấm là ngọc vào ví. Đây là bản chơi thử của cơ chế nạp.'));

    b.appendChild(el('h3', '', 'Gói ngọc'));
    const g = el('div', 'pack-grid');
    SQ.PACKS.forEach(p => {
      const c = el('div', 'pack');
      c.innerHTML = '<div class="pk-n">' + p.name + (p.tag ? '<span class="pk-tag">' + p.tag + '</span>' : '') + '</div>' +
        '<div class="pk-g">💎 ' + money(p.gem) + (p.bonus ? ' <span class="bonus">+' + money(p.bonus) + '</span>' : '') + '</div>' +
        '<div class="pk-p">' + money(p.vnd) + 'đ</div>';
      on(c, 'click', () => {
        const r = SQ.buyPack(p.id);
        UI.toast('Đã cộng ' + money(r.gem) + ' ngọc (nạp giả).', true);
        UI.render();
      });
      g.appendChild(c);
    });
    b.appendChild(g);

    b.appendChild(el('h3', '', 'Đổi hằng ngày'));
    SQ.EXCHANGE.forEach(x => {
      const left = SQ.exchangeLeft(x);
      const got = ['gold', 'core', 'ticketX', 'ticketE'].filter(k => x[k])
        .map(k => SQ.WALLET_ICON[k] + money(x[k])).join(' ');
      const row = el('div', 'xrow');
      row.innerHTML = '<div class="x-g">' + got + '</div><div class="x-l">còn ' + left + '/' + x.limit + ' lượt</div>';
      row.appendChild(btn(SQ.WALLET_ICON.gem + x.gem, left > 0 ? '' : 'ghost', () => {
        const r = SQ.exchange(x.id);
        UI.toast(r.ok ? 'Đổi xong.' : r.why, r.ok);
        UI.render();
      }));
      b.appendChild(row);
    });
    if (SQ.M.counters.spendVnd > 0) {
      b.appendChild(el('p', 'hint', 'Tổng "đã nạp" (giả): ' + money(SQ.M.counters.spendVnd) + 'đ'));
    }
  }

  // ---------------------------------------------------------------------------
  // NHIỆM VỤ
  // ---------------------------------------------------------------------------
  function scrQuest(b) {
    b.appendChild(el('h2', '', 'Nhiệm vụ'));
    const q = SQ.questList();
    const tabs = el('div', 'tabs');
    [['daily', 'Hằng ngày'], ['weekly', 'Hằng tuần'], ['ach', 'Thành tựu']].forEach(([id, name]) => {
      const n = q[id].filter(x => x.done && !x.claimed).length;
      const t = el('button', 'tab' + (sel.questTab === id ? ' on' : ''), name + (n ? ' (' + n + ')' : ''));
      on(t, 'click', () => { sel.questTab = id; UI.render(); });
      tabs.appendChild(t);
    });
    b.appendChild(tabs);

    const any = q.daily.concat(q.weekly, q.ach).some(x => x.done && !x.claimed);
    if (any) b.appendChild(btn('Nhận tất cả', 'big', () => {
      const got = SQ.claimAll();
      UI.toast('Nhận: ' + Object.keys(got).map(k => SQ.WALLET_ICON[k] + money(got[k])).join(' '), true);
      UI.render();
    }));

    q[sel.questTab].forEach(x => {
      const row = el('div', 'quest' + (x.claimed ? ' claimed' : x.done ? ' done' : ''));
      row.innerHTML =
        '<div class="q-b"><div class="q-t">' + x.text + '</div>' +
        '<div class="q-bar"><i style="width:' + (x.cur / x.need * 100) + '%"></i></div>' +
        '<div class="q-p">' + money(x.cur) + '/' + money(x.need) + ' · ' + rewardText(x.r) + '</div></div>';
      row.appendChild(x.claimed ? el('div', 'q-ok', '✔')
        : btn(x.done ? 'Nhận' : '…', x.done ? '' : 'ghost', () => {
          const r = SQ.claimQuest(x.id);
          UI.toast(r.ok ? 'Đã nhận.' : 'Chưa xong.', r.ok);
          UI.render();
        }));
      b.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // HUD TRONG TRẬN
  // ---------------------------------------------------------------------------
  UI.buildHud = function () {
    const h = $('#hud');
    clear(h);
    h.innerHTML =
      '<div class="h-top">' +
        '<button class="h-x" id="hQuit">✕</button>' +
        '<div class="h-mid"><div class="h-l"><b id="hFloor">Tầng 1/3</b><span id="hMap"></span></div>' +
        '<div class="h-q"><i id="hQBar"></i></div>' +
        '<div class="h-qn"><span id="hQNum">0 / 0</span></div></div>' +
      '</div>' +
      '<div class="h-squad" id="hSquad"></div>' +
      '<div class="h-msg" id="hMsg"></div>' +
      '<div class="h-ctl">' +
        '<div class="h-stick" id="hStick"><i id="hKnob"></i></div>' +
        '<button class="h-skill" id="hSkill"><span class="hs-i" id="hSkillI">✳</span><span class="hs-n" id="hSkillN">Kỹ năng</span><svg class="hs-cd" viewBox="0 0 100 100"><circle id="hSkillArc" cx="50" cy="50" r="46"/></svg><span class="hs-t" id="hSkillT"></span></button>' +
      '</div>';
  };

  UI.updateHud = function (R) {
    const q = Math.min(1, R.W.pad.delivered / R.W.quota);
    $('#hFloor').textContent = 'Tầng ' + R.floor + '/' + R.map.floors;
    $('#hMap').textContent = R.map.name;
    $('#hQBar').style.width = (q * 100) + '%';
    $('#hQBar').className = q >= 1 ? 'full' : '';
    $('#hQNum').textContent = money(R.W.pad.delivered) + ' / ' + money(R.W.quota);

    const sq = $('#hSquad');
    if (sq.childElementCount !== R.units.length) {
      clear(sq);
      R.units.forEach(u => {
        const d = el('div', 'hu');
        d.innerHTML = '<div class="hu-f">' + faceOf(u.def) + '</div>' +
          '<div class="hu-b"><i></i></div><div class="hu-n"></div><div class="hu-cd"></div>';
        sq.appendChild(d);
      });
    }
    R.units.forEach((u, i) => {
      const d = sq.children[i];
      d.className = 'hu' + (u.player ? ' me' : '') + (u.down ? ' down' : '') + (u.out ? ' out' : '');
      d.querySelector('.hu-b i').style.width = Math.max(0, u.hp / u.hpMax * 100) + '%';
      d.querySelector('.hu-n').textContent = u.player ? u.def.name : (u.tactic ? SQ.TACTIC_BY_ID[u.tactic].icon : '');
      const cd = d.querySelector('.hu-cd');
      cd.textContent = u.out ? '✖' : u.down ? '⤓' : (u.skillT > 0 ? Math.ceil(u.skillT) + 's' : '●');
      if (u.bag && u.bag.length) d.classList.add('carry'); else d.classList.remove('carry');
    });

    const me = R.units[0];
    const sk = $('#hSkill');
    const ready = me.skillT <= 0 && !me.down && !me.out;
    sk.className = 'h-skill' + (ready ? ' ready' : '');
    $('#hSkillI').textContent = skillIcon(me.def.skill.id);
    $('#hSkillN').textContent = me.def.skill.name;
    $('#hSkillT').textContent = me.skillT > 0 ? me.skillT.toFixed(1) : '';
    const arc = $('#hSkillArc');
    const c = 2 * Math.PI * 46;
    const frac = me.skillT > 0 ? me.skillT / SQ.skillCd(me) : 0;
    arc.style.strokeDasharray = c;
    arc.style.strokeDashoffset = c * (1 - frac);

    const msg = $('#hMsg');
    const live = R.msgs.filter(m => m.t < 4.5);
    msg.innerHTML = live.map(m => '<div style="opacity:' + Math.max(0, 1 - m.t / 4.5).toFixed(2) + '">' + m.text + '</div>').join('');
  };
  function skillIcon(id) {
    return { flash: '💡', healring: '💚', gong: '💪', unlock: '🔑', vanish: '🌑', shock: '💥',
             decoy: '🔔', rescue: '🪢', cage: '🧱', blink: '⚡', reveal: '👁️', freeze: '❄️',
             pull: '🧲', angel: '🕊️' }[id] || '✳';
  }

  // ---------------------------------------------------------------------------
  // Bảng kết quả
  // ---------------------------------------------------------------------------
  UI.panel = function (title, lines, buttons, cls) {
    const ov = $('#modal');
    clear(ov);
    ov.className = 'modal show ' + (cls || '');
    const card = el('div', 'mcard');
    card.appendChild(el('h3', '', title));
    lines.forEach(l => card.appendChild(el('div', 'mline', l)));
    const row = el('div', 'row');
    buttons.forEach(([label, cls2, fn]) => row.appendChild(btn(label, cls2, () => { ov.className = 'modal'; fn(); })));
    card.appendChild(row);
    ov.appendChild(card);
  };
  UI.closePanel = function () { $('#modal').className = 'modal'; };
  UI.el = el; UI.btn = btn; UI.faceOf = faceOf;

})(window);
