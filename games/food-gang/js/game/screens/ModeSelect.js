// Play -> mode picker [ĐỀ XUẤT] on the original ScenePrivateConfiguration (the game's only mode chooser, used by the
// party room): GAME MODE cycles Random -> the 7 original modes -> Push / Defend the Fridge; the title line tells the
// chosen mode's rule; ARENA is hidden (quick play draws the map as in the original); the BOT DIFFICULTY seat becomes
// BATTLE!. Back returns to the menu. The choice is remembered.
import { Screen } from './base.js';
import { T } from '../text.js';
import { modeChoices, savedChoice, saveChoice } from '../modes.js';

export class ModeSelectScreen extends Screen {
  constructor(app) { super(app, 'ScenePrivateConfiguration', 0); }

  async init() {
    const { app } = this;
    this.choices = modeChoices(app.meta.db);
    this.choice = savedChoice(this.choices.length);
    this.result = null;
    const f = this.fields('ScenePrivateConfigurationController');
    this.f = f;
    const arena = this.find('Button_Arena'); if (arena) arena.setActive(false);
    // title: the rule of the chosen mode (the Localize key would put "Battle customization" back)
    const title = this.find('Title');
    const loc = title && title.script('Localize'); if (loc) loc.fields.m_key = '';
    this.title = title && title.inChildren('Text')[0];
    // BOT DIFFICULTY seat -> BATTLE!
    const go = this.find('Button_Difficulty');
    this.goBtn = go;
    if (go) {
      const lab = go.findDeep('Label'); const ll = lab && lab.script('Localize'); if (ll) ll.fields.m_key = '';
      this.goLabel = lab && lab.inChildren('Text')[0];
      // the green button of SceneSettings' YES state (button_menu_upgrade), so BATTLE! reads as the go button
      const img = go.findDeep('On') && go.findDeep('On').get('Image');
      if (img) { await app.ensureSprites(['sprite:button_menu_upgrade']); img.setSprite('sprite:button_menu_upgrade'); }
    }
    this.modeBtn = this.find('Button_Mode');
    this.on('OnClickMode', () => { this.choice = (this.choice + 1) % this.choices.length; saveChoice(this.choice); this.render(); });
    this.on('OnClickDiff', () => { if (this.closed) return; this.result = { choice: this.choice }; this.close(); });
    this.on('OnClickMap', () => {});
    this.on('Close', () => { this.result = null; this.close(); });
    this.render();
  }

  render() {
    const c = this.choices[this.choice];
    this.text(this.f.m_modeText, T(c.text));
    if (this.goLabel) this.goLabel.setText('');
    this.text(this.f.m_diffText, T('game.start'));
    if (this.title) this.title.setText(T(c.desc));
  }

  debug() {
    const c = this.choices[this.choice];
    return { choice: this.choice, mode: T(c.text), desc: T(c.desc), count: this.choices.length,
      modeButton: this.btnPos(this.modeBtn), battleButton: this.btnPos(this.goBtn), back: this.btnPos(this.find('Button_Back')) };
  }
}
