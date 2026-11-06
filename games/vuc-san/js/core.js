// Dùng chung cho mọi tầng: số bản (rev), cờ URL, đường dẫn tài nguyên.
(function (VS) {
  'use strict';
  var me = document.currentScript && document.currentScript.src || '';
  var m = /[?&]v=([^&]+)/.exec(me);
  VS.REV = m ? m[1] : '';

  var q = new URLSearchParams(location.search);
  VS.flags = {
    seed: q.has('seed') ? (parseInt(q.get('seed'), 10) >>> 0) : null,
    map: q.get('map'),
    team: q.get('team'),
    go: q.get('go'),
    manual: q.get('manual') === '1',
    lab: q.get('lab')
  };

  var ROOTS = { hx: window.HX_ROOT || '../ho-xanh/', bdl: '../biet-doi-lan/' };
  VS.asset = function (p) {
    var i = p.indexOf(':');
    if (i > 0 && ROOTS[p.slice(0, i)] != null) return ROOTS[p.slice(0, i)] + p.slice(i + 1);
    return p;
  };
})(window.VS = window.VS || {});
