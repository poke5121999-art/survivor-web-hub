// HUD, menus, the upgrade pick, pixel logo. Pure DOM; the game calls in, buttons emit events.
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
    const px = 10; const gap = 1; const pad = px * 1.5; const drop = px * 0.9;
    const width = [...text].reduce((a, ch) => a + (GLYPH[ch][0].length + gap), 0) * px + pad * 2;
    canvas.width = width; canvas.height = 7 * px + pad * 2 + drop;
    const c = canvas.getContext('2d');
    const cells = []; let x = pad;
    for (const ch of text) {
      const g = GLYPH[ch];
      for (let r = 0; r < 7; r++) for (let k = 0; k < g[r].length; k++) if (g[r][k] === '1') cells.push([x + k * px, pad + r * px, r, ch === 'Z']);
      x += (g[0].length + gap) * px;
    }
    // three layers: a black outline, a dark extrusion down-right, then the lit face with a bevel on every block
    c.fillStyle = '#000'; for (const [X, Y] of cells) c.fillRect(X - 3, Y - 3, px + 6 + drop * 0.6, px + 6 + drop);
    for (const [X, Y, , z] of cells) { c.fillStyle = z ? '#1f5a16' : '#7a4a10'; c.fillRect(X + drop * 0.6, Y + drop, px, px); c.fillRect(X + drop * 0.3, Y + drop * 0.5, px, px); }
    for (const [X, Y, r, z] of cells) {
      c.fillStyle = z ? ['#c9ff8a', '#a6f06a', '#8fe05a', '#6cc644', '#4fae32', '#3f9a2a', '#2f8420'][r] : ['#fff3c4', '#ffe9a8', '#ffd76a', '#f4c04a', '#eaa932', '#d58a22', '#b9701a'][r];
      c.fillRect(X, Y, px, px);
      c.fillStyle = 'rgba(255,255,255,.38)'; c.fillRect(X, Y, px, 2); c.fillRect(X, Y, 2, px);
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(X, Y + px - 2, px, 2); c.fillRect(X + px - 2, Y, 2, px);
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
      wave: $('#wave b'), left: $('#wave span'), score: $('#score b'), banner: $('#banner'), cross: $('#cross'), marker: $('#marker'),
      vignette: $('#vignette'), dmgDir: $('#dmgdir'), pops: $('#pops'), pick: $('#pick'), pickList: $('#pick-list'), pickHead: $('#pick-head'), pickWaitEl: $('#pick-wait'),
      fuel: $('#fuel i'), boss: $('#bossbar'), bossName: $('#bossbar b'), bossFill: $('#bossbar i'), bossTrail: $('#bossbar u'), hpTrail: $('#hp .bar s'),
      title: $('#title'), pause: $('#pause'), dead: $('#dead'), reloadHint: $('#reloadhint'), stick: $('#stick'), stickKnob: $('#stick i'), touch: $('#touch'),
    };
    logo($('#logo'), 'BLOCKADE Z');
    const W0 = G.weapons;
    // two hand slots; icons are drawn once per weapon and swapped in as the inventory changes
    const icons = {}; const icon = (id) => (icons[id] = icons[id] || gunIcon(id));
    el.slots.innerHTML = [0].map((i) => `<button data-slot="${i}"><img alt=""><em>${i + 1}</em><small></small></button>`).join('');
    const slotEls = [0].map((i) => el.slots.querySelector(`[data-slot="${i}"]`));
    if (BZ.isTouch) document.body.classList.add('touch');

    const screens = ['title', 'pause', 'dead', 'pick', 'select', 'coop'];
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
      for (const k of ['s1', 's2']) { const s = h[k]; $('#sel-' + k).textContent = s.name + (s.charges ? ` · ${s.charges} lượt, hồi ${s.cd} giây` : ` · hồi ${s.cd} giây`); $('#sel-' + k + 'd').textContent = s.desc; }
      $('#sel-kit').textContent = G.weapons.WEAPONS[h.weapon].name;
      $('#sel-ult').textContent = h.ult.name; $('#sel-ultd').textContent = h.ult.desc; $('#sel-passive').textContent = h.passive;
      selRow.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
    }
    const skillEl = $('#skill'); const skill2El = $('#skill2'); const ultEl = $('#ult'); const heroTag = $('#herotag'); let skillFor = null;
    for (const [b, k] of [[skillEl, 's1'], [skill2El, 's2'], [ultEl, 'ult']]) {
      b.addEventListener('click', () => G.hero.use(k));
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); G.hero.use(k); }, { passive: false });
    }

    // after a wave: three upgrade cards (key 1, 2, 3), what the build already has, and who is still choosing
    const CAT = Object.fromEntries(G.build.CATS);
    function pickRender(ids, n) {
      const B = G.build;
      el.pickHead.innerHTML = `<small>HẾT ĐỢT ${n}</small><b>Chọn 1 nâng cấp</b>`;
      el.pickList.innerHTML = ids.map((id, k) => {
        const u = B.def(id); const l = B.lv(id); const un = B.unlocks(id);
        return `<button class="up" data-cat="${u.cat}" data-pick="${id}" style="--d:${k * 90}ms"><kbd>${k + 1}</kbd><i>${u.icon}</i><span class="cat">${CAT[u.cat]}</span><b>${u.name}</b>
          <em>${'<u class="on"></u>'.repeat(l)}<u class="nw"></u>${'<u></u>'.repeat(u.max - l - 1)}</em>
          <small>${l ? u.d(l) + '<br>' : ''}<span class="nx">▶ ${u.d(l + 1)}</span></small>${un.length ? `<p class="unl">✦ mở cộng hưởng ${un.map((r) => r.name).join(', ')}</p>` : ''}</button>`;
      }).join('');
      const own = B.UP.filter((u) => B.lv(u.id)).map((u) => `<span>${u.icon} ${u.name} ${B.lv(u.id)}</span>`).join('');
      const res = B.RES.filter((r) => B.has(r.id)).map((r) => `<span class="on">✦ ${r.name}</span>`).join('');
      el.pick.querySelector('.owned').innerHTML = own || res ? own + res : '';
      el.pickWaitEl.textContent = ''; el.pick.classList.remove('done');
    }
    function pickWait() { el.pick.classList.add('done'); pickTick(); }
    function pickTick() { if (!el.pick.classList.contains('done')) return; const w = G.wave.waiting(); const t = w ? `Đang chờ ${w} người chọn…` : 'Vào đợt sau…'; if (el.pickWaitEl.textContent !== t) el.pickWaitEl.textContent = t; }
    el.pickList.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b && !el.pick.classList.contains('done')) { b.classList.add('chosen'); G.events.emit('pick', b.dataset.pick); } });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-buy]');
      if (!b) return;
      G.audio.unlock(); G.audio.play('ui_click');
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
    // a boss walks in: hazard stripes slide along the top and bottom edge for a moment
    const warn = document.createElement('div'); warn.id = 'bosswarn'; warn.innerHTML = '<i></i><i></i>'; document.body.appendChild(warn); let warnT = 0;
    function announce(text, sub, cls) {
      if (cls === 'hot' && /^BOSS/.test(text)) { warn.classList.add('on'); warnT = 2.8; }
      ann.className = 'on ' + (cls || ''); ann.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`;
      void ann.offsetWidth; ann.classList.add('pop'); annT = 1.6;
    }
    let bannerT = 0;
    function banner(text, sub, secs = 2.2) { el.banner.innerHTML = `<b>${text}</b>${sub ? `<small>${sub}</small>` : ''}`; el.banner.classList.add('on'); bannerT = secs; }
    let markerT = 0; let hurtT = 0;
    function hit(head) { if (bannerT > 0.35) bannerT = 0.35; // the banner gets out of the way once shots are landing
      if (markerT < 0.1) { markerT = 0.12; el.marker.className = head ? 'head' : ''; void el.marker.offsetWidth; el.marker.classList.add('pulse'); } }
    // the killing shot: the marker turns red, swells and lingers a little longer
    function kill() { markerT = 0.34; el.marker.className = ''; void el.marker.offsetWidth; el.marker.className = 'kill'; }
    function hurt(d, rel) {
      hurtT = Math.min(1, hurtT + 0.35 + d / 40);
      el.dmgDir.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`; el.dmgDir.classList.add('on');
      clearTimeout(hurt.t); hurt.t = setTimeout(() => el.dmgDir.classList.remove('on'), 600);
    }
    function stick(on, x, y, dx, dy) {
      el.stick.style.display = on ? 'block' : 'none';
      if (on) { el.stick.style.left = x + 'px'; el.stick.style.top = y + 'px'; el.stickKnob.style.transform = `translate(${dx}px,${dy}px)`; }
    }

    const v = new window.THREE.Vector3(); let jetEl = null; let promptEl = null; let doorSeen = '';
    // the page knows the game state, so CSS can show the touch pad only in a fight and drop the HUD behind a menu
    let stateSeen = null;
    const rot = $('#rotate'); if (rot) rot.addEventListener('click', () => document.body.classList.add('upright'));
    function update(dt) {
      if (stateSeen !== G.state) { stateSeen = G.state; document.body.dataset.state = G.state; }
      const W = G.weapons; const P = G.player; const a = W.ammo(); const w = W.WEAPONS[W.cur()];
      const hpW = (P.hp / P.maxHp) * 100 + '%'; el.hp.style.width = hpW; if (el.hpTrail) el.hpTrail.style.width = hpW; el.hpTxt.textContent = Math.ceil(P.hp);
      el.hp.parentElement.classList.toggle('low', P.hp < 35);
      el.armor.style.width = Math.min(100, P.armor) + '%';
      // a door within reach: say which key works it (a button on a phone)
      { const D = G.state === 'playing' && P.alive && G.destruct ? G.destruct.nearDoor() : null; const want = D ? (D.state ? 'open' : 'shut') : '';
        if (doorSeen !== want) { doorSeen = want; if (!promptEl) { promptEl = document.createElement('div'); promptEl.id = 'prompt'; el.hud.appendChild(promptEl); promptEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); G.destruct.useDoor(); }, { passive: false }); promptEl.addEventListener('click', () => G.destruct.useDoor()); }
          promptEl.classList.toggle('on', !!want); if (want) promptEl.innerHTML = (BZ.isTouch ? '<b>CHẠM</b> ' : '<kbd>E</kbd>') + (want === 'open' ? 'Mở cửa' : 'Đóng cửa'); } }
      // first person: the jetpack's fire and smoke lick up from the bottom edge while it burns
      const jf = jetEl || (jetEl = $('#jetfx')); if (jf) { const on = P.jetting && !(G.tps && G.tps.on); if (jf.classList.contains('on') !== on) jf.classList.toggle('on', on); if (on) jf.classList.toggle('low', P.fuel < 22); }
      el.fuel.style.width = P.fuel + '%'; el.fuel.parentElement.classList.toggle('on', P.hasJet && (P.fuel < 99.5 || P.jetting));
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
      const Hh = G.hero; const hd = Hh.def;
      if (skillFor !== hd) {
        skillFor = hd; el.hud.style.setProperty('--hc', css(hd.color)); heroTag.textContent = hd.name.toUpperCase() + ' · ' + hd.role;
        for (const [b, s] of [[skillEl, hd.s1], [skill2El, hd.s2]]) { b.querySelector('span').textContent = s.name; b.querySelector('.dots').innerHTML = s.charges ? '<i></i>'.repeat(s.charges) : ''; }
        ultEl.querySelector('span').textContent = hd.ult.name;
      }
      for (const [b, k] of [[skillEl, 's1'], [skill2El, 's2']]) { const S = Hh.slots[k]; b.style.setProperty('--cd', S.n > 0 ? 0 : Hh.slotFrac(k)); b.classList.toggle('cool', S.n <= 0); b.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', j < S.n)); }
      skillEl.classList.toggle('active', (Hh.t.invuln || Hh.t.storm || Hh.t.heal || Hh.t.strike || Hh.t.dash || 0) > 0 || !!Hh.decoy);
      skill2El.classList.toggle('active', (Hh.t.charge || Hh.t.rj || 0) > 0);
      const u = Hh.ult; ultEl.style.setProperty('--u', u); ultEl.classList.toggle('ready', u >= 1); ultEl.classList.toggle('active', (Hh.t.ultOn || 0) > 0);
      const ub = ultEl.querySelector('b'); const ut = (Hh.t.ultOn || 0) > 0 ? '●' : u >= 1 ? (BZ.isTouch ? '★' : 'Q') : Math.floor(u * 100) + '%'; if (ub.textContent !== ut) ub.textContent = ut;
      const envEl = document.getElementById('env'); const wid = G.sky.weather(); const wname = BZ.WEATHERS[wid].name;
      const envTxt = (G.env.night ? '🌙 Đêm' : '☀ Ngày') + (wid !== 'clear' ? ' · ' + wname : '');
      if (envEl.textContent !== envTxt) { envEl.textContent = envTxt; envEl.classList.toggle('hot', wid === 'bloodmoon' || wid === 'storm'); }
      const cb = G.coop && G.coop.on ? `PHÒNG ${G.coop.code} · ${G.coop.players()} người${G.coop.host ? ' · bạn là chủ phòng' : ''}` : '';
      if (coopBar.textContent !== cb) { coopBar.textContent = cb; coopBar.classList.toggle('on', !!cb); }
      el.wave.textContent = G.wave.n; el.left.textContent = G.wave.phase === 'break' ? 'nghỉ' : `còn ${G.wave.remaining()} zombie`;
      el.score.textContent = G.score;
      const boss = G.zombies.boss(); el.boss.classList.toggle('on', !!boss);
      if (boss) { const bw = Math.max(0, boss.hp / boss.maxHp) * 100 + '%'; if (el.bossName.textContent !== boss.T.name) el.bossName.textContent = boss.T.name; el.bossFill.style.width = bw; if (el.bossTrail) el.bossTrail.style.width = bw; }
      const sp = W.spread(); const gap = 6 + sp * 500;
      el.cross.style.setProperty('--gap', gap + 'px'); el.cross.style.opacity = 1 - W.S.ads * 0.85;
      markerT -= dt; el.marker.style.opacity = markerT > 0 ? 1 : 0;
      hurtT = Math.max(0, hurtT - dt * 0.8); el.vignette.style.opacity = Math.max(hurtT, P.hp < 35 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0);
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.classList.remove('on'); }
      if (annT > 0) { annT -= dt; if (annT <= 0) ann.className = ''; }
      if (warnT > 0) { warnT -= dt; if (warnT <= 0 || G.state !== 'playing') { warnT = 0; warn.classList.remove('on'); } }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]; p.t += dt;
        if (p.world) {
          v.copy(p.world); v.y += p.t * 0.8; v.project(G.camera);
          if (v.z > 1) { p.d.style.opacity = 0; } else { p.d.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; p.d.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px'; p.d.style.opacity = Math.min(1, 2.2 - p.t * 2); }
        } else { p.d.style.opacity = Math.min(1, 2.2 - p.t * 2); p.d.style.transform = `translate(-50%, ${-p.t * 30}px)`; }
        if (p.t > 1.1) { p.d.remove(); pops.splice(i, 1); }
      }
    }
    function countUp(node, to, ms, delay) {
      const t0 = performance.now() + delay; node.textContent = '0';
      const step = () => { const k = Math.min(1, Math.max(0, (performance.now() - t0) / ms)); node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1 && node.dataset.to === String(to)) requestAnimationFrame(step); else node.textContent = to; };
      node.dataset.to = String(to); requestAnimationFrame(step);
    }
    function setDead(s) {
      countUp($('#dead-wave'), s.wave, 500, 1100); countUp($('#dead-kills'), s.kills, 800, 1250); countUp($('#dead-score'), s.score, 1100, 1400);
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
    return { kill, announce, show, pickRender, pickWait, pickTick, pop, banner, hit, hurt, stick, update, setDead, settingsSync, selectRender, coopRender, coopStatus };
  };
})();
