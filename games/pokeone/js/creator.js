/*
 * Cảnh 'creator': tạo nhân vật trên 'Panel - Customization' gốc (CustomizationHandler: Hair Style, Hair Colour,
 * Skin Tone, Eyes, Boy/Girl, xoay, Accept). Bản gốc không có áo, mũ, tên, vùng ở panel này (áo/mũ mua ở Costume Shop,
 * tên là tên tài khoản): thêm bốn hàng cùng kiểu, cửa sổ cao thêm 180 đơn vị. Nền là đảo màn đăng nhập.
 *
 * Kết quả ghi vào P1.state.player = { name, gender, look: { body, clothe, hair, hairColor, hat } } và P1.state.region.
 */
(function (P1) {
  'use strict';

  const BG = 'Sprite - Window/Background/';
  const FACINGS = [2, 1, 0, 3];                 // hàng sprite: 2 mặt, 1 trái, 0 lưng, 3 phải (README-2d.md)
  const WALK = [1, 0, 1, 2];                    // cột: 1 đứng, 0 và 2 hai bước chân
  const EXTRA = 180;                            // cửa sổ gốc 446x250, nền 430x204

  let host = null, v = null, name = null, onKey = null;
  let sel = null, anim = { t: 0, face: 0, hold: 0, frame: 0 };

  const pad2 = i => String(i).padStart(2, '0');
  const n = p => v.ui.need(p);

  function parts() { return P1.look.parts(sel.gender); }
  // Mỗi hàng: nhãn, số lựa chọn, đọc/ghi chỉ số, chữ hiện trong ô số (Label - Amount).
  const ROWS = {
    'Select - Hair': { count: () => parts().hair.length, key: 'hair' },
    'Select - Hair Colour': { count: () => P1.look.HAIR_COLOURS.length, key: 'hairColor' },
    'Select - Skin': { count: () => 4, key: 'skin' },
    'Select - Eyes': { count: () => 5, key: 'eyes' },
    'Select - Clothes': { count: () => parts().clothe.length, key: 'clothe' },
    'Select - Hat': { count: () => parts().hat.length + 1, key: 'hat', show: i => i ? String(i) : 'None' },
  };

  function player() {
    const p = parts();
    return {
      name: name ? name.value.trim() : '',
      gender: sel.gender,
      look: {
        body: pad2(sel.skin) + '_' + pad2(sel.eyes),   // thân = <màu da 00-03>_<màu mắt 00-04> (so bằng mắt, README-shell.md)
        clothe: p.clothe[sel.clothe] || '00',
        hair: p.hair[sel.hair] || '00',
        hairColor: sel.hairColor,
        hat: sel.hat ? p.hat[sel.hat - 1] : '',
      },
    };
  }

  function paint() {
    const pl = player(), face = FACINGS[anim.face], col = WALK[anim.frame];
    P1.ui.paintPlayer(v, [BG + 'Character/Body', BG + 'Character/Body/Clothes', BG + 'Character/Body/Hair', BG + 'Character/Body/Hat'], pl, face, col);
    ['Body', 'Body/Clothes', 'Body/Hair', 'Body/Hat'].forEach(p => v.ui.draw(n(BG + 'Character/' + p)));
  }

  function refresh() {
    Object.keys(ROWS).forEach(r => {
      const R = ROWS[r], val = sel[R.key];
      n(BG + r + '/Label - Amount').w.text = R.show ? R.show(val) : String(val);
    });
    ['Button - Male', 'Button - Female'].forEach(p => {
      const b = n(BG + p), on = (p === 'Button - Male') === (sel.gender === 'male');
      b.w.sprite = on ? 'btn_Option_Click' : 'btn_Option_Normal';
      if (b.normal) b.normal.sprite = b.w.sprite;
      b.drawn = null;
    });
    v.refresh();
    paint();
  }

  function step(row, d) {
    const R = ROWS[row], c = R.count();
    sel[R.key] = (sel[R.key] + d + c) % c;
    refresh();
  }

  function layout() {
    // Cửa sổ cao thêm EXTRA: nền giãn, con của nền dời lên EXTRA/2 để hàng gốc giữ khoảng cách với mép trên.
    const win = n('Sprite - Window'), bg = n('Sprite - Window/Background');
    win.w.size = [win.w.size[0], win.w.size[1] + EXTRA];
    bg.w.size = [bg.w.size[0], bg.w.size[1] + EXTRA];
    bg.kids.forEach(k => { k.pos[1] += EXTRA / 2; });
    const add = (src, as, y) => { const r = v.add(BG.slice(0, -1), 'Panel - Customization/' + BG + src, as); r.pos = [r.pos[0], y]; return r; };
    add('Select - Eyes', 'Select - Clothes', 21).w.text = 'Clothes';
    add('Select - Eyes', 'Select - Hat', -15).w.text = 'Hat';
    // Nam/Nữ dời sang cột phải dưới hình xem trước, Accept xuống đáy.
    n(BG + 'Button - Male').pos = [121, 26];
    n(BG + 'Button - Female').pos = [157, 26];
    n(BG + 'Button - Accept').pos = [139, -160];
    // Mũ: panel gốc chỉ có Body/Clothes/Hair; thêm lớp Hat (bản sao lớp Hair, depth 8) như GUICharacter ở HUD.
    const hat = v.add(BG + 'Character/Body', 'Panel - Customization/' + BG + 'Character/Body/Hair', 'Hat');
    hat.w.depth = 8;
    // Tên: ô nhập của màn đăng nhập (title:Panel - Login/.../Input - Username), cùng khung Bg_Window_InnerSection.
    const lab = add('Select - Eyes', 'Select - Name', -57);
    lab.w.text = 'Name';
    lab.kids.forEach(k => { k.active = false; });
    const key = P1.ui.borrow('title:Panel - Login', 'Sprite - Window/Input - Username', 'shell:Input - Name');
    const inp = v.add(BG.slice(0, -1), key, 'Input - Name');
    inp.pos = [58, -57];
    inp.w.size = [300, 32];
    // Vùng: Kanto chọn sẵn, Johto tắt (bản gốc cho chọn cả hai lúc bắt đầu, RESEARCH.md §1).
    const reg = add('Select - Eyes', 'Select - Region', -99);
    reg.w.text = 'Region';
    reg.kids.forEach(k => { k.active = false; });
    const kanto = add('Button - Accept', 'Button - Kanto', -99);
    kanto.pos[0] = -12;
    const johto = add('Button - Accept', 'Button - Johto', -99);
    johto.pos[0] = 124;
    const soon = add('Select - Eyes', 'Label - Johto Soon', -124);
    soon.kids.forEach(k => { k.active = false; });
    soon.pos[0] = 70;
    soon.w.text = 'Johto: coming later';
    soon.w.color = '#a1a1a1ff';
    soon.w.size = [150, 20];
    soon.w.fontSize = 16;
    v.refresh();
    n(BG + 'Button - Kanto/UILabel').w.text = 'Kanto';
    n(BG + 'Button - Johto/UILabel').w.text = 'Johto';
    v.ui.enable(BG + 'Button - Johto', false);
    n(BG + 'Button - Kanto').w.sprite = 'btn_Confirm_Click';
  }

  function accept() {
    const pl = player();
    if (!pl.name) {
      P1.ui.message({ title: 'Character Customization', text: 'Please enter a name for your trainer.', yes: 'Okay' })
        .then(() => name.el.focus());
      return;
    }
    const st = P1.state || P1.newGame();
    st.player = pl;
    st.region = 'kanto';
    P1.scene.go('world', { intro: true });
  }

  P1.scene.add('creator', {
    enter() {
      if (!P1.state) P1.newGame();
      P1.titleBackdrop.start();
      P1.audio.music('title');
      const cur = P1.state.player || {};
      const L = cur.look || {};
      sel = { gender: cur.gender === 'female' ? 'female' : 'male', hair: 1, hairColor: 26, skin: 0, eyes: 0, clothe: 0, hat: 0 };
      const body = /^(\d\d)_(\d\d)$/.exec(L.body || '');
      if (body) { sel.skin = +body[1]; sel.eyes = +body[2]; }
      if (L.hairColor != null) sel.hairColor = L.hairColor;
      host = document.createElement('div');
      host.className = 'p1-scene';
      document.getElementById('ui').appendChild(host);
      v = P1.ngui.build('Panel - Customization', host);
      layout();
      name = P1.ui.textInput(v, BG + 'Input - Name', { placeholder: 'Trainer name..', value: '', onEnter: accept });
      Object.keys(ROWS).forEach(r => {
        P1.ui.pressAndHold(n(BG + r + '/Button - Add'), () => step(r, 1));
        P1.ui.pressAndHold(n(BG + r + '/Button - Take'), () => step(r, -1));
      });
      P1.ui.onEl(n(BG + 'Button - Male'), () => { sel.gender = 'male'; refresh(); });
      P1.ui.onEl(n(BG + 'Button - Female'), () => { sel.gender = 'female'; refresh(); });
      // RotateLeft/RotateRight gốc: xoay hình xem trước; tự xoay dừng 4 giây sau mỗi lần bấm.
      const rot = d => { anim.face = (anim.face + d + 4) % 4; anim.hold = 4; paint(); };
      P1.ui.onEl(n(BG + 'Button - Rotate'), () => rot(1));
      P1.ui.onEl(n(BG + 'Button - Rotate (1)'), () => rot(-1));
      P1.ui.onEl(n(BG + 'Button - Accept'), accept);
      anim = { t: 0, face: 0, hold: 0, frame: 0, ft: 0 };
      refresh();
      onKey = ev => { if (ev.code === 'Enter' && ev.target.tagName !== 'INPUT' && !P1.ui.isOpen()) accept(); };
      window.addEventListener('keydown', onKey);
    },
    update() {
      if (!v) return;
      // Đồng hồ thật thay cho dt (dt bị kẹp 0,05 s nên máy chậm sẽ xoay chậm theo).
      const now = performance.now() / 1000, dt = Math.min(0.5, now - (anim.last || now));
      anim.last = now;
      anim.ft += dt;
      let dirty = false;
      if (anim.ft >= 1 / 6) { anim.ft = 0; anim.frame = (anim.frame + 1) % WALK.length; dirty = true; }
      if (anim.hold > 0) anim.hold -= dt;
      else {
        anim.t += dt;
        if (anim.t >= 2) { anim.t = 0; anim.face = (anim.face + 1) % 4; dirty = true; }
      }
      if (dirty) paint();
    },
    exit() {
      if (onKey) window.removeEventListener('keydown', onKey);
      onKey = null;
      P1.ui.closeAll();
      if (name) name.destroy();
      if (v) v.destroy();
      if (host) host.remove();
      v = host = name = null;
      P1.titleBackdrop.stop();
    },
    render(dt) { P1.titleBackdrop.render(dt); },
    get view() { return v; },
    get selection() { return sel && player(); },
  });
})(window.P1 = window.P1 || {});
