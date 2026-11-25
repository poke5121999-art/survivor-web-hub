// One-call pipeline: whole character image → rig parts + commands. Same code in the browser and in bone-cli.
import { removeBackground, detectScale, toNative, opaqueBounds } from "./pixels.js?v=20261125b";
import { heuristicSkeleton, segment, cutParts, rigCommands } from "./rig.js?v=20261125b";

export function analyze(src) {
  const bg = removeBackground(src);
  const sc = detectScale(src);
  const pixel = sc.pixelArt ? sc : { scale: 1, phaseX: 0, phaseY: 0, pixelArt: false };
  const native = pixel.scale > 1 ? toNative(bg.image, pixel) : bg.image;
  return { alpha: bg.image, background: bg.background, scale: pixel.scale, phase: [pixel.phaseX, pixel.phaseY], pixelArt: pixel.pixelArt, native, detected: sc };
}

export function autoSplit(src, { skeleton, prefix = "", fill = true, analysis } = {}) {
  const a = analysis ?? analyze(src);
  const spec = skeleton ?? heuristicSkeleton(a.native, a.scale, a.phase);
  const seg = segment(a.native, spec, a.scale, a.phase);
  const parts = cutParts(a.native, seg, spec, { fill });
  const b = opaqueBounds(a.alpha);
  const origin = b ? [b.x + b.w / 2, b.y + b.h] : [src.width / 2, src.height];
  const commands = rigCommands(spec, parts, { scale: a.scale, phase: a.phase, srcHeight: src.height, prefix, origin });
  return { ...a, spec, seg, parts, commands, origin };
}
