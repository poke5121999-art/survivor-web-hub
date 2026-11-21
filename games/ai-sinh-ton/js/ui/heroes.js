// Tướng tab, landscape: one screen with the collection grid at the left, the selected hero's live model in the middle and
// the stats, skills and LÊN CẤP at the right (selecting a tile updates the right side), plus the team chooser modal.
// Everything is read from meta.acc and rebuilt after each meta command.
import { HEROES, HERO } from '../data/heroes.js?v=20261120f';
import { HERO_RARITY, levelCost, levelMul } from '../data/economy.js?v=20261120f';
import { makeBackdrop, makeBurst, fmt, rarityColor, kill } from './home.js?v=20261120f';

const ROLE = { tank: 'Đỡ đòn', ranged: 'Bắn xa', healer: 'Hồi máu', melee: 'Cận chiến' };
const RANK = { SSR: 0, SR: 1, R: 2 };
const dim = (hex, k) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k); };

export function createHeroes(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE, mui = game.metaUi, BZ = window.BZ;
  const scr = ui.screen('heroes'), pick = ui.screen('team-pick', { modal: true });
  const bd = makeBackdrop(ui, 'heroes'); scr.put(bd, 0, 0, -40);
  const L = { gx: 106, gy: 52, gw: 228, gh: 296, mx: 342, mw: 160, rx: 510, rw: 242, top: 48 };
  let dirty = true, mode = null, from = null, id = null;
  meta.on(() => { dirty = true; });
  mui.heroSel = () => id;
  const owned = (hid) => !!(meta.acc.heroes[hid] && meta.acc.heroes[hid].level > 0);

  // ================= header and grid =================
  const gBack = ui.button({ id: 'back', w: 48, h: 40, r: 12, color: PAL.blue, icon: 'left', shadow: false, onTap: () => game.goto('home') }); scr.put(gBack, L.gx, 6, 6);
  const gTitle = ui.text('TƯỚNG', { size: 20, upper: true, outlineW: 3 }); scr.put(gTitle, L.gx + 56, 5, 6); mui.regTitle('heroes', gTitle);
  const sub = ui.text('', { size: 11, color: 0xe8ffe8, maxW: 290, lineH: 12 }); scr.put(sub, L.gx + 56, 29, 6);
  const sc = ui.scroll({ w: L.gw, h: L.gh }); scr.put(sc, L.gx, L.gy, 4);
  let cells = [];
  function cell(h, i) {
    const own = owned(h.id), st = meta.acc.heroes[h.id] || { level: 0, shards: 0 };
    const c = ui.group({ w: 72, h: 94 }); sc.put(c, (i % 3) * 78, Math.floor(i / 3) * 98 + 3);
    const inTeam = meta.acc.team.includes(h.id), col = rarityColor(h.id);
    if (h.id === id && mode !== 'team') c.put(ui.panel({ w: 72, h: 92, r: 16, color: PAL.gold, depth: 1, bevel: 1, ow: 2, shadow: false }), 0, -2, -1);
    const p = ui.portrait(h.id, { size: 60, color: own ? col : dim(col, 0.5), id: 'hero-' + h.id, onTap: () => onCell(h.id), fps: 10 }); c.put(p, 6, 2);
    const need = own ? levelCost(st.level).shards : HERO_RARITY[h.rarity].craft;
    if (own) {
      p.put(ui.text('Lv.' + st.level, { size: 11, outlineW: 2 }), 5, 4, 14);
      if (meta.canLevelUp(h.id).ok) p.put(ui.icon('up', { size: 22 }), 38, 0, 16);
      if (inTeam) { const tp = ui.panel({ w: 32, h: 15, r: 7, color: PAL.green, depth: 2, bevel: 1, ow: 1.6, shadow: false }); p.put(tp, 3, 43, 12); tp.put(ui.text('ĐỘI', { size: 11, align: 'center', valign: 'mid', outlineW: 1 }), 16, 8); }
    } else {
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.58, depthWrite: false })); p.put(shade, 30, 30, 11);
      p.put(ui.icon('lock', { size: 24 }), 18, 14, 14);
    }
    c.put(ui.text(h.name, { size: 11, align: 'center', color: own ? 0xffffff : 0xcfd0e0 }), 36, 65);
    const bar = ui.bar({ w: 66, h: 14, color: own ? PAL.green : PAL.purple, r: 7, value: Math.min(1, st.shards / need) }); c.put(bar, 3, 79);
    bar.put(ui.text(st.shards + '/' + need, { size: 11, align: 'center', valign: 'mid', outlineW: 1.4 }), 33, 7.4, 2);
    return c;
  }
  function buildGrid() {
    const keep = sc.getScroll();
    for (const c of cells) kill(c); cells = [];
    const rank = (h) => (owned(h.id) ? 0 : 1);
    const list = HEROES.slice().sort((a, b) => rank(a) - rank(b) || RANK[a.rarity] - RANK[b.rarity]);
    list.forEach((h, i) => cells.push(cell(h, i))); mui.gridCount = cells.length;
    sc.setContentH(Math.ceil(list.length / 3) * 98 + 8); sc.scrollTo(keep);
    const n = HEROES.filter((h) => !owned(h.id)).length;
    sub.set(mode === 'team' ? `Chạm một tướng để xếp vào ô ${from.slot + 1} của đội` : `Đã có ${HEROES.length - n}/${HEROES.length} tướng`);
  }
  function onCell(hid) {
    if (mode === 'team') {
      if (!owned(hid)) { ui.toast('Chưa có tướng này'); return; }
      const t = meta.acc.team.slice(), s = from.slot, j = t.indexOf(hid);
      if (j >= 0 && j !== s) { if (s < t.length) { t[j] = t[s]; t[s] = hid; } else { t.splice(j, 1); t.push(hid); } }
      else if (j < 0) { if (s < t.length) t[s] = hid; else t.push(hid); }
      const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); else game.goto('home');
      return;
    }
    if (hid !== id) { select(hid); buildGrid(); }
  }

  // ================= selected hero: model, stats, skills, level-up =================
  let vpNode = null, rotY = 0.4, dragging = false, modelM = null;
  const disp = { atk: 0, hp: 0, pow: 0, lv: 0 };
  const nameT = ui.text('', { size: 20, upper: true, outlineW: 3, maxW: L.rw }); scr.put(nameT, L.rx, L.top - 1, 6); mui.regTitle('hero', nameT);
  const subT = ui.text('', { size: 11.5, maxW: L.rw }); scr.put(subT, L.rx, L.top + 24, 6);
  const frame = ui.panel({ w: L.mw, h: 246, r: 20, color: 0x5a3fa0, depth: 5, bevel: 3 }); scr.put(frame, L.mx, L.top, 6);
  const lvT = ui.text('', { size: 15, outlineW: 2.4 }), powT = ui.text('', { size: 12, color: 0xffe9a8, outlineW: 2.2 });
  const statP = ui.panel({ w: L.rw, h: 48, r: 14, color: 0x3a2d78, depth: 4, bevel: 3 }); scr.put(statP, L.rx, 90, 6);
  const stat = (y, icon, label) => { statP.put(ui.icon(icon, { size: 24 }), 8, y - 1, 4); statP.put(ui.text(label, { size: 11, color: 0xffd9a0 }), 38, y + 4); return { v: ui.text('', { size: 15 }), n: ui.text('', { size: 12, color: 0x7dff8a }), y }; };
  const sA = stat(2, 'atk', 'CÔNG'), sH = stat(25, 'heart', 'MÁU');
  for (const s of [sA, sH]) { statP.put(s.v, 82, s.y + 2); statP.put(s.n, 150, s.y + 4); }
  const skillRows = [];
  for (let i = 0; i < 3; i++) {
    const r = ui.panel({ w: L.rw, h: 42, r: 12, color: 0x3a2d78, depth: 3, bevel: 2.4, shadow: false }); scr.put(r, L.rx, 142 + i * 45, 6);
    r.put(ui.icon(['s1', 's2', 'ult'][i], { size: 30 }), 5, 6, 4);
    const n = ui.text('', { size: 12, color: i === 2 ? 0xffd860 : 0xffffff }), d = ui.text('', { size: 11, maxW: 196, color: 0xe4def8, lineH: 12 }); r.put(n, 40, 3); r.put(d, 40, 17);
    skillRows.push({ n, d });
  }
  const shBar = ui.bar({ w: L.rw, h: 16, color: PAL.purple, r: 8, ghost: true, value: 0 }); scr.put(shBar, L.rx, 280, 6);
  const shT = ui.text('', { size: 11, align: 'center', valign: 'mid', outlineW: 1.6 }); shBar.put(shT, L.rw / 2, 8.4, 2);
  const lvBtn = ui.button({ id: 'levelup', w: L.rw, h: 48, r: 16, color: PAL.green, label: 'LÊN CẤP', sub: ' ', size: 18, onTap: doLevel }); scr.put(lvBtn, L.rx, 300, 6);
  const lvLock = ui.icon('lock', { size: 28, sway: false }); lvBtn.put(lvLock, L.rw - 30, -10, 14); lvLock.setVisible(false);
  const tgBtn = ui.button({ id: 'team-toggle', w: L.mw, h: 48, r: 16, color: PAL.blue, label: 'VÀO ĐỘI', size: 16, onTap: doTeam }); scr.put(tgBtn, L.mx, 300, 6);
  const burst = makeBurst(ui); scr.put(burst.node, 0, 0, 60);

  function buildModel() {
    if (vpNode) { kill(vpNode); vpNode = null; }
    const bz = BZ && BZ.HEROES && BZ.HEROES.find((h) => h.id === id); const root = new THREE.Group(); modelM = null;
    if (bz && BZ.heroModel) {
      try { const m = BZ.heroModel(id); try { BZ.equipWeapon(m, bz.weapon); } catch (e) { /* weapon is decoration here */ } root.add(m.root); modelM = m; } catch (e) { console.warn('[heroes] model failed: ' + e.message); }
    }
    if (!modelM) root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.6), new THREE.MeshStandardMaterial({ color: rarityColor(id) })));
    const st = { speed: 0, air: 0, vy: 0, swing: -1, mode: 'none', draw: 1, pitch: 0, kick: 0, kickL: 0, sprint: false, crouch: 0, hurt: 0 };
    const col = rarityColor(id);
    vpNode = ui.viewport(root, { w: L.mw - 12, h: 234, r: 15, bg: dim(col, 0.32), fps: 24, fov: 26, update: (dt) => { if (modelM) { if (!dragging) rotY += dt * 0.35; modelM.root.rotation.y = rotY; BZ.animHero(modelM, st, dt); } } });
    frame.put(vpNode, 6, 6, 1); frame.setColor(col);
    frame.put(lvT, 14, 12, 12); frame.put(powT, 14, 32, 12);
  }
  function select(hid) { id = hid; rotY = 0.4; buildModel(); refreshPage(true); }
  function refreshPage(instant) {
    const h = HERO[id], acc = meta.acc, st = acc.heroes[id] || { level: 0, shards: 0 }, own = st.level > 0;
    nameT.set(h.name); subT.set(`${h.title} · ${HERO_RARITY[h.rarity].name} · ${ROLE[h.role]}`); subT.setColor(rarityColor(id));
    const Lv = Math.max(1, st.level), mulN = levelMul(Lv + 1);
    const s = meta.heroStats(id) || { atk: Math.round(h.atk), hp: Math.round(h.hp) };
    disp.tA = s.atk; disp.tH = s.hp; disp.tP = meta.power(id) || Math.round(h.atk * 4 + h.hp / 2); disp.tL = st.level;
    if (instant) { disp.atk = disp.tA; disp.hp = disp.tH; disp.pow = disp.tP; disp.lv = disp.tL; }
    const nA = Math.round(h.atk * mulN) - Math.round(h.atk * levelMul(Lv)), nH = Math.round(h.hp * mulN) - Math.round(h.hp * levelMul(Lv));
    sA.n.set(own ? '» ' + fmt(s.atk + nA) : ''); sH.n.set(own ? '» ' + fmt(s.hp + nH) : '');
    [h.s1, h.s2, h.ult].forEach((k, i) => { skillRows[i].n.set((i === 2 ? 'Tối thượng' : 'Kỹ năng ' + (i + 1)) + ' · ' + k.name); skillRows[i].d.set(k.desc); });
    const cost = own ? levelCost(st.level) : null, need = own ? cost.shards : HERO_RARITY[h.rarity].craft;
    shBar.set(Math.min(1, st.shards / need)); shT.set(own ? `Mảnh ${fmt(st.shards)}/${fmt(need)}   ·   Vàng ${fmt(acc.gold)}` : `Mảnh ghép tướng ${st.shards}/${need}`);
    const c = meta.canLevelUp(id); let line;
    if (!own) line = `Còn thiếu ${need - st.shards} mảnh`; else if (c.ok) line = `${fmt(cost.shards)} mảnh · ${fmt(cost.gold)} vàng`;
    else line = c.why === 'thiếu mảnh' ? `Thiếu ${cost.shards - st.shards} mảnh` : `Thiếu ${fmt(cost.gold - acc.gold)} vàng`;
    lvBtn.setEnabled(c.ok); lvBtn.setLabel(own ? 'LÊN CẤP' : 'CHƯA CÓ'); lvBtn.setSub(line); mui.levelupText = line;
    const lk = !meta.unlocked('levelup'); lvLock.setVisible(lk);
    if (lk) { lvBtn.setEnabled(false); lvBtn.target.enabled = true; lvBtn.setSub(meta.lockText('levelup')); mui.levelupText = meta.lockText('levelup'); }
    const inTeam = acc.team.includes(id);
    tgBtn.setLabel(inTeam ? 'RỜI ĐỘI' : 'VÀO ĐỘI'); tgBtn.setEnabled(own && !(inTeam && acc.team.length <= 1));
  }
  function doLevel() {
    if (!meta.unlocked('levelup')) { ui.toast(meta.lockText('levelup')); return; }
    const r = meta.levelUp(id);
    if (!r.ok) { ui.toast(r.why); return; }
    burst.spawn(L.mx + L.mw / 2, 170, 30, 0xffd21f, 220); ui.fly('LÊN CẤP ' + r.level + '!', L.rx + L.rw / 2, 200); game.vibrate && game.vibrate(25);
  }
  function doTeam() {
    const t = meta.acc.team.slice(), j = t.indexOf(id);
    if (j >= 0) { if (t.length > 1) { t.splice(j, 1); const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); } return; }
    if (t.length < meta.slots()) { t.push(id); const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); return; }
    openPick();
  }

  // ---- team chooser: which of the four to replace (wide and short) ----
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(780, 440), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.6, depthWrite: false })); pick.put(m, 390, 180, -10); }
  const pp = ui.panel({ w: 470, h: 168, r: 22, color: 0x4a3a86, depth: 6, bevel: 3 }); pick.put(pp, 155, 96, 6);
  const ppT = ui.text('THAY CHO AI?', { size: 20, align: 'center', upper: true }); pp.put(ppT, 235, 12); mui.regTitle('team-pick', ppT);
  let pickNodes = [];
  const pCancel = ui.button({ id: 'replace-cancel', w: 76, h: 48, r: 14, color: PAL.red, label: 'HUỶ', size: 16, onTap: () => ui.hide('team-pick', { transition: 'pop' }) }); pp.put(pCancel, 384, 66);
  function openPick() {
    for (const n of pickNodes) kill(n); pickNodes = [];
    meta.acc.team.forEach((tid, i) => {
      const p = ui.portrait(tid, { size: 72, color: rarityColor(tid), id: 'replace-' + i, onTap: () => { const t = meta.acc.team.slice(); t[i] = id; ui.hide('team-pick', { transition: 'pop' }); const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); } });
      pp.put(p, 16 + i * 90, 56); pickNodes.push(p);
    });
    ui.show('team-pick', { transition: 'pop' });
  }

  // drag to turn the model: pointer events on the frame, only inside the model's viewport
  const fr = document.getElementById('frame'); let dx0 = 0;
  const inVp = (e) => { const r = fr.getBoundingClientRect(), k = r.width / 780, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k; return x > L.mx + 6 && x < L.mx + L.mw - 6 && y > L.top + 6 && y < L.top + 240; };
  fr.addEventListener('pointerdown', (e) => { if (ui.isShown('heroes') && !ui.isShown('team-pick') && inVp(e)) { dragging = true; dx0 = e.clientX; } });
  fr.addEventListener('pointermove', (e) => { if (dragging) { rotY += (e.clientX - dx0) * 0.012; dx0 = e.clientX; } });
  const endDrag = () => { dragging = false; };
  fr.addEventListener('pointerup', endDrag); fr.addEventListener('pointercancel', endDrag);

  const firstOwned = () => { const t = meta.acc.team.find(owned); return t || (HEROES.find((h) => owned(h.id)) || HEROES[0]).id; };
  return [{
    name: 'heroes',
    show(a) {
      mode = a && a.mode === 'team' ? 'team' : null; from = mode ? a : null;
      const want = a && a.id ? a.id : id && HERO[id] ? id : firstOwned();
      if (want !== id || !vpNode) select(want); else refreshPage(true);
      buildGrid(); dirty = false; ui.show('heroes', { transition: 'none' });
    },
    hide() { ui.hide('heroes', { transition: 'none' }); ui.hide('team-pick', { transition: 'none' }); },
    update(dt) {
      if (!ui.isShown('heroes')) return;
      bd.tick(ui.t); burst.update(dt);
      if (dirty) { dirty = false; buildGrid(); refreshPage(false); }
      const k = 1 - Math.exp(-dt * 9);
      for (const key of ['atk', 'hp', 'pow', 'lv']) { const t = disp['t' + { atk: 'A', hp: 'H', pow: 'P', lv: 'L' }[key]]; disp[key] += (t - disp[key]) * k; if (Math.abs(t - disp[key]) < 0.5) disp[key] = t; }
      sA.v.set(fmt(disp.atk)); sH.v.set(fmt(disp.hp)); powT.set('Sức mạnh ' + fmt(disp.pow)); lvT.set('Lv.' + Math.round(disp.lv));
    },
  }];
}
