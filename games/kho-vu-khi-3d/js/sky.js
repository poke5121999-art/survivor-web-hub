// Sun and sky palette the Saltline modules import (porting.md host contract).
// Palette and sun colour are Saltline's (render.md §1); the sun is raised from 13 to ~33 degrees so a weapon wall
// is lit across its whole height instead of grazing.
import * as THREE from '../vendor/three.module.min.js';

export const SUN_DIR = new THREE.Vector3(0.62, 0.55, 0.56).normalize();
export const SUN_COLOR = new THREE.Color(1, 0.78, 0.56);
export const SUN_INTENSITY = 9;
export const PALETTE = {
  zen: new THREE.Color(0.055, 0.085, 0.13),
  hor: new THREE.Color(0.95, 0.55, 0.28),
  horAway: new THREE.Color(0.16, 0.22, 0.30),
  fog: new THREE.Color(0.42, 0.47, 0.52),
};
