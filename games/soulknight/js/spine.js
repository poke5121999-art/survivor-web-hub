// Bộ vẽ rig Spine cho trùm (Unity dùng Spine-Unity, web dùng spine-canvas của Esoteric Software).
// Tệp skel của Soul Knight là Spine 4.2.40 (chuỗi phiên bản ở đầu .skel.bytes [ĐO]) nên nạp đúng spine-canvas@4.2.40.
// SK.spine.init(): Promise nạp thư viện (lười); không tải được thì S.error + cảnh báo, trùm dùng hình tĩnh dự phòng.
// SK.spine.load(tên) -> Promise<Rig>; Rig.make() -> thể hiện: {play, update, draw, bone, counts, events}.
(function () {
  'use strict';
  const SK = window.SK;
  const LIB = 'https://cdn.jsdelivr.net/npm/@esotericsoftware/spine-canvas@4.2.40/dist/iife/spine-canvas.js';
  const DIR = 'art/spine/';
  const S = SK.spine = { ready: null, ok: false, rigs: {}, version: '4.2.40' };

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.spine && window.spine.SkeletonRenderer) return res();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => (window.spine && window.spine.SkeletonRenderer ? res() : rej(new Error('spine-canvas loaded without global spine')));
      s.onerror = () => rej(new Error('spine-canvas script failed to load'));
      document.head.appendChild(s);
    });
  }
  // Nạp lười: chỉ tải thư viện khi có trùm Spine thật sự sinh ra (hoặc bộ kiểm ép gọi), không tải lúc mở trang.
  S.init = function () {
    return S.ready || (S.ready = loadScript(LIB).then(() => { S.ok = true; return true; }, e => { S.error = e.message; if (SK.warnOnce) SK.warnOnce('spinelib', e.message); return false; }));
  };

  const fetchBuf = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
  const fetchTxt = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
  function image(u) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(u + ' image failed')); i.src = u; }); }

  // Mỗi trùm: art/spine/<tên>/<tên>.{skel.bytes,atlas.txt,png} (tools/spine/extract.py)
  S.load = function (name, version) {
    if (S.rigs[name]) return S.rigs[name];
    const q = version ? '?v=' + version : '';
    return (S.rigs[name] = S.init().then(ok => {
      if (!ok) throw new Error('spine-canvas unavailable');
      const base = DIR + name + '/' + name;
      return Promise.all([fetchBuf(base + '.skel.bytes' + q), fetchTxt(base + '.atlas.txt' + q), image(base + '.png' + q)]).then(([bin, atxt, img]) => {
        const sp = window.spine;
        const atlas = new sp.TextureAtlas(atxt);
        for (const p of atlas.pages) p.setTexture(new sp.CanvasTexture(img));
        const data = new sp.SkeletonBinary(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bin));
        return new Rig(name, data);
      });
    }));
  };

  function Rig(name, data) {
    this.name = name; this.data = data;
    this.counts = { bones: data.bones.length, slots: data.slots.length, animations: data.animations.length, events: data.events.length };
    this.anims = {}; for (const a of data.animations) this.anims[a.name] = a.duration;
  }
  // px: số điểm ảnh thế giới mỗi đơn vị Spine = scale SkeletonData (0.01) × scale nút actor (6) × PPU (16) [ĐO prefab]
  Rig.prototype.make = function (px) {
    const sp = window.spine, data = this.data;
    const skel = new sp.Skeleton(data), sd = new sp.AnimationStateData(data);
    sd.defaultMix = 0.2;   // [ĐO skeletondata.defaultMix]
    const st = new sp.AnimationState(sd), renderer = new sp.SkeletonRenderer(null);
    const I = { skel, state: st, px: px, cur: null, evs: [], playing: null };
    st.addListener({ event(tr, ev) { I.evs.push([ev.data.name, tr.animation.name, ev.time]); } });
    I.play = function (name, loop, opts) {
      if (!data.findAnimation(name)) { if (SK.warnOnce) SK.warnOnce('spa' + name, 'spine animation ' + name + ' missing'); return null; }
      const tr = st.setAnimation(0, name, !!loop);
      if (opts && opts.mix != null) tr.mixDuration = opts.mix;
      I.cur = name; I.loop = !!loop;
      return tr;
    };
    // Sau animation hiện tại chạy tiếp `name` (vòng lặp nếu loop)
    I.queue = function (name, loop) { st.addAnimation(0, name, !!loop, 0); };
    // Lớp phụ (Animator nhiều layer của Unity): chạy `name` trên track `tr` (>=1) đè lên track 0, timeScale = speed của state
    I.playOn = function (tr, name, loop, scale) {
      if (!data.findAnimation(name)) { if (SK.warnOnce) SK.warnOnce('spa' + name, 'spine animation ' + name + ' missing'); return null; }
      const t = st.setAnimation(tr, name, !!loop);
      if (scale) t.timeScale = scale;
      return t;
    };
    I.doneOn = tr => { const t = st.getCurrent(tr); return !t || (!t.loop && t.isComplete()); };
    I.clearTrack = tr => st.clearTrack(tr);
    I.time = () => { const t = st.getCurrent(0); return t ? t.trackTime : 0; };
    I.done = () => { const t = st.getCurrent(0); return !t || (!t.loop && t.isComplete()); };
    I.update = function (dt) {
      st.update(dt); st.apply(skel); skel.updateWorldTransform(sp.Physics.update);
    };
    // Đặt gốc xương ở (x, y) px thế giới (y xuống), flip lật ngang
    I.draw = function (ctx, x, y, o) {
      o = o || {};
      renderer.ctx = ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale((o.flip ? -1 : 1) * px, -px);
      if (o.alpha != null && o.alpha < 1) ctx.globalAlpha *= Math.max(0, o.alpha);
      if (o.flash && 'filter' in ctx) ctx.filter = 'brightness(3) saturate(0.3)';
      renderer.draw(skel);
      ctx.restore();
    };
    // Toạ độ thế giới (px, y xuống) của xương `name` khi vẽ ở (x, y)
    I.bone = function (name, x, y, flip) {
      const b = skel.findBone(name);
      return b ? [x + (flip ? -1 : 1) * b.worldX * px, y - b.worldY * px] : null;
    };
    I.drainEvents = function () { const e = I.evs; I.evs = []; return e; };
    return I;
  };
})();
