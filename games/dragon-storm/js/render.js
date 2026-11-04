// Canvas 2D renderer: draws the sim state with the original art, laid out after the gameplay clips
// (~/handoff/dragon-storm-clips.md, HUD sketch + key frames c2 0:110 / c1 0:46 / c1 2:21 / c1 5:53):
//   top wood bar   0-~110  stage number + title (left), book + coin counters (right), combo under it (right edge)
//   lane           0-452   stage background 480x460, hero fixed in the centre, HP bar under the hero
//   touch pad    452-690   rock wall; corner slots (winged shield / potion), big left/right triangles,
//                          red slash button over the blue skill button
//   bottom bar   690-800   pause, AUTO (locked), SCORE board with the segmented bar and 3 star marks
import { W, H, GROUND_Y, starScores } from './sim.js';

export const PAD_TOP = 452;
export const BTN = {
  left: { x: 58, y: 506, w: 114, h: 186 },
  right: { x: 308, y: 506, w: 114, h: 186 },
  red: { cx: 240, cy: 540, r: 50 },
  blue: { cx: 240, cy: 642, r: 46 },
  shield: { x: 0, y: 456, w: 112, h: 102 },
  potion: { x: 368, y: 456, w: 112, h: 102 },
  pause: { x: 12, y: 726, w: 50, h: 50 },
  auto: { x: 74, y: 732, w: 76, h: 38 },
  close: { x: 428, y: 112, w: 50, h: 50 },
  retry: { x: 22, y: 487, w: 214, h: 64 },
  next: { x: 244, y: 487, w: 214, h: 64 },
  map: { x: 3, y: 600, w: 474, h: 60 },
};
const SCORE_BOARD = { x: 192, y: 709 };
const STAR_X = [82, 152, 222]; // centres of the star marks on in_board_score (measured)
const COIN_TARGET = { x: 372, y: 52 };

export function createRenderer(ctx, art) {
  const img = k => art.images[k];
  const fx = [];
  let shake = 0;
  let rng = 12345;
  const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;

  // draw frame `f` of sheet `k` with its top-left at (x, y); flip mirrors around the frame centre
  function frame(k, f, x, y, opt = {}) {
    const a = img(k);
    const fw = a.fw || a.w;
    const fh = a.fh || a.h;
    const cols = a.cols || 1;
    const sx = (f % cols) * fw;
    const sy = Math.floor(f / cols) * fh;
    const sc = opt.scale || 1;
    ctx.save();
    if (opt.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, opt.alpha));
    if (opt.add) ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x + (fw * sc) / 2, y + (fh * sc) / 2);
    if (opt.rot) ctx.rotate(opt.rot);
    ctx.scale(opt.flip ? -sc : sc, sc);
    ctx.drawImage(a.img, sx, sy, fw, fh, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }
  // centred variant
  const frameC = (k, f, cx, cy, opt = {}) => {
    const a = img(k);
    const sc = opt.scale || 1;
    frame(k, f, cx - ((a.fw || a.w) * sc) / 2, cy - ((a.fh || a.h) * sc) / 2, opt);
  };

  function digits(k, n, x, y, align = 'left', scale = 1, gap = -2, alpha) {
    const a = img(k);
    const s = String(Math.max(0, Math.floor(n)));
    const step = (a.fw + gap) * scale;
    let x0 = align === 'right' ? x - s.length * step : align === 'center' ? x - (s.length * step) / 2 : x;
    for (const ch of s) { frame(k, +ch, x0, y, { scale, alpha }); x0 += step; }
    return s.length * step;
  }

  function label(text, x, y, size = 22, color = '#fff', align = 'center', stroke = true, weight = 900) {
    ctx.save();
    ctx.font = `${weight} ${size}px "Arial Black", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineWidth = Math.max(3, size / 5);
      ctx.strokeStyle = '#000';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  const plain = (text, x, y, size, color = '#fff', align = 'left') => {
    ctx.save();
    ctx.font = `600 ${size}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 2;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  // ---- events from the sim become visual effects ----
  function onEvent(e, s) {
    const mid = GROUND_Y - 36;
    if (e.type === 'hit') {
      fx.push({ k: 'eff_hit', x: e.x - 32, y: mid - 32, t: 0, dur: 0.3, add: true });
      if (e.crit) fx.push({ text: 'eff_critical', x: e.x - 85, y: GROUND_Y - 150, t: 0, dur: 0.7 });
      fx.push({ num: e.dmg, x: e.x, y: mid - 40, t: 0, dur: 0.7 });
    } else if (e.type === 'kill') {
      const sheet = s.stage.monsters[e.mtype].sheet;
      const a = img(sheet);
      fx.push({ k: 'eff_hit', x: e.x - 48, y: mid - 48, t: 0, dur: 0.3, add: true, scale: 1.5 });
      fx.push({ k: 'eff_die', x: e.x - 32, y: mid - 32, t: 0.05, dur: 0.4, add: true });
      fx.push({ num: e.dmg, x: e.x, y: mid - 40, t: 0, dur: 0.7 });
      fx.push({ head: true, k: sheet, f: 4, x: e.x - a.fw / 2, y: GROUND_Y - a.fh, vx: e.side * (160 + rand() * 120), vy: -420 - rand() * 160, rot: 0, vr: e.side * (8 + rand() * 6), t: 0, dur: 1.6, flip: e.side > 0 });
      for (let i = 0; i < 14; i++) {
        fx.push({ blood: true, x: e.x, y: mid, vx: e.side * (60 + rand() * 220), vy: -120 - rand() * 260, t: 0, dur: 0.7 + rand() * 0.3, size: 3 + rand() * 3 });
      }
      for (let i = 0; i < e.gold; i++) {
        fx.push({ coin: true, x: e.x, y: mid, vx: (rand() - 0.5) * 140 + e.side * 40, vy: -260 - rand() * 120, t: -i * 0.06, dur: 1.25, gy: GROUND_Y - 8 });
      }
      if (e.crit) fx.push({ text: 'eff_critical', x: e.x - 85, y: GROUND_Y - 150, t: 0, dur: 0.7 });
      shake = 0.12;
    } else if (e.type === 'heroHurt') {
      shake = 0.18;
      for (let i = 0; i < 8; i++) fx.push({ blood: true, x: W / 2, y: GROUND_Y - 50, vx: (rand() - 0.5) * 240, vy: -100 - rand() * 200, t: 0, dur: 0.6, size: 3 });
    } else if (e.type === 'skill') {
      for (let i = 0; i < 8; i++) fx.push({ k: 'eff_pang', x: 30 + i * 55, y: GROUND_Y - 90 - (i % 2) * 40, t: -i * 0.04, dur: 0.6, add: true, scale: 1.6 });
      shake = 0.3;
    }
  }

  function updateFx(dt) {
    shake = Math.max(0, shake - dt);
    for (const f of fx) {
      f.t += dt;
      if (f.t < 0) continue;
      if (f.head || f.blood) {
        f.vy += 1100 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        if (f.head) f.rot += f.vr * dt;
      } else if (f.coin) {
        if (f.t < 0.8) {
          f.vy += 1200 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          if (f.y > f.gy) { f.y = f.gy; f.vy *= -0.45; f.vx *= 0.6; }
          f.fx = f.x; f.fy = f.y;
        } else {
          const p = Math.min(1, (f.t - 0.8) / 0.45);
          f.x = f.fx + (COIN_TARGET.x - f.fx) * p * p;
          f.y = f.fy + (COIN_TARGET.y - f.fy) * p;
        }
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t >= fx[i].dur) fx.splice(i, 1);
  }

  function drawFx() {
    for (const f of fx) {
      if (f.t < 0) continue;
      const p = f.t / f.dur;
      if (f.head) frame(f.k, f.f, f.x, f.y, { rot: f.rot, flip: f.flip, alpha: p > 0.8 ? (1 - p) * 5 : 1 });
      else if (f.blood) { ctx.fillStyle = `rgba(190,0,0,${1 - p})`; ctx.fillRect(f.x, f.y, f.size, f.size); }
      else if (f.coin) frameC('icon_bag', 1, f.x, f.y, { scale: 0.6 });
      else if (f.num !== undefined) digits('no_r', f.num, f.x, f.y - p * 34, 'center', 1, -3, p > 0.6 ? (1 - p) / 0.4 : 1);
      else if (f.text) frame(f.text, 0, f.x, f.y - p * 20, { alpha: p > 0.7 ? (1 - p) / 0.3 : 1 });
      else {
        const a = img(f.k);
        const fi = Math.min(a.frames - 1, Math.floor(p * a.frames));
        const sc = f.scale || 1;
        frame(f.k, fi, f.x - (sc - 1) * 32, f.y - (sc - 1) * 32, { add: f.add, scale: sc });
      }
    }
  }

  // ---- title ----
  function drawTitle(t, rev) {
    ctx.drawImage(img('bg_title').img, 0, 0, W, H);
    const glow = 0.5 + 0.5 * Math.sin(t * 3);
    frame('logo', 1, 50, 70, { alpha: glow * 0.8, add: true });
    frame('logo', 0, 50, 70);
    if (Math.floor(t * 2) % 2 === 0) label('TOUCH TO START', W / 2, 690, 30, '#ffd23a');
    label(`web remake slice · ${rev}`, W - 8, H - 12, 11, '#ccc', 'right');
  }

  // ---- lane ----
  function heroFrame(s) {
    const h = s.hero;
    if (h.state === 'dead') return 11;
    if (h.state === 'dash') return 10; // dash frame (clip c1 7:29)
    if (h.state === 'attack') return 6 + Math.min(3, Math.floor((h.st / s.stage.hero.attackTime) * 4));
    if (h.hurt > 0) return 10;
    return Math.floor(h.st * 7) % 6;
  }

  // Knight = body sheet armor_cha_01_<tier> with the weapon sheet sword_cha_01_<tier> drawn on top, same 128x128 frame.
  // Mirrored around pivotX (not the frame centre), and in slash frames the weapon layer sits where the original draws
  // it for that armor tier (data hero.sprite, measured from the clip).
  let tierOverride = {};
  const tiersOf = s => ({
    armor: tierOverride.armor || s.stage.hero.armorTier || '01',
    sword: tierOverride.sword || s.stage.hero.swordTier || '01',
  });
  function heroPose(s) {
    const h = s.hero;
    const sp = s.stage.hero.sprite || {};
    const t = tiersOf(s);
    const f = heroFrame(s);
    const flip = h.facing < 0;
    const pivot = sp.pivotX ?? 64;
    const bodyX = Math.round(h.x + h.offX - (flip ? 128 - pivot : pivot));
    const bodyY = GROUND_Y - 122;
    const off = ((sp.weaponOffset || {})[t.armor] || {})[f] || [0, 0];
    return {
      f, flip, bodyX, bodyY, swordX: bodyX + h.facing * off[0], swordY: bodyY + off[1],
      armorKey: `hero_armor_${t.armor}`, swordKey: `hero_sword_${t.sword}`,
    };
  }

  function drawHero(s) {
    const h = s.hero;
    const p = heroPose(s);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(h.x, GROUND_Y - 2, 38, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    frame(p.armorKey, p.f, p.bodyX, p.bodyY, { flip: p.flip });
    frame(p.swordKey, p.f, p.swordX, p.swordY, { flip: p.flip });
    if (h.hurt > 0 && Math.floor(h.hurt * 30) % 2 === 0) frame(p.armorKey, p.f, p.bodyX, p.bodyY, { flip: p.flip, add: true, alpha: 0.6 });
    if (h.shield > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(120,200,255,${0.5 + 0.3 * Math.sin(s.t * 12)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(h.x, GROUND_Y - 50, 56, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHeroHp(s) {
    const h = s.hero;
    const bx = Math.round(h.x - 48);
    const by = GROUND_Y + 8;
    ctx.drawImage(img('board_hp').img, bx, by);
    const hp = h.hp / h.hpMax;
    if (hp > 0) ctx.drawImage(img('gauge_hp').img, 0, 0, 80 * hp, 6, bx + 8, by + 8, 80 * hp, 6);
  }

  function monsterFrame(m, def) {
    if (m.state === 'dead') return 5;
    if (m.state === 'attack') return 6 + Math.min(3, Math.floor(m.st / def.atkFrame));
    if (m.state === 'aim') return 6 + Math.min(1, Math.floor(m.st / def.ranged.aimFrame)); // 2 aim frames x 0.06 s
    if (m.state === 'retreat') return m.st < def.ranged.aimFrame ? 8 : Math.floor(m.st * 9) % 4; // shot frame, then backs off
    if (m.state === 'walk') return Math.floor(m.st * (m.speed > 150 ? 14 : 9)) % 4;
    return 0;
  }

  function drawMonsters(s) {
    for (const m of s.monsters) {
      const def = s.stage.monsters[m.type];
      const a = img(def.sheet);
      const sc = def.scale || 1;
      const fw = (a.fw || a.w) * sc;
      const fh = (a.fh || a.h) * sc;
      const x = m.x - fw / 2;
      // arrows fly at chest height; everything else stands on the ground strip
      const y = def.projectileOf ? GROUND_Y - 52 : GROUND_Y - fh + 2;
      const flip = m.side > 0; // sheets face right; the right lane walks left
      const f = def.projectileOf ? 0 : monsterFrame(m, def);
      const alpha = m.state === 'dead' ? (m.spent ? 0 : Math.max(0, 1 - m.st / 0.7)) : 1;
      frame(def.sheet, f, x, y, { flip, alpha, scale: sc });
      if (m.flash > 0) frame(def.sheet, f, x, y, { flip, add: true, alpha: 0.9, scale: sc });
      if (m.state !== 'dead' && !def.projectileOf && def.ai !== 4) { // thin red HP bar under the monster (clip c1 2:21)
        const gx = Math.round(m.x - 22);
        const gy = GROUND_Y + 2;
        frame('gauge_monster', 0, gx, gy);
        const w = Math.max(0, (44 * m.hp) / m.hpMax);
        ctx.drawImage(img('gauge_monster').img, 0, 6, w, 6, gx, gy, w, 6);
      }
    }
  }

  // boss-wave alert (in_eff_alert blinking at the entry side) and the wolf-pack warning at the screen edge
  // (Scene_UI::EFF_MARK_ALERT; placed as in clip c1 8:14: wolf heads at the right edge with a red arrow)
  function drawAlerts(s) {
    for (const a of s.alerts) {
      if (a.k === 'alert') {
        // red tint fading in/out at both edges (FadeIn/FadeOut 0.3 s, SCH_PLAY_BY_SCENARIO @0x59f500) and the "!" pulsing
        // at screen centre (ScaleTo 0.3 s, @0x59f6ac), as in clip c1 7:27
        const p = (a.t % 0.6) / 0.6;
        const tint = p < 0.5 ? p * 2 : (1 - p) * 2;
        for (const [x0, x1] of [[0, 120], [W, W - 120]]) {
          const g = ctx.createLinearGradient(x0, 0, x1, 0);
          g.addColorStop(0, `rgba(220,30,30,${0.55 * tint})`);
          g.addColorStop(1, 'rgba(220,30,30,0)');
          ctx.fillStyle = g;
          ctx.fillRect(Math.min(x0, x1), 70, 120, GROUND_Y - 40);
        }
        frameC('eff_alert', 0, W / 2, 220, { scale: 0.8 + 0.2 * tint });
      } else if (a.k === 'warn') {
        // "!" bubble at the edge for an incoming monster (Scene_UI::EFF_MARK_ALERT default art, clip c1 7:20)
        frame('eff_warning', 0, a.side > 0 ? W - 40 : 8, GROUND_Y - 120 + a.dy);
      } else if (a.k === 'aim') {
        // "!" over an archer about to shoot (Scene_Stage::EFF_ALERT02 @0x5bb0f0, clip c1 8:16-8:24)
        const m = s.monsters.find(x => x.id === a.id);
        // shown ~56 px wide over the archer's head in the clip (in_eff_warning is 32 px): scale 1.75, CLIP-MEASURED
        if (m) frameC('eff_warning', 0, Math.max(30, Math.min(W - 30, m.x)), GROUND_Y - 72, { scale: 1.75 });
      } else {
        const i = s.alerts.filter(b => b.k === 'wolf' && b.side === a.side).indexOf(a);
        const y = GROUND_Y - 190 + i * 30 + a.dy;
        const x = a.side > 0 ? W - 72 : 8;
        frame('eff_warning_wolf', 0, x, y, { flip: a.side > 0 }); // red arrow points out toward the incoming side
      }
    }
  }

  // ---- HUD ----
  function tileX(k, y) {
    const t = img(k).img;
    for (let x = 0; x < W; x += t.width) ctx.drawImage(t, x, y);
  }

  function drawTopBar(s) {
    tileX('bg_top', 0);
    plain(`STAGE ${s.stage.number}`, 14, 34, 19);
    plain(s.stage.title, 14, 62, 19);
    if (s.boss) { // boss HP bar under the title (clip c1 8:14; Scene_UI::FUC_SET_MONSTER_HP_BAR)
      ctx.drawImage(img('board_hp_boss').img, 6, 68);
      const frac = Math.max(0, s.boss.hp / s.boss.hpMax);
      if (frac > 0) ctx.drawImage(img('gauge_hp_boss').img, 0, 0, 350 * frac, 6, 14, 76, 350 * frac, 6);
    }
    const bx = 356;
    const by = 16;
    const sc = 0.64;
    ctx.drawImage(img('board_target').img, bx, by, 186 * sc, 102 * sc);
    frameC('icon_mode', 0, bx - 22, by + 16, { scale: 0.85 }); // difficulty skull (NORMAL), clip c2 1:10
    frameC('icon_bag', 2, bx + 18, by + 15, { scale: 0.7 });
    frameC('icon_bag', 1, bx + 18, by + 46, { scale: 0.62 });
    plain(String(s.books), bx + 108, by + 15, 18, '#fff', 'right');
    plain(String(s.gold), bx + 108, by + 46, 18, '#fff', 'right');
    if (s.combo >= 1 && (s.phase === 'play' || s.phase === 'ready')) {
      digits('no_combo', s.combo, 474, 116, 'right', 1, -3);
      ctx.drawImage(img('eff_combo').img, 404, 150);
    }
  }

  function circleBtn(b, ringScale, faceKey, face, faceScale, dim) {
    frameC('btn_ring', 0, b.cx, b.cy, { scale: ringScale });
    frameC(faceKey, face, b.cx, b.cy, { scale: faceScale, alpha: dim ? 0.55 : 1 });
  }

  function drawPad(s) {
    const fl = s.inputFlash || {};
    // corner item slots
    frame('item_slot', 0, BTN.shield.x, BTN.shield.y, { alpha: 0.85 });
    frame('item_slot', 1, BTN.potion.x, BTN.potion.y, { alpha: 0.85 });
    frameC('icons', 42, 40, 488, { scale: 0.85, alpha: s.shields > 0 ? 1 : 0.85 });
    frameC('icons', 55, 440, 488, { scale: 0.85, alpha: s.potions > 0 ? 1 : 0.85 });
    label(String(s.shields), 16, 528, 18, '#fff', 'left');
    label(String(s.potions), 406, 470, 18, '#fff', 'right');
    // big triangles
    for (const k of ['left', 'right']) {
      const b = BTN[k];
      ctx.save();
      ctx.globalAlpha = fl[k] > 0 ? 1 : 0.7;
      ctx.drawImage(img(`btn_${k}`).img, b.x, b.y);
      ctx.restore();
    }
    // red button = the knight's dash skill, with its cooldown sweep (clip c1 0:46, 7:30)
    const red = BTN.red;
    circleBtn(red, 0.84, 'icon_skill', 0, 1.18, false);
    const h = s.hero;
    if (h.dashCd > 0) {
      const p = h.dashCd / h.dashMax;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.moveTo(red.cx, red.cy);
      ctx.arc(red.cx, red.cy, 38, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // blue skill button with its charge count
    const blue = BTN.blue;
    circleBtn(blue, 0.76, 'icon_skill_all', 0, 1.08, s.skillCharges <= 0);
    label(String(s.skillCharges), blue.cx + 40, blue.cy + 26, 20, '#fff');
  }

  function drawBottomBar(s) {
    tileX('bg_bottom', H - 140 + 28);
    frame('btn_option', 8, BTN.pause.x, BTN.pause.y);
    // AUTO toggle: dark red while locked (clip c1 2:21), lit red once this stage + mode has AUTO (clip c2 3:30)
    ctx.save();
    ctx.fillStyle = s.auto ? 'rgba(90,0,0,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(BTN.auto.x, BTN.auto.y, BTN.auto.w, BTN.auto.h);
    ctx.restore();
    label('AUTO', 112, 751, 15, s.auto ? '#ff4a2a' : s.autoOpen ? '#c0302a' : '#6e1111', 'center', !!s.auto);
    // SCORE board
    const { x: bx, y: by } = SCORE_BOARD;
    ctx.drawImage(img('board_score').img, bx, by);
    plain('SCORE:', bx + 16, by + 27, 17);
    digits('no_score', s.score, bx + 268, by + 8, 'right', 0.86);
    const frac = Math.min(1, s.score / s.stage.scoreBar);
    if (frac > 0) ctx.drawImage(img('gauge_score').img, 0, 0, 256 * frac, 12, bx + 13, by + 51, 256 * frac, 12);
    const marks = starScores(s.stage);
    marks.forEach((th, i) => { if (s.score >= th) frameC('star_small', i, bx + STAR_X[i], by + 76); });
  }

  function drawPhaseText(s) {
    if (s.phase === 'ready') frame('text_round', s.t < 1.0 ? 0 : 3, W / 2 - 110, 190);
    if (s.phase === 'clear' || s.phase === 'fail') {
      const p = Math.min(1, s.t / 0.25);
      const sc = 0.6 + 0.4 * p;
      frame('text_result', s.phase === 'clear' ? 0 : 1, W / 2 - 170 * sc, 200, { scale: sc });
    }
    if (s.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      label('PAUSED', W / 2, 330, 44, '#ffd23a');
      label('tap to resume', W / 2, 380, 18, '#fff');
    }
  }

  // ---- result (clip c1 5:53) ----
  function button(k, b, text, dim) {
    ctx.save();
    if (dim) ctx.globalAlpha = 0.45;
    ctx.drawImage(img(k).img, b.x, b.y, b.w, b.h);
    ctx.restore();
    plain(text, b.x + b.w / 2, b.y + b.h / 2, 24, dim ? '#999' : '#fff', 'center');
  }

  function drawResult(s, t, info) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#16120f';
    ctx.fillRect(0, 672, W, H - 672);
    tileX('bg_top', 0);
    for (let i = 0; i < 3; i++) {
      const on = i < s.stars && t > 0.3 + i * 0.25;
      frameC('result_star', on ? 1 : 0, W / 2 + (i - 1) * 77, 44, { scale: 0.85 });
    }
    ctx.drawImage(img('popup_result').img, 0, 92);
    plain(s.phase === 'result' && s.hero.state === 'dead' ? 'FAILED' : 'RESULT', W / 2, 140, 26, '#fff', 'center');
    frame('btn_option', 6, BTN.close.x, BTN.close.y); // teal X (clip c1 5:53), same as TO WORLDMAP
    plain('SCORE :', W / 2, 192, 18, '#fff', 'center');
    digits('no_score', s.score, W / 2, 206, 'center', 1);
    plain(`BEST SCORE : ${Math.max(info.best || 0, s.score)}`, W / 2, 262, 17, '#fff', 'center');
    const tier = tiersOf(s);
    frame(`hero_armor_${tier.armor}`, 0, W / 2 - 64, 290);
    frame(`hero_sword_${tier.sword}`, 0, W / 2 - 64, 290);
    plain('GOLD :', W / 2 - 20, 444, 19, '#d8e84a', 'right');
    frameC('icon_bag', 1, W / 2 + 4, 444, { scale: 0.62 });
    plain(String(s.gold), W / 2 + 22, 444, 19, '#d8e84a', 'left');
    button('btn_r', BTN.retry, 'RETRY');
    button('btn_r', BTN.next, 'NEXT', !info.hasNext);
    if (info.hasNext) ctx.drawImage(img('btn_menu').img, 40, 10, 44, 44, BTN.next.x + BTN.next.w - 50, BTN.next.y + 11, 42, 42);
    button('btn_long', BTN.map, 'TO WORLDMAP');
    frameC('icons', 1, BTN.map.x + 112, BTN.map.y + BTN.map.h / 2, { scale: 0.55 });
    plain('NORMAL', 14, 704, 17, '#fff');
    const three = s.stars === 3;
    const untouched = s.damageTaken === 0 && s.hero.state !== 'dead';
    plain(`${three ? '★' : '☆'} GET 3 STAR`, 14, 740, 18, three ? '#ffd23a' : '#888');
    plain(`${untouched ? '♥' : '♡'} UNTOUCHED`, 190, 740, 18, untouched ? '#ff7a7a' : '#888');
  }

  // Sword Storm swords: bullert_sword, rotated 90 - 15k deg (cocos, clockwise) so it points along its flight
  function drawSwords(s) {
    if (!s.swords.length) return;
    const sw = img('storm_sword');
    const step = s.stage.hero.swordStorm.angleStep;
    for (const b of s.swords) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(((90 - step * b.k) * Math.PI) / 180);
      ctx.drawImage(sw.img, -sw.w / 2, -sw.h / 2, sw.w, sw.h);
      ctx.restore();
    }
  }

  function drawStage(s, dt, info = {}) {
    updateFx(dt);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((rand() - 0.5) * 8 * (shake / 0.2), (rand() - 0.5) * 6 * (shake / 0.2));
    // lane background first, then the pad (bg_t_*) on top: its top strip (stage 1 stone pavement, grass elsewhere) is
    // the ground the hero stands on (clip c2 1:10 stage 1, c1 8:14 stage 5)
    const bg = img(s.stage.background); // stored at half resolution, shown at its 480x460 display size
    ctx.drawImage(bg.img, 0, -8, bg.dw || bg.w, bg.dh || bg.h);
    const pad = img(s.stage.pad);
    ctx.drawImage(pad.img, 0, PAD_TOP + (s.stage.padOffset || 0), pad.dw || pad.w, pad.dh || pad.h);
    drawMonsters(s);
    drawAlerts(s);
    drawHero(s);
    drawSwords(s);
    ctx.restore();
    drawPad(s);
    drawHeroHp(s);
    drawBottomBar(s);
    drawTopBar(s);
    ctx.save();
    if (shake > 0) ctx.translate((rand() - 0.5) * 8 * (shake / 0.2), 0);
    drawFx();
    ctx.restore();
    drawPhaseText(s);
    if (s.phase === 'result') drawResult(s, s.t, info);
  }

  return {
    drawTitle, drawStage, onEvent, fx, heroPose, setTiers: t => { tierOverride = { ...t }; },
    gfx: { ctx, img, frame, frameC, digits, label, plain, tileX },
  };
}
