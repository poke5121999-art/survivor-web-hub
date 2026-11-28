// Main menu (logo + CONTINUE / NEW GAME / LOAD / SETTINGS), save-slot cards, settings, pause and confirm dialogs.
// Labels come from the game's own text table (mainmenu.*, pause.*, settings.*).
import { T } from '../sim/i18n.js';
import { Num } from '../sim/economy.js';
import { Save } from '../save.js';

const UI = './art/ui/';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Menu {
  constructor(root, h) { this.root = root; this.h = h; this.view = null; }   // h: {start(slot, fresh), sfx(name), settings(s), resume(), quitToMenu()}
  clear() { this.root.innerHTML = ''; this.view = null; }
  click(el, fn) { el.addEventListener('click', (e) => { e.stopPropagation(); this.h.sfx('UiClick'); fn(e); }); }

  main() {
    this.view = 'main';
    const meta = Save.meta(), last = meta.last >= 0 && Save.read(meta.last) ? meta.last : -1;
    const any = [0, 1, 2].some(i => Save.read(i));
    this.root.innerHTML = `<div id="menu"><img class="logo" src="${UI}mm_logo.webp" alt="SHRED A BILLION">
      ${last >= 0 ? `<button class="mitem" id="mContinue">${esc(T('mainmenu.continue'))}</button>` : ''}
      <button class="mitem" id="mNew">${esc(T('mainmenu.newgame'))}</button>
      <button class="mitem${any ? '' : ' dis'}" id="mLoad">${esc(T('mainmenu.slots.load'))}</button>
      ${this.h.coop ? `<button class="mitem" id="mCoop">${esc(T('net.menu.title'))}</button>` : ''}
      <button class="mitem" id="mSet">${esc(T('settings.title'))}</button>
      <button class="mitem" id="mAch">${esc(T('mainmenu.achievements'))}</button>
      <a class="mitem" style="text-decoration:none" href="../../index.html" id="mBack">← Hub</a>
      <div id="mSub"></div></div>`;
    const $ = (id) => this.root.querySelector('#' + id);
    if (last >= 0) this.click($('mContinue'), () => this.h.start(last, false));
    this.click($('mNew'), () => this.slots('new'));
    if (any) this.click($('mLoad'), () => this.slots('load'));
    if (this.h.coop) this.click($('mCoop'), () => this.h.coop());
    this.click($('mSet'), () => this.settings(() => this.main()));
    this.click($('mAch'), () => this.h.achievements(() => this.main()));
  }

  slotText(i) {
    const s = Save.summary(i);
    if (!s) return { h: T('mainmenu.slot', i + 1), d: T('mainmenu.slot.empty'), empty: true };
    const d = new Date(s.savedAt);
    return { h: T('mainmenu.slot', i + 1), d: `${Num.money(s.dollars || 0)} · ${T('hud.level_short', s.level || 1)}<br>${Num.time(s.played || 0)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}`, empty: false };
  }
  slots(mode) {
    const sub = this.root.querySelector('#mSub');
    sub.innerHTML = `<div class="small" style="margin-top:10px">${esc(T(mode === 'new' ? 'mainmenu.slots.new.sub' : 'mainmenu.slots.load.sub'))}</div><div class="slots">${[0, 1, 2].map(i => {
      const t = this.slotText(i);
      if (mode === 'load' && t.empty) return '';
      return `<div class="slotCard" data-i="${i}">${t.empty ? '' : `<button class="x" data-x="${i}">✕</button>`}<div class="h">${esc(t.h)}</div><div class="d">${t.empty ? esc(t.d) : t.d}</div></div>`;
    }).join('')}</div>`;
    sub.querySelectorAll('.slotCard').forEach(c => this.click(c, (e) => {
      const i = +c.dataset.i;
      if (e.target.dataset.x != null) {
        this.confirm(T('mainmenu.delete.title'), T('mainmenu.delete.body'), T('mainmenu.delete.yes'), T('mainmenu.delete.no'), () => { Save.clear(i); this.main(); this.slots(mode); }, () => { this.main(); this.slots(mode); });
        return;
      }
      if (mode === 'new' && !this.slotText(i).empty) {
        this.confirm(T('mainmenu.overwrite.title'), T('mainmenu.overwrite.body'), T('mainmenu.overwrite.yes'), T('mainmenu.overwrite.no'), () => this.h.start(i, true), () => { this.main(); this.slots(mode); });
        return;
      }
      this.h.start(i, mode === 'new');
    }));
  }

  confirm(title, body, yes, no, onYes, onNo) {
    this.root.insertAdjacentHTML('beforeend', `<div class="screen" id="confirm"><div class="panel" style="max-width:min(90vw,520px);padding:22px;text-align:center">
      <div class="ptitle" style="position:static;transform:none;margin-bottom:10px">${esc(title)}</div><div style="margin-bottom:16px">${esc(body)}</div>
      <button class="buyBig sbtn" id="cYes">${esc(yes)}</button> <button class="buyBig sbtn off" id="cNo">${esc(no)}</button></div></div>`);
    const box = this.root.querySelector('#confirm');
    this.click(box.querySelector('#cYes'), () => { box.remove(); onYes(); });
    this.click(box.querySelector('#cNo'), () => { box.remove(); onNo && onNo(); });
  }

  settings(back) {
    this.view = 'settings';
    const s = Save.settings();
    const row = (id, label, min, max, step, v, fmt) => `<div class="setRow"><span style="flex:1">${esc(T(label))}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><span id="${id}V" style="width:3em;text-align:right">${fmt(v)}</span></div>`;
    const pct = (v) => Math.round(v * 100) + '%';
    this.root.innerHTML = `<div class="screen"><div class="panel" style="width:min(92vw,620px);max-height:92vh;overflow-y:auto;padding:24px 26px">
      <div class="ptitle">${esc(T('settings.title'))}</div>
      <button class="pclose sbtn" id="sClose">✕</button>
      <div style="margin-top:14px">
      <div class="setRow"><span style="flex:1">${esc(T('settings.gameplay.language.label'))}</span><select id="sLang"><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
      ${row('sMaster', 'settings.row.master_volume', 0, 1, 0.05, s.master, pct)}
      ${row('sMusic', 'settings.row.music_volume', 0, 1, 0.05, s.music, pct)}
      ${row('sSfx', 'settings.row.sfx_volume', 0, 1, 0.05, s.sfx, pct)}
      ${row('sSens', 'settings.row.mouse_sensitivity', 0.2, 3, 0.05, s.sens, (v) => (+v).toFixed(2) + '×')}
      ${row('sFov', 'settings.row.fov', 60, 100, 1, s.fov, (v) => v + '°')}
      <div class="setRow"><span style="flex:1">${esc(T('settings.row.quality'))}</span><select id="sQual">${['auto', 'low', 'medium', 'high'].map(q => `<option value="${q}">${esc(T('settings.quality.' + q))}</option>`).join('')}</select></div>
      <div class="setRow"><span style="flex:1">${esc(T('settings.row.show_crosshair'))}</span><input type="checkbox" id="sCross" ${s.crosshair ? 'checked' : ''}></div>
      <div class="setRow"><span style="flex:1">${esc(T('settings.row.invert_y'))}</span><input type="checkbox" id="sInvY" ${s.invertY ? 'checked' : ''}></div>
      <div class="setRow"><span style="flex:1">${esc(T('settings.row.show_hud'))}</span><input type="checkbox" id="sHud" ${s.hud !== false ? 'checked' : ''}></div>
      <div class="setRow"><span style="flex:1">${esc(T('settings.row.show_fps'))}</span><input type="checkbox" id="sFps" ${s.showFps ? 'checked' : ''}></div>
      <div class="setRow"><span style="flex:1">${esc(T('settings.row.gameplay_run_timer'))}</span><input type="checkbox" id="sTimer" ${s.runTimer ? 'checked' : ''}></div>
      ${this.voiceRows(s, row, pct)}
      </div></div></div>`;
    const $ = (id) => this.root.querySelector('#' + id);
    $('sLang').value = s.lang || 'vi'; $('sQual').value = s.quality || 'auto';
    const apply = () => {
      const n = { ...s, lang: $('sLang').value, master: +$('sMaster').value, music: +$('sMusic').value, sfx: +$('sSfx').value, sens: +$('sSens').value, fov: +$('sFov').value,
        quality: $('sQual').value, crosshair: $('sCross').checked, invertY: $('sInvY').checked, hud: $('sHud').checked, showFps: $('sFps').checked, runTimer: $('sTimer').checked,
        voiceMode: +$('sVMode').value, voiceInputGain: +$('sVMic').value, voiceVadThreshold: +$('sVThr').value, voiceGlobal: $('sVRange').value === '1', voiceVolume: +$('sVVol').value };
      for (const [id, f] of [['sMaster', pct], ['sMusic', pct], ['sSfx', pct], ['sSens', (v) => (+v).toFixed(2) + '×'], ['sFov', (v) => v + '°'], ['sVMic', pct], ['sVThr', pct], ['sVVol', pct]]) $(id + 'V').textContent = f($(id).value);
      Object.assign(s, n); Save.setSettings(s); this.h.settings(s);
    };
    this.root.querySelectorAll('input,select').forEach(el => el.addEventListener('input', apply));
    $('sLang').addEventListener('change', () => { apply(); this.settings(back); });
    this.click($('sClose'), () => back());
    this.voiceMeter();
  }

  // VOICE CHAT section (rules/voice.md N): mode, mic volume + meter, open-mic threshold + meter and marker, hear players,
  // voice volume. Note: "For co-op" outside a session, "Not available right now" without WebCodecs Opus or a mic.
  voiceRows(s, row, pct) {
    const v = window.__voice;
    const can = typeof AudioEncoder !== 'undefined' && typeof AudioDecoder !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const note = v && v.note ? v.note() : can ? 'settings.voice.note.coop' : 'settings.voice.note.unavailable';
    const dis = note === 'settings.voice.note.unavailable' ? ' dis' : '';
    const opt = (val, key, cur) => `<option value="${val}"${val === cur ? ' selected' : ''}>${esc(T(key))}</option>`;
    const mode = s.voiceMode === undefined ? 1 : s.voiceMode | 0, thr = s.voiceVadThreshold ?? 0.3;
    const r = (id, label, min, max, step, val) => row(id, label, min, max, step, val, pct).replace('class="setRow"', `class="setRow${dis}"`);
    return `<div class="setRow vsec"><span style="flex:1">${esc(T('settings.section.voice_chat'))}</span>${note ? `<span class="vnote" id="sVNote">${esc(T(note))}</span>` : ''}</div>
      <div class="setRow${dis}"><span style="flex:1">${esc(T('settings.row.voice_mode'))}</span><select id="sVMode">${opt(0, 'settings.voice.off', mode)}${opt(1, 'settings.voice.ptt', mode)}${opt(2, 'settings.voice.open_mic', mode)}</select></div>
      ${r('sVMic', 'settings.row.voice_mic_volume', 0, 2, 0.05, s.voiceInputGain ?? 1)}
      <div class="vmeter" id="sVMicM"><b></b></div>
      ${r('sVThr', 'settings.row.voice_threshold', 0, 1, 0.01, thr)}
      <div class="vmeter" id="sVThrM"><b></b><i style="left:${(thr * 100).toFixed(1)}%"></i></div>
      <div class="setRow${dis}"><span style="flex:1">${esc(T('settings.row.voice_range'))}</span><select id="sVRange">${opt(0, 'settings.voice.directional', s.voiceGlobal ? 1 : 0)}${opt(1, 'settings.voice.centered', s.voiceGlobal ? 1 : 0)}</select></div>
      ${row('sVVol', 'settings.row.voice_volume', 0, 1, 0.05, s.voiceVolume ?? 1, pct)}`;
  }
  // live level meter (LocalLevel) while the settings screen is open
  voiceMeter() {
    const a = this.root.querySelector('#sVMicM b'), b = this.root.querySelector('#sVThrM b'), mk = this.root.querySelector('#sVThrM i'), thr = this.root.querySelector('#sVThr');
    if (!a) return;
    const step = () => {
      if (!a.isConnected) return;
      const v = window.__voice, lv = v && v.meter ? v.meter() : 0;
      a.style.width = b.style.width = (lv * 100).toFixed(1) + '%';
      b.style.background = lv >= +thr.value ? '#3ddc6a' : '#8a93b8';
      mk.style.left = (+thr.value * 100).toFixed(1) + '%';
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  pause() {
    this.view = 'pause';
    this.root.innerHTML = `<div class="screen" id="pauseScreen"><div class="panel" style="width:min(80vw,420px);padding:26px;text-align:center">
      <div class="ptitle">${esc(T('pause.title'))}</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
      <button class="buyBig sbtn" id="pResume">${esc(T('pause.resume'))}</button>
      <button class="buyBig sbtn off" id="pSet">${esc(T('pause.settings'))}</button>
      <button class="buyBig sbtn off" id="pStats">${esc(T('pause.stats'))}</button>
      <button class="buyBig sbtn off" id="pAch">${esc(T('pause.achievements'))}</button>${this.h.hasWardrobe && this.h.hasWardrobe() ? `<button class="buyBig sbtn off" id="pWard">${esc(T('wardrobe.prompt'))}</button>` : ''}
      <button class="buyBig sbtn off" id="pStuck">${esc(T('pause.stuck'))}</button>
      ${this.h.spending && this.h.spending() ? `<button class="buyBig sbtn off" id="pSpend">${esc(T(this.h.spending().hostOnly ? 'net.spending.host' : 'net.spending.everyone'))}</button>` : ''}
      ${this.h.coopInfo && this.h.coopInfo() ? `<button class="buyBig sbtn off" id="pNet">${esc(T(this.h.coopInfo().me === 0 ? 'net.stop.yes' : 'net.ui.pausenet.leave.label'))}</button>` : ''}
      <button class="buyBig sbtn off" id="pMenu">${esc(T('pause.mainmenu'))}</button></div>${this.h.coopPlayers ? this.h.coopPlayers() : ''}
      <div class="small" style="margin-top:12px">${esc(T('pause.hint.resume'))}</div></div></div>`;
    const $ = (id) => this.root.querySelector('#' + id);
    this.click($('pResume'), () => this.h.resume());
    this.click($('pSet'), () => this.settings(() => this.pause()));
    this.click($('pMenu'), () => this.h.quitToMenu());
    if ($('pNet')) this.click($('pNet'), () => this.h.leaveNet());
    if ($('pSpend')) this.click($('pSpend'), () => { this.h.spending().toggle(); this.pause(); });
    this.click($('pStats'), () => this.h.stats());
    this.click($('pAch'), () => this.h.achievements(() => this.pause()));
    if ($('pWard')) this.click($('pWard'), () => this.h.wardrobe());
    this.click($('pStuck'), () => this.confirm(T('pause.stuck.title'), T('pause.stuck.body'), T('pause.stuck.yes'), T('common.cancel'), () => this.h.stuck(), () => this.pause()));
  }
}
