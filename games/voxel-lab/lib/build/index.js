// Voxel Lab - registry of building and prop generators. To add one: write a module that default-exports
// { id, name, variants, build(seed) -> Canvas } (see kit.js) and list it here.
// Techniques studied from Voxel Engine by mattshumer (spawn.co); code is our own.
import tubeHouse from './tube-house.js';
import brickHouse from './brick-house.js';
import apartment from './apartment.js';
import officeTower from './office-tower.js';
import warehouse from './warehouse.js';
import waterTower from './water-tower.js';
import stoneBridge from './stone-bridge.js';
import trussBridge from './truss-bridge.js';
import castle from './castle.js';
import hut from './hut.js';
import gasStation from './gas-station.js';
import props from './props.js';

export const BUILDINGS = [tubeHouse, warehouse, gasStation, apartment, officeTower, brickHouse, hut, waterTower, stoneBridge, trussBridge, castle];
export const PROPS = props;
export const GENERATORS = [...BUILDINGS, ...PROPS];
