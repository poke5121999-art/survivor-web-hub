// SceneSystems: only its InfoSystem toast is drawn (popop_notenough banner, Animator "Appear"); the services
// it hosts (ads, IAP, network, save...) are the meta library and the web shell.
import { Screen } from './base.js';

export class SystemsScreen extends Screen {
  constructor(app) { super(app, 'SceneSystems', 95); }

  async init() {
    const info = this.script('InfoSystem');
    this.msg = info ? this.ref(info.fields.m_message) : null;
    this.anim = info ? this.ref(info.fields.m_animator) : null;
    this.bg = this.find('Background');
    this.last = '';
  }

  // InfoSystem.Display: text, UIBack sfx, CrossFade("Appear")
  toast(text) {
    if (!this.msg) return;
    this.last = text;
    this.lastAt = this.engine.realTime;
    this.msg.setText(text);
    this.app.audio.sfx('UIBack');
    if (this.bg) this.bg.setActive(true);
    if (this.anim && this.anim.runtime) this.anim.runtime.crossFade('Appear', 0.05);
    else { clearTimeout(this.tm); this.tm = setTimeout(() => this.bg && this.bg.setActive(false), 2000); }
  }

  debug() { return { toast: this.last, toastAge: this.lastAt ? Math.round((this.engine.realTime - this.lastAt) * 10) / 10 : null }; }
}
