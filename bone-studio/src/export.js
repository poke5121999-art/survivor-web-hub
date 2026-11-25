// Export bundles shared by the editor and bone-cli. Pixel access goes through an adapter so the same code runs on
// canvas (browser) and on plain RGBA buffers (Node): io = { size(path), blit(page, path, x, y), newPage(w, h), encode(page) }.
import { pack } from "./pack.js?v=20261125l";
import { writeAtlas, sequencePath } from "../runtime/xuong.js?v=20261125l";
import { toSpine } from "./spine-io.js?v=20261125l";

export function usedImages(doc) {
  const set = new Set();
  for (const k of doc.skins) for (const m of Object.values(k.attachments)) for (const [n, a] of Object.entries(m)) if (!a.type || a.type === "region" || a.type === "mesh") {
    if (a.sequence) for (let i = 0; i < a.sequence.count; i++) set.add(sequencePath(a, n, i)); // every frame image
    else set.add(a.path ?? n);
  }
  return [...set].filter((p) => doc.images[p]);
}
export async function buildAtlas(doc, io, { base = "skeleton", maxSize = 2048, padding = 2 } = {}) {
  const items = usedImages(doc).map((p) => ({ name: p, w: io.size(p).width, h: io.size(p).height }));
  const pages = pack(items, { maxSize, padding });
  const files = [];
  const named = [];
  for (const [i, pg] of pages.entries()) {
    const file = `${base}${i ? i + 1 : ""}.png`, page = io.newPage(pg.width, pg.height);
    for (const r of pg.regions) io.blit(page, r.name, r.x, r.y);
    files.push({ name: file, data: await io.encode(page) });
    named.push({ name: file, width: pg.width, height: pg.height, regions: pg.regions.map((r) => ({ ...r, offX: 0, offY: 0, origW: r.w, origH: r.h, rotate: 0 })) });
  }
  return { atlas: writeAtlas(named), files };
}
export async function exportBundle(doc, io, { format = "xuong", base } = {}) {
  base = base ?? ((doc.name || "skeleton").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "skeleton");
  const { atlas, files } = await buildAtlas(doc, io, { base });
  const enc = new TextEncoder();
  const json = format === "spine" ? toSpine(doc) : { ...doc, images: Object.fromEntries(usedImages(doc).map((p) => [p, doc.images[p]])) };
  return [
    { name: `${base}${format === "spine" ? ".json" : ".xuong.json"}`, data: enc.encode(JSON.stringify(json, null, format === "spine" ? 1 : 0)) },
    { name: `${base}.atlas`, data: enc.encode(atlas) },
    ...files,
  ];
}
