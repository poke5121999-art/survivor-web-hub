// Dò rig màn tựa trong trang (node tools/title/probe.js <url> [rig]): hộp bao, slot, màu, attachment, độ dài animation. Dùng khi chỉnh title.js.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(process.argv[2] + '?title=1');
  await p.waitForFunction(() => window.SK && SK.title && SK.title.ready, null, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));
  console.log(JSON.stringify(await p.evaluate(rig => {
    const o = {}, r = SK.title.rigs[rig], s = r.skel;
    o.dur = s.data.animations.map(a => [a.name, a.duration]);
    o.slots = s.slots.map(x => [x.data.name, x.attachment ? x.attachment.name : null, x.color.a.toFixed(2), x.data.blendMode, x.bone.active, x.bone.worldX.toFixed(0), x.bone.worldY.toFixed(0)]);
    o.att = s.drawOrder.map(sl => { const a = sl.attachment; if (!a) return null; const n = a.worldVerticesLength || 8, v = new Array(n); try { a.computeWorldVertices ? (a.computeWorldVertices.length > 5 ? a.computeWorldVertices(sl, 0, n, v, 0, 2) : a.computeWorldVertices(sl, v, 0, 2)) : 0; } catch (e) { v[0] = String(e); } return [a.constructor.name, a.name, a.region && a.region.name, v.slice(0, 4).map(x => Math.round(x)), a.color && a.color.a, a.region && a.region.texture && a.region.texture.getImage && a.region.texture.getImage().width]; });
    return o;
  }, process.argv[3] || 'kn')));
  await b.close();
})();
