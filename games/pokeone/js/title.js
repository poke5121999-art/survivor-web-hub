/*
 * Cảnh 'title': màn đăng nhập gốc (scene level1). Đảo 3D có máy ảnh bay theo timeline "Login", skybox, nhạc 'title',
 * khung 'title:Panel - Login' với hai ô nhập đổi thành tóm tắt bản lưu + New Game / Continue; Options giữ chỗ cũ.
 * P1.titleBackdrop dùng lại đảo làm nền cho cảnh 'creator'.
 */
(function (P1) {
  'use strict';

  /* ---------------------------------------------------------------- đảo nền (P1.TITLE_SCENE, tools/rip_map_title.py) */

  const B = { scene: null, cam: null, sky: null, t: 0, loading: null, ready: false, saved: null, users: 0 };
  const col = a => new THREE.Color(a[0], a[1], a[2]);

  function skybox(S, far) {
    const D = far * 0.55, g = new THREE.Group(), h = Math.PI / 2;
    const face = (key, pos, rot) => {
      if (!S.faces[key]) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * D, 2 * D),
        new THREE.MeshBasicMaterial({ map: P1.texture(S.faces[key]), fog: false, depthWrite: false, depthTest: false }));
      m.material.map.magFilter = THREE.LinearFilter;
      m.position.set(pos[0] * D, pos[1] * D, pos[2] * D);
      m.rotation.set(rot[0], rot[1], rot[2]);
      m.renderOrder = -1;
      g.add(m);
    };
    // Hướng mặt theo S.threeDir (đã đảo trục x từ Unity), như tools/props-viewer.html.
    face('front', [0, 0, 1], [0, Math.PI, 0]);
    face('back', [0, 0, -1], [0, 0, 0]);
    face('left', [-1, 0, 0], [0, h, 0]);
    face('right', [1, 0, 0], [0, -h, 0]);
    face('up', [0, 1, 0], [h, 0, Math.PI]);
    return g;
  }

  function load() {
    if (B.loading) return B.loading;
    const T = P1.TITLE_SCENE;
    if (!T || !window.THREE) return (B.loading = Promise.resolve(false));
    B.loading = P1.gltf(T.glb).then(g => {
      const scene = new THREE.Scene(), L = T.light;
      scene.fog = new THREE.Fog(col(L.fog.color), L.fog.start, L.fog.end);
      scene.background = col(L.fog.color);
      scene.add(new THREE.AmbientLight(col(L.ambient.sky), L.ambient.intensity));
      const sun = new THREE.DirectionalLight(col(L.sun.color), L.sun.intensity * 2);
      sun.position.set(-L.sun.dir[0], -L.sun.dir[1], -L.sun.dir[2]);
      scene.add(sun);
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const m = o.material;
        if (m.alphaTest > 0) m.side = THREE.DoubleSide;
        if (m.transparent) m.depthWrite = false;
      });
      scene.add(g.scene);
      const C = T.camera;
      B.cam = new THREE.PerspectiveCamera(C.fov, innerWidth / innerHeight, C.near, C.far);
      B.sky = skybox(T.sky, C.far);
      scene.add(B.sky);
      B.scene = scene;
      B.ready = true;
      return true;
    }).catch(err => { console.warn('title island:', err && err.message); return false; });
    return B.loading;
  }

  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function place(t) {
    const P = P1.TITLE_SCENE.camera.path, n = P.pos.length;
    t = ((t % P.duration) + P.duration) % P.duration;
    const f = t / P.dt, i = Math.min(n - 2, Math.floor(f)), a = f - i;
    B.cam.position.copy(pa.fromArray(P.pos[i]).lerp(pb.fromArray(P.pos[i + 1]), a));
    B.cam.quaternion.copy(qa.fromArray(P.rot[i]).slerp(qb.fromArray(P.rot[i + 1]), a));
    B.sky.position.copy(B.cam.position);
  }

  P1.titleBackdrop = {
    start() {
      const r = P1.renderer();
      if (!B.users++) B.saved = { tm: r.toneMapping, ex: r.toneMappingExposure };
      const T = P1.TITLE_SCENE;
      if (T) {
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = Math.pow(2, (T.post && T.post.postExposureEV) || 0) * 0.8;
      }
      return load();
    },
    stop() {
      if (--B.users > 0 || !B.saved) return;
      const r = P1.renderer();
      r.toneMapping = B.saved.tm;
      r.toneMappingExposure = B.saved.ex;
      B.users = 0;
    },
    render(dt) {
      const r = P1.renderer();
      if (!B.ready) {
        const T = P1.TITLE_SCENE;
        r.setClearColor(T ? col(T.light.fog.color) : new THREE.Color(0x1b2530), 1);
        r.clear();
        return;
      }
      B.t += dt;
      B.cam.aspect = innerWidth / innerHeight;
      B.cam.updateProjectionMatrix();
      place(B.t);
      r.render(B.scene, B.cam);
    },
    get ready() { return B.ready; },
    get time() { return B.t; },
  };

  /* ---------------------------------------------------------------- khung đăng nhập */

  let host = null, v = null, onKey = null;
  const W = 'Sprite - Window/';

  function summary(st) {
    const sec = Math.floor(st.playSeconds || 0);
    const lv = P1.trainerLevel ? P1.trainerLevel(st.trainerExp).level : 5;
    return st.player.name + '   Lv ' + lv + '   ' + Math.floor(sec / 3600) + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') +
      '   ' + Object.keys(st.dex.caught).length + ' caught';
  }

  function configure() {
    const saved = P1.hasSave() && P1.load();
    const n = p => v.ui.need(p);
    // Bản gốc: Username, Password, Login, Remember, Sign Up, Lost Password, Quit. Bản một người chơi: tóm tắt bản lưu
    // nằm trong khung ô Username, Continue ở chỗ ô Password, New Game ở chỗ nút Login.
    const ng = v.add('Sprite - Window', 'title:Panel - Login/Sprite - Window/Button - Login', 'Button - New Game');
    [W + 'Input - Password', W + 'Toggle - Remember Login', W + 'Label - Signup', W + 'Label - Signup Button',
      W + 'Label - Lost Password', W + 'Sprite - Response', 'Button - Quit'].forEach(p => { n(p).active = false; });
    const info = n(W + 'Input - Username/Label');
    info.w.text = saved ? summary(saved) : 'Welcome to PokéOne!';
    info.w.color = saved ? '#ffffffff' : '#878080ff';
    info.w.overflow = 'shrink';
    const cont = n(W + 'Button - Login');
    cont.active = !!saved;
    cont.pos[1] = -4;
    ng.pos[1] = saved ? -61 : -38;
    if (!saved) {
      n(W + 'Input - Username').pos[1] = 22;
      n('Sprite - Window').w.size = [350, 150];
    }
    n(W + 'Button - Login/Label').w.text = 'Continue';
    n(W + 'Button - New Game/Label').w.text = 'New Game';
    v.refresh();
    const go = {
      cont: () => { if (!P1.load()) return; P1.ui.closeAll(); P1.scene.go('world', {}); },
      fresh: () => {
        const start = () => { P1.ui.closeAll(); P1.newGame(); P1.scene.go('creator', {}); };
        if (!saved) { start(); return; }
        P1.ui.message({ title: 'New Game', text: 'Start a new game? Your saved game is replaced the next time you save.', yes: 'Okay', no: 'Cancel' })
          .then(ok => { if (ok) start(); });
      },
    };
    P1.ui.onEl(cont, go.cont);
    P1.ui.onEl(ng, go.fresh);
    P1.ui.onEl(n('Button - Options'), () => { if (!P1.ui.isOpen()) P1.ui.open('options'); });
    onKey = ev => {
      if (ev.code !== 'Enter' || P1.ui.isOpen()) return;
      const t = ev.target;
      if (t && t.tagName === 'INPUT') return;
      (saved ? go.cont : go.fresh)();
    };
    window.addEventListener('keydown', onKey);
  }

  P1.scene.add('title', {
    enter() {
      P1.titleBackdrop.start();
      P1.audio.music('title');
      host = document.createElement('div');
      host.className = 'p1-scene';
      document.getElementById('ui').appendChild(host);
      v = P1.ngui.build('title:Panel - Login', host);
      configure();
    },
    exit() {
      if (onKey) window.removeEventListener('keydown', onKey);
      onKey = null;
      P1.ui.closeAll();
      if (v) v.destroy();
      if (host) host.remove();
      v = host = null;
      P1.titleBackdrop.stop();
    },
    render(dt) { P1.titleBackdrop.render(dt); },
    get view() { return v; },
  });
})(window.P1 = window.P1 || {});
