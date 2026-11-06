/* Chợ Phiên — nạp vòng chơi trong Node: `var BZRun = require('games/bazaar/js/run/index.js')` (tự nạp js/sim).
   Dữ liệu do bên gọi nạp trước, như test/bazaar-sim.js: data/heroes.js, các tệp BZ_HEROES.cardFiles (cards-common.js +
   cards-<hero>.js; data/cards.js là lớp tương thích nạp cả 8), monsters.js, mode.js, encounters.js.
   Trình duyệt: sau các thẻ <script> của js/sim, nạp theo đúng thứ tự dưới đây. */
require('../sim/index.js');
['tuning', 'core', 'pool', 'ooc', 'clock', 'enc-merchant', 'enc-step', 'enc-event', 'enc-pedestal', 'enc-combat', 'phases']
  .forEach(function (f) { require('./' + f + '.js'); });
module.exports = globalThis.BZRun;
