// Local settings (META §16.2/16.4): musicMute / sfxMute / vibrationMute are PlayerPrefs in the game, so they live in
// their own localStorage keys and survive "Delete Save"; FPS (60/120) is UserData.fps, kept in the profile.
const get = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const set = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode */ } };

export class Settings {
  constructor(app) { this.app = app; }
  get musicMute() { return get('musicMute'); }
  get sfxMute() { return get('sfxMute'); }
  get vibrationMute() { return get('vibrationMute'); }
  // VibrationMute.Awake destroys the button when the device cannot vibrate
  // (desktop Chrome has navigator.vibrate but no motor: touch devices only)
  get canVibrate() { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0; }
  get fps() { return (this.app.profile && this.app.profile.settings.fps) || 60; }
  // SCREEN SHAKE (web build) [ĐỀ XUẤT]: camera shake + hit / invincibility flash. Unset = on, unless the system asks
  // for reduced motion. Off: no shake, flashes kept faint.
  get screenShake() {
    try { const v = localStorage.getItem('fg-shake'); if (v === '1' || v === '0') return v === '1'; } catch { /* private mode */ }
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  setScreenShake(v) { set('fg-shake', v); this.apply(); }

  setMusicMute(v) { set('musicMute', v); this.apply(); }
  setSfxMute(v) { set('sfxMute', v); this.apply(); }
  setVibrationMute(v) { set('vibrationMute', v); }
  setFps(v) { this.app.profile.settings.fps = v; this.app.save(); this.apply(); }

  // VibrationSystem.Vibrate (UIFeedbackType -> a short pulse)
  vibrate(ms = 20) { if (!this.vibrationMute && this.canVibrate) try { navigator.vibrate(ms); } catch { /* blocked */ } }

  apply() {
    const { app } = this;
    if (app.audio) app.audio.setMute(this.musicMute, this.sfxMute);
    // requestAnimationFrame cannot be locked to 120; 60 caps the engine's frame rate, 120 leaves it uncapped
    if (app.engine) app.engine.maxFps = this.fps === 60 ? 60 : 0;
    // comfort scales (camera.js shake, AgentView flash): on = half the original shake, flashes capped
    if (app.engine) app.engine.comfort = this.screenShake ? { shake: 0.5, flash: 0.6, strobe: 0.35 } : { shake: 0, flash: 0.25, strobe: 0.15 };
  }
}
