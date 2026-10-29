// Chợ Việt start-up: hand the theme to My Mini Mart's engine, translate the HUD's fixed English strings as they appear,
// then start the engine (games/casual-farm/js/main.js reads window.MM_THEME when it loads).
import theme, { TEXT, CREDITS } from './theme.js';

window.MM_THEME = theme;

const translate = node => {
  const t = node.nodeValue, k = t.trim();
  if (k && TEXT[k] && TEXT[k] !== k) node.nodeValue = t.replace(k, TEXT[k]);
};
const walk = root => {
  if (root.nodeType === Node.TEXT_NODE) { translate(root); return; }
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) translate(n);
};
new MutationObserver(list => {
  for (const m of list) {
    if (m.type === 'characterData') translate(m.target);
    else m.addedNodes.forEach(walk);
  }
}).observe(document.body, { subtree: true, childList: true, characterData: true });

// Credits for the CC-BY models (and the CC0 ones, as thanks).
const box = document.getElementById('credits');
box.querySelector('ul').innerHTML = CREDITS.map(([what, who, lic, url]) => `<li><a href="${url}" target="_blank" rel="noopener">${what}</a> · ${who} · ${lic}</li>`).join('');
document.getElementById('creditsbtn').addEventListener('click', () => box.classList.toggle('open'));
box.addEventListener('click', e => { if (e.target === box) box.classList.remove('open'); });

await import('../../casual-farm/js/main.js');
