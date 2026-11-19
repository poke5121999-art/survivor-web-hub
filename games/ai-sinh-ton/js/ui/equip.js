// Trang Bị tab: the selected hero with six slot tiles, the shared bag, the item sheet, merge mode (inline: the stage
// panel turns into the merge preview and the bag grid dims what cannot be fodder) and the Ghép Nhanh preview.
// All account changes go through meta.*; this screen only reads meta.acc and rebuilds after each command.
import { SLOTS, TIERS, ITEM, itemStat, upgradeCost, refundOf, autoMergePlan } from '../data/equip.js?v=20261120c';
import { HERO } from '../data/heroes.js?v=20261120c';
import { makeBackdrop, makeBurst, fmt, rarityColor, kill } from './home.js?v=20261120c';
import { ITEM_ICON } from './itemicons.js?v=20261120c';

const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
const LEFT = ['weapon', 'necklace', 'gloves'], RIGHT = ['armor', 'belt', 'boots'];
const STAT_NAME = { atk: 'Công', hp: 'Máu' };
const STAT_ICON = { atk: 'atk', hp: 'heart' };
const SORTS = [{ id: 'tier', label: 'Xếp: Bậc' }, { id: 'lv', label: 'Xếp: Cấp' }];
const PERK_TIER = [0, 1, 2].map((k) => TIERS.find((t) => t.perk >= k + 1).name);
const STAGE = { x: 8, y: 122, w: 344, h: 212 };
const VP = { x: 76, y: 128, w: 208, h: 200 };
const GRID = { x: 10, y: 416, w: 340, h: 204, size: 60, pitch: 68, cols: 5 };
const PREV = { main: [24, 150], fod: [108, 158], fodPitch: 64, result: [266, 150] };
const dim = (hex, k) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k); };
const ease2 = (e) => e * e * (3 - 2 * e);

export function createEquip(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE, mui = game.metaUi, BZ = window.BZ;
  const eq = ui.screen('equip'), sheet = ui.screen('item', { modal: true }), autoS = ui.screen('auto', { modal: true });
  const bd = makeBackdrop(ui, 'equip'); eq.put(bd, 0, 0, -40);
  const S = { hero: '', mode: 'normal', sort: 0, main: 0, picks: [], sheet: 0 };
  const U = (mui.equipUi = { mode: 'normal', hero: '', atk: '', hp: '', atkBonus: '', hpBonus: '', bag: 0, sort: '', mats: {}, main: 0, picks: [], need: 0, preview: null, sheet: null, auto: null, fx: false, emptyText: '', hint: '', fly: null, flyN: 0, slotInfo: {}, best: null, toasts: [] });
  let dirty = true, fx = null, pulse = 0;
  meta.on(() => { dirty = true; });

  const bag = () => meta.acc.bag;
  const find = (uid) => meta.acc.bag.find((i) => i.uid === uid);
  const wornMap = () => { const m = new Map(); for (const [hid, e] of Object.entries(meta.acc.equip)) for (const [slot, uid] of Object.entries(e)) if (uid) m.set(uid, { hid, slot }); return m; };
  const slotOf = (it) => ITEM[it.item].slot;
  const heroIds = () => {
    const own = Object.keys(meta.acc.heroes).filter((id) => meta.acc.heroes[id].level > 0);
    return [...meta.acc.team.filter((id) => own.includes(id)), ...own.filter((id) => !meta.acc.team.includes(id))];
  };
  const veilGeo = new THREE.PlaneGeometry(1, 1), veilMat = new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false });
  const cap = (s) => s.charAt(0).toLocaleUpperCase('vi') + s.slice(1);
  // every explanation is one short toast, kept in U for the tests
  // a refused tap sets game.guideRefused so the guide does not count it as a press
  const refuse = (line) => { game.guideRefused = true; ui.toast(line); };
  const say = (line) => { U.toasts.push(line); if (U.toasts.length > 12) U.toasts.shift(); ui.toast(line); };
  // an invisible tap area (the kit button without its mesh)
  const tapArea = (id, w, h, onTap) => { const b = ui.button({ id, w, h, shadow: false, onTap }); b.traverse((o) => { if (o.isMesh) o.visible = false; }); return b; };

  // ---------- chrome of the screen ----------
  const title = ui.text('TRANG BỊ', { size: 22, align: 'center', upper: true, outlineW: 3.2 }); eq.put(title, 180, 50, 6); mui.regTitle('equip', title);
  const heroG = ui.group(); eq.put(heroG, 0, 0, 0);
  const mergeG = ui.group(); eq.put(mergeG, 0, 0, 0); mergeG.setVisible(false);

  // stat strip
  const statP = ui.panel({ w: 344, h: 40, r: 14, color: 0x3a2d78, depth: 4, bevel: 3 }); heroG.put(statP, 8, 78, 6);
  const stat = (x, key) => {
    statP.put(ui.icon(STAT_ICON[key], { size: 30 }), x, 5, 4);
    statP.put(ui.text(STAT_NAME[key].toUpperCase(), { size: 9, color: 0xffd9a0, outlineW: 1.4 }), x + 36, 3, 4);
    const v = ui.text('0', { size: 16 }), b = ui.text('', { size: 12, color: 0x7dff8a, outlineW: 2 });
    statP.put(v, x + 36, 15, 4); statP.put(b, x + 36 + 60, 19, 4);
    return { v, b, x };
  };
  const sA = stat(12, 'atk'), sH = stat(182, 'hp');
  heroG.put(tapArea('stat-panel', 344, 48, () => say('Công và Máu của tướng, đã cộng trang bị')), 8, 74, 9);

  // stage panel with the hero and the six slots
  const stage = ui.panel({ w: STAGE.w, h: STAGE.h, r: 22, color: 0x5a3fa0, depth: 5, bevel: 3 }); eq.put(stage, STAGE.x, STAGE.y, 4);
  const nameT = ui.text('', { size: 14, align: 'center', outlineW: 2.4 }); heroG.put(nameT, 180, 294, 24);
  const prev = ui.button({ id: 'hero-prev', w: 44, h: 40, r: 12, color: PAL.blue, icon: 'left', shadow: false, onTap: () => cycle(-1) }); heroG.put(prev, 80, 282, 22);
  heroG.put(tapArea('equip-hero', 112, 48, () => say(heroIds().length > 1 ? 'Chạm mũi tên để đổi tướng' : 'Tướng đang mặc trang bị')), 124, 280, 20);
  const next = ui.button({ id: 'hero-next', w: 44, h: 40, r: 12, color: PAL.blue, icon: 'right', shadow: false, onTap: () => cycle(1) }); heroG.put(next, 236, 282, 22);

  // bag header
  const bagT = ui.text('TÚI ĐỒ', { size: 16, outlineW: 2.4 }); eq.put(bagT, 14, 346, 6);
  const countT = ui.text('', { size: 11, color: 0xffe9a8, outlineW: 1.8 }); eq.put(countT, 82, 351, 6);
  const sortB = ui.button({ id: 'sort', w: 104, h: 36, r: 12, color: PAL.blue, label: SORTS[0].label, size: 13, shadow: false, onTap: () => { S.sort = (S.sort + 1) % SORTS.length; dirty = true; } }); eq.put(sortB, 244, 340, 6);

  const sc = ui.scroll({ w: GRID.w, h: GRID.h }); eq.put(sc, GRID.x, GRID.y, 4);
  const emptyG = ui.group(); eq.put(emptyG, 0, 0, 6); emptyG.setVisible(false);
  emptyG.put(ui.icon('bag', { size: 64 }), 148, 452, 2);

  // bottom buttons: normal mode (MẶC TỐT NHẤT, plus GHÉP once merge is open and GHÉP NHANH after the first merge) and merge mode.
  // GHÉP and GHÉP NHANH do not exist before they open, so the row is rebuilt when that changes.
  let bestB = null, mergeB = null, autoB = null, bottomKey = '';
  function buildBottom() {
    const showMerge = meta.unlocked('merge'), showAuto = showMerge && meta.autoShown(), key = showMerge + '|' + showAuto;
    if (key === bottomKey) return; bottomKey = key;
    for (const n of [bestB, mergeB, autoB]) if (n) kill(n);
    mergeB = autoB = null;
    const mk = (id, x, w, color, label, size, fn, sub) => { const n = ui.button({ id, w, h: 52, r: 16, color, label, sub, size, onTap: fn }); eq.put(n, x, 626, 6); return n; };
    if (!showMerge) bestB = mk('equip-best', 10, 340, PAL.green, 'MẶC TỐT NHẤT', 19, wearBest, ' ');
    else if (!showAuto) { mergeB = mk('merge', 10, 108, PAL.orange, 'GHÉP', 19, enterMerge); bestB = mk('equip-best', 126, 224, PAL.green, 'MẶC TỐT NHẤT', 17, wearBest, ' '); }
    else { mergeB = mk('merge', 10, 98, PAL.orange, 'GHÉP', 17, enterMerge); bestB = mk('equip-best', 114, 140, PAL.green, 'MẶC TỐT NHẤT', 13, wearBest, ' '); autoB = mk('automerge', 262, 88, PAL.blue, 'GHÉP NHANH', 11, openAuto); }
    layoutMode();
  }
  const cancelB = ui.button({ id: 'merge-cancel', w: 100, h: 52, r: 16, color: PAL.red, label: 'HUỶ', size: 17, onTap: leaveMerge }); eq.put(cancelB, 10, 626, 6);
  const doB = ui.button({ id: 'merge-do', w: 232, h: 52, r: 16, color: PAL.green, label: 'GHÉP', sub: ' ', size: 19, onTap: doMerge }); eq.put(doB, 118, 626, 6);
  cancelB.setVisible(false); doB.setVisible(false);

  const burst = makeBurst(ui); eq.put(burst.node, 0, 0, 70);
  const fxLayer = ui.group(); eq.put(fxLayer, 0, 0, 60);
  const glowCan = document.createElement('canvas'); glowCan.width = glowCan.height = 64;
  { const c = glowCan.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.45, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const glowTex = new THREE.CanvasTexture(glowCan); glowTex.colorSpace = THREE.SRGBColorSpace;

  // ---------- tiles ----------
  // pooled little hero portraits for items worn by someone else: a portrait is a whole model, so each is made once
  const pool = new Map();
  const chipOf = (hid, k) => { const key = hid + '#' + k; if (!pool.has(key)) pool.set(key, ui.portrait(hid, { size: 24, color: rarityColor(hid), fps: 3, shadow: false })); return pool.get(key); };
  const unpool = () => { for (const p of pool.values()) p.parent && p.parent.remove(p); };

  function itemTile(it, o) {
    const T = TIERS[it.tier], size = o.size;
    const icon = ui.icon(ITEM_ICON(it.item), { size: Math.round(size * 0.74), sway: !!o.sway });
    const t = ui.tile({ size, color: T.color, node: icon, level: it.lv, plus: T.plus || undefined, up: !!o.up, id: o.id, onTap: o.onTap, shadow: o.shadow });
    if (o.slotIcon) t.put(ui.icon(slotOf(it), { size: Math.round(size * 0.27), sway: false }), Math.max(3, size * 0.07), size - Math.round(size * 0.27) - Math.max(3, size * 0.07), 12);
    if (o.dot) t.setBadge(true);
    return t;
  }
  function veil(t, size) { const m = new THREE.Mesh(veilGeo, veilMat); m.scale.set(size, size, 1); t.put(m, size / 2, size / 2, 32); }

  // ---------- hero stage ----------
  let vpNode = null, modelM = null, rotY = 0.4, dragging = false, builtFor = '';
  function buildModel() {
    if (vpNode) { kill(vpNode); vpNode = null; }
    const bz = BZ && BZ.HEROES && BZ.HEROES.find((h) => h.id === S.hero), root = new THREE.Group(); modelM = null;
    if (bz && BZ.heroModel) { try { const m = BZ.heroModel(S.hero); try { BZ.equipWeapon(m, bz.weapon); } catch (e) { /* weapon is decoration here */ } root.add(m.root); modelM = m; } catch (e) { console.warn('[equip] model failed: ' + e.message); } }
    if (!modelM) root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.6), new THREE.MeshStandardMaterial({ color: rarityColor(S.hero) })));
    const st = { speed: 0, air: 0, vy: 0, swing: -1, mode: 'none', draw: 1, pitch: 0, kick: 0, kickL: 0, sprint: false, crouch: 0, hurt: 0 };
    const col = rarityColor(S.hero);
    vpNode = ui.viewport(root, { w: VP.w, h: VP.h, r: 16, bg: dim(col, 0.32), fps: 24, fov: 26, update: (dt) => { if (modelM) { if (!dragging) rotY += dt * 0.35; modelM.root.rotation.y = rotY; BZ.animHero(modelM, st, dt); } } });
    heroG.put(vpNode, VP.x, VP.y, 14); stage.setColor(col); builtFor = S.hero;
  }
  function cycle(d) {
    const ids = heroIds(); if (ids.length < 2) return;
    S.hero = ids[(ids.indexOf(S.hero) + d + ids.length) % ids.length]; rotY = 0.4; dirty = true;
  }
  const fr = document.getElementById('frame'); let dx0 = 0;
  const inVp = (e) => { const r = fr.getBoundingClientRect(), k = r.width / 360, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k; return x > VP.x && x < VP.x + VP.w && y > VP.y && y < VP.y + VP.h; };
  fr.addEventListener('pointerdown', (e) => { if (ui.isShown('equip') && !ui.isShown('item') && !ui.isShown('auto') && S.mode === 'normal' && inVp(e) && !ui.hitAt(e.clientX, e.clientY)) { dragging = true; dx0 = e.clientX; } });
  fr.addEventListener('pointermove', (e) => { if (dragging) { rotY += (e.clientX - dx0) * 0.012; dx0 = e.clientX; } });
  const endDrag = () => { dragging = false; };
  fr.addEventListener('pointerup', endDrag); fr.addEventListener('pointercancel', endDrag);

  let slotNodes = [];
  function buildSlots() {
    for (const n of slotNodes) kill(n); slotNodes = [];
    const e = meta.acc.equip[S.hero] || {}, sd = meta.dots().slotDots[S.hero] || {};
    U.slotInfo = {};
    const place = (slot, x, y) => {
      const cur = find(e[slot]); let t;
      if (!meta.slotOpen(slot)) {
        const ghost = ui.group({ w: 34, h: 34 }); ghost.put(ui.icon(slot, { size: 34, sway: false }), 0, 0, 0);
        for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(veilGeo, veilMat); m.scale.set(40, 40, 1); ghost.put(m, 17, 17, 14 + k); }
        t = ui.tile({ size: 56, color: 0x2b2548, node: ghost, id: 'slot-' + slot, onTap: () => say(meta.slotLine(slot)) });
        t.put(ui.icon('lock', { size: 24, sway: false }), 16, 16, 40);
        U.slotInfo[slot] = 'closed';
      } else if (cur) {
        t = itemTile(cur, { size: 56, id: 'slot-' + slot, onTap: () => openSheet(cur.uid), dot: !!sd[slot], slotIcon: false });
        U.slotInfo[slot] = 'worn';
      } else {
        const ghost = ui.group({ w: 34, h: 34 }); ghost.put(ui.icon(slot, { size: 34, sway: false }), 0, 0, 0);
        const m = new THREE.Mesh(veilGeo, veilMat); m.scale.set(40, 40, 1); ghost.put(m, 17, 17, 14);
        t = ui.tile({ size: 56, color: 0x4a3f78, node: ghost, id: 'slot-' + slot, onTap: () => tapEmpty(slot) });
        if (sd[slot]) t.setBadge(true);
        U.slotInfo[slot] = 'empty';
      }
      if (sd[slot]) U.slotInfo[slot] += ':dot';
      heroG.put(t, x, y, 8); slotNodes.push(t);
    };
    LEFT.forEach((s, i) => place(s, 14, 132 + i * 66)); RIGHT.forEach((s, i) => place(s, 290, 132 + i * 66));
  }
  function tapEmpty(slot) {
    const worn = wornMap(), c = bag().filter((i) => slotOf(i) === slot && !worn.has(i.uid)).sort((a, b) => itemStat(b) - itemStat(a))[0];
    if (c) openSheet(c.uid); else say(`${SLOT[slot].name}: chưa có món nào, thắng ải để nhặt`);
  }
  function refreshHero() {
    const s = meta.heroStats(S.hero);
    nameT.set(`${HERO[S.hero].name} (Lv.${s.level})`);
    sA.v.set(fmt(s.atk)); sH.v.set(fmt(s.hp));
    sA.b.set(s.atkFlat ? '+' + fmt(s.atkFlat) : ''); sH.b.set(s.hpFlat ? '+' + fmt(s.hpFlat) : '');
    sA.b.pos(sA.x + 36 + sA.v.w + 6, 19); sH.b.pos(sH.x + 36 + sH.v.w + 6, 19);
    Object.assign(U, { hero: S.hero, atk: fmt(s.atk), hp: fmt(s.hp), atkBonus: s.atkFlat ? '+' + fmt(s.atkFlat) : '', hpBonus: s.hpFlat ? '+' + fmt(s.hpFlat) : '' });
    const multi = heroIds().length > 1; prev.setVisible(multi); next.setVisible(multi);
    if (bestB) {
      const plan = meta.equipBestPlan(S.hero), g = plan.gain, ok = plan.changes.length > 0;
      bestB.setEnabled(ok); bestB.setBadge(!!(meta.dots().best[S.hero]));
      bestB.setSub(ok ? [g.atk ? '+' + fmt(g.atk) + ' Công' : '', g.hp ? '+' + fmt(g.hp) + ' Máu' : ''].filter(Boolean).join('  ') : 'Đã tốt nhất');
      U.best = { enabled: ok, changes: plan.changes.length, gain: g };
    }
  }

  // ---------- bag grid ----------
  let gridNodes = [], matNodes = [];
  const stat0 = (it) => itemStat(it);
  const sorters = { tier: (a, b) => b.tier - a.tier || stat0(b) - stat0(a) || b.lv - a.lv || a.uid - b.uid, lv: (a, b) => b.lv - a.lv || b.tier - a.tier || stat0(b) - stat0(a) || a.uid - b.uid };
  const fodderWhy = (main, f) => {
    const T = TIERS[main.tier];
    if (f.tier !== main.tier) return 'Khác bậc';
    if (T.exact ? f.item !== main.item : slotOf(f) !== slotOf(main)) return T.exact ? 'Khác món' : 'Khác ô trang bị';
    return null;
  };
  // how a bag item looks and behaves in merge mode
  function roleOf(it, worn) {
    if (!S.main) return TIERS[it.tier].need ? { role: 'free' } : { role: 'dim', why: 'Bậc cao nhất' };
    if (it.uid === S.main) return { role: 'main' };
    if (S.picks.includes(it.uid)) return { role: 'pick' };
    const why = fodderWhy(find(S.main), it);
    if (why) return { role: 'dim', why };
    if (worn.has(it.uid)) return { role: 'worn', why: 'Đang được mặc, hãy tháo ra trước' };
    return { role: 'free' };
  }
  function buildGrid() {
    const keep = sc.getScroll(); unpool();
    for (const n of gridNodes) kill(n); gridNodes = [];
    const worn = wornMap(), merging = S.mode === 'merge';
    const list = bag().filter((it) => merging || !(worn.get(it.uid) && worn.get(it.uid).hid === S.hero)).sort(sorters[SORTS[S.sort].id]);
    const used = {}; U.roles = {};
    list.forEach((it, i) => {
      const x = (i % GRID.cols) * GRID.pitch + 2, y = Math.floor(i / GRID.cols) * GRID.pitch + 2, w = worn.get(it.uid);
      const r = merging ? roleOf(it, worn) : { role: 'free' };
      const dot = false;
      const t = itemTile(it, { size: GRID.size, id: 'bag-' + it.uid, onTap: () => onBag(it.uid), slotIcon: true, dot, shadow: true });
      if (w && w.hid !== S.hero) { used[w.hid] = (used[w.hid] || 0) + 1; t.put(chipOf(w.hid, used[w.hid]), GRID.size - 24 - 3, 3, 14); }
      if (merging) {
        U.roles[it.uid] = r.role;
        if (r.role === 'dim' || r.role === 'worn') veil(t, GRID.size);
        if (r.role === 'worn') t.put(ui.icon('lock', { size: 26, sway: false }), 17, 17, 40);
        if (r.role === 'pick') t.put(ui.icon('check', { size: 30, sway: false }), 15, 15, 40);
        if (r.role === 'main') t.put(ui.icon('star', { size: 22, sway: false }), 36, -2, 40);
      }
      sc.put(t, x, y, 2); gridNodes.push(t);
    });
    sc.setContentH(Math.max(GRID.h, Math.ceil(list.length / GRID.cols) * GRID.pitch + 4)); sc.scrollTo(keep);
    const empty = !list.length && !merging; emptyG.setVisible(empty); U.emptyText = '';
    countT.set(`${list.length} món`); U.bag = list.length; U.sort = SORTS[S.sort].label; sortB.setLabel(U.sort);
    U.uids = list.map((it) => it.uid);
  }
  function buildMats() {
    for (const n of matNodes) kill(n); matNodes = []; U.mats = {};
    if (!meta.unlocked('upgrade')) return;
    let k = 0;
    SLOTS.forEach((s) => {
      if (!meta.slotOpen(s.id)) return;
      const n = meta.acc.mats[s.id] || 0, p = ui.panel({ w: 54, h: 26, r: 13, color: 0x2a2150, depth: 3, bevel: 2, ow: 2.2, shadow: false });
      p.put(ui.icon(s.id, { size: 28, sway: false }), -6, -1, 4); p.put(ui.text(fmt(n), { size: 12, align: 'right', valign: 'mid', outlineW: 1.8 }), 50, 14, 4);
      eq.put(p, 10 + k++ * 57.5, 384, 6); matNodes.push(p); U.mats[s.id] = fmt(n);
    });
    const area = tapArea('mats', 340, 48, () => say('Bản rèn: dùng để nâng cấp món cùng ô')); eq.put(area, 10, 372, 3); matNodes.push(area);
  }

  // ---------- item sheet ----------
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(360, 900), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.68, depthWrite: false })); sheet.put(m, 180, 390, -10); }
  const shP = ui.panel({ w: 316, h: 500, r: 24, color: 0x4a3a86, depth: 6, bevel: 3 }); sheet.put(shP, 22, 96, 6);
  const wearB = ui.button({ id: 'wear', w: 142, h: 52, r: 16, color: PAL.green, label: 'MẶC', sub: ' ', size: 19, onTap: doWear }); shP.put(wearB, 12, 384, 6);
  const upB = ui.button({ id: 'upgrade', w: 142, h: 52, r: 16, color: PAL.orange, label: 'NÂNG CẤP', sub: ' ', size: 15, onTap: doUpgrade }); shP.put(upB, 162, 384, 6);
  const closeB = ui.button({ id: 'sheet-close', w: 150, h: 44, r: 14, color: PAL.red, label: 'ĐÓNG', size: 17, onTap: closeSheet }); shP.put(closeB, 83, 446, 6);
  const shBurst = makeBurst(ui); sheet.put(shBurst.node, 0, 0, 60);
  let shDyn = [];
  function openSheet(uid) { if (fx) return; S.sheet = uid; buildSheet(); ui.show('item', { transition: 'pop' }); }
  function closeSheet() { S.sheet = 0; U.sheet = null; ui.hide('item', { transition: 'pop' }); }
  function buildSheet() {
    const it = find(S.sheet); if (!it) { closeSheet(); return; }
    for (const n of shDyn) kill(n); shDyn = [];
    const T = TIERS[it.tier], def = ITEM[it.item], slot = SLOTS.find((s) => s.id === def.slot), w = wornMap().get(it.uid);
    const put = (n, x, y, z = 4) => { shP.put(n, x, y, z); shDyn.push(n); return n; };
    const tile = ui.tile({ size: 104, color: T.color, node: ui.icon(ITEM_ICON(it.item), { size: 78, sway: true }) }); put(tile, 106, 14);
    put(ui.text(def.name, { size: 20, align: 'center', outlineW: 3 }), 158, 124);
    const tn = T.name, tp = ui.panel({ w: Math.max(96, tn.length * 11 + 28), h: 24, r: 12, color: T.color, depth: 3, bevel: 2, ow: 2.4, shadow: false }); put(tp, 158 - Math.max(96, tn.length * 11 + 28) / 2, 152);
    tp.put(ui.text(tn, { size: 13, align: 'center', valign: 'mid', upper: true, outlineW: 2 }), Math.max(96, tn.length * 11 + 28) / 2, 13, 2);
    put(tapArea('tier-tag', Math.max(120, tn.length * 11 + 28), 48, () => say(T.need ? `${tn}: ghép ${T.need} món lên ${TIERS[it.tier + 1].name}` : `${tn}: bậc cao nhất`)), 158 - Math.max(120, tn.length * 11 + 28) / 2, 140, 8);
    put(ui.text(`Cấp ${it.lv}/${T.maxLv}`, { size: 14, align: 'center', outlineW: 2.2 }), 158, 182);
    put(ui.icon(STAT_ICON[slot.stat], { size: 30, sway: false }), 96, 202);
    const st = itemStat(it); put(ui.text(`+${fmt(st)} ${STAT_NAME[slot.stat]}`, { size: 18, color: 0xffe27a, outlineW: 2.6 }), 130, 207);
    const up = meta.canUpgradeItem(it.uid), nextStat = it.lv < T.maxLv ? itemStat({ ...it, lv: it.lv + 1 }) - st : 0;
    put(ui.text(nextStat ? `Lên cấp ${it.lv + 1}: +${fmt(nextStat)}` : 'Đã đạt cấp tối đa', { size: 11, align: 'center', color: nextStat ? 0x7dff8a : 0xffd9a0, outlineW: 1.6 }), 158, 238);
    const perks = [];
    def.perks.forEach((p, k) => {
      const on = (T.perk || 0) > k, row = ui.panel({ w: 292, h: 34, r: 12, color: on ? 0x2f7a4a : 0x2a2150, depth: 3, bevel: 2, ow: 2, shadow: false });
      put(row, 12, 256 + k * 38, 3);
      row.put(ui.icon(on ? 'star' : 'lock', { size: 22, sway: false }), 5, 6, 3);
      row.put(ui.text(p.t, { size: 11, maxW: on ? 244 : 192, lineH: 13, color: on ? 0xffffff : 0x9a93c0, outlineW: 1.6 }), 32, on ? 9 : 9, 3);
      if (!on) row.put(ui.text('Mở ở ' + PERK_TIER[k], { size: 9, align: 'right', color: 0xcfa0ff, outlineW: 1.4 }), 284, 12, 3);
      perks.push({ text: p.t, on, tier: PERK_TIER[k] });
    });
    wearB.setLabel(w && w.hid === S.hero ? 'THÁO' : 'MẶC');
    const cur = meta.acc.equip[S.hero] && find(meta.acc.equip[S.hero][def.slot]);
    wearB.setSub(w && w.hid === S.hero ? HERO[S.hero].name : w ? `Lấy từ ${HERO[w.hid].name}` : cur ? `Thay ${ITEM[cur.item].name}` : `Cho ${HERO[S.hero].name}`);
    let line;
    if (it.lv >= T.maxLv) line = 'Cấp tối đa'; else if (up.free) line = 'MIỄN PHÍ'; else if (up.ok) line = `${fmt(up.cost.gold)} vàng · ${up.cost.mats} bản rèn`; else if (up.why === 'thiếu vàng') line = `Thiếu ${fmt(up.cost.gold - meta.acc.gold)} vàng`; else line = `Thiếu ${up.cost.mats - meta.acc.mats[def.slot]} bản rèn`;
    upB.setEnabled(up.ok); upB.setSub(line);
    U.sheet = { uid: it.uid, name: def.name, tier: tn, lv: `Cấp ${it.lv}/${T.maxLv}`, stat: `+${fmt(st)} ${STAT_NAME[slot.stat]}`, perks, wear: w && w.hid === S.hero ? 'THÁO' : 'MẶC', upgrade: line, upgradeOk: up.ok };
  }
  // the number that rises: a big +N over the stat it changed, and the stat strip pulses
  function popGain(g) {
    const rows = [['atk', 88, g.atk], ['hp', 262, g.hp]].filter((r) => r[2] > 0);
    for (const [key, x, n] of rows) {
      const text = '+' + fmt(n), size = 26, w = text.length * size * 0.62 + 8, h = size + 6;
      ui.fly(text, x, 112, { size });
      U.fly = { stat: key, text, n, rect: { x: x - w / 2, y: 112 - 46 - h / 2, w, h: 46 + h }, title: { x: 180 - title.w / 2, y: 50 - title.h / 2, w: title.w, h: title.h * 1.5 } }; U.flyN++;
    }
    if (rows.length) pulse = 0.55;
  }
  const statDiff = (a, b) => ({ atk: b.atk - a.atk, hp: b.hp - a.hp });
  function doWear() {
    const it = find(S.sheet); if (!it) return;
    const w = wornMap().get(it.uid), slot = slotOf(it);
    if (w && w.hid === S.hero) { const r = meta.unequip(S.hero, slot); if (!r.ok) { refuse(cap(r.why)); return; } ui.toast(`Đã tháo ${ITEM[it.item].name}`); closeSheet(); return; }
    const s0 = meta.heroStats(S.hero);
    const r = meta.equip(S.hero, it.uid); if (!r.ok) { refuse(cap(r.why)); return; }
    ui.toast(`${HERO[S.hero].name} đã mặc ${ITEM[it.item].name}`); closeSheet();
    const left = LEFT.includes(slot); burst.spawn(left ? 42 : 318, 160 + (left ? LEFT : RIGHT).indexOf(slot) * 66, 22, TIERS[it.tier].color, 170); game.vibrate && game.vibrate(15);
    popGain(statDiff(s0, meta.heroStats(S.hero)));
  }
  function wearBest() {
    if (fx) return;
    const s0 = meta.heroStats(S.hero), r = meta.equipBest(S.hero); if (!r.ok) { refuse(cap(r.why)); return; }
    ui.toast(`${HERO[S.hero].name} đã mặc ${r.changes.length} món tốt nhất`); game.vibrate && game.vibrate(20);
    burst.spawn(180, 230, 26, 0xffc21f, 190); popGain(statDiff(s0, meta.heroStats(S.hero)));
  }
  function doUpgrade() {
    const it = find(S.sheet); if (!it) return;
    const free = !meta.unlocked('upgrade'), s0 = meta.heroStats(S.hero);
    const r = meta.upgradeItem(it.uid); if (!r.ok) { refuse(cap(r.why)); return; }
    shBurst.spawn(180, 150, 24, TIERS[it.tier].color, 200); ui.fly('LÊN CẤP ' + r.lv + '!', 180, 150); game.vibrate && game.vibrate(20);
    if (free) { closeSheet(); popGain(statDiff(s0, meta.heroStats(S.hero))); }
  }

  // ---------- merge mode ----------
  let pvNodes = [];
  const pills = (a, b, y) => {
    const mk = (T, x) => { const p = ui.panel({ w: 98, h: 26, r: 13, color: T.color, depth: 3, bevel: 2, ow: 2.4, shadow: false }); mergeG.put(p, x, y, 14); p.put(ui.text(T.name, { size: 12, align: 'center', valign: 'mid', upper: true, outlineW: 2 }), 49, 14, 2); pvNodes.push(p); };
    mk(a, 52); mk(b, 210); const ar = ui.icon('right', { size: 22, sway: false }); mergeG.put(ar, 169, y + 2, 14); pvNodes.push(ar);
  };
  function buildPreview() {
    for (const n of pvNodes) kill(n); pvNodes = [];
    const main = S.main ? find(S.main) : null, add = (n, x, y, z = 14) => { mergeG.put(n, x, y, z); pvNodes.push(n); return n; };
    const head = main ? 'Ghép lên bậc cao hơn' : 'Chọn món chính để ghép';
    add(ui.text(head, { size: 14, align: 'center', outlineW: 2.4 }), 180, 130);
    const pv = { from: '', to: '', before: '', after: '', refund: '', hint: '' };
    if (!main) {
      add(ui.tile({ size: 72, color: 0x4a3f78, node: ui.text('?', { size: 34, align: 'center', valign: 'mid' }) }), PREV.main[0], PREV.main[1]);
      add(ui.tile({ size: 72, color: 0x4a3f78, node: ui.text('?', { size: 34, align: 'center', valign: 'mid' }) }), PREV.result[0], PREV.result[1]);
      pv.hint = 'Chạm một món trong túi đồ';
      add(ui.text(pv.hint, { size: 13, align: 'center', color: 0xffe9a8, outlineW: 2 }), 180, 250);
      add(ui.text('Món chính giữ nguyên cấp,\nnguyên liệu được hoàn vàng và bản rèn.', { size: 11, align: 'center', lineH: 15, color: 0xe4def8, outlineW: 1.6 }), 180, 276);
      U.need = 0; U.preview = pv; U.hint = pv.hint; return;
    }
    const T = TIERS[main.tier], T2 = TIERS[main.tier + 1], need = T.need - 1;
    add(itemTile(main, { size: 72, shadow: true, sway: true }), PREV.main[0], PREV.main[1]);
    for (let i = 0; i < need; i++) {
      const f = find(S.picks[i]), x = PREV.fod[0] + i * PREV.fodPitch, y = PREV.fod[1];
      let t;
      if (f) { t = itemTile(f, { size: 56, shadow: true }); t.put(ui.icon('check', { size: 24, sway: false }), 32, 32, 40); } else t = ui.tile({ size: 56, color: 0x4a3f78, node: ui.text('+', { size: 28, align: 'center', valign: 'mid' }) });
      add(t, x, y);
    }
    add(ui.icon('right', { size: 26, sway: false }), 236, 172);
    const res = { ...main, tier: main.tier + 1 };
    add(itemTile(res, { size: 72, shadow: true, sway: true }), PREV.result[0], PREV.result[1]);
    pills(T, T2, 232);
    const sl = SLOTS.find((s) => s.id === slotOf(main)), b = itemStat(main), a = itemStat(res);
    pv.from = T.name; pv.to = T2.name; pv.before = fmt(b); pv.after = fmt(a);
    add(ui.text(`${STAT_NAME[sl.stat]} ${pv.before} → ${pv.after}`, { size: 15, align: 'center', color: 0xffe27a, outlineW: 2.4 }), 180, 266);
    let g = 0, m = 0; for (const uid of S.picks) { const f = find(uid); if (f) { const r = refundOf(f.lv); g += r.gold; m += r.mats; } }
    pv.refund = g || m ? `Hoàn lại: ${fmt(g)} vàng · ${m} bản rèn` : 'Hoàn lại vàng và bản rèn đã đổ vào nguyên liệu';
    add(ui.text(pv.refund, { size: 11, align: 'center', color: 0xe4def8, outlineW: 1.6 }), 180, 290);
    const left = need - S.picks.length;
    pv.hint = left ? (T.exact ? `Cần thêm ${left} món giống hệt` : 'Cần thêm 1 món cùng ô, cùng bậc') : 'Đủ nguyên liệu, bấm GHÉP';
    add(ui.text(pv.hint, { size: 12, align: 'center', color: left ? 0xffa040 : 0x7dff8a, outlineW: 2 }), 180, 310);
    U.need = need; U.preview = pv; U.hint = pv.hint;
  }
  function paintMergeButtons() {
    const main = S.main ? find(S.main) : null, need = main ? TIERS[main.tier].need - 1 : 0, ready = !!main && S.picks.length === need;
    doB.setEnabled(ready); doB.setSub(main ? (ready ? `${TIERS[main.tier].name} → ${TIERS[main.tier + 1].name}` : 'Chọn đủ nguyên liệu') : 'Chọn món chính'); U.ready = ready;
  }
  function enterMerge() {
    if (!meta.unlocked('merge')) { refuse(meta.lockText('merge')); return; }
    if (!bag().length) { refuse('Chưa có trang bị nào để ghép'); return; }
    S.mode = 'merge'; S.main = 0; S.picks = []; sc.scrollTo(0); dirty = true; layoutMode();
  }
  function leaveMerge() { if (fx) return; S.mode = 'normal'; S.main = 0; S.picks = []; dirty = true; layoutMode(); }
  function layoutMode() {
    const m = S.mode === 'merge';
    heroG.setVisible(!m); mergeG.setVisible(m); for (const n of [bestB, mergeB, autoB]) if (n) n.setVisible(!m); cancelB.setVisible(m); doB.setVisible(m);
    title.set(m ? 'GHÉP TRANG BỊ' : 'TRANG BỊ'); U.mode = S.mode; stage.setColor(m ? 0x8a3fa0 : rarityColor(S.hero));
  }
  function onBag(uid) {
    if (fx) return;
    const it = find(uid); if (!it) return;
    if (S.mode === 'normal') { openSheet(uid); return; }
    const r = roleOf(it, wornMap());
    if (!S.main) { if (r.role === 'dim') { refuse(r.why); return; } S.main = uid; S.picks = []; }
    else if (r.role === 'main') { S.main = 0; S.picks = []; }
    else if (r.role === 'pick') S.picks = S.picks.filter((p) => p !== uid);
    else if (r.role === 'dim' || r.role === 'worn') { refuse(r.why); return; }
    else if (S.picks.length >= TIERS[find(S.main).tier].need - 1) { refuse('Đã đủ nguyên liệu'); return; }
    else S.picks.push(uid);
    U.main = S.main; U.picks = S.picks.slice(); dirty = true;
  }
  function doMerge() {
    if (fx) return;
    const main = find(S.main); if (!main) return;
    const flyFrom = S.picks.map((uid, i) => ({ it: find(uid), x: PREV.fod[0] + i * PREV.fodPitch + 28, y: PREV.fod[1] + 28 }));
    const r = meta.merge(S.main, S.picks); if (!r.ok) { refuse(cap(r.why)); return; }
    const flies = flyFrom.map((f) => { const n = ui.icon(ITEM_ICON(f.it.item), { size: 50, sway: false }); fxLayer.put(n, f.x - 25, f.y - 25, 2); return { n, x0: f.x, y0: f.y }; });
    const col = TIERS[main.tier].color, gm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    gm.scale.set(10, 10, 1); fxLayer.put(gm, PREV.main[0] + 36, PREV.main[1] + 36, 1);
    fx = { t: 0, flies, gm, col, hit: false, tx: PREV.main[0] + 36, ty: PREV.main[1] + 36 }; U.fx = true;
    S.picks = []; U.picks = [];
  }
  function stepFx(dt) {
    fx.t += dt; const e = Math.min(1, fx.t / 0.5);
    for (const f of fx.flies) { const k = e * e; f.n.pos(f.x0 + (fx.tx - f.x0) * k - 25 * (1 - 0.5 * k), f.y0 + (fx.ty - f.y0) * k - 25 * (1 - 0.5 * k)); f.n.scale.setScalar(1 - 0.5 * k); f.n.visible = e < 1; }
    if (fx.t >= 0.5 && !fx.hit) { fx.hit = true; burst.spawn(fx.tx, fx.ty, 30, fx.col, 210); game.vibrate && game.vibrate(25); }
    if (fx.hit) { const k = (fx.t - 0.5) / 0.6, s = 50 + ease2(Math.min(1, k)) * 150; fx.gm.scale.set(s, s, 1); fx.gm.material.opacity = Math.max(0, Math.sin(Math.min(1, k) * Math.PI)) * (game.settings && game.settings.reduceFlash ? 0.4 : 0.75); }
    if (fx.t >= 1.15) { for (const f of fx.flies) kill(f.n); fx.gm.material.dispose(); fxLayer.remove(fx.gm); fx = null; U.fx = false; dirty = true; }
  }

  // ---------- Ghép Nhanh ----------
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(360, 900), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.68, depthWrite: false })); autoS.put(m, 180, 390, -10); }
  const aP = ui.panel({ w: 316, h: 520, r: 24, color: 0x4a3a86, depth: 6, bevel: 3 }); autoS.put(aP, 22, 90, 6);
  const aTitle = ui.text('GHÉP NHANH', { size: 22, align: 'center', upper: true }); aP.put(aTitle, 158, 12, 4); mui.regTitle('auto', aTitle);
  const aCount = ui.text('', { size: 17, align: 'center', outlineW: 2.6 }); aP.put(aCount, 158, 46, 4);
  const aDo = ui.button({ id: 'auto-do', w: 280, h: 52, r: 16, color: PAL.green, label: 'GHÉP HẾT', size: 19, onTap: doAuto }); aP.put(aDo, 18, 392, 6);
  const aNo = ui.button({ id: 'auto-cancel', w: 150, h: 44, r: 14, color: PAL.red, label: 'HUỶ', size: 17, onTap: () => ui.hide('auto', { transition: 'pop' }) }); aP.put(aNo, 83, 456, 6);
  let aDyn = [];
  // what Ghép Nhanh would do: the same plan meta.autoMerge repeats, run on copies of the bag
  function simAuto() {
    const worn = new Set(wornMap().keys()), items = bag().map((i) => ({ ...i })), start = new Map(items.map((i) => [i.uid, i.tier])), touched = new Set();
    let merges = 0;
    for (;;) {
      const plan = autoMergePlan(items, worn); if (!plan.length) break;
      for (const p of plan) {
        const main = items.find((i) => i.uid === p.main.uid); main.tier++; touched.add(main.uid); merges++;
        for (const f of p.fodder) items.splice(items.findIndex((i) => i.uid === f.uid), 1);
      }
    }
    const groups = new Map();
    for (const uid of touched) { const it = items.find((i) => i.uid === uid); if (!it) continue; const k = `${it.item}|${start.get(uid)}|${it.tier}`; const g = groups.get(k) || { item: it.item, from: start.get(uid), to: it.tier, n: 0 }; g.n++; groups.set(k, g); }
    return { merges, rows: [...groups.values()].sort((a, b) => b.to - a.to || b.n - a.n) };
  }
  function openAuto() {
    if (!meta.unlocked('merge')) { refuse(meta.lockText('merge')); return; }
    const r = simAuto(); if (!r.merges) { refuse('Chưa có bộ ba nào giống nhau để ghép'); return; }
    for (const n of aDyn) kill(n); aDyn = [];
    const put = (n, x, y, z = 4) => { aP.put(n, x, y, z); aDyn.push(n); return n; };
    aCount.set(`Sẽ ghép ${r.merges} lần`);
    r.rows.slice(0, 5).forEach((g, i) => {
      const y = 82 + i * 60, row = ui.panel({ w: 292, h: 54, r: 14, color: 0x2a2150, depth: 3, bevel: 2, ow: 2, shadow: false }); put(row, 12, y, 2);
      row.put(itemTile({ item: g.item, tier: g.to, lv: 1 }, { size: 44, shadow: false }), 5, 5, 2);
      row.put(ui.text(ITEM[g.item].name, { size: 13, outlineW: 2 }), 56, 8, 2);
      row.put(ui.text(`${TIERS[g.from].name} → ${TIERS[g.to].name}`, { size: 11, color: 0xffe9a8, outlineW: 1.6 }), 56, 29, 2);
      row.put(ui.text('x' + g.n, { size: 18, align: 'right', color: 0xffe27a, outlineW: 2.6 }), 282, 15, 2);
    });
    if (r.rows.length > 5) put(ui.text(`và ${r.rows.length - 5} kết quả nữa`, { size: 11, align: 'center', color: 0xe4def8, outlineW: 1.6 }), 158, 372);
    U.auto = { merges: r.merges, rows: r.rows.map((g) => ({ item: g.item, from: TIERS[g.from].name, to: TIERS[g.to].name, n: g.n })) };
    ui.show('auto', { transition: 'pop' });
  }
  function doAuto() {
    const r = meta.autoMerge(); ui.hide('auto', { transition: 'pop' });
    if (!r.ok) { refuse(cap(r.why)); return; }
    ui.toast(`Đã ghép ${r.merges} lần`); game.vibrate && game.vibrate(25); burst.spawn(180, 450, 26, 0xffc21f, 200);
  }

  // ---------- screen life ----------
  function rebuildAll() {
    if (!S.hero || !meta.acc.heroes[S.hero] || !meta.acc.heroes[S.hero].level) S.hero = heroIds()[0];
    if (S.main && !find(S.main)) { S.main = 0; S.picks = []; }
    S.picks = S.picks.filter((u) => find(u));
    if (S.mode === 'merge' && S.main && TIERS[find(S.main).tier].need === 0) { S.main = 0; S.picks = []; }
    if (builtFor !== S.hero) buildModel();
    buildBottom(); refreshHero(); buildSlots(); buildGrid(); buildMats();
    if (S.mode === 'merge') { buildPreview(); paintMergeButtons(); }
    U.main = S.main; U.picks = S.picks.slice(); layoutMode();
    if (S.sheet) buildSheet();
  }
  return [{
    name: 'equip',
    show(a) {
      if (a && a.hero) S.hero = a.hero;
      if (S.mode === 'merge') { S.mode = 'normal'; S.main = 0; S.picks = []; }
      rebuildAll(); dirty = false; ui.show('equip', { transition: 'none' });
    },
    hide() { ui.hide('equip', { transition: 'none' }); ui.hide('item', { transition: 'none' }); ui.hide('auto', { transition: 'none' }); S.sheet = 0; if (fx) { fx.t = 9; stepFx(0); } },
    update(dt) {
      if (!ui.isShown('equip')) return;
      bd.tick(ui.t); burst.update(dt); shBurst.update(dt);
      if (fx) stepFx(dt);
      if (pulse > 0) { pulse = Math.max(0, pulse - dt); const k = Math.sin((pulse / 0.55) * Math.PI) * 0.06; statP.scale.set(1 + k, 1 + k, 1); statP.pos(8 - 172 * k, 78 - 20 * k, 6); }
      if (dirty && !fx) { dirty = false; rebuildAll(); }
    },
  }];
}
