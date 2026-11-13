// HUD and menus (DOM). The HUD reads sim state every frame and only touches the DOM when a value changed.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const ITEM_KEYS = ['Z', 'X', 'C'];

  PM.UI = function (G) {
    const root = document.getElementById('ui');
    const touch = navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', touch);
    root.innerHTML = `
      <a class="hub" href="../../index.html" title="Về hub">‹ Hub</a>
      <div id="hud" class="off">
        <div id="hud-top">
          <div class="team t0"><b></b><i><em></em></i></div>
          <div id="windbox"><span class="lbl">GIÓ</span><div class="track"><i></i><u></u></div><span class="val"></span></div>
          <div id="timer"><span></span></div>
          <div class="team t1"><b></b><i><em></em></i></div>
        </div>
        <div id="order"></div>
        <div id="tags"></div>
        <div id="floats"></div>
        <div id="banner"></div>
        <div id="deck">
          <div class="me">
            <div class="who"><span class="dot"></span><b></b><small></small></div>
            <div class="row"><label>Nhiên liệu</label><div class="bar fuel"><i></i></div></div>
            <div class="row"><label>Góc bắn</label><div class="angle"><svg viewBox="-4 -34 68 38"><path class="arc" d=""/><line class="needle" x1="0" y1="0" x2="30" y2="0"/></svg><b></b></div></div>
          </div>
          <div class="power">
            <div class="gauge"><i class="fill"></i><i class="last"><s></s></i><div class="ticks"></div></div>
            <div class="hint"></div>
          </div>
          <div class="kit"><div class="shots"></div><div class="items"></div></div>
        </div>
        <div id="pad">
          <button data-hold="left">◀</button><button data-hold="right">▶</button><button data-hold="up">▲</button><button data-hold="down">▼</button>
          <button data-hold="fire" class="fire">BẮN</button>
        </div>
        <button id="btn-pause" title="Tạm dừng">❚❚</button>
        <button id="btn-skip">Bỏ lượt</button>
      </div>
      <div id="screens"></div>
      <div id="toast"></div>`;
    const $ = (sel, el) => (el || root).querySelector(sel);
    const hud = $('#hud'), screens = $('#screens');
    const el = { wind: $('#windbox'), windFill: $('#windbox .track i'), windVal: $('#windbox .val'), timer: $('#timer'), timerTxt: $('#timer span'), order: $('#order'), tags: $('#tags'), floats: $('#floats'), banner: $('#banner'),
      who: $('.me .who b'), whoSub: $('.me .who small'), dot: $('.me .dot'), fuel: $('.fuel i'), angle: $('.angle b'), needle: $('.angle .needle'), arc: $('.angle .arc'),
      fill: $('.gauge .fill'), last: $('.gauge .last'), hint: $('.power .hint'), shots: $('.kit .shots'), items: $('.kit .items'), deck: $('#deck'), skip: $('#btn-skip') };
    $('.gauge .ticks').innerHTML = Array.from({ length: 11 }, (_, i) => `<span style="left:${i * 10}%"></span>`).join('');

    const cache = new Map();
    const set = (key, value, fn) => { if (cache.get(key) !== value) { cache.set(key, value); fn(value); } };
    const click = (node, fn) => node.addEventListener('click', (e) => { e.stopPropagation(); if (G.audio) G.audio.unlock(); fn(e); });

    root.querySelectorAll('[data-hold]').forEach((b) => {
      const name = b.dataset.hold;
      const on = (e) => { e.preventDefault(); G.input.hold(name, true); b.classList.add('on'); };
      const off = () => { G.input.hold(name, false); b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    });
    click($('#btn-pause'), () => api.togglePause());
    click(el.skip, () => G.input.act('skip'));

    let tags = [], lastTick = 99, bannerT = 0;
    function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); }
    function banner(msg, cls) { el.banner.className = cls || ''; el.banner.textContent = msg; void el.banner.offsetWidth; el.banner.classList.add('on'); bannerT = 1.6; }
    function float(x, y, text, cls) {
      const s = G.rig.toScreen(x, y, 0), d = document.createElement('div');
      d.className = 'float ' + cls; d.textContent = text; d.style.left = s.x + 'px'; d.style.top = s.y + 'px';
      el.floats.appendChild(d); setTimeout(() => d.remove(), 1400);
    }

    function buildMatchHud() {
      const sim = G.sim;
      cache.clear();
      el.tags.innerHTML = sim.units.map((u) => `<div class="tag t${u.team}" style="--tc:${hex(PM.TEAM_COLORS[u.team])}"><b>${esc(u.name)}</b><i><em></em><u></u></i></div>`).join('');
      tags = [...el.tags.children].map((node, i) => ({ node, u: sim.units[i], hp: $('em', node), sh: $('u', node) }));
      [0, 1].forEach((t) => { const n = $('.team.t' + t); n.style.setProperty('--tc', hex(PM.TEAM_COLORS[t])); $('b', n).textContent = PM.TEAM_NAMES[t]; });
      el.floats.innerHTML = '';
      hud.classList.toggle('off', !!G.demo);
    }

    function renderKit(u) {
      const sim = G.sim;
      el.shots.innerHTML = u.shots.map((s, i) => `<button class="shot${s.special ? ' sp' : ''}" data-i="${i}"><kbd>${i + 1}</kbd><b>${esc(s.name)}</b><small>${esc(s.desc)}</small>${s.special ? '<i class="ring"></i>' : ''}</button>`).join('');
      el.items.innerHTML = [0, 1, 2].map((i) => { const it = PM.ITEMS[u.items[i]]; return `<button class="item${it ? '' : ' used'}" data-i="${i}" title="${it ? esc(it.desc) : ''}"><kbd>${ITEM_KEYS[i]}</kbd><b>${it ? esc(it.name) : '—'}</b></button>`; }).join('');
      el.shots.querySelectorAll('button').forEach((b) => click(b, () => G.input.act('shot', +b.dataset.i)));
      el.items.querySelectorAll('button').forEach((b) => click(b, () => G.input.act('item', +b.dataset.i)));
      const r = 30, a0 = u.aimMin * Math.PI / 180, a1 = u.aimMax * Math.PI / 180;
      el.arc.setAttribute('d', `M ${r * Math.cos(a0)} ${-r * Math.sin(a0)} A ${r} ${r} 0 0 0 ${r * Math.cos(a1)} ${-r * Math.sin(a1)}`);
      void sim;
    }

    G.bus.on('match:start', buildMatchHud);
    G.bus.on('match:end', () => { hud.classList.add('off'); });
    G.bus.on('sim:turn', (ev) => {
      if (G.demo) return;
      const u = G.sim.units[ev.unit];
      cache.delete('kit');
      banner(u.ai ? `${u.name} đang ngắm` : 'Lượt của bạn', u.ai ? 't' + u.team : 'you');
      lastTick = 99;
    });
    G.bus.on('sim:damage', (ev) => { float(ev.x, ev.y + 1.5, '-' + ev.amount, ev.amount >= 220 ? 'dmg big' : 'dmg'); if (ev.blocked) float(ev.x, ev.y + 3, 'Khiên -' + ev.blocked, 'blk'); });
    G.bus.on('sim:heal', (ev) => float(ev.x, ev.y + 1.5, '+' + ev.amount, 'heal'));
    G.bus.on('sim:die', (ev) => { const u = G.sim.units[ev.unit]; if (!G.demo) toast(ev.cause === 'sea' ? `${u.name} rơi xuống biển mây` : `${u.name} bị hạ`); });
    G.bus.on('sim:fire', (ev) => {
      if (G.demo) return;
      const u = G.sim.units[ev.unit], def = ev.shot === 'tele' ? PM.Sim.TELE_DEF : u.shots.find((s) => s.id === ev.shot);
      if (def && (def.special || ev.shot === 'tele')) banner(def.name + '!', 'sp');
    });
    G.bus.on('sim:item', (ev) => { cache.delete('kit'); const u = G.sim.units[ev.unit]; float(u.x, u.y + 4.5, PM.ITEMS[ev.item].name, 'itm'); });
    G.bus.on('sim:skip', (ev) => { const u = G.sim.units[ev.unit]; float(u.x, u.y + 4.5, 'Bỏ lượt', 'itm'); });
    G.bus.on('sim:over', (ev) => { if (!G.demo) setTimeout(() => showResult(), 1600); });
    G.bus.on('quality:auto', (ev) => toast('Máy hơi chậm, đã hạ đồ hoạ xuống ' + ({ low: 'Thấp', medium: 'Vừa', high: 'Cao' }[ev.name])));

    function updateHud(dt) {
      const sim = G.sim;
      if (!sim || G.demo) return;
      const a = sim.active, human = sim.phase === 'turn' && a.alive && !a.ai;
      const wm = G.map.windMax, w = sim.wind;
      set('wind', w, () => { el.windFill.style.width = Math.abs(w) / wm * 50 + '%'; el.windFill.style.left = w >= 0 ? '50%' : 50 - Math.abs(w) / wm * 50 + '%'; el.windVal.textContent = (w < 0 ? '◀ ' : '') + Math.abs(w).toFixed(1) + (w > 0 ? ' ▶' : ''); el.wind.classList.toggle('neg', w < 0); el.wind.classList.toggle('calm', Math.abs(w) < 0.05); });
      const tsec = sim.phase === 'turn' ? Math.ceil(sim.timer) : 0;
      set('timer', tsec, () => { el.timerTxt.textContent = sim.phase === 'turn' ? tsec : '·'; el.timer.classList.toggle('low', sim.phase === 'turn' && tsec <= 5); });
      if (human && tsec <= 5 && tsec < lastTick && tsec > 0) { lastTick = tsec; G.bus.emit('ui:tick'); }
      for (const t of [0, 1]) {
        let hp = 0, max = 0;
        for (const u of sim.units) if (u.team === t) { hp += u.hp; max += u.maxHp; }
        set('team' + t, hp, () => { $('.team.t' + t + ' em').style.width = (hp / max * 100) + '%'; });
      }
      const ord = sim.order(), key = ord.map((o) => o.id + ':' + Math.round(o.delay === null ? -1 : o.delay) + ':' + Math.round(o.after)).join('|');
      set('order', key, () => {
        const after = ord.find((o) => o.delay === null), rank = after ? ord.filter((o) => o.delay !== null && o.delay <= after.after).length : 0;
        el.order.innerHTML = '<h4>Thứ tự lượt</h4>' + ord.map((o, i) => { const u = sim.units[o.id]; return `<div class="${o.delay === null ? 'now' : ''}" style="--tc:${hex(PM.TEAM_COLORS[u.team])}"><span></span><b>${esc(u.name)}</b><small>${o.delay === null ? 'đang đi' : Math.round(o.delay)}</small></div>` + (after && i === rank && sim.phase === 'turn' ? `<div class="next" style="--tc:${hex(PM.TEAM_COLORS[sim.units[after.id].team])}"><span></span><b>lượt sau</b><small>${Math.round(after.after)}</small></div>` : ''); }).join('');
      });
      for (const t of tags) {
        const u = t.u;
        set('alive' + u.id, u.alive, (v) => { t.node.style.display = v ? '' : 'none'; });
        if (!u.alive) continue;
        const s = G.rig.toScreen(u.x, u.y + (u.kind === 'chuon' ? 4.1 : 3.6), 0);
        t.node.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
        set('hp' + u.id, u.hp, () => { t.hp.style.width = (u.hp / u.maxHp * 100) + '%'; t.node.classList.toggle('hurt', u.hp < u.maxHp * 0.3); });
        set('sh' + u.id, u.shield, () => { t.sh.style.width = Math.min(100, u.shield / u.maxHp * 100) + '%'; });
        set('act' + u.id, u === a && sim.phase === 'turn', (v) => t.node.classList.toggle('act', v));
      }
      set('human', human, (v) => { el.deck.classList.toggle('idle', !v); el.skip.classList.toggle('off', !v); });
      const shown = human ? a : (sim.units.find((u) => u.alive && !u.ai && u.team === G.playerTeam) || a);
      set('kit', shown.id + ':' + shown.items.join(','), () => { renderKit(shown); cache.delete('sel'); cache.delete('spc'); });
      set('who', shown.id, () => { el.who.textContent = shown.name; el.whoSub.textContent = PM.UNITS[shown.kind].title; el.dot.style.background = hex(PM.TEAM_COLORS[shown.team]); });
      set('fuel', Math.round(shown.fuel / shown.fuelMax * 100), (v) => { el.fuel.style.width = v + '%'; });
      set('angle', Math.round(shown.angle), (v) => { el.angle.textContent = v + '°'; el.needle.setAttribute('transform', `rotate(${-v})`); });
      set('pow', Math.round(sim.charge.on && shown === a ? sim.charge.power * 2 : 0), (v) => { el.fill.style.width = v / 2 + '%'; });
      set('last', Math.round(shown.lastPower), (v) => { el.last.style.left = v + '%'; el.last.style.display = v > 0 ? '' : 'none'; });
      set('sel', (sim.ts && sim.ts.tele && shown === a ? 9 : shown.shotIdx), (v) => el.shots.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === v)));
      set('spc', Math.floor(shown.special), (v) => el.shots.querySelectorAll('.sp').forEach((b) => { b.classList.toggle('ready', v >= 100); b.style.setProperty('--sp', v / 100); }));
      const ts = sim.ts, hint = !human ? (sim.phase === 'turn' ? 'Đối thủ đang tính đường đạn' : '') : sim.charge.on ? 'Thả để bắn' : (touch ? 'Giữ nút BẮN để nạp lực' : 'A D đi · W S chỉnh góc · giữ SPACE nạp lực') + (ts.double ? ' · Bắn Đôi' : '') + (ts.boost > 1 ? ' · Thuốc Nổ' : '') + (ts.tele ? ' · Dịch Chuyển' : '');
      set('hint', hint, (v) => { el.hint.textContent = v; });
      if (bannerT > 0 && (bannerT -= dt) <= 0) el.banner.classList.remove('on');
    }

    // ---------- screens ----------
    function screen(html, cls) { screens.innerHTML = `<div class="screen ${cls || ''}">${html}</div>`; screens.classList.add('on'); return screens.firstElementChild; }
    function closeScreen() { screens.innerHTML = ''; screens.classList.remove('on'); }
    const profile = () => { const m = G.meta, lv = m.level(), sp = m.levelSpan(lv); return `<div class="profile"><b>Cấp ${lv}</b><span>${esc(m.rank(lv))}</span><i><em style="width:${Math.round((m.save.xp - sp.from) / (sp.to - sp.from) * 100)}%"></em></i><strong>${m.save.coins} xu</strong></div>`; };

    function startDemo() {
      G.demo = true;
      const rng = PM.rng(Date.now() & 0xffff), kinds = PM.UNIT_ORDER;
      G.startMatch({ seed: Math.floor(rng() * 1e6), map: 'doiche', playerTeam: -1, teams: [0, 1].map(() => [0, 1].map(() => ({ kind: rng.pick(kinds), ai: 'medium', items: ['heal', 'boost', 'shield'] }))) });
      G.state = 'title';
    }

    function showTitle() {
      if (!G.sim || !G.demo) startDemo();
      const s = screen(`
        <div class="title">
          <div class="logo"><small>QUẦN ĐẢO TRÊN BIỂN MÂY</small><h1>PHÁO MÂY</h1><p>Chỉnh góc. Nạp lực. Đọc gió. Khoét đất dưới chân đối thủ.</p></div>
          <nav>
            <button class="btn big" data-go="quick">Đấu nhanh</button>
            <button class="btn" data-go="shop">Xưởng pháo</button>
            <button class="btn" data-go="help">Cách chơi</button>
            <button class="btn" data-go="settings">Thiết lập</button>
          </nav>
          <footer>Mọi hình khối, vật liệu và âm thanh đều sinh bằng code trong trình duyệt. Không tải file ảnh hay nhạc nào.</footer>
        </div>${profile()}`, 'title-screen');
      s.querySelectorAll('[data-go]').forEach((b) => click(b, () => { G.bus.emit('ui:click'); ({ quick: showQuick, shop: showShop, help: showHelp, settings: showSettings })[b.dataset.go](); }));
    }

    function showQuick() {
      const last = G.meta.save.last, pick = { unit: G.meta.owns(last.unit) ? last.unit : 'coc', size: last.size || 1, ai: last.ai || 'easy', items: (last.items || ['heal', 'double', 'tele']).slice(0, 3) };
      const draw = () => {
        const U = PM.UNITS[pick.unit];
        const s = screen(`<div class="panel wide"><h2>Đấu nhanh</h2>
          <h3>Cỗ pháo của bạn</h3><div class="cards">${PM.UNIT_ORDER.map((k) => { const u = PM.UNITS[k], own = G.meta.owns(k); return `<button class="card${k === pick.unit ? ' on' : ''}${own ? '' : ' locked'}" data-unit="${k}"><b>${esc(u.name)}</b><small>${esc(u.title)}</small><span>${own ? `Máu ${u.hp} · Xăng ${u.fuel}` : `Khoá · ${PM.UNIT_PRICE[k]} xu ở Xưởng pháo`}</span></button>`; }).join('')}</div>
          <p class="blurb">${esc(U.blurb)} Đạn: ${U.shots.map((x) => esc(x.name)).join(', ')}.</p>
          <h3>Vật phẩm mang theo (chọn 3)</h3><div class="chips">${Object.keys(PM.ITEMS).map((k) => `<button class="chip${pick.items.includes(k) ? ' on' : ''}" data-item="${k}" title="${esc(PM.ITEMS[k].desc)}">${esc(PM.ITEMS[k].name)}</button>`).join('')}</div>
          <div class="cols"><div><h3>Quân số</h3><div class="chips">${[1, 2].map((n) => `<button class="chip${pick.size === n ? ' on' : ''}" data-size="${n}">${n} đấu ${n}</button>`).join('')}</div></div>
          <div><h3>Độ khó của máy</h3><div class="chips">${Object.keys(PM.AI_LEVELS).map((k) => `<button class="chip${pick.ai === k ? ' on' : ''}" data-ai="${k}">${PM.AI_LEVELS[k].name}</button>`).join('')}</div></div></div>
          <h3>Bản đồ</h3><div class="chips"><button class="chip on">${esc(PM.MAPS.doiche.name)}</button></div>
          <div class="actions"><button class="btn ghost" data-back>Quay lại</button><button class="btn big" data-start>Vào trận</button></div></div>`);
        s.querySelectorAll('[data-unit]').forEach((b) => click(b, () => { if (!G.meta.owns(b.dataset.unit)) { G.bus.emit('ui:deny'); return; } pick.unit = b.dataset.unit; G.bus.emit('ui:click'); draw(); }));
        s.querySelectorAll('[data-item]').forEach((b) => click(b, () => { const k = b.dataset.item, i = pick.items.indexOf(k); if (i >= 0) pick.items.splice(i, 1); else if (pick.items.length < 3) pick.items.push(k); else { G.bus.emit('ui:deny'); return; } G.bus.emit('ui:click'); draw(); }));
        s.querySelectorAll('[data-size]').forEach((b) => click(b, () => { pick.size = +b.dataset.size; G.bus.emit('ui:click'); draw(); }));
        s.querySelectorAll('[data-ai]').forEach((b) => click(b, () => { pick.ai = b.dataset.ai; G.bus.emit('ui:click'); draw(); }));
        click($('[data-back]', s), () => { G.bus.emit('ui:click'); showTitle(); });
        click($('[data-start]', s), () => { G.bus.emit('ui:click'); Object.assign(G.meta.save.last, pick); G.meta.commit(); startQuick(pick); });
      };
      draw();
    }

    function startQuick(pick) {
      const rng = PM.rng(Date.now() & 0xfffff), kinds = PM.UNIT_ORDER, pool = Object.keys(PM.ITEMS);
      const bot = () => ({ kind: rng.pick(kinds), ai: pick.ai, items: [rng.pick(pool), rng.pick(pool), rng.pick(pool)] });
      const mine = [{ kind: pick.unit, ai: null, name: 'Bạn', items: pick.items.slice() }], foes = [];
      for (let i = 1; i < pick.size; i++) mine.push(bot());
      for (let i = 0; i < pick.size; i++) foes.push(bot());
      G.demo = false; closeScreen();
      G.startMatch({ seed: Math.floor(rng() * 1e9), map: 'doiche', playerTeam: 0, level: pick.ai, teams: [mine, foes] });
    }

    function showShop() {
      const draw = () => {
        const s = screen(`<div class="panel wide"><h2>Xưởng pháo</h2>${profile()}
          <div class="cards">${PM.UNIT_ORDER.map((k) => { const u = PM.UNITS[k], own = G.meta.owns(k), price = PM.UNIT_PRICE[k]; return `<div class="card shopcard${own ? ' own' : ''}"><b>${esc(u.name)}</b><small>${esc(u.title)}</small><p>${esc(u.blurb)}</p><ul>${u.shots.map((x) => `<li><b>${esc(x.name)}</b> ${esc(x.desc)}</li>`).join('')}</ul>${own ? '<span class="owned">Đã có</span>' : `<button class="btn" data-buy="${k}"${G.meta.save.coins < price ? ' disabled' : ''}>Mở khoá · ${price} xu</button>`}</div>`; }).join('')}</div>
          <p class="blurb">Xu chỉ kiếm được bằng cách đánh trận. Ở đây không có gì mua bằng tiền thật.</p>
          <div class="actions"><button class="btn ghost" data-back>Quay lại</button></div></div>`);
        s.querySelectorAll('[data-buy]').forEach((b) => click(b, () => { if (G.meta.buy(b.dataset.buy)) { G.bus.emit('ui:buy'); toast('Đã mở khoá ' + PM.UNITS[b.dataset.buy].name); draw(); } else G.bus.emit('ui:deny'); }));
        click($('[data-back]', s), () => { G.bus.emit('ui:click'); showTitle(); });
      };
      draw();
    }

    function showHelp(back) {
      const s = screen(`<div class="panel"><h2>Cách chơi</h2>
        <ul class="help">
          <li><kbd>A</kbd><kbd>D</kbd> hoặc <kbd>←</kbd><kbd>→</kbd> đi. Mỗi lượt chỉ đi được một quãng theo thanh nhiên liệu.</li>
          <li><kbd>W</kbd><kbd>S</kbd> hoặc <kbd>↑</kbd><kbd>↓</kbd> chỉnh góc nòng.</li>
          <li>Giữ <kbd>SPACE</kbd> để nạp lực, thả ra là bắn. Vạch nhỏ trên thanh lực là lực của lượt trước.</li>
          <li><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> chọn loại đạn. Đạn số 3 là chiêu đặc biệt, phải nạp đầy qua giao tranh.</li>
          <li><kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> dùng vật phẩm. <kbd>P</kbd> bỏ lượt. <kbd>Esc</kbd> tạm dừng.</li>
          <li>Kéo chuột để xem bản đồ, lăn chuột để phóng to thu nhỏ, <kbd>F</kbd> quay về cỗ pháo.</li>
          <li>Gió đổi mỗi lượt và đẩy đạn lệch đi. Đạn nặng thì hố to; đất mất thì pháo tụt xuống, rơi khỏi đảo là thua.</li>
          <li>Bắn đạn nặng và dùng vật phẩm làm lượt sau của bạn tới muộn hơn. Xem cột "Thứ tự lượt" bên trái.</li>
        </ul><div class="actions"><button class="btn big" data-back>Đã hiểu</button></div></div>`);
      click($('[data-back]', s), () => { G.bus.emit('ui:click'); (back || showTitle)(); });
    }

    function showSettings(back) {
      const st = G.settings;
      const draw = () => {
        const s = screen(`<div class="panel"><h2>Thiết lập</h2>
          <h3>Đồ hoạ</h3><div class="chips">${[['low', 'Thấp'], ['medium', 'Vừa'], ['high', 'Cao']].map(([k, n]) => `<button class="chip${G.qualityName === k ? ' on' : ''}" data-q="${k}">${n}</button>`).join('')}</div>
          <p class="blurb">Mức Thấp dành cho điện thoại và máy yếu. Game tự giảm độ phân giải khi khung hình chậm.</p>
          <h3>Âm lượng</h3><input type="range" min="0" max="100" value="${Math.round((st.volume === undefined ? 0.8 : st.volume) * 100)}" data-vol>
          <div class="actions"><button class="btn big" data-back>Xong</button></div></div>`);
        s.querySelectorAll('[data-q]').forEach((b) => click(b, () => { st.quality = b.dataset.q; PM.store.write('phaomay.settings.v1', st); G.bus.emit('ui:click'); toast('Đồ hoạ đổi khi tải lại trang'); setTimeout(() => location.reload(), 500); }));
        $('[data-vol]', s).addEventListener('input', (e) => { st.volume = e.target.value / 100; if (G.audio) G.audio.setVolume(st.volume); PM.store.write('phaomay.settings.v1', st); });
        click($('[data-back]', s), () => { G.bus.emit('ui:click'); (back || showTitle)(); });
      };
      draw();
    }

    function showResult() {
      const sim = G.sim;
      if (!sim || sim.phase !== 'over' || G.demo) return;
      const r = G.meta.reward(sim, G.playerTeam, G.matchCfg.level || 'medium');
      G.bus.emit(r.win ? 'ui:buy' : 'ui:deny');
      const s = screen(`<div class="panel result ${r.win ? 'win' : 'lose'}"><h2>${sim.winner === -1 ? 'Hoà' : r.win ? 'Thắng trận' : 'Thua trận'}</h2>
        <table><tr><th>Cỗ pháo</th><th>Sát thương</th><th>Hạ</th><th>Phát bắn</th></tr>${sim.units.map((u) => `<tr class="t${u.team}${u.alive ? '' : ' dead'}"><td><span style="background:${hex(PM.TEAM_COLORS[u.team])}"></span>${esc(u.name)}</td><td>${sim.stats[u.id].dealt}</td><td>${sim.stats[u.id].kills}</td><td>${sim.stats[u.id].shots}</td></tr>`).join('')}</table>
        <div class="loot"><div><b>+${r.coins}</b><span>xu</span></div><div><b>+${r.xp}</b><span>kinh nghiệm</span></div><div><b>${sim.turnN}</b><span>lượt</span></div></div>
        ${r.levelUp ? `<p class="lvup">Lên cấp ${r.level} · ${esc(G.meta.rank(r.level))}</p>` : ''}
        <div class="actions"><button class="btn ghost" data-title>Về sảnh</button><button class="btn big" data-again>Đấu lại</button></div></div>`);
      click($('[data-title]', s), () => { G.bus.emit('ui:click'); G.demo = false; G.endMatch(); showTitle(); });
      click($('[data-again]', s), () => { G.bus.emit('ui:click'); closeScreen(); startQuick(G.meta.save.last); });
    }

    function togglePause() {
      if (G.demo || !G.sim || G.sim.phase === 'over') return;
      if (G.paused) { G.paused = false; closeScreen(); return; }
      G.paused = true;
      const s = screen(`<div class="panel"><h2>Tạm dừng</h2><div class="stack"><button class="btn big" data-a="resume">Chơi tiếp</button><button class="btn" data-a="help">Cách chơi</button><button class="btn" data-a="settings">Thiết lập</button><button class="btn ghost" data-a="quit">Bỏ trận, về sảnh</button></div></div>`);
      const reopen = () => { G.paused = false; togglePause(); };
      s.querySelectorAll('[data-a]').forEach((b) => click(b, () => { G.bus.emit('ui:click'); const a = b.dataset.a;
        if (a === 'resume') togglePause(); else if (a === 'help') showHelp(reopen); else if (a === 'settings') showSettings(reopen);
        else { G.paused = false; G.endMatch(); showTitle(); } }));
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.sim && !G.demo && !G.paused && G.sim.phase !== 'over') togglePause(); });

    const api = { update: updateHud, showTitle, showResult, togglePause, toast, banner };
    return api;
  };
})();
