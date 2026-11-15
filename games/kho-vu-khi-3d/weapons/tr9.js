// TR-9: Saltline's PAC-9 Longshore rifle, rebuilt from the ported part builder w_() (js/sl/gun-sl.js, Saltline
// 45495-46064) with its materials (47009-47043), markings atlas + quad layout (46601-46714, 47055-47078, rebranded)
// and reflex-sight glass (46715-46806). This is the quality bar every other gun in the kit is held to.
import { weapon } from '../js/weapon.js';
import { buildRifleParts, GUN, markingQuads, MARK_LAYOUT, sightGlass } from '../js/sl/gun-sl.js';

export default weapon('tr9', 'TR-9 rifle (Saltline PAC-9 port)', { kind: 'gun', gun: true, hands: 2 }, (k) => {
  const P = buildRifleParts();
  k.add(P.ano, { gun: 'ano' }, { keep: true, grain: 'z' });
  k.add(P.gun, { gun: 'gun' }, { keep: true, grain: 'z' });
  k.add(P.poly, { gun: 'poly' }, { keep: true, grain: 'z' });
  k.add(P.plain, { gun: 'plain' }, { keep: true, grain: 'z' });
  k.add(P.bolt, { gun: 'gun' }, { keep: true, grain: 'z' });
  k.add(P.mag, { gun: 'tan' }, { keep: true, grain: 'z', p: GUN.magPos });
  k.add(P.round, ['brass'], { keep: true, grain: 'z', p: GUN.magPos });
  try {
    const marks = markingQuads(MARK_LAYOUT); marks.castShadow = false; marks.receiveShadow = true; marks.userData.countTris = false;
    k.extras.push(marks);
  } catch (e) { console.warn('[tr9] markings skipped: ' + e); }
  const glass = sightGlass(GUN.window.map((p) => [p[0] * 1.01, (p[1] - GUN.sightY) * 1.01 + GUN.sightY]), GUN.lensF + 0.0025);
  glass.userData.countTris = false; k.extras.push(glass);
  k.grip(GUN.grip, [0, 0, -1], [0, 1, 0]);
  k.grip2([0, -0.03, -0.236], [0, 0, -1], [0, 1, 0]);
  k.muzzle(GUN.muzzle, [0, 0, -1]);
  k.tip(GUN.muzzle);
});
