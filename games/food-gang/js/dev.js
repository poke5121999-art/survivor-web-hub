// Engine dev page: map scene + SceneGame HUD/camera, all 16 skins in a row cycling animator states, particle FX.
// dev.html?scene=level23|level24|level25&prefab=skin_BRO&anim=idle|run|attack|special|jump&cam=group&focus=7&info=0
import { Engine, stats } from './engine/engine.js';

const Q = new URLSearchParams(location.search);
const MAPS = { level23: 'SceneLevelKitchen', level24: 'SceneLevelDiningRoom', level25: 'SceneLevelPantry' };
const SKINS = ['BRO', 'TOM', 'BILLY', 'BUD', 'HAKA', 'HORN', 'IGOR', 'JACK', 'JAMES', 'KING', 'LEON', 'NORI', 'PEPE', 'ROB', 'TONY', 'WALTER'];
const CYCLE = ['idle', 'run', 'attack', 'special', 'jump'];
const FX = ['Fx_hit_bullet', 'Fx_death_tomato', 'smoke_bazooka', 'Fx_hit_missile', 'Fx_heal'];

const info = document.getElementById('info');
if (Q.get('info') === '0') info.classList.add('hide');

async function main() {
  const engine = new Engine(document.getElementById('cv'), new URL('.', location.href).href);
  window.fgDev = { engine, ready: false };
  stats.ready = false;
  await engine.init();
  const sceneKey = Q.get('scene') || 'level23';
  const mapName = MAPS[sceneKey] || sceneKey;
  await engine.loadScene(mapName);
  const game = await engine.loadScene('SceneGame');
  const root = game.root;
  // HUD in match state: Loading off, Game on, 2-team score (green/red) + timer
  root.find('HUD/Loading')?.setActive(false);
  root.find('HUD/Game')?.setActive(true);
  // 2v2: teams 1 (TeamBlue) and 2 (TeamRed) present; life icons are only for LastSurvivor
  for (const t of ['TeamYellow', 'TeamGreen']) root.find('HUD/Game/Team+Timer/' + t)?.setActive(false);
  for (const t of ['TeamBlue', 'TeamRed']) for (const c of ['BackgroundAlive', 'BackgroundDead']) root.find(`HUD/Game/Team+Timer/${t}/${c}`)?.setActive(false);
  root.find('HUD/Game/Team+Timer/Timer/Text')?.get('Text')?.setText('01:25');
  root.find('HUD/Game/Team+Timer/TeamBlue/Text')?.get('Text')?.setText('6');
  root.find('HUD/Game/Team+Timer/TeamRed/Text')?.get('Text')?.setText('4');
  const gameData = await engine.assets.getJSON('data/assets/GameData.json');
  const teamBars = gameData.fields.m_lifebarTeam || [];
  root.find('HUD/Game/Death')?.setActive(false);
  // VirtualButton type 2 (special) only shows once the power is charged
  if (Q.get('special') !== '1') root.find('HUD/Game/Controls/Special')?.setActive(false);
  root.find('HUD/Game/LifeBarBoss')?.setActive(false);

  const only = Q.get('prefab');
  const list = only ? [only.replace(/^(skin_|Agent_)/, '')] : SKINS;
  const spacing = Number(Q.get('spacing') || 2.2);
  const lifeRoot = root.find('LifeBarRoot');
  const agents = [];
  for (let i = 0; i < list.length; i++) {
    const name = list[i];
    const x = (i - (list.length - 1) / 2) * spacing + Number(Q.get('x') || 0);
    // Quantum spawns the skin prefab (the entity view) itself at the agent position; Agent_* is the sim prototype
    const skin = await engine.instantiate('skin_' + name, null, [x, Number(Q.get('y') || 0), 0]);
    const agent = skin;
    const sg = skin.root.get('SortingGroup');
    if (sg) sg.order = i === Number(Q.get('focus') ?? Math.floor(list.length / 2)) ? 10 : 5 - (i % 4);
    // the art faces left at positive visual_root scale; facing right is a negative x scale (Agent_* Root is -0.5)
    const vr = skin.root.find('visual_root');
    const faceLeft = Q.get('face') === 'left' || (Q.get('face') === 'alt' && i % 2 === 1);
    if (vr) vr.ls[0] = Math.abs(vr.ls[0]) * (faceLeft ? 1 : -1);
    const an = skin.root.get('Animator')?.runtime;
    const melee = an && an.over && Object.keys(an.over).some((k) => /melee/.test(k));
    if (an) {
      an.setBool('IsGrounded', true);
      if (melee) { an.setLayerWeight(an.layerIndex('ArmRightMelee'), 1); an.setLayerWeight(an.layerIndex('ArmRight'), 0); an.setBool('IsMelee', true); }
    }
    let bar = null;
    if (lifeRoot) {
      bar = await engine.instantiate('LifeBar', lifeRoot);
      // LifeBar.SetCanvasQuantum + DisableScore (team modes): team fill sprite, name, no score
      const team = i % 2 ? 2 : 1;
      const fill = bar.root.find('SliderFill/Fill')?.get('Image');
      if (fill && teamBars[team - 1]) fill.setSprite(teamBars[team - 1]);
      const nm = bar.root.find('Name')?.get('Text');
      if (nm) { nm.setText(name); const tc = (gameData.fields.m_colorsTeam || [])[team - 1]; if (tc) nm.color = tc.slice(); }
      bar.root.find('Boss')?.setActive(false);
      bar.root.find('Score')?.setActive(false);
    }
    agents.push({ name, x, agent, skin, an, bar, slot: skin.root.findDeep('SLOT_LIFEBAR'), phase: i % CYCLE.length, melee });
  }
  window.fgDev.agents = agents;

  // camera target: CameraTargetGroup follows the focused agent (+0.8 like its scene offset) or frames the whole row
  const tg = root.find('CameraTargetGroup');
  const focus = agents[Math.min(agents.length - 1, Number(Q.get('focus') ?? Math.floor(agents.length / 2)))];
  if (engine.cine) {
    if (Q.get('cam') === 'group') engine.cine.setGroup(agents.map((a) => a.agent.root), 1.5);
    else engine.cine.setFollow(tg);
  }

  const fixed = Q.get('anim');
  let t = 0;
  const setAnim = (a, st) => {
    const an = a.an;
    if (!an) return;
    an.setBool('IsMoving', st === 'run');
    an.setBool('IsGrounded', st !== 'jump');
    an.setBool('IsActioning', st === 'attack');
    an.setBool('IsActioningSpecial', st === 'special');
    if (st === 'attack') an.setTrigger(a.melee ? 'ActionMelee' : 'Action');
    if (st === 'special') { an.setTrigger('Special'); an.setBool('IsSpecial', true); } else an.setBool('IsSpecial', false);
    if (st === 'jump') an.setTrigger('Jump');
    a.state = st;
  };
  agents.forEach((a) => setAnim(a, fixed || CYCLE[a.phase]));
  let fxT = 0, fxN = 0;
  const fxLive = [];
  engine.hooks.update.push((dt) => {
    t += dt;
    if (!fixed && Math.floor(t / 2) !== Math.floor((t - dt) / 2)) {
      for (const a of agents) { a.phase = (a.phase + 1) % CYCLE.length; setAnim(a, CYCLE[a.phase]); }
    }
    for (const a of agents) {
      // jumpers land after 0.6 s so the fall -> idle transition shows
      if (a.state === 'jump' && (t % 2) > 0.6) a.an?.setBool('IsGrounded', true);
      if (a.state === 'attack' && (t % 2) < dt) a.an?.setTrigger(a.melee ? 'ActionMelee' : 'Action');
    }
    if (tg && focus) { tg.lp[0] = focus.agent.root.lp[0]; tg.lp[1] = focus.agent.root.lp[1] + 0.8; }
    fxT -= dt;
    if (fxT <= 0 && !Q.has('nofx')) {
      fxT = 0.7;
      const name = FX[fxN++ % FX.length];
      const a = agents[(fxN * 5) % agents.length];
      engine.instantiate(name, null, [a.x, 1.0, -0.2]).then((inst) => {
        fxLive.push({ inst, die: engine.time + 3 });
      }).catch((e) => stats.errors.push(String(e)));
    }
    for (let i = fxLive.length - 1; i >= 0; i--) if (engine.time > fxLive[i].die) { fxLive[i].inst.root.destroy(); fxLive.splice(i, 1); }
  });
  // life bars follow SLOT_LIFEBAR in screen space (QuantumLifeBarManager)
  engine.hooks.late.push(() => {
    const cv = lifeRoot && lifeRoot.get('Canvas');
    const s = cv && cv.scale ? cv.scale : 1;
    for (const a of agents) {
      if (!a.bar || !a.slot) continue;
      const w = a.slot.world;
      const p = engine.worldToScreen(w[12], w[13], w[14]);
      if (!p) continue;
      const r = a.bar.root.rect;
      r.amin = [0, 0]; r.amax = [0, 0];
      r.pos = [p[0] / s, p[1] / s];
    }
  });
  engine.start();
  // first frames: wait for atlases, then flag ready for tests
  const waitReady = () => {
    if (stats.frames > 10) {
      stats.ready = true;
      window.fgDev.ready = true;
      stats.scene = mapName;
      stats.agents = agents.length;
    } else setTimeout(waitReady, 100);
  };
  waitReady();
  setInterval(() => {
    info.textContent = `${mapName}  agents ${agents.length}  draws ${stats.drawCalls}  particles ${stats.particles}\n`
      + `sprites missing ${stats.spritesMissing.length}  clips missing ${stats.clipsMissing.length}  errors ${stats.errors.length}\n`
      + `state ${agents[0]?.an?.stateName(0) || '-'} / ${agents[0]?.an?.stateName(1) || '-'}`;
  }, 250);
}

main().catch((e) => { stats.errors.push(String(e && e.stack || e)); console.error(e); info.textContent = 'ERROR ' + e.message; });
