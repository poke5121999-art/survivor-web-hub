/*
 * Khởi động: đọc tham số gỡ lỗi, nạp dữ liệu lưu, vào cảnh đầu tiên.
 * Cảnh do các tệp khác đăng ký qua P1.scene.add(tên, …): title, creator, world, battle.
 */
(function (P1) {
  'use strict';
  const q = new URLSearchParams(location.search);
  P1.query = q;

  function parseMons(s) {
    return (s || '').split(',').filter(Boolean).map(t => {
      const [dex, lv] = t.split(':').map(Number);
      return P1.mon.create(dex, lv || 5, { ot: 'Debug' });
    });
  }

  function fail(e) {
    const boot = document.getElementById('boot');
    boot.classList.remove('gone');
    boot.innerHTML = '<div class="err">Lỗi khởi động: ' + String(e && e.message || e) + '</div>';
    console.error(e);
  }

  window.addEventListener('error', e => { if (!P1.scene.name) fail(e.error || e.message); });

  function boot() {
    P1.view();
    const bootEl = document.getElementById('boot');
    const ready = P1.proui.ready();
    return ready.then(() => {
      if (q.get('fresh') === '1' || !P1.load()) P1.newGame();
      if (q.get('battle')) {
        const party = parseMons(q.get('party') || '4:7');
        P1.state.party = party;
        return P1.start('battle', {
          kind: q.get('trainer') ? 'trainer' : 'wild',
          name: q.get('trainer') || '',
          foe: parseMons(q.get('battle')),
          debug: true,
        });
      }
      if (q.get('map')) {
        P1.state.map = q.get('map');
        if (q.get('x')) P1.state.x = +q.get('x');
        if (q.get('z')) P1.state.z = +q.get('z');
        if (!P1.state.party.length) P1.state.party = parseMons(q.get('party') || '4:7');
        return P1.start('world', {});
      }
      return P1.start('title', {});
    }).then(() => bootEl.classList.add('gone'));
  }

  window.addEventListener('load', () => { boot().catch(fail); });
})(window.P1 = window.P1 || {});
