// localStorage saves: 3 slots like the original (mainmenu.slot*), plus settings. Every access is guarded:
// private windows and blocked storage must not break the game.
const KEY = 'shred-a-billion';
const get = (k) => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
export const Save = {
  slots: 3,
  settings() { return Object.assign({ lang: null, master: 0.8, music: 0.5, sfx: 0.8, sens: 1, fov: 80, quality: 'auto', hud: true, crosshair: true, invertY: false, showFps: false, runTimer: false,
    // voice chat (rules/voice.md C, D, I, J): mode 1 = push to talk, mic volume 1.0, open-mic threshold 0.3, DIRECTIONAL, voice volume 1.0
    voiceMode: 1, voiceInputGain: 1, voiceVadThreshold: 0.3, voiceGlobal: false, voiceVolume: 1 }, get(KEY + '.settings') || {}); },
  setSettings(s) { return put(KEY + '.settings', s); },
  meta() { return get(KEY + '.meta') || { last: -1 }; },
  read(slot) { return get(`${KEY}.slot${slot}`); },
  write(slot, data) { const ok = put(`${KEY}.slot${slot}`, { ...data, savedAt: Date.now() }); if (ok) put(KEY + '.meta', { last: slot }); return ok; },
  clear(slot) { try { localStorage.removeItem(`${KEY}.slot${slot}`); } catch { } },
  summary(slot) { const s = this.read(slot); return s ? { savedAt: s.savedAt, played: s.game.played, dollars: s.game.econ.d, level: s.game.econ.lv, vault: s.vault } : null; },
};
