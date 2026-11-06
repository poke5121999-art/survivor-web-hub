// Luyện tập (plugin trận, chạy qua TD.racePlugins): Huấn luyện tự do (cắm cờ) và Thách Đấu Ảo Ảnh (đua với bóng kỷ lục).
// - Mọi trận người chơi (trừ tự do) ghi đường chạy 10 Hz; về đích mà nhanh hơn bóng đang lưu của đường đó thì ghi đè (localStorage td.ghost.<đường>).
// - Tự do: F/nút 'flag' = Thiết lập điểm cờ (một cờ, đặt lại thì dời), G/'flagBack' = Về điểm cờ, X/'flagDel' = Xóa điểm cờ.
//   Về điểm cờ dùng TD.Race.respawn(..., 'flag', pose) rồi khôi phục lastCp/vòng/giờ vòng của lúc cắm (respawn không đụng tới chúng,
//   mà vòng chạy bị cắt ngang nên vòng đó không tính kỷ lục). Kỷ lục luyện tập lưu riêng ở td.practice.v1.
// - Cờ 3D: art/practice/flag.glb (tự dựng, xem tools/export_flag.py) + tia sáng cộng sáng dựng từ art/fx.
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const P = { S: null };
  const KEY_PRACTICE = 'td.practice.v1', KEY_GHOST = 'td.ghost.';
  const POLE_R = 0.22, CLOTH_W = 9;   // khớp tools/export_flag.py
  const ghostTint = 0.4;   // chọn: bóng mờ 40% như xe Ảo Ảnh trong clip

  // ---------- lưu trữ ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* đầy bộ nhớ hoặc chế độ riêng tư: bỏ qua */ } }
  P.loadBest = function () {
    try { const o = JSON.parse(lsGet(KEY_PRACTICE)); return o && o.best ? o : { best: {} }; } catch (e) { return { best: {} }; }
  };
  P.saveBest = function (o) { lsSet(KEY_PRACTICE, JSON.stringify(o)); };
  P.loadGhost = function (trackId) { const s = lsGet(KEY_GHOST + trackId); return s ? TD.Ghost.decode(s) : null; };
  P.saveGhost = function (rec) { lsSet(KEY_GHOST + rec.track, TD.Ghost.encode(rec)); };

  const fmt = (t) => {
    if (t == null || !isFinite(t)) return '--:--.--';
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  const sgn = (v) => (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(2);

  // ---------- cờ 3D ----------
  let flagAsset = null;
  function loadFlag() {
    if (!flagAsset) {
      flagAsset = fetch('art/practice/flag.glb?v=' + (TD.REV || '')).then((r) => { if (!r.ok) throw new Error('flag.glb http ' + r.status); return r.arrayBuffer(); })
        .then((buf) => new Promise((res, rej) => { new THREE.GLTFLoader().parse(buf, '', res, rej); }));
    }
    return flagAsset;
  }

  // Tia sáng trắng dọc cột: hai tấm đứng cắt chéo, ảnh dải sáng đứng gốc (fx_glow_09610_1), cộng sáng, mờ dần lên cao.
  function makeBeam() {
    const H = 60, tex = new THREE.TextureLoader().load('art/fx/fx_glow_09610_1.webp?v=' + (TD.REV || ''));
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, fog: false });
    const g = new THREE.Group();
    for (let a = 0; a < 2; a++) {
      const geo = new THREE.PlaneGeometry(5, H, 1, 8), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const f = Math.pow(1 - (pos.getY(i) + H / 2) / H, 1.4); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(geo, mat); m.position.y = H / 2; m.rotation.y = a * Math.PI / 2; m.renderOrder = 5;
      g.add(m);
    }
    g.userData.mat = mat;
    return g;
  }

  function buildFlag(S, root) {
    const group = new THREE.Group();
    group.visible = false;
    root.add(group);
    S.group = group;
    const beam = makeBeam(); group.add(beam); S.beam = beam;
    loadFlag().then((gl) => {
      if (S.dead) return;
      const m = gl.scene.clone(true);
      group.add(m);
      m.traverse((o) => { if (o.isMesh && o.name === 'cloth') { S.cloth = o; S.base = o.geometry.attributes.position.array.slice(); o.geometry = o.geometry.clone(); } });
    }).catch((e) => TD.warnOnce ? TD.warnOnce('flag', String(e)) : console.error(e));
  }

  // Vải gợn sóng: dịch đỉnh theo z, mép dính cột đứng yên, càng xa cột càng lắc.
  function waveCloth(S, t) {
    if (!S.cloth) return;
    const geo = S.cloth.geometry, p = geo.attributes.position, b = S.base, W = CLOTH_W;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1], u = (x - POLE_R) / W;
      p.setZ(i, u * (0.5 * Math.sin(u * 5 - t * 4) + 0.18 * Math.sin(y * 1.7 + t * 3.1 + u * 3)));
    }
    p.needsUpdate = true; geo.computeVertexNormals();
  }

  function placeFlag(S) {
    const f = S.flag;
    if (!f || !S.group) { if (S.group) S.group.visible = false; return; }
    S.group.position.set(f.x, f.y, f.z);
    S.group.rotation.y = f.yaw;   // vải nhìn thẳng chiều chạy
    S.group.visible = true;
  }

  // ---------- thao tác cờ ----------
  function setFlag(ctx) {
    const S = P.S, R = ctx.R, me = ctx.me;
    if (me.st === 'respawn' || me.st === 'finish' || R.phase !== 'race') return;
    S.flag = { x: me.x, y: me.loc ? me.loc.y : me.y, z: me.z, yaw: me.yaw, lastCp: me.lastCp, lap: me.lap, cpNext: me.cpNext, lapEl: me.lapStartT != null ? R.t - me.lapStartT : null };
    placeFlag(S);
    if (TD.audio) TD.audio.play('Play_UI_Select');
    if (TD.menu && TD.menu.banner) TD.menu.banner('Đã thiết lập điểm cờ');
  }
  function flagBack(ctx) {
    const S = P.S, R = ctx.R, me = ctx.me, f = S.flag;
    if (!f || me.st === 'finish' || R.phase !== 'race') return;
    TD.Race.respawn(R, me, 'flag', { x: f.x, y: f.y, z: f.z, yaw: f.yaw });
    me.lastCp = f.lastCp; me.lap = f.lap; me.cpNext = f.cpNext;
    me.lapStartT = f.lapEl != null ? R.t - f.lapEl : null;
    S.dirty = true;
  }
  function delFlag(ctx) {
    const S = P.S;
    if (!S.flag) return;
    S.flag = null; placeFlag(S);
    if (TD.menu && TD.menu.banner) TD.menu.banner('Đã xóa điểm cờ');
  }

  // ---------- bóng ----------
  function buildGhost(S, ctx) {
    const rec = S.ghost, fake = TD.Kart.create({ id: 90, carId: rec.car || ctx.me.carId, driverId: rec.drv || ctx.me.driverId, name: 'Ảo Ảnh', ctrl: 'ghost' });
    fake.st = 'drive';
    const v = TD.kartView.create(ctx.root, fake);
    S.gv = v;
    v.loading.then(() => {
      if (v.shadow.parent) v.shadow.parent.remove(v.shadow);
      v.root.traverse((o) => {
        if (!o.isMesh) return;
        o.renderOrder = 3;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.transparent = true; m.opacity = ghostTint; m.depthWrite = false; m.needsUpdate = true; }
      });
    });
  }
  const tmp = {}, tmp2 = {};
  function stepGhost(S, t, dt) {
    const v = S.gv, k = v && v.kart, rec = S.ghost;
    if (!k) return;
    TD.Ghost.sample(rec, t, tmp); TD.Ghost.sample(rec, t + 0.1, tmp2);
    k.px = k.x; k.pz = k.z;
    k.x = tmp.x; k.y = tmp.y; k.z = tmp.z; k.yaw = tmp.yaw;
    const yr = Math.atan2(Math.sin(tmp2.yaw - tmp.yaw), Math.cos(tmp2.yaw - tmp.yaw)) / 0.1;
    k.speed = t < 0 || t > rec.time ? 0 : Math.hypot(tmp2.x - tmp.x, tmp2.z - tmp.z) / 0.1;
    k.input.steer = Math.max(-1, Math.min(1, -yr / 1.2));
    TD.kartView.update(v, dt);
  }

  // ---------- thông báo chưa có bóng ----------
  function noGhostDialog(S, ctx) {
    const host = document.getElementById('ui');
    if (!host) return;
    const w = document.createElement('div');
    w.className = 'modal pausebox'; w.dataset.practice = 'noghost';
    w.innerHTML = '<div class="panel"><h3>Thách Đấu Ảo Ảnh</h3><p style="margin:0 0 10px;max-width:22em">Chưa có bóng kỷ lục cho đường này. Hãy hoàn thành một trận đua trên đường này trước, bóng sẽ được ghi lại để bạn thách đấu.</p>' +
      '<button class="btn yellow" data-p="go">Đua không có bóng</button><button class="btn gray" data-p="lobby">Về sảnh</button></div>';
    host.appendChild(w);
    S.msg = w;
    TD.main.paused = true;
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      e.stopPropagation();
      closeMsg(S);
      if (b.dataset.p === 'lobby') TD.main.toLobby(); else TD.main.paused = false;
    });
  }
  function closeMsg(S) { if (S && S.msg) { S.msg.remove(); S.msg = null; } }

  // ---------- plugin ----------
  const plugin = {
    start(ctx) {
      const R = ctx.R, mode = R.mode.practice;
      const S = P.S = { free: mode === 'free', shadow: mode === 'shadow', rec: null, ghost: null, flag: null, laps: [], dirty: false, res: null, gap: null, group: null, ctx };
      if (!S.free) S.rec = TD.Ghost.create(R.trackId, ctx.me.carId, ctx.me.driverId);
      if (S.free) { buildFlag(S, ctx.root); overrideHud(); }
      if (S.shadow) {
        S.ghost = P.loadGhost(R.trackId);
        if (S.ghost) buildGhost(S, ctx); else noGhostDialog(S, ctx);
      }
    },
    update(dt, ctx) {
      const S = P.S, R = ctx.R, me = ctx.me;
      if (!S || S.ctx !== ctx) return;
      if (S.msg) { TD.main.paused = true; return; }
      const t = R.goT != null ? R.t - R.goT : -1;
      if (S.rec && t >= 0 && me.st !== 'finish') TD.Ghost.push(S.rec, t, me);
      if (S.free) {
        if (TD.input.take('flag')) setFlag(ctx);
        if (TD.input.take('flagBack')) flagBack(ctx);
        if (TD.input.take('flagDel')) delFlag(ctx);
        S.t = (S.t || 0) + dt;
        waveCloth(S, S.t);
        if (S.beam) S.beam.userData.mat.opacity = 0.75 + 0.25 * Math.sin(S.t * 2.4);
      }
      if (S.ghost) {
        stepGhost(S, t, dt);
        S.gap = t > 0 && me.st !== 'finish' ? t - TD.Ghost.timeAt(S.ghost, me.progress) : S.gap;
      }
    },
    event(e, mine, ctx) {
      const S = P.S;
      if (!S || S.ctx !== ctx || !mine) return;
      if (e.type === 'lap' && S.free) {
        if (S.dirty) { S.dirty = false; return; }   // vòng bị cắt bởi Về điểm cờ: không tính
        S.laps.push(e.time);
        const o = P.loadBest(), b = o.best[ctx.R.trackId];
        if (b == null || e.time < b) { o.best[ctx.R.trackId] = e.time; P.saveBest(o); }
      } else if (e.type === 'finish' && S.rec && !e.dnf && e.time != null) {
        TD.Ghost.finish(S.rec, e.time);
        const old = S.shadow && S.ghost ? S.ghost.time : null, stored = P.loadGhost(ctx.R.trackId);
        const better = !stored || e.time < stored.time;
        if (better) P.saveGhost(S.rec);
        S.res = { old, time: e.time, better };
      }
    },
    settle(F, ctx) {
      const S = P.S, r = S && S.res;
      if (!S || S.ctx !== ctx || !r) return;
      if (S.shadow && r.old != null) {
        const d = r.time - r.old;
        F.cards.push('<div class="fin-card"><h4>Thách Đấu Ảo Ảnh</h4><div class="fin-gain" style="color:' + (d < 0 ? '#7dff9a' : '#ff8a7a') + '">' + sgn(d) + 's</div>' +
          '<small>Thành tích cũ ' + fmt(r.old) + '</small><small>Mới ' + fmt(r.time) + (r.better ? ' · bóng mới được lưu' : '') + '</small></div>');
      } else if (r.better) {
        F.cards.push('<div class="fin-card"><h4>Bóng kỷ lục</h4><div class="fin-gain">' + fmt(r.time) + '</div><small>Đã lưu để thách đấu Ảo Ảnh</small></div>');
      }
    },
    end(ctx) {
      const S = P.S;
      if (!S || S.ctx !== ctx) return;
      S.dead = true; closeMsg(S);
      if (S.group && S.group.parent) S.group.parent.remove(S.group);
      if (S.gv && S.gv.root.parent) S.gv.root.parent.remove(S.gv.root);
    },
    rects(hud) {
      const S = P.S;
      if (!S || !S.free) return [];
      return btnRects(hud).map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));
    },
    draw(g, hud) {
      const S = P.S;
      if (!S || S.ctx !== TD.main.ctx) return;
      if (S.free) { drawButtons(g, hud, S); drawLaps(g, hud, S); }
      else if (S.ghost) drawGap(g, hud, S);
    },
  };

  // ---------- HUD ----------
  // Vị trí theo clip gốc: cụm nút ở góc trái, dưới bảng hạng và trên nút hồi về đường.
  function btnRects(hud) {
    const u = hud.h / 720, sz = Math.max(44, Math.round(56 * u)), gap = Math.max(10, Math.round(26 * u)), x0 = Math.round(18 * u) + 4, y0 = Math.round(158 * u);
    return [['flag', 'Thiết lập', 'F'], ['flagBack', 'Về', 'G'], ['flagDel', 'Xóa', 'X']].map(([id, l, key], i) => ({ id, label: l, key, x: x0 + i * (sz + gap), y: y0, w: sz, h: sz }));
  }
  let iconFlag = null;
  function icon() {
    if (!iconFlag) { iconFlag = new Image(); iconFlag.src = 'art/practice/icon_flag.png?v=' + (TD.REV || ''); }
    return iconFlag.complete && iconFlag.naturalWidth ? iconFlag : null;
  }
  function drawButtons(g, hud, S) {
    const bs = btnRects(hud), fs = Math.max(10, Math.round(hud.h / 720 * 14));
    for (const b of bs) {
      const on = b.id === 'flag' || !!S.flag, cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 2;
      g.save(); g.globalAlpha = on ? 1 : 0.45;
      const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      gr.addColorStop(0, '#3d8cf0'); gr.addColorStop(1, '#0e3f9e');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(2, r * 0.07); g.strokeStyle = 'rgba(190,225,255,0.9)'; g.stroke();
      g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = Math.max(3, r * 0.15); g.lineCap = 'round'; g.lineJoin = 'round';
      if (b.id === 'flag') {
        const im = icon(), s = r * 1.15;
        if (im) { g.imageSmoothingEnabled = true; g.drawImage(im, cx - s / 2, cy - s / 2, s, s); }
      } else if (b.id === 'flagBack') {
        // mũi tên cong quay về (⟲), như nút xanh "Về điểm cờ"
        const ra = r * 0.46, a0 = -0.35 * Math.PI, a1 = 1.35 * Math.PI;
        g.beginPath(); g.arc(cx, cy, ra, a0, a1); g.stroke();
        const hx = cx + Math.cos(a0) * ra, hy = cy + Math.sin(a0) * ra, q = r * 0.3;
        g.beginPath(); g.moveTo(hx - q * 0.2, hy - q * 1.1); g.lineTo(hx + q * 0.9, hy + q * 0.1); g.lineTo(hx - q * 1.0, hy + q * 0.2); g.closePath(); g.fill();
      } else {
        const q = r * 0.36;
        g.beginPath(); g.moveTo(cx - q, cy - q); g.lineTo(cx + q, cy + q); g.moveTo(cx + q, cy - q); g.lineTo(cx - q, cy + q); g.stroke();
      }
      g.restore();
      g.save(); g.font = '700 ' + fs + 'px skui_CafetaBold, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 3; g.strokeStyle = 'rgba(6,20,50,0.9)'; g.fillStyle = '#fff'; g.globalAlpha = on ? 1 : 0.6;
      for (const [i, line] of [b.label, 'điểm cờ'].entries()) { const y = b.y + b.h + 3 + i * (fs + 1); g.strokeText(line, cx, y); g.fillText(line, cx, y); }
      if (!hud.touch) {   // gợi ý phím cho bàn phím
        const kx = b.x + b.w - 2, ky = b.y + 2;
        g.fillStyle = 'rgba(8,20,50,0.9)'; g.beginPath(); g.arc(kx, ky, fs * 0.8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffe27a'; g.textBaseline = 'middle'; g.fillText(b.key, kx, ky + 1);
      }
      g.restore();
    }
  }
  function pill(g, cx, y, w, h, col) {
    g.fillStyle = col; g.beginPath();
    if (g.roundRect) g.roundRect(cx - w / 2, y, w, h, Math.min(h / 2, 16)); else g.rect(cx - w / 2, y, w, h);
    g.fill();
  }
  // Danh sách vòng: vòng gần nhất ở trên, giữa phía trên màn; vòng nhanh nhất của đường tô vàng.
  function drawLaps(g, hud, S) {
    const u = hud.h / 720, fs = Math.max(11, Math.round(17 * u)), y0 = Math.round(14 * u);
    const best = P.loadBest().best[S.ctx.R.trackId], last = S.laps.slice(-3).reverse(), n0 = S.laps.length;
    const rows = last.map((t, i) => ({ s: 'Vòng ' + (n0 - i) + '   ' + fmt(t), hi: best != null && Math.abs(t - best) < 1e-6 }));
    if (!rows.length) rows.push({ s: 'Chưa có vòng nào hoàn thành', hi: false });
    g.save(); g.font = '700 ' + fs + 'px skui_CafetaBold, sans-serif';
    const w = Math.max(150, ...rows.map((r) => g.measureText(r.s).width), g.measureText('Kỷ lục ' + fmt(best)).width) + fs * 2;
    const h = (rows.length + 1) * (fs + 4) + 10, cx = hud.w * 0.5 - 52 * u - w / 2;   // nằm bên trái nút tạm dừng ở giữa
    pill(g, cx, y0, w, h, 'rgba(6,16,40,0.55)');
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = '#9fd0ff'; g.fillText('Kỷ lục ' + fmt(best), cx, y0 + 6);
    rows.forEach((r, i) => { g.fillStyle = r.hi ? '#ffe27a' : '#fff'; g.fillText(r.s, cx, y0 + 6 + (i + 1) * (fs + 4)); });
    g.restore();
  }
  // Khoảng cách tới bóng: số giây lớn dưới đồng hồ giữa trên màn; xanh = đang nhanh hơn bóng, đỏ = chậm hơn.
  function drawGap(g, hud, S) {
    const u = hud.h / 720, fs = Math.max(16, Math.round(34 * u)), sf = Math.max(10, Math.round(14 * u)), y0 = Math.round(14 * u), pw = Math.max(fs * 6, sf * 17), cx = hud.w * 0.5 - 52 * u - pw / 2;
    g.save(); pill(g, cx, y0, pw, fs + sf + 14, 'rgba(6,16,40,0.55)');
    g.textAlign = 'center'; g.textBaseline = 'top';
    const gap = S.gap;
    g.font = '700 ' + fs + 'px skui_CafetaBold, sans-serif';
    g.lineWidth = 4; g.strokeStyle = 'rgba(6,20,50,0.9)';
    const txt = gap == null ? '--' : sgn(gap) + 's';
    g.fillStyle = gap == null ? '#fff' : gap > 0 ? '#ff7a6a' : '#6dff95';
    g.strokeText(txt, cx, y0 + 5); g.fillText(txt, cx, y0 + 5);
    g.font = '700 ' + sf + 'px skui_CafetaBold, sans-serif'; g.fillStyle = '#9fd0ff';
    g.fillText('Ảo Ảnh · Thành tích cũ ' + fmt(S.ghost.time), cx, y0 + fs + 9);
    g.restore();
  }

  // Khối giờ góc phải do hud.js dựng: Kỷ lục của chế độ tự do là vòng nhanh nhất luyện tập (không phải thời gian về đích), số vòng 99 hiện '--'.
  // plugin.start chạy sau hud.start nên ghi đè một lần là đủ.
  function overrideHud() {
    const H = TD.hud;
    H.over.rec = (r) => P.loadBest().best[r.trackId];
    const tot = H.q('StaticUI/AnchorTopRight/Offset/IG_MiniMapContainer/Turns/FGLap/Label_Nums');
    if (tot && tot.txt) tot.txt.s = '--';
  }

  TD.racePlugins = TD.racePlugins || [];
  TD.racePlugins.push(plugin);
  TD.practice = P;
})(globalThis.TD = globalThis.TD || {});
