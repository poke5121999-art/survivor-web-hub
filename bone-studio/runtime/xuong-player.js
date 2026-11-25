// Browser helper for hub games: load an exported .xuong.json (+ .atlas + page PNGs) and play it on a canvas2D.
//   const data = await loadSkeleton("assets/pharaoh.xuong.json");
//   const p = new XuongPlayer(data); p.play("walk");
//   each frame: p.update(dt); p.draw(ctx, x, y, { scale: 2, flipX: false });
import { buildSkeleton, setupPose, updateWorld, drawList, draw2d, parseAtlas, AnimationState, bounds } from "./xuong.js?v=20261125b";

export async function loadSkeleton(jsonUrl, { atlasUrl } = {}) {
  const doc = await (await fetch(jsonUrl)).json();
  const base = jsonUrl.replace(/[^/]*$/, "");
  atlasUrl ??= jsonUrl.replace(/(\.xuong)?\.json(\?.*)?$/, ".atlas$2");
  const pages = parseAtlas(await (await fetch(atlasUrl)).text());
  const images = new Map();
  await Promise.all(pages.map(async (pg) => {
    const img = new Image();
    img.src = base + pg.name;
    await img.decode();
    for (const r of pg.regions) images.set(r.name, { source: img, x: r.x, y: r.y, w: r.w, h: r.h, offX: r.offX, offY: r.offY, origW: r.origW, origH: r.origH, rotate: r.rotate === 90 });
  }));
  return { doc, images };
}

export class XuongPlayer {
  constructor({ doc, images }, { skin = "default" } = {}) {
    this.doc = doc; this.images = images; this.sk = buildSkeleton(doc); this.skin = skin;
    this.state = new AnimationState(this.sk);
    this.pose = setupPose(this.sk, skin);
    this.events = [];
    this.state.listeners.push((e) => this.events.push(e));
  }
  play(name, { loop = true, track = 0, mix } = {}) {
    if (mix !== undefined) this.state.defaultMix = mix;
    return this.state.setAnimation(track, name, loop);
  }
  update(dt) {
    this.state.update(dt);
    this.pose = setupPose(this.sk, this.skin);
    this.state.apply(this.pose);
    updateWorld(this.sk, this.pose);
    const ev = this.events; this.events = [];
    return ev;
  }
  bounds() { return bounds(drawList(this.sk, this.pose)); }
  // x, y: screen position of the skeleton origin (feet). Pixel art is drawn with nearest filtering.
  draw(ctx, x, y, { scale = 1, flipX = false } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flipX ? -scale : scale, -scale);
    ctx.imageSmoothingEnabled = !this.doc.pixelArt;
    draw2d(ctx, drawList(this.sk, this.pose), this.images);
    ctx.restore();
  }
}
