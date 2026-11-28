// Voice chat HUD (rules/voice.md L, M, K): the mic dot beside the hotbar (VoiceMicHud), the mute / denied flash texts,
// the once-per-install first hint (VoiceFirstHint) and the left-edge list of who is talking (the speaking column seen in
// the co-op clip, ~/shred-ref/clips/coop/full_600.png). Sprites are the game's own voice_mic / voice_mic_off.
// On touch screens the mic dot is the hold-to-talk button (port note S.2).
import { COLORS } from '../sim/coop.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// MicDot (mb): fadeSpeed 8, flashSeconds 1.6; FirstHint: delay 2, showSeconds 14
const DOT = { fadeSpeed: 8, flashSeconds: 1.6, ringK: 0.42 };
const HINT = { delay: 2, show: 14 };

export class VoiceUi {
  constructor(root, voice) {
    this.voice = voice; this.root = root;
    this.coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    root.insertAdjacentHTML('beforeend', `<div id="vMic" class="vm-hidden"><div class="ring"></div><div class="disc"><i class="ic"></i></div><b class="k"></b><div class="flash"></div></div>
      <div id="vTalk"></div><div id="vHint" class="hidden"><span class="t"></span><button class="x">✕</button></div>`);
    this.dot = root.querySelector('#vMic'); this.ring = this.dot.querySelector('.ring'); this.keyEl = this.dot.querySelector('.k'); this.flashEl = this.dot.querySelector('.flash');
    this.list = root.querySelector('#vTalk'); this.hint = root.querySelector('#vHint');
    this.alpha = 0; this.lvl = 0; this.flashT = 0; this.state = ''; this.listSig = ''; this.place = 0;
    this.hintWait = 0; this.hintT = -1; this.hintDone = voice.hintFlag(false);
    this.hint.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); this.closeHint(); });
    if (this.coarse) {
      this.dot.classList.add('touch');
      const on = (e) => { e.preventDefault(); e.stopPropagation(); voice.setPtt(true); };
      const off = (e) => { e.stopPropagation(); voice.setPtt(false); };
      this.dot.addEventListener('pointerdown', on); this.dot.addEventListener('pointerup', off); this.dot.addEventListener('pointercancel', off); this.dot.addEventListener('pointerleave', off);
    }
  }
  glyph(a) { return this.coarse ? '🎙' : a === 'VoiceMute' ? '[M]' : '[V]'; }
  // VoiceRules.MicHud
  micState() {
    const v = this.voice;
    if (!v.attached() || v.modeSetting() === 0) return 'hidden';
    if (v.micMuted || !v.available()) return 'muted';
    if (v.modeSetting() === 1) return v.pttHeld ? 'live' : 'ptt';
    return v.localLive() ? 'live' : 'open';
  }
  flash(text, punch) {
    this.flashEl.textContent = text; this.flashT = DOT.flashSeconds;
    this.flashEl.classList.add('on');
    this.dot.animate([{ transform: `scale(${1 + punch})` }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  }
  flashMute(muted) { this.flash(this.voice.T(muted ? 'voice.hud.muted' : 'voice.hud.unmuted'), 0.18); }
  denied() { this.flash(this.voice.T('voice.hud.muted_hint', this.glyph('VoiceMute')), 0.2); }
  pttPressed() { if (this.hintT >= 0) this.closeHint(); }
  closeHint() { this.hintT = -1; this.hint.classList.add('hidden'); this.hint.classList.remove('in'); }
  update(dt) {
    const v = this.voice, st = this.micState();
    // dot: fade at 8/s, ring follows the smoothed local level
    const target = st === 'hidden' ? 0 : 1;
    this.alpha += Math.sign(target - this.alpha) * Math.min(Math.abs(target - this.alpha), DOT.fadeSpeed * dt);
    if (st !== this.state) { this.state = st; this.dot.className = 'vm-' + st + (this.coarse ? ' touch' : ''); this.keyEl.textContent = st === 'ptt' ? this.glyph('PushToTalk') : ''; }
    this.dot.style.opacity = this.alpha.toFixed(3);
    this.dot.style.visibility = this.alpha > 0.01 ? 'visible' : 'hidden';
    this.lvl += (v.meter() - this.lvl) * Math.min(1, dt * 12);
    if (st === 'live') { this.ring.style.transform = `scale(${(1 + this.lvl * DOT.ringK).toFixed(3)})`; this.ring.style.opacity = (this.lvl * 0.5 + 0.25).toFixed(3); }
    else this.ring.style.opacity = '0';
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashEl.classList.remove('on'); }
    // sit right of the hotbar (the clip's mic icon follows slot 4)
    if ((this.place -= dt) <= 0) {
      this.place = 0.5;
      const hb = document.getElementById('hotbar');
      if (hb && hb.offsetParent !== null) { const r = hb.getBoundingClientRect(); this.dot.style.left = `${Math.round(r.right + 10)}px`; this.dot.style.bottom = `${Math.round(innerHeight - r.bottom + (r.height - this.dot.offsetHeight) / 2)}px`; }
    }
    // left-edge list: whoever is talking right now (self included while live)
    const rows = [];
    if (v.attached()) for (let id = 0; id < 4; id++) if (v.talking(id)) rows.push(id);
    const sig = rows.map(id => id + ':' + v.nameOf(id)).join('|');
    if (sig !== this.listSig) {
      this.listSig = sig;
      this.list.innerHTML = rows.map(id => `<div class="vt"><i style="background:${COLORS[id & 3]}"><b></b></i><span>${esc(v.nameOf(id))}</span></div>`).join('');
    }
    this.updateHint(dt);
  }
  // M: once per install, 2 s after voice is active with more than one player, 14 s or until PTT / close
  updateHint(dt) {
    const v = this.voice;
    if (this.hintDone) return;
    const ok = v.attached() && v.together() && v.active;
    if (this.hintT >= 0) {
      this.hintT += dt;
      if (this.hintT > HINT.show || !v.attached()) this.closeHint();
      else this.hint.querySelector('.t').textContent = this.hintText();
      return;
    }
    if (!ok) { this.hintWait = 0; return; }
    if ((this.hintWait += dt) < HINT.delay) return;
    this.hintDone = true; v.hintFlag(true);
    this.hintT = 0; this.hint.querySelector('.t').textContent = this.hintText();
    this.hint.classList.remove('hidden'); requestAnimationFrame(() => this.hint.classList.add('in'));
  }
  hintText() {
    const v = this.voice, m = v.modeSetting();
    if (m === 0) return v.T('voice.hint.off');
    if (m === 2) return v.T('voice.hint.open');
    return v.T('voice.hint.ptt').replace('{hold:PushToTalk}', `${v.T('settings.mode.hold')} ${this.glyph('PushToTalk')}`);
  }
}
