// Nền: rng, atlas + hoạt ảnh + prefab, tra cứu art theo loại, input, vòng lặp bước cố định, khung nhìn.
(function () {
  'use strict';
  const SK = window.SK = window.SK || {};
  const A = window.SK_ATLAS || { pages: [], f: {} };
  const D = window.SK_DATA || {};
  SK.A = A; SK.D = D; SK.DS = window.SK_DESIGN;
  SK.TILE = 16;
  SK.PPU = D.ppu || 16;
  SK.STEP = 1 / 60;

  // ---------------------------------------------------------------- rng / toán
  let seed = (Date.now() ^ 0x5eed1234) >>> 0;
  SK.setSeed = s => { seed = (s >>> 0) || 1; };
  SK.rand = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  SK.randf = (a, b) => a + (b - a) * SK.rand();
  SK.randi = (a, b) => a + Math.floor(SK.rand() * (b - a + 1));
  SK.pick = arr => arr[Math.floor(SK.rand() * arr.length)];
  SK.chance = p => SK.rand() < p;
  SK.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(SK.rand() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
  SK.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  SK.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  SK.deg = d => d * Math.PI / 180;
  SK.approach = (v, target, d) => v < target ? Math.min(target, v + d) : Math.max(target, v - d);

  const warned = {};
  SK.warnOnce = (key, msg) => { if (warned[key]) return; warned[key] = 1; console.warn('[SK] ' + msg); };
  // Kênh sự kiện để các mô-đun (tiếng, kỹ năng, trùm, sảnh) móc vào mà không sửa chỗ phát.
  const listeners = {};
  SK.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  SK.emit = (ev, ...args) => { const l = listeners[ev]; if (l) for (const fn of l) fn(...args); };

  // ---------------------------------------------------------------- atlas
  SK.pages = []; SK.pagesWhite = []; SK.pagesElite = [];

  function tintPage(img, color, alpha) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = alpha; x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  SK.loadArt = function () {
    return Promise.all(A.pages.map(src => new Promise(res => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => { SK.warnOnce('atlas' + src, 'atlas not loaded: ' + src); res(null); };
      im.src = src + (A.v ? '?v=' + A.v : '');
    }))).then(imgs => {
      SK.pages = imgs;
      SK.pagesWhite = imgs.map(im => im && tintPage(im, '#ffffff', 1));
      SK.pagesElite = imgs.map(im => im && tintPage(im, '#ff2a1a', 0.32));
    });
  };

  SK.frame = name => (name && A.f[name]) || null;

  // (x,y) là điểm neo của khung (thường là chân). o: {flip, sx, sy, rot, pages, alpha}
  SK.draw = function (ctx, name, x, y, o) {
    const f = A.f[name]; if (!f) return false;
    const pg = (o && o.pages) || SK.pages;
    const img = pg[f[0]]; if (!img) return false;
    const w = f[3], h = f[4], ax = Math.round(f[5]), ay = Math.round(f[6]);
    let sx = (o && o.sx) || 1, sy = (o && o.sy) || 1;
    if (o && o.flip) sx = -sx;
    const rot = (o && o.rot) || 0;
    const alpha = o && o.alpha != null ? o.alpha : 1;
    if (alpha !== 1) { ctx.save(); ctx.globalAlpha *= alpha; }
    if (sx === 1 && sy === 1 && !rot) {
      ctx.drawImage(img, f[1], f[2], w, h, Math.round(x) - ax, Math.round(y) - ay, w, h);
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (rot) ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(img, f[1], f[2], w, h, -ax, -ay, w, h);
      ctx.restore();
    }
    if (alpha !== 1) ctx.restore();
    return true;
  };

  // Unity nhân màu (c = [r,g,b,a]) lên sprite; ở đây nhân một lần rồi giữ bản cache.
  const tintCache = {};
  SK.drawTinted = function (ctx, name, x, y, c, o) {
    if (!c || (c[0] === 1 && c[1] === 1 && c[2] === 1)) {
      return SK.draw(ctx, name, x, y, Object.assign({}, o, { alpha: ((o && o.alpha) ?? 1) * (c ? c[3] : 1) }));
    }
    const f = A.f[name]; if (!f || !SK.pages[f[0]]) return false;
    const key = name + '|' + c[0].toFixed(2) + c[1].toFixed(2) + c[2].toFixed(2);
    let cv = tintCache[key];
    if (!cv) {
      cv = document.createElement('canvas'); cv.width = f[3]; cv.height = f[4];
      const x2 = cv.getContext('2d');
      x2.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
      x2.globalCompositeOperation = 'multiply';
      x2.fillStyle = 'rgb(' + (c[0] * 255 | 0) + ',' + (c[1] * 255 | 0) + ',' + (c[2] * 255 | 0) + ')';
      x2.fillRect(0, 0, f[3], f[4]);
      x2.globalCompositeOperation = 'destination-in';
      x2.drawImage(SK.pages[f[0]], f[1], f[2], f[3], f[4], 0, 0, f[3], f[4]);
      tintCache[key] = cv;
    }
    const ax = Math.round(f[5]), ay = Math.round(f[6]);
    let sx = (o && o.sx) || 1; const sy = (o && o.sy) || 1;
    if (o && o.flip) sx = -sx;
    ctx.save();
    ctx.globalAlpha *= c[3] * ((o && o.alpha) ?? 1);
    ctx.translate(Math.round(x), Math.round(y));
    if (o && o.rot) ctx.rotate(o.rot);
    ctx.scale(sx, sy);
    ctx.drawImage(cv, -ax, -ay);
    ctx.restore();
    return true;
  };

  // ---------------------------------------------------------------- hoạt ảnh
  SK.anim = key => (D.anims && D.anims[key]) || null;
  SK.animLen = key => { const a = SK.anim(key); return a ? a.d.reduce((s, x) => s + x, 0) : 0; };
  // Clip chỉ có đường Transform (f = []) trả undefined: nơi gọi giữ khung tĩnh của nút (drawPrefab, `|| e.d.body`).
  SK.animFrame = function (key, t) {
    const a = SK.anim(key); if (!a) return null;
    if (!a.f.length) return undefined;
    const tot = a.d.reduce((s, x) => s + x, 0) || 1;
    let u = a.loop ? ((t % tot) + tot) % tot : Math.min(Math.max(t, 0), tot - 1e-6);
    let i = 0;
    while (i < a.d.length - 1 && u >= a.d[i]) { u -= a.d[i]; i++; }
    return a.f[i];
  };

  // Đường cong Transform của clip gốc (tools/clip_xform.py): a.tr[đường dẫn nút tính từ nút mang Animator] =
  // {p: [[t, dx, dy]], s: [[t, sx, sy]], r: [[t, độ]]}, so với tư thế nghỉ, px y-LÊN, độ ngược kim đồng hồ.
  // Giữa hai khoá nội suy tuyến tính, sau khoá cuối giữ nguyên; lặp/kẹp thời gian như animFrame, trên a.len.
  // Trả về hệ màn hình: dx, dy (px, y xuống), sx, sy (hệ số nhân), rot (radian, chiều kim đồng hồ). Không có -> đồng nhất.
  function keyAt(k, u) {
    if (u <= k[0][0]) return k[0];
    for (let i = 1; i < k.length; i++) {
      if (u > k[i][0]) continue;
      const a = k[i - 1], b = k[i], w = b[0] > a[0] ? (u - a[0]) / (b[0] - a[0]) : 1;
      return [u, a[1] + (b[1] - a[1]) * w, a.length > 2 ? a[2] + (b[2] - a[2]) * w : 0];
    }
    return k[k.length - 1];
  }
  SK.animXform = function (key, t, path) {
    const out = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
    const a = key && SK.anim(key), n = a && a.tr && a.tr[path || ''];
    if (!n) return out;
    const tot = a.len || a.d.reduce((s, x) => s + x, 0) || 1;
    const u = a.loop ? ((t % tot) + tot) % tot : Math.min(Math.max(t, 0), tot - 1e-6);
    if (n.p) { const v = keyAt(n.p, u); out.dx = v[1]; out.dy = -v[2]; }
    if (n.s) { const v = keyAt(n.s, u); out.sx = v[1]; out.sy = v[2]; }
    if (n.r) out.rot = -keyAt(n.r, u)[1] * Math.PI / 180;
    return out;
  };
  // Tư thế của nút `path` gộp mọi nút tổ tiên có đường cong ('' rồi 'img' rồi 'img/body'...): cộng độ lệch, nhân cỡ,
  // cộng góc. Bỏ qua việc cỡ/góc của cha xoay-co độ lệch của con (các clip quái/nhân vật không cần).
  SK.animPose = function (key, t, path) {
    const out = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
    const a = key && SK.anim(key);
    if (!a || !a.tr || path == null) return out;
    const parts = path ? path.split('/') : [];
    for (let i = 0; i <= parts.length; i++) {
      const pth = parts.slice(0, i).join('/');
      if (!a.tr[pth]) continue;
      const x = SK.animXform(key, t, pth);
      out.dx += x.dx; out.dy += x.dy; out.sx *= x.sx; out.sy *= x.sy; out.rot += x.rot;
    }
    return out;
  };

  // Bật/tắt nút (tr[path].on = [[t, 0|1]], bậc thang) của clip ở thời điểm t: 1/0, hoặc null nếu clip không đụng nút.
  SK.animOn = function (key, t, path) {
    const a = key && SK.anim(key), n = a && a.tr && a.tr[path || ''];
    if (!n || !n.on) return null;
    const tot = a.len || a.d.reduce((s, x) => s + x, 0);
    const u = !tot ? 0 : a.loop ? ((t % tot) + tot) % tot : Math.min(Math.max(t, 0), tot);
    let v = n.on[0][1];
    for (const k of n.on) { if (k[0] <= u + 1e-6) v = k[1]; else break; }
    return v;
  };

  // ---------------------------------------------------------------- máy trạng thái Animator (SK_DATA.ctrl)
  // ctrl = {p: {param: [kiểu, mặc định]}, L: [{w, add, def, any: [T], st: {state: [T]}, sp?: {state: tốc}}]},
  // T = [state đích | null (exit -> state mặc định), [[mode, param, ngưỡng]], exitTime | null, thời lượng chuyển].
  // Kiểu param Unity: 1 float, 3 int, 4 bool, 9 trigger. mode: 1 If, 2 IfNot, 3 Greater, 4 Less, 6 Equals, 7 NotEqual.
  // Như Unity: mỗi bước mỗi layer xét chuyển từ Any State trước rồi tới state hiện tại, tối đa một chuyển; trigger bị
  // tiêu khi một chuyển dùng nó (sau khi mọi layer đã xét); exitTime tính trên thời gian chuẩn hoá (len clip). Chuyển mềm (thời lượng) bị bỏ:
  // đổi state tức thì. map: state -> khoá anim của thực thể (e.anims, w.anims, s0.layers).
  SK.smNew = function (ctrlName, map) {
    const c = ctrlName && D.ctrl && D.ctrl[ctrlName];
    if (!c) return null;
    const P = {};
    for (const [k, v] of Object.entries(c.p)) P[k] = v[1];
    return { c, map: map || {}, P, L: c.L.map(l => ({ st: l.def, t: 0 })) };
  };
  SK.smSet = (sm, name, v) => { if (sm && name in sm.P) sm.P[name] = v; };
  SK.smTrig = (sm, name) => { if (sm && name in sm.P) sm.P[name] = true; };
  SK.smKey = (sm, li) => (sm && sm.L[li || 0] && sm.map[sm.L[li || 0].st]) || null;
  SK.smState = (sm, li) => (sm && sm.L[li || 0] ? sm.L[li || 0].st : null);
  function smLen(sm, st) { const a = SK.anim(sm.map[st]); return !a ? 0 : a.len != null ? a.len : a.d.reduce((s, x) => s + x, 0); }
  function smCond(sm, cs) {
    for (const [m, k, thr] of cs) {
      const v = sm.P[k];
      if (v === undefined) return false;
      if (m === 1 ? !v : m === 2 ? !!v : m === 3 ? !(v > thr) : m === 4 ? !(v < thr) : m === 6 ? v !== thr : m === 7 ? v === thr : false) return false;
    }
    return true;
  }
  // Mốc exitTime x có rơi vào khoảng thời gian chuẩn hoá (n0, n1] không: x < 1 với clip lặp thì xét mỗi vòng;
  // x >= 1 (hoặc clip không lặp) thì đúng từ khi vượt mốc trở đi.
  function exitHit(x, n0, n1, loop) {
    if (x >= 1 || !loop) return n1 >= x;
    return Math.floor(n1 - x) > Math.floor(n0 - x);
  }
  // onEv(tên hàm sự kiện, layer, state): sự kiện AnimationClip (ev) rơi vào bước này.
  SK.smStep = function (sm, dt, onEv) {
    if (!sm) return;
    const used = [];
    sm.c.L.forEach((ly, li) => {
      const l = sm.L[li], a = SK.anim(sm.map[l.st]), len = smLen(sm, l.st);
      const t0 = l.t, sp = (ly.sp && ly.sp[l.st]) || 1;
      l.t += dt * sp;
      const n0 = len > 0 ? t0 / len : (t0 > 0 ? 1e9 : 0), n1 = len > 0 ? l.t / len : 1e9;
      let T = null;
      for (const x of ly.any) if (x[1].length && smCond(sm, x[1])) { T = x; break; }
      if (!T) {
        for (const x of ly.st[l.st] || []) {
          if (x[2] != null ? !exitHit(x[2], n0, n1, a && a.loop) : !x[1].length) continue;
          if (smCond(sm, x[1])) { T = x; break; }
        }
      }
      // Sự kiện của clip trong (t0, t1]; rời state bằng chuyển mềm thì clip cũ còn chạy thêm T[3] giây (Unity vẫn bắn
      // sự kiện trong lúc chuyển, vd HitBack ở cuối char_hit của nhân vật: exit 0,9 + 0,1 s).
      if (onEv && a && a.ev) {
        const t1 = l.t + (T ? T[3] * sp : 0);
        for (const [et, fn] of a.ev) {
          let hit;
          if (a.loop && len > 0) hit = Math.floor((t1 - et + 1e-6) / len) > Math.floor((t0 - et + 1e-6) / len) || (t0 === 0 && et === 0);
          else hit = (t0 === 0 ? et >= 0 : et > t0 + 1e-6) && et <= t1 + 1e-6;
          if (hit) onEv(fn, li, l.st);
        }
      }
      if (T) {
        for (const [, k] of T[1]) if (sm.c.p[k] && sm.c.p[k][0] === 9) used.push(k);
        l.st = T[0] == null ? ly.def : T[0]; l.t = 0;
      }
    });
    for (const k of used) sm.P[k] = false;   // trigger tiêu sau khi mọi layer đã xét (một trigger "dead" dùng ở layer 0 và 2)
  };

  // ---------------------------------------------------------------- prefab
  // Phần có f là quad cộng sáng của Unity (UISprite, texiao_01...) — vẽ bằng code thay vì dán ảnh.
  const GLOW_FRAMES = { UISprite: 1, texiao_01: 1, light_01: 1, portal_center: 1, nothing: 1, ui_effect_progress_flash: 1 };
  SK.prefab = name => (D.prefabs && D.prefabs[name]) || null;
  SK.prefabMbs = (parts, cls) => {
    if (!parts) return null;
    for (const p of parts) if (p.mbs && p.mbs[cls]) return p.mbs[cls];
    return null;
  };
  function sorted(parts) {
    if (!parts._sorted) parts._sorted = parts.map((p, i) => [p, i]).sort((a, b) => ((a[0].o || 0) - (b[0].o || 0)) || (a[1] - b[1])).map(x => x[0]);
    return parts._sorted;
  }
  // Phần nào nằm dưới một nút mang Animator (p.a) -> [[phần Animator, đường dẫn tương đối]] để tra a.tr.
  // Tên phần: gốc là tên prefab, còn lại '/a/b' (tools/build_sk.py prefab_parts).
  function animOwners(parts) {
    if (parts._owners) return parts._owners;
    const owners = parts.filter(q => q.a && Object.values(q.a).some(k => SK.anim(k) && SK.anim(k).tr));
    const m = new Map();
    for (const p of parts) {
      const l = [];
      for (const q of owners) {
        if (q === p) l.push([q, '']);
        else if (q.n[0] !== '/') { if (p.n[0] === '/') l.push([q, p.n.slice(1)]); }
        else if (p.n.startsWith(q.n + '/')) l.push([q, p.n.slice(q.n.length + 1)]);
      }
      if (l.length) m.set(p, l);
    }
    return (parts._owners = m);
  }
  const stateKey = (a, state) => (state && a[state]) || a[Object.keys(a)[0]];
  // o: {t, state, skip(part)->bool, alpha, pages, dx(part)->px, flip (lật ngang quanh x)}
  SK.drawPrefab = function (ctx, parts, x, y, o) {
    if (!parts) return false;
    o = o || {};
    let any = false;
    const owners = animOwners(parts);
    for (const p of sorted(parts)) {
      if (o.skip && o.skip(p)) continue;
      let f = p.f;
      if (p.a) {
        const af = SK.animFrame(stateKey(p.a, o.state), o.t || 0);
        if (af !== undefined) f = af;
      }
      if (!f || GLOW_FRAMES[f]) continue;
      const sc = p.sc || [1, 1];
      if (Math.abs(sc[0]) > 3 || Math.abs(sc[1]) > 3) continue;
      const k = o.scale || 1, fl = o.flip ? -1 : 1;
      let px = x + (p.at[0] * k + (o.dx ? o.dx(p) : 0)) * fl, py = y - p.at[1] * k;
      const opt = { sx: sc[0] * k * fl, sy: sc[1] * k, pages: o.pages, alpha: o.alpha };
      const own = owners.get(p);
      if (own) {
        for (const [q, rel] of own) {
          const xf = SK.animPose(stateKey(q.a, o.state), o.t || 0, rel);
          px += xf.dx * k * fl; py += xf.dy * k; opt.sx *= xf.sx; opt.sy *= xf.sy; opt.rot = (opt.rot || 0) + xf.rot * fl;
        }
        if (!opt.sx || !opt.sy) continue;   // clip co về 0 (SK.draw coi 0 là 1)
      }
      any = (p.c ? SK.drawTinted(ctx, f, px, py, p.c, opt) : SK.draw(ctx, f, px, py, opt)) || any;
    }
    return any;
  };

  // ---------------------------------------------------------------- tra art theo loại
  // Mỗi loại một hàm: nối sprite thật sau này chỉ sửa đúng một dòng ở đây.
  const OBJECT_PREFAB = {
    chest_weapon: 'chest_big', chest_reward: 'chest_room_reward', portal: 'transfer_gate',
    door_h: 'door_n', door_v: 'door_e', coin: 'coin_2', energy_orb: 'energy',
    hp_potion: 'health_pot', energy_potion: 'energy_pot', aim_line: 'aim_enemy'
  };
  const VFX_PREFAB = {
    bullet_hit: 'hit_yellow', enemy_hit: 'hit_red', enemy_bullet_hit: 'hit_orange',
    explode: 'explode_s', death: 'smoke', dust: 'fx_walk_dust'
  };
  SK.art = {
    object(kind) {
      const o = D.objects && D.objects[kind];
      if (o) return o;
      return SK.prefab(OBJECT_PREFAB[kind]);
    },
    vfx(kind) {
      const v = D.vfx && D.vfx[kind];
      if (v) return v;
      return SK.prefab(VFX_PREFAB[kind]);
    },
    ui(kind) { return (D.ui && D.ui[kind]) || null; },
    tiles(themeName) {
      const th = D.themes && D.themes[themeName];
      const t = (D.tiles && D.tiles[themeName]) || (th && th.tiles);
      if (!th && !t) return null;
      const out = { floor: [], walls: [] };
      if (t && t.floor) out.floor = t.floor.filter(SK.frame);
      else if (th && th.floors) out.floor = th.floors.map(p => p.layers[0] && p.layers[0].f).filter(SK.frame);
      const wl = (t && t.wall) || [];
      for (const w of wl) {
        // Offset thật lấy từ prefab tường cùng cặp khung (w505/w506 chồng nhau ở [0,0], bụi cây lệch 16).
        let atTop = 16;
        const pf = th && th.walls && th.walls.find(p => p.layers.some(l => l.f === w.top) && p.layers.some(l => l.f === w.front));
        if (pf) { const lt = pf.layers.find(l => l.f === w.top), lf = pf.layers.find(l => l.f === w.front); atTop = lt.at[1] - lf.at[1]; }
        if (SK.frame(w.front) || SK.frame(w.top)) out.walls.push({ front: w.front, top: w.top, atTop });
      }
      if (!out.walls.length && th && th.walls) {
        for (const p of th.walls) {
          const ls = p.layers.filter(l => SK.frame(l.f));
          if (ls.length) out.walls.push({ front: ls[0].f, top: ls[1] ? ls[1].f : null, atTop: ls[1] ? ls[1].at[1] - ls[0].at[1] : 0 });
        }
      }
      return out;
    }
  };

  // ---------------------------------------------------------------- input
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right', KeyJ: 'attack', KeyK: 'skill', Space: 'skill',
    KeyQ: 'swap', KeyE: 'interact', KeyL: 'special', Enter: 'confirm'
  };
  const I = SK.input = {
    held: {}, edge: {}, btn: {}, touchMode: false,
    stick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, R: 44 },
    down(a) { return !!(this.held[a] || this.btn[a]); },
    hit(a) { if (this.edge[a]) { this.edge[a] = false; return true; } return false; },
    clearEdges() { this.edge = {}; },
    moveVec() {
      let x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
      let y = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0);
      if (this.stick.active) {
        const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy;
        const m = Math.hypot(dx, dy);
        if (m > 6) { x = dx / Math.max(m, this.stick.R); y = dy / Math.max(m, this.stick.R); }
      }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    }
  };
  addEventListener('keydown', e => {
    const a = KEYMAP[e.code]; if (!a) return;
    if (!I.held[a]) I.edge[a] = true;
    I.held[a] = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) I.held[a] = false; });
  addEventListener('blur', () => { I.held = {}; I.btn = {}; I.stick.active = false; });

  // hitButton(xCss, yCss) -> tên hành động hoặc null (hud.js biết nút nằm đâu)
  SK.bindPointer = function (el, hitButton) {
    const ptr = {};
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') I.touchMode = true;
      const b = hitButton(e.clientX, e.clientY);
      if (b) { ptr[e.pointerId] = { btn: b }; I.btn[b] = true; I.edge[b] = true; }
      else if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.5 && !I.stick.active) {
        ptr[e.pointerId] = { stick: true };
        Object.assign(I.stick, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
      } else if (e.pointerType !== 'touch' && e.button === 0) {
        ptr[e.pointerId] = { btn: 'attack' }; I.btn.attack = true; I.edge.attack = true;
      } else if (e.pointerType === 'touch') {
        ptr[e.pointerId] = { btn: 'attack' }; I.btn.attack = true; I.edge.attack = true;
      }
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* pointer đã nhả */ }
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      const p = ptr[e.pointerId];
      if (p && p.stick) { I.stick.x = e.clientX; I.stick.y = e.clientY; }
    });
    const up = e => {
      const p = ptr[e.pointerId]; if (!p) return;
      if (p.stick) I.stick.active = false;
      if (p.btn && !Object.keys(ptr).some(k => k != e.pointerId && ptr[k].btn === p.btn)) I.btn[p.btn] = false;
      delete ptr[e.pointerId];
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };

  // ---------------------------------------------------------------- khung nhìn
  // Giữ tỉ lệ nguyên (pixel sắc), chiều cao lôgic ~225 px, bề ngang theo cửa sổ.
  SK.view = { w: 400, h: 225, scale: 2, dpr: 1 };
  SK.resize = function (cv, hud) {
    const W = innerWidth, H = innerHeight, dpr = Math.min(3, devicePixelRatio || 1);
    let scale = Math.max(1, Math.round(H / 225));
    while (scale > 1 && W / scale < 300) scale--;
    const v = SK.view;
    v.scale = scale; v.dpr = dpr;
    v.w = Math.ceil(W / scale); v.h = Math.ceil(H / scale);
    cv.width = v.w; cv.height = v.h;
    cv.style.width = v.w * scale + 'px'; cv.style.height = v.h * scale + 'px';
    hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr);
    hud.style.width = W + 'px'; hud.style.height = H + 'px';
  };

  // ---------------------------------------------------------------- vòng lặp
  SK.startLoop = function (step, render) {
    let acc = 0, last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.25) dt = 0.25;
      acc += dt;
      let n = 0;
      while (acc >= SK.STEP && n < 6) { step(SK.STEP); I.clearEdges(); acc -= SK.STEP; n++; }
      if (n === 6) acc = 0;
      render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  // ---------------------------------------------------------------- chữ
  SK.FONT = '"VT323", ui-monospace, Consolas, monospace';
  SK.text = function (ctx, str, x, y, size, color, align, outline) {
    ctx.font = size + 'px ' + SK.FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.fillStyle = outline;
      const o = Math.max(1, size / 12);
      ctx.fillText(str, x - o, y); ctx.fillText(str, x + o, y);
      ctx.fillText(str, x, y - o); ctx.fillText(str, x, y + o);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };
})();
