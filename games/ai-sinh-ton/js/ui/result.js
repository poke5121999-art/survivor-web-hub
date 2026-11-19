// One modal screen with three modes: 'pause' (resume, settings, retry, home), 'result' (win or loss with the reward
// list, per-hero damage and the next steps) and 'settings' (the same switches, opened from the home screen).
import { HERO } from '../data/heroes.js';
import { ITEM, TIERS } from '../data/equip.js';
import { fmt, heroColor, kill } from './hud.js';

const SWITCHES = [['Âm thanh', 'sound', 'set-sound'], ['Rung', 'vibrate', 'set-vibrate'], ['Giảm chớp sáng', 'reduceFlash', 'set-flash']];
const QUALITY = [['Thấp', 'low'], ['Vừa', 'medium'], ['Cao', 'high']];
const clock = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export function createResult(game) {
  const ui = game.ui, PAL = ui.PAL, THREE = ui.THREE;
  const scr = ui.screen('result', { modal: true });
  let mode = '', open = false;

  const dim = new THREE.Mesh(new THREE.PlaneGeometry(420, 900), new THREE.MeshBasicMaterial({ color: 0x0a0618, transparent: true, opacity: 0.68, depthWrite: false, toneMapped: false }));
  scr.put(dim, 180, 390, 0);

  // ---------- pause and settings ----------
  const pause = ui.group({ w: 360, h: 780 }); scr.put(pause, 0, 0, 2);
  pause.put(ui.panel({ w: 308, h: 504, r: 26, color: 0x33286a, depth: 6, bevel: 3 }), 26, 132, 0);
  pause.titleText = ui.text('TẠM DỪNG', { size: 31, align: 'center', valign: 'mid' }); pause.put(pause.titleText, 180, 176, 14);
  pause.stageText = ui.text('', { size: 12, align: 'center', valign: 'mid', color: 0xd9ccff, outlineW: 1.3 }); pause.put(pause.stageText, 180, 206, 14);
  pause.resume = ui.button({ id: 'resume', w: 244, h: 56, r: 18, color: PAL.green, icon: 'play', label: 'TIẾP TỤC', size: 21, onTap: () => resume() }); pause.put(pause.resume, 58, 226, 14);
  const rows = {};
  SWITCHES.forEach(([label, key, id], i) => {
    const y = 306 + i * 48;
    pause.put(ui.text(label, { size: 15, align: 'left', valign: 'mid' }), 50, y + 19, 14);
    const b = ui.button({ id, w: 92, h: 38, r: 13, color: PAL.green, label: 'BẬT', size: 15, onTap: () => { game.setSetting(key, !game.settings[key]); paint(); } });
    pause.put(b, 222, y, 14); rows[key] = b;
  });
  pause.put(ui.text('Chất lượng hình', { size: 15, align: 'left', valign: 'mid' }), 50, 466, 14);
  const quals = {};
  QUALITY.forEach(([label, key], i) => {
    const b = ui.button({ id: 'q-' + key, w: 84, h: 36, r: 12, color: PAL.blue, label, size: 14, onTap: () => { game.setSetting('quality', key); paint(); } });
    pause.put(b, 46 + i * 90, 482, 14); quals[key] = b;
  });
  pause.put(ui.text('Áp dụng khi mở lại game', { size: 10, align: 'center', valign: 'mid', color: 0xb9b3cc, outlineW: 1.2 }), 180, 534, 14);
  pause.retry = ui.button({ id: 'retry', w: 120, h: 46, r: 15, color: PAL.orange, label: 'CHƠI LẠI', size: 14, onTap: () => { game.setPaused(false); open = false; game.retry(); } }); pause.put(pause.retry, 46, 560, 14);
  pause.home = ui.button({ id: 'home', w: 120, h: 46, r: 15, color: PAL.blue, label: 'VỀ NHÀ', size: 14, onTap: () => { open = false; game.leaveBattle(); } }); pause.put(pause.home, 194, 560, 14);

  // a "greyed" button is the off state: the target stays tappable
  const lamp = (b, on, color) => { b.setEnabled(on); if (b.target) b.target.enabled = true; return b; };
  function paint() {
    for (const [, key] of SWITCHES) { const on = !!game.settings[key]; lamp(rows[key], on); rows[key].setLabel(on ? 'BẬT' : 'TẮT'); }
    const cur = game.settings.quality || (game.host.quality && game.host.quality.name) || 'medium';
    for (const [, key] of QUALITY) lamp(quals[key], key === cur);
  }

  // ---------- result ----------
  let res = null;
  function buildResult(r) {
    if (res) { kill(res); res = null; }
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
    let y = 196;
    const label = (s) => { g.put(ui.text(s, { size: 12, align: 'left', valign: 'mid', color: 0xffd23f, outlineW: 1.5 }), 24, y + 6, 14); };
    label('PHẦN THƯỞNG'); y += 18;
    const heroes = r.heroes || [], n = 2 + heroes.length, size = Math.min(48, Math.floor((322 - (n - 1) * 7) / n)), x0 = 180 - (n * size + (n - 1) * 7) / 2;
    const reward = (i, node, text, color = 0xffffff) => {
      g.put(node, x0 + i * (size + 7), y, 14);
      g.put(ui.text(text, { size: 11, align: 'center', valign: 'mid', color, outlineW: 1.4 }), x0 + i * (size + 7) + size / 2, y + size + 12, 14);
    };
    reward(0, ui.tile({ size, color: 'legend', icon: 'gold' }), '+' + fmt(r.gold), 0xffe14a);
    reward(1, ui.tile({ size, color: 'rare', icon: 'gem' }), '+' + fmt(r.gems), 0x9af3ff);
    heroes.forEach((h, i) => reward(2 + i, ui.portrait(h.id, { size, color: heroColor(h.id), fps: 6 }), '+' + r.teamShards, 0xe2c4ff));
    y += size + 30;
    if ((r.items && r.items.length) || r.mats) {
      label('TRANG BỊ RƠI'); y += 18;
      let x = 24;
      for (const it of r.items || []) { g.put(ui.tile({ size: 46, color: TIERS[it.tier].color, icon: ITEM[it.item].slot }), x, y, 14); x += 54; }
      if (r.mats) { const p = ui.panel({ w: 120, h: 32, r: 16, color: 0x241b4d, depth: 3, bevel: 2, gloss: false, ow: 2.4 }); p.put(ui.icon('gear', { size: 28, sway: false }), -2, 2, 4); p.put(ui.text('+' + r.mats + ' bản rèn', { size: 12, align: 'center', valign: 'mid' }), 72, 17, 1); g.put(p, 336 - 120 + 0, y + 7, 14); }
      y += 62;
    }
    label('SÁT THƯƠNG'); y += 20;
    const top = Math.max(1, ...heroes.map((h) => h.dealt));
    heroes.forEach((h, i) => {
      const ry = y + i * 38;
      g.put(ui.portrait(h.id, { size: 34, color: heroColor(h.id), fps: 4, shadow: false }), 22, ry, 14);
      g.put(ui.text(HERO[h.id] ? HERO[h.id].name : h.id, { size: 11, align: 'left', valign: 'mid', outlineW: 1.3 }), 64, ry + 5, 14);
      const bar = ui.bar({ w: 214, h: 14, color: heroColor(h.id) }); g.put(bar, 64, ry + 14, 14); bar.set(h.dealt / top, true);
      g.put(ui.text(fmt(h.dealt), { size: 13, align: 'right', valign: 'mid' }), 340, ry + 21, 14);
    });
    y += heroes.length * 38 + 14;
    const mk = (id, text, color, w, h, onTap, icon) => ui.button({ id, w, h, r: 17, color, label: text, icon, size: h > 50 ? 21 : 15, onTap });
    if (win) {
      g.put(mk('next', 'ẢI TIẾP', PAL.green, 300, 56, () => game.nextStage(), 'play'), 30, y, 14);
      g.put(mk('retry', 'CHƠI LẠI', PAL.orange, 144, 46, () => game.retry()), 30, y + 70, 14);
      g.put(mk('home', 'VỀ NHÀ', PAL.blue, 144, 46, () => game.leaveBattle()), 186, y + 70, 14);
    } else {
      g.put(mk('retry', 'CHƠI LẠI', PAL.orange, 300, 56, () => game.retry()), 30, y, 14);
      g.put(mk('home', 'VỀ NHÀ', PAL.blue, 300, 46, () => game.leaveBattle()), 30, y + 70, 14);
    }
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

  return [{ name: 'result', show, hide, update() {}, dbg() { return { mode, open }; } }];
}
