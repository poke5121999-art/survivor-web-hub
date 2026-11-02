// SceneSettings (Settings, META §16): nickname, SOUND EFFECTS / MUSIC / HAPTIC FEEDBACK yes-no buttons (AudioMute,
// VibrationMute: button_menu_upgrade on, button_menu_red off), FPS 60 <-> 120, Privacy / Terms / Discord links,
// Delete Save (SceneDelete), version. Restore Purchases is destroyed on Android and has nothing to restore on the web.
// The game picks the language from the system only; the web build adds a LANGUAGE button cloned from Terms of Use
// that cycles the 13 original languages [ĐỀ XUẤT].
import { Screen } from './base.js';
import { T, LANGUAGES, getLanguage, setLanguage } from '../text.js';
import { bindNameField } from './TutoEnd.js';


export class SettingsScreen extends Screen {
  constructor(app) { super(app, 'SceneSettings', 0); }

  async init() {
    const { app } = this;
    const st = app.settings;
    this.on('Close', () => this.closeSettings());
    this.mutes = [];
    for (const n of this.inst.nodes) {
      const am = n.script('AudioMute'), vm = n.script('VibrationMute');
      if (am) this.mutes.push({ n, f: am.fields, kind: am.fields.m_type === 1 ? 'music' : 'sfx' });
      if (vm) { if (!st.canVibrate) n.setActive(false); else this.mutes.push({ n, f: vm.fields, kind: 'vibration' }); }
    }
    // SCREEN SHAKE [ĐỀ XUẤT]: a copy of the HAPTIC FEEDBACK button next to it (shown on every device)
    const vb = this.find('Button_Vibration');
    if (vb) {
      const c = this.clone(vb);
      const kids = vb.parent.children; kids.splice(kids.indexOf(c.root), 1); kids.splice(kids.indexOf(vb) + 1, 0, c.root);
      c.root.name = 'Button_ScreenShake';
      c.root.setActive(true);
      const vm = c.root.script('VibrationMute');
      if (vm) { vm.enabled = false; this.mutes.push({ n: c.root, f: vm.fields, kind: 'shake', inst: c }); }
      const b = c.root.get('Button'); if (b) b.onClickResolved = [];
      const label = c.root.findDeep('Label');
      const loc = label && label.script('Localize'); if (loc) loc.fields.m_key = '';
      this.shakeLabel = label && label.inChildren('Text')[0];
      this.shakeBtn = c.root;
    }
    for (const m of this.mutes) this.onNode(m.n, () => this.switchMute(m));
    this.on('SwitchFPS', () => { st.setFps(st.fps !== 60 ? 60 : 120); this.updateDisplay(); });
    this.on('Open', (o, b) => { const f = b.node.script('OpenUrl'); if (f) window.open(f.fields.m_urlAndroid, '_blank', 'noopener'); });
    this.on('Reset', () => {});
    const rp = this.find('Button_RestorePurchases'); if (rp) rp.setActive(false);
    this.on('OpenDelete', async () => { const s = await app.popup(DeleteScreen); await s.done(); });
    const field = this.script('TMP_InputField');
    this.field = bindNameField(this, field);
    const ver = this.script('VersionDisplay');
    if (ver) this.text(ver.fields.versionText, 'Version 2.2.4 web ' + (document.documentElement.dataset.rev || ''));
    // LANGUAGE: a copy of the Terms button in the bottom row, in the seat of the Restore Purchases button
    const src = this.find('Button_TermsOfUse');
    if (src) {
      const c = this.clone(src);
      if (rp && rp.parent) { const kids = rp.parent.children; kids.splice(kids.indexOf(c.root), 1); kids.splice(kids.indexOf(rp), 0, c.root); }
      this.langBtn = c.root;
      this.langBtn.name = 'Button_Language';
      const ou = this.langBtn.script('OpenUrl'); if (ou) ou.enabled = false;
      const b = this.langBtn.get('Button'); if (b) b.onClickResolved = [];
      const loc = this.langBtn.findDeep('Name') && this.langBtn.findDeep('Name').script('Localize'); if (loc) loc.fields.m_key = '';
      this.onNode(this.langBtn, () => this.nextLanguage());
    }
    this.updateDisplay();
  }

  switchMute(m) {
    const st = this.app.settings;
    if (m.kind === 'music') st.setMusicMute(!st.musicMute);
    else if (m.kind === 'sfx') st.setSfxMute(!st.sfxMute);
    else if (m.kind === 'shake') st.setScreenShake(!st.screenShake);
    else { st.setVibrationMute(!st.vibrationMute); st.vibrate(30); }
    this.updateDisplay();
  }

  // AudioMute.UpdateDisplay: sprite + general.yes / general.no
  updateDisplay() {
    const st = this.app.settings;
    for (const m of this.mutes) {
      const muted = m.kind === 'music' ? st.musicMute : m.kind === 'sfx' ? st.sfxMute : m.kind === 'shake' ? !st.screenShake : st.vibrationMute;
      // the copy's field refs resolve inside the copy
      const ref = (r) => (m.inst ? m.inst.ref(r) : this.ref(r));
      const img = ref(m.f.m_image); if (img) img.setSprite(muted ? m.f.m_off : m.f.m_on);
      const tx = ref(m.f.m_text); if (tx && tx.setText) tx.setText(T(muted ? 'general.no' : 'general.yes'));
    }
    if (this.shakeLabel) this.shakeLabel.setText(T('web.settings.shake'));
    const fps = this.script('FPSSettings'); if (fps) this.text(fps.fields.m_text, String(st.fps));
    if (this.langBtn) {
      const id = getLanguage ? getLanguage() : 'English';
      const L = (LANGUAGES || []).find((l) => l.id === id);
      const name = this.langBtn.inChildren('Text')[0];
      if (name) name.setText(L ? L.name : id);
    }
  }

  async nextLanguage() {
    const list = LANGUAGES || [];
    const i = list.findIndex((l) => l.id === getLanguage());
    const next = list[(i + 1) % list.length];
    if (!next || this.switching) return;
    this.switching = true;
    try { await setLanguage(next.id); } finally { this.switching = false; }
    this.updateDisplay();
  }

  // Settings.Close: the name field commits before the popup closes
  closeSettings() {
    const f = this.field;
    if (f && f.value !== undefined && f.value !== this.app.profile.name && f.onEndEdit) f.onEndEdit(f.value);
    this.close();
  }

  debug() {
    const st = this.app.settings;
    return { music: !st.musicMute, sfx: !st.sfxMute, fps: st.fps, shake: st.screenShake, shakeButton: this.btnPos(this.shakeBtn), language: getLanguage(), name: this.app.profile.name,
      languageButton: this.btnPos(this.langBtn), field: this.field ? this.btnPos(this.field.node) : null };
  }
}

// SceneDelete (PopupDelete): No closes; Delete -> Game.ResetUserAsync (new UserData, PlayerPrefs kept) -> first launch
export class DeleteScreen extends Screen {
  constructor(app) { super(app, 'SceneDelete', 0); }
  async init() {
    this.on('Close', () => this.close());
    this.on('Reset', () => {
      const { app } = this;
      try { app.store.delete(); } catch { /* storage blocked */ }
      app.profile = null;
      location.reload();
    });
  }
}
