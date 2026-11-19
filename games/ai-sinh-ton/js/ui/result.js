// One modal screen with three modes: 'pause' (resume, settings, retry, home), 'result' (win or loss: a reward tab and a
// per-hero statistics tab, with the next steps always in view) and 'settings' (the same switches, opened from the home screen).
import { HERO } from '../data/heroes.js?v=20261120a';
import { ITEM, TIERS } from '../data/equip.js?v=20261120a';
import { fmt, heroColor, kill } from './hud.js?v=20261120a';
import { xpNeed } from '../data/unlocks.js?v=20261120a';
import { ITEM_ICON } from './itemicons.js?v=20261120a';
import { createStatsPanel } from './stats.js?v=20261120a';

const SWITCHES = [['Âm thanh', 'sound', 'set-sound'], ['Rung', 'vibrate', 'set-vibrate'], ['Giảm chớp sáng', 'reduceFlash', 'set-flash'], ['Rung màn hình', 'shake', 'set-shake'], ['Tự tung tối thượng', 'autoUlt', 'set-autoult', 'autoult']];
const QUALITY = [['Thấp', 'low'], ['Vừa', 'medium'], ['Cao', 'high']];
const clock = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export function createResult(game) {
  const ui = game.ui, meta = game.meta, PAL = ui.PAL, THREE = ui.THREE;
  const scr = ui.screen('result', { modal: true });
  let mode = '', open = false;

  const dim = new THREE.Mesh(new THREE.PlaneGeometry(420, 900), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.68, depthWrite: false, toneMapped: false }));
  scr.put(dim, 180, 390, 0);

  // ---------- pause and settings ----------
  const pause = ui.group({ w: 360, h: 780 }); scr.put(pause, 0, 0, 2);
  pause.put(ui.panel({ w: 308, h: 604, r: 26, color: 0x33286a, depth: 6, bevel: 3 }), 26, 132, 0);
  pause.titleText = ui.text('TẠM DỪNG', { size: 31, align: 'center', valign: 'mid' }); pause.put(pause.titleText, 180, 176, 14);
  pause.stageText = ui.text('', { size: 12, align: 'center', valign: 'mid', color: 0xd9ccff, outlineW: 1.3 }); pause.put(pause.stageText, 180, 206, 14);
  pause.resume = ui.button({ id: 'resume', w: 244, h: 56, r: 18, color: PAL.green, icon: 'play', label: 'TIẾP TỤC', size: 21, onTap: () => resume() }); pause.put(pause.resume, 58, 226, 14);
  const rows = {};
  const lockMarks = {};
  // the screen-shake switch is on until the player turns it off
  const isOn = (key) => (key === 'shake' ? game.settings.shake !== false : !!game.settings[key]);
  SWITCHES.forEach(([label, key, id, need], i) => {
    const y = 306 + i * 48;
    pause.put(ui.text(label, { size: 15, align: 'left', valign: 'mid' }), 50, y + (need ? 15 : 19), 14);
    const b = ui.button({ id, w: 92, h: 38, r: 13, color: PAL.green, label: 'BẬT', size: 15, onTap: () => { if (need && !meta.unlocked(need)) { ui.toast(meta.lockText(need)); return; } game.setSetting(key, !isOn(key)); paint(); } });
    pause.put(b, 222, y, 14); rows[key] = b;
    if (need) { lockMarks[key] = { need, icon: ui.icon('lock', { size: 28, sway: false }), text: ui.text(meta.lockText(need), { size: 10, align: 'left', valign: 'mid', color: 0xffd860, outlineW: 1.3 }) }; b.put(lockMarks[key].icon, 66, -9, 14); pause.put(lockMarks[key].text, 50, y + 31, 14); }
  });
  pause.put(ui.text('Chất lượng hình', { size: 15, align: 'left', valign: 'mid' }), 50, 562, 14);
  const quals = {};
  QUALITY.forEach(([label, key], i) => {
    const b = ui.button({ id: 'q-' + key, w: 84, h: 36, r: 12, color: PAL.blue, label, size: 14, onTap: () => { game.setSetting('quality', key); paint(); } });
    pause.put(b, 46 + i * 90, 578, 14); quals[key] = b;
  });
  pause.put(ui.text('Áp dụng khi mở lại game', { size: 10, align: 'center', valign: 'mid', color: 0xb9b3cc, outlineW: 1.2 }), 180, 630, 14);
  pause.retry = ui.button({ id: 'retry', w: 120, h: 46, r: 15, color: PAL.orange, label: 'CHƠI LẠI', size: 14, onTap: () => { game.setPaused(false); open = false; game.retry(); } }); pause.put(pause.retry, 46, 656, 14);
  pause.home = ui.button({ id: 'home', w: 120, h: 46, r: 15, color: PAL.blue, label: 'VỀ NHÀ', size: 14, onTap: () => { open = false; game.leaveBattle(); } }); pause.put(pause.home, 194, 656, 14);

  // a "greyed" button is the off state: the target stays tappable
  const lamp = (b, on, color) => { b.setEnabled(on); if (b.target) b.target.enabled = true; return b; };
  function paint() {
    for (const [, key] of SWITCHES) {
      const on = isOn(key), lk = lockMarks[key] && !meta.unlocked(lockMarks[key].need);
      lamp(rows[key], on && !lk); rows[key].setLabel(lk ? 'KHOÁ' : on ? 'BẬT' : 'TẮT');
      if (lockMarks[key]) { lockMarks[key].icon.setVisible(!!lk); lockMarks[key].text.setVisible(!!lk); }
    }
    const cur = game.settings.quality || (game.host.quality && game.host.quality.name) || 'medium';
    for (const [, key] of QUALITY) lamp(quals[key], key === cur);
  }

  // ---------- result ----------
  let res = null, xpAnim = null, xpText = '', lvUp = '', gifts = [], tab = '', stats = null, tabBtns = null;
  function buildResult(r) {
    if (res) { kill(res); res = null; stats = null; }
    xpAnim = null; xpText = ''; lvUp = ''; gifts = [];
    const g = ui.group({ w: 360, h: 780 }); scr.put(g, 0, 0, 2); res = g;
    g.put(ui.panel({ w: 340, h: 830, r: 26, color: 0x33286a, depth: 6, bevel: 3 }), 10, -30, 0);
    const win = r.won, ribbon = ui.panel({ w: 316, h: 62, r: 20, color: win ? 0x2fae4a : 0xc43348, depth: 5, bevel: 3 }); g.put(ribbon, 22, 46, 12);
    g.put(ui.text(win ? 'CHIẾN THẮNG' : 'THẤT BẠI', { size: 34, align: 'center', valign: 'mid', color: win ? 0xffe14a : 0xffd0d0 }), 180, 79, 26);
    if (r.first) { const t = ui.panel({ w: 86, h: 22, r: 11, color: PAL.orange, depth: 3, bevel: 1.6, ow: 2, shadow: false }); t.put(ui.text('LẦN ĐẦU!', { size: 11, align: 'center', valign: 'mid', outlineW: 1.4 }), 43, 12, 2); g.put(t, 258, 38, 30); }
    const st = game.stageInfo ? game.stageInfo(r.stage) : null;
    g.put(ui.text(`Ải ${r.stage}${st ? '  ·  ' + st.name : ''}`, { size: 14, align: 'center', valign: 'mid', color: 0xfff1cf }), 180, 128, 14);
    const chips = [['cdr', clock(r.seconds)], ['skull', fmt(r.kills)], ['wave', `${win ? 5 : Math.max(1, (game.B && game.B.wave) || 1)}/5`]];
    chips.forEach(([icon, text], i) => {
      const p = ui.panel({ w: 100, h: 30, r: 15, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 });
      p.put(ui.icon(icon, { size: 26, sway: false }), -3, 2, 4); p.put(ui.text(text, { size: 14, align: 'center', valign: 'mid' }), 60, 16, 1); g.put(p, 22 + i * 108, 148, 14);
    });
    const rg = ui.group({ w: 360, h: 780 }); g.put(rg, 0, 0, 0);
    const hasBanner = (r.levelAfter || meta.acc.level) > (r.levelBefore || meta.acc.level);
    let y = hasBanner ? 262 : 240;
    const label = (s) => { rg.put(ui.text(s, { size: 12, align: 'left', valign: 'mid', color: 0xffd23f, outlineW: 1.5 }), 24, y + 6, 14); };
    { // account level: the bar fills, a level-up shows its banner, gift heroes come with their name
      const lvB = r.levelBefore || meta.acc.level, lvA = r.levelAfter || meta.acc.level, gain = r.xp || 0;
      const sumTo = (L) => { let t = 0; for (let k = 1; k < L; k++) t += xpNeed(k); return t; };
      const before = Math.max(0, sumTo(lvA) + meta.acc.xp - gain - sumTo(lvB));
      const row = ui.panel({ w: 316, h: 42, r: 14, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); rg.put(row, 22, y, 12);
      const lvT = ui.text('Cấp ' + lvB, { size: 15, valign: 'mid', outlineW: 2 }); row.put(lvT, 12, 21, 3);
      const bar = ui.bar({ w: 168, h: 16, color: PAL.green, value: before / xpNeed(lvB) }); row.put(bar, 76, 13, 2); bar.set(before / xpNeed(lvB), true);
      row.put(ui.text('+' + gain + ' XP', { size: 14, align: 'right', valign: 'mid', color: 0x9af3ff, outlineW: 2 }), 304, 21, 3);
      xpAnim = { bar, lvT, steps: [], t: -0.6, k: 0, lvB, lvA, banner: null, before: before / xpNeed(lvB) };
      if (lvA > lvB) {
        for (let L = lvB; L < lvA; L++) xpAnim.steps.push({ to: 1, level: L + 1 });
        const fin = meta.acc.xp / xpNeed(lvA); xpAnim.steps.push({ to: fin, last: true });
        const bn = ui.panel({ w: 150, h: 28, r: 14, color: PAL.orange, depth: 4, bevel: 2.4, ow: 2.6, shadow: false }); bn.put(ui.text('LÊN CẤP ' + lvA + '!', { size: 15, align: 'center', valign: 'mid', upper: true }), 75, 15, 3);
        rg.put(bn, 186, y - 28, 30); bn.setVisible(false); xpAnim.banner = bn; xpAnim.bannerT = 0;
      } else xpAnim.steps.push({ to: meta.acc.xp / xpNeed(lvA), last: true });
      lvUp = lvA > lvB ? 'LÊN CẤP ' + lvA + '!' : '';
      y += 52;
      xpText = '+' + gain + ' XP';
      for (const gid of r.gifts || []) {
        const gp = ui.panel({ w: 316, h: 54, r: 16, color: 0x7a2fa8, depth: 4, bevel: 2.6, ow: 2.6 }); rg.put(gp, 22, y, 12);
        gp.put(ui.portrait(gid, { size: 42, color: heroColor(gid), fps: 6, shadow: false }), 8, 6, 3);
        gp.put(ui.text('TƯỚNG MỚI: ' + (HERO[gid] ? HERO[gid].name : gid).toLocaleUpperCase('vi'), { size: 19, valign: 'mid', outlineW: 2.6 }), 62, 28, 3);
        gifts.push(HERO[gid] ? HERO[gid].name : gid); y += 62;
      }
      y += 4;
    }
    label('PHẦN THƯỞNG'); y += 18;
    const heroes = r.heroes || [], n = 2 + heroes.length, size = Math.min(48, Math.floor((322 - (n - 1) * 7) / n)), x0 = 180 - (n * size + (n - 1) * 7) / 2;
    const reward = (i, node, text, color = 0xffffff) => {
      rg.put(node, x0 + i * (size + 7), y, 14);
      rg.put(ui.text(text, { size: 11, align: 'center', valign: 'mid', color, outlineW: 1.4 }), x0 + i * (size + 7) + size / 2, y + size + 12, 14);
    };
    reward(0, ui.tile({ size, color: 'legend', icon: 'gold' }), '+' + fmt(r.gold), 0xffe14a);
    reward(1, ui.tile({ size, color: 'rare', icon: 'gem' }), '+' + fmt(r.gems), 0x9af3ff);
    heroes.forEach((h, i) => reward(2 + i, ui.portrait(h.id, { size, color: heroColor(h.id), fps: 6 }), '+' + r.teamShards, 0xe2c4ff));
    y += size + 30;
    if ((r.items && r.items.length) || r.mats) {
      label('TRANG BỊ RƠI'); y += 18;
      let x = 24;
      for (const it of r.items || []) { rg.put(ui.tile({ size: 46, color: TIERS[it.tier].color, icon: ITEM_ICON(it.item) }), x, y, 14); x += 54; }
      if (r.mats) { const p = ui.panel({ w: 120, h: 32, r: 16, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); p.put(ui.icon('gear', { size: 28, sway: false }), -2, 2, 4); p.put(ui.text('+' + r.mats + ' bản rèn', { size: 12, align: 'center', valign: 'mid' }), 72, 17, 1); rg.put(p, 336 - 120 + 0, y + 7, 14); }
      y += 62;
    }
    // tabs and the always-visible next steps
    stats = createStatsPanel(game); g.put(stats.node, 0, 0, 2); stats.build(r);
    tabBtns = {
      reward: ui.button({ id: 'tab-reward', w: 152, h: 38, r: 13, color: PAL.orange, label: 'PHẦN THƯỞNG', size: 14, onTap: () => setTab('reward') }),
      stats: ui.button({ id: 'tab-stats', w: 152, h: 38, r: 13, color: PAL.orange, label: 'THỐNG KÊ', size: 14, onTap: () => setTab('stats') }),
    };
    g.put(tabBtns.reward, 22, 186, 14); g.put(tabBtns.stats, 186, 186, 14);
    rewardG = rg;
    setTab(win ? 'reward' : 'stats');
    const mk = (id, text, color, w, h, onTap, icon) => ui.button({ id, w, h, r: 17, color, label: text, icon, size: h > 46 ? 21 : 15, onTap });
    if (win) {
      g.put(mk('next', 'ẢI TIẾP', PAL.green, 300, 50, () => game.nextStage(), 'play'), 30, 650, 14);
      g.put(mk('retry', 'CHƠI LẠI', PAL.orange, 144, 42, () => game.retry()), 30, 708, 14);
      g.put(mk('home', 'VỀ NHÀ', PAL.blue, 144, 42, () => game.leaveBattle()), 186, 708, 14);
    } else {
      g.put(mk('retry', 'CHƠI LẠI', PAL.orange, 300, 50, () => game.retry()), 30, 650, 14);
      g.put(mk('home', 'VỀ NHÀ', PAL.blue, 300, 42, () => game.leaveBattle()), 30, 708, 14);
    }
  }
  let rewardG = null;
  function setTab(t) {
    tab = t; if (rewardG) rewardG.setVisible(t === 'reward'); if (stats) stats.node.setVisible(t === 'stats');
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
