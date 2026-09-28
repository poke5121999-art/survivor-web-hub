/*
 * Cảnh trận 2D kiểu PRO (Pokémon Revolution Online): P1.scene.add('battle', …).
 *
 *   engine (P1.Battle) ──sự kiện──▶ DIRECTOR[lệnh] (diễn: sprite, hoạt ảnh PRO, hộp máu, log, tiếng)
 *        ▲                                   │
 *        └──── hành động ◀── mode ◀──────────┘ (khung phải: chiêu / Pokémon / túi / chạy)
 *
 * Bố cục theo cây GUI của PRO (D:\pro-ref\ref\gamegui.txt, BattlePanelMain): khung battle_window_bg
 * 798×471, sân 570×400 ở (12,53), cột nút 200 px bên phải. Toạ độ trong tệp này là toạ độ khung đó
 * (gốc trên-trái, y xuống); gamegui (gốc giữa màn 1366×768, y lên) đổi sang bằng (x+367, 235.5−y).
 * Canvas #view vẽ sân, sprite, hộp máu; DOM trong #ui vẽ nút và log. Cả hai dùng chung một phép co giãn.
 *
 * Tài sản: art/pro/bg (nền battlebgnew), art/pro/poke/{front,back,icon}, atlas UI (P1.proui),
 * hoạt ảnh chiêu và bóng từ tools/pro/rip_battle.py (data/pro-anim.js).
 */
(function (P1) {
  'use strict';

  /* ================================================================ bố cục */

  const WIN = { x: 0, y: 0, w: 798, h: 471 };
  const COMPACT = { x: 4, y: 49, w: 790, h: 408 };          // bỏ thanh tiêu đề và viền dưới (điện thoại nằm ngang)
  const SCENE = { x: 12, y: 53, w: 570, h: 400 };
  const SCENE_C = { x: SCENE.x + SCENE.w / 2, y: SCENE.y + SCENE.h / 2 };
  // Chân sprite đứng trên bóng đổ của nền (shadow_foe (131,27), shadow_party (-151,-171) trong gamegui).
  // Ô sân → chân sprite (x, y) và tỉ lệ s. Trận thường 1 ô mỗi phe; trận boss chung theo số người (1–3), phe boss là
  // đội huấn luyện viên ra sân đủ số ô.
  // Đánh ba: ô a của phe mình ở TRÁI, của phe boss ở PHẢI (hai phe đối mặt: p1a kề p2b/p2c [đo bằng sim]).
  const LAYOUT = {
    1: { p1a: { x: 215, y: 414, s: 2 }, p2a: { x: 497, y: 216, s: 2 } },
    2: { p1a: { x: 146, y: 430, s: 1.6 }, p1b: { x: 322, y: 414, s: 1.6 },
      p2a: { x: 490, y: 222, s: 1.8 }, p2b: { x: 372, y: 200, s: 1.6 } },
    3: { p1a: { x: 104, y: 432, s: 1.4 }, p1b: { x: 240, y: 418, s: 1.4 }, p1c: { x: 376, y: 432, s: 1.4 },
      p2a: { x: 548, y: 176, s: 1.45 }, p2b: { x: 446, y: 194, s: 1.55 }, p2c: { x: 344, y: 170, s: 1.45 } },
  };
  const SHADOW = { p2: { url: 'art/pro/bg/shadow_foe.png', dy: -7.5 }, p1: { url: 'art/pro/bg/shadow_party.png', dy: -7.5 } };
  // Hộp máu: FoeStats/HpUi (-264,144) BattleLeft_bar_BG, UserStats/HpUi (125,-103) Battle_bar_BG, 157×42.
  const BOX = { p2: { x: 25, y: 71, bg: 'BattleLeft_bar_BG', fill: 4 }, p1: { x: 414, y: 318, bg: 'Battle_bar_BG', fill: 2 } };
  // Trận boss chung: hộp phe boss xếp chồng góc trên trái, hộp đồng đội xếp chồng bên phải.
  function boxAt(pos, n) {
    const side = pos.slice(0, 2), i = 'abc'.indexOf(pos[2]);
    if (n == null) return BOX[side];
    if (side === 'p1') return Object.assign({}, BOX.p1, { y: BOX.p1.y - (n - 1 - i) * (n === 3 ? 54 : 58) });
    return Object.assign({}, BOX.p2, { y: BOX.p2.y + i * 48 });
  }
  const LOG = { lines: 3 };

  const TYPE_COLOUR = { Normal: '#d8d8c0', Fire: '#ff7a2a', Water: '#4a9dff', Electric: '#ffd83a', Grass: '#5ad05a', Ice: '#9ef0ff',
    Fighting: '#e0503a', Poison: '#c060e0', Ground: '#e0c068', Flying: '#b0a0ff', Psychic: '#ff5a9a', Bug: '#b0cc30',
    Rock: '#c8aa48', Ghost: '#8a6ac0', Dragon: '#8a5aff', Dark: '#8a7060', Steel: '#c8c8e0', Fairy: '#ffa0e0' };
  const STATUS_BADGE = { brn: 'BURN', frz: 'FREEZE', psn: 'POISON', tox: 'BPOISON', slp: 'SLEEP', par: 'PARALIZE' };
  const STATUS_COLOUR = { brn: '#ff7a2a', frz: '#9ef0ff', psn: '#c060e0', tox: '#c060e0', slp: '#c8c8e0', par: '#ffd83a' };
  const SELF_TARGET = new Set(['self', 'allySide', 'adjacentAllyOrSelf', 'allies', 'ally']);
  const MUSIC = { wild: 'battle_wild', trainer: 'trainer_battle', gym: 'battle_gym_kanto', boss: 'battle_gym' };
  const BAG_ALIAS = { pokball: 'pokeball' };      // items.txt ghi BattleID của Poké Ball là "pokball"
  const NAME_COLOUR = 'ff6600';
  const Y = (s) => '[ffff00]' + s + '[-]';
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (k) => k * k * (3 - 2 * k);

  // Tiếng: PRO (P1.PRO.sfx['battle.<slug>'] → audio/pro/battle, tools/pro/rip_pro.py) nếu đã bóc, không thì bộ tiếng cũ P1.SFX.
  const SND = {
    damage: ['damagenormal', 'attack_hit_damage'], super: ['damagesupereffective', 'attack_hit_super_effective'],
    weak: ['damagenoteffective', 'attack_hit_weak_not_very_effective'], hit: ['hit', null],
    throw: ['pokeballthrow', null], open: ['pokeballopen', null], drop: ['pokeballdrop', 'balldrop'],
    shake: ['pokeballshake', 'ballshake'], break: ['pokeballbreak', null], caught: ['pokemoncaught', 'recieve_pokemon'],
    run: ['runaway', 'flee'], up: ['statincrease', 'stat_up'], down: ['statdecrease', 'stat_down'],
    level: ['levelup', 'level_up'], shiny: ['shiny encounter', 'gen_4_shiny_edit2'], faint: [null, 'faint_no_health_left'],
    heal: [null, 'attack_heal_refresh'], item: [null, 'item'], expFull: ['exp_bar_full', null], click: [null, 'notify'],
  };
  function sfx(key, opt) {
    const [pro, old] = SND[key] || [];
    const map = P1.PRO && P1.PRO.sfx;
    const url = pro && map && map['battle.' + pro.replace(/[^a-z0-9]+/g, '_')];
    // P1.audio chỉ phát theo khoá P1.SFX: gắn thêm khoá 'pro:<tên>' để đi chung đường âm lượng/AudioContext.
    if (url && P1.SFX) { P1.SFX['pro:' + pro] = url; return P1.audio.sfx('pro:' + pro, opt); }
    if (old) return P1.audio.sfx(old, opt);
    return null;
  }

  /* ================================================================ đồng hồ trận (mọi chờ/tween đi theo khung hình) */

  function makeClock() {
    const c = { t: 0, waits: [], tweens: [] };
    c.wait = (s) => new Promise((res) => c.waits.push({ at: c.t + Math.max(0, s), res }));
    c.tween = (dur, fn) => new Promise((res) => { fn(0); c.tweens.push({ t0: c.t, dur: Math.max(1e-3, dur), fn, res }); });
    c.tick = (dt) => {
      c.t += dt;
      for (let i = c.tweens.length - 1; i >= 0; i--) {
        const w = c.tweens[i], k = Math.min(1, (c.t - w.t0) / w.dur);
        w.fn(k);
        if (k >= 1) { c.tweens.splice(i, 1); w.res(); }
      }
      for (let i = c.waits.length - 1; i >= 0; i--) if (c.t >= c.waits[i].at) { c.waits[i].res(); c.waits.splice(i, 1); }
    };
    return c;
  }

  /* ================================================================ vẽ: atlas UI, bóng trắng/tô màu, khung bao ảnh */

  function atlasSprite(ctx, name, x, y, w, h) {
    const A = P1.imgNow(P1.PRO_UI.img), r = P1.PRO_UI.s[name];
    if (!A || !r) return;
    const [sx, sy, sw, sh, bl, br, bt, bb] = r;
    w = w == null ? sw : w; h = h == null ? sh : h;
    if (!(bl || br || bt || bb) || (w === sw && h === sh)) { ctx.drawImage(A, sx, sy, sw, sh, x, y, w, h); return; }
    const xs = [0, bl, sw - br, sw], ys = [0, bt, sh - bb, sh], dx = [0, bl, w - br, w], dy = [0, bt, h - bb, h];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const cw = xs[i + 1] - xs[i], ch = ys[j + 1] - ys[j], dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j];
      if (cw > 0 && ch > 0 && dw > 0 && dh > 0) ctx.drawImage(A, sx + xs[i], sy + ys[j], cw, ch, x + dx[i], y + dy[j], dw, dh);
    }
  }

  const tintCache = new Map();
  function tinted(img, colour) {
    const key = img.src + '|' + colour;
    let c = tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
      tintCache.set(key, c);
    }
    return c;
  }

  // Khung bao phần có màu của ảnh sprite 128² (để đặt hoạt ảnh/bóng vào giữa thân chứ không giữa ô).
  const boxCache = new Map();
  function contentBox(img) {
    let b = boxCache.get(img.src);
    if (b) return b;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    b = x1 >= x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: c.width, y1: c.height };
    boxCache.set(img.src, b);
    return b;
  }

  function shadowText(ctx, text, x, y, colour) {
    ctx.fillStyle = 'rgba(0,0,0,.85)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = colour || '#fff';
    ctx.fillText(text, x, y);
  }

  /* ================================================================ đường dẫn tài sản */

  function monUrl(mon, face) {
    const miss = (P1.PRO && P1.PRO.shinyMissing) || [];
    const s = mon.shiny && !miss.includes(mon.dex) ? 's' : '';
    return 'art/pro/poke/' + face + '/' + mon.dex + s + '.png';
  }
  const iconUrl = (mon) => 'art/pro/poke/icon/' + mon.dex + '.png';

  /* Họ nền PRO ('land', 'forest', 'cave 1'…) + giờ trong ngày → tệp battlebgnew. */
  function bgUrl(family) {
    const all = (P1.PRO && P1.PRO.bg) || {};
    const fam = String(family || 'land').replace(/ /g, '_');
    const list = all[fam] || all.land || [];
    const want = { morning: 'day', day: 'day', evening: 'afternoon', night: 'night' }[P1.period ? P1.period() : 'day'] || 'day';
    const pick = list.find((n) => n.endsWith('_' + want)) ||
      (want === 'afternoon' && list.find((n) => n.endsWith('_evening'))) ||
      list.find((n) => n.endsWith('_day')) || list[0] || 'land_day';
    return 'art/pro/bg/' + pick + '.png';
  }

  /* ================================================================ hoạt ảnh chiêu (data/pro-anim.js) */

  const ANIM = () => P1.PRO_ANIM || { moves: {}, status: {}, weather: {}, balls: {}, typeFallback: {} };
  /* Biến thể theo phía hoạt ảnh diễn ra: 'foe' (bên địch), 'user' (bên mình), 'target' (đặt lên ai cũng được). */
  function pickVariant(list, side) {
    if (!list) return null;
    const want = side === 'p1' ? 'user' : 'foe';
    return list.find((a) => a.on === want) || list.find((a) => a.on === 'target') ||
      list.find((a) => a.place === 'target') || null;
  }
  function moveAnim(mv, side) {
    const A = ANIM();
    const own = pickVariant(A.moves[mv.id], side);
    if (own) return own;
    if (mv.category === 'Status') return null;
    const fb = A.typeFallback[mv.type.toLowerCase()];
    if (mv.category === 'Special' && fb) return pickVariant(A.moves[fb], side);
    if (mv.category === 'Physical') return pickVariant(A.moves[mv.flags && mv.flags.punch ? 'megapunch' : mv.flags && mv.flags.bite ? 'bite' : 'tackle'], side);
    return null;
  }

  /* ================================================================ sân: Pokémon và hiệu ứng */

  class Actor {
    constructor(pos, home) {
      this.pos = pos; this.side = pos.slice(0, 2); this.home = home; this.base = home.s; this.mon = null; this.url = null;
      this.phase = (this.side === 'p1' ? 0 : 1.7) + 'abc'.indexOf(pos[2]) * 1.1;
      this.reset();
    }
    reset() {
      this.dx = 0; this.dy = 0; this.scale = 1; this.alpha = 1; this.white = 0; this.tint = null; this.tintA = 0;
      this.sink = 0; this.hidden = false; this.blink = false; this.bob = true;
    }
    set(mon) { this.mon = mon; this.url = mon ? monUrl(mon, this.side === 'p1' ? 'back' : 'front') : null; this.reset(); }
    get img() { return this.url ? P1.imgNow(this.url) : null; }
    /* Tâm thân trong toạ độ khung (nơi đặt hoạt ảnh, nơi bóng bay tới). */
    center() {
      const img = this.img, S = this.base;
      if (!img) return { x: this.home.x, y: this.home.y - 30 * S, h: 60 * S };
      const b = contentBox(img);
      const x = this.home.x - img.width * S / 2 + (b.x0 + b.x1) / 2 * S;
      const y = this.home.y - img.height * S + (b.y0 + b.y1) / 2 * S;
      return { x: x + this.dx, y: y + this.dy, h: (b.y1 - b.y0) * S };
    }
    draw(ctx, t) {
      const img = this.img;
      if (!img || this.hidden || this.blink || this.alpha <= 0.01 || this.scale <= 0.01) return;
      const S = this.base * this.scale, w = img.width * S, h = img.height * S;
      const bob = this.bob ? Math.round(Math.sin(t * 2.6 + this.phase) * 1.5) : 0;
      const x = Math.round(this.home.x + this.dx - w / 2), y = Math.round(this.home.y + this.dy - h + bob);
      ctx.save();
      if (this.sink > 0) { ctx.beginPath(); ctx.rect(x - 20, y - 200, w + 40, this.home.y + 4 - (y - 200)); ctx.clip(); }
      ctx.globalAlpha = this.alpha;
      ctx.drawImage(img, x, y + this.sink, w, h);
      if (this.tint && this.tintA > 0) { ctx.globalAlpha = this.alpha * this.tintA; ctx.drawImage(tinted(img, this.tint), x, y + this.sink, w, h); }
      if (this.white > 0) { ctx.globalAlpha = this.alpha * this.white; ctx.drawImage(tinted(img, '#ffffff'), x, y + this.sink, w, h); }
      ctx.restore();
    }
  }

  /* Hoạt ảnh dải khung của PRO: 'scene' phủ cả sân, 'target' đặt lên thân Pokémon. */
  class SheetFx {
    constructor(anim, at) {
      this.a = anim; this.at = at; this.t = 0;
      this.dur = anim.frames / (anim.fps || 12);
    }
    update(dt) { this.t += dt; return this.t < this.dur; }
    draw(ctx) {
      const a = this.a, img = P1.imgNow(a.img);
      if (!img) return;
      const k = Math.min(a.frames - 1, Math.floor(this.t * (a.fps || 12)));
      const sx = (k % a.cols) * a.fw, sy = Math.floor(k / a.cols) * a.fh;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, sx, sy, a.fw, a.fh, this.at.x - a.w / 2, this.at.y - a.h / 2, a.w, a.h);
      ctx.restore();
    }
  }

  /* Hạt màu theo hệ, cho chiêu PRO không có hoạt ảnh: cầu bay (orb), nổ (burst), lấp lánh (sparkle), mũi tên chỉ số (rise). */
  class Particles {
    constructor(colour) { this.colour = colour; this.ps = []; this.t = 0; this.orb = null; }
    burst(x, y, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = speed * (0.5 + Math.random() * 0.7);
        this.ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 3 + Math.random() * 4, life: 0.45 + Math.random() * 0.25, age: 0 });
      }
      this.ps.push({ x, y, vx: 0, vy: 0, r: 8, ring: 46, life: 0.35, age: 0 });
      return this;
    }
    sparkle(x, y, h, n) {
      for (let i = 0; i < n; i++) {
        this.ps.push({ x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.3) * h * 0.8, vx: 0, vy: -20 - Math.random() * 30,
          r: 2 + Math.random() * 3, life: 0.5 + Math.random() * 0.4, age: -Math.random() * 0.4, star: true });
      }
      return this;
    }
    rise(x, y, dir, n) {
      for (let i = 0; i < n; i++) {
        this.ps.push({ x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 60, vx: 0, vy: -dir * (70 + Math.random() * 40),
          r: 5, life: 0.6, age: -Math.random() * 0.35, arrow: dir });
      }
      return this;
    }
    fly(from, to, dur) { this.orb = { from, to, dur, t: 0 }; return this; }
    update(dt) {
      this.t += dt;
      if (this.orb) {
        this.orb.t += dt;
        if (this.orb.t >= this.orb.dur) { const o = this.orb; this.orb = null; this.burst(o.to.x, o.to.y, 12, 150); }
      }
      for (const p of this.ps) { p.age += dt; if (p.age > 0) { p.x += p.vx * dt; p.y += p.vy * dt; } }
      this.ps = this.ps.filter((p) => p.age < p.life);
      return !!(this.orb || this.ps.length);
    }
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.orb) {
        const o = this.orb, k = ease(Math.min(1, o.t / o.dur));
        const x = o.from.x + (o.to.x - o.from.x) * k, y = o.from.y + (o.to.y - o.from.y) * k - Math.sin(k * Math.PI) * 30;
        glow(ctx, x, y, 14, this.colour, 1);
      }
      for (const p of this.ps) {
        if (p.age < 0) continue;
        const f = 1 - p.age / p.life;
        if (p.ring) {
          ctx.globalAlpha = f; ctx.strokeStyle = this.colour; ctx.lineWidth = 4 * f;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.ring * (1 - f) + 6, 0, Math.PI * 2); ctx.stroke();
        } else if (p.arrow) {
          ctx.globalAlpha = f; ctx.fillStyle = this.colour;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - 7 * p.arrow); ctx.lineTo(p.x - 6, p.y + 2 * p.arrow); ctx.lineTo(p.x + 6, p.y + 2 * p.arrow); ctx.fill();
        } else glow(ctx, p.x, p.y, p.r * (p.star ? f + 0.4 : 1), this.colour, f);
      }
      ctx.restore();
    }
  }
  function glow(ctx, x, y, r, colour, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
    g.addColorStop(0.35, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
  }

  /* Bóng ném (pokeballs/{closed,open,hand} của PRO); vẽ gấp 1.5 lần. */
  class Ball {
    constructor(key) {
      const all = ANIM().balls || {};
      this.art = all[key] || all.pokeball || null;
      this.x = 0; this.y = 0; this.rot = 0; this.open = false; this.alpha = 1; this.dark = 0; this.hand = null;
    }
    update() { return this.alpha > 0; }
    draw(ctx) {
      if (!this.art) return;
      ctx.save();
      if (this.hand) {
        const h = P1.imgNow(this.art.hand);
        if (h) { ctx.globalAlpha = this.hand.a; ctx.drawImage(h, this.hand.x, this.hand.y, h.width * 1.5, h.height * 1.5); }
      }
      if (this.alpha > 0 && !this.inHand) {
        const img = P1.imgNow(this.open ? this.art.open : this.art.closed);
        if (img) {
          const w = img.width * 1.5, h = img.height * 1.5;
          ctx.globalAlpha = this.alpha;
          ctx.translate(this.x, this.y); ctx.rotate(this.rot);
          // Ảnh "open" cao hơn: nắp mở phía trên, đáy trùng đáy bóng đóng.
          const dy = this.open ? -h + 21 : -h / 2;
          ctx.drawImage(img, -w / 2, dy, w, h);
          if (this.dark > 0) { ctx.globalAlpha = this.alpha * this.dark; ctx.drawImage(tinted(img, '#000000'), -w / 2, dy, w, h); }
        }
      }
      ctx.restore();
    }
  }

  /* ================================================================ DOM: khung nút và log */

  const CSS = `
.pb-root { position: absolute; left: 0; top: 0; width: 798px; height: 471px; transform-origin: 0 0; pointer-events: none;
  font-family: var(--p1-font, 'Segoe UI', Verdana, Arial, sans-serif); color: #fff; z-index: 5; }
.pb-root * { box-sizing: border-box; }
.pb-log { position: absolute; left: 18px; top: 392px; width: 558px; height: 56px; padding: 3px 10px; font-size: 13px;
  line-height: 16.5px; text-shadow: 1px 1px 0 #000; display: flex; flex-direction: column; justify-content: flex-end;
  overflow: hidden; pointer-events: none; transition: opacity .3s; }
.pb-log div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pb-btn { position: absolute; cursor: pointer; user-select: none; pointer-events: auto; }
.pb-btn.off { cursor: default; }
.pb-move { left: 589px; width: 196px; height: 46px; }
.pb-move .n { position: absolute; left: 9px; top: 4px; font-size: 14px; font-weight: 700; text-shadow: 1px 1px 0 #000; white-space: nowrap; }
.pb-move .cat { position: absolute; left: 8px; top: 27px; }
.pb-move .typ { position: absolute; left: 40px; top: 27px; }
.pb-move .pp { position: absolute; right: 9px; top: 25px; font-size: 12px; font-weight: 700; color: #dfe9f2; text-shadow: 1px 1px 0 #000; }
.pb-move.off { filter: grayscale(1) brightness(.55); }
.pb-icon { width: 86px; height: 66px; display: flex; align-items: center; justify-content: center; }
.pb-icon > i { display: block; image-rendering: auto; }
.pb-icon > b { position: absolute; left: 0; right: 0; bottom: 1px; text-align: center; font-size: 12px; font-weight: 700;
  text-shadow: 1px 1px 0 #000, -1px 0 0 #000, 0 -1px 0 #000; }
.pb-icon.off { filter: grayscale(1) brightness(.45); }
.pb-icon.sel > i { filter: drop-shadow(0 0 4px #7fd3ff) brightness(1.25); }
.pb-icon:not(.off):hover > i { filter: brightness(1.2); }
.pb-mon { width: 57px; height: 57px; display: flex; align-items: center; justify-content: center; }
.pb-mon img { width: 48px; height: 48px; image-rendering: pixelated; pointer-events: none; }
.pb-mon .hp { position: absolute; left: 4px; bottom: -8px; width: 49px; height: 5px; background: #1a1a1a; border: 1px solid #000; }
.pb-mon .hp > i { position: absolute; left: 0; top: 0; bottom: 0; background: #3ad13a; }
.pb-mon .hp > i.mid { background: #ffd23c; } .pb-mon .hp > i.low { background: #ff3a2a; }
.pb-mon .lv { position: absolute; right: -2px; top: -4px; font-size: 11px; font-weight: 700; text-shadow: 1px 1px 0 #000; }
.pb-mon.cur { filter: drop-shadow(0 0 5px #7fd3ff); }
.pb-mon.off { filter: grayscale(1) brightness(.5); }
.pb-tab { top: 57px; width: 96px; height: 24px; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; text-shadow: 1px 1px 0 #000; }
.pb-tab:not(.sel) { filter: brightness(.6); }
.pb-items { position: absolute; left: 589px; top: 84px; width: 196px; height: 192px; overflow-y: auto; pointer-events: auto; }
.pb-item { position: relative; display: block; width: 190px; height: 30px; margin-bottom: 2px; cursor: pointer; }
.pb-item img { position: absolute; left: 4px; top: 3px; width: 24px; height: 24px; image-rendering: pixelated; }
.pb-item .n { position: absolute; left: 32px; top: 6px; font-size: 12px; font-weight: 700; text-shadow: 1px 1px 0 #000; white-space: nowrap; }
.pb-item .q { position: absolute; right: 8px; top: 6px; font-size: 12px; color: #ffd23c; text-shadow: 1px 1px 0 #000; }
.pb-empty { position: absolute; left: 589px; top: 110px; width: 196px; text-align: center; font-size: 12px; color: #aab; }
.pb-prompt { position: absolute; left: 590px; top: 280px; width: 196px; text-align: center; font-size: 12px; line-height: 15px;
  color: #ffd23c; text-shadow: 1px 1px 0 #000; pointer-events: none; }
.pb-timer { position: absolute; left: 590px; top: 311px; width: 196px; text-align: center; font-size: 12px; font-weight: 700;
  color: #dfe9f2; text-shadow: 1px 1px 0 #000; pointer-events: none; font-variant-numeric: tabular-nums; }
.pb-timer.low { color: #ff7a6a; }
.pb-target .pp { color: #ffd23c; }
.pb-target.ally .pp { color: #9fd8ff; }
.pb-end { position: absolute; left: 147px; top: 180px; width: 300px; height: 118px; padding: 14px; text-align: center; pointer-events: auto; }
.pb-end .t { font-size: 15px; font-weight: 700; color: #ffd23c; text-shadow: 1px 1px 0 #000; margin-bottom: 14px; }
.pb-end .pb-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 110px; height: 34px; margin: 0 6px;
  font-size: 13px; font-weight: 700; text-shadow: 1px 1px 0 #000; }
`;
  function injectCss() {
    if (document.getElementById('pb-css')) return;
    const s = document.createElement('style');
    s.id = 'pb-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function spr(name, opt) { return P1.proui.el(name, Object.assign({ tag: 'i' }, opt || {})); }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /* Mã màu NGUI "[rrggbb]chữ[-]" → span. */
  function markup(s) {
    return escapeHtml(s).replace(/\[([0-9a-fA-F]{6})\]/g, '<span style="color:#$1">').replace(/\[-\]/g, '</span>');
  }

  /* ================================================================ chữ trong log */

  const STAT_NAME = { atk: 'Công', def: 'Thủ', spa: 'Công ĐB', spd: 'Thủ ĐB', spe: 'Tốc độ', accuracy: 'Chính xác', evasion: 'Né tránh' };
  const STATUS_TEXT = { brn: ' bị bỏng!', psn: ' bị trúng độc!', tox: ' bị trúng độc nặng!', par: ' bị tê liệt! Có thể không ra đòn được!',
    slp: ' ngủ thiếp đi!', frz: ' bị đóng băng!' };
  const CURE_TEXT = { brn: ' hết bỏng.', psn: ' hết độc.', tox: ' hết độc.', par: ' hết tê liệt.', slp: ' tỉnh dậy!', frz: ' tan băng!' };
  const CANT_TEXT = { par: ' bị tê liệt! Không ra đòn được!', slp: ' đang ngủ say!', frz: ' bị đóng băng cứng!',
    flinch: ' chùn bước, không ra đòn được!', recharge: ' phải nghỉ lấy sức!', nopp: ' hết PP!', attract: ' đang mê mẩn!',
    truant: ' đang lười biếng!' };
  const DAMAGE_FROM = { brn: ' bị vết bỏng làm đau!', psn: ' bị độc làm đau!', tox: ' bị độc làm đau!', recoil: ' chịu phản lực!',
    sandstorm: ' bị bão cát quất!', hail: ' bị mưa đá quất!', confusion: ' tự làm mình đau vì rối loạn!',
    'leech seed': ' bị Leech Seed hút máu!', spikes: ' bị gai đâm!', 'stealth rock': ' bị đá nhọn đâm!',
    curse: ' bị lời nguyền hành hạ!', nightmare: ' gặp ác mộng!', 'life orb': ' mất một ít HP!' };
  const WEATHER_TEXT = { RainDance: 'Trời bắt đầu mưa!', SunnyDay: 'Nắng gắt lên!', Sandstorm: 'Bão cát nổi lên!',
    Hail: 'Mưa đá bắt đầu rơi!', none: 'Thời tiết trở lại bình thường.' };
  const BALL_FAIL = ['Ôi không! Pokémon thoát ra rồi!', 'Tiếc quá! Suýt nữa thì được!', 'Aaa! Gần được rồi!', 'Chỉ thiếu chút xíu nữa!'];

  const itemByBattleId = (key) => Object.values(P1.ITEMS || {}).find((x) => (BAG_ALIAS[x.battleId] || x.battleId) === key);
  const itemName = (key) => { const it = itemByBattleId(key); return it ? it.name : key; };
  const nameOf = (m) => '[' + NAME_COLOUR + ']' + P1.mon.name(m) + '[-]';
  const expRatioAt = (dex, lv, exp) => {
    if (lv >= 100) return 1;
    const a = P1.mon.expAt(dex, lv), b = P1.mon.expAt(dex, lv + 1);
    return clamp01((exp - a) / Math.max(1, b - a));
  };
  const expRatio = (m) => expRatioAt(m.dex, m.level, m.exp);

  function parseHp(s) {
    const m = /^(\d+)(?:\/(\d+))?/.exec(s || '');
    return m ? { hp: +m[1], max: m[2] ? +m[2] : null } : { hp: 0, max: null };
  }

  /* ================================================================ cảnh */

  const scene = {
    async enter(args) {
      injectCss();
      this.args = args;
      this.kind = args.kind || 'wild';
      // Trận boss chung (raid.js): P1.CoopBattle do raid.js dựng + cầu nối mạng. Không có thì là trận thường một ô.
      this.coop = args.coop || null;
      this.n = this.coop ? this.coop.battle.n : null;
      this.clock = makeClock();
      this.speed = +(P1.query && P1.query.get('bspeed')) || 1;
      this.prevMusic = P1.audio.musicKey();
      const lay = LAYOUT[this.n || 1];
      this.actors = {};
      for (const pos of Object.keys(lay)) { this.actors[pos] = new Actor(pos, lay[pos]); this.actors[pos].hidden = true; }
      this.box = {};
      this.fx = [];
      this.fainted = { p1: new Set(), p2: new Set() };
      this.logLines = []; this.logAll = [];
      this.fade = 1;
      this.mode = 'busy'; this.pick = null; this.result = null; this.catchPhase = null;
      this.expGained = 0; this.leveled = new Set();
      this.bgUrl = bgUrl(args.bg);
      this.coopStatus = {}; this.statusAt = 0;

      this.battle = this.coop ? this.coop.battle : new P1.Battle({
        me: { name: P1.state.player.name, party: P1.state.party },
        foe: { kind: this.kind, name: args.name || '', party: args.foe, money: args.money },
        ctx: args.ctx,
      });
      const music = args.music || (this.kind === 'trainer' ? (args.gym ? MUSIC.gym : MUSIC.trainer) : MUSIC[this.kind] || MUSIC.wild);
      P1.audio.music(music);

      this.buildDom();
      const urls = [this.bgUrl, SHADOW.p1.url, SHADOW.p2.url, P1.PRO_UI.img];
      const mine = this.coop ? this.battle.roster.map((x) => x.mon) : P1.state.party;
      for (const m of mine) urls.push(monUrl(m, 'back'), iconUrl(m));
      for (const m of args.foe) urls.push(monUrl(m, 'front'));
      const balls = ANIM().balls || {};
      for (const k of Object.keys(P1.state.bag || {})) if (balls[k]) urls.push(balls[k].closed, balls[k].open, balls[k].hand);
      await Promise.all(urls.map((u) => P1.img(u).catch(() => null)));
      this.running = this.run().catch((e) => { console.error(e); });
    },

    exit() {
      this.root.remove();
      if (this.prevMusic) P1.audio.music(this.prevMusic);
    },

    update(dt) {
      dt *= this.speed;
      this.clock.tick(dt);
      this.fx = this.fx.filter((f) => f.update(dt));
      if (this.coop && this.clock.t - this.statusAt > 0.25) { this.statusAt = this.clock.t; this.refreshCoopStatus(); }
      this.keys();
    },

    /* ------------------------------------------------ vẽ */

    layout() {
      const v = P1.view();
      const full = Math.min(v.w / WIN.w, v.h / WIN.h), compact = Math.min(v.w / COMPACT.w, v.h / COMPACT.h);
      const vb = full < 1 && compact > full * 1.08 ? COMPACT : WIN;
      const s = vb === WIN ? full : compact;
      const ox = Math.round((v.w - vb.w * s) / 2 - vb.x * s), oy = Math.round((v.h - vb.h * s) / 2 - vb.y * s);
      const key = s.toFixed(4) + ',' + ox + ',' + oy;
      if (key !== this.layoutKey) {
        this.layoutKey = key;
        this.root.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
      }
      return { v, s, ox, oy, vb };
    },

    render() {
      if (!this.root) return;
      const { v, s, ox, oy } = this.layout();
      const ctx = v.ctx, t = this.clock.t;
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // Nền ngoài khung: chính ảnh nền trận, phủ kín, tối đi.
      ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, v.w, v.h);
      const bg = P1.imgNow(this.bgUrl);
      if (bg) {
        const k = Math.max(v.w / bg.width, v.h / bg.height);
        ctx.globalAlpha = 0.35;
        ctx.drawImage(bg, (v.w - bg.width * k) / 2, (v.h - bg.height * k) / 2, bg.width * k, bg.height * k);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(v.dpr * s, 0, 0, v.dpr * s, v.dpr * ox, v.dpr * oy);
      ctx.imageSmoothingEnabled = false;
      atlasSprite(ctx, 'battle_window_bg', WIN.x, WIN.y, WIN.w, WIN.h);
      this.drawTitle(ctx);

      ctx.save();
      ctx.beginPath(); ctx.rect(SCENE.x, SCENE.y, SCENE.w, SCENE.h); ctx.clip();
      if (bg) ctx.drawImage(bg, SCENE.x, SCENE.y, SCENE.w, SCENE.h);
      else { ctx.fillStyle = '#5a8a4a'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h); }
      // Phe địch trước, phe mình sau; trong một phe con ở xa (y nhỏ) vẽ trước.
      const order = Object.values(this.actors).sort((a, b) => (a.side === b.side ? a.home.y - b.home.y : a.side === 'p2' ? -1 : 1));
      for (const a of order) {
        const sh = SHADOW[a.side], img = P1.imgNow(sh.url);
        if (img && a.mon && !a.hidden && a.sink < 40) {
          const k = a.base / 2, w = img.width * k, h = img.height * k;
          ctx.globalAlpha = Math.min(1, a.alpha * 1.2) * Math.min(1, a.scale);
          ctx.drawImage(img, Math.round(a.home.x - w / 2), Math.round(a.home.y + sh.dy * k - h / 2), w, h);
          ctx.globalAlpha = 1;
        }
      }
      for (const a of order) a.draw(ctx, t);
      for (const f of this.fx) f.draw(ctx);
      ctx.imageSmoothingEnabled = false;
      for (const pos of Object.keys(this.actors)) this.drawBox(ctx, pos);
      // Nền log: Battle_Chatbox 9 mảnh, mờ khi không có chữ mới.
      ctx.globalAlpha = 0.78;
      atlasSprite(ctx, 'Battle_Chatbox', SCENE.x + 4, SCENE.y + SCENE.h - 62, SCENE.w - 8, 58);
      ctx.globalAlpha = 1;
      if (this.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + this.fade + ')'; ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h); }
      ctx.restore();
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);     // cảnh khác (title, creator) vẽ với phép biến đổi mặc định của P1.view
    },

    drawTitle(ctx) {
      atlasSprite(ctx, 'battle_icon_big', 10, -10);
      const a = this.args;
      const text = this.kind === 'boss' ? 'Boss: ' + (a.name || '?') + (this.n > 1 ? ' — đội ' + this.n + ' người' : '') : this.kind === 'trainer' ? 'Đấu với ' + (a.name || 'Huấn luyện viên') : 'Pokémon hoang dã';
      ctx.font = 'bold 16px ' + FONT();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      shadowText(ctx, text, SCENE_C.x, 25);
      ctx.textAlign = 'left';
    },

    /* Hộp máu theo UserStats/FoeStats: tên, giới tính, cấp, trạng thái, thanh HP (và EXP phe mình), dãy bóng. */
    drawBox(ctx, pos) {
      const b = this.box[pos], side = pos.slice(0, 2);
      if (!b || b.alpha <= 0) return;
      const L = boxAt(pos, this.n), x = Math.round(L.x + b.slide), y = L.y;
      ctx.save();
      ctx.globalAlpha = b.alpha;
      atlasSprite(ctx, L.bg, x, y);
      const r = b.max ? clamp01(b.shown / b.max) : 0, w = Math.round(150 * r);
      const fill = r > 0.5 ? 'Battle_bar_hp_fill' : r > 0.2 ? 'Battle_bar_hp_fill_yellol' : 'Battle_bar_hp_low';
      if (w > 0) atlasSprite(ctx, fill, side === 'p2' ? x + L.fill : x + L.fill + 150 - w, y + 21, w, 4);
      ctx.font = 'bold 13px ' + FONT(); ctx.textBaseline = 'middle';
      const nx = side === 'p2' ? x + 9 : x + 4, ny = y + 9;
      const name = P1.mon.name(b.mon);
      shadowText(ctx, name, nx, ny, b.mon.shiny ? '#ffe46a' : '#fff');
      const gw = ctx.measureText(name).width;
      if (b.mon.gender === 'M') atlasSprite(ctx, 'male_outline', nx + gw + 4, ny - 6);
      if (b.mon.gender === 'F') atlasSprite(ctx, 'female_outline', nx + gw + 4, ny - 7);
      const lv = String(b.level);
      ctx.font = 'bold 12px ' + FONT();
      const lw = ctx.measureText(lv).width, rx = side === 'p2' ? x + 152 : x + 147;
      shadowText(ctx, lv, rx - lw, ny);
      atlasSprite(ctx, 'Lv', rx - lw - 14, ny - 4);
      const st = STATUS_BADGE[b.status];
      if (st) atlasSprite(ctx, st, rx - lw - 42, ny - 6);
      if (side === 'p1') {
        ctx.font = 'bold 10px ' + FONT(); ctx.textAlign = 'right';
        shadowText(ctx, Math.max(0, Math.round(b.shown)) + '/' + b.max, x + 150, y + 30, '#e8f1f8');
        ctx.textAlign = 'left';
        const ew = this.coop ? 0 : Math.round(117 * clamp01(b.exp));
        if (ew > 0) atlasSprite(ctx, 'Battle_bar_ep_fill', x + 34, y + 34, ew, 3);
        if (this.coop) this.drawOwner(ctx, pos, x, y);
      } else if (this.kind === 'wild' && P1.state.dex.caught[b.mon.dex]) atlasSprite(ctx, 'pdex_list_pokeball', x + 141, y + 28);
      // Trận chung: dãy bóng của huấn luyện viên boss chỉ vẽ một lần, dưới hộp phe boss cuối cùng.
      if (!this.coop || side === 'p1' || pos === 'p2' + 'abc'[this.n - 1]) this.drawBalls(ctx, pos, x, y);
      ctx.restore();
    },
    /* Trận chung: tên người điều khiển ô + đang chọn / đã chọn / tự động, ngay trên hộp máu. */
    drawOwner(ctx, pos, x, y) {
      const w = this.battle.at('p1', 'abc'.indexOf(pos[2]));
      if (!w) return;
      const st = this.coopStatus[w.slot], me = w.owner === this.coop.me;
      const name = this.coop.names[w.owner] || '?';
      const tag = !st ? '' : st.state === 'done' ? '✓ đã chọn' : st.state === 'auto' ? 'tự động' : st.id === this.coop.me ? 'lượt bạn' : 'đang chọn…';
      ctx.font = 'bold 10px ' + FONT(); ctx.textBaseline = 'middle';
      shadowText(ctx, me ? name + ' (bạn)' : name, x + 4, y - 7, me ? '#ffd76a' : '#9fd8ff');
      if (tag) {
        ctx.textAlign = 'right';
        shadowText(ctx, tag, x + 152, y - 7, st.state === 'done' ? '#7cf0a0' : st.state === 'auto' ? '#ff9a8a' : '#ffe9a0');
        ctx.textAlign = 'left';
      }
    },
    drawBalls(ctx, pos, x, y) {
      const side = pos.slice(0, 2);
      if (side === 'p2' && this.kind !== 'trainer' && !this.coop) return;
      if (this.coop && side === 'p2') {
        this.battle.foes.forEach((m, k) => {
          ctx.globalAlpha = this.battle.simMon('p2', k).hp <= 0 ? 0.35 : 1;
          atlasSprite(ctx, 'Battle_ball', x + 6 + k * 22, y + 46);
        });
        ctx.globalAlpha = 1;
        return;
      }
      if (this.coop) {
        // Dãy bóng của người điều khiển ô: mỗi Pokémon họ mang một quả, gục thì mờ.
        const w = this.battle.at('p1', 'abc'.indexOf(pos[2]));
        if (!w) return;
        this.battle.roster.forEach((r, k) => {
          if (r.owner !== w.owner) return;
          const i = this.battle.roster.filter((q, j) => q.owner === w.owner && j < k).length, sim = this.battle.simMon('p1', k);
          ctx.globalAlpha = sim.hp <= 0 ? 0.35 : 1;
          atlasSprite(ctx, 'Battle_ball', x + 6 + i * 15, y + 27, 12, 12);
        });
        ctx.globalAlpha = 1;
        return;
      }
      const party = side === 'p1' ? P1.state.party : this.args.foe;
      party.forEach((m, k) => {
        const bx = side === 'p1' ? x + 132 - k * 22 : x + 6 + k * 22;
        const out = this.fainted[side].has(k) || m.hp <= 0;
        ctx.globalAlpha = out ? 0.35 : 1;
        atlasSprite(ctx, 'Battle_ball', bx, y + 46);
      });
      ctx.globalAlpha = 1;
    },

    /* ------------------------------------------------ DOM */

    buildDom() {
      const host = document.getElementById('ui');
      const root = this.root = el('div', 'pb-root', host);
      this.logEl = el('div', 'pb-log', root);
      this.topEl = el('div', 'pb-top', root);
      this.promptEl = el('div', 'pb-prompt', root);
      this.timerEl = this.coop ? el('div', 'pb-timer', root) : null;
      const icons = [
        ['fight', 'battle_fight_active_icon', 'battle_fight_grey_icon', 'Chiến đấu', 638, 353.5],
        ['pokemon', 'battle_pokemon_grey_icon', 'battle_pokemon_grey_icon', 'Pokémon', 724, 354.5],
        ['item', 'battle_items_grey_icon', 'battle_items_grey_icon', 'Túi đồ', 638, 421.5],
        ['run', 'battle_run_active_icon', 'battle_run_grey_icon', this.kind === 'boss' ? 'Rời trận' : 'Chạy', 724, 421.5],
      ];
      this.icons = {};
      for (const [key, on, off, label, cx, cy] of icons) {
        const b = el('div', 'pb-btn pb-icon', root);
        b.dataset.b = key;
        b.style.left = (cx - 43) + 'px'; b.style.top = (cy - 33) + 'px';
        const i = spr(on);
        b.appendChild(i);
        el('b', '', b).textContent = label;
        b.addEventListener('click', () => this.onIcon(key));
        this.icons[key] = { el: b, img: i, on, off };
      }
      this.layoutKey = null;
      this.refreshIcons();
    },

    /* Nút nào sáng theo chế độ và loại trận. */
    refreshIcons() {
      const m = this.mode, choosing = !!this.pick;
      const req = this.req || {}, open = choosing && ['menu', 'party', 'items', 'target'].includes(m);
      const bench = this.coop ? ((this.coopReq && this.coopReq.bench) || []).length : open ? this.battle.switchable().length : 0;
      const can = {
        fight: open,
        pokemon: open && !req.trapped && bench > 0,
        item: open && !this.coop,
        run: (open && (this.kind === 'wild' || !!this.coop)) || (!!this.coop && m === 'wait'),
      };
      const sel = { fight: m === 'menu' || m === 'target', pokemon: m === 'party' || m === 'forced', item: m === 'items' || m === 'learnTarget', run: false };
      for (const [k, x] of Object.entries(this.icons)) {
        x.el.classList.toggle('off', !can[k] && !sel[k]);
        x.el.classList.toggle('sel', !!sel[k] && choosing);
        P1.proui.apply(x.img, can[k] || sel[k] ? x.on : x.off, { natural: true });
      }
    },
    onIcon(key) {
      const off = this.icons[key].el.classList.contains('off');
      if (off && !this.icons[key].el.classList.contains('sel')) return;
      if (key === 'run' && this.coop && this.mode === 'wait') { this.coop.leave(); return; }
      if (!this.pick || !['menu', 'party', 'items', 'learnTarget', 'target'].includes(this.mode)) return;
      if (key === 'fight' && this.mode !== 'menu') this.setMode('menu');
      else if (key === 'pokemon') this.setMode(this.mode === 'party' ? 'menu' : 'party');
      else if (key === 'item') this.setMode(this.mode === 'items' ? 'menu' : 'items');
      else if (key === 'run') this.send(this.coop ? { type: 'leave' } : { type: 'run' });
    },

    setMode(m) {
      this.mode = m;
      this.topEl.innerHTML = '';
      this.promptEl.textContent = '';
      if (m === 'menu') this.fillMoves();
      if (m === 'party' || m === 'forced' || m === 'learnTarget') this.fillParty();
      if (m === 'items') this.fillItems();
      if (m === 'target') this.fillTargets();
      if (this.coop) this.refreshCoopStatus();
      this.refreshIcons();
    },
    choose(mode, req) {
      this.req = req || this.req;
      return new Promise((res) => { this.pick = (a) => { this.pick = null; res(a); }; this.setMode(mode); });
    },
    send(action) { if (this.pick) { sfx('click', { volume: 0.4 }); this.pick(action); } },

    /* AttacksBattleMenu: 4 nút Battle_attack_normal 196×46 (Attack1..4 y 155/100/45/−10 trong gamegui). */
    fillMoves() {
      if (this.coop) {
        const sr = this.req;
        this.fillMoveList(sr.moves, P1.mon.name(this.battle.roster[sr.index].mon) + this.slotLabel(), (m) => this.pickMove(m));
        return;
      }
      const b = this.battle, act = b.active('p1');
      if (!act) return;
      // Chiêu hai lượt / nạp lại / Outrage…: request chỉ còn chiêu đang khoá → vẽ đúng danh sách của request.
      const r = this.req && this.req.moves;
      if (r && (r.length !== act.mon.moves.length || r.some((m, k) => m.id !== act.mon.moves[k].id))) {
        this.fillMoveList(r, P1.mon.name(act.mon), (m) => { if (this.mode === 'menu') this.send({ type: 'move', slot: m.slot }); });
        return;
      }
      const sim = b.simMon('p1', act.index);
      act.mon.moves.forEach((slot, k) => {
        const mv = P1.Dex.moves.get(slot.id), ms = sim.moveSlots[k];
        const pp = ms ? ms.pp : slot.pp;
        const r = this.req && this.req.moves && this.req.moves[k];
        const off = (r && (r.disabled || r.pp === 0)) || pp === 0;
        const btn = el('div', 'pb-btn pb-move' + (off ? ' off' : ''), this.topEl);
        btn.dataset.b = 'move-' + (k + 1);
        btn.style.top = (57.5 + k * 55) + 'px';
        P1.proui.apply(btn, 'Battle_attack_normal');
        el('div', 'n', btn).textContent = mv.name;
        if (mv.category !== 'Status') btn.appendChild(spr(mv.category === 'Physical' ? 'physical' : 'special', { cls: 'cat' }));
        const typ = mv.type.toLowerCase();
        if (P1.proui.has(typ)) btn.appendChild(spr(typ, { cls: mv.category === 'Status' ? 'cat' : 'typ' }));
        el('div', 'pp', btn).textContent = 'PP ' + pp + '/' + slot.ppMax;
        btn.title = mv.name + ' — ' + mv.type + ', ' + (mv.basePower ? 'uy lực ' + mv.basePower : 'chiêu trạng thái') +
          ', chính xác ' + (mv.accuracy === true ? '—' : mv.accuracy);
        if (!off) {
          btn.addEventListener('pointerenter', () => P1.proui.apply(btn, 'Battle_attack_hover'));
          btn.addEventListener('pointerleave', () => P1.proui.apply(btn, 'Battle_attack_normal'));
          btn.addEventListener('pointerdown', () => P1.proui.apply(btn, 'Battle_attack_press'));
          btn.addEventListener('click', () => { if (this.mode === 'menu') this.send({ type: 'move', slot: k + 1 }); });
        }
      });
      this.promptEl.textContent = P1.mon.name(act.mon) + ' sẽ làm gì?';
    },

    /* Pokemon/Poke1..6: lưới 2×3 vòng Battle_pokemon_BG (x 266/362, y 140/68/−4 trong gamegui). */
    fillParty() {
      if (this.coop) { this.fillCoopParty(); return; }
      const b = this.battle, cur = b.active('p1');
      P1.state.party.forEach((m, i) => {
        const inSim = b.order.includes(i), sim = inSim ? b.simMon('p1', i) : null;
        const hp = sim ? sim.hp : m.hp, max = sim ? sim.maxhp : P1.mon.stats(m).hp;
        const isCur = cur && cur.index === i;
        const off = hp <= 0 || (isCur && this.mode !== 'learnTarget');
        const btn = el('div', 'pb-btn pb-mon' + (isCur ? ' cur' : '') + (off ? ' off' : ''), this.topEl);
        btn.dataset.b = 'party-' + i;
        btn.style.left = ((i % 2 ? 729 : 633) - 28.5) + 'px';
        btn.style.top = (95.5 + Math.floor(i / 2) * 72 - 28.5) + 'px';
        P1.proui.apply(btn, 'Battle_pokemon_BG');
        const img = el('img', '', btn); img.src = iconUrl(m); img.draggable = false;
        el('div', 'lv', btn).textContent = 'Lv' + m.level;
        const bar = el('div', 'hp', btn), fill = el('i', '', bar);
        const r = max ? hp / max : 0;
        fill.style.width = Math.round(100 * r) + '%';
        fill.className = r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low';
        const info = P1.mon.name(m) + ' Lv' + m.level + ' · HP ' + hp + '/' + max + (m.status ? ' · ' + m.status.toUpperCase() : '');
        btn.addEventListener('pointerenter', () => { this.promptEl.textContent = info; });
        btn.addEventListener('pointerleave', () => { this.promptEl.textContent = this.partyPrompt(); });
        if (!off) btn.addEventListener('click', () => this.pickParty(i));
      });
      this.promptEl.textContent = this.partyPrompt();
    },
    /* ------------------------------------------------ trận chung: chỉ điều khiển ô của mình */

    slotLabel() {
      const sr = this.req, many = this.coopReq && this.coopReq.slots.length > 1;
      return many ? ' (ô ' + (this.coopReq.slots.indexOf(sr) + 1) + '/' + this.coopReq.slots.length + ')' : '';
    },
    /* Nút chiêu vẽ thẳng từ request của sim (trận chung, hoặc khi chiêu đang bị khoá). */
    fillMoveList(moves, who, onPick) {
      moves.forEach((m, k) => {
        const mv = P1.Dex.moves.get(m.id);
        const off = m.disabled || (m.pp === 0 && m.maxpp != null);
        const btn = el('div', 'pb-btn pb-move' + (off ? ' off' : ''), this.topEl);
        btn.dataset.b = 'move-' + m.slot;
        btn.style.top = (57.5 + k * 55) + 'px';
        P1.proui.apply(btn, 'Battle_attack_normal');
        el('div', 'n', btn).textContent = mv.exists ? mv.name : m.name;
        if (mv.category !== 'Status') btn.appendChild(spr(mv.category === 'Physical' ? 'physical' : 'special', { cls: 'cat' }));
        const typ = String(mv.type || '').toLowerCase();
        if (P1.proui.has(typ)) btn.appendChild(spr(typ, { cls: mv.category === 'Status' ? 'cat' : 'typ' }));
        if (m.maxpp != null) el('div', 'pp', btn).textContent = 'PP ' + m.pp + '/' + m.maxpp;
        if (!off) {
          btn.addEventListener('pointerenter', () => P1.proui.apply(btn, 'Battle_attack_hover'));
          btn.addEventListener('pointerleave', () => P1.proui.apply(btn, 'Battle_attack_normal'));
          btn.addEventListener('click', () => onPick(m));
        }
      });
      this.promptEl.textContent = who + ' sẽ làm gì?';
    },
    pickMove(m) {
      if (this.mode !== 'menu' || !this.pick) return;
      if (m.targets.length > 1) { this.pendingMove = m; this.setMode('target'); return; }
      this.send({ type: 'move', slot: m.slot, tg: m.targets.length ? m.targets[0].loc : 0 });
    },
    /* Chiêu một mục tiêu khi có nhiều đối thủ: mỗi mục tiêu một nút; rê chuột lên nút thì con đó sáng lên. */
    fillTargets() {
      const m = this.pendingMove;
      m.targets.forEach((t, k) => {
        const w = this.battle.at(t.pos.slice(0, 2), 'abc'.indexOf(t.pos[2]));
        const btn = el('div', 'pb-btn pb-move pb-target' + (t.ally ? ' ally' : ''), this.topEl);
        btn.dataset.b = 'target-' + t.pos;
        btn.style.top = (57.5 + k * 55) + 'px';
        P1.proui.apply(btn, 'Battle_attack_normal');
        el('div', 'n', btn).textContent = w ? P1.mon.name(w.mon) : '—';
        el('div', 'pp', btn).textContent = t.ally ? 'đồng đội' : 'đối thủ';
        const actor = this.actors[t.pos];
        btn.addEventListener('pointerenter', () => { P1.proui.apply(btn, 'Battle_attack_hover'); if (actor) actor.white = 0.35; });
        btn.addEventListener('pointerleave', () => { P1.proui.apply(btn, 'Battle_attack_normal'); if (actor) actor.white = 0; });
        btn.addEventListener('click', () => { if (actor) actor.white = 0; if (this.mode === 'target') this.send({ type: 'move', slot: m.slot, tg: t.loc }); });
      });
      this.promptEl.textContent = P1.Dex.moves.get(m.id).name + ' nhắm vào ai?';
    },
    /* Pokémon của mình: con đang ở sân (bất kỳ ô nào) và con đã gục thì mờ; bấm con dự bị để đổi vào ô này. */
    fillCoopParty() {
      const b = this.battle, sr = this.req;
      const mine = b.roster.map((x, k) => ({ k, mon: x.mon, owner: x.owner })).filter((x) => x.owner === this.coop.me);
      mine.forEach((x, i) => {
        const sim = b.simMon('p1', x.k), hp = sim.hp, max = sim.maxhp;
        const isCur = sr && sr.index === x.k, off = hp <= 0 || sim.isActive;
        const btn = el('div', 'pb-btn pb-mon' + (isCur ? ' cur' : '') + (off ? ' off' : ''), this.topEl);
        btn.dataset.b = 'party-' + x.k;
        btn.style.left = ((i % 2 ? 729 : 633) - 28.5) + 'px';
        btn.style.top = (95.5 + Math.floor(i / 2) * 72 - 28.5) + 'px';
        P1.proui.apply(btn, 'Battle_pokemon_BG');
        const img = el('img', '', btn); img.src = iconUrl(x.mon); img.draggable = false;
        el('div', 'lv', btn).textContent = 'Lv' + x.mon.level;
        const bar = el('div', 'hp', btn), fill = el('i', '', bar), r = max ? hp / max : 0;
        fill.style.width = Math.round(100 * r) + '%';
        fill.className = r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low';
        const info = P1.mon.name(x.mon) + ' Lv' + x.mon.level + ' · HP ' + hp + '/' + max;
        btn.addEventListener('pointerenter', () => { this.promptEl.textContent = info; });
        btn.addEventListener('pointerleave', () => { this.promptEl.textContent = this.partyPrompt(); });
        if (!off) btn.addEventListener('click', () => this.pickParty(x.k));
      });
      this.promptEl.textContent = this.partyPrompt();
    },
    waitText() {
      const others = Object.values(this.coopStatus).filter((s) => s.id !== this.coop.me && s.state === 'choosing').map((s) => s.name);
      return others.length ? 'Chờ ' + [...new Set(others)].join(', ') + ' chọn…' : 'Chờ lượt…';
    },
    refreshCoopStatus() {
      this.coopStatus = this.coop.status();
      if (this.mode === 'wait') this.promptEl.textContent = this.waitText();
      if (!this.timerEl) return;
      const live = ['menu', 'party', 'forced', 'target', 'wait'].includes(this.mode) && this.deadline && !this.battle.result;
      const left = live ? Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000)) : null;
      this.timerEl.textContent = left == null ? '' : 'Còn ' + left + ' s';
      this.timerEl.classList.toggle('low', left != null && left <= 5);
    },

    partyPrompt() {
      if (this.mode === 'forced') return 'Chọn Pokémon ra sân tiếp.';
      if (this.mode === 'learnTarget') return 'Dùng ' + (this.pendingItem ? this.pendingItem.name : '') + ' cho Pokémon nào?';
      return 'Đổi Pokémon nào?';
    },
    pickParty(i) {
      if (!this.pick) return;
      if (this.mode === 'learnTarget') {
        const x = this.pendingItem;
        this.consume(x.key);
        this.send({ type: 'item', item: x.key, index: i });
      } else if (this.mode === 'party' || this.mode === 'forced') this.send({ type: 'switch', index: i });
    },

    bagItems() {
      const out = [];
      for (const [key, qty] of Object.entries(P1.state.bag || {})) {
        if (!(qty > 0)) continue;
        const tab = P1.BALLS[key] ? 'ball' : P1.ITEM_EFFECT[key] ? 'med' : null;
        if (!tab) continue;
        const it = itemByBattleId(key);
        out.push({ key, qty, tab, name: it ? it.name : key, img: it && it.img });
      }
      return out;
    },
    fillItems() {
      if (!this.itemTab) this.itemTab = this.kind === 'wild' ? 'ball' : 'med';
      [['ball', 'Bóng', 589], ['med', 'Thuốc', 689]].forEach(([tab, label, x]) => {
        const t = el('div', 'pb-btn pb-tab' + (tab === this.itemTab ? ' sel' : ''), this.topEl);
        t.dataset.b = 'tab-' + tab;
        t.style.left = x + 'px';
        P1.proui.apply(t, 'Battle_attack_normal');
        t.textContent = label;
        t.addEventListener('click', () => { this.itemTab = tab; if (this.mode === 'items') this.setMode('items'); });
      });
      const list = this.bagItems().filter((x) => x.tab === this.itemTab);
      if (!list.length) { el('div', 'pb-empty', this.topEl).textContent = 'Không có gì trong ngăn này.'; return; }
      const box = el('div', 'pb-items', this.topEl);
      for (const x of list) {
        const row = el('div', 'pb-btn pb-item', box);
        row.dataset.b = 'item-' + x.key;
        P1.proui.apply(row, 'Battle_attack_normal');
        if (x.img) { const im = el('img', '', row); im.src = x.img; im.draggable = false; }
        el('div', 'n', row).textContent = x.name;
        el('div', 'q', row).textContent = '×' + x.qty;
        row.addEventListener('click', () => this.useItem(x));
      }
      this.promptEl.textContent = this.itemTab === 'ball' ? 'Ném bóng nào?' : 'Dùng thuốc nào?';
    },
    useItem(x) {
      if (this.mode !== 'items' || !this.pick) return;
      if (x.tab === 'ball') {
        if (this.kind !== 'wild') { this.promptEl.textContent = 'Không thể bắt Pokémon này!'; return; }
        this.consume(x.key);
        this.send({ type: 'ball', ball: x.key });
        return;
      }
      this.pendingItem = x;
      this.setMode('learnTarget');
    },
    consume(key) { P1.state.bag[key] = Math.max(0, (P1.state.bag[key] || 0) - 1); },

    /* Phím: 1–4 chọn chiêu, Esc/Backspace lùi về bảng chiêu. */
    keys() {
      const inp = P1.input, keysFor = KEYS[this.mode];
      if (!keysFor || !this.pick) { inp.clear(); return; }
      for (const a of ['a', 'b', 'menu', '1', '2', '3', '4']) {
        if (!inp.take(a)) continue;
        if (keysFor[a] && this.pick) keysFor[a].call(this);
      }
    },
    keyMove(i) {
      const n = this.topEl.querySelector('[data-b="move-' + i + '"]');
      if (n && !n.classList.contains('off')) this.send({ type: 'move', slot: i });
    },

    /* ------------------------------------------------ log */

    log(text) {
      this.logAll.push(text);
      this.logLines.push(text);
      while (this.logLines.length > LOG.lines) this.logLines.shift();
      this.logEl.innerHTML = this.logLines.map((l) => '<div>' + markup(l) + '</div>').join('');
    },
    async say(text, pause) { this.log(text); await this.wait(pause == null ? 0.8 : pause); },
    wait(s) { return this.clock.wait(s); },
    tween(d, fn) { return this.clock.tween(d, fn); },
    nameOf(ident) { const w = this.battle.who(ident); return w ? nameOf(w.mon) : '?'; },
    trainerName() { return '[ff6666]' + P1.state.player.name + '[-]'; },
    actorOf(ident) { const w = this.battle.who(ident); return w ? this.actors[w.pos] : null; },
    other(actor) { return Object.values(this.actors).find((a) => a.side !== actor.side && a.mon && !a.hidden) || actor; },
    /* Trận chung: "Misty: " trước lời của người điều khiển con đó. */
    ownerSays(w) { return this.coop && w && w.owner ? '[9fd8ff]' + (this.coop.names[w.owner] || '?') + '[-]: ' : ''; },
    addFx(f) { this.fx.push(f); return f; },

    /* ------------------------------------------------ vòng trận */

    async run() {
      if (this.coop) { await this.runCoop(); return; }
      const b = this.battle;
      await this.intro(b.begin());
      while (!b.result) {
        const req = b.request();
        if (!req) break;
        const action = req.kind === 'switch' ? await this.choose('forced') : await this.choose('menu', req);
        this.setMode('busy');
        await this.play(b.act(action));
      }
      await this.finish();
    },

    /*
     * Trận chung: diễn từng lô sự kiện raid.js đẩy vào (mỗi lô = một mục nhật ký đã chốt), rồi chọn cho các ô của
     * mình. Lô mới tới giữa lúc đang chọn (chủ phòng hết giờ chọn thay) thì bỏ bảng chọn và diễn tiếp.
     */
    async runCoop() {
      const c = this.coop, b = this.battle;
      await this.intro(c.intro);
      for (;;) {
        let ev;
        while ((ev = c.take())) { this.setMode('busy'); await this.play(ev); }
        if (c.over()) break;
        const n = b.log.length, req = c.request();
        this.deadline = c.ready(n) + c.turnMs;
        this.coopReq = req;
        if (req && this.submittedN !== n) {
          const r = await this.chooseCoop(req, c.wait().then(() => ({ type: 'abort' })));
          if (r === 'leave') { c.leave(); break; }
          if (r === 'done') this.submittedN = n;
        }
        if (c.over()) break;
        this.setMode('wait');
        await c.wait();
      }
      this.coopReq = null;
      await this.finish();
    },
    async chooseCoop(req, woke) {
      for (const sr of req.slots) {
        const a = await Promise.race([this.choose(sr.kind === 'switch' ? 'forced' : 'menu', sr), woke]);
        if (a.type === 'abort') { this.pick = null; this.setMode('busy'); return 'abort'; }
        if (a.type === 'leave') return 'leave';
        this.coop.submit(sr.slot, a.type === 'switch' ? { t: 'switch', k: a.index } : { t: 'move', m: a.slot, tg: a.tg || 0 });
      }
      this.setMode('busy');
      return 'done';
    },

    async play(events) {
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const f = DIRECTOR[e.cmd];
        if (f) await f.call(this, e, events, i);
      }
    },

    /*
     * Mở màn: màn đen tan, đối thủ vào sân (hoang dã: trượt từ trái, còn tối rồi sáng lên; huấn luyện viên/boss: bung từ bóng),
     * hộp máu trượt vào, rồi Pokémon của mình bung ra từ bóng. Dòng switch của sim chỉ gán Pokémon, không diễn.
     */
    async intro(events) {
      this.introPhase = true;
      await this.play(events.filter((e) => e.cmd === 'switch'));
      this.introPhase = false;
      if (this.coop) { await this.introCoop(events); return; }
      const foe = this.actors.p2a, me = this.actors.p1a;
      await this.tween(0.4, (k) => { this.fade = 1 - k; });
      if (this.kind === 'wild') {
        foe.hidden = false; foe.tint = '#000000'; foe.tintA = 0.7; foe.dx = -420;
        await this.tween(0.8, (k) => { foe.dx = -420 * (1 - ease(k)); });
        await this.tween(0.3, (k) => { foe.tintA = 0.7 * (1 - k); });
        if (foe.mon.shiny) { sfx('shiny'); this.sparkle(foe, '#fff6a0', 18); await this.wait(0.5); }
        P1.audio.cry(foe.mon.dex);
        await this.slideBox('p2a');
        await this.say('Một ' + nameOf(foe.mon) + ' hoang dã xuất hiện!', 0.9);
      } else {
        await this.say('[ff6666]' + (this.args.name || 'Huấn luyện viên') + '[-] muốn đấu!', 0.7);
        await this.say('[ff6666]' + (this.args.name || 'Huấn luyện viên') + '[-] tung ra ' + nameOf(foe.mon) + '!', 0.1);
        await this.popOut(foe);
        await this.slideBox('p2a');
      }
      await this.say('Tiến lên! ' + nameOf(me.mon) + '!', 0.1);
      await this.popOut(me);
      await this.slideBox('p1a');
      await this.play(events.filter((e) => e.cmd !== 'switch'));
    },
    /* Trận chung: huấn luyện viên boss tung đủ số con ra sân, rồi từng người tung Pokémon của mình theo thứ tự ô. */
    async introCoop(events) {
      const who = '[ff6666]' + (this.args.name || 'Boss') + '[-]';
      await this.tween(0.4, (k) => { this.fade = 1 - k; });
      await this.say(who + ' muốn đấu!', 0.7);
      const foes = Object.values(this.actors).filter((a) => a.side === 'p2' && a.mon);
      await this.say(who + ' tung ra ' + foes.map((a) => nameOf(a.mon)).join(' và ') + '!', 0.1);
      for (const a of foes) { await this.popOut(a); await this.slideBox(a.pos); }
      for (const a of Object.values(this.actors).filter((x) => x.side === 'p1' && x.mon)) {
        const w = this.battle.at('p1', 'abc'.indexOf(a.pos[2]));
        await this.say(this.ownerSays(w) + 'Tiến lên! ' + nameOf(a.mon) + '!', 0.1);
        await this.popOut(a);
        await this.slideBox(a.pos);
      }
      await this.play(events.filter((e) => e.cmd !== 'switch'));
    },
    async slideBox(pos) {
      const b = this.box[pos];
      if (!b) return;
      const from = pos.startsWith('p2') ? -220 : 220;
      await this.tween(0.3, (k) => { b.slide = from * (1 - ease(k)); b.alpha = 1; });
    },
    /* Bung ra từ bóng: bóng mở lóe trắng, Pokémon lớn dần từ 0 rồi hết trắng, kêu. */
    async popOut(actor, scale) {
      const big = scale || 1, c = actor.center();
      const ball = this.addFx(new Ball(actor.mon.ball || 'pokeball'));
      ball.x = c.x; ball.y = c.y + 20; ball.open = true;
      sfx('open');
      this.addFx(new Particles('#ffffff').burst(c.x, c.y, 10, 120));
      actor.hidden = false; actor.white = 1; actor.scale = 0;
      await this.tween(0.3, (k) => { actor.scale = big * ease(k); ball.alpha = 1 - k; });
      if (actor.mon.shiny) { sfx('shiny'); this.sparkle(actor, '#fff6a0', 18); }
      P1.audio.cry(actor.mon.dex);
      await this.tween(0.25, (k) => { actor.white = 1 - k; });
      ball.alpha = 0;
      await this.wait(0.25);
    },
    async recall(actor) {
      actor.white = 1;
      await this.tween(0.3, (k) => { actor.scale = 1 - ease(k); });
      actor.hidden = true; actor.white = 0; actor.scale = 1;
    },

    setBox(pos, mon, hp, max) {
      const prev = this.box[pos], side = pos.slice(0, 2);
      this.box[pos] = { mon, hp, max, shown: hp, level: mon.level, status: mon.status || '', exp: side === 'p1' ? expRatio(mon) : 0,
        slide: prev ? prev.slide : (side === 'p2' ? -220 : 220), alpha: prev ? prev.alpha : 0 };
    },
    async tweenHp(side, hp) {
      const b = this.box[side];
      if (!b) return;
      const from = b.shown, to = Math.max(0, Math.min(b.max, hp));
      b.hp = to;
      const d = 0.25 + 0.9 * Math.abs(to - from) / Math.max(1, b.max);
      await this.tween(d, (k) => { b.shown = from + (to - from) * k; });
    },

    /* ------------------------------------------------ hiệu ứng thân Pokémon */

    async lunge(actor, mv) {
      const dir = actor.side === 'p1' ? 1 : -1;
      if (mv.category === 'Physical') {
        await this.tween(0.12, (k) => { actor.dx = 34 * dir * ease(k); actor.dy = -20 * dir * ease(k); });
        await this.tween(0.16, (k) => { actor.dx = 34 * dir * (1 - k); actor.dy = -20 * dir * (1 - k); });
      } else {
        await this.tween(0.1, (k) => { actor.dy = -8 * Math.sin(k * Math.PI); });
        await this.tween(0.1, (k) => { actor.dy = -8 * Math.sin(k * Math.PI); });
      }
      actor.dx = 0; actor.dy = 0;
    },
    hit(actor) {
      const flash = P1.settings.battleFlash !== false;
      this.tween(0.42, (k) => {
        actor.dx = Math.round(Math.sin(k * Math.PI * 7) * 6 * (1 - k));
        actor.blink = flash && k < 0.9 && Math.floor(k * 10) % 2 === 1;
      }).then(() => { actor.dx = 0; actor.blink = false; });
    },
    sparkle(actor, colour, n) {
      const c = actor.center();
      this.addFx(new Particles(colour).sparkle(c.x, c.y, c.h, n || 14));
    },
    async pulse(actor, colour, times) {
      actor.tint = colour;
      await this.tween(0.25 * (times || 2), (k) => { actor.tintA = 0.55 * Math.abs(Math.sin(k * Math.PI * (times || 2))); });
      actor.tintA = 0;
    },
    /* Hoạt ảnh PRO (dải khung) lên phía `land`; chờ tối đa 1.6 s. */
    async sheet(anim, land) {
      const at = anim.place === 'scene' ? { x: SCENE_C.x, y: SCENE_C.y } : land.center();
      await Promise.race([P1.img(anim.img).catch(() => null), this.wait(1.2)]);
      const f = this.addFx(new SheetFx(anim, at));
      await this.wait(Math.min(1.6, f.dur));
    },
    async moveFx(mv, src, land) {
      const colour = TYPE_COLOUR[mv.type] || '#fff';
      const anim = moveAnim(mv, land.side);
      if (anim) {
        const own = !!(ANIM().moves[mv.id]);
        const p = this.sheet(anim, land);
        if (!own && mv.type !== 'Normal') { const c = land.center(); this.addFx(new Particles(colour).burst(c.x, c.y, 10, 130)); }
        await p;
        return;
      }
      if (mv.category === 'Status') {
        this.sparkle(land, colour, 16);
        await this.wait(0.6);
        return;
      }
      const a = src.center(), b = land.center();
      this.addFx(new Particles(colour).fly({ x: a.x, y: a.y }, { x: b.x, y: b.y }, 0.4));
      await this.wait(0.55);
    },

    /* ------------------------------------------------ EXP, lên cấp, học chiêu */

    async awardExp(foeMon) {
      if (this.coop) return;
      const gains = this.battle.expFor(foeMon);
      for (const g of gains) {
        const m = P1.state.party[g.index];
        if (!m || m.level >= 100) continue;
        const active = this.battle.active('p1');
        const isActive = active && active.index === g.index;
        await this.say(nameOf(m) + ' nhận ' + g.exp + ' điểm EXP!', 0.3);
        this.expGained += g.exp;
        const lv0 = m.level, exp0 = m.exp;
        const ev = P1.mon.gainExp(m, g.exp);
        P1.mon.addEvs(m, g.evs || {});
        if (isActive) await this.fillExp(m, lv0, exp0);
        for (const e of ev) {
          if (e.type === 'level') {
            this.leveled.add(g.index);
            this.battle.applyLevel(g.index);
            sfx('level');
            if (isActive) {
              const sim = this.battle.simMon('p1', g.index), b = this.box.p1a;
              Object.assign(b, { level: e.level, hp: sim.hp, shown: sim.hp, max: sim.maxhp });
              this.sparkle(this.actors.p1a, '#fff3a0', 18);
              this.pulse(this.actors.p1a, '#ffffff', 2);
            }
            await this.say(nameOf(m) + ' lên cấp ' + e.level + '!', 1.1);
          } else if (e.type === 'learn') await this.learnMove(m, e.move);
        }
        if (isActive && this.box.p1a) this.box.p1a.exp = expRatio(m);
      }
    },
    async fillExp(m, lv0, exp0) {
      const b = this.box.p1a;
      let lv = lv0, e = exp0;
      while (lv < m.level) {
        const a = expRatioAt(m.dex, lv, e);
        await this.tween(0.6 * (1 - a), (k) => { b.exp = a + (1 - a) * k; });
        sfx('expFull');
        lv++; e = P1.mon.expAt(m.dex, lv);
        b.exp = 0;
      }
      const a = expRatioAt(m.dex, lv, e), z = expRatio(m);
      await this.tween(0.6 * Math.max(0.15, z - a), (k) => { b.exp = a + (z - a) * k; });
    },
    /* Đủ 4 chiêu: hỏi quên chiêu nào qua P1.ui.learnMove (menus.js); chưa có UI thì bỏ qua như "không học". */
    async learnMove(m, moveId) {
      const mv = P1.Dex.moves.get(moveId);
      const sim = this.battle.simMon('p1', P1.state.party.indexOf(m));
      if (m.moves.length < 4) {
        P1.mon.learn(m, moveId);
        if (sim) syncMovesToSim(sim, m);
        sfx('level');
        await this.say(nameOf(m) + ' học được ' + Y(mv.name) + '!', 1);
        return;
      }
      if (!(P1.ui && P1.ui.learnMove)) { await this.say(nameOf(m) + ' không học ' + Y(mv.name) + '.', 0.8); return; }
      await this.say(nameOf(m) + ' muốn học ' + Y(mv.name) + '...', 0.3);
      this.setMode('learn');
      const before = m.moves.map((s) => s.id);
      const slot = await P1.ui.learnMove(m, moveId);
      this.setMode('busy');
      if (slot == null) { await this.say(nameOf(m) + ' không học ' + Y(mv.name) + '.', 0.8); return; }
      if (sim) syncMovesToSim(sim, m);
      await this.say(nameOf(m) + ' quên ' + Y(P1.Dex.moves.get(before[slot]).name) + ' và học được ' + Y(mv.name) + '!', 1);
    },

    /* ------------------------------------------------ kết thúc */

    async finish() {
      if (this.coop) { await this.finishCoop(); return; }
      const b = this.battle;
      const res = b.result;
      const out = { outcome: res === 'tie' ? 'lose' : res };
      if (res === 'win' && this.kind === 'trainer') {
        const top = Math.max(...this.args.foe.map((m) => m.level));
        const money = this.args.money != null ? this.args.money : top * 24;   // (đoán) chưa có công thức gốc
        P1.state.money += money;
        out.money = money;
        await this.say('Nhận ' + money + ' ₽ tiền thưởng!', 1);
      }
      if (res === 'win') await this.say(this.trainerName() + ' đã thắng!', 0.8);
      if (out.outcome === 'lose') await this.say('Cả đội đã gục ngã...', 1.2);
      if (res === 'caught') {
        const m = b.caught;
        m.ot = P1.state.player.name; m.metAt = this.args.where || ''; m.metLevel = m.level;
        P1.caught(m.dex);
        if (P1.state.party.length < 6) P1.state.party.push(m); else P1.state.box.push(m);
        out.caught = m;
        if (P1.state.party.indexOf(m) < 0) await this.say(nameOf(m) + ' được gửi về PC.', 1);
      }
      out.exp = this.expGained;
      out.evolve = P1.state.party.map((m, i) => ({ index: i, dex: P1.mon.evolution(m) })).filter((x) => x.dex && this.leveled.has(x.index));
      await this.close(out);
    },
    /* Trận chung kết thúc. Không EXP (thưởng chia bằng Cần/Tham/Bỏ ở raid.js). */
    async finishCoop() {
      const res = this.battle.result;
      if (res === 'win') await this.say('Cả đội đã hạ [ff6666]' + (this.args.name || 'boss') + '[-]!', 1.2);
      else if (res === 'lose') await this.say('Cả đội đã gục ngã...', 1.2);
      else if (res === 'desync') await this.say('Trận bị lệch giữa các máy — dừng lại.', 1.2);
      else await this.say('Bạn rời trận boss.', 0.6);
      await this.close({ outcome: res === 'win' ? 'win' : res === 'lose' || res === 'desync' ? 'lose' : 'ran', exp: 0, evolve: [] });
    },
    async close(out) {
      this.setMode('end');
      await this.wait(0.5);
      if (typeof this.args.onEnd === 'function') {
        await this.tween(0.3, (k) => { this.fade = k; });
        this.args.onEnd(out);
        return;
      }
      this.result = out;
      this.showEnd(out);
    },
    /* Chỉ khi vào thẳng trận bằng ?battle= (không có onEnd): hộp "đánh lại". */
    showEnd(out) {
      const box = el('div', 'pb-end', this.root);
      P1.proui.apply(box, 'Battle_Chatbox');
      const text = { win: 'Bạn đã thắng!', lose: 'Bạn đã thua.', ran: 'Đã rời trận.', caught: 'Bắt được ' + (out.caught ? P1.mon.name(out.caught) : '') + '!' }[out.outcome] || out.outcome;
      el('div', 't', box).textContent = text;
      [['again', 'Đánh lại', () => this.restart()], ['close', 'Đóng', () => box.remove()]].forEach(([k, label, fn]) => {
        const btn = el('div', 'pb-btn', box);
        btn.dataset.b = k;
        P1.proui.apply(btn, 'Battle_attack_normal');
        btn.textContent = label;
        btn.addEventListener('click', fn);
      });
    },
    restart() {
      for (const m of P1.state.party) P1.mon.heal(m);
      const foe = this.args.foe.map((m) => P1.mon.create(m.dex, m.level, { ot: 'Debug' }));
      P1.scene.go('battle', Object.assign({}, this.args, { foe }));
    },
  };

  let fontFamily = '';
  const FONT = () => fontFamily || (fontFamily = (getComputedStyle(document.documentElement).getPropertyValue('--p1-font') || '').trim() ||
    "'Segoe UI', Verdana, Arial, sans-serif");

  /* Sau khi học chiêu giữa trận: đưa chiêu mới vào sim để lượt sau dùng được. */
  function syncMovesToSim(p, m) {
    m.moves.forEach((s, k) => {
      const mv = P1.Dex.moves.get(s.id);
      const slot = { move: mv.name, id: mv.id, pp: s.pp, maxpp: s.ppMax, target: mv.target, disabled: false, used: false };
      p.moveSlots[k] = slot; p.baseMoveSlots[k] = Object.assign({}, slot);
    });
  }

  /* Phím theo chế độ. */
  const KEYS = {
    menu: { '1'() { this.keyMove(1); }, '2'() { this.keyMove(2); }, '3'() { this.keyMove(3); }, '4'() { this.keyMove(4); } },
    party: { b() { this.setMode('menu'); }, menu() { this.setMode('menu'); } },
    items: { b() { this.setMode('menu'); }, menu() { this.setMode('menu'); } },
    learnTarget: { b() { this.setMode('items'); }, menu() { this.setMode('items'); } },
    forced: {},
    target: { b() { this.setMode('menu'); }, menu() { this.setMode('menu'); } },
  };

  /* ================================================================ DIRECTOR: sự kiện Showdown → trình diễn */

  const DIRECTOR = {
    /* Vào sân: mở màn chỉ gán; giữa trận thì con cũ về bóng rồi con mới bung ra. */
    async switch(e) {
      const w = this.battle.who(e.args[0]);
      const actor = this.actors[w.pos];
      const hp = parseHp(e.args[2]), sim = this.battle.simMon(w.side, w.index);
      const max = sim.maxhp;
      if (w.side === 'p2') P1.seen(w.mon.dex);
      // Mở màn: lấy HP từ sim (dòng switch đầu ghi HP trước khi maxHp của boss được đặt).
      if (this.introPhase) { actor.set(w.mon); actor.hidden = true; this.setBox(w.pos, w.mon, sim.hp, max); return; }
      if (actor.mon && !actor.hidden) {
        if (w.side === 'p1') await this.say(this.ownerSays(w) + nameOf(actor.mon) + ', quay về!', 0.2);
        await this.recall(actor);
      }
      await P1.img(monUrl(w.mon, w.side === 'p1' ? 'back' : 'front')).catch(() => null);
      actor.set(w.mon);
      actor.hidden = true;
      this.setBox(w.pos, w.mon, hp.hp, max);
      this.box[w.pos].alpha = 1; this.box[w.pos].slide = 0;
      if (w.side === 'p1') await this.say(this.ownerSays(w) + 'Tiến lên! ' + nameOf(w.mon) + '!', 0.1);
      else await this.say('[ff6666]' + (this.args.name || 'Đối thủ') + '[-] tung ra ' + nameOf(w.mon) + '!', 0.1);
      await this.popOut(actor);
    },
    async drag(e) { return DIRECTOR.switch.call(this, e); },
    async replace(e) { return DIRECTOR.switch.call(this, e); },

    async move(e) {
      const src = this.actorOf(e.args[0]);
      if (!src) return;
      const tgt = this.actorOf(e.args[2]) || this.other(src);
      const mv = P1.Dex.moves.get(e.args[1]);
      await this.say(this.nameOf(e.args[0]) + ' dùng ' + Y(mv.name) + '!', 0.25);
      if (e.kw.still || e.kw.notarget) return;
      await this.lunge(src, mv);
      if (e.kw.miss) return;
      await this.moveFx(mv, src, SELF_TARGET.has(mv.target) ? src : tgt);
    },

    async '-supereffective'() { await this.say('Hiệu quả tuyệt vời!', 0.3); },
    async '-resisted'() { await this.say('Không hiệu quả lắm...', 0.3); },
    async '-crit'() { await this.say('Đòn chí mạng!', 0.3); },
    async '-immune'(e) { await this.say('Không ảnh hưởng tới ' + this.nameOf(e.args[0]) + '...'); },
    async '-miss'(e) { await this.say('Đòn của ' + this.nameOf(e.args[0]) + ' trượt!'); },
    async '-fail'() { await this.say('Nhưng thất bại!'); },
    async '-ohko'() { await this.say('Hạ gục chỉ một đòn!'); },
    async '-hitcount'(e) { await this.say('Trúng ' + e.args[1] + ' lần!', 0.3); },

    /* Trúng đòn: tiếng theo hiệu quả (xem các dòng -supereffective/-resisted quanh đó), rung + nháy, rồi thanh máu tụt. */
    async '-damage'(e, list, i) {
      const w = this.battle.who(e.args[0]);
      if (!w) return;
      const actor = this.actors[w.pos], hp = parseHp(e.args[1]);
      const from = e.kw.from || '';
      if (!from) {
        const near = list.slice(Math.max(0, i - 3), i + 3).filter((x) => x.args[0] === e.args[0]).map((x) => x.cmd);
        sfx(near.includes('-supereffective') ? 'super' : near.includes('-resisted') ? 'weak' : 'damage');
        this.hit(actor);
        await this.wait(0.2);
      } else {
        const t = DAMAGE_FROM[from.replace(/^(item|ability|move): /, '').toLowerCase()];
        const st = STATUS_COLOUR[from];
        if (st) this.sparkle(actor, st, 10);
        await this.say(this.nameOf(e.args[0]) + (t || ' bị thương!'), 0.3);
        this.hit(actor);
      }
      await this.tweenHp(w.pos, hp.hp);
    },
    async '-heal'(e) {
      const w = this.battle.who(e.args[0]);
      if (!w) return;
      sfx('heal', { volume: 0.7 });
      this.sparkle(this.actors[w.pos], '#8aff8a', 16);
      await this.tweenHp(w.pos, parseHp(e.args[1]).hp);
      const from = (e.kw.from || '').toLowerCase();
      if (from.includes('drain')) await this.say(this.nameOf(e.kw.of || e.args[0]) + ' bị hút năng lượng!');
      else await this.say(this.nameOf(e.args[0]) + ' hồi phục HP!');
    },
    async '-sethp'(e) { const w = this.battle.who(e.args[0]); if (w) await this.tweenHp(w.pos, parseHp(e.args[1]).hp); },
    async '-revive'(e) { const w = this.battle.who(e.args[0]); if (w) await this.say(nameOf(w.mon) + ' đã hồi sinh!'); },

    /* Gục: thanh máu về 0, sprite lún xuống dưới vạch chân và mờ đi. */
    async faint(e) {
      const w = this.battle.who(e.args[0]);
      if (!w) return;
      const actor = this.actors[w.pos], b = this.box[w.pos];
      if (b && b.hp > 0) await this.tweenHp(w.pos, 0);
      sfx('faint');
      P1.audio.cry(w.mon.dex, { rate: 0.8 });
      await this.tween(0.55, (k) => { actor.sink = 110 * ease(k); actor.alpha = 1 - k * 0.6; });
      actor.hidden = true; actor.sink = 0; actor.alpha = 1;
      this.fainted[w.side].add(w.index);
      await this.say(this.nameOf(e.args[0]) + ' gục ngã!', 0.5);
      // Hộp máu biến theo con gục. Trận thường: hộp phe mình ở lại tới khi thay con.
      if (b && (w.side === 'p2' || this.coop)) await this.tween(0.25, (k) => { b.alpha = 1 - k; });
      if (w.side === 'p2' && !this.coop && this.battle.active('p1')) await this.awardExp(w.mon);
    },

    async '-status'(e) {
      const w = this.battle.who(e.args[0]);
      if (!w) return;
      const st = e.args[1], actor = this.actors[w.pos];
      if (this.box[w.pos]) this.box[w.pos].status = st;
      const anim = ANIM().status[st === 'tox' ? 'psn' : st];
      if (anim) await this.sheet(anim, actor);
      else { this.sparkle(actor, STATUS_COLOUR[st] || '#fff', 14); this.pulse(actor, STATUS_COLOUR[st] || '#fff', 2); }
      await this.say(this.nameOf(e.args[0]) + (STATUS_TEXT[st] || ' bị ảnh hưởng!'));
    },
    async '-curestatus'(e) {
      const w = this.battle.who(e.args[0]);
      if (!w) return;
      if (this.box[w.pos]) this.box[w.pos].status = '';
      await this.say(this.nameOf(e.args[0]) + (CURE_TEXT[e.args[1]] || ' hết trạng thái xấu.'));
    },
    async '-boost'(e) { await statChange.call(this, e, 1); },
    async '-unboost'(e) { await statChange.call(this, e, -1); },
    async cant(e) {
      const reason = e.args[1] || '';
      const w = this.battle.who(e.args[0]);
      const anim = w && ANIM().status[reason];
      if (anim) await this.sheet(anim, this.actors[w.pos]);
      await this.say(this.nameOf(e.args[0]) + (CANT_TEXT[reason] || ' không ra đòn được!'));
    },
    async '-start'(e) {
      const eff = (e.args[1] || '').replace(/^move: /, '').toLowerCase();
      const w = this.battle.who(e.args[0]);
      if (eff === 'confusion') {
        if (w) this.sparkle(this.actors[w.pos], '#ffb0ff', 12);
        await this.say(this.nameOf(e.args[0]) + ' bị rối loạn!');
      } else if (eff === 'substitute') await this.say(this.nameOf(e.args[0]) + ' tạo ra phân thân!');
      else if (eff === 'leech seed') await this.say(this.nameOf(e.args[0]) + ' bị gieo hạt!');
    },
    async '-end'(e) {
      const eff = (e.args[1] || '').replace(/^move: /, '').toLowerCase();
      if (eff === 'confusion') await this.say(this.nameOf(e.args[0]) + ' hết rối loạn!');
      else if (eff === 'substitute') await this.say('Phân thân của ' + this.nameOf(e.args[0]) + ' biến mất!');
    },
    async '-activate'(e) {
      const eff = (e.args[1] || '').replace(/^move: /, '').toLowerCase();
      const w = this.battle.who(e.args[0]);
      if (eff === 'confusion') {
        if (w) this.sparkle(this.actors[w.pos], '#ffb0ff', 12);
        await this.say(this.nameOf(e.args[0]) + ' đang rối loạn!');
      } else if (eff === 'protect') await this.say(this.nameOf(e.args[0]) + ' tự bảo vệ!');
    },
    async '-weather'(e) {
      const t = WEATHER_TEXT[e.args[0]];
      if (e.kw.upkeep) return;
      const anim = ANIM().weather[e.args[0]];
      if (anim) await this.sheet(anim, this.actors.p2a);
      if (t) await this.say(t);
    },
    async '-message'(e) { await this.say(e.args[0]); },
    async turn(e) { if (e.args[0] !== '1') this.log('— Lượt ' + e.args[0] + ' —'); },

    /* Hành động riêng của bản web (engine.js): đồ, bóng, chạy. */
    async 'p1-item'(e) {
      const w = this.battle.who(e.args[1]);
      sfx('item', { volume: 0.7 });
      await this.say(this.trainerName() + ' dùng ' + Y(itemName(e.args[0])) + ' cho ' + nameOf(w.mon) + '!', 0.3);
    },
    async 'p1-ball'(e) { await throwBall.call(this, e); },
    async 'p1-run'(e) {
      if (e.args[0] === '1') {
        sfx('run');
        const me = this.actors.p1a;
        this.tween(0.5, (k) => { me.dx = -260 * ease(k); me.alpha = 1 - k; });
        await this.say('Chạy thoát an toàn!', 1);
      } else await this.say('Không chạy thoát được!');
    },
    async 'p1-norun'() { await this.say('Không thể bỏ chạy khỏi trận đấu này!'); },
    async 'p1-noball'() { await this.say('Không thể bắt Pokémon này!'); },
  };

  async function statChange(e, dir) {
    const w = this.battle.who(e.args[0]);
    const n = +e.args[2] || 0;
    sfx(dir > 0 ? 'up' : 'down');
    if (w) {
      const actor = this.actors[w.pos], c = actor.center(), colour = dir > 0 ? '#ff7a5a' : '#5a9aff';
      this.addFx(new Particles(colour).rise(c.x, c.y, dir, 12));
      await this.pulse(actor, colour, 2);
    }
    const nm = this.nameOf(e.args[0]) + ': ' + (STAT_NAME[e.args[1]] || String(e.args[1]).toUpperCase());
    if (n === 0) await this.say(nm + (dir > 0 ? ' không thể tăng thêm!' : ' không thể giảm thêm!'));
    else if (dir > 0) await this.say(nm + (n >= 3 ? ' tăng vọt!' : n === 2 ? ' tăng mạnh!' : ' tăng!'));
    else await this.say(nm + (n >= 3 ? ' giảm thê thảm!' : n === 2 ? ' giảm mạnh!' : ' giảm!'));
  }

  /* ---------------------------------------------------------------- ném bóng */

  /*
   * Tay cầm bóng (pokeballs/hand) hiện góc trái-dưới, bóng bay vòng cung tới thân đối thủ, mở ra hút Pokémon
   * (trắng rồi thu nhỏ vào bóng), rơi xuống chân, lắc `shakes` lần; bắt được thì bóng tối đi + lấp lánh,
   * hụt thì bóng bung ra và Pokémon hiện lại.
   */
  async function throwBall(e) {
    const [key, , shakesStr, caughtStr] = e.args;
    const caught = caughtStr === '1', shakes = Math.max(1, +shakesStr);
    const foe = this.actors.p2a, name = itemName(key);
    await this.say(this.trainerName() + ' ném ' + Y(name) + '!', 0.2);
    const ball = this.addFx(new Ball(key));
    ball.inHand = true;
    ball.hand = { x: SCENE.x - 40, y: SCENE.y + SCENE.h - 120, a: 1 };
    await this.tween(0.25, (k) => { ball.hand.x = SCENE.x - 40 + 70 * ease(k); });
    sfx('throw');
    const c = foe.center(), from = { x: ball.hand.x + 40, y: ball.hand.y + 20 }, to = { x: c.x, y: c.y - 10 };
    ball.inHand = false;
    this.tween(0.25, (k) => { ball.hand.a = 1 - k; }).then(() => { ball.hand = null; });
    await this.tween(0.6, (k) => {
      ball.x = from.x + (to.x - from.x) * k;
      ball.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 120;
      ball.rot = k * Math.PI * 4;
    });
    ball.rot = 0; ball.open = true;
    sfx('open');
    this.addFx(new Particles('#ffffff').burst(to.x, to.y, 12, 140));
    foe.white = 1;
    await this.tween(0.35, (k) => { foe.scale = 1 - ease(k); });
    foe.hidden = true; foe.scale = 1; foe.white = 0;
    ball.open = false;
    const ground = foe.home.y - 14;
    sfx('drop');
    await this.tween(0.35, (k) => { ball.y = to.y + (ground - to.y) * (k < 0.7 ? (k / 0.7) ** 2 : 1 - Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.12); });
    await this.wait(0.3);
    for (let i = 0; i < Math.min(3, shakes); i++) {
      this.catchPhase = 'shake' + i;
      sfx('shake');
      await this.tween(0.5, (k) => { ball.rot = Math.sin(k * Math.PI * 2) * 0.45 * (i % 2 ? -1 : 1); });
      ball.rot = 0;
      await this.wait(0.35);
    }
    this.catchPhase = null;
    if (caught) {
      sfx('caught');
      this.addFx(new Particles('#fff6a0').sparkle(ball.x, ball.y - 10, 30, 16));
      await this.tween(0.4, (k) => { ball.dark = 0.45 * k; });
      await this.say('Bắt được rồi! ' + nameOf(foe.mon) + ' đã bị bắt!', 1);
      this.catchPhase = 'caught';
      return;
    }
    sfx('break');
    ball.open = true;
    foe.hidden = false; foe.white = 1; foe.scale = 0;
    this.addFx(new Particles('#ffffff').burst(c.x, c.y, 12, 140));
    await this.tween(0.3, (k) => { foe.scale = ease(k); ball.alpha = 1 - k; });
    await this.tween(0.2, (k) => { foe.white = 1 - k; });
    ball.alpha = 0;
    await this.say(BALL_FAIL[+shakesStr] || BALL_FAIL[0], 0.8);
  }

  P1.battleScene = scene;
  P1.scene.add('battle', scene);
})(window.P1 = window.P1 || {});
