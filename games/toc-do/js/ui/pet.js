// PET: mua, mang theo, nâng cấp, theo xe trong trận, kỹ năng nhỏ (nhánh PET). Chơi một mình: không có máy chủ, pet mua bằng xu hoặc nhận từ gacha.
// Mô hình/icon lấy từ APK (tools/export_pets.py): 8 trong 21 pet có mô hình ngay trong APK, còn lại tải sau qua Puffer nên không có.
// Bản gốc không kèm hoạt ảnh pet (clip tải sau) nên pet lơ lửng bên xe bằng nhấp nhô viết tay.
// Chữ: "PET", "Tổng số PET:", "PET tăng cấp!", "Xóa PET", "Đã có PET này", "Cực Phẩm" lấy từ loc_vn.tsv; tên pet và kỹ năng là chọn
// (bảng tên pet nằm trong gói tải sau).
(function (TD) {
  'use strict';
  const P = TD.pet = {};
  const A = 'art/pets/';
  const MAXLV = 10;
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (e) => TD.audio && TD.audio.play(e);

  // Kỹ năng: giá trị theo cấp lv (1..10), đều nhỏ để pet không phá cân bằng.
  const SKILLS = {
    gauge: { name: 'Nạp Sẵn Bình', val: (lv) => 0.04 + 0.02 * (lv - 1),        // chọn: 4% → 22% bình nitro lúc GO
      text: (v) => 'Lúc xuất phát nạp sẵn ' + Math.round(v * 100) + '% bình nitro' },
    coin: { name: 'Thêm Xu', val: (lv) => 0.05 + 0.02 * (lv - 1),               // chọn: +5% → +23% xu thưởng trận
      text: (v) => 'Xu thưởng sau trận +' + Math.round(v * 100) + '%' },
    kick: { name: 'Đà Xuất Phát', val: (lv) => 3 + 0.8 * (lv - 1),              // chọn: 3 → 10,2 km/h cộng vào tốc độ lúc GO
      text: (v) => 'Lúc xuất phát được đẩy thêm ' + v.toFixed(1).replace('.', ',') + ' km/h' },
    xp: { name: 'Thêm Kinh Nghiệm', val: (lv) => 0.05 + 0.02 * (lv - 1),        // chọn: +5% → +23% XP trận
      text: (v) => 'XP sau trận +' + Math.round(v * 100) + '%' },
    shield: { name: 'Né Đạo Cụ', val: (lv) => 0.08 + 0.03 * (lv - 1),           // chọn: 8% → 35% bỏ qua đòn đạo cụ trúng mình
      text: (v) => Math.round(v * 100) + '% cơ hội bỏ qua đòn đạo cụ trúng mình (chế độ đạo cụ)' },
  };
  // Độ hiếm: giá mua và hệ số phí nâng cấp (cấp lv → lv+1 tốn up·lv xu). chọn: xu thưởng một trận 50–300.
  const RARITY = [
    { id: 'n', name: 'Thường', price: 1500, up: 200, color: '#9fb4d0' },
    { id: 'r', name: 'Hiếm', price: 4000, up: 320, color: '#4aa8ff' },
    { id: 'e', name: 'Cực Phẩm', price: 9000, up: 480, color: '#ffb52e' },       // src: "Pet Cực Phẩm"
  ];
  // scale: chiều cao thân tính theo cạnh dài nhất của mô hình đã chuẩn hoá (1 = 100%).
  TD.PETS = [
    { id: '00002', name: 'Cánh Cụt Hồng', rarity: 0, skill: 'gauge', scale: 0.85 },
    { id: '00003', name: 'Cánh Cụt Đen', rarity: 0, skill: 'coin', scale: 0.85 },
    { id: '00027', name: 'Vịt Con', rarity: 0, skill: 'xp', scale: 0.8 },
    { id: '00010', name: 'Cáo Xanh', rarity: 1, skill: 'kick', scale: 1.05 },
    { id: '00015', name: 'Thỏ Trăng', rarity: 1, skill: 'shield', scale: 1.0 },
    { id: '00039', name: 'Gấu Bông', rarity: 1, skill: 'coin', scale: 0.95 },
    { id: '00021', name: 'Dê Mắt Xanh', rarity: 2, skill: 'gauge', scale: 1.1 },
    { id: '00098', name: 'Gấu Cam', rarity: 2, skill: 'kick', scale: 0.95 },
  ];
  const BY = {};
  TD.PETS.forEach((p) => { BY[p.id] = p; });
  P.def = (id) => BY[id] || null;
  P.rarity = (id) => RARITY[BY[id].rarity];

  // ---------- bản lưu: pets = { owned: { id: cấp }, on: id | '' } ----------
  const save = () => TD.save.d;
  const st = () => { const d = save(); if (!d.pets) d.pets = { owned: {}, on: '' }; return d.pets; };
  TD.save.norms.push((o) => {
    const src = o.pets && typeof o.pets === 'object' ? o.pets : {}, owned = {};
    if (src.owned && typeof src.owned === 'object') {
      for (const id of Object.keys(src.owned)) if (BY[id]) owned[id] = Math.max(1, Math.min(MAXLV, src.owned[id] | 0));
    }
    o.pets = { owned, on: owned[src.on] ? src.on : '' };
  });

  P.owns = (id) => !!st().owned[id];
  P.level = (id) => st().owned[id] | 0;
  P.count = () => Object.keys(st().owned).length;
  P.active = () => { const id = st().on; return id && BY[id] ? BY[id] : null; };
  P.price = (id) => RARITY[BY[id].rarity].price;
  P.upgradeCost = (id, lv) => RARITY[BY[id].rarity].up * lv;
  P.skillValue = (id, lv) => SKILLS[BY[id].skill].val(lv == null ? P.level(id) : lv);
  P.skillText = (id, lv) => SKILLS[BY[id].skill].text(P.skillValue(id, lv));

  P.buy = function (id) {
    const d = save();
    if (!BY[id]) return { ok: false, why: 'không có pet này' };
    if (P.owns(id)) return { ok: false, why: 'đã có pet này' };
    if (d.coins < P.price(id)) return { ok: false, why: 'không đủ xu: cần ' + fmt(P.price(id)) + ', còn ' + fmt(d.coins) };
    d.coins -= P.price(id);
    st().owned[id] = 1;
    if (!st().on) st().on = id;
    TD.save.save();
    return { ok: true };
  };
  P.upgrade = function (id) {
    const d = save(), lv = P.level(id);
    if (!lv) return { ok: false, why: 'cần nhận pet trước' };
    if (lv >= MAXLV) return { ok: false, why: 'pet đã đạt cấp tối đa' };
    const cost = P.upgradeCost(id, lv);
    if (d.coins < cost) return { ok: false, why: 'không đủ xu: cần ' + fmt(cost) + ', còn ' + fmt(d.coins) };
    d.coins -= cost;
    st().owned[id] = lv + 1;
    TD.save.save();
    return { ok: true, level: lv + 1, cost };
  };
  P.equip = function (id) {
    if (id && !P.owns(id)) return { ok: false, why: 'cần nhận pet trước' };
    st().on = id || '';
    TD.save.save();
    return { ok: true };
  };
  // Cho gacha và phần thưởng: pet mới vào túi (cấp 1); đã có thì hoàn 1/5 giá mua bằng xu (chọn). Trả { ok, isNew, refund }.
  P.grant = function (id) {
    if (!BY[id]) return { ok: false, why: 'không có pet này' };
    if (P.owns(id)) {
      const refund = Math.round(P.price(id) / 5);
      save().coins += refund;
      TD.save.save();
      return { ok: true, isNew: false, refund };
    }
    st().owned[id] = 1;
    if (!st().on) st().on = id;
    TD.save.save();
    return { ok: true, isNew: true, refund: 0 };
  };

  // ---------- mô hình ----------
  const loads = {};
  function model(id) {
    if (loads[id]) return loads[id];
    const l = new THREE.GLTFLoader();
    l.setMeshoptDecoder(window.MeshoptDecoder);
    loads[id] = fetch(A + 'pet_' + id + '.glb?v=' + (TD.REV || '')).then((r) => { if (!r.ok) throw new Error('pet_' + id + '.glb http ' + r.status); return r.arrayBuffer(); })
      .then((b) => new Promise((ok, no) => l.parse(b, '', ok, no)))
      .then((g) => {
        g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.roughness = 0.85; o.material.metalness = 0; } } });
        return g.scene;
      });
    return loads[id];
  }
  // Nhóm pet mới (mô hình dùng chung hình học/vật liệu giữa các bản sao): g.position là chỗ đặt, g.pet là thân.
  function spawn(def, size) {
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body); g.pet = body;
    model(def.id).then((m) => { const c = m.clone(true); c.scale.setScalar(size * def.scale); body.add(c); g.loaded = true; })
      .catch((e) => console.error(e));
    return g;
  }
  P.model = model;

  // ---------- pet bên xe ----------
  const SIDE = -1.75, HEIGHT = 1.35, SIZE = 0.9;
  // Bot cũng mang pet cho vui (không có kỹ năng): chọn theo tên để mỗi bot giữ pet cố định trong trận.
  function botPet(k) {
    let h = (k.id | 0) * 2654435761;
    for (const ch of String(k.name || '')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
    const i = h % (TD.PETS.length * 2);
    return TD.PETS[i] || null;
  }
  TD.kartView.hooks.ready.push((v) => {
    const def = v.kart.ctrl === 'human' ? P.active() : v.kart.ctrl === 'bot' ? botPet(v.kart) : null;
    if (!def) return;
    const g = spawn(def, SIZE);
    g.position.set(SIDE, HEIGHT, 0.4);
    v.root.add(g);
    v.petv = { g, t: Math.random() * 6, x: SIDE, y: HEIGHT, z: 0.4, def };
  });
  TD.kartView.hooks.update.push((v, dt) => {
    const p = v.petv;
    if (!p) return;
    const k = v.kart, a = 1 - Math.exp(-dt * 4);
    p.t += dt;
    // Nhấp nhô, nghiêng ra ngoài khi đánh lái, tụt ra sau khi xe lao nhanh; lên cao khi xe bay.
    const sp = Math.min(1, Math.abs(k.speed) / 60), air = k.grounded === false ? 0.35 : 0;
    p.x += (SIDE - k.input.steer * 0.3 - p.x) * a;
    p.z += (0.5 - sp * 0.9 - p.z) * a;
    p.y += (HEIGHT + air - p.y) * a;
    p.g.position.set(p.x, p.y + Math.sin(p.t * 2.4) * 0.14, p.z);
    p.g.pet.rotation.set(Math.sin(p.t * 1.7) * 0.05 + sp * 0.18, Math.sin(p.t * 0.9) * 0.15, -k.input.steer * 0.25 + Math.sin(p.t * 2.1) * 0.05);
  });

  // ---------- kỹ năng trong trận ----------
  // Điều kiện đo được: bình nitro ngay sau GO (gauge), tốc độ lúc GO (kick), xu/XP ở màn thưởng, đòn đạo cụ bỏ qua (shield).
  P.roll = () => Math.random();   // test thay bằng giá trị cố định
  TD.racePlugins = TD.racePlugins || [];
  P.plugin = {
    start(ctx) { ctx.pet = P.active(); ctx.petLv = ctx.pet ? P.level(ctx.pet.id) : 0; ctx.petBlocked = 0; },
    event(e, mine, ctx) {
      const def = ctx.pet, me = ctx.me;
      if (!def) return;
      const v = SKILLS[def.skill].val(ctx.petLv);
      if (e.type === 'go') {
        if (def.skill === 'gauge') me.nitro.gauge = Math.min(1, me.nitro.gauge + v);
        else if (def.skill === 'kick') me.speed += v / 3.6;
      } else if (e.type === 'item_hit' && mine && def.skill === 'shield' && P.roll() < v && me.fx) {
        me.fx.stunT = 0; me.fx.slowT = 0; me.fx.slowMul = 1;
        ctx.petBlocked++;
      }
    },
    settle(F, ctx) {
      const def = ctx.pet;
      if (!def || F.dnf) return;
      const v = SKILLS[def.skill].val(ctx.petLv), d = save();
      let line = null;
      if (def.skill === 'coin') { const add = Math.round(F.reward * v); d.coins += add; F.reward += add; line = '+' + fmt(add) + ' xu'; }
      else if (def.skill === 'xp') { const add = Math.round(F.xp * v); d.xp += add; F.xp += add; line = '+' + fmt(add) + ' XP'; }
      if (line) F.cards.push(`<div class="fin-card"><h4>PET ${esc(def.name)}</h4><div class="fin-gain">${line}</div><small>${esc(SKILLS[def.skill].name)}</small></div>`);
    },
  };
  TD.racePlugins.push(P.plugin);

  // ---------- màn PET ----------
  const S = { sel: null, msg: '', msgT: 0, open: false, stage: null, raf: 0, yaw: 0, shown: null };
  const root = () => document.getElementById('ui');
  const STAGE_Z = -40;   // xa xe để xe không lọt khung

  function frame() {
    const asp = innerWidth / innerHeight, fov = 45, dist = 4.2, w = 2 * dist * Math.tan(fov * Math.PI / 360) * asp, x = (0.5 - 0.27) * w;
    TD.main.lobbyCam = { pos: [x, 1.0, STAGE_Z + dist], look: [x, 0.8, STAGE_Z], fov };
  }
  function stageShow(id) {
    const scene = TD.main.show && TD.main.show.scene;
    if (!scene || S.shown === id) return;
    S.shown = id;
    if (S.stage) scene.remove(S.stage);
    const g = S.stage = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.35, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01;
    g.add(disc);
    const pet = spawn(BY[id], 1.5);
    pet.pet.position.y = 0.05;
    g.add(pet); g.petBody = pet.pet;
    g.position.set(0, 0, STAGE_Z);
    scene.add(g);
  }
  function tick() {
    if (!S.open) return;
    S.raf = requestAnimationFrame(tick);
    const g = S.stage;
    if (!g) return;
    S.yaw += 0.012;
    g.petBody.rotation.y = Math.sin(S.yaw) * 0.7;
    g.petBody.position.y = 0.05 + (Math.sin(S.yaw * 3) + 1) * 0.04;
  }
  function say(t) {
    S.msg = t; clearTimeout(S.msgT);
    S.msgT = setTimeout(() => { S.msg = ''; if (S.open) draw(); }, 2200);
  }
  const coinImg = '<img src="art/ui/coin.png" alt="">';

  function panel(def) {
    if (!def) return '';
    const own = P.owns(def.id), lv = P.level(def.id), r = RARITY[def.rarity], sk = SKILLS[def.skill], d = save(), on = st().on === def.id;
    const cur = P.skillText(def.id, own ? lv : 1);
    let acts;
    if (!own) acts = `<button class="gbtn gold" data-do="buy">Mua ${coinImg} ${fmt(r.price)}</button>`;
    else {
      const eq = `<button class="gbtn ${on ? 'gray' : 'blue'}" data-do="${on ? 'off' : 'on'}">${on ? 'Xóa PET' : 'Mang theo'}</button>`;
      const up = lv >= MAXLV ? '<span class="gown">Cấp tối đa</span>' : `<button class="gbtn gold" data-do="up">Nâng cấp ${coinImg} ${fmt(P.upgradeCost(def.id, lv))}</button>`;
      acts = eq + up;
    }
    return `<div class="gpanel pt-panel">
      <div class="ghead"><h2>${esc(def.name)}</h2><span class="pt-rar" style="--c:${r.color}">${r.name}</span></div>
      <div class="grow"><span>Cấp</span><b>${own ? 'Lv.' + lv + '/' + MAXLV : 'Chưa có'}</b></div>
      <h3>Kỹ năng: ${esc(sk.name)}</h3>
      <p class="pt-skill">${esc(cur)}</p>
      ${own && lv < MAXLV ? `<p class="gnote">Lv.${lv + 1}: ${esc(P.skillText(def.id, lv + 1))}</p>` : ''}
      <div class="pt-acts">${acts}</div>
    </div>`;
  }
  function strip() {
    return `<div class="gstrip pt-strip">${TD.PETS.map((p) => {
      const own = P.owns(p.id), r = RARITY[p.rarity];
      return `<button class="gcar pt-card${S.sel === p.id ? ' on' : ''}${own ? '' : ' lock'}" data-pet="${p.id}" style="--c:${r.color}">
        <img src="${A}icon_${p.id}.webp" alt=""><span class="gname">${esc(p.name)}<small>${own ? 'Lv.' + P.level(p.id) : fmt(r.price) + ' xu'}</small></span>${st().on === p.id ? '<i class="pt-eq">✓</i>' : ''}</button>`;
    }).join('')}</div>`;
  }
  function draw() {
    const d = save(), def = BY[S.sel];
    root().innerHTML = `<div class="gr pt">
      <div class="gtop"><button class="gback" data-do="back" aria-label="Về sảnh">‹</button>
        <div class="pt-title"><b>PET</b><small>Tổng số PET: ${P.count()}/${TD.PETS.length}</small></div>
        <div class="gcoins" aria-label="Xu">${coinImg}<b>${fmt(d.coins)}</b></div></div>
      ${panel(def)}${strip()}${S.msg ? `<div class="gmsg">${esc(S.msg)}</div>` : ''}</div>`;
    const cur = root().querySelector('.pt-card.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function select(id) { S.sel = id; stageShow(id); draw(); }
  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    sfx('Play_UI_Click');
    if (b.dataset.pet) return select(b.dataset.pet);
    const act = b.dataset.do, id = S.sel;
    if (act === 'back') return P.leave();
    let r;
    if (act === 'buy') { r = P.buy(id); if (r.ok) say('Nhận PET mới: ' + BY[id].name); }
    else if (act === 'up') { r = P.upgrade(id); if (r.ok) say('PET tăng cấp! Lv.' + r.level); }
    else if (act === 'on') { r = P.equip(id); if (r.ok) say('Đã mang ' + BY[id].name); }
    else if (act === 'off') { r = P.equip(null); if (r.ok) say('Đã xóa PET'); }
    if (r && !r.ok) say(r.why[0].toUpperCase() + r.why.slice(1));
    draw();
  }
  function onKey(e) { if (S.open && e.code === 'Escape') P.leave(); }

  P.open = function () {
    S.open = true; S.shown = null;
    S.sel = st().on || (TD.PETS[0] && TD.PETS[0].id);
    frame();
    stageShow(S.sel);
    root().onclick = onClick;
    draw();
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(tick);
  };
  P.leave = function () {
    S.open = false; S.msg = ''; clearTimeout(S.msgT); cancelAnimationFrame(S.raf);
    const sc = TD.main.show && TD.main.show.scene;
    if (S.stage && sc) sc.remove(S.stage);
    S.stage = null; S.shown = null;
    root().onclick = null;
    TD.main.lobbyCam = null;
    if (TD.lobby && TD.lobby.show) TD.lobby.show();
    // Pet đang mang vừa đổi: dựng lại xe trưng bày để pet bên xe cập nhật.
    if (TD.main.show) { TD.main.show.key = null; TD.main.showCar(save().car, save().driver); }
  };
  addEventListener('keydown', onKey);

  TD.lobby.add({ id: 'pet', where: 'bar', label: 'PET', icon: A + 'icon_00002.webp', order: 10, open: P.open });
})(globalThis.TD = globalThis.TD || {});
