// Last-resort English strings (before data/lang/English.json loads, or if it fails). Real tables: data/lang/<Language>.json, built by tools/build_lang.js from the original text files.
const EN = {
  'title.rank.1': '1st', 'title.rank.2': '2nd', 'title.rank.3': '3rd', 'title.rank.4': '4th',
  'title.respawn': 'BACK IN:', 'title.end.draw': 'DRAW', 'title.end.timeout': 'TIME OUT!', 'title.end.victory': 'VICTORY',
  'title.end.defeat': 'DEFEAT', 'title.ranking.draw': 'DRAW', 'game.ready': 'READY?', 'game.start': 'BATTLE!',
  'mission.dm.2vs2': 'Gang Battle', 'mission.dm.ffa': 'Food Battle', 'mission.kill.ffa': 'Fast Food', 'mission.kill.2vs2': 'Fast Gang',
  'mission.survive.ffa': 'Last Food Standing', 'mission.survive.2vs2': 'Last Gang Standing', 'mission.killboss.1vs3': 'Boss Rush',
  'stage.1': 'Kitchen', 'stage.2': 'Dining table', 'stage.3': 'Pantry', 'info.searching': 'Searching opponents...',
  'info.exit': 'EXIT', 'reward.open.free': 'CLAIM', 'reward.open.ad': 'CLAIM', 'info.playagain': 'PLAY AGAIN',
  'lucky.fridge': 'Lucky fridge!', 'super.lucky.fridge': 'Super Lucky fridge!',
};


// Unity SystemLanguage names, as the original LanguageManager keys its files; native names for the picker
export const LANGUAGES = [
  { id: 'English', name: 'English' }, { id: 'French', name: 'Français' }, { id: 'German', name: 'Deutsch' },
  { id: 'Italian', name: 'Italiano' }, { id: 'Spanish', name: 'Español' }, { id: 'Portuguese', name: 'Português' },
  { id: 'Russian', name: 'Русский' }, { id: 'Turkish', name: 'Türkçe' }, { id: 'Arabic', name: 'العربية' },
  { id: 'Japanese', name: '日本語' }, { id: 'Korean', name: '한국어' }, { id: 'ChineseSimplified', name: '简体中文' },
  { id: 'ChineseTraditional', name: '繁體中文' },
];
const STORE_KEY = 'fg-lang';
const AUTO = { ar: 'Arabic', fr: 'French', de: 'German', it: 'Italian', ja: 'Japanese', ko: 'Korean', pt: 'Portuguese', ru: 'Russian', es: 'Spanish', tr: 'Turkish', en: 'English' };

let assets = null;
let current = 'English';
const tables = new Map();          // id -> { key: text }
const roots = new Set();           // roots handed to localize(), re-localized on a language change
const listeners = new Set();

export function autoLanguage() {
  const l = String((typeof navigator !== 'undefined' && (navigator.languages && navigator.languages[0] || navigator.language)) || 'en');
  const low = l.toLowerCase();
  if (low.startsWith('zh')) return /tw|hk|mo|hant/.test(low) ? 'ChineseTraditional' : 'ChineseSimplified';
  return AUTO[low.split('-')[0]] || 'English';
}

function savedLanguage() {
  try { const v = localStorage.getItem(STORE_KEY); return LANGUAGES.some((x) => x.id === v) ? v : null; } catch (e) { return null; }
}

const load = async (id) => {
  if (!tables.has(id)) tables.set(id, await assets.getJSON(`data/lang/${id}.json`));
  return tables.get(id);
};

// LanguageManager.GetStringForKey: current -> English -> key itself ([X] is replaced by `arg` when given)
export function lookup(k) {
  const v = tables.get(current)?.[k] ?? tables.get('English')?.[k] ?? EN[k];
  return v;
}
export const T = (k, arg) => {
  const v = lookup(k) ?? k;
  return arg === undefined ? v : v.replace('[X]', arg);
};

export async function initText(a) {
  assets = a;
  await load('English');
  const id = savedLanguage() || autoLanguage();
  if (id !== 'English') { try { await load(id); } catch (e) { return current; } }
  current = id;
  return current;
}

export const getLanguage = () => current;

export async function setLanguage(id) {
  if (!LANGUAGES.some((x) => x.id === id)) throw new Error(`language not found: ${id}`);
  if (!assets) throw new Error('text not initialised (initText first)');
  await load(id);
  current = id;
  try { localStorage.setItem(STORE_KEY, id); } catch (e) { /* private mode */ }
  for (const r of [...roots]) { if (r.destroyed) roots.delete(r); else applyLocalize(r); }
  for (const f of [...listeners]) f(id);
  return id;
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyLocalize(root) {
  const st = [root];
  while (st.length) {
    const n = st.pop();
    const l = n.script('Localize');
    if (l && l.fields.m_key) {
      const v = lookup(l.fields.m_key);
      const t = (l.fields.m_text && n.scene ? n.scene.ref(l.fields.m_text) : null) || n.get('Text');
      if (v !== undefined && t && t.setText) t.setText(v);
    }
    for (const c of n.children) st.push(c);
  }
}

// Localize components: the scene text is the designer's placeholder, the key gives the shipped string.
// The root is remembered so a language change re-translates it (destroyed roots are dropped).
export function localize(root) {
  roots.add(root);
  applyLocalize(root);
}
