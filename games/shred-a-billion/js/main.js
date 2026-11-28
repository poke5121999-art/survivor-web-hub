// SHRED A BILLION web — boot, main loop and glue between the pure-JS sim (js/sim) and the three.js view (js/view).
import { V, REV } from './rev.js';
import * as THREE from 'three';
import { setText, setGlyphs, T } from './sim/i18n.js';
import { Game, TOOL } from './sim/game.js';
import { STAT, Num } from './sim/economy.js';
import { BoxWorld } from './sim/collide.js';
import { Player } from './sim/player.js';
import { Bot } from './sim/bot.js';
import { loadSlice } from './view/scenegraph.js';
import { LightField, FOG, bakedMaterial } from './view/lighting.js';
import { buildStatic } from './view/world.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { Post } from './view/post.js';
import { PileView } from './view/pileview.js';
import { Input } from './view/input.js';
import { Audio } from './view/audio.js';
import { Hud } from './view/hud.js';
import { Shop, setIcons } from './view/shop.js';
import { Prof } from './view/prof.js';
import { Stats } from './view/stats.js';
import { Menu } from './view/menu.js';
import { ViewModel } from './view/vm.js';
import { DroneView } from './view/drones.js';
import { Fx, Vortex } from './view/fx.js';
import { Markers } from './view/markers.js';
import { Dialogue } from './view/dialogue.js';
import { FindsView } from './view/findsview.js';
import { achScreen, wardrobeScreen } from './view/extras.js';
import { prize as tellerPrize, PERK, HATS } from './sim/finds.js';
import { Achievements, ACH, ACH_TOTAL } from './sim/achievements.js';
import { INTRO_TUNE } from './sim/intro.js';
import { Save } from './save.js';
import { FinaleView, FINALE_DYNAMIC } from './view/finaleview.js';
import { FL, STAGE } from './sim/finale.js';
import { Moment, EndFlow } from './view/ending.js';
import { CoopHost, CoopGuest, InputPacker, bindGuestCommands } from './sim/coop.js';
import { CoopUi, CoopBar, pausePlayers, playerName, rememberSession } from './view/coopui.js';
import { RemoteAvatars } from './view/remotes.js';
import { Chat } from './view/chat.js';
import { FunPlay } from './view/funplay.js';
import { intakeBox } from './sim/fun.js';
import { SRC } from './sim/economy.js';
import { setTeam } from './sim/i18n.js';

const Q = new URLSearchParams(location.search);
const DYN_FINDS = /^GoldTeller\/Body\/Model\/Lamp_\d+$|^LobbyBoards\/RelicBoard\/Face\/Niches\/Niche_[^/]+\/Relic\/Model$/;
const $ = (id) => document.getElementById(id);
const loadBar = $('loading').querySelector('.fill'), loadTip = $('loading').querySelector('.tip');
const progress = (f) => { loadBar.style.width = Math.round(f * 100) + '%'; };
const getJSON = (u) => fetch(u + V).then(r => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); });

let settings = Save.settings();
const coarse = matchMedia('(pointer: coarse)').matches;
const lang = Q.get('lang') || settings.lang || 'vi';
const quality = Q.get('q') || (settings.quality === 'auto' ? (coarse ? 'low' : 'high') : settings.quality);
const QUAL = { low: { dpr: 1, edge: 2.5, near: 18, perCell: 1, bloom: false }, medium: { dpr: 1.25, edge: 1.8, near: 22, perCell: 2, bloom: true }, high: { dpr: 1.5, edge: 1.2, near: 26, perCell: 2, bloom: true } }[quality] || { dpr: 1, edge: 2.5, near: 18, perCell: 1, bloom: false };

window.__log = [];
const log = (...a) => { const s = a.join(' '); window.__log.push(s); if (window.__log.length > 400) window.__log.shift(); };
addEventListener('error', (e) => log('ERR', e.message));
addEventListener('unhandledrejection', (e) => log('REJ', String(e.reason && e.reason.message || e.reason)));

async function boot() {
  const [en, vi] = await Promise.all([getJSON('./data/text/en.json'), getJSON('./data/text/vi.json').catch(() => ({}))]);
  setText(lang === 'en' ? en : { ...en, ...vi }, en, lang);
  setGlyphs(coarse
    ? { Primary: '✋', Secondary: '★', Hotbar5: '5', Rally: '5', Interact: '💵', Jump: '▲', Move: '◎', Look: '☝', Pause: 'II', Upgrades: 'NÂNG CẤP', Proficiencies: 'KỸ NĂNG', Crouch: '', Cancel: '✕', Submit: 'OK', ToggleHud: '', Wish: '' }
    : { Primary: '[LMB]', Secondary: '[RMB]', Hotbar5: '[5]', Rally: '[5]', Interact: '[E]', Jump: '[Space]', Move: '[WASD]', Look: '[Mouse]', Pause: '[Esc]', Upgrades: '[Tab]', Proficiencies: '[P]', Crouch: '[Ctrl]', Cancel: '[Esc]', Submit: '[Enter]', ToggleHud: '[H]', Wish: '[F]' });
  document.documentElement.lang = lang;
  const tips = Array.from({ length: 14 }, (_, i) => T('loading.tips.' + (i + 1)));
  loadTip.textContent = tips[Math.floor(Math.random() * tips.length)];
  progress(0.05);

  // renderer + post
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.info.autoReset = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUAL.dpr));
  $('stage').appendChild(renderer.domElement);
  const post = new Post(renderer, { bloom: QUAL.bloom });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(...FOG.color, THREE.SRGBColorSpace);
  scene.fog = new THREE.Fog(scene.background.clone(), FOG.start, FOG.end);
  const cam = new THREE.PerspectiveCamera(settings.fov || 80, 1, 0.05, 250);
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x4a3f38, 2.0));     // lights the drones (static hall is baked)

  // data + art
  const [content, vaultBuf, fp, sfxMap] = await Promise.all([getJSON('./data/content.json'), fetch('./data/vault.bin' + V).then(r => r.arrayBuffer()), getJSON('./data/footprint.json'), getJSON('./data/sfx.json')]);
  progress(0.2);
  const slice = await loadSlice('./art/hall/');
  // VaultShapeSwitch.atTheReserve: the big vault moves the GoldStation by BigReserveShift (0,-4,6) into the Golden
  // Reserve room (authored at the classic layout); three space flips z
  const SHIFT = new THREE.Matrix4().makeTranslation(0, -4, -6);
  for (const m of slice.group.children) if (/^GoldStation(\/|$)/.test(m.userData.path)) m.matrix.premultiply(SHIFT);
  for (const b of slice.meta.boxes) if (/^GoldStation(\/|$)/.test(b.path)) { b.m = b.m.slice(); b.m[13] -= 4; b.m[14] -= 6; }
  for (const [k, v] of Object.entries(slice.meta.markers)) if (/^GoldStation(\/|$)/.test(k)) v.p = [v.p[0], v.p[1] - 4, v.p[2] - 6];
  const finSlice = await loadSlice('./art/finale/');
  progress(0.5);
  const light = new LightField(slice.meta.lights);
  const { group, dynamic } = buildStatic(slice, light, { maxEdge: QUAL.edge, keepDynamic: (p) => /^Shredder\/Body\/Model\/Roller[LR]$/.test(p) || /^VaultRadio\//.test(p) || /^LobbyBoards\/ProficiencyBoard\/Face\/Tokens\/Node_/.test(p) || DYN_FINDS.test(p) || FINALE_DYNAMIC(p) });
  scene.add(group);
  // shredder rollers: lit like the hall (baked at rest in world space), then spun about their local x axis
  // Gold Teller lamps (one per prize) and FINDS board niche relics change colour at runtime
  const tellerLamps = dynamic.filter(m => /^GoldTeller\/Body\/Model\/Lamp_\d+$/.test(m.userData.path));
  const nicheMeshes = dynamic.filter(m => /^LobbyBoards\/RelicBoard\/Face\/Niches\/Niche_[^/]+\/Relic\/Model$/.test(m.userData.path));
  // bake a dynamic mesh at a given world matrix (geometry kept local so it can move later)
  const bakeAt = (m, M) => {
    const g = m.geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(M); light.bake(g); g.applyMatrix4(M.clone().invert());
    const r = new THREE.Mesh(g, bakedMaterial(m.material)); r.matrixAutoUpdate = false; r.matrix.copy(M); r.userData = { ...m.userData, base: M.clone() }; scene.add(r); return r;
  };
  // radio: RadioPlace's wall spot (-11.998, 4.05, -4.85) is where the full build's Gold Teller stands, so it can only
  // apply to the demo hall; the full build keeps VaultRadio at its scene position (identity move)
  const radioMove = new THREE.Matrix4();
  const radioMeshes = dynamic.filter(m => /^VaultRadio\//.test(m.userData.path)).map(m => bakeAt(m, radioMove.clone().multiply(m.matrix)));
  const radioPt = (k) => new THREE.Vector3().fromArray(slice.meta.markers['VaultRadio/Model/' + k].p).applyMatrix4(radioMove);
  const radio = { buttons: [radioPt('BtnPrev'), radioPt('BtnNext')], aimed: -1, next: 0, track: 0, startedAt: 0,
    tracks: [['game_shredding_millions', 0.537032], ['game_shredding_millions_chill', 0.524807], ['game_vault_chillhop', 0.39355]] };
  window.__radio = radio;
  // proficiency wall board (ProficiencyBoard: lockedBody/lockedRim/gold, pulseSpeed 3.2): tokens merged per material,
  // state colours written into the baked vertex colours
  const board = (() => {
    const parts = { rim: [], face: [] }, re = /Node_([^/]+)\/Visual\/Model$/;
    for (const m of dynamic) { const k = re.exec(m.userData.path); if (!k) continue; parts[/TokenRim/.test(m.material.name) ? 'rim' : 'face'].push({ id: k[1], m }); }
    const out = {};
    for (const kind of ['rim', 'face']) {
      const list = parts[kind]; if (!list.length) continue;
      const geos = [], ranges = []; let off = 0;
      for (const { id, m } of list) {
        let g = m.geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals();
        for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
        g.applyMatrix4(m.matrix); light.bake(g); geos.push(g);
        ranges.push({ id, from: off, n: g.attributes.position.count }); off += g.attributes.position.count;
      }
      const merged = mergeGeometries(geos, false);
      const mat = bakedMaterial(list[0].m.material); mat.color.setRGB(1, 1, 1);
      const mesh = new THREE.Mesh(merged, mat); mesh.matrixAutoUpdate = false; scene.add(mesh);
      out[kind] = { mesh, ranges, base: Float32Array.from(merged.attributes.color.array) };
    }
    return out;
  })();
  const lin = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  const BOARD = { lockedBody: lin(0.16, 0.18, 0.2), lockedRim: lin(0.36, 0.33, 0.28), gold: lin(1, 0.784314, 0.239216) };
  let boardSig = '';
  // aiming at a wall token: tooltip prompt; LMB learns, held LMB repeats (holdDelay 0.45, holdRepeat 0.14; range 16)
  const tokens = []; { const re = /Node_([^/]+)\/Visual\/Model$/; const seen = new Set();
    for (const n of slice.meta.nodes) { const k = re.exec(n.path); if (k && !seen.has(k[1])) { seen.add(k[1]); tokens.push({ id: k[1], p: new THREE.Vector3(n.m[12], n.m[13], n.m[14]) }); } } }
  const boardAim = { id: null, holdT: 0 };
  function boardStep(eye, dir, held, pressed, dt) {
    boardAim.id = null; let best = 16;
    for (const t of tokens) { const v = [t.p.x - eye[0], t.p.y - eye[1], t.p.z - eye[2]], d = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      if (d > 0 && d < best && Math.hypot(v[0] - dir[0] * d, v[1] - dir[1] * d, v[2] - dir[2] * d) <= 0.12) { best = d; boardAim.id = t.id; } }
    if (!boardAim.id) { boardAim.holdT = 0; return false; }
    const learn = () => { if (game.econ.learn(boardAim.id)) { sfx('BoardLearn'); return true; } sfx('UiDeny'); return false; };
    if (pressed) { learn(); boardAim.holdT = -0.45; return true; }
    if (held) { boardAim.holdT += dt; if (boardAim.holdT >= 0) { boardAim.holdT -= 0.14; learn(); } return true; }
    return false;
  }
  function boardUpdate(t) {
    const e = game.econ, colOf = new Map(game.data.content.columns.map(c => [c.id, lin(c.color.r, c.color.g, c.color.b)]));
    const st = new Map(game.data.content.nodes.map(n => [n.id, e.rank(n.id) > 0 ? 2 : e.canLearn(n.id) === true ? 1 : 0]));
    const sig = [...st.values()].join('') + (Math.sin(t * 3.2) > 0 ? 'a' : 'b');
    if (sig === boardSig) return; boardSig = sig;
    const pulse = 0.65 + 0.35 * Math.sin(t * 3.2);
    for (const kind of ['rim', 'face']) {
      const B = board[kind]; if (!B) continue;
      const col = B.mesh.geometry.attributes.color, arr = col.array;
      for (const r of B.ranges) {
        const s0 = st.get(r.id) || 0, n = game.data.content.nodes.find(x => x.id === r.id);
        const c = kind === 'rim' ? (s0 === 0 ? BOARD.lockedRim : s0 === 1 ? BOARD.gold.clone().multiplyScalar(pulse) : BOARD.gold)
          : (s0 === 2 ? (colOf.get(n && n.column) || BOARD.gold) : BOARD.lockedBody);
        for (let v = r.from; v < r.from + r.n; v++) { arr[v * 3] = B.base[v * 3] * c.r; arr[v * 3 + 1] = B.base[v * 3 + 1] * c.g; arr[v * 3 + 2] = B.base[v * 3 + 2] * c.b; }
      }
      col.needsUpdate = true;
    }
  }
  const rollers = dynamic.filter(m => /Roller[LR]$/.test(m.userData.path)).map(m => {
    const g = m.geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(m.matrix); light.bake(g); g.applyMatrix4(m.matrix.clone().invert());
    const r = new THREE.Mesh(g, bakedMaterial(m.material)); r.matrixAutoUpdate = false; r.matrix.copy(m.matrix); r.userData.base = m.matrix.clone(); r.userData.dir = /RollerL$/.test(m.userData.path) ? 1 : -1;
    scene.add(r); return r;
  });
  let rollerA = 0; const rotM = new THREE.Matrix4();
  progress(0.65);
  const game = new Game(content, new Int32Array(vaultBuf), { footprint: fp.footprint });
  setIcons(content.icons);
  const pv = await new PileView(game.field, light, { itemsNear: QUAL.near, perCell: QUAL.perCell }).load('./art/items/');
  scene.add(pv.group);
  progress(0.75);
  const vm = await new ViewModel().load('./art/vm/');
  const dv = await new DroneView(scene).load('./art/drone/');
  const fxGeo = (pv.vis[1] && pv.vis[1].geo) || pv.vis[0].geo;
  const fx = new Fx(scene, fxGeo, new THREE.MeshBasicMaterial({ map: pv.itemMat.map, color: new THREE.Color(0.85, 0.82, 0.78), fog: true }));
  const vortex = new Vortex(scene);
  const markers = await new Markers(scene).load();
  const findsView = await new FindsView(scene).load();
  // the dog mosaic on the vault floor (Live/VaultEvents/TrueEnding/Mosaic): TrueEnding scales its root x1.2 in the big vault and
  // shifts it so the hatch lands BigCoreShift (0,-4,4) from its classic spot (TrueEnding.c:648-735) -> root offset (0,2.4,2.4) here (three space)
  { const ms = await loadSlice('./art/mosaic/'); const big = new THREE.Matrix4().makeTranslation(0, 2.4, 2.4).multiply(new THREE.Matrix4().makeScale(1.2, 1.2, 1.2));
    for (const m of ms.group.children) bakeAt(m, big.clone().multiply(m.matrix)); }
  const finView = new FinaleView(scene, dynamic.filter(m => FINALE_DYNAMIC(m.userData.path)), bakeAt, finSlice);
  game.finale.lever = [11.25, 3.0, 3.3];   // Finale/RefillLever (lobby)
  { const sm = slice.meta.markers; if (sm['GoldStation/InteractPoint']) { game.markers.station = sm['GoldStation/InteractPoint'].p; game.markers.stationMouth = sm['GoldStation/MouthPoint'].p; } }
  window.__T = T;
  findsView.setLamps(tellerLamps.map(m => { const r = bakeAt(m, m.matrix.clone()); r.material = r.material.clone(); return { i: +/Lamp_(\d+)$/.exec(m.userData.path)[1], mesh: r }; }));
  findsView.setBoard(nicheMeshes.map(m => { const r = bakeAt(m, m.matrix.clone()); r.material = r.material.clone(); return { id: /Niche_([^/]+)\//.exec(m.userData.path)[1], mesh: r, color: r.material.color.clone() }; }));
  { const n = slice.meta.nodes.find(x => x.path === 'GoldTeller/Body/Model'); if (n) game.markers.teller = [n.m[12], n.m[13], n.m[14]];
    const b = slice.meta.nodes.find(x => x.path === 'LobbyBoards/RelicBoard/Model'); if (b) game.markers.relicBoard = [b.m[12], b.m[13], b.m[14]]; }
  // Gold Teller screen (f20): NEXT PRIZE n/30, the prize name and its text, drawn on a canvas over the M_TellerScreen panel
  const tellerScreen = (() => {
    const src = slice.group.children.find(m => m.userData.path === 'GoldTeller/Body/Model' && m.material && m.material.name === 'M_TellerScreen');
    if (!src) return null;
    // bounds of this primitive's own triangles (the vertex buffer can be shared with the other submeshes)
    const pos = src.geometry.attributes.position, idx = src.geometry.index, B = new THREE.Box3(), v = new THREE.Vector3();
    const n = idx ? idx.count : pos.count; for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(src.matrix); B.expandByPoint(v); }
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const w = (B.max.z - B.min.z) * 0.9, h = (B.max.y - B.min.y) * 0.86;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false, fog: false }));
    mesh.position.set(B.max.x + 0.004, (B.min.y + B.max.y) / 2, (B.min.z + B.max.z) / 2); mesh.rotation.y = Math.PI / 2; scene.add(mesh);
    let sig = '';
    return { draw(fed) {
      const s2 = fed + '|' + lang; if (s2 === sig) return; sig = s2;
      const c = cv.getContext('2d'); c.fillStyle = '#0d1440'; c.fillRect(0, 0, 512, 320);
      c.strokeStyle = '#f9c52f'; c.lineWidth = 6; c.strokeRect(10, 10, 492, 300);
      c.font = '600 30px Fredoka, sans-serif'; c.fillStyle = '#f9c52f'; c.textBaseline = 'top';
      if (fed >= 30) { c.fillText(T('teller.all_paid'), 34, 40); tex.needsUpdate = true; return; }
      c.fillText(T('teller.next'), 34, 32); c.textAlign = 'right'; c.fillStyle = '#ffffff'; c.fillText(`${fed} / 30`, 478, 32); c.textAlign = 'left';   // f20: '29 / 30' over prize 30, i.e. notes fed so far
      const p = tellerPrize(fed + 1);
      c.fillStyle = '#1b2470'; c.fillRect(30, 86, 452, 200);
      c.font = '600 34px Fredoka, sans-serif'; c.fillStyle = '#f9c52f';
      const wrap = (txt, x, y, maxW, lh) => { const words = String(txt).split(' '); let line = ''; for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y); y += lh; line = wd; } else line = t; } c.fillText(line, x, y); return y + lh; };
      let y = wrap(prizeName(p).toUpperCase(), 52, 104, 410, 38);
      c.font = '500 24px Fredoka, sans-serif'; c.fillStyle = '#ffffff'; wrap(prizeDesc(p), 52, y + 8, 410, 28);
      tex.needsUpdate = true;
    } };
  })();
  window.__finds = game.finds; window.__events = game.vaultEvents; window.__fv = findsView;
  { const pb = slice.meta.nodes.find(n => n.path.startsWith('LobbyBoards/ProficiencyBoard')); if (pb) game.markers.profBoard = [pb.m[12], pb.m[13] + 1.2, pb.m[14]]; }
  progress(0.85);

  const world = new BoxWorld(slice.meta.boxes.concat(finSlice.meta.boxes.filter(b => /^Finale\/RefillLever\//.test(b.path))));
  world.setEnabled(/^Finale\/RefillLever\//, false);
  let leverSolid = false;
  const spawn = [...game.markers.spawn, Math.PI];   // face the pit (-z is yaw 0; pit is at -z) — spawn looks toward the vault
  spawn[3] = 0;
  const player = new Player(world, game.field, spawn);
  // the big door's blockers are off while it stands open (area.reserve and not yet sealed by the finale)
  const setDoorBlockers = (on) => world.setEnabled(/^VaultBig\/GoldenReserve\/ReserveDoor\/(Blocker|Art\/Door\/PlayerBlocker|Art\/Door\/Leaf\/LeafCollider)$/, on);
  const syncDoor = () => setDoorBlockers(!(game.flags.has(FL.OPEN) && !game.flags.has(FL.FINALE)));

  // audio
  const audio = new Audio('./audio/');
  const applyVol = () => { audio.vol = { master: settings.master, music: settings.music, sfx: settings.sfx, voice: settings.sfx }; audio.applyVolumes(); };
  applyVol();
  const SFX = sfxMap.sfx;
  const sfx = (id, o = {}) => {
    const s = SFX[id];
    if (s) { const i = Math.floor(Math.random() * s.clips.length); audio.play(s.clips[i], { vol: s.volume * (s.gain[i] || 1) * (o.vol || 1), pitch: 1 + (Math.random() * 2 - 1) * s.jitter }); }
    else audio.play(id, o);
  };
  const preload = ['radio_click', 'sfx_vacuum_pop', 'shredder_run_loop', 'vacuum_loop', 'sfx_drone_hum_loop', 'shred_pop', 'drone_dump', 'drone_takeoff_land', 'sfx_shovel_whiff', 'pockets_blip_1', 'pockets_blip_2', 'pockets_blip_3', 'pockets_blip_4',
    ...[1, 2, 3, 4].map(i => 'bucket_take_' + i), ...[1, 2, 3, 4].map(i => 'shovel_hit_' + i), ...[1, 2, 3, 4, 5, 6].map(i => 'sfx_step_concrete_' + i), ...[1, 2, 3, 4].map(i => 'sfx_step_money_' + i),
    ...Object.values(SFX).flatMap(s => s.clips)];

  // UI
  const input = new Input(renderer.domElement, $('hud'));
  input.sens = settings.sens;
  let state = 'loading', slot = -1, bot = null;
  const ui = $('ui');
  const hud = new Hud($('hud'), {
    tool: (i) => { if (game.selectTool(i)) sfx('UiTick'); },
    rally: () => input.pressed.add('tool5'),
    open: (n) => openScreen(n),
    pause: () => openPause(),
  });
  if (coarse) hud.bindTouch(input);
  const shop = new Shop(ui, game, (n) => n.startsWith('sfx_') || n === 'coin_drop_buy' ? (n === 'coin_drop_buy' ? sfx('UpgradeBuy') : n === 'sfx_ui_deny' ? sfx('UiDeny') : n === 'sfx_tab_upgrades' ? sfx('TabUpgrades') : sfx('UiClick')) : sfx(n));
  const prof = new Prof(ui, game, (n) => sfx(n));
  const menu = new Menu(ui, {
    start: (s, fresh) => startGame(s, fresh), sfx: (n) => sfx(n),
    settings: (s) => { settings = s; applySettings(); },
    resume: () => closeScreen(),
    stats: () => { menu.clear(); state = 'play'; openScreen('stats'); },
    achievements: (back) => { achScreen(ui, ach, () => { ui.innerHTML = ''; back(); }); },
    wardrobe: () => { wardrobeScreen(ui, game.finds, (h) => { if (game.finds.hatOk(h)) { game.finds.hat = h; sfx('UiClick'); } }, () => { ui.innerHTML = ''; menu.pause(); }); },
    hasWardrobe: () => !!game && game.flags.has('chest.1.open'),
    stuck: () => { player.pos = game.markers.spawn.slice(); player.vel = [0, 0, 0]; player.yaw = 0; player.pitch = -0.15; closeScreen(); hud.toast(T('hud.stuck.moved')); },
    quitToMenu: () => { if (net) return leaveNet(true); saveNow(); toMenu(); },
    coop: () => coopUi.menu(),
    coopInfo: () => coopInfo(),
    coopPlayers: () => pausePlayers(coopInfo()),
    spending: () => net && net.role === 'host' && !net.opening ? { hostOnly: net.ch.hostOnly, toggle: () => { net.ch.hostOnly = !net.ch.hostOnly; } } : null,
    leaveNet: () => leaveNet(false),
  });
  const statsUi = new Stats(ui, game);
  shop.onClose = prof.onClose = statsUi.onClose = () => closeScreen();

  function applySettings() {
    applyVol(); input.sens = settings.sens; if (window.__voice && window.__voice.setSettings) window.__voice.setSettings(settings); cam.fov = settings.fov || 80; cam.updateProjectionMatrix();   // window.__voice: voice is declared later in boot
    $('cross').style.display = settings.crosshair ? '' : 'none';
    $('hud').style.opacity = settings.hud === false ? '0' : '';
    fpsEl.style.display = settings.showFps ? '' : 'none';
  }
  const fpsEl = document.createElement('div'); fpsEl.id = 'fps'; document.body.appendChild(fpsEl);
  applySettings();
  function openScreen(n) {
    if (state !== 'play') return;
    state = n === 'upgrades' ? 'shop' : n === 'stats' ? 'stats' : 'prof';
    if (document.pointerLockElement) document.exitPointerLock();
    (n === 'upgrades' ? shop : n === 'stats' ? statsUi : prof).show();
    // header tab row (f15/f26): UPGRADES TAB · PROFICIENCIES P · STATS I
    const scr = ui.querySelector('.screen');
    if (scr) {
      const tabs = [['upgrades', 'menu.tab.upgrades', 'TAB'], ['proficiencies', 'menu.tab.proficiencies', 'P'], ['stats', 'menu.tab.stats', 'I']];
      const bar = document.createElement('div'); bar.className = 'scrTabs';
      bar.innerHTML = tabs.map(([id, key, k]) => `<button class="sbtn${id === n ? ' sel' : ''}" data-s="${id}">${T(key)}<span class="key">${k}</span></button>`).join('');
      bar.querySelectorAll('button').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); if (b.dataset.s !== n) { shop.hide(); prof.hide(); statsUi.hide(); state = 'play'; openScreen(b.dataset.s); } }));
      bar.addEventListener('pointerdown', (e) => e.stopPropagation());
      scr.appendChild(bar);
    }
    sfx(n === 'proficiencies' ? 'TabProficiencies' : 'TabUpgrades');
  }
  function openPause() {
    if (state !== 'play') return;
    state = 'pause';
    if (document.pointerLockElement) document.exitPointerLock();
    menu.pause();
  }
  function closeScreen() {
    shop.hide(); prof.hide(); statsUi.hide(); menu.clear();
    state = 'play';
    if (!coarse) input.requestLock();
  }
  document.addEventListener('pointerlockchange', () => {
    // a lock granted late (requested on start, granted after a menu opened) must not trap the cursor
    if (document.pointerLockElement && state !== 'play') { document.exitPointerLock(); return; }
    if (!document.pointerLockElement && state === 'play' && !coarse && !bot) openPause();
  });

  function toMenu() {
    state = 'menu'; shop.hide(); prof.hide();
    $('hud').classList.add('hidden');
    menu.main();
    audio.playMusic('menu_lounge_a', 0.7);
  }
  function startGame(s, fresh) {
    audio.unlock(); for (const n of preload) audio.load(n);
    slot = s;
    const data = !fresh && Save.read(s);
    if (data && game.load(data.game)) {
      if (data.pl) { player.pos = data.pl.pos.slice(); player.yaw = data.pl.yaw; player.pitch = data.pl.pitch; player.vel = [0, 0, 0]; }
      log('loaded slot', s, Num.money(game.econ.dollars));
      // NetUnclaimedLedger: friends' bags from the last session go into the shredder
      if (data.unc) { const n = data.unc.reduce((a, b) => a + b, 0); if (n > 0) { game.enqueue(data.unc, game.markers.shredderIntake, SRC.AutoPump, 0); setTimeout(() => hud.toast(T(n === 1 ? 'net.toast.unclaimed#one' : 'net.toast.unclaimed#other', Num.full(n)), '', 4500), 1500); } }
    } else {
      game.basicsSeen = prefGet('introBasics');
      game.newGame();
      dialogueAt = INTRO_TUNE.dialogueDelay;
      player.pos = game.markers.spawn.slice(); player.yaw = 0; player.pitch = -0.15; player.vel = [0, 0, 0];
      Save.write(s, snapshot());
    }
    game.econ.track('SessionCount');
    syncDoor();
    menu.clear();
    $('hud').classList.remove('hidden');
    state = 'play';
    if (!coarse && !bot) input.requestLock();
    playTrack(Math.floor(Math.random() * radio.tracks.length));
  }
  function playTrack(i) { radio.track = i; radio.startedAt = performance.now(); const [n, gain] = radio.tracks[i]; audio.playMusic(n, gain); }
  // radio: aim a button within 2.6 m (button radius 0.075 m), press with Interact or Primary (0.22 s cooldown)
  function radioStep(eye, dir, pressed, now) {
    radio.aimed = -1;
    radio.buttons.forEach((c, i) => { const v = [c.x - eye[0], c.y - eye[1], c.z - eye[2]], t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      if (t > 0 && t <= 2.6 && Math.hypot(v[0] - dir[0] * t, v[1] - dir[1] * t, v[2] - dir[2] * t) <= 0.075) radio.aimed = i; });
    if (radio.aimed >= 0 && pressed && now >= radio.next) {
      radio.next = now + 220; audio.play('radio_click', { vol: 0.45, pitch: 0.96 + Math.random() * 0.08 });
      if (net && net.role === 'guest') { net.gn.command('radio', { d: radio.aimed ? 1 : -1 }); return true; }   // RadioState is the host's: everyone hears its track
      const n = radio.tracks.length; playTrack((n + (radio.track + (radio.aimed ? 1 : -1)) % n) % n); return true;
    }
    return false;
  }
  // per-machine prefs (the original keeps intro.basics in PlayerPrefs)
  function prefGet(k) { try { return localStorage.getItem('shred-a-billion.pref.' + k) === '1'; } catch { return false; } }
  function prefSet(k) { try { localStorage.setItem('shred-a-billion.pref.' + k, '1'); } catch { } }
  let dialogueAt = -1;
  const dialogue = new Dialogue(ui, (n) => sfx(n), () => audio.playAny('pockets_blip_', 4, { vol: 0.22, pitch: 0.95 + Math.random() * 0.15 }));
  window.__dialogue = dialogue;
  let dialogueLive = false;      // the ending call keeps the world running behind the panel (the key toss is seen)
  function openDialogue(pages, after, live = false) {
    state = 'dialogue'; dialogueLive = live; if (document.pointerLockElement) document.exitPointerLock();
    $('hud').classList.add('hidden');
    dialogue.show(() => { dialogueLive = false; if (after) after(); else game.intro.dialogueDone(); $('hud').classList.remove('hidden'); state = 'play'; if (!coarse && !bot) input.requestLock(); }, pages);
  }
  // Pockets' delivery calls (DialogueScripts on VaultEventService): queued until play state; bots skip them
  const callQ = [];
  function queueCall(prefix) { if (!bot) callQ.push([[prefix + '.p1', 2], [prefix + '.p2', 1], [prefix + '.p3', 3]]); }
  function snapshot() { return { game: game.save(), pl: { pos: player.pos, yaw: player.yaw, pitch: player.pitch }, vault: game.vaultLeft(), rev: REV, unc: net && net.ch ? net.ch.unclaimed() : null }; }
  function saveNow() { if (slot < 0 || state === 'menu' || state === 'loading' || game.client) return false; const ok = Save.write(slot, snapshot()); if (!ok) hud.toast(T('toast.save_failed')); return ok; }
  addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  // resize
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); post.setSize(Math.floor(w * renderer.getPixelRatio()), Math.floor(h * renderer.getPixelRatio()));
    cam.aspect = w / h; cam.updateProjectionMatrix(); vm.resize(w / h);
    document.documentElement.style.setProperty('--ui', Math.max(0.62, Math.min(1.25, Math.min(w / 1280, h / 720))).toFixed(3));
  };
  addEventListener('resize', resize); resize();

  // ---- co-op (rules/coop.md): the host runs this game + CoopHost + HostNet over a Unity Relay room; a guest runs a
  // client mirror (CoopGuest) that only moves its own player and sends its buttons. Net modules load on first use.
  let net = null, myAct = 0, remotesShown = false;
  const loadNet = () => Promise.all([import('./net/room.js'), import('./net/session.js')]);
  const remotes = new RemoteAvatars(scene, { T }); let remotesLoad = null;
  const ensureRemotes = () => remotesLoad || (remotesLoad = remotes.load().catch(() => {}));
  const coopBar = new CoopBar();
  const coopUi = new CoopUi(ui, { sfx: (n) => sfx(n), back: () => { coopUi.stop(); menu.main(); },
    host: (s, fresh, priv) => { coopUi.stop(); startGame(s, fresh); openRoom(priv); },
    join: (o) => joinGame(o), list: async () => (await loadNet())[0].listRooms() });
  window.__net = () => net; window.__coopUi = coopUi; window.__remotes = remotes;
  // text chat (host-relayed): Enter opens the bar while playing in a session; typing never stops the shared world
  const chat = new Chat({ T, nameOf: (id) => nameOf(id),
    send: (t) => { if (!net) return; if (net.role === 'host') net.ch.say(0, t); else net.gn.command('chat', { text: t }); },
    onOpen: () => { state = 'chat'; if (document.pointerLockElement) document.exitPointerLock(); },
    onClose: () => { if (state === 'chat') { state = 'play'; if (!coarse) input.requestLock(); } } });
  window.__chat = chat;
  // co-op fun (rules/fun.md): shove/slap, parry, vacuum pull, shredder ride (solo too), drone ride, wave
  const funPlay = new FunPlay({ game, player, T, hud, sfx, fx, coarse, intake: intakeBox(slice.meta.boxes),
    coop: () => !!net && !net.opening, me: () => net ? net.me : 0, nameOf: (id) => nameOf(id),
    others: () => { const o = []; for (const [id, v] of remotes.byId) if (v.id != null) o.push({ id, pos: [v.px, v.py, v.pz] }); return o; },
    runCount: (id, k) => { const P = game.finale.player(id); P.c[k] = (P.c[k] || 0) + 1; },
    send: (c) => {
      if (net && net.role === 'guest') return net.gn.command('fun', c);
      const F = game.fun;   // the host (or solo) is its own FunHost, player 0
      if (c.f === 'wind') F.wind(0, c.slap); else if (c.f === 'cancel') F.cancel(0); else if (c.f === 'release') F.release(0, c.to, c.slap);
      else if (c.f === 'ride') F.rideShredder(0); else if (c.f === 'grab') F.grab(0, c.d | 0); else if (c.f === 'letgo') F.letGo(0, !!c.jump);
    } });
  window.__fun = funPlay;
  let waveHeld = false;
  // voice chat (rules/voice.md): js/net/voice.js, loaded when a session starts; host-relayed over the RAW channel
  let voice = null;
  async function voiceAttach() {
    try {
      const { Voice } = await import('./net/voice.js');
      if (!net || net.opening) return;
      if (!voice) { voice = new Voice({ T, root: $('hud'), audio, settings: () => settings, nameOf: (id) => nameOf(id) }); window.__voice = voice; }
      voice.attach(net.role === 'host' ? { role: 'host', me: 0, hn: net.hn } : { role: 'guest', me: net.me, gn: net.gn });
    } catch (e) { log('voice', e.message); }
  }
  const voiceDetach = () => { if (voice) try { voice.detach(); } catch (e) { } };
  function voiceFrame(dt) {
    if (!voice || !net || net.opening) return;
    const heads = new Map();
    for (const [id, v] of remotes.byId) if (v.id != null) heads.set(id, [v.px, v.py + 1.6, v.pz]);
    voice.update(dt, { listener: { pos: player.eye(), yaw: player.yaw, pitch: player.pitch }, heads, typing: chat.open, active: state === 'play' });
    if (remotes.setTalking) for (const id of heads.keys()) remotes.setTalking(id, voice.talking(id));
  }
  addEventListener('keydown', (e) => { if (e.key === 'Enter' && net && !net.opening && state === 'play' && !chat.open) { e.preventDefault(); chat.openBox(); } });
  // Relay region from the time zone (the browser cannot measure relay latency; RelayRegions.For does the same)
  function guessRegion() {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/')[0], off = -new Date().getTimezoneOffset() / 60;
    if (tz === 'Australia' || tz === 'Pacific') return 'australia-southeast1';
    if (tz === 'Asia') return off >= 8.5 ? 'asia-northeast1' : off <= 6 ? 'asia-south1' : 'asia-southeast1';
    if (tz === 'Europe' || tz === 'Africa') return 'europe-west4';
    if (tz === 'America') return off <= -7 ? 'us-west1' : off >= -3 ? 'southamerica-east1' : 'us-east1';
    return 'asia-southeast1';
  }
  const nameOf = (id, n) => n || (net && net.role === 'guest' && net.cg.roster[id] && net.cg.roster[id].n) || (game.guests.get(id) || {}).name || T('net.player', (id | 0) + 1);
  function coopInfo() {
    if (!net || net.opening) return null;
    const players = net.role === 'host' ? [{ s: 0, n: '' }, ...[...game.guests.values()].map(g => ({ s: g.id, n: g.name }))]
      : Object.values(net.cg.roster).map(p => ({ s: p.s, n: p.n })).sort((a, b) => a.s - b.s);
    if (voice) for (const p of players) p.talk = !!voice.talking(p.s);   // the roster row's voice icon
    return { code: net.code || '', me: net.me, players };
  }
  // the roster the views show; window.__coopFake (tests only) stands in for a session to lay out 4 players
  function coopView() { return net ? coopInfo() : (window.__coopFake || null); }
  async function openRoom(isPrivate) {
    if (net) return;
    net = { role: 'host', opening: true, me: 0 };
    try {
      const [{ hostRoom }, { HostNet }] = await loadNet();
      const room = await hostRoom({ name: 'SHRED A BILLION', isPrivate, vault: `${Num.money(game.econ.dollars)} · ${T('hud.level_short', game.econ.level)}`, build: REV, region: guessRegion(), playerName: T('net.player', 1) });
      if (!net || net.role !== 'host' || !net.opening) { room.close(); return; }
      const ch = new CoopHost(game, { hostName: '' });
      const hn = new HostNet({ link: room.link, sim: ch, hostName: '', build: REV, onCommand: (pid, m) => ch.command(pid, m),
        onRoster: (r, info) => { if (info && info.why === 'timeout' && info.uid) room.free(info.uid); } });
      room.link.onClose = (why) => { log('relay closed', why); if (net && net.hn === hn) { hud.toast(T('net.err.unknown'), String(why || ''), 4000); stopHosting(); } };
      ch.onRadio = (d) => { const n = radio.tracks.length; playTrack((n + (radio.track + d) % n) % n); };
      Object.assign(net, { room, ch, hn, opening: false, code: room.code });
      voiceAttach();
      ensureRemotes();
      log('hosting', room.code, room.region); rememberSession({ kind: 'host', slot, isPrivate });
    } catch (e) { log('host failed', e.message); net = null; hud.toast(T('net.err.unknown'), String(e.message || e).slice(0, 140), 6000); }
  }
  // STOP HOSTING: guests go home, whatever they carry is shredded into the wallet (NetRuntime.ShredGuests)
  function stopHosting() {
    if (!net || net.role !== 'host') return;
    const n = net; net = null; voiceDetach();
    if (n.hn) { try { n.hn.close('host_left'); } catch (e) { } }
    if (n.room) n.room.close(true);
    for (const id of [...game.guests.keys()]) { if (n.ch) n.ch.removeRemote(id, 'host'); else game.removeGuest(id); remotes.remove(id); }
  }
  function backToMenu(key, detail) {
    const u = new URL(location.href); for (const k of ['join', 'host', 'autostart']) u.searchParams.delete(k);
    if (key) u.searchParams.set('coopmsg', key); if (detail) u.searchParams.set('coopdetail', String(detail).slice(0, 160));
    location.href = u.toString();   // a page reload is the clean slate after a co-op session (the mirror state is gone)
  }
  function leaveNet(toMenuAfter, noAsk = false) {
    if (!net) return;
    const host = net.role === 'host';
    const go = () => {
      if (host) { stopHosting(); if (toMenuAfter) { saveNow(); toMenu(); } else closeScreen(); }
      else { try { net.gn.leave(); } catch (e) { } net.room.leave(true); net = null; backToMenu(null); }
    };
    if (noAsk) return go();
    menu.confirm(T(host ? 'net.stop.title' : 'net.leave.title'), T(host ? 'net.stop.body' : 'net.leave.body'), T(host ? 'net.stop.yes' : 'net.leave.yes'), T('common.cancel'), go, () => menu.pause());
  }
  async function joinGame(o) {
    coopUi.overlay(T('net.overlay.joining'), T('net.overlay.connecting'));
    let room = null;
    try {
      const [{ joinRoom }, { GuestNet }] = await loadNet();
      room = await joinRoom({ ...o, playerName: '' });
      const gn = new GuestNet({ link: room.link, name: '', uid: room.uid, build: REV });
      coopUi.overlay(T('net.overlay.joining'), T('net.overlay.loading'));
      const w = await gn.join(15);
      startGuest(room, gn, w);
    } catch (e) {
      if (room) { try { room.link.close(); } catch (err) { } room.leave(); }
      const m = String(e && e.message || e), key = errKey(m);
      log('join failed', m);
      coopUi.error(T(key), key === 'net.err.join_failed' ? m : '', () => joinGame(o));
    }
  }
  const errKey = (m) => /full/.test(m) ? 'net.err.full' : m === 'version' ? 'net.err.version' : m === 'host_left' ? 'net.err.host_left'
    : /HTTP 404|not ?found/i.test(m) ? 'net.err.lobby_gone' : m === 'kicked' ? 'net.err.kicked' : 'net.err.join_failed';
  function startGuest(room, gn, w) {
    audio.unlock(); for (const n of preload) audio.load(n);
    slot = -1; bot = null; game.guests.clear(); game.newGame();
    const cg = new CoopGuest(game, w.you); cg.applyExtra(w.x); cg.apply(w.full);
    if (!game.econ._netBound) { bindGuestCommands(game.econ, (op, a) => net && net.gn && net.gn.command(op, a), () => !!(net && net.cg && net.cg.hostOnly)); game.econ._netBound = true; }
    net = { role: 'guest', room, gn, cg, me: w.you, pk: new InputPacker(), code: room.lobby && room.lobby.lobbyCode, tries: 0 };
    hookGuest(gn);
    ach.skipHeld(game);
    ensureRemotes(); feedRemotesGuest();
    dialogueAt = -1; callQ.length = 0;
    player.pos = game.markers.spawn.slice(); player.yaw = 0; player.pitch = -0.15; player.vel = [0, 0, 0];
    syncDoor(); coopUi.stop(); menu.clear(); $('hud').classList.remove('hidden'); state = 'play';
    if (!coarse) input.requestLock();
    playTrack(Math.floor(Math.random() * radio.tracks.length));
    log('joined as', w.you, net.code); rememberSession({ kind: 'join', lobbyId: room.lobby.id, code: net.code });
    voiceAttach();
  }
  function hookGuest(gn) {
    const cg = net.cg;
    gn.onTick = (wire, ev, x) => { cg.applyExtra(x); cg.apply(wire); if (ev) for (const e of ev) game.events.push(e); feedRemotesGuest(); };
    gn.onWelcome = (m) => { cg.applyExtra(m.x); cg.apply(m.full); };
    gn.onKick = (why) => guestLost(gn, why);
  }
  // the host went away: a kick ends it; a dropped link retries 3 times straight to the same relay code (RECONNECTING,
  // 'Your spot is saved'); ReconnectDelays are UNKNOWN in the original, 1 s x attempt here as in mini-mart-coop
  async function guestLost(gn, why) {
    if (!net || net.gn !== gn || net.lost) return;
    if (gn.kicked) { net = null; return backToMenu(errKey(gn.kicked)); }
    net.lost = true;
    const n = net, o = { lobbyId: n.room.lobby.id, relay: n.room.relay, lobbyCode: n.room.lobby.lobbyCode };
    state = 'pause'; if (document.pointerLockElement) document.exitPointerLock();
    for (let a = 1; a <= 3; a++) {
      coopUi.overlay(T('net.overlay.reconnecting'), T('net.overlay.reconnecting_sub'));
      await new Promise(r => setTimeout(r, 1000 * a));
      try {
        const [{ joinRoom }, { GuestNet }] = await loadNet();
        const room = await joinRoom({ ...o, playerName: '' });
        const g2 = new GuestNet({ link: room.link, name: '', uid: room.uid, build: REV });
        const w = await g2.join(15);
        Object.assign(n, { room: Object.assign(room, { lobby: { ...room.lobby, lobbyCode: o.lobbyCode } }), gn: g2, me: w.you, lost: false });
        n.cg.me = w.you; game.coopMe = w.you; n.cg.applyExtra(w.x); n.cg.apply(w.full); hookGuest(g2);
        coopUi.stop(); menu.clear(); state = 'play'; if (!coarse) input.requestLock();
        voiceAttach();
        hud.toast(T('chat.reconnected', T('net.player', w.you + 1)), '', 3000);
        return;
      } catch (e) { log('reconnect', a, e.message); if (e.message === 'full' || e.message === 'version') break; }
    }
    net = null; backToMenu('net.err.host_lost');
  }
  function netUpdate(dt) {
    if (!net || net.opening) return;
    if (net.role === 'host') { net.ch.emit(game.events); net.hn.update(dt); }
    else if (net.pk.msg && !net.lost) net.gn.update(dt, net.pk.msg);
  }
  let remoteFeedT = 0;
  function feedRemotesHost(ns) {
    if (ns - remoteFeedT < 1 / 15) return; remoteFeedT = ns;
    const live = new Set();
    for (const g of game.guests.values()) {
      if (!g.input) continue; live.add(g.id); const m = g.input;
      remotes.push(g.id, { slot: g.id, name: g.name, pos: g.player.pos, yaw: g.player.yaw || 0, pitch: g.player.pitch || 0, tool: g.tool, moving: m.mv || 0, crouch: !!m.cr, flying: !!m.fl, act: m.a | 0, emote: m.em | 0, down: m.dn | 0, back: !!m.bk }, ns);
    }
    for (const id of lastRemoteIds) if (!live.has(id)) remotes.remove(id);
    lastRemoteIds = live;
  }
  let lastRemoteIds = new Set();
  function feedRemotesGuest() {
    if (!net || net.role !== 'guest') return;
    const ns = performance.now() / 1000, live = new Set();
    for (const p of net.cg.others()) { live.add(p.s); remotes.push(p.s, { slot: p.s, name: playerName(p), pos: p.p, yaw: p.y, pitch: p.pi, tool: p.t, moving: p.mv, crouch: p.cr, flying: p.fl, act: p.a, emote: p.em | 0, down: p.dn | 0, back: !!p.bk }, ns); }
    for (const id of lastRemoteIds) if (!live.has(id)) remotes.remove(id);
    lastRemoteIds = live;
  }
  // another player's events: name toasts (net.toast.*), nothing from their hands
  function remoteEvent(e) {
    const nm = nameOf(e.who);
    switch (e.type) {
      case 'bought': { const u = game.econ.upById.get(e.id); if (u) hud.toast(T('net.toast.bought', nm, T(u.nameKey)), '', 2400); break; }
      case 'keyPickup': hud.toast(T('net.toast.key', nm), '', 3200); sfx('RelicPop'); break;
      case 'doorBegin': hud.toast(T('net.toast.door', nm), '', 3200); sfx('ChestOpen'); break;
      case 'orbPickup': { sfx('BoostPickup'); const d = game.data.content.boosts.find(b => b.kind === e.kind); if (d) hud.toast(T('net.toast.caught_boost', nm, T(d.nameKey)), T(d.descKey), 2600); break; }
      case 'joined': case 'left': case 'bagShredded': break;
    }
  }

  // ---- events from the sim -> sound, fx, toasts ----
  const v3 = new THREE.Vector3();
  const toScreen = (p) => { v3.set(p[0], p[1], p[2]).project(cam); return [(v3.x * 0.5 + 0.5) * innerWidth, (-v3.y * 0.5 + 0.5) * innerHeight, v3.z < 1]; };
  const handPoint = () => { const e = player.eye(), f = player.forward(); return [e[0] + f[0] * 0.45, e[1] - 0.3, e[2] + f[2] * 0.45]; };
  let abToastAt = -9, sideAb = null;
  // achievements: one store per browser profile (local AchievementStore)
  const ACH_KEY = 'shred-a-billion.achievements';
  let achStore; try { achStore = JSON.parse(localStorage.getItem(ACH_KEY) || 'null'); } catch (e) { achStore = null; }
  const ach = new Achievements(achStore && achStore.done ? achStore : { done: {} });
  window.__ach = ach;
  const saveAch = () => { if (!ach.store.dirty) return; ach.store.dirty = false; try { localStorage.setItem(ACH_KEY, JSON.stringify({ done: ach.store.done, boostMask: ach.store.boostMask | 0 })); } catch (e) { } };
  const EV_ICON = { 1: 'icon_bill', 2: 'GOLD_BAR', 3: 'shredder_overdrive', 5: 'boost_golden', 6: 'DIG_CRATE', 7: 'currency' };
  const EV_CALL = { 2: 'pallet', 3: 'overdrive', 5: 'minute', 6: 'crate', 7: 'sale' };
  const prizeName = (p) => p[0] === 'cash' ? T(p[2] === 'vault' ? 'teller.prize.vault' : p[2] === 'handshake' ? 'teller.prize.handshake' : 'teller.prize.cash')
    : p[0] === 'perk' ? T('teller.prize.' + p[1]) : p[0] === 'auto' ? T('teller.prize.auto_collect') : T({ 0: 'hud.boost.money', 7: 'hud.boost.timewarp', 8: 'hud.boost.frenzy' }[p[1]] || 'hud.boost.money', '2');
  const prizeDesc = (p) => p[0] === 'cash' ? T(p[2] === 'handshake' ? 'teller.desc.handshake' : 'teller.desc.cash', p[1]) : p[0] === 'boost' ? T('teller.desc.boost', p[2])
    : p[0] === 'auto' ? T('teller.desc.auto_collect') : p[1] === 'spring_soles' ? T('teller.desc.spring_soles', Math.round(PERK[p[1]][0] * 100), 5) : T('teller.desc.' + p[1], Math.round(PERK[p[1]][0] * 100));
  // ability side card (intro.md §2): lowest owned move used < 2 times with its tool in hand; 2 uses -> check, hold 1.6 s
  function stepSide() {
    if (sideAb && sideAb.doneAt == null && sideAb.uses >= 2) { sideAb.doneAt = game.time; game.flags.add('side.ability.' + sideAb.move); }
    if (sideAb && sideAb.doneAt != null) { if (game.time - sideAb.doneAt < 1.6) return sideAb; sideAb = null; }
    if (sideAb && sideAb.move !== 5 && game.abilities.forTool(game.tool) !== sideAb.move) sideAb = null;
    if (!sideAb) for (let m = 1; m <= 5; m++) {
      if (!game.abilities.owned(m) || game.flags.has('side.ability.' + m)) continue;
      if (m !== 5 && game.abilities.forTool(game.tool) !== m) continue;
      const used = game.econ.stats.tracked['AbilityUses' + m] || 0; if (used >= 2) { game.flags.add('side.ability.' + m); continue; }
      sideAb = { move: m, uses: used, doneAt: null }; break;
    }
    return sideAb;
  }
  // note / find side cards (intro.md §2: NotePick/Carry/Insert, FindPick/Carry/Put; stop after 2 deliveries each)
  function findSide() {
    const F = game.finds, P = player.pos, d2 = (p) => p ? Math.hypot(p[0] - P[0], p[2] - P[2]) : Infinity;
    const noteDone = Math.min(2, F.fed), findDone = Math.min(2, game.econ.relics.size);
    if (F.carry) {
      if (F.carry.kind === 'note' && noteDone < 2) return d2(game.markers.teller) > 4 ? { title: T('intro.side.note_carry'), sub: T('intro.side.hands') } : { title: T('intro.side.note_insert') };
      if (F.carry.kind === 'relic' && findDone < 2) return d2(game.markers.relicBoard) > 4 ? { title: T('intro.side.find_carry'), sub: T('intro.side.hands') } : { title: T('intro.side.find_put') };
      return null;
    }
    let best = null, bd = 20;
    for (const it of F.items) if (it.state === 'loose' && (it.kind === 'note' ? noteDone < 2 : it.kind === 'relic' ? findDone < 2 : false)) { const d = d2(it.pos); if (d <= bd && (!best || d < bd || it.kind === 'note')) { bd = d; best = it; } }
    return best ? { title: T(best.kind === 'note' ? 'intro.side.note_pick' : 'intro.side.find_pick') } : null;
  }
  let shredPopAcc = 0, shredPopT = 0, lastPopSound = 0;
  function findsPrompt(key) {
    const F = game.finds, eye = player.eye(), dir = player.forward(), feet = player.pos;
    if (F.carry) {
      const r = F.receiverNear(feet);
      if (r === 'teller') return key + T('teller.insert');
      if (r === 'board') return key + T('relic.put');
      if (F.carry.kind === 'crate') return r === 'shredder' ? key + T('event.crate.insert') : T('event.crate.to_shredder', Math.round(Math.hypot(feet[0] - game.markers.shredderInteract[0], feet[2] - game.markers.shredderInteract[2])));
      return '';
    }
    if (F.aimChest(eye, dir)) return key + T('hud.prompt_open_chest');
    const c = F.chest; if (c && c.state === 'buried' && c.exposed >= 0.08 && Math.hypot(feet[0] - c.x, feet[2] - c.z) < 4) return (coarse ? '' : '[LMB] ') + T('hud.prompt_dig_chest', Math.max(1, Math.min(99, Math.round(c.exposed * 100))));
    const it = F.aimItem(eye, dir) || F.nearItem(feet);
    if (it) return key + T(it.kind === 'note' ? 'carry.golden_note.pick' : it.kind === 'relic' ? 'relic.pick' : 'event.crate.pick');
    if (Math.hypot(feet[0] - game.markers.teller[0], feet[2] - game.markers.teller[2]) < 4) return T('teller.hint');
    return '';
  }
  const heaveReady = () => game.tool === TOOL.Bucket && game.abilities.owned(2) && game.abilities.cdLeft(2) <= 0 && game.bagUnits() >= game.bagCapacity() * 0.5 && game.bagUnits() > 0
    && game.abilities.heaveDist(player.eye()) <= game.abilities.n().heaveRange;
  function onEvents(dt) {
    for (const e of game.events) {
      if (net && e.who != null && e.who !== net.me) { remoteEvent(e); continue; }   // another player's hands
      vm.onEvent(e);
      if (e.type === 'take' || e.type === 'swing' || e.type === 'dig') myAct++;
      switch (e.type) {
        case 'joined': if (net && e.who !== net.me) sfx('Appear', { vol: 0.4 }); break;   // the line itself is a chat system line
        case 'left': break;
        case 'chatSlow': chat.notice(T('chat.notice.slow', e.wait)); break;
        case 'hostOnly': hud.toast(T('net.toast.host_only'), '', 3000); sfx('UiDeny'); break;
        case 'wish': { const u = game.econ.upById.get(e.id); if (u) hud.toast(T('net.toast.wish', nameOf(e.from), T(u.nameKey)), '', 2600); break; }
        case 'fun': funPlay.onEvent(e); break;
        case 'bagShredded': hud.toast(T('net.toast.bag_shredded', nameOf(e.who, e.name)), '', 3000); break;
        case 'take': ach.onEvent(e);
          if (e.tool === TOOL.Hand) sfx('HandGrab');
          else if (e.tool === TOOL.Bucket) audio.playAny('bucket_take_', 4, { vol: 0.35 });
          else if (e.tool === TOOL.Vacuum && Math.random() < 0.3) audio.play('sfx_vacuum_pop', { vol: 0.25 });
          if (e.point) fx.fly([e.point[0], e.point[1] + 0.3, e.point[2]], 'follow', e.tool === TOOL.Vacuum ? 0.3 : 0.28, e.tool === TOOL.Vacuum ? 0.25 : 0.35, Math.min(3, 1 + Math.floor(Math.log10(e.n + 1))), 0.6);
          break;
        case 'whiff': if (e.tool === TOOL.Shovel) audio.play('sfx_shovel_whiff', { vol: 0.4 }); else sfx('HandSwoosh'); break;
        case 'swing': sfx('HandSwoosh'); break;
        case 'dig': audio.playAny('shovel_hit_', 4, { vol: 0.5 }); break;
        case 'handsFull': hud.toast(T('hud.hands_full'), T('hud.prompt_deposit'), 1600); sfx('UiDeny'); break;
        case 'bagFull': hud.toast(T('hud.hands_full'), T('hud.prompt_deposit'), 1600); sfx('UiDeny'); break;
        case 'pourStart': break;
        case 'pourPiece': { audio.playAny('pockets_blip_', 4, { vol: 0.18, pitch: 0.9 + Math.random() * 0.3 }); fx.fly(handPoint(), game.depositTarget(player.pos), 0.42, 0.5, 1, 0.8); break; }
        case 'shredded':
          ach.onEvent({ type: 'shred', res: e.res }); shredPopAcc += e.res.dollars; if (e.res.crit || e.res.lucky) shredPopT = 1;
          if (performance.now() - lastPopSound > 70) { audio.play('shred_pop', { vol: 0.35, pitch: 0.95 + Math.random() * 0.1 }); lastPopSound = performance.now(); }
          break;
        case 'bought': {
          const u = game.econ.upById.get(e.id);
          if (u && u.unlockKey && u.unlockKey.startsWith('tool.')) { sfx('ToolUnlock'); hud.toast(T(u.nameKey), T(u.unlockKey + '.name'), 3500); }
          break;
        }
        case 'level': sfx('Appear', { vol: 0.5 }); hud.toast(T('hud.level_up_line', e.level), T('hud.level_up_line_2', e.points), 3000); break;
        case 'learned': break;
        case 'milestone': hud.toast(T(e.m.nameKey), Num.money(e.m.dollars) + (e.m.rewardDollars > 0 ? '  +' + Num.money(e.m.rewardDollars) : ''), 2500); sfx('SideTaskDone'); break;
        case 'droneLaunch': { const d = game.drones[e.i]; if (d) audio.play('drone_takeoff_land', { vol: 0.25 }); break; }
        case 'droneDump': { const d = game.drones[e.i]; if (d) { audio.play('drone_dump', { vol: 0.3 }); fx.fly(d.pos, game.markers.shredderIntake, 0.5, 0.3, 3, 0.8); } break; }
        case 'levelOpened': hud.toast(T('hud.new_area'), T('hud.lower_terrace'), 3500); sfx('Appear'); break;
        case 'stairs': break;
        case 'boost': ach.onEvent(e); break;
        case 'orbPickup': { sfx('BoostPickup'); const d = game.data.content.boosts.find(b => b.kind === e.kind); if (d) hud.toast(T(d.nameKey), T(d.descKey), 2600); break; }
        case 'pump': sfx('Appear', { vol: 0.35 }); fx.fly(handPoint(), game.markers.shredderIntake, 1.0, 3.5, 6, 1.0); break;
        case 'giltFound': hud.toast(T('pile.gilt.found'), '', 3000); break;
        case 'returnPress': sfx('ReturnButton'); break;
        case 'abilityWind': if (e.move === 3) vm.onEvent({ type: 'poundWind' }); break;
        case 'ability': {
          const id = { 1: 'AbilityArmful', 2: 'AbilityHeave', 4: 'AbilityOverload', 5: 'AbilityRally' }[e.move]; if (id) sfx(id);
          if (e.move === 3) audio.playAny('shovel_hit_', 4, { vol: 0.7, pitch: 0.8 });   // no SfxId for Ground Pound: shovel hit, lower (labelled)
          if (sideAb && sideAb.move === e.move) sideAb.uses++;
          break;
        }
        case 'heave': fx.fly(handPoint(), game.markers.shredderIntake, e.flight, 1.4, 8, 1.0); break;
        case 'abilityRefused': {
          if (e.why !== 0 && e.why !== 1) hud.shakeSlot(e.move);
          const nowS = performance.now() / 1000; if (nowS - abToastAt < 2) break;
          let line = '';
          if (e.move === 2) line = e.why === 2 ? T('hud.heave.cooldown') : e.why === 4 ? T('hud.heave.too_far', Math.round(game.abilities.n().heaveRange)) : e.why === 5 ? T('hud.heave.need_bag') : '';
          if (e.move === 5) line = e.why === 1 ? (game.econ.hasUnlock('mech.drones') ? T('hud.rally.not_owned') : '') : (e.why === 4 || e.why === 6) ? T('hud.rally.no_target') : '';
          if (line) { abToastAt = nowS; hud.toast(line, '', 2200); sfx('UiDeny'); }
          break;
        }
        case 'toastKey': hud.toast(T(e.key), '', 2600); if (e.key === 'carry.nope') sfx('UiDeny'); break;
        case 'findOut': sfx(e.kind === 'relic' ? 'RelicPop' : e.kind === 'note' ? 'GoldenNotePop' : 'Appear'); break;
        case 'carryPick': sfx('CarryPick'); break;
        case 'carryDrop': case 'carryThrow': sfx('CarryThrow'); break;
        case 'tellerPrize': { sfx('TellerInsert'); setTimeout(() => sfx('TellerGulp'), 550); setTimeout(() => sfx('TellerPrize'), 900);
          const name = prizeName(e.prize); hud.toast(T('toast.teller.jackpot', name), prizeDesc(e.prize), 3500); hud.bigCard(T('teller.sign'), name, prizeDesc(e.prize), 3000); break; }
        case 'relicFound': { sfx('BoardLearn'); const r = game.data.relics.find(x => x.id === e.id);
          hud.bigCard(T('relic.found'), r ? T(r.nameKey) : e.id, (r ? T(r.descKey, '+' + Math.round((r.modifiers[0].op === 0 ? r.modifiers[0].value * 100 : r.modifiers[0].value * 100)) + '%') + ' · ' : '') + T('board.relics.count', e.n, e.total), 3800); break; }
        case 'chestUncover': sfx('Appear', { vol: 0.5 }); break;
        case 'chestOpen': sfx('ChestOpen'); hud.toast(T('toast.chest_cash', Num.money(e.cash)), '', 3500); break;
        case 'chestPop': sfx('ChestItemPop'); if (e.n === 1) hud.toast(T('hat.cowboy') + ' · ' + T('hat.crown') + ' · …', T('wardrobe.prompt'), 3500); break;
        case 'vaultEvent': {
          if (e.phase === 'begin') {
            if (e.kind === 1) { queueCall(e.second ? 'delivery2.call' : 'delivery.call'); break; }
            const v = 1 + ((Math.imul(e.kind, 0x9E3779B9) ^ game.vaultEvents.s.seed) >>> 0) % 3;
            hud.radio(T(`event.call.${EV_CALL[e.kind]}.${v}`), 'sly');
            sfx('Appear', { vol: 0.5 });
          } else if (e.phase === 'claim') {
            hud.toast(T(e.kind === 2 ? 'event.pallet.jackpot.solo' : 'event.crate.jackpot.solo', Num.money(e.payout)), '', 3500); sfx('TellerPrize');
          } else if (e.phase === 'end') {
            if (e.kind === 2 && !e.claimed) hud.toast(T('event.pallet.sank'), '', 2600);
            if (e.kind === 6 && !e.claimed) hud.toast(T('event.crate.sank'), '', 2600);
            if (e.kind === 5) hud.toast(T('event.minute.end'), '', 2600);
            if (e.kind === 7) hud.toast(T('event.sale.end'), '', 2600);
            if (e.kind === 1) setTimeout(() => queueCall(e.second ? 'delivery2.after' : 'delivery.after'), 2000);
          }
          break;
        }
        case 'deliveryPump': audio.play('drone_dump', { vol: 0.35, pitch: 0.7 }); break;
        case 'deliveryLanded': hud.toast(T('event.delivery.landed', Num.short(e.n)), '', 3500); break;
        case 'bigMoment': moment.show(e.step); break;
        case 'endingCall': if (bot) { game.finale.callDone(); break; } callQ.unshift({ pages: e.pages, live: true, after: () => game.finale.callDone() }); break;
        case 'keyReveal': sfx('Appear'); if (e.toast) hud.toast(T('toast.golden_key_reveal'), '', 3000); break;
        case 'keyPickup': sfx('RelicPop'); hud.toast(T('toast.golden_key'), '', 3000); hud.bigCard(T('hud.key_found'), T('hud.key_found_sub'), '', 3200); shake(0.25, 0.3); break;
        case 'doorLocked': sfx('UiDeny'); hud.toast(T('toast.reserve_locked'), '', 2600); break;
        case 'doorBegin': sfx('ChestOpen'); shake(0.2, 0.35); break;
        case 'doorClick': audio.play('radio_click', { vol: 0.5, pitch: 0.7 + e.q * 0.02 }); break;
        case 'doorClunk': audio.playAny('shovel_hit_', 4, { vol: 0.8, pitch: 0.55 }); shake(0.35, 0.4); break;
        case 'doorOpen': sfx('Appear'); hud.toast(T('toast.door_open'), '', 3500); break;
        case 'doorBlockers': setDoorBlockers(e.on); break;
        case 'doorSnap': setDoorBlockers(true); break;
        case 'finale': endFlow.start(e); break;
        case 'encoreGo': hud.toast(T('encore.go', e.n), '', 3500); sfx('Appear'); break;
        case 'encoreDone': hud.toast(T('encore.round_time', e.n) + '  ' + endFlow.clock(e.seconds), T('encore.subtitle', e.n), 4500); sfx('SideTaskDone'); break;
        case 'teleport': player.pos = e.to.slice(); player.vel = [0, 0, 0]; player.yaw = 0; player.pitch = -0.15; sfx('Appear', { vol: 0.4 }); break;
      }
    }
    game.events.length = 0;
    // money pop over the shredder, batched every 0.25 s
    shredPopT += dt;
    if (shredPopAcc > 0 && shredPopT > 0.25) {
      const [x, y, on] = toScreen(game.markers.shredderIntake);
      if (on) hud.pop(x + (Math.random() - 0.5) * 60, y - 20, '+' + Num.money(shredPopAcc), shredPopT >= 1);
      shredPopAcc = 0; shredPopT = 0;
    }
  }

  // camera shake (BigMoment / door / key)
  let shakeT = 0, shakeA = 0, shakeLen = 1;
  function shake(a, len) { if (a >= shakeA * Math.max(0, shakeT / shakeLen)) { shakeA = a; shakeT = shakeLen = len; } }
  const moment = new Moment($('moment'), { T, shake, sfx, kick: (deg) => { player.pitch += deg * Math.PI / 180; } });
  const endFlow = new EndFlow({ ui, game, player, hud, audio, sfx, T, Num, ach, cam, scene, renderer, post,
    enter: () => { state = 'cinematic'; document.body.classList.add('cine'); if (document.pointerLockElement) document.exitPointerLock(); $('hud').classList.add('hidden'); },
    leave: (stay) => { document.body.classList.remove('cine'); $('hud').classList.remove('hidden'); if (stay) { state = 'play'; syncDoor(); if (!coarse && !bot) input.requestLock(); } else if (net) leaveNet(true, true); else { saveNow(); toMenu(); } },
    save: () => saveNow(), bot: () => !!bot, guest: () => !!net && net.role === 'guest', crew: () => coopView() });
  window.__endFlow = endFlow; window.__moment = moment;
  // ---- main loop ----
  let lastAim = null, lastAimT = 0, enterHeld = false, lastWalked = 0, lastYaw = 0;
  let secHeldPrev = false;
  let last = performance.now(), frame = 0, fpsT = 0, fpsN = 0, saveT = 0, stepAcc = 0, onPile = false;
  window.__game = game; window.__player = player; window.__hud = hud; window.__state = () => state; window.__saveNow = saveNow; window.__open = openScreen;
  window.__render = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures });
  window.__openPause = openPause; window.__shop = shop; window.__input = input; window.__cam = cam; window.__menu = menu; window.__start = startGame; window.__save = Save;
  const speed = +(Q.get('speed') || 1);
  if (Q.get('bot')) bot = new Bot(game);

  function tick(now) {
    const realDt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    fpsT += realDt; fpsN++; if (fpsT >= 1) { window.__fps = fpsN / fpsT; fpsT = 0; fpsN = 0; if (settings.showFps) fpsEl.textContent = Math.round(window.__fps) + ' fps'; }
    if (state === 'dialogue') {
      dialogue.update(realDt);
      if (input.take('pause')) dialogue.skip();
      else if (input.take('jump') || input.keys.has('Enter') && !enterHeld) dialogue.next();
      enterHeld = input.keys.has('Enter');
    }
    if (state === 'play' && dialogueAt >= 0) { dialogueAt -= realDt; if (dialogueAt < 0) { if (game.intro.dialoguePending && !bot) openDialogue(); else game.intro.dialogueDone(); } }
    if (state === 'dialogue' && dialogueLive) game.finale.callPage(dialogue.page);
    // co-op never pauses: the pause menu, a dialogue or the cinematic keep the shared world (and the link) running
    const playing = state === 'play' || state === 'shop' || state === 'prof' || state === 'stats' || (state === 'dialogue' && dialogueLive) || (!!net && (state === 'pause' || state === 'dialogue' || state === 'cinematic' || state === 'chat'));
    if (state === 'stats') statsUi.update(realDt);
    if (state === 'cinematic') endFlow.update(realDt, input);
    const look = input.consumeLook();
    if (playing) {
      const steps = Math.max(1, Math.round(speed));
      for (let k = 0; k < steps; k++) {
        const dt = realDt * moment.timeScale();
        let inp;
        if (bot) {
          inp = bot.step(dt, true);
          player.pos = game.player.pos.slice();
          if (inp.dir) { player.yaw = Math.atan2(-inp.dir[0], -inp.dir[2]); player.pitch = Math.asin(Math.max(-1, Math.min(1, inp.dir[1]))); }
          inp.feet = player.pos;
        } else {
          const active = state === 'play';
          if (active && k === 0) player.look(look[0], settings.invertY ? -look[1] : look[1], input.sens);
          const ax = active ? input.axes() : { mx: 0, mz: 0 };
          const sv = (id, d) => game.stat(id) > 0.001 ? game.stat(id) : d, cl = (x, a, b) => Math.min(b, Math.max(a, x));
          const st = { moveSpeed: sv(STAT.MoveSpeed, 5.5), sprintMultiplier: Math.max(1, game.stat(STAT.SprintMultiplier) || 1.6) * (game.finds.hatPerk('sprint') || 1), jumpHeight: sv(STAT.JumpHeight, 1.25) * (game.finds.hatPerk('jump') || 1), fall: game.finds.hatPerk('fall') || 1,
            jet: { owned: game.econ.hasUnlock('move.jetpack'), fuelMax: sv(STAT.JetpackFuel, 2), climb: sv(STAT.JetpackThrust, 5), refuel: sv(STAT.JetpackRefuel, 1),
              agility: cl(game.stat(STAT.JetpackAgility) || 1, 1, 3), speedMul: cl(game.stat(STAT.JetpackSpeed) || 1, 1, 1.3), airControl: cl(game.stat(STAT.AirControl) || 1, 1, 3), forgiveness: cl(game.stat(STAT.JumpForgiveness) || 0, 0, 0.3) } };
          const fb = funPlay.blocked();   // knocked down or hanging under a drone: no walking or jumping
          player.step(dt, fb ? { mx: 0, mz: 0 } : { mx: ax.mx, mz: ax.mz, jump: active && input.jump, sprint: active && input.sprint, crouch: active && input.crouch }, st);
          funPlay.afterMove(dt);
          { // lifetime tracker stats the intro reads (DistanceWalked, Jumps, DeepestDepth) + basics sampling
            const tr = game.econ.stats.tracked, moved = player.walked - lastWalked; lastWalked = player.walked;
            if (moved > 0) game.econ.track('DistanceWalked', moved);
            if (player.jumped) { player.jumped = false; game.econ.track('Jumps'); }
            const depth = game.markers.spawn[1] - player.pos[1]; if (depth > (tr.DeepestDepth || 0)) tr.DeepestDepth = depth;
            let dy = player.yaw - lastYaw; lastYaw = player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            game.intro.sampleBasics(dt, dy, player.pitch, active && input.crouch, active && input.sprint, player.grounded, moved);
            game.player.yaw = player.yaw;
            if (player.thrusting) game.econ.track('FlightSeconds', dt);
            game.econ.track('TimePlayedSeconds', dt);
            if (game.econ.dollars > (tr.MaxDollars || 0)) tr.MaxDollars = game.econ.dollars;
          }
          if (active && k === 0) {
            for (let i = 1; i <= 4; i++) if (input.take('tool' + i)) { if (game.selectTool(i - 1)) sfx('UiTick'); }
            const nt = input.take('nextTool') ? 1 : input.take('prevTool') ? -1 : 0;
            if (nt) { for (let j = 1; j <= 4; j++) { const t = (game.tool + nt * j + 4) % 4; if (game.unlocked(t)) { if (t !== game.tool) { game.selectTool(t); sfx('UiTick'); } break; } } }
          }
          const eye = player.eye(), dir = player.forward();
          let pp = active && k === 0 && input.take('primary'), ip = active && k === 0 && input.take('interact');
          if (active && k === 0 && radioStep(eye, dir, pp || ip, performance.now())) { pp = false; ip = false; }
          if (active && k === 0 && boardStep(eye, dir, input.primary, pp, dt)) pp = false;
          const sp = active && k === 0 && input.take('secondary'), rp = active && k === 0 && input.take('tool5');
          const sh = active && input.secondary, sr = secHeldPrev && !sh; secHeldPrev = sh;
          inp = { vel: player.vel, secondaryPressed: sp, secondaryHeld: sh, secondaryReleased: sr, rallyPressed: rp, primaryHeld: active && input.primary, primaryPressed: pp, interactPressed: ip, interactHeld: active && (input.keys.has('KeyE') || input.keys.has('KeyF') || input.touch.interactHeld), eye, dir, feet: player.pos,
            upgradesOpen: state === 'shop', hudCovered: state !== 'play' };
        }
        { const on = state === 'play' && !bot, wv = on && k === 0 && input.keys.has('KeyG'); inp = funPlay.beforeStep(dt, inp, { jump: on && input.jump, wave: wv && !waveHeld }); if (k === 0) waveHeld = wv; }
        game.hostUsing = !!inp.primaryHeld; game.hostEmote = funPlay.emote; game.hostDown = funPlay.downState(); game.hostBack = funPlay.downBack();
        if (net && net.role === 'guest') net.pk.feed(inp, { em: funPlay.emote, dn: funPlay.downState(), bk: funPlay.downBack(), tool: game.tool, moving: Math.hypot(player.vel[0], player.vel[2]), crouch: state === 'play' && input.crouch, flying: !!player.thrusting, act: myAct });
        game.hostMoving = Math.hypot(player.vel[0], player.vel[2]); game.hostCrouch = state === 'play' && input.crouch; game.hostFlying = !!player.thrusting; game.hostAct = myAct;
        game.step(dt, inp);
        stepAcc += dt;
      }
      if (state === 'play' && input.take('upgrades')) openScreen('upgrades');
      else if (state === 'play' && input.take('proficiencies')) openScreen('proficiencies');
      else if (state === 'play' && input.take('stats')) openScreen('stats');
      else if ((state === 'shop' || state === 'prof' || state === 'stats') && (input.take('upgrades') || input.take('pause') || input.take('proficiencies') || input.take('stats'))) closeScreen();
      else if (state === 'play' && input.take('pause')) openPause();
      if (state === 'shop' && input.take('interact')) shop.buySelected(true);
      netUpdate(realDt);
      onEvents(realDt);
      // footsteps
      const stride = 1.7;
      if (player.grounded && player.walked - (player._lastStep || 0) > stride) {
        player._lastStep = player.walked;
        const h = game.field.heightAt(player.pos[0], player.pos[2]); onPile = isFinite(h) && Math.abs(h - player.pos[1]) < 0.3 && game.field.hasMoney(player.pos[0], player.pos[2]);
        if (onPile) audio.playAny('sfx_step_money_', 4, { vol: 0.25 }); else audio.playAny('sfx_step_concrete_', 6, { vol: 0.2 });
      }
      // loops
      audio.loop('shredder_run_loop', game.queue.length > 0 ? 0.35 : 0);
      audio.loop('vacuum_loop', game.tool === TOOL.Vacuum ? 0.4 * game.vac.spin : 0); audio.setLoopPitch('vacuum_loop', 0.7 + 0.3 * game.vac.spin);
      audio.loop('sfx_drone_hum_loop', game.drones.some(d => d.state !== 'docked' && d.state !== 'recharge') ? 0.15 : 0);
      // prompt
      const holding = game.handHeld() > 0 || game.bag.some(x => x > 0);
      const key = coarse ? '' : '[E] ';
      // music auto-advance: random other gameplay track near the end of the current one
      { const b = audio.buffers.get(radio.tracks[radio.track][0]); if (b && state === 'play' && (performance.now() - radio.startedAt) / 1000 >= b.duration - 3) { const n = radio.tracks.length; let r = Math.floor(Math.random() * (n - 1)); if (r >= radio.track) r++; playTrack(r); } }
      const bn = boardAim.id && game.data.content.nodes.find(x => x.id === boardAim.id);
      const fin = game.finale;
      const fp = state !== 'play' ? '' : funPlay.prompt(key) ? funPlay.prompt(key) : fin.key.aimed ? key + T('hud.prompt_take_key') : fin.door.aimed && fin.has(FL.KEY) && fin.door.state === 0 ? key + T('hud.prompt_open_door')
        : fin.leverAimed ? key + T('encore.prompt') : findsPrompt(key);
      hud.prompt(state !== 'play' ? '' : fp ? fp : bn ? `${T(bn.nameKey)} · ${T('prof.details.rank', game.econ.rank(bn.id), Math.max(1, bn.maxRank))}${game.econ.canLearn(bn.id) === true ? ' · [LMB] ' + T('menu.hint.learn') : ''}` : radio.aimed >= 0 ? key + T(radio.aimed ? 'radio.next' : 'radio.prev') : game.ret.aimed >= 0 ? key + T('hud.prompt_return') : holding && game.nearShredder(player.pos) && !game.stream ? key + T('hud.prompt_deposit') : heaveReady() ? T('hud.prompt_heave') + ' ' + (coarse ? '★' : '[RMB]') : '');
      hud.update(game, frame);
      const fc0 = !game.intro.card && state === 'play' ? game.finale.card() : null;
      hud.objective(game.intro.card || (fc0 && { id: 'goal', icon: 'target', seg: 1, fill: fc0.fill != null ? fc0.fill : 0, prog: '',
        text: fc0.stage === STAGE.Billion ? T(fc0.key, '$' + Num.full(fc0.dollars), '$1,000,000,000') : fc0.stage === STAGE.Clear ? T(fc0.key, fc0.pct) : T(fc0.key) }));
      hud.keyChip(state === 'play' && game.flags.has(FL.KEY) && !game.flags.has(FL.FINALE));
      hud.runTimer(!!settings.runTimer && state === 'play', endFlow.clock(game.finale.run.finished ? game.finale.run.finaleSeconds : game.finale.run.seconds), game.finale.run.finished);
      { const fc = state === 'play' ? findSide() : null, sc = !fc && state === 'play' ? stepSide() : null;
        hud.side(fc ? fc : sc ? { move: sc.move, uses: sc.uses, done: sc.doneAt != null } : null); }
      hud.abilities(game, coarse);
      { const s = game.vaultEvents.s; let row = null;
        if (s.kind && state === 'play') {
          const rem = s.claimedAt >= 0 ? 0 : s.duration - s.elapsed, m = s.multiplier;
          const label = s.kind === 1 ? T('event.delivery.pill') : s.kind === 2 ? T('event.row.pallet') : s.kind === 3 ? T('event.row.overdrive', Num.short(m)) : s.kind === 5 ? T('event.row.minute', '2')
            : s.kind === 6 ? T(game.finds.carry && game.finds.carry.kind === 'crate' ? 'event.row.crate.carry' : 'event.row.crate') : T('event.row.sale', Math.round((1 - m) * 100));
          row = { icon: EV_ICON[s.kind], label, remaining: rem, duration: s.duration };
          if (s.kind === 1 && game.vaultEvents.heap && Math.random() < realDt * 18) { const vp = findsView.ventPoints(), p = vp[(Math.random() * vp.length) | 0], h = game.vaultEvents.heap;
            if (p) fx.fly(p, [h.x + (Math.random() - 0.5) * 6, game.field.heightAt(h.x, h.z) || 0, h.z + (Math.random() - 0.5) * 6], 1.1, 0.8, 4, 1.0); }
        }
        hud.eventRow(row); }
      for (const id of ach.step(realDt, game)) { const r = ACH.find(a => a[0] === id); hud.ach(id, T('ach.' + id.toLowerCase() + '.name'), T('ach.' + id.toLowerCase() + '.desc'), ach.count, ACH_TOTAL); sfx('SideTaskDone'); }
      saveAch();
      if (state === 'play' && callQ.length && !dialogue.open) { const c = callQ.shift(); if (c.pages) openDialogue(c.pages, c.after, c.live); else openDialogue(c, () => {}); }
      hud.jet(player, game.econ.hasUnlock('move.jetpack'), realDt);
      hud.pump(game, realDt);
      if (game.intro.step >= 5) { if (!prefGet('introBasics')) prefSet('introBasics'); }
      if (state === 'shop' && frame % 10 === 0) shop.tick();
      saveT += realDt; if (saveT > 15) { saveT = 0; saveNow(); }
    }
    // camera
    const e = player.eye();
    cam.position.set(e[0], e[1], e[2]);
    cam.rotation.set(player.pitch, player.yaw, funPlay.roll, 'YXZ');
    if (shakeT > 0) { shakeT -= realDt; const a = shakeA * Math.max(0, shakeT / shakeLen); cam.position.x += (Math.random() - 0.5) * a * 0.2; cam.position.y += (Math.random() - 0.5) * a * 0.2; cam.rotation.x += (Math.random() - 0.5) * a * 0.02; }
    moment.update(realDt);
    if (net || remotesShown || window.__coopFake) { const ns = now / 1000; if (net && net.role === 'host' && net.hn) feedRemotesHost(ns); remotes.update(realDt, cam, ns); remotesShown = !!net; }
    voiceFrame(realDt);
    // spending policy + wishes for the shop badges; the host's radio track for everyone
    if (net && !net.opening) {
      const W = net.role === 'host' ? net.ch.wishes : new Map(Object.entries(net.cg.wishes || {}));
      game.wishes = new Set([...W.values()].flat()); game.wantMode = net.role === 'guest' && !!net.cg.hostOnly;
      if (net.role === 'host') net.ch.radio = radio.track; else if (net.cg.radio !== radio.track && radio.tracks[net.cg.radio]) playTrack(net.cg.radio);
    } else { game.wishes = null; game.wantMode = false; }
    if (net && !net.opening) { chat.show(state !== 'menu' && state !== 'cinematic'); chat.feed(net.role === 'host' ? net.ch.chat : net.cg.chat); chat.update(realDt); } else chat.show(false);
    { const ci = coopView(); coopBar.set(ci && state !== 'menu' && state !== 'cinematic' ? ci : null); setTeam(!!ci && ci.players.length > 1); }
    pv.update(cam.position);
    if (frame % 6 === 0) boardUpdate(now / 1000);
    if (game.queue.length) { rollerA += realDt * 9; for (const r of rollers) r.matrix.copy(r.userData.base).multiply(rotM.makeRotationX(rollerA * r.userData.dir)); }
    dv.update(realDt, game);
    fx.update(realDt, handPoint());
    { // the aim drops out for a moment while the suction hole refills; keep the swirl on the last point briefly
      const v = game.vac, a0 = game.aim;
      if (a0) { lastAim = a0; lastAimT = now; }
      const a = a0 || (now - lastAimT < 400 ? lastAim : null);
      const on = game.tool === TOOL.Vacuum && v.spin > 0.3 && !!a && state !== 'menu';
      vortex.update(realDt, on, a ? a.point : [0, 0, 0], handPoint(), a ? Math.min(3, Math.max(0.4, a.dist * Math.tan(game._st.vacuumAngle / 2 * Math.PI / 180))) : 1, v.spin); }
    vm.update(realDt, game, player, look);
    { const fc = game.finale.card(); markers.update(realDt, game, player, cam, state === 'menu' ? null : game.intro.arrow || (fc && fc.arrow) || null); }
    finView.update(realDt, game, handPoint());
    if (finView.leverShown !== leverSolid) { leverSolid = finView.leverShown; world.setEnabled(/^Finale\/RefillLever\//, leverSolid); }
    findsView.update(realDt, game, cam);
    if (tellerScreen) tellerScreen.draw(game.finds.fed);
    renderer.info.reset();
    { const av = state === 'cinematic' ? endFlow.arrest.view() : null; if (av) post.render(av.scene, av.cam, null); else post.render(scene, cam, state === 'menu' || state === 'cinematic' ? null : vm); }
    input.endFrame();
    requestAnimationFrame(tick);
  }

  progress(1);
  // warm up: draw one frame behind the loading screen, then show the menu
  pv.budget = 200; pv.update(cam.position); pv.budget = 3;
  try { finView.bakeEnv(renderer); } catch (e) { log('door env', e.message); }
  // the hall seen from over the pit, prefiltered once: reflections for small metal props (the chest's coins and fittings)
  try { const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }), cc = new THREE.CubeCamera(0.1, 200, rt); cc.position.set(0, 4, -14); scene.add(cc); cc.update(renderer, scene); scene.remove(cc);
    const pm = new THREE.PMREMGenerator(renderer); findsView.setEnv(pm.fromCubemap(rt.texture).texture); pm.dispose(); rt.dispose(); } catch (e) { log('hall env', e.message); }
  $('loading').style.display = 'none';
  window.__info = { draws: group.children.length, quality };
  if (Q.get('autostart') != null) { const s = +(Q.get('slot') || 0); startGame(s, Q.get('fresh') != null || !Save.read(s)); if (Q.get('host') != null) openRoom(Q.get('host') === 'private'); }
  else if (Q.get('join')) { toMenu(); joinGame({ code: Q.get('join').toUpperCase() }); }
  else toMenu();
  if (Q.get('coopmsg')) { coopUi.error(T(Q.get('coopmsg')), Q.get('coopdetail') || '', null); const u = new URL(location.href); u.searchParams.delete('coopmsg'); u.searchParams.delete('coopdetail'); history.replaceState(null, '', u); }
  if (state === 'menu') { player.pos = [0, 5.2, 4]; player.pitch = -0.25; }
  requestAnimationFrame((t) => { last = t; tick(t); });
  addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.__ready = true;
}

boot().catch((e) => { log('BOOT', e.message, e.stack); loadTip.textContent = 'Load failed: ' + e.message; window.__bootError = e.message; });
