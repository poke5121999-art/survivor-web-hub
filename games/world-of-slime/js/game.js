// Vòng chơi lát cắt đầu: bản đồ + người chơi + slime đồng hành + camera + nhập + bước chân + HUD + màn tải.
// Logic chạy trong toạ độ Unity (x phải, z lên màn hình, y cao); chỉ khi đặt Object3D mới đổi sang three (-x, y, z).
import * as THREE from 'three';
import { REV, PARAMS, MOVE } from './config.js?v=20261021b';
import { GameMap, loadMapData } from './world/map.js?v=20261021b';
import { envTime } from './world/envmat.js?v=20261021b';
import { Player, Slime } from './actors/actors.js?v=20261021b';
import { FollowCamera } from './camera.js?v=20261021b';
import { makeIntent, quantizeMove, endFrame } from './input/intent.js?v=20261021b';
import { attachPC } from './input/pc.js?v=20261021b';
import { attachMobile } from './input/mobile.js?v=20261021b';
import { Audio } from './audio.js?v=20261021b';
import { Hud } from './ui/hud.js?v=20261021b';
import { showLoading } from './ui/loading.js?v=20261021b';
import { state, set } from './state.js?v=20261021b';
import { t } from '../data/loc_vi.js?v=20261021b';

const errors = (window.__wosErrors = window.__wosErrors || []);
addEventListener('error', e => errors.push('error: ' + e.message));
addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));

function setStatus(m) { const s = document.getElementById('status'); if (s) { s.textContent = m; s.hidden = !m; } }
let loading = null;

export async function boot(platform) {
  const root = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ antialias: platform === 'pc', powerPreference: 'high-performance', preserveDrawingBuffer: PARAMS.has('shot') });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, platform === 'pc' ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);
  const scene = new THREE.Scene();

  loading = showLoading(platform === 'pc');
  const intent = makeIntent();
  // HUD dựng ngay (ẩn sau màn tải) để sprite tải song song với bản đồ
  const hud = new Hud(platform, { onAction: a => { intent.pressed.add(a); if (intent.source === 'none') intent.source = 'hud'; } });
  hud.root.style.visibility = 'hidden';

  loading.phase('bản đồ');
  const mapName = (PARAMS.get('map') || 'dev').replace(/[^a-z0-9_-]/gi, '');
  const gender = PARAMS.get('gender') === 'woman' ? 'woman' : 'man';
  const slimeId = PARAMS.get('slime') || 'SL_Slime_Water';
  // nhân vật tải song song với bản đồ (trước đây tuần tự)
  const actorsP = Promise.all([Player.create(gender), Slime.create(slimeId)]);
  actorsP.catch(() => {});
  const data = await loadMapData(new URL('data/maps/' + mapName + '.json?v=' + REV, location.href).href);
  const map = new GameMap(data);
  await map.build({ onProgress: f => { loading.arm(); loading.phase('bản đồ ' + Math.round(f * 100) + '%'); } });
  scene.add(map.root);
  const fog = data.client.verticalFogData;
  scene.background = new THREE.Color().setRGB(...(fog && fog.color ? fog.color.slice(0, 3) : [0.56, 0.72, 0.79]), THREE.SRGBColorSpace);
  document.getElementById('devlabel').hidden = !data._dev;

  loading.phase('nhân vật');
  const [player, slime] = await actorsP;
  scene.add(player.object, slime.object);
  if (slimeId !== state.party[0].id) state.party[0] = { ...state.party[0], id: slimeId, name: slimeId.replace(/^SL_/, '').replace(/_/g, ' ') };
  for (const o of [player, slime]) { o.object.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(o.object); o.height = bb.max.y - bb.min.y; }
  hud.map = map; hud.drawMinimap();
  hud.portrait(renderer, player.object);
  // [ĐỀ XUẤT] nhiệm vụ mẫu để thấy bố cục QuestBookmarkLayout (tên nhiệm vụ do server gửi; dịch từ khung hình V4Van)
  // ?quest: hiện nhiệm vụ mẫu, ?warn: hiện cảnh báo thể lực (để so với khung hình); mặc định như ảnh chụp demo thật
  if (PARAMS.has('quest')) set({ quest: { title: 'Thảo Mộc Trong Hộp', objectives: [{ text: 'Thảo mộc 0/1', done: false }] } });
  if (PARAMS.has('warn')) set({ warnStamina: true });

  const audio = new Audio();
  const at = (PARAMS.get('at') || '').split(',').map(Number);   // ?at=x,z: đặt chỗ xuất phát (để chụp thử)
  const sp = at.length === 2 && at.every(isFinite) ? { x: at[0], z: at[1] } : map.spawn();
  const P = { x: sp.x, z: sp.z, y: map.getHeight(sp.x, sp.z), yaw: Math.PI, speed: 0, dashT: 0, dashCd: 0, dashCdMax: MOVE.dash.cooldown, dashDir: null, attackT: 0, dashes: 0, attacks: 0 };
  const S = { x: sp.x - 1.2, z: sp.z - 0.8, y: map.getHeight(sp.x - 1.2, sp.z - 0.8), yaw: Math.PI, moving: false, attackT: 0 };
  if (!map.canStand(S.x, S.z)) { S.x = P.x; S.z = P.z - 1; S.y = P.y; }

  const fcam = new FollowCamera(map, innerWidth / innerHeight);
  if (+PARAMS.get('zoom') > 0) fcam.dist = +PARAMS.get('zoom');   // ?zoom=<m>: khoảng cách camera (để chụp thử)
  if (platform === 'pc') attachPC(intent, renderer.domElement, { onWheel: n => fcam.wheel(n) });
  else attachMobile(intent, root, hud, { onPinch: f => fcam.zoom(f) });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); fcam.setAspect(innerWidth / innerHeight); });

  // bước chân theo sự kiện clip, landType ô dưới chân
  player.onEvent = e => { if (/Footstep/.test(e.fn)) audio.play(player.footstepEvent, { landType: map.landTypeAt(P.x, P.z) }); };
  slime.onEvent = e => { if (/Footstep/.test(e.fn)) audio.play(slime.footstepEvent, { landType: map.landTypeAt(S.x, S.z), gain: 0.6 }); };

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const aimPoint = () => {
    if (!intent.mouse) return null;
    ndc.set(intent.mouse.x / innerWidth * 2 - 1, -(intent.mouse.y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, fcam.cam); plane.constant = -P.y;
    return ray.ray.intersectPlane(plane, hit) ? { x: -hit.x, z: hit.z } : null;
  };

  // đi từng trục để trượt dọc vách thay vì dừng hẳn
  const tryMove = (o, dx, dz) => {
    let moved = false;
    if (dx && map.canStand(o.x + dx, o.z, o.y)) { o.x += dx; moved = true; }
    if (dz && map.canStand(o.x, o.z + dz, o.y)) { o.z += dz; moved = true; }
    return moved;
  };
  const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
  const place = (obj, o) => { obj.position.set(-o.x, o.y, o.z); obj.rotation.set(0, o.yaw, 0); };
  // hướng nhìn Unity (dx, dz) -> yaw three (mô hình glTF nhìn +Z): three dir = (-dx, dz)
  const yawOf = (dx, dz) => Math.atan2(-dx, dz);

  const stats = { frames: 0, fps: 0, acc: 0, dist: 0, start: { x: P.x, z: P.z } };
  // yaw = Math.PI lúc đầu: mô hình glTF nhìn +Z (= Unity +z, xa camera), nên quay về phía camera như lúc vào game
  const log = [];
  const W = window.WOS = { REV, platform, map, player, slime, P, S, intent, audio, stats, camera: fcam, renderer, scene, errors, hud, state, log };
  let battleT = 0;
  const PANELS = { worldmap: 'Common.WorldMap', inventory: 'Common.Inventory', slimeindex: 'Common.SlimeIndex', slimeinventory: 'Archive.SlimeStorageTitle',
    quest: 'Common.Quest', party: 'Common.Party', perk: 'Common.Perk', community: 'Settings.Keymap.Community', chat: 'Settings.Keymap.Community', mail: 'Common.Inventory', escape: 'Common.Settings' };
  const recall = () => {   // Return (huýt sáo): dừng trận, gọi slime về cạnh người chơi
    S.x = P.x - Math.sin(P.yaw); S.z = P.z + Math.cos(P.yaw);
    if (!map.canStand(S.x, S.z)) { S.x = P.x; S.z = P.z; }
    S.y = map.getHeight(S.x, S.z); S.attackT = 0; battleT = 0; set({ battle: false }); audio.play('ui_whistle');
  };
  const attack = aimed => {
    P.attackT = 0.5; P.attacks++;
    const a = aimed && platform === 'pc' ? aimPoint() : null;
    if (a) P.yaw = yawOf(a.x - P.x, a.z - P.z);
    S.attackT = 0.83; battleT = 3;   // [ĐỀ XUẤT] slime giữ trạng thái đánh 3 s sau đòn cuối (chưa có quái thật)
    if (!state.battle) set({ battle: true });
    audio.play('ui_attack');
  };
  // hành động SMActions mỗi khung (phím, chuột, nút HUD, cảm ứng)
  const actions = () => {
    for (const a of intent.pressed) {
      log.push(a); if (log.length > 200) log.shift();
      if (a === 'attack') attack(true);
      else if (a === 'interactAttack') { if (state.battle) recall(); else attack(true); }   // KeyboardInteractAttack: không có NPC gần thì đánh; đang đánh thì nút lớn là Return
      else if (a === 'return') recall();
      else if (/^equip\d$/.test(a)) {
        const i = +a.slice(5);
        if (state.party[i]) { if (state.equipped !== i) set({ equipped: i }); log.push('equipped:' + i); }
        else hud.toast(t('PlayScene.Slimeslotlimit'));
      } else if (/^slot[234]$/.test(a)) {
        const b = hud.el.items[+a.slice(4) - 2]; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150);
      } else if (a === 'switch') { set({ control: state.control === 'user' ? 'slime' : 'user' }); hud.toast(t('Settings.Keymap.Switch')); }
      else if (a === 'minimap') set({ minimapOpen: !state.minimapOpen });
      else if (a === 'combatmode') { set({ autoBattle: !state.autoBattle }); hud.toast(t('Settings.Keymap.CombatMode')); }
      else if (a === 'escape' && state.minimapOpen) set({ minimapOpen: false });
      else if (PANELS[a]) hud.toast(t(PANELS[a]) + ' · chưa có');
    }
  };

  setStatus('');
  hud.root.style.visibility = '';
  loading.done();
  fcam.update(0, P, true);
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    stats.frames++; stats.acc += dt; if (stats.acc >= 1) { stats.fps = Math.round(stats.frames / stats.acc); stats.frames = 0; stats.acc = 0; const f = document.getElementById('fps'); if (f) f.textContent = stats.fps + ' fps'; }
    envTime.value += dt;

    // --- người chơi
    const q = quantizeMove(intent.move, MOVE.dirs);
    P.dashCd = Math.max(0, P.dashCd - dt);
    if (intent.pressed.has('dash') && P.dashCd <= 0) {
      const d = q.speedStep ? { x: Math.cos(q.angle), z: Math.sin(q.angle) } : { x: -Math.sin(P.yaw), z: Math.cos(P.yaw) };
      P.dashT = MOVE.dash.time; P.dashCd = MOVE.dash.cooldown; P.dashDir = d; P.dashes++;
    }
    actions();
    if (battleT > 0 && (battleT -= dt) <= 0 && state.battle) set({ battle: false });
    let vx = 0, vz = 0;
    if (P.dashT > 0) {
      P.dashT -= dt; const v = MOVE.dash.dist / MOVE.dash.time;
      vx = P.dashDir.x * v; vz = P.dashDir.z * v;
    } else if (q.speedStep) {
      const v = MOVE.walk * q.speedStep / 10;     // không có phím chạy: tốc độ theo speedStep (PC luôn 10)
      vx = Math.cos(q.angle) * v; vz = Math.sin(q.angle) * v;
    }
    const px = P.x, pz = P.z;
    if (vx || vz) tryMove(P, vx * dt, vz * dt);
    const step = Math.hypot(P.x - px, P.z - pz); stats.dist += step;
    P.speed = step / Math.max(dt, 1e-4);
    const gy = map.getHeight(P.x, P.z);
    P.y += (gy - P.y) * Math.min(1, dt * (map.onStair(P.x, P.z) ? 30 : 14));
    P.attackT = Math.max(0, P.attackT - dt);
    if (vx || vz) P.yaw = lerpAngle(P.yaw, yawOf(vx, vz), Math.min(1, dt * 16));
    const moving = P.speed > 0.2;
    if (P.attackT > 0 && !moving) player.play('SlimeAttack', 0.1);
    else if (moving) player.play('Walk', 0.15, Math.max(0.6, Math.min(1.4, P.speed / MOVE.walk)));
    else player.play('Idle', 0.2);
    place(player.object, P);
    player.update(dt);

    // --- slime đồng hành: theo sau ~1.6 m [ĐỀ XUẤT]; Return (huýt sáo) gọi về cạnh người chơi
    const tx = P.x, tz = P.z, dx = tx - S.x, dz = tz - S.z, d = Math.hypot(dx, dz);
    if (d > 12) { S.x = P.x; S.z = P.z - 1; S.y = P.y; }
    if (d > (S.moving ? 1.4 : 2.2)) {
      S.moving = true;
      const v = Math.min(MOVE.walk * 1.6, Math.max(MOVE.walk * 0.9, P.speed * 1.05, d * 1.2));
      const k = Math.min(1, v * dt / d);
      if (!tryMove(S, dx * k, dz * k)) { S.x += dx * k; S.z += dz * k; }   // kẹt sau vật cản thì đi xuyên [ĐỀ XUẤT]
      S.yaw = lerpAngle(S.yaw, yawOf(dx, dz), Math.min(1, dt * 10));
    } else S.moving = false;
    const sy = map.getHeight(S.x, S.z); if (sy > -100) S.y += (sy - S.y) * Math.min(1, dt * 12);
    S.attackT = Math.max(0, S.attackT - dt);
    if (S.attackT > 0 && !S.moving) slime.play('Attack', 0.1); else slime.play(S.moving ? 'Walk' : 'Idle', 0.15);
    place(slime.object, S);
    slime.update(dt);

    fcam.update(dt, P);
    renderer.render(scene, fcam.cam);
    hud.frame(fcam.cam, P, S, player, slime, P.yaw);
    endFrame(intent);
  });
  W.ready = true; window.__ready = true;
  return W;
}

export function start(platform) {
  boot(platform).catch(e => { console.error(e); errors.push(String(e && e.message || e)); setStatus('Lỗi: ' + (e && e.message || e)); if (loading) loading.fail('Lỗi: ' + (e && e.message || e)); });
}
