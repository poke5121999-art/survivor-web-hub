// Languages. Every text the player reads lives in a table (js/lang-en.js, js/lang-vi.js) under a key; code asks for it with
// BZ.t('key', [values]) and the page's own text sits in <t-x k="key"> elements and data-t-<attribute>="key" attributes.
// English is the default; the choice is kept in localStorage and ?lang=vi|en overrides it for one visit. Tables are read when
// the modules load (hero and upgrade tables are built then), so changing the language reloads the page.
const BZ = window.BZ;
BZ.STR = BZ.STR || {};
BZ.LANGS = [['en', 'English'], ['vi', 'Tiếng Việt']];
const KEY = 'blockadez.lang'; const known = (l) => BZ.LANGS.some((x) => x[0] === l);
let saved = null; try { saved = localStorage.getItem(KEY); } catch {}
BZ.lang = known(BZ.params.lang) ? BZ.params.lang : known(saved) ? saved : 'en';
BZ.t = (key, vals) => {
  let s = (BZ.STR[BZ.lang] || {})[key]; if (s === undefined) s = (BZ.STR.vi || {})[key]; if (s === undefined) return key;
  return vals ? s.replace(/\{(\d+)\}/g, (m, i) => (vals[i] === undefined || vals[i] === null ? '' : vals[i])) : s;
};
// numbers the way the language writes them (1,250 / 1.250)
BZ.num = (n) => Number(n).toLocaleString(BZ.lang === 'vi' ? 'vi-VN' : 'en-US');
BZ.setLang = (l) => {
  if (!known(l)) return; try { localStorage.setItem(KEY, l); } catch {}
  if (l === BZ.lang) return;
  const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.toString());
};
// the page's own text: fill every <t-x> and translated attribute under a root
BZ.applyStatic = (root = document) => {
  for (const el of root.querySelectorAll('t-x[k]')) el.innerHTML = BZ.t(el.getAttribute('k'));
  for (const at of ['title', 'placeholder', 'aria-label']) for (const el of root.querySelectorAll('[data-t-' + at + ']')) el.setAttribute(at, BZ.t(el.getAttribute('data-t-' + at)));
  document.documentElement.lang = BZ.lang;
};
