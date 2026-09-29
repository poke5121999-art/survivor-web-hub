// Season Mode: nhiệm vụ Drillmaster (SK.SEASON.quests). Chữ và phần thưởng theo wiki, dịch tiếng Việt.
(function () {
  'use strict';
  const SK = window.SK;
  const SS = SK.SEASON = SK.SEASON || {};
  const inv = SS.inv;

  // obj.kind: kill | extract | use(id) | upgrade(what, lv) | locked (hệ thống chưa có ở bản web)
  const DEFS = [
    { id: 'first_foray', title: 'Chuyến đi đầu tiên', titleEn: 'First Foray', from: 'Drillmaster',
      text: 'Cậu vừa tỉnh dậy và còn lạ lẫm với nơi này. Ra ngoài giãn gân cốt, hạ vài kẻ địch rồi an toàn trở về căn cứ để quen với môi trường và nhịp sống ở đây.',
      obj: [{ kind: 'kill', n: 2, label: 'Hạ kẻ địch bất kỳ' }, { kind: 'extract', n: 1, label: 'Sơ tán thành công 1 lần' }],
      rewards: [['healing_potion_m', 1], ['iron_coin', 500]] },
    { id: 'learn_to_heal', title: 'Học cách hồi phục', titleEn: 'Learn to Heal', from: 'Drillmaster',
      text: 'Không biết tự chữa thương thì cậu chẳng trụ được lâu ở đây đâu. Thử dùng một bình máu hoặc bình năng lượng xem. Hết đồ thì cứ mua ở máy bán hàng.',
      obj: [{ kind: 'use', id: 'healing_potion_s', n: 1, label: 'Dùng Thuốc hồi máu (S)' },
        { kind: 'use', id: 'energy_potion_s', n: 1, label: 'Dùng Thuốc năng lượng (S)' }],
      rewards: [['energy_potion_m', 1], ['iron_coin', 800]] },
    { id: 'build_workbench', title: 'Dựng bàn chế tạo', titleEn: 'Build Workbench', from: 'Drillmaster', after: 'first_foray',
      text: 'Trốn mãi thì không đứng chân được ở đây. Trước hết hãy làm vài món đồ hữu ích. Ta nên dựng một bàn chế tạo để biến nguyên liệu thô thành trang bị.',
      obj: [{ kind: 'locked', n: 1, label: 'Mở Bàn chế tạo cấp 1', why: 'Bàn chế tạo chưa có ở bản web' }],
      rewards: [['wooden_crate_s', 1], ['iron_coin', 1000]] },
    { id: 'craft_armor', title: 'Chế áo giáp', titleEn: 'Craft Armor', from: 'Drillmaster', after: 'build_workbench',
      text: 'Chắc cậu cũng nhận ra sức mạnh vốn có của chúng ta bị suy yếu ở đây, giáp cũng mất sạch. May là ta có thể tự chế trang bị bù vào.',
      obj: [{ kind: 'locked', n: 1, label: 'Chế Áo vải thô', why: 'Cần Bàn chế tạo' }],
      rewards: [['canvas_bag', 1], ['iron_coin', 1000]] },
    { id: 'warehouse_expansion', title: 'Mở rộng kho', titleEn: 'Warehouse Expansion', from: 'Drillmaster', after: 'learn_to_heal',
      text: 'Kho sắp hết chỗ rồi. Đến lúc mở rộng thôi. (Bản web: nâng cấp ngay ở Kho, cần 1000 xu sắt + 1 Thùng gỗ (S).)',
      obj: [{ kind: 'upgrade', what: 'warehouse', lv: 2, n: 1, label: 'Nâng Kho lên cấp 2' }],
      rewards: [['weightlifting_potion', 1], ['iron_coin', 1000]] },
    { id: 'rescue_archaeologist', title: 'Giải cứu Nhà khảo cổ', titleEn: 'Rescue Archaeologist', from: 'Drillmaster', after: 'craft_armor',
      text: 'Theo ta biết, Nhà khảo cổ đang ở đâu đó trên hòn đảo này. Gặp ông ấy thì nhớ đưa về. Có ông ấy, ta sẽ khám phá bí mật hòn đảo nhanh hơn nhiều.',
      obj: [{ kind: 'locked', n: 1, label: 'Giải cứu Nhà khảo cổ', why: 'Chưa có ở bản web' }],
      rewards: [['treasure_map', 1], ['iron_coin', 2000]] },
    { id: 'build_kitchen', title: 'Dựng bếp', titleEn: 'Build Kitchen', from: 'Drillmaster', after: 'rescue_archaeologist',
      text: 'Thức ăn là sống còn. Đừng ra ngoài với cái bụng rỗng! Dựng một cái bếp, gom đủ nguyên liệu là không lo đói.',
      obj: [{ kind: 'locked', n: 1, label: 'Mở Bếp cấp 1', why: 'Bếp chưa có ở bản web' }],
      rewards: [['energy_jelly', 2], ['wooden_crate_s', 1], ['iron_coin', 1000]] },
    { id: 'build_medical_station', title: 'Dựng trạm y tế', titleEn: 'Build Medical Station', from: 'Drillmaster', after: 'build_kitchen',
      text: 'Đi thám hiểm thì thế nào cũng bị thương, nên trạm y tế phải được ưu tiên.',
      obj: [{ kind: 'locked', n: 1, label: 'Mở Trạm y tế cấp 1', why: 'Trạm y tế chưa có ở bản web' }],
      rewards: [['wooden_crate_s', 1], ['iron_coin', 1000]] },
    { id: 'teleportation', title: 'Dịch chuyển', titleEn: 'Teleportation', from: 'Drillmaster', after: 'build_medical_station',
      text: 'Ta có thể làm thiết bị dịch chuyển nhờ sức bẻ cong không gian của Ma cà rồng. Các chuyến đi sau sẽ dễ hơn nhiều.',
      obj: [{ kind: 'locked', n: 1, label: 'Mở Máy dịch chuyển cấp 1', why: 'Chưa có ở bản web' }],
      rewards: [['wooden_crate_s', 1], ['iron_coin', 2400]] },
    { id: 'tide_zone_beacon', title: 'Đèn hiệu Vùng Thuỷ Triều', titleEn: 'Tide Zone Beacon', from: 'Drillmaster', after: 'teleportation',
      text: 'Máy dịch chuyển này sẽ giúp ích nhiều. Hãy đi mở đèn hiệu dịch chuyển ở Vùng Thuỷ Triều.',
      obj: [{ kind: 'locked', n: 1, label: 'Mở đèn hiệu Vùng Thuỷ Triều', why: 'Vùng Thuỷ Triều chưa mở' }],
      rewards: [['omni_potion', 1], ['iron_coin', 3000]] }
  ];

  const Q = SS.quests = { defs: DEFS };
  function st() {
    const S = inv.state;
    if (!S.quests) S.quests = { prog: {}, done: [] };
    return S.quests;
  }
  const byId = id => DEFS.find(d => d.id === id);
  Q.isDone = id => st().done.indexOf(id) >= 0;
  Q.available = d => !Q.isDone(d.id) && (!d.after || Q.isDone(d.after));
  Q.accepted = () => DEFS.filter(Q.available);
  Q.finished = () => st().done.map(byId).filter(Boolean);
  Q.progress = function (id, i) { const p = st().prog[id]; return (p && p[i]) || 0; };
  Q.objDone = (d, i) => Q.progress(d.id, i) >= d.obj[i].n;
  Q.complete = d => d.obj.every((o, i) => Q.objDone(d, i));
  Q.locked = d => d.obj.some(o => o.kind === 'locked');

  function bump(match, k) {
    let any = false;
    for (const d of Q.accepted()) {
      d.obj.forEach((o, i) => {
        if (!match(o) || Q.objDone(d, i)) return;
        const p = st().prog[d.id] = st().prog[d.id] || [];
        p[i] = Math.min(o.n, (p[i] || 0) + (k || 1));
        any = true;
        if (Q.objDone(d, i) && Q.complete(d)) Q.notify(d);
      });
    }
    if (any) inv.save();
  }
  Q.notify = function (d) {
    const G = SK.G;
    if (G && G.toast) G.toast('Nhiệm vụ xong: ' + d.title + ' — mở bảng Nhiệm vụ để nhận thưởng', 3);
    SK.emit('seasonQuestDone', G, d.id);
  };

  // Trả thưởng: xu vào ví, đồ vào balô, balô đầy thì vào kho.
  Q.claim = function (id) {
    const d = byId(id);
    if (!d || !Q.available(d) || !Q.complete(d)) return 'Chưa hoàn thành';
    for (const [rid, n] of d.rewards) {
      let left = inv.add(rid, n);
      if (left) left = inv.addTo('warehouse', rid, left);
    }
    st().done.push(id);
    delete st().prog[id];
    inv.save();
    SK.emit('seasonQuestClaim', SK.G, id);
    return null;
  };
  Q.claimAll = () => Q.accepted().filter(Q.complete).map(d => (Q.claim(d.id), d.id));

  SK.on('seasonKill', () => bump(o => o.kind === 'kill'));
  SK.on('seasonExtract', () => bump(o => o.kind === 'extract'));
  SK.on('seasonUse', (G, id) => bump(o => o.kind === 'use' && o.id === id));
  SK.on('seasonUpgrade', (G, what, lv) => bump(o => o.kind === 'upgrade' && o.what === what && lv >= o.lv, 1));
})();
