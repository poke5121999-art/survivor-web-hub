// Truyện tranh mở đầu (IntroStoryUI), chọn ba lô (SelectInitialSlimeUI + prop/pr_event_1_dadbag.glb) và phim tỉnh dậy
// (img/prologue.mp4 = TextAsset "Prologue" của video_prologue.bundle, EXPORT_2D.md).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl, loadGLB } from '../assets.js?v=20261022f';
import { unitMaterial } from '../actors/toon.js?v=20261022f';
import { uiUrl, paint } from '../ui/sprites.js?v=20261022f';
import { X, T, onTap, skipButton, media, sleep } from './ui.js?v=20261022f';
import { L } from './text.js?v=20261022f';

// nền IntroStoryUI / SelectInitialSlimeUI: đen + Gradient (Ui_FX_Circle_Glow_01 màu (0.54, 0.603, 0.811), kéo giãn hơn màn 600)
function glowBg(layer) {
  const g = document.createElement('div'); g.className = 'boxglow'; g.dataset.ui = 'glow';
  paint(g, 'ui_view/Ui_FX_Circle_Glow_01/Ui_FX_Circle_Glow_01', { color: [0.54, 0.603, 0.811, 1] });
  layer.box.insertBefore(g, layer.box.firstChild);
  return g;
}

// ------------------------------------------------------------------ truyện tranh (intro1..8, intro_sheet, g8)
// Card 1228x810 đơn vị (khung Ui_Common_PaperBoard_01, cửa sổ lùi 50 mỗi mép, mặt nạ Ui_PaperBoard_Mask_0) trên nền đen
// có quầng Ui_FX_Circle_Glow_01 màu (0.54, 0.603, 0.811). Thẻ trôi từ phải vào giữa, đứng, rồi trôi sang trái (0:36, g8).
// Thời gian [ĐỀ XUẤT]: vào 0.9 s, đứng 2.6 s. Chạm / Space sang thẻ kế, Skip bỏ cả đoạn.
export async function comic(layer, gender) {
  const G = gender === 'woman' ? 'W' : 'M';
  const scr = X(layer.root, 0, 0, null, null, { cls: 'full storybg', n: 'comic' });
  glowBg(layer).style.opacity = '0.5';   // [ĐO] intro2: nền x2.02 sáng hơn gốc khi để 1.0
  const stage = X(scr, 0, 0, null, null, { cls: 'full' });
  const cards = [1, 2, 3, 4, 5].map(i => {
    const c = X(stage, 313, 143, 654, 431, { ac: true, am: true, cls: 'card', n: 'card' });   // [ĐO TRONG ẢNH] intro2.png: giấy thấy được 330..957 x 157..567 (ảnh khung có lề)
    const pic = media('img', assetUrl(`img/introstory/IntroStory_0${i}_${G}.webp`), 'pic'); c.appendChild(pic);
    pic.style.setProperty('--mask', `url("${assetUrl('img/introstory/Ui_PaperBoard_Mask_0.webp')}")`);
    const fr = media('img', assetUrl('img/introstory/Ui_Common_PaperBoard_01.webp'), 'frame'); c.appendChild(fr);
    c.dataset.i = String(i); return c;
  });
  let skip = false, next = null;
  skipButton(scr, () => { skip = true; if (next) next(); });
  const adv = () => { if (next) next(); };
  scr.addEventListener('pointerdown', adv);
  const key = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); adv(); } else if (e.code === 'Escape') { skip = true; adv(); } };
  addEventListener('keydown', key, true);
  layer.box.dataset.stage = 'comic';
  for (let i = 0; i < cards.length && !skip; i++) {
    const c = cards[i]; c.classList.add('in');
    scr.dataset.card = String(i + 1);
    await new Promise(res => { next = res; setTimeout(res, 3500); });
    next = null;
    c.classList.remove('in'); c.classList.add('out');
  }
  removeEventListener('keydown', key, true);
  await sleep(skip ? 100 : 700);
  scr.remove(); layer.box.querySelectorAll('.boxglow').forEach(e => e.remove());
  return { skipped: skip };
}

// ------------------------------------------------------------------ chọn ba lô (pack2/3, pick1..7, clip 0:39-0:48)
// Hai ba lô cùng mô hình PR_Event_1_DadBag. Ba lô vàng = albedo của prefab (OBJ_DadBag_Albedo); ba lô xanh (thân navy, nắp
// xanh lơ) = OBJ_DadBag_3_Albedo GỐC trong ui_view.bundle (vật liệu OBJ_DadBag_3_Base / _3_Outline của màn chọn ba lô, cùng
// UV), xuất ra prop/tex/OBJ_DadBag_3_Albedo.webp bằng tools/export_prop.py (F5a; trước đó đổi màu trên canvas, đã bỏ).
// Slime khởi đầu: server gửi. Ảnh thật (inn1.png sau khi chọn ba lô xanh) và clip 1:12 (cũng chọn ba lô xanh) cho
// SL_ElecChicken_WindFire [ĐO TRONG ẢNH]; ba lô vàng = SL_ElecChicken_WindElectric [ĐỀ XUẤT] (cùng loài, hệ Điện hợp màu vàng).
export const BAGS = [
  { id: 'blue', slime: 'SL_ElecChicken_WindFire', glow: [0.25, 0.55, 1] },
  { id: 'yellow', slime: 'SL_ElecChicken_WindElectric', glow: [1, 0.78, 0.2] },
];
const texLoader = new THREE.TextureLoader(); texLoader.setCrossOrigin('anonymous');
const loadTx = url => new Promise((res, rej) => texLoader.load(url, t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; res(t); }, undefined,
  () => { (window.__wosErrors = window.__wosErrors || []).push('texture load failed: ' + url); rej(new Error('texture load failed: ' + url)); }));

const BLUE_ALBEDO = 'prop/tex/OBJ_DadBag_3_Albedo.webp';

async function bagModel(blue) {
  const path = 'prop/pr_event_1_dadbag.glb', g = await loadGLB(path);
  const base = path.replace(/[^/]+$/, '');
  const root = SkeletonUtils.clone(g.scene);   // clone thường không gắn lại xương: hai ba lô dùng chung bộ xương gốc
  const jobs = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (/PR_Cube/.test(o.name) || /Cube/.test(o.material.name)) { o.visible = false; return; }   // khối Cube trong túi: chỉ hiện lúc mở túi
    const ex = o.material.userData || {}, outline = /Outline/.test(o.material.name);
    jobs.push((async () => {
      const tex = ex.tex || {}, texs = {};
      if (tex._MainTex) texs.albedo = await loadTx(assetUrl(blue ? BLUE_ALBEDO : base + tex._MainTex));
      if (tex._MaskTex && !outline) texs.mask = await loadTx(assetUrl(base + tex._MaskTex)).catch(() => null);
      const shared = { ...ex, shared: { _Ramp: tex._Ramp ? base + tex._Ramp : undefined } };
      o.material = unitMaterial(shared, texs, outline, { hasColor: !!o.geometry.attributes.color, tint: [1.22, 1.22, 1.22, 1] });   // [ĐỀ XUẤT] sáng hơn cho gần pick3
      o.frustumCulled = false;
    })());
  });
  await Promise.all(jobs);
  const mixer = new THREE.AnimationMixer(root);
  const act = n => { const c = g.animations.find(a => a.name === n); return c ? mixer.clipAction(c) : null; };
  return { root, mixer, act };
}

export async function pickBackpack(layer, renderer) {
  const scr = X(layer.root, 0, 0, null, null, { cls: 'full storybg', n: 'pack' });
  glowBg(layer).style.opacity = '0.5';   // CameraView (3D) phủ gần hết quầng: pack2 nền tối hơn truyện tranh
  const cv = renderer.domElement; cv.style.cssText = ''; cv.className = 'packcv'; cv.dataset.ui = 'packCanvas'; layer.box.insertBefore(cv, layer.root);   // cssText: bỏ vị trí của gương (cùng renderer)
  const size = () => { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 0.1, 100);
  size(); addEventListener('resize', size);
  const bags = await Promise.all(BAGS.map(async (b, i) => {
    const m = await bagModel(i === 0);
    const grp = new THREE.Group(); grp.add(m.root); scene.add(grp);
    m.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m.root), c = bb.getCenter(new THREE.Vector3()), h = bb.max.y - bb.min.y || 1;
    m.root.position.sub(c); const k = 1 / h; grp.scale.setScalar(k);
    // quầng sáng màu (FX_Choice / viền phát sáng trong pick3): sprite cộng màu sau ba lô [ĐỀ XUẤT]
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.TextureLoader().load(uiUrl('ui_view/Ui_FX_Circle_Glow_01/Ui_FX_Circle_Glow_01')),
      color: new THREE.Color(...b.glow), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(1.7, 1.7, 1); sp.position.set(0, 0.1, 0.3); scene.add(sp);
    const idleS = m.act('OBJ_DadBag_Pocket_IdleSelected'), idleU = m.act('OBJ_DadBag_Pocket_IdleUnselected');
    (idleU || idleS) && (idleU || idleS).play();
    return { ...b, m, grp, sp, idleS, idleU, pos: new THREE.Vector3(), scl: 1 };
  }));
  // bố cục [ĐO TRONG ẢNH]: tổng quan pack2 (hai ba lô cạnh nhau, cao ~150 px/720), chọn pick3 (ba lô chọn cao ~300 px ở giữa,
  // ba lô kia ~180 px ở mép phải). Camera nhìn -z -> +z: x three âm = bên phải màn.
  cam.position.set(0, 0, -9); cam.lookAt(0, 0, 0);
  if (window.WOS_INTRO) window.WOS_INTRO.pack = { bags, cam, scene, THREE };
  const LAYOUT = {
    over: [{ x: 0.78, y: 0.05, s: 1.75 }, { x: -1.04, y: 0.05, s: 1.75 }],
    0: [{ x: -0.14, y: 0.06, s: 2.0 }, { x: -2.19, y: -0.23, s: 1.17 }],
    1: [{ x: 2.19, y: -0.23, s: 1.17 }, { x: 0.14, y: 0.06, s: 2.0 }],
  };
  let mode = 'over', focus = 0, last = performance.now(), raf = 0;
  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const L0 = LAYOUT[mode];
    bags.forEach((b, i) => {
      const t = L0[i], k = Math.min(1, dt * 6);
      b.grp.position.x += (t.x - b.grp.position.x) * k; b.grp.position.y += (t.y - b.grp.position.y) * k;
      b.scl += (t.s - b.scl) * k; b.grp.scale.setScalar(b.scl / 1); b.grp.rotation.y = Math.PI - 0.22 + Math.sin(now / 1400 + i) * 0.05; b.grp.rotation.x = 0.12;
      b.sp.position.set(b.grp.position.x, b.grp.position.y + 0.1 * b.scl, 0.4); b.sp.scale.setScalar(1.7 * b.scl);
      b.sp.material.opacity = (mode === 'over' ? 0.5 : focus === i ? 0.75 : 0.4) * (0.85 + 0.15 * Math.sin(now / 300 + i * 2));
      b.m.mixer.update(dt);
    });
    renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(tick);
  // nút: mũi tên trái/phải (Icon_Arrow_Small_Left/Right), lựa chọn ở góc phải dưới (SelectButtonLayout (-100, 100) neo phải
  // dưới, Dialogue_List_Unpressed, chữ 30, phím Space / Esc như ảnh clip 0:48)
  const arrow = (x, right, n) => {
    const b = X(scr, x, 342, 36, 36, { am: true, ar: right, spr: 'Common/Ui_Bg_Round_02_264px', col: [0.1, 0.23, 0.3, 1], cls: 'btn', n });
    X(b, 4, 4, 28, 28, { spr: right ? 'Icon/Icon_Arrow_Small_Right' : 'Icon/Icon_Arrow_Small_Left' }); return b;
  };
  const la = arrow(36, false, 'arrowL'), ra = arrow(1208, true, 'arrowR');
  const opts = X(scr, 935, 590, 300, 92, { ar: true, ab: true, cls: 'col packopts', n: 'packOpts' }); opts.hidden = true;
  const opt = (label, cap, n) => {
    const b = document.createElement('div'); b.className = 'f btn popt'; b.dataset.ui = n;
    paint(b, 'DialogueUI/Dialogue_List_Unpressed', { sliced: true });
    T(b, label, 30, [1, 1, 1, 1], 'ptxt');
    const kc = document.createElement('span'); kc.className = 'keycap'; kc.textContent = cap; b.appendChild(kc);
    opts.appendChild(b); return b;
  };
  let optT = 0;
  const bSel = opt(L('pickSelect'), 'Space', 'pickSelect'), bChg = opt(L('pickChange'), 'Esc', 'pickChange');
  const setFocus = i => {
    focus = (i + 2) % 2; mode = focus; scr.dataset.focus = BAGS[focus].id;
    clearTimeout(optT); optT = setTimeout(() => { opts.hidden = false; }, 1200);   // pick3: lúc đang phóng chưa có lựa chọn; clip 0:48 mới hiện
    bags.forEach((b, j) => {
      const on = j === focus, a = on ? b.idleS : b.idleU, o = on ? b.idleU : b.idleS;
      if (a && o) { a.reset().play(); a.crossFadeFrom(o, 0.25, false); }
    });
  };
  layer.box.dataset.stage = 'pack';
  const ray = new THREE.Raycaster(), nd = new THREE.Vector2();
  const hitBag = e => {
    nd.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(nd, cam);
    let best = -1, bd = Infinity;
    bags.forEach((b, i) => { const hs = ray.intersectObject(b.grp, true); if (hs.length && hs[0].distance < bd) { bd = hs[0].distance; best = i; } });
    if (best < 0) {   // ngoài lưới: lấy ba lô gần điểm chạm theo bề ngang màn
      const xs = bags.map(b => b.grp.position.clone().project(cam).x);
      best = Math.abs(xs[0] - nd.x) < Math.abs(xs[1] - nd.x) ? 0 : 1;
    }
    return best;
  };
  const chosen = await new Promise(res => {
    const choose = () => { if (mode === 'over') return; cleanup(); res(focus); };
    const change = () => setFocus(mode === 'over' ? 0 : focus + 1);
    const key = e => {
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); if (mode === 'over') setFocus(0); else choose(); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); change(); }
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') setFocus(mode === 'over' ? 0 : focus - 1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') setFocus(mode === 'over' ? 1 : focus + 1);
    };
    const tap = e => { const i = hitBag(e); if (mode !== 'over' && i === focus) return; setFocus(i); };
    const cleanup = () => { removeEventListener('keydown', key, true); cv.removeEventListener('pointerdown', tap); scr.removeEventListener('pointerdown', tap); };
    addEventListener('keydown', key, true); cv.addEventListener('pointerdown', tap); scr.addEventListener('pointerdown', tap);
    onTap(la, () => setFocus(mode === 'over' ? 0 : focus - 1)); onTap(ra, () => setFocus(mode === 'over' ? 1 : focus + 1));
    onTap(bSel, choose); onTap(bChg, change);
  });
  clearTimeout(optT); opts.hidden = true;
  // mở túi (OBJ_DadBag_Pocket_1_Open) rồi tối màn (pick7)
  const b = bags[chosen], op = b.m.act('OBJ_DadBag_Pocket_1_Open');
  if (op) { op.setLoop(THREE.LoopOnce, 1); op.clampWhenFinished = true; op.reset().play(); }
  await sleep(900);
  layer.box.classList.add('fadeout'); await sleep(600);
  cancelAnimationFrame(raf); removeEventListener('resize', size); cv.remove(); scr.remove(); layer.box.querySelectorAll('.boxglow').forEach(e => e.remove()); layer.box.classList.remove('fadeout');
  return BAGS[chosen];
}

// ------------------------------------------------------------------ phim tỉnh dậy (pro1..8, clip 0:54) + Skip
export async function wakeFilm(layer) {
  const scr = X(layer.root, 0, 0, null, null, { cls: 'full film', n: 'film' });
  const v = media('video', assetUrl('img/prologue.mp4'), 'cover film'); v.playsInline = true; v.setAttribute('playsinline', '');
  v.dataset.ui = 'filmVideo'; layer.box.insertBefore(v, layer.root);
  layer.box.dataset.stage = 'film';
  let end;
  const done = new Promise(res => { end = res; });
  v.addEventListener('ended', () => end('ended'));
  v.addEventListener('error', () => end('error'));
  skipButton(scr, () => end('skip'));
  const key = e => { if (e.code === 'Escape') { e.preventDefault(); end('skip'); } };
  addEventListener('keydown', key, true);
  v.play().catch(() => { v.muted = true; v.play().catch(() => end('blocked')); });
  const how = await done;
  removeEventListener('keydown', key, true);
  v.pause(); v.removeAttribute('src'); v.load(); v.remove(); scr.remove();
  return how;
}
