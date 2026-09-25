// Hình của một unit: Spine 4.2 hai skeleton NW/SW chung một atlas, NE/SE là bản lật (ASSETS.md §1).
// Skeleton scale 0.01 (1 px = 1 cm), nhân scale prefab. Mesh billboard theo camera, gốc ở chân.
(function (VD) {
  'use strict';
  const THREE = window.THREE, spine = window.spine;

  const dataCache = new Map();

  function spineDir(name) {
    const a = VD.ASSETS && VD.ASSETS.spine && VD.ASSETS.spine[name];
    return (a && a.dir) || ('art/spine/' + name + '/');
  }

  async function fetchOk(url, kind) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('không tải được ' + url + ' (' + r.status + ')');
    return kind === 'bin' ? new Uint8Array(await r.arrayBuffer()) : kind === 'json' ? r.json() : r.text();
  }
  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('không tải được ' + url)); i.src = url; });
  }

  // Nạp một bộ Spine: meta.json + atlas + png + hai skel. Đệm theo tên.
  function loadSpine(name) {
    if (dataCache.has(name)) return dataCache.get(name);
    const p = (async () => {
      const dir = spineDir(name);
      const meta = await fetchOk(dir + 'meta.json', 'json');
      const atlas = new spine.TextureAtlas(await fetchOk(dir + meta.atlas, 'text'));
      for (const page of atlas.pages) {
        const img = await loadImage(dir + page.name);
        const tex = new spine.ThreeJsTexture(img);
        tex.setFilters(spine.TextureFilter.Nearest, spine.TextureFilter.Nearest);
        page.setTexture(tex);
      }
      const out = { name, meta, dirs: {} };
      for (const key of Object.keys(meta.skeletons)) {
        const sk = meta.skeletons[key];
        const bin = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
        bin.scale = sk.scale;
        const data = bin.readSkeletonData(await fetchOk(dir + sk.skel, 'bin'));
        const stateData = new spine.AnimationStateData(data);
        stateData.defaultMix = sk.defaultMix || 0;
        for (const [a, b, d] of sk.mixes || []) { try { stateData.setMix(a, b, d); } catch (e) { /* anim thiếu ở một hướng */ } }
        const dirKey = /_NW$/.test(key) ? 'NW' : /_SW$/.test(key) ? 'SW' : key;
        out.dirs[dirKey] = { data, stateData, info: sk };
      }
      return out;
    })();
    dataCache.set(name, p);
    return p;
  }

  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  class UnitVisual {
    // opts: { spine: tên bộ, skins: [tên skin], scale: scale prefab, shadow: bán kính bóng (m) }
    constructor(bundle, opts) {
      this.bundle = bundle;
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.root.add(this.body);
      this.meshes = {};
      this.scale = opts.scale || 1;
      for (const k of Object.keys(bundle.dirs)) {
        const d = bundle.dirs[k];
        const m = new spine.SkeletonMesh(d.data, mat => { mat.depthTest = true; mat.depthWrite = true; mat.alphaTest = 0.1; });
        m.state = new spine.AnimationState(d.stateData);
        // Ghép các skin có thật; không ghép được mảnh nào thì giữ skin mặc định (boss chỉ có "default").
        const parts = (opts.skins || []).map(n => d.data.findSkin(n)).filter(Boolean);
        if (parts.length) {
          const skin = new spine.Skin('unit');
          for (const s of parts) skin.addSkin(s);
          m.skeleton.setSkin(skin);
          m.skeleton.setSlotsToSetupPose();
        }
        m.visible = false;
        this.meshes[k] = m;
        this.body.add(m);
      }
      this.dirKey = this.meshes.SW ? 'SW' : Object.keys(this.meshes)[0];
      this.meshes[this.dirKey].visible = true;
      this.flip = false;
      this.camRight = { x: 1, z: 0 };
      this.anim = null; this.animLoop = true; this.animSpeed = 1;
      this.flash = 0;
      const r = (opts.shadow || 0.5) * 2;
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(r, r), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; this.shadow.renderOrder = -1;
      this.root.add(this.shadow);
    }

    has(anim) {
      const d = this.bundle.dirs[this.dirKey];
      return !!d.data.findAnimation(anim);
    }

    // Đặt anim cho mọi hướng cùng lúc để đổi hướng không giật khung.
    play(anim, loop, speed, force) {
      if (!force && this.anim === anim && this.animLoop === loop) { this.setSpeed(speed); return; }
      this.anim = anim; this.animLoop = loop;
      for (const k in this.meshes) {
        const m = this.meshes[k];
        if (!m.skeleton.data.findAnimation(anim)) continue;
        m.state.setAnimation(0, anim, loop);
      }
      this.setSpeed(speed);
    }
    // Tìm tên clip thật: boss có tiền tố pha ("0/idle"), nhân vật có nhóm "battle/" và "default/".
    resolve(name, phase) {
      if (!name) return null;
      const d = this.bundle.dirs[this.dirKey].data;
      const tries = [name, (phase || 0) + '/' + name, 'battle/' + name, 'default/' + name, name.replace(/^battle\//, ''), name.replace(/^default\//, '')];
      for (const n of tries) if (d.findAnimation(n)) return n;
      return null;
    }
    // Đặt clip theo thời gian của clip (skill gốc điều khiển tốc độ anim bằng animationSpeeds theo từng đoạn).
    pose(name, clipTime, loop, dt) {
      for (const k in this.meshes) {
        const m = this.meshes[k];
        if (!m.skeleton.data.findAnimation(name)) continue;
        let e = m.state.getCurrent(0);
        if (!e || e.animation.name !== name || this.anim !== name) e = m.state.setAnimation(0, name, loop);
        // Giờ clip do lõi skill quyết (animationSpeeds). timeScale 0 của track: update() không cộng thêm dt (trước đây
        // đặt clipTime − dt rồi để update cộng lại, nhưng kẹp 0 ở khung đầu làm clip đứng một khung). Trộn (mixTime)
        // vẫn chạy theo dt của AnimationState.
        e.loop = loop; e.timeScale = 0;
        e.trackTime = Math.max(0, clipTime);
      }
      this.anim = name; this.animLoop = loop; this.animSpeed = 1;
      for (const k in this.meshes) this.meshes[k].state.timeScale = 1;
    }
    setSpeed(s) { this.animSpeed = s == null ? 1 : s; for (const k in this.meshes) this.meshes[k].state.timeScale = this.animSpeed; }
    duration(anim) {
      const a = this.bundle.dirs[this.dirKey].data.findAnimation(anim);
      return a ? a.duration : 0;
    }

    // face: góc hướng nhìn trên mặt đất (rad, atan2(z, x) trong toạ độ three).
    // Tám hướng trên màn hình (CharacterView._animationMode = 2, hàm gốc LookAtDirectionAsEightWay): bốn ô chéo quyết
    // cả bộ xương (NW/SW) lẫn lật; ô lên/xuống chỉ quyết bộ xương, ô trái/phải chỉ quyết lật, phần còn lại giữ như cũ.
    // Nhờ vậy ngắm gần thẳng đứng không lật qua lại mỗi khung. [SUY LUẬN: tên hàm + 2 bộ xương; mã C# không đọc được]
    setFacing(face, camera) {
      const dx = Math.cos(face), dz = Math.sin(face);
      const f = FWD;
      camera.getWorldDirection(f); f.y = 0; f.normalize();
      const rx = -f.z, rz = f.x;                    // trục phải của màn hình trên mặt đất
      this.camRight.x = rx; this.camRight.z = rz;
      const sx = dx * rx + dz * rz, sy = dx * f.x + dz * f.z;
      if (sx * sx + sy * sy < 1e-8) return;
      const oct = ((Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) % 8) + 8) % 8;   // 0 phải, 2 lên, 4 trái, 6 xuống
      let key = this.dirKey, flip = this.flip;
      if (oct === 1 || oct === 2 || oct === 3) key = 'NW';
      if (oct === 5 || oct === 6 || oct === 7) key = 'SW';
      if (oct === 7 || oct === 0 || oct === 1) flip = true;
      if (oct === 3 || oct === 4 || oct === 5) flip = false;
      if (!this.meshes[key]) key = this.meshes.SW ? 'SW' : this.dirKey;
      if (key !== this.dirKey) {
        const from = this.meshes[this.dirKey], to = this.meshes[key];
        from.visible = false; to.visible = true;
        this.dirKey = key;
      }
      this.flip = flip;
    }
    // Độ lệch thế giới của khớp theo EUnitBoneType gốc (Head/Eye/Body/Death) = xương Spine "bone_<tên>" của bộ đang hiện
    // (UnitView.GetBoneOffset). Symbol không có xương: CharacterView.SymbolPositionY. x theo trục phải màn hình (hình là
    // billboard), y lên. Không có xương → null.
    boneOffset(type) {
      if (!type || type === 'None') return null;
      const k = this.scale * (this.flip ? -1 : 1);
      if (type === 'Symbol') return { x: 0, y: SYMBOL_Y * this.scale, z: 0 };
      const m = this.meshes[this.dirKey];
      const b = m && m.skeleton.findBone('bone_' + String(type).toLowerCase());
      if (!b) return null;
      return { x: this.camRight.x * b.worldX * k, y: b.worldY * this.scale, z: this.camRight.z * b.worldX * k };
    }

    update(dt, camera) {
      for (const k in this.meshes) this.meshes[k].update(dt);
      this.body.quaternion.copy(camera.quaternion);
      this.body.scale.set(this.flip ? -this.scale : this.scale, this.scale, this.scale);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
      // Spine tô màu qua skeleton.color (nhân vào mọi đỉnh); >1 cho ra chớp sáng khi trúng đòn.
      const k = this.flash > 0 ? 2.5 : 1;
      for (const key in this.meshes) this.meshes[key].skeleton.color.set(k, k, k, 1);
    }

    dispose() { this.root.parent && this.root.parent.remove(this.root); }
  }
  const FWD = new THREE.Vector3();
  const SYMBOL_Y = 1.25;   // không có trong bảng: CharacterView.SymbolPositionY của prefab 100001 (quái chưa bóc)

  VD.loadSpine = loadSpine;
  VD.UnitVisual = UnitVisual;
})(window.VD = window.VD || {});
