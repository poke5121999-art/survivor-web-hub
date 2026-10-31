// Renderer, camera and the two Unity scenes (FishEnv = art/env, Controller = art/player, loaded additively as the
// game does) plus the animation, camera and timeline data every page needs.
import * as THREE from 'three';
import { loadWorld } from './world.js';
import { ClipLib } from './anim.js';
import { Cine } from './cine.js';
import { createPost } from './post.js';

const json = (base, p) => fetch(`${base}/${p}?v=${window.FB_REV || ''}`).then(r => r.json());

export async function createStage(canvas, { base = '.', onProgress = () => {} } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the Unity project renders in gamma space
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(0.19216, 0.30196, 0.47451, THREE.LinearSRGBColorSpace);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 2000);

  let done = 0;
  const step = p => p.then(v => { onProgress(++done / 7); return v; });
  const [env, player, clips, humanoid, vcams, timelines, sfx] = await Promise.all([
    step(loadWorld('env', { base })), step(loadWorld('player', { base })),
    step(json(base, 'art/anim/clips.json')), step(json(base, 'art/anim/humanoid.json')),
    step(json(base, 'data/vcams.json')), step(json(base, 'data/timelines.json')), step(json(base, 'art/sfx/sfx.json')),
  ]);
  scene.add(env.root, player.root);
  const find = path => env.byPath(path) || player.byPath(path);
  // The room ships inactive in FishEnv.unity; the game turns it on once the Controller scene has loaded.
  find('*****FISHENV*****').visible = true;
  const lib = new ClipLib(clips, humanoid);
  const cine = new Cine(vcams, find);

  const post = createPost(renderer, [env, player]);

  const resize = () => {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  // Timeline directors by the level they belong to, keyed like ActivityManager/Activities/Level N/...
  const timeline = name => Object.entries(timelines).find(([path, def]) => path.includes(name) || def.asset === name);

  return {
    renderer, scene, camera, post, env, player, find, lib, cine, vcams, timelines, timeline, sfx, resize,
    ready: Promise.all([env.ready, player.ready]),
    update(t) { env.update(t); player.update(t); },
    render() { post.render(scene, camera); },
  };
}
