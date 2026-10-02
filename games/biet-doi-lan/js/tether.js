// Móc dây (neo): súng xiên (chuột trái, giữ để ngắm, thả để bắn: engine/harpoon.js) trúng đồ cổ hoặc xác cá to / xác quái thì
// móc dây vào (BDL.tether.hookTo), dây lò xo kéo vật theo Dave lên dần như REPO; bấm chuột trái lần nữa là thả (engine/dave.js).
// Vật nặng làm dây căng quá sức kéo thì dây "mỏi" dần rồi đứt, vật chìm xuống lại.
// idle → attached → (thả: retracting | căng quá: snapped) → idle. Cá nhỏ vẫn vào túi qua mũi xiên.
window.BDL = window.BDL || {};
(function (BDL) {
  'use strict';
  var T = window.HX_TUNING;

  var BACK = 18;            // [ĐỀ XUẤT] thu móc về (m/s)
  var REST_MIN = 1.5, REST_GOAL = 2.5;   // dây dài lúc móc trúng (tối thiểu 1,5 m), tời dần về 2,5 m
  var REEL = 0.8;           // [ĐỀ XUẤT] tời dây (m/s); tời đứng khi dây đã căng quá 75% sức kéo
  var K = 600, C = 90;      // [ĐỀ XUẤT] lò xo dây (N/m) và giảm chấn (N·s/m)
  var M_DIVER = 80;         // [ĐỀ XUẤT] khối lượng Dave (kg) chịu lực dây
  var STR_BASE = 30;        // [REPO] str gốc 30, +10 mỗi bậc nâng cấp "Sức kéo dây"; đọc như kg
  var N_PER_STR = 7;        // [ĐỀ XUẤT] dây chịu 7 N mỗi điểm str (210 N ở str 30): món to 58 kg kéo thường không sao, xác thuyền thì không
  var SPEED_FLOOR = 0.35;   // [REPO] tốc độ / (1 + khối lượng / str), sàn 35%
  var STRAIN_TIME = 3;      // [ĐỀ XUẤT] dây căng gấp 1 lần ngưỡng thì 3 s đứt (gấp đôi ngưỡng 1,5 s)
  var STRAIN_DECAY = 0.5;   // [ĐỀ XUẤT] dây chùng thì hồi mỏi mỗi giây
  var MAX_LEN = 15;         // dây kéo dài quá chừng này (dịch chỗ, kẹt vách) là đứt ngay
  var SNAP_TIME = 0.6;
  var ROPE_PTS = 14, ROPE_W = 0.055;
  var ROPE_COL = new THREE.Color(0.58, 0.45, 0.28), HOT_COL = new THREE.Color(0.95, 0.16, 0.1);
  // GGSTAnchor_Thumbnail 42×28 px: khoen bên trái, càng neo bên phải
  var HEAD_SRC = 'art/dtd/icon/GGSTAnchor_Thumbnail.png', HEAD_W = 0.56, HEAD_H = 0.37, HEAD_RING = 0.82;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // Sức kéo và tầm móc theo G.stats (js/items.js): crew + nâng cấp Sức kéo dây / Tầm móc; chưa có thì số REPO gốc
  function strOf() {
    if (G && G.stats && G.stats.pull) return G.stats.pull;
    var ca = BDL.run && BDL.run.ca, up = ca && ca.upg ? ca.upg.str || 0 : 0;
    return STR_BASE + 10 * up;
  }
  function rangeOf() { return G && G.stats && G.stats.hookRange ? G.stats.hookRange : T.harpoon.range; }
  function floating() { return !!(BDL.items && BDL.items.floatOn && BDL.items.floatOn()); }
  // Khối lượng dùng cho dây: cá quá nhẹ làm lò xo cứng 600 N/m rung loạn, cá mập quá nặng thì kẹt chết [ĐỀ XUẤT]
  // Phao nổi (js/items.js): món đang buộc dây nhẹ như bấc trong lúc phao còn hiệu lực
  function massOf(t) { return floating() ? 2 : clamp(t.mass || 1, 2, 260); }

  // Móc dây được: mọi đồ cổ còn nằm dưới nước, xác cá lớn (vai 'drag', data/fish.js) và xác quái. Cá còn sống (kể cả đang ngủ / đông đá)
  // do mũi xiên đánh như thường, chết trên dây rồi mới thành xác buộc dây.
  // Xác người lặn (js/bodies.js, t.isBody) cùng nhánh với đồ cổ: có pos / vel / mass / tilt / hitTest như Loot.
  function solid(t) { return !!t && (t.isLoot || t.isBody); }
  function hookable(t) {
    if (t && t.isBody) return !t.tethered && t.state === 'down';
    if (!t || t.tethered || !t.root || !t.root.parent) return false;
    if (t.isLoot) return t.state !== 'gone' && t.state !== 'onDeck' && !t.lifted;
    if (t.state === 'reeled' || t.state === 'hauled' || t.state === 'lifted' || !t.corpse || !t.corpse()) return false;
    return BDL.fishRole(t.sp) === 'drag' || !!t.isFoe;
  }

  // Món lên boong. Quái (foes.js, f.isFoe) tự ghi deckItem riêng thì dùng của nó; cá thường theo BDL.fishRaw (data/fish.js);
  // cá mập thường (không bộ não quái) bán như xác quái.
  function deckItemOf(t) {
    if (t.isLoot || t.isBody || t.isFoe || t.brain || Object.prototype.hasOwnProperty.call(t, 'deckItem')) return t.deckItem();
    var sp = t.sp, icon = '';
    try { icon = HX.fish.iconFor(t.G.gfx, sp); } catch (e) { icon = ''; }
    if (sp.shark) return { kind: 'foe', key: sp.id, label: sp.vi || HX.fish.displayName(sp), value: BDL.run.price('foe', BDL.foeValue(sp.hp, sp.damage)), icon: icon };
    return { kind: 'fish', key: sp.id, label: HX.fish.displayName(sp), value: BDL.run.price('fish', BDL.fishRaw(sp)), icon: icon };
  }
  function labelOf(t) { return solid(t) ? t.name : t.sp.vi || HX.fish.displayName(t.sp); }
  function gone(t) {
    if (t.isBody) return t.state === 'aboard';
    if (t.isLoot) return t.state === 'gone' || t.state === 'onDeck';
    return t.state === 'reeled' || !t.root || !t.root.parent;
  }

  var G = null, S = null;

  function makeMeshes() {
    var head = new THREE.TextureLoader().load(HEAD_SRC);
    head.magFilter = THREE.NearestFilter; head.minFilter = THREE.LinearMipmapLinearFilter;
    var mesh = HX.gfx.sprite(head, HEAD_W, HEAD_H, { alphaCut: 0.5, depthWrite: true, pivot: [0.95, 0.5] });
    mesh.visible = false;
    G.gfx.scene.add(mesh);
    var geo = new THREE.BufferGeometry(), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROPE_PTS * 2 * 3), 3));
    for (var i = 0; i < ROPE_PTS - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    var rope = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ROPE_COL.clone(), side: THREE.DoubleSide }));
    rope.frustumCulled = false; rope.visible = false;
    G.gfx.scene.add(rope);
    return { head: mesh, rope: rope };
  }

  // ---------- nhãn trên vật: tên, giá, vạch mỏi dây ----------
  var tag = null;
  function makeTag() {
    var st = document.createElement('style');
    st.id = 'tether-css';
    st.textContent = [
      '#tether-tag { position: absolute; transform: translate(-50%, -100%); pointer-events: none; text-align: center;',
      '  font: 800 calc(12px * var(--px, 1))/1.25 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 0 #000, 0 0 5px #000; white-space: nowrap; }',
      '#tether-tag b { display: block; color: #ffe08a; font-size: calc(14px * var(--px, 1)); }',
      '#tether-tag b.hurt { color: #ffab8f; }',
      '#tether-tag i { display: block; margin: 3px auto 0; width: calc(64px * var(--px, 1)); height: 4px; border-radius: 2px; background: rgba(0,0,0,.55); overflow: hidden; font-style: normal; }',
      '#tether-tag i s { display: block; height: 100%; width: 0; background: #ff5a3c; }',
      '#tether-tag.hover { opacity: .8; }',
      '#tether-tag.below { transform: translate(-50%, 0); }',
    ].join('\n');
    document.head.appendChild(st);
    var el = document.createElement('div');
    el.id = 'tether-tag'; el.hidden = true;
    el.innerHTML = '<span></span><b></b><i><s></s></i>';
    (document.getElementById('hud') || document.body).appendChild(el);
    return { el: el, css: st, name: el.children[0], val: el.children[1], bar: el.children[2], fill: el.children[2].firstChild, key: '' };
  }
  function showTag(t, hover) {
    if (!t) { if (!tag.el.hidden) tag.el.hidden = true; return; }
    // đang kéo thì nhãn nằm dưới vật (Dave và dây thường ở phía trên), nhìn lướt thì nằm trên
    var c0 = t.center(), top = { x: c0.x, y: c0.y + (hover ? t.hh + 0.15 : -t.hh - 0.12) };
    var s = G.gfx.worldToScreen(top.x, top.y), item = solid(t) ? null : deckItemOf(t);
    var v = t.isLoot ? Math.round(t.value) : t.isBody ? 0 : item.value, key = labelOf(t) + '|' + v + '|' + hover;
    tag.el.hidden = false;
    tag.el.classList.toggle('hover', !!hover);
    tag.el.classList.toggle('below', !hover);
    tag.el.style.left = Math.round(s.x) + 'px'; tag.el.style.top = Math.round(s.y) + 'px';
    if (key !== tag.key) {
      tag.key = key;
      tag.name.textContent = labelOf(t) + (t.isLoot ? ' · ' + t.mat.name : '');
      tag.val.textContent = t.isBody ? 'Kéo về thuyền' : BDL.fmt(v);
      tag.val.classList.toggle('hurt', !!t.isLoot && t.value < t.value0 - 0.5);
    }
    tag.bar.style.visibility = hover ? 'hidden' : 'visible';
    tag.fill.style.width = (S.strain * 100).toFixed(0) + '%';
  }

  // ---------- trạng thái ----------
  function reset() {
    S = { state: 'idle', x: 0, y: 0, angle: 0, dx: 1, dy: 0, traveled: 0, target: null, off: null, rest: 0, len: 0,
      tension: 0, strain: 0, snapT: 0, end: null, creakT: 0, meshes: S && S.meshes };
  }

  function ropeFrom() {
    var d = G.diver;
    return { x: d.pos.x - d.facing * 0.12, y: d.pos.y - 0.1 };
  }

  function attachPoint() {
    var t = S.target;
    if (solid(t)) {
      var c = Math.cos(t.tilt), s = Math.sin(t.tilt);
      return { x: t.pos.x + S.off.x * c - S.off.y * s, y: t.pos.y + S.off.x * s + S.off.y * c };
    }
    var cc = t.center();
    return { x: cc.x + S.off.x * (t.flip || 1), y: cc.y + S.off.y };
  }

  function attach(t, x, y) {
    var d = G.diver;
    if (!solid(t) && !(t.corpse && t.corpse())) { t.clearBuffs && t.clearBuffs(); t.die(false); }
    S.target = t;
    t.tethered = true;
    if (solid(t)) {
      // móc vào thân món, kéo điểm buộc vào trong ảnh cho khỏi lơ lửng ở mép
      var c = Math.cos(-t.tilt), s = Math.sin(-t.tilt), lx = (x - t.pos.x) * 0.6, ly = (y - t.pos.y) * 0.6;
      S.off = { x: lx * c - ly * s, y: lx * s + ly * c };
      t.wake();
      t.grace = G.t + 1.0;   // [REPO] GRACE_AFTER_PICKUP: cú giật đầu tiên không làm vỡ
    } else {
      var cc = t.center();
      S.off = { x: (x - cc.x) * 0.6 * (t.flip || 1), y: (y - cc.y) * 0.6 };
      BDL.bodyVel(t);
    }
    var a = attachPoint(), o = ropeFrom();
    S.rest = Math.max(REST_MIN, Math.hypot(a.x - o.x, a.y - o.y));
    S.strain = 0; S.tension = 0;
    S.state = 'attached';
    G.audio.play('harpoon_hit', { vol: 0.8, rate: 0.8 });
    G.audio.play('dave_grab', { vol: 0.6 });
    G.fx.spawn('hit', a.x, a.y, 0.2, 0, 0, 0.5);
    if (BDL.noise) BDL.noise(a.x, a.y, 5, 0.6);
    d.faceToward(a.x - d.pos.x);
  }

  function detach() {
    var t = S.target;
    if (t) t.tethered = false;
    S.target = null;
    if (G.diver) G.diver.tow = null;
    G.audio.stopLoop('tether-creak', 0.2);
    return t;
  }

  function release() {
    if (S.state !== 'attached') return false;
    var a = attachPoint(), v = BDL.bodyVel(detach());
    // dây vừa buông: vật thôi bị kéo, đà đi lên mất nhanh trong nước rồi chìm
    v.x *= 0.5; if (v.y > 0) v.y *= 0.3;
    S.state = 'retracting';
    S.x = a.x; S.y = a.y;
    G.audio.play('harpoon_return', { vol: 0.6, rate: 0.8 });
    return true;
  }

  function snap() {
    var a = attachPoint(), t = detach(), o = ropeFrom();
    S.state = 'snapped'; S.snapT = 0;
    // đầu dây đứt bật ngược về phía Dave
    var dx = o.x - a.x, dy = o.y - a.y, l = Math.hypot(dx, dy) || 1;
    S.end = { x: a.x, y: a.y, vx: dx / l * 9, vy: dy / l * 9 };
    S.strain = 0;
    var v = BDL.bodyVel(t);
    v.y = Math.min(v.y, -0.4);
    G.audio.play('harpoon_hit_rock', { vol: 1, rate: 0.55 });
    G.audio.play('harpoon_tap', { vol: 0.9, rate: 0.5 });
    G.fx.burst('bubbleBig', a.x, a.y, 10, 1.2);
    G.shake(1.2);
    G.hud.toast('Đứt dây! ' + labelOf(t) + ' chìm xuống');
    if (BDL.noise) BDL.noise(a.x, a.y, 8, 1.2);
  }

  function consume() {
    if (S.state !== 'attached' || !S.target) return null;
    var t = S.target;
    // kéo xác người lặn tới thuyền: không bán, người gục hồi trên boong (BDL.bodies.board)
    if (t.isBody) {
      detach();
      BDL.bodies.board(t);
      S.state = 'idle';
      return null;
    }
    var item = deckItemOf(t);
    detach();
    t.removeFromWorld();
    S.state = 'idle';
    return item;
  }

  // ---------- mỗi khung ----------
  function stepAttached(dt) {
    var t = S.target, d = G.diver;
    if (gone(t)) { detach(); S.state = 'retracting'; return; }
    if (d.state === 'dead') { release(); return; }
    var a = attachPoint(), o = ropeFrom();
    var dx = o.x - a.x, dy = o.y - a.y, len = Math.hypot(dx, dy) || 1e-3, ux = dx / len, uy = dy / len;
    var mT = massOf(t), tv = BDL.bodyVel(t), lim = N_PER_STR * strOf();
    // tời dây về 2,5 m; Dave bơi lại gần thì dây cũng thu theo (không để thừa quá 2,5 m)
    if (S.rest > REST_GOAL && S.tension < lim * 0.75) S.rest = Math.max(REST_GOAL, S.rest - REEL * dt);
    S.rest = Math.min(S.rest, Math.max(REST_GOAL, len));
    var stretch = len - S.rest, rate = (d.vel.x - tv.x) * ux + (d.vel.y - tv.y) * uy;
    // lò xo không cứng hơn mức vật nhẹ chịu được ở bước khung 50 ms
    var k = Math.min(K, mT * 150), c = Math.min(C, mT * 12);
    var Tn = stretch > 0 ? Math.max(0, k * stretch + c * rate) : 0;
    Tn = Math.min(Tn, lim * 4);
    tv.x += ux * Tn / mT * dt; tv.y += uy * Tn / mT * dt;
    d.vel.x -= ux * Tn / M_DIVER * dt; d.vel.y -= uy * Tn / M_DIVER * dt;
    if (t.isLoot && Tn > 0) t.wake();
    S.len = len;
    S.tension += (Tn - S.tension) * Math.min(1, dt * 6);
    // mỏi dây: căng quá sức kéo thì tăng dần, chùng thì hồi
    var ratio = S.tension / lim;
    if (ratio > 1) S.strain = Math.min(1, S.strain + dt / STRAIN_TIME * Math.min(2.5, ratio));
    else if (ratio < 0.85) S.strain = Math.max(0, S.strain - dt * STRAIN_DECAY);
    // Dave kéo vật nặng thì chậm lại: REPO tốc độ / (1 + khối lượng / str), sàn 35%; chỉ khi dây đang căng
    var taut = clamp((len - S.rest + 0.25) / 0.3, 0, 1), repo = floating() ? 1 : Math.max(SPEED_FLOOR, 1 / (1 + mT / strOf()));
    d.tow = { mul: 1 - (1 - repo) * taut, k: ratio, dx: -ux, dy: -uy };
    // dây kêu cót két khi căng gần đứt
    if (ratio > 0.85) {
      G.audio.loop('tether-creak', 'harpoon_pull', 0.35 + 0.4 * S.strain);
      S.creakT -= dt;
      if (S.strain > 0.25 && S.creakT <= 0) { S.creakT = 0.5 - 0.3 * S.strain; G.audio.play('harpoon_tap', { vol: 0.35 + 0.4 * S.strain, rate: 0.45 + 0.3 * Math.random() }); }
    } else G.audio.stopLoop('tether-creak', 0.25);
    if (S.strain >= 1 || len > MAX_LEN) snap();
  }

  function stepBack(dt) {
    var o = ropeFrom(), dx = o.x - S.x, dy = o.y - S.y, l = Math.hypot(dx, dy) || 1, mv = Math.min(l, BACK * dt);
    S.x += dx / l * mv; S.y += dy / l * mv;
    S.angle = Math.atan2(-dy, -dx);
    if (l < 0.4) S.state = 'idle';
  }

  function stepSnapped(dt) {
    S.snapT += dt;
    var e = S.end, o = ropeFrom(), k = Math.exp(-5 * dt);
    e.vx *= k; e.vy *= k;
    e.x += e.vx * dt; e.y += e.vy * dt;
    // đầu dây đứt trôi dần về tay Dave
    var f = Math.min(1, S.snapT / SNAP_TIME);
    e.x += (o.x - e.x) * f * f * 0.25; e.y += (o.y - e.y) * f * f * 0.25;
    if (S.snapT >= SNAP_TIME) { S.state = 'idle'; S.end = null; }
  }

  // ---------- vẽ: đầu neo + dây dải tam giác 14 điểm như dây xiên ----------
  function draw() {
    var m = S.meshes, on = S.state !== 'idle';
    m.rope.visible = on;
    m.head.visible = on && S.state !== 'snapped';
    if (!on) return;
    var o = ropeFrom(), hx = S.x, hy = S.y, ang = S.angle, sag = 0, wave = 0, buzz = 0;
    if (S.state === 'attached') {
      var a = attachPoint();
      hx = a.x; hy = a.y; ang = Math.atan2(a.y - o.y, a.x - o.x);
      // dây chùng võng xuống: dây dài rest căng trên dây cung len → độ võng ≈ √(3·len·(rest−len)/8)
      var slack = Math.max(0, S.rest - S.len);
      sag = Math.min(2, Math.sqrt(3 * S.len * slack / 8)) + 0.06 * Math.max(0, 1 - S.tension / 40);
      wave = slack > 0.05 ? 0.12 * sag : 0;
      buzz = S.strain > 0.05 ? 0.035 * S.strain : 0;
    } else if (S.state === 'retracting') sag = Math.min(0.6, Math.hypot(hx - o.x, hy - o.y) * 0.12);
    m.head.position.set(hx, hy, 0.12);
    m.head.rotation.z = ang;
    // dây buộc vào khoen neo (đuôi ảnh)
    var ex = hx - Math.cos(ang) * HEAD_W * HEAD_RING, ey = hy - Math.sin(ang) * HEAD_W * HEAD_RING;
    if (S.state === 'snapped') {
      ex = S.end.x; ey = S.end.y;
      wave = 0.35 * (1 - S.snapT / SNAP_TIME);
    }
    var p = m.rope.geometry.attributes.position.array;
    var len = Math.hypot(ex - o.x, ey - o.y) || 1e-3, px = -(ey - o.y) / len, py = (ex - o.x) / len;
    var nx = px * ROPE_W / 2, ny = py * ROPE_W / 2;
    // võng về phía pháp tuyến hướng xuống: dây nằm ngang thì võng xuống, dây dựng đứng thì phình sang một bên
    var sx = py > 0 ? -px : px, sy = py > 0 ? -py : py;
    if (Math.abs(sy) < 0.35) { sx = sx * 0.7; sy = -0.5; }
    for (var i = 0; i < ROPE_PTS; i++) {
      var t = i / (ROPE_PTS - 1), bell = Math.sin(t * Math.PI);
      var w = wave * Math.sin(t * Math.PI * 3 - G.t * (S.state === 'snapped' ? 22 : 2.2)) * bell + buzz * Math.sin(G.t * 70 + i * 2.1) * bell;
      var x = o.x + (ex - o.x) * t + px * w + sx * bell * sag, y = o.y + (ey - o.y) * t + py * w + sy * bell * sag;
      p[i * 6] = x - nx; p[i * 6 + 1] = y - ny; p[i * 6 + 2] = 0.105;
      p[i * 6 + 3] = x + nx; p[i * 6 + 4] = y + ny; p[i * 6 + 5] = 0.105;
    }
    m.rope.geometry.attributes.position.needsUpdate = true;
    m.rope.material.color.copy(ROPE_COL).lerp(HOT_COL, S.state === 'snapped' ? 1 : S.strain);
  }

  // Đồ cổ dưới chỗ ngắm (trong tầm móc) thì hiện tên và giá như REPO nhìn vào món đồ.
  function hoverTarget(input) {
    var d = G.diver;
    if (!d || Math.hypot(input.aimX - d.pos.x, input.aimY - d.pos.y) > rangeOf() + 1) return null;
    var L = G.loot || [];
    for (var i = 0; i < L.length; i++) if (L[i].hitTest(input.aimX, input.aimY, 0.25)) return L[i];
    var B = BDL.bodies ? BDL.bodies.list : [];
    for (var j = 0; j < B.length; j++) if (hookable(B[j]) && B[j].hitTest(input.aimX, input.aimY, 0.25)) return B[j];
    return null;
  }

  // Mũi xiên (engine/harpoon.js) chỉ quét G.loot và cá: xác người lặn nằm ngoài hai danh sách đó nên ở đây quét thêm
  // dọc quãng đường mũi xiên vừa bay trong khung, trúng thì móc như đồ cổ.
  function hookBodies() {
    var H = G.harpoon, B = BDL.bodies;
    if (!H || H.state !== 'flying' || S.state === 'attached' || !B) { S.hx = null; return; }
    var px = S.hx != null ? S.hx : H.x - H.dx * 0.6, py = S.hx != null ? S.hy : H.y - H.dy * 0.6;
    var L = B.list;
    for (var k = 0; k <= 6; k++) {
      var x = px + (H.x - px) * k / 6, y = py + (H.y - py) * k / 6;
      for (var i = 0; i < L.length; i++) {
        if (hookable(L[i]) && L[i].hitTest(x, y, 0.1)) { H.x = x; H.y = y; if (H.hookOn(L[i])) { S.hx = null; return; } }
      }
    }
    S.hx = H.x; S.hy = H.y;
  }

  BDL.deckItemOf = deckItemOf;   // drone.js dùng chung cách quy ra món lên boong
  var api = {
    target: function () { return S && S.state === 'attached' ? S.target : null; },
    consume: function () { return S ? consume() : null; },
    release: function () { return S ? release() : false; },
    hookable: hookable,
    // Mũi xiên (harpoon.js) trúng t tại (x, y): móc dây vào. false nếu đang buộc vật khác hoặc t không móc được.
    hookTo: function (t, x, y) {
      if (!S || S.state === 'attached' || !hookable(t)) return false;
      attach(t, x, y);
      return true;
    },
  };
  Object.defineProperty(api, 'state', { get: function () { return S ? S.state : 'idle'; }, enumerable: true });
  BDL.tether = api;

  BDL.systems.push({
    name: 'tether',
    build: function (g) {
      G = g; S = null;
      reset();
      S.meshes = makeMeshes();
      if (!tag) tag = makeTag();
      else if (!tag.el.parentNode) (document.getElementById('hud') || document.body).appendChild(tag.el);
      window.BDL_DEBUG.tether = {
        state: function () { return S.state; },
        strain: function () { return S.strain; },
        info: function () {
          var t = S.target;
          return { state: S.state, strain: S.strain, tension: S.tension, rest: S.rest, len: S.len, limit: N_PER_STR * strOf(),
            target: t ? { loot: !!t.isLoot, id: t.id, x: t.pos.x, y: t.pos.y, mass: t.mass } : null, tow: G.diver.tow };
        },
      };
    },
    update: function (dt, input) {
      var d = G.diver;
      if (!d || !S) return;
      // input.hook (Q / chuột phải / nút Móc cũ) không còn tác dụng: móc đi bằng súng xiên chuột trái
      hookBodies();
      if (S.state === 'attached') stepAttached(dt);
      else if (S.state === 'retracting') stepBack(dt);
      else if (S.state === 'snapped') stepSnapped(dt);
      if (S.state !== 'attached' && d.tow) d.tow = null;
      draw();
      showTag(S.state === 'attached' ? S.target : S.state === 'idle' ? hoverTarget(input) : null, S.state !== 'attached');
    },
    teardown: function (g) {
      if (S && S.target) detach();
      if (S && S.meshes) { g.gfx.scene.remove(S.meshes.head); g.gfx.scene.remove(S.meshes.rope); }
      if (tag) tag.el.hidden = true;
      if (g.audio) g.audio.stopLoop('tether-creak');
      S = null;
    },
  });
})(window.BDL);
