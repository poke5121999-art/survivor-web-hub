/*
 * Nhân vật trên bản đồ 2D: tấm sprite PRO 256², ô 64 px, đặt đáy-giữa ô sprite trùng đáy-giữa ô bản đồ 32 px.
 * Một Actor giữ ô (x, y), hướng (0 lên, 1 trái, 2 xuống, 3 phải), bước đang đi, cú nhảy gờ; world.js vẽ bằng draw().
 *
 * Đã xem D:\pro-ref\dump\npc__sprite1.png và player__1_body_m__0_0_1.png: cột 1 là đứng (chân khép), cột 0 và 2 là
 * hai chân bước (kiểu RPG Maker, chu kỳ 0,1,2,1). Hàng 0 lưng, 1 quay PHẢI, 2 mặt, 3 quay TRÁI (nhìn mặt và ba lô;
 * khác chữ "1 trái, 3 phải" trong brain/plans/pokeone-2d-pro.md).
 * Tấm follow (follow__25.png): 4 cột nhún liên tục, hàng 0 mặt, 1 trái, 2 phải, 3 lưng.
 */
(function (P1) {
  'use strict';

  const FALLBACK_PLAYER = 'sprite1';          // tấm NPC dùng khi chưa có P1.PRO hoặc thiếu ảnh lớp người chơi
  const DIR = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  const DIR_NAME = ['up', 'left', 'down', 'right'];
  const dirIndex = s => typeof s === 'number' ? s : Math.max(0, DIR_NAME.indexOf(s));
  const T = 32, CELL = 64;

  // MoveSpeed 3,25 ô/s đo từ CharacterHandler PokéOne; giữ nguyên để nhịp đi không đổi so với bản 3D.
  const SPEED = 3.25;
  const JUMP_PX = 12, JUMP_SLOW = 0.75;       // gờ: vòm sin cao 12 px, chậm hơn đi thường một chút
  const NPC_ROWS = [0, 3, 2, 1];              // [lên, trái, xuống, phải] → hàng tấm người (NPC và lớp người chơi)
  const FOLLOW_ROWS = [3, 1, 0, 2];           // như trên cho tấm follow

  const npcUrl = s => 'art/pro/npc/' + s + '.png';
  const safe = p => p.then(im => im, () => null);

  /* Ghép lớp người chơi một lần vào canvas 256² (cache theo bộ lớp). */
  const composed = {};
  function playerSheet() {
    const st = P1.state.player || {};
    const g = st.gender === 'f' || st.gender === 'female' ? 'f' : 'm';
    const L = st.look || {};
    const look = { body: L.body, cloth: L.cloth != null ? L.cloth : L.clothe, hair: L.hair, hat: L.hat };
    const PRO = P1.PRO;
    const fallback = () => safe(P1.img(npcUrl(FALLBACK_PLAYER)));
    if (!PRO || !PRO.layerOrder || !PRO.pose || !look.body) return fallback();
    const urls = PRO.layerOrder.filter(k => look[k]).map(k => 'art/pro/player/' + g + '/' + k + '/' + look[k] + '_' + PRO.pose.walk + '.png');
    const key = urls.join('|');
    if (!composed[key]) {
      composed[key] = Promise.all(urls.map(u => safe(P1.img(u)))).then(imgs => {
        if (!imgs[0]) return fallback();   // không có thân thì ghép lớp khác cũng vô nghĩa
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g2 = c.getContext('2d');
        for (const im of imgs) if (im) g2.drawImage(im, 0, 0);
        return c;
      });
    }
    return composed[key];
  }

  /*
   * opt: { kind, x, y, face, sheet: Promise<ảnh|null>, cols: 3|4, rows, shadow, data, name }
   * x,y là ô đích (đổi ngay khi bắt đầu bước); px/py là vị trí vẽ nội suy theo ô.
   */
  class Actor {
    constructor(opt) {
      this.kind = opt.kind || 'npc';
      this.x = opt.x | 0; this.y = opt.y | 0;
      this.face = dirIndex(opt.face == null ? 2 : opt.face);
      this.cols = opt.cols || 3;
      this.rows = opt.rows || NPC_ROWS;
      this.fixedRow = opt.fixedRow;
      this.speed = opt.speed || SPEED;
      this.shadow = opt.shadow !== false;
      this.move = null;
      this.bumpT = 0;
      this.stepParity = 0;
      this.anim = 0;
      this.hidden = false;
      this.data = opt.data || null;
      this.name = opt.name || '';
      this.sheet = null;
      this.ready = (opt.sheet || Promise.resolve(null)).then(im => { this.sheet = im; return im; });
    }

    get dirName() { return DIR_NAME[this.face]; }
    get px() { const m = this.move; return m ? m.fx + (m.tx - m.fx) * Math.min(1, m.t / m.dur) : this.x; }
    get py() { const m = this.move; return m ? m.fy + (m.ty - m.fy) * Math.min(1, m.t / m.dur) : this.y; }
    get lift() { const m = this.move; return m && m.jump ? Math.sin(Math.PI * Math.min(1, m.t / m.dur)) * JUMP_PX : 0; }

    /* Bắt đầu một bước (hoặc nhảy 2 ô). Trả Promise khi tới nơi. */
    step(dir, opt) {
      opt = opt || {};
      this.face = dirIndex(dir);
      const [dx, dy] = DIR[this.face];
      const n = opt.jump ? 2 : 1;
      const dur = n / (opt.speed || this.speed) / (opt.jump ? JUMP_SLOW : 1);
      let done;
      const p = new Promise(r => { done = r; });
      this.move = { fx: this.x, fy: this.y, tx: this.x + dx * n, ty: this.y + dy * n, t: 0, dur, jump: !!opt.jump, done };
      this.x += dx * n; this.y += dy * n;
      this.stepParity ^= 1;
      return p;
    }

    /* Bước tại chỗ khi đâm tường: chạy một khung chân rồi về đứng. */
    bump(dir) {
      this.face = dirIndex(dir);
      if (this.bumpT > 0) return;
      this.bumpT = 1 / this.speed;
      this.stepParity ^= 1;
    }

    update(dt) {
      this.anim += dt;
      const m = this.move;
      if (m) {
        m.t += dt;
        if (m.t >= m.dur) { this.move = null; m.done(); }
      } else if (this.bumpT > 0) this.bumpT -= dt;
    }

    frame() {
      if (this.cols === 4) {
        // Pokémon đi theo nhún liên tục; khi đi thì nhanh gấp đôi.
        return Math.floor(this.anim * (this.move ? 8 : 4)) % 4;
      }
      const m = this.move;
      const walking = m ? m.jump || m.t / m.dur < 0.5 : this.bumpT > 0.5 / this.speed;
      return walking ? (this.stepParity ? 0 : 2) : 1;
    }

    teleport(x, y, face) {
      this.move = null; this.x = x; this.y = y;
      if (face != null) this.face = dirIndex(face);
    }
    setVisible(v) { this.hidden = !v; }

    /* Vẽ trong hệ toạ độ pixel bản đồ. snap: làm tròn về điểm ảnh thiết bị. Bóng vẽ một lượt riêng trước mọi thân. */
    drawShadow(ctx, snap) {
      if (this.hidden || !this.shadow) return;
      const s = this.lift ? 0.75 : 1;
      ctx.beginPath();
      ctx.ellipse(snap(this.px * T) + T / 2, snap(this.py * T) + T - 3, 9 * s, 3.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    draw(ctx, snap) {
      if (this.hidden || !this.sheet) return;
      const bx = snap(this.px * T), by = snap(this.py * T), lift = snap(this.lift);
      const row = this.fixedRow != null ? this.fixedRow : this.rows[this.face];
      const col = this.fixedRow != null ? 1 : this.frame();
      ctx.drawImage(this.sheet, col * CELL, row * CELL, CELL, CELL, bx - T / 2, by - T - lift, CELL, CELL);
    }
  }

  function playerActor(opt) {
    return new Actor(Object.assign({ kind: 'player', sheet: playerSheet() }, opt));
  }
  function npcActor(file, opt) {
    return new Actor(Object.assign({ kind: 'npc', sheet: safe(P1.img(npcUrl(file))) }, opt));
  }
  /* Vật phẩm trên đất: tấm NPC Poké Ball, luôn khung mặt (hàng 2). */
  function itemActor(file, opt) {
    return new Actor(Object.assign({ kind: 'item', fixedRow: 2, sheet: safe(P1.img(npcUrl(file))) }, opt));
  }
  function followUrl(dex, shiny) { return 'art/pro/poke/follow/' + dex + (shiny ? 's' : '') + '.png'; }
  function followActor(img, opt) {
    const fr = P1.PRO && P1.PRO.followRows;   // data/pro.js: { down, left, right, up } → hàng
    const rows = fr ? DIR_NAME.map((n, i) => (fr[n] != null ? fr[n] : FOLLOW_ROWS[i])) : FOLLOW_ROWS;
    return new Actor(Object.assign({ kind: 'follow', cols: 4, rows, sheet: Promise.resolve(img) }, opt));
  }

  P1.Actor = Actor;
  P1.actors = { playerActor, npcActor, itemActor, followActor, followUrl, playerSheet, DIR, DIR_NAME, dirIndex, FALLBACK_PLAYER, SPEED };
})(window.P1 = window.P1 || {});
