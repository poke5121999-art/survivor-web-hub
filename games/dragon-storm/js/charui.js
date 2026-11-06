// SELECT CHARACTER (opened by CHARACTER on the stage prep). Layout from clip OtA5hxMT0rg t=421-432 scaled to 480x800: title
// bar with X, a dark panel with the attribute orb, left / right arrows round the hero portrait, orange name and a 2-line bio,
// a jewel board with "+", the button (SELECTED / SELECT / jewel price BUY / MISSION) and the stat list (ATK / HP / CRI /
// SKILL ATK / SKILL COOL, "?" until owned). Buying with jewels is Call_Back_Buy_Selected_Cha @0x73b098; jewels are free in
// the web version (a short balance is topped up by a free pack first).
import { W, H } from './sim.js';

export const CHAR_LAYOUT = {
  close: { x: 406, y: 56, w: 50, h: 50 },
  left: { x: 40, y: 262, w: 70, h: 116 },
  right: { x: 370, y: 262, w: 70, h: 116 },
  portrait: { x: 130, y: 170, w: 220, h: 240 },
  button: { x: 291, y: 586, w: 162, h: 48 },
  plus: { x: 196, y: 590, w: 44, h: 40 },
};

const SHOWCASE = { '07': '06' };

export function createCharUI(gfx, meta, metaData, hooks) {
  const { ctx, img, frame, label, plain } = gfx;
  const st = { idx: 0, t: 0, swap: 0 };
  const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const L = CHAR_LAYOUT;

  function open() { st.idx = meta.char(); st.t = 0; st.swap = 0; }

  function tri(b, dir, lit) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + dir * 24, cy); // the tip points the way it turns
    ctx.lineTo(cx - dir * 22, cy - 46);
    ctx.lineTo(cx - dir * 22, cy + 46);
    ctx.closePath();
    ctx.fillStyle = lit ? '#2c2c2c' : '#151515';
    ctx.fill();
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function gem(x, y) { // jewel mark on the BUY button
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y - 11); ctx.lineTo(x + 11, y - 2); ctx.lineTo(x, y + 11); ctx.lineTo(x - 11, y - 2); ctx.closePath();
    ctx.fillStyle = '#4fd3ff'; ctx.fill();
    ctx.strokeStyle = '#d8f6ff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  function buttonState(i) {
    const c = meta.roster()[i];
    if (meta.charOwned(i)) return i === meta.char() ? { text: 'SELECTED', kind: 'selected' } : { text: 'SELECT', kind: 'select' };
    if (c.unlock.kind === 'buy') return { text: 'BUY', kind: 'buy', gems: c.unlock.gems };
    return { text: 'MISSION', kind: 'mission' };
  }

  function draw(dt) {
    st.t += dt;
    st.swap = Math.max(0, st.swap - dt);
    const R = meta.roster();
    const c = R[st.idx];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#050505';
    ctx.fillRect(16, 48, 448, 744);
    ctx.fillStyle = '#171717';
    ctx.fillRect(20, 52, 440, 58);
    plain('SELECT CHARACTER', 44, 81, 20, '#fff');
    frame('btn_option', 6, L.close.x, L.close.y);
    // panel
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(28, 118, 424, 460);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 118, 424, 460);
    // attribute orb (no attribute: grey; the original colours it by attribute)
    const g = ctx.createRadialGradient(57, 144, 3, 63, 150, 20);
    g.addColorStop(0, '#f2f2f2');
    g.addColorStop(0.5, '#8a8a8a');
    g.addColorStop(1, '#2b2b2b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(63, 150, 19, 0, Math.PI * 2);
    ctx.fill();
    tri(L.left, -1, false);
    tri(L.right, 1, false);
    // portrait: the hero at its saved tiers, idling (slides in when switched)
    const s = meta.charStats(st.idx);
    // the portrait is a showcase tier, not the hero's level (clip: Paul at ATK 15 shows the gold tier-10 armour, Teresa her
    // tier-10 spear, the skeleton his tier-06 blue sword and scarf)
    const show = SHOWCASE[c.set] || '10';
    drawHero(240, 400, 2.1, Math.floor(st.t * 8) % 6, { armor: show, sword: show, set: c.set }, 1 - st.swap * 4);
    plain(c.name, W / 2, 461, 20, '#ff9a1e', 'center');
    c.bio.split('\n').forEach((line, k) => plain(line, W / 2, 490 + k * 27, 15, '#fff', 'center'));
    // jewel board + plus, button
    frame('board_money', 1, 26, 588, { scale: 0.9 });
    plain(String(meta.gems()), 180, 612, 19, '#5fe0f0', 'right');
    ctx.drawImage(img('btn_more').img, L.plus.x, L.plus.y, 44, 34);
    const b = buttonState(st.idx);
    ctx.drawImage(img('btn_r180').img, L.button.x, L.button.y, L.button.w, L.button.h);
    const bx = L.button.x + L.button.w / 2, by = L.button.y + L.button.h / 2;
    if (b.kind === 'selected') { plain('✔', L.button.x + 24, by, 20, '#ffd23a', 'center'); plain('SELECTED', bx + 12, by, 18, '#fff', 'center'); }
    else if (b.kind === 'buy') {
      gem(L.button.x + 30, by);
      plain(String(b.gems), L.button.x + 58, by, 18, '#fff', 'center');
      plain('BUY', L.button.x + 118, by, 18, '#fff', 'center');
    } else plain(b.text, bx, by, 18, '#fff', 'center');
    // stats
    const own = meta.charOwned(st.idx);
    [['ATK', s.atk], ['HP', s.hp], ['CRI', s.crit], ['SKILL ATK', s.skill], ['SKILL COOL', s.cool]].forEach(([k, v], n) => {
      const y = 664 + n * 24;
      plain(`${k} :`, 40, y, 16, '#fff');
      plain(own ? String(v) : '?', 40 + (k.length + 3) * 9.2, y, 16, '#e8f04a');
    });
    if (c.goldMul && own) plain('2x GOLD', 440, 664, 16, '#f3e04a', 'right');
    if (c.expedHalf && own) plain('EXPLORE IN HALF TIME', 440, 664, 14, '#9fe0ff', 'right');
  }

  let drawHero = () => {};
  function setDrawHero(f) { drawHero = f; }

  function step(d) { const n = meta.roster().length; st.idx = (st.idx + d + n) % n; st.swap = 0.2; return { idx: st.idx }; }

  function press() {
    const i = st.idx;
    const c = meta.roster()[i];
    const b = buttonState(i);
    if (b.kind === 'selected') return { selected: i };
    if (b.kind === 'select') { meta.selectChar(i); hooks.toast(`${c.name.toUpperCase()}\nIS READY`); return { select: i }; }
    if (b.kind === 'mission') { hooks.toast(c.unlock.text.toUpperCase()); return { mission: i }; }
    // BUY: free in the web version - top up with the smallest free pack that covers the price, then buy and use the hero
    if (meta.gems() < b.gems) {
      const packs = metaData.shop.jewelPacks.value;
      const k = Math.max(0, packs.findIndex(pk => meta.gems() + pk.gems >= b.gems));
      meta.buyJewelPack(k);
    }
    const r = meta.buyChar(i);
    if (r === 'ok') { meta.selectChar(i); hooks.toast(`YOU GET ${c.name.toUpperCase()}!`); }
    return { buy: i, result: r };
  }

  function tap(p) {
    if (inside(p, L.close)) return { close: true };
    if (inside(p, L.left)) return step(-1);
    if (inside(p, L.right)) return step(1);
    if (inside(p, L.button)) return press();
    if (inside(p, L.plus)) return { shop: 'JEWEL' };
    return null;
  }

  function key(k) {
    if (k === 'Escape') return { close: true };
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') return step(-1);
    if (k === 'ArrowRight' || k === 'd' || k === 'D') return step(1);
    if (k === 'Enter' || k === ' ') return press();
    return null;
  }

  return { st, open, draw, tap, key, setDrawHero };
}
