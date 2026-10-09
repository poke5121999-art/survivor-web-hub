/* Chợ Phiên — nạp vòng chơi trong Node: `var BZRun = require('games/bazaar/js/run/index.js')` (tự nạp js/sim).
   Dữ liệu (data/cards.js, monsters.js, mode.js, encounters.js) do bên gọi nạp trước, như test/bazaar-sim.js.
   Trình duyệt: sau các thẻ <script> của js/sim, nạp theo đúng thứ tự dưới đây. */
require('../sim/index.js');
['tuning', 'core', 'pool', 'ooc', 'clock', 'enc-merchant', 'enc-step', 'enc-event', 'enc-pedestal', 'enc-combat', 'phases']
  .forEach(function (f) { require('./' + f + '.js'); });
module.exports = globalThis.BZRun;
