// Thời Trang: mua và mặc bộ đồ cho tay đua (nhánh Thời trang). Bố cục theo Cửa Hàng 2018 (clip 6LiiPhwXBjw t=150, t=529):
// cột mục bên trái (Bộ / Tóc / Trang Phục), lưới thẻ 3 cột có giá, tay đua xem thử bên phải, nút Nam/Nữ.
// Mô hình: art/outfits (tools/export_outfits.py) từ các phần cùng mã trong avatar/character của APK, cùng khung xương với
// art/drivers nên hoạt ảnh lái giữ nguyên. APK không có bảng tên món đồ (tên trên máy chủ): tên bộ dưới đây là tên chọn.
(function (TD) {
  'use strict';
  const A = 'art/outfits/';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (e) => TD.audio && TD.audio.play(e);
  const fmt = (n) => Math.round(n).toLocaleString('vi-VN');
  const root = () => document.getElementById('ui');

  // [id, giới, tên, giá Bộ]. Giá chọn: ngang xe hạng C–B (600–5.400 xu ở Gara), một bộ ≈ 4–8 trận thưởng nhiệm vụ.
  // Tóc bán lẻ 30% giá bộ, Trang Phục (áo + quần + giày) 80%; mua Bộ là có cả hai.
  const LOOKS = [
    ['m00013', 'nam', 'Đồng Phục Xanh', 1500], ['m00166', 'nam', 'Mùa Hè Đỏ', 1800], ['m00775', 'nam', 'Hoodie Trắng', 2200],
    ['m01889', 'nam', 'Khoác Lá Non', 2600], ['m00618', 'nam', 'Bá Tước Lục', 2800], ['m01155', 'nam', 'Phi Công Trắng', 3200],
    ['m00032', 'nam', 'Đồ Đua Tím', 3600], ['m00617', 'nam', 'Mèo Cam', 4200],
    ['f00013', 'nu', 'Đồng Phục Xanh', 1500], ['f00166', 'nu', 'Hồng Ngọt', 1800], ['f00775', 'nu', 'Phố Thị', 2200],
    ['f01889', 'nu', 'Mùa Xuân', 2600], ['f00618', 'nu', 'Dạ Hội Lục', 2800], ['f01155', 'nu', 'Phi Công Trắng', 3200],
    ['f00032', 'nu', 'Đồ Đua Vàng', 3600], ['f00617', 'nu', 'Mèo Cam', 4200],
  ];
  // Bộ Tân Thủ = tay đua mặc định (art/drivers, bộ 00500 của APK): luôn có, giá 0. Tóc của nó xuất riêng để đổi về.
  const BASE = { nam: 'm00500', nu: 'f00500' };
  const OUT = TD.OUTFITS = {};
  function add(id, g, name, price, glb) {
    OUT[id] = { id, kind: 'bo', g, name: 'Bộ ' + name, price, glb, icon: A + id + '.webp', set: id };
    OUT[id + '_do'] = { id: id + '_do', kind: 'do', g, name: name, price: Math.round(price * 0.8 / 50) * 50, glb, icon: A + id + '.webp', set: id };
    OUT[id + '_hair'] = { id: id + '_hair', kind: 'toc', g, name: 'Tóc ' + name, price: Math.round(price * 0.3 / 50) * 50, glb: A + id + '_hair.glb', icon: A + id + '_hair.webp', set: id };
  }
  for (const g of ['nam', 'nu']) add(BASE[g], g, 'Tân Thủ', 0, null);   // glb null = TD.DRIVERS[g].glb
  for (const [id, g, name, price] of LOOKS) add(id, g, name, price, A + id + '.glb');

  // ---------- bản lưu ----------
  // outfits = { owned: [id], on: { nam: id bộ, nu: id bộ }, hair: { nam: id tóc | null, nu } }; hair null = tóc của bộ đang mặc.
  const fresh = () => ({ owned: [], on: { nam: BASE.nam, nu: BASE.nu }, hair: { nam: null, nu: null } });
  TD.save.norms.push((o) => {
    const s = o.outfits && typeof o.outfits === 'object' ? o.outfits : {}, f = fresh();
    if (Array.isArray(s.owned)) f.owned = s.owned.filter((id, i, a) => OUT[id] && OUT[id].price > 0 && a.indexOf(id) === i);
    o.outfits = f;
    for (const g of ['nam', 'nu']) {
      const on = s.on && s.on[g], hr = s.hair && s.hair[g];
      if (OUT[on] && OUT[on].kind === 'bo' && OUT[on].g === g && F.wearable(on, f)) f.on[g] = on;
      if (OUT[hr] && OUT[hr].kind === 'toc' && OUT[hr].g === g && F.owns(hr, f) && OUT[hr].set !== f.on[g]) f.hair[g] = hr;
    }
  });

  const F = { preview: null, tab: 'bo', g: null };
  const S = () => TD.save.d.outfits;
  // Có món: mua lẻ, hoặc mua Bộ (gồm tóc + trang phục), hoặc món Tân Thủ.
  F.owns = function (id, s) {
    const o = OUT[id], sv = s || S();
    if (!o) return false;
    return o.price === 0 || sv.owned.indexOf(id) >= 0 || (o.kind !== 'bo' && sv.owned.indexOf(o.set) >= 0);
  };
  F.wearable = (setId, s) => F.owns(setId, s) || F.owns(setId + '_do', s);
  F.worn = (g) => ({ bo: S().on[g], hair: S().hair[g] || S().on[g] + '_hair' });

  // Nhánh Gacha/Phúc Lợi tặng món: true nếu là món mới. Bộ đã có lẻ phần nào thì vẫn thêm Bộ (đủ cả hai phần).
  F.grant = function (id) {
    const o = OUT[id];
    if (!o || F.owns(id)) return false;
    S().owned.push(id);
    TD.save.save();
    return true;
  };
  F.buy = function (id) {
    const o = OUT[id], d = TD.save.d;
    if (!o) return { ok: false, why: 'không có món này' };
    if (F.owns(id)) return { ok: false, why: 'Đã có' };
    if (d.coins < o.price) return { ok: false, why: 'Vàng không đủ' };
    d.coins -= o.price;
    S().owned.push(id);
    TD.save.save();
    return { ok: true, price: o.price };
  };
  // Mặc: Bộ thay cả tóc; Trang Phục giữ tóc đang để; Tóc chỉ đổi tóc. Mặc đồ giới kia thì đổi luôn tay đua.
  F.equip = function (id) {
    const o = OUT[id], s = S(), d = TD.save.d;
    if (!o || !F.owns(id)) return { ok: false, why: 'Chưa có' };
    const g = o.g;
    if (o.kind === 'toc') s.hair[g] = o.set === s.on[g] ? null : id;
    else {
      const keep = F.worn(g).hair;
      s.on[g] = o.set;
      s.hair[g] = o.kind === 'do' && OUT[keep].set !== o.set ? keep : null;
    }
    if (TD.DRIVERS[g]) d.driver = g;
    TD.save.save();
    return { ok: true };
  };

  // ---------- áp lên xe ----------
  // Theo ô xuất phát + xe (không theo tên: sảnh đổi tên bot sau khi dựng xe), nên bục trao giải ra cùng bộ với trong trận.
  const hash = (k) => { let h = Math.imul((k.id | 0) + 1, 2654435761); for (const c of String(k.carId || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  // Bộ + tóc của một xe: người chơi theo bản lưu (đang xem thử thì theo món xem thử); bot chọn cố định theo ô + xe.
  F.lookOf = function (kart, g) {
    if (kart.ctrl === 'human') {
      const w = F.worn(g), p = F.preview && OUT[F.preview];
      if (p && p.g === g) {
        if (p.kind === 'toc') return { bo: w.bo, hair: p.id };
        return { bo: p.set, hair: p.kind === 'do' ? w.hair : p.set + '_hair' };
      }
      return w;
    }
    const pool = [BASE[g]].concat(LOOKS.filter((l) => l[1] === g).map((l) => l[0]));
    const bo = pool[hash(kart) % pool.length];
    return { bo, hair: bo + '_hair' };
  };
  const sexOf = (drv) => (drv && drv.source && drv.source.gender === 'female' ? 'nu' : 'nam');
  F.glbFor = function (kart, drv) {
    const o = OUT[F.lookOf(kart, sexOf(drv)).bo];
    return (o && o.glb) || null;
  };

  // Thay tóc trên tay đua đã dựng: ẩn lưới Hair của bộ, gắn lưới tóc từ <set>_hair.glb vào cùng bộ xương (theo tên xương);
  // xương riêng của tóc (đuôi tóc, nơ) không có trong bộ thì tạo mới dưới xương cha cùng tên.
  const bufs = {};
  function parse(url) {
    bufs[url] = bufs[url] || fetch(url + '?v=' + (TD.REV || '')).then((r) => { if (!r.ok) throw new Error(url + ' http ' + r.status); return r.arrayBuffer(); });
    return bufs[url].then((b) => new Promise((ok, no) => { const l = new THREE.GLTFLoader(); l.setMeshoptDecoder(window.MeshoptDecoder); l.parse(b.slice(0), '', ok, no); }));
  }
  function boneIn(drv, b, top) {
    const hit = drv.getObjectByName(b.name);
    if (hit) return hit;
    if (!b.parent || b.parent === top) return drv.children[0] || drv;   // nút gốc mang id bộ, khác tên giữa hai glb
    const nb = new THREE.Bone();
    nb.name = b.name; nb.position.copy(b.position); nb.quaternion.copy(b.quaternion); nb.scale.copy(b.scale);
    boneIn(drv, b.parent, top).add(nb);
    return nb;
  }
  F.dress = function (driver, hairId) {
    const o = OUT[hairId];
    if (!o || !driver) return Promise.resolve(false);
    return parse(o.glb).then((g) => {
      const old = driver.getObjectByName('Hair');
      const src = g.scene.getObjectByName('Hair');
      if (!src) return false;
      const meshes = [];
      src.traverse((m) => { if (m.isSkinnedMesh) meshes.push(m); });
      const host = (old && old.parent) || driver;
      for (const m of meshes) {
        const bones = m.skeleton.bones.map((b) => boneIn(driver, b, g.scene));
        m.bind(new THREE.Skeleton(bones, m.skeleton.boneInverses), m.bindMatrix);
        m.frustumCulled = false;
        m.name = 'HairSwap';
        host.add(m);
      }
      if (old) old.visible = false;
      return true;
    });
  };

  // Tóc mua riêng của một xe lên tay đua đã dựng (xe trong trận, xe trưng bày; bục trao giải gọi trực tiếp).
  F.applyHair = function (kart, driver) {
    const drv = TD.DRIVERS[kart.driverId];
    if (!drv || !driver) return Promise.resolve(false);
    const lk = F.lookOf(kart, sexOf(drv));
    if (!OUT[lk.hair] || OUT[lk.hair].set === lk.bo) return Promise.resolve(false);
    return F.dress(driver, lk.hair).catch((e) => { TD.warnOnce('hair' + lk.hair, String(e)); return false; });
  };
  if (TD.kartView) {
    TD.kartView.hooks.driverGlb.push((kart, drv) => F.glbFor(kart, drv));
    TD.kartView.hooks.ready.push((v) => { if (v.driver) v.hairLoading = F.applyHair(v.kart, v.driver); });
  }

  // ---------- màn Thời Trang ----------
  const TABS = [['bo', 'Bộ'], ['toc', 'Tóc'], ['do', 'Trang Phục']];   // src: chuỗi aa07210a, 150d4d72, 297e7e25
  // Tay đua ở 72% bề ngang (cửa hàng gốc: nhân vật bên phải), camera gần hơn sảnh nhưng đủ chỗ cho động tác đứng dậy idle.
  const CAM = { fov: 34, dist: 7.8, y: 2.2, lookY: 1.15, at: 0.72 };
  function applyCam() {
    if (!TD.main || F.screen !== true) return;
    const half = CAM.dist * Math.tan(CAM.fov / 2 * Math.PI / 180) * innerWidth / innerHeight;
    const dx = (0.5 - CAM.at) * 2 * half;
    TD.main.lobbyCam = { pos: [dx, CAM.y, CAM.dist], look: [dx, CAM.lookY, 0], fov: CAM.fov };
  }
  addEventListener('resize', applyCam);

  // Dựng lại xe trưng bày (main.js chỉ dựng lại khi đổi cặp xe/tay đua).
  function reshow() {
    const M = TD.main, d = TD.save.d;
    if (!M || !M.showCar) return;
    if (M.show) M.show.key = null;
    M.showCar(d.car, F.g);
  }

  function toast(msg) {
    const r = root(), old = r.querySelector('.fs-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'fs-toast';
    t.textContent = msg;
    r.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  function isWorn(o) {
    const w = F.worn(o.g);
    if (o.kind === 'toc') return w.hair === o.id;
    if (o.kind === 'do') return w.bo === o.set;
    return w.bo === o.set && w.hair === o.set + '_hair';
  }
  function card(o) {
    const own = F.owns(o.id), worn = isWorn(o);
    const btn = worn ? '<button class="fs-btn gray" disabled>Đã mặc</button>'
      : own ? `<button class="fs-btn blue" data-wear="${o.id}">Mặc</button>`
        : `<button class="fs-btn gold" data-buy="${o.id}"><img src="art/lobby/coin.webp" alt="">${fmt(o.price)}</button>`;
    return `<div class="fs-card${F.preview === o.id ? ' on' : ''}${worn ? ' worn' : ''} k-${o.kind}">
      <button class="fs-pick" data-pick="${o.id}" aria-label="${esc(o.name)}"><img src="${o.icon}?v=${TD.REV || ''}" alt=""></button>
      <b>${esc(o.name)}</b>${btn}</div>`;
  }

  F.open = function (tab) {
    const d = TD.save.d;
    F.screen = true;
    F.tab = tab || F.tab;
    F.g = F.g || (d.driver === 'nu' ? 'nu' : 'nam');
    render();
    reshow();
    applyCam();
  };
  function render() {
    const d = TD.save.d;
    const list = Object.values(OUT).filter((o) => o.kind === F.tab && o.g === F.g);
    const r = root();
    r.innerHTML = `
<div class="fs">
  <div class="fs-top">
    <button class="fs-back" data-act="back" aria-label="Về sảnh"><img src="art/lobby/back.webp" alt=""></button>
    <b class="fs-title">Thời Trang</b>
    <div class="fs-sex">${[['nam', 'Nam'], ['nu', 'Nữ']].map(([g, n]) => `<button class="${F.g === g ? 'on' : ''}" data-g="${g}">${n}</button>`).join('')}</div>
    <div class="fs-coins"><img src="art/lobby/coin.webp" alt=""><b>${fmt(d.coins)}</b></div>
  </div>
  <nav class="fs-tabs">${TABS.map(([t, n]) => `<button class="${F.tab === t ? 'on' : ''}" data-tab="${t}">${n}</button>`).join('')}</nav>
  <div class="fs-grid">${list.map(card).join('')}</div>
</div>`;
    r.onclick = onClick;
  }
  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const ds = b.dataset;
    if (ds.act === 'back') { sfx('Play_UI_Back'); F.close(); return; }
    sfx('Play_UI_Click');
    if (ds.tab) { F.tab = ds.tab; render(); }
    else if (ds.g) { F.g = ds.g; F.preview = null; render(); reshow(); }
    else if (ds.pick) { F.preview = F.preview === ds.pick ? null : ds.pick; render(); reshow(); }
    else if (ds.buy) {
      const r = F.buy(ds.buy);
      if (!r.ok) { toast(r.why); return; }
      sfx('Play_UI_Confirm');
      F.equip(ds.buy); F.preview = null;
      render(); reshow();
      toast('Mua thành công');
    } else if (ds.wear) { F.equip(ds.wear); F.preview = null; render(); reshow(); }
  }
  // Rời màn: bỏ xem thử, tay đua trưng bày về đúng bộ đang mặc của tay đua đang chọn.
  F.close = function () {
    F.screen = false; F.preview = null;
    const d = TD.save.d;
    F.g = null;
    if (TD.main && TD.main.show) TD.main.show.key = null;
    if (TD.main && TD.main.showCar) TD.main.showCar(d.car, d.driver);
    TD.lobby.show();
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && F.screen && TD.main && TD.main.state === 'lobby') F.close();
  });

  // src: sprite Icon_Cloth của atlas og_lobby (tools/export_outfits.py → art/outfits/icon.webp).
  if (TD.lobby && TD.lobby.add) TD.lobby.add({ id: 'fashion', where: 'bar', label: 'Thời Trang', icon: A + 'icon.webp', order: 20, open: () => F.open('bo') });

  TD.fashion = F;
})(globalThis.TD = globalThis.TD || {});
