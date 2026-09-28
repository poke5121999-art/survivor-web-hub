/*
 * Cảnh bản đồ 2D kiểu PRO: P1.scene.add('world', …). Tile 32 px vẽ sẵn vào hai canvas (ground dưới actor, over
 * trên actor), phóng nguyên lần theo điểm ảnh thiết bị. Đi theo ô 4 hướng, NPC, trainer nhìn thấy (LOS), cỏ cao gặp
 * Pokémon, gờ nhảy, cửa nối, Pokémon đi theo, ngày/đêm.
 *
 *   mode: 'loading' | 'explore' | 'script' | 'warp' | 'battle'   (menus.js chỉ mở menu Esc khi 'explore')
 *
 * Dữ liệu: P1.MAPS / P1.SCRIPTS / P1.QUESTS (data/maps.js, tools/build_maps.js). Tham số gỡ lỗi: ?grid=1 (lớp va chạm),
 * ?period=morning|day|evening|night, ?touch=0|1, ?nosave=1.
 */
(function (P1) {
  'use strict';

  const A = () => P1.actors;
  const T = 32;
  const DIR = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  const DIR_OF = { up: 0, left: 1, down: 2, right: 3 };
  const OPP = [2, 3, 0, 1];
  const COLL = { free: 0, solid: 1, down: 2, left: 3, right: 4, up: 5, counter: 6 };
  const LEDGE_DIR = { 2: 2, 3: 1, 4: 3, 5: 0 };

  // [MAINLINE DEFAULT, not PokéOne-confirmed] xác suất gặp mỗi bước trong cỏ: FRLG Route 1 = 21/180 ≈ 11,7 %.
  const ENCOUNTER_RATE = { normal: 0.117, low: 0.06, verylow: 0.03 };
  const TURN_DELAY = 0.09;          // chạm nhẹ thì chỉ quay mặt (như HGSS); giữ quá ngưỡng này thì đi. Đặt tay.
  const BUMP_COOLDOWN = 0.35;
  const LOOK_RANDOM = [1.5, 4.5];   // giây giữa hai lần NPC nhìn quanh. Đặt tay.
  const GRASS_HIDE = 13;            // cỏ cao che 13/32 px dưới của ô (~40 %) như PRO
  const EMOTE_POP = 0.25, EMOTE_HOLD = 0.9;
  // Màu nhân (multiply) theo buổi, chỉ ngoài trời. Chọn bằng mắt, PRO không có bảng số trong client.
  const TINT = { morning: '#fff0dc', day: '', evening: '#ffc58f', night: '#5b69a8' };
  const GRID_COLOR = { 1: 'rgba(255,40,40,.38)', 2: 'rgba(255,220,0,.5)', 3: 'rgba(255,220,0,.5)', 4: 'rgba(255,220,0,.5)',
    5: 'rgba(255,220,0,.5)', 6: 'rgba(170,60,255,.45)' };
  const LEDGE_ARROW = { 2: '↓', 3: '←', 4: '→', 5: '↑' };

  function heldDir(input, prefer) {
    const h = input.held;
    if (prefer >= 0 && h[['up', 'left', 'down', 'right'][prefer]]) return prefer;
    if (h.up) return 0; if (h.down) return 2; if (h.left) return 1; if (h.right) return 3;
    return -1;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* Tile ref → vẽ vào canvas. ref = sheet*1024 + row*32 + col, -1 = trống. */
  function bake(M, layers, imgs) {
    const c = canvas(M.w * T, M.h * T), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (const L of layers || []) for (let i = 0; i < L.length; i++) {
      const t = L[i];
      if (t < 0) continue;
      const im = imgs[Math.floor(t / 1024)];
      if (!im) continue;
      const r = Math.floor((t % 1024) / 32), col = t % 32;
      g.drawImage(im, col * T, r * T, T, T, (i % M.w) * T, Math.floor(i / M.w) * T, T, T);
    }
    return c;
  }

  /* ---------------------------------------------------------------- hiệu ứng nhỏ (lá cỏ, bụi đáp) */
  function particles(x, y, n, colors, opt) {
    const ps = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * opt.spread;
      const s = opt.speed * (0.6 + Math.random() * 0.6);
      ps.push({ x: x + (Math.random() - 0.5) * opt.jitter, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c: colors[i % colors.length] });
    }
    let age = 0;
    return {
      update(dt) {
        age += dt;
        for (const p of ps) { p.vy += opt.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        return age < opt.life;
      },
      draw(ctx) {
        ctx.globalAlpha = Math.max(0, 1 - age / opt.life);
        for (const p of ps) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), opt.size, opt.size); }
        ctx.globalAlpha = 1;
      },
    };
  }
  function dustPuff(x, y) {
    const ps = [-1, 1, -0.5, 0.5, 0, 0].map((k, i) => ({ dx: k * 7, dy: i > 3 ? -2 : 0 }));
    let age = 0;
    const life = 0.35;
    return {
      update(dt) { age += dt; return age < life; },
      draw(ctx) {
        const k = age / life;
        ctx.fillStyle = 'rgba(235,228,210,' + (0.75 * (1 - k)).toFixed(3) + ')';
        for (const p of ps) { ctx.beginPath(); ctx.arc(x + p.dx * (0.6 + k), y + p.dy - 3 * k, 2 + 3 * k, 0, Math.PI * 2); ctx.fill(); }
      },
    };
  }

  /* ---------------------------------------------------------------- cảnh */
  const world = {
    mode: '',
    map: null, gfx: null, player: null, follower: null,
    actors: [], fx: [], emotes: [], t: 0, turnHold: 0, bumpCd: 0, lookT: {}, loaded: false, period: 'day',
    debug: { encounterRate: null, noEncounter: false, forceSpecies: null },

    /* ------------------------------------------------ vào / ra */
    async enter(args) {
      args = args || {};
      const ui = P1.worldUi;
      ui.mount();
      if (!this.hud && P1.ui && P1.ui.hud) {
        // HUD thuộc menus.js (đang viết lại song song): hỏng thì thế giới vẫn phải chạy.
        try { this.hud = P1.ui.hud(); } catch (e) { console.warn('HUD failed: ' + e.message); }
      }
      ui.pad.show();
      this.showHud(true);
      if (args.resume && this.loaded) {
        this.mode = this.resumeMode || 'explore';
        this.playMapMusic();
        if (this.onResume) { const f = this.onResume; this.onResume = null; f(); }
        return;
      }
      this.mode = 'loading';
      const st = P1.state;
      if (!P1.MAPS[st.map]) st.map = P1.MAPS.pallet_house_2f ? 'pallet_house_2f' : Object.keys(P1.MAPS)[0];
      const M = P1.MAPS[st.map];
      let x = st.x, y = st.z;
      const bad = !(x >= 0 && y >= 0 && x < M.w && y < M.h) || this.blocked(M, x, y);
      const asked = !bad && P1.query && P1.query.get('x') != null;   // ?map=&x=&z= thắng mốc spawn
      if (!asked && (args.intro || bad || !st.flags.intro) && M.settings.spawn) [x, y] = M.settings.spawn;
      else if (bad) {
        // Save cũ (bản 3D, lưới khác cỡ) có thể nằm ngoài map hoặc trên đồ đạc: về ô trống gần cửa vào.
        const L = M.links.find(l => l.kind === 'door') || M.links[0];
        const at = L ? [Math.min(M.w - 1, Math.max(0, L.x)), Math.min(M.h - 1, Math.max(0, L.y))] : [M.w >> 1, M.h >> 1];
        [x, y] = this.nearestFree(M, at[0], at[1]);
      }
      await this.loadMap(st.map, x, y, st.face == null ? 2 : st.face);
      this.loaded = true;
      ui.fade.to(0, 1);
      await this.afterArrive(true);
    },

    exit(next) {
      if (next === 'battle') {
        this.resumeMode = this.mode;   // 'battle': mã đang chờ trận xong sẽ tự đặt lại mode
        P1.worldUi.pad.off();
        this.showHud(false);
        return;
      }
      this.saveState();
      this.unloadMap();
      this.map = null;
      if (this.hud) { this.hud.destroy(); this.hud = null; }
      P1.worldUi.unmount();
      this.loaded = false;
      this.mode = '';
    },

    showHud(on) {
      const r = this.hud && this.hud.view && this.hud.view.root;
      if (r) r.style.display = on ? '' : 'none';
    },

    /* ------------------------------------------------ bản đồ */
    nearestFree(M, cx, cy) {
      for (let r = 0; r < Math.max(M.w, M.h); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (!this.blocked(M, x, y) && !M.npcs.some(n => n.x === x && n.y === y)) return [x, y];
      }
      return [cx, cy];
    },

    blocked(M, x, y) {
      if (x < 0 || y < 0 || x >= M.w || y >= M.h) return true;
      const c = M.colliders[y * M.w + x];
      return c === COLL.solid || c === COLL.counter;
    },

    async buildGfx(M) {
      const imgs = {};
      await Promise.all((M.sheets || []).map(s => P1.img('art/pro/tiles/' + s + '.png')
        .then(im => { imgs[s] = im; }, () => console.warn('tile sheet missing: ' + s))));
      return { ground: bake(M, M.ground, imgs), over: bake(M, M.over, imgs) };
    },

    async loadMap(id, x, y, face) {
      const M = P1.MAPS[id];
      if (!M) throw new Error('map not found: ' + id);
      const token = this.loadToken = (this.loadToken || 0) + 1;
      this.unloadMap();
      this.map = M;
      P1.state.map = id;
      if (M.settings.song) P1.audio.music(M.settings.song);
      const gfx = await this.buildGfx(M);
      if (token !== this.loadToken) return;   // một lần tải mới hơn đã thay map này
      this.gfx = gfx;
      this.player = A().playerActor({ x, y, face });
      this.actors = [];
      for (const d of M.npcs) this.addActor(d);
      this.refreshActors();
      this.refreshPeriod();
      await Promise.all([this.player.ready, this.refreshFollower(true)].concat(this.actors.map(a => a.ready)));
      P1.state.x = x; P1.state.z = y; P1.state.face = face;
    },

    unloadMap() {
      this.fx = []; this.emotes = [];
      this.gfx = null;
      this.actors = [];
      this.player = null;
      this.follower = null; this.followKey = null;
      P1.worldUi.showMon(0);
    },

    addActor(d) {
      const face = DIR_OF[d.face] != null ? DIR_OF[d.face] : 2;
      const opt = { x: d.x, y: d.y, face, name: d.name, data: d };
      let a;
      if (d.kind === 'sign') a = new P1.Actor(Object.assign({ kind: 'sign', shadow: false }, opt));
      else if (d.kind === 'item') a = A().itemActor(d.sprite || 'sprite11', opt);   // sprite11 = Poké Ball trên đất
      else a = A().npcActor(d.sprite, opt);
      a.id = d.id;
      this.actors.push(a);
      return a;
    },

    /* Ẩn/hiện NPC theo cờ (hideif / showif, vật phẩm đã nhặt, trainer đã rời đi). */
    refreshActors() {
      for (const a of this.actors) {
        const d = a.data, f = P1.state.flags;
        let vis = true;
        if (d.hideIf && f[d.hideIf]) vis = false;
        if (d.showIf && !f[d.showIf]) vis = false;
        if (d.kind === 'item' && f[this.itemFlag(d)]) vis = false;
        a.setVisible(vis);
      }
    },
    itemFlag(d) { return 'item_' + this.map.id + '_' + d.id; },
    actorById(id) { return this.actors.find(a => a.id === id); },
    actorAt(x, y) { return this.actors.find(a => !a.hidden && a.x === x && a.y === y); },

    /*
     * Pokémon đi theo: con còn sống đầu tiên trong đội có ảnh follow tải được. Ảnh tải bất đồng bộ; followToken bỏ
     * kết quả cũ nếu đội đổi giữa chừng. place: đặt lại sau lưng người chơi (vào map).
     */
    refreshFollower(place) {
      const alive = P1.state.party.filter(m => m.hp > 0);
      const key = alive.map(m => m.dex + (m.shiny ? 's' : '')).join(',');
      if (!place && this.followKey === key) return Promise.resolve();
      this.followKey = key;
      const token = this.followToken = (this.followToken || 0) + 1;
      const pick = async () => {
        for (const m of alive) {
          for (const shiny of m.shiny ? [true, false] : [false]) {
            const im = await P1.img(A().followUrl(m.dex, shiny)).catch(() => null);
            if (im) return { im, dex: m.dex + (shiny ? 's' : '') };
          }
        }
        return null;
      };
      return pick().then(got => {
        if (token !== this.followToken || !this.player) return;
        const old = this.follower;
        if (!got) { this.follower = null; return; }
        if (old && old.dex === got.dex && !place) return;
        const p = this.player;
        let bx = p.x - DIR[p.face][0], by = p.y - DIR[p.face][1];
        if (old && !place) { bx = old.x; by = old.y; }
        else if (this.blocked(this.map, bx, by) || this.actorAt(bx, by)) { bx = p.x; by = p.y; }
        const f = A().followActor(got.im, { x: bx, y: by, face: old && !place ? old.face : p.face });
        f.dex = got.dex;
        f.setVisible(!(bx === p.x && by === p.y));
        this.follower = f;
        return f.ready;
      });
    },

    refreshPeriod() {
      const q = P1.query && P1.query.get('period');
      this.period = q || P1.period();
    },

    /* ------------------------------------------------ vòng lặp */
    update(dt) {
      if (!this.map || !this.player) return;
      this.t += dt;
      const frozen = P1.ui && P1.ui.isOpen && P1.ui.isOpen();
      const questOpen = P1.worldUi.quests.isOpen();
      if (this.mode === 'explore' && !frozen && !questOpen) this.explore(dt);
      else { for (const k of ['a', 'up', 'left', 'down', 'right']) P1.input.take(k); }
      if (questOpen && (P1.input.take('b') || P1.input.take('menu'))) P1.worldUi.quests.close();
      this.player.update(dt);
      if (this.follower) this.follower.update(dt);
      for (const a of this.actors) a.update(dt);
      if (this.mode === 'explore' && !frozen) this.idleNpcs(dt);
      this.fx = this.fx.filter(f => f.update(dt));
      if ((this.periodT = (this.periodT || 0) - dt) < 0) { this.periodT = 30; this.refreshPeriod(); }
    },

    /* Phóng nguyên lần theo điểm ảnh thiết bị: ~22 ô ngang trên máy tính, ~14 ô trên điện thoại. */
    camera(v) {
      const M = this.map, p = this.player, c = v.canvas;
      const target = v.w >= 900 ? 22 : 14;
      const z = Math.max(1, Math.round(c.width / (T * target)));
      const vw = c.width / z, vh = c.height / z, mw = M.w * T, mh = M.h * T;
      const axis = (centre, view, size) => size > view ? Math.min(size - view, Math.max(0, centre - view / 2)) : (size - view) / 2;
      const x = axis(p.px * T + T / 2, vw, mw), y = axis(p.py * T + T / 2, vh, mh);
      // Làm tròn về điểm ảnh thiết bị để mép tile không hở.
      return { z, x: Math.round(x * z) / z, y: Math.round(y * z) / z, vw, vh };
    },

    render() {
      const v = P1.view(), ctx = v.ctx, c = v.canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, c.width, c.height);
      if (this.map && this.gfx && this.player) this.draw(v, ctx, c);
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    },

    draw(v, ctx, c) {
      const M = this.map, g = this.gfx, cam = this.cam = this.camera(v), z = cam.z;
      const snap = n => Math.round(n * z) / z;
      const toMap = () => ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
      toMap();
      ctx.drawImage(g.ground, 0, 0);
      const list = this.actors.filter(a => !a.hidden);
      list.push(this.player);
      if (this.follower && !this.follower.hidden) list.push(this.follower);
      list.sort((a, b) => a.py - b.py || a.px - b.px);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (const a of list) a.drawShadow(ctx, snap);
      for (const a of list) { a.draw(ctx, snap); this.grassOver(ctx, a); }
      for (const f of this.fx) f.draw(ctx);
      ctx.drawImage(g.over, 0, 0);
      for (const e of this.emotes) this.drawEmote(ctx, e, snap);
      const tint = M.settings.dark ? TINT.night : M.settings.indoors ? '' : TINT[this.period];
      if (tint) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalCompositeOperation = 'source-over';
        toMap();
      }
      if (P1.query && P1.query.get('grid') === '1') this.drawGrid(ctx, z);
    },

    /* Cỏ cao che chân: vẽ lại phần dưới ô cỏ (lấy từ canvas ground) ngay sau actor đứng/đang bước trong đó. */
    grassOver(ctx, a) {
      const M = this.map, m = a.move;
      if (a.kind === 'sign' || (m && m.jump)) return;
      const cells = m ? [[m.fx, m.fy], [m.tx, m.ty]] : [[a.x, a.y]];
      for (const [x, y] of cells) {
        if (x < 0 || y < 0 || x >= M.w || y >= M.h || !M.zones.grid[y * M.w + x]) continue;
        const sy = y * T + T - GRASS_HIDE;
        ctx.drawImage(this.gfx.ground, x * T, sy, T, GRASS_HIDE, x * T, sy, T, GRASS_HIDE);
      }
    },

    drawEmote(ctx, e, snap) {
      const a = e.actor;
      if (a.hidden) return;
      // Theo đồng hồ thật như sleep() trong emote(): máy chậm (dt bị chặn 0,05) vẫn bật đủ cỡ trước khi tắt.
      const k = Math.min(1, (performance.now() - e.t0) / 1000 / EMOTE_POP);
      if (k <= 0) return;
      const cx = snap(a.px * T) + T / 2, bottom = snap(a.py * T) + T - 44 - 2 - a.lift;   // thân cao ~44 px
      const bw = 25, bh = 32;
      ctx.save();
      ctx.translate(cx, bottom);
      ctx.scale(k, k);
      const im = this.bubbleImg();
      if (im) ctx.drawImage(im, -bw / 2, -bh, bw, bh);
      else { ctx.fillStyle = '#fff'; ctx.fillRect(-bw / 2, -bh, bw, bh - 6); }
      ctx.fillStyle = '#d0231d';
      ctx.font = 'bold 20px Arimo, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text, 0.5, -bh / 2 - 2);
      ctx.restore();
    },
    bubbleImg() {
      if (this.bubble === undefined) {
        this.bubble = null;
        try {
          if (P1.proui && P1.proui.has('bubble')) P1.img(P1.proui.url('bubble')).then(im => { this.bubble = im; }, () => {});
        } catch (e) { /* atlas chưa tải: vẽ khung trắng */ }
      }
      return this.bubble;
    },

    /* ?grid=1: lớp soạn bản đồ — đỏ chặn, tím quầy, vàng gờ (mũi tên = hướng nhảy), xanh lá vùng gặp, xanh dương cửa. */
    drawGrid(ctx, z) {
      const M = this.map;
      ctx.font = '9px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
        const i = y * M.w + x, c = M.colliders[i];
        if (GRID_COLOR[c]) { ctx.fillStyle = GRID_COLOR[c]; ctx.fillRect(x * T, y * T, T, T); }
        if (M.zones.grid[i]) { ctx.fillStyle = 'rgba(40,220,60,.45)'; ctx.fillRect(x * T + 4, y * T + 4, T - 8, T - 8); }
        if (LEDGE_ARROW[c]) { ctx.fillStyle = '#000'; ctx.font = 'bold 16px Arial'; ctx.fillText(LEDGE_ARROW[c], x * T + T / 2, y * T + T / 2); ctx.font = '9px Arial, sans-serif'; }
        if (x % 5 === 0 && y % 5 === 0) {
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x * T + 1, y * T + 1, 26, 11);
          ctx.fillStyle = '#fff'; ctx.fillText(x + ',' + y, x * T + 14, y * T + 7);
        }
      }
      for (const L of M.links) {
        const x = Math.max(0, Math.min(M.w - 1, L.x)), y = Math.max(0, Math.min(M.h - 1, L.y));
        ctx.fillStyle = 'rgba(40,120,255,.5)'; ctx.fillRect(x * T, y * T, T, T);
        ctx.strokeStyle = '#1a5cff'; ctx.lineWidth = 2; ctx.strokeRect(x * T + 1, y * T + 1, T - 2, T - 2);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      for (let x = 0; x <= M.w; x++) { ctx.moveTo(x * T, 0); ctx.lineTo(x * T, M.h * T); }
      for (let y = 0; y <= M.h; y++) { ctx.moveTo(0, y * T); ctx.lineTo(M.w * T, y * T); }
      ctx.stroke();
    },

    explore(dt) {
      const I = P1.input, p = this.player;
      this.bumpCd -= dt;
      if (I.take('quests')) P1.worldUi.quests.toggle();
      if (p.move) return;
      if (I.take('a')) { this.interact(); return; }
      const dir = heldDir(I, p.face);
      // Chạm nhanh hơn một khung hình (máy chậm, phím ảo) vẫn quay mặt: đọc cả hàng phím đã nhấn.
      const tap = ['up', 'left', 'down', 'right'].findIndex(k => I.take(k));
      if (dir < 0 && tap >= 0 && tap !== p.face) { p.face = tap; this.turnHold = TURN_DELAY; return; }
      if (dir < 0) { this.turnHold = 0; return; }
      if (dir !== p.face) { p.face = dir; this.turnHold = TURN_DELAY; return; }
      if (this.turnHold > 0) { this.turnHold -= dt; return; }
      this.tryStep(dir);
    },

    idleNpcs(dt) {
      for (const a of this.actors) {
        if (a.hidden || !a.data || a.move || a.kind !== 'npc') continue;
        if (a.data.path) { this.patrol(a, dt); continue; }
        if (a.data.look !== 'random') continue;
        if (this.lookT[a.id] === undefined) this.lookT[a.id] = LOOK_RANDOM[0] + Math.random() * (LOOK_RANDOM[1] - LOOK_RANDOM[0]);
        this.lookT[a.id] -= dt;
        if (this.lookT[a.id] > 0) continue;
        this.lookT[a.id] = undefined;
        a.face = (Math.random() * 4) | 0;
        if (a.data.trainer) this.checkSight();
      }
    },

    /* Đi tuần theo path 'up2,down2' lặp mãi; ô bị chặn (người chơi đứng) thì chờ. Nghỉ 0,6 s giữa hai bước (đặt tay). */
    patrol(a, dt) {
      if (!a.route) {
        a.route = [];
        for (const t of a.data.path.split(',')) { const m = /^(up|down|left|right)(\d*)$/.exec(t.trim()); if (m) for (let i = 0; i < (+m[2] || 1); i++) a.route.push(DIR_OF[m[1]]); }
        a.routeAt = 0; a.routeWait = 0.6;
      }
      if (!a.route.length || (a.routeWait -= dt) > 0) return;
      const d = a.route[a.routeAt], tx = a.x + DIR[d][0], ty = a.y + DIR[d][1];
      const p = this.player, f = this.follower;
      if (!this.free(tx, ty, a) || (p.x === tx && p.y === ty) || (f && !f.hidden && f.x === tx && f.y === ty)) { a.face = d; a.routeWait = 0.4; return; }
      a.routeAt = (a.routeAt + 1) % a.route.length;
      a.routeWait = 0.6;
      a.step(d, a.data.fast ? { speed: a.speed * 1.6 } : {});
    },

    /* ------------------------------------------------ đi */
    linkAt(x, y) { return this.map.links.find(L => L.x === x && L.y === y); },
    collider(x, y) { const M = this.map; return x < 0 || y < 0 || x >= M.w || y >= M.h ? COLL.solid : M.colliders[y * M.w + x]; },
    free(x, y, ignore) {
      if (this.blocked(this.map, x, y)) return false;
      const c = this.collider(x, y);
      if (c >= 2 && c <= 5) return false;
      const a = this.actorAt(x, y);
      return !a || a === ignore;
    },

    bump(dir) {
      this.player.bump(dir);
      if (this.bumpCd > 0) return;
      this.bumpCd = BUMP_COOLDOWN;
      if (P1.settings.bumpSound) P1.audio.sfx('bump');
    },

    tryStep(dir) {
      const p = this.player;
      const tx = p.x + DIR[dir][0], ty = p.y + DIR[dir][1];
      const link = this.linkAt(tx, ty);
      if (link && (link.kind === 'door' || link.kind === 'edge')) { this.useLink(link); return; }
      const c = this.collider(tx, ty);
      if (c >= 2 && c <= 5) {
        if (LEDGE_DIR[c] !== dir) { this.bump(dir); return; }
        const lx = tx + DIR[dir][0], ly = ty + DIR[dir][1];
        if (!this.free(lx, ly)) { this.bump(dir); return; }
        this.walk(dir, { jump: true });
        return;
      }
      if (!this.free(tx, ty)) { this.bump(dir); return; }
      this.walk(dir, {});
    },

    async walk(dir, opt) {
      const p = this.player, fromX = p.x, fromY = p.y;
      if (opt.jump) P1.audio.sfx('jump');
      const arrive = p.step(dir, opt);
      this.followStep(fromX, fromY, opt.jump);
      await arrive;
      P1.state.x = p.x; P1.state.z = p.y; P1.state.face = p.face;
      const stats = P1.state.stats = P1.state.stats || {};
      stats.steps = (stats.steps || 0) + 1;
      if (opt.jump) this.fx.push(dustPuff(p.x * T + T / 2, p.y * T + T - 2));
      await this.onStep();
    },

    followStep(fromX, fromY, jump) {
      const f = this.follower;
      if (!f) return;
      if (f.hidden) { f.teleport(fromX, fromY, this.player.face); f.setVisible(true); return; }
      const dx = fromX - f.x, dy = fromY - f.y, n = Math.abs(dx) + Math.abs(dy);
      const d = dx > 0 ? 3 : dx < 0 ? 1 : dy > 0 ? 2 : 0;
      if (n === 1) f.step(d);
      else if (jump && n === 2) f.step(d, { jump: true });
      else f.teleport(fromX, fromY, this.player.face);
    },

    /* Lá cỏ bay khi bước vào ô cỏ: màu lấy từ chính ô cỏ trên canvas ground. */
    rustle(x, y) {
      let cols = ['#58b848', '#3c8c34'];
      try {
        const d = this.gfx.ground.getContext('2d').getImageData(x * T + 16, y * T + 22, 1, 1).data;
        if (d[3]) cols = ['rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')', 'rgb(' + (d[0] * 0.7 | 0) + ',' + (d[1] * 0.7 | 0) + ',' + (d[2] * 0.7 | 0) + ')'];
      } catch (e) { /* canvas bẩn (khác nguồn): giữ màu mặc định */ }
      this.fx.push(particles(x * T + T / 2, y * T + T - 8, 6, cols, { spread: 2.2, speed: 70, gravity: 260, life: 0.25, size: 2, jitter: 14 }));
    },

    async onStep() {
      const p = this.player, M = this.map;
      const link = this.linkAt(p.x, p.y);
      if (link && (link.kind === 'stairs' || link.kind === 'warp')) { await this.useLink(link); return; }
      const zone = M.zones.grid[p.y * M.w + p.x];
      if (zone) {
        this.rustle(p.x, p.y);
        if (await this.checkSight()) return;
        this.rollEncounter(M.zones.ids[zone - 1]);
        return;
      }
      await this.checkSight();
    },

    /* ------------------------------------------------ gặp Pokémon hoang dã */
    rollEncounter(zoneId) {
      if (this.debug.noEncounter || !P1.state.party.some(m => m.hp > 0)) return false;
      const Z = this.map.zones.tables[zoneId];
      if (!Z) return false;
      const rate = this.debug.encounterRate != null ? this.debug.encounterRate : ENCOUNTER_RATE[Z.rate || this.map.settings.encounterRate] || ENCOUNTER_RATE.normal;
      if (Math.random() >= rate) return false;
      const list = Z[this.period] || Z.day || [];
      if (!list.length) return false;
      let pick = list[0];
      if (this.debug.forceSpecies) pick = list.find(e => e.dex === this.debug.forceSpecies) || pick;
      else {
        let r = Math.random() * list.reduce((s, e) => s + e.w, 0);
        for (const e of list) { r -= e.w; if (r <= 0) { pick = e; break; } }
      }
      const level = pick.min + Math.floor(Math.random() * (pick.max - pick.min + 1));
      const foe = P1.mon.create(pick.dex, level, {});
      const stats = P1.state.stats = P1.state.stats || {};
      stats.encounters = (stats.encounters || 0) + 1;
      this.wildBattle(foe);
      return true;
    },

    async wildBattle(foe) {
      this.mode = 'battle';
      const out = await this.goBattle({ kind: 'wild', foe: [foe], where: this.map.name });
      const r = await this.afterBattle(out, { canLose: false });
      if (r !== 'lose') this.mode = 'explore';
    },

    /* Vào cảnh trận, giữ nguyên bản đồ đã dựng; onEnd đưa về world ({ resume: true }). */
    goBattle(args) {
      this.saveState();
      this.levelsBefore = new Map(P1.state.party.map(m => [m.uid, m.level]));
      return new Promise(res => {
        const onEnd = out => {
          this.onResume = () => res(out || { outcome: 'win' });
          P1.scene.go('world', { resume: true });
        };
        try {
          P1.scene.go('battle', Object.assign({ onEnd, bg: this.map.settings.bg }, args));
        } catch (e) {
          console.warn('battle scene missing, battle skipped: ' + e.message);
          res({ outcome: 'win' });
        }
      });
    },

    async afterBattle(out, opt) {
      const outcome = out && out.outcome;
      // Tiến hoá: chỉ con đã lên cấp trong trận này (so cấp trước/sau trận), như mainline.
      for (const m of P1.state.party) {
        const before = this.levelsBefore && this.levelsBefore.get(m.uid);
        const into = before != null && m.level > before && outcome !== 'lose' ? P1.mon.evolution(m) : 0;
        if (into && P1.ui && P1.ui.evolve) await P1.ui.evolve(m, into);
      }
      this.refreshFollower();
      this.refreshHud();
      if (outcome === 'lose' && !opt.canLose) { await this.blackout(); return 'lose'; }
      if (outcome === 'lose' && opt.canLose) for (const m of P1.state.party) P1.mon.heal(m);
      return outcome;
    },

    /* [MAINLINE DEFAULT, not PokéOne-confirmed] thua cả đội: mất nửa tiền, về chỗ hồi máu gần nhất, hồi đầy. */
    async blackout() {
      this.mode = 'script';
      const lost = Math.floor(P1.state.money / 2);
      P1.state.money -= lost;
      await this.say(P1.script.fill('{player} is out of usable Pokémon!\n{player} dropped [PD]' + lost + ' in panic and blacked out!'), '');
      for (const m of P1.state.party) P1.mon.heal(m);
      const h = P1.state.lastHeal || { map: 'pallet_house_1f', x: 6, z: 4 };
      await this.warp(h.map, h.x, h.z, 'down', { kind: 'blackout' });
      this.refreshHud();
      this.mode = 'explore';
    },

    async trainerBattle(o) {
      this.mode = 'battle';
      const foe = o.team.map(t => P1.mon.create(t.dex, t.level, { ot: o.name }));
      const out = await this.goBattle({ kind: 'trainer', name: o.name, foe, music: o.music, money: o.money, where: this.map.name, canLose: o.canLose });
      const outcome = out && out.outcome;
      if (outcome === 'win' && o.actor) P1.state.flags['beat_' + o.actor.id] = 1;
      if (outcome === 'win' && o.exp) P1.state.trainerExp = (P1.state.trainerExp || 0) + o.exp;
      const r = await this.afterBattle(out, { canLose: o.canLose });
      this.mode = 'script';
      this.playMapMusic();
      return r === 'lose' ? 'lose' : outcome;
    },

    /* ------------------------------------------------ trainer nhìn thấy */
    async checkSight() {
      const p = this.player;
      for (const a of this.actors) {
        const tr = a.data && a.data.trainer;
        if (!tr || a.hidden || !a.data.los || P1.state.flags['beat_' + a.id]) continue;
        const [dx, dy] = DIR[a.face];
        let hit = 0;
        for (let k = 1; k <= a.data.los; k++) {
          const x = a.x + dx * k, y = a.y + dy * k;
          if (x === p.x && y === p.y) { hit = k; break; }
          if (this.blocked(this.map, x, y) || this.actorAt(x, y)) break;
        }
        if (!hit) continue;
        await this.spotted(a, hit);
        return true;
      }
      return false;
    },

    async spotted(a, dist) {
      this.mode = 'script';
      const tr = a.data.trainer;
      if (tr.spotted) P1.audio.music(tr.spotted);
      await this.emote(a, '1');
      for (let k = 1; k < dist; k++) await a.step(a.face);
      this.player.face = OPP[a.face];
      await this.runScript(a.data.script, a);
    },

    /* ------------------------------------------------ nói chuyện */
    async interact() {
      const p = this.player;
      let x = p.x + DIR[p.face][0], y = p.y + DIR[p.face][1];
      // Quầy PRO dày 2 ô (Trung tâm, Mart): nói chuyện xuyên qua mọi ô quầy liền nhau.
      for (let k = 0; k < 3 && this.collider(x, y) === COLL.counter; k++) { x += DIR[p.face][0]; y += DIR[p.face][1]; }
      const a = this.actorAt(x, y);
      if (!a) return;
      if (a.kind === 'item') { await this.pickItem(a); return; }
      if (a.kind !== 'sign' && a.data.look !== 'fixed') a.face = OPP[p.face];
      if (a.data.trainer && !P1.state.flags['beat_' + a.id] && a.data.trainer.spotted) P1.audio.music(a.data.trainer.spotted);
      if (a.data.script) await this.runScript(a.data.script, a);
    },

    async pickItem(a) {
      this.mode = 'script';
      P1.state.flags[this.itemFlag(a.data)] = 1;
      this.refreshActors();
      await P1.script.OPS.give({ item: a.data.item, n: a.data.n || 1 }, { actor: a }, this);
      this.mode = 'explore';
    },

    async runScript(name, actor) {
      this.mode = 'script';
      try { await P1.script.run(name, { world: this, actor }); }
      catch (e) { console.error(e); }
      if (this.mode === 'script') this.mode = 'explore';
      this.playMapMusic();
      this.refreshHud();
      this.saveState();
    },

    /* ------------------------------------------------ cửa nối */
    async useLink(L) {
      if (this.mode === 'warp') return;
      // Khoá ngay: phím còn giữ trong lúc màn đen sẽ gọi lại useLink ở khung sau (hai lần tải map chồng nhau).
      const prevMode = this.mode;
      this.mode = 'warp';
      const cur = this.map;
      const sfx = L.sfx || (L.kind === 'door' ? (cur.settings.indoors ? 'exit_door' : 'entering_door') : '');
      if (sfx) P1.audio.sfx(sfx);
      await this.warp(L.to, L.tx, L.ty, L.face, L, prevMode);
    },

    async warp(mapId, x, y, face, L, fromMode) {
      const prevMode = fromMode || this.mode;
      this.mode = 'warp';
      const ui = P1.worldUi, before = this.map;
      const quick = L && L.kind === 'edge';
      await ui.fade.to(1, quick ? 160 : 250);
      await this.loadMap(mapId, x, y, typeof face === 'number' ? face : DIR_OF[face] != null ? DIR_OF[face] : 2);
      this.autosave();
      await ui.fade.to(0, quick ? 160 : 250);
      this.mode = prevMode === 'script' || prevMode === 'battle' ? 'script' : 'explore';
      await this.afterArrive(!before || before.name !== this.map.name);
    },

    async afterArrive(newArea) {
      if (this.mode === 'loading') this.mode = 'explore';
      this.playMapMusic();
      if (newArea) P1.worldUi.area.show(this.map.settings.mapName || this.map.name);
      this.refreshHud();
      // Không chờ kịch bản vào map: scene.go('world') phải xong ngay để main.js gỡ màn "Đang tải".
      if (this.map.settings.enter && this.mode === 'explore') this.runScript(this.map.settings.enter, null);
    },

    playMapMusic() { if (this.map && this.map.settings.song) P1.audio.music(this.map.settings.song); },

    saveState() {
      if (!this.player || !this.map) return;
      const st = P1.state;
      st.map = this.map.id; st.x = this.player.x; st.z = this.player.y; st.face = this.player.face;
    },
    // Tự lưu mỗi lần đổi map để Continue ở màn đầu có chỗ về.
    autosave() { this.saveState(); if (P1.save && !(P1.query && P1.query.get('nosave') === '1')) P1.save(); },

    refreshHud() { if (this.hud && this.hud.refresh) this.hud.refresh(); else if (P1.ui && P1.ui.refresh) P1.ui.refresh(); },

    /* ------------------------------------------------ các việc kịch bản gọi */
    say(text, name) {
      if (P1.dialog && P1.dialog.say) return P1.dialog.say(text, { name });
      return P1.worldUi.fallback.say(text, { name });
    },
    choose(text, options, name) {
      if (P1.dialog && P1.dialog.choose) return P1.dialog.choose(name ? name + ': ' + text : text, options);
      return P1.worldUi.fallback.choose(text, options);
    },
    async heal() {
      if (P1.ui && P1.ui.heal) await P1.ui.heal();
      else { for (const m of P1.state.party) P1.mon.heal(m); P1.audio.sfx('heal_pokemon'); }
      this.refreshFollower();
      this.refreshHud();
    },
    async shop(items) {
      if (P1.ui && P1.ui.shop) await P1.ui.shop(items);
      else console.warn('shop UI missing');
      this.refreshHud();
    },
    /* Chỗ về khi thua cả đội: ô người chơi đang đứng (kịch bản Nurse Joy, Mẹ gọi 'lastheal'). */
    setLastHeal() { P1.state.lastHeal = { map: this.map.id, x: this.player.x, z: this.player.y }; },
    async openPc() { if (P1.ui && P1.ui.open) await P1.ui.open('pokebox'); },
    showMon(dex) { P1.worldUi.showMon(dex); },
    faceActor(a, dir) {
      if (dir === 'player') {
        const dx = this.player.x - a.x, dy = this.player.y - a.y;
        a.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 2 : 0);
      } else a.face = DIR_OF[dir] != null ? DIR_OF[dir] : a.face;
    },
    async moveActor(a, steps) {
      for (const [d, n] of steps) for (let i = 0; i < n; i++) await a.step(DIR_OF[d]);
      if (a === this.player) { P1.state.x = a.x; P1.state.z = a.y; }
    },
    async emote(a, key) {
      if (!a) return;
      const e = { actor: a, t0: performance.now(), text: key === '?' || key === '2' ? '?' : '!' };
      this.emotes.push(e);
      await sleep((EMOTE_POP + EMOTE_HOLD) * 1000);
      this.emotes = this.emotes.filter(x => x !== e);
    },

    /* nhiệm vụ: P1.QUESTS, thưởng EXP huấn luyện viên + tiền + vật phẩm theo wiki */
    quests: {
      async start(id) {
        const q = P1.QUESTS[id], f = P1.state.flags;
        if (!q || f['quest_done_' + id]) return;
        P1.state.quest = id;
        if (f['quest_seen_' + id]) return;
        f['quest_seen_' + id] = 1;
        P1.audio.sfx('quest_update_1');
        if (P1.ui && P1.ui.toast) P1.ui.toast('Nhiệm vụ mới: ' + q.name);
        else P1.worldUi.toast.show('Nhiệm vụ mới', q.name);
      },
      async complete(id) {
        const q = P1.QUESTS[id], st = P1.state;
        if (!q || st.flags['quest_done_' + id]) return;
        st.flags['quest_done_' + id] = 1;
        st.trainerExp = (st.trainerExp || 0) + q.exp;
        st.money += q.money;
        for (const it of q.items) st.bag[it.id] = (st.bag[it.id] || 0) + it.n;
        P1.audio.sfx('quest_complete');
        const rew = P1.worldUi.quests.rewards(q).join(', ');
        await world.say('Hoàn thành nhiệm vụ: ' + q.name + '\nPhần thưởng: ' + rew, '');
        if (st.quest === id && q.next) await world.quests.start(q.next);
        world.refreshHud();
      },
    },
  };

  P1.world = world;
  P1.scene.add('world', world);
})(window.P1 = window.P1 || {});
