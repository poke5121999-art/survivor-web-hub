// Achievements list (mb:AchievementsPanel rows: icon, title, description, progress, done tick, date) and the wardrobe
// (WardrobeScreen: pick a hat; perks from rules/finds.md §B). Both are DOM panels in the house style.
import { T } from '../sim/i18n.js';
import { ACH, ACH_TOTAL } from '../sim/achievements.js';
import { HATS } from '../sim/finds.js';
const UI = './art/ui/';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HAT_PCT = { police: 1.05, viking: 1.3, chef: 1.08, crown: 1.5, propeller: 0.75, pirate: 1.08, wizard: 0.7 };

export function achScreen(root, ach, onClose) {
  const rows = ACH.map(([id]) => {
    const done = ach.done(id), k = id.toLowerCase(), at = ach.store.done[id];
    return `<div class="achRow${done ? ' done' : ''}"><img src="${UI}${id}.webp" alt=""><div class="tx"><div class="h">${esc(T('ach.' + k + '.name'))}</div><div class="d">${esc(T('ach.' + k + '.desc'))}</div></div>
      <div class="st">${done ? `<b>✓</b><span>${new Date(at * 1000).toLocaleDateString()}</span>` : ''}</div></div>`;
  }).join('');
  root.innerHTML = `<div class="screen" id="achScreen"><div class="panel"><div class="ptitle">${esc(T('mainmenu.achievements'))}</div>
    <div class="pwallet"><span>${ach.count} / ${ACH_TOTAL}</span></div><button class="pclose sbtn" id="achClose">✕</button>
    <div class="achList">${rows}</div><div class="foot"><span><b>ESC</b>${esc(T('menu.hint.close'))}</span></div></div></div>`;
  root.querySelector('#achClose').addEventListener('click', onClose);
  root.querySelector('#achScreen').addEventListener('pointerdown', (e) => { if (e.target.id === 'achScreen') onClose(); });
}

export function wardrobeScreen(root, finds, onPick, onClose) {
  const cards = HATS.map(h => {
    const ok = finds.hatOk(h.id), pct = HAT_PCT[h.key] ? Math.round(Math.abs(HAT_PCT[h.key] - 1) * 100) : '';
    return `<button class="hatCard sbtn${finds.hat === h.id ? ' sel' : ''}${ok ? '' : ' locked'}" data-h="${h.id}" ${ok ? '' : 'disabled'}>
      ${h.id ? `<img src="${UI}hat_${h.key}.webp" alt="">` : '<div class="nohat">—</div>'}<div class="h">${esc(T('hat.' + h.key))}</div>
      <div class="d">${ok ? esc(T('hat.perk.' + h.key, pct)) : '🔒'}</div></button>`;
  }).join('');
  root.innerHTML = `<div class="screen" id="wardScreen"><div class="panel"><div class="ptitle">${esc(T('wardrobe.prompt'))}</div><button class="pclose sbtn" id="wClose">✕</button>
    <div class="hatGrid">${cards}</div><div class="foot"><span><b>ESC</b>${esc(T('menu.hint.close'))}</span></div></div></div>`;
  root.querySelectorAll('.hatCard').forEach(b => b.addEventListener('click', () => { onPick(+b.dataset.h); wardrobeScreen(root, finds, onPick, onClose); }));
  root.querySelector('#wClose').addEventListener('click', onClose);
  root.querySelector('#wardScreen').addEventListener('pointerdown', (e) => { if (e.target.id === 'wardScreen') onClose(); });
}
