// Boot, portrait frame, main loop, scene switching (SceneSystem), and scene <-> UI wiring.
import { A, loadData, refKey, setLanguage } from './engine/assets.js?v=20261102a';
import { THREE } from './engine/world.js?v=20261102a';
import { UIRoot } from './engine/ui.js?v=20261102a';
import { SceneGame } from './game/sceneGame.js?v=20261102a';
import { SceneMinigame } from './game/sceneMinigame.js?v=20261102a';
import { UIScripts, registerScript } from './game/uiScripts.js?v=20261102a';
import { setupMinigameUI, setupCollection } from './game/uiMeta.js?v=20261102a';
import { loadUser, saveUser, Game } from './game/user.js?v=20261102a';
import { publish, subscribe } from './game/events.js?v=20261102a';
import * as SFX from './game/audio.js?v=20261102a';
import * as Sys from './game/systems.js?v=20261102a';

export const REV = '20261102a';
const ASPECT = 640 / 1136; // CanvasScaler reference resolution, portrait
const frame = document.getElementById('frame');
const canvas = frame.querySelector('canvas.world');
const app = { scene: null, sceneName: null, renderer: null, particles: null, ui: null, scripts: null, w: 0, h: 0, time: 0 };
window.__app = app;

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let h = vh, w = Math.round(h * ASPECT);
  if (w > vw) { w = vw; h = Math.round(w / ASPECT); }
  if (vw < vh && vw <= 820) { w = vw; h = vh; } // phones: full screen, Unity matches height
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  app.w = w; app.h = h;
  if (app.renderer) app.renderer.setSize(w, h, false);
  if (app.ui) app.ui.resize(w, h);
}
window.addEventListener('resize', layout);

// BlurSystem: blur + darken the world behind popups
let blurCount = 0;
app.blur = on => { blurCount = Math.max(0, blurCount + (on ? 1 : -1)); canvas.style.filter = blurCount ? 'blur(6px) brightness(0.85)' : ''; };

// SceneSystem fade
const fadeEl = document.getElementById('fade');
function fadeTo(v, ms) { fadeEl.style.transition = `opacity ${ms}ms linear`; fadeEl.style.opacity = String(v); return new Promise(r => setTimeout(r, ms)); }
let loading = false;
app.loadScene = async name => {
  if (loading) return; loading = true;
  const target = /minigame/i.test(name) ? 'SceneMinigame' : 'SceneGame';
  fadeEl.style.pointerEvents = 'auto';
  await fadeTo(1, 250);
  saveUser();
  openScene(target);
  await fadeTo(0, 250);
  fadeEl.style.pointerEvents = 'none'; loading = false;
};

function clearUI() {
  if (app.scripts) app.scripts.clear();
  if (app.ui) app.ui.dispose();
  blurCount = 0; canvas.style.filter = '';
  document.getElementById('ui').innerHTML = '';
  app.ui = new UIRoot(document.getElementById('ui'));
  app.ui.resize(app.w, app.h);
  app.scripts = new UIScripts(app);
}

const sceneSubs = [];
function openScene(name) {
  for (const off of sceneSubs.splice(0)) off();
  if (app.scene) app.scene.dispose();
  clearUI();
  app.sceneName = name;
  if (name === 'SceneMinigame') {
    app.scene = new SceneMinigame(app);
    const hud = A.scene.scenes.level2.find(r => r.name === 'HUDMinigame');
    const u = app.scripts.instantiate(hud);
    app.scene.start(setupMinigameUI(app, u));
  } else {
    app.scene = new SceneGame(app);
    const hud = A.scene.scenes.level1.find(r => r.name === 'HUDGame');
    const u = app.scripts.instantiate(hud);
    wireGameHUD(u);
  }
  SFX.setMuteAll(false);
  SFX.playMusic(app.scene.music);
}

function wireGameHUD(hud) {
  const sc = app.scene, S = app.scripts;
  const gcComp = sc.gcGO.comp('GameController');
  const tuto = hud.findById(refKey(gcComp.m_tuto));
  const flash = hud.findById(refKey(gcComp.m_animatorFlash));
  let tutoAlpha = 1;
  if (tuto) app.scripts.behs.push({ u: tuto, update: dt => { if (sc.state.started && tuto.active && !sc.state.paused && !sc.state.gameOver) { tutoAlpha -= dt; tuto.setAlpha(Math.max(0, tutoAlpha)); if (tutoAlpha <= 0) tuto.setActive(false); } } });
  const on = (n, fn) => sceneSubs.push(subscribe(n, fn));
  on('BonusEndEvent', () => { const a = flash && flash.comps.Animator && flash.comps.Animator.animator; a && a.crossFade('Flash', 0, 0, 0); });
  on('MissionSuccessEvent', e => S.infoBar && S.infoBar.DisplayMessage(Sys.missionDescription(e.mission), 1));
  on('MissionFailureEvent', e => S.infoBar && S.infoBar.DisplayMessage(Sys.missionDescription(e.mission), 2));
  on('HitEvent', () => { const bl = hud.find('Blood'); const an = bl && bl.comps.Animation; an && an.anim && an.anim.play(); });
  on('GameOverEvent', () => { app.scripts.instantiate(A.scene.prefabs[refKey(gcComp.m_gameOver)]); saveUser(); });
  on('KillEvent', () => saveUser());
  on('NewSkinEvent', () => saveUser());
  // Collection popup scripts (HorizontalScrollSnap etc.) are set up whenever that prefab is instantiated
  setupCollection(app);
}

// helper used by MenuController / Minigame: fill a SkinUnlocked popup
UIScripts.prototype.setSkinPopup = function (u, skin) {
  u.walk(n => { for (const c of n.compList) { if (c.beh && c.beh.SetSetting) c.beh.SetSetting(skin); } });
};

async function boot() {
  layout();
  const bootEl = document.getElementById('boot');
  await loadData('', REV, p => { bootEl.textContent = `Loading… ${Math.round(p * 100)}%`; });
  loadUser();
  if (Game.User.m_language) setLanguage(Game.User.m_language);
  else { const map = { fr: 'French', de: 'German', it: 'Italian', es: 'Spanish', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'ChineseSimplified' };
    const l = (navigator.language || 'en').toLowerCase(); setLanguage(l.startsWith('zh-tw') || l.startsWith('zh-hk') ? 'ChineseTraditionel' : (map[l.slice(0, 2)] || 'English')); }
  Sys.refreshMission();
  app.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  app.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  app.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // Gamma pipeline: no conversion on output
  layout();
  try { const m = await import(`./game/fx.js?v=${REV}`); app.particles = m.makeParticleHost(); } catch (e) { console.warn('particles unavailable', e.message); }
  const unlock = () => SFX.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  try { await document.fonts.load('20px "Linotte Bold"'); } catch (e) {}
  openScene('SceneGame');
  bootEl.style.opacity = 0; setTimeout(() => bootEl.remove(), 450);
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(1 / 3, (now - last) / 1000); last = now; app.time += dt;
    if (app.scene) {
      app.scene.update(dt);
      app.scripts && app.scripts.update(app.scene.state && app.scene.state.resuming ? 0 : dt);
      app.scene.applyCamera(app.w / app.h);
      const cc = app.scene.clearColor; if (cc) app.renderer.setClearColor(new THREE.Color(cc.r, cc.g, cc.b), 1); else app.renderer.setClearColor(0x000000, 1);
      app.renderer.render(app.scene.scene, app.scene.cam);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.addEventListener('keydown', e => { if (e.code === 'Space' && app.scene && app.scene.pointerDown && !e.repeat) { e.preventDefault(); app.scene.pointerDown(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveUser(); const pm = app.scripts && app.scripts.pauseMenu; if (pm && app.scene && app.scene.state && app.scene.state.started && !app.scene.state.gameOver && !app.scene.state.paused) pm.Pause(); } });
boot().catch(e => { console.error(e); const b = document.getElementById('boot'); if (b) b.textContent = 'Error: ' + e.message; });
