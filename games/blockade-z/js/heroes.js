// Heroes: seven original fighters, each with an active skill (F / touch button) and a passive.
// Voxel bodies for the pick screen, sleeves and gloves for the first-person arms, and the skill logic.
(() => {
  const BZ = window.BZ;
  const THREE = window.THREE;

  // skill.cd = seconds to recharge one charge; dur = how long an active effect lasts
  const HEROES = [
    { id: 'gio', name: 'Gió', role: 'Lướt nhanh', color: 0x56c8ff, hp: 100, speed: 1.12,
      skill: { key: 'dash', name: 'Lướt', cd: 2.6, charges: 3, desc: 'Lướt 6 m theo hướng đang đi, không mất máu khi lướt, chém trúng mọi zombie trên đường. Giữ 3 lượt, mỗi lượt hồi trong 2,6 giây.' },
      passive: 'Chạy nhanh hơn 12%.',
      look: { skin: 0xe8b58a, hair: 0x2a1a10, eye: 0x1a3050, shirt: 0x2f9ad8, shirt2: 0xe8f4ff, pants: 0x2a3140, boot: 0x1c1c22 } },
    { id: 'thep', name: 'Thép', role: 'Lá chắn', color: 0xffc040, hp: 150, speed: 0.94,
      skill: { key: 'invuln', name: 'Bất tử', cd: 22, dur: 5, desc: 'Trong 5 giây không mất máu, khiên vàng hất văng và đốt zombie chạm vào người.' },
      passive: '150 máu. Giáp tự hồi 2 mỗi giây, tới 50.',
      look: { skin: 0xc8946a, hair: 0x101010, eye: 0x202020, shirt: 0x6a737e, shirt2: 0xffb030, pants: 0x3a3f46, boot: 0x22252a } },
    { id: 'yta', name: 'Y Tá', role: 'Hồi máu', color: 0x60e070, hp: 100, speed: 1,
      skill: { key: 'heal', name: 'Hồi máu', cd: 15, desc: 'Hồi 50 máu ngay, thêm 30 máu trong 4 giây, lính thuê trong 10 m hồi đầy máu.' },
      passive: 'Không trúng đòn 4 giây thì tự hồi 3 máu mỗi giây.',
      look: { skin: 0xf0c8a0, hair: 0x6a3a1a, eye: 0x3a5a20, shirt: 0xf2f2ee, shirt2: 0xe02a2a, pants: 0x7ab0d8, boot: 0xe8e8e8 } },
    { id: 'mua', name: 'Mưa Đạn', role: 'Xả đạn', color: 0xff7a30, hp: 100, speed: 1,
      skill: { key: 'storm', name: 'Bão đạn', cd: 24, dur: 6, desc: 'Trong 6 giây bắn nhanh gấp đôi, không tốn đạn, mỗi phát toả thêm 2 viên đạn lạc. Cầm vũ khí cận chiến thì chém nhanh gấp rưỡi.' },
      passive: 'Nạp đạn nhanh hơn 25%.',
      look: { skin: 0xd8a070, hair: 0x2a1a10, eye: 0x101010, shirt: 0x222222, shirt2: 0xd8322a, pants: 0x55663c, boot: 0x2a2018 } },
    { id: 'bong', name: 'Bóng', role: 'Leo tường', color: 0xb070ff, hp: 90, speed: 1.06, wallRun: true, doubleJump: true,
      skill: { key: 'blink', name: 'Bước bóng', cd: 7, desc: 'Dịch chuyển 9 m về phía trước, để lại một cái bóng làm mồi nhử zombie trong 3 giây.' },
      passive: 'Chạy trên tường, chạy lên tường, đạp tường bật nhảy, nhảy hai lần trên không.',
      look: { skin: 0xe0b090, hair: 0x14101c, eye: 0xc080ff, shirt: 0x1c1826, shirt2: 0x8a40e0, pants: 0x18141e, boot: 0x0e0c12, mask: 0x8a40e0 } },
    { id: 'phao', name: 'Pháo Thủ', role: 'Không kích', color: 0xff4a3a, hp: 110, speed: 0.97,
      skill: { key: 'strike', name: 'Không kích', cd: 28, desc: 'Đánh dấu chỗ đang ngắm, 1 giây sau 6 quả đạn pháo dội xuống quanh đó.' },
      passive: 'Vào trận có 6 bom, bom nổ to hơn 40%.',
      look: { skin: 0xd09a70, hair: 0x3a2a1a, eye: 0x202020, shirt: 0x5a6a3a, shirt2: 0xd85a20, pants: 0x4a5532, boot: 0x2a2418, beard: 0x3a2a1a } },
    { id: 'bang', name: 'Băng', role: 'Đóng băng', color: 0x9ae8ff, hp: 100, speed: 1,
      skill: { key: 'freeze', name: 'Sóng băng', cd: 18, desc: 'Đóng băng mọi zombie trong 9 m suốt 3,5 giây. Con nào chết khi đang đóng băng thì vỡ vụn.' },
      passive: 'Đạn và lưỡi kiếm làm zombie chậm 25% trong 1 giây.',
      look: { skin: 0xf4dcd0, hair: 0xe8f4ff, eye: 0x40e0ff, shirt: 0x8cc8e8, shirt2: 0xf4f8ff, pants: 0x3a5a7a, boot: 0xe8f0f8 } },
  ];
  BZ.HEROES = HEROES;
  const byId = (id) => HEROES.find((h) => h.id === id) || HEROES[3];
  const hx = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // ---------- textures: face, shirt, sleeve and glove per hero ----------
  function textures(h) {
    const L = h.look; const id = h.id;
    BZ.defTex('h_' + id + '_face', 8, 8, ({ set }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, hx(L.skin));
      for (let x = 0; x < 8; x++) { set(x, 0, hx(L.hair)); set(x, 1, hx(L.hair)); }
      set(0, 2, hx(L.hair)); set(7, 2, hx(L.hair));
      for (const ex of [2, 5]) { set(ex, 3, hx(L.eye)); set(ex + (ex < 4 ? -1 : 1), 3, [240, 240, 240]); }
      set(3, 6, shade(hx(L.skin), 0.6)); set(4, 6, shade(hx(L.skin), 0.6));
      if (L.mask) for (let y = 5; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(L.mask), y === 5 ? 1.2 : 1));
      if (L.beard) for (let x = 2; x < 6; x++) set(x, 5, hx(L.beard));
      if (id === 'mua') for (let x = 0; x < 8; x++) set(x, 3, x === 0 || x === 7 ? hx(0x101010) : hx(0x181818));
      if (id === 'thep') { for (let x = 0; x < 8; x++) { set(x, 2, hx(0x5a626c)); set(x, 3, hx(0xffa020)); } }
    }, { noMip: true });
    BZ.defTex('h_' + id + '_hair', 8, 8, ({ set, rng }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(L.hair), rng.chance(0.25) ? 1.25 : 1));
    }, { noMip: true });
    BZ.defTex('h_' + id + '_shirt', 8, 8, ({ set }) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) set(x, y, shade(hx(L.shirt), y === 0 ? 1.15 : 1));
      if (id === 'yta') { for (let i = 2; i < 6; i++) { set(i, 3, hx(L.shirt2)); set(3, i - 1, hx(L.shirt2)); set(4, i - 1, hx(L.shirt2)); } }
      else if (id === 'mua') { for (let i = 0; i < 8; i++) { set(i, i, hx(0x6a4a20)); if (i % 2) set(i, i, hx(0xf2c23a)); } }
      else if (id === 'gio') { for (let y = 0; y < 8; y++) set(3, y, hx(L.shirt2)); for (let x = 0; x < 8; x++) set(x, 6, shade(hx(L.shirt), 0.7)); }
      else if (id === 'thep') { for (let x = 0; x < 8; x++) { set(x, 2, shade(hx(L.shirt), 1.3)); set(x, 5, shade(hx(L.shirt), 0.75)); } set(3, 3, hx(L.shirt2)); set(4, 3, hx(L.shirt2)); }
      else if (id === 'bong') { for (let y = 0; y < 8; y++) { set(y, y, hx(L.shirt2)); } }
      else if (id === 'phao') { for (let x = 0; x < 8; x++) set(x, 5, hx(0x3a2a18)); set(1, 2, hx(0x3a4422)); set(6, 2, hx(0x3a4422)); }
      else if (id === 'bang') { for (let x = 0; x < 8; x++) set(x, 0, hx(L.shirt2)); set(2, 4, hx(0xffffff)); set(5, 2, hx(0xffffff)); }
    }, { noMip: true });
    BZ.defTex('h_' + id + '_sleeve', 16, 16, ({ set, rng }) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, shade(hx(L.shirt), 1 + (rng.next() - 0.5) * 0.12 + ((x + y) % 7 === 0 ? -0.12 : 0)));
      if (id === 'yta') for (let x = 0; x < 16; x++) { set(x, 3, hx(L.shirt2)); }
      if (id === 'gio' || id === 'bong' || id === 'phao') for (let x = 0; x < 16; x++) set(x, 12, hx(L.shirt2));
    });
    BZ.defTex('h_' + id + '_glove', 4, 4, ({ set }) => {
      const g = id === 'yta' ? 0xe8f0f4 : id === 'bang' ? 0xd8f0ff : id === 'thep' ? 0x5a626c : L.boot;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) set(x, y, shade(hx(g), y === 3 ? 1.25 : x === 0 ? 1.1 : 1));
    }, { noMip: true });
  }

  // ---------- voxel body: hips / legs / torso / arms / head as separate pivots so it can pose ----------
  function heroModel(h) {
    textures(h);
    const L = h.look; const C = (c) => BZ.cellTex(c); const id = h.id;
    const part = (name, boxes) => {
      const B = new BZ.Builder('hero:' + id + ':' + name);
      for (const [a, b, m] of boxes) B.box(a, b, m, { uv: 'fit', vary: 0 });
      const matOpts = {}; matOpts[C(0x60e8ff)] = { emissive: 0x40c8ff }; matOpts[C(0xc080ff)] = { emissive: 0x9040ff }; matOpts[C(0xffa020)] = { emissive: 0xff8010 };
      return B.build({ cast: true, matOpts });
    };
    const shirt = 'h_' + id + '_shirt'; const face = { pz: 'h_' + id + '_face', side: 'h_' + id + '_hair', top: 'h_' + id + '_hair', bottom: C(L.skin) };
    const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const hips = new THREE.Group(); hips.position.y = 0.75; root.add(hips);
    const bulk = id === 'thep' ? 0.04 : 0;
    const leg = (x) => { const g = new THREE.Group(); g.position.x = x; g.add(part('leg', [[[-0.13 - bulk, -0.75, -0.13 - bulk], [0.13 + bulk, 0.02, 0.13 + bulk], C(L.pants)], [[-0.14 - bulk, -0.75, -0.16 - bulk], [0.14 + bulk, -0.6, 0.15 + bulk], C(L.boot)]])); hips.add(g); return g; };
    const legL = leg(-0.13); const legR = leg(0.13);
    const torsoBoxes = [[[-0.26 - bulk, 0, -0.15 - bulk], [0.26 + bulk, 0.7, 0.15 + bulk], { pz: shirt, side: C(L.shirt), top: C(L.shirt), bottom: C(L.pants) }], [[-0.27 - bulk, -0.02, -0.16 - bulk], [0.27 + bulk, 0.08, 0.16 + bulk], C(0x2a2018)]];
    const extra = [];
    if (id === 'yta') extra.push([[0.2, 0.0, -0.1], [0.36, 0.2, 0.12], C(0xe02a2a)], [[0.22, 0.07, 0.12], [0.34, 0.13, 0.13], C(0xffffff)]);
    if (id === 'mua') extra.push([[-0.27, 0.06, -0.17], [0.27, 0.12, 0.17], C(0x6a4a20)], [[-0.24, 0.07, 0.17], [-0.16, 0.11, 0.18], C(0xf2c23a)], [[-0.08, 0.07, 0.17], [0.0, 0.11, 0.18], C(0xf2c23a)], [[0.08, 0.07, 0.17], [0.16, 0.11, 0.18], C(0xf2c23a)]);
    if (id === 'phao') extra.push([[-0.22, 0.12, -0.38], [0.22, 0.62, -0.15], C(0xd85a20)], [[-0.18, 0.2, -0.4], [0.18, 0.5, -0.38], C(0x8a3a10)], [[0.12, 0.62, -0.3], [0.15, 1.15, -0.27], C(0x2a2a2a)], [[0.11, 1.13, -0.31], [0.16, 1.17, -0.26], C(0xff4a3a)]);
    if (id === 'thep') extra.push([[-0.42, 0.5, -0.2], [-0.24, 0.74, 0.2], C(0x7a8490)], [[0.24, 0.5, -0.2], [0.42, 0.74, 0.2], C(0x7a8490)], [[-0.43, 0.7, -0.21], [-0.23, 0.74, 0.21], C(0xffb030)], [[0.23, 0.7, -0.21], [0.43, 0.74, 0.21], C(0xffb030)]);
    if (id === 'bang') extra.push([[-0.3, 0.6, -0.18], [0.3, 0.76, 0.18], C(0xf4f8ff)], [[-0.36, 0.62, -0.05], [-0.28, 0.8, 0.05], C(0x60e8ff)], [[0.28, 0.66, -0.04], [0.34, 0.86, 0.04], C(0x60e8ff)]);
    if (id === 'gio') extra.push([[-0.24, 0.55, -0.2], [0.24, 0.72, -0.15], C(L.shirt2)]);
    const torso = part('torso', torsoBoxes.concat(extra)); hips.add(torso);
    const arm = (x) => {
      const g = new THREE.Group(); g.position.set(x, 0.64, 0);
      const boxes = [[[-0.1 - bulk, -0.62, -0.1 - bulk], [0.1 + bulk, 0.06, 0.1 + bulk], C(L.shirt)], [[-0.105 - bulk, -0.7, -0.105 - bulk], [0.105 + bulk, -0.5, 0.105 + bulk], 'h_' + id + '_glove']];
      if (id === 'mua') boxes.splice(0, 1, [[-0.1, -0.62, -0.1], [0.1, -0.2, 0.1], C(L.skin)], [[-0.105, -0.2, -0.105], [0.105, 0.06, 0.105], C(L.shirt)]);
      g.add(part('arm', boxes)); hips.add(g); return g;
    };
    const armL = arm(-0.36); const armR = arm(0.36);
    const head = new THREE.Group(); head.position.y = 0.7; hips.add(head);
    const hb = [[[-0.25, 0, -0.25], [0.25, 0.5, 0.25], face]];
    if (id === 'gio') hb.push([[-0.26, 0.36, -0.26], [0.26, 0.42, 0.26], C(0xf4f8ff)], [[-0.06, 0.32, -0.6], [0.0, 0.4, -0.26], C(0xf4f8ff)], [[0.02, 0.28, -0.52], [0.08, 0.36, -0.26], C(0xf4f8ff)], [[-0.2, 0.42, 0.18], [0.2, 0.5, 0.27], C(0x60e8ff)]);
    if (id === 'thep') hb.push([[-0.28, 0.2, -0.28], [0.28, 0.58, 0.28], { pz: C(0x5a626c), side: C(0x6a737e), top: C(0x7a8490), bottom: C(0x5a626c) }], [[-0.22, 0.3, 0.28], [0.22, 0.36, 0.29], C(0xffa020)]);
    if (id === 'yta') hb.push([[-0.24, 0.5, -0.2], [0.24, 0.62, 0.22], C(0xf2f2ee)], [[-0.04, 0.52, 0.22], [0.04, 0.6, 0.23], C(0xe02a2a)], [[-0.09, 0.55, 0.22], [0.09, 0.57, 0.23], C(0xe02a2a)]);
    if (id === 'mua') hb.push([[-0.26, 0.4, -0.26], [0.26, 0.5, 0.26], C(0xd8322a)], [[-0.04, 0.38, -0.46], [0.04, 0.46, -0.26], C(0xd8322a)]);
    if (id === 'bong') hb.push([[-0.27, 0.26, -0.27], [0.27, 0.54, 0.27], { pz: C(0x14101c), side: C(0x14101c), top: C(0x14101c), bottom: C(0x14101c) }], [[-0.06, 0.1, -0.7], [0.06, 0.2, -0.26], C(0x8a40e0)]);
    if (id === 'phao') hb.push([[-0.29, 0.38, -0.29], [0.29, 0.56, 0.29], C(0x4a5532)], [[-0.22, 0.42, 0.27], [0.22, 0.5, 0.31], C(0x2a2a2a)], [[-0.18, 0.43, 0.3], [-0.04, 0.49, 0.32], C(0x60e8ff)], [[0.04, 0.43, 0.3], [0.18, 0.49, 0.32], C(0x60e8ff)]);
    if (id === 'bang') hb.push([[-0.3, -0.02, -0.3], [0.3, 0.56, -0.2], C(0xf4f8ff)], [[-0.3, 0.46, -0.3], [0.3, 0.58, 0.28], C(0xf4f8ff)], [[-0.3, -0.02, -0.3], [-0.24, 0.56, 0.28], C(0xf4f8ff)], [[0.24, -0.02, -0.3], [0.3, 0.56, 0.28], C(0xf4f8ff)]);
    head.add(part('head', hb));
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { root, hips, legL, legR, armL, armR, head, torso };
  }
  BZ.heroModel = (id) => heroModel(byId(id));

  BZ.makeHeroes = (G) => {
    const H = { def: byId('mua'), charges: 1, cd: 0, t: {}, decoy: null, strikes: [] };
    const V = () => new THREE.Vector3();
    const P = () => G.player;

    // ---------- pick ----------
    function set(id) {
      const h = byId(id); H.def = h; H.id = h.id;
      for (const x of HEROES) textures(x);
      // first-person sleeves and gloves take the hero's outfit
      for (const m of Object.values(G.weapons.models || {})) {
        for (const k of ['handR', 'handL']) {
          const a = m.userData.parts[k]; if (!a) continue;
          a.traverse((o) => {
            if (!o.isMesh) return;
            const nm = o.userData.base || (o.userData.base = (o.material.map && o.material.map.name) || '');
            if (nm === 'bz_sleeve') { o.material.map = BZ.tex('h_' + h.id + '_sleeve'); o.material.needsUpdate = true; }
            if (nm === 'bz_glove') { o.material.map = BZ.tex('h_' + h.id + '_glove'); o.material.needsUpdate = true; }
          });
        }
      }
    }
    function reset() {
      const h = H.def; const p = P();
      p.maxHp = h.hp; p.hp = h.hp;
      H.charges = h.skill.charges || 1; H.cd = 0; H.t = {}; H.decoy && G.scene.remove(H.decoy.g); H.decoy = null; H.strikes.length = 0; H.hurtT = 9;
      G.gear.state.bombs = h.id === 'phao' ? 6 : G.gear.state.bombs;
      ring.visible = false; strikeMark.visible = false;
    }
    const speedMul = () => H.def.speed || 1;
    const invuln = () => (H.t.invuln || 0) > 0 || (H.t.dash || 0) > 0;
    const storm = () => (H.t.storm || 0) > 0;

    // ---------- skill use ----------
    function use() {
      const p = P(); const h = H.def; const k = h.skill.key;
      if (!p.alive || G.state !== 'playing') return false;
      if (H.charges <= 0) { G.audio.play('deny', { gain: 0.5 }); return false; }
      const ok = SKILLS[k]();
      if (!ok) return false;
      H.charges--; if (H.cd <= 0) H.cd = h.skill.cd * G.build.cdMul();
      if (G.build.has('overload')) G.gear.explode(G.player.pos.clone().setY(G.player.pos.y + 0.8), 4, 80);
      G.events.emit('skill', { hero: h.id, key: k });
      return true;
    }
    const cam = () => { const c = G.camera; c.updateMatrixWorld(); return c; };
    const SKILLS = {
      dash() {
        const p = P(); const i = p.input;
        let dx = -Math.sin(p.yaw) * i.fwd + Math.cos(p.yaw) * i.side; let dz = -Math.cos(p.yaw) * i.fwd - Math.sin(p.yaw) * i.side;
        const l = Math.hypot(dx, dz); if (l < 0.1) { dx = -Math.sin(p.yaw); dz = -Math.cos(p.yaw); } else { dx /= l; dz /= l; }
        H.t.dash = 0.24; H.dashDir = [dx, dz]; H.dashHit = new Set();
        p.vel.set(dx * 25, Math.max(p.vel.y, 1.5), dz * 25);
        G.audio.play('heavy', { gain: 0.8, rate: 1.4 }); G.audio.play('slash', { gain: 0.6, rate: 0.8 });
        p.shake.v += 2; overlay('cyan', 0.25);
        return true;
      },
      invuln() { H.t.invuln = H.def.skill.dur; G.audio.play('saber_on', { gain: 0.9, rate: 0.7 }); G.audio.play('buy', { gain: 0.6 }); overlay('gold', H.def.skill.dur); ring.visible = true; return true; },
      heal() {
        const p = P(); p.hp = Math.min(p.maxHp, p.hp + 50); H.t.heal = 4;
        for (const a of G.allies.list) if (a.alive && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 10) { a.hp = BZ.ALLY.hp; G.fx.burst(V().set(a.pos.x, 1.2, a.pos.z), 10, [0x60e070, 0xc0ffc0], { speed: 2, size: 0.1, life: 1, grav: -3 }); }
        G.fx.burst(V().set(p.pos.x, p.pos.y + 0.8, p.pos.z), 26, [0x60e070, 0xc0ffc0, 0xffffff], { speed: 3, size: 0.1, life: 1.2, grav: -3, drag: 1 });
        G.audio.play('pickup', { gain: 0.9, rate: 1.2 }); G.ui.pop('+50 máu', 'heal'); overlay('green', 0.9);
        return true;
      },
      storm() { H.t.storm = H.def.skill.dur; G.audio.play('streak', { gain: 0.7 }); G.audio.play('rack', { gain: 0.9 }); overlay('orange', H.def.skill.dur); return true; },
      blink() {
        const p = P(); const c = cam();
        const o = V().set(p.pos.x, p.pos.y + 1.0, p.pos.z); const d = V().set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        const wh = G.world.raycast(o, d, 9); let t = wh ? Math.max(0, wh.t - 0.6) : 9;
        const at = V(); let ok = false;
        for (; t > 0.5; t -= 0.4) {
          at.set(p.pos.x + d.x * t, p.pos.y, p.pos.z + d.z * t);
          if (!G.world.overlaps([at.x - 0.3, at.y + 0.05, at.z - 0.3], [at.x + 0.3, at.y + 1.7, at.z + 0.3])) { ok = true; break; }
        }
        if (!ok) { G.audio.play('deny', { gain: 0.5 }); return false; }
        const from = p.pos.clone();
        const puff = (q) => G.fx.burst(V().set(q.x, q.y + 1, q.z), 22, [0x8a40ff, 0xc080ff, 0x2a1a4a], { speed: 3.5, size: 0.14, life: 0.7, grav: -1.5, drag: 1.5 });
        puff(from); p.pos.copy(at); p.vel.set(d.x * 4, Math.max(0, p.vel.y), d.z * 4); puff(at);
        G.audio.play('screech', { gain: 0.35, rate: 1.8 }); G.audio.play('heavy', { gain: 0.6, rate: 1.6 });
        // the shadow left behind pulls zombies for a few seconds
        if (H.decoy) G.scene.remove(H.decoy.g);
        const m = heroModel(H.def); m.root.position.copy(from); m.root.rotation.y = p.yaw + Math.PI;
        m.root.traverse((q) => { if (q.isMesh) { q.material = q.material.clone(); q.material.transparent = true; q.material.opacity = 0.55; q.material.emissive = new THREE.Color(0x5020a0); q.castShadow = false; } });
        G.scene.add(m.root); H.decoy = { g: m.root, m, pos: m.root.position, t: 3, alive: true, isDecoy: true };
        overlay('purple', 0.3); c.fov += 0;
        return true;
      },
      strike() {
        const c = cam(); const o = V(); const d = V(); c.getWorldPosition(o); c.getWorldDirection(d);
        const wh = G.world.raycast(o, d, 70); const zh = G.zombies.hitTest(o, d, wh ? wh.t : 70);
        const t = zh ? zh.t : wh ? wh.t : 40; const at = o.clone().addScaledVector(d, t);
        at.y = Math.max(0, at.y - (zh ? 1 : 0));
        strikeMark.position.set(at.x, at.y + 0.05, at.z); strikeMark.visible = true; H.strikeAt = at; H.t.strike = 1.0; H.strikes.length = 0;
        if ((G.coop && G.coop.guest)) { G.coop.act({ k: 'strike', at: G.coop.v3(at) }); setTimeout(() => { strikeMark.visible = false; }, 2200); } else strikeAt(at);
        G.audio.play('wave_start', { gain: 0.5, rate: 1.6 }); G.audio.play('marker', { gain: 1 });
        return true;
      },
      freeze() {
        const p = P(); let n = 0;
        if ((G.coop && G.coop.guest)) { G.coop.act({ k: 'freeze', p: G.coop.v3(p.pos) }); n = G.zombies.list.filter((z) => z.alive && Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 9).length; } else n = freezeAt(p.pos);
        // a ring of ice shards rolling outward
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2;
          G.fx.burst(V().set(p.pos.x + Math.cos(a) * 1.2, p.pos.y + 0.4, p.pos.z + Math.sin(a) * 1.2), 1, [0xbfefff, 0x60d8ff, 0xffffff], { dir: V().set(Math.cos(a), 0.15, Math.sin(a)), push: 12, speed: 1, size: 0.14, life: 0.8, grav: 2, drag: 1.2, bounce: 0 });
        }
        G.audio.play('saber_hit', { gain: 1, rate: 1.8 }); G.audio.play('clank', { gain: 0.8, rate: 1.6 }); overlay('blue', 0.6);
        G.ui.pop(n ? `đóng băng ${n}` : 'không có zombie gần', 'heal');
        return true;
      },
    };

    // golden shell around the player while invulnerable; red target ring for the air strike
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.visible = false; G.scene.add(ring);
    const strikeMark = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    strikeMark.visible = false; G.scene.add(strikeMark);
    const fxEl = document.getElementById('skillfx'); let fxT = 0;
    function overlay(kind, secs) { if (!fxEl) return; fxEl.className = 'on ' + kind; fxT = secs; }

    function update(dt) {
      const p = P(); const h = H.def;
      // charges come back one at a time
      if (H.charges < (h.skill.charges || 1)) { H.cd -= dt; if (H.cd <= 0) { H.charges++; H.cd = H.charges < (h.skill.charges || 1) ? h.skill.cd * G.build.cdMul() : 0; if (H.charges === (h.skill.charges || 1)) G.audio.play('marker', { gain: 0.5, rate: 0.7 }); } }
      for (const k of Object.keys(H.t)) H.t[k] = Math.max(0, H.t[k] - dt);
      if (fxT > 0) { fxT -= dt; if (fxT <= 0 && fxEl) fxEl.className = ''; }
      H.hurtT = (H.hurtT || 0) + dt;
      // passives
      if (h.id === 'thep' && p.alive && p.armor < 50) p.armor = Math.min(50, p.armor + 2 * dt);
      if (h.id === 'yta' && p.alive && H.hurtT > 4 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 3 * dt);
      if (H.t.heal > 0 && p.alive) p.hp = Math.min(p.maxHp, p.hp + 7.5 * dt);
      // dash: keep the burst going, cut through whatever is in the way
      if (H.t.dash > 0) {
        const [dx, dz] = H.dashDir; p.vel.x = dx * 25; p.vel.z = dz * 25;
        if (G.rng.chance(0.8)) G.fx.burst(V().set(p.pos.x, p.pos.y + 1, p.pos.z), 2, [0x9ae8ff, 0xffffff, 0x56c8ff], { speed: 0.6, size: 0.1, life: 0.35, grav: 0, drag: 2, bounce: 0 });
        for (const z of G.zombies.list) {
          if (!z.alive || H.dashHit.has(z)) continue;
          if (Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 1.4 * z.T.scale && Math.abs(z.pos.y - p.pos.y) < 1.5) {
            H.dashHit.add(z);
            const died = G.zombies.damage(z, 70, 'body', V().set(dx, 0, dz), 2, { cut: 'blade' });
            G.events.emit('hit', { z, dmg: 70, part: 'body', died, crit: false, melee: true });
            G.audio.playAt('chop', z.pos, { gain: 0.8 }); G.hitStop = Math.max(G.hitStop || 0, 0.035);
          }
        }
        if (H.t.dash <= 0) { p.vel.x *= 0.3; p.vel.z *= 0.3; }
      }
      // invulnerable: shell follows the player, zombies that touch it are thrown back and burned
      ring.visible = H.t.invuln > 0;
      if (ring.visible) {
        ring.position.set(p.pos.x, p.pos.y + 0.9 + Math.sin(performance.now() / 120) * 0.5, p.pos.z); ring.rotation.y += dt * 4;
        ring.material.opacity = H.t.invuln < 1 ? (Math.sin(performance.now() / 60) > 0 ? 0.8 : 0.2) : 0.8;
        H.auraT = (H.auraT || 0) - dt;
        for (const z of G.zombies.list) {
          if (!z.alive) continue;
          const dx = z.pos.x - p.pos.x; const dz = z.pos.z - p.pos.z; const d = Math.hypot(dx, dz);
          if (d < 1.6 * z.T.scale && Math.abs(z.pos.y - p.pos.y) < 1.5) {
            z.vel.x += (dx / (d || 1)) * 9 * dt * 10; z.vel.z += (dz / (d || 1)) * 9 * dt * 10;
            if (H.auraT <= 0) { const died = G.zombies.damage(z, 12, 'body', V().set(dx, 0, dz).normalize(), 1.5); G.events.emit('hit', { z, dmg: 12, part: 'body', died }); G.fx.burst(V().set(z.pos.x, z.pos.y + 1, z.pos.z), 6, [0xffd060, 0xffa030], { speed: 2, size: 0.07, life: 0.4 }); }
          }
        }
        if (H.auraT <= 0) H.auraT = 0.4;
      }
      // decoy shadow
      if (H.decoy) {
        H.decoy.t -= dt; const m = H.decoy.m; const k = Math.sin(performance.now() / 90);
        m.armL.rotation.x = -0.4 + k * 0.2; m.armR.rotation.x = -0.4 - k * 0.2;
        if (H.decoy.t <= 0) { G.fx.burst(V().set(H.decoy.pos.x, H.decoy.pos.y + 1, H.decoy.pos.z), 16, [0x8a40ff, 0x2a1a4a], { speed: 2.5, size: 0.12, life: 0.6, grav: -1 }); G.scene.remove(H.decoy.g); H.decoy = null; }
      }
      // air strike: shells fall one after another onto the marked area
      if (strikeMark.visible) { strikeMark.rotation.y += dt * 2; strikeMark.material.opacity = 0.5 + Math.sin(performance.now() / 70) * 0.3; }
      for (let i = H.strikes.length - 1; i >= 0; i--) {
        const s = H.strikes[i]; s.t -= dt;
        if (s.t <= 0) { H.strikes.splice(i, 1); G.gear.fireRocket(V().set(s.x + G.rng.range(-2, 2), s.y + 26, s.z + 6), V().set(G.rng.range(-0.08, 0.08), -1, -0.22).normalize()); if (!H.strikes.length) setTimeout(() => { strikeMark.visible = false; }, 600); }
      }
    }
    // the player's jump in the air: wall jump off a wall, else one extra jump (Bóng only)
    function airJump(p, wallN) {
      if (!H.def.doubleJump) return false;
      const V3 = V();
      if (wallN) {
        p.vel.x = wallN[0] * 7 + p.vel.x * 0.4; p.vel.z = wallN[1] * 7 + p.vel.z * 0.4; p.vel.y = 8.6; p.wallT = 0; p.jumps = 0;
        G.fx.burst(V3.set(p.pos.x - wallN[0] * 0.3, p.pos.y + 1, p.pos.z - wallN[1] * 0.3), 10, [0xc080ff, 0x8a40ff, 0xd0d0d0], { speed: 2, size: 0.08, life: 0.4 });
        G.audio.play('land', { gain: 0.5, rate: 1.4 }); return true;
      }
      if ((p.jumps || 0) < 1) {
        p.jumps = (p.jumps || 0) + 1; p.vel.y = 7.6;
        G.fx.burst(V3.set(p.pos.x, p.pos.y + 0.1, p.pos.z), 12, [0xc080ff, 0x8a40ff, 0xffffff], { speed: 2.5, size: 0.08, life: 0.4, grav: 0, drag: 2 });
        G.audio.play('swipe', { gain: 0.5, rate: 1.5 }); return true;
      }
      return false;
    }
    function onHurt() { H.hurtT = 0; }
    // skills that change zombies run on the host; a guest's freeze and air strike arrive here as actions
    function freezeAt(pos) {
      let n = 0;
      for (const z of G.zombies.list) { if (!z.alive) continue; if (Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z) < 9 && Math.abs(z.pos.y - pos.y) < 6) { z.frozen = z.T.boss ? 1.4 : 3.5; z.vel.set(0, 0, 0); n++; } }
      return n;
    }
    function strikeAt(at) { for (let i = 0; i < 6; i++) H.strikes.push({ t: 1.0 + i * 0.14, x: at.x + G.rng.range(-3.5, 3.5), z: at.z + G.rng.range(-3.5, 3.5), y: at.y }); }
    return Object.assign(H, { HEROES, set, reset, use, update, freezeAt, strikeAt, speedMul, invuln, storm, airJump, onHurt, byId,
      reloadMul: () => (H.def.id === 'mua' ? 1.25 : 1), bombMul: () => (H.def.id === 'phao' ? 1.4 : 1), chill: () => H.def.id === 'bang',
      ready: () => H.charges > 0, cdFrac: () => (H.charges >= (H.def.skill.charges || 1) ? 0 : H.cd / (H.def.skill.cd * G.build.cdMul())) });
  };
})();
