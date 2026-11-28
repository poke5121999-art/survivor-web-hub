// Co-op text chat (Game.Net.Chat ChatLayer / ChatInputScreen, mb NetUI/ChatLayer; rules/coop.md D.4): the host's last
// lines bottom-left, each fading after fadeDelay 8 s over fadeDuration 1.2 s while the box is closed; the input bar
// (CHAT tag, placeholder, a counter from warnAt 120 of the 140 characters, the Submit/Cancel hint). Client pre-check: 5
// sends per 6 s (chat.cooldown). The open key is UNKNOWN (the input asset is not in the dumps): Enter here [inferred].
import { COLORS } from '../sim/coop.js';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = { fadeDelay: 8, fadeDuration: 1.2, log: 40, warnAt: 120, max: 140, burst: 5, window: 6, plateCollapsed: 0.62, plateOpen: 0.94 };

export class Chat {
  // o: { T, nameOf(id), send(text), onOpen(), onClose() }
  constructor(o) {
    this.o = o; this.lines = []; this.lastId = 0; this.open = false; this.sent = []; this.now = 0;
    const el = this.el = document.createElement('div'); el.id = 'chat'; el.className = 'hidden';
    el.innerHTML = `<div class="log"></div><div class="bar hidden"><span class="tag">${esc(o.T('chat.tag'))}</span><input maxlength="${L.max}" placeholder="${esc(o.T('chat.placeholder'))}" autocomplete="off" spellcheck="false"><em class="cnt"></em></div><div class="hint hidden">${esc(o.T('chat.hint'))}</div>`;
    (document.getElementById('hud') || document.body).appendChild(el);
    this.log = el.querySelector('.log'); this.bar = el.querySelector('.bar'); this.input = el.querySelector('input'); this.cnt = el.querySelector('.cnt'); this.hint = el.querySelector('.hint');
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('input', () => { const n = [...this.input.value].length; this.cnt.textContent = n >= L.warnAt ? `${n}/${L.max}` : ''; });
  }
  show(on) { this.el.classList.toggle('hidden', !on); if (!on && this.open) this.close(); }
  // host lines: [{ id, w (player id), t (text) | k (system key) }]
  feed(lines) {
    for (const l of lines || []) {
      if (l.id <= this.lastId) continue; this.lastId = l.id;
      const nm = this.o.nameOf(l.w), col = COLORS[(l.w | 0) & 3];
      const html = l.k ? `<i>${esc(this.o.T(l.k, nm))}</i>` : `${esc(this.o.T('chat.message', '\u0000', '\u0001')).replace('\u0000', `<b style="color:${col}">${esc(nm)}</b>`).replace('\u0001', esc(l.t))}`;
      const d = document.createElement('div'); d.className = 'ln'; d.innerHTML = html; this.log.appendChild(d);
      this.lines.push({ d, at: this.now });
      while (this.lines.length > L.log) this.lines.shift().d.remove();
    }
  }
  toggle() { if (this.open) this.close(); else this.openBox(); }
  openBox() {
    this.open = true; this.bar.classList.remove('hidden'); this.hint.classList.remove('hidden'); this.el.classList.add('open');
    this.o.onOpen && this.o.onOpen(); setTimeout(() => this.input.focus(), 0);
  }
  close() {
    if (!this.open) return;
    this.open = false; this.input.blur(); this.input.value = ''; this.cnt.textContent = '';
    this.bar.classList.add('hidden'); this.hint.classList.add('hidden'); this.el.classList.remove('open');
    this.o.onClose && this.o.onClose();
  }
  submit() {
    const t = this.input.value.trim();
    if (!t) return this.close();
    this.sent = this.sent.filter(x => this.now - x < L.window);
    if (this.sent.length >= L.burst) { const w = Math.ceil(L.window - (this.now - this.sent[0])); this.cnt.textContent = this.o.T('chat.cooldown', w); return; }
    this.sent.push(this.now); this.o.send(t); this.close();
  }
  notice(text) { const d = document.createElement('div'); d.className = 'ln sys'; d.textContent = text; this.log.appendChild(d); this.lines.push({ d, at: this.now }); }
  update(dt) {
    this.now += dt;
    for (const l of this.lines) {
      const age = this.now - l.at, a = this.open ? 1 : age < L.fadeDelay ? 1 : Math.max(0, 1 - (age - L.fadeDelay) / L.fadeDuration);
      l.d.style.opacity = a.toFixed(3);
    }
    this.log.style.background = this.open ? `rgba(16,18,30,${L.plateOpen * 0.6})` : '';
  }
}
