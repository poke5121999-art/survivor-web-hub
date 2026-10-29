// SettingsPopup (prefab Assets/Prefabs/UI/Settings/SettingsPopup.prefab, bundle ui_popups_settingspopup, address
// UI/Popups/SettingsPopup [asm 0x116c72c]), opened by the home page's gear (HomePage.OnSettingsButtonClicked [asm 0x1168298]).
// Loaded on the first click with its sheet art/m-settings.webp (tools/build_menus.py 'settings').
// Layout in reference units (uikit.js U): PopupHolder 510 wide at (0, -60), VerticalLayoutGroup pad top 60 / bottom 35,
// spacing 15; OptionLayoutGroup pad 20 / 20 / bottom 15, spacing 35; rows 470 x 70. Details: D:/stickman-hook-ref/FTUE.md 3.
// Rows the Android build hides stay out: Restore Purchases (SetActive(false) on every Activate [asm 0x116cc3c..0x116cc74]),
// Haptic Feedback and Language (inactive in the prefab). Delete Account is the web's [ĐỀ XUẤT] (FTUE.md 4.2).
import { sheet, kitStyle, cut, fit, slice, label, U, popOpen, popClose } from './uikit.js';
import { writeSave, wipeSave } from './save.js';

const CSS = `
#settings { background: none; }
#settings .sp, #settings .dlg { position: absolute; left: 50%; top: 50%; width: ${U(510)}; transform: translate(-50%, calc(-50% + ${U(60)}));
  display: flex; flex-direction: column; align-items: center; gap: ${U(15)}; padding: ${U(60)} 0 ${U(35)}; box-sizing: border-box; }
#settings .bgs, #settings .bgo, #settings .bg { position: absolute; inset: 0; }
#settings .bgs { bottom: ${U(-22)}; background: #0a1940; }
#settings .bgo { inset: ${U(-3)}; background: #fff; }
#settings .bg { background: #1a4a93; }
#settings .ic { position: absolute; left: 0; top: ${U(-245)}; width: ${U(510)}; height: ${U(350)}; pointer-events: none; }
#settings .ic .gl { position: absolute; inset: 0; background: rgba(73, 121, 255, .396); }
#settings .ic .im { position: absolute; left: 0; right: 0; top: 20%; bottom: 15%; }
#settings .tt, #settings .ver, #settings .opts { position: relative; }
#settings .ver { display: flex; flex-direction: column; align-items: center; }
#settings .ver small { font: 700 ${U(18)}/1.2 system-ui, sans-serif; color: #9fb8e6; }
#settings .opts { display: flex; flex-direction: column; gap: ${U(35)}; padding: 0 ${U(20)} ${U(15)}; }
#settings button { border: 0; padding: 0; background: none; cursor: pointer; font: inherit; color: #fff; }
#settings .row { position: relative; width: ${U(470)}; height: ${U(70)}; display: flex; align-items: center; gap: ${U(20)};
  padding: ${U(10)} ${U(65)} ${U(10)} ${U(10)}; box-sizing: border-box; text-align: left; }
#settings .row:active { transform: scale(.97); }
#settings .row .bo { position: absolute; left: ${U(-5)}; right: ${U(-5)}; top: ${U(-5.5)}; bottom: ${U(-9.5)}; background: #000; }
#settings .row .bb { position: absolute; inset: 0; background: #315a9c; }
#settings .row.del .bb { background: #c0392b; }
#settings .row .ico { position: relative; flex: none; width: ${U(50)}; height: ${U(50)}; }
#settings .row .ico i { position: absolute; background: #527cc3; -webkit-mask: var(--m) center / contain no-repeat; mask: var(--m) center / contain no-repeat; }
#settings .row .tx { position: relative; }
#settings .row .chk { position: absolute; right: ${U(10)}; top: 0; width: ${U(45)}; height: 100%; } /* 45 x 70 (anchors y 0..1), preserveAspect 1 */
#settings .uid { position: relative; width: ${U(470)}; display: flex; align-items: center; justify-content: space-between; }
#settings .uid > div { display: flex; flex-direction: column; align-items: flex-start; gap: ${U(4)}; }
#settings .uid b { font: 900 ${U(22.6)}/1.2 system-ui, sans-serif; letter-spacing: .04em; -webkit-text-stroke: ${U(3)} #1a1c4b; paint-order: stroke fill; }
#settings .copy { width: ${U(90)}; height: ${U(90)}; flex: none; }
#settings .cl { position: absolute; left: 0; right: 0; bottom: ${U(-84)}; height: ${U(120)}; }
#settings .dlg { gap: ${U(30)}; padding: ${U(50)} ${U(30)} ${U(45)}; }
#settings .dlg p { position: relative; margin: 0; font: 700 ${U(30)}/1.35 system-ui, sans-serif; text-align: center; }
#settings .dlg .bts { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: ${U(20)}; }
#settings .dlg .bts button { position: relative; min-width: ${U(170)}; height: ${U(84)}; padding: 0 ${U(22)}; display: grid; place-items: center; }
#settings .dlg .bts button > i { position: absolute; inset: 0; }
#settings .dlg .bts button > :last-child { position: relative; }
#settings .dlg .bts .red > i { filter: hue-rotate(-118deg) saturate(1.4); }
#settings .dlg .bts button:disabled { opacity: .55; cursor: default; }
#settings .shade { position: absolute; inset: 0; background: rgba(0, 0, 0, .7843); }
`;

// UserIdText = MadLogin.GetAuthID() [asm 0x116cd90]: here a local id of 5 groups of 4 hex digits, made once per save
function userId(app) {
  const s = app.save;
  if (!s.uid) {
    s.uid = [...crypto.getRandomValues(new Uint16Array(5))].map((n) => n.toString(16).toUpperCase().padStart(4, '0')).join('-');
    writeSave(s);
  }
  return s.uid;
}

// Hub sign-in (js/session.js of the hub, key hub.session.v1): a member session counts as logged in
function hubMember() {
  try { return JSON.parse(localStorage.getItem('hub.session.v1'))?.kind === 'member'; } catch { return false; }
}

function rev(app) { return app.V.replace('?v=', ''); }

function row(app, sh, k, icon, text, trim) {
  const b = document.createElement('button');
  b.className = 'row' + (k === 'del' ? ' del' : '');
  b.dataset.k = k;
  b.innerHTML = '<i class="bo"></i><i class="bb"></i><span class="ico"><i></i></span><span class="tx"></span>';
  const ic = b.querySelector('.ico i');
  if (k === 'del') { ic.style.cssText = 'inset:0;background:none'; fit(ic, sh, icon); } // close_circle as it is, not tinted
  else {
    // Image preserveAspect, colour #527CC3 over a white sprite: a mask in that colour. `trim`: [left, top, width, height] of the
    // trimmed sprite inside the 50 x 50 box (dump/ftue/sprites.json), else the whole box
    const [l, t, w, h] = trim || [0, 0, 50, 50];
    Object.assign(ic.style, { left: U(l), top: U(t), width: U(w), height: U(h) });
    ic.style.setProperty('--m', `url(${cut(sh, icon)})`);
  }
  b.querySelector('.tx').appendChild(label(app, text, 36));
  return b;
}

// A small popup in the SettingsPopup's frame (shadow, white outline, #1A4A93): title, text, buttons [{text, red, wait, go}].
// `wait`: seconds before the button works, counted down on it.
function dialog(app, sh, root, title, text, buttons) {
  const shade = document.createElement('div');
  shade.className = 'shade';
  const d = document.createElement('div');
  d.className = 'dlg';
  d.innerHTML = '<i class="bgs"></i><i class="bgo"></i><i class="bg"></i><div class="tt"></div><p></p><div class="bts"></div>';
  d.querySelector('.tt').appendChild(label(app, title, 60));
  d.querySelector('p').textContent = text;
  const close = () => { shade.remove(); d.remove(); };
  for (const o of buttons) {
    const b = document.createElement('button');
    b.className = o.red ? 'red' : 'green';
    b.dataset.k = o.k;
    const sk = slice(document.createElement('i'), sh, 'OutlinedButtonGreen', 0.6);
    const put = (t) => { b.replaceChildren(sk, label(app, t, 30)); };
    put(o.text);
    if (o.wait) {
      b.disabled = true;
      let n = o.wait;
      put(`${o.text} (${n})`);
      const tick = setInterval(() => {
        if (!d.isConnected) { clearInterval(tick); return; }
        if (--n > 0) { put(`${o.text} (${n})`); return; }
        clearInterval(tick);
        put(o.text);
        b.disabled = false;
      }, 1000);
    }
    b.onclick = () => { app.play('button'); close(); o.go?.(); };
    d.querySelector('.bts').appendChild(b);
  }
  root.append(shade, d);
  app.play('popup_in');
  return d;
}

let styled = false;
export async function openSettings(app) {
  kitStyle();
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const sh = await sheet(app, 'settings');
  let root = document.getElementById('settings');
  if (!root) {
    root = document.createElement('div');
    root.id = 'settings';
    document.body.appendChild(root);
  }
  root.className = 'ui overlay';
  root.innerHTML = `<div class="sp"><i class="bgs"></i><i class="bgo"></i><i class="bg"></i><div class="ic"><i class="gl"></i><i class="im"></i></div>
    <div class="tt"></div><div class="ver"></div><div class="opts"></div><button class="cl" title="Đóng"></button></div>`;
  const sp = root.querySelector('.sp');
  const gl = root.querySelector('.gl');
  gl.style.cssText += `-webkit-mask:url(${cut(sh, 'Glow')}) center/100% 100% no-repeat;mask:url(${cut(sh, 'Glow')}) center/100% 100% no-repeat`;
  fit(root.querySelector('.im'), sh, 'popup_settings_icon');
  root.querySelector('.tt').appendChild(label(app, 'Settings', 90));
  // VersionText: string.Format("Version: {0} ({1})", GetVersion(), GetBuildNumber()) [asm 0x116c9a4..0x116caa0]
  const ver = root.querySelector('.ver');
  ver.appendChild(label(app, 'Version: 9.9.60 (9003907)', 25));
  const small = document.createElement('small');
  small.textContent = 'web rev ' + rev(app);
  ver.appendChild(small);

  const opts = root.querySelector('.opts');
  // GameCenterHolder: Checked = MadLogin.IsLoggedThirdParty("GooglePlay"), click = LoginThirdParty [asm 0x116cb44..0x116cbe0,
  // 0x116c244]. [ĐỀ XUẤT] the hub account instead: ticked when signed in to the hub, else the click opens the hub login.
  const hub = row(app, sh, 'hub', 'globe', 'Tài khoản hub');
  const on = hubMember();
  const chk = document.createElement('i');
  chk.className = 'chk';
  hub.appendChild(fit(chk, sh, on ? 'checkmark' : 'notification'));
  hub.onclick = () => { app.play('button'); if (on) app.toast('Đã đăng nhập hub'); else location.href = '../../login.html'; };
  // GDPRHolder: GDPRManager.ShowPopUp("settings") [asm 0x116c2cc], the Usercentrics CMP (online). [ĐỀ XUẤT] what this page keeps.
  const gdpr = row(app, sh, 'gdpr', 'gdpr', 'GDPR', [2.9, 0, 43.5, 50]);
  gdpr.onclick = () => dialog(app, sh, root, 'Quyền riêng tư',
    'Tiến độ chỉ lưu trên trình duyệt này (localStorage). Không có quảng cáo hay theo dõi.', [{ k: 'ok', text: 'OK' }]);
  // SupportHolder: OnHelpClicked [asm 0x116d260] opens a support mail with the version and ids. [ĐỀ XUẤT] the hub's feedback page.
  const help = row(app, sh, 'help', 'chat', 'Help', [8.6, 8.2, 32.8, 33.6]);
  help.onclick = () => {
    app.play('button');
    window.open(`../../feedback.html?game=stickman-hook&uid=${encodeURIComponent(userId(app))}&v=${rev(app)}`, '_blank', 'noopener');
  };
  // [ĐỀ XUẤT] Delete Account (FTUE.md 4.2): the flow of DataCacheDebug.DeleteCurrentAccountAndRestart [asm 0x2e6a214..0x2e6a4a8]
  // behind two confirmations: wipe the progress, keep the sound setting, restart (GameRestart: back to the home page, so the
  // first-run tutorial shows again).
  const del = row(app, sh, 'del', 'close_circle', 'Delete Account');
  del.onclick = () => dialog(app, sh, root, 'Xoá tài khoản?',
    'Toàn bộ tiến độ trên trình duyệt này (màn đã qua, xu, XP, skin, thẻ, chế độ) sẽ bị xoá và không lấy lại được.', [
      { k: 'no', text: 'Huỷ' },
      { k: 'ok', text: 'Xoá', red: true, go: () => dialog(app, sh, root, 'Chắc chắn chứ?', 'Không thể hoàn tác.', [
        { k: 'no', text: 'Huỷ' },
        { k: 'ok', text: 'Xoá vĩnh viễn', red: true, wait: 2, go: () => {
          wipeSave(app.save);
          location.replace(location.pathname + app.V); // without ?level= / ?mode=: the restart opens the home page
        } }]) }]);
  // UserId: "User Id:" (36) over the id (22.6), CopyUserId: GUIUtility.systemCopyBuffer = GetAuthID() [asm 0x116c5a0..0x116c5d0]
  const uid = document.createElement('div');
  uid.className = 'uid';
  uid.innerHTML = '<div></div><button class="copy" data-k="copy" title="Chép"></button>';
  uid.firstChild.appendChild(label(app, 'User Id:', 36));
  const idText = document.createElement('b');
  idText.id = 'userId';
  idText.textContent = userId(app);
  uid.firstChild.appendChild(idText);
  fit(uid.querySelector('.copy'), sh, 'copy_button');
  uid.querySelector('.copy').onclick = async () => {
    app.play('button');
    const id = userId(app);
    let ok = false;
    try { await navigator.clipboard.writeText(id); ok = true; } catch {
      const t = document.createElement('textarea');
      t.value = id;
      document.body.appendChild(t);
      t.select();
      try { ok = document.execCommand('copy'); } catch { /* no clipboard */ }
      t.remove();
    }
    app.toast(ok ? 'Đã chép' : 'User Id: ' + id);
  };
  opts.append(hub, gdpr, help, del, uid);
  // CloseButton: APopupView.Close(); the backdrop has no listener (a tap on it does nothing)
  const cl = root.querySelector('.cl');
  fit(cl, sh, 'close_circle');
  cl.onclick = async () => { app.play('popup_out'); await popClose(root, 'instant'); app.overlay('settings', false); app.hud(); };
  sp.onclick = (e) => e.stopPropagation();
  app.overlay('settings', true);
  popOpen(root, 'instant'); // SettingsPopup: MadTween, empty sequences
}
