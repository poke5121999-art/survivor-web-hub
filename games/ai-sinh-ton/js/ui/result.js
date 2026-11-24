// One modal screen with three modes: 'pause' (resume, settings, retry, home), 'result' (win or loss: a reward tab and a
// per-hero statistics tab, with the next steps always in view) and 'settings' (the same switches, opened from the home screen).
import { HERO } from '../data/heroes.js?v=20261124a';
import { ITEM, TIERS } from '../data/equip.js?v=20261124a';
import { fmt, heroColor } from './hud.js?v=20261124a';
import { xpNeed } from '../data/unlocks.js?v=20261124a';
import { ITEM_ICON } from './itemicons.js?v=20261124a';
import { createStatsPanel } from './stats.js?v=20261124a';

const SWITCHES = [['Âm thanh', 'sound', 'set-sound'], ['Rung', 'vibrate', 'set-vibrate'], ['Giảm chớp sáng', 'reduceFlash', 'set-flash'], ['Rung màn hình', 'shake', 'set-shake'], ['Cận cảnh tối thượng', 'ultCam', 'set-ultcam'], ['Tự tung tối thượng', 'autoUlt', 'set-autoult', 'autoult']];
// switches that are on until the player turns them off (absent from an old save means on)
const ON_BY_DEFAULT = new Set(['shake', 'ultCam']);
const FULLSCREEN = ['Toàn màn hình', 'fullscreen', 'set-fullscreen'];
const QUALITY = [['Thấp', 'low'], ['Vừa', 'medium'], ['Cao', 'high']];
const clock = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// result screen columns: facts at the left, tab content in the middle, the next steps stacked at the right
const MX = 226, MW = 378, RX = 624, RW = 128;

export function createResult(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE, W = ui.W;
  const scr = ui.screen('result', { modal: true });
  let mode = '', open = false;

  const dim = new THREE.Mesh(new THREE.PlaneGeometry(1200, 700), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.68, depthWrite: false, toneMapped: false }));
  scr.put(dim, W / 2, 180, 0);

  // ---------- pause and settings: a wide, short panel, switches in two columns ----------
  const pause = ui.group({ w: W, h: 360 }); scr.put(pause, 0, 0, 2);
  pause.put(ui.panel({ w: 640, h: 344, r: 26, color: 0x33286a, depth: 6, bevel: 3, gloss: false }), 70, 8, 0);
  pause.titleText = ui.text('TẠM DỪNG', { size: 24, align: 'center', valign: 'mid' }); pause.put(pause.titleText, W / 2, 32, 14);
  pause.stageText = ui.text('', { size: 12, align: 'center', valign: 'mid', color: 0xd9ccff, outlineW: 1.3 }); pause.put(pause.stageText, W / 2, 60, 14);
  const rows = {}, labels = {};
  const lockMarks = {};
  const fsOn = () => !!(game.fullscreen && game.fullscreen.on);
  const isOn = (key) => (key === 'fullscreen' ? fsOn() : ON_BY_DEFAULT.has(key) ? game.settings[key] !== false : !!game.settings[key]);
  [...SWITCHES, FULLSCREEN].forEach(([label, key, id, need], i) => {
    // two columns of four rows, 44 apart
    const col = i < 4 ? 0 : 1, y = 76 + (i % 4) * 44, lx = col ? 404 : 96, bx = col ? 590 : 282;
    labels[key] = ui.text(label, { size: 15, align: 'left', valign: 'mid' }); pause.put(labels[key], lx, y + (need ? 13 : 18), 14);
    const b = ui.button({ id, w: 92, h: 36, r: 13, color: PAL.green, label: 'BẬT', size: 15, onTap: () => {
      if (need && !meta.unlocked(need)) { ui.toast(meta.lockText(need)); return; }
      if (key === 'fullscreen') { if (game.fullscreen) game.fullscreen.toggle(); } else game.setSetting(key, !isOn(key));
      paint();
    } });
    pause.put(b, bx, y, 14); rows[key] = b;
    if (need) { lockMarks[key] = { need, icon: ui.icon('lock', { size: 28, sway: false }), text: ui.text(meta.lockText(need), { size: 11, align: 'left', valign: 'mid', color: 0xffd860, outlineW: 1.3 }) }; b.put(lockMarks[key].icon, 66, -9, 14); pause.put(lockMarks[key].text, lx, y + 30, 14); }
  });
  pause.put(ui.text('Chất lượng hình', { size: 15, align: 'left', valign: 'mid' }), 96, 271, 14);
  const quals = {};
  QUALITY.forEach(([label, key], i) => {
    const b = ui.button({ id: 'q-' + key, w: 84, h: 36, r: 12, color: PAL.blue, label, size: 14, onTap: () => { game.setSetting('quality', key); paint(); } });
    pause.put(b, 282 + i * 92, 254, 14); quals[key] = b;
  });
  pause.put(ui.text('Áp dụng khi mở\nlại game', { size: 11, align: 'left', lineH: 13, color: 0xb9b3cc, outlineW: 1.2 }), 566, 259, 14);
  pause.resume = ui.button({ id: 'resume', w: 190, h: 48, r: 17, color: PAL.green, icon: 'play', label: 'TIẾP TỤC', size: 18, onTap: () => resume() }); pause.put(pause.resume, 96, 298, 14);
  pause.retry = ui.button({ id: 'retry', w: 130, h: 48, r: 15, color: PAL.orange, label: 'CHƠI LẠI', size: 14, onTap: () => { game.setPaused(false); open = false; game.retry(); } }); pause.put(pause.retry, 300, 298, 14);
  pause.home = ui.button({ id: 'home', w: 130, h: 48, r: 15, color: PAL.blue, label: 'VỀ NHÀ', size: 14, onTap: () => { open = false; game.leaveBattle(); } }); pause.put(pause.home, 440, 298, 14);
  // home settings only: account deletion, far from every other control (the confirmation is its own panel)
  pause.del = ui.button({ id: 'acct-delete', w: 136, h: 40, r: 14, color: PAL.red, label: 'XOÁ TÀI KHOẢN', size: 12, onTap: () => { if (typeof game.openAccountDelete === 'function') game.openAccountDelete(); } }); pause.put(pause.del, 566, 302, 14);

  // a "greyed" button is the off state: the target stays tappable
  const lamp = (b, on, color) => { b.setEnabled(on); if (b.target) b.target.enabled = true; return b; };
  const fsShown = () => mode === 'settings' && !!(game.fullscreen && game.fullscreen.supported);
  function paint() {
    for (const [, key] of SWITCHES) {
      const on = isOn(key), lk = lockMarks[key] && !meta.unlocked(lockMarks[key].need);
      lamp(rows[key], on && !lk); rows[key].setLabel(lk ? 'KHOÁ' : on ? 'BẬT' : 'TẮT');
      if (lockMarks[key]) { lockMarks[key].icon.setVisible(!!lk); lockMarks[key].text.setVisible(!!lk); }
    }
    const fs = fsShown(); rows.fullscreen.setVisible(fs); labels.fullscreen.setVisible(fs);
    if (fs) { lamp(rows.fullscreen, fsOn()); rows.fullscreen.setLabel(fsOn() ? 'BẬT' : 'TẮT'); }
    pause.del.setVisible(mode === 'settings' && typeof game.openAccountDelete === 'function');
    const cur = game.settings.quality || (game.host.quality && game.host.quality.name) || 'medium';
    for (const [, key] of QUALITY) lamp(quals[key], key === cur);
  }

  // ---------- result ----------
  let res = null, xpAnim = null, xpText = '', lvUp = '', gifts = [], tab = '', stats = null, tabBtns = null, leftG = null;
  function buildResult(r) {
    if (res) { res.dispose(); res = null; stats = null; }
    xpAnim = null; xpText = ''; lvUp = ''; gifts = [];
    const g = ui.group({ w: W, h: 360 }); scr.put(g, 0, 0, 2); res = g;
    g.put(ui.panel({ w: 748, h: 336, r: 26, color: 0x33286a, depth: 6, bevel: 3, gloss: false }), 16, 12, 0);
    // left column: the verdict and the stage facts
    const L = leftG = ui.group({ w: 200, h: 340 }); g.put(L, 0, 0, 0);
    const win = r.won, ribbon = ui.panel({ w: 180, h: 54, r: 18, color: win ? 0x2fae4a : 0xc43348, depth: 5, bevel: 3 }); L.put(ribbon, 30, 28, 12);
    L.put(ui.text(win ? 'CHIẾN THẮNG' : 'THẤT BẠI', { size: 21, align: 'center', valign: 'mid', color: win ? 0xffe14a : 0xffd0d0 }), 120, 56, 26);
    if (r.first) { const t = ui.panel({ w: 86, h: 22, r: 11, color: PAL.orange, depth: 3, bevel: 1.6, ow: 2, shadow: false }); t.put(ui.text('LẦN ĐẦU!', { size: 11, align: 'center', valign: 'mid', outlineW: 1.4 }), 43, 12, 2); L.put(t, 77, 88, 30); }
    const st = game.stageInfo ? game.stageInfo(r.stage) : null;
    L.put(ui.text(`Ải ${r.stage}${st ? '  ·  ' + st.name : ''}`, { size: 13, align: 'center', color: 0xfff1cf, maxW: 176, lineH: 15 }), 120, 122, 14);
    const chips = [['cdr', clock(r.seconds)], ['skull', fmt(r.kills)], ['wave', `${win ? 5 : Math.max(1, (game.B && game.B.wave) || 1)}/5`]];
    chips.forEach(([icon, text], i) => {
      const p = ui.panel({ w: 140, h: 32, r: 16, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 });
      p.put(ui.icon(icon, { size: 28, sway: false }), -3, 2, 4); p.put(ui.text(text, { size: 15, align: 'center', valign: 'mid' }), 84, 17, 1); L.put(p, 50, 158 + i * 40, 14);
    });
    // middle column: the reward tab
    const rg = ui.group({ w: W, h: 360 }); g.put(rg, 0, 0, 0);
    const hasBanner = (r.levelAfter || meta.acc.level) > (r.levelBefore || meta.acc.level);
    let y = hasBanner ? 84 : 70;
    const label = (s) => { rg.put(ui.text(s, { size: 12, align: 'left', valign: 'mid', color: 0xffd23f, outlineW: 1.5 }), MX + 4, y + 6, 14); };
    { // account level: the bar fills, a level-up shows its banner, gift heroes come with their name
      const lvB = r.levelBefore || meta.acc.level, lvA = r.levelAfter || meta.acc.level, gain = r.xp || 0;
      const sumTo = (L) => { let t = 0; for (let k = 1; k < L; k++) t += xpNeed(k); return t; };
      const before = Math.max(0, sumTo(lvA) + meta.acc.xp - gain - sumTo(lvB));
      const row = ui.panel({ w: MW, h: 38, r: 14, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); rg.put(row, MX, y, 12);
      const lvT = ui.text('Cấp ' + lvB, { size: 15, valign: 'mid', outlineW: 2 }); row.put(lvT, 12, 19, 3);
      const bar = ui.bar({ w: 196, h: 16, color: PAL.green, value: before / xpNeed(lvB) }); row.put(bar, 80, 11, 2); bar.set(before / xpNeed(lvB), true);
      row.put(ui.text('+' + gain + ' XP', { size: 14, align: 'right', valign: 'mid', color: 0x9af3ff, outlineW: 2 }), MW - 12, 19, 3);
      xpAnim = { bar, lvT, steps: [], t: -0.6, k: 0, lvB, lvA, banner: null, before: before / xpNeed(lvB) };
      if (lvA > lvB) {
        for (let L = lvB; L < lvA; L++) xpAnim.steps.push({ to: 1, level: L + 1 });
        const fin = meta.acc.xp / xpNeed(lvA); xpAnim.steps.push({ to: fin, last: true });
        const bn = ui.panel({ w: 140, h: 24, r: 12, color: PAL.orange, depth: 4, bevel: 2.4, ow: 2.6, shadow: false }); bn.put(ui.text('LÊN CẤP ' + lvA + '!', { size: 14, align: 'center', valign: 'mid', upper: true }), 70, 13, 3);
        rg.put(bn, MX + MW - 140, y - 24, 30); bn.setVisible(false); xpAnim.banner = bn; xpAnim.bannerT = 0;
      } else xpAnim.steps.push({ to: meta.acc.xp / xpNeed(lvA), last: true });
      lvUp = lvA > lvB ? 'LÊN CẤP ' + lvA + '!' : '';
      y += 46;
      xpText = '+' + gain + ' XP';
      for (const gid of r.gifts || []) {
        const gp = ui.panel({ w: MW, h: 48, r: 16, color: 0x7a2fa8, depth: 4, bevel: 2.6, ow: 2.6 }); rg.put(gp, MX, y, 12);
        gp.put(ui.portrait(gid, { size: 38, color: heroColor(gid), fps: 6, shadow: false }), 8, 5, 3);
        gp.put(ui.text('THÚ MỚI: ' + (HERO[gid] ? HERO[gid].name : gid).toLocaleUpperCase('vi'), { size: 17, valign: 'mid', outlineW: 2.6 }), 56, 24, 3);
        gifts.push(HERO[gid] ? HERO[gid].name : gid); y += 54;
      }
      y += 8;
    }
    const heroes = r.heroes || [], n = 2 + heroes.length, size = Math.min(48, Math.floor((MW - (n - 1) * 8) / n)), x0 = MX + (MW - (n * size + (n - 1) * 8)) / 2;
    const reward = (i, node, text, color = 0xffffff) => {
      rg.put(node, x0 + i * (size + 8), y, 14);
      rg.put(ui.text(text, { size: 11, align: 'center', valign: 'mid', color, outlineW: 1.4 }), x0 + i * (size + 8) + size / 2, y + size + 11, 14);
    };
    reward(0, ui.tile({ size, color: 'legend', icon: 'gold' }), '+' + fmt(r.gold), 0xffe14a);
    reward(1, ui.tile({ size, color: 'rare', icon: 'gem' }), '+' + fmt(r.gems), 0x9af3ff);
    heroes.forEach((h, i) => reward(2 + i, ui.portrait(h.id, { size, color: heroColor(h.id), fps: 6 }), '+' + r.teamShards, 0xe2c4ff));
    y += size + 28;
    if ((r.items && r.items.length) || r.mats) {
      label('TRANG BỊ RƠI'); y += 16;
      let x = MX + 4;
      for (const it of r.items || []) { rg.put(ui.tile({ size: 40, color: TIERS[it.tier].color, icon: ITEM_ICON(it.item) }), x, y, 14); x += 46; }
      if (r.mats) { const p = ui.panel({ w: 120, h: 30, r: 15, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); p.put(ui.icon('gear', { size: 26, sway: false }), -2, 2, 4); p.put(ui.text('+' + r.mats + ' bản rèn', { size: 12, align: 'center', valign: 'mid' }), 72, 16, 1); rg.put(p, MX + MW - 120, y + 5, 14); }
      y += 48;
    }
    // tabs and the always-visible next steps
    stats = createStatsPanel(game); g.put(stats.node, 0, 0, 2); stats.build(r);
    stats.onDetail = (on) => { L.setVisible(!on); };
    tabBtns = {
      reward: ui.button({ id: 'tab-reward', w: 184, h: 36, r: 13, color: PAL.orange, label: 'PHẦN THƯỞNG', size: 14, onTap: () => setTab('reward') }),
      stats: ui.button({ id: 'tab-stats', w: 184, h: 36, r: 13, color: PAL.orange, label: 'THỐNG KÊ', size: 14, onTap: () => setTab('stats') }),
    };
    g.put(tabBtns.reward, MX, 18, 14); g.put(tabBtns.stats, MX + MW - 184, 18, 14);
    rewardG = rg;
    setTab(win ? 'reward' : 'stats');
    const mk = (id, text, color, h, onTap, icon) => ui.button({ id, w: RW, h, r: 17, color, label: text, icon, size: h > 50 ? 18 : 14, onTap });
    if (win) {
      g.put(mk('next', 'ẢI TIẾP', PAL.green, 56, () => game.nextStage(), 'play'), RX, 168, 14);
      g.put(mk('retry', 'CHƠI LẠI', PAL.orange, 48, () => game.retry()), RX, 232, 14);
      g.put(mk('home', 'VỀ NHÀ', PAL.blue, 48, () => game.leaveBattle()), RX, 288, 14);
    } else {
      g.put(mk('retry', 'CHƠI LẠI', PAL.orange, 56, () => game.retry()), RX, 224, 14);
      g.put(mk('home', 'VỀ NHÀ', PAL.blue, 48, () => game.leaveBattle()), RX, 288, 14);
    }
  }
  let rewardG = null;
  function setTab(t) {
    tab = t; if (rewardG) rewardG.setVisible(t === 'reward'); if (stats) stats.node.setVisible(t === 'stats');
    if (leftG) leftG.setVisible(true);
    for (const k of ['reward', 'stats']) lamp(tabBtns[k], k === t);
  }

  function resume() {
    if (mode === 'pause') { game.setPaused(false); if (game.B) game.screen = 'hud'; }
    else if (!game.B) { open = false; game.goto('home', {}); return; }
    hide();
  }
  function show(args = {}) {
    mode = args.mode || 'result'; open = true;
    const r = game.lastReward;
    if (mode === 'result' && !r) { open = false; return; }
    pause.setVisible(mode !== 'result'); if (res) res.setVisible(mode === 'result');
    if (mode === 'result') buildResult(r);
    else {
      if (mode === 'pause') game.setPaused(true);
      pause.titleText.set(mode === 'pause' ? 'TẠM DỪNG' : 'CÀI ĐẶT');
      pause.stageText.set(mode === 'pause' && game.B ? `Ải ${game.stageN}  ·  ${game.B.stage.name}` : '');
      pause.resume.setLabel(mode === 'pause' ? 'TIẾP TỤC' : 'ĐÓNG');
      pause.retry.setVisible(mode === 'pause'); pause.home.setVisible(mode === 'pause');
      paint();
    }
    ui.show('result', { transition: 'pop' });
  }
  function hide() { if (!open && !ui.isShown('result')) return; open = false; ui.hide('result', { transition: 'pop' }); }

  // the level bar fills after a beat; across a level it fills, empties and fills again
  function update(dt) {
    const a = xpAnim; if (!a || !open || mode !== 'result') return;
    a.t += dt; if (a.t < 0) return;
    const st = a.steps[a.k]; if (!st) { if (a.banner) { a.bannerT += dt; const e = Math.min(1, a.bannerT / 0.3); a.banner.scale.setScalar(Math.max(0.01, 1 + 0.15 * Math.sin(e * Math.PI) * (1 - e) + (e - 1) * 0)); } return; }
    if (!st.started) { st.started = true; st.t = 0; a.bar.set(st.to); return; }
    st.t += dt;
    if (st.t > 0.7) {
      a.k++;
      if (st.level) { a.lvT.set('Cấp ' + st.level); a.bar.set(0, true); if (a.banner) { a.banner.setVisible(true); a.bannerT = 0; } }
    }
  }
  return [{ name: 'result', show, hide, update, dbg() { return { mode, open, tab, xpText, lvUp, gifts: gifts.slice(), level: xpAnim ? xpAnim.lvA : 0 }; } }];
}
