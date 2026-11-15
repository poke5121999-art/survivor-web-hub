// Registry: every group file exports named builders + PROPS [{ id, name, build, yaw, variants }].
export * from './concrete.js';
export * from './drums.js';
export * from './furniture.js';
export * from './metal.js';
export * from './workshop.js';
export * from './vehicles.js';
import { PROPS as A } from './concrete.js';
import { PROPS as B } from './drums.js';
import { PROPS as C } from './furniture.js';
import { PROPS as D } from './metal.js';
import { PROPS as E } from './workshop.js';
import { PROPS as F } from './vehicles.js';
export const PROPS = [...A, ...B, ...C, ...D, ...E, ...F];
