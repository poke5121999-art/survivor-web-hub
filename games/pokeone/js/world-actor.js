/*
 * Nhân vật trên bản đồ: quad sprite như CharacterHandler gốc (Sprite Offset nghiêng 35°, Quad - Body 2×2,
 * bóng Quad - Shadow 1×0,5), số đo ở data/world.js (tools/rip_world.py).
 * Một Actor giữ ô (x, y), hướng (0 lên, 1 trái, 2 xuống, 3 phải = hàng sprite), bước đang đi, cú nhảy gờ.
 * Gốc nhân vật ở góc ô (x, y) (mép bắc của ô), cao 0,6 trên mặt đất như prefab gốc.
 */
(function (P1) {
  'use strict';

  const W = () => P1.WORLD || {};
  const DIR = [[0, -1], [-1, 0], [0, 1], [1, 0]];   // theo hàng sprite: lên, trái, xuống, phải
  const DIR_NAME = ['up', 'left', 'down', 'right'];
  const dirIndex = s => typeof s === 'number' ? s : Math.max(0, DIR_NAME.indexOf(s));

  const ROOT_Y = 0.6;                     // [SUY RA, rip_world] mặt đất = gốc - 0,6
  // Chưa đo được (private, mã bị Themida mã hoá): tốc độ khung bước và cú nhảy. Đặt tay theo cảm giác HGSS.
  const STEP_FRAME_SPLIT = 0.5;           // nửa đầu mỗi bước là khung bước chân, nửa sau khung đứng
  const JUMP_HEIGHT = 0.9, JUMP_TILES_PER_SEC_SCALE = 0.75;

  const imgCache = {};
  function loadImage(url) {
    if (!imgCache[url]) imgCache[url] = new Promise(res => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => { console.warn('sprite missing: ' + url); res(null); };
      im.src = url;
    });
    return imgCache[url];
  }

  /* Tấm sprite 256×256: người chơi ghép 4 lớp thân → áo → tóc → mũ (README-2d.md); lớp { url, tint } nhân màu (tóc). */
  const sheetCache = {};
  function tinted(im, tint) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0, 256, 256);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint.length === 9 ? tint.slice(0, 7) : tint;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0, 256, 256);
    return c;
  }
  function sheet(layers) {
    layers = layers.filter(l => l && (typeof l === 'string' || l.url)).map(l => (typeof l === 'string' ? { url: l } : l));
    const key = layers.map(l => l.url + (l.tint || '')).join('|');
    if (!sheetCache[key]) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const tex = new THREE.CanvasTexture(cv);
      tex.encoding = THREE.sRGBEncoding;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      const ready = Promise.all(layers.map(l => loadImage(l.url))).then(imgs => {
        const g = cv.getContext('2d');
        imgs.forEach((im, i) => { if (im) g.drawImage(layers[i].tint ? tinted(im, layers[i].tint) : im, 0, 0, 256, 256); });
        tex.needsUpdate = true;
        return tex;
      });
      sheetCache[key] = { tex, ready };
    }
    return sheetCache[key];
  }

  function playerLayers(look, gender) {
    const g = gender === 'female' ? 'female' : 'male';
    const L = look || {};
    const out = ['art/sprite/player/body_' + g + '/' + (L.body || '00_00') + '_1.png'];
    if (L.clothe) out.push('art/sprite/player/clothe_' + g + '/' + L.clothe + '_1.png');
    if (L.hair) out.push('art/sprite/player/hair_' + g + '/' + L.hair + '_1.png');
    if (L.hat) out.push('art/sprite/player/hats/' + L.hat + '_1.png');
    return out;
  }

  let shadowTex = null;
  function shadowMaterial() {
    if (!shadowTex) {
      const s = (W().character && W().character.rig && W().character.rig.shadow) || {};
      const url = (s.material && s.material.img) || 'art/fx/shadow.png';
      shadowTex = new THREE.TextureLoader().load(url);
      shadowTex.encoding = THREE.sRGBEncoding;
    }
    const s = (W().character && W().character.rig && W().character.rig.shadow) || {};
    const a = s.material && s.material.color ? s.material.color[3] : 0.56;
    return new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: a, depthWrite: false, color: 0x000000 });
  }

  /*
   * kind: 'player' | 'npc' | 'follow'.  opt: { sheet: [urls], cols: 3|4, rowOf: [hàng cho lên,trái,xuống,phải], shadow }
   */
  class Actor {
    constructor(opt) {
      this.kind = opt.kind || 'npc';
      this.x = opt.x | 0; this.y = opt.y | 0; this.h = opt.h || 0;
      this.face = dirIndex(opt.face == null ? 2 : opt.face);
      this.cols = opt.cols || 3;
      this.rowOf = opt.rowOf || [0, 1, 2, 3];
      this.speed = opt.speed || ((W().character && W().character.moveSpeed && W().character.moveSpeed.value) || 3.25);
      this.move = null;          // { fx, fy, tx, ty, t, dur, jump, done }
      this.stepParity = 0;
      this.frame = 0;
      this.hidden = false;
      this.data = opt.data || null;
      this.name = opt.name || '';

      const rig = (opt.kind === 'follow' ? W().follow : W().character && W().character.rig) || {};
      const so = (rig.spriteOffset && rig.spriteOffset.three) || { pos: [0.5, 0.2, 0.35], euler: [-35, 0, 0] };
      const body = (rig.body && rig.body.three) || { pos: [0, 0.1, 0] };
      const size = (rig.body && rig.body.scale && rig.body.scale[0]) || 2;

      this.root = new THREE.Group();
      this.pivot = new THREE.Group();   // = Sprite Offset
      this.pivot.position.fromArray(so.pos);
      this.pivot.rotation.x = so.euler[0] * Math.PI / 180;
      this.root.add(this.pivot);

      const geo = new THREE.PlaneGeometry(size, size);
      this.uv = geo.attributes.uv;
      const s = sheet(opt.sheet);
      this.mat = new THREE.MeshBasicMaterial({ map: s.tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });
      this.ready = s.ready;
      this.quad = new THREE.Mesh(geo, this.mat);
      this.quad.position.fromArray(body.pos);
      this.quad.renderOrder = 3;
      this.pivot.add(this.quad);

      if (opt.shadow !== false) {
        const sh = (W().character && W().character.rig && W().character.rig.shadow && W().character.rig.shadow.three) || { pos: [0, -0.8, -0.06], euler: [-60, 0, 0] };
        this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), shadowMaterial());
        this.shadow.position.fromArray(sh.pos);
        this.shadow.rotation.x = sh.euler[0] * Math.PI / 180;
        this.shadow.renderOrder = 1;
        this.pivot.add(this.shadow);
      }
      this.place();
      this.setFrame();
    }

    get dirName() { return DIR_NAME[this.face]; }

    setFrame() {
      const col = this.frame, row = this.rowOf[this.face];
      const u0 = col / 4, u1 = (col + 1) / 4, v1 = 1 - row / 4, v0 = 1 - (row + 1) / 4;
      const a = this.uv.array;
      // PlaneGeometry: đỉnh trên-trái, trên-phải, dưới-trái, dưới-phải
      a[0] = u0; a[1] = v1; a[2] = u1; a[3] = v1; a[4] = u0; a[5] = v0; a[6] = u1; a[7] = v0;
      this.uv.needsUpdate = true;
    }

    /* Vị trí đồ hoạ theo ô (và bước đang đi). */
    place() {
      let x = this.x, y = this.y, lift = 0, h = this.h;
      const m = this.move;
      if (m) {
        const k = Math.min(1, m.t / m.dur);
        x = m.fx + (m.tx - m.fx) * k; y = m.fy + (m.ty - m.fy) * k;
        h = m.fh + (m.th - m.fh) * k;
        if (m.jump) lift = Math.sin(Math.PI * k) * JUMP_HEIGHT;
      }
      this.root.position.set(x, h + ROOT_Y, y);
      this.quad.position.y = ((W().character && W().character.rig && W().character.rig.body && W().character.rig.body.three.pos[1]) || 0.1) + lift / Math.cos(0.61);
      this.worldX = x + 0.5; this.worldZ = y + 0.5;
    }

    /* Bắt đầu một bước (hoặc nhảy 2 ô). Trả Promise khi tới nơi. */
    step(dir, opt) {
      opt = opt || {};
      this.face = dirIndex(dir);
      const [dx, dy] = DIR[this.face];
      const n = opt.jump ? 2 : 1;
      const speed = opt.speed || this.speed;
      const dur = n / speed / (opt.jump ? JUMP_TILES_PER_SEC_SCALE : 1);
      let done;
      const p = new Promise(r => { done = r; });
      this.move = { fx: this.x, fy: this.y, tx: this.x + dx * n, ty: this.y + dy * n, fh: this.h, th: opt.toH == null ? this.h : opt.toH, t: 0, dur, jump: !!opt.jump, done };
      this.x += dx * n; this.y += dy * n;
      if (opt.toH != null) this.h = opt.toH;
      this.stepParity ^= 1;
      return p;
    }

    /* Bước tại chỗ khi đâm vào tường (vẫn chạy khung chân). */
    bump(dir) {
      this.face = dirIndex(dir);
      this.bumpT = 1 / this.speed;
      this.stepParity ^= 1;
    }

    update(dt) {
      const m = this.move;
      if (m) {
        m.t += dt;
        const k = m.t / m.dur;
        this.frame = k < STEP_FRAME_SPLIT && !m.jump ? 1 + this.stepParity : m.jump ? 1 + this.stepParity : 0;
        if (m.t >= m.dur) { this.move = null; this.frame = 0; m.done(); }
      } else if (this.bumpT > 0) {
        this.bumpT -= dt;
        this.frame = this.bumpT > 0.5 / this.speed ? 1 + this.stepParity : 0;
        if (this.bumpT <= 0) this.frame = 0;
      }
      if (this.cols === 4 && m) this.frame = Math.floor((m.t / m.dur) * 2 + this.stepParity * 2) % 4;
      this.place();
      this.setFrame();
    }

    teleport(x, y, face, h) {
      this.move = null; this.x = x; this.y = y; if (h != null) this.h = h;
      if (face != null) this.face = dirIndex(face);
      this.frame = 0; this.place(); this.setFrame();
    }

    setTint(c) { this.mat.color.copy(c); }
    setVisible(v) { this.hidden = !v; this.root.visible = v; }
    dispose() { this.quad.geometry.dispose(); this.mat.dispose(); if (this.shadow) { this.shadow.geometry.dispose(); this.shadow.material.dispose(); } }
  }

  function playerActor(opt) {
    const st = P1.state.player || {};
    const layers = P1.look && P1.look.layers ? P1.look.layers(st) : playerLayers(st.look, st.gender);
    return new Actor(Object.assign({ kind: 'player', sheet: layers }, opt));
  }
  function npcActor(file, opt) {
    return new Actor(Object.assign({ kind: 'npc', sheet: ['art/sprite/npc/' + file + '.png'] }, opt));
  }
  /* Pokémon đi theo: lưới 4×4, hàng 0 = mặt (xuống), 1 = trái, 2 = phải, 3 = lưng (README-2d.md). */
  function followActor(dex, shiny, opt) {
    const dir = shiny ? 'follows' : 'follow';
    return new Actor(Object.assign({ kind: 'follow', cols: 4, rowOf: [3, 1, 0, 2], shadow: false,
      sheet: ['art/sprite/poke/' + dir + '/' + dex + '.png'] }, opt));
  }

  /* Bong bóng "!" trên đầu (EmoteAtlas sprite "1", bong bóng phóng 0 -> 1 trong 0,25 s: rip_world). */
  function emote(actor, key) {
    const A = P1.ATLAS && P1.ATLAS.EmoteAtlas;
    const E = (W().emote) || {};
    const name = key || (E.spotted && E.spotted.sprite) || '1';
    if (!A || !A.s[name]) return { update: () => false, dispose() {} };
    const r = A.s[name];
    const tex = P1.texture(A.img);
    const t = tex.clone(); t.needsUpdate = true;
    t.repeat.set(r[2] / A.w, r[3] / A.h);
    t.offset.set(r[0] / A.w, 1 - (r[1] + r[3]) / A.h);
    const w = 0.9, hgt = w * r[3] / r[2];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false }));
    m.renderOrder = 10;
    m.position.set(0, 1.05, 0.05);   // ngay trên đầu nhân vật trong ô 64 px (quad 2×2, tâm ở 0,1), đặt bằng mắt
    actor.pivot.add(m);
    let age = 0;
    const grow = (E.bubble && E.bubble.tweenScale && E.bubble.tweenScale.duration) || 0.25;
    m.scale.setScalar(0.001);
    return {
      update(dt) { age += dt; m.scale.setScalar(Math.min(1, age / grow) || 0.001); return true; },
      dispose() { actor.pivot.remove(m); m.geometry.dispose(); m.material.dispose(); t.dispose(); },
    };
  }

  P1.Actor = Actor;
  P1.actors = { playerActor, npcActor, followActor, emote, DIR, DIR_NAME, dirIndex, sheet, playerLayers };
})(window.P1 = window.P1 || {});
