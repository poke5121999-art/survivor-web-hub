// HUD, menus, shop, pixel logo. Pure DOM; the game calls in, buttons emit events.
(() => {
  const BZ = window.BZ;

  // 5x7 pixel font for the logo, drawn on canvas like everything else.
  const GLYPH = {
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'], L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'], C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'], ' ': ['000', '000', '000', '000', '000', '000', '000'],
  };
  function logo(canvas, text) {
    const px = 9; const gap = 1;
    const width = [...text].reduce((a, ch) => a + (GLYPH[ch][0].length + gap), 0) * px + px * 2;
    canvas.width = width; canvas.height = (7 + 3) * px;
    const c = canvas.getContext('2d');
    let x = px;
    for (const ch of text) {
      const g = GLYPH[ch];
      const z = ch === 'Z';
      for (let r = 0; r < 7; r++) for (let k = 0; k < g[r].length; k++) {
        if (g[r][k] !== '1') continue;
        const X = x + k * px; const Y = px + r * px;
        c.fillStyle = '#1a1208'; c.fillRect(X + px * 0.4, Y + px * 0.4, px, px);
        c.fillStyle = z ? (r < 3 ? '#8fe05a' : '#4fae32') : r < 2 ? '#ffe9a8' : r < 5 ? '#f4c04a' : '#d58a22';
        c.fillRect(X, Y, px, px);
        c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(X, Y, px, px * 0.2);
      }
      x += (g[0].length + gap) * px;
    }
  }

  const ICON_COL = { g_body: '#2a2e35', g_body2: '#4a525d', g_steel: '#9aa4b0', g_edge: '#e6eef3', g_wood: '#8a5530', g_grip: '#1b1d21',
    g_orange: '#f08a24', g_red: '#d8322a', g_lime: '#7fd63a', g_blue: '#2f7de0', g_gold: '#f2c23a',
    g_glow_orange: '#ffb050', g_glow_red: '#ff6a5a', g_glow_lime: '#c6ff7a', g_glow_blue: '#7ad8ff', g_blade: '#d4dde6', g_tsuka: '#4a2350', g_glow_saber: '#9ff4ff', g_saber_core: '#ffffff' };
  // Side view of a gun's voxel list: z runs right-to-left, y up.
  function gunIcon(id) {
    const D = BZ.GUN_PARTS[id]; let parts = [...D.parts, ...D.grip];
    // blades stand up along +y in the viewmodel; lay them down so the icon reads like a gun (tip to the left)
    if (BZ.WEAPONS[id].melee) parts = parts.map((p) => [p[0], p[2], -p[4], p[3], p[5], -p[1], p[6]]);
    let z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of parts) { z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[5]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[4]); }
    const cv = document.createElement('canvas'); cv.width = 84; cv.height = 40; const c = cv.getContext('2d');
    const k = Math.min(76 / (z1 - z0), 34 / (y1 - y0)); const ox = (84 - (z1 - z0) * k) / 2; const oy = (40 - (y1 - y0) * k) / 2;
    const sorted = parts.slice().sort((a, b) => a[0] - b[0]);
    for (const p of sorted) {
      const x = ox + (z1 - p[5]) * k; const y = oy + (y1 - p[4]) * k; const w = Math.max(1, (p[5] - p[2]) * k); const h = Math.max(1, (p[4] - p[1]) * k);
      c.fillStyle = '#000'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, Math.round(w) + 2, Math.round(h) + 2);
    }
    for (const p of sorted) {
      const x = ox + (z1 - p[5]) * k; const y = oy + (y1 - p[4]) * k; const w = Math.max(1, (p[5] - p[2]) * k); const h = Math.max(1, (p[4] - p[1]) * k);
      c.fillStyle = ICON_COL[p[6]] || '#555'; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
    return cv.toDataURL();
  }

  BZ.makeUI = (G) => {
    const $ = (s) => document.querySelector(s);
    const el = {
      hud: $('#hud'), hp: $('#hp i'), hpTxt: $('#hp b'), armor: $('#armor'), ammo: $('#ammo b'), reserve: $('#ammo span'), wname: $('#wname'), slots: $('#slots'),
      wave: $('#wave b'), left: $('#wave span'), coins: $('#coins b'), score: $('#score b'), banner: $('#banner'), cross: $('#cross'), marker: $('#marker'),
      vignette: $('#vignette'), dmgDir: $('#dmgdir'), pops: $('#pops'), shop: $('#shop'), shopList: $('#shop-list'), shopTimer: $('#shop-timer'),
      fuel: $('#fuel i'), bombs: $('#bombs b'), boss: $('#bossbar'), bossName: $('#bossbar b'), bossFill: $('#bossbar i'),
      title: $('#title'), pause: $('#pause'), dead: $('#dead'), reloadHint: $('#reloadhint'), breakbar: $('#breakbar'), stick: $('#stick'), stickKnob: $('#stick i'), touch: $('#touch'),
    };
    logo($('#logo'), 'BLOCKADE Z');
    const W0 = G.weapons;
    // two hand slots; icons are drawn once per weapon and swapped in as the inventory changes
    const icons = {}; const icon = (id) => (icons[id] = icons[id] || gunIcon(id));
    el.slots.innerHTML = [0, 1].map((i) => `<button data-slot="${i}"><img alt=""><em>${i + 1}</em><small></small></button>`).join('');
    const slotEls = [0, 1].map((i) => el.slots.querySelector(`[data-slot="${i}"]`));
    el.slots.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (b) W0.selectSlot(+b.dataset.slot); });
    el.slots.addEventListener('touchstart', (e) => { const b = e.target.closest('[data-slot]'); if (b) { e.preventDefault(); W0.selectSlot(+b.dataset.slot); } }, { passive: false });
    const prompt = document.getElementById('prompt'); let promptFor = null;
    if (BZ.isTouch) document.body.classList.add('touch');

    const screens = ['title', 'pause', 'dead', 'shop', 'select', 'coop'];
    el.select = $('#select'); el.coop = $('#coop');
    // ---- co-op menu ----
    const coopName = $('#coop-name'); const coopList = $('#coop-list'); const coopStat = $('#coop-status'); const coopCode = $('#coop-code');
    coopName.addEventListener('change', () => { G.settings.coopName = coopName.value.trim().slice(0, 16) || 'Người chơi'; BZ.store.save(G.settings); });
    function coopStatus(t) { coopStat.textContent = t; }
    async function coopRender() {
      coopName.value = G.settings.coopName || ''; coopList.innerHTML = '<p class="muted">Đang tìm phòng…</p>';
      try {
        const rooms = await G.coop.listRooms();
        coopList.innerHTML = rooms.length ? rooms.map((r) => `<button class="item" data-room="${r.id}"><b>${r.host}</b><small>${r.players}/${r.max} người · đợt ${r.wave}${r.region ? ' · ' + r.region : ''}</small><span>VÀO</span></button>`).join('') : '<p class="muted">Chưa có phòng nào mở. Tạo phòng rồi gửi mã cho bạn.</p>';
      } catch (e) { coopList.innerHTML = '<p class="muted">Không lấy được danh sách phòng: ' + (e.message || e) + '</p>'; }
    }
    coopList.addEventListener('click', (e) => { const b = e.target.closest('[data-room]'); if (b) G.events.emit('ui:coopjoin', { lobbyId: b.dataset.room === 'FAKE' ? null : b.dataset.room, code: 'FAKE' }); });
    $('#coop-join').addEventListener('click', () => { const c = coopCode.value.trim(); if (c) G.events.emit('ui:coopjoin', { code: c }); });
    const coopBar = $('#coopbar');
    function show(name) { for (const s of screens) el[s].classList.toggle('on', s === name); el.hud.classList.toggle('on', G.state !== 'title' && G.state !== 'select' && G.state !== 'coop'); }
    // ---- hero pick ----
    const css = (c) => '#' + c.toString(16).padStart(6, '0');
    const selRow = $('#sel-row');
    selRow.innerHTML = BZ.HEROES.map((h, i) => `<button data-hero="${i}" style="--hc:${css(h.color)}">${h.name}</button>`).join('');
    selRow.addEventListener('click', (e) => { const b = e.target.closest('[data-hero]'); if (b) G.events.emit('ui:selpick', +b.dataset.hero); });
    function selectRender(i) {
      const h = BZ.HEROES[i]; el.select.style.setProperty('--hc', css(h.color));
      $('#sel-name').textContent = h.name; $('#sel-role').textContent = h.role;
      $('#sel-hp').style.width = Math.min(100, h.hp / 1.5) + '%'; $('#sel-hpn').textContent = h.hp;
      $('#sel-spd').style.width = Math.round((h.speed || 1) * 80) + '%'; $('#sel-spdn').textContent = Math.round((h.speed || 1) * 100) + '%';
      $('#sel-skill').textContent = h.skill.name + (h.skill.charges ? ` · ${h.skill.charges} lượt` : ` · hồi ${h.skill.cd} giây`); $('#sel-desc').textContent = h.skill.desc; $('#sel-passive').textContent = h.passive;
      selRow.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
    }
    const skillEl = $('#skill'); const heroTag = $('#herotag'); let skillFor = null;
    skillEl.addEventListener('click', () => G.hero.use());
    skillEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); G.hero.use(); }, { passive: false });

    // shop = upgrades only: category tabs, one card per upgrade with its level pips and next step, resonances below
    let shopCat = 'fire';
    function shopRender() {
      const B = G.build;
      const tabs = B.CATS.map(([id, n]) => `<button class="tab${id === shopCat ? ' on' : ''}" data-cat="${id}">${n}</button>`).join('');
      const cards = B.UP.filter((u) => u.cat === shopCat).map((u) => {
        const l = B.lv(u.id); const max = l >= u.max; const c = B.cost(u.id);
        return `<button class="up${max ? ' max' : ''}${l ? ' has' : ''}" data-up="${u.id}" ${max || G.coins < c ? 'disabled' : ''}>
          <i>${u.icon}</i><b>${u.name}</b><em>${'<u class="on"></u>'.repeat(l)}${'<u></u>'.repeat(u.max - l)}</em>
          <small>${l ? u.d(l) : 'chưa có'}${max ? '' : `<br><span class="nx">▶ ${u.d(l + 1)}</span>`}</small><strong>${max ? 'TỐI ĐA' : '🪙 ' + c}</strong></button>`;
      }).join('');
      const res = B.RES.map((r) => {
        const on = B.has(r.id);
        const need = Object.entries(r.need).map(([k, n]) => `<span class="${B.lv(k) >= n ? 'ok' : ''}">${B.def(k).name} ${Math.min(B.lv(k), n)}/${n}</span>`).join(' + ');
        return `<div class="res${on ? ' on' : ''}"><b>${on ? '✦ ' : ''}${r.name}</b><small>${need}</small><p>${r.d}</p></div>`;
      }).join('');
      el.shopList.innerHTML = `<div class="shop-coins">🪙 <b>${G.coins}</b></div><div class="tabs">${tabs}</div><div class="ups">${cards}</div>
        <h3 class="res-h">Cộng hưởng <small>đủ cấp ở hai nhánh thì mở thêm hiệu ứng</small></h3><div class="ress">${res}</div>
        <p class="shop-note">Súng không bán: nhặt từ zombie, quái tinh anh, boss và thùng tiếp tế thả dù giữa hai đợt.</p>`;
    }
    el.shopList.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cat]'); if (t) { shopCat = t.dataset.cat; G.audio.play('switch', { gain: 0.5 }); shopRender(); return; }
      const u = e.target.closest('[data-up]'); if (u && !u.disabled) G.events.emit('upgrade', u.dataset.up);
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-buy]');
      if (!b) return;
      G.audio.unlock();
      if (b.dataset.buy) G.events.emit('buy', b.dataset.buy);
      else G.events.emit('ui:' + b.dataset.act);
    });

    const pops = [];
    function pop(text, cls, world) {
      const d = document.createElement('div'); d.className = 'pop ' + (cls || ''); d.textContent = text; el.pops.appendChild(d);
      pops.push({ d, t: 0, world: world && world.clone(), y: 0 });
      if (pops.length > 14) { const o = pops.shift(); o.d.remove(); }
    }
    const ann = document.getElementById('announce'); let annT = 0;
    function announce(text, sub, cls) {
      ann.className = 'on ' + (cls || ''); ann.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
      void ann.offsetWidth; ann.classList.add('pop'); annT = 1.6;
    }
    let bannerT = 0;
    function banner(text, sub, secs = 2.2) { el.banner.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`; el.banner.classList.add('on'); bannerT = secs; }
    let markerT = 0; let hurtT = 0;
    function hit(head) { markerT = 0.12; el.marker.classList.toggle('head', !!head); }
    function hurt(d, rel) {
      hurtT = Math.min(1, hurtT + 0.35 + d / 40);
      el.dmgDir.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`; el.dmgDir.classList.add('on');
      clearTimeout(hurt.t); hurt.t = setTimeout(() => el.dmgDir.classList.remove('on'), 600);
    }
    function stick(on, x, y, dx, dy) {
      el.stick.style.display = on ? 'block' : 'none';
      if (on) { el.stick.style.left = x + 'px'; el.stick.style.top = y + 'px'; el.stickKnob.style.transform = `translate(${dx}px,${dy}px)`; }
    }

    const v = new window.THREE.Vector3();
    function update(dt) {
      const W = G.weapons; const P = G.player; const a = W.ammo(); const w = W.WEAPONS[W.cur()];
      el.hp.style.width = (P.hp / P.maxHp) * 100 + '%'; el.hpTxt.textContent = Math.ceil(P.hp);
      el.hp.parentElement.classList.toggle('low', P.hp < 35);
      el.armor.style.width = Math.min(100, P.armor) + '%';
      el.fuel.style.width = P.fuel + '%'; el.fuel.parentElement.classList.toggle('on', P.hasJet && (P.fuel < 99.5 || P.jetting));
      el.bombs.textContent = G.gear.state.bombs;
      el.ammo.textContent = w.melee ? '⚔' : a.mag; el.reserve.textContent = w.melee ? '' : a.reserve === Infinity ? '∞' : a.reserve;
      el.ammo.classList.toggle('low', !w.melee && a.mag <= Math.ceil(w.mag / 4));
      el.wname.textContent = w.name + (W.S.phase === 'reload' ? ' · đang nạp' : '');
      el.reloadHint.classList.toggle('on', a.mag === 0 && a.reserve > 0 && W.S.phase !== 'reload');
      slotEls.forEach((s, i) => {
        const id = W.S.inv[i]; const img = s.querySelector('img');
        if (s.dataset.id !== (id || '')) { s.dataset.id = id || ''; img.src = id ? icon(id) : ''; img.style.visibility = id ? 'visible' : 'hidden'; }
        s.className = (id ? 'own' : '') + (id && W.cur() === id ? ' cur' : '');
        const st = id && W.state[id];
        s.lastChild.textContent = !id ? 'trống' : W.WEAPONS[id].melee ? W.WEAPONS[id].name : st.mag + '/' + (st.reserve === Infinity ? '∞' : st.reserve);
      });
      const near = G.state === 'playing' ? W.nearGround() : null;
      if (near !== promptFor) {
        promptFor = near;
        if (near) { const full = W.S.inv.length >= W.SLOTS && !W.has(near.id); prompt.innerHTML = `<kbd>${BZ.isTouch ? 'NHẶT' : 'E'}</kbd> ${full ? 'đổi lấy' : 'nhặt'} <b>${W.WEAPONS[near.id].name}</b>`; }
        prompt.classList.toggle('on', !!near); document.body.classList.toggle('can-pick', !!near);
      }
      const Hh = G.hero; const hd = Hh.def;
      if (skillFor !== hd) {
        skillFor = hd; el.hud.style.setProperty('--hc', css(hd.color)); skillEl.querySelector('span').textContent = hd.skill.name;
        skillEl.querySelector('.dots').innerHTML = hd.skill.charges ? '<i></i>'.repeat(hd.skill.charges) : ''; heroTag.textContent = hd.name.toUpperCase() + ' · ' + hd.role;
      }
      skillEl.style.setProperty('--cd', Hh.charges > 0 ? 0 : Hh.cdFrac()); skillEl.classList.toggle('cool', Hh.charges <= 0);
      skillEl.classList.toggle('active', (Hh.t.invuln || Hh.t.storm || Hh.t.heal || Hh.t.strike || 0) > 0 || !!Hh.decoy);
      skillEl.querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('on', k < Hh.charges));
      const envEl = document.getElementById('env'); const wid = G.sky.weather(); const wname = BZ.WEATHERS[wid].name;
      const envTxt = (G.env.night ? '🌙 Đêm' : '☀ Ngày') + (wid !== 'clear' ? ' · ' + wname : '');
      if (envEl.textContent !== envTxt) { envEl.textContent = envTxt; envEl.classList.toggle('hot', wid === 'bloodmoon' || wid === 'meteor' || wid === 'storm'); }
      const cb = G.coop && G.coop.on ? `PHÒNG ${G.coop.code} · ${G.coop.players()} người${G.coop.host ? ' · bạn là chủ phòng' : ''}` : '';
      if (coopBar.textContent !== cb) { coopBar.textContent = cb; coopBar.classList.toggle('on', !!cb); }
      el.wave.textContent = G.wave.n; el.left.textContent = G.wave.phase === 'break' ? 'nghỉ' : `còn ${G.wave.remaining()} zombie`;
      el.coins.textContent = G.coins; el.score.textContent = G.score;
      const boss = G.zombies.boss(); el.boss.classList.toggle('on', !!boss);
      if (boss) { el.bossName.textContent = boss.T.name; el.bossFill.style.width = Math.max(0, boss.hp / boss.maxHp) * 100 + '%'; }
      const sp = W.spread(); const gap = 6 + sp * 500;
      el.cross.style.setProperty('--gap', gap + 'px'); el.cross.style.opacity = 1 - W.S.ads * 0.85;
      markerT -= dt; el.marker.style.opacity = markerT > 0 ? 1 : 0;
      hurtT = Math.max(0, hurtT - dt * 0.8); el.vignette.style.opacity = Math.max(hurtT, P.hp < 35 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0);
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('on'); }
      if (annT > 0) { annT -= dt; if (annT <= 0) ann.className = ''; }
      el.breakbar.classList.toggle('on', G.wave.phase === 'break' && G.state === 'playing');
      if (G.wave.phase === 'break') { el.breakbar.querySelector('b').textContent = Math.ceil(G.wave.breakT); el.shopTimer.textContent = Math.ceil(G.wave.breakT) + ' giây'; }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]; p.t += dt;
        if (p.world) {
          v.copy(p.world); v.y += p.t * 0.8; v.project(G.camera);
          if (v.z > 1) { p.d.style.opacity = 0; } else { p.d.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; p.d.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px'; p.d.style.opacity = Math.min(1, 2.2 - p.t * 2); }
        } else { p.d.style.opacity = Math.min(1, 2.2 - p.t * 2); p.d.style.transform = `translate(-50%, ${-p.t * 30}px)`; }
        if (p.t > 1.1) { p.d.remove(); pops.splice(i, 1); }
      }
    }
    function setDead(s) {
      $('#dead-wave').textContent = s.wave; $('#dead-kills').textContent = s.kills; $('#dead-score').textContent = s.score;
      $('#dead-acc').textContent = s.acc + '%'; $('#dead-best').textContent = s.best.score + ' (đợt ' + s.best.wave + ')';
      $('#dead-record').style.display = s.record ? 'block' : 'none';
    }
    function settingsSync() {
      const s = G.settings;
      for (const [id, key, fmt] of [['#set-sens', 'sens', (x) => x.toFixed(2)], ['#set-vol', 'volume', (x) => Math.round(x * 100) + '%'], ['#set-fov', 'fov', (x) => Math.round(x) + '°']]) {
        const inp = $(id); inp.value = s[key]; inp.nextElementSibling.textContent = fmt(+s[key]);
        inp.oninput = () => { s[key] = +inp.value; inp.nextElementSibling.textContent = fmt(+inp.value); G.events.emit('settings', s); };
      }
      const q = $('#set-q'); q.value = s.quality; q.onchange = () => { s.quality = q.value; G.events.emit('settings', s); };
    }
    return { announce, show, shopRender, pop, banner, hit, hurt, stick, update, setDead, settingsSync, selectRender, coopRender, coopStatus };
  };
})();
