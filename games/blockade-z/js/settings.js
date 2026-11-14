// The Settings popup: five tabs of options, each with a default it can go back to. A change is applied and saved at once
// (the language reloads the page). It opens from the title screen and from Pause; Esc closes it.
// Keys can be rebound: a capture-phase listener turns the key the player chose back into the code the game listens for,
// so no handler elsewhere has to know about it.
const BZ = window.BZ;
const T = (k, v) => BZ.t('set.' + k, v);
const pct = (x) => Math.round(x * 100) + '%';

// [id, kind, options]: kind range -> [min, max, step, format]; select -> [[value, label key], ...]; toggle
const TABS = [
  ['general', [['lang', 'lang'], ['view', 'select', [['fp', 'view.fp'], ['tp', 'view.tp']]], ['showDmg', 'toggle'], ['showFps', 'toggle']]],
  ['graphics', [['quality', 'select', [['auto', 'q.auto'], ['low', 'q.low'], ['medium', 'q.medium'], ['high', 'q.high']]], ['resScale', 'range', [0.5, 1, 0.05, pct]],
    ['fpsCap', 'select', [[0, 'fps.off'], [30, 'fps.30'], [60, 'fps.60'], [120, 'fps.120']]], ['shadows', 'toggle'], ['bloom', 'toggle'], ['shake', 'range', [0, 1, 0.05, pct]],
    ['fxDensity', 'range', [0.3, 1, 0.05, pct]], ['fov', 'range', [65, 100, 1, (x) => Math.round(x) + '°']]]],
  ['audio', [['volume', 'range', [0, 1, 0.05, pct]], ['music', 'range', [0, 1, 0.05, pct]], ['sfx', 'range', [0, 1, 0.05, pct]], ['voice', 'range', [0, 1, 0.05, pct]], ['muteBlur', 'toggle']]],
  ['controls', [['sens', 'range', [0.2, 3, 0.05, (x) => x.toFixed(2)]], ['adsSens', 'range', [0.2, 2, 0.05, (x) => x.toFixed(2)]], ['invertY', 'toggle'], ['adsToggle', 'toggle'], ['keys', 'keys']]],
  ['interface', [['hudScale', 'range', [0.8, 1.2, 0.05, pct]], ['xhair', 'select', [['cross', 'xh.cross'], ['dot', 'xh.dot'], ['circle', 'xh.circle'], ['tee', 'xh.tee']]],
    ['xhairColor', 'select', [['white', 'col.white'], ['green', 'col.green'], ['yellow', 'col.yellow'], ['cyan', 'col.cyan'], ['magenta', 'col.magenta']]],
    ['touchOpacity', 'range', [0.3, 1, 0.05, pct]], ['touchScale', 'range', [0.8, 1.3, 0.05, pct]], ['colorBlind', 'toggle']]],
];
// what can be rebound: [action, the code the game listens for]
BZ.KEY_ACTIONS = [['fwd', 'KeyW'], ['back', 'KeyS'], ['left', 'KeyA'], ['right', 'KeyD'], ['jump', 'Space'], ['sprint', 'ShiftLeft'], ['reload', 'KeyR'], ['skill1', 'KeyF'], ['skill2', 'KeyC'],
  ['ult', 'KeyQ'], ['view', 'KeyV'], ['inspect', 'KeyT'], ['use', 'KeyE'], ['pause', 'KeyP']];
const XCOL = { white: '#ffffff', green: '#5cff6a', yellow: '#ffe14a', cyan: '#4ae8ff', magenta: '#ff5cf0' };
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift R').replace('ControlLeft', 'Ctrl').replace('AltLeft', 'Alt').replace(/^Arrow/, '');

BZ.makeSettings = (G) => {
  const S = G.settings; const DEF = BZ.SETTINGS_DEF; const el = document.createElement('section'); el.id = 'settings';
  let tab = 'general'; let binding = null; // the action waiting for a key
  const bound = (a) => (S.keys && S.keys[a]) || BZ.KEY_ACTIONS.find((x) => x[0] === a)[1];
  const clash = (a) => BZ.KEY_ACTIONS.filter((x) => x[0] !== a && bound(x[0]) === bound(a)).map((x) => T('key.' + x[0]));

  // ---- applying ----
  function apply() {
    const st = document.documentElement.style; const b = document.body.classList;
    st.setProperty('--hud-scale', S.hudScale); st.setProperty('--touch-opacity', S.touchOpacity); st.setProperty('--touch-scale', S.touchScale); st.setProperty('--xhair', XCOL[S.xhairColor] || XCOL.white);
    for (const k of ['cross', 'dot', 'circle', 'tee']) b.toggle('xh-' + k, S.xhair === k); b.toggle('cb', !!S.colorBlind); b.toggle('showfps', !!S.showFps);
    G.events.emit('settings', S);
  }
  // sound stops while the window is out of focus, if asked
  addEventListener('blur', () => { if (S.muteBlur) G.audio.setVolume(0); }); addEventListener('focus', () => G.audio.setVolume(S.volume));
  // the frame counter
  const fps = document.createElement('div'); fps.id = 'fps'; document.body.appendChild(fps); let fAcc = 0; let fN = 0; let fT = performance.now();
  (function count() { requestAnimationFrame(count); fN++; const now = performance.now(); if (now - fT >= 500) { fAcc = Math.round(fN * 1000 / (now - fT)); fN = 0; fT = now; if (S.showFps) fps.textContent = fAcc + ' FPS'; } })();

  // ---- rebinding (the listener itself is registered when this file loads: see the end of it) ----
  KB.S = S; KB.isOpen = () => el.classList.contains('on'); KB.close = () => close();
  KB.bind = (e) => { if (!binding) return false; if (e.type === 'keydown') { if (e.code !== 'Escape') { S.keys = { ...(S.keys || {}) }; const d = BZ.KEY_ACTIONS.find((x) => x[0] === binding)[1]; if (e.code === d) delete S.keys[binding]; else S.keys[binding] = e.code; BZ.store.save(S); } binding = null; render(); } return true; };

  // ---- the popup ----
  const row = (id, body, isDef) => `<div class="set-row" data-id="${id}"><label>${T('o.' + id)}<small>${T('h.' + id)}</small></label><div class="set-ctl">${body}</div><button class="set-def" data-def="${id}" ${isDef ? 'disabled' : ''} title="${T('default')}">↺</button></div>`;
  function render() {
    const items = TABS.find((t) => t[0] === tab)[1]; let h = '';
    for (const [id, kind, o] of items) {
      const v = S[id]; const isDef = id === 'lang' ? BZ.lang === 'en' : id === 'keys' ? !Object.keys(S.keys || {}).length : v === DEF[id];
      if (kind === 'range') h += row(id, `<input type="range" data-set="${id}" min="${o[0]}" max="${o[1]}" step="${o[2]}" value="${v}"><output>${o[3](+v)}</output>`, isDef);
      else if (kind === 'toggle') h += row(id, `<button class="set-tog ${v ? 'on' : ''}" data-tog="${id}" role="switch" aria-checked="${!!v}"><i></i><span>${T(v ? 'on' : 'off')}</span></button>`, isDef);
      else if (kind === 'select') h += row(id, `<div class="set-seg">${o.map(([val, key]) => `<button data-pick="${id}" data-val="${val}" class="${String(v) === String(val) ? 'on' : ''}">${T(key)}</button>`).join('')}</div>`, isDef);
      else if (kind === 'lang') h += row(id, `<div class="set-seg">${BZ.LANGS.map(([val, name]) => `<button data-lang="${val}" class="${BZ.lang === val ? 'on' : ''}">${name}</button>`).join('')}</div>`, isDef);
      else if (kind === 'keys') h += `<div class="set-keys"><div class="set-keys-h"><b>${T('o.keys')}</b><small>${T('h.keys')}</small><button class="set-def" data-def="keys" ${isDef ? 'disabled' : ''} title="${T('default')}">↺</button></div>` +
        BZ.KEY_ACTIONS.map(([a]) => { const c = clash(a); return `<div class="set-key ${c.length ? 'clash' : ''}"><span>${T('key.' + a)}</span><button data-bind="${a}" class="${binding === a ? 'wait' : ''}">${binding === a ? T('press') : keyName(bound(a))}</button>${c.length ? `<em>${T('clash', [c.join(', ')])}</em>` : ''}</div>`; }).join('') + '</div>';
    }
    el.innerHTML = `<div class="set-card" role="dialog" aria-label="${T('title')}"><header><h2>${T('title')}</h2><button class="set-x" data-close aria-label="${T('close')}">✕</button></header>
      <nav>${TABS.map(([t]) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${T('tab.' + t)}</button>`).join('')}</nav><div class="set-body">${h}</div>
      <footer><button class="btn ghost" data-reset="tab">${T('resetTab')}</button><button class="btn ghost" data-reset="all">${T('resetAll')}</button><button class="btn" data-close>${T('done')}</button></footer></div>`;
  }
  function set(id, v) { S[id] = v; apply(); }
  function reset(ids) { for (const id of ids) { if (id === 'lang') continue; S[id] = id === 'keys' ? {} : DEF[id]; } apply(); render(); }
  el.addEventListener('input', (e) => { const t = e.target; if (t.dataset.set) { set(t.dataset.set, +t.value); const o = TABS.flatMap((x) => x[1]).find((x) => x[0] === t.dataset.set)[2]; t.nextElementSibling.textContent = o[3](+t.value); t.closest('.set-row').querySelector('.set-def').disabled = +t.value === DEF[t.dataset.set]; } });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) { if (e.target === el) close(); return; } const d = t.dataset; G.audio.play && G.audio.play('click', { gain: 0.5 });
    if (d.tab) { tab = d.tab; binding = null; render(); }
    else if (d.tog) { set(d.tog, !S[d.tog]); render(); }
    else if (d.pick) { const o = TABS.flatMap((x) => x[1]).find((x) => x[0] === d.pick)[2]; set(d.pick, o.find((x) => String(x[0]) === d.val)[0]); render(); }
    else if (d.lang) { BZ.store.save(S); BZ.setLang(d.lang); }
    else if (d.bind) { binding = binding === d.bind ? null : d.bind; render(); }
    else if (d.def) { if (d.def === 'lang') BZ.setLang('en'); else reset([d.def]); }
    else if (d.reset) reset(d.reset === 'tab' ? TABS.find((x) => x[0] === tab)[1].map((x) => x[0]) : TABS.flatMap((x) => x[1]).map((x) => x[0]));
    else if ('close' in d) close();
  });
  // the card pops in when the popup opens, not each time a tab or an option redraws it
  let popT = 0;
  function open(t) { if (t) tab = t; binding = null; render(); el.classList.add('on', 'pop'); clearTimeout(popT); popT = setTimeout(() => el.classList.remove('pop'), 260); }
  function close() { binding = null; el.classList.remove('on'); BZ.store.save(S); }
  document.body.appendChild(el);
  return { open, close, apply, isOpen: () => el.classList.contains('on'), bound, tabs: TABS.map((t) => t[0]) };
};

// The key translator. It is registered here, before the game attaches any key handler, and in the capture phase, so it sees
// every key first: a key the player bound to an action is re-sent as the code the game listens for, and a key whose own
// action has moved elsewhere is swallowed.
const KB = { S: null, isOpen: () => false, close() {}, bind: () => false };
const made = new WeakSet();
function translate(e) {
  if (made.has(e) || !KB.S) return;
  if (KB.bind(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (KB.isOpen()) { if (e.type === 'keydown' && e.code === 'Escape') { e.stopImmediatePropagation(); KB.close(); } return; }
  const keys = KB.S.keys || {}; let to = null; let taken = false;
  for (const [a, d] of BZ.KEY_ACTIONS) { const k = keys[a]; if (k && k === e.code) to = d; if (k && k !== d && d === e.code) taken = true; }
  if (to === e.code) return; // bound to itself
  if (to) { e.stopImmediatePropagation(); const ev = new KeyboardEvent(e.type, { code: to, key: e.key, repeat: e.repeat, bubbles: true, cancelable: true }); made.add(ev); (e.target || window).dispatchEvent(ev); if (ev.defaultPrevented) e.preventDefault(); }
  else if (taken) e.stopImmediatePropagation(); // this key's own action has moved to another key
}
addEventListener('keydown', translate, true); addEventListener('keyup', translate, true);
