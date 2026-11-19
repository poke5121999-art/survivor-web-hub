// Tướng tab: the collection grid, the hero page (live model, stats, skills, level-up, team) and the team chooser.
// Both screens read everything from meta.acc and rebuild after each meta command.
import { HEROES, HERO } from '../data/heroes.js?v=20261120b';
import { HERO_RARITY, levelCost, levelMul } from '../data/economy.js?v=20261120b';
import { makeBackdrop, makeBurst, fmt, rarityColor, kill } from './home.js?v=20261120b';

const ROLE = { tank: 'Đỡ đòn', ranged: 'Bắn xa', healer: 'Hồi máu', melee: 'Cận chiến' };
const RANK = { SSR: 0, SR: 1, R: 2 };
const dim = (hex, k) => { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k); };

export function createHeroes(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE, mui = game.metaUi, BZ = window.BZ;
  const grid = ui.screen('heroes'), page = ui.screen('hero'), pick = ui.screen('team-pick', { modal: true });
  const bdG = makeBackdrop(ui, 'heroes'), bdP = makeBackdrop(ui, 'heroes'); grid.put(bdG, 0, 0, -40); page.put(bdP, 0, 0, -40);
  let dirty = true, mode = null, from = null;
  meta.on(() => { dirty = true; });

  // ================= grid =================
  const gTitle = ui.text('TƯỚNG', { size: 26, align: 'center', upper: true, outlineW: 3.4 }); grid.put(gTitle, 180, 56, 6); mui.regTitle('heroes', gTitle);
  const sub = ui.text('', { size: 12, align: 'center', color: 0xe8ffe8 }); grid.put(sub, 180, 92, 6);
  const gBack = ui.button({ id: 'back', w: 48, h: 40, r: 12, color: PAL.blue, icon: 'left', shadow: false, onTap: () => game.goto('home') }); grid.put(gBack, 8, 54, 6);
  const sc = ui.scroll({ w: 340, h: 580 }); grid.put(sc, 10, 108, 4);
  let cells = [];
  function cell(h, i) {
    const own = meta.acc.heroes[h.id] && meta.acc.heroes[h.id].level > 0, st = meta.acc.heroes[h.id] || { level: 0, shards: 0 };
    const c = ui.group({ w: 106, h: 134 }); sc.put(c, (i % 3) * 112, Math.floor(i / 3) * 142 + 4);
    const inTeam = meta.acc.team.includes(h.id), col = rarityColor(h.id);
    const p = ui.portrait(h.id, { size: 92, color: own ? col : dim(col, 0.5), id: 'hero-' + h.id, onTap: () => onCell(h.id), fps: 10 }); c.put(p, 7, 0);
    const need = own ? levelCost(st.level).shards : HERO_RARITY[h.rarity].craft;
    if (own) {
      p.put(ui.text('Lv.' + st.level, { size: 12, outlineW: 2 }), 8, 6, 14);
      if (meta.canLevelUp(h.id).ok) p.put(ui.icon('up', { size: 28 }), 62, 2, 16);
      const rp = ui.panel({ w: 46, h: 15, r: 7, color: 0x20153a, depth: 2, bevel: 1, ow: 1.6, shadow: false }); p.put(rp, 6, 70, 12); rp.put(ui.text(ROLE[h.role] || h.role, { size: 8.5, align: 'center', valign: 'mid', outlineW: 1 }), 23, 8);
      if (inTeam) { const tp = ui.panel({ w: 34, h: 15, r: 7, color: PAL.green, depth: 2, bevel: 1, ow: 1.6, shadow: false }); p.put(tp, 54, 70, 12); tp.put(ui.text('ĐỘI', { size: 9, align: 'center', valign: 'mid', outlineW: 1 }), 17, 8); }
    } else {
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(76, 76), new THREE.MeshBasicMaterial({ color: 0x120a24, transparent: true, opacity: 0.58, depthWrite: false })); p.put(shade, 46, 46, 11);
      p.put(ui.icon('lock', { size: 34 }), 29, 24, 14);
    }
    const nm = ui.text(h.name, { size: 11, align: 'center', color: own ? 0xffffff : 0xcfd0e0 }); c.put(nm, 53, 95);
    const bar = ui.bar({ w: 92, h: 13, color: own ? PAL.green : PAL.purple, r: 6.5, value: Math.min(1, st.shards / need) }); c.put(bar, 7, 113);
    bar.put(ui.text(st.shards + '/' + need, { size: 9, align: 'center', valign: 'mid', outlineW: 1.4 }), 46, 6.8, 2);
    return c;
  }
  function buildGrid() {
    for (const c of cells) kill(c); cells = [];
    const owned = (h) => (meta.acc.heroes[h.id] && meta.acc.heroes[h.id].level > 0 ? 0 : 1);
    const list = HEROES.slice().sort((a, b) => owned(a) - owned(b) || RANK[a.rarity] - RANK[b.rarity]);
    list.forEach((h, i) => cells.push(cell(h, i))); mui.gridCount = cells.length;
    sc.setContentH(Math.ceil(list.length / 3) * 142 + 12);
    const n = HEROES.filter((h) => !owned(h)).length;
    sub.set(mode === 'team' ? `Chạm một tướng để xếp vào ô ${from.slot + 1} của đội` : `Đã có ${n}/${HEROES.length} tướng`);
    gBack.setVisible(mode === 'team');
  }
  function onCell(id) {
    const own = meta.acc.heroes[id] && meta.acc.heroes[id].level > 0;
    if (mode === 'team') {
      if (!own) { ui.toast('Chưa có tướng này'); return; }
      const t = meta.acc.team.slice(), s = from.slot, j = t.indexOf(id);
      if (j >= 0 && j !== s) { if (s < t.length) { t[j] = t[s]; t[s] = id; } else { t.splice(j, 1); t.push(id); } }
      else if (j < 0) { if (s < t.length) t[s] = id; else t.push(id); }
      const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); else game.goto('home');
      return;
    }
    game.goto('hero', { id });
  }

  // ================= hero page =================
  let id = null, vpNode = null, rotY = 0.4, dragging = false, modelM = null;
  const disp = { atk: 0, hp: 0, pow: 0, lv: 0 };
  const pBack = ui.button({ id: 'back', w: 48, h: 40, r: 12, color: PAL.blue, icon: 'left', shadow: false, onTap: () => game.goto('heroes') }); page.put(pBack, 8, 54, 6);
  const nameT = ui.text('', { size: 24, align: 'center', upper: true, outlineW: 3 }); page.put(nameT, 190, 52, 6); mui.regTitle('hero', nameT);
  const subT = ui.text('', { size: 12, align: 'center' }); page.put(subT, 190, 86, 6);
  const frame = ui.panel({ w: 330, h: 238, r: 22, color: 0x5a3fa0, depth: 5, bevel: 3 }); page.put(frame, 15, 110, 6);
  const lvT = ui.text('', { size: 15, outlineW: 2.4 }), powT = ui.text('', { size: 13, align: 'right', color: 0xffe9a8, outlineW: 2.2 });
  const statP = ui.panel({ w: 330, h: 62, r: 16, color: 0x3a2d78, depth: 4, bevel: 3 }); page.put(statP, 15, 354, 6);
  const stat = (x, icon, label) => { statP.put(ui.icon(icon, { size: 34 }), x, 12, 4); statP.put(ui.text(label, { size: 10, color: 0xffd9a0 }), x + 38, 6); return { v: ui.text('', { size: 17 }), n: ui.text('', { size: 12, color: 0x7dff8a }), x }; };
  const sA = stat(10, 'atk', 'CÔNG'), sH = stat(172, 'heart', 'MÁU');
  for (const s of [sA, sH]) { statP.put(s.v, s.x + 38, 18); statP.put(s.n, s.x + 38 + 52, 23); }
  const skillRows = [];
  for (let i = 0; i < 3; i++) {
    const r = ui.panel({ w: 330, h: 54, r: 14, color: 0x3a2d78, depth: 3, bevel: 2.4, shadow: false }); page.put(r, 15, 422 + i * 58, 6);
    r.put(ui.icon(['s1', 's2', 'ult'][i], { size: 36 }), 8, 9, 4);
    const n = ui.text('', { size: 12.5, color: i === 2 ? 0xffd860 : 0xffffff }), d = ui.text('', { size: 10, maxW: 262, color: 0xe4def8, lineH: 12 }); r.put(n, 52, 5); r.put(d, 52, 22);
    skillRows.push({ n, d });
  }
  const shBar = ui.bar({ w: 330, h: 20, color: PAL.purple, r: 10, ghost: true, value: 0 }); page.put(shBar, 15, 598, 6);
  const shT = ui.text('', { size: 11, align: 'center', valign: 'mid', outlineW: 1.6 }); shBar.put(shT, 165, 10.4, 2);
  const lvBtn = ui.button({ id: 'levelup', w: 206, h: 62, r: 16, color: PAL.green, label: 'LÊN CẤP', sub: ' ', size: 22, onTap: doLevel }); page.put(lvBtn, 15, 634, 6);
  const lvLock = ui.icon('lock', { size: 30, sway: false }); lvBtn.put(lvLock, 172, -8, 14); lvLock.setVisible(false);
  const tgBtn = ui.button({ id: 'team-toggle', w: 116, h: 62, r: 16, color: PAL.blue, label: 'VÀO ĐỘI', size: 17, onTap: doTeam }); page.put(tgBtn, 229, 634, 6);
  const burst = makeBurst(ui); page.put(burst.node, 0, 0, 60);

  function buildModel() {
    if (vpNode) { kill(vpNode); vpNode = null; }
    const bz = BZ && BZ.HEROES && BZ.HEROES.find((h) => h.id === id); const root = new THREE.Group(); modelM = null;
    if (bz && BZ.heroModel) {
      try { const m = BZ.heroModel(id); try { BZ.equipWeapon(m, bz.weapon); } catch (e) { /* weapon is decoration here */ } root.add(m.root); modelM = m; } catch (e) { console.warn('[heroes] model failed: ' + e.message); }
    }
    if (!modelM) root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.6), new THREE.MeshStandardMaterial({ color: rarityColor(id) })));
    const st = { speed: 0, air: 0, vy: 0, swing: -1, mode: 'none', draw: 1, pitch: 0, kick: 0, kickL: 0, sprint: false, crouch: 0, hurt: 0 };
    const col = rarityColor(id);
    vpNode = ui.viewport(root, { w: 318, h: 226, r: 17, bg: dim(col, 0.32), fps: 24, fov: 26, update: (dt) => { if (modelM) { if (!dragging) rotY += dt * 0.35; modelM.root.rotation.y = rotY; BZ.animHero(modelM, st, dt); } } });
    frame.put(vpNode, 6, 6, 1); frame.setColor(col);
    frame.put(lvT, 16, 14, 12); frame.put(powT, 312, 16, 12);
  }
  function refreshPage(instant) {
    const h = HERO[id], acc = meta.acc, st = acc.heroes[id] || { level: 0, shards: 0 }, own = st.level > 0;
    nameT.set(h.name); subT.set(`${h.title} · ${HERO_RARITY[h.rarity].name} · ${ROLE[h.role]}`); subT.setColor(rarityColor(id));
    const L = Math.max(1, st.level), mulN = levelMul(L + 1);
    const s = meta.heroStats(id) || { atk: Math.round(h.atk), hp: Math.round(h.hp) };
    disp.tA = s.atk; disp.tH = s.hp; disp.tP = meta.power(id) || Math.round(h.atk * 4 + h.hp / 2); disp.tL = st.level;
    if (instant) { disp.atk = disp.tA; disp.hp = disp.tH; disp.pow = disp.tP; disp.lv = disp.tL; }
    const nA = Math.round(h.atk * mulN) - Math.round(h.atk * levelMul(L)), nH = Math.round(h.hp * mulN) - Math.round(h.hp * levelMul(L));
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
    burst.spawn(180, 230, 30, 0xffd21f, 220); ui.fly('LÊN CẤP ' + r.level + '!', 180, 150); game.vibrate && game.vibrate(25);
  }
  function doTeam() {
    const t = meta.acc.team.slice(), j = t.indexOf(id);
    if (j >= 0) { if (t.length > 1) { t.splice(j, 1); const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); } return; }
    if (t.length < meta.slots()) { t.push(id); const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); return; }
    openPick();
  }

  // ---- team chooser: which of the four to replace ----
  const pp = ui.panel({ w: 320, h: 214, r: 22, color: 0x4a3a86, depth: 6, bevel: 3 }); pick.put(pp, 20, 250, 6);
  const ppT = ui.text('THAY CHO AI?', { size: 20, align: 'center', upper: true }); pp.put(ppT, 160, 12); mui.regTitle('team-pick', ppT);
  let pickNodes = [];
  const pCancel = ui.button({ id: 'replace-cancel', w: 150, h: 44, r: 14, color: PAL.red, label: 'HUỶ', size: 18, onTap: () => ui.hide('team-pick', { transition: 'pop' }) }); pp.put(pCancel, 85, 154);
  function openPick() {
    for (const n of pickNodes) kill(n); pickNodes = [];
    meta.acc.team.forEach((tid, i) => {
      const p = ui.portrait(tid, { size: 66, color: rarityColor(tid), id: 'replace-' + i, onTap: () => { const t = meta.acc.team.slice(); t[i] = id; ui.hide('team-pick', { transition: 'pop' }); const r = meta.setTeam(t); if (!r.ok) ui.toast(r.why); } });
      pp.put(p, 16 + i * 76, 52); pickNodes.push(p);
    });
    ui.show('team-pick', { transition: 'pop' });
  }

  // drag to turn the model: pointer events on the frame, only inside the model's viewport
  const fr = document.getElementById('frame'); let dx0 = 0;
  const inVp = (e) => { const r = fr.getBoundingClientRect(), k = r.width / 360, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k; return x > 21 && x < 339 && y > 116 && y < 342; };
  fr.addEventListener('pointerdown', (e) => { if (ui.isShown('hero') && !ui.isShown('team-pick') && inVp(e)) { dragging = true; dx0 = e.clientX; } });
  fr.addEventListener('pointermove', (e) => { if (dragging) { rotY += (e.clientX - dx0) * 0.012; dx0 = e.clientX; } });
  const endDrag = () => { dragging = false; };
  fr.addEventListener('pointerup', endDrag); fr.addEventListener('pointercancel', endDrag);

  const gridApi = {
    name: 'heroes',
    show(a) { const nm = a && a.mode === 'team' ? 'team' : null; if (nm !== mode || dirty || nm) { mode = nm; from = nm ? a : null; buildGrid(); dirty = false; } ui.show('heroes', { transition: 'none' }); },
    hide() { ui.hide('heroes', { transition: 'none' }); },
    update() { if (ui.isShown('heroes')) { bdG.tick(ui.t); if (dirty) { dirty = false; buildGrid(); } } },
  };
  const pageApi = {
    name: 'hero',
    show(a) { if (a && a.id) { id = a.id; rotY = 0.4; buildModel(); } mode = null; refreshPage(true); dirty = false; ui.show('hero', { transition: 'none' }); },
    hide() { ui.hide('hero', { transition: 'none' }); ui.hide('team-pick', { transition: 'none' }); },
    update(dt) {
      if (!ui.isShown('hero')) return;
      bdP.tick(ui.t); burst.update(dt);
      if (dirty) { dirty = false; refreshPage(false); }
      const k = 1 - Math.exp(-dt * 9);
      for (const key of ['atk', 'hp', 'pow', 'lv']) { const t = disp['t' + { atk: 'A', hp: 'H', pow: 'P', lv: 'L' }[key]]; disp[key] += (t - disp[key]) * k; if (Math.abs(t - disp[key]) < 0.5) disp[key] = t; }
      sA.v.set(fmt(disp.atk)); sH.v.set(fmt(disp.hp)); powT.set('Sức mạnh ' + fmt(disp.pow)); lvT.set('Lv.' + Math.round(disp.lv));
    },
  };
  return [gridApi, pageApi];
}
