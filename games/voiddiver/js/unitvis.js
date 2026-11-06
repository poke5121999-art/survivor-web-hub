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
    // opts: { spine: tên bộ, skins: [tên skin], scale: scale prefab, shadow: bán kính bóng (m), id: id unit (tên prefab) }
    constructor(bundle, opts) {
      this.bundle = bundle;
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.root.add(this.body);
      this.meshes = {};
      // Số của prefab unit (tools/rip.py unit-view → meta.units[id]): scale khung xương dưới gốc prefab, SymbolPositionY,
      // _animationMode, thứ tự SkeletonAnimations. Thiếu (NPC không có UnitView) thì như cũ.
      this.view = (bundle.meta && bundle.meta.units && opts.id != null && bundle.meta.units[String(opts.id)]) || null;
      this.scale = (opts.scale || 1) * (this.view ? this.view.sk || 1 : 1);
      this.body.position.y = this.view ? this.view.lpy || 0 : 0;
      this.aimX = null; this.aimZ = 0; this.frozen = false;
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
      // Xương ngắm aim_target (UnitView.InitSkeleton lấy theo tên; ràng buộc IK_aim_target xoay aim_pointer về nó,
      // TF_aim_* theo aim_pointer với mix do từng anim khoá sẵn)
      this.aimBones = {};
      for (const k in this.meshes) { const b = this.meshes[k].skeleton.findBone('aim_target'); if (b) this.aimBones[k] = b; }
      this.flip = false;
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
    // Track 1 chồng lên track 0 (NtfPlayAnimation.MultiTrackAnimationName → UnitView.PlayAnimationAsync 0x1806a2640:
    // SetAnimation(1, tên, loop)); chỉ xương clip này có khoá bị ghi đè (clip *_walk của Raven không khoá chân).
    poseTrack1(name, clipTime, loop) {
      for (const k in this.meshes) {
        const m = this.meshes[k];
        if (!m.skeleton.data.findAnimation(name)) continue;
        let e = m.state.getCurrent(1);
        if (!e || !e.animation || e.animation.name !== name) e = m.state.setAnimation(1, name, loop);
        e.loop = loop; e.timeScale = 0; e.trackTime = Math.max(0, clipTime);
      }
      this.track1 = name;
    }
    // UnitView.ClearMultiTrackAnimation (0x1806a8020): SetEmptyAnimation(1, 0) mọi khung xương.
    clearTrack1() {
      if (!this.track1) return;
      for (const k in this.meshes) { const st = this.meshes[k].state; if (st.getCurrent(1)) st.setEmptyAnimation(1, 0); }
      this.track1 = null;
    }
    setSpeed(s) { this.animSpeed = s == null ? 1 : s; for (const k in this.meshes) this.meshes[k].state.timeScale = this.animSpeed; }
    duration(anim) {
      const a = this.bundle.dirs[this.dirKey].data.findAnimation(anim);
      return a ? a.duration : 0;
    }

    // face: góc hướng nhìn trên mặt đất (rad, atan2(z, x) trong toạ độ three).
    // [ĐO] UnitView.LookAtDirection (0x1806a9b10, gọi cuối UnitView.Update mỗi khung); _animationMode 2 = FourWay ở mọi
    // prefab Spine: (sx, sy) = MathUtility.IsometricToTopDown(forward) = Euler(0, 45°, 0)·v (camera gốc quay −45°),
    // a = atan2(sy, sx) (độ). [0, 90): khung 0, ScaleX −1 | [90, 180): khung 0, +1 | [−180, −90): khung 1, +1 |
    // [−90, 0): khung 1, −1 | a = 180: giữ nguyên. Khung 0/1 = SkeletonAnimations[0/1] (thường NW/SW). Không có vùng giữ
    // (hysteresis): ngắm quanh phương dọc thì lật theo dấu sx đúng như bản gốc. TwoWay (mode 1): chỉ lật theo dấu sx.
    // (Bản trước đoán "tám hướng có vùng giữ" theo tên LookAtDirectionAsEightWay — sai: hàm đó là mode 3, không prefab nào dùng.)
    setFacing(face) {
      const dx = Math.cos(face), dz = Math.sin(face);
      const sx = (dx - dz) * Math.SQRT1_2, sy = (-dx - dz) * Math.SQRT1_2;
      if (sx * sx + sy * sy < 1e-10) return;
      const mode = this.view ? this.view.mode : 2;
      if (mode === 0) return;
      let key = this.dirKey, flip = this.flip;
      if (mode === 1) {
        if (sx > EPS) flip = true; else if (sx < -EPS) flip = false;
      } else {
        const a = Math.atan2(sy, sx) * 180 / Math.PI;
        if (!(a < 180)) return;
        const order = (this.view && this.view.skels) || ['NW', 'SW'];
        key = order[a >= 0 ? 0 : 1] || key;
        flip = a >= 0 ? a < 90 : a >= -90;
      }
      if (!this.meshes[key]) key = this.meshes.SW ? 'SW' : this.dirKey;
      if (key !== this.dirKey) {
        const from = this.meshes[this.dirKey], to = this.meshes[key];
        from.visible = false; to.visible = true;
        this.dirKey = key;
      }
      this.flip = flip;
    }
    // Độ lệch thế giới của khớp theo EUnitBoneType. [ĐO] UnitView.GetBoneOffset (0x1806a85f0):
    //   Symbol → up · SymbolPositionY (số của prefab, không nhân scale);
    //   Head/Eye/Body/Death → xương "bone_<tên>" của khung đang hiện: Euler(30, −45, 0)·(s·worldX, s·worldY, 0)
    //   + (0, localPosition.y, 0), s = localScale.x của SkeletonAnimation, lật nằm sẵn trong worldX (ScaleX −1)
    //   = (0,707a − 0,354b, 0,866b + lpy, 0,707a + 0,354b) toạ độ Unity; z three = −z Unity.
    // Không có xương → null (bản gốc trả 0: không lệch).
    boneOffset(type) {
      if (!type || type === 'None') return null;
      const V = this.view;
      if (type === 'Symbol') return { x: 0, y: V ? V.sym : SYMBOL_Y, z: 0 };
      const m = this.meshes[this.dirKey];
      const b = m && m.skeleton.findBone('bone_' + String(type).toLowerCase());
      if (!b) return null;
      const s = V ? V.bsx || 1 : this.scale, a = s * b.worldX * (this.flip ? -1 : 1), c = s * b.worldY;
      return { x: 0.70711 * a - 0.35355 * c, y: 0.86603 * c + (V ? V.lpy || 0 : 0), z: -(0.70711 * a + 0.35355 * c) };
    }
    // Hướng ngắm {x, z} trên mặt đất (toạ độ three) cho xương aim_target. [ĐO] UnitView.OnUpdateWorld (0x1806ace80, móc
    // SkeletonAnimation.UpdateWorld, mọi khung): v = IsometricToTopDown(CalculatedDeltaAimPos); v.x *= ScaleX; chuẩn hoá;
    // aim_target.X/Y (cục bộ theo cha) = v. Không kẹp, không làm mượt; unit bị khống chế/chết thì giữ hướng cũ.
    setAim(ax, az) { if (ax * ax + az * az > 1e-10) { this.aimX = ax; this.aimZ = az; } }

    update(dt, camera) {
      let vx = 0, vy = 0;
      if (this.aimX !== null) {
        vx = (this.aimX - this.aimZ) * Math.SQRT1_2 * (this.flip ? -1 : 1); vy = (-this.aimX - this.aimZ) * Math.SQRT1_2;
        const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
      }
      // Như SkeletonMesh.update, thêm bước đặt aim_target sau khi áp anim và trước khi giải IK/constraint
      // (updateWorldTransform). Freeze (EStatusEffectTag 0x10000000) → SetAnimationSpeed(0): anim đứng.
      const dts = this.frozen ? 0 : dt;
      for (const k in this.meshes) {
        const m = this.meshes[k], sk = m.skeleton;
        m.state.update(dts); m.state.apply(sk); sk.update(dts);
        const ab = this.aimBones[k];
        if (ab && this.aimX !== null) { ab.x = vx; ab.y = vy; }
        sk.updateWorldTransform(spine.Physics.update);
        m.updateGeometry();
      }
      this.body.quaternion.copy(camera.quaternion);
      this.body.scale.set(this.flip ? -this.scale : this.scale, this.scale, this.scale);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
      // Spine tô màu qua skeleton.color (nhân vào mọi đỉnh); >1 cho ra chớp sáng khi trúng đòn.
      const k = this.flash > 0 ? 2.5 : 1;
      for (const key in this.meshes) this.meshes[key].skeleton.color.set(k, k, k, 1);
    }

    dispose() { this.root.parent && this.root.parent.remove(this.root); }
  }
  const EPS = 1.401298e-45;   // Mathf.Epsilon (TwoWay so dấu sx với nó)
  const SYMBOL_Y = 1.25;      // prefab không có trong meta.units: SymbolPositionY của nhân vật (prefab 100001–100005)

  VD.loadSpine = loadSpine;
  VD.UnitVisual = UnitVisual;
})(window.VD = window.VD || {});
