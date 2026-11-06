/* Chợ Phiên — nạp bộ mô phỏng trong Node: `var BZSim = require('games/bazaar/js/sim/index.js')`.
   Trình duyệt nạp từng tệp theo đúng thứ tự dưới đây bằng thẻ <script> (core → dsl → triggers → actions → engine → text). */
['core', 'dsl', 'triggers', 'actions', 'engine', 'text'].forEach(function (f) { require('./' + f + '.js'); });
module.exports = globalThis.BZSim;
