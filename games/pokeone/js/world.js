/*
 * Cảnh bản đồ: P1.scene.add('world', …). Đi theo ô 4 hướng như CharacterHandler gốc (MoveSpeed 3,25 ô/s),
 * máy ảnh nghiêng 45° bám người chơi (GameCamera: offset (0, 14, 14,5), fov 30), NPC, trainer nhìn thấy (LOS),
 * cỏ cao gặp Pokémon, gờ nhảy, cửa nối, Pokémon đi theo, ngày/đêm.
 *
 *   mode: 'loading' | 'explore' | 'script' | 'warp' | 'battle'   (menus.js chỉ mở menu Esc khi 'explore')
 *
 * Dữ liệu: P1.MAPS / P1.SCRIPTS / P1.QUESTS (data/maps.js, tools/build_maps.js), P1.WORLD (data/world.js,
 * tools/rip_world.py). Luật và nguồn: tools/README-world.md.
 */
(function (P1) {
  'use strict';

  const A = () => P1.actors;
  const WD = () => P1.WORLD || {};
  const DIR = [[0, -1], [-1, 0], [0, 1], [1, 0]];
  const DIR_OF = { up: 0, left: 1, down: 2, right: 3 };
  const OPP = [2, 3, 0, 1];
  const COLL = { free: 0, solid: 1, down: 2, left: 3, right: 4, up: 5, counter: 6 };
  const LEDGE_DIR = { 2: 2, 3: 1, 4: 3, 5: 0 };

  // [MAINLINE DEFAULT, not PokéOne-confirmed] xác suất gặp mỗi bước trong cỏ: FRLG Route 1 = 21/180 ≈ 11,7 %.
  const ENCOUNTER_RATE = { normal: 0.117, low: 0.06, verylow: 0.03 };
  const TURN_DELAY = 0.09;          // chạm nhẹ thì chỉ quay mặt (như HGSS); giữ quá ngưỡng này thì đi. Đặt tay.
  const BUMP_COOLDOWN = 0.35;
  const LOOK_RANDOM = [1.5, 4.5];   // giây giữa hai lần NPC nhìn quanh. Đặt tay (LookRandomly không có số trong máy khách).

  /*
   * Màu môi trường theo buổi. MapManager.EnviromentColours có 7 màu không nhãn (rip_world); gán theo màu là [SUY RA]:
   * [2] trắng = ngày, [3] xám sáng = sáng sớm, [4] cam = chiều, [5] lam = đêm.
   */
  function envColour(period, indoors) {
    const E = (WD().light && WD().light.environmentColours && WD().light.environmentColours.value) || [];
    const pick = indoors ? E[2] : { morning: E[3], day: E[2], evening: E[4], night: E[5] }[period];
    return new THREE.Color().setRGB(...(pick || [1, 1, 1]).slice(0, 3));
  }

  function heldDir(input, prefer) {
    const h = input.held;
    if (prefer >= 0 && h[['up', 'left', 'down', 'right'][prefer]]) return prefer;
    if (h.up) return 0; if (h.down) return 2; if (h.left) return 1; if (h.right) return 3;
    return -1;
  }

  /* ---------------------------------------------------------------- hạt (lá cỏ, bụi đáp) */
  const fxTex = {};
  function fxTexture(url) {
    if (!fxTex[url]) { fxTex[url] = new THREE.TextureLoader().load(url); fxTex[url].encoding = THREE.sRGBEncoding; }
    return fxTex[url];
  }
  /* Đọc hệ hạt đầu tiên của P1.WORLD.fx[key] (Special Grass / Dust Effect) và phát một đợt. */
  function burst(scene, key, x, y, z, count) {
    const sys = WD().fx && WD().fx[key] && WD().fx[key].systems && WD().fx[key].systems[0];
    const main = (sys && sys.main) || {};
    const val = v => (v && v.value != null ? v.value : v && v.max != null ? (v.min + v.max) / 2 : 0);
    const life = val(main.startLifetime) || 0.8, speed = val(main.startSpeed) || 3.5, size = val(main.startSize) || 0.25;
    const grav = (val(main.gravityModifier) || 0) * 9.81;
    const img = (sys && sys.renderer && sys.renderer.materials && sys.renderer.materials[0] && sys.renderer.materials[0].img) || 'art/fx/CFX3_T_Leaf.png';
    const cmin = main.startColor && main.startColor.min, cmax = main.startColor && main.startColor.max, c1 = main.startColor && main.startColor.color;
    const cone = sys && sys.shape && sys.shape.angle != null ? sys.shape.angle * Math.PI / 180 : 0.1;
    const parts = [];
    const tex = fxTexture(img);
    for (let i = 0; i < count; i++) {
      const col = cmin && cmax ? cmin.map((v, k) => v + (cmax[k] - v) * Math.random()) : c1 || [1, 1, 1, 1];
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(col[0], col[1], col[2]), transparent: true, depthWrite: false }));
      m.scale.setScalar(size * 2);
      m.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
      const a = Math.random() * Math.PI * 2, s = Math.sin(cone * (0.5 + Math.random()) + 0.25);
      m.userData.v = new THREE.Vector3(Math.cos(a) * s * speed, speed * (0.6 + 0.4 * Math.random()), Math.sin(a) * s * speed);
      m.userData.rot = (Math.random() - 0.5) * 4;
      scene.add(m);
      parts.push(m);
    }
    let age = 0;
    return {
      update(dt) {
        age += dt;
        for (const m of parts) {
          m.userData.v.y -= grav * dt;
          m.position.addScaledVector(m.userData.v, dt);
          m.material.rotation += m.userData.rot * dt;
          m.material.opacity = Math.max(0, 1 - Math.max(0, age / life - 0.75) * 4);
        }
        return age < life;
      },
      dispose() { for (const m of parts) { scene.remove(m); m.material.dispose(); } },
    };
  }

  /* ---------------------------------------------------------------- cảnh */
  const world = {
    mode: '',
    map: null, gfx: null, scene: null, camera: null, player: null, follower: null,
    actors: [], fx: [], t: 0, turnHold: 0, bumpCd: 0, lookT: {}, loaded: false,
    debug: { encounterRate: null, noEncounter: false, forceSpecies: null },

    /* ------------------------------------------------ vào / ra */
    async enter(args) {
      args = args || {};
      const ui = P1.worldUi;
      ui.mount();
      if (!this.hud && P1.ui && P1.ui.hud) this.hud = P1.ui.hud();
      ui.pad.show();
      this.showHud(true);
      if (args.resume && this.loaded) {
        this.mode = this.resumeMode || 'explore';
        this.playMapMusic();
        if (this.onResume) { const f = this.onResume; this.onResume = null; f(); }
        return;
      }
      this.mode = 'loading';
      if (!this.scene) this.initScene();
      const st = P1.state;
      if (!P1.MAPS[st.map]) st.map = 'pallet_house_2f';
      const M = P1.MAPS[st.map];
      let x = st.x, y = st.z;
      const bad = !(x >= 0 && y >= 0 && x < M.w && y < M.h) || this.blocked(M, x, y);
      if ((args.intro || bad || !st.flags.intro) && M.settings.spawn) [x, y] = M.settings.spawn;
      else if (bad) [x, y] = this.nearestFree(M, M.w >> 1, M.h >> 1);
      await this.loadMap(st.map, x, y, st.face == null ? 2 : st.face);
      this.loaded = true;
      ui.fade.to(0, 1);
      await this.afterArrive(true);
    },

    exit(next) {
      if (next === 'battle') {
        this.resumeMode = this.mode;   // 'battle': mã đang chờ trận xong sẽ tự đặt lại mode
        P1.worldUi.pad.off();
        this.showHud(false);   // HUD gốc ẩn trong trận ('Widget - Hidden During Battle Or Script', TeamPreviewHandler.HideWidgets)
        return;
      }
      this.saveState();
      this.unloadMap();
      if (this.hud) { this.hud.destroy(); this.hud = null; }
      P1.worldUi.unmount();
      this.loaded = false;
      this.mode = '';
    },

    showHud(on) {
      const r = this.hud && this.hud.view && this.hud.view.root;
      if (r) r.style.display = on ? '' : 'none';
    },

    initScene() {
      const scene = this.scene = new THREE.Scene();
      const C = WD().camera || {};
      const cc = C.clearColor || [0.6887, 0.6887, 0.6887];
      this.clear = new THREE.Color(cc[0], cc[1], cc[2]);
      scene.background = this.clear.clone();
      const fov = C.fov || 30;
      this.camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, C.near || 0.3, C.far || 56);
      this.camera.rotation.set(-45 * Math.PI / 180, 0, 0);
      const L = WD().light || {};
      const amb = (L.ambient && L.ambient.color) || [0.412, 0.412, 0.412];
      this.ambient = new THREE.AmbientLight(new THREE.Color(amb[0], amb[1], amb[2]), 1);
      scene.add(this.ambient);
      this.sun = new THREE.DirectionalLight(0xffffff, (L.sun && L.sun.intensity) || 0.7);
      const d = (L.sun && L.sun.three && L.sun.three.dir) || [0, -0.7071, -0.7071];
      this.sunDir = new THREE.Vector3().fromArray(d).normalize();
      scene.add(this.sun, this.sun.target);
      this.camTarget = new THREE.Vector3();
      this.onResize = () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); };
      window.addEventListener('resize', this.onResize);
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

    async loadMap(id, x, y, face) {
      const M = P1.MAPS[id];
      if (!M) throw new Error('map not found: ' + id);
      this.unloadMap();
      this.map = M;
      P1.state.map = id;
      if (M.settings.song) P1.audio.music(M.settings.song);   // đổi nhạc ngay, không chờ tải glb qua mạng
      const token = this.loadToken = (this.loadToken || 0) + 1;
      const gfx = await P1.worldMap.build(M);
      if (token !== this.loadToken) { gfx.dispose(); return; }   // một lần tải mới hơn đã thay map này
      this.gfx = gfx;
      this.scene.add(this.gfx.group);
      if (P1.query && P1.query.get('grid') === '1') this.scene.add(this.gridMesh = P1.worldMap.debugOverlay(M));
      this.skirt = this.buildSkirt(M);
      if (this.skirt) this.scene.add(this.skirt);
      this.scene.background = M.settings.indoors ? new THREE.Color(0, 0, 0) : this.clear.clone();

      this.player = A().playerActor({ x, y, face, h: M.heights[y * M.w + x] });
      this.scene.add(this.player.root);
      this.refreshFollower(true);
      this.actors = [];
      for (const d of M.npcs) this.addActor(d);
      this.refreshActors();
      await Promise.all([this.player.ready].concat(this.actors.map(a => a.ready)));
      this.applyLight();
      this.snapCamera();
      P1.state.x = x; P1.state.z = y; P1.state.face = face;
    },

    unloadMap() {
      for (const f of this.fx) f.dispose();
      this.fx = [];
      if (this.gfx) { this.scene.remove(this.gfx.group); this.gfx.dispose(); this.gfx = null; }
      if (this.gridMesh) { this.scene.remove(this.gridMesh); this.gridMesh = null; }
      if (this.skirt) {
        this.scene.remove(this.skirt);
        this.skirt.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
        this.skirt = null;
      }
      for (const a of this.actors) { this.scene.remove(a.root); a.dispose(); }
      this.actors = [];
      if (this.player) { this.scene.remove(this.player.root); this.player.dispose(); this.player = null; }
      if (this.follower) { this.scene.remove(this.follower.root); this.follower.dispose(); this.follower = null; }
      P1.worldUi.showMon(0);
    },

    /*
     * Viền ngoài map ngoài trời: cỏ + cây tree_2 kín 12 ô quanh map để máy ảnh không nhìn ra khoảng xám.
     * Map gốc do server gửi cũng có viền cây dày; ở đây chỉ để nhìn, không đi được. Chỗ có cửa nối cạnh thì để trống.
     */
    buildSkirt(M) {
      if (M.settings.indoors) return null;
      const R = 12, g = new THREE.Group();
      const open = new Set();
      for (const L of M.links) if (L.kind === 'edge') {
        for (let k = 1; k <= R; k++) {
          const ex = L.x < 0 ? -k : L.x >= M.w ? M.w - 1 + k : L.x, ey = L.y < 0 ? -k : L.y >= M.h ? M.h - 1 + k : L.y;
          open.add(ex + ',' + ey);
        }
      }
      const pos = [], uv = [], idx = [];
      const grass = [14 + 60 * 64, 15 + 60 * 64, 14 + 59 * 64, 15 + 59 * 64];
      const trees = [];
      for (let y = -R; y < M.h + R; y++) for (let x = -R; x < M.w + R; x++) {
        if (x >= 0 && y >= 0 && x < M.w && y < M.h) continue;
        const u = P1.worldMap.uvOf(grass[(x & 1) + 2 * (y & 1)]);
        const i = pos.length / 3;
        pos.push(x, 0, y, x + 1, 0, y, x + 1, 0, y + 1, x, 0, y + 1);
        uv.push(u[0], u[3], u[2], u[3], u[2], u[1], u[0], u[1]);
        idx.push(i, i + 3, i + 1, i + 1, i + 3, i + 2);
        if (!(x & 1) && !(y & 1) && !open.has(x + ',' + y) && !open.has((x + 1) + ',' + y) && !open.has(x + ',' + (y + 1)) && !open.has((x + 1) + ',' + (y + 1))) trees.push([x + 1, y + 1]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
      geo.setIndex(idx);
      if (!this.skirtTex) {
        const tex = this.skirtTex = new THREE.TextureLoader().load(P1.GROUND.atlas.img);
        tex.encoding = THREE.sRGBEncoding; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      }
      g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this.skirtTex })));
      const P = P1.PROPS.tree_2;
      if (P) P1.gltf(P.glb).then(gl => {
        gl.scene.updateMatrixWorld(true);
        gl.scene.traverse(o => {
          if (!o.isMesh) return;
          if (o.material.alphaTest > 0) o.material.side = THREE.DoubleSide;
          const im = new THREE.InstancedMesh(o.geometry, o.material, trees.length);
          trees.forEach((t, i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(t[0], 0, t[1]).multiply(o.matrixWorld)));
          im.frustumCulled = false;
          g.add(im);
        });
      }).catch(() => {});
      return g;
    },

    addActor(d) {
      let a;
      const face = DIR_OF[d.face] != null ? DIR_OF[d.face] : 2;
      if (d.kind === 'sign') {
        a = { data: d, x: d.x, y: d.y, name: d.name, kind: 'sign', root: new THREE.Group(), update() {}, dispose() {}, setVisible(v) { this.hidden = !v; }, ready: Promise.resolve(), face };
      } else if (d.kind === 'item' && d.sprite) {
        // Bóng vật phẩm gốc là một tấm NPC (sdata npc/sprite11 = Poké Ball), đứng như nhân vật.
        a = A().npcActor(d.sprite, { x: d.x, y: d.y, face: 2, h: this.map.heights[d.y * this.map.w + d.x], name: d.name, data: d });
        a.kind = 'item';
      } else if (d.kind === 'item') {
        a = this.itemActor(d);
      } else {
        a = A().npcActor(d.sprite, { x: d.x, y: d.y, face, h: this.map.heights[d.y * this.map.w + d.x], name: d.name, data: d });
      }
      a.id = d.id; a.data = d; a.name = d.name || a.name;
      this.actors.push(a);
      this.scene.add(a.root);
      return a;
    },

    /* Bóng vật phẩm trên đất: icon Poké Ball đứng như sprite (NPCPrefab gốc có con 'PokeBall'; model không rút được). */
    itemActor(d) {
      const ball = Object.values(P1.ITEMS || {}).find(i => i.battleId === 'pokeball');
      const tex = P1.texture(ball && ball.img ? ball.img : 'art/item/4.png');
      const root = new THREE.Group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
      m.position.set(0.5, 0.33, 0.62);
      m.rotation.x = -35 * Math.PI / 180;
      root.add(m);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(0.5, 0.02, 0.62);
      root.add(sh);
      root.position.set(d.x, this.map.heights[d.y * this.map.w + d.x], d.y);
      return { data: d, x: d.x, y: d.y, kind: 'item', name: d.name, root, update() {}, ready: Promise.resolve(), face: 2,
        setVisible(v) { this.hidden = !v; root.visible = v; }, setTint(c) { m.material.color.copy(c); },
        dispose() { m.geometry.dispose(); m.material.dispose(); sh.geometry.dispose(); sh.material.dispose(); } };
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

    /* Pokémon đi theo: con đầu đội còn sống, nếu có sprite follow (P1.FOLLOW_ROSTER). */
    refreshFollower(place) {
      const lead = P1.state.party.find(m => m.hp > 0) || null;
      const want = lead && (P1.FOLLOW_ROSTER || []).includes(lead.dex) ? lead.dex + (lead.shiny ? 's' : '') : '';
      if (this.follower && this.follower.key === want && !place) return;
      if (this.follower) { this.scene.remove(this.follower.root); this.follower.dispose(); this.follower = null; }
      if (!want || !this.player) return;
      const p = this.player;
      let bx = p.x - DIR[p.face][0], by = p.y - DIR[p.face][1];
      if (this.blocked(this.map, bx, by)) { bx = p.x; by = p.y; }
      this.follower = A().followActor(lead.dex, lead.shiny, { x: bx, y: by, face: p.face, h: p.h });
      this.follower.key = want;
      this.follower.setVisible(!(bx === p.x && by === p.y));
      this.scene.add(this.follower.root);
      this.applyLight();
    },

    /* ------------------------------------------------ ánh sáng, máy ảnh */
    applyLight() {
      const M = this.map;
      if (!M) return;
      const q = P1.query && P1.query.get('period');
      const period = q || P1.period();
      const env = envColour(period, M.settings.indoors);
      this.env = env;
      this.sun.color.copy(env);
      const L = WD().light || {};
      const amb = (L.ambient && L.ambient.color) || [0.412, 0.412, 0.412];
      this.ambient.color.setRGB(amb[0], amb[1], amb[2]).multiply(env.clone().lerp(new THREE.Color(1, 1, 1), 0.35));
      const tint = env.clone().lerp(new THREE.Color(1, 1, 1), 0.1);
      for (const a of this.actors) if (a.setTint) a.setTint(tint);
      if (this.player) this.player.setTint(tint);
      if (this.follower) this.follower.setTint(tint);
      this.period = period;
    },

    cameraGoal(out) {
      const p = this.player;
      const off = (WD().camera && WD().camera.follow && WD().camera.follow.three && WD().camera.follow.three.offset) || [0, 14, 14.5];
      // Đích = Sprite Offset của người chơi (gốc + (0,5; 0,2; 0,35)); gốc cao 0,6 trên đất.
      out.set(p.root.position.x + 0.5 + off[0], p.root.position.y + 0.2 + off[1], p.root.position.z + 0.35 + off[2]);
      return out;
    },
    snapCamera() {
      if (!this.player) return;
      this.cameraGoal(this.camera.position);
      this.overview();
      this.updateSun();
    },
    /* ?overview=1: nhìn thẳng từ trên xuống cả map (soát bố cục khi viết tools/maps/*.txt). */
    overview() {
      if (!P1.query || P1.query.get('overview') !== '1' || !this.map) return;
      const M = this.map, c = this.camera;
      c.rotation.set(-Math.PI / 2, 0, 0);
      c.far = 400; c.updateProjectionMatrix();
      const fit = Math.max(M.h, M.w / c.aspect) / 2 / Math.tan(c.fov * Math.PI / 360);
      c.position.set(M.w / 2, fit * 1.04 + 4, M.h / 2);
    },

    updateSun() {
      const c = this.camera.position;
      this.sun.target.position.set(c.x, 0, c.z - 14);
      this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, -20);
    },

    /* ------------------------------------------------ vòng lặp */
    update(dt) {
      if (!this.map || !this.player) return;
      this.t += dt;
      if (this.gfx) this.gfx.tick(this.t);
      const frozen = P1.ui && P1.ui.isOpen && P1.ui.isOpen();
      if (this.mode === 'explore' && !frozen && !P1.worldUi.quests.isOpen()) this.explore(dt);
      else { for (const k of ['a', 'up', 'left', 'down', 'right']) P1.input.take(k); }
      if (P1.worldUi.quests.isOpen() && (P1.input.take('b') || P1.input.take('menu'))) P1.worldUi.quests.close();
      this.player.update(dt);
      if (this.follower) this.follower.update(dt);
      for (const a of this.actors) a.update(dt);
      if (this.mode === 'explore' && !frozen) this.idleNpcs(dt);
      this.fx = this.fx.filter(f => { const alive = f.update(dt); if (!alive) f.dispose(); return alive; });
      const goal = this.cameraGoal(new THREE.Vector3());
      const speed = (WD().camera && WD().camera.follow && WD().camera.follow.speed) || 8;
      this.camera.position.lerp(goal, Math.min(1, speed * dt));
      this.overview();
      this.updateSun();
      if (this.lightT === undefined || (this.lightT -= dt) < 0) { this.lightT = 30; if (!P1.query || !P1.query.get('period')) this.applyLight(); }
    },

    render() {
      if (!this.scene) return;
      P1.renderer().render(this.scene, this.camera);
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
      if (dir < 0 && tap >= 0 && tap !== p.face) { p.face = tap; p.setFrame(); this.turnHold = TURN_DELAY; return; }
      if (dir < 0) { this.turnHold = 0; return; }
      if (dir !== p.face) { p.face = dir; this.turnHold = TURN_DELAY; p.setFrame(); return; }
      if (this.turnHold > 0) { this.turnHold -= dt; return; }
      this.tryStep(dir);
    },

    idleNpcs(dt) {
      for (const a of this.actors) {
        if (a.hidden || !a.data || a.move) continue;
        if (a.data.path) { this.patrol(a, dt); continue; }
        if (a.data.look !== 'random') continue;
        if (this.lookT[a.id] === undefined) this.lookT[a.id] = LOOK_RANDOM[0] + Math.random() * (LOOK_RANDOM[1] - LOOK_RANDOM[0]);
        this.lookT[a.id] -= dt;
        if (this.lookT[a.id] > 0) continue;
        this.lookT[a.id] = undefined;
        a.face = (Math.random() * 4) | 0;
        a.setFrame();
        if (a.data.trainer) this.checkSight();
      }
    },

    /*
     * Đi tuần theo NPCSettingStruct.Path: 'up2,down2' lặp mãi; ô bị chặn (người chơi đứng) thì chờ.
     * Nghỉ giữa hai bước và tốc độ (WalkFast) không có số trong máy khách: nghỉ 0,6 s, tốc độ = MoveSpeed.
     */
    patrol(a, dt) {
      if (!a.route) {
        a.route = [];
        for (const t of a.data.path.split(',')) { const m = /^(up|down|left|right)(d*)$/.exec(t.trim()); if (m) for (let i = 0; i < (+m[2] || 1); i++) a.route.push(DIR_OF[m[1]]); }
        a.routeAt = 0; a.routeWait = 0.6;
      }
      if (!a.route.length || (a.routeWait -= dt) > 0) return;
      const d = a.route[a.routeAt], tx = a.x + DIR[d][0], ty = a.y + DIR[d][1];
      const p = this.player, f = this.follower;
      if (!this.free(tx, ty, a) || (p.x === tx && p.y === ty) || (f && f.root.visible && f.x === tx && f.y === ty)) { a.face = d; a.setFrame(); a.routeWait = 0.4; return; }
      a.routeAt = (a.routeAt + 1) % a.route.length;
      a.routeWait = 0.6;
      a.step(d, a.data.fast ? { speed: a.speed * 1.6 } : {});
    },

    /* ------------------------------------------------ đi */
    linkAt(x, y) { return this.map.links.find(L => L.x === x && L.y === y); },
    collider(x, y) { const M = this.map; return x < 0 || y < 0 || x >= M.w || y >= M.h ? COLL.solid : M.colliders[y * M.w + x]; },
    heightAt(x, y) { return this.map.heights[y * this.map.w + x]; },
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
      const on = P1.getSetting ? P1.getSetting('sBumpSound') : P1.settings.bumpSound;
      if (on === true || on === 1 || on === 'Enabled' || P1.settings.bumpSound) P1.audio.sfx('bump');
    },

    tryStep(dir) {
      const p = this.player, M = this.map;
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
      if (this.heightAt(tx, ty) !== this.heightAt(p.x, p.y)) { this.bump(dir); return; }
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
      if (opt.jump) this.fx.push(burst(this.scene, 'dust', p.x + 0.5, this.heightAt(p.x, p.y) + 0.05, p.y + 0.7, 6));
      await this.onStep();
    },

    followStep(fromX, fromY, jump) {
      const f = this.follower;
      if (!f) return;
      if (!f.root.visible) { f.teleport(fromX, fromY, this.player.face); f.setVisible(true); return; }
      const dx = fromX - f.x, dy = fromY - f.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const d = dx === 1 ? 3 : dx === -1 ? 1 : dy === 1 ? 2 : 0;
        f.step(d, { jump: jump && false });
      } else if (jump && Math.abs(dx) + Math.abs(dy) === 2) {
        const d = dx > 0 ? 3 : dx < 0 ? 1 : dy > 0 ? 2 : 0;
        f.step(d, { jump: true });
      } else f.teleport(fromX, fromY, this.player.face);
    },

    async onStep() {
      const p = this.player, M = this.map;
      const link = this.linkAt(p.x, p.y);
      if (link && (link.kind === 'stairs' || link.kind === 'warp')) { await this.useLink(link); return; }
      const zone = M.zones.grid[p.y * M.w + p.x];
      if (zone) {
        this.fx.push(burst(this.scene, 'grass', p.x + 0.5, this.heightAt(p.x, p.y) + 0.2, p.y + 0.6, 4));
        if (await this.checkSight()) return;
        if (this.rollEncounter(M.zones.ids[zone - 1])) return;
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
      const list = Z[this.period || P1.period()] || [];
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

    /* Vào cảnh trận, giữ nguyên thế giới three.js; onEnd đưa về world ({ resume: true }). */
    goBattle(args) {
      this.saveState();
      this.levelsBefore = new Map(P1.state.party.map(m => [m.uid, m.level]));
      return new Promise(res => {
        const onEnd = out => {
          this.onResume = () => res(out || { outcome: 'win' });
          P1.scene.go('world', { resume: true });
        };
        try {
          P1.scene.go('battle', Object.assign({ onEnd }, args));
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
      const out = await this.goBattle({ kind: 'trainer', name: o.name, foe, music: o.music, money: o.money, where: this.map.name });
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
      this.player.face = OPP[a.face]; this.player.setFrame();
      await this.runScript(a.data.script, a);
    },

    /* ------------------------------------------------ nói chuyện */
    async interact() {
      const p = this.player;
      let x = p.x + DIR[p.face][0], y = p.y + DIR[p.face][1];
      if (this.collider(x, y) === COLL.counter) { x += DIR[p.face][0]; y += DIR[p.face][1]; }
      const a = this.actorAt(x, y);
      if (!a) return;
      if (a.kind === 'item') { await this.pickItem(a); return; }
      if (a.kind !== 'sign' && a.data.look !== 'fixed') { a.face = OPP[p.face]; a.setFrame && a.setFrame(); }
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
      // Khoá ngay: phím còn giữ trong lúc cửa mở sẽ gọi lại useLink ở khung sau (hai lần tải map chồng nhau).
      const prevMode = this.mode;
      this.mode = 'warp';
      const cur = this.map;
      let sfx = L.sfx || (L.kind === 'door' ? (cur.settings.indoors ? 'exit_door' : 'entering_door') : '');
      if (sfx) P1.audio.sfx(sfx);
      if (L.kind === 'door' && !cur.settings.indoors) await this.openDoor(L);
      await this.warp(L.to, L.tx, L.ty, L.face, L, prevMode);
    },

    /*
     * Cửa nhà gốc (door_ext_*, con Door_2) có clip "Take 001": xoay 89,6° tới 0,87 s rồi đóng ở 1,67 s (rip_world).
     * Ở đây chỉ chạy nửa mở trong 0,35 s trước màn đen (mở hết 0,87 s làm người chơi chờ lâu), bản lề ở gốc prefab.
     */
    openDoor(L) {
      const doors = (this.gfx && this.gfx.tagged.door) || [];
      const d = doors.find(n => Math.abs(n.position.x - (L.x + 0.5)) < 1.2 && Math.abs(n.position.z - (L.y + 1)) < 0.8);
      if (!d) return Promise.resolve();
      const clip = WD().door && WD().door.houseDoors && WD().door.houseDoors[d.name];
      const maxDeg = (clip && clip.openDeg) || 89.6;
      return new Promise(res => {
        const t0 = performance.now();
        const tick = () => {
          const k = Math.min(1, (performance.now() - t0) / 350);
          d.rotation.y = k * maxDeg * Math.PI / 180;
          if (k < 1) requestAnimationFrame(tick); else res();
        };
        tick();
      });
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
      if (newArea) P1.worldUi.area.show(this.map.name);
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
    // Bản gốc là MMO, máy chủ lưu liên tục; ở đây tự lưu mỗi lần đổi map để Continue ở màn đầu có chỗ về.
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
      if (a.setFrame) a.setFrame();
    },
    async moveActor(a, steps) {
      for (const [d, n] of steps) for (let i = 0; i < n; i++) await a.step(DIR_OF[d]);
      if (a === this.player) { P1.state.x = a.x; P1.state.z = a.y; }
    },
    async emote(a, key) {
      if (!a) return;
      const e = A().emote(a, key || '1');
      let t = 0;
      this.fx.push({ update: dt => e.update(dt) && (t += dt) < 0.9, dispose: () => e.dispose() });
      await new Promise(r => setTimeout(r, 900));
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
        if (P1.ui && P1.ui.toast) P1.ui.toast('Quest Update: ' + q.name);
        else P1.worldUi.toast.show('Quest Update', q.name);
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
        await world.say('Quest complete: ' + q.name + '\nReward: ' + rew, '');
        if (st.quest === id && q.next) await world.quests.start(q.next);
        world.refreshHud();
      },
    },
  };

  P1.world = world;
  P1.scene.add('world', world);
})(window.P1 = window.P1 || {});
