// Pha shop: quán sushi của Bancho thành trạm mua đồ kiểu REPO, giữa hai lượt lặn.
// Phòng dựng từ lớp quán gốc (../ho-xanh/data/bar_assets.js, art/bar/**), Dave đi bằng sprite quán của Dave the Diver.
// Luật REPO: mỗi lần ghé bày 3 nâng cấp + 5 đồ nghề + kệ O₂; nhặt một món (E), đặt lên quầy của Bancho, đứng trên thảm
// thanh toán 3 giây thì ví ca trả tiền. Đi tới cửa trái đứng 3 giây là ra khơi (gọi then).
// Số bày/giá: BDL.ITEMS (data/content.js): giá nâng cấp = base × 1,6^số lần đã mua, mỗi món nâng cấp tối đa 3 lần mỗi ca.
window.BDL = window.BDL || {};
(function (HX, BDL) {
  'use strict';

  var REV = ((document.currentScript && document.currentScript.src || '').split('v=')[1] || '').split('&')[0];
  var Q = REV ? '?v=' + REV : '';
  function root() { return HX.ROOT || window.HX_ROOT || '../ho-xanh/'; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmt(n) { return BDL.fmt ? BDL.fmt(n) : '$' + Math.round(n).toLocaleString('vi-VN'); }

  // ---------- nạp tệp dữ liệu mà index.html chưa có thẻ script ----------
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('script not found: ' + src)); };
      document.head.appendChild(s);
    });
  }
  var contentP = null, barP = null;
  function ensureContent() {
    if (BDL.ITEMS) return Promise.resolve();
    return contentP || (contentP = loadScript('data/content.js' + Q).catch(function (e) { contentP = null; throw e; }));
  }
  function ensureBar() {
    if (window.HX_BAR_ASSETS) return Promise.resolve();
    return barP || (barP = loadScript(root() + 'data/bar_assets.js' + Q).catch(function (e) { barP = null; throw e; }));
  }
  ensureContent().catch(function () { /* pha shop báo lỗi khi vào */ });

  function itemOf(key) {
    if (BDL.ITEM_BY_KEY) return BDL.ITEM_BY_KEY[key] || null;
    var l = BDL.ITEMS || [];
    for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i];
    return null;
  }

  // ---------- nạp đạn lại đầu mỗi chuyến lặn (napDanLai của REPO) ----------
  // Súng và cận chiến (ammo: true) đầy lại; đồ ném, thuốc, dụng cụ dùng hết là hết.
  BDL.restock = function (ca) {
    ca = ca || (BDL.run && BDL.run.ca);
    if (!ca || !ca.stash) return 0;
    var n = 0;
    ca.stash.forEach(function (s) {
      var it = itemOf(s.key);
      if (it && it.ammo && s.uses !== it.uses) { s.uses = it.uses; n++; }
    });
    return n;
  };

  // ---------- sổ bày hàng của một lần ghé ----------
  var GEAR_KINDS = { gun: 1, melee: 1, throw: 1, tool: 1 };
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function bought(ca, key) { return (ca.bought && ca.bought[key]) || 0; }
  function upgBought(ca, key) { return (ca.upg && ca.upg[key]) || 0; }
  function maxOffers() { return (BDL.content && BDL.content.station.upgradeMaxOffers) || 3; }
  function stockLeft(ca, it) { return it.kind === 'upgrade' ? maxOffers() - upgBought(ca, it.key) : (it.stock || 1) - bought(ca, it.key); }

  function priceOf(ca, g) {
    var it = g.item;
    if (it.kind === 'upgrade') return BDL.upgradePrice ? BDL.upgradePrice(it.key, upgBought(ca, it.key)) : Math.round(it.price * Math.pow(1.6, upgBought(ca, it.key)));
    return it.price;
  }

  // Mỗi lần ghé (mỗi lượt lặn xong) bày lại một lần; vào lại cùng lần ghé thì giữ nguyên sổ.
  function rollStock(ca, forceKeys) {
    var visit = ca.cleared || 0;
    if (!forceKeys && ca.shopRoll && ca.shopRoll.visit === visit) return ca.shopRoll;
    var items = BDL.ITEMS, goods = [];
    function pick(list, n, section) {
      shuffle(list).slice(0, n).forEach(function (it) { goods.push({ key: it.key, section: section, sold: false }); });
    }
    if (forceKeys) {
      forceKeys.forEach(function (k) {
        var it = itemOf(k);
        if (it) goods.push({ key: k, section: it.kind === 'upgrade' ? 'up' : it.kind === 'heal' ? 'o2' : 'gear', sold: false });
      });
    } else {
      pick(items.filter(function (it) { return it.kind === 'upgrade' && stockLeft(ca, it) > 0; }), 3, 'up');
      var gear = items.filter(function (it) { return GEAR_KINDS[it.kind] && it.price > 0 && stockLeft(ca, it) > 0; });
      var chosen = [];
      // ít nhất một súng và một món cận chiến cho khỏi ra ca không có gì để đánh
      ['gun', 'melee'].forEach(function (kind) {
        var c = shuffle(gear.filter(function (it) { return it.kind === kind; }))[0];
        if (c) chosen.push(c);
      });
      shuffle(gear.filter(function (it) { return chosen.indexOf(it) < 0; })).slice(0, 5 - chosen.length).forEach(function (it) { chosen.push(it); });
      shuffle(chosen).forEach(function (it) { goods.push({ key: it.key, section: 'gear', sold: false }); });
      items.filter(function (it) { return it.kind === 'heal'; }).forEach(function (it) { goods.push({ key: it.key, section: 'o2', sold: stockLeft(ca, it) <= 0 }); });
    }
    ca.shopRoll = { visit: visit, goods: goods };
    return ca.shopRoll;
  }

  // ---------- hình ----------
  var IMG = {};
  function img(src) {
    var i = IMG[src];
    if (!i) { i = IMG[src] = new Image(); i.src = src; }
    return i;
  }
  function rimg(rel) { return img(root() + rel + Q); }
  function ok(i) { return !!i && i.complete && i.naturalWidth > 0; }
  function isImg(icon) { return /\.(png|jpe?g|webp|svg)$/i.test(icon || ''); }

  // ---------- số ----------
  var T = {
    speed: 180, runK: 1.6,        // px phòng/giây, như quán gốc [ĐỀ XUẤT trong ho-xanh]
    reach: 24,                    // đứng cách món trong khoảng này mới nhặt được
    payTime: 3, leaveTime: 3,     // REPO: 3 giây ở thảm thanh toán, 3 giây ở cửa ra khơi
    minX: 30, maxX: 968,
    counterY: 452,                // mặt quầy trước (counter_140 bắt đầu y 450)
    floorY: 513,
    counterX0: 830,               // từ đây trở sang phải là quầy của Bancho (nhận hàng)
    payX: 928, payHalf: 34,       // thảm thanh toán
    doorX: 66,                    // đứng ở đây trở sang trái = cửa ra khơi
    sections: {
      up:   { x0: 232, dx: 44, label: 'NÂNG CẤP', col: '#ffd24a' },
      gear: { x0: 372, dx: 56, label: 'ĐỒ NGHỀ', col: '#5fd0ee' },
      o2:   { x0: 666, dx: 44, label: 'BÌNH O₂', col: '#7fe0a8' },
    },
    basketX0: 872, basketDx: 30, basketCols: 4, basketRowDy: 24,
  };

  var VIEW_W = 870, MIN_VH = 280, VIEW_BOTTOM = 568, SNAP = 0.5;

  // ---------- phòng: lớp quán gốc theo cấp ----------
  function slotVariant(slot, look) {
    for (var i = 0; i < look.items.length; i++) if (slot.variants[look.items[i]]) return slot.variants[look.items[i]];
    var k = slot.keys[String(look.interior)];
    return k ? slot.variants[k] || null : null;
  }
  // Cửa hàng sang dần theo ca: cấp trang trí của quán gốc (HX_META.BAR_TIERS) tăng theo số chuyến đã qua.
  var LOOKS = [
    { interior: 2, items: [] },
    { interior: 2, items: ['Sushi_ZoneA_Bonsai_Night', 'Sushi_ZoneC_KnifeDisplay_Night', 'Sushi_ZoneD_WallText_Night'] },
    { interior: 2, items: ['Sushi_ZoneA_LuckyCat_Night', 'Sushi_ZoneC_KnifeDisplay_Night', 'Sushi_ZoneD_Certificate_Night', 'Sushi_ZoneE_PatternLight_Night',
      'Sushi_Light_Round_1', 'Sushi_Light_Round_2', 'Sushi_Light_Round_3', 'Sushi_Light_Round_4'] },
    { interior: 2, items: ['Sushi_ZoneA_Lantern_Night', 'Sushi_ZoneB_Fan_Night', 'Sushi_ZoneC_PotRack_Night', 'Sushi_ZoneD_Certificate_Night', 'Sushi_ZoneE_StoneStandLight_Night',
      'Sushi_Light_Oriental_1', 'Sushi_Light_Oriental_2', 'Sushi_Light_Oriental_3', 'Sushi_Light_Oriental_4'] },
    { interior: 2, items: ['Sushi_ZoneA_Lantern_Night', 'Sushi_ZoneB_StuffedTuna_Night', 'Sushi_ZoneC_JapanesePainting_Night', 'Sushi_ZoneD_FlowerBasket_Night',
      'Sushi_ZoneE_MadagascarJasmine_Night', 'Sushi_Light_Rattan01_1', 'Sushi_Light_Rattan01_2', 'Sushi_Light_Rattan01_3', 'Sushi_Light_Rattan01_4'] },
  ];
  var FRONT_Z = 141;   // lớp có z lớn hơn vẽ SAU Dave (quầy chỉ cao tới hông Dave, nên z quầy = 140 là mốc)

  var S = null;   // trạng thái pha đang chạy

  function buildRoom() {
    var BA = window.HX_BAR_ASSETS, R = BA.room, IR = R.interior;
    var look = LOOKS[clamp((BDL.run.ca.cleared || 0), 0, LOOKS.length - 1)];
    var layers = R.layers.slice(), props = R.props.slice();
    Object.keys(IR.slots).forEach(function (k) {
      if (k === 'Sushi_SakeGroup') return;   // thùng rượu che quầy tính tiền
      var v = slotVariant(IR.slots[k], look);
      if (v) { layers = layers.concat(v.layers); props = props.concat(v.props); }
    });
    var back = [], front = [];
    layers.forEach(function (l) {
      var it = { z: l.z, layer: l, im: rimg(l.img) };
      if (l.blend !== 'add' && l.z > FRONT_Z) front.push(it); else back.push(it);
    });
    props.forEach(function (pr) {
      pr.parts.forEach(function (part) { back.push({ z: part.order, prop: pr, part: part, im: rimg(part.img) }); });
      Object.keys(pr.frames).forEach(function (k) { rimg(pr.frames[k].img); });
    });
    back.sort(function (a, b) { return a.z - b.z; });
    front.sort(function (a, b) { return a.z - b.z; });
    S.back = back; S.front = front;
    S.frontDirty = true;
  }

  function propFrame(prop, t) {
    var an = prop.anims[Object.keys(prop.anims)[0]];
    if (!an) return null;
    var fr = an.tracks ? an.tracks[''] : an.frames;
    if (!fr || !fr.length) return null;
    var tot = fr.reduce(function (s, f) { return s + f[1]; }, 0), ms = (t * 1000) % tot;
    for (var i = 0; i < fr.length; i++) { ms -= fr[i][1]; if (ms < 0) return prop.frames[fr[i][0]] || null; }
    return null;
  }

  // Ánh sáng LightOverlay (đích + đích × đèn), như quán gốc.
  function drawLight(ctx, l, im) {
    if (!ok(im)) return;
    var cv = S.lightCv || (S.lightCv = document.createElement('canvas'));
    if (cv.width < l.w) cv.width = l.w;
    if (cv.height < l.h) cv.height = l.h;
    var x = cv.getContext('2d');
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#000'; x.fillRect(0, 0, l.w, l.h);
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.drawImage(S.roomCv, l.x, l.y, l.w, l.h, 0, 0, l.w, l.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(cv, 0, 0, l.w, l.h, l.x, l.y, l.w, l.h);
    ctx.globalCompositeOperation = 'source-over';
  }

  var BG = '#070a12';
  function drawItems(ctx, list, t) {
    list.forEach(function (it) {
      if (it.layer) {
        if (it.layer.blend === 'add') drawLight(ctx, it.layer, it.im);
        else if (ok(it.im)) ctx.drawImage(it.im, it.layer.x, it.layer.y);
      } else if (it.prop) {
        var fr = propFrame(it.prop, t), part = it.part;
        if (fr) { var fi = rimg(fr.img); if (ok(fi)) ctx.drawImage(fi, Math.round(part.anchor[0] - fr.pivot[0]), Math.round(part.anchor[1] - fr.pivot[1])); }
        else if (ok(it.im)) ctx.drawImage(it.im, part.x, part.y);
      } else if (it.actor) it.actor.draw(ctx, true);
    });
  }
  function renderBack(t) {
    var R = window.HX_BAR_ASSETS.room, ctx = S.roomCtx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BG; ctx.fillRect(0, 0, R.size[0], R.size[1]);
    // Bancho đứng sau quầy: chèn vào danh sách theo z
    var list = S.back.slice();
    list.push({ z: S.bancho.z, actor: S.bancho });
    list.push({ z: S.cat.z, actor: S.cat });
    list.sort(function (a, b) { return a.z - b.z; });
    drawItems(ctx, list, t);
  }
  function renderFront() {
    if (!S.frontDirty && !S.front.some(function (it) { return !it.done && ok(it.im); })) return;
    var R = window.HX_BAR_ASSETS.room, ctx = S.frontCtx;
    ctx.clearRect(0, 0, R.size[0], R.size[1]);
    ctx.imageSmoothingEnabled = false;
    var all = true;
    S.front.forEach(function (it) { if (ok(it.im)) { ctx.drawImage(it.im, it.layer.x, it.layer.y); it.done = true; } else all = false; });
    S.frontDirty = !all;
  }

  // ---------- nhân vật ----------
  function Actor(ch, x, y, z) {
    this.ch = ch; this.sheet = rimg(ch.sheet); this.x = x; this.y = y; this.z = z; this.flip = false;
    this.name = null; this.t = 0; this.play(Object.keys(ch.anims)[0]);
  }
  Actor.prototype.play = function (name) {
    if (this.name === name) return;
    var a = this.ch.anims[name];
    if (!a) return;
    this.name = name; this.a = a; this.t = 0;
    this.total = a.frames.reduce(function (s, f) { return s + f[1]; }, 0);
  };
  Actor.prototype.update = function (dt) { this.t += dt * 1000; };
  Actor.prototype.cell = function () {
    var fr = this.a.frames, t = this.t % this.total;
    for (var i = 0; i < fr.length; i++) { t -= fr[i][1]; if (t < 0) return fr[i][0]; }
    return fr[fr.length - 1][0];
  };
  // toStage: vẽ thẳng lên sân khấu theo khung nhìn (Dave ở trên mặt quầy), ngược lại vẽ lên bản phòng
  Actor.prototype.draw = function (ctx, onRoom) {
    if (!ok(this.sheet)) return;
    var ch = this.ch, c = this.cell(), cw = ch.cell[0], chh = ch.cell[1];
    var sx = (c % ch.cols) * cw, sy = Math.floor(c / ch.cols) * chh;
    var X = Math.round(this.x), Y = Math.round(this.y) - ch.anchor[1];
    if (!onRoom) {
      var V = S.V, p = toStage(X, Y), k = V.s;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      if (this.flip) { ctx.translate(toStage(X, 0).x, 0); ctx.scale(-1, 1); ctx.drawImage(this.sheet, sx, sy, cw, chh, -ch.anchor[0] * k, p.y, cw * k, chh * k); }
      else ctx.drawImage(this.sheet, sx, sy, cw, chh, p.x - ch.anchor[0] * k, p.y, cw * k, chh * k);
      ctx.restore();
      return;
    }
    if (this.flip) {
      ctx.save(); ctx.translate(X, 0); ctx.scale(-1, 1);
      ctx.drawImage(this.sheet, sx, sy, cw, chh, -ch.anchor[0], Y, cw, chh);
      ctx.restore();
    } else ctx.drawImage(this.sheet, sx, sy, cw, chh, X - ch.anchor[0], Y, cw, chh);
  };

  // ---------- khung nhìn ----------
  function updateView(snap) {
    var R = window.HX_BAR_ASSETS.room, RW = R.size[0], RH = R.size[1], W = S.W, H = S.H, V = S.V;
    var s = Math.min(W / VIEW_W, H / MIN_VH);
    s = Math.max(SNAP, Math.round(s / SNAP) * SNAP);
    var vw = W / s, vh = H / s;
    V.s = s; V.vw = vw; V.vh = vh;
    if (vh >= RH) { V.y0 = 0; V.oy = Math.floor((H - RH * s) / 2); }
    else { V.y0 = Math.round(clamp(VIEW_BOTTOM - vh, 0, RH - vh)); V.oy = 0; }
    if (vw >= RW) { V.x0 = 0; V.ox = Math.floor((W - RW * s) / 2); V.camX = RW / 2; }
    else {
      var tx = clamp(S.dave.x - vw / 2, 0, RW - vw);
      V.camX = snap ? tx : V.camX + (tx - V.camX) * 0.12;
      V.x0 = Math.round(V.camX); V.ox = 0;
    }
  }
  function toStage(x, y) { var V = S.V; return { x: (x - V.x0) * V.s + V.ox, y: (y - V.y0) * V.s + V.oy }; }
  function blit(ctx, cv) {
    var R = window.HX_BAR_ASSETS.room, V = S.V;
    var sw = Math.min(R.size[0] - V.x0, Math.ceil(V.vw) + 1), sh = Math.min(R.size[1] - V.y0, Math.ceil(V.vh) + 1);
    ctx.drawImage(cv, V.x0, V.y0, sw, sh, V.ox, V.oy, sw * V.s, sh * V.s);
  }

  // ---------- hàng hoá ----------
  function buildGoods() {
    var ca = BDL.run.ca, roll = ca.shopRoll;
    S.goods = roll.goods.map(function (r, i) {
      var g = { i: i, r: r, item: itemOf(r.key), section: r.section, state: r.sold ? 'sold' : 'shelf', x: 0, y: T.counterY, slot: 0 };
      return g;
    });
    var cnt = { up: 0, gear: 0, o2: 0 };
    S.goods.forEach(function (g) { g.slot = cnt[g.section]++; g.hx = shelfX(g); });
    S.basket = [];
    S.carry = null;
  }
  function shelfX(g) { var s = T.sections[g.section]; return s.x0 + g.slot * s.dx; }
  function basketPos(idx) {
    return { x: T.basketX0 + (idx % T.basketCols) * T.basketDx, y: T.counterY - Math.floor(idx / T.basketCols) * T.basketRowDy };
  }
  function goodPos(g) {
    var d = S.dave;
    if (g.state === 'carried') return { x: d.x, y: d.y - 96 + Math.sin(S.t * 6) * 1.5 };
    if (g.state === 'counter') return basketPos(S.basket.indexOf(g));
    if (g.state === 'floor') return { x: g.fx, y: T.floorY - 6 };
    return { x: g.hx, y: T.counterY };
  }

  function say(msg, bad) { S.msg = msg; S.msgT = 2.8; S.msgBad = !!bad; }

  function nearest() {
    var best = null, bd = 1e9;
    S.goods.forEach(function (g) {
      if (g.state === 'sold' || g.state === 'carried') return;
      var p = goodPos(g), d = Math.abs(p.x - S.dave.x);
      if (d <= T.reach + (g.state === 'floor' ? 6 : 0) && d < bd) { bd = d; best = g; }
    });
    return best;
  }
  function basketTotal() {
    var ca = BDL.run.ca;
    return S.basket.reduce(function (s, g) { return s + priceOf(ca, g); }, 0);
  }

  function onCounterZone() { return S.dave.x >= T.counterX0; }
  function onMat() { return Math.abs(S.dave.x - T.payX) <= T.payHalf; }
  function atDoor() { return S.dave.x <= T.doorX; }

  function interact() {
    if (S.leaving) return;
    var g = S.carry;
    if (g) {
      if (onCounterZone() && S.basket.length < T.basketCols * 3) {
        g.state = 'counter'; S.basket.push(g); S.carry = null; S.payRefused = false; S.payT = 0;
        sfx('put');
      } else if (!onCounterZone() && Math.abs(g.hx - S.dave.x) <= T.reach + 8) {
        g.state = 'shelf'; S.carry = null; sfx('put');
      } else { g.state = 'floor'; g.fx = S.dave.x; S.carry = null; sfx('put'); }
      return;
    }
    var t = nearest();
    if (!t) return;
    if (t.state === 'counter') { S.basket.splice(S.basket.indexOf(t), 1); S.payT = 0; S.payRefused = false; }
    t.state = 'carried'; S.carry = t;
    sfx('grab');
  }

  // Trả tiền một lô hàng: ví ca → túi đồ / nâng cấp. Trả về {ok, msg}.
  function settle(list) {
    var ca = BDL.run.ca;
    if (!list.length) return { ok: false, msg: 'Quầy trống' };
    var total = list.reduce(function (s, g) { return s + priceOf(ca, g); }, 0);
    if (ca.wallet < total) return { ok: false, msg: 'Không đủ tiền: cần ' + fmt(total) + ', ví ca chỉ có ' + fmt(ca.wallet), total: total };
    ca.wallet -= total;
    ca.bought = ca.bought || {}; ca.upg = ca.upg || {}; ca.stash = ca.stash || [];
    list.forEach(function (g) {
      var it = g.item;
      if (it.kind === 'upgrade') ca.upg[it.key] = upgBought(ca, it.key) + 1;
      else { ca.stash.push({ key: it.key, uses: it.uses }); ca.bought[it.key] = bought(ca, it.key) + 1; }
      g.state = 'sold'; g.r.sold = true;
      var bi = S.basket.indexOf(g); if (bi >= 0) S.basket.splice(bi, 1);
      if (S.carry === g) S.carry = null;
    });
    return { ok: true, msg: 'Đã mua ' + list.length + ' món · −' + fmt(total), total: total };
  }

  // ---------- tiếng (chỉ vài tiếng quán gốc, không làm hỏng khi thiếu) ----------
  var SFX = { grab: 'dave_grab', put: 'dave_grab', pay: 'harpoon_catch' };
  function sfx(k) {
    try { if (HX.audio && HX.audio.play && !HX.audio.isMuted()) HX.audio.play(SFX[k], { vol: 0.6 }); } catch (e) { /* bỏ qua */ }
  }

  // ---------- vòng chạy ----------
  var keys = {};
  function onKeyDown(e) {
    if (!S) return;
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) interact(); return; }
    keys[e.code] = true;
    if (/^(Arrow|KeyA|KeyD)/.test(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.code] = false; }
  var stickDir = 0;

  function update(dt) {
    if (!S || !S.ready) return;
    S.t += dt;
    var d = S.dave, dir = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) || stickDir;
    if (S.leaving) dir = 0;
    var run = keys.ShiftLeft || keys.ShiftRight, moving = false;
    if (dir) { d.x = clamp(d.x + dir * T.speed * (run ? T.runK : 1) * dt, T.minX, T.maxX); d.face = dir; moving = true; }
    d.flip = d.face > 0;
    var carry = !!S.carry;
    if (moving) d.play(carry ? (run ? 'serve_run' : 'Serve') : (run ? 'normal_Run' : 'Walk'));
    else if (carry) d.play('Serve_Idle');
    else d.play('Idle1');
    d.update(dt); S.bancho.update(dt); S.cat.update(dt);

    // thanh toán: đứng yên trên thảm với quầy có hàng, tay không
    var basket = S.basket, nb = basket.length;
    if (nb !== S.lastN) { S.lastN = nb; S.payT = 0; S.payRefused = false; }
    if (onMat() && nb && !carry && !S.payRefused && !S.leaving) {
      S.payT += dt;
      if (S.payT >= T.payTime) {
        S.payT = 0;
        var r = settle(basket.slice());
        if (r.ok) { say(r.msg); sfx('pay'); S.flash = 1; } else { say(r.msg, true); S.payRefused = true; }
        S.lastN = S.basket.length;
        hudUpdate(true);
      }
    } else { S.payT = 0; if (!onMat() || !nb) S.payRefused = false; }

    // cửa ra khơi
    if (atDoor() && !S.leaving) {
      S.leaveT += dt;
      if (S.leaveT >= T.leaveTime) leave();
    } else if (!atDoor()) S.leaveT = 0;

    if (S.msgT > 0) S.msgT -= dt;
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2);
    hudUpdate(false);
  }

  function leave() {
    if (!S || S.leaving) return;
    S.leaving = true;
    if (S.carry) { S.carry.state = 'shelf'; S.carry = null; }
    var then = S.then;
    S.fade = 0;
    // mờ màn một nhịp rồi sang pha kế
    setTimeout(function () { if (then) then(); }, 350);
  }

  // ---------- vẽ ----------
  function fitIcon(ctx, icon, cx, cy, size) {
    if (isImg(icon)) {
      var im = img(icon);
      if (ok(im)) {
        var k = Math.min(size / im.naturalWidth, size / im.naturalHeight);
        var w = im.naturalWidth * k, h = im.naturalHeight * k;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
        ctx.imageSmoothingEnabled = false;
      }
    } else {
      ctx.font = Math.round(size * 0.82) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(icon, cx, cy + size * 0.04);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function label(ctx, text, x, y, px, fg, bg, align) {
    ctx.font = '800 ' + px + 'px system-ui,"Segoe UI",sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(text).width, pad = px * 0.45;
    var bx = (align === 'left' ? x : x - w / 2) - pad;
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, bx, y - px * 0.78, w + pad * 2, px * 1.56, px * 0.4); ctx.fill(); }
    ctx.fillStyle = fg; ctx.fillText(text, x, y + px * 0.04);
  }

  function render() {
    if (!S || !S.ready) return;
    var st = HX.game.stage2d, ctx = st.ctx, cv = st.canvas;
    if (S.W !== cv.width || S.H !== cv.height) { S.W = cv.width; S.H = cv.height; }
    updateView(!S.viewInit); S.viewInit = true;
    var V = S.V, k = V.s, dpr = S.dpr, ca = BDL.run.ca;
    renderBack(S.t);
    renderFront();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG; ctx.fillRect(0, 0, S.W, S.H);
    ctx.imageSmoothingEnabled = false;
    blit(ctx, S.roomCv);

    // sàn: thảm thanh toán và cửa ra khơi
    drawMat(ctx);

    // kệ: bệ + hàng + thẻ giá
    var near = S.leaving ? null : nearest(), now = S.t;
    Object.keys(T.sections).forEach(function (sk) {
      var sec = T.sections[sk], cnt = S.goods.filter(function (g) { return g.section === sk; }).length;
      var cx = sec.x0 + (cnt - 1) * sec.dx / 2, p = toStage(cx, T.counterY - 36);
      label(ctx, sec.label, p.x, p.y, Math.max(10 * dpr, 7.5 * k), '#1a1206', sec.col, 'center');
    });
    S.goods.forEach(function (g) {
      var sec = T.sections[g.section], p = goodPos(g);
      if (g.state === 'carried') return;
      var sp = toStage(p.x, p.y), size = 28 * k;
      if (g.state === 'shelf' || g.state === 'sold') {
        ctx.fillStyle = 'rgba(0,0,0,.35)'; roundRect(ctx, sp.x - 17 * k, sp.y - 1 * k, 34 * k, 6 * k, 2 * k); ctx.fill();
        ctx.fillStyle = g.state === 'sold' ? '#3a3328' : sec.col; roundRect(ctx, sp.x - 17 * k, sp.y - 2 * k, 34 * k, 5 * k, 2 * k); ctx.fill();
      }
      if (g.state === 'sold') {
        label(ctx, 'ĐÃ BÁN', sp.x, sp.y - 12 * k, Math.max(9 * dpr, 6.5 * k), '#cdbf9f', 'rgba(20,14,6,.7)');
        return;
      }
      if (g === near) {
        var pulse = 0.5 + 0.5 * Math.sin(now * 7);
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * pulse).toFixed(2) + ')'; ctx.lineWidth = Math.max(2, 1.4 * k);
        roundRect(ctx, sp.x - 19 * k, sp.y - 34 * k, 38 * k, 40 * k, 6 * k); ctx.stroke();
      }
      var bob = g.state === 'shelf' ? Math.sin(now * 2 + g.i) * 0.8 * k : 0;
      fitIcon(ctx, g.item.icon, sp.x, sp.y - 16 * k + bob, size);
      if (g.state === 'shelf') drawTag(ctx, g, sp.x, sp.y + 14 * k, ca);
    });
    // Dave + vật đang cầm
    S.dave.draw(ctx, false);
    if (S.carry) {
      var cp = toStage(S.dave.x, S.dave.y - 100 + Math.sin(S.t * 6) * 1.5);
      fitIcon(ctx, S.carry.item.icon, cp.x, cp.y, 30 * k);
      drawTag(ctx, S.carry, cp.x, cp.y - 22 * k, ca, true);
    }
    // quầy trước, ánh sáng đỉnh
    blit(ctx, S.frontCv);
    // hàng trong giỏ nằm trên mặt quầy: vẽ lại bệ + tổng
    drawBasket(ctx, ca);
    drawSigns(ctx);
    if (near && S.msgT <= 0) {
      var np = goodPos(near), tp = toStage(np.x, np.y - 52);
      var tip = near.item.name + (near.state === 'sold' ? '' : ' · ' + fmt(priceOf(ca, near)));
      label(ctx, tip, clamp(tp.x, 60 * dpr, S.W - 60 * dpr), tp.y, Math.max(11 * dpr, 8 * k), '#fff', 'rgba(8,26,44,.88)');
    }
    // vòng đếm ngược trên đầu Dave
    var prog = S.leaving ? 1 : S.leaveT > 0 ? S.leaveT / T.leaveTime : S.payT > 0 ? S.payT / T.payTime : 0;
    if (prog > 0) {
      var rp = toStage(S.dave.x, S.dave.y - 128), rr = 15 * k;
      rp.x = clamp(rp.x, rr + 6 * dpr, S.W - rr - 6 * dpr);
      ctx.lineWidth = 5 * k * 0.6;
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(rp.x, rp.y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = S.leaveT > 0 || S.leaving ? '#ff7a5a' : '#ffd24a';
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.stroke();
    }
    if (S.flash > 0) { ctx.fillStyle = 'rgba(255,230,140,' + (S.flash * 0.28).toFixed(3) + ')'; ctx.fillRect(0, 0, S.W, S.H); }
    if (S.leaving) { S.fade = Math.min(1, S.fade + 0.06); ctx.fillStyle = 'rgba(8,34,58,' + S.fade.toFixed(3) + ')'; ctx.fillRect(0, 0, S.W, S.H); }
  }

  function drawTag(ctx, g, x, y, ca, above) {
    var k = S.V.s, dpr = S.dpr, price = priceOf(ca, g), can = ca.wallet >= price;
    var px = Math.max(10 * dpr, 7.5 * k), txt = fmt(price);
    ctx.font = '800 ' + px + 'px system-ui,"Segoe UI",sans-serif';
    var w = ctx.measureText(txt).width + px * 0.8, h = px * 1.45;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#fff3c9'; roundRect(ctx, -w / 2, -h / 2, w, h, px * 0.3); ctx.fill();
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = Math.max(1, dpr); ctx.stroke();
    ctx.fillStyle = can ? '#1a1206' : '#b0261a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, px * 0.04);
    ctx.restore();
    if (g.section === 'up') {
      var n = upgBought(ca, g.item.key);
      if (n) label(ctx, 'đã mua ' + n + '/' + maxOffers(), x, y + h * 0.95, Math.max(8 * dpr, 5.5 * k), '#ffe9a8', null);
    }
  }

  function drawBasket(ctx, ca) {
    var k = S.V.s, dpr = S.dpr;
    // khay trên quầy Bancho
    var a = toStage(T.basketX0 - 18, T.counterY + 1), b = toStage(T.basketX0 + T.basketDx * (T.basketCols - 1) + 18, T.counterY + 5);
    ctx.fillStyle = 'rgba(255,210,74,.35)'; roundRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, 2 * k); ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,74,.9)'; ctx.lineWidth = Math.max(1, dpr); ctx.stroke();
    if (S.basket.length) {
      var tot = basketTotal(), can = ca.wallet >= tot, tp = toStage(T.basketX0 + T.basketDx * (T.basketCols - 1) / 2, T.counterY - 36 - Math.max(0, Math.ceil(S.basket.length / T.basketCols) - 1) * T.basketRowDy);
      label(ctx, 'Giỏ ' + fmt(tot), tp.x, tp.y, Math.max(11 * dpr, 8 * k), can ? '#1a1206' : '#fff', can ? '#ffd24a' : '#c0392b');
    }
  }

  function drawMat(ctx) {
    var k = S.V.s, dpr = S.dpr, t = S.t;
    var a = toStage(T.payX - T.payHalf, T.floorY - 1), b = toStage(T.payX + T.payHalf, T.floorY + 10);
    var active = S.payT > 0 || (onMat() && S.basket.length);
    ctx.fillStyle = active ? 'rgba(255,210,74,.85)' : 'rgba(214,150,40,.7)';
    roundRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, 3 * k); ctx.fill();
    ctx.fillStyle = 'rgba(80,40,0,.45)';
    for (var i = 0; i < 7; i++) { var sx = a.x + (b.x - a.x) * (i + 0.5) / 7; ctx.fillRect(sx - k * 0.6, a.y + 2 * k, k * 1.2, (b.y - a.y) - 4 * k); }
    var c = toStage(T.payX, T.floorY + 20);
    label(ctx, 'THANH TOÁN', c.x, c.y, Math.max(10 * dpr, 7 * k), '#2b1a00', '#ffd24a');
    // cửa
    var d0 = toStage(0, T.floorY + 20);
    label(ctx, '◀ RA KHƠI', Math.max(d0.x + 4, toStage(T.doorX / 2, 0).x), c.y, Math.max(10 * dpr, 7 * k), '#fff', atDoor() ? '#e8643c' : '#a63a22');
  }
  function drawSigns(ctx) {
    var k = S.V.s, dpr = S.dpr;
    var p = toStage(T.payX, T.counterY - 70);
    label(ctx, 'QUẦY BANCHO', p.x, p.y, Math.max(11 * dpr, 8 * k), '#1a1206', '#ffd24a');
  }

  // ---------- giao diện DOM ----------
  var HUD = null;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function iconEl(icon) {
    if (isImg(icon)) { var i = el('img', 'sp-ic'); i.src = icon; i.alt = ''; return i; }
    return el('span', 'sp-ic sp-em', icon);
  }
  function buildHud(root) {
    root.innerHTML = '';
    var h = el('div', 'sp-hud');
    var top = el('div', 'sp-top');
    var w = el('div', 'sp-wallet'); w.appendChild(el('small', null, 'Ví ca')); var wb = el('b', null, '$0'); w.appendChild(wb);
    var stash = el('div', 'sp-stash'); stash.appendChild(el('small', null, 'Túi đồ')); var sl = el('div', 'sp-stash-list'); stash.appendChild(sl);
    top.appendChild(w); top.appendChild(stash);
    var title = el('div', 'sp-title', 'TRẠM TIẾP TẾ'); title.appendChild(el('small', null, 'Quán của Bancho · ghé qua trước khi ra khơi'));
    var prompt = el('div', 'sp-prompt'), msg = el('div', 'sp-msg');
    var pad = el('div', 'sp-pad'); pad.appendChild(el('i', 'sp-knob'));
    var act = el('button', 'sp-act', 'E'); act.type = 'button'; act.appendChild(el('small', null, 'Nhặt / đặt'));
    [top, title, prompt, msg, pad, act].forEach(function (e) { h.appendChild(e); });
    root.appendChild(h);
    // cảm ứng riêng: cần trái ngang + nút E (BDL.press chỉ dành cho lúc lặn)
    function padMove(e) {
      var r = pad.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      stickDir = Math.abs(dx) < 0.25 ? 0 : dx > 0 ? 1 : -1;
      pad.firstChild.style.transform = 'translateX(' + (clamp(dx, -1, 1) * 36).toFixed(0) + 'px)';
    }
    pad.addEventListener('pointerdown', function (e) { pad.setPointerCapture(e.pointerId); padMove(e); e.preventDefault(); });
    pad.addEventListener('pointermove', function (e) { if (pad.hasPointerCapture(e.pointerId)) padMove(e); });
    function padEnd(e) { stickDir = 0; pad.firstChild.style.transform = ''; }
    pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
    act.addEventListener('pointerdown', function (e) { e.preventDefault(); interact(); });
    return { root: root, wallet: wb, stash: sl, prompt: prompt, msg: msg, last: { wallet: null, stashN: -1, prompt: null, msg: null } };
  }
  function hudUpdate(force) {
    var ca = BDL.run.ca, H = HUD, L = H.last;
    var wt = fmt(ca.wallet);
    if (force || L.wallet !== wt) { H.wallet.textContent = wt; L.wallet = wt; }
    var sig = (ca.stash || []).map(function (s) { return s.key + ':' + s.uses; }).join(',');
    if (force || L.stash !== sig) {
      L.stash = sig; H.stash.innerHTML = '';
      (ca.stash || []).forEach(function (s) {
        var it = itemOf(s.key); if (!it) return;
        var c = el('span', 'sp-chip'); c.title = it.name; c.appendChild(iconEl(it.icon));
        if (s.uses > 0) c.appendChild(el('em', null, '×' + s.uses));
        H.stash.appendChild(c);
      });
      if (!(ca.stash || []).length) H.stash.appendChild(el('span', 'sp-none', 'trống'));
    }
    var p = promptText();
    if (L.prompt !== p) { H.prompt.textContent = p; L.prompt = p; H.prompt.hidden = !p; }
    var m = S.msgT > 0 ? S.msg : '';
    if (L.msg !== m || L.bad !== S.msgBad) { H.msg.textContent = m; H.msg.hidden = !m; H.msg.className = 'sp-msg' + (S.msgBad ? ' bad' : ''); L.msg = m; L.bad = S.msgBad; }
  }
  function promptText() {
    var ca = BDL.run.ca;
    if (S.leaving) return 'Ra khơi…';
    if (S.leaveT > 0) return 'RA KHƠI sau ' + Math.max(0, T.leaveTime - S.leaveT).toFixed(1) + ' s';
    if (S.payT > 0) return 'Đang thanh toán ' + fmt(basketTotal()) + ' · đứng yên ' + Math.max(0, T.payTime - S.payT).toFixed(1) + ' s';
    var touch = document.body.classList.contains('touch');
    var E = touch ? 'Nút E' : 'E';
    if (S.carry) {
      if (onCounterZone()) return E + ': đặt lên quầy Bancho';
      return E + ': ' + (Math.abs(S.carry.hx - S.dave.x) <= T.reach + 8 ? 'đặt lại lên kệ' : 'thả xuống') + ' · mang tới quầy bên phải để trả tiền';
    }
    var n = nearest();
    if (n) {
      var it = n.item;
      return E + ': ' + (n.state === 'counter' ? 'lấy lại ' : 'nhặt ') + it.name + ' · ' + fmt(priceOf(ca, n)) + ' — ' + it.desc;
    }
    if (S.basket.length && onMat()) return S.payRefused ? 'Chưa đủ tiền: bỏ bớt món khỏi quầy rồi đứng lại thảm' : 'Đứng yên trên thảm 3 s để trả ' + fmt(basketTotal());
    if (S.basket.length) return 'Đứng lên thảm vàng thanh toán để trả ' + fmt(basketTotal());
    return (touch ? 'Cần trái để đi' : 'A/D để đi') + ' · nhặt món, đặt lên quầy Bancho, đứng lên thảm vàng để trả · cửa bên trái = ra khơi';
  }

  // ---------- pha ----------
  function enter(args) {
    var ca = BDL.run.ca || BDL.run.start();
    var G = HX.game;
    S = {
      ready: false, then: args && args.then, t: 0, W: 0, H: 0, dpr: 1, V: { s: 1, x0: 0, y0: 0, ox: 0, oy: 0, vw: 1, vh: 1, camX: 0 },
      goods: [], basket: [], carry: null, payT: 0, payRefused: false, lastN: 0, leaveT: 0, leaving: false, msg: '', msgT: 0, flash: 0, fade: 0,
    };
    var me = S;
    HUD = buildHud(G.screen('shop'));
    HUD.prompt.textContent = 'Đang dọn quán…';
    keys = {}; stickDir = 0;
    addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);
    addEventListener('resize', resize);
    Promise.all([ensureContent(), ensureBar()]).then(function () {
      if (S !== me) return;
      var BA = window.HX_BAR_ASSETS, R = BA.room;
      me.roomCv = document.createElement('canvas'); me.roomCv.width = R.size[0]; me.roomCv.height = R.size[1]; me.roomCtx = me.roomCv.getContext('2d');
      me.frontCv = document.createElement('canvas'); me.frontCv.width = R.size[0]; me.frontCv.height = R.size[1]; me.frontCtx = me.frontCv.getContext('2d');
      me.dave = new Actor(BA.dave, 140, T.floorY, 150); me.dave.face = 1;
      me.bancho = new Actor(BA.bancho, R.marks.Bancho[0], R.marks.Bancho[1], BA.bancho.sortingOrder + 0.1);
      me.bancho.play('Idle');
      var U = R.pxPerUnit;
      me.cat = new Actor(BA.cat, (BA.cat.prefabPosUnity[0] - R.originUnity[0]) * U, (R.originUnity[1] - BA.cat.prefabPosUnity[1]) * U + BA.cat.anchor[1], BA.cat.sortingOrder + 0.1);
      me.cat.play('Idle');
      var ca2 = BDL.run.ca;
      rollStock(ca2);
      buildGoods(); buildRoom();
      resize();
      me.ready = true;
      installDebug();
      hudUpdate(true);
    }).catch(function (e) {
      if (G.errors) G.errors.push(String(e));
      HUD.prompt.textContent = 'Không dọn được quán: ' + e.message;
      console.error(e);
    });
    if (!S.W) resize();
  }

  function resize() {
    if (!S) return;
    var st = HX.game.stage2d, dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.dpr = dpr;
    st.canvas.width = Math.max(1, Math.round(innerWidth * dpr)); st.canvas.height = Math.max(1, Math.round(innerHeight * dpr));
    st.w = innerWidth; st.h = innerHeight; st.dpr = dpr;
    S.W = st.canvas.width; S.H = st.canvas.height;
  }

  function exit() {
    removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('resize', resize);
    stickDir = 0;
    if (window.BDL_DEBUG) delete window.BDL_DEBUG.shop;
    var scr = document.getElementById('scr-shop'); if (scr) scr.innerHTML = '';
    S = null; HUD = null;
  }

  // ---------- móc cho bộ kiểm ----------
  function installDebug() {
    if (!window.BDL_DEBUG) return;
    window.BDL_DEBUG.shop = {
      goods: function () {
        var ca = BDL.run.ca;
        return S.goods.map(function (g) { return { i: g.i, key: g.item.key, name: g.item.name, kind: g.item.kind, section: g.section, price: priceOf(ca, g), state: g.state, x: goodPos(g).x }; });
      },
      buy: function (i) { var g = S.goods[i]; if (!g || g.state === 'sold') return { ok: false, msg: 'Món không còn' }; var r = settle([g]); hudUpdate(true); return r; },
      wallet: function (n) { BDL.run.ca.wallet = n; hudUpdate(true); return n; },
      reroll: function () { delete BDL.run.ca.shopRoll; rollStock(BDL.run.ca); buildGoods(); hudUpdate(true); return S.goods.length; },
      roll: function (keys) { rollStock(BDL.run.ca, keys); buildGoods(); hudUpdate(true); return S.goods.length; },
      teleport: function (x) { S.dave.x = x; S.viewInit = false; },
      state: function () {
        var ca = BDL.run.ca;
        return { x: S.dave.x, carry: S.carry ? S.carry.item.key : null, basket: S.basket.map(function (g) { return g.item.key; }), basketTotal: basketTotal(),
          payT: S.payT, leaveT: S.leaveT, leaving: S.leaving, wallet: ca.wallet, stash: (ca.stash || []).map(function (s) { return { key: s.key, uses: s.uses }; }),
          upg: Object.assign({}, ca.upg), msg: S.msgT > 0 ? S.msg : '', ready: S.ready, prompt: HUD.last.prompt };
      },
      interact: interact,
      view: function () { return { s: S.V.s, x0: S.V.x0, y0: S.V.y0, W: S.W, H: S.H }; },
      T: T,
    };
  }

  HX.phases = HX.phases || {};
  HX.phases.shop = { surface: '2d', enter: enter, exit: exit, update: update, render: render };
})(window.HX = window.HX || {}, window.BDL);
