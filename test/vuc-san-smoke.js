/*
 * Vực Săn: trang mở được, không lỗi, đủ bảng dữ liệu, mọi tài nguyên tham chiếu trong bảng đều tồn tại.
 * Chạy: node test/vuc-san-smoke.js   (VS_URL=<gốc> để chạy trên Pages)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./vuc-san-lib');

async function main() {
  console.log('Bảng dữ liệu (Node)');
  const W = T.nodeSim(['../ho-xanh/data/zones.js', '../ho-xanh/data/shark_assets.js', 'data/tuning.js', 'data/sharks.js', 'data/divers.js', 'data/skills.js', 'data/maps.js', 'data/banners.js']);
  const VS = W.VS;
  const species = new Set(W.HX_SHARKS.species.map((s) => s.id));
  const sharkIds = Object.keys(VS.SHARKS), diverIds = Object.keys(VS.DIVERS);
  T.check('12 loài cá mập, mỗi loài có glb trong HX_SHARKS', sharkIds.length === 12 && sharkIds.every((id) => species.has(id)), sharkIds.length);
  const sharkSkills = sharkIds.map((id) => VS.SHARKS[id].skill);
  T.check('12 cá mập mang 12 kỹ năng khác nhau, đều có số trong SKILL_DATA', new Set(sharkSkills).size === 12 && sharkSkills.every((s) => VS.SKILL_DATA[s] && VS.SKILL_DATA[s].team === 'shark'));
  const diverSkills = diverIds.map((id) => VS.DIVERS[id].skill);
  T.check('10 thợ lặn mang 10 kỹ năng khác nhau', diverIds.length === 10 && new Set(diverSkills).size === 10 && diverSkills.every((s) => VS.SKILL_DATA[s] && VS.SKILL_DATA[s].team === 'diver'));
  const gunOk = diverIds.every((id) => fs.existsSync(path.join(T.ROOT, 'games/ho-xanh/art/dave/harpoon', VS.DIVERS[id].gun + '.png')));
  T.check('súng của mọi thợ lặn có ảnh', gunOk);
  const icons = Object.values(VS.SKILL_DATA).map((s) => s.icon).filter(Boolean);
  const iconPath = (p) => p.replace(/^hx:/, 'games/ho-xanh/').replace(/^bdl:/, 'games/biet-doi-lan/');
  const missingIcons = icons.filter((p) => !fs.existsSync(path.join(T.ROOT, iconPath(p))));
  T.check('icon kỹ năng đều tồn tại', missingIcons.length === 0, missingIcons.join(', ') || icons.length + ' icon');
  T.check('bản đồ trong kho đều có trong HX_ZONES', VS.MAPS.length >= 1 && VS.MAPS.every((m) => W.HX_ZONES[m.id]), VS.MAPS.map((m) => m.id).join(','));
  const ban = VS.BANNERS;
  T.check('có banner thợ lặn và banner cá mập', ban.some((b) => b.team === 'diver') && ban.some((b) => b.team === 'shark'));
  const featOk = ban.every((b) => [5, 4].every((r) => b.featured[r].every((id) => (b.team === 'diver' ? VS.DIVERS : VS.SHARKS)[id] && (b.team === 'diver' ? VS.DIVERS : VS.SHARKS)[id].rarity === r)));
  T.check('nhân vật tăng tỉ lệ của banner đúng phe, đúng bậc sao', featOk);

  console.log('Trang (trình duyệt)');
  const srv = await T.serve();
  const br = await T.browser();
  const { page, problems } = await T.open(br, srv.base, 'index.html');
  await page.waitForFunction(() => window.VS && window.VS.DIVERS && window.VS.SHARKS, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const counts = await page.evaluate(() => ({ d: Object.keys(VS.DIVERS).length, s: Object.keys(VS.SHARKS).length, m: VS.MAPS.length, three: !!window.THREE, hx: !!window.HX_ZONES }));
  T.check('trang nạp đủ bảng, three.js và HX_ZONES', counts.d === 10 && counts.s === 12 && counts.three && counts.hx, JSON.stringify(counts));
  await T.shot(page, 'smoke');
  T.check('không lỗi trang, không 404', problems.length === 0, problems.slice(0, 5).join(' | ') || 'sạch');
  await br.close(); srv.close();
  T.done();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
