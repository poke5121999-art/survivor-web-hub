// Vòng chơi lát cắt đầu: bản đồ + người chơi + slime đồng hành + camera + nhập + bước chân + HUD + màn tải.
// Logic chạy trong toạ độ Unity (x phải, z lên màn hình, y cao); chỉ khi đặt Object3D mới đổi sang three (-x, y, z).
import * as THREE from 'three';
import { REV, PARAMS, MOVE } from './config.js?v=20261022c';
import { GameMap, loadMapData } from './world/map.js?v=20261022c';
import { envTime, envMaterial } from './world/envmat.js?v=20261022c';
import { Player, Slime, Npc } from './actors/actors.js?v=20261022c';
import { loadTex, loadGLB, assetUrl } from './assets.js?v=20261022c';
import { MAPS, DEFAULT_MAP } from '../data/portals.js?v=20261022c';
import { Post, GRADE } from './post.js?v=20261022c';
import { FollowCamera } from './camera.js?v=20261022c';
import { makeIntent, quantizeMove, endFrame } from './input/intent.js?v=20261022c';
import { attachPC } from './input/pc.js?v=20261022c';
import { attachMobile } from './input/mobile.js?v=20261022c';
import { Audio } from './audio.js?v=20261022c';
import { Hud } from './ui/hud.js?v=20261022c';
import { showLoading } from './ui/loading.js?v=20261022c';
import { state, set } from './state.js?v=20261022c';
import { t } from '../data/loc_vi.js?v=20261022c';
import { Story } from './ui/story.js?v=20261022c';
import { QuestEngine } from './quest/engine.js?v=20261022c';
import { BOXES, WEST_GATE } from './quest/data.js?v=20261022c';
import { Combat } from './combat/combat.js?v=20261022c';   // F1: chiến đấu, rừng, đấu tay đôi
import { runIntro, avatarFor, applyProfile, attachSetting } from './intro/intro.js?v=20261022c';   // F2: mở đầu + Setting

const errors = (window.__wosErrors = window.__wosErrors || []);
addEventListener('error', e => errors.push('error: ' + e.message));
addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));

// yaw độ của data/portals.js (0 = nhìn +z lên màn hình, 90 = sang phải +x, 180 = nhìn xuống camera) -> yaw three
function yawOfDeg(d) { const r = d * Math.PI / 180; return Math.atan2(-Math.sin(r), Math.cos(r)); }
function setStatus(m) { const s = document.getElementById('status'); if (s) { s.textContent = m; s.hidden = !m; } }
let loading = null;

export async function boot(platform) {
  const profile = await runIntro(platform); applyProfile(profile);   // null khi ?intro=0
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
  // mặc định vào quán trọ Larus (257) như game thật; ?map=dev = bản đồ thử, ?map=110 / 478 vào thẳng
  let mapId = (PARAMS.get('map') || String(DEFAULT_MAP)).replace(/[^a-z0-9_-]/gi, '');
  const gender = PARAMS.get('gender') === 'woman' ? 'woman' : 'man';
  const slimeId = PARAMS.get('slime') || (profile && profile.slime) || 'SL_Slime_Water';
  // nhân vật tải song song với bản đồ (trước đây tuần tự)
  const actorsP = Promise.all([profile ? avatarFor(profile) : Player.create(gender), Slime.create(slimeId)]);
  actorsP.catch(() => {});
  const fetchMap = async (id, onProgress) => {
    const d = await loadMapData(new URL('data/maps/' + id + '.json?v=' + REV, location.href).href);
    const m = new GameMap(d);
    await m.build({ onProgress });
    return m;
  };
  let map = await fetchMap(mapId, f => { loading.arm(); loading.phase('bản đồ ' + Math.round(f * 100) + '%'); });
  let data = map.data;
  // nền: mapBackgroundType 1 = InsideCommon (img/mapbackground, nền xanh đêm có quầng sáng của nhà trong), 0 = trời
  const bgTex = {};
  const applyBackground = () => {
    const c = map.data.client, fog = c.verticalFogData;
    if (c.mapBackgroundType === 1) {
      const tx = bgTex[1] || (bgTex[1] = loadTex('img/mapbackground/InsideCommon.webp', { srgb: true }));
      scene.background = tx;
    } else scene.background = new THREE.Color().setRGB(...(fog && fog.color ? fog.color.slice(0, 3) : [0.56, 0.72, 0.79]), THREE.SRGBColorSpace);
  };
  // hậu kỳ màu theo mapLightType (post.js); ?grade=0 tắt; bản đồ thử không chấm màu
  const post = new Post(renderer, platform === 'pc');
  const applyGrade = () => post.setGrade(PARAMS.get('grade') === '0' || map.data._dev ? null : GRADE[map.data.client.mapLightType] || null);
  scene.add(map.root); applyBackground(); applyGrade();
  const setLabel = () => {   // bản đồ thử / bản đồ dựng theo clip (không phải dữ liệu server) có nhãn riêng
    const el = document.getElementById('devlabel'); el.hidden = !data._dev && !data._clip;
    el.textContent = data._clip ? 'dựng theo clip' : 'bản đồ thử';
    el.style.top = data._clip ? 'auto' : ''; el.style.bottom = data._clip ? '4px' : '';
  };
  setLabel();

  loading.phase('nhân vật');
  const [player, slime] = await actorsP;
  scene.add(player.object, slime.object);
  if (slimeId !== state.party[0].id) state.party[0] = { ...state.party[0], id: slimeId, name: slimeId.replace(/^SL_/, '').replace(/_/g, ' ') };
  for (const o of [player, slime]) { o.object.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(o.object); o.height = bb.max.y - bb.min.y; }
  const mapInfo = () => MAPS[map.data.id] || null;
  const setMapHud = () => {
    hud.map = map; hud.drawMinimap();
    const mi = mapInfo();
    if (mi && mi.icon && hud.el.mapIcon) hud.el.mapIcon.src = assetUrl(mi.icon);
    else if (hud.el.mapIcon && state.map.icon) hud.el.mapIcon.src = assetUrl(state.map.icon);
    set({ map: { ...state.map, name: mi && mi.region || 'Larus', detail: mi ? mi.name : (map.data._dev ? 'Bản đồ thử' : map.data.name || '') } });
  };
  setMapHud();
  hud.portrait(renderer, player.object);
  // [ĐỀ XUẤT] nhiệm vụ mẫu để thấy bố cục QuestBookmarkLayout (tên nhiệm vụ do server gửi; dịch từ khung hình V4Van)
  // ?quest: hiện nhiệm vụ mẫu, ?warn: hiện cảnh báo thể lực (để so với khung hình); mặc định như ảnh chụp demo thật
  if (PARAMS.has('warn')) set({ warnStamina: true });

  const audio = new Audio();
  const at = (PARAMS.get('at') || '').split(',').map(Number);   // ?at=x,z: đặt chỗ xuất phát (để chụp thử)
  const info0 = mapInfo();
  const sp = at.length === 2 && at.every(isFinite) ? { x: at[0], z: at[1] }
    : PARAMS.get('from') && info0 && info0.arrive[PARAMS.get('from')] ? info0.arrive[PARAMS.get('from')]
    : info0 && info0.start ? info0.start : info0 && Object.values(info0.arrive)[0] ? Object.values(info0.arrive)[0] : map.spawn();
  const P = { x: sp.x, z: sp.z, y: map.getHeight(sp.x, sp.z), yaw: sp.yaw != null ? yawOfDeg(sp.yaw) : Math.PI, speed: 0, dashT: 0, dashCd: 0, dashCdMax: MOVE.dash.cooldown, dashDir: null, attackT: 0, dashes: 0, attacks: 0 };
  const S = { x: sp.x - 1.2, z: sp.z - 0.8, y: map.getHeight(sp.x - 1.2, sp.z - 0.8), yaw: Math.PI, moving: false, attackT: 0 };
  if (!map.canStand(S.x, S.z)) { S.x = P.x; S.z = P.z - 1; S.y = P.y; }

  audio.playBgm(map.data.client.bgm);
  const fcam = new FollowCamera(map, innerWidth / innerHeight);
  if (+PARAMS.get('zoom') > 0) fcam.dist = +PARAMS.get('zoom');   // ?zoom=<m>: khoảng cách camera (để chụp thử)
  let baseDist = fcam.dist;
  if (platform === 'pc') attachPC(intent, renderer.domElement, { onWheel: n => { if (!state.modal) { fcam.wheel(n); baseDist = fcam.dist; } } });
  else attachMobile(intent, root, hud, { onPinch: f => { if (!state.modal) { fcam.zoom(f); baseDist = fcam.dist; } } });
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); post.resize(); fcam.setAspect(innerWidth / innerHeight); });

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
  const W = window.WOS = { REV, platform, map, player, slime, P, S, intent, audio, stats, camera: fcam, renderer, scene, errors, hud, state, log, npcs: [], maps: [], THREE };

  // ---- nhiệm vụ: js/quest/engine.js (bảng js/quest/data.js) + giao diện js/ui/story.js
  const story = new Story(hud, { renderer });
  const engine = new QuestEngine(story, {
    npcObject: n => { const a = npcs.find(k => k.def.name === n); return a ? a.object : null; },
    npcHeight: n => { const a = npcs.find(k => k.def.name === n); return a ? a.height : null; },
    playerObject: () => player.object, playerHeight: () => player.height,
    duel: () => { W.duelStart = performance.now(); switchMap({ to: 'rudga_arena', at: 'duel', name: 'duel' }).then(() => combat.startDuel()); },
    pushback: () => { const b = WEST_GATE.back; P.x = b.x; P.z = b.z; P.y = map.getHeight(b.x, b.z); P.yaw = yawOfDeg(90); P.dashT = 0; gateT = 1.5; },
  });
  W.quest = engine; W.story = story;
  // ---- chiến đấu (js/combat): slime hoang của bản đồ, đồng hành tự đánh, huýt sáo, đấu tay đôi với Rudga
  const combat = new Combat({ scene, hud, story, engine, audio, P, S, player, slime, camera: () => fcam.cam,
    seed: +PARAMS.get('seed') || 0, getNpc: n => npcs.find(k => k.def.name === n) || null,
    onDuelEnd: win => { if (win) { engine.save.duel = true; engine.persist(); } switchMap({ to: 110, at: 'west_gate', name: 'duel_end' }); } });
  W.combat = combat;
  // ?quest: bày trạng thái "đang làm The Herb in the Box" (q1..q3 xong) để so bố cục QuestBookmark với khung hình; chỉ trong bộ nhớ
  if (PARAMS.has('quest')) { engine.save.quests = { q1: { s: 'done', c: {} }, q2: { s: 'done', c: {} }, q3: { s: 'done', c: {} }, q4: { s: 'active', c: {} } }; engine.sync(); }
  let gateT = 0, target = null;
  // hộp trôi dạt (prop/pr_oldbox_*) chỉ ở làng 110
  let props = [];
  const loadProps = async () => {
    for (const o of props) scene.remove(o);
    props = [];
    if (String(map.data.id) !== '110') return;
    const forMap = map;
    for (const b of BOXES) {
      try {
        const g = await loadGLB(b.model);
        if (forMap !== map) return;
        const lib = g.scene.children[0], node = (lib.children[0] || lib).clone(true);
        const texFor = (uri, ramp) => loadTex(/^(map|prop|slime|npc|player)\//.test(uri) ? uri : b.model.replace(/[^/]+$/, '') + uri, { nearest: !!ramp });
        node.traverse(k => { if (k.isMesh) k.material = envMaterial(k.material, { hasVColor: !!k.geometry.attributes._color, texFor }); });
        node.position.set(0, 0, 0);
        const grp = new THREE.Group(); grp.add(node); grp.name = 'box:' + b.id;
        const y = map.getHeight(b.x, b.z);
        grp.position.set(-b.x, y > -100 ? y : 0, b.z); grp.rotation.y = yawOfDeg(b.yaw || 0); if (b.scale) grp.scale.setScalar(b.scale);
        scene.add(grp); props.push(grp);
      } catch (e) { errors.push('box ' + b.id + ': ' + e.message); }
    }
    W.props = props;
  };
  loadProps();

  // ---- NPC của bản đồ (data/portals.js, chỗ đứng [ĐO TRONG ẢNH])
  let npcs = [];
  const loadNpcs = async () => {
    const want = (mapInfo() || {}).npcs || [], forMap = map;
    const made = await Promise.all(want.map(async d => {
      try {
        const a = d.slime ? await Slime.create(d.model) : await Npc.create(d.model);
        a.def = d; a.object.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(a.object); a.height = bb.max.y - bb.min.y;
        return a;
      } catch (e) { errors.push('npc ' + d.name + ': ' + e.message); return null; }
    }));
    if (forMap !== map) return;
    npcs = made.filter(Boolean);
    for (const n of npcs) {
      const d = n.def, y = map.getHeight(d.x, d.z);
      n.object.position.set(-d.x, y > -100 ? y : 0, d.z); n.object.rotation.set(0, yawOfDeg(d.yaw || 0), 0);
      scene.add(n.object);
    }
    hud.setNpcs(npcs.map(n => ({ name: n.def.name, object: n.object, height: n.height })));
    engine.sync();
    W.npcs = npcs;
  };
  const npcsReady = loadNpcs();
  combat.setMap(map, mapInfo());

  // ---- đổi bản đồ qua cửa (portal): mờ đen, tải bản đồ đích, đặt người chơi ở cửa đến
  const fade = document.createElement('div');
  fade.id = 'mapfade';
  fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .25s;z-index:5';
  document.body.appendChild(fade);
  let switching = false;
  const switchMap = async portal => {
    switching = true; W.switching = true;
    fade.style.opacity = '1';
    const t0 = performance.now();
    try {
      const next = await fetchMap(String(portal.to));
      for (const n of npcs) scene.remove(n.object);
      npcs = []; hud.setNpcs([]);
      scene.remove(map.root); map.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      map = next; data = next.data; W.map = map; mapId = String(portal.to);
      scene.add(map.root); applyBackground(); applyGrade();
      setLabel();
      setMapHud(); fcam.setMap(map);
      const a = (mapInfo() && mapInfo().arrive[portal.at]) || map.spawn();
      P.x = a.x; P.z = a.z; P.y = map.getHeight(a.x, a.z); if (a.yaw != null) P.yaw = yawOfDeg(a.yaw);
      P.dashT = 0; S.x = P.x - Math.sin(P.yaw); S.z = P.z + Math.cos(P.yaw);
      if (!map.canStand(S.x, S.z)) { S.x = P.x; S.z = P.z; }
      S.y = map.getHeight(S.x, S.z);
      fcam.update(0, P, true);
      audio.playBgm(map.data.client.bgm);
      await loadNpcs();
      await combat.setMap(map, mapInfo());
      loadProps();
      if (mapInfo() && !mapInfo().duel) story.placeTitle(mapInfo().name);   // sân đấu không có băng tên bản đồ (5:12-5:18)
      W.maps.push({ id: mapId, ms: Math.round(performance.now() - t0), via: portal.name });
    } catch (e) { errors.push('switch map: ' + (e && e.message || e)); }
    fade.style.opacity = '0';
    setTimeout(() => { switching = false; W.switching = false; }, 300);
  };
  const portalAt = (x, z) => ((mapInfo() || {}).portals || []).find(p => x >= p.rect[0] && x <= p.rect[2] && z >= p.rect[1] && z <= p.rect[3]);
  let battleT = 0;
  const PANELS = { worldmap: 'Common.WorldMap', inventory: 'Common.Inventory', slimeindex: 'Common.SlimeIndex', slimeinventory: 'Archive.SlimeStorageTitle',
    quest: 'Common.Quest', party: 'Common.Party', perk: 'Common.Perk', community: 'Settings.Keymap.Community', chat: 'Settings.Keymap.Community', mail: 'Common.Inventory', escape: 'Common.Settings' };
  const recall = () => {   // Return (huýt sáo): dừng trận, gọi slime về cạnh người chơi
    S.x = P.x - Math.sin(P.yaw); S.z = P.z + Math.cos(P.yaw);
    if (!map.canStand(S.x, S.z)) { S.x = P.x; S.z = P.z; }
    S.y = map.getHeight(S.x, S.z); S.attackT = 0; battleT = 0; set({ battle: false }); audio.play('ui_whistle');
    combat.recall();
  };
  const attack = aimed => {
    P.attackT = 0.5; P.attacks++;
    const a = aimed && platform === 'pc' ? aimPoint() : null;
    if (a) P.yaw = yawOf(a.x - P.x, a.z - P.z);
    if (combat.command(a)) { battleT = 0; audio.play('ui_attack'); return; }   // có slime hoang/đối thủ: đồng hành lao vào
    S.attackT = 0.83; battleT = 3;   // [ĐỀ XUẤT] không có mục tiêu: slime giữ trạng thái đánh 3 s sau đòn cuối
    if (!state.battle) set({ battle: true });
    audio.play('ui_attack');
  };
  // hành động SMActions mỗi khung (phím, chuột, nút HUD, cảm ứng)
  const actions = () => {
    if (state.modal) { intent.pressed.clear(); return; }   // hội thoại / bảng đang mở: phím do js/ui/story.js nhận
    for (const a of intent.pressed) {
      log.push(a); if (log.length > 200) log.shift();
      if (a === 'attack') attack(true);
      else if ((a === 'interactAttack' || a === 'interact') && target && !state.battle) engine.interact(target);   // KeyboardInteractAttack: có NPC/hộp trong tầm thì tương tác
      else if (a === 'interact') { /* nút InteractButton khi không còn gì trong tầm */ }
      else if (a === 'interactAttack') { if (state.battle) recall(); else attack(true); }   // không có NPC gần thì đánh; đang đánh thì nút lớn là Return
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
      else if (a === 'quest') story.openQuestLog();
      else if (a === 'perk') story.openPerk();
      else if (a === 'escape' && W.openSetting) W.openSetting();
      else if (PANELS[a]) hud.toast(t(PANELS[a]) + ' · chưa có');
    }
  };

  setStatus('');
  hud.root.style.visibility = '';
  loading.done();
  // ?camat=x,z: giữ điểm nhìn camera cố định (để chụp cặp so ảnh thật, khi người chơi trong ảnh không đứng giữa màn)
  const camAt = (PARAMS.get('camat') || '').split(',').map(Number);
  const camT = () => mapInfo() && mapInfo().camAt ? { ...mapInfo().camAt, y: P.y } : camAt.length === 2 && camAt.every(isFinite) ? { x: camAt[0], z: camAt[1], y: map.getHeight(camAt[0], camAt[1]) > -100 ? map.getHeight(camAt[0], camAt[1]) : P.y } : P;
  fcam.update(0, camT(), true);
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    stats.frames++; stats.acc += dt; if (stats.acc >= 1) { stats.fps = Math.round(stats.frames / stats.acc); stats.frames = 0; stats.acc = 0; const f = document.getElementById('fps'); if (f) f.textContent = stats.fps + ' fps'; }
    envTime.value += dt;

    // --- người chơi
    const q = quantizeMove(state.modal ? { x: 0, y: 0 } : intent.move, MOVE.dirs);
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
    if (!switching && !state.modal) { const pt = portalAt(P.x, P.z); if (pt) switchMap(pt); }
    // nhiệm vụ: bắt đầu nhiệm vụ 1, tìm thứ tương tác được trong tầm, Rudga chặn cổng tây (4:54)
    if (!switching) {
      engine.tick(P, sp);
      target = state.modal ? null : engine.interactAt(map.data.id, P.x, P.z, npcs.map(n => ({ name: n.def.name, x: n.def.x, z: n.def.z })));
      hud.setInteract(target ? target.kind : null);
      gateT = Math.max(0, gateT - dt);
      const g = WEST_GATE.rect;
      if (!state.modal && gateT <= 0 && String(map.data.id) === '110' && P.x >= g[0] && P.x <= g[2] && P.z >= g[1] && P.z <= g[3]) {
        gateT = 1.5;
        if (engine.save.duel) switchMap({ to: 'shadow_forest_entrance', at: 'larus_gate', name: 'west_gate' });   // đã thắng Rudga: cổng tây mở (5:48)
        else engine.talk(WEST_GATE.npc, { gate: true });
      }
    }
    for (const n of npcs) n.update(dt);

    // --- slime đồng hành: js/combat lái khi đang đánh; không thì theo sau ~1.6 m [ĐỀ XUẤT]; Return (huýt sáo) gọi về cạnh người chơi
    const fighting = !switching && combat.update(dt, fcam.cam);
    if (!fighting) {
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
    }
    place(slime.object, S);
    slime.update(dt);

    // hội thoại: camera lại gần và nhìn giữa người chơi với NPC. [ĐO TRONG ẢNH] v9.png -> al1.png quầy kho rộng 330 -> 450 px
    // (x1.36, khoảng cách x0.735); pilot x5.png cũng phóng như vậy so với r1.png
    const dn = state.modal === 'dialogue' && story.dlg && story.dlg.ctx.npc ? npcs.find(n => n.def.name === story.dlg.ctx.npc) : null;
    const want = dn ? baseDist * 0.735 : baseDist;
    fcam.dist += (want - fcam.dist) * Math.min(1, dt * 4);
    if (Math.abs(want - fcam.dist) < 0.05) fcam.dist = want;
    fcam.update(dt, dn ? { x: (P.x + dn.def.x) / 2, z: (P.z + dn.def.z) / 2, y: P.y } : camT());
    post.render(scene, fcam.cam);
    hud.frame(fcam.cam, P, S, player, slime, P.yaw);
    endFrame(intent);
  });
  attachSetting(W, platform);
  W.ready = true; window.__ready = true;
  return W;
}

export function start(platform) {
  boot(platform).catch(e => { console.error(e); errors.push(String(e && e.message || e)); setStatus('Lỗi: ' + (e && e.message || e)); if (loading) loading.fail('Lỗi: ' + (e && e.message || e)); });
}
