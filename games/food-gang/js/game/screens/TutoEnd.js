// SceneTutoEnd (EditName + LoadScene, META §14.5): WELCOME TO FOOD GANG, nickname field (15 chars, IsNameAllowed),
// CONTINUE -> the first real match through SceneLoadingGame (the menu is skipped).
import { Screen } from './base.js';
import { T } from '../text.js';

export function bindNameField(screen, field) {
  const { app } = screen;
  if (!field) return null;
  if (field.setValue) field.setValue(app.profile.name);
  field.onEndEdit = (v) => {
    const r = app.meta.setName(app.profile, v);
    if (!r.ok) { app.toast('info.nickname.notallowed'); if (field.setValue) field.setValue(app.profile.name); return; }
    app.save();
    if (field.setValue) field.setValue(app.profile.name);
  };
  return field;
}

export class TutoEndScreen extends Screen {
  constructor(app) { super(app, 'SceneTutoEnd', 0); }

  async init() {
    const f = this.fields('EditName');
    this.field = bindNameField(this, this.ref(f.m_inputField));
    const tx = this.field && this.field.fields && this.ref(this.field.fields.m_TextComponent);
    if (tx && !this.field.setValue) tx.setText(this.app.profile.name);
    this.on('Load', () => this.continue());
    this.on('DisplayPanelReward', () => {});
    if (this.field && this.field.focus && this.fields('EditName').m_autoFocus) setTimeout(() => { if (!this.closed && this.app.screens.at(-1) === this) try { this.field.focus(); } catch { /* no input yet */ } }, 300);
  }

  async continue() {
    // a pending edit is committed first (the field's end edit runs before the button's click in uGUI)
    if (this.field && this.field.value !== undefined && this.field.value !== this.app.profile.name && this.field.onEndEdit) this.field.onEndEdit(this.field.value);
    this.app.audio.sfx('Play');
    this.result = 'continue';
    this.close();
  }

  debug() { return { name: this.app.profile.name, field: this.field ? this.btnPos(this.field.node) : null, continue: this.btnPos(this.find('Button_Continue')), title: T('title.tuto') }; }
}
